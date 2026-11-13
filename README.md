# RepArena XR

**RepArena** rehecho con el [Immersive Web SDK](https://iwsdk.dev) de Meta (IWSDK): el mismo juego de ejercicio para
**Meta Quest 3**, en el navegador de las gafas, sobre la base que Meta ha preparado para WebXR (física de verdad, manos y
paneles nítidos). El prototipo convenció: RepArena se está pasando entero aquí, PR a PR, siguiendo
[`MIGRACION.md`](MIGRACION.md) (el plan y en qué punto va). Mientras tanto, RepArena sigue en su repositorio.

**Jugar:** https://merinoantonioonu-source.github.io/reparena-xr/ (abre la página en el navegador de las Quest 3 y pulsa
«ENTRAR EN VR»).

## Qué hay

Por ahora, Combate con los ejercicios de pie, como en RepArena:

- **Los ejercicios de pie**, con los mismos detectores y números que RepArena (comparados con su código): sentadilla,
  zancada (cada una, la otra pierna delante), sentadilla con salto, con press y con elevación frontal, swing con
  kettlebell, peso muerto, curl (cada brazo por su cuenta), curl con barra o kettlebell (las dos manos, como una sola
  pesa), elevación frontal y antebrazos con la barra flexible. Se elige en el menú principal (es el mismo ajuste que en
  RepArena). Los recorridos, los tuyos de «Tu cuerpo (recorridos)» de cada ejercicio (por ejemplo, 26 cm de bajada en la
  sentadilla); PERFECTA si dura lo pedido (1,2 s de serie) y vas 3 cm más allá.
- **La bola roja de energía**, a un metro del pecho: aparece al cargar (al bajar en la sentadilla, al subir la pesa al
  hombro en el curl…) y, aguantando en la postura más dura, sube a **×2** (1,5 s), **×3** (2 s más) y **×4** (2,5 s
  más), con su número encima y un destello al llegar a ×4. La carga se escribe también **en el suelo**, delante
  (aguantando, es lo que ves), y a ×4 dice «¡ARRIBA!». Arriba del curl y de la elevación frontal, un chasquido de luz en
  las manos (la repetición ya vale; el disparo sale al empezar a bajar).
- **Lo que haces mal** («¡Baja más!», «Sube hasta el hombro», «¡Salta al subir!»…) sale en grande, **impreso en el
  suelo** delante de ti, unos 4 s.
- **El rayo**, como en RepArena: al completar la repetición, la bola estalla y la carga pasa a **las dos manos** (un orbe
  en cada muñeca, uno por mano y sin acumular). Cada mano lanza el suyo con una **sacudida hacia el zombi** (la de
  RepArena: puede salir de la cadera y hacerse subiendo o bajando; si las gafas pierden la mano a medias, sale igual).
  Con **«El rayo va al que miras»** (de serie) va al zombi que llevas un momento mirando, marcado con su **diana** (líneas
  de enfoque rojas); si no, al más cercano a la dirección de la mano. Con mandos, apuntando con la mano y con el
  **gatillo** (gatillo y agarre a la vez es el puño: no dispara). Pellizcar no dispara. Daño de RepArena: 1 el normal, 2
  el perfecto, y la carga suma (×2 +1, ×3 +2, ×4 +4). Con la puntería automática (o con la mirada), la repetición
  dispara sola. Con pesas en las manos no se lanza con la mano: el rayo va al zombi que miras; con la barra flexible,
  sale solo.
- **Puñetazo**: un golpe rápido al zombi que tienes delante lo aparta y lo aturde un momento (sin quitarle vida).
- **Estilo Cómic** (el de serie, como en RepArena): sombreado plano con un corte duro entre luz y sombra (la sombra,
  violácea), contornos de tinta finos, colores claros y vivos, cielo de dibujo con nubes de borde entintado, neblina clara
  rosada y un valle de dibujo alrededor (mesetas de colores, ruinas, rocas que flotan y montañas lavanda); al acertar,
  líneas de impacto y, al derribar, una estrella. «Estilo visual: Realista» lo quita.
