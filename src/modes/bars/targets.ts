/**
 * Los objetivos del modo Barras que se revientan con la cabeza, como en RepArena (src/72_bars.js: TGT, barGap,
 * frontTarget, barTopPoint, barLat, barNextSide, barSlot, barFront, HeadTarget, barRep, barBlast y buildBarWave; con los
 * mismos números y el azar en el mismo orden). Sin lo que se ve (la pompa irisada, la avispa y sus huesos, la guía): de
 * cada uno sale dónde pintarlo (`disp`, en la arena) y lo que hace falta para animarlo (`curl`, `ch`, `rotY`, `rotX`,
 * `shell`, `fade`, `scale`, `glowOn`, `guide`).
 *  - Cada uno espera en el punto más alto previsto de la cabeza (o apartado a un lado, con «Por los lados»); el siguiente,
 *    detrás. Llegan en lo que dura una repetición (±15 %): nunca dos a la vez.
 *  - Revienta al llegar arriba (la repetición le da) o si la cabeza lo alcanza subiendo (esa subida cuenta).
 *  - Si esperas más de «Espera» (barWait), la pompa se escapa y la avispa te pica; vuelven a la cola de la oleada.
 *  - Las avispas amagan picarte mientras esperan (más a menudo cuanto más esperas).
 * Sin IWSDK: se compara en tests/compare/bars.compare.test.ts.
 */
import { Vector3 } from 'three';
import { type BarDetector, type BarHits, barPose, barReq, POW_DMG, powRgb } from './detect.js';
import { type BarEvent, type BarsEnv, clamp, fwdH, rand, smooth, TAU, toArena, toWorld, UP } from './env.js';
import { dipOne, eqAxes, eqKind, eqLocal, eqWorld } from './equip.js';

/** Cada clase de objetivo (RepArena: TGT): su radio de choque con la cabeza, su modelo, su tamaño y si es jefe. */
export interface TargetKind {
  r: number;
  rig?: 'stinger' | 'drone' | 'carrier';
  scale?: number;
  wasp?: boolean;
  boss?: boolean;
}
export const TGT: Record<string, TargetKind> = {
  bubble: { r: 0.1 },
  bigbubble: { r: 0.17, boss: true },
  wasp: { rig: 'stinger', scale: 1.0, r: 0.11, wasp: true },
  queen: { rig: 'stinger', scale: 1.8, r: 0.19, wasp: true, boss: true },
  drone: { rig: 'drone', scale: 0.65, r: 0.13 },
  hornet: { rig: 'stinger', scale: 0.8, r: 0.09, wasp: true },
  carrier: { rig: 'carrier', scale: 1.3, r: 0.28, boss: true },
};
/** Las gotas de colores al reventar una pompa (RepArena: BUBBLE_SPLASH). */
export const BUBBLE_SPLASH: [number, number, number][] = [[1, 0.45, 0.85], [0.45, 0.85, 1], [1, 0.95, 0.45], [0.55, 1, 0.6]];

export interface TargetSpec {
  kind: string;
  hp: number;
  /** Su fuerza (las vidas que quita cada golpe), si la tiene. */
  fk?: string;
}

/** Lo que dura una repetición de cada ejercicio de barras (RepArena: repTimeOf(ex, 'bars')). */
export const BAR_REP_T: Record<string, number> = { row: 2.6, pullup: 3.2, hang: 1 };
/** Entre un objetivo y el siguiente, lo que dura una repetición (±15 %): nunca llegan dos a la vez, y llegan espaciados
 * de forma pareja sin ser un metrónomo (RepArena: barGap). */
export const barGap = (env: BarsEnv): number => (BAR_REP_T[env.str('exercise')] ?? 3.2) * rand(env, 0.85, 1.15);

/** Las repeticiones, si es jefe y los segundos de colgado de la oleada i (RepArena: waveReps, isBossWave, hangSecs). */
export const waveReps = (env: BarsEnv, i: number): number => env.sesWave(i) || Math.max(1, Math.round(env.s('repsWave') + env.s('repsInc') * i));
export const isBossWave = (env: BarsEnv, i: number): boolean => (env.nWaves() ? i === env.nWaves() - 1 : (i + 1) % 5 === 0);
export const hangSecs = (env: BarsEnv, i: number): number => env.sesWave(i) || env.s('hangTime') + env.s('hangInc') * i;

