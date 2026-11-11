// El modo Toques (src/modes/touch): la cabeza por el hueco de la ameba, cada diamante con su mano, volver a la postura de
// partida entre toques, los movimientos de cada ejercicio y lo largas que son las oleadas.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Side } from '../../src/input/hand-model.js';
import type { TouchEnv, TouchEvent } from '../../src/modes/touch/env.js';
import { mkTouch, TouchTarget, type TouchState } from '../../src/modes/touch/targets.js';
import { buildTouchWave, touchStartWave, touchStep, type TouchSpec } from '../../src/modes/touch/wave.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const BASE: Record<string, number | string> = { exercise: 'squat', comboBase: 'stand', tchRing: 15, squatDepth: 26, lungeDepth: 28, pushDepth: 13, jumpHeight: 10, slamDeep: 12, tchHands: 0, tchWindow: 1.2, tchGap: 2.4, tchArrive: 3, plankHold: 5, abMin: 25, abMax: 55, abTwist: 25, absMoves: 'crunch,twist,knee', sword: 'off', swordHand: 'right', repsWave: 6, repsInc: 2, bpm: 0 };

function setup(over: Record<string, number | string> = {}, seed = 1) {
  const settings = { ...BASE, ...over }, head = new Vector3(0, 1.6, 0), hands = { left: mkHand(), right: mkHand() };
  const env = { s: (k: string) => +settings[k] || 0, str: (k: string) => String(settings[k] ?? ''), dv: (k: string) => +settings[k] || 0, rnd: rng(seed), now: () => 0, state: 'play', head, headSpeed: 0, hands, toArena: (v: Vector3) => v, ar: false, standY: 1.6, swordActive: () => false, swordCut: () => null, waveReps: (i: number) => Math.max(1, Math.round(+settings.repsWave + +settings.repsInc * i)) } as TouchEnv;
  const tch = mkTouch(env);
  return { settings, env, tch, head, hands };
}
// avanza hasta `secs` con lo que haga `move` en cada fotograma; devuelve todos los sucesos
function run(tch: TouchState, queue: TouchSpec[], secs: number, move: (t: number) => void = () => {}): TouchEvent[] {
  const all: TouchEvent[] = [], dt = 1 / 72;
  for (let t = 0; t < secs; t += dt) {
    move(t);
    all.push(...touchStep(tch, queue, dt, t));
  }
  return all;
}
const hand = (tch: TouchState, s: Side, p: Vector3 | null) => {
  const h = tch.env.hands[s];
  h.ok = !!p;
  h.isHand = false;
  if (p) h.wrist.copy(p);
};

