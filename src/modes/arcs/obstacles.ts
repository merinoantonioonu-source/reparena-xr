/**
 * Los obstáculos nuevos de los Arcos y los orbes, como en RepArena (src/71_arcs.js: ArcObs y ArcOrb), sin mallas ni
 * sonidos: cómo se mueven y cómo se juzgan. La partida pinta lo que dicen sus campos (dónde está el láser, las paredes, la
 * bola de la maza, el orbe) y hace lo que devuelven (el pitido, el silbido, el golpe o el «¡Esquivado!»).
 *  - El láser: un rayo de pie que barre la pista mientras llega y se queda quieto LASER_STILL s antes de pasar por ti, con
 *    un lado libre: apártate a él.
 *  - Las paredes: dos que se cierran dejando un hueco a un lado (a veces inclinadas): métete en él.
 *  - La maza: una bola de pinchos colgada de una cadena que se balancea (o gira en círculo) a la altura de tu cabeza.
 *  - El orbe: cruza la pista en diagonal con un vuelo imprevisible; se coge con la cabeza o con una mano.
 * Sin IWSDK: se compara con RepArena en tests/compare/arcs-extras.compare.test.ts.
 */
import { HEAD_TOP, type ArcsEnv } from './env.js';
import { arxPtsK, type ArxCheer, type ArxState } from './state.js';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** El láser se queda quieto estos segundos antes de llegar a ti (RepArena: LASER_STILL). */
export const LASER_STILL = 1.6;
/** El alcance de la bola de la maza con sus pinchos (RepArena: MACE.r: la bola, 0,16, y los pinchos). */
export const MACE_R = 0.26;

export type ObsKind = 'laser' | 'walls' | 'mace';
export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Lo que hay que hacer al juzgar el obstáculo (RepArena: lo que hacía ArcObs.resolve). */
export interface ObsOutcome {
  /** 'lane': no estabas en el carril (solo el aviso); 'hit': te ha dado; 'pass': lo has esquivado. */
  kind: 'lane' | 'hit' | 'pass';
  /** Te quita una vida sin su sonido propio (RepArena: hurtPlayer({ silent: true })) y rompe la racha (arxHit). */
  hurt: boolean;
  /** Cuenta como repetición perfecta, sin disparo (RepArena: registerRep(true, false)) y suma a la racha (arxClean). */
  rep: boolean;
  perfect: boolean;
  /** El aviso (RepArena: say(texto, color, segundos, toast)). */
  say: [string, string, number, boolean];
  /** Los sonidos: al dar, 'zap' (la maza, 'metalHit'); al pasar, 'whoosh' y después 'perfect'. */
  sounds: string[];
  /** Al dar, la descarga eléctrica (RepArena: fx.electric(punto, 24)). */
  electric: boolean;
  /** Dónde (en la arena): delante de tu cara. */
  at: P3;
}

/** Lo que pasa en el fotograma (uno por obstáculo, reutilizado). */
export interface ObsFrame {
  /** Va a darte (en los últimos 2,4 m sin estar a salvo): el láser se enciende del todo, las paredes y la maza parpadean. */
  danger: boolean;
  /** Si suena el pitido de aviso, su tono (RepArena: SND.beep(tono)); 0 si no. */
  beep: number;
  /** La maza pasa por lo más bajo cerca de ti: silba (RepArena: SND.whoosh en la bola). */
  whoosh: boolean;
  /** Lo que ha pasado al juzgarlo (este fotograma), o null. */
  outcome: ObsOutcome | null;
}

export class ArcObsCore {
  alive = true;
  judged = false;
  checked = false;
  hit = false;
  t = 0;
  warnT = 0;
  z: number;
  speed: number;
  tReach: number;
  /** Para el marcador y la vista previa: hacia dónde apartarse, el ladeo (solo su signo) y la bajada. */
  leanX = 0;
  tilt = 0;
  drop = 0.01;
  // el láser
  lk = 0;
  xf = 0;
  amp = 0;
  ph = 0;
  w = 0;
  amp2 = 0;
  ph2 = 0;
  still = 0;
  /** Dónde está el rayo ahora (x en la arena). */
  beamX = 0;
  // la maza
  L = 0;
  H = 0;
  round = false;
  A = 0;
  piv = 0;
  bx = 0;
  by = 0;
  bz = 0;
  lastS = 0;
  reach = 0;
  // las paredes
  gx = 0;
  gap = 0;
  ang = 0;
  /** El canto de cada pared (x en la arena): la de la izquierda y la de la derecha. */
  wallL = 0;
  wallR = 0;
  readonly frame: ObsFrame = { danger: false, beep: 0, whoosh: false, outcome: null };

