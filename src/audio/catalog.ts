/**
 * Los sonidos del juego, por su nombre de archivo: los de RepArena (la lista, con cuándo suena cada uno, en
 * sounds/LEEME.md). Cada uno suena con tu archivo de sounds/ (<nombre>.mp3, .ogg o .wav) si lo has puesto y, si no, con
 * el de serie de sounds/de-serie/ (los que RepArena fabricaba al vuelo, grabados una vez con tests/sonidos.mjs). Qué
 * archivo es cada uno lo decide Vite al construir la página, leyendo las dos carpetas: basta con subir uno a sounds/.
 *
 * Sin IWSDK (se prueba en el ordenador): el catálogo de recursos (src/assets.ts) los registra para que los cargue IWSDK.
 */

/** Cómo suena desde un sitio: a toda fuerza hasta `ref` metros y, de ahí, cada vez más flojo (más deprisa cuanto más
 * `roll`). `loop`: se repite en bucle; `amb`: es del ambiente (va con el volumen del sonido ambiente). */
export interface SoundSpec {
  ref: number;
  roll: number;
  loop?: boolean;
  amb?: boolean;
}
const S = (ref = 1.5, roll = 1): SoundSpec => ({ ref, roll });
const LOOP: SoundSpec = { ref: 1, roll: 1.2, loop: true };
const AMB: SoundSpec = { ref: 1.5, roll: 1, loop: true, amb: true };

/** La voz de cada uno (RepArena, VOICE_FILES): su rugido, su siseo y su ataque al lanzarse. */
export const VOICE: Record<'roar' | 'hiss' | 'whoosh', Record<string, string>> = {
  roar: { robot: 'rugido-robot', imp: 'rugido-diablillo', puglin: 'rugido-puglin', zombie: 'rugido-zombi', raptor: 'rugido-velociraptor', zgreen: 'rugido-zombi-verde', zchubby: 'rugido-zombi-gordo', demon: 'voz-demonio', greendemon: 'voz-demonio-verde', cyclops: 'voz-ciclope', yeti: 'voz-yeti', skull: 'voz-calavera', alien: 'voz-alien', alientall: 'voz-alien-alto', skeleton: 'voz-esqueleto', captain: 'voz-capitan', sharky: 'voz-tiburon', mako: 'voz-tiburon-gris', bee: 'voz-abeja', bat: 'voz-murcielago', cthulhu: 'voz-cthulhu', dragon: 'voz-dragon' },
  hiss: { spider: 'siseo-arana', wasp: 'siseo-avispa', crab: 'voz-cangrejo', mushroom: 'voz-seta', skull: 'voz-calavera' },
  whoosh: { flyer: 'ataque-volador', spider: 'ataque-arana', arc: 'arco-pasa', throw: 'lanzamiento' },
};
/** El tono al que están grabados los de serie: el de cada uno en RepArena (BEAST_PITCH; los que no están, 1,4; los
 * robots, 1) y el de los siseos. */
export const VOICE_PITCH: Record<string, number> = { skeleton: 1.3, captain: 0.8, sharky: 1.0, mako: 1.1, puglin: 1.9, zombie: 0.75, zgreen: 0.85, zchubby: 0.65, raptor: 1.6, yeti: 1.0, cyclops: 1.15, demon: 1.5, greendemon: 1.5, skull: 1.7, alien: 1.8, alientall: 1.6, bee: 2.4, bat: 2.2, cthulhu: 1.2, dragon: 0.9, robot: 1, imp: 1.4 };
export const HISS_PITCH: Record<string, number> = { spider: 1, wasp: 0.9, crab: 1, mushroom: 1, skull: 1 };

