// Traduzione inglese (src/ui/testi.en.ts, src/data/catalogo.en.json): stessa forma dei testi italiani, nessun testo italiano
// residuo, dizionario del catalogo allineato ai dati pubblicati. La struttura di T è verificata dal compilatore (FormaTesti).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as en from '../../src/ui/testi.en';
import * as it_ from '../../src/ui/testi.it';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const leggi = (f: string): string => readFileSync(join(RADICE, f), 'utf8');

/** Parole italiane non ambigue in inglese. */
const ITALIANO = /\b(il|lo|gli|della|delle|dello|degli|dei|nel|nella|nei|dal|dalla|alla|alle|sono|con|una|uno|tra|fra|che|anche|nessun|nessuna|scheda|corpo|corpi)\b/i;

function foglie(x: unknown, percorso = ''): [string, string][] {
  if (typeof x === 'string') return [[percorso, x]];
  if (typeof x === 'function') return [];
  if (Array.isArray(x)) return x.flatMap((v, i) => foglie(v, `${percorso}[${i}]`));
  if (x !== null && typeof x === 'object') return Object.entries(x).flatMap(([k, v]) => foglie(v, `${percorso}.${k}`));
  return [];
}

describe('testi inglesi', () => {
  it('stessi esportati dei testi italiani (tranne gli aiuti grammaticali italiani)', () => {
    const attesi = Object.keys(it_).filter((k) => !['diNome', 'aNome', 'suNome', 'alData', 'dalData', 'dalAnno', 'alAnno', 'partiTastiCon', 'testoDaParti'].includes(k));
    for (const k of attesi) expect(Object.keys(en), k).toContain(k);
  });

  it('nessun U+2014 e nessuna parola italiana nei testi statici', () => {
    const tutte = [
      ...foglie(en.T),
      ...foglie(en.UNITA),
      ...foglie(en.MESI),
      ...foglie(en.GIORNI_SETTIMANA),
      ...foglie(en.NOMI_CATEGORIE),
      ...foglie(en.NOMI_CATEGORIE_PLURALE),
      ...foglie(en.NOMI_CATEGORIE_IN_FRASE),
      ...foglie(en.NOMI_CATEGORIE_PLURALE_IN_FRASE),
      ...foglie(en.NOMI_LIVELLI),
      ...foglie(en.NOMI_UNITA_PASSO),
      ...foglie(en.NOMI_LIVELLI_VISIVI),
      ...foglie(en.NOMI_PRESET),
      ...foglie(en.VELOCITA_ETICHETTE),
      ...foglie(en.VOCI_ACCURATEZZA),
      ...foglie(en.FONTI_METODI_SEZIONI),
      ...foglie(en.STRUMENTI),
    ];
    const male = tutte.filter(([, s]) => s.includes('—') || ITALIANO.test(s)).map(([p, s]) => `${p}: ${s.slice(0, 80)}`);
    expect(male).toEqual([]);
  });

  it('stesso numero di sezioni, voci e riferimenti bibliografici', () => {
    expect(en.FONTI_METODI_SEZIONI.map((s) => s.paragrafi.length)).toEqual(it_.FONTI_METODI_SEZIONI.map((s) => s.paragrafi.length));
    expect(en.RIFERIMENTI.length).toBe(it_.RIFERIMENTI.length);
    expect(en.STRUMENTI.length).toBe(it_.STRUMENTI.length);
    expect(en.VELOCITA_ETICHETTE.length).toBe(it_.VELOCITA_ETICHETTE.length);
  });

  it('le frasi con parametri si compongono (a campione)', () => {
    expect(en.T.trova.lunaDi('Jupiter')).toBe('moon of Jupiter');
    expect(en.T.scheda.velocitaRispetto('Sun')).toBe('Speed relative to the Sun');
    expect(en.T.mappa.etichetta('view 2 au wide', 'Moon')).toBe('3D map: view 2 au wide, focus on the Moon');
    expect(en.T.stagioni.dopo('Northern spring', 1, 'equinozio')).toBe('Northern spring, 1 day after the equinox');
    expect(en.T.stagioni.dopo('Northern spring', 3, 'solstizio')).toBe('Northern spring, 3 days after the solstice');
    expect(en.T.console.indietro('ora')).toBe('Back one hour');
    expect(en.testoTasti(en.T.scorciatoie.voci.mappa[2]![0])).toBe('+, −, Page Up and Page Down');
  });
});

