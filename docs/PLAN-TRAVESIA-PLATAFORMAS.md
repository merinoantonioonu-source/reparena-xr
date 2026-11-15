# Plan: Travesía de plataformas (RepArena XR)

Plan de ejecución para otra IA. **Quien ejecuta: Opus 5.5 (esfuerzo alto), que delega trabajos acotados en subagentes
Sonnet (esfuerzo alto)**. Este documento no ejecuta nada: dice qué construir, en qué orden, quién hace cada parte y cómo
se da por buena.

Repositorio: `merinoantonioonu-source/reparena-xr`. Antes de empezar, lee `AGENTS.md`, `MIGRACION.md` y
`docs/REGLAS.md` (las reglas del usuario mandan; el usuario no programa y todo se le explica en español, por lo que se ve
y se siente en las gafas).

---

## 1. Qué es

La Travesía de RepArena (avanzar por un sendero a fuerza de repeticiones) convertida en un **juego de plataformas en
primera persona**. El jugador no se desplaza por la habitación: el mundo viene hacia él. Avanza con **sentadillas** o
**moviendo los brazos como al correr**, y el recorrido le pide otros movimientos:

| Lo que hay en el recorrido | Movimiento que pide |
| --- | --- |
| Hueco en el suelo | Salto |
| Viga o rama baja | Agacharse |
| Obstáculo a un lado | Paso lateral |
| Plataforma más alta | Sentadilla con salto |
| Túnel bajo | Postura de flexión (y flexiones para cruzarlo) |
| Muro bajo | Burpee: al suelo, arriba y salto |
| Enemigo en el camino | Salto encima |
| Gemas en el aire | Alcanzarlas con la mano |

Es un juego **original**: se toman las mecánicas del género (correr, saltar, plataformas), no personajes, nombres, música,
niveles ni aspecto de ningún juego existente. Los modelos son los de los packs que ya usa el proyecto.

## 2. Decisiones de diseño (recomendadas; el usuario confirma las del apartado 9 antes de empezar)

> **Cambiado por el usuario tras probar el PR A en las gafas:** el avance **nunca se para ante un obstáculo** (la idea es
> entrenar los reflejos): el hueco se salta en marcha, al llegar a su borde, y si no saltas a tiempo tropiezas al cruzarlo
> (frenas a la mitad y pierdes la racha; nunca se cae). Chocar frena a la mitad, sin pararte. Cada salto se nota: el mundo
> baja y sube bajo los pies unos 45 cm. En el aire llevas tu inercia (al aterrizar, la misma velocidad). Y va un 35 % más
> deprisa que la Travesía clásica, acelerando antes. Lo único que para el mundo: el cofre al final del tramo y, por
> seguridad, los pasos de suelo del PR B (no se baja al suelo con el mundo en marcha).

1. **Dos clases de obstáculo.**
   - *Fluidos* (viga baja, obstáculo lateral, tronco pequeño): se pasan sin parar. Si fallas, chocas: frenas y pierdes la
     racha, sin perder vidas (regla ya fijada para troncos y ramas de la Travesía).
   - *Pasos* (hueco, plataforma, túnel de flexiones, muro de burpee): **el mundo se para a 1 m** y el movimiento pedido
     es el que te lleva al otro lado. No dependen de acertar el instante: las manos y la cabeza llegan con retraso en las
     gafas (por eso se quitaron los puñetazos a los bandidos), y nadie debe tirarse al suelo con prisa.
2. **Nunca se cae.** Sin caídas al vacío ni cámara que se desploma (marea). En el borde de un hueco te paras.
3. **Subir y bajar**: el mundo baja o sube suave bajo tus pies durante el salto (como en el arroyo de la Travesía:
   «el mundo baja y sube como si te elevara»), 0,35-0,5 s, nunca de golpe.
4. **Lateral**: un paso real de unos 35 cm (el ajuste `arcShift` de Arcos), no carriles. Tras apartarte, el recorrido te
   deja volver al centro antes del siguiente.
