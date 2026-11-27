/**
 * El combate en el parapente (Barras, remo invertido; «Remo invertido: parapente» → «Islas en el cielo: combate»; pedido del
 * usuario: «una modalidad de lucha con dragones o enemigos volantes que hubiera que esquivar», con los mismos mandos que sobre
 * el mapa; elegidas todas las recomendaciones):
 *
 * - **Se vuela igual** (`ParaPilot`, para.ts): el remo sube, el explosivo acelera, tirar más de un brazo vira, aguantar arriba
 *   frena y los brazos estirados bajan. Aquí, sobre un mar de nubes con islas flotando por debajo (`SkyIsles`).
 * - **Cada remo es un disparo hacia donde miras**: al llegar arriba, un rayo al volador más cercano a tu mirada (sin tener que
 *   apuntar exacto: dentro de `SKY.cone`). **El explosivo**, el disparo fuerte (quita el doble). **Aguantar arriba carga**
 *   (×2, ×3, ×4, la del remo de siempre) y, al bajar, **una onda** que da a todos los que tengas cerca.
 * - **Los voladores** (los del catálogo: la abeja, el murciélago, el pulpo volador y el dragón) se te ponen delante y te siguen
 *   al virar; de uno en uno, **se echan atrás, rugen y atacan**: los grandes escupen una bola de fuego y los pequeños se lanzan
 *   a por ti. Apuntan adonde vas a estar si sigues igual: **se esquiva cambiando de rumbo** (virar, subir con un remo, frenar o
 *   acelerar). Si te dan, se rompe la racha y frenas a la mitad, sin vidas.
 * - **El jefe**: el dragón grande, en la última oleada (y, sin fin, cada cinco): escupe ráfagas de tres.
 *
 * Todo en el marco del cielo: x, z en el suelo (m; se vuela hacia (−sin rumbo, −cos rumbo)), y hacia arriba (el mar de nubes,
 * muy abajo). Lógica pura (sin IWSDK), con pruebas en `tests/unit/sky-fight.test.ts`; lo que se ve, `sky-fight-look.ts`. Nada se
 * crea en cada fotograma: enemigos, bolas y sucesos son de un montón reservado al empezar.
 */
import { placedFlat, placedTop } from '../../env/rock-top.js';

export const SKY = {
  /** El vuelo: lo que corre la marcha de crucero (m/s) y lo que suma cada marcha (parte de la de crucero), lo que suben y
   * bajan (m/s, × lo que manda el piloto) y sus inercias (s); el viraje (rad/s, ladeado del todo); la altura de salida, lo más
   * bajo (las islas quedan por debajo: no hay con qué chocar) y lo más alto (m). */
  speed: 8,
  gearK: 0.35,
  climb: 7,
  sink: 22,
  vsTau: 0.7,
  speedTau: 1.2,
  bankTau: 0.5,
  turn: 0.8,
  alt0: 45,
  floor: 14,
  ceil: 140,
  /** Los voladores: dónde salen (m por delante; rad a un lado como mucho), dónde se quedan (m por delante, a un lado, arriba),
   * lo que tardan en ponerse (s) y lo más deprisa que vuelan (m/s); cuántos a la vez (la primera oleada, menos) y cada cuánto
   * sale otro (s). */
  spawn: [80, 100] as const,
  spawnSide: 0.5,
  keep: [15, 22] as const,
  /** (los que escupen, más lejos: su bola tarda en llegar y da tiempo a esquivarla) */
  keepFar: [24, 32] as const,
  keepSide: 7,
  keepUp: [-2, 5] as const,
  follow: 1.4,
  maxV: 40,
  alive: [2, 3] as const,
  spawnGap: 1.5,
  /** Sus ataques: cada cuánto ataca uno (s, entre estos dos; nunca dos a la vez), lo que se echa atrás antes (s, el aviso: se
   * ve y se oye), lo deprisa que va la bola y el que se lanza (m/s), lo cerca que tiene que pasar para darte (m) y lo que vive
   * la bola (s). La primera vez, antes. */
  cool: [3.2, 5.5] as const,
  coolFirst: [1.5, 2.5] as const,
  windup: 1.1,
  shotV: 8,
  lungeV: 12,
  hitR: 1.3,
  life: 4,
  /** Tus disparos: el cono de la mirada (rad: el más cercano a ella dentro) y el alcance de la onda (m). */
  cone: 0.62,
  blastR: 35,
  /** El jefe: su vida (como poco; si la oleada pide más, la que pida), dónde se queda (m por delante, arriba), cada cuánto
   * ataca (s) y su ráfaga (bolas y lo que pasa entre una y otra, s). */
  bossHp: 8,
  bossKeep: 36,
  bossUp: 6,
  bossCool: [2.6, 4] as const,
  bossSalvo: 3,
  bossGap: 0.55,
  /** Lo que tarda en caer uno derribado hasta perderse (s) y la gravedad (m/s²). */
  fallT: 3,
  g: 9.8,
} as const;

