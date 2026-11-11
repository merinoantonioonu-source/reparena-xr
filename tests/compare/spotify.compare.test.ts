// El servicio de Spotify portado (src/services/spotify.ts) frente al código original de RepArena (src/65_music.js): los
// dos, con el mismo Spotify falso (cuentas, tokens, reproductores, listas, errores 401/403/404/429/5xx, sin red), el
// mismo reloj, el mismo azar y el mismo reproductor del SDK falso, en escenarios variados (conectar con PKCE y la vuelta,
// tokens caducados, Play/pausa, listas, cola de la ronda con fundidos, bloques, volumen, sondeo, escuchar desde la
// página, desconectar…). Tras cada paso se compara todo: las peticiones (método, dirección, cuerpo, cabeceras), lo
// guardado, el estado, los avisos y el texto de lo que suena. (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Spotify, SP_FADE, SP_KEY, SP_PKCE, type SpSdk } from '../../src/services/spotify.js';
import { Mem, RA_DIR, raRun, raSlice } from './ra.js';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
};

/** Un reloj falso: la hora (ms) y los temporizadores. */
class Clock {
  t = 1_700_000_000_000;
  n = 0;
  q: { t: number; id: number; fn: () => void }[] = [];
  setTimeout = (fn: () => void, ms = 0) => {
    const id = ++this.n;
    this.q.push({ t: this.t + Math.max(0, +ms || 0), id, fn });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.q = this.q.filter((x) => x.id !== id);
  };
  /** Avanza ms, haciendo los temporizadores en orden (y lo que lancen). */
  async run(ms: number) {
    const end = this.t + ms;
    for (let guard = 0; guard < 100000; guard++) {
      await flush();
      this.q.sort((a, b) => a.t - b.t || a.id - b.id);
      const x = this.q[0];
      if (!x || x.t > end) break;
      this.q.shift();
      this.t = Math.max(this.t, x.t);
      x.fn();
    }
    this.t = end;
    await flush();
  }
}

/** Un Spotify falso: responde como la Web API y apunta lo que se le pide. */
class Server {
  reqs: string[] = [];
  valid = 'acc-0';
  issued = 0;
  refreshBad = false;
  player: Record<string, any> | null = null;
  devices: Record<string, unknown>[] = [];
  noLibrary = false;
  once: { m: string; status?: number; json?: unknown; text?: string; throw?: string }[] = [];
  constructor(private clock: Clock) {}
  fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: unknown }) => {
    const H = Object.keys(init.headers || {})
      .sort()
      .map((k) => k + '=' + init.headers[k])
      .join('&');
    const body = init.body == null ? '' : String(init.body);
    this.reqs.push(`${init.method} ${url} [${H}] ${body}`);
    const res = (status: number, json?: unknown, text?: string) => {
      const txt = text !== undefined ? text : json === undefined ? '' : JSON.stringify(json);
      return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(txt), text: async () => txt };
    };
    if (url === 'https://accounts.spotify.com/api/token') {
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'authorization_code' && p.get('code') !== 'good') return res(400, { error: 'invalid_grant', error_description: 'Invalid authorization code' });
      if (p.get('grant_type') === 'refresh_token' && this.refreshBad) return res(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' });
      this.valid = 'acc-' + ++this.issued;
      return res(200, { access_token: this.valid, expires_in: 3600, ...(p.get('grant_type') === 'authorization_code' ? { refresh_token: 'ref-1', scope: 'streaming' } : {}) });
    }
    const path = url.replace('https://api.spotify.com/v1', ''),
      key = init.method + ' ' + path;
    const o = this.once.findIndex((x) => key.startsWith(x.m));
    if (o >= 0) {
      const x = this.once.splice(o, 1)[0];
      if (x.throw) throw new TypeError(x.throw);
      return res(x.status as number, x.json, x.text);
    }
    if (init.headers.Authorization !== 'Bearer ' + this.valid) return res(401, { error: { status: 401, message: 'The access token expired' } });
    const pl = (id: string, own: string, n: number, collab = false) => ({ id, name: 'Lista ' + id, uri: 'spotify:playlist:' + id, owner: { id: own }, collaborative: collab, items: { total: n } });
    const tr = (k: string) => ({ item: { uri: 'spotify:track:' + k, name: 'Canción ' + k, artists: [{ name: 'A' + k }, { name: 'B' }], external_ids: { isrc: 'ISRC' + k } } });
    if (key === 'GET /me/player') return this.player ? res(200, this.player) : res(204);
    if (key === 'GET /me/player/devices') return res(200, { devices: this.devices });
    if (key === 'GET /me') return res(200, { id: 'yo' });
    if (key === 'GET /me/playlists?limit=50') return res(200, { items: [pl('a', 'yo', 3), pl('b', 'otro', 9), null, pl('c', 'otro', 2, true)], next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50' });
    if (key === 'GET /me/playlists?offset=50&limit=50') return res(200, { items: [{ ...pl('d', 'yo', 1), items: undefined, tracks: { total: 4 } }], next: null });
    if (path.startsWith('/me/tracks')) return this.noLibrary ? res(403, { error: { status: 403, message: 'Insufficient client scope' } }) : res(200, { items: [{ track: tr('l1').item }, tr('l2')], next: null });
    if (path.startsWith('/playlists/b/') || path.startsWith('/playlists/ajena/')) return res(403, { error: { status: 403, message: 'Forbidden' } });
    if (path.startsWith('/playlists/vieja/items')) return res(404, { error: { status: 404, message: 'Not found' } });
    if (path.startsWith('/playlists/vieja/tracks')) return res(200, { items: [{ track: tr('v1').item }, { track: { uri: 'spotify:episode:x', name: 'Episodio' } }], next: null });
    if (path === '/playlists/a/items?limit=50') return res(200, { items: [tr('a1'), tr('a2')], next: 'https://api.spotify.com/v1/playlists/a/items?offset=50&limit=50' });
    if (path === '/playlists/a/items?offset=50&limit=50') return res(200, { items: [tr('a3'), null], next: null });
    if (path.startsWith('/playlists/g')) return res(200, { items: Array.from({ length: 80 }, (_, i) => tr(path.split('/')[2] + '-' + i)), next: null });
    if (path.startsWith('/playlists/')) return res(200, { items: [tr(path.split('/')[2] + '1')], next: null });
    if (init.method === 'PUT' && path.startsWith('/me/player/pause') && this.player) this.player.is_playing = false;
    if (init.method === 'PUT' && path.startsWith('/me/player/play') && this.player) this.player.is_playing = true;
    return res(204);
  };
}

