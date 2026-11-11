// El pulsómetro (src/services/pulse.ts): los paquetes con sus banderas, las zonas, conectar y reconectar con un Bluetooth
// falso, y el pulso que pasa el móvil a las gafas (cifrado con el código, uno por segundo como mucho, y lo que se acepta).
import { describe, expect, it } from 'vitest';
import { Pulse, hrCol, hrParseValue, hrZone, type PulseEnv } from '../../src/services/pulse.js';
import { FakeBt, FakeDb, FakeES, FakeHrDevice, hrPacket, until } from './pulse-sim.js';

const DB = 'https://db.example/';
function mk(o: Partial<PulseEnv> & { code?: string } = {}) {
  const clock = { t: 1000, w: 1_700_000_000_000 }, mem = new Map<string, string>(), status: [string, boolean][] = [], timers: (() => void)[] = [];
  if (o.code) mem.set('reparena3-sync', JSON.stringify({ code: o.code }));
  const bt = new FakeBt(), db = new FakeDb();
  const env: PulseEnv = {
    now: () => clock.t,
    wall: () => clock.w,
    bluetooth: bt,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile',
    fetch: db.fetch,
    crypto: globalThis.crypto,
    store: <T,>(k: string, v?: T): T | null => {
      if (v === undefined) return mem.has(k) ? (JSON.parse(mem.get(k)!) as T) : null;
      mem.set(k, JSON.stringify(v));
      return null;
    },
    syncDb: DB,
    inXR: () => false,
    hrMax: () => 190,
    setTimeout: (fn) => timers.push(fn),
    EventSource: null,
    wakeLock: null,
    hidden: () => false,
    onStatus: (t, b) => status.push([t, b]),
    ...o,
  };
  return { p: new Pulse(env), env, clock, bt, db, status, timers, mem };
}

describe('los paquetes y las zonas', () => {
  it('8 o 16 bits según el bit 0; los demás bits no cuentan', () => {
    expect(hrParseValue(hrPacket(0, 72))).toBe(72);
    expect(hrParseValue(hrPacket(0x16, 140, 4))).toBe(140); // (contacto, energía y RR)
    expect(hrParseValue(hrPacket(1, 200))).toBe(200);
    expect(hrParseValue(hrPacket(0x11, 300 + 256 * 0))).toBeNull(); // (fuera de 30–240)
    expect(hrParseValue(hrPacket(0, 20))).toBeNull();
    expect(hrParseValue(hrPacket(1, 240))).toBe(240);
  });
  it('los colores por zonas, con el pulso máximo', () => {
    expect([100, 114, 133, 152, 171, 200].map((b) => hrZone(b, 190))).toEqual([0, 1, 2, 3, 4, 4]);
    expect(hrCol(113, 190)).toBe('#7fd4ff');
    expect(hrCol(114, 190)).toBe('#3cf0c6');
    expect(hrCol(150, 150)).toBe('#ff3b5c');
  });
  it('sin datos en 6 s, no hay pulso; el máximo de la sesión se queda', () => {
    const { p, clock } = mk();
    p.parse(hrPacket(0, 150));
    clock.t += 500;
    p.parse(hrPacket(1, 120));
    expect(p.board()).toEqual({ bpm: 120, col: '#3cf0c6' });
    expect(p.hr.max).toBe(150);
    clock.t += 6000;
    expect(p.bpm()).toBe(0);
    expect(p.board()).toBeNull();
  });
});

describe('conectar', () => {
  it('sin Bluetooth: en las gafas, por el móvil; si no, otro navegador', async () => {
    const a = mk({ bluetooth: null, userAgent: 'OculusBrowser Quest 3' });
    await a.p.connect();
    expect(a.status[0][0]).toMatch(/^El navegador de las gafas/);
    const b = mk({ bluetooth: null });
    await b.p.connect();
    expect(b.status[0]).toEqual([expect.stringMatching(/^Este navegador no deja/), true]);
  });
  it('Bluetooth apagado, nada elegido y error al conectar', async () => {
    const a = mk();
    a.bt.avail = false;
    await a.p.connect();
    expect(a.status.at(-1)![0]).toMatch(/apagado/);
    const b = mk();
    await b.p.connect();
    expect(b.status.at(-1)![0]).toMatch(/^No apareció ninguno/);
    const c = mk(), d = new FakeHrDevice('Banda');
    d.fail = 'connect';
    c.bt.next = d;
    await c.p.connect();
    expect(c.status.at(-1)).toEqual(['No se pudo conectar: GATT no responde', true]);
  });
  it('conecta, lee el pulso, se pierde, reintenta cinco veces y se rinde', async () => {
    const { p, bt, status, timers } = mk(), d = new FakeHrDevice('Amazfit');
    bt.next = d;
    await p.connect();
    expect(status.map((s) => s[0])).toEqual(['Elige tu reloj o pulsómetro en la lista…', 'Conectando con Amazfit…', expect.stringMatching(/^Conectado: Amazfit\. Para verlo en las gafas/)]);
    d.emit(hrPacket(0, 99));
    expect(p.bpm()).toBe(99);
    d.fail = 'connect';
    d.drop();
    for (let i = 0; i < 5; i++) {
      expect(status.at(-1)![0]).toBe('Se perdió el pulsómetro: reconectando…');
      timers.shift()!();
      await until(() => p.hr.tries === i + 2 || p.hr.tries > 5);
    }
    expect(status.at(-1)).toEqual(['Se perdió el pulsómetro. Vuelve a pulsar «Conectar pulsómetro».', true]);
    p.off();
    expect(p.hr.dev).toBeNull();
    expect(status.at(-1)![0]).toBe('Desconectado.');
  });
});

