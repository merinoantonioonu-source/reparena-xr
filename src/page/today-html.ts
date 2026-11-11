/**
 * «Hoy», tu progreso y tu historial en la página web, como en RepArena (src/00_core.js: numTxt, renderToday y
 * renderHistory; src/73_career.js: careerHTML): el HTML tal cual lo escribe RepArena (mismas clases, mismos textos), para
 * que la hoja de estilos portada sirva igual. Aquí solo se arma el texto, con los datos que se le pasan (sin DOM ni
 * globales, para probarlo y compararlo con RepArena); lo escribe en la página src/page/today.ts.
 */
import { CHEST_XP, MIS, SHIELD_MAX, titleOf, type Career, type Mis } from '../core/career.js';
import { EX_NAMES } from '../core/catalog.js';
import { MONTH, WDAY, dayKey, dayStats, daysTxt, fmtDur, progress, runKcal, type HistRow } from '../core/days.js';
import { escHTML } from './dom.js';

/** Las cifras que suben (data-to): enteras. (En RepArena, con decimales iba por fmtNum con 0,1, que también redondea a
 * entero: así queda igual.) */
export const numTxt = (v: number, dec: number): string => (dec ? v.toFixed(0) : String(Math.round(v)));

/** Los escudos tal como están guardados (Career.streakSave). */
export type ShieldState = ReturnType<Career['streakSave']>;

export interface TodayData {
  h: HistRow[];
  now: number;
  /** Tu meta del día, en minutos (ajuste goalMin). */
  goalMin: number;
  /** Tu peso (ajuste weight), para las calorías de las rondas antiguas. */
  kg: number;
  shield: ShieldState;
  /** El bloque del nivel y las misiones (careerHTML), o '' si no hay carrera. */
  career: string;
}

/** El nivel y las misiones de hoy, dentro del panel de Hoy (RepArena: careerHTML). L: lvlOf() antes de pedir las
 * misiones (al pedirlas en un día nuevo puede ganarse experiencia: RepArena enseña el nivel de antes); shield: los escudos
 * que tienes (cr.shield, ya después de pedir las misiones: en un día nuevo puede gastarse alguno). */
export function careerHTML(L: { n: number; into: number; need: number }, M: Mis, shield: number): string {
  return `<div class="career"><div class="lvl"><b>${L.n}</b><span>Nivel ${L.n} · ${titleOf(L.n)}<i style="--k:${Math.round((100 * L.into) / L.need)}%"></i><small>${L.into} / ${L.need} XP</small></span></div>
    <ul class="mis">${M.list.map((m) => `<li class="${m.done ? 'done' : ''}"><span>${escHTML(MIS[m.t].txt(m))}</span><em>${m.done ? '✓' : `${Math.min(m.n, Math.floor(m.got))} / ${m.n}`}</em></li>`).join('')}</ul>
    <p class="chest">${M.chest ? 'Cofre del día abierto' : `Cumple las tres misiones y se abre el cofre del día: +${CHEST_XP} XP, un escudo de racha y, si queda alguno, un color`}</p>
    <p class="shield">🛡 Escudos de racha: <b>${shield} de ${SHIELD_MAX}</b>. Si un día no entrenas, se gasta uno solo y tu racha sigue.</p></div>`;
}

/** Lo de hoy, grande (#todayBox) y en pequeño en el panel fijo (#todayMini): el anillo hacia tu meta, las cifras frente a
 * ayer, tu racha, el nivel y las misiones, los ejercicios de hoy y los últimos 7 días en barras. */