export type SkyKind = 'bee' | 'bat' | 'cthulhu' | 'dragon' | 'boss';
export interface SkyKindDef {
  /** Su vida (disparos normales), su tamaño (m), si escupe o se lanza, su voz y sus puntos. */
  hp: number;
  size: number;
  act: 'spit' | 'lunge';
  voice: string;
  pts: number;
}
/** Cada volador: los pequeños se lanzan a por ti; los grandes escupen fuego. Grandes, para que se vean a 15-20 m. */
export const SKY_KIND: Record<SkyKind, SkyKindDef> = {
  bee: { hp: 1, size: 1.5, act: 'lunge', voice: 'bee', pts: 50 },
  bat: { hp: 1, size: 1.6, act: 'lunge', voice: 'bat', pts: 50 },
  cthulhu: { hp: 2, size: 2.4, act: 'spit', voice: 'cthulhu', pts: 90 },
  dragon: { hp: 3, size: 3.2, act: 'spit', voice: 'dragon', pts: 140 },
  boss: { hp: SKY.bossHp, size: 9, act: 'spit', voice: 'dragon', pts: 600 },
};

export type SkyState = 'off' | 'in' | 'hold' | 'wind' | 'lunge' | 'back' | 'fall';
export interface SkyFoe {
  id: number;
  kind: SkyKind;
  st: SkyState;
  hp: number;
  hpMax: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Lo que lleva en este estado (s), lo que le falta para atacar (s) y las bolas que le quedan de la ráfaga (el jefe). */
  t: number;
  cool: number;
  salvo: number;
  /** Dónde se queda respecto a ti (m: a un lado, arriba, por delante) y su vaivén (rad). */
  side: number;
  up: number;
  ahead: number;
  ph: number;
  /** El golpe que acaba de recibir (s: se ve un destello) y si ya te ha dado en este lanzamiento. */
  flash: number;
  done: boolean;
}
export interface SkyShot {
  on: boolean;
  /** Quién la lanzó (su id; el jefe, bolas grandes). */
  from: number;
  big: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
}
export type SkyEvKind = 'spawn' | 'boss' | 'wind' | 'fire' | 'lunge' | 'hurt' | 'dodge' | 'shot' | 'hit' | 'kill' | 'blast' | 'clear';
/** Un suceso, para lo que se ve y se oye y para la partida: quién (id y clase), dónde (m, en el cielo) y un número (el daño,
 * los que alcanza la onda…). `to` y `miss`, los del disparo: adónde va y si no había nadie. */
export interface SkyEv {
  k: SkyEvKind;
  id: number;
  kind: SkyKind | '';
  x: number;
  y: number;
  z: number;
  n: number;
  big: boolean;
}

const FOES = 8, SHOTS = 10, EVS = 48;
const r01 = (rnd: () => number, a: number, b: number): number => a + (b - a) * rnd();

/** Lo que manda el piloto en cada fotograma (`ParaPilot`): lo que vira, sube y la marcha; `fight`, si se pelea (colgado y en la
 * oleada: si no, los voladores esperan sin atacar). */
export interface SkyIn {
  steer: number;
  climb: number;
  gear: number;
  fight: boolean;
}

