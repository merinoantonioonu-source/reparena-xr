// Spotify (de RepArena, src/65_music.js): el juego es también un reproductor de Spotify (Web Playback SDK). La página
// aparece como el dispositivo «RepArena (Quest)» y, al pulsar Play, la música se pasa ahí y suena en las gafas; lo demás
// (siguiente, volumen…) va por la Web API. Si el reproductor no puede arrancar (sin el permiso «streaming», sin Premium…),
// Play despierta otro reproductor tuyo. Inicio de sesión con Authorization Code + PKCE, sin servidor: hace falta Spotify
// Premium y una app propia en developer.spotify.com con esta página como Redirect URI.
// Sin IWSDK ni globales: lo de fuera (red, almacén, reloj, azar, página) llega en `SpotifyEnv`, así sirve en la página
// (antes de crear el mundo) y en el juego, y se prueba con un `fetch` falso. Los datos se guardan con las MISMAS claves y
// forma que RepArena (las dos versiones comparten el navegador). Los menús y la página los pinta quien lo use.

// (las mismas claves que RepArena)
export const SP_KEY = 'reparena3-spotify';
export const SP_PKCE = 'reparena3-spotify-pkce';
export const SP_SCOPES =
  'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read';
const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
export const PLAYER_NAME = 'RepArena (Quest)';
// Fundidos: la canción no se corta de golpe (ms al bajar y al subir; 0, sin fundido)
export const SP_FADE = { out: 2500, in: 1500 };

/** Una lista de Spotify (`mine: false`: de otro usuario, no se pueden leer sus canciones). */
export interface SpList {
  id: string;
  name: string;
  uri?: string;
  n?: number;
  mine?: boolean;
  liked?: boolean;
}
/** Una canción (`isrc`: para buscar su compás). */
export interface SpTrack {
  uri: string;
  name?: string;
  by?: string;
  isrc?: string;
}
/** Lo guardado en `reparena3-spotify` (la forma de RepArena; la página guarda ahí más cosas: favs, bf…). */
export interface SpotifyCfg {
  clientId?: string;
  access?: string;
  exp?: number;
  refresh?: string;
  scopes?: string;
  vol?: number;
  lists?: SpList[];
  picks?: SpTrack[];
  [k: string]: unknown;
}
export interface SpDevice {
  id?: string;
  name?: string;
  volume_percent?: number;
  supports_volume?: boolean;
  is_active?: boolean;
  [k: string]: unknown;
}
/** Lo que devuelve GET /me/player. */
export interface SpState {
  is_playing?: boolean;
  device?: SpDevice;
  item?: { id?: string; uri?: string; name?: string; artists?: { name: string }[]; show?: { name: string }; [k: string]: unknown } | null;
  [k: string]: unknown;
}
/** El reproductor del SDK (lo que se usa de él). */
export interface SpSdkPlayer {
  addListener(ev: string, fn: (a: any) => void): unknown;
  connect(): unknown;
  setVolume?(v: number): unknown;
  activateElement?(): unknown;
}
export interface SpSdk {
  Player: new (o: { name: string; volume: number; getOAuthToken: (cb: (t: string) => void) => void }) => SpSdkPlayer;
}
/** El reproductor de la página. state: '' (sin arrancar), 'loading', 'ready', 'error'. */
export interface SpPlayer {
  player: SpSdkPlayer | null;
  id: string;
  state: '' | 'loading' | 'ready' | 'error';
  err: string;
}
export interface SpResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}
export interface SpRequest {
  method: string;
  headers: Record<string, string>;
  body?: string | URLSearchParams;
}
type SpErr = Error & { status?: number };

/** Lo de fuera. En la página: `fetch`, `store` de src/core/settings.ts, `window.location`, `Date.now`… */
export interface SpotifyEnv {
  fetch(url: string, init: SpRequest): Promise<SpResponse>;
  /** Como `store` de src/core/settings.ts: sin valor, lee; con valor, guarda (JSON). */
  store(k: string, v?: unknown): unknown;
  /** La dirección de la página (se lee cada vez: `search` trae la vuelta de Spotify). */
  location: { readonly origin: string; readonly pathname: string; readonly search: string };
  /** Ir a otra página (la de permisos de Spotify). */
  assign(url: string): void;
  /** Cambiar la dirección sin recargar (quitar el ?code=… de la vuelta). */
  replaceUrl(url: string): void;
  /** Hora en ms (como Date.now: caducidad del token). */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  random(): number;
  crypto: {
    getRandomValues<T extends Uint8Array>(a: T): T;
    subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> };
  };
  /** Carga el script del SDK y llama a `ready` con `window.Spotify` cuando esté (si falla, la promesa se rechaza). Sin
   * él (o sin documento), no hay reproductor en la página. */
  loadScript?(url: string, ready: (sdk: SpSdk) => void): Promise<void>;
  /** El aviso de la página (spStatus). */
  status?(text: string, bad?: boolean): void;
  /** Ha cambiado lo que se enseña (spMenuSync + spPage de RepArena). */
  onChange?(): void;
  /** Tras leer el estado (spAutoTempo: el compás de la canción). */
  onRefresh?(): void;
  /** Suena o deja de sonar Spotify (el ambiente se pone a 0 %: AUDM.music + applyVolume). */
  onMusic?(on: boolean): void;
  /** Si está abierto un menú con la música (se pregunta a Spotify cada 5 s en vez de cada 8). */
  menuOpen?(): boolean;
  /** La canción que se escuchaba desde la página ha acabado o se ha parado (spPrevRefresh). */
  onPreviewEnd?(): void;
}

