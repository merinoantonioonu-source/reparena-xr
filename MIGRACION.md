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
  los mandos, el pellizco, los rayos de apuntar, la física de los cuerpos, las letras… Y también **cómo se pintan las
  estructuras, las formas y los elementos de la escena**: si IWSDK trae compuertas propias (o algo parecido), armas,
  etc., o las piezas para hacerlas (sus modelos, los objetos de escena hechos en código de `src/scene-assets/`, la
  composición en el JSON de la escena, el entorno, las luces y las sombras de IWSDK, y sus habilidades para construir
  modelos y componer escenas), primará IWSDK. IWSDK prima en todas las soluciones. Los apaños de RepArena para esas
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
- **Una ronda completa en la VR simulada** (comprobada al cerrar la fase 0; `rxdbg sonido`, `rxdbg rayo` y `rxdbg repetición`
  en `browser logs`; los registros se acumulan entre recargas, mira la hora): `browser reload`, `xr enter`, `xr look-at`
  del mando derecho al botón EMPEZAR (0, 1.31, -1.5) y `xr select` (con `--timeout 60000`); luego `xr set-input-mode`
  `hand`, las dos muñecas a la cadera con `xr set-transform` (`anchor: wrist`, x ±0,25, y 0,95, z -0,1), `xr animate-to`
  de `headset` a y 1,0 y de vuelta a 1,6 (la sentadilla, 1 s cada una) y, para la sacudida, `xr animate-to` de cada
  muñeca a (0, 1,2, -0,6) en 0,3 s (más deprisa, el emulador la ve como un salto del seguimiento y no cuenta). Hay que
  hacerlo seguido: los zombis tardan unos 40 s en llegar y, si no, se pierde la ronda.
- Sin tarjeta gráfica, el emulador va a unas 5 imágenes por segundo: todo pasa a cámara lenta y una pulsación con el dedo
  dura más de lo que IWSDK acepta como clic (en las gafas, no). Cambiar el código recarga la página y cierra la sesión de
  VR. Si la ventana del emulador se queda con un error viejo de Vite, `npx @iwsdk/cli dev restart`.
- **Preparar el escenario en la VR simulada** (adelantar un descanso, sacar las cartas o el cofre): arranca el servidor con
  `npx @iwsdk/cli dev up --headless --allow-browser-automation` y ejecuta, por ejemplo,
  `RX_EVAL='(__rx.game.rw.perks.offerT = 0.2, 1)' npx @iwsdk/cli browser run tests/vr/eval.mjs`. Solo para preparar: lo
  que se prueba, con las gafas y los mandos emulados (`xr look-at`, `xr select`, `xr animate-to`).
- **Chromium de Playwright**: la partida simulada y el emulador usan el Chromium de Playwright 1.65 (versión 1254).
  Instálalo con `npx playwright install chromium`; si no se puede descargar pero hay otro Chromium en el sistema, crea
  una carpeta con `chromium-1254/chrome-linux64` enlazada a la carpeta de ese Chromium (más los archivos vacíos
  `INSTALLATION_COMPLETE` y `DEPENDENCIES_VALIDATED`) y apunta `PLAYWRIGHT_BROWSERS_PATH` a ella.

## Estado

- [x] **PR 0 · Prototipo** (Combate con sentadillas, para decidir) — #1
- [x] **PR 1 · Plan, reglas y pruebas** — #2
- [x] **PR 2 · Ajustes y datos** — #3
- [x] **PR 3 · Manos, mandos y gestos** — #4
- [x] **PR 4 · Estilo Cómic y la arena** — #5
- [x] **PR 5 · Sonido** — #6
- [x] **PR 6 · Ejercicios de pie** — #8
- [x] **PR 7 · Menú principal y Opciones en VR** — #9
- [x] **PR 8a · Enemigos de las compuertas con su modelo** — #10
- [x] **PR 8b · Diablillo, puglin y lanzador** — #11
- [x] **PR 8c · Voladores con modelo (abeja, murciélago, Cthulhu y dragón)** — #12
- [x] **PR 8d · Amenazas, formas de moverse, rapidez de gestos y esquivas** — #13
- [ ] **PR 9 · Armas y defensa** (aplazado por el usuario: se hará más adelante; después del 8d va el 10)
- [x] **PR 10a · Oleadas, jefes, puntos y combo** — #14
- [x] **PR 10b · Premios: cartas de mejora, enemigo dorado, relámpago, cofre y carrera contra tu récord** — #15
- [x] **PR 10c · El marcador elegido (C), celebraciones y trofeos dorados** — #16
- [x] **PR 11a · Fondos, plancha lateral y superman** — #17
- [x] **PR 11b · La batalla diminuta: flexiones y plancha con un brazo** — #18
- [x] **PR 11c · Inchworm** — #19
- [x] **PR 12a · Botón MENÚ de la muñeca, pausa y resumen de la ronda** — #20
- [x] **PR 12b · Carátula del duelo, caricatura y avisos de la vista** — #21
- [x] **PR 13a · Carrera: nivel, misiones del día, cofre y escudos, metas de hoy y Progreso** — #22
- [x] **PR 13b · La campaña y la carátula «METAS DE HOY»** — #23
- [x] **PR 14 · Página web y app del móvil** — #24
- [x] **PR 15 · Arcos** — #25
- [x] **PR 16 · Toques** — #26
- [x] **PR 17a · Barras: el modo (aparatos que se recuerdan, dominadas, remo, colgado y objetivos)** — #27
- [x] **PR 17b · Barras: el bosque nocturno, el remolino y los tentáculos** — #27
- [ ] **PR 18 · Travesía** (aplazado por el usuario: se hará más adelante; su lógica pura ya está portada y comparada en `src/modes/trek/`)
- [ ] **PR 19 · Sesiones** (aplazado por el usuario: se hará más adelante)
- [x] **PR 20 · Entornos** — #28
- [ ] **PR 21 · Realidad mixta** (aplazado por el usuario: se hará más adelante; nada de lo demás depende de ella. Se empezó con lo de serie de IWSDK: entrar con `launchXR` en modo `immersive-ar` con detección de planos y mallas, anclas y profundidad, `DepthSensingSystem` y `DepthOccludable` en compuertas, cajas, rocas (ya quitadas, PR 28) y enemigos, y `GAME.mr`/`arenaDepth` —6 m en realidad mixta—; el plan de la habitación de RepArena, `src/37_room.js`, se porta a lógica pura con su comparación)
- [x] **PR 22 · Música** — #29
- [x] **PR 23 · Sincronización, pulsómetro y modo desarrollador** — #29 (juntos con el 22: comparten la pantalla de menú y la página)
- [x] **PR 24a · Los fallos de la prueba en las gafas** (calibración con tu mirada, enemigos de espaldas, la pasarela de los Arcos, los tirones, teclado sólido y menú más pequeño, manos opacas, y los rayos de RepArena) — #30
- [x] **PR 24 · Cambio de casa** (la dirección de siempre de RepArena trae aquí; la anterior, en `clasica.html`; pruebas de todos los ejercicios; medidor de fotogramas y registro de tirones) — #31 (y en RepArena, el PR del cambio)
- [x] **PR 25 · Pulsar los menús como en RepArena, guantes también con mandos, la caricatura y la explicación** — #32
- [x] **PR 26 · Arreglos de la prueba del PR 25: se vuelve a poder pulsar, sin manos blancas y la calibración al empezar el ejercicio** — #33
- [x] **PR 27 · Pulsar solo por delante (con su forma de tecla), la pinza para el rayo y el marcador grande de RepArena** — #34
- [x] **PR 28 · Sin el puntero invisible, letras que caben, el negro del final, EMPEZAR sin congelarse y sin las cajas y rocas del prototipo** — #35
- [x] **PR 29 · Registro de diagnóstico** (los últimos 30 s de las manos, el rayo, las teclas y los tirones, para arreglar con datos de las gafas) — #36
- [x] **PR 30 · Las manos de RepArena** (opción B del usuario: la lectura, el suavizado, los saltos imposibles, la mano perdida con el cuerpo, el pellizco y el filtro `HF`) — #37
- [x] **PR 31 · Los menús de RepArena enteros** (opción B: sus paneles, sus teclas planas pintadas y su pulsación con imán, sólida y pegada, el menú de muñeca, el atril y el teclado de números; sustituyen a los de UIKitML) — #38
- [ ] **PR 32 · Cuatro arreglos vistos en las gafas** (el menú de música ya no se rehace cada 5 s y los menús suben sus texturas antes de pintarse; los mandos de Spotify, otra vez en el menú principal; en los ejercicios de suelo el mundo se orienta hacia tu cuerpo al calibrar; en la plancha con un brazo, el rayo sale de la mano levantada)

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

**PR 4 · Estilo Cómic y la arena** (L) — hecho
- De IWSDK, de serie: el cielo (DomeGradient, melocotón y azul claro), la neblina rosada, sin tono de cine, sin sombras en
  tiempo real (sombras de contacto, ContactShadow, bajo lo que pisa el suelo), el suelo que se funde a lo lejos
  (DomeFade), la física de las compuertas; y todo hecho con sus piezas: objetos de escena en código
  (`src/scene-assets/`, con su habilidad de construir modelos) y la composición en el JSON de la escena.
- De RepArena, lo que IWSDK no trae: el sombreado de cómic (corte duro, sombra violácea, brillo y rayado) y los contornos
  de tinta (`src/style/comic.ts`), las nubes de borde entintado, el suelo de arena con grietas, el valle de dibujo (mesetas,
  ruinas, rocas que flotan y montañas, con el mismo azar que allí), las tres compuertas (puertas que se deslizan, interior
  oscuro, baliza) y los efectos de cómic (líneas de impacto y estrella al derribar). Los zombis salen por las compuertas.
- «Estilo visual: Realista» quita el sombreado y los contornos; el paisaje realista llega con los entornos (PR 20).

**PR 5 · Sonido** (M) — hecho
- De IWSDK, de serie: su sistema de sonido (AudioSource): cada sonido, un archivo que IWSDK carga, reparte en voces y
  coloca en 3D, con el oído en la cabeza (al salir de la VR lo pausa).
- Los archivos: los del usuario de RepArena (`sounds/`, sustituibles por nombre: `sounds/LEEME.md`) y, si falta uno, el
  de serie (`sounds/de-serie/`: los sintetizados de RepArena, grabados una vez con `tests/sonidos.mjs`, con su eco).
