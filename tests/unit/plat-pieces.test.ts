// Las piezas de la Travesía de plataformas (src/modes/trek/plat/pieces.ts): que cada modelo que usa exista en su .glb,
// que el suelo de muelle cubra el sendero sin rendijas ni solapes y sin tapar los huecos (con la rejilla fija), que la viga
// baja deje su borde de abajo donde obliga a agacharse, que el barril deje libre el otro lado y que el paisaje sea siempre
// el mismo y no pise la pasarela.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD_TOP } from '../../src/modes/trek/env.js';
import { TREK_CH } from '../../src/modes/trek/path.js';
import { DOCK_LEN, DOCK_W, GROUND_Y, KIT_MODELS, decoPuts, floorPuts, piecePuts, type Kit, type Put } from '../../src/modes/trek/plat/pieces.js';
import { piece, type PieceKind } from '../../src/modes/trek/plat/types.js';

interface Gltf {
  nodes: Array<{ name?: string; mesh?: number; children?: number[]; rotation?: number[]; scale?: number[] }>;
  scenes: Array<{ nodes: number[] }>;
  meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
  accessors: Array<{ min?: number[]; max?: number[]; count: number; bufferView: number; byteOffset?: number }>;
  bufferViews: Array<{ byteOffset?: number }>;
}
const FILE: Record<Kit, string> = { island: 'island.glb', nature: 'nature.glb' };
const raw = (kit: Kit): Buffer => fs.readFileSync(path.resolve('public/models', FILE[kit]));
const gltf = (kit: Kit): Gltf => JSON.parse(raw(kit).subarray(20, 20 + raw(kit).readUInt32LE(12)).toString('utf8'));
const top = (kit: Kit): Map<string, number> => {
  const g = gltf(kit);
  return new Map(g.scenes[0].nodes.map((i) => [g.nodes[i].name ?? '', i]));
};

type Box = { min: number[]; max: number[] };
/** La caja de un nodo de primer nivel, en metros y con +y arriba: la de sus mallas, con la escala y el giro del nodo (los del bosque
 * traen ×100 y −90° en x; los de la isla, ninguno). */
function boxOf(kit: Kit, name: string): Box {
  const g = gltf(kit), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const walk = (i: number): void => {
    const n = g.nodes[i];
    if (n.mesh !== undefined)
      for (const p of g.meshes[n.mesh].primitives) {
        const a = g.accessors[p.attributes.POSITION];
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], a.min![k]);
          max[k] = Math.max(max[k], a.max![k]);
        }
      }
    for (const c of n.children ?? []) walk(c);
  };
  const root = top(kit).get(name)!, nd = g.nodes[root];
  walk(root);
  if (!nd.scale && !nd.rotation) return { min, max };
  const [qx, qy, qz, qw] = nd.rotation ?? [0, 0, 0, 1], [kx, ky, kz] = nd.scale ?? [1, 1, 1], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const v = [(i & 1 ? max[0] : min[0]) * kx, (i & 2 ? max[1] : min[1]) * ky, (i & 4 ? max[2] : min[2]) * kz];
    // v' = v + 2·q.xyz × (q.xyz × v + w·v)
    const t = [qy * v[2] - qz * v[1] + qw * v[0], qz * v[0] - qx * v[2] + qw * v[1], qx * v[1] - qy * v[0] + qw * v[2]];
    const w = [v[0] + 2 * (qy * t[2] - qz * t[1]), v[1] + 2 * (qz * t[0] - qx * t[2]), v[2] + 2 * (qx * t[1] - qy * t[0])];
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], w[k]);
      hi[k] = Math.max(hi[k], w[k]);
    }
  }
  return { min: lo, max: hi };
}

/** La caja de un modelo ya colocado, en el sendero: [u, y, s]. Giro en el orden de three (XYZ) tras la escala; s = −z. */
function placed(p: Put): Box {
  const b = boxOf(p.kit, p.n), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const [cx, sx_] = [Math.cos(p.rx), Math.sin(p.rx)], [cy, sy_] = [Math.cos(p.ry), Math.sin(p.ry)], [cz, sz_] = [Math.cos(p.rz), Math.sin(p.rz)];
  for (let i = 0; i < 8; i++) {
    let x = (i & 1 ? b.max[0] : b.min[0]) * p.sx, y = (i & 2 ? b.max[1] : b.min[1]) * p.sy, z = (i & 4 ? b.max[2] : b.min[2]) * p.sz;
    [x, y] = [x * cz - y * sz_, x * sz_ + y * cz]; // rz
    [x, z] = [x * cy + z * sy_, -x * sy_ + z * cy]; // ry
    [y, z] = [y * cx - z * sx_, y * sx_ + z * cx]; // rx
    const v = [x + p.u, y + p.y, -(z - p.ds)]; // (s = −z; la posición va en z = −ds)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
  }
  return { min, max };
}

