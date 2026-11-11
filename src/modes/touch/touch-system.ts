/**
 * El modo Toques en la partida (RepArena: src/74_touch.js y la parte de Toques de src/70_game.js): vienen aros de neón que
 * hay que atravesar con la cabeza, diamantes que se tocan con la mano de su color y pulsadores en el suelo que se golpean;
 * cada uno obliga a moverse (sentadilla profunda, zancada, salto, estirarse), y entre un toque y el siguiente hay que volver
 * a la postura de partida. Cómo salen, llegan y se juzgan lo dice la lógica pura (targets.ts, wave.ts), comparada con
 * RepArena; aquí se pintan, suenan y puntúan. Cada toque cuenta una repetición (sin disparo): la partida (GameSystem) suma
 * los puntos y pasa las oleadas con lo que este sistema le dice (`waveLeft`). Sin espadas aún (llegan con el PR 9: los
 * bloques se vuelven diamantes, como en RepArena sin mandos).
 */
import { CanvasTexture, createSystem, Group, Vector3 } from '@iwsdk/core';
import type { Material, Mesh, Object3D } from '@iwsdk/core';
import { SND } from '../../audio/sound.js';
import { dv, waveReps } from '../../core/settings.js';
import { GAME, HOOKS, VIEW } from '../../core/state.js';
import { num, settings, str } from '../../core/values.js';
import { GateSystem } from '../../combat/gates.js';
import { hands, head, type Side } from '../../input/hand-model.js';
import { haptic } from '../../input/hand-system.js';
import { createTouchGem, createTouchPad, createTouchRing, type TouchGemParts, type TouchPadParts, type TouchRingParts } from '../../scene-assets/touch.scene-asset.js';
import type { TouchEnv } from './env.js';
import { TCH_COL, TouchTarget, mkTouch, tchPeriod, type TouchState } from './targets.js';
import { buildTouchWave, frontGates, touchClear, touchLeft, touchStartWave, touchStep, type TouchSpec } from './wave.js';

/** Lo que se ve de cada objetivo. */
interface Entry {
  t: TouchTarget;
  grp: Group;
  ring?: TouchRingParts;
  gem?: TouchGemParts;
  pad?: TouchPadParts;
  own: Material[];
}

/** La silueta de una mano vista por el dorso (como la ves al tocar), del color de esa mano, con su inicial (D o I). */
const iconTex = new Map<Side, CanvasTexture>();
function handIcon(side: Side): CanvasTexture {
  const hit = iconTex.get(side);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d') as CanvasRenderingContext2D, col = '#' + TCH_COL[side].toString(16).padStart(6, '0');
  const rr = (X: number, Y: number, w: number, h: number, r: number): void => {
    x.beginPath();
    x.moveTo(X + r, Y);
    x.arcTo(X + w, Y, X + w, Y + h, r);
    x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r);
    x.arcTo(X, Y, X + w, Y, r);
    x.closePath();
  };
  const shape = (): void => {
    x.save();
    if (side === 'left') {
      x.translate(128, 0);
      x.scale(-1, 1);
    }
    rr(30, 56, 66, 58, 20);
    x.fill();
    x.stroke();
    for (const [fx, fy, fh] of [[34, 20, 50], [51, 9, 58], [68, 11, 56], [85, 22, 46]]) {
      rr(fx, fy, 14, fh, 7);
      x.fill();
      x.stroke();
    }
    x.save();
    x.translate(34, 86);
    x.rotate(-0.9);
    rr(-7, -38, 14, 38, 7);
    x.fill();
    x.stroke();
    x.restore();
    x.restore();
  };
  x.lineWidth = 8;
  x.strokeStyle = x.fillStyle = 'rgba(10,8,20,0.85)'; // (el contorno oscuro: se lee sobre cualquier fondo)
  shape();
  x.lineWidth = 0.01;
  x.strokeStyle = x.fillStyle = col;
  shape();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = '56px Bungee, sans-serif';
  x.lineWidth = 7;
  x.strokeStyle = 'rgba(10,8,20,0.9)';
  const ch = side === 'left' ? 'I' : 'D';
  x.strokeText(ch, 63, 88);
  x.fillStyle = '#fff';
  x.fillText(ch, 63, 88);
  const t = new CanvasTexture(c);
  iconTex.set(side, t);
  return t;
}

