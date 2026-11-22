/**
 * Lo que lanzan los enemigos, realista (pedido del usuario: primero, «más impresionante, tipo videojuego»; luego, «se ve
 * tosco: mucho más realista»). Cada proyectil es una bola de verdad y lo que suelta al volar, con las partículas de
 * `vfx()` (src/style/vfx.ts: llamas, humo, polvo, nieve y gotas con textura de ruido, que cambian de color con la edad):
 *
 * - **fuego** (la bola del demonio y la del Demonio verde): un núcleo al rojo que deja lenguas de fuego y una columna de humo;
 *   al dar, una explosión (bola de llamas, humo que sube y pavesas);
 * - **nieve** (el Yeti): una bola de nieve que suelta polvo de nieve; al dar, se deshace en una nube y copos;
 * - **baba** (el cangrejo): una bola verde brillante que tiembla y gotea; al dar, salpica;
 * - **plasma** (el Alien alto): un núcleo blanco con llamas violetas y chispazos;
 * - **meteoro** (las piedras del lanzador, en Combate: la bola es la piedra): fuego y humo detrás; al dar, explosión.
 *
 * Las bolas tienen relieve, luz y sombra y su textura viva (src/style/missile-look.ts: roca fundida, plasma, nieve y baba)
 * y se mueven como cosas de verdad: la roca, la nieve y la de fuego van dando vueltas sobre sí mismas (cada una a su aire); la
 * baba se estira en la dirección en que vuela y tiembla; el plasma gira con sus anillos.
 *
 * Mientras el enemigo lo prepara, crece en su mano con lo suyo girando hacia él. Hecho al empezar y reutilizado: cada
 * fotograma solo se mueve (nada se crea). La bola, pegada a los ojos, no se pinta.
 */
import { Group, Mesh, Quaternion, Vector3 } from '@iwsdk/core';
import { looks, looksTick } from './missile-look.js';
import { PAL, vfx } from './vfx.js';

export type MissileKind = 'fire' | 'greenFire' | 'snow' | 'slime' | 'plasma' | 'meteor';
/** Cómo es: su clase y su tamaño (m, el radio de la bola). */
export interface MissileLook {
  kind: MissileKind;
  size: number;
}

const r = (a: number, b: number): number => a + (b - a) * Math.random();

export class Missile {
  readonly group = new Group();
  private readonly ball: Mesh;
  /** Los anillos del plasma. */
  private readonly rings: Mesh[];
  /** Cómo da vueltas en el aire (un eje y una velocidad al azar en cada lanzamiento) y lo que lleva girado. */
  private readonly spinAxis = new Vector3(0, 1, 0);
  private spinRate = 4;
  private readonly spinQ = new Quaternion();
  private readonly q = new Quaternion();
  private readonly fwd = new Vector3(0, 0, 1);
  private look!: MissileLook;
  private readonly p = new Vector3();
  private readonly vel = new Vector3();
  private readonly tmp = new Vector3();
  private mode: 'off' | 'charge' | 'fly' | 'coast' = 'off';
  private coastT = 0;
  private t = 0;
  private k = 1;
  /** Lo que lleva sin soltar (s): suelta partículas a su ritmo, sea cual sea el de los fotogramas. */
  private acc = 0;
  private near = false;

