// Ricerca: normalizzazione, alias, prefisso di parola e sottostringa, raggruppamento (§ 4.3, § 11.6).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import type { CorpoCatalogo } from '../../src/data/catalogTypes';
import { cerca, creaIndice, dettaglioRicerca, iniziDiParola, normalizza, ordineVisivo, raggruppaRisultati } from '../../src/ui/cerca';
import { creaCatalogoFinto } from '../../src/ui/dev/catalogoFinto';
import { ordinaRighe } from '../../src/ui/vistaTestuale';

const catalogo = creaCatalogoFinto();
const indice = creaIndice(catalogo.corpi);
const primi = (q: string, n = 1) => cerca(indice, q).slice(0, n).map((r) => r.corpo.slug);

describe('normalizzazione (§ 11.6)', () => {
  it('minuscole, senza diacritici, senza ʻ ’ \' - / e spazi', () => {
    expect(normalizza('1I/ʻOumuamua')).toBe('1ioumuamua');
    expect(normalizza('67P/Churyumov-Gerasimenko')).toBe('67pchuryumovgerasimenko');
    expect(normalizza('Encèlado')).toBe('encelado');
    expect(normalizza("d'Arrest’s")).toBe('darrests');
    expect(normalizza('  C/1995 O1 (Hale-Bopp) ')).toBe('c1995o1halebopp');
  });

  it('okina e apostrofi in tutte le varianti: ‘ (U+2018), ʼ (U+02BC), ` e ´ come ʻ ’ \'', () => {
    for (const q of ['\u2018Oumuamua', '\u02bcOumuamua', '`Oumuamua', '\u00b4Oumuamua', "'Oumuamua", '\u02bbOumuamua', '\u2019Oumuamua']) {
      expect(normalizza(q), q).toBe('oumuamua');
      expect(primi(q), q).toEqual(['1i-oumuamua']);
    }
    expect(normalizza('1I/\u2018Oumuamua')).toBe('1ioumuamua');
  });

  it('trattini tipografici dei testi copiati come il trattino: \u2010 \u2011 \u2012 \u2013 \u2212 e trattino morbido', () => {
    const reale = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
    const indiceReale = creaIndice(reale.corpi);
    const casi: [string, string][] = [
      ['Hale\u2013Bopp', 'c1995-o1-hale-bopp'],
      ['Ikeya\u2013Seki', 'c1965-s1-ikeya-seki'],
      ['Swift\u2013Tuttle', '109p-swift-tuttle'],
      ['Churyumov\u2013Gerasimenko', '67p-churyumov-gerasimenko'],
      ['Hale\u2010Bopp', 'c1995-o1-hale-bopp'],
      ['Hale\u2011Bopp', 'c1995-o1-hale-bopp'],
      ['Hale\u2012Bopp', 'c1995-o1-hale-bopp'],
      ['Hale\u2212Bopp', 'c1995-o1-hale-bopp'],
      ['Hale\u00adBopp', 'c1995-o1-hale-bopp'],
      ['C/1965 S1\u2013A', 'c1965-s1-ikeya-seki'],
    ];
    for (const [q, slug] of casi) {
      expect(normalizza(q), q).toBe(normalizza(q.replace(/[\u2010-\u2013\u2212\u00ad]/gu, '-')));
      expect(cerca(indiceReale, q)[0]?.corpo.slug, q).toBe(slug);
    }
  });

  it('inizi di parola', () => {
    expect(iniziDiParola('9P/Tempel 1')).toEqual(['9ptempel1', 'tempel1', '1']);
  });
});

