/**
 * Lo que hace el cuerpo en la Travesía de plataformas, sacado de la cabeza fotograma a fotograma (como el salto de Arcos,
 * `jumpTrack`, y el paso a un lado de los arcos inclinados): si estás en el aire, cuánto has subido o bajado sobre tu altura
 * de pie y cuánto te has apartado del centro. Sin temporizadores ocultos: todo avanza con `dt`.
 *
 * - **Salto**: la cabeza sube «Altura del salto de las vallas» (Arcos, `arcJumpH`) sobre tu altura de pie y deprisa (la
 *   velocidad hacia arriba pasó de 0,6 m/s, ya sobre tu altura de pie, hace menos de 0,6 s): ponerse de puntillas despacio no
 *   vale, ni tras levantarte deprisa de una sentadilla. `takeoff` es el
 *   fotograma en que despegas; `air`, mientras sigues arriba (hasta bajar a 4 cm de tu altura de pie).
 * - **Agacharse**: lo que baja la coronilla bajo tu altura de pie (`down`).
 * - **A un lado**: lo que se aparta la cabeza del centro (`dx`, + a la derecha). El centro sigue despacio a la cabeza (si te
 *   vas moviendo por la habitación), salvo mientras se acerca un obstáculo a un lado (`hold`): ahí se queda quieto.
 * - **En el suelo** (`plank`): la cabeza, por debajo de la altura del arco de plancha de Arcos (más 10 cm).
 * - **Sentadilla honda** (`deepT`): cuánto hace que la cabeza bajó lo que pide la sentadilla honda (`deepNeed`); el
 *   supersalto de las plataformas altas la pide justo antes del salto.
 * - **De pie** (`standing`): la cabeza, a menos de 12 cm de tu altura de pie.
 *
 * Lógica pura, sin IWSDK (se prueba con trazas de cabeza en tests/unit/plat-runner.test.ts).
 */

/** Los umbrales (de los ajustes de Arcos: los mismos que ya conoces de las vallas y los inclinados). */
export interface MoveCfg {
  /** Lo que hay que subir la cabeza para que cuente como salto (m). */
  jumpH: number;
  /** Lo que hay que apartar la cabeza del centro para librar un obstáculo a un lado (m). */
  sideNeed: number;
  /** Por debajo de esta altura de la cabeza (m sobre el suelo de la habitación), estás en el suelo (en plancha). */
  plankY: number;
  /** Lo que baja y sube la cabeza en una flexión (m). */
  pushNeed: number;
  /** Lo que baja la cabeza en una sentadilla honda (m; lo pone la marcha, con la dificultad creciente). */
  deepNeed: number;
}

/** Los umbrales con los ajustes: el salto, el de las vallas (6 cm de serie); el lado, tres cuartos del «Desplazamiento
 * lateral» de los inclinados (40 cm de serie: 30 cm de cabeza, un paso corto de verdad), entre 15 y 40 cm. */
export function moveCfg(s: (key: string) => number, out: MoveCfg = { jumpH: 0.06, sideNeed: 0.3, plankY: 0.7, pushNeed: 0.1, deepNeed: 0.2 }): MoveCfg {
  out.jumpH = Math.max(0.02, (s('arcJumpH') || 6) / 100);
  out.sideNeed = Math.min(0.4, Math.max(0.15, ((s('arcShift') || 40) / 100) * 0.75));
  out.plankY = Math.min(0.9, Math.max(0.4, (s('arcPlankH') || 60) / 100)) + 0.1;
  out.pushNeed = Math.max(0.06, ((s('pushDepth') || 13) / 100) * 0.8);
  return out;
}

/** De pie: la cabeza, a menos de esto bajo tu altura de pie (m). */
export const STAND_TOL = 0.12;

