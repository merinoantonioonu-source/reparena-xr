/**
 * El vuelo sobre el mapa (elegido por el usuario: «Vuelo por el mundo», con los mapas 3D de Google a través de Cesium ion): los
 * mismos mandos que el vuelo de la Travesía (el planeador de fly.ts), pero sobre una ciudad de verdad y **libre** (pedido del
 * usuario: «explorar con su cuerpo volando, sin límites»): sin tramos ni cofres, sin techo (hasta el espacio) y por todo el
 * mundo. Escorarte te ladea como a un ave y el ladeo te hace virar, con su inercia (entra y sale suave); la media flexión manda
 * lo que subes o bajas, más deprisa cuanto más alto vas; la marcha de la Travesía (tus flexiones, el avance solo, la cabeza
 * por delante de las manos) es el gas, y también corre más cuanto más alto. No se atraviesa nada: el suelo y los tejados te
 * sostienen, y ante una pared frenas. Una ruta de aros grandes pasa por encima de los monumentos de cada ciudad.
 *
 * Lógica pura, sin IWSDK (se prueba en tests/unit/map-route.test.ts); lo pinta src/modes/trek/map/map-system.ts. Las
 * coordenadas, en metros alrededor de un punto del mapa (el ancla: al principio, el centro de la ciudad): **x hacia el oeste
 * y z hacia el norte**, con +y arriba, como deja el mapa el ReorientationPlugin de 3d-tiles-renderer (comprobado con sus
 * números: al principio se pusieron al revés, este y sur, y los aros salían al otro lado de la ciudad, dentro de edificios).
 */

/** Un monumento de la ruta: su nombre y dónde está (grados). */
export interface Landmark {
  name: string;
  lat: number;
  lon: number;
}

/** Una ciudad: su nombre, su centro (donde se centra el mapa) y su ruta de aros, en orden (sin ruta: un lugar cualquiera
 * del mundo, vuelo libre sin aros). */
export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** El suelo del centro sobre el elipsoide del mapa (m, aproximado: su altitud y la del geoide); hasta medirlo con el mapa
   * cargado, para no empezar bajo tierra (Madrid está a unos 700 m). */
  h: number;
  route: Landmark[];
}

export const CITIES: readonly City[] = [
  {
    id: 'madrid',
    name: 'Madrid',
    lat: 40.4169,
    lon: -3.7035,
    h: 710,
    route: [
      { name: 'Puerta del Sol', lat: 40.4169, lon: -3.7035 },
      { name: 'Plaza Mayor', lat: 40.4155, lon: -3.7074 },
      { name: 'Palacio Real', lat: 40.418, lon: -3.7143 },
      { name: 'Templo de Debod', lat: 40.424, lon: -3.7178 },
      { name: 'Gran Vía', lat: 40.4203, lon: -3.7058 },
      { name: 'Cibeles', lat: 40.4193, lon: -3.6931 },
      { name: 'Puerta de Alcalá', lat: 40.42, lon: -3.6887 },
    ],
  },
  {
    id: 'paris',
    name: 'París',
    lat: 48.8606,
    lon: 2.3376,
    h: 80,
    route: [
      { name: 'Louvre', lat: 48.8606, lon: 2.3376 },
      { name: 'Notre-Dame', lat: 48.853, lon: 2.3499 },
      { name: 'Plaza de la Concordia', lat: 48.8656, lon: 2.3212 },
      { name: 'Arco del Triunfo', lat: 48.8738, lon: 2.295 },
      { name: 'Torre Eiffel', lat: 48.8584, lon: 2.2945 },
    ],
  },
  {
    id: 'nyc',
    name: 'Nueva York',
    lat: 40.758,
    lon: -73.9855,
    h: -15,
    route: [
      { name: 'Times Square', lat: 40.758, lon: -73.9855 },
      { name: 'Rockefeller Center', lat: 40.7587, lon: -73.9787 },
      { name: 'Central Park', lat: 40.7681, lon: -73.9819 },
      { name: 'Edificio Chrysler', lat: 40.7516, lon: -73.9755 },
      { name: 'Empire State', lat: 40.7484, lon: -73.9857 },
      { name: 'Flatiron', lat: 40.7411, lon: -73.9897 },
    ],
  },
  {
    id: 'rome',
    name: 'Roma',
    lat: 41.8946,
    lon: 12.4831,
    h: 70,
    route: [
      { name: 'Coliseo', lat: 41.8902, lon: 12.4922 },
      { name: 'Foro Romano', lat: 41.8925, lon: 12.4853 },
      { name: 'Altar de la Patria', lat: 41.8946, lon: 12.4831 },
      { name: 'Panteón', lat: 41.8986, lon: 12.4769 },
      { name: 'Plaza Navona', lat: 41.8992, lon: 12.4731 },
      { name: 'San Pedro', lat: 41.9022, lon: 12.4539 },
    ],
  },
];

