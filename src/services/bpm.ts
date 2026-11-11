// El ritmo (BPM) de las canciones de Spotify (de RepArena: src/65_music.js, de spTempo a spAutoTempo; y spotifyTempo de
// src/74_touch.js). Spotify dejó de dar el análisis de audio a las apps nuevas (finales de 2024): se le pregunta por si
// acaso y, si no, a Deezer (por JSONP) y a ReccoBeats. Lo encontrado se guarda por canción en la misma cfg de Spotify que
// RepArena (`reparena3-spotify`: `bpms` —los tuyos—, `bpmAuto` —los de fuera— y `autoBpm`), con la misma forma, porque
// las dos versiones comparten datos. Sin IWSDK ni globales: todo lo de fuera llega por el `BpmEnv`.

/** Una canción tal como la da Spotify (o como la guarda la lista: `by`, «artista1, artista2»). */
export interface SpTrack {
  id?: string;
  uri: string;
  name?: string;
  isrc?: string;
  external_ids?: { isrc?: string };
  artist?: string;
  artists?: { name: string }[];
  by?: string;
}
/** Lo que hace falta para buscar una canción fuera. */
export interface TrackInfo {
  uri: string;
  isrc: string;
  artist: string;
  name: string;
}
/** bpmAuto: { uri: [bpm, fuente, cuándo] } (bpm 0: no se encontró). */
export type AutoEntry = [number, string, number];
/** Los campos de la cfg de Spotify que usa el ritmo (el resto, de spotify.ts, no se toca). */
export interface BpmCfg {
  bpms?: Record<string, number>;
  bpmAuto?: Record<string, AutoEntry>;
  autoBpm?: boolean;
  [k: string]: unknown;
}
/** La respuesta de fetch que se lee (la de verdad vale). */
export interface FetchRes {
  status: number;
  ok: boolean;
  headers?: { get(k: string): string | null };
  json(): Promise<unknown>;
}
export type BpmSrc = 'dz' | 'rb' | 'sp' | 'own' | '';

