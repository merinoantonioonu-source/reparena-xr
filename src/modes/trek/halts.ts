/**
 * Las paradas de la Travesía y el juicio de los retos, tal cual en RepArena (src/75_trek.js: TMV/trekMoveStep, TLG/
 * trekLungeStep, trekHaltSay, trekCrumbleT, trekHop, trekHopStep, trekHaltStep, trekAside, trekRockHit, trekRockBurst,
 * trekChestVanish, trekHaltEnd y, de trekStep, el juicio del tronco y la rama y el empezar de cada parada). Ante el cofre,
 * la roca, el arroyo o el desfiladero te paras: lo que te mueve ahora es otro movimiento, contado por la cabeza (salto,
 * sentadilla o la zancada que embiste). Lógica pura, sin IWSDK: lo que se ve y se oye sale en sucesos (env.ts); se compara
 * con el código de RepArena en tests/compare/trek-path.compare.test.ts.
 */
import { HEAD_TOP, TAU, TREK_GEMS, type TrekChip, type TrekEnv, type TrekMove, type TrekObs, type TrekPos, type TrekRock } from './env.js';
import type { Trek } from './path.js';

/** Cómo se llama cada movimiento de las paradas (uno, varios). */
export const TREK_MOVE: Record<TrekMove, [string, string]> = { jump: ['salto', 'saltos'], lunge: ['zancada', 'zancadas'], squat: ['sentadilla', 'sentadillas'] };

/** El movimiento de la parada (RepArena: TMV): de pie ('up'), en el aire ('air') o ya contado abajo ('hit'); `go` lo da
 * por hecho (para las pruebas). */
export interface MoveState {
  st: 'up' | 'air' | 'hit';
  z0: number;
  x0: number;
  go: boolean;
}
/** La zancada que empuja a bandidos y lobos (RepArena: TLG), con su espera entre una y otra. */
export interface LungeState {
  st: 'up' | 'hit';
  z0: number;
  cd: number;
}

const rand = (env: TrekEnv, a: number, b: number): number => a + env.rnd() * (b - a);
const at = (o: TrekObs | null, x: number, y: number, z: number): TrekPos => ({ o, x, y, z });

/** Una roca suelta del Stylized Nature, al azar (RepArena: trekRock: el modelo y el giro de cada pieza, en ese orden). */
export function rockPick(env: TrekEnv, x: number, s: number): TrekRock {
  const n = `Rock_Medium_${1 + Math.floor(env.rnd() * 3)}`, ry: number[] = [], k = env.rockParts ? env.rockParts(n) : 1;
  for (let i = 0; i < k; i++) ry.push(env.rnd() * TAU);
  return { n, x, s, ry };
}

/** En el desfiladero, cuánto aguanta cada pilar contigo encima antes de hundirse (menos en cada tramo y con el rango). */
export const trekCrumbleT = (env: TrekEnv): number => Math.max(2.6, 5.5 - 0.3 * env.wave - 0.15 * env.rank);

/**
 * El movimiento de la parada, contado por la cabeza: salto (subir «Altura del salto» sobre tu altura de pie; cuenta al
 * despegar y el siguiente, al volver al suelo), sentadilla (bajar el 85 % de lo que pide) o zancada (bajar 12 cm con la
 * cabeza 15 cm más adelante: cuenta abajo, al embestir, no al volver).
 */
export function trekMoveStep(tk: Trek): boolean {
  const env = tk.env, H = env.head, M = tk.tmv, up = H.y - env.calibRef, down = env.calibRef - H.y, k = tk.halt ? tk.halt.move : undefined;
  if (M.go) {
    M.go = false;
    return true;
  }
  if (M.st === 'up') {
    if (Math.abs(down) < 0.05) M.z0 += (H.z - M.z0) * 0.1; // (la postura de partida, de pie)
    if (k === 'jump' && up > env.s('jumpHeight') / 100) {
      M.st = 'air';
      return true;
    }
    if (k === 'squat' ? down > (env.dv('squatDepth') / 100) * 0.85 : k === 'lunge' && down > 0.12 && H.z < M.z0 - 0.15) {
      M.st = 'hit';
      return true;
    }
    return false;
  }
  if (k === 'jump' ? up < 0.04 : down < 0.07) M.st = 'up';
  return false;
}

