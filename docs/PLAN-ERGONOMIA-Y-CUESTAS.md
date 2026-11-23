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
