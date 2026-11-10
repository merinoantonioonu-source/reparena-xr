/**
 * Los premios en la partida (la lógica, de RepArena, en src/combat/perks.ts):
 *  - las cartas de mejora, en su panel (public/ui/perks.uikitml), delante de ti y a tu alcance, que se pulsa como los menús
 *    (el rayo o el dedo de IWSDK); la oleada siguiente espera a que elijas; si el panel se va sin elegir, vuelve;
 *  - el escudo, el combo de hierro, la escarcha y la onda en cada disparo perfecto, el corazón y la calma;
 *  - el enemigo dorado (un halo dorado que se ve también por delante del cuerpo, y ×3 puntos);
 *  - el relámpago (20 s en los que llegan el doble de seguidos y todo vale el doble);
 *  - el cofre del descanso (el del Pirate Kit), que se abre saltando: una mejora más, una vida o 300 puntos;
 *  - la carrera contra tu récord (en el marcador), que se guarda donde RepArena.
 */
import { AdditiveBlending, AssetManager, CanvasTexture, Entity, Group, Object3D, PokeInteractable, RayInteractable, Sprite, SpriteMaterial, UIKitMLAsset, Vector3, VisibilityState, World } from '@iwsdk/core';
import { chestRoll, Ghost, GHOST_KEY, goldRoll, HIST_KEY, Perks, PERKS, rushPlan, RUSH_SECS, RUSH_SPAWN_K, type PerkNote } from './perks.js';
import type { FoeTarget } from './enemies.js';
import { store } from '../core/settings.js';
import { num, on, settings } from '../core/values.js';
import { GAME } from '../core/state.js';
import { head } from '../input/hand-model.js';
import { SND, unlockAudio } from '../audio/sound.js';
import { haptic } from '../input/hand-system.js';
import { applyFonts } from '../ui/fonts.js';
import { STAND_EX } from '../exercise/standing.js';

/** Lo que los premios piden a la partida. */
export interface RewardHost {
  message(text: string, secs: number): void;
  sparks(p: Vector3, n: number, color: number, speed?: number): void;
  addLife(): boolean;
  /** Un logro en grande (trofeo dorado). */
  trophy(title: string, sub?: string, color?: string): void;
}

// un halo de luz (una textura con un degradado redondo, una sola para todos)
let glowTex: CanvasTexture | null = null;
function glowSprite(color: number, size: number, opacity: number): Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    glowTex = new CanvasTexture(c);
  }
  const s = new Sprite(new SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
}

export class Rewards {
  readonly perks = new Perks();
  readonly ghost = new Ghost();
  /** El relámpago: si va, lo que le queda y cuándo empieza (-1: no toca). */
  readonly rush = { on: false, left: 0, planT: -1 };
  private panel: UIKitMLAsset | null;
  private panelE: Entity | undefined;
  private panelOn = false;
  private home = new Vector3();
  private gold: { t: FoeTarget; s: Sprite }[] = [];
  private goldN = 0;
  private haloGroup = new Group();
  private chest = { on: false, opened: false, t: 0, vy: 0, lastY: 0, g: new Group(), closed: null as Object3D | null, open: null as Object3D | null, glow: null as Sprite | null, said: false };
  private v = new Vector3();
  private f = new Vector3();
  private frost = new Map<FoeTarget, number>();
  standY = 1.6;

  constructor(
    private world: World,
    private host: RewardHost,
  ) {
    world.createTransformEntity(this.haloGroup);
    this.panel = world.getSceneObject<UIKitMLAsset>('perks-panel') ?? null;
    this.panelE = world.getSceneEntity('perks-panel');
    if (this.panel) applyFonts(this.panel);
    this.panelE?.object3D?.getWorldPosition(this.home);
    this.showPanel(false);
    for (let i = 0; i < 3; i++) {
      const el = this.panel?.getElementById('p' + i);
      el?.addEventListener('click', () => {
        unlockAudio();
        SND.click();
        this.pick(i);
      });
    }
    this.chest.g.visible = false;
    world.createTransformEntity(this.chest.g);
  }
  /** Se ha elegido con el descanso ya acabado: la oleada empieza a los 3 s. */
  lateStart = false;

