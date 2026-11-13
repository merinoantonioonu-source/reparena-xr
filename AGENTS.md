# RepArena XR — léelo primero

Juego de ejercicio físico para **Meta Quest 3**, en el navegador de las gafas, hecho con el Immersive Web SDK de Meta
(IWSDK): es la migración de RepArena (`merinoantonioonu-source/reparena`). Cada repetición bien hecha es un disparo; el
objetivo es **hacer ejercicio**: cada mecánica tiene que pedir movimiento real del cuerpo, no solo de los dedos.

- **Antes de nada**, lee [`MIGRACION.md`](MIGRACION.md) (el plan, en qué PR vamos, cómo se trabaja y cómo se prueba) y
  [`docs/REGLAS.md`](docs/REGLAS.md) (las reglas de diseño que ha fijado el usuario: no se cambian sin preguntarle).
- Con el usuario, en **español**; también los textos del juego, los comentarios del código, los commits y los PR. El
  usuario no programa: explícale los cambios por lo que se ve y se siente en las gafas, no por el código.
- Cuando algo sea ambiguo o haya varias formas razonables de hacerlo, dale propuestas (o modelos visuales) y deja que
  elija. Cuando pregunte «¿entiendes lo que te digo?», resúmele lo que has entendido.
- **Lo que resuelve IWSDK, como lo resuelve IWSDK** (lo pidió el usuario: primarán siempre las soluciones de IWSDK de
  serie): si IWSDK hace algo de forma distinta a como lo hacía RepArena (leer y pintar las manos y los mandos —RepArena, en
  el curl con barra, a veces disparaba rayos al azar porque detectaba mal las manos—, los movimientos del cuerpo, la física
  de pulsar los menús, el pellizco, los rayos de apuntar, la física, las letras…, y también cómo se pintan las estructuras,
  las formas y los elementos de la escena: compuertas, armas… o las piezas para hacerlas, como sus objetos de escena, el
  JSON de la escena, su entorno, luces y sombras y sus habilidades `iwsdk-*`), se usa su solución de serie, sin forzar la
  de RepArena: la migración es precisamente para ver si así se van los problemas que tenía RepArena. IWSDK prima en todas
  las soluciones. De RepArena se porta lo que IWSDK no trae (la lógica del juego). Si en las gafas un problema vuelve, se
  busca primero lo que ofrezca IWSDK y, si no hay nada, se le proponen al usuario los apaños de RepArena; si la solución
  de IWSDK tiene un fallo, se arregla lo mínimo y se apunta en `MIGRACION.md` › Fallos de IWSDK. **Excepción (PR 30,
  decidida por el usuario: opción B): las manos y los menús son los de RepArena enteros** (IWSDK no especifica cómo deben
  comportarse y lo de serie iba peor).

## Dónde está cada cosa

| Ruta | Qué es |
| --- | --- |
| `src/index.ts` | Arranca el mundo y registra los sistemas (detrás de la física: leen las posiciones ya calculadas) |
| `src/assets.ts`, `src/components.ts`, `src/scene-assets/` | Los catálogos de IWSDK: recursos, componentes y objetos hechos en código |
| `src/core/` | Lo común: el estado compartido de la partida y los ajustes (los de RepArena: esquema, guardado, rangos) |
| `src/input/` | Manos, mandos y gestos, como en RepArena (opción B del usuario): leídos en `hands` y `head` (`hand-system.ts`), su suavizado, la mano perdida y el filtro `HF` (`hand-filter.ts`), y la sacudida, la mirada y el puñetazo, con pruebas |
| `src/exercise/` | Los detectores de repeticiones (`StandingDetector`: los de pie): lógica pura (sin IWSDK), con pruebas y comparados con RepArena |
| `src/combat/` | El modo Combate: la partida, los enemigos, las compuertas, los efectos y sus componentes |
| `src/style/` | El estilo Cómic: sombreado, contornos de tinta y efectos (se aplica solo a lo que aparece en la escena) |
| `src/ui/` | Paneles y letras |
| `src/audio/` | El sonido: el de IWSDK (AudioSource) con los efectos de RepArena (`SND`) y el catálogo por nombre |
| `sounds/` | Los sonidos: los del usuario (por nombre, ver su `LEEME.md`) y los de serie (`de-serie/`) |
| `public/` | Escena (`scenes/`), paneles (`ui/`), modelos, letras y manos (cada carpeta con su `LEEME.md` y licencia) |
| `tests/unit/` | Pruebas de la lógica pura (Vitest: `npm test`) |
| `tests/e2e/` | La partida simulada en un navegador sin gafas (`npm run test:e2e`) |

