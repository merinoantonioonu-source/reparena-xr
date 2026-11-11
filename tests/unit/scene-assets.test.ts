// Los objetos de escena hechos en código: deterministas (el editor y el juego los evalúan por separado) y con las partes
// que mueve el juego; la compuerta, con lo fijo junto en pocas mallas (una por material).
import { describe, expect, it } from 'vitest';
import type { Mesh, Object3D } from '@iwsdk/core';
import { createGate } from '../../src/scene-assets/gate.scene-asset.js';
import { createArc } from '../../src/scene-assets/arc.scene-asset.js';
import { createComicValley } from '../../src/scene-assets/comic-valley.scene-asset.js';

const meshes = (o: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  o.traverse((c) => {
    if ((c as Mesh).isMesh) out.push(c as Mesh);
  });
  return out;
};

describe('la compuerta', () => {
  it('lleva las partes que mueve el juego', () => {
    const g = createGate();
    for (const n of ['door-left', 'door-right', 'beacon-spin', 'beacon-body']) expect(g.getObjectByName(n), n).toBeTruthy();
    let beams = 0;
    g.traverse((o) => {
      if (o.name === 'beacon-beam') beams++;
    });
    expect(beams).toBe(2);
  });
  it('lo fijo va junto: pocas mallas que pintar', () => {
    const n = meshes(createGate()).length;
    expect(n).toBeLessThanOrEqual(16);
  });
  it('es igual cada vez (determinista)', () => {
    const a = meshes(createGate()).map((m) => m.geometry.attributes.position.count);
    const b = meshes(createGate()).map((m) => m.geometry.attributes.position.count);
    expect(a).toEqual(b);
  });
});

describe('el valle de cómic', () => {
  it('sale igual cada vez (el azar de RepArena con su semilla)', () => {
    const p = (o: Object3D) => Array.from((o.getObjectByName('valley-land') as Mesh).geometry.attributes.position.array.slice(0, 30));
    expect(p(createComicValley())).toEqual(p(createComicValley()));
  });
});

describe('los arcos', () => {
  it('el arco lleva la barra, la cortina y los rayitos que mueve el juego', () => {
    const a = createArc(1.4, 2.55, 0.2, false, 1.2);
    expect(a.bar.position.y).toBe(1.4);
    expect(a.bar.rotation.z).toBe(0.2);
    expect(a.lines).toHaveLength(2);
    expect(a.ends).toHaveLength(2);
    expect(a.saws).toHaveLength(0);
    expect(a.curtain.position.y).toBeGreaterThan(1.4);
  });
  it('la valla baja lleva tres sierras y la cortina hasta el suelo', () => {
    const a = createArc(0.14, 2.55, 0, true);
    expect(a.saws).toHaveLength(3);
    expect(a.curtain.position.y).toBeLessThan(0.14);
  });
  it('es igual cada vez (determinista)', () => {
    const n = (o: Object3D) => meshes(o).map((m) => m.geometry.attributes.position.count);
    expect(n(createArc(1.1, 2.55, 0.3).grp)).toEqual(n(createArc(1.1, 2.55, 0.3).grp));
  });
});
