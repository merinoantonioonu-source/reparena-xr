# Reglas de diseño de RepArena

Las ha ido fijando el usuario mientras jugaba a RepArena, y siguen valiendo en RepArena XR: **no las cambies sin
preguntarle**. Están copiadas tal cual del `CLAUDE.md` de RepArena (`merinoantonioonu-source/reparena`); las rutas
`src/NN_*.js` y los nombres de funciones (`h.est`, `HF`, `LIFE`…) son de RepArena: es lo que hay que portar y donde se
explica el porqué.

Algunas eran soluciones a problemas del motor viejo (Three.js r128 hecho a mano) y van marcadas **[A REVISAR]** con el PR
en que se decide: puede que con IWSDK ya no hagan falta, pero eso lo decide el usuario (con propuestas), no la IA.

**Lo que resuelve IWSDK, como lo resuelve IWSDK** (pedido del usuario en el PR 3): si IWSDK resuelve algo de forma
distinta a como lo hacía RepArena, se usa su solución de serie y no se fuerza la de RepArena: la migración es precisamente
para ver si las soluciones de IWSDK resuelven los problemas que tenía RepArena (por ejemplo, los rayos al azar del curl con
barra, que salían porque RepArena detectaba mal las manos; los movimientos del cuerpo; la física de pulsar los menús; y
cómo se pintan las estructuras, las formas y los elementos de la escena: si IWSDK trae compuertas, armas… o las piezas para
hacerlas, primará IWSDK). Primarán siempre las soluciones de IWSDK de serie, en todo. Los apaños de RepArena para esas
cosas (van marcados **[Con IWSDK, de serie]**) no se portan; si en las gafas vuelve el problema, se busca primero lo que
ofrezca IWSDK y, si no hay nada, se le proponen al usuario.

**Excepción decidida por el usuario (PR 30, opción B): las manos y los menús, los de RepArena enteros.** IWSDK no especifica
cómo deben comportarse (no tiene opciones para el toque ni para la mano) y con lo de serie iban peor que en RepArena: se
traen su lectura de las manos (suavizado, saltos, mano perdida, pellizco, `HF`) y sus menús (paneles, teclas pintadas y su
pulsación sólida, pegada y con imán).

## Lecciones del motor viejo que siguen valiendo

- Dianas y marcas en las gafas: tiras planas de cara al jugador (como los corchetes y las líneas de enfoque). Las de
  silueta (stencil y copias de la figura del enemigo) dejaban planos de basura blancos y azules pegados a la vista en
  cuanto salía la primera diana.
- En las gafas, no cambies la capa de imagen (`XRWebGLLayer`) a menudo: cada una ocupa otra memoria de vídeo y, con
  muchos cambios, las gafas pintan planos de basura blancos y azules. La resolución se elige una vez al entrar y no cambia
  en la partida: para aligerar, solo foveación y sombras (si no, la nitidez se quedaba baja y las letras, borrosas). El
  navegador de las Quest 3 da como «nativa» ×1 (1680×1760 por ojo, menos que la pantalla): para que se vea nítido hay que
  pedir más (Alta ×1,4). (En RepArena XR: `QUALITY`, `src/combat/game.ts`.)
- Las chispas y partículas no se pintan pegadas a los ojos (se veían como cuadrados enormes blancos, morados y azules):
  se apagan a menos de 45 cm y desaparecen a menos de 12 cm.
- Ajustes: todos en un esquema, con grupo, condición, explicación y si cambian qué otros campos se ven; el formulario de
  la página y los menús del juego salen de ahí (en RepArena, `SCHEMA` de `src/00_core.js`; aquí, desde el PR 2).
- Los modelos 3D, con su licencia (cada pack en su `LEEME.md`); los sonidos, sustituibles con archivos (lista en su
  `LEEME.md`).

## Apaños del motor viejo que no se portan

- ~~Las teclas pintadas en texturas y su caché~~: desde el PR 31 sí se portan (opción B del usuario: los menús de RepArena
  enteros, `src/ui/ra/`).
- Los módulos concatenados en una sola función, Three.js r128 desde CDN, los simulacros de las pruebas (`three-mock`,
  `env-mock`) y el cuidado con `//` en mitad de una línea.

## Reglas de diseño

No las cambies sin preguntarle.

**Estilo**
- **Nada flota** (pedido del usuario: «los árboles nunca están flotando»): cada árbol, palmera, piedra o adorno se apoya en el
  suelo o en la roca que tiene debajo (su pie, en ella o un poco hundido; nunca en el aire). Lo que va encima de una roca se
  coloca con la altura real de su cara de arriba (`src/env/rock-tops.ts`), no a ojo, y una prueba lo comprueba
  (`tests/unit/no-float.test.ts`).
- **Todo se diseña para el estilo Cómic** (`src/38_comic.js`), que es el de serie: en Realista, con la resolución alta, las
  gafas no llegan y va a saltos. Lo nuevo se prueba y se mira en Cómic; Realista queda como opción.

**Travesía** (`src/75_trek.js`)
- **Travesía de plataformas** (RepArena XR, `src/modes/trek/plat/`; fijado por el usuario al probar el PR A): el avance
  **nunca se para ante un obstáculo** (se entrenan los reflejos): el hueco se salta en marcha al llegar a su borde y, si no,
  se tropieza al cruzarlo; chocar o tropezar frena a la mitad y rompe la racha, y sigues. **Cada salto se nota**: el mundo
  baja y sube bajo los pies (unos 45 cm), y en el aire llevas tu inercia (al aterrizar, la velocidad que traías). Va **más
  deprisa** que la clásica (un 35 % más con la misma «Velocidad de avance») y acelera antes.
- Travesía de plataformas, tras probar el PR B (fijado por el usuario):
  - **El túnel** se pasa en marcha, en plancha, sin flexiones: echado, la velocidad que traías se mantiene (inercia) y pasas
    por debajo sin sentadillas; luego, de pie. Es un túnel cubierto de verdad, de roca por dentro.
  - **El burpee** son dos obstáculos: un túnel (plancha) y, unos 2 s después, una plataforma que hay que saltar.
  - En plancha, **los avisos salen delante, en el suelo de la pasarela** (arriba no se leen).
  - **Plataformas altas**: se suben con un supersalto (sentadilla honda y salto); en el mundo, un salto enorme.
  - **Nada de muros de cofres**: lo que sea pared, de roca.
  - **Frutas en vez de obstáculos a un lado** (los obstáculos laterales volverán con los enemigos): flotan a la altura de
    la cabeza, a un lado; se cogen llevando la cabeza hacia ellas. Llenan una **barra de energía**; llena, supervelocidad.
    De vez en cuando, una especial que la llena de golpe. Modelos: el «Food Kit» de Kenney (CC0).
- Travesía de plataformas, PR D (elegido por el usuario): **los enemigos llegan andando por la pasarela** (los monstruitos
  de Quaternius que ya hay): **la seta**, por el centro, **se pisa** saltando cuando llega a tus pies (se chafa y rebotas);
  **el cangrejo**, pegado a un lado, **se esquiva** con un paso al otro. Si no, te muerden: frenas a la mitad y se rompe la
  racha, sin quitar vidas. Lo que hay que esquivar a un lado son **solo enemigos** (nada quieto).
- Travesía de plataformas, tras probar el PR D (fijado por el usuario): **el supersalto hecho cerca de la plataforma ya te
  sube a ella** (aunque sea antes del borde: el salto te lleva hasta arriba; nada de un salto normal y luego subir solo).
  **El fondo realista gira con las curvas** del sendero, en el mismo sentido y algo menos que el mundo de cómic (un 60 %:
  quieto del todo, o con un 25 %, parecía una foto fija alrededor del jugador).
- Travesía de plataformas (pedido del usuario): **el cangrejo escupe**, una vez y solo desde lejos (entre 10 y 15 m), rápido y
  con aviso (se encabrita y suena), hacia tu cabeza; se esquiva **apartando la cabeza** (a un lado o agachándote; una
  sentadilla en el momento justo también vale). Si te da, frenas a la mitad y se rompe la racha, sin quitar vidas.
- Travesía de plataformas, premios (elegidos por el usuario de las ideas para hacerla más divertida, al estilo de los juegos
  de plataformas pero con el cuerpo): **barriles sorpresa** flotando que se rompen de un cabezazo saltando debajo (dan
  fruta; uno de cada cuatro, un racimo que llena la energía), **frutas en arco sobre los huecos** que se comen saltando a
  tiempo, y **tres frutas doradas por tramo** (altas en el centro, se cogen saltando; o encima de una plataforma, subiendo
  de un supersalto), con su cuenta en el marcador y en el cofre. Fallar un premio no frena ni rompe la racha.
- Travesía de plataformas, **planear** (elegido por el usuario): los barrancos (6–10 m, con pedregal abajo) se cruzan
  llegando a su borde con **los brazos abiertos en cruz** (a los lados, a la altura de los hombros): planeas (el mundo sube y
  baja despacio, con estelas de viento) y, ladeando la cabeza, coges las frutas del aire. Bajar los brazos en pleno vuelo:
  aterrizas frenando y sin racha; sin abrirlos, a trompicones. Nunca se cae. Una mano que las gafas pierden estando abierta
  cuenta como abierta.
- Travesía de plataformas, **trampolín y bifurcaciones** (elegidos por el usuario): el **trampolín** es una seta gigante en la
  pasarela; si haces una **sentadilla honda** justo antes de pisarla, te lanza lejos y alto (un vuelo de 8–11 m con frutas en
  el arco); sin ella, se pasa de un salto normal (no frena: es un premio). En la **bifurcación** la pasarela se abre en dos
  ramas: con un **paso a la derecha** al llegar, la difícil (más retos y más premios: un tronco, un barril y a veces una
  dorada); si no, la izquierda, la tranquila (frutas a los lados). Luego las dos se juntan.
- Travesía de plataformas, **el jefe del mundo** (elegido por el usuario): en el último tramo de cada mundo, antes del cofre, un
  jefe grande te corta el paso (el de ese mundo: el Demonio verde en el bosque, el Yeti en el risco, el Alien alto en las islas,
  de Quaternius, y el Capitán en la costa pirata) y te para delante. Lanza piedras con
  aviso: **la alta, agacharse; la baja, rodando, saltar; la que va al cuerpo, apartarse**. Tras tres, se marea (estrellas):
  con un **supersalto** (sentadilla honda y salto) le caes encima, pasando por arriba, y él salta hacia atrás para quedarse
  delante (nunca detrás); **a la tercera, derrotado**. Si te da una piedra, se rompe la racha, sin vidas; si no saltas mientras
  está mareado, se recupera y vuelve a lanzar (tras dos veces, vale un salto sin más: la pelea siempre se acaba).
- Travesía de plataformas, **enemigos nuevos** (elegidos por el usuario, de los monstruitos de Quaternius): **la abeja o el
  murciélago en picado** bajan hacia tu cabeza mientras llegan (agacharse, como bajo una viga); **la calavera** llega botando
  por la pasarela (saltarla); **el cíclope**, a un lado, golpea el suelo al acercarte y su onda (un muro bajo de luz) corre por
  la pasarela hacia ti (saltarla cuando llega); **el demonio**, a un lado, lanza una bola de fuego en arco hacia ti (un paso a
  un lado). Si no, te dan: frenas a la mitad y se rompe la racha, sin vidas. Picado y calavera desde el segundo tramo;
  cíclope y demonio, desde el tercero. **La onda del cíclope se ve** (pedido del usuario: solo con humo no se sabía cuándo
  saltar): una cresta de rocas al rojo que revientan las tablas y corre por la pasarela hacia ti, con polvo detrás; se salta
  cuando llega a tus pies.