export const cityOf = (id: string): City | null => CITIES.find((c) => c.id === id) ?? null;

const RE = 6371000, K = Math.PI / 180;

/** De grados a metros alrededor de un punto (aproximado, de sobra para unas decenas de kilómetros): x, oeste; z, norte. */
export function toLocal(c: { lat: number; lon: number }, lat: number, lon: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = -(lon - c.lon) * K * RE * Math.cos(c.lat * K);
  out.z = (lat - c.lat) * K * RE;
  return out;
}

/**
 * Los números del vuelo sobre el mapa.
 * - El viraje: lo que tarda el ladeo en seguir a lo que te escoras (s: la inercia), lo que vira con el ladeo entero (rad/s) y
 *   lo que se ladea el horizonte entonces (rad: unos 9°).
 * - La altura, con la flexión entera (pedido del usuario: estirar los brazos, subir; al suelo, el picado): lo alto que va la
 *   cabeza entre el suelo (`low`, m: el pecho abajo) y arriba de la plancha, de 0 a 1; por encima de `upFrom` subes (del todo
 *   en `upFull`), entre `downFrom` y `upFrom` vuelas recto (la media flexión) y por debajo bajas (del todo en `downFull`: el
 *   picado). Lo que subes y bajas con el mando entero (m/s), lo que tarda en cogerlo (s), a la que empiezas sobre el suelo
 *   (m), lo cerca que se puede pasar del suelo o de un tejado (m: el vuelo rasante), desde qué altura todo va más deprisa en
 *   proporción (m) y el techo (m: el espacio, bien lejos). «Arriba de la plancha» se afina solo (`topUp` s para subir a donde
 *   llegues, `topDown` m/s para bajar) dentro de `topSpan` m de la calibrada.
 * - La marcha, acumulativa (pedido del usuario): cada impulso adelante sube una marcha (`gearMax` como mucho) y se mantiene;
 *   echado adelante y aguantando, sube poco a poco (`hold` marchas/s); echado atrás, frena (`brake` marchas/s con el todo,
 *   desde `brakeFrom` m y del todo en `brakeFull` m). Cada marcha, `gear` m/s; lo que tarda en cogerla (s), lo que crece con la
 *   altura (exponente) y lo que añade el picado (× con el todo).
 * - Los aros: su radio (m), lo que se perdona (m), lo que su borde de abajo pasa por encima de lo más alto que haya debajo
 *   (m), su altura sobre el suelo sin medir (m) y de dónde empiezas (m antes del primero).
 * - Las paredes: lo que se mira por delante (s de vuelo y, como poco, m) y a cuánto te paras (m).
 * - El ancla: a cuánto del punto del mapa se vuelve a anclar (m: la Tierra es redonda).
 */
export const MAP = {
  bankTau: 0.7, turn: 0.5, roll: 0.16,
  low: 0.17, upFrom: 0.88, upFull: 0.97, downFrom: 0.62, downFull: 0.22, topUp: 0.6, topDown: 0.002, topSpan: 0.15,
  alt0: 260, floor: 7, climb: 18, sink: 45, vsTau: 0.7, scaleAlt: 260, altMax: 3e6,
  gear: 40, gear0: 1, gearMax: 8, hold: 0.6, brake: 1.4, brakeFrom: 0.07, brakeFull: 0.18, speedTau: 1.2, scalePow: 0.92, diveK: 0.6,
  ringR: 40, slack: 14, ringClear: 30, ringAgl: 150, startBack: 700,
  aheadT: 1.3, aheadMin: 30, stopAt: 10,
  reanchor: 25000,
} as const;

