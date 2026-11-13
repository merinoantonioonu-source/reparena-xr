// La firma de la pantalla de la música (src/services/music-sig.ts): igual mientras no cambia lo que enseña (Spotify se
// pregunta cada 5 s: así el menú no se rehace cada vez) y distinta en cuanto cambia algo de lo que se ve.
import { describe, expect, it } from 'vitest';
import { musicSig } from '../../src/services/music-sig.js';

function fake() {
  const S = {
    on: true, playing: true, here: false, ok: true, err: '',
    st: { is_playing: true, device: { id: 'd1', name: 'Móvil' }, item: { uri: 'spotify:track:1', name: 'Canción', artists: [{ name: 'Artista' }] } } as Record<string, any>,
    player: { player: null, id: 'p', state: 'ready', err: '' },
    lists: [{ name: 'Correr' }, { name: 'Pesas' }],
    vol: 60,
  };
  const sp = {
    connected: () => S.on,
    nowText: () => (S.err ? S.err : `${S.playing ? 'Suena' : 'En pausa'}: ${S.st.item?.name} — vol. ${S.vol}%`),
    playing: () => S.playing,
    hereNow: () => S.here,
    hereOk: () => S.ok,
    lists: () => S.lists,
    get st() { return S.st; },
    get err() { return S.err; },
    get player() { return S.player; },
  };
  const B = { auto: () => true, trackBpm: (u: string) => (u === 'spotify:track:1' ? { b: 128, src: 'own' } : { b: 0, src: '' }) };
  return { S, sp: sp as never, B: B as never };
}

describe('la firma de la pantalla de la música', () => {
  it('no cambia si Spotify contesta lo mismo (no se rehace el menú)', () => {
    const { sp, B } = fake();
    const a = musicSig(sp, B, 128);
    for (let i = 0; i < 5; i++) expect(musicSig(sp, B, 128)).toBe(a);
  });
  it('cambia con lo que se ve: la canción, la pausa, el volumen, el dispositivo, un error, las listas o el ritmo', () => {
    const { S, sp, B } = fake(), base = musicSig(sp, B, 128);
    const tries: [string, () => void, () => void][] = [
      ['canción', () => (S.st = { ...S.st, item: { uri: 'spotify:track:2', name: 'Otra' } }), () => (S.st = { ...S.st, item: { uri: 'spotify:track:1', name: 'Canción', artists: [{ name: 'Artista' }] } })],
      ['pausa', () => (S.playing = false), () => (S.playing = true)],
      ['volumen', () => (S.vol = 70), () => (S.vol = 60)],
      ['dispositivo', () => (S.st = { ...S.st, device: { id: 'd2', name: 'Gafas' } }), () => (S.st = { ...S.st, device: { id: 'd1', name: 'Móvil' } })],
      ['en las gafas', () => (S.here = true), () => (S.here = false)],
      ['error', () => (S.err = 'Abre Spotify'), () => (S.err = '')],
      ['reproductor', () => (S.player = { ...S.player, state: 'error', err: 'sin DRM' }), () => (S.player = { ...S.player, state: 'ready', err: '' })],
      ['listas', () => (S.lists = [{ name: 'Correr' }]), () => (S.lists = [{ name: 'Correr' }, { name: 'Pesas' }])],
    ];
    for (const [what, set, undo] of tries) {
      set();
      expect(musicSig(sp, B, 128), what).not.toBe(base);
      undo();
      expect(musicSig(sp, B, 128), what + ' (de vuelta)').toBe(base);
    }
    expect(musicSig(sp, B, 120)).not.toBe(base); // (el ritmo)
  });
  it('sin conectar, solo el ritmo', () => {
    const { S, sp, B } = fake();
    S.on = false;
    expect(musicSig(sp, B, 0)).toBe('off|0');
    expect(musicSig(sp, B, 90)).toBe('off|90');
  });
});
