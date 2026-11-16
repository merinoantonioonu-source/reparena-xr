/**
 * Los aparatos y los objetivos del modo Barras (RepArena: src/35_equip.js, src/72_bars.js): la barra de dominadas (dos postes
 * y la barra de acero entre ellos, con un brillo turquesa que la marca) y las paralelas del remo invertido (dos barras con
 * sus patas, o una sola), más la pompa (una esfera de cristal que se hincha) y la línea que baja del objetivo hacia tu cara.
 * Sin azar ni reloj: el juego los coloca y los mueve; los materiales son de cada uno (el juego los suelta al acabar). Medidas
 * en metros: la barra va a lo largo de X y las paralelas, a lo largo de Z (su origen, el suelo en el centro).
 */
import { AdditiveBlending, BoxGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, RGBAFormat, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, UnsignedByteType } from '@iwsdk/core';
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

/**
 * La pompa de jabón, como en RepArena (src/72_bars.js: bubbleMat, BUBBLE_VS/FS y la pompa del Target): una película irisada
 * cuyo color cambia con el ángulo y se arremolina, más opaca en el borde, con dos brillos de reflejo, y dentro un resplandor
 * suave; la grande (la del jefe), con un ojo atrapado que te sigue. Radio 1: el juego la escala (y la hace temblar). El juego
 * pone su reloj (`uTime`) y su opacidad (`uOpacity`) en cada fotograma. (Antes, una bola de color liso medio transparente:
 * sin relieve, pedido del usuario.)
 */
export interface BubbleParts {
  grp: Group;
  mat: ShaderMaterial;
  /** El ojo de la grande (o null): el juego lo gira hacia ti. */
  eye: Group | null;
  own: Material[];
}
const BUBBLE_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vO;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vO = normal; gl_Position = projectionMatrix * mv; }`;
const BUBBLE_FS = `uniform float uTime; uniform float uPh; uniform float uOpacity;
varying vec3 vN; varying vec3 vV; varying vec3 vO;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float fr = pow(1.0 - abs(dot(n, v)), 1.5);
  float swirl = sin(vO.y * 6.0 + uTime * 1.3 + uPh) * 0.25 + sin(vO.x * 5.0 - uTime * 0.9 + uPh * 2.0) * 0.2;
  float h = fr * 1.7 + swirl + uTime * 0.08 + uPh;
  vec3 film = 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(vec3(-0.4, 0.8, 0.45))), 0.0), 60.0) * 1.8 + pow(max(dot(r, normalize(vec3(0.6, 0.2, 0.75))), 0.0), 22.0) * 0.45;
  vec3 col = film * (0.5 + 1.4 * fr) + vec3(spec);
  gl_FragColor = vec4(col, clamp(0.25 + 0.72 * fr + spec, 0.0, 1.0) * uOpacity);
}`;
const BUBBLE_GEO = new SphereGeometry(1, 28, 18);
/** Su resplandor de dentro (RepArena: glowSprite): redondo y difuminado. */
let CORE_TEX: DataTexture | null = null;
function coreTex(): DataTexture {
  if (CORE_TEX) return CORE_TEX;
  const n = 32, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.min(1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2);
    d.set([255, 255, 255, Math.round(255 * Math.pow(1 - r, 2))], (y * n + x) * 4);
  }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return (CORE_TEX = t);
}
const eyeWhite = new MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.25 }), eyeIris = new MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), eyePupil = new MeshBasicMaterial({ color: 0x050303 });
/** Las gotas de colores al reventar (RepArena: BUBBLE_SPLASH). */
export const BUBBLE_SPLASH = [0xff73d9, 0x73d9ff, 0xfff273, 0x8cff99];

export function createBubble(big = false): BubbleParts {
  const grp = new Group();
  grp.name = 'bubble';
  // (escribe su profundidad: las Quest recolocan cada imagen al último movimiento de la cabeza según la profundidad, y sin ella
  // la pompa se recolocaba como si estuviera al fondo: de cerca, y con la cabeza moviéndose al remar, iba a saltos)
  const mat = new ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPh: { value: Math.random() * 6 }, uOpacity: { value: 1 } }, vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, transparent: true, depthWrite: true });
  const shell = noInk(new Mesh(BUBBLE_GEO, mat));
  shell.renderOrder = 2; // (después de su brillo de dentro, que si no taparía)
  grp.add(shell);
  const cm = new SpriteMaterial({ map: coreTex(), color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  const core = new Sprite(cm);
  core.userData.noInk = true;
  core.scale.setScalar(big ? 1.0 : 1.3);
  grp.add(core);
  let eye: Group | null = null;
  if (big) {
    // un ojo atrapado dentro que te sigue (medidas de RepArena, para la pompa grande de 17 cm: aquí, en radios)
    eye = new Group();
    const k = 1 / 0.17, ball = new Mesh(BUBBLE_GEO, eyeWhite), iris = new Mesh(BUBBLE_GEO, eyeIris), pupil = new Mesh(BUBBLE_GEO, eyePupil);
    ball.scale.setScalar(0.055 * k);
    iris.scale.set(0.028 * k, 0.028 * k, 0.012 * k);
    iris.position.z = 0.047 * k;
    pupil.scale.set(0.012 * k, 0.016 * k, 0.006 * k);
    pupil.position.z = 0.058 * k;
    for (const m of [ball, iris, pupil]) eye.add(noInk(m));
    grp.add(eye);
  }
  return { grp, mat, eye, own: [mat, cm] };
}
