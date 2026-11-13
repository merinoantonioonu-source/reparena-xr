// Los ejercicios de pie portados (src/exercise/standing.ts) frente al código original de RepArena (src/70_game.js:
// runDetectors con vertDetector, CHAIN y chainStep, deadliftStep, armStep, barStep, fraiseStep, twistStep y jumpTrack): la
// misma cabeza y las mismas manos al azar (de pie, bajando a distintas alturas y a distintos ritmos, saltando, quieto; las
// manos subiendo y bajando, por encima de la cabeza, al frente, juntas en la pesa o separadas, perdidas por las gafas y
// girando las muñecas), con los mismos ajustes; tienen que salir las mismas cargas, los mismos niveles, las mismas
// repeticiones (PERFECTA, rápida, carga y brazo), los mismos avisos y los mismos chasquidos arriba, en el mismo fotograma.
//
// También el filtro de las manos (HF: al alcance y sin saltos imposibles), portado en el PR 30 (src/input/hand-filter.ts).
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { StandingDetector, STAND_EX, standDefaults, type StandCfg, type StandEvent } from '../../src/exercise/standing.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3, Quaternion: Q4 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const DEEP_EX = ['squat', 'lunge', 'jsquat', 'thruster', 'frontsq', 'dlrow'];

type RAApi = { runDetectors: (t: number, dt: number) => void; JUMP: { lastY: number }; DET: Record<string, Record<string, unknown>>; HL: THREE.Vector3; REC: string[]; frame: { n: number } };

function original(c: StandCfg, hands: Record<Side, Hand>, head: { p: THREE.Vector3; speed: number }, y0: number): RAApi {
  const code = [
    // lo que hacen el juego y sus avisos, apuntado (con el «charged» de RepArena: sin carga, onPower no sube)
    'let charged = false; const REC = [], frame = { n: 0 };',
    "const rec = s => REC.push(frame.n + ' ' + s);",
    "function onCharge() { charged = true; rec('charge'); }",
    "function onPower(p, deep) { if (!charged) return; rec('power ' + p + ' ' + !!deep); }",
    "function onRep(o, side) { stats.reps++; charged = false; rec('rep ' + o.perfect + ' ' + o.fast + ' ' + (o.pow || 1) + ' ' + (side || '-')); }",
    "function onPartial(m) { charged = false; rec('partial ' + m); }",
    "function topCue(side) { rec('top ' + (side || '-')); }",
    "function say(m, col) { rec('say ' + m + ' ' + col); }",
    "function showToast(m, col) { rec('say ' + m + ' ' + col); }",
    raSlice('70_game.js', 'const powLevel'),
    raSlice('70_game.js', 'const wrapAng'),
    raSlice('70_game.js', 'const HL = '),
    raSlice('70_game.js', 'const JUMP = ', '// Una huella', false),
    raSlice('70_game.js', 'const DET = {', '// Superman', false),
    raSlice('70_game.js', 'function armStep', '// Pesas que se agarran', false),
    raSlice('70_game.js', '// Pesas que se agarran', '// Ejercicios en dos tiempos', false),
    raSlice('70_game.js', '// Ejercicios en dos tiempos', '// Leñador', false),
    raSlice('70_game.js', 'const _frm', 'function chopStep', false),
    raSlice('70_game.js', 'const _tw0', '/* =================== FLEXIONES INCHWORM', false),
    raSlice('70_game.js', 'function runDetectors', '/* =================== APUNTADO', false),
  ].join('\n');
  const settings: Record<string, unknown> = { mode: 'combat', exercise: c.ex, ...c };
  const api = raRun<RAApi>(code, '{ runDetectors, JUMP, DET, HL, REC, frame }', {
    THREE,
    V3,
    Q4,
    settings,
    hands,
    head,
    state: 'play',
    stats: { reps: 0 },
    dv: (k: string) => settings[k],
    deepOn: () => c.deepDrop > 0 && DEEP_EX.includes(c.ex),
    isBars: () => false,
    isCombat: () => true,
    pistolOn: () => !c.power,
    swordActive: () => false,
    arena: { worldToLocal: (v: THREE.Vector3) => v }, // (la arena, sin girar: delante es −Z)
    SND: { charge() {}, tick() {}, beep() {} },
    SAYT: { t: 0 },
    TRK: {}, // (las cuentas de depuración del curl con barra)
  });
  // de pie, a la altura de la cabeza (como al calibrar)
  for (const k of ['sq', 'lu']) Object.assign(api.DET[k], { ref: y0 });
  api.JUMP.lastY = y0;
  return api;
}

