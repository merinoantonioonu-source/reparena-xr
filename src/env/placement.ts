/**
 * Dónde se colocan los modelos de los dos entornos de día (RepArena: src/34_nature.js `natureBuild` y src/39_island.js
 * `islandBuild`): el claro del bosque y la playa de la isla pirata. La arena: tú en el origen, mirando a −Z, las compuertas
 * delante. Lo grande nunca va delante entre las compuertas y tú, ni cerca de ti; siempre sale igual para una misma distancia de
 * las compuertas (el mismo azar de siempre). Sin IWSDK: devuelve la lista de lo que se pone y el juego lo dibuja.
 */
const TAU = Math.PI * 2;

/** El mismo azar con semilla de RepArena (rng). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un modelo puesto: su nombre en el pack, dónde (y a qué altura), su tamaño y su giro. */
export interface Put {
  n: string;
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
}
export interface Gate {
  x: number;
  z: number;
}
/** Lo que se sabe de los modelos: si están en el pack y cuánto ocupan a ras de suelo (foot) y por entero (rad). */
export interface Models {
  has(n: string): boolean;
  foot(n: string): number;
  rad(n: string): number;
  /** Lo alto que llega (m, a escala 1; para poner algo encima). */
  top?(n: string): number;
}

const pick3 = <T>(R: () => number, l: T[]): T => l[Math.floor(R() * l.length)];

/** El claro del bosque (RepArena: natureBuild). `op`: con fondo realista, sin el bosque de detrás de las compuertas y con el abanico más abierto. */
export function natureLayout(D: number, op: boolean, gates: Gate[], M: Models): { puts: Put[]; solids: { x: number; z: number; r: number }[] } {
  const R = rng(23), puts: Put[] = [], trees: { x: number; z: number; r: number }[] = [], solids: { x: number; z: number; r: number }[] = [];
  const front = (x: number, z: number, extra: number): boolean => Math.abs(Math.atan2(x, -z)) < (op ? 1.15 : 0.8) && (op || Math.hypot(x, z) < D + extra);
  const nearGate = (x: number, z: number, r: number): boolean => gates.some((g) => Math.hypot(g.x - x, g.z - z) < r);
  const add = (n: string, x: number, z: number, s: number, ry = R() * TAU): void => {
    if (M.has(n)) puts.push({ n, x, y: 0, z, s, ry });
  };
  const solid = (n: string, x: number, z: number, s: number): void => {
    if (Math.hypot(x, z) < D + 4 && M.has(n)) solids.push({ x, z, r: M.foot(n) * s });
  };
  const scatter = (count: number, rMin: number, rMax: number, ok: (x: number, z: number, r: number) => boolean, fn: (x: number, z: number, r: number) => void): void => {
    for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) {
      const a = R() * TAU, r = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin)), x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (!ok(x, z, r)) continue;
      fn(x, z, r);
      i++;
    }
  };
  const big = (x: number, z: number, r: number): boolean => r > 5.5 && !front(x, z, 5) && !nearGate(x, z, 4) && !trees.some((t) => Math.hypot(t.x - x, t.z - z) < t.r);
  // árboles: los normales más cerca, los pinos más lejos, algún árbol seco
  scatter(24, 7, 34, big, (x, z, r) => {
    const k = R(), n = r > 20 && k < 0.7 ? pick3(R, ['Pine_2', 'Pine_4', 'Pine_5']) : k < 0.08 ? pick3(R, ['DeadTree_1', 'DeadTree_2']) : pick3(R, ['CommonTree_3', 'CommonTree_4', 'CommonTree_5']);
    const s = 0.8 + R() * 0.55;
    add(n, x, z, s);
    solid(n, x, z, s);
    trees.push({ x, z, r: 3.2 });
  });
  // y un fondo de bosque detrás de las compuertas (más allá de donde salen los enemigos)
  if (!op)
    scatter(9, D + 6, D + 20, (x, z) => !nearGate(x, z, 5) && Math.abs(Math.atan2(x, -z)) < 0.9 && !trees.some((t) => Math.hypot(t.x - x, t.z - z) < t.r), (x, z) => {
      add(pick3(R, ['Pine_2', 'Pine_4', 'Pine_5', 'CommonTree_3', 'CommonTree_4']), x, z, 0.9 + R() * 0.5);
      trees.push({ x, z, r: 3.2 });
    });
  scatter(16, 5.5, 14, big, (x, z) => {
    const n = R() < 0.6 ? 'Bush_Common' : 'Bush_Common_Flowers', s = 0.45 + R() * 0.3;
    add(n, x, z, s);
    solid(n, x, z, s);
    trees.push({ x, z, r: 1.6 });
  });
  scatter(12, 5.5, 20, big, (x, z) => {
    const n = `Rock_Medium_${1 + Math.floor(R() * 3)}`, s = 0.3 + R() * 0.45;
    add(n, x, z, s);
    solid(n, x, z, s);
    trees.push({ x, z, r: 1.5 });
  });
  // setas al pie de los árboles cercanos
  trees.slice(0, 18).forEach((t) => {
    if (R() < 0.55) add('Mushroom_Common', t.x + (R() - 0.5) * 1.8, t.z + (R() - 0.5) * 1.8, 0.3 + R() * 0.25);
  });
  // hierba, flores, helechos y tréboles: por todas partes menos donde pisas y delante de las compuertas
  const small = (x: number, z: number, r: number): boolean => r > 1.7 && !nearGate(x, z, 2.2);
  scatter(170, 1.7, 15, small, (x, z) => add(['Grass_Common_Short', 'Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall'][Math.floor(R() * 5)], x, z, 0.2 + R() * 0.15));
  scatter(45, 2.2, 14, small, (x, z) => add('Flower_3_Group', x, z, 0.22 + R() * 0.12));
  scatter(45, 3, 16, (x, z, r) => small(x, z, r) && !front(x, z, 1), (x, z) => add(['Fern_1', 'Plant_1_Big', 'Plant_7_Big', 'Clover_1'][Math.floor(R() * 4)], x, z, 0.3 + R() * 0.2));
  return { puts, solids };
}