  /** Eliges la carta i (al pulsarla). */
  pick(i: number): void {
    const k = this.perks.offer?.[i];
    if (!k) return;
    this.note(this.perks.take(k));
    SND.combo();
    this.showPanel(false);
    this.lateStart = true; // (elegida tarde: 3 s para prepararte, RepArena: perkTake)
  }

  private perksOn = (): boolean => on('perks') && settings.mode === 'combat';
  private surpriseOn = (): boolean => on('surprises') && settings.mode === 'combat';
  private ghostOn = (): boolean => on('ghost');

  private note(n: PerkNote, secs = 1.8): void {
    if (n) this.host.message(n[0], secs);
  }

  // ---------------------------------------------------------------- la ronda y las oleadas

  roundStart(): void {
    this.perks.reset();
    this.clear();
    this.ghost.reset(settings.mode, settings.exercise, this.ghostOn(), store(GHOST_KEY), store(HIST_KEY));
    this.standY = head.p.y;
  }

  /** Al acabar la ronda: tu mejor ronda, guardada (la misma que en RepArena). */
  roundEnd(): void {
    const g = this.ghost.end(GAME.reps, this.ghostOn(), store(GHOST_KEY));
    if (g) store(GHOST_KEY, g);
    this.clear();
  }

  clear(): void {
    for (const g of this.gold) this.haloGroup.remove(g.s);
    this.gold.length = 0;
    this.goldN = 0;
    this.frost.clear();
    this.rushStop(true);
    this.rush.planT = -1;
    this.chestClear();
    this.showPanel(false);
  }

  waveStart(i: number, bossWave: boolean): void {
    this.perks.waveStart();
    this.goldN = 0;
    this.rush.planT = rushPlan(i, bossWave, this.surpriseOn());
    this.lateStart = false;
  }

  /** Oleada superada (con descanso por delante): las cartas, si te las has ganado, y quizá el cofre. */
  waveCleared(): void {
    this.note(this.perks.waveCleared(GAME.taken, this.perksOn(), GAME.maxLives > 0), 1.6);
    if (chestRoll(this.surpriseOn() && STAND_EX.includes(settings.exercise))) this.chestShow(); // (de pie: se abre saltando)
  }

  /** ¿La oleada siguiente espera? (cartas por elegir) */
  waits(): boolean {
    return this.perks.waits(this.perksOn());
  }

  /** Se acaba el descanso: la que no elegiste, al azar; el cofre se va. */
  restEnd(): void {
    this.note(this.perks.restEnd());
    this.showPanel(false);
    this.chestClear();
  }

  /** En el descanso: las cartas (y que vuelvan si se van), y el cofre. */
  restStep(dt: number, t: number, overdue: boolean): void {
    const ev = this.perks.step(dt, true, GAME.maxLives > 0, this.panelOn);
    if (ev === 'offer' || ev === 'again') {
      this.fillPanel();
      if (ev === 'again' && overdue) this.host.message('Elige una mejora para seguir', 1.6);
    }
    this.chestStep(dt, t);
  }