const REF = 1.6;
const mk = (k: PieceKind, at: number, o: Parameters<typeof piece>[5] = {}, id = 1) => piece(id, k, at, 0, o);
const decks = (l: Put[]): Array<[number, number]> => l.filter((p) => p.n === 'Dock').map((p) => [placedDeck(p)[0], placedDeck(p)[1]] as [number, number]).sort((a, b) => a[0] - b[0]);
/** Dónde acaban las TABLAS de un tramo (a lo largo): la caja entera trae también los postes, que sobresalen. */
const placedDeck = (p: Put): [number, number] => {
  const d = deck(), c = p.ds - ((d.z0 + d.z1) / 2) * p.sz;
  return [c - (DOCK_LEN / 2) * p.sz, c + (DOCK_LEN / 2) * p.sz];
};

/** Las tablas del `Dock` (a escala 1), leídas de los vértices: sin los postes del lado, que sobresalen de la caja. */
let deckMemo: { x0: number; x1: number; z0: number; z1: number; top: number } | null = null;
function deck() {
  if (deckMemo) return deckMemo;
  const g = gltf('island'), b = raw('island'), bin = 20 + b.readUInt32LE(12) + 8;
  const node = g.nodes[g.nodes[top('island').get('Dock')!].children![0]];
  const a = g.accessors[g.meshes[node.mesh!].primitives[0].attributes.POSITION], off = bin + (g.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
  const d = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: -Infinity };
  for (let i = 0; i < a.count; i++) {
    const x = b.readFloatLE(off + i * 12), y = b.readFloatLE(off + i * 12 + 4), z = b.readFloatLE(off + i * 12 + 8);
    if (x < -0.99 || y < 0.1 || y > 0.55) continue; // (solo las tablas y sus travesaños: sin los postes del lado)
    d.x0 = Math.min(d.x0, x), d.x1 = Math.max(d.x1, x), d.z0 = Math.min(d.z0, z), d.z1 = Math.max(d.z1, z), d.top = Math.max(d.top, y);
  }
  return (deckMemo = d);
}

describe('los modelos', () => {
  it('cada nombre de KIT_MODELS existe como nodo de primer nivel en su .glb', () => {
    for (const kit of ['island', 'nature'] as Kit[]) {
      const names = top(kit);
      for (const n of KIT_MODELS[kit]) expect(names.has(n), `${kit}: ${n}`).toBe(true);
    }
  });
  it('las tablas del muelle miden lo que dicen DOCK_LEN y DOCK_W (leído de los vértices del .glb)', () => {
    const d = deck();
    expect(d.z1 - d.z0).toBeCloseTo(DOCK_LEN, 4);
    expect(d.x1 - d.x0).toBeGreaterThan(1.97);
    expect(d.x1 - d.x0).toBeLessThan(2);
    expect(d.top).toBeGreaterThan(0.48);
    expect(d.top).toBeLessThan(0.49);
    expect(DOCK_W).toBeGreaterThanOrEqual(1.8);
    expect(DOCK_W).toBeLessThanOrEqual(2);
  });
});

/** Todo lo que sale de las tres funciones, para repasarlo junto. */
function everything(): Put[] {
  const out: Put[] = [];
  floorPuts(-10, 60, [[12, 15], [30.5, 33]], out);
  const kinds: PieceKind[] = ['floor', 'gap', 'low', 'side', 'log', 'step', 'drop', 'crawl', 'burpee', 'foe', 'gems', 'chest'];
  kinds.forEach((k, i) => piecePuts(mk(k, 20 * i, { len: 3, side: k === 'side' ? 1 : 0, h: 0.4 }, i), REF, out));
  piecePuts(mk('side', 5, { side: -1 }, 2), REF, out);
  for (let c = -2; c < 6; c++) decoPuts(c, out);
  return out;
}

