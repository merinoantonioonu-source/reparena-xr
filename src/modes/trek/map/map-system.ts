/**
 * El vuelo sobre el mapa (pedido del usuario: «volar por Google Maps 3D» con los movimientos del vuelo): en la Travesía con
 * «Flexiones» y «Volando», con una ciudad en «Volando: sobre el mapa» y la clave de Cesium ion del jugador (map-key.ts), en vez
 * del recorrido de la Travesía se pinta el mundo de verdad (los mapas 3D de Google por Cesium ion, con la librería
 * 3d-tiles-renderer: IWSDK no trae nada para mapas) y se vuela por él **libre** (map-route.ts: escorarte te ladea y viras, la
 * media flexión sube y baja sin techo, la marcha es el gas). Una ruta de aros pasa por encima de los monumentos de la ciudad.
 *
 * Como la Travesía, el mundo se mueve y tú no: el mapa entero cuelga de `root`, que se gira (y se ladea un poco al virar) y
 * se desplaza para que el punto donde vuelas quede en tu cabeza. Con rayos contra el mapa se mide lo que hay debajo (el suelo
 * o el tejado: te sostiene), lo que hay por delante (una pared: frenas; no se atraviesa nada) y lo más alto bajo cada aro
 * (el aro va por encima). Los mapas, sin el estilo cómic ni niebla (son fotos de verdad), con solo el cielo alrededor
 * (`MAPVIEW`: lo pone EnvSystem, más oscuro cuanto más alto) y con sus créditos de Google a la vista (lo exigen).
 */
import { AdditiveBlending, CanvasTexture, Color, ConeGeometry, createSystem, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, Raycaster, TorusGeometry, Vector2, Vector3 } from '@iwsdk/core';
import type { Material, PerspectiveCamera, WebGLRenderer } from '@iwsdk/core';
// (el descompresor de los modelos de Google: el mismo paquete de Three que reexporta IWSDK —IWSDK lo importa igual—)
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Scheduler } from '3d-tiles-renderer/core';
import { TilesRenderer } from '3d-tiles-renderer/three';
import { CesiumIonAuthPlugin, GLTFExtensionsPlugin, ReorientationPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import { SND } from '../../../audio/sound.js';
import { diagEvent } from '../../../core/diag.js';
import { GAME, HOOKS, MAPVIEW } from '../../../core/state.js';
import { num, on as isOn, settings, str } from '../../../core/values.js';
import { head } from '../../../input/hand-model.js';
import { haptic } from '../../../input/hand-system.js';
import { FLY } from '../plat/fly.js';
import { TrekSystem } from '../trek-system.js';
import { GOOGLE_3D_ASSET, mapKey, mapLog } from './map-key.js';
import { cityOf, headingTo, MAP, MapFlight, type MapIn } from './map-route.js';

const DEG = Math.PI / 180, RE = 6371000;
/** Lo más cerca que se pone el fondo de lo que se pinta (m: la ciudad entera; más alto, hasta el horizonte), cada cuánto se
 * mide lo que hay debajo, por delante y bajo los aros (s), lo que pueden ocupar los mapas en memoria (bytes) y el aviso. El
 * detalle, del ajuste «Volando sobre el mapa: nitidez» (`flyMapSharp`). */
const GROUND_T = 0.4, AHEAD_T = 0.25, RING_T = 0.5, CACHE_BYTES = 600 * 1024 * 1024, WAIT = 20;
/** Lo lejos que se ve (y se pide mapa): tantas veces tu altura (como poco `FAR_MIN` m; como mucho, el horizonte), con calima
 * al fondo (la niebla de la escena, del color del horizonte). En las gafas, con la ciudad hasta el horizonte a 260 m de alto
 * se pedían miles de trozos, la cola nunca se vaciaba (más de 1.000 esperando siempre) y el juego iba a 17 imágenes por
 * segundo, con lo de cerca borroso. */
const FAR_K = 30, FAR_MIN = 6000, HAZE = 1.5;
/** La nitidez: lo que vale cada nivel del ajuste (píxeles de error: el ajuste × esto; las gafas pintan 2.640 píxeles de
 * alto por ojo, así que 8 píxeles era pedir muchísimo), y lo que se afloja con la cola llena (hasta × `ERR_MAX`: a partir de
 * `BACKLOG0` trozos esperando, uno más por cada `BACKLOG_K`), para que lo de cerca llegue enseguida. */
const ERR_K = 2.5, ERR_MAX = 3, BACKLOG0 = 40, BACKLOG_K = 120;
/** El aro se mide en su centro y en cuatro puntos de su borde (× su radio): vale lo más alto. */
const RING_AT: readonly [number, number][] = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]];
const AX_Y = new Vector3(0, 1, 0), AX_Z = new Vector3(0, 0, 1);

