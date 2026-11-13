/**
 * Las teclas de los menús de RepArena (src/60_ui.js: Btn, Slider, flatKeys y la caché de teclas pintadas), portadas tal cual
 * (opción B del usuario, PR 31).
 *  - Cada tecla es plana (opción B del usuario: las de relieve pesaban demasiado): un solo panel con su cara de color, su
 *    borde y su texto, que flota un poco sobre la bandeja con su sombra. No se hunde: con el dedo delante se aclara, tocada
 *    brilla y, al pulsar, destella. Nada de eso vuelve a pintar el panel: solo cambia su color.
 *  - Las teclas ya pintadas se guardan por cómo se ven y se reutilizan: al pulsar, el menú se rehace entero y casi todas sus
 *    teclas salen iguales; pintarlas y subirlas otra vez dejaba la imagen congelada en las gafas.
 *  - El deslizador de los números: su ranura, su relleno rosa y su bolita.
 */
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from '@iwsdk/core';
import type { Mesh } from '@iwsdk/core';
import type { FieldDef } from '../../core/schema.js';
import { clampSetting } from '../../core/settings.js';
import { settings } from '../../core/values.js';
import { SND } from '../../audio/sound.js';
import { clamp, FB, fitFont, mkCanvas, rr, TAU } from '../canvas-kit.js';
import { comicOn, drawFoeCard, drawIcon, drawRank, hexDim, keyc, makePanel, STY, type FoeCard, type RaPanel } from './kit.js';

/** Lo que flota la tecla sobre la bandeja, en metros reales. */
export const KEY_H = 0.012;
/** Unos 3 píxeles por milímetro: lo que las gafas distinguen a la distancia del menú. */
const KEY_PXM = 3000;
/** En reposo, algo más oscura: con el dedo delante, a pleno color (sin repintar el panel). */
const KEY_DIM = 0.84;

export interface BtnOpts {
  style?: string;
  font?: number;
  accent?: string;
  icon?: string;
  badge?: number;
  tint?: string;
  card?: FoeCard;
  paint?: (c: CanvasRenderingContext2D, W: number, H: number, tc: string) => void;
  fill?: string;
  depthTest?: boolean;
}

/** Mientras se monta un menú, las teclas no se pintan al crearlas: las pinta flatKeys, una sola vez. */
export const BTN = { later: false };

/** Lo que tienen en común una tecla y un deslizador para la pulsación (src/ui/ra/poke.ts). */
export interface Widget {
  kind: 'btn' | 'slider';
  w: number;
  h: number;
  mesh: Mesh;
  hover: boolean;
  baseZ: number;
  cool?: number;
  only?: 'left' | 'right';
  flat?: boolean | 'paint';
  maxPush?: number;
  touching?: boolean;
  flashT?: number;
  pad?: number;
  down?: boolean;
  /** Sobre ella está el rayo de una mano (IWSDK): también se ilumina. */
  rayHover?: boolean;
  draw(): void;
  setHover?(h: boolean, restyle?: boolean): void;
  setTouch?(t: boolean): void;
  flash?(): void;
  flashStep?(dt: number): void;
  recolor?(): void;
}

// ---------------------------------------------------------------- la caché de teclas pintadas

interface KeyTex {
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture & { _keyc?: KeyTex };
  refs: number;
  t: number;
}
const KEYTEX = new Map<string, KeyTex>(), KEYTEX_MAX = 6e6;

