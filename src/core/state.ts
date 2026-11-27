/**
 * Lo que comparten los sistemas del juego: la fase de la partida, dónde está el jugador y la bola, y los números del
 * marcador. Un solo objeto (sin copias por fotograma).
 */
import { Vector3 } from '@iwsdk/core';

export type Phase = 'menu' | 'playing' | 'over';

export const GAME = {
  phase: 'menu' as Phase,
  /** El menú que se ve: el principal, Opciones o ninguno (en plena partida). */
  menu: 'lobby' as 'lobby' | 'options' | 'summary' | 'pause' | 'none',
  /** En pausa (la ronda se para: nadie se mueve ni sale). */
  paused: false,
  /** Oleada en curso (1, 2, 3…) y si está en la pausa de entre oleadas (no sale nadie). */
  wave: 0,
  between: false,
  lives: 5,
  maxLives: 5,
  kills: 0,
  reps: 0,
  perfect: 0,
  /** Los puntos, el combo (repeticiones seguidas sin que te den ni falles) y el mejor, y los golpes recibidos. */
  score: 0,
  combo: 0,
  bestCombo: 0,
  taken: 0,
  best: 0,
  startTime: 0,
  /** Dónde está la cabeza (mundo) y hacia dónde mira el cuerpo (horizontal, unitario). */
  head: new Vector3(0, 1.6, 0),
  fwd: new Vector3(0, 0, -1),
  /** La bola: si se ve (y los zombis la rodean), dónde está y su radio. */
  ballOn: false,
  ballPos: new Vector3(),
  ballR: 0.26,
  /** La rapidez de los zombis de esta oleada (m/s). */
  foeSpeed: 1.0,
  /** Tumbado (superman, plancha lateral): la altura a la que vienen los voladores (0: de pie). */
  lowFly: 0,
  /** El superman: lo que aguantas arriba, si estás arriba, el tiempo de la ronda y cuándo puede lanzarse el siguiente. */
  sup: null as SupEnv | null,
  /** Lo que multiplican los puntos de cada repetición (la fiebre de Arcos y el turbo de la Travesía: ×2). */
  ptsK: 1,
  /** Lo que ha subido la dificultad creciente (oleadas superadas): lo leen los enemigos (dv). */
  ramp: 0,
};

/** Lo que dice el aviso del centro de la vista (RepArena: drawCenter): la calibración (título, dos líneas, una nota arriba a
 * la derecha, un estado, la cuenta y la barra) o «¡PREPÁRATE!» con la cuenta atrás. */
export interface CenterInfo {
  kind: 'calib' | 'ready';
  title: string;
  lines: string[];
  note: [string, string] | null;
  status: [string, string] | null;
  count: string;
  bar: number;
}

/** Los avisos de la vista (src/ui/view-panels.ts): lo que dice el del centro (null: no se ve) y si se ve la carátula del
 * duelo (mientras, la ronda espera: no se calibra ni empieza nada). */
export const VIEW = {
  center: null as CenterInfo | null,
  duel: false,
  /** Echado en plena partida aunque el ejercicio sea de pie (la Travesía: en plancha bajo un túnel): los avisos, en el suelo
   * bajo la cara y siguiendo la mirada (fijos delante, a la altura de estar de pie, no se leerían). Lo pone TrekSystem. */
  prone: false,
  /** Dónde está el marcador (en la arena) y su radio (m): los avisos de la vista se apartan de él (no lo tapan). Lo pone la
   * partida al colocarlo. */
  board: { x: 0, y: 0, z: 0, r: 0, on: false },
  /** El aviso dorado de los logros y el panel entre oleadas (o tramos), mientras se ven: los demás avisos de la vista se
   * apartan de ellos (pedido del usuario: los avisos se solapaban). Los pone la partida. */
  trophy: { x: 0, y: 0, z: 0, r: 0, on: false },
  intro: { x: 0, y: 0, z: 0, r: 0, on: false },
};

/** Avisos entre sistemas (los pone el sistema del juego al arrancar). */
/** Con un menú abierto en las gafas, la escena se aligera (idea 4 elegida por el usuario): sin los árboles, rocas y plantas del
 * entorno ni los enemigos, para que el menú vaya fluido al mover la cabeza. Lo pone `RaMenuSystem`. */
export const LITE = { on: false };

