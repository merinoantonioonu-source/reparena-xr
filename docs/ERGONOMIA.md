# Ergonomía: postura, mirada y tempo de cada ejercicio (Combate, Toques y Barras)

Inventario del apartado 4.3 de `docs/PLAN-ERGONOMIA-Y-CUESTAS.md`. La idea: cada postura tiene su **mirada natural** (4.1) y su
**tempo natural** (4.2), y el juego debe pedir las cosas donde cae esa mirada y con el tiempo que ese cuerpo necesita.

Cómo leerlo:

- Los números entre paréntesis son `archivo:línea` (para quien revise el código). Todo lo que dice «Choque» sale de leer el
  código; lo marcado **sospecha** no se ha podido confirmar sin probarlo en las gafas (se pide el diagnóstico al usuario).
- **Aplicado** (el usuario: «aplica todas tus propuestas en ergonomía y ya vamos corrigiéndolas poco a poco»): todas las de la
  sección 6 salvo «avisar de la postura siguiente un objetivo antes» en el combinado de Toques, que va contra su regla «no se
  avisa de lo que viene». Dos con matices: lo alto de Toques (`reach`) queda a unos 30° sobre los ojos, no 20 (a 20° no llegaba
  la mano estirada), y el swing y el peso muerto van al aviso breve (como los curls) en vez de a un panel a la altura del
  pecho (a 3 m de alto tapaba la boca de la compuerta). Las que tocaban REGLAS, apuntadas allí.

## 0. Lo común a todos (para no repetirlo en cada ficha)

**Dónde sale cada cosa, por defecto**

- **Compuertas**: a 11 m, la del centro y dos a ±4,62 m de lado (`src/combat/game.ts:777`, `src/combat/gates.ts:151`). De ahí
  salen los enemigos de tierra (andan por el suelo) y los voladores. Tiempo para alcanzarte: 14 s en tierra (`walkTime`,
  `src/core/schema.ts:90`) y unos 11 s los voladores (3,5 km/h desde 11 m). Con la mirada natural cabe de sobra.
- **Bola de energía** (`src/combat/game.ts:2005-2007`): a 1 m por delante del pecho, 32 cm por debajo de los ojos (unos 18° por
  debajo de la horizontal: es una mirada natural de pie). Si la cabeza baja de 1,0 m, pasa a 12 cm por debajo de la cabeza
  y nunca por debajo de 22 cm del suelo. En el superman, entre las manos (`supBallAt`, `game.ts:1331`). En la plancha con un
  brazo, en la mano levantada.
- **Marcador** (`placeBoard`, `game.ts:748`): a un lado (a unos 50-69° de la mirada, a 5 m y 2,15 m de altura, 4,2 m de ancho,
  `game.ts:786`); en las batallas diminutas, tumbado a 95 cm por delante, a 45° (`game.ts:752-760`).
- **Panel de indicaciones** (`src/ui/guide-spot.ts:31`): de pie, encima de la compuerta del centro (a 11,2 m y 5,3 m de altura:
  18° por encima de los ojos de pie con 1,6 m, 21° con la cabeza a 1,0 m). **Tumbado o en plancha no hay panel** (devuelve
  `null`) y el texto pasa al aviso breve.
- **Aviso breve** (`src/ui/view-panels.ts:60`): a 1,2 m de la cara, 40 cm por debajo del centro de la vista; se aparta si tapa algo.
  De pie va con la cabeza sin ladear; tumbado mirando abajo o arriba, en el suelo o el techo (`src/ui/view.ts:39-62`).
- **Aviso del suelo** (`floorWarn`, `game.ts:563`): solo si la cabeza está a más de 0,9 m (`game.ts:140, 569`). Aparece a
  `1,1 × altura de la cabeza` por delante (entre 0,5 y 2,1 m): de pie, unos 43° por debajo de los ojos.

**Cuatro choques que valen para varios ejercicios** (se citan en las fichas como C1-C4)

