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
import { worldOf, WORLDS, type World } from './worlds.js';
import { isPirate, BOB_CRACK, BOB_ISLE, SINK_MAX, SINK_MIN, CLIFF_WALL, GUST_MAX, GUST_MIN, LEDGE_MAX, LEDGE_MIN, ROCKFALL_AT, FIRE_AT, QUAKE_AT, WALKERS, BOSS_LEN, bossOf, bossTramo, FORK_RAMP, SPRING_MAX, SPRING_MIN, SPRING_N, ARC_MAX, ARC_MIN, GLIDE_MAX, GLIDE_MIN, GLIDE_NMAX, GLIDE_NMIN, GOLD_N, isJump, BURPEE_GAP_S, DROP_ROOM, FOE_WALK, TUNE_DEF, TUNE_UP, type PlatTune, FLOOR_UP_S, FLOORS, HALT_BRAKE, JUMP_GAP_S, JUMPS, MIN_GAP, RUN_UP, SIDE_BACK_S, STOP_AT, HALT, LAND_PAST, piece, type Course, type CourseEnv, type Piece, type PieceKind } from './types.js';

/** Las clases de la lista de cada tramo: la primera, lo básico (el tronco, la viga y el hueco); desde el segundo, también
 * la fruta, la plataforma alta y la seta (que se pisa); desde el tercero, el túnel, el burpee y el cangrejo (que se esquiva
 * a un lado: los obstáculos a un lado son siempre enemigos, elegido por el usuario). Ojo: `burpee` no es una pieza, es un
 * segmento de dos (un túnel y, `BURPEE_GAP_S` después, una plataforma con `burpee`): en el recorrido no hay piezas de esa
 * clase. (Las gemas del plan son las frutas.) Cada mundo (`w`, worlds.ts) suma sus retos propios desde su primer tramo y
 * quita los que no van en él. */
export function courseKinds(tramo: number, w: World = WORLDS[0]): PieceKind[] {
  // (el barril sorpresa y el trampolín, desde el principio: son premios, no obstáculos)
  const k: PieceKind[] = ['log', 'low', 'gap', 'box', 'spring'];
  if (tramo >= 1) k.push('fruit', 'step', 'foe', 'glide', 'fork', 'dive', 'skull');
  if (tramo >= 2) k.push('crawl', 'burpee', 'side', 'quake', 'fire');
  k.push(...w.extra);
  return k.filter((x) => !w.without.includes(x));
}

/** La antelación con la que hay que echarse al suelo ante un túnel (s a velocidad máxima); y con la que abrir los brazos
 * ante un barranco. */
const CRAWL_WARN_S = 3.5, GLIDE_WARN_S = 2.5;
/** La probabilidad de que una fruta sea la especial (como mucho una por tramo). */
const SPECIAL_P = 0.15;

