/**
 * Las piedras del lanzador en la escena (la parábola y la parada, en src/combat/rock-path.ts): vuelan girando hacia donde
 * estaba tu cabeza; paradas con la mano, salen rebotadas («¡Parada!», con chispas, golpe y vibración); esquivadas, caen
 * («¡Esquivada!»); si te dan, te quitan una vida («¡Pedrada!»). Unas pocas piedras fijas que se reutilizan (sin crear nada
 * en cada fotograma). Como en RepArena (src/70_game.js: throwRock y updateRocks).
 */
import { DodecahedronGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import { ROCK_HIT, rockAt, rockFlight, rockParry } from './rock-path.js';
import { hands } from '../input/hand-model.js';
import { haptic } from '../input/hand-system.js';
import { GAME, HOOKS } from '../core/state.js';
import { SND } from '../audio/sound.js';

const N = 8;

interface Rock {
  m: Mesh;
  on: boolean;
  from: Vector3;
  to: Vector3;
  T: number;
  h: number;
  t: number;
  fly: boolean;
  vel: Vector3;
  spin: Vector3;
}

export class Rocks {
  readonly group = new Group();
  private list: Rock[] = [];
  private p = new Vector3();
  private prev = new Vector3();
  /** Cuántas ha tirado en la ronda (la primera, con su aviso). */
  thrown = 0;

  constructor() {
    const geo = new DodecahedronGeometry(0.085, 0), mat = new MeshStandardMaterial({ color: 0x8c7b66, roughness: 0.92, metalness: 0, flatShading: true });
    for (let i = 0; i < N; i++) {
      const m = new Mesh(geo, mat);
      m.castShadow = true;
      m.visible = false;
      this.group.add(m);
      this.list.push({ m, on: false, from: new Vector3(), to: new Vector3(), T: 1, h: 0, t: 0, fly: true, vel: new Vector3(), spin: new Vector3() });
    }
  }

  /** Tira una piedra desde from hacia donde está ahora tu cabeza (k: lo deprisa que va, throwK). */
  throw(from: Vector3, k: number): void {
    const r = this.list.find((x) => !x.on) ?? this.list[0];
    r.from.copy(from);
    r.to.copy(GAME.head);
    const f = rockFlight(r.from.distanceTo(r.to), k);
    Object.assign(r, { T: f.T, h: f.h, t: 0, fly: true, on: true });
    r.spin.set(Math.random() * 18 - 9, Math.random() * 18 - 9, Math.random() * 18 - 9);
    r.m.position.copy(from);
    r.m.visible = true;
    SND.whoosh(from, 'throw');
    if (!this.thrown++) HOOKS.say('¡Te lanza piedras! Apártate o párala con la mano', '#ff8a3d', 2.2, true);
  }

  /** ¿Queda alguna en el aire? (la oleada no acaba con una piedra volando: RepArena, projs) */
  flying(): boolean {
    return this.list.some((r) => r.on && r.fly);
  }

  clear(): void {
    for (const r of this.list) {
      r.on = false;
      r.m.visible = false;
    }
    this.thrown = 0;
  }

  update(dt: number): void {
    const play = GAME.phase === 'playing';
    for (const r of this.list) {
      if (!r.on) continue;
      r.t += dt;
      r.m.rotation.x += r.spin.x * dt;
      r.m.rotation.y += r.spin.y * dt;
      r.m.rotation.z += r.spin.z * dt;
      if (r.fly) {
        this.prev.copy(r.m.position);
        const p = rockAt(r.from, r.to, r.T, r.h, r.t, this.p);
        r.m.position.copy(p);
        r.vel.subVectors(p, this.prev).divideScalar(Math.max(dt, 1e-3));
        const side = play ? rockParry(p, hands) : null;
        if (side) {
          // parada: sale rebotada hacia donde vino
          r.fly = false;
          r.vel.multiplyScalar(-0.45).add(this.prev.set(Math.random() * 2 - 1, 2.2, 0));
          SND.metalHit(p, false);
          HOOKS.sparks(p, 16, 0xffcc80);
          haptic(side, 0.8, 50);
          HOOKS.say('¡Parada!', '#3cf0c6', 0.8);
          HOOKS.score(100, true); // (RepArena: +100 y suma al combo)
          continue;
        }
        if (r.t >= r.T) {
          // llega: ¿sigues ahí?
          if (play && p.distanceTo(GAME.head) < ROCK_HIT) {
            HOOKS.sparks(p, 12, 0xccb399);
            SND.metalHit(p, false);
            HOOKS.say('¡Pedrada!', '#ff3b5c', 1.0);
            HOOKS.playerHit(1);
            r.on = false;
            r.m.visible = false;
            continue;
          }
          r.fly = false;
          if (play) {
            HOOKS.say('¡Esquivada!', '#3cf0c6', 0.8);
            HOOKS.score(50, true);
          }
        }
      } else {
        // parada o esquivada: cae y desaparece
        r.vel.y -= 9.8 * dt;
        r.m.position.addScaledVector(r.vel, dt);
        if (r.m.position.y < 0.05 || r.t > r.T + 2.5) {
          r.on = false;
          r.m.visible = false;
        }
      }
    }
  }
}
