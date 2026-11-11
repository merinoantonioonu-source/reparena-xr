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
