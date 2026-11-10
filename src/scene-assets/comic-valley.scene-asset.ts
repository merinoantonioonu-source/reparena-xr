/**
 * El valle de dibujo del estilo Cómic alrededor de la arena (RepArena, src/38_comic.js: comicWorldBuild), con el mismo
 * azar que allí (semilla 23): el mismo paisaje. Mesetas escalonadas en tonos coral, melocotón y lavanda, ruinas de
 * columnas y dos arcos color crema, rocas que flotan en el cielo y, al fondo (a 115 m), montañas recortadas en lavanda con
 * su borde de tinta (sin luz ni niebla: un fondo pintado). Todo de pocos polígonos y en una sola malla: el sombreado de
 * cómic la corta en luz y sombra y le pone su contorno (ComicSystem). Origen en el centro de la arena, a ras de suelo.
 */
import { BufferAttribute, BufferGeometry, BoxGeometry, Color, CylinderGeometry, DoubleSide, Euler, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { mulberry } from './arena.scene-asset.js';

const TAU = Math.PI * 2;

// las piezas, juntas en una sola malla con su color en cada vértice (como el Kit de RepArena)
class Kit {
  private pos: number[] = [];
  private col: number[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private v = new Vector3();
  private one = new Vector3(1, 1, 1);
  add(geo: BufferGeometry, hex: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, c = new Color(hex);
    this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
    g.applyMatrix4(this.m);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.col.push(c.r, c.g, c.b);
    }
  }
  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    return g;
  }
}

const cyl = (rt: number, rb: number, h: number, seg: number): BufferGeometry => new CylinderGeometry(rt, rb, h, seg);
// tres o cuatro pisos que se estrechan, cada uno de su color (y la tapa, más clara)
const BANDS = [
  ['#f2a3a0', '#f7c79f', '#e98f8f', '#fbe0b8'],
  ['#c9a0dc', '#e3b7e8', '#b98ad0', '#f1d9f5'],
  ['#f7b98f', '#fbd3a5', '#ee9a72', '#fde8c8'],
];

/** El valle entero (ver arriba). */
export function createComicValley(): Group {
  const root = new Group();
  root.name = 'comic-valley';
  const R = mulberry(23), k = new Kit();
  // mesetas: tres o cuatro pisos que se estrechan, cada uno de su color
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + R() * 0.3, r = 30 + R() * 26, x = Math.cos(a) * r, z = Math.sin(a) * r, P = BANDS[i % 3], floors = 3 + (R() < 0.4 ? 1 : 0);
    let y = 0, rad = 4 + R() * 5;
    const ry = R() * TAU;
    for (let f = 0; f < floors; f++) {
      const h = 2.5 + R() * 4.5, rt = rad * (0.78 + R() * 0.1);
      k.add(cyl(rt, rad, h, 7), P[f % P.length], x, y + h / 2, z, 0, ry + f * 0.4, 0);
      y += h;
      rad = rt * (0.92 - R() * 0.1);
    }
    k.add(cyl(rad * 0.98, rad, 0.5, 7), P[3], x, y + 0.25, z, 0, ry, 0); // la tapa, más clara
  }
  // ruinas: columnas rotas (alguna con su capitel) sobre su basa
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.35 + R() * 0.25, r = 13 + R() * 7, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.6 + R() * 3.2;
    const rx = (R() - 0.5) * 0.12, ry = R() * 3, rz = (R() - 0.5) * 0.12; // (en el orden de RepArena: mismo azar)
    k.add(cyl(0.42, 0.48, h, 8), '#f3e3c3', x, h / 2, z, rx, ry, rz);
    if (R() < 0.5) k.add(new BoxGeometry(1.1, 0.35, 1.1), '#e8d2a8', x, h + 0.17, z, 0, R() * 3, 0);
    k.add(new BoxGeometry(1.2, 0.3, 1.2), '#e0c89c', x, 0.15, z, 0, R() * 3, 0);
  }
  // dos arcos
  for (const a of [2.2, 4.1]) {
    const r = 17, x = Math.cos(a) * r, z = Math.sin(a) * r, tx = -Math.sin(a), tz = Math.cos(a);
    for (const s of [-1, 1]) k.add(cyl(0.45, 0.5, 4.2, 8), '#f3e3c3', x + tx * s * 1.5, 2.1, z + tz * s * 1.5);
    k.add(new BoxGeometry(4.2, 0.6, 1.1), '#e8d2a8', x, 4.5, z, 0, -a + Math.PI / 2, 0);
  }
  // rocas que flotan: un cono boca abajo con su meseta encima
  for (let i = 0; i < 5; i++) {
    const a = R() * TAU, r = 38 + R() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 16 + R() * 12, s = 2.5 + R() * 3, P = BANDS[(i + 1) % 3];
    k.add(cyl(s, s * 0.15, s * 1.6, 6), P[0], x, y - s * 0.8, z, 0, R() * 3, 0);
    k.add(cyl(s * 0.95, s, 0.6, 6), P[3], x, y + 0.3, z, 0, R() * 3, 0);
  }
  const land = new Mesh(k.build(), new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  land.name = 'valley-land';
  root.add(land);
  // montañas al fondo, recortadas, lavanda, con su borde de tinta
  const N = 64, P: number[] = [], I: number[] = [], L: number[] = [], pk: number[] = [];
  for (let i = 0; i <= N; i++) pk.push(i === N ? pk[0] : 10 + R() * 12 + (i % 5 === 0 ? R() * 14 : 0));
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, x = Math.cos(a) * 115, z = Math.sin(a) * 115;
    P.push(x, 0, z, x, pk[i], z);
    if (i < N) {
      const b = i * 2;
      I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      L.push(x, pk[i], z, Math.cos(a + TAU / N) * 115, pk[i + 1], Math.sin(a + TAU / N) * 115);
    }
  }
  const mg = new BufferGeometry();
  mg.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  mg.setIndex(I);
  const mountains = new Mesh(mg, new MeshBasicMaterial({ color: new Color('#b9a6dd'), fog: false, side: DoubleSide, toneMapped: false }));
  mountains.name = 'valley-mountains';
  const lg = new BufferGeometry();
  lg.setAttribute('position', new BufferAttribute(new Float32Array(L), 3));
  const ridge = new LineSegments(lg, new LineBasicMaterial({ color: 0x140c1a, fog: false }));
  ridge.name = 'valley-ridge';
  root.add(mountains, ridge);
  return root;
}