- De RepArena, lo que IWSDK no trae: cada efecto con su volumen y su tono (`SND`), el volumen de efectos y el del
  ambiente (a 0 con Spotify: `setMusicPlaying`), los sonidos apagados (`reparena3-sndoff`), el tono que varía un poco, el
  compresor de la mezcla y el ambiente de la arena con golpes metálicos lejanos; la voz de cada zombi; la compuerta suena
  y echa vapor al abrirse.

### Fase 1 · Combate completo

**PR 6 · Ejercicios de pie** (L) — hecho
- Detectores de zancada, sentadilla con salto, con press y con elevación, swing, peso muerto, curl, curl con barra,
  antebrazos y elevación frontal, con sus cargas ×2-×4, PERFECTA, avisos de lo que se hace mal (grandes, en el suelo) y
  «Tu cuerpo (recorridos)»; un selector sencillo de ejercicio en el panel de inicio hasta el PR 7.
- De RepArena: `src/70_game.js` (detectores, `CHAIN`, `topCue`…).
- **Las manos, las de IWSDK** (criterio del usuario): en RepArena, sobre todo en el curl con barra, a veces salían rayos
  al azar porque detectaba mal las manos (manos inventadas, saltos del seguimiento, las dos manos pegadas en la pesa).
  Aquí los detectores leen las manos tal como las da IWSDK (`hands`, sin manos inventadas), y los apaños de RepArena para
  eso (el filtro `HF` de las dos manos juntas, `handEx`…) no se portan. Si en las gafas vuelven los rayos al azar, se
  busca primero lo que ofrezca IWSDK y, si no hay nada, se le propone al usuario.
- Hecho: los detectores de RepArena, tal cual (`src/exercise/standing.ts`: `runDetectors` con `vertDetector`, `CHAIN`,
  `chainStep`, `deadliftStep`, `armStep`, `barStep`, `fraiseStep`, `twistStep` y `jumpTrack`), comparados con su código
  (`tests/compare/standing.compare.test.ts`: 40 partidas al azar por ejercicio, los mismos sucesos en el mismo fotograma).
  Del curl con barra se queda lo que es del juego (las dos manos como una sola pesa: juntas, su media; separadas, la que
  se mueve), pero no el filtro `HF`. Los avisos en el suelo y la carga ×N en el suelo, con dos paneles UIKit tumbados
  (`warn.uikitml`, `charge.uikitml`). El selector, once botones en el panel de inicio.

**PR 7 · Menú principal y Opciones en VR** (L) — hecho
- EMPEZAR, metas de hoy, columna HOY, modos, ejercicios, dificultad (galones, «Al fallo», la ficha de la ronda),
  Spotify; Opciones en pestañas, salidas del esquema de ajustes, con la tecla «?».
- **Las teclas, como las pulsa IWSDK** (lo pidió el usuario: la física del toque de los menús es la de IWSDK de serie):
  los botones de UIKit con su pulsación (el dedo o el rayo); las reglas de las teclas de RepArena (sólidas, imán,
  pegadas, retirar el dedo) no se portan. Lo que no es de la pulsación (la pantalla invisible detrás de cada menú, un
  apaño de rendimiento) se mide en las gafas antes de decidir.
- De RepArena: `src/60_ui.js`.

**PR 8 · Enemigos** (XL: partido en 8a, 8b, 8c y 8d)
- Todos los de RepArena, desde una tabla (robots, diablillo, puglin, lanzador, zombis, raptor, piratas, monstruitos,
  voladores…), con física: rodean los obstáculos, no se atraviesan, bailan al compás esperando; compuertas, cuentas de
  vida (`LIFE`), retratos y la tabla del desarrollador.
- De RepArena: `src/40_models.js`, `src/42_beasts.js`, `src/70_game.js`.
- **8a (hecho)**: los que traen su modelo y sus animaciones (zombi, zombi verde y gordo, velociraptor, los cuatro piratas
  y los siete monstruitos de las compuertas), desde una tabla (`src/combat/foes.ts`: `BEAST_DEF` y `ROBOT_KIND`); su
  resistencia, fuerza y dureza de la tabla del desarrollador (`devFoe`, sin la pantalla de la tabla: PR 23); el reparto
  entre los elegidos (`deal`); los puestos de ataque en arco con filas de espera (`robotSlot`, comparado con RepArena en
  `tests/compare/foes.compare.test.ts`: los mismos puestos); el golpe preparado (en el pulso con ritmo) con su fuerza y el
  retroceso; el baile al compás esperando (con ritmo marcado); las cuentas de vida (`LIFE`, `src/combat/life.ts`); y las
  fichas con retrato en Rivales, que eligen quién sale.
- **8b (hecho)**: el diablillo y el puglin, con las animaciones de la biblioteca (`anims.glb`, la Universal Animation
  Library) pasadas a su esqueleto (`src/combat/retarget.ts`: `beastRetarget`) y uno de sus tres colores al azar; el
  lanzador (un diablillo que se queda a 4,2 m y te tira piedras en parábola: apártate o párala con la mano;
  `src/combat/rocks.ts` y `rock-path.ts`: `throwRock`, `rockParry`, `updateRocks`; más deprisa cuanto más difícil,
  `throwK`). **Decisión del usuario en el PR 8b: los personajes geométricos (robots, drones, avispones; también las
  arañas del PR 11) no se migran por ahora**; la ficha del robot dice «Por ahora, no».
- **8c (hecho)**: los voladores con modelo de Quaternius (abeja, murciélago, Cthulhu y el dragón, que solo sale de jefe:
  PR 10). Su vuelo, el de RepArena tal cual (`src/combat/flight.ts`: `Flight`, con `FLYER_KIND`, `FLAP_HZ` y `gateKeep`,
  comparado con su `Flyer` en `tests/compare/flight.compare.test.ts`: 60 vuelos al azar, el mismo sitio y el mismo alabeo
  en cada fotograma y los mismos mordiscos); el modelo, el aleteo a su ritmo, el mordisco, el zumbido (`loopSound`) y la
  caída al morir, en `src/combat/flyers.ts` (`FlyerSystem`). Con los de tierra, uno de cada (como en RepArena); los
  drones y avispones (geométricos) no salen: si solo están ellos, abejas y murciélagos. Sus fichas, en Rivales.
- **8d (hecho; partido del 8c)**: las amenazas a media distancia (`taunt`), las formas de moverse de cada clase (Ajustes →
  Cada enemigo: `move_*`, `spd_*`, `pace_*`) y las esquivas. La lógica de RepArena tal cual (`src/combat/gait.ts`:
  `gaitPlan`, `Gait`), comparada con su código (`tests/compare/gait.compare.test.ts`: el ritmo de la marcha, el zigzag,
  las rachas, la amenaza y las esquivas, con el mismo azar); en `EnemySystem` se aplica pidiendo velocidad a la física. Los de las trampillas con modelo (cangrejo, seta, calavera), con
  los ejercicios de suelo (PR 11).

**PR 9 · Armas y defensa** (L)
- Rayos con el aspecto de RepArena, pistolas, espadas; escudo, guardia, esquiva, onda y burbuja (el puñetazo, la diana y
  la vibración ya están, del PR 3).
- De RepArena: `src/52_bolt.js`, `src/54_suporb.js`, `src/76_sword.js`, `src/77_guard.js`.

**PR 10 · Oleadas y premios** (L: partido en 10a, 10b y 10c)
- Dificultad entre oleadas, panel entre oleadas, «Al fallo», cartas de mejora (cada tres oleadas), enemigo dorado,
  relámpago y cofre; celebraciones en el marcador y trofeos dorados; el marcador elegido (C).
- De RepArena: `src/79_perks.js`, `src/70_game.js`, `src/60_ui.js` (`cheer`, `trophy`).
- **10a (hecho)**: las oleadas de RepArena (`src/combat/waves.ts`: `buildWave` con la escalera de enemigos y los jefes,
  `spawnGap`, `rampAfter`, los puntos), comparadas con su código (`tests/compare/waves.compare.test.ts`: 400 rondas al
  azar, los mismos enemigos con la misma resistencia y los mismos «entra en juego»). Cada oleada pide sus repeticiones
  (la resistencia de los que salen las suma); «Oleadas» (o «Al fallo», sin fin y con jefe cada 5); el descanso entre
  oleadas; el panel entre oleadas con el fundido leve; los jefes (el de tu clase a lo grande, el capitán, el dragón);
  la dificultad creciente solo con las oleadas superadas con soltura; los puntos y el combo; la victoria.
- **10b (hecho)**: los premios de `src/79_perks.js`, su lógica tal cual (`src/combat/perks.ts`: `Perks`, `Ghost`,
  `goldRoll`, `rushPlan`, `chestRoll`), comparada con su código (`tests/compare/perks.compare.test.ts`: 150 rondas al azar,
  las mismas cartas en el mismo momento, las mismas mejoras, escudos, combos salvados y vidas; y la carrera contra tu
  récord, el mismo texto); en la partida, `src/combat/rewards.ts`: las cartas en su panel (`perks.uikitml`), el halo del
  dorado, el relámpago, el cofre del Pirate Kit (`island.glb`: `Chest_Closed` y `Chest_Gold`) y el récord en el marcador.
- **10c (hecho)**: el marcador elegido (C: `board.uikitml`, con el rosco doble en un lienzo, `src/ui/board-ring.ts`), las
  celebraciones en su hueco del marcador (`message`, con su color) y los trofeos dorados (`trophy.uikitml`,
  `GameSystem.trophy`: el récord, el récord al fallo, el cofre).

**PR 11 · Ejercicios de suelo** (L: partido en 11a, 11b y 11c)
- Flexiones, inchworm, fondos, plancha con un brazo, plancha lateral y superman, con los avisos en el suelo y el
  marcador tumbado sólido.
- De RepArena: `src/70_game.js`.
- **11a (hecho)**: los detectores de suelo y sentado de RepArena tal cual (`src/exercise/floor.ts`: `FloorDetector`, también
  con las flexiones y la plancha con un brazo, ya listos para el 11b), comparados con su código
  (`tests/compare/floor.compare.test.ts`: 40 partidas al azar por ejercicio, los mismos sucesos en el mismo fotograma). Se
  juegan los fondos en silla, la plancha lateral y el superman: antes de empezar, quieto en la postura (RepArena:
  `calib`); tumbado, los voladores vienen bajos y, en el superman, esperan a que aguantes (`Flight` con `low` y `sup`,
  comparado con RepArena en `flight.compare.test.ts`).