/** Lo mínimo (m) entre el final de `prev` (su `at + len`) y el principio de `next` (su `at`), con velocidad máxima `vmax`. */
export function minGap(prev: Piece, next: Piece, vmax: number): number {
  // La plataforma de su burpee llega a un hueco fijo del túnel (sin azar ni nada más).
  if (prev.k === 'crawl' && next.k === 'step' && next.burpee) return BURPEE_GAP_S * vmax;
  let g = MIN_GAP;
  if (prev.k === 'gap' || prev.k === 'glide') g += LAND_PAST; // (aterrizas pasado el borde lejano)
  if (prev.k === 'bob') g += BOB_ISLE + BOB_CRACK; // (el islote, y su grieta con el camino: nada encima)
  if (HALT.includes(next.k)) g += STOP_AT; // (te paras antes de su borde: ese sitio, libre)
  // (para frenar suave a HALT_BRAKE hasta quedarte a STOP_AT de su borde, y un metro de colchón)
  if (HALT.includes(next.k)) g = Math.max(g, STOP_AT + (vmax * vmax) / (2 * HALT_BRAKE) + 1);
  if (FLOORS.includes(prev.k)) g = Math.max(g, FLOOR_UP_S * vmax + LAND_PAST); // (levantarte, y el mundo te deja pasado su final)
  if (isJump(prev) && isJump(next)) g = Math.max(g, JUMP_GAP_S * vmax);
  // (volver al centro: tras un paso a un lado, una cornisa, una racha o un desprendimiento)
  if ((prev.k === 'fruit' && !prev.gold) || prev.k === 'side' || prev.k === 'ledge' || prev.k === 'gust' || prev.k === 'rockfall') g = Math.max(g, SIDE_BACK_S * vmax);
  if (next.k === 'rockfall') g += ROCKFALL_AT; // (las rocas caen antes de que llegues: ese sitio, libre)
  if (WALKERS.includes(prev.k)) g += FOE_WALK; // (lo encuentras hasta FOE_WALK m más allá de su sitio)
  // (la onda del cíclope y la bola de fuego del demonio te llegan antes de pasar a su lado: ese sitio, libre)
  if (next.k === 'quake') g += QUAKE_AT;
  if (next.k === 'fire') g += FIRE_AT;
  if (next.k === 'crawl') g = Math.max(g, CRAWL_WARN_S * vmax); // (echarse al suelo con tiempo)
  if (next.k === 'glide') g = Math.max(g, GLIDE_WARN_S * vmax); // (abrir los brazos con tiempo)
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
  const W = worldOf(tramo, env.worldLen), kinds = courseKinds(tramo, W).filter((k) => !env.skip?.includes(k));
  let end = start + env.len;
  // (el cofre se prueba con id 0 solo para medir el sitio que pide: su id verdadero va al final, tras la última pieza)
  const probe = piece(0, 'chest', end, tramo);
  // el jefe del mundo (cada BOSS_EVERY tramos), justo antes del cofre: las piezas, antes de él (en un tramo corto, el tramo
  // se alarga lo que pida: la carrera, el jefe y el sitio hasta el cofre)
  const boss = bossTramo(tramo, env.worldLen) ? piece(0, 'boss', 0, tramo, { len: BOSS_LEN, n: bossOf(tramo, env.worldLen) }) : null;
  if (boss) {
    const tail = BOSS_LEN + minGap(boss, probe, env.vmax);
    end = Math.max(end, start + RUN_UP + 3 + tail);
    probe.at = end;
    boss.at = end - tail;
  }
  const lim = boss ?? probe;
  // Primero cada clase una vez, en orden aleatorio (Fisher-Yates); agotadas, al azar entre ellas.
  const queue = kinds.slice();
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(env.rnd() * (i + 1));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  // los premios (el barril sorpresa y las GOLD_N frutas doradas: altas en el centro, o una encima de una plataforma), detrás
  // de los retos en la cola (se sacan por el final: primero salen los retos; en un tramo corto, los premios que quepan)
  const bonus: (PieceKind | 'gold')[] = ['box', 'spring'];
  for (let i = 0; i < GOLD_N; i++) bonus.splice(Math.floor(env.rnd() * (bonus.length + 1)), 0, 'gold');
  for (const b of ['box', 'spring'] as const) {
    const bi = queue.indexOf(b);
    if (bi >= 0) queue.splice(bi, 1);
  }
  queue.unshift(...(bonus as PieceKind[]));
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
    const k = (queue.pop() ?? kinds[Math.floor(env.rnd() * kinds.length)]!) as PieceKind | 'gold';
    // (la de antes en la pasarela: tras una bifurcación, la bifurcación, no lo de sus ramas)
    let prev: Piece | undefined;
    for (let i = pieces.length - 1; i >= 0 && !prev; i--) if (pieces[i]!.lane === 0) prev = pieces[i];
    const id = id0 + pieces.length;
    // Lo que sale ahora: una pieza o, el burpee, dos (el túnel y su plataforma).
    const seg: Piece[] = [];
    if (k === 'gold') {
      // la fruta dorada: alta, en el centro (se coge saltando)
      const g = piece(id, 'fruit', 0, tramo);
      g.gold = true;
      seg.push(g);
    } else if (k === 'gap') {
      const len = clamp(T.gap + 0.12 * tramo + rand(-0.1, 0.1), T.gap, T.gap + TUNE_UP.gap);
      // (más de la mitad, con frutas en arco encima: siguen la curva del salto)
      const n = env.rnd() < 0.6 ? ARC_MIN + Math.floor(env.rnd() * (ARC_MAX - ARC_MIN + 1)) : 0;
      seg.push(piece(id, k, 0, tramo, { len, n }));
    } else if (k === 'low') {
      const h = clamp(T.duck + 0.015 * tramo + rand(0, 0.04), T.duck, T.duck + TUNE_UP.duck);
      seg.push(piece(id, k, 0, tramo, { h }));
    } else if (k === 'spring') {
      // el trampolín: lo que vuelas, libre (su largo), con sus frutas en el arco
      seg.push(piece(id, k, 0, tramo, { len: rand(SPRING_MIN, SPRING_MAX), n: SPRING_N }));
    } else if (k === 'fork') {
      // la bifurcación: a la derecha (la difícil) un tronco, un barril sorpresa y, si queda alguna, una dorada; a la izquierda
      // (la tranquila), dos frutas; cada rama con sus separaciones; su largo, lo que pidan y las rampas de separarse y juntarse
      const f = piece(id, k, 0, tramo), j = Math.max(MIN_GAP, JUMP_GAP_S * env.vmax), o = FORK_RAMP + 1;
      const R: Piece[] = [piece(id + 1, 'log', o, tramo), piece(id + 2, 'box', o + j, tramo)];
      const gi = queue.indexOf('gold' as PieceKind);
      if (gi >= 0) {
        queue.splice(gi, 1);
        const g = piece(id + 3, 'fruit', o + 2 * j, tramo);
        g.gold = true;
        R.push(g);
      }
      const Lf = [piece(id + R.length + 1, 'fruit', o + 1, tramo, { side: -1 }), piece(id + R.length + 2, 'fruit', o + 1 + Math.max(MIN_GAP, SIDE_BACK_S * env.vmax), tramo, { side: 1 })];
      for (const p of R) p.lane = 1;
      for (const p of Lf) p.lane = -1;
      const last = Math.max(...R.map((p) => p.at + p.len), ...Lf.map((p) => p.at + p.len));
      f.len = last + 1 + FORK_RAMP;
      seg.push(f, ...[...R, ...Lf].sort((a, b) => a.at - b.at));
      seg.forEach((p, i) => (p.id = id + i)); // (los id, seguidos en el orden del recorrido)
    } else if (k === 'glide') {
      // el barranco: más ancho con el tramo, con sus frutas en el aire
      const len = clamp(GLIDE_MIN + 0.5 * tp + rand(0, 2), GLIDE_MIN, GLIDE_MAX);
      seg.push(piece(id, k, 0, tramo, { len, n: GLIDE_NMIN + Math.floor(env.rnd() * (GLIDE_NMAX - GLIDE_NMIN + 1)) }));
    } else if (k === 'dive') {
      // en picado: hay que agacharse lo de una viga baja; la abeja o el murciélago, al azar
      const h = clamp(T.duck + 0.015 * tramo + rand(0, 0.04), T.duck, T.duck + TUNE_UP.duck);
      // (en la costa, el tiburón pirata, el de siempre o el gris: `n` 2 o 3)
      seg.push(piece(id, k, 0, tramo, { h, n: (W.key === 'coast' ? 2 : 0) + (env.rnd() < 0.5 ? 0 : 1) }));
    } else if (k === 'quake' || k === 'fire') {
      // el cíclope y el demonio, a un lado al azar (en las islas, el demonio es un dragón que vuela: `n` = 1)
      seg.push(piece(id, k, 0, tramo, { side: env.rnd() < 0.5 ? -1 : 1, n: k === 'fire' && W.key === 'sky' ? 1 : 0 }));
    } else if (k === 'ledge') {
      // la cornisa: el vacío, a la derecha (la pared, a la izquierda)
      seg.push(piece(id, k, 0, tramo, { len: rand(LEDGE_MIN, LEDGE_MAX), side: (-CLIFF_WALL) as 1 }));
    } else if (k === 'gust') {
      // la racha: sopla desde un lado (side: desde dónde) y empuja hacia el otro
      seg.push(piece(id, k, 0, tramo, { len: rand(GUST_MIN, GUST_MAX), side: env.rnd() < 0.5 ? -1 : 1 }));
    } else if (k === 'bob') {
      // el islote que sube y baja: un hueco (como los de siempre) y, al otro lado, el islote
      const len = clamp(T.gap + 0.12 * tramo + rand(-0.1, 0.1), T.gap, T.gap + TUNE_UP.gap);
      seg.push(piece(id, k, 0, tramo, { len }));
    } else if (k === 'sink') {
      // el islote que se hunde
      seg.push(piece(id, k, 0, tramo, { len: rand(SINK_MIN, SINK_MAX) }));
    } else if (k === 'rockfall') {
      // el desprendimiento: las rocas caen a un lado del camino (hay que estar en el otro)
      seg.push(piece(id, k, 0, tramo, { side: env.rnd() < 0.5 ? -1 : 1 }));
    } else if (k === 'side') {
      // el cangrejo, pegado a un lado al azar (hay que apartarse al otro); en la costa, a veces un esqueleto pirata (`n` 1)
      const side: -1 | 1 = env.rnd() < 0.5 ? -1 : 1;
      seg.push(piece(id, k, 0, tramo, { side, n: W.key === 'coast' && env.rnd() < 0.5 ? 1 : 0 }));
    } else if (k === 'cannon') {
      // el cañonazo: el barco, a un lado al azar; la bala alta (agacharse lo de una viga) o la baja (saltarla)
      const high = env.rnd() < 0.5, h = high ? clamp(T.duck + 0.015 * tramo + rand(0, 0.04), T.duck, T.duck + TUNE_UP.duck) : 0;
      seg.push(piece(id, k, 0, tramo, { side: env.rnd() < 0.5 ? -1 : 1, n: high ? 0 : 1, h }));
    } else if (k === 'fruit') {
      const side: -1 | 1 = env.rnd() < 0.5 ? -1 : 1;
      const f = piece(id, k, 0, tramo, { side });
      if (env.rnd() < SPECIAL_P && !special) f.special = special = true;
      seg.push(f);
    } else if (k === 'step') {
      const h = clamp(T.high + 0.06 * tp + rand(0, 0.05), T.high, T.high + TUNE_UP.high);
      const len = clamp(4 + 0.4 * tp + 0.25 * rank + rand(0, 1.5), 4, 9);
      const st = piece(id, k, 0, tramo, { h, len });
      // (a veces, una de las doradas del tramo encima: se coge subiendo de un supersalto)
      const gi = queue.indexOf('gold' as PieceKind);
      if (gi >= 0 && env.rnd() < 0.5) {
        queue.splice(gi, 1);
        st.gold = true;
      }
      seg.push(st);
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
    // La plataforma del burpee, al hueco fijo tras el túnel (sin azar); lo de las ramas de una bifurcación, en su sitio dentro de ella.
    if (k === 'fork') for (let i = 1; i < seg.length; i++) seg[i]!.at += first.at;
    else for (let i = 1; i < seg.length; i++) seg[i]!.at = seg[i - 1]!.at + seg[i - 1]!.len + minGap(seg[i - 1]!, seg[i]!, env.vmax);
    // Si tras la última no cabe el sitio que pide el cofre, el tramo ya está lleno.
    const tail = k === 'fork' ? first : seg[seg.length - 1]!;
    if (tail.at + tail.len + minGap(tail, lim, env.vmax) > lim.at) break;
    pieces.push(...seg);
  }
  if (boss) {
    boss.id = id0 + pieces.length;
    pieces.push(boss);
  }
  pieces.push(piece(id0 + pieces.length, 'chest', end, tramo));
  return { pieces, end };
}

