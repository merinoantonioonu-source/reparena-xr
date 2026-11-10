/**
 * La batalla diminuta bajo tu cara (flexiones y plancha con un brazo), como en RepArena (src/70_game.js: Spider y
 * HatchBeast, floorDetour y floorBoardKeep; src/30_env.js: las trampillas): los bichos de las trampillas (cangrejo, seta y
 * calavera, de unos 20 cm; el jefe, 2,4 veces más) salen de una trampilla del suelo y corretean a rachas hasta su sitio,
 * delante de tus manos (en la plancha con un brazo, por el costado); por el camino amenazan dando un saltito; al llegar se
 * alzan y saltan a morderte; luego retroceden y vuelven. Rodean el marcador tumbado en el suelo y nunca lo pisan. Un
 * disparo los empuja unos centímetros (y, si estaban alzados, les quita el ataque). Las arañas de RepArena, geométricas,
 * no (decisión del usuario).
 * En coordenadas de la arena (delante es −Z; tu cabeza, HL). Sin IWSDK: se compara con el código de RepArena en
 * tests/compare/hatch.compare.test.ts.
 */
import { Vector3 } from 'three';

/** Las trampillas (RepArena: hatchPos; en la plancha con un brazo, hatchSide: delante y a los lados). */
export const HATCH_POS: [number, number][] = [[-0.75, -1.85], [0.75, -1.85], [-1.6, -1.15], [1.6, -1.15]];
export const HATCH_SIDE: [number, number][] = [[-0.95, -1.8], [0.95, -1.8], [-1.45, -1.25], [1.45, -1.25]];
/** El marcador tumbado en el suelo (76 × 33 cm, centrado 95 cm por delante): sólido para ellos (RepArena: FLOORB). */
export const FLOORB = { hw: 0.4, z0: -1.13, z1: -0.77 };
/** Lo que se frenan los empujones (RepArena: SHOVE_K). */
const SHOVE_K = 7;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrapAng = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const _a = new Vector3(), _b = new Vector3(), _fd = new Vector3();

/** Rodear el marcador del suelo: si el camino lo cruza, primero de lado y luego lo bordea (RepArena: floorDetour). */
export function floorDetour(on: boolean, p: Vector3, to: Vector3, r: number): Vector3 {
  if (!on) return to;
  const hw = FLOORB.hw + r, z0 = FLOORB.z0 - r, z1 = FLOORB.z1 + r, zm = (z0 + z1) / 2;
  if ((p.z - zm) * (to.z - zm) >= 0 || Math.abs(p.z - to.z) < 1e-4) return to; // (no lo cruza)
  const xm = p.x + ((to.x - p.x) * (zm - p.z)) / (to.z - p.z);
  if (Math.abs(xm) >= hw) return to;
  const sx = Math.sign(p.x || xm || 1), back = p.z < zm, side = Math.abs(p.x) >= hw * 0.98;
  return _fd.set(sx * hw * 1.08, 0, side ? (back ? z1 + 0.03 : z0 - 0.03) : back ? z0 - 0.01 : z1 + 0.01);
}
/** Y nunca se mete en él: sale por el lado más corto (RepArena: floorBoardKeep). */
export function floorBoardKeep(on: boolean, p: Vector3, r: number): void {
  if (!on) return;
  const hw = FLOORB.hw + r, z0 = FLOORB.z0 - r, z1 = FLOORB.z1 + r;
  if (Math.abs(p.x) >= hw || p.z <= z0 || p.z >= z1) return;
  const dx = hw - Math.abs(p.x), dz0 = p.z - z0, dz1 = z1 - p.z, m = Math.min(dx, dz0, dz1);
  if (m === dx) p.x = Math.sign(p.x || 1) * hw;
  else if (m === dz0) p.z = z0;
  else p.z = z1;
}

export interface HatchEnv {
  /** Tu cabeza (en la arena), si es la partida (play) o el descanso (active), y si va el marcador del suelo. */
  HL: Vector3;
  play: boolean;
  active: boolean;
  board: boolean;
  /** Los demás (para no pisarse). */
  others: readonly HatchFoe[];
}

