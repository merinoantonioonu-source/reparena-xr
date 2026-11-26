/**
 * Lo que se ve del parapente (segunda entrega): **la vela** encima de ti y **sus líneas a tus manos**.
 *
 * Colgado, el mapa va inclinado hacia tu vista (`MAPPILOT.pitch`: «Parapente: inclinación del mapa»), así que «arriba» en el
 * vuelo queda por encima de ti y algo hacia lo alto de tu cabeza: la vela está allí, lejos (no tapa lo que miras: se ve
 * echando la cabeza atrás, como un piloto que mira su ala), y de cada mano salen cuatro líneas hacia su mitad. Se ladea al virar. Todo hecho una vez: en cada fotograma solo se mueven
 * la vela y las puntas de las líneas.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { MAPPILOT } from '../../core/state.js';
import { hands } from '../../input/hand-model.js';

/** La vela: su envergadura en arco (rad a cada lado, sobre un radio), su cuerda, lo alta y lo adelantada que va (m) y sus
 * celdas; lo que se ladea con el viraje (× el ladeo del vuelo). */
const WING = { arc: 0.9, r: 5.4, chord: 2.5, up: 6.6, fwd: 1.3, cells: 14, roll: 0.6 };
/** Las líneas de cada mano: a qué puntos de su mitad de la vela van (parte del arco). */
const LINES = [0.2, 0.45, 0.7, 0.95];
const COLS = [0xff4fa3, 0xffffff, 0x3cf0c6, 0xffffff];
const AX_Y = new Vector3(0, 1, 0), AX_Z = new Vector3(0, 0, 1);

export class ParaLook {
  /** El marco del vuelo en la sala (delante, −z; arriba, +y), con la vela dentro. */
  private readonly rig = new Group();
  private readonly lines: LineSegments;
  private readonly pos: Float32Array;
  private readonly q = new Quaternion();
  private readonly ax = new Vector3();
  private readonly v = new Vector3();
  /** Dónde se vio por última vez cada mano (la del lado izquierdo y la del derecho de la vela), en el marco del vuelo. */
  private readonly hand: [Vector3, Vector3] = [new Vector3(-0.3, 0.3, -0.2), new Vector3(0.3, 0.3, -0.2)];

  constructor(parent: Group) {
    // la vela: una tira en arco, de celdas de colores
    const n = WING.cells, P: number[] = [], C: number[] = [], col = new Color();
    for (let i = 0; i <= n; i++) {
      const a = (i / n * 2 - 1) * WING.arc, x = WING.r * Math.sin(a), y = WING.up - WING.r * (1 - Math.cos(a));
      // (el borde de ataque, algo más adelantado en el centro; el de salida, recto)
      P.push(x, y, -WING.fwd - WING.chord * (0.55 + 0.12 * Math.cos(a * 1.4)), x, y - 0.08, -WING.fwd + WING.chord * 0.45);
    }
    // (vértices propios por celda, para que cada una tenga su color liso)
    const VP: number[] = [], VI: number[] = [];
    for (let i = 0; i < n; i++) {
      col.setHex(COLS[i % COLS.length]);
      // (las de los extremos, algo más oscuras: relieve)
      const k = 0.78 + 0.22 * Math.cos(((i + 0.5) / n * 2 - 1) * 1.3);
      for (const j of [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 3]) {
        VP.push(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
        C.push(col.r * k, col.g * k, col.b * k);
      }
      const b = i * 4;
      VI.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(VP), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
    geo.setIndex(VI);
    const wing = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false, fog: false, transparent: true, opacity: 0.92 }));
    wing.userData.noInk = true;
    wing.frustumCulled = false;
    this.rig.add(wing);
    this.rig.visible = false;
    parent.add(this.rig);
    // las líneas: de cada mano a su mitad de la vela (en la sala: sus puntas se recolocan en cada fotograma)
    this.pos = new Float32Array(LINES.length * 2 * 2 * 3);
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.lines = new LineSegments(lg, new LineBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.55, toneMapped: false, fog: false }));
    this.lines.userData.noInk = true;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    parent.add(this.lines);
  }

  /** Cada fotograma: `on`, con el parapente en el aire (el mapa a la vista). */
  update(on: boolean): void {
    this.rig.visible = this.lines.visible = on;
    if (!on) return;
    // el marco del vuelo: girado hacia tus pies, levantado hacia tu vista y ladeado con el viraje
    const yaw = MAPPILOT.yaw, R = this.rig;
    R.position.set(MAPPILOT.x, MAPPILOT.y, MAPPILOT.z);
    R.quaternion.setFromAxisAngle(AX_Z, -MAPPILOT.bank * WING.roll).premultiply(this.q.setFromAxisAngle(AX_Y, yaw));
    if (MAPPILOT.pitch) R.quaternion.premultiply(this.q.setFromAxisAngle(this.ax.set(Math.cos(yaw), 0, -Math.sin(yaw)), MAPPILOT.pitch));
    R.updateMatrixWorld(true);
    // las manos que se ven de verdad (las calculadas no): cada una, a la mitad de la vela de su lado (en la sala: el giro
    // del marco del vuelo no cambia cuál es tu derecha)
    for (const h of [hands.left, hands.right]) {
      if (!h.ok || h.est) continue;
      const side = (h.wrist.x - MAPPILOT.x) * Math.cos(yaw) - (h.wrist.z - MAPPILOT.z) * Math.sin(yaw);
      this.hand[side < 0 ? 0 : 1].copy(h.wrist);
    }
    let o = 0;
    for (let s = 0; s < 2; s++) {
      const H = this.hand[s], sg = s ? 1 : -1;
      for (const f of LINES) {
        const a = sg * f * WING.arc;
        // (a media cuerda de la vela)
        this.v.set(WING.r * Math.sin(a), WING.up - WING.r * (1 - Math.cos(a)) - 0.05, -WING.fwd - WING.chord * 0.1);
        R.localToWorld(this.v);
        this.pos[o++] = H.x;
        this.pos[o++] = H.y;
        this.pos[o++] = H.z;
        this.pos[o++] = this.v.x;
        this.pos[o++] = this.v.y;
        this.pos[o++] = this.v.z;
      }
    }
    (this.lines.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  /** Al colgarte: las manos, donde estén (o, si no se ven, a los lados de tu cabeza, arriba). */
  place(): void {
    const yaw = MAPPILOT.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (let s = 0; s < 2; s++) this.hand[s].set(MAPPILOT.x + (s ? 0.25 : -0.25) * rx, MAPPILOT.y + 0.35, MAPPILOT.z + (s ? 0.25 : -0.25) * rz);
  }
}