  /** En plena oleada: el relámpago, el halo de los dorados, la escarcha y la carrera contra tu récord. */
  playStep(dt: number, t: number, playing: boolean): void {
    if (playing) this.rushStep(dt);
    else if (this.rush.on || this.rush.planT > 0) this.rushStop(true);
    for (let i = this.gold.length - 1; i >= 0; i--) {
      const g = this.gold[i];
      if (!g.t.alive) {
        this.haloGroup.remove(g.s);
        this.gold.splice(i, 1);
        continue;
      }
      g.t.center(g.s.position);
      g.s.scale.setScalar(1.7 * (1 + 0.15 * Math.sin(t * 6)));
      if (Math.random() < dt * 18) this.host.sparks(g.s.position, 2, 0xffd966, 1.2);
    }
    for (const [e, ft] of this.frost) {
      if (ft - dt <= 0 || !e.alive) this.frost.delete(e);
      else {
        this.frost.set(e, ft - dt);
        if (Math.random() < dt * 6) this.host.sparks(e.center(this.v), 2, 0x9fe8ff, 0.6);
      }
    }
    if (playing && this.ghost.step(dt, GAME.reps, this.ghostOn())) {
      this.host.message('¡NUEVO RÉCORD!', 2.2);
      this.host.trophy('¡NUEVO RÉCORD!', `Más repeticiones que en tu mejor ronda (${this.ghost.best?.n ?? 0})`);
      SND.combo();
      haptic('left', 0.6, 120);
      haptic('right', 0.6, 120);
      this.host.sparks(this.v.copy(head.p).addScaledVector(GAME.fwd, 1.2), 40, 0xffd14d, 3);
    }
  }

  /** Para el rosco: dónde ibas en tu mejor ronda en este momento. */
  ghostAt(): { g: number; n: number; best: number; beat: boolean } | null {
    return this.ghost.at(GAME.reps, this.ghostOn());
  }

  /** Para el marcador: cuántas llevas de más o de menos que tu récord. */
  ghostText(): PerkNote {
    return this.ghost.text(GAME.reps, this.ghostOn());
  }

  // ---------------------------------------------------------------- lo que cambian

  /** Puntos de una repetición y de un derribo (doble o nada, el relámpago y el dorado). */
  ptsK(perfect: boolean): number {
    return this.perks.ptsK(perfect, this.rush.on);
  }
  killK(t: FoeTarget | null): number {
    return (t && this.isGold(t) ? 3 : 1) * (this.rush.on ? 2 : 1);
  }
  /** Lo deprisa que salen (el relámpago, el doble). */
  spawnK(): number {
    return this.rush.on ? RUSH_SPAWN_K : 1;
  }
  /** Lo que se frena cada enemigo (escarcha y calma). */
  slow(t: FoeTarget): number {
    return this.perks.slow((this.frost.get(t) ?? 0) > 0);
  }

  /** Te van a dar: ¿lo para el escudo? */
  absorb(): boolean {
    if (!this.perks.absorb()) return false;
    this.host.message('¡ESCUDO!', 1.1);
    SND.zap(head.p);
    haptic('left', 0.5, 80);
    haptic('right', 0.5, 80);
    this.host.sparks(this.v.copy(head.p).addScaledVector(GAME.fwd, 0.4), 20, 0x5ab8ff, 1.5);
    return true;
  }
  /** Te han dado: ¿salva el combo el combo de hierro? */
  keepCombo(): boolean {
    if (!this.perks.keepCombo(GAME.combo)) return false;
    this.host.message('Combo a salvo', 1);
    return true;
  }
  /** Una repetición: el corazón, cada 10 perfectas, una vida si te falta. */
  onRep(perfect: boolean): void {
    if (this.perks.onRep(perfect, GAME.lives, GAME.maxLives) && this.host.addLife()) {
      this.host.message('+1 VIDA', 1.4);
      SND.combo();
    }
  }

  /** Un disparo perfecto llega (RepArena: perkOnHit): la escarcha frena 3 s a los que están cerca del impacto y la onda
   * empuja a los demás. shove: empujar a uno (m). */
  onPerfectHit(target: FoeTarget, at: Vector3, all: readonly FoeTarget[], shove: (t: FoeTarget, dist: number) => void): void {
    const frost = this.perks.has.has('frost'), wave = this.perks.has.has('wave');
    if (!frost && !wave) return;
    for (const o of all) {
      if (!o.alive || o.center(this.v).distanceTo(at) >= 2.2) continue;
      if (frost) {
        this.frost.set(o, 3);
        this.host.sparks(this.v, 8, 0x9fe8ff, 1.2);
      }
      if (wave && o !== target) shove(o, 0.3);
    }
    if (wave) this.host.sparks(at, 24, 0xa68bff, 2.4);
  }