- **C1. La bola salta 20 cm al cruzar 1,0 m de altura de cabeza** (`game.ts:2007`). Sentadilla honda, zancada profunda,
  sentadilla con salto, peso muerto y fondos en silla cruzan esa altura en cada repetición: al bajar de 1,0 m la bola se
  eleva 20 cm de golpe (de «cabeza − 32 cm» a «cabeza − 12 cm»). **Sospecha**: no se ve si el dibujo de la bola lo suaviza
  (`fx.ball.update`, no comprobado). Es justo cuando miras la bola para soltarla.
- **C2. El panel de indicaciones queda en el borde de lo cómodo** (`guide-spot.ts:44-50`): 18-22° por encima de los ojos, y los
  avisos que más importan («¡Baja más!») salen cuando estás abajo, con la cabeza baja y la vista al frente. 4.1 da hasta 20°
  como «se ve bien». Hay que levantar la vista justo en el momento más incómodo.
- **C3. El aviso del suelo no se ve en la postura donde más hace falta**: no sale con la cabeza por debajo de 0,9 m
  (sentadilla honda, fondos abajo) y, colgado en Barras (cabeza a 1,7 m), cae a unos 43° por debajo de los ojos, donde
  4.1 dice que colgado «lo de abajo no se ve».
- **C4. El marcador, a 50-69° del frente** (`game.ts:786`), fuera de la franja de ±45° que 4.1 da por cómoda. Por diseño (para no tapar
  las compuertas; REGLAS: «a un lado, el doble de grande»): se lee girando la cabeza, y en zancada girar la cabeza descoloca (4.1).

---

## 1. Las tres sospechas del plan, primero

### 1.1 Plancha lateral (`splank`, Combate)

- **Postura**: tumbado de lado, sobre el antebrazo, cadera arriba y cuerpo recto. **Mirada natural**: horizontal, de lado al
  eje del cuerpo (cuello neutro, cabeza en el eje del cuerpo, que está casi tumbado: la vista queda a unos 30-70 cm del suelo).
- **Tempo**: el disparo sale cada `splHold` = 3 s aguantando (`src/core/schema.ts:74`); la repetición vale `splHold + 0,5`
  (`src/combat/waves.ts:83`). No es un gesto rápido: es un aguante. No choca con 4.2.
- **Dónde salen**:
  - Bola: 1 m por delante, a `cabeza − 12 cm`, no menos de 22 cm (`game.ts:2007`); delante = `GAME.fwd`.
  - Enemigos: de las compuertas a 11 m, no es batalla diminuta (`isTiny` solo incluye flexiones, pica, inchworm y plancha con un
    brazo, `src/core/rules.ts:26`). Voladores bajos (`lowFly` = referencia de la cadera + 3 cm, entre 0,3 y 0,8 m, `game.ts:1938`).
  - Marcador: el de siempre, a un lado (C4). Tumbado de lado, el «lado» del marcador y el lado del cuerpo no tienen relación.
  - Avisos: sin panel; el aviso breve; el del suelo nunca (cabeza < 0,9 m, `game.ts:569`).
- **Choques con 4.1 y 4.2** (**sospechas**, sin confirmar en las gafas):
  1. **La vista no pasa por el sitio donde están las compuertas, sino por donde se mira al calibrar**: el mundo se recoloca
     con la dirección en la que miras (`recenter(true, bodyYaw())`, `game.ts:1157`; `bodyYaw` usa la mirada si es casi
     horizontal, `src/ui/ra/menu-core.ts:163-170`). Funciona si calibras mirando de frente; si calibras mirando al suelo, manda
     la coronilla, que en plancha lateral apunta **a lo largo del cuerpo, a 90° de tu mirada**: las compuertas quedan a un lado.
  2. **La bola se desvía al mirar abajo**: `bodyDir` (`src/input/body-dir.ts:15-22`) mezcla la coronilla cuanto más miras al
     suelo. En plancha lateral la coronilla apunta de lado: al bajar la mirada la bola se va hacia un costado, no hacia delante.
  3. **El texto va derecho en el mundo pero tu cabeza está ladeada**: los avisos «nunca se ladean» (`view.ts:57-62`, quita el giro
     de la cabeza), y la rama de «tumbado» solo se activa mirando más de 37° arriba o abajo (`view.ts:42`). Con la vista
     horizontal y la cabeza tumbada 60-90°, el aviso breve se lee **girado 60-90°**.
  4. El marcador (C4) a un lado de la compuerta: con la cabeza tumbada, hay que girar el cuello en un eje que ya está tensado.
