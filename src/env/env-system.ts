/**
 * El entorno de la partida (RepArena: Entorno → «Fondo realista», «Luciérnagas» y «Entorno (en VR)»): la foto panorámica de
 * verdad al fondo (el `DomeTexture` de IWSDK en la raíz del nivel, en vez del cielo dibujado y el valle de cómic) y las
 * luciérnagas (puntitos de luz que flotan alrededor, todo en la tarjeta gráfica). Cada ajuste se lee al cambiarlo (también el
 * menú y la página lo cambian por `setSetting`).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, createSystem, DomeTexture, Points, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
import { SND } from '../audio/sound.js';
import { GateSystem } from '../combat/gates.js';
import { BarsSystem } from '../modes/bars/bars-system.js';
import { num, str, on } from '../core/values.js';
import { Scenery } from './scenery.js';
import { settings } from '../core/values.js';
import { GAME } from '../core/state.js';
import { head } from '../input/hand-model.js';

const TAU = Math.PI * 2;
const MOTE_N = 90, MOTE_SPAN = 15;
const FONDOS = ['aldea', 'bosque', 'montana', 'cumbre', 'lago', 'atardecer', 'ocaso'];
const fondoUrl = (k: string): string => `${import.meta.env.BASE_URL}fondos/${k}.jpg`;

// el mismo azar de siempre para sus sitios (RepArena: rng(91))
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Las luciérnagas (RepArena: src/56_motes.js): 90 puntos con su vuelo sereno y sinuoso, que nunca van hacia atrás ni se acercan a menos de 80 cm. */
function makeMotes(): Points {
  const g = new BufferGeometry(), base = new Float32Array(MOTE_N * 3), seed = new Float32Array(MOTE_N * 4), R = rng(91);
  for (let i = 0; i < MOTE_N; i++) {
    const a = R() * TAU, d = 1.3 + Math.pow(R(), 0.8) * 12; // (más cerca que lejos, pero no encima)
    base.set([Math.sin(a) * d, 0.25 + Math.pow(R(), 1.3) * 3, -Math.cos(a) * d], i * 3);
    seed.set([R(), R(), R(), R()], i * 4);
  }
  g.setAttribute('position', new BufferAttribute(base, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 4));
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFly: { value: 0 }, uSpan: { value: MOTE_SPAN }, uHead: { value: new Vector3(0, 1.6, 0) }, uVH: { value: 1000 }, uColor: { value: new Color(0xfff2b8) }, uGain: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uFly, uSpan, uVH; uniform vec3 uHead; varying float vA;
      void main() {
        float t = uTime, F = uFly; vec3 ph = aSeed.wzy * 6.2832;
        // su tiempo propio: a ratos corre y a ratos casi se para, pero nunca va hacia atrás
        float wa = 0.19 + 0.14 * aSeed.y, wb = 0.47 + 0.2 * aSeed.w;
        float tw = (0.32 + 0.22 * aSeed.x) * (F - 0.4 * cos(F * wa + ph.z) / wa - 0.4 * cos(F * wb + ph.x) / wb);
        vec3 f = vec3(0.71 + 0.33 * aSeed.x, 0.53 + 0.31 * aSeed.y, 0.89 + 0.29 * aSeed.z);
        vec3 off = vec3(sin(tw * f.x + ph.x) * 1.1, sin(tw * f.y * 0.8 + ph.z) * 0.42 + sin(tw * 3.13 + ph.x) * 0.09, cos(tw * f.z + ph.y) * 1.1);
        vec3 sw = vec3(sin(tw * 2.37 * f.y + ph.y), 0.0, sin(tw * 2.71 * f.x + ph.z)) * 0.32;
        off += sw;
        vec3 p = position + off;
        vec3 dh = p - uHead; float dl = length(dh); if (dl < 0.8) p = uHead + dh / max(dl, 0.001) * 0.8; // (lejos de tu cara)
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float b = 0.5 + 0.5 * sin(t * (0.5 + 0.9 * aSeed.y) + aSeed.x * 6.2832), tw2 = 0.35 + 0.65 * pow(b, 3.0); // (se encienden y apagan despacio; a ratos, un destello)
        vA = tw2 * smoothstep(16.0, 7.0, -mv.z) * smoothstep(0.35, 0.9, -mv.z);
        gl_PointSize = clamp(0.1 * (0.75 + 0.5 * aSeed.w) * projectionMatrix[1][1] * uVH * 0.5 / -mv.z, 1.5, 48.0); // (unos 10 cm con el halo; el punto, un par de centímetros)
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uGain; varying float vA;
      void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d2 = dot(q, q); if (d2 > 1.0) discard;
        float core = exp(-d2 * 14.0), halo = exp(-d2 * 3.5) * 0.4, a = min(1.0, (core * 1.4 + halo) * vA * uGain);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6), a); }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.visible = false;
  pts.userData.noInk = true;
  return pts;
}

