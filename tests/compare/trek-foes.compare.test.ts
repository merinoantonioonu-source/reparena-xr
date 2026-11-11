// Los bandidos y los lobos de la Travesía portados (src/modes/trek/bandits.ts y wolves.ts) frente al código original de
// RepArena (src/75_trek.js: trekBandFight, trekStone*, trekBandAnim, trekHaltStep/trekHaltEnd; trekCutPoint,
// trekChaseStart/End/Step), con el mismo azar: combates fotograma a fotograma con la cabeza esquivando o no (piedras altas,
// bajas y al cuerpo) y zancadas al azar, con modelo (su animación manda en el lanzamiento) y sin él; y persecuciones con el
// jugador avanzando a distintas velocidades. Los mismos estados, posiciones, juicios, muertes y sucesos (sin los efectos
// visuales). (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bandAnim, bandFight, bandPlay, makeBanditStop, type BanditStop } from '../../src/modes/trek/bandits.js';
import type { BanditEvent, BanditsEnv, WolfEvent, WolvesEnv } from '../../src/modes/trek/env-foes.js';
import { makeWolves, trekCutPoint, wolvesStep } from '../../src/modes/trek/wolves.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const f = (n: number): string => (Math.abs(n) < 5e-7 ? 0 : n).toFixed(6);
const fp = (p: { x: number; y: number; z: number } | null | undefined): string => (p ? `${f(p.x)},${f(p.y)},${f(p.z)}` : '-');
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
// (juntar los globales sin perder sus «get» y «set»: con «...» se copiaría el valor del momento)
const merge = (a: object, b: object): Record<string, unknown> => Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(a), ...Object.getOwnPropertyDescriptors(b) });

/** Lo común para ejecutar RepArena: el azar, el registro de sucesos (como texto) y los efectos que no se comparan. */
function common(random: () => number, log: string[]): Record<string, unknown> {
  let score = 0;
  const Mth = { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random };
  const snd = new Proxy({}, { get: (_o, name: string) => (p?: THREE.Vector3, a?: unknown) => log.push(`snd|${name}|${fp(p)}${name === 'wolfGrowl' ? `|${f(a as number)}` : ''}`) });
  const noop = new Proxy({}, { get: () => () => {} });
  return {
    V3,
    Math: Mth,
    clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    rand: (a: number, b: number) => a + random() * (b - a),
    smooth: (t: number) => t * t * (3 - 2 * t),
    say: (text: string, col: string, dur: number) => log.push(`say|${text}|${col}|${f(dur)}`),
    cheer: (text: string, col: string, dur: number) => log.push(`cheer|${text}|${col}|${f(dur)}`),
    hapticBoth: (s: number, ms: number) => log.push(`haptic|${s}|${ms}`),
    hurtPlayer: () => log.push('hurt'),
    comicKill: (p: THREE.Vector3) => log.push(`kill|${fp(p)}`),
    comicHit: () => log.push('hit'),
    SND: snd,
    fx: noop,
    get score() {
      return score;
    },
    set score(v: number) {
      log.push(`score|${v - score}`);
      score = v;
    },
    get boardDirty() {
      return false;
    },
    set boardDirty(_v: boolean) {
      log.push('board');
    },
  };
}

/** Mis sucesos como el registro de RepArena (sin los efectos visuales ni los que RepArena no registra). */
function myLog<At>(ev: (BanditEvent | WolfEvent)[], log: string[], at: (p: At) => string): void {
  for (const e of ev as R[]) {
    if (e.k === 'say' || e.k === 'cheer') log.push(`${e.k}|${e.text}|${e.col}|${f(e.dur)}`);
    else if (e.k === 'snd') log.push(`snd|${e.snd}|${e.at ? at(e.at) : '-'}${e.snd === 'wolfGrowl' ? `|${f(e.vol)}` : ''}`);
    else if (e.k === 'score') log.push(`score|${e.n}`);
    else if (e.k === 'board') log.push('board');
    else if (e.k === 'haptic') log.push(`haptic|${e.s}|${e.ms}`);
    else if (e.k === 'hurt' || e.k === 'hit') log.push(e.k);
    else if (e.k === 'kill') log.push(`kill|${at(e.at)}`);
    else if (e.k === 'end') log.push(`end|${e.won}`);
    else if (e.k === 'chaseStart' || e.k === 'chaseEnd') log.push(e.k);
  }
  ev.length = 0;
}