/** La zancada hacia delante que empuja a bandidos y lobos: una vez por zancada y, como mucho, una cada 0,9 s. */
export function trekLungeStep(tk: Trek, dt: number): boolean {
  const env = tk.env, H = env.head, L = tk.tlg;
  L.cd -= dt;
  const down = env.calibRef - H.y;
  if (L.st === 'up') {
    if (down < 0.05) L.z0 += (H.z - L.z0) * Math.min(1, dt * 6);
    if (down > 0.12 && H.z < L.z0 - 0.15) {
      L.st = 'hit';
      if (L.cd <= 0) {
        L.cd = 0.9;
        return true;
      }
    }
    return false;
  }
  if (down < 0.07) L.st = 'up';
  return false;
}

/** Lo que toca hacer en la parada (al llegar, el aviso largo). */
export function trekHaltSay(tk: Trek, o: TrekObs, first = false): void {
  if (o.kind === 'bandit') {
    tk.say(first ? '¡Bandidos! Esquiva sus piedras (agáchate, salta o apártate) o empújalos con una zancada' : '¡Esquiva sus piedras!', '#ff8a3d', first ? 2.8 : 1.2);
    return;
  }
  const [one, many] = TREK_MOVE[o.move as TrekMove], left = (o.need || 0) - (o.got || 0), n = `${left} ${left === 1 ? one : many}`;
  const sides = o.sides || [];
  tk.say(
    o.kind === 'chest'
      ? first ? `¡Un cofre! Rompe sus cadenas: ${n}. Dentro, una llave: con 3, el tesoro (+1500)` : `¡Rompe las cadenas: ${n}!`
      : o.kind === 'stream'
        ? `${first ? 'Cruza el arroyo: ' : ''}¡salta a la piedra de la ${sides[o.got || 0] < 0 ? 'izquierda' : 'derecha'}!`
        : o.kind === 'chasm'
          ? first ? `¡Desfiladero! Salta de roca en roca: ${n}` : `¡Salta! Quedan ${left}`
          : `¡Embiste la roca: ${n}!`,
    '#ffd166',
    first ? 2.4 : 1.4,
  );
}

/** El pilar i del desfiladero se hunde. */
function sink(tk: Trek, o: TrekObs, i: number): void {
  if (o.sunk) o.sunk[i] = true;
  tk.ev.push({ t: 'sink', o, i });
}

/** Un paso adelante en el arroyo o el desfiladero: la plataforma se desliza a la piedra o al pilar siguiente (y el mundo
 * baja y sube como si el salto te elevara); en el desfiladero, el pilar que dejas se hunde. */
export function trekHop(tk: Trek, o: TrekObs, ok: boolean): void {
  o.got = (o.got || 0) + 1;
  const step = o.step || 0;
  tk.glide += step;
  tk.hop = { t: 0, dur: step / 1.8 };
  o.pt = 0;
  const wp = at(o, 0, 0.2, (o.stop || 0) - o.got * step);
  tk.ev.push({ t: 'hop', o, ok });
  if (o.kind === 'stream') {
    tk.snd('whoosh', wp, 'arc');
    tk.fx('sparks', wp, 18, [0.6, 0.85, 1], 1.6, 0.03);
  } else {
    const i = o.got - 2, p = o.pillars && o.pillars[i];
    if (p && !(o.sunk && o.sunk[i])) sink(tk, o, i);
    if (ok) tk.snd('whoosh', wp, 'arc');
  }
}

/** La sensación de saltar: mientras vas de una piedra a la siguiente, el mundo baja y vuelve a subir (hasta 22 cm); la
 * plataforma, contigo (tk.hopY: lo que baja el mundo; la plataforma, lo contrario). */
export function trekHopStep(tk: Trek, dt: number): void {
  const H = tk.hop;
  let y = 0;
  if (H) {
    H.t += dt;
    const k = H.t / H.dur;
    if (k >= 1) tk.hop = null;
    else y = -0.22 * Math.sin(Math.PI * k);
  }
  tk.hopY = y;
}