  constructor(look: MissileLook) {
    const Lk = looks();
    this.ball = new Mesh(Lk.geo.fire, Lk.mat.fire);
    this.ball.userData.noInk = true;
    this.ball.visible = false;
    this.rings = [0, 1].map(() => {
      const m = new Mesh(Lk.ring, Lk.ringMat);
      m.userData.noInk = true;
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.group.add(this.ball);
    this.setLook(look);
  }

  /** Cambia lo que es (el jefe de cada mundo lanza lo suyo): solo cambia de bola, nada nuevo. */
  setLook(look: MissileLook): void {
    this.look = look;
    const Lk = looks();
    this.ball.geometry = Lk.geo[look.kind];
    this.ball.material = Lk.mat[look.kind];
  }

  get busy(): boolean {
    return this.mode !== 'off';
  }

  /** En la mano del que lo lanza, creciendo (`k` de 0 a 1). */
  charge(at: Vector3, k: number): void {
    if (this.mode !== 'charge') {
      // un giro nuevo para este lanzamiento: cada uno da vueltas a su manera
      this.spinAxis.set(r(-1, 1), r(-1, 1), r(-1, 1)).normalize();
      this.spinRate = this.look.kind === 'snow' ? r(5, 9) : this.look.kind === 'plasma' ? r(1, 2) : r(3, 6);
    }
    this.mode = 'charge';
    this.k = Math.max(0.05, Math.min(1, k));
    this.p.copy(at);
  }

  /** Volando: va por `at` (fotograma a fotograma); `eye`, tus ojos (pegada a ellos, la bola no se pinta). */
  fly(at: Vector3, dt: number, eye: Vector3): void {
    if (this.mode === 'fly' && dt > 0) this.vel.subVectors(at, this.p).divideScalar(dt);
    else this.vel.set(0, 0, 0);
    this.mode = 'fly';
    this.k = 1;
    this.p.copy(at);
    this.near = at.distanceTo(eye) < 0.5;
  }

  /** Esquivado: sigue de largo `dur` s con la velocidad que llevaba y se apaga. */
  coast(dur = 0.35): void {
    if (this.mode !== 'fly') return this.stop();
    this.mode = 'coast';
    this.coastT = dur;
  }

  /** Da (en ti o en el suelo): lo suyo al estallar en `at`; `big`, más grande (lo del demonio y el de un jefe). */
  hit(at: Vector3, big = false): void {
    this.mode = 'off';
    this.ball.visible = false;
    for (const g of this.rings) g.visible = false;
    const V = vfx(), k = (big ? 1.35 : 1) * (this.look.size / 0.1);
    switch (this.look.kind) {
      case 'fire':
      case 'meteor':
        V.explode(at, Math.max(0.6, k));
        if (this.look.kind === 'meteor') V.bits(at, 10, 0.05, 3, 0.9, PAL.debris);
        break;
      case 'greenFire':
        V.explode(at, Math.max(0.6, k), PAL.greenFire, PAL.greenSmoke);
        break;
      case 'plasma':
        V.flames(at, 26, 0.16 * k, 0.45, PAL.plasma, 2.6, 0.2);
        V.flames(at, 18, 0.04, 0.3, PAL.plasma, 5, 0.5, 1);
        break;
      case 'snow':
        V.puffs(at, 18, 0.18 * k, 1.1, PAL.snow, 1.6, 0.2, 3, 0.75);
        V.bits(at, 22, 0.05, 3.2, 0.9, PAL.snow);
        V.flames(at, 8, 0.05, 0.4, PAL.frost, 3, 0.3, 0.8);
        break;
      case 'slime':
        V.bits(at, 26, 0.06, 3.4, 0.8, PAL.slime, 0.95);
        V.puffs(at, 6, 0.1 * k, 0.5, PAL.slime, 1.2, 0, 2, 0.5);
        V.flames(at, 8, 0.09, 0.3, PAL.slimeGlow, 2, 0, 0.6);
        break;
    }
  }

  stop(): void {
    this.mode = 'off';
    this.ball.visible = false;
    for (const g of this.rings) g.visible = false;
  }

  /** Cada fotograma: la bola y lo que suelta (a su ritmo, por segundos). */
  update(dt: number): void {
    if (this.mode === 'off' || dt <= 0) return;
    this.t += dt;
    if (this.mode === 'coast') {
      this.p.addScaledVector(this.vel, dt);
      this.coastT -= dt;
      if (this.coastT <= 0) return this.stop();
    }
    looksTick();
    const L = this.look, sz = L.size * this.k, kind = L.kind, B = this.ball;
    // la bola (la del meteoro la pone quien la lanza: su piedra)
    B.visible = kind !== 'meteor' && !this.near;
    const speed = this.vel.length();
    if (B.visible) {
      B.position.copy(this.p);
      if (kind === 'slime' && speed > 0.5) {
        // la baba: estirada en la dirección en que vuela (más cuanto más deprisa), temblando (lo pone su sombreador)
        this.q.setFromUnitVectors(this.fwd, this.tmp.copy(this.vel).divideScalar(speed));
        B.quaternion.copy(this.q);
        const st = Math.min(0.55, speed * 0.05);
        B.scale.set(sz * (1 - st * 0.35), sz * (1 - st * 0.35), sz * (1 + st));
      } else {
        // dando vueltas sobre sí misma, a su aire
        this.spinQ.setFromAxisAngle(this.spinAxis, this.spinRate * dt);
        B.quaternion.premultiply(this.spinQ);
        const beat = kind === 'plasma' ? 0.05 * Math.sin(this.t * 23) : kind === 'slime' ? 0.06 * Math.sin(this.t * 17) : 0;
        B.scale.setScalar(sz * (1 + beat));
      }
    }
    // los anillos del plasma: giran, cada uno en su plano, alrededor de la bola
    for (let i = 0; i < this.rings.length; i++) {
      const g = this.rings[i];
      g.visible = B.visible && kind === 'plasma';
      if (!g.visible) continue;
      g.position.copy(this.p);
      g.scale.setScalar(sz);
      g.rotation.set(this.t * (i ? 2.3 : -1.7) + i * 1.1, this.t * (i ? -1.3 : 2.1), i * 0.9);
    }
    // lo que suelta: cada 1/60 s, aunque los fotogramas vayan a otro ritmo
    this.acc += dt;
    const V = vfx(), charge = this.mode === 'charge';
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      if (charge) {
        // preparándolo: lo suyo gira y se le acerca
        const an = r(0, 6.283), d = L.size * r(2.5, 4);
        this.tmp.set(this.p.x + Math.cos(an) * d, this.p.y + r(-1, 1) * d * 0.5, this.p.z + Math.sin(an) * d);
        const pal = kind === 'snow' ? PAL.frost : kind === 'slime' ? PAL.slimeGlow : kind === 'plasma' ? PAL.plasma : kind === 'greenFire' ? PAL.greenFire : PAL.fire;
        V.light.emit(this.tmp.x, this.tmp.y, this.tmp.z, (this.p.x - this.tmp.x) * 3, (this.p.y - this.tmp.y) * 3, (this.p.z - this.tmp.z) * 3, L.size * 0.6, 0.5, 0.3, pal[0], pal[1], 0.8, 0, 0);
        continue;
      }
      // en vuelo: un poco hacia atrás de la bola (lo que suelta se queda en el aire y la bola sigue)
      const back = 0.025;
      this.tmp.copy(this.p).addScaledVector(this.vel, -back);
      switch (kind) {
        case 'fire':
        case 'meteor':
          // (las llamas, detrás y algo menores que la bola: que se vea la roca al rojo, no solo un resplandor)
          V.flames(this.tmp, 2, sz * (kind === 'meteor' ? 1.6 : 1.25), 0.3, PAL.fire, 0.25, 0.45, 0.7);
          if (Math.random() < 0.22) V.puffs(this.tmp, 1, sz, 0.8, PAL.smoke, 0.12, 0.3, 2.2, 0.25);
          break;
        case 'greenFire':
          V.flames(this.tmp, 2, sz * 1.25, 0.3, PAL.greenFire, 0.25, 0.45, 0.7);
          if (Math.random() < 0.22) V.puffs(this.tmp, 1, sz, 0.8, PAL.greenSmoke, 0.12, 0.3, 2.2, 0.25);
          break;
        case 'plasma':
          V.flames(this.tmp, 2, sz * 1.1, 0.22, PAL.plasma, 0.4, 0.05, 0.6);
          if (Math.random() < 0.3) V.flames(this.p, 1, 0.03, 0.18, PAL.plasma, 4, 0, 1);
          break;
        case 'snow':
          if (Math.random() < 0.5) V.puffs(this.tmp, 1, sz * 0.6, 0.5, PAL.snow, 0.15, 0.05, 2, 0.4);
          if (Math.random() < 0.3) V.bits(this.p, 1, 0.025, 0.6, 0.6, PAL.snow);
          break;
        case 'slime':
          if (Math.random() < 0.45) V.bits(this.tmp, 1, sz * 0.5, 0.3, 0.6, PAL.slime, 0.95, 0.2);
          if (Math.random() < 0.4) V.flames(this.tmp, 1, sz * 1.2, 0.18, PAL.slimeGlow, 0.1, 0, 0.45);
          break;
      }
    }
  }
}

/** Los de cada enemigo: el escupitajo del cangrejo, la bola de fuego del demonio y la piedra en llamas del lanzador. */
export const LOOK_SPIT: MissileLook = { kind: 'slime', size: 0.06 };
export const LOOK_FIRE: MissileLook = { kind: 'fire', size: 0.1 };
export const LOOK_ROCK: MissileLook = { kind: 'meteor', size: 0.06 };
/** Los jefes: el Yeti, una bola de nieve; el Demonio verde, fuego verde; el Alien alto, plasma; el Capitán, una bala de cañón
 * en llamas. */
export const LOOK_BOSS: MissileLook[] = [
  { kind: 'snow', size: 0.16 },
  { kind: 'greenFire', size: 0.13 },
  { kind: 'plasma', size: 0.11 },
  { kind: 'meteor', size: 0.12 },
];
/** La bala del cañonazo del barco (la costa). */
export const LOOK_CANNON: MissileLook = { kind: 'meteor', size: 0.13 };
