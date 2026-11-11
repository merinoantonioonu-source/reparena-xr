/**
 * Los arcos de energía del modo Arcos, tal cual en RepArena (src/70_game.js: class Arc y arcJumpNeed; src/71_arcs.js:
 * arxMul, arxBpmK y arxSpeed), sin lo que se ve ni lo que suena: la barra llega por la pista hacia ti y, al pasar por
 * donde tienes la cabeza, se juzga si la has esquivado (agachándote, apartándote al lado alto, saltando la valla o en
 * plancha). Lo que en RepArena hacía `resolve()` (chispas, sonido, avisos, daño, repetición) sale aquí como un resultado
 * (`ArcOutcome`) que la partida convierte en todo eso. Sin IWSDK: se compara con el código de RepArena en
 * tests/compare/arcs-core.compare.test.ts.
 */
import { HEAD_TOP, type ArcsEnv } from './env.js';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Un número al azar entre a y b, con la misma cuenta que RepArena (rand): así sale igual con el mismo azar. */
export const randIn = (env: ArcsEnv, a: number, b: number): number => a + env.rnd() * (b - a);

/** Lo que la fiebre de los Arcos tiene ahora (RepArena: ARX.fever y ARX.feverN). */
export interface ArxFever {
  fever: boolean;
  feverN: number;
}

/** La fiebre acelera lo que llega: la primera, un 20 %; cada una de las siguientes de la ronda, «Fiebre +» más (hasta el
 * doble). (RepArena: arxMul) */
export function arxMul(env: ArcsEnv, arx: ArxFever): number {
  const up = env.s('arcFeverUp');
  return arx.fever ? Math.min(2, 1.2 + (up >= 0 ? up : 10) / 100 * (arx.feverN - 1)) : 1;
}

/** Con ritmo y «Velocidad según la canción», del 80 % al 125 % según su BPM (120, igual; las muy lentas o muy rápidas, a
 * doble o a mitad de tiempo). (RepArena: arxBpmK) */
export function arxBpmK(env: ArcsEnv): number {
  if (!env.s('arcBpmSpeed') || !env.beatP) return 1;
  let b = env.s('bpm');
  if (!(b > 0)) return 1; // (sin BPM, RepArena se quedaba en un bucle: aquí, igual que sin ritmo)
  while (b < 90) b *= 2;
  while (b > 180) b /= 2;
  return clamp(b / 120, 0.8, 1.25);
}

/** La velocidad de lo que llega (m/s): la del rango, con la fiebre y el ritmo. (RepArena: arxSpeed) */
export const arxSpeed = (env: ArcsEnv, arx: ArxFever): number => env.dv('arcSpeed') / 3.6 * arxMul(env, arx) * arxBpmK(env);

/** La del arco de plancha: la suya propia (más despacio), con la fiebre. */
export const arxPlankSpeed = (env: ArcsEnv, arx: ArxFever): number => Math.max(0.3, env.s('arcPlankSpeed') / 3.6) * arxMul(env, arx);

/** Lo que tiene que subir la cabeza al pasar una valla (su ajuste propio, aparte del salto de Toques). */
export const arcJumpNeed = (env: ArcsEnv): number => (env.s('arcJumpH') || 6) / 100;

/** Cómo es un arco (RepArena: los argumentos de `new Arc`). */
export interface ArcParams {
  /** Cuánto hay que bajar la cabeza (m) bajo la barra. */
  drop: number;
  /** Cuánto más atrás sale (m): el segundo de un doble. */
  offset?: number;
  /** El segundo de un doble: no cuenta repetición, da puntos por aguantar abajo. */
  second?: boolean;
  /** La inclinación (rad; el signo dice hacia qué lado está el lado alto: + derecha). */
  tilt?: number;
  /** Valla baja que llega a ras de suelo y hay que saltar. */
  jump?: boolean;
  /** La rueda: lo que gira (rad/s) mientras llega hasta pararse inclinada (tilt) justo al pasar por ti. */
  spin?: number;
  /** Arco casi a ras de suelo, para pasarlo en plancha (como un burpee sin el salto). */
  plank?: boolean;
  /** Inclinado bajo, de semipuente: hay que apartarse al lado alto y apoyar una mano en el suelo. */
  low?: boolean;
}

