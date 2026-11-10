/**
 * Las oleadas de Combate, como en RepArena (src/70_game.js: buildWave, isBossWave, la escalera de enemigos —ladderTop y
 * ladderPick—, rampWaveEnd y los puntos de registerRep y onKilled):
 *  - cada oleada pide sus repeticiones («Repeticiones por oleada» y lo que suben en cada una): la suma de la resistencia de
 *    los que salen es justo eso (las de pie, con dos disparos por repetición, el doble);
 *  - salen repartidos entre los elegidos (con los de tierra y voladores, uno de cada); con la escalera, en las primeras
 *    oleadas solo los fáciles, y cada pocas entra uno más duro;
 *  - la última oleada (o cada quinta, al fallo) trae un jefe (un 30 % de las repeticiones): el de tu clase si solo eliges
 *    una, el capitán Barbarroja si está, el dragón si es de los voladores…;
 *  - la dificultad creciente sube solo con las oleadas superadas con soltura.
 * Sin IWSDK: se compara con el código de RepArena en tests/compare/waves.compare.test.ts.
 */

/** Uno que va a salir: qué es (el nombre de RepArena: zombie, impthrow, captainboss, dragon…), cuánto aguanta y su fila en
 * la tabla del desarrollador (su fuerza). */
export interface WaveSpec {
  kind: string;
  hp: number;
  fk?: string;
}

/** Lo que mira buildWave de los ajustes y de la partida. */
export interface WaveEnv {
  /** Las repeticiones de la oleada (waveReps) y si cada una da dos disparos (twoShots). */
  reps: number;
  twoShots: boolean;
  /** Por tierra, voladores o mezcla (foes()). */
  foes: 'robots' | 'flyers' | 'mix';
  /** Los elegidos de tierra (groundList) y los voladores (flyList, con el dragón si está). */
  ground: string[];
  fly: string[];
  /** Oleadas de la ronda (0: al fallo), el rango (0 a 6) y si va la escalera de enemigos («foeLadder»). */
  waves: number;
  rank: number;
  ladder: boolean;
  /** La resistencia de cada uno (devFoe(key).hp) y su dureza (foeTier). */
  hp: (key: string) => number;
  tier: (kind: string) => number;
  rnd?: () => number;
  /** La batalla diminuta (flexiones, plancha con un brazo): los de las trampillas (isTiny). */
  tiny?: boolean;
}

/** Su dureza de serie, de 1 (los fáciles y lentos) a 4 (RepArena: FOE_TIER). */
export const FOE_TIER: Record<string, number> = { zombie: 1, zgreen: 1, puglin: 1, mushroom: 1, crab: 1, drone: 1, bee: 1, robot: 2, imp: 2, skeleton: 2, sharky: 2, alien: 2, spider: 2, skull: 2, hornet: 2, bat: 2, zchubby: 3, raptor: 3, thrower: 3, demon: 3, greendemon: 3, mako: 3, alientall: 3, cthulhu: 3, cyclops: 4, yeti: 4, captain: 4 };

/** Su dureza: la de la tabla del desarrollador o la de serie (RepArena: foeTier). */
export const foeTierOf = (devTier: (key: string) => number, k: string): number => devTier('g:' + k) || devTier('h:' + k) || devTier('f:' + k) || FOE_TIER[k] || 2;

/** Lo que sale aquí de cada uno de RepArena: el lanzador es «thrower»; los jefes («…boss»), el mismo a lo grande; la
 * nodriza (geométrica), el dragón; los robots, drones y avispones (geométricos, por ahora no: decisión del usuario), un
 * zombi verde o una abeja. */
export function xrFoe(kind: string, tiny = false): { k: string; boss: boolean } {
  // la batalla diminuta: los de las trampillas («hcrab», «hcrabboss»…); las arañas (geométricas), un cangrejo
  if (tiny && (kind === 'scout' || kind === 'heavy')) return { k: 'hcrab', boss: false };
  if (tiny && kind === 'titan') return { k: 'hcrab', boss: true };
  if (kind === 'impthrow') return { k: 'thrower', boss: false };
  if (kind === 'dragon' || kind === 'carrier') return { k: 'dragon', boss: true };
  if (kind === 'titan') return { k: 'zgreen', boss: true };
  if (kind === 'scout' || kind === 'heavy') return { k: 'zgreen', boss: false };
  if (kind === 'drone' || kind === 'hornet' || kind === 'bomber') return { k: 'bee', boss: false };
  if (kind.endsWith('boss')) return { k: kind.slice(0, -4), boss: true };
  return { k: kind, boss: false };
}

