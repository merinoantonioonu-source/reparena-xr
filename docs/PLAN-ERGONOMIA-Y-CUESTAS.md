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
8. **Luces giratorias de las compuertas**: hoy son conos; su proyección es irreal. Hay que rehacerlas.
9. **Arcos, el láser vertical**: tiene que moverse a los lados de forma que obligue a esquivar.
10. **Arcos, la pared roja de los arcos inclinados**: rediseñarla (cuatro modelos para elegir, apartado 3.H): que quede muy
    claro el hueco por el que hay que meter el tronco y que la parte tapada sea más realista y menos tosca.
11. **Travesía en plancha**: un plan de ideas de más movimientos de brazos, tipo «animal flow» (apartado 5), para elegir.

## 3. Los bloques, en orden (un PR cada uno)

### 3.A Arreglos rápidos (un PR, primero)

Lo que se nota en las gafas: el negro del final es negro del todo se mueva uno como se mueva, con el resumen siempre a la
vista; el marcador de la Travesía se lee en todos los mundos; los enemigos de los ejercicios de suelo salen a su ritmo.

1. **El negro del final** [O] (`game.ts`, `stepOutcome`). La esfera con radio no puede funcionar: lo cercano siempre queda
   dentro. Hacerlo por lo que se pinta, no por distancia: mientras `black` esté puesto, **esconder todo menos lo que debe
   verse** (el menú abierto, las manos y los guantes, el logro dorado, el aviso del centro) y dejar el fondo negro. Forma
   recomendada: recorrer solo los hijos directos de la escena y de la raíz del nivel, guardar cuáles estaban a la vista,
   ponerles `visible = false` salvo a los marcados (`userData.keepInBlack`, que se pone al crear el grupo de los menús,
   las manos, `trophyP` y los avisos de la vista), y restaurarlos al salir del negro (también si se sale de la VR o empieza
   otra ronda). Sin crear listas cada fotograma (una lista fija que se rellena al entrar en negro; lo que nazca después se
   comprueba con un contador de hijos). El aro turquesa (`createPlayerPad`) queda escondido con lo demás. Quitar la
   búsqueda de `'summary-panel'`. Comprobar que el fundido de antes (`outVeil`) y la vuelta al menú principal siguen igual.
   - Prueba e2e [S]: tras acabar una ronda, con el resumen abierto, mover la cámara 2 m atrás, a un lado y a 30 cm del
     suelo; en las tres capturas, fuera del menú todos los píxeles son negros (tolerancia) y el menú está entero. En Combate
     y en la Travesía.
   - Al usuario: explicarle que la línea azul fina es el límite de las gafas (1.3).
2. **El marcador de la Travesía** [S] (decisión 3). Una función pura nueva (`src/modes/trek/board-spot.ts`:
   `trekBoardSpot(mundo, lado)` → posición, giro y tamaño) que usa `placeBoard` cuando el modo es la Travesía:
   - risco (`cliff`): siempre a la derecha (sobre el vacío), diga lo que diga el ajuste;
   - los demás: en el lado elegido, con el borde de abajo a ≥ 2,0 m (por encima de arbustos y rocas) e inclinado hacia el
     jugador; algo más cerca si hace falta para que se lea;
   - `decoPuts`/`skyDecoPuts`/`coastDecoPuts` reciben el lado del marcador y no ponen árboles, islotes ni barcos en su
     franja (entre 1,5 y 6,5 m de ese lado) por encima de 1,8 m. Sin tocar el otro lado.
   - `placeBoard` se vuelve a llamar al cambiar de mundo (suceso `world`) y al empezar.
   - Pruebas [S]: unitaria de `trekBoardSpot` (los cuatro mundos, los dos lados) y otra que recorre los `Put` de 40 trozos
     de cada mundo y comprueba que ninguna caja (`BOX` de `pieces.ts`) toca el volumen del marcador. Captura por mundo.
3. **El ritmo de los enemigos en los ejercicios de suelo** [S]. Una sola función pura `repTimeOf(ex, ajustes)` (en
   `src/combat/waves.ts` o `src/core/rep-time.ts`) con todos los ejercicios, igual que RepArena (`00_core.js:586`: el
   superman, `supHold + 3`; el inchworm, 8; flexiones, 2,4; plancha con un brazo, 2,2…). La usan `game.ts:890` y
   `src/page/pick.ts:18` (que deja de tener su copia). Comparación con RepArena en `tests/compare/waves.compare.test.ts`.
4. **La fruta en la cara** [S] (si el usuario lo confirma, 1.7): las frutas y los trozos de barril se encogen y se apagan a
   menos de 45 cm de los ojos, como las chispas.

### 3.B Superman: «aguante que protege» (un PR)

Lo que se nota: la bola roja está entre las manos y crece mientras aguantas; mientras aguantas arriba ningún bicho te toca;
solo te pican si te quedas tumbado demasiado rato; aguantar de más carga ×2, ×3, ×4 y al bajar sale el rayo (con ×4, una
onda que alcanza a los cercanos).

1. **Antes de nada, apuntar la bola en el diagnóstico** [S]: `diagEvent` al aparecer («bola: a N cm de la cabeza, a N° de la
   mirada») y al estallar. Así el usuario puede confirmar la causa de 1.2 con un registro si el arreglo no bastara.
2. **Hacia dónde mira el cuerpo, tumbado** [O]. Una función pura (`src/input/body-dir.ts`, con pruebas): de pie, la mirada
   en horizontal (como ahora); cuanto más mira la cabeza hacia abajo, más peso tiene la coronilla (el «arriba» de la
   cabeza, que tumbado boca abajo apunta hacia delante del cuerpo), como ya hace `armsBack` en `floor.ts:219-222`. La usa
   `game.ts:1766-1772` (`bodyYaw`). Pruebas: boca abajo mirando al suelo, al frente y con la barbilla metida, la dirección
   sale siempre hacia las manos; de pie no cambia nada (mismos números que ahora).
3. **Dónde va la bola en el superman** [O] (`game.ts:1843-1845`): entre las dos muñecas si se ven las dos (o junto a la que
   se vea), 6 cm por encima; si no se ve ninguna, a 45 cm de la cabeza en la dirección del cuerpo y a 12 cm del suelo. Y
   **crece con el aguante**: `EnergyBall.update` recibe la carga de 0 a 1 de `fl.supK` mientras se aguanta (como
   `sorbCharge` de RepArena). El rayo sale de la bola.
4. **El detector** [O] (`floor.ts`, `superman`), camino nuevo detrás de `FloorCfg.supGuard` (encendido en el juego;
   apagado en `tests/compare/floor.compare.test.ts`, que sigue comparando el de RepArena):
   - al cumplir `supHold` arriba: la bola llena, chasquido (`topCue`) y carga ×1; **no dispara todavía**;
   - si sigues arriba: ×2 a los `powHold` s, ×3 y ×4 con `powHoldInc` (los ajustes de carga de los demás ejercicios, que hoy
     excluyen al superman en `schema.ts:84-85`);
   - **al bajar**, la repetición con su carga (`rep(perfecta, false, pow)`); con ×4, la onda a los cercanos (la de las
     dominadas y el remo de las reglas: reutilizar lo que ya haya para el inchworm, `HatchSystem.wave`, o `fx`);
   - bajar antes de `supHold`: como ahora («¡Aguanta N s arriba!»).
5. **Los voladores** [O] (`flight.ts`, `FlyEnv.sup`): el reloj de picar deja de ser «lo que lleva esperando cerca» y pasa a
   ser **lo que llevas tumbado sin subir** (`rest`, que la partida pone a 0 cada vez que subes el tronco): solo se lanza si
   `rest > descanso permitido`; mientras estás arriba no se lanza ninguno y el que ya venía rebota (como parado por la
   guardia: `parryT`). El descanso permitido, por rango (de serie 6 s en Recluta a 3,5 s en el más alto), en `RANK_VALS_XR`
   y en la tabla del desarrollador, con su ajuste `xr: true` («Superman: descanso antes de que piquen»). Se mantiene «nunca
   dos seguidos». El camino antiguo, tras el parámetro, para la comparación.
