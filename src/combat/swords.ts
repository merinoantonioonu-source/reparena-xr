/**
 * Las espadas en Combate (de RepArena: src/76_sword.js; elegido por el usuario: «sí, como en RepArena»): una o dos, en los
 * mandos (con las manos desnudas no hay espada), metálica o láser. Lo que decide, en src/combat/sword-logic.ts; aquí, lo
 * que se ve, se oye y se nota: la hoja en la mano del mando (la mano la empuña: los dedos, cerrados en la empuñadura), su
 * filo que brilla con la carga, el silbido del tajo, el choque de las dos hojas (sólidas: no se atraviesan), los tajos a los enemigos y la marca del bloqueo.
 *
 * Diseñadas para el estilo Cómic: la hoja de acero, de rombo con su nervio, con colores claros; la láser, un haz de luz del
 * color de esa mano (azul la izquierda, naranja la derecha).
 */
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, Quaternion, Vector3, type Object3D } from '@iwsdk/core';
import { loopSound, SND, type SoundLoop } from '../audio/sound.js';
import { throwTarget } from '../input/throw.js';
import { hands, head, SIDES, type Side } from '../input/hand-model.js';
import { haptic } from '../input/hand-system.js';
import { WEAPON_GRIP } from '../input/skin-hand.js';
import { fistFrame } from '../input/controller-hand.js';
import { comicPatch } from '../style/comic.js';
import { BLADE_N, BLOCK_Z, BladeContact, SwordThrow, bladeBase, blockHolds, cutOf, HIT_COOL, pickZone, PUSH_MAX, pushAngle, segSeg, SwordCharge, swordLen, type BlockZone } from './sword-logic.js';
import type { FoeTarget } from './enemies.js';

const SWORD_COL: Record<Side, number> = { left: 0x4aa8ff, right: 0xff7a2a };

/** Lo que pone la partida: las espadas que se llevan, el tipo, la velocidad del corte, el bloqueo y cómo dar el golpe. */
export interface SwordEnv {
  /** Las manos con espada (ninguna: sin espadas). */
  sides: readonly Side[];
  laser: boolean;
  minSpeed: number;
  block: boolean;
  /** Tu altura de pie (m, la cabeza) y lo que baja la sentadilla (m): para la marca y para agacharte. */
  standY: number;
  squat: number;
  /** En plena oleada (solo entonces se corta y se para). */
  playing: boolean;
  targets: readonly FoeTarget[];
  /** El tajo le da: con su daño, hacia dónde iba la hoja y dónde. */
  hit(t: FoeTarget, dmg: number, dir: Vector3, perfect: boolean, at: Vector3): void;
  sparks(p: Vector3, n: number, hex: number, speed?: number): void;
  flash(p: Vector3, hex: number, size: number): void;
  say(text: string, color: string, secs: number): void;
  /** Un bloqueo: sus puntos y su combo. */
  blocked(at: Vector3): void;
  /** Hacia dónde mira tu cuerpo (horizontal): el lanzamiento va hacia delante. */
  fwd: Vector3;
  /** El rayo lanzado con la espada: desde la punta, hacia el gesto, al enemigo con su daño. */
  bolt(side: Side, from: Vector3, dir: Vector3, to: FoeTarget, dmg: number, perfect: boolean): void;
}

/** Los filamentos de la hoja cargada: cuántos arcos, de cuántos tramos, cada cuánto cambian (s) y su color. */
const ARC_N = 5, ARC_SEG = 7, ARC_DT = 0.05;
const ARC_COL: Record<Side, number> = { left: 0x5ff0ff, right: 0xb98cff };