export class TouchSystem extends createSystem({}) {
  private root = new Group();
  private readonly env: TouchEnv;
  private tch: TouchState;
  private queue: TouchSpec[] = [];
  private entries: Entry[] = [];
  private clock = 0;
  private standY = 1.6;
  private gates: GateSystem | null = null;
  private readonly tmp = new Vector3();

  constructor(...a: ConstructorParameters<ReturnType<typeof createSystem>>) {
    super(...a);
    const self = this;
    this.env = {
      s: (k) => num(k),
      str: (k) => str(k),
      dv: (k) => dv(k, GAME.ramp),
      rnd: Math.random,
      now: () => performance.now() / 1000,
      get state() {
        return GAME.paused ? 'paused' : GAME.wave > 0 ? (GAME.between ? 'rest' : 'play') : 'ready';
      },
      head: head.p,
      get headSpeed() {
        return head.speed;
      },
      hands,
      toArena: (v) => v, // (la arena es el mundo: tú en el origen, mirando a −Z)
      ar: false, // (la realidad mixta llega con el PR 21)
      get standY() {
        return self.standY;
      },
      swordActive: () => false, // (las espadas llegan con el PR 9)
      swordCut: () => null,
      waveReps: (i) => waveReps(i),
    };
    this.tch = mkTouch(this.env);
  }

  init(): void {
    this.world.createTransformEntity(this.root);
    this.gates = this.world.getSystem(GateSystem) ?? null;
  }

  private get on(): boolean {
    return settings.mode === 'touch';
  }

  // ---------------------------------------------------------------- la ronda y las oleadas (las llama la partida)

  /** Empieza la ronda: todo a cero y tu altura de partida. */
  begin(): void {
    this.clear();
    this.tch = mkTouch(this.env);
    if (head.p.y > 1.1) this.standY = head.p.y;
    this.tch.ref = head.p.y;
  }

  /** La postura de partida tomada (al calibrar en el suelo o sentado): la altura de la cabeza ahora. */
  calibrated(y: number): void {
    this.tch.ref = y;
  }

  /** Empieza la oleada i (RepArena: buildTouchWave y touchStartWave); `intro`, lo que dura el panel de la oleada. */
  startWave(i: number, intro: number): void {
    this.queue = buildTouchWave(this.tch, i);
    touchStartWave(this.tch);
    this.tch.nextArrive += intro; // (que lleguen cuando se va el panel)
  }

  /** ¿Queda algo de esta oleada por salir o por tocar? */
  waveLeft(): boolean {
    return this.queue.length > 0 || touchLeft(this.tch);
  }

  /** Lo que se enseña en el marcador. */
  hud(): { left: number } {
    return { left: this.queue.length + this.tch.touches.filter((x) => x.alive && !x.judged).length };
  }

  /** Quita todo (al empezar o acabar la ronda, o al salir de Toques). */
  clear(): void {
    this.queue.length = 0;
    touchClear(this.tch);
    for (const e of this.entries) this.free(e);
    this.entries.length = 0;
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number): void {
    this.clock += dt;
    if (!this.on) {
      if (this.entries.length) this.clear();
      return;
    }
    if (GAME.phase !== 'playing' || VIEW.duel) return;
    const evs = touchStep(this.tch, this.queue, dt, this.clock);
    for (const ev of evs) this.apply(ev);
    this.openFront();
    for (const e of this.entries) this.paint(e, dt);
  }

