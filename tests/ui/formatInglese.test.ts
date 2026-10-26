// Formattazione numerica e delle date per lingua (§ 11.13, § 11.14 di docs/PROGETTO.md): inglese con punto decimale,
// virgola tra i gruppi, "1 January", "10000 BC" e "AD 800"; italiano invariato.

import { describe, expect, it } from 'vitest';
import { UA_KM } from '../../src/ephem/constants';
import { MENO, SPAZIO_NB, SPAZIO_SOTTILE, SEPARATORI_PER_LINGUA, creaFormati } from '../../src/ui/format';
import { partiConNumeri } from '../../src/ui/nodi';
import { localizzaValore, valoriValidazione } from '../../src/ui/valoriValidazione';

const en = creaFormati('en');
const fi = creaFormati('it');
const NB = SPAZIO_NB;
const S = SPAZIO_SOTTILE;

describe('numeri in inglese', () => {
  it('punto decimale e virgola tra i gruppi da 4 cifre in su', () => {
    expect(en.formatNumero(999)).toBe('999');
    expect(en.formatNumero(1000)).toBe('1,000');
    expect(en.formatNumero(1234.5, 1)).toBe('1,234.5');
    expect(en.formatNumero(149_597_870.7, 1)).toBe('149,597,870.7');
    expect(en.formatNumero(0.25, 2)).toBe('0.25');
    expect(en.formatNumero(-12_345)).toBe(`${MENO}12,345`);
    expect(en.formatNumero(1234.5, 1, { raggruppa: false })).toBe('1234.5');
    expect(en.formatIntero(2026.4)).toBe('2,026');
  });

  it('cifre significative, periodi, JD e ΔT con il punto decimale', () => {
    expect(en.formatCifre(1.523_67, 4)).toBe('1.524');
    expect(en.formatCifre(384_399, 3)).toBe('384,000');
    expect(en.formatJd(2_461_332.404_17)).toBe('2,461,332.40417');
    expect(en.formatPeriodo(87.969_26)).toBe(`87.9693${NB}days`);
    expect(en.formatPeriodo(4332.59)).toBe(`11.862${NB}years`);
    expect(en.formatDeltaT(20_371.848, 518)).toEqual({ valore: '20,372', sigma: `518${NB}s`, sigmaOre: '0.14' });
    expect(en.formatTempoLuce(499)).toBe(`8${NB}min 19${NB}s`);
  });

  it('distanze e velocità: unità "au" e "million km"', () => {
    expect(testoMisuraEn(en.misuraDistanza(34.2 * UA_KM, { cifre: 3 }))).toBe(`34.2${NB}au`);
    expect(en.formatAmpiezza(1000)).toBe(`1,000${NB}km`);
    expect(en.formatAmpiezza(1.2e6)).toBe(`1.2${NB}million km`);
    expect(en.formatAmpiezza(4 * UA_KM)).toBe(`4${NB}au`);
    expect(en.misuraVelocita(29.78, 0.01)).toEqual({ valore: '29.78', unita: 'km/s', approssimato: false });
  });

  it('gradi e angoli', () => {
    expect(en.formatGradi((7.005 * Math.PI) / 180)).toBe('7.005°');
    expect(en.formatErroreAngolare((2 * Math.PI) / 180 / 3600)).toBe('2.0″');
    expect(en.formatGradiBreve(3.21)).toBe('3.2');
  });

  it('valori non finiti come in italiano, con le parole inglesi', () => {
    expect(en.formatNumero(Number.NaN)).toBe('n/a');
    expect(en.formatNumero(Number.NEGATIVE_INFINITY)).toBe(`${MENO}∞`);
  });
});

function testoMisuraEn(m: { valore: string; unita: string }): string {
  return `${m.valore}${NB}${m.unita}`;
}

