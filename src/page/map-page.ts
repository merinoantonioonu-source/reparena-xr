// En la página, «Volar sobre el mapa»: la clave de Cesium ion del jugador (src/modes/trek/map/map-key.ts). Nunca se enseña
// entera: solo si hay una puesta.
import { mapKey, setMapKey } from '../modes/trek/map/map-key.js';

export function mapPage(): void {
  const inp = document.getElementById('cesiumKey') as HTMLInputElement | null, st = document.getElementById('cesiumStatus');
  if (!inp || !st) return;
  const show = (): void => {
    const k = mapKey();
    st.textContent = k ? `Clave puesta (…${k.slice(-4)}). Ya puedes volar sobre el mapa.` : 'Sin clave: volando, la Travesía de siempre.';
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
}
