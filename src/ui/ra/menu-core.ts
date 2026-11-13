/**
 * El menú de RepArena (src/60_ui.js: openMenu y openMenuNow, hideMenu, menuClose, el teclado de números, la explicación
 * «?», el atril, el panel de la muñeca y su botón MENÚ), portado tal cual (opción B del usuario, PR 31).
 *  - Un menú es una lista de filas (título, texto, dibujo, botones, pestañas, fichas, opciones, ajustes del esquema o
 *    columnas en cajas) que se pinta en una bandeja de 90 cm de ancho con teclas planas encima (src/ui/ra/btn.ts).
 *  - En las gafas, con «Menú en: Muñeca» (de serie), sale de la muñeca izquierda y se queda quieto delante de ti, a
 *    «Distancia del menú de muñeca»; con «Atril», fijo delante de ti sobre su pie, colgando de su borde de arriba e
 *    inclinado hacia ti. Cada menú nuevo sale donde estaba el anterior.
 *  - Se pulsa con el dedo de cualquier mano (src/ui/ra/poke.ts) y con el rayo de la mano o del mando, pellizcando o con el
 *    gatillo (IWSDK: RayInteractable en el grupo de los menús).
 */
import { AdditiveBlending, BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Sprite, SpriteMaterial, TorusGeometry, Vector3 } from '@iwsdk/core';
import type { Object3D, Texture } from '@iwsdk/core';
import { FIELD, type FieldDef } from '../../core/schema.js';
import { decimals, fmtNum, fmtVal, setSetting } from '../../core/settings.js';
import { num, settings } from '../../core/values.js';
import { foeList } from '../../core/rules.js';
import { SND } from '../../audio/sound.js';
import { hands, head, type Side } from '../../input/hand-model.js';
import { clamp, FB, FD, fitFont, mkCanvas, rr, TAU } from '../canvas-kit.js';
import { BTN, Btn, flatKeys, KEY_H, keyFree, Slider, type BtnOpts, type Widget } from './btn.js';
import { CARD_H, comicOn, freePanel, makePanel, type FoeCard, type RaPanel } from './kit.js';
import { POKE, type PokeMenu } from './poke.js';

// ---------------------------------------------------------------- las filas

