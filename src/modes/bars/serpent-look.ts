/**
 * El dragón oriental del combate en el cielo (elegido por el usuario: «dragones con un movimiento más estilizado, como los
 * dragones chinos, que serpenteen por el cielo»; opción A: hecho por piezas, como los robots de RepArena, porque no hay un
 * modelo libre). Un cuerpo largo de escamas que ondula como una serpiente, con su cresta de aletas, cuatro patas con garras
 * y la cola en penacho; la cabeza, con hocico, mandíbula que se abre al atacar, ojos, cuernos de ciervo, bigotes largos y
 * melena.
 *
 * Cómo se mueve el cuerpo: sigue el camino que ha hecho la cabeza (respecto a ti, que vuelas con ella) y el viento de tu vuelo
 * lo estira hacia atrás, lejos de ti, como una cometa; encima, una onda corre de la cabeza a la cola (serpentea aunque la
 * cabeza esté quieta). Se rehace en cada fotograma (unos 500 vértices): sin crear nada nuevo.
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, RepeatWrapping, SphereGeometry, Quaternion, TubeGeometry, CatmullRomCurve3, Vector3 } from '@iwsdk/core';
import { comicPatch } from '../../style/comic.js';

/** Cómo es cada dragón: el tamaño de su cabeza (m), su largo (m), cuántos anillos tiene el cuerpo y sus colores. */
export interface SerpentOpt {
  hs: number;
  len: number;
  rings: number;
  body: number;
  belly: number;
  fin: number;
  horn: number;
}
/** El pequeño, verde jade; el jefe, rojo y oro. */
export const SERPENT_SMALL: SerpentOpt = { hs: 1.6, len: 16, rings: 40, body: 0x2fb37a, belly: 0xf3d27a, fin: 0xff9a3c, horn: 0xf5ead0 };
export const SERPENT_BOSS: SerpentOpt = { hs: 3.6, len: 40, rings: 56, body: 0xd8283a, belly: 0xffd27a, fin: 0xffb020, horn: 0xf8e9c8 };

/** Los lados de cada anillo, lo que se aleja el cuerpo con el viento (m/s), la onda (veces a lo largo, rad/s y lo ancha,
 * × el largo) y el grosor (× la cabeza). */
const SIDES = 10, DRIFT = 7, WAVES = 1.8, WAVE_W = 3.4, WAVE_A = 0.1, THICK = 0.34;
/** Lo que se guarda del camino de la cabeza. */
const HIST = 400;

// las escamas: un dibujo gris (lo tiñen los colores de cada vértice), hecho una vez
let scalesTex: CanvasTexture | null = null;
function scales(): CanvasTexture {
  if (scalesTex) return scalesTex;
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, N, N);
  const s = N / 4;
  for (let row = -1; row < 5; row++)
    for (let col = -1; col < 5; col++) {
      const x = col * s + (row & 1 ? s / 2 : 0), y = row * s * 0.75;
      const g = c.createRadialGradient(x, y + s * 0.15, s * 0.1, x, y, s * 0.62);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.75, '#e9e9e9');
      g.addColorStop(1, '#a8a8a8');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, s * 0.6, 0, Math.PI);
      c.fill();
      c.strokeStyle = '#8a8a8a';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, s * 0.6, 0.1, Math.PI - 0.1);
      c.stroke();
    }
  scalesTex = new CanvasTexture(cv);
  scalesTex.wrapS = scalesTex.wrapT = RepeatWrapping;
  return scalesTex;
}

const mat = (color: number, opts: { map?: CanvasTexture; vc?: boolean; rough?: number } = {}): MeshStandardMaterial => {
  const m = new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.7, metalness: 0, map: opts.map ?? null, vertexColors: !!opts.vc });
  comicPatch(m);
  return m;
};