5. **Se reutiliza el modo `trek`** (nombre «Travesía»), no un modo nuevo: la versión clásica comparte los ajustes
   (`reparena3-settings`) y su `exFor()` falla con un modo que no conoce. Los ajustes nuevos van con `xr: true`
   (`reparenaxr-settings`). El fantasma y los récords de esta Travesía, en claves `reparenaxr-*` para no mezclarse con
   los de la clásica.
6. **Avance con brazos**: es un ajuste propio de XR («Avance: sentadillas / correr con los brazos»), no un ejercicio
   nuevo del catálogo compartido. Con codos a 90° y las manos por delante del tronco (ahí las cámaras las ven); la
   cadencia da la velocidad. Si las gafas pierden las manos, vale el vaivén de la cabeza al trotar en el sitio.
7. **Niveles = tramos** (como en la Travesía): cada oleada es un tramo, con su paisaje; al final, el cofre. La dificultad
   sube de un tramo a otro, no dentro de él (regla fijada).

## 3. Lo que ya existe y se reutiliza (no reescribir)

- `src/modes/trek/path.ts`: `Trek` (impulso por repetición, velocidad, frenada, turbo por racha, curvas, biomas),
  `trekRng`, `trekBoardLine`. `halts.ts`: `trekMoveStep` (salto, sentadilla y zancada contados por la cabeza), `trekHop`
  (el mundo que te lleva en un salto). **Estos archivos se comparan con RepArena (`tests/compare/trek-*.compare.test.ts`):
  no se modifican; lo nuevo va en archivos nuevos que los usan.**
- `src/modes/arcs/`: cómo se juzga agacharse, apartarse, la valla y la plancha (`arc.ts`), el tiempo para levantarse tras
  la plancha (`BURPEE_UP`, 3 s) y entre saltos (`ARX_JUMP_GAP`, 1,1 s), y el salto (`jumpFastT`). `arcs-system.ts` es el
  patrón de un sistema de modo: `begin`, `startWave`, `waveLeft`, `hud`, `end`, `clear`, enganchados en
  `src/combat/game.ts`.
- `src/exercise/standing.ts` (`StandingDetector`): sentadilla y sentadilla con salto (`jsquat`), con profundidad.
  `src/exercise/floor.ts`: flexiones.
- `src/env/scenery.ts`: paisaje con instancias, una pieza por modelo. `public/models/island.glb` trae el muelle (tablas,
  tablas rotas, postes), barriles, cajas y cofres; `nature.glb`, rocas, troncos y árboles.
- Avisos y paneles: `floorWarn`, `HOOKS.toast`, `trophy`, `VIEW.center`, marcador (`src/ui/board-draw.ts`), todos en
  lienzos.
- Diagnóstico: `diagEvent` (`src/core/diag.ts`).

## 4. Arquitectura

Lógica pura (sin `@iwsdk/core`; cálculo 3D desde `'three'`), con pruebas en `tests/unit/`:

| Archivo nuevo | Qué hace |
| --- | --- |
| `src/modes/trek/plat/types.ts` | Los contratos: `Piece` (pieza del recorrido), `PlatEnv` (lo que la lógica pide al juego: ajustes, cabeza, manos, reloj, azar), `PlatEv` (sucesos: decir, sonar, chispas, puntos, racha, pieza nueva o quitada, parar, elevar) |
| `src/modes/trek/plat/moves.ts` | `BodyMoves`: de la cabeza (y la altura de pie calibrada) saca, fotograma a fotograma, si estás en el aire, agachado, apartado a un lado, en plancha, y cuenta flexiones y sentadillas con salto. Sin temporizadores ocultos: todo por `dt` |
| `src/modes/trek/plat/course.ts` | El recorrido: biblioteca de segmentos (listas de piezas con distancias) y `buildCourse(env, tramo, rango, rng)`, que los encadena cumpliendo las reglas de separación |
| `src/modes/trek/plat/runner.ts` | `Runner`: dónde estás en el recorrido, la velocidad (usa `Trek` para el impulso), cuándo te paras ante un paso, el juicio de cada pieza y los sucesos que salen |
| `src/exercise/run.ts` | `RunDetector`: cadencia de brazos (y de cabeza, de reserva) → impulso. No toca la lectura de las manos (`hand-filter.ts`): solo lee `hands` |