6. **Textos** [S]: `how.ts` (paso 2: «Aguanta arriba: la bola crece. Al bajar, dispara»), `demo-art.ts` (la caricatura),
   `short-msg.ts`, la explicación de los ajustes, `REGLAS.md` («Cargas ×2/×3/×4 aguantando…»: añadir el superman y la
   regla del descanso) y `MIGRACION.md`.
7. **Pruebas** [S, con el guion de Opus]: `tests/unit/exercises.test.ts` (superman: aguante justo = ×1 al bajar; largo = ×4
   y onda; corto = a medias), `tests/unit/flight.test.ts` (arriba no pica nadie; tumbado 2 s, tampoco; tumbado más del
   descanso, sí; uno cada vez) y una simulación de oleada entera: a un ritmo de una repetición cada `supHold + 3` s no se
   recibe ningún golpe en ningún rango.
8. **Preguntar al usuario** [O]: lo de las manos apoyadas (1.2). Si quiere que se exija despegarlas, es otro cambio.

### 3.C El vuelo de los voladores, suave (un PR)

Lo que se nota: los voladores se mueven siempre, en curvas amplias y continuas; se les sigue con la cabeza sin perderlos;
siguen siendo imprevisibles y su mordisco se sigue anunciando igual (se echan atrás y se lanzan).

1. **Vuelo nuevo** [O] (`flight.ts`), de serie; el de RepArena queda tras `classic` solo para `flight.compare.test.ts`:
   - fuera los saltos de objetivo (`dartT` al azar + acercamiento exponencial). En su lugar, un **deambular continuo**: el
     desvío respecto a su sitio es la suma de dos o tres vaivenes de frecuencias que no casan (por eje), con la amplitud que
     hoy da «Vuelo errático» y la distancia, y un objetivo que se desplaza despacio; el volador lo sigue con aceleración
     limitada (nada de cambiar de velocidad de golpe);
   - **límites que mandan** (constantes con nombre, a ajustar en las gafas): velocidad lateral ≤ 1,6 m/s y aceleración
     ≤ 3 m/s² a «Vuelo errático» 100 %; **vista desde tu cabeza, nunca gira más de 40°/s** en crucero; nunca se queda
     quieto más de 0,3 s; se mantiene dentro de ±35° del frente y sin pasar por detrás (lo de `FRONT_MIN`), y los de las
     compuertas siguen saliendo por su hueco (`gateKeep`);
   - el aleteo y la inclinación al virar (`bank`) salen del movimiento nuevo (ya dependen de la velocidad lateral);
   - tumbado (superman, plancha lateral) y en la batalla diminuta, lo mismo a su escala.
2. **Pruebas** [S]: simular 60 s de cada volador a 72 pasos por segundo con «Vuelo errático» 50, 100 y 200 %: la velocidad
   angular vista desde la cabeza, la aceleración y el tiempo quieto no pasan de sus límites; nunca hay «quieto y, en 0,3 s,
   más de 3 m/s»; no se salen del frente. La comparación con RepArena, con `classic`.
3. **Reglas** [S]: en `REGLAS.md` › Enemigos y física, «el vuelo de los voladores, suave: sin parones ni diagonales bruscas;
   se les puede seguir con la cabeza (pedido del usuario)»; `AGENTS.md` (la frase de `Flight`).

### 3.D Lo que se ve desde cada postura (un PR; ver el análisis del apartado 4)

Lo que se nota: en plancha, todo lo que hay que esquivar nace y viene a ras de suelo, donde miras; las indicaciones de antes
de empezar están delante, no a un lado; las instrucciones que se mantienen están en un panel grande y fijo; ya no se avisa
de lo que viene.

1. **El jefe en plancha** [O] (decisión 2; `trek-system.ts:768-784`, `runner.ts:1505-1541`): con `Runner.prone`,
   - lo que lanza **sale de abajo**: de sus pies, a 25–40 cm de las tablas (lo patea, lo lanza a ras o golpea el suelo; con
     la animación que tenga el modelo: no se crean animaciones). El aviso (el brillo que crece mientras coge impulso) se ve
     ahí, en el suelo, no en su mano;
   - los tres tiros se distinguen **vistos desde el suelo**: la alta vuela recta a la altura de la cabeza en plancha con una
     estela encima; la baja rueda y bota por las tablas; la del cuerpo viene por un lado, con su sombra marcando el carril;
   - más tiempo: el impulso pasa de 1,1 s a lo que pida la tabla de gestos de 4.2 para una bajada de flexión (≈ 1,7 s);
   - el jefe mareado (las estrellas) también tiene que verse desde el suelo: estrellas y brillo a sus pies y el aviso en las
     tablas (`VIEW.prone`).
2. **Lo demás que viene de arriba, en plancha** [O]: el mismo principio para el picado (abeja, murciélago: llega rasante
   todo el camino, no bajando desde lo alto), la bala alta del cañón y el tajo del tiburón (su aviso, en las tablas), el
   desprendimiento (la sombra de las rocas crece en el suelo antes de caer), la bola de fuego en arco (su sombra) y los
   barriles y frutas de arriba (que se vean llegar de frente). Regla nueva en `REGLAS.md`: «En plancha, todo lo que hay que
   ver nace y viaja a ras de suelo, por delante de las manos».
3. **Prueba de visibilidad y de tiempos** [S] (apartado 4.2): `src/modes/trek/plat/ergo.ts` (tabla pura) y
   `tests/unit/plat-ergo.test.ts`.
4. **Las indicaciones**: ver el apartado 3.E, que va en este mismo PR o en el siguiente según su tamaño.

### 3.E Las indicaciones: cuáles se quedan y dónde (un PR; el inventario completo, en el apéndice A)

Lo que se nota (decisión 5): ya no saltan mensajes avisando de lo que viene. Lo que te dice cómo hacer bien el ejercicio y
las órdenes de la pelea con el jefe están en **un panel grande y fijo**, siempre en el mismo sitio, donde cae la mirada de
tu postura; se quedan el tiempo suficiente para leerlas. Antes de empezar, la caricatura y las instrucciones están delante.

**Por qué hoy no se leen** (`src/ui/view-panels.ts`, `src/ui/view.ts`, `src/combat/game.ts:456-490`):

- casi todo sale por el «aviso breve» (80 × 14 cm a 1,2 m, uno o dos segundos), que además se aparta 50 cm a un lado cuando
  el marcador o el aviso del centro le estorban;
- antes de empezar, la caricatura va **siempre 70 cm a la derecha** del panel de calibración (`view-panels.ts:276`): el
  conjunto queda descentrado unos 16°; y si no hay carátula (la Travesía sin cortinilla cargada), el panel se ancla **hacia
  donde estaba el menú** al pulsar EMPEZAR y no te sigue hasta que giras más de 50° (`view.ts:137,167`). Por eso en la
  Travesía quedan a la derecha;
- varias frases de la Travesía piden cosas de pie estando en plancha («sentadilla honda», «brazos en cruz», «¡De pie!»).

**Qué pasa con cada clase de indicación** (las clases del apéndice A):

