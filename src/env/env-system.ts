/**
 * El entorno de la partida (RepArena: Entorno → «Fondo realista», «Luciérnagas» y «Entorno (en VR)»): la foto panorámica de
 * verdad al fondo (el `DomeTexture` de IWSDK en la raíz del nivel, en vez del cielo dibujado y el valle de cómic) y las
 * luciérnagas (puntitos de luz que flotan alrededor, todo en la tarjeta gráfica). Cada ajuste se lee al cambiarlo (también el
 * menú y la página lo cambian por `setSetting`).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, createSystem, DomeGradient, DomeTexture, Points, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { DirectionalLight, Entity, HemisphereLight, Object3D } from '@iwsdk/core';
import { SND } from '../audio/sound.js';
import { GateSystem } from '../combat/gates.js';
import { ROPE_FOG, ROPE_HAZE } from '../modes/bars/rope.js';
import { BarsSystem } from '../modes/bars/bars-system.js';
import { num, str, on } from '../core/values.js';
import { Scenery, type SceneKind } from './scenery.js';
import { eventLook, lerpLook, skyLook, wavePlan, type SkyLook } from './sky-plan.js';
import { Weather } from './weather.js';
import { COMIC } from '../style/comic.js';
import { isBossWave } from '../combat/waves.js';
import { nWaves } from '../core/settings.js';
import { TrekSystem } from '../modes/trek/trek-system.js';
import { BEAT, MOTES } from '../core/beat-hub.js';
import { moteBpm } from '../core/beat.js';
import { bpm as bpmSvc, spotify } from '../services/hub.js';
import { settings } from '../core/values.js';
import { GAME, LITE, MAPVIEW, SPECIAL, TRAVEL, WAVE_EV } from '../core/state.js';
import { journeyRoute, type Place } from '../combat/journey.js';
import { head } from '../input/hand-model.js';

const TAU = Math.PI * 2;
// (pedido del usuario: el doble que en RepArena, 180; y luego al menos 2,5 veces más, en la periferia, para sentir el compás
// de la música con su movimiento: 480. Las 180 de antes, con su mismo azar; las nuevas, más lejos y más altas)
const MOTE_OLD = 180, MOTE_N = 480, MOTE_SPAN = 15;
/** Lo que no pueden ocupar (pedido del usuario: que no tapen las compuertas, los enemigos ni tu entorno inmediato): a menos
 * de `MOTE_NEAR` m de ti, y el pasillo de juego (±`MOTE_FRONT` rad del frente, hasta `MOTE_DEEP` m) por debajo de
 * `MOTE_LOW` m. */
export const MOTE_NEAR = 4.5, MOTE_FRONT = (35 * Math.PI) / 180, MOTE_DEEP = 12.5, MOTE_LOW = 4.6;

/** ¿Puede estar una luciérnaga aquí? (x, z: en la arena, tú en el centro mirando a −z; y: la altura) */
export function moteAllowed(x: number, y: number, z: number): boolean {
  const d = Math.hypot(x, z);
  if (d < MOTE_NEAR) return false;
  const a = Math.abs(Math.atan2(x, -z));
  return !(a < MOTE_FRONT && d < MOTE_DEEP && y < MOTE_LOW);
}

/** La lleva a un sitio permitido (lo más cerca del que tenía): más lejos de ti y, en el pasillo, por encima de él. */
export function moteFit(p: [number, number, number], R: () => number): [number, number, number] {
  let [x, y, z] = p;
  const d = Math.hypot(x, z);
  if (d < MOTE_NEAR) {
    const k = (MOTE_NEAR + R() * 2) / Math.max(0.01, d);
    x *= k;
    z *= k;
  }
  if (!moteAllowed(x, y, z)) y = MOTE_LOW + 0.2 + R() * 2.4;
  return [x, y, z];
}
/** De colores (pedido del usuario, dos veces: con una de cada tres y el centro blanco, ni se notaba): rosa, turquesa, violeta,
 * verde, naranja, azul y amarillo, vivos, en `MOTE_TINT_P` de ellas; las demás, del amarillo de siempre. */