  // las compuertas de delante, por donde llegan, abiertas mientras dura la oleada
  private openFront(): void {
    const gs = this.gates;
    if (!gs || !this.tch.gatesOpen) return;
    const live: { x: number; z: number; e: ReturnType<GateSystem['freeGate']> }[] = [];
    for (const e of gs.queries.gates.entities) {
      const f = gs.frame(e, { x: 0, z: 0, ry: 0, scale: 1 });
      live.push({ x: f.x, z: f.z, e });
    }
    for (const g of frontGates(live)) if (g.e) gs.openGate(g.e, 0.6);
  }

  private apply(ev: import('./env.js').TouchEvent): void {
    switch (ev.type) {
      case 'spawn':
        this.add(ev.t);
        break;
      case 'hint':
        HOOKS.say(ev.text, '#ffd166', 1.1, true);
        break;
      case 'haptic':
        haptic(ev.side, ev.v, ev.ms);
        break;
      case 'charge':
        SND.charge();
        break;
      case 'tick':
        SND.tick();
        break;
      case 'hold':
        HOOKS.say(`Aguanta ${ev.left}`, '#ffd166', 0.6, true);
        SND.beep(ev.beep);
        break;
      case 'hit':
        this.hit(ev.t, ev.perfect, ev.text, ev.color);
        break;
      case 'miss':
        if (ev.hurt) {
          HOOKS.playerHit(1, true);
          HOOKS.say(ev.text, '#ff3b5c', 1.1, true);
        }
        break;
      case 'gone': {
        const i = this.entries.findIndex((e) => e.t === ev.t);
        if (i >= 0) {
          this.free(this.entries[i]);
          this.entries.splice(i, 1);
        }
        break;
      }
    }
  }

  /** Tocado: una repetición (sin disparo), el aviso y el estallido de su color. */
  private hit(t: TouchTarget, perfect: boolean, text: string, color: string): void {
    const at = this.tmp.copy(t.at), col = t.part === 'head' ? TCH_COL.head : TCH_COL[t.hand];
    HOOKS.arcRep(perfect);
    GAME.kills++;
    HOOKS.say(text, color, 0.8, false);
    if (perfect) SND.perfect();
    if (t.part === 'head') {
      SND.pop(at, !!t.hold);
      SND.zap(at);
      SND.shock(at);
      HOOKS.sparks(at, 46, col);
      return;
    }
    const side = t.by || t.hand;
    haptic(side, 0.5, 50);
    if (t.move === 'floor') {
      SND.step(at, true);
      SND.pop(at, false);
      HOOKS.sparks(at, 22, col);
      haptic(side, 0.8, 70);
      return;
    }
    SND.pop(at, false);
    HOOKS.sparks(at, 12, col);
  }

  // ---------------------------------------------------------------- lo que se ve

  private add(t: TouchTarget): void {
    const e: Entry = { t, grp: new Group(), own: [] };
    if (t.part === 'head') {
      const p = createTouchRing(TCH_COL.head);
      e.ring = p;
      e.grp = p.grp;
      e.own = p.own;
      p.halo.scale.setScalar(t.r * 3.6);
      p.chev.scale.setScalar(t.r * 1.25);
      p.ring.scale.setScalar(t.r * 1.25);
    } else if (t.move === 'floor') {
      const p = createTouchPad(TCH_COL[t.hand]);
      e.pad = p;
      e.grp = p.grp;
      e.own = p.own;
      p.iconMat.map = handIcon(t.hand);
    } else {
      const p = createTouchGem(TCH_COL[t.hand]);
      e.gem = p;
      e.grp = p.grp;
      e.own = p.own;
      p.iconMat.map = handIcon(t.hand);
    }
    e.grp.position.copy(t.from);
    this.root.add(e.grp);
    this.entries.push(e);
  }

