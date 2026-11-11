// El ritmo de las canciones (src/services/bpm.ts) y el reloj de pulsos (src/core/beat.ts): Deezer por ISRC o por título y
// artista, ReccoBeats por lotes, la caché y su reintento al mes, la cola de precarga, ×2 ÷2, el ritmo de cada canción,
// «Al compás» con cuatro toques y el pulso que suena una vez por pulso.
import { describe, expect, it } from 'vitest';
import { Beat, MoteBeat, beatP, danceP, moteBpm } from '../../src/core/beat.js';
import { Bpm, SP_RETRY, type BpmCfg, type BpmEnv, type FetchRes, type SpTrack } from '../../src/services/bpm.js';

const DAY = 864e5;
function setup(o: { dz?: Record<string, unknown>; rb?: Record<string, number>; rbStatus?: number; rbThrow?: boolean; fetch?: boolean } = {}) {
  const W = { now: 1e12, perf: 100, bpm: 0, track: null as SpTrack | null, progress: 0, cfg: {} as BpmCfg, saves: 0, calls: [] as string[], beat0: [] as number[], say: [] as string[] };
  const dz = o.dz || {}, rb = o.rb || {};
  const env: BpmEnv = {
    cfg: () => W.cfg,
    save: () => void W.saves++,
    api: async (_m, p) => {
      W.calls.push('sp ' + p);
      if (p === '/me/player') return W.track ? { item: W.track, progress_ms: W.progress } : null;
      throw new Error('HTTP 403');
    },
    jsonp: async (url) => {
      W.calls.push('dz ' + url);
      const k = decodeURIComponent(url.replace('https://api.deezer.com/', ''));
      if (k in dz) return dz[k];
      return k.startsWith('search') ? { data: [] } : { bpm: 0 };
    },
    fetch: o.fetch === false ? undefined : async (url): Promise<FetchRes> => {
      W.calls.push('rb ' + url);
      if (o.rbThrow) throw new Error('NET');
      const ids = url.split('ids=')[1].split(',');
      const L = ids.filter((id) => rb[id]).map((id) => ({ href: 'https://open.spotify.com/track/' + id, tempo: rb[id] }));
      return { status: o.rbStatus || 200, ok: !o.rbStatus, headers: { get: () => '60' }, json: async () => ({ content: L }) };
    },
    now: () => W.now,
    perfNow: () => W.perf,
    sleep: () => Promise.resolve(),
    track: () => W.track,
    progressMs: () => W.progress,
    bpm: () => W.bpm,
    setSetting: (_k, v) => void (W.bpm = v),
    beat0: (t) => void W.beat0.push(t),
    say: (t) => void W.say.push(t),
  };
  return { W, bpm: new Bpm(env) };
}
const tr = (id: string, extra: Partial<SpTrack> = {}): SpTrack => ({ id, uri: 'spotify:track:' + id, name: 'Canción ' + id, artists: [{ name: 'Grupo' }], ...extra });

describe('Deezer', () => {
  it('por ISRC', async () => {
    const { bpm, W } = setup({ dz: { 'track/isrc:ES123': { bpm: 128.4 } } });
    expect(await bpm.dzBpm({ uri: 'u', isrc: 'ES123', artist: 'A', name: 'N' })).toBe(128.4);
    expect(W.calls).toEqual(['dz https://api.deezer.com/track/isrc:ES123']);
  });
  it('por artista y título, saltándose los que no saben el BPM', async () => {
    const { bpm, W } = setup({ dz: { 'search?limit=3&q=artist:"Grupo" track:"Canción a"': { data: [{ id: 1 }, { id: 2 }] }, 'track/1': { bpm: 0 }, 'track/2': { bpm: 96 } } });
    expect(await bpm.dzBpm({ uri: 'u', isrc: '', artist: 'Grupo', name: 'Canción a' })).toBe(96);
    expect(W.calls.length).toBe(3);
  });
  it('por debajo de 40 no vale', async () => {
    const { bpm } = setup({ dz: { 'track/isrc:X': { bpm: 30 } } });
    expect(await bpm.dzBpm({ uri: 'u', isrc: 'X', artist: '', name: '' })).toBe(0);
  });
});

