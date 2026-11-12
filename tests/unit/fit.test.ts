// El ajuste de las letras (src/ui/fit.ts): que quepan en su botón, que la fila lleve la misma y que vuelvan a la suya.
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { fitPanel } from '../../src/ui/fit.js';

// Un elemento de UIKit de mentira: su tamaño, sus propiedades y, el texto, lo que mide su línea con su letra actual
type Props = Record<string, unknown>;
class El extends Object3D {
  props: Props;
  w = 0;
  h = 0;
  readonly size = { peek: (): [number, number] => [this.w, this.h] };
  readonly isVisible = { peek: (): boolean => true };
  readonly properties = { peek: (): Props => this.props };
  constructor(props: Props, w: number, h: number) {
    super();
    this.props = props;
    this.w = w;
    this.h = h;
  }
  setProperties(p: Props): void {
    this.props = { ...this.props, ...p };
    for (const c of this.children) if (c instanceof Txt) c.props = { ...c.props, fontSize: this.props.fontSize };
  }
}
// el texto: cada carácter mide 0,8 de su letra (como Bungee)
class Txt extends El {
  readonly textLayout = { peek: () => ({ lines: [{ nonWhitespaceWidth: String(this.props.text).length * 0.8 * Number(this.props.fontSize) }] }) };
  constructor(text: string, fs: number) {
    super({ text, fontSize: fs }, 0, fs * 1.2);
  }
}

function button(row: El, text: string, w: number): { span: El; txt: Txt } {
  const b = new El({}, w, 6.4) as El & { _listeners: Record<string, unknown> };
  b._listeners = { click: [() => {}] };
  const span = new El({ fontSize: 2.4 }, w, 2.9), txt = new Txt(text, 2.4);
  span.add(txt);
  b.add(span);
  row.add(b);
  return { span, txt };
}

describe('el ajuste de las letras', () => {
  it('encoge la que no cabe y la fila entera lleva la misma', () => {
    const root = new El({}, 62, 20), row = new El({}, 56, 6.4);
    root.add(row);
    const a = button(row, 'Siguiente', 10), b = button(row, 'Vol', 10);
    expect(fitPanel(root)).toBe(2);
    const fa = Number(a.span.props.fontSize), fb = Number(b.span.props.fontSize);
    expect(9 * 0.8 * fa).toBeLessThanOrEqual(10); // («Siguiente» ya cabe en sus 10 cm)
    expect(fa).toBeLessThan(2.4);
    expect(fb).toBeCloseTo(fa, 5); // (y «Vol», al mismo tamaño)
    expect(fitPanel(root)).toBe(0); // (ya ajustado: no cambia más)
  });

  it('con el mismo texto no vuelve a crecer; con otro que cabe, vuelve a su letra', () => {
    const root = new El({}, 62, 20), row = new El({}, 56, 6.4);
    root.add(row);
    const a = button(row, 'Siguiente', 10);
    fitPanel(root);
    const small = Number(a.span.props.fontSize);
    fitPanel(root);
    expect(Number(a.span.props.fontSize)).toBe(small);
    a.txt.props = { ...a.txt.props, text: 'Ok' };
    fitPanel(root);
    expect(Number(a.span.props.fontSize)).toBeCloseTo(2.4, 5);
  });

  it('no baja de casi la mitad de su letra', () => {
    const root = new El({}, 62, 20), row = new El({}, 56, 6.4);
    root.add(row);
    const a = button(row, 'Una etiqueta larguísima de verdad', 4);
    fitPanel(root);
    expect(Number(a.span.props.fontSize)).toBeCloseTo(2.4 * 0.45, 5);
  });
});