const CLIPS: Record<string, number> = { Idle_Loop: 2.0, Walk_Loop: 1.1, Dance_Loop: 1.6, OverhandThrow: 1.3, Hit_Chest: 0.7, Hit_Head: 0.65, Death01: 1.9 };
const handAt = (b: { x: number; z: number }) => ({ x: b.x + 0.18, y: 1.55 + 0.05 * Math.sin(b.z), z: b.z - 0.12 });

describe.skipIf(!RA_DIR)('la Travesía: bandidos y lobos, como en RepArena', () => {
  it('el punto de corte, el mismo en 2000 casos', () => {
    const ra = raRun<(D: number, X: number, r: number) => number>(raSlice('75_trek.js', 'function trekCutPoint'), 'trekCutPoint', {});
    const r = rng(5);
    for (let i = 0; i < 2000; i++) {
      const D = 1 + r() * 60, X = r() * 20, rho = 0.3 + r() * 2;
      expect(trekCutPoint(D, X, rho)).toBe(ra(D, X, rho));
    }
  });

  it('los combates con los bandidos: mismos estados, piedras, juicios, muertes y sucesos (160 combates)', () => {
    const code = [
      raSlice('75_trek.js', 'function trekBandPlay', '// un punto de la arena', false),
      raSlice('75_trek.js', 'const _tkl', 'function trekLoc'),
      raSlice('75_trek.js', 'const _tbw'),
      raSlice('75_trek.js', 'const TREK_STONE_TXT', '/* ---------- Lobos', false),
      raSlice('75_trek.js', 'function trekHaltStep', 'const TREK_GEMS', false),
      'const _he = trekHaltEnd; trekHaltEnd = function (o, won) { LOG.push("end|" + won); return _he(o, won); };',
    ].join('\n');
    let frames = 0, deaths = 0, dodges = 0, hits = 0, shoves = 0, wins = 0;
    for (let seed = 1; seed <= 160; seed++) {
      const r = rng(seed), model = seed % 2 === 0, wave = Math.floor(r() * 6), rank = Math.floor(r() * 7), calibRef = 1.55 + r() * 0.2;
      const jumpHeight = 4 + r() * 6, pDodge = 0.3 + r() * 0.7, rest = seed % 7 === 0 ? 1500 + Math.floor(r() * 2000) : -1;
      const HL = new V3(0, calibRef, 0), world = { state: 'play' };
      const raLog: string[] = [], log: string[] = [];
      const raR = rng(seed * 104729), ptR = rng(seed * 104729);
      const TREK: R = { halt: null, lunge: false, ducked: 0, glide: 0, dist: 0 };
      const TREK_BAND = { scene: model ? {} : null, clips: Object.fromEntries(Object.entries(CLIPS).map(([name, duration]) => [name, { name, duration }])) };
      const g = common(raR, raLog);
      const ra = raRun<{ anim: (o: R, dt: number, t: number) => void; halt: (dt: number, t: number) => void; play: (b: R, n: string) => void }>(code, '{ anim: trekBandAnim, halt: trekHaltStep, play: trekBandPlay }', merge(g, {
        LOG: raLog,
        THREE: { Group: class { position = new V3(); rotation = { x: 0, y: 0, z: 0 }; scale = new V3(1, 1, 1); children = []; add() {} }, LoopOnce: 2200, LoopRepeat: 2201 },
        get state() {
          return world.state;
        },
        get HL() {
          return HL;
        },
        head: { get p() {
          return HL;
        } },
        calibRef,
        settings: { jumpHeight },
        waveIdx: wave,
        rankIdx: () => rank,
        TREK,
        TREK_BAND,
        trekRock: () => {},
        glowSprite: () => ({ add() {} }),
        _tkh: new V3(),
      }));
      // el mezclador de animaciones, el mismo modelo que el portado (el de una vez se queda en su último fotograma)
      class Act {
        time = 0; paused = false; timeScale = 1; loop = 2201; clampWhenFinished = false; on = false;
        constructor(public clip: { name: string; duration: number }) {}
        reset() { this.time = 0; this.paused = false; return this; }
        setLoop(m: number) { this.loop = m; return this; }
        play() { this.on = true; return this; }
        stop() { this.on = false; return this; }
        crossFadeTo() {}
        getClip() { return this.clip; }
        tick(dt: number) {
          if (!this.on || this.paused) return;
          let t = this.time + dt * this.timeScale; const d = this.clip.duration;
          if (this.loop === 2200) { if (t >= d) { t = d; this.paused = true; } } else if (t >= d) t -= d * Math.floor(t / d);
          this.time = t;
        }
      }
      // la parada de RepArena (girada: trekLoc tiene que salir bien) y la mía
      const oMesh = { position: new V3(0.2, 0, -1), rotation: { y: 0.3 }, localToWorld: (v: THREE.Vector3) => v, worldToLocal: (v: THREE.Vector3) => v, add() {}, remove() {} };
      const n = wave >= 4 ? 3 : wave >= 2 ? 2 : 1, raB: R[] = [];
      for (let i = 0; i < n; i++) {
        const b: R = { x: (i % 2 ? 1 : -1) * (i ? 0.9 : 0.15), z: -2.5 - i * 1.6, st: 'wait', t: 0, hp: wave >= 2 ? 6 : 5, skin: i % 2, ph: raR() * 3, alive: true, band: true, ry: Math.PI };
        b.maxHp = b.hp;
        if (model) {
          const acts: Act[] = [];
          b.mesh = { position: { set() {} }, rotation: { y: 0 }, visible: true, updateMatrixWorld() {}, getObjectByName: (nm: string) => (nm === 'hand_r' ? { getWorldPosition: (out: THREE.Vector3) => { const h = handAt(b as { x: number; z: number }); return out.set(h.x, h.y, h.z); } } : null) };
          b.mix = { clipAction: (c: { name: string; duration: number }) => { const a = new Act(c); acts.push(a); return a; }, update: (dt: number) => acts.forEach((a) => a.tick(dt)) };
          b.acts = {};
          ra.play(b, 'Dance_Loop');
        }
        raB.push(b);
      }
      const o: R = { kind: 'bandit', bandits: raB, mesh: oMesh, haltT: 0, warn: { position: new V3(), material: { color: { setHex() {} }, opacity: 0 } } };
      TREK.halt = o;
      const stop: BanditStop = makeBanditStop(wave, ptR, model ? CLIPS : null);
      const loc = { x: 0, z: 0 }, ev: BanditEvent[] = [];
      const env: BanditsEnv = { state: 'play', head: HL, eyeY: calibRef, loc, calibRef, jumpHeight, wave, rank, lunge: false, rnd: ptR, clips: model ? CLIPS : null, hand: handAt };
      const dodge = new Map<object, boolean>();
      let t = 0;
      for (let i = 0; i < 7000; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        world.state = rest >= 0 && i >= rest ? 'rest' : i % 1300 > 1240 ? 'paused' : 'play';
        // la cabeza: quieta (con un vaivén), o esquivando la piedra que viene
        let hx = 0.1 * Math.sin(t * 0.5), hy = calibRef - 0.01 * Math.sin(t * 2);
        const q = (o.stones2 || []).find((s: R) => !s.done);
        if (q) {
          if (!dodge.has(q)) dodge.set(q, r() < pDodge);
          const k = q.t / q.dur;
          if (dodge.get(q)) {
            if (q.atk === 'high' && k > 0.5) hy = calibRef - 0.3;
            else if (q.atk === 'low' && k > 0.6) hy = calibRef + jumpHeight / 100 + 0.05;
            else if (q.atk === 'body' && k > 0.5) hx = q.x0 + 0.4;
          }
        }
        HL.set(hx, hy, 0.05 * Math.cos(t * 0.3));
        const lunge = r() < 0.0008;
        TREK.lunge = lunge;
        // (trekLoc: tu cabeza en la parada)
        const a = -oMesh.rotation.y, dx = HL.x - oMesh.position.x, dz = HL.z - oMesh.position.z;
        loc.x = dx * Math.cos(a) + dz * Math.sin(a);
        loc.z = -dx * Math.sin(a) + dz * Math.cos(a);
        Object.assign(env, { state: world.state, eyeY: HL.y, lunge });
        ra.anim(o, dt, t);
        if (TREK.halt) ra.halt(dt, t);
        bandAnim(stop, dt, env);
        bandFight(stop, dt, t, env, ev);
        myLog(ev, log, fp);
        // (todo el estado de un fotograma en un texto: mismos números, al último bit)
        const S: R[] = o.stones2 || [];
        const raSnap = [!TREK.halt, o.haltT, f(o.warn.material.opacity), ...raB.map((A) => [A.st, A.hp, A.alive, A.t, A.x, A.z, A.y || 0, ...(model ? [A.ry, A.cur.clip.name, A.cur.time, A.cur.paused, A.cur.timeScale] : [])].join(' ')), ...S.map((q) => [q.m.position.toArray().join(','), q.done, q.m.scale.x].join(' '))].join('|');
        const mySnap = [stop.done, stop.haltT, f(stop.warn.opacity), ...stop.bandits.map((b) => [b.st, b.hp, b.alive, b.t, b.x, b.z, b.y, ...(model ? [b.ry, b.cur?.clip, b.cur?.time, b.cur?.paused, b.cur?.ts] : [])].join(' ')), ...stop.stones.map((q) => [q.pos.toArray().join(','), q.done, q.scale].join(' '))].join('|');
        if (mySnap !== raSnap || log.length !== raLog.length) {
          const at = `semilla ${seed} (modelo: ${model}), fotograma ${i}`;
          expect(log.slice(-8), at).toEqual(raLog.slice(-8));
          expect(mySnap, at).toBe(raSnap);
        }
        frames++;
        if (stop.done && !stop.stones.length && stop.bandits.every((b) => b.st === 'gone')) break; // (ya no queda nada)
      }
      expect(log).toEqual(raLog);
      deaths += stop.bandits.filter((b) => !b.alive).length;
      dodges += stop.dodges;
      hits += stop.hits;
      shoves += stop.shoves;
      if (log.includes('end|true')) wins++;
    }
    expect(frames).toBeGreaterThan(300000);
    // (que se haya visto de todo)
    expect(deaths).toBeGreaterThan(120);
    expect(dodges).toBeGreaterThan(400);
    expect(hits).toBeGreaterThan(400);
    expect(shoves).toBeGreaterThan(150);
    expect(wins).toBeGreaterThan(120);
  }, 300000);

  it('las persecuciones de los lobos: misma carrera, mordiscos, cruces y sucesos (160 rondas, a distintas velocidades)', () => {
    const code = [
      raSlice('75_trek.js', 'const TREK_WOLF =', 'function trekStep', false),
      'const _cs = trekChaseStart; trekChaseStart = function () { LOG.push("chaseStart"); return _cs(); };',
      'const _ce = trekChaseEnd; trekChaseEnd = function (m, c) { if (TREK.chase) LOG.push("chaseEnd"); return _ce(m, c); };',
    ].join('\n');
    let frames = 0, bites = 0, crossed = 0, chases = 0;
    for (let seed = 1; seed <= 160; seed++) {
      const r = rng(seed), wave = Math.floor(r() * 6), rank = Math.floor(r() * 7), trekSpeed = [60, 100, 130, 200][seed % 4];
      const vBase = 0.4 + r() * 2.0, rest = seed % 9 === 0 ? 3000 + Math.floor(r() * 2000) : -1;
      const HL = new V3(0, 1.6, 0), world = { state: 'play' };
      const raLog: string[] = [], log: string[] = [];
      const raR = rng(seed * 7907), ptR = rng(seed * 7907);
      const TREK: R = { dist: 0, nextChase: 30, chase: null, halt: null, lunge: false, group: { add() {}, remove() {} } };
      const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
      class Mesh { position = new V3(); scale = new V3(1, 1, 1); visible = true; renderOrder = 0; constructor(public geometry: unknown, public material: R) {} lookAt() {} raycast() {} }
      const ra = raRun<(dt: number, t: number) => void>(code, 'trekChaseStep', merge(common(raR, raLog), {
        LOG: raLog,
        THREE: { Mesh, PlaneGeometry: class {}, MeshBasicMaterial: class { constructor(p: R) { Object.assign(this, p); } dispose() {} }, CanvasTexture: class {}, DoubleSide: 2, sRGBEncoding: 3001, LoopOnce: 2200 },
        document: { createElement: () => ({ getContext: () => ctx2d }) },
        get state() {
          return world.state;
        },
        get HL() {
          return HL;
        },
        head: { get p() {
          return HL;
        } },
        settings: { trekSpeed },
        waveIdx: wave,
        rankIdx: () => rank,
        TREK,
        // (un sendero recto: s hacia −z)
        trekBend: (s: number, u: number, out: { x: number; z: number }) => { out.x = u; out.z = -(s - TREK.dist); return 0; },
        arena: { localToWorld: (v: THREE.Vector3) => v },
        _tkq: { x: 0, z: 0 },
        _tkh: new V3(),
      }));
      const W = makeWolves(), ev: WolfEvent[] = [];
      const path = { P: (s: number) => ({ x: 0, z: -s }), th: () => 0, dist: 0, v: 0 };
      const env: WolvesEnv = { state: 'play', path, halted: false, headU: 0, lunge: false, wave, rank, trekSpeed, rnd: ptR };
      const toArena = (p: { s: number; u: number; y: number }) => fp({ x: p.u, y: p.y, z: -(p.s - TREK.dist) + HL.z });
      let t = 0, wasChase = false;
      const prevSt: string[] = [];
      for (let i = 0; i < 6000; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        if (i === rest) world.state = 'rest';
        else if (world.state === 'rest' && i > rest + 300) world.state = 'play';
        const halted = i % 2000 > 1800; // (parado ante un reto un rato: esperan)
        TREK.halt = halted ? {} : null;
        const v = world.state === 'play' && !halted ? vBase * (1 + 0.35 * Math.sin(t * 0.25)) : 0;
        TREK.dist += v * dt;
        path.dist = TREK.dist; path.v = v;
        HL.set(0.4 * Math.sin(t * 0.7), 1.6, 0.05 * Math.sin(t));
        const lunge = r() < 0.004;
        TREK.lunge = lunge;
        Object.assign(env, { state: world.state, halted, headU: HL.x, lunge });
        ra(dt, t);
        wolvesStep(W, dt, t, env, ev);
        myLog(ev, log, toArena);
        if (W.chase && !wasChase) chases++;
        wasChase = !!W.chase;
        const C: R | null = TREK.chase, M = W.chase;
        if (M) for (let j = 0; j < M.wolves.length; j++) {
          const w = M.wolves[j], before = prevSt[j];
          if (before === 'race' && w.st === 'chase' && w.s < TREK.dist) crossed++; // (ha cruzado por detrás de ti)
          prevSt[j] = w.st;
        } else prevSt.length = 0;
        const raSnap = [TREK.nextChase, !!C, ...(C ? [C.t, C.growl, C.gap, ...C.wolves.map((A: R) => [A.st, A.s, A.u, A.hd, A.cs, A.mark.visible, ...(A.st !== 'gone' ? [fp(A.mark.position), A.mark.scale.x, A.mark.material.opacity] : [])].join(' '))] : [])].join('|');
        const mySnap = [W.nextChase, !!M, ...(M ? [M.t, M.growl, M.gap, ...M.wolves.map((w) => [w.st, w.s, w.u, w.hd, w.cs, w.mark.visible, ...(w.st !== 'gone' ? [toArena(w.mark), w.mark.scale, w.mark.opacity] : [])].join(' '))] : [])].join('|');
        if (mySnap !== raSnap || log.length !== raLog.length) {
          const at = `semilla ${seed}, fotograma ${i}`;
          expect(log.slice(-8), at).toEqual(raLog.slice(-8));
          expect(mySnap, at).toBe(raSnap);
        }
        frames++;
      }
      expect(log).toEqual(raLog);
      bites += log.filter((l) => l.startsWith('snd|wolfBite')).length;
    }
    expect(frames).toBe(160 * 6000);
    expect(chases).toBeGreaterThan(150);
    expect(bites).toBeGreaterThan(50);
    expect(crossed).toBeGreaterThan(40);
  }, 300000);
});