const MOTE_TINTS = [0xff3fb4, 0x1fe0ff, 0x9a5cff, 0x3dff7a, 0xff8a1f, 0x3f7bff, 0xffe23a], MOTE_TINT_P = 0.75;
/** Los entornos de día que se pueden elegir y el orden de «Alternar». */
const SCENE_KINDS: SceneKind[] = ['nature', 'island', 'cliff', 'sky', 'village', 'cemetery'];
const MIX_NEXT: Record<string, 'arena' | SceneKind> = { arena: 'nature', nature: 'island', island: 'cliff', cliff: 'sky', sky: 'village', village: 'cemetery', cemetery: 'arena' };
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

/** Las luciérnagas (RepArena: src/56_motes.js): 480 puntos con su vuelo sereno y sinuoso, que nunca van hacia atrás ni se
 * acercan a menos de 80 cm; algunas, de colores; en un momento especial (`SPECIAL`), destellan más vivas. */
/** Dónde está cada luciérnaga (x, y, z, en la arena) y su azar propio (4 números): siempre igual. Las 180 de siempre, con su
 * mismo azar (apartadas si caen donde estorban); las nuevas, alrededor, de 6 a 20 m y de 0,3 a 7 m de alto, fuera del pasillo
 * de juego. */
export function moteLayout(): { base: Float32Array; seed: Float32Array } {
  const base = new Float32Array(MOTE_N * 3), seed = new Float32Array(MOTE_N * 4), R = rng(91), RF = rng(311), RN = rng(997);
  for (let i = 0; i < MOTE_N; i++) {
    if (i < MOTE_OLD) {
      const a = R() * TAU, d = 1.3 + Math.pow(R(), 0.8) * 12;
      base.set(moteFit([Math.sin(a) * d, 0.25 + Math.pow(R(), 1.3) * 3, -Math.cos(a) * d], RF), i * 3);
      seed.set([R(), R(), R(), R()], i * 4);
    } else {
      let p: [number, number, number];
      do {
        const a = RN() * TAU, d = 6 + Math.pow(RN(), 0.7) * 14;
        p = [Math.sin(a) * d, 0.3 + Math.pow(RN(), 1.2) * 6.7, -Math.cos(a) * d];
      } while (!moteAllowed(p[0], p[1], p[2]));
      base.set(p, i * 3);
      seed.set([RN(), RN(), RN(), RN()], i * 4);
    }
  }
  return { base, seed };
}

