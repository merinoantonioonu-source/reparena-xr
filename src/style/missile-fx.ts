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
 * Mientras el enemigo lo prepara, crece en su mano con lo suyo girando hacia él. Hecho al empezar y reutilizado: cada
 * fotograma solo se mueve (nada se crea). La bola, pegada a los ojos, no se pinta.
 */
import { Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { warmKeep } from './warm.js';
import { PAL, vfx } from './vfx.js';

export type MissileKind = 'fire' | 'greenFire' | 'snow' | 'slime' | 'plasma' | 'meteor';
/** Cómo es: su clase y su tamaño (m, el radio de la bola). */
export interface MissileLook {
  kind: MissileKind;
  size: number;
}

const SPHERE = new SphereGeometry(1, 20, 14);
/** Las bolas de cada clase (una de cada, compartidas: hechas al pedir la primera). */
let mats: Record<Exclude<MissileKind, 'meteor'>, Material> | null = null;
function ballMats(): NonNullable<typeof mats> {
  if (mats) return mats;
  const glow = (hex: number): MeshBasicMaterial => new MeshBasicMaterial({ color: hex, toneMapped: false });
  mats = {
    fire: glow(0xffd27a),
    greenFire: glow(0xdcff9a),
    plasma: glow(0xf2c2ff),
    // (no estándar: el sombreado de cómic las rayaba; la nieve, mate; la baba, brillante)
    snow: new MeshLambertMaterial({ color: 0xf2f8ff, emissive: new Color(0x3a4450) }),
    slime: new MeshPhongMaterial({ color: 0x7ad62a, emissive: new Color(0x2a6a0a), shininess: 90, specular: new Color(0xeaffd0), transparent: true, opacity: 0.92 }),
  };
  for (const m of Object.values(mats)) warmKeep(new Mesh(SPHERE, m));
  return mats;
}

const r = (a: number, b: number): number => a + (b - a) * Math.random();

export class Missile {
  readonly group = new Group();
  private readonly ball: Mesh;
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
    this.ball = new Mesh(SPHERE, ballMats().fire);
    this.ball.userData.noInk = true;
    this.ball.visible = false;
    this.group.add(this.ball);
    this.setLook(look);
  }

  /** Cambia lo que es (el jefe de cada mundo lanza lo suyo): solo cambia de bola, nada nuevo. */
  setLook(look: MissileLook): void {
    this.look = look;
    if (look.kind !== 'meteor') this.ball.material = ballMats()[look.kind];
  }

  get busy(): boolean {
    return this.mode !== 'off';
  }

  /** En la mano del que lo lanza, creciendo (`k` de 0 a 1). */
  charge(at: Vector3, k: number): void {
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
    const L = this.look, sz = L.size * this.k, kind = L.kind, B = this.ball;
    // la bola: quieta en su forma la de nieve; la de baba, temblando; las de fuego y plasma, latiendo
    B.visible = kind !== 'meteor' && !this.near;
    if (B.visible) {
      B.position.copy(this.p);
      const beat = kind === 'slime' ? 0.12 * Math.sin(this.t * 19) : kind === 'snow' ? 0 : 0.08 * Math.sin(this.t * 31);
      B.scale.set(sz * (1 + beat), sz * (1 - beat), sz * (1 + beat * 0.5));
      B.rotation.x += dt * 6;
      B.rotation.y += dt * 4;
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
      const back = 0.02;
      this.tmp.copy(this.p).addScaledVector(this.vel, -back);
      switch (kind) {
        case 'fire':
        case 'meteor':
          V.flames(this.tmp, 3, sz * (kind === 'meteor' ? 2 : 2.3), 0.38, PAL.fire, 0.3, 0.5);
          if (Math.random() < 0.3) V.puffs(this.tmp, 1, sz * 1.2, 1, PAL.smoke, 0.15, 0.35, 3, 0.3);
          break;
        case 'greenFire':
          V.flames(this.tmp, 3, sz * 2.3, 0.38, PAL.greenFire, 0.3, 0.5);
          if (Math.random() < 0.3) V.puffs(this.tmp, 1, sz * 1.2, 1, PAL.greenSmoke, 0.15, 0.35, 3, 0.3);
          break;
        case 'plasma':
          V.flames(this.tmp, 3, sz * 2, 0.26, PAL.plasma, 0.5, 0.1);
          if (Math.random() < 0.3) V.flames(this.p, 1, 0.03, 0.18, PAL.plasma, 4, 0, 1);
          break;
        case 'snow':
          if (Math.random() < 0.7) V.puffs(this.tmp, 1, sz * 0.9, 0.7, PAL.snow, 0.2, 0.05, 2.6, 0.55);
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
/** Los jefes: el Yeti, una bola de nieve; el Demonio verde, fuego verde; el Alien alto, plasma. */
export const LOOK_BOSS: MissileLook[] = [
  { kind: 'snow', size: 0.16 },
  { kind: 'greenFire', size: 0.13 },
  { kind: 'plasma', size: 0.11 },
];