describe('ricerca', () => {
  it('nome italiano, nome ufficiale, numero, designazione', () => {
    expect(primi('marte')).toEqual(['marte']);
    expect(primi('Mars')).toEqual(['marte']);
    expect(primi('433')).toEqual(['eros']);
    expect(primi('433 eros')).toEqual(['eros']);
    expect(primi('C/2019 Q4')).toEqual(['2i-borisov']);
    expect(primi('oumuamua')).toEqual(['1i-oumuamua']);
    expect(primi('hale bopp')).toEqual(['c1995-o1-hale-bopp']);
    expect(primi('tempel 1')).toEqual(['9p-tempel-1']);
    expect(primi('Ixion')).toEqual(['issione']);
  });

  it('omonimi: Europa (luna) prima di 52 Europa', () => {
    expect(primi('europa', 2)).toEqual(['europa', '52-europa']);
    expect(primi('52')).toEqual(['52-europa']);
  });

  it('prima il prefisso di parola, poi la sottostringa', () => {
    const r = cerca(indice, 'ar');
    const ranghi = r.map((x) => x.rango);
    expect([...ranghi].sort((a, b) => a - b)).toEqual(ranghi);
    const slug = r.map((x) => x.corpo.slug);
    expect(slug).toContain('ariel');
    expect(slug.indexOf('ariel')).toBeLessThan(slug.indexOf('marte') === -1 ? Infinity : slug.indexOf('marte'));
  });

  it('al massimo 8 risultati, raggruppati per categoria', () => {
    const r = cerca(indice, 'e');
    expect(r.length).toBe(8);
    const gruppi = raggruppaRisultati(r);
    const cat = gruppi.map((g) => g.categoria);
    expect(new Set(cat).size).toBe(cat.length);
    expect(gruppi.reduce((n, g) => n + g.risultati.length, 0)).toBe(8);
  });

  it('ordine di navigazione uguale a quello mostrato: gruppi contigui, primo risultato invariato', () => {
    for (const q of ['io', 'er', 'ar', 'ne', 'e']) {
      const r = cerca(indice, q);
      const o = ordineVisivo(r);
      expect(o.map((x) => x.corpo.slug), q).toEqual(raggruppaRisultati(r).flatMap((g) => g.risultati.map((x) => x.corpo.slug)));
      expect(o[0], q).toBe(r[0]);
      // Ogni categoria compare in un solo tratto contiguo.
      const cat = o.map((x) => x.corpo.categoria).filter((c, i, a) => i === 0 || c !== a[i - 1]);
      expect(new Set(cat).size, q).toBe(cat.length);
    }
  });

  it('dettaglio dei risultati: numero e nome ufficiale o designazione, senza ripetere il nome (§ 4.3, § 11.6)', () => {
    const reale = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
    const c = (slug: string) => reale.corpi.find((x) => x.slug === slug)!;
    const det = (slug: string) => dettaglioRicerca(c(slug), c(slug).primario ? c(c(slug).primario!) : undefined);
    expect(det('eros')).toBe('433 · A898 PA');
    expect(det('psyche')).toBe('16 · A852 FA');
    expect(det('ryugu')).toBe('162173 · 1999 JU3');
    expect(det('cerere')).toBe('1 · Ceres');
    // Il confronto è per parole intere: "Pluto" non è in "Plutone", "Saturn" non è in "Saturno".
    expect(det('plutone')).toBe('134340 · Pluto');
    expect(det('saturno')).toBe('Saturn');
    // Il nome contiene già numero e nome ufficiale: resta la designazione provvisoria (non "Europa", già nel nome).
    expect(det('52-europa')).toBe('A858 CA');
    // Il nome ufficiale delle comete numerate è il nome senza il numerale d'uso: già nel nome, nessun testo.
    for (const slug of ['9p-tempel-1', '29p-schwassmann-wachmann-1', '81p-wild-2', '103p-hartley-2']) expect(det(slug), slug).toBeNull();
    expect(det('1p-halley')).toBeNull();
    expect(det('c1995-o1-hale-bopp')).toBeNull();
    expect(det('marte')).toBe('Mars');
    expect(det('io')).toBe('luna di Giove');
    expect(det('luna')).toBe('luna della Terra');
  });

  it('dettaglio dei risultati: il nome ufficiale contenuto nel nome come parola intera non si ripete (§ 11.6)', () => {
    const reale = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
    const base = reale.corpi.find((x) => x.slug === 'eros')!;
    const det = (campi: Partial<CorpoCatalogo>) => dettaglioRicerca({ ...base, ...campi }, undefined);
    // Omonimo con il numero nel nome (§ 4.3): non resta "Europa", ma la designazione.
    expect(det({ nome: '52 Europa', nomeUfficiale: 'Europa', numero: 52, designazione: 'A858 CA' })).toBe('A858 CA');
    // Cometa con il nome ufficiale senza numerale d'uso: già nel nome.
    expect(det({ nome: '9P/Tempel 1', nomeUfficiale: '9P/Tempel', numero: null, designazione: '9P' })).toBeNull();
    // Nome ufficiale che non è parola intera del nome: si mostra.
    expect(det({ nome: 'Plutone', nomeUfficiale: 'Pluto', numero: 134340, designazione: '1930 BM' })).toBe('134340 · Pluto');
    expect(det({ nome: '52 Europa', nomeUfficiale: 'Eur', numero: 52, designazione: 'A858 CA' })).toBe('Eur');
    // Senza nome ufficiale resta la designazione, a meno che il nome non la contenga.
    expect(det({ nome: '52 Europa', nomeUfficiale: null, numero: 52, designazione: 'A858 CA' })).toBe('A858 CA');
    expect(det({ nome: '2000 AB1', nomeUfficiale: null, numero: null, designazione: '2000 AB1' })).toBeNull();
  });

  it('nomi ufficiali MPC con i diacritici e designazione provvisoria di Plutone nel catalogo reale (§ 4.3)', () => {
    const reale = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
    const ix = creaIndice(reale.corpi);
    const c = (slug: string) => reale.corpi.find((x) => x.slug === slug)!;
    expect(c('mani').nomeUfficiale).toBe('Máni');
    expect(c('steins').nomeUfficiale).toBe('Šteins');
    expect(c('plutone').designazione).toBe('1930 BM');
    expect(cerca(ix, '1930 BM')[0]?.corpo.slug).toBe('plutone');
    for (const [q, slug] of [['Mani', 'mani'], ['Máni', 'mani'], ['Steins', 'steins'], ['Šteins', 'steins']] as const) {
      expect(cerca(ix, q)[0]?.corpo.slug, q).toBe(slug);
    }
  });

  it('a pari rango e categoria i numeri dei nomi sono numeri: 1P, 12P, 19P, 103P, 109P, come nella vista testuale (§ 11.6, § 11.9)', () => {
    const reale = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
    const ix = creaIndice(reale.corpi);
    const periodiche = cerca(ix, '1', reale.corpi.length).filter((r) => r.rango === 1 && r.corpo.categoria === 'cometa');
    expect(periodiche.map((r) => r.corpo.nome.split('/')[0])).toEqual(['1P', '12P', '19P', '103P', '109P']);
    // Stesso ordine della colonna Corpo della vista testuale.
    const righe = periodiche.map((r) => ({
      corpo: r.corpo,
      distanzaSoleKm: null,
      distanzaTerraKm: null,
      lon: null,
      lat: null,
      livello: null,
      erroreSoleKm: null,
      erroreTerraKm: null,
      inCaricamento: false,
    }));
    expect(ordinaRighe(righe, 'corpo', 'ascending').map((r) => r.corpo.nome)).toEqual(periodiche.map((r) => r.corpo.nome));
    // Con il limite di 8 risultati compaiono le comete di numero minore (1P, 12P), non 103P e 109P.
    expect(cerca(ix, '1').filter((r) => r.corpo.categoria === 'cometa').map((r) => r.corpo.nome)).toEqual(['1P/Halley', '12P/Pons-Brooks']);
  });

  it('nessun risultato e query vuota', () => {
    expect(cerca(indice, 'xyz')).toEqual([]);
    expect(cerca(indice, '  ')).toEqual([]);
  });
});
