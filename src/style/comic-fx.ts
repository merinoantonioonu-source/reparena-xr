/**
 * Los efectos de cómic (RepArena, src/38_comic.js: comicHit y comicKill): al acertar, líneas de impacto; al derribar, un
 * estallido de estrella (sin palabras: para eso está el sonido). Láminas de cara a ti, de un montón fijo (sin crear
 * nada en cada fotograma); solo en el estilo Cómic. Y el vapor de las compuertas, en nubes de dibujo (Puffs).
 */
import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { COMIC } from './comic.js';

const TAU = Math.PI * 2;
type Kind = 'pop' | 'lines';
interface Fx {
  s: Sprite;
  t: number;
  life: number;
  size: number;
  kind: Kind;
}

// el azar con semilla de RepArena: las mismas estrellas
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
// estrellas de estallido, con sus puntas desiguales (tres variantes), y las líneas de impacto
function stars(): CanvasTexture[] {
  const out: CanvasTexture[] = [];
  for (let v = 0; v < 3; v++) {
    const [cv, x] = canvas(), c = 128, n = 11 + v, R = rng(31 + v), jit = Array.from({ length: n * 2 }, () => 0.8 + R() * 0.25);
    const star = (Ro: number, ri: number, fill: string): void => {
      x.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * TAU, rad = (i % 2 ? ri : Ro) * jit[i];
        x.lineTo(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
      }
      x.closePath();
      x.fillStyle = fill;
      x.fill();
    };
    star(124, 66, '#140c1a');
    star(113, 58, '#ffd23f');
    star(76, 40, '#ff8a3d');
    x.fillStyle = '#fff8e0';
    x.beginPath();
    x.arc(c, c, 22, 0, TAU);
    x.fill();
    out.push(tex(cv));
  }
  return out;
}
function lines(): CanvasTexture {
  const [cv, x] = canvas(), R = rng(5);
  x.fillStyle = '#140c1a';
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + R() * 0.15, r0 = 70 + R() * 25, r1 = 124, w = 0.035 + R() * 0.03;
    x.beginPath();
    x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    x.lineTo(128 + Math.cos(a - w) * r1, 128 + Math.sin(a - w) * r1);
    x.lineTo(128 + Math.cos(a + w) * r1, 128 + Math.sin(a + w) * r1);
    x.closePath();
    x.fill();
  }
  return tex(cv);
}

export class ComicFx {
  readonly group = new Group();
  private list: Fx[] = [];
  private next = 0;
  private stars: CanvasTexture[];
  private lines: CanvasTexture;

  constructor(n = 24) {
    this.stars = stars();
    this.lines = lines();
    for (let i = 0; i < n; i++) {
      const s = new Sprite(new SpriteMaterial({ map: this.lines, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      s.renderOrder = 9;
      this.group.add(s);
      this.list.push({ s, t: 0, life: 0, size: 0, kind: 'lines' });
    }
  }

  private add(map: CanvasTexture, p: Vector3, size: number, life: number, kind: Kind): void {
    const f = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    const m = f.s.material as SpriteMaterial;
    m.map = map;
    m.rotation = Math.random() * TAU;
    m.opacity = 1;
    f.s.position.copy(p);
    f.s.scale.setScalar(0.001);
    f.s.visible = true;
    Object.assign(f, { t: 0, life, size, kind });
  }

  /** Al acertar: líneas de impacto. */
  hit(p: Vector3): void {
    if (COMIC.on) this.add(this.lines, p, 0.45, 0.24, 'lines');
  }

  /** Al derribar: la estrella y las líneas, más grandes. */
  kill(p: Vector3, big = false): void {
    if (!COMIC.on) return;
    this.add(this.stars[(Math.random() * 3) | 0], p, big ? 0.8 : 0.5, 0.45, 'pop');
    this.add(this.lines, p, big ? 1.5 : 0.95, 0.3, 'lines');
  }

  update(dt: number): void {
    for (const f of this.list) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.life, m = f.s.material as SpriteMaterial;
      if (k >= 1) {
        f.s.visible = false;
        continue;
      }
      let sc = f.size;
      if (f.kind === 'pop') {
        // salta, se asienta y se va
        sc *= k < 0.1 ? 1.25 * smooth(k / 0.1) : k < 0.2 ? 1.25 - (0.25 * (k - 0.1)) / 0.1 : 1;
        m.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        f.s.position.y += dt * 0.12;
      } else {
        sc *= 0.6 + 0.9 * k;
        m.opacity = 1 - k * k;
      }
      f.s.scale.set(sc, sc, 1);
    }
  }
}
const smooth = (x: number): number => x * x * (3 - 2 * x);

// la nube de dibujo de RepArena (src/38_comic.js: cfxTex, puff): blanca, con el borde entintado y la panza lavanda
function puff(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#140c1a';
  x.beginPath();
  x.arc(64, 64, 60, 0, TAU);
  x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(64, 64, 53, 0, TAU);
  x.fill();
  x.fillStyle = '#d9cdf0';
  x.beginPath();
  x.arc(64, 64, 53, 0.15 * Math.PI, 0.85 * Math.PI);
  x.arc(64, 44, 48, 0.8 * Math.PI, 0.2 * Math.PI, true);
  x.fill();
  return tex(c);
}

/**
 * Bocanadas de vapor (las de las compuertas al abrirse: RepArena, fx.steam), en las nubes de dibujo de las explosiones
 * de cómic de RepArena: salen disparadas, se frenan, crecen y se van. De un montón fijo (sin crear nada en cada
 * fotograma); en los dos estilos, como el vapor de RepArena.
 */
export class Puffs {
  readonly group = new Group();
  private list: { s: Sprite; v: Vector3; t: number; life: number; size: number }[] = [];
  private next = 0;

  constructor(n = 36) {
    const map = puff();
    for (let i = 0; i < n; i++) {
      const s = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      s.renderOrder = 9;
      this.group.add(s);
      this.list.push({ s, v: new Vector3(), t: 0, life: 1, size: 0.6 });
    }
  }

  /** Una bocanada en p, que sale a la velocidad v (m/s); size: lo que mide (m) y life, lo que dura (s). */
  add(p: Vector3, v: Vector3, size: number, life: number): void {
    const f = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    f.s.position.copy(p);
    f.v.copy(v);
    Object.assign(f, { t: 0, life, size });
    const m = f.s.material as SpriteMaterial;
    m.rotation = Math.random() * TAU;
    m.opacity = 1;
    f.s.scale.setScalar(0.001);
    f.s.visible = true;
  }

  update(dt: number): void {
    for (const f of this.list) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.s.visible = false;
        continue;
      }
      // (como las nubes de las explosiones de cómic de RepArena: crecen deprisa y se van al final; frenadas como su vapor)
      const sc = f.size * (0.35 + 0.9 * smooth(Math.min(1, k * 1.7)));
      f.s.scale.set(sc, sc, 1);
      (f.s.material as SpriteMaterial).opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      f.s.position.addScaledVector(f.v, dt);
      f.v.multiplyScalar(Math.max(0, 1 - dt * 1.5));
    }
  }
}
