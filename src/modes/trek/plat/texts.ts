/**
 * Los avisos de la Travesía según la forma en que se juega (de pie, en plancha o en zancada): los textos se escribieron
 * para jugar de pie y, en plancha, pedían «sentadilla honda», «brazos en cruz» o «un paso» (lo vio el usuario). Aquí, cada
 * aviso de lo que hiciste mal y de la pelea con el jefe dice lo que pide **esa** forma (en plancha, dos flexiones
 * explosivas para el supersalto, aguantar abajo para el barranco, escorarse para apartarse; en zancada, bajada honda e
 * inclinar el tronco). Lógica pura (sin IWSDK).
 */

/** La forma en que se juega la Travesía. */
export type TrekForm = 'stand' | 'prone' | 'lunge';

/** Lo que cambia en plancha: [lo de pie, lo de la plancha] (en orden: lo más largo primero). */
const PRONE: [RegExp, string][] = [
  [/¡Más hondo! Sentadilla honda y salta/, '¡Dos explosivas seguidas!'],
  [/¡Está mareado! Sentadilla honda y salta encima/, '¡Está mareado! Dos explosivas seguidas'],
  [/Cuando se maree: sentadilla honda y salta/, 'Cuando se maree: dos explosivas seguidas'],
  [/¡Sentadilla honda y salta!/, '¡Dos explosivas seguidas!'],
  [/¡Abre los brazos en cruz para planear!/, '¡Aguanta abajo en el barranco!'],
  [/¡Abre los brazos!/, '¡Aguanta abajo!'],
  [/Un paso a un lado/, 'Escórate a un lado'],
  [/un paso a un lado/, 'escórate a un lado'],
  [/¡Salta para subir!/, '¡Explosiva para subir!'],
  [/Abre los brazos en cruz para planear/, 'Aguanta abajo para cruzarlo'],
  [/Písalo con una sentadilla honda/, 'Dos explosivas al pisarlo'],
  [/Sentadilla honda y salta/, 'Dos explosivas seguidas'],
  [/sentadilla honda y salta/, 'dos explosivas seguidas'],
  [/con un paso/, 'escorándote'],
  [/^¡De pie!$/, '¡Arriba!'],
];

/** Lo que cambia en zancada. */
const LUNGE: [RegExp, string][] = [
  [/Sentadilla honda y salta/, 'Bajada honda y salta'],
  [/sentadilla honda y salta/, 'bajada honda y salta'],
  [/Un paso a un lado/, 'Inclínate a un lado'],
  [/un paso a un lado/, 'inclínate a un lado'],
  [/Písalo con una sentadilla honda/, 'Písalo con una bajada honda'],
  [/con un paso/, 'inclinando el tronco'],
];

/** El aviso `text`, dicho para la forma `form`. */
export function formText(text: string, form: TrekForm): string {
  if (form === 'stand') return text;
  const L = form === 'prone' ? PRONE : LUNGE;
  for (const [re, to] of L) if (re.test(text)) return text.replace(re, to);
  return text;
}
