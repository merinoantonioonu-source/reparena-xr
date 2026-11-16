/**
 * El recorrido de la Travesía de plataformas: qué piezas salen en cada tramo, cuánto miden y cuánto sitio hay entre ellas.
 * `buildCourse` encadena las piezas de un tramo, de su principio al cofre, cumpliendo las reglas de separación
 * (`minGap`), que comprueba `courseRules` (y una prueba con miles de recorridos al azar, tests/unit/plat-course.test.ts):
 *
 * - tras un túnel (`FLOORS`), lo que se recorre en `FLOOR_UP_S` s a velocidad máxima antes de otra cosa, y `LAND_PAST`
 *   más (el mundo te deja pasado su final); salvo la plataforma de su burpee, que llega justo `BURPEE_GAP_S` s después;
 * - tras una plataforma, `DROP_ROOM` más (se baja de ella al acabarla); nada se pone encima de una plataforma;
 * - antes del cofre (`HALT`), el sitio para frenar suave (`HALT_BRAKE`) hasta quedarte a `STOP_AT`;
 * - antes de un túnel, lo que se recorre en 3,5 s a velocidad máxima (hay que echarse al suelo con tiempo);
 * - entre dos saltos seguidos (`JUMPS`), al menos `JUMP_GAP_S` s a velocidad máxima;
 * - tras una fruta o un cangrejo, `SIDE_BACK_S` s para volver al centro (dos seguidos pueden ir al mismo lado o al otro);
 * - tras la seta o el cangrejo, `FOE_WALK` m más (salen más allá de su sitio y andan hacia ti hasta él: los encuentras entre
 *   `at` y `at + FOE_WALK`);
 * - nada pide dos movimientos a la vez (las piezas no se solapan) y un tramo siempre se puede acabar (acaba en su cofre);
 * - la dificultad sube de un tramo a otro, no dentro de él: cada clase de pieza nueva entra al empezar un tramo
 *   (`courseKinds`), y lo que mide cada pieza depende del tramo y del rango, no de por dónde vas.
 *
 * Lógica pura, sin IWSDK.
 */
import { BURPEE_GAP_S, DROP_ROOM, FOE_WALK, TUNE_DEF, TUNE_UP, type PlatTune, FLOOR_UP_S, FLOORS, HALT_BRAKE, JUMP_GAP_S, JUMPS, MIN_GAP, RUN_UP, SIDE_BACK_S, STOP_AT, HALT, LAND_PAST, piece, type Course, type CourseEnv, type Piece, type PieceKind } from './types.js';

/** Las clases de la lista de cada tramo: la primera, lo básico (el tronco, la viga y el hueco); desde el segundo, también
 * la fruta, la plataforma alta y la seta (que se pisa); desde el tercero, el túnel, el burpee y el cangrejo (que se esquiva
 * a un lado: los obstáculos a un lado son siempre enemigos, elegido por el usuario). Ojo: `burpee` no es una pieza, es un
 * segmento de dos (un túnel y, `BURPEE_GAP_S` después, una plataforma con `burpee`): en el recorrido no hay piezas de esa
 * clase. (Las gemas del plan son las frutas.) */
export function courseKinds(tramo: number): PieceKind[] {
  const k: PieceKind[] = ['log', 'low', 'gap'];
  if (tramo >= 1) k.push('fruit', 'step', 'foe');
  if (tramo >= 2) k.push('crawl', 'burpee', 'side');
  return k;
}

/** La antelación con la que hay que echarse al suelo ante un túnel (s a velocidad máxima). */
const CRAWL_WARN_S = 3.5;
/** La probabilidad de que una fruta sea la especial (como mucho una por tramo). */
const SPECIAL_P = 0.15;

