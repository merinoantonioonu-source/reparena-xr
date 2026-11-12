// Una tecla atiende una sola pulsación aunque le lleguen dos (la de IWSDK y la de las teclas sólidas: src/ui/press.ts).
import { Object3D } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onPress } from '../../src/ui/press.js';

afterEach(() => vi.restoreAllMocks());

describe('la pulsación de una tecla', () => {
  it('dos pulsaciones seguidas (dedo y rayo, o dedo e IWSDK): cuenta una', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const el = new Object3D() as unknown as Parameters<typeof onPress>[0];
    let n = 0;
    onPress(el, () => n++);
    el.dispatchEvent({ type: 'click' } as never);
    now += 300;
    el.dispatchEvent({ type: 'click' } as never);
    expect(n).toBe(1);
    now += 900; // (otra pulsación, ya pasado el tiempo: cuenta)
    el.dispatchEvent({ type: 'click' } as never);
    expect(n).toBe(2);
  });
  it('cada tecla, por su cuenta', () => {
    const a = new Object3D() as unknown as Parameters<typeof onPress>[0], b = new Object3D() as unknown as Parameters<typeof onPress>[0];
    let n = 0;
    onPress(a, () => n++);
    onPress(b, () => n++);
    a.dispatchEvent({ type: 'click' } as never);
    b.dispatchEvent({ type: 'click' } as never);
    expect(n).toBe(2);
  });
});