Con IWSDK:

| Archivo nuevo | Qué hace |
| --- | --- |
| `src/modes/trek/plat/pieces.ts` | Qué modelo (o modelos) es cada pieza y sus medidas; grupos de instancias reutilizados |
| `src/modes/trek/trek-system.ts` | `TrekSystem`: pinta el recorrido que la lógica decide, aplica los sucesos y se engancha a la partida como `ArcsSystem` |

**Piezas (`Piece.k`)**: `floor` (suelo corrido), `gap` (hueco, con su largo), `low` (viga baja, con su altura), `side`
(obstáculo a un lado), `log` (tronco para saltar en marcha), `step` (plataforma: +altura), `drop` (bajada), `crawl`
(túnel: n flexiones), `burpee` (muro), `foe` (enemigo que pisar), `gems` (hilera de gemas), `chest` (fin del tramo).

**Reglas del recorrido** (las comprueba una prueba con miles de recorridos al azar):
- Tras `crawl` o `burpee`, al menos lo que se recorre en 3 s a velocidad máxima antes de otra cosa.
- Entre dos saltos seguidos, al menos 1,1 s a velocidad máxima.
- Tras `side`, sitio para volver al centro; nunca dos `side` del mismo lado seguidos sin vuelta.
- Nada pide dos movimientos a la vez. Un tramo siempre se puede acabar.
- Los obstáculos aparecen a lo lejos (88 m, entre la niebla), no de golpe cerca.
- Cada pieza nueva de dificultad entra de un tramo al siguiente, no a mitad de tramo.

**Rendimiento (lecciones de esta migración, obligatorias)**:
- 72 imágenes por segundo: 14 ms por imagen. Nada de crear objetos en `update()`.
- Todo el recorrido, con `InstancedMesh`: una pieza por modelo, con ventana de 5 trozos de 24 m que se reciclan.
- Los materiales y modelos, precompilados antes de la ronda (`warmKeep`, `src/style/warm.ts`).
- Ningún lienzo se repinta en cada fotograma; los textos, con dibujos guardados o `fitFont`.
- Los contadores de las piezas (flexiones que faltan, etc.) van al marcador o a avisos existentes, no a paneles nuevos.

## 5. Fases (cada una, un PR que el usuario prueba en las gafas antes de la siguiente)

### PR A · Armazón jugable (sentadillas, tres obstáculos y el hueco)

1. **[Opus]** Escribir `types.ts` completo y las firmas públicas de `moves.ts`, `course.ts`, `runner.ts` (sin cuerpo),
   más la lista de sucesos. Es el contrato que reciben los subagentes: no se delega.
2. **[Opus]** `runner.ts`: avance con `Trek`, parada a 1 m de un paso, juicio de `low`, `side`, `log` y `gap`, sucesos.
3. **[Opus]** `moves.ts`: en el aire, agachado, a un lado (con los umbrales de los ajustes de Arcos).
4. **[Sonnet]** `course.ts`: la biblioteca de segmentos para las cuatro piezas y `buildCourse`, con la prueba de las
   reglas del recorrido (`tests/unit/plat-course.test.ts`, 5.000 recorridos al azar). Recibe `types.ts` y las reglas del
   apartado 4.
5. **[Sonnet]** `tests/unit/plat-sim.ts`: un simulador de cabeza (de pie, sentadilla, salto, agacharse, paso lateral)
   como `tests/unit/hands-sim.ts`, y `plat-runner.test.ts` con recorridos guionizados: los hace bien y pasa; los hace mal
   y choca; no hace nada y se queda parado ante el hueco.
6. **[Sonnet]** `pieces.ts`: piezas con modelos que ya están (`island.glb`: tablas del muelle para el suelo y los huecos,
   postes y tablas para la viga, barril o caja para el lateral; `nature.glb`: tronco). Tabla de modelo, escala y medidas;
   prueba de que cada modelo existe en su kit (como `tests/unit/foes.test.ts`).
7. **[Opus]** `trek-system.ts` y los enganches en `game.ts` (`begin`, `startWave`, `waveLeft`, `hud`, `end`, `clear`),
   `PLAY_MODES`/`PLAY_MODE_EX` (`src/core/playable.ts`: `trek` con `squat`), la línea del marcador y los metros en el
   historial (`dist`).