/** Un punto de la arena. */
export interface ArcPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Lo que pasa al juzgar un arco (RepArena: lo que hacía Arc.resolve). La partida, en este orden:
 * - `hurt` (kind 'hurt' o 'jumpFail'): chispas eléctricas en `hitPoint` (fx.electric(hp, 24)), el chasquido (`sound`
 *   'zap'), te quita una vida (hurtPlayer(arco)), corta la racha y la fiebre (arxHit) y el aviso (`say`).
 * - `rep` (kind 'jumpOk' o 'pass'): el zumbido (`sound` 'whoosh'), la repetición (registerRep(perfect, false)), suma a
 *   la racha (arxClean), el aviso y, si `perfectSound`, el sonido de la perfecta.
 * - 'second' (el segundo de un doble): el zumbido, `scoreBase × (1 + combo × 0,1)` puntos (redondeado hacia abajo: ver
 *   `arcSecondScore`), la celebración (`cheer`) al marcador y el marcador por repintar.
 * - 'lane' (no pasaste por el carril): solo el aviso.
 */
export interface ArcOutcome {
  kind: 'lane' | 'hurt' | 'jumpFail' | 'jumpOk' | 'pass' | 'second';
  perfect: boolean;
  /** Aviso: texto, color, segundos y si es breve (toast; RepArena: el cuarto argumento de say, true de serie). */
  say: [string, string, number, boolean] | null;
  /** Celebración al marcador: texto, color y segundos. */
  cheer: [string, string, number] | null;
  hurt: boolean;
  rep: boolean;
  /** Los puntos del segundo de un doble, antes del combo. */
  scoreBase: number;
  sound: 'zap' | 'whoosh' | null;
  perfectSound: boolean;
  /** Dónde (en la arena) salen las chispas y el sonido: sobre tu cabeza, en la barra. */
  hitPoint: ArcPoint;
}

/** Los puntos del segundo de un doble con el combo que llevas (RepArena: score += 150 * (1 + combo * 0.1) | 0). */
export const arcSecondScore = (base: number, combo: number): number => (base * (1 + combo * 0.1)) | 0;

const side = (tilt: number): string => (tilt > 0 ? 'derecha' : 'izquierda');

/**
 * Un arco: dónde está, cómo es y si ya se ha juzgado. Se crea con lo que dice la oleada y se mueve con `update` en cada
 * fotograma; el fotograma en que pasa por ti devuelve el resultado.
 */
export class ArcCore {
  readonly params: ArcParams;
  /** Medio ancho (m): la cabeza tiene que pasar dentro (el carril). */
  hw: number;
  /** El lado alto de los inclinados y la rueda (x, en la arena): donde hay que llevar la cabeza; 0 en los rectos. */
  leanX = 0;
  drop: number;
  tilt: number;
  jump: boolean;
  plank: boolean;
  low: boolean;
  second: boolean;
  /** La altura de la barra en el centro (en la arena) y su posición por la pista. */
  barY: number;
  z: number;
  /** Inclinados: lo que hay que apartarse al menos hacia el lado alto (0: sin pared de energía en el lado bajo). */
  sideMin: number;
  speed: number;
  /** La rueda: lo que gira, la inclinación en la que se para y cuándo llega a ti (s). */
  spin = 0;
  tiltEnd = 0;
  tReach = 0;
  t = 0;
  warnT = 0;
  /** Valla: lo más alto que llegó la cabeza sobre tu altura de pie mientras pasaba, y si fue un salto (deprisa). */
  maxUp = -1;
  fast = false;
  /** Pasó por tu cabeza dentro del carril; te dio (o te metiste en la pared del lado bajo); el margen más justo. */
  checked = false;
  hit = false;
  sideHit = false;
  minClear = 1;
  judged = false;
  alive = true;
  /** De este fotograma: si te va a dar (para encender la barra y la cortina), si estás en la pared del lado bajo y en el
   * carril, y el pitido de aviso que toca (0: ninguno; si no, su tono). */
  danger = false;
  sideBad = false;
  inLane = false;
  beep = 0;
  /** Al salir, abre la compuerta de enfrente (RepArena: gates[1].openT = 1.6), menos el segundo de un doble. */
  readonly openGate: boolean;