/** La velocidad hacia arriba que hace un salto (m/s) y cuánto vale después (s). (Arcos: jumpTrack y `jumpFastT < 0.6`.) */
export const JUMP_VY = 0.6;
export const JUMP_FRESH = 0.6;
/** El suavizado de la velocidad vertical (s): a 72 imágenes por segundo deja mitad de la anterior y mitad de la nueva. */
export const VY_TAU = 1 / 72 / Math.LN2;
/** Lo que tarda el centro en seguir a la cabeza (s): despacio, para que un paso a un lado no se borre solo. */
export const CENTER_TAU = 4;

export class BodyMoves {
  /** Tu altura de pie (los ojos) y el centro (x de la cabeza en la arena). */
  ref = 1.6;
  x0 = 0;
  /** El centro no se mueve (se acerca un obstáculo a un lado). */
  hold = false;
  /** De este fotograma: lo que sube la cabeza sobre tu altura de pie (m), lo que baja (m) y lo que se aparta (m, + derecha). */
  up = 0;
  down = 0;
  dx = 0;
  /** La velocidad vertical de la cabeza (m/s, suavizada) y cuánto hace que subió deprisa (s). */
  vy = 0;
  fastT = 9;
  /** En el aire (tras un salto) y el fotograma del despegue. */
  air = false;
  takeoff = false;
  /** En el suelo (en plancha). */
  plank = false;
  /** Cuánto hace que la cabeza bajó como en una sentadilla honda (s). */
  deepT = 9;
  /** De pie. */
  standing = true;
  private lastY = NaN;

  /** Al calibrar o empezar la ronda: tu altura de pie y el centro. */
  reset(ref: number, x0: number): void {
    this.ref = ref;
    this.x0 = x0;
    this.hold = false;
    this.up = this.down = this.dx = this.vy = 0;
    this.fastT = 9;
    this.air = this.takeoff = false;
    this.plank = false;
    this.deepT = 9;
    this.standing = true;
    this.lastY = NaN;
  }

  /** Un fotograma con la cabeza donde está ahora. */
  update(dt: number, head: { x: number; y: number; z: number }, cfg: MoveCfg): void {
    const y = head.y;
    // (lo reciente se mide al principio de este fotograma: si los fotogramas llegan a saltos, el despegue visto en el anterior
    // sigue valiendo aunque este tarde más de JUMP_FRESH en llegar)
    let fresh = this.fastT < JUMP_FRESH;
    if (dt > 0) {
      const v = Number.isNaN(this.lastY) ? 0 : (y - this.lastY) / dt;
      // (suavizado igual a cualquier ritmo: a 72 imágenes por segundo, mitad y mitad, como en Arcos)
      const a = 1 - Math.exp(-dt / VY_TAU);
      this.vy += (v - this.vy) * a;
      // (solo cuenta subir deprisa ya por encima de tu altura de pie, 1 cm: levantarte rápido de una sentadilla y ponerte luego de
      // puntillas no es un salto)
      this.fastT = this.vy > JUMP_VY && y - this.ref > 0.01 ? 0 : this.fastT + dt;
      if (this.fastT === 0) fresh = true;
      if (!this.hold) this.x0 += (head.x - this.x0) * Math.min(1, dt / CENTER_TAU);
    }
    this.lastY = y;
    this.up = y - this.ref;
    this.down = this.ref - y;
    this.dx = head.x - this.x0;
    this.takeoff = false;
    if (!this.air) {
      if (this.up > cfg.jumpH && fresh) this.air = this.takeoff = true;
    } else if (this.up < 0.04) this.air = false;
    this.standing = this.up > -STAND_TOL;
    this.plank = y < cfg.plankY;
    this.deepT = this.down >= cfg.deepNeed ? 0 : this.deepT + Math.max(0, dt);
  }

  /** ¿La coronilla pasa bajo una viga que obliga a bajarla `need` m? (Con 2 cm de margen, como los arcos.) */
  under(need: number): boolean {
    return this.down >= need - 0.02;
  }

  /** ¿La cabeza libra un obstáculo que está al lado `side` (−1 izquierda, 1 derecha)? Tiene que estar al otro lado. */
  clear(side: -1 | 1, cfg: MoveCfg): boolean {
    return -side * this.dx >= cfg.sideNeed;
  }
}