- **La arena**: suelo de arena con grietas a tinta y tres **compuertas** en arco a 11 m: cada zombi sale por una (se abre,
  su interior es oscuro y la baliza gira); son sólidas y los zombis las rodean.
- **Los enemigos de las compuertas**, los que elijas en Opciones → Rivales y armas (cada uno, una ficha con su retrato,
  su nombre, su resistencia y su fuerza): zombi, zombi verde, zombi gordo, velociraptor, los piratas (esqueleto, capitán
  Barbarroja, Sharky y Mako) y los monstruitos (demonio, demonio verde, cíclope, yeti, calavera, alien y alien alto), de
  Quaternius, con sus animaciones y su voz, y el diablillo y el puglin (de tres colores, con las animaciones de la
  biblioteca de Quaternius pasadas a su esqueleto). El **lanzador**, un diablillo, se queda lejos y te tira piedras en
  parábola: apártate («¡Esquivada!») o párala con la mano («¡Parada!»); si te da, pierdes una vida. Salen repartidos entre
  los elegidos; su resistencia (disparos que aguantan) y su fuerza (vidas que quitan), las de la tabla del desarrollador
  de RepArena. Los robots, que eran geométricos, por ahora no.
- **Los voladores**: la abeja, el murciélago y el Cthulhu (de Quaternius, con sus animaciones y su voz) salen volando por
  el hueco de las compuertas y vienen hacia ti con el **vuelo errático** de RepArena (bandazos al azar y un vaivén suave,
  más o menos según «Vuelo errático»), batiendo las alas siempre a su ritmo y **zumbando**. Cerca de tu cara, se echan
  atrás, **se lanzan a morderte** (con su voz y un silbido) y se alejan; un disparo los empuja hacia atrás y les quita el
  impulso. Al derribarlos, estallan en baba y **caen al suelo**. Con los de tierra, uno de cada; se eligen en sus fichas
  de Rivales (los drones y los avispones, geométricos, por ahora no; el dragón, el jefe, con el PR 10).
- **Su forma de moverse**, la de su clase (Ajustes → Cada enemigo), como en RepArena: cada uno elige una de las marcadas
  (recto, zigzag de lado a lado, a rachas con paradas en guardia, o con **esquivas**: se aparta de golpe hacia un lado,
  el diablillo y el puglin con una voltereta, de vez en cuando y a veces al recibir un disparo). Acechan andando y cargan
  corriendo los últimos metros, llegando cuando pide «Tiempo llegada»; con más «velocidad al desplazarse», lo que les
  sobra lo gastan en zigzags o paradas. A media distancia, una vez, **se plantan y te amenazan** con un rugido. Sus gestos
  (amenazar, preparar y dar el golpe, retroceder, encajar) van a su «rapidez de gestos».
- **Con física de verdad** (motor Havok): cada uno es un cuerpo que choca con el suelo, las cajas, las rocas, la bola y
  los demás. Van a **su puesto de ataque**, en un arco delante de ti (como en RepArena): **rodean la bola**, las cajas y
  las rocas y se apartan entre ellos; si la primera fila está llena, **esperan en la de atrás** y, con ritmo marcado
  (Opciones → Sonido), **bailan al compás**. En su puesto preparan el golpe y golpean (con ritmo, en el pulso); luego
  retroceden un paso. Un rayo los hace **retroceder**; el que los mata los **lanza por el aire dando vueltas** y caen
  tumbados al suelo; luego se desvanecen. Encima de cada uno, sus **cuentas de vida**: bolitas doradas, una por disparo
  normal que le queda (los que aguantan más de 8, bolitas grandes de 5), que desaparecen al perderlas.
