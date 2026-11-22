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
import { PORTAL_AT } from '../../src/modes/trek/plat/worlds.js';
import { BOB_T, FIRE_AT, QUAKE_AT, BOSS_HP, BOSS_LEN, BOSS_STEP, BOSS_THROWS, BOSS_WIND, glideU, BURPEE_GAP_S, FOE_V, SPIT_FAR, SPIT_NEAR, FOE_WAKE, FOE_WALK, LAND_PAST, PLAT_GEMS, PLAT_GHOST, PLAT_SEE, STOP_AT } from '../../src/modes/trek/plat/types.js';
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

describe('la Travesía de plataformas: el jefe del mundo', () => {
  /** Hace lo que pide cada lanzamiento (o nada, con `mal`) hasta que el jefe se marea. */
  const dodge = (s: Sim, mal = false): void => {
    const F = s.r.fight!;
    for (let i = 0; i < 72 * 30 && F.phase === 'throw'; i++) {
      const sh = F.shot;
      if (!sh || F.t < BOSS_WIND - 0.35 || mal) {
        s.frame();
        continue;
      }
      if (sh === 'high') s.duck(0.3, () => !F.shot, 0.2);
      else if (sh === 'low') {
        s.jump(0.15, 0.15);
        s.until(() => !F.shot, 72 * 2);
      } else s.side(0.4, () => !F.shot, 0.2);
    }
  };

  it('te para delante; esquivando lo que lanza (alta, baja, al cuerpo) se marea y tres supersaltos encima lo derrotan; luego sigues al cofre', () => {
    const s = new Sim();
    const b = mk(1, 'boss', 40, 3, { len: BOSS_LEN, n: 0 });
    const c = mk(2, 'chest', 40 + BOSS_LEN + 10, 3);
    s.load(course([b, c]));
    expect(s.squatsTo(b, STOP_AT + 0.05)).toBe(true);
    expect(s.until(() => s.r.stop === b, 72 * 10)).toBe(true);
    expect(s.r.dist).toBeCloseTo(b.at - STOP_AT, 1);
    expect(s.of('boss').map((e) => e.act)).toEqual(['start']);
    const tipos = new Set<string>();
    for (let golpe = 1; golpe <= BOSS_HP; golpe++) {
      const n0 = s.log.length, d0 = s.r.dist;
      dodge(s);
      for (const e of s.of('bthrow', n0)) tipos.add(e.shot);
      expect(s.of('bdodge', n0).every((e) => e.ok)).toBe(true);
      expect(s.of('bdodge', n0)).toHaveLength(BOSS_THROWS);
      expect(s.r.fight!.phase).toBe('dizzy');
      // las sentadillas no le hacen nada ni te mueven (parado ante él)
      s.squat(0.32, 0.8);
      s.jump(0.15, 0.15);
      let low = 0;
      for (let i = 0; i < 72 * 3 && s.r.hop; i++) {
        s.frame();
        low = Math.min(low, s.r.dip);
      }
      expect(low).toBeLessThan(-1.2);
      expect(b.got).toBe(golpe);
      expect(s.r.dist).toBeCloseTo(d0 + BOSS_STEP, 1);
    }
    expect(b.judged).toBe(true);
    expect(b.ok).toBe(true);
    expect(s.r.bosses).toBe(1);
    expect(s.of('boss').map((e) => e.act)).toEqual(['start', 'dizzy', 'hurt', 'dizzy', 'hurt', 'dizzy', 'die']);
    expect(s.of('trophy').some((e) => e.title === '¡JEFE DERROTADO!')).toBe(true);
    expect(tipos.size).toBeGreaterThan(1);
    expect(s.of('hit')).toHaveLength(0);
    expect(s.r.hits).toBe(0);
    // el jefe salta hacia atrás tras cada golpe: siempre delante de ti, nunca detrás
    for (const e of s.of('boss')) if (e.to !== undefined) expect(e.to!).toBeGreaterThan(e.from!);
    expect(s.pass(c)).toBe(true);
    expect(lifeEv(s)).toBe(false);
  });

  it('si no esquivas, te da (se rompe la racha, sin vidas); mareado, un salto sin sentadilla honda no vale y, si no saltas, se recupera', () => {
    const s = new Sim();
    const b = mk(1, 'boss', 40, 3, { len: BOSS_LEN, n: 1 });
    s.load(course([b, mk(2, 'chest', 40 + BOSS_LEN + 10, 3)]));
    expect(s.squatsTo(b, STOP_AT + 0.05)).toBe(true);
    expect(s.until(() => s.r.stop === b, 72 * 10)).toBe(true);
    dodge(s, true);
    expect(s.of('bdodge').filter((e) => !e.ok)).toHaveLength(BOSS_THROWS);
    expect(s.r.hits).toBe(BOSS_THROWS);
    expect(s.of('combo0').length).toBeGreaterThanOrEqual(BOSS_THROWS);
    s.r.moves.deepT = 9;
    s.jump(0.15, 0.15);
    expect(s.r.hop).toBeNull();
    expect(b.got).toBe(0);
    expect(s.until(() => s.r.fight!.phase === 'throw', 72 * 10)).toBe(true);
    expect(s.r.fight!.misses).toBe(1);
    expect(lifeEv(s)).toBe(false);
  });
});

