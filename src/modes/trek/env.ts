/**
 * Lo que la lógica pura de la Travesía necesita del juego (RepArena: los globales `settings`, `dv`, `HL`, `head`,
 * `calibRef`, `state`, `waveIdx`, `rankIdx()`, `performance.now`, `Math.random`, `store`…), dado explícitamente para poder
 * probarla contra el código de RepArena sin IWSDK; y lo que devuelve: sucesos (lo que en RepArena eran llamadas a `say`,
 * `cheer`, `SND`, `fx`, `hapticBoth`, `score +=`, `combo = 0`, `hurtPlayer`, `trophy`, `store`…) que la partida aplica en el
 * mismo orden. La arena es el mundo: x a un lado, y arriba, z hacia ti (el sendero va hacia −z).
 */

/** La altura de la coronilla sobre los ojos (RepArena: HEAD_TOP). */
export const HEAD_TOP = 0.1;
/** Las gemas del cofre: tu colección, en el almacén del navegador (la misma clave que RepArena). */
export const TREK_GEMS = 'reparena3-gems';
export const TAU = Math.PI * 2;

/** Lo que mide una roca del Stylized Nature a escala 1: ancho, alto y dónde empieza por abajo (RepArena: trekRockBox). */
export interface RockBox {
  w: number;
  h: number;
  y0: number;
}

export interface TrekEnv {
  /** Un ajuste numérico (RepArena: settings[k]): trekSpeed, trekCurves (1/0), jumpHeight. */
  s(key: string): number;
  /** Un ajuste con la dificultad creciente (RepArena: dv(k)): squatDepth, lungeDepth. */
  dv(key: string): number;
  /** El ejercicio elegido (settings.exercise). */
  ex: string;
  /** ¿Es la Travesía? (RepArena: trekOn(); sin ella, el sendero va recto y el paso no hace nada). */
  trek: boolean;
  /** El estado de la partida (RepArena: state): 'play', 'paused', 'rest', 'end', 'ready', 'calib', 'lobby'… */
  state: string;
  /** La cabeza en la arena (RepArena: HL; el tronco usa head.p.y, que en la Travesía es lo mismo) y su altura de pie. */
  head: { x: number; y: number; z: number };
  calibRef: number;
  /** La oleada (el tramo, desde 0) y el rango (RepArena: waveIdx, rankIdx()). */
  wave: number;
  rank: number;
  /** El reloj en segundos (RepArena: performance.now() / 1000). */
  now: number;
  /** El azar (RepArena: Math.random). */
  rnd(): number;
  /** Lo que mide cada roca (RepArena: trekRockBox, del modelo). */
  rockBox(n: string): RockBox;
  /** Cuántas piezas (materiales) tiene el modelo de una roca: RepArena gira cada una con su azar (de serie, 1). */
  rockParts?(n: string): number;
  /** ¿Están ya cargados los bandidos (TREK_BAND.scene || bare) y el cofre de la isla (ISL.ready)? Si no, sale otro reto. */
  bandReady: boolean;
  chestReady: boolean;
  /** Leer el almacén (RepArena: store(k)); lo que se escribe va en un suceso 'store'. */
  store(key: string): unknown;
}

/** Lo que hacen los bandidos y los lobos (otro módulo): la Travesía los llama donde RepArena llamaba a sus funciones. */
export interface TrekHooks {
  /** La pelea con los bandidos, en su parada (RepArena: trekBandFight). */
  bandFight?(o: TrekObs, dt: number, t: number): void;
  /** Sus animaciones, en cada fotograma (RepArena: trekBandAnim). */
  bandAnim?(o: TrekObs, dt: number, t: number): void;
  /** ¿Te persiguen los lobos? (RepArena: !!TREK.chase). */
  chasing?(): boolean;
  /** Los lobos se van (RepArena: trekChaseEnd(msg, col); sin mensaje, al empezar la ronda). */
  chaseEnd?(msg?: string, col?: string): void;
  /** Su paso, en cada fotograma (RepArena: trekChaseStep). */
  chaseStep?(dt: number, t: number): void;
}

/** Un punto: en el reto `o` (sus coordenadas, que la partida pasa al mundo como hacía o.mesh.localToWorld) o, con
 * `o` nulo, en la arena. */
export interface TrekPos {
  o: TrekObs | null;
  x: number;
  y: number;
  z: number;
}

