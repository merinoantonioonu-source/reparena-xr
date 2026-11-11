// El modo Barras (src/modes/bars): colgarse, contar dominadas por la altura de la cabeza, caerse, el colgado por
// segundos, reventar los objetivos con la cabeza y colocar la barra con las manos.
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import type { BarEvent, BarsEnv, PlaceEnv } from '../../src/modes/bars/env.js';
import { BarDetector, handsOff } from '../../src/modes/bars/detect.js';
import { BarField, buildBarWave } from '../../src/modes/bars/targets.js';
import { Placer, PLACE_HOLD, type PlaceEvent } from '../../src/modes/bars/place.js';
import { EQUIP_KEY, eqLocal, eqWorld, loadEquip } from '../../src/modes/bars/equip.js';

const DT = 1 / 72;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

function mkWorld(over: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = { exercise: 'pullup', dipBars: '2', barTarget: 'bubbles', barMix: 0, barOffset: 30, barWait: 0, barArrive: 2, pullRange: 30, rowRange: 25, fallMargin: 12, perfectTime: 1.2, powHold: 1.5, powHoldInc: 0.5, doorH: 210, doorW: 90, dipH: 100, dipGap: 55, dipLen: 100, repsWave: 5, repsInc: 1, hangTime: 10, hangInc: 5, waves: 0, ...over };
  const mem = new Map<string, string>();
  const store = (k: string, v?: unknown): unknown => (v === undefined ? JSON.parse(mem.get(k) ?? 'null') : (mem.set(k, JSON.stringify(v)), null));
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const env: PlaceEnv & BarsEnv = {
    s: (k) => settings[k] as number,
    str: (k) => settings[k] as string,
    dv: (k) => settings[k] as number,
    rnd: rng(7),
    head: { p: new Vector3(0, 1.6, 0), q: new Quaternion(), speed: 0 },
    hands,
    state: 'idle',
    arena: { x: 0, z: 0, ry: 0 },
    eq: loadEquip(store),
    preview: false,
    gates: [],
    arenaFromHead() {},
    sesWave: () => 0,
    nWaves: () => 0,
    setSetting: (k, v) => (settings[k] = v),
    store,
  };
  // la barra de puerta, en el origen, a lo largo de x
  Object.assign(env.eq.xr.door, { x: 0, z: 0, yaw: 0, set: true });
  const bar = new BarDetector(), field = new BarField(bar), out: BarEvent[] = [];
  const top = (settings.doorH as number) / 100;
  // agarrado: las manos en la barra; colgado: la cabeza 45 cm por debajo
  const grip = (on = true) => {
    for (const s of ['left', 'right'] as Side[]) {
      hands[s].ok = true;
      hands[s].wrist.set(s === 'left' ? -0.3 : 0.3, on ? top : top - 0.7, 0);
    }
  };
  const hangY = top - 0.45;
  let t = 0;
  /** Un fotograma con la cabeza a la altura y (velocidad de la cabeza según cuánto se mueve). */
  const step = (y: number, x = 0) => {
    t += DT;
    const prev = env.head.p.clone();
    env.head.p.set(x, y, 0.1);
    env.head.speed = env.head.speed * 0.85 + (prev.distanceTo(env.head.p) / DT) * 0.15;
    if (env.state === 'mount') bar.mountStep(DT, env, out);
    apply();
    if (env.state === 'play') bar.detect(t, DT, env, out, field);
    apply();
    if (env.state === 'play') field.spawnStep(DT, env, out);
    apply();
    field.update(DT, t, env, out);
    apply();
  };
  const log: BarEvent[] = [];
  const apply = () => {
    for (const ev of out) {
      log.push(ev);
      if (ev.type === 'mounted') {
        env.state = 'play';
        if (!ev.resume) field.startWave(env, ev.wave);
      } else if (ev.type === 'fall') {
        bar.toMount(0, true);
        env.state = 'mount';
      }
    }
    out.length = 0;
  };
  /** Colgarse: quieto bajo la barra con las manos arriba hasta que empieza la oleada. */
  const mount = () => {
    bar.reset();
    bar.toMount(0);
    env.state = 'mount';
    grip();
    for (let i = 0; i < 72 * 6 && env.state !== 'play'; i++) step(hangY);
  };
  /** Una dominada: sube `amp` metros en `up` s y baja en `down` s. */
  const pull = (amp: number, up = 1, down = 1, hold = 0) => {
    for (let i = 0; i < 72 * up; i++) step(hangY + amp * (i / (72 * up)));
    for (let i = 0; i < 72 * hold; i++) step(hangY + amp);
    for (let i = 0; i < 72 * down; i++) step(hangY + amp * (1 - i / (72 * down)));
    for (let i = 0; i < 36; i++) step(hangY);
  };
  return { settings, env, bar, field, log, step, mount, pull, grip, hangY, top, count: (type: string) => log.filter((e) => e.type === type).length };
}

