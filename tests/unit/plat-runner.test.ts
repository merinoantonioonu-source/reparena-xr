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
import { BEHIND, BOUNCE_LIFT, CHEST_PTS, CRAWL_V, FRUIT_E, HIT_KEEP, HOP_MAX, HOP_MIN, JUMP_LIFT, STOMP_PTS, SUPER_K, TREASURE_PTS } from '../../src/modes/trek/plat/runner.js';
import { glideU, BURPEE_GAP_S, FOE_V, SPIT_FAR, SPIT_NEAR, FOE_WAKE, FOE_WALK, LAND_PAST, PLAT_GEMS, PLAT_GHOST, PLAT_SEE, STOP_AT } from '../../src/modes/trek/plat/types.js';
import { course, DT, piece as mk, Sim } from './plat-sim.js';
import type { Piece } from '../../src/modes/trek/plat/types.js';

/** Las piezas; los cangrejos de las pruebas del paso a un lado, sin escupir (el escupitajo tiene sus pruebas, al final). */
const piece = (...a: Parameters<typeof mk>): Piece => {
  const p = mk(...a);
  if (p.k === 'side') p.spat = true;
  return p;
};

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
    // el hueco no te paró (se salta en marcha) y te dejó pasado el borde lejano
    expect(s.ofPiece('halt', gap)).toHaveLength(0);
    expect(s.when(s.ofPiece('pass', gap)[0]).d).toBeGreaterThanOrEqual(gap.at + gap.len + LAND_PAST - 1e-6);
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
    expect(s.r.v).toBeGreaterThan(0.5); // la viga te frena, pero sigues
    const hitLow = s.ofPiece('hit', low);
    expect(hitLow).toHaveLength(1);
    const iHit = s.log.indexOf(hitLow[0]);
    expect(s.log[iHit + 1].t).toBe('combo0');
    const turboOff = s.of('turbo', iHit).filter((e) => !e.on);
    expect(turboOff).toHaveLength(1); // chocar apaga el turbo
    expect(s.r.tk.turbo).toBe(false);

    // tronco: sin saltar, choca y frena (sin pararte)
    expect(s.blow(log)).toBe(true);
    expect(log.ok).toBe(false);
    expect(s.ofPiece('hit', log)).toHaveLength(1);
    expect(s.r.v).toBeGreaterThan(0);

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

/** Fotogramas hasta que acabe el cruce del hueco: lo que avanza cada uno (m) y lo más que baja el mundo (m). */
function cross(s: Sim): { steps: number[]; minDip: number } {
  const steps: number[] = [];
  let minDip = 0, n = 0;
  while (s.r.hop && n++ < 72 * 5) {
    const d = s.r.dist;
    s.frame();
    steps.push(s.r.dist - d);
    minDip = Math.min(minDip, s.r.dip);
  }
  return { steps, minDip };
}

