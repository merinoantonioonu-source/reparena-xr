/**
 * El registro de tirones (RepArena: HITCH, hitchNote, hitchText y hitchSave, src/80_main.js; la misma clave y la misma forma):
 * en las gafas, cuando la imagen se congela más de 0,1 s, se apunta lo que hizo el fotograma anterior (lo que tardó el juego
 * en pensar y en mandar el dibujo, y si en él se rehízo un menú, se pintó la carátula, se precompiló algo, se crearon
 * texturas o sombreadores). Al salir de las gafas se guarda, y la página lo resume: así se sabe qué congela la imagen
 * aunque no haya un patrón a la vista. Lógica pura (sin IWSDK).
 */
export const HITCH_KEY = 'reparena3-hitch';

/** Lo que pasó en un fotograma. */
export interface HitchFrame {
  js: number;
  rd: number;
  warm: number;
  intro: number;
  menu: number;
  tx: number;
  pg: number;
  st: string;
  open: boolean;
}
export interface HitchLog {
  n: number;
  list: (HitchFrame & { gap: number })[];
  at?: number;
}

export const HITCH = {
  list: [] as (HitchFrame & { gap: number })[],
  /** Lo que pasa en este fotograma (lo marca quien lo hace: precompilar, la carátula, rehacer un menú). */
  f: { warm: 0, intro: 0, menu: 0 },
  prev: null as HitchFrame | null,
  tex: 0,
  prog: 0,
  n: 0,
};

/** Al acabar cada fotograma: gap, lo que pasó desde el anterior (s); js y rd, lo que tardaron el juego y el dibujo (ms). */
export function hitchNote(gap: number, js: number, rd: number, tex: number, prog: number, st: string, open: boolean, inXR: boolean): void {
  const cur: HitchFrame = { js, rd, warm: HITCH.f.warm, intro: HITCH.f.intro, menu: HITCH.f.menu, tx: tex - HITCH.tex, pg: prog - HITCH.prog, st, open };
  HITCH.tex = tex;
  HITCH.prog = prog;
  HITCH.f.warm = HITCH.f.intro = HITCH.f.menu = 0;
  if (inXR && gap > 0.1 && HITCH.prev) {
    HITCH.n++;
    if (HITCH.list.length < 80) HITCH.list.push({ gap: Math.round(gap * 1000), ...HITCH.prev });
  }
  HITCH.prev = cur;
}

/** El resumen para la página. */
export function hitchText(L: HitchLog | null): string {
  if (!L || !L.n) return L ? 'Última sesión en las gafas: sin tirones (ningún fotograma de más de 0,1 s).' : '';
  const c = { menu: 0, intro: 0, warm: 0, tx: 0, pg: 0, js: 0, rd: 0, otra: 0 }, open = L.list.filter((x) => x.open).length;
  for (const x of L.list) {
    if (x.menu) c.menu++;
    else if (x.intro) c.intro++;
    else if (x.warm) c.warm++;
    else if (x.pg > 0) c.pg++;
    else if (x.tx > 0) c.tx++;
    else if (x.js > 50) c.js++;
    else if (x.rd > 50) c.rd++;
    else c.otra++;
  }
  const worst = Math.max(...L.list.map((x) => x.gap));
  const parts = ([[c.menu, 'al rehacer un menú'], [c.intro, 'pintando la carátula'], [c.warm, 'precompilando enemigos'], [c.pg, 'compilando un sombreador'], [c.tx, 'creando texturas'], [c.js, 'el juego pensando'], [c.rd, 'mandando el dibujo'], [c.otra, 'sin causa en el juego (la gráfica o el navegador)']] as [number, string][])
    .filter((x) => x[0])
    .map((x) => `${x[0]} ${x[1]}`);
  return `Última sesión en las gafas: ${L.n} tirones (el peor, ${worst} ms; ${open} con un menú abierto): ${parts.join(', ')}.`;
}

/** Al salir de las gafas: se guarda (y se empieza de cero). Devuelve lo guardado. */
export function hitchSave(store: (k: string, v: HitchLog) => void, now = Date.now()): HitchLog {
  const L: HitchLog = { n: HITCH.n, list: HITCH.list, at: now };
  store(HITCH_KEY, L);
  HITCH.list = [];
  HITCH.n = 0;
  HITCH.prev = null;
  return L;
}
