/**
 * Que las letras quepan en su botón o en su caja (RepArena lo hacía al pintar cada tecla: `fitText`). UIKit no encoge la
 * letra: una palabra más ancha que su botón se sale y pisa a las vecinas («ANTERIOR PLAY SIGUIENTE VOL», en la música). A cada
 * texto que no cabe (de ancho o, en un botón, de alto) se le baja la letra (hasta el 45 %); los botones de una fila llevan la
 * misma. Si el código le cambia el texto o la letra, se ajusta desde ahí (y, si cabe con la suya, se la devuelve). Sin IWSDK:
 * el sistema que lo pasa a los paneles que se ven está en src/ui/fit-text.ts.
 */
import type { Object3D } from 'three';

type Sig<T> = { peek(): T };
type Num = number | string | undefined;
interface UIEl extends Object3D {
  size: Sig<[number, number] | undefined>;
  isVisible: Sig<boolean>;
  properties: Sig<Record<string, unknown>>;
  setProperties(p: Record<string, unknown>): void;
}
interface UIText extends UIEl {
  textLayout: Sig<{ lines: { nonWhitespaceWidth: number }[] } | undefined>;
}

/** El tamaño de letra del texto (base: el que le pusieron; set: el último que le puso el ajuste). */
const FIT = new WeakMap<UIEl, { base: number; set: number; text: string }>();
const MIN = 0.45, ROOM = 0.96;
/** Los últimos textos ajustados (para las pruebas: id, texto y tamaño). */
export const FIT_LOG: string[] = [];

const num = (v: Num, d = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const isText = (o: Object3D): o is UIText => 'textLayout' in o;
const isEl = (o: Object3D | null): o is UIEl => !!o && 'size' in o && 'setProperties' in o;

/** El ancho que tiene el texto: el de su caja y, si es el único hijo visible de su padre, el de dentro del padre. */
function room(span: UIEl): number {
  let w = span.size.peek()?.[0] ?? 0;
  const par = span.parent;
  if (isEl(par)) {
    let n = 0;
    for (const c of par.children) if (isEl(c) && c.isVisible.peek()) n++;
    if (n === 1) {
      const p = par.properties.peek(), pw = par.size.peek()?.[0] ?? 0;
      const inner = pw - num(p.paddingLeft as Num) - num(p.paddingRight as Num) - num(p.borderLeftWidth as Num) - num(p.borderRightWidth as Num);
      if (inner > 0) w = Math.min(w, inner);
    }
  }
  return w;
}

/** Lo que mide cada texto en esta pasada (se reutiliza: nada de crear objetos en cada vuelta). */
interface Item { span: UIEl; o: UIText; cur: number; k: number; group: Object3D; text: string }
const ITEMS: Item[] = [];
const GROUP = new Map<Object3D, number>();

/** La fila de botones de un texto (los botones de una fila llevan la misma letra) o, si no está en un botón, el propio texto. */
function groupOf(span: UIEl): Object3D {
  const btn = span.parent as (Object3D & { _listeners?: Record<string, unknown> }) | null;
  return btn && btn._listeners?.click && btn.parent ? btn.parent : span;
}

/** Ajusta las letras de un panel; devuelve cuántos textos ha cambiado. */
export function fitPanel(root: Object3D): number {
  let n = 0, changed = 0;
  GROUP.clear();
  root.traverse((o) => {
    if (!isText(o) || !o.isVisible.peek()) return;
    const span = o.parent;
    if (!isEl(span)) return;
    const L = o.textLayout.peek();
    if (!L || !L.lines.length) return;
    let w = 0;
    for (const l of L.lines) w = Math.max(w, l.nonWhitespaceWidth);
    const cur = num(o.properties.peek().fontSize as Num), avail = room(span);
    if (!(w > 0) || !(cur > 0) || !(avail > 0)) return;
    let rec = FIT.get(span);
    const text = String(o.properties.peek().text ?? '');
    if (!rec || Math.abs(cur - rec.set) > 1e-3) FIT.set(span, (rec = { base: cur, set: cur, text: '' })); // (el código le puso otra)
    const natural = (w * rec.base) / cur; // (lo que mediría con su letra)
    let k = natural > avail ? Math.max(MIN, (avail / natural) * ROOM) : 1; // (la parte de su letra que cabe)
    const group = groupOf(span);
    if (group !== span) {
      // en un botón, tampoco más alto que él (los de varias líneas se salían por arriba y por abajo)
      const btn = span.parent as UIEl, bp = btn.properties.peek(), bh = btn.size.peek()?.[1] ?? 0, th = o.size.peek()?.[1] ?? 0;
      const innerH = bh - num(bp.paddingTop as Num) - num(bp.paddingBottom as Num) - num(bp.borderTopWidth as Num) - num(bp.borderBottomWidth as Num);
      const tall = (th * rec.base) / cur;
      if (innerH > 0 && tall > innerH * 0.94) k = Math.min(k, Math.max(MIN, ((innerH * 0.94) / tall) * ROOM));
    }
    GROUP.set(group, Math.min(GROUP.get(group) ?? 1, k));
    const it = ITEMS[n] ?? (ITEMS[n] = { span, o, cur, k, group, text });
    it.text = text;
    it.span = span;
    it.o = o;
    it.cur = cur;
    it.k = k;
    it.group = group;
    n++;
  });
  for (let i = 0; i < n; i++) {
    const it = ITEMS[i], rec = FIT.get(it.span);
    if (!rec) continue;
    const want = rec.base * (GROUP.get(it.group) ?? it.k), same = rec.text === it.text;
    rec.text = it.text;
    // (con el mismo texto solo encoge: al encoger cabe en menos líneas y, si creciera otra vez, no pararía de cambiar)
    if (Math.abs(want - it.cur) < rec.base * 0.03 || (same && want > it.cur)) continue;
    rec.set = want;
    it.span.setProperties({ fontSize: want });
    changed++;
    if (FIT_LOG.length > 400) FIT_LOG.shift();
    FIT_LOG.push(`${String(it.span.properties.peek().id ?? '?')} «${(it.o.properties.peek().text as string | undefined) ?? ''}» ${rec.base}→${want.toFixed(2)}`);
  }
  return changed;
}

