/**
 * Las piedras del lanzador en la escena (la parábola y la parada, en src/combat/rock-path.ts): vuelan girando hacia donde
 * estaba tu cabeza; paradas con la mano, salen rebotadas («¡Parada!», con chispas, golpe y vibración); esquivadas, caen
 * («¡Esquivada!»); si te dan, te quitan una vida («¡Pedrada!»). Van en llamas, con su estela y su humo, y estallan al dar
 * (`Missile`, src/style/missile-fx.ts: pedido del usuario, más tipo videojuego). Unas pocas piedras fijas que se reutilizan (sin crear nada
 * en cada fotograma). Como en RepArena (src/70_game.js: throwRock y updateRocks).
 */
import { CircleGeometry, DataTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, RGBAFormat, UnsignedByteType, Vector3 } from '@iwsdk/core';
import { ROCK_HIT, rockAt, rockFlight, rockParry } from './rock-path.js';
import { hands } from '../input/hand-model.js';
import { haptic } from '../input/hand-system.js';
import { GAME, HOOKS } from '../core/state.js';
import { SND } from '../audio/sound.js';
import { LOOK_ROCK, Missile } from '../style/missile-fx.js';
import { looks, looksTick } from '../style/missile-look.js';

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
  fx: Missile;
  /** Su sombra en el suelo, donde va a caer (solo los meteoritos: `mark`), y si ya sonó al acercarse. */
  shade: Mesh;
  mark: boolean;
  near: boolean;
}

/** La sombra de los meteoritos: lo que mide al llegar (m de radio: algo más que lo que da, `ROCK_HIT`, para que salirse de
 * ella baste) y su color. */
const SHADE_R = 0.42, SHADE_COL = 0x140c08;

export class Rocks {
  readonly group = new Group();
  private list: Rock[] = [];
  private p = new Vector3();
  private prev = new Vector3();
  /** Cuántas ha tirado en la ronda (la primera, con su aviso). */
  thrown = 0;
  /** Una sombra, para precompilarla en el menú (src/style/warm.ts: que la primera no dé un tirón). */
  get shadeProto(): Mesh {
    const s = this.list[0].shade;
    return new Mesh(s.geometry, s.material);
  }

