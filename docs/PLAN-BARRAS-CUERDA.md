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

- Tumbado mirando al cielo solo se ve bien lo que está casi encima. Por eso el mundo no se inclina (el cielo sigue arriba:
  la gravedad que sientes casa con lo que ves) y **cada tramo acaba en la chimenea**: subes en vertical entre dos paredes de
  roca y, arriba, ves la repisa que es la meta del tramo.
- La cuerda pasa por lo que agarras: con **dos paralelas**, dos cables (cada paralela es un trozo del suyo); con **una**,
  cruzada sobre ti, un cable por encima de su centro y la barra colgada de una polea.
- Subir es que el cañón entero baje y vaya hacia tus pies; las paralelas virtuales no se mueven (son tu ancla).

## Los PR

- [x] **PR 1 · El armazón jugable**: el ajuste, el recorrido (la cuesta de unos 28° a 52° con olas largas, la chimenea al
  final de cada tramo y la repisa con su cofre), el avance por remo (como la Travesía: más ritmo, más deprisa; bajar
  aguantando la carga ×2-×4, un tirón de más), resbalar sin remar (como mucho 10 cm/s, tras 1,2 s), el cañón (las rocas del
  risco, montes lejanos y algún pino) y «Faltan N m» en el marcador. Cada tramo pide «Repeticiones por oleada» × 1,7 m.
- [ ] **PR 2 · Retos y premios** (los movimientos que no son el remo): aguantar arriba, pegado a la cuerda (lo que barre por
  debajo: el chorro de una cascada, una rama); quedarse abajo con los brazos estirados (un pájaro que pasa rozando la cuerda);
  la cabeza a un lado (piedras que caen, con su sombra); una explosiva (un tramo roto de la cuerda). Premios: frutas que se
  cogen al subir el pecho y el cofre de la repisa, que se abre.
- [ ] **PR 3 · Los mundos y el jefe**: el cañón, la cascada, el risco y las islas del cielo (las chimeneas, hacia ellas);
  el jefe, un águila o el dragón que lanza cosas desde arriba (boca arriba se ven muy bien).

## Dónde está

`src/modes/bars/rope.ts` (lógica pura: `RopeCourse`, `RopeRun`, `ropeDecoPuts`; pruebas en `tests/unit/bars-rope.test.ts`),
`src/modes/bars/rope-scene.ts` (lo que se ve) y `BarsSystem` (`ropeOn`, `stepRope`, `placeRope`); el ajuste, `barRope`.
