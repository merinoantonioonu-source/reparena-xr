/**
 * Lo que hay debajo (y alrededor) de quien cuelga de la barra de puerta (RepArena: src/35_equip.js «charco con monstruos»,
 * src/36_vortex.js y src/32_forest.js): el charco oscuro con cinco tentáculos que se mecen y se lanzan a tus pies (y te agarran
 * si caes), el remolino que se abre al colgarte y se cierra según aguantas (si te sueltas, te engulle) y, colgado, el bosque de
 * noche (cielo con luna, árboles, niebla y luz de luna) que tapa la arena. Es solo lo que se ve y se oye: cuándo cuelga, cuánto
 * ha aguantado y si te soltaste lo dicen el detector y el sistema de Barras, que llaman aquí.
 */
import {
  AdditiveBlending, AnimationMixer, AssetManager, BackSide, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DataTexture, DoubleSide, FogExp2, Float32BufferAttribute, Group, LinearFilter, LoopOnce,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RGBAFormat, RingGeometry, ShaderMaterial, SphereGeometry, UnsignedByteType, Vector3,
} from '@iwsdk/core';
import type { AnimationAction, AnimationClip, Material, Object3D, SkinnedMesh } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { haptic } from '../../input/hand-system.js';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const rnd = Math.random;
const rand = (a: number, b: number): number => a + rnd() * (b - a);
const wrapAng = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const noInk = <T extends Object3D>(o: T): T => {
  o.userData.noInk = true;
  return o;
};