export interface BpmEnv {
  /** La cfg de Spotify (la misma que guarda spotify.ts: se pide cada vez por si la ha cambiado entera). */
  cfg(): BpmCfg;
  /** La guarda (spSave). */
  save(): void;
  /** La Web API de Spotify (spApi): lanza con el error de Spotify; null si no hay respuesta. */
  api(method: string, path: string): Promise<unknown>;
  /** Deezer por JSONP (su API no deja leerla con fetch desde otra web): ver `browserJsonp`. */
  jsonp(url: string, ms?: number): Promise<unknown>;
  /** fetch (para ReccoBeats); sin él, ReccoBeats no se pregunta. */
  fetch?: (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchRes>;
  /** La hora en ms (Date.now): la caché y la espera de ReccoBeats. */
  now(): number;
  /** La hora real en s (perfNow): la referencia del pulso. */
  perfNow(): number;
  /** Esperar (la cola de precarga, sin agobiar a Deezer); de serie, setTimeout. */
  sleep?(ms: number): Promise<void>;
  /** La canción que suena (SP.st.item) y su progreso en ms (SP.st.progress_ms). */
  track(): SpTrack | null;
  progressMs(): number;
  /** El ajuste «bpm» y cambiarlo (setSetting). */
  bpm(): number;
  setSetting(key: 'bpm', v: number): void;
  /** Un pulso nuevo en la hora real `t` (TCH.beat0 = t y BEAT.off = null): `Beat.sync`. */
  beat0(t: number): void;
  /** El aviso «Ritmo de esta canción…» (RepArena lo enseña en partida, en descanso o con la música del menú abierta). */
  say?(text: string): void;
  /** Ha cambiado el ritmo puesto (rehacer el menú, si se ve y no se está escribiendo un número). */
  changed?(): void;
  /** Se han encontrado compases (spBpmShow: las listas, a la vista; quien llama agrupa los avisos seguidos). */
  found?(): void;
  /** El texto de un error de Spotify (spErrText). */
  errText?(e: unknown): string;
}

export const SP_AUTO_MAX = 2000, SP_RETRY = 30 * 864e5;
export const SP_BPM_MAX = 500, SP_BPM_MIN = 40, SP_BPM_TOP = 200;
export const BPM_NAME: Record<string, string> = { dz: 'Deezer', rb: 'ReccoBeats', sp: 'Spotify' };

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Lo que hace falta para buscar una canción fuera: su código ISRC (lo da Spotify), el ID de Spotify, artista y título. */
export const spTrackInfo = (t: SpTrack): TrackInfo => ({
  uri: t.uri,
  isrc: t.isrc || (t.external_ids && t.external_ids.isrc) || '',
  artist: t.artist || (t.artists && t.artists[0] ? t.artists[0].name : String(t.by || '').split(',')[0].trim()),
  name: t.name || '',
});

/** JSONP en el navegador (el `jsonp` de RepArena): un <script> con su callback, que se quita al acabar. */
export function browserJsonp(url: string, ms = 6000): Promise<unknown> {
  return new Promise((res, rej) => {
    const g = globalThis as unknown as Record<string, unknown> & { document?: Document };
    const doc = g.document;
    if (!doc || !doc.createElement) {
      rej(new Error('NO_DOM'));
      return;
    }
    const cb = '__rajp' + Math.random().toString(36).slice(2), s = doc.createElement('script');
    const done = (v: unknown, e?: Error) => {
      clearTimeout(t);
      delete g[cb];
      if (s.parentNode) s.parentNode.removeChild(s);
      if (e) rej(e);
      else res(v);
    };
    const t = setTimeout(() => done(null, new Error('TIMEOUT')), ms);
    g[cb] = (v: unknown) => done(v);
    s.onerror = () => done(null, new Error('NET'));
    s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
    (doc.head || doc.body).appendChild(s);
  });
}

interface Found {
  b: number;
  src: string;
}
/** Lo que devuelve `tempo`: el BPM, el pulso de referencia (hora real, s), la canción y de dónde salió. */
export interface TempoResult {
  bpm: number;
  beat0: number;
  id: string;
  src: string;
}

export class Bpm {
  /** ReccoBeats: si no responde, no se le vuelve a preguntar en la sesión; si pide calma (429), hasta `wait`. */
  readonly rb = { off: false, wait: 0 };
  /** La cola de precarga (BPMQ). */
  readonly q = { list: [] as TrackInfo[], busy: false, seen: new Set<string>(), run: Promise.resolve() };
  /** Las fuentes de fuera (BPM_SRC: las pruebas los cambian por unos falsos). */
  readonly src = { dz: (t: TrackInfo) => this.dzBpm(t), rb: (uris: string[]) => this.rbBpms(uris) };
  /** Con el ritmo de la canción puesto (SP.songOn) y el que tenías antes (SP.baseBpm). */
  songOn = false;
  baseBpm = 0;
  /** La canción cuyo ritmo ya se puso o se está buscando (SP.tempoId, SP.tempoBusy). */
  tempoId: string | null = null;
  tempoBusy = false;

  constructor(readonly env: BpmEnv) {}

  private sleep(ms: number): Promise<void> {
    return this.env.sleep ? this.env.sleep(ms) : new Promise((r) => setTimeout(r, ms));
  }

  /** Ritmo de la canción que suena (spTempo): Spotify y, si no, los de fuera. Sin el instante de los pulsos, se cuentan
   * desde el principio de la canción (casi siempre empieza en un pulso). null si nadie lo sabe. */
  async tempo(): Promise<TempoResult | null> {
    const e = this.env, st = (await e.api('GET', '/me/player')) as { item?: SpTrack; progress_ms?: number } | null, it = st && st.item;
    if (!it || !it.id) throw new Error('NO_DEVICE');
    const start = e.perfNow() - (st.progress_ms || 0) / 1000;
    const known = this.trackBpm(it.uri);
    if (known.b) return { bpm: known.b, beat0: start, id: it.id, src: known.src };
    try {
      const a = (await e.api('GET', '/audio-analysis/' + it.id)) as { track?: { tempo?: number }; beats?: { start: number }[] } | null;
      if (a && a.track && a.track.tempo) {
        this.cache(it.uri, a.track.tempo, 'sp');
        return { bpm: a.track.tempo, beat0: a.beats && a.beats.length ? start + a.beats[0].start : start, id: it.id, src: 'sp' };
      }
    } catch {
      /* sin permiso */
    }
    try {
      const f = (await e.api('GET', '/audio-features/' + it.id)) as { tempo?: number } | null;
      if (f && f.tempo) {
        this.cache(it.uri, f.tempo, 'sp');
        return { bpm: f.tempo, beat0: start, id: it.id, src: 'sp' };
      }
    } catch {
      /* sin permiso */
    }
    const r = await this.find(spTrackInfo(it));
    return r.b ? { bpm: r.b, beat0: start, id: it.id, src: r.src } : null;
  }

