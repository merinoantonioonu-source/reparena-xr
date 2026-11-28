/**
 * La chuleta del vuelo (pedido del usuario: «antes de empezar cada partida, una pantalla resumen de los movimientos, o en
 * la caricatura, que ahora es demasiado genérica», en la Travesía volando y en las formas del parapente): en vez de la
 * caricatura, junto al menú principal y mientras te preparas, cada gesto con lo que hace. Qué dice, `flyCardOf` (sin
 * IWSDK: se prueba en tests/unit/fly-card.test.ts); cómo se pinta, `flyCardDraw`.
 */
import { FB, FD, fitFont, rr } from './canvas-kit.js';

/** Lo que mira: el modo, el ejercicio y los ajustes del vuelo. */
export interface FlyCardIn {
  mode: string;
  exercise: string;
  /** «Volando (en plancha)», «Volando: sobre el mapa», «Vuelo: mando de altura» (0 media flexión, 1 posición, 2 aleteo) y
   * «Avance solo»; en Barras, «Remo invertido: parapente» ('' no, 'sky' el combate y lo demás, un mapa). */
  trekFly: boolean;
  flyMap: string;
  flyAlt: number;
  trekAuto: boolean;
  barPara: string;
}

/** Una chuleta: el título y sus filas (el gesto y lo que hace). */
export interface FlyCard {
  title: string;
  rows: [string, string][];
}

export function flyCardOf(I: FlyCardIn): FlyCard | null {
  if (I.mode === 'trek' && I.exercise === 'pushup' && I.trekFly) {
    if (I.flyMap)
      return {
        title: 'VOLAR SOBRE EL MAPA',
        rows: [
          ['Escórate a un lado', 'viras (como un ave)'],
          ['Brazos estirados', 'subes'],
          ['Media flexión', 'recto'],
          ['Más abajo', 'bajas · al suelo, picado'],
          ['Flexión explosiva', 'subida brusca'],
          ['Impulso adelante', 'una marcha más'],
          ['Echado atrás', 'frenas'],
        ],
      };
    const alt: [string, string][] =
      I.flyAlt === 1
        ? [['Brazos estirados', 'vuelas alto'], ['Baja el pecho', 'bajas (tanto como bajes)']]
        : I.flyAlt === 2
          ? [['Cada flexión', 'un aletazo: subes'], ['Abajo, quieto', 'picado']]
          : [['Brazos estirados', 'subes'], ['Media flexión', 'recto'], ['Pecho abajo', 'bajas']];
    return {
      title: 'VOLAR EN PLANCHA',
      rows: [
        ['Escórate a un lado', 'vas a ese lado'],
        ...alt,
        ['Cabeza adelante', 'aceleras · atrás, frenas'],
        ['Cadera arriba', 'frenas'],
        ['De canto', 'un giro (las grietas)'],
      ],
    };
  }
  if (I.mode === 'bars' && I.exercise === 'row' && I.barPara) {
    if (I.barPara === 'sky')
      return {
        title: 'COMBATE EN EL CIELO',
        rows: [
          ['Remo', 'disparo · subes'],
          ['Remo explosivo', 'subida brusca'],
          ['Aguanta arriba', 'carga · al bajar, onda'],
          ['Tira de un brazo', 'viras a ese lado'],
          ['Baja de golpe', 'picado'],
          ['Al rugir', 'cambia de rumbo'],
          ['Cruza un corazón', '+1 vida'],
        ],
      };
    return {
      title: 'PARAPENTE',
      rows: [
        ['Remo', 'subes'],
        ['Remo explosivo', 'acelerón'],
        ['Tira de un brazo', 'viras a ese lado'],
        ['Aguanta arriba', 'frenas'],
        ['Brazos estirados', 'bajas'],
        ['Cruza una térmica', 'subes sin remar'],
      ],
    };
  }
  return null;
}

/** La firma de una chuleta (para pintarla una sola vez). */
export const flyCardKey = (C: FlyCard): string => C.title + C.rows.map((r) => r.join('>')).join('|');

/** La pinta en un lienzo de W×H, como la caricatura (su fondo y su borde): el título arriba y una fila por gesto. */
export function flyCardDraw(c: CanvasRenderingContext2D, W: number, H: number, C: FlyCard): void {
  c.save();
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16112c');
  g.addColorStop(1, '#0b0818');
  c.fillStyle = g;
  rr(c, 0, 0, W, H, Math.round(H * 0.06));
  c.fill();
  c.lineWidth = Math.max(2, H * 0.008);
  c.strokeStyle = 'rgba(60,240,198,.55)';
  rr(c, 2, 2, W - 4, H - 4, Math.round(H * 0.06));
  c.stroke();
  const pad = W * 0.045, top = H * 0.17;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = '#ffd166';
  fitFont(c, C.title, W - pad * 2, Math.round(H * 0.1), `%px ${FD}`);
  c.fillText(C.title, W / 2, H * 0.09);
  const n = C.rows.length, rowH = (H - top - pad * 0.6) / n, mid = W * 0.5, fs = Math.round(Math.min(rowH * 0.62, H * 0.075));
  for (let i = 0; i < n; i++) {
    const [a, b] = C.rows[i], y = top + rowH * (i + 0.5);
    if (i % 2 === 0) {
      c.fillStyle = 'rgba(255,255,255,.05)';
      rr(c, pad * 0.5, y - rowH / 2 + 1, W - pad, rowH - 2, rowH * 0.25);
      c.fill();
    }
    c.textAlign = 'right';
    c.fillStyle = '#3cf0c6';
    fitFont(c, a, mid - pad - W * 0.03, fs, `700 %px ${FB}`);
    c.fillText(a, mid - W * 0.03, y);
    c.textAlign = 'center';
    c.fillStyle = '#8e86c0';
    c.font = `700 ${fs}px ${FB}`;
    c.fillText('→', mid, y);
    c.textAlign = 'left';
    c.fillStyle = '#eeeaff';
    fitFont(c, b, W - pad - mid - W * 0.03, fs, `500 %px ${FB}`);
    c.fillText(b, mid + W * 0.03, y);
  }
  c.restore();
}
