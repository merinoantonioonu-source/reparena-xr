/**
 * El registro de diagnóstico en las gafas (la lógica, en src/core/diag.ts): cada fotograma mira qué toca el rayo y el toque
 * del dedo de cada mano (los punteros de IWSDK), si la mano se ve, si pellizca, qué menú hay y si la imagen se ha parado; lo
 * que cambia es un suceso, y cada 0,1 s se apunta una línea. Se guarda al dejar de verse la VR (salir o abrir el menú de Meta)
 * y con «Guardar diagnóstico» de la pausa (`HOOKS.diagSave`). La página lo enseña (#diagStatus) con «Copiar» y «Descargar».
 */
import { createSystem, VisibilityState } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { DIAG, DIAG_KEY, DIAG_STEP, diagEvent, diagLine, diagSave, type DiagCapture } from '../core/diag.js';
import { GAME, HOOKS } from '../core/state.js';
import { store } from '../core/settings.js';
import { settings } from '../core/values.js';
import { hands, head, type Side } from '../input/hand-model.js';
import { keyOf, nameOf } from './key-name.js';
import { SolidKeysSystem } from './solid-keys.js';

const SIDES: Side[] = ['left', 'right'];
const L = { left: 'I', right: 'D' } as const;
const cm = (v: number): string => String(Math.round(v * 100));
const xyz = (p: { x: number; y: number; z: number }): string => `${cm(p.x)},${cm(p.y)},${cm(p.z)}`;

interface Track {
  ray: Object3D | null;
  touch: Object3D | null;
  ok: boolean;
  pinch: boolean;
  act: string;
}
const mkTrack = (): Track => ({ ray: null, touch: null, ok: false, pinch: false, act: '-' });

type Hit = { object: Object3D & { isVoidObject?: boolean }; point: { x: number; y: number; z: number }; distance: number };
type Ptr = { getIntersection(): Hit | undefined };
/** Lo que toca un puntero (nada si solo toca el vacío de fondo). */
const hitOf = (p: unknown): Hit | undefined => {
  const h = (p as Ptr).getIntersection();
  return h && !h.object.isVoidObject ? h : undefined;
};

export class DiagSystem extends createSystem({}, {}) {
  private T: Record<Side, Track> = { left: mkTrack(), right: mkTrack() };
  private acc = 0;
  private worst = 0;
  private menu = '';
  private phase = '';
  private vis = false;
  private solid: SolidKeysSystem | undefined;
  /** La cabecera, rehecha cada segundo en la VR (al salir ya no se sabe qué mandos o manos había). */
  private hdr = '';
  private hdrT = 0;

