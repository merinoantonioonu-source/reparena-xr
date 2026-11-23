/**
 * Los avisos, cortos (pedido del usuario: «tienen que ser menos verbosos en todos los ejercicios»). Los detectores dicen lo
 * mismo que en RepArena (lo comparan las pruebas de tests/compare): aquí, justo antes de enseñarlo, cada aviso largo que se
 * conoce se cambia por su versión corta (lo esencial: qué hacer, en dos a cuatro palabras). Lo que no está en la lista sale
 * tal cual. Lógica pura (sin IWSDK).
 */

const EXACT: Record<string, string> = {
  // los ejercicios (de pie, en el suelo y sentado)
  'Aguanta abajo en la flexión para cargar': 'Aguanta abajo para cargar',
  'Apoya bien la otra mano en el suelo': 'Apoya la otra mano',
  'Brazos estirados: la pesa, al frente': 'Brazos estirados al frente',
  'Camina con las manos hasta la línea del suelo': 'Manos hasta la línea',
  'Levanta más el brazo, a la altura del hombro': 'Brazo más alto',
  'Mira la barra: no veo tus dos manos': 'No veo tus manos',
  'Despega las manos del suelo': 'Despega las manos',
  'Sube hasta la altura de los hombros': 'Hasta los hombros',
  'Vuelve andando con las manos hasta la salida': 'Vuelve a la salida',
  '¡Cargado! Aguanta escurrida o gira al revés': '¡Cargado! Aguanta o gira',
  '¡Baja más la rodilla de atrás!': '¡Rodilla más abajo!',
  '¡Más abajo para cargar!': '¡Más abajo!',
  // Combate
  '¡Te lanza piedras! Apártate o párala con la mano': '¡Piedras! Apártate',
  '¡Un cofre! Salta para abrirlo: dentro, una mejora, una vida o puntos': '¡Cofre! Salta para abrirlo',
  'Elige una mejora para seguir': 'Elige una mejora',
  // la Travesía
  'Baja más: irás más deprisa': '¡Baja más!',
  '¡El cangrejo escupe! Aparta la cabeza': '¡Escupe! Aparta la cabeza',
  '¡Te ha escupido! Aparta la cabeza': '¡Aparta la cabeza!',
  '¡Bola de fuego! Un paso a un lado': '¡Fuego! Paso a un lado',
  '¡Te has quemado! Un paso a un lado cuando la lance': '¡Paso a un lado!',
  'Empieza con la pierna derecha delante': 'Pierna derecha delante',
  '¡Que se hunde! No te pares': '¡No te pares!',
  '¡Cabeza abajo en el túnel!': '¡Cabeza abajo!',
  '¡Abre los brazos en cruz para planear!': '¡Brazos en cruz!',
  '¡Un hueco! Salta al llegar al borde': '¡Hueco! Salta',
  '¡Túnel! Al suelo, en plancha': '¡Túnel! En plancha',
  '¡Un trampolín! Písalo con una sentadilla honda': '¡Trampolín! Baja hondo',
  '¡El camino se divide! Paso a la derecha: más difícil y más premios': '¡Desvío! Derecha: más premios',
  '¡Un barranco! Abre los brazos en cruz para planear': '¡Barranco! Brazos en cruz',
  '¡Está mareado! Sentadilla honda y salta encima': '¡Mareado! Supersalto',
  '¡Más hondo! Sentadilla honda y salta': '¡Más hondo y salta!',
  '¡Un barril sorpresa! Salta debajo y dale con la cabeza': '¡Barril! Salta debajo',
  '¡Una fruta dorada! Salta para cogerla': '¡Dorada! Salta',
  '¡Una seta! Sáltale encima cuando llegue': '¡Seta! Písala',
  '¡Una calavera botando! Sáltala': '¡Calavera! Sáltala',
  '¡Cornisa! Pégate a la pared, a la izquierda': '¡Cornisa! A la pared',
  '¡Islote que sube y baja! Salta cuando esté a ras': '¡Islote! Salta a ras',
  '¡Islote que se hunde! Crúzalo sin pararte': '¡Se hunde! No te pares',
  '¡Te ha mordido! Sáltale encima a la seta': '¡Pisa la seta!',
  '¡Agáchate bajo la viga!': '¡Agáchate!',
  '¡Agáchate bajo las ramas!': '¡Agáchate!',
  '¡Te ha dado con la espada! Agáchate': '¡Agáchate!',
  '¡Un tiburón pirata! Agáchate cuando tire el tajo': '¡Tiburón! Agáchate',
  '¡Salta al islote cuando esté a ras!': '¡Salta a ras!',
  '¡Has chocado con el islote! Salta cuando esté a ras': '¡Salta a ras!',
  '¡El islote estaba abajo! Salta cuando esté a ras': '¡Salta a ras!',
  '¡Te ha dado la bala! Salta la que rueda': '¡Salta la baja!',
  '¡Te ha dado la bala! Agáchate con la alta': '¡Agáchate con la alta!',
  '¡Salta la onda del cíclope!': '¡Salta la onda!',
};

/** Los que llevan un dato (el lado, la pierna, los centímetros…): su forma corta. */
const RULES: [RegExp, string][] = [
  [/^Ahora con la pierna (izquierda|derecha) delante$/, 'Pierna $1 delante'],
  [/^¡Cambia de pierna! Ahora, la (izquierda|derecha) delante$/, '¡Cambia! Pierna $1'],
  [/^Gira más las muñecas.*$/, 'Gira más las muñecas'],
  [/^Sube un poco más: .*$/, 'Sube un poco más'],
  [/^¡Un (?:cangrejo|esqueleto pirata) a la \w+! Apártate a la (\w+)$/, '¡Apártate a la $1!'],
  [/^¡Te ha (?:mordido|dado el esqueleto)! Apártate a la (\w+)$/, '¡Apártate a la $1!'],
  [/^¡Te han dado las rocas! Apártate a la (\w+)$/, '¡Apártate a la $1!'],
  [/^¡Te ha (?:picado|mordido)! Agáchate cuando baje en picado$/, '¡Agáchate!'],
  [/^¡(?:Una abeja|Un murciélago) en picado! Agáchate$/, '¡En picado! Agáchate'],
  [/^¡Un cíclope a la (\w+)!.*$/, '¡Cíclope! Salta su onda'],
  [/^¡Un demonio a la (\w+)!.*$/, '¡Fuego a la $1!'],
  [/^¡Viento! Inclínate a la (\w+) y aguanta$/, '¡Viento! Inclínate a la $1'],
  [/^¡Inclínate contra el viento, a la (\w+)!$/, '¡Inclínate a la $1!'],
  [/^¡Desprendimiento a la \w+! Apártate a la (\w+)$/, '¡Rocas! Apártate a la $1'],
  [/^¡Cañonazo desde el barco, a la \w+!$/, '¡Cañonazo!'],
  [/^Al final del tramo, un cofre.*$/, 'Al final, un cofre'],
  [/^¡(.+) te corta el paso! Esquiva lo que te lanza$/, '¡$1! Esquiva'],
];

/** El aviso, en corto (o tal cual, si no se conoce). */
export function shortMsg(text: string): string {
  const e = EXACT[text];
  if (e) return e;
  for (const [re, to] of RULES) if (re.test(text)) return text.replace(re, to);
  return text;
}