/** Un círculo oscuro con el borde verdoso (el charco). */
function poolTexture(): DataTexture {
  const n = 128, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
    let c: [number, number, number, number];
    if (r < 0.62) c = [0, 4, 3, 255];
    else if (r < 0.88) c = [4, 20, 14, 250];
    else if (r < 0.96) c = [30, 110, 70, 140];
    else if (r < 1) c = [30, 110, 70, Math.round(140 * (1 - (r - 0.96) / 0.04))];
    else c = [0, 0, 0, 0];
    d.set(c, (y * n + x) * 4);
  }
  const t = new DataTexture(d, n, n, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------- el remolino
const VX_RMIN = 0.07, VX_D = 1.3, VX_R0 = 1.15;
// el perfil del embudo (radio 1 en la boca): baja como un cono y se precipita en la garganta
const funY = (r: number): number => -VX_D * ((1 - r) * 0.35 + (0.65 * (1 / Math.max(r, VX_RMIN) - 1)) / (1 / VX_RMIN - 1));
function funnelGeo(seg = 56, rings = 24): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, r = 1 + (VX_RMIN - 1) * Math.pow(v, 0.6), y = funY(r);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(i / seg, v);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const A = j * (seg + 1) + i, B = A + seg + 1;
    idx.push(A, B, A + 1, B, B + 1, A + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// estrías magenta en espiral que giran y fluyen hacia dentro, más claras cuanto más hondo, hasta un núcleo blanco
const SWIRL = `
float vxHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vxNoise(vec2 p, float P) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float i1 = mod(i.x + 1.0, P); i.x = mod(i.x, P);
  return mix(mix(vxHash(i), vxHash(vec2(i1, i.y)), f.x), mix(vxHash(vec2(i.x, i.y + 1.0)), vxHash(vec2(i1, i.y + 1.0)), f.x), f.y); }
vec3 swirl(float a, float z, float t, float spin, float flow) {
  float s = a + z * 2.2 - t * spin, u = s / 6.2831853, w = z * 8.0 - t * flow;
  float n = 0.5 * vxNoise(vec2(u * 5.0, w), 5.0) + 0.3 * vxNoise(vec2(u * 9.0, w * 2.1 + 3.0), 9.0) + 0.2 * vxNoise(vec2(u * 16.0, w * 4.3 + 7.0), 16.0);
  float b = n * 0.8 + (0.5 + 0.5 * sin(2.0 * s)) * 0.2;
  vec3 c = mix(vec3(0.2, 0.03, 0.11), vec3(0.62, 0.09, 0.33), smoothstep(0.25, 0.75, b));
  return c + vec3(0.9, 0.5, 0.7) * pow(smoothstep(0.55, 0.95, n), 2.0) * 0.8;
}`;
function vortexMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSpin: { value: 1.6 }, uFlow: { value: 1.5 } },
    side: DoubleSide,
    vertexShader: 'varying vec2 vUv; varying float vR; void main(){ vUv = uv; vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uSpin; uniform float uFlow; varying vec2 vUv; varying float vR;${SWIRL}
void main() {
  float d = vUv.y;
  vec3 c = swirl(vUv.x * 6.2831853, -log(max(vR, 0.02)), uTime, uSpin, uFlow);
  c *= 0.75 + 0.55 * smoothstep(0.0, 0.9, d);
  c += vec3(0.95, 0.35, 0.65) * pow(d, 3.0) * 0.4;
  c = mix(c, vec3(1.0, 0.9, 0.96), smoothstep(0.72, 1.0, d) * 0.95);
  c *= mix(0.35, 1.0, smoothstep(0.0, 0.1, d));
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}

// ---------------------------------------------------------------------------------------------- el bosque
/** El cielo de la noche: verde oscuro abajo, azul casi negro arriba, una luna con halo entre jirones de nubes y estrellas. */
function skyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; varying vec3 vP;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
void main(){
  vec3 d = normalize(vP); float h = d.y;
  vec3 c = mix(vec3(0.03,0.06,0.045), vec3(0.012,0.02,0.04), smoothstep(-0.05, 0.6, h));
  vec3 m = normalize(vec3(-0.45, 0.42, -0.79)); float md = dot(d, m);
  c += vec3(0.5,0.6,0.7) * pow(max(md, 0.0), 220.0) * 0.6 + vec3(0.12,0.17,0.22) * pow(max(md, 0.0), 14.0);
  c = mix(c, vec3(0.9,0.95,1.0), smoothstep(0.9991, 0.9994, md));
  vec2 uv = d.xz / (max(h, 0.0) + 0.3) * 2.0 + vec2(time * 0.006, 0.0);
  float cl = smoothstep(0.45, 0.85, vnoise(uv) * 0.6 + vnoise(uv * 2.3) * 0.4);
  c = mix(c, vec3(0.05,0.07,0.08) + vec3(0.15,0.18,0.2) * pow(max(md, 0.0), 6.0), cl * 0.75 * smoothstep(0.0, 0.2, h));
  float st = step(0.9975, hash(floor(d.xz / (h + 0.4) * 160.0))) * smoothstep(0.15, 0.5, h) * (1.0 - cl);
  c += vec3(0.6,0.65,0.8) * st * (0.5 + 0.5 * sin(time * 2.0 + hash(floor(d.zx * 90.0)) * 20.0));
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}
/** Un árbol: tronco que se estrecha, algo retorcido, y tres copas de hojas oscuras (o seco y desnudo). */
function forestTree(grp: Group, mats: { bark: Material; leaf: Material[] }, x: number, z: number, h: number, r: number, dead: boolean): void {
  const segs = 5;
  let px = x, pz = z, py = 0;
  const lean = [rand(-0.15, 0.15), rand(-0.15, 0.15)];
  for (let i = 0; i < segs; i++) {
    const nx = px + rand(-0.2, 0.2) + lean[0], nz = pz + rand(-0.2, 0.2) + lean[1], ny = py + h / segs;
    const r0 = r * (1 - (i / segs) * 0.7), r1 = r * (1 - ((i + 1) / segs) * 0.7), len = Math.hypot(nx - px, ny - py, nz - pz);
    const seg = noInk(new Mesh(new CylinderGeometry(r1, r0, len, 7), mats.bark));
    seg.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
    seg.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(nx - px, ny - py, nz - pz).normalize());
    grp.add(seg);
    px = nx;
    py = ny;
    pz = nz;
  }
  if (!dead) {
    for (let j = 0; j < 3; j++) {
      const s = noInk(new Mesh(new SphereGeometry(h * (0.16 + rnd() * 0.1), 9, 6), mats.leaf[Math.floor(rnd() * mats.leaf.length)]));
      s.position.set(px + rand(-0.15, 0.15) * h, py + rand(-0.2, 0.05) * h, pz + rand(-0.15, 0.15) * h);
      grp.add(s);
    }
  }
}

