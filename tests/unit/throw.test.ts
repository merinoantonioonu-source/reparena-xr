// La sacudida que lanza el rayo (src/input/throw.ts, la de RepArena): con trayectorias de la mano simuladas a 72
// imágenes por segundo, las sacudidas que lanzan y los gestos que no.
import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { hands } from '../../src/input/hand-model.js';
import { HTH, throwCharge, throwReset, throwStep, throwTarget } from '../../src/input/throw.js';
import { gazeLockReset } from '../../src/input/gaze-lock.js';
import { Dummy, handAt, mkEnv, resetHands } from './hands-sim.js';

const DT = 1 / 72;
const ZOMBI = new Vector3(0, 1.1, -4); // (delante, a 4 m)
let t = 0;

// la muñeca va por una lista de tramos: [segundos, hasta dónde]; null: las gafas no la ven
type Leg = [number, Vector3 | null];
function play(env: ReturnType<typeof mkEnv>, side: 'left' | 'right', start: Vector3, legs: Leg[]): void {
  let from = start.clone();
  handAt(side, from);
  for (const [secs, to] of legs) {
    const n = Math.max(1, Math.round(secs / DT));
    for (let i = 1; i <= n; i++) {
      t += DT;
      env.t = t;
      if (to) {
        const k = i / n, e = k * k * (3 - 2 * k); // (acelera y frena, como una mano)
        handAt(side, from.clone().lerp(to, e));
      } else handAt(side, null);
      throwStep(DT, t, env);
    }
    if (to) from = to.clone();
  }
}
const cadera = new Vector3(0.25, 1.0, -0.15);
const quieta = (p: Vector3, s = 0.4): Leg => [s, p.clone()];

beforeEach(() => {
  resetHands();
  throwReset();
  gazeLockReset();
  t = 0;
});