| Clase | Ejemplos | Qué se hace |
| --- | --- | --- |
| A. Anuncia lo que viene | «¡Un hueco! Salta al llegar al borde», «¡Una seta!…», «¡Cañonazo…!», «¡ARCO DE PLANCHA!…» | **Se quita** en todos los modos (se entrenan los reflejos). Lo que viene tiene que entenderse por su forma, su sonido y su aviso propio en la escena (el cangrejo que se encabrita, el fogonazo del cañón, la huella de la mano en el suelo). Excepciones propuestas, a confirmar: ver el apartado 6 |
| B. Corrige la forma | «¡Baja más!», «¡Rodilla más abajo!», «Estira los brazos», «Sube hasta el hombro» | **Se queda, en el panel de indicaciones** (no en el aviso breve): visible al menos 4 s o hasta que la siguiente repetición salga bien. De pie, además, sigue en el suelo como ahora (regla del usuario) |
| C. Lo que hiciste mal ante un reto | «¡Te ha mordido! Sáltale encima a la seta», «¡Apártate del láser, a la derecha!» | **Se queda**, corta, en el panel: sin avisos previos es la única forma de aprender qué pedía ese reto. (Si el usuario tampoco las quiere, se quitan con un solo interruptor) |
| D. La pelea con el jefe | «¡Alta! Agáchate», «¡Está mareado!…» | **Se queda**, en grande, en el panel (en plancha, en las tablas) y con el texto de **esa forma**: en plancha, «¡Mareado! Dos explosivas», no «sentadilla honda» |
| E. Estado | «OLEADA 2», «Aguanta 1», «Carga ×2», «¡Cambia de pierna!», calibración, «¡PREPÁRATE!» | Como ahora (marcador, panel entre oleadas, centro). Las cuentas («Aguanta N») y el cambio de pierna, al panel de indicaciones |
| F. Celebraciones | «¡PERFECTA!», «¡Hueco saltado!», logros dorados | Como ahora: al marcador; los logros, en dorado |

**El panel de indicaciones** [O el sitio y el pintado; S el reparto de textos]:

- Un lienzo más (`infoPanel`, como los de `src/ui/info-draw.ts`: se repinta solo si cambia el texto, con `fitFont`), con
  **dos renglones**: arriba, fijo y tenue, lo que hay que hacer en ese ejercicio (`IDLE[ex]` de `how.ts`: «Baja en
  sentadilla para cargar»); abajo, grande y de color, la corrección o la orden del momento (B, C, D y las cuentas).
- **Dónde**, según la postura (apartado 4.1); una función pura `guideSpot(modo, ejercicio, postura, marcador)` con su prueba:
  - **de pie con compuertas** (Combate, Toques, Arcos): encima de la compuerta central, grande (unos 6 × 1,4 m, a 11 m y
    por encima de la baliza), inclinado hacia el jugador. Si el marcador está puesto en «Compuertas», el panel va pegado a
    su borde (encima o debajo: capturas al usuario). No tapa lo que sale de las compuertas;
  - **en el suelo y en plancha** (flexiones, plancha con un brazo, inchworm, superman, fondos): no se ve la compuerta. Va en
    el suelo, por delante de las manos: en la batalla diminuta, como una franja del atril del marcador; en el superman,
    plano en el suelo a un metro; en la plancha lateral, de pie a un lado, hacia donde mira la cara;
  - **boca arriba** (abdominales de Toques): en el techo, como los avisos de ahora;
  - **Travesía de pie y en zancada**: no hay compuertas: un letrero fijo sobre el sendero, alto y lejos (a unos 9 m, por
    encima de lo que viene); en la pelea, encima del jefe;
  - **Travesía en plancha**: en las tablas, por delante (lo que ya hace `VIEW.prone`), más grande.
- El aviso breve de la vista deja de usarse para B, C y D. Queda para lo que no tiene sitio mejor (se revisa en el reparto);
  el ajuste «Avisos breves en la vista» sigue mandando lo suyo al marcador.
- Nada de esto tapa el menú (regla: con un menú abierto, nada lo tapa) ni lo que viene.

**Antes de empezar** [O] (`view-panels.ts:270-279`, `view.ts`): el panel del centro y la caricatura, **centrados como
conjunto** y anclados **al frente de la partida** (hacia las compuertas o el sendero, donde se va a jugar), no hacia donde
estaba el menú; se recolocan al acabar el giro de la calibración (`recenter`). En plancha y tumbado, en el suelo. Prueba
pura en `tests/unit/view.test.ts` y capturas de la Travesía (con y sin cortinilla), Combate de pie y flexiones.

**Los textos según la forma** [S]: una tabla en `runner.ts` (o `src/modes/trek/plat/texts.ts`) con cada frase de las clases
C y D en sus tres versiones (de pie, plancha, zancada); prueba que recorre todas y comprueba que en plancha ninguna dice
«sentadilla», «brazos en cruz», «de pie» ni «paso». Y `short-msg.ts` al día.

**Reparto** [S, con la lista de Opus]: cada `say`, `message(..., true)`, `HOOKS.say`/`toast` del apéndice A pasa a su
destino nuevo; las de la clase A se quitan en su origen (en `ask()` de `runner.ts:1428-1453` y compañía, tras un parámetro
para poder volver atrás si el usuario lo pide). Los detectores no cambian sus frases (las compara `tests/compare`): el
cambio es de canal, en `game.ts`. `tests/e2e`: en una ronda entera de cada modo no sale ningún texto de la clase A.

**Reglas** [S]: `REGLAS.md` › Paneles y avisos: «No se avisa de lo que viene…», «El panel de indicaciones…» y la corrección
de las reglas viejas que chocan (ver el apartado 6).

### 3.F Travesía con cuestas (dos PR: F1 la lógica con el bosque y el risco; F2 las islas y la costa)

Lo que se nota (decisión 4): el sendero sube y baja con el terreno. Cuesta arriba cada repetición te lleva menos lejos:
hay que hacerlas más seguidas o más hondas para no perder ritmo. Cuesta abajo cada una te lleva más lejos y la inercia
dura más. El horizonte no se inclina nunca y la plataforma bajo los pies sigue quieta: es el mundo el que sube y baja
despacio, como ya hace en los saltos y en las plataformas altas.

1. **El perfil** [O], lógica pura nueva `src/modes/trek/plat/grade.ts`:
   - `buildGrade(curso, mundo, rango, azar)` → una lista de rampas suaves (sin esquinas: la pendiente empieza y acaba en
     cero) y `heightAt(s)`, `slopeAt(s)`; determinista con la semilla del tramo (el fantasma y las pruebas la repiten);
   - **llano obligatorio** en: los primeros 12 m, el cofre y su frenada, la pelea con el jefe, el portal, el trampolín y la
     bifurcación; un hueco o un barranco empieza y acaba a la misma altura o **más abajo** al otro lado (planear cuesta
     abajo queda bien), nunca más arriba;
   - pendiente máxima por mundo y por rango (ajuste nuevo `platHill`, `xr: true`, en `RANK_VALS_XR` y en la tabla del
     desarrollador): bosque, colinas suaves (hasta un 6–8 %); **risco, lo escarpado** (hasta un 12–14 %, con subidas largas
     y una bajada antes del cofre); islas, cada islote a su altura (escalones entre islotes de hasta 35 cm hacia arriba, que
     se salvan con el salto de siempre, y más hacia abajo) y poca pendiente dentro; costa, el mar no puede inclinarse: solo
     **rampas del muelle** que suben a tramos elevados sobre postes más largos y vuelven a bajar (hasta un 6 %);
   - **equilibrado**: en cada tramo, lo que se pierde subiendo se recupera bajando (el tiempo del tramo a ritmo constante
     no cambia más de un 5 % respecto al llano): las rondas no se alargan.
2. **El esfuerzo** [O], en `Runner` (sin tocar `path.ts`): al avance que da el impulso se le aplica `gradeK(pendiente)`:
   cuesta arriba, de 1 a 0,65 en la pendiente máxima; cuesta abajo, de 1 a 1,25; y cuesta abajo la inercia se apaga un 30 %
   más despacio. **Sin repeticiones te sigues parando**, también cuesta abajo (regla del usuario). En las formas con
   «Avance solo» (plancha suave, zancada estática) el avance automático también nota la cuesta. El turbo, la racha y los
   puntos, igual. Los números, constantes con nombre para ajustarlos con el usuario.
   - Las separaciones mínimas entre retos (`minGap`) se calculan con la velocidad que puede haber **en ese punto** (cuesta
     abajo, hasta un 25 % más): `plat-course.test.ts` lo comprueba.
