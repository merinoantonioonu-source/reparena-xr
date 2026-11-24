/**
 * El asistente del vuelo (elegido por el usuario: «paso a paso con preguntas»; sustituye a la práctica de vuelo, que empezaba
 * sola en pleno vuelo y no se entendía). Posado ante el primer tramo (o en un cofre, si lo pides desde la pausa), con el mundo
 * esperando y volando en el sitio: te explica un movimiento, lo pruebas y ves cómo responde el vuelo, y pregunta «¿Cómo lo has
 * notado?» con tres teclas: Demasiado · Bien · Poco. Demasiado lo hace menos sensible (más recorrido); Poco, más; Bien, al
 * siguiente. Cada respuesta cambia el ajuste de ese movimiento («Vuelo: recorrido de lado»…), y lo pruebas otra vez.
 * Lógica pura, sin IWSDK (se prueba en tests/unit/fly-coach.test.ts); la usa el corredor (runner.ts) y las teclas las pone
 * TrekSystem.
 */
import type { FlyModel } from './fly.js';

/** Lo que se ajusta en cada paso: el ajuste, cuánto en cada respuesta, sus topes y hacia dónde es «menos sensible». */
export interface CoachTune {
  key: string;
  step: number;
  min: number;
  max: number;
  /** +1: más es menos sensible (los recorridos, en cm); −1: más es más fuerte (el aletazo, en %). */
  calmer: 1 | -1;
}

export interface CoachStep {
  key: 'side' | 'alt' | 'pike' | 'roll';
  /** Lo que hay que hacer (el aviso breve, mientras lo pruebas). */
  text: string;
  /** La pregunta (null: sin pregunta; se marca ✓ al hacerlo). */
  ask: string | null;
  tune: CoachTune | null;
}

/** Los pasos, según el mando de altura. */
export function coachSteps(model: FlyModel): CoachStep[] {
  const side: CoachStep = { key: 'side', text: 'Escórate a un lado y al otro: vas de lado', ask: '¿Cómo has notado ir de lado?', tune: { key: 'flySide', step: 3, min: 8, max: 30, calmer: 1 } };
  const alt: CoachStep =
    model === 'flap'
      ? { key: 'alt', text: 'Cada flexión, un aletazo: subes · Abajo quieto: picas', ask: '¿Cómo has notado el aletazo?', tune: { key: 'flyFlap', step: 20, min: 25, max: 250, calmer: -1 } }
      : model === 'pos'
        ? { key: 'alt', text: 'Baja el pecho: bajas · Vuelve arriba: subes', ask: '¿Cómo has notado subir y bajar?', tune: { key: 'flyDown', step: 3, min: 4, max: 35, calmer: 1 } }
        : { key: 'alt', text: 'Brazos estirados: subes · Media flexión: recto · Más abajo: bajas', ask: '¿Cómo has notado subir y bajar?', tune: { key: 'flyDown', step: 3, min: 4, max: 35, calmer: 1 } };
  const pike: CoachStep = { key: 'pike', text: model === 'mid' ? 'Cadera arriba: frenas' : 'Cadera arriba: frenas y subes', ask: '¿Cómo has notado frenar con la cadera arriba?', tune: { key: 'flyUp', step: 3, min: 9, max: 40, calmer: 1 } };
  const roll: CoachStep = { key: 'roll', text: 'Ponte de canto: giras (para las grietas)', ask: null, tune: null };
  return [side, alt, pike, roll];
}

/** Lo mínimo que se prueba cada paso antes de preguntar (s), lo máximo (s: luego se pregunta igual), las veces que se
 * pregunta lo mismo (luego, al siguiente), lo que hay que llegar a hacer para darlo por probado (m, rad) y la pausa entre
 * pasos (s). */
export const COACH_TRY = 5, COACH_TRY_MAX = 20, COACH_ROUNDS = 4, COACH_SIDE = 0.04, COACH_DOWN = 0.05, COACH_BACK = 0.07, COACH_ROLL = 0.7, COACH_ROLL_MAX = 12, COACH_GAP = 1.2;

/** La respuesta: demasiado sensible, bien o poco sensible. */
export type CoachAnswer = 'much' | 'ok' | 'little';