export type HatchMode = 'emerge' | 'run' | 'threat' | 'rear' | 'lunge' | 'recoil' | 'dying';

/** Un bicho de las trampillas (RepArena: Spider con HatchBeast: sin patas). */
export class HatchFoe {
  readonly pos: Vector3;
  readonly home: Vector3;
  readonly target: Vector3;
  readonly vel = new Vector3();
  readonly lungeFrom = new Vector3();
  readonly lungeTo = new Vector3();
  readonly hopFrom = new Vector3();
  readonly hopTo = new Vector3();
  readonly pushV = new Vector3();
  mode: HatchMode = 'emerge';
  st = 0;
  run = false;
  runT = 0;
  hp: number;
  alive = true;
  radius: number;
  rear = 0;
  yaw: number;
  avg: number;
  threatT: number;
  close = 0;
  hopped = false;
  startD: number;
  stunT = 0;
  parryT = 0;
  bounce = 0;
  flung = false;
  /** Lo que ha pasado en el último paso: su siseo (s: su tono), sus patitas, el salto a morderte y el mordisco. */
  evHiss = 0;
  evSkitter = false;
  evWhoosh = false;
  evBite = false;

  /** s: su tamaño (1; el jefe, 2,4); hatch: su trampilla (en la arena); oneArm: en la plancha con un brazo (ataca por el
   * costado); walkT: «Tiempo llegada» (s). */
  constructor(readonly s: number, readonly boss: boolean, hatch: { x: number; z: number }, oneArm: boolean, walkT: number, hp: number, private rnd: () => number = Math.random) {
    this.pos = new Vector3(hatch.x, -0.07 * s, hatch.z);
    this.home = new Vector3(hatch.x, 0, hatch.z);
    this.target = oneArm ? new Vector3(Math.sign(hatch.x) * this.rand(0.3, 0.4), 0, this.rand(-0.3, 0)) : new Vector3((hatch.x < 0 ? -1 : 1) * this.rand(0.06, 0.22), 0, -(0.4 + 0.04 * s));
    this.avg = Math.max(0.01, this.pos.distanceTo(this.target) / walkT);
    this.yaw = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    this.hp = hp;
    this.radius = 0.075 * s;
    this.threatT = this.rand(1.2, 2.5);
    this.startD = Math.max(0.1, this.pos.distanceTo(this.target));
    this.evHiss = s;
  }

  private rand(a: number, b: number): number {
    return a + this.rnd() * (b - a);
  }