interface Tent {
  root: Group;
  mixer: AnimationMixer;
  idle: AnimationAction | null;
  hit: AnimationAction | null;
  hitT: number;
  hitDur: number;
  k: number;
  ts: number;
  a: number;
  s: number;
  clips: Record<string, AnimationClip>;
}

const TENT_K = 0.062;

/** Lo que se ve alrededor del que cuelga de la barra de puerta. */
export class HangScene {
  private readonly pool = new Group();
  private readonly forest = new Group();
  private readonly vortex = new Group();
  private readonly vxBody = new Group();
  private readonly tents: Tent[] = [];
  private tentBuilt = false;
  private poolRim!: MeshBasicMaterial;
  private poolDisc!: Mesh;
  private readonly vxMat = vortexMaterial();
  private vxHalo!: MeshBasicMaterial;
  private vxCore!: Mesh;
  private sky!: ShaderMaterial;
  private forestBuilt = false;
  private ground!: Mesh;
  private groundR = 1.15;
  private R = 0;
  private engulfT = 0;
  private lungeT = 5;
  private grabT = 0;
  private excite = 0;
  private buzzT = 0;
  private forestOn = false;
  private savedFog: { color: Color; density: number } | null = null;
  private readonly tmp = new Vector3();
  private readonly feet = new Vector3();
  /** Lo que se esconde mientras es de noche en el bosque (la arena de siempre). */
  private hidden: Object3D[] = [];
  /** Cómo encontrar esos objetos (la escena los carga después de arrancar los sistemas). */
  arenaOf: () => Object3D[] = () => [];