/** El reproductor del SDK, falso: apunta lo que se le pide y deja lanzar sus sucesos. */
class FakePlayer {
  static made: FakePlayer[] = [];
  on: Record<string, (a: unknown) => void> = {};
  log: string[] = [];
  constructor(public o: { name: string; volume: number; getOAuthToken: (cb: (t: string) => void) => void }) {
    this.log.push(`new ${o.name} ${o.volume}`);
  }
  addListener(ev: string, fn: (a: unknown) => void) {
    this.on[ev] = fn;
  }
  connect() {
    this.log.push('connect');
  }
  setVolume(v: number) {
    this.log.push('vol ' + Math.round(v * 1000) / 1000);
    return Promise.resolve();
  }
  activateElement() {
    this.log.push('activate');
  }
}

interface Opts {
  stored?: Record<string, unknown>;
  sdk?: boolean;
  sdkFail?: boolean;
  menu?: boolean;
}
interface Ad {
  call(name: string, ...a: unknown[]): unknown;
  set(k: string, v: unknown): void;
  get(k: string): any;
  fire(ev: string, a?: unknown): void;
  /** Los fundidos de los dos (en RepArena, su SP_FADE). */
  fades: typeof SP_FADE;
  srv: Server;
  clock: Clock;
  loc: { origin: string; pathname: string; search: string };
  mem: Mem;
  menu: { open: boolean };
  snap(): Record<string, unknown>;
}
const mkStore = (m: Mem) => (k: string, v?: unknown): unknown => {
  try {
    if (v === undefined) return JSON.parse(m.getItem(k) as string);
    m.setItem(k, JSON.stringify(v));
  } catch {
    return null;
  }
  return null;
};
const mkCrypto = (r: () => number) => ({
  getRandomValues: <T extends Uint8Array>(a: T) => {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(r() * 256);
    return a;
  },
  // (el SHA-256 de node, al momento: el de WebCrypto tarda un tiempo real que el reloj falso no espera)
  subtle: { digest: async (_alg: string, d: Uint8Array) => { const h = createHash('sha256').update(d).digest(); return h.buffer.slice(h.byteOffset, h.byteOffset + h.length) as ArrayBuffer; } },
});