/** La parada de ahora, en cada fotograma. */
export function trekHaltStep(tk: Trek, dt: number, t: number): void {
  const o = tk.halt, env = tk.env;
  if (!o) return;
  if (env.state !== 'play') {
    if (env.state === 'rest' || env.state === 'end') trekHaltEnd(tk, o, false);
    return;
  }
  o.haltT = (o.haltT || 0) + dt;
  if (o.kind === 'bandit') {
    if (tk.hooks.bandFight) tk.hooks.bandFight(o, dt, t);
    return;
  }
  const need = o.need || 0;
  if (o.len) {
    // el arroyo y el desfiladero: cada movimiento, un paso
    if (trekMoveStep(tk)) {
      tk.score(60);
      tk.haptic(0.5, 60);
      trekHop(tk, o, true);
      if ((o.got || 0) >= need) trekHaltEnd(tk, o, true);
      else trekHaltSay(tk, o);
      return;
    }
    if (o.kind === 'chasm' && (o.got || 0) >= 1) {
      // en un pilar: tiembla y, si tardas, se hunde contigo (una vida, solo la primera vez) y te lleva al siguiente
      const i = (o.got || 0) - 1, p = o.pillars && o.pillars[i], T = trekCrumbleT(env);
      o.pt = (o.pt || 0) + dt;
      if (p && o.pt > T * 0.55) {
        o.shakeX = Math.sin(t * 45) * 0.025 * (o.pt / T);
        if ((o.cr = (o.cr || 0) - dt) <= 0) {
          o.cr = 0.35;
          tk.haptic(0.3, 40);
          if (o.pt > T * 0.75) tk.say('¡Se desmorona! ¡Salta!', '#ff8a3d', 0.8);
        }
      }
      if (o.pt > T) {
        if (!o.fell) {
          o.fell = true;
          tk.ev.push({ t: 'hurt' });
          tk.say('¡Se hundió la roca! −1 vida', '#ff3b5c', 1.8);
        } else {
          tk.ev.push({ t: 'combo0' });
          tk.say('¡Se hundió! Salta antes', '#ff8a3d', 1.4);
        }
        if (p) sink(tk, o, i);
        trekHop(tk, o, false);
        if ((o.got || 0) >= need) trekHaltEnd(tk, o, true);
      }
    }
    if ((o.haltT || 0) > 40 && o.got === 0 && tk.halt === o) {
      tk.say(o.kind === 'stream' ? 'Vadeas el arroyo' : 'Rodeas el desfiladero', '#a49fc8', 1.6);
      trekHaltEnd(tk, o, false);
    }
    return;
  }
  // (la roca, sólida y quieta: RepArena le borraba cualquier movimiento; aquí no se mueve nunca)
  if (trekMoveStep(tk)) {
    o.got = (o.got || 0) + 1;
    tk.score(60);
    tk.haptic(0.5, 60);
    if (o.kind === 'chest') {
      const wp = at(o, 0, 0.6, 0);
      tk.ev.push({ t: 'links', o, cut: Math.ceil(((o.links || 0) * o.got) / need) });
      tk.snd('metalHit', wp, true);
      tk.fx('sparks', wp, 24, [1, 0.85, 0.5], 2.2, 0.03);
    } else trekRockHit(tk, o); // (la roca no se mueve: el golpe se ve en su cara y retumba; se rompe en la última)
    if (o.got >= need) trekHaltEnd(tk, o, true);
    else trekHaltSay(tk, o);
  }
  if ((o.haltT || 0) > 40 && tk.halt === o) {
    tk.say(o.kind === 'chest' ? 'Dejas el cofre atrás' : 'Rodeas la roca', '#a49fc8', 1.6);
    trekHaltEnd(tk, o, false);
  }
}

/** La roca o el cofre que no se superan no se atraviesan: se apartan a un lado, despacio, antes de seguir. */
export function trekAside(tk: Trek, o: TrekObs): void {
  if (o.kind !== 'rock' && o.kind !== 'chest') return;
  o.asideTo = (o.side || 1) * ((o.rr || 0.8) + 1.4);
  const wp = at(o, 0, 0.3, 0);
  tk.ev.push({ t: 'aside', o });
  tk.fx('dust', wp, 10, 0.4);
  tk.snd('step', wp, true);
}

/** Una lasca de la roca (su roca, su sitio, su velocidad y su giro, en el orden del azar de RepArena). */
function chip(env: TrekEnv, s: number, p: () => { x: number; y: number; z: number }, v: [number, number, number, number, number, number]): TrekChip {
  const rock = rockPick(env, 0, s), pos = p();
  return { rock, p: pos, v: { x: rand(env, v[0], v[1]), y: rand(env, v[2], v[3]), z: rand(env, v[4], v[5]) }, w: { x: rand(env, -6, 6), y: rand(env, -6, 6), z: rand(env, -6, 6) } };
}

