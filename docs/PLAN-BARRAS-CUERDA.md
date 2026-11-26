# Barras: la aventura en la cuerda del remo invertido

Pedido del usuario (24/11/2026): llevar el avance de la Travesía al remo invertido de Barras, «de modo que el usuario vea que
avanza en el mundo virtual al hacer cada remo y convertir dicho avance en una aventura», en vertical o en una pendiente muy
pronunciada. De las cuatro ideas propuestas (A, la tirolina en cuesta; B, la ascensión vertical; C, la pared rocosa; D, remar
por un río), eligió:

1. **A con tramos de B**: cuelgas boca arriba de una cuerda tendida en una cuesta muy empinada sobre un cañón y, a trozos,
   en vertical (la chimenea).
2. **Resbalar mínimamente** si dejas de remar (nunca más abajo de la repisa de salida).
3. **Una opción dentro de Barras** («Remo invertido: aventura en la cuerda»), con **una paralela o dos**.

La pared rocosa (C) queda para las dominadas, donde de verdad cuelgas en vertical mirando al frente.

## Cómo se ve y por qué

> **Rehecha (25/11/2026, opción A del usuario y su idea 1 de los mundos)**: tras probarla en las gafas, el usuario vio que la
> cuerda «hacía pliegues antinaturales, como si tuviera anclajes suspendidos en el aire», que las plataformas no tenían sentido,
> que el avance era continuo (no a tirones) y que las cascadas salían de ninguna parte. Ahora: **un solo cable, del valle a la
> cima**, tenso como el de un teleférico (su cuesta crece poco a poco, de unos 25° a unos 48°: sin pliegues), de la estación del
> valle a la de la cima; **cada tramo acaba en un cofre colgado del cable** (a un lado de las paralelas) y el último, en la
> estación; debajo, **una montaña de abajo arriba**: el valle (prados, flores, el lago), el bosque (pinares con claros), la
> garganta (el río entre paredes de roca, con sus cascadas) y la cima (roca, peñas y hierba rala). **Todo nace de algo**: un
> manantial de la cima da el arroyo que cae por la cabecera de la garganta; cada cascada de sus paredes, un arroyo que corre por
> lo alto desde su manantial; el río baja por la garganta y el bosque hasta el lago del valle. **Cada remo, un tirón** (subes
> mientras tiras; al bajar, algo de inercia). La montaña mide como poco 110 m de cable: en una ronda más corta se sube solo su
> principio y la estación queda en un mirador. Lo de abajo (torres, subidas verticales, plataformas y mundos con portal) queda
> como historia.


- **La escena, la A de los bocetos** (elegida por el usuario tras ver el primer PR: el cañón de rocas y la cuerda con olas eran
  «muy poco atractivos»; «la tirolina en la realidad nunca tiene esas curvas»; «los árboles nunca están flotando»): torres de
  madera sobre la ladera de un valle alpino, de plataforma en plataforma.
- **Como una tirolina de verdad**: cada tramo, un cable recto y tenso, con su cuesta fija (de 30° a 42°) y una comba leve; al
  llegar a la torre, lo último en vertical por una cuerda fija hasta su plataforma. La cuerda pasa por una polea en cada torre
  (la esquina, redondeada: sin tirones al cambiar de cuesta).
- **Nada flota**: la ladera es un suelo de verdad (una malla), las patas de las torres y los troncos de los árboles se
  apoyan en él, y los árboles quedan lejos de la cuerda (lo comprueba `tests/unit/bars-rope.test.ts`).
- Tumbado mirando al cielo solo se ve bien lo que está casi encima: el mundo no se inclina (el cielo sigue arriba: la
  gravedad que sientes casa con lo que ves) y, en la subida vertical, la plataforma de la torre se ve sobre ti.
- La cuerda pasa por lo que agarras: con **dos paralelas**, dos cables (cada paralela es un trozo del suyo); con **una**,
  cruzada sobre ti, un cable por encima de su centro y la barra colgada de una polea.
- Subir es que el valle entero baje y venga hacia ti (la cuerda sube hacia tus pies: tumbado, lo que se acerca se ve sin echar la cabeza atrás); las paralelas virtuales no se mueven (son tu ancla).

## Los PR