  /** Deezer: por el código ISRC y, si no, buscando por artista y título (en bastantes canciones el BPM viene a 0). */
  async dzBpm(t: TrackInfo): Promise<number> {
    const bpmOf = async (id: string | number) => {
      const x = (await this.env.jsonp('https://api.deezer.com/track/' + id)) as { bpm?: number } | null;
      return x && (x.bpm as number) > SP_BPM_MIN ? (x.bpm as number) : 0;
    };
    if (t.isrc)
      try {
        const b = await bpmOf('isrc:' + encodeURIComponent(t.isrc));
        if (b) return b;
      } catch {
        /* no está */
      }
    if (!t.name) return 0;
    try {
      const r = (await this.env.jsonp('https://api.deezer.com/search?limit=3&q=' + encodeURIComponent(`artist:"${t.artist}" track:"${t.name}"`))) as { data?: { id: number }[] } | null;
      for (const x of (r && r.data) || []) {
        const b = await bpmOf(x.id);
        if (b) return b;
      }
    } catch {
      /* sin conexión */
    }
    return 0;
  }

  /** ReccoBeats: el tempo con el ID de Spotify, de 40 en 40, sin clave. { uri: tempo } de las que sepa. */
  async rbBpms(uris: string[]): Promise<Record<string, number>> {
    const ids = uris.map((u) => String(u).split(':')[2]).filter(Boolean), out: Record<string, number> = {}, f = this.env.fetch;
    if (this.rb.off || !ids.length || typeof f !== 'function' || this.env.now() < this.rb.wait) return out;
    for (let i = 0; i < ids.length; i += 40) {
      const part = ids.slice(i, i + 40);
      let r: FetchRes, j: unknown;
      try {
        r = await f('https://api.reccobeats.com/v1/audio-features?ids=' + part.join(','), { headers: { Accept: 'application/json' } });
      } catch {
        this.rb.off = true;
        return out;
      }
      if (r.status === 429) {
        const h = r.headers;
        this.rb.wait = this.env.now() + 1000 * (Number(h && h.get && h.get('Retry-After')) || 30);
        return out;
      }
      if (!r.ok) continue;
      try {
        j = await r.json();
      } catch {
        continue;
      }
      const o = j as { content?: unknown; data?: unknown; audio_features?: unknown } | null;
      const L = (Array.isArray(j) ? j : (o && (o.content || o.data || o.audio_features)) || []) as { tempo?: number; href?: string; id?: string; spotifyId?: string }[];
      for (const x of L) {
        if (!x || !((x.tempo as number) > SP_BPM_MIN)) continue;
        const sid = part.find((id) => (x.href && String(x.href).includes(id)) || x.id === id || x.spotifyId === id) || (part.length === 1 && L.length === 1 ? part[0] : null);
        if (sid) out['spotify:track:' + sid] = x.tempo as number;
      }
    }
    return out;
  }

  /** Guarda lo encontrado fuera (spBpmCache): la última, al final; si hay más de SP_AUTO_MAX, se van las más antiguas. */
  cache(uri: string, bpm: number, src: string): void {
    const c = this.env.cfg(), A = c.bpmAuto || (c.bpmAuto = {});
    delete A[uri];
    bpm = Math.round(+bpm || 0);
    A[uri] = [bpm >= SP_BPM_MIN && bpm <= SP_BPM_TOP ? bpm : 0, src || '', this.env.now()];
    const ks = Object.keys(A);
    for (let i = 0; i < ks.length - SP_AUTO_MAX; i++) delete A[ks[i]];
    this.env.save();
  }

