/**
 * Los dibujos de la carrera de RepArena (src/73_career.js: drawStar, drawLvlBadge, drawXP, drawWeek, drawFlame, drawShield,
 * drawChest, drawMissions, drawCampMap, drawGoal, la tecla de la racha de goalTiles y drawHoy; src/60_ui.js: glowText),
 * portados tal cual (misma geometría, colores, letras y textos): los menús son los de RepArena enteros. Cada uno pinta en
 * el lienzo que se le da, en el hueco que se le da; los datos, de la carrera del juego (career(), progressNow(), history()).
 */
import { CAMP_N, CAMP_REG, campId, CHEST_XP, MIS, MIS_XP, misGot, misShort, PROG_COL, SHIELD_MAX, type Gain, type MisItem } from '../../core/career.js';
import { RANKS } from '../../core/catalog.js';
import { daysTxt, dayStats, WDAY } from '../../core/days.js';
import { num, settings } from '../../core/values.js';
import { career, history, progressNow } from '../../combat/career-hub.js';
import { FB, FD, fitFont, rr, TAU } from '../canvas-kit.js';
import { comicOn } from './kit.js';

type Ctx = CanvasRenderingContext2D;

/** Un texto que brilla (en cómic, con contorno de tinta en vez de brillo). */
export function glowText(c: Ctx, t: string, x: number, y: number, col: string, blur: number): void {
  c.save();
  if (comicOn()) {
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = '#140c1a';
    c.strokeText(t, x, y);
  } else {
    c.shadowColor = col;
    c.shadowBlur = blur;
  }
  c.fillStyle = col;
  c.fillText(t, x, y);
  c.restore();
}

/** Una estrella (llena: conseguida; apagada: te falta). */
export function drawStar(c: Ctx, x: number, y: number, r: number, on: boolean): void {
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, q = k % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
  c.fillStyle = on ? '#ffd166' : 'rgba(255,255,255,0.12)';
  c.fill();
  if (on) {
    c.lineWidth = Math.max(1, r * 0.12);
    c.strokeStyle = '#8a5a0e';
    c.stroke();
  }
}

/** La insignia del nivel: un hexágono dorado con el número. */
export function drawLvlBadge(c: Ctx, cx: number, cy: number, R: number, n: number): void {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  c.closePath();
  const g = c.createLinearGradient(cx, cy - R, cx, cy + R);
  g.addColorStop(0, '#fff0a8');
  g.addColorStop(0.55, '#ffc94a');
  g.addColorStop(1, '#b97a12');
  c.fillStyle = g;
  c.fill();
  c.lineWidth = Math.max(2, R * 0.08);
  c.strokeStyle = '#6e4508';
  c.stroke();
  c.fillStyle = '#2a1600';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  fitFont(c, String(n), R * 1.3, Math.round(R * 1.05), '%px ' + FD);
  c.fillText(String(n), cx, cy + R * 0.06);
}

/** El nivel, el título y la barra de experiencia (con lo ganado en esta ronda, G, en dorado). */
export function drawXP(c: Ctx, x: number, y: number, w: number, h: number, G: Gain | null = null): void {
  const C = career(), L = C.lvlOf(), R = Math.min(h * 0.4, w * 0.13), cx = x + R + 6, cy = y + h / 2;
  drawLvlBadge(c, cx, cy, R, L.n);
  const bx = cx + R + 14, bw = x + w - bx - 6, by = y + h * 0.47, bh = Math.max(8, h * 0.15);
  const head = `Nivel ${L.n} · ${C.titleOf(L.n)}`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = '#eeeaff';
  fitFont(c, head, bw, Math.round(h * 0.24), '700 %px ' + FB);
  c.fillText(head, bx, y + h * 0.22);
  rr(c, bx, by, bw, bh, bh / 2);
  c.fillStyle = 'rgba(255,255,255,0.1)';
  c.fill();
  const k = L.into / L.need, up = !!G && C.lvlOf(G.xp0).n < L.n, k0 = G && !up ? Math.max(0, (L.into - G.xp) / L.need) : up ? 0 : k;
  if (k0 > 0.001) {
    rr(c, bx, by, Math.max(bh, bw * k0), bh, bh / 2);
    c.fillStyle = PROG_COL;
    c.fill();
  }
  if (k - k0 > 0.001) {
    rr(c, bx + bw * k0, by, Math.max(bh, bw * (k - k0)), bh, bh / 2);
    c.fillStyle = '#ffd166';
    c.fill();
  }
  const u = C.nextUnlock(), t = `${L.into} / ${L.need} XP`, t2 = G && G.xp ? `+${G.xp} XP` : u ? `Nivel ${u.n}: ${u.label}` : '';
  c.fillStyle = '#a49fc8';
  fitFont(c, t, bw * 0.5, Math.round(h * 0.19), '600 %px ' + FB);
  c.fillText(t, bx, y + h * 0.8);
  if (t2) {
    c.textAlign = 'right';
    c.fillStyle = G && G.xp ? '#ffd166' : '#a49fc8';
    fitFont(c, t2, bw * 0.5, Math.round(h * 0.19), '700 %px ' + FB);
    c.fillText(t2, bx + bw, y + h * 0.8);
  }
}

