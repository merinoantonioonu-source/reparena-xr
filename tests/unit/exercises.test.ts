// Todos los ejercicios que se pueden jugar, con movimientos de persona (a 72 imágenes por segundo, como en las gafas, y
// con el pequeño vaivén que tienen siempre la cabeza y las manos): cinco repeticiones bien hechas cuentan cinco; quieto en
// la postura no cuenta ninguna (RepArena, en el curl con barra, a veces disparaba rayos al azar); y lo que se hace mal
// avisa en vez de contar. Los de pie, con su detector (src/exercise/standing.ts); los de suelo y sentado, con el suyo
// (src/exercise/floor.ts); los de Toques y Barras tienen sus pruebas (touch.test.ts y bars.test.ts), y aquí se comprueba
// que no se queda ninguno sin probar.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PLAY_MODE_EX } from '../../src/core/playable.js';
import { FloorDetector, floorDefaults, type FloorCfg } from '../../src/exercise/floor.js';
import { STAND_EX, StandingDetector, standDefaults, type StandCfg, type StandEvent } from '../../src/exercise/standing.js';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';

const FPS = 72, DT = 1 / FPS, Y0 = 1.6;
type V3 = [number, number, number];

/** Un tramo: a dónde va la cabeza (altura y, adelante z), cada muñeca (null: no se ve) y el giro de los antebrazos, en s
 * segundos. De pie, las muñecas van respecto a los ojos; en el suelo, en la arena. */
interface Seg {
  y?: number;
  z?: number;
  l?: V3 | null;
  r?: V3 | null;
  ang?: number;
  s: number;
}

interface Opts {
  floor?: boolean;
  y0?: number;
  /** Dónde empiezan las muñecas. */
  l0?: V3;
  r0?: V3;
  z0?: number;
  /** El vaivén (m): la cabeza y las manos nunca están quietas del todo. */
  wobble?: number;
  /** El inchworm: la altura de pie. */
  standY?: number;
  /** Plancha lateral: en plena oleada. */
  wave?: boolean;
  over?: Partial<StandCfg & FloorCfg>;
}

type Ev = StandEvent & { t: number };

function play(ex: string, segs: Seg[], o: Opts = {}): { all: Ev[]; types: string[]; reps: (StandEvent & { type: 'rep' })[]; charges: number } {
  const floor = !!o.floor, y0 = o.y0 ?? Y0, wob = o.wobble ?? 0.006;
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const head = { p: new Vector3(0, y0, o.z0 ?? 0), speed: 0 };
  const I = { hands, head, fwd: new Vector3(0, 0, -1), play: true, headQ: { x: 0, y: 0, z: 0, w: 1 }, wave: o.wave ?? true, iwZ: 0, standY: o.standY ?? Y0 };
  const pos = { left: new Vector3(...(o.l0 ?? (floor ? [-0.2, 0.08, -0.1] : [-0.15, -0.78, -0.15]))), right: new Vector3(...(o.r0 ?? (floor ? [0.2, 0.08, -0.1] : [0.15, -0.78, -0.15]))) };
  const from = { left: new Vector3(), right: new Vector3() }, seen = { left: true, right: true };
  const sd = new StandingDetector(), fd = new FloorDetector();
  const sc = { ...standDefaults(ex), ...o.over } as StandCfg, fc = { ...floorDefaults(ex), ...o.over } as FloorCfg;
  if (floor) fd.reset(y0, { left: pos.left.y, right: pos.right.y });
  else sd.reset(y0);
  let y = y0, z = head.p.z, ang = 0, t = 0;
  const out: StandEvent[] = [], all: Ev[] = [], tmp = new Vector3();
  for (const g of segs) {
    const n = Math.max(1, Math.round(g.s * FPS)), y1 = g.y ?? y, z1 = g.z ?? z, a0 = ang, a1 = g.ang ?? ang;
    from.left.copy(pos.left);
    from.right.copy(pos.right);
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k * k * (3 - 2 * k), prev = head.p.y;
      // el vaivén: lento y suave, como el de una persona quieta (no un temblor de fotograma a fotograma)
      const w = wob * Math.sin(t * 4.1) + wob * 0.5 * Math.sin(t * 9.7 + 1);
      head.p.y = y + (y1 - y) * e + w;
      head.p.z = z + (z1 - z) * e;
      head.speed = Math.abs(head.p.y - prev) / DT;
      ang = a0 + (a1 - a0) * e;
      I.iwZ = head.p.z;
      for (const s of ['left', 'right'] as Side[]) {
        const to = s === 'left' ? g.l : g.r, h = hands[s];
        if (to === null) seen[s] = false;
        else if (to) seen[s] = true;
        h.ok = seen[s];
        if (to) pos[s].copy(from[s]).lerp(tmp.set(...to), e);
        const jw = wob * Math.sin(t * 5.3 + (s === 'left' ? 0 : 2));
        if (floor) h.wrist.copy(pos[s]);
        else h.wrist.copy(head.p).add(pos[s]);
        h.wrist.x += jw;
        h.wrist.y += jw * 0.6;
        // el nudillo del corazón, girado alrededor de la línea entre las muñecas (los antebrazos)
        h.J[10].ok = true;
        h.J[10].p.copy(h.wrist).add(tmp.set(0, 0, -0.09).applyAxisAngle(new Vector3(1, 0, 0), (s === 'left' ? -0.5 : 0.5) * ang));
      }
      t += DT;
      out.length = 0;
      if (floor) fd.update(t, DT, I, fc, out);
      else sd.update(t, DT, I, sc, out);
      for (const ev of out) all.push({ ...ev, t: +t.toFixed(2) });
    }
    y = y1;
    z = z1;
  }
  const reps = all.filter((e) => e.type === 'rep') as (StandEvent & { type: 'rep' })[];
  return { all, types: all.map((e) => e.type), reps, charges: all.filter((e) => e.type === 'charge').length };
}