describe('la sacudida', () => {
  it('desde la cadera, deprisa hacia el zombi: sale el rayo de esa mano, con su carga', () => {
    const z = new Dummy(ZOMBI.clone()), env = mkEnv([z]);
    expect(throwCharge(2, true, 2, true, true, env.say)).toBe(true);
    play(env, 'right', cadera, [quieta(cadera), [0.16, new Vector3(0.2, 1.25, -0.55)], quieta(new Vector3(0.2, 1.25, -0.55))]);
    expect(env.shots).toHaveLength(1);
    const s = env.shots[0];
    expect(s.side).toBe('right');
    expect(s.target).toBe(z);
    expect(s.c).toEqual({ dmg: 2, perfect: true, pow: 2 });
    expect(s.d.z).toBeLessThan(-0.5); // (hacia delante)
    expect(HTH.right.c).toBeNull(); // (la carga de esa mano se ha ido)
    expect(HTH.left.c).not.toBeNull(); // (la otra sigue cargada)
  });

  it('sin carga, la misma sacudida no lanza nada', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    play(env, 'right', cadera, [quieta(cadera), [0.16, new Vector3(0.2, 1.25, -0.55)], quieta(new Vector3(0.2, 1.25, -0.55))]);
    expect(env.shots).toHaveLength(0);
  });

  it('llevar la mano atrás para coger impulso no lanza (la carga se queda)', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    throwCharge(1, false, 1, true, true, env.say);
    const delante = new Vector3(0.2, 1.2, -0.45);
    play(env, 'right', delante, [quieta(delante), [0.16, new Vector3(0.25, 1.05, 0.05)], quieta(new Vector3(0.25, 1.05, 0.05))]);
    expect(env.shots).toHaveLength(0);
    expect(HTH.right.c).not.toBeNull();
  });

  it('coger impulso y lanzar: sale el rayo al lanzar', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    throwCharge(1, false, 1, true, true, env.say);
    const atras = new Vector3(0.25, 1.05, 0.05), delante = new Vector3(0.2, 1.25, -0.5);
    play(env, 'right', cadera, [quieta(cadera), [0.25, atras], [0.18, delante], quieta(delante)]);
    expect(env.shots).toHaveLength(1);
  });

  it('un movimiento lento no lanza', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    throwCharge(1, false, 1, true, true, env.say);
    play(env, 'right', cadera, [quieta(cadera), [1.6, new Vector3(0.2, 1.25, -0.55)], quieta(new Vector3(0.2, 1.25, -0.55))]);
    expect(env.shots).toHaveLength(0);
  });

  it('sin ningún zombi hacia donde va la mano, la carga se queda en la mano', () => {
    const env = mkEnv([new Dummy(new Vector3(-3, 1.1, -3))]); // (a la izquierda)
    throwCharge(1, false, 1, true, true, env.say);
    const fuera = new Vector3(0.8, 1.2, -0.1); // (la sacudida, hacia la derecha)
    play(env, 'right', new Vector3(0.2, 1.1, -0.2), [quieta(new Vector3(0.2, 1.1, -0.2)), [0.16, fuera], quieta(fuera)]);
    expect(env.shots).toHaveLength(0);
    expect(HTH.right.c).not.toBeNull();
  });

  it('un rayo por mano: la segunda sacudida de la misma mano ya no lanza', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    throwCharge(1, false, 1, true, true, env.say);
    const delante = new Vector3(0.2, 1.25, -0.55);
    play(env, 'right', cadera, [quieta(cadera), [0.16, delante], quieta(delante), [0.4, cadera], quieta(cadera), [0.16, delante], quieta(delante)]);
    expect(env.shots).toHaveLength(1);
  });

  it('las cargas no se acumulan: dos repeticiones dejan una por mano (la más fuerte)', () => {
    const env = mkEnv([]);
    throwCharge(1, false, 1, true, true, env.say);
    throwCharge(3, false, 2, true, true, env.say);
    expect(HTH.left.c).toEqual({ dmg: 3, perfect: false, pow: 2 });
    expect(HTH.right.c).toEqual({ dmg: 3, perfect: false, pow: 2 });
  });

  it('si las gafas pierden la mano en plena sacudida hacia el zombi, el rayo sale igual', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    throwCharge(1, false, 1, true, true, env.say);
    const medio = new Vector3(0.22, 1.12, -0.32);
    // acelera hacia delante y, a mitad de camino, deja de verse
    play(env, 'right', cadera, [quieta(cadera), [0.06, medio], [0.2, null]]);
    expect(env.shots).toHaveLength(1);
  });

  it('en el ordenador, sin manos, la repetición no carga las manos (el rayo sale solo)', () => {
    const env = mkEnv([]);
    expect(throwCharge(1, false, 1, true, false, env.say)).toBe(false);
    expect(HTH.left.c).toBeNull();
  });

  it('sin lanzar con las manos (puntería automática o con la mirada), no carga', () => {
    const env = mkEnv([]);
    expect(throwCharge(1, false, 1, false, true, env.say)).toBe(false);
  });

  it('la primera vez, explica cómo se lanza', () => {
    const env = mkEnv([]);
    throwCharge(1, false, 1, true, true, env.say);
    throwCharge(1, false, 1, true, true, env.say);
    expect(env.says).toEqual(['Mano atrás y lánzala hacia el enemigo']);
  });
});