describe('lo que sale', () => {
  it('solo usa nombres de KIT_MODELS y números finitos', () => {
    const l = everything();
    expect(l.length).toBeGreaterThan(50);
    for (const p of l) {
      expect(KIT_MODELS[p.kit], p.n).toContain(p.n);
      for (const v of [p.ds, p.u, p.y, p.ry, p.rx, p.rz, p.sx, p.sy, p.sz]) expect(Number.isFinite(v)).toBe(true);
      expect(p.sx).toBeGreaterThan(0);
      expect(p.sy).toBeGreaterThan(0);
      expect(p.sz).toBeGreaterThan(0);
    }
  });
  it('añade a la lista sin vaciarla y la devuelve', () => {
    const out: Put[] = [];
    expect(floorPuts(0, 10, [], out)).toBe(out);
    const n = out.length;
    expect(piecePuts(mk('chest', 0), REF, out)).toBe(out);
    expect(decoPuts(0, out)).toBe(out);
    expect(out.length).toBeGreaterThan(n + 1);
  });
  it('las clases que aún no tienen modelo no ponen nada', () => {
    for (const k of ['floor', 'step', 'drop', 'crawl', 'burpee', 'foe', 'gems'] as PieceKind[]) expect(piecePuts(mk(k, 0, { len: 3 }), REF, []), k).toEqual([]);
  });
});

describe('el suelo', () => {
  const HOLES: Array<[number, number]> = [[12, 15], [30.5, 33], [33, 36]];
  it('cubre de s0 a s1 sin rendijas ni solapes y sin tapar los huecos (y se acerca justo a su borde)', () => {
    // (los huecos pegados cuentan como uno)
    const H: Array<[number, number]> = [];
    for (const h of HOLES) H.length && H[H.length - 1][1] === h[0] ? (H[H.length - 1][1] = h[1]) : H.push([h[0], h[1]]);
    for (const [s0, s1] of [[-10, 60], [0, 41.3], [3.7, 3.9], [14, 31], [11.9, 36.2], [20, 21]] as Array<[number, number]>) {
      const d = decks(floorPuts(s0, s1, HOLES, []));
      expect(d.length).toBeGreaterThan(0);
      for (let i = 1; i < d.length; i++) {
        const gap = d[i][0] - d[i - 1][1];
        if (gap > 1e-6) expect(H.some((h) => Math.abs(h[0] - d[i - 1][1]) < 1e-6 && Math.abs(h[1] - d[i][0]) < 1e-6), `rendija en ${d[i - 1][1]}…${d[i][0]}`).toBe(true);
        else expect(gap, 'solape').toBeGreaterThan(-1e-6);
      }
      for (const [a, b] of d) for (const h of H) expect(a >= h[1] - 1e-6 || b <= h[0] + 1e-6, `tapa el hueco ${h} con ${a}…${b}`).toBe(true);
      // lo que no es hueco de [s0, s1) está cubierto
      for (let s = s0 + 0.013; s < s1; s += 0.1) {
        if (H.some((h) => s >= h[0] && s < h[1])) continue;
        expect(d.some(([a, b]) => s >= a - 1e-9 && s <= b + 1e-9), `sin suelo en ${s}`).toBe(true);
      }
      // los bordes de los huecos que caen dentro tienen su tramo pegado, por un lado y por el otro
      for (const h of H) {
        if (h[0] > s0 && h[0] < s1) expect(d.some(([, b]) => Math.abs(b - h[0]) < 1e-6), `junto a ${h[0]}`).toBe(true);
        if (h[1] > s0 && h[1] < s1) expect(d.some(([a]) => Math.abs(a - h[1]) < 1e-6), `junto a ${h[1]}`).toBe(true);
      }
    }
  });
  it('la cara de arriba de las tablas está en y = 0, los postes llegan a GROUND_Y y el ancho es DOCK_W', () => {
    for (const p of floorPuts(0, 20, [], [])) {
      const b = placed(p);
      expect(b.min[1]).toBeCloseTo(GROUND_Y, 5);
      expect(p.y + deck().top * p.sy).toBeCloseTo(0, 5); // (la cara de arriba de las tablas)
      expect(p.sx * (deck().x1 - deck().x0)).toBeCloseTo(DOCK_W, 3);
      expect(p.u).toBeCloseTo(0, 1);
    }
  });
  it('un tramo de muelle sale igual pidas el intervalo que pidas (rejilla fija)', () => {
    const key = (p: Put): string => JSON.stringify(p);
    const a = new Set(floorPuts(0, 50, [], []).map(key)), b = floorPuts(7.3, 33.1, [], []);
    expect(b.length).toBeGreaterThan(8);
    for (const p of b) expect(a.has(key(p)), `${p.ds}`).toBe(true);
    // con huecos, los tramos que no los tocan también
    const c = new Set(floorPuts(0, 50, [[20, 23]], []).map(key));
    for (const p of floorPuts(9, 41, [[20, 23]], [])) {
      const [x0, x1] = placedDeck(p);
      if (x1 <= 20 - 2 * DOCK_LEN || x0 >= 23 + 2 * DOCK_LEN) expect(c.has(key(p)), `${p.ds}`).toBe(true);
    }
    // sin huecos, todos con la longitud de la rejilla (escala 1 a lo largo)
    for (const p of b) expect(p.sz).toBeCloseTo(1, 9);
  });
  it('un trozo corto entre huecos se llena estirando o encogiendo un tramo (nunca una tabla enana junto a otra)', () => {
    const d = decks(floorPuts(10, 20, [[10.5, 12], [12.4, 19.2]], []));
    expect(d.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)])).toContainEqual([12, 12.4]);
    for (const [a, b] of decks(floorPuts(0, 30, [[7.2, 9]], []))) expect((b - a) / DOCK_LEN).toBeGreaterThan(0.45);
  });
});

