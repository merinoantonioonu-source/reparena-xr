# Plan: afinar los controles del vuelo de la Travesía

El usuario probó «Volando (en plancha)» en las gafas el 23/11/2026: **no entiende bien cuáles son los controles** y la
correspondencia entre lo que hace el cuerpo y lo que hace el vuelo (el picado, la remontada…) **es poco fina**. Este plan dice
qué hay hoy, por qué falla (con su sitio en el código y números de una simulación) y cómo arreglarlo. **Quien traza el plan
no toca el código; lo implementa otra IA.** Todo sigue las normas de `AGENTS.md`, `docs/REGLAS.md` y `MIGRACION.md` (léelos
antes): español, explicar por lo que se ve en las gafas, propuestas cuando haya varias formas, lógica pura con pruebas, nada
de crear objetos en `update()`.

Dónde está el vuelo: el planeador, `src/modes/trek/plat/fly.ts` (`Glider`, `FLY`, `boardTilt`); lo que manda el cuerpo y el
juicio de cada reto, `src/modes/trek/plat/runner.ts` (`flyStep`, `judgeFly`); los gestos de la cabeza, `plat/moves.ts`
(`BodyMoves.proneUpdate`); lo que se ve, `src/modes/trek/trek-system.ts` (`drawFly`, `flyRings`, el mundo baja
`Runner.flyAlt`) y `plat/pieces.ts`; sus pruebas, `tests/unit/plat-fly.test.ts`. Regla del usuario: `docs/REGLAS.md` ›
«Travesía de plataformas, **volando**».

## 0. Cómo se trabaja

- **Un PR por bloque** del apartado 4, en ese orden. Cada PR: `npm run typecheck`, `npm test`, `npm run test:compare` (con
  `RA_DIR` si hay clon de RepArena), `npm run build`, `npm run test:e2e`; capturas en «Probar en el ordenador» con la cámara
  en plancha (tecla P) de lo que cambia a la vista; la regla en `docs/REGLAS.md`, nota en `MIGRACION.md`.
- **Lo que no se toca**: el impulso de la Travesía (`Trek` de `path.ts`), la lectura de las manos (`hand-filter.ts`) y la
  Travesía en plancha sin volar (sus gestos de `BodyMoves` siguen igual: lo nuevo del vuelo va aparte, en `fly.ts`, y solo se
  usa con `Runner.fly`).
- **Los números de este plan son de partida.** Los definitivos salen de la grabación del usuario (bloque 1) y de probarlo
  con él. Si algo resulta ambiguo, **propuestas al usuario**, no decisiones por libre.
- En las gafas no se puede probar desde aquí: cada bloque acaba diciendo al usuario qué mirar y, si falla, pidiéndole la
  grabación del vuelo (bloque 1).

## 1. Los controles de hoy

Todo se lee de **la cabeza** (las gafas), respecto a donde estaba al calibrar en plancha con los brazos estirados. Con la
tabla, además, de las muñecas.

| Lo que haces | Lo que lee el juego | Lo que hace el vuelo | Números (código) |
| --- | --- | --- | --- |
| **Escorarte** (llevar el pecho a un lado) | La cabeza se aparta del centro (`dx`) | Te **desplaza** hacia ese lado mientras sigas escorado (velocidad, no posición) | 12 cm = velocidad máxima, 3 m/s; tope, 2,4 m a cada lado (`FLY.lean`, `uV`, `uMax`) |
| **Bajar en la flexión** | La cabeza baja 7,8 cm o más (`BodyMoves.plank`, `lowNeed`) | **Picado**: todo o nada, baja a 3,2 m/s y acelera | `FLY.diveV`; `lowNeed` = 60 % de «Profundidad de la flexión» |
| **Flexión explosiva** | La cabeza sube a más de 0,5 m/s y llega arriba (`takeoff`) | **Aletazo**: un empujón hacia arriba (unos 1,4 m) | `PRONE_VY`, `FLY.flap` |
| **Dos explosivas seguidas** (menos de 1,6 s) | `deepT` | **Gran remonte** (unos 2,7 m más) | `PAIR_T`, `FLY.pair` |
| **Subir la cadera (pica)** | La cabeza va 6 cm hacia atrás (`fwd ≤ −WAVE_BACK`) | **Frena** y sube a 1,2 m/s | `FLY.brake`, `brakeUp` |
| **Ponerte de canto** | La cabeza gira de lado más de 40° (`roll`) | **Tonel**: solo sirve para pasar las grietas | `SLIT_ROLL` |
| **Tabla: inclinarla a un lado** | Una muñeca más baja que la otra (`boardTilt`) | Se suma a escorarse | `FLY.tilt` = 4 |
| **Tabla: peso adelante** | La cabeza va 6 cm adelante | Picado (todo o nada) | `flyStep`: `tiltDive` |
| Nada (en la dura) | 2,5 s sin flexiones | Pierdes altura a 0,45 m/s, hasta 2 m | `FLY.idle`, `sink`, `altMin` |
| Una corriente de aire | Estás dentro de ella | Sube a 3,2 m/s | `FLY.lift` |
| Llegar al cofre | A menos de 22 m | Baja solo y se posa | `LAND_D` |