- **11b (hecho)**: la batalla diminuta bajo tu cara (flexiones y plancha con un brazo): los bichos de las trampillas de
  RepArena tal cual (`src/combat/hatch.ts`: `HatchFoe`, `floorDetour`, `floorBoardKeep`; comparados con su `Spider` y
  `HatchBeast` en `tests/compare/hatch.compare.test.ts`), en la partida en `src/combat/hatch-foes.ts` (`HatchSystem`: las
  cuatro trampillas, `hatch.scene-asset.ts`, y el cangrejo, la seta y la calavera con su modelo); los voladores
  diminutos (`Flight` con `tiny`) y las oleadas de la batalla diminuta (`buildWave` con `tiny`), comparados también; el
  marcador tumbado en el suelo, que rodean; en la plancha con un brazo, cada brazo dispara a su lado.
- **11c (hecho)**: el inchworm de RepArena (`FloorDetector`, `inchworm`: la cabeza hasta la línea del suelo, las flexiones
  que dan fuerza a la onda y la vuelta; comparado con su `iwStep` en `floor.compare.test.ts`); en la partida, la línea, la
  barra y la salida en el suelo, la onda expansiva (que manda a los bichos a su trampilla con `HatchFoe.sendHome` y,
  desde ×2, hace daño) y los bichos 2,6 veces más lentos.

### Fase 2 · Alrededor de la partida

**PR 12 · Menú de muñeca, resumen, carátula del duelo y caricatura** (M: partido en 12a y 12b)
- De RepArena: `src/60_ui.js`, `src/64_intro.js`, `src/62_demo.js`.
- **12a (hecho)**: el botón MENÚ de la muñeca izquierda (`wrist.uikitml`: sale al mirarte la muñeca; con mandos, también
  X/Y), la pausa (`pause.uikitml`: seguir, recolocarse, terminar la ronda, menú principal), recoger el menú con la palma
  hacia abajo o el puño, el final de la ronda con el fundido a negro y el resumen (opción A: `summary.uikitml`;
  `src/core/run.ts`: `summaryOf`), y la ronda guardada en el historial de RepArena (`runRecord`, `kcalOf`; comparados con
  su `saveRun` en `tests/compare/run.compare.test.ts`).
- **12b (hecho)**: la carátula del duelo (`src/combat/duel.ts`: quién es el jefe y tu récord; `src/ui/duel-art.ts`: la
  ilustración, pintada en el menú a trozos; 7 s a 2,5 m con todo en negro; se salta con un botón o el pulgar arriba:
  `src/input/thumbs.ts`), la caricatura que enseña cómo se hace cada ejercicio (`src/ui/demo-art.ts`: junto al menú
  principal y, al colocarte o prepararte, a la derecha del aviso del centro) y los avisos de la vista
  (`src/ui/view.ts`: siguen la mirada sin ladearse; tumbado, en el suelo bajo la cara; en partida, fijos; no tapan lo que
  viene): el del centro (`center.uikitml`: la calibración con su barra, «¡PREPÁRATE!» con la cuenta atrás) y el breve
  (`toast.uikitml`: lo que pide hacer algo ya; las celebraciones siguen en el marcador). Todo comparado con RepArena
  (`tests/compare/view`, `demo` —el dibujo, llamada a llamada— y `duel`). El sistema: `ViewSystem`
  (`src/ui/view-panels.ts`).

**PR 13 · Carrera y progreso** (M)
- Experiencia, nivel, títulos y colores; misiones del día con su cofre y escudos de racha; campaña (7 regiones, jefes,
  estrellas); Progreso. Partido en 13a y 13b.
- De RepArena: `src/73_career.js`.
- **13a (hecho)**: la carrera de RepArena tal cual (`src/core/career.ts`, `days.ts`, `today.ts`: experiencia por repetición y
  perfecta, nivel y título, los colores que se desbloquean, las tres misiones de cada día con su cofre y los escudos de
  racha, los récords en plena ronda, la meta diaria), comparada con su código (`tests/compare/career.compare.test.ts`: 120
  temporadas de 14 días, con el cambio de hora; `today.compare.test.ts`). En la partida: la experiencia y las misiones al
  acabar la ronda (también al salir al menú), los trofeos («¡MISIÓN 2 DE 3!», «¡COFRE DEL DÍA!», «¡NIVEL 4!», «¡META DIARIA!»,
  «¡RÉCORD DE…!»), lo ganado en el resumen (el cofre y el nivel primero) y «Hoy: x de y min» en el descanso; el color del
  rayo normal. En los menús: las metas de hoy bajo EMPEZAR, la columna «HOY» (`hoy.uikitml`) y Opciones → Progreso (Nivel con
  los colores, Misiones y Semana).
- **13b (hecho)**: la campaña (35 niveles en 7 regiones por modo y ejercicio: Opciones → Progreso → Campaña, con el mapa de
  cada región, sus cinco niveles —el quinto, con jefe— y sus estrellas; jugar un nivel con el rango y las oleadas del nivel
  por encima de tus ajustes, `src/core/campaign.ts`; al acabar, el nivel con sus estrellas en el resumen y los botones
  «Nivel N», «Repetir» y «Mapa») y la carátula «METAS DE HOY» al entrar en las gafas (`src/ui/goals-intro.ts`: 8 s, con todo
  lo demás oscurecido; se salta con un botón, el pulgar arriba o una tecla).

**PR 14 · Página web y app del móvil** (L)
- La página con su índice y el formulario de ajustes, «Probar en el ordenador», la app del móvil (modelo C) y el
  logotipo para instalarla.
- De RepArena: `src/page.html`, `src/63_app.js`, `src/68_prefs.js`, `icons/`, `manifest.webmanifest`.
- **Hecho**: la página de RepArena (`index.html` y `src/page/page.css`, sacados de su `page.html`): arriba, los botones de
  entrar (VR; «Probar en el ordenador»; la realidad mixta, en gris hasta el PR 21), el índice (`nav.ts`), el modo y el
  ejercicio en fichas con su explicación (`pick.ts`: lo elegido, lo que suma la ronda y la caricatura), lo de hoy con tu
  nivel y misiones, el progreso y el historial (`today.ts`), las opciones comunes, el sonido, las del modo y el ejercicio
  (`form.ts`: salen del esquema; cada cambio, por `setSetting`, se guarda donde RepArena) y «Dentro del juego». La app del
  móvil (`app.ts`, modelo C) y el logotipo con el manifiesto para instalarla (`public/icons`). Comparado con RepArena
  (`tests/compare/today-page`, `form`: el mismo HTML) y probado en un navegador (la partida simulada comprueba la página,
  el formulario, la prueba en el ordenador y la app del móvil).

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
- Hecho: `merinoantonioonu-source.github.io/reparena/` lleva a `…/reparena-xr/` (con lo que traiga la dirección) y RepArena
  sigue entera en `…/reparena/clasica.html` mientras lo aplazado (armas, Travesía, Sesiones, realidad mixta) llega aquí; las dos
  comparten los datos (el mismo sitio). Pruebas de cada ejercicio con movimientos de persona (`tests/unit/exercises.test.ts`).
  Rendimiento: el medidor de fotogramas («Medidor de fotogramas», Ajustes) y el registro de tirones de RepArena (la página lo
  resume al salir de las gafas). En el emulador, una ronda de Combate con el bosque pinta unas 170 llamadas y 370 000
  triángulos por ojo (casi todo, los árboles y sus contornos); hay que mirarlo con el medidor en las gafas.

## Notas para el siguiente PR

*(Las deja quien acaba cada PR: lo que el siguiente tiene que saber.)*

- PR 32 → los siguientes: **lo que cambia en Spotify ya no rehace el menú a ciegas**. `HOOKS.spChanged` lo reparte un solo
  manejador fijo (`spSync`, `src/ui/screens/music-screens.ts`, puesto por `RaMenuSystem`): la pantalla de la música se rehace
  solo si cambia su firma (`musicSig`, `src/services/music-sig.ts`: lo que suena, dónde, las listas, los errores y el ritmo) y
  si sigue a la vista (`MUSIC.menu`; desde «Listas y canciones» ya no salta de vuelta); el menú principal, al día sin
  rehacerse (el rótulo y Play/Pausa) salvo al conectar o desconectar Spotify; con el teclado de números abierto, nada. Una
  pantalla nueva que dependa de Spotify: su firma y su sitio en `spSync`, no otro `HOOKS.spChanged`. Los menús, el teclado de
  números y la «?» suben sus texturas al hacerse (`upTex`, `menu-core.ts`, con `ENV.renderer`); lo que se repinte después
  (una tecla, el rótulo), igual. Los ejercicios de suelo y sentado recolocan tu espacio al calibrar como los de pie, pero
  hacia donde apunta el cuerpo (`bodyYaw`: en plancha, la coronilla): la arena diminuta sale en (0, 0) con delante hacia −Z
  (`recenterPose`/`floorOrigin`, `src/combat/recenter.ts`). En la plancha con un brazo, el rayo sale de la muñeca levantada
  (nunca de la bola) y la bola va a esa mano en cuanto la levantas. En el simulador, `window.__rx.spotify()` deja fingir
  Spotify conectado (cambiando sus métodos) para probar el reproductor sin red.

- PR 31 → los siguientes: **los menús son los de RepArena enteros** (`src/ui/ra/`; ver AGENTS.md › Menús). Se portaron de
  `src/60_ui.js` (Btn, Slider, flatKeys y su caché, pokeWidgets, openMenu, el teclado de números, la «?», el atril, la
  muñeca y su botón MENÚ), `src/70_game.js` (lobbyMenu, optionsMenu, los rivales y las armas, la dificultad, la pausa y el
  resumen), `src/73_career.js` (Progreso, las metas de hoy, la columna HOY y la carátula «METAS DE HOY») y `src/79_perks.js`
  (las cartas). Los paneles de UIKitML de los menús se quitaron (siguen los avisos: marcador, centro, breve, suelo, carga,
  oleada y trofeo). Lo propio de RepArena XR se conserva: la nitidez (Opciones → Entorno), «Guardar diagnóstico» (en la
  pausa), el rayo de IWSDK con la pinza (además del dedo de RepArena), cerrar con la palma abajo o el puño, «Entrar en VR» en
  el ordenador y lo que aún no hay (Travesía, Sesiones) en gris. Una pantalla nueva: `HOOKS.openScreen(rows)` con las filas de
  `openMenu`. En el simulador, `window.__rxMenu` (UI, WM, POKE, fingers) deja leer el menú y pulsar con `onPress`.
