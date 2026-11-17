# Capturas de la caja negra

Las cajas negras que manda el usuario desde las gafas (página › Diagnóstico › «Descargar la caja negra»), tal cual, como
`.txt`. El nombre dice qué pasó y con qué (`curl2-kettlebell-disparo-sin-subir.txt`, `curl2-barra-ancha-tarde.txt`…).

- `npm test` las reproduce todas y comprueba que el detector de ahora da los mismos sucesos que se grabaron (si no, la
  captura no basta para buscar el fallo).
- Para leer una: `CAPTURA=tests/replay/capturas/archivo.txt npm run replay` (cada suceso con su momento, grabado y
  reproducido, y el estado del detector).
- Cómo leer el texto: las líneas `#` de cada captura (y `src/core/blackbox.ts`).