describe('ReccoBeats', () => {
  it('de 40 en 40', async () => {
    const rb: Record<string, number> = {};
    // (los ID de Spotify miden todos lo mismo: así ninguno está dentro de otro)
    const uris = Array.from({ length: 85 }, (_, i) => ((rb['t' + String(i).padStart(3, '0')] = 60 + i), 'spotify:track:t' + String(i).padStart(3, '0')));
    const { bpm, W } = setup({ rb });
    const got = await bpm.rbBpms(uris);
    expect(W.calls.length).toBe(3);
    expect(Object.keys(got).length).toBe(85);
    expect(got['spotify:track:t084']).toBe(144);
  });
  it('si pide calma, espera; si no responde, no se le pregunta más', async () => {
    const a = setup({ rbStatus: 429 });
    expect(await a.bpm.rbBpms(['spotify:track:x'])).toEqual({});
    expect(a.bpm.rb.wait).toBe(a.W.now + 60000);
    await a.bpm.rbBpms(['spotify:track:x']);
    expect(a.W.calls.length).toBe(1);
    const b = setup({ rbThrow: true });
    await b.bpm.rbBpms(['spotify:track:x']);
    expect(b.bpm.rb.off).toBe(true);
    await b.bpm.rbBpms(['spotify:track:x']);
    expect(b.W.calls.length).toBe(1);
  });
});

describe('caché', () => {
  it('lo encontrado se guarda; lo no encontrado se vuelve a buscar a los 30 días', async () => {
    const { bpm, W } = setup({ rb: { b: 110 } });
    expect(await bpm.find({ uri: 'spotify:track:a', isrc: '', artist: 'G', name: 'A' })).toEqual({ b: 0, src: '' });
    expect(W.cfg.bpmAuto!['spotify:track:a']).toEqual([0, '', W.now]);
    expect(await bpm.find({ uri: 'spotify:track:b', isrc: '', artist: 'G', name: 'B' })).toEqual({ b: 110, src: 'rb' });
    const n = W.calls.length;
    expect(bpm.autoBpm('spotify:track:a').tried).toBe(true);
    await bpm.find({ uri: 'spotify:track:a', isrc: '', artist: 'G', name: 'A' });
    expect(W.calls.length).toBe(n);
    W.now += SP_RETRY + 1;
    expect(bpm.autoBpm('spotify:track:a').tried).toBe(false);
    expect(bpm.autoBpm('spotify:track:b').tried).toBe(true); // (lo encontrado, para siempre)
    await bpm.find({ uri: 'spotify:track:a', isrc: '', artist: 'G', name: 'A' });
    expect(W.calls.length).toBeGreaterThan(n);
  });
  it('sin ReccoBeats que responda, no se da por buscada', async () => {
    const { bpm, W } = setup({ rbThrow: true });
    await bpm.find({ uri: 'spotify:track:a', isrc: '', artist: 'G', name: 'A' });
    expect(W.cfg.bpmAuto).toBeUndefined();
  });
  it('fuera de rango, 0; como mucho 2000, las más antiguas fuera', () => {
    const { bpm, W } = setup();
    bpm.cache('x', 250, 'dz');
    expect(W.cfg.bpmAuto!.x[0]).toBe(0);
    for (let i = 0; i < 2005; i++) bpm.cache('u' + i, 100, 'dz');
    expect(Object.keys(W.cfg.bpmAuto!).length).toBe(2000);
    expect(W.cfg.bpmAuto!.x).toBeUndefined();
  });
});

describe('cola de precarga', () => {
  it('Deezer una a una; las que no sabe, a ReccoBeats juntas', async () => {
    const { bpm, W } = setup({ dz: { 'track/isrc:I1': { bpm: 120 } }, rb: { c: 90 } });
    let shown = 0;
    bpm.env.found = () => void shown++;
    const T = [tr('a', { external_ids: { isrc: 'I1' } }), tr('b'), tr('c')];
    await bpm.prefetch(T);
    expect(W.cfg.bpmAuto!['spotify:track:a'][0]).toBe(120);
    expect(W.cfg.bpmAuto!['spotify:track:b'][0]).toBe(0);
    expect(W.cfg.bpmAuto!['spotify:track:c'].slice(0, 2)).toEqual([90, 'rb']);
    expect(W.calls.filter((c) => c.startsWith('rb')).length).toBe(1);
    expect(shown).toBe(2);
    const n = W.calls.length;
    await bpm.prefetch(T); // (ya vistas: nada)
    expect(W.calls.length).toBe(n);
  });
});

