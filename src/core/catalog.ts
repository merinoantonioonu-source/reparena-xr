/**
 * Lo que hay en el juego: ejercicios, modos, enemigos, grupos de ajustes y rangos. Copiado tal cual de RepArena
 * (src/00_core.js), con los mismos nombres y claves: los ajustes guardados se comparten con él.
 */

export const EX_NAMES: Record<string, string> = { squat: 'Sentadillas', lunge: 'Zancadas', pushup: 'Flexiones', pike: 'Flexiones en pica', inchworm: 'Flexiones inchworm', dips: 'Fondos en silla', curl: 'Curl de bíceps', curl2: 'Curl con barra o kettlebell', twist: 'Antebrazos (barra flexible)', press: 'Press de hombro', press2: 'Press con barra', fraise: 'Elevaciones frontales (una pesa)', thruster: 'Sentadilla con press', frontsq: 'Sentadilla con elevación frontal', jsquat: 'Sentadilla con salto', swing: 'Swing con kettlebell', chop: 'Leñador', dlrow: 'Peso muerto', plank1: 'Plancha con un brazo', plankrow: 'Remo en plancha', splank: 'Plancha lateral', superman: 'Superman', row: 'Remo invertido', pullup: 'Dominadas', hang: 'Colgado', jump: 'Saltos', abs: 'Abdominales', combo: 'Combinado', slam: 'Slam' };
export const EX_SHORT: Record<string, string> = { squat: 'Sentadillas', lunge: 'Zancadas', pushup: 'Flexiones', pike: 'Pica', inchworm: 'Inchworm', dips: 'Fondos silla', curl: 'Curl', curl2: 'Curl barra', twist: 'Antebrazos', press: 'Press hombro', press2: 'Press barra', fraise: 'Elev. frontal', thruster: 'Sent. + press', frontsq: 'Sent. + elev.', jsquat: 'Sent. + salto', swing: 'Swing', chop: 'Leñador', dlrow: 'Peso muerto', plank1: 'Plancha 1 brazo', plankrow: 'Remo plancha', splank: 'Plancha lateral', superman: 'Superman', row: 'Remo invertido', pullup: 'Dominadas', hang: 'Colgado', jump: 'Saltos', abs: 'Abdominales', combo: 'Combinado', slam: 'Slam' };
export const MODE_NAMES: Record<string, string> = { combat: 'Combate', arcs: 'Arcos', bars: 'Barras', touch: 'Toques', trek: 'Travesía' };

export const LEGACY_MODES: Record<string, { foes: string; aim: string }> = { walkers: { foes: 'robots', aim: 'auto' }, flyers: { foes: 'flyers', aim: 'hands' } }; // (foes: ver foeCatPatch)
// Enemigos que se pueden elegir, en tres grupos: los que andan y salen de las compuertas, los que salen de las trampillas
// (en las flexiones y las planchas sobre una mano, en el suelo) y los voladores. Cada uno es [clave, nombre]
export const FOE_GATE: [string, string][] = [['robot', 'Robots'], ['imp', 'Diablillo'], ['puglin', 'Puglin'], ['thrower', 'Lanzador'], ['zombie', 'Zombi'], ['zgreen', 'Zombi verde'], ['zchubby', 'Zombi gordo'], ['raptor', 'Velociraptor'],
  ['skeleton', 'Esqueleto pirata'], ['captain', 'Capitán Barbarroja'], ['sharky', 'Tiburón'], ['mako', 'Tiburón gris'],
  ['demon', 'Demonio'], ['greendemon', 'Demonio verde'], ['cyclops', 'Cíclope'], ['yeti', 'Yeti'], ['skull', 'Calavera'], ['alien', 'Alien'], ['alientall', 'Alien alto']];
