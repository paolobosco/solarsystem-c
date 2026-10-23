// File di configurazione senza API deprecate (RNF4: strumenti supportati), con la regola tipizzata
// @typescript-eslint/no-deprecated. File separato: il servizio di progetto di typescript-eslint è condiviso
// nel processo e qui serve allowDefaultProject per eslint.config.js, fuori da tsconfig.json.

import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const FILE = ['eslint.config.js', 'vite.config.ts', 'playwright.config.ts', 'e2e/ui-lab.config.ts', 'tests/render/playwright.render.config.ts'];

describe('API deprecate', () => {
  it('i file di configurazione non usano API deprecate (no-deprecated)', async () => {
    const controllo = new ESLint({
      cwd: RADICE,
      overrideConfigFile: true,
      overrideConfig: {
        files: ['**/*.js', '**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { projectService: { allowDefaultProject: ['eslint.config.js'] }, tsconfigRootDir: RADICE },
        },
        plugins: { '@typescript-eslint': tseslint.plugin as ESLint.Plugin },
        rules: { '@typescript-eslint/no-deprecated': 'error' },
      },
    });
    const risultati = await controllo.lintFiles(FILE);
    expect(risultati.map((r) => relative(RADICE, r.filePath)).sort()).toEqual([...FILE].sort());
    const messaggi = risultati.flatMap((r) => r.messages.map((m) => `${relative(RADICE, r.filePath)}:${m.line} ${m.ruleId ?? ''} ${m.message}`));
    expect(messaggi).toEqual([]);
  }, 60_000);
});
