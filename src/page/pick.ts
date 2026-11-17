/**
 * Lo elegido en la página (RepArena: src/00_core.js `renderPick`, `repTimeOf`, `updateSummary`; src/62_demo.js `demoPage`):
 * el recuadro de arriba a la izquierda con el ejercicio elegido y su explicación, cuántas repeticiones y cuánto dura la
 * ronda con lo que has ajustado y la caricatura que enseña cómo se hace. Salen de lo que dicen las fichas del modo y el
 * ejercicio (el texto de la página) y de los ajustes.
 */
import { EX_NAMES, exOk, MODE_NAMES } from '../core/catalog.js';
import { autoAim, foes, foesHas, isCombat } from '../core/rules.js';
import { fmtNum, hangSecs, nWaves, waveReps } from '../core/settings.js';
import { num, on, settings } from '../core/values.js';
import { REP_TIME } from '../combat/waves.js';
import { demoDraw } from '../ui/demo-art.js';
import { $ } from './dom.js';

/** Lo que tarda una repetición (RepArena: repTimeOf; para calcular cuánto dura la ronda). */
export function repTimeOf(ex: string, mode = settings.mode): number {
  if (mode === 'touch') return num('tchGap');
  const t: Record<string, number> = { ...REP_TIME, pushup: 2.4, pike: 2.6, inchworm: 8, plank1: 2.2, plankrow: 2.4, superman: num('supHold') + 3, row: 2.6, pullup: 3.2, hang: 1, jump: 2.2, abs: 2.6, combo: 2.4, dips: 2.4, splank: num('splHold') + 0.5 };
  return t[ex] ?? 2.4;
}

/** El recuadro de lo elegido y el aviso del modo (lo que dicen las fichas de arriba). */
export function renderPick(): void {
  const card = (el: HTMLElement | null): HTMLElement | null => el?.closest<HTMLElement>('.card') ?? null;
  const part = (c: HTMLElement | null, sel: string): string => c?.querySelector(sel)?.innerHTML ?? '';
  const mc = card($(`#mode-${settings.mode}`)), ec = card($(`#ex-${settings.exercise}`));
  const cnt = $('#exCount');
  if (cnt) cnt.textContent = `${Object.keys(EX_NAMES).filter((x) => exOk(settings.mode, x)).length} en ${MODE_NAMES[settings.mode]}`;
  const mi = $('#modeInfo');
  if (mi && mc) mi.innerHTML = part(mc, 'small');
  const box = $('#pickBox');
  if (box && ec) box.innerHTML = `<span class="label">${MODE_NAMES[settings.mode]} · elegido</span><h3>${EX_NAMES[settings.exercise]}</h3><span class="tag">${part(ec, '.tag')}</span><p>${part(ec, 'small')}</p>`;
}

/** Cuánto suma y dura la ronda con lo ajustado (RepArena: updateSummary). */
export function updateSummary(): void {
  const el = $('#estimate');
  if (!el) return;
  const n = nWaves() || 5, hang = settings.exercise === 'hang';
  let total = 0;
  for (let i = 0; i < n; i++) total += hang ? hangSecs(i) : waveReps(i);
  const rest = num('rest') * Math.max(0, n - 1), work = hang ? total : total * (settings.mode === 'arcs' ? 60 / num('arcRate') : repTimeOf(settings.exercise));
  const mins = Math.round((rest + work) / 60);
  let speed: string;
  if (isCombat()) speed = [foesHas('robots') ? `Los robots tardan ${num('walkTime')} s en alcanzarte.` : '', foesHas('flyers') ? `Los voladores van a ${fmtNum(num('flySpeed'))} km/h.` : '', autoAim() ? 'Disparo automático.' : 'Apuntas tú.'].filter(Boolean).join(' ');
  else if (settings.mode === 'touch') speed = `Cada objetivo tarda ${fmtNum(num('tchArrive'))} s en llegar y espera ${fmtNum(num('tchWindow'))} s${num('bpm') ? `, al ritmo de ${num('bpm')} BPM` : ''}.`;
  else if (settings.mode === 'bars') speed = hang ? 'Si te sueltas, caes al charco.' : `Cada objetivo tarda ${fmtNum(num('barArrive'))} s en llegar a donde subirá tu cabeza.`;
  else speed = `${num('arcRate')} arcos por minuto a ${fmtNum(num('arcSpeed'))} km/h, bajando entre ${Math.min(num('arcMin'), num('arcMax'))} y ${Math.max(num('arcMin'), num('arcMax'))} cm${num('arcJump') ? `; el ${num('arcJump')} % son vallas que hay que saltar (${num('arcJumpH')} cm)` : ''}.`;
  el.innerHTML = `${MODE_NAMES[settings.mode]} · ${EX_NAMES[settings.exercise]}: ${nWaves() ? `${nWaves()} oleadas` : `oleadas sin fin${num('toFail') ? ', al fallo' : ''} (cuento las 5 primeras)`} suman <strong>${total}</strong> ${hang ? 'segundos colgado' : settings.mode === 'touch' ? 'objetivos' : 'repeticiones'}${settings.exercise === 'curl' || settings.exercise === 'press' ? ' entre los dos brazos' : ''}, unos <strong>${Math.max(1, mins)} min</strong> con descansos. ${speed}`;
}

/** La caricatura de la página: el monigote repite el ejercicio elegido mientras se ve (RepArena: demoPage). */
export function demoPage(): void {
  const cv = $<HTMLCanvasElement>('#demoCv');
  const c = cv?.getContext('2d');
  if (!cv || !c || typeof requestAnimationFrame !== 'function') return;
  let t0 = 0;
  const loop = (ts: number): void => {
    if (!document.hidden && !document.documentElement.classList.contains('stage')) {
      const r = cv.getBoundingClientRect();
      if (r.bottom > 0 && r.top < (innerHeight || 1e4)) demoDraw(c, cv.width, cv.height, settings.exercise, settings.mode, (ts - t0) / 1000, { perfectTime: num('perfectTime'), perks: on('perks'), foes: foes(), sword: false, pistol: false });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame((ts) => {
    t0 = ts;
    loop(ts);
  });
}
