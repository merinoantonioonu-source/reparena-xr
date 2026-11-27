/**
 * Lo que se ve del combate en el parapente (la lógica, `sky-fight.ts`): el cielo de la tarde con su sol; muy abajo, el mar de
 * nubes, que corre bajo tus pies mientras vuelas; las islas flotando por encima de él (y por debajo de ti), con sus árboles,
 * arbustos, hierba y flores, y unas pocas enormes a lo lejos; nubes sueltas a tu altura; gaviotas que se oyen; los voladores del
 * catálogo con sus animaciones (vuelan, se echan atrás al atacar, se quejan al recibir y caen derribados) y la diana de Combate
 * en el que miras; sus bolas de fuego (las de los jefes: src/style/missile-fx.ts); tus rayos (los de Combate:
 * src/combat/bolt.ts), que van hasta el blanco, y la onda de la carga.
 *
 * Todo lo del cielo va en un grupo (`frame`) girado y desplazado como el mapa del parapente (MapSystem): lo de delante, hacia tus
 * pies, e inclinado hacia tu vista lo que diga «Parapente: inclinación del mapa» (`MAPPILOT.pitch`). Las bolas y los rayos,
 * en la sala (ahí viven sus partículas). Hecho al empezar y reutilizado: en plena pelea no se crea nada.
 */
import { AdditiveBlending, AnimationMixer, AssetManager, BackSide, BufferAttribute, CanvasTexture, CircleGeometry, Color, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, LoopOnce, LoopRepeat, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Quaternion, ShaderMaterial, Shape, SphereGeometry, TorusGeometry, Vector3, type AnimationAction, type BufferGeometry, type Material, type PerspectiveCamera, type Scene, type SkinnedMesh } from '@iwsdk/core';
import { comicPatch } from '../../style/comic.js';
import { SND } from '../../audio/sound.js';
import { Bolts, type Lightning } from '../../combat/bolt.js';
import { LockLines, type LockTarget } from '../../combat/lockline.js';
import { FOE_DEF } from '../../combat/foes.js';
import { boltColor, POW_COL } from '../../combat/fx.js';
import { HOOKS, MAPPILOT, MAPVIEW } from '../../core/state.js';
import { on as isOn } from '../../core/values.js';
import { kitParts } from '../../env/scenery.js';
import { Missile, type MissileKind } from '../../style/missile-fx.js';
import { warmKeep } from '../../style/warm.js';
import { ISLE_BELLY, ISLE_BUSHES, ISLE_GROUND, ISLE_SLAB, ISLE_SLAB_Y, ISLE_TREES, PUFFS, SKY, SKY_KIND, SkyFight, SkyIsles, SkyPuffs, type SkyEv, type SkyIn, type SkyKind } from './sky-fight.js';

/** El cielo: su radio (m; dentro del alcance de la cámara, por eso se alarga mientras se pelea), los colores de la tarde (arriba,
 * el horizonte y la calima de lo lejano) y hacia dónde está el sol (en el cielo, normalizado al usarlo). */
const SKY_R = 1500, CAM_FAR = 2200;
const ZENITH = new Color(0x4d86d8), HORIZON = new Color(0xf7dcb8), HAZE = new Color(0xeadfd8), SUN = new Vector3(0.55, 0.22, -0.8).normalize();
/** La niebla de lo lejano (poca: con más, a 100 m las islas ya se veían blancas, sin relieve; a 1 km, a medias), del color del
 * mar de nubes a lo lejos. Se pone en cada fotograma: al colgarte, el juego volvía a poner la de la escena (rosa y espesa: en
 * las gafas, las islas se veían como siluetas rosas lisas). */
const FOG = 0.0008;
/** El mar de nubes de verdad (un disco bajo tus pies que te sigue, con sus nubes quietas en el cielo: corren mientras vuelas):
 * a qué altura (m, en el cielo) y su radio (m). Por debajo, la panza de las islas se pierde entre las nubes. */
const SEA_Y = -60, SEA_R = 1400;
/** Las cascadas: cuántas caben (una por isla) y hasta dónde caen (m, en el cielo: por debajo del mar de nubes). */
const FALL_CAP = 24, FALL_BOT = -75;
/** Lo que se pone encima de las islas (`SkyIsles`): cuántos caben de cada modelo. */
const DECO = [...ISLE_TREES, ...ISLE_BUSHES, ...ISLE_GROUND], DECO_CAP = 160;
/** Los rayos: lo que tardan en llegar (s, más la distancia a 1/`BOLT_V` s por m; como en Combate, algo más deprisa) y su
 * grosor (× el de Combate: a 20-30 m, con el de siempre apenas se veían), más grueso cuanto más lejos. */
const BOLT_T = 0.08, BOLT_V = 55, BOLT_W = 2.2;
/** Cada cuánto se oye una gaviota (s, entre estos dos). */
const GULL = [5, 11] as const;
/** Lo que se ladea el horizonte al virar (rad, × el ladeo; como sobre el mapa) y cada cuánto se miran las islas (s). */
const ROLL = 0.16, ISLE_T = 0.5;
/** Cuántos de cada volador se preparan (el jefe, uno). */
const POOL: Record<SkyKind, number> = { bee: 3, bat: 3, cthulhu: 3, dragon: 3, boss: 1 };
/** Lo que escupe cada uno (el pulpo, plasma; los dragones, fuego) y el tamaño de su bola (m). */
const BALL: Partial<Record<SkyKind, { kind: MissileKind; size: number }>> = { cthulhu: { kind: 'plasma', size: 0.35 }, dragon: { kind: 'fire', size: 0.4 }, boss: { kind: 'fire', size: 0.65 } };

