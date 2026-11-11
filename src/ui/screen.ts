/**
 * Una pantalla genérica del menú (RepArena: `openMenu(rows)`): un título y hasta 12 filas de texto, de título grande o de botones
 * (hasta cinco). La usan la música (listas y canciones), pasar datos, la sincronización, el pulsómetro, la tabla del
 * desarrollador y el teclado de números. Se abre en el mismo sitio donde estaba el menú y, al cerrarla, se llama a `back` (que
 * suele volver al menú). Los paneles son los de IWSDK (UIKitML, `public/ui/screen.uikitml`), con sus botones de siempre.
 */
import { createSystem, PokeInteractable, RayInteractable } from '@iwsdk/core';
import type { Entity, UIKitMLAsset } from '@iwsdk/core';
import { unlockAudio } from '../audio/sound.js';
import { SND } from '../audio/sound.js';
import { HOOKS } from '../core/state.js';
import { applyFonts } from './fonts.js';

export type ScreenKey = { label: string; style?: 'primary' | 'danger'; accent?: string; flex?: number; onPress: () => void };
export type ScreenRow =
  | { t: 'title'; text: string; color?: string }
  | { t: 'text'; text: string; color?: string }
  | { t: 'btns'; items: ScreenKey[] };
export interface ScreenOpts {
  title?: string;
  accent?: string;
}

const N = 12, B = 5, KEY = '#2a2f3a', FG = '#e9eef7', DARK = '#0d1016';

export class ScreenSystem extends createSystem({}, {}) {
  private p: UIKitMLAsset | null = null;
  private e: Entity | undefined;
  private rows: ScreenRow[] = [];
  private shown = false;
  private readonly seen = new Map<string, string>();
  /** Dónde estaba el menú (para abrirse ahí) y cómo seguía. */
  private at: { pos: [number, number, number]; q: [number, number, number, number] } | null = null;

  init(): void {
    this.p = this.world.getSceneObject<UIKitMLAsset>('screen-panel') ?? null;
    this.e = this.world.getSceneEntity('screen-panel');
    if (this.p) applyFonts(this.p);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < B; j++) {
        const el = this.p?.getElementById(`r${i}b${j}`);
        if (!el) continue;
        const h = (): void => {
          unlockAudio();
          SND.click();
          const r = this.rows[i];
          if (r && r.t === 'btns') r.items[j]?.onPress();
        };
        el.addEventListener('click', h);
        this.cleanupFuncs.push(() => el.removeEventListener('click', h));
      }
    this.setOn(false);
    HOOKS.openScreen = (rows, opts) => this.open(rows as ScreenRow[], opts);
    HOOKS.closeScreen = () => this.close();
    HOOKS.screenOn = () => this.shown;
  }

  private setOn(on: boolean): void {
    this.shown = on;
    if (this.p) this.p.visible = on;
    const e = this.e;
    if (!e) return;
    if (e.object3D) e.object3D.visible = on;
    for (const C of [RayInteractable, PokeInteractable]) {
      if (on && !e.hasComponent(C)) e.addComponent(C);
      else if (!on && e.hasComponent(C)) e.removeComponent(C);
    }
  }

  private set(id: string, props: Record<string, unknown>): void {
    const p = this.p;
    if (!p) return;
    const k = id + '|' + Object.keys(props).join(), s = JSON.stringify(props);
    if (this.seen.get(k) === s) return; // (cada cambio rehace el elemento: solo lo que cambia)
    this.seen.set(k, s);
    p.getElementById(id)?.setProperties(props);
  }

  /** Abre la pantalla (o la rehace con otras filas, donde estaba). */
  open(rows: ScreenRow[], opts: ScreenOpts = {}): void {
    if (!this.shown) {
      // donde estaba el menú de Opciones (o el principal): la pantalla sale ahí
      const o = this.world.getSceneEntity('options-panel')?.object3D, l = this.world.getSceneEntity('lobby-panel')?.object3D;
      const src = o && o.visible ? o : l && l.visible ? l : o ?? l;
      if (src && this.e?.object3D) {
        this.e.object3D.position.copy(src.position);
        this.e.object3D.quaternion.copy(src.quaternion);
        this.e.object3D.scale.copy(src.scale); // (al tamaño del menú)
      }
      HOOKS.hideMenu();
      // (hideMenu esconde los menús; esta pantalla se pone encima)
    }
    this.rows = rows;
    const accent = opts.accent ?? '#a68bff';
    this.set('root', { borderColor: accent });
    this.set('sc-title', { text: opts.title ?? '', color: accent, display: opts.title ? 'flex' : 'none' });
    for (let i = 0; i < N; i++) {
      const r = rows[i];
      this.set(`r${i}`, { display: r ? 'flex' : 'none' });
      if (!r) continue;
      const text = r.t === 'btns' ? '' : r.text;
      this.set(`r${i}t`, r.t === 'btns' ? { display: 'none' } : { display: 'flex', text, color: r.color ?? (r.t === 'title' ? accent : '#eeeaff'), fontSize: r.t === 'title' ? 4.6 : 2.3 });
      this.set(`r${i}k`, { display: r.t === 'btns' ? 'flex' : 'none' });
      for (let j = 0; j < B; j++) {
        const k = r.t === 'btns' ? r.items[j] : undefined;
        this.set(`r${i}b${j}`, k ? { display: 'flex', flexGrow: k.flex ?? 1, backgroundColor: k.style === 'primary' ? (k.accent ?? '#3cf0c6') : k.style === 'danger' ? '#ff4a5a' : k.accent ? '#2c2540' : KEY } : { display: 'none' });
        if (k) this.set(`r${i}b${j}t`, { text: k.label, color: k.style === 'primary' ? DARK : k.accent && k.style !== 'danger' ? k.accent : FG });
      }
    }
    this.setOn(true);
  }

  close(): void {
    if (!this.shown) return;
    this.setOn(false);
    this.rows = [];
  }
}