- PR 30 → PR 31: **el usuario eligió la opción B**: con lo de serie de IWSDK las manos y los menús iban peor que en
  RepArena, así que se traen los de RepArena enteros. Las manos ya están (`src/input/hand-filter.ts`, comparado con
  `src/80_main.js` y el `HF` de `src/70_game.js`): el juego usa `J.p`/`J.q`/`tip`; lo que se pinta y lo que pulsa los menús,
  `J.s`/`J.sq`/`tipS`; una mano con `h.est` (calculada al perderla) no se pinta, no pulsa menús, no saca el botón de la muñeca ni
  coloca barras; `h.back`, el fotograma en que reaparece (no es sacudida ni puñetazo). El cuerpo (`body-tracking`) se pide al
  entrar (`askBodyTracking`, `src/input/hand-system.ts`: IWSDK no tiene opción). Falta el PR 31: los menús de RepArena
  (`src/60_ui.js`: `openMenu`, `Btn`, `flatKeys`, `keyCached`, `pokeWidgets` con `fingers` = las `tipS`, el menú de muñeca, el
  atril, `menuOccluder`, el teclado; y los menús de `src/70_game.js`), que sustituyen a los de UIKitML.
- PR 29 → los siguientes: **antes de arreglar algo de las manos, el rayo, las teclas o los tirones, pide al usuario el registro
  de diagnóstico** (`src/core/diag.ts`, `src/ui/diag-system.ts`): se guarda solo al salir de la VR o al abrir el menú de las
  gafas, y con «Guardar diagnóstico» de la pausa; en la página, «Copiar el último» o «Descargar todos». Lleva cada 0,1 s la
  cabeza, las dos manos (muñeca, punta del índice, pellizco), a qué tecla apunta el rayo y dónde, sobre qué tecla está el
  toque de IWSDK y a qué distancia, el puntero activo de IWSDK y lo que hace el dedo con el panel (`SolidKeysSystem.P`); y los
  sucesos: teclas que se iluminan y se pulsan (y quién: IWSDK con el rayo o el dedo de las teclas sólidas), pulsaciones
  repetidas que no cuentan, manos que se pierden, pellizcos, menús, tirones y avisos de la consola. Lo nuevo que convenga
  seguir, con `diagEvent`. `tests/unit/glyphs.test.ts` avisa de los caracteres que no están en las letras.
- **Lo que trae IWSDK para el toque y las manos** (consultado en su código y documentación al hacer el PR 29; en npm, la última
  sigue siendo la 1.1.0-rc.2): `RayInteractable` y `PokeInteractable` no tienen opciones; las distancias del toque son fijas
  (`TOUCH_DEFAULTS`: se ilumina a 20 cm, pulsa a 2 cm; con histéresis de 15/20 cm, las de la guía de Meta) y la pulsación es
  una esfera sin lado (`@pmndrs/pointer-events`: por eso pulsa también desde detrás); lo que impide que el dedo atraviese
  (`getTouchSurfaceVisualOffset`) solo actúa pulsando y en una mano. Meta (guías de toque y de la Interaction SDK) pide que
  solo cuente la punta que entra por delante, que el dedo que se ve se pare en la superficie («touch limiting»), que la
  pulsación se mantenga aunque la mano resbale un poco («position pinning») y teclas de al menos 22 mm. En `main` de IWSDK, sin
  publicar: `PokeInteractable` con `hand` (que pulse solo una mano) y arreglos del pellizco para agarrar. Por eso
  `src/ui/solid-keys.ts` completa lo de IWSDK como pide Meta, y se revisará cuando IWSDK publique una versión nueva.
- PR 28 → los siguientes: **las letras se ajustan solas** (`src/ui/fit.ts`, `FitTextSystem`): un texto que no cabe en su caja o
  en su botón encoge (la fila de botones, a la vez); un panel nuevo se añade a `PANELS` de `src/ui/fit-text.ts`. A las letras de
  `public/fonts` se les añadieron `− ▸ ◀ ◂ › ‹ ✔` como copias de `– ▶ ← ← » « ✓` (no los tenían: salía un punto). **Precompilar**
  (`src/style/warm.ts`): las copias que se guardan con `warmKeep` se compilan de una en una mientras estás en el menú (los
  enemigos, `EnemySystem.warmNext`, una cada 0,12 s); al empezar la ronda solo se compila lo que falte, con la carátula del duelo
  ya en negro (`warmSoon(30)`): nada pesado en el fotograma de EMPEZAR. **El negro del final** (`stepOutcome`, como el
  `OUT.veil`/`OUT.black` de RepArena): un velo pegado a los ojos mientras funde, con «¡VICTORIA!» o «DERROTA» encima (el aviso
  del centro), y ya en negro una esfera opaca que se pinta la primera, con el radio justo para dejar dentro el resumen y tus
  manos. Las cajas y rocas del prototipo se quitaron (RepArena no las tenía): lo sólido que rodean los enemigos son las
  compuertas y la bola.
- PR 22/23 → PR 19 y siguientes: los servicios están en `src/services/` (`spotify.ts`, `bpm.ts`, `xfer.ts`, `pulse.ts`: lógica sin IWSDK, con
  su comparación contra RepArena y mismas claves guardadas) y `src/core/dev.ts`, `src/core/beat.ts`. `src/services/hub.ts` los crea con
  el navegador de verdad (`spotify()`, `bpm()`, `xfer()`, `sync()`, `pulse()`, `exSongsStart`). **El pulso de la música**
  (`src/core/beat-hub.ts`: `BEAT`, `MOTES`) lo mueve `GameSystem` y lo leen Combate (los enemigos salen en el pulso), Arcos
  (`beatP`, cada arco llega en un pulso), Toques (`beat0`) y las luciérnagas (que bailan). **Pantalla genérica del menú**
  (`src/ui/screen.ts`, `HOOKS.openScreen(rows)`, como `openMenu` de RepArena): la usan la música, pasar datos, la sincronización y
  el teclado de números (`src/ui/screens/`); se abren desde los botones de acceso de Opciones (Sonido: «Música y ritmo»; Ajustes:
  «A otro aparato» y «Sincronización»). Las sesiones (PR 19) llevan canciones por bloque: `spotify().blockMusic`.
- PR 20 → PR 21 y siguientes: los entornos viven en `src/env/` (`EnvSystem`: el fondo realista, las luciérnagas y qué entorno toca;
  `scenery.ts`: carga, instancias, cielo, suelo y mar del bosque y la isla; `placement.ts`: dónde va cada modelo, de RepArena,
  con prueba). **El fondo realista es el `DomeTexture` de IWSDK** puesto en la raíz del nivel (`activeLevel`): al elegir uno se
  esconden el valle y las nubes dibujados y sale el bosque de día delante. El entorno de día cambia la niebla de la escena (y la
  devuelve al salir). Cuando entra la realidad mixta (PR 21), hay que esconder `Scenery` y las luciérnagas (RepArena: `!arMode`).
- PR 20 → PR 22: las luciérnagas ya tienen sus uniformes sin el baile; con la música (`uBeat`, `uDance`, `uSwing`) añade el
  compás (ver `src/56_motes.js`, `motesBeat`).
- PR 17a → PR 17b y siguientes: Barras sigue la receta de Arcos y Toques (`src/modes/bars/`: `detect.ts`, `targets.ts`, `place.ts`
  y `equip.ts` son la lógica de RepArena, comparada con su código; `bars-system.ts` pinta, suena y puntúa; los objetos, en
  `src/scene-assets/bars.scene-asset.ts`). Lo que añade: **antes de cada oleada hay que colgarse** (la cuenta atrás de 3 s la
  lleva `BarDetector`; al acabarla, `HOOKS.barWave(i)` hace que `GameSystem` empiece la oleada) y, si te sueltas, se vuelve a
  la barra sin perder la oleada. El aparato se coloca con las manos (`Placer`: «Colocar barra» en el menú, o al empezar si
  aún no está; el botón de la muñeca pasa a CANCELAR) y se guarda en `reparena3-equip` (el mismo guardado que RepArena). El
  aviso del centro de la vista (`VIEW.center`) lo lleva `BarsSystem.center()`. Lo de debajo del que cuelga (el charco con tentáculos, el remolino y el bosque nocturno, solo colgado) lo lleva `HangScene`
  (`hang-scene.ts`); al caerse, `fall` avisa
  (`door: true` es el charco: `HangScene.grab`). La arena es el mundo (no se mueve al colgarte, `arenaFromHead` no hace nada).
- PR 16 → PR 17 y siguientes: Toques sigue la receta de Arcos (`src/modes/touch/`: lógica pura en `targets.ts`/`wave.ts` con su
  `TouchEnv`, comparada con RepArena; `touch-system.ts` pinta, suena y puntúa; sus objetos, en `touch.scene-asset.ts`). Cada
  toque cuenta como una repetición por `HOOKS.arcRep(perfect)` (es el `registerRep` sin disparo; sirve a cualquier modo sin
  bola). La partida llama a `begin`, `calibrated(y)`, `startWave(i, intro)`, `waveLeft` y `clear` del sistema del modo.
  Para jugar un ejercicio en un modo: `PLAY_MODE_EX` (`src/core/playable.ts`). El pulso (BPM) del modo es el ajuste `bpm`:
  la música (PR 22) lo dará.
- PR 15 → PR 16 y siguientes: cada modo tiene su carpeta `src/modes/<modo>/` con la lógica pura (sin IWSDK; recibe un `…Env` con
  lo de fuera: ajustes, cabeza, azar, reloj) y su sistema (`arcs-system.ts`), que pinta, suena y avisa. Un modo nuevo: su
  sistema en `src/index.ts` (antes de `GameSystem`), su entrada en `PLAY_MODES`/`PLAY_MODE_EX` de `src/core/playable.ts` (con eso
  el menú, las misiones y la página lo ofrecen), quitar su línea de `SOON_MODE` (`src/ui/menu.ts`) y las ramas de
  `GameSystem` (`startWave`, `exercise`, `refreshBoard`, `endRound`). Los puntos de las repeticiones pasan por `GAME.ptsK`
  (fiebre y turbo ×2). Las partidas guardan los metros (`dist`) en el historial (`RunRecord`). Los objetos de escena del
  modo, en `src/scene-assets/`.
