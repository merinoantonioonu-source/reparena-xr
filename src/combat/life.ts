/**
 * Las cuentas de vida (RepArena, src/70_game.js: LIFE y lifeStep; opción A elegida por el usuario): encima de cada
 * enemigo, desde que sale, una fila de bolitas doradas de cara a ti, una por disparo normal que le queda; las que pierde
 * desaparecen (encogen con un destello, no se quedan huecas) y las demás se juntan. Los que aguantan más de 8, bolitas
 * grandes de 5 (más anaranjadas, con un aro claro) y las sueltas. Todas en un solo dibujo (puntos en la tarjeta gráfica,
 * sin contorno de cómic ni niebla), con los mismos números y el mismo sombreado que en RepArena.
 */
import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3, type WebGLRenderer } from '@iwsdk/core';

const LIFE_N = 192, LIFE_ROW = 6, LIFE_BIG = 5, LIFE_GAP = 0.3; // (cuántas como mucho a la vez, por fila, lo que vale una grande y el hueco entre ellas, en diámetros)
const DIA = 0.065; // (6,5 cm cada bolita; la grande, casi una vez y media)

interface Bead {
  k: number;
  x: number;
  y: number;
  s: number;
  die: boolean;
  pop: number;
  fresh: boolean;
}
interface BeadSet {
  b: Bead[];
  at: Vector3;
  seen: boolean;
  hp: number;
  max: number;
}

const beadD = (b: Bead): number => DIA * (b.k ? 1.45 : 1);

export class LifeBeads {
  readonly points: Points;
  private g = new BufferGeometry();
  private pos = new Float32Array(LIFE_N * 3);
  private size = new Float32Array(LIFE_N);
  private kind = new Float32Array(LIFE_N);
  private pop = new Float32Array(LIFE_N);
  private sets = new Map<object, BeadSet>();
  private mat: ShaderMaterial;
  private r = new Vector3();
  private a = new Vector3();