/** El vuelo sobre el mapa (MapSystem): si está en marcha (solo el cielo y el mapa: EnvSystem quita la foto de fondo, el
 * valle y las luciérnagas) y a qué altura sobre el suelo vas (m: más alto, el cielo más oscuro, hasta el negro del espacio); `haze`, el color del
 * horizonte de ahora (lo pone EnvSystem: la calima del fondo del mapa es de ese color). */
export const MAPVIEW = { on: false, alt: 0, haze: [0.72, 0.84, 0.98], flat: false };
/** Quien pilota el mapa cuando no es la Travesía (el parapente de Barras: lo llena `BarsSystem`, lo lee `MapSystem`): si
 * está en marcha, lo que vira (−1 a 1; +, a la derecha), lo que sube o baja (−1 a 1), la marcha, dónde queda el punto del
 * vuelo en la habitación (tu cabeza al colgarte) y hacia dónde se vuela en ella (rad: 0, hacia −z), lo que se inclina el mapa hacia tu vista (`pitch`, rad, respecto al
 * suelo y hacia tus pies: «Parapente: inclinación del mapa»; de pie, 0) y lo volado (m). */
export const MAPPILOT = {
  on: false,
  steer: 0,
  climb: 0,
  gear: 1,
  x: 0,
  y: 1.2,
  z: 0,
  yaw: 0,
  pitch: 0,
  flown: 0,
  /** Lo que el mapa le cuenta de vuelta (en el mapa: x al oeste, z al norte): dónde vas, el rumbo, lo ladeado, la altura
   * sobre lo de debajo, la velocidad y lo deprisa que va todo por la altura. */
  px: 0,
  pz: 0,
  heading: 0,
  bank: 0,
  agl: 260,
  speed: 0,
  scale: 1,
  /** Lo que el piloto pide pintar en el mapa: columnas de luz (las térmicas: dónde y su radio) y su sombra por delante. */
  cols: [
    { x: 0, z: 0, r: 80, on: false },
    { x: 0, z: 0, r: 80, on: false },
  ],
  shadow: false,
  /** Hacia dónde mira el jugador colgado, por encima del suelo y hacia sus pies (grados; −1, aún no se sabe): con «Ajustar
   * a mi mirada», la inclinación del mapa. */
  gaze: -1,
};
/** Un momento especial de la partida (la fiebre de Arcos, el relámpago de Combate, el turbo o la supervelocidad de la
 * Travesía): las luciérnagas destellan más vivas. Lo pone la partida en cada fotograma. */
export const SPECIAL = { on: false };
/** El viaje por portales de Combate y Toques (src/combat/journey.ts): si va, el orden de los sitios de esta partida, cuántas
 * oleadas en cada uno, en qué tramo del viaje estás (lo que se ve) y al que vas (el portal lo cruza: src/combat/travel-system.ts).
 * El orden lo pone EnvSystem en el menú (con la semilla de la partida); el tramo, la partida y el portal. */
export const TRAVEL = { on: false, route: [] as string[], per: 2, leg: 0, want: 0 };
/** El suceso de la oleada que se juega (src/combat/wave-events.ts: 'eclipse', 'meteors', 'fog', 'gold' o ''): lo pone la partida al
 * empezar cada oleada; lo leen EnvSystem (el cielo) y WaveEventSystem (meteoritos y orbes). */
export const WAVE_EV = { kind: '' as string, t: 0 };