- Travesía de plataformas, **los mundos** («pasar de pantalla», decidido por el usuario): cada mundo dura **«Tramos por mundo»**
  (un ajuste del usuario, de 1 a 10; 3 de serie) y se **empieza siempre en el primero** (pasado el último, vuelta a empezar).
  El jefe sale en el último tramo de cada mundo y, tras su cofre, se pasa al siguiente cruzando un **portal de luz** (un aro
  brillante con un remolino; al cruzarlo, destello blanco y el aviso «MUNDO 2 · El risco»). Cada mundo, su suelo, sus paisajes,
  sus retos propios y su jefe. El orden lo eligió la IA (el usuario le dejó elegir): **el bosque** (la pasarela de siempre),
  **el risco**, las islas en el cielo y la costa pirata.
  **En una partida corta** (opción A del usuario, en todos los ejercicios): si la partida no tiene más tramos que «Tramos por
  mundo» (acabaría en el cofre del jefe, antes del portal, y nunca se pasaría de mundo), los tramos se reparten para ver
  varios mundos, hasta los cuatro (con 3 tramos, uno por mundo: bosque, risco e islas, cada uno con su jefe).
- Travesía de plataformas, **el risco** (el segundo mundo, propuesto y aprobado): un sendero de roca pegado a una pared de
  montaña, con el vacío a la derecha y un mar de nubes muy abajo (los riscos lejanos salen de él; la foto de fondo, de montaña).
  Sus retos: la **cornisa** (el camino se estrecha: pegarse a la pared, a la izquierda, mientras dure), las **rachas de viento**
  (polvo que cruza el camino: inclinarse contra el viento y aguantar mientras sopla) y los **desprendimientos** (rocas que caen
  de lo alto a un lado del camino, con aviso: apartarse al otro). Si no, frenas a la mitad y se rompe la racha, sin vidas. Sin
  bifurcaciones (se abrirían sobre el vacío). Su jefe, el Yeti.
- Travesía de plataformas, **las islas en el cielo** (el tercer mundo, propuesto y aprobado): islotes de roca flotando sobre un
  mar de nubes, al atardecer y al ocaso, con otras islas alrededor (algunas con árboles); casi todo son saltos, supersaltos y
  planeos. Sus retos: el **islote que sube y baja** (al otro lado de un hueco: hay que saltar cuando está a ras; si está
  arriba, chocas con él, y si está abajo, no llegas) y el **islote que se hunde** (tiembla y se hunde al pisarlo: cruzarlo
  sin pararse; si dejas de hacer repeticiones en él, se te hunde). El demonio que lanza la bola de fuego es aquí un **dragón**
  que vuela a un lado. Sin túneles, cangrejos, cíclopes ni bifurcaciones (no hay suelo a los lados). Si fallas, frenas a la
  mitad y se rompe la racha, sin vidas. Su jefe, el Alien alto.
- Travesía de plataformas, **la costa pirata** (el cuarto mundo, propuesto y aprobado): el muelle de tablas sobre el mar
  (realista: olas, rizos a rachas, reflejo del cielo y destellos), roto a trozos, con islotes de palmeras (alguno con huesos o
  calaveras), barriles y botellas flotando y barcos piratas a lo lejos; fondo del lago (y otro tramo, al atardecer). Sus retos:
  los **cañonazos** desde un barco a un lado (fogonazo, humo y estampido; la bala alta, a la cabeza: agacharse; la baja, a ras
  del muelle: saltarla). Los enemigos son **piratas** (de Quaternius): el **tiburón pirata** llega corriendo por el muelle y
  tira un tajo alto (agacharse) y el **esqueleto pirata**, a un lado, tira un tajo (apartarse; no escupe); además, la calavera y
  el cangrejo. Sin setas, demonios, cíclopes, túneles ni bifurcaciones. Su jefe, el Capitán (lanza balas de cañón en llamas).
  *Cambio sobre la propuesta*: los «tiburones que saltan entre muelles» no se pudieron hacer (no hay modelo de tiburón pez: los
  tiburones del juego son piratas con cabeza de tiburón y no se crean enemigos de cero); son el tiburón pirata que llega
  corriendo.
- Travesía de plataformas, **en plancha** (pedido del usuario: un modo para brazos; elegido de las propuestas): se juega con
  «Flexiones» en los cuatro mundos, con sus jefes, y tiene **dos formas**: la **dura**, en la que cada flexión te empuja (sin
  flexiones te paras), y la **suave** («En plancha, avance solo»), en la que el recorrido viene solo y los movimientos son solo
  para esquivar y los premios. En las dos, los movimientos son: **abajo en la flexión**, agacharse (vigas, picados, tajos, la
  bala alta) y, aguantando abajo, el túnel y el barranco (en vez de planear); **escorarse** a un lado, apartarse (y coger las
  frutas, la cornisa, el viento); **una flexión explosiva**, saltar (huecos, troncos, calaveras, la seta, la bala baja); **dos
  explosivas seguidas**, el supersalto (plataformas altas, trampolín y el jefe mareado); y **el peso adelante**, un acelerón
  corto (cada 4 s como mucho). Lo que pasa por encima de la cabeza sale a la altura de la flexión. Se calibra en plancha, con
  los brazos estirados. Su cortinilla, la de las flexiones de Combate hasta que el usuario dé la suya.
- Travesía de plataformas, **lo que se ve en plancha** (pedido del usuario: con la cabeza hacia el suelo no se veía salir la
  bola alta del jefe): en plancha, lo que lanza el jefe **sale de abajo, de sus pies**, y da más tiempo para esquivar (1,7 s
  desde el aviso; en zancada, 1,45 s; de pie, 1,1 s); mareado, sus estrellas giran también a sus pies; el picado llega
  rasante todo el camino. Regla: en plancha, lo que hay que ver nace y viaja a ras de suelo, por delante de las manos.
- Travesía de plataformas, **el paso lateral en plancha** (elegido por el usuario entre los movimientos de brazos, «solo
  caminar con las manos, no con los pies»): rocas que ocupan tu lado de la pasarela unos metros; hay que caminar con las
  manos al otro lado (la cabeza, a unos 26 cm del centro: más que escorarse) y aguantar ahí hasta pasarlas. Si no, chocas:
  frenas a la mitad y se rompe la racha, sin vidas. Solo en plancha (las dos formas).
- Travesía de plataformas, **los demás movimientos de brazos en plancha** (pedido del usuario: «y demás movimientos de brazos
  en plancha»; los del plan, menos remar): salen tres por tramo, cada tramo otros, además del paso lateral; solo en plancha.
  Sin avisos de lo que viene: al fallar se dice cómo se hace.
  - **La viga inclinada** (flexión arquera): baja de un lado; se pasa abajo en la flexión con la cabeza hacia el lado alto.
  - **La valla baja y larga** (la ola): un enrejado de barras bajas; se pasa con la ola: la pica (la cabeza atrás), zambullirse
    por debajo y salir en cobra (arriba y adelante).
  - **La rendija** entre dos rocas altas (giro abierto): de canto, como en la plancha lateral, todo su largo.
  - **Las frutas lejanas** a ras de las tablas: caminar con las manos hacia delante para alcanzarlas.
  - **Las uvas** a un lado (zarpazo): se cogen con la mano; **la seta** a un lado (palmada): se chafa bajando la mano de golpe
    encima. Si las gafas no ven ninguna mano, vale llevar la cabeza hacia ellas.
  - **Manos juntas** (la pasarela se estrecha entre rocas bajas) y **manos anchas** (una fila de rocas en medio): solo se
    juzga si se ven las dos muñecas; si no, se da por buena.
  - **Trepar**: en la dura, en una cuesta empinada (con «Sendero con cuestas»), cada vaivén de la cabeza al ir mano a mano
    empuja como una flexión.
  Los retos (viga, valla, rendija, manos), si fallas: frenas a la mitad y se rompe la racha, sin vidas; los premios (frutas,
  uvas, seta), no frenan.