export class SerpentLook {
  /** La cabeza (la coloca quien la usa: dónde está y hacia dónde mira, +z hacia delante) y el cuerpo, la cresta y las patas. */
  readonly g = new Group();
  readonly body: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly col: Float32Array;
  private readonly fins: InstancedMesh;
  private readonly legs: Group[] = [];
  private readonly jaw = new Group();
  private readonly whisk: Group[] = [];
  private readonly mane: Group = new Group();
  private readonly mats: MeshStandardMaterial[] = [];
  /** El camino de la cabeza respecto a ti (m) y cuándo (s), en anillo. */
  private readonly hx = new Float32Array(HIST);
  private readonly hy = new Float32Array(HIST);
  private readonly hz = new Float32Array(HIST);
  private readonly ht = new Float32Array(HIST);
  private hn = 0;
  private hi = 0;
  private clock = 0;
  /** Los puntos del espinazo (en el cielo) y sus ejes, reservados. */
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly radius: Float32Array;
  private readonly v = new Vector3();
  private readonly t = new Vector3();
  private readonly side = new Vector3();
  private readonly up = new Vector3();
  private readonly hf = new Vector3();
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly sc = new Vector3();
  private readonly cBody = new Color();
  private readonly cBelly = new Color();
  private open = 0;