- PR 14 → PR 15 y siguientes: la página tiene sus apartados en `index.html` (los de RepArena que aún no están —Spotify
  y la música, las sesiones, la sincronización «Pasar a otro dispositivo», el pulsómetro y la tabla del desarrollador— se
  añaden con su PR: su `<section class="…" id="…" data-toc="…">` en `.main`, tomada de `src/page.html` de RepArena, y su
  parte en `src/page/`; la app del móvil ya los coloca en su grupo, ver `APP_SECS` en `src/page/app.ts`). Cada modo nuevo:
  su ficha ya está en la página (en `#secMode`), solo hay que encenderlo en el menú de VR (`SOON_MODE`) y quitar lo de gris.
  Los ajustes del formulario salen de `SCHEMA`: uno nuevo sale solo. La escena (IWSDK) está en `#stage`.
- PR 12b → PR 13: los avisos de la vista ya están (`ViewSystem`, `src/ui/view-panels.ts`): lo que pide hacer algo ya, con
  `message(texto, s, color, true)` o `HOOKS.say(…, true)` (el breve); las celebraciones, sin `true` (al marcador). Los
  logros grandes (`GameSystem.trophy`) salen derechos con `VIEW_FRAME`. La carátula «METAS DE HOY» de RepArena al entrar en
  las gafas (8 s, o cualquier botón) puede ir como la del duelo (`ViewSystem`: `duelStart`, `stepDuel`, el negro `veil` y
  `padMask`/`thumbsUp` para saltarla). El historial se guarda en `reparena3-history` (lo lee también RepArena); la
  carrera leerá de ahí.
- PR 12a → PR 12b: los menús tienen ya cinco vistas (`GAME.menu`: lobby, options, summary, pause, none) y el botón de la
  muñeca (`stepWrist` en `src/ui/menu.ts`). La ronda acaba con `endRound(win, manual)` (fundido a negro: `stepOutcome`).
- PR 11b → PR 11c: el inchworm también es de la batalla diminuta (RepArena: `isTiny`, con los bichos más lentos: `IW_SLOW`
  en `walkT` de `HatchFoe`) y tiene su onda que los manda a su trampilla (`HatchFoe.flung`: el modo `recoil` ya lo
  admite; falta `sendHome`). La arena diminuta (`HatchSystem.layout`, origen donde te colocas) y el marcador del suelo
  (`placeBoard`) ya están.
- PR 11a → PR 11b: `FloorDetector` ya hace las flexiones (`pushup`) y la plancha con un brazo (`plank1`, con su carga ×N
  para el brazo que se levanta: el suceso `rep` trae `side`); falta la batalla diminuta (RepArena: `isTiny`, `HATCH_KIND`,
  `HatchBeast`, las trampillas, los voladores a 0,42 y `Flight` con `push`). Para que se puedan elegir, añádelos a
  `PLAY_EX` (`src/ui/fields.ts`). La colocación antes de empezar (`calibStep` en `game.ts`) ya admite cualquiera de
  `FLOOR_EX` (en RepArena, flexiones: cabeza entre 0,15 y 1 m).
- PR 10c → PR 11: el marcador (`refreshBoard`) y los avisos ya están; los de suelo usan el mismo flujo de oleadas, puntos
  y premios. El marcador tumbado en el suelo de RepArena (flexiones, planchas, inchworm), sólido para los bichos, falta.
  Las letras de los paneles no tienen ♥, ★, ∞, ▲, ⚡ ni el signo menos (−): o se dibujan con formas de UIKit (las vidas,
  círculos) o se evitan (`minus()` cambia «−» por «-»); para tenerlos, hay que volver a generar las letras
  (`public/fonts/LEEME.md`).
- PR 10b → PR 10c: lo que el marcador tiene que enseñar de los premios: el relámpago (`rw.rush`: `on` y `left`, la mecha
  de RepArena), la carrera contra tu récord (`rw.ghostText()`) y las mejoras que tienes (`rw.perks.has`). Los avisos de los
  premios (cofre, dorado, récord) van ahora al hueco de mensajes; en RepArena, los grandes son trofeos (`trophy`).
- Para preparar pruebas en la VR simulada: `tests/vr/eval.mjs` ejecuta en la página lo que pongas en `RX_EVAL` (con
  `__rx`), con el servidor arrancado con `--allow-browser-automation` (ver Cómo probar).
- PR 8d → PR 10: cada enemigo de tierra lleva su marcha (`rt.gait`: `Gait`, con su `plan` de velocidades y su `pace`); su
  reloj (`Foe.timer`) corre a su ritmo en todo menos andando (como el `st` de RepArena). Los jefes (PR 10) van algo más
  pausados (`paceOf(…, true)`). La dificultad creciente de la oleada, en `GAME.ramp` (la lee `dv` en los enemigos). En
  desarrollo, la consola apunta la marcha de cada uno, sus amenazas y sus esquivas (`rxdbg marcha`, `amenaza`, `esquiva`).
- Los voladores tienen su `Foe` (y `Flyer`), pero no `PhysicsBody` mientras vuelan: no entran en la consulta de
  `EnemySystem`. Los blancos (`targets`) son de todos: cada uno, un `FoeTarget` con su vida al salir y la altura de sus
  cuentas de vida; el disparo y el puñetazo se reparten en `EnemySystem.hit`/`shove`.
- PR 8c → PR 10: el dragón solo sale de jefe (RepArena: `isBossWave`, el jefe de los voladores; si no lo has elegido, la
  nodriza, que era geométrica). Está en la tabla (`FOE_DEF.dragon`) y en `FLYER_KIND` (`boss`: el empujón, a un 30 %).
- PR 8c → PR 11: el vuelo de los voladores diminutos (flexiones) y bajos (superman, plancha lateral) no está portado: en
  RepArena, `isTiny()` y `lowFly()` dentro de `Flyer`.
- Sonidos en bucle que siguen a algo: `loopSound(nombre, volumen, tono)` (`src/audio/sound.ts`) devuelve uno que se
  coloca con `set(p)` y se para con `stop()` (las fuentes se reutilizan).

- PR 7 → PR 8: el menú (`src/ui/menu.ts`, ver AGENTS.md › Menús). Decisiones del usuario en el PR 7: los modos y Sesiones
  que aún no hay, en gris (`SOON_MODE`; cada PR los enciende en `wireLobby`/`refreshLobby`); los ejercicios de suelo,
  igual (`SOON_EX`, PR 11); las metas de hoy y la columna HOY, en el PR 13 (su sitio: el elemento `goals` del principal,
  escondido); sin la pantalla invisible detrás de los menús (se mide en las gafas); y la nitidez, solo la del juego nuevo
  (`QUALITY`, en Opciones → Entorno; la «Calidad de imagen» de RepArena no sale: `NOT_HERE`).
- PR 8b → PR 8c: los voladores no van a puestos (`foeSlot`): vuelan con su propio movimiento (RepArena: `Flyer`). Los
  modelos de los monstruitos voladores están en RepArena (`models/monstruitos/bee.glb`, `bat.glb`, `cthulhu.glb`,
  `yellowdragon.glb`), con la animación `Flying`. Los avisos de las piedras usan `HOOKS.say` y `HOOKS.sparks`.
- PR 8a → PR 8b: la tabla (`FOE_DEF`) y el sistema (`EnemySystem`) ya admiten cualquier enemigo con su modelo y sus
  animaciones por nombre; los que necesitan animaciones de otro archivo (diablillo, puglin) piden pasarlas a su esqueleto
  antes de añadir su fila. `foeReady(k)` dice cuáles hay; las fichas de Rivales (`c-*` en `options.uikitml`) se encienden
  solas al añadirlos. Los puestos (`foeSlot`) son los de RepArena; los voladores no los usan.
- Para el PR 12: tras la ronda sale el principal con una línea de cómo fue (`HOOKS.showMenu(texto)`): el resumen de
  RepArena (opción A) va antes. El menú de la muñeca, la caricatura (hasta entonces, el principal dice cómo se hace el
  ejercicio con `HOW`) y la pausa, también.
- Al pulsar EMPEZAR (o elegir Combate), si lo guardado es otro modo o un ejercicio que aquí aún no hay, se pasa a
  Combate con la sentadilla (`curEx`, `src/ui/fields.ts`).
- Los ejercicios de pie: `StandingDetector` (sucesos) y `readCfg` (lo que pide cada uno, leído al empezar cada oleada).
  Los del suelo (PR 11) van en otro detector con la misma forma: `vertical.ts` sirve para las flexiones y los fondos.
- Avisos en el suelo: `floorWarn(texto, color)` y `chargeFloor(texto, color)` (paneles `warn-panel` y `charge-panel` de
  la escena, que el juego tumba delante de ti al enseñarlos). Mirando hacia arriba (remo, abdominales) RepArena los ponía
  por encima de la cara: falta, para el PR 11 o el 17.
- La puntería con pesas: `aimNow` hace lo de RepArena (`aimSources`): sin las manos libres (curl, swing…), la mirada; con
  la barra flexible, automática.
- La partida simulada (`tests/e2e/run.mjs`) juega la sentadilla; para el aviso en el suelo sube un momento la
  profundidad pedida (`__rx.game.stCfg`). El estado (`__rx.snapshot()`) trae el ejercicio, el aviso y la carga del suelo.

- PR 5 → PR 6: cada efecto, con su nombre de RepArena: `SND.bolt(pos, L)`, `SND.door(pos)`… (`src/audio/sound.ts`).
  Uno nuevo: `playSound('nombre', pos, volumen, tono)`, con su fila en `SOUNDS` (`src/audio/catalog.ts`), su archivo de
  serie en `sounds/de-serie/` y su línea en `sounds/LEEME.md` (la prueba lo exige). Los de Combate se preparan al arrancar
  (`PRE_FLAT`/`PRE_POS`); un modo nuevo, que prepare los suyos. Los bucles que siguen a algo que se mueve (zumbidos de los
  voladores, espada láser, remolino, arcos) ya están grabados (`sounds/de-serie/*.ogg`); su función, `loopSound` (PR 8c). En desarrollo, la consola apunta cada sonido (`rxdbg sonido`).
