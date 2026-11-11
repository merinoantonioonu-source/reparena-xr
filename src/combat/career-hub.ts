/**
 * Tu carrera (nivel, misiones del día, escudos de racha), una sola para todo el juego: la lógica es src/core/career.ts
 * (la de RepArena, con su guardado en `reparena3-career`); aquí se le pone lo que es del juego: dónde se guarda, el día, tu
 * meta y tu peso, qué modos y ejercicios se pueden jugar ya y los avisos grandes (trofeos). Se crea la primera vez que se
 * pide, ya con los ajustes cargados.
 */
import { Career, type LookKey } from '../core/career.js';
import { progress, type Progress, type HistRow } from '../core/days.js';
import { HIST_KEY } from '../core/run.js';
import { store } from '../core/settings.js';
import { HOOKS } from '../core/state.js';
import { num } from '../core/values.js';
import { PLAY_MODES, playableAnywhere } from '../core/playable.js';
import { LOOK } from './fx.js';

let C: Career | null = null;

export function career(): Career {
  if (!C) {
    C = new Career({
      store,
      now: () => Date.now(),
      goalMin: () => num('goalMin'),
      random: Math.random,
      kg: () => num('weight') || 70,
      playMode: (m) => PLAY_MODES.includes(m), // (los demás modos llegan con sus PR: 16 a 18)
      playEx: (x) => playableAnywhere(x),
      trophy: (t, s, c) => HOOKS.trophy(t, s, c),
      cheer: (t, c, s) => HOOKS.say(t, c, s, false),
    });
    LOOK.bolt = C.lookHex('bolt');
    LOOK.hands = C.lookHex('hands');
  }
  return C;
}

/** El historial de rondas guardado. */
export const history = (): HistRow[] => store<HistRow[]>(HIST_KEY) ?? [];

/** Tu racha, tu semana y lo de hoy (RepArena: progress), con los días que salvó un escudo. */
export const progressNow = (h: HistRow[] = history()): Progress => progress(h, Date.now(), career().cr.frozen, num('weight') || 70);

/** Cambia el color que llevas puesto (manos o rayo) si ya lo tienes, y lo aplica al rayo. */
export function setLook(k: LookKey, v: string): void {
  const c = career();
  c.lookSet(k, v);
  LOOK.bolt = c.lookHex('bolt');
  LOOK.hands = c.lookHex('hands');
}