describe('el blanco', () => {
  it('el más cercano a la dirección del lanzamiento (sobre todo en horizontal)', () => {
    const a = new Dummy(new Vector3(-1.5, 1.1, -4)), b = new Dummy(new Vector3(1.5, 1.1, -4));
    expect(throwTarget(new Vector3(0, 1.2, -0.3), new Vector3(0.3, 0.4, -1).normalize(), [a, b])).toBe(b);
    expect(throwTarget(new Vector3(0, 1.2, -0.3), new Vector3(-0.3, -0.3, -1).normalize(), [a, b])).toBe(a);
  });
  it('bajar la mano de golpe hacia el suelo no es lanzar al de delante', () => {
    const a = new Dummy(new Vector3(0, 1.1, -4));
    expect(throwTarget(new Vector3(0, 1.2, -0.3), new Vector3(0, -1, -0.15).normalize(), [a])).toBeNull();
  });
  it('los caídos no cuentan', () => {
    const a = new Dummy(new Vector3(0, 1.1, -4));
    a.alive = false;
    expect(throwTarget(new Vector3(0, 1.2, -0.3), new Vector3(0, 0, -1), [a])).toBeNull();
  });
  it('«al que miras»: la sacudida hacia delante va al que llevas un rato mirando', () => {
    const a = new Dummy(new Vector3(-1.2, 1.1, -4)), b = new Dummy(new Vector3(1.2, 1.1, -4)), env = mkEnv([a, b]);
    env.gaze.set(-1.2, -0.5, -4).normalize(); // (miras al de la izquierda)
    throwCharge(1, false, 1, true, true, env.say);
    const derecha = new Vector3(0.3, 1.1, -0.1), delante = new Vector3(0.35, 1.25, -0.55);
    play(env, 'right', derecha, [quieta(derecha, 0.6), [0.16, delante], quieta(delante)]);
    expect(env.shots).toHaveLength(1);
    expect(env.shots[0].target).toBe(a);
    expect(env.locks).toContain(a); // (con su diana)
  });
  it('«hacia donde lanzas»: va al de la dirección de la mano aunque mires a otro', () => {
    const a = new Dummy(new Vector3(-1.2, 1.1, -4)), b = new Dummy(new Vector3(1.2, 1.1, -4)), env = mkEnv([a, b]);
    env.byGaze = false;
    env.gaze.set(-1.2, -0.5, -4).normalize();
    throwCharge(1, false, 1, true, true, env.say);
    const derecha = new Vector3(0.3, 1.1, -0.1), delante = new Vector3(0.45, 1.25, -0.55);
    play(env, 'right', derecha, [quieta(derecha, 0.6), [0.16, delante], quieta(delante)]);
    expect(env.shots[0]?.target).toBe(b);
  });
});

describe('mandos como manos', () => {
  const aimAt = (p: Vector3): void => {
    const h = hands.right;
    h.isHand = false;
    h.virt = true;
    h.ok = true;
    h.rayOk = true;
    h.rayO.set(0.2, 1.2, -0.3);
    h.rayD.copy(p).sub(h.rayO).normalize();
  };
  const frames = (env: ReturnType<typeof mkEnv>, n: number, trig: boolean, grip = false): void => {
    for (let i = 0; i < n; i++) {
      hands.right.trig = trig;
      hands.right.grip = grip;
      t += DT;
      env.t = t;
      throwStep(DT, t, env);
    }
  };
  it('apuntando con la mano, el gatillo lanza el rayo (un instante después)', () => {
    const z = new Dummy(ZOMBI.clone()), env = mkEnv([z]);
    throwCharge(1, false, 1, true, true, env.say);
    aimAt(ZOMBI);
    frames(env, 2, false);
    frames(env, 3, true);
    expect(env.shots).toHaveLength(0); // (aún no: por si llega el agarre)
    frames(env, 10, true);
    expect(env.shots).toHaveLength(1);
    expect(env.shots[0].target).toBe(z);
    expect(env.locks).toContain(z); // (con carga, la diana del que apuntas)
  });
  it('gatillo y agarre a la vez es el puño: no dispara', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    throwCharge(1, false, 1, true, true, env.say);
    aimAt(ZOMBI);
    frames(env, 2, false);
    frames(env, 2, true);
    frames(env, 20, true, true);
    expect(env.shots).toHaveLength(0);
  });
  it('sin carga, el gatillo avisa de que toca hacer una sentadilla', () => {
    const env = mkEnv([new Dummy(ZOMBI.clone())]);
    aimAt(ZOMBI);
    frames(env, 2, false); // (cuenta al apretarlo: suelto antes)
    frames(env, 12, true);
    expect(env.shots).toHaveLength(0);
    expect(env.says).toContain('Sin carga: ¡haz una sentadilla!');
  });
});