No hay nada en pantalla que diga a qué altura vas, cuánto te has apartado ni qué gesto te está leyendo el juego, y nadie te
enseña los controles: en plancha no sale el panel de indicaciones (`guideSpot` devuelve `null` tumbado).

## 2. Por qué no se entiende y no es fino (causas)

Comprobado con una simulación (cabeza a 45 cm, flexiones de 11 cm a ritmo normal) y leyendo el código:

1. **En la dura, cada flexión es un picado.** Para avanzar hay que hacer flexiones, y bajar en la flexión es picar. Una
   flexión normal no es «explosiva», así que no da aletazo. Resultado medido: tras **la primera flexión** la altura cae de 6 m
   a **2,4 m y se queda pegada ahí** toda la partida (2,38 · 2,51 · 2,49 · 2,48…). El jugador nunca vuela a la altura de los
   retos. Es la causa principal. (`flyStep`: `I.low = M.plank`; `Glider.step`: `diving`.)
2. **El centro se va con la cabeza.** `BodyMoves` mueve el centro hacia donde está la cabeza (4 s, `CENTER_TAU`) salvo que
   venga un obstáculo de lado (`Runner.sideAhead`), y **los retos del vuelo no están en esa lista**. Medido: escorado 8 cm y
   quieto, la lectura cae sola (6,2 → 4,8 → 3,7 → … → 0,6 cm en 10 s) y, **al volver al centro, el juego lee que te has ido
   al otro lado** (−5,7 cm) y te manda al borde contrario (de +2,4 m a −2,4 m en 5 s). Lo mismo le pasa a la pica (el centro
   de «adelante-atrás» también se va). (`moves.ts:169`, `runner.ts:503`.)
3. **El lado es velocidad, no posición.** Cualquier escora mantenida te lleva hasta el borde (medido: 8 cm, al tope en 2 s).
   Para pasar por un aro hay que escorarse, esperar y deshacer la escora a tiempo: difícil de afinar. Lo natural es que
   «escorado 5 cm» sea «1 m a ese lado», y que al volver al centro el vuelo vuelva.
4. **El picado es todo o nada.** Por debajo de 7,8 cm no pasa nada; a partir de ahí, 3,2 m/s. No se puede bajar «un poco».
5. **Remontar pide lo más duro.** Solo se sube con flexiones explosivas (más de 0,5 m/s, casi una flexión con palmada), con
   la pica (lenta, 1,2 m/s) o con una corriente. Tras un picado te quedas abajo.
6. **La pica se confunde con el picado** (sospecha, sin confirmar en las gafas): en pica la cabeza va hacia atrás, pero
   también baja; si baja 7,8 cm, el juego lee «picado», que gana a «frenar» (`braking = pike && !diving`).
7. **No hay con qué orientarse.** Ni sombra propia, ni alas, ni altímetro, ni señal de «gesto leído». Como el mundo responde
   con retraso (suavizados de 0,25 y 0,6 s), no se ve qué movimiento causó qué.
8. **No se enseña.** El modo empieza sin explicar nada (la regla «no se avisa de lo que viene» no impide enseñar **cómo se
   hace el ejercicio**: eso sí se dice).