// La cabeza al azar: de pie, bajando (a medias, lo pedido o más), aguantando abajo, subiendo, saltando o quieta
class HeadSim {
  y: number;
  from = 0;
  to = 0;
  t = 0;
  dur = 0;
  speed = 0;
  constructor(private r: () => number, private y0: number) {
    this.y = y0;
    this.next();
  }
  private next(): void {
    const r = this.r, x = r();
    this.from = this.y;
    this.t = 0;
    if (x < 0.3) {
      this.to = this.y0 + (r() - 0.5) * 0.04;
      this.dur = 0.2 + r() * 1.5;
    } else if (x < 0.75) {
      this.to = this.y0 - (0.03 + r() * 0.45);
      this.dur = 0.15 + r() * 1.6;
    } else if (x < 0.85) {
      this.to = this.y;
      this.dur = 0.5 + r() * 6; // aguantando
    } else if (x < 0.95) {
      this.to = this.y0 + 0.03 + r() * 0.15; // un salto
      this.dur = 0.08 + r() * 0.25;
    } else {
      this.to = this.y0 + (r() - 0.5) * 0.3;
      this.dur = 0.02 + r() * 0.1;
    }
  }
  step(dt: number): void {
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = k * k * (3 - 2 * k), prev = this.y;
    this.y = this.from + (this.to - this.from) * e + (this.r() - 0.5) * 0.002;
    this.speed += (Math.abs(this.y - prev) / dt - this.speed) * Math.min(1, dt * 8);
    if (k >= 1) this.next();
  }
}

// Una mano al azar, respecto a la cabeza: abajo (muslos), a media altura, al hombro, al frente o por encima de la cabeza;
// a ratos perdida, a ratos un salto del seguimiento; y la muñeca girando (los antebrazos)
class HandSim {
  p = new V3();
  from = new V3();
  to = new V3();
  t = 0;
  dur = 0;
  lost = false;
  glitch = false;
  ang = 0;
  angFrom = 0;
  angTo = 0;
  constructor(private r: () => number, private sx: number) {
    this.p.set(sx * 0.18, -0.75, -0.15);
    this.next();
  }
  private next(): void {
    const r = this.r, x = r();
    this.from.copy(this.p);
    this.angFrom = this.ang;
    this.t = 0;
    this.lost = r() < 0.12;
    this.glitch = r() < 0.03;
    const ys = [-0.82, -0.75, -0.6, -0.45, -0.3, -0.15, 0, 0.25, 0.35];
    this.to.set(this.sx * (0.05 + r() * 0.3), ys[Math.floor(r() * ys.length)] + (r() - 0.5) * 0.06, -(0.05 + r() * 0.6));
    this.angTo = (r() - 0.5) * 3.2;
    this.dur = this.glitch ? 0.001 : 0.1 + r() * 1.8;
  }
  step(dt: number): void {
    this.t += dt;
    const k = Math.min(1, this.t / this.dur), e = k * k * (3 - 2 * k);
    this.p.copy(this.from).lerp(this.to, e);
    this.ang = this.angFrom + (this.angTo - this.angFrom) * e;
    if (k >= 1) this.next();
  }
}

const ev = (e: StandEvent): string =>
  e.type === 'charge' ? 'charge'
  : e.type === 'power' ? `power ${e.level} ${e.deep}`
  : e.type === 'rep' ? `rep ${e.perfect} ${e.fast} ${e.pow} ${e.side ?? '-'}`
  : e.type === 'partial' ? `partial ${e.msg}`
  : e.type === 'top' ? `top ${e.side ?? '-'}`
  : `say ${e.msg} ${e.color}`;

