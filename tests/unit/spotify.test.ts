// El servicio de Spotify (src/services/spotify.ts) con un Spotify falso y un reloj falso: conectar con PKCE, tokens,
// reintentos, errores, listas, la cola de la ronda, los fundidos, el reproductor de la página y desconectar.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { errText, Spotify, SP_KEY, SP_PKCE, type SpotifyEnv, type SpSdk } from '../../src/services/spotify.js';

const T0 = 1_700_000_000_000;
type Reply = { status: number; json?: unknown; text?: string };
type Route = (m: string, path: string, body: string, auth: string) => Reply | undefined;

function harness(stored: Record<string, unknown> = {}, route: Route = () => undefined, more: Partial<SpotifyEnv> = {}) {
  const mem = new Map<string, string>(Object.entries(stored).map(([k, v]) => [k, JSON.stringify(v)]));
  const clock = { t: T0, q: [] as { t: number; fn: () => void; id: number }[], n: 0 };
  const reqs: { m: string; url: string; body: string; auth: string }[] = [];
  const nav: string[] = [],
    status: string[] = [];
  const loc = { origin: 'https://ra.example', pathname: '/juego/index.html', search: '' };
  const env: SpotifyEnv = {
    fetch: async (url, init) => {
      const body = init.body == null ? '' : String(init.body),
        auth = init.headers.Authorization || '';
      reqs.push({ m: init.method, url, body, auth });
      const path = url.replace('https://api.spotify.com/v1', '');
      const r = route(init.method, path, body, auth) || (url.includes('/api/token') ? { status: 200, json: { access_token: 'nuevo', expires_in: 3600 } } : { status: 204 });
      const txt = r.text !== undefined ? r.text : r.json === undefined ? '' : JSON.stringify(r.json);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(txt), text: async () => txt };
    },
    store: (k, v) => {
      if (v === undefined) return mem.has(k) ? JSON.parse(mem.get(k) as string) : null;
      mem.set(k, JSON.stringify(v));
      return null;
    },
    location: loc,
    assign: (u) => nav.push(u),
    replaceUrl: (u) => nav.push('replace ' + u),
    now: () => clock.t,
    setTimeout: (fn, ms) => {
      clock.q.push({ t: clock.t + ms, fn, id: ++clock.n });
      return clock.n;
    },
    clearTimeout: (id) => {
      clock.q = clock.q.filter((x) => x.id !== id);
    },
    random: () => 0.5,
    crypto: globalThis.crypto as unknown as SpotifyEnv['crypto'],
    status: (t, bad) => status.push((bad ? '! ' : '') + t),
    ...more,
  };
  const flush = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
  };
  // avanza el reloj falso ms, haciendo los temporizadores en orden
  const run = async (ms: number) => {
    const end = clock.t + ms;
    for (;;) {
      await flush();
      clock.q.sort((a, b) => a.t - b.t || a.id - b.id);
      const x = clock.q[0];
      if (!x || x.t > end) break;
      clock.q.shift();
      clock.t = Math.max(clock.t, x.t);
      x.fn();
    }
    clock.t = end;
  };
  return { sp: new Spotify(env), mem, clock, reqs, nav, status, loc, run, flush };
}
const CONN = (extra: Record<string, unknown> = {}) => ({ [SP_KEY]: { clientId: 'cid', access: 'tok', exp: T0 + 3_600_000, refresh: 'ref', ...extra } });
const vols = (reqs: { url: string }[]) => reqs.filter((r) => r.url.includes('/volume')).map((r) => +(r.url.split('=')[1] as string));