  constructor(parent: Object3D, private readonly o: SerpentOpt) {
    const R = o.rings, n = R * (SIDES + 1);
    this.px = new Float32Array(R);
    this.py = new Float32Array(R);
    this.pz = new Float32Array(R);
    this.radius = new Float32Array(R);
    this.cBody.setHex(o.body);
    this.cBelly.setHex(o.belly);
    // el grosor a lo largo: fino en el cuello, más grueso a un cuarto y afilándose hasta la cola
    for (let i = 0; i < R; i++) {
      const s = i / (R - 1), k = s < 0.22 ? 0.72 + 0.28 * (s / 0.22) : 1 - 0.92 * ((s - 0.22) / 0.78) ** 1.4;
      this.radius[i] = o.hs * THICK * k;
    }
    // el cuerpo: un tubo que se rehace en cada fotograma
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), idx: number[] = [];
    for (let i = 0; i < R; i++)
      for (let j = 0; j <= SIDES; j++) {
        const a = i * (SIDES + 1) + j;
        uv[a * 2] = j / SIDES;
        uv[a * 2 + 1] = ((i / (R - 1)) * o.len) / (o.hs * 0.9);
        if (i < R - 1 && j < SIDES) {
          const b = a + SIDES + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b); // (de cara hacia fuera)
        }
      }
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    const nAttr = new BufferAttribute(this.nor, 3);
    this.geo.setAttribute('normal', nAttr);
    // (el contorno de tinta empuja por las normales: las mismas, que cambian con el cuerpo)
    this.geo.setAttribute('aOutN', nAttr);
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
    this.geo.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    const bm = mat(0xffffff, { map: scales(), vc: true, rough: 0.55 });
    this.mats.push(bm);
    this.body = new Mesh(this.geo, bm);
    this.body.frustumCulled = false;
    parent.add(this.body);
    // la cresta: aletas a lo largo del lomo (y dos más grandes, el penacho de la cola)
    const finGeo = new ConeGeometry(0.5, 1, 4).translate(0, 0.5, 0).scale(0.22, 1, 1);
    const fm = mat(o.fin, { rough: 0.6 });
    this.mats.push(fm);
    this.fins = new InstancedMesh(finGeo, fm, Math.ceil(R / 2) + 2);
    this.fins.frustumCulled = false;
    parent.add(this.fins);
    // las patas: un muslo, la pierna y tres garras
    const lm = mat(o.body, { rough: 0.55 }), cm = mat(o.horn, { rough: 0.4 }), legGeo = new CylinderGeometry(0.16 * o.hs, 0.1 * o.hs, 0.7 * o.hs, 7).translate(0, -0.35 * o.hs, 0);
    this.mats.push(lm, cm);
    for (let k = 0; k < 4; k++) {
      const L = new Group(), hs = o.hs;
      const leg = new Mesh(legGeo, lm);
      L.add(leg);
      for (let c = -1; c <= 1; c++) {
        const claw = new Mesh(new ConeGeometry(0.05 * hs, 0.22 * hs, 5), cm);
        claw.position.set(c * 0.08 * hs, -0.72 * hs, 0.06 * hs);
        claw.rotation.x = 1.9;
        L.add(claw);
      }
      parent.add(L);
      this.legs.push(L);
    }
    this.buildHead();
    parent.add(this.g);
  }

  // la cabeza (mirando a +z), feroz (pedido del usuario: «un aspecto más feroz»): cráneo, hocico largo con cresta, mandíbula
  // siempre algo abierta enseñando los colmillos, ojos rasgados que brillan con pupila de reptil bajo unas cejas fruncidas en
  // V, púas en las mejillas, cuernos largos hacia atrás, bigotes y melena
  private buildHead(): void {
    const o = this.o, h = o.hs, body = mat(o.body, { map: scales(), rough: 0.55 }), belly = mat(o.belly), horn = mat(o.horn, { rough: 0.4 });
    const white = mat(0xfff8e0, { rough: 0.3 }), black = mat(0x14101a, { rough: 0.2 }), mane = mat(o.fin, { rough: 0.6 }), gum = mat(0x8a1020, { rough: 0.5 });
    this.mats.push(body, belly, horn, white, black, mane, gum);
    // (los ojos brillan con luz propia: fuera de `mats`, que el destello del golpe no se la quite)
    const eye = new MeshStandardMaterial({ color: 0xffd21a, emissive: 0xff8a00, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0 });
    comicPatch(eye);
    const add = (geo: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: Object3D = this.g): Mesh => {
      const M = new Mesh(geo, m);
      M.position.set(x * h, y * h, z * h);
      M.scale.set(sx * h, sy * h, sz * h);
      parent.add(M);
      return M;
    };
    const ball = new SphereGeometry(1, 16, 12);
    const tooth = new ConeGeometry(1, 1, 6), spike = new ConeGeometry(1, 1, 5).translate(0, 0.5, 0);
    add(ball, body, 0, 0.05, -0.12, 0.4, 0.34, 0.5); // el cráneo
    add(ball, body, 0, 0.0, 0.5, 0.25, 0.18, 0.56); // el hocico, largo y estrecho
    // (la cresta del hocico: una fila de púas hasta la frente)
    for (let k = 0; k < 4; k++) {
      const P = add(spike, mane, 0, 0.16 - k * 0.015, 0.62 - k * 0.17, 0.035, 0.12 + k * 0.02, 0.05);
      P.rotation.x = -0.7;
    }
    // la nariz, del color del cuerpo y chata, con los orificios abiertos (una bola dorada lo hacía simpático)
    add(ball, body, 0, 0.07, 0.96, 0.13, 0.07, 0.07);
    for (const s of [-1, 1]) {
      const N = add(ball, black, 0.07 * s, 0.1, 1.0, 0.04, 0.022, 0.03);
      N.rotation.z = 0.5 * s;
    }
    // el labio de arriba, oscuro, con los dientes y dos colmillos largos
    add(ball, gum, 0, -0.1, 0.5, 0.22, 0.05, 0.4);
    for (const z of [0.82, 0.7, 0.58, 0.46])
      for (const s of [-1, 1]) {
        const T = add(tooth, white, (0.1 - (0.82 - z) * 0.1) * s, -0.15, z, 0.022, 0.07, 0.022);
        T.rotation.x = Math.PI;
      }
    for (const s of [-1, 1]) {
      const F = add(tooth, white, 0.15 * s, -0.22, 0.66, 0.04, 0.2, 0.04);
      F.rotation.set(Math.PI - 0.15, 0, 0);
    }
    // la mandíbula (siempre algo abierta, gruñendo; del todo al atacar), con sus colmillos hacia arriba
    this.jaw.position.set(0, -0.14 * h, 0.05 * h);
    this.g.add(this.jaw);
    add(ball, belly, 0, -0.08, 0.36, 0.22, 0.09, 0.44, this.jaw);
    add(ball, gum, 0, -0.01, 0.4, 0.18, 0.04, 0.36, this.jaw);
    for (const z of [0.72, 0.6, 0.48])
      for (const s of [-1, 1]) add(tooth, white, (0.09 - (0.72 - z) * 0.1) * s, 0.04, z, 0.02, 0.065, 0.02, this.jaw);
    for (const s of [-1, 1]) {
      const F = add(tooth, white, 0.13 * s, 0.1, 0.76, 0.035, 0.16, 0.035, this.jaw);
      F.rotation.x = 0.15;
    }
    // los ojos: rasgados y brillantes, con pupila de reptil, hundidos bajo unas cejas fruncidas en V (más bajas por dentro)
    for (const s of [-1, 1]) {
      add(ball, black, 0.24 * s, 0.17, 0.2, 0.13, 0.08, 0.1); // (la cuenca, oscura)
      const E = add(ball, white, 0.27 * s, 0.17, 0.24, 0.1, 0.05, 0.08);
      E.material = eye;
      E.rotation.z = -0.4 * s;
      const P = add(ball, black, 0.31 * s, 0.17, 0.28, 0.013, 0.045, 0.03);
      P.rotation.z = -0.4 * s;
      // (el ceño: una arista del color del cuerpo que tapa lo alto del ojo, con su raya negra, en V)
      const ridge = add(ball, body, 0.23 * s, 0.225, 0.24, 0.16, 0.05, 0.1);
      ridge.rotation.set(0.2, 0, 0.6 * s);
      const frown = add(ball, black, 0.24 * s, 0.2, 0.29, 0.14, 0.014, 0.05);
      frown.rotation.set(0.2, 0, 0.6 * s);
      // (una púa en la punta de fuera de cada ceja)
      const B = add(spike, horn, 0.34 * s, 0.3, 0.16, 0.035, 0.16, 0.035);
      B.rotation.set(-0.9, 0, -0.9 * s);
      // (las púas de las mejillas, hacia atrás: una gorguera de pocos amigos)
      for (let k = 0; k < 3; k++) {
        const C = add(spike, mane, 0.32 * s, -0.08 + k * 0.1, -0.05 - k * 0.04, 0.06, 0.4 - k * 0.06, 0.04);
        C.rotation.set(-1.25 + k * 0.15, 0, -(1.05 - k * 0.2) * s);
      }
    }
    // los cuernos: largos y afilados, hacia atrás, con una rama
    const stem = new CylinderGeometry(0.25, 1, 1, 6).translate(0, 0.5, 0);
    for (const s of [-1, 1]) {
      const H = new Group();
      H.position.set(0.17 * s * h, 0.3 * h, -0.22 * h);
      H.rotation.set(-1.15, 0, 0.3 * s);
      this.g.add(H);
      add(stem, horn, 0, 0, 0, 0.055, 1.05, 0.055, H);
      add(spike, horn, 0, 1.02, 0, 0.022, 0.2, 0.022, H);
      const br = add(stem, horn, 0, 0.45, 0, 0.035, 0.4, 0.035, H);
      br.rotation.set(0.85, 0, 0);
    }
    // los bigotes: largos, desde los lados del hocico hacia atrás y abajo; se mecen
    for (const s of [-1, 1]) {
      const W = new Group();
      W.position.set(0.2 * s * h, -0.02 * h, 0.66 * h);
      this.g.add(W);
      const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.35 * s, -0.08, -0.2), new Vector3(0.7 * s, -0.3, -0.6), new Vector3(0.95 * s, -0.55, -1.15)].map((p) => p.multiplyScalar(h)));
      W.add(new Mesh(new TubeGeometry(curve, 16, 0.014 * h, 5), belly));
      this.whisk.push(W);
    }
    // la melena: mechones hacia atrás alrededor de la nuca
    this.mane.position.set(0, 0.05 * h, -0.4 * h);
    this.g.add(this.mane);
    const lock = new ConeGeometry(1, 1, 5).translate(0, 0.5, 0);
    for (let k = 0; k < 9; k++) {
      const a = -1.3 + (k / 8) * 2.6, M = add(lock, mane, Math.sin(a) * 0.32, 0.05 + Math.cos(a) * 0.28, 0, 0.09, 0.55, 0.09, this.mane);
      M.rotation.set(-1.35, 0, -a * 0.6);
    }
  }

  set visible(on: boolean) {
    this.g.visible = this.body.visible = this.fins.visible = on;
    for (const L of this.legs) L.visible = on;
  }

  /** Sale (o vuelve a salir): el camino, recto detrás de la cabeza. `px…`: tú, en el cielo. */
  reset(px: number, py: number, pz: number): void {
    this.hn = 0;
    this.hi = 0;
    this.clock = 0;
    this.open = 0;
    this.record(this.g.position.x - px, this.g.position.y - py, this.g.position.z - pz);
  }

  private record(x: number, y: number, z: number): void {
    this.hi = (this.hi + 1) % HIST;
    this.hx[this.hi] = x;
    this.hy[this.hi] = y;
    this.hz[this.hi] = z;
    this.ht[this.hi] = this.clock;
    this.hn = Math.min(HIST, this.hn + 1);
  }

  /** El destello del golpe (0-1): el cuerpo se aclara. */
  flash(k: number): void {
    for (const m of this.mats) m.emissive.setScalar(k * 0.6);
  }

  /**
   * Un fotograma: tú (en el cielo) y hacia dónde vuelas (para estirar el cuerpo lejos de ti), lo abierta que quiere la boca
   * (0-1: al atacar) y el tiempo de la partida.
   */
  update(dt: number, px: number, py: number, pz: number, fx: number, fz: number, openTo: number): void {
    this.clock += dt;
    const o = this.o, R = o.rings, G = this.g.position, T = o.len / DRIFT;
    this.record(G.x - px, G.y - py, G.z - pz);
    // la boca y los bigotes y la melena, que se mecen
    this.open += (openTo - this.open) * Math.min(1, dt * 8);
    // (siempre algo abierta, gruñendo; del todo al atacar)
    this.jaw.rotation.x = 0.16 + this.open * 0.5 + Math.sin(this.clock * 2.2) * 0.03;
    const w = this.clock;
    this.whisk[0].rotation.set(Math.sin(w * 2.3) * 0.2, Math.sin(w * 1.7) * 0.25, 0);
    this.whisk[1].rotation.set(Math.sin(w * 2.1 + 1) * 0.2, Math.sin(w * 1.9 + 2) * 0.25, 0);
    this.mane.rotation.set(Math.sin(w * 3.1) * 0.12, Math.sin(w * 2.6) * 0.1, 0);
    // el cuello, detrás de la cabeza
    this.hf.set(0, 0, 1).applyQuaternion(this.g.quaternion);
    // el espinazo: el camino de la cabeza (respecto a ti) hace `tau` s, estirado hacia atrás por el viento, y la onda
    let k = this.hi, left = this.hn - 1;
    for (let i = 0; i < R; i++) {
      const s = i / (R - 1), tau = s * T, at = this.clock - tau;
      // (el punto del camino de cuando pasó por ahí: hacia atrás en el anillo)
      while (left > 0 && this.ht[k] > at) {
        k = (k - 1 + HIST) % HIST;
        left--;
      }
      const k2 = (k + 1) % HIST, t0 = this.ht[k], t1 = this.ht[k2], u = t1 > t0 && left < this.hn - 1 ? Math.min(1, Math.max(0, (at - t0) / (t1 - t0))) : 0;
      const rx = this.hx[k] + (this.hx[k2] - this.hx[k]) * u, ry = this.hy[k] + (this.hy[k2] - this.hy[k]) * u, rz = this.hz[k] + (this.hz[k2] - this.hz[k]) * u;
      // (lejos de ti: hacia donde está respecto a ti, algo hacia delante y un poco arriba)
      let dx = rx + fx * 4, dz = rz + fz * 4;
      const dm = Math.hypot(dx, dz) || 1;
      dx /= dm;
      dz /= dm;
      const drift = DRIFT * tau, wave = Math.sin(WAVES * 6.283 * s - WAVE_W * w) * WAVE_A * o.len * Math.min(1, s * 3), wv = Math.sin(WAVES * 4.1 * s - WAVE_W * 0.7 * w + 1) * WAVE_A * 0.45 * o.len * Math.min(1, s * 3);
      // (el arranque, en la nuca)
      const neck = Math.max(0, 1 - s * 8);
      this.px[i] = px + rx + dx * drift - dz * wave - this.hf.x * 0.45 * o.hs * neck;
      this.py[i] = py + ry + drift * 0.12 + wv - this.hf.y * 0.45 * o.hs * neck;
      this.pz[i] = pz + rz + dz * drift + dx * wave - this.hf.z * 0.45 * o.hs * neck;
    }
    this.px[0] = G.x - this.hf.x * 0.45 * o.hs;
    this.py[0] = G.y - this.hf.y * 0.45 * o.hs;
    this.pz[0] = G.z - this.hf.z * 0.45 * o.hs;
    // los anillos del tubo: cada uno con su lado y su arriba (la barriga, dorada, hacia abajo)
    let fi = 0;
    for (let i = 0; i < R; i++) {
      const a = Math.max(0, i - 1), b = Math.min(R - 1, i + 1);
      this.t.set(this.px[b] - this.px[a], this.py[b] - this.py[a], this.pz[b] - this.pz[a]).normalize();
      this.side.set(0, 1, 0).cross(this.t);
      if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
      this.side.normalize();
      this.up.copy(this.t).cross(this.side).normalize();
      const r = this.radius[i];
      for (let j = 0; j <= SIDES; j++) {
        const th = (j / SIDES) * 6.283, c = Math.cos(th), sn = Math.sin(th), q = (i * (SIDES + 1) + j) * 3;
        const nx = this.side.x * c + this.up.x * sn, ny = this.side.y * c + this.up.y * sn, nz = this.side.z * c + this.up.z * sn;
        const rr = r * (sn < 0 ? 1 - 0.18 * -sn : 1);
        this.pos[q] = this.px[i] + nx * rr;
        this.pos[q + 1] = this.py[i] + ny * rr;
        this.pos[q + 2] = this.pz[i] + nz * rr;
        this.nor[q] = nx;
        this.nor[q + 1] = ny;
        this.nor[q + 2] = nz;
        const bel = sn < -0.35 ? 1 : 0, C = bel ? this.cBelly : this.cBody;
        this.col[q] = C.r;
        this.col[q + 1] = C.g;
        this.col[q + 2] = C.b;
      }
      // la cresta: una aleta cada dos anillos, de pie en el lomo e inclinada hacia la cola
      if (i % 2 === 0 && i > 1 && i < R - 2) {
        this.v.copy(this.up).multiplyScalar(0.9).addScaledVector(this.t, 0.7).normalize();
        this.setFin(fi++, i, this.v, r * 1.5 + 0.05 * o.hs);
      }
      // las patas: dos delante y dos detrás, a los lados de la barriga, dando zarpazos al aire
      const leg = i === Math.round(R * 0.2) ? 0 : i === Math.round(R * 0.55) ? 2 : -1;
      if (leg >= 0)
        for (const s2 of [-1, 1]) {
          const L = this.legs[leg + (s2 > 0 ? 1 : 0)];
          L.position.set(this.px[i] + this.side.x * s2 * r * 0.8 - this.up.x * r * 0.4, this.py[i] + this.side.y * s2 * r * 0.8 - this.up.y * r * 0.4, this.pz[i] + this.side.z * s2 * r * 0.8 - this.up.z * r * 0.4);
          this.m4.makeBasis(this.side, this.up, this.t);
          L.quaternion.setFromRotationMatrix(this.m4);
          L.rotateX(-0.6 + Math.sin(w * 3 + leg + s2) * 0.35);
          L.rotateZ(s2 * 0.5);
          L.scale.setScalar(r / (THICK * o.hs) + 0.25);
        }
    }
    // el penacho de la cola: dos aletas grandes abiertas
    const e = R - 2;
    this.t.set(this.px[R - 1] - this.px[e], this.py[R - 1] - this.py[e], this.pz[R - 1] - this.pz[e]).normalize();
    for (const s2 of [-1, 1]) {
      this.v.copy(this.t).multiplyScalar(0.8).addScaledVector(this.side, s2 * 0.7).addScaledVector(this.up, 0.3).normalize();
      this.setFin(fi++, R - 1, this.v, o.hs * 0.9);
    }
    this.fins.count = fi;
    this.fins.instanceMatrix.needsUpdate = true;
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.normal as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as BufferAttribute).needsUpdate = true;
  }

  // una aleta en el anillo i, apuntando hacia `dir`, de alto `h` (m); su cara, de lado al cuerpo
  private setFin(n: number, i: number, dir: Vector3, h: number): void {
    const x = this.sc.copy(this.side), z = this.v2.copy(x).cross(dir).normalize();
    x.copy(dir).cross(z).normalize();
    this.m4.makeBasis(x, dir, z);
    this.q.setFromRotationMatrix(this.m4);
    this.m4.compose(this.v3.set(this.px[i], this.py[i], this.pz[i]).addScaledVector(this.up, this.radius[i] * 0.7), this.q, this.v4.set(h, h, h));
    this.fins.setMatrixAt(n, this.m4);
  }
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly v4 = new Vector3();
}
