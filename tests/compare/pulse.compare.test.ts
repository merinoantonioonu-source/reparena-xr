// El pulsómetro portado (src/services/pulse.ts) frente al código original de RepArena (src/57_pulse.js, con el cifrado y la
// sincronización de src/69_xfer.js): los mismos paquetes al azar (banderas de 8 y 16 bits, bytes de más, valores fuera de
// rango), las mismas conexiones con un Bluetooth falso, los mismos envíos del móvil y lo mismo que llega a las gafas;
// tienen que quedar iguales el pulso, los textos de estado, lo que se manda a Firebase y lo que se acepta. Lo cifrado por
// uno lo abre el otro (misma clave, mismo hueco, misma forma). (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { describe, expect, it } from 'vitest';
import { Pulse, type PulseEnv } from '../../src/services/pulse.js';
import { FakeBt, FakeDb, FakeES, FakeHrDevice, hrPacket, until } from '../unit/pulse-sim.js';
import { Mem, RA_DIR, raRun, raSlice } from './ra.js';

const DB = 'https://db.example';
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const SEEDS = (process.env.SEEDS || '1,2,3').split(',').map(Number);

type El = { textContent: string; style: { color: string }; disabled: boolean; addEventListener: () => void };
type RaHR = { dev: unknown; char: unknown; bpm: number; t: number; st: string; bad: boolean; tries: number; max: number; from?: string };
type RaApi = {
  HR: RaHR;
  HRX: { busy: boolean; opening: boolean; polling: boolean; noStream: boolean; es: unknown; lastT: number; note: string };
  hrParse(dv: DataView): void;
  hrNow(): number;
  hrCol(b: number): string;
  hrConnect(): Promise<void>;
  hrOff(q?: boolean): void;
  hrInitPage(): void;
  hrxSend(v: number): void;
  hrxTake(n: unknown): Promise<boolean>;
  hrxStep(dt: number): void;
  hrxSeal(o: unknown): Promise<string>;
  hrxOpen(s: string): Promise<unknown>;
};

/** Lo de fuera, igual para los dos: reloj, almacén (con el código), Bluetooth, Firebase, flujo y temporizadores. */
function world(o: { code?: string; ua?: string; bt?: boolean; es?: boolean; hrMax?: number; db?: string; xr?: boolean } = {}) {
  const clock = { t: 5000, w: 1_700_000_000_000 }, mem = new Mem(), timers: (() => void)[] = [];
  if (o.code) mem.setItem('reparena3-sync', JSON.stringify({ code: o.code, dev: 'a1b2c3d4e5f6' }));
  const bt = o.bt === false ? null : new FakeBt(), db = new FakeDb(), es: FakeES[] = [];
  class ES extends FakeES {
    constructor(u: string) {
      super(u);
      es.push(this);
    }
  }
  return { clock, mem, timers, bt, db, es, ES: o.es ? ES : null, ua: o.ua ?? 'Mozilla/5.0 (Linux; Android 14) Mobile', hrMax: o.hrMax ?? 190, syncDb: o.db ?? DB, xr: !!o.xr };
}
type W = ReturnType<typeof world>;