export interface RowItem extends BtnOpts {
  label?: string;
  onPress?: () => void;
  flex?: number;
  /** Un separador (raya vertical), sin tecla; blank: sin raya (un hueco). */
  sep?: boolean;
  blank?: boolean;
  h?: number;
  /** En las pestañas: la elegida. */
  on?: boolean;
}
export type Row =
  | { t: 'title'; text: string; color?: string; big?: { label: string; onPress: () => void }; lead?: { label: string; onPress: () => void; style?: string }; h?: number }
  | { t: 'text'; text: string; color?: string; h?: number }
  | { t: 'canvas'; h: number; text?: string; draw: (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void; mount?: (g: Object3D, x0: number, cy: number, cw: number, h: number) => void }
  | { t: 'btns' | 'tabs'; items: RowItem[]; h?: number }
  | { t: 'cards'; key: string; cols: number; items: FoeCard[]; h?: number }
  | { t: 'choice'; label: string; value: unknown; opts: [unknown, string, boolean?][]; onPick: (v: unknown) => void; h?: number }
  | { t: 'field'; key: string; after?: () => void; h?: number }
  | { t: 'cols'; cols: Row[][]; titles?: string[]; colors?: string[]; fr?: number[]; lw?: number[]; h?: number }
  | { t: 'space'; h?: number };

export interface MenuOpts {
  accent?: string;
  border?: string;
  noClose?: boolean;
  anchor?: Anchor;
  dist?: number;
}
interface FieldRow {
  f: FieldDef;
  slider?: Slider;
  value?: Btn;
  minus?: Btn;
  plus?: Btn;
}
interface Keypad {
  f: FieldDef;
  row: FieldRow | null;
  str: string;
  fresh: boolean;
  grp: Group;
  bg: RaPanel;
  widgets: Widget[];
  KW: number;
  KH: number;
  dispH: number;
  opt: { code?: boolean; maxLen?: number; onOK(s: string): void } | null;
}
export interface Menu extends PokeMenu {
  widgets: Widget[];
  fieldRows: FieldRow[];
  rows: Row[];
  age: number;
  keypad: Keypad | null;
  /** Cómo se rehace (al cambiar algo desde fuera: los ajustes, la música…). */
  rebuild?: () => void;
  /** Qué menú es (para GAME.menu: lobby, options, pause, summary, perks…). */
  kind: string;
  perks?: boolean;
}
interface Anchor {
  pos: Vector3;
  yaw: number;
}

/** La bandeja: 90 cm de ancho (cabe a la distancia del brazo sin girar la cabeza), su margen, el hueco entre filas y el ancho
 * de las etiquetas de los ajustes. */
export const MW = 0.9, PAD = 0.022, GAP = 0.01, LABW = 0.28;
/** Capas: fondo → teclas → teclado de números → sus teclas (paneles casi pegados: sin un orden fijo se tapaban). */
export const RO = { menu: 20, widget: 21, keypad: 22, key: 23 };
const COLP = 0.012, COLT = 0.03, COL_LW = 0.165;
export const GRID_H = 0.046;
const ROWH: Record<string, number> = { title: 0.075, text: 0.034, btns: 0.07, field: 0.062, choice: 0.062, tabs: 0.056, space: 0.012 };
const TXT_FONT = '500 27px ' + FB, TXT_LH = 0.03;
const CLOSE_W = 0.15, LEAD_W = 0.17;
const HINT_Q = 0.032, HINT_T = 9, HINT_W = 0.46;

/** Lo que el menú necesita de fuera (lo pone el sistema de los menús). */
export const ENV = {
  root: null as Object3D | null,
  /** En las gafas (si no, en el ordenador: el menú, fijo delante de la cámara). */
  inXR: (): boolean => false,
  /** Colocando algo (las barras): el botón de la muñeca cancela y los menús no llevan «Cerrar». */
  placing: (): boolean => false,
  /** El botón MENÚ de la muñeca (o X/Y del mando). */
  onWatch: (): void => {},
  /** En plena ronda (no en los menús). */
  playing: (): boolean => false,
  /** Para subir las texturas de un menú nuevo a la tarjeta gráfica antes de pintarlo (WebGLRenderer.initTexture). */
  renderer: null as { initTexture(t: Texture): void } | null,
};

export const UI = {
  menu: null as Menu | null,
  anchor: null as Anchor | null,
  lastAnchor: null as Anchor | null,
  lastAnchorT: -9,
};

const subH = (r: Row): number => {
  const f = r.t === 'field' ? FIELD[r.key] : undefined;
  return r.h || (f?.grid ? Math.ceil(f.opts!.length / f.grid) * (GRID_H + GAP) - GAP : ROWH[r.t]) || 0.06;
};

// Los textos largos se parten en líneas (a un tamaño que se lee) en vez de encogerse hasta no leerse
let wrapCtx: CanvasRenderingContext2D | null = null;
function wrapLines(text: string, maxPx: number): string[] {
  if (!wrapCtx) wrapCtx = mkCanvas(8).getContext('2d')!;
  const c = wrapCtx;
  c.font = TXT_FONT;
  if (c.measureText(text).width <= maxPx) return [text];
  const lines: string[] = [];
  let cur = '';
  for (const w of String(text).split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && c.measureText(t).width > maxPx) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- dónde sale

const _up = new Vector3(0, 1, 0), _f = new Vector3(), _bu = new Vector3();
let lastStandYaw = 0, lastStandY = 1.6;
const yawOf = (q: Quaternion): number => {
  _f.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-_f.x, -_f.z);
};
/** Hacia dónde mira el cuerpo, también en el suelo (RepArena: bodyYaw). */
export function bodyYaw(): number {
  _f.set(0, 0, -1).applyQuaternion(head.q);
  if (Math.abs(_f.y) < 0.7) return (lastStandYaw = yawOf(head.q));
  _bu.set(0, 1, 0).applyQuaternion(head.q);
  if (_f.y > 0) _bu.negate();
  _bu.y = 0;
  return _bu.lengthSq() > 0.04 ? Math.atan2(-_bu.x, -_bu.z) : lastStandYaw;
}
/** La altura de los ojos de pie (para colocar el menú aunque estés agachado). */
export function noteStand(): void {
  if (head.p.y > 1.1) lastStandY = head.p.y;
}
const standHeadY = (): number => clamp(lastStandY || 1.6, 1.2, 2.05);
const fwdH = (out: Vector3): Vector3 => {
  out.set(0, 0, -1).applyQuaternion(head.q);
  out.y = 0;
  if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
  return out.normalize();
};
/** Dónde sale un menú nuevo: el centro de su borde de arriba, a la altura del pecho y a tu alcance (cuelga de ahí). */
export function placeAnchor(dist: number): Anchor {
  const pos = head.p.clone().addScaledVector(fwdH(_f), dist);
  pos.y = ENV.inXR() ? standHeadY() - 0.18 : Math.max(0.5, head.p.y - 0.02);
  return { pos, yaw: yawOf(head.q) };
}

/** El tamaño del menú del atril («Tamaño del menú»; en la muñeca, el suyo). */
export const menuK = (): number => Math.max(0.5, Math.min(1.2, (num('menuSize') || 75) / 100));
const wristMenuOn = (): boolean => ENV.inXR() && settings.menuWhere === 'wrist';
/** La escala del panel de la muñeca a la distancia elegida (más lejos, más grande, para que se lea igual). */
const WMS = 0.46;
export const wristScale = (): number => WMS * clamp(num('wristDist') / 45, 0.8, 1.7);

// ---------------------------------------------------------------- lo que se monta y se quita

// Detrás del fondo de un menú, una pantalla invisible que solo escribe su profundidad y se pinta la primera: la gráfica ya no
// pinta lo que queda detrás del menú (decidido en el PR 7: con el menú principal, que cubre casi toda la vista, iba a saltos)
const OCC_MAT = new MeshBasicMaterial({ colorWrite: false });
export function menuOccluder(panelMesh: Mesh, w: number, h: number, inset = 0.02): Mesh {
  const o = new Mesh(new PlaneGeometry(Math.max(0.01, w - inset * 2), Math.max(0.01, h - inset * 2)), OCC_MAT);
  o.position.copy(panelMesh.position);
  o.position.z -= 0.002;
  o.renderOrder = -100;
  o.userData.own = 'geo';
  o.userData.noInk = true;
  o.raycast = () => {};
  panelMesh.parent!.add(o);
  return o;
}
// Los fondos de los menús (la bandeja, de unos 3,6 millones de píxeles en el principal, y la columna HOY) se guardan al quitar
// el menú y se vuelven a pintar en el siguiente si mide lo mismo: al pulsar, el menú se rehace entero, y crear y tirar en cada
// pulsación un lienzo así (y su textura en la tarjeta gráfica) congelaba la imagen en las gafas
const POOL: RaPanel[] = [], POOL_MAX = 3;
/** Un panel pintado para el fondo de un menú: uno guardado de la misma medida (limpio) o uno nuevo. */
export function poolPanel(w: number, h: number, px: number, hd: number): RaPanel {
  const i = POOL.findIndex((p) => p.w === w && p.h === h && p.c.width === Math.round(px * hd));
  if (i >= 0) {
    const p = POOL.splice(i, 1)[0], c = p.ctx as CanvasRenderingContext2D & { reset?: () => void };
    if (typeof c.reset === 'function') {
      c.reset(); // (como nuevo: sin escala, sombras ni estilos del menú anterior)
      c.scale(hd, hd);
    } else c.clearRect(0, 0, p.W, p.H);
    const m = p.mesh;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.renderOrder = 0;
    m.visible = true;
    return p;
  }
  const p = makePanel(w, h, px, { hd });
  p.mesh.userData.pool = p;
  return p;
}
/** Libera lo que se hizo para un menú (los paneles pintados; las teclas guardadas se sueltan, no se tiran; los fondos se
 * guardan para el siguiente). */
export function disposeTree(o: Object3D): void {
  o.traverse((n) => {
    const m = n as Mesh;
    if (n.userData.own === 'geo') m.geometry.dispose();
    const mat = m.material as MeshBasicMaterial | undefined;
    if (!mat?.map) return;
    const pp = n.userData.pool as RaPanel | undefined;
    if (pp) {
      POOL.push(pp);
      if (POOL.length > POOL_MAX) freePanel(POOL.shift()!);
      return;
    }
    if (keyFree(mat.map)) {
      mat.dispose();
      (n.userData.ownTex as { dispose(): void } | undefined)?.dispose();
      m.geometry.dispose();
      return;
    }
    if ((mat.map as { isCanvasTexture?: boolean }).isCanvasTexture) {
      mat.map.dispose();
      mat.dispose();
      m.geometry.dispose();
    }
  });
}

/** Quita el menú (keepAnchor: el siguiente sale en el mismo sitio). */
export function hideMenu(keepAnchor = false): void {
  const m = UI.menu;
  if (m) {
    m.group.removeFromParent();
    disposeTree(m.group);
    UI.menu = null;
  }
  if (!keepAnchor) {
    if (UI.anchor) {
      UI.lastAnchor = UI.anchor;
      UI.lastAnchorT = performance.now() / 1000;
    }
    UI.anchor = null;
    if (STAND.g) STAND.g.visible = false;
  }
  hintClear();
}

/** «✕ Cerrar»: el menú se recoge en la muñeca (o, en el atril, desaparece) y vuelve con el botón MENÚ. */
export function menuClose(): void {
  const m = UI.menu;
  if (!m) return;
  closeKeypad();
  SND.tick();
  if (m.wrist) WM.on = false;
  else {
    m.closed = true;
    m.group.visible = false;
    if (STAND.g) STAND.g.visible = false;
  }
}

// ---------------------------------------------------------------- el atril

const STAND: { g: Group | null; post: Mesh | null; strip: Mesh | null } = { g: null, post: null, strip: null };
function makeStand(): void {
  if (STAND.g || !ENV.root) return;
  const g = new Group(), steel = new MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.5, metalness: 0.3 }), dark = new MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.7 });
  const glow = new MeshBasicMaterial({ color: 0x3cf0c6, toneMapped: false });
  const base = new Mesh(new CylinderGeometry(0.2, 0.24, 0.04, 24), dark);
  base.position.y = 0.02;
  const ring = new Mesh(new TorusGeometry(0.21, 0.006, 4, 32), glow);
  ring.position.y = 0.042;
  ring.rotation.x = Math.PI / 2;
  ring.userData.noInk = true;
  const post = new Mesh(new CylinderGeometry(0.03, 0.035, 1, 12), steel);
  const strip = new Mesh(new BoxGeometry(0.012, 1, 0.012), glow);
  strip.userData.noInk = true;
  g.add(base, ring, post, strip);
  g.visible = false;
  ENV.root.add(g);
  Object.assign(STAND, { g, post, strip });
}

