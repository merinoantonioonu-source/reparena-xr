# Migración de RepArena a RepArena XR

RepArena (`merinoantonioonu-source/reparena`: Three.js r128 hecho a mano, unas 17.500 líneas) se pasa entero a este
repositorio, sobre el Immersive Web SDK de Meta (IWSDK). El prototipo (PR #1) demostró que en las gafas va mucho más
fluido y se ve mejor. Este archivo es **el plan y el diario de la migración**: lo siguen todas las IA que trabajen en
ella (una cada vez, nunca a la vez) y cada PR lo deja al día.

## Antes de empezar un PR

1. Lee este archivo entero, [`docs/REGLAS.md`](docs/REGLAS.md) (las reglas de diseño del usuario) y `AGENTS.md`
   (cómo está hecho el código y la guía de IWSDK).
2. Coge el primer PR sin marcar de [Estado](#estado), en orden (o el que te haya asignado el usuario).
3. Haz una rama nueva desde el `main` más reciente.
4. Ten a mano RepArena (`git clone https://github.com/merinoantonioonu-source/reparena`) y lee los módulos que portas:
   sus números, sus reglas y sus comentarios explican el porqué de cada cosa.
5. Lee las [Notas para el siguiente PR](#notas-para-el-siguiente-pr): las deja quien hizo el anterior.

## Cómo se trabaja

- **RepArena está congelado**: nada nuevo allí, solo arreglos urgentes (si no, migraríamos algo que no para de cambiar).
  Lo nuevo va aquí.
- **Un PR cada vez, en orden.** Cada PR deja `main` jugable y publicado (GitHub Pages se publica solo al fusionar). Si un
  PR crece demasiado, se parte en a/b sin cambiar el orden.
- **Mismos datos.** RepArena guarda todo en el navegador con claves `reparena3-*` (ajustes, historial, carrera,
  sesiones, Spotify, sincronización…). Las dos versiones se publican en el mismo sitio
  (`merinoantonioonu-source.github.io`), así que **comparten esos datos**: usa las mismas claves con el mismo formato y lo
  del usuario aparece solo, sin exportar nada. Lo que solo exista aquí, con claves `reparenaxr-*`. La sincronización
  (Firebase) también es la misma: las dos versiones se sincronizan entre sí hasta el cambio de casa.
- **Lo que resuelve IWSDK, como lo resuelve IWSDK** (pedido del usuario en el PR 3: «primarán siempre las soluciones de
  IWSDK de serie»). Si IWSDK resuelve algo de forma distinta a como lo hacía RepArena, se usa su solución de serie, sin
  forzar la de RepArena: la migración es precisamente para ver si las soluciones de IWSDK resuelven los problemas que
  tenía RepArena. Por ejemplo: la lectura de las manos (RepArena, sobre todo en el curl con barra, a veces disparaba rayos
  al azar porque detectaba mal las manos), los movimientos del cuerpo, la física de pulsar los menús, pintar las manos y
  los mandos, el pellizco, los rayos de apuntar, la física de los cuerpos, las letras… Los apaños de RepArena para esas
  cosas no se portan (en `docs/REGLAS.md`, marcados **[Con IWSDK, de serie]**); si en las gafas vuelve un problema, se
  busca primero lo que ofrezca IWSDK y, si no hay nada, se le proponen al usuario los de RepArena. Si la solución de
  IWSDK tiene un fallo, se arregla lo mínimo y se apunta en [Fallos de IWSDK](#fallos-de-iwsdk).
- **Portar, no copiar.** Cada parte se rehace sobre IWSDK (sistemas y componentes, física Havok para los cuerpos,
  paneles UIKit para los menús, las manos y mandos de IWSDK), conservando el comportamiento y los números de RepArena en lo
  que IWSDK no trae (la lógica del juego). La lógica pura (detectores, ajustes, sacudida, carrera, sesiones…) se pasa casi
  tal cual a módulos sin IWSDK, con pruebas y comparada con el código de RepArena.
- **Las reglas de diseño siguen valiendo** (`docs/REGLAS.md`). Las marcadas **[A REVISAR]** se deciden con el usuario
  en el PR que dicen, con propuestas. Si algo no puede hacerse igual en IWSDK, se le pregunta; no se decide por él.
- Con el usuario, en **español**; también los textos del juego, los comentarios, los commits y los PR. El usuario no
  programa: los cambios se le explican por lo que se ve y se siente en las gafas.

## Qué deja cada PR

- `npm run typecheck`, `npm test` y `npm run test:e2e` en verde (la comprobación de cada PR en GitHub los pasa).
- La lógica nueva, con pruebas en `tests/unit`; si cambia la partida, la partida simulada (`tests/e2e/run.mjs`) al día.
- Lo nuevo probado en la VR simulada (emulador de IWSDK) y en el ordenador; capturas si cambia algo visual.
- Al día: `README.md` (qué hay y dónde), `AGENTS.md` (convenciones nuevas) y este archivo (marcar el PR en Estado,
  dejar las notas para el siguiente y los fallos conocidos).
- El PR, en español: qué cambia (lo que se ve en las gafas), cómo se ha probado, **qué mirar en las gafas** (lista corta
  para el usuario) y fallos conocidos.
- Lo fusiona quien lo hizo si el usuario se lo ha permitido, con la comprobación en verde; si no, el usuario.

## Cómo probar

```bash
npm ci
npm run typecheck      # siempre lo primero: un error de tipos puede parar los sistemas sin avisar
npm test               # la lógica pura (Vitest, tests/unit)
npm run test:e2e       # construye y juega una partida simulada en un navegador sin gafas (tests/e2e/run.mjs)
npm run build          # la versión publicable, en dist/
RA_DIR=../reparena npm run test:compare   # compara lo portado con el código original de RepArena (tests/compare)
```

- **Comparar con RepArena** (`tests/compare`): ejecuta trozos del código original de RepArena (con `RA_DIR` apuntando a
  un clon suyo en `main`) junto a lo portado, con los mismos datos y miles de cambios al azar, y comprueba que dan lo
  mismo. Así se portaron los ajustes (`settings.compare.test.ts`: 24.000 cambios, idénticos) y la sacudida y la mirada
  (`throw.compare.test.ts`: manos al azar durante miles de fotogramas, los mismos rayos; `SEEDS=200` para más). Úsalo
  para portar cualquier lógica pura (detectores, carrera, sesiones…): `raSlice` saca las líneas entre dos marcas de un
  archivo de RepArena y `raRun` las ejecuta aisladas. No va en la comprobación de GitHub (allí no está RepArena).

- **Modo ordenador** (la página sin gafas): flecha abajo (o S) para agacharse (al subir, el rayo sale solo al zombi más
  cercano, como en RepArena) y Enter para empezar. `window.__rx.snapshot()` da el estado de la partida en datos simples
  (lo usa la partida simulada).
- **VR simulada** (unas Quest 3 emuladas, IWER): `npx @iwsdk/cli dev up --ai-mode agent` y luego, por ejemplo,
  `xr enter`, `xr look-at` y `xr select` (apuntar y apretar el gatillo), `xr animate-to` con `headset` (bajar la cabeza
  = sentadilla) o con una mano (sacudidas), `xr set-input-mode` (`hand`/`controller`), `ecs find`/`ecs query` (el
  estado de los enemigos), `browser screenshot`, `browser logs` y `browser reload`. Todo con `npx @iwsdk/cli <dominio>
  <acción> --input-json '{…}'`; `npx @iwsdk/cli xr --help` lista las acciones. Para las manos: `xr set-transform` o
  `xr animate-to` con `"device":"hand-right","anchor":"wrist"` (una sacudida: de la cadera hacia el zombi en 0,15 s); para
  los mandos, `xr set-gamepad-state` (botón 0 el gatillo, 1 el agarre). En desarrollo, el juego escribe en la consola
  (`browser logs`) las repeticiones y los rayos que salen de las manos (`rxdbg`).
- Sin tarjeta gráfica, el emulador va a unas 5 imágenes por segundo: todo pasa a cámara lenta y una pulsación con el dedo
  dura más de lo que IWSDK acepta como clic (en las gafas, no). Cambiar el código recarga la página y cierra la sesión de
  VR. Si la ventana del emulador se queda con un error viejo de Vite, `npx @iwsdk/cli dev restart`.
- **Chromium de Playwright**: la partida simulada y el emulador usan el Chromium de Playwright 1.65 (versión 1254).
  Instálalo con `npx playwright install chromium`; si no se puede descargar pero hay otro Chromium en el sistema, crea
  una carpeta con `chromium-1254/chrome-linux64` enlazada a la carpeta de ese Chromium (más los archivos vacíos
  `INSTALLATION_COMPLETE` y `DEPENDENCIES_VALIDATED`) y apunta `PLAYWRIGHT_BROWSERS_PATH` a ella.

## Estado

- [x] **PR 0 · Prototipo** (Combate con sentadillas, para decidir) — #1
- [x] **PR 1 · Plan, reglas y pruebas** — #2
- [x] **PR 2 · Ajustes y datos** — #3
- [x] **PR 3 · Manos, mandos y gestos** — #4
- [ ] **PR 4 · Estilo Cómic y la arena**
- [ ] **PR 5 · Sonido**
- [ ] **PR 6 · Ejercicios de pie**
- [ ] **PR 7 · Menú principal y Opciones en VR**
- [ ] **PR 8 · Enemigos**
- [ ] **PR 9 · Armas y defensa**
- [ ] **PR 10 · Oleadas y premios**
- [ ] **PR 11 · Ejercicios de suelo**
- [ ] **PR 12 · Menú de muñeca, resumen, carátula del duelo y caricatura**
- [ ] **PR 13 · Carrera y progreso**
- [ ] **PR 14 · Página web y app del móvil**
- [ ] **PR 15 · Arcos**
- [ ] **PR 16 · Toques**
- [ ] **PR 17 · Barras**
- [ ] **PR 18 · Travesía**
- [ ] **PR 19 · Sesiones**
- [ ] **PR 20 · Entornos**
- [ ] **PR 21 · Realidad mixta**
- [ ] **PR 22 · Música**
- [ ] **PR 23 · Sincronización, pulsómetro y modo desarrollador**
- [ ] **PR 24 · Cambio de casa**

## Los PR

Cada uno: qué cubre, de dónde sale en RepArena y cuándo está listo. Tamaño orientativo: S (pequeño), M (mediano), L
(grande), XL (muy grande; seguramente en dos).

### Fase 0 · Cimientos (mejor seguidos y por la misma IA: fijan cómo se trabaja)

**PR 1 · Plan, reglas y pruebas** (S)
- Este plan, las reglas de diseño de RepArena (`docs/REGLAS.md`, con las de «a revisar» marcadas) y las convenciones en
  `AGENTS.md` (las lee cualquier IA; `CLAUDE.md` lo incluye).
- Carpetas del código ordenadas; el detector de la sentadilla, como módulo puro con pruebas (`src/exercise/vertical.ts`).
- Pruebas: Vitest (`npm test`) y la partida simulada (`npm run test:e2e`), las dos en la comprobación de cada PR.
- En las gafas no cambia nada.

**PR 2 · Ajustes y datos** (M)
- Los 186 ajustes de RepArena (su esquema, con grupos, condiciones y explicaciones), los perfiles y rangos, los valores
  por modo y ejercicio, y sus migraciones; guardados en las mismas claves `reparena3-*`.
- De RepArena: `src/00_core.js` (`SCHEMA`, `settings`, `store`, `dv`, `MODE_EX`, `EX_NAMES`…) y lo que lea de
  `src/67_dev.js` (la tabla por rango).
- Listo cuando: el prototipo usa los ajustes del usuario (profundidad de la sentadilla, PERFECTA, aguante del ×2…)
  leídos de los que ya tiene RepArena en el navegador, y guardar aquí no rompe RepArena (pruebas de ida y vuelta).

**PR 3 · Manos, mandos y gestos** (M) — hecho
- Las manos y los mandos, los de IWSDK de serie (se ven, se pierden y pellizcan como dice IWSDK; sin el suavizado, las
  manos inventadas ni el seguimiento del cuerpo de RepArena); con «Mandos como manos», la mano de IWSDK que agarra el
  mando (con sus fallos arreglados: `src/input/controller-hand.ts`).
- De RepArena, lo que IWSDK no trae: la **sacudida** exacta (`THROW_*`), «al que miras» (la mirada que fija al enemigo),
  el gatillo con mandos como manos (gatillo + agarre = puño, no dispara), el puñetazo, el puño (`isFist`), la diana de
  líneas de enfoque y la vibración; y el flujo de RepArena: la bola estalla al subir y la carga pasa a las dos manos
  (un orbe en cada muñeca), con el daño de RepArena.
- Comparado con el código de RepArena (`tests/compare/throw.compare.test.ts`) y con pruebas de trayectorias simuladas
  (`tests/unit/throw.test.ts`, `gestures.test.ts`).

**PR 4 · Estilo Cómic y la arena** (L)
- Sombreado plano con corte duro, contornos de tinta (finos de lejos, solo en el borde de verdad), cielo y suelo de
  dibujo; la arena con sus compuertas (interior oscuro al abrirse). Queda como el estilo de serie.
- De RepArena: `src/38_comic.js`, `src/30_env.js`, `src/20_render.js`.
- Listo cuando: se ve como RepArena en Cómic, a 72 imágenes por segundo en las gafas.

**PR 5 · Sonido** (M)
- El motor de sonido de RepArena (sintetizado, en 3D, reverberación), los archivos de `sounds/` (sustituibles, con su
  `LEEME.md`) y el ambiente (a 0 % mientras suena Spotify).
- De RepArena: `src/10_audio.js`, `sounds/`.

### Fase 1 · Combate completo

**PR 6 · Ejercicios de pie** (L)
- Detectores de zancada, sentadilla con salto, con press y con elevación, swing, peso muerto, curl, curl con barra,
  antebrazos y elevación frontal, con sus cargas ×2-×4, PERFECTA, avisos de lo que se hace mal (grandes, en el suelo) y
  «Tu cuerpo (recorridos)»; un selector sencillo de ejercicio en el panel de inicio hasta el PR 7.
- De RepArena: `src/70_game.js` (detectores, `CHAIN`, `topCue`…).
- **Las manos, las de IWSDK** (criterio del usuario): en RepArena, sobre todo en el curl con barra, a veces salían rayos
  al azar porque detectaba mal las manos (manos inventadas, saltos del seguimiento, las dos manos pegadas en la pesa).
  Aquí los detectores leen las manos tal como las da IWSDK (`hands`, sin manos inventadas), y los apaños de RepArena para
  eso (el filtro `HF` de las dos manos juntas, `handEx`…) no se portan. Si en las gafas vuelven los rayos al azar, se
  busca primero lo que ofrezca IWSDK y, si no hay nada, se le propone al usuario.

**PR 7 · Menú principal y Opciones en VR** (L)
- EMPEZAR, metas de hoy, columna HOY, modos, ejercicios, dificultad (galones, «Al fallo», la ficha de la ronda),
  Spotify; Opciones en pestañas, salidas del esquema de ajustes, con la tecla «?».
- **Las teclas, como las pulsa IWSDK** (lo pidió el usuario: la física del toque de los menús es la de IWSDK de serie):
  los botones de UIKit con su pulsación (el dedo o el rayo); las reglas de las teclas de RepArena (sólidas, imán,
  pegadas, retirar el dedo) no se portan. Lo que no es de la pulsación (la pantalla invisible detrás de cada menú, un
  apaño de rendimiento) se mide en las gafas antes de decidir.
- De RepArena: `src/60_ui.js`.

**PR 8 · Enemigos** (L)
- Todos los de RepArena, desde una tabla (robots, diablillo, puglin, lanzador, zombis, raptor, piratas, monstruitos,
  voladores…), con física: rodean los obstáculos, no se atraviesan, bailan al compás esperando; compuertas, cuentas de
  vida (`LIFE`), retratos y la tabla del desarrollador.
- De RepArena: `src/40_models.js`, `src/42_beasts.js`, `src/70_game.js`.

**PR 9 · Armas y defensa** (L)
- Rayos con el aspecto de RepArena, pistolas, espadas; escudo, guardia, esquiva, onda y burbuja (el puñetazo, la diana y
  la vibración ya están, del PR 3).
- De RepArena: `src/52_bolt.js`, `src/54_suporb.js`, `src/76_sword.js`, `src/77_guard.js`.

**PR 10 · Oleadas y premios** (M)
- Dificultad entre oleadas, panel entre oleadas, «Al fallo», cartas de mejora (cada tres oleadas), enemigo dorado,
  relámpago y cofre; celebraciones en el marcador y trofeos dorados; el marcador elegido (C).
- De RepArena: `src/79_perks.js`, `src/70_game.js`, `src/60_ui.js` (`cheer`, `trophy`).

**PR 11 · Ejercicios de suelo** (L)
- Flexiones, inchworm, fondos, plancha con un brazo, plancha lateral y superman, con los avisos en el suelo y el
  marcador tumbado sólido.
- De RepArena: `src/70_game.js`.

### Fase 2 · Alrededor de la partida

**PR 12 · Menú de muñeca, resumen, carátula del duelo y caricatura** (M)
- De RepArena: `src/60_ui.js`, `src/64_intro.js`, `src/62_demo.js`.

**PR 13 · Carrera y progreso** (M)
- Experiencia, nivel, títulos y colores; misiones del día con su cofre y escudos de racha; campaña (7 regiones, jefes,
  estrellas); Progreso.
- De RepArena: `src/73_career.js`.

**PR 14 · Página web y app del móvil** (L)
- La página con su índice y el formulario de ajustes, «Probar en el ordenador», la app del móvil (modelo C) y el
  logotipo para instalarla.
- De RepArena: `src/page.html`, `src/63_app.js`, `src/68_prefs.js`, `icons/`, `manifest.webmanifest`.

### Fase 3 · Los demás modos

- **PR 15 · Arcos** (L) — `src/71_arcs.js` y su parte de `src/70_game.js`.
- **PR 16 · Toques** (L) — `src/74_touch.js`.
- **PR 17 · Barras** (L): aparatos que se recuerdan, colgado, bosque nocturno, remolino y tentáculos — `src/72_bars.js`,
  `src/35_equip.js`, `src/32_forest.js`, `src/36_vortex.js`.
- **PR 18 · Travesía** (XL; seguramente 18a y 18b) — `src/75_trek.js`.
- **PR 19 · Sesiones** (M) — `src/66_session.js`.

### Fase 4 · Mundo y servicios

- **PR 20 · Entornos** (L): bosque de día, isla pirata, fondos realistas, luciérnagas y el estilo Realista como opción —
  `src/34_nature.js`, `src/39_island.js`, `src/56_motes.js`, `models/fondos/`.
- **PR 21 · Realidad mixta** (M): habitación escaneada o colocada a mano, que se recuerda — `src/37_room.js`.
- **PR 22 · Música** (M): Spotify y el compás — `src/65_music.js`. El usuario tendrá que añadir la dirección nueva en su
  panel de desarrollador de Spotify.
- **PR 23 · Sincronización, pulsómetro y modo desarrollador** (M) — `src/69_xfer.js`, `src/57_pulse.js`,
  `src/67_dev.js`.

### Fase 5

**PR 24 · Cambio de casa**
- Repaso de todo frente a RepArena en las gafas y de rendimiento (72 imágenes por segundo); la dirección vieja de
  RepArena lleva a la nueva (un PR en el repositorio viejo); esta pasa a ser la única.

## Notas para el siguiente PR

*(Las deja quien acaba cada PR: lo que el siguiente tiene que saber.)*

- PR 3 → PR 4: las manos, en `hands.left/right` y `head` (`src/input/hand-model.ts`), que llena `HandSystem` en cada
  fotograma con lo que da IWSDK (la muñeca, las 25 articulaciones, el pellizco, el gatillo, el agarre, el rayo, `virt`
  con mandos como manos). Los ejercicios del PR 6 leen de ahí. Lo que se lanza: `throwCharge`/`throwStep`
  (`src/input/throw.ts`) con un `ThrowEnv` que da el juego; a quién se apunta, los enemigos como `Target` (en Combate,
  `EnemySystem.targets`); la diana, `LockLines` (`src/combat/lockline.ts`).
- Las manos se ven como las pinta IWSDK (su estilo: contorno blanco). Si el estilo Cómic (PR 4) las quiere de otra forma,
  propónselo al usuario antes (son de IWSDK).
- Los ajustes se leen con `num('clave')`, `str('clave')` u `on('clave')` (`src/core/values.ts`), con `dv('clave',
  oleadas)` si les afecta la dificultad creciente, y se cambian solo con `setSetting` (guarda donde RepArena: lo verá
  también RepArena). Las reglas que dependen de los ajustes (`handsFree`, `foes`, `autoAim`, `twoShots`…) están en
  `src/core/rules.ts`.
- El juego es siempre Combate con sentadillas, pero con los ajustes del modo y ejercicio que tenga elegidos el usuario
  (los últimos de RepArena): si tenía elegido el curl, la dificultad es la del curl. Se arregla al portar los ejercicios
  (PR 6) y el menú (PR 7). No elijas el ejercicio por código con `setSetting` antes: cambiaría también el de RepArena.
- La nitidez se guarda aparte (`reparenaxr-quality`): RepArena tiene la suya (`quality`, con otras opciones) y este motor
  pide otra resolución. Se decide en el PR 7 si se unen.

## Fallos conocidos

- Pulsar los paneles con el dedo no se ha podido comprobar en el emulador (va demasiado lento); en las gafas, por ver.
- La dificultad creciente sube con cada oleada; en RepArena solo con las superadas con soltura (pocos golpes): llega en el
  PR 10.
- Sin pistolas ni espadas todavía (PR 9): si el usuario las tiene puestas en RepArena, aquí se lanza con las manos.
- «Manos con el cuerpo» no hace nada aquí: IWSDK no pide el seguimiento del cuerpo (criterio de usar IWSDK de serie).

## Fallos de IWSDK

Los que se han encontrado en la versión que usamos (`@iwsdk/core` 1.1.0-rc.2) y cómo se sortean. Si una versión nueva los
arregla, se quita el apaño.

- **La mano que agarra el mando** (`AnimatedControllerHand`, para «Mandos como manos») no funciona tal cual: recibe los
  datos en otro orden del que le pasa IWSDK (cogía la escena entera y fallaba al crearse), le carga el modelo del mando en
  vez del de la mano, compartiría el modelo con la mano desnuda y, si una imagen tarda más de 0,1 s, los dedos se le
  disparan (planos blancos enormes y luego la mano desaparece). Apaño: `src/input/controller-hand.ts`.