function original(w: W) {
  const els: Record<string, El> = {}, status: [string, boolean, boolean][] = [];
  const el = (): El => ({ textContent: '', style: { color: '' }, disabled: false, addEventListener: () => {} });
  for (const id of ['#hrStatus', '#btnHrOff', '#hrNow', '#btnHr']) els[id] = el();
  // cada cambio de #hrStatus, apuntado (con su color de error y si se puede desconectar)
  const st = els['#hrStatus'];
  let txt = '';
  Object.defineProperty(st, 'textContent', { get: () => txt, set: (v: string) => { txt = v; queueMicrotask(() => {}); } });
  let col = '';
  Object.defineProperty(st.style, 'color', {
    get: () => col,
    set: (v: string) => {
      col = v;
      status.push([txt, v === 'var(--red)', !els['#btnHrOff'].disabled]);
    },
  });
  const code = [
    'const SYNC_DB = __db;',
    'let storeHook = null;',
    raSlice('00_core.js', 'function store(k, v)'),
    raSlice('69_xfer.js', 'const _xEnc = ', 'const xferCodeOk', false),
    raSlice('69_xfer.js', 'async function xferKey(', '}'),
    raSlice('69_xfer.js', 'const SYNC = {', 'const syncWho ='),
    'let boardDirty = false;',
    raSlice('57_pulse.js', 'const HR = {', 'function drawPulse(', false),
  ].join('\n');
  // (hrStatus pone primero el texto y luego el color: el color cierra cada aviso; btnHrOff va detrás, se mira al acabar)
  const api = raRun<RaApi>(code, '{ HR, HRX, hrParse, hrNow, hrCol, hrConnect, hrOff, hrInitPage, hrxSend, hrxTake, hrxStep, hrxSeal, hrxOpen }', {
    __db: w.syncDb,
    localStorage: w.mem,
    settings: { hrMax: w.hrMax },
    $: (s: string) => els[s] ?? null,
    performance: { now: () => w.clock.t },
    Date: { now: () => w.clock.w },
    navigator: { bluetooth: w.bt ?? undefined, userAgent: w.ua },
    crypto: globalThis.crypto,
    fetch: w.db.fetch,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    setTimeout: (fn: () => void) => w.timers.push(fn),
    EventSource: w.ES ?? undefined,
    get xrActive() {
      return w.xr;
    },
  });
  return { api, els, status };
}
function port(w: W) {
  const status: [string, boolean, boolean][] = [], bpm: [number, string][] = [];
  const env: PulseEnv = {
    now: () => w.clock.t,
    wall: () => w.clock.w,
    bluetooth: w.bt,
    userAgent: w.ua,
    fetch: w.db.fetch,
    crypto: globalThis.crypto,
    store: <T,>(k: string, v?: T): T | null => {
      if (v === undefined) return JSON.parse(w.mem.getItem(k) as string) as T;
      w.mem.setItem(k, JSON.stringify(v));
      return null;
    },
    syncDb: w.syncDb,
    inXR: () => w.xr,
    hrMax: () => w.hrMax,
    setTimeout: (fn) => w.timers.push(fn),
    EventSource: w.ES,
    wakeLock: null,
    hidden: () => false,
    onStatus: (t, b, c) => status.push([t, b, c]),
    onBpm: (b, c) => bpm.push([b, c]),
  };
  return { p: new Pulse(env), status, bpm };
}
const hrState = (H: RaHR) => ({ bpm: H.bpm, t: H.t, max: H.max, from: H.from ?? '', tries: H.tries, st: H.st, bad: H.bad });

/** Un paquete al azar: banderas (con bits de más), 8 o 16 bits, a veces fuera de rango, a veces con intervalos RR. */
function randomPacket(r: () => number): DataView {
  const flags = Math.floor(r() * 32), big = flags & 1, x = r();
  const v = x < 0.1 ? Math.floor(r() * 30) : x < 0.2 ? 241 + Math.floor(r() * (big ? 65000 : 14)) : 30 + Math.floor(r() * 211);
  return hrPacket(flags, v, Math.floor(r() * 5));
}