3. **Lo que se pinta** [O] (`trek-system.ts`, `pieces.ts`): todo lo que va sobre el sendero (suelo, piezas, enemigos,
   frutas, paisaje, sombras, el fantasma) recibe `heightAt(su sitio) − heightAt(donde estás)`, sumado a lo que ya hay
   (`dip`, `lev`, `islandY`); las piezas del suelo, además, cabecean con la pendiente (`rx`) para que no haya escalones (ni
   uno de más de 3 cm entre dos trozos seguidos). El césped del bosque deja de ser un plano: ondula con el mismo perfil (en
   su sombreador, con el perfil en una textura de datos o como malla en tira). El mar de nubes y el mar se quedan a su
   altura absoluta (se ven más abajo cuanto más subes). El fondo realista, quieto. Con `LITE.on`, como ahora.
4. **Avisos**: ninguno que anuncie la cuesta (decisión 5: se ve venir). Solo si el ritmo cae cuesta arriba, la corrección
   de siempre («¡Baja más!»).
5. **El ajuste** [S]: «Sendero con cuestas» (Sí/No, `xr: true`, de serie Sí; en Ajustes junto a «Sendero con curvas»), con
   su explicación; apagado, todo como hoy (la prueba lo comprueba: mismos números que antes del PR).
6. **Pruebas** [S, con los guiones de Opus]: `grade.test.ts` (continuidad, llanos obligatorios, máximos por mundo y rango,
   equilibrio, misma semilla = mismo perfil); `plat-runner.test.ts` con `plat-sim.ts` (el mismo guion de repeticiones
   avanza menos cuesta arriba y más cuesta abajo; sin repeticiones se para también bajando); `plat-pieces.test.ts` (sin
   escalones; los postes llegan al suelo); e2e con capturas de una subida y una bajada en cada mundo, de pie y en plancha.
7. **Reglas y documentos** [S]: `REGLAS.md` (la Travesía con cuestas, con lo decidido), `PLAN-TRAVESIA-PLATAFORMAS.md`,
   `AGENTS.md`, `MIGRACION.md`.
8. Antes de fusionar F1, **capturas al usuario** de cómo queda una subida fuerte del risco y una colina del bosque [O].

### 3.G Luciérnagas y luces de las compuertas (un PR)

**Luciérnagas** (`src/env/env-system.ts:24-104`, `src/core/beat.ts:97-134`) [O el sombreador; S las pruebas y las reglas]

Hoy: 180, repartidas en un anillo completo de 1,3 a 13,3 m y de 0,25 a 3,25 m de alto; solo se apartan de una esfera de
0,8 m alrededor de la cabeza; se apagan pasados 7 m; al compás, un vaivén de 22 cm (que de lejos no se nota) y un destello.

- **Cuántas**: 480 (2,7 veces más). Las 180 primeras no cambian de semilla (para no mover las de siempre) pero sí de sitio
  si caen en zona vedada.
- **Dónde**: en la periferia. Nada a menos de 4,5 m del jugador (el «entorno inmediato»); nada en el **pasillo de juego**:
  el sector del frente por donde salen y vienen los enemigos (±35°, hasta las compuertas, a 11 m) por debajo de 4,5 m de
  alto, ni delante de las tres compuertas. Sí por encima de ese pasillo, a los lados, detrás del jugador y más allá de las
  compuertas, de 6 a 20 m y de 0,3 a 7 m de alto. En la Travesía y en Arcos, el pasillo vedado es el del sendero o la pista.
  La zona vedada, en una función pura (`moteAllowed(x, y, z, modo)`) con su prueba.
- **Que se vean de lejos**: se apagan entre 20 y 26 m (no a 7), con un tamaño mínimo en pantalla.
- **El compás, que se sienta** (lo importante del encargo): el movimiento al compás tiene que leerse desde lejos y **en
  conjunto**, no luciérnaga a luciérnaga:
  - el vaivén al compás crece con la distancia (de 22 cm a unos 60–80 cm a 15 m: el mismo ángulo visto desde el jugador);
  - se mueven **por grupos** (por sectores del anillo): cada sector se columpia a la vez, con los vecinos en contrafase,
    de modo que el anillo entero «respira» con cada pulso;
  - en el primer pulso de cada compás, una **ola de luz** recorre el anillo (un destello que da la vuelta en un compás);
  - el destello de cada pulso, más marcado; a medio tiempo si la canción pasa de 135 pulsos por minuto (como ahora);
  - sin música ni ritmo marcado, el vuelo sereno de siempre (regla del usuario: sin sacudidas ni retrocesos).
- Los momentos especiales (fiebre, relámpago, turbo, supervelocidad), como ahora.
- Rendimiento: son puntos en la gráfica; comprobar en las gafas que no baja de 72 imágenes por segundo (si baja, menos
  halo, no menos luciérnagas). Capturas: desde el centro, con las tres compuertas a la vista, ninguna luciérnaga delante.
- `REGLAS.md`: «Luciérnagas: 480, en la periferia…» (sustituye a «el doble que en RepArena (180)»).

**Luces giratorias de las compuertas** (`src/scene-assets/gate.scene-asset.ts:138-155`, `src/combat/gates.ts:207-210`) [O,
con la habilidad `iwsdk-build-model`: es un objeto de escena]

Hoy: dos conos huecos de 12 caras (4 m de largo, 70 cm de radio), aditivos, girando a 6 rad/s; no iluminan nada.

- **El haz**, sin geometría de cono a la vista: un haz volumétrico de bordes blandos (brillante en el eje y desvanecido
  hacia fuera y con la distancia, con algo de polvo en suspensión), que se vea bien desde cualquier ángulo (no se le ven
  caras ni la «boca» del cono).
- **Lo que proyecta** (lo irreal de hoy es que no proyecta nada): una mancha de luz roja alargada que **barre el suelo**
  delante de la compuerta en sincronía con el giro, y un barrido tenue sobre el marco de la propia compuerta. Fingido (una
  calcomanía aditiva que gira), no una luz de verdad: las gafas no llegan.
- **El destello de la lámpara**: cuando el haz pasa apuntando al jugador, la lámpara deslumbra un instante (lo que hace
  reconocible una sirena). Si es un `Sprite`, sin rayo (`spriteRayFix` ya lo cubre).
- Giro algo más lento (unas 0,7 vueltas por segundo) para que el barrido se lea.
- No tapa lo que sale de la compuerta; sin contorno de tinta. Capturas de noche y de día, con la compuerta abierta y
  cerrada. Antes de darlo por bueno, **dos o tres capturas al usuario**.

### 3.H Arcos: el láser y la pared de los inclinados (un PR, tras elegir el usuario el modelo)

**El láser vertical** (`src/modes/arcs/obstacles.ts:118-133, 166-171`) [O]

Hoy el láser sí barre de lado, pero **se queda quieto los últimos 1,3–1,6 s** (regla anterior del usuario: «quieto en su
sitio el último segundo y medio») y se para en un punto al azar a entre 5 y 35 cm del centro; como solo da si pasa a menos
de 28 cm de la cabeza, **muchas veces se para donde no molesta** y basta con no moverse. Eso es lo que el usuario ve como
«no se mueven y no obligan a esquivar nada».

- **Siempre amenaza**: el punto donde acaba se elige respecto a **donde está tu cabeza** cuando empieza a frenarse (a menos
  de 12 cm de ella, dentro del carril), no respecto al centro: quedarse quieto ya no vale nunca.
- **Sigue moviéndose**: en el último tramo ya no se clava: frena hasta un vaivén corto y lento (unos ±10 cm) alrededor de
  ese punto y solo se queda quieto del todo los últimos 0,6 s. La velocidad de lado sigue sin pasar de 2,5 m/s.