function keyCached(w: Btn): void {
  const sig = w.sig2();
  if (w.sig === sig) return;
  let e = KEYTEX.get(sig);
  if (!e) {
    // nueva: se pinta una vez en su propio lienzo, que ya no cambia
    const p = w.own, c = mkCanvas(p.c.width, p.c.height), ctx = c.getContext('2d')!, tex = new CanvasTexture(c) as KeyTex['tex'];
    if (p.c.width !== p.W) ctx.scale(p.c.width / p.W, p.c.width / p.W);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    e = { c, ctx, tex, refs: 0, t: 0 };
    tex._keyc = e;
    const was = w.p;
    w.p = { ...p, c, ctx, tex };
    w.sig = sig;
    w.flat = 'paint';
    try {
      w.draw();
    } finally {
      w.flat = true;
      w.p = was;
    }
    KEYTEX.set(sig, e);
    keycTrim();
  }
  keyUse(w, e);
  w.sig = sig;
}
function keyUse(w: Btn, e: KeyTex): void {
  const m = w.mesh.material as MeshBasicMaterial, old = (m.map as KeyTex['tex'] | null)?._keyc;
  if (old === e) return;
  if (old) old.refs--;
  e.refs++;
  e.t = performance.now();
  m.map = e.tex;
  m.needsUpdate = true;
  w.mesh.userData.ownTex = w.own.tex;
}
/** Suelta una textura guardada (al quitar el menú); devuelve si lo era. */
export function keyFree(tex: unknown): boolean {
  const e = (tex as KeyTex['tex'] | null)?._keyc;
  if (e) {
    e.refs = Math.max(0, e.refs - 1);
    e.t = performance.now();
  }
  return !!e;
}
function keycTrim(): void {
  let px = 0;
  for (const e of KEYTEX.values()) if (!e.refs) px += e.c.width * e.c.height;
  if (px <= KEYTEX_MAX) return;
  for (const [k, e] of [...KEYTEX].sort((a, b) => a[1].t - b[1].t)) {
    if (px <= KEYTEX_MAX) break;
    if (e.refs) continue;
    KEYTEX.delete(k);
    e.tex.dispose();
    px -= e.c.width * e.c.height;
  }
}

// ---------------------------------------------------------------- la tecla

export class Btn implements Widget {
  readonly kind = 'btn' as const;
  label: string;
  style: string;
  font?: number;
  accent?: string;
  icon?: string;
  badge?: number;
  tint?: string;
  card?: FoeCard;
  paint?: BtnOpts['paint'];
  fill?: string;
  p: RaPanel;
  readonly own: RaPanel;
  mesh: Mesh;
  hover = false;
  rayHover = false;
  cool = 0;
  baseZ = 0;
  flat: boolean | 'paint' = false;
  sig = '';
  only?: 'left' | 'right';
  maxPush?: number;
  touching?: boolean;
  flashT?: number;
  down?: boolean;
  drawn?: boolean;
  setHover?: (h: boolean, restyle?: boolean) => void;
  setTouch?: (t: boolean) => void;
  flash?: () => void;
  flashStep?: (dt: number) => void;
  recolor?: () => void;

  constructor(
    label: string,
    readonly w: number,
    readonly h: number,
    readonly onPress: () => void,
    o: BtnOpts = {},
  ) {
    this.label = label;
    this.style = o.style || 'normal';
    this.font = o.font;
    this.accent = o.accent;
    this.icon = o.icon;
    this.badge = o.badge;
    this.tint = o.tint;
    this.card = o.card;
    this.paint = o.paint;
    this.fill = o.fill;
    this.p = this.own = makePanel(w, h, Math.round(clamp(KEY_PXM * w, 256, 2048)), { depthTest: o.depthTest });
    this.mesh = this.p.mesh;
    this.mesh.userData.widget = this; // (para el rayo: a qué tecla pertenece lo que toca)
    if (!BTN.later) this.draw();
  }

  /** El color del cuerpo de la tecla: el de su estilo o, elegida y con tinte (los del menú principal), el de su parte. */
  body(): number {
    if (this.fill) return this.style === 'selected' ? parseInt(this.fill.slice(1), 16) : hexDim(this.fill, 0.42);
    if (this.tint && this.style === 'selected') return parseInt(this.tint.slice(1), 16);
    return keyc(this.style)[0];
  }
  hex(): string {
    return '#' + this.body().toString(16).padStart(6, '0');
  }
  sig2(): string {
    return [this.label, this.style, this.p.W, this.p.H, this.font, this.accent, this.icon, this.badge, !!this.fill, comicOn(), this.hex()].join('|');
  }

