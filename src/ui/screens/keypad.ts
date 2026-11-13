/**
 * El teclado de números de las gafas (RepArena: `openKeypad` con `code: true`): para escribir un código de 8 o 16 cifras con
 * los botones de la pantalla del menú. Cada cifra se pulsa; «Borrar» quita la última; «OK» da el código.
 */
import { HOOKS } from '../../core/state.js';
import type { Row as ScreenRow } from '../ra/menu-core.js';

export interface KeypadOpts {
  /** Qué se escribe («Código de 8 cifras»). */
  label: string;
  maxLen: number;
  /** Cómo se enseña lo escrito (con espacios cada cuatro). */
  fmt?: (digits: string) => string;
  onOK: (digits: string) => void;
  onCancel: () => void;
}

const group = (d: string, n = 4): string => d.replace(new RegExp(`(\\d{${n}})(?=\\d)`, 'gu'), '$1 ');

/** Abre el teclado (y se rehace con cada cifra). */
export function openKeypad(o: KeypadOpts, digits = ''): void {
  const again = (d: string): void => openKeypad(o, d);
  const key = (n: string) => ({ label: n, onPress: () => again((digits + n).slice(0, o.maxLen)) });
  const rows: ScreenRow[] = [
    { t: 'title', text: o.label.toUpperCase() },
    { t: 'title', text: digits ? (o.fmt ?? group)(digits) : '········', color: '#3cf0c6' },
    { t: 'btns', items: [key('1'), key('2'), key('3')] },
    { t: 'btns', items: [key('4'), key('5'), key('6')] },
    { t: 'btns', items: [key('7'), key('8'), key('9')] },
    { t: 'btns', items: [{ label: 'Borrar', onPress: () => again(digits.slice(0, -1)) }, key('0'), { label: 'OK', style: 'primary', onPress: () => (digits.length === o.maxLen ? o.onOK(digits) : again(digits)) }] },
    { t: 'btns', items: [{ label: 'Cancelar', onPress: o.onCancel }] },
  ];
  HOOKS.openScreen(rows, { title: '' });
}