describe('el modo Toques', () => {
  it('meter la cabeza por el hueco de la ameba la revienta; luego hay que volver a la postura', () => {
    const { tch, head } = setup();
    const x = new TouchTarget(tch, 'squat', 1);
    tch.touches.push(x);
    const ev = run(tch, [], 1.5, () => {
      if (x.mode === 'wait') head.copy(x.at);
    });
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit).toBeTruthy();
    expect(x.mode).toBe('burst');
    expect(tch.headArm.armed).toBe(false);
    expect(ev.some((e) => e.type === 'miss')).toBe(false);
  });

  it('con la cabeza fuera, la ameba pasa de largo y golpea', () => {
    const { tch, head } = setup();
    const x = new TouchTarget(tch, 'squat', 1);
    tch.touches.push(x);
    head.set(1, 1.6, 0);
    const ev = run(tch, [], 3);
    const miss = ev.find((e) => e.type === 'miss');
    expect(miss && miss.type === 'miss' && miss.hurt && miss.text).toBe('¡Mete la cabeza en la ameba!');
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(ev.some((e) => e.type === 'gone')).toBe(true);
  });

  it('el diamante de la izquierda se toca con la mano izquierda', () => {
    const { tch } = setup();
    const x = new TouchTarget(tch, 'punch', 1, -1);
    expect([x.part, x.hand]).toEqual(['hand', 'left']);
    tch.touches.push(x);
    hand(tch, 'left', new Vector3(-0.3, 1, 0));
    const wrong = run(tch, [], 1.3, () => {
      if (x.mode === 'wait') hand(tch, 'right', x.at);
    });
    expect(wrong.some((e) => e.type === 'hint' && e.text === '¡Con la mano izquierda!')).toBe(true);
    expect(wrong.some((e) => e.type === 'hit')).toBe(false);
    hand(tch, 'right', new Vector3(0.3, 1, 0));
    const ok = run(tch, [], 0.3, () => hand(tch, 'left', x.at));
    const hit = ok.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.t.by).toBe('left');
    expect(tch.arm.left.armed).toBe(false); // y ahora esa mano tiene que volver atrás
  });

  it('tras un toque, la siguiente no cuenta hasta volver a la postura de partida', () => {
    const { tch, head } = setup();
    const a = new TouchTarget(tch, 'squat', 0.8);
    tch.touches.push(a);
    run(tch, [], 1, () => {
      if (a.mode === 'wait') head.copy(a.at);
    });
    expect(tch.headArm.armed).toBe(false);
    // la siguiente llega donde sigue la cabeza (abajo): no vale
    const b = new TouchTarget(tch, 'squat', tch.clock + 0.5);
    b.pos.copy(head);
    tch.touches.push(b);
    const low = run(tch, [], 0.8, () => {
      if (b.mode === 'wait') head.copy(b.at);
    });
    expect(low.some((e) => e.type === 'hint' && e.text === 'Vuelve a la posición de partida')).toBe(true);
    expect(low.some((e) => e.type === 'hit')).toBe(false);
    // de pie otra vez: ya vale
    head.set(0, tch.ref, 0);
    run(tch, [], 0.05);
    expect(tch.headArm.armed).toBe(true);
    const again = run(tch, [], 0.3, () => head.copy(b.at));
    expect(again.some((e) => e.type === 'hit')).toBe(true);
  });

  it('cada ejercicio trae sus movimientos', () => {
    const moves = (over: Record<string, number | string>) => {
      const set = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) for (const x of buildTouchWave(setup(over, seed).tch, 0)) set.add(x.move);
      return [...set].sort();
    };
    expect(moves({ exercise: 'squat', tchHands: 50 })).toEqual(['punch', 'squat']);
    expect(moves({ exercise: 'lunge', tchHands: 0 })).toEqual(['lunge']);
    expect(moves({ exercise: 'jump', tchHands: 50 })).toEqual(['jump', 'reach']);
    expect(moves({ exercise: 'pushup', tchHands: 100 })).toEqual(['push']); // en flexiones, solo amebas
    expect(moves({ exercise: 'abs', tchHands: 50 })).toEqual(['crunch', 'knee', 'twist']);
    expect(moves({ exercise: 'abs', absMoves: 'side' })).toEqual(['side']); // solo Lateral: todo laterales
    expect(moves({ exercise: 'slam', tchHands: 40 })).toEqual(['duck', 'floor', 'jump', 'lfwd', 'low', 'lside', 'reach']);
    expect(moves({ exercise: 'slam', tchHands: 100, sword: 'one' })).toEqual(['cutFwd', 'cutHigh', 'cutLow', 'cutSide']);
    expect(moves({ exercise: 'combo', comboBase: 'floor', comboFloor: 'push,plank,tap', comboOrder: 'seq' })).toEqual(['plank', 'push', 'tap']);
    // sin espada en la mano, los bloques llegan como diamantes
    const { tch } = setup({ exercise: 'slam' });
    expect(new TouchTarget(tch, 'cutLow', 1).move).toBe('low');
  });

  it('cada oleada trae «Objetivos por oleada» (más los que se suman cada oleada), y salen todos', () => {
    for (const exercise of ['squat', 'slam', 'abs', 'pushup', 'combo']) {
      for (let i = 0; i < 4; i++) expect(buildTouchWave(setup({ exercise, comboStand: 'squat,jump' }).tch, i)).toHaveLength(6 + 2 * i);
    }
    const { tch } = setup({ tchGap: 1, tchWindow: 0.5, tchArrive: 1 });
    const q = buildTouchWave(tch, 0);
    touchStartWave(tch);
    const ev = run(tch, q, 15);
    expect(ev.filter((e) => e.type === 'spawn')).toHaveLength(6);
    expect(ev.filter((e) => e.type === 'miss')).toHaveLength(6); // (nadie los toca)
    expect(q).toHaveLength(0);
  });
});