/** La cola de la oleada i: tantos como repeticiones y, en la del jefe, uno grande que aguanta varios cabezazos
 * (RepArena: buildBarWave; colgado, ninguno). */
export function buildBarWave(env: BarsEnv, i: number): TargetSpec[] {
  if (env.str('exercise') === 'hang') return [];
  let total = waveReps(env, i);
  const list: TargetSpec[] = [], bugs = env.str('barTarget') === 'bugs';
  let boss: TargetSpec | null = null;
  if (isBossWave(env, i)) {
    const b = Math.min(total, Math.min(5, Math.max(3, Math.round(total * 0.2))));
    boss = { kind: bugs ? 'queen' : 'bigbubble', hp: b };
    total -= b;
  }
  for (; total > 0; total--) list.push({ kind: bugs ? 'wasp' : 'bubble', hp: 1 });
  if (boss) list.push(boss);
  return list;
}

const _bt = new Vector3(), _bq = new Vector3(), _bw = new Vector3(), _ba = new Vector3(), _bf = new Vector3(), _tA = new Vector3(), _ce = new Vector3();
/** En el remo, el objetivo espera casi a la altura de la barra (ROW_TOP por debajo: el usuario los quiere ahí, para
 * obligar a subir del todo). */
export const ROW_TOP = 0.06;
const rowTopY = (bar: BarDetector, env: BarsEnv): number => Math.max(bar.ref + barReq(env) + 0.04, env.s('dipH') / 100 - ROW_TOP);

/** El punto más alto previsto de la cabeza (en la arena) (RepArena: barTopPoint). En el remo, pasado el borde de la
 * barra hacia tu cabeza (con una paralela, al otro lado de la barra; con dos, más allá de su extremo), que es donde llega
 * la cabeza al subir. */
export function barTopPoint(out: Vector3, bar: BarDetector, env: BarsEnv): Vector3 {
  if (env.str('exercise') === 'row') {
    const e = barPose(env), L = env.s('dipLen') / 200, l = eqLocal(e, _bt.copy(bar.mountXZ), _bt), y = rowTopY(bar, env);
    if (dipOne(env.str('dipBars'))) eqWorld(e, (Math.sign(l.x) || 1) * 0.12, y, clamp(l.z, -L, L), out);
    else eqWorld(e, l.x, y, (Math.sign(l.z) || 1) * (L + 0.1), out);
    return toArena(env.arena, out, out);
  }
  out.set(bar.refXZ.x + bar.drift.x + bar.front.x, bar.ref + barReq(env) + 0.04, bar.refXZ.z + bar.drift.z + bar.front.z);
  out.y = Math.min(out.y, env.s('doorH') / 100 - 0.06);
  return out;
}
/** Hacia los lados del cuerpo (en la arena, en horizontal): a lo largo de la barra de dominadas; en el remo, de una
 * paralela a la otra (con una sola, a lo largo de ella: estás tumbado cruzado debajo) (RepArena: barLat). */
export function barLat(out: Vector3, env: BarsEnv): Vector3 {
  const e = barPose(env);
  if (eqKind(env.str('exercise')) === 'dip' && dipOne(env.str('dipBars'))) eqAxes(e, null, out);
  else eqAxes(e, out);
  return out.applyAxisAngle(UP, -env.arena.ry);
}
/** «Por los lados»: cada objetivo se para apartado barOffset cm hacia su lado (RepArena: barSidesOn). */
export const barSidesOn = (env: BarsEnv): boolean => env.s('barMix') > 0 && env.str('exercise') !== 'hang';
/** ¿Este llega por un lado? Se reparten por igual (los del centro, entre medias) y los de los lados alternan izquierda y
 * derecha (RepArena: barNextSide): −1, 1 o 0 (al centro). */
export function barNextSide(bar: BarDetector, env: BarsEnv): number {
  if (!barSidesOn(env)) return 0;
  bar.acc = (bar.acc === undefined ? 0.5 : bar.acc) + env.s('barMix') / 100;
  if (bar.acc < 1 - 1e-6) return 0;
  bar.acc -= 1;
  return (bar.side = -(bar.side || 1));
}
/** El sitio donde espera el idx-ésimo de la fila (en la arena) (RepArena: barSlot): el primero, arriba; los demás,
 * detrás, 42 cm cada uno y algo más altos. */
