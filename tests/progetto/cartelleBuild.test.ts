// Cartelle di build (§ 5.2 e § 5.7 di docs/PROGETTO.md): la build in modalità artifact non tocca dist/, la
// build del sito; scripts/make-artifact.mjs ricava dist-artifact/ dalla build intermedia. Prova su una copia
// minima del progetto (index.html e make-artifact.mjs copiati, src e node_modules collegati, dati ridotti al
// manifest), con vite.config.ts del progetto.

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const CONFIGURAZIONE = join(RADICE, 'vite.config.ts');

const copia = mkdtempSync(join(tmpdir(), 'cartelle-build-'));
afterAll(() => rmSync(copia, { recursive: true, force: true }));

function preparaCopia(): void {
  copyFileSync(join(RADICE, 'index.html'), join(copia, 'index.html'));
  symlinkSync(join(RADICE, 'src'), join(copia, 'src'), 'dir');
  symlinkSync(join(RADICE, 'node_modules'), join(copia, 'node_modules'), 'dir');
  mkdirSync(join(copia, 'scripts'));
  copyFileSync(join(RADICE, 'scripts/make-artifact.mjs'), join(copia, 'scripts/make-artifact.mjs'));
  mkdirSync(join(copia, 'public/data/v1'), { recursive: true });
  writeFileSync(join(copia, 'public/data/v1/manifest.json'), JSON.stringify({ file: [] }));
}

async function costruisci(mode: string): Promise<void> {
  await build({ root: copia, configFile: CONFIGURAZIONE, mode, logLevel: 'silent' });
}

describe('cartelle di build', () => {
  it('build:artifact lascia in dist/ la build del sito e make-artifact.mjs produce dist-artifact/', async () => {
    preparaCopia();
    await costruisci('production');
    writeFileSync(join(copia, 'dist/segnaposto-sito'), '');
    const sito = readdirSync(join(copia, 'dist/assets')).sort();
    expect(sito.some((f) => /^index-[\w-]{8}\.js$/.test(f))).toBe(true);
    expect(sito.some((f) => /^index-[\w-]{8}\.css$/.test(f))).toBe(true);
    const indiceSito = readFileSync(join(copia, 'dist/index.html'), 'utf-8');

    await costruisci('artifact');
    execFileSync(process.execPath, [join(copia, 'scripts/make-artifact.mjs')], { stdio: 'pipe' });

    expect(existsSync(join(copia, 'dist/segnaposto-sito'))).toBe(true);
    expect(readdirSync(join(copia, 'dist/assets')).sort()).toEqual(sito);
    expect(readFileSync(join(copia, 'dist/index.html'), 'utf-8')).toBe(indiceSito);
    for (const f of ['index.html', 'assets/app.js', 'assets/app.css', 'assets/LICENZE.txt', 'data/v1/manifest.json']) {
      expect(existsSync(join(copia, 'dist-artifact', f)), f).toBe(true);
    }
  }, 240_000);

  it('la build intermedia della pagina singola è esclusa da ESLint e da git', async () => {
    const eslint = new ESLint({ cwd: RADICE });
    expect(await eslint.isPathIgnored(join(RADICE, 'dist-artifact-build/assets/app.js'))).toBe(true);
    const ignorati = readFileSync(join(RADICE, '.gitignore'), 'utf-8').split('\n');
    expect(ignorati).toContain('dist-artifact-build/');
  });

  it('le build di prova in dist-test* (anche con un altro --outDir) sono escluse da ESLint e da git (§ 5.2)', async () => {
    const eslint = new ESLint({ cwd: RADICE });
    const cartelle = ['dist-test', 'dist-test-rot', 'dist-test-2'];
    for (const c of cartelle) {
      expect(await eslint.isPathIgnored(join(RADICE, c, 'assets/index-AbCd1234.js')), `ESLint: ${c}`).toBe(true);
    }
    expect(readFileSync(join(RADICE, '.gitignore'), 'utf-8').split('\n')).toContain('dist-test*/');
    if (existsSync(join(RADICE, '.git'))) {
      for (const c of cartelle) {
        // Esce con 0 se il percorso è ignorato, con 1 se non lo è (--no-index: anche se la cartella non esiste).
        expect(() => execFileSync('git', ['check-ignore', '-q', '--no-index', `${c}/assets/index-AbCd1234.js`], { cwd: RADICE, stdio: 'pipe' }), `git: ${c}`).not.toThrow();
      }
    }
  });
});