  constructor() {
    const g = this.g;
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    g.setAttribute('aKind', new BufferAttribute(this.kind, 1));
    g.setAttribute('aPop', new BufferAttribute(this.pop, 1));
    g.setDrawRange(0, 0);
    this.mat = new ShaderMaterial({
      uniforms: { uVH: { value: 1000 } },
      vertexShader: `attribute float aSize, aKind, aPop; uniform float uVH; varying float vKind, vPop, vPx;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float px = aSize * projectionMatrix[1][1] * uVH * 0.5 / max(0.05, -mv.z); gl_PointSize = aSize > 0.0 ? clamp(px, 3.0, 220.0) : 0.0;
          vKind = aKind; vPop = aPop; vPx = max(px, 3.0); }`,
      fragmentShader: `varying float vKind, vPop, vPx;
        void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d = length(q); if (d > 1.0) discard; float aa = 2.5 / vPx;
          vec2 h = q - vec2(-0.32, -0.36); float hl = exp(-dot(h, h) * 5.0);
          vec3 lo = mix(vec3(0.93, 0.60, 0.11), vec3(0.88, 0.38, 0.10), vKind), mid = mix(vec3(1.0, 0.83, 0.36), vec3(1.0, 0.66, 0.2), vKind);
          vec3 c = mix(lo, mid, clamp(1.1 - d * 1.2, 0.0, 1.0)); c = mix(c, vec3(1.0, 0.98, 0.9), hl * 0.85);
          c = mix(c, vec3(1.0, 0.95, 0.75), vKind * smoothstep(0.47, 0.5, d) * (1.0 - smoothstep(0.57, 0.6, d)));
          c = mix(c, vec3(0.106, 0.071, 0.149), smoothstep(0.74 - aa, 0.74, d));
          gl_FragColor = vec4(mix(c, vec3(1.0, 1.0, 0.92), vPop), 1.0 - smoothstep(1.0 - aa, 1.0, d)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 40;
    this.points.userData.noInk = true; // (sin contorno de tinta)
  }

  /** Empieza un fotograma: luego, add() por cada enemigo en pie y end(). */
  begin(): void {
    for (const S of this.sets.values()) S.seen = false;
  }

  /** Un enemigo en pie (key: lo que lo identifica), con sus bolitas en (x, y, z): le quedan hp de max. */
  add(key: object, x: number, y: number, z: number, hp: number, max: number): void {
    let S = this.sets.get(key);
    if (!S) this.sets.set(key, (S = { b: [], at: new Vector3(), seen: false, hp: 0, max: 0 }));
    S.at.set(x, y, z);
    S.seen = true;
    S.hp = hp;
    S.max = max;
  }

  /** Coloca las bolitas de todos, de cara a ti (head), y las pasa a la tarjeta gráfica. */
  end(dt: number, head: Vector3, renderer: WebGLRenderer): void {
    for (const [key, S] of this.sets) {
      const hp = S.seen ? Math.max(0, Math.ceil(S.hp)) : 0, big = S.seen && S.max > 8 ? Math.floor(hp / LIFE_BIG) : 0, small = hp - big * LIFE_BIG;
      // las que sobran se van (primero las sueltas, de la derecha); si faltan sueltas (se rompió una grande), salen nuevas
      for (const [k, want] of [
        [1, big],
        [0, small],
      ]) {
        const on = S.b.filter((b) => b.k === k && !b.die);
        for (let i = want; i < on.length; i++) {
          on[i].die = true;
          on[i].pop = 1;
        }
        for (let i = on.length; i < want; i++) S.b.push({ k, x: 0, y: 0, s: 0, die: false, pop: 0, fresh: true }); // (salen creciendo)
      }
      // su sitio: centradas, en filas de 6 (las grandes primero, arriba), cada fila tan ancha como sus bolitas
      const on = S.b.filter((b) => !b.die).sort((p, q) => q.k - p.k), gap = DIA * LIFE_GAP;
      let y0 = 0;
      for (let r0 = Math.floor((on.length - 1) / LIFE_ROW) * LIFE_ROW; r0 >= 0; r0 -= LIFE_ROW) {
        const R = on.slice(r0, r0 + LIFE_ROW), w = R.reduce((a, b) => a + beadD(b), 0) + gap * (R.length - 1), h = Math.max(...R.map(beadD));
        let x = -w / 2;
        for (const b of R) {
          const tx = x + beadD(b) / 2, ty = y0 + h / 2;
          x += beadD(b) + gap;
          if (b.fresh) {
            b.x = tx;
            b.y = ty;
            b.fresh = false;
          } else {
            const k = Math.min(1, dt * 12);
            b.x += (tx - b.x) * k;
            b.y += (ty - b.y) * k;
          }
          b.s = Math.min(1, b.s + dt * 6);
        }
        y0 += h + gap;
      }
      for (const b of S.b)
        if (b.die) {
          b.s -= dt / 0.18; // (encoge en 0,18 s con un destello)
          b.pop = Math.max(0, b.pop - dt * 5);
        }
      S.b = S.b.filter((b) => b.s > 0);
      if (!S.b.length && !S.seen) this.sets.delete(key);
    }
    // a los puntos: de cara a ti, la fila de lado a lado según desde dónde la miras
    let n = 0;
    for (const S of this.sets.values()) {
      this.r.set(head.z - S.at.z, 0, S.at.x - head.x);
      if (this.r.lengthSq() < 1e-6) this.r.set(1, 0, 0);
      this.r.normalize();
      for (const b of S.b) {
        if (n >= LIFE_N) break;
        const d = beadD(b) * (b.die ? 1 + 0.35 * (1 - b.s) : 1) * Math.max(0, b.s); // (al irse, crece un poco mientras se apaga)
        this.a.copy(S.at).addScaledVector(this.r, b.x);
        this.a.y += b.y;
        this.pos[n * 3] = this.a.x;
        this.pos[n * 3 + 1] = this.a.y;
        this.pos[n * 3 + 2] = this.a.z;
        this.size[n] = b.die ? d * Math.min(1, b.s * 1.6) : d;
        this.kind[n] = b.k;
        this.pop[n] = b.pop;
        n++;
      }
    }
    this.g.setDrawRange(0, n);
    this.points.visible = n > 0;
    for (const k of ['position', 'aSize', 'aKind', 'aPop']) (this.g.attributes[k] as BufferAttribute).needsUpdate = true;
    // el alto de la imagen de cada ojo (en las gafas) o de la ventana: de ahí sale el tamaño de cada bolita en píxeles
    const L = renderer.xr.isPresenting ? renderer.xr.getSession()?.renderState.baseLayer : null;
    this.mat.uniforms.uVH.value = L?.framebufferHeight || renderer.domElement.height || 1000;
  }

  /** Cuántas bolitas hay ahora (para las pruebas). */
  get count(): number {
    return this.g.drawRange.count;
  }
}