- Travesía de plataformas, **volando** (elegido por el usuario de las propuestas: A, B y C; «Volando», con «Flexiones»): vuelas
  por encima del recorrido (unos 6 m; los árboles, debajo) como un planeador, sin pasarela salvo al salir y ante cada cofre,
  donde te posas. Lo que hay que ver va **por debajo de ti o sube desde abajo** (en plancha se mira al suelo).
  - **A, en plancha** (la base; afinado con `docs/PLAN-VUELO.md`, «aplica todas tus sugerencias»): **la cabeza es la palanca**,
    respecto a un centro que no se mueve en el aire. **Escorarte es la posición de lado**: tanto te escoras, tanto te apartas
    y, al volver al centro, el vuelo vuelve; el mundo se desplaza a tu lado. **Sin sacudidas** (pedido del usuario: costaba alinearse con las frutas): lo que pide la cabeza se suaviza y el vuelo
    arranca y frena suave, a los lados y al subir y bajar; las frutas del aire, algo más fáciles de coger. **Con inercia**
    (pedido del usuario: «un ligero movimiento lateral me aparta bruscamente de la hilera de frutas… el giro es una sacudida
    que se frena en seco»): el vuelo va hacia donde pide la cabeza como un ala, no como un cursor: arranca suave, al volver
    al centro sigue un instante y se asienta pasándose apenas; y cerca del centro es más fino (un poco de cabeza, un poco de
    vuelo). **Deprisa, deprisa** (pedido del usuario: para esquivar algo rápido): moviendo la cabeza deprisa responde algo
    más vivo (hasta un 60 % más; con el triple de antes, cada gesto era un latigazo). **Suave cerca del centro** (corregido por el usuario:
    «hipersensible»): 2,5 cm sin efecto y del todo a un lado con lo que diga «Vuelo: recorrido de lado» (15 cm de serie, de 8
    a 30: más, menos sensible); el asistente lo cambia a tu gusto. **La sensibilidad de cada eje, en los ajustes** (pedido del
    usuario como desarrollador): «Vuelo: recorrido de lado», «Vuelo: recorrido para bajar» (13 cm de serie), «Vuelo: recorrido
    para subir» (la pica, 18 cm), «Vuelo: fuerza del aletazo» (100 %) y «Vuelo: velocidad al subir y bajar» (100 %).
    **La altura, con media flexión** (elegido por el usuario entre tres: la reglilla de altura no respondía a la cabeza con el
    aleteo): **aguantando a media flexión vuelas recto**; con los brazos estirados (la cabeza arriba), **subes**; con el pecho
    más abajo de la mitad, **bajas**, más deprisa cuanto más lejos (la mitad, la de «Vuelo: recorrido para bajar»). Al
    despegar subes solo hasta la altura de vuelo. **La pica frena** (y manda: en pica ni subes ni bajas). Una explosiva, un
    empujón hacia arriba (nunca hace falta); de canto, un **giro** (se llamaba «tonel» y, con los barriles de los premios,
    se entendía como un barril que no estaba). Los otros mandos, para comparar en «Vuelo: mando de altura»: **posición** (tu altura sale de tu pecho; la pica sube) y **aleteo** (cada flexión, un aletazo; abajo quieto,
    el picado).
  - **Acelerar y frenar con la línea de las manos** (propuesto por el usuario: «las gafas detectan las manos que están en el
    suelo»): con las dos manos apoyadas y a la vista, **la cabeza por delante de la línea que las une acelera** (cuanto más
    adelante, más deprisa: hasta la mitad más que la máxima, sin necesidad de flexiones, como el peso adelante en una plancha)
    y **por detrás frena** (la pica también, porque echa la cabeza atrás: sigue valiendo). **Se lee lo que te echas adelante o
    atrás respecto a como sueles estar** (con la caja negra del usuario: con una referencia tomada una sola vez, bastaba
    recolocarse un palmo para que el juego leyera «atrás» y frenara del todo durante minutos, sin dejar subir): la referencia
    te sigue despacio (unos 8 s), así que recolocarte se olvida solo y un gesto se lee siempre. El vaivén de cada flexión no
    acelera (se suaviza y hay 5 cm sin efecto). Si las gafas no ven las dos manos, se mide respecto al centro del vuelo. **De
    lado y adelante se mide el cuello, no las gafas** (pedido del usuario: «girar la cabeza no debería hacer que el vuelo
    gire»): girar la cabeza para mirar no te desvía; te desvía mover el cuerpo a un lado. Vale también sobre el mapa.
  - **Que se vea lo que haces**: tu **sombra** de ave en el suelo, con el pico hacia delante (se ladea con la escora, se pliega al picar, se abre en pica
    y bate en cada aletazo); **sin alas** (corregido por el usuario con su vídeo: pegadas a la cabeza salían delante y detrás
    y tapaban la vista); el viento al picar, un golpe de aire al aletear y un siseo al frenar; la **ventana de cada reto**: un **marco verde brillante con flechas que señalan hacia
    dentro**, «pasa por aquí» (opción A del usuario: las franjas de luz se veían azul pálido y no se entendían), bajo el
    puente, al lado libre de la columna y en la raja de la grieta; y **dos reglillas** en el suelo, por delante de las manos (dónde vas de lado y
    a qué altura, con la ventana del reto que viene en verde: «Vuelo: instrumentos», de serie sí).
  - **El asistente del vuelo** (elegido por el usuario: «paso a paso con preguntas»; sustituye a la práctica de vuelo, que
    empezaba sola en pleno vuelo y no se entendía): **solo la primera vez** (pedido del usuario: que no salga siempre; al
    empezar ya cuenta como visto) y **cuando tú quieras**: «Vuelo: asistente en la próxima partida» (se apaga solo) o, desde
    la pausa, «Ajustar el vuelo» (en el próximo cofre); ya calibrado y antes del primer tramo, **con el mundo esperando** y
    volando en el sitio: te explica cada movimiento (de lado, subir y bajar, frenar con la cadera arriba y de canto), lo
    pruebas y pregunta **«¿Cómo lo has notado?»** con tres teclas, **Demasiado · Bien · Poco**, que se pulsan con una mano:
    Demasiado lo hace menos sensible y Poco, más (cambian «Vuelo: recorrido de lado / para bajar / para subir» o la fuerza
    del aletazo), y se prueba otra vez; Bien, al siguiente. Al acabar, cómo se vuela, y sigues en el aire hasta que empieza
    el tramo.
  - **Los retos, a la medida de los gestos**: el tiempo antes de cada uno es el de su gesto (la grieta, 4 s; el puente y el
    aro, 3 s; lo demás, 2,4 s; en el primer tramo, un 40 % más; «Volando: tiempo entre retos» y el rango); dos seguidos que
    piden ir arriba y abajo, el doble; el primer tramo, solo premios (aros, corrientes y frutas); columnas y puentes desde el
    segundo; grietas desde el tercero; y cada ventana se alcanza con medio gesto.
  - **B, con la tabla de equilibrio** («Volando: con tabla de equilibrio»): inclinarla a un lado (una muñeca más baja) se suma
    a escorarte (solo con las dos muñecas a la vista y estables, y pasados unos 2°) y echar el peso adelante baja en proporción.
  - **C, la pica**: subir la cadera (la cabeza atrás) frena en el aire y remonta, en proporción.
  - Los retos: **aros de luz** que flotan bajos (por dentro, en picado; **grandes, y al pasar por uno se abre a tu alrededor y
    se desvanece, con chispas doradas delante, sonido y vibración**: pedido del usuario, era poco satisfactorio), **columnas** de roca (escorarse al otro lado),
    **puentes** de roca (picar para pasar por debajo), **grietas** en una pared de roca (de canto, por la raja), **corrientes
    de aire** (te suben sin aletear) y **frutas en fila**. Las columnas, los puentes y las grietas, si fallas: frenas a la mitad
    y se rompe la racha, sin vidas; los aros, las corrientes y las frutas son premios. Sin jefe ni barriles.
  - **Aterrizas tú** (pedido del usuario: el juego tomaba el control demasiado pronto y te bajaba a la pasarela): ante cada
    cofre, un **marco verde tumbado en el suelo** marca dónde posarte; sobre esa zona (los últimos 22 m) puedes bajar hasta el
    suelo y, al tocarlo, te posas («¡Buen aterrizaje!», con puntos). Solo si llegas a los últimos 5 m aún en el aire, te baja
    el juego. **El portal entre mundos, a tu altura** (pedido del usuario: quedaba abajo y nunca se cruzaba): volando, se
    pone delante de ti y sigue tu altura, suave, para que lo atravieses. **Las frutas suenan al cogerlas** (pedido del
    usuario: sin sonido no se sabía si se habían cogido), también en la Travesía a pie.
  - **Sobre el mapa** (pedido del usuario: «volar por Google Maps 3D» con los movimientos del vuelo; vía A, Cesium ion, con su
    cuenta gratuita): con una ciudad en «Volando: sobre el mapa» (Madrid, París, Nueva York o Roma) y la clave de Cesium ion del
    jugador en la página («Volar sobre el mapa»: cada jugador, la suya; no va dentro del juego publicado), en vez del recorrido
    se vuela sobre el mundo de verdad (los mapas 3D de Google). **Vuelo libre** (pedido del usuario: «explorar con su cuerpo
    volando, sin límites»): sin tramos, cofres, mundos ni portales (la ronda no se acaba sola: se acaba desde la pausa), y por
    todo el mundo, empezando en la ciudad elegida.
    - **Solo el cielo y el mapa** (pedido del usuario: se mezclaba un campo alrededor de Nueva York): sin foto de fondo, valle,
      luciérnagas, estelas de viento ni la plataforma de los pies; el cielo, azul y, cuanto más alto, más oscuro, hasta el negro
      del espacio.
    - **Sin techo** (pedido del usuario: «incluso a la estratosfera»): cuanto más alto vas, más deprisa subes y más deprisa
      avanzas (a ras de ciudad, como un ave; desde el espacio, países enteros).
    - **La altura, con la flexión entera** (pedido del usuario: «elevarme al estirar los brazos… una caída en picado bajando al
      suelo en la flexión»): con **los brazos estirados, subes**; a **media flexión** (la cabeza de un palmo a un palmo y medio
      por debajo), **recto**; **más abajo, bajas**, más deprisa cuanto más bajo; y con **el pecho en el suelo, el picado**
      (bajas a toda velocidad y ganas marcha). Aquí no cuentan «Vuelo: recorrido para bajar» ni la pica: cuenta lo alta que va
      la cabeza entre el suelo y arriba de tu plancha, que **se afina sola** (si calibraste algo encogido, en cuanto estiras
      los brazos de verdad esa es la nueva altura de arriba). **Vuelo rasante**: el suelo y los tejados te sostienen a 7 m.
    - **La marcha, acumulativa** (pedido del usuario): **cada impulso brusco hacia delante es una marcha más** (hasta 8; con su
      vibración, su golpe de aire y «¡Impulso! Marcha 3») y **se mantiene** aunque vuelvas a tu sitio; echado adelante y
      aguantando, sube poco a poco; **echado atrás, frenas** (más cuanto más atrás, hasta pararte: «Frenado · un impulso
      adelante para arrancar»). Empiezas en la primera.
    - **Con inercia, como un ave** (pedido del usuario: «el giro es una sacudida que se frena en seco»): escorarte te ladea y el
      ladeo te hace virar; entra y sale del viraje suave y, al enderezarte, sigues virando un poco. El horizonte se ladea al
      virar (unos 9°; «Volando sobre el mapa: ladearse al virar» lo quita si marea). Subir, bajar y la marcha, igual: sin
      tirones.
    - **No se atraviesa nada** (pedido del usuario: «si me tropiezo con un edificio, entro dentro de él»): el suelo y los
      tejados te sostienen (nunca a menos de 7 m) y ante una pared frenas hasta pararte a unos metros («¡Un edificio! Vira o
      sube»).
    - **Los aros, por encima de los monumentos** (el usuario los veía enterrados en edificios: estaban al otro lado de la
      ciudad, con el este y el norte al revés): cada aro, grande (40 m de radio), con su borde de abajo 30 m por encima de lo
      más alto que tenga debajo, de cara a ti (se entra por donde vengas) y con un haz de luz hacia arriba que se ve de lejos.
      Solo cuenta si pasas por dentro (su nombre, puntos, sonido y vibración); no hay aros fallados: el que viene espera. El
      marcador dice a cuánto está y si hay que subir o bajar. **La flecha verde y los créditos, sin estorbar** (pedido del
      usuario: molestaban, grandes y justo delante de la cara al mirar abajo): la flecha, pequeña y más adelante en el suelo,
      **solo sale cuando el aro no te queda de frente** (yendo hacia él no hace falta); los créditos del mapa, pequeños y
      hacia los pies, bajo el cuerpo.
    - **La nitidez** («Volando sobre el mapa: nitidez»: Fluido, Normal, Alta de serie y Máxima) y empiezas a 260 m del suelo
      (desde más alto la ciudad se ve mejor: de cerca, los edificios de Google se ven algo derretidos). **Primero lo de cerca**
      (con el registro del usuario: pidiendo la ciudad entera hasta el horizonte había siempre más de 1.000 trozos esperando,
      lo de debajo llegaba lo último y el juego iba a 17 imágenes por segundo): solo se pide lo que se va a ver, lo más
      cercano primero; se ve hasta unas 30 veces tu altura (a 260 m, unos 8 km), con **calima** al fondo; y mientras hay cola
      la nitidez se afloja sola (volando deprisa, algo menos de detalle; al ir despacio, se afina).
    - **Desde cualquier lugar del mundo** (elegido por el usuario: «1 y 2»; «¿por qué hay que limitar a ciudades concretas?»):
      en «Volando: sobre el mapa», además de las cuatro ciudades, **«Tu lugar»** (unas coordenadas o un enlace largo de Google
      Maps pegados en la página, en «Volar sobre el mapa» → «Tu lugar»; viaja con la sincronización) y **«Donde lo dejaste»**
      (donde acabó tu último vuelo, a la altura y con el rumbo que llevabas). Desde un lugar no hay aros ni flecha: vuelo
      libre, y el marcador dice por dónde vas (las coordenadas) y la marcha. Empiezas a 260 m sobre lo que haya debajo, sea
      una playa o el Everest. Los aros siguen solo en las ciudades.
    Los créditos del mapa («Google», lo exigen) se ven hacia los pies, al mirar atrás. Solo en la Travesía (en Barras no sale). Sin clave o
    sin de dónde salir, la Travesía de siempre. *En pruebas* hasta que el usuario lo dé por bueno en las gafas.
  - En la dura, sin flexiones un rato vas perdiendo altura poco a poco (nunca te caes); en la suave, el vuelo la mantiene. La
    caja negra del vuelo (`reparenaxr-flybox`, con el diagnóstico) graba los últimos 40 s para afinar los números con tu vuelo.
- Travesía de plataformas, **el desprendimiento** (pedido del usuario, para la plancha: mirando al suelo no se veían las rocas):
  donde van a caer, una **sombra en el suelo** que crece y se oscurece mientras caen. Y **lo que se coge con la cabeza**
  (frutas, barriles) se encoge al llegar a los ojos y desaparece a menos de 12 cm, como las chispas.
- Travesía de plataformas, **las cuestas** (elegido por el usuario: «el terreno entero ondula», para esforzarse más o menos):
  el sendero, el suelo, el césped y el paisaje suben y bajan juntos entre los retos; **cuesta arriba cada repetición te lleva
  menos lejos y cuesta abajo más**, con más inercia (sin repeticiones te sigues parando, también bajando). Lo que pide suelo
  llano (el cofre, el jefe, los huecos, las plataformas, los túneles, los islotes, el trampolín, la bifurcación) queda llano
  y a ras; cada colina sube y vuelve a bajar (la ronda no se alarga). El risco, lo más escarpado. El horizonte no se inclina
  nunca. *En pruebas*: «Sendero con cuestas» las pone (apagado de serie hasta que el usuario lo vea en las gafas y lo dé por
  bueno).
- Travesía de plataformas, **en zancada** (pedido del usuario; elegido de las propuestas): se juega con «Zancada», de pie con
  una pierna delante, en los cuatro mundos y con sus jefes, con **dos formas** (el mismo ajuste «Avance solo»): la **dinámica**,
  en la que cada bajada (sin dar pasos) te empuja, y la **estática**, en la que el recorrido viene solo. Bajar, agacharse;
  inclinar el tronco a un lado (algo menos que un paso), apartarse; un salto corto, saltar; bajada honda y salto, el supersalto;
  los brazos en cruz, planear; el tronco adelante, un acelerón. Sin túneles ni burpees. **El cambio de pierna** (opción 1 del
  usuario): las gafas no ven las piernas, así que el juego avisa («¡Cambia de pierna!») cada **«Zancada: bajadas con cada
  pierna»** (ajuste del usuario, 10 de serie) y confía en ti; en la estática, también si pasa un rato sin bajadas.
