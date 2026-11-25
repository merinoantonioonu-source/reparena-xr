// El lugar donde empezar a volar sobre el mapa: coordenadas o un enlace de Google Maps pegados en la página.
import { describe, expect, it } from 'vitest';
import { isShortLink, parsePlace, placeText } from '../../src/modes/trek/map/map-place';

describe('el lugar del mapa', () => {
  it('coordenadas: con punto, a la española y con letras', () => {
    expect(parsePlace('40.4169, -3.7035')).toEqual({ lat: 40.4169, lon: -3.7035 });
    expect(parsePlace('  -33.8568 151.2153 ')).toEqual({ lat: -33.8568, lon: 151.2153 });
    expect(parsePlace('40,4169, -3,7035')).toEqual({ lat: 40.4169, lon: -3.7035 });
    expect(parsePlace('40,4169 -3,7035')).toEqual({ lat: 40.4169, lon: -3.7035 });
    expect(parsePlace('27.9881° N, 86.9250° E')).toEqual({ lat: 27.9881, lon: 86.925 });
    expect(parsePlace('40,4169° N 3,7035° O')).toEqual({ lat: 40.4169, lon: -3.7035 });
  });
  it('grados, minutos y segundos (como los da Google Maps)', () => {
    const p = parsePlace('40°25\'00.8"N 3°42\'12.6"W')!;
    expect(p.lat).toBeCloseTo(40.41689, 4);
    expect(p.lon).toBeCloseTo(-3.7035, 4);
    const s = parsePlace('33°51′24.5″S 151°12′55.1″E')!;
    expect(s.lat).toBeCloseTo(-33.8568, 3);
    expect(s.lon).toBeCloseTo(151.2153, 3);
  });
  it('un enlace largo de Google Maps: el punto marcado antes que el centro del mapa', () => {
    expect(parsePlace('https://www.google.com/maps/place/Torre+Eiffel/@48.8583701,2.2922926,17z/data=!3m1!4b1!4m6!3m5!1s0x47e6!8m2!3d48.8583701!4d2.2944813!16zL20')).toEqual({ lat: 48.8583701, lon: 2.2944813 });
    expect(parsePlace('https://www.google.com/maps/@36.1069652,-112.1129972,14z')).toEqual({ lat: 36.1069652, lon: -112.1129972 });
    expect(parsePlace('https://www.google.com/maps?q=-13.1631,-72.5450')).toEqual({ lat: -13.1631, lon: -72.545 });
    expect(parsePlace('https://maps.google.com/?ll=35.3606%2C138.7274')).toEqual({ lat: 35.3606, lon: 138.7274 });
  });
  it('lo que no se entiende, null (y el enlace corto se reconoce para explicarlo)', () => {
    expect(parsePlace('')).toBeNull();
    expect(parsePlace('Madrid')).toBeNull();
    expect(parsePlace('95.0, 10.0')).toBeNull(); // (no hay latitud 95)
    expect(parsePlace('10.0, 200.0')).toBeNull();
    expect(parsePlace('https://maps.app.goo.gl/AbCdEf123')).toBeNull();
    expect(isShortLink('https://maps.app.goo.gl/AbCdEf123')).toBe(true);
    expect(isShortLink('40.4, -3.7')).toBe(false);
  });
  it('se enseñan a la española', () => {
    expect(placeText(40.4169, -3.7035)).toBe('40,4169° N · 3,7035° O');
    expect(placeText(-33.8568, 151.2153)).toBe('33,8568° S · 151,2153° E');
  });
});