Los demás modos, en `src/modes/<modo>/` (Arcos: `arcs-system.ts` pinta lo que la lógica de `arc.ts`/`patterns.ts`/`state.ts` decide; qué modos y ejercicios se pueden jugar, `src/core/playable.ts`; los metros, `dist` en el historial); Spotify, el compás, la sincronización y el pulsómetro, en `src/services/` (los crea `hub.ts`; el pulso del juego, `src/core/beat-hub.ts`; las pantallas del menú, `HOOKS.openScreen` con las filas de `openMenu` (`src/ui/ra/menu-core.ts`)). La
tabla de `README.md` dice qué hace cada archivo.

## Cómo está hecho

- TypeScript estricto. Comentarios cortos en español que explican el porqué. Nada de crear objetos en `update()`.
- La lógica que no necesita IWSDK (detectores, ajustes, carrera…) va en módulos aparte, sin importar `@iwsdk/core`, y
  con pruebas en `tests/unit`. Si necesita cálculo en 3D (`Vector3`, `Quaternion`), lo importa de `'three'`: es el mismo
  paquete que reexporta `@iwsdk/core` (super-three, uno solo en `node_modules`) y así se prueba sin arrancar IWSDK.
- **Manos y mandos**: el juego lee `hands.left/right` y `head` (`src/input/hand-model.ts`): si se ve, la muñeca, las 25
  articulaciones (tal como las dan las gafas), el pellizco, el gatillo, el agarre, el rayo de apuntar y si el mando va
  como una mano (`virt`). Los llena `HandSystem` (`src/input/hand-system.ts`, justo detrás de la entrada de IWSDK) en cada
  fotograma, como RepArena (`src/input/hand-filter.ts`): lo que se pinta y pulsa menús va con la mano suavizada (`J.s`,
  `J.sq`, `tipS`); una mano calculada al perderla (`h.est`) no se pinta ni pulsa; `h.back`, el fotograma en que reaparece. La vibración, con `haptic(lado, fuerza, ms)`. Los mandos que se ven son los de IWSDK; las manos desnudas, los guantes de
  RepArena (`GloveSystem`) o la mano de IWSDK opaca (`SkinHand`), según «Manos que se ven»; la que agarra el mando, la de IWSDK
  opaca. La mano que se ve se apoya en los paneles (`HOLD`, `src/ui/ra/poke.ts`): lo que pinte manos nuevas, que lo sume.
- **Datos**: RepArena guarda todo en el navegador con claves `reparena3-*`, y las dos versiones comparten esos datos (se
  publican en el mismo sitio): usa las mismas claves con el mismo formato; lo nuevo, con `reparenaxr-*` (un ajuste que solo tiene RepArena XR lleva `xr: true` en
  el esquema y se guarda en `reparenaxr-settings`).
- **Ajustes**: se leen con `num`, `str` u `on` (`src/core/values.ts`), con `dv` si les afecta la dificultad creciente, y
  se cambian solo con `setSetting` (`src/core/settings.ts`). `initSettings()` se llama una vez al arrancar. Lo portado de
  RepArena se compara con su código original (`tests/compare`, ver `MIGRACION.md` › Cómo probar).
- **Ejercicios**: el detector (`StandingDetector`, `src/exercise/standing.ts`) recibe la cabeza y las manos tal como las da
  IWSDK y devuelve sucesos (`charge`, `power`, `rep`, `partial`, `top`, `say`); la partida (`src/combat/game.ts`) les pone
  la bola, el sonido, el rayo y los avisos. Lo que se hace mal (los `partial` y los `say` naranjas, `WARN_COL`) sale además
  en grande en el suelo (`floorWarn`). Lo que pide cada ejercicio (`StandCfg`) se lee de los ajustes al empezar cada
  oleada. Un ejercicio nuevo: su paso en el detector, su comparación en `tests/compare/standing.compare.test.ts` y sus
  líneas en `src/exercise/how.ts`. Los de suelo y sentado, en `FloorDetector` (`src/exercise/floor.ts`, misma forma; su
  comparación, `floor.compare.test.ts`); los que se pueden elegir, en `PLAY_EX` (`src/ui/fields.ts`).