  setLabel(l: string, style?: string): void {
    if (l === this.label && (!style || style === this.style)) return;
    const rec = !!style && style !== this.style;
    this.label = l;
    if (style) this.style = style;
    this.draw();
    if (rec && this.setHover) this.setHover(this.hover, true);
  }

  draw(): void {
    const c = this.p.ctx, W = this.p.W, H = this.p.H;
    if (this.flat === true && !this.paint && !this.card) {
      keyCached(this); // (ya pintada igual en otro menú: la misma textura)
      return;
    }
    if (this.flat) {
      // tecla plana: su cara de color con el borde (en cómic, de tinta) y lo que va impreso encima
      const tc = this.fill ? (this.style === 'selected' ? '#1a0716' : '#ffffff') : keyc(this.style)[1];
      c.clearRect(0, 0, W, H);
      const ink = comicOn(), lw = Math.max(3, H * (ink ? 0.055 : 0.03)), r = Math.min(H * 0.26, 26);
      rr(c, lw / 2 + 1, lw / 2 + 1, W - lw - 2, H - lw - 2, r);
      c.fillStyle = this.hex();
      c.fill();
      const g = c.createLinearGradient(0, 0, 0, H); // (un poco de luz arriba y de sombra abajo: se lee como tecla)
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.35, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      c.fillStyle = g;
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = ink ? '#1b1222' : 'rgba(0,0,0,0.45)';
      c.stroke();
      c.fillStyle = tc;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (this.accent && this.style === 'normal' && !this.fill) {
        rr(c, H * 0.1, H * 0.24, Math.max(6, H * 0.07), H * 0.52, Math.max(3, H * 0.035));
        c.fillStyle = this.accent;
        c.fill();
        c.fillStyle = tc;
      }
      if (this.icon) drawIcon(c, this.icon, W / 2, H / 2, H * 0.5, tc);
      else if (this.card) drawFoeCard(this, c, W, H, this.card, tc);
      else if (this.paint) this.paint(c, W, H, tc);
      else {
        if (this.badge !== undefined) drawRank(c, this.badge, this.label ? H * 0.62 : W / 2, H / 2, this.label ? H * 0.62 : Math.min(W, H) * 0.72, tc); // (sin texto: el galón solo, en medio)
        const ax = this.badge !== undefined ? H * 0.42 : this.accent && this.style === 'normal' && !this.fill ? H * 0.16 : 0;
        fitFont(c, this.label, W - H * 0.3 - ax * 2, Math.round(H * (this.font || 0.44)), '700 %px ' + FB);
        c.fillText(this.label, W / 2 + ax, H / 2 + 2);
      }
      this.p.tex.needsUpdate = true;
      return;
    }
    // la de relieve (el botón MENÚ de la muñeca)
    const s = STY[this.style] || STY.normal;
    c.clearRect(0, 0, W, H);
    rr(c, 4, 4, W - 8, H - 8, Math.min(H * 0.28, 28));
    c.fillStyle = this.hover ? (this.down ? '#e0b44e' : '#ffd166') : s[0];
    c.fill();
    const g = c.createLinearGradient(0, 4, 0, H - 4), a = this.down ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.2)', b = this.down ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.34)';
    g.addColorStop(0, a);
    g.addColorStop(0.18, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0)');
    g.addColorStop(1, b);
    c.fillStyle = g;
    c.fill();
    const acc = this.accent && this.style === 'normal' && !this.hover;
    if ((s[2] || acc) && !this.hover) {
      c.lineWidth = Math.max(3, H * 0.04);
      c.strokeStyle = acc ? this.accent! : s[2]!;
      c.stroke();
    }
    const tc = this.hover ? '#1a0716' : s[1];
    c.fillStyle = tc;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (this.icon) drawIcon(c, this.icon, W / 2, H / 2, H * 0.5, tc);
    else {
      fitFont(c, this.label, W - H * 0.4, Math.round(H * (this.font || 0.44)), '700 %px ' + FB);
      c.fillText(this.label, W / 2, H / 2 + 2);
    }
    this.p.tex.needsUpdate = true;
  }
}

