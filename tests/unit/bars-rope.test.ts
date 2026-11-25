// La aventura en la cuerda del remo invertido (pedido del usuario: «A con tramos de B», resbalar mínimamente, en Barras, con
// una paralela o dos). Rehecha con la opción A del usuario: un solo cable, del valle a la cima, sin pliegues ni plataformas,
// con un cofre colgado al final de cada tramo; debajo, una montaña de abajo arriba (valle, bosque, garganta y cima) en la que
// todo nace de algo (opción 1: el río viene de las cascadas, y cada cascada, de un arroyo que nace en un manantial) y nada
// flota. Cada remo, un tirón; sin remar, se resbala un poco, nunca más abajo del final del tramo anterior.
import { describe, expect, it } from 'vitest';
import { CHEST, chestAt, GORGE, PULL, ROPE, ROPE_CHUNK, RopeCourse, RopeRun, ropeDecoPuts, TURBO } from '../../src/modes/bars/rope';
import { ROPE_WORLDS, worldPano, zoneNo, zoneWeight } from '../../src/modes/bars/rope-worlds';

const DEG = 180 / Math.PI;
const lens = [10, 12, 14, 16, 18].map((r) => r * ROPE.perRep);
const TREES = /Tree|Pine/;
const STANDS = /Tree|Pine|Fern|Plant|Bush|Flower|Clover|Grass|Mushroom|Rock_Medium/;
/** Todo lo que se pinta de la ronda (todos sus trozos). */
const allPuts = (C: RopeCourse) => {
  const out = [];
  for (let c = -8; c * ROPE_CHUNK < C.h(C.len) + 40; c++) out.push(...ropeDecoPuts(C, c, []));
  return out;
};

describe('el cable: uno solo, del valle a la cima', () => {
  const C = new RopeCourse(lens, 7);

  it('sube siempre y sin pliegues: su cuesta crece poco a poco, de unos 25° a unos 48°', () => {
    let lastH = -1e9, lastY = -1e9, lastP = 0;
    for (let s = -8; s <= C.len; s += 0.25) {
      const p = C.pitch(s);
      expect(C.h(s)).toBeGreaterThan(lastH);
      expect(C.y(s)).toBeGreaterThan(lastY);
      if (s > -8) {
        expect(p).toBeGreaterThanOrEqual(lastP - 1e-6); // (nunca se dobla hacia abajo)
        expect((p - lastP) * DEG).toBeLessThan(0.5); // (ni de golpe: ningún pliegue)
      }
      lastH = C.h(s);
      lastY = C.y(s);
      lastP = p;
    }
    expect(C.pitch(0) * DEG).toBeGreaterThan(20);
    expect(C.pitch(0) * DEG).toBeLessThan(30);
    expect(C.pitch(C.top) * DEG).toBeGreaterThan(40);
    expect(C.pitch(C.top) * DEG).toBeLessThan(55);
  });

  it('cada tramo acaba en su cofre, colgado del cable a un lado (no tropieza con las manos); el último, en la estación de la cima', () => {
    expect(C.ends.length).toBe(lens.length);
    expect(C.top).toBeCloseTo(lens.reduce((a, b) => a + b), 5);
    for (let i = 0; i < C.ends.length - 1; i++) {
      const [u, y, h] = chestAt(C, i);
      expect(u).toBeCloseTo(CHEST.u, 5);
      expect(h).toBeCloseTo(C.h(C.ends[i]), 5);
      expect(y).toBeLessThan(C.y(C.ends[i]) - 0.3);
    }
    const [, y, h] = chestAt(C, C.ends.length - 1), deck = allPuts(C).filter((P) => P.n === 'Dock');
    expect(h).toBeGreaterThan(C.h(C.top));
    expect(deck.length).toBe(2); // (las dos estaciones)
    expect(y).toBeLessThan(C.y(C.top));
    expect(C.wave(0)).toBe(0);
    expect(C.wave(C.ends[0] + 0.1)).toBe(1);
  });

  it('la cuerda va siempre muy por encima del suelo (como poco 7 m), salvo al llegar a la estación de la cima', () => {
    for (let s = 0; s < C.top - 10; s += 0.5) for (const u of [-0.4, 0, 0.4]) expect(C.y(s) - C.ground(C.h(s), u)).toBeGreaterThan(ROPE.clear);
    for (let s = C.top - 10; s <= C.top; s += 0.5) expect(C.y(s) - C.ground(C.h(s), 0)).toBeGreaterThan(2.5);
  });

  it('el valle baja a los lados hasta su fondo, a lo lejos (la foto de fondo solo pone lo de encima del horizonte)', () => {
    const h = C.h(15), g0 = C.ground(h, 0);
    expect(C.ground(h, -60)).toBeLessThan(g0 - 10);
    expect(C.ground(h, 2000)).toBeGreaterThan(g0 - 130);
    expect(C.ground(h, 2000)).toBeLessThan(C.ground(h, 300) + 1e-6);
  });
});

