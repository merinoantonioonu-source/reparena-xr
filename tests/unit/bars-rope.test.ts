// La aventura en la cuerda del remo invertido (pedido del usuario: «A con tramos de B», resbalar mínimamente, en Barras, con
// una paralela o dos; la escena A: torres sobre un valle alpino): cables rectos de torre en torre que acaban en vertical hasta
// la plataforma; cada remo sube y, sin remar, se resbala un poco, nunca más abajo de la plataforma de salida. Nada flota.
import { describe, expect, it } from 'vitest';
import { FALL, ROPE, ROPE_CHUNK, RopeCourse, RopeRun, ropeDecoPuts } from '../../src/modes/bars/rope';
import { ROPE_WORLDS, worldOf, worldPano, worldStarts } from '../../src/modes/bars/rope-worlds';

const DEG = 180 / Math.PI;
const lens = [10, 12, 14, 16, 18].map((r) => r * ROPE.perRep);
const TREES = ['Pine_2', 'Pine_4', 'Pine_5', 'DeadTree_1'];

describe('el recorrido de la cuerda', () => {
  const C = new RopeCourse(lens, 7);

  it('sube siempre; cada cable, recto y tenso (de 30° a 42°, con una comba leve: menos de 3° de diferencia de punta a punta)', () => {
    let lastH = -1, lastY = -1;
    for (let s = 0; s < C.ends[C.ends.length - 1]; s += 0.5) {
      expect(C.h(s)).toBeGreaterThanOrEqual(lastH - 1e-3);
      expect(C.y(s)).toBeGreaterThan(lastY - 1e-4);
      lastH = C.h(s);
      lastY = C.y(s);
    }
    for (let i = 0; i < C.ends.length; i++) {
      const a = (i ? C.ends[i - 1] : 0) + 2, b = C.verts[i][0] - 2;
      let lo = 9, hi = -9;
      for (let s = a; s <= b; s += 0.25) {
        lo = Math.min(lo, C.pitch(s));
        hi = Math.max(hi, C.pitch(s));
      }
      expect(lo * DEG).toBeGreaterThan(ROPE.pitch[0] * DEG - 3);
      expect(hi * DEG).toBeLessThan(ROPE.pitch[1] * DEG + 3);
      expect((hi - lo) * DEG).toBeLessThan(3);
    }
  });

  it('cada tramo acaba en vertical junto a su torre, hasta la plataforma', () => {
    expect(C.verts.length).toBe(lens.length);
    for (let i = 0; i < C.ends.length; i++) {
      const [a, b] = C.verts[i];
      expect(b - a).toBeGreaterThanOrEqual(ROPE.vLen[0] - 1);
      expect(C.pitch((a + b) / 2) * DEG).toBeGreaterThan(80);
      expect(C.inChimney((a + b) / 2)).toBe(true);
      const T = C.towers[i + 1];
      expect(Math.abs(C.h(C.ends[i]) - T.h)).toBeLessThan(0.6);
      expect(Math.abs(C.y(C.ends[i]) - T.top)).toBeLessThan(0.6);
    }
    expect(C.wave(0)).toBe(0);
    expect(C.wave(C.ends[0] + 0.1)).toBe(1);
  });

  it('la cuerda va siempre muy por encima del suelo (como poco 5 m)', () => {
    for (let s = 0; s < C.ends[C.ends.length - 1]; s += 0.5) {
      for (const u of [-0.3, 0, 0.3]) expect(C.y(s) - C.ground(C.h(s), u)).toBeGreaterThan(5);
    }
  });

  it('nada flota: cada árbol, piedra y pata de torre, apoyado en el suelo; los árboles, lejos de la cuerda', () => {
    let trees = 0, docks = 0, chests = 0;
    const hEnd = C.h(C.len);
    for (let c = -5; c * ROPE_CHUNK < hEnd; c++)
      for (const P of ropeDecoPuts(C, c, [])) {
        if (TREES.includes(P.n)) {
          trees++;
          expect(Math.abs(P.u)).toBeGreaterThanOrEqual(ROPE.treeU - 1e-6);
          const g = C.ground(P.ds, P.u);
          expect(P.y).toBeLessThanOrEqual(g + 1e-6); // (el tronco, en la tierra)
          expect(P.y).toBeGreaterThan(g - 0.3);
        }
        if (P.n.startsWith('Rock_Medium')) expect(P.y).toBeLessThanOrEqual(C.ground(P.ds, P.u) + 1e-6);
        if (P.n === 'Dock') docks++;
        if (P.n === 'Chest_Closed') chests++;
        if (P.n === 'Dock_Pole' && Math.abs(P.rz) < 1e-6) {
          // (las patas: su pie, bajo tierra)
          const foot = P.y + -1.999561 * P.sy;
          expect(foot).toBeLessThanOrEqual(C.ground(P.ds, P.u) + 1e-3);
        }
      }
    expect(trees).toBeGreaterThan(50);
    expect(docks).toBe(C.towers.length);
    expect(chests).toBe(lens.length);
  });

  it('el valle baja a los lados hasta su fondo, a lo lejos (la foto de fondo solo pone lo de encima del horizonte)', () => {
    const h = C.h(20), g0 = C.ground(h, 0);
    expect(C.ground(h, 60)).toBeLessThan(g0 - 10);
    expect(C.ground(h, 2000)).toBeGreaterThan(g0 - 125);
    expect(C.ground(h, 2000)).toBeLessThan(C.ground(h, 300) + 1e-6);
  });

  it('los mundos: con 4 tramos o menos, uno cada uno; con más, a partes iguales; y su foto, la de su mundo', () => {
    expect([0, 1, 2, 3].map((i) => worldOf(i, 4).key)).toEqual(['alps', 'gorge', 'jungle', 'coast']);
    expect([0, 1, 2].map((i) => worldOf(i, 3).key)).toEqual(['alps', 'gorge', 'jungle']);
    expect(Array.from({ length: 8 }, (_, i) => worldOf(i, 8).key)).toEqual(['alps', 'alps', 'gorge', 'gorge', 'jungle', 'jungle', 'coast', 'coast']);
    expect(worldStarts(2, 8)).toBe(true);
    expect(worldStarts(1, 8)).toBe(false);
    expect(worldStarts(0, 8)).toBe(false);
    // (los Alpes, según la altura: abajo, desde el valle; arriba, la montaña; la costa acaba al ocaso)
    expect(worldPano(0, 8)).toBe('aldea');
    expect(worldPano(1, 8)).toBe('montana');
    expect(worldPano(7, 8)).toBe('ocaso');
    expect(worldPano(0, 1)).toBe('aldea');
    for (const W of ROPE_WORLDS) expect(W.panos.length).toBeGreaterThan(0);
  });

  it('nada flota en ningún mundo: árboles, palmeras, plantas y piedras, en el suelo (y en la costa, por encima del mar)', () => {
    const hEnd = C.h(C.len), seaY = C.towers[0].base - 3;
    for (const w of ['jungle', 'coast', 'gorge'] as const) {
      let n = 0;
      for (let c = -5; c * ROPE_CHUNK < hEnd; c++)
        for (const P of ropeDecoPuts(C, c, [], undefined, w, w === 'coast' ? seaY : -1e9, w === 'coast' ? 3 : NaN)) {
          if (!/Tree|Pine|Palm|Fern|Plant|Bush|Rock_Medium/.test(P.n) || (w === 'jungle' && P.n === 'CommonTree_4' && Math.abs(P.u) < 4)) continue;
          n++;
          const g = C.ground(P.ds, P.u);
          expect(P.y, `${w}: ${P.n}`).toBeLessThanOrEqual(g + 1e-6);
          expect(P.y, `${w}: ${P.n}`).toBeGreaterThan(g - 0.6);
          if (w === 'coast') expect(g).toBeGreaterThan(seaY);
          if (/Tree|Palm/.test(P.n)) expect(Math.abs(P.u)).toBeGreaterThanOrEqual(ROPE.treeU - 1e-6);
        }
      expect(n, w).toBeGreaterThan(w === 'gorge' ? 5 : 20); // (la garganta, casi solo roca)
    }
  });

  it('la garganta: paredes lejos de la cuerda (no agobian) y alguna cascada; la costa, su barco', () => {
    let falls = 0, ship = 0;
    for (let c = 0; c < 30; c++) {
      for (const P of ropeDecoPuts(C, c, [], undefined, 'gorge')) {
        if (P.n === FALL) falls++;
        if (P.n === 'Cliff4' && Math.abs(P.u) > 6) expect(Math.abs(P.u)).toBeGreaterThan(11);
      }
      for (const P of ropeDecoPuts(C, c, [], undefined, 'coast', -20, 5)) if (P.n === 'ShipLarge') ship++;
    }
    expect(falls).toBeGreaterThan(3);
    expect(ship).toBe(1);
  });

  it('el mismo paisaje cada vez que se pinta un trozo', () => {
    expect(ropeDecoPuts(C, 3, [])).toEqual(ropeDecoPuts(C, 3, []));
  });
});