export class SkyFight {
  /** El vuelo: dónde vas (m), el rumbo (rad: 0 hacia −z; + a la izquierda), el ladeo (−1 a 1, + derecha) y las velocidades. */
  x = 0;
  y: number = SKY.alt0;
  z = 0;
  heading = 0;
  bank = 0;
  speed = 0;
  vs = 0;
  readonly foes: SkyFoe[] = [];
  readonly shots: SkyShot[] = [];
  /** Lo que ha pasado en este fotograma (se vacía al empezar el siguiente). */
  readonly ev: SkyEv[] = [];
  private readonly evPool: SkyEv[] = [];
  /** La oleada: los que faltan por salir, si es la del jefe, cuándo sale el siguiente y si ha empezado. */
  private queue: SkyKind[] = [];
  boss = false;
  wave = -1;
  private spawnT = 0;
  private started = false;
  private nextId = 1;
  /** Derribados en la ronda. */
  kills = 0;

  constructor(private readonly rnd: () => number = Math.random) {
    for (let i = 0; i < FOES; i++)
      this.foes.push({ id: 0, kind: 'bee', st: 'off', hp: 0, hpMax: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, cool: 0, salvo: 0, side: 0, up: 0, ahead: 0, ph: 0, flash: 0, done: false });
    for (let i = 0; i < SHOTS; i++) this.shots.push({ on: false, from: 0, big: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
    for (let i = 0; i < EVS; i++) this.evPool.push({ k: 'spawn', id: 0, kind: '', x: 0, y: 0, z: 0, n: 0, big: false });
  }

  /** Otra ronda: desde el principio, en `heading`. */
  reset(heading = 0): void {
    this.x = this.z = 0;
    this.y = SKY.alt0;
    this.heading = heading;
    this.bank = this.vs = 0;
    this.speed = SKY.speed;
    for (const F of this.foes) F.st = 'off';
    for (const S of this.shots) S.on = false;
    this.queue.length = 0;
    this.boss = false;
    this.wave = -1;
    this.started = false;
    this.spawnT = 0;
    this.kills = 0;
    this.ev.length = 0;
  }

  /** Empieza la oleada `i`: sus voladores, con tanta vida entre todos como remos pide (`need`); `boss`, la del jefe. */
  startWave(i: number, need: number, boss: boolean): void {
    this.wave = i;
    this.boss = boss;
    this.queue.length = 0;
    const pool: SkyKind[] = i <= 0 ? ['bee', 'bat'] : i === 1 ? ['bee', 'bat', 'cthulhu'] : ['bee', 'bat', 'cthulhu', 'dragon'];
    let left = Math.max(1, Math.round(need));
    this.bossNeed = boss ? Math.round(need * 0.6) : 0;
    if (boss) {
      this.queue.push('boss');
      left -= Math.max(SKY.bossHp, Math.round(need * 0.6));
    }
    while (left > 0) {
      let k = pool[Math.floor(this.rnd() * pool.length)];
      if (SKY_KIND[k].hp > left) k = 'bee';
      this.queue.push(k);
      left -= SKY_KIND[k].hp;
    }
    this.spawnT = 0.6;
    this.started = true;
  }

  /** ¿Derribados todos los de la oleada? */
  get cleared(): boolean {
    return this.started && !this.queue.length && !this.foes.some((F) => F.st !== 'off' && F.st !== 'fall');
  }
  /** La vida que queda por quitar en la oleada (los que faltan por salir y los que vuelan). */
  get left(): number {
    let n = 0;
    for (const k of this.queue) n += k === 'boss' ? this.bossHpOf() : SKY_KIND[k].hp;
    for (const F of this.foes) if (F.st !== 'off' && F.st !== 'fall') n += F.hp;
    return n;
  }
  /** El jefe, si vuela. */
  get bossFoe(): SkyFoe | null {
    return this.foes.find((F) => F.kind === 'boss' && F.st !== 'off' && F.st !== 'fall') ?? null;
  }
  /** La vida del jefe (la mayor parte de lo que pide su oleada; como poco, `bossHp`). */
  private bossNeed = 0;
  private bossHpOf(): number {
    return Math.max(SKY.bossHp, this.bossNeed);
  }

  // un suceso (de los reservados)
  private emit(k: SkyEvKind, F: SkyFoe | null, x: number, y: number, z: number, n = 0, big = false): SkyEv {
    const E = this.evPool[this.ev.length % EVS];
    E.k = k;
    E.id = F?.id ?? 0;
    E.kind = F?.kind ?? '';
    E.x = x;
    E.y = y;
    E.z = z;
    E.n = n;
    E.big = big;
    if (this.ev.length < EVS) this.ev.push(E);
    return E;
  }

  /** Hacia delante y a tu derecha, en el suelo (para colocar lo de delante). */
  fwdX(): number {
    return -Math.sin(this.heading);
  }
  fwdZ(): number {
    return -Math.cos(this.heading);
  }

  /** Un fotograma. */
  step(dt: number, I: SkyIn): void {
    this.ev.length = 0;
    if (dt <= 0) return;
    this.fly(dt, I);
    if (this.started) this.spawnStep(dt);
    // (lo que ataca: nunca dos a la vez)
    let busy = false;
    for (const F of this.foes) if (F.st === 'wind' || F.st === 'lunge' || (F.kind === 'boss' && F.salvo > 0 && F.st === 'hold')) busy = true;
    for (const F of this.foes) if (F.st !== 'off') busy = this.foeStep(F, dt, I.fight, busy);
    for (const S of this.shots) if (S.on) this.shotStep(S, dt);
  }

  // el vuelo, como sobre el mapa (con su inercia), en el cielo
  private fly(dt: number, I: SkyIn): void {
    const c = (v: number): number => Math.max(-1, Math.min(1, v));
    this.bank += (c(I.steer) - this.bank) * (1 - Math.exp(-dt / SKY.bankTau));
    this.heading -= SKY.turn * this.bank * dt; // (ladeado a la derecha, viras a la derecha)
    const cl = c(I.climb);
    let want = (cl > 0 ? SKY.climb : SKY.sink) * cl;
    // (lo más alto, suave: no se pasa del techo)
    if (want > 0 && this.y > SKY.ceil - 20) want *= Math.max(0, (SKY.ceil - this.y) / 20);
    this.vs += (want - this.vs) * (1 - Math.exp(-dt / SKY.vsTau));
    this.y += this.vs * dt;
    // las nubes te sostienen: nunca más abajo de `floor` (las islas, por debajo)
    if (this.y < SKY.floor) {
      this.y += (SKY.floor - this.y) * Math.min(1, dt * 4);
      if (this.vs < 0) this.vs = 0;
    }
    const v = SKY.speed * (1 + SKY.gearK * Math.max(0, I.gear - 1));
    this.speed += (v - this.speed) * (1 - Math.exp(-dt / SKY.speedTau));
    this.x += this.fwdX() * this.speed * dt;
    this.z += this.fwdZ() * this.speed * dt;
  }

  // sale otro (si caben y toca)
  private spawnStep(dt: number): void {
    this.spawnT -= dt;
    if (this.spawnT > 0 || !this.queue.length) return;
    const alive = this.foes.filter((F) => F.st !== 'off' && F.st !== 'fall').length, cap = SKY.alive[Math.min(this.wave, 1)];
    // (con el jefe en el aire, uno más de los pequeños como mucho)
    if (alive >= (this.bossFoe ? 2 : cap)) return;
    const F = this.foes.find((q) => q.st === 'off');
    if (!F) return;
    const kind = this.queue.shift()!, D = SKY_KIND[kind], R = this.rnd;
    F.id = this.nextId++;
    F.kind = kind;
    F.hp = F.hpMax = kind === 'boss' ? this.bossHpOf() : D.hp;
    const a = this.heading + r01(R, -SKY.spawnSide, SKY.spawnSide), d = r01(R, SKY.spawn[0], SKY.spawn[1]);
    F.x = this.x - Math.sin(a) * d;
    F.z = this.z - Math.cos(a) * d;
    F.y = this.y + r01(R, 4, 14);
    F.vx = F.vy = F.vz = 0;
    F.st = 'in';
    F.t = 0;
    F.flash = 0;
    F.salvo = 0;
    F.done = false;
    F.ph = R() * 6.28;
    if (kind === 'boss') {
      F.side = 0;
      F.up = SKY.bossUp;
      F.ahead = SKY.bossKeep;
    } else {
      // (cada uno en su sitio: repartidos a los lados, sin taparse)
      F.side = r01(R, -SKY.keepSide, SKY.keepSide);
      F.up = r01(R, SKY.keepUp[0], SKY.keepUp[1]);
      F.ahead = D.act === 'spit' ? r01(R, SKY.keepFar[0], SKY.keepFar[1]) : r01(R, SKY.keep[0], SKY.keep[1]);
    }
    F.cool = r01(R, SKY.coolFirst[0], SKY.coolFirst[1]);
    this.spawnT = SKY.spawnGap;
    this.emit(kind === 'boss' ? 'boss' : 'spawn', F, F.x, F.y, F.z);
  }

  // adónde quiere ir: su sitio delante de ti, con su vaivén
  private stationOf(F: SkyFoe): [number, number, number] {
    const fx = this.fwdX(), fz = this.fwdZ(), rx = -fz, rz = fx, w = F.t + F.ph;
    const side = F.side + Math.sin(w * 0.6) * (F.kind === 'boss' ? 4 : 2), up = F.up + Math.sin(w * 0.9 + 1.3) * 1.2;
    return [this.x + fx * F.ahead + rx * side, this.y + up, this.z + fz * F.ahead + rz * side];
  }

  // va hacia (tx, ty, tz) siguiéndote (lo que corres, más lo que le falta), suave y sin pasarse de `maxV`
  private steerTo(F: SkyFoe, tx: number, ty: number, tz: number, dt: number, tau = 0.5): void {
    const fx = this.fwdX() * this.speed, fz = this.fwdZ() * this.speed;
    let wx = (tx - F.x) / SKY.follow + fx, wy = (ty - F.y) / SKY.follow + this.vs, wz = (tz - F.z) / SKY.follow + fz;
    const m = Math.hypot(wx, wy, wz);
    if (m > SKY.maxV) {
      wx *= SKY.maxV / m;
      wy *= SKY.maxV / m;
      wz *= SKY.maxV / m;
    }
    const k = 1 - Math.exp(-dt / tau);
    F.vx += (wx - F.vx) * k;
    F.vy += (wy - F.vy) * k;
    F.vz += (wz - F.vz) * k;
    F.x += F.vx * dt;
    F.y += F.vy * dt;
    F.z += F.vz * dt;
  }

  // dónde estarás dentro de `t` s si sigues igual (el blanco de los que atacan)
  private ahead(t: number, out: [number, number, number]): [number, number, number] {
    out[0] = this.x + this.fwdX() * this.speed * t;
    out[1] = this.y + this.vs * t;
    out[2] = this.z + this.fwdZ() * this.speed * t;
    return out;
  }
  private readonly aim: [number, number, number] = [0, 0, 0];

  // lo que tarda en alcanzarte desde (sx, sy, sz) algo que va a `v` m/s si sigues igual (el encuentro: |P + V·t − S| = v·t)
  private meet(sx: number, sy: number, sz: number, v: number): number {
    const dx = this.x - sx, dy = this.y - sy, dz = this.z - sz, Vx = this.fwdX() * this.speed, Vy = this.vs, Vz = this.fwdZ() * this.speed;
    const a = Vx * Vx + Vy * Vy + Vz * Vz - v * v, b = 2 * (dx * Vx + dy * Vy + dz * Vz), c = dx * dx + dy * dy + dz * dz;
    let t: number;
    if (Math.abs(a) < 1e-6) t = b < 0 ? -c / b : Math.sqrt(c) / v;
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) t = Math.sqrt(c) / v;
      else {
        const q = Math.sqrt(disc), t1 = (-b - q) / (2 * a), t2 = (-b + q) / (2 * a);
        t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
      }
    }
    // (sin encuentro posible, a donde estás; y nunca más allá de lo que vive la bola)
    return t > 0 && Number.isFinite(t) ? Math.min(t, SKY.life) : Math.sqrt(c) / v;
  }