// ---------------------------------------------------------------- abrir un menú

/** Sube ya a la tarjeta gráfica las texturas de un menú recién hecho (su fondo y sus teclas): si no, se suben al pintarlo y,
 * con muchas, ese fotograma se para o sale a medias (en las gafas, el fondo del menú en blanco un instante). Las que ya
 * estaban subidas no se vuelven a subir. */
export function upTex(o: Object3D): void {
  const r = ENV.renderer;
  if (!r) return;
  try {
    o.traverse((c) => {
      const map = ((c as Mesh).material as { map?: Texture | null } | undefined)?.map;
      if (map) r.initTexture(map);
    });
  } catch {
    /* (si no se puede, se sube al pintarlo, como antes) */
  }
}

/** Abre un menú (en el mismo sitio que el que hubiera). */
export function openMenu(rows: Row[], opts: MenuOpts = {}, kind = 'options'): Menu {
  BTN.later = true;
  try {
    return openMenuNow(rows, opts, kind);
  } finally {
    BTN.later = false;
  }
}

function openMenuNow(rows: Row[], opts: MenuOpts, kind: string): Menu {
  rows = rows.slice();
  makeStand();
  // con un menú abierto, el siguiente sale en el mismo sitio; si no hay ninguno, delante de ti
  const old = UI.menu, wasClosed = !!(old && UI.anchor && old.closed), reuse = !!(old && UI.anchor), recent = !reuse && !opts.anchor && !!UI.lastAnchor && performance.now() / 1000 - UI.lastAnchorT < 2;
  hideMenu(true);
  if (recent) UI.anchor = UI.lastAnchor;
  else if (!reuse) UI.anchor = opts.anchor || placeAnchor((0.75 * (opts.dist || num('menuDist'))) / 100);
  POKE.need.left = POKE.need.right = true; // en el menú nuevo, el dedo que acaba de pulsar tiene que retirarse antes
  // en las gafas, todo menú lleva «✕ Cerrar» arriba a la derecha (salvo mientras colocas algo)
  const closable = ENV.inXR() && !opts.noClose && !ENV.placing();
  if (closable && (!rows.length || rows[0].t !== 'title')) rows = [{ t: 'title', text: '' }, ...rows];
  rows.forEach((r) => {
    const f = r.t === 'field' ? FIELD[r.key] : undefined;
    if (f?.grid && !r.h) r.h = Math.ceil(f.opts!.length / f.grid) * (GRID_H + GAP) - GAP;
  });
  rows.forEach((r) => {
    if (r.t === 'cols' && !r.h) r.h = Math.max(...r.cols.map((col) => (r.titles ? COLT : 0) + col.reduce((a, sr) => a + subH(sr), 0) + GAP * Math.max(0, col.length - 1))) + COLP * 2;
  });
  const wrapPx = ((MW - PAD * 2 - 0.02) * 1024) / MW, lines = rows.map((r) => (r.t === 'text' && !r.h ? wrapLines(r.text, wrapPx) : null));
  const heights = rows.map((r, i) => r.h || (lines[i] && lines[i]!.length > 1 ? ROWH.text + (lines[i]!.length - 1) * TXT_LH : ROWH[r.t]) || 0.06);
  const H = PAD * 2 + heights.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1);
  const group = new Group();
  group.rotation.order = 'YXZ';
  group.name = 'Menú';
  const bg = poolPanel(MW, H, 1024, 1.75);
  bg.mesh.renderOrder = RO.menu;
  group.add(bg.mesh);
  menuOccluder(bg.mesh, MW, H); // (lienzo de 1792 px: letras nítidas; detrás, la pantalla que ahorra pintar el paisaje)
  const c = bg.ctx, sc = bg.W / MW;
  // la bandeja de las teclas
  if (comicOn()) {
    // en cómic: violeta con una trama de puntos, borde de tinta y un filo del color de la sección
    rr(c, 4, 4, bg.W - 8, bg.H - 8, 34);
    c.fillStyle = '#3a2d5c';
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 8, r = 0; y < bg.H; y += 14, r++)
      for (let x = (r % 2) * 7 + 8; x < bg.W; x += 14) {
        c.beginPath();
        c.arc(x, y, 2.6, 0, TAU);
        c.fill();
      }
    c.restore();
    c.lineWidth = 12;
    c.strokeStyle = '#140c1a';
    c.stroke();
    rr(c, 14, 14, bg.W - 28, bg.H - 28, 26);
    c.lineWidth = 4;
    c.strokeStyle = opts.border || opts.accent || '#ff4fa3';
    c.stroke();
  } else {
    rr(c, 4, 4, bg.W - 8, bg.H - 8, 34);
    const gr = c.createLinearGradient(0, 0, 0, bg.H);
    gr.addColorStop(0, '#262a34');
    gr.addColorStop(1, '#1a1d25');
    c.fillStyle = gr;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = opts.border || opts.accent || '#ff4fa3';
    c.stroke();
  }
  const widgets: Widget[] = [], fieldRows: FieldRow[] = [];
  let y = H / 2 - PAD;
  const X0 = -MW / 2 + PAD, CW = MW - PAD * 2;
  // cada botón es una tecla plana con una sombra suave en la bandeja (la luz viene de arriba a la izquierda)
  const addW = <T extends Widget>(w: T, cx: number, cy: number): T => {
    w.mesh.position.set(cx, cy, 0.003);
    w.baseZ = 0.003;
    w.mesh.renderOrder = RO.widget;
    group.add(w.mesh);
    widgets.push(w);
    const px = (cx - w.w / 2 + MW / 2) * sc, py = (H / 2 - cy - w.h / 2) * sc;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.75)';
    c.shadowBlur = 16;
    c.shadowOffsetX = 6;
    c.shadowOffsetY = 9;
    rr(c, px + 2, py + 2, w.w * sc - 4, w.h * sc - 4, Math.min(w.h * sc * 0.32, 30));
    c.fillStyle = '#1d2029';
    c.fill();
    c.restore();
    return w;
  };
  const label = (text: string, cy: number, color = '#eeeaff', off = 0, x0 = X0, lw = LABW): void => {
    c.fillStyle = color;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    fitFont(c, text, (lw - 0.01 - off) * sc, 34, '500 %px ' + FB);
    c.fillText(text, (x0 + off - -MW / 2) * sc, (H / 2 - cy) * sc);
  };
  const layRow = (r: Row, h: number, cy: number, i: number, X0: number, CW: number, LW: number, tint?: string): void => {
    if (r.t === 'title') {
      const side = Math.max(closable && !i ? CLOSE_W : 0, r.lead ? LEAD_W : 0); // (el botón de la izquierda y el de cerrar, a los lados)
      c.fillStyle = r.color || opts.accent || '#ffd166';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitFont(c, r.text, (CW - 0.02 - side * 2) * sc, 60, '%px ' + FD);
      c.fillText(r.text, (X0 + CW / 2 + MW / 2) * sc, (H / 2 - cy) * sc + 4);
      if (r.big) addW(new Btn(r.big.label, CW - 2 * (CLOSE_W + GAP), h, r.big.onPress, { style: 'primary', font: 0.5 }), X0 + CW / 2, cy); // (en vez del título, EMPEZAR)
      if (r.lead) addW(new Btn(r.lead.label, LEAD_W, Math.min(h, 0.056), r.lead.onPress, { style: r.lead.style || 'primary', font: 0.42 }), X0 + LEAD_W / 2, cy);
      if (closable && !i) addW(new Btn('✕ Cerrar', CLOSE_W, Math.min(h, 0.052), menuClose, { style: 'ghost', font: 0.42 }), X0 + CW - CLOSE_W / 2, cy);
    } else if (r.t === 'text') {
      c.fillStyle = r.color || '#d8d3f5';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const L = lines[i];
      if (L && L.length > 1) {
        c.font = TXT_FONT;
        L.forEach((l, k) => c.fillText(l, (X0 + CW / 2 + MW / 2) * sc, (H / 2 - cy + (k - (L.length - 1) / 2) * TXT_LH) * sc));
      } else {
        fitFont(c, r.text, (CW - 0.02) * sc, 30, '500 %px ' + FB);
        c.fillText(r.text, (X0 + CW / 2 + MW / 2) * sc, (H / 2 - cy) * sc);
      }
    } else if (r.t === 'canvas') {
      r.draw(c, (X0 + MW / 2) * sc, (H / 2 - cy - h / 2) * sc, CW * sc, h * sc); // dibujo libre (el resumen de la ronda…)
      r.mount?.(group, X0, cy, CW, h);
    } else if (r.t === 'btns' || r.t === 'tabs') {
      const n = r.items.length, tot = r.items.reduce((a, it) => a + (it.flex || 1), 0), avail = CW - GAP * (n - 1);
      let x = X0;
      r.items.forEach((it) => {
        const w = (avail * (it.flex || 1)) / tot, st = it.style || (r.t === 'tabs' ? (it.on ? 'selected' : 'tab') : 'normal');
        if (it.sep) {
          // un separador (raya vertical), sin tecla
          if (!it.blank) {
            c.fillStyle = 'rgba(255,255,255,0.25)';
            c.fillRect((x + w / 2 + MW / 2) * sc - 2, (H / 2 - cy - h * 0.4) * sc, 4, h * 0.8 * sc);
          }
          x += w + GAP;
          return;
        }
        addW(new Btn(it.label ?? '', w, it.h || h, it.onPress ?? (() => {}), { style: st, font: it.font || (r.t === 'tabs' ? 0.4 : undefined), accent: it.accent || (tint && st === 'normal' && !it.icon && it.badge === undefined ? tint : undefined), icon: it.icon, badge: it.badge, tint: it.tint || tint, paint: it.paint, fill: it.fill }), x + w / 2, cy);
        x += w + GAP;
      });
    } else if (r.t === 'cards') {
      // fichas que se marcan y desmarcan (los enemigos), sin etiqueta, a todo el ancho
      const cols = r.cols, w = (CW - GAP * (cols - 1)) / cols, sel = (): string[] => foeList(r.key), btns: Btn[] = [];
      r.items.forEach((it, k) => {
        const x = X0 + (k % cols) * (w + GAP) + w / 2, yy = cy + h / 2 - CARD_H / 2 - Math.floor(k / cols) * (CARD_H + GAP);
        btns.push(
          addW(
            new Btn(
              it.name,
              w,
              CARD_H,
              () => {
                const cur = sel(), next = cur.includes(it.v) ? cur.filter((v) => v !== it.v) : [...cur, it.v];
                if (!next.length && !FIELD[r.key]?.empty) return;
                setSetting(r.key, next.join(','));
                btns.forEach((b, j) => b.setLabel(b.label, sel().includes(r.items[j].v) ? 'selected' : 'normal'));
              },
              { style: sel().includes(it.v) ? 'selected' : 'normal', card: it, tint },
            ),
            x,
            yy,
          ),
        );
      });
    } else if (r.t === 'choice') {
      label(r.label, cy, undefined, 0, X0, LW);
      const n = r.opts.length, avail = CW - LW - GAP * (n - 1), w = avail / n;
      let x = X0 + LW;
      r.opts.forEach(([v, lab, dis]) => {
        addW(new Btn(lab, w, h, () => !dis && r.onPick(v), { style: dis ? 'ghost' : v === r.value ? 'selected' : 'normal', font: 0.38, tint }), x + w / 2, cy);
        x += w + GAP;
      });
    } else if (r.t === 'field') {
      const f = FIELD[r.key];
      if (!f) return;
      const ly = f.grid ? cy + h / 2 - GRID_H / 2 : cy, qw = f.hint ? HINT_Q : 0;
      label(f.short || f.label, ly, undefined, 0, X0, LW - (qw ? qw + 0.008 : 0));
      if (qw) addW(new Btn('?', qw, Math.min(h, 0.04), () => hintShow(f, group, ly), { style: 'ghost', font: 0.62 }), X0 + LW - qw / 2 - 0.008, ly); // (qué hace: su explicación, al lado)
      if (f.type === 'num') {
        // en una columna (estrecha) no cabe el deslizador: − valor +
        const narrow = CW < 0.5, bw = narrow ? 0.052 : 0.054, vw = narrow ? CW - LW - bw * 2 - GAP * 2 : 0.13, sw = CW - LW - bw * 2 - vw - GAP * 3;
        let x = X0 + LW;
        const row: FieldRow = { f };
        const commit = (v: number): void => {
          setSetting(f.key, v);
          refreshRow(row);
        };
        row.minus = addW(new Btn('−', bw, h, () => commit(Number(settings[f.key]) - f.step!), { font: 0.6 }), x + bw / 2, cy);
        x += bw + GAP;
        if (narrow) {
          row.value = addW(new Btn(fmtVal(f), vw, h, () => openKeypad(f, row), { style: 'value', font: 0.42 }), x + vw / 2, cy);
          x += vw + GAP;
        } else {
          row.slider = addW(
            new Slider(f, sw, h, (v, done) => {
              row.value?.setLabel(fmtVal(f, v));
              if (done) commit(v);
            }),
            x + sw / 2,
            cy,
          );
          x += sw + GAP;
        }
        row.plus = addW(new Btn('+', bw, h, () => commit(Number(settings[f.key]) + f.step!), { font: 0.6 }), x + bw / 2, cy);
        x += bw + GAP;
        if (!narrow) row.value = addW(new Btn(fmtVal(f), vw, h, () => openKeypad(f, row), { style: 'value', font: 0.36 }), x + vw / 2, cy);
        fieldRows.push(row);
      } else if (f.type === 'multi') {
        // varios a la vez (al menos uno, salvo los que pueden quedarse vacíos); con f.grid, en rejilla
        const n = f.opts!.length, cols = f.grid || n, w = (CW - LW - GAP * (cols - 1)) / cols, bh = f.grid ? GRID_H : h, btns: Btn[] = [];
        const on = (): string[] => String(settings[f.key]).split(',');
        f.opts!.forEach(([v, lab], i) => {
          const cc = i % cols, rr_ = Math.floor(i / cols), x = X0 + LW + cc * (w + GAP), yy = f.grid ? cy + h / 2 - bh / 2 - rr_ * (bh + GAP) : cy;
          btns.push(
            addW(
              new Btn(
                String(lab),
                w,
                bh,
                () => {
                  const cur = on(), next = cur.includes(String(v)) ? cur.filter((k) => k !== String(v)) : [...cur, String(v)];
                  if (!next.length && !f.empty) return;
                  setSetting(f.key, next.join(','));
                  btns.forEach((b, j) => b.setLabel(b.label, on().includes(String(f.opts![j][0])) ? 'selected' : 'normal'));
                  r.after?.();
                },
                { style: on().includes(String(v)) ? 'selected' : 'normal', font: f.grid ? 0.4 : 0.34, tint },
              ),
              x + w / 2,
              yy,
            ),
          );
        });
      } else {
        // una opción entre varias; con f.grid, en rejilla (y, con f.badges, cada una con sus galones: los rangos)
        const opts2 = (f.type === 'toggle' ? [[1, 'Sí'], [0, 'No']] : f.opts!) as [unknown, string][], n = opts2.length, cols = f.grid || n, w = (CW - LW - GAP * (cols - 1)) / cols, bh = f.grid ? GRID_H : h, btns: Btn[] = [];
        opts2.forEach(([v, lab], i) => {
          const x = X0 + LW + (i % cols) * (w + GAP), yy = f.grid ? cy + h / 2 - bh / 2 - Math.floor(i / cols) * (bh + GAP) : cy;
          btns.push(
            addW(
              new Btn(
                lab,
                w,
                bh,
                () => {
                  setSetting(f.key, v as string | number);
                  btns.forEach((b, j) => b.setLabel(b.label, opts2[j][0] === settings[f.key] ? 'selected' : 'normal'));
                  r.after?.();
                },
                { style: settings[f.key] === v ? 'selected' : 'normal', font: f.grid ? 0.4 : 0.38, badge: f.badges ? i : undefined, tint },
              ),
              x + w / 2,
              yy,
            ),
          );
        });
      }
    }
  };
  rows.forEach((r, i) => {
    const h = heights[i], cy = y - h / 2;
    if (r.t === 'cols') {
      // columnas (el menú principal): cada una, en su caja con su título, con sus filas
      const n = r.cols.length, avail = CW - GAP * 2 * (n - 1), fr = r.fr || r.cols.map(() => 1 / n);
      let x0 = X0;
      r.cols.forEach((col, k) => {
        const cw = avail * fr[k], px = (x0 + MW / 2) * sc, top = (H / 2 - (cy + h / 2)) * sc, cc = r.colors?.[k];
        rr(c, px, top, cw * sc, h * sc, 22);
        c.fillStyle = 'rgba(255,255,255,0.035)';
        c.fill();
        c.lineWidth = cc ? 4 : 2;
        c.strokeStyle = cc || 'rgba(255,255,255,0.08)';
        c.stroke();
        let yy = cy + h / 2 - COLP;
        if (r.titles?.[k]) {
          c.fillStyle = cc || '#a49fc8';
          c.textAlign = 'left';
          c.textBaseline = 'middle';
          c.font = '600 24px ' + FB;
          c.fillText(r.titles[k].toUpperCase(), px + 0.014 * sc, (H / 2 - (yy - COLT / 2)) * sc);
          yy -= COLT;
        }
        col.forEach((sr) => {
          const sh = subH(sr);
          layRow(sr, sh, yy - sh / 2, -1, x0 + COLP, cw - COLP * 2, r.lw?.[k] || COL_LW, cc);
          yy -= sh + GAP;
        });
        x0 += cw + GAP * 2;
      });
    } else layRow(r, h, cy, i, X0, CW, LABW);
    y -= h + GAP;
  });
  bg.tex.needsUpdate = true;
  const wrist = wristMenuOn(), k = menuK(), ksc = wrist ? wristScale() : ENV.inXR() ? k : 1;
  BTN.later = false;
  flatKeys(widgets.filter((w): w is Btn => w.kind === 'btn'), KEY_H / ksc);
  ENV.root?.add(group);
  upTex(group);
  const m: Menu = { group, widgets, fieldRows, rows, W: MW, H, wrist, age: reuse ? 0.4 : 0, keypad: null, closed: false, kind };
  UI.menu = m;
  if (wrist) {
    // en la muñeca: la postura la pone updateWristMenu; un menú nuevo sale solo delante de ti; el siguiente, en su sitio
    if (!reuse && !recent) wristOpen();
    if (STAND.g) STAND.g.visible = false;
    wristPose(group, H);
  } else {
    // cuelga de su borde de arriba (inclinado hacia ti): el centro, más abajo y algo más cerca
    const A = UI.anchor!, s = ENV.inXR() ? k : 1, Hs = H * s, hz = (Hs / 2) * Math.sin(0.38);
    group.scale.setScalar(s);
    group.rotation.set(-0.38, A.yaw, 0);
    group.position.set(A.pos.x + hz * Math.sin(A.yaw), A.pos.y - (Hs / 2) * Math.cos(0.38), A.pos.z + hz * Math.cos(A.yaw));
    const st = STAND.g;
    if (st) {
      st.visible = ENV.inXR() && settings.menuWhere === 'stand';
      if (st.visible) {
        const nx = -Math.sin(A.yaw), nz = -Math.cos(A.yaw), postH = Math.max(0.1, group.position.y - (Hs / 2) * Math.cos(0.38) - 0.02);
        st.position.set(group.position.x + nx * 0.06, 0, group.position.z + nz * 0.06);
        STAND.post!.scale.y = postH;
        STAND.post!.position.y = postH / 2;
        STAND.strip!.scale.y = postH * 0.85;
        STAND.strip!.position.set(0.034 * nx * 0, postH / 2, 0.034);
        st.rotation.y = A.yaw;
      }
    }
  }
  if (wasClosed && !wrist) {
    // cerrado sigue cerrado (lo trae el botón de la muñeca)
    m.closed = true;
    group.visible = false;
    if (STAND.g) STAND.g.visible = false;
  }
  return m;
}