export const FOE_HATCH: [string, string][] = [['spider', 'Arañas'], ['crab', 'Cangrejo'], ['mushroom', 'Seta'], ['skull', 'Calavera']];
export const FOE_FLY: [string, string][] = [['drone', 'Drones'], ['hornet', 'Avispones'], ['bee', 'Abeja'], ['bat', 'Murciélago'], ['cthulhu', 'Cthulhu'], ['dragon', 'Dragón (jefe)']];
export const PIRATE_GATE = ['skeleton', 'captain', 'sharky', 'mako']; // los piratas (Pirate Kit)
// Sus retratos, en este orden, en models/retratos.png (hechos con sus modelos; un enemigo nuevo sale sin retrato hasta rehacer la hoja)
export const FOE_PIC = ['robot', 'imp', 'puglin', 'thrower', 'zombie', 'zgreen', 'zchubby', 'raptor', 'skeleton', 'captain', 'sharky', 'mako', 'demon', 'greendemon', 'cyclops', 'yeti', 'skull', 'alien', 'alientall',
  'spider', 'crab', 'mushroom', 'drone', 'hornet', 'bee', 'bat', 'cthulhu', 'dragon'];
export const CUTE_GATE = ['demon', 'greendemon', 'cyclops', 'yeti', 'skull', 'alien', 'alientall']; // los monstruitos (Cute Animated Monsters)
// Atajo de antes (y de los bloques de una sesión): solo los de tierra, solo voladores o los dos
export const FOE_CATS: [string, string][] = [['robots', 'Por tierra'], ['flyers', 'Voladores'], ['mix', 'Mezcla']];
// Los del juego van en «Ajustes» (por pestañas); sonido y entorno tienen su propio submenú; menú y meta son comunes
export const GROUP_NAMES: Record<string, string> = { partida: 'Partida', ejercicio: 'Tu cuerpo (recorridos)', enemigos: 'Enemigos', armas: 'Armas', cada: 'Cada enemigo', arcos: 'Arcos', toques: 'Toques', barras: 'Barras', travesia: 'Travesía', sistema: 'Menú y avisos', perfil: 'Tu meta', sonido: 'Sonido y música', entorno: 'Entorno y vista' };
export const OWN_MENU = ['sonido', 'entorno']; // grupos con submenú propio (no salen como pestañas de Ajustes)
export const GROUP_TAB: Record<string, string> = { sistema: 'Menú', ejercicio: 'Tu cuerpo', arcos: 'Modo Arcos', toques: 'Modo Toques', barras: 'Modo Barras', travesia: 'Modo Travesía' }; // nombre en las pestañas de las gafas (los de los modos, distintos de los modos de arriba del menú)
// «Tu cuerpo» no es dificultad: lo que se mueve tu cuerpo en cada ejercicio (cuánto bajas, subes o aguantas); se guarda para cada uno
export const BODY_NOTE = 'No es la dificultad (esa es el rango): es lo que se mueve tu cuerpo en este ejercicio, cuánto bajas, subes o aguantas para que cuente. Se guarda para cada ejercicio.';
// Qué ejercicios se juegan en cada modo (el primero es el que se elige al cambiar a ese modo)
export const MODE_EX: Record<string, string[]> = {
  // (se quitaron el press de hombro, el press con barra y la flexión en pica, que en las gafas no se detectaban bien, y el
  // leñador, que no aportaba nada; su código sigue, por si vuelven, y su historial se sigue viendo)
  combat: ['squat', 'lunge', 'jsquat', 'pushup', 'inchworm', 'dips', 'curl', 'curl2', 'twist', 'fraise', 'thruster', 'frontsq', 'swing', 'dlrow', 'plank1', 'splank', 'superman'], arcs: ['squat'],
  bars: ['row', 'pullup', 'hang'], touch: ['slam', 'jump', 'abs', 'pushup', 'combo'], // (en Toques, sentadillas y zancadas pasan a ser el Slam)
  trek: ['squat', 'lunge', 'jsquat', 'frontsq', 'curl', 'curl2'] // (de pie: en la Travesía se avanza por el sendero)
};
// Zonas del cuerpo, para ordenar los ejercicios por lo que trabajan (opcional)
export const BODY_ZONES: [string, string[]][] = [
  ['Piernas', ['squat', 'lunge', 'jsquat', 'jump', 'slam']],
  ['Brazos y hombros', ['curl', 'curl2', 'twist', 'fraise', 'dips']],
  ['Pecho', ['pushup', 'inchworm']],
  ['Abdomen y espalda baja', ['abs', 'plank1', 'splank', 'superman']],
  ['Espalda y agarre', ['row', 'pullup', 'hang']],
  ['Cuerpo entero', ['thruster', 'frontsq', 'swing', 'dlrow', 'combo']]
];
export const exOk = (mode: string, ex: string): boolean => !!MODE_EX[mode] && MODE_EX[mode].includes(ex);
export const BAR_EX = MODE_EX.bars; // ejercicios del modo Barras: el resto no se usa en él
// Al cambiar de modo, el ejercicio que se queda: el mismo si vale; si estabas en el suelo, flexiones
export function exFor(mode: string, ex: string): string { return exOk(mode, ex) ? ex : ['pushup', 'pike', 'inchworm', 'plank1', 'plankrow', 'superman', 'abs', 'splank'].includes(ex) && exOk(mode, 'pushup') ? 'pushup' : MODE_EX[mode][0]; }
export const modeFor = (ex: string): string | undefined => Object.keys(MODE_EX).find(m => exOk(m, ex));