/** Lo que manda el cuerpo en cada fotograma. */
export interface MapIn {
  /** Si mandas (jugando y en plancha): si no, el vuelo se queda quieto en el aire. */
  live: boolean;
  /** Lo que te escoras (de −1 a 1, + derecha). */
  steer: number;
  /** La altura de la cabeza (m) y la de arriba de la plancha, calibrada (m). */
  head: number;
  ref: number;
  /** Lo que te has echado adelante (+) o atrás (−) respecto a como sueles estar (m) y si has dado un impulso adelante. */
  lean: number;
  kick: boolean;
  /** Con otro mando (el parapente de Barras: `para.ts`), lo que sube o baja (−1 a 1) y la marcha, ya decididos: entonces no
   * cuentan la flexión ni la cabeza adelante y atrás. */
  ctl?: { climb: number; gear: number } | null;
}

export class MapFlight {
  /** El ancla (grados): el punto del mapa en el origen. */
  readonly anchor = { lat: 0, lon: 0 };
  /** Dónde vas (m: x oeste, z norte), a qué altura (m, la del mapa: sobre su elipsoide), hacia dónde (rad: 0 hacia −z;
   * + a la izquierda), el ladeo (de −1 a 1, + a la derecha) y las velocidades (m/s: de avance y de subida). */
  x = 0;
  z = 0;
  alt = 0;
  heading = 0;
  bank = 0;
  speed = 0;
  vs = 0;
  /** La marcha (acumulativa: cada impulso, una más; se mantiene hasta que frenes), lo que subes (+) o bajas (−) con la
   * flexión (de −1 a 1), lo que picas (de 0 a 1) y arriba de la plancha, afinado (m; NaN: la calibrada). */
  gear: number = MAP.gear0;
  climb = 0;
  dive = 0;
  top = NaN;
  private nF = NaN;
  /** La altura sobre el suelo a la que empiezas (m) y si ya estás puesto sobre el suelo de verdad (al medirlo la primera vez). */
  startAgl: number = MAP.alt0;
  placed = false;
  /** Lo que hay debajo de ti (m, la altura de su superficie: la calle o el tejado; lo pone quien pinta el mapa) y lo libre
   * que queda por delante (m; Infinity: nada a la vista). */
  ground = 0;
  ahead = Infinity;
  /** Lo volado (m). */
  flown = 0;
  /** El aro que viene (su número en la ruta) y los pasados. */
  next = 0;
  got = 0;
  readonly rings: { x: number; z: number }[] = [];
  /** La altura del centro de cada aro (m; NaN: sin medir, la del suelo de la ciudad más `ringAgl`). */
  readonly ringY: number[] = [];
  /** Hacia dónde queda el aro que viene (lo rellena `toNext`, sin crear nada en cada fotograma). */
  readonly toward = { bearing: 0, dist: 0, dy: 0 };

  constructor(readonly city: City) {
    this.anchor.lat = city.lat;
    this.anchor.lon = city.lon;
    for (let i = 0; i < city.route.length; i++) {
      this.rings.push({ x: 0, z: 0 });
      this.ringY.push(NaN);
    }
    this.place();
    this.restart();
  }

  /** Los aros, respecto al ancla. */
  private place(): void {
    const R = this.city.route;
    for (let i = 0; i < R.length; i++) toLocal(this.anchor, R[i].lat, R[i].lon, this.rings[i]);
  }

  /** Al principio de la ruta: un poco antes del primer aro, mirando hacia él, a la altura de salida. */
  restart(): void {
    if (this.rings.length) {
      const a = this.rings[0], b = this.rings[1 % this.rings.length];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      this.x = a.x - (dx / L) * MAP.startBack;
      this.z = a.z - (dz / L) * MAP.startBack;
      this.heading = headingTo(this.x, this.z, a.x, a.z);
    } else {
      // (un lugar sin ruta: encima de él, mirando al norte)
      this.x = this.z = 0;
      this.heading = Math.PI;
    }
    this.placed = false;
    this.ground = this.city.h;
    this.alt = this.city.h + MAP.alt0;
    this.bank = this.speed = this.vs = this.flown = this.climb = this.dive = 0;
    this.gear = MAP.gear0;
    this.top = this.nF = NaN;
    this.ahead = Infinity;
    this.next = 0;
  }

