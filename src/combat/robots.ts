/**
 * Los robots de RepArena (pedido del usuario: «vuelve a traer a los robots»; en Combate y, en Arcos, los que lanzan las
 * cuchillas): el **Segador** (el pequeño, esqueleto de pesadilla con patas invertidas) y el **Destructor** (la mole blindada
 * con cañón rotativo; su versión jefe, el **Coloso**). Son geométricos, hechos de piezas en código, tal cual en RepArena
 * (src/40_models.js: buildRipper y buildDestroyer; src/20_render.js: Rig, G, C): cada pieza va pegada a un hueso y todas se
 * funden en una malla con esqueleto por material. Sus animaciones salen de la biblioteca (anims.glb, la Universal Animation
 * Library de Quaternius) como en RepArena (src/42_beasts.js: bakeRigClips): cada animación se reproduce en el esqueleto de la
 * biblioteca y, fotograma a fotograma, cada brazo y cada pierna del robot se orienta hacia donde apunta el suyo.
 * En el estilo Cómic: sus materiales son estándar con los colores en los vértices (el cómic les pone su sombreado y su tinta);
 * los ojos y los núcleos brillan, con su halo.
 * Se fabrica una vez cada clase (`robotGltf`): cada robot que sale es una copia con su propio esqueleto.
 */
import { AdditiveBlending, AnimationClip, AnimationMixer, Bone, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, DoubleSide, Euler, Float32BufferAttribute, Group, LinearFilter, Matrix4, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, QuaternionKeyframeTrack, RGBAFormat, Skeleton, SkinnedMesh, SphereGeometry, TorusGeometry, Uint16BufferAttribute, UnsignedByteType, Vector3, VectorKeyframeTrack, type Material, type Object3D } from '@iwsdk/core';

const TAU = Math.PI * 2;
const col = (r: number, g: number, b: number): Color => new Color(r, g, b);
/** Los colores de las piezas (RepArena: C). */
const C = {
  white: col(1, 1, 1), steel: col(0.75, 0.76, 0.8), dark: col(0.3, 0.3, 0.33), black: col(0.07, 0.07, 0.08), chrome: col(1, 1, 1),
  bone: col(0.82, 0.78, 0.7), redPaint: col(0.55, 0.11, 0.07), crimson: col(0.35, 0.04, 0.05), gun: col(0.4, 0.42, 0.46),
  red: col(1, 0.12, 0.06), redHalo: col(1, 0.18, 0.08), orange: col(1, 0.45, 0.1),
};

// ---------------------------------------------------------------- la geometría (RepArena: G, xform, tint, mergeGeos)

const _m4 = new Matrix4(), _q4 = new Quaternion(), _eu = new Euler(), _sv = new Vector3(), _pv = new Vector3();
function xform(g: BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): BufferGeometry {
  _m4.compose(_pv.set(x, y, z), _q4.setFromEuler(_eu.set(rx, ry, rz)), _sv.set(sx, sy, sz));
  return g.applyMatrix4(_m4);
}
function tint(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(a, 3));
  return g;
}
function ensureAttrs(g: BufferGeometry): BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function mergeGeos(list0: BufferGeometry[]): BufferGeometry {
  const list = list0.map((g) => ensureAttrs(g.index ? g.toNonIndexed() : g));
  const names = Object.keys(list[0].attributes);
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const out = new BufferGeometry();
  for (const name of names) {
    const a0 = list[0].attributes[name] as BufferAttribute, size = a0.itemSize, Arr = a0.array.constructor as Float32ArrayConstructor, arr = new Arr(n * size);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name] as BufferAttribute | undefined;
      if (a && a.itemSize === size) arr.set(a.array as Float32Array, o);
      o += g.attributes.position.count * size;
    }
    out.setAttribute(name, new BufferAttribute(arr, size, a0.normalized));
  }
  out.computeBoundingSphere();
  return out;
}
function prep(geo: BufferGeometry, c: Color, t: number[]): BufferGeometry {
  const g = ensureAttrs(geo.index ? geo.toNonIndexed() : geo.clone());
  const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx, sy, sz] = t;
  xform(g, x, y, z, rx, ry, rz, sx ?? 1, sy ?? sx ?? 1, sz ?? sx ?? 1);
  return tint(g, c || C.white);
}
/** Las formas (RepArena: G; sin sus texturas de detalle: en el cómic, colores lisos). */
const G = {
  box: (w: number, h: number, d: number): BufferGeometry => new BoxGeometry(w, h, d),
  cyl: (rt: number, rb: number, h: number, seg = 12): BufferGeometry => new CylinderGeometry(rt, rb, h, seg),
  cone: (r: number, h: number, seg = 8): BufferGeometry => new ConeGeometry(r, h, seg),
  sph: (r: number, ws = 14, hs = 10): BufferGeometry => new SphereGeometry(r, ws, hs),
  tor: (R: number, r: number, rs = 6, ts = 16, arc = TAU): BufferGeometry => new TorusGeometry(R, r, rs, ts, arc),
  halo(s: number): BufferGeometry {
    const a = new PlaneGeometry(s, s), b = new PlaneGeometry(s, s), c = new PlaneGeometry(s, s);
    b.rotateY(Math.PI / 2);
    c.rotateX(Math.PI / 2);
    return mergeGeos([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()]);
  },
};