function refreshRow(row: FieldRow): void {
  const f = row.f;
  row.slider?.set(Number(settings[f.key]));
  row.value?.setLabel(fmtVal(f));
}
/** Repinta los valores de los ajustes del menú (si se cambian desde fuera). */
export function refreshFields(): void {
  for (const r of UI.menu?.fieldRows ?? []) refreshRow(r);
}

// ---------------------------------------------------------------- el teclado de números

/** Abre el teclado para escribir un número (o, con opt, un código: { maxLen, onOK(texto) }). */
export function openKeypad(f: FieldDef, row: FieldRow | null, opt: Keypad['opt'] = null): void {
  const m = UI.menu;
  if (!m) return;
  closeKeypad();
  const KW = 0.32, kw = 0.086, kh = 0.06, g = 0.01, dispH = 0.09, KH = PAD * 2 + dispH + 5 * kh + 5 * g;
  const ksc = m.wrist ? wristScale() : ENV.inXR() ? menuK() : 1, kkh = KEY_H / ksc, kd = 0.01 / ksc;
  const grp = new Group();
  grp.position.set(0, 0, kkh + kd + 0.004 / ksc); // (por encima de las teclas del menú)
  m.group.add(grp);
  const bg = makePanel(KW, KH, 640, { hd: 1.75 });
  bg.mesh.renderOrder = RO.keypad;
  grp.add(bg.mesh);
  const kp: Keypad = { f, row, str: '', fresh: true, grp, bg, widgets: [], KW, KH, dispH, opt };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', opt ? ' ' : ',', '0', '⌫'], y0 = KH / 2 - PAD - dispH - g;
  BTN.later = true;
  keys.forEach((k, i) => {
    const col = i % 3, rowI = Math.floor(i / 3), x = (col - 1) * (kw + g), yy = y0 - kh / 2 - rowI * (kh + g);
    const b = new Btn(k, kw, kh, () => keypadKey(k), { style: 'key', font: 0.55 });
    b.mesh.position.set(x, yy, 0.003);
    b.baseZ = 0.003;
    b.mesh.renderOrder = RO.key;
    grp.add(b.mesh);
    kp.widgets.push(b);
  });
  const yb = y0 - kh / 2 - 4 * (kh + g), bw = (KW - PAD * 2 - g) / 2;
  const cancel = new Btn('Cancelar', bw, kh, () => closeKeypad(), { style: 'danger', font: 0.38 }), ok = new Btn('OK', bw, kh, () => keypadOK(), { style: 'primary', font: 0.45 });
  BTN.later = false;
  cancel.mesh.position.set(-(bw + g) / 2, yb, 0.003);
  ok.mesh.position.set((bw + g) / 2, yb, 0.003);
  cancel.baseZ = ok.baseZ = 0.003;
  cancel.mesh.renderOrder = ok.mesh.renderOrder = RO.key;
  grp.add(cancel.mesh, ok.mesh);
  kp.widgets.push(cancel, ok);
  flatKeys(kp.widgets as Btn[], kkh);
  m.keypad = kp;
  drawKeypad();
  upTex(grp);
}
function drawKeypad(): void {
  const kp = UI.menu?.keypad;
  if (!kp) return;
  const c = kp.bg.ctx, W = kp.bg.W, H = kp.bg.H, s = W / kp.KW, f = kp.f;
  c.clearRect(0, 0, W, H);
  rr(c, 4, 4, W - 8, H - 8, 26);
  c.fillStyle = 'rgba(10,7,22,0.98)';
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = '#ffd166';
  c.stroke();
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillStyle = '#a49fc8';
  fitFont(c, f.short || f.label, W - 40, 24, '500 %px ' + FB);
  c.fillText(f.short || f.label, 22, 18);
  const shown = kp.opt ? (kp.str ? kp.str.replace(/(\d{4})(?=\d)/g, '$1 ') : '- - - -') : kp.fresh ? fmtNum(Number(settings[f.key]), f) : kp.str || '0';
  rr(c, 18, 50, W - 36, kp.dispH * s - 30, 12);
  c.fillStyle = '#1d1738';
  c.fill();
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillStyle = kp.fresh ? '#7d77a8' : '#ffffff';
  const t = shown + (f.unit ? ' ' + f.unit : '');
  fitFont(c, t, W - 70, 40, '700 %px ' + FB);
  c.fillText(t, W - 34, 50 + (kp.dispH * s - 30) / 2);
  if (!kp.opt) {
    c.textAlign = 'left';
    c.fillStyle = '#7d77a8';
    c.font = `500 20px ${FB}`;
    c.fillText(`${fmtNum(f.min!, f)}–${fmtNum(f.max!, f)}`, 30, 50 + (kp.dispH * s - 30) / 2);
  }
  kp.bg.tex.needsUpdate = true;
}
function keypadKey(k: string): void {
  const kp = UI.menu?.keypad;
  if (!kp) return;
  if (kp.fresh) {
    kp.str = '';
    kp.fresh = false;
  }
  if (kp.opt) {
    if (k === '⌫') kp.str = kp.str.slice(0, -1);
    else if (/\d/.test(k) && kp.str.length < (kp.opt.maxLen || 8)) kp.str += k;
  } else if (k === '⌫') kp.str = kp.str.slice(0, -1);
  else if (k === ',') {
    if (decimals(kp.f) > 0 && !kp.str.includes(',')) kp.str = (kp.str || '0') + ',';
  } else if (kp.str.replace(',', '').length < 5) kp.str = (kp.str === '0' ? '' : kp.str) + k;
  drawKeypad();
}
function keypadOK(): void {
  const kp = UI.menu?.keypad;
  if (!kp) return;
  if (kp.opt) {
    const str = kp.str;
    closeKeypad();
    if (str) kp.opt.onOK(str);
    return;
  }
  if (!kp.fresh && kp.str !== '') {
    setSetting(kp.f.key, Number(kp.str.replace(',', '.')));
    if (kp.row) refreshRow(kp.row);
  }
  closeKeypad();
}
export function closeKeypad(): void {
  const m = UI.menu, kp = m?.keypad;
  if (!m || !kp) return;
  m.group.remove(kp.grp);
  disposeTree(kp.grp);
  m.keypad = null;
}
/** Lo que se puede pulsar ahora (el teclado de números tapa el menú). */
export function activeWidgets(): Widget[] {
  const m = UI.menu;
  if (!m || m.closed) return [];
  return m.keypad ? m.keypad.widgets : m.widgets;
}