  /** Sale uno: quizá dorado (uno por oleada como mucho, nunca el jefe). */
  onSpawn(t: FoeTarget | null, boss: boolean): void {
    if (!t || !this.surpriseOn() || !goldRoll(this.goldN, boss)) return;
    this.goldN++;
    const s = glowSprite(0xffc23a, 1.7, 0.55);
    s.material.depthTest = false;
    s.renderOrder = 5;
    this.haloGroup.add(s);
    this.gold.push({ t, s });
  }
  isGold(t: FoeTarget): boolean {
    return this.gold.some((g) => g.t === t);
  }
  /** Cae uno: si era dorado, su fiesta. */
  onKill(t: FoeTarget | null): void {
    if (!t || !this.isGold(t)) return;
    const c = t.center(this.v);
    this.host.message('¡DORADO! ×3', 1.6);
    SND.combo();
    this.host.sparks(c, 50, 0xffd14d, 3.5);
  }

  // ---------------------------------------------------------------- el relámpago

  private rushStep(dt: number): void {
    const R = this.rush;
    if (R.planT > 0 && !R.on) {
      R.planT -= dt;
      if (R.planT <= 0) {
        R.planT = -1;
        R.on = true;
        R.left = RUSH_SECS;
        this.host.message('¡RELÁMPAGO! Puntos ×2', 1.8);
        SND.horn();
      }
    }
    if (R.on && (R.left -= dt) <= 0) this.rushStop(false);
  }
  private rushStop(quiet: boolean): void {
    if (this.rush.on && !quiet) this.host.message('Fin del relámpago', 1.1);
    this.rush.on = false;
    this.rush.left = 0;
  }

  // ---------------------------------------------------------------- las cartas

  private fillPanel(): void {
    const p = this.panel, o = this.perks.offer;
    if (!p || !o) return;
    for (let i = 0; i < 3; i++) {
      const k = o[i], d = k ? PERKS[k] : null;
      p.getElementById('p' + i)?.setProperties({ display: d ? 'flex' : 'none', borderColor: d?.col ?? '#ffd166' });
      if (!d) continue;
      p.getElementById(`p${i}n`)?.setProperties({ text: d.name, color: d.col });
      p.getElementById(`p${i}d`)?.setProperties({ text: d.desc });
    }
    this.place();
    this.showPanel(true);
  }

