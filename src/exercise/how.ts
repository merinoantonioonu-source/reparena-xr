/**
 * Cómo se hace cada ejercicio (de pie, sentado y en el suelo), en pocas palabras: las dos líneas del panel de inicio y el recordatorio del marcador
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
  dips: ['1. Manos en el borde de una silla estable: baja doblando los codos (90°).', '2. Aguanta abajo: ×2, ×3 y ×4. Al estirarlos, dispara.'],
  splank: ['1. De lado sobre el antebrazo, cadera arriba y cuerpo recto.', '2. Cada pocos segundos aguantados, un disparo (si cae la cadera, vuelve a empezar).'],
  superman: ['1. Boca abajo con los brazos estirados: sube el tronco y las piernas.', '2. Aguanta arriba los segundos que pidas: dispara solo al más cercano.'],
  pushup: ['1. En plancha, baja el pecho casi al suelo: carga.', '2. Aguanta abajo: ×2, ×3 y ×4. Al subir, dispara.'],
  plank1: ['1. En plancha, levanta un brazo: dispara a ese lado.', '2. Una flexión aguantada abajo carga ×2, ×3 y ×4 para el siguiente.'],
  inchworm: ['1. Camina con las manos hasta que la cabeza llegue a la línea: carga.', '2. Cada flexión allí, más fuerza. Vuelve y ponte de pie: la onda.'],
};

/** Cómo colocarse antes de empezar (los de suelo y sentado: se espera a que estés quieto en la postura). */
export const PLACE: Record<string, string> = {
  dips: 'Siéntate en el borde de la silla, manos detrás',
  splank: 'Ponte en plancha lateral',
  superman: 'Túmbate boca abajo, brazos estirados',
  pushup: 'Ponte en plancha, mirando al suelo',
  plank1: 'Ponte en plancha, mirando al suelo',
  inchworm: 'De pie, quieto: ahí empieza el inchworm',
};

/** Lo que dice el aviso del centro mientras te colocas (RepArena: drawCenter, 'calib'), en dos líneas. */
export const CALIB_LINES: Record<string, [string, string]> = {
  inchworm: ['De pie, mirando al frente, con sitio', 'delante para la plancha. Quieto 2 s.'],
  twist: ['Sujeta la barra flexible delante del', 'pecho, con las dos manos a la vista. 2 s.'],
  squat: ['De pie, mirando al frente, pies a la', 'anchura de los hombros. Quieto 2 s.'],
  pushup: ['Ponte en plancha: brazos estirados,', 'cuerpo recto. Quieto 2 s.'],
  pike: ['En pica: manos y pies en el suelo,', 'cadera alta, brazos estirados. 2 s.'],
  plank1: ['Ponte en plancha sobre las dos manos,', 'cuerpo recto. Quieto 2 s.'],
  superman: ['Túmbate boca abajo con los brazos', 'estirados hacia delante. Quieto 2 s.'],
  curl: ['De pie, con las mancuernas y los', 'brazos estirados abajo. Quieto 2 s.'],
  jump: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'],
  lunge: ['De pie, pies juntos, con espacio', 'delante para dar el paso. Quieto 2 s.'],
  dips: ['En el borde de la silla, manos en el', 'asiento, brazos estirados. Quieto 2 s.'],
  press: ['De pie, mancuernas a la altura', 'de los hombros. Quieto 2 s.'],
  curl2: ['De pie, la barra (o la kettlebell) con las', 'dos manos y los brazos abajo. Quieto 2 s.'],
  press2: ['De pie, la barra (o la kettlebell) a la', 'altura de los hombros. Quieto 2 s.'],
  thruster: ['De pie, las pesas en los hombros', 'con las dos manos. Quieto 2 s.'],
  frontsq: ['De pie, las pesas en las manos', 'con los brazos abajo. Quieto 2 s.'],
  jsquat: ['De pie, mirando al frente, con', 'espacio para saltar. Quieto 2 s.'],
  swing: ['De pie, la kettlebell con las dos', 'manos y los brazos abajo. Quieto 2 s.'],
  chop: ['De pie, la kettlebell o el disco con', 'las dos manos ante el pecho. Quieto 2 s.'],
  dlrow: ['De pie, las pesas en las manos', 'con los brazos abajo. Quieto 2 s.'],
  splank: ['De lado sobre el antebrazo,', 'cuerpo recto, cadera arriba. Quieto 2 s.'],
  abs: ['Túmbate boca arriba, rodillas', 'dobladas, pies al frente. Quieto 2 s.'],
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
  dips: 'Baja doblando los codos',
  splank: 'Aguanta con la cadera arriba',
  superman: 'Sube el tronco y aguanta',
  pushup: 'Baja el pecho para cargar',
  plank1: 'Levanta un brazo para disparar',
  inchworm: 'Camina con las manos hasta la línea',
};