8. **[Sonnet]** Modo ordenador: teclas para probar (flecha abajo, sentadilla, ya existe; Espacio, salto; C, agacharse;
   A/D, lateral) y la Travesía en `tests/e2e/run.mjs` (empieza, avanza, pasa una pieza de cada clase, llega al cofre) con
   `window.__rx.snapshot().trek`.
9. **[Opus]** Revisión, comprobación completa y PR.

**Se da por bueno si**: en el ordenador se completa un tramo; en las gafas, el usuario avanza con sentadillas, se para
solo ante el hueco y lo cruza de un salto, y el menú y la escena no pierden imágenes (medidor a 72).

### PR B · Plataformas, túnel de flexiones y burpee

1. **[Opus]** `moves.ts`: plancha, cuenta de flexiones por la cabeza, sentadilla con salto (reutilizando el criterio de
   `jsquat`). `runner.ts`: `step`, `drop`, `crawl`, `burpee`, con el mundo subiendo y bajando (suave, 0,35-0,5 s).
2. **[Opus]** Seguridad y comodidad: aviso grande antes de cada paso de suelo (como el arco de plancha: «aviso grande
   delante»), el mundo quieto mientras estás abajo, 3 s para levantarte, sin reloj que apriete.
3. **[Sonnet]** Segmentos nuevos en `course.ts` y sus casos en las pruebas (reglas de 3 s y 1,1 s).
4. **[Sonnet]** Piezas en `pieces.ts` (plataforma: cajas o rocas apiladas; túnel: tablas sobre postes; muro: caja) y
   teclas del modo ordenador para plancha y flexión.
5. **[Sonnet]** Textos: `src/exercise/how.ts` y la caricatura del modo (`src/ui/demo-art.ts`), sin hablar de rayos
   (regla: «cada repetición empuja por el sendero»).
6. **[Opus]** Revisión, comprobación y PR.

### PR C · Correr con los brazos

1. **[Opus]** `src/exercise/run.ts`: diseño y código. Señal: vaivén alterno de las muñecas respecto a la cabeza (eje
   delante-atrás y arriba-abajo), con histéresis; cadencia → impulso equivalente al de las repeticiones; reserva con el
   vaivén vertical de la cabeza. Cada zancada detectada y cada pérdida de manos, con `diagEvent`.
2. **[Sonnet]** Pruebas con trazas sintéticas (`tests/unit/run.test.ts`): brazos a 120-180 pasos por minuto; una mano
   perdida; brazos quietos (no avanza); gestos que no son correr (rascarse, señalar el menú: no avanza).
3. **[Sonnet]** El ajuste `trekAdvance` (`xr: true`, en `SCHEMA`, grupo `travesia`, con su `hint`) y su fila en la caja
   del modo en el menú principal y en la página.
4. **[Opus]** Enganche en `runner.ts`, comprobación y PR. **Este PR necesita el diagnóstico del usuario en las gafas**
   para ajustar umbrales: pedírselo antes de tocarlos.

### PR D · Enemigos, gemas, cofre y paisajes

1. **[Opus]** `foe` (enemigo que llega andando por el recorrido; se pisa saltando cuando está a tu altura; si no, te
   frena y rompe la racha) y `gems` (se cogen con la mano o la cabeza, como los orbes de Arcos).
2. **[Sonnet]** Enemigos con modelos que ya hay (seta y cangrejo de `monstruitos/`), gemas y el cofre de `island.glb`
   con su aviso («los cofres dicen al aparecer qué hay dentro…», regla fijada) y la colección `reparena3-gems`.
3. **[Sonnet]** Un paisaje por tramo con los biomas de `TREK_BIOMES` y el fondo realista de cada uno; sonidos del
   catálogo (`sounds/LEEME.md`) para salto, choque, gema y enemigo pisado.
4. **[Opus]** Turbo por racha (el de `Trek`), medalla y fantasma (`reparenaxr-*`), campaña (`src/core/campaign.ts`) y
   misiones (`playMode`/`playEx`). Revisión y PR.

