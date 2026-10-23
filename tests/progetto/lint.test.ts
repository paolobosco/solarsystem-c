// Lint con informazioni di tipo su src (RNF4): promesse non gestite e asserzioni di tipo superflue.

import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const REGOLE = [
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-misused-promises',
  '@typescript-eslint/no-unnecessary-type-assertion',
];

describe('configurazione di ESLint', () => {
  const eslint = new ESLint({ cwd: RADICE });

  it('src usa il servizio di progetto di TypeScript e le regole tipizzate', async () => {
    for (const file of ['src/main.ts', 'src/app/avvio.ts', 'src/render/texture.ts', 'src/ephem/moon.ts']) {
      const cfg = (await eslint.calculateConfigForFile(file)) as {
        languageOptions?: { parserOptions?: { projectService?: unknown } };
        rules?: Record<string, unknown[]>;
      };
      expect(cfg.languageOptions?.parserOptions?.projectService, file).toBe(true);
      for (const r of REGOLE) expect(cfg.rules?.[r]?.[0], `${file}: ${r}`).toBe(2);
    }
  });

  it('le regole tipizzate segnalano promesse non gestite e asserzioni superflue', async () => {
    const codice = [
      'export async function f(): Promise<number> {',
      '  return 1;',
      '}',
      'export function g(t: readonly [number, number]): number {',
      '  f();',
      '  return t[0]!;',
      '}',
      '',
    ].join('\n');
    const [r] = await eslint.lintText(codice, { filePath: `${RADICE}src/app/avvio.ts` });
    const trovate = new Set((r?.messages ?? []).map((m) => m.ruleId));
    expect(trovate.has('@typescript-eslint/no-floating-promises')).toBe(true);
    expect(trovate.has('@typescript-eslint/no-unnecessary-type-assertion')).toBe(true);
  }, 60_000);
});