- Los campos de un componente con `min` no admiten valores por debajo: `setValue` lanza un error y para el sistema
  entero (pasó con la vida de los zombis).
- La física (Havok) manda en la posición de los cuerpos dinámicos y cinemáticos: no se mueven escribiendo en su
  `object3D` (se pisa en cada paso). Los zombis se mueven pidiendo velocidad (`PhysicsManipulation`); la bola y tu
  cuerpo, teletransportándolos (`setBodyTransform`). Una `PhysicsManipulation` con todo a cero significa «no cambies».
- **Menús** (los de RepArena enteros, opción B del usuario: `src/ui/ra/`): cada menú es una lista de filas (`Row`: título,
  texto, dibujo, botones, pestañas, fichas, opciones, ajustes del esquema o columnas en cajas) que pinta `openMenu`
  (`menu-core.ts`) en una bandeja de 90 cm con teclas planas (`btn.ts`). Se pulsan con el dedo de cualquier mano (`poke.ts`:
  sólidas, pegadas, con imán y retirar el dedo) y con el rayo de IWSDK y la pinza o el gatillo (`RayInteractable` en el grupo
  de los menús). En las gafas salen de la muñeca («Menú en: Muñeca», de serie) o en el atril; cada menú nuevo, donde estaba el
  anterior. Los menús concretos, en `menus.ts` (`lobbyMenu`, `optionsMenu`, `pauseMenu`, `endMenu`, `perkMenu`); lo que pasa
  en cada fotograma, en `RaMenuSystem` (`menu-system.ts`). La partida y el menú se avisan con `HOOKS.startRound`,
  `HOOKS.showMenu`, `HOOKS.hideMenu`, `HOOKS.showSummary`, `HOOKS.pause`/`resume`, `HOOKS.perksOpen`/`perksClose` y
  `HOOKS.openScreen` (una pantalla de filas: la música, pasar datos…); `GAME.menu` dice cuál se ve (en pausa, `GAME.paused`
  para a todos). Un panel de menú nuevo, con su `menuOccluder` y sus texturas subidas al hacerlo (`upTex`). Lo que cambia en
  Spotify lo reparte `spSync` (`HOOKS.spChanged`): pone al día sin rehacer el menú si no cambia lo que enseña (`musicSig`).
- **Enemigos**: cada uno sale de su fila en `FOE_DEF` (`src/combat/foes.ts`: su modelo del catálogo, tamaño, nombres de sus
  animaciones —`idle`, `walk`, `run`, `attack`, `hit`, `death`, `dance`—, cuándo empieza y llega su golpe, su voz); su
  resistencia y su fuerza, de `devFoe` (la tabla del desarrollador). Uno nuevo: su fila, su modelo en `src/assets.ts`
  (`foe(...)`, que IWSDK carga después de arrancar) y en `public/models/` con su licencia, y su retrato en
  `public/retratos/`. La prueba `tests/unit/foes.test.ts` comprueba que sus animaciones están en el modelo. Los voladores, con `fly` en su
  fila: los saca `FlyerSystem` (`src/combat/flyers.ts`) con su vuelo (`Flight`, `src/combat/flight.ts`, de RepArena) y su
  número en `FLYER_KIND`; sin cuerpo de física mientras vuelan. Los blancos (`EnemySystem.targets`) son de todos.
  Los de tierra andan con su marcha (`Gait`, `src/combat/gait.ts`: forma de moverse, velocidades, amenaza y esquivas, de
  RepArena) pidiendo velocidad a la física; su reloj de gestos va a su `pace`.
- **Oleadas** (`src/combat/waves.ts`, de RepArena): `buildWave` da la cola de cada oleada con los nombres de RepArena
  (`impthrow`, `zombieboss`…); `xrFoe` dice cuál es aquí y si es jefe (`bossDef`). Los puntos y el combo, en `GAME`.