- Cambia una regla de `REGLAS.md` (Arcos: «…quieto en su sitio el último segundo y medio»): reescribirla con lo nuevo.
- Pruebas [S]: en mil láseres simulados con un jugador quieto en cualquier punto del carril, todos le dan; con un paso de
  40 cm al lado bueno en el último segundo, ninguno.

**La pared del lado bajo de los arcos inclinados** (`src/modes/arcs/arcs-system.ts:288-300`) [O]

Hoy: un cuadrilátero rojo liso casi opaco (0,9) del lado bajo hasta pasado el centro, con un canto verde. (Las paredes con
franjas son las de los obstáculos con hueco, `arc-extras.scene-asset.ts:88-103`.) El usuario lo ve tosco. **Cuatro modelos
para elegir**; en todos, el hueco bueno queda marcado en verde (el canto, un marco de luz y, en el suelo, la huella
iluminada de dónde poner el cuerpo) y la parte tapada se ve claramente infranqueable:

1. **Reja de láseres**: en vez de una pared, barrotes finos de luz roja que cuelgan de la barra hasta el suelo cada 12 cm,
   con sus emisores arriba y abajo y un temblor leve; entre barrotes se ve el fondo. Es el mismo lenguaje que la barra y el
   láser vertical: lo más coherente con «láseres».
2. **Campo de fuerza**: una lámina de energía translúcida con panal de hexágonos, el borde encendido y una onda que la
   recorre; más densa junto a la barra y deshecha en chispas cerca del suelo. Al acercarte, se intensifica.
3. **Cortina de plasma**: energía roja y naranja que cae de la barra como una cascada (humo de luz con relieve y movimiento,
   como los proyectiles realistas), con salpicaduras en el suelo.
4. **Compuerta blindada**: algo físico: una persiana de acero de cómic que baja de la barra, con franjas de peligro
   pintadas, remaches y pilotos rojos; sólida de verdad, con su luz y su tinta.

- Opus prepara **una captura de cada modelo en el juego** (en Cómic, desde los ojos del jugador a 6 m y a 2 m, inclinado a
  un lado y al otro) y el usuario elige. No se fusiona nada de esto sin su elección.
- Preguntarle también si el modelo elegido se aplica a las paredes de los obstáculos con hueco (hoy, franjas rojas).
- Al elegir, cambiar la regla de `REGLAS.md` («Arcos: las paredes… rojas casi opacas con franjas…»).
- Sin lienzos repintados cada fotograma, materiales creados al empezar y calentados en `warmKeep`.

## 4. Los ejercicios y el movimiento natural del cuerpo (análisis)

La idea que ordena todo: **cada postura tiene su mirada natural y su tempo natural**, y el juego tiene que pedir las cosas
donde esa mirada cae y con el tiempo que ese cuerpo necesita. Pedir levantar el cuello en plancha, o un gesto más rápido de
lo que el cuerpo da, es pelearse con el ejercicio.

### 4.1 Dónde mira el cuerpo en cada postura

| Postura | Mirada natural (cuello neutro) | Lo que se ve bien | Lo que NO se ve |
| --- | --- | --- | --- |
| De pie (sentadilla, curl, saltos) | Al frente, algo por debajo de la horizontal | Del suelo a 2 m hasta unos 20° por encima de los ojos; ±45° a los lados | Lo que está a los lados a más de 50°; lo alto y cerca |
| En zancada | Al frente; el tronco erguido y la cabeza quieta (equilibrio) | Lo mismo que de pie | Igual; y girar la cabeza descoloca |
| En plancha y flexión | Al suelo, 30–60 cm por delante de las manos (la cabeza mira 50–75° hacia abajo) | El suelo desde las manos hasta unos 2,5 m por delante; lo que venga a menos de un palmo sobre las tablas | Todo lo que esté por encima de la horizontal de los ojos: un jefe de pie, algo que cae, un barco a un lado |
| Tumbado boca abajo (superman) | Al suelo, o al frente si se levanta el cuello (no recomendable aguantarlo) | Las manos y el suelo por delante | Lo que vuela a la altura de la cabeza a más de 1 m, si se mira al suelo |
| Tumbado boca arriba (abdominales, Toques) | Al techo | Lo que está encima | El suelo, las compuertas, el marcador de lado |
| Colgado (Barras) | Al frente o algo arriba | Lo de delante | Lo de abajo |

Consecuencias que ya están en este plan: la bola del superman entre las manos (3.B); en plancha, todo a ras de suelo (3.D);
el panel de instrucciones donde cae la mirada de cada postura (3.E).

### 4.2 Cuánto tarda cada gesto (y lo que el juego debe dar)

Tiempos de un adulto entrenando, sin prisa de competición. **El juego debe dar, desde que algo se puede ver hasta que se
juzga, al menos el tiempo del gesto × 1,5 más 0,4 s de reacción**, a la velocidad máxima de esa forma (con el acelerón y la
cuesta abajo incluidos).

| Forma | Gesto | Tarda (s) |
| --- | --- | --- |
| De pie | Agacharse (un cuarto de sentadilla) | 0,4 |
| De pie | Sentadilla honda | 0,9 |
| De pie | Saltar (con su impulso) | 0,45 |
| De pie | Paso a un lado | 0,5 |
| De pie | Brazos en cruz | 0,5 |
| De pie | Supersalto (honda y salto) | 1,3 |
| Plancha | Bajar la flexión | 0,8 |
| Plancha | Flexión explosiva desde arriba (bajar y empujar) | 1,2 |
| Plancha | Dos explosivas seguidas | 2,6 |
| Plancha | Escorarse a un lado | 0,6 |
| Plancha | Peso adelante | 0,5 |
| Zancada | Bajar | 0,9 |
| Zancada | Inclinar el tronco a un lado | 0,6 |
| Zancada | Salto corto con una pierna delante (y volver a estar estable) | 0,7 (+0,8 para estabilizarse) |
| Zancada | Cambiar de pierna | 2,0 |
| Superman | Subir, aguantar y bajar | `supHold` + 3 |

Lo que hay que hacer con esto [O decide, S escribe la tabla y la prueba]:

- `src/modes/trek/plat/ergo.ts`: la tabla (`GESTURE_T[forma][gesto]`) y, para cada tipo de pieza, qué gesto pide en cada
  forma. `tests/unit/plat-ergo.test.ts`: para cada pieza y forma, el tiempo entre que se ve y que se juzga cumple la regla
  de arriba en todos los rangos; y dos retos seguidos dejan sitio para **acabar el primero y volver a la postura**.
- Lo que previsiblemente saldrá mal y hay que corregir en `course.ts`/`platTune` (comprobarlo, no darlo por hecho):
  - en plancha, lo que pide **dos explosivas** (plataforma alta, trampolín, jefe mareado) necesita mucho más aviso que de
    pie, y nada más pegado detrás;
  - en plancha, nada que pida **bajar y escorarse a la vez** salvo que sea a propósito (ver 5, la flexión arquera);
  - en zancada, **nada que esquivar durante el cambio de pierna** (2,5 s de tregua desde el aviso) ni dos saltos seguidos a
    menos de 1,5 s; inclinar el tronco y bajar a la vez, tampoco;
  - el jefe: el impulso de cada tiro, según la forma (de pie 1,1 s; en plancha ≈ 1,7 s; en zancada ≈ 1,4 s).
- Lo de 3.D.3: para cada pieza y forma, lo que hay que ver (o su aviso en el suelo) cae dentro de la mirada de 4.1 cuando
  aparece. En plancha: nada que haya que ver a más de 5° por encima de la horizontal de los ojos.

### 4.3 El resto de ejercicios (Combate, Toques, Barras)