export function barSlot(idx: number, out: Vector3, side: number, bar: BarDetector, env: BarsEnv): Vector3 {
  barTopPoint(out, bar, env);
  if (barSidesOn(env) && side) {
    out.addScaledVector(barLat(_bq, env), side * (env.s('barOffset') / 100 + 0.42 * idx));
    if (idx) out.y += 0.06;
    return out;
  }
  if (!idx) return out;
  const e = barPose(env), w = toWorld(env.arena, out, _bw);
  if (eqKind(env.str('exercise')) === 'door') eqAxes(e, _ba);
  else {
    _ba.set(w.x - e.x, 0, w.z - e.z);
    if (_ba.lengthSq() < 1e-4) eqAxes(e, null, _ba);
    _ba.normalize();
  }
  w.addScaledVector(_ba, 0.42 * idx);
  w.y += 0.06;
  return toArena(env.arena, w, out);
}
/** Hacia dónde está «delante» para los que llegan (en el mundo, desde su sitio w): en la barra, hacia donde miras (o la
 * normal de la puerta, si se parece); en el remo, hacia los pies (RepArena: barFront). */
export function barFront(w: Vector3, dir: Vector3, env: BarsEnv): Vector3 {
  const e = barPose(env);
  if (eqKind(env.str('exercise')) === 'door') {
    fwdH(env.head.q, dir);
    eqAxes(e, null, _bf);
    if (_bf.dot(dir) < 0) _bf.negate();
    if (_bf.dot(dir) > 0.5) dir.copy(_bf);
  } else {
    dir.set(e.x - w.x, 0, e.z - w.z);
    if (dir.lengthSq() < 1e-4) eqAxes(e, null, dir);
    dir.normalize();
  }
  return dir;
}

export type TargetMode = 'approach' | 'wait' | 'attack' | 'flee' | 'leave';

export class HeadTarget {
  readonly type = 'target';
  readonly K: TargetKind;
  readonly kind: string;
  /** Pompa (sin modelo) o bicho. */
  readonly bubble: boolean;
  hp: number;
  readonly maxHp: number;
  fk?: string;
  alive = true;
  mode: TargetMode = 'approach';
  t = 0;
  waitT = 0;
  readonly radius: number;
  /** Su sitio de espera y dónde está (en la arena), de dónde salió al atacar o huir. */
  readonly slot = new Vector3();
  readonly pos = new Vector3();
  readonly from = new Vector3();
  /** El destello de un golpe (s). */
  flick = 0;
  readonly ph: number;
  /** Avispa: amagos de picar (se lanza hacia tu cara y se retira) y el abdomen que se dobla para clavar el aguijón. */
  feint = 0;
  feintT: number;
  feintOn = false;
  curl = 0;
  ch = 0;
  readonly off = new Vector3();
  /** La fase de la película de la pompa (RepArena: uPh del material). */
  readonly uPh: number;
  /** −1, 1: llega por ese lado; 0, al centro. */
  readonly side: number;
  speed: number;
  /** Donde reventó (en el mundo). */
  deadAt: Vector3 | null = null;
  /** Lo que se ve: dónde pintarlo (en la arena), su giro (avispa), la forma de la pompa, su transparencia al escaparse,
   * su tamaño al huir, si brilla (parpadea tras un golpe), si se ve su guía (la línea hacia tu cara en la barra) y si
   * zumba. */
  readonly disp = new Vector3();
  rotY = 0;
  rotX = 0;
  readonly shell = new Vector3();
  fade = 1;
  scale: number;
  glowOn = true;
  guide = false;
  readonly hasGuide: boolean;
  readonly buzz: boolean;

