# Letras de los paneles

Las mismas de RepArena: **Rubik** (texto) y **Bungee** (títulos y números grandes), las dos con licencia SIL Open Font
License 1.1 (`OFL-Rubik.txt`, `OFL-Bungee.txt`).

La letra que trae IWSDK para los paneles (Inter) no tiene tildes, eñes, ¿, ¡ ni ×, así que estas se prepararon aparte
como letras MSDF (las que usan los paneles de UIKit: se ven nítidas a cualquier distancia), con todo el español:

| Archivo | Qué es |
| --- | --- |
| `rubik-500.json` | Rubik Medium (texto normal) |
| `rubik-700.json` | Rubik Bold (texto en negrita) |
| `bungee-400.json` | Bungee (lo que lleva la clase `display` en los paneles) |
| `Bungee-Regular.ttf` | Bungee para lo que se pinta en un lienzo (la «×2» de la bola, el rosco, la caricatura, la carátula) |
| `Rubik-Medium.ttf`, `Rubik-Bold.ttf` | Rubik para el texto de la caricatura y de la carátula del duelo (en un lienzo) |
| `BlackOpsOne-Regular.ttf` | Black Ops One (licencia SIL OFL 1.1, `OFL-BlackOpsOne.txt`): el VS y los nombres de la carátula del duelo, como en RepArena |

Cada `.json` lleva dentro su imagen de letras. Se generaron con el mismo generador de UIKit (`TTFLoader`), a partir de
los `.ttf` de los paquetes `@expo-google-fonts/rubik` y `@expo-google-fonts/bungee`, con los caracteres ASCII más
`áéíóúÁÉÍÓÚñÑüÜ¿¡×·—–…ºª€«»“”‘’•°→←↑↓▶`. Si hace falta otro carácter, hay que volver a generarlas.

Después se les añadieron, como copias de otros que sí tienen (en la lista de caracteres del `.json`, con su mismo dibujo):
`−` (el de `–`), `▸` (`▶`), `◀` y `◂` (`←`), `›` (`»`), `‹` (`«`) y `✔` (`✓`); sin ellos, en los botones salía un punto («Vol −»,
«Listas y canciones ▸»).
