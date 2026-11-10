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

- Fase 0 cerrada (PR 1-5 + el cierre de la comprobación del sonido en la VR simulada): `window.__rx.snapshot().steam`
  cuenta el vapor de las compuertas (lanzado y visto a la vez) y la partida simulada lo exige.

## Fallos conocidos

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
- PR 8a: los jefes,
  la escalera de dureza y la resistencia que sube por oleadas superadas, con el PR 10. El baile al compás, con el ritmo
  marcado (Opciones → Sonido); el de la canción de Spotify, con el PR 22.
- PR 8a: el golpe no se puede parar todavía (la guardia y las espadas, PR 9).
- PR 8a: en la VR simulada se han visto el capitán, el yeti, el zombi y el velociraptor saliendo, yendo a su puesto,
  golpeando y con su voz; el baile al compás y las bolitas de vida de cerca, por mirar en las gafas.

- PR 7: los menús se han pulsado en la VR simulada con el rayo del mando y con el dedo (la pulsación de IWSDK: contactos
  de medio segundo, que cuentan); en las gafas, por ver que se pulsa cómodo y sin tocar dos teclas.
- PR 7: los números se cambian con − y + (paso a paso); RepArena tenía además el deslizador y el teclado numérico.
- PR 7: algunos ajustes de Opciones aún no hacen nada aquí (los guarda y los usa RepArena): los del entorno (escenario,
  fondo, luciérnagas, fotogramas), el ritmo de la música, «Manos con el cuerpo», los de las pistolas y espadas… Se
  encienden con su PR. La ficha de la ronda dice las oleadas y repeticiones de RepArena: aquí las oleadas aún son las del
  prototipo (PR 10).
- PR 7: los galones de los rangos son su nombre abreviado (RepArena los dibujaba); «Restablecer» una pestaña, «A otro
  aparato» y la sincronización, con el PR 23.
- PR 6: el filtro de las manos de RepArena (`HF`: manos al alcance y sin saltos imposibles, en todo lo que va con las
  dos manos en una pesa) no se porta, como pidió el usuario (IWSDK de serie). Si en las gafas vuelven los rayos al azar
  (sobre todo en el curl con barra), se busca primero en IWSDK y, si no hay nada, se le propone el `HF` al usuario.
- PR 6: en las gafas, por probar todos los ejercicios de pie; en la VR simulada se han probado la sentadilla (con el aviso
  en el suelo y la carga hasta ×4) y el curl (carga arriba, chasquido, ×2-×4 y el rayo al bajar), elegidos en el
  selector con el mando. En el emulador, al pasar a manos, aparecen a media altura: cuenta un curl que no se ha hecho
  (en las gafas las manos aparecen donde están).
- PR 6: la zancada dice qué pierna toca en el marcador (RepArena lo decía delante de la cara: los avisos de la vista
  llegan con el PR 12), igual que PERFECTA y las celebraciones (PR 10).
- PR 6: el aviso del suelo sale delante y se queda quieto; RepArena lo volvía a poner delante si te girabas mucho (más de
  65°). En Combate no hace falta (se mira hacia las compuertas).
- PR 6: al pulsar EMPEZAR con otro modo guardado (Arcos, Toques…) se guarda Combate también para RepArena (comparten
  los ajustes): es lo único que se puede jugar aquí por ahora.
- PR 6: en el ordenador solo se prueban los ejercicios de la cabeza (flecha abajo); los de brazos, en la VR simulada.
- La dificultad creciente sube con cada oleada; en RepArena solo con las superadas con soltura (pocos golpes): llega en el
  PR 10.
- Sin pistolas ni espadas todavía (PR 9): si el usuario las tiene puestas en RepArena, aquí se lanza con las manos.
- «Manos con el cuerpo» no hace nada aquí: IWSDK no pide el seguimiento del cuerpo (criterio de usar IWSDK de serie).
- Las 72 imágenes por segundo del estilo Cómic y la arena no se han podido medir (el emulador no tiene tarjeta gráfica):
  hay que mirarlo en las gafas. Para aligerar: sin sombras en tiempo real y lo fijo de cada compuerta en pocas mallas.
- Los zombis no tienen sombra (sin sombras en tiempo real; la de contacto de IWSDK pide el origen a ras de suelo, y el de
  los zombis está en el centro de su cuerpo): por ver en las gafas si hace falta.
- Los avisos «Missing glyph info» de la consola (tildes y ×) salen una sola vez, al cargar, antes de que los paneles
  reciban Rubik y Bungee (con el panel aún oculto): son inofensivos, no vuelven durante la partida.
- Los sonidos del usuario suenan sin el eco de sala que les añadía RepArena (IWSDK no lo tiene); los de serie lo llevan.
- El combo (cada 10 repeticiones seguidas) aún no suena: llega con el PR 10.

## Fallos de IWSDK

Los que se han encontrado en la versión que usamos (`@iwsdk/core` 1.1.0-rc.2) y cómo se sortean. Si una versión nueva los
arregla, se quita el apaño.

- **La mano que agarra el mando** (`AnimatedControllerHand`, para «Mandos como manos») no funciona tal cual: recibe los
  datos en otro orden del que le pasa IWSDK (cogía la escena entera y fallaba al crearse), le carga el modelo del mando en
  vez del de la mano, compartiría el modelo con la mano desnuda y, si una imagen tarda más de 0,1 s, los dedos se le
  disparan (planos blancos enormes y luego la mano desaparece). Apaño: `src/input/controller-hand.ts`.
- **El sonido suelto** (`AudioUtils.createOneShot`) no se coloca donde se le dice ni se borra al acabar. Apaño: cada sonido
  tiene unas pocas fuentes fijas que se colocan al tocarlas (`src/audio/sound.ts`).
- **AudioSource no cambia el tono**: se les pone a sus voces (`AudioPool`, que IWSDK deja usar para casos así).
- **Fuera de la VR, el sonido no se abre** (IWSDK solo lo abre al entrar): en el ordenador, con el primer toque o tecla.