- **Propuesta** (para que el usuario apruebe): en la plancha lateral, (a) colocar el mundo y la bola solo con la mirada, nunca
  con la coronilla (`bodyDir` y `bodyYaw` sin la mezcla); (b) que el aviso breve herede el ladeo de la cabeza en este ejercicio
  (toca REGLAS: «los avisos nunca se ladean con la cabeza»; hoy esa regla está pensada para de pie); (c) marcador delante, bajo
  las compuertas, en vez de a un lado. Antes, pedir su diagnóstico de las gafas (`src/core/diag.ts`) para confirmar la 1 y la 3.

### 1.2 Fondos en silla (`dips`, Combate)

- **Postura**: sentado en el borde de una silla, manos detrás y apoyadas; se baja doblando los codos. Cabeza a 0,55-1,5 m
  (`game.ts:1130`). **Mirada natural**: al frente, algo arriba (el pecho va erguido).
- **Tempo**: repetición 2,4 s (`waves.ts:87`); pide bajar a 15 cm de profundidad y volver (`dipDepth`, `schema.ts:67`). Bajar
  hasta 90° de codo cabe en ≈1 s (no está en 4.2; **sospecha**: parecido a «Bajar la flexión», 0,8 s). Con `perfectTime` = 1,2 s
  se exige aguantar abajo.
- **Dónde salen**:
  - Bola: 1 m por delante, a `cabeza − 32 cm` (o `−12 cm` si la cabeza baja de 1,0 m): **sentado la cabeza va a 0,9-1,1 m,
    así que la bola cruza el umbral de 1,0 m en cada fondo y da el salto de 20 cm (C1)**.
  - Enemigos: compuertas a 11 m (no es diminuta, `rules.ts:26`); a la altura de ojos sentados (~1,1 m) se ven bien.
  - Marcador: a un lado (C4). Sentado, además, no puedes girar el torso: tienes las manos en la silla.
  - Avisos: **sí hay panel de indicaciones** (`lyingEx()` no incluye `dips`, `src/ui/view-panels.ts:49`), encima de la
    compuerta, a 11,2 m y 5,3 m de altura: con ojos a 1,1 m son **21° hacia arriba** (C2). Aviso del suelo: no sale con la
    cabeza por debajo de 0,9 m; abajo del todo del fondo, casi nunca (C3).
- **Choques**: la mirada es «al frente y arriba» y el panel cae justo en el borde de ahí (sí, es lo que pedía el plan, pero ya
  está a 21°, no por debajo de 20°). El aviso «¡Baja hasta los 90° de codo!» (`floor.ts:110-121`) llega con la cabeza abajo; el
  salto de la bola (C1) es la queja probable. «Vuelve a la silla» sale si la cabeza sube 0,4 m sobre la referencia
  (`floor.ts:112`).
- **Propuesta**: (a) bajar el panel de indicaciones a unos 12-15° (altura 4,3 m a 11 m) **solo con ejercicios sentados**; (b) suavizar
  el salto de la bola en el umbral de 1,0 m con una transición continua (no toca REGLAS, solo el dibujo de la bola).

### 1.3 Abdominales (`abs`, Toques; también el `combo` cuando la base es abdominales)

- **Postura**: tumbado **boca arriba**, rodillas dobladas, y se sube el tronco 25-55° (`abMin`, `abMax`, `schema.ts:122-123`);
  la cabeza va a 3-60 cm del suelo (`game.ts:1130`). **Mirada natural**: al techo en reposo; al subir el tronco, hacia las rodillas.
- **Tempo**: el que pone el modo, no el ejercicio: un objetivo cada `tchGap` = 2,4 s (`schema.ts:115`, `waves.ts:76`, mínimo
  0,8 s). Un abdominal limpio cabe en 2-2,6 s (`waves.ts:87`: 2,6). A 2,4 s va muy justo; **a 0,8-1,5 s no se puede**
  (la propia tabla de 4.2 pide ×1,5 + 0,4 s). Lo que cuenta es la vuelta a la postura de partida entre uno y otro
  (`touch/targets.ts:~275`).
