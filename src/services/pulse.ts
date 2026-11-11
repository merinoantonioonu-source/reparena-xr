/**
 * El pulsómetro, como en RepArena (src/57_pulse.js): tu pulso en el marcador, de un reloj o una banda que lo emita como
 * pulsómetro Bluetooth normal (el servicio estándar «heart_rate»: Amazfit con «Emitir frecuencia cardíaca», Polar,
 * Garmin, Wahoo…). Se conecta desde la página (el navegador pide elegirlo: hace falta un toque). El navegador de las Quest
 * no tiene Bluetooth para páginas: el pulso llega entonces por el móvil, cifrado con el código de sincronización en otro
 * hueco de Firebase (con la forma `meta` + `blob` de lo sincronizado, uno por segundo como mucho), y las gafas lo escuchan.
 *
 * Lógica pura (sin IWSDK): todo lo de fuera (Bluetooth, red, cifrado, reloj, almacén, avisos) llega por `PulseEnv`, así
 * se prueba con un Bluetooth falso (tests/unit/pulse.test.ts) y se compara con RepArena (tests/compare/pulse.compare.test.ts).
 * Los textos de estado y el número en la página los pinta quien la haga (onStatus, onBpm); el marcador, con pulseBoard().
 */

// ---------------------------------------------------------------- lo de fuera

