// Para las pruebas de las manos: enemigos de mentira, la cabeza y las manos puestas a mano, y un entorno del lanzamiento
// que apunta lo que pasa (rayos, avisos, vibraciones y dianas).
import { Vector3 } from 'three';
import { hands, head, mkHand, SIDES, type Side } from '../../src/input/hand-model.js';
import type { Charge, ThrowEnv } from '../../src/input/throw.js';
import type { Target } from '../../src/input/target.js';

export class Dummy implements Target {
  alive = true;
  constructor(
    public pos: Vector3,
    public radius = 0.35,
  ) {}
  center(out: Vector3): Vector3 {
    return out.copy(this.pos);
  }
}

export interface Shot {
  t: number;
  side: Side;
  target: Target;
  o: Vector3;
  d: Vector3;
  c: Charge;
}

export function resetHands(): void {
  for (const s of SIDES) Object.assign(hands[s], mkHand());
  head.p.set(0, 1.6, 0);
  head.q.identity();
  head.prev.copy(head.p);
  head.speed = 0;
}

export function mkEnv(targets: Target[]): ThrowEnv & { shots: Shot[]; says: string[]; buzz: number; locks: Target[] } {
  const env = {
    on: true,
    playing: true,
    byGaze: true,
    sword: false,
    assist: 9,
    bodyFwd: new Vector3(0, 0, -1),
    gaze: new Vector3(0, 0, -1),
    targets,
    shots: [] as Shot[],
    says: [] as string[],
    buzz: 0,
    locks: [] as Target[],
    t: 0,
    fire(side: Side, o: Vector3, d: Vector3, target: Target, c: Charge) {
      env.shots.push({ t: env.t, side, target, o: o.clone(), d: d.clone(), c: { ...c } });
    },
    haptic() {
      env.buzz++;
    },
    say(text: string) {
      env.says.push(text);
    },
    lockShow(e: Target) {
      env.locks.push(e);
    },
  };
  return env;
}

/** La muñeca de una mano (desnuda) en p, vista en este fotograma. */
export function handAt(side: Side, p: Vector3 | null): void {
  const h = hands[side];
  h.isHand = true;
  h.ok = !!p;
  if (p) h.wrist.copy(p);
}