- **Dónde salen**:
  - **Objetivos**: el diamante de arco en el tronco a `R` = 45-65 cm de la cadera, hacia los pies
    (`src/modes/touch/targets.ts:150-165`); salen desde 3,5 m hacia los pies, a unos 60 cm del suelo (`targets.ts:178-182`), y
    **entran por el horizonte del suelo, a ~80° de la mirada natural (el techo)**. Solo los ves al subir el tronco.
    El «oblicuo» y el «abdominal lateral» salen a los costados, junto a rodillas y cadera: entran por el lado.
  - Bola: no hay bola de Combate (en Toques tocas los objetivos). Compuertas: las de Toques en el frente, hacia los pies (también fuera de la vista).
  - Marcador: lo pone la partida con `placeBoard`, **a un lado, a 2,15 m de altura y 5 m**. Boca arriba, mirando al techo,
    queda fuera de la vista (4.1: «el marcador de lado» no se ve boca arriba).
  - Avisos: sin panel (`guide-spot.ts:32`); el aviso breve va en el techo (`view.ts:43-55`), que sí es la mirada natural. Aviso del suelo: no.
- **Choques**: (1) **lo que se pide queda fuera de la mirada en reposo**: el objetivo y su llegada están a ras de suelo hacia los pies, y
  el techo está vacío; (2) el marcador, invisible; (3) el aviso breve sí está bien situado (techo), pero lo que dice («Vuelve a la posición de
  partida», «Con la mano X») es lo que no ves ni tocas todavía; (4) el tempo mínimo de `tchGap` (0,8 s) es un ajuste libre que rompe 4.2.
- **Propuesta**: (a) boca arriba, poner el marcador **en el techo, sobre la cara** (toca REGLAS: «el marcador, siempre flotando a un
  lado»; pedir permiso); (b) que el objetivo nazca a la altura de la mirada al subir (tronco a 25°), no a ras de suelo; (c) subir el mínimo de
  `tchGap` en ejercicios de suelo a ≥ 2 s (o avisar en el menú).

---

## 2. Combate de pie (11 ejercicios)

**Los de pie comparten**: mirada al frente y algo abajo; compuertas a 11 m; bola a 1 m, 18° abajo; marcador a un lado (C4);
panel de indicaciones a 18° arriba (C2); aviso del suelo a unos 43° abajo si la cabeza está a más de 0,9 m. Los tempos
salen de `REP_TIME` (`src/combat/waves.ts:70`). La separación entre enemigos sale de `spawnGap`
(`waves.ts:194`): se ajusta al tiempo de la repetición, así que no hay choque de tempo en ninguno.

| Ejercicio | Postura y mirada | Rep (s) | Gesto clave | Choque principal |
| --- | --- | --- | --- | --- |
| Sentadilla (`squat`) | De pie, al frente | 2,3 | Bajar 0,9 s (honda) | C1 (la bola salta al bajar de 1,0 m) y C2 |
| Zancada (`lunge`) | De pie, tronco erguido, sin girar la cabeza | 2,6 | Bajar 0,9 s | C4 (girar la cabeza descoloca) y C1; el «Ahora con la pierna X» sale por el panel arriba |
| Sentadilla con salto (`jsquat`) | De pie, al frente | 2,6 | Saltar 0,45 s | C1; el aviso «¡Salta al subir!» llega con ~0,45 s de gesto |
| Press de sentadilla (`thruster`) | De pie, pesas en los hombros y arriba | 3,4 | Bajar y subir las pesas | Las manos suben por encima de la cabeza: la bola (a 1 m) y el panel están a distinta altura que las manos; sin choque grave |
| Sentadilla frontal con elevación (`frontsq`) | De pie, brazos al frente | 3,0 | Bajar con brazos estirados | C1 |
| Swing (`swing`) | De pie, cadera atrás y lanzar | 2,0 | Bisagra de cadera | Con la cadera atrás **la cabeza baja y se mira al suelo**: el panel (arriba) y la bola (al frente) quedan fuera de la vista un instante (**sospecha**) |
| Peso muerto con remo (`dlrow`) | De pie, espalda recta e inclinada | 3,0 | Bajar el peso | Inclinado, la mirada cae al suelo cerca de los pies: el panel de arriba **no se ve** en la bajada; la bola, a 1 m, sí (C1) |
| Curl (`curl`) | De pie, al frente | 1,3 | Subir la pesa al hombro | Es el más rápido de todos (1,3 s): el aviso «Sube hasta el hombro» no da tiempo a leerse (4.2: ×1,5 + 0,4 s = 2,35 s) |
| Curl con barra (`curl2`) | De pie, al frente | 2,0 | Subir la barra | Igual que el curl, algo menos |
| Elevación frontal (`fraise`) | De pie, brazos estirados al frente | 2,4 | Subir a la altura de los hombros | Las manos tapan la bola y la mirada (la bola, a 1 m por delante): sin choque grave |
| Antebrazos (`twist`) | De pie, la barra con las dos manos | 1,6 | Girar las muñecas | Hay que ver las dos manos (calibración, `game.ts:1130`); «Mira la barra» se dice en el panel de arriba: **hay que apartar la vista de la barra para leerlo** |