describe('el ritmo de cada canción', () => {
  it('×2 ÷2 y el tuyo manda', () => {
    const { bpm, W } = setup();
    bpm.cache('spotify:track:a', 70, 'dz');
    bpm.scale('spotify:track:a', 2);
    expect(bpm.trackBpm('spotify:track:a')).toEqual({ b: 140, src: 'own' });
    bpm.scale('spotify:track:a', 2);
    expect(W.cfg.bpms!['spotify:track:a']).toBe(200);
    bpm.scale('spotify:track:a', 0.5);
    expect(W.cfg.bpms!['spotify:track:a']).toBe(100);
    bpm.songBpmSet('spotify:track:a', 0);
    expect(bpm.trackBpm('spotify:track:a')).toEqual({ b: 70, src: 'dz' });
  });
  it('al cambiar de canción, su ritmo contado desde su principio; sin él, el de antes', async () => {
    const { bpm, W } = setup({ dz: { 'track/isrc:I1': { bpm: 124 } } });
    W.bpm = 90;
    W.track = tr('a', { external_ids: { isrc: 'I1' } });
    W.progress = 30000;
    await bpm.autoTempo();
    expect(W.bpm).toBe(124);
    expect(W.beat0).toEqual([70, 70]);
    expect(W.say[0]).toBe('Ritmo de esta canción: 124 BPM (Deezer)');
    W.track = tr('b');
    await bpm.autoTempo();
    expect(W.bpm).toBe(90);
    expect(bpm.songOn).toBe(false);
    W.cfg.autoBpm = false;
    bpm.songBpmSet('spotify:track:b', 150); // (suena: se pone ya)
    expect(W.bpm).toBe(150);
  });
  it('«Pedir el ritmo a Spotify» sin nada que suene', async () => {
    const { bpm } = setup();
    expect(await bpm.askSpotify()).toBe('NO_DEVICE');
  });
});

describe('reloj de pulsos', () => {
  it('«Al compás»: cuatro toques dan el BPM redondeado; fuera de 0,25–1,6 s, nada', () => {
    const b = new Beat(() => 0, () => 0);
    expect([0, 0.52, 1.04].map((t) => b.tap(t))).toEqual([0, 0, 0]);
    expect(b.tap(1.56)).toBe(115);
    expect(b.beat0).toBe(1.56);
    const fast = new Beat(() => 0, () => 0);
    expect([10, 10.2, 10.4, 10.6].map((t) => fast.tap(t))).toEqual([0, 0, 0, 0]);
    const slow = new Beat(() => 0, () => 0);
    expect([20, 21.8, 23.6].map((t) => slow.tap(t)).pop()).toBe(0);
    expect(slow.taps.length).toBe(2); // (los de hace más de 3,5 s se olvidan)
  });
  it('hit, una vez por pulso (nunca en el primer fotograma)', () => {
    const b = new Beat(() => beatP(true, 120), () => 5);
    let hits = 0;
    for (let i = 0; i < 72 * 10; i++) {
      b.step(1 / 72);
      if (b.hit) hits++;
      if (i === 0) expect(b.hit).toBe(false);
    }
    expect(hits).toBe(19); // (de 10 a 30 pulsos: el que ya sonaba al empezar no cuenta)
    expect(b.now()).toBeCloseTo((10 + 5 - 1 / 72) / 0.5, 6);
    const off = new Beat(() => 0, () => 0);
    off.step(1);
    expect(off.hit).toBe(false);
    expect(off.now()).toBe(0);
  });
  it('baile: el del ritmo o el de la canción', () => {
    expect(danceP(true, 0, true, 120)).toBe(0.5);
    expect(danceP(true, 60, true, 120)).toBe(1);
    expect(danceP(false, 60, true, 120)).toBe(0);
    expect(moteBpm(100, false, true)).toBe(0);
    expect(moteBpm(100, false, false)).toBe(100);
  });
  it('luciérnagas: se enganchan al pulso', () => {
    const m = new MoteBeat();
    for (let i = 0; i < 72 * 20; i++) m.step(1 / 72, 120, i / 72, 0);
    expect(m.k).toBeGreaterThan(0.99);
    expect(m.rate).toBeCloseTo(2, 6);
    const want = ((20 - 1 / 72) * 2) % 4;
    expect(Math.abs(m.ph - want)).toBeLessThan(0.02);
  });
});
void DAY;