- Estilo Cómic: todo lo que aparece en la escena se prepara solo (`ComicSystem`): los materiales estándar
  (`MeshStandardMaterial`) se pintan en cómic y reciben su contorno de tinta. Para que algo nuevo se vea en cómic, dale un
  material estándar con colores claros y lisos (sin texturas de relieve). `userData.noInk` en una malla: sin contorno;
  `userData.comicSoft` en un material: degradado suave (orbes, diamantes). Los paneles de UIKit no se tocan.
- Objetos de escena nuevos: con la habilidad `iwsdk-build-model` (en `src/scene-assets/`, deterministas, registrados en
  `src/assets.ts`) y colocados en `public/scenes/main.iwsdk.scene.json` con `iwsdk-compose-scene`. Un id de recurso nuevo
  no lo ve el editor de IWSDK hasta `npx @iwsdk/cli dev restart --headless`. En el JSON de la escena, los colores de la
  neblina van como texto (`"#f6dfe4"`). `tests/unit/scene-assets.test.ts` comprueba que salen iguales cada vez.
- Las manos, en `hands.left/right` y `head` (`src/input/hand-model.ts`), que llena `HandSystem` con lo que da IWSDK. Lo que
  se lanza: `throwCharge`/`throwStep` (`src/input/throw.ts`); los enemigos como `Target` (`EnemySystem.targets`); la
  diana, `LockLines` (`src/combat/lockline.ts`).
- Los ajustes se leen con `num('clave')`, `str('clave')` u `on('clave')` (`src/core/values.ts`), con `dv('clave',
  oleadas)` si les afecta la dificultad creciente, y se cambian solo con `setSetting` (guarda donde RepArena: lo verá
  también RepArena). Para enterarse de un cambio, `onSettingsChange` (`src/core/settings.ts`).
- El juego es siempre Combate con sentadillas, pero con los ajustes del modo y ejercicio que tenga elegidos el usuario
  (los últimos de RepArena). Se arregla al portar los ejercicios (PR 6) y el menú (PR 7). No elijas el ejercicio por
  código con `setSetting` antes: cambiaría también el de RepArena.
- La nitidez se guarda aparte (`reparenaxr-quality`), como decidió el usuario en el PR 7: solo la del juego nuevo.

- PR 26: una tecla nueva de un panel se escucha con `onPress` (`src/ui/press.ts`), nunca con `addEventListener('click')`: le
  llegan dos pulsaciones (la de IWSDK y la del dedo) y solo debe contar una. De pie también se calibra (quieto 2 s tras la
  carátula, como en RepArena); entonces el mundo se coloca delante de ti (`recenter`).
- PR 24: un ejercicio nuevo necesita su prueba con movimientos de persona en `tests/unit/exercises.test.ts` (cinco bien hechas
  cuentan cinco, quieto no cuenta nada, lo mal hecho avisa): la última prueba falla si alguno de los que se pueden jugar no la
  tiene. Lo que pueda congelar la imagen, que marque `HITCH.f` (`src/core/hitch.ts`) para que el registro de tirones lo diga.
- PR 24a: los ajustes que solo tiene RepArena XR llevan `xr: true` en el esquema y se guardan aparte, en
  `reparenaxr-settings` (`XR_STORE_KEY`): no tocan `reparena3-settings`, que sigue igual que el de RepArena (lo comprueban las
  comparaciones, que los dejan fuera). Por ahora, «Manos que se ven» (`handLook`) y «Tamaño del menú» (`menuSize`).
- PR 24a: al empezar la ronda y al recalibrar, el mundo se coloca delante de ti (`GameSystem.recenter`: gira y mueve
  `world.player` para que tu cabeza quede en el centro mirando hacia las compuertas, en 0,8 s); en Barras, el mundo vuelve a su
  sitio (los aparatos están donde los pusiste: `HOOKS.rigHome`).
- PR 24a: lo que se pinta por primera vez en plena partida da un tirón en las gafas (se compila su sombreador). Lo que pueda
  salir, que esté en la escena (aunque escondido) o en `warmKeep` (`src/style/warm.ts`) antes de la ronda; para copiar
  materiales en plena partida, `fadeCopy` o `comicPatch` (Three no copia el sombreador propio al clonar).
- PR 24a: un rayo se lanza con `GameSystem.launch` (viaja con `Lightning`, `src/combat/bolt.ts`); lo que pasa al llegar, en
  `arrive`. No apliques daño al dispararlo: llega unas décimas después, como en RepArena.
- PR 24a: la mano que se ve se aparta lo de `HOLD` (`src/input/hold.ts`) para apoyarse en los paneles; lo que pinte manos nuevas
  (armas del PR 9…), que lo sume.

- Fase 0 cerrada (PR 1-5 + el cierre de la comprobación del sonido en la VR simulada): `window.__rx.snapshot().steam`
  cuenta el vapor de las compuertas (lanzado y visto a la vez) y la partida simulada lo exige.

## Fallos conocidos

- PR 32: **los saltos del menú al mover la cabeza, sin confirmar en las gafas**. Se ha quitado lo que se vio en el vídeo (el menú
  de música rehecho cada 5 s, con un fotograma pálido) y los menús suben ya sus texturas al hacerse; si al mover la cabeza
  sigue saltando con el menú quieto, hace falta el registro de diagnóstico (pausa → «Guardar diagnóstico») para ver si son
  tirones de la imagen o de la posición de la cabeza. En la batalla diminuta (suelo), al calibrar el mundo se desliza 0,8 s
  hasta quedar delante de ti; en realidad mixta también (como ya pasaba de pie). La VR simulada solo prueba posiciones: que
  el rayo y las trampillas se sientan bien tumbado, en las gafas.

- PR 27: el entorno cambia en cada ronda solo con «Alternar» (Opciones → Entorno → Entorno; el ajuste se comparte con
  RepArena): con «Fortaleza», siempre el mismo. El marcador, como en RepArena: a un lado a 5 m y 4,2 m de ancho («Compuertas»:
  encima de la del centro); en la batalla diminuta, tumbado en el suelo.
- PR 25: pulsar los menús con el dedo es la pulsación de RepArena sobre el punto de toque de IWSDK (pulsa al tocar, sólida,
  pegada y hay que retirar el dedo); **sin el imán** de RepArena (la tecla que se ilumina no atrae al dedo). Con mandos, el punto
  de toque es la punta del mando (lo de IWSDK), no la del dedo del guante. Probado en el emulador; falta en las gafas.
- PR 24: **el rendimiento no se ha medido en las gafas** (el emulador va sin tarjeta gráfica). Con el medidor encendido se ve
  si se pierden fotogramas; si se pierden, lo primero que pesa es el bosque (unos 340 000 triángulos con sus contornos de
  tinta). Tras jugar, la página dice cuántos tirones hubo y de qué.
- PR 24: la versión clásica (`clasica.html`) pide Spotify con su propia dirección: para usar Spotify allí, añade
  `…/reparena/clasica.html` en «Redirect URIs» de tu panel de Spotify.
- PR 24a: los rayos son los de RepArena (`src/combat/bolt.ts`) y el golpe llega al alcanzar al enemigo, pero **sin su luz**: en
  RepArena el rayo encendía una luz que iluminaba lo de alrededor y movía las sombras; en Cómic la escena no se ilumina con luces
  puntuales (tampoco lo hacía RepArena en Cómic). Sin el estallido que alcanza a los de alrededor con carga ×3 o más (RepArena,
  `fireOrb`), que llegará con el repaso del Combate.
- PR 24a: **el tirón al hacer la sentadilla, sin confirmar en las gafas**. La causa más probable (y la que vio RepArena) es que lo
  nuevo se compila al pintarse por primera vez: ahora, al empezar cada ronda, con la carátula del duelo en negro, se compila todo
  lo de la escena y una copia de cada enemigo de tierra y de su versión al desvanecerse (`src/style/warm.ts`); el desvanecerse
  ya no compila nada nuevo (`fadeCopy`). Sin precompilar: los bichos de las trampillas y la sombra de los que tienen esqueleto
  (RepArena pintaba una sombra diminuta fuera de la vista). Si el tirón sigue, el siguiente paso es portar el registro de
  tirones de RepArena (`HITCH`, `reparena3-hitch`) para ver qué pasa en ese fotograma.
- PR 24a: las teclas sólidas son solo de la mano que se ve (la pulsación es la de IWSDK, con el dedo de verdad: pulsa al
  llegar a 2 cm de la tecla). Sin el imán ni las teclas pegadas de RepArena. Con mandos como manos, la mano que agarra el
  mando se apoya igual; los guantes son solo para las manos desnudas (con mando, la mano lisa).
- PR 24a: el menú, al 75 % de su tamaño en las gafas («Tamaño del menú», Opciones → Ajustes); en el ordenador, a su tamaño.
- PR 22/23: **sin probar contra Spotify de verdad** (hace falta tu Client ID y Premium): el servicio se ha comparado con el código de
  RepArena con un Spotify falso. Hay que añadir en tu panel de desarrollador de Spotify la dirección nueva de la página (la que
  sale en la página, «Redirect URIs»). La música suena en la página (Web Playback SDK) o en otro dispositivo tuyo.
- PR 22: sin el reproductor pequeño del menú principal ni el rótulo que se desplaza (solo la pantalla «Música y ritmo» de Opciones →
  Sonido); sin los minimandos de la pausa. El ritmo («Al compás», «Encajar el pulso», «Ritmo de cada canción») está ahí. Los
  enemigos que esperan **no bailan al compás** todavía, ni la luz de las compuertas late con el pulso (Combate solo saca los
  enemigos en el pulso); el relámpago y las mejoras que siguen la música (`musicLead`) tampoco.
- PR 23: la tabla del desarrollador **solo en la página** (cinco toques en el título: sale y se esconde); en las gafas se ve su efecto
  (el ojo decide lo que ves en el menú) pero no se edita. Sin la carátula del pulso dibujada en el marcador (el número sale en
  su color). Pulsómetro y sincronización: probados con Bluetooth y Firebase falsos.
