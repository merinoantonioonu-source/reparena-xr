/**
 * El portal del viaje por portales de Combate y Toques (src/combat/journey.ts): cuando toca cambiar de entorno (la partida pone
 * `TRAVEL.want`), un aro de luz con su remolino (el de los mundos de la Travesía) llega desde el frente, te pasa por encima y,
 * con un destello blanco, ya estás en el entorno siguiente (`TRAVEL.leg`, que EnvSystem enseña: montado en el menú, sin tirones).
 */
import { AdditiveBlending, BackSide, CircleGeometry, createSystem, DoubleSide, Group, Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { SND } from '../audio/sound.js';
import { GAME, HOOKS, TRAVEL } from '../core/state.js';
import { settings } from '../core/values.js';
import { head } from '../input/hand-model.js';
import { haptic } from '../input/hand-system.js';
import { warmKeep } from '../style/warm.js';

/** Lo que tarda en llegar a ti (s), de dónde sale (m por delante), su radio (m) y lo que dura el destello (s). */
const COME_T = 1.6, FROM = 11, R = 1.7, FLASH_T = 1.0;

export class TravelSystem extends createSystem({}) {
  private portal!: Group;
  private mat!: ShaderMaterial;
  private flash!: Mesh;
  private t = -1;
  private flashT = 0;
  private clock = 0;
  private readonly at = new Vector3();

  init(): void {
    this.mat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ vec2 q = vUv * 2.0 - 1.0; float r = length(q), a = atan(q.y, q.x);
          float sw = sin(a * 5.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5, sw2 = sin(a * 3.0 - r * 14.0 + uTime * 2.6) * 0.5 + 0.5;
          vec3 c = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.55, 0.95), sw) * (0.55 + 0.6 * sw2);
          c += vec3(1.0) * smoothstep(0.35, 0.0, r) * 0.9;
          float al = smoothstep(1.0, 0.82, r) * (0.55 + 0.35 * sw);
          gl_FragColor = vec4(c * al, al); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    const ringMat = new MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false }), ring = new Mesh(new TorusGeometry(R, 0.1, 10, 48), ringMat), disc = new Mesh(new CircleGeometry(R, 48), this.mat);
    ring.userData.noInk = disc.userData.noInk = true;
    this.portal = new Group();
    this.portal.add(ring, disc);
    this.portal.visible = false;
    this.world.createTransformEntity(this.portal);
    warmKeep(new Mesh(ring.geometry, ringMat));
    warmKeep(new Mesh(disc.geometry, this.mat));
    // el destello al cruzarlo: una esfera blanca alrededor de la cabeza que se apaga
    this.flash = new Mesh(new SphereGeometry(0.6, 16, 10), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: BackSide, toneMapped: false, fog: false }));
    this.flash.renderOrder = 9000;
    this.flash.userData.noInk = true;
    this.flash.visible = false;
    this.world.createTransformEntity(this.flash);
  }

  update(dt: number): void {
    this.clock += dt;
    const live = GAME.phase === 'playing' && (settings.mode === 'combat' || settings.mode === 'touch');
    // (fuera de la partida, o sin viaje, el tramo es el que toca, sin portal)
    if (!live || !TRAVEL.on) {
      TRAVEL.leg = TRAVEL.want;
      this.t = -1;
      this.portal.visible = false;
    } else if (TRAVEL.want !== TRAVEL.leg && this.t < 0 && !GAME.paused) {
      this.t = 0;
      SND.engulf(this.at.set(head.p.x, head.p.y, head.p.z - FROM * 0.6));
    }
    if (this.t >= 0 && !GAME.paused) {
      this.t += dt;
      const k = Math.min(1, this.t / COME_T), d = FROM - (FROM + 1.5) * k * k; // (llega cada vez más deprisa)
      this.mat.uniforms.uTime.value = this.clock;
      this.portal.position.set(head.p.x, Math.max(R + 0.05, head.p.y), head.p.z - d);
      this.portal.scale.setScalar(0.6 + 0.4 * Math.min(1, this.t / 0.5));
      this.portal.visible = true;
      // (chispas que saltan del aro)
      if (Math.random() < dt * 40) {
        const a = Math.random() * 6.283, P = this.portal.position;
        HOOKS.sparks(this.at.set(P.x + Math.cos(a) * R, P.y + Math.sin(a) * R, P.z), 2, Math.random() < 0.5 ? 0x8ff0ff : 0xff9cf0);
      }
      // te pasa por encima: el destello y, detrás, el entorno nuevo
      if (d <= 0.2 && TRAVEL.want !== TRAVEL.leg) {
        TRAVEL.leg = TRAVEL.want;
        this.flashT = FLASH_T;
        SND.vortexClose(head.p);
        haptic('left', 0.8, 220);
        haptic('right', 0.8, 220);
      }
      if (d < -1.4) {
        this.t = -1;
        this.portal.visible = false;
      }
    }
    const fm = this.flash.material as MeshBasicMaterial;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      fm.opacity = Math.min(1, (this.flashT / FLASH_T) * 1.6);
      this.flash.position.copy(head.p);
      this.flash.visible = true;
    } else this.flash.visible = false;
  }
}