  // delante de ti y a tu alcance, colgando a la altura del pecho e inclinado hacia ti (como los menús)
  private place(): void {
    const o = this.panelE?.object3D;
    if (!o) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      o.position.copy(this.home);
      o.rotation.set(0, 0, 0);
      return;
    }
    const f = this.f.copy(GAME.fwd), d = (0.75 * Math.max(30, num('menuDist') || 85)) / 100;
    o.position.set(head.p.x + f.x * d, head.p.y - 0.18, head.p.z + f.z * d);
    o.rotation.set(-Math.atan2(0.58, d) * 0.6, Math.atan2(-f.x, -f.z), 0, 'YXZ');
  }

  private showPanel(on: boolean): void {
    this.panelOn = on;
    if (this.panel) this.panel.visible = on;
    const e = this.panelE;
    if (e?.object3D) e.object3D.visible = on;
    if (!e) return;
    for (const C of [RayInteractable, PokeInteractable]) {
      if (on && !e.hasComponent(C)) e.addComponent(C);
      else if (!on && e.hasComponent(C)) e.removeComponent(C);
    }
  }

  /** ¿Se ven las cartas? (para la partida simulada) */
  get cardsShown(): boolean {
    return this.panelOn;
  }

  // ---------------------------------------------------------------- el cofre del descanso

  private chestShow(): void {
    const C = this.chest;
    if (!C.closed) {
      const scene = AssetManager.getGLTF('island-kit')?.scene;
      const closed = scene?.getObjectByName('Chest_Closed'), open = scene?.getObjectByName('Chest_Gold');
      if (!closed || !open) return; // (aún no ha cargado la isla: este descanso, sin cofre)
      C.closed = closed.clone();
      C.open = open.clone();
      for (const o of [C.closed, C.open]) {
        o.position.set(0, 0, 0);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(0.65);
        C.g.add(o);
      }
      C.glow = glowSprite(0xffd166, 0.9, 0.5);
      C.glow.position.y = 0.35;
      C.g.add(C.glow);
    }
    Object.assign(C, { on: true, opened: false, t: 0, vy: 0, lastY: head.p.y, said: false });
    // delante y a un lado (RepArena: 0,7 m a la derecha y 1,3 m delante), girado hacia ti
    const f = GAME.fwd;
    C.g.position.set(head.p.x + f.x * 1.3 - f.z * 0.7, 0, head.p.z + f.z * 1.3 + f.x * 0.7);
    C.g.rotation.set(0, Math.atan2(head.p.x - C.g.position.x, head.p.z - C.g.position.z), 0); // (de cara a ti)
    C.closed!.visible = true;
    C.open!.visible = false;
    C.g.scale.setScalar(0.01);
    C.g.visible = true;
  }

  private chestClear(): void {
    this.chest.on = false;
    this.chest.g.visible = false;
  }

  private chestStep(dt: number, t: number): void {
    const C = this.chest;
    if (!C.on) return;
    C.t += dt;
    C.g.scale.setScalar(Math.min(1, C.t * 3));
    if (C.t >= 2.6 && !C.said && !C.opened) {
      C.said = true;
      this.host.message('¡Un cofre! Salta para abrirlo: dentro, una mejora, una vida o puntos', 3.4);
    }
    if (C.glow) C.glow.material.opacity = C.opened ? Math.max(0, C.glow.material.opacity - dt) : 0.35 + 0.2 * Math.sin(t * 5);
    // un salto: la cabeza sube deprisa por encima de tu altura de pie
    const vy = dt > 0 ? (head.p.y - C.lastY) / dt : 0;
    C.vy += (vy - C.vy) * Math.min(1, dt * 20);
    C.lastY = head.p.y;
    if (!C.opened && C.t > 1 && C.vy > 0.6 && head.p.y > this.standY + 0.06) this.chestOpen();
  }

  private chestOpen(): void {
    const C = this.chest;
    C.opened = true;
    C.closed!.visible = false;
    C.open!.visible = true;
    const c = C.g.getWorldPosition(this.v).setY(0.4);
    this.host.sparks(c, 60, 0xffd14d, 3);
    SND.victory();
    haptic('left', 0.6, 150);
    haptic('right', 0.6, 150);
    const pool = this.perksOn() ? this.perks.pool(GAME.maxLives > 0).filter((k) => !(this.perks.offer ?? []).includes(k)) : [];
    if (pool.length) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      this.perks.take(k);
      this.host.message(`¡Cofre! Mejora extra: ${PERKS[k].name}`, 2.4);
      this.host.trophy('¡COFRE ABIERTO!', `Mejora extra para esta ronda: ${PERKS[k].name}. ${PERKS[k].desc}`, PERKS[k].col);
    } else if (GAME.maxLives > 0 && this.host.addLife()) {
      this.host.message('¡Cofre! +1 vida', 2.2);
      this.host.trophy('¡COFRE ABIERTO!', `+1 vida: ahora tienes ${GAME.lives}`, '#ff4fa3');
    } else {
      GAME.score += 300;
      this.host.message('¡Cofre! +300 puntos', 2.2);
      this.host.trophy('¡COFRE ABIERTO!', '+300 puntos (ya tienes todas las mejoras)');
    }
  }
}
