// La Travesía de plataformas en marcha (src/modes/trek/plat/runner.ts, con moves.ts): recorridos guionizados con un
// simulador de cabeza (plat-sim.ts). Comprueba que:
// - quien hace bien lo que pide cada pieza (agacharse bajo la viga, saltar el tronco, apartarse del barril, saltar el hueco)
//   la pasa, llega al cofre y no choca nunca;
// - quien lo hace mal choca (frena, rompe la racha, apaga el turbo) sin perder vidas;
// - ante el hueco te paras a 1 m, las sentadillas no empujan y estirarse despacio no cruza;
// - las piezas salen a lo lejos (PLAT_SEE) y se quitan al quedar atrás;
// - sin repeticiones te paras;
// - el salto del hueco dura entre 0,5 y 1 s y el mundo baja y sube en medio;
// - el paso a un lado se puede repetir hacia el otro lado (el centro no se pierde).
import { describe, expect, it } from 'vitest';
import { BEHIND, HOP_MAX, HOP_MIN } from '../../src/modes/trek/plat/runner.js';
import { LAND_PAST, PLAT_SEE, STOP_AT } from '../../src/modes/trek/plat/types.js';
import { course, DT, piece, Sim } from './plat-sim.js';

/** Los sucesos que mueven la vida (la Travesía no tiene: chocar no quita vidas). */
const lifeEv = (s: Sim): boolean => s.log.some((e) => /life|lives|vida|hurt/i.test(e.t));

describe('la Travesía de plataformas: lo hace bien', () => {
  it('viga, tronco, barril y hueco: los pasa y llega al cofre sin chocar', () => {
    const s = new Sim();
    const low = piece(1, 'low', 20, 0, { h: 0.25 });
    const log = piece(2, 'log', 45, 0);
    const barrel = piece(3, 'side', 70, 0, { side: 1 });
    const gap = piece(4, 'gap', 100, 0, { len: 3 });
    const chest = piece(5, 'chest', 130, 0);
    s.load(course([low, log, barrel, gap, chest]));
    for (const p of [low, log, barrel, gap]) expect(s.pass(p), `pieza ${p.k}`).toBe(true);
    expect(s.pass(chest)).toBe(true);

    expect(s.of('pass').map((e) => e.p.id)).toEqual([1, 2, 3, 4]);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.of('combo0')).toHaveLength(0);
    expect([low, log, barrel, gap].every((p) => p.ok === true)).toBe(true);
    expect(s.r.passed).toBe(4);
    expect(s.r.hits).toBe(0);
    expect(s.r.atChest(0)).toBe(true);
    expect(s.of('chest')).toHaveLength(1);
    expect(lifeEv(s)).toBe(false);
    // el hueco te paró a 1 m de su borde y te dejó pasado el borde lejano
    expect(s.when(s.ofPiece('halt', gap)[0]).d).toBeCloseTo(gap.at - STOP_AT, 6);
    expect(s.when(s.ofPiece('pass', gap)[0]).d).toBeCloseTo(gap.at + gap.len + LAND_PAST, 6);
    // y el cofre, a su borde menos 1 m, sin pasarlo
    expect(s.r.dist).toBeLessThanOrEqual(chest.at - STOP_AT + 1e-9);
  });

  it('el cofre abierto se esfuma al empezar el tramo siguiente', () => {
    const s = new Sim();
    const chest = piece(1, 'chest', 40, 0);
    s.load(course([chest]));
    expect(s.pass(chest)).toBe(true);
    s.r.startTramo();
    s.r.ev.forEach((e) => s.log.push(e));
    expect(s.r.atChest(0)).toBe(false);
    expect(s.of('vanish')).toHaveLength(1);
  });
});

