// Dipendenze fissate nel lockfile (RNF4): nessun pacchetto dichiarato deprecato dal registro.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Voce {
  version?: string;
  deprecated?: string;
}

const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf-8')) as {
  lockfileVersion: number;
  packages: Record<string, Voce>;
};

describe('package-lock.json', () => {
  it('nessun pacchetto deprecato', () => {
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
    const deprecati = Object.entries(lock.packages)
      .filter(([, v]) => v.deprecated !== undefined)
      .map(([k, v]) => `${k}@${v.version ?? '?'}: ${v.deprecated}`);
    expect(deprecati).toEqual([]);
  });
});