function makeMotes(): Points {
  const g = new BufferGeometry(), { base, seed } = moteLayout(), tint = new Float32Array(MOTE_N * 4), RT = rng(173), c = new Color();
  for (let i = 0; i < MOTE_N; i++) {
    // su color propio (y cuánto lo lleva: 0, el de todas)
    const on = RT() < MOTE_TINT_P;
    c.setHex(MOTE_TINTS[Math.floor(RT() * MOTE_TINTS.length)]);
    tint.set([c.r, c.g, c.b, on ? 1 : 0], i * 4);
  }
  g.setAttribute('position', new BufferAttribute(base, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 4));
  g.setAttribute('aTint', new BufferAttribute(tint, 4));
  const mat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFly: { value: 0 }, uBeat: { value: 0 }, uDance: { value: 0 }, uSwing: { value: 0 }, uSpan: { value: MOTE_SPAN }, uHead: { value: new Vector3(0, 1.6, 0) }, uVH: { value: 1000 }, uColor: { value: new Color(0xfff2b8) }, uGain: { value: 1 }, uHype: { value: 0 } },
    vertexShader: `attribute vec4 aSeed; attribute vec4 aTint; uniform float uTime, uFly, uBeat, uDance, uSwing, uSpan, uVH, uHype; uniform vec3 uHead; varying float vA; varying vec4 vTint;
      void main() {
        float t = uTime, F = uFly; vec3 ph = aSeed.wzy * 6.2832;
        // su tiempo propio: a ratos corre y a ratos casi se para, pero nunca va hacia atrás
        float wa = 0.19 + 0.14 * aSeed.y, wb = 0.47 + 0.2 * aSeed.w;
        float tw = (0.32 + 0.22 * aSeed.x) * (F - 0.4 * cos(F * wa + ph.z) / wa - 0.4 * cos(F * wb + ph.x) / wb);
        vec3 f = vec3(0.71 + 0.33 * aSeed.x, 0.53 + 0.31 * aSeed.y, 0.89 + 0.29 * aSeed.z);
        vec3 off = vec3(sin(tw * f.x + ph.x) * 1.1, sin(tw * f.y * 0.8 + ph.z) * 0.42 + sin(tw * 3.13 + ph.x) * 0.09, cos(tw * f.z + ph.y) * 1.1);
        vec3 sw = vec3(sin(tw * 2.37 * f.y + ph.y), 0.0, sin(tw * 2.71 * f.x + ph.z)) * 0.32;
        // el vaivén: el suyo, libre, o con música, al compás: en cada pulso, en un extremo (con canciones rápidas, cada dos; la
        // mitad, al revés que la otra mitad) y en columpio (un poco más arriba en los extremos, abajo al pasar por el medio)
        // por grupos (sectores del anillo alrededor de ti): cada sector se columpia a la vez, sus vecinos al revés, hacia fuera y
        // hacia dentro (el anillo entero «respira» con cada pulso); más amplio cuanto más lejos, para que se vea desde aquí
        float ang = atan(position.x, -position.z), rad = length(position.xz), sect = floor((ang + 3.14159) / 6.2832 * 12.0);
        float bw = cos(3.14159 * (uSwing + mod(sect, 2.0))); vec2 dir = rad > 0.01 ? position.xz / rad : vec2(cos(ph.x), sin(ph.x));
        float kd = clamp(rad / 4.0, 1.0, 4.0);
        off += mix(sw, vec3(dir.x * bw * 0.22 * kd, (bw * bw - 0.5) * 0.08 * kd, dir.y * bw * 0.22 * kd), uDance);
        vec3 p = position + off;
        vec3 dh = p - uHead; float dl = length(dh); if (dl < 0.8) p = uHead + dh / max(dl, 0.001) * 0.8; // (lejos de tu cara)
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float b = 0.5 + 0.5 * sin(t * (0.5 + 0.9 * aSeed.y) + aSeed.x * 6.2832), tw2 = 0.35 + 0.65 * pow(b, 3.0); // (se encienden y apagan despacio; a ratos, un destello)
        float fb = fract(uBeat), acc = step(fract(uBeat * 0.25), 0.25), pulse = exp(-fb * 5.0) * (0.55 + 0.55 * acc) * (0.6 + 0.4 * aSeed.w); // (con música, un destello en cada pulso; más en el primero de cada cuatro)
        // y en el primer pulso de cada compás, una ola de luz que da la vuelta al anillo en ese compás
        float wa2 = fract(uBeat * 0.25) * 6.2832 - 3.14159, dA = abs(mod(ang - wa2 + 3.14159, 6.2832) - 3.14159), wave = exp(-dA * dA * 9.0) * (1.0 - fract(uBeat * 0.25));
        tw2 = mix(tw2, 0.3 + 0.45 * tw2 + pulse + 0.9 * wave, uDance);
        // en un momento especial, más vivas: chisporrotean deprisa, cada una a su ritmo, y brillan más y más grandes
        float sp = pow(0.5 + 0.5 * sin(t * (11.0 + 7.0 * aSeed.x) + aSeed.y * 40.0), 6.0);
        tw2 = mix(tw2, 0.55 + 0.35 * tw2 + 1.1 * sp, uHype);
        vA = tw2 * smoothstep(26.0, 18.0, -mv.z) * smoothstep(0.35, 0.9, -mv.z); // (se ven de lejos: en la periferia)
        // (y las de color, más de su color; en el momento especial, todas algo de color)
        vTint = vec4(aTint.rgb, max(aTint.a, uHype * 0.6));
        // en el momento especial, además, se hinchan y deshinchan (cada una a su ritmo; pedido del usuario)
        float swell = 1.0 + uHype * (0.35 + 0.3 * sin(t * (3.0 + 2.0 * aSeed.z) + aSeed.w * 6.2832));
        gl_PointSize = clamp(0.1 * (0.75 + 0.5 * aSeed.w) * swell * sqrt(kd) * projectionMatrix[1][1] * uVH * 0.5 / -mv.z, 2.0, 64.0); // (las lejanas, algo más grandes) // (unos 10 cm con el halo; el punto, un par de centímetros)
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uGain; varying float vA; varying vec4 vTint;
      void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d2 = dot(q, q); if (d2 > 1.0) discard;
        float core = exp(-d2 * 14.0), halo = exp(-d2 * 3.5) * 0.4, a = min(1.0, (core * 1.4 + halo) * vA * uGain);
        vec3 col = mix(uColor, vTint.rgb, vTint.a);
        // (el centro, apenas más claro: blanco del todo, todas parecían iguales)
        gl_FragColor = vec4(mix(col, vec3(1.0), core * mix(0.6, 0.18, vTint.a)), a); }`,
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

