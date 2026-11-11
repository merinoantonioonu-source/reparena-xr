// La Travesía (src/modes/trek): lo que pide el diseño del usuario (docs/REGLAS.md › Travesía): sin repeticiones te
// paras; seis seguidas a buen ritmo encienden el turbo y una floja o 3 s sin ninguna lo apagan; el tramo no acaba a mitad
// de una parada; la roca se hace añicos en la última embestida; las cadenas del cofre las rompe otro movimiento.
import { describe, expect, it } from 'vitest';
import { TREK_GEMS, type TrekEnv, type TrekEv, type TrekObs } from '../../src/modes/trek/env.js';
import { Trek, TREK_SEE, trekChainMove, trekKinds, trekLeft } from '../../src/modes/trek/path.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const S: Record<string, number> = { trekSpeed: 130, trekCurves: 1, jumpHeight: 10, squatDepth: 26, lungeDepth: 28 };

function mk(ex = 'squat'): { tk: Trek; env: TrekEnv & { state: string; now: number; wave: number }; store: Record<string, unknown> } {
  const store: Record<string, unknown> = {};
  const env = {
    s: (k: string) => S[k],
    dv: (k: string) => S[k],
    ex,
    trek: true,
    state: 'play',
    head: { x: 0, y: 1.6, z: 0 },
    calibRef: 1.6,
    wave: 0,
    rank: 0,
    now: 10,
    rnd: rng(5),
    rockBox: () => ({ w: 2, h: 1.5, y0: 0 }),
    bandReady: true,
    chestReady: true,
    store: (k: string) => store[k] ?? null,
  };
  return { tk: new Trek(env), env, store };
}
const dt = 1 / 72;
/** Unos fotogramas, con lo que pasa en ellos. */
function run(tk: Trek, env: { now: number }, n: number, out: TrekEv[] = []): TrekEv[] {
  for (let i = 0; i < n; i++) {
    env.now += dt;
    tk.step(dt, env.now);
    out.push(...tk.ev);
    tk.ev.length = 0;
  }
  return out;
}
/** Una sentadilla de `depth` m que acaba ahora (la cabeza baja y sube), hecha en `gap` s. */
function squat(tk: Trek, env: TrekEnv & { now: number }, depth: number, gap: number): void {
  const n = Math.round(gap / dt);
  for (let i = 0; i < n; i++) {
    env.head.y = env.calibRef - depth * Math.sin((Math.PI * i) / n);
    run(tk, env, 1);
  }
  env.head.y = env.calibRef;
  tk.rep(false);
}

