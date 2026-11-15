/**
 * El recorrido de la Travesía de plataformas: qué piezas salen en cada tramo, cuánto miden y cuánto sitio hay entre ellas.
 * `buildCourse` encadena las piezas de un tramo, de su principio al cofre, cumpliendo las reglas de separación
 * (`minGap`), que comprueba `courseRules` (y una prueba con miles de recorridos al azar, tests/unit/plat-course.test.ts):
 *
 * - tras un túnel o un muro (`FLOORS`), lo que se recorre en `FLOOR_UP_S` s a velocidad máxima antes de otra cosa, y
 *   `LAND_PAST` más (el mundo te deja pasado su final);
 * - tras una plataforma, `DROP_ROOM` más (se baja de ella al acabarla); nada se pone encima de una plataforma;
 * - antes de un paso (`HALT`: túnel, muro, cofre), el sitio para frenar suave (`HALT_BRAKE`) hasta quedarte a `STOP_AT`;
 * - entre dos saltos seguidos (`JUMPS`), al menos `JUMP_GAP_S` s a velocidad máxima;
 * - tras un obstáculo a un lado, `SIDE_BACK_S` s para volver al centro, y nunca dos obstáculos a un lado seguidos del
 *   mismo lado;
 * - nada pide dos movimientos a la vez (las piezas no se solapan) y un tramo siempre se puede acabar (acaba en su cofre);
 * - la dificultad sube de un tramo a otro, no dentro de él: cada clase de pieza nueva entra al empezar un tramo
 *   (`courseKinds`), y lo que mide cada pieza depende del tramo y del rango, no de por dónde vas.
 *
 * Lógica pura, sin IWSDK.
 */
import { DROP_ROOM, FLOOR_UP_S, FLOORS, HALT_BRAKE, JUMP_GAP_S, JUMPS, MIN_GAP, RUN_UP, SIDE_BACK_S, STOP_AT, HALT, LAND_PAST, piece, type Course, type CourseEnv, type Piece, type PieceKind } from './types.js';

/** Las clases de pieza de cada tramo: la primera, lo básico (el tronco, la viga y el hueco); desde el segundo, también el
 * obstáculo a un lado y la plataforma; desde el tercero, el túnel de flexiones y el muro de burpee. (Los enemigos y las
 * gemas llegan con el PR D.) */
export function courseKinds(tramo: number): PieceKind[] {
  const k: PieceKind[] = ['log', 'low', 'gap'];
  if (tramo >= 1) k.push('side', 'step');
  if (tramo >= 2) k.push('crawl', 'burpee');
  return k;
}

/** Lo que miden el túnel y el muro a lo largo del sendero (m). */
const CRAWL_LEN = 2;
const BURPEE_LEN = 0.5;

/** Lo mínimo (m) entre el final de `prev` (su `at + len`) y el principio de `next` (su `at`), con velocidad máxima `vmax`. */
export function minGap(prev: Piece, next: Piece, vmax: number): number {
  let g = MIN_GAP;
  if (prev.k === 'gap') g += LAND_PAST; // (aterrizas pasado el borde lejano)
  if (HALT.includes(next.k)) g += STOP_AT; // (te paras antes de su borde: ese sitio, libre)
  // (para frenar suave a HALT_BRAKE hasta quedarte a STOP_AT de su borde, y un metro de colchón)
  if (HALT.includes(next.k)) g = Math.max(g, STOP_AT + (vmax * vmax) / (2 * HALT_BRAKE) + 1);
  if (FLOORS.includes(prev.k)) g = Math.max(g, FLOOR_UP_S * vmax + LAND_PAST); // (levantarte, y el mundo te deja pasado su final)
  if (JUMPS.includes(prev.k) && JUMPS.includes(next.k)) g = Math.max(g, JUMP_GAP_S * vmax);
  if (prev.k === 'side') g = Math.max(g, SIDE_BACK_S * vmax);
  if (prev.k === 'step') g += DROP_ROOM; // (lo último, encima de todo lo demás: se baja de la plataforma al acabarla)
  return g;
}

