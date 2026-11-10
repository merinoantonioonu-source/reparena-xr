/**
 * Lo que se deduce de los ajustes: qué tipo de ejercicio es (de pie, en el suelo, con pesas…), qué enemigos salen, cómo se
 * apunta, si hay pistolas o espadas… Copiado tal cual de RepArena (src/00_core.js): las condiciones del esquema y el
 * juego dependen de estas reglas. Lógica pura, sin IWSDK.
 */
import { DEEP_EX, FOES_DEF } from './catalog.js';
import { num, settings, str } from './values.js';

// De pie con las manos libres: sentadillas y zancadas (se apunta con las manos y valen las pistolas)
export const handsFree = (): boolean => settings.exercise === 'squat' || settings.exercise === 'lunge';
// Con pesas en las manos (no se abre la pausa juntando los dedos)
export const holdsWeights = (): boolean => ['curl', 'curl2', 'twist', 'press', 'press2', 'fraise', 'thruster', 'frontsq', 'swing', 'chop', 'dlrow'].includes(settings.exercise);
// En plancha sobre una mano: arañas por los dos costados, cada brazo dispara a su lado
export const oneArm = (): boolean => settings.exercise === 'plank1';
export const isCombat = (): boolean => settings.mode === 'combat';
export const deepOn = (): boolean => num('deepDrop') > 0 && DEEP_EX.includes(settings.exercise) && isCombat();
export const pistolOn = (): boolean => !!settings.pistol && handsFree() && settings.mode === 'combat';
export const isBars = (): boolean => settings.mode === 'bars';
// Postura en el suelo (flexiones y plancha): arañas, trampillas, calibración y marcador bajos
export const isFloor = (): boolean => ['pushup', 'pike', 'plank1', 'plankrow', 'superman', 'abs', 'splank'].includes(settings.exercise) || (settings.exercise === 'combo' && settings.comboBase !== 'stand');
// Sentado en el borde de una silla (fondos): la cabeza, a media altura
export const isSeated = (): boolean => settings.exercise === 'dips';
// Tumbado boca arriba (abdominales)
export const isSupine = (): boolean => settings.exercise === 'abs' || (settings.exercise === 'combo' && settings.comboBase === 'abs');
// Batalla diminuta bajo tu cara (flexiones y plancha); en el superman los bichos vuelan de frente a tamaño normal
export const isTiny = (): boolean => settings.mode !== 'touch' && (settings.exercise === 'pushup' || settings.exercise === 'pike' || settings.exercise === 'inchworm' || oneArm());

// Enemigos de la partida: los elegidos de cada grupo (foeList), si alguno de ellos sale en esta partida (foeOn) y, de
// ahí, el reparto: solo por tierra, solo voladores o mezcla. La plancha con un brazo trae siempre arañas y el superman,
// voladores bajos
export function foeList(k: string): string[] {
  return String(settings[k] || '').split(',').filter(Boolean);
}
// «Qué enemigos salen» (foeKind) quita un grupo entero sin tocar lo marcado en él; si el que queda está vacío, los de siempre
export const foeOnly = (): string => (oneArm() || settings.exercise === 'superman' ? 'both' : str('foeKind'));
export const groundList = (): string[] => {
  const k = isTiny() ? 'foesHatch' : 'foesGate', l = foeList(k);
  if (foeOnly() === 'fly') return [];
  return l.length ? l : oneArm() ? ['spider'] : foeOnly() === 'ground' ? FOES_DEF[k].split(',') : l;
};
export const flyList = (): string[] => {
  const l = foeList('foesFly');
  if (foeOnly() === 'ground') return [];
  return l.length ? l : settings.exercise === 'superman' || foeOnly() === 'fly' ? FOES_DEF.foesFly.split(',') : l;
};
export const foes = (): string => {
  if (oneArm()) return 'robots';
  if (settings.exercise === 'superman') return 'flyers';
  const g = groundList().length, f = flyList().length;
  return g && f ? 'mix' : f ? 'flyers' : 'robots';
};
export const foesHas = (k: string): boolean => isCombat() && (foes() === k || foes() === 'mix');
export const foeOn = (...ks: string[]): boolean => isCombat() && !isTiny() && foesHas('robots') && ks.some((k) => groundList().includes(k));
// El atajo (robots, voladores o mezcla) → los ajustes de cada grupo: deja vacío lo que no sale y, si lo que sí sale está
// vacío, vuelve a lo de siempre
export function foeCatPatch(v: string): Record<string, string> {
  const o: Record<string, string> = {}, keep = (k: string): string => (foeList(k).length ? str(k) : FOES_DEF[k]);
  if (v === 'flyers') Object.assign(o, { foesGate: '', foesHatch: '', foesFly: keep('foesFly') });
  else if (v === 'robots') Object.assign(o, { foesGate: keep('foesGate'), foesHatch: keep('foesHatch'), foesFly: '' });
  else if (v === 'mix') Object.assign(o, { foesGate: keep('foesGate'), foesHatch: keep('foesHatch'), foesFly: keep('foesFly') });
  return o;
}

// Puntería: automática (cada repetición dispara sola al más cercano) o la tuya, con las manos o la mirada. En la plancha
// con un brazo (cada brazo dispara a su lado) y en el superman (tumbado no se apunta) siempre es automática
export const aimForced = (): boolean => oneArm() || settings.exercise === 'superman' || settings.exercise === 'inchworm' || settings.exercise === 'twist'; // (con la barra flexible las dos manos están ocupadas)
export const autoAim = (): boolean => isCombat() && !pistolOn() && (settings.aim === 'auto' || aimForced());
export const aimManual = (): boolean => isCombat() && !pistolOn() && !autoAim();
// Espadas: en Combate contra robots (sentadillas o zancadas) y en Toques de pie; solo se ven si llevas los mandos
export const swordSet = (): boolean => settings.sword !== 'off' && (isCombat() ? handsFree() && foes() === 'robots' : settings.mode === 'touch' && (['squat', 'lunge', 'jump', 'slam'].includes(settings.exercise) || (settings.exercise === 'combo' && settings.comboBase === 'stand')));
// Cada repetición da un disparo por mano (dos pistolas o dos manos que lanzan); con una espada y el bláster, uno cada uno
export const twoShots = (): boolean => isCombat() && handsFree() && ((pistolOn() && !swordSet()) || (aimManual() && settings.aim === 'hands'));