/** Pone las teclas de un menú planas (list: ya colocadas; kh: lo que flotan sobre la bandeja, a la escala del menú). */
export function flatKeys(list: Btn[], kh: number): void {
  for (const w of list) {
    w.flat = true;
    w.draw();
    w.drawn = true;
    w.mesh.position.z = kh;
    w.baseZ = kh;
    w.maxPush = 0; // (no se hunde; la mano que se ve se queda en su cara)
    const mat = w.mesh.material as MeshBasicMaterial;
    // (más de 1: más clara que su dibujo, hacia el blanco; el color del material multiplica el del panel)
    w.recolor = () => {
      const k = w.touching ? 1.28 : w.hover || w.rayHover ? 1 : KEY_DIM, f = (w.flashT ?? 0) > 0 ? w.flashT! / 0.3 : 0;
      mat.color.setScalar(k + (1.7 - k) * f);
    };
    w.setTouch = (t) => {
      w.touching = t;
      w.recolor!();
    };
    w.setHover = (_h, restyle) => {
      if (restyle) w.draw();
      w.recolor!();
    };
    w.flash = () => {
      w.flashT = 0.3;
      w.recolor!();
    };
    w.flashStep = (dt) => {
      w.flashT = Math.max(0, (w.flashT ?? 0) - dt);
      w.recolor!();
    };
    w.recolor();
  }
}

// ---------------------------------------------------------------- el deslizador

/** El orden de pintado de la bolita y el relleno: encima de la ranura (RO.widget, 21) y por debajo del teclado (RO.keypad). */
const SLIDER_TOP = 21.5;
/** La bolita, tocada o con el rayo encima: amarilla, #ffd166 (el color del material multiplica su blanco #eeeaff, en lineal). */
const KNOB_HOT = [1.17, 0.775, 0.133] as const;

/** Un plano pintado una vez (la bolita o el relleno del deslizador), hijo de la ranura y sin rayo propio. */
function sliderPart(w: number, h: number, pxW: number, paint: (c: CanvasRenderingContext2D, W: number, H: number) => void): Mesh {
  const p = makePanel(w, h, pxW);
  paint(p.ctx, p.W, p.H);
  p.tex.needsUpdate = true;
  p.mesh.renderOrder = SLIDER_TOP;
  p.mesh.raycast = () => {}; // (el rayo y el dedo, a la ranura: es la que dice qué valor es)
  return p.mesh;
}

/**
 * El deslizador de los números: la ranura (con sus marcas) se pinta una sola vez; el relleno rosa y la bolita son planos
 * aparte que se mueven. Al arrastrarlo, o al pasar el rayo por encima, no se repinta ni se sube nada a la tarjeta gráfica:
 * repintarlo en cada paso hacía que el menú desapareciera a trozos en las gafas y la imagen fuera a saltos
 * (src/style/tex-upload.ts). Se ve igual que en RepArena (la bolita, amarilla con el dedo o el rayo encima).
 */
export class Slider implements Widget {
  readonly kind = 'slider' as const;
  value: number;
  readonly pad = 0.012;
  p: RaPanel;
  mesh: Mesh;
  hover = false;
  rayHover = false;
  baseZ = 0;
  pending = false;
  cool = 0;
  private knob: Mesh;
  private fill: Mesh;
  /** Del relleno: dónde empieza y lo que mide entero (metros). */
  private fx0: number;
  private fLen: number;