- PR 20: **el bosque y la isla no tienen compuertas de piedra** (RepArena las cambiaba por cuevas con pilares, dovelas y
  puertas de tablones): siguen las metálicas de siempre. **Los troncos, rocas y arbustos no frenan a los enemigos** (RepArena
  les marcaba círculos sólidos: `Scenery.solids` ya los calcula, pero no están conectados a la física). **Sin el viento** que
  mecía árboles, hierba y flores, y sin la luz de cada sitio (sol cálido, rebote de la arena): solo la niebla clara y el cielo; la
  luz de IWSDK no se toca. Sin el sonido de ambiente del bosque ni de la isla (sí los pájaros y las gaviotas).
- PR 20: **las luciérnagas no bailan** (llegan con la música, PR 22) ni se quedan atrás al avanzar (Arcos por el paisaje y la
  Travesía). El estilo **Realista** es el que ya traía `ComicSystem` (Entorno → «Estilo visual»).
- PR 17b: **el bosque nocturno** es más sencillo que el de RepArena: el cielo con luna y estrellas, el suelo de musgo, unos 70 árboles
  hechos de troncos y copas, matorrales y la niebla oscura; **sin la rama gruesa y el árbol enorme del que cuelga la barra**, sin
  las luciérnagas ni la niebla baja, sin las setas que brillan ni los búhos y crujidos. De noche se esconde la arena de siempre
  (compuertas, cajas, rocas, suelo, valle y nubes). Las luces del juego no cambian de color (la luz de luna llega con el PR 20, los
  entornos de IWSDK).
- PR 17b: **el charco** es un disco oscuro con borde verde y los cinco tentáculos de `tentaculo.glb` (reposo, pinchazo, latigazo
  y barrido al caerte); sin las ondas del agua, las burbujas ni los ojos amarillos. **El remolino** es el embudo con sus estrías en
  espiral, que se cierra según aguantas y te traga si te sueltas; sin las hojas que giran, la luz rosa ni el túnel que ves al
  tragarte (sí el sonido, la vibración y el aviso).
- PR 17a: los aparatos se recuerdan por su **pose** (`reparena3-equip`), **sin anclas de WebXR ni el suelo del guardián** (las
  anclas y la realidad mixta, con el PR 21): si el origen de la sesión cambia, hay que volver a colocarlos. Sin los ajustes
  finos con menú (mover y girar el aparato): se vuelve a colocar con las manos. Sin sesión de prueba en el ordenador.
- PR 17a: **los bichos** (avispas, zánganos, la reina, el portador) **salen con la abeja del catálogo** (los de RepArena eran
  hechos a mano: regla del usuario de no crear enemigos de cero); sin el aguijón que se dobla ni sus amagos pintados. Las
  pompas son una esfera de cristal sencilla (sin la película irisada). Sin el rastro de luz entre la cabeza y el objetivo.
- PR 16: **Toques sin espadas ni abdominales ni combinado**: hasta el PR 9 no hay espada (los bloques que se cortan salen como
  diamantes, como en RepArena sin mandos); Slam, Saltos y Flexiones se juegan; Abdominales (boca arriba) y Combinado, no todavía.
  Los aros no llevan los filamentos eléctricos ni el zumbido que traía RepArena (el aro de neón, sus flechas y su estallido
  de chispas, sí); el icono de la mano sobre el diamante es un dibujo sencillo con la inicial (D o I).
- PR 16: la realidad mixta (los objetivos a 4 m en vez de 6,5) llega con el PR 21 (`ar: false` en el sistema).
- PR 15: **Arcos más sencillo de adorno que en RepArena**: sin la rejilla de la arena, los postes laterales, la tormenta roja del
  cielo ni el zumbido continuo de los láseres; la pared sin franjas y sin la apertura de las compuertas. Los números (velocidades,
  huecos, láser, fiebre, orbes, fantasma, medalla) son los de RepArena, comparados con su código (`tests/compare/arcs-*`). Los
  arcos se miden en las gafas: ver si hace falta más adorno o si el rendimiento aguanta.
- PR 15: Arcos solo se juega con sentadilla de momento (`PLAY_MODE_EX.arcs`); con cada ejercicio de pie nuevo se amplía.
- PR 13a: **el color de las manos** (Progreso → Nivel → Manos) se guarda y se desbloquea como en RepArena, pero aquí no se ve:
  las manos son las de IWSDK (criterio del usuario). Propuestas para decidir con él: tintar la punta de los dedos de las
  manos de IWSDK, o el halo de la carga en la muñeca. El color del rayo normal sí se ve.
- PR 13a: **las misiones de variedad solo piden lo que se puede jugar aquí** (`playMode`/`playEx` del hub: hoy, Combate y los
  ejercicios de `PLAY_EX`); con cada modo nuevo (PR 15 a 18) se amplía. En RepArena pueden salir Arcos o Toques: si la lista de
  hoy ya la hizo RepArena, se respeta (es la misma guardada).
- PR 13a: probado en la VR simulada: la franja de metas y la columna HOY a los lados del menú principal, Progreso → Nivel,
  Misiones y Semana pulsados con el rayo, y una ronda ganada con las tres misiones (salen «¡TRES DE TRES!» y «¡COFRE DEL
  DÍA!» y el resumen trae el cofre con el color desbloqueado). En las gafas, por mirar: que las letras de la franja y de la
  columna se lean (son pequeñas) y que la columna no estorbe al caricatura (que sale al otro lado).
- PR 14: probado en un navegador de ordenador (1280 × 900: la página, el índice, el formulario —cambiar un número lo guarda en
  los ajustes de RepArena—, «Probar en el ordenador») y estrecho (390 × 800: la app del móvil con su inicio). En las gafas y
  en un móvil de verdad, por mirar: que «Entrar en VR» funcione desde la página (con la IWSDK ya no sale su botón
  «Enter XR»: `offer: none`), que la página se ponga al día al salir de las gafas y que la app se instale con el logotipo.
- PR 14: la realidad mixta (el botón sale en gris) llega con el PR 21; Spotify, sesiones, sincronización, pulsómetro y la tabla del
  desarrollador, con los suyos. El título de «Sonido» no lleva «y música» hasta el PR 22.
- PR 13b: probado en la VR simulada: Progreso → Campaña (el mapa, el nivel elegido), jugar el nivel 1, ganarlo (tres estrellas, «¡Nivel 5!», el resumen con «Nivel 2», «Repetir» y «Mapa»), volver al mapa y jugar el nivel 2; y la carátula «METAS DE HOY» al entrar. En las gafas, por mirar: que el mapa y los botones se pulsen cómodos. El entorno de la región (bosque, isla) llega con el PR 20: por ahora, todas en la arena.
- PR 13a: el resumen aún no propone subir o bajar de rango (RepArena: `rankFitAdd`); el colgado (`hang`) y los modos con
  metros (Arcos, Travesía) llegan con sus PR.

- PR 8c: los drones y los avispones no salen (eran geométricos, como los robots); si solo eliges esos, abejas y
  murciélagos. El dragón, solo de jefe (PR 10). En la VR simulada se han visto la abeja y el murciélago saliendo por las
  compuertas, zumbando, lanzándose a morder (silbido y golpe) y cayendo al derribarlos; el Cthulhu, el dragón y el vuelo de
  cerca, por mirar en las gafas.
- PR 8c: al morir, los voladores estallan en baba y caen al suelo con la física (en RepArena desaparecían en el sitio).
- PR 8c: el mordisco aún no se para con la guardia ni se esquiva (PR 9).
- PR 8b: los robots no salen (eran geométricos: decisión del usuario); si solo eliges robots, salen zombis verdes.
- PR 8b: las piedras se paran con la mano (muñeca o dedos); con la espada, en el PR 9. El lanzador se ha probado en la
  VR simulada (tira desde la mano y la piedra da si no te apartas); esquivarla y pararla, por mirar en las gafas.
- PR 8d: las esquivas se hacen con la física (de lado, pidiendo velocidad): si chocan con algo, se paran contra ello (en
  RepArena la esquiva se cortaba sin moverse). La voltereta, solo el diablillo, el puglin y el lanzador (los que la traen
  en su biblioteca de animaciones). En la VR simulada se han visto la amenaza (diablillo, puglin, velociraptor), las
  esquivas con voltereta y las formas de moverse elegidas; el zigzag y las paradas en guardia, por mirar en las gafas.
- PR 8d: con la «rapidez de gestos» de serie (150 %), el golpe se prepara y se da algo más deprisa que en el PR 8a (como en
  RepArena: antes iba al 100 %).
- PR 10a: los jefes no se derriban con un disparo cargado (RepArena: `knockDown`, que aquí aún no está: con las armas,
  PR 9) y su tamaño se ha probado en el navegador (el zombi verde a lo grande y el dragón); en las gafas, por ver que
  quepan bien por la compuerta. Los robots, drones, avispones y la nodriza (geométricos) no salen: en su lugar, zombis
  verdes, abejas y el dragón.
- PR 12b: probado en la VR simulada: la caricatura a la derecha del menú principal; al pulsar EMPEZAR con el rayo, la
  carátula del duelo (en negro alrededor, 7 s) y saltada con un botón del mando; tumbado en plancha, el aviso de
  calibración en el suelo bajo la cara, derecho hacia la cabeza, con la barra que se llena. En las gafas, por mirar: el
  pulgar arriba para saltar la carátula y que la caricatura se lea bien. La carátula sale hacia donde miras al pulsar
  EMPEZAR (como en RepArena): si miras al menú, algo baja. Sin gafas (en el ordenador) no sale, como en RepArena.
- PR 12b: con «Avisos breves en la vista» se ven delante lo que pide hacer algo ya («Más controlado», la pierna que toca
  en la zancada, lo que se hace mal…); las armas de la caricatura (espada y pistola) siguen apagadas hasta el PR 9.
- PR 12a: en la VR simulada, la pausa se abrió con el botón X del mando izquierdo y se cerró con «Continuar» (el rayo);
  el resumen sale al terminar la ronda y la ronda queda en el historial (partida simulada). En las gafas, por mirar: el
  botón MENÚ al mirarte la muñeca con las manos, pulsarlo con la otra mano, y recoger el menú con la palma hacia abajo o
  el puño (el sentido de «palma hacia abajo» se ha supuesto con el giro de la muñeca de WebXR; si recoge el menú al
  revés, se cambia). Con mandos, el botón sale con el mando izquierdo cerca y por debajo de la cabeza (como en RepArena).
- PR 12a: el resumen aún no trae lo de la carrera (nivel, misiones, racha de días, cofre del día: PR 13) ni la propuesta
  de subir o bajar de rango (RepArena: `rankFitAdd`).