describe('el avance por la cuerda', () => {
  const DT = 1 / 72;
  const climb = (gap: number, maxT: number, perfect = false): { t: number; reps: number; R: RopeRun } => {
    const R = new RopeRun(new RopeCourse(lens, 3));
    R.startWave(0);
    let t = 0, next = 0.5, reps = 0;
    while (!R.reached && t < maxT) {
      if (t >= next) {
        R.rep(t, perfect);
        reps++;
        next += gap;
      }
      R.step(DT, true);
      t += DT;
    }
    return { t, reps, R };
  };

  it('remando a buen ritmo (cada 2,6 s), llegas a la repisa con unas repeticiones como las del tramo', () => {
    const r = climb(2.6, 200);
    expect(r.R.reached).toBe(true);
    expect(r.reps).toBeGreaterThan(10 * 0.6);
    expect(r.reps).toBeLessThan(10 * 1.6);
  });

  it('más deprisa, menos tiempo', () => {
    expect(climb(1.6, 200).t).toBeLessThan(climb(3.2, 200).t);
  });

  it('sin remar, resbalas un poco (como mucho 10 cm/s) y nunca más abajo de la repisa de salida', () => {
    const R = new RopeRun(new RopeCourse(lens, 3));
    R.startWave(1);
    for (let t = 0; t < 12; t += 2.6) {
      R.rep(t + 0.5, false);
      for (let k = 0; k < 2.6 / DT; k++) R.step(DT, true);
    }
    let top = R.s, minV = 0;
    expect(top).toBeGreaterThan(R.start + 3);
    for (let k = 0; k < 8 / DT; k++) {
      R.step(DT, true);
      top = Math.max(top, R.s);
      minV = Math.min(minV, R.v);
    }
    expect(R.s).toBeLessThan(top); // (resbala)
    expect(minV).toBeGreaterThanOrEqual(-ROPE.slide - 1e-6);
    expect(top - R.s).toBeLessThan(0.6); // (poco: en unos 5 s, menos de un palmo y medio)
    expect(R.ev.some((e) => e.t === 'slip')).toBe(true);
    for (let k = 0; k < 600 / DT; k++) R.step(DT, true);
    expect(R.s).toBeGreaterThanOrEqual(R.start);
  });

  it('colgado sin jugar (colgándote, en el descanso o en la pausa), ni subes ni resbalas', () => {
    const R = new RopeRun(new RopeCourse(lens, 3));
    R.startWave(0);
    R.rep(0, false);
    const s0 = R.s;
    for (let k = 0; k < 300; k++) R.step(DT, false);
    expect(R.s).toBe(s0);
  });

  it('al llegar a la repisa, el tramo está superado y el siguiente sale de ella', () => {
    const r = climb(2.2, 200);
    expect(r.R.ev.some((e) => e.t === 'ledge')).toBe(true);
    expect(r.R.s).toBeCloseTo(r.R.course.ends[0], 5);
    r.R.startWave(1);
    expect(r.R.reached).toBe(false);
    expect(r.R.s).toBeCloseTo(r.R.course.ends[0], 5);
    expect(r.R.left).toBeCloseTo(r.R.course.ends[1] - r.R.course.ends[0], 5);
  });

  it('bajar aguantando la carga (×2-×4) da un tirón de más', () => {
    const a = new RopeRun(new RopeCourse(lens, 3)), b = new RopeRun(new RopeCourse(lens, 3));
    a.startWave(0);
    b.startWave(0);
    a.rep(0.5, false);
    b.rep(0.5, false);
    b.boost(4);
    for (let k = 0; k < 3 / DT; k++) {
      a.step(DT, true);
      b.step(DT, true);
    }
    expect(b.s - a.s).toBeGreaterThan(1.2);
  });
});
