// Pasar tus datos a otro dispositivo (por código) y la sincronización automática (Firebase), portados de RepArena
// (src/69_xfer.js). Las claves, los paquetes y el cifrado son idénticos a los de RepArena: un código sacado en una versión
// se abre en la otra, y las dos sincronizan en el mismo hueco. Sin @iwsdk/core ni DOM: todo lo de fuera llega en un
// XferEnv (así se prueba en Node con su WebCrypto). Los menús y la página no van aquí: usan lo que se exporta.
//
// Por código (8 cifras): del código salen la clave (AES-GCM, derivada con PBKDF2) y el canal de ntfy.sh donde se dejan los
// datos cifrados unas horas: el servicio no puede leerlos y, sin el código, nadie sabe en qué canal están. Lo que depende
// de cada aparato (la habitación escaneada, los aparatos colocados, la sesión de Spotify) no se manda.
//
// Sincronización (16 cifras, fijo): cada aparato deja sus datos cifrados en una Realtime Database de Firebase (por su API
// web, sin librerías) a los pocos segundos de cambiar algo. Al entrar, si el otro tiene algo más reciente, se pregunta si
// importarlo. Al subir se juntan las partidas de los dos; de cada ajuste gana el que se cambió más tarde.

/** Lo que se manda (las mismas claves que RepArena). ('reparena3-profiles': los perfiles de antes, que ya no se usan; va
 * para que una sesión guardada con ellos los encuentre.) */
export const XFER_KEYS: readonly string[] = [
  'reparena3-settings', 'reparena3-combos', 'reparena3-profiles', 'reparena3-favs', 'reparena3-ui', 'reparena3-rankfit',
  'reparena3-session', 'reparena3-sessions', 'reparena3-history', 'reparena3-arcghost', 'reparena3-spotify',
  'reparena3-exsongs', 'reparena3-career', 'reparena3-sndoff', 'reparena3-ghosts', 'reparena3-dev', 'reparena3-devon',
];
export const XFER_BASE = 'https://ntfy.sh';
export const XFER_CHUNK = 3000; // (cada mensaje, por debajo de los 4 KB que admite el servicio sin adjuntos)
export const XFER_HOURS = 12;
export const XFER_SALT = 'reparena-xfer-v1';
/** La Realtime Database del proyecto «reparena» (la misma que RepArena; vacía: sin sincronización). */
export const SYNC_DB = 'https://reparena-62309-default-rtdb.europe-west1.firebasedatabase.app';
export const SYNC_SALT = 'reparena-sync-v1';
export const SYNC_KEY = 'reparena3-sync';
const SETTINGS_KEY = 'reparena3-settings';
const HIST = 'reparena3-history';

// ---------------------------------------------------------------- lo de fuera

export interface XferResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export interface XferEnv {
  /** El fetch del navegador (sin cabeceras propias: así no pregunta antes). */
  fetch: (url: string, init?: { method?: string; body?: string }) => Promise<XferResponse>;
  /** Leer (sin valor) o guardar (con valor) en JSON: `store` de src/core/settings.ts. */
  store: (k: string, v?: unknown) => unknown;
  /** El almacén en bruto (localStorage), para ver qué cambió al guardar. */
  local: { getItem(k: string): string | null };
  /** WebCrypto (en el navegador, `crypto`; en las pruebas, el de Node). */
  crypto: Crypto;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  /** Se llama 300 ms después de cargar lo recibido o importado (RepArena recargaba la página). */
  reload: () => void;
  /** Las claves que se empaquetan (de serie, XFER_KEYS). */
  keys?: readonly string[];
  /** Si se está en las gafas (el paquete dice de dónde viene). */
  inXR?: () => boolean;
  /** El navegador (para «las gafas», «el móvil», «el ordenador»). */
  userAgent?: () => string;
  /** Comprimir si se puede (de serie, si hay CompressionStream, como en RepArena). */
  compress?: boolean;
  /** Otros servicios (pruebas). */
  base?: string;
  db?: string;
}