- PR 11c: probado en la VR simulada (llegar a la línea carga, una flexión allí da ×2, al volver y ponerse de pie dispara
  y sale la onda con su sonido, que manda a los bichos a su trampilla). El polvo de la onda de RepArena (nubes que se
  hinchan y columnas que suben) aquí son chispas de colores a su paso; por mirar en las gafas si hace falta más.
  RepArena dejaba fijar con la mirada a quién va el rayo en el inchworm (con su diana); aquí va al más cercano.
- PR 11b: las arañas de RepArena (geométricas) no salen: en su lugar, cangrejos y setas (y la calavera si la eliges). En la
  VR simulada se han visto las trampillas, el marcador tumbado, cangrejos, setas y abejas diminutas saliendo, y una
  flexión que cuenta y dispara; la plancha con un brazo, comparada con RepArena y por probar en las gafas. La arena
  diminuta mira siempre hacia las compuertas (en RepArena, hacia donde mirabas al colocarte).
- PR 11a: probado en la VR simulada el superman (elegido y empezado con el mando; tumbado, la postura se toma sola; los
  voladores vienen bajos; subir el tronco y aguantar dispara solo al más cercano, perfecta). Los fondos y la plancha
  lateral, comparados con RepArena; en las gafas, por probar los tres. Cómo colocarse lo dicen el aviso del centro y la
  caricatura (PR 12b).
- PR 11a: los avisos de lo que se hace mal en grande en el suelo, tumbado, salen en el suelo delante (como de pie); en
  RepArena, mirando arriba (remo, abdominales) salían por encima de la cara: con esos ejercicios.
- PR 10c: el marcador de RepArena se pintaba entero en un lienzo; aquí, con los paneles de UIKit (letras nítidas) y solo el
  rosco en un lienzo. Diferencias: la mecha del relámpago es una barra que se consume en el borde de arriba (en RepArena,
  todo el borde); las vidas, círculos rosas (las letras no tienen ♥); el rango, su nombre (sin el escudo con galones); en
  «Marcador: Compuertas» y «Columna» lo dejan a la izquierda.
- PR 10c: en la VR simulada se han visto el marcador (con el relámpago, las vidas, el rosco y el rango) y un trofeo dorado
  arriba, por encima de las compuertas; en las gafas, por ver que se lea bien de lejos.
- PR 10b: en la VR simulada se han pulsado las cartas con el rayo del mando y se ha abierto el cofre saltando (con las
  gafas emuladas: la cabeza sube deprisa); el dorado, el relámpago, la escarcha y la onda, en la partida simulada y por
  mirar en las gafas. Con ritmo marcado, el relámpago de RepArena esperaba a la frase de la canción (32 pulsos) con cuenta
  atrás y la luz de la compuerta latía con el pulso: llega con la música (PR 22).
- PR 10b: el halo del dorado se ve a través del cuerpo (como en RepArena: «también por delante del cuerpo»).
- PR 10a: entre oleadas, mientras descansas, las repeticiones no cargan la bola (como antes); en RepArena sí contaban.
- PR 8a: el baile al compás, con el ritmo
  marcado (Opciones → Sonido); el de la canción de Spotify, con el PR 22.
- PR 8a: el golpe no se puede parar todavía (la guardia y las espadas, PR 9).
- PR 8a: en la VR simulada se han visto el capitán, el yeti, el zombi y el velociraptor saliendo, yendo a su puesto,
  golpeando y con su voz; el baile al compás y las bolitas de vida de cerca, por mirar en las gafas.

- PR 7: los menús se han pulsado en la VR simulada con el rayo del mando y con el dedo (la pulsación de IWSDK: contactos
  de medio segundo, que cuentan); en las gafas, por ver que se pulsa cómodo y sin tocar dos teclas.
- PR 7: los números se cambian con − y + (paso a paso); RepArena tenía además el deslizador y el teclado numérico.
- PR 7: algunos ajustes de Opciones aún no hacen nada aquí (los guarda y los usa RepArena): los del entorno (escenario,
  fondo, luciérnagas, fotogramas), el ritmo de la música, «Manos con el cuerpo», los de las pistolas y espadas… Se
  encienden con su PR.
- PR 7: los galones de los rangos son su nombre abreviado (RepArena los dibujaba); «Restablecer» una pestaña, «A otro
  aparato» y la sincronización, con el PR 23.
- PR 6: el filtro de las manos de RepArena (`HF`) no se portó entonces (IWSDK de serie); desde el PR 30 sí (opción B del
  usuario: las manos de RepArena enteras).
- PR 6: en las gafas, por probar todos los ejercicios de pie; en la VR simulada se han probado la sentadilla (con el aviso
  en el suelo y la carga hasta ×4) y el curl (carga arriba, chasquido, ×2-×4 y el rayo al bajar), elegidos en el
  selector con el mando. En el emulador, al pasar a manos, aparecen a media altura: cuenta un curl que no se ha hecho
  (en las gafas las manos aparecen donde están).
- PR 6: el aviso del suelo sale delante y se queda quieto; RepArena lo volvía a poner delante si te girabas mucho (más de
  65°). En Combate no hace falta (se mira hacia las compuertas).
- PR 6: al pulsar EMPEZAR con otro modo guardado (Arcos, Toques…) se guarda Combate también para RepArena (comparten
  los ajustes): es lo único que se puede jugar aquí por ahora.
- PR 6: en el ordenador solo se prueban los ejercicios de la cabeza (flecha abajo); los de brazos, en la VR simulada.
- Sin pistolas ni espadas todavía (PR 9): si el usuario las tiene puestas en RepArena, aquí se lanza con las manos.
- «Manos con el cuerpo» no hace nada aquí: IWSDK no pide el seguimiento del cuerpo (criterio de usar IWSDK de serie).
- Las 72 imágenes por segundo del estilo Cómic y la arena no se han podido medir (el emulador no tiene tarjeta gráfica):
  hay que mirarlo en las gafas. Para aligerar: sin sombras en tiempo real y lo fijo de cada compuerta en pocas mallas.
- Los zombis no tienen sombra (sin sombras en tiempo real; la de contacto de IWSDK pide el origen a ras de suelo, y el de
  los zombis está en el centro de su cuerpo): por ver en las gafas si hace falta.
- Los avisos «Missing glyph info» de la consola (tildes y ×) salen una sola vez, al cargar, antes de que los paneles
  reciban Rubik y Bungee (con el panel aún oculto): son inofensivos, no vuelven durante la partida.
- Los sonidos del usuario suenan sin el eco de sala que les añadía RepArena (IWSDK no lo tiene); los de serie lo llevan.

## Fallos de IWSDK

*(Desde el PR 31, los menús son los de RepArena y no usan `PokeInteractable` ni los paneles de UIKitML: los apaños de abajo
para el toque, la mano que atraviesa y la letra se quedan apuntados por si se vuelve a lo de IWSDK.)*

Los que se han encontrado en la versión que usamos (`@iwsdk/core` 1.1.0-rc.2) y cómo se sortean. Si una versión nueva los
arregla, se quita el apaño.

- **Pulsar con el dedo** (`PokeInteractable` y su punto de toque): pulsa al acercarse a 2 cm **por cualquier lado** (también
  desde detrás o por debajo del panel: al mover las manos cerca del menú se pulsaban teclas solas) y solo cuenta si se suelta
  en menos de 0,8 s sobre la misma tecla. Apaño (PR 27): su pulsación con el dedo se apaga (`clickThresholdMs`; la del rayo, con
  la pinza, sigue) y la hace `src/ui/solid-keys.ts` con las teclas medidas en cada panel (las que escuchan la pulsación; los
  elementos de UIKit están «invisibles» para Three: se mira `isVisible`), solo con el dedo que llega por delante. Cada tecla
  atiende una pulsación cada vez (`onPress`, `src/ui/press.ts`).
- **IWSDK vuelve a enseñar su mano en cada fotograma** (pone `model.visible`): para esconderla bajo los guantes, se esconde su
  piel por dentro, y solo mientras se pinta el guante de ese lado (`GLOVE_ON`).
- **La mano desnuda es un fantasma** (`AnimatedHand`: transparente por dentro, con un borde blanco); en las gafas se veía a
  través de ella. No es un fallo, es su diseño; aquí se cambia por una opaca (`src/input/skin-hand.ts`) o por los guantes.
- **Su mano solo se apoya en las teclas mientras pulsa** (`getTouchSurfaceVisualOffset`): fuera de una tecla, o en el fondo del
  panel, el dedo lo atravesaba. Se completa con lo mismo de IWSDK (`applyVisualOffsetWorld`) en `src/ui/solid-keys.ts`.
- **La mano que agarra el mando** (`AnimatedControllerHand`, para «Mandos como manos») no funciona tal cual: recibe los
  datos en otro orden del que le pasa IWSDK (cogía la escena entera y fallaba al crearse), le carga el modelo del mando en
  vez del de la mano, compartiría el modelo con la mano desnuda y, si una imagen tarda más de 0,1 s, los dedos se le
  disparan (planos blancos enormes y luego la mano desaparece). Apaño: `src/input/controller-hand.ts`.
- **El toque del dedo ilumina desde 20 cm** (el puntero de toque, `hoverRadius`): con la mano a esa distancia del menú
  iluminaba la tecla más cercana a la punta del dedo aunque el rayo señalara otra (el «puntero invisible» que veía el
  usuario). Apaño (PR 28): su radio baja a 3 cm (`src/ui/solid-keys.ts`), lo justo para cuando el dedo ya va a tocar.
- **UIKit no encoge la letra**: una palabra más ancha que su botón se sale y pisa a las vecinas. Apaño (PR 28): `src/ui/fit.ts`
  la ajusta en los paneles que se ven (`FitTextSystem`, `src/ui/fit-text.ts`), como RepArena al pintar cada tecla.
- **El sonido suelto** (`AudioUtils.createOneShot`) no se coloca donde se le dice ni se borra al acabar. Apaño: cada sonido
  tiene unas pocas fuentes fijas que se colocan al tocarlas (`src/audio/sound.ts`).
- **AudioSource no cambia el tono**: se les pone a sus voces (`AudioPool`, que IWSDK deja usar para casos así).
- **Fuera de la VR, el sonido no se abre** (IWSDK solo lo abre al entrar): en el ordenador, con el primer toque o tecla.
