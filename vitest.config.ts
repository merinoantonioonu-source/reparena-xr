// Las pruebas de la lógica pura (tests/unit). Configuración aparte de vite.config.ts: la de la app arranca el
// servidor de IWSDK y su navegador, que aquí no hacen falta.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