/** Lo mínimo de Web Bluetooth que se usa. */
export interface BtCharacteristic {
  addEventListener(type: 'characteristicvaluechanged', fn: (ev: { target: { value: DataView } }) => void): void;
  startNotifications(): Promise<unknown>;
}
export interface BtDevice {
  name?: string;
  gatt: { connected?: boolean; connect(): Promise<{ getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<BtCharacteristic> }> }>; disconnect(): void };
  addEventListener(type: 'gattserverdisconnected', fn: () => void): void;
}
export interface BtLike {
  requestDevice(o: { filters: { services: string[] }[] }): Promise<BtDevice>;
  getAvailability?(): Promise<boolean>;
}
export interface EventSourceLike {
  readyState: number;
  onerror: ((ev: unknown) => void) | null;
  addEventListener(type: string, fn: (ev: { data: string }) => void): void;
  close(): void;
}
export interface WakeLockLike {
  request(type: 'screen'): Promise<{ release(): Promise<void>; addEventListener(type: 'release', fn: () => void): void }>;
}
export type FetchLike = (url: string, init?: { method?: string; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Lo que el pulsómetro necesita de fuera (en el navegador, makeBrowserPulseEnv). */
export interface PulseEnv {
  /** El reloj de la página en ms (performance.now): la edad del pulso. */
  now(): number;
  /** La hora de verdad en ms (Date.now): lo que viaja por Firebase. */
  wall(): number;
  /** navigator.bluetooth (null si el navegador no lo tiene). */
  bluetooth: BtLike | null;
  /** navigator.userAgent: para saber si son las gafas (y quién pasa el pulso: «el móvil», «el ordenador»). */
  userAgent: string;
  fetch: FetchLike;
  /** Web Crypto (en las pruebas, el de Node: globalThis.crypto). */
  crypto: { subtle: SubtleCrypto; getRandomValues<T extends ArrayBufferView>(a: T): T };
  /** El almacén del navegador en JSON (el store de settings.ts): de ahí sale el código de sincronización. */
  store<T = unknown>(k: string, v?: T): T | null;
  /** La base de datos de Firebase de la sincronización ('' = sin sincronización). */
  syncDb: string;
  /** ¿Estás en las gafas (en una sesión de XR)? Entonces no se manda: se escucha. */
  inXR(): boolean;
  /** Tu pulso máximo (ajuste hrMax; 190 si no hay). */
  hrMax(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  /** El flujo de Firebase (EventSource); sin él, se pregunta cada 2 s. */
  EventSource: (new (url: string) => EventSourceLike) | null;
  /** Que la pantalla del móvil no se apague mientras pasa el pulso. */
  wakeLock: WakeLockLike | null;
  hidden(): boolean;
  /** Cambió el pulso (repintar el marcador: boardDirty en RepArena). */
  onChange?(): void;
  /** El texto de estado de la página (#hrStatus), si es un error y si se puede desconectar (#btnHrOff). */
  onStatus?(text: string, bad: boolean, canOff: boolean): void;
  /** El pulso en la página (#hrNow): el número y su color; 0, borrarlo. */
  onBpm?(bpm: number, col: string): void;
}

// ---------------------------------------------------------------- zonas y paquetes

/** Zonas de esfuerzo (fracción del pulso máximo): azul suave, verde (quema), lima (aeróbico), naranja (umbral) y rojo. */
export const HR_ZONES: [number, string][] = [[0.6, '#7fd4ff'], [0.7, '#3cf0c6'], [0.8, '#c8f560'], [0.9, '#ffb36b'], [9, '#ff3b5c']];
/** El color de un pulso con tu pulso máximo. */
export const hrCol = (b: number, max = 190): string => (HR_ZONES.find((z) => b < z[0] * max) || HR_ZONES[4])[1];
/** La zona (0 a 4) de un pulso. */
export const hrZone = (b: number, max = 190): number => {
  const i = HR_ZONES.findIndex((z) => b < z[0] * max);
  return i < 0 ? 4 : i;
};
/** Lo que manda el pulsómetro (la medida estándar): el bit 0 del primer byte dice si el pulso viene en 8 o en 16 bits
 * (los demás bits —contacto, energía, intervalos RR— no hacen falta). Fuera de 30–240, nada (lecturas sin contacto). */
export function hrParseValue(dv: DataView): number | null {
  const f = dv.getUint8(0), v = f & 1 ? dv.getUint16(1, true) : dv.getUint8(1);
  return v < 30 || v > 240 ? null : v;
}

/** Sin datos en 6 s, no hay pulso. */
export const HR_STALE = 6000;
/** Un pulso llegado del móvil de hace más de 15 s no vale. */
export const HRX_MAX_AGE = 15000;
export const HRX_SALT = 'reparena-pulso-v1';
const SYNC_KEY = 'reparena3-sync';

// lo de cifrar, igual que la sincronización de RepArena (src/69_xfer.js: xferKey, xferHex, xferB64)
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** La clave AES-GCM que sale del código (PBKDF2, 150 000 vueltas: cuesta, se saca una vez por código). */
async function deriveKey(c: PulseEnv['crypto'], code: string, salt: string): Promise<CryptoKey> {
  const base = await c.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Lo que viaja cifrado: el pulso, cuándo (hora de verdad), el máximo de la sesión y quién lo pasa. */
export type HrPacket = { b: number; t: number; m: number; w: string };

const QUEST_RE = /OculusBrowser|Quest/i;

// ---------------------------------------------------------------- el pulsómetro

export class Pulse {
  /** El pulsómetro (RepArena: HR). from: '' si es el propio, o quién lo pasa por la sincronización. */
  readonly hr = { dev: null as BtDevice | null, char: null as BtCharacteristic | null, bpm: 0, t: 0, st: '', bad: false, tries: 0, max: 0, from: '' };
  /** Lo que se pasa del móvil a las gafas (RepArena: HRX). */
  readonly hrx = { key: null as Promise<CryptoKey> | null, kc: '', last: 0, sent: 0, busy: false, ok: false, note: '', es: null as EventSourceLike | null, esCode: '', opening: false, noStream: false, chk: 0, pollT: 0, polling: false, lastT: 0, lock: null as { release(): Promise<void> } | null, locking: false };

  constructor(readonly env: PulseEnv) {}

  // ---- lo que lee el juego

  /** ¿Deja el navegador conectar aparatos Bluetooth? */
  ok(): boolean {
    return !!this.env.bluetooth && typeof this.env.bluetooth.requestDevice === 'function';
  }
  /** El pulso de ahora (0 si no hay o es de hace más de 6 s). */
  bpm(): number {
    return this.hr.bpm && this.env.now() - this.hr.t < HR_STALE ? this.hr.bpm : 0;
  }
  col(b: number): string {
    return hrCol(b, this.env.hrMax() || 190);
  }
  /** Para el marcador (arriba a la derecha, bajo las vidas): el número y el color de tu zona, o null. */
  board(): { bpm: number; col: string } | null {
    const b = this.bpm();
    return b ? { bpm: b, col: this.col(b) } : null;
  }

  // ---- el pulsómetro propio

  status(t: string, bad?: boolean): void {
    this.hr.st = t;
    this.hr.bad = !!bad;
    this.env.onStatus?.(t, !!bad, !!this.hr.dev);
  }
  /** Un paquete del pulsómetro. */
  parse(dv: DataView): void {
    const v = hrParseValue(dv);
    if (v === null) return;
    const H = this.hr;
    H.bpm = v;
    H.t = this.env.now();
    H.max = Math.max(H.max, v);
    H.from = '';
    this.env.onChange?.();
    void this.send(v);
    this.env.onBpm?.(v, this.col(v));
  }
  async attach(dev: BtDevice): Promise<void> {
    this.status(`Conectando con ${dev.name || 'el pulsómetro'}…`);
    const srv = await dev.gatt.connect(), svc = await srv.getPrimaryService('heart_rate'), ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (ev) => this.parse(ev.target.value));
    await ch.startNotifications();
    this.hr.char = ch;
    this.hr.tries = 0;
    this.hrx.note = '';
    this.status(`Conectado: ${dev.name || 'pulsómetro'}. ${this.how()}`);
  }
  /** Si se pierde (el reloj se aleja o deja de emitir), se intenta otra vez cada 2,5 s, cinco veces. */
  lost = (): void => {
    const H = this.hr;
    H.char = null;
    if (!H.dev) return;
    if (H.tries++ >= 5) {
      this.status('Se perdió el pulsómetro. Vuelve a pulsar «Conectar pulsómetro».', true);
      return;
    }
    this.status('Se perdió el pulsómetro: reconectando…', true);
    this.env.setTimeout(() => {
      if (H.dev) this.attach(H.dev).catch(this.lost);
    }, 2500);
  };
  /** El botón «Conectar pulsómetro». */
  async connect(): Promise<void> {
    const bt = this.env.bluetooth;
    if (!this.ok() || !bt) {
      this.status(
        QUEST_RE.test(this.env.userAgent || '')
          ? 'El navegador de las gafas no deja conectar aparatos Bluetooth desde una página. Conéctalo en el móvil (Chrome en Android) con esta misma página y vincula los dos con el código de sincronización (Ajustes → Sincronización automática): el móvil te pasa el pulso a las gafas.'
          : 'Este navegador no deja conectar aparatos Bluetooth desde una página web. Prueba en Chrome o Edge en un móvil Android o en un ordenador.',
        true,
      );
      return;
    }
    try {
      if (bt.getAvailability && !(await bt.getAvailability())) {
        this.status('El Bluetooth de este aparato está apagado o el navegador no puede usarlo.', true);
        return;
      }
      this.status('Elige tu reloj o pulsómetro en la lista…');
      const dev = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      if (this.hr.dev && this.hr.dev !== dev) this.off(true);
      this.hr.dev = dev;
      dev.addEventListener('gattserverdisconnected', this.lost);
      await this.attach(dev);
    } catch (e) {
      const err = e as { name?: string; message?: string } | null;
      this.status(
        err && err.name === 'NotFoundError'
          ? 'No apareció ninguno o no elegiste. ¿Está emitiendo el pulso? En los Amazfit: Ajustes → Frecuencia cardíaca → «Emitir frecuencia cardíaca» (o empieza un entrenamiento en el reloj).'
          : 'No se pudo conectar: ' + ((err && err.message) || e),
        true,
      );
    }
  }
  /** El botón «Desconectar». */
  off(quiet?: boolean): void {
    const d = this.hr.dev;
    this.hr.dev = null;
    this.hr.char = null;
    this.hr.bpm = 0;
    void this.wake(false);
    try {
      if (d && d.gatt && d.gatt.connected) d.gatt.disconnect();
    } catch {
      /* da igual */
    }
    if (!quiet) this.status('Desconectado.');
    this.env.onBpm?.(0, '');
    this.env.onChange?.();
  }
  /** El estado al abrir la página. */
  initStatus(): void {
    this.status(this.ok() ? 'Sin conectar.' : 'Este navegador no deja conectar aparatos Bluetooth desde una página web: el botón lo intentará igualmente.', !this.ok());
  }

  // ---- del móvil a las gafas

  private syncSt(): { code?: string; dev?: string } {
    return this.env.store<{ code?: string; dev?: string }>(SYNC_KEY) || {};
  }
  private syncOn(): boolean {
    return !!(this.env.syncDb && this.syncSt().code);
  }
  /** Este aparato en la sincronización (se inventa una vez y se guarda: RepArena, syncDev). */
  private syncDev(): string {
    const s = this.syncSt();
    if (!s.dev) {
      s.dev = hex(this.env.crypto.getRandomValues(new Uint8Array(6)).buffer as ArrayBuffer);
      this.env.store(SYNC_KEY, s);
    }
    return s.dev;
  }
  /** Quién pasa el pulso (sale en la página de las gafas: «Tu pulso llega desde el móvil»). */
  who(): string {
    const u = this.env.userAgent || '';
    return QUEST_RE.test(u) ? 'las gafas' : /Mobi|Android|iPhone|iPad/i.test(u) ? 'el móvil' : 'el ordenador';
  }
  /** El hueco del pulso: sale del código (otro que el de lo sincronizado). */
  async url(): Promise<string> {
    const d = await this.env.crypto.subtle.digest('SHA-256', enc.encode('reparena-pulso:' + this.syncSt().code));
    return `${this.env.syncDb.replace(/\/+$/, '')}/sync/${hex(d)}.json`;
  }
  private key(): Promise<CryptoKey> {
    const c = String(this.syncSt().code ?? ''), X = this.hrx;
    if (X.kc !== c || !X.key) {
      X.kc = c;
      X.key = deriveKey(this.env.crypto, c, HRX_SALT);
    }
    return X.key;
  }
  async seal(o: HrPacket): Promise<string> {
    const iv = this.env.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await this.env.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(), enc.encode(JSON.stringify(o))));
    const all = new Uint8Array(12 + ct.length);
    all.set(iv);
    all.set(ct, 12);
    return b64(all);
  }
  async open(s: string): Promise<HrPacket> {
    const all = unB64(s);
    return JSON.parse(dec.decode(await this.env.crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await this.key(), all.slice(12)))) as HrPacket;
  }
  how(): string {
    return !this.env.syncDb
      ? 'Tu pulso sale en el marcador del juego.'
      : this.syncOn()
        ? 'Te paso el pulso a las gafas (las dos con el mismo código de sincronización): deja esta página abierta; la pantalla no se apagará.'
        : 'Para verlo en las gafas, vincula este aparato y las gafas con el código de sincronización (Ajustes → Sincronización automática) y deja esta página abierta.';
  }
  private note(t: string, bad?: boolean): void {
    if (this.hrx.note === t) return;
    this.hrx.note = t;
    if (this.hr.dev) this.status(`Conectado: ${this.hr.dev.name || 'pulsómetro'}. ${t}`, bad);
  }
  /** En el aparato con el pulsómetro (fuera de las gafas): cada pulso nuevo, como mucho uno por segundo (y, aunque no
   * cambie, cada 4 s). Devuelve el envío (para esperarlo en las pruebas) o nada si no toca. */
  send(v: number): Promise<void> | undefined {
    const X = this.hrx;
    if (!this.syncOn() || X.busy || this.env.inXR()) return;
    const now = this.env.now();
    if (now - X.sent < 1000 || (v === X.last && now - X.sent < 4000)) return;
    X.busy = true;
    X.sent = now;
    X.last = v;
    void this.wake(true);
    return (async () => {
      const at = this.env.wall(), blob = await this.seal({ b: v, t: at, m: this.hr.max, w: this.who() });
      // (con la misma forma que lo sincronizado: lo admiten sus reglas)
      const r = await this.env.fetch(await this.url(), { method: 'PUT', body: JSON.stringify({ meta: { ver: at, at, dev: this.syncDev(), from: this.who(), n: 0 }, blob }) });
      if (!r.ok) throw new Error('Firebase respondió ' + r.status);
      X.ok = true;
      this.note(this.how());
    })()
      .catch((e: { message?: string } | null) => {
        X.ok = false;
        this.note('No se pudo pasar el pulso a las gafas (' + ((e && e.message) || e) + '): lo intento otra vez.', true);
      })
      .finally(() => {
        X.busy = false;
      });
  }
  /** La pantalla del móvil, encendida mientras pasa el pulso (si el navegador sabe). */
  async wake(on: boolean): Promise<void> {
    const X = this.hrx;
    try {
      if (!on) {
        const L = X.lock;
        X.lock = null;
        if (L) await L.release();
        return;
      }
      if (X.lock || X.locking || !this.env.wakeLock || this.env.hidden()) return;
      X.locking = true;
      const L = await this.env.wakeLock.request('screen');
      X.lock = L;
      L.addEventListener('release', () => {
        if (X.lock === L) X.lock = null;
      });
    } catch {
      /* sin permiso o sin la función: da igual */
    } finally {
      X.locking = false;
    }
  }
  /** Lo que llega (en las gafas): el pulso, si es de hace menos de 15 s y más nuevo que el último. */
  async take(node: unknown): Promise<boolean> {
    const n = node as { blob?: unknown } | null;
    if (!n || typeof n.blob !== 'string') return false;
    let p: HrPacket;
    try {
      p = await this.open(n.blob);
    } catch {
      return false; // (de otro código o roto)
    }
    const X = this.hrx, H = this.hr;
    if (!p || !(p.b >= 30 && p.b <= 240) || Math.abs(this.env.wall() - p.t) > HRX_MAX_AGE || p.t <= X.lastT) return false;
    X.lastT = p.t;
    H.bpm = p.b;
    H.t = this.env.now();
    H.max = Math.max(H.max, p.b, p.m || 0);
    H.from = p.w || 'el móvil';
    this.env.onChange?.();
    this.env.onBpm?.(p.b, this.col(p.b));
    if (!H.dev) this.status(`Tu pulso llega desde ${H.from}, por la sincronización.`);
    return true;
  }
  close(): void {
    if (this.hrx.es) {
      this.hrx.es.close();
      this.hrx.es = null;
    }
  }
  /** En las gafas (o al probar en el ordenador), mientras se juega y sin pulsómetro propio: escuchar el hueco del pulso.
   * Dos veces por segundo basta; con el flujo de Firebase llega en menos de un segundo; sin él, se pregunta cada 2 s. */
  step(dt: number): void {
    const X = this.hrx;
    if ((X.chk -= dt) > 0) return;
    const step = 0.5 - X.chk;
    X.chk = 0.5;
    const code = this.env.syncDb && !this.hr.char ? this.syncSt().code : null;
    if (!code) {
      this.close();
      return;
    }
    if (X.es && X.esCode !== code) this.close(); // (otro código: otro hueco)
    const ES = this.env.EventSource;
    if (ES && !X.noStream) {
      if (X.es || X.opening) return;
      X.opening = true;
      this.url()
        .then((url) => {
          const es = (X.es = new ES(url)),
            take = (ev: { data: string }): void => {
              try {
                const m = JSON.parse(ev.data) as { path?: string; data?: unknown } | null;
                if (m && m.path === '/') void this.take(m.data);
              } catch {
                /* nada */
              }
            };
          X.esCode = code;
          es.addEventListener('put', take);
          es.addEventListener('patch', take);
          // (si Firebase no deja escuchar, se pregunta cada 2 s)
          const off = (): void => {
            if (X.es === es) {
              this.close();
              X.noStream = true;
            }
          };
          es.addEventListener('cancel', off);
          es.onerror = () => {
            if (es.readyState === 2) off(); // (cerrado del todo; si solo se cortó, se reconecta solo)
          };
        })
        .catch(() => {})
        .finally(() => {
          X.opening = false;
        });
      return;
    }
    if ((X.pollT -= step) > 0 || X.polling) return;
    X.pollT = 2;
    X.polling = true;
    this.url()
      .then((u) => this.env.fetch(u))
      .then((r) => (r.ok ? r.json() : null))
      .then((n) => this.take(n))
      .catch(() => {})
      .finally(() => {
        X.polling = false;
      });
  }
}

/** El de verdad, en el navegador (syncDb: la base de datos de la sincronización; store: el de settings.ts). */
export function makeBrowserPulseEnv(o: { syncDb: string; store: PulseEnv['store']; inXR(): boolean; hrMax(): number } & Partial<PulseEnv>): PulseEnv {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as { bluetooth?: BtLike; userAgent?: string; wakeLock?: WakeLockLike };
  return {
    now: () => performance.now(),
    wall: () => Date.now(),
    bluetooth: nav.bluetooth ?? null,
    userAgent: nav.userAgent ?? '',
    fetch: (u, i) => fetch(u, i),
    crypto: globalThis.crypto,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    EventSource: typeof EventSource !== 'undefined' ? (EventSource as unknown as PulseEnv['EventSource']) : null,
    wakeLock: nav.wakeLock ?? null,
    hidden: () => typeof document !== 'undefined' && document.hidden,
    ...o,
  };
}
