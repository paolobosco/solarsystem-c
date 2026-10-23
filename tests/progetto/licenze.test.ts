// Licenza MIT di three.js nel codice distribuito (§ 16.3 di docs/PROGETTO.md, A26): avviso di copyright nel
// bundle, testo integrale della licenza in assets/LICENZE.txt, titolare citato in Fonti e metodi.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { FONTI_METODI_SEZIONI } from '../../src/ui/testi.it';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const LICENZA = readFileSync(join(RADICE, 'node_modules/three/LICENSE'), 'utf-8');
const COPYRIGHT = /^Copyright .+$/m.exec(LICENZA)?.[0] ?? '';
const PERMESSO = 'The above copyright notice and this permission notice shall be included in';

const cartelle: string[] = [];
afterAll(() => {
  for (const c of cartelle) rmSync(c, { recursive: true, force: true });
});

/** Build di produzione nella modalità indicata, senza i dati di public/. */
async function costruisci(mode: string): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), `licenze-${mode}-`));
  cartelle.push(out);
  await build({
    root: RADICE,
    mode,
    logLevel: 'silent',
    build: { outDir: out, emptyOutDir: true, copyPublicDir: false },
  });
  return out;
}

describe('licenza di three.js', () => {
  it('il file LICENSE del pacchetto contiene copyright e permesso', () => {
    expect(COPYRIGHT).toMatch(/three\.js authors/i);
    expect(LICENZA).toContain(PERMESSO);
  });

  for (const mode of ['artifact', 'production']) {
    it(`build ${mode}: @license nel bundle e assets/LICENZE.txt con il testo integrale`, async () => {
      const out = await costruisci(mode);
      const js = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'));
      expect(js.length).toBeGreaterThan(0);
      const bundle = js.map((f) => readFileSync(join(out, 'assets', f), 'utf-8')).join('\n');
      // Esito booleano: il messaggio d'errore non riporta l'intero bundle.
      expect({
        license: bundle.includes('@license'),
        copyright: /Copyright 2010-\d{4} Three\.js Authors/.test(bundle),
        spdx: bundle.includes('SPDX-License-Identifier: MIT'),
      }).toEqual({ license: true, copyright: true, spdx: true });
      const avvisi = join(out, 'assets/LICENZE.txt');
      expect(existsSync(avvisi)).toBe(true);
      const testo = readFileSync(avvisi, 'utf-8');
      expect(testo).toContain(LICENZA.trim());
      expect(testo).toContain(COPYRIGHT);
      expect(testo).toContain(PERMESSO);
    }, 120_000);
  }

  it('Fonti e metodi cita titolare, licenza e file degli avvisi', () => {
    const voce = FONTI_METODI_SEZIONI.find((s) => s.titolo === 'Licenze e attribuzioni');
    const testo = voce?.paragrafi.join(' ') ?? '';
    expect(testo).toContain(COPYRIGHT.replace(/^Copyright /, ''));
    expect(testo).toContain('licenza MIT');
    expect(testo).toContain('assets/LICENZE.txt');
  });
});
