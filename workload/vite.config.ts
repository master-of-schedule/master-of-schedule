import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import pkg from './package.json';

function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const data = readFileSync('./public/favicon.png').toString('base64');
        return html.replace(
          /<link rel="icon"[^>]*>/,
          `<link rel="icon" type="image/png" href="data:image/png;base64,${data}">`,
        );
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile(), inlineFavicon()],
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