describe('date in inglese', () => {
  it('giorno prima del mese, nessun "1°"', () => {
    expect(en.formatData({ anno: 2026, mese: 10, giorno: 19 })).toBe('19 October 2026');
    expect(en.formatData({ anno: 2026, mese: 1, giorno: 1 })).toBe('1 January 2026');
    expect(en.formatGiorno(1)).toBe('1');
    expect(fi.formatGiorno(1)).toBe('1°');
    expect(en.formatDataBreve({ mese: 10, giorno: 18 })).toBe('18 Oct');
  });

  it('era: "10000 BC" dopo l\'anno, "AD 800" prima dell\'anno, AD solo fino al 1000 o sempre', () => {
    expect(en.formatAnno(-9999)).toBe(`10000${NB}BC`);
    expect(en.formatAnno(0)).toBe(`1${NB}BC`);
    expect(en.formatAnno(800)).toBe(`AD${NB}800`);
    expect(en.formatAnno(1000)).toBe(`AD${NB}1000`);
    expect(en.formatAnno(1001)).toBe('1001');
    expect(en.formatAnno(2026)).toBe('2026');
    expect(en.formatAnno(2026, 'sempre')).toBe(`AD${NB}2026`);
    expect(en.formatAnno(1, 'sempre')).toBe(`AD${NB}1`);
    expect(fi.formatAnno(800)).toBe(`800${NB}d.C.`);
    expect(fi.formatAnno(-9999)).toBe(`10000${NB}a.C.`);
  });

  it('data con era e con ora', () => {
    expect(en.formatData({ anno: -9999, mese: 1, giorno: 1 })).toBe(`1 January 10000${NB}BC`);
    expect(en.formatData({ anno: 800, mese: 3, giorno: 8 })).toBe(`8 March AD${NB}800`);
    expect(fi.formatData({ anno: -9999, mese: 1, giorno: 1 })).toBe(`1° gennaio 10000${NB}a.C.`);
    const d = { anno: 2026, mese: 10, giorno: 18, ora: 21, minuto: 45, secondo: 0, calendario: 'gregoriano' as const };
    expect(en.formatDataOra(d, 'UT')).toBe('18 October 2026, 21:45 UT');
    expect(fi.formatDataOra(d, 'UT')).toBe('18 ottobre 2026, 21:45 UT');
  });

  it('offset e anni mai raggruppati', () => {
    expect(en.formatOffset(-210)).toBe(`UTC${MENO}3:30`);
    expect(en.formatAnno(10_000 - 1)).toBe('9999');
  });
});

describe('numeri in italiano invariati', () => {
  it('virgola decimale e U+2009', () => {
    expect(fi.formatNumero(1234.5, 1)).toBe(`1${S}234,5`);
    expect(fi.formatJd(2_461_332.404_17)).toBe(`2${S}461${S}332,40417`);
    expect(SEPARATORI_PER_LINGUA.it).toEqual({ decimale: ',', migliaia: S });
    expect(SEPARATORI_PER_LINGUA.en).toEqual({ decimale: '.', migliaia: ',' });
  });
});

describe('numeri raggruppati nei testi fissi', () => {
  it('in italiano il gruppo con U+2009 è un solo token', () => {
    expect(partiConNumeri(`obliquità di 84${S}381,448″`)).toEqual(['obliquità di ', `84${S}381,448`, '″']);
  });
});

describe('valori di accuratezza in inglese', () => {
  it('punto decimale, virgola tra i gruppi, nomi propri inglesi', () => {
    expect(localizzaValore(`ΔT(−720) = 20${S}371,848${NB}s; σ(2000) = 0,114${NB}s`, 'en')).toBe(`ΔT(−720) = 20,371.848${NB}s; σ(2000) = 0.114${NB}s`);
    expect(localizzaValore('Mercurio 0,61″; Giove 1,52″', 'en')).toBe('Mercury 0.61″; Jupiter 1.52″');
    expect(localizzaValore('1° (Imalia, Febe, Nereide)', 'en')).toBe('1° (Himalia, Phoebe, Nereid)');
    expect(localizzaValore('0,31° (Fobos)', 'it')).toBe('0,31° (Fobos)');
  });

  it('la data della validazione è per esteso', () => {
    expect(valoriValidazione('it').dataValidazione).toBe('19/10/2026');
    expect(valoriValidazione('en').dataValidazione).toBe('19 October 2026');
    const voci = valoriValidazione('en').voci;
    expect(voci.length).toBe(valoriValidazione('it').voci.length);
    expect(voci.every((v) => !(v.valore ?? '').includes(S) && !v.soglia.includes(S))).toBe(true);
  });
});