  constructor(spec: TargetSpec, private field: BarField, env: BarsEnv, out: BarEvent[]) {
    const K = TGT[spec.kind], bar = field.bar, door = eqKind(env.str('exercise')) === 'door';
    this.K = K;
    this.kind = spec.kind;
    this.bubble = !K.rig;
    this.hp = this.maxHp = spec.hp;
    this.radius = K.r;
    this.ph = rand(env, 0, TAU);
    this.feintT = rand(env, 1.2, 2.2);
    this.uPh = this.bubble ? rand(env, 0, 6) : 0;
    this.scale = K.scale || 1;
    this.shell.setScalar(K.r);
    this.hasGuide = door;
    this.side = barNextSide(bar, env); // por un lado (izquierda y derecha, por turnos: los dos brazos por igual) o al centro
    barSlot(this.slotIndex(), this.slot, this.side, bar, env);
    let gate = false;
    if (this.side) {
      // por los lados: llega en diagonal, desde delante y desde su lado (algo por encima), y se para apartado del centro;
      // así se le ve venir sin girar mucho la cabeza (de lado del todo, en el remo había que mirar a un costado)
      const F = barFront(toWorld(env.arena, barTopPoint(_bw, bar, env), _bw), _bq, env), L = barLat(_ba, env).applyAxisAngle(UP, env.arena.ry);
      const w = toWorld(env.arena, this.slot, _bw);
      w.addScaledVector(F, 1.9).addScaledVector(L, this.side * 1.5);
      w.y += door ? rand(env, 0.15, 0.35) : rand(env, 0.5, 0.8);
      toArena(env.arena, w, this.pos);
      if (!this.bubble && K.wasp) out.push({ type: 'snd', name: 'hiss', args: [toWorld(env.arena, this.pos, new Vector3()), K.boss ? 0.6 : 0.9, 'wasp'] });
    } else if (this.bubble || !env.gates.length) {
      // llega flotando desde delante: en la barra, desde donde miras; en el remo, desde los pies y desde arriba (sin
      // compuertas, también los bichos)
      const w = toWorld(env.arena, this.slot, _bw), dir = barFront(w, _ba, env);
      const a = rand(env, -0.5, 0.5) * -dir.z, b = door ? rand(env, 0.1, 0.4) : rand(env, 0.6, 1.0), c = rand(env, -0.5, 0.5) * dir.x;
      w.addScaledVector(dir, 3.2).add(_bq.set(a, b, c));
      toArena(env.arena, w, this.pos);
    } else gate = true;
    if (gate) {
      // sale de una compuerta y vuela recto
      const gi = Math.floor(env.rnd() * env.gates.length), g = env.gates[gi], r = g.ry;
      out.push({ type: 'gate', index: gi, openT: Math.min(10, 1.2 + env.dv('barArrive')) });
      this.pos.set(g.x - 0.6 * Math.sin(r), 1.5 * g.scale, g.z - 0.6 * Math.cos(r));
      if (K.wasp) out.push({ type: 'snd', name: 'hiss', args: [toWorld(env.arena, this.pos, new Vector3()), K.boss ? 0.6 : 0.9, 'wasp'] });
    }
    this.buzz = !this.bubble;
    this.speed = Math.max(0.2, this.pos.distanceTo(this.slot) / env.dv('barArrive'));
    this.disp.copy(this.pos);
  }

  /** Dónde está en el mundo (reventado: donde estaba) (RepArena: center). */
  center(out: Vector3, env: BarsEnv): Vector3 {
    if (this.deadAt) return out.copy(this.deadAt);
    return toWorld(env.arena, this.disp, out);
  }
  /** Su sitio en la fila: cuántos llegando o esperando van delante (RepArena: slotIndex). */
  slotIndex(): number {
    let i = 0;
    for (const o of this.field.targets) {
      if (o === this) break;
      if (o.alive && (o.mode === 'approach' || o.mode === 'wait')) i++;
    }
    return i;
  }