/** Cada embestida se ve en la cara de la roca (destello, polvo y lascas que saltan hacia ti) y retumba. */
export function trekRockHit(tk: Trek, o: TrekObs): void {
  const env = tk.env, f = at(o, rand(env, -0.25, 0.25), rand(env, 0.5, 1.0), (o.rr || 1) * 0.92); // (en su cara, a la altura del golpe)
  // (RepArena calculaba la cara en el mismo vector que el golpe sordo: suena allí, no en el centro)
  tk.snd('step', f, true);
  tk.snd('metalHit', f, false);
  tk.fx('glow', f, [1, 0.85, 0.6], 0.45, 0.14);
  tk.fx('sparks', f, 14, [1, 0.8, 0.5], 1.6, 0.025);
  tk.fx('dust', f, 10, 0.35);
  tk.fx('smoke', at(o, f.x, 0.2, f.z), 0.4, 0.4, 1.4);
  const chips: TrekChip[] = [];
  for (let i = 0; i < 3; i++) chips.push(chip(env, rand(env, 0.08, 0.16), () => ({ x: f.x, y: f.y, z: f.z }), [-1.2, 1.2, 1.5, 3, 0.8, 2]));
  tk.ev.push({ t: 'chips', o, chips });
}

/** En la última embestida, la roca se hace añicos que saltan por los aires. */
export function trekRockBurst(tk: Trek, o: TrekObs): void {
  const env = tk.env, c = at(o, 0, 0.7, 0);
  tk.ev.push({ t: 'rockBurst', o });
  tk.snd('explosion', c, false);
  tk.snd('step', c, true);
  tk.fx('smoke', c, 1.1, 0.6, 2.4);
  tk.fx('dust', c, 18, 0.5);
  tk.haptic(0.9, 160);
  const chips: TrekChip[] = [];
  for (let i = 0; i < 12; i++) chips.push(chip(env, rand(env, 0.18, 0.4), () => ({ x: rand(env, -0.5, 0.5), y: rand(env, 0.3, 1.1), z: rand(env, -0.4, (o.rr || 1) * 0.6) }), [-2.5, 2.5, 2.5, 5.5, -1.5, 2.2]));
  tk.ev.push({ t: 'chips', o, chips });
}

/** El cofre abierto se queda un momento (con el oro a la vista) y se esfuma en una nube de humo. */
export function trekChestVanish(tk: Trek, dt: number): void {
  for (const o of tk.obs) {
    if (!((o.vanish || 0) > 0)) continue;
    o.vanish = (o.vanish || 0) - dt;
    if (o.vanish > 0) continue;
    const c = at(o, 0, 0.4, 0);
    tk.fx('smoke', c, 0.9, 0.5, 1.8, 0.75);
    tk.fx('smoke', c, 0.7, 0.8, 1.4, 0.85);
    tk.fx('sparks', c, 24, [1, 0.85, 0.4], 1.6, 0.03);
    tk.snd('whoosh', c, 'arc');
    tk.ev.push({ t: 'vanish', o });
  }
}

/** Se acaba la parada: ganada, con su premio; si no, el reto se aparta (y al otro lado del arroyo, también a medias). */
export function trekHaltEnd(tk: Trek, o: TrekObs, won: boolean): void {
  tk.halt = null;
  o.done = true;
  o.judged = true;
  o.side = o.side || 1;
  if (!won) trekAside(tk, o);
  if (o.exit) tk.glide = Math.max(0, o.exit - tk.dist); // (al otro lado)
  if (o.kind === 'bandit') {
    tk.ev.push({ t: 'bandLeave', o });
    for (const b of o.bandits || []) if (b.st !== 'down' && b.st !== 'gone') {
      b.st = 'leave';
      b.t = 0;
    } // (los que quedan se van)
  }
  tk.ev.push({ t: 'haltEnd', o, won });
  if (!won) return;
  if (o.kind === 'bandit') {
    tk.ducked++;
    tk.score(300 * (o.bandits || []).length);
    tk.cheer('¡Camino libre!', '#3cf0c6', 1.6);
    tk.snd('victory', null);
    return;
  }
  if (o.kind === 'stream') {
    tk.ducked++;
    tk.score(300);
    tk.cheer('¡Arroyo cruzado!', '#3cf0c6', 1.4);
    return;
  }
  if (o.kind === 'chasm') {
    if (!o.fell) tk.ducked++;
    tk.score(o.fell ? 100 : 400);
    tk.cheer(o.fell ? 'Desfiladero cruzado' : '¡Desfiladero cruzado sin caer!', '#3cf0c6', 1.6);
    return;
  }
  if (o.kind === 'chest') {
    // dentro, una llave (con tres, el tesoro del tramo) y una gema para tu colección
    tk.ev.push({ t: 'chestOpen', o });
    o.vanish = 1.4; // (abierto un momento; luego se esfuma)
    tk.keys++;
    tk.got++;
    tk.score(400);
    const gems = ((tk.env.store(TREK_GEMS) as number) || 0) + 1;
    tk.ev.push({ t: 'store', key: TREK_GEMS, val: gems });
    tk.snd('victory', null);
    tk.cheer(`¡Cofre abierto! Llave ${tk.keys}/3 · gema ${gems}`, '#ffd166', 2.2);
    // lo que da, en su propio aviso grande: cuánto y cuánto falta para el tesoro
    if (tk.keys >= 3) {
      tk.keys = 0;
      tk.score(1500);
      tk.ev.push({ t: 'trophy', title: '¡TESORO DEL TRAMO!', sub: `Tres llaves: +1500 puntos (y +400 del cofre). Gema nº ${gems} para tu colección` });
    } else tk.ev.push({ t: 'trophy', title: '¡COFRE ABIERTO!', sub: `+400 puntos y la llave ${tk.keys} de 3: ${3 - tk.keys === 1 ? 'una más' : 'dos más'} y abres el tesoro del tramo (+1500). Gema nº ${gems}` });
  } else {
    tk.ducked++;
    tk.score(300);
    trekRockBurst(tk, o);
    tk.cheer('¡Roca hecha añicos!', '#3cf0c6', 1.4);
  }
}