describe('las piezas', () => {
  it('la viga baja deja su borde de abajo en ref + HEAD_TOP − h, de lado a lado, entre dos postes de pie', () => {
    for (const [ref, h] of [[1.6, 0.35], [1.5, 0.5], [1.75, 0.2]]) {
      const l = piecePuts(mk('low', 40, { h }), ref, []);
      expect(l.length).toBe(3);
      const beams = l.filter((p) => p.rz !== 0), posts = l.filter((p) => p.rz === 0);
      expect(beams.length).toBe(1);
      expect(posts.length).toBe(2);
      const b = placed(beams[0]);
      expect(b.min[1]).toBeCloseTo(ref + HEAD_TOP - h, 6);
      expect(b.max[0] - b.min[0]).toBeGreaterThan(2.2);
      expect(b.max[0] - b.min[0]).toBeLessThan(2.6);
      expect(b.min[0] + b.max[0]).toBeCloseTo(0, 6); // (centrada en el sendero)
      for (const q of posts) {
        const c = placed(q);
        expect(c.min[1]).toBeCloseTo(GROUND_Y, 5); // (desde el suelo)
        expect(c.max[1]).toBeGreaterThan(b.max[1]); // (hasta pasar la viga)
        expect(Math.abs((c.min[0] + c.max[0]) / 2)).toBeGreaterThan(0.95);
        expect(Math.abs((c.min[0] + c.max[0]) / 2)).toBeLessThan(1.25);
      }
    }
  });
  it('el tronco queda apoyado en las tablas, de 0,2 a 0,25 m de grueso, de lado a lado', () => {
    const l = piecePuts(mk('log', 10), REF, []);
    expect(l.length).toBe(1);
    const b = placed(l[0]);
    expect(b.min[1]).toBeCloseTo(0, 6);
    expect(b.max[1]).toBeGreaterThan(0.2);
    expect(b.max[1]).toBeLessThan(0.25);
    expect(b.max[2] - b.min[2]).toBeLessThan(0.25);
    expect(b.max[0] - b.min[0]).toBeGreaterThan(DOCK_W);
    expect(b.min[0] + b.max[0]).toBeCloseTo(0, 6);
  });
  it('el barril deja libre el otro lado: nada a más de 0,15 m del centro hacia él; el suyo, a ~0,1 m del centro', () => {
    for (const side of [-1, 1] as const) for (const id of [1, 2, 3, 4]) {
      const l = piecePuts(mk('side', 0, { side }, id), REF, []);
      expect(l.length).toBeGreaterThanOrEqual(1);
      expect(l.length).toBeLessThanOrEqual(2);
      for (const p of l) {
        expect(p.n).toBe('Barrel');
        const b = placed(p), inner = side === 1 ? b.min[0] : -b.max[0], outer = side === 1 ? b.max[0] : -b.min[0];
        expect(inner).toBeGreaterThan(-0.15);
        expect(inner).toBeLessThan(0.2);
        expect(inner).toBeGreaterThan(0.05);
        expect(outer).toBeLessThan(DOCK_W / 2 + 0.6);
        expect(b.min[1]).toBeCloseTo(0, 2);
      }
    }
    expect(piecePuts(mk('side', 0, { side: 0 }), REF, [])).toEqual([]);
  });
  it('el hueco no se dibuja: solo postes cortos en cada borde y a cada lado, y un muelle roto bajo el borde cercano', () => {
    const l = piecePuts(mk('gap', 30, { len: 3.5 }), REF, []);
    expect(l.some((p) => p.n === 'Dock')).toBe(false);
    const poles = l.filter((p) => p.n === 'Dock_Pole');
    expect(poles.length).toBe(4);
    for (const p of poles) {
      const b = placed(p);
      expect(b.max[1] - b.min[1]).toBeLessThan(1.2);
      expect(b.max[1]).toBeGreaterThan(0.4);
      expect(p.ds < 0 || p.ds > 3.5).toBe(true); // (sobre las tablas, no sobre el hueco)
    }
    expect(poles.filter((p) => p.u < 0).length).toBe(2);
    const broken = l.filter((p) => p.n === 'Dock_Broken');
    expect(broken.length).toBe(1);
    const b = placed(broken[0]);
    expect(b.max[1]).toBeLessThan(0.2); // (cuelga bajo las tablas: solo asoman las cuerdas del borde)
    expect(b.min[1]).toBeGreaterThan(GROUND_Y - 0.3);
    expect(b.min[2]).toBeGreaterThan(-1.2); // (junto al borde cercano: sus postes de debajo asoman hacia ti, bajo las tablas)
    expect(b.max[2]).toBeLessThan(1.2);
  });
  it('el cofre, en u = 0 y ds = 0,6, apoyado en las tablas y de cara al jugador', () => {
    const l = piecePuts(mk('chest', 100), REF, []);
    expect(l.length).toBe(1);
    expect(l[0].n).toBe('Chest_Closed');
    expect(l[0].ds).toBeCloseTo(0.6, 9);
    expect(l[0].u).toBe(0);
    expect(l[0].ry % (2 * Math.PI)).toBeCloseTo(0, 9); // (su frente mira a +z, hacia el jugador)
    expect(placed(l[0]).min[1]).toBeCloseTo(0, 6);
  });
});