// ---------------------------------------------------------------- el esqueleto (RepArena: Rig)

interface RigBone {
  name: string;
  parent: RigBone | null;
  pos: Vector3;
  rot: Euler;
  parts: Record<string, BufferGeometry[]>;
  idx: number;
  local?: Matrix4;
  model?: Matrix4;
  inv?: Matrix4;
}
/** Un modelo articulado con huesos rígidos: una malla con esqueleto por material (RepArena: Rig). */
class Rig {
  bones: RigBone[] = [];
  by: Record<string, RigBone> = {};
  chans: Record<string, BufferGeometry> = {};
  legL: number[] = [];
  hipOff = 0;
  kind = '';
  bone(name: string, parent: string | null, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    const b: RigBone = { name, parent: parent ? this.by[parent] : null, pos: new Vector3(x, y, z), rot: new Euler(rx, ry, rz), parts: {}, idx: this.bones.length };
    this.bones.push(b);
    this.by[name] = b;
    return this;
  }
  add(bone: string, ch: string, geo: BufferGeometry, c: Color, ...t: number[]): this {
    const b = this.by[bone];
    (b.parts[ch] ??= []).push(prep(geo, c, t));
    return this;
  }
  build(): this {
    for (const b of this.bones) {
      b.local = new Matrix4().compose(b.pos, new Quaternion().setFromEuler(b.rot), new Vector3(1, 1, 1));
      b.model = b.parent ? new Matrix4().multiplyMatrices(b.parent.model as Matrix4, b.local) : b.local.clone();
      b.inv = b.model.clone().invert();
    }
    const chans: Record<string, BufferGeometry[]> = {};
    for (const b of this.bones)
      for (const ch in b.parts) {
        const g = mergeGeos(b.parts[ch]).applyMatrix4(b.model as Matrix4), n = g.attributes.position.count;
        const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          si[i * 4] = b.idx;
          sw[i * 4] = 1;
        }
        g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
        (chans[ch] ??= []).push(g);
      }
    for (const ch in chans) this.chans[ch] = mergeGeos(chans[ch]);
    return this;
  }
  /** Una copia para la escena: su propio esqueleto, las mallas (compartidas) con sus materiales. */
  instance(mats: Record<string, Material>): Group {
    const root = new Group();
    const bones = this.bones.map((b) => {
      const o = new Bone();
      o.name = b.name;
      o.position.copy(b.pos);
      o.rotation.copy(b.rot);
      return o;
    });
    this.bones.forEach((b, i) => {
      if (b.parent) bones[b.parent.idx].add(bones[i]);
    });
    const skel = new Skeleton(bones, this.bones.map((b) => (b.inv as Matrix4).clone()));
    let first: SkinnedMesh | null = null;
    for (const ch in this.chans) {
      const mat = mats[ch];
      if (!mat) continue;
      const m = new SkinnedMesh(this.chans[ch], mat);
      m.frustumCulled = false;
      if (ch === 'halo' || ch === 'glow') m.userData.noInk = true;
      if (!first) {
        first = m;
        this.bones.forEach((b, i) => {
          if (!b.parent) m.add(bones[i]);
        });
      }
      m.bind(skel, new Matrix4());
      root.add(m);
    }
    return root;
  }
}

