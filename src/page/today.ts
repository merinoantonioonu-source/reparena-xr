/**
 * «Hoy», tu progreso y tu historial, escritos en la página (RepArena: renderToday, animateToday y renderHistory de
 * src/00_core.js). El HTML lo arma src/page/today-html.ts; aquí se le dan los datos de verdad (el historial guardado, tu
 * carrera, tu meta y tu peso) y se anima: las cifras suben, el anillo se llena y las barras crecen.
 */
import { career } from '../combat/career-hub.js';
import { HIST_KEY } from '../core/run.js';
import { store } from '../core/settings.js';
import { num } from '../core/values.js';
import type { HistRow } from '../core/days.js';
import { $ } from './dom.js';
import { careerHTML, historyHTML, numTxt, todayHTML } from './today-html.js';

const kg = (): number => num('weight') || 70;
const hist = (): HistRow[] => store<HistRow[]>(HIST_KEY) || [];

/** Lo de hoy en #todayBox (y en pequeño en #todayMini). host: dónde va el grande (de serie, #todayBox). */
export function renderToday(host: HTMLElement | null = $('#todayBox'), h: HistRow[] = hist(), now = Date.now()): void {
  if (!host) return;
  const c = career(), shield = c.streakSave();
  // (el nivel antes que las misiones: al salir las de un día nuevo puede subir la experiencia, como en RepArena)
  const L = c.lvlOf(), M = c.misToday();
  const { box, mini } = todayHTML({ h, now, goalMin: num('goalMin'), kg: kg(), shield, career: careerHTML(L, M, c.cr.shield) });
  host.innerHTML = box;
  const m = $('#todayMini');
  if (m) m.innerHTML = mini;
  animateToday(host);
}

/** Las cifras suben desde 0, el anillo se llena y las barras crecen (sin animación si el sistema pide menos movimiento). */
export function animateToday(host: HTMLElement): void {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  const nums = [...host.querySelectorAll<HTMLElement>('[data-to]')], ring = host.querySelector<SVGElement>('.fill'), bars = [...host.querySelectorAll<HTMLElement>('[data-h]')];
  const ringOn = () => { if (ring) ring.style.strokeDashoffset = ring.dataset.off ?? ''; };
  const finish = () => {
    nums.forEach((n) => { n.textContent = numTxt(+(n.dataset.to ?? 0), +(n.dataset.dec ?? 0)); });
    ringOn();
    bars.forEach((b) => { b.style.height = 0.76 * +(b.dataset.h ?? 0) + 'px'; });
  };
  if (still || !raf) { finish(); return; }
  // (dos fotogramas: el primero pinta el anillo vacío y las barras a 0, y así la transición de la hoja de estilos se ve)
  raf(() => raf(() => {
    ringOn();
    bars.forEach((b, i) => { b.style.transitionDelay = `${i * 60}ms`; b.style.height = 0.76 * +(b.dataset.h ?? 0) + 'px'; });
  }));
  const t0 = performance.now(), dur = 1100;
  const step = (t: number) => {
    const u = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - u, 3);
    nums.forEach((n) => { n.textContent = numTxt(+(n.dataset.to ?? 0) * e, +(n.dataset.dec ?? 0)); });
    if (u < 1) raf(step);
    else finish();
  };
  raf(step);
}

/** Tu progreso (#progBox) y el historial por ejercicio (#histBody), y también lo de hoy. */
export function renderHistory(): void {
  const h = hist(), now = Date.now();
  // (los días salvados, leídos antes de pintar «Hoy»: al pedir las misiones de un día nuevo puede gastarse un escudo, y
  // RepArena enseña el progreso de antes)
  const frozen = career().streakSave().frozen;
  renderToday($('#todayBox'), h, now);
  const { prog, body } = historyHTML({ h, now, kg: kg(), frozen });
  const p = $('#progBox'), b = $('#histBody');
  if (p) p.innerHTML = prog;
  if (b) b.innerHTML = body;
}

/** Tras cada ronda o cambio del historial: todo lo de Progreso, «Hoy» incluido. */
export const refreshProgress = renderHistory;