describe('scelta della lingua', () => {
  function sorgenti(dir: string): string[] {
    return readdirSync(join(RADICE, dir)).flatMap((n) => {
      const rel = `${dir}/${n}`;
      return statSync(join(RADICE, rel)).isDirectory() ? sorgenti(rel) : rel.endsWith('.ts') ? [rel] : [];
    });
  }

  it('solo testi.ts importa testi.it e testi.en (testi.en riusa gli aiuti comuni di testi.it)', () => {
    const fuori = sorgenti('src').filter((f) => {
      if (f === 'src/ui/testi.ts' || f === 'src/ui/testi.en.ts') return false;
      return /from '[^']*\/testi\.(it|en)'/.test(leggi(f));
    });
    expect(fuori).toEqual([]);
  });

  it('nessun import dinamico di moduli di src: il bundle è un solo file (§ 5.7)', () => {
    for (const f of sorgenti('src')) expect(/import\(\s*['"`]\./.test(leggi(f)), f).toBe(false);
  });
});

describe('dizionario del catalogo', () => {
  const catalogo = JSON.parse(leggi('public/data/v1/catalog.json')) as { corpi: Record<string, unknown>[] };
  const dizionario = JSON.parse(leggi('src/data/catalogo.en.json')) as {
    nomi: Record<string, string>;
    aliasAggiuntivi: Record<string, string[]>;
    stringhe: Record<string, string>;
  };

  const percorsi = [
    ['fisica', 'albedo', 'fonte'],
    ['fisica', 'gm_km3s2', 'fonte'],
    ['fisica', 'inclinazioneAssiale_gradi', 'fonte'],
    ['fisica', 'raggi_km', 'fonte'],
    ['fisica', 'rotazione', 'fonte'],
    ['texture', 'fonte'],
    ['texture', 'licenza'],
    ['soluzione', 'id'],
  ];

  function testiDelCatalogo(): Set<string> {
    const s = new Set<string>();
    for (const c of catalogo.corpi) {
      for (const p of percorsi) {
        let v: unknown = c;
        for (const k of p) v = v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
        if (typeof v === 'string') s.add(v);
      }
      const fonti = ((c.effemeridi as { fonti?: { descrizione: string }[] } | undefined)?.fonti ?? []).map((f) => f.descrizione);
      fonti.forEach((d) => s.add(d));
      const elementi = (c.anelli as { elementi?: { tipo: string }[] } | null | undefined)?.elementi ?? [];
      elementi.forEach((e) => s.add(e.tipo));
    }
    return s;
  }

  it('contiene tutti e solo i testi del catalogo da tradurre', () => {
    const dati = testiDelCatalogo();
    const chiavi = new Set(Object.keys(dizionario.stringhe));
    expect([...dati].filter((s) => !chiavi.has(s))).toEqual([]);
    expect([...chiavi].filter((s) => !dati.has(s))).toEqual([]);
  });

  it('nessun testo inglese contiene parole italiane o U+2014', () => {
    const male = Object.entries(dizionario.stringhe).filter(([, v]) => v.includes('—') || ITALIANO.test(v) || /\b(Orco|Disnomia|Actea)\b/.test(v));
    expect(male.map(([k]) => k)).toEqual([]);
  });

  it('nessun mese né espressione italiana residua nei testi inglesi del catalogo', () => {
    const residui = Object.entries(dizionario.stringhe)
      .filter(([, v]) => /\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|ritroso|dallo|dalla)\b/i.test(v))
      .map(([, v]) => v.slice(0, 80));
    expect(residui).toEqual([]);
  });

  it('nomi e alias: corpi esistenti', () => {
    const slug = new Set(catalogo.corpi.map((c) => c.slug as string));
    for (const k of [...Object.keys(dizionario.nomi), ...Object.keys(dizionario.aliasAggiuntivi)]) expect(slug.has(k), k).toBe(true);
    expect(Object.values(dizionario.nomi).every((n) => n.length > 0)).toBe(true);
  });
});