  /** Sale al fondo de la pista a la velocidad de ahora (`speed`: RepArena, arxSpeed()). */
  constructor(readonly kind: ObsKind, env: ArcsEnv, speed: number) {
    const rand = (a: number, b: number) => a + env.rnd() * (b - a), HL = env.head;
    this.z = -env.arenaDepth + 0.9;
    this.speed = speed;
    this.tReach = Math.max(0.5, (HL.z - this.z) / this.speed);
    if (kind === 'laser') {
      // cuanto más difícil (Láser: amenaza), barre más pista, más deprisa y con un amago, pero a una velocidad que se puede
      // seguir; se queda quieto en su sitio antes de llegar, con un lado libre
      const k = Math.min(1.3, env.dv('arcLaser') / 100);
      this.lk = k;
      this.xf = (env.rnd() < 0.5 ? -1 : 1) * rand(0.05, 0.35);
      this.amp = 0.45 + 0.25 * k;
      this.ph = rand(0, TAU);
      this.w = 1.5 + 1.0 * k;
      this.amp2 = 0.12 * k;
      this.ph2 = rand(0, TAU);
      this.still = LASER_STILL - 0.3 * Math.min(1, k);
      const safe = this.xf > 0 ? -1 : 1;
      this.leanX = this.xf + safe * 0.5;
      this.tilt = safe * 0.01;
      this.beamX = this.x();
    } else if (kind === 'mace') {
      // la bola pasa «Bajada de la maza» por debajo de lo alto de tu cabeza: en lo más bajo de su vaivén o, las que giran
      // en círculo (un péndulo cónico), siempre a esa altura
      const drop = env.s('arcMaceDrop');
      this.L = 2.0;
      this.H = env.calibRef + HEAD_TOP - (drop >= 0 ? drop : 20) / 100;
      this.round = env.rnd() * 100 < env.s('arcMaceRound');
      this.A = this.round ? rand(0.32, 0.42) : rand(0.42, 0.55);
      this.piv = this.round ? this.H + this.L * Math.cos(this.A) : this.H + this.L;
      this.w = TAU / (this.round ? rand(1.8, 2.4) : rand(1.5, 2.1));
      this.ph = rand(0, TAU);
      this.tilt = 0.01;
      this.reach = this.round ? this.L * Math.sin(this.A) : 0;
    } else {
      // algunas llegan inclinadas: el hueco va en diagonal y hay que ladearse
      this.gx = (env.rnd() < 0.5 ? -1 : 1) * rand(0.28, 0.45);
      this.gap = 0.62;
      this.ang = env.rnd() * 100 < env.s('arcWallTilt') ? -Math.sign(this.gx) * rand(0.1, 0.22) : 0;
      this.leanX = this.gapX(env.calibRef);
      this.tilt = Math.sign(this.leanX) * 0.01;
    }
  }

  /** Lo que queda para que llegue: se mueve mucho al principio y se asienta en su sitio al pasar por ti. */
  settle(w = 1.2): number {
    const tau = Math.max(0, this.tReach - this.t);
    return tau * Math.min(1, tau / w);
  }
  /** El centro del hueco de las paredes a esa altura. */
  gapX(y: number): number {
    return this.gx - Math.tan(this.ang || 0) * y;
  }
  /** El láser: alrededor de su sitio, con un vaivén que se apaga del todo `still` s antes de llegar a ti. */
  x(): number {
    const tau = Math.max(0, this.tReach - this.t), env = smooth(clamp((tau - this.still) / 1.0, 0, 1)), t = this.t;
    const x = this.xf + env * (this.amp * Math.sin(this.ph + t * this.w) + this.amp2 * Math.sin(this.ph2 + t * this.w * 2.4));
    return Math.max(-0.85, Math.min(0.85, x));
  }

  /** Un fotograma (RepArena: ArcObs.update). `live`: en partida o en el descanso (RepArena: state play o rest); fuera,
   * se juzga sin consecuencias. Cuando pasa del todo (3,5 m detrás de ti), `alive` = false. */
  update(dt: number, env: ArcsEnv, live: boolean): ObsFrame {
    const f = this.frame, HL = env.head;
    f.beep = 0;
    f.whoosh = false;
    f.outcome = null;
    this.t += dt;
    this.z += this.speed * dt;
    const hz = HL.z, inLane = Math.abs(HL.x) < 1.0, s = this.settle();
    if (this.kind === 'laser') this.beamX = this.x();
    else if (this.kind === 'walls') {
      const half = this.gap / 2 + Math.min(0.9, s * 0.35);
      this.wallL = this.gx - half;
      this.wallR = this.gx + half;
      if (this.ang) this.leanX = this.gapX(HL.y); // (inclinadas: el hueco, a la altura a la que llevas la cabeza)
    }
    if (this.kind === 'mace') this.swing(HL, f);
    const bad = this.kind === 'laser' ? Math.abs(HL.x - this.beamX) < 0.28 : this.kind === 'mace' ? this.maceHits(HL) : Math.abs(HL.x - this.gapX(HL.y)) > this.gap / 2 - 0.06;
    const danger = !this.judged && this.z < hz && this.z > hz - 2.4 && bad;
    f.danger = danger;
    if (danger && inLane) {
      // el pitido, más seguido y más agudo según se acerca
      this.warnT -= dt;
      if (this.warnT <= 0) {
        const d = hz - this.z;
        this.warnT = clamp(d * 0.18, 0.08, 0.4);
        f.beep = 1 + (2.4 - d) * 0.25;
      }
    }
    const reach = this.reach; // (la maza que gira pasa por delante y por detrás de su viga)
    if (!this.judged && Math.abs(this.z - hz) < 0.15 + reach && inLane) {
      this.checked = true;
      if (bad) this.hit = true;
    }
    if (!this.judged && this.z > hz + 0.15 + reach) {
      this.judged = true;
      f.outcome = this.resolve(HL, live);
    }
    if (this.z > hz + 3.5) this.alive = false;
    return f;
  }