// Rangos de dificultad: la dificultad es el rango, y cada ejercicio (en cada modo) tiene el suyo. Pone de una vez las
// vidas, lo que tardan y cuántos enemigos vienen a la vez, cómo vuelan, la dificultad creciente, la de la defensa y el
// ritmo de los arcos, los toques y los objetivos de las barras. El cabo es como venía el juego
export const RANKS: [string, string][] = [['recluta', 'Recluta'], ['soldado', 'Soldado'], ['cabo', 'Cabo'], ['sargento', 'Sargento'], ['teniente', 'Teniente'], ['capitan', 'Capitán'], ['general', 'General']];
export const RANK_VALS: Record<string, (number | string)[]> = {
  lives: [0, 5, 3, 3, 2, 2, 1], walkTime: [22, 17, 14, 11, 9, 7, 5], maxAlive: [2, 3, 5, 6, 7, 8, 10], flySpeed: [2, 3, 3.5, 4.5, 5.5, 7, 9], erratic: [50, 70, 100, 110, 130, 150, 180],
  ramp: [0, 2, 4, 5, 6, 8, 10], arcSpeed: [4, 5.5, 7, 8.5, 10, 12, 14], arcRate: [8, 10, 12, 15, 18, 22, 26], arcMaxGap: [9, 7, 6, 5, 4, 3.5, 3], arcLaser: [0, 15, 30, 45, 60, 80, 100],
  tchArrive: [4.5, 4, 3, 2.5, 2, 1.5, 1], tchWindow: [2, 1.6, 1.2, 1, 0.9, 0.7, 0.6], tchGap: [3.4, 2.9, 2.4, 2.1, 1.8, 1.5, 1.2], barArrive: [6, 5, 4, 3.5, 3, 2.5, 2], barWait: [0, 16, 12, 10, 8, 6, 4],
  guardDiff: ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard']
};
// Con las piernas (sentadillas, zancadas, peso muerto…): aguantar abajo carga el disparo, y bajar mucho, la recarga profunda
export const DEEP_EX = ['squat', 'lunge', 'jsquat', 'thruster', 'frontsq', 'dlrow'];

// Los enemigos de serie de cada grupo (los mismos que el esquema: si un grupo se queda vacío, se vuelve a estos)
export const FOES_DEF: Record<string, string> = { foesGate: 'robot,imp,puglin,zombie,raptor', foesHatch: 'spider', foesFly: 'drone,hornet' };
