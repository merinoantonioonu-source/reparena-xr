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
 * **En plancha** (`prone`: la Travesía con flexiones, elegido por el usuario), la altura de referencia es la de la cabeza arriba
 * de la plancha (los brazos estirados) y cada cosa se lee así:
 * - **Agacharse** (las vigas, los picados, los tajos, la bala alta) y **aguantar abajo** (el túnel, el barranco): la cabeza,
 *   abajo en la flexión (`lowNeed`, tres cuartos de lo que baja una flexión): `under` y `plank`.
 * - **Saltar** (huecos, troncos, calaveras, la bala baja…): una **flexión explosiva**, subiendo de golpe (la cabeza, a más de
 *   `PRONE_VY`) hasta arriba: `takeoff` y `air` (`PRONE_AIR` s).
 * - **Supersalto** (plataformas altas, trampolín, el jefe mareado): **dos explosivas seguidas** (`deepT`: cuánto hace que
 *   hiciste una explosiva menos de `PAIR_T` s después de otra).
 * - **A un lado**: escorarte (`dx`, con el lado de la plancha: `sideNeed` lo pone la marcha).
 * - **Adelante** (`fwd`): echar el peso hacia delante (la cabeza, por delante de su sitio): el acelerón.
 *
 * Lógica pura, sin IWSDK (se prueba con trazas de cabeza en tests/unit/plat-runner.test.ts).
 */

/** Los umbrales (de los ajustes de Arcos: los mismos que ya conoces de las vallas y los inclinados). */
export interface MoveCfg {
  /** En plancha: lo que hay que bajar la cabeza para que cuente como agachado o abajo (m). */
  lowNeed: number;
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
export function moveCfg(s: (key: string) => number, out: MoveCfg = { jumpH: 0.06, sideNeed: 0.3, plankY: 0.7, pushNeed: 0.1, deepNeed: 0.2, lowNeed: 0.08 }): MoveCfg {
  out.jumpH = Math.max(0.02, (s('arcJumpH') || 6) / 100);
  out.sideNeed = Math.min(0.4, Math.max(0.15, ((s('arcShift') || 40) / 100) * 0.75));
  out.plankY = Math.min(0.9, Math.max(0.4, (s('arcPlankH') || 60) / 100)) + 0.1;
  out.pushNeed = Math.max(0.06, ((s('pushDepth') || 13) / 100) * 0.8);
  out.lowNeed = Math.max(0.05, ((s('pushDepth') || 13) / 100) * 0.6);
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
/** En plancha: la velocidad hacia arriba de una flexión explosiva (m/s; una normal no pasa de 0,35), lo cerca de arriba que
 * tiene que llegar la cabeza (m), lo que dura «en el aire» (s), lo que puede pasar entre dos explosivas para que sean un
 * supersalto (s) y lo que hay que echar la cabeza adelante para el acelerón (m). Lo que hay que escorarse, una fracción del
 * paso a un lado de pie (`PRONE_SIDE_K`; como poco `PRONE_SIDE_MIN` m). */
export const PRONE_VY = 0.5, PRONE_TOP = 0.04, PRONE_AIR = 0.45, PAIR_T = 1.6, PRONE_FWD = 0.09, PRONE_SIDE_K = 0.35, PRONE_SIDE_MIN = 0.08;

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
  /** En plancha (la Travesía con flexiones): cambia cómo se lee cada cosa (ver arriba). */
  prone = false;
  /** Lo que se echa la cabeza hacia delante de su sitio (m; en plancha, el acelerón). */
  fwd = 0;
  z0 = 0;
  private lastY = NaN;
  /** En plancha: lo que llevas «en el aire» tras una explosiva, desde la última explosiva y desde la última de dos seguidas (s). */
  private airT = 9;
  private boostT = 9;
  private pairT = 9;
  private lowNeed = 0.08;

  /** Al calibrar o empezar la ronda: tu altura de pie y el centro. */
  reset(ref: number, x0: number, z0 = 0): void {
    this.ref = ref;
    this.x0 = x0;
    this.z0 = z0;
    this.fwd = 0;
    this.airT = this.boostT = this.pairT = 9;
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
      if (!this.hold) {
        this.x0 += (head.x - this.x0) * Math.min(1, dt / CENTER_TAU);
        this.z0 += (head.z - this.z0) * Math.min(1, dt / CENTER_TAU);
      }
    }
    this.lastY = y;
    if (this.prone) {
      this.proneUpdate(dt, head, cfg);
      return;
    }
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

  /** En plancha: cada fotograma (la velocidad vertical y el centro ya puestos). */
  private proneUpdate(dt: number, head: { x: number; y: number; z: number }, cfg: MoveCfg): void {
    const y = head.y, d = Math.max(0, dt);
    this.lowNeed = cfg.lowNeed;
    this.down = this.ref - y;
    this.dx = head.x - this.x0;
    this.fwd = this.z0 - head.z; // (delante es −z)
    this.takeoff = false;
    // la explosiva: subiendo de golpe hasta arriba (cerca de la altura de los brazos estirados)
    this.fastT = this.vy > PRONE_VY ? 0 : this.fastT + d;
    this.airT += d;
    this.boostT += d;
    this.pairT += d;
    if (!this.air && this.fastT < JUMP_FRESH && y > this.ref - PRONE_TOP) {
      this.air = this.takeoff = true;
      this.airT = 0;
      // (dos seguidas: el supersalto)
      if (this.boostT < PAIR_T) this.pairT = 0;
      this.boostT = 0;
    } else if (this.air && this.airT > PRONE_AIR) this.air = false;
    // (lo que sube la cabeza: en el aire, lo que vale un salto; si no, nunca lo bastante —levantar la cabeza para mirar no es
    // saltar—)
    const up = y - this.ref;
    this.up = this.air ? Math.max(up, cfg.jumpH + 0.005) : Math.min(up, cfg.jumpH - 0.005);
    this.standing = false;
    this.plank = this.down >= this.lowNeed;
    this.deepT = this.pairT;
  }

  /** ¿La coronilla pasa bajo una viga que obliga a bajarla `need` m? (Con 2 cm de margen, como los arcos.) En plancha, abajo
   * en la flexión, sea la viga que sea. */
  under(need: number): boolean {
    if (this.prone) return this.down >= this.lowNeed;
    return this.down >= need - 0.02;
  }

  /** ¿La cabeza libra un obstáculo que está al lado `side` (−1 izquierda, 1 derecha)? Tiene que estar al otro lado. */
  clear(side: -1 | 1, cfg: MoveCfg): boolean {
    return -side * this.dx >= cfg.sideNeed;
  }
}