  constructor() {
    // (roca de verdad: con bultos, iluminada de un lado y con grietas al rojo que laten: src/style/missile-look.ts)
    const L = looks();
    // (la sombra: una mancha redonda y blanda de color liso, como la del desprendimiento de la Travesía)
    const sn = 32, sd = new Uint8Array(sn * sn * 4);
    for (let y = 0; y < sn; y++) for (let x = 0; x < sn; x++) sd.set([255, 255, 255, Math.round(255 * Math.pow(Math.max(0, 1 - Math.hypot((x + 0.5) / sn - 0.5, (y + 0.5) / sn - 0.5) * 2), 0.7))], (y * sn + x) * 4);
    const st = new DataTexture(sd, sn, sn, RGBAFormat, UnsignedByteType);
    st.magFilter = st.minFilter = LinearFilter;
    st.needsUpdate = true;
    const shadeGeo = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const m = new Mesh(L.geo.meteor, L.mat.meteor);
      m.scale.setScalar(0.085);
      m.userData.noInk = true;
      m.castShadow = true;
      m.visible = false;
      this.group.add(m);
      const fx = new Missile(LOOK_ROCK);
      this.group.add(fx.group);
      const shade = new Mesh(shadeGeo, new MeshBasicMaterial({ color: SHADE_COL, map: st, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
      shade.userData.noInk = true;
      shade.renderOrder = 1;
      shade.visible = false;
      this.group.add(shade);
      this.list.push({ m, on: false, from: new Vector3(), to: new Vector3(), T: 1, h: 0, t: 0, fly: true, vel: new Vector3(), spin: new Vector3(), fx, shade, mark: false, near: false });
    }
  }

  /** Tira una piedra desde from hacia donde está ahora tu cabeza (k: lo deprisa que va, throwK). Con `mark` (los meteoritos,
   * que caen de lo alto y no se ven mirando a los enemigos), su sombra en el suelo donde va a caer: crece y se oscurece
   * mientras cae, y basta con salirse de ella (pedido del usuario: «no he visto que cayeran»). */
  throw(from: Vector3, k: number, mark = false): void {
    const r = this.list.find((x) => !x.on) ?? this.list[0];
    r.from.copy(from);
    r.to.copy(GAME.head);
    const f = rockFlight(r.from.distanceTo(r.to), k);
    Object.assign(r, { T: f.T, h: f.h, t: 0, fly: true, on: true, mark, near: false });
    r.shade.position.set(r.to.x, 0.02, r.to.z);
    r.shade.visible = mark;
    r.spin.set(Math.random() * 18 - 9, Math.random() * 18 - 9, Math.random() * 18 - 9);
    r.m.position.copy(from);
    r.m.visible = true;
    SND.whoosh(from, 'throw');
    this.thrown++; // (sin aviso de texto: ya avisa con su gesto y su voz; decidido por el usuario)
  }

  /** ¿Queda alguna en el aire? (la oleada no acaba con una piedra volando: RepArena, projs) */
  flying(): boolean {
    return this.list.some((r) => r.on && r.fly);
  }

  clear(): void {
    for (const r of this.list) {
      r.on = false;
      r.m.visible = false;
      r.shade.visible = false;
      r.fx.stop();
    }
    this.thrown = 0;
  }

  update(dt: number): void {
    const play = GAME.phase === 'playing';
    looksTick();
    for (const r of this.list) {
      r.fx.update(dt);
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
        r.fx.fly(p, dt, GAME.head);
        if (r.mark) {
          // la sombra: pequeña y tenue al soltarse, grande y oscura al llegar; y, ya cerca, su silbido donde va a caer
          const k = Math.min(1, r.t / r.T), sm = r.shade.material as MeshBasicMaterial;
          r.shade.scale.setScalar(SHADE_R * (0.3 + 0.7 * k * k));
          sm.opacity = 0.15 + 0.6 * k;
          if (!r.near && k > 0.55) {
            r.near = true;
            SND.whoosh(r.to, 'arc');
          }
        }
        const side = play ? rockParry(p, hands) : null;
        if (side) {
          // parada: sale rebotada hacia donde vino
          r.fly = false;
          r.shade.visible = false;
          r.vel.multiplyScalar(-0.45).add(this.prev.set(Math.random() * 2 - 1, 2.2, 0));
          SND.metalHit(p, false);
          HOOKS.sparks(p, 16, 0xffcc80);
          // (el estallido, algo por delante de la mano: pegado a los ojos llenaría la vista)
          r.fx.hit(this.p.copy(p).sub(GAME.head).setLength(Math.max(0.9, p.distanceTo(GAME.head))).add(GAME.head));
          haptic(side, 0.8, 50);
          HOOKS.say('¡Parada!', '#3cf0c6', 0.8);
          HOOKS.score(100, true); // (RepArena: +100 y suma al combo)
          continue;
        }
        if (r.t >= r.T) {
          // llega: ¿sigues ahí?
          if (play && p.distanceTo(GAME.head) < ROCK_HIT) {
            HOOKS.sparks(p, 12, 0xccb399);
            r.fx.hit(this.p.copy(r.from).sub(GAME.head).setLength(1.1).add(GAME.head)); // (a 1,1 m, hacia de donde vino)
            SND.metalHit(p, false);
            HOOKS.say('¡Pedrada!', '#ff3b5c', 1.0);
            HOOKS.playerHit(1);
            r.on = false;
            r.m.visible = false;
            r.shade.visible = false;
            continue;
          }
          r.fly = false;
          r.shade.visible = false;
          if (play) {
            HOOKS.say('¡Esquivada!', '#3cf0c6', 0.8);
            HOOKS.score(50, true);
          }
        }
      } else {
        // parada o esquivada: cae y desaparece
        r.vel.y -= 9.8 * dt;
        r.m.position.addScaledVector(r.vel, dt);
        r.fx.fly(r.m.position, dt, GAME.head);
        if (r.m.position.y < 0.05 || r.t > r.T + 2.5) {
          r.on = false;
          r.m.visible = false;
          if (r.m.position.y < 0.05) r.fx.hit(r.m.position);
          else r.fx.stop();
        }
      }
    }
  }
}
