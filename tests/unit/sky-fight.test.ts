/** El combate en el parapente: el vuelo, los voladores que te siguen y atacan, disparar con la mirada, la onda, esquivar
 * cambiando de rumbo, el jefe y las islas (siempre por debajo de lo que se vuela, con sus árboles apoyados). */
import { describe, expect, it } from 'vitest';
import { ISLE_SLAB, ISLE_SLAB_Y, ISLES, SKY, SKY_KIND, SkyFight, SkyIsles, type SkyEv, type SkyIn } from '../../src/modes/bars/sky-fight.js';
import { placedTop } from '../../src/env/rock-top.js';

const DT = 1 / 72;
// (azar con semilla: siempre igual)
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const mkIn = (o: Partial<SkyIn> = {}): SkyIn => ({ steer: 0, climb: 0, gear: 1, fight: true, ...o });
/** Hace volar `secs` s; devuelve los sucesos. */
const run = (S: SkyFight, secs: number, I: SkyIn | ((t: number, S: SkyFight) => SkyIn)): SkyEv[] => {
  const out: SkyEv[] = [];
  for (let t = 0; t < secs; t += DT) {
    S.step(DT, typeof I === 'function' ? I(t, S) : I);
    for (const E of S.ev) out.push({ ...E });
  }
  return out;
};
const alive = (S: SkyFight) => S.foes.filter((F) => F.st !== 'off' && F.st !== 'fall');
/** El ángulo (rad) entre hacia donde vuelas y un volador. */
const offAxis = (S: SkyFight, F: { x: number; z: number }): number => {
  const dx = F.x - S.x, dz = F.z - S.z, d = Math.hypot(dx, dz);
  return Math.acos((dx * S.fwdX() + dz * S.fwdZ()) / d);
};

describe('el combate en el parapente: el vuelo', () => {
  it('vuela hacia delante a la marcha de crucero; la marcha corre más; vira hacia donde te ladeas', () => {
    const S = new SkyFight(seeded());
    S.reset(0);
    run(S, 5, mkIn({ fight: false }));
    expect(S.z).toBeLessThan(-30);
    expect(Math.abs(S.x)).toBeLessThan(0.01);
    expect(S.speed).toBeCloseTo(SKY.speed, 1);
    run(S, 5, mkIn({ gear: 4, fight: false }));
    expect(S.speed).toBeGreaterThan(SKY.speed * 1.9);
    const h = S.heading;
    run(S, 2, mkIn({ steer: 1, fight: false }));
    expect(S.heading).toBeLessThan(h - 0.3); // (a la derecha)
  });

  it('el remo sube y los brazos estirados bajan, sin pasar del techo ni del suelo de nubes', () => {
    const S = new SkyFight(seeded());
    S.reset(0);
    run(S, 3, mkIn({ climb: 0.3, fight: false }));
    expect(S.y).toBeGreaterThan(SKY.alt0 + 3);
    run(S, 60, mkIn({ climb: 1, fight: false }));
    expect(S.y).toBeLessThanOrEqual(SKY.ceil + 0.5);
    run(S, 60, mkIn({ climb: -0.37, fight: false }));
    expect(S.y).toBeGreaterThanOrEqual(SKY.floor - 0.5);
    expect(S.y).toBeLessThan(SKY.floor + 2);
  });
});

describe('el combate en el parapente: los voladores', () => {
  it('cada oleada trae tanta vida como remos pide; salen de uno en uno, como mucho dos en la primera', () => {
    const S = new SkyFight(seeded());
    S.reset(0);
    S.startWave(0, 10, false);
    expect(S.left).toBe(10);
    let most = 0;
    run(S, 20, (t, Q) => {
      most = Math.max(most, alive(Q).length);
      return mkIn({ fight: false });
    });
    expect(most).toBe(2);
    for (const F of alive(S)) expect(['bee', 'bat']).toContain(F.kind);
  });

  it('se te ponen delante, a la vista, y te siguen al virar', () => {
    const S = new SkyFight(seeded());
    S.reset(0);
    S.startWave(2, 12, false);
    run(S, 12, mkIn({ fight: false }));
    expect(alive(S).length).toBe(3);
    for (const F of alive(S)) {
      expect(offAxis(S, F)).toBeLessThan(0.6);
      expect(Math.hypot(F.x - S.x, F.z - S.z)).toBeLessThan(SKY.keep[1] + 8);
    }
    // un giro de 90° y siguen delante
    run(S, 6, mkIn({ steer: 1, fight: false }));
    run(S, 4, mkIn({ fight: false }));
    for (const F of alive(S)) expect(offAxis(S, F)).toBeLessThan(0.7);
  });

  it('atacan de uno en uno; si no cambias de rumbo, te dan', () => {
    const S = new SkyFight(seeded(3));
    S.reset(0);
    S.startWave(1, 20, false);
    let both = false;
    const evs = run(S, 40, (t, Q) => {
      if (Q.foes.filter((F) => F.st === 'wind' || F.st === 'lunge').length > 1) both = true;
      return mkIn();
    });
    expect(both).toBe(false);
    expect(evs.filter((e) => e.k === 'hurt').length).toBeGreaterThan(2);
    expect(evs.filter((e) => e.k === 'dodge').length).toBeLessThan(evs.filter((e) => e.k === 'hurt').length);
  });

  it('virando en cuanto se echan atrás (el aviso), se esquivan casi siempre', () => {
    const S = new SkyFight(seeded(3));
    S.reset(0);
    S.startWave(1, 20, false);
    // (al verlo echarse atrás, viras a un lado hasta que pasa, cada vez al otro)
    let turn = 0, side = 1;
    const evs = run(S, 60, (t, Q) => {
      for (const E of Q.ev) {
        if (E.k === 'wind') {
          side = -side;
          turn = 1.5;
        }
      }
      turn -= DT;
      return mkIn({ steer: turn > 0 ? side : 0 });
    });
    const hurt = evs.filter((e) => e.k === 'hurt').length, dodge = evs.filter((e) => e.k === 'dodge').length;
    expect(dodge).toBeGreaterThan(3);
    expect(hurt).toBeLessThan(dodge / 3);
  });
});