// la hoja de acero (RepArena: bladeGeo): sección de rombo con una cara central plana y biseles hasta cada filo, que se
// estrecha poco a poco y acaba en una punta centrada; z0, la guarda; la hoja sale por −Z
function bladeGeo(L: number, z0: number): BufferGeometry {
  const N = 14, P: number[] = [], Nn: number[] = [], st: { z: number; w: number; t: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, tip = Math.max(0, (k - 0.86) / 0.14), w = 0.023 * (1 - 0.18 * k) * Math.sqrt(Math.max(0, 1 - tip * tip)), t = 0.0042 * (1 - 0.3 * k) * (1 - tip);
    st.push({ z: z0 - L * k, w, t });
  }
  const a1 = new Vector3(), a2 = new Vector3(), n = new Vector3();
  const tri = (a: Vector3, b: Vector3, c: Vector3): void => {
    n.crossVectors(a1.subVectors(b, a), a2.subVectors(c, a)).normalize();
    for (const v of [a, b, c]) {
      P.push(v.x, v.y, v.z);
      Nn.push(n.x, n.y, n.z);
    }
  };
  const ring = (s: { z: number; w: number; t: number }): Vector3[] => {
    const c = s.w * 0.5;
    return [new Vector3(s.w, 0, s.z), new Vector3(c, s.t, s.z), new Vector3(-c, s.t, s.z), new Vector3(-s.w, 0, s.z), new Vector3(-c, -s.t, s.z), new Vector3(c, -s.t, s.z)];
  };
  for (let i = 0; i < N; i++) {
    const a = ring(st[i]), b = ring(st[i + 1]);
    for (let j = 0; j < 6; j++) {
      const j2 = (j + 1) % 6;
      tri(a[j], b[j], b[j2]);
      tri(a[j], b[j2], a[j2]);
    }
  }
  const base = ring(st[0]);
  for (let j = 1; j < 5; j++) tri(base[0], base[j + 1], base[j]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(Nn), 3));
  return g;
}

const std = (color: number, rough = 0.4): MeshStandardMaterial => {
  const m = new MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  comicPatch(m);
  return m;
};
const glowMat = (color: number, opacity: number): MeshBasicMaterial => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });

/** Una espada: la de acero y la láser (se ve la del ajuste), sus puntos de la hoja y cómo se mueve. */
interface Blade {
  side: Side;
  g: Group;
  metal: Group;
  laser: Group;
  edge: MeshBasicMaterial;
  beam: MeshBasicMaterial;
  /** La hoja de acero (se tiñe del color de la mano con la carga), los filamentos eléctricos y el lanzamiento. */
  steel: MeshStandardMaterial;
  arcs: Mesh;
  arcMat: MeshBasicMaterial;
  arcT: number;
  sparkT: number;
  throwW: SwordThrow;
  halo: MeshBasicMaterial;
  prev: Vector3[];
  cur: Vector3[];
  had: boolean;
  speed: number;
  arm: number;
  vel: Vector3;
  hp: Vector3;
  swishT: number;
  glow: number;
  hitCool: Map<FoeTarget, number>;
}

/** Lo que se ve de una marca de bloqueo (una por enemigo que golpea; tiras planas de cara a ti). */
interface Mark {
  t: FoeTarget | null;
  zone: BlockZone;
  m: Mesh;
  coverT: number;
  cover: Side | null;
  coverNow: boolean;
}

export class Swords {
  readonly root = new Group();
  readonly charge = new SwordCharge(1);
  private readonly blades: Record<Side, Blade>;
  private readonly marks: Mark[] = [];
  private readonly dazed = new Map<FoeTarget, number>();
  private clock = 0;
  private clashT = 0;
  private hintT = 0;
  private beatT = 0;
  private env: SwordEnv | null = null;
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly ca = new Vector3();
  private readonly cb = new Vector3();
  private readonly hp = new Vector3();
  private readonly touch = new BladeContact();
  private readonly axis = new Vector3();
  private readonly rq = new Quaternion();
  private readonly fp = new Vector3();
  private readonly fq = new Quaternion();
  private touching = false;
  private hum: SoundLoop | null = null;
  private readonly steel0 = new Color(0xdfe5ec);
  private readonly tint = new Color();
  private readonly td = new Vector3();

