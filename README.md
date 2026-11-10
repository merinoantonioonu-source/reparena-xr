# RepArena XR

**RepArena** rehecho con el [Immersive Web SDK](https://iwsdk.dev) de Meta (IWSDK): el mismo juego de ejercicio para
**Meta Quest 3**, en el navegador de las gafas, sobre la base que Meta ha preparado para WebXR (física de verdad, manos y
paneles nítidos). El prototipo convenció: RepArena se está pasando entero aquí, PR a PR, siguiendo
[`MIGRACION.md`](MIGRACION.md) (el plan y en qué punto va). Mientras tanto, RepArena sigue en su repositorio.

**Jugar:** https://merinoantonioonu-source.github.io/reparena-xr/ (abre la página en el navegador de las Quest 3 y pulsa
«ENTRAR EN VR»).

## Qué hay

Por ahora, Combate con sentadillas, como en RepArena:

- **La sentadilla** se detecta con la altura de la cabeza (los mismos números que RepArena: 26 cm de bajada; PERFECTA si
  dura 1,2 s o más y bajas 3 cm más de lo pedido).
- **La bola roja de energía**, a un metro del pecho: aparece al bajar (la carga del disparo, una por mano) y, aguantando
  abajo en la postura perfecta, sube a **×2** (1,5 s), **×3** (2 s más) y **×4** (2,5 s más), con su número encima y un
  destello al llegar a ×4.
- **El rayo**, como en RepArena: al subir de la sentadilla, la bola estalla y la carga pasa a **las dos manos** (un orbe
  en cada muñeca, uno por mano y sin acumular). Cada mano lanza el suyo con una **sacudida hacia el zombi** (la de
  RepArena: puede salir de la cadera y hacerse subiendo o bajando; si las gafas pierden la mano a medias, sale igual).
  Con **«El rayo va al que miras»** (de serie) va al zombi que llevas un momento mirando, marcado con su **diana** (líneas
  de enfoque rojas); si no, al más cercano a la dirección de la mano. Con mandos, apuntando con la mano y con el
  **gatillo** (gatillo y agarre a la vez es el puño: no dispara). Pellizcar no dispara. Daño de RepArena: 1 el normal, 2
  el perfecto, y la carga suma (×2 +1, ×3 +2, ×4 +4). Con la puntería automática (o con la mirada), la repetición
  dispara sola.
- **Puñetazo**: un golpe rápido al zombi que tienes delante lo aparta y lo aturde un momento (sin quitarle vida).
- **Estilo Cómic** (el de serie, como en RepArena): sombreado plano con un corte duro entre luz y sombra (la sombra,
  violácea), contornos de tinta finos, colores claros y vivos, cielo de dibujo con nubes de borde entintado, neblina clara
  rosada y un valle de dibujo alrededor (mesetas de colores, ruinas, rocas que flotan y montañas lavanda); al acertar,
  líneas de impacto y, al derribar, una estrella. «Estilo visual: Realista» lo quita.
- **La arena**: suelo de arena con grietas a tinta y tres **compuertas** en arco a 11 m: cada zombi sale por una (se abre,
  su interior es oscuro y la baliza gira); son sólidas y los zombis las rodean.
- **Zombis con física de verdad** (motor Havok): cada uno es un cuerpo que choca con el suelo, las cajas, las rocas, la
  bola y los demás zombis. Andan hacia ti dirigiendo su velocidad, **rodean la bola**, las cajas y las rocas y se apartan
  entre ellos; si chocan, se empujan. Un rayo los hace **retroceder**; el que los mata los **lanza por el aire dando
  vueltas** y caen tumbados al suelo; luego se desvanecen. Si te alcanzan, te golpean: pierdes una vida (velo rojo).
- **Oleadas**: cada una con un zombi más y algo más rápidos; desde la segunda, también zombis gordos (más pesados y
  con más vida). Con cinco golpes se acaba la ronda: resumen y **OTRA RONDA**.
- **Manos**: las de IWSDK tal cual (los modelos oficiales de Meta, con contorno). Con mandos y «Mandos como manos» (de
  serie), la mano de IWSDK que agarra el mando: el índice se dobla con el gatillo y los demás dedos con el agarre.
- **Paneles**: el de inicio, con **EMPEZAR** (se pulsa con el rayo de la mano y pellizco, con el dedo o con el gatillo), y
  el **marcador** a la izquierda (oleada, vidas, sentadillas, carga, derribados, perfectas, mensajes, tiempo y hora).
  Letras de RepArena (Rubik y Bungee), con tildes.
- **Nitidez en las gafas**: Normal ×1, Alta ×1,4 (de serie) o Máxima ×1,7. Se elige en el panel de inicio y se aplica al
  entrar en VR (para cambiarla dentro, hay que salir y volver a entrar).
