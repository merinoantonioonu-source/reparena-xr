// Los ejercicios de pie (src/exercise/standing.ts): cada uno con un gesto limpio, a 72 imágenes por segundo, como en las
// gafas. La cabeza y las muñecas (respecto a los ojos) se mueven por tramos; lo que importa es qué pasa y en qué orden.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { StandingDetector, standDefaults, type StandCfg, type StandEvent } from '../../src/exercise/standing.js';

const FPS = 72, DT = 1 / FPS, Y0 = 1.6;

/** Un tramo: a dónde va la cabeza (altura), cada muñeca (respecto a los ojos: x, y, z; null = no se ve) y en cuántos
 * segundos; ang: el giro de las muñecas (antebrazos). */
interface Seg {
  y?: number;
  l?: [number, number, number] | null;
  r?: [number, number, number] | null;
  ang?: number;
  s: number;
}

function play(ex: string, segs: Seg[], over: Partial<StandCfg> = {}) {
  const c = { ...standDefaults(ex), ...over };
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const head = { p: new Vector3(0, Y0, 0), speed: 0 };
  const det = new StandingDetector();
  det.reset(Y0);
  const I = { hands, head, fwd: new Vector3(0, 0, -1), play: true };
  const pos = { left: new Vector3(-0.15, -0.78, -0.15), right: new Vector3(0.15, -0.78, -0.15) }, from = { left: new Vector3(), right: new Vector3() };
  let y = Y0, ang = 0, t = 0;
  const out: StandEvent[] = [], all: (StandEvent & { t: number })[] = [];
  for (const g of segs) {
    const n = Math.max(1, Math.round(g.s * FPS)), y1 = g.y ?? y, a0 = ang, a1 = g.ang ?? ang;
    from.left.copy(pos.left);
    from.right.copy(pos.right);
    for (let i = 1; i <= n; i++) {
      const k = i / n, e = k * k * (3 - 2 * k), prev = head.p.y;
      head.p.y = y + (y1 - y) * e;
      head.speed = Math.abs(head.p.y - prev) / DT;
      ang = a0 + (a1 - a0) * e;
      for (const s of ['left', 'right'] as Side[]) {
        const to = s === 'left' ? g.l : g.r, h = hands[s];
        h.ok = to !== null;
        if (to) pos[s].copy(from[s]).lerp(new Vector3(...to), e);
        h.wrist.copy(head.p).add(pos[s]);
        // el nudillo del corazón, girado alrededor de la línea entre las muñecas (cada mano hacia un lado)
        h.J[10].ok = true;
        h.J[10].p.copy(h.wrist).add(new Vector3(0, 0, -0.09).applyAxisAngle(new Vector3(1, 0, 0), (s === 'left' ? -0.5 : 0.5) * ang));
      }
      t += DT;
      out.length = 0;
      det.update(t, DT, I, c, out);
      for (const ev of out) all.push({ ...ev, t: +t.toFixed(2) });
    }
    y = y1;
  }
  return { all, types: all.map((e) => e.type), reps: all.filter((e) => e.type === 'rep') as (StandEvent & { type: 'rep' })[] };
}

const DOWN: Seg = { y: Y0 - 0.32, s: 1 }, UP: Seg = { y: Y0, s: 0.8 };

describe('con la cabeza', () => {
  it('sentadilla: carga, ×2 aguantando abajo y, al subir, la repetición', () => {
    const { types, reps } = play('squat', [DOWN, { s: 1.8 }, UP]);
    expect(types).toEqual(['charge', 'power', 'rep']);
    expect(reps[0]).toMatchObject({ perfect: true, pow: 2, side: null });
  });
  it('zancada: cada una, la otra pierna delante', () => {
    const { all } = play('lunge', [DOWN, UP, DOWN, UP]);
    expect(all.filter((e) => e.type === 'say').map((e) => (e as { msg: string }).msg)).toEqual(['Ahora con la pierna izquierda delante', 'Ahora con la pierna derecha delante']);
  });
  it('peso muerto: a medias, «¡Baja más el peso!»', () => {
    const { all } = play('dlrow', [{ y: Y0 - 0.18, s: 0.8 }, UP]);
    expect(all).toMatchObject([{ type: 'partial', msg: '¡Baja más el peso!' }]);
  });
});

describe('en dos tiempos', () => {
  it('sentadilla con press: dispara al subir las dos manos por encima de la cabeza', () => {
    const { types } = play('thruster', [DOWN, UP, { l: [-0.15, 0.3, -0.1], r: [0.15, 0.3, -0.1], s: 0.5 }]);
    expect(types).toEqual(['charge', 'rep']);
  });
  it('sentadilla con press: sin subirlas en 2,5 s, el aviso', () => {
    const { all } = play('thruster', [DOWN, UP, { s: 3 }]);
    expect(all.map((e) => e.type)).toEqual(['charge', 'partial']);
    expect(all[1]).toMatchObject({ msg: '¡Sube las pesas por encima de la cabeza!' });
  });
  it('sentadilla con elevación: brazos al frente, a la altura de los hombros', () => {
    expect(play('frontsq', [DOWN, UP, { l: [-0.15, -0.25, -0.6], r: [0.15, -0.25, -0.6], s: 0.5 }]).types).toEqual(['charge', 'rep']);
  });
  it('swing: con una mano a la vista basta', () => {
    const { types } = play('swing', [{ y: Y0 - 0.2, s: 0.6 }, { y: Y0, l: null, r: [0.05, -0.35, -0.5], s: 0.6 }]);
    expect(types).toEqual(['charge', 'rep']);
  });
  it('sentadilla con salto: el salto dispara; subir despacio, no', () => {
    expect(play('jsquat', [DOWN, { y: Y0 + 0.12, s: 0.25 }, { y: Y0, s: 0.3 }]).types).toEqual(['charge', 'rep']);
    expect(play('jsquat', [DOWN, { y: Y0, s: 1 }, { y: Y0 + 0.1, s: 2 }, { s: 1 }]).types).toEqual(['charge', 'partial']);
  });
});