describe('el combate en el parapente: tus disparos', () => {
  // (un dragón quieto delante, para apuntar)
  const withFoes = (): SkyFight => {
    const S = new SkyFight(seeded());
    S.reset(0);
    S.startWave(2, 30, false);
    run(S, 12, mkIn({ fight: false }));
    return S;
  };

  it('el remo dispara al más cercano a tu mirada (sin apuntar exacto); mirando a otro lado, no da', () => {
    const S = withFoes(), F = alive(S)[0];
    // (mirando hacia él, algo desviado: da al más cercano a la mirada, que es él o uno aún más cerca de ella)
    const dx = F.x - S.x, dy = F.y - S.y + 1.5, dz = F.z - S.z, m = Math.hypot(dx, dy, dz);
    const angle = (Q: typeof F): number => Math.acos(((Q.x - S.x) * dx + (Q.y - S.y) * dy + (Q.z - S.z) * dz) / (m * Math.hypot(Q.x - S.x, Q.y - S.y, Q.z - S.z)));
    const want = alive(S).reduce((a, b) => (angle(b) < angle(a) ? b : a)), hp = want.hp;
    const E = S.shoot(dx, dy, dz, 1);
    expect(E.id).toBe(want.id);
    expect(want.hp).toBe(hp - 1);
    // (mirando atrás)
    const M = S.shoot(-S.fwdX(), 0, -S.fwdZ(), 1);
    expect(M.n).toBe(-1);
  });

  it('el explosivo quita el doble; derribado, cae entre las nubes, cuenta y, sin ninguno, la oleada se acaba', () => {
    const S = new SkyFight(seeded());
    S.reset(0);
    S.startWave(0, 2, false);
    run(S, 12, mkIn({ fight: false }));
    let kills = 0, guard = 0;
    while (!S.cleared && guard++ < 20) {
      const F = alive(S)[0];
      if (!F) {
        run(S, 2, mkIn({ fight: false }));
        continue;
      }
      S.shoot(F.x - S.x, F.y - S.y, F.z - S.z, 2);
      kills += S.ev.filter((e) => e.k === 'kill').length;
    }
    expect(S.cleared).toBe(true);
    expect(S.kills).toBeGreaterThan(0);
    const y0 = S.foes.find((F) => F.st === 'fall')?.y ?? 0;
    run(S, 1, mkIn({ fight: false }));
    const fall = S.foes.find((F) => F.st === 'fall');
    if (fall) expect(fall.y).toBeLessThan(y0);
  });

  it('la onda de la carga da a todos los que tengas cerca, con la fuerza de la carga', () => {
    const S = withFoes(), A = alive(S), hp = A.map((F) => F.hp);
    const n = S.blast(2);
    expect(n).toBe(A.length);
    A.forEach((F, i) => expect(F.hp === 0 || F.hp === hp[i] - 2).toBe(true));
  });
});

describe('el combate en el parapente: el jefe', () => {
  it('en su oleada sale el dragón grande, con más vida, y escupe ráfagas de tres', () => {
    const S = new SkyFight(seeded(5));
    S.reset(0);
    S.startWave(4, 20, true);
    const evs = run(S, 25, mkIn({ steer: 0.3 }));
    expect(evs.some((e) => e.k === 'boss')).toBe(true);
    const B = S.bossFoe!;
    expect(B.hpMax).toBeGreaterThanOrEqual(SKY.bossHp);
    expect(B.hpMax).toBe(12);
    // (bolas grandes, de tres en tres: la primera ráfaga, en poco más de un segundo)
    const big = evs.filter((e) => e.k === 'fire' && e.big);
    expect(big.length).toBeGreaterThanOrEqual(3);
    expect(SKY_KIND.boss.size).toBeGreaterThan(SKY_KIND.dragon.size * 2);
  });
});

describe('las islas del cielo', () => {
  it('siempre por debajo de lo más bajo que se vuela (árboles incluidos), con cada árbol apoyado en su roca', () => {
    const I = new SkyIsles(seeded(11));
    I.reset(0, 0);
    let x = 0, z = 0;
    for (let k = 0; k < 40; k++) {
      z -= 60;
      x += 20;
      I.step(x, z, -0.3);
      for (const S of I.list) {
        expect(S.y + 2.482 * S.s * ISLE_SLAB_Y).toBeLessThanOrEqual(ISLES.top);
        for (const T of S.deco) {
          // (de pie en la losa: su pie, a ras o un poco hundido, nunca en el aire)
          const t = placedTop(ISLE_SLAB, S.x, S.y, S.z, S.ry, S.s, S.s * ISLE_SLAB_Y, S.s, T.x, T.z)!;
          expect(t).not.toBeNull();
          expect(T.y).toBeLessThanOrEqual(t);
          expect(T.y).toBeGreaterThan(t - 0.6);
          expect(T.y + T.sc * ISLES.treeH).toBeLessThan(SKY.floor);
        }
      }
    }
    // (y nunca se quedan atrás: siempre alrededor de donde vas)
    for (const S of I.list) expect(Math.hypot(S.x - x, S.z - z)).toBeLessThan((S.far ? ISLES.big.gone : ISLES.gone) + 1);
    expect(I.list.some((S) => S.deco.length > 6)).toBe(true);
    expect(I.list.filter((S) => S.far).length).toBe(ISLES.big.n);
  });
});