  /** Lo encontrado fuera (spAutoBpm); `tried`: ya se buscó (lo no encontrado se vuelve a probar al cabo de un mes). */
  autoBpm(uri: string): { b: number; src: string; tried: boolean } {
    const a = uri ? (this.env.cfg().bpmAuto || {})[uri] : undefined;
    return a ? { b: a[0] || 0, src: a[1], tried: a[0] > 0 || this.env.now() - a[2] < SP_RETRY } : { b: 0, src: '', tried: false };
  }

  /** El compás que vale para una canción (spTrackBpm): el tuyo o, si no, el encontrado fuera. */
  trackBpm(uri: string): Found {
    const own = this.songBpm(uri);
    if (own) return { b: own, src: 'own' };
    const a = this.autoBpm(uri);
    return { b: a.b, src: a.src };
  }

  /** Busca el compás de una canción (spFindBpm): Deezer y, si no lo sabe, ReccoBeats; lo guarda (también si nadie lo
   * sabe, salvo si ReccoBeats no respondía: se probará otra vez). */
  async find(t: TrackInfo): Promise<{ b: number; src: string; tried?: boolean }> {
    const a = this.autoBpm(t.uri);
    if (a.tried) return a;
    let b = 0, src = '';
    try {
      b = await this.src.dz(t);
      if (b) src = 'dz';
    } catch {
      /* sin conexión */
    }
    if (!b) {
      try {
        b = (await this.src.rb([t.uri]))[t.uri] || 0;
        if (b) src = 'rb';
      } catch {
        /* no responde */
      }
    }
    if (b || !this.rb.off) this.cache(t.uri, b, src);
    return { b: Math.round(b) || 0, src };
  }

  /** Al abrir una lista se buscan los compases que falten, poco a poco (spBpmPrefetch). Devuelve la búsqueda en curso. */
  prefetch(T: SpTrack[] | null | undefined): Promise<void> {
    const q = this.q;
    for (const t of T || [])
      if (t && t.uri && !q.seen.has(t.uri) && !this.songBpm(t.uri) && !this.autoBpm(t.uri).tried) {
        q.seen.add(t.uri);
        q.list.push(spTrackInfo(t));
      }
    if (!q.busy && q.list.length) q.run = this.run();
    return q.run;
  }

  // primero Deezer, una a una; las que no sepa, a ReccoBeats de 40 en 40 (spBpmRun)
  private async run(): Promise<void> {
    const q = this.q, miss: string[] = [];
    q.busy = true;
    try {
      while (q.list.length) {
        const t = q.list.shift() as TrackInfo;
        let b = 0;
        try {
          b = await this.src.dz(t);
        } catch {
          /* sin conexión */
        }
        if (b) {
          this.cache(t.uri, b, 'dz');
          this.env.found?.();
        } else miss.push(t.uri);
        if (miss.length >= 40 || (!q.list.length && miss.length)) {
          const batch = miss.splice(0), got = await this.src.rb(batch).catch(() => ({}) as Record<string, number>);
          for (const u of batch) if (got[u]) this.cache(u, got[u], 'rb');
          else if (!this.rb.off) this.cache(u, 0, ''); // (si ReccoBeats no respondía, otra vez será)
          this.env.found?.();
        }
        await this.sleep(250); // (sin agobiar a Deezer: unas 4 por segundo)
      }
    } finally {
      q.busy = false;
    }
  }

  /** El compás propio de una canción (spSongBpm), o 0. */
  songBpm(uri: string): number {
    const b = uri ? (this.env.cfg().bpms || {})[uri] : 0;
    return b >= SP_BPM_MIN && b <= SP_BPM_TOP ? b : 0;
  }