  init(): void {
    this.solid = this.world.getSystem(SolidKeysSystem);
    // los avisos y errores de la consola, también (sin los de depuración del emulador)
    let last = '';
    for (const k of ['warn', 'error'] as const) {
      const orig = console[k].bind(console);
      console[k] = (...a: unknown[]): void => {
        orig(...a);
        const s = a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : '')).join(' ').trim();
        if (!s || s.startsWith('rxdbg') || s === last) return; // (el mismo aviso seguido, una vez)
        last = s;
        diagEvent(`consola ${k === 'warn' ? 'aviso' : 'ERROR'}: ${s.slice(0, 160)}`);
      };
    }
    HOOKS.diagSave = (reason: string) => this.save(reason);
    this.page();
  }

  update(delta: number): void {
    DIAG.t += delta;
    const inXR = this.world.visibilityState.peek() === VisibilityState.Visible;
    // al dejar de verse la VR (salir, o el menú de Meta), se guarda lo que acaba de pasar
    if (this.vis && !inXR) this.save(this.world.visibilityState.peek() === VisibilityState.NonImmersive ? 'al salir de la VR' : 'al abrir el menú de las gafas');
    this.vis = inXR;
    if (!inXR) return;
    if ((this.hdrT -= delta) <= 0) {
      this.hdrT = 1;
      this.hdr = this.header();
    }
    this.worst = Math.max(this.worst, delta);
    if (delta > 0.1) diagEvent(`tirón: la imagen se paró ${Math.round(delta * 1000)} ms (menú ${GAME.menu}, fase ${GAME.phase})`);
    if (GAME.menu !== this.menu || GAME.phase !== this.phase) {
      diagEvent(`menú ${GAME.menu} · fase ${GAME.phase}`);
      this.menu = GAME.menu;
      this.phase = GAME.phase;
    }
    const xi = this.input.xr;
    for (const s of SIDES) {
      const h = hands[s], T = this.T[s], mp = xi.multiPointers?.[s];
      if (h.ok !== T.ok) diagEvent(`${L[s]} ${h.ok ? (h.isHand ? 'mano vista' : 'mando visto') : 'se pierde la mano'}`);
      if (h.pinch !== T.pinch) diagEvent(`${L[s]} ${h.pinch ? 'pellizca (o gatillo)' : 'suelta el pellizco'}`);
      T.ok = h.ok;
      T.pinch = h.pinch;
      if (!mp) continue;
      const ray = keyOf(hitOf(mp.getPointer('ray'))?.object), touch = keyOf(hitOf(mp.getPointer('touch'))?.object);
      const act = mp.getActiveKind() ?? '-';
      if (ray !== T.ray) diagEvent(`${L[s]} el rayo apunta a ${nameOf(ray)}`);
      if (touch !== T.touch) diagEvent(`${L[s]} el toque de IWSDK está sobre ${nameOf(touch)}`);
      if (act !== T.act) diagEvent(`${L[s]} puntero activo de IWSDK: ${act}`);
      T.ray = ray;
      T.touch = touch;
      T.act = act;
    }
    this.acc += delta;
    if (this.acc < DIAG_STEP) return;
    this.acc = 0;
    diagLine(`${GAME.menu}/${GAME.phase} | ${Math.round(this.worst * 1000)} | ${xyz(head.p)} | ${this.hand('left')} | ${this.hand('right')}`);
    this.worst = 0;
  }

  /** Lo de una mano en la línea de muestra. */
  private hand(s: Side): string {
    const h = hands[s];
    if (!h.ok) return `${L[s]}: -`;
    const mp = this.input.xr.multiPointers?.[s], P = this.solid?.P[s];
    const ri = mp ? hitOf(mp.getPointer('ray')) : undefined, ti = mp ? hitOf(mp.getPointer('touch')) : undefined;
    let out = `${L[s]}: ${h.isHand ? 'h' : 'm'}${h.pinch ? ' p' : ''} w(${xyz(h.wrist)}) i(${xyz(h.tip)})`;
    if (ri) out += ` r=${nameOf(keyOf(ri.object))}@(${xyz(ri.point)})`;
    if (ti) out += ` t=${nameOf(keyOf(ti.object))}/${cm(ti.distance)}`;
    out += ` act=${mp?.getActiveKind() ?? '-'}`;
    if (P && P.f !== Infinity) out += ` f=${cm(P.f)}${P.in ? ' in' : ''}${P.on ? ' on' : ''}${P.armed ? ' armed' : ''}`;
    return out;
  }

  /** La cabecera: cuándo, qué gafas y navegador, y los ajustes que más tocan a las manos y los menús. */
  private header(): string {
    const xs = this.world.renderer.xr.getSession() as (XRSession & { frameRate?: number }) | null;
    const src = xs ? [...xs.inputSources].map((x) => `${x.handedness}:${x.hand ? 'mano' : 'mando'}${x.profiles?.[0] ? ' ' + x.profiles[0] : ''}`).join(', ') : '';
    return [
      `${new Date().toLocaleString('es-ES')} · ${navigator.userAgent}`,
      `Imágenes/s: ${xs?.frameRate ?? '?'} · entrada: ${src || '?'} · modo ${settings.mode}, ejercicio ${settings.exercise}`,
      `Ajustes: manos que se ven ${settings.handLook}, menú en ${settings.menuWhere}, tamaño del menú ${settings.menuSize} %, calidad ${settings.quality}`,
    ].join('\n');
  }

  private save(reason: string): void {
    diagEvent(`(se guarda: ${reason})`);
    diagSave(reason, this.hdr || this.header(), Date.now(), () => store<DiagCapture[]>(DIAG_KEY), (v) => store(DIAG_KEY, v));
    this.page();
  }

  /** En la página: cuántos hay y los botones de copiar, descargar y borrar el último. */
  private page(): void {
    const el = document.getElementById('diagStatus');
    if (!el) return;
    const list = store<DiagCapture[]>(DIAG_KEY) ?? [];
    el.textContent = '';
    if (!list.length) return;
    const last = list[list.length - 1];
    const mins = Math.max(0, Math.round((Date.now() - last.at) / 60000));
    el.append(`Diagnóstico guardado (${list.length}; el último, ${last.reason}, hace ${mins} min): `);
    const b0 = document.createElement('span');
    const btn = (label: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      el.append(b, ' ');
    };
    btn('Copiar el último', () => {
      void navigator.clipboard?.writeText(last.text).then(
        () => (b0.textContent = 'Copiado: pégalo en tu mensaje'),
        () => (b0.textContent = 'No se pudo copiar: usa «Descargar»'),
      );
    });
    btn('Descargar todos', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([list.map((c) => c.text).join('\n\n==========\n\n')], { type: 'text/plain' }));
      a.download = `reparena-diagnostico-${new Date(last.at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
      a.click();
    });
    btn('Borrar', () => {
      store(DIAG_KEY, []);
      this.page();
    });
    el.append(b0);
  }
}
