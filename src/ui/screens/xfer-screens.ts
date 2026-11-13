/**
 * Pasar datos a otro dispositivo y la sincronización, en las gafas (RepArena: `xferMenu` y `syncMenu`, en Opciones ▸ → Ajustes).
 * Los textos son los de RepArena (src/services/xfer.ts); aquí, solo las pantallas.
 */
import { HOOKS } from '../../core/state.js';
import { sync, xfer } from '../../services/hub.js';
import { XFER_HOURS, syncFmt, xferFmt, xferSummary, type SyncAsk, type XferPacket } from '../../services/xfer.js';
import { openKeypad } from './keypad.js';
import type { Row as ScreenRow } from '../ra/menu-core.js';

const ACC = '#ffd166';
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface XView {
  wait?: boolean;
  code?: string;
  got?: XferPacket;
  err?: string;
}

/** «A otro dispositivo»: enviar desde aquí (sale un código de 8 cifras) o recibir (se escribe el del otro). */
export function xferScreen(back: () => void, view: XView = {}): void {
  const X = xfer(), again = (v: XView): void => xferScreen(back, v);
  const run = <T>(fn: () => Promise<T>, next: (r: T) => XView): void => {
    if (X.busy) return;
    again({ ...view, wait: true });
    fn().then((r) => again(next(r))).catch((e) => again({ err: errText(e) }));
  };
  const rows: ScreenRow[] = [{ t: 'title', text: 'A OTRO DISPOSITIVO' }];
  if (view.wait) rows.push({ t: 'text', text: 'Un momento…', color: ACC });
  else if (view.code) rows.push({ t: 'text', text: 'Escribe este código en el otro dispositivo (en el juego: Opciones ▸ → Ajustes → A otro aparato; o en la página):', color: '#a49fc8' }, { t: 'title', text: xferFmt(view.code), color: '#3cf0c6' }, { t: 'text', text: `Vale durante ${XFER_HOURS} h · los datos van cifrados`, color: '#a49fc8' });
  else if (view.got) rows.push({ t: 'text', text: `Recibido (desde ${view.got.from || 'otro dispositivo'}): ${xferSummary(view.got)}`, color: '#3cf0c6' }, { t: 'text', text: 'Al cargarlo se sustituyen los ajustes y bloques de aquí (el historial se junta) y RepArena vuelve a empezar: tendrás que volver a entrar.', color: ACC });
  else rows.push({ t: 'text', text: view.err ? '✕ ' + view.err : 'Lleva tus ajustes, bloques de sesión, historial y música elegida de un dispositivo a otro (p. ej. del PC a las gafas) con un código de 8 cifras.', color: view.err ? '#ff6a6a' : '#a49fc8' });
  if (view.got) {
    const p = view.got;
    rows.push({ t: 'btns', items: [{ label: 'Cargar y reiniciar', style: 'primary', flex: 2, onPress: () => {
      X.apply(p);
      HOOKS.say('Datos cargados: reiniciando…', '#3cf0c6', 2);
    } }, { label: 'Cancelar', onPress: () => again({}) }] });
  } else if (!view.wait)
    rows.push({ t: 'btns', items: [
      { label: 'Enviar desde aquí', style: 'primary', onPress: () => run(() => X.send(), (code) => ({ code })) },
      { label: 'Recibir (escribir código)', onPress: () => openKeypad({ label: 'Código de 8 cifras', maxLen: 8, onCancel: () => again({}), onOK: (d) => run(() => X.fetch(d), (got) => ({ got })) }) },
    ] });
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  HOOKS.openScreen(rows, { accent: '#b9a6ff' });
}

interface SView {
  wait?: boolean;
  ask?: SyncAsk;
  done?: boolean;
  err?: string;
  code?: string;
  ok?: string;
}

/** La sincronización: crear un código fijo de 16 cifras o vincular el de otro aparato; importar lo más reciente. */
export function syncScreen(back: () => void, view: SView = {}): void {
  const S = sync(), again = (v: SView): void => syncScreen(back, v);
  const run = <T>(fn: () => Promise<T>, next: (r: T) => SView): void => {
    if (S.busy && !view.ask) return;
    again({ wait: true });
    fn().then((r) => again(next(r))).catch((e) => again({ err: errText(e) }));
  };
  const st = S.status(), rows: ScreenRow[] = [{ t: 'title', text: view.ask ? 'DATOS MÁS RECIENTES' : 'SINCRONIZACIÓN' }];
  if (view.wait) rows.push({ t: 'text', text: 'Un momento…', color: ACC });
  else if (view.ask) {
    const m = view.ask;
    rows.push({ t: 'text', text: S.askText(m), color: ACC }, { t: 'btns', items: [
      { label: 'Importar y reiniciar', style: 'primary', flex: 2, onPress: () => run(() => S.import(m), () => ({ done: true })) },
      { label: 'Ahora no', onPress: () => { S.decline(m); back(); } },
    ] });
  } else if (view.done) rows.push({ t: 'text', text: 'Importado: RepArena vuelve a empezar (tendrás que volver a entrar en las gafas).', color: '#3cf0c6' });
  else {
    if (view.err) rows.push({ t: 'text', text: '✕ ' + view.err, color: '#ff6a6a' });
    if (view.code) rows.push({ t: 'text', text: 'Tu código fijo. Escríbelo una vez en el otro aparato (en el juego: Opciones ▸ → Ajustes → Sincronización ▸ → Vincular; o en la página):', color: '#a49fc8' }, { t: 'title', text: syncFmt(view.code), color: '#3cf0c6' });
    if (st.linked) {
      if (!view.code) rows.push({ t: 'text', text: st.text + (view.ok ? ' ' + view.ok : ''), color: '#3cf0c6' });
      rows.push({ t: 'btns', items: [
        { label: 'Sincronizar ahora', style: 'primary', onPress: () => run(async () => {
          const m = await S.check();
          if (m) return { ask: m } as SView;
          await S.push();
          return { ok: 'Todo al día.' } as SView;
        }, (r) => r) },
        { label: 'Desvincular', style: 'danger', onPress: () => { S.unlink(); again({}); } },
      ] });
    } else {
      rows.push({ t: 'text', text: 'Con un código fijo, tus ajustes, sesiones, historial y carrera se guardan cifrados y pasan solos de un aparato a otro: al entrar, si el otro tiene algo más reciente, te pregunta si lo importas.', color: '#a49fc8' });
      rows.push({ t: 'btns', items: [
        { label: 'Crear código', style: 'primary', onPress: () => run(() => S.create(), (code) => ({ code })) },
        { label: 'Vincular (escribir código)', onPress: () => openKeypad({ label: 'Código de 16 cifras', maxLen: 16, fmt: (d) => d.replace(/(\d{4})(?=\d)/gu, '$1 '), onCancel: () => again({}), onOK: (d) => run(() => S.link(d), (m) => (m ? { ask: m } : { ok: 'Vinculado.' })) }) },
      ] });
    }
  }
  if (!view.ask && !view.done) rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  HOOKS.openScreen(rows, { accent: '#b9a6ff' });
}
