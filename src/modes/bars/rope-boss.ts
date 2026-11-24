/**
 * El jefe de la cuerda del remo invertido (PR 3 de docs/PLAN-BARRAS-CUERDA.md; «el jefe, un águila o el dragón que lanza cosas
 * desde arriba: boca arriba se ven muy bien»): en el último tramo de la ronda, antes de la subida final, el dragón te corta el
 * paso. Se queda delante y por encima de ti y lanza bolas de fuego, con aviso (se echa atrás y ruge):
 *  - **a la cara** (`ball`): apartar la cabeza a un lado cuando llega;
 *  - **rasante por encima del cable** (`sweep`): quedarse abajo, con los brazos estirados, mientras pasa.
 * Tras tres, **se marea** y baja hasta quedarse encima de ti: **un remo explosivo o bajar con la carga aguantada (×2 o más)** le
 * da. A la tercera, derrotado (se va volando). Si no le das mientras está mareado, se recupera y vuelve a lanzar; tras dos
 * veces, vale cualquier remo (la pelea siempre se acaba, como el jefe de la Travesía). Si te da una bola, se rompe la racha,
 * sin vidas. Mientras pelea, no se sube (ni se resbala): `RopeRun.hold`.
 * Lógica pura, sin IWSDK; lo que se ve, src/modes/bars/rope-boss-look.ts.
 */
import type { RopeCourse } from './rope.js';

export const BOSS = {
  /** Lo que tarda en llegar al empezar (s), lo que se echa atrás antes de lanzar (s) y lo que tarda la bola (s). */
  intro: 2.5,
  wind: 0.9,
  fly: 1.6,
  /** Lo que dura el momento en que se juzga cada bola (s) y lo que hay que apartar la cabeza (m) o tenerla abajo (×la subida). */
  judge: { ball: 0.2, sweep: 0.6 } as Record<string, number>,
  side: 0.08,
  low: 0.45,
  /** Bolas por ronda de ataque, lo que dura mareado (s), golpes para derrotarlo y el respiro entre bolas (s). */
  throws: 3,
  dizzy: 5,
  hits: 3,
  rest: 0.7,
  /** Dónde corta el paso: antes de la subida vertical del último tramo (m de cuerda). */
  before: 5,
};

export type BossShot = 'ball' | 'sweep';
export type BossState = 'off' | 'intro' | 'wind' | 'fly' | 'rest' | 'dizzy' | 'down';
export type BossEv = { t: 'appear' } | { t: 'wind'; shot: BossShot } | { t: 'throw'; shot: BossShot } | { t: 'dodge'; shot: BossShot } | { t: 'burn'; shot: BossShot } | { t: 'dizzy' } | { t: 'recover' } | { t: 'hit'; left: number } | { t: 'down' };

/** Lo que mira el jefe de ti, cada fotograma: por dónde vas (m de cuerda), lo subida y apartada que llevas la cabeza, lo que
 * pide la subida, si acabas de hacer un remo explosivo o de bajar con la carga (×2 o más), si acabas de hacer un remo (sea
 * como sea) y si se juega. */
export interface BossEnv {
  s: number;
  up: number;
  req: number;
  side: number;
  strike: boolean;
  rep: boolean;
  playing: boolean;
}

export class RopeBoss {
  st: BossState = 'off';
  t = 0;
  /** Dónde corta el paso (m de cuerda) y en qué tramo (el último). */
  readonly at: number;
  readonly wave: number;
  shot: BossShot = 'ball';
  /** Las bolas que lleva en esta ronda de ataque. */
  thrown = 0;
  private good = 0;
  hits = 0;
  private missed = 0;
  readonly ev: BossEv[] = [];

  constructor(C: RopeCourse) {
    this.wave = C.ends.length - 1;
    const v0 = C.verts[this.wave][0], a = this.wave ? C.ends[this.wave - 1] : 0;
    this.at = Math.max(a + 3, v0 - BOSS.before);
  }

  /** ¿Te corta el paso ahora? (mientras, la cuerda no avanza) */
  get blocking(): boolean {
    return this.st !== 'off' && this.st !== 'down';
  }

  step(dt: number, E: BossEnv): void {
    if (!E.playing) return;
    if (this.st === 'off') {
      if (E.s >= this.at - 0.05) this.go('intro');
      return;
    }
    if (this.st === 'down') return;
    this.t += dt;
    switch (this.st) {
      case 'intro':
        if (this.t >= BOSS.intro) this.windUp();
        break;
      case 'wind':
        if (this.t >= BOSS.wind) {
          this.go('fly');
          this.ev.push({ t: 'throw', shot: this.shot });
        }
        break;
      case 'fly': {
        const j = BOSS.judge[this.shot];
        if (this.t < BOSS.fly) break;
        const ok = this.shot === 'ball' ? Math.abs(E.side) >= BOSS.side : E.up <= Math.max(0.05, E.req * BOSS.low);
        if (ok) this.good += dt;
        // (la rasante quema en cuanto subes; la de la cara da si no te has apartado en su momento)
        if (this.shot === 'sweep' && !ok) return this.shotEnd(false);
        if (this.t >= BOSS.fly + j) this.shotEnd(this.shot === 'ball' ? this.good > 0 : true);
        break;
      }
      case 'rest':
        if (this.t >= BOSS.rest) {
          if (this.thrown >= BOSS.throws) {
            this.go('dizzy');
            this.ev.push({ t: 'dizzy' });
          } else this.windUp();
        }
        break;
      case 'dizzy':
        if (E.strike || (this.missed >= 2 && E.rep)) {
          this.hits++;
          if (this.hits >= BOSS.hits) {
            this.go('down');
            this.ev.push({ t: 'down' });
          } else {
            this.ev.push({ t: 'hit', left: BOSS.hits - this.hits });
            this.thrown = 0;
            this.go('rest');
          }
        } else if (this.t >= BOSS.dizzy) {
          this.missed++;
          this.thrown = 0;
          this.ev.push({ t: 'recover' });
          this.go('rest');
        }
        break;
    }
  }

  private go(st: BossState): void {
    this.st = st;
    this.t = 0;
    if (st === 'intro') this.ev.push({ t: 'appear' });
  }
  private windUp(): void {
    // (por turnos: a la cara, rasante, a la cara…)
    this.shot = this.thrown % 2 === 0 ? 'ball' : 'sweep';
    this.good = 0;
    this.go('wind');
    this.ev.push({ t: 'wind', shot: this.shot });
  }
  private shotEnd(ok: boolean): void {
    this.thrown++;
    this.ev.push({ t: ok ? 'dodge' : 'burn', shot: this.shot });
    this.go('rest');
  }
}

/** Lo que se dice en la pelea: lo que hay que hacer (las órdenes de la pelea con el jefe sí se dicen: regla del usuario). */
export const BOSS_SAY = {
  appear: '¡EL DRAGÓN! Esquiva su fuego',
  burnBall: '¡Te ha dado! Aparta la cabeza',
  burnSweep: '¡Te ha quemado! Quédate abajo',
  dizzy: '¡Mareado! Remo explosivo o carga',
  recover: 'Se ha recuperado…',
  down: '¡DRAGÓN DERROTADO!',
};
