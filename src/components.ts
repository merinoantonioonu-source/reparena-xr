/**
 * El catálogo de componentes que comparten el juego y el editor.
 */
import { defineComponents } from '@iwsdk/core';
import { Flyer, Foe, Gate, Obstacle } from './combat/components.js';

export default defineComponents([Foe, Flyer, Obstacle, Gate]);