describe('la Travesía de plataformas: el hueco (se salta en marcha)', () => {
  it('sin saltar no te paras: tropiezas al cruzarlo, frenas a la mitad, se rompe la racha y sigues', () => {
    const s = new Sim();
    const gap = piece(1, 'gap', 40, 0, { len: 1.2 });
    s.load(course([gap, piece(2, 'chest', 100, 0)]));
    expect(s.squatsTo(gap, 3)).toBe(true);
    let v0 = s.r.v, last = s.r.dist, n = 0;
    while (!s.r.hop && n++ < 72 * 10) {
      v0 = s.r.v;
      s.frame();
      expect(s.r.dist).toBeGreaterThan(last); // (nunca se para)
      last = s.r.dist;
    }
    expect(s.r.hop?.won).toBe(false);
    expect(s.r.hop!.v1).toBeCloseTo(v0 * HIT_KEEP, 1);
    const { steps, minDip } = cross(s);
    expect(steps.every((d) => d > 0)).toBe(true);
    expect(minDip).toBe(0); // (tropezar no eleva)
    expect(s.r.dist).toBeCloseTo(gap.at + gap.len + LAND_PAST, 6);
    expect(s.r.v).toBeCloseTo(v0 * HIT_KEEP, 1);
    expect(gap.ok).toBe(false);
    expect(s.of('halt')).toHaveLength(0);
    expect(s.ofPiece('hit', gap)).toHaveLength(1);
    expect(s.of('combo0')).toHaveLength(1);
    expect(s.of('say').filter((e) => e.warn).map((e) => e.text)).toContain('¡Salta el hueco!');
    expect(s.of('pass')).toHaveLength(0);
    // y avisó antes de llegar
    expect(s.of('say').some((e) => /hueco/i.test(e.text) && !e.warn)).toBe(true);
  });

  it('saltar al llegar al borde: el mundo te lleva al otro lado con tu velocidad (inercia), bajando y subiendo bajo los pies', () => {
    const s = new Sim();
    const gap = piece(1, 'gap', 40, 0, { len: 1.6 });
    s.load(course([gap, piece(2, 'chest', 100, 0)]));
    expect(s.squatsTo(gap, 1.0)).toBe(true);
    const v0 = s.r.v;
    expect(v0).toBeGreaterThan(1);
    // el salto de la cabeza, fotograma a fotograma, hasta despegar
    const n = Math.round(0.3 / DT);
    for (let i = 1; i <= n && !s.r.hop; i++) {
      s.head.y = s.ref + 0.15 * Math.sin((Math.PI * i) / n);
      s.frame();
    }
    s.head.y = s.ref;
    expect(s.r.hop?.won).toBe(true);
    const go = s.ofPiece('go', gap)[0];
    expect(go.dur).toBeGreaterThanOrEqual(HOP_MIN);
    expect(go.dur).toBeLessThanOrEqual(HOP_MAX);
    const vIn = s.r.hop!.v1;
    expect(vIn).toBeCloseTo(v0, 0);
    const { steps, minDip } = cross(s);
    expect(s.r.hop).toBeNull();
    // a velocidad fija (la tuya): todos los fotogramas avanzan lo mismo, sin frenar en el aire
    // (el último fotograma, a medias: acaba el salto)
    const full = steps.slice(0, -1);
    expect(full[0]).toBeGreaterThanOrEqual(vIn * DT - 1e-6);
    for (const d of full) expect(d).toBeCloseTo(full[0], 6);
    // el mundo bajó mucho más que lo que sube la cabeza (se nota el salto) y volvió a su sitio
    expect(minDip).toBeLessThan(-0.8 * JUMP_LIFT);
    expect(s.r.dip).toBe(0);
    expect(gap.ok).toBe(true);
    expect(s.r.dist).toBeGreaterThanOrEqual(gap.at + gap.len + LAND_PAST - 1e-6);
    // al aterrizar sigues con la velocidad que traías
    expect(s.r.v).toBeCloseTo(vIn, 6);
    s.frame();
    expect(s.r.v).toBeGreaterThan(vIn - 0.05);
    expect(s.of('halt')).toHaveLength(0);
    expect(s.of('hit')).toHaveLength(0);
  });

  it('saltar demasiado pronto no cruza el hueco: se nota el salto, pero al llegar al borde tropiezas', () => {
    const s = new Sim();
    const gap = piece(1, 'gap', 40, 0, { len: 1.2 });
    s.load(course([gap, piece(2, 'chest', 100, 0)]));
    expect(s.squatsTo(gap, 7)).toBe(true);
    let minDip = 0;
    const n = Math.round(0.3 / DT);
    for (let i = 1; i <= n; i++) {
      s.head.y = s.ref + 0.15 * Math.sin((Math.PI * i) / n);
      s.frame();
      minDip = Math.min(minDip, s.r.dip);
    }
    s.head.y = s.ref;
    expect(s.r.hop).toBeNull();
    for (let i = 0; i < 72 && s.r.airT >= 0; i++) {
      s.frame();
      minDip = Math.min(minDip, s.r.dip);
    }
    expect(minDip).toBeLessThan(-0.3);
    expect(s.until(() => gap.judged, 72 * 10)).toBe(true);
    expect(gap.ok).toBe(false);
  });

  it('ponerse de puntillas despacio ante el hueco no es saltar', () => {
    const s = new Sim();
    const gap = piece(1, 'gap', 40, 0, { len: 1.2 });
    s.load(course([gap, piece(2, 'chest', 100, 0)]));
    expect(s.squatsTo(gap, 1.5)).toBe(true);
    s.stretch(0.1, 1.0);
    expect(s.until(() => gap.judged, 72 * 10)).toBe(true);
    expect(gap.ok).toBe(false);
    expect(s.of('pass')).toHaveLength(0);
  });

  it('saltar el tronco también se nota (el mundo baja y sube) y no te frena', () => {
    const s = new Sim();
    const log = piece(1, 'log', 40, 0);
    s.load(course([log, piece(2, 'chest', 100, 0)]));
    expect(s.squatsTo(log, 0.5)).toBe(true);
    const v0 = s.r.v;
    let minDip = 0;
    const n = Math.round(0.3 / DT);
    for (let i = 1; i <= n; i++) {
      s.head.y = s.ref + 0.15 * Math.sin((Math.PI * i) / n);
      s.frame();
      minDip = Math.min(minDip, s.r.dip);
    }
    s.head.y = s.ref;
    expect(s.until(() => log.judged, 72 * 2)).toBe(true);
    expect(log.ok).toBe(true);
    expect(minDip).toBeLessThan(-0.3);
    expect(s.r.v).toBeGreaterThan(v0 - 0.4);
    expect(s.of('hit')).toHaveLength(0);
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

/** Un salto de la cabeza fotograma a fotograma; devuelve lo más que bajó el mundo mientras. */
function hopHead(s: Sim): number {
  let minDip = 0;
  const n = Math.round(0.3 / DT);
  for (let i = 1; i <= n; i++) {
    s.head.y = s.ref + 0.15 * Math.sin((Math.PI * i) / n);
    s.frame();
    minDip = Math.min(minDip, s.r.dip);
  }
  s.head.y = s.ref;
  return minDip;
}

/** Frames con la cabeza quieta hasta que te pares ante `p`; devuelve lo que más frenó en un fotograma (m/s). */

/** Una sentadilla honda deprisa (baja `d` m en 0,4 s y sube en 0,3 s) y, sin pararse, un salto: el supersalto. */
function deepJump(s: Sim, d = 0.32): number {
  const n1 = Math.round(0.4 / DT), n2 = Math.round(0.3 / DT);
  for (let i = 1; i <= n1; i++) {
    s.head.y = s.ref - d * Math.sin((Math.PI / 2) * (i / n1));
    s.frame();
  }
  for (let i = 1; i <= n2; i++) {
    s.head.y = s.ref - d * Math.cos((Math.PI / 2) * (i / n2));
    s.frame();
  }
  return hopHead(s);
}

/** Echarse en plancha y seguir así (sin sentadillas) hasta que el túnel `p` quede atrás; devuelve las velocidades. */
function crawlThrough(s: Sim, p: { at: number; len: number; judged: boolean }): number[] {
  s.plank(0.5, 0.8);
  const vs: number[] = [];
  for (let i = 0; i < 72 * 30 && !p.judged; i++) {
    s.frame();
    vs.push(s.r.v);
  }
  return vs;
}

describe('la Travesía de plataformas: la plataforma alta (supersalto)', () => {
  it('sentadilla honda y salto al llegar a su borde: subes (el mundo baja toda su altura en el aire) sin frenar', () => {
    const s = new Sim();
    const st = piece(1, 'step', 40, 1, { h: 1.2, len: 6 });
    s.load(course([st, piece(2, 'chest', 120, 1)]));
    // (la sentadilla honda y el salto duran ~0,8 s: se empiezan a lo que se recorre en ese tiempo, más 1 m)
    expect(s.squatsTo(st, 8)).toBe(true);
    expect(s.until(() => s.room(st) < 0.8 * s.r.v + 1, 72 * 10)).toBe(true);
    const v0 = s.r.v;
    let minDip = deepJump(s);
    // (en el aire, el salto o, si despegaste antes del borde, el cruce que te lleva encima)
    for (let i = 0; i < 72 && (s.r.airT >= 0 || s.r.hop); i++) {
      s.frame();
      minDip = Math.min(minDip, s.r.dip);
    }
    expect(st.ok).toBe(true);
    expect(minDip).toBeLessThan(-1.2);
    expect(s.r.lev).toBeCloseTo(1.2, 6);
    expect(s.r.dip).toBeCloseTo(-1.2, 6);
    expect(s.r.v).toBeGreaterThan(v0 - 0.6);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.of('cheer').some((e) => /Supersalto/.test(e.text))).toBe(true);
    // al acabarla bajas suave (sin saltos de más de 3 cm por fotograma) hasta el suelo
    expect(s.walk(() => st.at + st.len - 0.5 - s.r.dist, 0)).toBe(true);
    let worst = 0, last = s.r.dip;
    for (let i = 0; i < 72 * 3 && (s.r.lev > 0 || i < 10); i++) {
      if (s.r.v < 0.3) s.squat();
      else s.frame();
      worst = Math.max(worst, Math.abs(s.r.dip - last));
      last = s.r.dip;
    }
    expect(s.r.lev).toBe(0);
    expect(worst).toBeLessThan(0.03);
  });

  it('el supersalto hecho antes del borde (cerca) ya te sube: el mundo te lleva en el aire hasta encima, sin subir sola después', () => {
    for (const z of [3.2, 2.0, 1.2]) {
      const s = new Sim();
      const st = piece(1, 'step', 40, 1, { h: 1.1, len: 6 });
      s.load(course([st, piece(2, 'chest', 120, 1)]));
      expect(s.squatsTo(st, 9)).toBe(true);
      // (la sentadilla honda y el salto duran ~0,7 s: se empiezan para despegar a unos z m del borde)
      expect(s.until(() => s.room(st) < z + 0.7 * s.r.v, 72 * 10)).toBe(true);
      const v0 = s.r.v;
      deepJump(s);
      expect(st.judged, `a ${z} m`).toBe(true);
      expect(st.ok, `a ${z} m`).toBe(true);
      // en el aire, el mundo te lleva hasta encima de la plataforma: al aterrizar ya estás arriba, pasado su borde
      for (let i = 0; i < 72 * 2 && (s.r.hop || s.r.airT >= 0); i++) s.frame();
      expect(s.r.dist, `a ${z} m`).toBeGreaterThan(st.at);
      expect(s.r.lev, `a ${z} m`).toBeCloseTo(1.1, 6);
      expect(s.of('hit'), `a ${z} m`).toHaveLength(0);
      expect(s.of('cheer').filter((e) => /Supersalto/.test(e.text)), `a ${z} m`).toHaveLength(1);
      expect(s.r.v).toBeGreaterThan(v0 - 0.6);
    }
  });

  it('un salto normal antes del borde es un salto sin más: al llegar, a trompicones', () => {
    const s = new Sim();
    const st = piece(1, 'step', 40, 1, { h: 1.0, len: 5 });
    s.load(course([st, piece(2, 'chest', 120, 1)]));
    expect(s.squatsTo(st, 9)).toBe(true);
    expect(s.until(() => s.room(st) < 3, 72 * 10)).toBe(true);
    s.r.moves.deepT = 9;
    hopHead(s);
    expect(st.judged).toBe(false);
    expect(s.until(() => st.judged, 72 * 10)).toBe(true);
    expect(st.ok).toBe(false);
  });

  it('un salto sin sentadilla honda no basta: subes a trompicones (frenas y se rompe la racha)', () => {
    const s = new Sim();
    const st = piece(1, 'step', 40, 1, { h: 1.0, len: 5 });
    s.load(course([st, piece(2, 'chest', 120, 1)]));
    expect(s.squatsTo(st, 1.0)).toBe(true);
    s.stand(0.1);
    s.r.moves.deepT = 9; // (la última sentadilla de la marcha ya queda lejos)
    const v0 = s.r.v;
    hopHead(s);
    expect(st.judged).toBe(true);
    expect(st.ok).toBe(false);
    expect(s.r.v).toBeLessThan(v0 - 0.4); // (frenas; luego vuelve a acelerar si empujas)
    expect(s.ofPiece('hit', st)).toHaveLength(1);
    s.stand(1.2);
    expect(s.r.lev).toBeCloseTo(1.0, 6);
  });

  it('sin saltar, también a trompicones; sin pararte', () => {
    const s = new Sim();
    const st = piece(1, 'step', 40, 1, { h: 0.9, len: 5 });
    s.load(course([st, piece(2, 'chest', 120, 1)]));
    expect(s.squatsTo(st, 3)).toBe(true);
    while (!st.judged) s.frame();
    expect(st.ok).toBe(false);
    expect(s.r.v).toBeGreaterThan(0);
  });
});

describe('la Travesía de plataformas: el túnel (en plancha, con la inercia)', () => {
  it('echado antes de llegar, la velocidad no se gasta y pasas por debajo sin sentadillas; las sentadillas echado no empujan', () => {
    const s = new Sim();
    const tn = piece(1, 'crawl', 50, 2, { len: 5 });
    s.load(course([tn, piece(2, 'chest', 150, 2)]));
    expect(s.squatsTo(tn, 9)).toBe(true);
    expect(s.of('say').some((e) => /Túnel/.test(e.text))).toBe(true); // (avisa con tiempo)
    const v0 = s.r.v;
    const vs = crawlThrough(s, tn);
    expect(tn.ok).toBe(true);
    expect(Math.min(...vs)).toBeGreaterThanOrEqual(Math.min(v0, CRAWL_V) - 0.05);
    expect(s.r.v).toBeGreaterThan(v0 * 0.9);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.of('halt')).toHaveLength(0);
    expect(s.r.rep(false)).toBe(false); // (echado, no empujas)
    expect(s.of('say').some((e) => e.text === '¡De pie!')).toBe(true);
    s.getUp();
    expect(s.r.moves.plank).toBe(false);
  });

  it('despacio, cerca y dentro del túnel te lleva como poco a CRAWL_V', () => {
    const s = new Sim();
    const tn = piece(1, 'crawl', 30, 2, { len: 4 });
    s.load(course([tn, piece(2, 'chest', 150, 2)]));
    expect(s.squatsTo(tn, 6)).toBe(true);
    s.r.tk.v = 0.3; // (casi parado)
    s.r.tk.push = 0;
    crawlThrough(s, tn);
    expect(tn.judged).toBe(true);
    expect(tn.ok).toBe(true);
  });

  it('de pie bajo el techo, chocas una vez (frenas a la mitad, se rompe la racha) y sigues', () => {
    const s = new Sim();
    const tn = piece(1, 'crawl', 40, 2, { len: 4 });
    s.load(course([tn, piece(2, 'chest', 150, 2)]));
    expect(s.squatsTo(tn, 1)).toBe(true);
    for (let i = 0; i < 72 * 20 && !tn.judged; i++) {
      if (s.r.v < 0.3) s.squat();
      else s.frame();
    }
    expect(tn.ok).toBe(false);
    expect(s.ofPiece('hit', tn)).toHaveLength(1);
    expect(s.of('say').filter((e) => e.warn).map((e) => e.text)).toContain('¡Cabeza abajo en el túnel!');
    expect(s.r.dist).toBeGreaterThan(tn.at + tn.len);
  });
});

describe('la Travesía de plataformas: el burpee (túnel y, enseguida, su plataforma)', () => {
  it('en plancha por el túnel, de pie y un salto normal a la plataforma: ¡BURPEE!', () => {
    const s = new Sim();
    const tn = piece(1, 'crawl', 50, 2, { len: 4 });
    const st = piece(2, 'step', 0, 2, { h: 0.8, len: 5 });
    st.burpee = true;
    st.at = tn.at + tn.len + BURPEE_GAP_S * 4;
    s.load(course([tn, st, piece(3, 'chest', 200, 2)]));
    expect(s.squatsTo(tn, 9)).toBe(true);
    crawlThrough(s, tn);
    expect(tn.ok).toBe(true);
    s.getUp(0.8);
    expect(s.until(() => s.room(st) < 1.2, 72 * 10) || s.squatsTo(st, 1.2)).toBe(true);
    s.r.moves.deepT = 9; // (sin sentadilla honda: en el burpee basta un salto)
    hopHead(s);
    expect(st.ok).toBe(true);
    expect(s.of('cheer').some((e) => e.text === '¡BURPEE!')).toBe(true);
    s.stand(1);
    expect(s.r.lev).toBeCloseTo(0.8, 6);
  });
});

describe('la Travesía de plataformas: las frutas', () => {
  it('se cogen llevando la cabeza a su lado; si no, pasan sin más; cuatro llenan la energía: supervelocidad', () => {
    const s = new Sim();
    const fr = [1, 2, 3, 4, 5].map((i) => piece(i, 'fruit', 30 + 25 * i, 1, { side: i % 2 ? 1 : -1 }));
    s.load(course([...fr, piece(9, 'chest', 400, 1)]));
    // la primera, sin moverse: pasa de largo, sin choque ni energía
    expect(s.squatsTo(fr[0], 0.5)).toBe(true);
    expect(s.until(() => fr[0].judged, 72 * 5)).toBe(true);
    expect(fr[0].ok).toBe(false);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.r.energy).toBe(0);
    // las otras cuatro, apartando la cabeza a su lado
    for (const f of fr.slice(1)) {
      expect(s.squatsTo(f, 2.5)).toBe(true);
      s.side(f.side * 0.35, () => f.judged);
      expect(f.ok, `fruta ${f.id}`).toBe(true);
    }
    expect(s.of('pass')).toHaveLength(4);
    expect(s.r.superT).toBeGreaterThan(0);
    expect(s.r.energy).toBe(0);
    expect(s.of('cheer').some((e) => e.text === '¡SUPERVELOCIDAD!')).toBe(true);
    s.frame();
    expect(s.r.v).toBeGreaterThanOrEqual(s.r.vmax * SUPER_K - 1e-6);
  });

  it('la especial llena la energía de golpe', () => {
    const s = new Sim();
    const f = piece(1, 'fruit', 40, 1, { side: -1 });
    f.special = true;
    s.load(course([f, piece(2, 'chest', 200, 1)]));
    expect(s.squatsTo(f, 2.5)).toBe(true);
    s.side(-0.35, () => f.judged);
    expect(f.ok).toBe(true);
    expect(s.r.superT).toBeGreaterThan(0);
    expect(FRUIT_E).toBeLessThan(1);
  });
});

describe('la Travesía de plataformas: los enemigos (PR D)', () => {
  it('la seta llega andando hacia ti desde FOE_WAKE m, hasta su sitio (FOE_WALK m), y allí espera', () => {
    const s = new Sim();
    const foe = piece(1, 'foe', 60, 1);
    s.load(course([foe, piece(2, 'chest', 140, 1)]));
    expect(foe.walk).toBe(FOE_WALK);
    expect(s.squatsTo(foe, FOE_WAKE + 3)).toBe(true);
    expect(foe.woke).toBe(false);
    expect(s.squatsTo(foe, FOE_WAKE - 2)).toBe(true);
    expect(foe.woke).toBe(true);
    expect(s.ofPiece('wake', foe)).toHaveLength(1);
    // anda a su paso: en 1 s, FOE_V m (o hasta su sitio)
    const w0 = foe.walk;
    s.stand(1);
    expect(foe.walk).toBeCloseTo(Math.max(0, w0 - FOE_V), 1);
    s.stand(FOE_WALK / FOE_V + 1);
    expect(foe.walk).toBe(0);
  });

  it('saltar encima de la seta: se chafa (puntos y rebote) y sigues sin frenar', () => {
    const s = new Sim();
    const foe = piece(1, 'foe', 50, 1);
    s.load(course([foe, piece(2, 'chest', 140, 1)]));
    expect(s.pass(foe)).toBe(true);
    expect(foe.ok).toBe(true);
    expect(s.ofPiece('pass', foe)).toHaveLength(1);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.of('score').some((e) => e.n === STOMP_PTS)).toBe(true);
    // el rebote: el mundo vuelve a bajar bajo los pies, más que un salto
    let low = 0;
    for (let i = 0; i < 72; i++) {
      s.frame();
      low = Math.min(low, s.r.dip);
    }
    expect(low).toBeLessThan(-JUMP_LIFT);
    expect(low).toBeGreaterThanOrEqual(-BOUNCE_LIFT - 1e-9);
  });

  it('sin saltar, la seta te muerde: frenas a la mitad y se rompe la racha, sin perder vidas', () => {
    const s = new Sim();
    const foe = piece(1, 'foe', 50, 1);
    s.load(course([foe, piece(2, 'chest', 140, 1)]));
    expect(s.blow(foe)).toBe(true);
    expect(foe.ok).toBe(false);
    expect(s.ofPiece('hit', foe)).toHaveLength(1);
    expect(s.of('combo0')).toHaveLength(1);
    expect(s.of('say').some((e) => e.warn && /seta/.test(e.text))).toBe(true);
    expect(lifeEv(s)).toBe(false);
  });

  it('el cangrejo, a un lado: apartarse al otro lo esquiva; quedarse en el centro, te muerde', () => {
    for (const lado of [-1, 1] as const) {
      const s = new Sim();
      const crab = piece(1, 'side', 50, 2, { side: lado });
      s.load(course([crab, piece(2, 'chest', 140, 2)]));
      expect(s.of('say').length).toBeGreaterThanOrEqual(0);
      expect(s.pass(crab)).toBe(true);
      expect(crab.ok, `lado ${lado}`).toBe(true);
      expect(s.of('say').some((e) => /cangrejo/.test(e.text))).toBe(true);
      const m = new Sim();
      const c2 = piece(1, 'side', 50, 2, { side: lado });
      m.load(course([c2, piece(2, 'chest', 140, 2)]));
      expect(m.blow(c2)).toBe(true);
      expect(c2.ok).toBe(false);
      expect(m.of('say').some((e) => e.warn && /mordido/.test(e.text))).toBe(true);
    }
  });
});