// ---------------------------------------------------------------- qué hace cada opción («?»)

// Junto al nombre de cada ajuste, una tecla «?»: al pulsarla sale, a la izquierda del menú y a la altura de esa fila, un
// cartel con lo que hace. Se va solo a los 9 s, al pulsar otra «?» o la misma otra vez
const HINT: { p: RaPanel | null; key: string; t: number } = { p: null, key: '', t: 0 };
function hintClear(): void {
  if (HINT.p) {
    HINT.p.mesh.removeFromParent();
    freePanel(HINT.p);
  }
  HINT.p = null;
  HINT.key = '';
}
function hintShow(f: FieldDef, group: Group, cy: number): void {
  const again = HINT.key === f.key && HINT.p && HINT.p.mesh.parent === group;
  hintClear();
  if (again) return;
  const px = 1024, sc = px / HINT_W, c0 = mkCanvas(8).getContext('2d')!;
  c0.font = '500 32px ' + FB;
  const lines: string[] = [];
  let cur = '';
  for (const w of String(f.hint).split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && c0.measureText(t).width > px - 70) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  const Hpx = 96 + lines.length * 42 + 24, P = makePanel(HINT_W, Hpx / sc, px, { depthTest: false }), c = P.ctx;
  rr(c, 4, 4, P.W - 8, P.H - 8, 26);
  c.fillStyle = 'rgba(16,12,32,0.96)';
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = '#ffd166';
  c.stroke();
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffd166';
  fitFont(c, f.label, P.W - 70, 40, '700 %px ' + FB);
  c.fillText(f.label, 35, 56);
  c.fillStyle = '#eeeaff';
  c.font = '500 32px ' + FB;
  lines.forEach((l, i) => c.fillText(l, 35, 112 + i * 42));
  P.tex.needsUpdate = true;
  P.mesh.renderOrder = RO.key + 2;
  P.mesh.position.set(-MW / 2 - HINT_W / 2 - 0.02, cy, 0.02);
  group.add(P.mesh);
  Object.assign(HINT, { p: P, key: f.key, t: HINT_T });
  upTex(P.mesh);
  SND.tick();
}
function hintStep(dt: number): void {
  if (!HINT.p) return;
  HINT.t -= dt;
  if (HINT.t <= 0 || !HINT.p.mesh.parent || !UI.menu || HINT.p.mesh.parent !== UI.menu.group) hintClear();
}

