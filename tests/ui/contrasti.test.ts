// Criterio A11: contrasti ricalcolati con la formula WCAG 2.2 (luminanza relativa sRGB) dai token di
// src/ui/tokens.css e dai colori disegnati nella scena e nei simboli (src/render/costanti.ts, unica sorgente);
// tinta HSL dei token verdi e dei colori verdi della scena tra 150° e 160° (§ 11.1).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CategoriaCorpo } from '../../src/data/catalogTypes';
import {
  COLORE_ANELLI_DISTANZA,
  COLORE_ASSI,
  COLORE_CATEGORIA,
  COLORE_ECLITTICA_DATA,
  COLORE_ETICHETTE_ANELLI,
  COLORE_GRIGLIA,
  COLORE_SELEZIONE,
  COLORE_SPAZIO,
  COLORE_TESTO_ETICHETTE,
} from '../../src/render/costanti';

type Rgb = [number, number, number];

const css = readFileSync(new URL('../../src/ui/tokens.css', import.meta.url), 'utf8');

function blocco(selettore: RegExp): string {
  const m = selettore.exec(css);
  if (!m) throw new Error(`Blocco assente: ${selettore}`);
  const inizio = css.indexOf('{', m.index) + 1;
  return css.slice(inizio, css.indexOf('}', inizio));
}

