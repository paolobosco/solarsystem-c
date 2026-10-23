// Coerenza tra i tipi del catalogo (src/data/catalogTypes.ts) e lo schema JSON (§ 8.10).

import { describe, expect, it } from 'vitest';
import schema from '../../docs/schema/catalog.schema.json';
import anagrafica from '../../scripts/pipeline/bodies.json';
import { CATEGORIE_PER_PRECEDENZA, RE_SLUG } from '../../src/data/catalogTypes';
import type {
  Catalogo,
  CategoriaCatalogo,
  CorpoCatalogo,
  FonteIntervallo,
  ModelloNG,
  Orientamento,
  Soluzione,
  Texture,
} from '../../src/data/catalogTypes';

type Def = { required?: string[]; properties?: Record<string, unknown> };
const defs = schema.$defs as unknown as Record<string, Def>;

function chiaviRichieste(nome: string): string[] {
  return [...(defs[nome]?.required ?? [])].sort();
}

const soluzione: Soluzione = { id: 'DE441', data: null, estrazione: '2026-10-18', modelloNG: null, recordDastcom: null };
const modelloNG: ModelloNG = { A1: 1e-9, A2: null, A3: null, DT: null, g: null };
const orientamento: Orientamento = { modello: 'vondrak', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: false };
const texture: Texture = { file: 'tex/terra.jpg', lon0_u: 0.5, verso: 'est', fonte: 'NASA', licenza: 'pubblico dominio', areeNonOsservate: 'nessuna' };
const fonte: FonteIntervallo = { tipo: 'assist', inizio: -1931200.5, fine: 2305447.5, descrizione: 'ASSIST', varianti: [], saltoGiunzioneKm: null };
const categoria: CategoriaCatalogo = { id: 'pianeta', precedenza: 1, filtrabile: true };
const corpo: CorpoCatalogo = {
  ssid: 3,
  slug: 'terra',
  nome: 'Terra',
  nomeUfficiale: 'Earth',
  numero: null,
  designazione: null,
  alias: [],
  categoria: 'pianeta',
  categorieSecondarie: [],
  naif: 399,
  spkid: null,
  primario: 'sole',
  effemeridi: { modello: 'pianeta', naifDE441: 3 },
  soluzione,
  fisica: { raggi_km: null, gm_km3s2: null, rotazione: null, albedo: null },
  orientamento,
  texture,
  epsModelloCostante: null,
};
const catalogo: Catalogo = { formato: 1, generato: '2026-10-18T00:00:00Z', corpi: [corpo], categorie: [categoria] };

describe('schema del catalogo', () => {
  it('draft 2020-12 e pattern dello slug', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(defs.slug).toMatchObject({ pattern: RE_SLUG.source });
  });

  it('categorie uguali ai tipi', () => {
    expect([...(defs.categoria as { enum: string[] }).enum].sort()).toEqual([...CATEGORIE_PER_PRECEDENZA].sort());
  });

  it('campi richiesti uguali ai tipi TypeScript', () => {
    expect([...schema.required].sort()).toEqual(Object.keys(catalogo).sort());
    expect(chiaviRichieste('corpo')).toEqual(Object.keys(corpo).sort());
    expect(chiaviRichieste('soluzione')).toEqual(Object.keys(soluzione).sort());
    expect(chiaviRichieste('modelloNG')).toEqual(Object.keys(modelloNG).sort());
    expect(chiaviRichieste('orientamento')).toEqual(Object.keys(orientamento).sort());
    expect(chiaviRichieste('texture')).toEqual(Object.keys(texture).sort());
    expect(chiaviRichieste('fonteIntervallo')).toEqual(Object.keys(fonte).sort());
    expect(chiaviRichieste('categoriaCatalogo')).toEqual(Object.keys(categoria).sort());
    expect(chiaviRichieste('fisica')).toEqual(Object.keys(corpo.fisica).sort());
    expect(Object.keys(defs.corpo?.properties ?? {}).sort()).toEqual([...Object.keys(corpo), 'sbdb', 'anelli'].sort());
  });

  it('anagrafica dei corpi compatibile (slug, categorie, ssid, primari)', () => {
    const slug = new Set(anagrafica.corpi.map((c) => c.slug));
    expect(slug.size).toBe(anagrafica.corpi.length);
    anagrafica.corpi.forEach((c, i) => {
      expect(c.ssid).toBe(i);
      expect(c.slug).toMatch(RE_SLUG);
      expect(CATEGORIE_PER_PRECEDENZA).toContain(c.categoria);
      for (const s of c.categorieSecondarie) expect(CATEGORIE_PER_PRECEDENZA).toContain(s);
      if (c.primario !== null) expect(slug.has(c.primario)).toBe(true);
    });
  });
});
