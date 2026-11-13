/**
 * La música en las gafas (RepArena: src/65_music.js `musicRows`, `spListMenu`, `spTrackMenu`, `spPicksMenu` y el ritmo de
 * src/74_touch.js `tempoRows`), en Opciones ▸ → Sonido: lo que suena y sus mandos, tus listas y sus canciones, las elegidas y el
 * ritmo («Al compás», «Encajar el pulso», «Ritmo de cada canción»). La lógica, en src/services/spotify.ts y bpm.ts.
 */
import { SND } from '../../audio/sound.js';
import { BEAT } from '../../core/beat-hub.js';
import { setSetting } from '../../core/settings.js';
import { HOOKS } from '../../core/state.js';
import { num } from '../../core/values.js';
import { BPM_NAME } from '../../services/bpm.js';
import { bpm, spotify } from '../../services/hub.js';
import { errText, type SpList, type SpTrack } from '../../services/spotify.js';
import type { Row as ScreenRow } from '../ra/menu-core.js';

const ACC = '#a68bff', N_LIST = 8, N_TRK = 8, N_PICK = 6;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const state = { loading: false, loadErr: '' };
const bpmShort = (uri: string): string => {
  const k = bpm().trackBpm(uri);
  return k.b ? `${k.src === 'own' ? '' : '≈'}${k.b} BPM` : 'sin BPM';
};
const bpmTag = (uri: string): string => {
  const k = bpm().trackBpm(uri);
  return k.b ? ` · ${k.src === 'own' ? '' : '≈'}${k.b} BPM` : '';
};
const favs = (): Set<string> => new Set((spotify().cfg.favs as string[] | undefined) ?? []);
const favFirst = (T: SpTrack[]): SpTrack[] => {
  const F = favs();
  return F.size ? T.filter((t) => F.has(t.uri)).concat(T.filter((t) => !F.has(t.uri))) : T;
};
const pager = (p: number, pages: number, go: (p: number) => void): ScreenRow => ({ t: 'btns', items: [{ label: '◀', onPress: () => go(p - 1) }, { label: `${p + 1} / ${pages}`, onPress: () => {} }, { label: '▶', onPress: () => go(p + 1) }] });
const act = (fn: () => Promise<unknown>): void => void spotify().act(fn);

/** La pantalla de la música: lo que suena, sus mandos, tus listas y el ritmo. Se rehace sola cuando cambia lo que suena. */
export function musicScreen(back: () => void): void {
  const sp = spotify(), again = (): void => musicScreen(back);
  HOOKS.spChanged = () => {
    if (HOOKS.screenOn()) again();
  };
  const rows: ScreenRow[] = [{ t: 'title', text: 'MÚSICA' }];
  if (!sp.connected()) rows.push({ t: 'text', text: 'Spotify sin conectar: en la página del juego (Sonido y música) pon el Client ID de tu app de Spotify y pulsa «Conectar con Spotify». Solo hace falta una vez en cada navegador.', color: '#ffd166' });
  else {
    const here = sp.hereOk() && sp.playing() && !sp.hereNow();
    const where = sp.st?.device?.name ? ` (en ${sp.st.device.name})` : '';
    rows.push({ t: 'text', text: sp.nowText() + (sp.playing() && !sp.hereNow() ? where : ''), color: sp.err ? '#ff8a3d' : '#3cf0c6' });
    if (here) rows.push({ t: 'btns', items: [{ label: 'Que suene en las gafas', style: 'primary', onPress: () => act(() => sp.toHere()) }] });
    const L = sp.lists();
    rows.push({ t: 'btns', items: [
      ...L.slice(0, 2).map((l) => ({ label: l.name, onPress: () => act(() => sp.playLists([l])) })),
      ...(L.length > 1 ? [{ label: `Mezcladas (${L.length})`, onPress: () => act(() => sp.playLists(L)) }] : []),
      { label: 'Listas y canciones ▸', accent: ACC, flex: 1.4, onPress: () => { state.loadErr = ''; listsScreen(again); } },
    ] });
    if (sp.player.state === 'error') rows.push({ t: 'text', text: sp.player.err, color: '#ffd166' });
    rows.push({ t: 'btns', items: [
      { label: 'Anterior', onPress: () => void sp.previous() },
      { label: sp.playing() ? 'Pausa' : 'Play', style: 'primary', onPress: () => void sp.toggle() },
      { label: 'Siguiente', onPress: () => void sp.next() },
      { label: 'Vol −', onPress: () => sp.setVol(-10) },
      { label: 'Vol +', onPress: () => sp.setVol(10) },
    ] });
  }
  rows.push(...tempoRows(again));
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: () => { HOOKS.spChanged = () => {}; back(); } }] });
  HOOKS.openScreen(rows, { accent: ACC });
}

