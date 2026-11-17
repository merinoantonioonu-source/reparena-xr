# Curl con barra o kettlebell: disparos a destiempo (plan en fases)

En Combate › «Curl con barra o kettlebell» (`curl2`), a veces las manos se pierden o se leen mal y el disparo sale cuando
no toca. El disparo lo decide `StandingDetector.barStep` (`src/exercise/standing.ts`) con las manos que llena `HandSystem`
(`src/input/hand-system.ts`) y filtra `handFilter` (`HF`, `src/input/hand-filter.ts`). En `curl2` el rayo sale con cada
`rep` (puntería automática o mirada): un `rep` a destiempo es un disparo a destiempo.

**Historia**: una auditoría anterior cambió la lectura de las manos («solo posturas nuevas», «pellizco con puño», «salto de
la mano recuperada») y empeoró mucho los curls en las gafas; se quitó (docs/REGLAS.md › Repeticiones y disparo). No se
repiten esos cambios a ciegas.

## Reglas de este trabajo

- Nada se da por arreglado sin (a) una prueba que lo reproduzca y (b) que el usuario lo pruebe en las gafas.
- Todo comportamiento nuevo, detrás de un ajuste solo de RepArena XR (`xr: true` en `SCHEMA`), «Manos: filtro nuevo», que
  el usuario pueda encender y apagar en las gafas. **Apagado = exactamente lo de ahora.**
- `tests/compare` (`standing.compare.test.ts`, `hands.compare.test.ts`) siguen en verde con el ajuste apagado: lo nuevo va
  por un camino aparte (p. ej. `StandCfg.robust`), con sus pruebas en `tests/unit`.
- No se toca la lectura que se usa para PINTAR las manos ni los menús (`handSmooth`, `poke`): solo la que decide repeticiones.

## Defectos encontrados (trazas sintéticas, `curlRange` 27 cm, 72 imágenes por segundo)

Los D1-D6 están reproducidos tal como son hoy en `tests/unit/curl2-fallos.test.ts` (cada prueba afirma el fallo; al
arreglarlo, cambia de signo). Lo medido allí:

- **D1 · `bottom` frágil** (`B.bottom += (y - B.bottom) * (y < B.bottom ? 0.5 : 0.0012)`): baja la mitad de la diferencia
  en un fotograma y sube un 0,12 % por fotograma (depende de los fps, no de `dt`). Un solo dato 30 cm bajo deja `bottom` en
  −0,93 (reposo −0,78), a los 10 s aún −0,843, y el estado pasa a «subiendo» estando quieto; si luego se pierden las manos
  0,4 s, `charge` + `rep` fantasma. Un curl normal con `bottom` hundido carga a los 0,35 s (limpio: 0,58 s) y dispara a los
  1,51 s (limpio: 1,32 s). Con 25 cm, `bottom` queda en −0,905.
- **D2 · «perdidas subiendo»** (`rising && lost > 0.25 && max - bottom >= range * 0.4` → `charge` + `rep`): subir 15 cm,
  perder las manos 0,5 s y reaparecer abajo dispara (con 12 cm no llega a «subiendo»). Es una regla de RepArena (la pesa
  tapa las manos): **no se quita sin proponer la alternativa al usuario** (fase 3).
- **D3 · `clasp` sin HF**: tres fotogramas con las dos manos 30 cm arriba = `charge` + `top` + `rep`.
- **D4 · HF y «la que se mueve»**: HF confirma una mano reaparecida o que ha saltado con 2 fotogramas, y con las manos a más
  de 15 cm de altura `barStep` elige la de más `hv`: una mano mal colocada 0,5 s con barra ancha manda sobre la buena →
  `charge` + `rep` fantasma. `hv` no decae con la mano perdida y en el empate gana siempre la izquierda.
- **D5 · posturas congeladas**: las gafas repiten la última postura de una mano que pierden; `handSmooth` lo nota (`same`)
  solo para pintar; para el juego sigue `ok` y pasa HF. Con las manos juntas, una congelada a medio camino deja la media a la
  mitad: «Sube hasta el hombro» en vez de la repetición. (Congelada desde abajo, el `clasp` se rompe y vale la que se mueve.)
- **D6 · posturas a menos fps que la imagen**: HF mide el salto por fotograma contra `vmax · dt` con el `dt` de la imagen,
  pero las posturas pueden cambiar más despacio (se repiten): a 36 Hz con imagen a 72, en un curl rápido con barra ancha HF
  rechaza las manos en plena subida y la repetición entra por «reaparecen ya arriba» (nunca rápida ni perfecta).
- **D7 · sin datos**: el diagnóstico va a 10 Hz y no apuntaba nada del detector → **caja negra** (fase 1, hecha).
- **D8 (menor)**: `bottom` empieza en −0,78 sin medir al usuario; `armStep` (curl a un brazo) tiene D1 y D2 y no usa HF;
  `fraiseStep` y `chainStep` comparten D4-D6.
