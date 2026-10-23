/// <reference types="vitest/config" />
// Build del sito (dist/), della build di test (--mode test, dist-test/) e della pagina singola
// (--mode artifact, § 5.7 di docs/PROGETTO.md): cartella intermedia dist-artifact-build/, distinta da dist/,
// nomi stabili assets/app.js e assets/app.css, un solo file JavaScript e un solo foglio di stile;
// scripts/make-artifact.mjs ne ricava dist-artifact/.
// Licenza di three.js (MIT, § 16.3): la minificazione conserva i commenti @license in coda al bundle e ogni
// build pubblica assets/LICENZE.txt con il testo integrale di node_modules/three/LICENSE e la licenza MIT di Vite
// (polyfill di modulepreload inserito nel bundle).
// chunkSizeWarningLimit 1500 kB (§ 5.7): il bundle è un solo file JavaScript, senza import dinamici, di circa
// 860 kB; con la soglia predefinita di Vite, 500 kB, ogni build darebbe l'avviso. Oltre 1,5 MB l'avviso resta.

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const FILE_LICENZE = 'assets/LICENZE.txt';

/** Licenza MIT di Vite: prima sezione di LICENSE.md, fino alle licenze delle dipendenze. */
function licenzaVite(): string {
  const testo = readFileSync(new URL('./node_modules/vite/LICENSE.md', import.meta.url), 'utf-8');
  const inizio = testo.indexOf('MIT License');
  const fine = testo.indexOf('# Licenses of bundled dependencies');
  return testo.slice(inizio, fine > inizio ? fine : undefined).trim();
}

/** Avvisi di licenza del codice di terze parti contenuto nel bundle. */
function testoLicenze(): string {
  const three = new URL('./node_modules/three/', import.meta.url);
  const { version } = JSON.parse(readFileSync(new URL('package.json', three), 'utf-8')) as { version: string };
  return [
    'Avvisi di licenza del codice di terze parti contenuto in assets/*.js.',
    '',
    `three ${version} (https://threejs.org/), compreso examples/jsm/controls/OrbitControls.js.`,
    'Testo integrale della licenza (file LICENSE del pacchetto):',
    '',
    readFileSync(new URL('LICENSE', three), 'utf-8').trim(),
    '',
    'Vite (https://vite.dev/): polyfill di modulepreload inserito nel bundle.',
    'Testo integrale della licenza (file LICENSE.md del pacchetto, sezione MIT):',
    '',
    licenzaVite(),
    '',
  ].join('\n');
}

function avvisiLicenze(): Plugin {
  return {
    name: 'avvisi-licenze',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: FILE_LICENZE, source: testoLicenze() });
    },
  };
}

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    plugins: [avvisiLicenze()],
    esbuild: { legalComments: 'eof' },
    build: {
      target: 'es2022',
      outDir: artifact ? 'dist-artifact-build' : 'dist',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 1500,
      ...(artifact
        ? {
            cssCodeSplit: false,
            rollupOptions: {
              output: {
                inlineDynamicImports: true,
                entryFileNames: 'assets/app.js',
                assetFileNames: (info: { names?: readonly string[] }) =>
                  (info.names ?? []).some((n) => n.endsWith('.css')) ? 'assets/app.css' : 'assets/[name][extname]',
              },
            },
          }
        : {}),
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
      testTimeout: 30000,
    },
  };
});