describe('la Travesía de plataformas: los enemigos nuevos (picado, calavera, cíclope y demonio)', () => {
  it('la abeja en picado: agachado cuando llega, la esquivas; de pie, te pica (frenas y se rompe la racha)', () => {
    for (const bien of [true, false]) {
      const s = new Sim();
      const d = mk(1, 'dive', 40, 1, { h: 0.25 });
      s.load(course([d, mk(2, 'chest', 140, 1)]));
      expect(s.squatsTo(d, 2.5)).toBe(true);
      if (bien) s.duck(0.3, () => d.judged);
      else s.until(() => d.judged, 72 * 10);
      expect(d.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
      expect(lifeEv(s)).toBe(false);
    }
  });

  it('la calavera que bota: saltándola cuando pasa, bien; sin saltar, te da', () => {
    for (const bien of [true, false]) {
      const s = new Sim();
      const k = mk(1, 'skull', 40, 1);
      s.load(course([k, mk(2, 'chest', 140, 1)]));
      expect(s.squatsTo(k, 0.5)).toBe(true);
      if (bien) s.jump();
      expect(s.until(() => k.judged, 72 * 10)).toBe(true);
      expect(k.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
    }
  });

  it('el cíclope golpea el suelo al acercarte y su onda corre hacia ti: saltándola cuando llega, bien; sin saltar, te da', () => {
    for (const bien of [true, false]) {
      const s = new Sim();
      const q = mk(1, 'quake', 40, 2, { side: 1 });
      s.load(course([q, mk(2, 'chest', 140, 2)]));
      expect(s.squatsTo(q, QUAKE_AT + 0.5)).toBe(true);
      expect(s.until(() => q.spat, 72 * 10)).toBe(true);
      expect(s.of('slam')).toHaveLength(1);
      // (la onda, a tus pies: lo que le falta)
      const zw = (): number => q.at - Math.max(0, q.fx) - s.r.dist;
      expect(s.until(() => zw() < 0.6, 72 * 10)).toBe(true);
      if (bien) s.jump();
      expect(s.until(() => q.judged, 72 * 10)).toBe(true);
      expect(q.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
    }
  });

  it('el demonio lanza su bola de fuego en arco al acercarte: con un paso a un lado la esquivas; quieto, te quemas', () => {
    for (const bien of [true, false]) {
      const s = new Sim();
      const f = mk(1, 'fire', 40, 2, { side: -1 });
      s.load(course([f, mk(2, 'chest', 140, 2)]));
      expect(s.squatsTo(f, FIRE_AT + 0.5)).toBe(true);
      expect(s.until(() => f.spat, 72 * 10)).toBe(true);
      expect(s.of('spit').filter((e) => e.p === f)).toHaveLength(1);
      if (bien) s.side(0.4, () => f.judged);
      else s.until(() => f.judged, 72 * 10);
      expect(f.ok).toBe(bien);
      expect(s.of('spat').filter((e) => e.p === f).map((e) => e.ok)).toEqual([bien]);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
      expect(lifeEv(s)).toBe(false);
    }
  });
});

describe('la Travesía de plataformas: los mundos (el risco)', () => {
  it('cada «Tramos por mundo» tramos, otro mundo: su jefe al final, sus retos y el portal tras el cofre', () => {
    const s = new Sim({ trekWorld: 2 });
    for (let i = 0; i < 4; i++) s.r.addTramo(i, 160);
    const P = s.r.pieces, of = (t: number) => P.filter((p) => p.tramo === t);
    // el jefe, en el último tramo de cada mundo: el bosque, el Demonio verde (1); el risco, el Yeti (0)
    expect(of(0).some((p) => p.k === 'boss')).toBe(false);
    expect(of(1).find((p) => p.k === 'boss')?.n).toBe(1);
    expect(of(3).find((p) => p.k === 'boss')?.n).toBe(0);
    // en el risco, sus retos y nada de bifurcaciones; en el bosque, ninguno de los suyos
    expect([...of(2), ...of(3)].some((p) => p.k === 'ledge' || p.k === 'gust' || p.k === 'rockfall')).toBe(true);
    expect([...of(2), ...of(3)].some((p) => p.k === 'fork')).toBe(false);
    expect([...of(0), ...of(1)].some((p) => p.k === 'ledge' || p.k === 'gust' || p.k === 'rockfall')).toBe(false);
    // el mundo cambia al cruzar el portal (tras el cofre del tramo 1), no antes
    const E = s.r.ends;
    expect(s.r.worldAt(E[1] - 1)).toBe(0);
    expect(s.r.worldAt(E[1] + PORTAL_AT + 0.5)).toBe(1);
    expect(s.r.worldAt(E[0] + PORTAL_AT + 0.5)).toBe(0); // (tras el cofre del tramo 0 no hay portal: sigue el bosque)
    for (const p of P) if (p.at < E[1] + 1) p.judged = true; // (lo de antes, ya pasado)
    s.r.tk.dist = E[1] + PORTAL_AT + 1;
    s.frame();
    expect(s.of('world').map((e) => e.w)).toEqual([1]);
    expect(s.r.world).toBe(1);
  });

  it('la cornisa: pegado a la pared (a la izquierda) se pasa; por el medio, frenas y se rompe la racha', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const L = mk(1, 'ledge', 40, 1, { len: 6, side: 1 });
      s.load(course([L, mk(2, 'chest', 140, 1)]));
      expect(s.squatsTo(L, 2.5)).toBe(true);
      // (sentadillas sin parar, para cruzarla entera; bien, con la cabeza a la izquierda)
      if (bien) s.head.x = -0.35;
      expect(s.walk(() => (L.judged ? 0 : 99), 1, 72 * 30)).toBe(true);
      s.head.x = 0;
      expect(L.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
      expect(lifeEv(s)).toBe(false);
    }
  });

  it('la racha de viento: inclinado hacia donde sopla se aguanta; sin inclinarse, te empuja', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const G = mk(1, 'gust', 40, 1, { len: 6, side: -1 });
      s.load(course([G, mk(2, 'chest', 140, 1)]));
      expect(s.squatsTo(G, 2.5)).toBe(true);
      if (bien) s.head.x = -0.35;
      expect(s.walk(() => (G.judged ? 0 : 99), 1, 72 * 30)).toBe(true);
      s.head.x = 0;
      expect(G.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
    }
  });

  it('el desprendimiento: las rocas empiezan a caer antes de llegar; apartado al otro lado, no te dan', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const R = mk(1, 'rockfall', 40, 1, { side: 1 });
      s.load(course([R, mk(2, 'chest', 140, 1)]));
      expect(s.squatsTo(R, 2.5)).toBe(true);
      expect(s.of('rockfall')).toHaveLength(1);
      if (bien) s.side(-0.4, () => R.judged);
      else s.until(() => R.judged, 72 * 20);
      expect(R.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
    }
  });
});