/** Hasta dónde llega la orilla de la isla (m). */
export const ISL_SHORE = 24;

/** La playa de la isla pirata (RepArena: islandBuild). */
export function islandLayout(D: number, gates: Gate[], M: Models): { puts: Put[]; solids: { x: number; z: number; r: number }[] } {
  const R = rng(57), puts: Put[] = [], taken: { x: number; z: number; r: number }[] = [], solids: { x: number; z: number; r: number }[] = [];
  const front = (x: number, z: number, extra: number): boolean => Math.abs(Math.atan2(x, -z)) < 0.8 && Math.hypot(x, z) < D + extra;
  const nearGate = (x: number, z: number, r: number): boolean => gates.some((g) => Math.hypot(g.x - x, g.z - z) < r);
  const free = (x: number, z: number, r: number): boolean => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
  const add = (n: string, x: number, z: number, s: number, ry = R() * TAU, r = 0, h = 0): void => {
    if (!M.has(n)) return;
    puts.push({ n, x, y: h, z, s, ry });
    if (r) taken.push({ x, z, r });
  };
  const solid = (n: string, x: number, z: number, s: number): void => {
    if (Math.hypot(x, z) < D + 4 && M.has(n)) solids.push({ x, z, r: M.foot(n) * s });
  };
  const scatter = (count: number, rMin: number, rMax: number, ok: (x: number, z: number, r: number) => boolean, fn: (x: number, z: number, r: number) => void): void => {
    for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
      const a = R() * TAU, r = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin)), x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (!ok(x, z, r)) continue;
      fn(x, z, r);
      i++;
    }
  };
  // a un lado (fuera del abanico de las compuertas y lejos de ti), con todo lo que ocupa (pad) dentro de la arena y sin pisar nada
  const side = (x: number, z: number, r: number, pad: number): boolean => r + pad < ISL_SHORE - 0.5 && r - pad > 5 && !front(x, z, 5 + pad) && !nearGate(x, z, 4 + pad) && free(x, z, pad);
  const face = (x: number, z: number): number => Math.atan2(-x, -z); // de cara a ti
  // acantilados: una pared de roca detrás de las compuertas, de lado a lado, y algún peñasco más a los lados
  for (let i = 0; i < 7; i++) {
    const n = pick3(R, ['Cliff2', 'Cliff3', 'Cliff4']), sc = 1.6 + R() * 0.5, a = -0.95 + i * 0.32 + (R() - 0.5) * 0.1, r = D + 4 + M.rad(n) * sc;
    add(n, Math.sin(a) * r, -Math.cos(a) * r, sc, R() * TAU);
  }
  for (const s of [-1, 1]) {
    const sc = 2, r = D + 3 + M.rad('Cliff1') * sc, a = s * 1.35;
    add('Cliff1', Math.sin(a) * r, -Math.cos(a) * r, sc, R() * TAU, M.rad('Cliff1') * sc);
  }
  // las casas, el aserradero y un huerto de barriles, a los lados y algo por detrás de las compuertas, de cara a la playa
  const houses: [string, number, number][] = [['House1', -14, 2], ['House3', 14, -2], ['House2', -12, 9], ['Sawmill', 11, 6]];
  for (const [n, x, z] of houses) {
    const pad = M.rad(n);
    if (side(x, z, Math.hypot(x, z), pad)) add(n, x, z, 1, face(x, z) + (R() - 0.5) * 0.3, pad);
  }
  // huesos gigantes y calaveras: a un lado, medio enterrados
  if (side(-7, 14, 15.7, M.rad('LargeBones'))) add('LargeBones', -7, 14, 1, R() * TAU, M.rad('LargeBones'));
  if (side(9, 13, 15.8, M.rad('Skulls') * 0.8)) add('Skulls', 9, 13, 0.8, face(9, 13), M.rad('Skulls') * 0.8);
  // palmeras: muchas, por los lados y detrás de ti, hasta la orilla
  scatter(26, 6, ISL_SHORE - 2, (x, z, r) => side(x, z, r, 1.8), (x, z) => {
    const n = pick3(R, ['PalmTree_1', 'PalmTree_2', 'PalmTree_3']), s = 1.6 + R() * 0.6;
    add(n, x, z, s, R() * TAU, 1.6);
    solid(n, x, z, s);
  });
  // rocas, barriles, cofres, un cañón mirando al mar, un ancla, cubos, botellas, calaveras y balas de cañón
  scatter(14, 6, ISL_SHORE - 2, (x, z, r) => side(x, z, r, 1), (x, z) => {
    const n = `Rock_${1 + Math.floor(R() * 5)}`, s = 0.8 + R() * 1.6;
    add(n, x, z, s, R() * TAU, 1);
    solid(n, x, z, s);
  });
  scatter(10, 6, 16, (x, z, r) => side(x, z, r, 0.8), (x, z) => {
    const n = pick3(R, ['Barrel', 'Barrel', 'Bucket', 'Chest_Closed', 'Chest_Gold']);
    add(n, x, z, 0.9, R() * TAU, 0.8);
    solid(n, x, z, 0.9);
  });
  scatter(12, 5.5, 16, (x, z, r) => side(x, z, r, 0.4), (x, z) => add(pick3(R, ['Skull', 'Bottle_1', 'CannonBall', 'CannonBall', 'Bomb']), x, z, 0.7 + R() * 0.3, R() * TAU, 0.4));
  for (const s of [-1, 1]) {
    const x = s * 7.5, z = 7;
    if (side(x, z, Math.hypot(x, z), 1.5)) {
      add('Cannon', x, z, 1, Math.atan2(x * 0.3, 1), 1.5);
      solid('Cannon', x, z, 1);
    }
  }
  if (side(4, 12, 12.6, 1.5)) add('Anchor', 4, 12, 1.2, R() * TAU, 1.2);
  // el muelle: desde la orilla, detrás de ti, mar adentro, con sus postes; al final, el barco pequeño; mar adentro, el grande
  // (las tablas, a 1 m sobre la base de sus postes: se hunden para quedar a ras de la arena y sobre el agua)
  const dx = 3.5;
  for (let i = 0; i < 7; i++) add(i === 4 ? 'Dock_Broken' : 'Dock', dx, ISL_SHORE - 3 + i * 2.6, 1, 0, 0, -0.75);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add('Dock_Pole', dx + s * 1.2, ISL_SHORE - 2 + i * 4.3, 1, 0, 0, -0.75);
  add('ShipSmall', dx + 5, ISL_SHORE + 13, 1.1, Math.PI * 0.55);
  add('ShipLarge', -18, ISL_SHORE + 26, 1.3, Math.PI * 0.35);
  add('ShipLarge', 34, 30, 1.0, -Math.PI * 0.2);
  return { puts, solids };
}