/* ---------- Segador: esqueleto de pesadilla con patas invertidas ---------- */
function buildRipper(): Rig {
  const R = new Rig();
  R.bone('hips', null, 0, 1.12, 0).bone('spine', 'hips', 0, 0.06, -0.02).bone('chest', 'spine', 0, 0.40, 0)
   .bone('neck', 'chest', 0, 0.30, 0.06).bone('head', 'neck', 0, 0.12, 0.02).bone('jaw', 'head', 0, -0.03, 0.035);
  for (const [sd, sx] of ([['L', 1], ['R', -1]] as const)) {
    R.bone('sh' + sd, 'chest', sx * 0.25, 0.25, 0).bone('el' + sd, 'sh' + sd, 0, -0.36, 0).bone('ha' + sd, 'el' + sd, 0, -0.34, 0);
    R.bone('th' + sd, 'hips', sx * 0.12, -0.03, 0).bone('kn' + sd, 'th' + sd, 0, -0.46, 0).bone('an' + sd, 'kn' + sd, 0, -0.50, 0);
  }
  const P = (b: string, g: BufferGeometry, c: Color, ...t: number[]) => R.add(b, 'main', g, c, ...t), GL = (b: string, g: BufferGeometry, c: Color, ...t: number[]) => R.add(b, 'glow', g, c, ...t), HA = (b: string, s: number, c: Color, x: number, y: number, z: number) => R.add(b, 'halo', G.halo(s), c, x, y, z);
  // cadera
  P('hips', G.box(0.3, 0.12, 0.18), C.dark); P('hips', G.box(0.2, 0.08, 0.06), C.steel, 0, -0.03, 0.09);
  P('hips', G.cyl(0.05, 0.05, 0.34, 10), C.black, 0, -0.03, 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) P('hips', G.cyl(0.014, 0.014, 0.18, 6), C.chrome, s * 0.1, 0.07, -0.06, 0.4, 0, 0);
  for (let i = 0; i < 4; i++) P('hips', G.box(0.06 - i * 0.01, 0.05, 0.07), i % 2 ? C.steel : C.dark, 0, -0.02 - i * 0.03, -0.12 - i * 0.06, -0.5, 0, 0);
  P('hips', G.cone(0.02, 0.12, 5), C.chrome, 0, -0.14, -0.33, -2.1, 0, 0);
  for (const [sd, sx] of ([['L', 1], ['R', -1]] as const)) {
    const th = 'th' + sd, kn = 'kn' + sd, an = 'an' + sd, sh = 'sh' + sd, el = 'el' + sd, ha = 'ha' + sd;
    P(th, G.sph(0.065, 10, 8), C.black); P(th, G.box(0.08, 0.4, 0.1), C.dark, 0, -0.22, 0);
    P(th, G.box(0.11, 0.26, 0.035), C.steel, 0, -0.18, 0.065, 0.06, 0, 0); P(th, G.cyl(0.015, 0.015, 0.34, 6), C.chrome, 0, -0.22, -0.065);
    P(th, G.box(0.03, 0.08, 0.05), C.dark, sx * 0.06, -0.1, 0);
    P(kn, G.sph(0.058, 10, 8), C.black); P(kn, G.cone(0.028, 0.14, 6), C.steel, 0, 0.03, 0.07, 1.25, 0, 0);
    P(kn, G.box(0.07, 0.46, 0.08), C.dark, 0, -0.25, 0); P(kn, G.box(0.09, 0.3, 0.03), C.steel, 0, -0.22, 0.05);
    P(kn, G.cyl(0.013, 0.013, 0.36, 6), C.chrome, 0, -0.25, -0.055);
    P(an, G.sph(0.045, 10, 8), C.black); P(an, G.box(0.055, 0.3, 0.065), C.dark, 0, -0.15, 0);
    for (const k of [-1, 0, 1]) { P(an, G.box(0.026, 0.024, 0.15), C.steel, k * 0.045, -0.315, 0.07, 0, k * 0.28, 0); P(an, G.cone(0.013, 0.07, 5), C.chrome, k * 0.068, -0.325, 0.175, Math.PI / 2 + 0.35, 0, 0); }
    P(an, G.cone(0.012, 0.07, 5), C.chrome, 0, -0.3, -0.05, -Math.PI / 2 - 0.4, 0, 0);
    // brazo largo con garras
    P(sh, G.sph(0.06, 10, 8), C.black); P(sh, G.box(0.13, 0.07, 0.16), C.steel, sx * 0.02, 0.045, 0, 0, 0, -sx * 0.25);
    P(sh, G.cone(0.025, 0.13, 5), C.dark, sx * 0.07, 0.1, 0, 0, 0, -sx * 0.9);
    P(sh, G.box(0.055, 0.34, 0.065), C.dark, 0, -0.19, 0); P(sh, G.cyl(0.012, 0.012, 0.28, 6), C.chrome, sx * 0.04, -0.18, 0.02);
    P(el, G.sph(0.045, 10, 8), C.black); P(el, G.box(0.05, 0.32, 0.085), C.steel, 0, -0.17, 0);
    for (let k = 0; k < 3; k++) P(el, G.cone(0.015, 0.09, 4), C.dark, sx * 0.045, -0.07 - k * 0.09, -0.02, 0, 0, -sx * 1.4);
    P(ha, G.box(0.075, 0.06, 0.045), C.dark, 0, -0.03, 0);
    for (const k of [-1, 0, 1]) { P(ha, G.box(0.013, 0.21, 0.02), C.steel, k * 0.026, -0.16, 0.03, -0.28, 0, 0); P(ha, G.cone(0.009, 0.07, 4), C.chrome, k * 0.026, -0.29, 0.07, 2.65, 0, 0); }
  }
  // columna vertebral expuesta
  for (let i = 0; i < 6; i++) P('spine', G.box(0.1 - i * 0.004, 0.045, 0.08), i % 2 ? C.steel : C.dark, 0, 0.03 + i * 0.064, -0.02);
  for (const s of [-1, 1]) P('spine', G.cyl(0.011, 0.011, 0.42, 6), C.black, s * 0.065, 0.2, -0.05);
  P('spine', G.cyl(0.017, 0.017, 0.36, 6), C.chrome, 0, 0.2, 0.05);
  // caja torácica con núcleo rojo
  P('chest', G.box(0.07, 0.32, 0.05), C.steel, 0, 0.13, 0.11);
  for (let i = 0; i < 4; i++) { const r = 0.15 - Math.abs(i - 1.5) * 0.012; P('chest', G.tor(r, 0.011, 5, 14, Math.PI * 1.55), C.bone, 0, 0.02 + i * 0.075, 0, Math.PI / 2, 0, Math.PI * 0.725); }
  GL('chest', G.sph(0.055, 12, 8), C.red, 0, 0.12, 0.01); HA('chest', 0.45, C.redHalo, 0, 0.12, 0.09);
  P('chest', G.box(0.3, 0.34, 0.05), C.dark, 0, 0.13, -0.1); P('chest', G.box(0.52, 0.08, 0.16), C.steel, 0, 0.27, -0.01);
  for (const s of [-1, 1]) P('chest', G.cone(0.035, 0.22, 6), C.steel, s * 0.22, 0.37, -0.02, 0, 0, -s * 0.5);
  for (let k = 0; k < 3; k++) P('chest', G.cone(0.025, 0.16, 5), C.dark, 0, 0.06 + k * 0.1, -0.15, -1.1, 0, 0);
  // cuello y cráneo
  P('neck', G.cyl(0.03, 0.04, 0.14, 8), C.dark, 0, 0.06, 0);
  for (const s of [-1, 1]) P('neck', G.cyl(0.008, 0.008, 0.16, 5), C.black, s * 0.035, 0.06, -0.02, 0.2, 0, 0);
  P('head', G.sph(1, 16, 12), C.bone, 0, 0.07, -0.01, 0, 0, 0, 0.105, 0.115, 0.135);
  P('head', G.box(0.19, 0.03, 0.06), C.dark, 0, 0.085, 0.095, -0.25, 0, 0);
  for (const s of [-1, 1]) { P('head', G.sph(0.03, 10, 8), C.black, s * 0.042, 0.05, 0.1); GL('head', G.sph(0.016, 8, 6), C.red, s * 0.042, 0.05, 0.118); HA('head', 0.14, C.redHalo, s * 0.042, 0.05, 0.13); P('head', G.box(0.03, 0.06, 0.07), C.steel, s * 0.085, 0.02, 0.05); }
  P('head', G.cone(0.012, 0.03, 3), C.black, 0, 0.018, 0.125, Math.PI, 0, 0);
  P('head', G.box(0.17, 0.035, 0.05), C.bone, 0, -0.005, 0.08);
  for (let i = 0; i < 8; i++) { const a = (i / 7 - 0.5) * 1.6; P('head', G.cone(0.0075, 0.034, 4), C.chrome, Math.sin(a) * 0.075, -0.036, 0.07 + Math.cos(a) * 0.035, Math.PI, 0, 0); }
  for (let k = 0; k < 4; k++) P('head', G.cone(0.014, 0.08, 4), C.dark, 0, 0.17 - k * 0.02, -0.02 - k * 0.045, -0.6 - k * 0.25, 0, 0);
  P('jaw', G.box(0.15, 0.028, 0.11), C.bone, 0, -0.025, 0.05); P('jaw', G.cyl(0.012, 0.012, 0.18, 6), C.black, 0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 1.5; P('jaw', G.cone(0.007, 0.03, 4), C.chrome, Math.sin(a) * 0.065, -0.002, 0.06 + Math.cos(a) * 0.035); }
  const r = R.build(); r.legL = [0.46, 0.5, 0.33]; r.hipOff = -0.03; r.kind = 'ripper'; return r;
}

