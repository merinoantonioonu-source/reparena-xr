/**
 * El catálogo de componentes que comparten el juego y el editor.
 */
import { defineComponents } from '@iwsdk/core';
import { Foe, Obstacle } from './game-components.js';

export default defineComponents([Foe, Obstacle]);