const times = (n: number, segs: Seg[]): Seg[] => Array.from({ length: n }, () => segs).flat();
const msgs = (all: Ev[], type: string): string[] => all.filter((e) => e.type === type).map((e) => (e as { msg?: string }).msg ?? '');

// ---------------------------------------------------------------- de pie: cada uno, su repetición bien hecha

const REST: V3 = [-0.15, -0.78, -0.15], REST_R: V3 = [0.15, -0.78, -0.15];
const DOWN: Seg = { y: Y0 - 0.32, s: 1.1 }, UP: Seg = { y: Y0, s: 0.9 }, PAUSE: Seg = { s: 0.6 };
/** Una repetición bien hecha de cada ejercicio de pie (y lo que tarda una persona en prepararse para la siguiente). */
const GOOD: Record<string, Seg[]> = {
  squat: [DOWN, UP, PAUSE],
  lunge: [DOWN, UP, PAUSE],
  dlrow: [DOWN, UP, PAUSE],
  jsquat: [DOWN, { y: Y0 + 0.12, s: 0.25 }, { y: Y0, s: 0.3 }, PAUSE],
  thruster: [DOWN, UP, { l: [-0.15, 0.3, -0.1], r: [0.15, 0.3, -0.1], s: 0.5 }, { l: REST, r: REST_R, s: 0.6 }, PAUSE],
  frontsq: [DOWN, UP, { l: [-0.15, -0.25, -0.6], r: [0.15, -0.25, -0.6], s: 0.5 }, { l: REST, r: REST_R, s: 0.6 }, PAUSE],
  swing: [{ y: Y0 - 0.2, l: [-0.04, -0.95, 0.05], r: [0.04, -0.95, 0.05], s: 0.7 }, { y: Y0, l: [-0.04, -0.35, -0.5], r: [0.04, -0.35, -0.5], s: 0.6 }, { l: [-0.04, -0.8, -0.15], r: [0.04, -0.8, -0.15], s: 0.5 }, PAUSE],
  curl: [{ r: [0.15, -0.45, -0.25], s: 0.9 }, { r: REST_R, s: 0.9 }, PAUSE],
  curl2: [{ l: [-0.04, -0.45, -0.25], r: [0.04, -0.45, -0.25], s: 0.9 }, { l: [-0.04, -0.78, -0.2], r: [0.04, -0.78, -0.2], s: 0.9 }, PAUSE],
  fraise: [{ l: [-0.04, -0.28, -0.6], r: [0.04, -0.28, -0.6], s: 1 }, { l: [-0.04, -0.85, -0.2], r: [0.04, -0.85, -0.2], s: 0.9 }, PAUSE],
  twist: [{ ang: 2.6, s: 0.8 }, { ang: -2.6, s: 0.8 }],
};
/** Dónde tiene las manos cada uno al empezar (la pesa agarrada). */
const START: Record<string, Opts> = {
  curl2: { l0: [-0.04, -0.78, -0.2], r0: [0.04, -0.78, -0.2] },
  fraise: { l0: [-0.04, -0.85, -0.2], r0: [0.04, -0.85, -0.2] },
  swing: { l0: [-0.04, -0.8, -0.15], r0: [0.04, -0.8, -0.15] },
  twist: { l0: [-0.3, -0.4, -0.35], r0: [0.3, -0.4, -0.35] },
};
/** El antebrazo cuenta un giro de cada dos (uno carga y el siguiente, al revés, dispara): cinco ciclos, cinco disparos. */
const PER_CYCLE: Record<string, number> = { twist: 1 };