export class MapSystem extends createSystem({}) {
  private root!: Group;
  private room!: Group;
  private tiles: TilesRenderer | null = null;
  private reorient: ReorientationPlugin | null = null;
  private flight: MapFlight | null = null;
  private cityId = '';
  private cam: PerspectiveCamera | null = null;
  private farWas = 0;
  private farNow = 0;
  private active = false;
  private errSaid = false;
  /** Si ya ha llegado algún trozo del mapa, y lo que lleva esperándolo (s: pasado `WAIT`, se avisa). */
  private loaded = false;
  private asked = false;
  private nextState = 0;
  private readonly size = new Vector2();
  private waitT = 0;
  private aniso = 1;
  /** Cuándo toca medir lo de debajo, lo de delante y los aros (s), y a cuál de los dos aros le toca. */
  private groundT = 0;
  private aheadT = 0;
  private ringT = 0;
  private wallT = 0;
  private ringPt = 0;
  private gearSaid = false;
  /** La calima (la niebla de la escena: lo que traía, para devolverlo), la nitidez de ahora (× la del ajuste) y las imágenes
   * por segundo desde el último apunte del registro. */
  private fogWas: { color: number; density: number } | null = null;
  private readonly hazeC = new Color();
  private errK = 1;
  private errT = 0;
  private frames = 0;
  private framesT = 0;
  private pad: Object3D | null = null;
  private padWas = true;
  private readonly ray = new Raycaster();
  private readonly hits: { point: Vector3; distance: number }[] = [];
  /** Los aros (el que viene y el siguiente), el haz de luz sobre el que viene (se ve de lejos), el que se abre al pasarlo,
   * la flecha que señala al que viene y los créditos. */
  private rings: Mesh[] = [];
  private beam!: Mesh;
  private pop!: Mesh;
  private popT = -1;
  private arrow!: Mesh;
  private credits!: Mesh;
  private creditTex!: CanvasTexture;
  private creditText = '';
  private creditT = 0;
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly q = new Quaternion();
  private readonly attr: { type: string; value: unknown }[] = [];
  private draco: DRACOLoader | null = null;
  /** Lo que manda el cuerpo (sin crear nada en cada fotograma). */
  private readonly inp: MapIn = { live: false, steer: 0, head: 0, ref: 0, lean: 0, kick: false };

