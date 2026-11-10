/**
 * Cómo se hace cada ejercicio de pie, en pocas palabras: las dos líneas del panel de inicio y el recordatorio del marcador
 * mientras no pasa nada. (Lo que se hace mal lo dicen los propios detectores: src/exercise/standing.ts.)
 */

/** Las dos primeras líneas del panel de inicio (la tercera, cómo sale el rayo, depende de la puntería). */
export const HOW: Record<string, [string, string]> = {
  squat: ['1. Baja en sentadilla: se enciende la bola roja de energía.', '2. Aguanta abajo en la postura perfecta: ×2, ×3 y ×4.'],
  lunge: ['1. Baja en zancada, la rodilla de atrás hacia el suelo: carga.', '2. Aguanta abajo: ×2, ×3 y ×4. Cada vez, la otra pierna delante.'],
  jsquat: ['1. Baja en sentadilla: carga (aguantando abajo, ×2, ×3 y ×4).', '2. Al subir, salta: el salto dispara.'],
  thruster: ['1. Baja en sentadilla con las pesas: carga (aguantando, más).', '2. Al subir, empuja las pesas por encima de la cabeza: dispara.'],
  frontsq: ['1. Baja en sentadilla: carga (aguantando, más).', '2. Al subir, brazos estirados al frente, a la altura de los hombros.'],
  swing: ['1. Cadera atrás con la espalda recta: carga.', '2. Lanza la kettlebell al frente, a la altura del pecho: dispara.'],
  dlrow: ['1. Baja el peso con la cadera atrás: carga (aguantando, más).', '2. Ponte de pie: dispara.'],
  curl: ['1. Sube la pesa hasta el hombro: carga (cada brazo, el suyo).', '2. Aguanta arriba: ×2, ×3 y ×4. Al bajarla, dispara.'],
  curl2: ['1. Sube la barra o la kettlebell, con las dos manos, al hombro.', '2. Aguanta arriba: ×2, ×3 y ×4. Al bajarla, dispara.'],
  fraise: ['1. Sube la pesa al frente, brazos estirados, hasta los hombros.', '2. Aguanta arriba: ×2, ×3 y ×4. Al bajarla, dispara.'],
  twist: ['1. Escurre la barra flexible girando las muñecas: carga.', '2. Aguanta escurrida (×2, ×3, ×4) y gira al revés: dispara.'],
};

/** El recordatorio del marcador mientras no pasa nada. */
export const IDLE: Record<string, string> = {
  squat: 'Baja en sentadilla para cargar',
  lunge: 'Baja en zancada para cargar',
  jsquat: 'Baja y sube saltando',
  thruster: 'Baja y sube las pesas arriba',
  frontsq: 'Baja y sube con los brazos al frente',
  swing: 'Cadera atrás y lanza la pesa',
  dlrow: 'Baja el peso para cargar',
  curl: 'Sube la pesa al hombro',
  curl2: 'Sube la barra al hombro',
  fraise: 'Sube la pesa al frente',
  twist: 'Escurre la barra para cargar',
};
