# Sonidos propios

Pon aquí archivos de audio con estos nombres y el juego los usará en lugar de los de serie. Vale `.mp3`, `.ogg` o
`.wav` (por ejemplo `rayo.mp3`; con dos del mismo nombre, vale el `.mp3`). Si un archivo no está, suena el de serie: el
que RepArena fabricaba al vuelo (sintetizado), grabado una vez como archivo en `de-serie/`. Esa carpeta no se toca: si
quitas el tuyo, vuelve a sonar el de serie.

## Disparos y golpes

| Archivo | Cuándo suena |
| --- | --- |
| `rayo` | Cada disparo (el rayo sale de la mano o la pistola). |
| `rayo-cargado` | Disparos cargados (×2, ×3, ×4). Si no está, se usa `rayo` más grave. |
| `impacto` | Cuando el rayo alcanza al enemigo. |
| `chispazo` | Descarga eléctrica: segundo latigazo de un rayo fuerte, o te da un arco/valla en Arcos. |
| `explosion` | Explota un robot o un dron. |
| `impacto-metal` | Le das a un robot sin derribarlo, o un robot te golpea. |
| `golpe-recibido` | Te golpean (lo oyes tú, sin posición). |

## Enemigos

| Archivo | Cuándo suena |
| --- | --- |
| `rugido-robot` | Un robot ruge (al salir, al cargar o al prepararse para golpear). Solo los robots: cada monstruo tiene el suyo (abajo). |
| `paso-robot` | Cada paso de un robot. |
| `servo` | Un robot levanta el brazo para golpear. |
| `compuerta` | Se abre una compuerta. |
| `siseo-arana` | Una araña sisea (al acercarse, al amenazar y al picarte). |
| `patas-arana` | Una araña corretea o salta. |
| `ataque-arana` | Una araña salta a por ti. |
| `aplastar` | Revientas una araña o un avispón (chapoteo viscoso). |
| `ataque-volador` | Un avispón se lanza a picarte (o, en Barras, una avispa o un dron). |
| `lobo-aullido` | Travesía: los lobos aparecen a lo lejos (aúlla el primero; se oye desde lejos). |
| `lobo-grunido` | Travesía: un lobo gruñe al acercarse (cada vez más a menudo y más fuerte). |
| `lobo-ataque` | Travesía: un lobo te alcanza y muerde (rugido y dentellada). |
| `bandido-lanza` | Travesía: un bandido lanza una piedra (su esfuerzo: «¡ja!»). |
| `bandido-dolor` | Travesía: le has esquivado una piedra a un bandido (un quejido: «¡uh!»). |
| `bandido-muere` | Travesía: un bandido cae derrotado (su lamento). |
| `lanzamiento` | El lanzador te tira una piedra. |
| `arco-pasa` | Un arco de energía te pasa por encima, o lo saltas (Arcos). |
| `orbe` | Coges un orbe en Arcos. (Campanitas de cristal que suben.) |
| `onda-expansiva` | En el inchworm, al acabar la vuelta: la onda que lanza a los bichos a su trampilla. (Un golpe grave, un soplido que barre el suelo y un retumbar.) |
| `siseo-avispa` | Un avispón carga antes de picar; en Barras, las avispas y la reina amenazan o te pican. |
| `ameba` | Revientas una ameba de agua (Toques). |
| `pompa` | Revientas una pompa (Barras). |
| `tentaculos` | Un tentáculo del charco se lanza hacia ti. |
| `caida-foso` | Caes al charco (se suma al chapoteo). |
| `chapoteo` | La zambullida al caer al charco. |
| `remolino-engulle` | El remolino te engulle. |
| `remolino-cierra` | El remolino se cierra al acabar el tiempo. |

### La voz de cada monstruo

Cada uno con su archivo: si falta, suena el de serie (su rugido sintetizado, con su tono), no el de los robots.

| Archivo | Quién |
| --- | --- |
| `rugido-diablillo` | El diablillo (Imp) y su jefe: al salir, al amenazar, al prepararse para golpear y al morir. |
| `rugido-puglin` | El Puglin, en los mismos momentos. |
| `rugido-zombi` | El zombi y su jefe (un gruñido grave). |
| `rugido-velociraptor` | El velociraptor y el jefe (el velociraptor enorme). |
| `rugido-zombi-verde` | El zombi verde y su jefe. |
| `rugido-zombi-gordo` | El zombi gordo y su jefe. |
| `voz-demonio` | El demonio (monstruito) y su jefe. |
| `voz-demonio-verde` | El demonio verde y su jefe. |
| `voz-ciclope` | El cíclope y su jefe. |
| `voz-yeti` | El yeti y su jefe. |
| `voz-calavera` | La calavera, andando o saliendo de las trampillas. |
| `voz-alien` | El alien y su jefe. |
| `voz-alien-alto` | El alien alto y su jefe. |
| `voz-cangrejo` | El cangrejo de las trampillas (al salir, al amenazar y al morderte). |
| `voz-seta` | La seta de las trampillas. |
| `voz-esqueleto` | El esqueleto pirata y su jefe. |
| `voz-capitan` | El capitán Barbarroja (y el capitán jefe). |
| `voz-tiburon` | Sharky, el tiburón, y su jefe. |
| `voz-tiburon-gris` | Mako, el tiburón gris, y su jefe. |
| `voz-abeja` | La abeja, al lanzarse a picarte. |
| `voz-murcielago` | El murciélago, al lanzarse a morderte. |
| `voz-cthulhu` | Cthulhu, al lanzarse a por ti. |
| `voz-dragon` | El dragón (jefe de los voladores), al lanzarse a por ti. |

Los drones y los avispones ya tienen cada uno su zumbido (`zumbido-dron`, `zumbido-avispa`, más abajo) y los tentáculos, `tentaculos`.

