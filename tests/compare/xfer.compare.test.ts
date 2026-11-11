// Pasar los datos y la sincronización portados (src/services/xfer.ts) frente al código original de RepArena
// (src/69_xfer.js, hasta los menús): un paquete sellado por RepArena lo abre el porte y al revés (con las dos sales, con y
// sin comprimir), un envío por código de una versión se recibe en la otra por el mismo ntfy simulado y se carga igual,
// la sincronización de un aparato con RepArena y otro con el porte por el mismo Firebase simulado, y cientos de casos al
// azar de juntar (syncMerge), de lo que trae (syncNews), de apuntar lo que cambia al guardar (syncTouch) y de los textos.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Sync, SYNC_DB, SYNC_KEY, SYNC_SALT, XFER_BASE, XFER_CHUNK, XFER_HOURS, XFER_KEYS, xferOpen, xferSeal, xferSummary, xferTopic, syncMerge, syncNews, type SyncAsk, type SyncSide, type XferEnv, type XferPacket, type XferResponse } from '../../src/services/xfer.js';
import { Mem, RA_DIR, raRun, raSlice } from './ra.js';

process.env.TZ = 'Europe/Madrid';
const cr = webcrypto as unknown as Crypto;
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const js = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
const out = (f: () => unknown): unknown => {
  try {
    return js(f());
  } catch {
    return 'error';
  }
};
const res = (status: number, body: string): XferResponse => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

/** Un ntfy y un Firebase en memoria, compartidos por los dos. */
class FakeNet {
  topics = new Map<string, string[]>();
  db = new Map<string, unknown>();
  fetch = async (url: string, init?: { method?: string; body?: string }): Promise<XferResponse> => {
    const u = new URL(url);
    if (u.host === 'ntfy.sh') {
      const topic = u.pathname.split('/')[1];
      if (init?.method === 'POST') {
        const l = this.topics.get(topic) || [];
        l.push(JSON.stringify({ event: 'message', message: init.body }));
        this.topics.set(topic, l);
        return res(200, '{}');
      }
      return res(200, (this.topics.get(topic) || []).join('\n'));
    }
    const p = u.pathname.replace(/\.json$/, '').split('/').slice(2);
    if (init?.method === 'PUT') {
      this.db.set(p[0], JSON.parse(init.body as string));
      return res(200, init.body as string);
    }
    const v = this.db.get(p[0]) as Record<string, unknown> | undefined;
    return res(200, JSON.stringify(p[1] ? (v ? v[p[1]] : null) : v ?? null));
  };
}

interface RA {
  xferSeal(code: string, obj: unknown, salt?: string): Promise<string>;
  xferOpen(code: string, b64: string, salt?: string): Promise<XferPacket>;
  xferTopic(code: string): Promise<string>;
  xferSend(): Promise<string>;
  xferFetch(code: string): Promise<XferPacket>;
  xferApply(p: XferPacket, reload?: boolean, merged?: boolean): void;
  xferSummary(p: XferPacket): string;
  syncMerge(L: unknown, R: unknown, preferR?: boolean): SyncSide;
  syncNews(L: unknown, R: unknown): unknown;
  syncUrl(sub?: string): Promise<string>;
  syncWhen(at: number): string;
  syncAskText(m: unknown): string;
  syncCreate(): Promise<string>;
  syncLink(code: string): Promise<SyncAsk | null>;
  syncCheck(): Promise<SyncAsk | null>;
  syncPush(): Promise<boolean>;
  syncImport(meta: unknown, reload?: boolean): Promise<SyncSide>;
  syncDecline(m: unknown): void;
  store(k: string, v?: unknown): unknown;
  SYNC: { ready: boolean; busy: boolean };
  XFER_KEYS: string[];
  XFER_CHUNK: number;
  XFER_HOURS: number;
  SYNC_DB: string;
  SALTS: string[];
}
const CODE = () =>
  [
    raSlice('00_core.js', 'const STORE_KEY'),
    raSlice('00_core.js', 'let storeHook'),
    raSlice('00_core.js', 'function store('),
    raSlice('69_xfer.js', '/* =================== PASAR', '/* ---------- En el juego', false),
  ].join('\n');
const RET = '{ xferSeal, xferOpen, xferTopic, xferSend, xferFetch, xferApply, xferSummary, syncMerge, syncNews, syncUrl, syncWhen, syncAskText, syncCreate, syncLink, syncCheck, syncPush, syncImport, syncDecline, store, SYNC, XFER_KEYS, XFER_CHUNK, XFER_HOURS, SYNC_DB, SALTS: [SYNC.salt, SYNC.key, XFER.base] }';