// lo común de los dos lados: reloj, servidor, almacén, registros
function base(o: Opts) {
  const clock = new Clock(),
    srv = new Server(clock),
    mem = new Mem(),
    r = rng(7);
  for (const [k, v] of Object.entries(o.stored || {})) mem.setItem(k, JSON.stringify(v));
  const loc = { origin: 'https://ra.example', pathname: '/reparena/index.html', search: '' };
  const L = { status: [] as string[], music: [] as string[], nav: [] as string[], refresh: 0, prevEnd: 0, results: [] as string[], players: [] as FakePlayer[] };
  const menu = { open: !!o.menu };
  const loadScript = (url: string, ready: (sdk: SpSdk) => void) =>
    new Promise<void>((res, rej) => {
      L.nav.push('script ' + url);
      clock.setTimeout(() => {
        if (o.sdkFail) return rej(new Error('carga'));
        ready({ Player: class extends FakePlayer { constructor(a: FakePlayer['o']) { super(a); L.players.push(this); } } as unknown as SpSdk['Player'] });
        res();
      }, 0);
    });
  const record = (v: unknown) => {
    if (v && typeof (v as Promise<unknown>).then === 'function')
      (v as Promise<unknown>).then(
        (x) => L.results.push(x == null ? '-' : 'ok ' + JSON.stringify(x)),
        (e) => L.results.push('ERR ' + (e as Error).message),
      );
    // (lo portado devuelve la promesa de las órdenes, para poder esperarlas; RepArena, nada: los dos, «-»)
    else L.results.push(v == null ? '-' : 'val ' + JSON.stringify(v));
  };
  return { clock, srv, mem, r, loc, L, menu, loadScript, record };
}
// un suceso del reproductor del SDK (o «token»: el SDK pide el token)
function fire(b: ReturnType<typeof base>, ev: string, a?: unknown) {
  const p = b.L.players[b.L.players.length - 1];
  if (ev === 'token') p.o.getOAuthToken((t) => b.L.results.push('tok ' + t));
  else p.on[ev](a);
}
function snapOf(S: any, P: any, nowText: string, b: ReturnType<typeof base>): Record<string, unknown> {
  return {
    cfg: S.cfg,
    st: S.st,
    err: S.err,
    busy: S.busy,
    pollT: Math.round(S.pollT * 1000) / 1000,
    lastRef: S.lastRef,
    mine: S.mine,
    started: S.started,
    block: S.block ?? null,
    want: S.want ?? null,
    resume: !!S.resume,
    meId: S.meId ?? null,
    trk: S.trk || {},
    prev: S.prev ?? null,
    prevT: S.prevT || 0,
    vol: S.vol || 0,
    volT: S.volT || 0,
    player: { id: P.id, state: P.state, err: P.err, has: !!P.player },
    nowText,
    stored: [...b.mem.m.entries()].sort(),
    reqs: b.srv.reqs,
    ...b.L,
    players: b.L.players.map((p) => p.log),
    timers: b.clock.q.length,
  };
}

function portado(o: Opts): Ad {
  const b = base(o);
  const sp = new Spotify({
    fetch: b.srv.fetch,
    store: mkStore(b.mem),
    location: b.loc,
    assign: (u) => b.L.nav.push('assign ' + u),
    replaceUrl: (u) => b.L.nav.push('replace ' + u),
    now: () => b.clock.t,
    setTimeout: b.clock.setTimeout,
    clearTimeout: b.clock.clearTimeout,
    random: b.r,
    crypto: mkCrypto(rng(99)),
    loadScript: o.sdk || o.sdkFail ? b.loadScript : undefined,
    status: (t, bad) => b.L.status.push(t + (bad ? ' (rojo)' : '')),
    onRefresh: () => b.L.refresh++,
    onMusic: (on) => b.L.music.push(String(on)),
    menuOpen: () => b.menu.open,
    onPreviewEnd: () => b.L.prevEnd++,
  });
  const S = sp as unknown as Record<string, any>;
  return {
    call: (n, ...a) => {
      const f = S[n] as (...x: unknown[]) => unknown;
      const v = f.apply(sp, a);
      b.record(v);
      return v;
    },
    set: (k, v) => (S[k] = v),
    get: (k) => S[k],
    fades: SP_FADE,
    fire: (ev, a) => fire(b, ev, a),
    srv: b.srv,
    clock: b.clock,
    loc: b.loc,
    mem: b.mem,
    menu: b.menu,
    snap: () => snapOf(sp, sp.player, sp.nowText(), b),
  };
}

