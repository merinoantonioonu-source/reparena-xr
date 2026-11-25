// En la página, «Volar sobre el mapa»: la clave de Cesium ion del jugador (src/modes/trek/map/map-key.ts; nunca se enseña
// entera: solo si hay una puesta) y su lugar (unas coordenadas o un enlace de Google Maps: src/modes/trek/map/map-place.ts).
import { setSetting } from '../core/settings.js';
import { mapKey, mapLast, mapLogRead, mapPlace, setMapKey, setMapPlace } from '../modes/trek/map/map-key.js';
import { isShortLink, parsePlace, placeText } from '../modes/trek/map/map-place.js';

export function mapPage(): void {
  const inp = document.getElementById('cesiumKey') as HTMLInputElement | null, st = document.getElementById('cesiumStatus');
  if (!inp || !st) return;
  const show = (): void => {
    const k = mapKey();
    st.textContent = k ? `Clave puesta (…${k.slice(-4)}). Ya puedes volar sobre el mapa.` : 'Sin clave: volando, la Travesía de siempre.';
    // lo que le pasó al mapa las últimas veces (para saber por qué no carga)
    const L = mapLogRead();
    if (L.length) {
      const pre = document.createElement('pre');
      pre.className = 'note';
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = 'Lo último del mapa:\n' + L.map((l) => `${new Date(l.t).toLocaleTimeString('es-ES')} · ${l.text}`).join('\n');
      st.append(document.createElement('br'), pre);
    }
  };
  document.getElementById('btnCesiumSave')?.addEventListener('click', () => {
    const v = inp.value.trim();
    if (v.length < 20) {
      st.textContent = 'Esa clave parece incompleta: cópiala entera desde Cesium ion (Access Tokens).';
      return;
    }
    setMapKey(v);
    inp.value = '';
    show();
  });
  document.getElementById('btnCesiumClear')?.addEventListener('click', () => {
    setMapKey('');
    show();
  });
  show();
  // tu lugar: de dónde sales en «Tu lugar», y dónde acabó tu último vuelo
  const pin = document.getElementById('mapPlace') as HTMLInputElement | null, ps = document.getElementById('placeStatus');
  if (!pin || !ps) return;
  const showPlace = (): void => {
    const P = mapPlace(), L = mapLast();
    ps.textContent = (P ? `Tu lugar: ${placeText(P.lat, P.lon)}.` : 'Sin lugar puesto.') + (L ? ` Tu último vuelo acabó en ${placeText(L.lat, L.lon)}.` : '');
  };
  document.getElementById('btnPlaceSave')?.addEventListener('click', () => {
    const P = parsePlace(pin.value);
    if (!P) {
      ps.textContent = isShortLink(pin.value)
        ? 'Ese enlace corto no lleva las coordenadas: ábrelo y copia el enlace largo de la barra de direcciones, o las coordenadas del punto.'
        : 'No lo entiendo: pega unas coordenadas («40.4169, -3.7035») o un enlace largo de Google Maps.';
      return;
    }
    setMapPlace(P);
    setSetting('flyMap', 'place');
    pin.value = '';
    showPlace();
    ps.textContent += ' Elegido en «Volando: sobre el mapa».';
  });
  document.getElementById('btnPlaceClear')?.addEventListener('click', () => {
    setMapPlace(null);
    showPlace();
  });
  showPlace();
}