[S] hace el inventario con la misma plantilla para cada ejercicio de `PLAY_EX` (`docs/ERGONOMIA.md`): postura, mirada,
tempo, dónde salen la bola, los enemigos, el marcador y los avisos, y qué choca con 4.1 y 4.2. [O] lo revisa y **propone al
usuario** los cambios que salgan (no se cambia nada de eso sin él). Sospechas que hay que mirar primero: la plancha lateral
(se mira de lado: ¿dónde vienen los bichos?), los fondos en silla (se mira al frente y arriba), y los abdominales de Toques
(boca arriba: los avisos, en el techo).

## 5. Travesía en plancha: más movimientos de brazos (ideas para elegir)

Hoy la plancha tiene: bajar (agacharse), aguantar abajo (túnel, barranco), escorarse (apartarse), explosiva (saltar), dos
explosivas (supersalto) y peso adelante (acelerón). Todo son flexiones y pequeños balanceos. Ideas inspiradas en el «animal
flow», ordenadas por lo fiable que es detectarlas: **las gafas ven muy bien la cabeza y solo a ratos las manos** (en plancha
las pierden a menudo: lo enseñó la plancha con un brazo), así que lo que depende de la cabeza es seguro y lo que depende de
ver una mano necesita un plan B.

| # | Movimiento | Qué trabaja | Para qué serviría en el juego | Cómo se detecta | Fiabilidad |
| --- | --- | --- | --- | --- | --- |
| 1 | **Paso lateral en plancha** (caminar con manos y pies a un lado) | Hombros, core | **Cambiar de carril**: la pasarela con dos carriles; un derrumbe o un enemigo ocupa el tuyo y hay que pasarse al otro (más que escorarse: te vas de verdad) | La cabeza se desplaza 30 cm o más a un lado **y se queda** (escorarse es menos y vuelve) | Alta |
| 2 | **Flexión arquera** (bajar cargando el peso en un brazo) | Pecho y tríceps de un lado | Pasar bajo una **viga inclinada**: baja de un lado, alta del otro | Cabeza abajo y a un lado a la vez | Alta |
| 3 | **La ola** (de la pica a la cobra: caderas arriba, zambullirse y salir, como la flexión hindú) | Hombros, pecho, espalda | Pasar **por debajo de una valla baja** y salir al otro lado; o coger carrerilla para un salto largo | La cabeza va atrás y arriba, luego adelante y abajo, luego adelante y arriba, en ese orden | Media-alta |
| 4 | **Giro abierto** (de la plancha a la plancha lateral, abriendo el pecho con un brazo al cielo) | Oblicuos, hombro de apoyo | Dejar pasar algo que viene **por el centro a ras de suelo** (te pones de canto); abrir una palanca alta | La cabeza se ladea más de 40° y se mantiene un instante (ya se detecta en la plancha lateral) | Media-alta |
| 5 | **Caminar con las manos hacia delante y volver** (como el inchworm) | Hombros, abdomen | Alcanzar una **fila de frutas lejana** o cruzar un tramo «de puntillas» | La cabeza avanza 30 cm o más y vuelve (más que el peso adelante de ahora) | Alta |
| 6 | **Zarpazo**: levantar una mano y alcanzar algo delante o a un lado | Hombro de apoyo, core (antirrotación) | **Coger con la mano** una fruta o una llave a ras de suelo; apartar una telaraña | La mano se ve y llega al objeto; plan B: si la mano no se ve, vale inclinar la cabeza hacia él | Media |
| 7 | **Palmada al suelo** en un botón a un lado | Hombros, core | **Botones en las tablas** que abren una compuerta o bajan un puente: hay que darles de camino | La mano se levanta y baja deprisa sobre el botón; plan B: la sacudida de la cabeza al golpear | Media |
| 8 | **Trepar** (alternar las manos hacia delante, como el oso) | Hombros, pecho, core | En las **cuestas muy empinadas** (3.F): en vez de flexiones, se sube trepando, mano a mano | Las manos avanzan alternándose; plan B: el vaivén corto de la cabeza a un lado y a otro, a ritmo | Media-baja |
| 9 | **Manos juntas / manos anchas** (flexión diamante y ancha) | Tríceps / pecho | La pasarela **se estrecha** (manos juntas) o tiene un agujero en el centro (manos anchas) | La distancia entre las dos muñecas; solo se juzga si se ven las dos (si no, se da por buena) | Media-baja |
| 10 | **Remar** (subir un codo, alternando) | Espalda, core | Una **balsa** en la costa pirata: cada remada empuja | La mano que rema se va hacia la cadera y las gafas la pierden; solo queda el giro de la cabeza | Baja (no recomendada) |

Recomendación: empezar por **1, 2, 3 y 5** (solo dependen de la cabeza: saldrán bien a la primera) y **4**; luego **6 y 7**
con su plan B; dejar 8 y 9 para después de probar las manos en plancha con la caja negra; descartar la 10.

Cómo se haría (cuando el usuario elija) [O la lógica, S las pruebas]:

- Cada movimiento es un gesto nuevo de `BodyMoves.prone` (`src/modes/trek/plat/moves.ts`) y **una pieza nueva** del
  recorrido (`types.ts`, `course.ts`, `pieces.ts` con modelos de los kits que ya hay: nada creado de cero), con su tiempo
  en la tabla de 4.2 y su prueba de guion (`plat-runner.test.ts` con `plat-sim.ts`).
- Solo salen en plancha (`CourseEnv` ya sabe saltarse piezas por forma: `skip`); en la forma suave siguen siendo esquivas y
  premios; en la dura, además, cuentan como repetición que empuja.
- Para los que usan las manos: ampliar la caja negra (`src/core/blackbox.ts`) a la Travesía en plancha y pedir al usuario
  una grabación antes de ajustar umbrales (como se hizo con los curls).
- Fallar cualquiera de ellos, como todo en la Travesía: frenas a la mitad y se rompe la racha, sin vidas; los que son
  premio (frutas, llaves), no frenan.
- Sin aviso de lo que viene (decisión 5): cada pieza tiene que **explicarse sola por su forma** (dos carriles con uno
  roto, una viga claramente inclinada, un botón que brilla). La primera vez que sale cada una en la vida del jugador, sí se
  enseña cómo se hace (ver 3.E, «la primera vez»).

## 6. Lo que queda por decidir (Opus se lo pregunta al usuario, con propuestas, antes del bloque que toque)

1. **Avisos de lo que viene, ¿alguna excepción?** (antes de 3.E). La decisión es quitarlos todos. Tres casos chocan con
   reglas anteriores del propio usuario y hay que confirmarlos:
   - Arcos: «el arco de plancha… con un aviso grande delante» y el semipuente «con aviso grande y la huella de la mano en el
     suelo». Propuesta: quitar el texto y dejar la bocina, la huella de la mano y la velocidad más lenta.
   - Los cofres: «dicen al aparecer qué hay dentro». Propuesta: no es un reflejo, es información: pasa al marcador.
   - El lanzador de Combate («¡Te lanza piedras!…»). Propuesta: se quita; ya avisa con su gesto y su voz.
   - Y una idea para quien juega por primera vez: enseñar cada reto **solo las dos primeras veces en la vida del jugador**
     (se guarda en `reparenaxr-*`), en el panel. Si el usuario dice que no, no se enseña nunca.
2. **Las frases de «lo que hiciste mal ante un reto»** (clase C): el plan las mantiene. Confirmarlo.
3. **Superman, las manos apoyadas** (1.2): ¿se exige despegarlas del suelo cuando las gafas las ven?
4. **La pared de los arcos inclinados** (3.H): elegir entre los cuatro modelos con las capturas; ¿también para las paredes
   de los obstáculos con hueco?
5. **Movimientos de brazos en plancha** (5): cuáles se hacen.
6. **Lo apuntado de paso** (1.7): la fruta en la cara y la fluidez del menú principal.
7. **El resto de ejercicios** (4.3): lo que salga del inventario.

