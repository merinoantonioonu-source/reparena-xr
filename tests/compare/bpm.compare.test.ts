// El ritmo de las canciones (src/services/bpm.ts) y el reloj de pulsos (src/core/beat.ts) frente al código original de
// RepArena (src/65_music.js de spTempo a spAutoTempo, tapTempo y spotifyTempo de src/74_touch.js, el pulso de
// src/70_game.js y el baile de las luciérnagas de src/56_motes.js), con los mismos Spotify, Deezer y ReccoBeats falsos:
// una partida de minuto y medio en la que se abren listas (precarga), cambian las canciones (las que sabe Deezer por ISRC
// o por título, las de Spotify, las que nadie sabe, las ya guardadas), se marca el compás a mano, se guarda, se dobla, se
// quita el ritmo de cada canción, pasa un mes (reintento), ReccoBeats pide calma y se pausa la partida. Al final, la misma
// cfg guardada, las mismas llamadas, los mismos avisos y ajustes; y en cada fotograma, el mismo pulso y el mismo baile.
// (Se salta sin RA_DIR: ver tests/compare/ra.ts.)
import { describe, expect, it } from 'vitest';
import { Beat, MoteBeat, arxBeatP, beatP, danceP, moteBpm } from '../../src/core/beat.js';
import { Bpm, type BpmCfg, type FetchRes, type SpTrack } from '../../src/services/bpm.js';
import { RA_DIR, raRun, raSlice } from './ra.js';

const DT = 1 / 72;
const r6 = (v: number | null) => (v === null ? 'null' : String(Math.round(v * 1e6) / 1e6));

// El mundo de una de las dos versiones: ajustes, relojes, lo que suena, la cfg y lo que pasa (log)
function mkWorld() {
  const W = {
    settings: { bpm: 0, mode: 'combat', arcBeat: true },
    now: 1.7e12,
    perf: 50,
    st: { item: null as SpTrack | null, progress_ms: 0 },
    playing: true,
    cfg: { vol: 40 } as BpmCfg,
    log: [] as string[],
    rbN: 0,
  };
  const DZ_ISRC: Record<string, number> = { I1: 124.6, I3: 30, I5: 0 };
  const DZ_SEARCH: Record<string, number[]> = { 'Grupo|Canción s1': [11, 12], 'Grupo|Canción s2': [13], 'Grupo|Canción t': [] };
  const DZ_ID: Record<number, number> = { 11: 0, 12: 133, 13: 98 };
  const RB: Record<string, number> = { r1: 77, r2: 142.2, s3: 0, x05: 101, x17: 92, x33: 166, x44: 120, y2: 112, y4: 64 };
  const jsonp = async (url: string): Promise<unknown> => {
    W.log.push('jsonp ' + url);
    const k = decodeURIComponent(url.replace('https://api.deezer.com/', ''));
    if (k.startsWith('track/isrc:')) {
      const c = k.slice(11);
      if (c === 'BAD') throw new Error('TIMEOUT');
      return { bpm: DZ_ISRC[c] || 0 };
    }
    if (k.startsWith('track/')) return { bpm: DZ_ID[+k.slice(6)] || 0 };
    const m = /artist:"(.*)" track:"(.*)"/.exec(k) as RegExpExecArray;
    return { data: (DZ_SEARCH[m[1] + '|' + m[2]] || []).map((id) => ({ id })) };
  };
  const fetch = async (url: string): Promise<FetchRes> => {
    W.log.push('fetch ' + url);
    const n = ++W.rbN, ids = url.split('ids=')[1].split(',');
    if (n === 4) return { status: 429, ok: false, headers: { get: () => '5' }, json: async () => null };
    if (n === 6) return { status: 500, ok: false, json: async () => null };
    if (n === 8) throw new Error('NET');
    const L = ids.filter((id) => id in RB).map((id) => (n % 2 ? { href: 'https://api.reccobeats.com/track/' + id, tempo: RB[id] } : { id, tempo: RB[id] }));
    return { status: 200, ok: true, json: async () => (n % 3 === 0 ? L : { content: L }) };
  };
  const api = async (m: string, p: string): Promise<unknown> => {
    W.log.push('api ' + m + ' ' + p);
    if (p === '/me/player') return W.st.item ? { item: W.st.item, progress_ms: W.st.progress_ms + 250 } : null;
    if (p === '/audio-analysis/sp1') return { track: { tempo: 101.3 }, beats: [{ start: 0.4 }] };
    if (p === '/audio-features/sp2') return { tempo: 87.6 };
    throw new Error('HTTP 403');
  };
  return { W, jsonp, fetch, api };
}
type World = ReturnType<typeof mkWorld>;
const isCombat = (W: World['W']) => W.settings.mode === 'combat';

