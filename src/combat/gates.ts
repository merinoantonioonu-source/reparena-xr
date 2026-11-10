/**
 * Las compuertas de la arena (RepArena, src/30_env.js: updateGates y gateSolids). Cada una, un objeto de escena «gate»
 * (src/scene-assets/gate.scene-asset.ts) con el componente Gate, colocado en la escena.
 *  - Se abre cuando sale un zombi (las puertas se deslizan 1,25 m a los lados) y, cuando ya no la usa nadie, se cierra.
 *  - Abierta, la baliza gira y echa sus haces rojos; cerrada, se apaga.
 *  - Es sólida con la física de IWSDK: los pilares, los bloques de los lados y el túnel, cuerpos fijos; las puertas,
 *    cuerpos que se mueven con ellas. Y los zombis la rodean (Obstacle), como las cajas y las rocas.
 *  - Al abrirse, suena y echa vapor a los lados.
 */
import { createSystem, Entity, Group, Mesh, MeshBasicMaterial, Object3D, PhysicsBody, PhysicsShape, PhysicsShapeType, PhysicsState, PhysicsSystem, Quaternion, Vector3 } from '@iwsdk/core';
import { Gate, Obstacle } from './components.js';
import { SND } from '../audio/sound.js';
import { Puffs } from '../style/comic-fx.js';

/** Lo que se lleva de cada compuerta: sus piezas que se mueven y sus cuerpos de física. */
interface GateRt {
  root: Object3D;
  doorL: Object3D | null;
  doorR: Object3D | null;
  spin: Object3D | null;
  beams: MeshBasicMaterial[];
  body: MeshBasicMaterial | null;
  doors: Entity[];
  lastOpen: number;
  /** ¿Se le pidió abrirse el fotograma anterior? (al pedírselo, suena y echa vapor) */
  was: boolean;
}

// las partes sólidas, en el marco de la compuerta: [x, y, z, ancho, alto, hondo, giro y, radio para rodearla (0: no)]
const SOLIDS: [number, number, number, number, number, number, number, number][] = [
  [-1.5, 1.85, 0, 0.55, 3.7, 0.9, 0, 0.5], // pilares
  [1.5, 1.85, 0, 0.55, 3.7, 0.9, 0, 0.5],
  [-2.2, 0.6, -0.3, 1.2, 1.2, 2.2, -0.15, 1.05], // bloques de los lados
  [2.2, 0.6, -0.3, 1.2, 1.2, 2.2, 0.15, 1.05],
  [-1.25, 1.55, -0.75, 0.12, 3.1, 1.5, 0, 0], // el túnel: paredes y fondo
  [1.25, 1.55, -0.75, 0.12, 3.1, 1.5, 0, 0],
  [0, 1.55, -1.5, 2.5, 3.1, 0.12, 0, 0],
];
const DOOR = { w: 1.23, h: 3.0, d: 0.16, x: 0.62, y: 1.5, z: 0.06, slide: 1.25 };

export class GateSystem extends createSystem({ gates: { required: [Gate] } }, {}) {
  private physics!: PhysicsSystem;
  private rt = new Map<Entity, GateRt>();
  private v = new Vector3();
  private q = new Quaternion();
  private q2 = new Quaternion();
  private up = new Vector3(0, 1, 0);
  private pose = { position: new Vector3(), quaternion: new Quaternion() };
  private puffs = new Puffs();
  private sp = new Vector3();
  private sv = new Vector3();
  private gq = new Quaternion();

  /** Para las pruebas: el vapor lanzado y las bocanadas que se han visto a la vez como mucho. */
  steam(): { added: number; peak: number } {
    return { added: this.puffs.added, peak: this.puffs.peak };
  }

  init(): void {
    this.physics = this.world.getSystem(PhysicsSystem)!;
    this.world.createTransformEntity(this.puffs.group);
    this.cleanupFuncs.push(this.queries.gates.subscribe('qualify', (e) => this.setup(e)));
    for (const e of this.queries.gates.entities) this.setup(e);
  }

