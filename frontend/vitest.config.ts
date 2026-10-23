import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // El ESM de @mui/x-data-grid importa directorios de @mui/material
    // (`@mui/material/styles`), que Node no resuelve sin pasar por Vite.
    server: { deps: { inline: [/@mui\/x-data-grid/] } },
  },
});
