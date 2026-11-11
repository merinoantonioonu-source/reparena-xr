# Modelos 3D

| Archivo | Qué es |
| --- | --- |
| `zombie_basic.glb` | **Zombi verde** (Ultimate Platformer Pack, de [Quaternius](https://quaternius.com), CC0): cuerpo, esqueleto, su textura y sus animaciones (reposo, andar, correr, puñetazo, ataque, recibir golpe y morir). El mismo archivo que usa RepArena. |
| `zombie_chubby.glb` | **Zombi gordo**, del mismo pack. |

Licencia: el Ultimate Platformer Pack trae su `License.txt`: CC0 1.0 (dominio público).
| `zombie.glb`, `tex/zombie.png` | **Zombi** («Zombie», de Quaternius, 2017): cuerpo, esqueleto y sus animaciones (reposo, andar, correr, morder y arrastrarse), y su paleta de colores (32 × 32 px), que el juego le pone al cargarlo. El mismo de RepArena. |
| `raptor.glb` | **Velociraptor** (Dinosaur Animated Pack, Quaternius, CC0): cuerpo, esqueleto, colores y animaciones (reposo, andar, correr, saltar, atacar y morir). |
| `piratas/*.glb` | **Piratas** (Pirate Kit, de Quaternius, CC0): el esqueleto, el capitán Barbarroja (con su loro) y los tiburones Sharky y Mako, con su arma en la mano y sus animaciones (reposo, andar, correr, tajo, puñetazo, saludo, recibir golpe y morir). |
| `monstruitos/*.glb` | **Monstruitos** (Cute Animated Monsters, de Quaternius, CC0): demonio, demonio verde, cíclope, yeti, calavera, alien y alien alto, con su textura dentro y sus animaciones (reposo, andar, saltar, morder, recibir golpe y morir); los de las trampillas (`crab.glb` y `mushroom.glb`: cangrejo y seta) y los que vuelan (`bee.glb`, `bat.glb`, `cthulhu.glb` y `yellowdragon.glb`: abeja, murciélago, Cthulhu y dragón), con las suyas (volar, morder, recibir golpe y morir). |

| `imp.glb`, `puglin.glb`, `tex/imp_color*.jpg`, `tex/puglin_color*.jpg` | **Diablillo** y **Puglin** (Bestiary · Dungeon Monsters Kit, de Quaternius): cuerpo y esqueleto, y sus tres colores (texturas reducidas a 1024 px). El lanzador es el mismo diablillo. |
| `island.glb` | La **isla pirata** (Pirate Kit, de Quaternius, CC0), la misma de RepArena: de momento solo se usa su cofre (`Chest_Closed` y `Chest_Gold`), el del descanso de Combate. |
| `anims.glb` | Las animaciones de la **Universal Animation Library** (Quaternius, CC0), hechas para el esqueleto del diablillo y el puglin: andar, trotar, correr, puñetazos, tajos, gancho, lanzar, recibir golpe, morir, bailar… El juego las pasa a cada modelo al cargarlo (`src/combat/retarget.ts`). |

Más licencias: los modelos y texturas del Bestiary están bajo la Quaternius Asset License (QAL) v1.0 (se pueden usar
gratis en juegos y otros proyectos; los mismos que usa RepArena). La Universal Animation Library, CC0. el zombi, el Pirate Kit y Cute Animated Monsters no traen archivo de licencia; Quaternius publica sus packs
gratuitos como CC0 (dominio público). El Dinosaur Animated Pack, CC0.

| `tentaculo.glb` | **Tentáculo** del charco de las barras (Pirate Kit, de Quaternius, CC0) con sus cuatro animaciones: reposo (`Tentacle_Idle`, se mece), pinchazo (`Poke`), latigazo (`Attack`) y barrido (`Attack2`). Convertido de su `.gltf` a `.glb`, sin simplificar (3.900 triángulos). Es el de RepArena. |

| `nature.glb` y `tex/nature/*` | El **claro del bosque de día** (Stylized Nature MegaKit, de Quaternius, CC0): árboles, pinos, árboles secos, arbustos, rocas, hierba, flores, helechos y setas, simplificados y juntos, cada uno bajo un nodo con su nombre; sus texturas, reducidas, aparte. Son los de RepArena. Se usan con Entorno → «Bosque» y con el fondo realista. |

Los retratos de cada enemigo para sus fichas del menú (`../retratos/*.png`, 128 px) salen de la hoja de RepArena
(`models/retratos.png`, hecha con estos modelos por su `tests/retratos.js`), cortada una vez.
