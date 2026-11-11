// Pasar los datos a otro dispositivo y la sincronización (src/services/xfer.ts): paquetes cifrados de ida y vuelta, códigos
// malos, el servicio de mensajes (ntfy) con trozos de 3000 caracteres, Firebase simulado y la fusión de los dos aparatos.
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  Sync, Xfer, XFER_CHUNK, XFER_KEYS, histMerge, syncCodeOk, syncFmt, syncMerge, syncNews, xferCodeOk, xferFmt, xferOpen,
  xferSeal, xferSummary, type XferEnv, type XferResponse,
} from '../../src/services/xfer.js';

const cr = webcrypto as unknown as Crypto;
const res = (status: number, body: string): XferResponse => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

/** Un ntfy y un Firebase en memoria. */
class FakeNet {
  topics = new Map<string, string[]>();
  db = new Map<string, unknown>();
  posts = 0;
  fail = 0;
  fetch = async (url: string, init?: { method?: string; body?: string }): Promise<XferResponse> => {
    if (this.fail) return res(this.fail, '');
    const u = new URL(url);
    if (u.host === 'ntfy.sh') {
      const topic = u.pathname.split('/')[1];
      if (init?.method === 'POST') {
        this.posts++;
        const l = this.topics.get(topic) || [];
        l.push(JSON.stringify({ event: 'message', message: init.body }));
        this.topics.set(topic, l);
        return res(200, '{}');
      }
      return res(200, [JSON.stringify({ event: 'open' }), ...(this.topics.get(topic) || []), 'basura'].join('\n'));
    }
    // Firebase: /sync/<hueco>.json y /sync/<hueco>/meta.json
    const p = u.pathname.replace(/\.json$/, '').split('/').slice(2);
    if (init?.method === 'PUT') {
      this.db.set(p[0], JSON.parse(init.body as string));
      return res(200, init.body as string);
    }
    const v = this.db.get(p[0]) as Record<string, unknown> | undefined;
    return res(200, JSON.stringify(p[1] ? (v ? v[p[1]] : null) : v ?? null));
  };
}

/** Un aparato: su almacén, su reloj y sus temporizadores (a mano). */
function device(net: FakeNet, ua = 'Mozilla', t0 = Date.UTC(2026, 10, 11, 10)) {
  const mem = new Map<string, string>();
  const timers: { fn: () => void; at: number }[] = [];
  let now = t0, reloads = 0;
  let hook: ((k: string, old: string | null) => void) | null = null;
  const store = (k: string, v?: unknown): unknown => {
    if (v === undefined) return mem.has(k) ? JSON.parse(mem.get(k) as string) : null;
    const old = mem.get(k) ?? null;
    mem.set(k, JSON.stringify(v));
    hook?.(k, old);
    return null;
  };
  const env: XferEnv = {
    fetch: net.fetch, store, local: { getItem: (k) => mem.get(k) ?? null }, crypto: cr, now: () => now,
    setTimeout: (fn, ms) => timers.push({ fn, at: now + ms }), clearTimeout: () => {}, reload: () => reloads++,
    userAgent: () => ua,
  };
  const sync = new Sync(env);
  hook = (k, old) => sync.touch(k, old);
  return {
    mem, env, sync, xfer: sync.xfer, store,
    get reloads() { return reloads; },
    tick(ms: number) { now += ms; for (const t of timers.splice(0)) if (t.at <= now) t.fn(); else timers.push(t); },
  };
}

describe('paquetes cifrados', () => {
  it('ida y vuelta, comprimido y sin comprimir', async () => {
    const obj = { v: 1, d: { 'reparena3-settings': { mode: 'arcs', ñ: 'tildes áé' } }, kt: {} };
    for (const z of [true, false]) {
      const s = await xferSeal(cr, '12345678', obj, undefined, z);
      expect(atob(s).charCodeAt(0)).toBe(z ? 1 : 0);
      expect(await xferOpen(cr, '12345678', s)).toEqual(obj);
    }
  });
  it('otro código u otra sal: no se descifra; lo que no es de RepArena, tampoco', async () => {
    const s = await xferSeal(cr, '12345678', { v: 1, d: {} });
    await expect(xferOpen(cr, '12345679', s)).rejects.toThrow('no se pudo descifrar: revisa el código');
    await expect(xferOpen(cr, '12345678', s, 'reparena-sync-v1')).rejects.toThrow('no se pudo descifrar');
    await expect(xferOpen(cr, '1', await xferSeal(cr, '1', { v: 2, d: {} }))).rejects.toThrow('el envío no es de RepArena');
  });
  it('códigos y formatos', () => {
    expect(xferCodeOk('1234 5678')).toBe(true);
    expect(xferCodeOk('1234567')).toBe(false);
    expect(xferFmt('12345678')).toBe('1234 5678');
    expect(syncCodeOk('1234-5678-1234-5678')).toBe(true);
    expect(syncFmt('1234567812345678')).toBe('1234 5678 1234 5678');
  });
  it('historial: unido, sin repetir, por fecha y con las 400 últimas', () => {
    const r = (date: number, ex = 'squat', reps = 10) => ({ date, ex, reps });
    expect(histMerge([r(3), r(1)], [r(1), r(2), null])).toEqual([r(1), r(2), r(3)]);
    const many = Array.from({ length: 500 }, (_, i) => r(i));
    expect(histMerge(many, []).length).toBe(400);
    expect((histMerge(many, [])[0] as { date: number }).date).toBe(100);
  });
});