// ---------------------------------------------------------------- el panel de la muñeca

// Se abre con el botón MENÚ de la muñeca (o solo, cuando sale un menú nuevo) creciendo desde la muñeca hasta quedarse quieto
// delante de ti, a «Distancia del menú de muñeca» de los ojos y de cara a ti: ya no sigue a la mano. Se recoge con «✕
// Cerrar» y vuelve con el botón MENÚ; si te alejas o te giras y lo pierdes de vista, el botón lo trae delante
export const WM = { e: 0, on: false, init: false, top: new Vector3(), q: new Quaternion(), from: new Vector3() };
const _wm4 = new Matrix4(), _wmt = new Vector3(), _wmq = new Quaternion(), _wml = new Vector3(), _wmu = new Vector3(), _wmd = new Vector3();
export function wristOpen(): void {
  WM.on = true;
  WM.e = 0;
  WM.init = false;
}
// dónde se queda: hacia donde mira tu cara (en horizontal), con el borde de arriba algo por debajo de los ojos, inclinado hacia
// ellos y siempre derecho
function wristTarget(H: number, S: number): void {
  const yw = bodyYaw(), dir = _wmd.set(-Math.sin(yw), 0, -Math.cos(yw));
  _wmt.copy(head.p).addScaledVector(dir, num('wristDist') / 100);
  _wmt.y = Math.max(head.p.y - 0.06, H * S + 0.08) - (H * S) / 2;
  _wm4.lookAt(head.p, _wmt, _up);
  _wm4.decompose(_wml, _wmq, _wmu);
  WM.q.copy(_wmq);
  WM.top.copy(_wmt).addScaledVector(_wml.set(0, 1, 0).applyQuaternion(_wmq), (H * S) / 2);
  WM.init = true;
}
function wristPose(group: Object3D, H: number): void {
  const h = hands.left, S = wristScale(), e = 1 - Math.pow(1 - WM.e, 3), s = S * e;
  const hw = h.isHand ? h.J[0].s : h.wrist; // (la muñeca suavizada: el menú no tiembla con ella)
  if (!WM.init) {
    if (h.ok && !h.est) WM.from.copy(hw);
    else WM.from.copy(head.p).addScaledVector(fwdH(_wmu), 0.3).add(_wmu.set(0, -0.35, 0));
    wristTarget(H, S);
  } else if (h.ok && !h.est && !WM.on) WM.from.copy(hw); // (al cerrarse, vuelve a la muñeca)
  // el centro cuelga del borde de arriba: al pasar a un submenú más alto o más bajo, lo de arriba no se mueve
  _wmt.set(0, 1, 0).applyQuaternion(WM.q);
  _wml.copy(WM.top).addScaledVector(_wmt, (-H * S) / 2);
  group.position.lerpVectors(WM.from, _wml, e);
  group.quaternion.copy(WM.q);
  group.scale.setScalar(Math.max(0.001, s));
  group.visible = WM.e > 0.01;
}
/** ¿Está abierto pero no lo ves (te giraste o te fuiste)? Solo cuenta girarse o alejarse: mirar abajo, a la muñeca, no. */
export function wristFar(): boolean {
  const m = UI.menu;
  if (!m || !m.wrist || !WM.on) return false;
  m.group.getWorldPosition(_wml);
  const d = _wml.sub(head.p), len = d.length();
  d.y = 0;
  const yw = bodyYaw();
  return len > 1.3 || (d.lengthSq() > 1e-4 && d.angleTo(_wmd.set(-Math.sin(yw), 0, -Math.cos(yw))) > (55 * Math.PI) / 180);
}
export const wristReady = (): boolean => !UI.menu || !UI.menu.wrist || WM.e > 0.95;

