/**
 * Construye la extensión de Tampermonkey: un único scripts/pokeidlelab.user.js
 * con React, los datos, el CSS y el Analyzer dentro.
 *
 *   npm run build:userscript
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
const rawUrl = `https://raw.githubusercontent.com/GigaBuda/${repo}/main/scripts/${fileName}`;

const header = `// ==UserScript==
// @name         PokeIdleLab
// @namespace    poke-idle-lab
// @version      ${pkg.version}
// @description  Tier list, calculadoras, optimizador de XP y objetos de PokeIdleLab dentro de Poke Idle World, con el Analyzer de IV y el aviso de ventas.
// @match        https://poke.idleworld.online/*
// @grant        none
// @run-at       document-idle
// @updateURL    ${rawUrl}
// @downloadURL  ${rawUrl}
// ==/UserScript==
`;

// Se agrega después de minificar para que el minificador no borre la cabecera.
function userscriptHeader(): Plugin {
  return {
    name: 'pokeidlelab-userscript-header',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) chunk.code = header + chunk.code;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), userscriptHeader()],
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
    outDir: 'scripts',
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
