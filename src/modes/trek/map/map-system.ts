/**
 * El vuelo sobre el mapa (pedido del usuario: «volar por Google Maps 3D» con los movimientos del vuelo): en la Travesía con
 * «Flexiones» y «Volando», con una ciudad en «Volando: sobre el mapa» y la clave de Cesium ion del jugador (map-key.ts), en vez
 * del recorrido de la Travesía se pinta la ciudad de verdad (los mapas 3D de Google por Cesium ion, con la librería
 * 3d-tiles-renderer: IWSDK no trae nada para mapas) y te mueves por ella con los mismos mandos (map-route.ts: escorarte, virar;
 * la media flexión, la altura; tus flexiones o el avance solo, la velocidad). La ruta de aros pasa por sus monumentos.
 *
 * Como la Travesía, el mundo se mueve y tú no: el mapa entero cuelga de `root`, que se gira y se desplaza para que el punto
 * donde vuelas quede en tu cabeza. El suelo bajo ti (y bajo cada aro) se mide con un rayo hacia abajo contra el mapa.
 * Los mapas, sin el estilo cómic ni niebla (son fotos de verdad) y con sus créditos de Google a la vista (lo exigen).
 */
import { AdditiveBlending, CanvasTexture, ConeGeometry, createSystem, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Raycaster, TorusGeometry, Vector2, Vector3 } from '@iwsdk/core';
import type { Material, PerspectiveCamera, WebGLRenderer } from '@iwsdk/core';
// (el descompresor de los modelos de Google: el mismo paquete de Three que reexporta IWSDK —IWSDK lo importa igual—)
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { SND } from '../../../audio/sound.js';
import { diagEvent } from '../../../core/diag.js';
import { GAME, HOOKS } from '../../../core/state.js';
import { str } from '../../../core/values.js';
import { haptic } from '../../../input/hand-system.js';
import { FLY } from '../plat/fly.js';
import { TrekSystem } from '../trek-system.js';
import { GOOGLE_3D_ASSET, mapKey, mapLog } from './map-key.js';
import { cityOf, headingTo, MAP, MapFlight, type MapIn } from './map-route.js';

const DEG = Math.PI / 180;
/** Lo lejos que se pinta (m: la ciudad entera; la cámara de la Travesía no llega tan lejos), cada cuánto se mide el suelo (s), el
 * detalle de los mapas (más, menos detalle y más ligero: en las gafas), lo que pueden ocupar en memoria (bytes) y el aviso. */
const FAR = 25000, GROUND_T = 0.35, ERROR_TARGET = 24, CACHE_BYTES = 260 * 1024 * 1024, WAIT = 20;

export class MapSystem extends createSystem({}) {
  private root!: Group;
  private room!: Group;
  private tiles: TilesRenderer | null = null;
  private flight: MapFlight | null = null;
  private cityId = '';
  private cam: PerspectiveCamera | null = null;
  private farWas = 0;
  private active = false;
  private errSaid = false;
  /** Si ya ha llegado algún trozo del mapa, y lo que lleva esperándolo (s: pasado `WAIT`, se avisa). */
  private loaded = false;
  private asked = false;
  private nextState = 0;
  private readonly size = new Vector2();
  private waitT = 0;
  /** El suelo bajo ti y bajo cada aro (m, en el mapa; NaN: aún sin medir) y cuándo toca medirlo. */
  private ground = 0;
  private groundOk = false;
  private ringGround: number[] = [];
  private groundT = 0;
  private ringT = 0;
  private readonly ray = new Raycaster();
  private readonly hits: { point: Vector3 }[] = [];
  /** Los aros (el que viene y el siguiente), el que se abre al pasarlo, la flecha que señala al que viene y los créditos. */
  private rings: Mesh[] = [];
  private pop!: Mesh;
  private popT = -1;
  private arrow!: Mesh;
  private credits!: Mesh;
  private creditTex!: CanvasTexture;
  private creditText = '';
  private creditT = 0;
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly attr: { type: string; value: unknown }[] = [];
  private draco: DRACOLoader | null = null;
  /** Lo que manda el cuerpo (sin crear nada en cada fotograma). */
  private readonly inp: MapIn = { u: 0, uMax: FLY.uMax, alt: 0, alt0: FLY.alt0, v: 0 };