## Espadas

Para cada uno puedes poner además una versión `-laser` (por ejemplo `espada-golpe-laser.mp3`): suena con la
espada láser y la normal con la metálica. Si solo pones la normal, suena con las dos.

| Archivo | Cuándo suena |
| --- | --- |
| `espada-aire` | La hoja corta el aire en un tajo rápido. |
| `espada-choque` | La hoja rebota (sin carga, o choca con algo). |
| `espada-golpe` | Un tajo cargado le da a un robot. |
| `espada-bloqueo` | Paras un golpe con la espada. |
| `espada-corte` | Partes un bloque en Toques. |

## Avisos del juego (sin posición, suenan «en tu cabeza»)

Son los sonidos que te cuentan cómo va tu ejercicio y la partida, no los de los enemigos. Entre paréntesis, cómo suena
el de serie, para reconocerlo.

| Archivo | Cuándo suena |
| --- | --- |
| `carga` | La bajada ya es suficiente: la repetición cuenta y el disparo queda cargado (en la sentadilla, al llegar abajo; en el press, al empezar a subir). También al terminar la calibración, al recargar las pistolas y al colocar la barra. (Un «fiuu» corto que sube.) |
| `carga-nivel` | Aguantando abajo (flexiones y sentadillas), cada 0,8 s sube la carga: ×2, ×3, ×4. Suena una vez por nivel; el de serie, cada vez más agudo. (Un zumbido eléctrico que sube.) |
| `perfecta` | Repetición PERFECTA: completa y al ritmo pedido. (Un brillo de campanitas agudas.) |
| `a-medias` | Repetición a medias: no bajaste o no subiste lo suficiente; también sale «¡Baja más!» o similar y se corta el combo. (Una nota grave que cae, «buuu».) |
| `fallo` | Un rayo apuntado (con la mirada o las manos) no da a ningún enemigo; en Barras, se escapa una pompa. (Un «pu» corto y suave que baja.) |
| `combo` | Cada 10 repeticiones seguidas sin fallar (×10, ×20…). (Cuatro notas que suben, «tirirí».) |
| `pitido` | Cuenta atrás de segundos (plancha lateral, superman, colgarse de la barra, colocar el equipo) y aviso de que llega una valla en Arcos; el de serie sube de tono en cada segundo. (Un «bip» corto.) |
| `oleada` | Empieza una oleada. (Una bocina de dos toques, grave.) |
| `victoria` | Ganas la ronda o superas una oleada con descanso. (Una fanfarria que sube.) |
| `derrota` | Pierdes la ronda (al quedarte sin vidas). (Cuatro notas que bajan.) |
| `clic` | Pulsas un botón de un menú. |
| `tic` | Mueves un deslizador, aparece el menú de la muñeca o tocas una marca en la inchworm. |

## Ambiente

| Archivo | Cuándo suena |
| --- | --- |
| `trueno` | Los truenos lejanos de la arena. |
| `metal-lejano` | Golpes metálicos lejanos de la arena. |
| `buho` | Un búho en el bosque. |
| `gaviota` | Una gaviota que grita sobre el mar (Entorno: Isla pirata), cada pocos segundos y desde un sitio distinto. |
| `pajaro` | Un pájaro que canta en el bosque de día (Entorno: Bosque), cada pocos segundos y desde un sitio distinto. |
| `crujido` | Crujidos de ramas en el bosque. |

## Sonidos continuos (se repiten en bucle)

Que el final empalme con el principio sin corte. Pueden durar varios segundos.

| Archivo | Cuándo suena |
| --- | --- |
| `ambiente-arena` | Fondo de la arena (realidad virtual). |
| `ambiente-bosque` | Fondo del bosque (viento, grillos…). |
| `ambiente-isla` | Fondo de la isla pirata (Entorno: Isla pirata): las olas que rompen y se retiran, y la brisa. |
| `ambiente-naturaleza` | Fondo del bosque de día (Entorno ▸ → Entorno: Bosque): brisa entre las hojas. |
| `zumbido-dron` | Vuelo de drones, bombarderos y nodrizas (cada uno con su tono). |
| `zumbido-avispa` | Vuelo de avispones, avispas y la reina (cada uno con su tono). |
| `espada-laser-zumbido` | Zumbido de la espada láser (sube de tono y volumen al moverla). |
| `remolino` | Succión del remolino (sube con lo abierto que está). |
| `arco-zumbido` | Zumbido de los arcos de energía en Arcos. |

Consejos: los efectos, cortos (menos de 2 s, salvo `caida-foso`, `victoria` y `derrota`), sin silencio al
principio y en mono. Cada vez que suenan se varía un poco el tono para que no se repitan iguales. Ajusta tú el
volumen del archivo: el juego lo pone tal cual (con su posición en el espacio, si la tiene).

El juego no les añade eco (RepArena se lo ponía): si lo quieres, que lo lleve el archivo (los de serie lo llevan
grabado). Y todos pasan por el compresor de la mezcla, como en RepArena: lo flojo se oye algo más fuerte y lo fuerte no
satura.

## Cómo subirlos desde el navegador

1. En GitHub, abre el repositorio `reparena-xr` y entra en la carpeta `sounds`.
2. Pulsa **Add file → Upload files** y arrastra los archivos (con los nombres de arriba).
3. Abajo, pulsa **Commit changes**. En unos minutos GitHub vuelve a construir la página con tus archivos y el juego los
   usa.

## Los de serie

Se rehacen desde el código de RepArena (por si cambiara) con `RA_DIR=../reparena node tests/sonidos.mjs`: cada uno, solo,
con su eco de sala y antes del compresor; los efectos en `.mp3` y los que se repiten en bucle en `.ogg` (empalman sin
corte).