describe('por código (ntfy)', () => {
  it('envía en trozos de 3000 y el otro lo abre; Spotify sin el inicio de sesión', async () => {
    const net = new FakeNet(), a = device(net), b = device(net);
    const hist = Array.from({ length: 300 }, (_, i) => ({ date: i, ex: 'squat', reps: (i * 7919) % 97, note: Math.random().toString(36) }));
    a.store('reparena3-history', hist);
    a.store('reparena3-settings', { mode: 'arcs' });
    a.store('reparena3-session', { blocks: [1, 2] });
    a.store('reparena3-spotify', { clientId: 'app', token: 'secreto', lists: ['x'] });
    a.store('reparena3-room', { no: 'viaja' });
    const code = await a.xfer.send();
    expect(code).toMatch(/^\d{8}$/);
    expect(net.posts).toBeGreaterThan(1);
    const msgs = [...net.topics.values()][0].map((l) => JSON.parse(l).message as string);
    for (const m of msgs) expect(m.split('|')[4].length).toBeLessThanOrEqual(XFER_CHUNK);
    b.store('reparena3-history', [{ date: -1, ex: 'lunge', reps: 3 }, hist[0]]);
    b.store('reparena3-spotify', { token: 'mío' });
    const p = await b.xfer.fetch(xferFmt(code));
    expect(Object.keys(p.d)).not.toContain('reparena3-room');
    expect(p.d['reparena3-spotify']).toEqual({ clientId: 'app', lists: ['x'] });
    expect(xferSummary(p)).toBe('2 bloques de sesión · 0 sesiones guardadas · 300 partidas en el historial · ajustes');
    b.xfer.apply(p);
    expect((b.store('reparena3-history') as unknown[]).length).toBe(301);
    expect(b.store('reparena3-spotify')).toEqual({ token: 'mío', clientId: 'app', lists: ['x'] });
    expect(b.store('reparena3-settings')).toEqual({ mode: 'arcs' });
    expect(b.reloads).toBe(0);
    b.tick(300);
    expect(b.reloads).toBe(1);
  });
  it('el último envío entero gana; incompleto, vacío o código malo: errores en español', async () => {
    const net = new FakeNet(), a = device(net), b = device(net);
    await expect(b.xfer.fetch('123')).rejects.toThrow('el código tiene 8 cifras');
    await expect(b.xfer.fetch('00000000')).rejects.toThrow('no hay nada con ese código (¿caducó? duran 12 h)');
    a.store('reparena3-settings', { n: 1 });
    const code = await a.xfer.send();
    // (un envío más reciente a medias: vale el anterior, que está entero)
    const topic = [...net.topics.keys()][0];
    net.topics.get(topic)?.push(JSON.stringify({ event: 'message', message: 'RA1|zz|0|2|abc' }));
    expect((await b.xfer.fetch(code)).d['reparena3-settings']).toEqual({ n: 1 });
    net.topics.set(topic, [JSON.stringify({ event: 'message', message: 'RA1|zz|0|2|abc' })]);
    await expect(b.xfer.fetch(code)).rejects.toThrow('el envío llegó incompleto: vuelve a enviarlo');
    net.fail = 503;
    await expect(a.xfer.send()).rejects.toThrow('el servicio respondió 503');
  });
  it('todas las claves de RepArena', () => {
    expect(XFER_KEYS.length).toBe(17);
    expect(XFER_KEYS).toContain('reparena3-devon');
  });
});

