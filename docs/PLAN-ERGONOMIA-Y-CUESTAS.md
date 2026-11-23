# Plan: lo que se ve desde cada postura, el superman, las cuestas y Arcos

Plan trazado a partir de lo que el usuario grabó en las gafas el 22/11/2026 (un diagnóstico del superman y tres vídeos) y de
sus peticiones de ese día. **Quien traza el plan no toca el código; lo implementa otra IA.** Todo lo de aquí sigue las normas
de `AGENTS.md`, `docs/REGLAS.md` y `MIGRACION.md` (léelos antes): español, explicar por lo que se ve en las gafas, propuestas
cuando haya varias formas, lógica pura con pruebas, nada de crear objetos en `update()`.

## 0. Quién hace qué y cómo se trabaja

- **Opus (alto)** dirige y hace lo delicado: decide el diseño dentro de lo que aquí se fija, escribe la lógica pura nueva
  (detectores, `Runner`, vuelo, cuestas), todo lo que se pinta en las gafas con riesgo (orden de pintado, sombreadores, XR),
  revisa cada cambio de Sonnet antes de fusionar y es quien habla con el usuario.
- **Sonnet (alto)** ayuda en lo bien acotado, siempre con un encargo escrito por Opus (objetivo, archivos, qué no tocar y
  cómo se comprueba): pruebas unitarias y de comparación, tablas y catálogos (`short-msg.ts`, `how.ts`, esquema de ajustes),
  inventarios y documentación, guiones de capturas, y los arreglos mecánicos marcados con **[S]**.
- En cada apartado, **[O]** = lo hace Opus, **[S]** = lo hace Sonnet y lo revisa Opus.
- **Un PR por bloque**, en el orden del apartado 3. Cada PR: `npm run typecheck`, `npm test`, `npm run test:compare` (con
  `RA_DIR` si hay clon de RepArena), `npm run build`, `npm run test:e2e`; capturas en el ordenador de lo que cambia a la
  vista (con la cámara en la postura del ejercicio: de pie, en plancha —tecla W en la Travesía—, tumbado); reglas nuevas en
  `docs/REGLAS.md`, nota en `MIGRACION.md` y, si cambia dónde está algo, `AGENTS.md` y la tabla de `README.md`.
- **Lo que no se toca sin el usuario**: la lectura de las manos (`hand-filter.ts`), `barStep`/`armStep`, el impulso de la
  Travesía (`Trek` de `path.ts`: lo comparan `tests/compare/trek-*`) y las reglas de `docs/REGLAS.md` que este plan no
  cambia expresamente. Lo portado de RepArena que aquí se cambia (el vuelo, el superman) conserva su camino antiguo detrás de
  un parámetro para que `tests/compare` siga comparándolo.
- Si al implementar algo resulta ambiguo, **propuestas al usuario** (con capturas), no decisiones por libre.

## 1. Lo que se encontró (causas, con su sitio en el código)

### 1.1 Superman: los enemigos llegan antes de que dé tiempo (diagnóstico de las 19:55)

- **Fallo de ritmo**: `src/combat/game.ts:890` calcula cada cuánto sale un enemigo con `REP_TIME[settings.exercise] ?? 2.4`,
  y `REP_TIME` (`src/combat/waves.ts:70`) solo tiene los ejercicios de pie. El superman cae en 2,4 s cuando una repetición
  suya lleva `supHold + 3` ≈ 5 s (así lo calcula RepArena, `repTimeOf` en `src/00_core.js:586`, y aquí la página,
  `src/page/pick.ts:18`). Solo con voladores, sale uno cada 2,3 s: el doble de rápido de lo que se pueden derribar. Lo mismo
  les pasa al inchworm (8 s), los fondos, la plancha lateral, las flexiones y la plancha con un brazo.
- En el diagnóstico el usuario hace una repetición perfecta cada 3,1–3,3 s (aguante de 2 s): va todo lo rápido que el
  ejercicio permite. Los voladores (`src/combat/flight.ts:139-156`) esperan `supHold + 3` s cerca y pican; el siguiente,
  `supHold + 3,5` s después, haga lo que haga el jugador.

### 1.2 Superman: la bola roja no se ve

- La bola sí se pide (al subir el tronco, `floor.ts:254` → `onCharge` → `chargePow = 1`), pero **sale donde no se mira**:
  a 1 m de la cabeza y a `max(0,22; cabeza − 0,12)` m del suelo, en la dirección de la mirada puesta en horizontal
  (`game.ts:1766-1772` y `1845`). Tumbado boca abajo esa dirección es casi vertical: su parte horizontal es ruido, baila y
  puede apuntar hacia los pies, así que la bola queda fuera de la vista o detrás. Es la causa más probable; el diagnóstico no
  guarda dónde está la bola, así que **lo primero es apuntarlo** (ver 3.B) para confirmarlo en las gafas.
- Además, en RepArena la bola del superman **crece con el aguante** (`sorbCharge`, `src/54_suporb.js:95-99`: usa
  `DET.su.k`); aquí `supK` (`floor.ts:78`) existe pero nadie lo usa: la bola se queda en su tamaño más pequeño (6 cm).
- Observación (para preguntar al usuario, no para cambiar): entre 2186 y 2195 s las muñecas están clavadas a 6 cm del suelo
  mientras la cabeza sube a 45–50 cm y las repeticiones cuentan como perfectas. O las gafas dejaron las manos «congeladas»
  o el tronco se subió con las manos apoyadas. El detector solo mira la altura de la cabeza.

### 1.3 El negro del final (vídeos 1 y 3)