type Dict = Record<string, unknown>;
/** Horas de cada campo de cada clave: { clave: { campo | '*': ms } }. */
export type KeyTimes = Record<string, Record<string, number>>;
/** Un paquete: v 1, cuándo, de dónde y los datos (clave → valor); en la sincronización, también sus horas. */
export interface XferPacket {
  v: 1;
  at?: number;
  from?: string;
  d: Dict;
  kt?: KeyTimes;
}
/** Lo de un lado al juntar: los datos y sus horas. */
export interface SyncSide {
  d: Dict;
  kt: KeyTimes;
}
export interface SyncNews {
  sets: number;
  other: number;
  games: number;
}
export interface SyncMeta {
  ver?: number;
  at?: number;
  dev?: string;
  from?: string;
  n?: number;
}
/** Lo que hay arriba más reciente: la cabecera y qué trae (para preguntar). */
export type SyncAsk = SyncMeta & { news: SyncNews };
/** Lo de este aparato, que no viaja: el código, quién es y cuándo cambió, subió o vio algo. */
export interface SyncState {
  code?: string | null;
  dev?: string;
  kt?: KeyTimes;
  at?: number;
  up?: number;
  seen?: number;
}

// ---------------------------------------------------------------- piezas (las de RepArena)

const enc = new TextEncoder(), dec = new TextDecoder();
// (los bytes, como BufferSource de WebCrypto: el tipo de TS más nuevo distingue los ArrayBuffer compartidos)
const buf = (b: Uint8Array): Uint8Array<ArrayBuffer> => b as Uint8Array<ArrayBuffer>;
export const hex = (b: ArrayBuffer | Uint8Array): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const digits = (c: unknown): string => String(c || '').replace(/\D/g, '');
export const xferCodeOk = (c: unknown): boolean => /^\d{8}$/.test(digits(c));
/** 12345678 → «1234 5678». */
export const xferFmt = (c: unknown): string => String(c).replace(/\D/g, '').replace(/^(\d{4})(\d{4})$/, '$1 $2');
export const syncCodeOk = (c: unknown): boolean => /^\d{16}$/.test(digits(c));
/** De cuatro en cuatro. */
export const syncFmt = (c: unknown): string => String(c).replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
/** SHA-256 de un texto, en hexadecimal (el canal, el hueco de Firebase y el del pulso salen de aquí). */
export const sha256hex = async (cr: Crypto, s: string): Promise<string> => hex(await cr.subtle.digest('SHA-256', buf(enc.encode(s))));
export const xferTopic = async (cr: Crypto, code: string): Promise<string> => 'reparena-' + (await sha256hex(cr, 'reparena-canal:' + code)).slice(0, 32);
export async function xferKey(cr: Crypto, code: string, salt = XFER_SALT): Promise<CryptoKey> {
  const base = await cr.subtle.importKey('raw', buf(enc.encode(code)), 'PBKDF2', false, ['deriveKey']);
  return cr.subtle.deriveKey({ name: 'PBKDF2', salt: buf(enc.encode(salt)), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// (comprimido si el navegador sabe; si no, tal cual: el primer byte del paquete lo dice)
async function zip(bytes: Uint8Array, back: boolean, can: boolean): Promise<Uint8Array | null> {
  if (!can || typeof CompressionStream === 'undefined') return null;
  const s = new Blob([buf(bytes)]).stream().pipeThrough(back ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** Cifrar un paquete con el código: comprimido si se puede, AES-GCM, y en texto (base64): [zip?, iv(12), cifrado]. */
export async function xferSeal(cr: Crypto, code: string, obj: unknown, salt?: string, compress = true): Promise<string> {
  const plain = enc.encode(JSON.stringify(obj)), z = await zip(plain, false, compress), body = z || plain;
  const iv = cr.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await cr.subtle.encrypt({ name: 'AES-GCM', iv }, await xferKey(cr, code, salt), buf(body)));
  const all = new Uint8Array(13 + ct.length);
  all[0] = z ? 1 : 0;
  all.set(iv, 1);
  all.set(ct, 13);
  return b64(all);
}
/** Descifrar: con otro código, «no se pudo descifrar»; si no es un paquete de RepArena, «el envío no es de RepArena». */
export async function xferOpen(cr: Crypto, code: string, text: string, salt?: string): Promise<XferPacket> {
  const all = unB64(text);
  let body: Uint8Array;
  try {
    body = new Uint8Array(await cr.subtle.decrypt({ name: 'AES-GCM', iv: buf(all.slice(1, 13)) }, await xferKey(cr, code, salt), buf(all.slice(13))));
  } catch {
    throw new Error('no se pudo descifrar: revisa el código');
  }
  if (all[0] === 1) body = (await zip(body, true, true)) as Uint8Array;
  const p = JSON.parse(dec.decode(body)) as XferPacket | null;
  if (!p || p.v !== 1 || !p.d) throw new Error('el envío no es de RepArena');
  return p;
}
const histId = (r: Dict): string => `${r.date}|${r.ex}|${r.reps}`;
/** Dos historiales en uno, sin repetir partidas (las 400 últimas, por fecha). */
export function histMerge(a: unknown[], b: unknown[] | null | undefined): unknown[] {
  const seen = new Set((a as Dict[]).map(histId));
  return a
    .concat(((b || []) as Dict[]).filter((r) => r && !seen.has(histId(r))))
    .sort((x, y) => (((x as Dict).date as number) || 0) - (((y as Dict).date as number) || 0))
    .slice(-400);
}
/** «2 bloques de sesión · 1 sesión guardada · 30 partidas en el historial · ajustes». */
export function xferSummary(p: XferPacket): string {
  const d = p.d || {}, ses = ((((d['reparena3-session'] || {}) as Dict).blocks || []) as unknown[]).length;
  const hist = ((d[HIST] || []) as unknown[]).length, sv = ((d['reparena3-sessions'] || []) as unknown[]).length;
  return `${ses} ${ses === 1 ? 'bloque' : 'bloques'} de sesión · ${sv} ${sv === 1 ? 'sesión guardada' : 'sesiones guardadas'} · ${hist} ${hist === 1 ? 'partida' : 'partidas'} en el historial · ajustes`;
}

// ---------------------------------------------------------------- por código

/** Pasar los datos con un código de 8 cifras (ntfy.sh). */
export class Xfer {
  readonly base: string;
  readonly keys: readonly string[];
  /** El último código enviado y cuándo; `busy`, para el menú (mientras, no se lanza otro). */
  last: { code: string; t: number } | null = null;
  busy = false;
  constructor(readonly env: XferEnv) {
    this.base = env.base || XFER_BASE;
    this.keys = env.keys || XFER_KEYS;
  }
  private get cz(): boolean {
    return this.env.compress !== false;
  }
  seal(code: string, obj: unknown, salt?: string): Promise<string> {
    return xferSeal(this.env.crypto, code, obj, salt, this.cz);
  }
  open(code: string, text: string, salt?: string): Promise<XferPacket> {
    return xferOpen(this.env.crypto, code, text, salt);
  }
  /** Lo que se manda: cada clave tal cual, salvo Spotify (solo tu app y la música elegida: el inicio de sesión es de cada aparato). */
  pack(): XferPacket {
    const d: Dict = {};
    for (const k of this.keys) {
      let v = this.env.store(k);
      if (v === null || v === undefined) continue;
      if (k === 'reparena3-spotify') {
        const { clientId, lists, picks, favs, bpms } = v as Dict;
        v = { clientId, lists, picks, favs, bpms };
      }
      d[k] = v;
    }
    return { v: 1, at: this.env.now(), from: this.env.inXR?.() ? 'gafas' : 'navegador', d };
  }
  /** Enviar: devuelve el código (de 8 cifras). Error: «el servicio respondió 500». */
  async send(): Promise<string> {
    const cr = this.env.crypto, rnd = cr.getRandomValues(new Uint32Array(2)), code = String(rnd[0] % 100000000).padStart(8, '0');
    const text = await this.seal(code, this.pack()), n = Math.ceil(text.length / XFER_CHUNK), id = hex(cr.getRandomValues(new Uint8Array(4)));
    const topic = await xferTopic(cr, code);
    for (let i = 0; i < n; i++) {
      const r = await this.env.fetch(`${this.base}/${topic}`, { method: 'POST', body: `RA1|${id}|${i}|${n}|${text.slice(i * XFER_CHUNK, (i + 1) * XFER_CHUNK)}` });
      if (!r.ok) throw new Error('el servicio respondió ' + r.status);
    }
    this.last = { code, t: this.env.now() };
    return code;
  }
  /** Recibir: busca en el canal del código el último envío completo y lo descifra (no aplica nada todavía). */
  async fetch(code: string): Promise<XferPacket> {
    code = String(code).replace(/\D/g, '');
    if (!xferCodeOk(code)) throw new Error('el código tiene 8 cifras');
    const topic = await xferTopic(this.env.crypto, code), r = await this.env.fetch(`${this.base}/${topic}/json?poll=1&since=${XFER_HOURS}h`);
    if (!r.ok) throw new Error('el servicio respondió ' + r.status);
    const sets = new Map<string, { n: number; parts: (string | undefined)[] }>();
    let lastId: string | null = null;
    for (const line of (await r.text()).split('\n')) {
      let m: Dict | null;
      try {
        m = JSON.parse(line) as Dict | null;
      } catch {
        continue;
      }
      if (!m || m.event !== 'message' || typeof m.message !== 'string' || !m.message.startsWith('RA1|')) continue;
      const [, id, i, n, part] = m.message.split('|');
      if (!sets.has(id)) sets.set(id, { n: +n, parts: [] });
      (sets.get(id) as { parts: (string | undefined)[] }).parts[+i] = part;
      lastId = id;
    }
    // el más reciente que esté entero
    const ids = [...sets.keys()].reverse();
    let got: string | null = null;
    for (const id of [lastId, ...ids]) {
      const s = id ? sets.get(id) : undefined;
      if (s && s.parts.filter((x) => x !== undefined).length === s.n) {
        got = s.parts.join('');
        break;
      }
    }
    if (!got) throw new Error(sets.size ? 'el envío llegó incompleto: vuelve a enviarlo' : 'no hay nada con ese código (¿caducó? duran ' + XFER_HOURS + ' h)');
    return this.open(code, got);
  }
  /** Cargar lo recibido: sustituye lo de este aparato (el historial se junta, sin repetir partidas; de Spotify se conserva el
   * inicio de sesión de aquí) y, con `reload`, llama a env.reload a los 300 ms para que todo lo lea. */
  apply(p: XferPacket, reload = true, merged = false): void {
    const st = this.env.store;
    for (const k of this.keys) {
      const v = p.d[k];
      if (v === undefined) continue;
      if (k === HIST && !merged) st(k, histMerge((st(k) as unknown[]) || [], v as unknown[]));
      else if (k === 'reparena3-spotify') {
        const s = v as Dict;
        st(k, Object.assign({}, st(k) || {}, s.clientId ? { clientId: s.clientId } : {}, s.lists ? { lists: s.lists } : {}, s.picks ? { picks: s.picks } : {}, s.favs ? { favs: s.favs } : {}, s.bpms ? { bpms: s.bpms } : {}));
      } else st(k, v);
    }
    if (reload) this.env.setTimeout(() => this.env.reload(), 300);
  }
}

// ---------------------------------------------------------------- juntar (sin servicio: puro)

const isObj = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);
const parse = (raw: string | null): unknown => {
  try {
    return JSON.parse(raw as string);
  } catch {
    return null;
  }
};
/** La hora de un campo: la suya o la de la clave entera. */
export const syncFt = (T: Record<string, number> | undefined, f: string): number => Math.max((T && T[f]) || 0, (T && T['*']) || 0);
/** La hora de una clave: la de su campo más nuevo. */
export const syncKt = (T: Record<string, number> | undefined): number => Math.max(0, ...Object.values(T || {}));

/** Juntar lo de aquí (L) y lo de allí (R): el historial, sumado; en las fichas de campos (los ajustes…), cada campo del lado
 * que lo cambió más tarde; lo demás, entero del lado más reciente. Empate: lo de aquí, salvo al importar (preferR). */
export function syncMerge(L: Partial<SyncSide>, R: Partial<SyncSide>, preferR = false): SyncSide {
  const d: Dict = {}, kt: KeyTimes = {}, Ld = L.d || {}, Rd = R.d || {};
  const pick = (ta: number, tb: number): boolean => tb > ta || (tb === ta && preferR);
  for (const k of new Set([...Object.keys(Ld), ...Object.keys(Rd)])) {
    const a = Ld[k], b = Rd[k], A = (L.kt || {})[k] || {}, B = (R.kt || {})[k] || {}, T: Record<string, number> = (kt[k] = {});
    if (k === HIST) {
      d[k] = histMerge((a as unknown[]) || [], (b as unknown[]) || []);
      T['*'] = Math.max(syncKt(A), syncKt(B));
      continue;
    }
    if (b === undefined) {
      d[k] = a;
      Object.assign(T, A);
      continue;
    }
    if (a === undefined) {
      d[k] = b;
      Object.assign(T, B);
      continue;
    }
    if (isObj(a) && isObj(b)) {
      const o: Dict = {};
      for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const ta = syncFt(A, f), tb = syncFt(B, f), src = pick(ta, tb) ? b : a;
        if (f in src) o[f] = src[f];
        if (ta || tb) T[f] = Math.max(ta, tb);
      }
      d[k] = o;
    } else {
      const ta = syncKt(A), tb = syncKt(B);
      d[k] = pick(ta, tb) ? b : a;
      if (ta || tb) T['*'] = Math.max(ta, tb);
    }
  }
  return { d, kt };
}

/** Lo que trae lo de allí que aquí aún no está: ajustes más nuevos, otras cosas más nuevas y partidas que faltan (o null). */
export function syncNews(L: Partial<SyncSide>, R: Partial<SyncSide>): SyncNews | null {
  const Ld = L.d || {}, Rd = R.d || {};
  const fresh = !syncKt(Object.assign({}, ...Object.values(L.kt || {}))); // (aquí nunca se ha apuntado nada: todo lo de allí vale)
  let sets = 0, other = 0, games = 0;
  for (const k of Object.keys(Rd)) {
    const a = Ld[k], b = Rd[k], A = (L.kt || {})[k] || {}, B = (R.kt || {})[k] || {};
    if (k === HIST) {
      const seen = new Set(((a || []) as Dict[]).map(histId));
      games += ((b || []) as Dict[]).filter((r) => r && !seen.has(histId(r))).length;
      continue;
    }
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (isObj(a) && isObj(b)) {
      for (const f of new Set([...Object.keys(a), ...Object.keys(b)]))
        if (JSON.stringify(a[f]) !== JSON.stringify(b[f]) && (fresh || syncFt(B, f) > syncFt(A, f))) {
          if (k === SETTINGS_KEY) sets++;
          else other++;
        }
    } else if (a === undefined || fresh || syncKt(B) > syncKt(A)) other++;
  }
  return sets || other || games ? { sets, other, games } : null;
}

/** Apunta en `st` (lo de este aparato) la hora de lo que cambió al guardar `k` (de `oldRaw` a `raw`): en las fichas de campos,
 * cada campo; en lo demás (y el historial), la clave entera. Devuelve si apuntó algo (puro: lo usa Sync.touch). */
export function syncStamp(st: SyncState, k: string, oldRaw: string | null, raw: string | null, now: number): boolean {
  if (raw === oldRaw) return false;
  const kt = st.kt || (st.kt = {}), T = kt[k] || (kt[k] = {}), nv = parse(raw), ov = parse(oldRaw);
  if (k !== HIST && isObj(nv) && isObj(ov)) {
    let any = false;
    for (const f of new Set([...Object.keys(nv), ...Object.keys(ov)]))
      if (JSON.stringify(nv[f]) !== JSON.stringify(ov[f])) {
        T[f] = now;
        any = true;
      }
    if (!any) return false;
  } else T['*'] = now;
  st.at = now;
  return true;
}

// ---------------------------------------------------------------- textos

/** Los mensajes de los menús y de la página de RepArena (para quien los pinte). */
export const SYNC_TXT = {
  wait: 'Un momento…',
  allOk: 'Todo al día.',
  linked: 'Vinculado.',
  linkedNews: 'Vinculado: el otro aparato tiene datos.',
  unlinked: 'Desvinculado: este aparato ya no sincroniza.',
  imported: 'Importado: RepArena vuelve a empezar (tendrás que volver a entrar en las gafas).',
  noImport: 'ya no hay datos que importar',
  intro: 'Con un código fijo, tus ajustes, sesiones, historial y carrera se guardan cifrados y pasan solos de un aparato a otro: al entrar, si el otro tiene algo más reciente, te pregunta si lo importas.',
  codeHelp: 'Tu código fijo. Escríbelo una vez en el otro aparato (en el juego: Opciones ▸ → Ajustes → Sincronización ▸ → Vincular; o en la página):',
} as const;
export const XFER_TXT = {
  wait: 'Un momento…',
  intro: 'Lleva tus ajustes, bloques de sesión, historial y música elegida de un dispositivo a otro (p. ej. del PC a las gafas) con un código de 8 cifras.',
  codeHelp: 'Escribe este código en el otro dispositivo (en el juego: Opciones ▸ → Ajustes → A otro aparato; o en la página):',
  valid: `Vale durante ${XFER_HOURS} h · los datos van cifrados`,
  applyWarn: 'Al cargarlo se sustituyen los ajustes y bloques de aquí (el historial se junta) y RepArena vuelve a empezar: tendrás que volver a entrar.',
  loaded: 'Datos cargados: reiniciando…',
} as const;

// ---------------------------------------------------------------- sincronización

/** La sincronización automática con un código fijo de 16 cifras. Conéctala al guardado con
 * `setStoreHook((k, old) => sync.touch(k, old))` y pon `ready` a los 3 s de arrancar (`armReady()`). */
export class Sync {
  readonly db: string;
  readonly salt = SYNC_SALT;
  readonly key = SYNC_KEY;
  /** `busy`: subiendo; `applying`: importando (lo guardado entonces no cuenta como cambio); `ready`: lo que la página guarda
   * sola al cargarse (las misiones del día, los ajustes recolocados…) no cuenta: si no, al abrirla siempre parecería lo más nuevo. */
  busy = false;
  applying = false;
  ready = false;
  private t: unknown = null;
  readonly xfer: Xfer;
  constructor(readonly env: XferEnv, xfer?: Xfer) {
    this.db = env.db ?? SYNC_DB;
    this.xfer = xfer || new Xfer(env);
  }
  /** Al arrancar: a los 3 s empieza a apuntar cambios (como RepArena). */
  armReady(ms = 3000): void {
    this.env.setTimeout(() => {
      this.ready = true;
    }, ms);
  }
  st(): SyncState {
    return (this.env.store(this.key) as SyncState) || {};
  }
  set(o: SyncState): void {
    this.env.store(this.key, Object.assign(this.st(), o));
  }
  on(): boolean {
    return !!(this.db && this.st().code);
  }
  /** Quién es este aparato (6 bytes al azar, guardados). */
  dev(): string {
    const s = this.st();
    if (!s.dev) {
      s.dev = hex(this.env.crypto.getRandomValues(new Uint8Array(6)));
      this.env.store(this.key, s);
    }
    return s.dev;
  }
  who(): string {
    const u = this.env.userAgent?.() || '';
    return /OculusBrowser|Quest/i.test(u) ? 'las gafas' : /Mobi|Android|iPhone|iPad/i.test(u) ? 'el móvil' : 'el ordenador';
  }
  /** «hoy a las 10:05», «ayer a las…», «el 3 de mayo a las…». */
  when(at: number): string {
    const d = new Date(at), n = new Date(this.env.now()), hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((+new Date(n.toDateString()) - +new Date(d.toDateString())) / 864e5);
    return days === 0 ? `hoy a las ${hm}` : days === 1 ? `ayer a las ${hm}` : `el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${hm}`;
  }
  async url(sub = ''): Promise<string> {
    return `${this.db.replace(/\/+$/, '')}/sync/${await sha256hex(this.env.crypto, 'reparena-sync:' + this.st().code)}${sub}.json`;
  }
  async get(sub?: string): Promise<unknown> {
    const r = await this.env.fetch(await this.url(sub));
    if (!r.ok) throw new Error('Firebase respondió ' + r.status);
    return r.json();
  }
  /** Al guardar algo que viaja: apunta la hora de lo que cambió y, con un código, sube a los 4 s. */
  touch(k: string, oldRaw: string | null): void {
    if (this.applying || !this.ready || !this.xfer.keys.includes(k)) return;
    const st = this.st();
    if (!syncStamp(st, k, oldRaw, this.env.local.getItem(k), this.env.now())) return;
    this.env.store(this.key, st);
    if (this.on()) {
      this.env.clearTimeout(this.t);
      this.t = this.env.setTimeout(() => {
        this.push().catch(() => {});
      }, 4000);
    }
  }
  local(): SyncSide {
    return { d: this.xfer.pack().d, kt: this.st().kt || {} };
  }
  async remote(): Promise<(SyncSide & { meta: SyncMeta }) | null> {
    const cur = (await this.get()) as { meta?: SyncMeta; blob?: string } | null;
    if (!cur || !cur.blob) return null;
    const o = await this.xfer.open(this.st().code as string, cur.blob, this.salt);
    return { meta: cur.meta || {}, d: o.d, kt: o.kt || {} };
  }
  /** Subir: lo de aquí junto con lo de allí (de cada ajuste, el más reciente; las partidas de los dos). */
  async push(): Promise<boolean> {
    if (!this.on() || this.busy) return false;
    this.busy = true;
    try {
      const st = this.st(), dev = this.dev(), L = this.local();
      let M = L;
      try {
        const R = await this.remote();
        if (R) M = syncMerge(L, R);
      } catch {
        /* (otro código o datos rotos: se sobrescribe) */
      }
      const ver = this.env.now(), at = Math.max(st.at || 0, ...Object.values(M.kt).map(syncKt)) || ver;
      const meta: SyncMeta = { ver, at, dev, from: this.who(), n: ((M.d[HIST] || []) as unknown[]).length };
      const blob = await this.xfer.seal(st.code as string, { v: 1, at, from: this.who(), d: M.d, kt: M.kt }, this.salt);
      const r = await this.env.fetch(await this.url(), { method: 'PUT', body: JSON.stringify({ meta, blob }) }); // (sin cabeceras propias)
      if (!r.ok) throw new Error('Firebase respondió ' + r.status);
      this.set({ up: st.at || ver });
      return true;
    } finally {
      this.busy = false;
    }
  }
  /** Al entrar: si lo último de arriba lo subió el otro aparato y trae algo que aquí no está (y no se ha contestado ya),
   * devuelve qué trae para preguntar; si no, y aquí hay cambios sin subir, los sube. */
  async check(): Promise<SyncAsk | null> {
    if (!this.on()) return null;
    const st = this.st(), meta = (await this.get('/meta')) as SyncMeta | null;
    if (!meta) {
      await this.push();
      return null;
    }
    const ver = meta.ver || meta.at || 0;
    if (meta.dev !== this.dev() && ver > (st.seen || 0)) {
      const R = await this.remote(), news = R && syncNews(this.local(), R);
      if (news) return Object.assign({}, meta, { news });
      this.set({ seen: ver }); // (nada nuevo para aquí)
    }
    if ((st.at || 0) > (st.up || 0)) await this.push();
    return null;
  }
  /** Importar: lo de aquí junto con lo de allí, ganando lo de allí salvo lo que aquí se cambió después; y env.reload. */
  async import(_meta?: SyncMeta, reload = true): Promise<SyncSide> {
    const R = await this.remote();
    if (!R) throw new Error(SYNC_TXT.noImport);
    const M = syncMerge(this.local(), R, true), st = this.st();
    this.applying = true;
    try {
      this.xfer.apply({ v: 1, d: M.d }, false, true);
    } finally {
      this.applying = false;
    }
    const at = Math.max(st.at || 0, ...Object.values(M.kt).map(syncKt));
    this.set({ kt: M.kt, at, seen: R.meta.ver || R.meta.at || 0, up: (R.meta.at as number) >= at ? at : 0 }); // (si aquí queda algo más nuevo, se sube luego)
    if (reload) this.env.setTimeout(() => this.env.reload(), 300);
    return M;
  }
  /** «Ahora no»: no vuelve a preguntar por estos datos. */
  decline(meta: SyncMeta): void {
    this.set({ seen: meta.ver || meta.at });
  }
  newCode(): string {
    const r = this.env.crypto.getRandomValues(new Uint32Array(2));
    return String(r[0] % 1e8).padStart(8, '0') + String(r[1] % 1e8).padStart(8, '0');
  }
  /** Crear un código en este aparato (y subir ya lo de aquí). */
  async create(): Promise<string> {
    const code = this.newCode();
    this.set({ code, seen: 0, up: 0 });
    this.dev();
    await this.push();
    return code;
  }
  /** Vincular con el código del otro: devuelve qué trae, si hay, para preguntar. */
  async link(code: string): Promise<SyncAsk | null> {
    code = String(code).replace(/\D/g, '');
    if (!syncCodeOk(code)) throw new Error('el código tiene 16 cifras');
    this.set({ code, seen: 0, up: 0 });
    this.dev();
    return this.check();
  }
  unlink(): void {
    this.env.clearTimeout(this.t);
    this.set({ code: null });
  }
  /** La pregunta: «Las gafas tienen cambios más recientes (hoy a las…: 2 ajustes, 3 partidas). ¿Importarlos? …». */
  askText(m: SyncAsk): string {
    const n = m.news || ({} as SyncNews);
    const parts = [n.sets ? `${n.sets} ${n.sets === 1 ? 'ajuste' : 'ajustes'}` : '', n.other ? `${n.other} ${n.other === 1 ? 'cambio' : 'cambios'} más (rangos, sesiones…)` : '', n.games ? `${n.games} ${n.games === 1 ? 'partida' : 'partidas'}` : ''].filter(Boolean);
    return `${m.from ? m.from[0].toUpperCase() + m.from.slice(1) : 'El otro aparato'} tiene cambios más recientes (${this.when(m.at as number)}${parts.length ? ': ' + parts.join(', ') : ''}). ¿Importarlos? Se queda lo más nuevo de cada ajuste (lo que hayas cambiado aquí después no se toca) y se juntan las partidas.`;
  }
  /** El estado para los menús: vinculado, con qué código y cuándo subió por última vez. */
  status(): { linked: boolean; code: string | null; codeFmt: string; up: number; text: string } {
    const s = this.st(), code = s.code || null;
    return { linked: !!code, code, codeFmt: code ? syncFmt(code) : '', up: s.up || 0, text: code ? `Vinculado con el código ${syncFmt(code)}. ${s.up ? `Última subida: ${this.when(s.up)}.` : 'Aún no ha subido nada.'}` : '' };
  }
}