9. **La tabla**: la inclinación sale de dos muñecas que las gafas ven mal en plancha (1 cm de error es un 13 % de la
   velocidad de lado) y «peso adelante» depende del centro que se va (causa 2). Sin datos de las gafas no se puede afinar.
10. **Comodidad** (a vigilar): el mundo sube y baja hasta 3,2 m/s bajo los ojos, que en plancha miran al suelo.

## 3. Cómo debe quedar: «la cabeza es la palanca»

Un solo principio: **el vuelo va donde va tu cabeza, en proporción y sin memoria**. Cada eje, una cosa:

| Eje de la cabeza | Gesto | Vuelo |
| --- | --- | --- |
| A los lados | Escorarte | **Posición de lado**: tanto te escoras, tanto te apartas; vuelves al centro y el vuelo vuelve |
| Abajo | Bajar el pecho | **Bajar**, en proporción a lo que bajas |
| Atrás | Subir la cadera (pica) | **Remontar y frenar**, en proporción |
| Giro | De canto | Tonel (las grietas) |
| — | Flexión (bajar y subir) | **Aletazo**: sube un poco y empuja. Explosiva: sube más (nunca hace falta) |

### 3.1 El lado (sin dudas: se hace así)

- **Posición, no velocidad**: `u objetivo = curva(dx) × uMax`. Zona muerta de 1,5 cm; recorrido completo, 12 cm (ajuste
  «Vuelo: recorrido de lado», de 8 a 20 cm); curva algo más suave cerca del centro (más fina donde se apunta). El planeador
  sigue al objetivo con un muelle sin rebote (0,2 s) y, como mucho, a 4 m/s.
- **El centro, fijo mientras vuelas**: se toma al calibrar y al despegar de cada cofre (posado, quieto) y no se mueve en el
  aire. (En `flyStep`, `moves.hold = true` volando; o mejor, que `fly.ts` lleve su propio centro y no dependa de `x0`/`z0`.)
- Comprobar que «a un lado» es de verdad el lado del cuerpo: se mide en el eje X de la arena; si el jugador se coloca en
  plancha algo girado respecto al sendero, la escora se mezcla con adelante-atrás. Tomar la dirección del cuerpo al calibrar
  (`bodyDir`, `src/input/body-dir.ts`) y medir la escora en perpendicular a ella.

### 3.2 La altura: dos modelos para que el usuario los pruebe y elija

Los dos van tras un ajuste en pruebas, «Vuelo: mando de altura» (`flyAlt`: `pos` | `flap`), para probarlos en las gafas. El
que no se elija, se quita.

- **P · Posición («el cuerpo es el avión»)**. Tu altura sale de tu cabeza: `altura = crucero − baja(pecho) + sube(pica)`.
  - Bajar el pecho: de 2 cm (zona muerta) a la flexión entera (lo de «Profundidad de la flexión») = de 0 a 3,5 m menos.
    Aguantar a media flexión es volar a media altura (trabajo isométrico).
  - La pica: la cabeza de 6 a 18 cm atrás = de 0 a 3 m más, y frena en proporción. **Si hay pica, no hay picado** (la pica
    manda: se decide por «atrás», con su margen para no parpadear entre los dos).
  - Crucero: en la suave, fijo (6 m). En la dura, cada flexión completa lo sube 0,6 m (tope, 9 m) y sin flexiones (2 s) baja
    a 0,3 m/s (suelo, 3 m): el ritmo de las flexiones te mantiene arriba.
  - Cada flexión es una pasada: bajas y vuelves a donde estabas. El planeador sigue al objetivo con un muelle sin rebote y
    con tope de velocidad (2,5 m/s) y de aceleración (6 m/s²), por comodidad.
  - A favor: lo más fino y lo más fácil de entender. En contra: en la dura, el mundo sube y baja con cada flexión (a
    comprobar si marea).