- Siempre en Cómic. Cada repetición empuja por un sendero del bosque; sin repeticiones, te paras. La velocidad sale del
  ritmo de las repeticiones y de lo hondo que se baja (más rápido e intenso, más deprisa). Más deprisa que al
  principio (es una prueba física: hasta 2 m/s por la «Velocidad de avance», de 60 a 200 %, 130 % de serie; con el turbo, un 20 % más), sobre una plataforma quieta bajo los pies.
  Turbo por racha: seis repeticiones seguidas a buen ritmo lo encienden (más deprisa, puntos ×2, estelas de viento); una floja,
  3 s sin ninguna o chocar lo apagan. El
  sendero serpentea (el mundo gira despacio a tu alrededor; «Sendero con curvas» lo quita si marea). Detrás, siempre paisaje.
- Cada oleada, un tramo con su paisaje (bosque, aldea, pradera del lago, pinar al atardecer), y se llama tramo (panel «TRAMO
  2 DE 5 · Aldea», las repeticiones que faltan en el marcador). El tramo no acaba a mitad de una parada, y las repeticiones
  hechas en una parada no cuentan para él. Los retos salen a lo lejos, entre la niebla (88 m), no de golpe cerca; la roca o
  el cofre que no se superan se apartan del sendero (nunca se atraviesan). Los retos piden **otro movimiento**
  que el que hace avanzar: con las piernas, troncos que saltar; con curl, ramas bajas para agacharse (frenan y rompen la
  racha, sin quitar vidas). Todo apoyado en el suelo, con su sombra.
- Paradas: el cofre con cadenas (se rompen con repeticiones de otro ejercicio; dentro, una llave —con tres, el tesoro— y
  una gema), el derrumbe (la roca, sólida —nunca se entra en ella; te paras a 1 m de su cara—, se embiste con zancadas: no se mueve con
  la zancada, y cada embestida —al llegar abajo y adelante, no al volver— la hace temblar y retumbar, y en la última se hace añicos que saltan por los aires), el arroyo sinuoso (de piedra en piedra con
  saltos; cada salto, el mundo baja y sube como si te elevara), el desfiladero que se desmorona (cada salto, al pilar siguiente; el de atrás se hunde) y los bandidos (solo
  esquivar: lanzan piedras con aviso largo —la alta, agacharse; la baja, saltar; la que va al cuerpo, apartarse— y, con 5
  esquivadas (6 desde el tercer tramo; encima, una bolita de vida por cada una que falta), caen muertos; cada esquivada les
  duele (gesto y quejido); al lanzar, voz de persona (nunca el siseo de las arañas), con su animación a su velocidad, la
  piedra desde su mano y en parábola; nada de puñetazos, que con el retraso de las manos en las gafas
  no daba tiempo; con la cabeza del personaje base y sin contorno). Lobos que te cortan el paso: salen a lo lejos, delante y a un
  lado (siempre a la vista: flecha roja encima, que se ve a través de rocas y árboles), y corren en diagonal a un punto del
  sendero por delante de ti; si llegas antes (con margen: basta con ir a su paso a buen ritmo; muerden a menos de 0,8 m),
  cruzan por detrás y se quedan atrás; si llegan antes, muerden. Se oyen: aúllan al salir, gruñen más fuerte según se
  acercan y rugen al morder. Sin enjambres.
- **No crear de cero enemigos ni elementos**: se usan los modelos que da el usuario (en `models/`); si no hay, se cambia
  el elemento. Las casas se montan con las piezas del Medieval Village.
- El marcador, siempre flotando a un lado (nada de columnas que vayan contigo). **En el lado despejado y más alto**
  (elegido por el usuario: el paisaje lo atravesaba y en el risco quedaba dentro de la pared): en el risco, siempre a la
  derecha, sobre el vacío; en los demás mundos, en el lado elegido, con el borde de abajo a 2 m (por encima de arbustos y
  rocas), y de ese lado el paisaje no pone nada alto (árboles, islotes, palmeras) que pase por él.
- El paisaje se dibuja todo junto, una pieza por modelo: que no pida más a la gráfica que el bosque de Combate.
- El agua, realista (no una mancha azul): ondas que el viento eriza a rachas, reflejo del cielo y destellos; en el río,
  corriente con espuma y estelas en las piedras.
- **Entornos de Combate** (elegidos por el usuario de las propuestas: «1 y 2»): además de la fortaleza, el bosque y la isla
  pirata, **los mundos de la Travesía**: el **risco** (una meseta de roca con la pared y los pinos a un lado y, al borde, el
  mar de nubes con agujas de roca), las **islas en el cielo** (una isla de hierba que flota, con su borde de rocas y otras islas
  a lo lejos) y **la aldea** (una plaza con casas alrededor, barriles a su puerta y el bosque detrás), con los kits que ya hay;
  «Alternar» pasa por todos. Y **la hora y el tiempo cambian con las oleadas** («Hora y tiempo con las oleadas», de serie): de
  día, por la tarde, al ocaso, de noche (con estrellas) y al alba, por turnos; a veces niebla, lluvia o (en el risco y la aldea)
  nieve; la oleada del jefe, con **tormenta** (relámpagos y truenos). El cielo, la luz y la niebla cambian suave entre oleadas.
  La lluvia y la tormenta, también en la fortaleza; con fondo realista, solo el tiempo (la foto no cambia de hora).
  **Un entorno distinto en cada partida** (pedido del usuario, «Entorno distinto en cada partida», de serie): otro reparto de
  árboles, rocas, casas e islas, otros desniveles a lo lejos (colinas y hondonadas pasadas las compuertas; donde se juega,
  siempre llano), el sol por otro lado y otra hora para empezar. Se prepara al acabar la partida anterior (en el menú), no al
  empezar.
- **El cementerio** (elegido por el usuario: «Sí, KayKit», la propuesta de los paquetes gratuitos; en Combate y Toques, en
  «Entorno (en VR)» y en el viaje por portales): de noche siempre (estrellas, niebla azulada y el cómic algo más oscuro), con
  una verja de hierro en corro abierta hacia las compuertas y su arco detrás, tumbas y lápidas a los lados y detrás, la cripta,
  farolas con calavera, faroles, velas, calabazas, árboles secos y, fuera de la verja, un bosque de otoño; y búhos. Del pack
  **Halloween Bits de KayKit** (CC0), que se baja desde las sesiones (está en GitHub).
- **Los esqueletos de KayKit salen del suelo** (de la misma propuesta): el **esbirro** (con hacha), el **guerrero** (espada y
  escudo) y el **mago** (bastón; ataca con un hechizo), del Character Pack: Skeletons de KayKit (CC0). No salen por las
  compuertas: **aparecen delante, a 5,5-8 m, saliendo de la tierra** (con su animación y un reventón de tierra) y, al acabar,
  echan a andar. Son la fauna del cementerio (con los zombis y los murciélagos) y se pueden elegir en Rivales; van con los
  ajustes de los zombis («Zombis: rapidez de gestos…»).
- **Viaje por portales** (elegido por el usuario: «que nunca tenga la sensación de pasar siempre por el mismo entorno»; en
  Combate y Toques, «Viaje por portales», de serie): cada **«Oleadas en cada entorno»** (2 de serie), al empezar la oleada, un
  aro de luz con su remolino llega desde el frente, te pasa por encima y, con un destello blanco, estás en otro entorno (la
  fortaleza, el bosque, la aldea, el risco, las islas del cielo y la isla pirata), en un orden distinto en cada partida y
  empezando en el elegido; el panel de la oleada dice adónde llegas. Los entornos del viaje se montan en el menú (cruzar no
  da tirones). Con fondo realista, no hay viaje.
- **Enemigos de cada entorno** (elegido por el usuario; Combate, «Enemigos de cada entorno», de serie): cada entorno trae su
  fauna en lugar de los marcados en Rivales: robots y diablillos en la fortaleza; zombis verdes, puglins, raptores y el
  demonio verde en el bosque; piratas en la isla; calaveras, demonios, yetis y cíclopes en el risco; aliens y demonios en las
  islas del cielo; zombis, calaveras y el lanzador en la aldea; y sus voladores. «Qué enemigos salen» sigue mandando.
- Fondos realistas (fotos de Poly Haven en `models/fondos/`, ver su `LEEME.md`): en la Travesía, uno por tramo; en los
  demás modos, «Fondo realista» (Opciones → Entorno, 7 para elegir). Solo paisajes abiertos, al fondo con el bosque de cómic
  delante: los de bosque por dentro, ciudad y playa se quitaron (lo cercano se veía plano, de cartón). En Arcos, con
  fondo, sin compuertas: avanzas por el paisaje de la Travesía.
- Su caricatura no habla de rayos: cada repetición empuja por el sendero.
- Los cofres (también el de Combate) dicen al aparecer qué hay dentro (en el marcador: no es un aviso de lo que viene); el de
  la Travesía, abierto, se esfuma con humo (no se aparta). **Al abrirse, lo que llevan sale flotando de su boca** (pedido del
  usuario: no se sabía qué contenían): un medallón por premio, con su dibujo y lo que es en grande (la llave n.º de 3, la gema,
  los puntos, las doradas del tramo, el tesoro; en Combate, la mejora, la vida o los puntos), uno tras otro, que sube en
  vertical y, arriba, se esfuma en chispas: recibido. **Sin el aviso grande de «¡Cofre abierto!»** (pedido del usuario: que se
  abre ya se ve y su letra pequeña no se leía). Medallones dibujados, no modelos: no hay llave ni gema en los kits.
- El césped del suelo gira y corre con el mundo (en las curvas, lo apoyado no patina sobre la hierba).


