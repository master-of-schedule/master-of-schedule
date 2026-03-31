import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'path'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
const pkg = _require('./package.json')

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

export default defineConfig({
  plugins: [react(), viteSingleFile(), inlineFavicon()],
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
})