  // sus piezas, sus materiales propios (los haces y la baliza se encienden en cada una por su cuenta) y sus cuerpos
  private setup(e: Entity): void {
    const root = e.object3D;
    if (!root || this.rt.has(e)) return;
    root.updateMatrixWorld(true);
    const beams: MeshBasicMaterial[] = [];
    let body: MeshBasicMaterial | null = null;
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (o.name === 'beacon-beam') {
        const mat = (m.material as MeshBasicMaterial).clone();
        m.material = mat;
        beams.push(mat);
      } else if (o.name === 'beacon-body') {
        body = (m.material as MeshBasicMaterial).clone();
        m.material = body;
      }
    });
    const doors: Entity[] = [];
    for (const [x, y, z, w, h, d, ry, r] of SOLIDS) {
      const s = this.collider(root, x, y, z, ry, [w, h, d], PhysicsState.Static);
      if (r > 0) s.addComponent(Obstacle, { radius: r });
    }
    for (const sx of [-1, 1]) doors.push(this.collider(root, sx * DOOR.x, DOOR.y, DOOR.z, 0, [DOOR.w, DOOR.h, DOOR.d], PhysicsState.Kinematic));
    this.rt.set(e, { root, doorL: root.getObjectByName('door-left') ?? null, doorR: root.getObjectByName('door-right') ?? null, spin: root.getObjectByName('beacon-spin') ?? null, beams, body, doors, lastOpen: -1, was: false });
  }

  // un cuerpo de física (una caja) en (x, y, z) del marco de la compuerta
  private collider(root: Object3D, x: number, y: number, z: number, ry: number, dims: [number, number, number], state: (typeof PhysicsState)[keyof typeof PhysicsState]): Entity {
    const g = new Group();
    g.name = 'gate-solid';
    root.localToWorld(g.position.set(x, y, z));
    root.getWorldQuaternion(this.q);
    g.quaternion.copy(this.q).multiply(this.q2.setFromAxisAngle(this.up, ry));
    const s = this.world.createTransformEntity(g);
    s.addComponent(PhysicsShape, { shape: PhysicsShapeType.Box, dimensions: dims, friction: 0.5, restitution: 0.05 });
    s.addComponent(PhysicsBody, { state });
    return s;
  }

  /** Una compuerta libre (que no esté sacando a nadie), al azar; null si están todas ocupadas. */
  freeGate(): Entity | null {
    let pick: Entity | null = null, n = 0;
    for (const e of this.queries.gates.entities) {
      if ((e.getValue(Gate, 'busy') ?? 0) > 0) continue;
      n++;
      if (Math.random() * n < 1) pick = e; // (al azar entre las libres, sin crear listas)
    }
    return pick;
  }

  /** Ábrela para sacar a uno (se queda abierta secs segundos y luego se cierra sola). */
  openGate(e: Entity, secs: number): void {
    e.setValue(Gate, 'busy', secs);
    e.setValue(Gate, 'want', 1);
  }

  /** Dónde sale el zombi: dentro del túnel, en el centro (out, en el mundo). */
  spawnPoint(e: Entity, out: Vector3): Vector3 {
    const r = this.rt.get(e);
    if (!r) return out.set(0, 0, -11);
    return r.root.localToWorld(out.set(0, 0, -0.75));
  }

  /** Dónde está y hacia dónde mira (para los voladores, que salen por su hueco). */
  frame(e: Entity, out: { x: number; z: number; ry: number; scale: number }): { x: number; z: number; ry: number; scale: number } {
    const r = this.rt.get(e);
    if (!r) return Object.assign(out, { x: 0, z: -11, ry: 0, scale: 1 });
    r.root.getWorldPosition(this.v);
    r.root.getWorldDirection(this.sv); // (su +Z, hacia fuera del túnel)
    return Object.assign(out, { x: this.v.x, z: this.v.z, ry: Math.atan2(this.sv.x, this.sv.z), scale: 1 });
  }

  /** ¿Cuánto está abierta? (0 cerrada, 1 abierta) */
  openness(e: Entity): number {
    return e.getValue(Gate, 'open') ?? 0;
  }

  /** Al acabar la ronda: todas cerradas. */
  closeAll(): void {
    for (const e of this.queries.gates.entities) {
      e.setValue(Gate, 'busy', 0);
      e.setValue(Gate, 'want', 0);
    }
  }

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.05);
    for (const e of this.queries.gates.entities) {
      const r = this.rt.get(e);
      if (!r) continue;
      let busy = e.getValue(Gate, 'busy') ?? 0;
      if (busy > 0) {
        busy = Math.max(0, busy - dt);
        e.setValue(Gate, 'busy', busy);
        if (busy === 0) e.setValue(Gate, 'want', 0);
      }
      const want = e.getValue(Gate, 'want') ?? 0;
      if (want > 0 && !r.was) this.opened(r);
      r.was = want > 0;
      let open = e.getValue(Gate, 'open') ?? 0;
      open += (want - open) * Math.min(1, dt * 3.2);
      if (Math.abs(want - open) < 1e-3) open = want;
      e.setValue(Gate, 'open', open);
      // las puertas se deslizan a los lados, y sus cuerpos con ellas
      if (Math.abs(open - r.lastOpen) > 1e-4) {
        r.lastOpen = open;
        const off = DOOR.x + open * DOOR.slide;
        r.doorL?.position.set(-off, DOOR.y, DOOR.z);
        r.doorR?.position.set(off, DOOR.y, DOOR.z);
        r.root.getWorldQuaternion(this.pose.quaternion);
        for (let i = 0; i < 2; i++) {
          r.root.localToWorld(this.pose.position.set(i ? off : -off, DOOR.y, DOOR.z));
          this.physics.setBodyTransform(r.doors[i], this.pose);
        }
      }
      // la baliza: abierta, gira y echa sus haces
      const on = want > 0 || open > 0.05;
      if (r.spin && on) r.spin.rotation.y += dt * 6;
      for (const m of r.beams) m.opacity = on ? 0.35 : 0;
      r.body?.color.setHex(on ? (Math.sin(time * 12) > 0 ? 0xff2a08 : 0xc81e06) : 0x3a0c04);
    }
    this.puffs.update(dt);
  }

  // al abrirse: el ruido de la compuerta y seis bocanadas de vapor a cada lado, que salen hacia fuera (RepArena: SND.door y
  // fx.steam, en el marco de la compuerta)
  private opened(r: GateRt): void {
    SND.door(r.root.localToWorld(this.sp.set(0, 0.3, 0.5)));
    r.root.getWorldQuaternion(this.gq);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 6; i++) {
        r.root.localToWorld(this.sp.set(side * 1.3, 0.3 + i * 0.25, 0.4));
        this.sv.set(side * (0.8 + Math.random()), 0.2 + Math.random() * 0.6, 0.1 + Math.random() * 0.5).applyQuaternion(this.gq);
        this.puffs.add(this.sp, this.sv, 0.55 + Math.random() * 0.3, 1 + Math.random() * 0.6);
      }
    }
  }
}