/** Las incumplidas del recorrido `pieces` (con velocidad máxima `vmax` y la tabla `tune`): lo que mide cada pieza y el
 * sitio entre ellas. */
export function courseRules(pieces: Piece[], vmax: number, tune: PlatTune = TUNE_DEF, worldLen?: number): string[] {
  const T = tune, cm = (m: number): string => (m * 100).toFixed(0);
  const out: string[] = [];
  const eps = 1e-9;
  const last = pieces[pieces.length - 1];
  if (!last || last.k !== 'chest') out.push(last ? `La última pieza (id ${last.id}) es «${last.k}»: debería ser el cofre` : 'No hay piezas: falta el cofre al final');
  const especiales = new Map<number, number>();
  const lastLane = new Map<number, Piece>();
  let lastMain: Piece | undefined, fork: Piece | undefined;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    // (la de antes por el mismo sitio: en una rama, la de antes en esa rama; en la pasarela, la de antes en la pasarela, que
    // tras una bifurcación es la bifurcación entera)
    const prev = p.lane ? lastLane.get(p.lane) : lastMain;
    if (p.lane) {
      if (!fork || p.at < fork.at + FORK_RAMP - eps || p.at + p.len > fork.at + fork.len - FORK_RAMP + eps) out.push(`La pieza ${p.id} (${p.k}) va en la rama ${p.lane} fuera de su bifurcación`);
      lastLane.set(p.lane, p);
    } else {
      if (p.k === 'fork') {
        fork = p;
        lastLane.clear();
      }
      lastMain = p;
    }
    if (p.k === 'boss') {
      if (!bossTramo(p.tramo, worldLen)) out.push(`El jefe ${p.id} sale en el tramo ${p.tramo}: solo al final de cada mundo`);
      if (pieces[i + 1]?.k !== 'chest') out.push(`El jefe ${p.id} no va justo antes del cofre`);
      if (Math.abs(p.len - BOSS_LEN) > eps) out.push(`El jefe ${p.id} mide ${p.len.toFixed(2)} m: debe medir ${BOSS_LEN} m`);
    }
    if (bossTramo(p.tramo, worldLen) && p.k === 'chest' && pieces[i - 1]?.k !== 'boss') out.push(`El cofre ${p.id} del tramo ${p.tramo} no tiene al jefe delante`);
    if ((p.k === 'ledge' || p.k === 'gust' || p.k === 'rockfall') && worldOf(p.tramo, worldLen).key !== 'cliff') out.push(`La pieza ${p.id} (${p.k}) sale fuera del risco`);
    if (p.k === 'fork' && worldOf(p.tramo, worldLen).key === 'cliff') out.push(`La bifurcación ${p.id} sale en el risco`);
    if ((p.k === 'bob' || p.k === 'sink') && worldOf(p.tramo, worldLen).key !== 'sky') out.push(`La pieza ${p.id} (${p.k}) sale fuera de las islas`);
    const coast = worldOf(p.tramo, worldLen).key === 'coast';
    if (p.k === 'cannon' && !coast) out.push(`El cañonazo ${p.id} sale fuera de la costa`);
    if (p.k === 'cannon' && ((p.side !== -1 && p.side !== 1) || (p.n !== 0 && p.n !== 1) || (p.n === 0 && (p.h < T.duck - eps || p.h > T.duck + TUNE_UP.duck + eps)))) out.push(`El cañonazo ${p.id} está mal hecho (lado ${p.side}, bala ${p.n}, ${p.h.toFixed(2)} m)`);
    if (coast && (['fork', 'crawl', 'quake', 'foe', 'fire'] as PieceKind[]).includes(p.k)) out.push(`La pieza ${p.id} (${p.k}) sale en la costa`);
    if (isPirate(p) && !coast) out.push(`El pirata ${p.id} (${p.k}) sale fuera de la costa`);
    if (coast && p.k === 'dive' && !isPirate(p)) out.push(`El picado ${p.id} de la costa no es un tiburón pirata`);
    if (worldOf(p.tramo, worldLen).key === 'sky' && (['fork', 'crawl', 'side', 'quake'] as PieceKind[]).includes(p.k)) out.push(`La pieza ${p.id} (${p.k}) sale en las islas`);
    if (p.k === 'sink' && (p.len < SINK_MIN - eps || p.len > SINK_MAX + eps)) out.push(`El islote que se hunde ${p.id} mide ${p.len.toFixed(2)} m`);
    if (p.k === 'bob' && (p.len < T.gap - eps || p.len > T.gap + TUNE_UP.gap + eps)) out.push(`El hueco del islote ${p.id} mide ${p.len.toFixed(2)} m`);
    if ((p.k === 'gust' || p.k === 'rockfall') && p.side !== -1 && p.side !== 1) out.push(`La pieza ${p.id} (${p.k}) no tiene lado`);
    if (p.k === 'ledge' && (p.len < LEDGE_MIN - eps || p.len > LEDGE_MAX + eps)) out.push(`La cornisa ${p.id} mide ${p.len.toFixed(2)} m`);
    if (p.k === 'gust' && (p.len < GUST_MIN - eps || p.len > GUST_MAX + eps)) out.push(`La racha ${p.id} mide ${p.len.toFixed(2)} m`);
    if (p.k === 'burpee') out.push(`La pieza ${p.id} es de clase «burpee»: el burpee es un túnel y una plataforma, no una pieza`);
    if (p.k === 'side' && p.side !== -1 && p.side !== 1) out.push(`El cangrejo ${p.id} no tiene lado (side ${p.side}): debería ser −1 o 1`);
    if (p.k === 'side' && p.tramo < 2) out.push(`El cangrejo ${p.id} sale en el tramo ${p.tramo}: no antes del tercero`);
    if ((p.k === 'dive' || p.k === 'skull') && p.tramo < 1) out.push(`La pieza ${p.id} (${p.k}) sale en el tramo ${p.tramo}: no antes del segundo`);
    if ((p.k === 'quake' || p.k === 'fire') && p.tramo < 2) out.push(`La pieza ${p.id} (${p.k}) sale en el tramo ${p.tramo}: no antes del tercero`);
    if ((p.k === 'quake' || p.k === 'fire') && p.side !== -1 && p.side !== 1) out.push(`La pieza ${p.id} (${p.k}) no tiene lado (side ${p.side})`);
    if (p.k === 'dive' && (p.h < T.duck - eps || p.h > T.duck + TUNE_UP.duck + eps)) out.push(`El picado ${p.id} pide bajar ${p.h.toFixed(3)} m: debe pedir entre ${cm(T.duck)} y ${cm(T.duck + TUNE_UP.duck)} cm`);
    if (p.k === 'foe' && p.tramo < 1) out.push(`La seta ${p.id} sale en el tramo ${p.tramo}: no antes del segundo`);
    if (p.gold && p.k !== 'fruit' && p.k !== 'step') out.push(`La pieza ${p.id} (${p.k}) es dorada: solo puede serlo una fruta o una plataforma`);
    if (p.k === 'glide' && (p.len < GLIDE_MIN - eps || p.len > GLIDE_MAX + eps || p.n < GLIDE_NMIN || p.n > GLIDE_NMAX)) out.push(`El barranco ${p.id} mide ${p.len.toFixed(2)} m con ${p.n} frutas: debe medir entre ${GLIDE_MIN} y ${GLIDE_MAX} m, con ${GLIDE_NMIN} a ${GLIDE_NMAX}`);
    if (p.k === 'gap' && (p.n < 0 || p.n > ARC_MAX)) out.push(`El hueco ${p.id} lleva ${p.n} frutas en arco: como mucho ${ARC_MAX}`);
    if (p.k !== 'step' && p.burpee) out.push(`La pieza ${p.id} (${p.k}) lleva burpee: solo puede llevarlo una plataforma`);
    if (p.k === 'fruit' && p.gold && p.side !== 0) out.push(`La fruta dorada ${p.id} va a un lado (side ${p.side}): debería ir en el centro`);
    if (p.k === 'fruit' && !p.gold) {
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
  const doradas = new Map<number, number>();
  for (const p of pieces) if (p.gold) doradas.set(p.tramo, (doradas.get(p.tramo) ?? 0) + 1);
  for (const [tramo, n] of doradas) if (n > GOLD_N) out.push(`El tramo ${tramo} tiene ${n} frutas doradas: como mucho ${GOLD_N}`);
  return out;
}
