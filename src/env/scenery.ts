/**
 * Los entornos de día de RepArena (Entorno → «Entorno (en VR)»): el claro del bosque (Stylized Nature MegaKit, Quaternius) y la
 * playa de la isla pirata (Pirate Kit, Quaternius), con su cielo y su suelo; en la isla, el mar con olas y espuma. Cada modelo se
 * dibuja con instancias (una pieza por modelo y material) para que vaya fluido en las Quest. Dónde va cada cosa lo dice
 * `placement.ts` (de RepArena); aquí se carga, se pinta y se quita. La fortaleza de siempre es la escena de IWSDK.
 */
import {
  AssetManager, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, DoubleSide, FogExp2, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, RepeatWrapping,
  RingGeometry, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3,
} from '@iwsdk/core';
import type { Material, Texture } from '@iwsdk/core';
import { ISL_SHORE, islandLayout, natureLayout, rng, type Gate, type Models, type Put } from './placement.js';

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);

// el material del modelo → [textura, con transparencia (hojas, flores), por las dos caras]
const NAT_TEX: Record<string, [string, boolean?, boolean?]> = {
  Bark_NormalTree: ['bark_tree'], Bark_DeadTree: ['bark_dead'], Leaves_NormalTree: ['leaves_tree', true], Leaves_Pine: ['leaves_pine', true], Leaves_TwistedTree: ['leaves_bush', true],
  Leaves: ['leaves', true], Flowers: ['flowers', true], Grass: ['grass', false, true], Mushrooms: ['mushrooms'], Rocks: ['rocks'],
};

interface Part {
  geo: BufferGeometry;
  mat: Material;
}

// Atributos comprimidos (enteros normalizados) → números con decimales, para poder colocar cada pieza en su sitio
function natFloat(a: BufferAttribute): BufferAttribute {
  if (!a.normalized && a.array instanceof Float32Array) return a;
  const n = a.count, k = a.itemSize, f = new Float32Array(n * k), get = ['getX', 'getY', 'getZ', 'getW'] as const;
  const div = a.normalized ? ({ Int8Array: 127, Uint8Array: 255, Int16Array: 32767, Uint16Array: 65535 } as Record<string, number>)[a.array.constructor.name] || 1 : 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) f[i * k + j] = Math.max(-1, a[get[j]](i) / div);
  return new BufferAttribute(f, k);
}

/** El cielo de día: azul arriba, claro en el horizonte, nubes blandas que pasan despacio y el resplandor del sol. */
function daySky(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; varying vec3 vP;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vP); float h = d.y;
  vec3 c = mix(vec3(0.78,0.88,0.93), vec3(0.32,0.58,0.88), smoothstep(-0.02, 0.6, h));
  vec2 uv = d.xz / (max(h, 0.0) + 0.25) * 1.2 + vec2(time*0.006, time*0.002);
  float cl = smoothstep(0.45, 0.8, fbm(uv)) * smoothstep(0.0, 0.15, h);
  c = mix(c, vec3(1.0), cl * 0.75);
  vec3 sun = normalize(vec3(-0.5, 0.62, 0.6)); float s = max(dot(d, sun), 0.0);
  c += vec3(1.0,0.92,0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(c, 1.0);
}`,
  });
}

/** El mar: del turquesa de la orilla al azul profundo, con olas, brillos del sol y espuma en la orilla. */
function seaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    fog: false,
    uniforms: { time: { value: 0 }, shore: { value: ISL_SHORE } },
    vertexShader: `uniform float time; varying vec2 vXZ; varying float vR;