/** «Canciones que te gustan»: se eligen como una lista más. */
export const SP_LIKED: SpList = { id: 'liked', name: '♥ Canciones que te gustan', liked: true };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const mkErr = (m: string, status?: number): SpErr => Object.assign(new Error(m), status === undefined ? {} : { status });

/** El texto de un error para el jugador (los mismos de RepArena). */
export function errText(e: unknown): string {
  const m = String((e && (e as Error).message) || e);
  if (m === 'NO_DEVICE') return 'Abre Spotify en las Quest o el móvil y pon algo a sonar';
  if (m === 'LIBRARY') return 'Vuelve a pulsar Conectar con Spotify (en la página): hace falta permiso para ver tus canciones que te gustan';
  if (m === 'NOT_YOURS') return 'Spotify solo deja ver las canciones de tus listas (o de las colaborativas): esta puedes ponerla entera';
  if (m === 'LOGIN' || /invalid_grant|refresh token/i.test(m)) return 'Vuelve a conectar Spotify en la página';
  if (/premium/i.test(m)) return 'Hace falta Spotify Premium';
  if (/fetch|network/i.test(m)) return 'Sin conexión con Spotify';
  return 'Spotify: ' + m;
}

export class Spotify {
  cfg: SpotifyCfg;
  /** Lo último que dijo Spotify del reproductor (null: sin leer o sin reproductor). */
  st: SpState | null = null;
  err = '';
  busy = false;
  /** Segundos hasta volver a preguntar a Spotify. */
  pollT = 0;
  lastRef = 0;
  /** Tus listas (las tuyas y las que sigues), al pedirlas (`myLists`). */
  mine: SpList[] | null = null;
  /** Ya ha sonado lo tuyo una vez (luego Play reanuda). */
  started = false;
  /** La música del bloque que suena (sus uris) y lo pedido a la cola de la ronda. */
  block: string | null = null;
  want: string | null = null;
  resume = false;
  meId: string | null | undefined = undefined;
  /** Las canciones de cada lista ya leídas. */
  trk: Record<string, SpTrack[]> = {};
  /** La canción que se escucha desde la página (▶) y cuándo se puso. */
  prev: string | null = null;
  prevT = 0;
  /** La canción cuyo compás ya se buscó (lo lleva el compás: src/services/bpm.ts). */
  tempoId: string | null = null;
  /** Si suena Spotify (el ambiente, callado). */
  music = false;
  /** El volumen que lleva el juego (vol) y cuándo se cambió (volT). */
  vol = 0;
  volT = 0;
  readonly player: SpPlayer = { player: null, id: '', state: '', err: '' };
  private volTimer: unknown = null;
  private fadeN = 0;
  private roundQ: Promise<void> = Promise.resolve();

  constructor(private env: SpotifyEnv) {
    this.cfg = (env.store(SP_KEY) as SpotifyCfg) || {};
  }

  /* ---------- Lo básico ---------- */
  redirect(): string {
    const l = this.env.location;
    return l.origin + l.pathname.replace(/index\.html$/, '');
  }
  connected(): boolean {
    return !!this.cfg.refresh;
  }
  playing(): boolean {
    return !!(this.st && this.st.is_playing);
  }
  save(): void {
    this.env.store(SP_KEY, this.cfg);
  }
  private status(text: string, bad?: boolean): void {
    this.env.status?.(text, bad);
  }
  private changed(): void {
    this.env.onChange?.();
  }
  /** El Client ID de tu app (lo escribe el jugador en la página). */
  setClientId(id: string): void {
    this.cfg.clientId = id.trim();
    this.save();
  }
  /** Desconectar: se olvida todo menos el Client ID. */
  disconnect(): void {
    this.cfg = { clientId: this.cfg.clientId };
    this.st = null;
    this.err = '';
    this.save();
    this.status('Desconectado.');
    this.changed();
  }

