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
| `Bungee-Regular.ttf` | Bungee para el «×2», «×3», «×4» de la bola (se pinta en un lienzo) |

Cada `.json` lleva dentro su imagen de letras. Se generaron con el mismo generador de UIKit (`TTFLoader`), a partir de
los `.ttf` de los paquetes `@expo-google-fonts/rubik` y `@expo-google-fonts/bungee`, con los caracteres ASCII más
`áéíóúÁÉÍÓÚñÑüÜ¿¡×·—–…ºª€«»“”‘’•°→←↑↓▶`. Si hace falta otro carácter, hay que volver a generarlas.
