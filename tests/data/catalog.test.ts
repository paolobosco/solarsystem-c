// Catalogo (§ 8.10): lettura e verifiche a runtime, indici per ssid e slug, catalogo pubblicato.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ErroreCatalogo, IndiceCatalogo, caricaCatalogo, leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo, CorpoCatalogo } from '../../src/data/catalogTypes';
import type { DataStore } from '../../src/data/types';

const FILE = new URL('../../public/data/v1/catalog.json', import.meta.url);

function corpo(ssid: number, slug: string, categoria: CorpoCatalogo['categoria'], primario: string | null): CorpoCatalogo {
  return {
    ssid,
    slug,
    nome: slug,
    nomeUfficiale: null,
    numero: null,
    designazione: null,
    alias: [],
    categoria,
    categorieSecondarie: [],
    naif: null,
    spkid: null,
    primario,
    effemeridi: { modello: 'sole' },
    soluzione: { id: 'X', data: null, estrazione: null, modelloNG: null, recordDastcom: null },
    fisica: { raggi_km: null, gm_km3s2: null, rotazione: null, albedo: null },
    orientamento: { modello: 'fisso', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: true },
    texture: null,
    epsModelloCostante: null,
  };
}

function minimo(): Catalogo {
  return {
    formato: 1,
    generato: '2026-10-19T00:00:00Z',
    corpi: [corpo(0, 'sole', 'sole', null), corpo(1, 'terra', 'pianeta', 'sole'), corpo(2, 'luna', 'luna', 'terra')],
    categorie: [{ id: 'sole', precedenza: 0, filtrabile: false }],
  };
}

describe('catalogo', () => {
  it('indici per ssid, slug, primario e categoria', () => {
    const c = new IndiceCatalogo(leggiCatalogo(minimo()));
    expect(c.perSsid(2)?.slug).toBe('luna');
    expect(c.perSsid(1.5)).toBeUndefined();
    expect(c.perSlug('terra')?.ssid).toBe(1);
    expect(c.figli('terra').map((x) => x.slug)).toEqual(['luna']);
    expect(c.perCategoria('pianeta').length).toBe(1);
  });

  it('rifiuta cataloghi non conformi', () => {
    const casi: ((c: Catalogo) => void)[] = [
      (c) => (c.corpi[1]!.ssid = 5),
      (c) => (c.corpi[2]!.slug = 'terra'),
      (c) => (c.corpi[2]!.slug = 'Luna'),
      (c) => (c.corpi[2]!.primario = 'marte'),
      (c) => (c.corpi[0]!.primario = 'terra'),
      (c) => (c.corpi[1]!.categoria = 'stella' as CorpoCatalogo['categoria']),
      (c) => (c.corpi[1]!.epsModelloCostante = -1),
      (c) => (c.corpi[1]!.orientamento = { modello: 'wgccre', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: false }),
      (c) => ((c as { formato: number }).formato = 2),
    ];
    for (const altera of casi) {
      const c = minimo();
      altera(c);
      expect(() => leggiCatalogo(c)).toThrow(ErroreCatalogo);
    }
  });

  it('caricaCatalogo legge dal DataStore', async () => {
    const testo = new TextEncoder().encode(JSON.stringify(minimo()));
    const store: DataStore = {
      stato: () => 'pronto',
      carica: async () => testo.buffer.slice(0) as ArrayBuffer,
      rilascia: () => undefined,
      onCambio: () => () => undefined,
    };
    expect((await caricaCatalogo(store)).perSlug('luna')?.primario).toBe('terra');
  });
});

