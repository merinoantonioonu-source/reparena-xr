/**
 * El sonido, con el de IWSDK de serie (AudioSource y su AudioSystem): cada sonido es un archivo (el tuyo de sounds/ o el
 * de serie, ver catalog.ts) que IWSDK carga, reparte en voces y coloca en 3D, con el oído en tu cabeza; al salir de la VR
 * lo pausa y, al volver, lo sigue. De RepArena (src/10_audio.js) se trae lo que IWSDK no tiene:
 *  - cada efecto con su volumen y su tono, con los nombres de RepArena (SND);
 *  - el volumen de los efectos y el del ambiente (a 0 mientras suena Spotify), y los sonidos que has apagado en la página;
 *  - el tono, un poco distinto cada vez, para que no suenen siempre iguales;
 *  - el compresor de la mezcla: así se oía todo en RepArena (lo flojo, algo más fuerte; lo fuerte, sin saturar);
 *  - el ambiente de la arena, con golpes metálicos a lo lejos.
 * Apaños a IWSDK (MIGRACION.md › Fallos de IWSDK): su sonido suelto (AudioUtils.createOneShot) no se coloca en su sitio ni
 * se borra al acabar, así que cada sonido tiene unas pocas fuentes fijas que se colocan al tocarlas; AudioSource no cambia
 * el tono, así que se les pone a sus voces (AudioPool); y fuera de la VR no abre el sonido: se abre con el primer toque.
 */
import { AudioSource, AudioUtils, createSystem, DistanceModel, PlaybackMode, Vector3 } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { store } from '../core/settings.js';
import { num } from '../core/values.js';
import { HISS_PITCH, isOwn, SOUNDS, soundId, VOICE, VOICE_PITCH } from './catalog.js';
import type { SoundSpec } from './catalog.js';

// lo que se usa de las voces de IWSDK (Audio y PositionalAudio de three) y de su oído (AudioListener)
interface Pool {
  getAllInstances(): { playbackRate: number }[];
}
interface Ear {
  type: string;
  context: AudioContext;
  getFilter(): AudioNode | null;
  setFilter(n: AudioNode): unknown;
}
interface Sources {
  flat: Entity | null;
  ring: Entity[];
  next: number;
}

/** El estado del sonido (lo leen las pruebas: window.__rx.snapshot().sound). */
export const SOUND = {
  /** ¿Suena? Los navegadores no dejan sonar hasta el primer toque (o hasta entrar en la VR). */
  running: false,
  /** ¿Suena Spotify? Mientras, el ambiente se calla. */
  music: false,
  /** El último que se ha pedido y cuántas veces ha sonado cada uno. */
  last: '',
  played: {} as Record<string, number>,
};

const RING = 4; // fuentes de cada sonido que suena desde un sitio (la quinta vez, la más vieja vuelve a empezar)
const VOICES = 4; // voces que se solapan de cada sonido «en tu cabeza»
const OFF = new Set<string>(); // los que has apagado en la página (RepArena: reparena3-sndoff)
// los de Combate, preparados al arrancar (cargados y con sus voces): así el primero suena a tiempo y con su tono
const PRE_FLAT = ['clic', 'carga', 'carga-nivel', 'perfecta', 'a-medias', 'fallo', 'oleada', 'victoria', 'derrota', 'golpe-recibido'];
const PRE_POS = ['rayo', 'rayo-cargado', 'carga-nivel', 'impacto', 'compuerta', 'rugido-zombi-verde', 'rugido-zombi-gordo', 'aplastar', 'metal-lejano'];
let sys: SoundSystem | null = null;

export class SoundSystem extends createSystem({}, {}) {
  ctx: AudioContext | null = null;
  private src = new Map<string, Sources>();
  private amb: Entity | null = null;
  private ambName = 'ambiente-arena';
  private ambOn = false;
  private ambVol = 0;
  private clankT = 5 + Math.random() * 8;
  private at = new Vector3();