/** Lo que pasa en un fotograma: hay que decir el paso, preguntar, cambiar un ajuste, marcar ✓ o se acabó. */
export type CoachEv =
  | { t: 'say'; text: string; n: number; of: number }
  | { t: 'ask'; text: string }
  | { t: 'set'; key: string; val: number; calmer: boolean; edge: boolean }
  | { t: 'done'; text: string }
  | { t: 'end' }
  | null;

export class FlyCoach {
  steps: CoachStep[] = [];
  /** El paso (−1: sin empezar; steps.length: acabado), su fase y su tiempo. */
  i = -1;
  phase: 'try' | 'ask' | 'gap' = 'try';
  t = 0;
  round = 0;
  /** Lo hecho en este paso (a la derecha, a la izquierda, arriba y abajo, atrás, de canto). */
  private r = false;
  private l = false;
  private hi = false;
  private lo = false;
  private back = false;
  private rollT = 0;
  private said = false;
  private answer: CoachAnswer | null = null;

  get active(): boolean {
    return this.i >= 0 && this.i < this.steps.length;
  }
  get asking(): boolean {
    return this.active && this.phase === 'ask';
  }

  begin(model: FlyModel): void {
    this.steps = coachSteps(model);
    this.i = 0;
    this.round = 0;
    this.answer = null;
    this.startTry();
  }

  stop(): void {
    this.i = -1;
  }

  /** La tecla pulsada (solo cuenta mientras pregunta). */
  answerWith(a: CoachAnswer): void {
    if (this.asking) this.answer = a;
  }

  private startTry(): void {
    this.phase = 'try';
    this.t = 0;
    this.r = this.l = this.hi = this.lo = this.back = false;
    this.rollT = 0;
  }

  /**
   * Un fotograma con lo que lee el vuelo (`side`, `down`, `back` en m; `roll` en rad), la mitad de la flexión (`half`, m) y el
   * valor de cada ajuste (`val`). Devuelve lo que pasa (o null).
   */
  update(dt: number, side: number, down: number, back: number, roll: number, half: number, val: (k: string) => number): CoachEv {
    if (!this.active) return null;
    const S = this.steps[this.i];
    this.t += dt;
    if (this.phase === 'gap') {
      if (this.t < COACH_GAP) return null;
      this.i++;
      this.round = 0;
      if (!this.active) return { t: 'end' };
      this.startTry();
      return this.sayStep();
    }
    if (this.phase === 'try') {
      if (!this.said) return this.sayStep();
      if (side >= COACH_SIDE) this.r = true;
      if (-side >= COACH_SIDE) this.l = true;
      if (down <= Math.max(0.01, half - 0.03)) this.hi = true;
      if (down >= half + 0.03 || down >= COACH_DOWN + half) this.lo = true;
      if (back >= COACH_BACK) this.back = true;
      this.rollT = roll >= COACH_ROLL ? this.rollT + dt : 0;
      if (S.key === 'roll') {
        if (this.rollT > 0.3 || this.t > COACH_ROLL_MAX) {
          this.phase = 'gap';
          this.t = 0;
          return { t: 'done', text: this.rollT > 0.3 ? '✓ Giro' : 'Seguimos' };
        }
        return null;
      }
      const tried = S.key === 'side' ? this.r && this.l : S.key === 'alt' ? this.hi && this.lo : this.back;
      if ((tried && this.t >= COACH_TRY) || this.t >= COACH_TRY_MAX) {
        this.phase = 'ask';
        this.t = 0;
        this.answer = null;
        return { t: 'ask', text: S.ask ?? '' };
      }
      return null;
    }
    // preguntando: espera la tecla
    if (!this.answer) return null;
    const a = this.answer;
    this.answer = null;
    const T = S.tune;
    if (a === 'ok' || !T || this.round + 1 >= COACH_ROUNDS) {
      this.phase = 'gap';
      this.t = 0;
      return { t: 'done', text: a === 'ok' ? '✓ Bien' : 'Seguimos' };
    }
    this.round++;
    const calmer = a === 'much', v0 = val(T.key);
    const v = Math.min(T.max, Math.max(T.min, v0 + (calmer ? 1 : -1) * T.calmer * T.step));
    this.startTry();
    this.said = true; // (lo dice el aviso del cambio: «Menos sensible: pruébalo»)
    return { t: 'set', key: T.key, val: v, calmer, edge: v === v0 };
  }

  private sayStep(): CoachEv {
    this.said = true;
    return { t: 'say', text: this.steps[this.i].text, n: this.i + 1, of: this.steps.length };
  }
}
