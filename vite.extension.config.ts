/**
 * Construye la extensión en extension/:
 *   - pokeidlelab.user.js: React, los datos, el CSS y el Analyzer en un solo archivo.
 *   - manifest.json: para cargar la carpeta en Chrome/Edge como extensión.
 * El mismo .user.js se instala también en Tampermonkey.
 *
 *   npm run build:extension
 *
 * USERSCRIPT_REPO elige de qué repo se actualiza Tampermonkey
 * (PokeIdleLab por defecto; Poke-Idle-Lab-Estable para la versión estable).
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const repo = process.env.USERSCRIPT_REPO || 'PokeIdleLab';
const fileName = 'pokeidlelab.user.js';
const rawUrl = `https://raw.githubusercontent.com/GigaBuda/${repo}/main/extension/${fileName}`;
const description =
  'Tier list, calculadoras, optimizador de XP y objetos dentro de Poke Idle World, con el Analyzer de IV y el aviso de ventas.';

const header = `// ==UserScript==
// @name         PokeIdleLab
// @namespace    poke-idle-lab
// @version      ${pkg.version}
// @description  ${description}
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-idle
// @updateURL    ${rawUrl}
// @downloadURL  ${rawUrl}
// ==/UserScript==
`;

const manifest = {
  manifest_version: 3,
  name: 'PokeIdleLab',
  version: pkg.version,
  description,
  icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  content_scripts: [
    {
      matches: ['https://poke.idleworld.online/*'],
      js: [fileName],
      run_at: 'document_idle',
      // Mismo contexto que Tampermonkey con @grant none: comparte window con el
      // juego, así que la extensión y el script no se duplican si están los dos.
      world: 'MAIN',
    },
  ],
};

function extensionFiles(): Plugin {
  return {
    name: 'pokeidlelab-extension-files',
    generateBundle(_options, bundle) {
      // La cabecera va después de minificar para que el minificador no la borre.
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) chunk.code = header + chunk.code;
      }
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) + '\n' });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), extensionFiles()],
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
  // En modo librería Vite no reemplaza process.env.NODE_ENV y React lo necesita.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  publicDir: false,
  build: {
    outDir: 'extension',
    // Conserva extension/icons, que no los genera este build.
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: 'src/userscript/main.tsx',
      name: 'PokeIdleLab',
      formats: ['iife'],
      fileName: () => fileName,
    },
  },
});