  /** La maza: dónde está la bola (en el sitio de la pista; bz, delante o detrás de su viga). */
  private swing(HL: P3, f: ObsFrame): void {
    const ph = this.w * this.t + this.ph;
    if (this.round) {
      const r = this.L * Math.sin(this.A);
      this.bx = r * Math.sin(ph);
      this.bz = r * Math.cos(ph);
      this.by = this.H;
    } else {
      const a = this.A * Math.sin(ph);
      this.bx = this.L * Math.sin(a);
      this.by = this.piv - this.L * Math.cos(a);
      this.bz = 0;
    }
    const s = Math.sign(this.bx);
    if (s !== this.lastS && this.lastS && Math.abs(this.z - HL.z) < 3) f.whoosh = true;
    this.lastS = s;
  }
  /** La bola, con sus pinchos, y tu cabeza. */
  maceHits(HL: P3): boolean {
    return Math.abs(this.z + this.bz - HL.z) < 0.2 && Math.hypot(HL.x - this.bx, HL.y - this.by) < MACE_R + 0.14;
  }

  /** El juicio (RepArena: ArcObs.resolve): fuera del carril, solo el aviso; si te dio, el golpe; si no, una perfecta. */
  resolve(HL: P3, live: boolean): ObsOutcome | null {
    if (!live) return null;
    const at = { x: HL.x, y: HL.y, z: HL.z - 0.1 };
    if (!this.checked) return { kind: 'lane', hurt: false, rep: false, perfect: false, say: ['Quédate en el carril', '#ff8a3d', 1.2, true], sounds: [], electric: false, at };
    if (this.hit) {
      const text = this.kind === 'laser' ? `¡Apártate del láser, a la ${this.leanX > this.xf ? 'derecha' : 'izquierda'}!` : this.kind === 'mace' ? '¡Esquiva la maza: apártate o agáchate!' : this.ang ? '¡Ladéate para entrar en el hueco!' : '¡Métete en el hueco!';
      return { kind: 'hit', hurt: true, rep: false, perfect: false, say: [text, '#ff3b5c', 1.3, true], sounds: [this.kind === 'mace' ? 'metalHit' : 'zap'], electric: true, at };
    }
    const text = this.kind === 'laser' ? '¡Esquivado!' : this.kind === 'mace' ? '¡Maza esquivada!' : '¡Por el hueco!';
    return { kind: 'pass', hurt: false, rep: true, perfect: true, say: [text, '#3cf0c6', 0.9, false], sounds: ['whoosh', 'perfect'], electric: false, at };
  }
}

/** Las manos, en la arena (solo las que se ven). */
export interface ArcHands {
  left?: P3 | null;
  right?: P3 | null;
}

/** Lo que da coger un orbe (RepArena: lo que hacía ArcOrb.update al cogerlo). Los puntos los suma la partida. */
export interface OrbOutcome {
  pts: number;
  /** Cogido justo en un pulso (con música): el doble y su aviso al marcador. */
  onBeat: boolean;
  cheer: ArxCheer | null;
  /** El aviso (RepArena: say(texto, color, segundos, false)), el sonido ('orb'), las chispas y la vibración, en `at`. */
  say: [string, string, number, boolean];
  at: P3;
}

export type OrbBand = 'high' | 'mid' | 'low';

export class ArcOrbCore {
  alive = true;
  band: OrbBand;
  /** Por dónde va su línea recta (z avanza hacia ti) y dónde se ve ahora (con su vuelo). */
  readonly pos: P3;
  readonly at: P3 = { x: 0, y: 0, z: 0 };
  speed: number;
  fl: { f: number; p: number }[];
  amp = 1;
  z0: number;
  x1: number;
  y1: number;
  ease: number;
  /** Su fase para latir y girar (solo se ve). */
  ph: number;