Observaciones concretas:

- **Curl y curl con barra**: el gesto dura 1,3-2,0 s y el aviso lo ves en el panel alto. Con la regla de 4.2 (×1,5 + 0,4 s) sale 2,35 s
  para el curl. **Propuesta**: en los dos curls, el aviso breve de la vista (a 1,2 m, justo bajo la mirada) en vez del panel alto:
  se lee sin soltar la barra de la vista (no toca REGLAS, solo el sitio del aviso).
- **Swing y peso muerto**: el aviso del panel alto cae donde no se mira en medio del gesto. **Propuesta**: en los ejercicios con
  tronco inclinado, el panel baja a la altura del pecho del jugador (3 m), o se repite el aviso en el suelo (sí sale: cabeza > 0,9 m).
- Todos los de pie: **C1, C2 y C4** (propuestas en la sección 6).

---

## 3. Combate en el suelo y sentado

### 3.1 Flexiones (`pushup`) y plancha con un brazo (`plank1`) e inchworm: batalla diminuta (`isTiny`)

- **Postura**: plancha (manos en el suelo, brazos estirados); el inchworm empieza de pie (cabeza > 1,1 m, `game.ts:1130`) y se
  camina con las manos hasta la plancha. **Mirada natural**: al suelo, 30-60 cm por delante de las manos (4.1).
- **Tempo**: flexión 2,4 s (`waves.ts:87`: gesto «bajar» 0,8 s, «explosiva» 1,2 s en 4.2); plancha con un brazo 2,2 s;
  inchworm 8 s (`waves.ts:87`).
- **Dónde salen**:
  - Enemigos: **cuatro trampillas en el suelo, a 1,15-1,85 m de tu cabeza** (`src/combat/hatch.ts:15-16`; las de la plancha con un
    brazo, a los lados, 0,95-1,45 m); salen pequeños (~20 cm) y a escala. Voladores: de una trampilla, pequeños (`flyers.ts:73`).
    Dentro de los 2,5 m de 4.1.
  - Marcador: tumbado en el suelo a 95 cm por delante, a 45° (`game.ts:748-760`); es la solución ya aprobada por el usuario.
  - Bola: a `cabeza − 12 cm` (cabeza bajo 1 m), 1 m por delante: entra en la mirada (en plancha la cabeza mira 50-75° abajo, 1 m por
    delante del pecho es la zona de las manos). En `plank1`, la bola va a la mano levantada (`game.ts:2005`).
  - Avisos: sin panel; el aviso breve va en el suelo bajo la cara; aviso del suelo no (cabeza < 0,9 m, `game.ts:569`).
- **Choques**: **ninguno grave** (es el modelo que 4.1 pide). Dos detalles: (a) en `plank1`, al levantar una mano la bola se va
  a esa mano; si ves la mano en el borde de la vista es poco cómodo girar el cuello (**sospecha**); (b) en el **inchworm**, al
  llegar de pie a la plancha la cabeza pasa de 1,7 m a 0,3 m: el panel de indicaciones (de pie) desaparece y pasa al breve en
  el suelo justo en el momento de cambiar de postura (el cambio es instantáneo cuando `lyingEx()` se activa, `view-panels.ts:49`).
