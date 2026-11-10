// El estilo Cómic (src/style/comic.ts) encaja en el sombreador de Three que trae IWSDK: si una versión nueva de Three
// cambia la línea donde se juntan las luces o donde se coloca cada vértice, esta prueba avisa.
import { describe, expect, it } from 'vitest';
import { ShaderLib } from '@iwsdk/core';
import { comicFragment } from '../../src/style/comic.js';

describe('el sombreado de cómic', () => {
  it('encuentra en el material estándar de Three dónde se juntan las luces', () => {
    const f = comicFragment(ShaderLib.standard.fragmentShader, false, false);
    expect(f).not.toBeNull();
    expect(f).toContain('uniform vec3 uComicShadow;');
    expect(f).toContain('vec3 outgoingLight = cCol * uComicK');
    for (const inc of ['lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'aomap_fragment']) expect(f).not.toContain(`#include <${inc}>`);
  });
  it('los personajes con esqueleto, con su corte suave', () => {
    expect(comicFragment(ShaderLib.standard.fragmentShader, false, true)).toMatch(/^#define COMIC_CHAR|COMIC_CHAR/);
  });
  it('otros sombreadores se quedan como estaban', () => {
    expect(comicFragment(ShaderLib.basic.fragmentShader, false, false)).toBeNull();
  });
  it('los contornos de tinta encuentran dónde colocar cada vértice', () => {
    expect(ShaderLib.basic.vertexShader).toContain('#include <project_vertex>');
  });
});