/** Lo mínimo (m) entre el final de `prev` (su `at + len`) y el principio de `next` (su `at`), con velocidad máxima `vmax`. */
export function minGap(prev: Piece, next: Piece, vmax: number): number {
  // La plataforma de su burpee llega a un hueco fijo del túnel (sin azar ni nada más).
  if (prev.k === 'crawl' && next.k === 'step' && next.burpee) return BURPEE_GAP_S * vmax;
  let g = MIN_GAP;
  if (prev.k === 'gap') g += LAND_PAST; // (aterrizas pasado el borde lejano)
  if (HALT.includes(next.k)) g += STOP_AT; // (te paras antes de su borde: ese sitio, libre)
  // (para frenar suave a HALT_BRAKE hasta quedarte a STOP_AT de su borde, y un metro de colchón)
  if (HALT.includes(next.k)) g = Math.max(g, STOP_AT + (vmax * vmax) / (2 * HALT_BRAKE) + 1);
  if (FLOORS.includes(prev.k)) g = Math.max(g, FLOOR_UP_S * vmax + LAND_PAST); // (levantarte, y el mundo te deja pasado su final)
  if (JUMPS.includes(prev.k) && JUMPS.includes(next.k)) g = Math.max(g, JUMP_GAP_S * vmax);
  if (prev.k === 'fruit' || prev.k === 'side') g = Math.max(g, SIDE_BACK_S * vmax); // (volver al centro)
  if (prev.k === 'foe' || prev.k === 'side') g += FOE_WALK; // (lo encuentras hasta FOE_WALK m más allá de su sitio)
  if (next.k === 'crawl') g = Math.max(g, CRAWL_WARN_S * vmax); // (echarse al suelo con tiempo)
  if (prev.k === 'step') g += DROP_ROOM; // (lo último, encima de todo lo demás: se baja de la plataforma al acabarla)
  return g;
}

/**
 * Un tramo: desde `start` (donde estás al empezarlo, o el cofre del anterior), la carrera (`RUN_UP`), las piezas de
 * `courseKinds(tramo)` al azar (con `env.rnd`) hasta casi `start + env.len`, y el cofre en `start + env.len`. Los `id`
 * empiezan en `id0` y van seguidos. Cada clase del tramo sale al menos una vez (las primeras, más juntas: caben todas en
 * el tramo más corto, de 40 m).
 *
 * Lo que mide cada pieza (sube con el tramo y con la tabla de dificultad, `env.tune`, que va por rango; nunca a mitad de
 * tramo):
 * - gap: largo de `tune.gap` (tramo 0) a `tune.gap + 0,8` m como mucho;
 * - low: `h` (lo que hay que bajar la coronilla) de `tune.duck` a `tune.duck + 0,12` m;
 * - step (plataforma alta de supersalto): `h` (lo que sube el suelo) de `tune.high` (tramo 1) a `tune.high + 0,7` m, y
 *   `len` (lo de arriba) de 4 a 9 m (más largas con el rango);
 * - burpee (segmento): un crawl y, `BURPEE_GAP_S * vmax` m después, una step con `burpee = true`: `h` de 0,6 a 1,0 m y
 *   `len` de 4 a 7 m;
 * - crawl (túnel cubierto, en plancha): `len` de `tune.tunnel` a `tune.tunnel + 3` m (más largo con el tramo) y `n` = 0;
 * - el sitio de más entre piezas, por `tune.space` (nunca menos que `minGap`);
 * - fruit: a un lado al azar; especial con probabilidad 0,15, como mucho una por tramo;
 * - log y low: `len` 0.
 */