- **Propuesta**: ninguna salvo vigilar (a) y (b) en el diagnóstico; no hay nada que contradiga 4.1 ni 4.2.

### 3.2 Superman (`superman`)

- **Postura**: tumbado boca abajo; se sube el tronco 8 cm (`supRange`, `schema.ts:81`) y se aguanta 2 s (`supHold`, `schema.ts:83`),
  manos estiradas al frente. **Mirada natural**: al suelo o al frente si se levanta el cuello (no recomendable aguantarlo, 4.1).
- **Tempo**: repetición = `supHold + 3` = 5 s (`waves.ts:82`). El plan ya lo trata en 3.B.
- **Dónde salen**:
  - Bola: entre las manos, 6 cm sobre ellas, nunca por debajo de 12 cm del suelo (`supBallAt`, `game.ts:1331-1340`): bien.
  - Enemigos: **compuertas a 11 m** (`isTiny` no incluye el superman, `rules.ts:26`); voladores bajos a `lowFly` =
    referencia + `supRange` + 8 cm, entre 0,3 y 0,8 m (`game.ts:1938`).
  - Marcador: a un lado (C4). Avisos: breve en el suelo; sin del suelo ni panel.
- **Choques**: **los voladores a 0,3-0,8 m de altura quedan por encima de la mirada natural** (con la cabeza a 10-20 cm del suelo
  y la vista 50-75° abajo, algo a 0,5 m de altura a 1-2 m de distancia está a 70° de la mirada). Y el marcador a un lado
  (C4) que está en otra dirección que la mirada, abajo. 4.1 lo recoge: «lo que vuela a la altura de la cabeza a más de 1 m».
- **Propuesta**: ya en el plan (3.B: bola entre las manos y aguante que protege). Añadir: los voladores del superman, a ras del suelo,
  por delante de las manos (1-2 m), y el marcador tumbado delante como en la plancha (toca REGLAS; REGLAS fija 45° para los de suelo, esto ya lo cumple).

### 3.3 Plancha lateral y fondos: ver 1.1 y 1.2.

---

## 4. Toques (en `src/modes/touch/`: `slam`, `jump`, `abs`, `pushup`, `combo`)

**Lo común**: no hay enemigos ni bola de Combate; los objetivos (aros de neón y diamantes, `src/modes/touch/targets.ts`) llegan en
`tchGap` = 2,4 s (`schema.ts:115`) y esperan delante de ti. De pie salen de **6,5 m** (4 m en realidad mixta, `targets.ts:98`); en el suelo de
**3,5 m** (`targets.ts:178`). Entre un toque y el siguiente hay que volver a la postura de partida (`targets.ts:~260-290`).
Marcador y avisos como en Combate (panel arriba de pie, aviso breve tumbado).

| Ejercicio | Postura y mirada | Tempo | Dónde salen los objetivos | Choque principal y propuesta |
| --- | --- | --- | --- | --- |
| Slam (`slam`) | De pie, al frente; el movimiento pide agacharse, un paso al lado, a ras de suelo o por encima | Un objetivo cada 2,4 s; los gestos de 4.2 (0,4-1,3 s) caben | Amebas a media altura S−dd (`duck`), a un lado 42-62 cm (`lside`), un paso (`lfwd`); diamantes a 30-50 cm (`low`), pulsador en el suelo (`floor`) o a `S+0,5+salto` (`reach`) (`targets.ts:107-120`) | **`reach` queda por encima de la cabeza**: sospecha de que no se ve al ir a por él (4.1: «lo alto y cerca» no se ve); **`floor` y `low` a ras de suelo, cerca de los pies, se ven agachado**: bien. Propuesta: que `reach` se coloque 20° por encima de los ojos como mucho |
| Salto (`jump`) | De pie, al frente | 2,4 s; saltar 0,45 s | Amebas a `S + salto + radio` (por encima de la cabeza) y diamantes `reach` | Mismo problema: la ameba se ve **arriba** y hay que atravesarla con la cabeza saltando, bien; el diamante `reach`, sospecha |
| Abdominales (`abs`) | Boca arriba, mirada al techo | 2,4 s con gesto de 2-2,6 s: justo | A ras de suelo hacia los pies | Ver 1.3 |
| Flexiones (`pushup`) | Plancha, mirada al suelo, 50-75° abajo | 2,4 s; bajar 0,8 s | Aro (`push`) **que llega por el suelo desde 3,5 m** y se para a 6 cm detrás de la cabeza (`targets.ts:178, 96`) | **Llega desde más lejos de lo que 4.1 ve en plancha (2,5 m)**: los primeros 1,0 m de su viaje no se ven (**sospecha**: depende del campo vertical de la gafa y de dónde mires). Propuesta: nacer a 2,5 m en los ejercicios en plancha |
| Combinado (`combo`) | Cambia de postura según la base (de pie, plancha o boca arriba) | 2,4 s + aguante de la plancha (`plankHold` 5 s, `targets.ts:129`) | Los de cada base | **Cada cambio de postura cambia dónde mirar**; se aplican los choques de su base. El aviso «Vuelve a la posición de partida» llega con los dos cambios por medio. Propuesta: avisar de la postura siguiente **un objetivo antes**, en el sitio de la mirada de la actual |