describe('con los brazos', () => {
  it('curl: arriba carga (y el chasquido), aguantando sube a ×2 y al bajar dispara ese brazo', () => {
    const { all, reps } = play('curl', [{ s: 0.5 }, { r: [0.15, -0.45, -0.25], s: 0.9 }, { s: 1.8 }, { r: [0.15, -0.78, -0.15], s: 0.8 }]);
    expect(all.map((e) => e.type)).toEqual(['charge', 'top', 'power', 'rep']);
    expect(all[1]).toMatchObject({ side: 'right' });
    expect(reps[0]).toMatchObject({ side: 'right', pow: 2 });
  });
  it('curl: a medias, «Sube hasta el hombro»', () => {
    const { all } = play('curl', [{ s: 0.5 }, { l: [-0.15, -0.6, -0.2], s: 0.6 }, { l: [-0.15, -0.78, -0.15], s: 0.6 }]);
    expect(all).toMatchObject([{ type: 'partial', msg: 'Sube hasta el hombro' }]);
  });
  it('curl: la mano se pierde subiendo, ya pasada la mitad: cuenta', () => {
    const { types } = play('curl', [{ s: 0.5 }, { l: [-0.15, -0.6, -0.2], s: 0.5 }, { l: null, s: 0.5 }]);
    expect(types).toEqual(['charge', 'rep']);
  });
  it('curl con barra: las dos manos juntas, como una sola pesa', () => {
    const { types, reps } = play('curl2', [{ l: [-0.04, -0.78, -0.2], r: [0.04, -0.78, -0.2], s: 0.5 }, { l: [-0.04, -0.45, -0.25], r: [0.04, -0.45, -0.25], s: 0.9 }, { l: [-0.04, -0.78, -0.2], r: [0.04, -0.78, -0.2], s: 0.8 }]);
    expect(types).toEqual(['charge', 'top', 'rep']);
    expect(reps[0].side).toBe(null);
  });
  it('curl con barra: separadas (no puede ser), vale la que se mueve', () => {
    // la izquierda se queda quieta abajo, donde la perdieron las gafas; la derecha hace el curl
    const { types } = play('curl2', [{ l: [-0.4, -0.78, -0.2], r: [0.04, -0.78, -0.2], s: 0.5 }, { r: [0.04, -0.45, -0.25], s: 0.9 }, { r: [0.04, -0.78, -0.2], s: 0.8 }]);
    expect(types).toEqual(['charge', 'top', 'rep']);
  });
  it('elevación frontal: al frente hasta los hombros; arriba, aguantar carga; al bajar, dispara', () => {
    const lo: Seg = { l: [-0.04, -0.85, -0.2], r: [0.04, -0.85, -0.2], s: 0.5 }, hi: Seg = { l: [-0.04, -0.28, -0.6], r: [0.04, -0.28, -0.6], s: 1 };
    const { types, reps } = play('fraise', [lo, hi, { s: 1.7 }, { ...lo, s: 0.8 }]);
    // (como en RepArena, tras aguantar arriba el fondo del recorrido ha subido un poco y, al bajar, ya carga la siguiente)
    expect(types.slice(0, 4)).toEqual(['charge', 'top', 'power', 'rep']);
    expect(reps[0].pow).toBe(2);
  });
  it('elevación frontal: un curl (pegado a la cara) no vale', () => {
    const { all } = play('fraise', [{ l: [-0.04, -0.85, -0.2], r: [0.04, -0.85, -0.2], s: 0.5 }, { l: [-0.04, -0.28, -0.15], r: [0.04, -0.28, -0.15], s: 1 }]);
    expect(all.map((e) => e.type)).toEqual(['charge', 'partial']);
  });
});

describe('antebrazos', () => {
  it('un giro carga y el siguiente, al revés, dispara', () => {
    const hold: Seg = { l: [-0.3, -0.4, -0.35], r: [0.3, -0.4, -0.35], s: 0.3 };
    const { types, all } = play('twist', [hold, { ang: 2.6, s: 0.8 }, { ang: -2.6, s: 1.2 }]);
    expect(types).toEqual(['charge', 'say', 'rep']);
    expect(all[1]).toMatchObject({ color: '#3cf0c6' });
  });
  it('sin ver las dos manos, el aviso (en el suelo: naranja)', () => {
    const { all } = play('twist', [{ l: null, s: 1.5 }]);
    expect(all).toMatchObject([{ type: 'say', msg: 'Mira la barra: no veo tus dos manos', color: '#ff8a3d' }]);
  });
});