  // un volador, un fotograma; devuelve si alguno está atacando
  private foeStep(F: SkyFoe, dt: number, fight: boolean, busy: boolean): boolean {
    F.t += dt;
    F.flash = Math.max(0, F.flash - dt);
    const D = SKY_KIND[F.kind];
    // (sin pelea —te has soltado, o en pausa—, el que se echaba atrás se lo piensa)
    if (!fight && F.st === 'wind') F.st = 'hold';
    if (F.st === 'fall') {
      // derribado: cae dando vueltas hasta perderse entre las nubes
      F.vy -= SKY.g * dt;
      F.x += F.vx * dt;
      F.y += F.vy * dt;
      F.z += F.vz * dt;
      if (F.t > SKY.fallT) F.st = 'off';
      return busy;
    }
    if (F.st === 'lunge') {
      // lanzado a por ti: sigue recto; si pasa cerca, te da
      F.x += F.vx * dt;
      F.y += F.vy * dt;
      F.z += F.vz * dt;
      const dx = this.x - F.x, dy = this.y - F.y, dz = this.z - F.z, d = Math.hypot(dx, dy, dz);
      if (!F.done && d < SKY.hitR + D.size * 0.2) {
        F.done = true;
        this.emit('hurt', F, F.x, F.y, F.z);
      }
      // (pasado de largo o pasado el rato: vuelve a su sitio)
      if (dx * F.vx + dy * F.vy + dz * F.vz < 0 && d > 5) {
        if (!F.done) this.emit('dodge', F, F.x, F.y, F.z);
        F.st = 'back';
        F.t = 0;
        F.cool = r01(this.rnd, SKY.cool[0], SKY.cool[1]);
      }
      return true;
    }
    const [tx, ty, tz] = this.stationOf(F);
    this.steerTo(F, tx, ty, tz, dt, F.st === 'back' ? 0.9 : 0.5);
    const far = Math.hypot(tx - F.x, ty - F.y, tz - F.z);
    if (F.st === 'in' || F.st === 'back') {
      // (en su sitio, o casi —virando, su sitio da la vuelta contigo y siempre va algo detrás—, o pasado un rato)
      if (far < Math.max(6, F.ahead * 0.35) || F.t > 6) {
        F.st = 'hold';
        F.t = 0;
      }
      return busy;
    }
    if (F.st === 'hold') {
      if (!fight) return busy;
      // la ráfaga del jefe: la siguiente bola, al poco
      if (F.salvo > 0) {
        F.cool -= dt;
        if (F.cool <= 0) this.fire(F);
        return true;
      }
      F.cool -= dt;
      if (F.cool <= 0 && !busy) {
        F.st = 'wind';
        F.t = 0;
        F.done = false;
        this.emit('wind', F, F.x, F.y, F.z);
        return true;
      }
      return busy;
    }
    if (F.st === 'wind') {
      if (F.t < SKY.windup) return true;
      if (D.act === 'lunge') {
        // se lanza adonde vas a estar
        const A = this.ahead(this.meet(F.x, F.y, F.z, SKY.lungeV), this.aim);
        const ax = A[0] - F.x, ay = A[1] - F.y, az = A[2] - F.z, m = Math.max(0.01, Math.hypot(ax, ay, az));
        F.vx = (ax / m) * SKY.lungeV;
        F.vy = (ay / m) * SKY.lungeV;
        F.vz = (az / m) * SKY.lungeV;
        F.st = 'lunge';
        F.t = 0;
        this.emit('lunge', F, F.x, F.y, F.z);
        return true;
      }
      F.st = 'hold';
      F.t = 0;
      F.salvo = F.kind === 'boss' ? SKY.bossSalvo : 1;
      this.fire(F);
      return true;
    }
    return busy;
  }