/* ------------------------------------------------------------------ los mundos de la Travesía, en Combate (RepArena XR) */
// (pedidos por el usuario: el risco, las islas en el cielo y la aldea, con los kits que ya hay; lo grande, siempre fuera del
// abanico de las compuertas y lejos de ti, como en el bosque y la isla)

type Layout = { puts: Put[]; solids: { x: number; z: number; r: number }[] };

function kit(D: number, gates: Gate[], M: Models, seed: number) {
  const R = rng(seed), puts: Put[] = [], taken: { x: number; z: number; r: number }[] = [], solids: { x: number; z: number; r: number }[] = [];
  const front = (x: number, z: number, extra: number): boolean => Math.abs(Math.atan2(x, -z)) < 0.8 && Math.hypot(x, z) < D + extra;
  const nearGate = (x: number, z: number, r: number): boolean => gates.some((g) => Math.hypot(g.x - x, g.z - z) < r);
  const free = (x: number, z: number, r: number): boolean => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
  const add = (n: string, x: number, z: number, s: number, ry = R() * TAU, r = 0, y = 0): void => {
    if (!M.has(n)) return;
    puts.push({ n, x, y, z, s, ry });
    if (r) taken.push({ x, z, r });
    if (r && Math.hypot(x, z) < D + 4) solids.push({ x, z, r: M.foot(n) * s });
  };
  const scatter = (count: number, rMin: number, rMax: number, ok: (x: number, z: number, r: number, a: number) => boolean, fn: (x: number, z: number, r: number, a: number) => void): void => {
    for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
      const a = R() * TAU, r = Math.sqrt(rMin * rMin + R() * (rMax * rMax - rMin * rMin)), x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (!ok(x, z, r, Math.atan2(x, -z))) continue;
      fn(x, z, r, Math.atan2(x, -z));
      i++;
    }
  };
  const side = (x: number, z: number, r: number, pad: number): boolean => r - pad > 5 && !front(x, z, 5 + pad) && !nearGate(x, z, 4 + pad) && free(x, z, pad);
  const face = (x: number, z: number): number => Math.atan2(-x, -z);
  return { R, puts, solids, add, scatter, side, free, face, front, nearGate };
}