  init(): void {
    sys = this;
    const off = store<string[]>('reparena3-sndoff');
    if (Array.isArray(off)) for (const n of off) OFF.add(n);
    // el oído de IWSDK (en tu cabeza) y, entre él y los altavoces, el compresor de RepArena
    const ear = this.player.head.children.find((o) => o.type === 'AudioListener') as unknown as Ear | undefined;
    if (ear) {
      this.ctx = ear.context;
      if (!ear.getFilter()) ear.setFilter(compressor(ear.context));
    }
    // fuera de la VR, el sonido se abre con el primer toque o tecla (los navegadores no dejan sonar antes)
    for (const ev of ['pointerdown', 'keydown', 'touchend']) {
      window.addEventListener(ev, unlockAudio, { passive: true });
      this.cleanupFuncs.push(() => window.removeEventListener(ev, unlockAudio));
    }
    for (const n of PRE_FLAT) this.flat(n);
    for (const n of PRE_POS) this.ring(n);
    this.amb = this.flat(this.ambName);
  }

  private slot(n: string): Sources {
    let s = this.src.get(n);
    if (!s) this.src.set(n, (s = { flat: null, ring: [], next: 0 }));
    return s;
  }

  private source(e: Entity, n: string, spec: SoundSpec, positional: boolean): Entity {
    const one = positional || !!spec.loop;
    e.addComponent(AudioSource, {
      src: soundId(n),
      volume: 0,
      loop: !!spec.loop,
      positional,
      refDistance: spec.ref,
      rolloffFactor: spec.roll,
      maxDistance: 90,
      distanceModel: DistanceModel.Inverse,
      playbackMode: one ? PlaybackMode.Restart : PlaybackMode.Overlap,
      maxInstances: one ? 1 : VOICES,
    });
    return e;
  }

  // los que suenan «en tu cabeza»: una fuente con varias voces que se solapan
  private flat(n: string): Entity {
    const s = this.slot(n);
    return (s.flat ??= this.source(this.world.createEntity(), n, SOUNDS[n], false));
  }

  // los que suenan desde un sitio: unas pocas fuentes que se colocan al tocarlas, por turnos
  private ring(n: string): Sources {
    const s = this.slot(n);
    while (s.ring.length < RING) s.ring.push(this.source(this.world.createTransformEntity(undefined, { persistent: true }), n, SOUNDS[n], true));
    return s;
  }

  sound(n: string, at: Vector3 | null, gain: number, rate: number): void {
    const spec = SOUNDS[n];
    if (!spec || OFF.has(n) || !this.ctx || this.ctx.state === 'closed') return;
    const vol = num(spec.amb ? 'ambient' : 'volume') / 100;
    if (vol <= 0) return;
    let e: Entity;
    if (at) {
      const s = this.ring(n);
      e = s.ring[s.next];
      s.next = (s.next + 1) % RING;
      e.object3D?.position.copy(at);
    } else e = this.flat(n);
    e.setValue(AudioSource, 'volume', gain * vol);
    tune(e, rate * (0.94 + Math.random() * 0.12));
    AudioUtils.play(e);
    SOUND.played[n] = (SOUND.played[n] ?? 0) + 1;
    if (import.meta.env.DEV) console.info(`rxdbg sonido ${n}${at ? ' desde ' + at.toArray().map((v) => v.toFixed(1)).join(',') : ''} (${this.ctx.state})`); // (para probar en el emulador)
  }

  // los bucles libres de cada sonido (al acabar uno, su fuente se guarda para el siguiente: sin crear ni borrar entidades)
  private loops = new Map<string, Entity[]>();

