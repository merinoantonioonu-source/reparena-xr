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
- **Sin confirmar** (hace falta la caja negra de las gafas): si al perder una mano las Quest dan posturas congeladas, nulas o
  con `emulatedPosition`; a qué ritmo cambian las posturas; si con los mandos cerca la fuente pasa de mano a mando.

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
2. **Arreglos del detector** (detrás de «Manos: filtro nuevo», con las capturas como prueba), en `barStep` (camino `robust`):
   `bottom` con `dt`, sin seguir hacia abajo un dato suelto (que dure ≥ 0,2 s o mediana corta), en una banda creíble alrededor
   del calibrado, sin adaptarse agachado ni fuera de «abajo», y medido al calibrar (`calibStep` → `st.reset`) si se ven las
   manos; `hv` que decae a 0 con la mano perdida y al reaparecer, sin preferir la izquierda (en el empate, la más cercana a la
   última altura de confianza); una altura que salta más de lo posible desde la última de confianza (velocidad máxima ×
   tiempo real) no se usa hasta confirmarse durante un tiempo (no un número de fotogramas); `clasp` también con manos de
   confianza. Pruebas: las de D1-D6 pasan a «no dispara» o «dispara a tiempo» y los curls limpios de referencia siguen igual
   (kettlebell y barra ancha, lentos y rápidos, 72 y 90 fps).
3. **Calidad de la mano** (capa común de lógica pura, p. ej. `src/input/hand-quality.ts`): por mano y fotograma, postura
   nueva o repetida, tiempo desde la última nueva (congelada pasado un umbral sacado de las capturas, orientativo 100-150 ms),
   velocidad entre posturas nuevas con su tiempo real (arregla D6 sin «procesar solo posturas nuevas»: los fotogramas
   repetidos siguen contando el tiempo), confirmación de reaparición o salto por tiempo y coherencia. Sustituye a HF solo en
   el camino `robust`; primero `curl2`, luego `armStep`, `fraiseStep` y `chainStep`. **D2: proponerlo al usuario antes de
   cambiarlo** (recomendación: no disparar al perderlas; la repetición queda «en el aire» y se resuelve al reaparecer —arriba,
   cuenta y dispara al bajar; abajo antes de ~1 s, no cuenta—; si no reaparecen en ~1,5 s, cuenta; opcional, si las capturas
   dicen que es fiable, la muñeca del cuerpo para CONFIRMAR la subida, nunca para inventarla). El ajuste en `SCHEMA` con su
   explicación, su fila en el menú y la página, y la documentación.
4. **Cierre**: con el visto bueno del usuario en las gafas (encendido frente a apagado, kettlebell y barra), encendido de
   serie; el camino antiguo y sus comparaciones se quedan mientras el usuario no pida quitarlos. Repasar con las capturas lo
   «sin confirmar».

Cada PR: `npm run typecheck`, `npm test`, `RA_DIR=../reparena npm run test:compare` y `npm run test:e2e`; en español, con qué
cambia en las gafas, cómo se ha probado y qué tiene que mirar el usuario. No se fusiona un cambio de comportamiento sin que
el usuario lo haya probado.