const RA_NAMES: Record<string, string> = {
  connect: 'spConnect', handleRedirect: 'spHandleRedirect', token: 'spToken', refresh: 'spRefresh', toggle: 'spToggle', next: 'spNext', previous: 'spPrev', setVol: 'spVol', volNow: 'spVolNow',
  roundEnd: 'spRoundEnd', roundStart: 'spRoundStart', roundQueue: 'spRoundQueue', blockMusic: 'spBlockMusic', tick: 'spTick', nowText: 'spNowText', playLists: 'spPlayLists', playList: 'spPlayList',
  playTracks: 'spPlayTracks', myLists: 'spMyLists', listTracks: 'spListTracks', playerInit: 'spPlayerInit', playerUnlock: 'spPlayerUnlock', toHere: 'spToHere', wake: 'spWake', preview: 'spPreview',
  fadeOut: 'spFadeOut', fadeIn: 'spFadeIn', pickable: 'spPickable', disconnect: 'spOff', setClientId: 'spClient', api: 'spApi',
};
// el cuerpo de un manejador de la página de RepArena (desconectar, escribir el Client ID)
const handler = (line: string) => {
  const m = raSlice('65_music.js', line).match(/\(\) => \{ (.*) \}\);$/);
  if (!m) throw new Error('sin manejador: ' + line);
  return m[1];
};
function original(o: Opts): Ad {
  const b = base(o);
  const AUDM = { music: false },
    menu = { get v() { return b.menu.open ? { music: '' } : null; } };
  const el = { style: { set color(c: string) { b.L.status[b.L.status.length - 1] += c === 'var(--red)' ? ' (rojo)' : ''; } }, set textContent(t: string) { b.L.status.push(t); } };
  const doc = o.sdk || o.sdkFail
    ? { head: { appendChild: (sc: { src: string; onerror: () => void }) => { b.L.nav.push('script ' + sc.src); b.clock.setTimeout(() => { if (o.sdkFail) sc.onerror(); else (win as any).onSpotifyWebPlaybackSDKReady(); }, 0); } }, createElement: () => ({}) }
    : { querySelector: () => null };
  const win: Record<string, unknown> = { Spotify: { Player: class extends FakePlayer { constructor(a: FakePlayer['o']) { super(a); b.L.players.push(this); } } } };
  const code = [
    raSlice('00_core.js', 'const clamp'),
    raSlice('65_music.js', 'const SP_KEY', '// Ritmo de la canción', false),
    raSlice('65_music.js', 'function spNowText', '}'),
    raSlice('65_music.js', 'function spTick', '}'),
    raSlice('65_music.js', 'const spPicks'),
    raSlice('65_music.js', 'async function spPreview', '}'),
    `function spOff() { ${handler("  $('#btnSpOff')")} }`,
    `function spClient(v) { const inp = { value: v }; ${handler("  inp.addEventListener('input'")} }`,
  ].join('\n');
  const names = Object.values(RA_NAMES).join(', ');
  const R = raRun<{ SP: any; SPP: any; SP_FADE: typeof SP_FADE; F: Record<string, (...a: unknown[]) => unknown> }>(code, `{ SP, SPP, SP_FADE, F: { ${names} } }`, {
    store: mkStore(b.mem),
    fetch: b.srv.fetch,
    location: Object.assign(b.loc, { assign: (u: string) => b.L.nav.push('assign ' + u) }),
    history: { replaceState: (_a: unknown, _b: unknown, u: string) => b.L.nav.push('replace ' + u) },
    $: (s: string) => (s === '#spStatus' ? el : null),
    Date: { now: () => b.clock.t },
    setTimeout: b.clock.setTimeout,
    clearTimeout: b.clock.clearTimeout,
    Math: { ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]])), random: b.r },
    crypto: mkCrypto(rng(99)),
    btoa,
    TextEncoder,
    window: win,
    document: doc,
    AUDM,
    applyVolume: () => b.L.music.push(String(AUDM.music)),
    get menu() { return menu.v; },
    spMenuSync: () => {},
    spPage: () => {},
    spAutoTempo: () => b.L.refresh++,
    spPrevRefresh: () => b.L.prevEnd++,
  });
  return {
    call: (n, ...a) => {
      const v = R.F[RA_NAMES[n]](...a);
      b.record(v);
      return v;
    },
    set: (k, v) => (R.SP[k] = v),
    get: (k) => R.SP[k],
    fades: R.SP_FADE,
    fire: (ev, a) => fire(b, ev, a),
    srv: b.srv,
    clock: b.clock,
    loc: b.loc,
    mem: b.mem,
    menu: b.menu,
    snap: () => snapOf(R.SP, R.SPP, R.F.spNowText() as string, b),
  };
}

type Step = [string, (a: Ad) => void, number?];
async function same(o: Opts, steps: Step[]) {
  const A = original(o),
    B = portado(o);
  for (const [name, fn, ms = 1000] of steps) {
    for (const a of [A, B]) {
      fn(a);
      await a.clock.run(ms);
    }
    expect(JSON.parse(JSON.stringify(B.snap())), name).toEqual(JSON.parse(JSON.stringify(A.snap())));
  }
  return B;
}