  init(): void {
    this.root = new Group();
    this.root.visible = false;
    this.root.userData.noComic = true;
    this.world.createTransformEntity(this.root);
    this.room = new Group();
    this.room.visible = false;
    this.world.createTransformEntity(this.room);
    (this.ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true; // (solo lo primero que toca: más ligero)
    const ringMat = new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide });
    const ringGeo = new TorusGeometry(MAP.ringR, 2.6, 10, 64);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(ringGeo, ringMat.clone());
      m.userData.noInk = true;
      m.renderOrder = 6;
      m.visible = false;
      this.root.add(m);
      this.rings.push(m);
    }
    // el haz de luz: sube desde lo alto del aro que viene (se ve de lejos, por encima de los edificios)
    this.beam = new Mesh(new CylinderGeometry(3, 3, 1, 10, 1, true).translate(0, 0.5, 0), new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide }));
    this.beam.userData.noInk = true;
    this.beam.renderOrder = 6;
    this.beam.visible = false;
    this.root.add(this.beam);
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
    // (solo en la Travesía: el corredor se queda con el modo del mapa al cambiar a otro modo)
    const on = !!R && R.mapMode && settings.mode === 'trek' && GAME.phase === 'playing';
    if (!on) {
      if (this.active) this.end();
      return;
    }
    if (!this.active && !this.start()) return;
    const F = this.flight!, tiles = this.tiles!;
    // (sin nada del mapa en un rato: la clave mal pegada, sin permiso para esta dirección o sin wifi)
    this.waitT += dt;
    this.frames++;
    this.framesT += dt;
    if (!this.loaded && !this.errSaid && this.waitT > WAIT) this.fail(`sin ningún trozo en ${WAIT} s${this.asked ? ' (pedidos)' : ' (ni pedidos)'}`);
    // (lo de las marchas, un poco después de lo de la altura)
    if (!this.gearSaid && this.waitT > 9 && T!.playing()) {
      this.gearSaid = true;
      HOOKS.say('Impulso adelante: una marcha más · Echarte atrás: frenas', '#3cf0c6', 5, false);
    }
    // (y cómo va, cada rato: para saber dónde se atasca o si la memoria se llena)
    if (this.waitT > this.nextState && this.nextState < 200) {
      this.nextState += this.loaded ? 45 : 15;
      this.log(this.stateOf(tiles));
    }
    // el vuelo: lo que manda el cuerpo (el planeador de la Travesía: lo que te escoras y lo que subes o bajas) y la marcha
    if (!GAME.paused) {
      // lo que manda el cuerpo: escorarte (el cuello, no las gafas: girar la cabeza no desvía), la flexión entera (subir,
      // recto, bajar, el picado) y la cabeza adelante y atrás (las marchas)
      const I = this.inp, G = R.glider, L = R.handLine, g0 = Math.floor(F.gear + 1e-6);
      I.live = T!.playing() && !R.coaching;
      I.steer = G.tgtU / FLY.uMax;
      I.head = R.env.head.y;
      I.ref = T!.calibRef;
      I.lean = L.lean;
      I.kick = L.kick;
      F.step(dt, I);
      R.mapFlown = F.flown;
      // el impulso se nota: vibración, un golpe de aire y la marcha que llevas
      if (I.live && I.kick) {
        haptic('left', 0.7, 90);
        haptic('right', 0.7, 90);
        SND.whoosh(head.p);
        HOOKS.say(`¡Impulso! Marcha ${Math.round(F.gear)}`, '#3cf0c6', 1.2, false);
      } else if (I.live && g0 > 0 && F.gear <= 0) HOOKS.say('Frenado · un impulso adelante para arrancar', '#ffd166', 2.5, false);
      if (F.judge()) this.passed(F);
      // (la Tierra es redonda: lejos del punto del mapa, se vuelve a anclar debajo de ti)
      if (F.reanchor() && this.reorient) {
        this.reorient.transformLatLonHeightToOrigin(F.anchor.lat * DEG, F.anchor.lon * DEG);
        this.groundT = this.aheadT = this.ringT = 0;
      }
      // ante una pared, parado: se dice (de vez en cuando)
      this.wallT -= dt;
      if (F.ahead - MAP.stopAt < 2 && F.gear > 0.2 && I.live && this.wallT <= 0) {
        this.wallT = 5;
        HOOKS.say('¡Un edificio! Vira o sube', '#ff8a3d', 1.8, true);
        haptic('left', 0.5, 120);
        haptic('right', 0.5, 120);
      }
    }
    // lo que hay debajo (el suelo o el tejado: te sostiene), por delante (una pared: frenas) y bajo los aros (van por encima)
    this.groundT -= dt;
    if (this.groundT <= 0) {
      this.groundT = GROUND_T;
      const g = this.topAt(F.x, F.z, F.alt);
      if (!Number.isNaN(g)) F.ground = g;
    }
    // (los rayos cuestan: lo de delante, solo en marcha y cerca del suelo; los aros, un punto cada vez y solo de cerca)
    this.aheadT -= dt;
    if (this.aheadT <= 0) {
      this.aheadT = AHEAD_T;
      F.ahead = (F.speed > 2 || F.gear > 0.05) && F.agl < 3000 ? this.aheadOf(F) : Infinity;
    }
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = RING_T;
      if (F.toward.dist < 5000) this.measureRing(F, F.next);
    }
    // el mapa, girado (y ladeado un poco al virar, como un ave) y desplazado para que donde vuelas quede en tu cabeza (el
    // centro del vuelo, quieto: lo de la Travesía)
    const B = R.flyBody, eye = T!.calibRef;
    this.root.quaternion.setFromAxisAngle(AX_Z, isOn('flyMapBank') ? F.bank * MAP.roll : 0).multiply(this.q.setFromAxisAngle(AX_Y, -F.heading));
    this.v.set(F.x, F.alt, F.z).applyQuaternion(this.root.quaternion);
    this.root.position.set(B.x0 - this.v.x, eye - this.v.y, B.z0 - this.v.z);
    this.root.updateMatrixWorld(true);
    // los aros: el que viene y el siguiente, por encima de lo que tengan debajo y de cara a ti (se entra por donde vengas)
    for (let k = 0; k < 2; k++) {
      const i = (F.next + k) % F.rings.length, r = F.rings[i], m = this.rings[k];
      m.position.set(r.x, F.ringAlt(i), r.z);
      m.rotation.set(0, headingTo(F.x, F.z, r.x, r.z), 0);
      (m.material as MeshBasicMaterial).opacity = k ? 0.4 : 0.9;
      m.visible = true;
    }
    this.beam.position.copy(this.rings[0].position);
    this.beam.position.y += MAP.ringR;
    this.beam.scale.set(1, 2500, 1);
    this.beam.visible = true;
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
    // el cielo (EnvSystem): solo cielo y mapa, más oscuro cuanto más alto
    MAPVIEW.on = true;
    MAPVIEW.alt = F.agl;
    // lo lejos que se pinta (y se pide mapa): unas 30 veces tu altura y, como mucho, el horizonte, con calima al fondo (a
    // saltos: no en cada fotograma)
    const h = Math.max(0, F.agl), far = Math.min(Math.max(FAR_MIN, FAR_K * h), 1.2 * Math.sqrt(2 * RE * h + h * h) + 2000), wc = this.world.camera as PerspectiveCamera;
    const fog = (this.world.scene as unknown as { fog: { color: Color; density: number } | null }).fog;
    if (far > this.farNow * 1.2 || far < this.farNow / 1.4) {
      this.farNow = far;
      wc.far = far * 1.2;
      wc.updateProjectionMatrix();
    }
    if (fog) {
      fog.density = HAZE / (this.farNow * 1.2);
      fog.color.copy(this.hazeC.setRGB(MAPVIEW.haze[0], MAPVIEW.haze[1], MAPVIEW.haze[2]));
    }
    // la nitidez: la del ajuste, aflojada mientras haya muchos trozos esperando (lo de cerca llega antes)
    this.errT -= dt;
    if (this.errT <= 0 && tiles.root) {
      this.errT = 0.5;
      const S = (tiles as unknown as { stats: Record<string, number> }).stats, wait = S.parsing + S.queued + S.downloading;
      this.errK += (Math.max(1, Math.min(ERR_MAX, 1 + (wait - BACKLOG0) / BACKLOG_K)) - this.errK) * 0.35;
      tiles.errorTarget = (num('flyMapSharp') || 8) * ERR_K * this.errK;
    }
    // los mapas: desde la cámara de ahora (en las gafas, la de los dos ojos)
    const r = this.world.renderer as WebGLRenderer, cam = (r.xr.isPresenting ? r.xr.getCamera() : this.world.camera) as PerspectiveCamera;
    if (cam !== this.cam) {
      if (this.cam) tiles.deleteCamera(this.cam);
      tiles.setCamera(cam);
      this.cam = cam;
    }
    tiles.setResolutionFromRenderer(cam, r);
    // las colas de descarga de la librería van con el reloj de la página, que en las gafas se para dentro de la VR: con el
    // de la sesión de VR (si no, el índice llegaba y los trozos se quedaban en cola para siempre)
    Scheduler.setXRSession((r.xr.isPresenting ? r.xr.getSession() : null) as XRSession);
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
      this.reorient = new ReorientationPlugin({ lat: city.lat * DEG, lon: city.lon * DEG, height: 0, recenter: true });
      tiles.registerPlugin(this.reorient);
      // los cambios de detalle, fundidos (sin el salto de un trozo borroso a uno nítido)
      tiles.registerPlugin(new TilesFadePlugin({ maximumFadeOutTiles: 30 }));
      // (la memoria de los mapas: con poca, se llenaba y la ciudad se quedaba borrosa)
      tiles.lruCache.maxBytesSize = CACHE_BYTES;
      tiles.lruCache.minBytesSize = CACHE_BYTES * 0.75;
      // solo lo que se va a ver y lo más cercano primero (lo de serie carga además todos los trozos de menos detalle de
      // cada sitio, de lejos a cerca: lo de debajo de ti llegaba lo último)
      (tiles as unknown as { loadAncestors: boolean }).loadAncestors = false;
      tiles.parseQueue.maxJobs = 4;
      tiles.addEventListener('load-root-tileset', () => {
        // la nitidez: la que elijas (lo de Google pone la suya al recibir el índice)
        tiles.errorTarget = (num('flyMapSharp') || 8) * ERR_K * this.errK;
        this.log('índice del mapa recibido');
      });
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
          if (ms)
            for (const m of Array.isArray(ms) ? ms : [ms]) {
              (m as Material & { fog?: boolean }).fog = true; // (la calima del fondo)
              // (las fotos de los tejados y las calles, nítidas también de lado: se miran desde arriba y de lejos)
              const map = (m as MeshBasicMaterial).map;
              if (map) map.anisotropy = this.aniso;
            }
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
    this.errK = 1;
    this.errT = 0;
    this.frames = this.framesT = 0;
    const fog = (this.world.scene as unknown as { fog: { color: Color; density: number } | null }).fog;
    if (fog) this.fogWas = { color: fog.color.getHex(), density: fog.density };
    this.flight = new MapFlight(city);
    this.reorient?.transformLatLonHeightToOrigin(city.lat * DEG, city.lon * DEG);
    this.waitT = 0;
    this.nextState = 6;
    this.groundT = this.aheadT = this.ringT = this.wallT = 0;
    this.ringPt = 0;
    this.gearSaid = false;
    this.aniso = (this.world.renderer as WebGLRenderer).capabilities.getMaxAnisotropy();
    this.root.visible = true;
    // (solo el cielo y el mapa: sin la plataforma de debajo de los pies)
    this.pad = this.world.getSceneEntity('player-pad')?.object3D ?? null;
    if (this.pad) {
      this.padWas = this.pad.visible;
      this.pad.visible = false;
    }
    const cam = this.world.camera as PerspectiveCamera;
    this.farWas = cam.far;
    this.farNow = 0;
    HOOKS.say(`${city.name} · vuelo libre · sigue los aros`, '#3cf0c6', 4, false);
    this.log(`${city.name}: empieza (clave …${key.slice(-4)})`);
    return true;
  }

  /** Lo que enseñan el marcador y el panel de la ronda (null: sin mapa). Sin crear nada en cada fotograma. */
  private readonly hudOut = { city: '', next: '', dist: 0, dy: 0, kmh: 0, agl: 0, got: 0 };
  hud(): { city: string; next: string; dist: number; dy: number; kmh: number; agl: number; got: number } | null {
    const F = this.flight;
    if (!this.active || !F) return null;
    const H = this.hudOut;
    H.city = F.city.name;
    H.next = F.city.route[F.next].name;
    H.dist = F.toward.dist;
    H.dy = F.toward.dy;
    H.kmh = F.speed * 3.6;
    H.agl = F.agl;
    H.got = F.got;
    return H;
  }

  private end(): void {
    this.active = false;
    MAPVIEW.on = false;
    this.root.visible = this.room.visible = false;
    if (this.pad) this.pad.visible = this.padWas;
    const fog = (this.world.scene as unknown as { fog: { color: Color; density: number } | null }).fog;
    if (fog && this.fogWas) {
      fog.color.setHex(this.fogWas.color);
      fog.density = this.fogWas.density;
    }
    this.fogWas = null;
    const cam = this.world.camera as PerspectiveCamera;
    if (this.farWas) {
      cam.far = this.farWas;
      cam.updateProjectionMatrix();
    }
    // (al acabar la partida se sueltan los mapas: ocupan mucha memoria)
    this.disposeTiles();
    Scheduler.setXRSession(null as unknown as XRSession); // (vuelve al reloj de la página)
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

  /** Cómo va la carga: la raíz (0 sin pedir, 2 bajando, 4 recibida, −1 fallida), los trozos en cada paso, lo que ocupan en
   * memoria, la nitidez y la resolución. */
  private stateOf(tiles: TilesRenderer): string {
    const S = (tiles as unknown as { stats: Record<string, number> }).stats, r = this.world.renderer as WebGLRenderer, C = tiles.lruCache as unknown as { cachedBytes: number; isFull(): boolean };
    r.getSize(this.size);
    const fps = this.framesT > 0 ? Math.round(this.frames / this.framesT) : 0;
    this.frames = this.framesT = 0;
    return `a los ${Math.round(this.waitT)} s · ${fps} img/s · raíz ${(tiles as unknown as { rootLoadingState: number }).rootLoadingState} · en cola ${S.queued} · bajando ${S.downloading} · procesando ${S.parsing} · cargados ${S.loaded} · fallidos ${S.failed} · visibles ${tiles.visibleTiles.size} · memoria ${Math.round(C.cachedBytes / 1e6)} MB${C.isFull() ? ' (llena)' : ''} · nitidez ${Math.round(tiles.errorTarget)} · se ve a ${Math.round(this.farNow / 1000)} km · ${this.size.x}×${this.size.y}${r.xr.isPresenting ? ' (VR)' : ''}`;
  }

  /** Al diagnóstico y al registro del mapa (que enseña la página: no se borra a los 30 s). */
  private log(text: string): void {
    diagEvent(`Mapa: ${text}`);
    mapLog(text);
  }

  /** Un rayo contra el mapa desde `o` hacia `d` (los dos, en el mapa; `d`, de largo 1), hasta `far` m: a cuánto toca (m) o
   * NaN. El punto tocado queda en `this.v`, en el mapa. */
  private cast(o: Vector3, d: Vector3, far: number): number {
    if (!this.tiles) return NaN;
    this.root.localToWorld(o);
    d.transformDirection(this.root.matrixWorld);
    this.ray.set(o, d);
    this.ray.far = far;
    this.hits.length = 0;
    this.ray.intersectObject(this.tiles.group, true, this.hits as never);
    if (!this.hits.length) return NaN;
    this.root.worldToLocal(this.v.copy(this.hits[0].point));
    return this.hits[0].distance;
  }

  /** La altura de lo más alto que hay en (x, z), en el mapa (m: el suelo o el tejado), o NaN si aún no hay mapa ahí. Se mira
   * desde arriba del todo (por si un tejado te quedara encima). */
  private topAt(x: number, z: number, alt: number): number {
    const y0 = Math.max(alt + 20, 9000);
    return Number.isNaN(this.cast(this.v.set(x, y0, z), this.w.set(0, -1, 0), y0 + 2000)) ? NaN : this.v.y;
  }

  /** Lo libre que queda por delante, hacia donde vuelas (m; Infinity: nada cerca). */
  private aheadOf(F: MapFlight): number {
    const far = Math.max(MAP.aheadMin, F.speed * MAP.aheadT * 1.6) + MAP.stopAt;
    // (hacia donde vas de verdad: adelante y lo que subes o bajas)
    const sp = Math.max(8, F.speed);
    this.w.set(-Math.sin(F.heading) * sp, F.vs, -Math.cos(F.heading) * sp).normalize();
    const d = this.cast(this.v.set(F.x, F.alt, F.z), this.w, far);
    return Number.isNaN(d) ? Infinity : d;
  }

  /** El aro `i`, por encima de lo más alto que tenga debajo (un punto cada vez: su centro y cuatro de su borde). */
  private measureRing(F: MapFlight, i: number): void {
    const r = F.rings[i], [a, b] = RING_AT[this.ringPt++ % RING_AT.length];
    const g = this.topAt(r.x + a * MAP.ringR, r.z + b * MAP.ringR, 0);
    if (Number.isNaN(g)) return;
    const y = g + MAP.ringClear + MAP.ringR, y0 = F.ringY[i];
    if (Number.isNaN(y0) || y > y0) F.ringY[i] = y;
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
