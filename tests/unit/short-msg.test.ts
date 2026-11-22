// Los avisos, cortos (src/ui/short-msg.ts): pedido del usuario, «menos verbosos en todos los ejercicios».
import { describe, expect, it } from 'vitest';
import { shortMsg } from '../../src/ui/short-msg.js';

describe('los avisos, cortos', () => {
  it('los largos que se conocen, en dos a cuatro palabras', () => {
    expect(shortMsg('Apoya bien la otra mano en el suelo')).toBe('Apoya la otra mano');
    expect(shortMsg('¡Un hueco! Salta al llegar al borde')).toBe('¡Hueco! Salta');
    expect(shortMsg('¡Un barranco! Abre los brazos en cruz para planear')).toBe('¡Barranco! Brazos en cruz');
  });
  it('los que llevan un dato (el lado, la pierna…) lo conservan', () => {
    expect(shortMsg('¡Un cangrejo a la derecha! Apártate a la izquierda')).toBe('¡Apártate a la izquierda!');
    expect(shortMsg('¡Cambia de pierna! Ahora, la izquierda delante')).toBe('¡Cambia! Pierna izquierda');
    expect(shortMsg('Ahora con la pierna derecha delante')).toBe('Pierna derecha delante');
    expect(shortMsg('¡Desprendimiento a la izquierda! Apártate a la derecha')).toBe('¡Rocas! Apártate a la derecha');
    expect(shortMsg('Sube un poco más: 20 de 27 cm')).toBe('Sube un poco más');
    expect(shortMsg('¡Una abeja en picado! Agáchate')).toBe('¡En picado! Agáchate');
  });
  it('lo que no se conoce, tal cual; ninguno corto pasa de 30 letras', () => {
    expect(shortMsg('¡Bien!')).toBe('¡Bien!');
    for (const t of ['¡El camino se divide! Paso a la derecha: más difícil y más premios', 'Vuelve andando con las manos hasta la salida', '¡Un demonio a la derecha! Esquiva su bola de fuego con un paso']) expect(shortMsg(t).length).toBeLessThanOrEqual(30);
  });
});
