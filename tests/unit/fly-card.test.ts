/** La chuleta del vuelo (src/ui/fly-card.ts): sale volando en la Travesía y en el parapente, con lo de cada forma. */
import { describe, expect, it } from 'vitest';
import { flyCardOf, type FlyCardIn } from '../../src/ui/fly-card.js';

const base: FlyCardIn = { mode: 'trek', exercise: 'pushup', trekFly: true, flyMap: '', flyAlt: 0, trekAuto: false, barPara: '' };

describe('la chuleta del vuelo', () => {
  it('solo volando: la Travesía en plancha volando y el parapente', () => {
    expect(flyCardOf({ ...base, trekFly: false })).toBeNull();
    expect(flyCardOf({ ...base, mode: 'combat' })).toBeNull();
    expect(flyCardOf({ ...base, mode: 'bars', exercise: 'row' })).toBeNull();
  });

  it('cada forma, sus gestos', () => {
    const t = (I: Partial<FlyCardIn>): string => JSON.stringify(flyCardOf({ ...base, ...I }));
    expect(t({})).toContain('Media flexión');
    expect(t({ flyAlt: 2 })).toContain('aletazo');
    expect(t({ flyMap: 'map' })).toContain('subida brusca');
    expect(t({ mode: 'bars', exercise: 'row', barPara: 'madrid' })).toContain('acelerón');
    expect(t({ mode: 'bars', exercise: 'row', barPara: 'sky' })).toContain('corazón');
    for (const I of [{}, { flyMap: 'map' }, { mode: 'bars', exercise: 'row', barPara: 'sky' }]) expect(flyCardOf({ ...base, ...I })!.rows.length).toBeLessThanOrEqual(7);
  });
});