- **Avisos de la vista** (`ViewSystem`, `src/ui/view-panels.ts`; dónde, `src/ui/view.ts`, de RepArena): siguen la mirada
  sin ladearse nunca; tumbado, en el suelo bajo la cara; en partida, fijos; sin prueba de profundidad y apartándose de lo
  que viene. Lo que pide hacer algo ya va al aviso breve (`message(…, true)`, `HOOKS.say(…, true)`, `HOOKS.toast`); las
  celebraciones, al marcador. El del centro lo llena la partida en `VIEW.center` (calibración, «¡PREPÁRATE!»); la carátula
  del duelo (`HOOKS.duel`, `VIEW.duel`: mientras, la ronda espera). Lo que no es texto (la caricatura, la carátula) se
  pinta en un lienzo (`src/ui/canvas-kit.ts`, con las letras de `public/fonts`).
- **Carrera** (`src/core/career.ts`, de RepArena; en el juego, `career()` de `src/combat/career-hub.ts`): experiencia, nivel,
  misiones del día, cofre y escudos de racha; los guarda en `reparena3-career` (la misma clave y forma que RepArena). La
  partida le pasa cada ronda al acabar (`GameSystem.saveRun` → `career().run`) y cada segundo lo que llevas (`misLive`,
  `recLive`: los avisos grandes). Qué modos y ejercicios se pueden jugar aquí lo dice `playMode`/`playEx` del hub: las
  misiones de variedad solo piden lo que ya hay. El menú principal enseña las metas y la columna HOY, y Opciones → Progreso. La campaña (`src/core/campaign.ts`:
  `campBegin`, `campEnd`; `HOOKS.campPlay`) pone los ajustes del nivel por encima de los tuyos con `OVERLAY`: no se guardan.
- **La página web** (`index.html`, `src/page/`; la de RepArena, con su CSS en `page.css`): lo primero que se ve en el ordenador y
  en el navegador de las gafas. Cada apartado es una `<section>` de `.main` con `id` y `data-toc` (el índice y la app del
  móvil salen de ahí); el formulario de ajustes sale de `SCHEMA` y todo cambio pasa por `setSetting`. La escena de IWSDK
  vive en `#stage`, escondida tras la página; «Probar en el ordenador» y VR la enseñan. En el móvil (`html.app`, que pone
  el `<head>`), la página es una app (`src/page/app.ts`). Lo que llega con PR posteriores (Spotify, sesiones, sincronización,
  pulsómetro, tabla del desarrollador) añade su apartado con su `id`.
- **Tirones**: lo que se pinta por primera vez compila su sombreador y la imagen se para un instante en las gafas. Antes de cada
  ronda, lo de `warmKeep` (`src/style/warm.ts`) se compila de uno en uno en el menú y lo que falte, con la carátula del duelo
  ya en negro; nada pesado en el fotograma de EMPEZAR (la imagen se congelaba y seguía a la cabeza). No crees materiales en
  plena partida (para copiar uno, `fadeCopy` o `comicPatch`).
- **Casa**: RepArena XR es la única; la dirección vieja (`…/reparena/`) trae aquí y RepArena sigue en `…/reparena/clasica.html`
  para lo aplazado. Un ejercicio nuevo, con su prueba de movimientos en `tests/unit/exercises.test.ts`.
- La letra que trae IWSDK (Inter) no tiene tildes: los paneles usan las de `public/fonts` (ver su `LEEME.md`), que se
  ponen al cargar (`src/ui/fonts.ts`). En el UIKitML solo se pueden nombrar letras de IWSDK: los títulos llevan la clase
  `display` y el código les pone Bungee. Las letras se encogen solas si no caben (`src/ui/fit.ts`; un panel nuevo, en `PANELS`
  de `src/ui/fit-text.ts`); un carácter que no esté en las letras sale como un punto (ver su `LEEME.md`).
- **Diagnóstico** (`src/core/diag.ts`, `src/ui/diag-system.ts`): los últimos 30 s de las manos, el rayo, las teclas y los
  tirones; se guarda al salir de la VR y desde la pausa, y la página lo copia. Para un fallo de las gafas, pídeselo al usuario
  antes de arreglar nada; lo nuevo que convenga seguir, con `diagEvent`.
