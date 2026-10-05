import { defineConfig } from 'vite';

// base relativa para que funcione en GitHub Pages (usuario.github.io/policias-y-ladrones/)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