- **A · Aleteo («cada flexión, un aletazo»)**. La altura no sigue a la cabeza.
  - Cada flexión completa (normal, no explosiva) da un aletazo: +1,2 m (perfecta, +1,6; explosiva, +2,5). En la dura,
    además, empuja (como ahora) y sin flexiones (2 s) pierdes 0,45 m/s.
  - **Aguantar abajo** (más de 0,35 s por debajo del umbral) es el picado, **en proporción a lo hondo**: de 1 m/s (justo en
    el umbral) a 3,5 m/s (abajo del todo). La bajada de una flexión normal no cuenta como picado.
  - La pica, como en P (remonta y frena en proporción, y manda sobre el picado).
  - A favor: sin vaivén con cada flexión; el ritmo de flexiones es la altura (más ejercicio). En contra: el picado tarda en
    empezar (0,35 s) y la altura es «velocidad», menos fina.

Recomendación de quien traza el plan: **P en la suave y A en la dura** si el usuario no nota mareo con P; si no quiere dos
modelos, **A en las dos**. Lo decide él en las gafas.

### 3.3 Que se vea lo que haces (lo que falta hoy)

En plancha se mira al suelo, por delante de las manos: todo esto va ahí o por debajo de ti.

1. **Tu sombra**, en el suelo del paisaje, justo debajo de ti: una mancha con forma de ave. Dice dónde estás de lado y, por
   su tamaño y lo lejos que queda, a qué altura. (Como la sombra del desprendimiento: una malla con textura, sin lienzos.)
2. **Tus alas**, a los lados de la vista (reusar `Wings`, `src/modes/trek/wings.ts`): se ladean con la escora, se pliegan en
   el picado, se abren en la pica y baten en el aletazo. Es la confirmación de «gesto leído».
3. **La ventana de cada reto**, marcada en el propio reto: el canto de abajo del puente, con un filo de luz; el lado libre de
   la columna, con un haz en el suelo; la grieta, con su raja iluminada; el aro ya se ve. No es avisar de lo que viene: es
   que el reto se lea (como el canto verde del hueco en Arcos).
4. **Dos reglillas** (opcional, ajuste «Vuelo: instrumentos», de serie sí mientras se afina): en el suelo, por delante de las
   manos, una horizontal (tu lado) y una vertical (tu altura), cada una con una marca verde donde está la ventana del
   siguiente reto. Hechas con piezas que se mueven (nada de repintar un lienzo en cada fotograma).
5. **Sonido**: el viento sube de tono en el picado; un golpe de aire en cada aletazo; un siseo al frenar.

### 3.4 Que se aprenda: la práctica de vuelo

- La **primera vez** (y con «Vuelo: repetir la práctica»), antes del primer tramo, una práctica sin retos: seis pasos, cada
  uno espera a que lo hagas y lo marca con ✓ y un sonido: «Escórate a la derecha» · «…a la izquierda» · «Baja el pecho:
  bajas» · «Haz una flexión: aletazo» · «Cadera arriba: frenas y subes» · «De canto: tonel». El texto, en el aviso breve de
  la vista (en plancha, en el suelo bajo la cara), con la sombra y las alas ya a la vista.
- De paso, **mide al jugador**: lo que se escora cómodo a cada lado, lo que baja y lo que va atrás en pica. El recorrido
  completo de cada eje se pone al 80 % de lo medido (se guarda en `reparenaxr-fly`; se puede rehacer).
- Que se ha hecho la práctica se guarda en `reparenaxr-flytuto`.
- Durante el vuelo, lo que haces mal ante un reto se sigue diciendo al fallar (ya está: «¡Pica para pasar por debajo!»).

### 3.5 Los retos, a la medida de los gestos

Lo que tarda cada gesto en plancha (de partida; se corrige con la grabación): escorarse 10 cm, 0,5 s; bajar el pecho, 0,7 s;
pica, 1,1 s; de canto, 1,8 s. Regla (la de `docs/PLAN-ERGONOMIA-Y-CUESTAS.md`, 4.2): entre que un reto se distingue y llega,
al menos **1,5 × el gesto + 0,4 s**.

- La separación (`FLY_GAP_S`, hoy 2,4 s para todos) pasa a depender del reto que viene: grieta, 4 s; puente y aro, 3 s;
  columna, corriente y frutas, 2,4 s. En el primer tramo, un 40 % más; con el rango, menos (tabla `RANK_VALS_XR`).
