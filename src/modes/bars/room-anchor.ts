/**
 * El ancla de la habitación de Barras, «en pruebas» («Barras: recordar el sitio en la habitación», apagado de serie).
 *
 * Es la de IWSDK (su `SceneUnderstandingSystem` y `XRAnchor`: un ancla persistente del mundo, la misma en todas las
 * sesiones), pero ya no va en `iwsdk.config.json`: puesta ahí, se pedía en todas las sesiones y se creaba en el primer
 * fotograma, y en las Quest 3 del usuario la sesión de VR se cerraba sola al segundo (PR 127 → 130). Aquí:
 *
 * - **Apagado, nada cambia**: ni se pide la característica `anchors` ni se registra el sistema de IWSDK.
 * - **Encendido**, se pide `anchors` (opcional) al entrar y el sistema de IWSDK se registra parado; `BarsSystem` lo echa a
 *   andar solo jugando a Barras y con la sesión ya asentada (así los demás modos no crean ningún ancla).
 * - **Vigilado** (`anchor-guard.ts`): si la sesión muere a medias de un paso, la próxima vez el ancla se apaga sola.
 * - **Apuntado**: cada paso (lo que concede el navegador, recuperar, crear, guardar) sale en el diagnóstico.
 */
import { SceneUnderstandingSystem, type World } from '@iwsdk/core';
import { diagEvent } from '../../core/diag.js';
import { guardReport } from '../../core/guard.js';
import { setSetting } from '../../core/settings.js';
import { on } from '../../core/values.js';
import { anchorMayAsk, anchorOffText, anchorRisk, anchorSafe, ANCHOR_TRY_KEY, type AnchorStage, type TryStore } from './anchor-guard.js';

/** Lo de esta sesión: si se pidió el ancla al entrar, si el navegador la concedió, el sistema de IWSDK y lo que contar al salir. */
export const ROOM = {
  asked: false,
  got: false,
  sys: null as { isPaused: boolean; play(): void; stop(): void } | null,
  note: '',
};

const TRY: TryStore = {
  get: () => {
    try {
      return localStorage.getItem(ANCHOR_TRY_KEY);
    } catch {
      return null;
    }
  },
  set: (v) => {
    try {
      localStorage.setItem(ANCHOR_TRY_KEY, v);
    } catch {
      /* sin almacenamiento, sin vigilante */
    }
  },
};

/** Se va a dar un paso arriesgado / la sesión lo ha aguantado (los llama BarsSystem). */
export const roomRisk = (stage: AnchorStage): void => anchorRisk(TRY, stage);
export const roomSafe = (): void => anchorSafe(TRY);

const msg = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 120);

/** Apunta en el diagnóstico cuándo empieza y cómo acaba una petición al navegador (una promesa). */
function traced<T>(what: string, p: Promise<T>): Promise<T> {
  diagEvent(`ancla: ${what}…`);
  return p.then(
    (v) => {
      diagEvent(`ancla: ${what}: hecho`);
      return v;
    },
    (e) => {
      diagEvent(`ancla: ${what}: no se pudo (${msg(e)})`);
      throw e;
    },
  );
}

type Proto = Record<string, unknown> & { _rxAnchor?: boolean };

/** Envuelve `name` del prototipo de la clase global `cls` (si existe) para apuntarla. */
function trace(cls: string, name: string, what: string): void {
  const P = (globalThis as unknown as Record<string, { prototype?: Proto } | undefined>)[cls]?.prototype;
  const f = P?.[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
  if (!P || typeof f !== 'function' || P['_rx_' + name]) return;
  P['_rx_' + name] = true;
  P[name] = function (this: unknown, ...a: unknown[]): Promise<unknown> {
    return traced(what, f.apply(this, a));
  };
}

/** El sistema de anclas de IWSDK, registrado la primera vez que hace falta, parado y protegido como los demás. */
function ensureSystem(world: World): void {
  if (!world.hasSystem(SceneUnderstandingSystem)) {
    world.registerSystem(SceneUnderstandingSystem, { priority: -1 });
    const s = world.getSystem(SceneUnderstandingSystem);
    if (s) {
      const up = s.update.bind(s);
      s.update = (delta: number, time: number): void => {
        try {
          up(delta, time);
        } catch (e) {
          guardReport('el ancla de la habitación (IWSDK)', e);
        }
      };
    }
  }
  ROOM.sys = world.getSystem(SceneUnderstandingSystem) ?? null;
  ROOM.sys?.stop();
}

/**
 * Con «Barras: recordar el sitio en la habitación», añade `anchors` a lo que pida IWSDK al entrar en las gafas (como el
 * seguimiento del cuerpo, `askBodyTracking`). Se llama una vez, al arrancar.
 */
export function askRoomAnchor(world: World): void {
  const xr = (navigator as Navigator & { xr?: XRSystem & { _rxAnchor?: boolean } }).xr;
  if (!xr || xr._rxAnchor) return;
  xr._rxAnchor = true;
  const orig = xr.requestSession.bind(xr);
  xr.requestSession = (mode: XRSessionMode, init?: XRSessionInit): Promise<XRSession> => {
    ROOM.asked = false;
    ROOM.got = false;
    ROOM.sys?.stop();
    if (mode === 'inline' || !on('barsAnchor')) return orig(mode, init);
    const may = anchorMayAsk(TRY);
    if (!may.ok) {
      // la última sesión murió con el ancla a medias: se apaga sola y se cuenta
      setSetting('barsAnchor', 0);
      ROOM.note = anchorOffText(may.stage);
      diagEvent(`ancla: apagada sola (la última sesión se cerró al ${may.stage === 'crear' ? 'crearla' : 'entrar con ella pedida'})`);
      return orig(mode, init);
    }
    try {
      ensureSystem(world);
      trace('XRSession', 'restorePersistentAnchor', 'recuperar la guardada');
      trace('XRFrame', 'createAnchor', 'crearla');
      trace('XRAnchor', 'requestPersistentHandle', 'guardarla para otras sesiones');
    } catch (e) {
      diagEvent(`ancla: no se pudo preparar (${msg(e)})`);
      return orig(mode, init);
    }
    ROOM.asked = true;
    ROOM.note = '';
    roomRisk('entrar');
    diagEvent('ancla: se pide con la sesión');
    return orig(mode, { ...init, optionalFeatures: [...(init?.optionalFeatures ?? []), 'anchors'] }).then(
      (s) => {
        ROOM.got = !!(s as XRSession & { enabledFeatures?: string[] }).enabledFeatures?.includes('anchors');
        diagEvent(ROOM.got ? 'ancla: el navegador la concede' : 'ancla: el navegador no la concede (los aparatos, como siempre)');
        return s;
      },
      (e) => {
        // (no se llegó a entrar: no fue una sesión que muriera)
        ROOM.asked = false;
        roomSafe();
        throw e;
      },
    );
  };
}