/** Los últimos 7 días: minutos de cada uno en barras (hoy, en turquesa) y la raya de tu meta. */
export function drawWeek(c: Ctx, x: number, y: number, w: number, h: number): void {
  const D = dayStats(history(), Date.now(), num('weight') || 70), goal = num('goalMin'), mx = Math.max(goal, ...D.week.map((d) => d.v.time / 60)) || 1;
  const n = 7, gap = w * 0.025, bw = (w - gap * (n - 1)) / n, top = y + h * 0.32, base = y + h * 0.8;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = '#a49fc8';
  fitFont(c, 'Tu semana (minutos)', w, Math.round(h * 0.13), '600 %px ' + FB);
  c.fillText('Tu semana (minutos)', x, y + h * 0.08);
  D.week.forEach((d, i) => {
    const m = d.v.time / 60, bh = Math.max(m > 0 ? 3 : 0, ((base - top) * m) / mx), bx = x + i * (bw + gap), today = i === n - 1;
    rr(c, bx, top, bw, base - top, Math.min(8, bw / 3));
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fill();
    if (bh) {
      rr(c, bx, base - bh, bw, bh, Math.min(8, bw / 3, bh / 2));
      c.fillStyle = today ? '#3cf0c6' : '#5ab8ff';
      c.fill();
    }
    c.textAlign = 'center';
    c.fillStyle = '#eeeaff';
    if (m >= 1) {
      fitFont(c, String(Math.round(m)), bw, Math.round(h * 0.12), '700 %px ' + FB);
      c.fillText(String(Math.round(m)), bx + bw / 2, base - bh - h * 0.07);
    }
    c.fillStyle = today ? '#3cf0c6' : '#a49fc8';
    const lab = today ? 'hoy' : WDAY[d.d.getDay()].slice(0, 2);
    fitFont(c, lab, bw + gap, Math.round(h * 0.12), '600 %px ' + FB);
    c.fillText(lab, bx + bw / 2, base + h * 0.1);
  });
  const gy = base - ((base - top) * goal) / mx;
  c.setLineDash([8, 6]);
  c.lineWidth = 2;
  c.strokeStyle = '#ff4fa3';
  c.beginPath();
  c.moveTo(x, gy);
  c.lineTo(x + w, gy);
  c.stroke();
  c.setLineDash([]);
}

/** Una llama (la racha). */
export function drawFlame(c: Ctx, x: number, y: number, s: number): void {
  const g = c.createLinearGradient(x, y - s, x, y + s);
  g.addColorStop(0, '#ffd166');
  g.addColorStop(1, '#ff4a2a');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, y - s);
  c.bezierCurveTo(x + s * 0.9, y - s * 0.2, x + s * 0.7, y + s, x, y + s);
  c.bezierCurveTo(x - s * 0.7, y + s, x - s * 0.9, y - s * 0.1, x - s * 0.2, y - s * 0.45);
  c.bezierCurveTo(x - s * 0.1, y - s * 0.2, x + s * 0.1, y - s * 0.6, x, y - s);
  c.fill();
}