interface RA {
  spAutoTempo(): void;
  spBpmPrefetch(T: SpTrack[]): void;
  spSongBpmSet(uri: string, b: number): void;
  spBpmScale(uri: string, k: number): void;
  spFindBpm(t: unknown): Promise<unknown>;
  spTrackInfo(t: SpTrack): unknown;
  spotifyTempo(): Promise<string>;
  tapTempo(): boolean;
  beatStep(dt: number): void;
  beatNow(): number;
  danceP(): number;
  motesBeat(dt: number): void;
  BEAT: { t: number; off: number | null; hit: boolean; last: number };
  MOTEB: { fly: number; ph: number; sw: number; rate: number; k: number };
  TCH: { beat0: number };
  SP: { songOn?: boolean };
}

function raSide(w: World): RA {
  const { W } = w;
  const code = [
    raSlice('00_core.js', 'const clamp'),
    raSlice('74_touch.js', 'const perfNow'),
    raSlice('74_touch.js', 'function tapTempo', '}'),
    raSlice('74_touch.js', 'async function spotifyTempo', '}'),
    raSlice('65_music.js', 'async function spTempo', '}'),
    raSlice('65_music.js', 'const spTrackInfo', 'function spNowText', false),
    raSlice('70_game.js', 'const beatP'),
    raSlice('70_game.js', 'function danceP'),
    raSlice('70_game.js', 'const BEAT '),
    raSlice('70_game.js', 'const arxBeatP'),
    raSlice('70_game.js', 'const beatNow'),
    raSlice('70_game.js', 'function beatStep', '}'),
    raSlice('56_motes.js', 'const MOTEB'),
    raSlice('56_motes.js', 'const moteBpm'),
    raSlice('56_motes.js', 'function motesBeat', '}'),
    // (lo que se ve de lo encontrado: aquí, solo se apunta)
    "spBpmShow = function () { LOG('found'); };",
  ].join('\n');
  const SP = { cfg: W.cfg, get st() { return W.st; } };
  const TCH = { beat0: 0, taps: [] as number[] };
  return raRun<RA>(code, '{ spAutoTempo, spBpmPrefetch, spSongBpmSet, spBpmScale, spFindBpm, spTrackInfo, spotifyTempo, tapTempo, beatStep, beatNow, danceP, motesBeat, BEAT, MOTEB, TCH, SP }', {
    LOG: (s: string) => W.log.push(s),
    SP,
    TCH,
    settings: W.settings,
    get state() { return 'play'; },
    menu: { rebuild: () => W.log.push('changed'), keypad: false },
    say: (t: string) => W.log.push('say ' + t),
    setSetting: (k: 'bpm', v: number) => { W.settings[k] = v; W.log.push('set ' + k + '=' + v); },
    spSave: () => W.log.push('save'),
    spApi: w.api,
    spErrText: (e: Error) => 'error ' + e.message,
    jsonp: w.jsonp,
    fetch: w.fetch,
    isCombat: () => isCombat(W),
    spPlaying: () => W.playing,
    SND: { tick: () => {} },
    Date: { now: () => W.now },
    performance: { now: () => W.perf * 1000 },
    setTimeout: (fn: () => void) => (queueMicrotask(fn), 0),
    clearTimeout: () => {},
  });
}

