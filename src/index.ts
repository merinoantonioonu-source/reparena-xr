/**
 * RepArena XR: prototipo de RepArena hecho con el Immersive Web SDK de Meta (IWSDK).
 * Arranca el mundo con el proyecto (iwsdk.config.json) y registra los sistemas del juego, detrás de la física (así
 * leen las posiciones ya calculadas en cada paso).
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnemySystem } from './combat/enemies.js';
import { GameSystem } from './combat/game.js';
import { useLocalInputModels } from './input/input-models.js';

useLocalInputModels();

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(EnemySystem, { priority: 5 });
  world.registerSystem(GameSystem, { priority: 6 });
});