Un choque común a Toques de pie: **`tchGap` puede bajar a 0,8 s** (`schema.ts:115`), menos que una sentadilla honda más la vuelta
(0,9 s + vuelta). Con 2,4 s de serie no es un problema; es un ajuste libre del usuario. Propuesta: un mínimo de 1,5 s si el ejercicio
es de suelo (no toca REGLAS).

---

## 5. Barras (en `src/modes/bars/`: `row`, `pullup`, `hang`)

**Lo común**: las pompas y avispas **se reventan con la cabeza** (`src/modes/bars/targets.ts:1-9`); cada objetivo espera en el punto más
alto de la cabeza (`barTopPoint`, `targets.ts:83`). No se recoloca el mundo en Barras (`game.ts:406, 867-870`): el aparato está en tu
habitación y los objetivos nacen respecto a él. Llegan en `barArrive` = 4 s (`schema.ts:212`) y se escapan tras `barWait` = 12 s
(`schema.ts:213`). La separación es la repetición ±15 % (`barGap`, `targets.ts:50`): remo 2,6 s, dominada 3,2 s, colgado 1 s por segundo
(`targets.ts:47`).

| Ejercicio | Postura y mirada | Tempo (rep / gesto) | Dónde salen | Choque principal y propuesta |
| --- | --- | --- | --- | --- |
| Remo invertido (`row`) | Tumbado **boca arriba**, colgado de las paralelas por debajo, tirando hacia arriba. Mirada: al techo y a la barra | 2,6 s; subir el pecho ~1,0-1,3 s | Esperan en el punto más alto de la cabeza, pasada la barra hacia tu cabeza (`targets.ts:83-93`); llegan **desde los pies, a 3,2 m y 0,6-1,0 m de altura** (`targets.ts:~225-231`) | **Llegan por donde no miras** (mirada al techo, el viaje va a ras de las piernas): ves el final del viaje al subir. Las avispas de compuerta (`gate`): las compuertas no se recolocan con tu cuerpo, **sospecha**: pueden quedar fuera de tu vista. Propuesta: que lleguen **desde arriba** del aparato (la barra), no desde los pies |
| Dominadas (`pullup`) | Colgado de la barra de puerta, al frente y algo arriba | 3,2 s; subir ~1,5-2 s | En el punto más alto de la cabeza (`barTopPoint`, `targets.ts:90`), a 3,2 m desde donde miras y 0,6-1,0 m más altos (`targets.ts:~226-231`) | Bien situadas. **Avisos**: el del suelo cae a ~43° bajo los ojos (C3); el aviso breve a 1,2 m bajo la mirada (sí se lee). Propuesta: colgado, sin aviso del suelo y dejar solo el breve (no toca REGLAS) |
| Colgado (`hang`) | Colgado de la barra, al frente | 1 s por punto; la oleada son los segundos de `hangTime` | No hay objetivos (`buildBarWave`, `targets.ts:59-60`) | Solo avisos («¡Más arriba!»: sube la cabeza): C3 con el del suelo. Sin otros |