/** Hasta dónde llega el suelo del risco y de la isla del cielo (m): más allá, el vacío y el mar de nubes. */
export const CLIFF_EDGE = 21, SKY_EDGE = 17;

/** El risco: una meseta de roca en la montaña; a la izquierda y detrás, la pared de roca y los pinos; a la derecha, el borde y
 * el vacío, con agujas de roca que salen del mar de nubes a lo lejos. */
export function cliffLayout(D: number, gates: Gate[], M: Models): Layout {
  const K = kit(D, gates, M, 71), { R, add, scatter, side } = K;
  // la pared: peñascos grandes a la izquierda y detrás de las compuertas, de lado a lado
  // (los peñascos miden 6-7 m a escala 1: cada uno, entero fuera de la meseta de juego, como poco a 9 m de ti)
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI * 0.95 + i * 0.17 + (R() - 0.5) * 0.08, n = ['Cliff2', 'Cliff3', 'Cliff4'][i % 3], sc = 1.8 + R() * 1.2, rr = M.rad(n) * sc;
    const r = Math.abs(a) < 0.85 ? D + 4 + rr : Math.max(CLIFF_EDGE - 4, rr + 9);
    add(n, Math.sin(a) * r, -Math.cos(a) * r, sc, R() * TAU);
  }
  // a la derecha, más allá del borde, agujas de roca que salen de las nubes
  for (let i = 0; i < 7; i++) {
    const a = 0.9 + i * 0.32 + (R() - 0.5) * 0.15, r = 38 + R() * 30, sc = 3 + R() * 3;
    add(i % 2 ? 'Cliff1' : 'Cliff4', Math.sin(a) * r, -Math.cos(a) * r, sc, R() * TAU, 0, -14 - R() * 6);
  }
  // el borde de la derecha: rocas sueltas; pinos y algún árbol seco a la izquierda, al pie de la pared
  scatter(12, CLIFF_EDGE - 4, CLIFF_EDGE - 1, (x, z, r, a) => a > 0.5 && side(x, z, r, 1), (x, z) => add(`Rock_${1 + Math.floor(R() * 5)}`, x, z, 0.9 + R() * 1.4, R() * TAU, 1));
  scatter(14, 9, CLIFF_EDGE - 3, (x, z, r, a) => a < -0.6 && side(x, z, r, 1.5), (x, z) => add(R() < 0.8 ? ['Pine_2', 'Pine_4', 'Pine_5'][Math.floor(R() * 3)] : 'DeadTree_1', x, z, 0.8 + R() * 0.5, R() * TAU, 1.5));
  scatter(14, 6, CLIFF_EDGE - 2, (x, z, r) => side(x, z, r, 0.8), (x, z) => add(`Rock_Medium_${1 + Math.floor(R() * 3)}`, x, z, 0.3 + R() * 0.5, R() * TAU, 0.8));
  scatter(40, 3, CLIFF_EDGE - 2, (x, z, r) => r > 2 && !K.nearGate(x, z, 2), (x, z) => add(['Grass_Wispy_Short', 'Grass_Common_Short', 'Fern_1'][Math.floor(R() * 3)], x, z, 0.2 + R() * 0.15));
  return { puts: K.puts, solids: K.solids };
}