export function todayHTML(o: TodayData): { box: string; mini: string } {
  const { h, now, goalMin } = o;
  const D = dayStats(h, now, o.kg), P = progress(h, now, o.shield.frozen, o.kg), T = D.today, goal = goalMin * 60, k = Math.min(1, T.time / goal), d = new Date(now);
  const R = 52, C = 2 * Math.PI * R, mins = Math.round(T.time / 60);
  const cmp = (a: number, b: number, unit: string) => (!b ? '' : a > b ? `<em class="up">▲ ${Math.round(a - b)} ${unit} más que ayer</em>` : a < b ? `<em class="down">${Math.round(b - a)} ${unit} menos que ayer</em>` : '<em>igual que ayer</em>');
  const tile = (cls: string, val: number, dec: number, lab: string, extra = '') => `<div class="tile ${cls}"><b data-to="${val}" data-dec="${dec}">${numTxt(val, dec)}</b><span>${lab}</span>${extra}</div>`;
  const maxW = Math.max(goal, ...D.week.map((w) => w.v.time)) || 1;
  // (el nombre de un ejercicio que no conocemos viene tal cual del historial guardado: se escapa)
  const exs = Object.entries(T.ex).sort((a, b) => b[1] - a[1]).map(([x, n]) => `<span class="chip">${escHTML(EX_NAMES[x] || x)} · ${n}</span>`).join('');
  const SV = o.shield, shTxt = SV.n ? ` · 🛡 ${SV.n} ${SV.n === 1 ? 'escudo' : 'escudos'}` : '';
  const msg = SV.saved && SV.saved.day === dayKey(now) && !T.time ? `🛡 Un escudo ha salvado tu racha de ${daysTxt(P.streak)}: ${SV.saved.n === 1 ? 'ayer no entrenaste' : `llevabas ${SV.saved.n} días sin entrenar`}. ¡Hoy no lo dejes!`
    : !T.time ? (P.streak ? `Aún no has entrenado hoy: tu racha de ${daysTxt(P.streak)} te espera. ¡A por ella!` : 'Hoy es un buen día para empezar una racha.')
    : k >= 1 ? `¡Meta cumplida! ${D.best.time && T.time > D.best.time ? 'Y es tu mejor día. 🏆' : `Tu mejor día: ${fmtDur(D.best.time)}. ¿Lo superas?`}`
    : `Te ${goal - T.time > 90 ? `faltan ${Math.ceil((goal - T.time) / 60)} min` : 'falta muy poco'} para tu meta de ${goalMin} min.`;
  const box = `
    <div class="todayHead"><h2>Hoy</h2><span>${WDAY[d.getDay()]} ${d.getDate()} de ${MONTH[d.getMonth()]}</span></div>
    <div class="todayGrid">
      <div class="ring${k >= 1 ? ' done' : ''}" role="img" aria-label="${mins} de ${goalMin} minutos de tu meta diaria">
        <svg viewBox="0 0 120 120"><defs><linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3cf0c6"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient></defs>
          <circle cx="60" cy="60" r="${R}" class="track"/><circle cx="60" cy="60" r="${R}" class="fill" style="stroke-dasharray:${C};stroke-dashoffset:${C}" data-off="${C * (1 - k)}"/></svg>
        <div class="ringTxt"><b data-to="${mins}" data-dec="0">${mins}</b><span>de ${goalMin} min</span></div>
      </div>
      <div class="tiles">
        ${tile('t-reps', T.reps, 0, 'repeticiones', cmp(T.reps, D.yest.reps, 'reps'))}
        ${tile('t-kcal', Math.round(T.kcal), 0, '≈ kcal', cmp(T.kcal, D.yest.kcal, 'kcal'))}
        ${tile('t-perf', T.perfect, 0, 'perfectas', T.reps ? `<em>${Math.round((100 * T.perfect) / T.reps)} % de las reps</em>` : '')}
        ${tile('t-streak', P.streak, 0, P.streak === 1 ? 'día de racha 🔥' : 'días de racha 🔥', `<em>mejor: ${daysTxt(P.best)}${shTxt}</em>`)}
      </div>
    </div>
    ${o.career}
    ${exs ? `<div class="chips">${exs}</div>` : ''}
    <div class="week" aria-label="Minutos de los últimos 7 días">${D.week.map((w, i) => `<div class="bar${i === 6 ? ' now' : ''}"><div class="col"><small>${w.v.time ? Math.round(w.v.time / 60) : ''}</small><i data-h="${Math.round((100 * w.v.time) / maxW)}" style="height:0"></i></div><span>${i === 6 ? 'hoy' : WDAY[w.d.getDay()].slice(0, 2)}</span></div>`).join('')}<div class="goalLine" style="bottom:${22 + Math.round((76 * goal) / maxW)}px" title="tu meta"></div></div>
    <p class="todayMsg">${msg}</p>`;
  // y en pequeño, en el panel fijo (lleva al grande)
  const mini = `<a href="#todayBox" aria-label="Hoy: ${mins} de ${goalMin} minutos, ${T.reps} repeticiones, ${P.streak} días de racha. Ver el día"><span class="tmRing" style="--k:${Math.round(k * 100)}%"><i>${mins}</i></span><span class="tmS"><b>${mins} / ${goalMin} min</b><small>hoy</small></span><span class="tmS"><b>${T.reps}</b><small>reps</small></span><span class="tmS"><b>${P.streak} 🔥</b><small>racha</small></span><span class="tmMore">Ver el día ↓</span></a>`;
  return { box, mini };
}

export interface HistData {
  h: HistRow[];
  now: number;
  kg: number;
  /** Los días que salvó un escudo (streakSave().frozen), leídos antes de pintar «Hoy», como RepArena. */
  frozen: string[];
}

/** Tu progreso (#progBox: racha, mejor racha, semana y total) y la tabla por ejercicio (#histBody). */
export function historyHTML(o: HistData): { prog: string; body: string } {
  const { h, kg } = o, P = progress(h, o.now, o.frozen, kg);
  const box = (big: string, small: string) => `<div class="stat"><b>${big}</b><span>${small}</span></div>`;
  const prog = h.length
    ? [
        box(daysTxt(P.streak), P.streak ? (P.trainedToday ? 'seguidos entrenando' : 'seguidos: entrena hoy para no perderla') : 'de racha: empieza hoy'),
        box(daysTxt(P.best), 'mejor racha'),
        box(fmtDur(P.week.time), `esta semana · ${daysTxt(P.week.days)} · ≈ ${Math.round(P.week.kcal)} kcal`),
        box(fmtDur(P.total.time), `en total · ${daysTxt(P.total.days)} · ≈ ${Math.round(P.total.kcal)} kcal`),
      ].join('')
    : '<p class="muted">Aún no hay partidas: tu racha de días, el tiempo entrenado y las calorías aparecerán aquí.</p>';
  // (como RepArena, sin «|| 0» en las repeticiones y perfectas: una fila rota da NaN en la suma y «–» en la mejor)
  const body = Object.keys(EX_NAMES).map((ex) => {
    const s = h.filter((r) => r.ex === ex);
    if (!s.length) return '';
    return `<tr><td>${EX_NAMES[ex]}${ex === 'hang' ? ' (segundos)' : ''}</td><td>${s.length}</td><td>${s.reduce((a, r) => a + (r.reps as number), 0)}</td><td>${s.reduce((a, r) => Math.max(a, r.reps as number), 0) || '–'}</td><td>${s.reduce((a, r) => a + (r.perfect as number), 0)}</td><td>${fmtDur(s.reduce((a, r) => a + (r.time || 0), 0))}</td><td>${Math.round(s.reduce((a, r) => a + runKcal(r, kg), 0))}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">Sin partidas todavía</td></tr>';
  return { prog, body };
}
