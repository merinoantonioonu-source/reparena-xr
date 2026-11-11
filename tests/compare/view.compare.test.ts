// Dónde salen los avisos de la vista (src/ui/view.ts: ViewFrame, hudSlot, lazyAt, lazyClear) frente al código original de
// RepArena (src/60_ui.js: viewQ, fixvStep, hudLocal, panelHides, hudSlot, lazyAt, lazyClear): la cabeza moviéndose al azar
// (de pie, tumbándose boca abajo y boca arriba, ladeándola), con enemigos que pasan por delante y la partida que empieza y
// acaba; en cada fotograma, el aviso del centro tiene que estar en el mismo sitio, con el mismo giro y la misma opacidad.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hudSlot, hudSpot, lazyAt, lazyClear, mkLazy, ViewFrame, type Threat } from '../../src/ui/view.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const { Vector3: V3, Quaternion: Q4 } = THREE;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe.skipIf(!RA_DIR)('los avisos de la vista, como en RepArena', () => {
  it('el aviso del centro, en el mismo sitio y derecho, en 60 recorridos al azar', () => {
    const code = ['const _hl = new V3();', raSlice('60_ui.js', 'const _vq = new Q4()', 'const LZ = ', false), raSlice('60_ui.js', 'function lazyClear', '}')].join('\n');
    let frames = 0, lying = 0, moved = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed), floor = seed % 3 !== 0, supine = seed % 5 === 0;
      const head = { p: new V3(0, 1.6, 0), q: new Q4() };
      const W = { state: 'calib', enemies: [] as { alive: boolean; state: string; type: string; sc: number; radius: number; center: (o: THREE.Vector3) => THREE.Vector3 }[] };
      const ra = raRun<{ step: (dt: number) => { at: THREE.Vector3; q: THREE.Quaternion; vis: number; fade: number }; hudQ: () => THREE.Quaternion }>(code, `({ step: (dt) => { fixvStep(); const n = collectThreats(); const C = HUD.center; const L = lazyAt(LZ_c, hudSlot(C, C.slots, n, dt), hudQ(), dt); const o = new THREE.Object3D(); o.position.copy(L.at); o.quaternion.copy(L.q); o.scale.setScalar(CENTER_SC); const vis = lazyClear(L, o, 0.5, 0.2, n, dt); return { at: L.at, q: L.q, vis, fade: C.fade }; }, hudQ })`, {
        THREE,
        V3,
        Q4,
        head,
        get state() {
          return W.state;
        },
        xrActive: true,
        preview: false,
        settings: { exercise: floor ? (supine ? 'abs' : 'pushup') : 'squat' },
        isFloor: () => floor && !supine,
        isSupine: () => supine,
        fwd: (q = head.q) => new V3(0, 0, -1).applyQuaternion(q),
        touches: [],
        get enemies() {
          return W.enemies;
        },
        CENTER_SC: 1.5,
        LZ_c: { init: false, at: new V3(), q: new Q4(), home: new V3(), away: 0, go: false, vis: 1 },
      });
      const V = new ViewFrame(), C = hudSpot([[0, -0.08], [0, 0.42], [0, -0.5]], -1.1, 0.75, 0.3), L = mkLazy(), at = new V3(), o = new THREE.Object3D(), threats: Threat[] = [];
      const e = new THREE.Euler(0, 0, 0, 'YXZ');
      let yaw = 0, pitch = 0, roll = 0, t = 0;
      for (let i = 0; i < 1200; i++) {
        const dt = 1 / 72 + (r() - 0.5) * 0.004;
        t += dt;
        // la cabeza: gira, sube y baja la vista, se ladea y, en los de suelo, se tumba (mirando al suelo o al techo)
        yaw += (r() - 0.5) * 0.08;
        roll = Math.sin(t * 1.3) * 0.5;
        const down = floor && Math.sin(t * 0.4) > 0;
        pitch += ((down ? (supine ? 1.35 : -1.35) : (r() - 0.5) * 0.6) - pitch) * 0.05;
        e.set(pitch, yaw, roll);
        head.q.setFromEuler(e);
        head.p.set(Math.sin(t * 0.3) * 0.4, down ? 0.45 : 1.6, Math.cos(t * 0.25) * 0.3);
        W.state = i < 300 ? 'calib' : i < 900 ? 'play' : 'over';
        // los enemigos: uno que cruza por delante a la altura de los ojos
        W.enemies = [];
        threats.length = 0;
        if (i % 400 > 150) {
          const p = new V3(Math.sin(t * 0.7) * 1.2, 1.5, -2.5), rad = Math.max(0.1, 0.3 * 1.5);
          W.enemies.push({ alive: true, state: 'walk', type: 'imp', sc: 1, radius: 0.3, center: (out) => out.copy(p) });
          threats.push({ p, r: rad });
        }
        const a = ra.step(dt);
        V.step(head, floor, ['ready', 'play', 'rest', 'paused'].includes(W.state));
        hudSlot(V, C, C.slots, head, floor, threats, threats.length, dt, at);
        lazyAt(V, L, at, V.hudQ(head, floor), head, dt);
        o.position.copy(L.at);
        o.quaternion.copy(L.q);
        o.scale.setScalar(1.5);
        const vis = lazyClear(L, o, 0.5, 0.2, head.p, threats, threats.length, dt);
        expect(L.at.distanceTo(a.at), `semilla ${seed}, fotograma ${i}`).toBeLessThan(1e-9);
        expect(Math.abs(L.q.dot(a.q)), `semilla ${seed}, fotograma ${i}`).toBeGreaterThan(1 - 1e-9);
        expect(vis).toBeCloseTo(a.vis, 9);
        expect(C.fade).toBeCloseTo(a.fade, 9);
        // derecho: lo de la derecha del aviso, siempre en horizontal (de pie) o el aviso, de cara a los ojos (tumbado)
        const right = new V3(1, 0, 0).applyQuaternion(V.hudQ(head, floor));
        if (!V.lie.on) expect(Math.abs(right.y)).toBeLessThan(1e-9);
        else lying++;
        if (L.go) moved++;
        frames++;
      }
    }
    expect(frames).toBe(72000);
    expect(lying).toBeGreaterThan(5000);
    expect(moved).toBeGreaterThan(50);
  }, 60000);
});
