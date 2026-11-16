// Script de una sola vez: junta los .glb sueltos del Food Kit de Kenney (CC0) en `public/models/frutas.glb`, con cada fruta
// como nodo de primer nivel con su nombre (así las lee `kitParts`). Uso: node tests/frutas-glb.mjs <carpeta con los .glb>
// No crea nada de cero: copia sus mallas y colores tal cual (quita las extensiones VRM/unlit, que no hacen falta, y deja
// los materiales como PBR lisos, de colores sin texturas).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'tmp-food';
const FRUTAS = { Apple: 'apple', Banana: 'banana', Cherries: 'cherries', Orange: 'orange', Pear: 'pear', Strawberry: 'strawberry', Pineapple: 'pineapple', Watermelon: 'watermelon', Lemon: 'lemon', Grapes: 'grapes' };

const out = { asset: { version: '2.0', generator: 'frutas-glb.mjs (Food Kit de Kenney, CC0)' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
const bins = [];
let binLen = 0;
const matIdx = new Map();

for (const [nombre, f] of Object.entries(FRUTAS)) {
  const b = fs.readFileSync(path.join(dir, `${f}.glb`)), jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  // el binario, alineado a 4 bytes
  const pad = (4 - (binLen % 4)) % 4;
  if (pad) { bins.push(Buffer.alloc(pad)); binLen += pad; }
  const base = binLen;
  bins.push(bin);
  binLen += bin.length;
  const bv0 = out.bufferViews.length, ac0 = out.accessors.length, me0 = out.meshes.length, no0 = out.nodes.length;
  for (const v of j.bufferViews) out.bufferViews.push({ buffer: 0, byteOffset: base + (v.byteOffset ?? 0), byteLength: v.byteLength, ...(v.target ? { target: v.target } : {}) });
  for (const a of j.accessors) {
    const { bufferView, byteOffset, componentType, count, type, min, max } = a;
    out.accessors.push({ bufferView: bv0 + bufferView, ...(byteOffset ? { byteOffset } : {}), componentType, count, type, ...(min ? { min, max } : {}) });
  }
  // los materiales, por nombre (los de Kenney se repiten con los mismos colores entre frutas): lisos, sin metal
  const mm = j.materials.map((m) => {
    if (!matIdx.has(m.name)) {
      matIdx.set(m.name, out.materials.length);
      out.materials.push({ name: m.name, pbrMetallicRoughness: { baseColorFactor: m.pbrMetallicRoughness.baseColorFactor, metallicFactor: 0, roughnessFactor: 1 } });
    }
    return matIdx.get(m.name);
  });
  for (const m of j.meshes) out.meshes.push({ name: m.name, primitives: m.primitives.map((p) => ({ attributes: Object.fromEntries(Object.entries(p.attributes).filter(([k]) => k !== 'TEXCOORD_0').map(([k, v]) => [k, ac0 + v])), indices: ac0 + p.indices, material: mm[p.material], mode: 4 })) });
  // los nodos: la raíz de la fruta (con su nombre) y, si la tiene, su árbol
  for (const n of j.nodes) {
    const o = { ...n };
    if (n.mesh !== undefined) o.mesh = me0 + n.mesh;
    if (n.children) o.children = n.children.map((c) => no0 + c);
    out.nodes.push(o);
  }
  const root = no0 + j.scenes[0].nodes[0];
  out.nodes[root].name = nombre;
  out.scenes[0].nodes.push(root);
}
out.buffers[0].byteLength = binLen;
// (TEXCOORD_0 se quita: no hay texturas; sus accessors quedan sin usar, pero ocupan poco)

const js = Buffer.from(JSON.stringify(out), 'utf8');
const jpad = Buffer.alloc((4 - (js.length % 4)) % 4, 0x20);
const jchunk = Buffer.concat([js, jpad]);
const bpad = (4 - (binLen % 4)) % 4;
const bchunk = Buffer.concat([...bins, Buffer.alloc(bpad)]);
const total = 12 + 8 + jchunk.length + 8 + bchunk.length;
const head = Buffer.alloc(20);
head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8); head.writeUInt32LE(jchunk.length, 12); head.write('JSON', 16);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bchunk.length, 0); bh.write('BIN\0', 4, 'latin1');
const dest = process.argv[3] ?? 'public/models/frutas.glb';
fs.writeFileSync(dest, Buffer.concat([head, jchunk, bh, bchunk]));
console.log(dest, total, 'bytes');
