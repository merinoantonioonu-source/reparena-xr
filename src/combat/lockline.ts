/**
 * La diana, como en RepArena (src/78_lockline.js): al enemigo apuntado le salen líneas de enfoque del manga, un anillo de
 * rayas cortas a su alrededor que se ajusta a su postura (si levanta los brazos o se agacha), gira despacio, corre hacia
 * fuera y ondula. Son tiras planas de cara a ti (las dianas pegadas a la silueta, con stencil y copias de la figura,
 * dejaban en las gafas planos de basura blancos y azules). Solo se dibuja en los apuntados.
 */
import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from '@iwsdk/core';
import type { Bone } from '@iwsdk/core';
import type { Target } from '../input/target.js';

/** Un enemigo con diana: su centro y el modelo de donde salen sus huesos. */
export interface LockTarget extends Target {
  readonly root: Object3D;
}

const RAYS = 26;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// la raya: roja, en punta por dentro y gruesa por fuera, con el centro claro (se ve sobre cualquier fondo)
function rayTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 16;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#ff3a2e';
  c.beginPath();
  c.moveTo(0, 6);
  c.lineTo(120, 0);
  c.quadraticCurveTo(128, 8, 120, 16);
  c.lineTo(0, 10);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffd0c4';
  c.beginPath();
  c.moveTo(20, 7.5);
  c.lineTo(112, 5);
  c.quadraticCurveTo(117, 8, 112, 11);
  c.lineTo(20, 8.5);
  c.closePath();
  c.fill();
  return new CanvasTexture(cv);
}

interface Ring {
  g: Group;
  rays: { m: Mesh; a: number; ph: number; sp: number }[];
  bones: Object3D[];
  t: number;
  r: [number, number, number, number];
}

export class LockLines {
  readonly group = new Group();
  private mat: MeshBasicMaterial | null = null;
  private geo: PlaneGeometry | null = null;
  private rings = new Map<LockTarget, Ring>();
  private on = new Set<LockTarget>();
  private c = new Vector3();
  private v = new Vector3();
  private right = new Vector3();

  /** Este enemigo está apuntado en este fotograma. */
  show(e: LockTarget): void {
    if (e.alive) this.on.add(e);
  }

  private make(e: LockTarget): Ring {
    this.mat ??= new MeshBasicMaterial({ map: rayTexture(), transparent: true, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide });
    this.geo ??= new PlaneGeometry(1, 1).translate(0.5, 0, 0); // (desde su punta de dentro)
    const g = new Group(), rays: Ring['rays'] = [];
    for (let i = 0; i < RAYS; i++) {
      const m = new Mesh(this.geo, this.mat);
      m.renderOrder = 45;
      m.raycast = () => {};
      g.add(m);
      rays.push({ m, a: ((i + Math.random() * 0.5) / RAYS) * TAU, ph: Math.random(), sp: 0.7 + Math.random() * 0.6 });
    }
    g.visible = false;
    this.group.add(g);
    // el marco del enemigo sale de sus huesos (sin los de control)
    const bones: Object3D[] = [];
    e.root.traverse((o) => {
      if ((o as Bone).isBone && !/ik|pole|target|ctrl|root/i.test(o.name || '')) bones.push(o);
    });
    return { g, rays, bones, t: -1, r: [0, 0, 0, 0] };
  }

  /** Cada fotograma, después de marcar los apuntados: enseña su diana y la quita a los demás. eye: la cabeza. */
  step(dt: number, eye: Vector3): void {
    for (const e of this.on) if (!this.rings.has(e)) this.rings.set(e, this.make(e));
    for (const [e, R] of this.rings) {
      const show = this.on.has(e) && e.alive && !!e.root.parent;
      R.g.visible = show;
      if (show) this.ray(e, R, dt, eye);
      else R.t = -1;
      if (!show && (!e.alive || !e.root.parent)) {
        this.group.remove(R.g);
        this.rings.delete(e);
      }
    }
    this.on.clear();
  }

  // el marco visto desde ti (suavizado) y las rayas: un marco de al menos 32 cm, rayas de 12 a 30 cm, y ondulan (el anillo
  // gira y respira, y cada raya cabecea y va y viene a su ritmo)
  private ray(e: LockTarget, R: Ring, dt: number, eye: Vector3): void {
    const c = e.center(this.c), rt = this.right.set(eye.z - c.z, 0, c.x - eye.x).normalize(); // (la derecha, vista desde ti)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const b of R.bones) {
      const p = b.getWorldPosition(this.v), x = (p.x - c.x) * rt.x + (p.z - c.z) * rt.z, y = p.y - c.y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x0 > x1) {
      x0 = -0.3;
      x1 = 0.3;
      y0 = -0.5;
      y1 = 0.5;
    }
    const H = y1 - y0, mx = R.bones.length ? 0.12 + 0.18 * H : 0.06, my = R.bones.length ? 0.1 + 0.1 * H : 0.06; // (los huesos van por dentro: la cabeza y las manos sobresalen)
    x0 -= mx;
    x1 += mx;
    y0 -= my;
    y1 += my;
    if (R.t < 0) {
      R.t = 0;
      R.r[0] = x0;
      R.r[1] = x1;
      R.r[2] = y0;
      R.r[3] = y1;
    }
    R.t += dt;
    const a = Math.min(1, dt * 10), F = R.r;
    F[0] += (x0 - F[0]) * a;
    F[1] += (x1 - F[1]) * a;
    F[2] += (y0 - F[2]) * a;
    F[3] += (y1 - F[3]) * a;
    const g = R.g;
    g.position.copy(c).addScaledVector(rt, (F[0] + F[1]) / 2);
    g.position.y += (F[2] + F[3]) / 2;
    g.lookAt(eye.x, g.position.y, eye.z); // (de cara a ti y siempre derecha)
    const hw = Math.max(0.32, (F[1] - F[0]) / 2), hh = Math.max(0.32, (F[3] - F[2]) / 2), t = R.t;
    const L = clamp(Math.min(hw, hh) * 0.6, 0.12, 0.3), W = Math.max(0.035, L * 0.4), spin = t * 0.6, br = 1 + 0.06 * Math.sin(t * 3.2);
    for (const U of R.rays) {
      const k = (t * 0.9 * U.sp + U.ph) % 1, ang = U.a + spin + 0.16 * Math.sin(t * 2.6 + U.a * 3), ca = Math.cos(ang), sa = Math.sin(ang);
      const out = br * (1.0 + 0.4 * k) + 0.05 * Math.sin(t * 5 + U.a * 5), len = L * Math.sin(Math.PI * k) + 0.001;
      U.m.position.set(ca * hw * out, sa * hh * out, 0);
      U.m.rotation.z = Math.atan2(sa * hh, ca * hw) + 0.22 * Math.sin(t * 6 + U.ph * TAU);
      U.m.scale.set(len, W * (0.8 + 0.4 * Math.sin(Math.PI * k)), 1);
    }
  }

  /** Quita todas (al acabar la ronda). */
  clear(): void {
    for (const R of this.rings.values()) this.group.remove(R.g);
    this.rings.clear();
    this.on.clear();
  }
}
