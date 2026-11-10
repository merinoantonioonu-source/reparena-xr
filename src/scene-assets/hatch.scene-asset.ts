/**
 * La trampilla del suelo (RepArena, src/30_env.js: hatches): un aro de acero con tornillos, el hueco negro con su brillo
 * rojo y la tapa de listones (su grupo «hatch-lid», que el juego levanta al abrirse). De ella salen los bichos de la
 * batalla diminuta (flexiones y plancha con un brazo). Unos 44 cm. Determinista (sin azar ni reloj).
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from '@iwsdk/core';

const steel = new MeshStandardMaterial({ color: 0x8a8f9a, roughness: 0.45, metalness: 0.6 });
const dark = new MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.6, metalness: 0.5 });
const black = new MeshStandardMaterial({ color: 0x0b0b0e, roughness: 1, metalness: 0 });
const halo = new MeshBasicMaterial({ color: 0x80140a, transparent: true, opacity: 0.8, depthWrite: false });

export function createHatch(): Group {
  const g = new Group();
  g.name = 'hatch';
  const ring = new Mesh(new CylinderGeometry(0.2, 0.22, 0.03, 20), steel);
  ring.position.y = 0.012;
  const hole = new Mesh(new CylinderGeometry(0.16, 0.16, 0.034, 20), black);
  hole.position.y = 0.014;
  hole.userData.noInk = true;
  g.add(ring, hole);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, b = new Mesh(new BoxGeometry(0.03, 0.03, 0.05), dark);
    b.position.set(Math.cos(a) * 0.19, 0.03, Math.sin(a) * 0.19);
    b.rotation.y = -a;
    g.add(b);
  }
  const glow = new Mesh(new PlaneGeometry(0.3, 0.3), halo);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.036;
  glow.userData.noInk = true;
  g.add(glow);
  // la tapa: cinco listones y el travesaño, que gira desde un borde al abrirse
  const lid = new Group();
  lid.name = 'hatch-lid';
  lid.position.set(0, 0.035, -0.15);
  for (let i = 0; i < 5; i++) {
    const s = new Mesh(new BoxGeometry(0.3, 0.012, 0.03), steel);
    s.position.set(0, 0, 0.15 + (i - 2) * 0.055);
    lid.add(s);
  }
  const bar = new Mesh(new BoxGeometry(0.03, 0.014, 0.3), dark);
  bar.position.set(0, 0, 0.15);
  lid.add(bar);
  g.add(lid);
  return g;
}
