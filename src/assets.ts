/**
 * El catálogo de recursos (lo evalúan por separado el juego y el editor: determinista y sin efectos).
 */
import { AssetType, defineAssets } from '@iwsdk/core';
import { createArenaFloor, createCrate, createPlayerPad, createRock } from './scene-assets/arena.scene-asset.js';
import { createGate } from './scene-assets/gate.scene-asset.js';
import { createHatch } from './scene-assets/hatch.scene-asset.js';
import { createArc } from './scene-assets/arc.scene-asset.js';
import { createTouchGem, createTouchPad, createTouchRing } from './scene-assets/touch.scene-asset.js';
import { createLaser, createMace, createOrb, createWalls } from './scene-assets/arc-extras.scene-asset.js';
import { createComicClouds } from './scene-assets/comic-sky.scene-asset.js';
import { createComicValley } from './scene-assets/comic-valley.scene-asset.js';
import { SOUNDS, soundId, soundUrl } from './audio/catalog.js';

const publicAssetUrl = (filePath: string): string => `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const uikitml = (fileName: string, name: string) => ({ url: publicAssetUrl(`ui/${fileName}`), type: AssetType.UIKitML, name });
const glb = (fileName: string, name: string) => ({ url: publicAssetUrl(`models/${fileName}`), type: AssetType.GLTF, name, priority: 'critical' as const });
// los enemigos que no son los de siempre: los carga IWSDK después de arrancar, sin hacer esperar al menú
const foe = (fileName: string, name: string) => ({ url: publicAssetUrl(`models/${fileName}`), type: AssetType.GLTF, name, priority: 'background' as const });
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
  hatch: createHatch(),
  arc: createArc().grp,
  'arc-hurdle': createArc(0.14, 2.55, 0, true).grp,
  'arc-laser': createLaser().grp,
  'arc-walls': createWalls().grp,
  'arc-mace': createMace(2.4, 2).grp,
  'arc-orb': createOrb().grp,
  'touch-ring': createTouchRing().grp,
  'touch-gem': createTouchGem().grp,
  'touch-pad': createTouchPad().grp,
  'comic-clouds': createComicClouds(),
  'comic-valley': createComicValley(),
  'zombie-basic': glb('zombie_basic.glb', 'Zombi verde'),
  'zombie-chubby': glb('zombie_chubby.glb', 'Zombi gordo'),
  'foe-zombie': foe('zombie.glb', 'Zombi'),
  'foe-zombie-palette': { url: publicAssetUrl('models/tex/zombie.png'), type: AssetType.Texture, name: 'Zombi: su paleta de colores', priority: 'background' as const },
  'foe-raptor': foe('raptor.glb', 'Velociraptor'),
  'foe-skeleton': foe('piratas/esqueleto.glb', 'Esqueleto pirata'),
  'foe-captain': foe('piratas/capitan.glb', 'Capitán Barbarroja'),
  'foe-sharky': foe('piratas/sharky.glb', 'Tiburón'),
  'foe-mako': foe('piratas/mako.glb', 'Tiburón gris'),
  'foe-demon': foe('monstruitos/demon.glb', 'Demonio'),
  'foe-greendemon': foe('monstruitos/greendemon.glb', 'Demonio verde'),
  'foe-cyclops': foe('monstruitos/cyclops.glb', 'Cíclope'),
  'foe-yeti': foe('monstruitos/yeti.glb', 'Yeti'),
  'foe-skull': foe('monstruitos/skull.glb', 'Calavera'),
  'foe-alien': foe('monstruitos/alien.glb', 'Alien'),
  'foe-alientall': foe('monstruitos/alien_tall.glb', 'Alien alto'),
  // los de las trampillas (Cute Animated Monsters): el cangrejo y la seta (la calavera, la de las compuertas)
  'foe-crab': foe('monstruitos/crab.glb', 'Cangrejo'),
  'foe-mushroom': foe('monstruitos/mushroom.glb', 'Seta'),
  // los voladores (Cute Animated Monsters)
  'foe-bee': foe('monstruitos/bee.glb', 'Abeja'),
  'foe-bat': foe('monstruitos/bat.glb', 'Murciélago'),
  'foe-cthulhu': foe('monstruitos/cthulhu.glb', 'Cthulhu'),
  'foe-dragon': foe('monstruitos/yellowdragon.glb', 'Dragón'),
  // el diablillo y el puglin (Bestiary), con las animaciones de la biblioteca (Universal Animation Library) y tres colores
  'foe-imp': foe('imp.glb', 'Diablillo'),
  'foe-puglin': foe('puglin.glb', 'Puglin'),
  'foe-anims': foe('anims.glb', 'Animaciones de la biblioteca (diablillo y puglin)'),
  ...Object.fromEntries(['imp', 'puglin'].flatMap((k) => [1, 2, 3].map((v) => [`foe-${k}-color${v}`, { url: publicAssetUrl(`models/tex/${k}_color${v}.jpg`), type: AssetType.Texture, name: `${k === 'imp' ? 'Diablillo' : 'Puglin'}: color ${v}`, priority: 'background' as const }]))),
  'lobby-panel': uikitml('lobby.uikitml', 'Menú principal'),
  'options-panel': uikitml('options.uikitml', 'Opciones'),
  'hint-panel': uikitml('hint.uikitml', 'Explicación de un ajuste'),
  'board-panel': uikitml('board.uikitml', 'Marcador'),
  'warn-floor': uikitml('warn.uikitml', 'Aviso en el suelo'),
  'charge-floor': uikitml('charge.uikitml', 'Carga en el suelo'),
  'wave-intro': uikitml('wave.uikitml', 'Panel entre oleadas'),
  'perks-cards': uikitml('perks.uikitml', 'Cartas de mejora'),
  'trophy-card': uikitml('trophy.uikitml', 'Logro en grande (trofeo dorado)'),
  'summary-card': uikitml('summary.uikitml', 'Resumen de la ronda'),
  'pause-card': uikitml('pause.uikitml', 'Pausa'),
  'wrist-card': uikitml('wrist.uikitml', 'Botón MENÚ de la muñeca'),
  'center-card': uikitml('center.uikitml', 'Aviso del centro de la vista (calibración, ¡prepárate!)'),
  'hoy-card': uikitml('hoy.uikitml', 'Columna HOY (metas, cofre, racha y nivel)'),
  'metas-card': uikitml('metas.uikitml', 'Carátula METAS DE HOY (al entrar en las gafas)'),
  'toast-card': uikitml('toast.uikitml', 'Aviso breve en la vista'),
  // la isla pirata (Pirate Kit): de momento, solo su cofre (el del descanso de Combate)
  'island-kit': foe('island.glb', 'Isla pirata (Pirate Kit)'),
  ...sounds,
});
