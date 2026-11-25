/**
 * El detalle del mapa (el vuelo sobre el mapa): qué nitidez se pide cerca y lejos. Lógica pura, con pruebas
 * (`tests/unit/map-detail.test.ts`); la aplica `MapSystem` a la librería (`errorTarget`, `errorFalloff`).
 *
 * El usuario veía los edificios «fundidos» mucho tiempo (unos 2 min) y luego bien. Su registro lo explicaba: mientras
 * había trozos esperando, la nitidez de **todo** el mapa se aflojaba (de 20 a 57 píxeles de error) y se iba afinando
 * según bajaba la cola, así que la ciudad se cargaba hasta tres veces, cada vez con más detalle, y lo de cerca no se veía
 * bien hasta el final. Ahora:
 *
 * - **Lo de cerca, a la nitidez elegida desde el primer momento** (los trozos se piden del más cercano al más lejano: lo
 *   de debajo de ti llega lo primero y ya con su detalle). Solo se afloja algo volando muy deprisa para tu altura (pasa
 *   tan rápido que no se aprecia, y así da tiempo a cargarlo).
 * - **Lo lejano, con menos detalle** (lo de serie de la librería, `errorFalloff`, como el «dynamicScreenSpaceError» de
 *   Cesium): de lejos y con calima no se nota, y son muchos menos trozos que bajar, procesar y pintar. Con mucha cola,
 *   algo menos todavía (solo lo lejano).
 */
export const DETAIL = {
  /** Lo que vale cada nivel de «nitidez» del ajuste, en píxeles de error (las gafas pintan 2.640 de alto por ojo). */
  errK: 2.5,
  /** Lo lejano pide hasta × esto de error (con mucha cola, hasta × `farMax`). */
  far: 2,
  farMax: 4,
  /** A partir de cuántos trozos esperando se afloja lo lejano, y cuántos más para llegar a `farMax`. */
  backlog0: 150,
  backlogK: 350,
  /** A qué distancia va el cambio de cerca a lejos: tantas veces tu altura (como poco, `fallMin` m). */
  fallAt: 12,
  fallMin: 2500,
  /** Volando deprisa para tu altura (velocidad / altura, 1/s), lo de cerca se afloja: desde `fast0`, hasta × (1 + `fastK`) en `fast1`. */
  fast0: 0.3,
  fast1: 1.2,
  fastK: 0.8,
} as const;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Lo que se afloja lo de cerca por ir deprisa (1 = nada). */
export function nearRelax(speed: number, agl: number): number {
  return 1 + DETAIL.fastK * clamp01((speed / Math.max(agl, 60) - DETAIL.fast0) / (DETAIL.fast1 - DETAIL.fast0));
}

/** Cuánto más error admite lo lejano que lo cercano, con `backlog` trozos esperando. */
export function farFactor(backlog: number): number {
  return DETAIL.far + (DETAIL.farMax - DETAIL.far) * clamp01((backlog - DETAIL.backlog0) / DETAIL.backlogK);
}

/** La distancia (m) a la que lo lejano ya pide casi todo su error de más (el 63 %). */
export function fallDist(agl: number): number {
  return Math.max(DETAIL.fallMin, DETAIL.fallAt * Math.max(0, agl));
}

/** El error (píxeles) que se admite a `dist` m: `near` cerca y hasta `near × far` lejos (la curva de la librería). */
export function errorAt(near: number, far: number, dist: number, agl: number): number {
  const f = dist / fallDist(agl);
  return near + near * (far - 1) * (1 - Math.exp(-f * f));
}