/** Lo que ha subido la dificultad creciente (de 0 a 0,6) tras lvl oleadas superadas con soltura (RepArena: rampK). */
export const rampK = (ramp: number, lvl: number, cap: number): number => (ramp > 0 ? Math.min(cap, (ramp / 100) * lvl) : 0);

/** Lo que tarda una repetición de cada ejercicio de pie (s) (RepArena: repTimeOf). */
export const REP_TIME: Record<string, number> = { squat: 2.3, curl: 1.3, curl2: 2.0, twist: 1.6, press2: 2.0, fraise: 2.4, thruster: 3.4, frontsq: 3.0, jsquat: 2.6, swing: 2.0, chop: 2.4, dlrow: 3.0, lunge: 2.6, press: 1.6 };

/** ¿Es la oleada del jefe? La última (o, al fallo, cada quinta). */
export const isBossWave = (i: number, waves: number): boolean => (waves ? i === waves - 1 : (i + 1) % 5 === 0);

/** Hasta qué dureza salen en la oleada i (RepArena: ladderTop). */
export function ladderTop(i: number, rank: number, waves: number): number {
  const start = rank <= 2 ? 1 : rank <= 4 ? 2 : 3, N = waves, p = N > 1 ? i / (N - 1) : Math.min(1, i / 9);
  return Math.min(4, start + Math.round(p * (4 - start)));
}

/** De los elegidos, los que tocan en esta oleada (RepArena: ladderPick). */
export function ladderPick(list: string[], i: number, env: WaveEnv): string[] {
  if (!env.ladder || list.length < 2) return list;
  const top = ladderTop(i, env.rank, env.waves), ok = list.filter((k) => env.tier(k) <= top);
  return ok.length ? ok : list.filter((k) => env.tier(k) === Math.min(...list.map(env.tier)));
}

// el jefe de cada clase (RepArena: gb)
const bossOf = (k: string, tiny = false): string => (tiny ? (k === 'spider' ? 'titan' : 'h' + k + 'boss') : ({ robot: 'titan', imp: 'impboss', puglin: 'impboss', thrower: 'impboss', zombie: 'zombieboss', raptor: 'raptorboss' })[k] || k + 'boss');

/** Quién sale en la oleada i (RepArena: buildWave, en Combate de pie). fresh: los que entran en juego por primera vez
 * (seen: los que ya han salido en la ronda; se vacía en la primera). */
