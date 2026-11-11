// El reloj de pulsos (de RepArena: beatP, danceP, BEAT, arxBeatP, beatNow y beatStep de src/70_game.js; el tempo a mano,
// tapTempo de src/74_touch.js; y el baile de las luciérnagas, MOTEB y motesBeat de src/56_motes.js). Lógica pura: no
// importa IWSDK ni lee ajustes; quien lo usa le dice el periodo del pulso y la hora real (en segundos).

/** El periodo del pulso de un ritmo (s), o 0 sin ritmo. */
export const pulseOf = (bpm: number): number => (bpm > 0 ? 60 / bpm : 0);
/** El pulso de Combate (beatP): solo en Combate y con un ritmo puesto. */
export const beatP = (combat: boolean, bpm: number): number => (combat && bpm > 0 ? 60 / bpm : 0);
/** El de Arcos con «Arcos al compás» (arxBeatP): el mismo pulso decide cuándo llega cada arco. */
export const arxBeatP = (arcs: boolean, arcBeat: boolean, bpm: number): number => (arcs && arcBeat && bpm > 0 ? 60 / bpm : 0);
/** El pulso para bailar (danceP): el del ritmo marcado o, si no, el de la canción de Spotify que suena (si se sabe su
 * compás, `songBpm`; 0 si no). */
export function danceP(combat: boolean, bpm: number, playing: boolean, songBpm: number): number {
  const b = beatP(combat, bpm);
  if (b || !combat || !playing) return b;
  return songBpm ? 60 / songBpm : 0;
}

/** El pulso del juego (BEAT): va con el reloj del juego (`step`), enganchado al reloj real al empezar y al volver de la
 * pausa (`off`), porque el compás marcado (`beat0`) lo da el reloj real. `hit`: acaba de sonar un pulso (una vez por
 * pulso, nunca en el primer fotograma). */
export class Beat {
  last = -1;
  hit = false;
  t = 0;
  off: number | null = null;
  /** La referencia del pulso, en la hora real (s): cuándo sonó uno (TCH.beat0 de RepArena). */
  beat0 = 0;
  /** Los toques de «Al compás» (hora real, s). */
  taps: number[] = [];

  constructor(
    /** El periodo del pulso ahora (s), o 0 sin ritmo (en RepArena, beatAny: el de Combate o el de Arcos). */
    readonly period: () => number,
    /** La hora real en segundos (perfNow). */
    readonly perfNow: () => number,
  ) {}

  /** Pulsos desde la referencia, con decimales (beatNow). */
  now(): number {
    const P = this.period();
    return P ? (this.t + (this.off || 0) - this.beat0) / P : 0;
  }

  /** Un fotograma del juego (beatStep). */
  step(dt: number): void {
    this.t += dt;
    if (this.off === null) this.off = this.perfNow() - this.t;
    const P = this.period();
    if (!P) {
      this.hit = false;
      return;
    }
    const k = Math.floor(this.now());
    this.hit = k !== this.last && this.last >= 0;
    this.last = k;
  }

  /** Reenganche al reloj real (al volver de la pausa: BEAT.off = null). */
  relock(): void {
    this.off = null;
  }

  /** Al empezar la ronda: reenganchado y sin pulso anterior (el primero no cuenta como golpe). */
  reset(): void {
    this.off = null;
    this.last = -1;
  }

  /** Un pulso nuevo en la hora real `t` («Encajar el pulso», un ritmo nuevo): la referencia y el reenganche. */
  sync(t: number): void {
    this.beat0 = t;
    this.off = null;
  }

  /** «Al compás» (tapTempo): un toque en la hora real `now`. Con cuatro en 3,5 s, la mediana de lo que hay entre ellos da
   * el ritmo (redondeado), si está entre 0,25 y 1,6 s; entonces el pulso se encaja en este toque y devuelve el BPM (quien
   * llama lo guarda en «bpm»). Si no, 0. */
  tap(now: number): number {
    this.taps = this.taps.filter((x) => now - x < 3.5);
    this.taps.push(now);
    if (this.taps.length >= 4) {
      const d: number[] = [];
      for (let i = 1; i < this.taps.length; i++) d.push(this.taps[i] - this.taps[i - 1]);
      d.sort((a, b) => a - b);
      const med = d[d.length >> 1];
      if (med > 0.25 && med < 1.6) {
        this.sync(now);
        return Math.round(60 / med);
      }
    }
    return 0;
  }
}

/** El ritmo al que bailan las luciérnagas (moteBpm): el puesto; el de Spotify (`songOn`), solo si suena. */
export const moteBpm = (bpm: number, playing: boolean, songOn: boolean): number => (bpm > 0 && (playing || !songOn) ? bpm : 0);

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** El baile de las luciérnagas (MOTEB): un reloj en pulsos que va enganchándose a la música poco a poco (sin saltos al
 * cambiar de canción o de ritmo). `ph`, en pulsos; `sw`, el del vaivén, en extremos (con canciones rápidas, a medio
 * tiempo); `fly`, el reloj del vuelo, que corre más deprisa cuanto más rápida es la canción (de 0,8 a 1,4 veces; 110 BPM,
 * lo normal); `k`, cuánto bailan (entra y sale en unos 3 s). */
export class MoteBeat {
  fly = 0;
  ph = 0;
  sw = 0;
  rate = 0;
  k = 0;

  /** Un fotograma (motesBeat): `bpm`, el de moteBpm; `now`, la hora real (s); `beat0`, la referencia del pulso. */
  step(dt: number, bpm: number, now: number, beat0: number): void {
    const want = bpm / 60;
    this.k += ((bpm ? 1 : 0) - this.k) * Math.min(1, dt * 0.7);
    if (bpm) this.rate = this.rate > 0 ? this.rate + (want - this.rate) * Math.min(1, dt * 1.5) : want;
    this.ph = this.lock(this.ph, 1, dt, bpm, want, now, beat0);
    this.sw = this.lock(this.sw, (this.rate || 2) * 60 > 135 ? 2 : 1, dt, bpm, want, now, beat0);
    // (todo lo que baila se repite cada cuatro: así el número no crece)
    this.ph = ((this.ph % 4) + 4) % 4;
    this.sw = ((this.sw % 4) + 4) % 4;
    this.fly += dt * (1 + this.k * (clamp(((this.rate || 2) * 60) / 110, 0.8, 1.4) - 1));
  }

  // lo que va adelantado o atrasado, dentro de medio pulso, se corrige poco a poco (en RepArena, la función `lock`; aquí,
  // un método, para no crear una función en cada fotograma)
  private lock(c: number, per: number, dt: number, bpm: number, want: number, now: number, beat0: number): number {
    c += (dt * (this.rate || 2)) / per;
    if (!bpm) return c;
    let err = ((now - beat0) * want) / per - c;
    err -= Math.round(err);
    return c + err * Math.min(1, dt * 1.2);
  }
}