// el mar de nubes en un punto (p: sus x y -z en el cielo; d, a qué distancia de tus ojos): sus nubes, quietas en el cielo
// (corren bajo ti al volar), blancas arriba y gris lila en las hondonadas, doradas hacia el sol; lejos, sin detalle (no
// centellean) y del color del horizonte. Es el mismo en el disco de debajo y en el cielo por debajo del horizonte: así no hay
// costura ni franja entre los dos (antes, lo de más allá del disco era una franja gris lisa)
const SEA_FN = /* glsl */ `
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.48; } return v / 0.9927; }
vec3 seaCol(vec2 p, float d, vec2 dir) {
  vec2 q = p / 140.0 + vec2(uT * 0.01, uT * 0.004);
  float det = exp(-d / 3500.0);
  float n = mix(0.5, fbm(q), det), n2 = mix(0.5, fbm(q + vec2(0.06, 0.05)), det);
  float top = smoothstep(0.3, 0.8, n), side = clamp((n - n2) * 5.0 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.6, 0.6, 0.76), vec3(1.0, 0.97, 0.94), top * (0.5 + 0.5 * side));
  // (hacia el sol, la luz de la tarde en lo alto de las nubes)
  float sw = max(dot(normalize(dir), normalize(vec2(uSun.x, -uSun.z))), 0.0);
  col = mix(col, col * vec3(1.08, 0.9, 0.74), sw * sw * (0.25 + 0.5 * top));
  // (lejos, la calima: hasta el color del horizonte)
  return mix(col, uHor, 1.0 - exp(-d / 3400.0));
}`;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// el cielo de la tarde: azul arriba, cálido en el horizonte, el sol con su resplandor y unas nubes altas muy tenues; por debajo
// del horizonte, el mar de nubes hasta el horizonte (el mismo que el disco de debajo, más allá de él)
const FRAG = /* glsl */ `
uniform float uT;
uniform vec3 uZen, uHor, uSun, uEye;
uniform float uSeaY;
varying vec3 vDir;
${SEA_FN}
void main() {
  vec3 d = normalize(vDir); float h = d.y, s = max(dot(d, uSun), 0.0);
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.55));
    // nubes altas, tenues (en un plano alto: grandes arriba, apretadas hacia el horizonte)
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uT * 0.004, 0.0);
    float c = smoothstep(0.55, 0.85, fbm(uv)) * smoothstep(0.0, 0.25, h);
    col = mix(col, vec3(1.0, 0.97, 0.94), c * 0.45);
  } else {
    // (por debajo del horizonte, el mar de nubes: donde lo corta tu mirada)
    float t = min((uSeaY - uEye.y) / min(h, -1e-4), 60000.0);
    vec2 p = vec2(uEye.x + d.x * t, -(uEye.z + d.z * t));
    col = seaCol(p, t, vec2(d.x, -d.z));
  }
  // el sol: su disco y su resplandor (también sobre las nubes de abajo, más suave; sin corte en el horizonte)
  col += vec3(1.0, 0.85, 0.6) * (pow(s, 12.0) * 0.35 + pow(s, 200.0) * 0.8) * mix(0.4, 1.0, smoothstep(-0.06, 0.0, h));
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9993, 0.9997, s));
  gl_FragColor = vec4(col, 1.0);
}`;

// el mar de nubes (el disco): sus nubes, quietas en el cielo (corren bajo ti al volar), blancas arriba y gris azulado en las
// hondonadas, con el sol encima; hacia el borde, la calima del horizonte
const SEA_VERT = /* glsl */ `
uniform vec2 uOff;
varying vec2 vW;
void main() {
  vW = position.xy + uOff;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SEA_FRAG = /* glsl */ `
uniform float uT, uSeaY;
uniform vec3 uHor, uSun, uEye;
varying vec2 vW;
${SEA_FN}
void main() {
  // (sin cortar en trozos: cortado, se veía una raya recta en el mar; con unos km volados, los números caben de sobra)
  vec2 dd = vec2(vW.x - uEye.x, vW.y + uEye.z);
  gl_FragColor = vec4(seaCol(vW, length(vec3(dd, uSeaY - uEye.y)), dd), 1.0);
}`;
// las cascadas (como las de la cuerda, src/modes/bars/rope-scene.ts, con sus instancias): hilos de agua que bajan deprisa, con
// espuma donde rompe en el borde, abriéndose y deshaciéndose en bruma al caer; lo lejano, con la calima (la niebla de la escena)
const FALL_VS = /* glsl */ `
varying vec2 vUv;
varying float vH, vFog;
uniform float uFog;
void main() {
  vUv = uv;
  vH = length(instanceMatrix[1].xyz);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  float f = uFog * -mv.z;
  vFog = 1.0 - exp(-f * f);
  gl_Position = projectionMatrix * mv;
}`;
const FALL_FS = /* glsl */ `
uniform float uT;
uniform vec3 uHaze;
varying vec2 vUv;
varying float vH, vFog;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  float y = 1.0 - vUv.y, sp = 1.0 + y * 0.6;
  float x = (vUv.x - 0.5) / sp + 0.5;
  vec2 p = vec2(x * 12.0, vUv.y * vH / 9.0 + uT * 2.2);
  float n = vnoise(p) * 0.55 + vnoise(p * vec2(2.3, 1.7) + 7.1) * 0.3 + vnoise(p * vec2(5.0, 3.1) - 2.3) * 0.15;
  float edge = smoothstep(0.0, 0.18 + 0.1 * vnoise(vec2(vUv.y * 7.0 - uT, 1.0)), x) * smoothstep(1.0, 0.82 - 0.1 * vnoise(vec2(vUv.y * 7.0 - uT, 5.0)), x);
  float foam = smoothstep(0.035, 0.0, y) * 0.9;
  float mist = smoothstep(0.35, 1.0, y);
  vec3 c = mix(vec3(0.36, 0.62, 0.8), vec3(0.97, 0.99, 1.0), clamp(n * 0.9 + foam + mist * 0.6, 0.0, 1.0));
  float a = edge * (0.75 + 0.25 * n) + foam * 0.4;
  a *= 1.0 - mist * 0.6;
  gl_FragColor = vec4(mix(c, uHaze, vFog), a);
}`;
// las nubes sueltas: cuadros de cara a ti (en cada ojo) con su bocanada; se desvanecen al acercarte (las atraviesas)
const PUFF_VERT = /* glsl */ `
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz), d = -c.z;
  vA = smoothstep(s * 0.6, s * 1.6, d) * (1.0 - smoothstep(600.0, 760.0, d));
  c.xy += position.xy * s;
  gl_Position = projectionMatrix * c;
}`;
const PUFF_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb, t.a * vA * 0.85);
}`;
// la bocanada de una nube (un dibujo, hecho una vez): bultos blancos con sombra por debajo, deshilachados por el borde
function puffTexture(): CanvasTexture {
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  let seed = 7;
  const r = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = N * (0.22 + 0.56 * r()), y = N * (0.32 + 0.4 * r()), rad = N * (0.1 + 0.14 * r());
    const g = c.createRadialGradient(x, y - rad * 0.25, rad * 0.1, x, y, rad);
    g.addColorStop(0, 'rgba(255,253,250,0.9)');
    g.addColorStop(0.6, 'rgba(236,236,244,0.55)');
    g.addColorStop(1, 'rgba(210,214,230,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, rad, 0, Math.PI * 2);
    c.fill();
  }
  return new CanvasTexture(cv);
}