function scenario(ex: string, seed: number, frames: number): { ra: string[]; port: string[] } {
  const r = rng(seed);
  const c: StandCfg = { ...standDefaults(ex), perfectTime: [0, 0.6, 1.2, 2][Math.floor(r() * 4)], deepDrop: r() < 0.5 ? 0 : 6 + Math.floor(r() * 10), power: r() < 0.9 };
  if (!DEEP_EX.includes(ex)) c.deepDrop = 0; // (la recarga profunda, solo en los de piernas: el juego se la pasa así, con deepOn)
  c.squatDepth = 18 + Math.floor(r() * 16);
  c.curlRange = 20 + Math.floor(r() * 15);
  const y0 = 1.5 + r() * 0.25;
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const head = { p: new V3(0, y0, 0), speed: 0 };
  const RA = original(c, hands, head, y0);
  const det = new StandingDetector();
  det.reset(y0);
  const out: StandEvent[] = [], port: string[] = [];
  const I = { hands, head, fwd: new V3(0, 0, -1), play: true };
  const hs = new HeadSim(r, y0), sims = { left: new HandSim(r, -1), right: new HandSim(r, 1) };
  const clasp = ex === 'curl2' || ex === 'fraise' || ex === 'swing' ? 0.6 : 0.15; // (con una pesa en las dos manos, juntas a menudo)
  let t = 1, together = false;
  const ax = new V3(), up = new V3(0, 1, 0), v = new V3();
  for (let fr = 0; fr < frames; fr++) {
    const x = r(), dt = x < 0.05 ? 1 / 30 : x < 0.1 ? 1 / 90 : x < 0.12 ? 0.11 : 1 / 72 + (r() - 0.5) * 0.002;
    t += dt;
    if (fr > 0) hs.step(dt);
    head.p.y = hs.y;
    head.speed = hs.speed;
    if (r() < 0.01) together = r() < clasp;
    for (const s of ['left', 'right'] as Side[]) {
      const sim = sims[s], h = hands[s];
      sim.step(dt);
      const src = together && s === 'right' ? sims.left : sim;
      h.ok = !sim.lost;
      h.wrist.copy(head.p).add(src.p);
      if (together && s === 'right') h.wrist.x += 0.12;
      if (sim.glitch) h.wrist.add(v.set(0.4, 0.3, -0.3));
      // el nudillo del corazón, girando alrededor de la línea entre las muñecas (a ratos no se ve)
      h.J[10].ok = r() > 0.05;
      h.J[11].ok = r() > 0.3;
      ax.set(1, 0, 0);
      const k = v.set(0, 0, -0.09).applyAxisAngle(ax, (s === 'left' ? -1 : 1) * sim.ang);
      h.J[10].p.copy(h.wrist).add(k);
      h.J[11].p.copy(h.wrist).addScaledVector(k, 1.3);
      h.wristQ.setFromAxisAngle(up, sim.ang * 0.3);
    }
    RA.frame.n = fr;
    RA.HL.copy(head.p);
    RA.runDetectors(t, dt);
    out.length = 0;
    det.update(t, dt, I, c, out);
    for (const e of out) port.push(`${fr} ${ev(e)}`);
  }
  return { ra: RA.REC, port };
}

describe.skipIf(!RA_DIR)('los ejercicios de pie, como en RepArena', () => {
  const SEEDS = Number(process.env.SEEDS || 40);
  for (const ex of STAND_EX)
    it(`${ex}: lo mismo en ${SEEDS} partidas al azar`, () => {
      const n: Record<string, number> = {};
      for (let s = 1; s <= SEEDS; s++) {
        const { ra, port } = scenario(ex, s * 7919 + ex.length, 2500);
        for (const l of ra) {
          const k = l.split(' ')[1];
          n[k] = (n[k] || 0) + 1;
        }
        expect(port, `semilla ${s}`).toEqual(ra);
      }
      if (process.env.COUNTS) console.log(ex, JSON.stringify(n));
      // que pasen cosas (si no, la comparación no prueba nada): cargas, repeticiones y avisos
      expect(n.charge ?? 0).toBeGreaterThan(SEEDS);
      expect(n.rep ?? 0).toBeGreaterThan(SEEDS);
      expect(n.partial ?? 0).toBeGreaterThan(0);
    });
});
