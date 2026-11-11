/**
 * La página: «Pasar a otro dispositivo» (código de 8 cifras) y «Sincronización automática» (código fijo de 16), como en
 * RepArena (src/69_xfer.js: xferInitPage y syncInitPage). La lógica y los textos, en src/services/xfer.ts.
 */
import { $ } from './dom.js';
import { sync, xfer } from '../services/hub.js';
import { SYNC_TXT, XFER_HOURS, xferFmt, xferSummary, syncFmt, type SyncAsk } from '../services/xfer.js';

export function xferPage(): void {
  const S = sync(), X = xfer();
  const send = $('#btnXferSend') as HTMLButtonElement | null, recv = $('#btnXferRecv') as HTMLButtonElement | null, inp = $('#xferCode') as HTMLInputElement | null, st = $('#xferStatus');
  if (send && recv && inp && st) {
    const say = (t: string, bad = false): void => {
      st.textContent = t;
      st.style.color = bad ? 'var(--red)' : '';
    };
    send.addEventListener('click', async () => {
      send.disabled = true;
      say('Enviando…');
      try {
        const c = await X.send();
        say(`Código: ${xferFmt(c)} — escríbelo en el otro dispositivo (vale ${XFER_HOURS} h).`);
      } catch (e) {
        say('No se pudo enviar: ' + (e instanceof Error ? e.message : String(e)), true);
      }
      send.disabled = false;
    });
    recv.addEventListener('click', async () => {
      recv.disabled = true;
      say('Buscando…');
      try {
        const p = await X.fetch(inp.value);
        if (confirm(`Recibido: ${xferSummary(p)}.\n\nSe sustituyen los ajustes y bloques de aquí (el historial se junta). ¿Cargar?`)) {
          say('Cargado: recargando la página…');
          X.apply(p);
        } else say('No se ha cargado nada.');
      } catch (e) {
        say('No se pudo recibir: ' + (e instanceof Error ? e.message : String(e)), true);
      }
      recv.disabled = false;
    });
  }
  syncPage(S);
}

// La sincronización, en la página: crear o vincular el código, y la pregunta al abrirla (y al volver a ella)
function syncPage(S: ReturnType<typeof sync>): void {
  const box = $('#syncBox') as HTMLElement | null, ask = $('#syncAsk') as HTMLElement | null;
  if (!box || !S.db) return;
  box.hidden = false;
  const inp = $('#syncCode') as HTMLInputElement, st = $('#syncStatus') as HTMLElement;
  const say = (t: string, bad = false): void => {
    st.textContent = t;
    st.style.color = bad ? 'var(--red)' : '';
  };
  const show = (): void => {
    const s = S.status();
    ($('#syncNew') as HTMLElement).hidden = s.linked;
    ($('#syncLinked') as HTMLElement).hidden = !s.linked;
    if (s.linked && !st.textContent) say(s.text);
  };
  let pending: SyncAsk | null = null;
  const offer = (m: SyncAsk | null): void => {
    if (!m || !ask) return;
    pending = m;
    ($('#syncAskTxt') as HTMLElement).textContent = S.askText(m);
    ask.hidden = false;
  };
  $('#btnSyncYes')?.addEventListener('click', async () => {
    const m = pending;
    if (ask) ask.hidden = true;
    if (!m) return;
    say('Importando…');
    try {
      await S.import(m);
      say('Importado: recargando la página…');
    } catch (e) {
      say('No se pudo importar: ' + (e instanceof Error ? e.message : String(e)), true);
    }
  });
  $('#btnSyncNo')?.addEventListener('click', () => {
    if (pending) S.decline(pending);
    pending = null;
    if (ask) ask.hidden = true;
  });
  const busy = async (btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> => {
    btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      say('No se pudo: ' + (e instanceof Error ? e.message : String(e)), true);
    }
    btn.disabled = false;
    show();
  };
  $('#btnSyncNew')?.addEventListener('click', (e) =>
    busy(e.currentTarget as HTMLButtonElement, async () => {
      say('Creando…');
      const c = await S.create();
      say(`Tu código fijo: ${syncFmt(c)}. Escríbelo una vez en el otro aparato (en el juego: Opciones ▸ → Ajustes → Sincronización ▸ → Vincular).`);
    }),
  );
  $('#btnSyncLink')?.addEventListener('click', (e) =>
    busy(e.currentTarget as HTMLButtonElement, async () => {
      say('Vinculando…');
      const m = await S.link(inp.value);
      inp.value = '';
      say(m ? 'Vinculado: el otro aparato tiene datos.' : 'Vinculado.');
      offer(m);
    }),
  );
  $('#btnSyncNow')?.addEventListener('click', (e) =>
    busy(e.currentTarget as HTMLButtonElement, async () => {
      say('Sincronizando…');
      const m = await S.check();
      if (m) {
        say('');
        offer(m);
      } else {
        await S.push();
        say(`Todo al día (${S.when(Date.now())}).`);
      }
    }),
  );
  $('#btnSyncOff')?.addEventListener('click', () => {
    S.unlink();
    say('Desvinculado: este aparato ya no sincroniza.');
    show();
  });
  show();
  // al abrir la página y al volver a ella (como mucho, una vez por minuto)
  let last = 0;
  const check = (): void => {
    if (!S.on() || Date.now() - last < 60e3 || (ask && !ask.hidden)) return;
    last = Date.now();
    S.check().then(offer).catch(() => {});
  };
  check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
void SYNC_TXT;
