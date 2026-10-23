// Risoluzione degli URL delle risorse (§ 5.7, RNF7, A24 di docs/PROGETTO.md).

import { describe, expect, it } from 'vitest';
import { risolviAsset, verificaPercorso } from '../../src/data/assetUrl';

describe('risolviAsset', () => {
  it('percorsi relativi alla pagina, anche da percorso annidato senza barra finale', () => {
    expect(risolviAsset('data/v1/manifest.json', 'https://esempio.test/a/b/index.html')).toBe('https://esempio.test/a/b/data/v1/manifest.json');
    expect(risolviAsset('assets/app.js', 'https://esempio.test/a/b')).toBe('https://esempio.test/a/assets/app.js');
    expect(risolviAsset('data/v1/planets/p00.bin', 'file:///tmp/sito/index.html')).toBe('file:///tmp/sito/data/v1/planets/p00.bin');
  });

  it.each(['', '/data/v1/x.bin', '//host/x', 'https://esempio.test/x', 'data:text/plain,x', 'x.bin?v=1', 'x.bin#a', '../x.bin', 'a/../../x', 'a\\b'])(
    'rifiuta %j',
    (percorso) => {
      expect(() => verificaPercorso(percorso)).toThrow();
    },
  );

  it('accetta nomi con punti', () => {
    expect(() => verificaPercorso('tex/terra.v2.jpg')).not.toThrow();
    expect(() => verificaPercorso('./data/v1/x.bin')).not.toThrow();
  });
});
