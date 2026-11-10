/**
 * Los enemigos de las compuertas, desde una tabla (RepArena: ROBOT_KIND de src/70_game.js y BEAST_DEF de src/42_beasts.js),
 * con su resistencia, su fuerza y su dureza de la tabla del desarrollador (src/67_dev.js: devFoe), el reparto entre los que
 * eliges en Rivales (buildWave: deal) y los puestos de ataque delante de ti (robotSlot). Sin IWSDK: se prueba en
 * tests/unit/foes.test.ts.
 *
 * Los de las compuertas con modelo de Quaternius: zombis, velociraptor, piratas, monstruitos (PR 8a), y el diablillo, el
 * puglin y el lanzador (PR 8b; sus animaciones, las de la biblioteca pasadas a su esqueleto: src/combat/retarget.ts). Los
 * robots, que en RepArena eran geométricos, por ahora no (decisión del usuario): si solo están elegidos esos, zombis verdes.
 */
import { Vector3 } from 'three';
import { DEV, DEV_FACTORY } from '../core/dev-state.js';
import { FOE_FLY, FOE_GATE } from '../core/catalog.js';

/** Cómo se llama cada animación en su modelo: reposo, andar, correr, atacar, recibir, morir y la de esperar bailando. */
export interface FoeClips {
  idle: string;
  walk: string;
  run: string;
  attack: string;
  hit: string;
  death: string;
  dance: string;
  /** La de amenazar (si no, la de bailar) y la voltereta de las esquivas (si la tiene). */
  taunt?: string;
  roll?: string;
}

export interface FoeDef {
  /** Su modelo en el catálogo de recursos (src/assets.ts). */
  asset: string;
  /** Lo que mide de pie (m) y su escala (para que mida eso). */
  h: number;
  k: number;
  /** Su radio en el suelo (m): su cápsula y lo que ocupa. */
  r: number;
  /** A qué distancia de ti se planta a golpear (m), lo rápido que es (respecto al tiempo de llegada) y si es pesado. */
  stop: number;
  speedF: number;
  heavy: boolean;
  /** A qué velocidad (m/s) avanzan sus animaciones de andar y de correr (para que los pies no patinen). */
  walk: number;
  run: number;
  minTs: number;
  maxTs: number;
  clips: FoeClips;
  /** Su golpe: cuándo empieza (s) y cuándo llega (s) en la animación de atacar. */
  atk: [number, number];
  /** Su voz (VOICE, src/audio/catalog.ts) y su clase (Ajustes → Cada enemigo). */
  voice: string;
  grp: string;
  /** Su paleta de colores aparte (el zombi de 2017), en el catálogo de recursos. */
  palette?: string;
  /** El centro del cuerpo, en proporción a su altura (los monstruitos, su hueso del cuerpo a ras de suelo). */
  ctr: number;
  /** Sus animaciones salen de la biblioteca (anims.glb, la Universal Animation Library), pasadas a su esqueleto. */
  ual?: boolean;
  /** Sus colores: uno de estos al azar (texturas del catálogo de recursos). */
  tex?: string[];
  /** El lanzador: se queda lejos y te tira piedras en vez de golpear. */
  thrower?: boolean;
  /** Vuela (src/combat/flight.ts): no va a un puesto ni pisa el suelo. */
  fly?: boolean;
  /** El jefe de la ronda (bossDef). */
  boss?: boolean;
}

