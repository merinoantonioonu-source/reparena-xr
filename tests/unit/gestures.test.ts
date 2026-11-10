// La mirada que elige al enemigo (src/input/gaze-lock.ts), el puñetazo (src/input/punch.ts) y el puño (isFist), los de
// RepArena.
import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GZL, gazeLock, gazeLockReset, gazeLockStep } from '../../src/input/gaze-lock.js';
import { hands, head, isFist } from '../../src/input/hand-model.js';
import { PUNCH, punchReset, punchStep, type PunchTarget } from '../../src/input/punch.js';
import { Dummy, handAt, resetHands } from './hands-sim.js';

const DT = 1 / 72;
const eye = new Vector3(0, 1.6, 0);
const toward = (p: Vector3): Vector3 => p.clone().sub(eye).normalize();

beforeEach(() => {
  resetHands();
  gazeLockReset();
  punchReset();
  GZL.t = 0;
});

describe('la mirada', () => {
  const a = new Dummy(new Vector3(-1.5, 1.2, -5)), b = new Dummy(new Vector3(1.5, 1.2, -5));
  let t = 0;
  const look = (p: Vector3, secs: number): void => {
    for (let i = 0; i < secs / DT; i++) gazeLockStep((t += DT), eye, toward(p), [a, b], 9);
  };
  beforeEach(() => {
    t = 0;
    a.alive = b.alive = true;
  });
  it('fija al que llevas un momento mirando', () => {
    look(a.pos, 0.3);
    expect(gazeLock()).toBe(a);
  });
  it('mirar un instante a otro no lo cambia; mirarlo un rato, sí', () => {
    look(a.pos, 0.5);
    look(b.pos, 0.1);
    expect(gazeLock()).toBe(a);
    look(b.pos, 0.6);
    expect(gazeLock()).toBe(b);
  });
  it('se suelta si miras lejos de él un par de segundos', () => {
    look(a.pos, 0.5);
    look(new Vector3(0, 6, 1), 1.5); // (al techo, detrás)
    expect(gazeLock()).toBe(a);
    look(new Vector3(0, 6, 1), 1);
    expect(gazeLock()).toBeNull();
  });
  it('si cae, ya no está fijado', () => {
    look(a.pos, 0.5);
    a.alive = false;
    expect(gazeLock()).toBeNull();
  });
});

describe('el puñetazo', () => {
  const zombi = new Dummy(new Vector3(0.25, 1.2, -0.6), 0.3) as Dummy & PunchTarget;
  const hits: { side: string; speed: number }[] = [];
  const run = (from: Vector3, to: Vector3, secs: number): void => {
    const n = Math.round(secs / DT);
    for (let i = 0; i <= n; i++) {
      handAt('right', from.clone().lerp(to, i / n));
      punchStep(DT, true, [zombi], (side, _e, _v, speed) => hits.push({ side, speed }));
    }
  };
  beforeEach(() => {
    hits.length = 0;
  });
  it('la mano que llega deprisa a su cuerpo lo golpea (una vez)', () => {
    run(new Vector3(0.25, 1.2, -0.1), new Vector3(0.25, 1.2, -0.55), 0.15);
    expect(hits).toHaveLength(1);
    expect(hits[0].side).toBe('right');
    expect(hits[0].speed).toBeGreaterThan(1.8);
    expect(PUNCH.n).toBe(1);
  });
  it('despacio no es un puñetazo', () => {
    run(new Vector3(0.25, 1.2, -0.1), new Vector3(0.25, 1.2, -0.55), 0.6);
    expect(hits).toHaveLength(0);
  });
  it('agacharse (baja todo el cuerpo, también la cabeza) no cuenta', () => {
    const n = 10;
    for (let i = 0; i <= n; i++) {
      head.p.set(0, 1.6 - (0.6 * i) / n, 0);
      handAt('right', new Vector3(0.25, 1.25 - (0.6 * i) / n, -0.5));
      punchStep(DT, true, [zombi], (side) => hits.push({ side, speed: 0 }));
    }
    expect(hits).toHaveLength(0);
  });
  it('apagado (sin «Apartar a golpes» o fuera de la partida), nada', () => {
    const n = 10;
    for (let i = 0; i <= n; i++) {
      handAt('right', new Vector3(0.25, 1.2, -0.1 - (0.45 * i) / n));
      punchStep(DT, false, [zombi], (side) => hits.push({ side, speed: 0 }));
    }
    expect(hits).toHaveLength(0);
  });
});

describe('el puño', () => {
  it('con mandos como manos: gatillo y agarre a la vez', () => {
    const h = hands.left;
    h.virt = true;
    h.trig = true;
    expect(isFist(h)).toBe(false);
    h.grip = true;
    expect(isFist(h)).toBe(true);
  });
  it('con las manos: las puntas de los dedos junto a la muñeca', () => {
    const h = hands.right;
    h.isHand = true;
    h.wrist.set(0, 1, 0);
    for (const j of [9, 14, 19, 24]) {
      h.J[j].ok = true;
      h.J[j].p.set(0.05, 1, -0.05);
    }
    expect(isFist(h)).toBe(true);
    for (const j of [9, 14, 19, 24]) h.J[j].p.set(0, 1, -0.18); // (la mano abierta)
    expect(isFist(h)).toBe(false);
  });
});