describe('la Travesía de plataformas: el cofre, la medalla y el fantasma (PR D)', () => {
  it('el cofre dice qué hay dentro al empezar a verse y, al llegar, da una llave y una gema (con tres llaves, el tesoro)', () => {
    const s = new Sim();
    s.env.mem.set(PLAT_GEMS, 4);
    const c1 = piece(1, 'chest', 40, 0);
    s.load(course([c1]));
    expect(s.pass(c1)).toBe(true);
    expect(s.of('say').some((e) => /dentro, una llave \(1 de 3/.test(e.text))).toBe(true);
    expect(s.of('store').at(-1)).toMatchObject({ key: PLAT_GEMS, val: 5 });
    expect(s.of('trophy').at(-1)?.title).toBe('¡COFRE ABIERTO!');
    expect(s.of('score').some((e) => e.n === CHEST_PTS)).toBe(true);
    expect(s.r.keys).toBe(1);
    // dos cofres más: el tercero abre el tesoro
    s.r.keys = 2;
    s.r.startTramo();
    const c2 = piece(2, 'chest', 90, 1);
    s.r.addCourse(course([c2]));
    expect(s.pass(c2)).toBe(true);
    expect(s.of('trophy').at(-1)?.title).toBe('¡TESORO DEL TRAMO!');
    expect(s.of('score').some((e) => e.n === TREASURE_PTS)).toBe(true);
    expect(s.r.keys).toBe(0);
  });

  it('la medalla, por lo superado sin chocar (las frutas no cuentan); el fantasma se guarda si llegas más lejos', () => {
    const s = new Sim();
    const ps = [piece(1, 'log', 30, 0), piece(2, 'low', 60, 0, { h: 0.25 }), piece(3, 'chest', 100, 0)];
    s.load(course(ps));
    for (const p of ps) expect(s.pass(p)).toBe(true);
    const e = s.r.end(1000);
    expect(e.medal?.[0]).toBe('oro');
    expect(e.ghost).not.toBeNull();
    expect(e.ghost!.dist).toBe(Math.round(s.r.dist));
    expect(e.ghost!.tl.length).toBeGreaterThan(2);
    expect(e.farther).toBe(false); // (no había fantasma: no es «más lejos que nunca»)
    // con ese fantasma guardado, la ronda siguiente compara contigo
    s.env.mem.set(PLAT_GHOST, e.ghost);
    const t = new Sim();
    t.env.mem.set(PLAT_GHOST, e.ghost);
    t.load(course([piece(1, 'chest', 100, 0)]));
    expect(t.r.best?.dist).toBe(e.ghost!.dist);
    t.stand(5);
    const g = t.r.ghostDiff();
    expect(g).not.toBeNull();
    expect(g!).toBeLessThan(0); // (parado, vas por detrás de tu mejor ronda)
    const e2 = t.r.end(10);
    expect(e2.ghost).toBeNull();
    expect(e2.farther).toBe(false);
  });
});

describe('la Travesía de plataformas: el escupitajo del cangrejo', () => {
  /** Un cangrejo que sí escupe. */
  const crab = (at: number, side: -1 | 1 = 1): Piece => mk(1, 'side', at, 2, { side });

  it('escupe una vez, desde lejos, hacia tu cabeza; quieto, te da: frenas y se rompe la racha, sin vidas', () => {
    const s = new Sim();
    // (ya a tiro: escupe enseguida, contigo de pie y quieto)
    const c = crab(9);
    s.load(course([c, mk(2, 'chest', 160, 2)]));
    expect(s.until(() => s.of('spit').length > 0, 72 * 3)).toBe(true);
    const sp = s.of('spit')[0]!;
    // desde lejos (entre SPIT_NEAR y SPIT_FAR) y rápido (antes de un segundo y medio)
    const z = c.at + c.walk - s.when(sp).d + s.head.z;
    expect(z).toBeGreaterThanOrEqual(SPIT_NEAR - 0.2);
    expect(z).toBeLessThanOrEqual(SPIT_FAR + 0.2);
    expect(sp.wind + sp.dur).toBeLessThan(1.6);
    s.stand(sp.wind + sp.dur + 0.1);
    const r = s.of('spat');
    expect(r).toHaveLength(1);
    expect(r[0]!.ok).toBe(false);
    expect(s.of('combo0').length).toBeGreaterThanOrEqual(1);
    expect(s.of('say').some((e) => e.warn && /escupido/.test(e.text))).toBe(true);
    expect(lifeEv(s)).toBe(false);
    // y no vuelve a escupir
    s.stand(3);
    expect(s.of('spit')).toHaveLength(1);
  });

  it('apartando la cabeza (a un lado o agachándote) al verlo venir, lo esquivas', () => {
    for (const how of ['lado', 'abajo'] as const) {
      const s = new Sim();
      const c = crab(9, -1);
      s.load(course([c, mk(2, 'chest', 160, 2)]));
      expect(s.until(() => s.of('spit').length > 0, 72 * 3)).toBe(true);
      const sp = s.of('spit')[0]!;
      if (how === 'lado') s.side(0.3, sp.wind + sp.dur + 0.05, 0.3);
      else s.duck(0.3, sp.wind + sp.dur + 0.05, 0.3);
      expect(s.of('spat')[0]?.ok, how).toBe(true);
      expect(s.of('cheer').some((e) => /Escupitajo esquivado/.test(e.text)), how).toBe(true);
    }
  });

  it('nunca escupe de cerca ni si otro reto está cerca de ti', () => {
    // (cerca: el cangrejo ya está a menos de SPIT_NEAR cuando echa a andar)
    const s = new Sim();
    const c = crab(SPIT_NEAR - FOE_WALK - 2);
    s.load(course([c, mk(2, 'chest', 100, 2)]));
    s.stand(4);
    expect(s.of('spit')).toHaveLength(0);
    // (una viga justo delante cuando le tocaría: espera a que pase y, si ya está cerca, no escupe)
    const t = new Sim();
    const low = mk(1, 'low', SPIT_FAR - 1, 2, { h: 0.25 }), c2 = mk(2, 'side', SPIT_FAR + 4, 2, { side: 1 });
    t.load(course([low, c2, mk(3, 'chest', 140, 2)]));
    for (let i = 0; i < 72 * 30 && !low.judged; i++) {
      if (t.of('spit').length) break;
      t.frame();
    }
    expect(t.of('spit')).toHaveLength(0);
  });
});

describe('la Travesía de plataformas: los premios (barril sorpresa, doradas y frutas en arco)', () => {
  it('saltando debajo del barril sorpresa, se rompe de un cabezazo y da fruta; sin saltar, pasa por encima sin más', () => {
    const s = new Sim();
    const b = mk(1, 'box', 40, 0);
    s.load(course([b, mk(2, 'chest', 120, 0)]));
    expect(s.squatsTo(b, 0.5)).toBe(true);
    s.jump();
    expect(s.until(() => b.judged, 72 * 5)).toBe(true);
    expect(b.ok).toBe(true);
    expect(s.r.boxes).toBe(1);
    expect(s.r.energy).toBeGreaterThan(0);
    const t = new Sim();
    const b2 = mk(1, 'box', 40, 0);
    t.load(course([b2, mk(2, 'chest', 120, 0)]));
    expect(t.blow(b2)).toBe(true);
    expect(b2.ok).toBe(false);
    expect(t.of('hit')).toHaveLength(0); // (es un premio: no pasa nada)
    expect(t.of('combo0')).toHaveLength(0);
  });

  it('la fruta dorada se coge saltando cuando pasa; y la de encima de una plataforma, subiendo de un supersalto', () => {
    const s = new Sim();
    const g = mk(1, 'fruit', 40, 1);
    g.gold = true;
    s.load(course([g, mk(2, 'chest', 120, 1)]));
    expect(s.squatsTo(g, 0.5)).toBe(true);
    s.jump();
    expect(s.until(() => g.judged, 72 * 5)).toBe(true);
    expect(g.ok).toBe(true);
    expect(s.of('gold')[0]).toMatchObject({ n: 1, of: 1 });
    // sin saltar, se escapa (sin choque)
    const t = new Sim();
    const g2 = mk(1, 'fruit', 40, 1);
    g2.gold = true;
    t.load(course([g2, mk(2, 'chest', 120, 1)]));
    expect(t.blow(g2)).toBe(true);
    expect(g2.ok).toBe(false);
    expect(t.of('gold')).toHaveLength(0);
    expect(t.of('hit')).toHaveLength(0);
  });

  it('las frutas en arco sobre el hueco: saltándolo te las comes todas; tropezando, ninguna', () => {
    const s = new Sim();
    const gap = mk(1, 'gap', 40, 0, { len: 1.2, n: 4 });
    s.load(course([gap, mk(2, 'chest', 120, 0)]));
    expect(s.pass(gap)).toBe(true);
    expect(gap.ok).toBe(true);
    expect(gap.got).toBe(4);
    expect(s.of('pick').map((e) => e.i)).toEqual([0, 1, 2, 3]);
    const t = new Sim();
    const g2 = mk(1, 'gap', 40, 0, { len: 1.2, n: 4 });
    t.load(course([g2, mk(2, 'chest', 120, 0)]));
    expect(t.blow(g2)).toBe(true);
    expect(g2.got).toBe(0);
  });
});

describe('la Travesía de plataformas: planear sobre el barranco con los brazos en cruz', () => {
  /** Las muñecas: en cruz (a cada lado, a la altura de los hombros) o abajo (junto al cuerpo). */
  const arms = (s: Sim, open: boolean, lostOne = false): void => {
    const H = s.env.head, y = open ? H.y - 0.25 : H.y - 0.7, x = open ? 0.7 : 0.18;
    Object.assign(s.env.hands.l, { ok: !lostOne, x: H.x - x, y, z: H.z });
    Object.assign(s.env.hands.r, { ok: true, x: H.x + x, y, z: H.z });
  };

  it('con los brazos en cruz al llegar al borde, planeas: lo cruzas sin frenar, el mundo baja y, con la cabeza ladeada, coges sus frutas', () => {
    const s = new Sim();
    const g = mk(1, 'glide', 40, 1, { len: 8, n: 5 });
    s.load(course([g, mk(2, 'chest', 140, 1)]));
    expect(s.squatsTo(g, 6)).toBe(true);
    arms(s, true);
    const v0 = s.r.v;
    let low = 0;
    for (let i = 0; i < 72 * 12 && !g.judged; i++) {
      // (la cabeza, hacia la fruta que viene)
      const next = Math.min(g.n - 1, g.got);
      s.head.x = glideU(g, next) * 0.9;
      arms(s, true);
      s.frame();
      low = Math.min(low, s.r.dip);
    }
    expect(g.ok).toBe(true);
    expect(low).toBeLessThan(-0.5); // (el vuelo: el mundo baja)
    expect(s.r.v).toBeGreaterThan(Math.min(v0, 2) * 0.8 - 0.1);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.of('pick').filter((e) => e.p === g).length).toBeGreaterThanOrEqual(4);
  });

  it('con una mano perdida pero la otra en cruz, también planeas', () => {
    const s = new Sim();
    const g = mk(1, 'glide', 40, 1, { len: 7, n: 4 });
    s.load(course([g, mk(2, 'chest', 140, 1)]));
    expect(s.squatsTo(g, 6)).toBe(true);
    arms(s, true, true);
    expect(s.until(() => g.judged, 72 * 12)).toBe(true);
    expect(g.ok).toBe(true);
  });

  it('sin abrir los brazos, a trompicones; y bajándolos en pleno vuelo, aterrizas frenando (nunca se cae)', () => {
    const s = new Sim();
    const g = mk(1, 'glide', 40, 1, { len: 8, n: 4 });
    s.load(course([g, mk(2, 'chest', 140, 1)]));
    expect(s.blow(g)).toBe(true);
    expect(g.ok).toBe(false);
    expect(s.of('say').some((e) => e.warn && /brazos en cruz/.test(e.text))).toBe(true);
    expect(s.until(() => !s.r.hop, 72 * 12)).toBe(true); // (te lleva al otro lado: nunca se cae)
    expect(s.r.dist).toBeGreaterThan(g.at + g.len);
    const t = new Sim();
    const g2 = mk(1, 'glide', 40, 1, { len: 9, n: 4 });
    t.load(course([g2, mk(2, 'chest', 140, 1)]));
    expect(t.squatsTo(g2, 6)).toBe(true);
    arms(t, true);
    expect(t.until(() => !!t.r.hop, 72 * 6)).toBe(true);
    arms(t, false);
    expect(t.until(() => g2.judged, 72 * 12)).toBe(true);
    expect(g2.ok).toBe(false);
    expect(t.ofPiece('hit', g2)).toHaveLength(1);
  });
});