let wristHint: Sprite | null = null;
function makeWristHint(): Sprite | null {
  if (wristHint || !ENV.root) return wristHint;
  const s = new Sprite(new SpriteMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  s.visible = false;
  s.userData.noInk = true;
  ENV.root.add(s);
  wristHint = s;
  return s;
}

/** Un fotograma del panel de la muñeca y de la explicación «?». */
export function updateWristMenu(dt: number): void {
  hintStep(dt);
  const m = UI.menu, hint = makeWristHint();
  if (!m || !m.wrist) {
    WM.e = 0;
    WM.init = false;
    if (hint) hint.visible = false;
    return;
  }
  WM.e = clamp(WM.e + (WM.on ? dt / 0.22 : -dt / 0.22), 0, 1);
  wristPose(m.group, m.H);
  // aviso: un punto que late en la muñeca mientras hay un menú recogido
  const h = hands.left;
  if (hint) {
    hint.visible = h.ok && !h.est && WM.e < 0.05;
    if (hint.visible) {
      hint.position.copy(h.wrist).add(_wmu.set(0, 0.04, 0));
      const p = 0.04 + 0.015 * Math.sin(performance.now() / 160);
      hint.scale.set(p, p, 1);
    }
  }
}

// ---------------------------------------------------------------- el botón MENÚ de la muñeca

export const WATCH: { b: Btn | null; btnPrev: boolean; lookT: number; armT: number } = { b: null, btnPrev: false, lookT: 0, armT: 0 };
const _wu = new Vector3(), _wh = new Vector3(), _wo = new Vector3();
/** ¿Miras la muñeca izquierda? (dorso o palma hacia la cara; con mando, el mando levantado delante) */
export function wristLook(lim = 0.72): boolean {
  const h = hands.left;
  if (!h.ok || h.est) return false; // (una mano calculada no saca el botón)
  const d = h.wrist.distanceTo(head.p);
  if (!h.isHand) return d < 0.65 && h.wrist.y < head.p.y - 0.1;
  _wu.set(0, 1, 0).applyQuaternion(h.wristQ);
  _wh.copy(head.p).sub(h.wrist).normalize();
  return Math.abs(_wu.dot(_wh)) > lim && d < 0.7;
}
export function watchBtn(): Btn {
  if (WATCH.b) return WATCH.b;
  const b = new Btn('MENÚ', 0.09, 0.042, () => ENV.onWatch(), { depthTest: false, style: 'primary', font: 0.5 });
  b.only = 'right' as Side; // (se pulsa con la otra mano)
  b.mesh.visible = false;
  b.mesh.renderOrder = 60;
  ENV.root?.add(b.mesh);
  WATCH.b = b;
  return b;
}
/** El botón de la muñeca este fotograma: si se ve, dónde y su texto. Devuelve si se ve (lo pulsa el sistema). */
export function updateWatch(dt: number, labelFor: () => string): boolean {
  const h = hands.left, w = watchBtn(), m = UI.menu;
  // con mandos, X/Y del mando izquierdo hacen de botón de menú (con el menú de muñeca abierto y a la vista, lo recogen)
  if (h.btnMenu && !WATCH.btnPrev) {
    if (m && m.wrist && WM.on && !wristFar() && !m.perks && !ENV.playing()) menuClose();
    else ENV.onWatch();
  }
  WATCH.btnPrev = h.btnMenu;
  // con el panel abierto delante, el botón sobra; pero si miras la muñeca más de un segundo, sale igual
  const look = ENV.inXR() && wristLook();
  WATCH.lookT = look ? WATCH.lookT + dt : 0;
  const wristUp = !!m && m.wrist && WM.on && !wristFar() && WATCH.lookT < 1;
  let show = false;
  if (look && !wristUp) {
    show = true;
    if (h.isHand) {
      _wu.set(0, 1, 0).applyQuaternion(h.wristQ);
      w.mesh.position
        .copy(h.wrist)
        .addScaledVector(_wu, Math.sign(_wu.dot(_wh)) * 0.045)
        .add(_wo.set(0, 0, 0.035).applyQuaternion(h.wristQ));
    } else w.mesh.position.copy(h.wrist).add(_wo.set(0, 0.08, 0));
  }
  w.setLabel(labelFor());
  w.mesh.visible = show;
  WATCH.armT = show ? WATCH.armT + dt : 0;
  if (show) {
    w.mesh.lookAt(head.p);
    w.baseZ = w.mesh.position.z;
  } else if (w.hover) {
    w.hover = false;
    w.draw();
  }
  return show;
}