describe('la Travesía de plataformas: las islas en el cielo', () => {
  /** El reloj de la marcha con el islote de `p` a ras (`fase` 0) o arriba del todo (`fase` 0,25 de su vuelta). */
  const timeFor = (p: Piece, fase: number): number => {
    const t0 = (-p.id * 1.7 * BOB_T) / (2 * Math.PI);
    return t0 + fase * BOB_T + 10 * BOB_T;
  };

  it('el tercer mundo: islotes que suben y bajan y que se hunden, el dragón y el Alien alto; sin túneles ni cangrejos', () => {
    const s = new Sim({ trekWorld: 1 });
    for (let i = 0; i < 4; i++) s.r.addTramo(i, 200);
    const P = s.r.pieces.filter((p) => p.tramo === 2);
    expect(P.find((p) => p.k === 'boss')?.n).toBe(2);
    expect(P.some((p) => p.k === 'bob')).toBe(true);
    expect(P.some((p) => p.k === 'sink')).toBe(true);
    expect(P.some((p) => p.k === 'crawl' || p.k === 'side' || p.k === 'quake' || p.k === 'fork')).toBe(false);
    for (const p of P) if (p.k === 'fire') expect(p.n).toBe(1); // (el dragón)
    // fuera de las islas, ni sus retos ni el dragón
    for (const p of s.r.pieces) if (p.tramo !== 2) {
      expect(p.k === 'bob' || p.k === 'sink').toBe(false);
      if (p.k === 'fire') expect(p.n).toBe(0);
    }
  });

  it('el islote que sube y baja: saltando cuando está a ras, vale; cuando está arriba, chocas (sin vidas)', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const B = mk(1, 'bob', 40, 2, { len: 1.2 });
      s.load(course([B, mk(2, 'chest', 140, 2)]));
      expect(s.squatsTo(B, 1.2)).toBe(true);
      s.r.time = timeFor(B, bien ? 0 : 0.25);
      s.jump();
      expect(s.until(() => B.judged, 72 * 5)).toBe(true);
      expect(B.ok).toBe(bien);
      expect(s.of('settle')).toHaveLength(1);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
      expect(lifeEv(s)).toBe(false);
    }
  });

  it('el islote que se hunde: cruzándolo sin parar, bien; parado en él, se hunde (frenas y se rompe la racha)', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const K = mk(1, 'sink', 40, 2, { len: 7 });
      s.load(course([K, mk(2, 'chest', 140, 2)]));
      if (bien) expect(s.walk(() => (K.judged ? 0 : 99), 1, 72 * 30)).toBe(true);
      else {
        expect(s.squatsTo(K, -1)).toBe(true);
        s.stand(4);
      }
      expect(s.of('sinking')).toHaveLength(1);
      if (bien) expect(K.ok).toBe(true);
      else expect(K.bad).toBe(true);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
      expect(lifeEv(s)).toBe(false);
    }
  });
});