describe('juntar los dos aparatos', () => {
  it('de cada ajuste, el más nuevo; lo demás, entero; el historial, sumado', () => {
    const L = { d: { 'reparena3-settings': { a: 1, b: 1 }, 'reparena3-ui': [1], 'reparena3-history': [{ date: 1, ex: 'x', reps: 1 }] }, kt: { 'reparena3-settings': { a: 10, b: 30 }, 'reparena3-ui': { '*': 50 } } };
    const R = { d: { 'reparena3-settings': { a: 2, b: 2, c: 2 }, 'reparena3-ui': [2], 'reparena3-history': [{ date: 1, ex: 'x', reps: 1 }, { date: 2, ex: 'x', reps: 1 }], 'reparena3-favs': ['f'] }, kt: { 'reparena3-settings': { a: 20, b: 20 }, 'reparena3-ui': { '*': 40 } } };
    const M = syncMerge(L, R);
    // (c, sin hora en ningún lado: empate, y aquí no está)
    expect(M.d['reparena3-settings']).toEqual({ a: 2, b: 1 });
    expect(M.d['reparena3-ui']).toEqual([1]);
    expect((M.d['reparena3-history'] as unknown[]).length).toBe(2);
    expect(M.d['reparena3-favs']).toEqual(['f']);
    expect(M.kt['reparena3-settings']).toEqual({ a: 20, b: 30 });
    // (empate: lo de aquí; al importar, lo de allí)
    expect(syncMerge({ d: { k: 1 } }, { d: { k: 2 } }).d.k).toBe(1);
    expect(syncMerge({ d: { k: 1 } }, { d: { k: 2 } }, true).d.k).toBe(2);
    expect(syncNews(L, R)).toEqual({ sets: 1, other: 1, games: 1 });
    expect(syncNews(R, R)).toBeNull();
  });
});

describe('sincronización (Firebase)', () => {
  it('crear, vincular, preguntar, importar y declinar', async () => {
    const net = new FakeNet(), pc = device(net, 'Mozilla'), quest = device(net, 'OculusBrowser', Date.UTC(2026, 10, 11, 10) + 1000);
    pc.sync.ready = quest.sync.ready = true;
    pc.store('reparena3-settings', { mode: 'arcs', vol: 5 });
    pc.store('reparena3-history', [{ date: 1, ex: 'squat', reps: 10 }]);
    const code = await pc.sync.create();
    expect(code).toMatch(/^\d{16}$/);
    expect(pc.sync.status().linked).toBe(true);
    await expect(quest.sync.link('123')).rejects.toThrow('el código tiene 16 cifras');
    quest.store('reparena3-settings', { mode: 'combat', vol: 5 });
    pc.tick(5000);
    pc.store('reparena3-settings', { mode: 'arcs', vol: 7 }); // (más nuevo en el PC: el volumen)
    pc.tick(4000);
    await new Promise((r) => setTimeout(r, 0));
    while (pc.sync.busy) await new Promise((r) => setTimeout(r, 10));
    const ask = await quest.sync.link(code);
    expect(ask?.news).toEqual({ sets: 1, other: 0, games: 1 });
    expect(quest.sync.askText(ask!)).toMatch(/^El ordenador tiene cambios más recientes \(hoy a las .*: 1 ajuste, 1 partida\)\. ¿Importarlos\?/);
    await quest.sync.import(ask!);
    // (el modo de las gafas es más nuevo que el del PC; el volumen, no)
    expect(quest.store('reparena3-settings')).toEqual({ mode: 'combat', vol: 7 });
    expect(quest.store('reparena3-history')).toEqual([{ date: 1, ex: 'squat', reps: 10 }]);
    quest.tick(300);
    expect(quest.reloads).toBe(1);
    // las gafas suben lo suyo; el PC ve la novedad y dice «Ahora no»
    await quest.sync.push();
    const ask2 = await pc.sync.check();
    expect(ask2?.news.sets).toBe(1);
    expect(ask2?.from).toBe('las gafas');
    pc.sync.decline(ask2!);
    expect(await pc.sync.check()).toBeNull();
    pc.sync.unlink();
    expect(pc.sync.on()).toBe(false);
  });
  it('lo que se guarda antes de estar listo o al importar no cuenta', () => {
    const net = new FakeNet(), a = device(net);
    a.store('reparena3-settings', { x: 1 });
    expect(a.sync.st().kt).toBeUndefined();
    a.sync.ready = true;
    a.store('reparena3-settings', { x: 1 });
    expect(a.sync.st().kt).toBeUndefined(); // (sin cambios)
    a.store('reparena3-settings', { x: 2 });
    expect(a.sync.st().kt).toEqual({ 'reparena3-settings': { x: a.env.now() } });
    a.store('reparena3-room', { y: 1 });
    expect(Object.keys(a.sync.st().kt || {})).toEqual(['reparena3-settings']);
  });
  it('errores de Firebase', async () => {
    const net = new FakeNet(), a = device(net);
    a.sync.set({ code: '1234567812345678' });
    net.fail = 401;
    await expect(a.sync.check()).rejects.toThrow('Firebase respondió 401');
  });
});