/** El ritmo de la música (RepArena: tempoRows): «Al compás» (cuatro toques), «Encajar el pulso» y «Ritmo de cada canción». */
export function tempoRows(back: () => void): ScreenRow[] {
  const sp = spotify(), B = bpm(), P = num('bpm'), auto = sp.connected() && B.auto(), it = sp.connected() ? sp.st?.item : null, kb = it?.uri ? B.trackBpm(it.uri) : { b: 0, src: '' }, own = kb.src === 'own' ? kb.b : 0;
  const why = kb.b && kb.b === P ? (own ? ' (el que guardaste para esta canción)' : ` (el de esta canción, de ${BPM_NAME[kb.src] || 'fuera'})`) : auto ? ' (el de cada canción)' : '';
  const rows: ScreenRow[] = [{ t: 'text', text: P ? `Ritmo: ${P} BPM${why} · los enemigos se mueven y los objetivos llegan en el pulso` : 'Ritmo libre · toca «Al compás» 4 veces siguiendo la música' + (sp.connected() ? ' o usa el de cada canción' : ''), color: '#ffd166' }];
  const now = performance.now() / 1000, last = BEAT.taps[BEAT.taps.length - 1];
  const items: { label: string; style?: 'primary'; onPress: () => void }[] = [{
    label: BEAT.taps.length && now - last < 3.5 ? `Al compás (${BEAT.taps.length})` : 'Al compás',
    onPress: () => {
      if (sp.connected()) {
        sp.cfg.autoBpm = false;
        sp.save();
      }
      const b = BEAT.tap(performance.now() / 1000);
      if (b) {
        setSetting('bpm', b);
        SND.tick();
      }
      back();
    },
  }];
  if (auto && P) items.push({ label: 'Encajar el pulso', onPress: () => { BEAT.sync(performance.now() / 1000); SND.tick(); back(); } });
  if (sp.connected())
    items.push({ label: auto ? 'Ritmo de cada canción ✓' : 'Ritmo de cada canción', style: auto ? 'primary' : undefined, onPress: () => {
      sp.cfg.autoBpm = true;
      sp.save();
      void B.askSpotify().then((m) => {
        HOOKS.say(m, '#ffd166', 3, false);
        back();
      });
    } });
  rows.push({ t: 'btns', items });
  return rows;
}

/** Tus listas (de 8 en 8) y, arriba, tus canciones elegidas. */
function listsScreen(back: () => void, page = 0): void {
  const sp = spotify(), again = (p: number): void => listsScreen(back, p), rows: ScreenRow[] = [{ t: 'title', text: 'TUS LISTAS' }], P = sp.picks();
  if (P.length) rows.push({ t: 'btns', items: [{ label: `▶ Tus canciones elegidas (${P.length})`, style: 'primary', flex: 1.6, onPress: () => act(async () => { await sp.playTracks(sp.picks()); sp.block = null; }) }, { label: 'Ordenar ▸', accent: ACC, onPress: () => picksScreen(() => again(page)) }] });
  if (!sp.mine) {
    rows.push({ t: 'text', text: state.loadErr || 'Cargando tus listas…', color: state.loadErr ? '#ff8a3d' : '#ffd166' });
    if (state.loadErr) rows.push({ t: 'btns', items: [{ label: 'Reintentar', onPress: () => { state.loadErr = ''; again(page); } }] });
    else if (!state.loading) {
      state.loading = true;
      sp.myLists().then((l) => { sp.mine = l; state.loadErr = ''; }).catch((e) => { state.loadErr = errText(e); }).finally(() => { state.loading = false; again(page); });
    }
  } else {
    const L = sp.pickable(), pages = Math.max(1, Math.ceil(L.length / N_LIST)), p = clamp(page, 0, pages - 1), slice = L.slice(p * N_LIST, p * N_LIST + N_LIST);
    for (let i = 0; i < slice.length; i += 2) rows.push({ t: 'btns', items: slice.slice(i, i + 2).map((l) => ({ label: l.name, onPress: () => tracksScreen(l, () => again(p)) })) });
    if (pages > 1) rows.push(pager(p, pages, again));
  }
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  HOOKS.openScreen(rows.slice(0, 12), { accent: ACC });
}