  /* ---------- Inicio de sesión ---------- */
  /** Va a la página de permisos de Spotify (si falla el cifrado, la promesa se rechaza: «No se pudo abrir Spotify»). */
  async connect(): Promise<void> {
    const id = (this.cfg.clientId || '').trim();
    if (!id) {
      this.status('Escribe primero el Client ID de tu app de Spotify.', true);
      return;
    }
    const c = this.env.crypto;
    const verifier = b64url(c.getRandomValues(new Uint8Array(48))),
      st = b64url(c.getRandomValues(new Uint8Array(12)));
    const challenge = b64url(new Uint8Array(await c.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    this.env.store(SP_PKCE, { verifier, state: st });
    const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: this.redirect(), code_challenge_method: 'S256', code_challenge: challenge, scope: SP_SCOPES, state: st });
    this.env.assign('https://accounts.spotify.com/authorize?' + q);
  }
  private async tokenReq(body: Record<string, string>): Promise<void> {
    const r = await this.env.fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // (el permiso ya no vale: hay que volver a conectar)
      if (body.grant_type === 'refresh_token' && j.error === 'invalid_grant') {
        delete this.cfg.refresh;
        this.save();
      }
      throw new Error(j.error_description || j.error || 'HTTP ' + r.status);
    }
    this.cfg.access = j.access_token;
    this.cfg.exp = this.env.now() + (j.expires_in || 3600) * 1000;
    if (j.refresh_token) this.cfg.refresh = j.refresh_token;
    if (j.scope) this.cfg.scopes = j.scope;
    this.save();
  }
  /** La vuelta desde Spotify con ?code=… (o ?error=…): pide el token. */
  async handleRedirect(): Promise<void> {
    const q = new URLSearchParams(this.env.location.search || '');
    if (!q.has('code') && !q.has('error')) return;
    const pk = (this.env.store(SP_PKCE) as { verifier?: string; state?: string }) || {};
    this.env.store(SP_PKCE, {});
    this.env.replaceUrl(this.redirect());
    if (q.get('error')) {
      this.status('Spotify no dio permiso (' + q.get('error') + ').', true);
      return;
    }
    if (!pk.verifier || q.get('state') !== pk.state) {
      this.status('La respuesta de Spotify no coincide. Vuelve a pulsar Conectar.', true);
      return;
    }
    try {
      await this.tokenReq({ grant_type: 'authorization_code', code: q.get('code') as string, redirect_uri: this.redirect(), client_id: this.cfg.clientId as string, code_verifier: pk.verifier });
      this.status('Conectado. La música sonará en estas gafas (o el navegador) al pulsar Play.');
      this.changed();
      void this.refresh();
      this.playerInit();
    } catch (e) {
      this.status('No se pudo conectar: ' + (e as Error).message, true);
    }
  }
  /** El token de acceso (lo renueva si le queda menos de un minuto). Sin conectar: error LOGIN. */
  async token(): Promise<string> {
    if (this.cfg.access && this.env.now() < (this.cfg.exp || 0) - 60000) return this.cfg.access;
    if (!this.cfg.refresh) throw new Error('LOGIN');
    await this.tokenReq({ grant_type: 'refresh_token', refresh_token: this.cfg.refresh, client_id: this.cfg.clientId as string });
    return this.cfg.access as string;
  }
  /** Una petición a la Web API. Un 401 renueva el token y reintenta una vez; sin reproductor (404 o NO_ACTIVE_DEVICE),
   * error NO_DEVICE; 202/204, null. */
  async api<T = any>(method: string, path: string, body?: unknown, retry = true): Promise<T | null> {
    const url = API + path;
    const headers: Record<string, string> = { Authorization: 'Bearer ' + (await this.token()) };
    if (body) headers['Content-Type'] = 'application/json';
    const r = await this.env.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && retry) {
      this.cfg.exp = 0;
      return this.api<T>(method, path, body, false);
    }
    if (r.status === 202 || r.status === 204) return null;
    const txt = await r.text();
    let j: any = null;
    try {
      j = txt ? JSON.parse(txt) : null;
    } catch {
      j = null;
    }
    if (!r.ok) throw mkErr(r.status === 404 || (j && j.error && j.error.reason === 'NO_ACTIVE_DEVICE') ? 'NO_DEVICE' : (j && j.error && j.error.message) || 'HTTP ' + r.status, r.status);
    return j as T;
  }

  /* ---------- Mandos ---------- */
  /** Lee el estado del reproductor. */
  async refresh(): Promise<void> {
    if (!this.connected()) return;
    this.lastRef = this.env.now();
    // sin reproductor (204) se mantiene el aviso de abrir Spotify: si no, se borraba medio segundo después de pulsar Play
    try {
      this.st = await this.api<SpState>('GET', '/me/player');
      if (this.st || this.err !== errText(new Error('NO_DEVICE'))) this.err = '';
    } catch (e) {
      this.err = errText(e);
    }
    this.changed();
    this.env.onRefresh?.();
  }
  /** Una orden (una a la vez): el error, al aviso; luego se vuelve a leer el estado. */
  async act(fn: () => Promise<unknown>): Promise<void> {
    if (this.busy || !this.connected()) return;
    this.busy = true;
    try {
      await fn();
      this.err = '';
    } catch (e) {
      this.err = errText(e);
    } finally {
      this.busy = false;
    }
    this.changed();
    this.env.setTimeout(() => void this.refresh(), 500); // Spotify tarda un momento en reflejar el cambio
  }

  /* ---------- Reproductor en la propia página: la música suena en las gafas ---------- */
  hereOk(): boolean {
    return this.player.state === 'ready' && !!this.player.id;
  }
  hereNow(): boolean {
    return this.hereOk() && !!(this.st && this.st.device && this.st.device.id === this.player.id);
  }
  /** Arranca el reproductor de la página (una vez, ya conectado). */
  playerInit(): void {
    const P = this.player,
      load = this.env.loadScript;
    if (P.state || !this.connected() || !load) return;
    P.state = 'loading';
    const fail = (msg: string) => {
      P.state = 'error';
      P.err = msg;
      this.changed();
    };
    const ready = (sdk: SpSdk) => {
      const vol = this.cfg.vol;
      const p = new sdk.Player({
        name: PLAYER_NAME,
        volume: vol != null ? vol / 100 : 0.8,
        getOAuthToken: (cb) => {
          this.token().then(cb).catch(() => {});
        },
      });
      p.addListener('ready', ({ device_id }: { device_id: string }) => {
        P.id = device_id;
        P.state = 'ready';
        P.err = '';
        if (this.cfg.vol != null && p.setVolume) Promise.resolve(p.setVolume(this.cfg.vol / 100)).catch(() => {});
        this.changed();
      });
      p.addListener('not_ready', () => {
        P.state = 'loading';
      });
      p.addListener('authentication_error', () => fail('Para que suene en las gafas, vuelve a conectar Spotify en la página (hace falta un permiso nuevo)'));
      p.addListener('account_error', () => fail('Para que suene en las gafas hace falta Spotify Premium'));
      p.addListener('initialization_error', () => fail('Este navegador no puede reproducir Spotify: sonará en otro reproductor tuyo'));
      p.addListener('playback_error', () => {});
      p.addListener('player_state_changed', (s: any) => {
        const cur = s && s.track_window && s.track_window.current_track;
        // (la que escuchabas desde la página acabó o se paró)
        if (this.prev && this.env.now() - (this.prevT || 0) > 1500 && (!s || s.paused || !cur || cur.uri !== this.prev)) {
          this.prev = null;
          this.env.onPreviewEnd?.();
        }
        if (s && this.st && this.hereNow()) this.st.is_playing = !s.paused;
        // (canción nueva: se pregunta pronto, para su compás)
        if (cur && cur.id !== this.tempoId) this.pollT = Math.min(this.pollT, 0.5);
      });
      P.player = p;
      p.connect();
    };
    load(SDK_URL, ready).catch(() => fail('No se pudo cargar el reproductor de Spotify'));
  }
  /** Los navegadores solo dejan sonar audio tras un gesto del usuario: se «despierta» al entrar en las gafas. */
  playerUnlock(): void {
    try {
      this.player.player?.activateElement?.();
    } catch {
      /* da igual */
    }
  }
  /** Pasa la música al reproductor de las gafas (y que suene). */
  async toHere(): Promise<void> {
    await this.api('PUT', '/me/player', { device_ids: [this.player.id], play: true });
    if (this.st) {
      this.st.is_playing = true;
      this.st.device = Object.assign({}, this.st.device, { id: this.player.id, name: PLAYER_NAME });
    }
  }
  /** Sin reproductor activo: las gafas si están listas; si no, el primero disponible. */
  async wake(): Promise<void> {
    if (this.hereOk()) {
      await this.toHere();
      return;
    }
    const d = await this.api<{ devices?: SpDevice[] }>('GET', '/me/player/devices'),
      list = (d && d.devices) || [];
    if (!list.length) throw new Error('NO_DEVICE');
    await this.api('PUT', '/me/player', { device_ids: [(list.find((x) => x.is_active) || list[0]).id], play: true });
  }

  /* ---------- Tus listas: las elegidas suenan al pulsar Play (varias, mezcladas) ---------- */
  lists(): SpList[] {
    return (this.cfg.lists || []).filter((l) => l && l.uri);
  }
  /** Tus canciones elegidas. */
  picks(): SpTrack[] {
    return (this.cfg.picks || []).filter((t) => t && t.uri);
  }
  /** Todas tus listas (las tuyas y las que sigues), de 50 en 50. Desde 2026, a las apps en modo desarrollo Spotify solo
   * les deja ver las canciones de las listas tuyas o colaborativas: las demás se marcan (mine: false). */
  async myLists(): Promise<SpList[]> {
    if (!this.meId) {
      try {
        const me = await this.api<{ id?: string }>('GET', '/me');
        this.meId = me && me.id;
      } catch {
        /* sin saberlo, se intenta con todas */
      }
    }
    const out: SpList[] = [];
    let url: string | null = '/me/playlists?limit=50';
    for (let i = 0; i < 6 && url; i++) {
      const j: any = await this.api('GET', url);
      ((j && j.items) || []).forEach((p: any) => {
        if (!p) return;
        const n = (p.items || p.tracks || {}).total,
          own = p.owner && p.owner.id;
        out.push({ id: p.id, name: p.name, uri: p.uri, n, mine: !this.meId || !own || own === this.meId || !!p.collaborative });
      });
      url = j && j.next ? j.next.replace(API, '') : null;
    }
    // las de otros usuarios no se enseñan (no se pueden elegir sus canciones): si estaban marcadas, dejan de estarlo
    const other = new Set(out.filter((l) => !l.mine).map((l) => l.id)),
      was = this.lists();
    if (was.some((l) => other.has(l.id))) {
      this.cfg.lists = was.filter((l) => !other.has(l.id));
      this.save();
    }
    return out;
  }
  ownLists(): SpList[] {
    return (this.mine || []).filter((l) => l.mine !== false);
  }
  /** Lo que se puede elegir: tus canciones que te gustan y tus listas (las tuyas y las colaborativas). */
  pickable(): SpList[] {
    return [SP_LIKED, ...this.ownLists()];
  }
  private shuffle(a: string[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(this.env.random() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
  }
  /** Reproduce esas listas en las gafas (o en el reproductor activo): una, tal cual y al azar; varias, sus canciones
   * mezcladas (como mucho 150). */
  async playLists(lists: SpList[] = this.lists()): Promise<void> {
    if (!lists.length) return;
    const dev = this.dev(),
      q = dev ? '?device_id=' + encodeURIComponent(dev) : '';
    if (lists.length === 1) await this.api('PUT', '/me/player/play' + q, { context_uri: lists[0].uri });
    else {
      let uris: string[] = [];
      for (const l of lists) {
        try {
          uris.push(...(await this.listTracks(l.id)).map((t) => t.uri));
        } catch (e) {
          if ((e as Error).message !== 'NOT_YOURS') throw e; // (las que no se pueden leer, fuera)
        }
      }
      this.shuffle(uris);
      uris = uris.slice(0, 150);
      await this.api('PUT', '/me/player/play' + q, uris.length ? { uris } : { context_uri: lists[0].uri }); // (si no se puede leer ninguna, la primera entera)
    }
    try {
      await this.api('PUT', '/me/player/shuffle?state=true' + (dev ? '&device_id=' + encodeURIComponent(dev) : ''));
    } catch {
      /* da igual */
    }
    this.started = true;
    if (this.st) this.st.is_playing = true;
  }
  /** Las canciones de una lista (hasta 300). Desde 2026 se piden en /items (cada entrada trae «item»; antes /tracks y
   * «track»: se aceptan las dos) y solo de listas tuyas o colaborativas: si no, NOT_YOURS; «liked», tu biblioteca. */
  async listTracks(id: string): Promise<SpTrack[]> {
    if (this.trk[id]) return this.trk[id];
    const out: SpTrack[] = [];
    let url: string | null = id === 'liked' ? '/me/tracks?limit=50' : `/playlists/${id}/items?limit=50`,
      legacy = false;
    for (let i = 0; i < 6 && url; i++) {
      let j: any;
      try {
        j = await this.api('GET', url);
      } catch (e) {
        const s = (e as SpErr).status;
        if (!i && !legacy && s === 404) {
          // (por si /items no existiera)
          legacy = true;
          url = `/playlists/${id}/tracks?limit=100`;
          i--;
          continue;
        }
        if (id === 'liked' && (s === 403 || s === 401)) throw new Error('LIBRARY');
        if (s === 403) {
          const l = (this.mine || []).find((x) => x.id === id);
          if (l) l.mine = false;
          throw new Error('NOT_YOURS');
        }
        throw e;
      }
      ((j && j.items) || []).forEach((x: any) => {
        const t = x && (x.item || x.track);
        if (t && t.uri && t.uri.startsWith('spotify:track:'))
          out.push({ uri: t.uri, name: t.name, by: (t.artists || []).map((a: { name: string }) => a.name).join(', '), isrc: (t.external_ids && t.external_ids.isrc) || '' });
      });
      url = j && j.next ? j.next.replace(API, '') : null;
    }
    return (this.trk[id] = out);
  }
  /** Dónde suena: las gafas si están listas; si no, el reproductor activo. */
  dev(): string | undefined {
    return this.hereOk() ? this.player.id : (this.st && this.st.device && this.st.device.id) || undefined;
  }
  q(dev = this.dev()): string {
    return dev ? '?device_id=' + encodeURIComponent(dev) : '';
  }
  /** Una lista entera (al azar o en orden) o desde una de sus canciones. */
  async playList(l: SpList, fromUri?: string, shuffle?: boolean): Promise<void> {
    const q = this.q();
    await this.api('PUT', '/me/player/play' + q, fromUri ? { context_uri: l.uri, offset: { uri: fromUri } } : { context_uri: l.uri });
    try {
      await this.api('PUT', '/me/player/shuffle?state=' + !!shuffle + (q ? '&' + q.slice(1) : ''));
    } catch {
      /* da igual */
    }
    this.started = true;
    this.block = null;
    if (this.st) this.st.is_playing = true;
  }
  /** Tus canciones elegidas o la música de un bloque: en un orden al azar distinto cada vez y en bucle (como mucho 100). */
  async playTracks(tracks: SpTrack[]): Promise<void> {
    const uris = tracks
      .map((t) => t.uri)
      .filter(Boolean)
      .slice(0, 100);
    if (!uris.length) return;
    this.shuffle(uris);
    const q = this.q();
    await this.api('PUT', '/me/player/play' + q, { uris });
    try {
      await this.api('PUT', '/me/player/shuffle?state=false' + (q ? '&' + q.slice(1) : ''));
      await this.api('PUT', '/me/player/repeat?state=context' + (q ? '&' + q.slice(1) : ''));
    } catch {
      /* da igual */
    }
    this.started = true;
    if (this.st) this.st.is_playing = true;
  }
  /** La música de un bloque de la sesión (o la de un ejercicio). Devuelve si tiene. Si el bloque anterior tenía la misma
   * y suena, sigue sin empezar de nuevo; si no, la que sonaba se va bajando y la del bloque entra subiendo. */
  blockMusic(b: { music?: SpTrack[] } | null | undefined): boolean {
    const tr = b && Array.isArray(b.music) ? b.music : [];
    if (!tr.length || !this.connected()) return false;
    const key = tr.map((t) => t.uri).join(',');
    if (this.block === key && this.playing()) return true;
    this.block = key;
    this.resume = false;
    this.want = 'block'; // (lo que quedara en cola de la ronda, ya no)
    void this.act(async () => {
      const v0 = this.volNow(),
        fade = SP_FADE.in > 0;
      if (this.playing()) await this.fadeOut(v0);
      else if (fade) await this.volTry(0);
      await this.playTracks(tr);
      await this.fadeIn(v0);
    });
    return true;
  }

  /* ---------- Fundidos ---------- */
  // En las gafas el volumen se cambia en su reproductor (suave, en 20 pasos); en otro dispositivo, por la Web API en
  // pocos pasos (cada uno es una petición). Si el reproductor no deja cambiar el volumen, sin fundido. El volumen elegido
  // (cfg.vol) no se toca: se vuelve a él
  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.env.setTimeout(r, ms));
  }
  canFade(): boolean {
    return this.connected() && !(this.st && this.st.device && this.st.device.supports_volume === false && !this.hereNow());
  }
  async volTry(v: number): Promise<void> {
    if (!this.canFade()) return;
    try {
      const p = this.player.player;
      if (this.hereNow() && p && p.setVolume) await p.setVolume(v / 100);
      else await this.api('PUT', '/me/player/volume?volume_percent=' + Math.round(v));
      if (this.st && this.st.device) this.st.device.volume_percent = Math.round(v);
    } catch {
      /* sin fundido */
    }
  }
  /** Un fundido nuevo deja a medias el anterior (nunca hay dos peleándose por el volumen); devuelve si llegó al final. */
  async fade(from: number, to: number, ms: number): Promise<boolean> {
    const id = (this.fadeN = this.fadeN + 1);
    if (!this.canFade() || !(ms > 0)) return true; // (0: sin fundido)
    const n = this.hereNow() && this.player.player && this.player.player.setVolume ? 20 : 5;
    for (let i = 1; i <= n; i++) {
      if (this.fadeN !== id) return false;
      await this.volTry(from + ((to - from) * i) / n);
      await this.wait(ms / n);
    }
    return this.fadeN === id;
  }
  fadeOut(v0: number, ms = SP_FADE.out): Promise<boolean> {
    return this.fade(v0, 0, ms);
  }
  fadeIn(v0: number, ms = SP_FADE.in): Promise<boolean> {
    return this.fade(0, v0, ms);
  }

  /* ---------- Play, pausa, siguiente… ---------- */
  toggle(): Promise<void> {
    return this.act(async () => {
      if (this.playing()) {
        await this.api('PUT', '/me/player/pause');
        (this.st as SpState).is_playing = false;
      } else if (this.picks().length && !this.started) {
        // la primera vez, tus canciones elegidas (al azar y en bucle)…
        await this.playTracks(this.picks());
        this.block = null;
      } else if (this.lists().length && !this.started) await this.playLists(); // …o tus listas; luego Play reanuda
      else if (this.hereOk() && !this.hereNow()) await this.toHere(); // en pausa en otro dispositivo: Play la trae a las gafas
      else if (this.st && this.st.device) {
        await this.api('PUT', '/me/player/play');
        this.st.is_playing = true;
      } else await this.wake();
    });
  }
  /** Al terminar la partida, Spotify se pausa (vuelve el ambiente); al empezar la siguiente, sigue lo que sonaba. Va en
   * su propia cola y vale la última: si acabas una partida mientras aún se reanudaba la música, se pausa igual. */
  roundQueue(want: 'play' | 'pause'): Promise<void> {
    this.want = want;
    return (this.roundQ = this.roundQ.then(async () => {
      if (this.want !== want || !this.connected()) return;
      // con fundido: al pausar, baja poco a poco (y, ya en pausa, vuelve a su volumen); al seguir, entra subiendo
      const v0 = this.volNow();
      try {
        const fade = SP_FADE.out > 0;
        if (want === 'pause') {
          const done = await this.fadeOut(v0);
          if (this.want !== want || !done) {
            if (done && fade) await this.volTry(v0);
            return;
          }
          await this.api('PUT', '/me/player/pause');
          if (fade) await this.volTry(v0);
        } else {
          if (SP_FADE.in > 0) await this.volTry(0);
          await this.api('PUT', '/me/player/play');
          await this.fadeIn(v0);
        }
        if (this.st) this.st.is_playing = want === 'play';
        this.err = '';
      } catch (e) {
        this.err = errText(e);
        await this.volTry(v0);
      }
      this.changed();
      this.env.setTimeout(() => void this.refresh(), 500);
    }));
  }
  /** Acaba la ronda: si sonaba, se pausa (con fundido) y se recuerda para la siguiente. */
  roundEnd(): void {
    this.resume = this.connected() && (this.playing() || this.want === 'play');
    if (!this.resume) return;
    if (this.st) this.st.is_playing = false;
    this.music = false;
    this.env.onMusic?.(false);
    void this.roundQueue('pause');
  }
  /** Empieza la ronda: sigue la música que sonaba al acabar la anterior. */
  roundStart(): void {
    if (!this.resume) return;
    this.resume = false;
    if (!this.connected() || (this.playing() && this.want !== 'pause')) return;
    void this.roundQueue('play');
  }
  next(): Promise<void> {
    return this.act(() => this.api('POST', '/me/player/next'));
  }
  previous(): Promise<void> {
    return this.act(() => this.api('POST', '/me/player/previous'));
  }
  // Volumen. El juego lleva la cuenta: Spotify tarda en reflejar los cambios (y al volver a leerlo devolvía el valor
  // viejo, así que el botón «no hacía nada»), y el reproductor de las gafas a menudo informa de un 0 que hacía que bajar
  // lo silenciara. En las gafas se cambia directamente en su reproductor; fuera, por la Web API (agrupando las
  // pulsaciones seguidas). Las pulsaciones nunca se pierden aunque haya otra orden en curso.
  volNow(): number {
    if (this.volT && this.env.now() - this.volT < 8000) return this.vol;
    const rep = this.st && this.st.device && this.st.device.volume_percent;
    if (this.hereNow() || !((rep as number) > 0)) return this.cfg.vol != null ? this.cfg.vol : (rep as number) > 0 ? (rep as number) : 60;
    return rep as number;
  }
  /** Sube o baja el volumen `d` puntos (de 5 en 5). */
  setVol(d: number): void {
    if (!this.connected()) return;
    const dev = this.st && this.st.device;
    if (dev && dev.supports_volume === false && !this.hereNow()) {
      this.err = 'Spotify: ese reproductor no deja cambiar el volumen desde fuera';
      this.changed();
      return;
    }
    const v = clamp(Math.round((this.volNow() + d) / 5) * 5, 0, 100);
    this.vol = v;
    this.volT = this.env.now();
    this.cfg.vol = v;
    this.save();
    if (dev) dev.volume_percent = v;
    this.err = '';
    this.changed();
    const p = this.player.player;
    if (this.hereNow() && p && p.setVolume) {
      Promise.resolve(p.setVolume(v / 100)).catch(() => {});
      return;
    }
    this.env.clearTimeout(this.volTimer);
    this.volTimer = this.env.setTimeout(() => {
      this.api('PUT', '/me/player/volume?volume_percent=' + this.vol).catch((e) => {
        this.err = errText(e);
        this.changed();
      });
    }, 250);
  }
  /** Cada fotograma (dt en s): calla el ambiente mientras suena y pregunta a Spotify cada 5 s con el menú de música
   * abierto; si no, cada 8 s (también para seguir el ritmo de cada canción). */
  tick(dt: number): void {
    const on = this.connected() && this.playing();
    if (on !== this.music) {
      this.music = on;
      this.env.onMusic?.(on);
    }
    if (!this.connected()) return;
    this.pollT -= dt;
    if (this.pollT <= 0) {
      this.pollT = this.env.menuOpen?.() ? 5 : 8;
      void this.refresh();
    }
  }
  /** Lo que suena, en una línea («Suena: canción — artista · vol. 60%»), o el error. */
  nowText(): string {
    if (!this.connected()) return '';
    if (this.err) return this.err;
    const it = this.st && this.st.item;
    if (!it) return this.st ? 'Spotify: no suena nada' : 'Spotify: buscando reproductor…';
    const who = it.artists ? it.artists.map((a) => a.name).join(', ') : it.show ? it.show.name : '';
    const vol = (this.st as SpState).device ? ` · vol. ${this.volNow()}%` : '';
    return `${this.playing() ? 'Suena' : 'En pausa'}: ${it.name}${who ? ' — ' + who : ''}${vol}`;
  }

  /** Escuchar una canción desde la página: la pone (en el reproductor de la página si está listo; si no, en tu
   * dispositivo activo) y, si ya sonaba, la para. Solo una a la vez. */
  async preview(uri: string): Promise<void> {
    if (!this.connected()) {
      this.status('Primero pulsa Conectar con Spotify.', true);
      return;
    }
    this.playerUnlock(); // (el navegador solo deja sonar tras un toque: este)
    try {
      if (this.prev === uri) {
        this.prev = null;
        this.env.onPreviewEnd?.();
        await this.api('PUT', '/me/player/pause' + this.q());
        return;
      }
      if (!this.hereOk() && this.player.state !== 'error') {
        // (el reproductor de la página tarda un poco en arrancar)
        this.playerInit();
        for (let i = 0; i < 12 && !this.hereOk() && (this.player.state as string) !== 'error'; i++) await this.wait(200);
      }
      let dev = this.hereOk() ? this.player.id : this.dev();
      if (!dev) {
        // (aún sin saber cuál: el activo o el primero)
        const d = await this.api<{ devices?: SpDevice[] }>('GET', '/me/player/devices'),
          L = (d && d.devices) || [];
        dev = (L.find((x) => x.is_active) || L[0] || ({} as SpDevice)).id;
      }
      if (!dev) throw new Error('NO_DEVICE');
      await this.api('PUT', '/me/player/play?device_id=' + encodeURIComponent(dev), { uris: [uri] });
      try {
        await this.api('PUT', '/me/player/repeat?state=off&device_id=' + encodeURIComponent(dev));
      } catch {
        /* da igual */
      }
      this.prev = uri;
      this.prevT = this.env.now();
      this.started = false;
      this.block = null; // (al jugar, Play vuelve a tus listas)
      this.env.onPreviewEnd?.();
      this.status(this.hereOk() ? 'Suena en esta página.' : 'Suena en tu dispositivo de Spotify (esta página no puede reproducir).');
    } catch (e) {
      this.prev = null;
      this.env.onPreviewEnd?.();
      this.status((e as Error).message === 'NO_DEVICE' ? 'No hay dónde sonar: abre Spotify en algún dispositivo (o usa un navegador que pueda reproducirlo).' : 'No se pudo poner: ' + errText(e), true);
    }
  }
}