  constructor(p: ArcParams, env: ArcsEnv, arx: ArxFever) {
    this.params = p;
    let drop = p.drop, tilt = p.tilt ?? 0, low = !!p.low;
    const offset = p.offset ?? 0, spin = p.spin ?? 0, jump = !!p.jump, plank = !!p.plank;
    const tl = !!tilt && !spin && !jump && !plank, top = env.calibRef + HEAD_TOP;
    // inclinados: su propia bajada (en el lado alto) y la separación entre los extremos; más separados, el lado alto queda
    // más lejos y hay que cargar más el peso en esa pierna. La barra nunca se mete en el suelo por el lado bajo
    if (tl && env.s('arcTiltDrop') > 0) drop = env.s('arcTiltDrop') / 100 * randIn(env, 0.85, 1.15);
    // de semipuente: más ancho y tan inclinado que el lado bajo va casi a ras de suelo; en el lado alto, apartado al menos
    // 75 cm, la cabeza tiene que quedar a arcLowH del suelo: no se llega sin apoyar una mano en el suelo
    low = low && tl;
    const hw = low ? Math.max(1.1, clamp(env.s('arcTiltW') / 200, 0.7, 1.6)) : tl ? clamp(env.s('arcTiltW') / 200, 0.7, 1.6) : 1;
    const shift = low ? clamp(Math.max(0.75, env.s('arcShift') / 100), 0.15, hw - 0.15) : tl ? clamp(env.s('arcShift') / 100, 0.15, hw - 0.15) : env.s('arcShift') / 100;
    const need = low ? clamp(env.s('arcLowH') / 100, 0.4, 1.2) + HEAD_TOP : 0; // (la barra, en el lado alto: lo alto de la cabeza ahí)
    if (low) {
      tilt = Math.sign(tilt) * Math.atan(Math.max(0.05, need - 0.12) / (shift + hw));
      drop = top - need;
    } else if (tl) tilt = Math.sign(tilt) * Math.min(Math.abs(tilt), Math.atan(Math.max(0.05, top - drop - 0.15) / (shift + hw)));
    this.hw = hw;
    if (tl) this.leanX = Math.sign(tilt) * shift;
    this.drop = drop;
    this.tilt = tilt;
    this.jump = jump;
    this.plank = plank;
    this.low = low;
    this.second = !!p.second;
    this.barY = plank ? clamp(env.s('arcPlankH') / 100, 0.4, 0.9) : jump ? clamp(arcJumpNeed(env) + 0.08, 0.1, 0.45) : low ? need - Math.tan(Math.abs(tilt)) * shift : Math.max(0.4, top - drop - Math.tan(Math.abs(tilt)) * shift);
    this.z = -env.arenaDepth + 0.9 - offset;
    // inclinados: por el lado bajo, del suelo a la barra, una pared de energía que pasa un poco del centro. Agacharse en el
    // centro no vale: hay que apartarse al menos «Apartarse en los inclinados» hacia el lado alto (y bajar sobre esa pierna)
    this.sideMin = tl && !low && env.s('arcSideMin') > 0 ? Math.min(env.s('arcSideMin') / 100, shift - 0.05) : 0;
    this.speed = plank ? arxPlankSpeed(env, arx) : low ? arxSpeed(env, arx) * 0.75 : arxSpeed(env, arx);
    // la rueda: la barra gira mientras llega y se para inclinada (tilt) justo al pasar por ti
    if (spin) {
      this.spin = spin;
      this.tiltEnd = tilt;
      this.tReach = Math.max(0.5, (env.head.z - this.z) / this.speed);
      this.leanX = Math.sign(tilt) * env.s('arcShift') / 100;
    }
    this.openGate = !this.second;
  }

  /** La altura de la barra sobre tu cabeza (en la arena), en x. */
  barAt(x: number): number {
    return this.barY + Math.tan(this.tilt) * clamp(x, -this.hw, this.hw);
  }

  /** Inclinados con pared: de dónde a dónde va la pared del lado bajo (x del extremo bajo y del borde verde del hueco). */
  sideWallX(): [number, number] {
    const sg = Math.sign(this.tilt);
    return [-sg * this.hw, sg * Math.max(0.02, this.sideMin - 0.1)];
  }

