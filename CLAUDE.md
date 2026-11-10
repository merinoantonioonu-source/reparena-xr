# RepArena XR: instrucciones para Claude

Prototipo de RepArena (`merinoantonioonu-source/reparena`) hecho con el Immersive Web SDK de Meta (IWSDK) para decidir
si se pasa el juego entero a esta base. Qué hay y en qué archivo: `README.md`.

## Idioma y forma de trabajar

- Con el usuario, en **español**. Los textos del juego, los comentarios del código, los mensajes de commit y los PR,
  también en español.
- El usuario no programa: explícale los cambios por lo que se ve y se siente en las gafas, no por el código.
- Commit, push y PR con una descripción de qué cambia, cómo se ha probado y qué fallos conocidos quedan. El usuario
  fusiona los PR; al fusionar en `main`, GitHub Actions publica el juego en GitHub Pages.
- Las reglas de diseño de RepArena (su `CLAUDE.md`) valen también aquí: no las cambies sin preguntar.

## Probar

- `npm run typecheck` antes de probar nada; `npm run build` para la versión publicable.
- El emulador de IWSDK (`npx @iwsdk/cli dev up`) abre un navegador con unas Quest 3 simuladas: `xr enter`, `xr look-at`,
  `xr select`, `xr animate-to` (la cabeza para las sentadillas; las manos para las sacudidas) y `ecs find`/`ecs query`
  para ver el estado de los zombis. Sin tarjeta gráfica va a unas 5 imágenes por segundo: todo pasa a cámara lenta y una
  pulsación con el dedo dura más de lo que IWSDK acepta como clic (en las gafas, no).
- En el ordenador, sin emulador: flecha abajo (o S) para agacharse, espacio para lanzar, Enter para empezar.
  `window.__rx` da el estado de la partida para las pruebas.

## Cómo está hecho

- Los campos de un componente con `min` no admiten valores por debajo: `setValue` lanza un error y para el sistema
  entero (pasó con la vida de los zombis).
- La física (Havok) manda en la posición de los cuerpos dinámicos y cinemáticos: no se mueven escribiendo en su
  `object3D` (se pisa en cada paso). Los zombis se mueven pidiendo velocidad (`PhysicsManipulation`); la bola y tu
  cuerpo, teletransportándolos (`setBodyTransform`). Una `PhysicsManipulation` con todo a cero significa «no cambies».
- La letra que trae IWSDK (Inter) no tiene tildes: los paneles usan las de `public/fonts` (ver su `LEEME.md`), que se
  ponen al cargar (`src/fonts.ts`). En el UIKitML solo se pueden nombrar letras de IWSDK: los títulos llevan la clase
  `display` y el código les pone Bungee.

@AGENTS.md