describe('la Travesía de plataformas: lo hace mal', () => {
  it('no agacharse, no saltar el tronco y no apartarse: choca en cada una, sin perder vidas, y el turbo se apaga', () => {
    const s = new Sim();
    const low = piece(1, 'low', 40, 0, { h: 0.25 });
    const log = piece(2, 'log', 80, 0);
    const barrel = piece(3, 'side', 120, 0, { side: -1 });
    const chest = piece(4, 'chest', 160, 0);
    s.load(course([low, log, barrel, chest]));

    // viga: el turbo (seis sentadillas buenas seguidas) está encendido al llegar
    expect(s.blow(low)).toBe(true);
    const turboOn = s.of('turbo').filter((e) => e.on);
    expect(turboOn.length).toBeGreaterThanOrEqual(1);
    expect(low.ok).toBe(false);
    expect(s.r.v).toBe(0); // la viga te para del todo
    const hitLow = s.ofPiece('hit', low);
    expect(hitLow).toHaveLength(1);
    const iHit = s.log.indexOf(hitLow[0]);
    expect(s.log[iHit + 1].t).toBe('combo0');
    const turboOff = s.of('turbo', iHit).filter((e) => !e.on);
    expect(turboOff).toHaveLength(1); // chocar apaga el turbo
    expect(s.r.tk.turbo).toBe(false);

    // tronco: sin saltar, choca y casi te para
    expect(s.blow(log)).toBe(true);
    expect(log.ok).toBe(false);
    expect(s.ofPiece('hit', log)).toHaveLength(1);
    expect(s.r.v).toBeLessThan(0.7);

    // barril a un lado: quieto en el centro, choca
    expect(s.blow(barrel)).toBe(true);
    expect(barrel.ok).toBe(false);
    expect(s.ofPiece('hit', barrel)).toHaveLength(1);

    expect(s.of('hit')).toHaveLength(3);
    expect(s.of('combo0')).toHaveLength(3);
    expect(s.of('pass')).toHaveLength(0);
    expect(s.r.hits).toBe(3);
    expect(s.r.passed).toBe(0);
    expect(lifeEv(s)).toBe(false);
    // los avisos de lo que se hizo mal salen en naranja
    expect(s.of('say').filter((e) => e.warn).map((e) => e.text)).toEqual(expect.arrayContaining(['¡Agáchate bajo la viga!', '¡Salta el tronco!']));
    // y se puede seguir: el recorrido no se rompe, se llega al cofre
    expect(s.pass(chest)).toBe(true);
    expect(s.r.atChest(0)).toBe(true);
  });

  it('una sentadilla poco honda no vale para una viga muy baja', () => {
    const s = new Sim();
    const low = piece(1, 'low', 30, 0, { h: 0.4 });
    s.load(course([low, piece(2, 'chest', 80, 0)]));
    expect(s.squatsTo(low, 2.5)).toBe(true);
    s.duck(0.2, () => low.judged); // (bajar 20 cm, no 40)
    expect(low.ok).toBe(false);
    expect(s.ofPiece('hit', low)).toHaveLength(1);
  });

  it('un salto sin altura (menos de 6 cm) no salta el tronco', () => {
    const s = new Sim();
    const log = piece(1, 'log', 30, 0);
    s.load(course([log, piece(2, 'chest', 80, 0)]));
    expect(s.squatsTo(log, 0.5)).toBe(true);
    s.jump(0.04);
    expect(s.until(() => log.judged, 72 * 5)).toBe(true);
    expect(log.ok).toBe(false);
  });

  it('apartarse hacia el lado del barril también choca', () => {
    const s = new Sim();
    const barrel = piece(1, 'side', 40, 0, { side: 1 });
    s.load(course([barrel, piece(2, 'chest', 90, 0)]));
    expect(s.squatsTo(barrel, 2.5)).toBe(true);
    s.side(0.4, () => barrel.judged); // (hacia donde está el barril)
    expect(barrel.ok).toBe(false);
    expect(s.ofPiece('hit', barrel)).toHaveLength(1);
  });
});