/**
 * Un tramo: desde `start` (donde estás al empezarlo, o el cofre del anterior), la carrera (`RUN_UP`), las piezas de
 * `courseKinds(tramo)` al azar (con `env.rnd`) hasta casi `start + env.len`, y el cofre en `start + env.len`. Los `id`
 * empiezan en `id0` y van seguidos. Cada clase del tramo sale al menos una vez (las primeras, más juntas: caben todas en
 * el tramo más corto, de 40 m).
 *
 * Lo que mide cada pieza (sube con el tramo y el rango, nunca a mitad de tramo):
 * - gap: largo de 0,8 m (tramo 0, rango 0) a 1,6 m como mucho;
 * - low: `h` (lo que hay que bajar la coronilla) de 0,22 a 0,34 m;
 * - side: a un lado al azar (nunca dos seguidos del mismo lado);
 * - step (plataforma): `h` (lo que sube el suelo) de 0,25 m (tramo 1, rango 0) a 0,5 m, y `len` (lo de arriba) de 4 a 9 m;
 * - crawl (túnel de flexiones): `n` flexiones de 2 (tramo 2, rango 0) a 5, y `len` 2 m;
 * - burpee (muro): `len` 0,5 m y `h` (su altura) de 0,6 a 0,8 m;
 * - log y low: `len` 0.
 */
export function buildCourse(env: CourseEnv, tramo: number, rank: number, start: number, id0: number): Course {
  const rand = (a: number, b: number): number => a + (b - a) * env.rnd();
  const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
  const kinds = courseKinds(tramo);
  const end = start + env.len;
  // (el cofre se prueba con id 0 solo para medir el sitio que pide: su id verdadero va al final, tras la última pieza)
  const probe = piece(0, 'chest', end, tramo);
  // Primero cada clase una vez, en orden aleatorio (Fisher-Yates); agotadas, al azar entre ellas.
  const queue = kinds.slice();
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(env.rnd() * (i + 1));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  const pieces: Piece[] = [];
  for (;;) {
    // (las de la cola, las que aún no han salido en el tramo, van más juntas: así caben todas aunque el tramo sea corto)
    const intro = queue.length > 0;
    const k = queue.pop() ?? kinds[Math.floor(env.rnd() * kinds.length)]!;
    const prev = pieces[pieces.length - 1];
    const id = id0 + pieces.length;
    let p: Piece;
    if (k === 'gap') {
      const len = clamp(0.8 + 0.12 * tramo + 0.05 * rank + rand(-0.1, 0.1), 0.8, 1.6);
      p = piece(id, k, 0, tramo, { len });
    } else if (k === 'low') {
      const h = clamp(0.22 + 0.015 * tramo + 0.01 * rank + rand(0, 0.04), 0.22, 0.34);
      p = piece(id, k, 0, tramo, { h });
    } else if (k === 'side') {
      // Dos seguidos, a lados opuestos: así no se puede quedar uno a cada lado esperando lo mismo.
      const side: -1 | 1 = prev?.k === 'side' ? (prev.side === 1 ? -1 : 1) : env.rnd() < 0.5 ? -1 : 1;
      p = piece(id, k, 0, tramo, { side });
    } else if (k === 'step') {
      const h = clamp(0.25 + 0.02 * Math.max(0, tramo - 1) + 0.01 * rank + rand(0, 0.04), 0.25, 0.5);
      const len = clamp(4 + 0.4 * Math.max(0, tramo - 1) + 0.25 * rank + rand(0, 1.5), 4, 9);
      p = piece(id, k, 0, tramo, { h, len });
    } else if (k === 'crawl') {
      const n = clamp(Math.floor(2 + 0.4 * Math.max(0, tramo - 2) + 0.2 * rank + rand(0, 1)), 2, 5);
      p = piece(id, k, 0, tramo, { n, len: CRAWL_LEN });
    } else if (k === 'burpee') {
      const h = clamp(0.6 + 0.01 * tramo + 0.01 * rank + rand(0, 0.04), 0.6, 0.8);
      p = piece(id, k, 0, tramo, { h, len: BURPEE_LEN });
    } else {
      p = piece(id, k, 0, tramo);
    }
    if (prev) {
      // Sitio de más al azar, algo menos en los tramos altos: más piezas, más apretado (nunca bajo el mínimo).
      const extra = intro ? rand(0.5, 2) : rand(4, 10) - Math.min(2, 0.4 * tramo);
      p.at = prev.at + prev.len + minGap(prev, p, env.vmax) + extra;
    } else {
      // (hasta 3 m de más, no 4: con el sitio de frenada ante el cofre, el peor azar del tramo de 40 m a vmax 4,8 ya no cabía)
      p.at = start + RUN_UP + rand(0, 3);
    }
    // Si tras ella no cabe el sitio que pide el cofre, el tramo ya está lleno.
    if (p.at + p.len + minGap(p, probe, env.vmax) > end) break;
    pieces.push(p);
  }
  pieces.push(piece(id0 + pieces.length, 'chest', end, tramo));
  return { pieces, end };
}