/** Las islas en el cielo: estás en lo alto de una isla de hierba que flota; alrededor, el borde de rocas y, a lo lejos, otras
 * islas flotando sobre el mar de nubes, algunas con árboles. */
export function skyLayout(D: number, gates: Gate[], M: Models): Layout {
  const K = kit(D, gates, M, 83), { R, add, scatter, side } = K, top = (n: string): number => M.top?.(n) ?? 1;
  // el borde de la isla: rocas todo alrededor (detrás de las compuertas también, que no salen de la nada)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + (R() - 0.5) * 0.1, r = SKY_EDGE - 0.6 + R() * 0.8, n = `Rock_${1 + Math.floor(R() * 5)}`;
    if (!K.nearGate(Math.sin(a) * r, -Math.cos(a) * r, 2.5)) add(n, Math.sin(a) * r, -Math.cos(a) * r, 1 + R() * 1.2, R() * TAU);
  }
  // y bajo el borde, la roca de la isla, que cuelga (se ve al asomarse)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, r = SKY_EDGE - 4;
    add('Cliff1', Math.sin(a) * r, -Math.cos(a) * r, 2.4, R() * TAU, 0, -top('Cliff1') * 2.4 - 0.2);
  }
  // otras islas a lo lejos, a distintas alturas; en lo alto de algunas, árboles
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + (R() - 0.5) * 0.3, r = 32 + R() * 32, sc = 1.2 + R() * 1.6, y = -10 + R() * 16, n = i % 3 ? 'Cliff3' : 'Cliff1';
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    add(n, x, z, sc, R() * TAU, 0, y);
    if (i % 2 === 0) add(['CommonTree_3', 'CommonTree_4', 'Pine_4'][i % 3], x, z, sc * 0.7, R() * TAU, 0, y + top(n) * sc - 0.3);
  }
  // en la isla: árboles a los lados y detrás, arbustos, flores y hierba
  scatter(9, 8, SKY_EDGE - 3, (x, z, r) => side(x, z, r, 2), (x, z) => add(['CommonTree_3', 'CommonTree_4', 'CommonTree_5'][Math.floor(R() * 3)], x, z, 0.8 + R() * 0.4, R() * TAU, 2));
  scatter(10, 5.5, SKY_EDGE - 2, (x, z, r) => side(x, z, r, 1), (x, z) => add(R() < 0.5 ? 'Bush_Common' : 'Bush_Common_Flowers', x, z, 0.45 + R() * 0.3, R() * TAU, 1));
  scatter(110, 1.8, SKY_EDGE - 1, (x, z, r) => r > 1.7 && !K.nearGate(x, z, 2.2), (x, z) => add(['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Flower_3_Group', 'Clover_1'][Math.floor(R() * 5)], x, z, 0.2 + R() * 0.15));
  return { puts: K.puts, solids: K.solids };
}