const NOW0 = 1_700_000_000_000;
const CONN = (extra: Record<string, unknown> = {}) => ({ [SP_KEY]: { clientId: 'cid', access: 'acc-0', exp: NOW0 + 3_600_000, refresh: 'ref-0', ...extra } });
const dev = (id: string, vol = 70, more: Record<string, unknown> = {}) => ({ id, name: 'Disp ' + id, volume_percent: vol, supports_volume: true, ...more });
const playing = (id = 'movil', vol = 70, on = true, more: Record<string, unknown> = {}) => ({ is_playing: on, device: dev(id, vol, more), item: { id: 't1', uri: 'spotify:track:t1', name: 'Uno', artists: [{ name: 'Ana' }, { name: 'Bea' }] } });
const tracks = (n: number) => Array.from({ length: n }, (_, i) => ({ uri: 'spotify:track:p' + i, name: 'P' + i }));
const ready = (id = 'gafas'): Step => ['listo', (a) => a.fire('ready', { device_id: id }), 10];

describe.skipIf(!RA_DIR)('Spotify como en RepArena', () => {
  it('conectar con PKCE y la vuelta desde Spotify', async () => {
    const back = (q: (st: string) => string): Step => ['vuelta', (a) => { a.loc.search = q((JSON.parse(a.mem.getItem(SP_PKCE) as string) || {}).state); a.call('handleRedirect'); }, 2000];
    await same({ sdk: true }, [
      ['sin Client ID', (a) => a.call('connect')],
      ['nada que leer', (a) => a.call('handleRedirect')],
      ['Client ID', (a) => a.call('setClientId', '  cid  ')],
      ['conectar', (a) => a.call('connect')],
      back((st) => '?code=good&state=' + st),
      ready('gafas-1'),
      ['Play las trae a las gafas', (a) => a.call('toggle'), 2000],
      ['desbloquear', (a) => a.call('playerUnlock')],
    ]);
    // vueltas malas: sin permiso, estado que no coincide, código malo
    await same({ stored: { [SP_KEY]: { clientId: 'cid' } } }, [
      ['conectar', (a) => a.call('connect')],
      back(() => '?error=access_denied'),
      ['otra vez', (a) => a.call('connect')],
      back(() => '?code=good&state=nope'),
      ['y otra', (a) => a.call('connect')],
      back((st) => '?code=bad&state=' + st),
      ['sin PKCE', (a) => { a.mem.removeItem(SP_PKCE); a.loc.search = '?code=good&state=x'; a.call('handleRedirect'); }],
    ]);
  });

  it('tokens: caducado, 401 que reintenta una vez, permiso retirado', async () => {
    await same({ stored: CONN({ exp: NOW0 + 30_000 }) }, [
      ['le queda más de un minuto: sirve', (a) => { a.set('cfg', { ...a.get('cfg'), exp: a.clock.t + 61_000 }); a.call('refresh'); }],
      ['le quedan 55 s: se renueva', (a) => { a.set('cfg', { ...a.get('cfg'), exp: a.clock.t + 55_000 }); a.call('refresh'); }],
      ['casi caducado: se renueva', (a) => { a.set('cfg', { ...a.get('cfg'), exp: a.clock.t + 30_000 }); a.call('refresh'); }],
      ['401: renueva y reintenta', (a) => { a.srv.valid = 'otro'; a.call('next'); }],
      ['401 dos veces: error', (a) => { a.srv.once.push({ m: 'POST /me/player/previous', status: 401, json: { error: { message: 'Bad token' } } }, { m: 'POST /me/player/previous', status: 401, json: { error: { message: 'Bad token' } } }); a.call('previous'); }],
      ['permiso retirado', (a) => { a.srv.refreshBad = true; a.set('cfg', { ...a.get('cfg'), exp: 0 }); a.call('toggle'); }],
      ['sin conectar ya no hace nada', (a) => { a.call('toggle'); a.call('refresh'); a.call('setVol', 5); }],
      ['token sin conectar', (a) => a.call('token')],
    ]);
  });

  it('errores de Spotify con sus textos', async () => {
    const e = (m: string, x: Record<string, unknown>): Step => [m, (a) => { a.srv.once.push({ m: 'GET /me/player', ...x }); a.call('refresh'); }];
    await same({ stored: CONN() }, [
      e('429', { status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } } }),
      e('500 sin cuerpo', { status: 500, text: '' }),
      e('502 con basura', { status: 502, text: '<html>oops' }),
      e('premium', { status: 403, json: { error: { message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } } }),
      e('sin red', { throw: 'Failed to fetch' }),
      e('404', { status: 404, json: { error: { message: 'Not found' } } }),
      ['204 mantiene el aviso de abrir Spotify', (a) => a.call('refresh')],
      e('NO_ACTIVE_DEVICE', { status: 403, json: { error: { message: 'x', reason: 'NO_ACTIVE_DEVICE' } } }),
      ['con reproductor se borra', (a) => { a.srv.player = playing(); a.call('refresh'); }],
      e('otro', { status: 400, json: { error: { message: 'refresh token revoked' } } }),
      ['ocupado: la segunda orden no va', (a) => { a.call('next'); a.call('previous'); }],
    ]);
  });

  it('Play y pausa: elegidas, una lista, varias mezcladas, despertar un dispositivo', async () => {
    await same({ stored: CONN({ picks: [...tracks(4), { name: 'sin uri' }], lists: [{ id: 'x', uri: 'spotify:playlist:x' }] }) }, [
      ['sin nada que leer: despertar sin dispositivos', (a) => a.call('toggle')],
      ['despertar el activo', (a) => { a.srv.devices = [dev('d1'), dev('d2', 50, { is_active: true })]; a.call('toggle'); }],
      ['leer', (a) => { a.srv.player = playing('d2', 50); a.call('refresh'); }],
      ['pausa', (a) => a.call('toggle')],
      ['la primera vez, las elegidas', (a) => a.call('toggle')],
      ['pausa', (a) => a.call('toggle')],
      ['luego reanuda', (a) => a.call('toggle')],
      ['una lista', (a) => { a.set('started', false); a.set('cfg', { ...a.get('cfg'), picks: [] }); a.set('st', playing('d2', 50, false)); a.call('toggle'); }],
      ['varias mezcladas (ajena fuera, vieja por /tracks)', (a) => { a.set('started', false); a.set('st', playing('d2', 50, false)); a.set('cfg', { ...a.get('cfg'), lists: [{ id: 'a', uri: 'spotify:playlist:a' }, { id: 'ajena', uri: 'spotify:playlist:ajena' }, { id: 'vieja', uri: 'spotify:playlist:vieja' }, { id: 'nouri' }] }); a.call('toggle'); }],
      ['grandes: 150 como mucho', (a) => a.call('playLists', [{ id: 'g1', uri: 'spotify:playlist:g1' }, { id: 'g2', uri: 'spotify:playlist:g2' }])],
      ['ninguna legible: la primera entera', (a) => a.call('playLists', [{ id: 'b', uri: 'spotify:playlist:b' }, { id: 'ajena', uri: 'spotify:playlist:ajena' }])],
      ['otra con error de red: se para', (a) => { a.srv.once.push({ m: 'GET /playlists/zz', throw: 'NetworkError' }); a.call('playLists', [{ id: 'zz', uri: 'spotify:playlist:zz' }, { id: 'a', uri: 'u' }]); }],
      ['una lista desde una canción, en orden', (a) => a.call('playList', { id: 'a', uri: 'spotify:playlist:a' }, 'spotify:track:a2', false)],
      ['una lista al azar', (a) => a.call('playList', { id: 'a', uri: 'spotify:playlist:a' }, undefined, true)],
      ['cien como mucho', (a) => a.call('playTracks', tracks(130))],
      ['sin canciones', (a) => a.call('playTracks', [{ name: 'x' }])],
      ['sin dispositivo en st: play a secas', (a) => { a.set('st', { is_playing: false }); a.call('toggle'); }],
    ]);
  });

  it('tus listas, las que te gustan y las de otros', async () => {
    await same({ stored: CONN({ lists: [{ id: 'a', uri: 'spotify:playlist:a' }, { id: 'b', uri: 'spotify:playlist:b' }] }) }, [
      ['mis listas (dos páginas)', (a) => a.call('myLists'), 10],
      ['guardar', (a) => a.set('mine', a.get('mine') || [{ id: 'a', name: 'A', mine: true }, { id: 'b', name: 'B', mine: true }])],
      ['elegibles', (a) => a.call('pickable')],
      ['ajena: NOT_YOURS y se marca', (a) => a.call('listTracks', 'b')],
      ['canciones de una lista (dos páginas)', (a) => a.call('listTracks', 'a')],
      ['ya leídas', (a) => a.call('listTracks', 'a')],
      ['las que te gustan', (a) => a.call('listTracks', 'liked')],
      ['vieja', (a) => a.call('listTracks', 'vieja')],
      ['sin /me: todas valen', (a) => { a.set('meId', undefined); a.srv.once.push({ m: 'GET /me', status: 500, text: '' }); a.call('myLists'); }],
      ['error al leer listas', (a) => { a.srv.once.push({ m: 'GET /me/playlists', status: 429, json: { error: { message: 'Too many' } } }); a.call('myLists'); }],
    ]);
    await same({ stored: CONN() }, [['sin permiso de biblioteca: LIBRARY', (a) => { a.srv.noLibrary = true; a.call('listTracks', 'liked'); }]]);
  });

  it('la ronda: pausa y vuelta con fundidos (otro dispositivo, las gafas, sin volumen)', async () => {
    await same({ stored: CONN() }, [
      ['sin música: no hace nada', (a) => { a.call('roundEnd'); a.call('roundStart'); }],
      ['suena', (a) => { a.srv.player = playing('movil', 70); a.call('refresh'); }],
      ['acaba: baja y pausa', (a) => a.call('roundEnd'), 400],
      ['a medio fundido', () => {}, 3000],
      ['empieza: entra subiendo', (a) => a.call('roundStart'), 3000],
      ['acaba y enseguida empieza', (a) => { a.call('roundEnd'); }, 900],
      ['empieza', (a) => a.call('roundStart'), 5000],
      ['acaba, empieza y acaba', (a) => { a.call('roundEnd'); a.clock.run(0); }, 300],
      ['empieza', (a) => a.call('roundStart'), 300],
      ['acaba', (a) => a.call('roundEnd'), 5000],
      ['empieza con error', (a) => { a.srv.once.push({ m: 'PUT /me/player/play', status: 404, text: '' }); a.call('roundStart'); }, 5000],
      ['sin dejar cambiar el volumen: sin fundido', (a) => { a.set('st', playing('tv', 40, true, { supports_volume: false })); a.call('roundEnd'); }, 3000],
      ['empieza', (a) => a.call('roundStart'), 3000],
      ['cola a mano: pausa', (a) => a.call('roundQueue', 'pause'), 3000],
    ]);
    await same({ stored: CONN({ vol: 45 }), sdk: true }, [
      ['arrancar el reproductor', (a) => a.call('playerInit'), 10],
      ready(),
      ['suena en las gafas', (a) => { a.srv.player = playing('gafas', 0); a.call('refresh'); }],
      ['acaba: 20 pasos en el reproductor', (a) => a.call('roundEnd'), 3000],
      ['empieza', (a) => a.call('roundStart'), 3000],
      ['volNow', (a) => a.call('volNow')],
    ]);
  });

  it('la música de un bloque', async () => {
    await same({ stored: CONN() }, [
      ['sin música', (a) => { a.call('blockMusic', null); a.call('blockMusic', { music: [] }); }],
      ['suena otra', (a) => { a.srv.player = playing('movil', 80); a.call('refresh'); }],
      ['bloque: baja, cambia y sube', (a) => a.call('blockMusic', { music: tracks(3) }), 6000],
      ['el mismo, sonando: sigue', (a) => { a.set('st', playing('movil', 80)); a.call('blockMusic', { music: tracks(3) }); }],
      ['en pausa: entra subiendo', (a) => { a.set('st', playing('movil', 80, false)); a.call('blockMusic', { music: tracks(2) }); }, 4000],
      ['sin fundidos', (a) => { a.fades.in = 0; a.fades.out = 0; a.set('st', playing('movil', 80, false)); a.call('blockMusic', { music: tracks(5) }); }, 4000],
      ['ronda sin fundidos', (a) => { a.set('st', playing('movil', 80)); a.call('roundEnd'); }, 3000],
      ['empieza', (a) => a.call('roundStart'), 3000],
    ]).finally(() => {
      SP_FADE.in = 1500;
      SP_FADE.out = 2500;
    });
  });

  it('volumen: agrupado, en las gafas, sin dejar cambiarlo', async () => {
    await same({ stored: CONN({ vol: 50 }), sdk: true }, [
      ['sin estado', (a) => a.call('setVol', 5), 100],
      ['espera justa', (a) => a.call('setVol', 5), 255],
      ['otra seguida', (a) => a.call('setVol', 7), 100],
      ['y otra', (a) => a.call('setVol', -3), 1000],
      ['tope', (a) => { for (let i = 0; i < 30; i++) a.call('setVol', 5); }, 1000],
      ['antes de 8 s, el del juego', (a) => { a.set('st', playing('movil', 33)); a.call('volNow'); }, 6500],
      ['casi', (a) => a.call('volNow'), 1000],
      ['tras 8 s, el que dice Spotify', (a) => a.call('volNow'), 9000],
      ['sin saber nada: 60', (a) => { a.set('cfg', { ...a.get('cfg'), vol: undefined }); a.set('st', { device: dev('x', 0) }); a.call('volNow'); }],
      ['volNow', (a) => a.call('volNow')],
      ['un 0 no silencia', (a) => { a.set('st', playing('movil', 0)); a.call('volNow'); a.call('setVol', -5); }, 1000],
      ['no deja', (a) => { a.set('st', playing('tv', 40, true, { supports_volume: false })); a.call('setVol', 5); }],
      ['con error', (a) => { a.set('st', playing('movil', 40)); a.srv.once.push({ m: 'PUT /me/player/volume', status: 403, json: { error: { message: 'Premium required' } } }); a.call('setVol', 5); }],
      ['gafas', (a) => a.call('playerInit'), 10],
      ready(),
      ['en las gafas, en su reproductor', (a) => { a.set('st', playing('gafas', 0)); a.call('setVol', 10); }],
    ]);
  });

  it('sondeo, ambiente y lo que suena', async () => {
    const ticks = (n: number, dt: number): Step => ['ticks', (a) => { for (let i = 0; i < n; i++) a.call('tick', dt); }, 600];
    await same({ stored: CONN() }, [
      ticks(1, 0.1),
      ['suena', (a) => { a.srv.player = playing(); }],
      ticks(50, 0.1),
      ticks(40, 0.1),
      ['menú abierto', (a) => { a.menu.open = true; }],
      ticks(90, 0.1),
      ['para', (a) => { a.srv.player = { ...playing('movil', 70, false), item: { name: 'Podcast', show: { name: 'Show' } } }; }],
      ticks(60, 0.1),
      ['sin dispositivo', (a) => a.set('st', { is_playing: false, item: { name: 'Sola' } })],
      ['nada', (a) => a.set('st', { is_playing: false })],
      ['buscando', (a) => a.set('st', null)],
      ['error', (a) => a.set('err', 'Spotify: algo')],
      ['desconectar conserva el Client ID', (a) => a.call('disconnect')],
      ticks(100, 0.1),
    ]);
  });

  it('el reproductor de la página y escuchar una canción', async () => {
    await same({ stored: CONN({ vol: 30 }), sdk: true }, [
      ['escuchar sin reproductor: lo arranca y espera', (a) => a.call('preview', 'spotify:track:z1'), 100],
      ready('pagina'),
      ['espera', () => {}, 3000],
      ['otra vez sin conectar el reproductor', (a) => { a.fire('not_ready'); a.srv.devices = [dev('d9')]; a.call('preview', 'spotify:track:z2'); }, 3000],
      ['vuelve', (a) => a.fire('ready', { device_id: 'pagina' }), 10],
      ['escuchar', (a) => a.call('preview', 'spotify:track:z3'), 500],
      ['cambia pronto: sigue', (a) => a.fire('player_state_changed', { paused: true, track_window: { current_track: { id: 'q', uri: 'x' } } }), 940],
      ['a 1,45 s: sigue', (a) => a.fire('player_state_changed', { paused: true, track_window: { current_track: { id: 'q', uri: 'x' } } }), 100],
      ['acaba', (a) => { a.set('st', playing('pagina')); a.set('pollT', 7); a.fire('player_state_changed', { paused: true, track_window: { current_track: { id: 'q', uri: 'x' } } }); }, 2000],
      ['la misma canción: sigue', (a) => a.fire('player_state_changed', { paused: false, track_window: { current_track: { id: 't1', uri: 'spotify:track:t1' } } }), 10],
      ['sin estado', (a) => a.fire('player_state_changed', null), 10],
      ['escuchar y parar', (a) => { a.call('preview', 'spotify:track:z4'); }, 10],
      ['parar', (a) => a.call('preview', 'spotify:track:z4'), 10],
      ['falla', (a) => { a.srv.once.push({ m: 'PUT /me/player/play', status: 500, text: '' }); a.call('preview', 'spotify:track:z5'); }],
      ['token del SDK', (a) => a.fire('token')],
      ['errores', (a) => a.fire('account_error')],
      ['otro', (a) => a.fire('authentication_error')],
      ['otro', (a) => a.fire('initialization_error')],
      ['sin red de reproducción', (a) => a.fire('playback_error')],
      ['una vez', (a) => a.call('playerInit')],
      ['desconectar', (a) => a.call('disconnect')],
      ['escuchar desconectado', (a) => a.call('preview', 'u')],
    ]);
    await same({ stored: CONN(), sdkFail: true }, [
      ['no carga', (a) => a.call('playerInit'), 10],
      ['escuchar: sin dispositivos', (a) => a.call('preview', 'u'), 10],
      ['con uno', (a) => { a.srv.devices = [dev('d1'), dev('d2', 1, { is_active: true })]; a.call('preview', 'u'); }, 10],
      ['despertar sin gafas', (a) => a.call('wake')],
    ]);
    await same({ stored: { [SP_KEY]: { clientId: 'cid' } }, sdk: true }, [['sin conectar no arranca', (a) => a.call('playerInit'), 10]]);
  });

  it('las pruebas notan un cambio (sensibilidad)', async () => {
    SP_FADE.out = 2400;
    await expect(
      same({ stored: CONN() }, [
        ['suena', (a) => { a.srv.player = playing('movil', 70); a.call('refresh'); }],
        ['acaba', (a) => a.call('roundEnd'), 2450],
      ]),
    ).rejects.toThrow();
    SP_FADE.out = 2500;
  });
});