  /** Cada fotograma (RepArena: update, sin lo que se ve). `HL`: la cabeza en la arena. */
  update(dt: number, t: number, env: BarsEnv, out: BarEvent[]): void {
    const bar = this.field.bar, HL = bar.hl;
    this.t += dt;
    const play = env.state === 'play', idx = this.slotIndex();
    if (this.mode === 'approach' || this.mode === 'wait') barSlot(idx, this.slot, this.side, bar, env);
    // si la cabeza lo alcanza mientras subes, revienta aunque no haya llegado a su sitio y esa subida cuenta como
    // repetición. Solo subiendo: colgado o bajando, un roce no regala nada
    if (play && this.alive && (this.mode === 'approach' || this.mode === 'wait') && !bar.contact && bar.det === 'rising' && toWorld(env.arena, this.pos, _bw).distanceTo(env.head.p) < this.radius + 0.09) {
      // cuenta como la repetición de esta subida (si era el último, la oleada acaba ya y la subida no llegaría a contar)
      bar.contact = true;
      out.push({ type: 'rep', perfect: false, fast: false, contact: true });
      this.onHit(1, false, env, out);
      if (!this.alive) {
        out.push({ type: 'killed', target: this });
        return;
      } // el jefe necesita varios cabezazos
    }
    if (this.mode === 'approach') {
      if (play || env.state === 'mount') {
        const to = _tA.subVectors(this.slot, this.pos), d = to.length();
        if (d < 0.03) {
          this.mode = 'wait';
          this.waitT = 0;
        } else this.pos.addScaledVector(to.divideScalar(d), Math.min(d, this.speed * dt));
      }
    } else if (this.mode === 'wait') {
      this.pos.lerp(this.slot, 1 - Math.exp(-dt * 6));
      if (!idx && play && env.s('barWait') > 0) {
        this.waitT += dt;
        if (this.waitT > env.s('barWait')) this.timeout(env, out);
      }
    } else if (this.mode === 'attack' && this.K.wasp) {
      // carga (se echa atrás doblada) y se lanza a picarte en la cara
      const W = 0.45, aim = _ba.copy(HL).add(_bw.set(0, -0.05, 0)), back = _bq.subVectors(aim, this.from).normalize().multiplyScalar(-0.12);
      if (this.t < W) {
        const k = smooth(this.t / W);
        this.ch = k;
        this.curl = Math.max(this.curl, 0.85);
        this.pos.copy(this.from).addScaledVector(back, k);
      } else {
        const k = Math.min(1, (this.t - W) / 0.3);
        this.ch = 1;
        this.curl = 1;
        this.pos.copy(this.from).add(back).lerp(aim, smooth(k));
        if (k >= 1) {
          const c = this.center(new Vector3(), env);
          out.push({ type: 'hurt', target: this });
          out.push({ type: 'say', text: '¡Te ha picado!', col: '#ff3b5c', dur: 1.2, toast: true });
          out.push({ type: 'snd', name: 'hiss', args: [c, 0.5, 'wasp'] });
          out.push({ type: 'fx', name: 'ichor', at: c, args: [6, 0.6] });
          out.push({ type: 'fx', name: 'glow', at: c, args: [[0.4, 1, 0.3], 0.25, 0.15] });
          this.mode = 'flee';
          this.t = 0;
          this.from.copy(this.pos);
        }
      }
    } else if (this.mode === 'flee') {
      const k = Math.min(1, this.t / 1.2);
      this.curl = Math.max(0, 1 - this.t * 2);
      this.ch = Math.max(0, 1 - this.t * 3);
      this.pos.copy(this.from).add(_bq.set(Math.sin(this.ph) * 1.5 * k, 1.2 * k, -2.2 * k));
      this.scale = (this.K.scale || 1) * (1 - k * 0.7);
      if (k >= 1) {
        this.alive = false;
        return;
      }
    } else if (this.mode === 'attack') {
      const k = Math.min(1, this.t / 0.3);
      this.pos.lerpVectors(this.from, HL, k);
      if (k >= 1) {
        const c = this.center(new Vector3(), env);
        out.push({ type: 'fx', name: 'explosion', at: c, args: [0.3, false] });
        out.push({ type: 'snd', name: 'explosion', args: [c, false] });
        out.push({ type: 'hurt', target: this });
        this.alive = false;
        return;
      }
    } else if (this.mode === 'leave') {
      const k = Math.min(1, this.t / 1.1);
      this.pos.y += dt * 0.5;
      this.fade = 1 - k;
      if (k >= 1) {
        out.push({ type: 'snd', name: 'pop', args: [this.center(new Vector3(), env), false] });
        this.alive = false;
        return;
      }
    }
    // aspecto
    const wait = this.mode === 'wait';
    this.disp.copy(this.pos);
    if (wait) this.disp.y += Math.sin(t * 2.4 + this.ph) * 0.012;
    if (this.flick > 0) this.flick = Math.max(0, this.flick - dt);
    if (this.bubble) {
      const w = Math.sin(t * 7 + this.ph) * 0.06, r = this.K.r * (1 - this.flick * 0.8);
      this.shell.set(r * (1 + w), r * (1 - w), r * (1 + w * 0.5));
    } else if (this.K.wasp) this.animWasp(dt, t, idx, play, env, out);
    else this.glowOn = this.flick <= 0 || env.rnd() < 0.5;
    this.guide = this.hasGuide && (this.mode === 'wait' || this.mode === 'approach') && !idx;
  }

