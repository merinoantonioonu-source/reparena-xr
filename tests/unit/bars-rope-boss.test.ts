// El jefe de la cuerda del remo invertido (PR 3): el dragón del último tramo te corta el paso, lanza bolas de fuego (a la cara:
// apartar la cabeza; rasante: quedarse abajo), tras tres se marea y le das con un remo explosivo o la carga; a la tercera,
// derrotado. Si no le das mareado, se recupera; tras dos veces, vale cualquier remo (la pelea siempre se acaba).
import { describe, expect, it } from 'vitest';
import { ROPE, RopeCourse, RopeRun } from '../../src/modes/bars/rope';
import { BOSS, MINI, RopeBoss, ropeBosses, type BossEnv, type BossEv } from '../../src/modes/bars/rope-boss';

const DT = 1 / 72;
const C = new RopeCourse([10, 12, 14].map((r) => r * ROPE.perRep), 5);
const env = (o: Partial<BossEnv> = {}): BossEnv => ({ s: 0, up: 0, req: 0.3, side: 0, strike: false, rep: false, playing: true, ...o });

/** La pelea entera: `you(B)` dice qué haces en cada momento; devuelve los sucesos y si acabó. */
function fight(you: (B: RopeBoss, t: number) => Partial<BossEnv>, maxT = 240): { ev: BossEv[]; B: RopeBoss } {
  const B = new RopeBoss(C), ev: BossEv[] = [];
  for (let t = 0; t < maxT && B.st !== 'down'; t += DT) {
    B.step(DT, env({ s: B.at, ...you(B, t) }));
    ev.push(...B.ev);
    B.ev.length = 0;
  }
  return { ev, B };
}

/** Lo que haría alguien que lo hace bien: la cabeza a un lado ante la bola, abajo ante la rasante, y le da mareado. */
const good = (B: RopeBoss): Partial<BossEnv> => ({ side: B.st === 'fly' && B.shot === 'ball' ? 0.12 : 0, up: 0, strike: B.st === 'dizzy' && B.t > 1 });

describe('el dragón', () => {
  it('sale en el último tramo, antes de la estación de la cima', () => {
    const B = new RopeBoss(C);
    expect(B.wave).toBe(C.ends.length - 1);
    expect(B.at).toBeGreaterThan(C.ends[B.wave - 1]);
    expect(B.at).toBeLessThan(C.ends[B.wave] - 3);
  });

  it('haciéndolo bien: esquivas todas, se marea tres veces, le das tres y queda derrotado', () => {
    const { ev, B } = fight(good);
    expect(B.st).toBe('down');
    expect(ev.filter((e) => e.t === 'burn').length).toBe(0);
    expect(ev.filter((e) => e.t === 'dodge').length).toBe(BOSS.throws * BOSS.hits);
    expect(ev.filter((e) => e.t === 'hit').length).toBe(BOSS.hits - 1);
    expect(ev.some((e) => e.t === 'down')).toBe(true);
    // (por turnos: a la cara y rasante)
    const shots = ev.filter((e): e is Extract<BossEv, { t: 'throw' }> => e.t === 'throw').map((e) => e.shot);
    expect(shots).toContain('ball');
    expect(shots).toContain('sweep');
  });

  it('si no apartas la cabeza, la bola te da; si subes ante la rasante, te quema', () => {
    const { ev } = fight((B) => ({ ...good(B), side: 0, up: B.st === 'fly' && B.shot === 'sweep' ? 0.3 : 0 }), 60);
    const burns = ev.filter((e): e is Extract<BossEv, { t: 'burn' }> => e.t === 'burn').map((e) => e.shot);
    expect(burns).toContain('ball');
    expect(burns).toContain('sweep');
  });

  it('si no le das mareado, se recupera; tras dos veces, vale cualquier remo (la pelea siempre se acaba)', () => {
    const { ev, B } = fight((B2, t) => ({ ...good(B2), strike: false, rep: B2.st === 'dizzy' && Math.floor(t) % 2 === 0 }));
    expect(ev.filter((e) => e.t === 'recover').length).toBe(2);
    expect(B.st).toBe('down');
  });

  it('mientras pelea, la cuerda no sube ni resbala: quieto delante de él', () => {
    const R = new RopeRun(C), B = new RopeBoss(C);
    R.startWave(B.wave);
    R.hold = B.at;
    for (let t = 0; t < 30; t += DT) {
      if (Math.abs((t % 2.2) - 0.1) < DT) R.rep(t, false);
      R.step(DT, true);
    }
    expect(R.s).toBeCloseTo(B.at, 5);
    for (let t = 0; t < 10; t += DT) R.step(DT, true);
    expect(R.s).toBeCloseTo(B.at, 5); // (sin remar, tampoco resbala)
    R.hold = Infinity;
    R.rep(40, false);
    for (let t = 0; t < 3; t += DT) R.step(DT, true);
    expect(R.s).toBeGreaterThan(B.at + 0.5);
  });
});

describe('un jefe en cada zona', () => {
  it('en una ronda larga: el demonio, el cíclope y el yeti, por orden y separados, y el dragón al final', () => {
    const L = new RopeCourse(Array(8).fill(15 * ROPE.perRep), 4), B = ropeBosses(L);
    expect(B.map((x) => x.kind)).toEqual(['demon', 'cyclops', 'yeti', 'dragon']);
    for (let i = 1; i < B.length; i++) expect(B[i].at - B[i - 1].at).toBeGreaterThanOrEqual(MINI.gap - 1e-6);
    for (const x of B) expect(x.wave).toBe(L.wave(x.at));
  });
  it('en una ronda corta, sin los de cada zona (con un solo tramo, ni el dragón)', () => {
    expect(ropeBosses(new RopeCourse([12 * ROPE.perRep], 2))).toEqual([]);
    expect(ropeBosses(new RopeCourse([12 * ROPE.perRep, 12 * ROPE.perRep], 2)).map((x) => x.kind)).toEqual(['dragon']);
  });
  it('pelean igual pero más corto: dos lanzamientos por ronda y dos golpes', () => {
    const L = new RopeCourse(Array(8).fill(15 * ROPE.perRep), 4), M = ropeBosses(L)[0], ev: BossEv[] = [];
    for (let t = 0; t < 120 && M.st !== 'down'; t += DT) {
      M.step(DT, env({ s: M.at, ...good(M) }));
      ev.push(...M.ev);
      M.ev.length = 0;
    }
    expect(M.st).toBe('down');
    expect(ev.filter((e) => e.t === 'dodge').length).toBe(MINI.throws * MINI.hits);
    expect(ev.filter((e) => e.t === 'burn').length).toBe(0);
  });
});