  /** Avanza el arco dt segundos con la cabeza donde está ahora (env.head). Devuelve el resultado el fotograma en que se
   * juzga (si la partida está en juego o en el descanso: `playing`), y si no, null. Cuando ya está lejos detrás de ti,
   * `alive` pasa a false: hay que quitarlo. */
  update(dt: number, env: ArcsEnv, playing = true): ArcOutcome | null {
    this.t += dt;
    this.z += this.speed * dt;
    if (this.spin) {
      const tau = Math.max(0, this.tReach - this.t);
      this.tilt = this.tiltEnd + this.spin * tau * Math.min(1, tau / 1.2);
    }
    const H = env.head, hz = H.z, up = H.y - env.calibRef, need = arcJumpNeed(env);
    const inLane = Math.abs(H.x) < this.hw;
    const sideBad = !!this.sideMin && Math.sign(this.tilt) * H.x < this.sideMin; // (en la pared del lado bajo)
    const danger = !this.judged && this.z < hz && this.z > hz - 2.4 && (this.jump ? up < need : sideBad || H.y + HEAD_TOP > this.barAt(H.x) - 0.02);
    this.inLane = inLane;
    this.sideBad = sideBad;
    this.danger = danger;
    this.beep = 0;
    // el pitido de aviso, cada vez más seguido y más agudo según se acerca
    if (danger && inLane) {
      this.warnT -= dt;
      if (this.warnT <= 0) {
        const d = hz - this.z;
        this.warnT = clamp(d * 0.18, 0.08, 0.4);
        this.beep = 1 + (2.4 - d) * 0.25;
      }
    }
    // valla: mientras pasa por debajo de ti (con algo de margen, el salto dura poco) cuenta lo más alto que llegaste
    if (this.jump) {
      if (!this.judged && Math.abs(this.z - hz) < 0.4 && inLane) {
        this.checked = true;
        this.maxUp = Math.max(this.maxUp, up);
        if (env.jumpFastT >= 0 && env.jumpFastT < 0.6) this.fast = true;
      }
    } else if (!this.judged && Math.abs(this.z - hz) < 0.15 && inLane) {
      this.checked = true;
      const top = H.y + HEAD_TOP, b = this.barAt(H.x);
      if (top > b) this.hit = true;
      if (sideBad) this.hit = this.sideHit = true;
      this.minClear = Math.min(this.minClear, b - top);
    }
    let out: ArcOutcome | null = null;
    if (!this.judged && this.z > hz + 0.15) {
      this.judged = true;
      out = this.resolve(env, playing);
    }
    if (this.z > hz + 3.5) this.alive = false;
    return out;
  }

  /** El juicio del arco (RepArena: Arc.resolve), como resultado. Fuera de la partida (ni en juego ni en el descanso), nada. */
  resolve(env: ArcsEnv, playing = true): ArcOutcome | null {
    if (!playing) return null;
    const H = env.head;
    const o: ArcOutcome = { kind: 'lane', perfect: false, say: null, cheer: null, hurt: false, rep: false, scoreBase: 0, sound: null, perfectSound: false, hitPoint: { x: H.x, y: this.barAt(H.x), z: H.z - 0.1 } };
    if (!this.checked) {
      o.say = ['Quédate en el carril', '#ff8a3d', 1.2, true];
      return o;
    }
    if (this.jump) {
      const need = arcJumpNeed(env);
      if (this.maxUp < need || !this.fast) {
        Object.assign(o, { kind: 'jumpFail', hurt: true, sound: 'zap', say: [this.maxUp >= need ? '¡Salta, no te estires!' : '¡Salta!', '#ff3b5c', 1.3, true] });
        return o;
      }
      const perfect = this.maxUp >= need + 0.06;
      Object.assign(o, { kind: 'jumpOk', perfect, rep: true, sound: 'whoosh', perfectSound: perfect, say: [perfect ? '¡PERFECTA!' : '¡Saltado!', perfect ? '#3cf0c6' : '#ffffff', 0.9, false] });
      return o;
    }
    if (this.hit) {
      const msg = this.plank ? '¡Al suelo, en plancha!' : this.low ? `¡Más abajo, con la mano en el suelo, a la ${side(this.tilt)}!` : this.sideHit ? `¡Por el lado alto: apártate a la ${side(this.tilt)} y baja sobre esa pierna!` : this.tilt ? `¡Apártate a la ${side(this.tilt)}!` : '¡Agáchate más!';
      Object.assign(o, { kind: 'hurt', hurt: true, sound: 'zap', say: [msg, '#ff3b5c', 1.3, true] });
      return o;
    }
    const perfect = this.minClear >= 0.06;
    o.sound = 'whoosh';
    if (this.second) {
      Object.assign(o, { kind: 'second', perfect, scoreBase: 150, cheer: ['¡Aguantado!', '#3cf0c6', 1.0] });
      return o;
    }
    Object.assign(o, { kind: 'pass', perfect, rep: true, perfectSound: perfect, say: [perfect ? '¡PERFECTA!' : '¡Esquivado!', perfect ? '#3cf0c6' : '#ffffff', 0.9, false] });
    return o;
  }
}
