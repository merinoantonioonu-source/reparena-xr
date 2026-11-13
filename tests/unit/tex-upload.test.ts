// Los dibujos que cambian se suben antes de pintar el fotograma (src/style/tex-upload.ts): en las gafas, el Three de IWSDK
// los subía después, con la imagen abierta, y el menú desaparecía a trozos al mover un deslizador.
import { describe, expect, it } from 'vitest';
import { CanvasTexture, DataTexture, Scene, Texture } from 'three';
import { texUploadHook, texUploads } from '../../src/style/tex-upload.js';

// (en Node no hay lienzos: uno de mentira basta, el módulo solo mira de qué clase es)
class FakeCanvas {
  width = 4;
  height = 4;
}
(globalThis as Record<string, unknown>).HTMLCanvasElement = FakeCanvas;

describe('las subidas de dibujos, antes de pintar', () => {
  const up: Texture[] = [];
  const props = new Map<Texture, { __version?: number }>();
  const renderer = {
    properties: { get: (t: Texture) => props.get(t) ?? props.set(t, {}).get(t)! },
    initTexture: (t: Texture) => {
      up.push(t);
      renderer.properties.get(t).__version = t.version;
    },
  };
  const scene = new Scene();
  let painted = 0;
  scene.onBeforeRender = () => {
    painted++; // (lo que ya hubiera enganchado, como la precompilación, sigue)
  };
  texUploadHook(renderer as never, scene);
  const frame = (): void => scene.onBeforeRender(renderer as never, scene, null as never, null as never);

  it('sube al empezar el fotograma lo que se ha repintado, una vez, y sigue con lo enganchado antes', () => {
    const t = new CanvasTexture(new FakeCanvas() as never);
    t.needsUpdate = true;
    t.needsUpdate = true;
    up.length = 0;
    const n = texUploads();
    frame();
    expect(up).toEqual([t]);
    expect(texUploads() - n).toBe(1);
    expect(painted).toBe(1);
    frame();
    expect(up).toEqual([t]); // (nada nuevo: no se vuelve a subir)
  });

  it('no sube lo ya subido, lo que se tira antes ni las texturas de datos (los huesos)', () => {
    const a = new CanvasTexture(new FakeCanvas() as never), b = new CanvasTexture(new FakeCanvas() as never);
    const d = new DataTexture(new Uint8Array(4), 1, 1);
    d.needsUpdate = true;
    b.dispose();
    renderer.initTexture(a); // (subido al pintarlo)
    up.length = 0;
    frame();
    expect(up).toEqual([]);
  });
});
