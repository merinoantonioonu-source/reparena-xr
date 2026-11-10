// Los ejercicios de suelo y sentado portados (src/exercise/floor.ts: FloorDetector) frente al código original de RepArena
// (src/70_game.js: runDetectors, con vertDetector y armsBack): la misma cabeza y las mismas manos al azar (en la silla, en
// la plancha, tumbado, en plancha lateral; bajando y subiendo a distintas alturas y ritmos, aguantando, levantándose; las
// manos apoyadas, levantándose, recogidas o perdidas por las gafas), con los mismos ajustes; tienen que salir las mismas
// cargas, niveles, repeticiones, avisos y cuentas atrás, en el mismo fotograma. (Se salta sin RA_DIR.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mkHand, type Hand, type Side } from '../../src/input/hand-model.js';
import { FloorDetector, FLOOR_EX, floorDefaults, type FloorCfg } from '../../src/exercise/floor.js';
import type { StandEvent } from '../../src/exercise/standing.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3, Quaternion: Q4 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
type RAApi = { runDetectors: (t: number, dt: number) => void; DET: Record<string, Record<string, unknown>>; HL: THREE.Vector3; REC: string[]; frame: { n: number } };

function original(c: FloorCfg, hands: Record<Side, Hand>, head: { p: THREE.Vector3; speed: number; q: THREE.Quaternion }): RAApi {
  const code = [
    'let charged = false; const REC = [], frame = { n: 0 };',
    "const rec = s => REC.push(frame.n + ' ' + s);",
    "function onCharge() { charged = true; rec('charge'); }",
    "function onPower(p, deep) { if (!charged) return; rec('power ' + p + ' ' + !!deep); }",
    "function onRep(o, side) { stats.reps++; charged = false; rec('rep ' + o.perfect + ' ' + o.fast + ' ' + (o.pow || 1) + ' ' + (side || '-')); }",
    "function onPartial(m) { charged = false; rec('partial ' + m); }",
    "function topCue(side) { rec('top ' + (side || '-')); }",
    "function say(m, col) { rec('say ' + m + ' ' + col); }",
    "function showToast(m, col) { rec('say ' + m + ' ' + col); }",
    "const fmtNum = v => String(Math.round(v * 10) / 10).replace('.', ',');",
    raSlice('70_game.js', 'const powLevel'),
    raSlice('70_game.js', 'const wrapAng'),
    raSlice('70_game.js', 'const HL = '),
    raSlice('70_game.js', 'const JUMP = ', '// Una huella', false),
    raSlice('70_game.js', 'const DET = {', 'function armStep', false),
    raSlice('70_game.js', 'function armStep', '// Pesas que se agarran', false),
    raSlice('70_game.js', '// Pesas que se agarran', '// Ejercicios en dos tiempos', false),
    raSlice('70_game.js', '// Ejercicios en dos tiempos', '// Leñador', false),
    raSlice('70_game.js', 'const _frm', 'function chopStep', false),
    raSlice('70_game.js', 'const _tw0', '/* =================== FLEXIONES INCHWORM', false),
    raSlice('70_game.js', 'const PL_FLOOR'),
    // el inchworm: su línea y su cabeza (sin lo que se ve: IW, la onda)
    "const IW_LINE = 0.15, IW = { flash: 0 }; const iwReachM = () => settings.iwReach > 0 ? Math.max(0.8, settings.iwReach / 100) : clamp(calibRef * 0.8, 1.0, 1.6); const IW_OFF = () => iwReachM() + 0.12;",
    raSlice('70_game.js', 'function iwHead'),
    raSlice('70_game.js', 'function iwStep', 'function iwVisual', false),
    'function iwWave() {}',
    raSlice('70_game.js', 'function runDetectors', '/* =================== APUNTADO', false),
    "handFilter = () => { for (const s of ['left', 'right']) HF[s].ok = hands[s].ok; };",
    "fwd = () => new V3(0, 0, -1);",
  ].join('\n');
  const settings: Record<string, unknown> = { mode: 'combat', exercise: c.ex, ...c };
  return raRun<RAApi>(code, '{ runDetectors, DET, HL, REC, frame }', {
    THREE,
    V3,
    Q4,
    settings,
    hands,
    head,
    state: 'play',
    stats: { reps: 0 },
    dv: (k: string) => settings[k],
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    deepOn: () => false,
    isBars: () => false,
    isCombat: () => true,
    oneArm: () => c.ex === 'plank1',
    pistolOn: () => !c.power,
    swordActive: () => false,
    arena: { worldToLocal: (v: THREE.Vector3) => v, localToWorld: (v: THREE.Vector3) => v },
    SND: { charge() {}, tick() {}, beep() {}, partial() {} },
    SAYT: { t: 0 },
    TRK: {},
    POW_COL: [0x3cf0c6, 0xffd166, 0xff8a3d, 0xff3cf0],
    calibRef: 1.6,
    hapticBoth: () => {},
    _iww: new V3(),
    fx: { sparks() {}, glow() {} },
  });
}

