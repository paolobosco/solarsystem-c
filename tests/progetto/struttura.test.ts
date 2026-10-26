// Struttura del repository (§ 5.3 di docs/PROGETTO.md): ogni voce versionata nella radice è descritta nel § 5.3,
// salvo i file di servizio di git e npm e il README. Le schermate delle prove vanno in test-results/, esclusa da git.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const SERVIZIO = new Set(['.gitignore', '.npmrc', 'LICENSE', 'README.md', 'README.en.md', 'README.it.md', 'package-lock.json']);

function struttura(): string {
  const progetto = readFileSync(join(RADICE, 'docs/PROGETTO.md'), 'utf-8');
  const inizio = progetto.indexOf('### 5.3 ');
  expect(inizio).toBeGreaterThan(0);
  const blocco = /```\n([\s\S]*?)```/.exec(progetto.slice(inizio));
  expect(blocco).not.toBeNull();
  return blocco![1]!;
}

describe('struttura del repository', () => {
  it('ogni voce versionata nella radice è nel § 5.3', () => {
    const testo = struttura();
    const versionati = execFileSync('git', ['ls-files', '-z'], { cwd: RADICE, encoding: 'utf-8' })
      .split('\0')
      .filter((f) => f !== '' && existsSync(join(RADICE, f)));
    const radice = [...new Set(versionati.map((f) => f.split('/')[0]!))].sort();
    expect(radice.length).toBeGreaterThan(10);
    const nome = (v: string): RegExp => new RegExp(`(^|[\\s,])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([/\\s,]|$)`, 'm');
    expect(radice.filter((v) => !SERVIZIO.has(v) && !nome(v).test(testo))).toEqual([]);
  });
});