function xrSide(w: World) {
  const { W } = w;
  const perfNow = () => (W.perf * 1000) / 1000; // (como RepArena: performance.now() / 1000)
  const beat = new Beat(() => beatP(isCombat(W), W.settings.bpm) || arxBeatP(W.settings.mode === 'arcs', W.settings.arcBeat, W.settings.bpm), perfNow);
  const motes = new MoteBeat();
  const bpm = new Bpm({
    cfg: () => W.cfg,
    save: () => W.log.push('save'),
    api: w.api,
    jsonp: w.jsonp,
    fetch: w.fetch,
    now: () => W.now,
    perfNow,
    sleep: () => Promise.resolve(),
    track: () => W.st.item,
    progressMs: () => W.st.progress_ms,
    bpm: () => W.settings.bpm,
    setSetting: (k, v) => { W.settings[k] = v; W.log.push('set ' + k + '=' + v); },
    beat0: (t) => beat.sync(t),
    say: (t) => W.log.push('say ' + t),
    changed: () => W.log.push('changed'),
    found: () => W.log.push('found'),
    errText: (e) => 'error ' + (e as Error).message,
  });
  const dance = () => {
    const it = W.st.item;
    return danceP(isCombat(W), W.settings.bpm, W.playing, it && it.uri ? bpm.trackBpm(it.uri).b : 0);
  };
  const tap = () => {
    const b = beat.tap(perfNow());
    if (b) W.settings.bpm = b, W.log.push('set bpm=' + b);
    return !!b;
  };
  return { beat, motes, bpm, dance, tap, perfNow };
}

const tr = (id: string, extra: Partial<SpTrack> = {}): SpTrack => ({ id, uri: 'spotify:track:' + id, name: 'Canción ' + id, artists: [{ name: 'Grupo' }], ...extra });
const LIST1 = [tr('i1', { external_ids: { isrc: 'I1' } }), tr('s1'), tr('s2'), tr('r1'), tr('r2'), tr('i3', { external_ids: { isrc: 'I3' } }), tr('bad', { isrc: 'BAD' }), tr('t'), { uri: 'spotify:track:by1', by: 'Grupo, Otro', name: 'Canción s2' }];
const LIST2 = Array.from({ length: 50 }, (_, i) => tr('x' + String(i).padStart(2, '0')));
const LIST3 = [tr('y1'), tr('y2')];
const flush = () => new Promise<void>((r) => setImmediate(r));