describe('el modo Barras', () => {
  it('se cuelga quieto bajo la barra con las manos arriba y empieza la oleada', () => {
    const w = mkWorld();
    w.mount();
    expect(w.env.state).toBe('play');
    expect(w.count('mounted')).toBe(1);
    expect(w.bar.ref).toBeCloseTo(w.hangY, 5);
    expect(w.field.queue.length).toBe(5);
  });

  it('con las manos abajo a la vista no estás colgado: no empieza', () => {
    const w = mkWorld();
    w.bar.toMount(0);
    w.env.state = 'mount';
    w.grip(false);
    expect(handsOff(w.env)).toBe(true);
    for (let i = 0; i < 72 * 8; i++) w.step(w.hangY);
    expect(w.env.state).toBe('mount');
    expect(w.bar.phase).toBe('place');
  });

  it('una dominada que pasa el recorrido cuenta; una a medias, no (y avisa)', () => {
    const w = mkWorld();
    w.mount();
    w.pull(0.36, 1.2);
    expect(w.count('rep')).toBe(1);
    w.pull(0.2, 1.2);
    expect(w.count('rep')).toBe(1);
    expect(w.log.some((e) => e.type === 'partial' && e.text === '¡Más arriba!')).toBe(true);
    w.pull(0.4, 1.0);
    expect(w.count('rep')).toBe(2);
  });

  it('aguantar arriba carga ×2 y, al bajar, sale la onda', () => {
    const w = mkWorld();
    w.mount();
    w.pull(0.36, 1, 1, 2);
    expect(w.log.some((e) => e.type === 'cheer' && e.text === 'CARGA ×2')).toBe(true);
    expect(w.log.some((e) => e.type === 'cheer' && e.text === '¡ONDA ×2!')).toBe(true);
    expect(w.bar.pw).toBe(1);
  });

  it('bajar más del margen es caerse: vuelve a colgarse y sigue la oleada', () => {
    const w = mkWorld();
    w.mount();
    for (let i = 0; i < 40; i++) w.step(w.hangY - (0.3 * i) / 40);
    const f = w.log.find((e) => e.type === 'fall');
    expect(f && f.type === 'fall' && f.reason).toBe('la cabeza bajó más de 12 cm');
    expect(f && f.type === 'fall' && f.door).toBe(true);
    expect(w.env.state).toBe('mount');
    expect(w.bar.phase).toBe('place');
    // de vuelta, colgado y quieto: sigue (sin empezar otra oleada)
    for (let i = 0; i < 72 * 6 && w.env.state !== 'play'; i++) w.step(w.hangY);
    expect(w.env.state).toBe('play');
    const m = w.log.filter((e) => e.type === 'mounted');
    expect(m.length).toBe(2);
    expect(m[1].type === 'mounted' && m[1].resume).toBe(true);
  });

  it('soltar las manos (abajo, a la vista) también es caerse', () => {
    const w = mkWorld();
    w.mount();
    w.grip(false);
    for (let i = 0; i < 30; i++) w.step(w.hangY);
    const f = w.log.find((e) => e.type === 'fall');
    expect(f && f.type === 'fall' && f.reason).toBe('tus manos se vieron por debajo de la barra');
  });

  it('colgado: un punto por segundo agarrado, y la oleada pide sus segundos', () => {
    const w = mkWorld({ exercise: 'hang' });
    w.mount();
    expect(w.bar.need).toBe(10);
    expect(w.field.queue.length).toBe(0);
    for (let i = 0; i < 72 * 3.5; i++) w.step(w.hangY);
    const secs = w.log.filter((e) => e.type === 'hangSec');
    expect(secs.map((e) => e.type === 'hangSec' && e.s)).toEqual([1, 2, 3]);
    expect(w.bar.hold).toBeGreaterThan(3.4);
  });

  it('la pompa revienta al alcanzarla con la cabeza subiendo (y esa subida cuenta)', () => {
    const w = mkWorld();
    w.mount();
    for (let i = 0; i < 72 * 4; i++) w.step(w.hangY);
    const tg = w.field.front();
    expect(tg && tg.mode).toBe('wait');
    w.pull(0.36, 1.5);
    const rep = w.log.find((e) => e.type === 'rep');
    expect(rep && rep.type === 'rep' && rep.contact).toBe(true);
    expect(w.log.some((e) => e.type === 'killed' && e.target === tg)).toBe(true);
    expect(w.count('rep')).toBe(1); // (la subida no cuenta otra vez al llegar arriba)
  });

  it('la oleada del jefe: los normales y, al final, uno grande que aguanta varios cabezazos', () => {
    const w = mkWorld({ repsWave: 10, repsInc: 0, barTarget: 'bugs' });
    const q = buildBarWave(w.env, 4);
    expect(q.length).toBe(8); // (10 repeticiones: 7 avispas y la reina, que aguanta 3)
    expect(q[7]).toEqual({ kind: 'queen', hp: 3 });
    expect(q.slice(0, 7).every((s) => s.kind === 'wasp' && s.hp === 1)).toBe(true);
    expect(buildBarWave(mkWorld({ exercise: 'hang' }).env, 0)).toEqual([]);
  });

  it('colocar la barra: 5 s quieto con las manos arriba y separadas; juntas, abajo o moviéndose, no', () => {
    const w = mkWorld();
    const pl = new Placer(), out: PlaceEvent[] = [], e = w.env;
    const hold = (secs: number, d: number, up = true, wobble = 0) => {
      for (let i = 0; i < 72 * secs; i++) {
        const m = wobble * Math.sin(i * 0.2);
        e.hands.left.ok = e.hands.right.ok = true;
        e.hands.left.wrist.set(1 - d / 2 + m, up ? 1.95 : 1.2, -0.5);
        e.hands.right.wrist.set(1 + d / 2 + m, up ? 1.95 : 1.2, -0.5);
        pl.step(DT, e, out);
      }
    };
    e.head.p.set(1, 1.7, 0);
    pl.start(e, out);
    hold(6, 0.15);
    expect(pl.on).toBe(true);
    expect(pl.ok).toBe(false);
    hold(6, 0.7, false);
    expect(pl.on && !pl.up).toBe(true);
    hold(6, 0.7, true, 0.1);
    expect(pl.on).toBe(true);
    hold(PLACE_HOLD - 0.2, 0.7);
    expect(pl.on).toBe(true);
    hold(0.4, 0.7);
    expect(pl.on).toBe(false);
    expect(pl.wait).toBe(true);
    expect(w.settings.doorH).toBe(197);
    const d = e.eq.xr.door;
    expect(d.x).toBeCloseTo(1, 9);
    expect(d.z).toBeCloseTo(-0.5, 9);
    expect(d.yaw).toBeCloseTo(0, 9);
    expect(d.set).toBe(true);
    expect(pl.note).toBe('Barra colocada a 197 cm de altura');
    // de pie, salen los ajustes finos; «Listo» la guarda con la clave de RepArena
    out.length = 0;
    for (let i = 0; i < 72 * 2; i++) pl.step(DT, e, out);
    expect(out.some((ev) => ev.type === 'adjust')).toBe(true);
    pl.done(e);
    expect((e.store(EQUIP_KEY) as Record<string, { x: number }>).door.x).toBeCloseTo(1, 9);
    expect(e.eq.pending).toEqual(['door']);
  });

  it('las coordenadas del aparato: ida y vuelta', () => {
    const E = { x: 0.4, z: -1.2, yaw: 0.7 }, p = new Vector3(1.1, 1.5, -0.3);
    const l = eqLocal(E, p, new Vector3());
    expect(eqWorld(E, l.x, l.y, l.z, new Vector3()).distanceTo(p)).toBeLessThan(1e-12);
  });
});
