import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  plugins: [react()],
  build: { outDir: '../dist/public', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 0 },
  server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