  /** Un paso (RepArena: Spider.update, sin las patas ni la pose). t: el reloj (para el contoneo). */
  step(dt: number, t: number, env: HatchEnv): void {
    this.evHiss = 0;
    this.evSkitter = this.evWhoosh = this.evBite = false;
    this.st += dt;
    const s = this.s, HL = env.HL;
    this.vel.set(0, 0, 0);
    let moveTo: Vector3 | null = null, speed = 0;
    switch (this.mode) {
      case 'emerge':
        this.pos.y = Math.min(0, this.pos.y + dt * 0.14 * s);
        if (this.st > 0.7) {
          this.mode = 'run';
          this.st = 0;
          this.pos.y = 0;
        }
        break;
      case 'run':
        if (!env.active) break;
        if (this.stunT > 0) {
          this.stunT -= dt;
          this.rear = 0;
          break;
        }
        this.runT -= dt;
        if (this.runT <= 0) {
          this.run = !this.run;
          this.runT = this.run ? this.rand(0.3, 0.9) : this.rand(0.15, 0.8);
          if (this.run && this.rnd() < 0.4) this.evSkitter = true;
        }
        if (this.run) {
          moveTo = this.target;
          speed = (this.avg / 0.55) * this.rand(0.9, 1.2);
        }
        if (this.pos.distanceTo(this.target) < 0.02 && env.play) {
          this.mode = 'rear';
          this.st = 0;
          this.evHiss = s;
          break;
        }
        // amenaza mientras se acerca: más a menudo cuanto más cerca está
        this.threatT -= dt * (1 + this.close * 2.5);
        if (this.threatT <= 0 && !this.run && env.play && this.pos.distanceTo(this.target) > 0.05) {
          this.mode = 'threat';
          this.st = 0;
          this.hopped = false;
          this.evHiss = s * 0.9;
        }
        break;
      case 'threat': {
        // se alza enseñando los dientes, da un amago hacia ti y vuelve a correr
        const k = this.st;
        this.rear = k < 0.35 ? (k / 0.35) * 0.85 : k < 0.6 ? 0.9 : Math.max(0, 0.9 - ((k - 0.6) / 0.35) * 0.9);
        this.yaw += wrapAng(Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z) - this.yaw) * Math.min(1, dt * 10);
        if (k >= 0.35 && !this.hopped) {
          this.hopped = true;
          this.hopFrom.copy(this.pos);
          const to = _a.subVectors(this.target, this.pos);
          to.y = 0;
          const d = to.length();
          this.hopTo.copy(this.pos).addScaledVector(to.normalize(), Math.min(0.06 * s, Math.max(0, d - 0.03)));
          this.evSkitter = true;
        }
        if (this.hopped && k < 0.6) {
          const h = (k - 0.35) / 0.25;
          this.pos.lerpVectors(this.hopFrom, this.hopTo, smooth(h));
          this.pos.y = Math.sin(h * Math.PI) * 0.03 * s;
        }
        if (k >= 0.6) this.pos.y = 0;
        if (k > 0.95) {
          this.mode = 'run';
          this.st = 0;
          this.run = false;
          this.runT = this.rand(0.15, 0.45);
          this.threatT = this.rand(1.3, 3.2);
        }
        break;
      }
      case 'rear':
        this.rear = Math.min(1, this.st / 0.45);
        this.yaw += wrapAng(Math.atan2(HL.x - this.pos.x, HL.z - this.pos.z) - this.yaw) * Math.min(1, dt * 8);
        if (this.st > 0.55) {
          this.mode = 'lunge';
          this.st = 0;
          this.lungeFrom.copy(this.pos);
          this.lungeTo.set(lerp(this.pos.x, HL.x, 0.75), 0, lerp(this.pos.z, HL.z, 0.75));
          this.evWhoosh = true;
        }
        break;
      case 'lunge': {
        const k = Math.min(1, this.st / 0.22);
        this.pos.lerpVectors(this.lungeFrom, this.lungeTo, k);
        this.pos.y = Math.sin(k * Math.PI) * 0.12 + k * Math.max(0, HL.y - 0.25) * 0.7;
        if (k >= 1) {
          this.evBite = true;
          this.evHiss = s * 0.8;
          this.mode = 'recoil';
          this.st = 0;
          this.lungeFrom.copy(this.pos);
          const back = _a.subVectors(this.target, HL);
          back.y = 0;
          back.normalize();
          this.lungeTo.copy(this.target).addScaledVector(back, 0.28 + (this.bounce || 0));
          this.bounce = 0;
        }
        break;
      }
      case 'recoil': {
        // (lanzado por la onda del inchworm: vuela alto, dando vueltas, hasta su trampilla)
        const T = this.flung ? 0.9 : 0.35, k = Math.min(1, this.st / T);
        this.pos.lerpVectors(this.lungeFrom, this.lungeTo, smooth(k));
        this.pos.y = this.lungeFrom.y * (1 - k) + Math.sin(k * Math.PI) * (this.flung ? 0.55 : 0.05);
        this.rear = 1 - k;
        if (k < 1 && !this.flung) {
          this.vel.subVectors(this.lungeTo, this.lungeFrom).multiplyScalar(1 / T);
          this.vel.y = 0;
        }
        if (k >= 1) {
          this.flung = false;
          this.pos.y = 0;
          this.mode = 'run';
          this.st = 0;
          this.run = false;
          this.runT = this.rand(0.4, 1.0);
          if (this.parryT) {
            this.stunT = this.parryT;
            this.parryT = 0;
          }
        }
        break;
      }
      case 'dying':
        break;
    }
    if (this.pushV.lengthSq() > 1e-6) {
      if (this.mode === 'run' || this.mode === 'threat' || this.mode === 'rear') this.pos.addScaledVector(this.pushV, dt);
      this.pushV.multiplyScalar(Math.exp(-dt * SHOVE_K));
    }
    if (moveTo) moveTo = floorDetour(env.board, this.pos, moveTo, this.radius); // (el marcador tumbado se rodea)
    if (moveTo) {
      const to = _a.subVectors(moveTo, this.pos);
      to.y = 0;
      const d = to.length();
      if (d > 0.005) {
        to.normalize();
        const lat = Math.sin(t * 9 + this.s * 7) * 0.35, dir = _b.set(to.x + to.z * lat, 0, to.z - to.x * lat).normalize(), stp = Math.min(d, speed * dt);
        this.pos.addScaledVector(dir, stp);
        this.vel.copy(dir).multiplyScalar(speed);
        this.yaw += wrapAng(Math.atan2(dir.x, dir.z) - this.yaw) * Math.min(1, dt * 10);
      }
    }
    for (const o of env.others) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, dd = dx * dx + dz * dz, min = (this.radius + o.radius) * 1.1;
      if (dd < min * min && dd > 1e-6) {
        const k = ((min - Math.sqrt(dd)) * 0.5) / Math.sqrt(dd);
        this.pos.x += dx * k;
        this.pos.z += dz * k;
      }
    }
    if (this.pos.y < 0.3) floorBoardKeep(env.board, this.pos, this.radius); // (y nunca se mete en él)
    this.close = clamp(1 - this.pos.distanceTo(this.target) / this.startD, 0, 1);
  }

  /** La onda del inchworm: sale despedido por el aire, dando vueltas, hasta su trampilla, y vuelve a empezar desde allí
   * (RepArena: sendHome). */
  sendHome(): void {
    if (!this.alive || this.mode === 'dying' || this.mode === 'emerge') return;
    this.mode = 'recoil';
    this.flung = true;
    this.st = 0;
    this.lungeFrom.copy(this.pos);
    this.lungeTo.set(this.home.x, 0, this.home.z);
    this.rear = 0;
    this.stunT = 0;
    this.parryT = 0.8;
    this.threatT = this.rand(1.5, 3);
  }

  /** Empujón: lo aleja de ti dist metros (RepArena: Spider.shove; sin dirección del golpe). */
  shove(dist: number, HL: Vector3, dir: Vector3 | null): void {
    if (this.mode === 'emerge' || this.mode === 'dying' || !(dist > 0)) return;
    const b = _a.subVectors(this.pos, HL);
    b.y = 0;
    b.divideScalar(b.length() || 1);
    if (dir) {
      const dl = Math.hypot(dir.x, dir.z);
      if (dl >= 0.3) {
        b.x += (dir.x / dl) * 0.8;
        b.z += (dir.z / dl) * 0.8;
        if (b.lengthSq() < 1e-4) b.set(dir.x / dl, 0, dir.z / dl);
        b.normalize();
      }
    }
    this.pushV.addScaledVector(b, dist * SHOVE_K);
  }

  /** Un disparo le da (RepArena: onHit y recoil): unos centímetros hacia atrás; alzado para atacar, uno fuerte o perfecto
   * le quita el ataque y uno flojo se lo retrasa. knock: «Retroceso». Devuelve si sigue vivo. */
  hit(dmg: number, perfect: boolean, pow: number, HL: Vector3, dir: Vector3 | null, knock: number): boolean {
    this.hp -= dmg;
    this.rear = 0;
    if (this.mode === 'run') {
      this.run = false;
      this.runT = 0.25;
    }
    const k = knock * (this.boss ? 0.3 : 1);
    if (k && this.hp > 0) {
      this.shove((0.05 + 0.03 * (pow - 1) + (perfect ? 0.02 : 0)) * k, HL, dir);
      if (this.mode === 'rear') {
        if ((pow >= 2 || perfect) && !this.boss) {
          this.mode = 'run';
          this.st = 0;
          this.run = false;
          this.runT = 0.5;
        } else this.st = Math.max(0, this.st - 0.15 * k);
      }
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.mode = 'dying';
      this.st = 0;
    }
    return this.alive;
  }
}