## 7. Orden y tamaño

| Orden | Bloque | Tamaño | Depende de |
| --- | --- | --- | --- |
| 1 | 3.A Arreglos rápidos | Pequeño | — |
| 2 | 3.B Superman | Mediano | 3.A (el ritmo) |
| 3 | 3.C Vuelo suave | Mediano | — |
| 4 | 3.E Indicaciones y panel | Grande | pregunta 1 y 2 |
| 5 | 3.D Lo que se ve en plancha | Mediano | 3.E (dónde van los avisos en plancha) |
| 6 | 3.G Luciérnagas y luces | Mediano | — |
| 7 | 3.H Arcos | Mediano | pregunta 4 (las capturas se pueden preparar antes) |
| 8 | 3.F Cuestas (F1 y F2) | Muy grande | 3.D (la tabla de tiempos) |
| 9 | 5 Brazos en plancha | Grande, por entregas | pregunta 5; 3.F para «trepar» |

Tras cada PR publicado, decirle al usuario qué probar en las gafas y pedirle el diagnóstico si algo no va (las reglas de
`AGENTS.md` › Diagnóstico). Las capturas de 3.H y las preguntas del apartado 6 se le pueden mandar desde el primer día,
mientras se hacen 3.A–3.C.

## Apéndice A. Las indicaciones que salen hoy, por modo, y su destino

Canal de hoy: **breve** = el aviso pequeño de la vista; **suelo** = impreso en el suelo; **marcador**; **centro**;
**dorado** = el logro grande. Destino: **Fuera** (se quita), **Panel** (el panel de indicaciones de 3.E), **Igual**.
Los textos entre paréntesis son la versión corta que se enseña (`src/ui/short-msg.ts`).

### A.1 Travesía de plataformas (`src/modes/trek/plat/runner.ts`)

**Anuncian lo que viene (clase A): todas Fuera.** Salen por el breve, en amarillo:
«¡Un hueco! Salta al llegar al borde» · «¡Plataforma alta! Sentadilla honda y salta» · «¡Arriba y salta a la plataforma!» ·
«¡Túnel! Al suelo, en plancha» · «¡Un trampolín! Písalo con una sentadilla honda» · «¡El camino se divide! Paso a la
derecha: más difícil y más premios» · «¡Un barranco! Abre los brazos en cruz para planear» · «¡Un barril sorpresa! Salta
debajo y dale con la cabeza» · «¡Una fruta dorada! Salta para cogerla» · «¡Fruta (especial) a la izquierda/derecha!» ·
«¡Salta!» (tronco) · «¡Agáchate!» (viga) · «¡Un esqueleto pirata a la X! Apártate a la Y» · «¡Un cangrejo a la X! Apártate a
la Y» · «¡Una seta! Sáltale encima cuando llegue» · «¡Un tiburón pirata! Agáchate cuando tire el tajo» · «¡Un murciélago /
Una abeja en picado! Agáchate» · «¡Cañonazo desde el barco, a la X!» · «¡Una calavera botando! Sáltala» · «¡Un cíclope a la
X! Va a golpear el suelo: salta su onda» · «¡Un demonio a la X! Esquiva su bola de fuego con un paso» · «¡Cornisa! Pégate a
la pared, a la izquierda» · «¡Islote que sube y baja! Salta cuando esté a ras» · «¡Islote que se hunde! Crúzalo sin
pararte» · «¡Viento! Inclínate a la X y aguanta» · «¡Desprendimiento a la X! Apártate a la Y» · «¡El cangrejo escupe!
Aparta la cabeza» · «¡Salta la onda!» · «¡Bola de fuego! Un paso a un lado» · «¡Bala baja! Sáltala» / «¡Bala alta!
Agáchate» · «¡De pie!» (al salir del túnel) (`runner.ts:1428-1453`, `585`, `629`, `637`, `867`, `961`).
«Al final del tramo, un cofre: dentro, una llave… y una gema» (`runner.ts:561`): al marcador (pregunta 1).

**Lo que hiciste mal (clase C): al Panel**, con el texto de la forma. Hoy, breve y suelo (en plancha, solo breve):
«¡Te ha escupido! Aparta la cabeza» · «¡Te has quemado! Un paso a un lado cuando la lance» · «¡Salta al islote cuando esté a
ras!» · «¡Que se hunde! No te pares» · «¡Pégate a la pared!» · «¡Inclínate contra el viento, a la X!» · «¡Cabeza abajo en el
túnel!» · «¡Te ha dado la bala! Salta la que rueda / Agáchate con la alta» · «¡Te ha dado con la espada! Agáchate» · «¡Te ha
dado el esqueleto! Apártate a la X» · «¡Te han dado las rocas! Apártate a la X» · «¡Te ha mordido/picado! Agáchate cuando
baje en picado» · «¡Salta la calavera!» · «¡Salta la onda del cíclope!» · «¡Salta el tronco!» · «¡Agáchate bajo la viga!» ·
«¡Te ha mordido! Sáltale encima a la seta» · «¡Te ha mordido! Apártate a la X» · «¡Salta para subir!» · «¡Sentadilla honda y
salta!» · «¡Salta el hueco!» · «¡Has chocado con el islote!… / ¡El islote estaba abajo!…» · «¡Abre los brazos en cruz para
planear!» · «¡Abre los brazos!» (`runner.ts:612-1399`).

**La pelea con el jefe (clase D): al Panel, en grande** (en plancha, en las tablas), con el texto de la forma:
«¡X te corta el paso! Esquiva lo que te lanza» · «¡Alta! Agáchate» / «¡Baja! Salta» / «¡Al cuerpo! Apártate» · «¡Te ha dado!
La alta: agáchate / La baja: salta / Al cuerpo: apártate a un lado» · «¡Está mareado! Sentadilla honda y salta encima» /
«¡Está mareado! ¡Salta encima!» · «¡Más hondo! Sentadilla honda y salta» · «Se ha recuperado. Cuando se maree…»
(`runner.ts:1471-1541`). «¡Esquivada!», «¡Toma! n de 3» (marcador) y «¡JEFE DERROTADO!» (dorado): Igual.

**Cómo hacer bien el ejercicio (clase B): al Panel** (de pie, además, en el suelo como ahora): «Baja más: irás más deprisa»
(`path.ts:381`) · «¡Baja más!» (sentadilla) · «¡Baja más la rodilla de atrás!» (zancada) · «¡Más abajo!» y «Vuelve a la
plancha» (plancha).

**Estado (clase E)**: «Empieza con la pierna derecha delante», «¡Cambia de pierna! Ahora, la X delante»: al Panel. «Fin del
turbo…», el marcador («x m · y km/h», «Tramo n: faltan N m», «★ g/G», «Energía N %»…), «MUNDO n» (dorado), «PREPÁRATE · N
TRAMOS», «TRAMO n», «¡Tramo superado!»: Igual.

**Celebraciones (clase F)**, todas al marcador: Igual («¡A TOPE!», «¡PERFECTA!», «¡Hueco saltado!», «¡Aplastada!», «¡Cofre
abierto!…», «¡Supersalto!», «¡Fruta!», «¡Planeando!»… y los dorados del cofre y del tesoro).

### A.2 Combate, por ejercicio (detectores: `src/exercise/standing.ts` y `floor.ts`)

Todas son de la clase B (cómo hacerlo bien) salvo las marcadas; hoy salen por el breve (y de pie, también en el suelo).
**Destino: Panel** (de pie, además, en el suelo).