### PR E · Tabla del desarrollador y repaso

1. **[Sonnet]** Los ajustes del modo en la tabla de dificultad (`src/core/dev.ts`) por rango: velocidad, separación,
   altura de vigas, flexiones del túnel, cuántos pasos por tramo.
2. **[Sonnet]** Documentación: `README.md` (tabla de archivos), `AGENTS.md` (convenciones del modo), `MIGRACION.md`
   (estado, notas y fallos conocidos) y `docs/REGLAS.md` (las reglas que el usuario haya fijado para este modo).
3. **[Opus]** Repaso con el diagnóstico de las gafas y arreglos.

## 6. Cómo delegar en Sonnet

- Opus lanza cada tarea **[Sonnet]** como subagente (modelo `sonnet`, esfuerzo `high`), en un árbol de trabajo aparte si
  va en paralelo con otra.
- Cada encargo lleva: los archivos que puede tocar (y solo esos), el contrato ya escrito (`types.ts` y firmas), las
  reglas de este plan que le afectan, las convenciones de `AGENTS.md` (español, TypeScript estricto, sin objetos nuevos
  en `update()`, Three desde `@iwsdk/core` salvo la lógica pura) y el criterio de aceptación: `npm run typecheck` y sus
  pruebas en verde.
- Sonnet no decide diseño: si algo no encaja con el contrato, lo dice y para.
- Opus revisa cada diff antes de integrarlo, ejecuta la comprobación completa y es quien habla con el usuario.

**No se delega (siempre Opus)**: los contratos, `runner.ts`, `moves.ts`, `run.ts`, `trek-system.ts`, los enganches en
`game.ts`, todo lo que afecte a comodidad y seguridad en VR, interpretar diagnósticos de las gafas y los PR.

## 7. Comprobación de cada PR

```bash
npm run typecheck
```

```bash
npm test
```

```bash
RA_DIR=../reparena npm run test:compare
```

```bash
npm run test:e2e
```

- `test:compare` tiene que seguir en verde sin tocar los archivos comparados de `src/modes/trek/`.
- Capturas del modo en «Probar en el ordenador».
- El PR, en español, con: qué cambia (lo que se ve en las gafas), cómo se ha probado, qué mirar en las gafas y fallos
  conocidos. El usuario fusiona.

## 8. Riesgos

- **Correr con los brazos**: con los brazos abajo las gafas pierden las manos a menudo. Por eso va en su propio PR, con
  reserva por la cabeza y diagnóstico. Si no va bien, el modo sigue completo con sentadillas.
- **Mareo**: avance de hasta 2 m/s más subidas y bajadas. Mitigación: movimientos verticales suaves, sin caídas, curvas
  apagables («Sendero con curvas») y el mundo quieto en los pasos de suelo.
- **Espacio de juego**: saltos y paso lateral reales. Lateral máximo, el de `arcShift`; nunca dos al mismo lado seguidos.
- **Rendimiento**: el recorrido se suma al paisaje. Presupuesto: no más triángulos a la vista que el bosque de Combate
  (regla fijada), todo con instancias.
- **Modelos**: la regla del usuario es no crear elementos de cero. Con los kits actuales las plataformas salen del
  muelle, cajas y rocas; quedarían mejor con un pack de plataformas (ver 9.3).

## 9. Lo que el usuario tiene que confirmar antes de empezar

1. ¿Los huecos, plataformas, túnel y burpee **paran el mundo** hasta que haces el movimiento (recomendado), o hay que
   acertar el instante en plena carrera?
2. ¿Fallar solo frena y rompe la racha (recomendado, como en la Travesía), o quita vidas?
3. ¿Aportas un pack de plataformas (el *Ultimate Platformer Pack* de Quaternius, de donde ya salieron los zombis verde
   y gordo) o se monta con lo que hay (muelle, cajas, rocas)?
4. ¿Esta Travesía **sustituye** a la anterior en RepArena XR (recomendado; la clásica sigue en `clasica.html`), o
   conviven las dos?
5. Para pisar enemigos, ¿valen la seta y el cangrejo que ya están en el juego?