describe('la montaña, de abajo arriba', () => {
  const C = new RopeCourse(lens, 7);

  it('valle, bosque, garganta y cima, un cuarto de la subida cada una; en el paso, se mezclan', () => {
    expect([0.1, 0.3, 0.6, 0.9].map((f) => ROPE_WORLDS[zoneNo(f)].key)).toEqual(['valley', 'forest', 'gorge', 'summit']);
    expect(zoneWeight(0, 0.1)).toBe(1);
    expect(zoneWeight(1, 0.25)).toBeGreaterThan(0.3);
    expect(zoneWeight(0, 0.25)).toBeGreaterThan(0.3);
    expect(C.fracAt(C.h(C.top))).toBeCloseTo(1, 3);
    // (la foto de fondo, la de la zona de cada tramo: cambia solo entre tramos)
    expect(worldPano(0, 4)).toBe('aldea');
    expect(worldPano(3, 4)).toBe('cumbre');
  });

  it('todo nace de algo: el río baja siempre hasta el lago, cada cascada tiene su arroyo y cada arroyo, su manantial', () => {
    const R = C.river;
    expect(R.length).toBeGreaterThan(10);
    for (let i = 1; i < R.length; i++) expect(R[i].y).toBeGreaterThanOrEqual(R[i - 1].y - 1e-6); // (de abajo arriba: nunca sube aguas abajo)
    expect(R[0].y).toBeCloseTo(C.lake.y, 5);
    expect(Math.hypot(R[0].h - C.lake.h, R[0].u - C.lake.u)).toBeLessThan(C.lake.r);
    // la de la cabecera cae al principio del río; las de las paredes, al fondo de la garganta
    expect(C.falls.length).toBeGreaterThan(1);
    const top = R[R.length - 1];
    expect(C.falls.some((F) => Math.abs(F.h - top.h) < 1 && Math.abs(F.u - top.u) < 1 && Math.abs(F.bot - top.y) < 0.2)).toBe(true);
    for (const F of C.falls) {
      expect(F.top - F.bot).toBeGreaterThan(5);
      // (por arriba le llega un arroyo; y el arroyo nace en un manantial)
      const S = C.streams.find((S) => S.pts.some((p) => Math.hypot(p.h - F.h, p.u - F.u) < GORGE.u1 - GORGE.u0 + 1 && Math.abs(p.y - F.top) < 1.5));
      expect(S, `cascada en h ${F.h.toFixed(1)}`).toBeTruthy();
      expect(C.springs.some((sp) => Math.hypot(sp.h - S!.pts[0].h, sp.u - S!.pts[0].u) < 0.1)).toBe(true);
    }
  });

  it('el agua, en su sitio: el río en su cauce (el agua cubre su fondo y la orilla queda por encima) y el lago en su cubeta', () => {
    for (const p of C.river) {
      expect(C.ground(p.h, p.u)).toBeLessThan(p.y);
      if (Math.hypot(p.h - C.lake.h, p.u - C.lake.u) < C.lake.r + 1) continue; // (ya en el lago)
      if (C.streams.some((S) => S.pts.some((q) => Math.hypot(q.h - p.h, q.u - p.u) < 5))) continue; // (donde le llega un arroyo)
      expect(C.ground(p.h, p.u + 3.2)).toBeGreaterThan(p.y - 0.05);
      expect(C.ground(p.h, p.u - 3.2)).toBeGreaterThan(p.y - 0.05);
    }
    const L = C.lake;
    expect(C.ground(L.h, L.u)).toBeLessThan(L.y - 1);
    for (let a = 0; a < 6.28; a += 0.4) {
      const h = L.h + Math.cos(a) * (L.r + 2), u = L.u + Math.sin(a) * (L.r + 2), r = C.riverAt(h);
      if (r && Math.abs(r.u - u) < 4) continue; // (la desembocadura)
      expect(C.ground(h, u)).toBeGreaterThan(L.y);
    }
  });

  it('nada flota: árboles, plantas y rocas, apoyados en el suelo; nunca en el agua, en las paredes ni bajo la cuerda', () => {
    let n = 0, trees = 0;
    for (const P of allPuts(C)) {
      if (!STANDS.test(P.n)) continue;
      n++;
      const g = C.ground(P.ds, P.u);
      expect(P.y, P.n).toBeLessThanOrEqual(g + 1e-6);
      expect(P.y, P.n).toBeGreaterThan(g - 0.8);
      if (TREES.test(P.n)) {
        trees++;
        expect(Math.abs(P.u)).toBeGreaterThanOrEqual(ROPE.treeU - 1e-6);
        expect(C.wet(P.ds, P.u, 2)).toBe(false);
      } else if (!C.springs.some((S) => Math.hypot(S.h - P.ds, S.u - P.u) < 3)) expect(C.wet(P.ds, P.u, 0.5)).toBe(false);
      expect(C.steep(P.ds, P.u)).toBe(false);
    }
    expect(n).toBeGreaterThan(80);
    expect(trees).toBeGreaterThan(20);
  });

  it('por zonas: las flores, en el valle; los pinares, en el bosque; las paredes de roca, en la garganta; y la cima, de roca', () => {
    const at = (re: RegExp) => allPuts(C).filter((P) => re.test(P.n)).map((P) => zoneNo(C.fracAt(P.ds)));
    const most = (z: number[], k: number) => z.filter((x) => x === k).length / Math.max(1, z.length);
    expect(most(at(/Flower|Clover/), 0)).toBeGreaterThan(0.6);
    expect(most(at(/Pine_2|Pine_4/), 1)).toBeGreaterThan(0.5);
    expect(most(at(/Cliff4/), 2)).toBeGreaterThan(0.6);
    expect(most(at(/Grass_Wispy/), 3) + most(at(/Grass_Wispy/), 2)).toBeGreaterThan(0.8);
  });

  it('las estaciones: sus postes, apoyados en el suelo', () => {
    for (const P of allPuts(C).filter((P) => P.n === 'Dock_Pole' && Math.abs(P.rz) < 1e-6)) expect(P.y + -1.999561 * P.sy).toBeLessThanOrEqual(C.ground(P.ds, P.u) + 1e-3);
  });

  it('en una ronda corta (un tramo) se sube solo el principio de la montaña: sin garganta, el lago lo alimenta un arroyo del bosque', () => {
    const S = new RopeCourse([12 * ROPE.perRep], 3);
    expect(S.river.length).toBe(0);
    expect(S.falls.length).toBe(0);
    expect(S.streams.length).toBe(1);
    const pts = S.streams[0].pts, last = pts[pts.length - 1];
    for (let i = 1; i < pts.length; i++) expect(pts[i].y).toBeLessThanOrEqual(pts[i - 1].y + 1e-6);
    expect(Math.hypot(last.h - S.lake.h, last.u - S.lake.u)).toBeLessThan(S.lake.r);
    expect(S.fracAt(S.h(S.top))).toBeLessThan(0.3);
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

  it('cada remo es un tirón: subes mientras tiras, sigues un poco al bajar (inercia) y luego paras (no es una marcha continua)', () => {
    const R = new RopeRun(new RopeCourse(lens, 3));
    R.startWave(0);
    // tirar hasta la barra en 0,8 s
    for (let t = 0; t < 0.8; t += DT) {
      R.pull(t / 0.8);
      R.step(DT, true);
    }
    const pulled = R.s;
    expect(pulled).toBeGreaterThan(ROPE.perRep * PULL.share * 0.85); // (lo del tirón, ya subido)
    R.rep(0.8, false);
    // bajar en 1 s: la inercia te lleva un poco más
    const vTop = R.v;
    for (let t = 0; t < 1; t += DT) {
      R.pull(1 - t);
      R.step(DT, true);
    }
    expect(R.s).toBeGreaterThan(pulled + ROPE.perRep * (1 - PULL.share) * 0.6);
    expect(R.s - R.start).toBeLessThan(ROPE.perRep * 1.05); // (un remo, lo de un remo)
    expect(R.v).toBeLessThan(vTop * 0.3); // (la inercia se apaga)
    // abajo, quieto: ni avanza ni (aún) resbala
    R.pull(0);
    const s1 = R.s;
    for (let t = 0; t < 1; t += DT) R.step(DT, true);
    expect(R.s - s1).toBeLessThan(0.05);
  });

  it('un tirón a medias sube a medias, y bajar no te devuelve', () => {
    const R = new RopeRun(new RopeCourse(lens, 3));
    R.startWave(0);
    for (let t = 0; t <= 0.5; t += DT) {
      R.pull(t);
      R.step(DT, true);
    }
    for (let t = 0; t < 0.5; t += DT) {
      R.pull(0.5 - t);
      R.step(DT, true);
    }
    expect(R.s).toBeGreaterThan(ROPE.perRep * PULL.share * 0.4);
    expect(R.s).toBeLessThan(ROPE.perRep * PULL.share * 0.55);
  });

  it('el turbo: seis remos seguidos a buen ritmo lo encienden (cada remo sube más); un parón o un fallo lo apagan', () => {
    const R = new RopeRun(new RopeCourse(lens.map((l) => l * 3), 3));
    R.startWave(0);
    const ev: boolean[] = [];
    let t = 0;
    const rep = (gap: number) => {
      for (let k = 0; k < gap / DT; k++, t += DT) R.step(DT, true);
      const s0 = R.s;
      R.rep(t, false);
      for (let k = 0; k < 1.5 / DT; k++) R.step(DT, true);
      t += 1.5;
      for (const e of R.ev) if (e.t === 'turbo') ev.push(e.on);
      R.ev.length = 0;
      return R.s - s0;
    };
    const plain = rep(1);
    for (let i = 0; i < TURBO.n - 2; i++) rep(1);
    expect(R.turbo).toBe(false);
    rep(1);
    expect(R.turbo).toBe(true);
    expect(ev).toEqual([true]);
    expect(rep(1)).toBeGreaterThan(plain * 1.15);
    // (un parón lo apaga)
    for (let k = 0; k < (TURBO.idle + 0.5) / DT; k++) R.step(DT, true);
    expect(R.turbo).toBe(false);
    // (un remo lento no cuenta para la racha)
    for (let i = 0; i < TURBO.n - 1; i++) rep(1);
    rep(TURBO.gap + 1);
    expect(R.turbo).toBe(false);
    // (y un reto fallado lo apaga)
    for (let i = 0; i < TURBO.n; i++) rep(1);
    expect(R.turbo).toBe(true);
    R.stumble();
    expect(R.turbo).toBe(false);
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
