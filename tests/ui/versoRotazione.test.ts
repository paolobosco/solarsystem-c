// Verso della rotazione nella scheda dal catalogo pubblicato: inclinazione dell'asse dal polo WGCCRE, altrimenti dal
// polo SBDB o di letteratura (§ 9).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import { rotazioneMostrata } from '../../src/ui/datiScheda';

const catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
const fisica = (slug: string) => catalogo.corpi.find((c) => c.slug === slug)!.fisica;

describe('verso della rotazione dei piccoli corpi senza modello WGCCRE', () => {
  it('retrograda dai poli SBDB (Bennu, Ryugu, Didymos) e di letteratura (Arrokoth, Spencer et al. 2020; Hektor, Marchis et al. 2014)', () => {
    for (const slug of ['bennu', 'ryugu', 'didymos', 'arrokoth', 'hektor']) {
      const f = fisica(slug);
      expect(f.inclinazioneAssiale_gradi?.valore, slug).toBeGreaterThan(90);
      expect(rotazioneMostrata(f).retrograda, slug).toBe(true);
    }
  });
});