describe('la Travesía de plataformas: el hueco', () => {
  it('sin hacer nada te quedas parado a 1 m, las sentadillas no empujan y estirarse despacio no cruza', () => {
    const s = new Sim();
    const gap = piece(1, 'gap', 40, 0, { len: 3 });
    s.load(course([gap, piece(2, 'chest', 80, 0)]));
    expect(s.squatsTo(gap, 1.2)).toBe(true);
    expect(s.until(() => s.r.stop === gap, 72 * 20)).toBe(true);
    expect(s.ofPiece('halt', gap)).toHaveLength(1);
    const stopD = s.r.dist;
    expect(stopD).toBeCloseTo(gap.at - STOP_AT, 6);
    const t0 = s.t, say0 = s.log.length;

    // sentadillas ante el hueco: no empujan y recuerdan que hay que saltar
    expect(s.squat(0.3, 1.2)).toBe(false);
    expect(s.squat(0.3, 1.2)).toBe(false);
    const asks = s.of('say', say0).filter((e) => /Salta/.test(e.text) && !e.warn);
    expect(asks.length).toBeGreaterThanOrEqual(2);
    expect(s.r.v).toBe(0);
    expect(s.r.dist).toBeLessThanOrEqual(gap.at - STOP_AT);

    // estirarse despacio de puntillas no es saltar
    s.stretch(0.1, 1.0);
    expect(s.r.hop).toBeNull();
    expect(s.r.stop).toBe(gap);
    expect(s.of('go')).toHaveLength(0);

    // 30 s sin hacer nada: ni un metro más (y el aviso se repite)
    const nag0 = s.log.length;
    s.stand(30);
    expect(s.t - t0).toBeLessThan(40); // (a los 40 s lo rodearías)
    expect(s.r.dist).toBeLessThanOrEqual(gap.at - STOP_AT);
    expect(s.r.stop).toBe(gap);
    expect(gap.judged).toBe(false);
    expect(s.of('say', nag0).filter((e) => /hueco/i.test(e.text)).length).toBeGreaterThanOrEqual(4);
    expect(s.of('pass')).toHaveLength(0);

    // y un salto de verdad sí lo cruza
    s.jump();
    expect(s.until(() => gap.judged, 72 * 5)).toBe(true);
    expect(gap.ok).toBe(true);
  });

  it('el salto: el mundo baja y sube (dip negativo en medio, 0 al acabar) y dura entre 0,5 y 1 s', () => {
    const s = new Sim();
    const gap = piece(1, 'gap', 40, 0, { len: 3 });
    s.load(course([gap, piece(2, 'chest', 80, 0)]));
    expect(s.squatsTo(gap, 1.2)).toBe(true);
    expect(s.until(() => s.r.stop === gap, 72 * 20)).toBe(true);
    s.stand(0.5);
    expect(s.r.dip).toBe(0);

    // el salto de la cabeza, fotograma a fotograma, mirando el mundo
    const n = Math.round(0.3 / DT);
    let min = 0, mid = 0, inAir = 0;
    for (let i = 1; i <= n; i++) {
      s.head.y = s.ref + 0.15 * Math.sin((Math.PI * i) / n);
      s.frame();
    }
    s.head.y = s.ref;
    expect(s.of('go')).toHaveLength(1);
    const go = s.of('go')[0];
    expect(go.dur).toBeGreaterThanOrEqual(HOP_MIN);
    expect(go.dur).toBeLessThanOrEqual(HOP_MAX);
    while (s.r.hop && inAir++ < 72 * 3) {
      min = Math.min(min, s.r.dip);
      if (Math.abs(s.r.hop.t - s.r.hop.dur / 2) < DT) mid = s.r.dip;
      s.frame();
    }
    expect(s.r.hop).toBeNull();
    expect(min).toBeLessThan(-0.1);
    expect(mid).toBeLessThan(-0.1);
    expect(s.r.dip).toBe(0);
    const pass = s.ofPiece('pass', gap)[0];
    const lapse = s.when(pass).t - s.when(go).t;
    expect(lapse).toBeGreaterThanOrEqual(HOP_MIN - 2 * DT);
    expect(lapse).toBeLessThanOrEqual(HOP_MAX + 2 * DT);
    expect(s.r.dist).toBeCloseTo(gap.at + gap.len + LAND_PAST, 6);
  });
});