- Los modelos de las manos y los mandos se sirven desde el juego (`public/input-profiles`, `src/input/input-models.ts`).
- **Entornos** (`src/env/`): `EnvSystem` pone el fondo realista como `DomeTexture` de IWSDK en la raíz del nivel (`ajustes pano`) y las luciérnagas (`motes`); `Scenery` pinta el bosque o la isla (`scenery`) con instancias; dónde va cada modelo, `placement.ts`. El fondo realista y el entorno de día esconden el valle, las nubes y el suelo de cómic; Barras colgado (de noche, `nightForest`) los aparta.
- **Estilo Cómic** (el de serie): `ComicSystem` (`src/style/`) prepara todo lo que aparece con material estándar: su
  sombreado de cómic y su contorno de tinta. Lo nuevo, con `MeshStandardMaterial` de colores claros y lisos; sin contorno,
  `userData.noInk`. Los objetos de escena, con las habilidades de IWSDK (`iwsdk-build-model`, `iwsdk-compose-scene`).

---

# IWSDK project

A Vite + TypeScript or JavaScript app, but several things do **not** work the way
a normal Vite project works. Read this section before assuming anything.

Deeper material is installed in each selected harness's native path-scoped rule
format. Harnesses that use `AGENTS.md` also receive equivalent nested files near
the code they govern. Read the applicable scoped instructions before working in
that area.

Explain immersive terms in plain language when they first matter instead of
assuming the reader knows them. In particular, introduce XR (an immersive
session), IWER (IWSDK's browser-based XR emulator), ECS (entity-component
system), and controller target-ray versus grip poses with a link to the
applicable IWSDK guide or concept page.

## What is not standard Vite

**`iwsdk.config.json` is the project authority, not `vite.config.ts`.** It selects
the active scene, the asset module, the component module, and all XR/world
features. `vite.config.ts` only wires the plugin. Editing `iwsdk.config.json`
restarts Vite in place; the managed window remains open and its command bridges
reconnect automatically. Wait for `npx @iwsdk/cli dev status` to report
`browserCommandReady: true` before issuing browser-backed commands.

**`virtual:iwsdk-project` is a virtual module**, not a file. `src/index.ts` or
`src/index.js` imports it and passes it whole to `World.create()`. Do not
hand-build that options object.

**The dev server is CLI-managed.** Use `npx @iwsdk/cli dev up` (or `npm run dev`), not
`vite`. It launches a managed browser that hosts the MCP command bridge.
`--no-open` starts the server with managed-browser launch disabled. Server status
and explicitly paired physical targets remain available. A targetless managed
browser command then fails with `browser_not_launched`; it never falls through
to a physical page. Commands default to the managed browser. One managed
window hosts the editor and application roles. Browser failure leaves Vite and
HMR running. `runtime status`, `runtime targets`, and `runtime wait` do not recover
or launch a browser; `runtime recover` explicitly retries after a failure.

Pair a headset using `runtime pair-headset --input-json '{"headsetId":"ADB_SERIAL"}'`,
open the returned URL on that exact device through ADB reverse, then copy its
`runtimeTarget` from `runtime targets`. Include deviceClass, headsetId, pageId, and
tabGeneration on every physical command. Reload is supported through the page
bridge; screenshot, snapshot, interaction, profiling, console capture, and the
managed editor are host-only. Rediscover after reload to get the new generation.

The developer owns whether that managed window is headed or headless. Do not
change modes silently: announce the change before restarting. In a visible
collaboration session, use the Runtime/Editor toggle in the single managed
Chromium window. Its expected unsupported-flag banner comes from
`--ignore-certificate-errors` for the local development certificate. Playwright
may add separate sandbox-related flags in constrained environments.

**`src/assets.ts`/`src/assets.js` is evaluated twice, in two different JS
realms** — once by the app runtime, once by the editor. It must be deterministic
and side-effect free: no `World`, no DOM, no timers, no reliance on shared object
identity.

**Static geometry lives in TypeScript, composition lives in JSON.** Scene JSON
never declares URLs, geometry or materials — only manifest IDs.

**Components must be declared in a system-free module** and exported from
`src/components.ts`/`src/components.js` via `defineComponents()`. The editor
imports that same manifest to build its inspector, so a component that is not in
it cannot be authored in scenes.

**Import Three.js from `@iwsdk/core`, never from `three`.** `@iwsdk/core`
re-exports all of Three; importing `three` directly creates a duplicate instance
and subtle breakage. Exception: `import type { GLTF } from 'three/addons/...'`.