/* ---------- Destructor (y Coloso): mole blindada con cañón rotativo ---------- */
function buildDestroyer(boss: boolean): Rig {
  const R = new Rig();
  R.bone('hips', null, 0, 1.0, 0).bone('spine', 'hips', 0, 0.08, 0).bone('chest', 'spine', 0, 0.2, 0)
   .bone('head', 'chest', 0, 0.4, 0.2).bone('jaw', 'head', 0, -0.06, 0.08)
   .bone('shL', 'chest', 0.4, 0.32, 0).bone('elL', 'shL', 0, -0.36, 0).bone('clawL', 'elL', 0, -0.38, 0)
   .bone('shR', 'chest', -0.4, 0.32, 0).bone('elR', 'shR', 0, -0.36, 0).bone('gunR', 'elR', 0, -0.2, 0);
  for (const [sd, sx] of ([['L', 1], ['R', -1]] as const)) R.bone('th' + sd, 'hips', sx * 0.17, -0.04, 0).bone('kn' + sd, 'th' + sd, 0, -0.47, 0).bone('an' + sd, 'kn' + sd, 0, -0.45, 0);
  const P = (b: string, g: BufferGeometry, c: Color, ...t: number[]) => R.add(b, 'main', g, c, ...t), PT = (b: string, g: BufferGeometry, c: Color, ...t: number[]) => R.add(b, 'paint', g, c, ...t), GL = (b: string, g: BufferGeometry, c: Color, ...t: number[]) => R.add(b, 'glow', g, c, ...t), HA = (b: string, s: number, c: Color, x: number, y: number, z: number) => R.add(b, 'halo', G.halo(s), c, x, y, z);
  const pc = boss ? C.crimson : C.redPaint;
  P('hips', G.box(0.42, 0.18, 0.3), C.dark);
  for (const s of [-1, 0, 1]) PT('hips', G.box(0.14, 0.2, 0.04), pc, s * 0.15, -0.08, 0.16, 0.15, 0, 0);
  for (const [sd, sx] of ([['L', 1], ['R', -1]] as const)) {
    const th = 'th' + sd, kn = 'kn' + sd, an = 'an' + sd;
    P(th, G.sph(0.09, 10, 8), C.black); PT(th, G.box(0.16, 0.42, 0.18), pc, 0, -0.22, 0);
    for (const s of [-1, 1]) P(th, G.cyl(0.018, 0.018, 0.36, 6), C.chrome, s * 0.06, -0.22, -0.1);
    P(kn, G.sph(0.08, 10, 8), C.black); P(kn, G.box(0.17, 0.16, 0.06), C.steel, 0, 0.0, 0.1, -0.3, 0, 0); P(kn, G.cone(0.03, 0.12, 5), C.dark, 0, 0.03, 0.15, 1.35, 0, 0);
    P(kn, G.box(0.13, 0.42, 0.15), C.dark, 0, -0.23, 0); PT(kn, G.box(0.15, 0.24, 0.05), pc, 0, -0.18, 0.08);
    P(kn, G.cyl(0.02, 0.02, 0.34, 6), C.chrome, 0, -0.22, -0.09);
    P(an, G.sph(0.06, 10, 8), C.black); P(an, G.box(0.22, 0.09, 0.34), C.dark, 0, -0.05, 0.06); P(an, G.box(0.24, 0.05, 0.12), C.steel, 0, -0.06, 0.24);
    for (const k of [-1, 1]) P(an, G.cone(0.02, 0.07, 4), C.chrome, k * 0.08, -0.07, 0.32, Math.PI / 2 + 0.3, 0, 0);
  }
  P('spine', G.cyl(0.11, 0.13, 0.22, 10), C.black, 0, 0.1, 0);
  // torso jorobado
  PT('chest', G.box(0.66, 0.48, 0.44), pc, 0, 0.22, 0);
  P('chest', G.box(0.5, 0.3, 0.06), C.steel, 0, 0.18, 0.24, 0.12, 0, 0);
  for (let i = 0; i < 4; i++) P('chest', G.box(0.32, 0.022, 0.02), C.black, 0, 0.1 + i * 0.05, 0.275);
  P('chest', G.box(0.52, 0.32, 0.28), C.dark, 0, 0.42, -0.14);
  for (const s of [-1, 1]) { P('chest', G.cyl(0.05, 0.055, 0.42, 10), C.gun, s * 0.15, 0.55, -0.26); P('chest', G.cyl(0.058, 0.058, 0.05, 10), C.black, s * 0.15, 0.77, -0.26); }
  for (let k = 0; k < 4; k++) P('chest', G.cone(0.035, 0.18, 5), C.steel, (k % 2 ? 1 : -1) * 0.06, 0.58 - k * 0.02, -0.08 - k * 0.07, -0.9, 0, 0);
  if (boss) for (const s of [-1, 1]) { PT('chest', G.box(0.22, 0.2, 0.26), pc, s * 0.36, 0.62, -0.05); for (let i = 0; i < 6; i++) P('chest', G.cyl(0.025, 0.025, 0.02, 8), C.black, s * 0.36 + ((i % 3) - 1) * 0.06, 0.6 + Math.floor(i / 3) * 0.07, 0.085, Math.PI / 2, 0, 0); }
  // cabeza hundida
  P('head', G.box(0.26, 0.18, 0.24), C.steel, 0, 0.02, 0);
  P('head', G.box(0.28, 0.05, 0.1), C.dark, 0, 0.1, 0.09, 0.35, 0, 0);
  if (boss) {
    for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.07, y = 0.035 - Math.floor(i / 3) * 0.045; GL('head', G.sph(0.016, 8, 6), C.red, x, y, 0.122); HA('head', 0.13, C.redHalo, x, y, 0.13); }
  } else { GL('head', G.box(0.2, 0.024, 0.012), C.red, 0, 0.03, 0.121); HA('head', 0.18, C.redHalo, -0.05, 0.03, 0.13); HA('head', 0.18, C.redHalo, 0.05, 0.03, 0.13); }
  for (const s of [-1, 1]) {
    const hs = boss ? 1.5 : 1;
    P('head', G.cone(0.04 * hs, 0.2 * hs, 6), C.bone, s * 0.13, 0.13, -0.02, -0.3, 0, -s * 0.7);
    P('head', G.cone(0.022 * hs, 0.14 * hs, 5), C.bone, s * (0.13 + 0.12 * hs), 0.13 + 0.1 * hs, 0.02, 0.6, 0, -s * 0.2);
  }
  if (boss) for (let k = 0; k < 5; k++) P('head', G.cone(0.02, 0.1, 4), C.dark, (k - 2) * 0.05, 0.14, -0.08, -0.4, 0, (k - 2) * 0.15);
  P('jaw', G.box(0.22, 0.07, 0.06), C.dark, 0, -0.02, 0.05);
  for (let i = 0; i < 5; i++) P('jaw', G.box(0.012, 0.05, 0.015), C.chrome, (i - 2) * 0.035, -0.02, 0.085);
  // hombros
  for (const [sd, sx] of ([['L', 1], ['R', -1]] as const)) {
    const sh = 'sh' + sd, el = 'el' + sd;
    P(sh, G.sph(0.1, 10, 8), C.black); PT(sh, G.box(0.28, 0.14, 0.32), pc, sx * 0.04, 0.08, 0, 0, 0, -sx * 0.3);
    for (let k = 0; k < 3; k++) P(sh, G.cone(0.03, 0.16, 5), C.steel, sx * (0.04 + k * 0.03), 0.17, (k - 1) * 0.09, 0, 0, -sx * 0.5);
    P(sh, G.box(0.13, 0.34, 0.14), C.dark, 0, -0.2, 0);
    P(el, G.sph(0.08, 10, 8), C.black);
  }
  // brazo izquierdo: pinza trituradora
  PT('elL', G.box(0.16, 0.36, 0.17), pc, 0, -0.2, 0); for (const s of [-1, 1]) P('elL', G.cyl(0.018, 0.018, 0.3, 6), C.chrome, s * 0.09, -0.2, 0.05);
  P('clawL', G.box(0.18, 0.1, 0.15), C.dark, 0, -0.04, 0);
  for (const k of [-1, 0, 1]) { P('clawL', G.box(0.04, 0.24, 0.05), C.steel, k * 0.06, -0.19, 0.03, -0.3, 0, 0); P('clawL', G.cone(0.025, 0.1, 4), C.chrome, k * 0.06, -0.33, 0.1, 2.6, 0, 0); }
  // brazo derecho: cañón rotativo
  P('elR', G.cyl(0.1, 0.11, 0.3, 12), C.dark, 0, -0.16, 0); P('elR', G.box(0.08, 0.16, 0.14), C.gun, -0.12, -0.15, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; P('gunR', G.cyl(0.016, 0.016, 0.42, 6), C.gun, Math.cos(a) * 0.05, -0.22, Math.sin(a) * 0.05); }
  P('gunR', G.cyl(0.08, 0.08, 0.03, 12), C.dark, 0, -0.38, 0); GL('gunR', G.tor(0.05, 0.006, 4, 16), C.orange, 0, -0.42, 0, Math.PI / 2, 0, 0);
  const r = R.build(); r.legL = [0.47, 0.45, 0.09]; r.hipOff = -0.04; r.kind = boss ? 'colossus' : 'destroyer'; return r;
}