  /** Sale al fondo de la pista a la velocidad de ahora (`speed`: RepArena, arxSpeed()). */
  constructor(env: ArcsEnv, speed: number) {
    const rand = (a: number, b: number) => a + env.rnd() * (b - a), cr = env.calibRef;
    // la altura: unos por encima de la cabeza (estirar el brazo o saltar), otros muy abajo (agacharse a fondo o bajar la
    // mano casi al suelo) y el resto, a la altura de la cara
    const r = env.rnd() * 100, hi = env.s('arcOrbHigh'), band: OrbBand = r < hi ? 'high' : r < hi + env.s('arcOrbLow') ? 'low' : 'mid';
    this.band = band;
    const x = rand(-0.6, 0.6);
    const y = band === 'high' ? clamp(cr + rand(0.15, 0.4), 1.5, 2.3) : band === 'low' ? clamp(cr - rand(0.75, 1.05), 0.3, 0.95) : clamp(cr + rand(-0.55, 0.08), 0.5, 2.1);
    this.pos = { x, y, z: -env.arenaDepth + 0.9 };
    this.speed = speed;
    // vuelo: dos vaivenes de frecuencias que no encajan, en horizontal y en vertical, que crecen al acercarse
    const fs = [rand(1.2, 1.9), rand(2.6, 3.5), rand(1.0, 1.6), rand(2.2, 3.1)];
    this.fl = fs.map((f) => ({ f, p: rand(0, TAU) }));
    // y cruza en diagonal hacia el otro lado de la pista (y a otra altura), por una curva que no es la misma cada vez
    this.z0 = this.pos.z;
    this.x1 = -Math.sign(this.pos.x || 1) * rand(0.2, 0.7);
    this.y1 = band === 'mid' ? clamp(cr + rand(-0.6, 0.1), 0.5, 2.0) - this.pos.y : rand(-0.12, 0.12);
    this.ease = Math.floor(rand(0, 3));
    this.ph = rand(0, TAU);
    this.at.x = this.pos.x;
    this.at.y = this.pos.y;
    this.at.z = this.pos.z;
  }

  /** Un fotograma (RepArena: ArcOrb.update): vuela y, si lo tocas con la cabeza o una mano en partida, se coge (suma a
   * `st.got`; los puntos, en lo que devuelve). Cogido o pasado 1,5 m de ti, `alive` = false. `t`: el reloj del vuelo. */
  update(dt: number, t: number, env: ArcsEnv, st: ArxState, hands: ArcHands, play: boolean, beatNow = 0): OrbOutcome | null {
    const HL = env.head, D = env.arenaDepth, F = this.fl;
    this.pos.z += this.speed * dt;
    const sw = this.amp * clamp(env.s('arcOrbSwing') / 100, 0, 1), k = sw * clamp((this.pos.z + D) / Math.max(1, D), 0.3, 1);
    const p = clamp((this.pos.z - this.z0) / Math.max(0.5, HL.z - this.z0), 0, 1), e = this.ease === 0 ? p * p : this.ease === 1 ? 1 - (1 - p) * (1 - p) : smooth(p);
    this.at.x = clamp(this.pos.x + sw * (this.x1 - this.pos.x) * e + k * (0.3 * Math.sin(F[0].f * t + F[0].p) + 0.12 * Math.sin(F[1].f * t + F[1].p)), -0.9, 0.9);
    this.at.y = clamp(this.pos.y + sw * this.y1 * e + k * (0.15 * Math.sin(F[2].f * t + F[2].p) + 0.06 * Math.sin(F[3].f * t + F[3].p)), 0.28, 2.35);
    this.at.z = this.pos.z;
    // se recoge con la cabeza (un poco por debajo de los ojos) o con cualquier mano (la muñeca)
    const a = this.at;
    let got = Math.hypot(a.x - HL.x, a.y - (HL.y - 0.05), a.z - HL.z) < 0.24;
    for (const h of [hands.left, hands.right]) if (!got && h && Math.hypot(a.x - h.x, a.y - h.y, a.z - h.z) < 0.17) got = true;
    if (got && play) {
      // (con música, cogido justo en un pulso: el doble)
      const onBeat = !!env.beatP && Math.abs(((beatNow % 1) + 1.5) % 1 - 0.5) < 0.18, pts = 100 * arxPtsK(st) * (onBeat ? 2 : 1);
      st.got++;
      if (onBeat) st.gotBeat++;
      this.alive = false;
      return { pts, onBeat, cheer: onBeat ? ['¡EN EL PULSO! ×2', '#ffd166', 0.9] : null, say: [`+${pts} · ¡ORBE!`, '#ffd166', 0.9, false], at: { x: a.x, y: a.y, z: a.z } };
    }
    if (this.pos.z > HL.z + 1.5) this.alive = false;
    return null;
  }
}