export function buildWave(i: number, env: WaveEnv, seen: Set<string>): { list: WaveSpec[]; fresh: string[] } {
  const rnd = env.rnd ?? Math.random;
  let total = env.reps;
  if (env.twoShots) total *= 2;
  let boss: WaveSpec | null = null;
  const F = env.foes;
  const tiny = !!env.tiny, G0 = env.ground.length ? env.ground : [tiny ? 'spider' : 'robot'], FL = env.fly.filter((k) => k !== 'dragon');
  const G = ladderPick(G0, i, env), FK = ladderPick(FL.length ? FL : ['drone', 'hornet'], i, env), W = (k: string): number => (k === 'drone' ? 2 : 1);
  const heavyOk = !env.ladder || ladderTop(i, env.rank, env.waves) >= 2;
  if (i === 0) seen.clear();
  let fresh = [...(F !== 'flyers' ? G : []), ...(F !== 'robots' ? FK : [])].filter((k) => !seen.has(k));
  fresh.forEach((k) => seen.add(k));
  if (i === 0) fresh = [];
  const deal = (ks: string[]): (() => string) => {
    const acc: Record<string, number> = {}, sum = ks.reduce((a, k) => a + W(k), 0);
    ks.forEach((k) => (acc[k] = rnd() * 0.5));
    return () => {
      let g = ks[0], top = -Infinity;
      for (const k of ks) {
        acc[k] += W(k) / sum;
        if (acc[k] > top) {
          top = acc[k];
          g = k;
        }
      }
      acc[g] -= 1;
      return g;
    };
  };
  const nextG = deal(G), nextF = deal(FK);
  if (isBossWave(i, env.waves)) {
    const b = Math.max(4, Math.round(total * 0.3)), ground = F === 'robots' || (F === 'mix' && Math.floor(i / 5) % 2 === 0);
    const kind = !ground ? (env.fly.includes('dragon') ? 'dragon' : 'carrier') : !tiny && G0.includes('captain') ? 'captainboss' : G0.length === 1 ? bossOf(G0[0], tiny) : G0.includes(tiny ? 'spider' : 'robot') ? 'titan' : bossOf(G[Math.floor(rnd() * G.length)], tiny);
    boss = { kind, hp: b };
    total -= b;
  }
  const list: WaveSpec[] = [];
  let k = 0;
  while (total > 0) {
    // (la resistencia de la primera oleada es la de cada uno en la tabla del desarrollador; luego sube)
    let kind: string, hp: number, fk = '';
    const R = (key: string): number => env.hp((fk = key));
    if (F === 'robots' || (F === 'mix' && k % 2 === 0)) {
      const g = nextG();
      if (tiny) {
        if (g === 'spider') {
          kind = k % 3 === 2 && heavyOk ? 'heavy' : 'scout';
          hp = kind === 'heavy' ? R('h:spider_h') + Math.floor(i / 3) : R('h:spider') + Math.floor(i / 4);
        } else {
          kind = 'h' + g;
          hp = R('h:' + g) + Math.floor(i / 4);
        }
      } else if (g === 'imp' || g === 'puglin') {
        kind = g;
        hp = R('g:' + g) + Math.floor(i / (kind === 'puglin' ? 4 : 3));
      } else if (g === 'thrower') {
        kind = 'impthrow';
        hp = R('g:thrower') + Math.floor(i / 3);
      } else if (g === 'raptor') {
        kind = 'raptor';
        hp = R('g:raptor') + Math.floor(i / 4);
      } else if (g === 'robot') {
        kind = k % 3 === 2 && heavyOk ? 'heavy' : 'scout';
        hp = kind === 'heavy' ? R('g:robot_h') + Math.floor(i / 3) : R('g:robot') + Math.floor(i / 4);
      } else {
        kind = g;
        hp = R('g:' + g) + Math.floor(i / 3); // (zombis, monstruitos y piratas)
      }
    } else {
      const f = nextF();
      kind = f === 'drone' && i >= 2 && k % 5 === 4 ? 'bomber' : f;
      hp = R('f:' + kind);
    }
    hp = Math.min(hp, total);
    list.push({ kind, hp, fk });
    total -= hp;
    k++;
  }
  if (boss) list.push(boss);
  return { list, fresh };
}

/** Lo que tiene que esperar entre uno y otro (RepArena: startWave → spawnInterval): con la resistencia media de la oleada
 * y lo que tarda una repetición, o «Separación entre enemigos» si la has puesto; con la dificultad creciente, algo menos. */
export function spawnGap(list: WaveSpec[], repTime: number, flyersOnly: boolean, twoShots: boolean, gapSetting: number, rampK: number): number {
  const avgHp = list.reduce((a, e) => a + e.hp, 0) / Math.max(1, list.length);
  const auto = flyersOnly ? repTime * (twoShots ? 0.55 : 0.95) : Math.max(1.0, Math.min(15, avgHp * repTime * 0.85));
  return (gapSetting > 0 ? gapSetting : auto) / (1 + rampK * 0.35);
}

/** ¿Sube la dificultad creciente tras la oleada? Solo superada con soltura: como mucho un 20 % de las repeticiones en golpes
 * y caídas (al menos 2) (RepArena: rampWaveEnd). Devuelve también la línea del marcador. */
export function rampAfter(ok: boolean, bad: number, waveReps: number, ramp: number, lvl: number, cap: number): { up: boolean; note: string } {
  if (!(ramp > 0)) return { up: false, note: '' };
  const lim = Math.max(2, Math.round(0.2 * (waveReps || 10)));
  if (ok && bad <= lim) return { up: true, note: `Próxima oleada: +${Math.round(Math.min(cap, (ramp / 100) * (lvl + 1)) * 100)} % de dificultad` };
  return { up: false, note: ok ? `Te han dado ${bad} veces: la próxima, igual de difícil` : 'La próxima, igual de difícil' };
}

/** Los puntos de una repetición (con el combo ya sumado) y los de derribar a cada uno (RepArena: registerRep y onKilled). */
export const repPoints = (perfect: boolean, combo: number, k = 1): number => Math.round(50 * (perfect ? 2 : 1) * (1 + combo * 0.1) * k);
const KILL_PTS: Record<string, number> = { titan: 1500, carrier: 1500, dragon: 1500, queen: 1500, bigbubble: 1000, wasp: 300, heavy: 500, bomber: 400, hornet: 350, cthulhu: 400, scout: 300, drone: 250, bubble: 200 };
export const killPoints = (kind: string, boss: boolean): number => KILL_PTS[kind] || (boss ? 1500 : 300);