  /** Un sonido en bucle que sigue a algo que se mueve (el zumbido de un volador…): null si no suena. */
  loop(n: string, gain: number, rate: number): SoundLoop | null {
    const spec = SOUNDS[n];
    if (!spec || OFF.has(n) || !this.ctx || this.ctx.state === 'closed') return null;
    const free = this.loops.get(n) ?? [];
    this.loops.set(n, free);
    const e = free.pop() ?? this.source(this.world.createTransformEntity(undefined, { persistent: true }), n, { ...spec, loop: true }, true);
    e.setValue(AudioSource, 'volume', gain * (num('volume') / 100));
    tune(e, rate);
    AudioUtils.play(e);
    SOUND.played[n] = (SOUND.played[n] ?? 0) + 1;
    if (import.meta.env.DEV) console.info(`rxdbg bucle ${n}`); // (para probar en el emulador)
    return new SoundLoop(e, () => {
      AudioUtils.stop(e);
      free.push(e);
    });
  }

  /** Cuántas fuentes tienen ya su archivo cargado, de cuántas (para las pruebas). */
  loaded(): [number, number] {
    let n = 0, all = 0;
    for (const s of this.src.values()) {
      for (const e of s.flat ? [s.flat, ...s.ring] : s.ring) {
        all++;
        if (e.getValue(AudioSource, '_loaded')) n++;
      }
    }
    return [n, all];
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.1);
    SOUND.running = this.ctx?.state === 'running';
    if (!SOUND.running || !this.amb) return;
    // el ambiente: suena desde que se abre el sonido; su volumen cambia despacio (a 0 con Spotify o si lo has apagado)
    if (!this.ambOn) {
      this.ambOn = true;
      AudioUtils.play(this.amb);
    }
    const want = SOUND.music || OFF.has(this.ambName) ? 0 : num('ambient') / 100;
    if (Math.abs(want - this.ambVol) > 1e-3) {
      this.ambVol += (want - this.ambVol) * Math.min(1, dt / 0.4);
      this.amb.setValue(AudioSource, 'volume', this.ambVol);
    }
    // golpes metálicos lejanos, cada 5 a 13 s, desde un sitio al azar a 25 m (RepArena, en la arena: AMBX.clank)
    if ((this.clankT -= dt) <= 0) {
      this.clankT = 5 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2;
      this.sound('metal-lejano', this.at.set(Math.cos(a) * 25, 2 + Math.random() * 6, Math.sin(a) * 25), 1, 1);
    }
  }
}

// el compresor de la mezcla de RepArena (audioInit)
function compressor(C: AudioContext): DynamicsCompressorNode {
  const c = C.createDynamicsCompressor();
  c.threshold.value = -14;
  c.knee.value = 10;
  c.ratio.value = 6;
  c.attack.value = 0.002;
  c.release.value = 0.25;
  return c;
}

// el tono de la próxima vez (AudioSource no lo tiene: se pone a sus voces de three). Un sonido que no estaba preparado,
// la primera vez, aún sin voces, suena con su tono de serie
function tune(e: Entity, r: number): void {
  const pool = e.getValue(AudioSource, '_pool') as Pool | undefined;
  if (pool) for (const v of pool.getAllInstances()) v.playbackRate = r;
}

/** Abre el sonido (desde un toque o una tecla: los navegadores no dejan sonar antes; al entrar en la VR, lo abre IWSDK). */
export function unlockAudio(): void {
  const c = sys?.ctx;
  if (c && c.state === 'suspended') void c.resume();
}

/** Un sonido en bucle: se coloca donde está lo que suena (set) y se para al acabar (stop). */
export class SoundLoop {
  private done = false;
  constructor(
    private e: Entity,
    private end: () => void,
  ) {}
  set(p: Vector3): void {
    this.e.object3D?.position.copy(p);
  }
  stop(): void {
    if (this.done) return;
    this.done = true;
    this.end();
  }
}

/** Empieza un sonido en bucle (n) con su volumen y su tono; null si no suena (apagado, o sin sonido aún). */
export function loopSound(n: string, gain = 1, rate = 1): SoundLoop | null {
  return sys?.loop(n, gain, rate) ?? null;
}

/** Suena n desde at (en 3D) o, sin sitio, «en tu cabeza»; gain y rate: el volumen y el tono de ese efecto. */
export function playSound(n: string, at: Vector3 | null = null, gain = 1, rate = 1): void {
  SOUND.last = n;
  sys?.sound(n, at, gain, rate);
}