  constructor() {
    this.blades = { left: this.make('left'), right: this.make('right') };
    const tex = markTexture();
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false, side: DoubleSide }));
      m.renderOrder = 22;
      m.visible = false;
      m.userData.noInk = true;
      this.root.add(m);
      this.marks.push({ t: null, zone: 'high', m, coverT: -9, cover: null, coverNow: false });
    }
  }

  // la espada de una mano: la de acero (hoja, guarda dorada, empuñadura de cuero y pomo; filos que brillan con carga) y la láser
  // (empuñadura con anillos y el haz del color de esa mano)
  private make(side: Side): Blade {
    const col = SWORD_COL[side], g = new Group(), metal = new Group(), laser = new Group();
    g.add(metal, laser);
    const L = swordLen(false), steel = std(0xdfe5ec, 0.2), blade = new Mesh(bladeGeo(L, -0.1), steel);
    metal.add(blade);
    const gold = std(0xe0b058, 0.3), box = new Mesh(new BoxGeometry(0.2, 0.022, 0.03), gold);
    box.position.z = -0.088;
    metal.add(box);
    for (const x of [-0.1, 0.1]) {
      const b = new Mesh(new SphereGeometry(0.016, 10, 8), gold);
      b.position.set(x, 0, -0.088);
      metal.add(b);
    }
    const pommel = new Mesh(new SphereGeometry(0.022, 12, 10), gold);
    pommel.position.z = 0.1;
    metal.add(pommel);
    const grip = new Mesh(new CylinderGeometry(0.019, 0.021, 0.17, 12), std(0x5a3422, 0.8));
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.003;
    metal.add(grip);
    const edge = glowMat(col, 0);
    for (const s of [-1, 1]) {
      const e = new Mesh(new BoxGeometry(0.007, 0.009, L - 0.1), edge);
      e.position.set(s * 0.021, 0, -0.1 - (L - 0.1) / 2);
      e.userData.noInk = true;
      metal.add(e);
    }
    const LL = swordLen(true), hilt = new Mesh(new CylinderGeometry(0.02, 0.022, 0.24, 14), std(0xb8bec8, 0.3));
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.01;
    laser.add(hilt);
    for (const z of [-0.08, -0.03, 0.02, 0.07]) {
      const r = new Mesh(new TorusGeometry(0.022, 0.003, 4, 16), std(0x6a7080, 0.3));
      r.position.z = z;
      laser.add(r);
    }
    const beam = glowMat(col, 0.55), halo = glowMat(col, 0.18);
    for (const [r, m] of [[0.007, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false })], [0.02, beam], [0.042, halo]] as const) {
      const b = new Mesh(new CylinderGeometry(r, r, LL, 12, 1, true), m);
      b.rotation.x = Math.PI / 2;
      b.position.z = -0.14 - LL / 2;
      b.userData.noInk = true;
      laser.add(b);
    }
    // los filamentos de la carga: arcos de luz quebrados que chisporrotean por la hoja y saltan fuera (se rehacen 20 veces
    // por segundo, sin crear nada: solo se mueven sus puntos). Cada tramo, dos cintas cruzadas con grosor (una línea de un
    // píxel apenas se veía en las gafas)
    const ag = new BufferGeometry(), nSeg = ARC_N * ARC_SEG, idx: number[] = [];
    for (let i = 0; i < nSeg; i++) {
      const b = i * 8;
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3, b + 4, b + 5, b + 6, b + 6, b + 5, b + 7);
    }
    ag.setAttribute('position', new BufferAttribute(new Float32Array(nSeg * 24), 3));
    ag.setIndex(idx);
    const arcMat = new MeshBasicMaterial({ color: ARC_COL[side], transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide });
    const arcs = new Mesh(ag, arcMat);
    arcs.frustumCulled = false;
    arcs.visible = false;
    arcs.userData.noInk = true;
    g.add(arcs);
    g.visible = false;
    this.root.add(g);
    const pts = (): Vector3[] => Array.from({ length: BLADE_N }, () => new Vector3());
    return { side, g, metal, laser, edge, beam, halo, steel, arcs, arcMat, arcT: 0, sparkT: 0, throwW: new SwordThrow(), prev: pts(), cur: pts(), had: false, speed: 0, arm: 0, vel: new Vector3(), hp: new Vector3(), swishT: 0, glow: 0, hitCool: new Map() };
  }

  /** ¿La espada de esa mano está en uso? (con el mando a la vista: con las manos desnudas no hay espada) */
  held(side: Side): boolean {
    const E = this.env;
    return !!E && E.sides.includes(side) && hands[side].ok && !hands[side].isHand;
  }

  /** Una repetición: carga las hojas (y se nota). */
  onRep(perfect: boolean, sides: readonly Side[], dmg: number = perfect ? 2 : 1): void {
    this.charge.cap = sides.length > 1 ? 2 : 1;
    this.charge.charge(perfect, dmg);
    for (const s of sides) if (this.held(s)) haptic(s, 0.3, 30);
    SND.charge();
  }

  /** Otra ronda: sin carga, sin marcas. */
  reset(): void {
    this.charge.reset();
    this.dazed.clear();
    for (const s of SIDES) {
      const B = this.blades[s];
      B.had = false;
      B.hitCool.clear();
      B.g.visible = false;
      B.throwW.reset();
      WEAPON_GRIP[s] = false;
    }
    this.hum?.stop();
    this.hum = null;
    for (const M of this.marks) {
      M.t = null;
      M.m.visible = false;
    }
  }

  /** Un fotograma. */
  update(dt: number, E: SwordEnv): void {
    this.env = E;
    this.clock += dt;
    this.clashT -= dt;
    this.hintT -= dt;
    const t = this.clock;
    for (const side of SIDES) {
      const B = this.blades[side], on = this.held(side), h = hands[side];
      B.g.visible = on;
      WEAPON_GRIP[side] = on; // (la mano que la lleva, con los dedos cerrados en la empuñadura: src/input/controller-hand.ts)
      B.metal.visible = !E.laser;
      B.laser.visible = E.laser;
      if (!on) {
        B.had = false;
        B.speed = 0;
        B.throwW.reset();
        continue;
      }
      this.place(B.g, side, h.wrist, h.wristQ);
      // los puntos de la hoja (de la guarda a la punta), los de antes y la velocidad de la punta y de la mano
      const tmp = B.prev;
      B.prev = B.cur;
      B.cur = tmp;
      for (let i = 0; i < BLADE_N; i++) this.bladePoint(B, i / (BLADE_N - 1), E.laser, B.cur[i]);
      if (!B.had) for (let i = 0; i < BLADE_N; i++) B.prev[i].copy(B.cur[i]);
      const tip = B.cur[BLADE_N - 1];
      B.vel.subVectors(tip, B.prev[BLADE_N - 1]).divideScalar(Math.max(dt, 1e-3));
      B.speed = B.speed * 0.4 + B.vel.length() * 0.6;
      const hv = B.had ? this.v.subVectors(h.wrist, B.hp).length() / Math.max(dt, 1e-3) : 0;
      B.hp.copy(h.wrist);
      B.arm = B.arm * 0.5 + hv * 0.5;
      B.had = true;
      // el silbido al cortar el aire
      B.swishT -= dt;
      if (B.speed > E.minSpeed * 0.8 && B.swishT <= 0) {
        B.swishT = 0.3;
        SND.swordSwish(tip, E.laser, B.speed);
      }
      // la carga: el filo brilla (o el haz se aviva)
      const want = this.charge.charged || this.dazedAny() ? 0.7 + 0.3 * Math.sin(t * 6) : 0;
      B.glow += (want - B.glow) * Math.min(1, dt * 8);
      B.edge.opacity = B.glow;
      B.beam.opacity = 0.22 + B.glow * 0.5;
      B.halo.opacity = 0.08 + B.glow * 0.14;
      // cargada, se ve distinta (pedido del usuario): la hoja se tiñe del color de su mano y la recorren filamentos eléctricos
      // que saltan fuera, con alguna chispa
      B.steel.color.lerpColors(this.steel0, this.tint.setHex(SWORD_COL[side]), B.glow * 0.45);
      this.stepArcs(B, dt, E);
      // el lanzamiento: con carga, una estocada o un lanzamiento hacia delante saca el rayo de la punta hacia un enemigo
      // fuera del alcance de la hoja (de cerca, se corta)
      if (B.throwW.step(dt, h.wrist, E.fwd, this.td) && E.playing) this.throwBolt(B, tip, E);
      for (const [e, c] of B.hitCool) if (t - c > 0.6) B.hitCool.delete(e);
    }
    // con carga, el mando zumba (una vibración suave y seguida) y suena el zumbido eléctrico
    const live = E.playing && this.charge.charged && (this.held('left') || this.held('right'));
    if (live) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 0.14;
        const k = Math.min(1, 0.07 + 0.03 * this.charge.top);
        for (const s of SIDES) if (this.held(s)) haptic(s, k, 90);
      }
      if (!this.hum) this.hum = loopSound('espada-cargada', 0.55, E.laser ? 1.15 : 1);
      const B = this.blades[this.held('right') ? 'right' : 'left'];
      this.hum?.set(B.cur[2]);
    } else if (this.hum) {
      this.hum.stop();
      this.hum = null;
    }

    if (this.held('left') && this.held('right')) this.clash();
    else this.touch.release();
    if (E.playing) for (const s of SIDES) if (this.held(s)) this.vsFoes(this.blades[s], E);
    this.stepMarks(E);
    for (const [e, until] of this.dazed) if (until < t || !e.alive) this.dazed.delete(e);
  }

  // los filamentos de la hoja cargada: arcos quebrados entre dos puntos de la hoja, algunos saltando hacia fuera
  private stepArcs(B: Blade, dt: number, E: SwordEnv): void {
    const on = B.glow > 0.25;
    B.arcs.visible = on;
    if (!on) return;
    B.arcMat.opacity = Math.min(1, B.glow * 1.3) * (0.7 + 0.3 * Math.random());
    B.arcT -= dt;
    if (B.arcT <= 0) {
      B.arcT = ARC_DT;
      const P = B.arcs.geometry.getAttribute('position') as BufferAttribute, a = P.array as Float32Array, laser = E.laser;
      const z0 = -bladeBase(laser), L = swordLen(laser), n = Math.min(ARC_N, 2 + this.charge.top), W = 0.0034;
      let k = 0;
      // (un tramo de p a q: dos cintas, una de canto en x y otra en y; los arcos de más, aplastados en un punto)
      const seg = (px: number, py: number, pz: number, qx: number, qy: number, qz: number, w: number): void => {
        for (const [ox, oy] of [[w, 0], [0, w]] as const) {
          a[k++] = px - ox; a[k++] = py - oy; a[k++] = pz;
          a[k++] = px + ox; a[k++] = py + oy; a[k++] = pz;
          a[k++] = qx - ox; a[k++] = qy - oy; a[k++] = qz;
          a[k++] = qx + ox; a[k++] = qy + oy; a[k++] = qz;
        }
      };
      for (let i = 0; i < ARC_N; i++) {
        const za = z0 - L * (0.05 + 0.85 * Math.random()), len = 0.06 + 0.2 * Math.random(), out = Math.random() < 0.65 ? 0.04 + 0.09 * Math.random() : 0;
        const ang = Math.random() * Math.PI * 2;
        let px = 0, py = 0, pz = za;
        for (let j = 1; j <= ARC_SEG; j++) {
          const f = j / ARC_SEG, bow = Math.sin(f * Math.PI) * out, r = 0.012 + 0.02 * Math.random();
          const nx = Math.cos(ang) * bow + (Math.random() - 0.5) * r, ny = Math.sin(ang) * bow + (Math.random() - 0.5) * r, nz = za - len * f;
          seg(px, py, pz, nx, ny, nz, i < n ? W * (1.2 - 0.6 * f) : 0);
          px = nx;
          py = ny;
          pz = nz;
        }
      }
      P.needsUpdate = true;
    }
    B.sparkT -= dt;
    if (B.sparkT <= 0 && E.playing) {
      B.sparkT = 0.1 + Math.random() * 0.15;
      E.sparks(B.cur[1 + Math.floor(Math.random() * (BLADE_N - 1))], 2, ARC_COL[B.side], 0.9);
    }
  }

  // el rayo lanzado con la espada (gasta su carga), al enemigo hacia el que va el gesto
  private throwBolt(B: Blade, tip: Vector3, E: SwordEnv): void {
    if (!this.charge.charged) return;
    const tg = throwTarget(tip, this.td, E.targets) as FoeTarget | null;
    if (!tg) return;
    const reach = swordLen(E.laser) + 0.6;
    if (tg.center(this.w).distanceTo(B.hp) < reach) return; // (a su alcance: es un tajo, no un lanzamiento)
    const dmg = this.charge.spend();
    E.bolt(B.side, tip, this.td, tg, dmg, this.charge.lastPerfect);
    haptic(B.side, 0.8, 60);
    E.flash(tip, ARC_COL[B.side], 0.4);
    if (!this.thrownOnce) {
      this.thrownOnce = true;
      E.say('¡Rayo de espada!', '#3cf0c6', 1);
    }
  }
  private thrownOnce = false;

  private dazedAny(): boolean {
    return this.dazed.size > 0;
  }

  // la espada en la mano: con la mano del mando a la vista, en el hueco de su puño cerrado (la empuñadura dentro de los
  // dedos, la hoja por encima del índice: src/input/controller-hand.ts); si no, en la postura del mando (la hoja por −Z)
  private place(g: Object3D, side: Side, p: Vector3, q: Quaternion): void {
    if (fistFrame(side, this.fp, this.fq)) {
      g.position.copy(this.fp).applyQuaternion(q).add(p);
      g.quaternion.multiplyQuaternions(q, this.fq);
    } else {
      g.position.copy(p);
      g.quaternion.copy(q);
    }
    g.updateMatrixWorld(true);
  }
  private bladePoint(B: Blade, k: number, laser: boolean, out: Vector3): Vector3 {
    return B.g.localToWorld(out.set(0, 0, -bladeBase(laser) - swordLen(laser) * k));
  }

  // las dos hojas, sólidas: si se tocan o se han cruzado, cada una gira sobre su mano hacia su lado hasta quedar apoyada en
  // la otra (src/combat/sword-logic.ts, BladeContact); al llegar deprisa, el choque (sonido, chispas y vibración) y, mientras
  // se empujan, un roce suave en los mandos
  private clash(): void {
    const A = this.blades.left, B = this.blades.right, E = this.env!, C = this.touch;
    const n = BLADE_N - 1;
    if (!C.step(A.cur[0], A.cur[n], B.cur[0], B.cur[n])) {
      this.touching = false;
      return;
    }
    const la = this.v.subVectors(C.pa, A.g.position).length(), lb = this.w.subVectors(C.pb, B.g.position).length();
    const aa = pushAngle(C.pen / 2, la), ab = pushAngle(C.pen / 2, lb);
    if (aa > PUSH_MAX || ab > PUSH_MAX) {
      // (las manos, muy cruzadas: se dejan pasar)
      C.release();
      this.touching = false;
      return;
    }
    this.turn(A, C.pa, C.n, aa);
    this.turn(B, C.pb, this.hp.copy(C.n).negate(), ab);
    for (const X of [A, B]) for (let i = 0; i < BLADE_N; i++) this.bladePoint(X, i / (BLADE_N - 1), E.laser, X.cur[i]);
    const rel = this.v.subVectors(A.vel, B.vel).length(), p = this.hp.addVectors(C.pa, C.pb).multiplyScalar(0.5);
    if (!this.touching && rel > 0.8 && this.clashT <= 0) {
      this.clashT = 0.25;
      SND.swordClang(p, E.laser, rel);
      E.sparks(p, E.laser ? 16 : 22, E.laser ? 0x9fe0ff : 0xffc05a, 2.5);
      haptic('left', 0.8, 50);
      haptic('right', 0.8, 50);
    } else if (this.clashT <= 0) {
      // (apoyadas y empujando: un roce, con alguna chispa si se deslizan)
      this.clashT = 0.12;
      haptic('left', 0.2, 25);
      haptic('right', 0.2, 25);
      if (rel > 0.5) E.sparks(p, 3, E.laser ? 0x9fe0ff : 0xffc05a, 1);
    }
    this.touching = true;
  }

  // gira la hoja sobre la mano para que su punto `at` vaya hacia `dir` el ángulo `ang`
  private turn(X: Blade, at: Vector3, dir: Vector3, ang: number): void {
    this.axis.subVectors(at, X.g.position).cross(dir);
    if (this.axis.lengthSq() < 1e-8) return;
    this.rq.setFromAxisAngle(this.axis.normalize(), ang);
    X.g.quaternion.premultiply(this.rq);
    X.g.updateMatrixWorld(true);
  }

  // los tajos: cada punto de la hoja barre desde el fotograma anterior; el enemigo es una cápsula de pie
  private vsFoes(B: Blade, E: SwordEnv): void {
    const t = this.clock;
    for (const e of E.targets) {
      if (!e.alive || e.flyer) continue;
      const r = e.root.position, c = e.center(this.w), rad = Math.max(0.3, e.radius * 1.1);
      this.ca.set(r.x, r.y + 0.2, r.z);
      this.cb.set(r.x, Math.max(c.y + (c.y - r.y) * 0.6, r.y + 0.8), r.z);
      let hit = false;
      for (let i = 1; i < BLADE_N && !hit; i++) if (segSeg(B.prev[i], B.cur[i], this.ca, this.cb, this.hp) < rad) hit = true;
      if (!hit) continue;
      const last = B.hitCool.get(e);
      if (last !== undefined && t - last < HIT_COOL) continue;
      B.hitCool.set(e, t);
      const p = this.hp, kind = cutOf(B.speed, B.arm, E.minSpeed, this.charge.charged, (this.dazed.get(e) ?? -1) > t);
      if (kind === 'graze') {
        haptic(B.side, 0.25, 20);
        E.sparks(p, 3, 0xffcc80, 0.8);
        SND.swordClang(p, E.laser, 0.6);
        if (this.hintT <= 0) {
          this.hintT = 2.5;
          E.say('¡Más rápido! Un tajo amplio', '#ff8a3d', 1);
        }
      } else if (kind === 'bounce') {
        haptic(B.side, 0.6, 40);
        E.sparks(p, 10, 0xffb050, 2);
        SND.swordClang(p, E.laser, B.speed);
        if (this.hintT <= 0) {
          this.hintT = 2.5;
          E.say('Sin carga: ¡haz una repetición!', '#ff8a3d', 1.1);
        }
      } else {
        // el golpe (el contraataque, el doble y sin gastar carga)
        const counter = kind === 'counter', dmg = counter ? 4 : this.charge.spend();
        haptic(B.side, Math.min(1, 0.45 + B.speed * 0.1), 80);
        SND.swordHit(p, E.laser);
        E.sparks(p, 22, E.laser ? 0x9fe0ff : 0xffb84a, 3);
        E.flash(p, E.laser ? 0x9fe0ff : 0xffd9a0, 0.5);
        if (counter) {
          this.dazed.delete(e);
          E.say('¡CONTRAATAQUE!', '#ffd166', 0.9);
        }
        E.hit(e, dmg, B.vel, counter || this.charge.lastPerfect, p);
      }
    }
  }

  // ---------------------------------------------------------------- el bloqueo (lo llama el enemigo al golpear)

  /** El enemigo empieza a preparar el golpe: marca a qué altura irá (con «Bloquear los golpes»). */
  blockStart(t: FoeTarget): void {
    const E = this.env;
    if (!E || !E.block || !E.playing || !E.sides.some((s) => this.held(s))) return;
    const M = this.marks.find((m) => m.t === t) ?? this.marks.find((m) => !m.t);
    if (!M) return;
    M.t = t;
    M.zone = pickZone(Math.random());
    M.coverT = -9;
    M.cover = null;
    M.coverNow = false;
    M.m.visible = true;
    const Z = BLOCK_Z[M.zone];
    (M.m.material as MeshBasicMaterial).color.setHex(Z.col);
    E.say(Z.txt, '#' + Z.col.toString(16).padStart(6, '0'), 1);
  }

  /** Llega el golpe: ¿lo para la espada? (entonces queda aturdido: el contraataque hace el doble) */
  blockStrike(t: FoeTarget): boolean {
    const M = this.marks.find((m) => m.t === t), E = this.env;
    if (!M || !E) return false;
    M.t = null;
    M.m.visible = false;
    if (!M.cover || !blockHolds(this.clock, M.coverT)) return false;
    const p = this.markAt(t, M.zone, this.v);
    SND.swordBlock(p, E.laser);
    E.sparks(p, 30, E.laser ? 0x9fe0ff : 0xffc05a, 3);
    E.flash(p, 0xfff0c0, 0.6);
    haptic(M.cover, 1, 80);
    haptic(M.cover === 'left' ? 'right' : 'left', 0.4, 40);
    this.dazed.set(t, this.clock + 1.6);
    E.say('¡BLOQUEADO! Contraataca', '#3cf0c6', 1.2);
    E.blocked(p);
    return true;
  }

  // dónde se para el golpe: entre tú y él, a la altura marcada (respecto a tu altura de pie)
  private markAt(t: FoeTarget, z: BlockZone, out: Vector3): Vector3 {
    const E = this.env!, r = t.root.position, dx = r.x - head.p.x, dz = r.z - head.p.z, d = Math.hypot(dx, dz) || 1;
    return out.set(head.p.x + (dx / d) * 0.5, E.standY + BLOCK_Z[z].dy, head.p.z + (dz / d) * 0.5);
  }

  // cada fotograma: las marcas, de cara a ti, latiendo; turquesa con la hoja en ella (y la postura pedida)
  private stepMarks(E: SwordEnv): void {
    for (const M of this.marks) {
      if (!M.t) continue;
      if (!M.t.alive || !E.playing) {
        M.t = null;
        M.m.visible = false;
        continue;
      }
      const p = this.markAt(M.t, M.zone, this.v), s = 0.38 + 0.08 * Math.sin(this.clock * 14), Z = BLOCK_Z[M.zone];
      M.m.position.copy(p);
      M.m.quaternion.copy(head.q);
      M.m.scale.setScalar(s);
      const low = !Z.crouch || head.p.y < E.standY - Z.crouch * E.squat;
      let cover: Side | null = null;
      for (const side of SIDES) {
        if (!this.held(side)) continue;
        const B = this.blades[side];
        let near = false;
        for (let i = 1; i < BLADE_N; i++) if (B.cur[i].distanceTo(p) < 0.25) near = true;
        if (!near) continue;
        if (!low) {
          if (this.hintT <= 0) {
            this.hintT = 1.2;
            E.say('¡Agáchate para parar el golpe!', '#ff8a3d', 0.9);
          }
          continue;
        }
        cover = side;
        break;
      }
      if (cover) {
        if (!M.coverNow) haptic(cover, 0.3, 30);
        M.cover = cover;
        M.coverT = this.clock;
      }
      M.coverNow = !!cover;
      (M.m.material as MeshBasicMaterial).color.setHex(cover ? 0x3cf0c6 : Z.col);
    }
  }
}

// la marca del bloqueo: un aro con una raya (de un color que cambia)
function markTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.strokeStyle = '#fff';
  x.lineWidth = 10;
  x.beginPath();
  x.arc(64, 64, 48, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 6;
  x.beginPath();
  x.moveTo(24, 64);
  x.lineTo(104, 64);
  x.stroke();
  return new CanvasTexture(c);
}