- **Sonidos** sintetizados: carga, niveles, rayo, impactos, gruñidos de zombi (en 3D: se oye de dónde vienen), golpes y
  oleadas.

En el ordenador (sin gafas) también se puede probar: flecha abajo (o S) para agacharse (al subir, el rayo sale solo al
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
| `src/combat/game.ts` | La partida: carga ×2-×4, la carga en las manos, rayos y daño, puñetazos, oleadas, vidas, paneles y nitidez |
| `src/combat/lockline.ts` | La diana: líneas de enfoque alrededor del zombi apuntado |
| `src/combat/gates.ts` | Las compuertas: abrirse para sacar a un zombi, la baliza y sus cuerpos de física |
| `src/style/comic.ts`, `src/style/comic-system.ts` | El estilo Cómic: el sombreado, los colores y los contornos de tinta, y el sistema que lo aplica a todo |
| `src/style/comic-fx.ts` | Los efectos de cómic: líneas de impacto y estrella al derribar |
| `src/scene-assets/gate.scene-asset.ts` | La compuerta (hecha en código) |
| `src/scene-assets/comic-valley.scene-asset.ts`, `src/scene-assets/comic-sky.scene-asset.ts` | El valle de dibujo y las nubes |
| `src/scene-assets/lib/hardsurface.ts` | Piezas de IWSDK para construir modelos (cajas biseladas…) |
| `src/combat/enemies.ts` | Los zombis: cuerpos de física, marcha rodeando obstáculos, ataque, retroceso y muerte |
| `src/combat/fx.ts` | La bola de energía, la carga en cada mano, los rayos, las chispas y los destellos |
| `src/combat/components.ts`, `src/components.ts` | Los componentes `Foe` (zombi) y `Obstacle` (lo que rodean), y su catálogo |
| `src/exercise/vertical.ts` | El detector de la sentadilla (bajar y subir, carga, ×2-×4, PERFECTA), sin IWSDK |
| `src/core/state.ts` | Lo que comparten los sistemas (fase, cabeza, bola, marcador) |
| `src/core/schema.ts` | Los 186 ajustes de RepArena (claves, valores de serie, límites, grupos, condiciones y explicaciones) |
| `src/core/settings.ts` | Cargar, guardar y cambiar los ajustes (los mismos datos que RepArena), cada modo con cada ejercicio, los rangos con su tabla y la dificultad creciente |
| `src/core/values.ts`, `src/core/rules.ts` | Los valores de ahora y lo que se deduce de ellos (de pie, en el suelo, qué enemigos salen, cómo se apunta…) |
| `src/core/catalog.ts`, `src/core/dev-state.ts` | Ejercicios, modos, enemigos y rangos; el modo desarrollador y su tabla |
| `src/audio/sound.ts` | Los sonidos (WebAudio) |
| `src/ui/fonts.ts` | Pone las letras de RepArena (con tildes) en los paneles |
| `src/input/hand-system.ts` | Las manos y los mandos en cada fotograma (lo que da IWSDK, en `hands` y `head`), la vibración y «Mandos como manos» |
| `src/input/hand-model.ts` | Lo que el juego sabe de cada mano (muñeca, articulaciones, pellizco, gatillo, agarre, rayo) y el puño |
| `src/input/throw.ts` | La sacudida que lanza el rayo y el gatillo con mandos como manos (los de RepArena), sin IWSDK |
| `src/input/gaze-lock.ts`, `src/input/punch.ts`, `src/input/target.ts` | La mirada que fija al enemigo, el puñetazo y lo que ven de cada enemigo (de RepArena, sin IWSDK) |
| `src/input/controller-hand.ts` | La mano de IWSDK que agarra el mando, con sus fallos de esta versión arreglados |
| `src/input/input-models.ts` | Sirve desde el juego los modelos de las manos y los mandos (sin descargarlos de internet) |
| `src/assets.ts`, `src/scene-assets/arena.scene-asset.ts` | Los recursos: suelo de arena, aro del jugador, cajas, rocas, compuertas, valle, nubes, zombis y paneles |
| `public/scenes/main.iwsdk.scene.json` | La escena: cielo, neblina, suelo, compuertas, valle, nubes, cajas y rocas con su física, paneles y luces |
| `public/ui/*.uikitml` | Los paneles (inicio y marcador) |
| `public/models/` | Los zombis (Quaternius, CC0) |
| `public/fonts/` | Las letras (Rubik y Bungee, OFL) |
| `public/input-profiles/` | Las manos y los mandos (MIT) |
| `tests/unit/` | Pruebas de la lógica (Vitest) |
| `tests/e2e/run.mjs` | La partida simulada (Playwright), sobre la versión construida servida en una subcarpeta |
| `tests/compare/` | Comparaciones con el código original de RepArena (`RA_DIR=… npm run test:compare`) |