describe('la Travesía de plataformas: el trampolín y las bifurcaciones', () => {
  it('pisando el trampolín con una sentadilla honda, te lanza lejos y alto comiéndote las frutas del vuelo; sin ella, lo pisas sin más', () => {
    const s = new Sim();
    const sp = mk(1, 'spring', 40, 0, { len: 9, n: 5 });
    s.load(course([sp, mk(2, 'chest', 140, 0)]));
    expect(s.squatsTo(sp, 1.5)).toBe(true);
    s.squat(0.32, 0.8); // (la sentadilla honda, justo antes de pisarlo)
    let low = 0;
    for (let i = 0; i < 72 * 6 && !sp.judged; i++) {
      s.frame();
      low = Math.min(low, s.r.dip);
    }
    expect(sp.ok).toBe(true);
    expect(low).toBeLessThan(-0.9);
    expect(s.r.dist).toBeGreaterThan(sp.at + sp.len - 0.5);
    expect(sp.got).toBe(5);
    const t = new Sim();
    const sp2 = mk(1, 'spring', 40, 0, { len: 9, n: 5 });
    t.load(course([sp2, mk(2, 'chest', 140, 0)]));
    expect(t.squatsTo(sp2, 1.5)).toBe(true);
    t.r.moves.deepT = 9;
    expect(t.until(() => sp2.judged, 72 * 6)).toBe(true);
    expect(sp2.ok).toBe(false);
    expect(t.of('hit')).toHaveLength(0);
  });

  it('en la bifurcación, la cabeza apartada a la derecha elige la rama difícil (sus piezas se juzgan; las de la otra, no) y el mundo se desplaza para que quede bajo tus pies', () => {
    for (const lado of [1, -1] as const) {
      const s = new Sim();
      const f = mk(1, 'fork', 30, 1, { len: 24 });
      const log = mk(2, 'log', 36, 1);
      log.lane = 1;
      const fr = mk(3, 'fruit', 37, 1, { side: 1 });
      fr.lane = -1;
      s.load(course([f, log, fr, mk(4, 'chest', 140, 1)]));
      expect(s.squatsTo(f, 3)).toBe(true);
      s.side(lado * 0.3, () => f.judged, 0.3);
      expect(f.judged).toBe(true);
      expect(s.r.lane).toBe(lado > 0 ? 1 : -1);
      s.head.x = 0;
      expect(s.walk(() => f.at + f.len / 2 - s.r.dist, 0)).toBe(true);
      expect(Math.abs(s.r.uShift)).toBeCloseTo(1.5, 1);
      expect(Math.sign(s.r.uShift)).toBe(lado);
      expect(s.walk(() => f.at + f.len + 3 - s.r.dist, 0)).toBe(true);
      // la pieza de la otra rama pasó de largo sin juzgarse (ni choque ni premio)
      const otra = lado > 0 ? fr : log;
      expect(otra.ok).toBeNull();
      expect(s.r.uShift).toBe(0);
      expect(s.r.lane).toBe(0);
    }
  });
});
