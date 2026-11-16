// Las piezas de la Travesía de plataformas (src/modes/trek/plat/pieces.ts): que cada modelo que usa exista en su .glb,
// que el suelo de muelle cubra el sendero sin rendijas ni solapes y sin tapar los huecos (con la rejilla fija), que la viga
// baja deje su borde de abajo donde obliga a agacharse, que el barril deje libre el otro lado, que la plataforma sea una repisa
// de roca con las tablas encima a su altura, que el túnel sea de roca de verdad (techo a CRAWL_ROOF, paredes fuera de la
// pasarela y sin cielo visto desde dentro), que la fruta flote a la altura de la cabeza y que el paisaje sea siempre el mismo
// y no pise la pasarela.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD_TOP } from '../../src/modes/trek/env.js';
import { TREK_CH } from '../../src/modes/trek/path.js';
import { BufferAttribute, BufferGeometry, DoubleSide, Euler, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { CRAWL_ROOF, DOCK_LEN, DOCK_W, FRUIT_SIZE, FRUIT_SIZE_SPECIAL, GROUND_Y, KIT_MODELS, DECO_N, decoPuts, floorPuts, piecePuts, type Kit, type Put } from '../../src/modes/trek/plat/pieces.js';
import { FRUIT_U, piece, type PieceKind } from '../../src/modes/trek/plat/types.js';

interface Gltf {
  nodes: Array<{ name?: string; mesh?: number; children?: number[]; rotation?: number[]; scale?: number[]; translation?: number[] }>;
  scenes: Array<{ nodes: number[] }>;
  meshes: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices?: number }> }>;
  accessors: Array<{ min?: number[]; max?: number[]; count: number; bufferView: number; byteOffset?: number; componentType: number }>;
  bufferViews: Array<{ byteOffset?: number; byteStride?: number }>;
}
const FILE: Record<Kit, string> = { island: 'island.glb', nature: 'nature.glb', food: 'frutas.glb' };
const rawMemo = new Map<Kit, Buffer>();
const raw = (kit: Kit): Buffer => rawMemo.get(kit) ?? (rawMemo.set(kit, fs.readFileSync(path.resolve('public/models', FILE[kit]))), rawMemo.get(kit)!);
const gltf = (kit: Kit): Gltf => JSON.parse(raw(kit).subarray(20, 20 + raw(kit).readUInt32LE(12)).toString('utf8'));
const top = (kit: Kit): Map<string, number> => {
  const g = gltf(kit);
  return new Map(g.scenes[0].nodes.map((i) => [g.nodes[i].name ?? '', i]));
};

/** Los triángulos de un nodo de primer nivel, en metros y con +y arriba (con la escala, el giro y la posición de todos sus
 * nodos): [x, y, z] × 3 por triángulo, seguidos. */
const trisMemo = new Map<string, Float32Array>();
function tris(kit: Kit, name: string): Float32Array {
  const key = `${kit}:${name}`, hit = trisMemo.get(key);
  if (hit) return hit;
  const g = gltf(kit), b = raw(kit), bin = 20 + b.readUInt32LE(12) + 8, out: number[] = [];
  const walk = (i: number, parent: Matrix4): void => {
    const n = g.nodes[i], m = new Matrix4().compose(new Vector3(...(n.translation ?? [0, 0, 0])), new Quaternion(...((n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])), new Vector3(...(n.scale ?? [1, 1, 1])));
    const w = parent.clone().multiply(m);
    if (n.mesh !== undefined)
      for (const pr of g.meshes[n.mesh].primitives) {
        const a = g.accessors[pr.attributes.POSITION], bv = g.bufferViews[a.bufferView], off = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), st = bv.byteStride ?? 12;
        const P = (k: number): number[] => new Vector3(b.readFloatLE(off + k * st), b.readFloatLE(off + k * st + 4), b.readFloatLE(off + k * st + 8)).applyMatrix4(w).toArray();
        const ia = pr.indices === undefined ? undefined : g.accessors[pr.indices], ibv = ia && g.bufferViews[ia.bufferView], ioff = ia && ibv ? bin + (ibv.byteOffset ?? 0) + (ia.byteOffset ?? 0) : 0;
        const idx = (k: number): number => (!ia ? k : ia.componentType === 5125 ? b.readUInt32LE(ioff + k * 4) : b.readUInt16LE(ioff + k * 2));
        for (let k = 0; k < (ia ? ia.count : a.count); k++) out.push(...P(idx(k)));
      }
    for (const c of n.children ?? []) walk(c, w);
  };
  walk(top(kit).get(name)!, new Matrix4());
  const r = new Float32Array(out);
  trisMemo.set(key, r);
  return r;
}