  constructor(private readonly root: Group, private readonly scene: { fog: unknown }) {
    root.add(this.pool, this.forest, this.vortex);
    this.pool.visible = this.forest.visible = this.vortex.visible = false;
    // el charco
    const tex = poolTexture();
    this.poolDisc = noInk(new Mesh(new CircleGeometry(1, 48), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
    this.poolDisc.rotation.x = -Math.PI / 2;
    this.poolDisc.position.y = 0.004;
    this.poolDisc.renderOrder = 1;
    this.pool.add(this.poolDisc);
    this.poolRim = new MeshBasicMaterial({ color: 0x2cff9a, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const rim = noInk(new Mesh(new RingGeometry(0.96, 1.0, 64), this.poolRim));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.006;
    rim.userData.rim = true;
    this.pool.add(rim);
    // el remolino
    this.vxBody.add(noInk(new Mesh(funnelGeo(), this.vxMat)));
    this.vxCore = noInk(new Mesh(new CircleGeometry(VX_RMIN, 24), new MeshBasicMaterial({ color: 0xfff0f8, toneMapped: false })));
    this.vxCore.rotation.x = -Math.PI / 2;
    this.vxCore.position.y = funY(VX_RMIN);
    this.vxBody.add(this.vxCore);
    this.vxHalo = new MeshBasicMaterial({ color: 0xffa8d8, transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending, toneMapped: false, side: DoubleSide });
    const halo = noInk(new Mesh(new PlaneGeometry(0.7, 0.7), this.vxHalo));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = funY(VX_RMIN) + 0.08;
    this.vxBody.add(halo);
    this.vortex.add(this.vxBody);
  }

  // ---------------------------------------------------------------- el bosque

  private buildForest(): void {
    if (this.forestBuilt) return;
    this.forestBuilt = true;
    const bark = new MeshStandardMaterial({ color: 0x3a2e26, roughness: 1, metalness: 0 });
    const leaf = [0x0a1a0e, 0x07120c, 0x0d1c0e, 0x12180a].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 }));
    this.sky = skyMaterial();
    const sky = noInk(new Mesh(new SphereGeometry(85, 32, 16), this.sky));
    sky.renderOrder = -10;
    this.forest.add(sky);
    // el suelo de musgo, con el hueco del remolino (el embudo se hunde bajo el suelo)
    this.ground = new Mesh(new RingGeometry(1.15, 60, 64, 1), new MeshStandardMaterial({ color: 0x1b2614, roughness: 1, metalness: 0 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.005;
    this.ground.receiveShadow = true;
    this.forest.add(this.ground);
    // los árboles, en un anillo alrededor (sin ninguno en el hueco de delante)
    const mats = { bark, leaf };
    for (let i = 0; i < 70; i++) {
      const a = rnd() * TAU, d = 3.4 + Math.pow(rnd(), 0.8) * 30;
      if (Math.abs(Math.sin(a)) * d < 2.2 && Math.cos(a) * d < 0 && d < 5) continue;
      forestTree(this.forest, mats, Math.cos(a) * d, Math.sin(a) * d, 6 + rnd() * 10, 0.18 + rnd() * 0.3, rnd() < 0.18);
    }
    // matorrales
    for (let i = 0; i < 30; i++) {
      const a = rnd() * TAU, d = 2.6 + rnd() * 14, b = noInk(new Mesh(new SphereGeometry(0.25 + rnd() * 0.4, 9, 6), leaf[Math.floor(rnd() * 4)]));
      b.position.set(Math.cos(a) * d, 0.1, Math.sin(a) * d);
      this.forest.add(b);
    }
  }

  /** Entra o sale de la noche: esconde la arena, la niebla oscura y las luces de luna (RepArena: applyForest). */
  private setForest(on: boolean): void {
    if (on === this.forestOn) return;
    this.forestOn = on;
    const sc = this.scene as unknown as { fog: FogExp2 | null; background: unknown };
    if (on) {
      this.buildForest();
      if (sc.fog) this.savedFog = { color: sc.fog.color.clone(), density: sc.fog.density };
      this.hidden = this.arenaOf();
    } else if (sc.fog && this.savedFog) {
      sc.fog.color.copy(this.savedFog.color);
      sc.fog.density = this.savedFog.density;
    }
    this.forest.visible = on;
    for (const o of this.hidden) o.visible = !on;
  }
  /** Los objetos de la arena que se esconden de noche (los pone el sistema de Barras: compuertas, cajas, rocas, valle, nubes). */
  setArena(list: Object3D[]): void {
    this.hidden = list;
    for (const o of list) o.visible = !this.forestOn;
  }

  // ---------------------------------------------------------------- el charco y los tentáculos

  private ensureTentacles(): void {
    if (this.tentBuilt) return;
    const probe = AssetManager.getGLTF('tentacle');
    if (!probe) return;
    this.tentBuilt = true;
    for (let i = 0; i < 5; i++) {
      const g = AssetManager.getGLTF('tentacle');
      if (!g) continue;
      const root = new Group(), model = g.scene, mixer = new AnimationMixer(model), clips: Record<string, AnimationClip> = {};
      for (const c of g.animations) clips[c.name.replace('Tentacle_', '')] = c;
      model.traverse((m) => {
        const s = m as SkinnedMesh;
        if (s.isMesh) {
          s.frustumCulled = false; // (se doblan mucho fuera de su caja)
          const mat = s.material as MeshStandardMaterial;
          if (mat && 'roughness' in mat) mat.roughness = 0.4;
        }
      });
      root.add(model);
      const idle = clips.Idle ? mixer.clipAction(clips.Idle) : null;
      const T: Tent = { root, mixer, idle, hit: null, hitT: 0, hitDur: 0, k: 0, ts: rand(0.8, 1.2), a: ((i + 0.3) / 5) * TAU, s: rand(0.8, 1.15), clips };
      if (idle) {
        idle.time = rand(0, clips.Idle.duration);
        idle.play();
      }
      this.pool.add(root);
      this.tents.push(T);
    }
  }
  private tentHit(T: Tent, name: string, ts = 1): void {
    const clip = T.clips[name];
    if (!clip) return;
    T.hit?.stop();
    const A = T.mixer.clipAction(clip);
    A.reset();
    A.setLoop(LoopOnce, 1);
    A.clampWhenFinished = true;
    A.timeScale = ts;
    A.fadeIn(0.12).play();
    T.idle?.fadeOut(0.12);
    T.hit = A;
    T.hitT = 0;
    T.hitDur = clip.duration;
  }
  /** Un tentáculo se lanza a por tus pies (cada tanto, mientras cuelgas). */
  private lunge(): void {
    const free = this.tents.filter((t) => !t.hit);
    if (!free.length) return;
    const T = free[Math.floor(rnd() * free.length)];
    this.tentHit(T, rnd() < 0.5 ? 'Poke' : 'Attack');
    SND.tentacle(T.root.getWorldPosition(this.tmp));
  }
  /** Te soltaste de la barra de puerta: todos te agarran y se excitan. */
  grab(at: Vector3): void {
    this.grabT = 1.6;
    this.excite = 6;
    SND.horror(at);
    for (const T of this.tents) this.tentHit(T, 'Attack2', rand(1, 1.3));
  }
  /** Te soltaste con el remolino abierto: te traga. */
  engulf(at: Vector3): void {
    this.engulfT = 1.4;
    SND.engulf(at);
    haptic('left', 1, 350);
    haptic('right', 1, 350);
  }

  // ---------------------------------------------------------------- cada fotograma

  /**
   * `door`: la barra de puerta con el modo Barras en marcha; `hang`: colgado; `pit`: 'pool' o 'vortex' (colgado);
   * `mounting`: colgándose; `playing`: oleada en marcha; `frac`: lo aguantado de la oleada (0 a 1); `pose`: dónde está la barra;
   * `feet`: dónde pisas, en la barra. Devuelve si el remolino acaba de cerrarse del todo (para avisar).
   */
  update(dt: number, t: number, s: { door: boolean; hang: boolean; pit: string; mounting: boolean; playing: boolean; frac: number; x: number; z: number; yaw: number; px: number; pz: number; paused: boolean }): void {
    if (s.paused) return;
    const vortexOn = s.door && s.hang && s.pit === 'vortex', poolOn = s.door && !vortexOn;
    this.setForest(s.door && s.hang);
    if (this.forestOn) {
      this.sky.uniforms.time.value = t % 600;
      const sc = this.scene as unknown as { fog: FogExp2 | null };
      if (sc.fog) {
        sc.fog.color.setHex(0x0a1411);
        sc.fog.density = 0.07;
      }
    }
    // ---- el charco
    this.pool.visible = poolOn;
    if (poolOn) {
      this.ensureTentacles();
      this.pool.position.set(s.x, 0, s.z);
      this.pool.rotation.y = s.yaw;
      this.poolDisc.scale.set(0.8, 0.8, 1);
      this.pool.children.forEach((c) => {
        if (c.userData.rim) c.scale.set(0.8, 0.8, 1);
      });
      this.poolRim.opacity = 0.35 + 0.2 * Math.sin(t * 2.3) + this.grabT * 0.3;
      this.excite = Math.max(0, this.excite - dt);
      const ex = Math.min(1, this.excite / 3);
      if (s.playing || ex > 0) {
        this.lungeT -= dt * (1 + 3 * ex);
        if (this.lungeT <= 0) {
          this.lungeT = s.hang ? rand(2.5, 6) : rand(5, 11);
          this.lunge();
        }
      }
      if (this.grabT > 0) this.grabT = Math.max(0, this.grabT - dt);
      // tus pies, en las coordenadas del charco
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), dx = s.px - s.x, dz = s.pz - s.z;
      this.feet.set(dx * c - dz * sn, 0, dx * sn + dz * c);
      this.tents.forEach((T, i) => {
        const a = T.a;
        T.root.position.set(Math.cos(a) * 0.8 * 0.92, 0, Math.sin(a) * 0.8 * 0.92);
        if (T.hit) {
          T.hitT += dt * T.hit.timeScale;
          if (T.hitT >= T.hitDur - 0.15) {
            T.hit.fadeOut(0.2);
            if (T.idle) {
              T.idle.enabled = true;
              T.idle.fadeIn(0.2).play();
            }
            T.hit = null;
          }
        }
        T.k += ((T.hit ? 1 : 0) - T.k) * Math.min(1, dt * 8);
        const k = smooth(T.k);
        if (T.idle) T.idle.timeScale = T.ts * (1 + 2.2 * ex);
        // al lanzarse, hacia tus pies y lo bastante largo para llegar
        const P = T.root.position, fx = this.feet.x - P.x, fz = this.feet.z - P.z, rest = Math.atan2(-P.x, -P.z), base = TENT_K * T.s;
        T.root.rotation.y = rest + wrapAng(Math.atan2(fx, fz) - rest) * k;
        T.root.scale.setScalar(base + (clamp(Math.hypot(fx, fz) / 8, base, base * 1.6) - base) * k);
        T.mixer.update(dt);
        void i;
      });
    }
    // ---- el remolino: abierto mientras te cuelgas; colgado, se cierra con lo que aguantas
    const target = !vortexOn ? 0 : s.mounting ? 1 : s.playing ? clamp(1 - s.frac, 0, 1) : 0, was = this.R;
    this.R += (target - this.R) * Math.min(1, dt * (s.playing ? 8 : 2.5));
    if (vortexOn && was > 0.04 && this.R <= 0.04 && !s.mounting) {
      SND.vortexClose(this.tmp.set(s.x, 0.05, s.z));
      haptic('left', 0.5, 80);
      haptic('right', 0.5, 80);
    }
    this.vortex.visible = vortexOn && this.R > 0.01;
    if (this.engulfT > 0) this.engulfT -= dt;
    if (this.vortex.visible) {
      const R = VX_R0 * this.R;
      this.vortex.position.set(s.x, 0, s.z);
      this.vortex.rotation.y = s.yaw;
      this.vxBody.scale.setScalar(R);
      this.vxMat.uniforms.uTime.value = t % 600;
      this.vxMat.uniforms.uSpin.value = 1.6 + (1 - this.R) * 2 + (this.engulfT > 0 ? 4 : 0);
      this.vxMat.uniforms.uFlow.value = 1.5 + (1 - this.R);
      this.vxHalo.opacity = 0.6 + 0.25 * Math.sin(t * 3.1);
      // el suelo deja ver el embudo: su hueco sigue a la boca
      if (this.ground && Math.abs(R - this.groundR) > 0.03) {
        this.groundR = R;
        this.ground.geometry.dispose();
        this.ground.geometry = new RingGeometry(Math.max(0.02, R), 60, 64, 1);
      }
      this.ground.position.x = s.x;
      this.ground.position.z = s.z;
      this.buzzT -= dt;
      if (s.playing && this.buzzT <= 0) {
        this.buzzT = 0.6;
        const k = 0.04 + 0.12 * this.R;
        haptic('left', k, 40);
        haptic('right', k, 40);
      }
    } else if (this.forestOn && this.groundR > 0.03) {
      // (sin remolino: el suelo entero)
      this.groundR = 0;
      this.ground.geometry.dispose();
      this.ground.geometry = new RingGeometry(0.001, 60, 64, 1);
      this.ground.position.x = this.ground.position.z = 0;
    }
  }

  /** Quita todo (al acabar la ronda). */
  clear(): void {
    this.setForest(false);
    this.pool.visible = this.vortex.visible = false;
    this.R = 0;
    this.engulfT = 0;
  }
}