describe('la Travesía de plataformas: el recorrido a lo lejos', () => {
  it('las piezas salen a menos de PLAT_SEE, salvo las que ya estaban a la vista; se quitan al quedar atrás', () => {
    const s = new Sim();
    const ps = [
      piece(1, 'log', 20, 0),
      piece(2, 'low', 120, 0, { h: 0.25 }),
      piece(3, 'side', 180, 0, { side: -1 }),
      piece(4, 'gap', 240, 0, { len: 3 }),
      piece(5, 'chest', 300, 0),
    ];
    s.load(course(ps));
    // al empezar, solo la que está a la vista
    expect(s.of('show').map((e) => e.p.id)).toEqual([1]);
    expect(s.when(s.of('show')[0]).t).toBe(0);
    for (const p of ps.slice(0, 4)) expect(s.pass(p), `pieza ${p.k}`).toBe(true);
    expect(s.pass(ps[4])).toBe(true);

    for (const p of ps) {
      const shows = s.ofPiece('show', p);
      expect(shows, `show de ${p.k}`).toHaveLength(1);
      if (p.at < PLAT_SEE) continue;
      const d = s.when(shows[0]).d;
      expect(d).toBeGreaterThanOrEqual(p.at - PLAT_SEE - 1e-6);
      expect(d).toBeLessThan(p.at - PLAT_SEE + 0.3);
    }
    // se quitan cuando quedan BEHIND m atrás (el cofre no: aún estás ante él)
    for (const p of ps.slice(0, 4)) {
      const hides = s.ofPiece('hide', p);
      expect(hides, `hide de ${p.k}`).toHaveLength(1);
      const d = s.when(hides[0]).d;
      expect(d).toBeGreaterThan(p.at + p.len + BEHIND);
      expect(d).toBeLessThan(p.at + p.len + BEHIND + 0.5);
    }
    expect(s.ofPiece('hide', ps[4])).toHaveLength(0);
  });
});

describe('la Travesía de plataformas: el impulso', () => {
  it('con sentadillas la velocidad sube; sin ellas baja a 0 y te quedas donde estás', () => {
    const s = new Sim();
    s.load(course([piece(1, 'chest', 500, 0)]));
    expect(s.r.v).toBe(0);
    for (let i = 0; i < 4; i++) expect(s.squat()).toBe(true);
    s.stand(1);
    expect(s.r.v).toBeGreaterThan(1);
    expect(s.r.dist).toBeGreaterThan(5);
    s.stand(10);
    expect(s.r.v).toBe(0);
    const d = s.r.dist;
    s.stand(2);
    expect(s.r.dist).toBe(d);
  });

  it('fuera de la partida (en reposo) las sentadillas no empujan', () => {
    const s = new Sim();
    s.load(course([piece(1, 'chest', 500, 0)]));
    s.env.state = 'rest';
    expect(s.squat()).toBe(false);
    s.stand(2);
    expect(s.r.dist).toBe(0);
  });
});

describe('la Travesía de plataformas: el paso a un lado', () => {
  it('tras volver al centro, un segundo barril del lado contrario también se pasa', () => {
    const s = new Sim();
    const a = piece(1, 'side', 40, 0, { side: 1 });
    const b = piece(2, 'side', 80, 0, { side: -1 });
    const chest = piece(3, 'chest', 120, 0);
    s.load(course([a, b, chest]));
    expect(s.pass(a)).toBe(true); // (a la izquierda)
    expect(a.ok).toBe(true);
    expect(s.head.x).toBe(0);
    expect(s.pass(b)).toBe(true); // (a la derecha)
    expect(b.ok).toBe(true);
    expect(s.pass(chest)).toBe(true);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.of('pass').map((e) => e.p.id)).toEqual([1, 2]);
  });

  it('con un paso corto (menos de 30 cm) no se libra el barril', () => {
    const s = new Sim();
    const a = piece(1, 'side', 40, 0, { side: 1 });
    s.load(course([a, piece(2, 'chest', 90, 0)]));
    expect(s.squatsTo(a, 2.5)).toBe(true);
    s.side(-0.2, () => a.judged);
    expect(a.ok).toBe(false);
  });
});