  /** La altura sobre lo que tienes debajo (m). */
  get agl(): number {
    return this.alt - this.ground;
  }
  /** Cuánto más deprisa va todo por la altura (1 hasta `scaleAlt`; luego, en proporción). */
  get scale(): number {
    return Math.max(1, this.agl / MAP.scaleAlt);
  }
  /** Lo que hay debajo (m, medido en el mapa). La primera vez, te pone a tu altura de salida sobre ese suelo (el de verdad:
   * el de una ciudad se sabe más o menos; el de un lugar cualquiera, no). */
  setGround(g: number): void {
    this.ground = g;
    if (this.placed) return;
    this.placed = true;
    this.alt = g + this.startAgl;
    this.vs = 0;
  }

  /** Dónde estás (grados), en `out`. */
  where(out: { lat: number; lon: number }): { lat: number; lon: number } {
    out.lat = this.anchor.lat + this.z / RE / K;
    out.lon = this.anchor.lon - this.x / (RE * Math.cos(this.anchor.lat * K)) / K;
    return out;
  }

  /** La altura del centro del aro `i` (m). */
  ringAlt(i: number): number {
    const y = this.ringY[i];
    return Number.isNaN(y) ? this.city.h + MAP.ringAgl : y;
  }

  /** Lo que mandan la flexión (subir, recto, bajar, el picado) y la cabeza adelante y atrás (la marcha). */
  private pilot(dt: number, I: MapIn): void {
    const c01 = (v: number): number => Math.max(0, Math.min(1, v));
    // arriba de la plancha: la calibrada, afinada con lo que llegas de verdad (sube enseguida, baja muy despacio)
    if (Number.isNaN(this.top)) this.top = I.ref;
    const hi = Math.min(I.head, I.ref + MAP.topSpan);
    if (hi > this.top) this.top += (hi - this.top) * Math.min(1, dt / MAP.topUp);
    else this.top = Math.max(I.ref - MAP.topSpan, this.top - MAP.topDown * dt);
    // lo alto que vas en la flexión (0, el pecho en el suelo; 1, los brazos estirados), suavizado
    const n = (I.head - MAP.low) / Math.max(0.2, this.top - MAP.low);
    this.nF = Number.isNaN(this.nF) ? n : this.nF + (n - this.nF) * Math.min(1, dt / 0.12);
    const up = c01((this.nF - MAP.upFrom) / (MAP.upFull - MAP.upFrom)), down = c01((MAP.downFrom - this.nF) / (MAP.downFrom - MAP.downFull));
    this.climb = up > 0 ? up : -down;
    this.dive = c01((down - 0.6) / 0.4);
    // la marcha: cada impulso, una más; adelante y aguantando, sube poco a poco; atrás, frena; si no, se mantiene
    if (I.kick) this.gear += 1;
    else if (I.lean > MAP.brakeFrom) this.gear += MAP.hold * c01((I.lean - MAP.brakeFrom) / 0.1) * dt;
    else if (I.lean < -MAP.brakeFrom) this.gear -= MAP.brake * c01((-I.lean - MAP.brakeFrom) / (MAP.brakeFull - MAP.brakeFrom)) * dt;
    this.gear = Math.max(0, Math.min(MAP.gearMax, this.gear));
  }

