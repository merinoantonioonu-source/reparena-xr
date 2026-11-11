// «Hoy», el progreso y el historial de la página (src/page/today-html.ts): lo que se escribe en cada caso.
import { describe, expect, it } from 'vitest';
import type { Mis } from '../../src/core/career.js';
import { DAY_MS, noonOf, type HistRow } from '../../src/core/days.js';
import { careerHTML, historyHTML, numTxt, todayHTML } from '../../src/page/today-html.js';

const now = noonOf(new Date(2026, 10, 11).getTime()); // miércoles 11 de noviembre
const noShield = { n: 0, frozen: [], saved: null };
const row = (daysAgo: number, o: Partial<HistRow> = {}): HistRow => ({ ex: 'squat', mode: 'combat', reps: 20, perfect: 5, time: 300, kcal: 10, date: now - daysAgo * DAY_MS, ...o });
const today = (h: HistRow[], goalMin = 10, shield = noShield) => todayHTML({ h, now, goalMin, kg: 70, shield, career: '' });

describe('«Hoy» en la página', () => {
  it('sin historial: el aviso de empezar, los mensajes vacíos y la tabla sin partidas', () => {
    const T = today([]), H = historyHTML({ h: [], now, kg: 70, frozen: [] });
    expect(T.box).toContain('miércoles 11 de noviembre');
    expect(T.box).toContain('Hoy es un buen día para empezar una racha.');
    expect(H.prog).toBe('<p class="muted">Aún no hay partidas: tu racha de días, el tiempo entrenado y las calorías aparecerán aquí.</p>');
    expect(H.body).toBe('<tr><td colspan="7" class="muted">Sin partidas todavía</td></tr>');
    expect(T.mini).toContain('<b>0 / 10 min</b>');
  });

  it('la racha: esperándote hoy, en singular y con los escudos', () => {
    expect(today([row(1), row(2)]).box).toContain('Aún no has entrenado hoy: tu racha de 2 días te espera. ¡A por ella!');
    const one = today([row(0)]).box;
    expect(one).toContain('día de racha 🔥');
    expect(one).toContain('<em>mejor: 1 día</em>');
    expect(today([row(0)], 10, { n: 2, frozen: [], saved: null }).box).toContain('<em>mejor: 1 día · 🛡 2 escudos</em>');
    const saved = today([row(2)], 10, { n: 0, frozen: ['2026-11-10'], saved: { day: '2026-11-11', n: 1, told: false } }).box;
    expect(saved).toContain('🛡 Un escudo ha salvado tu racha de 1 día: ayer no entrenaste. ¡Hoy no lo dejes!');
    const H = historyHTML({ h: [row(1)], now, kg: 70, frozen: [] });
    expect(H.prog).toContain('<b>1 día</b><span>seguidos: entrena hoy para no perderla</span>');
  });

  it('el anillo: lo que falta de la vuelta y la meta cumplida', () => {
    const C = 2 * Math.PI * 52;
    const half = today([row(0, { time: 300 })]).box; // 5 de 10 min
    expect(half).toContain(`style="stroke-dasharray:${C};stroke-dashoffset:${C}" data-off="${C * 0.5}"`);
    expect(half).toContain('Te faltan 5 min para tu meta de 10 min.');
    expect(today([row(0, { time: 550 })]).box).toContain('Te falta muy poco');
    const done = today([row(0, { time: 900 }), row(1, { time: 600 })]).box;
    expect(done).toContain('class="ring done"');
    expect(done).toContain('data-off="0"');
    expect(done).toContain('¡Meta cumplida! Y es tu mejor día. 🏆');
    expect(today([row(0, { time: 900 }), row(1, { time: 1200 })]).box).toContain('Tu mejor día: 20 min. ¿Lo superas?');
  });

  it('las barras de la semana: la altura frente al día más largo (o la meta) y la línea de la meta', () => {
    const box = today([row(0, { time: 1200 }), row(3, { time: 600 })]).box; // meta 10 min, el día más largo 20
    expect(box).toContain('<div class="bar now"><div class="col"><small>20</small><i data-h="100" style="height:0"></i></div><span>hoy</span></div>');
    expect(box).toContain('<small>10</small><i data-h="50"');
    expect(box).toContain('<span>do</span>'); // el domingo, hace tres días
    expect(box).toContain('class="goalLine" style="bottom:60px"'); // 22 + 76 · 10/20
    expect(box.match(/class="bar/g)).toHaveLength(7);
  });

  it('los ejercicios de hoy y la tabla, con los nombres escapados', () => {
    const box = today([row(0, { ex: '<b>"x"&', reps: 7 }), row(0, { reps: 3 })]).box;
    expect(box).toContain('<span class="chip">&lt;b&gt;&quot;x&quot;&amp; · 7</span><span class="chip">Sentadillas · 3</span>');
    const H = historyHTML({ h: [row(0, { ex: 'hang', reps: 40 }), row(1, { ex: 'hang', reps: 0, perfect: 0 })], now, kg: 70, frozen: [] });
    expect(H.body).toBe('<tr><td>Colgado (segundos)</td><td>2</td><td>40</td><td>40</td><td>5</td><td>10 min</td><td>20</td></tr>');
  });

  it('el nivel y las misiones', () => {
    const M: Mis = { day: '2026-11-11', chest: false, list: [{ t: 'reps', n: 60, got: 75, done: true }, { t: 'mins', n: 15, got: 7.8, done: false }, { t: 'ex', n: 1, got: 0, done: false, arg: 'curl2' }] };
    const html = careerHTML({ n: 3, into: 30, need: 140 }, M, 2);
    expect(html).toContain('<b>3</b><span>Nivel 3 · Aprendiz<i style="--k:21%"></i><small>30 / 140 XP</small>');
    expect(html).toContain('<li class="done"><span>Haz 60 repeticiones</span><em>✓</em></li>');
    expect(html).toContain('<li class=""><span>Entrena 15 minutos</span><em>7 / 15</em></li>');
    expect(html).toContain('Haz una ronda de curl con barra o kettlebell');
    expect(html).toContain('+100 XP, un escudo de racha');
    expect(html).toContain('<b>2 de 3</b>');
    expect(careerHTML({ n: 1, into: 0, need: 100 }, { ...M, chest: true }, 0)).toContain('Cofre del día abierto');
  });

  it('las cifras que suben, enteras', () => {
    expect(numTxt(12.6, 0)).toBe('13');
    expect(numTxt(12.4, 1)).toBe('12');
  });
});