describe('la Travesía', () => {
  it('cada repetición te empuja y, sin repeticiones, te paras', () => {
    const { tk, env } = mk();
    tk.reset();
    for (let i = 0; i < 4; i++) squat(tk, env, 0.3, 1.6);
    run(tk, env, 72);
    expect(tk.v).toBeGreaterThan(1);
    run(tk, env, 72 * 8);
    expect(tk.v).toBe(0);
    const d = tk.dist;
    run(tk, env, 72);
    expect(tk.dist).toBe(d);
  });

  it('seis seguidas a buen ritmo encienden el turbo; una floja lo apaga, y también 3 s sin ninguna', () => {
    const { tk, env } = mk();
    tk.reset();
    for (let i = 0; i < 5; i++) squat(tk, env, 0.3, 1.5);
    expect(tk.turbo).toBe(false);
    squat(tk, env, 0.3, 1.5);
    expect(tk.turbo).toBe(true);
    expect(tk.ev.some((e) => e.t === 'cheer' && e.text.startsWith('¡TURBO!'))).toBe(true);
    squat(tk, env, 0.08, 1.5); // (floja: poco honda)
    expect(tk.turbo).toBe(false);
    for (let i = 0; i < 6; i++) squat(tk, env, 0.3, 1.5);
    expect(tk.turbo).toBe(true);
    const ev = run(tk, env, 72 * 3 + 2);
    expect(tk.turbo).toBe(false);
    expect(ev.some((e) => e.t === 'cheer' && e.text === 'Fin del turbo: no pares')).toBe(true);
  });

  it('los retos salen a lo lejos, entre la niebla, cada uno de un tipo por turnos', () => {
    const { tk } = mk('curl');
    tk.reset();
    tk.wave(0);
    expect(tk.obs.length).toBeGreaterThan(3);
    for (const o of tk.obs) expect(o.at).toBeLessThan(TREK_SEE + 16 + 12);
    expect(new Set(tk.obs.map((o) => o.kind)).size).toBeGreaterThan(3);
    expect(trekKinds('curl')).not.toContain('log'); // (con curl, ramas para agacharse; nunca el movimiento que hace avanzar)
    expect(trekKinds('lunge')).not.toContain('rock');
  });

  it('el tramo no acaba a mitad de una parada', () => {
    const { tk, env } = mk();
    tk.reset();
    const o: TrekObs = { kind: 'chest', at: 1.5, judged: false, side: 1, y: 1.4, maxUp: -1, move: 'jump', need: 4, links: 52 };
    tk.obs.push(o);
    run(tk, env, 2);
    expect(tk.halt).toBe(o);
    expect(trekLeft(tk, 10, 10)).toBe(true);
    // (y las repeticiones del ejercicio en la parada solo recuerdan lo que toca)
    tk.rep(false);
    expect(tk.ev.at(-1)).toMatchObject({ t: 'say', text: '¡Rompe las cadenas: 4 saltos!' });
  });

  it('la roca no se mueve con las embestidas y se hace añicos en la última', () => {
    const { tk, env } = mk('squat');
    tk.reset();
    const o: TrekObs = { kind: 'rock', at: 2, judged: false, side: 1, y: 1.4, maxUp: -1, move: 'lunge', need: 3, rr: 1, stop: 2.25, rocks: [] };
    tk.obs.push(o);
    run(tk, env, 2);
    expect(tk.halt).toBe(o);
    const ev: TrekEv[] = [];
    for (let k = 0; k < 3; k++) {
      // una zancada: la cabeza baja y avanza; vuelve
      for (let i = 0; i < 40; i++) {
        const b = Math.sin((Math.PI * i) / 40);
        env.head.y = 1.6 - 0.25 * b;
        env.head.z = -0.3 * b;
        run(tk, env, 1, ev);
      }
      env.head.y = 1.6;
      env.head.z = 0;
      run(tk, env, 10, ev);
      expect(ev.filter((e) => e.t === 'rockBurst').length).toBe(k === 2 ? 1 : 0);
    }
    expect(ev.filter((e) => e.t === 'chips').length).toBe(4); // (3 embestidas y los añicos)
    expect(o.dx).toBeUndefined(); // (nunca se aparta: la rompiste)
    expect(tk.halt).toBe(null);
    expect(tk.ducked).toBe(1);
  });

  it('las cadenas del cofre se rompen con otro movimiento (con curl, sentadillas), no con el ejercicio', () => {
    const { tk, env, store } = mk('curl');
    tk.reset();
    expect(trekChainMove('curl')).toBe('squat');
    const o: TrekObs = { kind: 'chest', at: 1.5, judged: false, side: 1, y: 1.4, maxUp: -1, move: 'squat', need: 4, links: 52 };
    tk.obs.push(o);
    run(tk, env, 2);
    expect(tk.halt).toBe(o);
    for (let i = 0; i < 3; i++) tk.rep(false);
    expect(o.got).toBe(0);
    const ev: TrekEv[] = [];
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 50; i++) {
        env.head.y = 1.6 - 0.3 * Math.sin((Math.PI * i) / 50);
        run(tk, env, 1, ev);
      }
      env.head.y = 1.6;
      run(tk, env, 5, ev);
    }
    expect(o.got).toBe(4);
    expect(ev.filter((e) => e.t === 'links').map((e) => (e as { cut: number }).cut)).toEqual([13, 26, 39, 52]);
    expect(ev.some((e) => e.t === 'chestOpen')).toBe(true);
    expect(tk.keys).toBe(1);
    expect(ev.find((e) => e.t === 'store')).toEqual({ t: 'store', key: TREK_GEMS, val: 1 });
    expect(store[TREK_GEMS]).toBeUndefined(); // (lo escribe la partida, con el suceso)
  });

  it('el arroyo: cada salto, a la piedra siguiente, y al final en la otra orilla', () => {
    const { tk, env } = mk('squat');
    tk.reset();
    env.rnd = rng(9);
    tk.next = 0.9;
    tk.nObs = 1; // (el siguiente por turnos: el arroyo)
    tk.spawn();
    const o = tk.obs[0];
    expect(o.kind).toBe('stream');
    run(tk, env, 2);
    expect(tk.halt).toBe(o);
    const d0 = tk.dist;
    for (let k = 0; k < (o.need || 0); k++) {
      for (let i = 0; i < 36; i++) {
        env.head.y = 1.6 + 0.2 * Math.sin((Math.PI * i) / 36);
        run(tk, env, 1);
      }
      env.head.y = 1.6;
      run(tk, env, 60);
    }
    expect(tk.halt).toBe(null);
    run(tk, env, 72 * 3);
    expect(tk.dist).toBeCloseTo((o.exit || 0), 5);
    expect(tk.dist).toBeGreaterThan(d0);
  });
});