/** El cielo sobre el mapa: de día (arriba, el horizonte y bajo él: la calima) y en el espacio. */
const MAP_SKY = { sky: [0.26, 0.5, 0.92], eq: [0.72, 0.84, 0.98], gr: [0.72, 0.84, 0.98] } as const;
const MAP_SPACE = { sky: [0, 0, 0.015], eq: [0.1, 0.24, 0.6], gr: [0.03, 0.07, 0.2] } as const;

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
  /** Con «Alternar», el de esta partida (cambia al acabar cada una). */
  private pick: 'arena' | SceneKind = 'nature';
  /** La hora y el tiempo (src/env/sky-plan.ts): lo que se ve ahora y adonde va, la lluvia y la nieve, y el relámpago. */
  private look: SkyLook = skyLook('dia', 'claro');
  private readonly lookTo: SkyLook = skyLook('dia', 'claro');
  private weather!: Weather;
  private flash = 0;
  private boltT = 6;
  private thunderT = -1;
  /** Las luces de la escena (el sol y la de relleno), con lo que traían, para teñirlas con la hora y devolverlas. */
  private lights: { sun: DirectionalLight | null; fill: HemisphereLight | null; sunC: Color; sunI: number; fillC: Color; fillI: number } | null = null;
  private lit = false;
  /** La semilla del entorno de esta partida (RepArena XR, «Entorno distinto en cada partida»): otro reparto, otros desniveles,
   * otro sol y otra hora de empezar; se elige al acabar la anterior (en el menú: rehacerlo no da tirones al EMPEZAR). 0: el de
   * siempre. */
  private seed = 0;
  private wasPlaying = false;
  private readonly tmp = new Vector3();

  init(): void {
    this.motes = makeMotes();
    this.world.createTransformEntity(this.motes);
    this.scenery = new Scenery(this.world.scene);
    this.world.createTransformEntity(this.scenery.root);
    this.weather = new Weather();
    this.world.createTransformEntity(this.weather.rain);
    this.world.createTransformEntity(this.weather.snow);
  }

  /** ¿Se ve un entorno de día (bosque o isla)? */
  get sceneryOn(): boolean {
    return this.scenery.visible;
  }

  /** El entorno elegido (con «Alternar», uno distinto en cada partida); con fondo realista, el bosque (con la foto detrás). */
  private sceneryChosen(): 'arena' | SceneKind {
    if (settings.mode === 'trek') return 'arena'; // (la Travesía pinta su propio bosque, que corre con el mundo)
    if (this.panoWanted()) return 'nature';
    const k = str('scenery');
    return k === 'mix' ? this.pick : (SCENE_KINDS as string[]).includes(k) ? (k as SceneKind) : 'arena';
  }

  /** El que toca ahora: con el viaje por portales, el del tramo del viaje en que vas; si no, el elegido. */
  private sceneryWanted(): 'arena' | SceneKind {
    if (TRAVEL.on && GAME.phase === 'playing' && TRAVEL.route.length) return TRAVEL.route[TRAVEL.leg % TRAVEL.route.length] as 'arena' | SceneKind;
    return this.sceneryChosen();
  }

  /** ¿Va el viaje por portales? (Combate y Toques, sin fondo realista) */
  private travelOn(): boolean {
    return on('cbTravel') && (settings.mode === 'combat' || settings.mode === 'touch') && !this.panoWanted();
  }

  /** En el menú: el orden del viaje de la partida que viene (con su semilla) y, de uno en uno, montar sus entornos (así cruzar
   * un portal en plena ronda no da tirones). */
  private stepTravel(D: number): void {
    if (GAME.phase === 'playing') return;
    TRAVEL.on = this.travelOn();
    TRAVEL.per = Math.max(1, Math.round(num('cbTravelWaves') || 2));
    TRAVEL.leg = TRAVEL.want = 0;
    const start = this.sceneryChosen() as Place, key = `${start}:${this.seed}`;
    if (key !== this.routeKey) {
      this.routeKey = key;
      TRAVEL.route = journeyRoute(start, this.seed || 1 + Math.floor(Math.random() * 9973));
    }
    if (!TRAVEL.on) return;
    for (const p of TRAVEL.route) {
      if (p === 'arena') continue;
      if (!this.scenery.prepare(p as SceneKind, D, false, this.gateList(), this.seed)) return; // (aún cargando sus modelos)
      if (!this.preped.has(p + key)) {
        this.preped.add(p + key);
        return; // (uno por fotograma)
      }
    }
  }
  private routeKey = '';
  private readonly preped = new Set<string>();

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
    // (con «Alternar», uno distinto en cada partida: fortaleza → bosque → isla → risco → islas en el cielo → aldea; cambia al
    // acabar la partida, para montar en el menú el viaje de la siguiente)
    if (!playing && this.wasPlaying && str('scenery') === 'mix') this.pick = MIX_NEXT[this.pick] ?? 'arena';
    // al acabar una partida (y al principio), la semilla de la siguiente
    if ((!playing && this.wasPlaying) || (this.seed === 0 && num('envVary') > 0)) this.seed = num('envVary') > 0 ? 1 + Math.floor(Math.random() * 999983) : 0;
    if (!(num('envVary') > 0)) this.seed = 0;
    this.wasPlaying = playing;
    // (de noche en el bosque de Barras, en el cañón de la cuerda del remo invertido o volando sobre el mapa, el entorno de serie se aparta)
    const bs = this.world.getSystem(BarsSystem), night = bs?.nightForest ?? false, rope = bs?.ropeShown ?? false, want = night || rope || MAPVIEW.on ? 'arena' : this.sceneryWanted(), D = num('depth') > 0 ? num('depth') : 11;
    if (want === 'arena') this.scenery.hide();
    else if (!this.scenery.show(want, D, !!this.panoWanted(), this.gateList(), this.seed)) this.scenery.hide();
    this.stepTravel(D);
    if (!this.floor.length) this.floor = ['arena-floor', 'comic-valley', 'comic-clouds'].map((id) => this.world.getSceneEntity(id)?.object3D).filter((o): o is Object3D => !!o);
    const on = this.scenery.visible;
    if (!night && !rope && !MAPVIEW.on && settings.mode !== 'trek') for (const o of this.floor) o.visible = !on && !(this.panoWanted() && o !== this.floor[0]); // (la Travesía los esconde ella)
    this.scenery.lite(LITE.on); // (con un menú abierto en las gafas, sin el bosque: va más fluido)
    this.scenery.update(dt, time, head.p, (at, isl, night) => (night ? SND.owl(this.tmp.copy(at)) : isl ? SND.gull(this.tmp.copy(at)) : SND.bird(this.tmp.copy(at)))); // (en el cementerio, búhos)
    this.stepSky(dt, time, want);
  }

  /** La hora y el tiempo de la oleada (pedido del usuario; «Hora y tiempo con las oleadas»): en los entornos de día, el cielo,
   * la luz y la niebla van cambiando suave; la lluvia, la nieve y la tormenta, en todos (también en la fortaleza). */
  private stepSky(dt: number, time: number, want: string): void {
    const playing = GAME.phase === 'playing', mode = settings.mode, cyc = on('envCycle') && (mode === 'combat' || mode === 'touch' || mode === 'arcs');
    if (cyc && playing && GAME.wave > 0) {
      const w = wavePlan(GAME.wave, want, isBossWave(GAME.wave - 1, nWaves()), this.seed % 5);
      skyLook(want === 'cemetery' ? 'noche' : w.phase, w.weather, this.lookTo); // (el cementerio, siempre de noche)
    } else skyLook(want === 'cemetery' ? 'noche' : 'dia', 'claro', this.lookTo);
    // (el suceso de la oleada: el eclipse o la niebla cerrada; también en la fortaleza)
    const ev = playing && settings.mode === 'combat' && (WAVE_EV.kind === 'eclipse' || WAVE_EV.kind === 'fog') ? WAVE_EV.kind : '';
    if (ev) eventLook(this.lookTo, ev);
    this.evK += ((ev ? 1 : 0) - this.evK) * Math.min(1, dt * 0.8);
    // (el estilo cómic no usa las luces: en el eclipse se apaga su brillo; lo que brilla por sí mismo —las cuentas de vida, los
    // aros, los rayos— se sigue viendo)
    // (el cementerio, de noche, algo más oscuro que los demás)
    this.eclK += ((ev === 'eclipse' ? 1 : want === 'cemetery' && this.scenery.visible ? 0.4 : 0) - this.eclK) * Math.min(1, dt * 0.8);
    if (this.comicK0 < 0) this.comicK0 = COMIC.uK.value;
    COMIC.uK.value = this.comicK0 * (1 - 0.68 * this.eclK);
    lerpLook(this.look, this.lookTo, Math.min(1, dt * 0.6));
    const L = this.look, day = this.scenery.visible && !this.panoWanted();
    this.arenaFog(day, ev);
    // el relámpago: en la tormenta, cada pocos segundos un fogonazo y, enseguida, el trueno
    this.flash = Math.max(0, this.flash - dt * 4);
    if (L.storm > 0.5 && playing && !GAME.paused) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 5 + Math.random() * 7;
        this.flash = 1;
        this.thunderT = 0.4 + Math.random() * 0.9;
      }
    }
    if (this.thunderT > 0) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) SND.thunder(1); // (del ambiente: con Spotify, se calla)
    }
    this.scenery.setLook(day ? L : null, this.flash);
    this.tintLights(day || this.evK > 0.02, L);
    // la lluvia y la nieve (con un menú abierto, sin ellas: va más fluido)
    const r = this.world.renderer, xs = r.xr.isPresenting ? r.xr.getSession() : null, BL = xs?.renderState?.baseLayer as { framebufferHeight?: number } | undefined;
    const wx = cyc && playing && !LITE.on ? 1 : 0;
    this.weather.update(L.rain * wx, L.snow * wx, time, head.p, BL?.framebufferHeight ? BL.framebufferHeight : innerHeight * r.getPixelRatio());
  }

  /** Tiñe el sol y la luz de relleno con la hora (y el relámpago); sin ella, las deja como estaban. */
  private tintLights(on: boolean, L: SkyLook): void {
    if (settings.mode === 'trek') return; // (la Travesía tiñe las suyas)
    if (!this.lights) {
      let sun: DirectionalLight | null = null, fill: HemisphereLight | null = null;
      this.world.getSceneEntity('sun')?.object3D?.traverse((o) => { if ((o as DirectionalLight).isDirectionalLight) sun = o as DirectionalLight; });
      this.world.getSceneEntity('fill')?.object3D?.traverse((o) => { if ((o as HemisphereLight).isHemisphereLight) fill = o as HemisphereLight; });
      const S = sun as DirectionalLight | null, F = fill as HemisphereLight | null;
      if (!S && !F) return;
      this.lights = { sun: S, fill: F, sunC: S ? S.color.clone() : new Color(), sunI: S?.intensity ?? 1, fillC: F ? F.color.clone() : new Color(), fillI: F?.intensity ?? 1 };
    }
    const G = this.lights;
    if (!on) {
      if (!this.lit) return;
      this.lit = false;
      if (G.sun) {
        G.sun.color.copy(G.sunC);
        G.sun.intensity = G.sunI;
      }
      if (G.fill) {
        G.fill.color.copy(G.fillC);
        G.fill.intensity = G.fillI;
      }
      return;
    }
    this.lit = true;
    if (G.sun) {
      G.sun.color.copy(G.sunC).multiply(this.c1.setHex(L.sun));
      G.sun.intensity = G.sunI * L.sunI;
    }
    if (G.fill) {
      G.fill.color.copy(G.fillC).multiply(this.c1.setHex(L.fill));
      G.fill.intensity = G.fillI * L.fillI * (1 + 2.5 * this.flash);
    }
  }
  private readonly c1 = new Color();
  /** Lo que se nota el suceso de la oleada (de 0 a 1: entra y sale suave) y la niebla de la fortaleza, guardada. */
  private evK = 0;
  private eclK = 0;
  private comicK0 = -1;
  private fog0: { color: Color; density: number } | null = null;

  /** En la fortaleza (sin entorno de día, que pone su niebla él), el eclipse y la niebla cerrada cambian su niebla. */
  private arenaFog(day: boolean, ev: string): void {
    const fog = (this.world.scene as unknown as { fog: { color: Color; density: number } | null }).fog;
    if (!fog) return;
    if (!this.fog0) this.fog0 = { color: fog.color.clone(), density: fog.density };
    if (MAPVIEW.on) return; // (sobre el mapa, la niebla es su calima: la pone MapSystem)
    // (en la cuerda del remo invertido, la bruma de su foto: lo lejano se funde con ella)
    const bs = this.world.getSystem(BarsSystem);
    if (bs?.ropeShown) {
      fog.color.setHex(ROPE_HAZE[bs.ropePano] ?? ROPE_HAZE.aldea);
      fog.density = ROPE_FOG;
      return;
    }
    if (day) return;
    const k = this.evK, F = this.fog0;
    fog.color.copy(F.color).lerp(this.c1.setHex(ev === 'fog' ? 0x8a929c : 0x07070b), k);
    fog.density = F.density * (1 + k * (ev === 'fog' ? 3.5 : 1.2));
  }

  /** El fondo elegido (que exista), o '' si es el cielo dibujado. */
  private panoWanted(): string {
    if (MAPVIEW.on) return ''; // (sobre el mapa, solo el cielo y el mapa: sin foto de fondo)
    if (settings.mode === 'trek') return this.world.getSystem(TrekSystem)?.pano ?? 'bosque'; // (la Travesía, el de su tramo)
    const bs = this.world.getSystem(BarsSystem);
    if (bs?.ropeShown) return bs.ropePano; // (la cuerda del remo invertido: el de su tramo, según la altura)
    const k = str('pano');
    return FONDOS.includes(k) ? k : '';
  }

  private level(): Entity | null {
    return this.world.activeLevel?.peek?.() ?? null;
  }

  /** El cielo del vuelo sobre el mapa (el degradado de IWSDK en la raíz del nivel): azul de día y, cuanto más alto, más
   * oscuro, hasta el negro del espacio con el horizonte azul; al acabar, el de siempre. */
  private skyWas: number[] | null = null;
  private skyK = -1;
  private stepMapSky(): void {
    const lv = this.level();
    if (!lv || !lv.hasComponent(DomeGradient)) return;
    const sky = lv.getVectorView(DomeGradient, 'sky'), eq = lv.getVectorView(DomeGradient, 'equator'), gr = lv.getVectorView(DomeGradient, 'ground');
    if (!MAPVIEW.on) {
      if (this.skyWas) {
        for (let i = 0; i < 3; i++) {
          sky[i] = this.skyWas[i];
          eq[i] = this.skyWas[3 + i];
          gr[i] = this.skyWas[6 + i];
        }
        this.skyWas = null;
        this.skyK = -1;
      }
      return;
    }
    if (!this.skyWas) this.skyWas = [sky[0], sky[1], sky[2], eq[0], eq[1], eq[2], gr[0], gr[1], gr[2]];
    // (de 8 km a 80 km de alto, del día al espacio; a saltos pequeños: no se escribe en cada fotograma)
    const t = Math.max(0, Math.min(1, Math.log(Math.max(1, MAPVIEW.alt) / 8000) / Math.log(10))), k = Math.round(t * t * (3 - 2 * t) * 100) / 100;
    const key = k + (MAPVIEW.flat ? 10 : 0);
    if (key === this.skyK) return;
    this.skyK = key;
    const mix = (v: { [i: number]: number }, a: readonly number[], b: readonly number[]): void => {
      for (let i = 0; i < 3; i++) v[i] = a[i] + (b[i] - a[i]) * k;
    };
    mix(sky, MAP_SKY.sky, MAP_SPACE.sky);
    mix(eq, MAP_SKY.eq, MAP_SPACE.eq);
    mix(gr, MAP_SKY.gr, MAP_SPACE.gr);
    mix(MAPVIEW.haze, MAP_SKY.eq, MAP_SPACE.eq); // (la calima del fondo del mapa, del color del horizonte)
    // (con el mapa levantado hacia la vista —el parapente, boca arriba—, el horizonte del mapa ya no es el de la sala: todo el
    // cielo del color de la calima, para que el borde del mapa no se note)
    if (MAPVIEW.flat) for (let i = 0; i < 3; i++) sky[i] = eq[i] = gr[i] = MAPVIEW.haze[i];
  }

  // la foto de fondo: el DomeTexture de IWSDK en la raíz del nivel (gana al degradado de cielo); se quita el valle y las nubes dibujados
  private stepPano(): void {
    const want = this.panoWanted();
    this.ropeYaw();
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
    for (const o of this.hidden) o.visible = !want && !MAPVIEW.on;
  }

  // en la cuerda del remo invertido, la foto se gira hacia donde subes (lo mejor de ella, de frente: hacia lo alto de tu
  // cabeza); al salir, derecha otra vez (la Travesía gira la suya ella)
  private panoTurn = 0;
  private ropeYaw(): void {
    if (settings.mode === 'trek') return;
    const bs = this.world.getSystem(BarsSystem), yaw = bs?.ropeShown ? bs.ropeYaw : 0, lv = this.level();
    if (Math.abs(yaw - this.panoTurn) < 1e-3 || !lv || !lv.hasComponent(DomeTexture) || lv.getValue(DomeTexture, '_needsUpdate')) return;
    lv.getVectorView(DomeTexture, 'rotation')[1] = yaw;
    lv.setValue(DomeTexture, '_needsUpdate', true);
    this.panoTurn = yaw;
  }

  update(dt: number, time: number): void {
    this.clock += dt;
    this.stepPano();
    this.stepMapSky();
    this.stepScenery(dt, time);
    // las luciérnagas: solo en partida y con el ajuste; doradas de día, verdes de noche
    const live = on('motes') && GAME.phase === 'playing' && !GAME.paused;
    this.motes.visible = on('motes') && GAME.phase === 'playing' && !MAPVIEW.on;
    if (!this.motes.visible) return;
    const U = (this.motes.material as ShaderMaterial).uniforms, night = settings.look === 'real';
    // el baile al compás: el ritmo puesto o el de la canción de Spotify que suena (se engancha poco a poco, sin saltos)
    if (live) MOTES.step(dt, moteBpm(num('bpm'), spotify().playing(), bpmSvc().songOn), performance.now() / 1000, BEAT.beat0);
    U.uTime.value = time;
    U.uFly.value = MOTES.fly;
    U.uBeat.value = MOTES.ph;
    U.uDance.value = MOTES.k;
    U.uSwing.value = MOTES.sw;
    (U.uHead.value as Vector3).copy(head.p);
    (U.uColor.value as Color).copy(night ? this.night : this.day);
    U.uGain.value = night ? 1.1 : 1.5;
    // el momento especial (la fiebre, el relámpago, el turbo, la supervelocidad): entra y sale en medio segundo
    U.uHype.value += ((SPECIAL.on ? 1 : 0) - U.uHype.value) * Math.min(1, dt * 4);
    // el alto de la imagen de cada ojo (en las gafas) o de la ventana: para que midan lo mismo en todas partes
    const r = this.world.renderer, xs = r.xr.isPresenting ? r.xr.getSession() : null, L = xs?.renderState?.baseLayer as { framebufferHeight?: number } | undefined;
    U.uVH.value = L?.framebufferHeight ? L.framebufferHeight : innerHeight * r.getPixelRatio();
  }
}
