/**
 * Los servicios del juego, uno de cada (la página y el juego los comparten): pasar datos por código y la sincronización
 * (src/services/xfer.ts), con el navegador de verdad (`fetch`, `crypto`, el guardado, el reloj). La música, el tempo y el
 * pulso se suman aquí cuando llegan. Se crean la primera vez que se piden, para no gastar nada si no se usan.
 */
import { BEAT } from '../core/beat-hub.js';
import { setStoreHook, setSetting, store } from '../core/settings.js';
import { HOOKS } from '../core/state.js';
import { num } from '../core/values.js';
import { setMusicPlaying } from '../audio/sound.js';
import { Bpm, browserJsonp } from './bpm.js';
import { Spotify, type SpotifyEnv, type SpState } from './spotify.js';
import { Sync, Xfer, type XferEnv } from './xfer.js';

const xferEnv = (): XferEnv => ({
  fetch: (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<XferEnv['fetch']>,
  store: (k, v) => store(k, v),
  local: globalThis.localStorage,
  crypto: globalThis.crypto,
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  reload: () => location.reload(),
  inXR: () => !!(globalThis as { __xrOn?: boolean }).__xrOn,
  userAgent: () => (/Quest|OculusBrowser/i.test(navigator.userAgent) ? 'las gafas' : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'el móvil' : 'el ordenador'),
});

let X: Xfer | null = null, S: Sync | null = null;

/** Pasar datos por código (8 cifras). */
export function xfer(): Xfer {
  return (X ??= new Xfer(xferEnv()));
}
/** La sincronización con un código fijo (16 cifras). Al crearla, engancha el guardado: cada cambio apunta su hora. */
export function sync(): Sync {
  if (!S) {
    S = new Sync(xferEnv(), xfer());
    setStoreHook((k, old) => S?.touch(k, old));
    S.armReady(); // (lo guardado al arrancar no cuenta como cambio tuyo)
  }
  return S;
}

// ---------------------------------------------------------------- la música (Spotify) y su compás

/** Un aviso de la página («Conectado…»): lo pone la página al arrancar, y las gafas no lo necesitan. */
export const SPOTIFY_UI = { status: (_text: string, _bad?: boolean): void => {}, changed: (): void => {} };

let SPO: Spotify | null = null, BP: Bpm | null = null;

const spotifyEnv = (): SpotifyEnv => ({
  fetch: (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<SpotifyEnv['fetch']>,
  store: (k, v) => store(k, v),
  location: globalThis.location,
  assign: (url) => location.assign(url),
  replaceUrl: (url) => history.replaceState(null, '', url),
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  random: Math.random,
  crypto: globalThis.crypto as unknown as SpotifyEnv['crypto'],
  // el script del reproductor de Spotify (Web Playback SDK): sale en la página y suena en las gafas
  loadScript: (url, ready) =>
    new Promise<void>((ok, bad) => {
      (globalThis as { onSpotifyWebPlaybackSDKReady?: () => void }).onSpotifyWebPlaybackSDKReady = () => ready((globalThis as unknown as { Spotify: Parameters<typeof ready>[0] }).Spotify);
      const sc = document.createElement('script');
      sc.src = url;
      sc.async = true;
      sc.onload = () => ok();
      sc.onerror = () => bad(new Error('no se pudo cargar el reproductor'));
      document.head.appendChild(sc);
    }),
  status: (t, bad) => SPOTIFY_UI.status(t, bad),
  onChange: () => {
    SPOTIFY_UI.changed();
    HOOKS.spChanged();
  },
  onRefresh: () => void bpm().autoTempo(), // (cambia la canción: su compás)
  onMusic: (on) => setMusicPlaying(on), // (mientras suena Spotify, el ambiente se calla)
  menuOpen: () => HOOKS.screenOn(),
});

/** La música (Spotify): la conexión, las listas, el reproductor y los mandos. */
export function spotify(): Spotify {
  return (SPO ??= new Spotify(spotifyEnv()));
}

/** El compás de lo que suena (Deezer, ReccoBeats…) y el tempo de cada canción; engancha el pulso del juego. */
export function bpm(): Bpm {
  if (!BP) {
    const sp = spotify();
    BP = new Bpm({
      cfg: () => sp.cfg as never,
      save: () => sp.save(),
      api: (method, path) => sp.api(method, path),
      jsonp: (url, ms) => browserJsonp(url, ms),
      fetch: (url, init) => fetch(url, init as RequestInit) as never,
      now: () => Date.now(),
      perfNow: () => performance.now() / 1000,
      track: () => ((sp.st as SpState | null)?.item as never) ?? null,
      progressMs: () => Number((sp.st as { progress_ms?: number } | null)?.progress_ms) || 0,
      bpm: () => num('bpm'),
      setSetting: (k, v) => setSetting(k, v),
      beat0: (t) => BEAT.sync(t),
      say: (t) => HOOKS.say(t, '#3cf0c6', 2, false),
      changed: () => HOOKS.spChanged(),
      found: () => HOOKS.spChanged(),
    });
  }
  return BP;
}