  /** Avispa: vuela nivelada, girada hacia ti; el abdomen va doblado por debajo con el aguijón apuntando a tu cara. En su
   * sitio amaga picarte: se lanza hacia ti y se retira, más a menudo cuanto más esperas. El cabezazo cuenta en su sitio,
   * no en el amago (RepArena: animWasp, sin los huesos: flapStinger y poseStinger, con curl y ch). */
  private animWasp(dt: number, t: number, idx: number, play: boolean, env: BarsEnv, out: BarEvent[]): void {
    const bar = this.field.bar, HL = bar.hl, wait = this.mode === 'wait', toH = _bq.subVectors(HL, this.pos), dist = toH.length();
    // amago: carga (se echa un poco atrás con el aguijón y la cabeza cargados), se lanza hacia ti y vuelve
    if (wait && play && !idx) {
      this.feintT -= dt * (1 + Math.min(2, this.waitT / 4));
      if (!this.feintOn && this.feintT <= 0 && bar.det !== 'rising' && dist > 0.4) {
        this.feintOn = true;
        this.feint = 0;
        if (env.rnd() < 0.6) out.push({ type: 'snd', name: 'hiss', args: [this.center(new Vector3(), env), this.K.boss ? 0.6 : 0.9, 'wasp'] });
      }
      if (this.feintOn) {
        const was = this.feint;
        this.feint += dt / 1.0;
        if (was < 0.45 && this.feint >= 0.45) out.push({ type: 'snd', name: 'whoosh', args: [this.center(new Vector3(), env)] });
        if (this.feint >= 1 || bar.det === 'rising') {
          this.feintOn = false;
          this.feint = 0;
          this.feintT = rand(env, 1.2, 2.6);
        }
      }
    } else {
      this.feintOn = false;
      this.feint = 0;
    }
    const p = this.feint, F = this.feintOn;
    const lunge = !F ? 0 : p < 0.45 ? -smooth(p / 0.45) * 0.3 : p < 0.6 ? -0.3 + 1.3 * smooth((p - 0.45) / 0.15) : p < 0.75 ? 1 : 1 - smooth((p - 0.75) / 0.25);
    if (this.mode !== 'attack' && this.mode !== 'flee') this.ch += ((F ? (p < 0.75 ? Math.min(1, p / 0.4) : 1 - smooth((p - 0.75) / 0.25)) : 0) - this.ch) * Math.min(1, dt * 12);
    const ch = this.ch, reach = Math.max(0, dist - 0.3) * 0.75;
    const zig = this.mode === 'approach' ? 0.12 : 0.025 * (1 - ch);
    this.off.set(Math.sin(t * 3.1 + this.ph) * zig, Math.sin(t * 4.3 + this.ph * 2) * zig * 0.6, Math.sin(t * 2.3 + this.ph) * zig * 0.5);
    if (dist > 1e-3) this.off.addScaledVector(toH, (lunge > 0 ? lunge * reach : lunge * 0.3) / dist);
    this.disp.add(this.off);
    if (this.mode === 'approach' || this.mode === 'wait') this.curl += ((F ? 1 : 0.85 + 0.08 * Math.sin(t * 2 + this.ph)) - this.curl) * Math.min(1, dt * 8);
    // el cuerpo, casi horizontal y girado hacia ti (solo se inclina un poco); la cabeza y el aguijón te apuntan
    const rp = this.disp, lx = HL.x - rp.x, ly = HL.y - rp.y, lz = HL.z - rp.z, hd = Math.hypot(lx, lz), pitch = Math.atan2(ly, Math.max(1e-3, hd));
    this.rotY = Math.atan2(lx, lz);
    this.rotX = -clamp(pitch, -0.35, 0.35);
    this.glowOn = this.flick <= 0 || env.rnd() < 0.5;
  }