  /** Un fotograma: el ladeo y el viraje, la altura y la marcha, con su inercia; el suelo sostiene y la pared frena. */
  step(dt: number, I: MapIn): void {
    if (dt <= 0) return;
    const c = (v: number): number => Math.max(-1, Math.min(1, v));
    if (I.live && I.ctl) {
      this.climb = c(I.ctl.climb);
      this.dive = 0;
      this.gear = Math.max(0, Math.min(MAP.gearMax, I.ctl.gear));
    } else if (I.live) this.pilot(dt, I);
    else this.climb = this.dive = 0;
    // el ladeo sigue a lo que te escoras, con su inercia: entra y sale del viraje suave (antes viraba en seco)
    this.bank += ((I.live ? c(I.steer) : 0) - this.bank) * (1 - Math.exp(-dt / MAP.bankTau));
    this.heading -= MAP.turn * this.bank * dt; // (ladeado a la derecha, viras a la derecha)
    const f = this.scale, cl = this.climb;
    this.vs += ((cl > 0 ? MAP.climb : MAP.sink) * cl * f - this.vs) * (1 - Math.exp(-dt / MAP.vsTau));
    this.alt = Math.min(MAP.altMax, this.alt + this.vs * dt);
    // el suelo (o el tejado) te sostiene: nunca más cerca que `floor`, y te sube suave si se te echa encima
    const low = this.ground + MAP.floor;
    if (this.alt < low) {
      this.alt += (low - this.alt) * Math.min(1, dt * 4);
      if (this.vs < 0) this.vs = 0;
    }
    // la marcha, con su inercia (y el picado la aviva); ante una pared, no más de lo que da tiempo a frenar (y a `stopAt`, parado)
    let want = I.live ? MAP.gear * this.gear * (1 + MAP.diveK * this.dive) * Math.pow(f, MAP.scalePow) : 0;
    const room = this.ahead - MAP.stopAt;
    if (room < want * MAP.aheadT) want = Math.max(0, room / MAP.aheadT);
    // (frenar, más vivo que acelerar; ante una pared, en seco)
    this.speed += (want - this.speed) * (1 - Math.exp(-dt / (want >= this.speed ? MAP.speedTau : room < this.speed * MAP.aheadT ? 0.25 : MAP.speedTau / 2)));
    if (room <= 0) this.speed = 0;
    const d = this.speed * dt;
    this.x += -Math.sin(this.heading) * d;
    this.z += -Math.cos(this.heading) * d;
    this.flown += d;
    if (Number.isFinite(this.ahead)) this.ahead -= d; // (hasta que se vuelva a mirar)
  }

  /** ¿Has pasado por el aro que viene? (Por dentro: cerca de su centro, también en altura.) Pasado, el siguiente (y, al
   * acabar la ruta, vuelta a empezar por el primero). No hay aros fallados: el que viene espera. */
  judge(): boolean {
    if (!this.rings.length) return false;
    const r = this.rings[this.next];
    if (Math.hypot(r.x - this.x, r.z - this.z, this.ringAlt(this.next) - this.alt) > MAP.ringR + MAP.slack) return false;
    this.got++;
    this.next = (this.next + 1) % this.rings.length;
    return true;
  }

  /** Hacia dónde queda el aro que viene respecto a hacia dónde vas (rad: + a la izquierda), a cuánto (m) y cuánto más alto (m). */
  toNext(): { bearing: number; dist: number; dy: number } {
    if (!this.rings.length) {
      this.toward.bearing = this.toward.dist = this.toward.dy = 0;
      return this.toward;
    }
    const r = this.rings[this.next], h = headingTo(this.x, this.z, r.x, r.z);
    this.toward.bearing = wrap(h - this.heading);
    this.toward.dist = Math.hypot(r.x - this.x, r.z - this.z);
    this.toward.dy = this.ringAlt(this.next) - this.alt;
    return this.toward;
  }

  /**
   * La Tierra es redonda: lejos del ancla, el mapa se curva hacia abajo. Pasados `reanchor` m, el ancla se pone debajo de ti
   * (true: quien pinta el mapa lo recoloca ahí): tú, al origen; la altura, la de verdad sobre ese punto; los aros, respecto a
   * él (sus alturas, por medir otra vez).
   */
  reanchor(): boolean {
    const d = Math.hypot(this.x, this.z);
    if (d < MAP.reanchor) return false;
    const lat = this.anchor.lat + this.z / RE / K;
    this.anchor.lon += -this.x / (RE * Math.cos(this.anchor.lat * K)) / K;
    this.anchor.lat = Math.max(-89, Math.min(89, lat));
    const up = Math.hypot(RE + this.alt, d) - RE - this.alt; // (lo que el mapa se había hundido bajo ti)
    this.alt += up;
    this.ground += up;
    this.x = this.z = 0;
    this.place();
    this.ringY.fill(NaN);
    this.ahead = Infinity;
    return true;
  }
}

/** El rumbo de (x, z) a (tx, tz) (rad: 0 hacia −z; + hacia la izquierda, −x). */
export function headingTo(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