describe('cada ejercicio de pie', () => {
  for (const ex of STAND_EX) {
    it(`${ex}: cinco bien hechas cuentan cinco`, () => {
      const { reps } = play(ex, [{ s: 0.6 }, ...times(5, GOOD[ex])], START[ex]);
      expect(reps.length).toBe(5 * (PER_CYCLE[ex] ?? 1));
    });
    it(`${ex}: quieto 12 s en la postura, ni carga ni dispara`, () => {
      const { reps, charges } = play(ex, [{ s: 12 }], { ...START[ex], wobble: 0.01 });
      expect(reps.length).toBe(0);
      expect(charges).toBe(0);
    });
  }
  it('sentadilla, zancada y peso muerto: bajar poco no cuenta (y avisa)', () => {
    for (const ex of ['squat', 'lunge', 'dlrow']) {
      const { reps, all } = play(ex, [{ s: 0.6 }, { y: Y0 - 0.17, s: 0.8 }, UP, PAUSE]);
      expect(reps.length, ex).toBe(0);
      expect(all.some((e) => e.type === 'partial'), ex).toBe(true);
    }
  });
  it('curl: subir a medias no cuenta (y avisa)', () => {
    const { reps, all } = play('curl', [{ s: 0.6 }, { r: [0.15, -0.62, -0.2], s: 0.7 }, { r: REST_R, s: 0.7 }]);
    expect(reps.length).toBe(0);
    expect(msgs(all, 'partial')).toEqual(['Sube hasta el hombro']);
  });
  it('sentadilla: el ritmo de cada una no importa (rápidas y lentas cuentan; las lentas, perfectas)', () => {
    const fast = play('squat', [{ s: 0.6 }, ...times(5, [{ y: Y0 - 0.32, s: 0.5 }, { y: Y0, s: 0.45 }, { s: 0.2 }])]);
    const slow = play('squat', [{ s: 0.6 }, ...times(3, [{ y: Y0 - 0.32, s: 1.6 }, { y: Y0, s: 1.4 }, PAUSE])]);
    expect(fast.reps.length).toBe(5);
    expect(slow.reps.length).toBe(3);
    expect(slow.reps.every((r) => r.perfect)).toBe(true);
  });
  it('curl: con las dos manos, cada brazo dispara su lado', () => {
    const { reps } = play('curl', [{ s: 0.6 }, { l: [-0.15, -0.45, -0.25], s: 0.9 }, { l: REST, s: 0.9 }, PAUSE, { r: [0.15, -0.45, -0.25], s: 0.9 }, { r: REST_R, s: 0.9 }]);
    expect(reps.map((r) => r.side)).toEqual(['left', 'right']);
  });
});

// ---------------------------------------------------------------- en el suelo y sentado