  /** Un golpe (RepArena: onHit): si no le quedan, revienta (pop). */
  onHit(dmg: number, _perfect: boolean, env: BarsEnv, out: BarEvent[]): void {
    this.hp -= dmg;
    this.flick = 0.3;
    if (this.hp <= 0) {
      this.pop(env, out);
      return;
    }
    const c = this.center(new Vector3(), env);
    if (this.bubble) {
      out.push({ type: 'snd', name: 'pop', args: [c, false] });
      out.push({ type: 'fx', name: 'droplets', at: c, args: [8, [0.45, 1, 0.85], 1, 0.025] });
    } else {
      out.push({ type: 'snd', name: 'metalHit', args: [c, false] });
      out.push({ type: 'fx', name: 'sparks', at: c, args: [8, [1, 0.6, 0.2], 2, 0.03] });
    }
  }
  /** Revienta (RepArena: pop): la pompa salpica gotas irisadas y un destello; el bicho, sus trozos (fx 'debris': fuerza,
   * subida y material, como rigDebris). */
  private pop(env: BarsEnv, out: BarEvent[]): void {
    this.alive = false;
    const c = this.center(new Vector3(), env), big = !!this.K.boss;
    this.deadAt = c.clone();
    if (this.bubble) {
      out.push({ type: 'snd', name: 'pop', args: [c, big] });
      for (const col of BUBBLE_SPLASH) out.push({ type: 'fx', name: 'droplets', at: c, args: [big ? 14 : 8, col, big ? 2.4 : 1.9, big ? 0.04 : 0.032] });
      out.push({ type: 'fx', name: 'glow', at: c, args: [[1, 1, 1], big ? 0.5 : 0.3, 0.1] }); // (solo revienta: sin chispas ni estrellas de cómic)
    } else if (this.K.wasp) {
      out.push({ type: 'fx', name: 'ichor', at: c, args: [big ? 30 : 20, big ? 1.8 : 1.3] });
      out.push({ type: 'fx', name: 'glow', at: c, args: [[0.6, 1, 0.3], big ? 0.5 : 0.3, 0.12] });
      out.push({ type: 'snd', name: 'squish', args: [c] });
      out.push({ type: 'fx', name: 'debris', at: c, args: [big ? 2.4 : 1.7, 0, 'wasp'] });
    } else {
      out.push({ type: 'fx', name: 'explosion', at: c, args: [big ? 0.7 : 0.35, big] });
      out.push({ type: 'snd', name: 'explosion', args: [c, big] });
      out.push({ type: 'fx', name: 'debris', at: c, args: [big ? 2.4 : 1.6, 0.5, 'carbon'] });
    }
  }
  /** No llegaste a tiempo: vuelve a la cola de la oleada; el bicho te pica y la pompa se escapa (RepArena: timeout). */
  private timeout(env: BarsEnv, out: BarEvent[]): void {
    this.field.queue.push({ kind: this.kind, hp: this.hp });
    this.hp = 0;
    out.push({ type: 'comboReset' });
    this.t = 0;
    if (this.bubble) {
      this.mode = 'leave';
      out.push({ type: 'say', text: 'Se escapó', col: '#ff8a3d', dur: 1.0, toast: true });
      out.push({ type: 'snd', name: 'miss', args: [] });
    } else {
      this.mode = 'attack';
      this.from.copy(this.pos);
      out.push({ type: 'snd', name: 'whoosh', args: [this.center(new Vector3(), env)] });
      if (this.K.wasp) out.push({ type: 'snd', name: 'hiss', args: [this.center(new Vector3(), env), 0.7, 'wasp'] });
    }
  }
}

/**
 * Los objetivos de la oleada: los que hay (en su orden, como `enemies` en RepArena), la cola de los que faltan
 * (spawnQueue) y el reloj hasta el siguiente (spawnTimer). Recibe las repeticiones y las ondas del detector (BarHits).
 */
export class BarField implements BarHits {
  readonly targets: HeadTarget[] = [];
  queue: TargetSpec[] = [];
  spawnTimer = 0;

  constructor(readonly bar: BarDetector) {}

