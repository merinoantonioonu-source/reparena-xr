/**
 * Cómo se mueven los de tierra, como en RepArena (src/70_game.js: el constructor de Robot, su paso 'walk' y dodgeStep):
 *  - el ritmo de la marcha: acechan andando y, en los últimos metros, cargan corriendo; en total tardan lo que pide «Tiempo
 *    llegada» (gaitPlan);
 *  - su forma de moverse (Ajustes → Cada enemigo: move_*), una de las marcadas: recto, zigzag, a rachas o esquivas. Con
 *    «velocidad al desplazarse» (spd_*) por encima del 100 % van más deprisa, pero llegan igual: lo que les sobra lo gastan
 *    de lado a lado (zigzag) o parados en guardia (recto y a rachas);
 *  - la rapidez de sus gestos (pace_*): salir, amenazar, preparar y dar el golpe, retroceder y esquivar;
 *  - la amenaza a media distancia (taunt): una vez por avance, entre 3 y 7 m de ti, se planta y te ruge;
 *  - las esquivas: se apartan de golpe hacia un lado (con voltereta los que la tienen), de vez en cuando y, a veces, al
 *    recibir un disparo.
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/gait.compare.test.ts.
 */

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Las formas de moverse. */
export type GaitStyle = 'straight' | 'zigzag' | 'bursts' | 'dodge';

export interface GaitPlan {
  /** Desde dónde carga corriendo (m al puesto), y sus velocidades: andando, corriendo y desplazándose (m/s). */
  chargeD: number;
  vWalk: number;
  vRun: number;
  vMove: number;
}

/** El ritmo de su marcha (RepArena: el constructor de Robot). D: lo que tiene hasta su puesto; W: «Tiempo llegada»
 * (s); speedF: lo rápido que es su clase; travel: «velocidad al desplazarse» (1 = la justa para llegar a tiempo). */
export function gaitPlan(D: number, W: number, speedF: number, heavy: boolean, travel: number): GaitPlan {
  const T = Math.max(2, W / speedF - (W >= 10 ? 1.2 : 0));
  const chargeD = Math.min(3.2, D * 0.4);
  let vRun = clamp((2.2 * D) / T, 1.0, 3.2) * (heavy ? 0.85 : 1);
  const walkV = (): number => Math.max(0.05, (D - chargeD) / Math.max(T * 0.4, T - chargeD / vRun));
  let vWalk = walkV();
  vRun = Math.max(vRun, Math.min(5, vWalk * travel * 1.2));
  vWalk = walkV();
  if (vWalk > vRun) vRun = vWalk * 1.3;
  return { chargeD, vWalk, vRun, vMove: vWalk * travel };
}

/** La rapidez de sus gestos (pace_*, en %; los jefes, algo más pausados) y la de desplazarse (spd_*, en %). */
export const paceOf = (pct: number, boss: boolean): number => clamp((pct || 100) / 100, 0.5, 2.5) * (boss ? 0.85 : 1);
export const travelOf = (pct: number): number => clamp((pct || 100) / 100, 1, 3);

/** Lo que cuenta cada enemigo de su forma de moverse. */
export class Gait {
  zigPh: number;
  burstT: number;
  dodgeT: number;
  dodge = 0;
  dodgeDir = 0;
  dodgeDur = 0;
  roll = false;
  taunts = 0;
  tauntT: number;
  /** Lo que da el último paso: la velocidad hacia su puesto y la de lado (zigzag). */
  wantV = 0;
  lat = 0;

  constructor(
    readonly style: GaitStyle,
    readonly plan: GaitPlan,
    readonly pace: number,
    private rnd: () => number = Math.random,
  ) {
    this.tauntT = this.rand(3, 6);
    this.zigPh = this.rand(0, TAU);
    this.burstT = this.rand(0, 1.8);
    this.dodgeT = this.rand(2, 4);
  }

  /** Una de las formas marcadas (move_*: «straight,zigzag»…), al azar (RepArena: pick). */
  static pick(list: string, rnd: () => number = Math.random): GaitStyle {
    const l = String(list || 'straight').split(',');
    return l[Math.floor(rnd() * l.length)] as GaitStyle;
  }

  private rand(a: number, b: number): number {
    return a + this.rnd() * (b - a);
  }

  /** La marcha hacia su puesto (RepArena: Robot.update, 'walk'): d, lo que le falta; out, ya fuera de la compuerta;
   * charged, cargando los últimos metros. Deja wantV (m/s hacia el puesto) y lat (m/s de lado, el zigzag). */
  march(dt: number, d: number, out: boolean, charged: boolean): void {
    const P = this.plan;
    let wantV = (charged ? P.vRun : out ? P.vWalk : P.vMove) * clamp(d / 0.7, 0.3, 1);
    let lat = 0;
    const extra = P.vMove / P.vWalk, free = out && !charged && d > 1.0 && extra > 1.05;
    if (free && this.style === 'zigzag') {
      const L = Math.sqrt(extra * extra - 1), half = clamp(1.1 / (L * wantV + 1e-3), 0.45, 1.6);
      this.zigPh += (dt * Math.PI) / half;
      lat = clamp(Math.sin(this.zigPh) * 2.5, -1, 1) * L * wantV;
    } else if (free) {
      const C = this.style === 'straight' ? 2.6 : this.style === 'bursts' ? 1.4 : 1.8;
      this.burstT = (this.burstT + dt) % C;
      wantV *= this.burstT < C / extra ? extra : 0;
    }
    this.wantV = wantV;
    this.lat = lat;
  }

  /** ¿Toca amenazar? (una vez por avance, con «Tiempo llegada» de 10 s o más, entre 3 y 7 m de ti) */
  tauntNow(dt: number, walkT: number, toPl: number): boolean {
    if (this.taunts || walkT < 10 || toPl <= 3 || toPl >= 7) return false;
    this.tauntT -= dt;
    if (this.tauntT > 0) return false;
    this.taunts++;
    return true;
  }

  /** Las esquivas (RepArena: dodgeStep). ok: puede empezar una (se acerca, fuera de la compuerta, sin cargar, en juego);
   * hit: le acaban de dar y sigue vivo; canRoll: tiene voltereta. Devuelve lo que se aparta de lado en este paso (m, +
   * a la derecha mirándote a ti), o 0. scale: su tamaño. */
  dodgeStep(dt: number, ok: boolean, hit: boolean, canRoll: boolean, scale = 1): number {
    if (this.dodge > 0) {
      const T = this.dodgeDur, k = 1 - this.dodge / T, D = (this.roll ? 1.4 : 0.9) * scale;
      const v = ((D * Math.PI) / (2 * T)) * Math.sin(Math.PI * clamp(k, 0, 1)); // (recorre D metros)
      this.dodge -= dt;
      if (this.dodge <= 0) {
        this.dodge = 0;
        this.roll = false;
      }
      return this.dodgeDir * v * dt;
    }
    if (this.style !== 'dodge' || !ok) return 0;
    this.dodgeT -= dt;
    if (this.dodgeT <= 0 || (hit && this.rnd() < 0.55)) {
      this.dodgeT = this.rand(2.5, 4.5) / Math.max(0.7, this.pace);
      this.roll = canRoll;
      this.dodge = this.dodgeDur = (this.roll ? 0.75 : 0.45) / Math.min(1.8, this.pace);
      this.dodgeDir = this.rnd() < 0.5 ? -1 : 1;
    }
    return 0;
  }

  /** Se ha chocado al esquivar: la acaba ya (RepArena: blocked). */
  stopDodge(): void {
    this.dodge = Math.min(this.dodge, 0.05);
  }
}