/** Una lista: ponerla entera o al azar, o empezar por una canción. */
function tracksScreen(l: SpList, back: () => void, page = 0): void {
  const sp = spotify(), again = (p: number): void => tracksScreen(l, back, p), T = (sp.trk as Record<string, SpTrack[]> | undefined)?.[l.id], rows: ScreenRow[] = [{ t: 'title', text: l.name }];
  const all = (shuffle: boolean): void =>
    act(async () => {
      if (!l.liked) return sp.playList(l, undefined, shuffle);
      const t = (await sp.listTracks(l.id)).slice(); // (las que te gustan no son una lista: se ponen sus canciones)
      if (shuffle) for (let k = t.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [t[k], t[r]] = [t[r], t[k]];
      }
      await sp.playTracks(t);
      sp.block = null;
    });
  rows.push({ t: 'btns', items: [{ label: l.liked ? '▶ Todas' : '▶ Toda la lista', style: 'primary', onPress: () => all(false) }, { label: 'Al azar', onPress: () => all(true) }] });
  if (l.mine === false) rows.push({ t: 'text', text: errText(new Error('NOT_YOURS')), color: '#a49fc8' });
  else if (!T) {
    rows.push({ t: 'text', text: state.loadErr || 'Cargando sus canciones…', color: '#ffd166' });
    if (state.loadErr) rows.push({ t: 'btns', items: [{ label: 'Reintentar', onPress: () => { state.loadErr = ''; again(page); } }] });
    else if (!state.loading) {
      state.loading = true;
      sp.listTracks(l.id).catch((e: Error) => { if (e.message !== 'NOT_YOURS') state.loadErr = errText(e); }).finally(() => { state.loading = false; again(page); });
    }
  } else {
    void bpm().prefetch(T); // (los compases que falten, poco a poco)
    const pages = Math.max(1, Math.ceil(T.length / N_TRK)), p = clamp(page, 0, pages - 1), F = favs(), TF = favFirst(T);
    rows.push({ t: 'text', text: T.length ? 'Toca una canción para que la lista empiece por ella' : 'Esta lista no tiene canciones que se puedan poner', color: '#a49fc8' });
    for (const t of TF.slice(p * N_TRK, p * N_TRK + N_TRK))
      rows.push({ t: 'btns', items: [{ label: `${F.has(t.uri) ? '★ ' : ''}${t.name}${t.by ? ' — ' + t.by : ''}${bpmTag(t.uri)}`, onPress: () => act(async () => {
        if (!l.liked) return sp.playList(l, t.uri, false);
        const k = T.indexOf(t);
        await sp.playTracks(T.slice(k).concat(T.slice(0, k)));
        sp.block = null;
      }) }] });
    if (pages > 1) rows.push(pager(p, pages, again));
  }
  rows.push({ t: 'btns', items: [{ label: 'Volver', onPress: back }] });
  HOOKS.openScreen(rows.slice(0, 12), { accent: ACC });
}

/** Tus canciones elegidas: cada una con su compás, ▲ ▼ para cambiarla de sitio y ✕ para quitarla (de 6 en 6). */
function picksScreen(back: () => void, page = 0): void {
  const sp = spotify(), again = (p: number): void => picksScreen(back, p), P = sp.picks(), pages = Math.max(1, Math.ceil(P.length / N_PICK)), p = clamp(page, 0, pages - 1);
  const rows: ScreenRow[] = [{ t: 'title', text: 'TUS CANCIONES ELEGIDAS' }];
  void bpm().prefetch(P);
  const set = (L: SpTrack[]): void => {
    sp.cfg.picks = L;
    sp.started = false;
    sp.save();
    again(p);
  };
  const move = (k: number, d: number): SpTrack[] => {
    const j = k + d, L = P.slice();
    if (j < 0 || j >= L.length) return L;
    [L[k], L[j]] = [L[j], L[k]];
    return L;
  };
  rows.push({ t: 'text', text: P.length ? 'Suenan en este orden y en bucle. ▲ ▼: cambiar de sitio' : 'No tienes canciones elegidas: márcalas en una lista (aquí o en la página)', color: '#a49fc8' });
  P.slice(p * N_PICK, p * N_PICK + N_PICK).forEach((t, i) => {
    const k = p * N_PICK + i;
    rows.push({ t: 'btns', items: [{ label: `${k + 1}. ${t.name} · ${bpmShort(t.uri)}`, flex: 4.2, onPress: () => {} }, { label: '▲', onPress: () => set(move(k, -1)) }, { label: '▼', onPress: () => set(move(k, 1)) }, { label: '✕', style: 'danger', onPress: () => set(P.filter((_, j) => j !== k)) }] });
  });
  if (pages > 1) rows.push(pager(p, pages, again));
  rows.push({ t: 'btns', items: [{ label: '▶ Ponerlas', style: 'primary', onPress: () => act(async () => { await sp.playTracks(sp.picks()); sp.block = null; }) }, { label: 'Volver', onPress: back }] });
  HOOKS.openScreen(rows.slice(0, 12), { accent: ACC });
}
