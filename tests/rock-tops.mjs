// Rehace src/env/rock-tops.ts: la cara de arriba de las rocas de los kits (island.glb y nature.glb), como una rejilla de
// alturas en las coordenadas de cada modelo (las mismas que usa el juego: con la escala y el giro de su nodo, como hace
// kitParts). Con ella, lo que va encima de una roca (un pino, una palmera, unos huesos) se apoya en ella y no flota.
//   node tests/rock-tops.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const N = 28; // celdas por lado
const MODELS = { 'public/models/island.glb': ['Cliff1', 'Cliff3', 'Cliff4', 'Rock_1', 'Rock_2', 'Rock_3', 'Rock_4', 'Rock_5'], 'public/models/nature.glb': ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'] };

function glb(path) {
  const b = readFileSync(path), jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bo = 20 + jl, bl = b.readUInt32LE(bo);
  return { json, bin: b.subarray(bo + 8, bo + 8 + bl) };
}
const COMP = { 5126: [4, 'readFloatLE'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5121: [1, 'readUInt8'] };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function acc(G, i) {
  const a = G.json.accessors[i], v = G.json.bufferViews[a.bufferView], [cs, fn] = COMP[a.componentType], n = SIZE[a.type];
  const stride = v.byteStride || cs * n, off = (v.byteOffset || 0) + (a.byteOffset || 0), out = [];
  for (let k = 0; k < a.count; k++) {
    const e = [];
    for (let c = 0; c < n; c++) e.push(G.bin[fn](off + k * stride + c * cs));
    out.push(n === 1 ? e[0] : e);
  }
  return out;
}
// matrices 4×4 (en columnas, como glTF)
const mul = (A, B) => { const C = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) C[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]; return C; };
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

function tris(G, nodeI, M, out) {
  const n = G.json.nodes[nodeI], W = mul(M, local(n));
  if (n.mesh !== undefined)
    for (const pr of G.json.meshes[n.mesh].primitives) {
      const P = acc(G, pr.attributes.POSITION).map((p) => apply(W, p)), I = pr.indices !== undefined ? acc(G, pr.indices) : P.map((_, i) => i);
      for (let i = 0; i + 2 < I.length; i += 3) out.push([P[I[i]], P[I[i + 1]], P[I[i + 2]]]);
    }
  for (const c of n.children || []) tris(G, c, W, out);
}

const res = {};
for (const [file, names] of Object.entries(MODELS)) {
  const G = glb(file), scene = G.json.scenes[G.json.scene || 0];
  for (const name of names) {
    const ni = scene.nodes.find((i) => G.json.nodes[i].name === name);
    if (ni === undefined) throw new Error(`no está ${name} en ${file}`);
    const T = [];
    tris(G, ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], T);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of T) for (const p of t) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    const dx = (x1 - x0) / N, dz = (z1 - z0) / N, top = new Array(N * N).fill(-Infinity);
    // (cada triángulo, muestreado más fino que la rejilla: lo más alto de cada celda)
    for (const [a, b, c] of T) {
      const e = Math.max(Math.hypot(b[0] - a[0], b[2] - a[2]), Math.hypot(c[0] - a[0], c[2] - a[2]), Math.hypot(c[0] - b[0], c[2] - b[2]));
      const k = Math.max(2, Math.ceil((e / Math.min(dx, dz)) * 3));
      for (let i = 0; i <= k; i++)
        for (let j = 0; i + j <= k; j++) {
          const u = i / k, v = j / k, w = 1 - u - v, x = a[0] * w + b[0] * u + c[0] * v, y = a[1] * w + b[1] * u + c[1] * v, z = a[2] * w + b[2] * u + c[2] * v;
          const ci = Math.min(N - 1, Math.max(0, Math.floor((x - x0) / dx))), cj = Math.min(N - 1, Math.max(0, Math.floor((z - z0) / dz)));
          if (y > top[cj * N + ci]) top[cj * N + ci] = y;
        }
    }
    res[name] = { b: [x0, z0, x1, z1].map((v) => +v.toFixed(4)), t: top.map((v) => (v === -Infinity ? null : Math.round(v * 1000))) };
  }
}
const body = Object.entries(res).map(([k, v]) => `  ${k}: { b: [${v.b.join(', ')}], t: [${v.t.map((x) => (x === null ? 'null' : x)).join(',')}] },`).join('\n');
writeFileSync('src/env/rock-tops.ts', `/**
 * La cara de arriba de las rocas de los kits (island.glb y nature.glb): para cada modelo, su caja a lo ancho y a lo largo
 * (\`b\`: x0, z0, x1, z1, en sus coordenadas, con la escala y el giro de su nodo, como las deja kitParts) y una rejilla de
 * ${N} × ${N} celdas con lo más alto de la roca en cada una (\`t\`, en mm; null donde no hay roca). Con ella, lo que va encima
 * de una roca se apoya en ella y no flota (pedido del usuario: «los árboles nunca están flotando»).
 * Hecho por tests/rock-tops.mjs (no se toca a mano: si cambian los modelos, se vuelve a hacer).
 */
export const ROCK_N = ${N};
export const ROCK_TOPS: Record<string, { b: [number, number, number, number]; t: (number | null)[] }> = {
${body}
};
`);
console.log('hecho:', Object.keys(res).join(', '));