Otros detalles de Barras:

- **«Por los lados» (`barMix`, `schema.ts:214`)**: llegan en diagonal desde delante y a un lado (`targets.ts:216-224`); el comentario del
  código dice que se pensó «para no mirar a un costado». Está bien; el único riesgo es **el remo**, donde «delante» es hacia los pies.
- **Marcador**: a un lado (C4); colgado de una barra no puedes girar el cuerpo. Los avisos de colocación y «¡CUÉLGATE!»
  salen en el centro de la vista (`game.ts:1102-1103`), bien.
- **Tempo**: no hay choque; hay holgura (`barWait` 12 s; la ronda se adapta a la repetición).

---

## 6. Resumen y propuestas

| Ejercicio | Postura | Choque principal | Propuesta |
| --- | --- | --- | --- |
| Plancha lateral (Combate) | De lado, mirada horizontal | Mundo y bola se orientan con la coronilla si miras abajo (a 90° de tu mirada); texto derecho con la cabeza tumbada (**sospecha**) | Orientar solo con la mirada; aviso con el ladeo de la cabeza (toca REGLAS); pedir diagnóstico |
| Fondos en silla (Combate) | Sentado, al frente y arriba | Panel de indicaciones a 21° arriba; la bola salta 20 cm (C1) | Bajar el panel a ~12-15° solo sentado; suavizar la bola |
| Abdominales (Toques) | Boca arriba | Los objetivos y el marcador están fuera de la mirada (el techo) | Marcador en el techo (toca REGLAS); objetivos a la altura de la mirada al subir; mínimo de `tchGap` |
| Sentadilla, zancada, salto, frontal, press | De pie | C1 (salto de la bola), C2 (panel alto), C4 (marcador a 50-69°) | Transición continua de la bola; panel a ~12° cuando la vista baja; marcador más estrecho (toca REGLAS: «el doble de grande») |
| Swing y peso muerto | De pie, tronco inclinado | El panel alto cae fuera de la vista al agacharte | Panel a la altura del pecho o aviso en el suelo |
| Curl y curl con barra | De pie | Gesto de 1,3-2,0 s con aviso en el panel alto | Aviso breve bajo la mirada en vez del panel alto |
| Elevación frontal, antebrazos | De pie | Aviso en el panel alto con las manos ocupadas | Aviso breve |
| Flexiones, plancha con un brazo, inchworm | Plancha / de pie | Ninguno grave; el cambio de postura del inchworm (panel a breve) | Vigilar en el diagnóstico |
| Superman | Boca abajo | Voladores a 0,3-0,8 m de altura sobre la mirada baja; marcador a un lado | Ya en el plan 3.B; voladores a ras de suelo y marcador delante |
| Slam y salto (Toques) | De pie | `reach` por encima de la cabeza (sospecha) | Limitar `reach` a 20° sobre los ojos |
| Flexiones (Toques) | Plancha | Objetivos nacen a 3,5 m (4.1: 2,5 m) | Nacer a 2,5 m |
| Combinado (Toques) | Cambia | Cada cambio de postura cambia dónde mirar | Avisar un objetivo antes, en el sitio de la mirada actual |
| Remo invertido (Barras) | Boca arriba bajo la barra | Objetivos llegan desde los pies, fuera de la mirada al techo; compuertas sin recolocar | Que lleguen desde arriba; comprobar las compuertas |
| Dominadas (Barras) | Colgado | Aviso del suelo a ~43° abajo (C3) | Sin aviso del suelo; solo el breve |
| Colgado (Barras) | Colgado | Idem | Idem |

**Lo que no se toca sin permiso del usuario** (toca REGLAS): marcador «a un lado, el doble de grande» (C4, abdominales, plancha
lateral, superman); avisos «nunca se ladean con la cabeza» (plancha lateral); «el marcador de los de suelo, tumbado a 45°» (se respeta).

**Lo que se puede hacer sin tocar REGLAS** (solo el sitio o el dibujo): suavizar el salto de la bola (C1), bajar el panel cuando
estás sentado, usar el aviso breve en los curls, nacer los objetivos de plancha a 2,5 m, mínimo de `tchGap` en el suelo,
sin aviso del suelo colgado.
