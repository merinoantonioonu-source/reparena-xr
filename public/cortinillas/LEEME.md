# Cortinillas

Las ilustraciones de cada ejercicio que salen en grande antes de cada ronda (la carátula del duelo), elegidas por el
usuario: «Modelo 2», estilo HUD holográfico táctico, una por modo y ejercicio (`<modo>-<ejercicio>.jpg`, los de `MODE_EX` en
`src/core/catalog.ts`). Las dio el usuario (documento «Cortinillas RepArena XR»), reducidas a 1024 × 572.

La franja de abajo de cada imagen («OLEADAS: 3 · VIDAS: 3») la tapa el juego con una igual que dice lo que tienes puesto
(`src/ui/cortinilla.ts`). Un ejercicio nuevo: su imagen aquí, con ese nombre (lo comprueba `tests/unit/cortinilla.test.ts`).

Provisional: la Travesía con flexiones (`trek-pushup`) usa la de Combate (`combat-pushup.jpg`, `CORT_SAME` en
`src/ui/cortinilla.ts`) hasta que haya la suya.

## Fichas del menú

`fichas/` son las mismas imágenes en pequeño (288 px de ancho): las fichas de los ejercicios del menú grande (`src/ui/ra/ex-cards.ts`).
Un ejercicio nuevo, también aquí; se rehacen con ImageMagick, desde esta carpeta:

```bash
for f in *.jpg; do convert "$f" -resize 288x -strip -quality 72 "fichas/$f"; done
```