  // escupe una bola adonde vas a estar
  private fire(F: SkyFoe): void {
    const S = this.shots.find((s) => !s.on);
    F.salvo = Math.max(0, F.salvo - 1);
    F.cool = F.salvo > 0 ? SKY.bossGap : F.kind === 'boss' ? r01(this.rnd, SKY.bossCool[0], SKY.bossCool[1]) : r01(this.rnd, SKY.cool[0], SKY.cool[1]);
    if (!S) return;
    // (desde delante de su boca, hacia ti; dos vueltas para afinar lo que tarda)
    const d0 = Math.hypot(this.x - F.x, this.y - F.y, this.z - F.z), mouth = Math.min(d0 * 0.5, SKY_KIND[F.kind].size * 0.4);
    const sx = F.x + ((this.x - F.x) / Math.max(0.01, d0)) * mouth, sy = F.y + ((this.y - F.y) / Math.max(0.01, d0)) * mouth, sz = F.z + ((this.z - F.z) / Math.max(0.01, d0)) * mouth;
    const A = this.ahead(this.meet(sx, sy, sz, SKY.shotV), this.aim);
    const ax = A[0] - sx, ay = A[1] - sy, az = A[2] - sz, m = Math.max(0.01, Math.hypot(ax, ay, az));
    S.on = true;
    S.from = F.id;
    S.big = F.kind === 'boss';
    S.x = sx;
    S.y = sy;
    S.z = sz;
    S.vx = (ax / m) * SKY.shotV;
    S.vy = (ay / m) * SKY.shotV;
    S.vz = (az / m) * SKY.shotV;
    S.t = 0;
    this.emit('fire', F, sx, sy, sz, 0, S.big);
  }