**Barras**
- **La aventura en la cuerda del remo invertido** (pedido del usuario; elegido de las propuestas: «A con tramos de B»; plan en
  `docs/PLAN-BARRAS-CUERDA.md`): una opción de Barras («Remo invertido: aventura en la cuerda», *en pruebas*), con **una
  paralela o dos**. Cuelgas boca arriba de un cable y **cada remo es un tirón** (corregido por el usuario: «no un movimiento
  constante»): subes mientras tiras, pegado a los brazos, y al bajar te lleva un poco la inercia, que se apaga; más remos, más
  deprisa. Si dejas de remar, **resbalas un poco** («mínimamente»: nunca más abajo del final del tramo anterior).
  **Un solo cable, del valle a la cima** (opción A del usuario, tras verla en las gafas: la cuerda «hacía pliegues
  antinaturales», como si tuviera anclajes suspendidos en el aire, y las plataformas no tenían sentido): un cable tenso, como el
  de un teleférico, de la estación del valle a la de la cima, sin torres ni apoyos por el medio y **sin pliegues** (su cuesta
  crece poco a poco, de unos 25° abajo a unos 48° arriba). **Cada tramo acaba en un cofre colgado del cable**, a un lado de las
  paralelas (no tropieza con las manos), que se abre al llegar; el último, en la plataforma de la estación de la cima. **La
  cuerda sube hacia tus pies** (corregido por el usuario con su vídeo: subía hacia lo alto de la cabeza y había que mirar hacia
  atrás para ver adónde ibas): tumbado, lo que se acerca se ve sin echar la cabeza atrás. El cielo sigue arriba (el mundo no se
  inclina: subir es que la montaña baje y venga hacia ti). Con dos paralelas, dos cables; con una, un cable por encima y la barra
  colgada de una polea.
  **Una montaña, de abajo arriba** (los mundos, en la opción A): según lo que llevas subido, debajo pasan **el valle** (prados con
  flores, el lago y bosquecillos), **el bosque** (pinares con claros, helechos y setas), **la garganta** (el río entre paredes de
  roca, con sus cascadas) y **la cima** (roca, peñas y hierba rala); se ven llegar y cambian poco a poco (al entrar en cada una,
  su nombre; sin portales ni destellos). Por zonas, no salpicado: los árboles, en bosquecillos. La montaña mide como poco 110 m
  de cable: en una ronda corta se sube solo su principio y la estación de llegada queda en un mirador. **Todo nace de algo**
  (idea 1 del usuario: las cascadas «parecían emerger de ninguna parte»): un manantial en la cima da un arroyo que cae en cascada
  por la pared de la cabecera de la garganta; cada cascada de sus paredes viene de un arroyo que corre por lo alto desde su
  manantial y, al pie, su agua corre hasta el río; el río baja siempre cuesta abajo por la garganta y el bosque hasta el lago del
  valle (sin garganta en la ronda, un arroyo del bosque llena el lago). El agua, realista (corriente, espuma en las orillas y al
  pie de las cascadas, reflejo y destellos; el lago, más claro en la orilla) y con bruma al pie de cada cascada. **Nada flota**:
  el suelo es la ladera de la montaña con el cauce del río y la cubeta del lago, y cada árbol y cada roca se apoyan en él (nunca
  en el agua, en una pared ni bajo la cuerda). **Fondo realista según la altura** (elegido por el usuario: «sigue tus
  propuestas», con la lógica del mundo real: «no pongas el fondo en el cielo»): la foto de la zona de cada tramo (el valle, la
  montaña, la cumbre), que cambia en el descanso; solo pone lo lejano (el cielo y las montañas del horizonte, siempre derecho y a
  la altura de los ojos, girada hacia donde subes); por debajo del horizonte, la montaña del juego y, más allá, **un mar de nubes
  en el valle** (las fotos están hechas de pie en un prado: sin él, se veía su hierba enorme). La bruma, del color del horizonte
  de cada foto. La pared rocosa vertical, para las dominadas.
  **Retos y premios** (los del plan, «sigue tus propuestas»): piden **otro movimiento que el remo** y llegan por donde se ven
  tumbado (desde lo alto o por el cable), sin aviso antes (al fallar, se dice cómo se hace): **el enjambre** baja por el cable
  hacia tu cara (**quédate abajo**, brazos estirados); **la ráfaga** cruza el cielo (**aguanta arriba**, pegado al cable);
  **la piedra** cae de lo alto hacia tu cara (**aparta la cabeza** a un lado); **el cable deshilachado** se pasa con **un remo
  explosivo**. Si fallas, frenas a la mitad y se rompe la racha, sin vidas. Premios: **frutas** junto al cable, que se cogen
  **subiendo el pecho** al pasar (se encogen al llegar a los ojos), y **el cofre de cada tramo**, que se abre al llegar y suelta
  sus premios flotando (los puntos y una gema). El primer tramo, solo frutas y enjambres; el cable roto, desde el tercero.
  **El jefe** (el dragón, en el último tramo, antes de la estación de la cima; con un solo tramo, sin jefe): te corta el paso (ni subes
  ni resbalas) y, casi encima de ti, escupe bolas de fuego con aviso (se echa atrás y ruge): **a la cara, aparta la cabeza**;
  **rasante por encima del cable, quédate abajo**. Tras tres, **se marea** y baja hasta encima de ti: **un remo explosivo o bajar
  con la carga aguantada (×2 o más)** le da; a la tercera, derrotado y se va. Si no le das mareado, se recupera; tras dos veces,
  vale cualquier remo (la pelea siempre se acaba). Si te da una bola, se rompe la racha, sin vidas. **El paisaje, ligero**: lo
  que se ve a la vez no pide más que el bosque de Combate (unos 50 árboles y 50 plantas).

**Repeticiones y disparo**
- Cada repetición (sentadilla, zancada…) carga **un disparo por mano**, como mucho uno por mano y sin acumular.
- Con las manos desnudas no se dispara pellizcando. Se lanza con una **sacudida de la mano hacia el enemigo**: puede
  salir de la cadera y hacerse subiendo o bajando en la sentadilla. Sin sacudida, la carga se queda en la mano. El rayo
  va al enemigo más cercano a la dirección de la sacudida, sin exigir puntería exacta.
- El curl con kettlebell del usuario es con la pesa agarrada por el asa con las dos manos (los puños juntos, la bola
  colgando debajo): es el «Curl con barra o kettlebell». Las gafas confunden las manos pegadas: el curl y el press con
  barra siguen las dos manos como una sola pesa, y todo lo que se hace con las dos manos juntas en una pesa (elevación
  frontal, swing, sentadilla con press y con elevación) descarta los saltos imposibles de una mano (`HF`). En el
  curl y el press con barra, dos manos juntas se confirman entre sí, y si se ven separadas vale la que se mueve (las gafas
  dejan quieta la que pierden).
- **Curl con barra o kettlebell con «Manos: filtro nuevo»** (en pruebas, RepArena XR; decidido por el usuario con su caja
  negra de las gafas, `docs/PLAN-CURL-BARRA.md`): una mano que reaparece no cuenta hasta verse estable un instante; una mano
  que no casa con la otra (otra altura o mucho más separada que de costumbre: la que vuelve de pulsar la pausa) no está en
  la pesa; **si se pierden las dos subiendo (opción A)**, el rayo no sale al perderlas: si reaparecen arriba, cuenta y sale al
  bajar; si reaparecen abajo antes de 1 s, no cuenta; si no reaparecen en 1,5 s, cuenta; y **al quitar la pausa** la pesa
  empieza de cero (no dispara lo que llevaba antes de pausar). Apagado, como arriba.
- **Curl a un brazo (mancuerna) con «Manos: filtro nuevo»** (lo mismo, con su caja negra: un rayo al llegar arriba en dos
  partidas): la mano que reaparece o da un salto imposible no cuenta hasta verse estable un instante (ni para el rayo ni
  para lo más bajo del recorrido); perdida subiendo, la opción A, como en el curl con barra; y al quitar la pausa, de cero.
- **Con la mano escondida nunca dispara** (opción 1 del usuario, con la segunda caja negra de la mancuerna; con «Manos: filtro
  nuevo», en los dos curls): aguantando arriba, si las gafas pierden la mano, la carga se guarda y el rayo sale al volver a
  verla bajando o ya abajo (sustituye a «arriba, junto a la cara, también sale con la carga que llevaba»); perdida subiendo
  más de 1,5 s, cuenta —sale la bola— y el rayo, igual, al verla bajar. Así cada curl da un solo rayo y siempre al bajar.
- **Press de pecho en el suelo** (elegido por el usuario de las propuestas: «solo press de pecho en el suelo»; solo RepArena
  XR, en Combate): boca arriba con una mancuerna en cada mano. Se siguen **las manos** (boca arriba las cámaras las ven muy
  bien), como la cabeza en la sentadilla: con los brazos estirados arriba (la postura de partida, donde se calibra), bajar las
  pesas al pecho («Bajada en el press de pecho», 28 cm de serie) carga; aguantando abajo, ×2, ×3 y ×4; al subirlas, el rayo
  sale hacia el cielo, al volador más cercano (los enemigos son los voladores, que llegan por arriba). Una mano que las gafas
  pierden no se inventa. Su cortinilla, la de las flexiones hasta que el usuario dé la suya.
  **Los voladores bajan del cielo** (pedido del usuario: tumbado no se ven las compuertas): salen muy alto, casi encima de ti,
  y bajan despacio, frenando, hasta quedarse sobre tu cara (a 2-3 m); pasado un momento se lanzan a morderte y, tras morder
  o con un disparo, vuelven a subir; derribados, caen a un lado. **Nada tapa su camino**: lo que hay encima de ti queda
  libre; hacia los pies van, por orden, **la bola** (sobre el pecho, por encima de las pesas: se ve mirando arriba; antes
  quedaba entre las piernas), los avisos y, más abajo, **el marcador** (a 40° del suelo, de cara a ti), y por ese lado los
  voladores no bajan.
- **Glúteos** (elegidos por el usuario de las propuestas; solo RepArena XR, en Combate): la **zancada lateral** (paso largo a
  un lado y bajar sobre esa pierna: cuenta si la cabeza baja lo pedido y se aparta a un lado, con carga ×2-×4 aguantando
  abajo como la zancada; luego, al otro lado) y el **patinador** (saltos de lado de una pierna a la otra: al salir de un lado,
  la carga; al caer en el otro flexionando la pierna, el disparo; andando o cayendo tieso no cuenta). Sus cortinillas, las de
  la zancada y la sentadilla con salto hasta que el usuario dé las suyas.
- El press de hombro, el press con barra y la flexión en pica se quitaron (no se detectaban bien en las gafas); el leñador,
  porque no aportaba nada.
- **El manotazo en la plancha con un brazo** (pedido del usuario: obliga también a hacer el ejercicio): la mano levantada
  aparta a los bichos que se acercan, pero solo **si los toca de verdad y a golpe** (deprisa, hacia ellos o de arriba abajo
  encima): rozarlos, apoyar la mano o pasar cerca no vale. Sale despedido y deja de atacar (no le quita vida); a cada uno, un
  manotazo cada poco.
- Cargas ×2/×3/×4 aguantando la postura más dura, como en la sentadilla: fondos (abajo, codos a 90°), elevación frontal
  (arriba), antebrazos (la barra escurrida), dominadas y remo (arriba; al bajar, onda que con ×4 revienta también a los
  cercanos) y la plancha con un brazo (una flexión aguantada abajo carga ×2/×3/×4, con la bola a la vista; el brazo que se
  levanta después lanza esa carga: la bola se va a esa mano y el rayo sale siempre de la mano levantada, nunca de la bola).
- **Superman, «aguante que protege»** (elegido por el usuario: no le daba tiempo a hacer las repeticiones antes de que
  llegaran los voladores): el mismo movimiento. Al subir el tronco, la bola sale **entre las manos** (tumbado se mira al
  suelo) y crece mientras aguantas; cumplido el aguante, la bola se llena y, si sigues arriba, carga ×2, ×3 y ×4; **el rayo
  sale al bajar** (con ×4, además, una onda que alcanza a los cercanos). **Mientras aguantas arriba no te pueden tocar**: el
  que ya venía rebota. Tumbado, los voladores esperan a la vista el descanso («Superman: descanso antes de que piquen», de
  6 s en Recluta a 3,5 s en el rango más alto) y, si sigues sin subir, pican de uno en uno. Los voladores salen al ritmo de
  una repetición (lo que se aguanta más 3 s). **Esperan bajos, a ras de suelo y a 1-1,5 m por delante de las manos** (boca
  abajo se mira al suelo), y el marcador va delante, pasadas las manos, como el atril de la plancha (ergonomía, aplicada por
  el usuario: «aplica todas tus propuestas»; `docs/ERGONOMIA.md`).
- Superman: **con las manos apoyadas en el suelo no cuenta** (decidido por el usuario con su diagnóstico: el tronco tiene que
  subir solo): si las gafas ven una mano a menos de 9 cm del suelo, el aguante se para y avisa «Despega las manos». Sin ver
  las manos, solo cuenta el tronco.
- En Toques, **los objetivos salen de las compuertas** (pedido del usuario: aparecían a medio camino, poco realista): de la boca
  de la de su lado (en el centro, la del centro), arrancan despacio, cogen velocidad y llegan suaves, a su paso de siempre
  (salen antes). Boca arriba siguen bajando del aire (las compuertas quedan hacia los pies).
- En Toques, entre un toque y el siguiente hay que **volver a la postura de partida**. Un toque vale aunque el objetivo
  aún venga de camino. El oblicuo es un diamante a un lado, junto a la rodilla, que se toca con la mano contraria
  (cruzando: gira el tronco); «Manos a rodillas», un diamante delante de las rodillas (las gafas no ven las rodillas).
- Con espadas no hay diana ni láser, y los enemigos van directos a por el jugador.
- Inchworm: se sigue la **cabeza**, no las manos. Llegar con la cabeza a la línea luminosa del suelo (donde queda en la
  plancha, según la altura) carga el rayo; volver andando con las manos hasta la salida y ponerse de pie dispara y saca la
  onda, que se ve y se oye bien y lanza a los bichos por el aire. Una barra en el suelo enseña lo que avanza la cabeza.
  Cada flexión en la plancha, al final del recorrido, da más fuerza a la onda (×2, ×3, ×4: más lejos, más fuerte y con
  daño); la onda, de colores vivos y levantando polvo a su paso. Los bichos que mueren en el aire caen al suelo.
- Arcos de semipuente (`arcLow`): inclinados tan bajos que hay que apartarse al lado alto y bajar hasta apoyar una mano en
  el suelo; llegan más despacio, con su bocina y la huella de la mano en el suelo (sin aviso de texto: decidido por el usuario).