/** Un escudo de racha (lleno: lo tienes; hueco: te falta). */
export function drawShield(c: Ctx, x: number, y: number, s: number, on: boolean): void {
  c.beginPath();
  c.moveTo(x, y - s);
  c.lineTo(x + s * 0.8, y - s * 0.7);
  c.lineTo(x + s * 0.72, y + s * 0.15);
  c.quadraticCurveTo(x + s * 0.5, y + s * 0.7, x, y + s);
  c.quadraticCurveTo(x - s * 0.5, y + s * 0.7, x - s * 0.72, y + s * 0.15);
  c.lineTo(x - s * 0.8, y - s * 0.7);
  c.closePath();
  if (on) {
    const g = c.createLinearGradient(x, y - s, x, y + s);
    g.addColorStop(0, '#bfeaff');
    g.addColorStop(1, '#3a8fd8');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(1.5, s * 0.12);
    c.strokeStyle = '#eaf8ff';
    c.stroke();
  } else {
    c.lineWidth = Math.max(1.5, s * 0.12);
    c.strokeStyle = 'rgba(128,128,128,0.55)';
    c.stroke();
  }
}

/** Un cofre (abierto o cerrado). */
export function drawChest(c: Ctx, x: number, y: number, s: number, open: boolean): void {
  c.fillStyle = '#7a4318';
  rr(c, x - s, y - s * 0.2, s * 2, s * 1.1, s * 0.12);
  c.fill();
  c.fillStyle = '#ffd166';
  c.fillRect(x - s * 0.55, y - s * 0.2, s * 0.18, s * 1.1);
  c.fillRect(x + s * 0.37, y - s * 0.2, s * 0.18, s * 1.1);
  if (open) {
    c.fillStyle = '#1a0d04';
    c.fillRect(x - s * 0.9, y - s * 0.3, s * 1.8, s * 0.2);
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.arc(x, y - s * 0.3, s * 0.55, Math.PI, 0);
    c.fill();
    c.fillStyle = '#9a5622';
    rr(c, x - s, y - s * 1.25, s * 2, s * 0.45, s * 0.12);
    c.fill();
  } else {
    c.fillStyle = '#9a5622';
    rr(c, x - s, y - s * 0.75, s * 2, s * 0.6, s * 0.25);
    c.fill();
    c.fillStyle = '#ffd166';
    c.fillRect(x - s * 0.12, y - s * 0.35, s * 0.24, s * 0.3);
  }
}

/** Las tres misiones con su progreso, el cofre del día y la racha. */
export function drawMissions(c: Ctx, x: number, y: number, w: number, h: number): void {
  const C = career(), M = C.misToday(), P = progressNow(), rh = h * 0.24;
  M.list.forEach((m, i) => {
    const ry = y + i * rh, cy = ry + rh * 0.45, r = rh * 0.26, done = m.done;
    c.beginPath();
    c.arc(x + r + 4, cy, r, 0, TAU);
    c.fillStyle = done ? '#3cf0c6' : 'rgba(255,255,255,0.08)';
    c.fill();
    if (done) {
      c.strokeStyle = '#06261f';
      c.lineWidth = r * 0.3;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + 4 + r * 0.5, cy);
      c.lineTo(x + 4 + r * 0.9, cy + r * 0.4);
      c.lineTo(x + 4 + r * 1.5, cy - r * 0.45);
      c.stroke();
    }
    const tx = x + r * 2 + 16, tw = w - (tx - x), txt = MIS[m.t].txt(m), got = misGot(m);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = done ? '#3cf0c6' : '#eeeaff';
    fitFont(c, txt, tw * 0.76, Math.round(rh * 0.4), '600 %px ' + FB);
    c.fillText(txt, tx, cy - rh * 0.14);
    const by = cy + rh * 0.2, bh = Math.max(6, rh * 0.13);
    rr(c, tx, by, tw * 0.72, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    if (got > 0) {
      rr(c, tx, by, Math.max(bh, (tw * 0.72 * got) / m.n), bh, bh / 2);
      c.fillStyle = done ? '#3cf0c6' : PROG_COL;
      c.fill();
    }
    const g = done ? `+${MIS_XP} XP` : `${got} / ${m.n}`;
    c.textAlign = 'right';
    c.fillStyle = '#a49fc8';
    fitFont(c, g, tw * 0.22, Math.round(rh * 0.34), '700 %px ' + FB);
    c.fillText(g, x + w, cy);
  });
  const fy = y + h * 0.84, s = h * 0.075;
  drawChest(c, x + s + 4, fy + s * 0.2, s, M.chest);
  c.textAlign = 'left';
  c.fillStyle = M.chest ? '#ffd166' : '#a49fc8';
  const ct = M.chest ? '¡Cofre del día abierto!' : `Cofre: +${CHEST_XP} XP y un escudo`;
  fitFont(c, ct, w * 0.36, Math.round(h * 0.085), '600 %px ' + FB);
  c.fillText(ct, x + s * 2 + 14, fy);
  drawFlame(c, x + w * 0.5, fy, s * 0.9);
  c.fillStyle = '#ffb36b';
  const st = `Racha: ${daysTxt(P.streak)} · mejor ${P.best}`;
  fitFont(c, st, w * 0.3, Math.round(h * 0.085), '600 %px ' + FB);
  c.fillText(st, x + w * 0.5 + s + 8, fy);
  for (let i = 0; i < SHIELD_MAX; i++) drawShield(c, x + w - (SHIELD_MAX - i) * s * 2 + s * 0.8, fy, s * 0.85, i < C.cr.shield); // (los escudos de racha)
}