/** Un aparato con RepArena (su almacén, su reloj, sus temporizadores, que no se disparan solos). */
function raDev(net: FakeNet, clock: { t: number }, o: { zip?: boolean; ua?: string; xr?: boolean } = {}) {
  const mem = new Mem();
  class D extends Date {
    constructor(...a: unknown[]) {
      super(...((a.length ? a : [clock.t]) as [number]));
    }
    static now() {
      return clock.t;
    }
  }
  const ra = raRun<RA>(CODE(), RET, {
    crypto: cr, localStorage: mem, fetch: net.fetch, TextEncoder, TextDecoder, btoa, atob, Blob, Response, Date: D,
    CompressionStream: o.zip === false ? undefined : CompressionStream, DecompressionStream,
    setTimeout: () => 0, clearTimeout: () => {}, xrActive: !!o.xr, navigator: { userAgent: o.ua || 'Mozilla' },
    location: { reload: () => {} },
  });
  return { ra, mem };
}
/** Un aparato con el porte. */
function xrDev(net: FakeNet, clock: { t: number }, o: { zip?: boolean; ua?: string; xr?: boolean } = {}) {
  const mem = new Mem();
  let hook: ((k: string, old: string | null) => void) | null = null;
  const store = (k: string, v?: unknown): unknown => {
    try {
      if (v === undefined) return JSON.parse(mem.getItem(k) as string);
      const old = mem.getItem(k);
      mem.setItem(k, JSON.stringify(v));
      hook?.(k, old);
    } catch {
      return null;
    }
    return null;
  };
  const env: XferEnv = {
    fetch: net.fetch, store, local: mem, crypto: cr, now: () => clock.t, setTimeout: () => 0, clearTimeout: () => {},
    reload: () => {}, inXR: () => !!o.xr, userAgent: () => o.ua || 'Mozilla', compress: o.zip !== false,
  };
  const sync = new Sync(env);
  hook = (k, old) => sync.touch(k, old);
  return { sync, xfer: sync.xfer, store, mem };
}
const dump = (m: Mem) => Object.fromEntries([...m.m.entries()].sort());

// ---------------------------------------------------------------- datos al azar
const KEYS = ['reparena3-settings', 'reparena3-ui', 'reparena3-history', 'reparena3-sessions', 'reparena3-career', 'reparena3-sndoff', 'reparena3-favs'];
function randVal(r: () => number, k: string): unknown {
  const n = (m: number) => Math.floor(r() * m);
  if (k === 'reparena3-history') return Array.from({ length: n(6) }, () => (r() < 0.05 ? null : { date: n(8), ex: ['squat', 'lunge'][n(2)], reps: n(3) }));
  if (k === 'reparena3-sessions' || k === 'reparena3-favs') return Array.from({ length: n(3) }, () => n(4));
  if (k === 'reparena3-sndoff') return r() < 0.5 ? n(2) : 'x' + n(3);
  if (r() < 0.1) return [n(3)];
  const o: Record<string, unknown> = {};
  for (const f of ['a', 'b', 'c', 'd', '1']) if (r() < 0.6) o[f] = r() < 0.2 ? { x: n(2) } : n(3);
  return o;
}
function randSide(r: () => number): SyncSide {
  const d: Record<string, unknown> = {}, kt: Record<string, Record<string, number>> = {};
  for (const k of KEYS) {
    if (r() < 0.7) d[k] = randVal(r, k);
    if (r() < 0.7) {
      const T: Record<string, number> = {};
      for (const f of ['a', 'b', 'c', 'd', '1', '*']) if (r() < 0.4) T[f] = Math.floor(r() * 5) * 100;
      kt[k] = T;
    }
  }
  return { d, kt: r() < 0.1 ? {} : kt };
}