- El marcador de los ejercicios de suelo (flexiones, planchas, inchworm) es sólido: los bichos lo rodean. Va apoyado en el
  suelo como un atril, de cara al jugador y con el borde de arriba levantado a **45°** (elegido por el usuario: tumbado, los
  avisos del suelo lo tapaban). **La plancha lateral**, igual: el atril delante, bajo la línea a las compuertas. **Boca arriba**
  (los abdominales de Toques), en el techo, sobre la cara (ergonomía: a un lado no se veía; `docs/ERGONOMIA.md`).
- **[PR 30: portado de RepArena (opción B del usuario: con lo de serie de IWSDK las manos iban peor): la mano perdida sigue su gesto o la coloca el cuerpo, que se pide al entrar con «Manos con el cuerpo»; no se pinta ni pulsa menús (`src/input/hand-filter.ts`)]** Manos perdidas (solo manos desnudas): la que iba deprisa sigue su gesto un instante (`h.est = 'pred'`) y, con «Manos
  con el cuerpo» (Ajustes → Menú, de serie) y si el navegador da el cuerpo, la perdida se coloca en la muñeca del
  cuerpo con su última forma (`h.est = 'body'`). Ninguna mano con `h.est` se pinta (salían volando hacia delante o delante
  de la cara): la que se ve se queda donde se la vio 0,3 s y desaparece. Un salto imposible de la muñeca (más de 30 cm entre
  dos posturas, `HSM.jump`) no se pinta hasta que lo confirma la postura siguiente. Una mano con `h.est` no pulsa menús ni coloca
  barras: lo que necesite la mano de verdad tiene que saltársela; al volver a verla, `h.back` (ese fotograma). En los
  ejercicios que se hacen con las manos (`handEx`: los de pesa —curl, curl con barra, elevación frontal…— y la plancha
  con un brazo) no se inventa ninguna mano: con los brazos abajo las gafas las pierden a menudo, y la inventada subía sola
  y contaba curls y disparos que no se habían hecho. Fuera de la partida (menús), tampoco.
- **[PR 30: portado de RepArena (opción B del usuario): los guantes se pintan con la mano suavizada (`J.s`, `J.sq`) y la que se pierde se queda 0,3 s donde se la vio; con «Mano lisa», la de IWSDK opaca (esa la pinta IWSDK, sin suavizar)]** La mano que se pinta usa la posición suavizada (`J.s`) y también el giro suavizado (`J.sq`, mismo filtro): con el giro
  tal cual, la palma y las falanges temblaban. Solo para pintar: el juego sigue con lo que dan las gafas.
- **[PR 30: todo como en RepArena (opción B del usuario): la lectura, el suavizado, el pellizco (las puntas del pulgar y el índice a menos de 2 cm) y el filtro `HF`, comparados con su código (`tests/compare/hands.compare.test.ts`, `standing.compare.test.ts`); la sacudida y el puñetazo, desde el PR 3]** La lectura de las manos (suavizado, filtro `HF` de las dos manos juntas, lanzamiento, puñetazo, pellizco) está como antes
  de la auditoría externa: sus cambios (solo posturas nuevas, pellizco con puño, salto de la mano recuperada) empeoraron
  mucho los dos curls en las gafas y el usuario pidió quitarlos. No vuelvas a tocarla sin probarlo con él en las gafas.
- Espada: corta solo con el brazo (la mano también a ≥ 0,6 m/s, `SWORD_ARM`); el bloqueo, con la hoja en la marca en los
  últimos 0,35 s (`BLOCK_LATE`), y la marca se pone turquesa al cubrirla. Arriba del curl y la elevación frontal, chispa y
  chasquido (`topCue`); el disparo sigue al bajar (por las cargas). Puñetazo y tajo empujan también hacia el lado del golpe.
- **[PR 3: la mano que agarra el mando es la de IWSDK (`AnimatedControllerHand`, arreglada en `src/input/controller-hand.ts`); las armas, en el PR 9]** Mandos como manos: con mandos se ven manos en todo el juego (en la partida, con pistolas o espada, el arma). En
  sentadillas y zancadas: gatillo + agarre = puño; el rayo se lanza
  apuntando con la mano y con el gatillo. Con mando, la puntería por defecto es «con las manos».

**Dificultad**
- Sube **poco a poco de una oleada a otra**, no dentro de cada oleada: que se note un poco, pero que sea real.
- Las mejoras, sorpresas y demás premios (`src/79_perks.js`) nunca dan más cargas ni más daño: cambian el ritmo, la
  defensa o los puntos, pero las oleadas piden las mismas repeticiones.
- Para animar a volver (`src/73_career.js`): experiencia y nivel con título y colores desbloqueables (solo se ven),
  misiones del día con su cofre (+100 XP, un escudo de racha —como mucho tres: un día sin entrenar se gasta solo y la racha
  sigue— y un color), campaña por modo y ejercicio (7 regiones, una por rango, con jefe en el quinto nivel,
  estrellas) y, en Progreso, tu semana y tu mejor ronda. Los ajustes de un nivel de la campaña no tocan los tuyos.
- El resumen de la ronda, lo esencial (opción A elegida): dónde acabó y el ejercicio, el número grande, la medalla y las
  perfectas, tres casillas (puntos, tiempo y kcal), un solo logro (el más importante) y dos botones, «Otra ronda» y «Menú
  principal». Nada de nivel, semana, mejor ronda, derribados, precisión ni combo.
- Con cartas de mejora por elegir, la oleada siguiente **espera a que el jugador elija**. Salen como mucho **cada tres oleadas** y solo
  si se las gana (pocos golpes en esas tres).
- Entre oleadas: fundido leve (sin que desaparezca la escena) y panel grande con la oleada que empieza y los puntos;
  mientras se ve, no sale nada (ni enemigos ni orbes).
- Arcos: el arco de plancha llega más despacio (velocidad propia), con su bocina (sin aviso de texto: decidido por el
  usuario) y sin que lo adelante nada.
- Arcos: la fiebre se ve muy roja (columnas de luz, pista y arena) y con tormenta roja en el cielo de todos los entornos
  (nubarrones, niebla roja y cerrada, relámpagos); empieza de golpe con un relámpago enorme y un trueno, también con música,
  y un velo rojo tiñe toda la vista (por debajo de los paneles). Con música, el compás se ve (♪ y destellos en cada pulso).
- Arcos va **«Al fallo» de serie** (reto de aguante).
- Arcos: el marcador **no anuncia lo que viene** (derecha, izquierda, salta, plancha, maza, baja…): despistaba, y se
  entrenan los reflejos.
- Arcos: entre dos vallas seguidas, al menos 1,1 s (si no, había que volar).
- Arcos: las vallas tienen su propia altura del salto (6 cm de serie, en «Tu cuerpo (recorridos)», a la vista del jugador),
  aparte de la de Toques. Hay ráfagas de vallas (3 o 4 seguidas) y burpees (arco de plancha y, enseguida, una valla).
- Arcos inclinados: agacharse en el centro no vale; hay que apartarse hacia el lado alto (pared de energía bajo el lado
  bajo hasta pasado el centro) y bajar sobre esa pierna.
- Arcos: cuanto más difícil (el rango), el láser oscila más amenazante (más pista, más deprisa, con amagos), pero a una
  velocidad que se pueda sortear (como mucho unos 2,5 m/s de lado). **Te busca** (pedido del usuario: los láseres no
  obligaban a esquivar nada): al empezar a frenarse (el último segundo y medio) se fija donde está tu cabeza —quedarse
  quieto ya no vale nunca: hay que apartarse a tiempo— y, ya frenado, se mece un poco hasta el último medio segundo.
- Arcos, burpee: tras el arco de plancha, la valla llega con tiempo para levantarse (3 s; **con la dificultad, cada vez
  menos, hasta 2,3 s**: más esfuerzo, pedido del usuario).
- Arcos: **el arco de plancha se endurece con la dificultad** (pedido del usuario: «siempre llega igual de lento»): con el
  rango y la dificultad creciente llega hasta un 60 % más deprisa, **nunca a más de 6,5 km/h** (nunca tan rápido como los
  láseres de las sentadillas), y tras él hay algo menos de tiempo para levantarse (de 2,5 s a 2 s).
- Arcos: **las cuchillas** (pedido del usuario: «hachas o cuchillas de cierto tamaño… su vuelo no puede ser ni simple ni
  totalmente impredecible»; «Cuchillas que vuelan», 15 % de serie): hojas de 85 cm (con 1,4 m, el usuario las veía
  descomunales) de los kits que ya hay (no hay hachas: el
  sable del Capitán, la espada del tiburón y el ancla de la isla pirata, elegidas por el usuario) girando hacia ti. **La
  hélice**, en horizontal a la altura de la cabeza: agacharse. **La rueda**, de canto cerca del centro: apartar el tronco a
  un lado. **La rasante**, a ras del suelo: saltarla. Entran desde un lado en curva, ondulando, y **en el último segundo y
  pico se asientan en su sitio** (se leen a tiempo, no desde lejos); con la dificultad ondulan más, la rueda a veces amaga
  (cambia de lado una vez, antes de asentarse) y llegan en ráfagas de dos o tres. Si te dan, como un arco (vida y racha).
  Mientras sus modelos no han cargado, en su lugar sale la maza.
- Arcos: **los robots lanzan las cuchillas** (pedido del usuario: «que volvieras a traer a los robots de RepArena»): dos
  Destructores, uno a cada lado del fondo de la pista, esperan a su aire y, al salir una cuchilla de su lado, la lanzan por
  encima del hombro con un rugido metálico. Solo con «Cuchillas que vuelan» por encima de 0.
- Arcos: **los orbes, gemas doradas talladas** (pedido del usuario: «más atractivos, más relieve, más sombreado»): con caras
  de varios tonos que giran y atrapan la luz, un núcleo de luz, un halo con destello y sus dos aros; al cogerlos, muchos más
  destellos (oro, blanco y turquesa) y el sonido más fuerte.
- Arcos: las paredes de los obstáculos con hueco, rojas casi opacas con franjas, y el canto del hueco en verde: que no haya
  duda de hacia dónde volcar el cuerpo. **La de los arcos inclinados, un campo de fuerza** (elegido por el usuario entre cuatro
  modelos: el rojo liso era «horrible»): una lámina translúcida con panal de hexágonos y una onda que la recorre, bajo el lado
  bajo y también por encima de la barra (arriba parecía hueco); metiéndote en él, parpadea. El hueco bueno, con su canto verde.

**Enemigos y física**
- Los enemigos **nunca atraviesan** compuertas, piedras, cajas ni otros sólidos. La bola de energía también es un
  obstáculo: la rodean.
- Se mueven con naturalidad y agresividad, sin chocar entre ellos.
- **Los que caen se quedan quietos y en el suelo** (pedido del usuario: el zombi seguía andando tumbado y quedaba algo
  elevado): al morir salen despedidos y caen a ras del suelo; con su animación de morir, se desploman; sin ella (el zombi),
  quietos en la postura del golpe y de espaldas. Al rato se desvanecen.
- Parados esperando su turno, bailan al compás (el marcado o el de la canción de Spotify), también los robots.
- El lanzador tira algo más deprisa (y más a menudo) cuanto más difícil, poco a poco (como mucho un 40 %).
- **Enemigos de élite** (elegidos por el usuario; Combate, «Enemigos de élite», de serie): desde la segunda oleada, algunos de
  los de tierra salen con un rasgo, cada vez más a menudo (como mucho uno de cada tres; nunca dos seguidos), y se distinguen
  por un **aro de color a sus pies** que late: **rápido** (rojo: se mueve y golpea mucho más deprisa), **gigante** (naranja:
  más grande, lento y pesado; quita una vida más), **con escudo** (turquesa: una burbuja que para los disparos; se rompe con
  tres o, de golpe, con una carga ×3, que además le da), **que se divide** (verde: al caer salen dos pequeños de una bolita
  de vida) y **que parpadea** (violeta: de vez en cuando se esfuma un instante y reaparece a un lado). El escudo y los
  pequeños piden algo más de esfuerzo; la primera vez que el escudo para un disparo, el aviso breve dice cómo romperlo.
