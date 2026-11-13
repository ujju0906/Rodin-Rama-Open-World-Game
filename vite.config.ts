import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // viewer.html is a developer page for checking character models; it is not published.
    rollupOptions: {
      input: { main: 'index.html', viewer: 'viewer.html' },
      // Each embedded model becomes its own file: some hosts limit a single script to 16 MB.
      output: {
        manualChunks: (id: string) => (/src\/assets\/\w+\.ts$/.test(id) ? `model-${id.split('/').pop()!.replace('.ts', '')}` : undefined),
      },
    },
  },
});