// el fondo de cada región, según su entorno (arriba y abajo del degradado)
const CAMP_BG: Record<string, [string, string]> = { arena: ['#3a2f2a', '#1c1a22'], nature: ['#28503a', '#13241c'], island: ['#2a6f86', '#d9b979'] };

/** El mapa de una región de la campaña (la del modo y el ejercicio que juegas): un camino con sus cinco niveles (el del
 * jefe, más grande y con corona), sus estrellas, el siguiente por jugar en turquesa y el elegido (sel) rodeado. */
export function drawCampMap(c: Ctx, x: number, y: number, w: number, h: number, reg: number, sel: number): void {
  const K = career(), id = campId(settings.mode, settings.exercise), C = K.campOf(id), bg = CAMP_BG[CAMP_REG[reg][1]] || CAMP_BG.arena;
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, bg[0]);
  g.addColorStop(1, bg[1]);
  rr(c, x, y, w, h, 18);
  c.fillStyle = g;
  c.fill();
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  const tt = `${reg + 1}. ${CAMP_REG[reg][0]} · ${RANKS[reg][1]}`;
  fitFont(c, tt, w * 0.7, Math.round(h * 0.11), '700 %px ' + FB);
  c.fillText(tt, x + 16, y + h * 0.12);
  c.textAlign = 'right';
  c.fillStyle = '#ffd166';
  const st = `${K.campStars(id)} / ${CAMP_N * 3} estrellas`;
  fitFont(c, st, w * 0.28, Math.round(h * 0.09), '700 %px ' + FB);
  c.fillText(st, x + w - 16, y + h * 0.12);
  const pts = [0, 1, 2, 3, 4].map((i): [number, number] => [x + w * (0.1 + i * 0.2), y + h * (i % 2 ? 0.45 : 0.6)]);
  c.lineWidth = Math.max(4, h * 0.04);
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.setLineDash([12, 10]);
  c.beginPath();
  pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.stroke();
  c.setLineDash([]);
  pts.forEach(([px, py], i) => {
    const lv = reg * 5 + i + 1, boss = i === 4, R = h * (boss ? 0.15 : 0.12), open = lv <= C.at, st = C.stars[lv] || 0, next = lv === C.at;
    if (lv === sel) {
      c.beginPath();
      c.arc(px, py, R * 1.35, 0, TAU);
      c.lineWidth = Math.max(3, R * 0.15);
      c.strokeStyle = '#ffffff';
      c.stroke();
    }
    c.beginPath();
    c.arc(px, py, R, 0, TAU);
    c.fillStyle = !open ? 'rgba(0,0,0,0.55)' : next ? '#3cf0c6' : st ? '#ffd166' : '#eeeaff';
    c.fill();
    c.lineWidth = Math.max(2, R * 0.1);
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.stroke();
    c.textAlign = 'center';
    c.fillStyle = open ? '#1a1030' : 'rgba(255,255,255,0.4)';
    fitFont(c, String(lv), R * 1.4, Math.round(R * 0.95), '%px ' + FD);
    c.fillText(String(lv), px, py + R * 0.05);
    if (boss) {
      // la corona del jefe
      c.fillStyle = open ? '#ff4a6a' : 'rgba(255,74,106,0.4)';
      c.beginPath();
      c.moveTo(px - R * 0.7, py - R * 0.95);
      c.lineTo(px - R * 0.7, py - R * 1.45);
      c.lineTo(px - R * 0.35, py - R * 1.15);
      c.lineTo(px, py - R * 1.55);
      c.lineTo(px + R * 0.35, py - R * 1.15);
      c.lineTo(px + R * 0.7, py - R * 1.45);
      c.lineTo(px + R * 0.7, py - R * 0.95);
      c.closePath();
      c.fill();
    }
    for (let k = 0; k < 3; k++) drawStar(c, px + (k - 1) * R * 0.75, py + R * 1.45, R * 0.32, k < st);
  });
}