  /** Guarda tu compás de una canción (spSongBpmSet; fuera de rango, lo quita); si suena ahora, se pone ya. */
  songBpmSet(uri: string, bpm: number): void {
    const c = this.env.cfg(), B: Record<string, number> = Object.assign({}, c.bpms);
    bpm = Math.round(+bpm);
    delete B[uri];
    if (bpm >= SP_BPM_MIN && bpm <= SP_BPM_TOP) B[uri] = bpm; // (la última, al final: si hay demasiadas, se va la más antigua)
    const ks = Object.keys(B);
    for (let i = 0; i < ks.length - SP_BPM_MAX; i++) delete B[ks[i]];
    c.bpms = B;
    this.env.save();
    const it = this.env.track();
    if (it && it.uri === uri) {
      this.tempoId = null;
      void this.autoTempo();
    }
  }

  /** ×2 o ÷2 (spBpmScale): a veces los servicios dan el doble o la mitad; el resultado pasa a ser tuyo. */
  scale(uri: string, k: number): void {
    const v = this.trackBpm(uri).b;
    if (v) this.songBpmSet(uri, clamp(Math.round(v * k), SP_BPM_MIN, SP_BPM_TOP));
  }

  /** «Ritmo de cada canción» (spAuto): activado si no lo quitaste. */
  auto(): boolean {
    return this.env.cfg().autoBpm !== false;
  }

  /** Pone el ritmo de la canción (spSongTempoSet), contado desde su principio; guarda el que tenías para devolverlo. */
  songTempoSet(b: number, src: string): void {
    const e = this.env;
    if (!this.songOn) {
      this.songOn = true;
      this.baseBpm = e.bpm();
    }
    e.setSetting('bpm', b);
    e.beat0(e.perfNow() - (e.progressMs() || 0) / 1000);
    e.say?.(`Ritmo de esta canción: ${b} BPM (${src === 'own' ? 'el tuyo' : BPM_NAME[src] || 'encontrado'})`);
    e.changed?.();
  }

  /** Vuelve el ritmo que tenías antes (spSongTempoOff). */
  songTempoOff(): void {
    if (this.songOn) {
      this.songOn = false;
      this.env.setSetting('bpm', this.baseBpm || 0);
      this.env.changed?.();
    }
  }

  /** Al cambiar de canción (spAutoTempo): con su compás guardado (el tuyo, siempre; el de fuera, con el ritmo de cada
   * canción), ese; sin él, se busca y, si nadie lo sabe, vuelve el que tenías. Devuelve la búsqueda, si la hay. */
  autoTempo(): Promise<void> {
    const it = this.env.track();
    if (!it || !it.id || it.id === this.tempoId || this.tempoBusy) return Promise.resolve();
    this.tempoId = it.id;
    const own = this.songBpm(it.uri);
    if (own) {
      this.songTempoSet(own, 'own');
      return Promise.resolve();
    }
    if (!this.auto()) {
      this.songTempoOff();
      return Promise.resolve();
    }
    const a = this.autoBpm(it.uri);
    if (a.b) {
      this.songTempoSet(a.b, a.src);
      return Promise.resolve();
    }
    if (a.tried) {
      this.songTempoOff();
      return Promise.resolve();
    }
    this.tempoBusy = true;
    const id = it.id;
    return this.tempo()
      .then((r) => {
        const cur = this.env.track();
        if (!cur || cur.id !== id) return;
        if (r) {
          this.songTempoSet(Math.round(r.bpm), r.src);
          this.env.beat0(r.beat0);
        } else this.songTempoOff();
      })
      .catch(() => {})
      .finally(() => {
        this.tempoBusy = false;
        this.env.found?.();
      });
  }

  /** «Pedir el ritmo a Spotify» (spotifyTempo de src/74_touch.js): lo pone y devuelve el texto para el jugador. */
  async askSpotify(): Promise<string> {
    try {
      const r = await this.tempo();
      if (!r) return 'No encuentro el ritmo de esta canción: márcalo con «Al compás»';
      this.tempoId = r.id;
      this.songTempoSet(Math.round(r.bpm), r.src);
      this.env.beat0(r.beat0);
      return `Ritmo de la canción: ${Math.round(r.bpm)} BPM${BPM_NAME[r.src] ? ` (${BPM_NAME[r.src]})` : ''}`;
    } catch (e) {
      return this.env.errText ? this.env.errText(e) : String((e as Error)?.message || e);
    }
  }
}
