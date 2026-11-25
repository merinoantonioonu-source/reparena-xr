/**
 * El vigilante del ancla de la habitación (Barras, «en pruebas»). Con el ancla del mundo de IWSDK pedida al entrar, en las
 * Quest 3 del usuario la sesión de VR se cerraba sola al segundo (PR 127 → 130). Para poder probarla sin quedarse fuera del
 * juego: antes de cada paso arriesgado (pedir la sesión con anclas; crear o recuperar el ancla) se apunta en el navegador
 * que se va a dar, y se borra cuando la sesión lo ha aguantado. Si al volver a entrar el apunte sigue ahí, la sesión
 * murió en ese paso: el ancla se apaga sola y se dice en cuál fue.
 *
 * Lógica pura (sin IWSDK): la usa `room-anchor.ts`; pruebas en `tests/unit/anchor-guard.test.ts`.
 */
export const ANCHOR_TRY_KEY = 'reparenaxr-anchor-try';

/** Los pasos que se vigilan: entrar con las anclas pedidas y crear (o recuperar) el ancla. */
export type AnchorStage = 'entrar' | 'crear';

export interface TryStore {
  get(): string | null;
  set(v: string): void;
}

/** Lo que tarda en darse por bueno cada paso (s de sesión viva): las sesiones que morían duraban 2 s, con una sola imagen. */
export const ANCHOR_SAFE_T = 3;
/** Tras pedir el ancla, lo que se espera a tenerla antes de dar el paso por bueno sin ella (s). */
export const ANCHOR_MAKE_T = 6;

/** Antes de pedir la sesión: ¿se puede pedir el ancla? Si la última vez la sesión murió a medias, no (y en qué paso). */
export function anchorMayAsk(S: TryStore): { ok: boolean; stage: AnchorStage | '' } {
  const v = S.get() ?? '';
  if (!v.startsWith('risk:')) return { ok: true, stage: '' };
  const stage: AnchorStage = v.slice(5) === 'crear' ? 'crear' : 'entrar';
  S.set('off:' + stage);
  return { ok: false, stage };
}

/** Se va a dar un paso arriesgado. */
export function anchorRisk(S: TryStore, stage: AnchorStage): void {
  S.set('risk:' + stage);
}

/** La sesión ha aguantado el paso. */
export function anchorSafe(S: TryStore): void {
  S.set('ok');
}

/** Lo que se le dice al usuario cuando el ancla se apaga sola. */
export function anchorOffText(stage: AnchorStage | ''): string {
  return stage === 'crear'
    ? 'La última vez, la sesión de VR se cerró al crear el ancla de la habitación: «Barras: recordar el sitio en la habitación» se ha apagado sola.'
    : 'La última vez, la sesión de VR se cerró al entrar con el ancla de la habitación pedida: «Barras: recordar el sitio en la habitación» se ha apagado sola.';
}