/**
 * El juicio de cada reto al pasar por ti (RepArena: el bucle de trekStep). `z` es su distancia como si el sendero fuera
 * recto; `step`, lo que has avanzado en este fotograma. El tronco se salta (cuenta lo más alto que llegaste mientras
 * pasaba bajo ti); la rama, agachándote (la coronilla por debajo); los que no, frenan y rompen la racha, sin quitar vidas.
 * El cofre, la roca, el arroyo y el desfiladero, al llegar, te paran.
 */
export function trekJudge(tk: Trek, o: TrekObs, z: number, step: number): void {
  const env = tk.env, H = env.head;
  if (o.kind === 'log') {
    if (z - H.z > -4 && z - H.z < -3.9 + step) tk.say('¡Salta!', '#ffd166', 1.2);
    if (Math.abs(z - H.z) < 0.45) o.maxUp = Math.max(o.maxUp, H.y - env.calibRef);
    if (z >= H.z + 0.45) {
      o.judged = true;
      const p = at(null, 0, 0.2, z);
      if (o.maxUp < env.s('jumpHeight') / 100) {
        tk.v *= 0.2;
        tk.ev.push({ t: 'combo0' });
        tk.hits++;
        tk.turboSet(false);
        tk.snd('metalHit', p, false);
        tk.haptic(0.8, 120);
        tk.say('¡Salta el tronco!', '#ff8a3d', 1.6);
      } else {
        tk.ducked++;
        tk.score(150);
        tk.snd('whoosh', p, 'arc');
        tk.cheer('¡Saltado!', '#3cf0c6', 0.9);
      }
    }
  } else if (o.kind === 'branch') {
    if (z - H.z > -4 && z - H.z < -3.9 + step) tk.say('¡Agáchate!', '#ffd166', 1.2);
    if (z >= H.z - 0.1) {
      o.judged = true;
      const p = at(null, 0, o.y, z);
      if (H.y + HEAD_TOP > o.y) {
        tk.v = 0;
        tk.ev.push({ t: 'combo0' });
        tk.hits++;
        tk.turboSet(false);
        tk.snd('metalHit', p, false);
        tk.haptic(0.8, 120);
        tk.say('¡Agáchate bajo las ramas!', '#ff8a3d', 1.6);
      } else {
        tk.ducked++;
        tk.score(120);
        tk.snd('whoosh', p, 'arc');
        tk.cheer('¡Esquivada!', '#3cf0c6', 0.9);
      }
    }
  } else if (!o.done && o.at - tk.dist <= (o.stop || 1.7) && tk.halt !== o) {
    // (el cofre, la roca, el arroyo, el desfiladero o los bandidos, delante: te paras)
    tk.halt = o;
    o.got = 0;
    o.haltT = 0;
    tk.v = 0;
    tk.glide = 0;
    tk.dist = o.at - (o.stop || 1.7);
    tk.tmv.st = 'up';
    tk.tmv.x0 = H.x;
    tk.tmv.z0 = H.z;
    trekHaltSay(tk, o, true);
    if (o.len && tk.hooks.chasing && tk.hooks.chasing() && tk.hooks.chaseEnd) tk.hooks.chaseEnd(o.kind === 'stream' ? 'Los lobos no cruzan el agua' : 'Los lobos se quedan al borde', '#3cf0c6'); // (no te siguen)
  }
}