/** Para las pruebas: si suena, cuántas veces ha sonado cada uno y cuántas fuentes tienen ya su archivo cargado. */
export function soundState(): { running: boolean; played: Record<string, number>; loaded: [number, number] } {
  return { running: SOUND.running, played: SOUND.played, loaded: sys ? sys.loaded() : [0, 0] };
}

/** Spotify suena o se para (PR 22): mientras suena, el ambiente se calla del todo. */
export function setMusicPlaying(on: boolean): void {
  SOUND.music = on;
}

// lo que cambiaba el sintetizado de RepArena (el tono de cada nivel, el de cada monstruo…) vale para el de serie; con tu
// archivo, suena como sonaba en RepArena con él
const syn = (n: string, k: number): number => (isOwn(n) ? 1 : k);
const ambMute = (): boolean => SOUND.music || num('ambient') <= 0;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
// con la espada láser, su versión -laser (si solo has puesto la normal, suena con las dos, como en RepArena)
const blade = (n: string, laser: boolean): string => (laser && (isOwn(n + '-laser') || !isOwn(n)) ? n + '-laser' : n);

/** Los efectos de RepArena con sus nombres (src/10_audio.js: SND), cada uno con su volumen y su tono. */
export const SND = {
  click: (): void => playSound('clic'),
  tick: (): void => playSound('tic'),
  /** La bajada ya cuenta: el disparo queda cargado. */
  charge: (): void => playSound('carga'),
  perfect: (): void => playSound('perfecta'),
  /** Cada nivel de la carga (2, 3, 4): el de serie, más agudo en cada uno. */
  power: (pow: number, at: Vector3 | null = null): void => playSound('carga-nivel', at, 1, syn('carga-nivel', Math.pow(1.26, pow - 2))),
  partial: (): void => playSound('a-medias'),
  miss: (): void => playSound('fallo'),
  combo: (): void => playSound('combo'),
  /** La cuenta atrás: el de serie, más agudo cuanto más p. */
  beep: (p = 1): void => playSound('pitido', null, 1, syn('pitido', p)),
  horn: (): void => playSound('oleada'),
  victory: (): void => playSound('victoria'),
  defeat: (): void => playSound('derrota'),
  hurt: (): void => playSound('golpe-recibido'),
  explosion: (at: Vector3, big = false): void => playSound('explosion', at, big ? syn('explosion', 1.3) : 1),
  metalHit: (at: Vector3, heavy = false): void => playSound('impacto-metal', at, heavy ? syn('impacto-metal', 0.9 / 0.7) : 1),
  door: (at: Vector3): void => playSound('compuerta', at),
  step: (at: Vector3, heavy = false): void => playSound('paso-robot', at, heavy ? syn('paso-robot', 1 / 0.65) : 1, heavy ? syn('paso-robot', 70 / 95) : 1),
  servo: (at: Vector3): void => playSound('servo', at),
  /** La voz de cada uno (who) con su tono (s: el de serie, más agudo cuanto más). */
  roar: (at: Vector3, s = 1, who = 'robot'): void => {
    const n = VOICE.roar[who];
    if (n) playSound(n, at, 1, syn(n, s / (VOICE_PITCH[who] ?? 1.4)));
  },
  orb: (at: Vector3): void => playSound('orbe', at),
  /** El siseo de cada uno (who); el de serie, más grave cuanto más s. */
  hiss: (at: Vector3, s = 1, who = 'spider'): void => {
    const n = VOICE.hiss[who];
    if (n) playSound(n, at, 1, syn(n, (HISS_PITCH[who] ?? 1) / s));
  },
  skitter: (at: Vector3, s = 1): void => playSound('patas-arana', at, 1, syn('patas-arana', 1 / Math.sqrt(s))),
  squish: (at: Vector3): void => playSound('aplastar', at),
  zap: (at: Vector3): void => playSound('chispazo', at),
  waterPop: (at: Vector3, big = false): void => playSound('ameba', at, big ? syn('ameba', 1 / 0.85) : 1),
  splash: (at: Vector3): void => playSound('chapoteo', at),
  /** El ataque al lanzarse (who: flyer, spider, arc, throw). */
  whoosh: (at: Vector3, who = 'flyer'): void => {
    const n = VOICE.whoosh[who];
    if (n) playSound(n, at);
  },
  /** Un trueno: es del ambiente (con Spotify, o sin ambiente, se calla), salvo el que marca algo (force). */
  thunder: (_dist = 1, force = false): void => {
    if (force || !ambMute()) playSound('trueno');
  },
  /** Las espadas (laser: la láser; v: lo deprisa que va la hoja, en m/s). */
  swordSwish: (at: Vector3, laser: boolean, v: number): void => {
    const n = blade('espada-aire', laser);
    playSound(n, at, syn(n, clamp(0.35 + v * 0.12, 0.35, 1) / 0.71));
  },
  swordClang: (at: Vector3, laser: boolean, v = 1): void => {
    const n = blade('espada-choque', laser);
    playSound(n, at, syn(n, clamp(0.3 + v * 0.15, 0.3, 1) / 0.45));
  },
  swordHit: (at: Vector3, laser: boolean): void => playSound(blade('espada-golpe', laser), at),
  swordBlock: (at: Vector3, laser: boolean): void => playSound(blade('espada-bloqueo', laser), at),
  swordSlice: (at: Vector3, laser: boolean): void => playSound(blade('espada-corte', laser), at),
  engulf: (at: Vector3): void => playSound('remolino-engulle', at),
  vortexClose: (at: Vector3): void => playSound('remolino-cierra', at),
  // el ambiente de cada entorno (con Spotify, o sin ambiente, los pájaros se callan)
  owl: (at: Vector3): void => {
    if (!ambMute()) playSound('buho', at);
  },
  bird: (at: Vector3): void => {
    if (!ambMute()) playSound('pajaro', at);
  },
  gull: (at: Vector3): void => {
    if (!ambMute()) playSound('gaviota', at);
  },
  creak: (at: Vector3): void => playSound('crujido', at),
  clankFar: (at: Vector3): void => playSound('metal-lejano', at),
  wolfHowl: (at: Vector3): void => playSound('lobo-aullido', at),
  /** El gruñido del lobo, más fuerte cuanto más cerca (k: de 0, lejos, a 1, encima). */
  wolfGrowl: (at: Vector3, k = 0.5): void => playSound('lobo-grunido', at, syn('lobo-grunido', (0.5 + 0.7 * k) / 0.85)),
  wolfBite: (at: Vector3): void => playSound('lobo-ataque', at),
  banditThrow: (at: Vector3): void => playSound('bandido-lanza', at),
  banditHurt: (at: Vector3): void => playSound('bandido-dolor', at),
  banditDeath: (at: Vector3): void => playSound('bandido-muere', at),
  /** El rayo (L: su nivel, de 0 a 4): desde el 2, el cargado; más fuerte y más grave cuanto más carga. */
  bolt: (at: Vector3, L = 0): void => playSound(L >= 2 ? 'rayo-cargado' : 'rayo', at, 0.8 + L * 0.12, 1.08 - L * 0.06),
  /** Al llegar al blanco. */
  boltHit: (at: Vector3, L = 0): void => playSound('impacto', at, 0.7 + L * 0.1),
  tentacle: (at: Vector3): void => playSound('tentaculos', at, 1, 0.85 + Math.random() * 0.25),
  /** Caer al foso: la zambullida y, encima, los tentáculos que se excitan. */
  horror: (at: Vector3): void => {
    SND.splash(at);
    playSound('caida-foso', at, 1.1);
  },
  pop: (at: Vector3, big = false): void => playSound('pompa', at, big ? 1 : 0.8, big ? 0.8 : 1),
  /** La onda expansiva del inchworm (su golpe grave). */
  shock: (at: Vector3): void => playSound('onda-expansiva', at),
};