/* ---------- Araña: cuerpo con skinning; las patas van instanciadas aparte ---------- */

// ---------------------------------------------------------------- los materiales (en el cómic: colores lisos en los vértices)

/** El halo de los ojos y los núcleos (RepArena: TX.halo), dibujado una vez. */
function haloTex(): DataTexture {
  const N = 64, d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const r = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2;
      const a = r < 0.18 ? 1 - (r / 0.18) * 0.35 : r < 0.5 ? 0.65 - ((r - 0.18) / 0.32) * 0.5 : Math.max(0, 0.15 * (1 - (r - 0.5) / 0.5));
      d.set([255, 255, 255, Math.round(255 * a)], (j * N + i) * 4);
    }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}
let MATS: Record<string, Material> | null = null;
function mats(): Record<string, Material> {
  return (MATS ??= {
    main: new MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42 }),
    paint: new MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.5 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    halo: new MeshBasicMaterial({ map: haloTex(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide }),
  });
}

// ---------------------------------------------------------------- las animaciones (RepArena: RIG_MAPS y bakeRigClips)

type Limb = [string, string, string];
interface RigMap {
  body: [string, string][];
  limb: Limb[];
  foot: Limb[];
  parent: Record<string, string | null>;
  hip0: number;
  leg: number;
}
const UAL_BODY: [string, string][] = [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['neck', 'neck_01'], ['head', 'Head']];
const UAL_LIMB: Limb[] = [['shL', 'upperarm_l', 'lowerarm_l'], ['elL', 'lowerarm_l', 'hand_l'], ['haL', 'hand_l', 'middle_01_l'], ['shR', 'upperarm_r', 'lowerarm_r'], ['elR', 'lowerarm_r', 'hand_r'], ['haR', 'hand_r', 'middle_01_r'], ['thL', 'thigh_l', 'calf_l'], ['knL', 'calf_l', 'foot_l'], ['thR', 'thigh_r', 'calf_r'], ['knR', 'calf_r', 'foot_r']];
const UAL_FOOT: Limb[] = [['anL', 'foot_l', 'ball_l'], ['anR', 'foot_r', 'ball_r']];
const UAL_PARENT: Record<string, string | null> = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', elL: 'shL', haL: 'elL', shR: 'chest', elR: 'shR', haR: 'elR', thL: 'hips', knL: 'thL', anL: 'knL', thR: 'hips', knR: 'thR', anR: 'knR' };
const RIG_MAPS: Record<'ripper' | 'destroyer', RigMap> = {
  // el Segador, entero (en RepArena sus patas de ave iban aparte; aquí siguen a las de la biblioteca: andan de verdad)
  ripper: { body: UAL_BODY, limb: UAL_LIMB, foot: UAL_FOOT, parent: UAL_PARENT, hip0: 1.12, leg: 0.96 },
  // el Destructor y el Coloso: entero menos el brazo del cañón, que sigue apuntándote; no tienen cuello
  destroyer: { body: [['hips', 'pelvis'], ['spine', 'spine_01'], ['chest', 'spine_03'], ['head', 'Head']], limb: [['shL', 'upperarm_l', 'lowerarm_l'], ['elL', 'lowerarm_l', 'hand_l'], ['clawL', 'hand_l', 'middle_01_l'], ...UAL_LIMB.slice(6)], foot: UAL_FOOT, parent: { ...UAL_PARENT, head: 'chest', clawL: 'elL' }, hip0: 1.06, leg: 0.92 },
};