describe('el paisaje', () => {
  const L = (c: number): Put[] => decoPuts(c, []);
  it('es determinista: el mismo trozo sale igual, y trozos distintos, distintos', () => {
    expect(L(3)).toEqual(L(3));
    expect(L(3)).not.toEqual(L(4));
    expect(L(-1)).toEqual(L(-1));
  });
  it('lleva lo que toca, dentro de su trozo y fuera de la pasarela', () => {
    for (let c = -3; c < 12; c++) {
      const l = L(c), trees = l.filter((p) => /Tree|Pine/.test(p.n)), bushes = l.filter((p) => p.n.startsWith('Bush')), rocks = l.filter((p) => p.n.startsWith('Rock')), small = l.length - trees.length - bushes.length - rocks.length;
      expect(trees.length, `árboles ${c}`).toBeGreaterThanOrEqual(5);
      expect(trees.length).toBeLessThanOrEqual(7);
      expect(bushes.length).toBeGreaterThanOrEqual(3);
      expect(bushes.length).toBeLessThanOrEqual(4);
      expect(rocks.length).toBeGreaterThanOrEqual(2);
      expect(rocks.length).toBeLessThanOrEqual(3);
      expect(small).toBeGreaterThanOrEqual(6);
      expect(small).toBeLessThanOrEqual(10);
      for (const p of l) {
        expect(p.kit).toBe('nature');
        expect(p.ds).toBeGreaterThanOrEqual(c * TREK_CH);
        expect(p.ds).toBeLessThan((c + 1) * TREK_CH);
        expect(Math.abs(p.u)).toBeGreaterThanOrEqual(2.5);
        expect(Math.abs(p.u)).toBeLessThanOrEqual(14);
        expect(p.y).toBe(GROUND_Y);
        // sin árboles de 30 m ni hierbas de gigante: la altura de su caja, a su escala
        const h = placed(p).max[1] - GROUND_Y;
        expect(h, p.n).toBeLessThan(14);
      }
    }
  });
  it('nada a menos de 2,5 m del centro (el pie de cada modelo, nunca sobre la pasarela)', () => {
    for (let c = -2; c < 12; c++) for (const p of L(c)) expect(Math.abs(p.u), p.n).toBeGreaterThanOrEqual(2.5);
  });
});
