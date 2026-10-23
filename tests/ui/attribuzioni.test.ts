// Attribuzione delle mappe CC BY 4.0 (Legal Code, § 3(a)(1)(B-C)): licenza con URI e modifiche dichiarate nella
// scheda, in "Fonti e metodi" e nei documenti.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import { FONTI_METODI_SEZIONI, T, URI_LICENZE } from '../../src/ui/testi.it';

const RADICE = new URL('../../', import.meta.url).pathname;
const URI_CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
const catalogo = leggiCatalogo(JSON.parse(readFileSync(join(RADICE, 'public/data/v1/catalog.json'), 'utf8')));

describe('mappe CC BY 4.0: URI della licenza e modifiche', () => {
  it('ogni licenza CC BY del catalogo ha l’URI e la scheda lo mostra con le modifiche', () => {
    const ccBy = catalogo.corpi.filter((c) => c.texture !== null && /CC BY/.test(c.texture.licenza));
    expect(ccBy.map((c) => c.slug).sort()).toEqual(['nettuno', 'saturno', 'urano']);
    for (const c of ccBy) {
      const uri = URI_LICENZE[c.texture!.licenza];
      expect(uri, c.slug).toBe(URI_CC_BY);
      const testo = T.scheda.licenzaModificata(c.texture!.licenza, uri!);
      expect(testo).toContain(URI_CC_BY);
      expect(testo).toContain('ricampionata');
    }
  });

  it('"Fonti e metodi" e documenti riportano l’URI della licenza', () => {
    for (const titolo of ['Stelle e mappe', 'Licenze e attribuzioni']) {
      const testo = FONTI_METODI_SEZIONI.find((s) => s.titolo === titolo)!.paragrafi.join(' ');
      expect(testo, titolo).toContain(`CC BY 4.0`);
      expect(testo, titolo).toContain(URI_CC_BY);
      expect(testo, titolo).toContain('ricampionate e riallineate in longitudine');
    }
    for (const f of ['docs/LICENZE.md', 'README.md', 'docs/PROGETTO.md']) expect(readFileSync(join(RADICE, f), 'utf8'), f).toContain(URI_CC_BY);
  });
});
