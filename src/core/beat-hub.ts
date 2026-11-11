/**
 * El pulso del juego, uno para todos (RepArena: `BEAT`, `beatP`, `arxBeatP`, de src/70_game.js): el reloj de pulsos de
 * `src/core/beat.ts` con el periodo que toca según el modo (Combate: el ritmo marcado; Arcos: solo con «Arcos al compás»; Toques lo
 * lee de `beat0`). Lo mueve la partida cada fotograma y lo leen los modos, las luciérnagas y los enemigos que bailan.
 */
import { arxBeatP, Beat, beatP, MoteBeat } from './beat.js';
import { num, on, settings } from './values.js';

const bpm = (): number => num('bpm');

/** El periodo del pulso de ahora (s): 0 sin ritmo (RepArena: beatAny). */
export const beatAny = (): number => beatP(settings.mode === 'combat', bpm()) || arxBeatP(settings.mode === 'arcs', on('arcBeat'), bpm());

export const BEAT = new Beat(beatAny, () => performance.now() / 1000);
/** El baile de las luciérnagas. */
export const MOTES = new MoteBeat();