/** Una meta: el círculo (con ✓ si está), su texto (long: el largo), la barra y lo que llevas; tc: el color de la letra. */
export function drawGoal(c: Ctx, m: MisItem, x: number, y: number, w: number, h: number, tc: string, long = false): void {
  const r = h * 0.2, cx = x + r, cy = y + h * 0.36, done = m.done, got = misGot(m), tx = x + r * 2 + h * 0.12, tw = w - (tx - x);
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.fillStyle = done ? '#3cf0c6' : 'rgba(128,128,128,0.35)';
  c.fill();
  if (done) {
    c.strokeStyle = '#06261f';
    c.lineWidth = r * 0.32;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx - r * 0.45, cy);
    c.lineTo(cx - r * 0.1, cy + r * 0.38);
    c.lineTo(cx + r * 0.5, cy - r * 0.42);
    c.stroke();
  }
  const t = long ? MIS[m.t].txt(m) : misShort(m);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = done ? '#2bd4ad' : tc;
  fitFont(c, t, tw, Math.round(h * 0.3), '700 %px ' + FB);
  c.fillText(t, tx, cy);
  const by = y + h * 0.7, bh = Math.max(4, h * 0.11), bw = tw * 0.62;
  rr(c, tx, by - bh / 2, bw, bh, bh / 2);
  c.fillStyle = 'rgba(128,128,128,0.3)';
  c.fill();
  if (got > 0) {
    rr(c, tx, by - bh / 2, Math.max(bh, (bw * got) / m.n), bh, bh / 2);
    c.fillStyle = done ? '#3cf0c6' : PROG_COL;
    c.fill();
  }
  c.textAlign = 'right';
  c.fillStyle = done ? '#2bd4ad' : tc;
  const g = done ? `+${MIS_XP} XP` : `${got} / ${m.n}`;
  fitFont(c, g, tw * 0.34, Math.round(h * 0.24), '700 %px ' + FB);
  c.fillText(g, x + w, by);
}

/** La cuarta tecla de la franja de metas (RepArena: goalTiles): la racha con su llama, los escudos y el cofre; W × H, la
 * tecla entera; tc, el color de la letra. */
export function drawStreakTile(c: Ctx, W: number, H: number, tc: string): void {
  const C = career(), M = C.misToday(), P = progressNow(), dt = daysTxt(P.streak);
  drawFlame(c, H * 0.32, H * 0.32, H * 0.2);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = tc;
  const x = H * 0.6;
  fitFont(c, dt, W - x - 6, Math.round(H * 0.26), '800 %px ' + FB);
  c.fillText(dt, x, H * 0.32);
  const sr = H * 0.12;
  for (let i = 0; i < SHIELD_MAX; i++) drawShield(c, H * 0.2 + sr + i * sr * 2.3, H * 0.72, sr, i < C.cr.shield);
  const tx = H * 0.2 + SHIELD_MAX * sr * 2.3 + 6, left = M.list.filter((m) => !m.done).length, ct = M.chest ? 'cofre ✓' : `cofre: ${left}`;
  drawChest(c, tx + sr, H * 0.74, sr * 0.8, M.chest);
  c.fillStyle = M.chest ? '#c99a1e' : tc;
  fitFont(c, ct, W - tx - sr * 2.4 - 4, Math.round(H * 0.19), '700 %px ' + FB);
  c.fillText(ct, tx + sr * 2.4, H * 0.72);
}

/** Lo común de la carátula «METAS DE HOY» (big) y de la columna «HOY»: título, las tres metas, el cofre, la racha con los
 * escudos y (en la columna) el nivel. Pinta el lienzo entero (W × H), que antes se borra. */