function token(testo: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of testo.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const base = token(blocco(/^:root\s*\{/m));
const altoContrasto = token(blocco(/prefers-contrast:\s*more\)\s*\{\s*:root/));

function hex(v: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) throw new Error(`Colore non esadecimale: ${v}`);
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colore(nome: string, t: Record<string, string> = base): Rgb {
  const v = t[nome];
  if (v === undefined) throw new Error(`Token assente: --${nome}`);
  const rif = /^var\(--([a-z0-9-]+)\)$/.exec(v);
  return rif ? colore(rif[1]!, base) : hex(v);
}

function lineare(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminanza([r, g, b]: Rgb): number {
  return 0.2126 * lineare(r) + 0.7152 * lineare(g) + 0.0722 * lineare(b);
}

function contrasto(a: Rgb, b: Rgb): number {
  const la = luminanza(a);
  const lb = luminanza(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composizione di un colore con opacità α su uno sfondo, arrotondata a 8 bit. */
function componi(c: Rgb, alfa: number, sfondo: Rgb): Rgb {
  return c.map((x, i) => Math.round(alfa * x + (1 - alfa) * sfondo[i]!)) as Rgb;
}

function tinta([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return Number.NaN;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const BIANCO: Rgb = [255, 255, 255];
const superfici = ['superficie', 'superficie-rialzata', 'superficie-incassata', 'spazio'];
const peggiore094 = componi(colore('superficie'), 0.94, BIANCO);
const peggiore090 = componi(colore('superficie'), 0.9, BIANCO);

describe('A11: contrasti dai token', () => {
  it('pannello a opacità 0,94 e 0,90 su bianco: #1B2823 e #24312C (§ 11.1)', () => {
    expect(peggiore094).toEqual(hex('#1b2823'));
    expect(peggiore090).toEqual(hex('#24312c'));
    const m = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)/.exec(base['superficie-pannello'] ?? '');
    expect(m).not.toBeNull();
    expect([Number(m![1]), Number(m![2]), Number(m![3])]).toEqual(colore('superficie'));
    expect(Number(m![4])).toBeGreaterThanOrEqual(0.9);
  });

  it('testo ≥ 4,5:1 su tutte le superfici e nei casi peggiori', () => {
    const testi = ['testo', 'testo-2', 'testo-3', 'giada-testo', 'ambra', 'corallo', 'cielo'];
    for (const t of testi) {
      for (const s of superfici) expect(contrasto(colore(t), colore(s)), `${t} su ${s}`).toBeGreaterThanOrEqual(4.5);
      expect(contrasto(colore(t), peggiore094), `${t} su pannello 0,94`).toBeGreaterThanOrEqual(4.5);
      expect(contrasto(colore(t), peggiore090), `${t} su pannello 0,90`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('testo sui colori pieni: --su-giada su --giada, --su-ambra su --ambra e --corallo', () => {
    expect(contrasto(colore('su-giada'), colore('giada'))).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(colore('su-ambra'), colore('ambra'))).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(colore('su-ambra'), colore('corallo'))).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(colore('su-giada'), colore('giada-testo'))).toBeGreaterThanOrEqual(4.5);
  });

  it('elementi non testuali ≥ 3:1: bordi dei controlli, focus, ago e cursori', () => {
    for (const s of [...superfici]) {
      expect(contrasto(colore('bordo-controllo'), colore(s)), `bordo su ${s}`).toBeGreaterThanOrEqual(3);
      expect(contrasto(colore('fuoco'), colore(s)), `focus su ${s}`).toBeGreaterThanOrEqual(3);
      expect(contrasto(colore('giada'), colore(s)), `giada su ${s}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrasto(colore('bordo-controllo'), peggiore094)).toBeGreaterThanOrEqual(3);
    expect(contrasto(colore('bordo-controllo'), peggiore090)).toBeGreaterThanOrEqual(3);
  });

  it('il focus su --giada ha contrasto basso: offset obbligatorio di 2 px (§ 11.1)', () => {
    expect(contrasto(colore('fuoco'), colore('giada'))).toBeCloseTo(1.52, 1);
    const stile = readFileSync(new URL('../../src/ui/stile.css', import.meta.url), 'utf8');
    expect(stile).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--fuoco\);\s*outline-offset:\s*2px;/);
  });

  it('valori della tabella del § 11.1 entro 0,05', () => {
    const attesi: [string, string | Rgb, number][] = [
      ['testo', 'superficie', 15.56],
      ['testo', 'superficie-rialzata', 13.53],
      ['testo', 'spazio', 17.55],
      ['testo-2', 'superficie', 9.84],
      ['testo-3', 'superficie', 6.87],
      ['testo-3', 'superficie-rialzata', 5.97],
      ['giada-testo', 'superficie', 11.49],
      ['ambra', 'superficie', 10.15],
      ['corallo', 'superficie', 8.08],
      ['cielo', 'superficie', 9.91],
      ['bordo-controllo', 'superficie', 5.6],
      ['bordo-controllo', 'superficie-rialzata', 4.87],
      ['bordo-controllo', 'superficie-incassata', 6.0],
      ['fuoco', 'superficie', 14.77],
      ['testo-3', peggiore094, 5.87],
      ['bordo-controllo', peggiore090, 4.24],
    ];
    for (const [a, b, v] of attesi) {
      const sb = typeof b === 'string' ? colore(b) : b;
      expect(Math.abs(contrasto(colore(a), sb) - v), `${a} su ${String(b)}`).toBeLessThanOrEqual(0.05);
    }
  });

  it('contrasto elevato: --testo-2 uguale a --testo, bordi #7FC0A8 ≥ 3:1', () => {
    expect(altoContrasto['testo-2']).toBe('var(--testo)');
    expect(colore('bordo-controllo', altoContrasto)).toEqual(hex('#7fc0a8'));
    for (const s of superfici) expect(contrasto(hex('#7fc0a8'), colore(s))).toBeGreaterThanOrEqual(3);
  });

});

describe('A11: colori disegnati nella scena e nei simboli (src/render/costanti.ts)', () => {
  it('sfondo della scena uguale a --spazio, selezione uguale a --fuoco (§ 11.1)', () => {
    expect(hex(COLORE_SPAZIO)).toEqual(colore('spazio'));
    expect(hex(COLORE_SELEZIONE)).toEqual(colore('fuoco'));
  });

  it('simboli della scena ≥ 3:1 su --spazio e su --superficie (forma e colore, § 11.1)', () => {
    for (const [cat, c] of Object.entries(COLORE_CATEGORIA)) {
      expect(contrasto(hex(c), colore('spazio')), cat).toBeGreaterThanOrEqual(3);
      expect(contrasto(hex(c), colore('superficie')), cat).toBeGreaterThanOrEqual(3);
    }
  });

  it('testo ≥ 4,5:1 e linee ≥ 3:1 sullo sfondo della scena', () => {
    const spazio = hex(COLORE_SPAZIO);
    expect(contrasto(hex(COLORE_TESTO_ETICHETTE), spazio)).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(hex(COLORE_ETICHETTE_ANELLI), spazio)).toBeGreaterThanOrEqual(4.5);
    expect(contrasto(hex(COLORE_ANELLI_DISTANZA), spazio)).toBeGreaterThanOrEqual(3);
    expect(contrasto(hex(COLORE_ASSI), spazio)).toBeGreaterThanOrEqual(3);
    expect(contrasto(hex(COLORE_ECLITTICA_DATA), spazio)).toBeGreaterThanOrEqual(3);
  });

  it('valori del § 11.1 e del § 11.5.2 su --spazio entro 0,05', () => {
    const categorie: Record<CategoriaCorpo, number> = {
      sole: 16.53,
      pianeta: 17.86,
      'pianeta-nano': 8.45,
      luna: 8.91,
      asteroide: 8.12,
      centauro: 7.22,
      cometa: 12.6,
      tno: 7.22,
      interstellare: 13.97,
    };
    const attesi: [string, string, number][] = [
      ...Object.entries(categorie).map(([c, v]): [string, string, number] => [c, COLORE_CATEGORIA[c as CategoriaCorpo], v]),
      ['anelli di distanza', COLORE_ANELLI_DISTANZA, 3.5],
      ['etichette degli anelli', COLORE_ETICHETTE_ANELLI, 7.75],
      ['etichette dei corpi', COLORE_TESTO_ETICHETTE, 17.55],
    ];
    for (const [nome, c, v] of attesi) {
      expect(Math.abs(contrasto(hex(c), colore('spazio')) - v), nome).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('A11: colore di base verde', () => {
  it('tinta HSL dei token verdi e dei colori verdi della scena tra 150° e 160°', () => {
    const verdi = [
      'spazio',
      'superficie',
      'superficie-rialzata',
      'superficie-incassata',
      'linea',
      'bordo-controllo',
      'testo',
      'testo-2',
      'testo-3',
      'giada',
      'su-giada',
      'giada-testo',
    ];
    for (const v of verdi) {
      const h = tinta(colore(v));
      expect(h, `--${v}`).toBeGreaterThanOrEqual(150);
      expect(h, `--${v}`).toBeLessThanOrEqual(160);
    }
    const scena = { COLORE_ANELLI_DISTANZA, COLORE_ETICHETTE_ANELLI, COLORE_GRIGLIA };
    for (const [nome, c] of Object.entries(scena)) {
      expect(tinta(hex(c)), nome).toBeGreaterThanOrEqual(150);
      expect(tinta(hex(c)), nome).toBeLessThanOrEqual(160);
    }
    expect(tinta(hex('#7fc0a8'))).toBeGreaterThanOrEqual(150);
    expect(tinta(hex('#7fc0a8'))).toBeLessThanOrEqual(160);
  });
});
