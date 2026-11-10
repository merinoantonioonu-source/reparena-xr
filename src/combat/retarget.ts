/**
 * Las animaciones de la biblioteca (anims.glb: la Universal Animation Library de Quaternius, CC0) para un monstruo del
 * mismo esqueleto (el diablillo y el puglin del Bestiary): las rotaciones de los huesos que tiene (menos root, que el juego
 * mueve) y el balanceo de la pelvis, a la escala de su altura de cadera. Las pistas de huesos que el monstruo no tiene
 * (meñiques, punta del pie) se quitan: si no, Three.js las aplica al modelo entero y le cambia la orientación. Como en
 * RepArena (src/42_beasts.js: beastRetarget). Sin IWSDK.
 */
import { AnimationClip, type KeyframeTrack } from 'three';

/** clip: la de la biblioteca; ualPelvis y monPelvis: la altura de la pelvis en el esqueleto de la biblioteca y en el del
 * monstruo; has: los nombres de los huesos del monstruo. */
export function retarget(clip: AnimationClip, ualPelvis: number, monPelvis: number, has: Set<string>): AnimationClip {
  const tracks: KeyframeTrack[] = [], k = monPelvis / ualPelvis;
  for (const t of clip.tracks) {
    const [node, prop] = t.name.split('.');
    if (node === 'root' || !has.has(node)) continue;
    if (prop === 'quaternion') tracks.push(t);
    else if (prop === 'position' && node === 'pelvis') {
      const c = t.clone();
      for (let i = 0; i < c.values.length; i++) c.values[i] *= k;
      tracks.push(c);
    }
  }
  return new AnimationClip(clip.name, clip.duration, tracks);
}