type Box = { min: number[]; max: number[] };
/** La caja de un nodo de primer nivel, en metros y con +y arriba: la de sus vértices, con las transformaciones de sus nodos. */
function boxOf(kit: Kit, name: string): Box {
  const v = tris(kit, name), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i++) {
    min[i % 3] = Math.min(min[i % 3], v[i]);
    max[i % 3] = Math.max(max[i % 3], v[i]);
  }
  return { min, max };
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
let deckMemo: { x0: number; x1: number; z0: number; z1: number; top: number; bot: number } | null = null;
function deck() {
  if (deckMemo) return deckMemo;
  const g = gltf('island'), b = raw('island'), bin = 20 + b.readUInt32LE(12) + 8;
  const node = g.nodes[g.nodes[top('island').get('Dock')!].children![0]];
  const a = g.accessors[g.meshes[node.mesh!].primitives[0].attributes.POSITION], off = bin + (g.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
  const d = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: -Infinity, bot: Infinity };
  for (let i = 0; i < a.count; i++) {
    const x = b.readFloatLE(off + i * 12), y = b.readFloatLE(off + i * 12 + 4), z = b.readFloatLE(off + i * 12 + 8);
    if (x < -0.99 || y < 0.1 || y > 0.55) continue; // (solo las tablas y sus travesaños: sin los postes del lado)
    d.x0 = Math.min(d.x0, x), d.x1 = Math.max(d.x1, x), d.z0 = Math.min(d.z0, z), d.z1 = Math.max(d.z1, z), d.top = Math.max(d.top, y), d.bot = Math.min(d.bot, y);
  }
  return (deckMemo = d);
}

