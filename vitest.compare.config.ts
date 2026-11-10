// Comparaciones con el código original de RepArena (tests/compare): npm run test:compare, con RA_DIR apuntando a un clon
// de RepArena. No van en la comprobación de cada PR (allí no está RepArena).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/compare/**/*.compare.test.ts'],
    environment: 'node',
  },
});
