# Modelos 3D

| Archivo | Qué es |
| --- | --- |
| `zombie_basic.glb` | **Zombi verde** (Ultimate Platformer Pack, de [Quaternius](https://quaternius.com), CC0): cuerpo, esqueleto, su textura y sus animaciones (reposo, andar, correr, puñetazo, ataque, recibir golpe y morir). El mismo archivo que usa RepArena. |
| `zombie_chubby.glb` | **Zombi gordo**, del mismo pack. |

Licencia: el Ultimate Platformer Pack trae su `License.txt`: CC0 1.0 (dominio público).
| `zombie.glb`, `tex/zombie.png` | **Zombi** («Zombie», de Quaternius, 2017): cuerpo, esqueleto y sus animaciones (reposo, andar, correr, morder y arrastrarse), y su paleta de colores (32 × 32 px), que el juego le pone al cargarlo. El mismo de RepArena. |
| `raptor.glb` | **Velociraptor** (Dinosaur Animated Pack, Quaternius, CC0): cuerpo, esqueleto, colores y animaciones (reposo, andar, correr, saltar, atacar y morir). |
| `piratas/*.glb` | **Piratas** (Pirate Kit, de Quaternius, CC0): el esqueleto, el capitán Barbarroja (con su loro) y los tiburones Sharky y Mako, con su arma en la mano y sus animaciones (reposo, andar, correr, tajo, puñetazo, saludo, recibir golpe y morir). |
| `monstruitos/*.glb` | **Monstruitos** (Cute Animated Monsters, de Quaternius, CC0): demonio, demonio verde, cíclope, yeti, calavera, alien y alien alto, con su textura dentro y sus animaciones (reposo, andar, saltar, morder, recibir golpe y morir); y los que vuelan (`bee.glb`, `bat.glb`, `cthulhu.glb` y `yellowdragon.glb`: abeja, murciélago, Cthulhu y dragón), con las suyas (volar, morder, recibir golpe y morir). |

| `imp.glb`, `puglin.glb`, `tex/imp_color*.jpg`, `tex/puglin_color*.jpg` | **Diablillo** y **Puglin** (Bestiary · Dungeon Monsters Kit, de Quaternius): cuerpo y esqueleto, y sus tres colores (texturas reducidas a 1024 px). El lanzador es el mismo diablillo. |
| `anims.glb` | Las animaciones de la **Universal Animation Library** (Quaternius, CC0), hechas para el esqueleto del diablillo y el puglin: andar, trotar, correr, puñetazos, tajos, gancho, lanzar, recibir golpe, morir, bailar… El juego las pasa a cada modelo al cargarlo (`src/combat/retarget.ts`). |

Más licencias: los modelos y texturas del Bestiary están bajo la Quaternius Asset License (QAL) v1.0 (se pueden usar
gratis en juegos y otros proyectos; los mismos que usa RepArena). La Universal Animation Library, CC0. el zombi, el Pirate Kit y Cute Animated Monsters no traen archivo de licencia; Quaternius publica sus packs
gratuitos como CC0 (dominio público). El Dinosaur Animated Pack, CC0.

Los retratos de cada enemigo para sus fichas del menú (`../retratos/*.png`, 128 px) salen de la hoja de RepArena
(`models/retratos.png`, hecha con estos modelos por su `tests/retratos.js`), cortada una vez.