// lo que hace el jugador (y la música) en cada fotograma; `a` y `x`, lo mismo en cada versión
type Act = (W: World['W'], a: RA, x: ReturnType<typeof xrSide>) => void | Promise<unknown>;
const play = (W: World['W'], item: SpTrack | null, prog = 0) => { W.st.item = item; W.st.progress_ms = prog; };
const ACTS: Record<number, [Act, Act]> = {
  10: [(_W, a) => a.spBpmPrefetch(LIST1), (_W, _a, x) => x.bpm.prefetch(LIST1)],
  100: [(W, a) => (play(W, tr('i1', { external_ids: { isrc: 'I1' } }), 12000), a.spAutoTempo()), (W, _a, x) => (play(W, tr('i1', { external_ids: { isrc: 'I1' } }), 12000), x.bpm.autoTempo())],
  300: [(W, a) => (play(W, tr('nueva', { external_ids: { isrc: 'I5' } }), 3000), a.spAutoTempo()), (W, _a, x) => (play(W, tr('nueva', { external_ids: { isrc: 'I5' } }), 3000), x.bpm.autoTempo())],
  700: [(W, a) => (play(W, tr('sp1'), 45000), a.spAutoTempo()), (W, _a, x) => (play(W, tr('sp1'), 45000), x.bpm.autoTempo())],
  900: [(W, a) => a.spSongBpmSet((W.st.item as SpTrack).uri, 95), (W, _a, x) => x.bpm.songBpmSet((W.st.item as SpTrack).uri, 95)],
  1000: [(W, a) => a.spBpmScale((W.st.item as SpTrack).uri, 2), (W, _a, x) => x.bpm.scale((W.st.item as SpTrack).uri, 2)],
  1050: [(W, a) => a.spBpmScale((W.st.item as SpTrack).uri, 2), (W, _a, x) => x.bpm.scale((W.st.item as SpTrack).uri, 2)],
  1100: [(W, a) => (play(W, tr('t'), 1000), a.spAutoTempo()), (W, _a, x) => (play(W, tr('t'), 1000), x.bpm.autoTempo())],
  1300: [(W, a) => (play(W, tr('s1'), 60000), a.spAutoTempo()), (W, _a, x) => (play(W, tr('s1'), 60000), x.bpm.autoTempo())],
  1500: [(W, a) => ((W.cfg.autoBpm = false), play(W, tr('r1')), a.spAutoTempo()), (W, _a, x) => ((W.cfg.autoBpm = false), play(W, tr('r1')), x.bpm.autoTempo())],
  1550: [(W, a) => a.spSongBpmSet('spotify:track:r1', 180), (_W, _a, x) => x.bpm.songBpmSet('spotify:track:r1', 180)],
  1600: [(W, a) => ((W.cfg.autoBpm = true), (W.now += 31 * 864e5), play(W, tr('nueva', { external_ids: { isrc: 'I5' } }), 500), a.spAutoTempo()), (W, _a, x) => ((W.cfg.autoBpm = true), (W.now += 31 * 864e5), play(W, tr('nueva', { external_ids: { isrc: 'I5' } }), 500), x.bpm.autoTempo())],
  1700: [(W, a) => (play(W, tr('sp2'), 9000), a.spotifyTempo().then((s) => W.log.push(s))), (W, _a, x) => (play(W, tr('sp2'), 9000), x.bpm.askSpotify().then((s) => W.log.push(s)))],
  1750: [(W, a) => (play(W, null), a.spotifyTempo().then((s) => W.log.push(s))), (W, _a, x) => (play(W, null), x.bpm.askSpotify().then((s) => W.log.push(s)))],
  1800: [(W) => void (W.settings.mode = 'arcs'), (W) => void (W.settings.mode = 'arcs')],
  2000: [(W) => void (W.playing = false), (W) => void (W.playing = false)],
  2100: [(W, a) => ((W.settings.mode = 'combat'), (W.playing = true), a.spBpmPrefetch(LIST2)), (W, _a, x) => ((W.settings.mode = 'combat'), (W.playing = true), x.bpm.prefetch(LIST2))],
  2200: [(W, a) => a.spFindBpm(a.spTrackInfo(tr('s3'))).then((r) => W.log.push(JSON.stringify(r))), (W, _a, x) => x.bpm.find({ uri: 'spotify:track:s3', isrc: '', artist: 'Grupo', name: 'Canción s3' }).then((r) => W.log.push(JSON.stringify(r)))],
  2400: [(_W, a) => void (a.BEAT.off = null), (_W, _a, x) => x.beat.relock()], // (vuelta de la pausa)
  2500: [(W) => void (W.settings.mode = 'touch'), (W) => void (W.settings.mode = 'touch')],
  2700: [(_W, a) => a.spBpmPrefetch(LIST3), (_W, _a, x) => x.bpm.prefetch(LIST3)],
  2750: [(W, a) => a.spFindBpm(a.spTrackInfo(tr('y3'))).then((r) => W.log.push(JSON.stringify(r))), (W, _a, x) => x.bpm.find({ uri: 'spotify:track:y3', isrc: '', artist: 'Grupo', name: 'Canción y3' }).then((r) => W.log.push(JSON.stringify(r)))],
  2800: [(_W, a) => a.spBpmPrefetch([tr('y4')]), (_W, _a, x) => x.bpm.prefetch([tr('y4')])],
  2850: [(_W, a) => a.spBpmPrefetch([tr('y5')]), (_W, _a, x) => x.bpm.prefetch([tr('y5')])],
  2860: [(_W, a) => a.spBpmPrefetch([tr('y6')]), (_W, _a, x) => x.bpm.prefetch([tr('y6')])],
  2870: [(W, a) => a.spFindBpm(a.spTrackInfo(tr('y7'))).then((r) => W.log.push(JSON.stringify(r))), (W, _a, x) => x.bpm.find({ uri: 'spotify:track:y7', isrc: '', artist: 'Grupo', name: 'Canción y7' }).then((r) => W.log.push(JSON.stringify(r)))],
  2600: [(W) => void ((W.settings.mode = 'combat'), (W.settings.bpm = 0)), (W) => void ((W.settings.mode = 'combat'), (W.settings.bpm = 0))],
};
// «Al compás»: cuatro toques a 0,5 s y uno suelto, deprisa; cuatro a 1,125 s (justo dentro de los 3,5 s) y cuatro con la
// mediana pasada de 1,6 s; y otros cuatro a 0,19 s, demasiado deprisa
for (const f of [400, 436, 472, 508, 515, 1900, 1981, 2062, 2143, 2300, 2307, 2426, 2548, 2610, 2624, 2638, 2652]) ACTS[f] = [(_W, a) => void a.tapTempo(), (_W, _a, x) => void x.tap()];
const FRAMES = 72 * 40;