export function buildCourse(env: CourseEnv, tramo: number, rank: number, start: number, id0: number): Course {
  const rand = (a: number, b: number): number => a + (b - a) * env.rnd();
  const T = env.tune ?? TUNE_DEF;
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
  let special = false; // (ya salió la fruta especial de este tramo)
  const tp = Math.max(0, tramo - 1); // (tramos de plataforma)
  const tc = Math.max(0, tramo - 2); // (tramos de túnel)
  const crawlPiece = (id: number): Piece => {
    const len = clamp(T.tunnel + 0.3 * tc + rand(0, 0.5), T.tunnel, T.tunnel + TUNE_UP.tunnel);
    return piece(id, 'crawl', 0, tramo, { len, n: 0 });
  };
  for (;;) {
    // (las de la cola, las que aún no han salido en el tramo, van más juntas: así caben todas aunque el tramo sea corto)
    const intro = queue.length > 0;
    const k = queue.pop() ?? kinds[Math.floor(env.rnd() * kinds.length)]!;
    const prev = pieces[pieces.length - 1];
    const id = id0 + pieces.length;
    // Lo que sale ahora: una pieza o, el burpee, dos (el túnel y su plataforma).
    const seg: Piece[] = [];
    if (k === 'gap') {
      const len = clamp(T.gap + 0.12 * tramo + rand(-0.1, 0.1), T.gap, T.gap + TUNE_UP.gap);
      seg.push(piece(id, k, 0, tramo, { len }));
    } else if (k === 'low') {
      const h = clamp(T.duck + 0.015 * tramo + rand(0, 0.04), T.duck, T.duck + TUNE_UP.duck);
      seg.push(piece(id, k, 0, tramo, { h }));
    } else if (k === 'side') {
      // el cangrejo, pegado a un lado al azar (hay que apartarse al otro)
      seg.push(piece(id, k, 0, tramo, { side: env.rnd() < 0.5 ? -1 : 1 }));
    } else if (k === 'fruit') {
      const side: -1 | 1 = env.rnd() < 0.5 ? -1 : 1;
      const f = piece(id, k, 0, tramo, { side });
      if (env.rnd() < SPECIAL_P && !special) f.special = special = true;
      seg.push(f);
    } else if (k === 'step') {
      const h = clamp(T.high + 0.06 * tp + rand(0, 0.05), T.high, T.high + TUNE_UP.high);
      const len = clamp(4 + 0.4 * tp + 0.25 * rank + rand(0, 1.5), 4, 9);
      seg.push(piece(id, k, 0, tramo, { h, len }));
    } else if (k === 'crawl') {
      seg.push(crawlPiece(id));
    } else if (k === 'burpee') {
      const h = clamp(0.6 + 0.02 * tc + 0.02 * rank + rand(0, 0.05), 0.6, 1.0);
      const len = clamp(4 + 0.3 * tc + 0.2 * rank + rand(0, 1), 4, 7);
      const st = piece(id + 1, 'step', 0, tramo, { h, len });
      st.burpee = true;
      seg.push(crawlPiece(id), st);
    } else {
      seg.push(piece(id, k, 0, tramo));
    }
    const first = seg[0]!;
    if (prev) {
      // Sitio de más al azar, algo menos en los tramos altos: más piezas, más apretado (nunca bajo el mínimo).
      const extra = intro ? rand(0.5, 2) : (rand(4, 10) - Math.min(2, 0.4 * tramo)) * T.space;
      first.at = prev.at + prev.len + minGap(prev, first, env.vmax) + extra;
    } else {
      // (hasta 3 m de más, no 4: con el sitio de frenada ante el cofre, el peor azar del tramo de 40 m a vmax 4,8 ya no cabía)
      first.at = start + RUN_UP + rand(0, 3);
    }
    // La plataforma del burpee, al hueco fijo tras el túnel (sin azar).
    for (let i = 1; i < seg.length; i++) seg[i]!.at = seg[i - 1]!.at + seg[i - 1]!.len + minGap(seg[i - 1]!, seg[i]!, env.vmax);
    // Si tras la última no cabe el sitio que pide el cofre, el tramo ya está lleno.
    const tail = seg[seg.length - 1]!;
    if (tail.at + tail.len + minGap(tail, probe, env.vmax) > end) break;
    pieces.push(...seg);
  }
  pieces.push(piece(id0 + pieces.length, 'chest', end, tramo));
  return { pieces, end };
}

/** Las incumplidas del recorrido `pieces` (con velocidad máxima `vmax` y la tabla `tune`): lo que mide cada pieza y el
 * sitio entre ellas. */