describe('los modelos', () => {
  it('cada nombre de KIT_MODELS existe como nodo de primer nivel en su .glb', () => {
    for (const kit of ['island', 'nature', 'food'] as Kit[]) {
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
  const kinds: PieceKind[] = ['floor', 'gap', 'low', 'side', 'log', 'step', 'drop', 'crawl', 'fruit', 'foe', 'gems', 'chest'];
  kinds.forEach((k, i) => piecePuts(mk(k, 20 * i, { len: 3, side: k === 'side' || k === 'fruit' ? 1 : 0, h: 0.4 }, i), REF, out));
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
    for (const k of ['floor', 'drop', 'foe', 'gems'] as PieceKind[]) expect(piecePuts(mk(k, 0, { len: 3 }), REF, []), k).toEqual([]);
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
  it('la seta y el cangrejo no son instancias (los pinta el sistema, animados)', () => {
    for (const side of [-1, 1] as const) expect(piecePuts(mk('side', 0, { side }, 3), REF, [])).toEqual([]);
    expect(piecePuts(mk('foe', 0), REF, [])).toEqual([]);
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

/** Las tablas del `Dock` colocadas (sin rocas ni postes): [de, a] a lo largo. */
const spans = (l: Put[]): Array<[number, number]> => decks(l);
/** ¿Los intervalos, ordenados, se tocan sin huecos de `a` a `b`? */
function tile(iv: Array<[number, number]>, a: number, b: number, eps = 1e-6): boolean {
  const l = [...iv].sort((x, y) => x[0] - y[0]);
  let at = a;
  for (const [x, y] of l) {
    if (x > at + eps) return false;
    at = Math.max(at, y);
  }
  return at >= b - eps;
}
const isRock = (p: Put): boolean => /^(Cliff|Rock)/.test(p.n);
/** Los triángulos de un modelo ya colocado, en el sendero: x = u, y = y, z = s. Con el giro (orden XYZ de three) tras la escala. */
function worldTris(p: Put): Float32Array {
  const src = tris(p.kit, p.n), out = new Float32Array(src.length), v = new Vector3(), q = new Quaternion().setFromEuler(new Euler(p.rx, p.ry, p.rz, 'XYZ'));
  for (let i = 0; i < src.length; i += 3) {
    v.set(src[i] * p.sx, src[i + 1] * p.sy, src[i + 2] * p.sz).applyQuaternion(q);
    out[i] = v.x + p.u;
    out[i + 1] = v.y + p.y;
    out[i + 2] = p.ds - v.z; // (s = ds − z)
  }
  return out;
}
/** Una malla con todo lo que sale de una lista (por las dos caras), para lanzarle rayos. */
function meshOf(l: Put[]): Mesh {
  const parts = l.map(worldTris), all = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of parts) {
    all.set(a, at);
    at += a.length;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(all, 3));
  const m = new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }));
  m.updateMatrixWorld(true);
  return m;
}

describe('la plataforma (step)', () => {
  const CASES: Array<[number, number]> = [[0.6, 4], [0.9, 5.5], [1.2, 7], [1.5, 9], [0.6, 9], [1.5, 4]];
  const rocks = (h: number, len: number, id = 1): Put[] => piecePuts(mk('step', 50, { h, len }, id), REF, []).filter(isRock);
  it('las tablas tienen la cara de arriba exactamente a h (con las medidas reales del modelo), de at a at + len, sin huecos y de borde a borde', () => {
    for (const [h, len] of CASES) {
      const l = piecePuts(mk('step', 50, { h, len }), REF, []), docks = l.filter((p) => p.n === 'Dock');
      expect(docks.length, `${h}/${len}`).toBeGreaterThan(0);
      for (const p of docks) {
        expect(p.y + deck().top * p.sy, 'cara de arriba').toBeCloseTo(h, 6);
        expect(p.sx * (deck().x1 - deck().x0)).toBeCloseTo(DOCK_W, 3);
        expect(p.u).toBeCloseTo(0, 1);
        expect(p.sz).toBeGreaterThan(0.45);
        expect(p.sz).toBeLessThan(1.6);
      }
      const d = spans(l);
      expect(d[0][0], 'empieza en at').toBeCloseTo(0, 6);
      expect(d[d.length - 1][1], 'acaba en at + len').toBeCloseTo(len, 6);
      expect(tile(d, 0, len)).toBe(true);
      for (let i = 1; i < d.length; i++) expect(d[i][0]).toBeGreaterThan(d[i - 1][1] - 1e-6);
    }
  });
  it('debajo hay un bloque de roca (Cliff*), sin barriles ni cofres: su cara delantera está en at, llega hasta len y hasta el suelo, y no pasa de las tablas', () => {
    for (const [h, len] of CASES) {
      const l = piecePuts(mk('step', 50, { h, len }), REF, []), rs = l.filter(isRock);
      expect(rs.length, `${h}/${len}`).toBeGreaterThanOrEqual(1);
      for (const p of l) {
        expect(p.n, 'ni barriles ni cofres').not.toBe('Barrel');
        expect(p.n).not.toBe('Chest_Closed');
      }
      const boxes = rs.map(placed);
      for (const [i, p] of rs.entries()) {
        expect(p.n).toMatch(/^Cliff[1-4]$/);
        expect(boxes[i].max[1], 'bajo la cara de arriba de las tablas').toBeLessThanOrEqual(h - 0.02);
        expect(boxes[i].min[1], 'hasta el suelo del paisaje').toBeLessThanOrEqual(GROUND_Y);
        // más ancha que la pasarela, de modo que las tablas apoyan por entero
        expect(boxes[i].min[0]).toBeLessThan(-DOCK_W / 2 - 0.5);
        expect(boxes[i].max[0]).toBeGreaterThan(DOCK_W / 2 + 0.5);
        expect(boxes[i].min[2]).toBeGreaterThanOrEqual(-0.6); // (sobresale un poco por delante y por detrás: el montículo baja en los extremos)
        expect(boxes[i].max[2]).toBeLessThanOrEqual(len + 0.4);
      }
      expect(Math.min(...boxes.map((b) => b.min[2])), 'cara delantera en at (medio metro por delante a lo sumo)').toBeLessThanOrEqual(0);
      expect(Math.max(...boxes.map((b) => b.max[2])), 'hasta at + len').toBeGreaterThanOrEqual(len - 1e-3);
      expect(tile(boxes.map((b) => [b.min[2], b.max[2]] as [number, number]), 0, len, 1e-3), 'sin huecos a lo largo').toBe(true);
      // y lo que se ve es sobre todo el bloque: la roca llega casi a h
      expect(Math.max(...boxes.map((b) => b.max[1]))).toBeGreaterThan(h - 0.1);
    }
  });
  it('ningún vértice de la roca asoma sobre las tablas, ni dentro del ancho de la pasarela ni fuera', () => {
    for (const [h, len] of CASES) for (const id of [1, 2]) for (const p of rocks(h, len, id)) {
      const w = worldTris(p);
      for (let i = 0; i < w.length; i += 3) expect(w[i + 1], `${h}/${len}`).toBeLessThanOrEqual(h);
    }
  });
  it('pocas piezas: como mucho unas diez por plataforma', () => {
    for (const [h, len] of CASES) expect(piecePuts(mk('step', 0, { h, len }), REF, []).length, `${h}/${len}`).toBeLessThanOrEqual(10);
  });
});

describe('el túnel (crawl)', () => {
  const LENS = [1.5, 2, 3, 4.5, 6];
  const tunnel = (len: number, id = 1): Put[] => piecePuts(mk('crawl', 30, { len, n: 3 }, id), REF, []);
  const lo = (p: Put): number => placed(p).min[1];
  const EPS = 1e-3; // (las cajas de pieces.ts van a 4 decimales; los vértices del .glb, en float32)
  it('el techo (de roca) tiene la cara de abajo en CRAWL_ROOF, cubre de lado a lado de la pasarela y de at a at + len sin huecos', () => {
    for (const len of LENS) for (const id of [1, 2]) {
      const l = tunnel(len, id), roof = l.filter((p) => isRock(p) && Math.abs(lo(p) - CRAWL_ROOF) < EPS);
      expect(roof.length, `${len}`).toBeGreaterThan(0);
      for (const p of roof) {
        const b = placed(p);
        expect(b.min[0], 'a lo ancho: pasa de la pasarela por el lado izquierdo').toBeLessThan(-DOCK_W / 2 - 0.5);
        expect(b.max[0]).toBeGreaterThan(DOCK_W / 2 + 0.5);
        expect(b.max[1] - b.min[1]).toBeGreaterThan(0.5); // (una losa con grosor)
        // nada del túnel baja de CRAWL_ROOF dentro de la pasarela
      }
      expect(tile(roof.map((p) => [placed(p).min[2], placed(p).max[2]] as [number, number]), 0, len, 1e-3), 'a lo largo, sin huecos').toBe(true);
    }
  });
  it('las paredes son de roca, a los dos lados y fuera de la pasarela (|u| ≥ DOCK_W/2), del suelo del paisaje hasta pasar el techo, de at a at + len', () => {
    for (const len of LENS) for (const id of [1, 2]) {
      const l = tunnel(len, id);
      // todo lo que baja de CRAWL_ROOF (lo que está a la altura de la gente) queda fuera de la pasarela
      for (const p of l.filter((q) => lo(q) < CRAWL_ROOF - EPS)) {
        const b = placed(p);
        expect(b.min[0] * b.max[0], `${p.n} de un solo lado`).toBeGreaterThan(0);
        expect(Math.min(Math.abs(b.min[0]), Math.abs(b.max[0])), `${p.n} fuera de la pasarela`).toBeGreaterThanOrEqual(DOCK_W / 2 - EPS);
      }
      for (const side of [-1, 1]) {
        const walls = l.filter((p) => isRock(p) && lo(p) <= GROUND_Y && placed(p).max[1] > CRAWL_ROOF + 0.5 && (placed(p).min[0] + placed(p).max[0]) * side > 0 && placed(p).max[0] - placed(p).min[0] < 3);
        expect(walls.length, `pared ${side}`).toBeGreaterThan(0);
        expect(tile(walls.map((p) => [placed(p).min[2], placed(p).max[2]] as [number, number]), 0, len, 1e-3), `pared ${side} a lo largo`).toBe(true);
        for (const p of walls) expect(placed(p).max[1], 'pasa del techo (se solapa con él)').toBeGreaterThan(CRAWL_ROOF + 0.5);
      }
      // y todo es roca (nada de postes, tablas ni barriles)
      for (const p of l) expect(p.n, p.n).toMatch(/^(Cliff[1-4]|Rock_[1-5]|Rock_Medium_[1-3])$/);
    }
  });
  it('es un túnel cubierto: desde dentro, ningún rayo hacia arriba ve el cielo, y a los lados siempre hay roca', () => {
    for (const len of [2, 4.5]) for (const id of [1, 2]) {
      const m = meshOf(tunnel(len, id)), rc = new Raycaster(), o = new Vector3(), d = new Vector3();
      let n = 0;
      // (los puntos, a ≥ 0,8 m de las bocas: desde la misma boca, claro que se ve el cielo)
      for (const s of [0.8, len / 2, len - 0.8]) for (const u of [-0.8, 0, 0.8]) for (const y of [0.3]) {
        o.set(u, y, s); // (en esta malla: x = u, y = y, z = s)
        // hacia arriba (por encima de 50°: antes de llegar a la boca se topa con el techo) y a los lados
        for (let el = 50; el <= 90; el += 20) for (let az = 0; az < 360; az += 45) {
          const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180;
          d.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
          rc.set(o, d);
          expect(rc.intersectObject(m).length, `techo: s=${s} u=${u} y=${y} el=${el} az=${az}`).toBeGreaterThan(0);
          n++;
        }
        for (const side of [-1, 1]) for (let el = -10; el <= 40; el += 25) for (let az = -20; az <= 20; az += 20) {
          const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180;
          d.set(side * Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
          rc.set(o, d);
          expect(rc.intersectObject(m).length, `pared: s=${s} u=${u} y=${y} lado=${side} el=${el} az=${az}`).toBeGreaterThan(0);
          n++;
        }
      }
      expect(n).toBeGreaterThan(300);
    }
  }, 30000);
  it('la boca se lee de lejos: unos peñascos más altos que el techo y más anchos que la pasarela junto a la entrada', () => {
    for (const len of LENS) {
      const l = tunnel(len), big = l.filter((p) => isRock(p) && placed(p).max[1] > 3 && placed(p).min[2] < 0);
      expect(big.length, `${len}`).toBeGreaterThanOrEqual(2);
      const hi = Math.max(...big.map((p) => placed(p).max[1]));
      expect(hi).toBeGreaterThan(CRAWL_ROOF + 2.5);
      expect(Math.max(...big.map((p) => placed(p).max[0])) - Math.min(...big.map((p) => placed(p).min[0]))).toBeGreaterThan(DOCK_W + 4);
    }
  });
  it('pocas piezas: como mucho unas dos docenas por túnel', () => {
    for (const len of LENS) expect(tunnel(len).length, `${len}`).toBeLessThanOrEqual(24);
  });
});

describe('la fruta', () => {
  const fruit = (id: number, side: -1 | 1, special = false, ref = REF): Put[] => piecePuts({ ...mk('fruit', 40, { side }, id), special }, ref, []);
  const size = (p: Put): number => {
    const b = placed(p);
    return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  };
  it('una sola fruta, a la altura de los ojos (y = ref) y al lado (u = side · FRUIT_U), centrada en at, de 25 a 30 cm', () => {
    for (const ref of [1.45, 1.6, 1.8]) for (const side of [-1, 1] as const) for (let id = 1; id <= 12; id++) {
      const l = fruit(id, side, false, ref);
      expect(l.length).toBe(1);
      expect(l[0].kit).toBe('food');
      const b = placed(l[0]);
      expect((b.min[1] + b.max[1]) / 2, `${l[0].n}`).toBeCloseTo(ref, 3);
      expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(side * FRUIT_U, 3);
      expect((b.min[2] + b.max[2]) / 2).toBeCloseTo(0, 3);
      expect(size(l[0]), l[0].n).toBeGreaterThanOrEqual(0.25);
      expect(size(l[0]), l[0].n).toBeLessThanOrEqual(0.3);
      expect(l[0].sx).toBe(l[0].sy); // (a escala pareja: sin deformarla)
      expect(l[0].sy).toBe(l[0].sz);
    }
  });
  it('la misma fruta para el mismo id, y varias distintas entre ids', () => {
    for (let id = 1; id <= 20; id++) expect(fruit(id, 1)[0]).toEqual(fruit(id, 1)[0]);
    const names = new Set<string>();
    for (let id = 1; id <= 30; id++) {
      names.add(fruit(id, 1)[0].n);
      expect(fruit(id, 1)[0].n).toBe(fruit(id, -1)[0].n); // (el lado no cambia cuál)
    }
    expect(names.size).toBeGreaterThanOrEqual(6);
    expect(names.has('Pineapple'), 'la piña es la especial').toBe(false);
  });
  it('la especial es la piña, más grande (unos 40 cm), a la misma altura y al mismo lado', () => {
    for (let id = 1; id <= 8; id++) for (const side of [-1, 1] as const) {
      const l = fruit(id, side, true), b = placed(l[0]);
      expect(l[0].n).toBe('Pineapple');
      expect(size(l[0])).toBeGreaterThanOrEqual(0.38);
      expect(size(l[0])).toBeLessThanOrEqual(0.42);
      expect(size(l[0])).toBeGreaterThan(size(fruit(id, side)[0]));
      expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(REF, 3);
      expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(side * FRUIT_U, 3);
    }
    expect(FRUIT_SIZE_SPECIAL).toBeGreaterThan(FRUIT_SIZE);
  });
  it('sin lado no hay fruta', () => {
    expect(piecePuts(mk('fruit', 0, { side: 0 }), REF, [])).toEqual([]);
  });
});

describe('los modelos de las piezas nuevas', () => {
  it('step, crawl y fruit solo usan modelos de KIT_MODELS, y esos existen en su .glb', () => {
    const used = new Set<string>();
    for (const k of ['step', 'crawl', 'fruit'] as PieceKind[])
      for (let id = 1; id <= 12; id++)
        for (const p of piecePuts({ ...mk(k, 0, { len: 3, h: 0.5, n: 3, side: 1 }, id), special: id === 12 }, REF, [])) {
          expect(KIT_MODELS[p.kit], `${k}: ${p.n}`).toContain(p.n);
          expect(top(p.kit).has(p.n), `${k}: ${p.n} en el .glb`).toBe(true);
          used.add(`${p.kit}:${p.n}`);
        }
    for (const m of ['island:Dock', 'island:Cliff1', 'island:Cliff3', 'island:Cliff4', 'nature:Rock_Medium_1', 'food:Apple', 'food:Pineapple']) expect(used.has(m), m).toBe(true);
  });
  it('todos los modelos de KIT_MODELS.food están en frutas.glb, con la base en y = 0 y sin texturas (colores lisos)', () => {
    const g = gltf('food') as Gltf & { textures?: unknown[]; images?: unknown[] };
    expect(g.textures ?? []).toEqual([]);
    expect(g.images ?? []).toEqual([]);
    expect(top('food').size).toBe(KIT_MODELS.food.length);
    for (const n of KIT_MODELS.food) {
      expect(top('food').has(n), n).toBe(true);
      const b = boxOf('food', n);
      expect(b.min[1], n).toBeCloseTo(0, 6);
      expect(Math.max(b.max[0] - b.min[0], b.max[1], b.max[2] - b.min[2]), n).toBeGreaterThan(0.1);
    }
  });
  it('pocas piezas por pieza de recorrido (el sistema pinta con instancias)', () => {
    for (const k of ['step', 'crawl', 'fruit'] as PieceKind[]) for (const len of [1, 3, 6, 9]) for (const h of [0.6, 1.2, 1.5])
      expect(piecePuts(mk(k, 0, { len, h, n: 3, side: 1 }), REF, []).length, `${k} ${len}/${h}`).toBeLessThanOrEqual(24);
  });
});

describe('el paisaje', () => {
  it('cada tramo, su paisaje: determinista, distinto del bosque y con sus modelos (la aldea, abierta; el atardecer, pinar)', () => {
    for (let b = 1; b < DECO_N; b++) {
      expect(decoPuts(3, [], b)).toEqual(decoPuts(3, [], b));
      expect(decoPuts(3, [], b)).not.toEqual(decoPuts(3, []));
      for (const p of decoPuts(3, [], b)) {
        expect(KIT_MODELS.nature).toContain(p.n);
        expect(Math.abs(p.u)).toBeGreaterThanOrEqual(2.5);
      }
    }
    const trees = (b: number): number => { let n = 0; for (let c = 0; c < 20; c++) n += decoPuts(c, [], b).filter((p) => /Tree|Pine/.test(p.n)).length; return n; };
    expect(trees(1)).toBeLessThan(trees(0) / 2);
    expect(trees(3)).toBeGreaterThanOrEqual(trees(0));
    expect(decoPuts(3, [], DECO_N)).toEqual(decoPuts(3, []));
  });
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
