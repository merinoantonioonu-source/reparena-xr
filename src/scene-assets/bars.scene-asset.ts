/**
 * Los aparatos y los objetivos del modo Barras (RepArena: src/35_equip.js, src/72_bars.js): la barra de dominadas (dos postes
 * y la barra de acero entre ellos, con un brillo turquesa que la marca) y las paralelas del remo invertido (dos barras con
 * sus patas, o una sola), más la pompa (una esfera de cristal que se hincha) y la línea que baja del objetivo hacia tu cara.
 * Sin azar ni reloj: el juego los coloca y los mueve; los materiales son de cada uno (el juego los suelta al acabar). Medidas
 * en metros: la barra va a lo largo de X y las paralelas, a lo largo de Z (su origen, el suelo en el centro).
 */
import { AdditiveBlending, BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';

const noInk = <T extends Mesh>(m: T): T => {
  m.userData.noInk = true;
  return m;
};

export interface BarRigParts {
  grp: Group;
  /** El brillo turquesa de la barra (que se enciende al colocarla). */
  glowMat: MeshBasicMaterial;
  own: Material[];
}

/** Un tubo entre dos puntos (a lo largo de X, Y o Z). */
function tube(len: number, r: number, mat: Material, axis: 'x' | 'y' | 'z'): Mesh {
  const m = new Mesh(new CylinderGeometry(r, r, len, 12), mat);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}

/** La barra de dominadas: dos postes, la barra a su altura y la base de cada poste. */
export function createDoorBar(W = 0.9, H = 2.2): BarRigParts {
  const grp = new Group();
  grp.name = 'door-bar';
  const steel = new MeshStandardMaterial({ color: 0x9aa0ae, roughness: 0.35, metalness: 0.85 }), dark = new MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6, metalness: 0.5 });
  const glowMat = new MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const bar = tube(W + 0.1, 0.017, steel, 'x');
  bar.position.y = H;
  const glow = noInk(tube(W + 0.1, 0.05, glowMat, 'x'));
  glow.position.y = H;
  grp.add(bar, glow);
  for (const s of [-1, 1]) {
    const post = tube(H, 0.03, dark, 'y');
    post.position.set((s * (W + 0.1)) / 2, H / 2, 0);
    const foot = new Mesh(new BoxGeometry(0.1, 0.03, 0.4), dark);
    foot.position.set((s * (W + 0.1)) / 2, 0.015, 0);
    const cap = new Mesh(new BoxGeometry(0.09, 0.06, 0.09), dark);
    cap.position.set((s * (W + 0.1)) / 2, H, 0);
    grp.add(post, foot, cap);
  }
  return { grp, glowMat, own: [steel, dark, glowMat] };
}

/** Las paralelas del remo: dos barras (o una) a lo largo de Z, con dos patas cada una (RepArena: buildEquipVis). */
export function createDipBars(gap = 0.58, len = 0.7, H = 0.95, one = false): BarRigParts {
  const grp = new Group();
  grp.name = 'dip-bars';
  const steel = new MeshStandardMaterial({ color: 0x9aa0ae, roughness: 0.35, metalness: 0.85 }), dark = new MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6, metalness: 0.5 });
  const glowMat = new MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  // (una sola, también a lo largo de Z, como en RepArena: se coloca con las manos a lo largo de ella y te tumbas cruzado debajo)
  const xs = one ? [0] : [-gap / 2, gap / 2], L = len + 0.1;
  for (const x of xs) {
    const rail = tube(L, 0.017, steel, 'z');
    rail.position.set(x, H, 0);
    const glow = noInk(tube(L, 0.05, glowMat, 'z'));
    glow.position.set(x, H, 0);
    grp.add(rail, glow);
    for (const s of [-1, 1]) {
      const leg = tube(H, 0.025, dark, 'y'), pz = (s * L) / 2 - s * 0.05;
      leg.position.set(x, H / 2, pz);
      const foot = new Mesh(new BoxGeometry(0.4, 0.03, 0.1), dark);
      foot.position.set(x, 0.015, pz);
      grp.add(leg, foot);
    }
  }
  return { grp, glowMat, own: [steel, dark, glowMat] };
}

/** La pompa: una esfera de cristal de radio 1 (el juego la escala) con un reflejo. */
export interface BubbleParts {
  grp: Group;
  mat: MeshBasicMaterial;
  shine: Mesh;
  own: Material[];
}
export function createBubble(color = 0x7fe3ff): BubbleParts {
  const grp = new Group();
  grp.name = 'bubble';
  const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: true, side: DoubleSide, toneMapped: false });
  const ball = noInk(new Mesh(new SphereGeometry(1, 20, 14), mat));
  grp.add(ball);
  const sm = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, toneMapped: false });
  const shine = noInk(new Mesh(new SphereGeometry(0.16, 10, 8), sm));
  shine.position.set(-0.45, 0.5, 0.55);
  grp.add(shine);
  return { grp, mat, shine, own: [mat, sm] };
}