export class EnvSystem extends createSystem({}) {
  private motes!: Points;
  private fly = 0;
  private clock = 0;
  private pano = '';
  private readonly night = new Color(0xc8ff6a);
  private readonly day = new Color(0xffe58a);
  private hidden: Object3D[] = [];
  private floor: Object3D[] = [];
  private scenery!: Scenery;
  private pick: 'arena' | 'nature' | 'island' = 'arena';
  private wasPlaying = false;
  private readonly tmp = new Vector3();

  init(): void {
    this.motes = makeMotes();
    this.world.createTransformEntity(this.motes);
    this.scenery = new Scenery(this.world.scene);
    this.world.createTransformEntity(this.scenery.root);
  }

  /** ¿Se ve un entorno de día (bosque o isla)? */
  get sceneryOn(): boolean {
    return this.scenery.visible;
  }

  /** El entorno que toca: el elegido o, con «Alternar», uno distinto en cada partida; con fondo realista, el bosque (con la foto detrás). */
  private sceneryWanted(): 'arena' | 'nature' | 'island' {
    if (this.panoWanted()) return 'nature';
    const k = str('scenery');
    return k === 'mix' ? this.pick : k === 'nature' || k === 'island' ? k : 'arena';
  }

  // dónde están las compuertas (las del bosque y la isla se apartan de ellas)
  private gateList(): { x: number; z: number }[] {
    const gs = this.world.getSystem(GateSystem), out: { x: number; z: number }[] = [];
    if (!gs) return out;
    for (const e of gs.queries.gates.entities) {
      const f = gs.frame(e, { x: 0, z: 0, ry: 0, scale: 1 });
      out.push({ x: f.x, z: f.z });
    }
    return out;
  }

  private stepScenery(dt: number, time: number): void {
    const playing = GAME.phase === 'playing';
    if (playing && !this.wasPlaying && str('scenery') === 'mix') this.pick = ({ arena: 'nature', nature: 'island' } as Record<string, 'arena' | 'nature' | 'island'>)[this.pick] ?? 'arena'; // (fortaleza → bosque → isla)
    this.wasPlaying = playing;
    const night = this.world.getSystem(BarsSystem)?.nightForest ?? false, want = night ? 'arena' : this.sceneryWanted();
    if (want === 'arena') this.scenery.hide();
    else if (!this.scenery.show(want, num('depth') > 0 ? num('depth') : 11, !!this.panoWanted(), this.gateList())) this.scenery.hide();
    if (!this.floor.length) this.floor = ['arena-floor', 'comic-valley', 'comic-clouds'].map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is Object3D => !!o);
    const on = this.scenery.visible;
    if (!night) for (const o of this.floor) o.visible = !on && !(this.panoWanted() && o !== this.floor[0]);
    this.scenery.update(dt, time, head.p, (at, isl) => (isl ? SND.gull(this.tmp.copy(at)) : SND.bird(this.tmp.copy(at))));
  }

  /** El fondo elegido (que exista), o '' si es el cielo dibujado. */
  private panoWanted(): string {
    const k = str('pano');
    return FONDOS.includes(k) ? k : '';
  }

  private level(): Entity | null {
    return this.world.activeLevel?.peek?.() ?? null;
  }

  // la foto de fondo: el DomeTexture de IWSDK en la raíz del nivel (gana al degradado de cielo); se quita el valle y las nubes dibujados
  private stepPano(): void {
    const want = this.panoWanted();
    if (want === this.pano) return;
    const lv = this.level();
    if (!lv) return;
    if (want) {
      if (!lv.hasComponent(DomeTexture)) lv.addComponent(DomeTexture, { src: fondoUrl(want) });
      else {
        lv.setValue(DomeTexture, 'src', fondoUrl(want));
        lv.setValue(DomeTexture, '_needsUpdate', true);
      }
    } else if (lv.hasComponent(DomeTexture)) lv.removeComponent(DomeTexture);
    this.pano = want;
    if (!this.hidden.length) this.hidden = ['comic-valley', 'comic-clouds'].map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is Object3D => !!o);
    for (const o of this.hidden) o.visible = !want;
  }

  update(dt: number, time: number): void {
    this.clock += dt;
    this.stepPano();
    this.stepScenery(dt, time);
    // las luciérnagas: solo en partida y con el ajuste; doradas de día, verdes de noche
    const live = on('motes') && GAME.phase === 'playing' && !GAME.paused;
    this.motes.visible = on('motes') && GAME.phase === 'playing';
    if (!this.motes.visible) return;
    const U = (this.motes.material as ShaderMaterial).uniforms, night = settings.look === 'real';
    if (live) this.fly += dt;
    U.uTime.value = time;
    U.uFly.value = this.fly;
    (U.uHead.value as Vector3).copy(head.p);
    (U.uColor.value as Color).copy(night ? this.night : this.day);
    U.uGain.value = night ? 1.1 : 1.5;
    // el alto de la imagen de cada ojo (en las gafas) o de la ventana: para que midan lo mismo en todas partes
    const r = this.world.renderer, xs = r.xr.isPresenting ? r.xr.getSession() : null, L = xs?.renderState?.baseLayer as { framebufferHeight?: number } | undefined;
    U.uVH.value = L?.framebufferHeight ? L.framebufferHeight : innerHeight * r.getPixelRatio();
  }
}
