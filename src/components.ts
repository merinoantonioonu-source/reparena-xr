/**
 * El catálogo de componentes que comparten el juego y el editor.
 */
import { defineComponents } from '@iwsdk/core';
import { Foe, Obstacle } from './combat/components.js';

export default defineComponents([Foe, Obstacle]);
