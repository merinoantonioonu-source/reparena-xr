/**
 * Las alas de planear (pedido del usuario: al abrir los brazos sobre un barranco, que se vean unas alas a los lados, donde
 * están las manos, para sentir el planeo): un abanico de plumas de luz que sale de cada hombro, sigue el brazo hasta pasada
 * la mano y cuelga hacia abajo y algo atrás; ondean un poco con el aire y aparecen y se apagan suaves. No son un modelo (no hay de alas):
 * son luz, como las estelas del turbo, con una pluma dibujada una vez en una textura.
 *
 * Siguen a las muñecas que se ven; una que las gafas pierden con los brazos abiertos se pone en cruz a la altura del hombro.
 * Todo hecho al empezar: cada fotograma solo se mueven los vértices (sin crear nada).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, RGBAFormat, UnsignedByteType, Vector3 } from '@iwsdk/core';
import { warmKeep } from '../../style/warm.js';

/** Las plumas de cada ala, de dónde a dónde del brazo salen (0 el hombro, 1 la punta pasada la mano) y su largo (m). */
const N = 12, ROOT = 0.08, LEN0 = 0.28, LEN1 = 0.62;
/** Lo que pasa la punta del ala de la mano (m), dónde va el hombro respecto a los ojos (m) y lo que tarda en abrirse (s). */
const PAST_HAND = 0.4, SH_X = 0.18, SH_Y = 0.24, FADE_T = 0.35;
/** El color de la luz y lo opaca que es abierta del todo. */
const COL = 0xbdf3ff, MAX_A = 0.85;

/** Una muñeca tal como la ve el juego (si se ve y dónde). */
export interface WingHand {
  ok: boolean;
  x: number;
  y: number;
  z: number;
}

