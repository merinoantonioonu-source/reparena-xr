/**
 * Sonidos sintetizados con WebAudio (sin archivos): el rayo, la carga, los niveles ×2-×4, los golpes, los gruñidos de
 * los zombis (en 3D: se oyen de donde vienen) y el aviso de oleada. El contexto se abre con el primer toque (EMPEZAR).
 */
import type { Vector3 } from '@iwsdk/core';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Abre el audio (hay que llamarlo desde un toque del jugador: los navegadores no dejan sonar antes). */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Coloca el oído donde está la cabeza (para los sonidos en 3D). */
export function setListener(pos: Vector3, fwd: Vector3): void {
  if (!ctx) return;
  const l = ctx.listener;
  if (l.positionX) {
    const t = ctx.currentTime;
    l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
    l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
    l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
  }
}

// la salida: directa o en 3D (desde un punto)
function out(at?: Vector3): AudioNode | null {
  if (!ctx || !master) return null;
  if (!at) return master;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1.5;
  p.rolloffFactor = 0.9;
  p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z;
  p.connect(master);
  return p;
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at?: Vector3, delay = 0): void {
  const dst = out(at);
  if (!ctx || !dst) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dst);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, freq: number, q: number, at?: Vector3, type: BiquadFilterType = 'lowpass'): void {
  const dst = out(at);
  if (!ctx || !dst || !noiseBuf) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dst);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  /** Al llegar abajo: la bola se enciende. */
  charge(): void { tone('sine', 280, 760, 0.18, 0.25); },
  /** Cada nivel de carga (2, 3, 4): más agudo; el ×4, con eco. */
  power(level: number): void {
    const f = 520 * Math.pow(1.26, level - 2);
    tone('triangle', f, f * 1.02, 0.28, 0.3);
    tone('sine', f * 1.5, f * 1.5, 0.32, 0.18, undefined, 0.06);
    if (level >= 4) { tone('sine', f * 2, f * 2, 0.5, 0.16, undefined, 0.14); noise(0.35, 0.12, 5000, 0.7, undefined, 'highpass'); }
  },
  /** El rayo: más grave y largo cuanto más cargado. */
  zap(level: number): void {
    tone('sawtooth', 1500, 160 / level, 0.16 + 0.05 * level, 0.22);
    tone('square', 900, 90, 0.12 + 0.04 * level, 0.08);
    noise(0.12 + 0.05 * level, 0.18, 2600, 0.8);
  },
  /** El rayo da en el zombi. */
  hit(at: Vector3, level: number): void { noise(0.18 + 0.05 * level, 0.5, 700, 0.9, at); tone('sine', 160, 50, 0.22, 0.45, at); },
  /** Gruñido de zombi (en 3D). */
  groan(at: Vector3, pitch = 1): void {
    const dst = out(at);
    if (!ctx || !dst) return;
    const t = ctx.currentTime, dur = 0.7 + Math.random() * 0.4;
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * pitch, t);
    o.frequency.linearRampToValueAtTime(70 * pitch, t + dur);
    lfo.frequency.value = 7 + Math.random() * 4; lg.gain.value = 9 * pitch;
    lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dst);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  /** El zombi te golpea. */
  punch(): void { noise(0.25, 0.7, 380, 1.2); tone('sine', 110, 40, 0.3, 0.6); },
  /** Muere un zombi. */
  down(at: Vector3): void { noise(0.5, 0.35, 260, 0.8, at); tone('sawtooth', 120, 45, 0.6, 0.2, at); },
  /** Empieza una oleada. */
  wave(): void { tone('sawtooth', 220, 220, 0.25, 0.15); tone('sawtooth', 330, 330, 0.45, 0.15, undefined, 0.22); },
  /** Pulsar un botón. */
  click(): void { tone('sine', 880, 660, 0.06, 0.2); },
  /** Se acaba la ronda. */
  over(): void { tone('triangle', 440, 220, 0.5, 0.3); tone('triangle', 330, 165, 0.7, 0.25, undefined, 0.3); },
};