## Traps that produce silent failures

| Trap                                                           | Symptom                                                                  | Fix                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `locomotion: true` with no `LocomotionEnvironment` on a floor  | player falls through the world                                           | add the component to a walkable surface                                                  |
| Scene origin left occupied                                     | player spawns inside your geometry                                       | the player origin is `0,0,0` unless the scene authors `player.transform`                 |
| Scene JSON with `imports`                                      | authoring preview works, but editable open and runtime load are rejected | run `npx @iwsdk/cli scene flatten` once, then edit the flat output                       |
| `entity.destroy()`                                             | GPU memory leaked                                                        | use `entity.dispose()`                                                                   |
| `setValue` on a Vec2/Vec3/Vec4/Color field                     | throws in elics 3.4.x                                                    | use `entity.getVectorView(...)`                                                          |
| Environment component on a non-root entity                     | silently ignored                                                         | `DomeGradient`/`IBLGradient` go on the level root only                                   |
| `DomeFade` with no `DomeGradient` on the level root            | no fade; the floor keeps its hard edge                                   | add a `DomeGradient` (render stats report the DomeFade `inactiveReason`)                 |
| `DomeTexture`/`IBLTexture` prop changed without `_needsUpdate` | change ignored                                                           | set `_needsUpdate` after writing; `DomeGradient`/`IBLGradient` apply edits without it    |
| `ScreenSpace` given numbers                                    | clamped with a console warning                                           | it takes CSS strings: `'400px'`, `'25vw'`                                                |
| `@iwsdk/reference` MCP tools in an old or `--no-install` app   | queries report warmup required                                           | run `npx @iwsdk/cli reference warmup`; fresh installed scaffolds do this during creation |

## Verify before you claim it works

**Always `npm run --if-present typecheck` before testing.** Type errors stop systems
initialising without necessarily logging anything in the browser.

For a new multi-file procedural model, finish the initial asset module and manifest
registration before `npx @iwsdk/cli dev up`; do not keep the browser live while its import
graph is half-written. Typecheck first, then launch the managed editor for inspection.

Then check the right status for the task — these are not interchangeable:

- scene/editor work → `scene_get_state`
- XR device or session actions → `xr_get_session_status`
- server readiness → `npx @iwsdk/cli dev status` (XR availability is not a server signal)

When something is missing but the console is clean: call
`browser_get_console_logs` with only `count` (a `level` filter hides errors), then
`ecs_find_entities` to confirm the entity exists and carries the components you
expect.

The non-obvious part is which observation proves what: the **editor** render does
not run application systems, so anything driven by a system must be verified with
`browser_screenshot` (runtime), not `scene_screenshot` (editor).

Pose, controller/hand alignment, and immersive interaction claims require an
active XR session (`npx @iwsdk/cli xr status`). A flat runtime screenshot taken
outside XR can prove that the app renders, but it cannot prove immersive pose or
interaction correctness.