/** El corazón del cielo (una vida): la figura de relieve (unos 2,4 m), un halo rosa y un aro de luz alrededor. */
function heartModel(): Group {
  const g = new Group(), sh = new Shape();
  // (el corazón: dos lóbulos arriba y la punta abajo)
  sh.moveTo(0, -1);
  sh.bezierCurveTo(-0.15, -0.75, -1.1, -0.2, -1.1, 0.35);
  sh.bezierCurveTo(-1.1, 0.85, -0.55, 1.05, 0, 0.6);
  sh.bezierCurveTo(0.55, 1.05, 1.1, 0.85, 1.1, 0.35);
  sh.bezierCurveTo(1.1, -0.2, 0.15, -0.75, 0, -1);
  const geo = new ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.18, bevelSegments: 4, curveSegments: 18 });
  geo.center();
  const m = new MeshStandardMaterial({ color: 0xff3d6e, roughness: 0.5, metalness: 0, emissive: 0x5a0a1e });
  comicPatch(m);
  const body = new Mesh(geo, m);
  body.scale.setScalar(1.2);
  g.add(body);
  const halo = new Mesh(new SphereGeometry(2.4, 24, 12), new MeshBasicMaterial({ color: 0xff4f7b, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  halo.userData.noInk = true;
  g.add(halo);
  const ring = new Mesh(new TorusGeometry(2.9, 0.12, 8, 48), new MeshBasicMaterial({ color: 0xffb3c8, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  ring.userData.noInk = true;
  g.add(ring);
  return g;
}

/** El tono de cada isla (multiplica sus colores): la mayoría, tal cual; otras, más rojizas, doradas o verdes. */
const ISLE_TINTS = [0xffffff, 0xffffff, 0xffe6d8, 0xfff0d0, 0xe8ffe0, 0xffdcd0] as const;
// los colores de la roca de las islas, por vértice (sale de su forma: lo que mira arriba, hierba; lo demás, roca a capas, más
// oscura hacia abajo); la panza va del revés, así que es toda de roca
function isleColors(src: BufferGeometry, slab: boolean): BufferGeometry {
  const g = src.clone(), P = g.getAttribute('position'), N = g.getAttribute('normal'), n = P.count, c = new Float32Array(n * 3);
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y, y1 = g.boundingBox!.max.y;
  for (let i = 0; i < n; i++) {
    const y = (P.getY(i) - y0) / (y1 - y0 || 1), ny = N ? N.getY(i) : 0, band = Math.floor(P.getY(i) * 2.3 + Math.sin(P.getX(i) * 0.9) * 0.6) & 1;
    let r: number, gg: number, b: number;
    if (slab && ny > 0.5) {
      // la hierba (más clara en lo alto, con manchas)
      const k = 0.5 + 0.5 * Math.sin(P.getX(i) * 1.7 + P.getZ(i) * 1.3);
      r = 0.46 + 0.1 * k;
      gg = 0.74 + 0.08 * k;
      b = 0.34;
    } else if (slab && ny > 0.2) {
      // el borde de tierra
      r = 0.68;
      gg = 0.56;
      b = 0.36;
    } else {
      // la roca: arenisca cálida a capas, más oscura hacia abajo (la panza, del revés: su «abajo» es arriba)
      const d = slab ? y : 1 - y, k = 0.72 + 0.28 * d;
      r = (band ? 0.82 : 0.7) * k;
      gg = (band ? 0.58 : 0.47) * k;
      b = (band ? 0.4 : 0.36) * k;
    }
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  return g;
}
// el material de la roca de las islas (de colores por vértice y de cada isla), ya con el cómic
function isleRock(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  comicPatch(m);
  return m;
}
// las hojas, que de lejos no se claréen (con las hojas tal cual, a 100 m los árboles eran palos): una copia que corta menos y
// usa el suavizado de bordes de las gafas (una por material)
function leafy(m: Material, done: Map<Material, Material>): Material {
  const sm = m as MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial || !(sm.alphaTest > 0)) return m;
  let c = done.get(m);
  if (!c) {
    const k = sm.clone();
    k.alphaTest = 0.3;
    k.alphaToCoverage = true;
    comicPatch(k);
    done.set(m, k);
    c = k;
  }
  return c;
}

/** Un volador del catálogo, a su tamaño, con su vuelo de siempre y sus gestos (atacar, recibir y caer). */
interface Critter {
  kind: SkyKind;
  g: Group;
  mixer: AnimationMixer;
  fly: AnimationAction | null;
  bite: AnimationAction | null;
  hit: AnimationAction | null;
  die: AnimationAction | null;
  /** El volador al que está puesto (su id; 0, libre) y lo que lleva girado al caer. */
  id: number;
  spin: number;
  /** Su diana (la de Combate: sale de sus huesos), más grande cuanto más lejos. */
  lock: LockTarget & { scale: number; live: boolean };
}

export class SkyScene {
  readonly fight: SkyFight;
  readonly isles: SkyIsles;
  readonly puffs: SkyPuffs;
  /** En la sala: lo que se ve en ella (las bolas, los rayos); `frame`, el cielo. */
  readonly root = new Group();
  readonly frame = new Group();
  private built = false;
  private sky: Mesh | null = null;
  private skyMat: ShaderMaterial | null = null;
  private readonly batches = new Map<string, InstancedMesh[]>();
  private readonly critters: Critter[] = [];
  private readonly missiles: Missile[] = [];
  private readonly wasOn: boolean[] = [];
  private bolts: Bolts | null = null;
  /** Los rayos en camino: hasta quién (su id; 0, a ninguno), su daño, lo que llevan y lo que tardan (s). */
  private readonly flying: { lt: Lightning; id: number; dmg: number; t: number; dur: number }[] = [];
  private sea: Mesh | null = null;
  private seaMat: ShaderMaterial | null = null;
  private fallMat: ShaderMaterial | null = null;
  /** El corazón (uno a la vez): la figura, su halo y su aro, y lo que lleva girado. */
  private heart: Group | null = null;
  private heartSpin = 0;
  private falls: InstancedMesh | null = null;
  /** Tus ojos en el cielo (para el mar de nubes hasta el horizonte) y el tono de cada isla. */
  private readonly eyeSky = new Vector3();
  private readonly tint = new Color();
  private puffMesh: InstancedMesh | null = null;
  private readonly lock = new LockLines();
  private gullT: number = GULL[0];
  private ring: Mesh | null = null;
  private ringT = -1;
  private isleT = 0;
  private shown = false;
  private fogWas: { color: number; density: number } | null = null;
  private farWas = 0;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly qInv = new Quaternion();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly sc = new Vector3();
  private readonly ax = new Vector3();
  private readonly gaze = new Vector3();
  private readonly from = new Vector3();
  private readonly AX_Y = new Vector3(0, 1, 0);
  private readonly AX_Z = new Vector3(0, 0, 1);
  private readonly AX_X = new Vector3(1, 0, 0);

  /** `scene`: la escena (su niebla y su cámara); `onEv`: lo que la partida hace con cada suceso (vibrar, puntos, avisos). */
  constructor(parent: Object3D, private readonly scene: () => Scene | null, private readonly camera: () => PerspectiveCamera | null, private readonly onEv: (E: SkyEv) => void, rnd: () => number = Math.random) {
    this.fight = new SkyFight(rnd);
    this.isles = new SkyIsles(rnd);
    this.puffs = new SkyPuffs(rnd);
    parent.add(this.root);
    this.root.add(this.frame);
    this.root.add(this.lock.group);
    this.root.visible = false;
  }

  // lo que falte (en cuanto los kits y los voladores estén cargados)
  private build(): boolean {
    if (this.built) return true;
    const isl = kitParts('island'), nat = kitParts('nature');
    if (!isl || !nat) return false;
    for (const k of Object.keys(POOL) as SkyKind[]) if (!AssetManager.getGLTF(FOE_DEF[k === 'boss' ? 'dragon' : k].asset, { shared: true })) return false;
    // el cielo
    this.skyMat = new ShaderMaterial({ uniforms: { uT: { value: 0 }, uZen: { value: ZENITH }, uHor: { value: HORIZON }, uSun: { value: SUN }, uEye: { value: this.eyeSky }, uSeaY: { value: SEA_Y } }, vertexShader: VERT, fragmentShader: FRAG, side: BackSide, depthWrite: false, fog: false, toneMapped: false });
    this.sky = new Mesh(new SphereGeometry(SKY_R, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.userData.noInk = true;
    this.frame.add(this.sky);
    warmKeep(new Mesh(new SphereGeometry(1, 8, 4), this.skyMat));
    // las islas: una pieza por modelo, con sus instancias
    type Kit = NonNullable<ReturnType<typeof kitParts>>;
    const models: [string, Kit, number][] = [[ISLE_SLAB, isl, this.isles.list.length], [ISLE_BELLY, isl, this.isles.list.length], ...DECO.map((n): [string, Kit, number] => [n, nat, DECO_CAP])];
    const rock = isleRock(), leaf = new Map<Material, Material>();
    for (const [n, kit, cap] of models) {
      const parts = kit[n];
      if (!parts) continue;
      const isle = n === ISLE_SLAB || n === ISLE_BELLY;
      this.batches.set(
        n,
        parts.map((p) => {
          // (la roca de las islas, con sus colores: hierba arriba y roca cálida a capas; las hojas, sin clarearse de lejos)
          const geo = isle ? isleColors(p.geo, n === ISLE_SLAB) : p.geo, mat = isle ? rock : leafy(p.mat, leaf);
          const im = new InstancedMesh(geo, mat, cap);
          im.count = 0;
          im.frustumCulled = false;
          if (isle) for (let i = 0; i < cap; i++) im.setColorAt(i, this.tint.setRGB(1, 1, 1));
          this.frame.add(im);
          const w = new InstancedMesh(geo, mat, 1);
          if (isle) w.setColorAt(0, this.tint);
          warmKeep(w);
          return im;
        }),
      );
    }
    // el corazón: rojo y con relieve, con su halo y un aro de luz que se ven de lejos
    this.heart = heartModel();
    this.heart.visible = false;
    this.frame.add(this.heart);
    warmKeep(heartModel());
    // las cascadas (una por isla, como mucho)
    this.fallMat = new ShaderMaterial({ uniforms: { uT: { value: 0 }, uFog: { value: FOG }, uHaze: { value: HAZE } }, vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false });
    this.falls = new InstancedMesh(new PlaneGeometry(1, 1).translate(0, -0.5, 0), this.fallMat, FALL_CAP);
    this.falls.count = 0;
    this.falls.frustumCulled = false;
    this.falls.renderOrder = 3;
    this.falls.userData.noInk = true;
    this.frame.add(this.falls);
    warmKeep(new InstancedMesh(this.falls.geometry, this.fallMat, 1));
    // el mar de nubes (un disco bajo tus pies) y las nubes sueltas
    this.seaMat = new ShaderMaterial({ uniforms: { uT: { value: 0 }, uOff: { value: [0, 0] }, uHor: { value: HORIZON }, uSun: { value: SUN }, uEye: { value: this.eyeSky }, uSeaY: { value: SEA_Y } }, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: false, toneMapped: false });
    this.sea = new Mesh(new CircleGeometry(SEA_R, 72), this.seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.frustumCulled = false;
    this.sea.renderOrder = -9;
    this.sea.userData.noInk = true;
    this.frame.add(this.sea);
    warmKeep(new Mesh(new CircleGeometry(1, 8), this.seaMat));
    const pm = new ShaderMaterial({ uniforms: { map: { value: puffTexture() } }, vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: DoubleSide });
    this.puffMesh = new InstancedMesh(new PlaneGeometry(1, 1), pm, PUFFS.n);
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 4;
    this.puffMesh.userData.noInk = true;
    this.frame.add(this.puffMesh);
    warmKeep(new InstancedMesh(this.puffMesh.geometry, pm, 1));
    // los voladores
    for (const k of Object.keys(POOL) as SkyKind[]) for (let i = 0; i < POOL[k]; i++) this.critters.push(this.critter(k));
    // sus bolas (una por cada bola del combate), tus rayos y la onda
    for (let i = 0; i < this.fight.shots.length; i++) {
      const M = new Missile({ kind: 'fire', size: 0.4 });
      this.root.add(M.group);
      this.missiles.push(M);
      this.wasOn.push(false);
    }
    this.bolts = new Bolts({ sparks: (p, n, hex) => HOOKS.sparks(p, n, hex), zap: (p) => SND.zap(p) }, 6);
    this.root.add(this.bolts.group);
    this.ring = new Mesh(new SphereGeometry(1, 32, 16), new MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: BackSide }));
    this.ring.userData.noInk = true;
    this.ring.visible = false;
    this.frame.add(this.ring);
    this.built = true;
    this.placeIsles(true);
    this.placePuffs();
    return true;
  }

  // las nubes sueltas, en sus instancias (su sitio y su tamaño; de cara a ti las pone el sombreador)
  private placePuffs(): void {
    const M = this.puffMesh;
    if (!M) return;
    this.q.identity();
    this.puffs.list.forEach((P, i) => M.setMatrixAt(i, this.m4.compose(this.v.set(P.x, P.y, P.z), this.q, this.sc.set(P.s, P.s * 0.6, P.s))));
    M.instanceMatrix.needsUpdate = true;
  }

  // un volador del catálogo (el jefe, el dragón en grande)
  private critter(kind: SkyKind): Critter {
    const d = FOE_DEF[kind === 'boss' ? 'dragon' : kind], gltf = AssetManager.getGLTF(d.asset)!, model = gltf.scene, g = new Group();
    const nat = d.h / d.k, S = SKY_KIND[kind].size;
    model.scale.setScalar(S / nat);
    model.position.y = -S * d.ctr;
    model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh) m.frustumCulled = false;
    });
    g.add(model);
    g.visible = false;
    this.frame.add(g);
    const mixer = new AnimationMixer(model), clip = (n: string) => gltf.animations.find((c) => c.name === n);
    const act = (n: string, loop: boolean): AnimationAction | null => {
      const c = clip(n);
      if (!c) return null;
      const A = mixer.clipAction(c);
      if (loop) {
        A.setLoop(LoopRepeat, Infinity);
        A.play();
      } else {
        A.setLoop(LoopOnce, 1);
        A.clampWhenFinished = true;
      }
      return A;
    };
    // (la diana: su centro, en la sala; viva mientras está puesto a un volador que vuela)
    const lock = {
      scale: 1,
      live: false,
      radius: S / 2,
      root: model as Object3D,
      get alive(): boolean {
        return lock.live;
      },
      get lockScale(): number {
        return lock.scale;
      },
      center: (out: Vector3): Vector3 => g.getWorldPosition(out),
    };
    return { kind, g, mixer, fly: act(d.clips.walk, true), bite: act(d.clips.attack, false), hit: act(d.clips.hit, false), die: act(d.clips.death, false), id: 0, spin: 0, lock };
  }

  // un gesto de una vez (atacar, recibir, caer), saliendo del vuelo
  private gesture(C: Critter, A: AnimationAction | null): void {
    if (!A) return;
    A.reset().play();
    if (C.fly) A.crossFadeFrom(C.fly, 0.12, false);
  }

  /** Otra ronda: desde el principio (el cielo, alrededor). */
  reset(): void {
    this.fight.reset(0);
    this.isles.reset(0, 0);
    this.puffs.reset(0, 0);
    this.flying.length = 0;
    this.lock.clear();
    for (const C of this.critters) {
      C.id = 0;
      C.g.visible = false;
    }
    for (const M of this.missiles) M.stop();
    this.wasOn.fill(false);
    this.bolts?.clear();
    this.ringT = -1;
    if (this.built) {
      this.placeIsles(true);
      this.placePuffs();
    }
  }

  /** Empieza una oleada (sus voladores; `boss`, la del jefe). */
  startWave(i: number, need: number, boss: boolean): void {
    this.fight.startWave(i, need, boss);
  }

  // las islas que han cambiado de sitio (todas, al empezar), en sus instancias
  private placeIsles(all: boolean): void {
    if (!all && !this.isles.moved.length) return;
    const L = this.isles.list, put = (n: string, i: number, m: Matrix4): void => {
      for (const im of this.batches.get(n) ?? []) im.setMatrixAt(i, m);
    };
    for (let i = 0; i < L.length; i++) {
      if (!all && !this.isles.moved.includes(i)) continue;
      const I = L[i];
      this.q.setFromAxisAngle(this.AX_Y, I.ry);
      put(ISLE_SLAB, i, this.m4.compose(this.v.set(I.x, I.y, I.z), this.q, this.sc.set(I.s, I.s * ISLE_SLAB_Y, I.s)));
      // (la panza: la roca del revés, colgando de la losa)
      this.q2.copy(this.q).multiply(this.qx(Math.PI));
      put(ISLE_BELLY, i, this.m4.compose(this.v.set(I.x, I.y + 0.1 * I.s, I.z), this.q2, this.sc.set(I.s * 0.75, I.s * 0.8, I.s * 0.75)));
    }
    for (const n of [ISLE_SLAB, ISLE_BELLY]) for (const im of this.batches.get(n) ?? []) {
      im.count = L.length;
      im.instanceMatrix.needsUpdate = true;
    }
    // (cada isla, su tono: unas más rojizas, otras más doradas o más verdes; sale de dónde está, no cambia al repintar)
    for (let i = 0; i < L.length; i++) {
      if (!all && !this.isles.moved.includes(i)) continue;
      const k = Math.abs(Math.sin(L[i].x * 12.9898 + L[i].z * 78.233)) * 43758.5453, c = ISLE_TINTS[Math.floor((k - Math.floor(k)) * ISLE_TINTS.length)];
      this.tint.setHex(c);
      for (const n of [ISLE_SLAB, ISLE_BELLY]) for (const im of this.batches.get(n) ?? []) {
        im.setColorAt(i, this.tint);
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
    // las cascadas: del borde hasta perderse en el mar de nubes
    const W = this.falls;
    if (W) {
      let nf = 0;
      for (const I of L) {
        const f = I.fall;
        if (!f || nf >= FALL_CAP) continue;
        this.q.setFromAxisAngle(this.AX_Y, f.ry);
        W.setMatrixAt(nf++, this.m4.compose(this.v.set(f.x, f.y, f.z), this.q, this.sc.set(f.w, f.y - FALL_BOT, 1)));
      }
      W.count = nf;
      W.instanceMatrix.needsUpdate = true;
    }
    // lo de encima (árboles, arbustos, hierba, flores): lo de todas las islas, en sus instancias
    const cnt: Record<string, number> = {};
    for (const I of L)
      for (const T of I.deco) {
        const i = cnt[T.n] ?? 0;
        if (i >= DECO_CAP) continue;
        cnt[T.n] = i + 1;
        put(T.n, i, this.m4.compose(this.v.set(T.x, T.y, T.z), this.q.setFromAxisAngle(this.AX_Y, T.ry), this.sc.setScalar(T.sc)));
      }
    for (const n of DECO)
      for (const im of this.batches.get(n) ?? []) {
        im.count = cnt[n] ?? 0;
        im.instanceMatrix.needsUpdate = true;
      }
  }
  private readonly qX = new Quaternion();
  private qx(a: number): Quaternion {
    return this.qX.setFromAxisAngle(this.AX_X, a);
  }

  /** Lo del cielo (x, y, z en él) en la sala. */
  toRoom(x: number, y: number, z: number, out: Vector3): Vector3 {
    return out.set(x, y, z).applyMatrix4(this.frame.matrixWorld);
  }

  /**
   * Cada fotograma: `show`, con el parapente en el aire; `paused`, todo quieto; I, lo que manda el piloto; `eye`, tus ojos y
   * `eyeQ`, hacia dónde miran (en la sala).
   */
  step(dt: number, show: boolean, paused: boolean, I: SkyIn, eye: Vector3, eyeQ: Quaternion): void {
    if (show !== this.shown) this.setShown(show);
    // (se monta en cuanto haya con qué, antes de colgarte: así no da un tirón al salir el cielo)
    const ready = this.build();
    if (!show || !ready) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.keepFog();
    const F = this.fight;
    if (!paused) {
      F.step(dt, I);
      for (const E of F.ev) this.handle(E);
      this.isleT -= dt;
      if (this.isleT <= 0) {
        this.isleT = ISLE_T;
        this.isles.step(F.x, F.z, F.heading);
        this.placeIsles(false);
        this.puffs.step(F.x, F.z, F.heading);
        this.placePuffs();
      }
      this.skyMat!.uniforms.uT.value += dt;
      this.seaMat!.uniforms.uT.value += dt;
      this.fallMat!.uniforms.uT.value += dt;
      // las gaviotas: se oyen de vez en cuando, a tu alrededor
      this.gullT -= dt;
      if (this.gullT <= 0) {
        this.gullT = GULL[0] + (GULL[1] - GULL[0]) * Math.random();
        const a = Math.random() * 6.283;
        SND.gull(this.w.set(eye.x + Math.sin(a) * 12, eye.y + 3 + Math.random() * 4, eye.z + Math.cos(a) * 12));
      }
    }
    this.place();
    this.drawHeart(dt);
    // la mirada, en el cielo (para apuntar)
    this.gaze.set(0, 0, -1).applyQuaternion(eyeQ).applyQuaternion(this.qInv);
    if (paused) return;
    this.drawFoes(dt, eye);
    this.drawShots(dt, eye, eyeQ);
    this.stepBolts(dt);
    this.bolts!.update(dt, eye);
    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 0.45, R = this.ring!;
      R.visible = k < 1;
      R.position.set(F.x, F.y, F.z);
      R.scale.setScalar(1 + (SKY.blastR - 1) * k);
      (R.material as MeshBasicMaterial).opacity = 0.35 * (1 - k);
      if (k >= 1) this.ringT = -1;
    }
    // el viento y el ladeo, para lo demás del parapente (la vela)
    MAPPILOT.bank = F.bank;
  }

  // el cielo, girado y desplazado como el mapa del parapente: donde vuelas, en tu cabeza; lo de delante, hacia tus pies
  private place(): void {
    const F = this.fight, R = this.frame;
    R.quaternion.setFromAxisAngle(this.AX_Z, isOn('flyMapBank') ? F.bank * ROLL : 0).multiply(this.q.setFromAxisAngle(this.AX_Y, -F.heading));
    R.quaternion.premultiply(this.q.setFromAxisAngle(this.AX_Y, MAPPILOT.yaw));
    if (MAPPILOT.pitch) R.quaternion.premultiply(this.q.setFromAxisAngle(this.ax.set(Math.cos(MAPPILOT.yaw), 0, -Math.sin(MAPPILOT.yaw)), MAPPILOT.pitch));
    this.v.set(F.x, F.y, F.z).applyQuaternion(R.quaternion);
    R.position.set(MAPPILOT.x - this.v.x, MAPPILOT.y - this.v.y, MAPPILOT.z - this.v.z);
    R.updateMatrixWorld(true);
    this.qInv.copy(R.quaternion).invert();
    this.sky!.position.set(F.x, F.y, F.z);
    this.eyeSky.set(F.x, F.y, F.z);
    // (el mar de nubes, bajo tus pies; sus nubes, quietas en el cielo)
    this.sea!.position.set(F.x, SEA_Y, F.z);
    const off = this.seaMat!.uniforms.uOff.value as number[];
    off[0] = F.x;
    off[1] = -F.z;
  }

  // los voladores, cada uno con su modelo (puesto al salir, libre al perderse)
  private drawFoes(dt: number, eye: Vector3): void {
    const F = this.fight;
    for (const C of this.critters) if (C.id && !F.foes.some((f) => f.id === C.id && f.st !== 'off')) {
      C.id = 0;
      C.g.visible = false;
    }
    for (const f of F.foes) {
      if (f.st === 'off') continue;
      let C = this.critters.find((c) => c.id === f.id);
      if (!C) {
        C = this.critters.find((c) => !c.id && c.kind === f.kind);
        if (!C) continue;
        C.id = f.id;
        C.spin = 0;
        C.fly?.reset().play();
      }
      C.g.visible = true;
      C.mixer.update(dt);
      C.g.position.set(f.x, f.y, f.z);
      // de cara a ti (lanzado, hacia donde va); derribado, dando vueltas
      const lx = f.st === 'lunge' ? f.vx : F.x - f.x, lz = f.st === 'lunge' ? f.vz : F.z - f.z;
      C.g.rotation.set(0, Math.atan2(lx, lz), 0);
      if (f.st === 'fall') {
        C.spin += dt * 5;
        C.g.rotation.z = C.spin;
      }
    }
    // la diana (la de Combate) en el que miras: es al que va el disparo
    for (const C of this.critters) C.lock.live = false;
    const T = F.pick(this.gaze.x, this.gaze.y, this.gaze.z), C = T && this.critters.find((c) => c.id === T.id);
    if (C) {
      C.lock.live = true;
      C.lock.scale = Math.min(8, Math.max(1, C.g.getWorldPosition(this.w).distanceTo(eye) / 5));
      this.lock.show(C.lock);
    }
    this.lock.step(dt, eye);
  }

  // los rayos en camino: la cabeza sigue al blanco (que puede moverse); al llegar, el golpe (y lo que pase: le da, lo derriba)
  private stepBolts(dt: number): void {
    const F = this.fight;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const B = this.flying[i];
      B.t += dt;
      const f = B.id ? F.foes.find((q) => q.id === B.id && q.st !== 'off') : null;
      if (f) this.toRoom(f.x, f.y, f.z, B.lt.to);
      const k = Math.min(1, B.t / B.dur);
      B.lt.k = Math.max(B.lt.k, k);
      if (k < 1) continue;
      B.lt.arrive();
      this.flying.splice(i, 1);
      if (!B.id) continue;
      const n0 = F.ev.length;
      if (F.hit(B.id, B.dmg)) for (let j = n0; j < F.ev.length; j++) this.handle(F.ev[j]);
    }
  }

  // las bolas de fuego (en la sala): vuelan, y al acabar estallan en ti o siguen de largo
  private drawShots(dt: number, eye: Vector3, eyeQ: Quaternion): void {
    const F = this.fight;
    for (let i = 0; i < F.shots.length; i++) {
      const S = F.shots[i], M = this.missiles[i];
      M.update(dt);
      if (S.on) {
        if (!this.wasOn[i]) {
          const from = F.foes.find((f) => f.id === S.from), B = BALL[from?.kind ?? 'dragon'] ?? BALL.dragon!;
          M.setLook(B);
        }
        M.fly(this.toRoom(S.x, S.y, S.z, this.v), dt, eye);
      } else if (this.wasOn[i]) {
        // (te ha dado si acabó pegada a ti: estalla delante, a más de un metro; si no, sigue de largo)
        if (Math.hypot(S.x - F.x, S.y - F.y, S.z - F.z) < SKY.hitR * 2) M.hit(this.w.set(0, 0, -1.3).applyQuaternion(eyeQ).add(eye), S.big);
        else M.coast(0.4);
      }
      this.wasOn[i] = S.on;
    }
  }

  // lo que se ve y se oye de cada suceso (lo demás, la partida: `onEv`)
  private handle(E: SkyEv): void {
    const F = this.fight;
    if (E.k === 'wind' || E.k === 'boss') {
      // (la voz, cerca de ti hacia donde está: a 20-30 m apenas se oiría)
      this.toRoom(E.x, E.y, E.z, this.v);
      const C = this.critters.find((c) => c.id === E.id);
      if (C && E.k === 'wind') this.gesture(C, C.bite);
      if (E.kind) SND.roar(this.near(this.v), E.kind === 'boss' ? 0.8 : 1, SKY_KIND[E.kind].voice);
    } else if (E.k === 'fire' || E.k === 'lunge') SND.whoosh(this.near(this.toRoom(E.x, E.y, E.z, this.v)), E.k === 'fire' ? 'throw' : 'flyer');
    else if (E.k === 'heart') HOOKS.sparks(this.near(this.toRoom(E.x, E.y, E.z, this.v)), 30, 0xff4f7b);
    else if (E.k === 'hit' || E.k === 'kill') {
      const C = this.critters.find((c) => c.id === E.id), at = this.toRoom(E.x, E.y, E.z, this.v);
      if (C) this.gesture(C, E.k === 'kill' ? C.die : C.hit);
      HOOKS.sparks(at, E.k === 'kill' ? 26 : 10, E.k === 'kill' ? 0xffd166 : 0x9fe8ff);
      SND.boltHit(this.near(at), E.k === 'kill' ? 2 : 0);
    } else if (E.k === 'blast') {
      this.ringT = 0;
      (this.ring!.material as MeshBasicMaterial).color.setHex(POW_COL[Math.min(4, Math.max(2, E.big ? 4 : 2)) - 1]);
      SND.shock(this.near(this.toRoom(F.x, F.y, F.z, this.v)));
    }
    this.onEv(E);
  }

  // un sitio para oír algo lejano: a 4 m de tus ojos, hacia allí
  private readonly nearV = new Vector3();
  private near(at: Vector3): Vector3 {
    const e = this.toRoom(this.fight.x, this.fight.y, this.fight.z, this.nearV);
    const d = this.w.copy(at).sub(e), m = d.length();
    return m > 4 ? e.addScaledVector(d, 4 / m) : at;
  }

  /** Un disparo hacia donde miras (`dmg`, su daño; el explosivo, 2): el rayo sale de delante de tus ojos. */
  shoot(dmg: number, eye: Vector3, perfect: boolean): void {
    if (!this.built || !this.shown) return;
    const F = this.fight, T = F.pick(this.gaze.x, this.gaze.y, this.gaze.z);
    // (sale de delante de tu cara, algo por debajo de los ojos, y va hasta el de la diana; sin nadie, hacia donde miras)
    this.from.copy(this.w.copy(this.gaze).applyQuaternion(this.frame.quaternion)).multiplyScalar(0.9).add(eye);
    this.from.y -= 0.15;
    const to = T ? this.toRoom(T.x, T.y, T.z, this.v) : this.v.copy(this.w).multiplyScalar(40).add(eye);
    const d = this.from.distanceTo(to), L = dmg > 1 ? 2 : perfect ? 1 : 0;
    const lt = this.bolts!.start(this.from, to, L, boltColor(perfect, dmg > 1 ? 2 : 1), BOLT_W * (1 + d / 40));
    this.flying.push({ lt, id: T?.id ?? 0, dmg, t: 0, dur: BOLT_T + d / BOLT_V });
    SND.bolt(this.from, L);
    this.onEv({ k: 'shot', id: T?.id ?? 0, kind: T?.kind ?? '', x: 0, y: 0, z: 0, n: T ? dmg : -1, big: dmg > 1 });
  }

  /** La onda de la carga ×p, alrededor de ti. */
  blast(p: number): void {
    if (!this.built || !this.shown) return;
    const n0 = this.fight.ev.length;
    this.fight.blast(p);
    for (let i = n0; i < this.fight.ev.length; i++) this.handle(this.fight.ev[i]);
    (this.ring!.material as MeshBasicMaterial).color.setHex(POW_COL[Math.min(4, p) - 1]);
  }

  // el corazón: donde está, girando y latiendo (y algo más grande de lejos, para verlo)
  private drawHeart(dt: number): void {
    const H = this.fight.heart, G = this.heart;
    if (!G) return;
    G.visible = H.on;
    if (!H.on) return;
    this.heartSpin += dt * 1.6;
    const F = this.fight, d = Math.hypot(H.x - F.x, H.y - F.y, H.z - F.z), beat = 1 + 0.12 * Math.max(0, Math.sin(this.heartSpin * 3.2)) ** 6;
    G.position.set(H.x, H.y + Math.sin(this.heartSpin * 0.9) * 0.6, H.z);
    G.rotation.set(0, this.heartSpin, 0);
    G.scale.setScalar(beat * (1 + Math.max(0, d - 40) / 60));
  }

  // la niebla y el alcance de la cámara del cielo, en cada fotograma (al colgarte, el juego ponía otra vez los de la escena)
  private keepFog(): void {
    const fog = (this.scene() as unknown as { fog: { color: Color; density: number } | null } | null)?.fog, cam = this.camera();
    if (fog && (fog.density !== FOG || !fog.color.equals(HAZE))) {
      fog.color.copy(HAZE);
      fog.density = FOG;
    }
    if (cam && cam.far < CAM_FAR) {
      cam.far = CAM_FAR;
      cam.updateProjectionMatrix();
    }
  }

  // el cielo a la vista o no: la niebla (calima), el alcance de la cámara y la vista sin arena (MAPVIEW), y al revés
  private setShown(on: boolean): void {
    this.shown = on;
    const sc = this.scene(), fog = (sc as unknown as { fog: { color: Color; density: number } | null } | null)?.fog ?? null, cam = this.camera();
    if (on) {
      MAPVIEW.on = true;
      MAPVIEW.flat = true;
      MAPVIEW.alt = 0;
      MAPVIEW.haze[0] = HAZE.r;
      MAPVIEW.haze[1] = HAZE.g;
      MAPVIEW.haze[2] = HAZE.b;
      if (fog) {
        this.fogWas = { color: fog.color.getHex(), density: fog.density };
        fog.color.copy(HAZE);
        fog.density = FOG;
      }
      if (cam) {
        this.farWas = cam.far;
        if (cam.far < CAM_FAR) {
          cam.far = CAM_FAR;
          cam.updateProjectionMatrix();
        }
      }
      return;
    }
    MAPVIEW.on = false;
    MAPVIEW.flat = false;
    if (fog && this.fogWas) {
      fog.color.setHex(this.fogWas.color);
      fog.density = this.fogWas.density;
    }
    this.fogWas = null;
    if (cam && this.farWas) {
      cam.far = this.farWas;
      cam.updateProjectionMatrix();
    }
    this.farWas = 0;
    for (const M of this.missiles) M.stop();
    this.bolts?.clear();
    this.flying.length = 0;
    this.lock.clear();
  }

  /** Al acabar: fuera el cielo (y la niebla y la cámara, como estaban). */
  clear(): void {
    if (this.shown) this.setShown(false);
    this.root.visible = false;
  }
}
