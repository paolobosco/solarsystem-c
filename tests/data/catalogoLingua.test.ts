// Catalogo nella lingua dell'interfaccia (RNF8): inglese con nomi, alias e testi delle fonti dal dizionario; italiano con
// nomi e testi invariati e nomi inglesi come alias; ricerca per nome italiano e inglese in entrambe le lingue.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import { DIZIONARIO_EN, localizzaCatalogo } from '../../src/data/catalogoLingua';
import type { CorpoCatalogo } from '../../src/data/catalogTypes';
import { cerca, creaIndice } from '../../src/ui/cerca';

const base = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf8')));
const inglese = localizzaCatalogo(base, 'en');
const italiano = localizzaCatalogo(base, 'it');
const per = (c: typeof base, slug: string): CorpoCatalogo => c.corpi.find((x) => x.slug === slug)!;

describe('catalogo in inglese', () => {
  it('nome mostrato dal dizionario, per slug', () => {
    expect(per(inglese, 'luna').nome).toBe('Moon');
    expect(per(inglese, 'giove').nome).toBe('Jupiter');
    expect(per(inglese, 'sole').nome).toBe('Sun');
    expect(per(inglese, 'plutone').nome).toBe('Pluto');
    // I corpi senza nome inglese diverso mantengono il nome del catalogo.
    expect(per(inglese, 'c1995-o1-hale-bopp').nome).toBe(per(base, 'c1995-o1-hale-bopp').nome);
  });

  it('il nome italiano e gli alias aggiuntivi sono alias di ricerca', () => {
    expect(per(inglese, 'luna').alias).toEqual(expect.arrayContaining(['Moon', 'Luna']));
    expect(per(inglese, 'giove').alias).toEqual(expect.arrayContaining(['Jupiter', 'Giove']));
    expect(per(inglese, 'c1680-v1').alias).toEqual(expect.arrayContaining(['Great Comet of 1680', 'Grande cometa del 1680']));
    for (const c of inglese.corpi) expect(new Set(c.alias).size, c.slug).toBe(c.alias.length);
  });

  it('testi delle fonti tradotti dove il dizionario li copre, identificatori invariati', () => {
    const fonte = per(base, 'terra').fisica.raggi_km!.fonte;
    expect(DIZIONARIO_EN.stringhe[fonte]).toBeDefined();
    expect(per(inglese, 'terra').fisica.raggi_km!.fonte).toBe(DIZIONARIO_EN.stringhe[fonte]);
    const t = per(base, 'terra').texture!;
    expect(per(inglese, 'terra').texture!.licenza).toBe(DIZIONARIO_EN.stringhe[t.licenza] ?? t.licenza);
    for (const c of inglese.corpi) {
      const b = per(base, c.slug);
      expect([c.slug, c.categoria, c.ssid, c.primario, c.numero, c.designazione]).toEqual([b.slug, b.categoria, b.ssid, b.primario, b.numero, b.designazione]);
      expect(c.effemeridi.modello).toBe(b.effemeridi.modello);
      // Il tipo degli elementi degli anelli è un identificatore letto dal rendering.
      expect(c.anelli?.elementi.map((e) => e.tipo)).toEqual(b.anelli?.elementi.map((e) => e.tipo));
    }
  });

  it('descrizioni delle sorgenti delle effemeridi tradotte', () => {
    let tradotte = 0;
    for (const c of base.corpi) {
      const e = c.effemeridi;
      if (e.modello !== 'satellite' && e.modello !== 'piccolo-corpo') continue;
      const ei = per(inglese, c.slug).effemeridi;
      if (ei.modello !== 'satellite' && ei.modello !== 'piccolo-corpo') throw new Error('modello cambiato');
      e.fonti.forEach((f, i) => {
        const atteso = DIZIONARIO_EN.stringhe[f.descrizione] ?? f.descrizione;
        expect(ei.fonti[i]!.descrizione).toBe(atteso);
        if (atteso !== f.descrizione) tradotte++;
      });
    }
    expect(tradotte).toBeGreaterThan(10);
  });

  it('il catalogo di partenza non cambia', () => {
    expect(per(base, 'luna').nome).toBe('Luna');
  });
});

describe('catalogo in italiano', () => {
  it('nomi e testi invariati', () => {
    for (const c of italiano.corpi) {
      const b = per(base, c.slug);
      expect(c.nome).toBe(b.nome);
      expect(c.fisica).toEqual(b.fisica);
      expect(c.texture).toEqual(b.texture);
      expect(c.soluzione).toEqual(b.soluzione);
    }
  });

  it('nomi inglesi e alias inglesi tra gli alias', () => {
    expect(per(italiano, 'luna').alias).toContain('Moon');
    expect(per(italiano, 'c1680-v1').alias).toEqual(expect.arrayContaining(['Grande cometa del 1680', 'Great Comet of 1680']));
    expect(per(italiano, 'disnomia').alias).toContain('Dysnomia');
  });
});

describe('ricerca in entrambe le lingue', () => {
  const primo = (c: typeof base, q: string): string | undefined => cerca(creaIndice(c.corpi), q)[0]?.corpo.slug;

  it('nome italiano e inglese trovano lo stesso corpo con il catalogo italiano e con quello inglese', () => {
    for (const c of [italiano, inglese]) {
      expect(primo(c, 'Luna'), 'Luna').toBe('luna');
      expect(primo(c, 'Moon'), 'Moon').toBe('luna');
      expect(primo(c, 'Giove'), 'Giove').toBe('giove');
      expect(primo(c, 'Jupiter'), 'Jupiter').toBe('giove');
      expect(primo(c, 'Dysnomia'), 'Dysnomia').toBe('disnomia');
      expect(primo(c, 'Disnomia'), 'Disnomia').toBe('disnomia');
      expect(primo(c, 'Great Comet of 1680'), 'Great Comet').toBe('c1680-v1');
      expect(primo(c, 'Grande cometa del 1680'), 'Grande cometa').toBe('c1680-v1');
    }
  });
});
