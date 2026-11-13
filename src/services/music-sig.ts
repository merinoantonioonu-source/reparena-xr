/**
 * La firma de la pantalla de la música (sin IWSDK): todo lo que enseña, en un texto. A Spotify se le pregunta cada 5 s y antes
 * se rehacía el menú entero cada vez, cambiara algo o no (en las gafas, el menú daba un salto y a veces salía en blanco un
 * fotograma); ahora solo se rehace si cambia la firma (RepArena: spMenuSync). Se prueba en tests/unit/music-sig.test.ts.
 */
import type { Bpm } from './bpm.js';
import type { Spotify } from './spotify.js';

type SigSp = Pick<Spotify, 'connected' | 'nowText' | 'playing' | 'hereNow' | 'hereOk' | 'lists' | 'st' | 'err' | 'player'>;
type SigBpm = Pick<Bpm, 'auto' | 'trackBpm'>;

/** Lo que suena, dónde, las listas, los errores y el ritmo (el de ahora, `bpm`, y el de la canción). */
export function musicSig(sp: SigSp, B: SigBpm, bpm: number): string {
  if (!sp.connected()) return `off|${bpm}`;
  const uri = sp.st?.item?.uri ?? '', kb = uri ? B.trackBpm(uri) : { b: 0, src: '' };
  return [sp.nowText(), sp.playing(), sp.hereNow(), sp.hereOk(), sp.st?.device?.name ?? '', sp.err, sp.player.state, sp.player.err, sp.lists().map((l) => l.name).join(','), bpm, B.auto(), uri, kb.b, kb.src].join('|');
}