describe('la Travesía de plataformas: la costa pirata', () => {
  it('el cuarto mundo: cañonazos y piratas (tiburones y esqueletos), y el Capitán; sin setas, demonios ni túneles', () => {
    const s = new Sim({ trekWorld: 1 });
    for (let i = 0; i < 5; i++) s.r.addTramo(i, 220);
    const P = s.r.pieces.filter((p) => p.tramo === 3);
    expect(P.find((p) => p.k === 'boss')?.n).toBe(3);
    expect(P.some((p) => p.k === 'cannon')).toBe(true);
    expect(P.some((p) => ['foe', 'fire', 'quake', 'crawl', 'fork'].includes(p.k))).toBe(false);
    for (const p of P) if (p.k === 'dive') expect(p.n).toBeGreaterThanOrEqual(2); // (el tiburón pirata)
    // fuera de la costa, ni cañonazos ni piratas; y pasada la costa, vuelta al bosque (sin cañonazos)
    for (const p of s.r.pieces) if (p.tramo !== 3) {
      expect(p.k).not.toBe('cannon');
      if (p.k === 'dive') expect(p.n).toBeLessThan(2);
      if (p.k === 'side') expect(p.n).toBe(0);
    }
  });

  it('la bala alta del cañonazo: el barco dispara antes de llegar; agachado, pasa por encima', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const C = mk(1, 'cannon', 40, 3, { side: 1, n: 0, h: 0.3 });
      s.load(course([C, mk(2, 'chest', 140, 3)]));
      expect(s.squatsTo(C, 2.5)).toBe(true);
      expect(s.of('cannon')).toHaveLength(1);
      if (bien) s.duck(C.h + 0.03, () => C.judged);
      else s.until(() => C.judged, 72 * 20);
      expect(C.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
      expect(lifeEv(s)).toBe(false);
    }
  });

  it('la bala baja del cañonazo: pasa a ras del muelle; saltándola, bien', () => {
    for (const bien of [true, false]) {
      const s = new Sim({ trekWorld: 1 });
      const C = mk(1, 'cannon', 40, 3, { side: -1, n: 1, h: 0 });
      s.load(course([C, mk(2, 'chest', 140, 3)]));
      expect(s.squatsTo(C, 0.5)).toBe(true);
      if (bien) s.jump();
      expect(s.until(() => C.judged, 72 * 5)).toBe(true);
      expect(C.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
    }
  });
});