describe('del móvil a las gafas', () => {
  it('manda cifrado, uno por segundo como mucho (y el mismo, cada 4 s); las gafas lo abren', async () => {
    const m = mk({ code: '12345678' }), d = new FakeHrDevice('Banda');
    m.bt.next = d;
    await m.p.connect();
    // (cada envío se espera: mientras uno va de camino, no sale otro)
    const at = async (dt: number, b: number) => {
      m.clock.t += dt;
      m.clock.w += dt;
      const s = m.p.send(b);
      if (s) await s;
      return !!s;
    };
    const got: boolean[] = [];
    for (const [dt, b] of [[0, 100], [300, 101], [800, 101], [1200, 101], [3000, 101]]) got.push(await at(dt, b));
    // 0: sale; +0,3 s: no (menos de 1 s); +1,1 s: sí (otro pulso); +1,2 s: el mismo, no (menos de 4 s); +3 s: sí
    expect(got).toEqual([true, false, true, false, true]);
    expect(m.db.calls.filter((c) => c.method === 'PUT')).toHaveLength(3);
    const put = JSON.parse(m.db.calls[0].body!);
    expect(put.meta).toMatchObject({ n: 0, from: 'el móvil' });
    expect(put.meta.dev).toMatch(/^[0-9a-f]{12}$/);
    expect(m.db.calls[0].url).toMatch(/^https:\/\/db\.example\/sync\/[0-9a-f]{64}\.json$/);
    // las gafas, con el mismo código
    const g = mk({ code: '12345678', userAgent: 'OculusBrowser', bluetooth: null });
    g.clock.w = m.clock.w;
    expect(await g.p.take(m.db.data.get(m.db.calls[0].url))).toBe(true);
    expect(g.p.bpm()).toBe(101);
    expect(g.p.hr.from).toBe('el móvil');
    expect(g.status.at(-1)![0]).toBe('Tu pulso llega desde el móvil, por la sincronización.');
    // otra vez el mismo: no es más nuevo
    expect(await g.p.take(m.db.data.get(m.db.calls[0].url))).toBe(false);
    // con otro código no se abre
    const o = mk({ code: '87654321' });
    o.clock.w = m.clock.w;
    expect(await o.p.take({ blob: put.blob })).toBe(false);
  });
  it('en las gafas o sin código no se manda; si Firebase falla, lo dice', async () => {
    expect(mk({ code: '1', inXR: () => true }).p.send(90)).toBeUndefined();
    expect(mk().p.send(90)).toBeUndefined();
    const m = mk({ code: '12345678' }), d = new FakeHrDevice('B');
    m.bt.next = d;
    await m.p.connect();
    m.db.status = 401;
    await m.p.send(90);
    expect(m.status.at(-1)).toEqual(['Conectado: B. No se pudo pasar el pulso a las gafas (Firebase respondió 401): lo intento otra vez.', true]);
  });
  it('un pulso de hace más de 15 s o fuera de rango no vale', async () => {
    const g = mk({ code: '5' });
    const blob = (b: number, t: number) => g.p.seal({ b, t, m: 0, w: 'el móvil' });
    expect(await g.p.take({ blob: await blob(90, g.clock.w - 16000) })).toBe(false);
    expect(await g.p.take({ blob: await blob(250, g.clock.w) })).toBe(false);
    expect(await g.p.take({ blob: 'basura' })).toBe(false);
    expect(await g.p.take(null)).toBe(false);
    expect(await g.p.take({ blob: await blob(90, g.clock.w + 14000) })).toBe(true);
  });
  it('las gafas escuchan con el flujo y, si Firebase no deja, preguntan cada 2 s', async () => {
    FakeES.all = [];
    const g = mk({ code: '42', EventSource: FakeES });
    g.p.step(0.1);
    await until(() => FakeES.all.length === 1);
    const es = FakeES.all[0];
    const blob = await g.p.seal({ b: 133, t: g.clock.w, m: 150, w: 'el móvil' });
    es.fire('put', { path: '/', data: { blob } });
    await until(() => g.p.bpm() === 133);
    expect(g.p.hr.max).toBe(150);
    es.fire('cancel', {});
    expect(es.closed).toBe(true);
    expect(g.p.hrx.noStream).toBe(true);
    for (let i = 0; i < 10; i++) {
      g.p.step(0.5);
      await new Promise((r) => setTimeout(r, 5));
    }
    const gets = g.db.calls.filter((c) => c.method === 'GET').length;
    expect(gets).toBeGreaterThanOrEqual(2);
    expect(gets).toBeLessThanOrEqual(3);
  });
});
