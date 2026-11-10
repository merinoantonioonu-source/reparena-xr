/**
 * Los premios de Combate, como en RepArena (src/79_perks.js), que cambian cada ronda sin pedir menos ejercicio (ninguno da
 * más cargas ni más daño: las oleadas piden las mismas repeticiones):
 *  - las cartas de mejora: en el descanso eliges 1 de 3, que duran el resto de la ronda; como mucho cada tres oleadas
 *    superadas y solo si en ese tramo no te han dado más de tres veces; la oleada siguiente espera a que elijas;
 *  - el enemigo dorado (×3 puntos), el relámpago (20 s en los que llegan seguidos y todo vale el doble) y, en algunos
 *    descansos, un cofre que se abre saltando (una mejora más, una vida o puntos);
 *  - la carrera contra tu récord: tus repeticiones de ahora frente a las de tu mejor ronda de ese ejercicio.
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/perks.compare.test.ts.
 */

export interface PerkDef {
  name: string;
  col: string;
  desc: string;
  /** Solo si hay vidas (el corazón). */
  lives?: boolean;
}

/** Las siete mejoras (RepArena: PERKS). */
export const PERKS: Record<string, PerkDef> = {
  shield: { name: 'Escudo', col: '#5ab8ff', desc: 'Para el primer golpe de cada oleada' },
  frost: { name: 'Escarcha', col: '#9fe8ff', desc: 'Cada perfecta deja más lentos 3 s a los que están cerca del impacto' },
  wave: { name: 'Onda', col: '#a68bff', desc: 'Cada perfecta empuja hacia atrás a los que están cerca del impacto' },
  life: { name: 'Corazón', col: '#ff4fa3', desc: 'Cada 10 perfectas recuperas una vida (si te falta alguna)', lives: true },
  gold: { name: 'Doble o nada', col: '#ffd166', desc: 'Las perfectas valen el doble de puntos' },
  combo: { name: 'Combo de hierro', col: '#ff8a3d', desc: 'El primer golpe de cada oleada no te rompe el combo' },
  calm: { name: 'Calma', col: '#7ee081', desc: 'Los enemigos se mueven un 15 % más despacio' },
};

/** Lo que pasa y hay que contar (en el marcador o en grande): su texto y su color. */
export type PerkNote = [string, string] | null;

export class Perks {
  readonly has = new Set<string>();
  offer: string[] | null = null;
  offerT = -1;
  shield = 0;
  comboSave = 0;
  perfN = 0;
  since = 0;
  taken0 = 0;
  /** Cada cuántas oleadas superadas hay cartas y los golpes que puedes llevarte en ese tramo para ganártelas. */
  readonly every = 3;
  readonly maxHits = 3;
  private reT = 0;

  constructor(private rnd: () => number = Math.random) {}

  reset(): void {
    this.has.clear();
    Object.assign(this, { offer: null, offerT: -1, shield: 0, comboSave: 0, perfN: 0, since: 0, taken0: 0, reT: 0 });
  }

  /** Las que aún puedes tener (el corazón, solo con vidas). */
  pool(lives: boolean): string[] {
    return Object.keys(PERKS).filter((k) => !this.has.has(k) && (!PERKS[k].lives || lives));
  }

  /** Oleada superada (RepArena: perkWaveCleared): cada tres, si te las has ganado, las cartas salen a los 1,2 s. */
  waveCleared(taken: number, on: boolean, lives: boolean): PerkNote {
    this.since++;
    const hits = taken - this.taken0;
    if (this.since < this.every) return null;
    const earned = hits <= this.maxHits;
    this.since = 0;
    this.taken0 = taken;
    if (earned && on && this.pool(lives).length) this.offerT = 1.2;
    else if (!earned && on) return [`Sin mejora: ${hits} golpes en ${this.every} oleadas`, '#a49fc8'];
    return null;
  }