  // una bola, un fotograma: si pasa cerca de ti, te da; si se va, esquivada
  private shotStep(S: SkyShot, dt: number): void {
    S.t += dt;
    S.x += S.vx * dt;
    S.y += S.vy * dt;
    S.z += S.vz * dt;
    const dx = this.x - S.x, dy = this.y - S.y, dz = this.z - S.z, d = Math.hypot(dx, dy, dz);
    if (d < SKY.hitR * (S.big ? 1.3 : 1)) {
      S.on = false;
      this.emit('hurt', null, S.x, S.y, S.z, 0, S.big);
      return;
    }
    if (S.t > SKY.life || (dx * S.vx + dy * S.vy + dz * S.vz < 0 && d > 3)) {
      S.on = false;
      this.emit('dodge', null, S.x, S.y, S.z, 0, S.big);
    }
  }

  /**
   * Un disparo hacia donde miras (gx, gy, gz: la mirada, en el cielo): al volador más cercano a ella dentro del cono, con
   * `dmg` de daño (el explosivo, 2). Devuelve el suceso del disparo (`to`: adónde va; n = −1 si no había nadie).
   */
  shoot(gx: number, gy: number, gz: number, dmg: number): SkyEv {
    const m = Math.max(1e-6, Math.hypot(gx, gy, gz)), ux = gx / m, uy = gy / m, uz = gz / m;
    let best: SkyFoe | null = null, bestA: number = SKY.cone;
    for (const F of this.foes) {
      if (F.st === 'off' || F.st === 'fall') continue;
      const dx = F.x - this.x, dy = F.y - this.y, dz = F.z - this.z, d = Math.max(0.01, Math.hypot(dx, dy, dz));
      const a = Math.acos(Math.max(-1, Math.min(1, (dx * ux + dy * uy + dz * uz) / d)));
      if (a < bestA) {
        bestA = a;
        best = F;
      }
    }
    if (!best) return this.emit('shot', null, this.x + ux * 40, this.y + uy * 40, this.z + uz * 40, -1, dmg > 1);
    const E = this.emit('shot', best, best.x, best.y, best.z, dmg, dmg > 1);
    this.damage(best, dmg);
    return E;
  }