describe('la Travesía de plataformas en plancha (con flexiones)', () => {
  /** En plancha: la cabeza, a 45 cm del suelo con los brazos estirados (la calibración). */
  const TOP = 0.45;
  const prone = (auto: boolean): Sim => {
    const s = new Sim({ trekAuto: auto ? 1 : 0, pushDepth: 13 });
    s.env.ex = 'pushup';
    s.env.calibRef = TOP;
    s.head.y = TOP;
    s.r.calibrate(TOP, 0, 0);
    return s;
  };
  /** Una flexión: baja 11 cm en 0,5 s y sube (explosiva, de golpe en 0,12 s; si no, en 0,5 s); al subir, la repetición. */
  const push = (s: Sim, explosive = false): void => {
    for (let t = 0; t < 0.5; t += DT) {
      s.head.y = TOP - 0.11 * Math.sin((Math.PI / 2) * (t / 0.5));
      s.frame();
    }
    const up = explosive ? 0.12 : 0.5;
    for (let t = 0; t < up; t += DT) {
      s.head.y = TOP - 0.11 * (1 - t / up);
      s.frame();
    }
    s.head.y = TOP;
    s.frame();
    s.r.rep(false);
  };
  /** Flexiones hasta que la pieza `p` esté a `z` m. */
  const pushTo = (s: Sim, p: Piece, z: number): boolean => {
    for (let i = 0; i < 200 && s.room(p) > z; i++) {
      if (s.room(p) > z + 3) push(s);
      else s.frame();
    }
    return s.room(p) <= z;
  };

  it('la dura: sin flexiones no avanzas; cada flexión te empuja', () => {
    const s = prone(false);
    s.load(course([mk(1, 'chest', 200, 0)]));
    s.until(() => false, 72 * 3);
    expect(s.r.dist).toBeLessThan(0.1);
    for (let i = 0; i < 6; i++) push(s);
    expect(s.r.dist).toBeGreaterThan(3);
  });

  it('la suave: el recorrido viene solo, sin flexiones (y las flexiones no empujan)', () => {
    const s = prone(true);
    s.load(course([mk(1, 'chest', 200, 0)]));
    s.until(() => false, 72 * 6);
    expect(s.r.dist).toBeGreaterThan(4);
    expect(s.r.rep(false)).toBe(false);
  });

  it('agacharse es quedarse abajo en la flexión: la viga pasa por encima; arriba, chocas', () => {
    for (const bien of [true, false]) {
      const s = prone(true);
      const L = mk(1, 'low', 30, 0, { h: 0.3 });
      s.load(course([L, mk(2, 'chest', 200, 0)]));
      expect(s.until(() => s.room(L) < 1.5, 72 * 60)).toBe(true);
      if (bien) s.head.y = TOP - 0.1;
      expect(s.until(() => L.judged, 72 * 10)).toBe(true);
      s.head.y = TOP;
      expect(L.ok).toBe(bien);
      expect(s.of('hit')).toHaveLength(bien ? 0 : 1);
    }
  });

  it('saltar es una flexión explosiva: el tronco se salta; una flexión normal no salta', () => {
    for (const bien of [true, false]) {
      const s = prone(true);
      const T = mk(1, 'log', 30, 0);
      s.load(course([T, mk(2, 'chest', 200, 0)]));
      expect(s.until(() => s.room(T) < 1.2, 72 * 60)).toBe(true);
      push(s, bien);
      expect(s.until(() => T.judged, 72 * 10)).toBe(true);
      expect(T.ok).toBe(bien);
    }
  });

  it('escorarse a un lado esquiva al cangrejo (unos centímetros bastan en plancha)', () => {
    const s = prone(true);
    const C = mk(1, 'side', 30, 0, { side: 1 });
    s.load(course([C, mk(2, 'chest', 200, 0)]));
    expect(s.until(() => s.room(C) < 2, 72 * 60)).toBe(true);
    s.head.x = -0.12;
    expect(s.until(() => C.judged, 72 * 10)).toBe(true);
    expect(C.ok).toBe(true);
  });

  it('dos flexiones explosivas seguidas suben a la plataforma alta (una sola, no)', () => {
    for (const two of [true, false]) {
      const s = prone(true);
      const P = mk(1, 'step', 30, 1, { h: 0.6, len: 6 });
      s.load(course([P, mk(2, 'chest', 200, 1)]));
      expect(s.until(() => s.room(P) < 3.2, 72 * 60)).toBe(true);
      if (two) push(s, true);
      push(s, true);
      s.until(() => P.judged, 72 * 10);
      expect(P.ok).toBe(two);
    }
  });

  it('el túnel se pasa aguantando abajo todo su largo', () => {
    for (const bien of [true, false]) {
      const s = prone(true);
      const T = mk(1, 'crawl', 30, 2, { len: 4 });
      s.load(course([T, mk(2, 'chest', 200, 2)]));
      expect(s.until(() => s.room(T) < 1, 72 * 60)).toBe(true);
      if (bien) s.head.y = TOP - 0.1;
      expect(s.until(() => T.judged, 72 * 20)).toBe(true);
      s.head.y = TOP;
      expect(T.ok).toBe(bien);
    }
  });

  it('el peso adelante da un acelerón (y otro, solo pasado un rato)', () => {
    const s = prone(false);
    s.load(course([mk(1, 'chest', 200, 0)]));
    for (let i = 0; i < 3; i++) push(s);
    s.head.z = -0.12;
    s.frame();
    expect(s.r.dashT).toBeGreaterThan(0);
    s.until(() => s.r.dashT === 0, 72 * 3);
    expect(s.r.v).toBeGreaterThan(0);
    s.head.z = 0;
    s.frame();
    s.head.z = -0.12;
    s.frame();
    expect(s.r.dashT).toBe(0); // (aún no: hay que esperar)
  });

  it('en plancha, lo que pasa por encima de la cabeza sale a la altura de la flexión', () => {
    const s = prone(true);
    s.r.addTramo(0, 200);
    s.r.addTramo(1, 200);
    s.r.addTramo(2, 200);
    for (const p of s.r.pieces) if (p.k === 'low' || p.k === 'dive') expect(p.h).toBeLessThan(0.15);
  });
});