export function courseRules(pieces: Piece[], vmax: number, tune: PlatTune = TUNE_DEF): string[] {
  const T = tune, cm = (m: number): string => (m * 100).toFixed(0);
  const out: string[] = [];
  const eps = 1e-9;
  const last = pieces[pieces.length - 1];
  if (!last || last.k !== 'chest') out.push(last ? `La última pieza (id ${last.id}) es «${last.k}»: debería ser el cofre` : 'No hay piezas: falta el cofre al final');
  const especiales = new Map<number, number>();
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const prev = pieces[i - 1];
    if (p.k === 'burpee') out.push(`La pieza ${p.id} es de clase «burpee»: el burpee es un túnel y una plataforma, no una pieza`);
    if (p.k === 'side' && p.side !== -1 && p.side !== 1) out.push(`El cangrejo ${p.id} no tiene lado (side ${p.side}): debería ser −1 o 1`);
    if (p.k === 'side' && p.tramo < 2) out.push(`El cangrejo ${p.id} sale en el tramo ${p.tramo}: no antes del tercero`);
    if (p.k === 'foe' && p.tramo < 1) out.push(`La seta ${p.id} sale en el tramo ${p.tramo}: no antes del segundo`);
    if (p.k !== 'step' && p.burpee) out.push(`La pieza ${p.id} (${p.k}) lleva burpee: solo puede llevarlo una plataforma`);
    if (p.k === 'fruit') {
      if (p.side !== -1 && p.side !== 1) out.push(`La fruta ${p.id} no tiene lado (side ${p.side}): debería ser −1 o 1`);
      if (p.special) especiales.set(p.tramo, (especiales.get(p.tramo) ?? 0) + 1);
    }
    if (p.k !== 'fruit' && p.special) out.push(`La pieza ${p.id} (${p.k}) es especial: solo puede serlo una fruta`);
    if (p.k === 'gap' && (p.len < T.gap - eps || p.len > T.gap + TUNE_UP.gap + eps)) out.push(`El hueco ${p.id} mide ${p.len.toFixed(3)} m: debe medir entre ${cm(T.gap)} y ${cm(T.gap + TUNE_UP.gap)} cm`);
    if (p.k === 'low' && (p.h < T.duck - eps || p.h > T.duck + TUNE_UP.duck + eps)) out.push(`La viga ${p.id} pide bajar ${p.h.toFixed(3)} m: debe pedir entre ${cm(T.duck)} y ${cm(T.duck + TUNE_UP.duck)} cm`);
    if (p.k === 'step') {
      if (p.len <= 0) out.push(`La plataforma ${p.id} no tiene largo (len ${p.len.toFixed(3)}): debe medir más de 0 m`);
      if (p.burpee) {
        if (p.len < 4 - eps || p.len > 7 + eps) out.push(`La plataforma de burpee ${p.id} mide ${p.len.toFixed(3)} m de largo: debe medir entre 4 y 7 m`);
        if (p.h < 0.6 - eps || p.h > 1.0 + eps) out.push(`La plataforma de burpee ${p.id} sube ${p.h.toFixed(3)} m: debe subir entre 0,6 y 1,0 m`);
        if (!prev || prev.k !== 'crawl') out.push(`La plataforma de burpee ${p.id} no va justo detrás de un túnel`);
        else {
          const room = p.at - (prev.at + prev.len);
          if (Math.abs(room - BURPEE_GAP_S * vmax) > 1e-6) out.push(`La plataforma de burpee ${p.id} está a ${room.toFixed(3)} m del túnel ${prev.id}: debe estar a ${(BURPEE_GAP_S * vmax).toFixed(3)} m`);
        }
      } else {
        if (p.len < 4 - eps || p.len > 9 + eps) out.push(`La plataforma ${p.id} mide ${p.len.toFixed(3)} m de largo: debe medir entre 4 y 9 m`);
        if (p.h < T.high - eps || p.h > T.high + TUNE_UP.high + eps) out.push(`La plataforma ${p.id} sube ${p.h.toFixed(3)} m: debe subir entre ${cm(T.high)} y ${cm(T.high + TUNE_UP.high)} cm`);
      }
    }
    if (p.k === 'crawl') {
      if (p.n !== 0) out.push(`El túnel ${p.id} pide ${p.n} flexiones: ya no las hay (n debe ser 0)`);
      if (p.len < T.tunnel - eps || p.len > T.tunnel + TUNE_UP.tunnel + eps) out.push(`El túnel ${p.id} mide ${p.len.toFixed(3)} m: debe medir entre ${T.tunnel} y ${T.tunnel + TUNE_UP.tunnel} m`);
    }
    if (!prev) continue;
    if (p.at <= prev.at) {
      out.push(`Fuera de orden: la pieza ${p.id} (at ${p.at.toFixed(2)}) no va después de la ${prev.id} (at ${prev.at.toFixed(2)})`);
      continue; // (sin orden no tiene sentido medir el sitio entre ellas)
    }
    const room = p.at - (prev.at + prev.len);
    const need = minGap(prev, p, vmax);
    if (room < need - eps) out.push(`Las piezas ${prev.id} (${prev.k}) y ${p.id} (${p.k}) están demasiado juntas: ${room.toFixed(2)} m de sitio y piden ${need.toFixed(2)} m`);
  }
  for (const [tramo, n] of especiales) if (n > 1) out.push(`El tramo ${tramo} tiene ${n} frutas especiales: como mucho una`);
  return out;
}