// (con un margen de tiempo: el cifrado y las 250 operaciones en los dos tardan, más aún con las demás pruebas a la vez)
describe.skipIf(!RA_DIR)('el pulsómetro, igual que RepArena', { timeout: 30000 }, () => {
  for (const seed of SEEDS) {
    it(`semilla ${seed}: 400 paquetes al azar (pulso, máximo, edad y color de la zona)`, () => {
      const r = rng(seed), w = world({ hrMax: 120 + Math.floor(r() * 100), db: '' }), O = original(w), P = port(w);
      for (let i = 0; i < 400; i++) {
        w.clock.t += r() < 0.1 ? 4000 + r() * 4000 : r() * 1500;
        if (r() < 0.8) {
          const dv = randomPacket(r);
          O.api.hrParse(dv);
          P.p.parse(dv);
        }
        expect(hrState(P.p.hr as RaHR), `paso ${i}`).toEqual(hrState(O.api.HR));
        expect(P.p.bpm(), `paso ${i}`).toBe(O.api.hrNow());
        const b = 30 + Math.floor(r() * 211);
        expect(P.p.col(b)).toBe(O.api.hrCol(b));
      }
      // lo que sale en la página (#hrNow): el último número y su color
      const last = P.bpm.at(-1)!;
      expect(`♥ ${last[0]} lpm`).toBe(O.els['#hrNow'].textContent);
      expect(last[1]).toBe(O.els['#hrNow'].style.color);
    });
  }

  // conectar: los mismos casos en los dos (sin Bluetooth, apagado, nada elegido, errores, reconexiones y desconectar)
  type Case = { name: string; ua?: string; bt?: boolean; run: (w: W, d: FakeHrDevice, go: () => Promise<void>, drop: () => Promise<void>) => Promise<void> };
  const CASES: Case[] = [
    { name: 'sin Bluetooth, en las gafas', ua: 'Mozilla/5.0 OculusBrowser/30 Quest 3', bt: false, run: async (_w, _d, go) => go() },
    { name: 'sin Bluetooth, en otro navegador', ua: 'Mozilla/5.0 (iPhone)', bt: false, run: async (_w, _d, go) => go() },
    { name: 'Bluetooth apagado', run: async (w, _d, go) => { w.bt!.avail = false; await go(); } },
    { name: 'sin getAvailability y nada elegido', run: async (w, _d, go) => { w.bt!.hasAvail = false; w.bt!.next = null; await go(); } },
    { name: 'otro error al pedirlo', run: async (w, _d, go) => { w.bt!.next = new Error('SecurityError: sin gesto'); await go(); } },
    { name: 'no conecta', run: async (w, d, go) => { d.fail = 'connect'; w.bt!.next = d; await go(); } },
    { name: 'no avisa', run: async (w, d, go) => { d.fail = 'notify'; w.bt!.next = d; await go(); } },
    { name: 'conecta, se pierde y vuelve a la tercera', run: async (w, d, go, drop) => { w.bt!.next = d; await go(); d.fail = 'connect'; await drop(); } },
    { name: 'conecta, se pierde del todo y se desconecta', run: async (w, d, go, drop) => { w.bt!.next = d; await go(); d.fail = 'connect'; await drop(); } },
  ];
  for (const c of CASES) {
    it(`conectar: ${c.name}`, async () => {
      const res = await Promise.all(
        ['ra', 'port'].map(async (who) => {
          const w = world({ ua: c.ua, bt: c.bt }), d = new FakeHrDevice('Amazfit Balance'), O = who === 'ra' ? original(w) : null, P = who === 'port' ? port(w) : null;
          const hr = () => (O ? O.api.HR : (P!.p.hr as RaHR));
          if (O) O.api.hrInitPage();
          else P!.p.initStatus();
          const go = () => (O ? O.api.hrConnect() : P!.p.connect());
          // al perderse: cada reintento (los temporizadores, a mano); en el caso «a la tercera», el tercero conecta
          const drop = async () => {
            d.drop();
            for (let k = 0; k < 7 && w.timers.length; k++) {
              if (c.name.includes('tercera') && k === 2) d.fail = '';
              const before = hr().tries;
              w.timers.shift()!();
              await until(() => hr().tries !== before || !!hr().char || w.timers.length > 0 || hr().bad);
              await new Promise((res) => setTimeout(res, 5));
            }
            if (c.name.includes('desconecta')) (O ? O.api.hrOff() : P!.p.off());
          };
          await c.run(w, d, go, drop);
          d.emit(hrPacket(0, 77));
          const status = O ? O.status : P!.status;
          return { status: status.map((s) => s.slice(0, 2)), hr: hrState(hr()), canOff: O ? !O.els['#btnHrOff'].disabled : !!P!.p.hr.dev, disc: d.disconnects, req: w.bt?.requests ?? 0, live: !!hr().char };
        }),
      );
      expect(res[0].status.length).toBeGreaterThan(1);
      expect(res[1]).toEqual(res[0]);
    });
  }

  for (const seed of SEEDS) {
    it(`semilla ${seed}: del móvil a las gafas (envíos, cifrado cruzado y lo que se acepta)`, async () => {
      const r = rng(seed), wo = world({ code: '1234 5678 9012 ' + seed }), wp = world({ code: '1234 5678 9012 ' + seed }), O = original(wo), P = port(wp);
      // el pulsómetro, conectado en los dos (lo manda al recibir cada paquete)
      const dO = new FakeHrDevice('Banda'), dP = new FakeHrDevice('Banda');
      wo.bt!.next = dO;
      wp.bt!.next = dP;
      await O.api.hrConnect();
      await P.p.connect();
      for (let i = 0; i < 40; i++) {
        const dt = r() < 0.3 ? r() * 900 : 900 + r() * 4000, b = r() < 0.3 ? 100 : 60 + Math.floor(r() * 120), fail = r() < 0.15;
        for (const w of [wo, wp]) {
          w.clock.t += dt;
          w.clock.w += dt;
          w.db.status = fail ? 503 : 200;
        }
        dO.emit(hrPacket(0, b));
        dP.emit(hrPacket(0, b));
        await until(() => !O.api.HRX.busy && !P.p.hrx.busy);
        expect(wp.db.calls.length, `paso ${i}`).toBe(wo.db.calls.length);
      }
      expect(P.status.map((s) => s.slice(0, 2))).toEqual(O.status.map((s) => s.slice(0, 2)));
      // lo mandado: el mismo hueco y la misma forma; lo cifrado por uno lo abre el otro
      expect(wp.db.calls.length).toBeGreaterThan(5);
      for (let k = 0; k < wo.db.calls.length; k++) {
        const a = wo.db.calls[k], b = wp.db.calls[k], A = JSON.parse(a.body!), B = JSON.parse(b.body!);
        expect(b.url).toBe(a.url);
        expect(b.method).toBe('PUT');
        expect(B.meta).toEqual(A.meta);
        expect(await P.p.open(A.blob)).toEqual(await O.api.hrxOpen(B.blob));
      }

      // las gafas: lo que llega (de hace poco o mucho, repetido, fuera de rango, de otro código o roto)
      const go = world({ code: '1234 5678 9012 ' + seed, ua: 'OculusBrowser', bt: false }), gp = world({ code: '1234 5678 9012 ' + seed, ua: 'OculusBrowser', bt: false });
      const GO = original(go), GP = port(gp), other = port(world({ code: '9999' }));
      let t = go.clock.w - 30000, prev: { blob: string } | null = null;
      for (let i = 0; i < 60; i++) {
        const x = r(), dt = r() * 3000;
        for (const w of [go, gp]) {
          w.clock.t += dt;
          w.clock.w += dt;
        }
        t += r() < 0.15 ? -2000 : r() * 2500;
        const pk = { b: x < 0.1 ? 250 : x < 0.15 ? 10 : 40 + Math.floor(r() * 160), t: Math.round(t + (r() < 0.1 ? 20000 : 0)), m: r() < 0.5 ? 0 : Math.floor(r() * 200), w: r() < 0.3 ? '' : 'el móvil' };
        // (a veces, el mismo otra vez: Firebase repite lo último al volver a escuchar)
        const node = prev && r() < 0.12 ? prev : r() < 0.08 ? { blob: 'roto' } : r() < 0.05 ? null : { blob: await (r() < 0.08 ? other.p.seal(pk) : GP.p.seal(pk)) };
        if (node) prev = node;
        const a = await GO.api.hrxTake(node), b = await GP.p.take(node);
        expect(b, `paquete ${i}: ${JSON.stringify(pk)}`).toBe(a);
        expect(hrState(GP.p.hr as RaHR), `paquete ${i}`).toEqual(hrState(GO.api.HR));
        expect(GP.p.hrx.lastT).toBe(GO.api.HRX.lastT);
      }
      expect(GP.status.map((s) => s.slice(0, 2))).toEqual(GO.status.map((s) => s.slice(0, 2)));
    });
  }

  it('el límite de edad de lo que llega (15 s, hacia atrás y hacia delante)', async () => {
    // (los mismos dos: sacar la clave cuesta; entre paquete y paquete se olvida el último, para que cada uno cuente)
    const go = world({ code: '77' }), gp = world({ code: '77' }), GO = original(go), GP = port(gp);
    for (const sign of [1, -1])
      for (let a = 13000; a <= 17000; a += 250) {
        const age = sign * a;
        GO.api.HRX.lastT = 0;
        GP.p.hrx.lastT = 0;
        const node = { blob: await GP.p.seal({ b: 90, t: go.clock.w - age, m: 0, w: 'el móvil' }) };
        expect(await GP.p.take(node), `edad ${age}`).toBe(await GO.api.hrxTake(node));
        expect(await GP.p.take(node), `edad ${age}, repetido`).toBe(await GO.api.hrxTake(node)); // (el mismo otra vez: no es más nuevo)
      }
  });

  for (const stream of [true, false]) {
    it(`las gafas escuchan ${stream ? 'con el flujo (y, si Firebase lo cancela, preguntando)' : 'preguntando cada 2 s'}`, async () => {
      const r = rng(7), wo = world({ code: '55', es: stream, bt: false }), wp = world({ code: '55', es: stream, bt: false }), O = original(wo), P = port(wp);
      const busy = () => O.api.HRX.opening || O.api.HRX.polling || P.p.hrx.opening || P.p.hrx.polling;
      for (let i = 0; i < 80; i++) {
        const dt = r() * 0.7;
        O.api.hrxStep(dt);
        P.p.step(dt);
        await until(() => !busy());
        await new Promise((res) => setTimeout(res, 1));
        await until(() => !busy());
        if (stream && i === 40) {
          // Firebase deja de dejar escuchar: se cierra y se pasa a preguntar
          wo.es.at(-1)?.fire('cancel', {});
          wp.es.at(-1)?.fire('cancel', {});
        }
        if (stream && i === 20) {
          // un corte (no cerrado del todo): se queda como está
          for (const w of [wo, wp]) w.es.at(-1)?.onerror?.({});
        }
        expect([wp.es.length, wp.es.filter((e) => e.closed).length, wp.db.calls.length], `paso ${i}`).toEqual([wo.es.length, wo.es.filter((e) => e.closed).length, wo.db.calls.length]);
        expect(P.p.hrx.noStream).toBe(O.api.HRX.noStream);
      }
      if (stream) expect(wp.es[0].url).toBe(wo.es[0].url);
      expect(wp.db.calls.map((c) => c.url)).toEqual(wo.db.calls.map((c) => c.url));
    });
  }
});