describe('Spotify: conectar', () => {
  it('guarda el verificador PKCE, va a Spotify y, a la vuelta, pide el token con él', async () => {
    const h = harness({ [SP_KEY]: { clientId: 'cid' } });
    await h.sp.connect();
    const pk = JSON.parse(h.mem.get(SP_PKCE) as string);
    expect(pk.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const u = new URL(h.nav[0]);
    expect(u.origin + u.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(u.searchParams.get('redirect_uri')).toBe('https://ra.example/juego/');
    expect(u.searchParams.get('state')).toBe(pk.state);
    const sha = createHash('sha256').update(pk.verifier).digest('base64url');
    expect(u.searchParams.get('code_challenge')).toBe(sha);
    // la vuelta
    h.loc.search = '?code=abc&state=' + pk.state;
    await h.sp.handleRedirect();
    const tok = h.reqs[0];
    expect(tok.url).toBe('https://accounts.spotify.com/api/token');
    const p = new URLSearchParams(tok.body);
    expect(Object.fromEntries(p)).toEqual({ grant_type: 'authorization_code', code: 'abc', redirect_uri: 'https://ra.example/juego/', client_id: 'cid', code_verifier: pk.verifier });
    expect(JSON.parse(h.mem.get(SP_PKCE) as string)).toEqual({});
    expect(h.nav[1]).toBe('replace https://ra.example/juego/');
    expect(h.status.at(-1)).toBe('Conectado. La música sonará en estas gafas (o el navegador) al pulsar Play.');
  });
  it('sin Client ID o con una vuelta que no coincide, avisa', async () => {
    const h = harness();
    await h.sp.connect();
    expect(h.status).toEqual(['! Escribe primero el Client ID de tu app de Spotify.']);
    h.loc.search = '?code=abc&state=otro';
    await h.sp.handleRedirect();
    expect(h.status.at(-1)).toBe('! La respuesta de Spotify no coincide. Vuelve a pulsar Conectar.');
    expect(h.reqs).toEqual([]);
  });
});

describe('Spotify: tokens y errores', () => {
  it('renueva un token caducado antes de la petición', async () => {
    const h = harness(CONN({ exp: T0 - 1 }), (m, path) => (path === '/me/player' ? { status: 200, json: { is_playing: true } } : undefined));
    await h.sp.refresh();
    expect(h.reqs.map((r) => r.m + ' ' + r.url)).toEqual(['POST https://accounts.spotify.com/api/token', 'GET https://api.spotify.com/v1/me/player']);
    expect(Object.fromEntries(new URLSearchParams(h.reqs[0].body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'ref', client_id: 'cid' });
    expect(h.reqs[1].auth).toBe('Bearer nuevo');
    expect(h.sp.playing()).toBe(true);
    expect(JSON.parse(h.mem.get(SP_KEY) as string).exp).toBe(T0 + 3_600_000);
  });
  it('un 401 renueva y reintenta una sola vez', async () => {
    let n = 0;
    const h = harness(CONN(), (m, path) => (path === '/me/player/next' ? { status: 401, json: { error: { message: 'expired ' + ++n } } } : undefined));
    await h.sp.next();
    expect(h.reqs.map((r) => r.m + ' ' + r.url)).toEqual(['POST https://api.spotify.com/v1/me/player/next', 'POST https://accounts.spotify.com/api/token', 'POST https://api.spotify.com/v1/me/player/next']);
    expect(h.reqs.map((r) => r.auth)).toEqual(['Bearer tok', '', 'Bearer nuevo']);
    expect(h.sp.err).toBe('Spotify: expired 2');
  });
  it('429 y 5xx dan su texto; sin reproductor, el de abrir Spotify', async () => {
    const next: Reply[] = [{ status: 429, json: { error: { status: 429, message: 'API rate limit exceeded' } } }, { status: 503, text: '' }, { status: 404, text: '' }];
    const h = harness(CONN(), (m, path) => (path === '/me/player' ? next.shift() : undefined));
    await h.sp.refresh();
    expect(h.sp.err).toBe('Spotify: API rate limit exceeded');
    await h.sp.refresh();
    expect(h.sp.err).toBe('Spotify: HTTP 503');
    await h.sp.refresh();
    expect(h.sp.err).toBe('Abre Spotify en las Quest o el móvil y pon algo a sonar');
    expect(h.sp.nowText()).toBe(h.sp.err);
    expect(errText(new TypeError('Failed to fetch'))).toBe('Sin conexión con Spotify');
    expect(errText(new Error('Premium required'))).toBe('Hace falta Spotify Premium');
    expect(errText(new Error('LOGIN'))).toBe('Vuelve a conectar Spotify en la página');
  });
  it('si Spotify retira el permiso, se olvida la renovación', async () => {
    const h2 = harness(CONN({ exp: 0 }), (m, path, body) => (body.includes('refresh_token') ? { status: 400, json: { error: 'invalid_grant' } } : undefined));
    await h2.sp.toggle();
    expect(h2.sp.connected()).toBe(false);
    expect(h2.sp.err).toBe('Vuelve a conectar Spotify en la página');
  });
});

describe('Spotify: reproducir', () => {
  it('una lista: en el dispositivo activo y al azar', async () => {
    const h = harness(CONN({ lists: [{ id: 'a', uri: 'spotify:playlist:a' }] }));
    h.sp.st = { is_playing: false, device: { id: 'mó vil' } };
    await h.sp.toggle();
    expect(h.reqs.map((r) => `${r.m} ${r.url.replace('https://api.spotify.com/v1', '')} ${r.body}`)).toEqual([
      'PUT /me/player/play?device_id=m%C3%B3%20vil {"context_uri":"spotify:playlist:a"}',
      'PUT /me/player/shuffle?state=true&device_id=m%C3%B3%20vil ',
    ]);
    expect(h.sp.started).toBe(true);
    expect(h.sp.playing()).toBe(true);
  });
  it('Play pone tus canciones elegidas, no lo que escuchabas en otro aparato; lo suyo, en pausa, lo reanuda', async () => {
    const h = harness(CONN({ picks: [{ uri: 'spotify:track:1' }, { uri: 'spotify:track:2' }] }));
    h.sp.started = true; // (ya sonó lo tuyo antes…)
    h.sp.st = { is_playing: false, device: { id: 'm' }, item: { uri: 'spotify:track:otra' }, context: { uri: 'spotify:playlist:del-movil' } };
    await h.sp.toggle(); // (…pero lo que hay ahora lo pusiste en el móvil: suenan las elegidas)
    expect(h.reqs[0].url).toBe('https://api.spotify.com/v1/me/player/play?device_id=m');
    expect(JSON.parse(h.reqs[0].body).uris.sort()).toEqual(['spotify:track:1', 'spotify:track:2']);
    h.reqs.length = 0;
    h.sp.st = { is_playing: false, device: { id: 'm' }, item: { uri: 'spotify:track:2' } };
    await h.sp.toggle(); // (en pausa y es de las elegidas: sigue donde iba)
    expect(h.reqs.map((r) => r.url.replace('https://api.spotify.com/v1', ''))).toEqual(['/me/player/play']);
  });
  it('la ronda: al acabar baja y pausa; al empezar, entra subiendo', async () => {
    const h = harness(CONN());
    h.sp.st = { is_playing: true, device: { id: 'm', volume_percent: 80, supports_volume: true } };
    const music: boolean[] = [];
    (h.sp as unknown as { env: SpotifyEnv }).env.onMusic = (on) => music.push(on);
    h.sp.roundEnd();
    expect(music).toEqual([false]);
    await h.run(3000);
    const paths = h.reqs.map((r) => r.url.replace('https://api.spotify.com/v1', ''));
    expect(vols(h.reqs)).toEqual([64, 48, 32, 16, 0, 80]);
    expect(paths.indexOf('/me/player/pause')).toBe(5);
    expect(h.sp.resume).toBe(true);
    h.reqs.length = 0;
    // (el Spotify falso no tiene reproductor: al volver a leer, st queda vacío; se pone el de antes, en pausa)
    h.sp.st = { is_playing: false, device: { id: 'm', volume_percent: 80, supports_volume: true } };
    h.sp.roundStart();
    await h.run(1700); // (el fundido de entrada, 1,5 s; luego vuelve a leer el estado)
    expect(vols(h.reqs)).toEqual([0, 16, 32, 48, 64, 80]);
    expect(h.reqs[1].url).toBe('https://api.spotify.com/v1/me/player/play');
    expect(h.sp.playing()).toBe(true);
  });
  it('un fundido dura lo pedido y otro nuevo deja a medias el anterior', async () => {
    const h = harness(CONN());
    h.sp.st = { is_playing: true, device: { id: 'm', volume_percent: 50 } };
    let a: boolean | undefined;
    void h.sp.fadeOut(50, 1000).then((v) => (a = v));
    await h.run(450);
    expect(vols(h.reqs)).toEqual([40, 30, 20]);
    let b: boolean | undefined;
    void h.sp.fadeIn(50, 500).then((v) => (b = v));
    await h.run(1000);
    expect(a).toBe(false);
    expect(b).toBe(true);
    expect(vols(h.reqs)).toEqual([40, 30, 20, 10, 20, 30, 40, 50]);
  });
  it('el volumen: varias pulsaciones van en una sola petición', async () => {
    const h = harness(CONN({ vol: 50 }));
    h.sp.st = { is_playing: true, device: { id: 'm', volume_percent: 50 } };
    h.sp.setVol(5);
    h.sp.setVol(5);
    await h.run(100);
    h.sp.setVol(-5);
    await h.run(300);
    expect(vols(h.reqs)).toEqual([55]);
    expect(JSON.parse(h.mem.get(SP_KEY) as string).vol).toBe(55);
    expect(h.sp.nowText()).toBe('Spotify: no suena nada');
  });
});

describe('Spotify: el reproductor de la página y desconectar', () => {
  it('arranca el SDK, queda listo con su id y Play pasa la música a las gafas', async () => {
    const made: { o: { name: string; volume: number }; on: Record<string, (a: unknown) => void> }[] = [];
    const sdk = { Player: class { on: Record<string, (a: unknown) => void> = {}; constructor(public o: { name: string; volume: number }) { made.push(this); } addListener(e: string, f: (a: unknown) => void) { this.on[e] = f; } connect() {} } } as unknown as SpSdk;
    const h = harness(CONN(), undefined, { loadScript: async (url, ready) => ready(sdk) });
    h.sp.playerInit();
    await h.flush();
    expect(made[0].o).toMatchObject({ name: 'RepArena (Quest)', volume: 0.8 });
    made[0].on.ready({ device_id: 'gafas' });
    expect(h.sp.hereOk()).toBe(true);
    await h.sp.toggle();
    expect(h.reqs[0]).toMatchObject({ m: 'PUT', url: 'https://api.spotify.com/v1/me/player', body: '{"device_ids":["gafas"],"play":true}' });
    made[0].on.account_error(null);
    expect(h.sp.player).toMatchObject({ state: 'error', err: 'Para que suene en las gafas hace falta Spotify Premium' });
  });
  it('desconectar olvida los tokens y conserva el Client ID', () => {
    const h = harness(CONN({ lists: [{ id: 'a', uri: 'u' }] }));
    h.sp.st = { is_playing: true };
    h.sp.disconnect();
    expect(JSON.parse(h.mem.get(SP_KEY) as string)).toEqual({ clientId: 'cid' });
    expect(h.sp.connected()).toBe(false);
    expect(h.sp.st).toBe(null);
    expect(h.sp.nowText()).toBe('');
    expect(h.status).toEqual(['Desconectado.']);
  });
});