void main(){ vec3 p = position; vXZ = (modelMatrix * vec4(p, 1.0)).xz; vR = length(p.xy);
  p.z += (sin(vXZ.x * 0.35 + time * 1.1) + sin(vXZ.y * 0.27 - time * 0.8)) * 0.06 * smoothstep(20.0, 40.0, vR);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float time, shore; varying vec2 vXZ; varying float vR;
void main(){
  float w = sin(vXZ.x * 1.3 + time * 1.7) * sin(vXZ.y * 1.1 - time * 1.3) + sin((vXZ.x + vXZ.y) * 2.7 + time * 2.3) * 0.4;
  vec3 c = mix(vec3(0.22, 0.78, 0.76), vec3(0.04, 0.27, 0.48), smoothstep(shore, shore + 22.0, vR));
  c += vec3(0.9, 0.95, 1.0) * smoothstep(1.1, 1.35, w) * 0.35;
  float foam = smoothstep(shore + 1.4, shore, vR) * (0.55 + 0.45 * sin(time * 1.2 + vR * 2.0));
  c = mix(c, vec3(0.95, 0.97, 0.95), clamp(foam, 0.0, 1.0) * 0.8);
  c = mix(c, vec3(0.75, 0.87, 0.92), smoothstep(45.0, 130.0, vR));
  gl_FragColor = vec4(c, 1.0); }`,
  });
}

/** El suelo: manchas de colores que se mezclan, con su grano (hierba o arena), en una textura que se repite. */
function groundTexture(kind: 'nature' | 'island'): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d') as CanvasRenderingContext2D, R = rng(kind === 'nature' ? 11 : 17);
  x.fillStyle = kind === 'nature' ? '#5f8f3a' : '#d8c08a';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 240; i++) {
    const r = 6 + R() * 26, X = R() * 256, Y = R() * 256, k = R();
    x.fillStyle = kind === 'nature' ? (k < 0.45 ? 'rgba(78,124,44,0.35)' : k < 0.85 ? 'rgba(120,160,64,0.3)' : 'rgba(120,96,58,0.22)') : k < 0.5 ? 'rgba(200,170,110,0.35)' : k < 0.85 ? 'rgba(240,220,170,0.3)' : 'rgba(170,140,90,0.25)';
    for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      x.beginPath();
      x.arc(X + dx, Y + dy, r, 0, TAU);
      x.fill();
    }
  }
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = kind === 'nature' ? (R() < 0.5 ? 'rgba(40,80,24,0.5)' : 'rgba(150,190,80,0.4)') : R() < 0.5 ? 'rgba(150,120,80,0.45)' : 'rgba(255,245,210,0.5)';
    x.fillRect(R() * 256, R() * 256, 1, kind === 'nature' ? 2 + R() * 3 : 1);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(kind === 'nature' ? 40 : 26, kind === 'nature' ? 40 : 26);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Un entorno de día: se carga la primera vez que hace falta y se pone y se quita sin rehacerlo (salvo si cambia la distancia de las compuertas). */
export class Scenery {
  readonly root = new Group();
  private kind: 'nature' | 'island' | '' = '';
  private readonly sky = daySky();
  private readonly sea = seaMaterial();
  private skyMesh: Mesh;
  private ground: Mesh | null = null;
  private groundKind = '';
  private seaMesh: Mesh | null = null;
  private plants = new Group();
  private builtKey = '';
  private readonly parts: Record<'nature' | 'island', Record<string, Part[]> | null> = { nature: null, island: null };
  private readonly foot = new Map<string, number>();
  private savedFog: { color: Color; density: number } | null = null;
  private birdT = 3;
  /** Los círculos de lo que no se puede atravesar (troncos, rocas, arbustos), para quien los quiera. */
  solids: { x: number; z: number; r: number }[] = [];

  constructor(private readonly scene: { fog: unknown }) {
    this.skyMesh = new Mesh(new SphereGeometry(85, 32, 16), this.sky);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.userData.noInk = true;
    this.root.add(this.skyMesh, this.plants);
    this.root.visible = false;
  }

  // ---------------------------------------------------------------- cargar los modelos
  private load(kind: 'nature' | 'island'): Record<string, Part[]> | null {
    if (this.parts[kind]) return this.parts[kind];
    const gltf = AssetManager.getGLTF(kind === 'nature' ? 'nature-kit' : 'island-kit');
    if (!gltf) return null;
    const mats: Record<string, Material> = {};
    if (kind === 'nature') {
      for (const [n, [f, alpha, both]] of Object.entries(NAT_TEX)) {
        const t = AssetManager.getTexture(`nature-${f}`) as Texture | undefined;
        if (!t) return null; // (aún cargando las texturas)
        t.flipY = false;
        t.colorSpace = SRGBColorSpace;
        const m = new MeshStandardMaterial({ map: t, roughness: 1, metalness: 0, alphaTest: alpha ? 0.5 : 0, side: alpha || both ? DoubleSide : 0 });
        m.name = n;
        mats[n] = m;
      }
    }
    gltf.scene.updateMatrixWorld(true);
    const out: Record<string, Part[]> = {};
    for (const node of gltf.scene.children) {
      const parts: Part[] = [];
      node.traverse((o: Object3D) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const geo = new BufferGeometry();
        for (const a of ['position', 'normal', 'uv', 'color'] as const) if (m.geometry.attributes[a]) geo.setAttribute(a, natFloat(m.geometry.attributes[a] as BufferAttribute));
        if (m.geometry.index) geo.setIndex(m.geometry.index);
        geo.applyMatrix4(m.matrixWorld); // en metros y con +Y hacia arriba
        const src = m.material as MeshStandardMaterial, key = src.name || src.uuid;
        if (!mats[key]) {
          // mate, como pintado (sin brillos de metal)
          mats[key] = kind === 'island' ? new MeshStandardMaterial({ map: src.map || null, color: src.color, roughness: 0.95, metalness: 0, vertexColors: !!m.geometry.attributes.color }) : src;
        }
        parts.push({ geo, mat: mats[key] });
      });
      out[node.name] = parts;
    }
    this.parts[kind] = out;
    return out;
  }
  private models(kind: 'nature' | 'island', P: Record<string, Part[]>): Models {
    const foot = (n: string): number => {
      const k = `${kind}:${n}`, hit = this.foot.get(k);
      if (hit !== undefined) return hit;
      let m = 0;
      const tree = /Tree|Pine|Palm/.test(n), lim = /Palm/.test(n) ? 0.5 : 0.8;
      for (const p of P[n] || []) {
        if (/Tree|Pine/.test(n) && !/Bark/.test(p.mat.name || '')) continue;
        const a = p.geo.attributes.position;
        for (let i = 0; i < a.count; i++) if (a.getY(i) < lim) m = Math.max(m, Math.hypot(a.getX(i), a.getZ(i)));
      }
      const v = (tree && /Palm/.test(n) ? Math.min(m, 0.45) : m * 0.85) || 0.4;
      this.foot.set(k, v);
      return v;
    };
    const rad = (n: string): number => {
      const k = `r:${kind}:${n}`, hit = this.foot.get(k);
      if (hit !== undefined) return hit;
      let m = 0;
      for (const p of P[n] || []) {
        const a = p.geo.attributes.position;
        for (let i = 0; i < a.count; i++) m = Math.max(m, Math.hypot(a.getX(i), a.getZ(i)));
      }
      this.foot.set(k, m || 1);
      return m || 1;
    };
    return { has: (n) => !!P[n], foot, rad };
  }

  // ---------------------------------------------------------------- poner y quitar
  private clearPlants(): void {
    for (const c of [...this.plants.children]) {
      this.plants.remove(c);
      (c as InstancedMesh).dispose?.();
    }
  }

  /** Lo pone (si ya cargó): `D`, la distancia de las compuertas; `op`, con fondo realista (bosque); `gates`, dónde están. Devuelve si ya se ve. */
  show(kind: 'nature' | 'island', D: number, op: boolean, gates: Gate[]): boolean {
    this.skyMesh.visible = !op; // (con la foto de fondo, sin el cielo dibujado)
    const P = this.load(kind);
    if (!P) return false;
    const key = `${kind}:${D.toFixed(2)}:${op ? 'p' : ''}`;
    if (key !== this.builtKey) {
      this.builtKey = key;
      this.kind = kind;
      this.clearPlants();
      const M = this.models(kind, P), L = kind === 'nature' ? natureLayout(D, op, gates, M) : islandLayout(D, gates, M);
      this.solids = L.solids;
      this.place(P, L.puts, kind);
      this.buildGround(kind);
    }
    if (!this.root.visible) {
      this.root.visible = true;
      const sc = this.scene as { fog: FogExp2 | null };
      if (sc.fog) this.savedFog = { color: sc.fog.color.clone(), density: sc.fog.density };
    }
    // la niebla clara de cada sitio
    const sc = this.scene as { fog: FogExp2 | null };
    if (sc.fog) {
      sc.fog.color.setHex(kind === 'nature' ? 0xc4dcea : 0xbfe2ee);
      sc.fog.density = kind === 'nature' ? 0.014 : 0.009;
    }
    return true;
  }

  private place(P: Record<string, Part[]>, puts: Put[], kind: 'nature' | 'island'): void {
    const by = new Map<string, Matrix4[]>(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    for (const u of puts) {
      const m = new Matrix4().compose(p.set(u.x, u.y, u.z), q.setFromAxisAngle(UP, u.ry), s.setScalar(u.s));
      const l = by.get(u.n);
      if (l) l.push(m);
      else by.set(u.n, [m]);
    }
    for (const [n, list] of by)
      for (const part of P[n]) {
        const im = new InstancedMesh(part.geo, part.mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        im.castShadow = !/Ship|Cliff/.test(n);
        im.receiveShadow = true;
        this.plants.add(im);
      }
    void kind;
  }

  private buildGround(kind: 'nature' | 'island'): void {
    if (this.groundKind === kind) return;
    this.groundKind = kind;
    if (this.ground) {
      this.root.remove(this.ground);
      this.ground.geometry.dispose();
      (this.ground.material as Material).dispose();
    }
    if (this.seaMesh) {
      this.root.remove(this.seaMesh);
      this.seaMesh.geometry.dispose();
      this.seaMesh = null;
    }
    this.ground = new Mesh(new CircleGeometry(kind === 'nature' ? 70 : 30, kind === 'nature' ? 64 : 72), new MeshStandardMaterial({ map: groundTexture(kind), roughness: 1, metalness: 0 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.005;
    this.ground.receiveShadow = true;
    this.ground.userData.noInk = true;
    this.root.add(this.ground);
    if (kind === 'island') {
      this.seaMesh = new Mesh(new RingGeometry(ISL_SHORE - 1.5, 140, 96, 8), this.sea);
      this.seaMesh.rotation.x = -Math.PI / 2;
      this.seaMesh.position.y = 0.01;
      this.seaMesh.userData.noInk = true;
      this.root.add(this.seaMesh);
    }
  }

  /** Lo quita (vuelve la fortaleza) y deja la niebla como estaba. */
  hide(): void {
    if (!this.root.visible) return;
    this.root.visible = false;
    const sc = this.scene as { fog: FogExp2 | null };
    if (sc.fog && this.savedFog) {
      sc.fog.color.copy(this.savedFog.color);
      sc.fog.density = this.savedFog.density;
    }
  }
  get visible(): boolean {
    return this.root.visible;
  }

  /** Cada fotograma: el cielo y el mar se mueven (el cielo, siempre centrado en ti) y, de vez en cuando, canta un pájaro o grita una gaviota. */
  update(dt: number, t: number, head: Vector3, bird: (at: Vector3, island: boolean) => void): void {
    if (!this.root.visible) return;
    this.sky.uniforms.time.value = t % 600;
    this.sea.uniforms.time.value = t % 600;
    this.skyMesh.position.set(head.x, 0, head.z);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      const isl = this.kind === 'island', a = TAU * Math.random(), r = isl ? 12 + Math.random() * 18 : 8 + Math.random() * 10;
      this.birdT = isl ? 3 + Math.random() * 6 : 2.5 + Math.random() * 4.5;
      bird(new Vector3(Math.sin(a) * r, (isl ? 5 : 3) + Math.random() * (isl ? 7 : 4), -Math.cos(a) * r), isl);
    }
  }
}
