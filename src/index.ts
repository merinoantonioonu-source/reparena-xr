/**
 * RepArena XR: RepArena hecho con el Immersive Web SDK de Meta (IWSDK).
 * Arranca el mundo con el proyecto (iwsdk.config.json) y registra los sistemas del juego: el de las manos justo detrás de
 * la entrada de IWSDK, y los de la partida detrás de la física (así leen las posiciones ya calculadas en cada paso).
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnemySystem } from './combat/enemies.js';
import { GameSystem } from './combat/game.js';
import { HandSystem } from './input/hand-system.js';
import { useLocalInputModels } from './input/input-models.js';
import { initSettings } from './core/settings.js';

// tus ajustes (los mismos que en RepArena: se comparten) y las manos y mandos desde el propio juego, antes de crear el mundo
initSettings();
useLocalInputModels();

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(HandSystem, { priority: 4 });
  world.registerSystem(EnemySystem, { priority: 5 });
  world.registerSystem(GameSystem, { priority: 6 });
});