- `stepOutcome` (`game.ts:1199-1229`) pone, ya en negro, una esfera opaca centrada en la cabeza cuyo radio debería llegar
  «un poco más allá del resumen»: lo busca como `getSceneEntity('summary-panel')`, que es el panel viejo de UIKit. Desde que
  los menús son los de RepArena (`src/ui/ra/`), ese panel no se ve nunca y **el radio se queda en 0,9 m**.
- Consecuencias, las dos del vídeo: si te apartas del resumen más de 0,9 m, **el menú queda fuera de la esfera y desaparece**
  (o se ve cortado); y todo lo que quede a menos de 0,9 m de la cabeza **se ve**: al agacharte, el suelo (el césped en
  Combate, las tablas en la Travesía) y **el aro turquesa**.
- **El «círculo azul»**: hay dos cosas distintas. El aro turquesa ancho del suelo es del juego: marca dónde se pone el jugador
  (`createPlayerPad`, `src/scene-assets/arena.scene-asset.ts:134-142`) y en el negro no debería verse. La línea azul fina y
  ondulada que cruza el negro **no es del juego**: es el límite de la zona de juego que pintan las propias gafas en el suelo
  (el mismo sistema que la rejilla azul que sale en el vídeo de la Travesía). No se puede quitar desde el juego; hay que
  decírselo al usuario.

### 1.4 El marcador de la Travesía, enterrado (vídeo 2)

- `placeBoard` (`game.ts:657-691`) lo pone como en Combate: a 5 m, a unos 50° a un lado, centro a 2,15 m de alto y 4,2 m de
  ancho, es decir entre 1,7 y 5,9 m de la pasarela. En el risco la pared de roca empieza a 1,15–1,45 m a la izquierda y sube
  5–8 m (`cliffDecoPuts`, `src/modes/trek/plat/pieces.ts:255-268`): el marcador queda dentro. En el bosque hay arbustos desde
  2,5 m, rocas desde 3 m y árboles desde 5 m (`decoPuts`, `pieces.ts:581-595`), que también pasan a través de él.

### 1.5 Travesía en plancha: no se ve salir la bola alta del jefe

- El jefe lanza la alta y la del cuerpo desde su mano, a `BOSS_H × 0,8` de alto (`trek-system.ts:777`), a 3 m. En plancha
  la cabeza mira al suelo: todo lo que nace por encima de la horizontal queda fuera de la vista. El aviso tarda 1,1 s y el
  vuelo 0,55 s (`BOSS_WIND`, `BOSS_FLY`, `types.ts:82`), pensado para agacharse de pie (0,4 s), no para bajar una flexión
  (0,7–0,9 s).
- En plancha solo se adaptó la altura a la que **llegan** la viga, el picado y la bala alta (`runner.ts:351-354`); de dónde
  salen y por dónde vienen sigue siendo como de pie.

### 1.6 Los voladores, a sacudidas

- `Flight.step` (`src/combat/flight.ts:171-181`): cada 0,8–3 s elige al azar un punto nuevo (`dartT`, hasta 2,4 m × lo
  errático: el murciélago, 1,9) y va hacia él con un acercamiento exponencial rápido (`dart.lerp`, 2,2 × lo errático por
  segundo). Resultado: quieto, bandazo de varios metros en un cuarto de segundo, quieto. Es el vuelo de RepArena tal cual
  (lo compara `tests/compare/flight.compare.test.ts`).

### 1.7 De paso (no pedido; apuntado por si el usuario lo quiere)

- En el menú principal el peor fotograma de cada décima es de 36–42 ms (unas 25 imágenes por segundo) y se sube un dibujo a
  la gráfica en cada muestra; en partida, 19–21 ms. Parece la caricatura animada del menú, que repinta su lienzo siempre.
- En el vídeo de la Travesía, la fruta que se coge con la cabeza llena media vista un instante (una pera enorme delante de
  los ojos): la regla de «nada pegado a los ojos» (apagar a menos de 45 cm) no se aplica a las frutas.

## 2. Decisiones del usuario (tomadas al trazar el plan)

1. **Superman: «Aguante que protege»**. El mismo movimiento. Mientras aguantas arriba no te pueden tocar; los bichos solo
   pican si te quedas tumbado descansando más de unos segundos. Aguantar más de lo pedido carga ×2/×3/×4 y, al bajar, una
   onda alcanza a los cercanos. El ritmo lo marca el jugador. El fallo de ritmo de 1.1 se arregla en cualquier caso.
2. **Travesía en plancha, el jefe**: lo que lanza **no sale de su cabeza sino de más abajo**, para que se vea su origen.
3. **Marcador de la Travesía: «lado despejado y más alto»**. En el risco, siempre a la derecha, sobre el vacío. En los demás
   mundos, en el lado elegido pero subido por encima de arbustos y rocas, y los árboles de esa franja se apartan.
4. **Cuestas: «el terreno entero ondula»**. Colinas de verdad: suelo, pasarela y paisaje suben y bajan juntos; cuesta arriba
   cada repetición empuja menos y cuesta abajo más, con más inercia; el horizonte nunca se inclina; un ajuste «Sendero con
   cuestas» las quita.
5. **Avisos**: no se avisa de lo que viene (se entrenan los reflejos, como ya pasa en Arcos). Se mantienen las indicaciones
   de la pelea con el jefe de la Travesía y las que dicen cómo hacer bien el ejercicio. Las que se mantengan, en un panel
   grande y fijo (sobre la compuerta central cuando hay compuertas), no en mensajes que no da tiempo a leer.
6. **Luciérnagas**: al menos 2,5 veces más, en la periferia, sin tapar compuertas, enemigos ni el entorno inmediato; su
   movimiento tiene que hacer sentir el compás de la música.
7. **Vuelo de los voladores**: suave, sin parones ni diagonales rapidísimas; que se puedan seguir con la cabeza.