describe.skipIf(!existsSync(FILE))('catalogo pubblicato', () => {
  it('112 corpi, coerente con il formato', () => {
    const c = new IndiceCatalogo(leggiCatalogo(JSON.parse(readFileSync(FILE, 'utf8'))));
    expect(c.corpi.length).toBe(112);
    expect(c.perSlug('sole')?.epsModelloCostante).toBe(0);
    expect(c.perSlug('terra')?.orientamento.modello).toBe('vondrak');
    expect(c.figli('giove').map((x) => x.slug)).toEqual(['io', 'europa', 'ganimede', 'callisto', 'amaltea', 'imalia']);
    expect(c.perCategoria('luna').length).toBe(30);
    for (const x of c.corpi) {
      if (x.texture) {
        expect(existsSync(new URL(`../../public/data/v1/${x.texture.file}`, import.meta.url))).toBe(true);
        expect([x.texture.lon0_u, x.texture.verso]).toEqual([0.5, 'est']);
      }
    }
  });

  it('dati fisici: semiassi, periodo del modello disegnato, fonti e nomi (§ 4.3, § 8.10, § 9)', () => {
    const c = new IndiceCatalogo(leggiCatalogo(JSON.parse(readFileSync(FILE, 'utf8'))));
    for (const x of c.corpi) {
      const f = x.fisica;
      if (f.raggi_km) expect(f.raggi_km.valore, x.slug).toEqual([...f.raggi_km.valore].sort((p, q) => q - p));
      // periodo nella scheda = rotazione disegnata (360°/Ẇ)
      const o = x.orientamento;
      if (o.modello === 'wgccre' && o.coefficienti) {
        const wDot = o.coefficienti.w[1] ?? 0;
        expect(f.rotazione?.valore, x.slug).toBeCloseTo((360 / wDot) * 24, 9);
      }
      for (const v of [f.raggi_km, f.gm_km3s2, f.rotazione, f.albedo]) {
        if (!v) continue;
        expect(v.fonte, x.slug).not.toContain('§');
        expect(v.fonte, x.slug).not.toMatch(/(soluzione [A-Z0-9]+), \1/);
      }
    }
    const per = (s: string): CorpoCatalogo => c.perSlug(s)!;
    expect(per('eris').fisica.rotazione?.valore).toBeCloseTo(15.78 * 24, 6);
    expect(per('haumea').fisica.gm_km3s2?.valore).toBeCloseTo(267.37, 2);
    expect(per('febe').fisica.rotazione?.valore).toBeCloseTo(9.27398, 5);
    expect(Math.max(...per('19p-borrelly').fisica.raggi_km!.valore)).toBeLessThanOrEqual(3.5);
    expect(per('phaethon').fisica.raggi_km?.anno).toBe(2019);
    expect([per('c1680-v1').nome, per('c1680-v1').nomeUfficiale]).toEqual(['C/1680 V1', 'C/1680 V1']);
    expect(per('c1680-v1').alias).toContain('Grande cometa del 1680');
  });

  it('raggi dei modelli di forma al posto dei diametri radiometrici SBDB superati (§ 9)', () => {
    const c = new IndiceCatalogo(leggiCatalogo(JSON.parse(readFileSync(FILE, 'utf8'))));
    const fisica = (s: string) => c.perSlug(s)!.fisica;
    // Igea: Vernazza et al. 2020; Interamnia: Hanuš et al. 2020 (D = 332 ± 6 km, P siderale 8,712336 h);
    // Sylvia: Berthier et al. 2014 (Dv = 273 km, ± 10 km a 3 σ, qui a 1 σ); Hektor: Marchis et al. 2014 (D = 250 ± 26 km)
    expect(fisica('igea').raggi_km).toMatchObject({ valore: [217, 217, 217], incertezza: [7, 7, 7], anno: 2020 });
    expect(fisica('interamnia').raggi_km).toMatchObject({ valore: [166, 166, 166], incertezza: [3, 3, 3], anno: 2020 });
    expect(fisica('interamnia').rotazione).toMatchObject({ valore: 8.712336, anno: 2020 });
    expect(fisica('sylvia').raggi_km?.valore).toEqual([136.5, 136.5, 136.5]);
    expect(fisica('sylvia').raggi_km?.incertezza?.[0]).toBeCloseTo(10 / 3 / 2, 3);
    expect(fisica('hektor').raggi_km).toMatchObject({ valore: [125, 125, 125], incertezza: [13, 13, 13], anno: 2014 });
    expect(fisica('hektor').rotazione?.valore).toBe(6.92050885);
    expect(fisica('hektor').inclinazioneAssiale_gradi?.valore).toBeCloseTo(117, 0);
    // le albedo SBDB, legate ai diametri superati o non coerenti con il diametro adottato (Hektor: TRIAD 0,025, D di circa
    // 289 km con H = 7,32), non sono mostrate
    for (const s of ['igea', 'interamnia', 'sylvia', 'hektor']) expect(fisica(s).albedo, s).toBeNull();
  });

  it('inclinazione dell\u2019asse da un polo di letteratura: incertezza propagata dal polo (§ 9)', () => {
    const c = new IndiceCatalogo(leggiCatalogo(JSON.parse(readFileSync(FILE, 'utf8'))));
    const incertezza = (s: string) => c.perSlug(s)!.fisica.inclinazioneAssiale_gradi?.incertezza;
    // Arrokoth: A.R. e Dec. ± 1° (obliquità pubblicata 99 ± 1°, Spencer et al. 2020); Hektor: λ e β eclittici ± 10°
    expect(incertezza('arrokoth')).toBeCloseTo(1.0, 1);
    expect(incertezza('hektor')).toBeCloseTo(9.8, 1);
    // i poli SBDB e WGCCRE restano senza incertezza
    for (const s of ['bennu', 'ryugu', 'didymos', 'cerere', 'vesta']) expect(incertezza(s), s).toBeNull();
  });

  it('Disnomia: raggio di Brown e Butler 2023 (diametro 615 +60/-50 km), che supera i 700 ± 115 km del 2018 (§ 9)', () => {
    const c = new IndiceCatalogo(leggiCatalogo(JSON.parse(readFileSync(FILE, 'utf8'))));
    const f = c.perSlug('disnomia')!.fisica;
    expect(f.raggi_km).toMatchObject({ valore: [307.5, 307.5, 307.5], incertezza: [30, 30, 30], anno: 2023 });
    expect(f.raggi_km?.fonte).toContain('doi:10.3847/PSJ/ace52a');
    expect(f.raggi_km?.fonte).not.toContain('2018');
    expect(f.albedo).toBeNull(); // § 9: nessuna albedo per i satelliti
  });

  it('comete periodiche numerate: nome ufficiale dell\u2019MPC senza numerale, forma con il numerale come nome e alias (§ 4.3)', () => {
    const c = new IndiceCatalogo(leggiCatalogo(JSON.parse(readFileSync(FILE, 'utf8'))));
    const attesi: [string, string, string][] = [
      ['9p-tempel-1', '9P/Tempel 1', '9P/Tempel'],
      ['29p-schwassmann-wachmann-1', '29P/Schwassmann-Wachmann 1', '29P/Schwassmann-Wachmann'],
      ['81p-wild-2', '81P/Wild 2', '81P/Wild'],
      ['103p-hartley-2', '103P/Hartley 2', '103P/Hartley'],
    ];
    for (const [slug, nome, ufficiale] of attesi) {
      const x = c.perSlug(slug)!;
      expect([x.nome, x.nomeUfficiale], slug).toEqual([nome, ufficiale]);
      expect(x.alias, slug).toEqual(expect.arrayContaining([nome, ufficiale]));
    }
    expect([c.perSlug('1p-halley')!.nome, c.perSlug('1p-halley')!.nomeUfficiale]).toEqual(['1P/Halley', '1P/Halley']);
  });
});