  /** La onda de la carga ×p: a todos los que tengas a menos de `blastR`, `p` de daño. Devuelve a cuántos ha dado. */
  blast(p: number): number {
    let n = 0;
    for (const F of this.foes) {
      if (F.st === 'off' || F.st === 'fall') continue;
      if (Math.hypot(F.x - this.x, F.y - this.y, F.z - this.z) > SKY.blastR) continue;
      n++;
      this.damage(F, p);
    }
    this.emit('blast', null, this.x, this.y, this.z, n, p >= 4);
    return n;
  }

  private damage(F: SkyFoe, dmg: number): void {
    F.hp -= dmg;
    F.flash = 0.25;
    if (F.hp > 0) {
      this.emit('hit', F, F.x, F.y, F.z, dmg);
      return;
    }
    // derribado: cae dando vueltas (con lo que llevaba y un empujón hacia abajo)
    F.hp = 0;
    F.st = 'fall';
    F.t = 0;
    F.vy = Math.min(F.vy, 0) - 2;
    this.kills++;
    this.emit('kill', F, F.x, F.y, F.z, SKY_KIND[F.kind].pts);
    if (this.cleared) this.emit('clear', null, this.x, this.y, this.z);
  }

}

/** Una isla del cielo: dónde (m, en el cielo), su giro, su tamaño y sus árboles (cada uno apoyado en ella). */
export interface SkyIsle {
  x: number;
  y: number;
  z: number;
  ry: number;
  s: number;
  trees: { n: string; x: number; y: number; z: number; ry: number; sc: number }[];
}
/** Las islas: cuántas, dónde (m: de lo más cerca a lo más lejos al empezar; cuando una queda atrás, sale otra por delante a
 * esta distancia y a este ángulo como mucho) y sus tamaños; su altura, siempre por debajo de lo más bajo que se vuela. */