export function courseRules(pieces: Piece[], vmax: number): string[] {
  const out: string[] = [];
  const eps = 1e-9;
  const last = pieces[pieces.length - 1];
  if (!last || last.k !== 'chest') out.push(last ? `La última pieza (id ${last.id}) es «${last.k}»: debería ser el cofre` : 'No hay piezas: falta el cofre al final');
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (p.k === 'side' && p.side === 0) out.push(`La pieza ${p.id} (side) no tiene lado (side 0): debería ser −1 o 1`);
    if (p.k === 'gap' && (p.len < 0.8 - eps || p.len > 1.6 + eps)) out.push(`El hueco ${p.id} mide ${p.len.toFixed(3)} m: debe medir entre 0,8 y 1,6 m`);
    if (p.k === 'low' && (p.h < 0.22 - eps || p.h > 0.34 + eps)) out.push(`La viga ${p.id} pide bajar ${p.h.toFixed(3)} m: debe pedir entre 0,22 y 0,34 m`);
    if (p.k === 'step') {
      if (p.len <= 0) out.push(`La plataforma ${p.id} no tiene largo (len ${p.len.toFixed(3)}): debe medir más de 0 m`);
      if (p.len < 4 - eps || p.len > 9 + eps) out.push(`La plataforma ${p.id} mide ${p.len.toFixed(3)} m de largo: debe medir entre 4 y 9 m`);
      if (p.h < 0.25 - eps || p.h > 0.5 + eps) out.push(`La plataforma ${p.id} sube ${p.h.toFixed(3)} m: debe subir entre 0,25 y 0,5 m`);
    }
    if (p.k === 'crawl') {
      if (!Number.isInteger(p.n) || p.n < 2 || p.n > 5) out.push(`El túnel ${p.id} pide ${p.n} flexiones: deben ser entre 2 y 5`);
      if (Math.abs(p.len - CRAWL_LEN) > eps) out.push(`El túnel ${p.id} mide ${p.len.toFixed(3)} m: debe medir ${CRAWL_LEN} m`);
    }
    if (p.k === 'burpee') {
      if (Math.abs(p.len - BURPEE_LEN) > eps) out.push(`El muro ${p.id} mide ${p.len.toFixed(3)} m de grosor: debe medir ${BURPEE_LEN} m`);
      if (p.h < 0.6 - eps || p.h > 0.8 + eps) out.push(`El muro ${p.id} mide ${p.h.toFixed(3)} m de alto: debe medir entre 0,6 y 0,8 m`);
    }
    const prev = pieces[i - 1];
    if (!prev) continue;
    if (p.at <= prev.at) {
      out.push(`Fuera de orden: la pieza ${p.id} (at ${p.at.toFixed(2)}) no va después de la ${prev.id} (at ${prev.at.toFixed(2)})`);
      continue; // (sin orden no tiene sentido medir el sitio entre ellas)
    }
    const room = p.at - (prev.at + prev.len);
    const need = minGap(prev, p, vmax);
    if (room < need - eps) out.push(`Las piezas ${prev.id} (${prev.k}) y ${p.id} (${p.k}) están demasiado juntas: ${room.toFixed(2)} m de sitio y piden ${need.toFixed(2)} m`);
    if (prev.k === 'side' && p.k === 'side' && prev.side === p.side) out.push(`Las piezas ${prev.id} y ${p.id} son dos side seguidos del mismo lado (${p.side})`);
  }
  return out;
}
