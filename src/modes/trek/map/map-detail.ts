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

/**
 * La memoria del mapa. Con el detalle de «Alta» para todo lo que se ve, una ciudad como Nueva York pide más memoria de la
 * que se le reserva (el registro del usuario: 631 MB a los 18 s, «llena») y la librería, con su memoria llena, **se
 * bloquea**: no carga los trozos nuevos (los rechaza) y tampoco suelta los viejos, porque los da por «en uso» mientras no
 * lleguen los que los sustituyen. Desde ese momento no se cargaba nada más: huecos de cielo donde faltaba mapa, lo demás
 * sin afinarse y cambiar la nitidez no hacía nada.
 *
 * Así que la memoria no se llena nunca: su tope queda lejos (`hardMB`) y lo que se controla es **lo que se pide**. Un
 * solo número, el apretón (`q`, de 0 a 2), afloja el detalle cuando lo que está en uso pasa del presupuesto (`budgetMB`):
 * hasta 1, solo lo lejano (de × `far` a × `farMax`); de 1 a 2, también lo cercano (hasta × 2). Sube deprisa (pasarse es
 * lo peligroso) y baja despacio. Con pocas imágenes por segundo aprieta también, pero solo lo lejano.
 */
export const MEM = {
  /** Lo que se quiere tener en uso como mucho, lo que se guarda de lo ya visto (por si vuelves) y el tope de verdad (MB). */
  budgetMB: 540,
  keepMB: 560,
  hardMB: 950,
  /** Si aun así se llenara, el tope sube esto cada vez (hasta `ceilMB`): lleno, la librería no carga nada. */
  bumpMB: 100,
  ceilMB: 1300,
  /** Lo que sube el apretón por segundo con la memoria al doble del presupuesto, y lo que baja por segundo con holgura. */
  up: 1.6,
  down: 0.1,
  /** Por debajo de esta parte del presupuesto hay holgura (entre medias, se queda como está). */
  slack: 0.82,
  /** Las imágenes por segundo: por debajo de `fpsLow` aprieta lo lejano (esto por segundo); desde `fpsOk`, deja aflojar. */
  fpsLow: 30,
  fpsOk: 40,
  fpsUp: 0.08,
  /** Hasta dónde aprietan las imágenes por segundo (medio camino de lo lejano: lo demás, solo la memoria). */
  fpsMax: 0.5,
} as const;

/**
 * El apretón siguiente: `q` de ahora, lo que hay en uso (MB), las imágenes por segundo (0 = sin medir) y si se está
 * cargando (cargando, las imágenes por segundo bajan por la carga misma y no cuentan).
 */
export function squeezeStep(q: number, usedMB: number, fps: number, loading: boolean, dt: number, budgetMB: number = MEM.budgetMB): number {
  const p = usedMB / budgetMB;
  if (p > 1) q += MEM.up * (p - 1) * dt + 0.04 * dt;
  else if (fps > 0 && fps < MEM.fpsLow && !loading && q < MEM.fpsMax) q = Math.min(MEM.fpsMax, q + MEM.fpsUp * dt);
  else if (p < MEM.slack && (fps <= 0 || fps >= MEM.fpsOk || loading)) q -= MEM.down * Math.min(1, (MEM.slack - p) / 0.3) * dt; // (más despacio al acercarse al presupuesto: sin vaivén)
  return q < 0 ? 0 : q > 2 ? 2 : q;
}

/** Lo que el apretón afloja lo lejano (× el error de cerca) y lo cercano. */
export function squeezeFar(q: number): number {
  return DETAIL.far + (DETAIL.farMax - DETAIL.far) * clamp01(q);
}
export function squeezeNear(q: number): number {
  return 1 + clamp01(q - 1);
}