  private paint(e: Entry, dt: number): void {
    const t = e.t, tt = this.clock, P = tchPeriod(this.env);
    const ph = P ? ((((this.env.now() - this.tch.beat0) / P) % 1) + 1) % 1 : 1, pulse = P ? Math.exp(-ph * 6) : 0;
    e.grp.position.copy(t.at);
    const near = t.mode === 'wait' || t.mode === 'hold', f = Math.max(0, 1 - t.popT / 0.5), k = Math.min(1, t.popT / 0.22);
    if (e.ring) {
      const R = e.ring, r = t.r * 1.25;
      e.grp.quaternion.copy(t.q);
      if (t.mode === 'burst') {
        // el aro se abre y las flechas salen despedidas
        R.ring.scale.setScalar(r * (1 + k * 0.8));
        R.chev.scale.setScalar(r * (1 + k));
        R.ringMat.opacity = 1 - k;
        R.haloMat.opacity = 0.4 * (1 - k);
        R.chevMat.opacity = R.glowMat.opacity = 1 - k;
      } else if (t.mode === 'pass') {
        e.grp.scale.setScalar(t.scale);
        R.ringMat.opacity = Math.max(0, f);
        R.haloMat.opacity = Math.max(0, f) * 0.35;
        R.chevMat.opacity = Math.max(0, f);
        R.glowMat.opacity = Math.max(0, f) * 0.25;
      } else {
        R.ring.scale.setScalar(r * (1 + pulse * 0.06));
        // (pegado a los ojos, el halo y las flechas se apagan: taparían la vista)
        const fk = Math.min(1, Math.max(0, (t.at.distanceTo(head.p) - 0.3) / 0.6));
        R.haloMat.opacity = ((near ? 0.5 : 0.32) + pulse * 0.25) * fk;
        R.chevMat.opacity = fk;
        R.glowMat.opacity = ((near ? 0.32 : 0.22) + pulse * 0.2 + 0.1 * Math.random()) * (0.4 + 0.6 * fk);
        if (t.mode === 'hold') {
          // la plancha: se pone blanca según lo aguantado
          const h = t.held / t.hold;
          R.ringMat.color.setRGB(0.62 + 0.38 * h, 0.97 + 0.03 * h, 0.89 + 0.11 * h);
          R.glowMat.color.setRGB(0.24 + 0.76 * h, 0.94 + 0.06 * h, 0.78 + 0.22 * h);
        }
      }
      R.chev.rotation.z -= dt * (near ? 2.2 : 1.1); // (las flechas giran; más deprisa a tu alcance)
    } else if (e.gem) {
      const G = e.gem, s = 1 + pulse * 0.25 + (t.mode === 'wait' ? 0.12 * Math.sin(tt * 9) : 0);
      G.gem.rotation.y += dt * 2.2;
      G.gem.rotation.x = Math.sin(tt * 1.3 + t.ph) * 0.3;
      G.gem.scale.set(0.085 * s, 0.125 * s, 0.085 * s);
      if (t.mode === 'pass') {
        e.grp.scale.setScalar(t.scale);
        G.mat.opacity = Math.max(0, f) * 0.9;
        G.mat.transparent = true;
        G.glowMat.opacity = Math.max(0, f) * 0.7;
        G.iconMat.opacity = Math.max(0, f);
      }
    } else if (e.pad) {
      // late; esperando, la tapa sube y baja llamando a golpearla
      const Pd = e.pad, w = t.mode === 'wait' ? 0.5 + 0.5 * Math.sin(tt * 9) : 0, rp = ((tt + t.ph) * 0.9) % 1;
      Pd.pad.position.y = 0.033 + 0.012 * w;
      if (t.mode !== 'pass') {
        Pd.haloMat.opacity = 0.55 + pulse * 0.3 + 0.25 * w;
        Pd.rippleMat.opacity = 0.7 * (1 - rp);
      } else {
        Pd.rippleMat.opacity = 0;
        e.grp.scale.setScalar(t.scale);
        Pd.mat.opacity = Math.max(0, f);
        Pd.iconMat.opacity = Math.max(0, f);
      }
      Pd.halo.scale.setScalar(0.62 * (1 + pulse * 0.2 + 0.12 * w));
      Pd.ripple.scale.setScalar(1 + rp * 1.6);
    }
  }

  private free(e: Entry): void {
    this.root.remove(e.grp);
    e.grp.traverse((c: Object3D) => {
      const m = c as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of e.own) m.dispose();
  }
}
