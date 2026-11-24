// La aventura en la cuerda del remo invertido (pedido del usuario: «A con tramos de B», resbalar mínimamente, en Barras, con
// una paralela o dos): una cuesta muy empinada que acaba cada tramo en vertical hasta una repisa; cada remo sube y, sin remar,
// se resbala un poco, nunca más abajo de la repisa de salida.
import { describe, expect, it } from 'vitest';
import { putSpanU } from '../../src/modes/trek/plat/pieces';
import { ROPE, ROPE_CHUNK, ROPE_CLEAR, RopeCourse, RopeRun, ropeDecoPuts } from '../../src/modes/bars/rope';

const DEG = 180 / Math.PI;
const lens = [10, 12, 14, 16, 18].map((r) => r * ROPE.perRep);

describe('el recorrido de la cuerda', () => {
  const C = new RopeCourse(lens, 7);

  it('sube siempre, con una cuesta muy empinada (de unos 28° a 52°) y casi llana al empezar', () => {
    expect(C.pitch(0) * DEG).toBeLessThan(20);
    let lastH = -1, lastY = -1;
    for (let s = 0; s < C.ends[C.ends.length - 1]; s += 0.5) {
      expect(C.h(s)).toBeGreaterThanOrEqual(lastH - 1e-4);
      expect(C.y(s)).toBeGreaterThan(lastY - 1e-4);
      lastH = C.h(s);
      lastY = C.y(s);
    }
    // (lejos del arranque y de las chimeneas, la cuesta de siempre)
    for (let i = 0; i < C.ends.length; i++) {
      const a = i ? C.ends[i - 1] : 0, mid = a + (C.ends[i] - a) * 0.3;
      if (mid < 10) continue;
      const p = C.pitch(mid) * DEG;
      expect(p).toBeGreaterThan(25);
      expect(p).toBeLessThan(56);
    }
  });

  it('cada tramo acaba en vertical (la chimenea) justo en su repisa', () => {
    for (const e of C.ends) {
      expect(C.pitch(e - 1) * DEG).toBeGreaterThan(80);
      expect(C.inChimney(e - 1)).toBe(true);
    }
    expect(C.chimneys.length).toBe(lens.length);
    expect(C.wave(0)).toBe(0);
    expect(C.wave(C.ends[0] + 0.1)).toBe(1);
  });

  it('las paredes del cañón nunca se meten en la cuerda (ni en la chimenea), y cada repisa sale con su cofre', () => {
    let ledges = 0, chests = 0;
    for (let c = 0; c * ROPE_CHUNK < C.len; c++)
      for (const P of ropeDecoPuts(C, c, [])) {
        if (P.n === 'Cliff1') ledges++;
        if (P.n === 'Chest_Closed') chests++;
        if (P.n !== 'Cliff4' && P.n !== 'Cliff3') continue;
        const sp = putSpanU(P)!;
        expect(Math.min(Math.abs(sp[0]), Math.abs(sp[1]))).toBeGreaterThanOrEqual(ROPE_CLEAR - 1e-6);
        expect(sp[0] * sp[1]).toBeGreaterThan(0); // (de un solo lado)
      }
    expect(ledges).toBe(lens.length);
    expect(chests).toBe(lens.length);
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