  init(): void {
    this.root = new Group();
    this.root.visible = false;
    this.root.userData.noComic = true;
    this.world.createTransformEntity(this.root);
    this.room = new Group();
    this.room.visible = false;
    this.world.createTransformEntity(this.room);
    const ringMat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide });
    const ringGeo = new TorusGeometry(MAP.ringR, 1.6, 10, 64);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(ringGeo, ringMat.clone());
      m.userData.noInk = true;
      m.renderOrder = 6;
      m.visible = false;
      this.root.add(m);
      this.rings.push(m);
    }
    this.pop = new Mesh(ringGeo, ringMat.clone());
    this.pop.userData.noInk = true;
    this.pop.visible = false;
    this.root.add(this.pop);
    // la flecha al aro que viene: en el suelo de la habitación, por delante de las manos (en plancha se mira ahí)
    this.arrow = new Mesh(new ConeGeometry(0.06, 0.2, 3).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0x39ff88, toneMapped: false, fog: false }));
    this.arrow.userData.noInk = true;
    this.room.add(this.arrow);
    // los créditos del mapa (Google y los demás que pide): un letrero pequeño junto a la flecha
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 96;
    this.creditTex = new CanvasTexture(cv);
    this.credits = new Mesh(new PlaneGeometry(0.6, 0.056).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: this.creditTex, transparent: true, toneMapped: false, fog: false, depthWrite: false }));
    this.credits.userData.noInk = true;
    this.room.add(this.credits);
  }

  update(dt: number): void {
    const T = this.world.getSystem(TrekSystem), R = T?.runner;
    const on = !!R && R.mapMode && GAME.phase === 'playing';
    if (!on) {
      if (this.active) this.end();
      return;
    }
    if (!this.active && !this.start()) return;
    const F = this.flight!, tiles = this.tiles!;
    // (sin nada del mapa en un rato: la clave mal pegada, sin permiso para esta dirección o sin wifi)
    if (!this.loaded) {
      this.waitT += dt;
      if (!this.errSaid && this.waitT > WAIT) this.fail(`sin ningún trozo en ${WAIT} s${this.asked ? ' (pedidos)' : ' (ni pedidos)'}`);
      // (y cómo va, cada rato: para saber dónde se atasca)
      if (this.waitT > this.nextState && this.nextState < 80) {
        this.nextState += 15;
        this.log(this.stateOf(tiles));
      }
    }
    // el vuelo: lo que manda el cuerpo (el planeador de la Travesía) y la marcha
    if (!GAME.paused) {
      const I = this.inp;
      I.u = R.glider.u;
      I.alt = R.glider.alt;
      I.v = R.v;
      F.step(dt, I);
      const res = F.judge();
      if (res === 'pass') this.passed(F);
      else if (res === 'miss') HOOKS.say(`Aro fallado · ${F.city.route[F.next].name}`, '#ffb347', 1.4, false);
    }
    // el suelo: bajo ti (suave: los mapas se van afinando) y bajo los aros que vienen
    this.groundT -= dt;
    if (this.groundT <= 0) {
      this.groundT = GROUND_T;
      const g = this.groundAt(F.x, F.z);
      if (!Number.isNaN(g)) {
        this.ground = this.groundOk ? this.ground + (g - this.ground) * 0.5 : g;
        this.groundOk = true;
      }
    }
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 1.5;
      for (let k = 0; k < 2; k++) {
        const i = (F.next + k) % F.rings.length, g = this.groundAt(F.rings[i].x, F.rings[i].z);
        if (!Number.isNaN(g)) this.ringGround[i] = g;
      }
    }
    // el mapa, girado y desplazado para que donde vuelas quede en tu cabeza (el centro del vuelo, quieto: lo de la Travesía)
    const B = R.flyBody, eye = T!.calibRef, py = this.ground + F.agl;
    this.root.rotation.set(0, -F.heading, 0);
    this.v.set(F.x, py, F.z).applyAxisAngle(this.w.set(0, 1, 0), -F.heading);
    this.root.position.set(B.x0 - this.v.x, eye - this.v.y, B.z0 - this.v.z);
    this.root.updateMatrixWorld(true);
    // los aros: el que viene y el siguiente, a su altura sobre su suelo y de cara a quien llega
    for (let k = 0; k < 2; k++) {
      const i = (F.next + k) % F.rings.length, r = F.rings[i], prev = F.rings[(i + F.rings.length - 1) % F.rings.length], m = this.rings[k];
      const gy = this.ringGround[i] ?? this.ground;
      m.position.set(r.x, gy + MAP.ringAgl, r.z);
      m.rotation.set(0, headingTo(prev.x, prev.z, r.x, r.z), 0);
      (m.material as MeshBasicMaterial).opacity = k ? 0.45 : 0.9;
      m.visible = true;
    }
    if (this.popT >= 0) {
      this.popT += dt;
      const k = this.popT / 0.8;
      this.pop.visible = k < 1;
      this.pop.scale.setScalar(1 + 1.5 * k);
      (this.pop.material as MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) this.popT = -1;
    }
    // la flecha al aro que viene y los créditos, en el suelo de la habitación por delante de las manos
    const toward = F.toNext();
    this.room.visible = true;
    this.room.position.set(B.x0 + B.fx * 0.62, 0.015, B.z0 + B.fz * 0.62);
    this.room.rotation.set(0, Math.atan2(-B.fx, -B.fz), 0);
    this.arrow.rotation.set(0, toward.bearing, 0);
    this.credits.position.set(0, 0.002, 0.16);
    this.creditT -= dt;
    if (this.creditT <= 0) {
      this.creditT = 2;
      this.drawCredits(tiles);
    }
    // los mapas: desde la cámara de ahora (en las gafas, la de los dos ojos)
    const r = this.world.renderer as WebGLRenderer, cam = (r.xr.isPresenting ? r.xr.getCamera() : this.world.camera) as PerspectiveCamera;
    if (cam !== this.cam) {
      if (this.cam) tiles.deleteCamera(this.cam);
      tiles.setCamera(cam);
      this.cam = cam;
    }
    tiles.setResolutionFromRenderer(cam, r);
    tiles.update();
  }

  /** Empieza el vuelo sobre el mapa: la ciudad, sus mapas (con la clave del jugador) y lo lejos que se ve. */
  private start(): boolean {
    const city = cityOf(str('flyMap')), key = mapKey();
    if (!city || !key) return false;
    this.active = true;
    this.errSaid = false;
    if (!this.tiles || this.cityId !== city.id) {
      this.disposeTiles();
      const tiles = new TilesRenderer();
      tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: key, assetId: GOOGLE_3D_ASSET, autoRefreshToken: true }));
      if (!this.draco) this.draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.draco }));
      tiles.registerPlugin(new ReorientationPlugin({ lat: city.lat * DEG, lon: city.lon * DEG, height: 0, recenter: true }));
      tiles.errorTarget = ERROR_TARGET;
      tiles.lruCache.maxBytesSize = CACHE_BYTES;
      tiles.lruCache.minBytesSize = CACHE_BYTES * 0.6;
      tiles.addEventListener('load-root-tileset', () => this.log('índice del mapa recibido'));
      tiles.addEventListener('tile-download-start', () => {
        if (!this.asked) {
          this.asked = true;
          this.log('pidiendo trozos del mapa');
        }
      });
      tiles.addEventListener('load-model', (e: { scene: Object3D }) => {
        // (fotos de verdad: sin cómic, sin contorno de tinta y sin la niebla de la Travesía)
        if (!this.loaded) this.log('primer trozo del mapa cargado');
        this.loaded = true;
        e.scene.traverse((o) => {
          o.userData.noInk = true;
          const ms = (o as Mesh).material;
          if (ms) for (const m of Array.isArray(ms) ? ms : [ms]) (m as Material & { fog?: boolean }).fog = false;
        });
      });
      tiles.addEventListener('load-error', (e: { error: Error; url: string | URL }) => {
        let host = '';
        try {
          host = new URL(String(e.url)).host;
        } catch {
          /* (sin dirección) */
        }
        this.fail(`${String(e.error?.message ?? e.error).slice(0, 90)}${host ? ` · ${host}` : ''}`);
      });
      tiles.group.userData.noComic = true;
      this.root.add(tiles.group);
      this.tiles = tiles;
      this.cityId = city.id;
      this.loaded = this.asked = false;
    }
    this.flight = new MapFlight(city);
    this.waitT = 0;
    this.nextState = 6;
    this.ringGround = [];
    this.groundOk = false;
    this.ground = city.h; // (hasta medirlo: no bajo tierra)
    this.groundT = this.ringT = 0;
    this.root.visible = true;
    const cam = this.world.camera as PerspectiveCamera;
    this.farWas = cam.far;
    cam.far = FAR;
    cam.updateProjectionMatrix();
    HOOKS.say(`${city.name} · sigue los aros`, '#3cf0c6', 3, false);
    this.log(`${city.name}: empieza (clave …${key.slice(-4)})`);
    return true;
  }

  private end(): void {
    this.active = false;
    this.root.visible = this.room.visible = false;
    const cam = this.world.camera as PerspectiveCamera;
    if (this.farWas) {
      cam.far = this.farWas;
      cam.updateProjectionMatrix();
    }
    // (al acabar la partida se sueltan los mapas: ocupan mucha memoria)
    this.disposeTiles();
  }

  private disposeTiles(): void {
    if (!this.tiles) return;
    if (this.cam) this.tiles.deleteCamera(this.cam);
    this.cam = null;
    this.root.remove(this.tiles.group);
    this.tiles.dispose();
    this.tiles = null;
    this.cityId = '';
  }

  private fail(why: string): void {
    this.log(`no carga: ${why}`);
    if (this.errSaid) return;
    this.errSaid = true;
    HOOKS.say('Mapa: no carga · mira la página', '#ff8a3d', 4, true);
  }

  /** Cómo va la carga: la raíz (0 sin pedir, 2 bajando, 4 recibida, −1 fallida), los trozos en cada paso y la resolución. */
  private stateOf(tiles: TilesRenderer): string {
    const S = (tiles as unknown as { stats: Record<string, number> }).stats, r = this.world.renderer as WebGLRenderer;
    r.getSize(this.size);
    return `a los ${Math.round(this.waitT)} s · raíz ${(tiles as unknown as { rootLoadingState: number }).rootLoadingState} · en cola ${S.queued} · bajando ${S.downloading} · procesando ${S.parsing} · cargados ${S.loaded} · fallidos ${S.failed} · visibles ${tiles.visibleTiles.size} · ${this.size.x}×${this.size.y}${r.xr.isPresenting ? ' (VR)' : ''}`;
  }

  /** Al diagnóstico y al registro del mapa (que enseña la página: no se borra a los 30 s). */
  private log(text: string): void {
    diagEvent(`Mapa: ${text}`);
    mapLog(text);
  }

  /** El suelo en (x, z) del mapa (m; NaN si aún no ha cargado): un rayo desde muy alto hacia abajo. */
  private groundAt(x: number, z: number): number {
    if (!this.tiles) return NaN;
    const o = this.root.localToWorld(this.v.set(x, 4000, z)), d = this.w.set(0, -1, 0).transformDirection(this.root.matrixWorld);
    this.ray.set(o, d);
    this.ray.far = 9000;
    this.hits.length = 0;
    this.ray.intersectObject(this.tiles.group, true, this.hits as never);
    if (!this.hits.length) return NaN;
    return this.root.worldToLocal(this.v.copy(this.hits[0].point)).y;
  }

  /** Aro pasado: se abre y se desvanece, puntos, sonido y vibración, y el nombre del monumento. */
  private passed(F: MapFlight): void {
    const done = (F.next + F.rings.length - 1) % F.rings.length;
    this.pop.position.copy(this.rings[0].position);
    this.pop.rotation.copy(this.rings[0].rotation);
    this.pop.visible = true;
    this.popT = 0;
    HOOKS.score(200, true);
    SND.perfect();
    haptic('left', 0.6, 80);
    haptic('right', 0.6, 80);
    HOOKS.say(`¡${F.city.route[done].name}!`, '#3cf0c6', 1.6, false);
  }

  /** Los créditos del mapa (lo que pide cada fuente; Google, siempre): se repintan solo si cambian. */
  private drawCredits(tiles: TilesRenderer): void {
    this.attr.length = 0;
    tiles.getAttributions(this.attr);
    let t = 'Mapa: Google';
    for (const a of this.attr) if (a.type === 'string' && typeof a.value === 'string' && !t.includes(a.value)) t += ` · ${a.value}`;
    if (t === this.creditText) return;
    this.creditText = t;
    const cv = this.creditTex.image as HTMLCanvasElement, c = cv.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(10,8,20,0.6)';
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#ffffff';
    c.font = '40px sans-serif';
    c.textBaseline = 'middle';
    c.fillText(t.length > 70 ? `${t.slice(0, 68)}…` : t, 16, cv.height / 2, cv.width - 32);
    this.creditTex.needsUpdate = true;
  }
}
