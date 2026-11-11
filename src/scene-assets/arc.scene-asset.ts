/**
 * El arco de energía de los Arcos (RepArena, src/40_models.js: arcFrame, makeArcObj, makeSawObj): un marco fino (dos postes
 * con una línea de luz por dentro y un dintel) con una barra de luz roja que va a una altura (barY), inclinada (tilt) y
 * más o menos ancha (hw: media separación entre los extremos; 1 = 2 m), y una cortina de energía por encima de la barra. La
 * valla baja (jump) es otra cosa: dos postes bajos, una hoja con tres sierras que giran y la cortina hasta el suelo.
 * Se estira a lo ancho con hw y se inclina con tilt; sin azar ni reloj (el chisporroteo lo pone el juego con las líneas
 * `lines`). Sin texturas de lienzo: el degradado de la luz es una textura de datos.
 */
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, Line, LineBasicMaterial, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RedFormat, UnsignedByteType } from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';

/** Un degradado de luz de una línea (más claro en el centro): la luz de la barra. */
function beamTex(): DataTexture {
  const n = 64, d = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, k = Math.max(0, 1 - Math.abs(u - 0.5) * 2); // 0 en los bordes, 1 en medio
    d[i] = Math.round(255 * (0.35 * k + 0.65 * Math.pow(k, 4)));
  }
  const t = new DataTexture(d, 1, n, RedFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const steel = new MeshStandardMaterial({ color: 0x6d7280, roughness: 0.45, metalness: 0.6 });
const dark = new MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6, metalness: 0.5 });
const redGlow = new MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false });
const zapMat = new LineBasicMaterial({ color: 0xffd0c8, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

/** Lo que el juego mueve de un arco (cada uno, con sus propios materiales: la luz cambia con el peligro). */
export interface ArcParts {
  grp: Group;
  bar: Group;
  coreMat: MeshBasicMaterial;
  glowMat: MeshBasicMaterial;
  curtainMat: MeshBasicMaterial;
  curtain: Mesh;
  /** Los dos rayitos que chisporrotean a lo largo de la barra (26 puntos cada uno). */
  lines: Line[];
  /** Los extremos de la barra (chispas) y las sierras que giran (solo en la valla). */
  ends: Object3D[];
  saws: Object3D[];
  /** Todo lo que hay que soltar al quitarlo. */
  own: Material[];
}

const lineObj = (): Line => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(26 * 3), 3));
  const l = new Line(g, zapMat);
  l.frustumCulled = false;
  l.userData.noInk = true;
  return l;
};

/** El arco: barY (altura de la barra), H (altura del marco), tilt (inclinación, rad), jump (la valla baja con sierras) y hw. */
export function createArc(barY = 1.4, H = 2.55, tilt = 0, jump = false, hw = 1): ArcParts {
  const grp = new Group(), bar = new Group();
  grp.name = jump ? 'arc-hurdle' : 'arc';
  const tex = beamTex();
  const coreMat = new MeshBasicMaterial({ color: 0xffb0a0, toneMapped: false });
  const glowMat = new MeshBasicMaterial({ map: tex, color: 0xff2a14, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
  const curtainMat = new MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.2, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
  const ends: Object3D[] = [], saws: Object3D[] = [];
  // los postes y el dintel (la valla, postes bajos); el ancho cambia con hw, el grosor no
  const top = jump ? barY + 0.12 : H;
  for (const s of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.1, top, 0.14), dark);
    post.position.set(s * 1.1 * hw, top / 2, 0);
    const foot = new Mesh(new BoxGeometry(0.26, 0.05, 0.3), steel);
    foot.position.set(s * 1.1 * hw, 0.025, 0);
    const line = new Mesh(new BoxGeometry(0.012, Math.max(0.05, top - 0.2), 0.03), redGlow);
    line.position.set(s * 1.045 * hw, top / 2, 0);
    line.userData.noInk = true;
    grp.add(post, foot, line);
  }
  if (!jump) {
    const lintel = new Mesh(new BoxGeometry(2.32 * hw, 0.08, 0.14), dark);
    lintel.position.set(0, H + 0.04, 0);
    const lamp = new Mesh(new BoxGeometry(2.1 * hw, 0.012, 0.03), redGlow);
    lamp.position.set(0, H - 0.005, 0);
    lamp.userData.noInk = true;
    grp.add(lintel, lamp);
  }
  // la barra (en su grupo: se inclina entero) con su núcleo, su luz, sus remates y los rayitos
  bar.position.y = barY;
  bar.rotation.z = tilt;
  const core = new Mesh(new CylinderGeometry(0.02, 0.02, 2.0 * hw, 8), coreMat);
  core.rotation.z = Math.PI / 2;
  core.userData.noInk = true;
  bar.add(core);
  const planes = jump ? 2 : 3;
  for (let i = 0; i < planes; i++) {
    const p = new Mesh(new PlaneGeometry(2.05 * hw, jump ? 0.2 : 0.26), glowMat);
    p.rotation.x = i * (jump ? Math.PI / 2 : Math.PI / 3);
    p.userData.noInk = true;
    bar.add(p);
  }
  for (const s of [-1, 1]) {
    const e = new Mesh(new BoxGeometry(0.1, 0.12, 0.2), steel);
    e.position.x = s * 0.98 * hw;
    bar.add(e);
    const spark = new Mesh(new PlaneGeometry(0.3, 0.3), new MeshBasicMaterial({ color: 0xffc8a0, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide }));
    spark.position.x = s * 0.99 * hw;
    spark.userData.noInk = true;
    bar.add(spark);
    ends.push(spark);
  }
  if (jump) {
    // la hoja y tres sierras que giran
    const blade = new Mesh(new BoxGeometry(2.0 * hw, 0.05, 0.03), steel);
    bar.add(blade);
    for (const x of [-0.62, 0, 0.62]) {
      const d = new Mesh(new CylinderGeometry(0.14, 0.14, 0.014, 18), steel);
      d.rotation.x = Math.PI / 2;
      d.position.set(x * hw, 0, 0.012);
      bar.add(d);
      saws.push(d);
    }
  }
  const lines = [lineObj(), lineObj()];
  for (const l of lines) bar.add(l);
  // la cortina de energía: por encima de la barra; en la valla, por debajo, hasta el suelo
  const ch = jump ? Math.max(0.05, barY - 0.02) : Math.max(0.05, H - barY - 0.05);
  const curtain = new Mesh(new PlaneGeometry(2.0 * hw, ch), curtainMat);
  curtain.position.y = jump ? ch / 2 + 0.01 : barY + ch / 2 + 0.02;
  curtain.userData.noInk = true;
  if (tilt && !jump) {
    // trapecio: el borde de abajo sigue a la barra inclinada
    const p = curtain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, Math.min(ch / 2 - 0.02, p.getY(i) + Math.tan(tilt) * hw * p.getX(i) / hw));
    p.needsUpdate = true;
  }
  grp.add(bar, curtain);
  return { grp, bar, coreMat, glowMat, curtainMat, curtain, lines, ends, saws, own: [coreMat, glowMat, curtainMat] };
}
