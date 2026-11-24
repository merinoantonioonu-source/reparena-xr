// Script de una sola vez: prepara los modelos de KayKit (Kay Lousberg, CC0) que usa el juego, en `public/models/kaykit/`:
//  - `cementerio.glb`: las piezas del cementerio (Halloween Bits 1.0) juntas, cada una bajo un nodo de primer nivel con su nombre
//    (así las lee `kitParts`), con su única textura;
//  - `esqueleto_{minion,warrior,mage}.glb`: los esqueletos (Character Pack: Skeletons 1.0) con su arma en la mano (hacha;
//    espada y escudo; bastón) y solo las animaciones que usa el juego.
// No crea nada de cero: junta y recorta lo de los packs. Uso (con los dos repos clonados de github.com/KayKit-Game-Assets):
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/functions@4
//   node tests/kaykit-glb.mjs <carpeta con KayKit-Halloween-Bits-1.0 y KayKit-Character-Pack-Skeletons-1.0>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { NodeIO, Document } = require('@gltf-transform/core');
const { mergeDocuments, prune, dedup, unpartition } = require('@gltf-transform/functions');
const BASE = process.argv[2] ?? 'tmp-kaykit', OUT = 'public/models/kaykit';

// ---------------------------------------------------------------- los esqueletos
{
  const SRC = `${BASE}/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons`;
// Prepara los esqueletos de KayKit (CC0) para el juego: cada uno con su arma en la mano y solo las animaciones que se usan.
const KEEP = new Set(['Idle', 'Walking_D_Skeletons', 'Running_A', '1H_Melee_Attack_Chop', 'Spellcast_Shoot', 'Hit_A', 'Death_C_Skeletons', 'Cheer', 'Taunt', 'Spawn_Ground_Skeletons']);
const CH = `${SRC}/Characters/gltf`, AS = `${SRC}/Assets/gltf`;
const WHO = { Minion: [['Skeleton_Axe', 'handslot.r']], Warrior: [['Skeleton_Blade', 'handslot.r'], ['Skeleton_Shield_Small_A', 'handslot.l']], Mage: [['Skeleton_Staff', 'handslot.r']] };
const io = new NodeIO();
for (const [who, arms] of Object.entries(WHO)) {
  const doc = await io.read(`${CH}/Skeleton_${who}.glb`);
  const R = doc.getRoot(), scene = R.listScenes()[0];
  const bone = (n) => R.listNodes().find((x) => x.getName() === n);
  for (const [w, slot] of arms) {
    const src = await io.read(`${AS}/${w}.gltf`);
    const map = mergeDocuments(doc, src);
    const s2 = map.get(src.getRoot().listScenes()[0]);
    const b = bone(slot);
    if (!b) throw new Error('sin ' + slot);
    for (const n of s2.listChildren()) { s2.removeChild(n); b.addChild(n); }
    s2.dispose();
  }
  for (const a of R.listAnimations()) if (!KEEP.has(a.getName())) {
    for (const c of a.listChannels()) c.dispose();
    for (const sm of a.listSamplers()) sm.dispose();
    a.dispose();
  }
  for (const s of R.listScenes()) if (s !== scene) s.dispose();
  await doc.transform(dedup(), prune(), unpartition());
  // (lo que quede sin usar —las entradas de las animaciones quitadas—, fuera)
  for (const ac of R.listAccessors()) if (!ac.listParents().some((p) => p.propertyType !== 'Root')) ac.dispose();
  const pos = R.listAccessors();
  await io.write(`${OUT}/esqueleto_${who.toLowerCase()}.glb`, doc);
  console.log(who, R.listAnimations().map((a) => a.getName()).join(','), R.listNodes().filter((n) => n.getName().startsWith('handslot')).map((n) => n.getName() + ':' + n.listChildren().map((c) => c.getName()).join('+')).join(' '));
}

}

// ---------------------------------------------------------------- el cementerio
{
  const SRC = `${BASE}/KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf`;
// Junta en un solo GLB las piezas del cementerio (KayKit Halloween Bits, CC0): cada pieza, un nodo de primer nivel con su nombre.
const PIECES = ['crypt', 'grave_A', 'grave_A_destroyed', 'grave_B', 'gravestone', 'gravemarker_A', 'gravemarker_B', 'fence', 'fence_broken', 'fence_pillar', 'fence_pillar_broken', 'arch', 'arch_gate', 'lantern_standing', 'post_lantern', 'post_skull', 'pumpkin_orange', 'pumpkin_orange_jackolantern', 'pumpkin_yellow', 'pumpkin_yellow_jackolantern', 'pumpkin_orange_small', 'tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'tree_dead_large_decorated', 'tree_pine_orange_large', 'tree_pine_orange_medium', 'tree_pine_yellow_large', 'tree_pine_yellow_medium', 'shrine', 'shrine_candles', 'coffin', 'coffin_decorated', 'bone_A', 'bone_B', 'ribcage', 'skull', 'skull_candle', 'floor_dirt_grave', 'bench', 'candle_triple', 'plaque_candles'];
const io = new NodeIO(), doc = new Document();
doc.createBuffer();
const scene = doc.createScene('cementerio');
doc.getRoot().setDefaultScene(scene);
for (const p of PIECES) {
  const src = await io.read(`${SRC}/${p}.gltf`);
  const map = mergeDocuments(doc, src), s2 = map.get(src.getRoot().listScenes()[0]);
  const kids = s2.listChildren(), g = doc.createNode(p);
  for (const n of kids) { s2.removeChild(n); g.addChild(n); }
  scene.addChild(g);
  s2.dispose();
}
await doc.transform(dedup(), prune(), unpartition());
for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
await io.write(`${OUT}/cementerio.glb`, doc);
const R = doc.getRoot();
console.log('nodos', scene.listChildren().length, 'mallas', R.listMeshes().length, 'materiales', R.listMaterials().map((m) => m.getName()).join(','), 'texturas', R.listTextures().length);

}
