import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
import pkg from './package.json';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@rn': resolve(__dirname, 'src'),
      '@rsh': resolve(__dirname, '../src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
  server: {
    port: 5174,
  },
  test: {
    environment: 'node',
    alias: {
      '@rn/': resolve(__dirname, 'src') + '/',
      '@rsh/': resolve(__dirname, '../src') + '/',
    },
  },
});
