// Tipografia dei testi visibili (§ 11.13, § 11.14 di docs/PROGETTO.md): spazio non separabile tra numero e % o simbolo
// dell'unità (BIPM, SI 9ª ed., § 5.4.3 e § 5.4.7), virgolette caporali, frasi complete; stesse regole nei documenti.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONTI_METODI_SEZIONI, T, VELOCITA_ETICHETTE, VOCI_ACCURATEZZA } from '../../src/ui/testi.it';
import { VALORI_VALIDAZIONE } from '../../src/ui/valoriValidazione';
import { partiConNumeri } from '../../src/ui/nodi';

const RADICE = new URL('../../', import.meta.url).pathname;

/** Stringhe foglia di un oggetto di testi (le funzioni sono escluse). */
function foglie(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const v of x) foglie(v, out);
  else if (x !== null && typeof x === 'object') for (const v of Object.values(x)) foglie(v, out);
  return out;
}

const VISIBILI = [
  ...foglie(T),
  ...FONTI_METODI_SEZIONI.flatMap((s) => [s.titolo, ...s.paragrafi]),
  ...foglie(VOCI_ACCURATEZZA),
  ...VALORI_VALIDAZIONE.voci.flatMap((v) => [v.valore ?? '', v.soglia]),
];

describe('tipografia dei testi visibili', () => {
  it('spazio non separabile tra numero e simbolo %', () => {
    const errati = VISIBILI.filter((s) => /\d[ ]?%/.test(s));
    expect(errati).toEqual([]);
  });

  it("spazio non separabile tra numero e simbolo dell'unità, nessuno spazio prima di ° ′ ″", () => {
    const conModelli = [
      ...VISIBILI,
      ...foglie(VELOCITA_ETICHETTE),
      T.console.oraIncerta('28,6', '15'),
      T.console.deltaTValore('121,8', '28,6 h'),
    ];
    const errati = conModelli.filter((s) => /\d[ \u2009](?:s|ms|min|h|d|km|m|UA|au|K)(?![\p{L}\p{N}])/u.test(s));
    expect(errati).toEqual([]);
    expect(conModelli.filter((s) => /\d[ \u00a0\u2009][°′″]/u.test(s))).toEqual([]);
  });

  it('testi fissi: ogni U+2009 è dentro un numero raggruppato, reso senza a capo (§ 11.13)', () => {
    const testi = [
      ...FONTI_METODI_SEZIONI.flatMap((s) => s.paragrafi),
      ...VALORI_VALIDAZIONE.voci.flatMap((v) => [v.valore ?? '', v.soglia]),
      ...Object.values(VOCI_ACCURATEZZA).map((v) => v.grandezza),
    ];
    const fuori = testi.flatMap((t) => partiConNumeri(t).filter((p, i) => i % 2 === 0 && p.includes('\u2009')).map((p) => `${t.slice(0, 40)}…: ${p}`));
    expect(fuori).toEqual([]);
    expect(partiConNumeri("l'obliquità di 84\u2009381,448″, come")).toEqual(["l'obliquità di ", '84\u2009381,448', '″, come']);
    expect(partiConNumeri('ΔT(−720) = 20\u2009371,848 s; σ = 103\u2009006 s')).toEqual(['ΔT(−720) = ', '20\u2009371,848', ' s; σ = ', '103\u2009006', ' s']);
  });

  it('virgolette caporali, nessuna virgoletta diritta', () => {
    expect(VISIBILI.filter((s) => s.includes('"'))).toEqual([]);
  });

  it('frasi complete in "Fonti e metodi"', () => {
    const orientamento = FONTI_METODI_SEZIONI.find((s) => s.titolo === 'Orientamento e rotazione')!.paragrafi.join(' ');
    expect(orientamento).toContain("Fuori dall'intervallo 1600-2121");
    expect(orientamento).not.toContain('Fuori da 1600');
  });

  it('eccezione di C/1680 V1 descritta con la causa nei documenti', () => {
    for (const f of ['README.md', 'docs/PROGETTO.md']) {
      const testo = readFileSync(join(RADICE, f), 'utf8');
      expect(testo, f).not.toContain('oltre il passo minimo');
      expect(testo, f).toContain('il passo minimo di 1/64 d non segue il passaggio al perielio');
    }
  });
});