export const ISLES = { n: 16, near: 100, far: 540, again: [420, 540] as const, againSide: 1.2, gone: 580, s: [4, 9] as const, top: -14, low: -48, treeK: 0.35, treeMax: 2.2 } as const;
/** La losa de una isla (Cliff1, aplanada) y su panza colgando (Cliff3, del revés). */
export const ISLE_SLAB = 'Cliff1', ISLE_BELLY = 'Cliff3', ISLE_SLAB_Y = 0.5;
const TREES = ['CommonTree_3', 'CommonTree_4', 'Pine_4'];
const SPOTS: [number, number][] = [[0, 0], [0.8, 0.3], [-0.8, -0.3], [0.3, -0.9], [-0.4, 0.9]];
/** Lo alto de la losa, a escala 1 (m: la caja de Cliff1). */
const SLAB_TOP = 2.482;

/** Las islas que flotan sobre el mar de nubes, por debajo de ti; cuando una queda atrás, sale otra por delante. */
export class SkyIsles {
  readonly list: SkyIsle[] = [];
  /** Las que acaban de cambiar de sitio (se repintan solo esas). */
  readonly moved: number[] = [];

  constructor(private readonly rnd: () => number = Math.random) {
    for (let i = 0; i < ISLES.n; i++) this.list.push({ x: 0, y: 0, z: 0, ry: 0, s: 1, trees: [] });
  }

  /** Al empezar: repartidas alrededor de (x, z). */
  reset(x: number, z: number): void {
    this.moved.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const a = this.rnd() * 6.283, d = ISLES.near + (ISLES.far - ISLES.near) * Math.sqrt(this.rnd());
      this.place(this.list[i], x - Math.sin(a) * d, z - Math.cos(a) * d);
      this.moved.push(i);
    }
  }

  /** Cada poco: las que han quedado lejos, otra vez por delante (hacia `heading`). */
  step(x: number, z: number, heading: number): void {
    this.moved.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const I = this.list[i];
      if (Math.hypot(I.x - x, I.z - z) < ISLES.gone) continue;
      const a = heading + (this.rnd() * 2 - 1) * ISLES.againSide, d = ISLES.again[0] + (ISLES.again[1] - ISLES.again[0]) * this.rnd();
      this.place(I, x - Math.sin(a) * d, z - Math.cos(a) * d);
      this.moved.push(i);
    }
  }

  // una isla en (x, z): su tamaño, su altura (lo de encima, árboles incluidos, por debajo de lo que se vuela) y sus árboles
  private place(I: SkyIsle, x: number, z: number): void {
    const R = this.rnd, s = ISLES.s[0] + (ISLES.s[1] - ISLES.s[0]) * R(), tree = Math.min(ISLES.treeMax, s * ISLES.treeK);
    // (lo alto de la losa, con sitio para sus árboles —de unos 6 m a escala 1— por debajo de `top`)
    const hi = ISLES.top - tree * 6 - SLAB_TOP * s * ISLE_SLAB_Y;
    I.x = x;
    I.z = z;
    I.y = ISLES.low + (hi - ISLES.low) * R();
    I.ry = R() * 6.283;
    I.s = s;
    I.trees.length = 0;
    // (uno o dos árboles en un sitio llano de la losa; si no lo hay, ninguno: nunca en el aire)
    const want = R() < 0.75 ? 1 + Math.floor(R() * 2) : 0;
    for (const [ox, oz] of SPOTS) {
      if (I.trees.length >= want) break;
      const tx = x + ox * s, tz = z + oz * s, sy = s * ISLE_SLAB_Y;
      const t = placedTop(ISLE_SLAB, x, I.y, z, I.ry, s, sy, s, tx, tz);
      if (t === null || !placedFlat(ISLE_SLAB, x, I.y, z, I.ry, s, sy, s, tx, tz, 0.5 * s, 0.35 * s)) continue;
      I.trees.push({ n: TREES[Math.floor(R() * TREES.length)], x: tx, y: t - 0.15 * tree, z: tz, ry: R() * 6.283, sc: tree * (0.8 + 0.3 * R()) });
    }
  }
}