/** La pluma: alargada, con el cañón en medio más brillante, borde suave y la punta que se desvanece. */
function featherTex(): DataTexture {
  const W = 32, H = 128, d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1), half = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.55) * (1 - 0.35 * v);
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W - 0.5), edge = Math.max(0, Math.min(1, (half - u) / 0.08)), rachis = Math.max(0, 1 - u / 0.04) * (1 - v * 0.7);
      // (barbas: rayitas finas en diagonal, como en una pluma de verdad)
      const barb = 0.75 + 0.25 * Math.sin((u * 3 - v) * 90);
      const a = Math.min(1, edge * (0.55 * barb + 0.45 * rachis) * (1 - Math.pow(v, 3)));
      d.set([255, 255, 255, Math.round(255 * a)], (y * W + x) * 4);
    }
  }
  const t = new DataTexture(d, W, H, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

class Wing {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly wrist = new Vector3();
  constructor(
    mat: MeshBasicMaterial,
    readonly side: -1 | 1,
  ) {
    const g = new BufferGeometry(), pos = new Float32Array(N * 4 * 3), uv = new Float32Array(N * 4 * 2), idx: number[] = [];
    for (let i = 0; i < N; i++) {
      uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
    }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.pos = pos;
    this.mesh = new Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.userData.noInk = true;
  }

  /** Coloca las plumas: del hombro `sh` por el brazo hasta pasada la muñeca; cuelgan hacia `back` (abajo y algo atrás). */
  set(sh: Vector3, h: WingHand, right: Vector3, back: Vector3, t: number, tmp: Vector3[]): void {
    const [arm, , base, dir, side] = tmp;
    // la muñeca (o, perdida, el brazo en cruz)
    if (h.ok) this.wrist.set(h.x, h.y, h.z);
    else this.wrist.copy(sh).addScaledVector(right, this.side * 0.6);
    arm.subVectors(this.wrist, sh);
    const L = Math.max(0.3, arm.length());
    arm.normalize();
    const total = L + PAST_HAND;
    side.crossVectors(arm, back).normalize(); // (el ancho de cada pluma: a lo largo del brazo)
    for (let i = 0; i < N; i++) {
      const k = ROOT + (1 - ROOT) * (i / (N - 1)), len = LEN0 + (LEN1 - LEN0) * Math.pow(k, 0.8);
      base.copy(sh).addScaledVector(arm, total * k);
      // cada pluma, hacia atrás; las de la punta se abren hacia fuera (el abanico) y todas ondean un poco con el aire
      const wave = 0.07 * Math.sin(t * 5.5 + i * 0.7);
      dir.copy(back).addScaledVector(arm, 0.9 * k * k).normalize();
      dir.y += wave - 0.05 * k;
      dir.normalize();
      const w = 0.045 + 0.03 * k, o = i * 12, P = this.pos;
      // (las cuatro esquinas: la raíz, a lo ancho; la punta, a lo ancho)
      P[o] = base.x - side.x * w;
      P[o + 1] = base.y - side.y * w;
      P[o + 2] = base.z - side.z * w;
      P[o + 3] = base.x + side.x * w;
      P[o + 4] = base.y + side.y * w;
      P[o + 5] = base.z + side.z * w;
      P[o + 6] = base.x + dir.x * len - side.x * w * 0.6;
      P[o + 7] = base.y + dir.y * len - side.y * w * 0.6;
      P[o + 8] = base.z + dir.z * len - side.z * w * 0.6;
      P[o + 9] = base.x + dir.x * len + side.x * w * 0.6;
      P[o + 10] = base.y + dir.y * len + side.y * w * 0.6;
      P[o + 11] = base.z + dir.z * len + side.z * w * 0.6;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

export class Wings {
  readonly group = new Group();
  private readonly mat: MeshBasicMaterial;
  private readonly wings: Wing[];
  private a = 0;
  private t = 0;
  private readonly sh = new Vector3();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly back = new Vector3();
  private readonly tmp = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];

  constructor() {
    this.mat = new MeshBasicMaterial({ color: COL, map: featherTex(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false });
    this.wings = [new Wing(this.mat, -1), new Wing(this.mat, 1)];
    for (const w of this.wings) this.group.add(w.mesh);
    this.group.visible = false;
    warmKeep(new Mesh(this.wings[0].mesh.geometry, this.mat));
  }

  /** Cada fotograma: `on`, planeando; la cabeza (dónde y hacia dónde mira) y las dos muñecas. */
  update(dt: number, on: boolean, head: Vector3, fwd: Vector3, l: WingHand, r: WingHand): void {
    this.a = Math.max(0, Math.min(1, this.a + (on ? dt : -dt) / FADE_T));
    this.group.visible = this.a > 0.01;
    if (!this.group.visible) return;
    this.t += dt;
    this.mat.opacity = MAX_A * this.a * (0.9 + 0.1 * Math.sin(this.t * 7));
    // hacia dónde miras, sin la inclinación: los hombros, a los lados y algo por debajo de los ojos; las plumas, hacia atrás
    this.fwd.set(fwd.x, 0, fwd.z);
    if (this.fwd.lengthSq() < 1e-4) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    // (las plumas cuelgan sobre todo hacia abajo y algo hacia atrás: hacia atrás del todo, ni se verían al mirarte los brazos)
    this.back.copy(this.fwd).multiplyScalar(-0.45);
    this.back.y = -0.9;
    this.back.normalize();
    // (al abrirse, crecen desde los hombros)
    const grow = 0.4 + 0.6 * this.a;
    for (const w of this.wings) {
      this.sh.copy(head).addScaledVector(this.right, w.side * SH_X).addScaledVector(this.fwd, -0.06);
      this.sh.y -= SH_Y;
      const h = w.side < 0 ? l : r;
      w.set(this.sh, h, this.right, this.back, this.t, this.tmp);
      if (grow < 1) {
        // (encoge hacia el hombro: se mueven los vértices, no la malla, que va en coordenadas del mundo)
        const P = (w.mesh.geometry.attributes.position as BufferAttribute).array as Float32Array;
        for (let i = 0; i < P.length; i += 3) {
          P[i] = this.sh.x + (P[i] - this.sh.x) * grow;
          P[i + 1] = this.sh.y + (P[i + 1] - this.sh.y) * grow;
          P[i + 2] = this.sh.z + (P[i + 2] - this.sh.z) * grow;
        }
      }
    }
  }
}