describe('fondos en silla', () => {
  const o: Opts = { floor: true, y0: 1.0 };
  it('cinco bajando los codos a 90° cuentan cinco', () => {
    expect(play('dips', [{ s: 0.6 }, ...times(5, [{ y: 0.8, s: 1 }, { y: 1.0, s: 0.9 }, PAUSE])], o).reps.length).toBe(5);
  });
  it('bajar poco no cuenta (y avisa); quieto, nada', () => {
    const r = play('dips', [{ s: 0.6 }, { y: 0.92, s: 0.8 }, { y: 1.0, s: 0.8 }, PAUSE], o);
    expect(r.reps.length).toBe(0);
    expect(msgs(r.all, 'partial')).toEqual(['¡Baja hasta los 90° de codo!']);
    expect(play('dips', [{ s: 12 }], { ...o, wobble: 0.01 }).charges).toBe(0);
  });
});

describe('flexiones', () => {
  const o: Opts = { floor: true, y0: 0.5 };
  it('cinco bajando el pecho cuentan cinco', () => {
    expect(play('pushup', [{ s: 0.6 }, ...times(5, [{ y: 0.32, s: 0.9 }, { y: 0.5, s: 0.8 }, PAUSE])], o).reps.length).toBe(5);
  });
  it('bajar poco no cuenta (y avisa); quieto en la plancha, nada', () => {
    const r = play('pushup', [{ s: 0.6 }, { y: 0.42, s: 0.8 }, { y: 0.5, s: 0.8 }, PAUSE], o);
    expect(r.reps.length).toBe(0);
    expect(msgs(r.all, 'partial')).toEqual(['¡Más abajo!']);
    expect(play('pushup', [{ s: 12 }], { ...o, wobble: 0.01 }).charges).toBe(0);
  });
});

describe('plancha lateral', () => {
  const o: Opts = { floor: true, y0: 0.45 };
  it('aguantando con la cadera arriba, un disparo cada 3 s', () => {
    expect(play('splank', [{ s: 15.5 }], o).reps.length).toBe(5);
  });
  it('si cae la cadera, el tiempo vuelve a empezar (y avisa)', () => {
    const r = play('splank', [{ s: 2 }, { y: 0.32, s: 0.4 }, { s: 0.5 }, { y: 0.45, s: 0.4 }, { s: 2 }], o);
    expect(r.reps.length).toBe(0);
    expect(msgs(r.all, 'partial')).toEqual(['¡Sube la cadera!']);
  });
  it('en el descanso (fuera de la oleada) no cuenta', () => {
    expect(play('splank', [{ s: 10 }], { ...o, wave: false }).reps.length).toBe(0);
  });
});

describe('superman', () => {
  // tumbado boca abajo, la cabeza a 20 cm del suelo y los brazos estirados por delante
  const o: Opts = { floor: true, y0: 0.2, l0: [-0.2, 0.15, -0.6], r0: [0.2, 0.15, -0.6] };
  const UPHOLD: Seg[] = [{ y: 0.35, s: 0.6 }, { s: 2.3 }, { y: 0.2, s: 0.6 }, { s: 1.6 }];
  it('subir el tronco y aguantar 2 s, cinco veces, cuenta cinco', () => {
    expect(play('superman', [{ s: 1.5 }, ...times(5, UPHOLD)], o).reps.length).toBe(5);
  });
  it('sin aguantar arriba no cuenta (y avisa)', () => {
    const r = play('superman', [{ s: 1.5 }, { y: 0.35, s: 0.6 }, { s: 0.6 }, { y: 0.2, s: 0.6 }, { s: 1.5 }], o);
    expect(r.reps.length).toBe(0);
    expect(msgs(r.all, 'partial')).toEqual(['¡Aguanta 2 s arriba!']);
  });
  it('con las manos recogidas junto a la cabeza, el tiempo se para (y avisa)', () => {
    const r = play('superman', [{ s: 1.5 }, { y: 0.35, l: [-0.2, 0.3, 0.05], r: [0.2, 0.3, 0.05], s: 0.6 }, { s: 3 }], o);
    expect(r.reps.length).toBe(0);
    expect(msgs(r.all, 'say')).toContain('Estira los brazos');
  });
  it('quieto tumbado, nada', () => {
    expect(play('superman', [{ s: 12 }], { ...o, wobble: 0.01 }).charges).toBe(0);
  });
});