export const HOOKS = {
  /** Un enemigo te ha dado (str: las vidas que quita, su fuerza). */
  playerHit: (_str?: number, _silent?: boolean): void => {},
  /** Una vida de más (el corazón del combate en el cielo): ¿había sitio? (con las vidas llenas o infinitas, no). */
  lifeUp: (): boolean => false,
  /** Ha caído uno (kind: el que es; boss: el jefe). */
  foeDown: (_kind?: string, _boss?: boolean, _target?: unknown): void => {},
  /** Puntos de más (una piedra parada o esquivada) y si suman al combo. */
  score: (_pts: number, _combo?: boolean): void => {},
  /** Empezar la ronda (EMPEZAR, o Enter en el ordenador): lo pone la partida. */
  startRound: (): void => {},
  /** Jugar un nivel de la campaña (los ajustes del nivel, por encima de los tuyos): lo pone la partida. */
  campPlay: (_lv: number): void => {},
  /** Abrir el menú principal delante de ti (last: cómo fue la ronda que acaba; vacío, ninguna) y quitarlo: lo pone el menú. */
  showMenu: (_last: string): void => {},
  hideMenu: (): void => {},
  /** El resumen de la ronda (RepArena, opción A): lo enseña el menú. */
  showSummary: (_s: unknown): void => {},
  /** La pausa: pararla y seguir (los pone el menú), recolocarse, terminar la ronda y volver al menú (los pone la partida). */
  pause: (): void => {},
  /** Guarda el registro de diagnóstico de los últimos 30 s (src/ui/diag-system.ts). */
  diagSave: (_reason: string): void => {},
  resume: (): void => {},
  recalibrate: (): void => {},
  endRound: (): void => {},
  toLobby: (): void => {},
  /** Un aviso en el marcador o, si pide hacer algo ya (toast), en la vista (y, si es naranja, también en grande en el
   * suelo): lo pone la partida. */
  say: (_text: string, _color: string, _secs: number, _toast?: boolean): void => {},
  /** Una repetición que cuenta sin disparo (Arcos: un arco pasado; RepArena: registerRep(perfect, false)) y puntos de más. */
  arcRep: (_perfect: boolean): void => {},
  /** Un logro grande y dorado (RepArena: trophy): lo pone la partida. */
  trophy: (_title: string, _sub?: string, _color?: string): void => {},
  /** Un aviso breve en la vista (lo que pide hacer algo ya): lo pone el sistema de los avisos de la vista. */
  toast: (_text: string, _color: string, _secs: number): void => {},
  /** La carátula del duelo al empezar la ronda: la enseña el sistema de los avisos de la vista (si no toca, no hace nada). */
  duel: (): void => {},
  /** Barras: empezar la oleada i (cuando te has colgado), colocar el aparato (con las manos; note: el aviso), si está colocado,
   * si se está colocando y dejarlo (el botón de la muñeca): lo pone el sistema de Barras. */
  barWave: (_i: number): void => {},
  /** Tu espacio, tal cual lo dan las gafas (sin la colocación delante de las compuertas): para colocar el aparato de Barras. */
  rigHome: (): void => {},
  placeEq: (_note?: string): void => {},
  eqPlaced: (): boolean => true,
  placing: (): boolean => false,
  cancelPlace: (): void => {},
  /** Ha cambiado lo que suena (o la conexión con Spotify): rehacer lo que lo enseña. */
  spChanged: (): void => {},
  /** Una pantalla genérica del menú (título y filas de texto o de botones, como `openMenu` de RepArena): la abre y la cierra el
   * menú de RepArena (openMenu, src/ui/ra/menu-core.ts). */
  openScreen: (_rows: unknown[], _opts?: { title?: string; accent?: string; low?: boolean }): void => {},
  closeScreen: (): void => {},
  screenOn: (): boolean => false,
  /** Las cartas de mejora (el menú de RepArena: src/ui/ra/menus.ts, perkMenu): cuáles y qué hacer al elegir una. */
  perksOpen: (_cards: { name: string; desc: string; col: string }[], _pick: (i: number) => void): void => {},
  perksClose: (): void => {},
  /** La Travesía volando: «Ajustar el vuelo» desde la pausa (el asistente, en el próximo cofre o antes del primer tramo). */
  flyCoach: (): void => {},
  /** Unas chispas (n, del color c) en p: lo pone la partida. */
  sparks: (_p: Vector3, _n: number, _c: number): void => {},
  /** Los premios de un cofre recién abierto, que salen de su boca (`at`) y suben flotando (src/ui/prize-system.ts). */
  prize: (_at: Vector3, _items: { icon: 'key' | 'gem' | 'treasure' | 'coins' | 'heart' | 'perk'; text: string; color: string }[]): void => {},
};

/** El superman para los voladores (src/combat/flight.ts): lo que aguantas arriba (s), si estás arriba, el tiempo de la ronda,
 * cuándo puede lanzarse el siguiente (lo comparten todos: nunca dos seguidos) y, con el «aguante que protege», lo que llevas
 * tumbado sin subir y el descanso que se te da (s; sin ellos, como en RepArena). */
export interface SupEnv {
  hold: number;
  up: boolean;
  time: number;
  next: { t: number };
  rest?: number;
  restMax?: number;
}