  /** Al empezar la oleada i (RepArena: startWave con buildWave): su cola, el colgado que pide y el primero a los 0,6 s
   * (la partida le suma lo que dure el panel de la oleada). */
  startWave(env: BarsEnv, i: number): void {
    this.queue = buildBarWave(env, i);
    this.bar.startWave(env.str('exercise') === 'hang' ? hangSecs(env, i) : 0);
    this.spawnTimer = 0.6;
  }
  /** Al acabar la ronda: fuera todos. */
  clear(): void {
    this.targets.length = 0;
    this.queue = [];
  }
  /** El primero de la fila (RepArena: frontTarget). */
  front(): HeadTarget | undefined {
    for (const e of this.targets) if (e.alive && (e.mode === 'approach' || e.mode === 'wait')) return e;
    return undefined;
  }
  alive(): number {
    let n = 0;
    for (const e of this.targets) if (e.alive) n++;
    return n;
  }
  /** ¿Superada la oleada? (sin cola ni objetivos; colgado, cuando `bar.hold >= bar.need`). */
  cleared(): boolean {
    return !this.queue.length && !this.alive();
  }
  /** Sale el siguiente de la cola (RepArena: spawnFromQueue). */
  spawn(env: BarsEnv, out: BarEvent[]): HeadTarget | undefined {
    const spec = this.queue.shift();
    if (!spec) return undefined;
    const e = new HeadTarget(spec, this, env, out);
    if (spec.fk) e.fk = spec.fk;
    this.targets.push(e);
    return e;
  }
  /** Con state === 'play', cada fotograma: sale otro cuando toca y hay menos de dos (RepArena: gameStep; `k`, lo que
   * aceleran las mejoras, perkSpawnK; `beatOk`, si toca por el ritmo). */
  spawnStep(dt: number, env: BarsEnv, out: BarEvent[], k = 1, beatOk = true): void {
    this.spawnTimer -= dt * k;
    if (this.spawnTimer <= 0 && this.queue.length && this.alive() < 2 && beatOk) {
      this.spawn(env, out);
      this.spawnTimer = barGap(env);
    }
  }
  /** Cada fotograma (detrás del detector): mueve a los vivos y quita los que ya no están. */
  update(dt: number, t: number, env: BarsEnv, out: BarEvent[]): void {
    toArena(env.arena, env.head.p, this.bar.hl);
    for (const e of this.targets) if (e.alive) e.update(dt, t, env, out);
    let j = 0;
    for (const e of this.targets) if (e.alive) this.targets[j++] = e;
    this.targets.length = j;
  }

  /** La repetición le da al primero (RepArena: barRep, tras registerRep): si no ha llegado, la onda del cabezazo lo
   * alcanza igual; si no hay ninguno, sale ya el siguiente (ninguna repetición se pierde). */
  rep(o: { perfect: boolean; fast: boolean }, env: BarsEnv, out: BarEvent[]): void {
    let tg = this.front();
    if (!tg && this.queue.length) {
      this.spawn(env, out);
      this.spawnTimer = barGap(env);
      tg = this.front();
    }
    if (!tg) return;
    const c = tg.center(new Vector3(), env), h = env.head.p.clone().add(_ce.set(0, 0.08, 0));
    if (c.distanceTo(h) > 0.35) for (let i = 0; i <= 10; i++) out.push({ type: 'fx', name: 'trail', at: h.clone().lerp(c, i / 10), args: [[0.3, 1, 0.85], 0.06, 0.3] });
    tg.onHit(o.perfect ? 2 : 1, o.perfect, env, out);
    if (!tg.alive) out.push({ type: 'killed', target: tg });
  }
  /** La onda al bajar con carga (RepArena: barBlast): ×2, ×3, más daño al que viene; con ×4, a todos los que esperan. */
  blast(p: number, h: Vector3, env: BarsEnv, out: BarEvent[]): void {
    const list: HeadTarget[] = [];
    if (p >= 4) {
      for (const e of this.targets) if (e.alive && (e.mode === 'approach' || e.mode === 'wait')) list.push(e);
    } else {
      const f = this.front();
      if (f) list.push(f);
    }
    const rgb = powRgb(p);
    for (const tg of list) {
      const c = tg.center(new Vector3(), env);
      for (let i = 0; i <= 8; i++) out.push({ type: 'fx', name: 'trail', at: h.clone().lerp(c, i / 8), args: [rgb, 0.07, 0.3] });
      tg.onHit(POW_DMG[p - 1], false, env, out);
      if (!tg.alive) out.push({ type: 'killed', target: tg });
    }
  }
}