/** La aldea: un claro con casas alrededor (las del Pirate Kit: casas y el aserradero, de cara a la plaza), barriles y cubos a
 * su puerta, y el bosque detrás. */
export function villageLayout(D: number, gates: Gate[], M: Models): Layout {
  const K = kit(D, gates, M, 97), { R, add, scatter, side, face } = K;
  const houses = ['House1', 'House2', 'House3', 'Sawmill', 'House2', 'House1', 'House3', 'House1'];
  // las casas, en corro, a los lados y detrás de ti (de cara a la plaza)
  let hi = 0;
  scatter(8, 14, 24, (x, z, r) => side(x, z, r, M.rad(houses[hi] ?? 'House1') + 0.5), (x, z) => {
    const n = houses[hi++ % houses.length];
    add(n, x, z, 1, face(x, z) + (R() - 0.5) * 0.25, M.rad(n) + 0.5);
    // a su puerta, unos barriles y un cubo
    for (let j = 0; j < 2; j++) {
      const bx = x * 0.82 + (R() - 0.5) * 2, bz = z * 0.82 + (R() - 0.5) * 2;
      if (side(bx, bz, Math.hypot(bx, bz), 0.6)) add(R() < 0.7 ? 'Barrel' : 'Bucket', bx, bz, 0.9, R() * TAU, 0.6);
    }
  });
  // el bosque detrás de las casas y detrás de las compuertas
  scatter(30, 25, 42, (x, z, r) => !K.nearGate(x, z, 5) && K.free(x, z, 2.5), (x, z) => add(['Pine_2', 'Pine_4', 'Pine_5', 'CommonTree_3', 'CommonTree_4'][Math.floor(R() * 5)], x, z, 0.9 + R() * 0.5, R() * TAU, 2.5));
  scatter(10, 6, 14, (x, z, r) => side(x, z, r, 1.2), (x, z) => add(R() < 0.6 ? 'Bush_Common' : 'Bush_Common_Flowers', x, z, 0.45 + R() * 0.3, R() * TAU, 1.2));
  scatter(140, 1.8, 22, (x, z, r) => r > 1.7 && !K.nearGate(x, z, 2.2), (x, z) => add(['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Flower_3_Group'][Math.floor(R() * 4)], x, z, 0.2 + R() * 0.15));
  return { puts: K.puts, solids: K.solids };
}
