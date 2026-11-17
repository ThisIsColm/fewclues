import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: { outDir: '../dist/public', emptyOutDir: true, target: 'es2020' },
  server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
