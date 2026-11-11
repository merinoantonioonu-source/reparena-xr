/**
 * La página: «Pulsómetro» (RepArena: src/57_pulse.js): conectar el reloj o la banda por Bluetooth, ver el pulso con el color de tu zona
 * y desconectar. La lógica, en src/services/pulse.ts (también pasa el pulso del móvil a las gafas por la sincronización).
 */
import { $ } from './dom.js';
import { PULSE_UI, pulse } from '../services/hub.js';

export function pulsePage(): void {
  const btn = $('#btnHr') as HTMLButtonElement | null, off = $('#btnHrOff') as HTMLButtonElement | null, now = $('#hrNow'), st = $('#hrStatus');
  if (!btn) return;
  const P = pulse();
  PULSE_UI.status = (t, bad, canOff) => {
    if (st) {
      st.textContent = t;
      st.style.color = bad ? 'var(--red)' : '';
    }
    if (off) off.disabled = !canOff;
  };
  PULSE_UI.bpm = (b, col) => {
    if (!now) return;
    now.textContent = b ? String(b) : '';
    now.style.color = b ? col : '';
  };
  btn.addEventListener('click', () => void P.connect());
  off?.addEventListener('click', () => P.off());
  P.initStatus();
}