- **Oleadas**, como en RepArena: cada una pide sus repeticiones («Repeticiones por oleada», y unas más en cada una): los
  que salen aguantan justo eso entre todos. Salen de uno en uno (con ritmo, en el pulso) sin pasar de «Máximo a la vez».
  Con la **escalera**, en las primeras oleadas solo los fáciles, y cada pocas entra uno más duro. Al superar una,
  «¡Oleada superada!» y el **descanso**; luego, el **panel de la oleada** que empieza («OLEADA 3 DE 5», «¡ÚLTIMA
  OLEADA!»), con tus puntos y quién entra en juego, grande delante de ti y la escena algo oscurecida detrás; mientras se
  ve, no sale nadie. La **dificultad creciente** solo sube si la superas con soltura. La última trae un **jefe** (el de tu
  clase a lo grande, el capitán Barbarroja si está, o el dragón si son voladores); **«Al fallo»**, oleadas sin fin con
  jefe cada cinco. **Puntos** por cada repetición (más con combo y perfecta) y cada derribo (el jefe, 1500), y **combo**
  (cada 10 seguidas, ¡COMBO!; un golpe o un fallo lo rompe). Superada la última, **¡Victoria!**; sin vidas, se acaba la
  ronda; en los dos casos vuelve el menú con **OTRA RONDA** y cómo fue.
- **Premios** (Ajustes → Partida), como en RepArena, sin pedir menos ejercicio: cada tres oleadas superadas con pocos
  golpes, en el descanso salen **tres cartas de mejora** (escudo, escarcha, onda, corazón, doble o nada, combo de hierro,
  calma) y eliges una con el dedo o el rayo; la oleada siguiente espera a que elijas. **Sorpresas**: a veces un enemigo
  **dorado** (con su halo, ×3 puntos), un **relámpago** (20 s en los que llegan seguidos y todo vale el doble) y, en el
  descanso, un **cofre** (el del Pirate Kit) que se abre **saltando**: una mejora más, una vida o 300 puntos. Y la
  **carrera contra tu récord**: el marcador dice cuántas llevas de más o de menos que en tu mejor ronda (la de RepArena).
- **Manos**: las de IWSDK tal cual (los modelos oficiales de Meta, con contorno). Con mandos y «Mandos como manos» (de
  serie), la mano de IWSDK que agarra el mando: el índice se dobla con el gatillo y los demás dedos con el agarre.
- **El menú principal**, como el de RepArena: en las gafas sale delante de ti y a tu alcance («Distancia del menú»),
  colgando a la altura del pecho e inclinado hacia ti; se pulsa con el dedo o con el rayo de la mano o del mando (la
  pulsación de IWSDK). Arriba, **EMPEZAR** (tras una ronda, **OTRA RONDA**, con cómo fue); el **modo** (Combate; Arcos,
  Barras, Toques, Travesía y Sesiones, en gris hasta su PR), los **ejercicios** de Combate (los de suelo, en gris hasta
  el PR 11) con cómo se hace el elegido, la **dificultad** (los siete rangos, «Al fallo», la ficha de la ronda y lo que el
  desarrollador deja ver con el ojo), **Opciones ▸** y **Salir**. El sitio de las metas de hoy está reservado (PR 13).
- **Opciones**, en pestañas con su color: Rivales y armas, Progreso (llega con el PR 13), Sonido, Entorno (con la
  **nitidez en las gafas**: Normal ×1, Alta ×1,4 de serie o Máxima ×1,7, que se aplica al entrar en VR) y Ajustes (una
  pestaña por grupo). Los ajustes salen del esquema de RepArena, cada uno con − y + o sus opciones, y la tecla **«?»**
  enseña su explicación al lado del menú. Cada menú sale donde estaba el anterior.
- **El botón MENÚ** de la muñeca izquierda (como en RepArena): sale al mirarte la muñeca y se pulsa con la otra mano (con
  mandos, también X/Y del izquierdo). En plena ronda, la **pausa** (cómo vas, tus mejoras, los últimos avisos; seguir,
  recolocarte, terminar la ronda o ir al menú principal); fuera, trae el menú delante. El menú se recoge con la palma
  izquierda hacia abajo o con el puño.
- **Al acabar la ronda**, todo funde a negro y sale el **resumen** (la opción A de RepArena): dónde acabó y el ejercicio,
  el número grande, la medalla y las perfectas, puntos, tiempo y kcal, el logro más importante y «Otra ronda» o «Menú
  principal». La ronda se guarda en tu historial (el mismo que RepArena).