describe('plancha con un brazo', () => {
  const o: Opts = { floor: true, y0: 0.5 };
  const L_UP: Seg = { l: [-0.3, 0.45, -0.3], s: 0.5 }, L_DOWN: Seg = { l: [-0.2, 0.08, -0.1], s: 0.5 };
  const R_UP: Seg = { r: [0.3, 0.45, -0.3], s: 0.5 }, R_DOWN: Seg = { r: [0.2, 0.08, -0.1], s: 0.5 };
  it('levantar un brazo dispara a su lado; alternando, cinco cuentan cinco', () => {
    const { reps } = play('plank1', [{ s: 0.6 }, ...times(2, [L_UP, PAUSE, L_DOWN, PAUSE, R_UP, PAUSE, R_DOWN, PAUSE]), L_UP, PAUSE, L_DOWN], o);
    expect(reps.map((r) => r.side)).toEqual(['left', 'right', 'left', 'right', 'left']);
  });
  it('una flexión aguantada abajo carga el brazo siguiente (×2)', () => {
    const { reps } = play('plank1', [{ s: 0.6 }, { y: 0.34, s: 0.8 }, { s: 1.8 }, { y: 0.5, s: 0.8 }, R_UP, PAUSE], o);
    expect(reps).toMatchObject([{ side: 'right', pow: 2 }]);
  });
  it('quieto en la plancha, nada', () => {
    expect(play('plank1', [{ s: 12 }], { ...o, wobble: 0.01 }).reps.length).toBe(0);
  });
});

describe('inchworm', () => {
  // de pie en la salida (a 1,4 m de la línea del suelo); te doblas, caminas con las manos hasta la línea (la cabeza baja a
  // la plancha), vuelves y te pones de pie
  const o: Opts = { floor: true, y0: Y0, z0: 1.4, standY: Y0 };
  const OUT: Seg[] = [{ y: 0.9, s: 0.8 }, { y: 0.55, z: 0.1, s: 2.2 }], BACK: Seg[] = [{ y: 0.9, z: 1.4, s: 2.2 }, { y: Y0, s: 0.9 }, { s: 0.8 }];
  it('ida y vuelta, cinco veces, cuenta cinco', () => {
    expect(play('inchworm', times(5, [...OUT, ...BACK]), o).reps.length).toBe(5);
  });
  it('cada flexión en la plancha da más fuerza a la onda', () => {
    const { reps } = play('inchworm', [...OUT, { y: 0.4, s: 0.6 }, { y: 0.55, s: 0.6 }, { y: 0.4, s: 0.6 }, { y: 0.55, s: 0.6 }, ...BACK], o);
    expect(reps).toMatchObject([{ pow: 3 }]);
  });
  it('ponerse de pie sin llegar a la línea no cuenta (y avisa)', () => {
    const r = play('inchworm', [{ y: 0.9, s: 0.8 }, { y: 0.7, z: 0.7, s: 1.5 }, { y: Y0, z: 1.4, s: 1.5 }], o);
    expect(r.reps.length).toBe(0);
    expect(msgs(r.all, 'partial')).toEqual(['Camina con las manos hasta la línea del suelo']);
  });
});

// ---------------------------------------------------------------- que no se quede ninguno sin probar

describe('todos los que se pueden jugar', () => {
  // los de Toques y Barras se prueban en su modo (touch.test.ts y bars.test.ts)
  const ELSEWHERE = new Set(['slam', 'jump', 'pushup', 'row', 'pullup', 'hang']);
  const HERE = new Set([...STAND_EX, 'dips', 'pushup', 'splank', 'superman', 'plank1', 'inchworm']);
  it('tienen aquí (o en su modo) su prueba con movimientos de persona', () => {
    const all = new Set(Object.values(PLAY_MODE_EX).flat());
    const missing = [...all].filter((x) => !HERE.has(x) && !ELSEWHERE.has(x));
    expect(missing).toEqual([]);
  });
});