- **Jefe errante** (elegido por el usuario; Combate, «Jefe errante», de serie): desde la tercera oleada, a veces sale un jefe
  de los de esa oleada a mitad de una oleada normal (nunca en la del jefe), con el aviso «¡JEFE ERRANTE!»; su vida sale de
  los que quedaban por salir al final: la oleada pide las mismas repeticiones.
- **Sucesos en las oleadas** (elegidos por el usuario; Combate, «Sucesos en las oleadas», de serie): desde la segunda oleada,
  a veces una oleada trae uno (nunca dos oleadas seguidas ni en la del jefe), y su panel lo dice: **eclipse** (todo a oscuras,
  con estrellas: se ve lo que brilla, las cuentas de vida, los aros y los rayos), **lluvia de meteoritos** (rocas en llamas
  que caen desde lo alto hacia donde estás: apartarse o pararlas con la mano, como las del lanzador; **donde va a caer cada
  una, una sombra en el suelo** que crece y se oscurece, y un silbido al acercarse: basta con salirse de ella; pedido del
  usuario, que no las veía caer. No sale con la vista en la pesa —los curls, la elevación frontal, los antebrazos, el swing y
  el peso muerto—), **niebla cerrada** (los
  enemigos aparecen de golpe) y **lluvia de oro** (al empezar la oleada, orbes de oro bajan flotando a tu alcance: se cogen
  con la mano o la cabeza y dan puntos). Tumbado, en plancha o sentado, solo el eclipse y la niebla.
- Travesía: la roca del derrumbe se queda quieta del todo al embestirla (el golpe se ve en su cara). Una zancada hacia
  delante empuja a los bandidos y hace recular a los lobos cercanos. Los bandidos no se quedan plantados: cambian de
  sitio entre lanzamientos y a veces provocan.
- Al abrirse una compuerta, su interior es oscuro.
- Toques: las «amebas» son aros de neón (tubo de luz con flechas que giran hacia el hueco; estallan en chispas), elegidos
  por el usuario en vez de los aros de agua (se leían mal y no casaban con Cómic).
- Pulsómetro (`src/57_pulse.js`): reloj o banda Bluetooth con el servicio estándar de pulso; el pulso, en el marcador. El
  navegador de las Quest no tiene Bluetooth para páginas: el móvil lo pasa a las gafas por la sincronización (cifrado con
  el código, en otro hueco de Firebase con la forma `meta` + `blob`, uno por segundo como mucho; las gafas lo escuchan).
- Luciérnagas: **el doble que en RepArena** (180), **de colores bien distintos** (tres de cada cuatro: rosa, turquesa,
  violeta, verde, naranja, azul y amarillo; el centro, apenas más claro, que si no todas parecían iguales) y, en los momentos
  especiales (la fiebre, el relámpago, el turbo, la supervelocidad), **un destello más vivo y se hinchan y deshinchan**, cada
  una a su ritmo (pedido del usuario).
- **Luciérnagas en la periferia, al compás** (pedido del usuario: al menos 2,5 veces más, sin tapar las compuertas, los
  enemigos ni el entorno inmediato, y que su movimiento haga sentir el ritmo de la música): 480; nada a menos de 4,5 m de ti
  ni en el pasillo de juego (±35° del frente, hasta las compuertas, por debajo de 4,6 m): alrededor, detrás, a los lados y
  por encima, hasta 20 m, y se ven de lejos. Con música, se columpian **por grupos** (sectores del anillo alrededor de ti,
  los vecinos al revés: el anillo entero «respira» con cada pulso), más amplio cuanto más lejos, y en el primer pulso de
  cada compás una **ola de luz** da la vuelta al anillo.
- **Las balizas de las compuertas, de luz** (pedido del usuario: los conos «tenían una proyección irreal»): un haz blando,
  brillante en su eje y desvanecido hacia los bordes (no se le ven caras ni la boca del cono), que barre el suelo de delante
  de la compuerta con una mancha de luz y, cuando te apunta, la lámpara deslumbra un instante; gira algo más despacio.
- Pompas de Barras: **de jabón, como en RepArena** (película irisada con brillos, más opaca en el borde; la grande, con un ojo
  dentro): las de color liso no tenían relieve (pedido del usuario).
- Luciérnagas (`src/56_motes.js`, Entorno → «Luciérnagas»): puntitos de luz con vuelo sereno y sinuoso de insecto (se
  ciernen y siguen; sin temblor de alas ni retrocesos, que daban una sacudida sin sentido), en la tarjeta gráfica; nada de
  sprites que giren en círculo (las de antes, toscas). Con música, bailan a su compás: vaivén con un extremo en cada pulso
  (a medio tiempo si la canción es rápida), destello en cada pulso y algo más deprisa cuanto más rápida; sin saltos.
- Los contornos de tinta: finos de lejos (grosor fijo en el mundo pasados 2,5 m) y solo en el borde de verdad (sin
  parpadeos al mover la cabeza).
- Los personajes geométricos hechos a mano gustaron poco: para enemigos nuevos, mejor modelos de Quaternius. **Salvo los
  robots de RepArena** (pedido del usuario, que los había aplazado): vuelven tal cual (el Segador, el Destructor y el Coloso
  de jefe), hechos de piezas como allí y con las animaciones de la biblioteca, en Combate y como lanzadores en Arcos.
- **Lo que lanzan los enemigos y sus ondas, realistas** (pedido del usuario: primero «muy básico», luego «tosco: mucho más
  realista»): partículas con textura de humo que giran, crecen y cambian de color con la edad (el fuego, de blanco a
  amarillo, naranja y rojo; el humo, de oscuro a gris claro), no puntos de luz. Las piedras del lanzador (Combate), meteoros
  en llamas con humo; el escupitajo del cangrejo, una bola de baba brillante que gotea y salpica; el demonio, una bola de
  fuego que estalla (llamas, humo y pavesas); cada jefe, lo suyo (el Yeti, una bola de nieve que se deshace en polvo y
  copos; el Demonio verde, fuego verde; el Alien alto, plasma violeta). La onda del cíclope es polvo de verdad: su puñetazo
  levanta un anillo de polvo y piedras, y la onda corre por la pasarela como un muro bajo de polvo que salta del suelo; el
  jefe, al caer tras cada salto, también. Lo que estalla al darte, a más de un metro (pegado, llenaba la vista).
  **Las bolas, con relieve, claroscuro y movimiento de verdad** (pedido del usuario: «una bola sin relieve»): la de fuego,
  roca fundida (costra oscura y rugosa iluminada de un lado, con grietas al rojo que fluyen y laten); la piedra del
  lanzador, roca con aristas y grietas encendidas; el plasma, un orbe con remolinos, núcleo blanco y dos anillos que giran;
  la nieve, una bola con grumos, sombras azuladas en los huecos y escarcha que destella; la baba, una gota que tiembla, se
  estira al volar y brilla húmeda. La roca, la nieve y el fuego van dando vueltas sobre sí mismos en el aire.
- **Alas al planear** (pedido del usuario): planeando con los brazos en cruz, un abanico de plumas de luz sale de cada
  hombro, sigue el brazo hasta pasada la mano y se tiende hacia atrás, **casi paralelo al suelo** como un ave que planea
  (colgando en vertical parecía que frenaban), ondeando; aparece y se apaga suave.
- Los voladores baten las alas siempre rápido, a su ritmo, sin depender de lo deprisa que avancen.
- **El vuelo de los voladores, suave** (pedido del usuario: se paraban y, de golpe, hacían una diagonal rapidísima hacia un
  lado y se perdían de vista): se mueven siempre, en curvas amplias y continuas, sin parones ni bandazos; vistos desde tu
  cabeza nunca giran más de 40° por segundo mientras van a su aire (solo al lanzarse a morder, al huir y al recibir un
  golpe), y ya cerca se van poniendo delante de ti. Lo errático manda en lo lejos que se desvían y lo vivos que son. Su
  mordisco se sigue anunciando igual (se echan atrás y se lanzan).
- Cada enemigo tiene resistencia, fuerza y dureza en la tabla del desarrollador; los nuevos entran solos en ella.
- En el menú, cada enemigo es una ficha con su retrato (de su modelo), su nombre, su resistencia y su fuerza. Un enemigo
  nuevo: añádelo a `FOE_PIC` (`src/00_core.js`) y rehaz `models/retratos.png` con `node tests/retratos.js`.

**Paneles y avisos en las gafas**
- Ningún panel puede tapar lo que viene hacia el jugador. Los avisos tampoco tapan el marcador ni los menús (pedido del
  usuario): se apartan de ellos como de lo que llega.
- **Los avisos nunca se solapan** (pedido del usuario: el cofre, las metas del día y el resumen del final se pisaban): los
  logros dorados salen de uno en uno, arriba, y el panel entre oleadas (o tramos), justo debajo sin tocarse; con un menú
  abierto (el resumen, la pausa…), el logro sale encima del menú, de cara como él. El del centro y el breve se apartan de los
  logros, del panel entre oleadas, del menú y del marcador, y el breve, también del del centro.
- **Cortinillas** (elegidas por el usuario: «Modelo 2», estilo HUD holográfico, una imagen por modo y ejercicio en
  `public/cortinillas/`): son la pantalla grande de antes de cada ronda (en lugar de la ilustración de la carátula del duelo;
  también en la Travesía), quietas, con la franja de abajo diciendo las oleadas (o tramos) y las vidas que tienes puestas.
  **La caricatura animada se queda** junto al menú principal, antes de calibrar y en la página (corregido por el usuario:
  las cortinillas no la sustituyen).
- Cuentas de vida (opción A elegida; `LIFE`, `src/70_game.js`): encima de cada enemigo, desde que sale, una fila de bolitas
  doradas de cara al jugador, una por disparo normal; las que pierde **desaparecen** (no se quedan huecas) y las demás se
  juntan; los que aguantan más de 8, bolitas grandes de 5. Sustituyen a la barra de vida. Un solo dibujo (puntos).
- La diana (la única, líneas de enfoque): rayas que se mueven (giran, corren hacia fuera y ondulan), gruesas y con el centro
  claro, en un marco de al menos 32 cm (en los voladores pequeños apenas se veían). Las demás se quitaron.
- Cada ajuste con explicación lleva una tecla «?» que enseña su explicación al lado del menú.
- El marcador se ve siempre, también al mirarlo de frente, y sin texto de más.
  - Por defecto (VR), a un lado (izquierda o derecha, configurable), grande y siempre a la vista, por fuera de las
    compuertas. **3,2 m de ancho a 5 m, a unos 48° del frente** (ergonomía, aplicada por el usuario: con 4,2 m quedaba a
    53-69° y había que girar mucho la cabeza; antes, «el doble de grande»).
  - Siempre, bajo los puntos, lo que llevas entrenando (la ronda; en una sesión, la sesión entera) y, discreta, la hora.
  - Diseño elegido (C): rosco doble (fuera, la oleada con la muesca del récord; dentro, la racha en 10 tramos), oleadas en
    puntos, un solo hueco para mensajes a 48 px o más. En el relámpago, el borde es una mecha. Nada de cargas ni escudo en
    el marcador: se ven en el juego (bola en la mano, celdas del bláster, brazalete del escudo en el antebrazo).
- Las celebraciones (`cheer`) van solo al marcador; delante de la cara, solo lo que pide hacer algo ya o colocarse. Los
  logros importantes (meta del día, cada misión cumplida, cofre del día, escudo de racha, nivel, récord al fallo y cada
  récord de la ronda: repeticiones, tiempo, puntos, combo, perfectas, metros, en cuanto se baten) salen además en grande, en
  su propio aviso dorado (`trophy`, `src/60_ui.js`), sin tapar lo que llega.
- Los avisos de la vista (los del centro, PERFECTA, las indicaciones para colocarse, la caricatura) **nunca se ladean
  con la cabeza**: siempre derechos de pie y colgado.
  - Tumbado y en plancha: en el suelo bajo la cara o en el techo, de cara a los ojos, con lo de arriba del texto hacia la
    cabeza y fijos (ladearla no los gira). Igual para todos los avisos de la vista.
  - **Salvo en la plancha lateral** (ergonomía, aplicada por el usuario): de lado, con la cabeza tumbada y la vista al frente,
    se ladean con la cabeza (derechos en el mundo se leían girados 60-90°); y el mundo y la bola se orientan solo con la
    mirada (la coronilla apunta a lo largo del cuerpo).