/** Cada sonido, con la distancia a la que se oía en RepArena (la de su sintetizado: sout y Loop de src/10_audio.js). */
export const SOUNDS: Record<string, SoundSpec> = {
  // disparos y golpes
  rayo: S(2), 'rayo-cargado': S(2), impacto: S(2), chispazo: S(), explosion: S(3), 'impacto-metal': S(2), 'golpe-recibido': S(),
  // enemigos
  'paso-robot': S(2), servo: S(), compuerta: S(3), 'patas-arana': S(0.5), aplastar: S(0.6), 'lobo-aullido': S(16), 'lobo-grunido': S(3),
  'lobo-ataque': S(2), 'bandido-lanza': S(2.5), 'bandido-dolor': S(2.5), 'bandido-muere': S(2.5), orbe: S(1), 'onda-expansiva': S(3),
  ameba: S(0.8), pompa: S(0.8), tentaculos: S(1.2), 'caida-foso': S(1.2), chapoteo: S(1.2), 'remolino-engulle': S(), 'remolino-cierra': S(),
  // avisos del juego (suenan «en tu cabeza»)
  carga: S(), 'carga-nivel': S(), perfecta: S(), 'a-medias': S(), fallo: S(), combo: S(), pitido: S(), oleada: S(), victoria: S(),
  derrota: S(), clic: S(), tic: S(),
  // ambiente
  trueno: S(), 'metal-lejano': S(6), buho: S(6), gaviota: S(5), pajaro: S(4), crujido: S(3),
  // en bucle
  'ambiente-arena': AMB, 'ambiente-bosque': AMB, 'ambiente-naturaleza': AMB, 'ambiente-isla': AMB,
  'zumbido-dron': LOOP, 'zumbido-avispa': LOOP, 'espada-laser-zumbido': LOOP, remolino: LOOP, 'arco-zumbido': LOOP,
};
// las voces: los rugidos se oyen a 3 m; los siseos, a 0,6; el ataque al lanzarse, a 0,8 (la calavera, con su rugido)
for (const n of Object.values(VOICE.roar)) SOUNDS[n] = S(3);
for (const n of Object.values(VOICE.hiss)) SOUNDS[n] ??= S(0.6);
for (const n of Object.values(VOICE.whoosh)) SOUNDS[n] = S(0.8);
// las espadas: la metálica y, con -laser, la láser
for (const [n, ref] of [['espada-aire', 0.8], ['espada-choque', 0.8], ['espada-golpe', 1], ['espada-bloqueo', 1], ['espada-corte', 0.8]] as const) SOUNDS[n] = SOUNDS[n + '-laser'] = S(ref);

// ---------------------------------------------------------------- qué archivo es cada uno

type Files = Record<string, string>;
const OWN_FILES = import.meta.glob<string>('../../sounds/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' });
const DEF_FILES = import.meta.glob<string>('../../sounds/de-serie/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' });
const EXT = ['mp3', 'ogg', 'wav'];

/** Los archivos, por su nombre (sin la carpeta ni la terminación). Con dos del mismo nombre, el .mp3; si no, el .ogg
 * (como en RepArena). */
export function byName(files: Files): Files {
  const out: Files = {}, rank: Record<string, number> = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /([^/]+)\.(mp3|ogg|wav)$/i.exec(path);
    if (!m) continue;
    const r = EXT.indexOf(m[2].toLowerCase());
    if (!(m[1] in rank) || r < rank[m[1]]) {
      out[m[1]] = url;
      rank[m[1]] = r;
    }
  }
  return out;
}
/** Tus archivos (sounds/) y los de serie (sounds/de-serie/). */
export const OWN = byName(OWN_FILES);
export const DEFAULT = byName(DEF_FILES);
/** El archivo de cada sonido: el tuyo si lo has puesto; si no, el de serie. */
export const soundUrl = (n: string): string | null => OWN[n] ?? DEFAULT[n] ?? null;
/** ¿Suena con tu archivo? (Lo que cambiaba el sintetizado de RepArena, como el tono de cada nivel, vale para el de serie;
 * con tu archivo, suena como sonaba en RepArena.) */
export const isOwn = (n: string): boolean => n in OWN;
/** El nombre de cada sonido en el catálogo de recursos de IWSDK. */
export const soundId = (n: string): string => 'snd-' + n;
