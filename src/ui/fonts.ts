/**
 * Las letras de los paneles: Rubik para el texto y Bungee para los títulos y los números grandes, las mismas de
 * RepArena. La letra que trae IWSDK (Inter) no tiene tildes, eñes, ¿, ¡ ni ×: estas se generaron con todas
 * (public/fonts, ver su LEEME). Se ponen en cada panel al cargarlo; mientras, el panel no se enseña.
 */
import type { UIKitMLAsset } from '@iwsdk/core';

const fontUrl = (file: string): string => `${import.meta.env.BASE_URL}fonts/${file}`;

const FONT_FAMILIES = {
  rubik: { medium: fontUrl('rubik-500.json'), bold: fontUrl('rubik-700.json') },
  bungee: { normal: fontUrl('bungee-400.json') },
};

/**
 * Pone Rubik a todo el panel y Bungee a los elementos con la clase «display» (en el UIKitML no se pueden nombrar
 * letras que no sean de IWSDK: se cambian aquí).
 */
export function applyFonts(panel: UIKitMLAsset): void {
  panel.document.rootElement.setProperties({ fontFamilies: FONT_FAMILIES, fontFamily: 'rubik' });
  for (const el of panel.document.getElementsByClassName('display')) el.setProperties({ fontFamily: 'bungee' });
}
