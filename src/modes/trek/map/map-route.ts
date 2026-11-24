/**
 * El vuelo sobre el mapa (elegido por el usuario: «Vuelo por el mundo», con los mapas 3D de Google a través de Cesium ion): los
 * mismos mandos que el vuelo de la Travesía (el planeador de fly.ts), pero sobre una ciudad de verdad. Escorarte ya no te
 * aparta: te hace virar, como un ave al inclinarse; la altura de vuelo sale de la del planeador, a escala de ciudad (de unos
 * 20 a 220 m sobre el suelo); y la velocidad, de la marcha de la Travesía (tus flexiones o el avance solo), también a escala.
 * Una ruta de aros grandes pasa por los monumentos de cada ciudad; al acabarla, vuelta a empezar.
 *
 * Lógica pura, sin IWSDK (se prueba en tests/unit/map-route.test.ts); lo pinta src/modes/trek/map/map-system.ts. Las
 * coordenadas, en metros alrededor del centro de la ciudad: x hacia el este y z hacia el sur (−z, el norte), como deja el mapa
 * el ReorientationPlugin de 3d-tiles-renderer (arriba, +y).
 */

/** Un monumento de la ruta: su nombre y dónde está (grados). */
export interface Landmark {
  name: string;
  lat: number;
  lon: number;
}

/** Una ciudad: su nombre, su centro (donde se centra el mapa) y su ruta de aros, en orden. */
export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  route: Landmark[];
}

export const CITIES: readonly City[] = [
  {
    id: 'madrid',
    name: 'Madrid',
    lat: 40.4169,
    lon: -3.7035,
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

/** De grados a metros alrededor del centro de la ciudad (aproximado, de sobra para unos kilómetros): x, este; z, sur. */
export function toLocal(c: { lat: number; lon: number }, lat: number, lon: number, out: { x: number; z: number }): { x: number; z: number } {
  const R = 6371000, k = Math.PI / 180;
  out.x = (lon - c.lon) * k * R * Math.cos(c.lat * k);
  out.z = -(lat - c.lat) * k * R;
  return out;
}

/**
 * Los números del vuelo sobre el mapa: lo más que vira (rad/s, con la escora entera), la altura sobre el suelo con el planeador
 * a su altura de salida y lo que sube por cada metro del planeador (m), la más baja, lo que multiplica la marcha (la de la
 * Travesía, en m/s) y su tope (m/s), lo que mide un aro (m de radio), lo que se perdona al cruzarlo (m), a qué altura flota
 * sobre el suelo (m), de dónde empiezas (m antes del primero) y desde cuánto se da por pasado (m de más tras acercarse).
 */
export const MAP = { turn: 0.45, alt0: 110, altK: 22, altMin: 25, speedK: 20, speedMax: 45, ringR: 22, slack: 10, ringAgl: 100, startBack: 450, missBack: 60 } as const;

/** Lo que manda el cuerpo (del planeador de la Travesía) en cada fotograma. */
export interface MapIn {
  /** El lado del planeador (m, + derecha) y su tope. */
  u: number;
  uMax: number;
  /** La altura del planeador (m) y la de salida. */
  alt: number;
  alt0: number;
  /** La marcha de la Travesía (m/s). */
  v: number;
}

export class MapFlight {
  /** Dónde vas (m: x este, z sur), hacia dónde (rad: 0 hacia el norte, −z; + a la izquierda) y a qué altura sobre el suelo (m). */
  x = 0;
  z = 0;
  heading = 0;
  agl: number = MAP.alt0;
  speed = 0;
  /** El aro que viene (su número en la ruta), los aros pasados y fallados, y lo más cerca que has estado del que viene (m). */
  next = 0;
  got = 0;
  missed = 0;
  private best = Infinity;
  readonly rings: { x: number; z: number }[] = [];
  /** Hacia dónde queda el aro que viene (lo rellena `toNext`, sin crear nada en cada fotograma). */
  readonly toward = { bearing: 0, dist: 0 };

  constructor(readonly city: City) {
    for (const l of city.route) {
      const p = toLocal(city, l.lat, l.lon, { x: 0, z: 0 });
      this.rings.push(p);
    }
    this.restart();
  }

  /** Al principio de la ruta: un poco antes del primer aro, mirando hacia él. */
  restart(): void {
    const a = this.rings[0], b = this.rings[1 % this.rings.length];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    this.x = a.x - (dx / L) * MAP.startBack;
    this.z = a.z - (dz / L) * MAP.startBack;
    this.heading = headingTo(this.x, this.z, a.x, a.z);
    this.next = 0;
    this.best = Infinity;
  }

  /** Lo que vira, la altura y la velocidad, de lo que manda el cuerpo. */
  step(dt: number, I: MapIn): void {
    const turn = MAP.turn * Math.max(-1, Math.min(1, I.u / Math.max(0.1, I.uMax)));
    this.heading -= turn * dt; // (escorado a la derecha, viras a la derecha)
    this.agl = Math.max(MAP.altMin, MAP.alt0 + (I.alt - I.alt0) * MAP.altK);
    this.speed = Math.min(MAP.speedMax, Math.max(0, I.v) * MAP.speedK);
    this.x += -Math.sin(this.heading) * this.speed * dt;
    this.z += -Math.cos(this.heading) * this.speed * dt;
  }

  /**
   * ¿Has pasado el aro que viene? Por dentro (cerca en planta y a su altura: `ringAgl` sobre su suelo, el que se sepa; aquí
   * se compara la altura sobre el suelo), 'pass'; si lo dejas atrás sin pasarlo, 'miss'; si no, ''. Pasado o fallado, el
   * siguiente (y, al acabar la ruta, vuelta a empezar por el primero).
   */
  judge(): '' | 'pass' | 'miss' {
    const r = this.rings[this.next], d = Math.hypot(r.x - this.x, r.z - this.z);
    let res: '' | 'pass' | 'miss' = '';
    if (d < MAP.ringR + MAP.slack && Math.abs(this.agl - MAP.ringAgl) < MAP.ringR + MAP.slack) res = 'pass';
    else if (this.best < 4 * MAP.ringR && d > this.best + MAP.missBack) res = 'miss';
    this.best = Math.min(this.best, d);
    if (res) {
      if (res === 'pass') this.got++;
      else this.missed++;
      this.next = (this.next + 1) % this.rings.length;
      this.best = Infinity;
    }
    return res;
  }

  /** Hacia dónde queda el aro que viene respecto a hacia dónde vas (rad: + a la izquierda) y a cuánto (m). */
  toNext(): { bearing: number; dist: number } {
    const r = this.rings[this.next], h = headingTo(this.x, this.z, r.x, r.z);
    this.toward.bearing = wrap(h - this.heading);
    this.toward.dist = Math.hypot(r.x - this.x, r.z - this.z);
    return this.toward;
  }
}

/** El rumbo de (x, z) a (tx, tz) (rad: 0 hacia −z, el norte; + hacia la izquierda, el oeste). */
export function headingTo(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