/** Una pieza del paisaje del reto (RepArena: [modelo, trekM(x, y, z, ry, sx, sy, sz)]): para juntarlas en una. */
export interface TrekPiece {
  n: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Una roca suelta (RepArena: trekRock): modelo, sitio a un lado, tamaño y el giro de cada pieza. */
export interface TrekRock {
  n: string;
  x: number;
  s: number;
  ry: number[];
}

/** Una lasca de la roca que salta (RepArena: TREK.chunks): su roca, dónde sale (en el reto), su velocidad y su giro. */
export interface TrekChip {
  rock: TrekRock;
  p: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
  w: { x: number; y: number; z: number };
}

/** Un bandido (RepArena: lo que hace trekObsMesh; su pelea la lleva el módulo de los bandidos). */
export interface TrekBandit {
  x: number;
  z: number;
  st: string;
  t: number;
  hp: number;
  maxHp: number;
  skin: number;
  ph: number;
  alive: boolean;
  band: boolean;
  ry: number;
  [k: string]: unknown;
}

export type TrekKind = 'log' | 'branch' | 'chest' | 'rock' | 'stream' | 'chasm' | 'bandit';
export type TrekMove = 'jump' | 'lunge' | 'squat';

/** Un reto del camino (RepArena: los objetos de TREK.obs, sin su malla). */
export interface TrekObs {
  kind: TrekKind;
  /** Su distancia a lo largo del sendero. */
  at: number;
  judged: boolean;
  side: number;
  /** La altura de la rama (lo que obliga a agacharse). */
  y: number;
  /** Lo más alto que llegaste mientras pasaba el tronco. */
  maxUp: number;
  /** Quieto bajo la plataforma (no sigue a la cabeza) y dónde te paras. */
  fixed?: boolean;
  stop?: number;
  /** Las paradas: el movimiento que piden, cuántos y los que llevas. */
  move?: TrekMove;
  need?: number;
  got?: number;
  haltT?: number;
  done?: boolean;
  /** El arroyo y el desfiladero: el paso de cada salto, a qué lado cae cada piedra, lo que mide y dónde acabas. */
  step?: number;
  sides?: number[];
  len?: number;
  exit?: number;
  seed?: number;
  /** Desfiladero: lo que llevas en el pilar, el temblor (cuánto se mueve ahora, a un lado), su aviso y si te hundiste. */
  pt?: number;
  cr?: number;
  fell?: boolean;
  shakeX?: number;
  /** Apartándose del sendero (el que no superaste). */
  asideTo?: number;
  dx?: number;
  /** Su distancia, como si el sendero fuera recto, y dónde está en la arena (su giro y su sitio: o.mesh en RepArena). */
  zl?: number;
  ry?: number;
  px?: number;
  pz?: number;
  /** El cofre abierto, que se esfuma. */
  vanish?: number;
  /** La roca: su radio (de su modelo) y su cara. */
  rr?: number;
  /** Lo que se ve, como datos (los modelos los pone la partida): rocas sueltas, piezas juntas, piedras del arroyo, pilares… */
  rocks?: TrekRock[];
  pieces?: TrekPiece[];
  stones?: { x: number; y: number; z: number }[];
  pillars?: { x: number; z: number; ry: number }[];
  sunk?: boolean[];
  links?: number;
  bandits?: TrekBandit[];
  [k: string]: unknown;
}

/** Lo que pasa (RepArena: lo que hacía en el momento), para que la partida lo aplique en este orden. */
export type TrekEv =
  | { t: 'say'; text: string; col: string; dur: number }
  | { t: 'cheer'; text: string; col: string; dur: number }
  | { t: 'snd'; name: 'perfect' | 'combo' | 'whoosh' | 'metalHit' | 'step' | 'explosion' | 'victory'; at: TrekPos | null; arg?: string | boolean }
  | { t: 'fx'; name: 'sparks' | 'smoke' | 'dust' | 'glow'; at: TrekPos; args: (number | number[])[] }
  | { t: 'haptic'; k: number; ms: number }
  | { t: 'score'; n: number }
  | { t: 'combo0' }
  | { t: 'hurt' }
  | { t: 'trophy'; title: string; sub: string }
  | { t: 'store'; key: string; val: unknown }
  | { t: 'turbo'; on: boolean }
  /** Un reto nuevo (la partida le hace su malla) y el que queda atrás (se quita). */
  | { t: 'spawn'; o: TrekObs }
  | { t: 'drop'; o: TrekObs }
  /** Un paso adelante en el arroyo o el desfiladero: el brillo, a la piedra siguiente (o.stones[o.got], o se apaga). */
  | { t: 'hop'; o: TrekObs; ok: boolean }
  /** El pilar i del desfiladero se hunde (con humo y un estruendo donde está). */
  | { t: 'sink'; o: TrekObs; i: number }
  /** Cadenas del cofre: se quitan los primeros `cut` eslabones (de o.links). */
  | { t: 'links'; o: TrekObs; cut: number }
  /** Lascas que saltan de la roca (al embestirla y, al romperse, sus añicos). */
  | { t: 'chips'; o: TrekObs; chips: TrekChip[] }
  /** La roca se hace añicos (se esconde), el cofre se abre (oro dentro, sin cadenas) o se esfuma. */
  | { t: 'rockBurst'; o: TrekObs }
  | { t: 'chestOpen'; o: TrekObs }
  | { t: 'vanish'; o: TrekObs }
  /** El reto que no superaste se aparta del sendero (con polvo y un golpe sordo). */
  | { t: 'aside'; o: TrekObs }
  /** Se acabó la parada de los bandidos: el aviso se apaga y los que quedan se van andando. */
  | { t: 'bandLeave'; o: TrekObs }
  /** Se acaba la parada (ganada o no). */
  | { t: 'haltEnd'; o: TrekObs; won: boolean };