- ~~Sin confirmar~~ **Lo que dijo la caja negra de las gafas** (Quest 3, kettlebell, `curlRange` 20 cm;
  `tests/replay/capturas/curl2-kettlebell-rayos-a-destiempo.txt`):
  - las gafas dan **postura nueva casi en cada imagen** (no repiten la vieja de una mano perdida: rachas repetidas de 34 ms
    como mucho), **nunca** `emulatedPosition` y la mano **nunca** pasa a mando; una mano que no ven, la dan por perdida.
    D5 y D6 no pasan así en sus gafas; D1 (lo más bajo hundido) tampoco se vio;
  - cada mano se pierde y vuelve varias veces por curl; al volver, a veces con **un salto falso** (16 cm, 50 cm…) uno o dos
    fotogramas; las manos del usuario van a 18-25 cm (justo el límite de `clasp`), y tras la pausa a 80 cm (una vuelve del
    botón);
  - **los rayos a destiempo** (12 + 4 rayos; 5 mal): uno subiendo (`clasp` mezcla una mano recién reaparecida con su salto
    falso: D3); uno al quitar la pausa (seguía «arriba, cargado»: **D9**); uno con la mano que vuelve del botón de la pausa
    («la que se mueve»: D4); uno a un tercio de la subida al perder las dos manos y ninguno al bajar (D2); y un «Sube hasta el
    hombro» falso al bajar (las dos manos no bajan a la vez y la subida empezaba con 1 cm de margen);
  - aparte: tras quitar la pausa la imagen iba a ~28 por segundo (35 ms por imagen) un buen rato.

## Fases (un PR cada una; el usuario prueba en las gafas entre fases)

1. **Grabar y reproducir** (sin cambiar el juego) — hecha:
   - la **caja negra** (`src/core/blackbox.ts`, la llena `GameSystem.blackBox` en `src/combat/game.ts`): los últimos 25 s,
     fotograma a fotograma, de los ejercicios con pesas (`holdsWeights`) en partida (también calibrando). Por fotograma: `t`,
     `dt`, la cabeza (y su velocidad); por mano, lo que entra al detector (se ve, mano o mando, la muñeca; el nudillo en los
     antebrazos), si la postura es nueva o repetida, `emulatedPosition` y si hay fuente (`src/input/hand-probe.ts`, que solo
     mira lo que dan las gafas), si la mano vale para HF y si la inventa el juego; del detector, su estado y sus números
     (`curl2`: altura usada, `bottom`, `max`, `lost`, `hv` y `clasp`), cuándo empieza de cero y sus sucesos. Anillo en listas
     ya reservadas: nada se crea al jugar. Se guarda con el diagnóstico (pausa › «Guardar diagnóstico» y al salir de las gafas)
     en `reparenaxr-blackbox` (las 3 últimas; no se sincroniza) y la página la deja descargar y copiar;
   - el **reproductor** (`tests/replay/`): lee una captura y la pasa por `StandingDetector`, colocando el detector como
     estaba si la captura empieza a mitad; comprueba que da los mismos sucesos que se grabaron (las capturas en
     `tests/replay/capturas/`, con `npm test`) y `CAPTURA=archivo npm run replay` imprime cada suceso. Con `replay(…, { cfg })`
     se probará el camino nuevo con la misma captura;
   - las pruebas de D1-D6 tal como son hoy (`tests/unit/curl2-fallos.test.ts`).
   - **Lo siguiente**: el usuario juega `curl2` y, justo después de un disparo raro, pausa y «Guardar diagnóstico» (2-3
     capturas, diciendo si es barra ancha o kettlebell). Con ellas se decide cuáles de D1-D6 pasan de verdad y con qué números
     (ritmo de las posturas, cuánto duran las congeladas, tamaño de los saltos) antes de la fase 2.
