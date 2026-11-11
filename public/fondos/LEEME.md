# Fondos de la Travesía

Fotos panorámicas de verdad (montañas, cielo) que se ven al fondo de cada tramo de la Travesía, con el paisaje de cómic
delante. Si falta una, ese tramo usa el cielo dibujado de siempre.

Se eligen en el juego (Opciones → Entorno → «Fondo realista», en todos los modos menos la Travesía, que usa uno por tramo).

Solo **paisajes abiertos** (la foto al fondo, con el bosque de cómic delante; en Arcos, avanzas por el paisaje de la
Travesía). Las de bosque por dentro, ciudad y playa se quitaron: con los árboles y las casas tan cerca, se veían planos,
como de cartón, sin el relieve que da la realidad virtual.

| Archivo | Foto de Poly Haven | En el juego |
| --- | --- | --- |
| `aldea.jpg` | Alps Field | Prado con los Alpes (tramo Aldea) |
| `bosque.jpg` | Lilienstein | Pradera y montaña (tramo Bosque) |
| `montana.jpg` | Drakensberg Solitary Mountain | Montaña y valle |
| `cumbre.jpg` | Table Mountain 1 | Cumbre sobre el mar |
| `lago.jpg` | Kloofendal 48d Partly Cloudy | Colinas con nubes (tramo Pradera del lago) |
| `atardecer.jpg` | Rolling Hills | Colinas al atardecer (tramo Pinar al atardecer) |
| `ocaso.jpg` | Qwantani Sunset | Ocaso junto al lago |

Todas son de [Poly Haven](https://polyhaven.com/hdris) (CC0, dominio público), en su versión «Tonemapped JPG»,
reducidas a 4096 × 2048. En el juego (`PANOS`, `src/75_trek.js`), cada una mira hacia lo mejor de la foto (`u`: la
columna que queda de frente), la luz se ajusta a lo clara que es y, al cambiar, la anterior se
borra de la memoria. Para añadir otra: el archivo aquí, su entrada en `PANOS` y su opción en el ajuste `pano`
(`src/00_core.js`).

Cómo deben ser:

- **Equirrectangulares** (el doble de anchas que de altas: 4096 × 2048 px va bien en las gafas), en `.jpg`, de unos
  1–2 MB. El horizonte, en la línea del medio.
- De dominio público o con licencia que permita usarlas en el juego: por ejemplo, las de [Poly Haven](https://polyhaven.com/hdris)
  (CC0), descargando la versión **«Tonemapped JPG»** de 4K.
  De paisaje abierto: sin árboles, casas ni nada cerca (lo cercano se ve plano).
- La niebla del paisaje toma sola el color del horizonte de la foto.
