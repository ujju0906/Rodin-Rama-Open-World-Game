import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // viewer.html is a developer page for checking character models; it is not published.
    rollupOptions: { input: { main: 'index.html', viewer: 'viewer.html' } },
  },
});