| Ejercicio | Indicaciones |
| --- | --- |
| Sentadillas | «¡Baja más!» |
| Zancadas | «¡Baja más la rodilla de atrás!» · «Ahora con la pierna izquierda/derecha delante» (estado) |
| Sentadilla con salto | «¡Baja más!» · «¡Salta al subir!» |
| Sentadilla con press | «¡Baja más!» · «¡Sube las pesas por encima de la cabeza!» |
| Sentadilla frontal con elevación | «¡Baja más!» · «¡Brazos estirados al frente, a la altura de los hombros!» |
| Swing | «¡Lleva más la cadera atrás!» · «¡Lanza la kettlebell al frente, a la altura del pecho!» |
| Peso muerto con remo | «¡Baja más el peso!» |
| Curl y curl con barra | «Sube hasta el hombro» |
| Elevación frontal | «Brazos estirados: la pesa, al frente» · «Sube hasta la altura de los hombros» |
| Antebrazos (barra escurrida) | «Mira la barra: no veo tus dos manos» · «¡Cargado! Aguanta escurrida o gira al revés» (estado) · «Gira más las muñecas (unos N° cada una)» |
| Fondos en silla | «Vuelve a la silla» · «¡Baja hasta los 90° de codo!» |
| Flexiones | «Vuelve a la plancha» · «¡Más abajo!» |
| Plancha lateral | «Ponte en plancha lateral» · «¡Sube la cadera!» · «Aguanta N» (estado) |
| Superman | «Túmbate boca abajo» · «Sube un poco más: X de Y cm» · «¡Aguanta N s arriba!» · «Estira los brazos» · «Aguanta N» (estado) |
| Inchworm | «Camina con las manos hasta la línea del suelo» · «Vuelve andando con las manos hasta la salida» · «¡Onda expansiva ×N!» (celebración) |
| Plancha con un brazo | «Vuelve a la plancha» · «¡Más abajo para cargar!» · «¡Carga ×N! Levanta un brazo» (estado) · «Aguanta abajo en la flexión para cargar» · «Apoya bien la otra mano en el suelo» · «Levanta más el brazo, a la altura del hombro» |

El renglón fijo del panel, por ejercicio: las 17 frases de `IDLE` (`src/exercise/how.ts:64-82`: «Baja en sentadilla para
cargar», «Sube la pesa al hombro»…), que hoy van en la tercera línea del marcador.

### A.3 Combate, lo común (`src/combat/game.ts` y compañía)

| Indicación | Clase | Hoy | Destino |
| --- | --- | --- | --- |
| «¡Te lanza piedras! Apártate o párala con la mano» | A | breve y suelo | Fuera (pregunta 1) |
| «¡Un cofre! Salta para abrirlo: dentro, una mejora, una vida o puntos» | A | marcador | Igual, en el marcador (pregunta 1) |
| «Más controlado» (repetición demasiado rápida) | B | breve | Panel |
| «Apunta con la mano y aprieta el gatillo» / «Mano atrás y lánzala hacia el enemigo» (la primera vez) | B | breve | Panel |
| «Sin carga: ¡haz una sentadilla!» | B | breve | Panel |
| «¡Lanza el rayo! Apunta y gatillo» / «…Mano atrás y adelante» (cada 4 s con carga) | E | breve | Panel |
| «Carga ×N», «¡RECARGA PROFUNDA! ×N»; en el suelo «CARGA ×N», «×4 · ¡ARRIBA!» | E | marcador y suelo | Igual |
| «OLEADA n», el panel entre oleadas, «¡Oleada superada!», «DESCANSO N», «PREPÁRATE…», «¡PREPÁRATE!» 3-2-1, la calibración | E | marcador, panel, centro | Igual (centrados: 3.E) |
| «¡PERFECTA!», «¡Bien!», «¡DISPARO ×N!», «COMBO ×N», «¡Golpe!», «¡Parada!», «¡Esquivada!», «¡JEFE DESTRUIDO!», mejoras, cofres abiertos, relámpago, escudo | F | marcador | Igual |
| «Fallo», «¡Te han golpeado!», «¡Pedrada!» | C | marcador | Igual |
| Logros dorados (récords, meta diaria, misiones, nivel, cofre del día) | F | dorado | Igual |

### A.4 Arcos (`src/modes/arcs/`)

| Indicación | Clase | Hoy | Destino |
| --- | --- | --- | --- |
| «¡RÁFAGA DE VALLAS! N saltos seguidos» · «¡BURPEE! Al suelo en plancha… ¡y arriba a saltar la valla!» · «¡ARCO DE PLANCHA! Manos al suelo y pies atrás» · «¡MANO AL SUELO! Apártate a la X y apóyate en una mano» | A | breve, con bocina | Fuera el texto; quedan la bocina y la huella de la mano (pregunta 1) |
| «Quédate en el carril» | B | breve y suelo | Panel |
| «¡Salta!» / «¡Salta, no te estires!» · «¡Al suelo, en plancha!» · «¡Más abajo, con la mano en el suelo, a la X!» · «¡Por el lado alto: apártate a la X y baja sobre esa pierna!» · «¡Apártate a la X!» · «¡Agáchate más!» · «¡Apártate del láser, a la X!» · «¡Esquiva la maza: apártate o agáchate!» · «¡Ladéate para entrar en el hueco!» · «¡Métete en el hueco!» | C | breve | Panel (pregunta 2) |
| «¡PERFECTA!», «¡Saltado!», «¡Esquivado!», «¡Aguantado!», «¡Maza esquivada!», «¡Por el hueco!», «¡ORBE!», la fiebre, «¡SUBE LA MÚSICA!» | F/E | marcador | Igual |

El marcador de Arcos no anuncia lo que viene (regla del usuario; comprobado: `arcs.hud()` no lleva nada de eso).

### A.5 Toques (`src/modes/touch/`)

| Indicación | Clase | Hoy | Destino |
| --- | --- | --- | --- |
| «¡Agáchate para cortarlo!» · «¡Da un paso adelante!» · «¡Inclínate hacia ese lado!» · «¡Salta para cortarlo!» · «¡Oblicuo: cruza con la mano X!» · «¡Con la mano X!» · «Vuelve a la posición de partida» | B | breve | Panel (boca arriba, en el techo) |
| «Aguanta N» | E | breve | Panel |
| «¡Has salido de la ameba!» · «¡Mete la cabeza en la ameba!» · «¡Corta el bloque con la espada!» · «¡Toca el diamante con la X!» | C | breve | Panel |
| «¡PERFECTO!», «¡Aguantado!», «¡Bien!», «Quedan N» | F/E | marcador | Igual |

### A.6 Barras (`src/modes/bars/`)

| Indicación | Clase | Hoy | Destino |
| --- | --- | --- | --- |
| Colocar la barra o las paralelas, «¡A LA BARRA!», «¡CUÉLGATE!», la cuenta | E | centro | Igual (centrado: 3.E) |
| «¡Más arriba!» · «Más controlado» | B | breve y suelo / marcador | Panel (colgado: delante, a la altura de los ojos) |
| «Se escapó» · «¡Te ha picado!» · por qué se acabó («la cabeza bajó más de N cm»…) | C | breve y suelo | Panel |
| «¡N s!», «CARGA ×N», «¡ONDA ×N!», «¡AL CHARCO!», «¡TE SOLTASTE!», «¡Bien!», «¡PERFECTA!», «¡Sigue!» | E/F/C | marcador | Igual |

### A.7 Otras cosas que salieron al hacer el inventario

- `HOW` (`src/exercise/how.ts:7-25`, las 17 parejas «1. … / 2. …») no lo usa nadie.
- `src/modes/trek/halts.ts`, `bandits.ts` y `wolves.ts` (la Travesía clásica) ya no se alcanzan desde la de plataformas.
- De pie y sin número de tramos, la Travesía dice «PREPÁRATE · AL FALLO»; en el suelo, «SIN FIN» (`game.ts:1041` y `1061`).
- `ArcCore.openGate` (`src/modes/arcs/arc.ts:151-152`) no lo usa nadie: Arcos nunca abre las compuertas.

No se limpia nada de esto sin preguntar: va apuntado para que Opus lo proponga.