- **El marcador** (el diseño C de RepArena), a un lado (Entorno → «Marcador»: a la izquierda o a la derecha): arriba, la
  oleada en puntos, los puntos (en el relámpago, «×2» y una mecha que se consume) y las vidas; debajo, lo que llevas
  entrenando y la hora; a la izquierda, el **rosco doble** (fuera, lo que llevas de la oleada —en el descanso, la cuenta
  atrás— con la muesca de tu récord; dentro, la racha en 10 tramos; en medio, tus repeticiones); a la derecha, un solo
  hueco grande para lo que pasa ahora (celebraciones, el descanso con la oleada siguiente y tu récord); abajo, tu rango.
  Los **logros importantes** (un récord, el récord al fallo, el cofre) salen además en grande, en un **trofeo dorado**
  arriba, por encima de lo que llega. Letras de RepArena (Rubik y Bungee), con tildes.
- **Sonido** con el de IWSDK (en 3D: se oye de dónde viene): los de RepArena (tus archivos de `sounds/`, sustituibles
  por nombre, y los que allí se fabricaban al vuelo, grabados como archivos), con la voz de cada zombi, la compuerta que
  suena y echa vapor al abrirse y el ambiente de la arena (a 0 mientras suena Spotify).

- **Ejercicios de suelo y sentado** (de RepArena, comparados con su código): **fondos en silla** (baja doblando los
  codos: como la sentadilla, con su carga ×2-×4), **plancha lateral** (cada pocos segundos aguantados con la cadera
  arriba, un disparo; si cae la cadera, vuelve a empezar) y **superman** (boca abajo, sube el tronco y aguanta: el rayo
  sale solo al más cercano). Antes de empezar, el marcador dice cómo colocarte y, quieto dos segundos en la postura, la
  toma. Tumbado, los **voladores vienen bajos**, a la altura de tu cabeza; en el superman esperan a la vista y no pican
  mientras aguantas arriba.
- **La batalla diminuta** (flexiones y plancha con un brazo), como en RepArena: bajo tu cara, cuatro **trampillas** en el
  suelo de las que salen **cangrejos, setas y calaveras** de unos 20 cm (y abejas y murciélagos pequeños) que corretean
  hacia tus manos, amenazan dando un saltito y saltan a morderte; el **marcador, tumbado en el suelo** delante de tus
  manos, y lo rodean. En la plancha con un brazo salen a los lados y cada brazo dispara a su lado; una flexión aguantada
  abajo carga ×2-×4 para el brazo que levantes. **Inchworm**: de pie, te doblas y caminas con las manos
  hasta que la cabeza llega a la **línea luminosa** del suelo (carga; una barra enseña lo que avanzas); cada flexión allí
  da más fuerza (×2-×4); vuelve andando hasta la salida y ponte de pie: dispara y sale la **onda expansiva**, que lanza a
  los bichos por el aire hasta su trampilla (desde ×2, también hace daño). Los bichos van mucho más despacio.

En el ordenador (sin gafas) también se puede probar lo que se hace con la cabeza (sentadilla, zancada, peso muerto…):
flecha abajo (o S) para agacharse (al subir, el rayo sale solo al
zombi más cercano) y Enter para empezar.

## Construir y probar

```bash
npm install
npm run dev          # servidor de pruebas de IWSDK con el emulador de las Quest 3 (https://localhost:8081)
npm run typecheck    # siempre antes de probar: un error de tipos puede parar los sistemas sin avisar
npm test             # pruebas de la lógica (Vitest)
npm run test:e2e     # construye y juega una partida simulada en un navegador sin gafas
npm run build        # la versión publicable, en dist/
```