For a physical headset smoke test, run `npx @iwsdk/cli dev status`, open a URL from
`data.runtimeUrls.network` on a headset connected to the same Wi-Fi network,
and accept the expected local certificate warning. To run or automate the app
on a Quest connected over USB, invoke `iwsdk-native-xr-test` instead. See
[Testing Your Experience](https://iwsdk.dev/guides/02-testing-experience.html)
for the complete workflow.

**Meta VR Glasses are not a Quest.** Their view is much narrower (37° left and
right, 25° up, 43° down) and their main input is gaze plus a pinch. Before
claiming an app works on the glasses, or when it uses gaze or eye tracking,
invoke `iwsdk-glasses-test`: it sets the `metaVRGlasses` emulator device, checks
that content fits that view, and drives gaze and pinch from the CLI. A Quest
screenshot or the editor view cannot show that fit.

## MCP and CLI are one surface, not two

Nearly every capability exists both ways — `scene_render_file` and
`npx @iwsdk/cli scene render-file`, `ecs_find_entities` and `npx @iwsdk/cli ecs find`,
or `ui_inspect` and `npx @iwsdk/cli ui inspect`.
Discover CLI actions with the bare domain or domain help (`npx @iwsdk/cli scene` or
`npx @iwsdk/cli scene --help`); both list that domain's actions.

**CLI and MCP share the same target resolver and recovery policy.** A managed
command can recover a missing managed browser; it then returns
`browser_relaunched` with `outcome: "not_executed"`. Inspect the new state and issue
a fresh command. `outcome_unknown` means a dispatched mutation may have executed;
inspect state before retrying. Requests are never broadcast or replayed on
reconnect. Host browser tools can remain usable while a runtime bridge is loading.

Choose by the shape of the call, not by availability:

- **MCP** for one-off calls. Screenshot tools persist the PNG locally and return
  `screenshotPath`; read that file only when visual inspection is needed.
- **CLI** when you need to loop or script — rendering six views, or sampling a
  value twice to measure a rate — or when the response is big enough to be worth
  filtering before it reaches context. A render of a scene containing an
  instanced pattern returns an id for every expanded instance.

For screenshot-producing CLI commands, the default response writes the image to a
temporary file and returns a normal envelope with metadata under `data.result` and
the path at `data.screenshotPath`. `--output-file <path>` selects the destination and
keeps that same metadata, including hashes and render statistics. `--raw` instead
prints the raw runtime result, including base64 `imageData`; when both flags are
present, `--output-file` takes precedence and image bytes are omitted.

## Skills

Invoke `iwsdk-dev` first for any request that builds, extends, fixes, tunes,
or polishes the app. It privately selects the greenfield planner path or the
bounded established-app iteration path; do not look for those paths as separate
public skills.

The selected playbook routes work to the narrowest owning specialist:

- creating or materially changing one glTF or procedural 3D asset →
  `iwsdk-build-model`;
- arranging existing assets, scene JSON, cross-asset contacts, lighting,
  environment, or cameras → `iwsdk-compose-scene`;
- a mixed build → finish every new or changed model, including support and set assets,
  with `iwsdk-build-model`, then compose the scene with `iwsdk-compose-scene`;
- a model-local defect found during composition routes back to `iwsdk-build-model`;
  a placement or lighting defect stays in `iwsdk-compose-scene`.

UI authoring, physics, depth occlusion, grab and ray interaction testing, ECS
frame-stepping, and debugging have their own project skills. Use them only when
the selected `iwsdk-dev` playbook calls for the matching specialty.
Two device-testing skills are invoked directly: `iwsdk-native-xr-test` whenever
the user wants to run, automate, or debug the app on a connected Quest, and
`iwsdk-glasses-test` whenever the user targets Meta VR Glasses or asks for gaze
input.

The failure worth guarding against is improvising a domain that already has a
skill because the naive approach looks tractable. Before hand-authoring scene
JSON, a 3D model, a UIKitML panel, or a physics body, invoke the owning skill.

## Layout

```
iwsdk.config.json      project authority: scene, assets, components, world, dev
src/index.ts|js        World.create() + explicit system registration
src/assets.ts|js       defineAssets() — shared runtime/editor catalog
src/components.ts|js   defineComponents() — shared runtime/editor catalog
src/scene-assets/      *.scene-asset.ts|js — parentless Object3D prototypes
public/scenes/         *.iwsdk.scene.json — composition only
public/ui/             *.uikitml — runtime-loaded panels
```

No barrel `index.ts` files. Keep component declarations free of system, DOM and
renderer imports; systems import the declarations, never the reverse.

## Conventions

- Systems use queries, never manually tracked entity arrays.
- Never allocate in `update()`. Allocate in `init()` as class properties.
- Prefer `queries.x.subscribe('qualify', ...)` over polling state each frame.
- Register every subscription teardown in `this.cleanupFuncs`.
- Use `signal.peek()` in `update()`; `.value` adds per-frame subscription overhead.
- Load assets through `AssetManager` / the manifest, never a raw `GLTFLoader`.
- Create entities with `world.createTransformEntity(...)`, never `scene.add()`.
- Use the `RayInteractable` component, never a manual `Raycaster`.
- VR targets 72–90 fps: 11–14 ms per frame. Treat per-frame allocation as a bug.

## Deep reference

Harness-native scoped rules cover `public/scenes/**`, `public/ui/**`,
`src/assets.ts`, `src/scene-assets/**`, and `src/**/*.ts`. `AGENTS.md`-based
harnesses receive nested instruction files; Cursor and Copilot receive their
native rule formats. Skill procedures live in the selected harness's project
skill directory and state when they apply.