- Dos retos seguidos no piden extremos opuestos (aro arriba y puente abajo) sin un reto neutro o el doble de sitio.
- Con el modelo de altura elegido, repasar las alturas de `course.ts` (`ring`, `arch`, `berries`) para que cada ventana se
  alcance con medio recorrido del gesto, no con el recorrido entero.
- El primer tramo de la primera partida, solo aros, frutas y corrientes (premios); columnas y puentes desde el segundo;
  grietas desde el tercero.

### 3.6 La tabla de equilibrio

Se deja para el final, con datos: inclinar la tabla ya mueve los hombros y la cabeza (lo lee la escora); las muñecas solo
suman si se ven las dos, estables (0,15 s), con zona muerta de 2° y un peso que se ajusta con la grabación. «Peso adelante»
pasa a ser proporcional y con centro fijo. Si las muñecas resultan demasiado ruidosas, la tabla se queda en «la cabeza» y se
dice así en su explicación.

## 4. Los bloques, en orden

1. **Grabar el vuelo (la caja negra del vuelo).** Sin esto se afina a ciegas.
   - Guardar los últimos 40 s de vuelo, a 36 por segundo: la cabeza (x, y, z y el giro de canto), las muñecas (si se ven, x,
     y, z), lo leído (`dx`, `down`, `fwd`, picado, aletazo, pica), el planeador (`u`, `alt`, sus velocidades) y el reto
     siguiente (clase, lo que falta, su `u` y su `h`) con cada acierto y fallo. Se guarda con el diagnóstico (al salir de la
     VR y desde la pausa) y la página lo copia, como la caja negra de los curls (`src/core/blackbox.ts`, `BB_KEY`; ver
     `docs/PLAN-CURL-BARRA.md`). Clave nueva: `reparenaxr-flybox`.
   - Una prueba de reproducción (`tests/replay`): pasa una grabación por `Glider` con los números que se le den y dice
     alturas, lados y qué retos se habrían pasado. Así cada cambio de números se prueba con el vuelo real del usuario.
   - **Pedir al usuario** una grabación del vuelo de hoy (la dura y la suave, un tramo cada una) antes del bloque 3.
2. **Arreglos seguros** (no dependen de ninguna decisión): el centro fijo en el aire (causa 2); el lado por posición (3.1);
   la pica manda sobre el picado (causa 6); en plancha y volando, el texto de qué hacer en el aviso breve al empezar.
   Pruebas en `plat-fly.test.ts`: escorado y quieto 10 s, el lado no cambia; al volver al centro, vuelve a 0 sin pasarse;
   5 cm de escora = 1 m ± 0,1; una pica con la cabeza 8 cm más baja remonta, no pica.
3. **La altura** (3.2): los dos modelos tras «Vuelo: mando de altura», con sus pruebas (en la dura, diez flexiones normales
   mantienen la altura entre 4 y 9 m; media flexión aguantada = media bajada en P; en A, una flexión normal no pica y
   aguantar abajo sí, en proporción). El usuario los prueba y elige; se quita el otro y se apunta en `REGLAS.md`.
4. **Que se vea** (3.3): la sombra, las alas, las ventanas de los retos, las reglillas y el sonido. Capturas en plancha.
5. **La práctica de vuelo** (3.4), con su medida del jugador.
6. **Los retos a medida** (3.5): separaciones por reto, primer tramo fácil, alturas repasadas. `plat-course.test.ts`: 2.000
   recorridos volando cumplen las reglas nuevas.
7. **La tabla** (3.6), con la grabación del usuario usando la tabla.

Tras cada bloque de 2 a 6, pedir al usuario que lo pruebe y su grabación si algo no va; los números se corrigen con ella
(prueba de reproducción) antes de seguir.

## 5. Qué preguntar al usuario

1. Tras el bloque 3: **¿altura por posición (P), por aleteo (A), o P en la suave y A en la dura?** ¿Marea el vaivén de P?
2. ¿Las reglillas se quedan (como instrumentos) o solo mientras se afina?
3. ¿El recorrido de lado (12 cm) y el de bajar (la flexión entera) le quedan cómodos, o los que mida la práctica?
4. ¿Juega con la tabla lo bastante para dedicarle el bloque 7, o se deja en «la cabeza»?