  /** Elige (o te toca, al acabar el descanso sin elegir) una mejora (RepArena: perkTake). */
  take(k: string, random = false): PerkNote {
    this.has.add(k);
    this.offer = null;
    if (k === 'shield') this.shield = 1;
    if (k === 'combo') this.comboSave = 1;
    return [`${random ? 'Te toca' : 'Mejora'}: ${PERKS[k].name}`, PERKS[k].col];
  }

  /** ¿La oleada siguiente espera a que elijas? (en el descanso, con cartas por elegir o a punto de salir) */
  waits(on: boolean): boolean {
    return on && (!!this.offer || this.offerT > 0);
  }

  /** Se acaba el descanso: la que no elegiste, al azar (RepArena: perkRestEnd). */
  restEnd(): PerkNote {
    this.offerT = -1;
    if (this.offer) return this.take(this.offer[Math.floor(this.rnd() * this.offer.length)], true);
    return null;
  }

  /** En cada oleada vuelven el escudo y el combo de hierro (RepArena: perkWaveStart). */
  waveStart(): void {
    if (this.has.has('shield')) this.shield = 1;
    if (this.has.has('combo')) this.comboSave = 1;
  }

  /** En el descanso, cada fotograma (RepArena: perkStep): 'offer' cuando salen las cartas (offer: las tres), 'again'
   * si se ha ido el panel sin elegir (vuelve a los 2 s). shown: ¿se ve el panel de las cartas? */
  step(dt: number, rest: boolean, lives: boolean, shown: boolean): 'offer' | 'again' | null {
    if (this.offerT > 0 && rest) {
      this.offerT -= dt;
      if (this.offerT <= 0) {
        const pool = this.pool(lives);
        if (pool.length) {
          this.offer = pool.sort(() => this.rnd() - 0.5).slice(0, 3);
          return 'offer';
        }
      }
    }
    if (this.offer && rest) {
      if (shown) this.reT = 0;
      else if ((this.reT += dt) > 2) {
        this.reT = 0;
        return 'again';
      }
    }
    return null;
  }

  /** Lo que valen los puntos (RepArena: perkPtsK y perkKillK): doble o nada en las perfectas, el relámpago y el dorado. */
  ptsK(perfect: boolean, rush: boolean): number {
    return (perfect && this.has.has('gold') ? 2 : 1) * (rush ? 2 : 1);
  }

  /** Una repetición: con el corazón, cada 10 perfectas, una vida si te falta (RepArena: perkOnRep). */
  onRep(perfect: boolean, lives: number, maxLives: number): boolean {
    if (!perfect || !this.has.has('life') || !maxLives) return false;
    return ++this.perfN % 10 === 0 && lives < maxLives;
  }

  /** El escudo para el golpe (RepArena: perkAbsorb). */
  absorb(): boolean {
    if (this.shield <= 0) return false;
    this.shield--;
    return true;
  }

  /** El combo de hierro: el primer golpe no rompe un combo de 3 o más (RepArena: perkKeepCombo). */
  keepCombo(combo: number): boolean {
    if (this.comboSave > 0 && combo >= 3) {
      this.comboSave--;
      return true;
    }
    return false;
  }

  /** Lo que se frena un enemigo: escarcha y calma (RepArena: perkSlow). */
  slow(frost: boolean): number {
    return (frost ? 0.45 : 1) * (this.has.has('calm') ? 0.85 : 1);
  }
}

/** ¿Sale dorado? Uno por oleada como mucho, nunca el jefe, un 8 % (RepArena: perkSpawned). */
export const goldRoll = (already: number, boss: boolean, rnd: () => number = Math.random): boolean => !already && !boss && rnd() <= 0.08;

/** El relámpago (RepArena: rushPlan): desde la segunda oleada, en una de cada tres más o menos, nunca con el jefe; empieza
 * a los 4-10 s. Devuelve cuándo (s) o -1. */
export function rushPlan(i: number, bossWave: boolean, on: boolean, rnd: () => number = Math.random): number {
  if (on && i >= 1 && !bossWave && rnd() < 0.35) return 4 + rnd() * 6;
  return -1;
}
/** Lo que dura (s) y cuánto más deprisa llegan mientras tanto. */
export const RUSH_SECS = 20, RUSH_SPAWN_K = 2;