Más detalles (el emulador, el Chromium de Playwright…) en [`MIGRACION.md` › Cómo probar](MIGRACION.md#cómo-probar).

Al fusionar en `main`, GitHub Actions construye el juego y lo publica en GitHub Pages (`.github/workflows/pages.yml`).
En cada PR, otra acción comprueba los tipos, pasa las pruebas y juega la partida simulada (`check.yml`). La primera vez hay que activar Pages: Settings → Pages →
Build and deployment → Source: **GitHub Actions**.

## Estructura

| Archivo | Qué es |
| --- | --- |
| `MIGRACION.md` | El plan de la migración: cómo se trabaja, cómo se prueba, los PR y en cuál vamos |
| `docs/REGLAS.md` | Las reglas de diseño que ha fijado el usuario (traídas de RepArena) |
| `AGENTS.md`, `CLAUDE.md` | Instrucciones para las IA (`CLAUDE.md` incluye las otras dos) |
| `iwsdk.config.json` | El proyecto: escena, recursos, componentes, VR con seguimiento de manos y física |
| `src/index.ts` | Arranca el mundo y registra los sistemas del juego |
| `src/combat/game.ts` | La partida: el ejercicio elegido, carga ×2-×4, la carga en las manos, rayos y daño, puñetazos, oleadas, vidas, paneles (y los avisos en el suelo) y nitidez |
| `src/combat/lockline.ts` | La diana: líneas de enfoque alrededor del zombi apuntado |
| `src/combat/gates.ts` | Las compuertas: abrirse para sacar a un zombi, la baliza y sus cuerpos de física |
| `src/style/comic.ts`, `src/style/comic-system.ts` | El estilo Cómic: el sombreado, los colores y los contornos de tinta, y el sistema que lo aplica a todo |
| `src/core/hitch.ts`, `src/ui/perf-system.ts` | El registro de tirones (de RepArena) y el medidor de fotogramas: qué congela la imagen y cuántos fotogramas se pierden |
| `src/style/warm.ts` | Precompilar los sombreadores: en el menú, de uno en uno; lo que falte, al empezar la ronda con la carátula ya en negro (que nada nuevo dé un tirón en plena partida ni al pulsar EMPEZAR) |
| `src/style/comic-fx.ts` | Los efectos de cómic: líneas de impacto y estrella al derribar |
| `src/scene-assets/gate.scene-asset.ts` | La compuerta (hecha en código) |
| `src/scene-assets/comic-valley.scene-asset.ts`, `src/scene-assets/comic-sky.scene-asset.ts` | El valle de dibujo y las nubes |
| `src/scene-assets/lib/hardsurface.ts` | Piezas de IWSDK para construir modelos (cajas biseladas…) |
| `src/combat/foes.ts` | La tabla de los enemigos (modelo, tamaño, animaciones, golpe, voz), su resistencia y fuerza, el reparto y los puestos de ataque, sin IWSDK |
| `src/combat/retarget.ts` | Las animaciones de la biblioteca de Quaternius, pasadas al esqueleto del diablillo y el puglin |
| `src/combat/rocks.ts`, `src/combat/rock-path.ts` | Las piedras del lanzador: la parábola, la parada con la mano y lo que pasa al llegar |
| `src/combat/hatch.ts`, `src/combat/hatch-foes.ts` | La batalla diminuta: los bichos de las trampillas (de RepArena, sin IWSDK) y en la partida, con las trampillas |
| `src/scene-assets/hatch.scene-asset.ts` | La trampilla del suelo (hecha en código) |
| `src/combat/waves.ts` | Las oleadas (de RepArena): quién sale en cada una, la escalera, los jefes, cada cuánto salen, la dificultad creciente y los puntos, sin IWSDK |
| `src/combat/perks.ts`, `src/combat/rewards.ts` | Los premios (de RepArena): cartas de mejora, dorado, relámpago, cofre y carrera contra tu récord; su lógica, sin IWSDK, y en la partida |
| `tests/vr/eval.mjs` | Para preparar pruebas en la VR simulada (ejecuta algo en la página) |
| `src/combat/gait.ts` | Cómo andan los de tierra (de RepArena): el ritmo de la marcha, recto, zigzag, rachas, la amenaza y las esquivas, sin IWSDK |
| `src/combat/flight.ts` | El vuelo de los voladores (el de RepArena: acercarse, bandazos, lanzarse a morder, empujones, salir por la compuerta), sin IWSDK |
| `src/combat/flyers.ts` | Los voladores: su modelo, el aleteo, el mordisco, el zumbido y la caída al morir |
| `src/combat/life.ts` | Las cuentas de vida sobre cada enemigo (bolitas doradas, en un solo dibujo) |
| `src/combat/enemies.ts` | Los enemigos: cuerpos de física, marcha a su puesto rodeando obstáculos, ataque con su fuerza, baile al compás, retroceso y muerte |
| `src/combat/fx.ts` | La bola de energía, la carga en cada mano, las chispas y los destellos |
| `src/combat/bolt.ts` | Los rayos (los de RepArena): descargas que viajan hasta el blanco, con su cabeza, su estela, sus filamentos y el segundo latigazo |
| `src/combat/components.ts`, `src/components.ts` | Los componentes `Foe` (un enemigo), `Flyer` (vuela), `Obstacle` (lo que rodean) y `Gate`, y su catálogo |
| `src/exercise/vertical.ts` | El detector de bajar y subir con la cabeza (carga, ×2-×4, PERFECTA), sin IWSDK |
| `src/exercise/standing.ts` | Los ejercicios de pie de RepArena (zancada, en dos tiempos, peso muerto, curl, curl con barra, elevación frontal, antebrazos), sin IWSDK |
| `src/exercise/floor.ts` | Los ejercicios de suelo y sentado de RepArena (fondos, flexiones, plancha lateral, superman, plancha con un brazo), sin IWSDK |
| `src/exercise/how.ts` | Cómo se hace cada ejercicio de pie (lo que dice el menú principal y el recordatorio del marcador) |
| `src/core/run.ts` | Al acabar la ronda: lo que se guarda en el historial (el formato de RepArena), las calorías y el resumen |
| `src/core/career.ts`, `src/core/days.ts`, `src/core/today.ts` | Tu carrera (de RepArena, con su guardado `reparena3-career`): experiencia, nivel y título, colores que se desbloquean, las tres misiones del día con su cofre y escudos de racha, récords en plena ronda; los días, la racha y lo de hoy. Sin IWSDK |
| `index.html`, `src/page/page.css` | La página web (la de RepArena): botones de entrar, índice, modo y ejercicio, lo de hoy, progreso e historial y los ajustes; en el móvil, la app (modelo C). El logotipo y el manifiesto para instalarla, en `public/icons` y `public/manifest.webmanifest` |
| `src/page/page.ts`, `src/page/pick.ts` | Arranque de la página (entrar en VR, «Probar en el ordenador», que se ponga al día al volver) y lo elegido con su explicación, lo que suma la ronda y la caricatura |
| `src/page/form.ts`, `src/page/nav.ts`, `src/page/today.ts`, `src/page/today-html.ts`, `src/page/app.ts` | El formulario de ajustes (sale del esquema), el índice de la página, «Hoy» con el progreso y el historial, y la app del móvil |
| `src/core/campaign.ts` | Jugar un nivel de la campaña: los ajustes del nivel (rango y oleadas) por encima de los tuyos, y devolverlos al acabar |
| `src/ui/goals-intro.ts` | La carátula «METAS DE HOY» al entrar en las gafas (8 s, con todo lo demás oscurecido) |
| `src/combat/career-hub.ts` | Tu carrera en el juego: dónde se guarda, tu meta y tu peso, qué modos y ejercicios se pueden jugar ya y los trofeos |
| `src/modes/arcs/` | El modo Arcos: `arc.ts`, `patterns.ts`, `obstacles.ts` y `state.ts` son la lógica de RepArena (sin IWSDK, con pruebas y comparados); `arcs-system.ts` los pinta, suena y avisa. Los objetos, en `src/scene-assets/arc*.scene-asset.ts` |
| `src/modes/touch/` | El modo Toques: `targets.ts` y `wave.ts` son la lógica de RepArena (sin IWSDK, con pruebas y comparados); `touch-system.ts` pinta los aros de neón, diamantes y pulsadores, suena y puntúa. Los objetos, en `src/scene-assets/touch.scene-asset.ts` |
| `src/modes/bars/` | El modo Barras: `detect.ts`, `targets.ts`, `place.ts` y `equip.ts` son la lógica de RepArena (colgarse, subidas, objetivos, colocar y recordar los aparatos; sin IWSDK, con pruebas y comparados); `bars-system.ts` pinta, suena y puntúa; `hang-scene.ts`, lo de debajo del que cuelga (el charco con tentáculos, el remolino y el bosque nocturno). Los objetos, en `src/scene-assets/bars.scene-asset.ts` |
| `src/env/` | Los entornos: `env-system.ts` (el fondo realista con el `DomeTexture` de IWSDK, las luciérnagas y qué entorno toca), `scenery.ts` (el bosque de día y la isla pirata: modelos con instancias, cielo, suelo y mar) y `placement.ts` (dónde va cada modelo, de RepArena, con prueba) |
| `src/services/` | Los servicios con la red y el Bluetooth (sin IWSDK, comparados con RepArena): `spotify.ts` (conectar, listas, reproductor, fundidos), `bpm.ts` (el compás de cada canción), `xfer.ts` (pasar datos por código y sincronizar), `pulse.ts` (pulsómetro) y `hub.ts` (los crea con el navegador de verdad) |
| `src/core/beat.ts`, `src/core/beat-hub.ts`, `src/core/dev.ts` | El reloj de pulsos de la música (y el baile de las luciérnagas), el pulso del juego y el modo desarrollador (tabla de dificultad y canciones de cada ejercicio) |
| `src/ui/screen.ts`, `src/ui/screens/` | La pantalla genérica del menú (título y filas de texto o botones) y lo que se abre con ella: música, pasar datos, sincronización y teclado |
| `src/page/music-page.ts`, `xfer-page.ts`, `pulse-page.ts`, `dev-page.ts` | La página: Spotify, pasar datos y sincronizar, pulsómetro y la tabla del desarrollador |
| `src/core/playable.ts` | Qué modos y ejercicios se pueden jugar ya (lo leen el menú, las misiones y la página) |
| `src/core/state.ts` | Lo que comparten los sistemas (fase, cabeza, bola, marcador) |
| `src/core/schema.ts` | Los 186 ajustes de RepArena (claves, valores de serie, límites, grupos, condiciones y explicaciones) |
| `src/core/settings.ts` | Cargar, guardar y cambiar los ajustes (los mismos datos que RepArena), cada modo con cada ejercicio, los rangos con su tabla y la dificultad creciente |
| `src/core/values.ts`, `src/core/rules.ts` | Los valores de ahora y lo que se deduce de ellos (de pie, en el suelo, qué enemigos salen, cómo se apunta…) |
| `src/core/catalog.ts`, `src/core/dev-state.ts` | Ejercicios, modos, enemigos y rangos; el modo desarrollador y su tabla |
| `src/audio/sound.ts` | El sonido sobre el de IWSDK (AudioSource): los efectos de RepArena (`SND`), volumen, ambiente y compresor |
| `src/audio/catalog.ts` | Los sonidos por nombre: el archivo de cada uno (el tuyo o el de serie) y a qué distancia se oye |
| `sounds/` | Tus sonidos (la lista, en su `LEEME.md`) y los de serie (`de-serie/`, grabados con `tests/sonidos.mjs`) |
| `src/ui/board-ring.ts` | El rosco doble del marcador (la oleada, tu récord y la racha), pintado en un lienzo |
| `src/ui/view.ts` | Dónde salen los avisos de la vista: siguen la mirada sin ladearse; tumbado, en el suelo bajo la cara; no tapan lo que viene |
| `src/ui/view-panels.ts` | Los avisos de la vista (el del centro y el breve), la caricatura del ejercicio y la carátula del duelo |
| `src/ui/demo-art.ts` | La caricatura del ejercicio (el monigote que lo hace, el rayo y el texto), pintada en un lienzo |
| `src/ui/duel-art.ts` | La ilustración de la carátula del duelo (tú contra el jefe, el VS y las placas), pintada en un lienzo |
| `src/ui/canvas-kit.ts`, `src/ui/canvas-panel.ts` | Lo común de lo que se pinta en un lienzo: las letras, el tamaño que cabe y el cartel |
| `src/combat/duel.ts` | Quién es el jefe de la ronda y tu récord, para la carátula del duelo |
| `src/input/thumbs.ts` | El pulgar arriba y los botones del mando recién pulsados (saltar la carátula) |
| `src/ui/fonts.ts` | Pone las letras de RepArena (con tildes) en los paneles |
| `src/core/diag.ts`, `src/ui/diag-system.ts`, `src/ui/key-name.ts` | El registro de diagnóstico: los últimos 30 s de las manos, el rayo, las teclas y los tirones; se guarda al salir de la VR o desde la pausa, y la página lo copia o descarga |
| `src/ui/fit.ts`, `src/ui/fit-text.ts` | Que las letras quepan en sus botones y cajas: encoge la que no cabe (la fila entera a la vez) en los paneles que se ven |
| `src/ui/menu.ts` | Los menús en VR: el principal, Opciones y la explicación de cada ajuste; dónde salen y la nitidez |
| `src/ui/fields.ts` | Lo que enseñan los menús de cada ajuste y lo que hace tocarlo, las pestañas y la ficha de la ronda, sin IWSDK |
| `src/input/hand-system.ts` | Las manos y los mandos en cada fotograma (leídos como en RepArena, en `hands` y `head`), el cuerpo para las manos perdidas, la vibración y «Mandos como manos» |
| `src/input/hand-filter.ts` | La lectura de las manos de RepArena: el suavizado para pintarlas, los saltos imposibles, la mano perdida (su gesto o el cuerpo) y el filtro `HF` de las dos manos en la pesa |
| `src/input/hand-model.ts` | Lo que el juego sabe de cada mano (muñeca, articulaciones, pellizco, gatillo, agarre, rayo) y el puño |
| `src/input/throw.ts` | La sacudida que lanza el rayo y el gatillo con mandos como manos (los de RepArena), sin IWSDK |
| `src/input/gaze-lock.ts`, `src/input/punch.ts`, `src/input/target.ts` | La mirada que fija al enemigo, el puñetazo y lo que ven de cada enemigo (de RepArena, sin IWSDK) |
| `src/input/controller-hand.ts` | La mano de IWSDK que agarra el mando, con sus fallos de esta versión arreglados |
| `src/input/skin-hand.ts`, `src/input/glove-system.ts`, `src/scene-assets/glove.scene-asset.ts` | Las manos que se ven («Manos que se ven»): los guantes robóticos de RepArena (de serie) o la mano de IWSDK, opaca |
| `src/input/hold.ts`, `src/ui/solid-keys.ts` | Las teclas sólidas: la mano que se ve se queda apoyada en el panel que toca (con el mecanismo de IWSDK para moverla) |
| `src/input/input-models.ts` | Sirve desde el juego los modelos de las manos y los mandos (sin descargarlos de internet) |
| `src/assets.ts`, `src/scene-assets/arena.scene-asset.ts` | Los recursos: suelo de arena, aro del jugador, cajas, rocas, compuertas, valle, nubes, zombis y paneles |
| `public/scenes/main.iwsdk.scene.json` | La escena: cielo, neblina, suelo, compuertas, valle, nubes, cajas y rocas con su física, paneles y luces |
| `public/ui/*.uikitml` | Los paneles: menú principal, Opciones, explicación de un ajuste, marcador, los dos del suelo (avisos y carga) el de entre oleadas, las cartas de mejora, la columna HOY, el trofeo dorado, el resumen, la pausa y el botón MENÚ de la muñeca |
| `public/models/` | Los enemigos: zombis, velociraptor, piratas, monstruitos (también los que vuelan), diablillo y puglin, y las animaciones de la biblioteca (Quaternius; ver su `LEEME.md`) |
| `public/retratos/` | El retrato de cada enemigo para su ficha en Rivales (cortados de la hoja de RepArena) |
| `public/fonts/` | Las letras (Rubik y Bungee, OFL) |
| `public/input-profiles/` | Las manos y los mandos (MIT) |
| `tests/unit/` | Pruebas de la lógica (Vitest) |
| `tests/e2e/run.mjs` | La partida simulada (Playwright), sobre la versión construida servida en una subcarpeta |
| `tests/compare/` | Comparaciones con el código original de RepArena (`RA_DIR=… npm run test:compare`) |
