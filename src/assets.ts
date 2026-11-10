/**
 * El catálogo de recursos (lo evalúan por separado el juego y el editor: determinista y sin efectos).
 */
import { AssetType, defineAssets } from '@iwsdk/core';
import { createArenaFloor, createCrate, createPlayerPad, createRock } from './scene-assets/arena.scene-asset.js';
import { createGate } from './scene-assets/gate.scene-asset.js';
import { createComicClouds } from './scene-assets/comic-sky.scene-asset.js';
import { createComicValley } from './scene-assets/comic-valley.scene-asset.js';
import { SOUNDS, soundId, soundUrl } from './audio/catalog.js';

const publicAssetUrl = (filePath: string): string => `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const uikitml = (fileName: string, name: string) => ({ url: publicAssetUrl(`ui/${fileName}`), type: AssetType.UIKitML, name });
const glb = (fileName: string, name: string) => ({ url: publicAssetUrl(`models/${fileName}`), type: AssetType.GLTF, name, priority: 'critical' as const });
// los sonidos (tuyos o de serie, ver src/audio/catalog.ts): IWSDK los carga cuando hacen falta (los de la partida, al arrancar)
const sounds: Record<string, { url: string; type: AssetType; name: string; priority: 'lazy' }> = {};
for (const n of Object.keys(SOUNDS)) {
  const url = soundUrl(n);
  if (url) sounds[soundId(n)] = { url, type: AssetType.Audio, name: `Sonido «${n}»`, priority: 'lazy' };
}

export default defineAssets({
  'arena-floor': createArenaFloor(),
  'player-pad': createPlayerPad(),
  crate: createCrate(),
  rock: createRock(),
  gate: createGate(),
  'comic-clouds': createComicClouds(),
  'comic-valley': createComicValley(),
  'zombie-basic': glb('zombie_basic.glb', 'Zombi verde'),
  'zombie-chubby': glb('zombie_chubby.glb', 'Zombi gordo'),
  'start-panel': uikitml('start.uikitml', 'Panel de inicio'),
  'board-panel': uikitml('board.uikitml', 'Marcador'),
  ...sounds,
});