- [x] **PR 1 · El armazón jugable**: el ajuste, el recorrido (cables rectos de torre en torre, la subida vertical al final de
  cada tramo y la plataforma con su cofre), el avance por remo (como la Travesía: más ritmo, más deprisa; bajar aguantando la
  carga ×2-×4, un tirón de más), resbalar sin remar (como mucho 10 cm/s, tras 1,2 s), la ladera con sus pinos y piedras, las
  torres, los montes lejanos y «Faltan N m» en el marcador. Cada tramo pide «Repeticiones por oleada» × 1,7 m.
  **Los fondos realistas según la altura** (la propuesta 2, elegida por el usuario): `ropePano` (Alpes desde el valle →
  montaña y valle → colinas con nubes → la cima en el último tramo; cambia al llegar a cada plataforma), girada hacia donde
  subes (`EnvSystem.ropeYaw`), con la bruma de su color (`ROPE_HAZE`, `ROPE_FOG`) y el mar de nubes del risco (`CloudSea`, con
  el borde más alto) tapando el suelo de la foto. Sin sombras en la ladera (en el emulador, sin tarjeta gráfica, se caía el
  navegador; desde la cuerda no se ven).
- [x] **PR 2 · Retos y premios** (los movimientos que no son el remo): aguantar arriba, pegado a la cuerda (lo que pasa por
  debajo); quedarse abajo con los brazos estirados (un águila que pasa rozando el cable); la cabeza a un lado (piedras que caen
  de la torre, con su sombra); una explosiva (un tramo roto). Premios: frutas que se cogen al subir el pecho y el cofre de la
  plataforma, que se abre. Hecho así: el enjambre (abejas del catálogo) baja por el cable hasta tu cara (quedarse abajo), la
  ráfaga (estelas de viento sobre ti: aguantar arriba), la piedra que cae hacia donde estaba tu cara (apartar la cabeza 8 cm) y
  el cable deshilachado (un remo explosivo: el `fast` del detector); frutas del kit a la altura de tu cabeza arriba, y el cofre
  de la plataforma, abierto (`Chest_Gold`) con sus premios (`HOOKS.prize`). En `rope-trials.ts` (lógica pura, con
  `tests/unit/bars-rope-trials.test.ts`) y `rope-trials-look.ts`.
- [x] **PR 3 · Los mundos y el jefe**: la garganta de la cascada (B), los árboles gigantes de la selva (C) y del barco al
  faro del acantilado (D), de los bocetos; el jefe, un águila o el dragón que lanza cosas desde arriba. Hecho así: `rope-worlds.ts`
  (qué mundo y qué foto en cada tramo: `worldOf`, `worldPano`, `worldStarts`), `ropeDecoPuts(…, world, seaY, shipH)` (lo de
  cada mundo y las torres de cada estilo: madera, pilar de roca, árbol gigante), `RopeScene.setWorld` (el suelo, el mar de la
  costa —`Sea` de la Travesía—, las cascadas y el destello); el jefe, `rope-boss.ts` (lógica pura: `RopeBoss`, con
  `tests/unit/bars-rope-boss.test.ts`; la cuerda se para con `RopeRun.hold`) y `rope-boss-look.ts` (el dragón del catálogo y
  las bolas de fuego de los jefes de la Travesía, `Missile`).

## Dónde está

`src/modes/bars/rope.ts` (lógica pura: `RopeCourse`, `RopeRun`, `ropeDecoPuts`; pruebas en `tests/unit/bars-rope.test.ts`),
`src/modes/bars/rope-scene.ts` (lo que se ve: la ladera, una malla hecha una vez por ronda; los pinos, las piedras, las torres y los cables, con instancias) y `BarsSystem` (`ropeOn`, `stepRope`, `placeRope`); el ajuste, `barRope`.

## Retos en la cuerda (25/11/2026)

Pedido del usuario: «más emocionante, con enemigos que esquivar colgado, colgarse de una mano…». De las propuestas («Retos en
la cuerda»), todos menos la persecución (9) y los cofres con sorpresa (12):

- [x] **Parte 1 · Esquivar y turbo**: los murciélagos (1), el cangrejo del cable (2), los tiradores (3), la abeja (4) y el turbo
  por racha (11); cada zona, sus retos.
- [x] **Parte 2 · Agarre y fuerza**: el remo a una mano (5), coger con una mano (6), aguantar a media altura (7) y los remos
  lentos (8).
- [x] **Parte 3 · Un jefe en cada zona** (10): el demonio en el bosque, el cíclope en la garganta y el yeti en la cima, además del
  dragón.