describe.skipIf(!RA_DIR)('pasar datos y sincronizar, como en RepArena', () => {
  it('las mismas claves, trozos, horas, sales y servicios', () => {
    const { ra } = raDev(new FakeNet(), { t: 0 });
    expect([...ra.XFER_KEYS]).toEqual([...XFER_KEYS]);
    expect([ra.XFER_CHUNK, ra.XFER_HOURS, ra.SYNC_DB, ...ra.SALTS]).toEqual([XFER_CHUNK, XFER_HOURS, SYNC_DB, SYNC_SALT, SYNC_KEY, XFER_BASE]);
  });

  it('un paquete sellado por RepArena lo abre el porte y al revés (sales, con y sin comprimir)', async () => {
    const net = new FakeNet(), clock = { t: 0 };
    const obj = { v: 1, at: 5, from: 'gafas', d: { 'reparena3-settings': { mode: 'arcs', txt: 'ñandú «»' }, 'reparena3-history': Array.from({ length: 50 }, (_, i) => ({ date: i, ex: 'squat', reps: i })) }, kt: { 'reparena3-settings': { mode: 3 } } };
    for (const zip of [true, false]) {
      const { ra } = raDev(net, clock, { zip });
      for (const salt of [undefined, 'reparena-sync-v1']) {
        const a = await ra.xferSeal('87654321', obj, salt);
        expect(atob(a).charCodeAt(0)).toBe(zip ? 1 : 0);
        expect(await xferOpen(cr, '87654321', a, salt)).toEqual(obj);
        const b = await xferSeal(cr, '87654321', obj, salt, zip);
        expect(js(await ra.xferOpen('87654321', b, salt))).toEqual(obj);
        await expect(xferOpen(cr, '87654320', a, salt)).rejects.toThrow('no se pudo descifrar: revisa el código');
      }
      expect(await xferTopic(cr, '87654321')).toBe(await ra.xferTopic('87654321'));
    }
  });

  it('un envío por código de una versión se recibe y se carga igual en la otra', async () => {
    const net = new FakeNet(), clock = { t: Date.UTC(2026, 10, 11, 9) };
    const fill = (st: (k: string, v?: unknown) => unknown, r: () => number) => {
      for (const k of XFER_KEYS) if (r() < 0.8) st(k, k === 'reparena3-spotify' ? { clientId: 'c' + Math.floor(r() * 9), token: 't', lists: r() < 0.5 ? ['l'] : undefined, bpms: { a: 1 } } : k === 'reparena3-history' ? Array.from({ length: 900 }, (_, i) => ({ date: i, ex: 'squat', reps: Math.floor(r() * 30) })) : randVal(r, k));
      st('reparena3-room', { no: 1 });
    };
    for (let seed = 1; seed <= 6; seed++) {
      const A = raDev(net, clock, { xr: seed % 2 === 0 }), B = xrDev(net, clock, { xr: seed % 2 === 0 });
      fill(A.ra.store, rng(seed));
      fill(B.store, rng(seed));
      // RepArena manda, los dos reciben
      const code = await A.ra.xferSend();
      const p1 = await B.xfer.fetch(code), p2 = js(await A.ra.xferFetch(code));
      expect(p1).toEqual(p2);
      expect(xferSummary(p1)).toBe(A.ra.xferSummary(p2));
      // el porte manda (el mismo paquete que haría RepArena) y RepArena lo recibe
      const code2 = await B.xfer.send();
      const q = js(await A.ra.xferFetch(code2));
      expect(q).toEqual(js({ ...B.xfer.pack(), at: clock.t }));
      expect(q).toEqual(js(await B.xfer.fetch(code2)));
      expect(js(B.xfer.pack())).toEqual(p2); // (mismos datos de partida: mismo paquete)
      // cargar un paquete de otros datos en los dos
      const C = raDev(net, clock), other = rng(seed + 100);
      fill(C.ra.store, other);
      const code3 = await C.ra.xferSend(), p3 = js(await C.ra.xferFetch(code3));
      for (const merged of [false, true]) {
        const a2 = raDev(net, clock), b2 = xrDev(net, clock);
        fill(a2.ra.store, rng(seed));
        fill(b2.store, rng(seed));
        a2.ra.xferApply(js(p3), false, merged);
        b2.xfer.apply(js(p3), false, merged);
        expect(dump(b2.mem)).toEqual(dump(a2.mem));
      }
    }
  }, 60000);

  it('juntar y lo que trae: lo mismo en cientos de casos al azar', () => {
    const { ra } = raDev(new FakeNet(), { t: 0 }), r = rng(7);
    let news = 0;
    for (let i = 0; i < 800; i++) {
      const L = randSide(r), R = r() < 0.1 ? js(L) : randSide(r), pr = r() < 0.5;
      // (una partida rota en el historial de aquí rompe los dos igual)
      expect(out(() => syncMerge(js(L), js(R), pr))).toEqual(out(() => ra.syncMerge(js(L), js(R), pr)));
      const n = out(() => syncNews(js(L), js(R)));
      expect(n).toEqual(out(() => ra.syncNews(js(L), js(R))));
      if (n && n !== 'error') news++;
    }
    expect(news).toBeGreaterThan(100);
  });

  it('apuntar lo que cambia al guardar: lo mismo en cientos de pasos al azar', () => {
    const net = new FakeNet();
    for (let seed = 1; seed <= 5; seed++) {
      const clock = { t: 1000 }, A = raDev(net, clock), B = xrDev(net, clock), r = rng(seed);
      for (let i = 0; i < 300; i++) {
        clock.t += Math.floor(r() * 3) * 500;
        if (i === 20) A.ra.SYNC.ready = B.sync.ready = true;
        const k = r() < 0.1 ? 'reparena3-room' : KEYS[Math.floor(r() * KEYS.length)], v = r() < 0.3 && A.ra.store(k) ? A.ra.store(k) : randVal(r, k);
        A.ra.store(k, js(v));
        B.store(k, js(v));
        expect(dump(B.mem)).toEqual(dump(A.mem));
      }
      expect(B.sync.st().kt).toBeTruthy();
    }
  });

  it('textos: el resumen, cuándo y la pregunta', () => {
    const net = new FakeNet(), clock = { t: Date.UTC(2026, 2, 29, 12) }, { ra } = raDev(net, clock), B = xrDev(net, clock), r = rng(3);
    for (let i = 0; i < 200; i++) {
      const at = clock.t - Math.floor(r() * 40 * 864e5), news = { sets: Math.floor(r() * 3), other: Math.floor(r() * 3), games: Math.floor(r() * 3) };
      const m = { at, from: r() < 0.3 ? undefined : ['las gafas', 'el móvil'][Math.floor(r() * 2)], news };
      expect(B.sync.when(at)).toBe(ra.syncWhen(at));
      expect(B.sync.askText(m)).toBe(ra.syncAskText(m));
      const p = { v: 1 as const, d: { 'reparena3-session': { blocks: Array(Math.floor(r() * 3)).fill(0) }, 'reparena3-sessions': Array(Math.floor(r() * 3)).fill(0), 'reparena3-history': Array(Math.floor(r() * 3)).fill(0) } };
      expect(xferSummary(p)).toBe(ra.xferSummary(p));
    }
  });

  it('sincronizar un aparato con RepArena y otro con el porte por el mismo Firebase', async () => {
    const net = new FakeNet(), clock = { t: Date.UTC(2026, 10, 11, 8) };
    const pc = raDev(net, clock), quest = xrDev(net, clock, { ua: 'OculusBrowser' });
    pc.ra.SYNC.ready = quest.sync.ready = true;
    pc.ra.store('reparena3-settings', { mode: 'arcs', vol: 5 });
    pc.ra.store('reparena3-history', [{ date: 1, ex: 'squat', reps: 10 }]);
    clock.t += 1000;
    quest.store('reparena3-settings', { mode: 'combat', vol: 5 });
    quest.store('reparena3-history', [{ date: 2, ex: 'lunge', reps: 4 }]);
    clock.t += 1000;
    const code = await pc.ra.syncCreate();
    expect(await (async () => { quest.sync.set({ code }); return quest.sync.url(); })()).toBe(await pc.ra.syncUrl());
    quest.sync.set({ code: null });
    clock.t += 1000;
    pc.ra.store('reparena3-settings', { mode: 'arcs', vol: 8 });
    await pc.ra.syncPush();
    clock.t += 1000;
    const ask = await quest.sync.link(code);
    expect(ask?.news).toEqual({ sets: 1, other: 0, games: 1 });
    expect(ask?.from).toBe('el ordenador');
    await quest.sync.import(ask!, false);
    expect(quest.store('reparena3-settings')).toEqual({ mode: 'combat', vol: 8 });
    expect((quest.store('reparena3-history') as unknown[]).length).toBe(2);
    clock.t += 1000;
    quest.store('reparena3-settings', { mode: 'combat', vol: 9 });
    await quest.sync.push();
    // RepArena ve lo del porte, lo importa y se queda igual que el porte
    const ask2 = await pc.ra.syncCheck();
    expect(js(ask2)?.news).toEqual({ sets: 2, other: 0, games: 1 });
    expect(ask2?.from).toBe('las gafas');
    await pc.ra.syncImport(ask2, false);
    expect(js(pc.ra.store('reparena3-settings'))).toEqual({ mode: 'combat', vol: 9 });
    expect(js(pc.ra.store('reparena3-history'))).toEqual(quest.store('reparena3-history'));
    // lo último de arriba es del porte y ya está subido: no pregunta ni sube nada
    expect(await quest.sync.check()).toBeNull();
  }, 60000);
});