/** Las animaciones de la biblioteca, pasadas a un robot (RepArena: bakeRigClips). */
function bakeRigClips(S: Object3D, anims: AnimationClip[], M: RigMap): AnimationClip[] {
  const get = (n: string): Object3D => S.getObjectByName(n) as Object3D, mx = new AnimationMixer(S), out: AnimationClip[] = [];
  const pos = (n: string): Vector3 => get(n).getWorldPosition(new Vector3()), wq = (n: string): Quaternion => get(n).getWorldQuaternion(new Quaternion());
  S.updateMatrixWorld(true);
  const rest: Record<string, Quaternion> = {};
  for (const [, b] of M.body) rest[b] = wq(b).invert();
  const pel0 = pos('pelvis'), k = M.leg / (pos('thigh_l').distanceTo(pos('calf_l')) + pos('calf_l').distanceTo(pos('foot_l')));
  const down = new Vector3(0, -1, 0), fwdZ = new Vector3(0, 0, 1), d = new Vector3(), ax = new Vector3(), sw = new Quaternion(), I = new Quaternion();
  for (const clip of anims) {
    const act = mx.clipAction(clip);
    act.play();
    const n = Math.max(2, Math.ceil(clip.duration * 30) + 1), times: number[] = [], Q: Record<string, number[]> = {}, hp: number[] = [];
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / 30);
      act.time = t;
      mx.update(0);
      S.updateMatrixWorld(true);
      times.push(t);
      const W: Record<string, Quaternion> = {}, par = (nb: string): Quaternion => (M.parent[nb] ? W[M.parent[nb] as string] : I);
      for (const [nb, b] of M.body) W[nb] = wq(b).multiply(rest[b]); // giro respecto al reposo
      for (const [nb, a, b] of M.limb) {
        const pw = par(nb);
        d.subVectors(pos(b), pos(a)).normalize();
        ax.copy(down).applyQuaternion(pw);
        W[nb] = sw.setFromUnitVectors(ax, d).clone().multiply(pw);
      }
      for (const [nb, a, b] of M.foot) {
        const pw = par(nb);
        d.subVectors(pos(b), pos(a));
        d.y = Math.min(d.y, 0.3 * d.length());
        d.normalize();
        ax.copy(fwdZ).applyQuaternion(pw);
        W[nb] = sw.setFromUnitVectors(ax, d).clone().multiply(pw);
      }
      for (const nb in W) {
        const l = par(nb).clone().invert().multiply(W[nb]);
        if (l.w < 0) l.set(-l.x, -l.y, -l.z, -l.w); // (siempre con w ≥ 0: las mezclas entre animaciones no se tuercen)
        (Q[nb] ??= []).push(l.x, l.y, l.z, l.w);
      }
      const pv = pos('pelvis').sub(pel0);
      hp.push(pv.x * k, M.hip0 + pv.y * k, pv.z * k);
    }
    act.stop();
    const tracks = Object.keys(Q).map((nb) => new QuaternionKeyframeTrack(nb + '.quaternion', times, Q[nb]));
    tracks.push(new VectorKeyframeTrack('hips.position', times, hp));
    out.push(new AnimationClip(clip.name, clip.duration, tracks));
  }
  mx.stopAllAction();
  return out;
}

// ---------------------------------------------------------------- para el juego

export type RobotKind = 'ripper' | 'destroyer' | 'colossus';
const rigs = new Map<RobotKind, Rig>();
const clips = new Map<'ripper' | 'destroyer', AnimationClip[]>();

/**
 * Un robot para la escena, como un modelo cargado (`scene`, una copia nueva con su esqueleto; `animations`, las de la
 * biblioteca pasadas a él), o null si la biblioteca (`lib`: anims.glb) aún no ha cargado. Mira hacia +Z.
 */
export function robotGltf(kind: RobotKind, lib: { scene: Object3D; animations: AnimationClip[] } | null): { scene: Object3D; animations: AnimationClip[] } | null {
  if (!lib) return null;
  let rig = rigs.get(kind);
  if (!rig) {
    rig = kind === 'ripper' ? buildRipper() : buildDestroyer(kind === 'colossus');
    rigs.set(kind, rig);
  }
  const mk = kind === 'ripper' ? 'ripper' : 'destroyer';
  let cl = clips.get(mk);
  if (!cl) {
    cl = bakeRigClips(lib.scene, lib.animations, RIG_MAPS[mk]);
    clips.set(mk, cl);
  }
  return { scene: rig.instance(mats()), animations: cl };
}
