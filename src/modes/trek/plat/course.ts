/**
 * El recorrido de la Travesía de plataformas: qué piezas salen en cada tramo, cuánto miden y cuánto sitio hay entre ellas.
 * `buildCourse` encadena las piezas de un tramo, de su principio al cofre, cumpliendo las reglas de separación
 * (`minGap`), que comprueba `courseRules` (y una prueba con miles de recorridos al azar, tests/unit/plat-course.test.ts):
 *
 * - tras un túnel o un muro (`FLOORS`), lo que se recorre en `FLOOR_UP_S` s a velocidad máxima antes de otra cosa;
 * - entre dos saltos seguidos (`JUMPS`), al menos `JUMP_GAP_S` s a velocidad máxima;
 * - tras un obstáculo a un lado, `SIDE_BACK_S` s para volver al centro, y nunca dos obstáculos a un lado seguidos del
 *   mismo lado;
 * - nada pide dos movimientos a la vez (las piezas no se solapan) y un tramo siempre se puede acabar (acaba en su cofre);
 * - la dificultad sube de un tramo a otro, no dentro de él: cada clase de pieza nueva entra al empezar un tramo
 *   (`courseKinds`), y lo que mide cada pieza depende del tramo y del rango, no de por dónde vas.
 *
 * Lógica pura, sin IWSDK.
 */
import { FLOOR_UP_S, FLOORS, JUMP_GAP_S, JUMPS, MIN_GAP, RUN_UP, SIDE_BACK_S, STOP_AT, HALT, LAND_PAST, type Course, type CourseEnv, type Piece, type PieceKind } from './types.js';

/** Las clases de pieza de cada tramo: la primera, lo básico (el tronco, la viga y el hueco); desde el segundo, también el
 * obstáculo a un lado. (Las plataformas, el túnel y el muro llegan con el PR B; los enemigos y las gemas, con el D.) */
export function courseKinds(tramo: number): PieceKind[] {
  const k: PieceKind[] = ['log', 'low', 'gap'];
  if (tramo >= 1) k.push('side');
  return k;
}

/** Lo mínimo (m) entre el final de `prev` (su `at + len`) y el principio de `next` (su `at`), con velocidad máxima `vmax`. */
export function minGap(prev: Piece, next: Piece, vmax: number): number {
  let g = MIN_GAP;
  if (prev.k === 'gap') g += LAND_PAST; // (aterrizas pasado el borde lejano)
  if (HALT.includes(next.k)) g += STOP_AT; // (te paras antes de su borde: ese sitio, libre)
  if (FLOORS.includes(prev.k)) g = Math.max(g, FLOOR_UP_S * vmax);
  if (JUMPS.includes(prev.k) && JUMPS.includes(next.k)) g = Math.max(g, JUMP_GAP_S * vmax);
  if (prev.k === 'side') g = Math.max(g, SIDE_BACK_S * vmax);
  return g;
}

/**
 * Un tramo: desde `start` (donde estás al empezarlo, o el cofre del anterior), la carrera (`RUN_UP`), las piezas de
 * `courseKinds(tramo)` al azar (con `env.rnd`) hasta casi `start + env.len`, y el cofre en `start + env.len`. Los `id`
 * empiezan en `id0` y van seguidos. Cada clase del tramo sale al menos una vez si cabe.
 *
 * Lo que mide cada pieza (sube con el tramo y el rango, nunca a mitad de tramo):
 * - gap: largo de 0,8 m (tramo 0, rango 0) a 1,6 m como mucho;
 * - low: `h` (lo que hay que bajar la coronilla) de 0,22 a 0,34 m;
 * - side: a un lado al azar (nunca dos seguidos del mismo lado);
 * - log y low: `len` 0.
 */
export function buildCourse(env: CourseEnv, tramo: number, rank: number, start: number, id0: number): Course {
  void env;
  void tramo;
  void rank;
  void start;
  void id0;
  void RUN_UP;
  throw new Error('buildCourse: por hacer');
}

/** Las reglas que incumple una lista de piezas en orden (vacía si las cumple todas): para las pruebas y el desarrollador. */
export function courseRules(pieces: Piece[], vmax: number): string[] {
  void pieces;
  void vmax;
  throw new Error('courseRules: por hacer');
}