- Los avisos de lo que se hace mal salen impresos en el suelo, durante unos 4 s, **de tamaño medio** (corregido por el usuario:
  en plancha llenaban la vista y tapaban el menú, los enemigos y el marcador). **Tumbado o en plancha no salen en el suelo**
  (está a un palmo de la cara): basta el aviso breve de la vista.
- **Los avisos, cortos y de tamaño medio** (pedido del usuario): lo que pide hacer algo ya, en dos a cuatro palabras
  («¡Barranco! Brazos en cruz», «Apoya la otra mano»), con el aviso breve de la vista algo más grande que antes (los de la
  Travesía se leían mal). Los detectores dicen lo mismo que RepArena; se acortan al enseñarlos (`src/ui/short-msg.ts`).
- **No se avisa de lo que viene** (decidido por el usuario: se entrenan los reflejos, como en Arcos): ni en la Travesía (el
  hueco, la seta, el cañonazo, el túnel…) ni la ráfaga de vallas de Arcos; lo que viene se entiende por su forma, su gesto y
  su sonido. Sí se dice **cómo hacer bien el ejercicio** (bajar más, estirar los brazos…), **lo que hiciste mal ante un reto**
  («¡Te ha mordido! Písala»: sin avisos previos, es como se aprende) y las órdenes de **la pelea con el jefe**. Tampoco el
  aviso grande del arco de plancha, del burpee y del semipuente de Arcos (queda su bocina y la huella de la mano) ni el del
  lanzador de Combate (avisa con su gesto y su voz); lo que hay dentro de los cofres, en el marcador.
- **El panel de indicaciones** (pedido del usuario: los avisos de lo que hay que hacer salían y se iban sin dar tiempo a
  leerlos): de pie, lo que pide hacer algo ya sale en un panel grande y fijo, al menos 4 s: con compuertas, encima de la del
  centro (con el marcador en «Compuertas», en su hueco de mensajes); en la Travesía, un letrero sobre el sendero, alto y lejos.
  Arriba, tenue, lo que hay que hacer en ese ejercicio; abajo, grande, la corrección o la orden. Tumbado y en plancha, en el
  aviso breve de la vista (en el suelo bajo la cara). En plancha y en zancada, los textos dicen lo de esa forma (nada de
  sentadillas ni brazos en cruz en plancha). Según la postura (ergonomía, aplicada por el usuario; `docs/ERGONOMIA.md`):
  **sentado** (los fondos), el panel más bajo, a unos 14° sobre los ojos; con **la vista en la pesa o en el suelo** (los dos
  curls, la elevación frontal, los antebrazos, el swing y el peso muerto), sin panel: en el aviso breve, justo bajo la
  mirada; y **colgado** en Barras, sin aviso en el suelo (no se ve), solo el breve.
- **Antes de empezar**, la colocación y la caricatura van juntas y centradas delante de ti, y vienen a tu mirada enseguida
  (antes quedaban a un lado, hacia donde estaba el menú).
- **Con un menú abierto, nada lo tapa**: ni los avisos del suelo ni el breve ni la carga del suelo (pedido del usuario).
- Al empezar cada ronda, la **carátula del duelo** (`src/64_intro.js`, modelo 3 de los propuestos; en RepArena XR, con la cortinilla del ejercicio): 7 s, grande, a 2,5 m,
  con todo lo demás en negro; tú (rango y récord) contra el jefe de la ronda, sin la caricatura (sale después, hasta
  calibrar). Se salta con cualquier botón del mando o con el pulgar arriba.
- Al perder todas las vidas: fundido en negro, aviso claro de derrota y resumen automático con «Otra ronda» y «Menú
  principal».
- **El negro del final, negro del todo** (pedido del usuario: al agacharse se veía el suelo y el aro turquesa y, al apartarse,
  el resumen desaparecía): en negro solo se ven el resumen, tus manos y los avisos, se mueva uno como se mueva.

**Menús**
- **Menú de muñeca:**
  - se abre con el botón MENÚ de la muñeca izquierda y se queda **quieto delante del jugador**, de cara y derecho; ni la
    mano ni el mando lo mueven (mirar a la muñeca no lo recoloca; con mandos, X/Y lo recoge si está a la vista);
  - se cierra con la palma izquierda hacia abajo o con el puño;
  - los menús nuevos salen solos.
- **Cada menú sale donde estaba el anterior**: «Traer menú», «Volver», «Menú principal» y el resumen no se alejan.
- **[PR 31: la pulsación de RepArena entera (opción B del usuario), con el dedo de cualquier mano y con el rayo de IWSDK y la pinza (`src/ui/ra/poke.ts`)]** Los botones de los menús se pulsan con **las dos manos** (el botón MENÚ de la muñeca izquierda, con la derecha). Las
  teclas son **sólidas**: al llegar al fondo, la mano que se ve se queda apoyada en ella y no la atraviesa; el panel
  también (el fondo y los huecos entre teclas). Y tienen **imán** (opción B elegida): la iluminada sigue iluminada hasta que
  el dedo sale de ella más de 1 cm, la mano que se ve se acerca a ella y, al tocarla, se queda clavada donde tocó; decide la
  punta suavizada (la que se ve) y el barrido de lado se juzga por el movimiento de ~0,1 s, no por un fotograma.
- **[PR 36: modelo A elegido por el usuario: sin relieve de ningún tipo —color liso, sin luz ni sombra ni borde de tinta, sin sombra en la bandeja— y la bandeja, de color liso sin trama; los textos y las teclas, dibujos guardados que no se repintan al pulsar]** **[PR 31: las teclas planas de RepArena enteras, con su caché (opción B del usuario; `src/ui/ra/btn.ts`)]** Las teclas son **planas** (opción B del usuario; `flatKeys`, `src/60_ui.js`): cada una, un solo panel con su cara de
  color, su borde y su texto, que flota un poco sobre la bandeja con su sombra. **No se hunden** (pedido del usuario: al
  pulsar, el menú se rehace y la tecla nueva salía sin hundir, con el dedo dentro): con el dedo delante se aclara, tocada
  brilla y, al pulsar, destella con un fogonazo de luz donde está el dedo; nada de eso repinta el panel (solo su color).
  Las de relieve (una malla con laterales y contorno de tinta, y la etiqueta encima) pesaban demasiado.
- **[PR 31: como en RepArena (opción B)]** **Pegadas** (pedido del usuario): la tecla pulsada retiene el dedo que se ve hasta que lo apartas por delante; aunque la
  mano de verdad resbale de lado (hasta `POKE_KEEP`, 7 cm), la punta sigue sobre ella y no se desliza por el panel ni
  ilumina las vecinas. En las planas, la punta se queda en el punto exacto que tocó (`pinW`, en el candado `POKE.lock`),
  también cuando la pulsación rehace el menú con teclas nuevas en el mismo sitio.
- **[PR 31: puesto, con los menús de RepArena enteros (opción B del usuario; `menuOccluder`, `src/ui/ra/menu-core.ts`)]** Detrás del fondo de cada menú (y de la columna HOY), una pantalla invisible que solo escribe profundidad y se pinta la
  primera (`menuOccluder`, `src/60_ui.js`): así no se pinta el paisaje tapado por el menú. Sin ella, el menú principal, que
  cubre casi toda la vista, iba a saltos al mover la cabeza (el resumen, pequeño, no). Un panel de menú nuevo, con la suya.
- **[PR 31: como en RepArena (opción B)]** Tras pulsar un botón, hay que **retirar el dedo** antes de que cuente otra pulsación, para que no se toquen dos
  opciones ni el menú siguiente.
- Menús compactos y al alcance de la mano:
  - lo poco usado va en submenús (Sonido, Entorno, Ajustes…);
  - el menú principal, simple (el usuario lo complica si quiere, en Opciones): arriba, **EMPEZAR** grande (en lugar del
    título; con Sesiones, EMPEZAR SESIÓN); debajo, las **metas de hoy** en una franja (las tres misiones con su barra y la racha con
    sus escudos; al tocarla, Progreso → Misiones); a la izquierda del menú, la columna «HOY» (metas, cofre, racha y nivel);
    al entrar en las gafas, la carátula «METAS DE HOY» (8 s, o cualquier botón). Las tres cosas, elegidas por el usuario; luego el **modo** (Combate, Arcos, Barras, Toques) con su color y, tras un separador, **Sesiones**; con un
    modo, sus ejercicios y la dificultad (galones, «Al fallo», la ronda en una ficha y lo del ojo); con Sesiones, la
    sesión bloque a bloque, legible; el modo, los ejercicios y la dificultad, cada uno en su caja con título y color
    (los modos, teclas enteras de su color; los ejercicios, en blanco); Spotify; y **Opciones ▸** (Rivales y armas, Progreso, Sonido, Entorno y Ajustes, en
    pestañas) y Salir; en Ajustes, las pestañas de los modos se llaman «Modo Arcos», «Modo Barras» y «Modo Toques»;
  - el jugador solo ve lo que el desarrollador marca con el ojo en su tabla de dificultad (`src/67_dev.js`); el menú
    completo y la tabla son del modo desarrollador, que está escondido; ya no hay estrellas de favoritos;
  - las canciones de cada ejercicio son del jugador (también se ponen de serie desde la tabla); las elegidas, las de cada
    ejercicio y las de cada bloque suenan en un orden al azar distinto cada vez;
  - cada parte tiene su color.
- Solo se ofrecen los ejercicios que valen para el modo elegido.

**Sonido**
- Mientras suena Spotify, el sonido ambiente se pone a 0 %.
- En las sesiones, entre bloques sigue la canción del bloque que acaba (sin ambiente) y se funde con la del siguiente.

**Realidad mixta**
- Puede usar la habitación escaneada o colocarse a mano. Lo colocado (y las barras y paralelas) se recuerda entre
  sesiones: **en el mismo sitio de la habitación** (pedido del usuario: tenía que recolocarlas en cada partida), con el ancla
  persistente de IWSDK, aunque las gafas pongan su origen en otro sitio al entrar.

**Página web**
- En el ordenador y en el navegador de las gafas, lo primero que se ve son los botones de entrar (realidad mixta, VR,
  ordenador); luego el modo y el ejercicio en fichas compactas, y después las opciones.
- El panel de la izquierda es un índice: cada apartado (`<section>` de `.main` con `id` y `data-toc`) y, debajo del que se
  ve, sus subapartados (los `h3` a la vista); a la derecha, solo ese apartado (`pageNav`, `src/68_prefs.js`). Un apartado
  nuevo: con su `id` y su `data-toc` (y su fila en `APP_SECS`, `src/63_app.js`; si no, sale en «Más»).
- **En el móvil no se juega** (el juego es solo en las Quest 3): la página es un panel de control con forma de app
  (`src/63_app.js`, `html.app` = estrecho y fuera de las gafas), modelo C elegido por el usuario, como los Ajustes del
  teléfono: inicio con el logotipo, lo de hoy y listas agrupadas (Entrenar, Ajustes, Tú, Ayuda) con icono de color, valor y
  flecha; cada apartado, una pantalla con «‹ RepArena» (y la vuelta atrás del teléfono); cada ajuste, una fila (Sí/No con
  interruptor; los demás, su valor y una pantalla con las opciones o el número, y la explicación debajo). Sin botones de
  entrar ni índice. Los iconos, dibujos de línea del mismo estilo (`APP_I`), nada de emojis.
- Se instala como app con su logotipo (la R rosa de la letra del juego con un rayo turquesa, elegido por el usuario):
  `icons/logo.svg` es el original y los PNG se rehacen con `node tests/iconos.js`; `manifest.webmanifest`, a pantalla
  completa.
- Las estadísticas del día, con color, animación y la racha, son un incentivo para volver.

Cuando una petición sea ambigua o haya varias formas razonables de hacerla, **dale al usuario propuestas** (o modelos
visuales) y deja que elija. Cuando el usuario pregunte «¿entiendes lo que te digo?», resúmele lo que has entendido.
