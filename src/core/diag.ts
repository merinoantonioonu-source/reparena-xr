/**
 * El registro de diagnóstico: lo que ha pasado en los últimos 30 s, para mandárselo a quien arregla el juego cuando algo falla
 * en las gafas (las manos, el rayo, las teclas, los tirones…), que no se ve en el simulador. Cada 0,1 s, una línea con lo
 * esencial (la cabeza, las dos manos, a qué tecla apunta cada una y qué hace el dedo con el panel) y, aparte, los sucesos
 * (se ilumina o se pulsa una tecla, se pierde una mano, se pellizca, cambia el menú, un tirón, un aviso de la consola).
 * Se guarda al salir de las gafas (o al abrir el menú de Meta) y con «Guardar diagnóstico» de la pausa; la página lo deja
 * copiar o descargar. Lógica pura (sin IWSDK): el sistema que la llena está en src/ui/diag-system.ts.
 */
export const DIAG_KEY = 'reparenaxr-diag';
/** Cuántos segundos se guardan, cada cuánto una línea y cuántas capturas se conservan. */
export const DIAG_SECS = 30, DIAG_STEP = 0.1, DIAG_KEEP = 5;

const NS = Math.round(DIAG_SECS / DIAG_STEP), NE = 400;

/** Las líneas y los sucesos, en anillo (los más viejos se pisan). t: los segundos desde que arrancó el juego. */
export const DIAG = {
  t: 0,
  lines: new Array<string>(NS).fill(''),
  li: 0,
  events: new Array<string>(NE).fill(''),
  ei: 0,
  /** Lo nuevo desde la última captura (para no guardar dos veces lo mismo). */
  fresh: 0,
};

const fx = (n: number, d = 2): string => n.toFixed(d);

/** Un suceso (con su momento). */
export function diagEvent(text: string): void {
  DIAG.events[DIAG.ei] = `${fx(DIAG.t)} ${text}`;
  DIAG.ei = (DIAG.ei + 1) % NE;
  DIAG.fresh++;
}

/** Una línea de muestra (con su momento). */
export function diagLine(text: string): void {
  DIAG.lines[DIAG.li] = `${fx(DIAG.t)} ${text}`;
  DIAG.li = (DIAG.li + 1) % NS;
  DIAG.fresh++;
}

/** Lo de un anillo, del más viejo al más nuevo, solo los de los últimos DIAG_SECS. */
function ring(a: string[], i: number): string[] {
  const out: string[] = [], since = DIAG.t - DIAG_SECS;
  for (let k = 0; k < a.length; k++) {
    const s = a[(i + k) % a.length];
    if (s && parseFloat(s) >= since) out.push(s);
  }
  return out;
}

/** Cómo leer las líneas (va arriba en cada captura). */
export const DIAG_LEGEND = [
  'Muestras cada 0,1 s: t | menú/fase | imagen: peor ms | cabeza x,y,z (cm) | I: mano izquierda | D: derecha',
  '  mano: «-» no se ve; si no: m=mando, h=mano; calculada:pred|body (perdida, la calcula el juego); p=pellizco; muñeca w(x,y,z); punta del índice i(x,y,z) (cm, del mundo)',
  '  r=tecla a la que apunta el rayo @punto; t=tecla más cerca del dedo (toque de IWSDK) y su distancia (cm);',
  '  act=puntero activo de IWSDK (ray, touch o -); dedo=la tecla que ilumina el dedo (y si la está hundiendo); apoyado: la mano que se ve, parada en el panel',
].join('\n');

/** La captura de ahora, en texto (para leerla y para pegarla). */
export function diagText(reason: string, header: string): string {
  return [`RepArena XR · diagnóstico · ${reason}`, header, DIAG_LEGEND, '', '# Sucesos', ...ring(DIAG.events, DIAG.ei), '', '# Muestras', ...ring(DIAG.lines, DIAG.li)].join('\n');
}

export interface DiagCapture {
  at: number;
  reason: string;
  text: string;
}

/** Guarda la captura de ahora (si hay algo nuevo) con las anteriores; devuelve la lista. */
export function diagSave(reason: string, header: string, now: number, load: () => DiagCapture[] | null, save: (v: DiagCapture[]) => void): DiagCapture[] {
  const prev = load() ?? [];
  if (!DIAG.fresh) return prev;
  DIAG.fresh = 0;
  const list = [...prev, { at: now, reason, text: diagText(reason, header) }].slice(-DIAG_KEEP);
  save(list);
  return list;
}

/** Vacía los anillos (para las pruebas). */
export function diagReset(): void {
  DIAG.t = 0;
  DIAG.lines.fill('');
  DIAG.events.fill('');
  DIAG.li = DIAG.ei = DIAG.fresh = 0;
}