// la postura de cada uno: la altura de la cabeza y cuánto se mueve
const POSE: Record<string, [number, number]> = { dips: [1.0, 0.35], pushup: [0.4, 0.25], splank: [0.5, 0.2], superman: [0.2, 0.3], plank1: [0.4, 0.22], inchworm: [1.6, 1.3] };

const ev = (e: StandEvent): string =>
  e.type === 'charge' ? 'charge'
  : e.type === 'power' ? `power ${e.level} ${e.deep}`
  : e.type === 'rep' ? `rep ${e.perfect} ${e.fast} ${e.pow} ${e.side ?? '-'}`
  : e.type === 'partial' ? `partial ${e.msg}`
  : e.type === 'top' ? `top ${e.side ?? '-'}`
  : `say ${e.msg} ${e.color}`;

function scenario(ex: string, seed: number, frames: number): { ra: string[]; port: string[] } {
  const r = rng(seed);
  const c: FloorCfg = { ...floorDefaults(ex), perfectTime: [0, 0.6, 1.2][Math.floor(r() * 3)], power: r() < 0.9, supArms: r() < 0.3 ? 'no' : 'yes', iwReach: r() < 0.5 ? 0 : 100 + Math.floor(r() * 50) };
  const [y0, amp] = POSE[ex];
  const hands: Record<Side, Hand> = { left: mkHand(), right: mkHand() };
  const head = { p: new V3(0, y0, 0), speed: 0, q: new Q4() };
  for (const s of ['left', 'right'] as Side[]) {
    hands[s].ok = true;
    hands[s].wrist.set(s === 'left' ? -0.25 : 0.25, 0.08, -0.3);
  }
  const RA = original(c, hands, head);
  for (const k of ['di', 'pu', 'pl', 'plp', 'sp', 'su']) Object.assign(RA.DET[k], { ref: y0 });
  Object.assign(RA.DET.su, { lo: y0 });
  for (const s of ['left', 'right']) Object.assign((RA.DET.pl as Record<string, Record<string, unknown>>)[s], { floor: 0.08 });
  const det = new FloorDetector();
  det.reset(y0, { left: 0.08, right: 0.08 });
  const out: StandEvent[] = [], port: string[] = [];
  const I = { hands, head, headQ: head.q, fwd: new V3(0, 0, -1), play: true, wave: true, iwZ: 0, standY: 1.6 };
  // el inchworm: de pie en la salida (z = alcance + 12 cm), caminando con las manos hasta la línea (z = 0) y vuelta
  const S = (c.iwReach > 0 ? Math.max(0.8, c.iwReach / 100) : 1.28) + 0.12;
  let iwk = 0, iwDir = 1, iwGo = 0.6 + r() * 0.5;
  let t = 1, y = y0, from = y0, to = y0, k = 1, dur = 1;
  const hand = { left: { from: 0.08, to: 0.08, k: 1, dur: 1 }, right: { from: 0.08, to: 0.08, k: 1, dur: 1 } };
  for (let fr = 0; fr < frames; fr++) {
    const dt = r() < 0.05 ? 1 / 30 : 1 / 72 + (r() - 0.5) * 0.002;
    t += dt;
    // la cabeza: a su postura, más arriba (sube el tronco, la cadera o se levanta) o más abajo, deprisa o despacio
    k += dt / dur;
    if (k >= 1) {
      from = y;
      const x = r();
      to = x < 0.35 ? y0 + (r() - 0.5) * 0.04 : x < 0.7 ? y0 - r() * amp : x < 0.9 ? y0 + r() * amp : y0 + 0.4 + r() * 0.5;
      dur = r() < 0.3 ? 2 + r() * 4 : 0.2 + r() * 1.5;
      k = 0;
    }
    const e = k * k * (3 - 2 * k), prev = y;
    y = from + (to - from) * e + (r() - 0.5) * 0.002;
    if (ex === 'inchworm') {
      // de pie → doblado y hasta la línea (o no tanto) → flexiones → de vuelta (o no tanto) → de pie
      iwk = Math.max(0, Math.min(1, iwk + iwDir * dt * 0.25));
      if (iwk >= iwGo || iwk <= 0) {
        iwDir = -iwDir;
        iwGo = r() < 0.75 ? 1 : 0.3 + r() * 0.6;
      }
      head.p.z = S - (S + 0.05) * iwk;
      y = iwk < 0.08 ? 1.6 - iwk * 10 : 0.45 - (iwk > 0.95 ? Math.max(0, Math.sin(t * 2.5)) * 0.15 : 0) + (r() - 0.5) * 0.002;
    }
    head.p.y = y;
    I.iwZ = head.p.z;
    head.speed += (Math.abs(y - prev) / dt - head.speed) * Math.min(1, dt * 8);
    // las manos: apoyadas o levantándose (y, a ratos, perdidas o recogidas junto a la cabeza)
    for (const s of ['left', 'right'] as Side[]) {
      const H = hand[s], h = hands[s];
      H.k += dt / H.dur;
      if (H.k >= 1) {
        H.from = h.wrist.y;
        H.to = r() < 0.6 ? 0.06 + r() * 0.05 : 0.15 + r() * 0.4;
        H.dur = 0.2 + r() * 1.2;
        H.k = 0;
        h.ok = r() > 0.1;
        h.wrist.z = r() < 0.15 ? 0.05 : -0.3;
      }
      const ek = H.k * H.k * (3 - 2 * H.k);
      h.wrist.y = H.from + (H.to - H.from) * ek;
    }
    RA.frame.n = fr;
    RA.HL.copy(head.p);
    RA.runDetectors(t, dt);
    out.length = 0;
    det.update(t, dt, I, c, out);
    for (const e2 of out) port.push(`${fr} ${ev(e2)}`);
  }
  return { ra: RA.REC, port };
}

describe.skipIf(!RA_DIR)('los ejercicios de suelo y sentado, como en RepArena', () => {
  const SEEDS = Number(process.env.SEEDS || 40);
  for (const ex of FLOOR_EX)
    it(`${ex}: lo mismo en ${SEEDS} partidas al azar`, () => {
      const n: Record<string, number> = {};
      for (let s = 1; s <= SEEDS; s++) {
        const { ra, port } = scenario(ex, s * 7919 + ex.length, 3000);
        for (const l of ra) {
          const kk = l.split(' ')[1];
          n[kk] = (n[kk] || 0) + 1;
        }
        expect(port, `semilla ${s}`).toEqual(ra);
      }
      if (process.env.COUNTS) console.log(ex, JSON.stringify(n));
      expect(n.charge ?? 0).toBeGreaterThan(SEEDS);
      expect(n.rep ?? 0).toBeGreaterThan(SEEDS);
    });
});