const ZOMBIE2_CLIPS: FoeClips = { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Punch', hit: 'HitReact', death: 'Death', dance: 'Idle_Attack' };
const PIRATE_CLIPS: FoeClips = { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Sword', hit: 'HitReact', death: 'Death', dance: 'Wave' };
const CUTE_CLIPS: FoeClips = { idle: 'Idle', walk: 'Walk', run: 'Walk', attack: 'Bite_Front', hit: 'HitRecieve', death: 'Death', dance: 'Jump' };

const zombie2 = (asset: string, h: number, voice: string): FoeDef => ({ asset, h, k: 1, r: 0.4, stop: 1.1, speedF: 0.9, heavy: false, walk: 0.6, run: 2.4, minTs: 0.5, maxTs: 2.2, clips: ZOMBIE2_CLIPS, atk: [0.25, 0.45], voice, grp: 'zombie', ctr: 0.62 });
const pirate = (asset: string, h: number, voice: string): FoeDef => ({ asset, h, k: 1, r: 0.4, stop: 1.1, speedF: 1, heavy: false, walk: 0.7, run: 2.6, minTs: 0.5, maxTs: 2.2, clips: PIRATE_CLIPS, atk: [0.15, 0.32], voice, grp: 'pirate', ctr: 0.62 });
// los monstruitos: [alto del modelo, metros que miden al andar]
const cute = (asset: string, nat: number, h: number, voice: string): FoeDef => ({ asset, h, k: h / nat, r: 0.4, stop: 1.1, speedF: 1, heavy: false, walk: 0.7, run: 2.2, minTs: 0.7, maxTs: 2.4, clips: CUTE_CLIPS, atk: [0.12, 0.28], voice, grp: 'cute', ctr: 0.5 });

/** Los de las compuertas que ya están (RepArena: BEAST_DEF y ROBOT_KIND, con sus mismos números). */
export const FOE_DEF: Record<string, FoeDef> = {
  zombie: { asset: 'foe-zombie', h: 1.8, k: 0.27, r: 0.4, stop: 1.05, speedF: 0.9, heavy: false, walk: 0.35, run: 2.4, minTs: 0.5, maxTs: 2.6, clips: { idle: 'Zombie|ZombieIdle', walk: 'Zombie|ZombieWalk', run: 'Zombie|ZombieRun', attack: 'Zombie|ZombieBite', hit: '', death: '', dance: 'Zombie|ZombieIdle', taunt: 'Zombie|ZombieIdle' }, atk: [1.0, 2.5], voice: 'zombie', grp: 'zombie', palette: 'foe-zombie-palette', ctr: 0.62 },
  zgreen: zombie2('zombie-basic', 1.36, 'zgreen'),
  zchubby: zombie2('zombie-chubby', 1.64, 'zchubby'),
  raptor: { asset: 'foe-raptor', h: 1.4, k: 0.3, r: 0.5, stop: 1.45, speedF: 1.2, heavy: false, walk: 1.3, run: 4.3, minTs: 0.6, maxTs: 2.2, clips: { idle: 'Armature|Velociraptor_Idle', walk: 'Armature|Velociraptor_Walk', run: 'Armature|Velociraptor_Run', attack: 'Armature|Velociraptor_Attack', hit: '', death: 'Armature|Velociraptor_Death', dance: 'Armature|Velociraptor_Idle', taunt: 'Armature|Velociraptor_Idle' }, atk: [0.21, 0.42], voice: 'raptor', grp: 'dino', ctr: 0.55 },
  skeleton: pirate('foe-skeleton', 1.5, 'skeleton'),
  captain: pirate('foe-captain', 1.85, 'captain'),
  sharky: pirate('foe-sharky', 1.56, 'sharky'),
  mako: pirate('foe-mako', 1.59, 'mako'),
  demon: cute('foe-demon', 1.62, 1.15, 'demon'),
  greendemon: cute('foe-greendemon', 1.62, 1.15, 'greendemon'),
  cyclops: cute('foe-cyclops', 1.67, 1.25, 'cyclops'),
  yeti: cute('foe-yeti', 1.67, 1.3, 'yeti'),
  skull: cute('foe-skull', 1.55, 1.0, 'skull'),
  alien: cute('foe-alien', 2.06, 1.2, 'alien'),
  alientall: cute('foe-alientall', 2.11, 1.35, 'alientall'),
};
// (el zombi verde y el gordo, algo más grandes que en RepArena, como en el prototipo: que se vean bien de lejos)
FOE_DEF.zgreen.k = 1.2;
FOE_DEF.zgreen.h = 1.62;
FOE_DEF.zchubby.k = 1.1;
FOE_DEF.zchubby.h = 1.8;
FOE_DEF.zchubby.r = 0.45;

// El diablillo y el puglin (Bestiary, de Quaternius): las animaciones de la biblioteca (RepArena: BEAST_CLIPS, BEAST_PUNCH)
const UAL_CLIPS: FoeClips = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', attack: 'Punch_Cross', hit: 'Hit_Chest', death: 'Death01', dance: 'Dance_Loop', roll: 'Roll' };
// (el diablillo amenaza con un hechizo; el puglin, bailando: RepArena, pickAnim)
const IMP_CLIPS: FoeClips = { ...UAL_CLIPS, taunt: 'Spell_Simple_Shoot' };
const texOf = (k: string): string[] => [1, 2, 3].map((v) => `foe-${k}-color${v}`);
Object.assign(FOE_DEF, {
  imp: { asset: 'foe-imp', h: 1.68, k: 1, r: 0.4, stop: 1.2, speedF: 1, heavy: false, walk: 1.25, run: 2.9, minTs: 0.5, maxTs: 1.8, clips: IMP_CLIPS, atk: [0.15, 0.3], voice: 'imp', grp: 'beast', ctr: 0.62, ual: true, tex: texOf('imp') },
  puglin: { asset: 'foe-puglin', h: 1.07, k: 1.15, r: 0.4, stop: 1.0, speedF: 1.25, heavy: false, walk: 0.92, run: 2.2, minTs: 0.5, maxTs: 1.8, clips: UAL_CLIPS, atk: [0.15, 0.3], voice: 'puglin', grp: 'beast', ctr: 0.6, ual: true, tex: texOf('puglin') },
  // el lanzador: un diablillo algo más pequeño que se queda lejos (a 4,2 m) y te tira piedras (RepArena: impthrow)
  thrower: { asset: 'foe-imp', h: 1.6, k: 0.95, r: 0.38, stop: 4.2, speedF: 1, heavy: false, walk: 1.19, run: 2.75, minTs: 0.5, maxTs: 1.8, clips: { ...IMP_CLIPS, attack: 'OverhandThrow' }, atk: [0.25, 0.35], voice: 'imp', grp: 'beast', ctr: 0.62, ual: true, tex: texOf('imp'), thrower: true },
} satisfies Record<string, FoeDef>);

// Los monstruitos que vuelan (Cute Animated Monsters): solo su vuelo, su mordisco, su golpe y su muerte; el tamaño, el de
// RepArena (BEAST_DEF: [alto del modelo, metros que miden]); su vuelo, en src/combat/flight.ts
const FLY_CLIPS: FoeClips = { idle: 'Flying', walk: 'Flying', run: 'Flying', attack: 'Bite_Front', hit: 'HitRecieve', death: 'Death', dance: 'Flying' };
const flyer = (asset: string, nat: number, h: number, voice: string): FoeDef => ({ ...cute(asset, nat, h, voice), clips: FLY_CLIPS, grp: 'fly', fly: true });
Object.assign(FOE_DEF, {
  bee: flyer('foe-bee', 1.9, 0.5, 'bee'),
  bat: flyer('foe-bat', 1.75, 0.45, 'bat'),
  cthulhu: flyer('foe-cthulhu', 1.56, 0.55, 'cthulhu'),
  dragon: flyer('foe-dragon', 1.65, 0.5, 'dragon'),
} satisfies Record<string, FoeDef>);

/** Los voladores elegidos que ya se pueden sacar (sin el dragón, que solo sale de jefe: PR 10); si ninguno (los drones y
 * los avispones eran geométricos: por ahora no), la abeja y el murciélago (RepArena: buildWave, FL). */
export const flyFoes = (chosen: string[]): string[] => {
  const ok = chosen.filter((k) => k !== 'dragon' && !!FOE_DEF[k]?.fly);
  return ok.length ? ok : ['bee', 'bat'];
};

// Los jefes: el mismo, más grande, más lento y pesado (RepArena: ROBOT_KIND, los «…boss»: 1,6-1,7 veces más grandes; el
// capitán, 1,45, que ya es alto y tiene que caber por la compuerta)
const BOSS: Record<string, [number, number, number]> = { imp: [1.6, 0.75, 1.8], puglin: [1.6, 0.75, 1.8], thrower: [1.6, 0.75, 1.8], zombie: [1.6, 0.7, 1.7], raptor: [1.7, 0.8, 2.0], captain: [1.45, 0.72, 1.8] };
const bossDefs: Record<string, FoeDef> = {};
/** El jefe de esa clase (su fila de la tabla, a lo grande). El del lanzador es el diablillo (RepArena: impboss). */
export function bossDef(k: string): FoeDef {
  if (k === 'thrower') k = 'imp';
  if (bossDefs[k]) return bossDefs[k];
  const d = FOE_DEF[k], [sc, speedF, stop] = BOSS[k] ?? [1.65, 0.72, 1.8];
  return (bossDefs[k] = { ...d, k: d.k * sc, h: d.h * sc, r: d.r * sc, walk: d.walk * sc, run: d.run * sc, speedF, stop, heavy: true, boss: true });
}

/** ¿Ya se puede sacar? (los robots, que eran geométricos, por ahora no: decisión del usuario en el PR 8b) */
export const foeReady = (k: string): boolean => !!FOE_DEF[k];

/** Su nombre (el de Rivales). */
export const foeName = (k: string): string => [...FOE_GATE, ...FOE_FLY].find((o) => o[0] === k)?.[1] ?? k;

// ---------------------------------------------------------------- resistencia, fuerza y dureza

/** Lo que aguanta cada uno de serie si no es 1 (las de las compuertas, 2) (RepArena: DEV_FOE_HP). */
export const DEV_FOE_HP: Record<string, number> = { 'g:robot_h': 3, 'g:puglin': 1, 'g:zchubby': 3, 'g:yeti': 3, 'g:cyclops': 3, 'g:captain': 3, 'h:spider': 2, 'h:spider_h': 3, 'f:bomber': 2, 'f:cthulhu': 2 };
/** En qué tramo de la escalera entra cada uno (RepArena: FOE_TIER). */
export const FOE_TIER: Record<string, number> = { zombie: 1, zgreen: 1, puglin: 1, mushroom: 1, crab: 1, drone: 1, bee: 1, robot: 2, imp: 2, skeleton: 2, sharky: 2, alien: 2, spider: 2, skull: 2, hornet: 2, bat: 2, zchubby: 3, raptor: 3, thrower: 3, demon: 3, greendemon: 3, mako: 3, alientall: 3, cthulhu: 3, cyclops: 4, yeti: 4, captain: 4 };

const devFoeDefHp = (key: string): number => DEV_FOE_HP[key] || (key.startsWith('g:') ? 2 : 1);
type FoeRow = { hp?: number; str?: number; tier?: number };
/** Resistencia (disparos que aguanta en la primera oleada), fuerza (vidas que quita cada golpe) y dureza, de la tabla del
 * desarrollador (la suya y la de fábrica) o las de serie (RepArena: devFoe). key: 'g:zombie', 'h:spider', 'f:drone'… */
export function devFoe(key: string): { hp: number; str: number; tier: number } {
  const fac = (DEV_FACTORY.foes as Record<string, FoeRow> | undefined)?.[key] ?? {}, own = (DEV.t.foes as Record<string, FoeRow> | undefined)?.[key] ?? {}, o = { ...fac, ...own };
  return { hp: o.hp || devFoeDefHp(key), str: o.str || 1, tier: o.tier || 0 };
}

// ---------------------------------------------------------------- el reparto

/** Reparte los elegidos bien mezclados (RepArena: buildWave → deal): cada vez, el que más le toca. */
export function deal(ks: string[], rnd = Math.random): () => string {
  const acc: Record<string, number> = {};
  for (const k of ks) acc[k] = rnd() * 0.5;
  return () => {
    let g = ks[0], top = -Infinity;
    for (const k of ks) {
      acc[k] += 1 / ks.length;
      if (acc[k] > top) {
        top = acc[k];
        g = k;
      }
    }
    acc[g] -= 1;
    return g;
  };
}

/** Lo que el lanzador tira más deprisa (y más a menudo) cuanto más difícil, poco a poco: el rango (de recluta a general,
 * hasta un 24 %) y la mitad de lo que ha subido la dificultad en la ronda; como mucho, un 40 % (RepArena: throwK). */
export const throwK = (rank: number, rampK: number): number => Math.min(1.4, 1 + 0.04 * rank + 0.5 * rampK);

/** De los elegidos en Rivales, los que ya se pueden sacar; si ninguno, los zombis verdes (los del prototipo). */
export const gateFoes = (chosen: string[]): string[] => {
  const ok = chosen.filter((k) => foeReady(k) && !FOE_DEF[k].fly);
  return ok.length ? ok : ['zgreen'];
};

// ---------------------------------------------------------------- los puestos de ataque

/** Puestos de ataque (RepArena: ROW_GAP, SLOT_ARC): cada uno tiene el suyo en un arco delante de ti, separado de los demás
 * para que nunca se estorben; si la primera fila está llena, esperan en una segunda (o tercera) y avanzan cuando queda un
 * hueco. */
export const ROW_GAP = 1.1, SLOT_ARC = 1.3, FRONT_MIN = 0.3;

export interface SlotFoe {
  /** Dónde está, su radio y a qué distancia golpea. */
  pos: Vector3;
  radius: number;
  stop: number;
  /** Su puesto (si lo tiene). */
  slot: Vector3;
  slotOk: boolean;
  row: number;
}

const _rs = new Vector3();
/** Busca puesto para f entre los de los demás (others): en el arco delante de ti (head: tus ojos; delante es −Z), el
 * más cercano a su camino y al centro, primero en la fila de delante. Nunca a tu altura ni detrás (RepArena: robotSlot). */
export function foeSlot(f: SlotFoe, others: SlotFoe[], head: Vector3, rnd = Math.random): void {
  const want = Math.atan2(f.pos.x - head.x, -(f.pos.z - head.z));
  let best: { a: number; row: number } | null = null, bestC = Infinity;
  for (let row = 0; row < 3 && !best; row++) {
    const R = f.stop + row * ROW_GAP;
    for (let a = -SLOT_ARC; a <= SLOT_ARC + 1e-6; a += 0.1) {
      _rs.set(head.x + Math.sin(a) * R, 0, head.z - Math.cos(a) * R);
      if (others.some((o) => o !== f && o.slotOk && o.slot.distanceTo(_rs) < f.radius + o.radius + 0.65)) continue; // (también entre filas)
      if (_rs.z > head.z - FRONT_MIN) continue;
      const c = Math.abs(a - want) + Math.abs(a) * 0.3 + rnd() * 0.12;
      if (c < bestC) {
        bestC = c;
        best = { a, row };
      }
    }
  }
  const a = best ? best.a : want, row = best ? best.row : 3, R = f.stop + row * ROW_GAP;
  f.slot.set(head.x + Math.sin(a) * R, 0, Math.min(head.z - Math.cos(a) * R, head.z - FRONT_MIN)); // (RepArena: frontKeep(best.p))
  f.row = row;
  f.slotOk = true;
}