2. **Arreglos del detector** — hechos, detrás de «Manos: filtro nuevo» (`handsNew`, `xr: true`, apagado de serie; en
   Ajustes › Ejercicio y en la pausa, que vale al seguir): `StandCfg.robust` → `barRobust` (`src/exercise/standing.ts`, sus
   números en `RB`). Elegido por el usuario: **opción A** para las perdidas subiendo y los tres arreglos que se le propusieron:
   - **cada mano solo vale estable** `RB.settle` (0,1 s) tras reaparecer o tras un salto imposible (`RB.vmax` × el tiempo de
     la imagen) y a tu alcance (`rbHands`; la caja negra la enseña con la marca 20);
   - **una mano que no casa no está en la pesa**: juntas (misma altura y tu separación de siempre, `rb.sep`, aprendida con
     las dos a la misma altura), su media; si no, la que sigue a la última altura de confianza (`rbPred`/`rbFits`: su
     velocidad, hasta 0,3 s); sin con qué comparar, ninguna (`rbRead`). Sustituye a «la que se mueve» (`hv`) y a `clasp`
     sin filtrar;
   - **perdidas subiendo (opción A)**: no dispara; queda «en el aire» (`rb.air`): si reaparecen arriba, cuenta y dispara al
     bajar; abajo antes de 1 s, no cuenta; abajo después, cuenta; sin verlas 1,5 s, cuenta;
   - **al quitar la pausa** (`barResume`, desde `GameSystem`; la caja negra lo apunta con «sigue») la pesa empieza de cero,
     como arriba y sin carga;
   - además, lo más bajo del recorrido se adapta por tiempo (no por imagen) y una subida nueva pide 5 cm sobre lo más bajo
     desde que bajó (`RB.hyst`: el «Sube hasta el hombro» falso).
   Pruebas: `tests/unit/curl2-robusto.test.ts` (D1-D5 ya sin disparo, la opción A, la pausa y los curls limpios: kettlebell
   y barra, lentos y rápidos, a 72 y 90, igual que siempre) y `tests/replay/curl2-robusto.test.ts` (la caja negra del
   usuario: sin los 5 fallos y con los 11 rayos buenos). `CAPTURA=archivo ROBUSTO=1 npm run replay` enseña una captura con
   el filtro nuevo. **Lo siguiente**: que el usuario lo pruebe en las gafas, encendido y apagado (con la caja negra).
   Lo que quedaba en el plan original de esta fase y no ha hecho falta por lo que enseñaron las capturas (lo más bajo medido
   al calibrar, la banda alrededor del calibrado): si vuelve a verse, se hace. El plan original:
   en `barStep` (camino `robust`):
   `bottom` con `dt`, sin seguir hacia abajo un dato suelto (que dure ≥ 0,2 s o mediana corta), en una banda creíble alrededor
   del calibrado, sin adaptarse agachado ni fuera de «abajo», y medido al calibrar (`calibStep` → `st.reset`) si se ven las
   manos; `hv` que decae a 0 con la mano perdida y al reaparecer, sin preferir la izquierda (en el empate, la más cercana a la
   última altura de confianza); una altura que salta más de lo posible desde la última de confianza (velocidad máxima ×
   tiempo real) no se usa hasta confirmarse durante un tiempo (no un número de fotogramas); `clasp` también con manos de
   confianza. Pruebas: las de D1-D6 pasan a «no dispara» o «dispara a tiempo» y los curls limpios de referencia siguen igual
   (kettlebell y barra ancha, lentos y rápidos, 72 y 90 fps).
3. **Los demás ejercicios con pesas** — empezada: **el curl a un brazo** (`armRobust`), con la caja negra de la mancuerna
   (`tests/replay/capturas/curl-mancuerna-rayo-al-llegar-arriba.txt`): en dos partidas, un rayo al llegar arriba; la mano,
   tras un rato perdida, reaparecía arriba y a la imagen siguiente saltaba 25-50 cm hacia abajo (1-3 imágenes), y esos saltos
   hundían lo más bajo del recorrido hasta 20 cm (D1 de verdad): con la mano casi abajo el juego la creía arriba (cargas y un
   rayo al perderla). Con el filtro: la mano solo vale estable, lo más bajo solo con ella, la opción A al perderla subiendo y
   de cero al quitar la pausa; en la caja negra, sin ningún rayo al llegar arriba y cada curl con su rayo al bajar. Aparte:
   en esas partidas la imagen iba a ratos a 25-30 por segundo. Faltan la elevación frontal y los de dos tiempos (con su caja
   negra). El plan original de esta fase (capa común, con las capturas, lo de «postura repetida o congelada» no hace falta en las gafas del usuario: la
   capa común sería sobre todo llevar lo de `rbHands`/`rbRead` a `armStep`, `fraiseStep` y `chainStep`) (capa común de lógica pura, p. ej. `src/input/hand-quality.ts`): por mano y fotograma, postura
   nueva o repetida, tiempo desde la última nueva (congelada pasado un umbral sacado de las capturas, orientativo 100-150 ms),
   velocidad entre posturas nuevas con su tiempo real (arregla D6 sin «procesar solo posturas nuevas»: los fotogramas
   repetidos siguen contando el tiempo), confirmación de reaparición o salto por tiempo y coherencia. Sustituye a HF solo en
   el camino `robust`; primero `curl2`, luego `armStep`, `fraiseStep` y `chainStep`. **D2: ya decidido (opción A, hecho en la
   fase 2)** (recomendación: no disparar al perderlas; la repetición queda «en el aire» y se resuelve al reaparecer —arriba,
   cuenta y dispara al bajar; abajo antes de ~1 s, no cuenta—; si no reaparecen en ~1,5 s, cuenta; opcional, si las capturas
   dicen que es fiable, la muñeca del cuerpo para CONFIRMAR la subida, nunca para inventarla). El ajuste en `SCHEMA` con su
   explicación, su fila en el menú y la página, y la documentación.
4. **Cierre**: con el visto bueno del usuario en las gafas (encendido frente a apagado, kettlebell y barra), encendido de
   serie; el camino antiguo y sus comparaciones se quedan mientras el usuario no pida quitarlos. Repasar con las capturas lo
   «sin confirmar».

Cada PR: `npm run typecheck`, `npm test`, `RA_DIR=../reparena npm run test:compare` y `npm run test:e2e`; en español, con qué
cambia en las gafas, cómo se ha probado y qué tiene que mirar el usuario. No se fusiona un cambio de comportamiento sin que
el usuario lo haya probado.