export function drawHoy(c: Ctx, W: number, H: number, big: boolean): void {
  const K = career(), M = K.misToday(), P = progressNow(), L = K.lvlOf(), pad = W * 0.06, done = M.list.filter((m) => m.done).length;
  c.clearRect(0, 0, W, H);
  rr(c, 6, 6, W - 12, H - 12, W * 0.05);
  {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(42,31,69,0.97)');
    g.addColorStop(1, 'rgba(24,18,44,0.97)');
    c.fillStyle = g;
  }
  c.fill();
  c.lineWidth = big ? 10 : 7;
  c.strokeStyle = big ? '#ff4fa3' : '#3cf0c6';
  c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const t = big ? 'METAS DE HOY' : 'HOY';
  fitFont(c, t, W - pad * 2, Math.round(H * (big ? 0.09 : 0.075)), '%px ' + FD);
  glowText(c, t, W / 2, H * (big ? 0.1 : 0.075), '#ffd166', 14);
  if (big) {
    c.fillStyle = '#a49fc8';
    const st = M.chest ? '¡Las tres cumplidas! El cofre de hoy ya es tuyo' : `${done} de 3 · cumple las tres y se abre el cofre del día`;
    fitFont(c, st, W - pad * 2, Math.round(H * 0.045), '600 %px ' + FB);
    c.fillText(st, W / 2, H * 0.18);
  }
  const y0 = H * (big ? 0.24 : 0.14), gh = H * (big ? 0.15 : 0.13);
  M.list.forEach((m, i) => drawGoal(c, m, pad, y0 + i * gh * 1.08, W - pad * 2, gh, '#eeeaff', big));
  // debajo, cada cosa en su renglón, con sitio para su icono (sin montarse): el cofre, la racha con los escudos a la derecha
  // y, en la columna, el nivel con su barra. Cada texto, alineado a la izquierda y sin pasar de lo que le toca
  let y = y0 + 3 * gh * 1.08 + H * (big ? 0.03 : 0.04);
  const s = H * (big ? 0.045 : 0.04), row = s * (big ? 2.4 : 2.6), tx = pad + s * 2.8;
  const line = (tt: string, lx: number, yy: number, maxW: number, px: number, col: string, wt = 700): void => {
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = col;
    fitFont(c, tt, maxW, Math.round(px), `${wt} %px ` + FB);
    c.fillText(tt, lx, yy);
  };
  drawChest(c, pad + s, y + s * 0.2, s, M.chest);
  line(M.chest ? '¡Cofre del día abierto!' : `Cofre: +${CHEST_XP} XP, un escudo y un color`, tx, y, W - pad - tx, H * (big ? 0.045 : 0.036), '#ffd166');
  y += row;
  drawFlame(c, pad + s, y, s * 0.9);
  const sw = s * 1.9, sx0 = W - pad - SHIELD_MAX * sw + sw / 2;
  for (let i = 0; i < SHIELD_MAX; i++) drawShield(c, sx0 + i * sw, y, s * 0.8, i < K.cr.shield);
  line(`Racha: ${daysTxt(P.streak)}`, tx, y, sx0 - sw / 2 - s * 0.5 - tx, H * (big ? 0.045 : 0.04), '#ffb36b');
  if (!big) {
    y += row;
    drawLvlBadge(c, pad + s, y, s * 1.05, L.n);
    line(`Nivel ${L.n} · ${K.titleOf(L.n)}`, tx, y - s * 0.45, W - pad - tx, H * 0.036, '#eeeaff');
    const bw = W - pad - tx, bh = H * 0.014, by = y + s * 0.45;
    rr(c, tx, by, bw, bh, bh / 2);
    c.fillStyle = 'rgba(128,128,128,0.35)';
    c.fill();
    if (L.into) {
      rr(c, tx, by, Math.max(bh, (bw * L.into) / L.need), bh, bh / 2);
      c.fillStyle = PROG_COL;
      c.fill();
    }
    line(`${L.into} / ${L.need} XP`, tx, by + bh + s * 0.55, bw, H * 0.026, '#a49fc8', 600);
  } else {
    c.textAlign = 'center';
    c.fillStyle = '#a49fc8';
    fitFont(c, 'Cualquier botón (o el pulgar arriba) para seguir', W - pad * 2, Math.round(H * 0.038), '600 %px ' + FB);
    c.fillText('Cualquier botón (o el pulgar arriba) para seguir', W / 2, H * 0.94);
  }
}