describe.skipIf(!RA_DIR)('el ritmo, frente a RepArena', () => {
  it('la misma cfg, las mismas llamadas y avisos, y en cada fotograma el mismo pulso y el mismo baile', async () => {
    const wa = mkWorld(), wx = mkWorld(), a = raSide(wa), x = xrSide(wx);
    const fa: string[] = [], fx: string[] = [];
    for (let f = 0; f < FRAMES; f++) {
      for (const [w] of [[wa], [wx]] as const) {
        w.W.perf += DT;
        w.W.now += DT * 1000;
      }
      const act = ACTS[f];
      if (act) {
        await act[0](wa.W, a, x);
        await act[1](wx.W, a, x);
        await flush();
        await flush();
      }
      a.beatStep(DT);
      a.motesBeat(DT);
      x.beat.step(DT);
      x.motes.step(DT, moteBpm(wx.W.settings.bpm, wx.W.playing, x.bpm.songOn), x.perfNow(), x.beat.beat0);
      const B = a.BEAT, M = a.MOTEB;
      fa.push([f, r6(B.t), r6(B.off), B.hit, B.last, r6(a.beatNow()), r6(a.danceP()), r6(a.TCH.beat0), M.fly, M.ph, M.sw, M.rate, M.k].map((v) => (typeof v === 'number' ? r6(v) : String(v))).join(' '));
      const b = x.beat, m = x.motes;
      fx.push([f, r6(b.t), r6(b.off), b.hit, b.last, r6(b.now()), r6(x.dance()), r6(b.beat0), m.fly, m.ph, m.sw, m.rate, m.k].map((v) => (typeof v === 'number' ? r6(v) : String(v))).join(' '));
      if (fa[f] !== fx[f]) expect(fx[f]).toBe(fa[f]);
    }
    expect(wx.W.log).toEqual(wa.W.log);
    expect(JSON.stringify(wx.W.cfg)).toBe(JSON.stringify(wa.W.cfg));
    expect(wx.W.settings).toEqual(wa.W.settings);
    expect(x.bpm.songOn).toBe(!!a.SP.songOn);
    // que la partida pasa por todo: hay pulsos, Deezer, ReccoBeats, Spotify, la caché y su reintento, la calma y los avisos
    const L = wa.W.log.join('\n');
    for (const s of ['jsonp https://api.deezer.com/search', 'fetch https://api.reccobeats.com', 'api GET /audio-analysis/sp1', 'say Ritmo de esta canción: 101 BPM (Spotify)', 'say Ritmo de esta canción: 95 BPM (el tuyo)', 'set bpm=120', 'Ritmo de la canción: 88 BPM (Spotify)', 'error NO_DEVICE'])
      expect(L).toContain(s);
    expect(fa.filter((s) => s.split(' ')[3] === 'true').length).toBeGreaterThan(50);
    expect(Object.keys(wa.W.cfg.bpmAuto || {}).length).toBeGreaterThan(40);
    // (ReccoBeats: la calma, un fallo, un lote y, al final, sin respuesta: no se le pregunta más ni se da por buscada)
    expect(wa.W.rbN).toBe(8);
    expect(wa.W.cfg.bpmAuto!['spotify:track:y4'][0]).toBe(64);
    expect(wa.W.cfg.bpmAuto!['spotify:track:y5']).toBeUndefined();
    expect(wa.W.cfg.bpmAuto!['spotify:track:y7']).toBeUndefined();
  });
});