/** ¿Sale cofre en este descanso? (RepArena: chestMaybe, un 35 %) */
export const chestRoll = (on: boolean, rnd: () => number = Math.random): boolean => on && rnd() <= 0.35;

// ---------------------------------------------------------------- la carrera contra tu récord

/** Dónde se guarda la mejor ronda de cada modo y ejercicio (la misma clave que RepArena: se comparte) y el historial. */
export const GHOST_KEY = 'reparena3-ghosts', HIST_KEY = 'reparena3-history';
interface GhostBest {
  n: number;
  tl: number[] | null;
}

/** Tus repeticiones de ahora frente a las de tu mejor ronda en el mismo momento (RepArena: ghostReset, ghostStep, ghostText
 * y ghostEnd): se apuntan cada 2 s. */
export class Ghost {
  key = '';
  best: GhostBest | null = null;
  tl: number[] = [];
  tT = 0;
  beat = false;

  /** Al empezar la ronda: la carrera guardada o, si no hay, tu mejor ronda del historial. */
  reset(mode: string, ex: string, on: boolean, ghosts: Record<string, GhostBest> | null, hist: { ex?: string; mode?: string; reps?: number }[] | null): void {
    Object.assign(this, { key: `${mode}:${ex}`, best: null, tl: [], tT: 0, beat: false });
    if (!on) return;
    this.best = ghosts?.[this.key] ?? null;
    if (!this.best) {
      const n = (hist ?? []).filter((r) => r.ex === ex && r.mode === mode).reduce((a, r) => Math.max(a, r.reps || 0), 0);
      if (n) this.best = { n, tl: null };
    }
  }

  /** Cada fotograma de la partida: devuelve true al batir el récord (una vez). */
  step(dt: number, n: number, on: boolean): boolean {
    if (!on) return false;
    this.tT += dt;
    if (this.tT >= 2) {
      this.tT -= 2;
      this.tl.push(n);
    }
    const B = this.best;
    if (B && B.n > 0 && !this.beat && n > B.n) return (this.beat = true);
    return false;
  }

  /** Para el rosco del marcador: dónde ibas en tu mejor ronda en este momento (g), lo que llevas (n) y tu récord (best)
   * (RepArena: ghostAt). */
  at(n: number, on: boolean): { g: number; n: number; best: number; beat: boolean } | null {
    const B = this.best;
    if (!on || !B || !B.n || !B.tl || !B.tl.length) return null;
    return { g: B.tl[Math.min(B.tl.length - 1, this.tl.length)] || 0, n, best: B.n, beat: this.beat };
  }

  /** Para el marcador: cuántas llevas de más o de menos que tu récord en este momento. */
  text(n: number, on: boolean): PerkNote {
    const B = this.best;
    if (!on || !B || !B.n) return null;
    if (this.beat) return [`¡RÉCORD! +${n - B.n}`, '#ffd166'];
    if (!B.tl || !B.tl.length) return [`RÉCORD ${B.n} · FALTAN ${B.n - n + 1}`, '#a49fc8'];
    const g = B.tl[Math.min(B.tl.length - 1, this.tl.length)] || 0, d = n - g;
    return [`RÉCORD ${d >= 0 ? '+' : '−'}${Math.abs(d)}`, d >= 0 ? '#3cf0c6' : '#ff8a3d'];
  }

  /** Al acabar: si es tu mejor ronda, se guarda (devuelve lo que hay que guardar, o null). */
  end(n: number, on: boolean, ghosts: Record<string, GhostBest> | null): Record<string, GhostBest> | null {
    const B = this.best;
    if (!on || !(n > 0) || (B && n <= B.n)) return null;
    return { ...(ghosts ?? {}), [this.key]: { n, tl: this.tl.concat(n).slice(0, 900) } };
  }
}