  constructor(
    readonly f: FieldDef,
    readonly w: number,
    readonly h: number,
    readonly onDrag: (v: number, done: boolean) => void,
  ) {
    this.value = Number(settings[f.key]);
    this.p = makePanel(w, h, Math.round(clamp(4200 * w, 256, 2048)));
    this.mesh = this.p.mesh;
    this.mesh.userData.widget = this;
    this.drawTrack();
    // el relleno: una píldora rosa de punta a punta, de la que se enseña lo que toca (su final queda bajo la bolita)
    const r = h * 0.12, x0 = -w / 2 + this.pad, x1 = w / 2 - this.pad;
    this.fx0 = x0 - r;
    this.fLen = x1 - x0 + r * 2;
    this.fill = sliderPart(this.fLen, r * 2, 1024, (c, W, H) => {
      rr(c, 0, 0, W, H, H / 2);
      c.fillStyle = '#ff4fa3';
      c.fill();
    });
    this.fill.geometry.translate(this.fLen / 2, 0, 0); // (crece desde su punta izquierda)
    this.fill.position.set(this.fx0, 0, 0.0008);
    // la bolita (con su borde de tinta): el tamaño de la de RepArena, un 30 % del alto a cada lado
    const kd = h * 0.68;
    this.knob = sliderPart(kd, kd, 128, (c, W) => {
      c.beginPath();
      c.arc(W / 2, W / 2, W * (0.3 / 0.68), 0, TAU);
      c.fillStyle = '#eeeaff';
      c.fill();
      c.lineWidth = Math.max(2, W * 0.035);
      c.strokeStyle = '#1a0716';
      c.stroke();
    });
    this.knob.position.z = 0.0016;
    this.mesh.add(this.fill, this.knob);
    this.place();
  }
  frac(): number {
    return (this.value - this.f.min!) / (this.f.max! - this.f.min!);
  }
  /** La ranura hundida y sus marcas (una vez). */
  private drawTrack(): void {
    const c = this.p.ctx, W = this.p.W, H = this.p.H, pad = (this.pad / this.w) * W, y = H / 2, x0 = pad, x1 = W - pad;
    c.clearRect(0, 0, W, H);
    rr(c, x0 - H * 0.12, y - H * 0.12, x1 - x0 + H * 0.24, H * 0.24, H * 0.12);
    c.fillStyle = '#120e26';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#30284f';
    c.stroke(); // (ranura hundida)
    c.fillStyle = 'rgba(238,234,255,0.35)';
    for (let i = 0; i <= 10; i++) {
      const tx = x0 + ((x1 - x0) * i) / 10;
      c.fillRect(tx - 1, y + H * 0.2, 2, H * 0.1);
    }
    this.p.tex.needsUpdate = true;
  }
  /** Coloca el relleno y la bolita en el valor (sin repintar). */
  private place(): void {
    const r = this.h * 0.12, x = -this.w / 2 + this.pad + (this.w - this.pad * 2) * clamp(this.frac(), 0, 1), len = Math.max(r * 2, x + r - this.fx0);
    this.fill.scale.x = len / this.fLen;
    const t = (this.fill.material as MeshBasicMaterial).map!;
    t.repeat.x = len / this.fLen; // (se enseña la parte izquierda de la píldora, sin estirarla)
    this.knob.position.x = x;
  }
  /** La bolita, amarilla con el dedo o el rayo encima (solo cambia su color). */
  recolor(): void {
    const on = this.hover || this.rayHover;
    (this.knob.material as MeshBasicMaterial).color.setRGB(on ? KNOB_HOT[0] : 1, on ? KNOB_HOT[1] : 1, on ? KNOB_HOT[2] : 1);
  }
  setHover(): void {
    this.recolor();
  }
  draw(): void {
    this.place();
    this.recolor();
  }
  set(v: number): void {
    if (v === this.value) return;
    this.value = v;
    this.place();
  }
  /** u: dónde está el dedo a lo largo de la ranura (0 a 1). */
  drag(u: number): void {
    const f = this.f, v = Number(clampSetting(f, f.min! + u * (f.max! - f.min!)));
    if (v === this.value) return;
    this.value = v;
    this.place();
    this.pending = true;
    SND.tick();
    this.onDrag(v, false);
  }
  commit(): void {
    if (!this.pending) return;
    this.pending = false;
    this.onDrag(this.value, true);
  }
}
