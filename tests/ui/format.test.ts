// Formattazione numerica e delle date (§ 11.13, § 11.14 di docs/PROGETTO.md).

import { describe, expect, it } from 'vitest';
import { UA_KM } from '../../src/ephem/constants';
import {
  MENO,
  SPAZIO_NB,
  SPAZIO_SOTTILE,
  arrotondaCifre,
  cifreDaIncertezza,
  formatAmpiezza,
  formatAnno,
  formatAnnoAstronomico,
  formatCifre,
  formatData,
  formatDataOra,
  formatConIncertezza,
  formatDeltaT,
  formatErroreAngolare,
  formatGradi,
  formatJd,
  formatNumero,
  formatOffset,
  formatOra,
  formatPeriodo,
  formatTempoLuce,
  formatGradiConErrore,
  formatValoreFisico,
  misuraDistanza,
  misuraGM,
  misuraVelocita,
  testoMisura,
} from '../../src/ui/format';

const S = SPAZIO_SOTTILE;
const NB = SPAZIO_NB;
const RAD = Math.PI / 180;

describe('numeri', () => {
  it('virgola decimale e gruppi di tre cifre con U+2009 da 4 cifre in su', () => {
    expect(formatNumero(999)).toBe('999');
    expect(formatNumero(1000)).toBe(`1${S}000`);
    expect(formatNumero(1234.5, 1)).toBe(`1${S}234,5`);
    expect(formatNumero(149_597_870.7, 1)).toBe(`149${S}597${S}870,7`);
    expect(formatNumero(0.25, 2)).toBe('0,25');
  });

  it('segno meno U+2212, mai -0', () => {
    expect(formatNumero(-0.25, 2)).toBe(`${MENO}0,25`);
    expect(formatNumero(-12_345)).toBe(`${MENO}12${S}345`);
    expect(formatNumero(-0.0001, 2)).toBe('0,00');
    expect(formatNumero(-0)).toBe('0');
    expect(formatNumero(-12).includes('-')).toBe(false);
  });

  it('cifre significative anche nella parte intera', () => {
    expect(arrotondaCifre(384_399, 3)).toBe(384_000);
    expect(formatCifre(384_399, 3)).toBe(`384${S}000`);
    expect(formatCifre(1.523_67, 4)).toBe('1,524');
    expect(formatCifre(9.996, 3)).toBe('10,0');
    expect(formatCifre(0.000_123_4, 2)).toBe('0,00012');
  });

  it('valori non finiti', () => {
    expect(formatNumero(Number.NaN)).toBe('n.d.');
    expect(formatNumero(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatNumero(Number.NEGATIVE_INFINITY)).toBe(`${MENO}∞`);
  });

  it('cifre coerenti con l’incertezza', () => {
    expect(cifreDaIncertezza(34.2, 0.3)).toBe(3);
    expect(cifreDaIncertezza(1.000_02, 1e-5)).toBe(6);
    expect(cifreDaIncertezza(5, 10)).toBe(2);
    expect(cifreDaIncertezza(5, 0)).toBe(6);
  });
});

describe('distanze, velocità, tempi', () => {
  it('km sotto 0,01 UA, UA sopra; spazio non separabile prima dell’unità', () => {
    const luna = misuraDistanza(384_400);
    expect(luna).toEqual({ valore: `384${S}400`, unita: 'km', approssimato: false });
    expect(testoMisura(luna)).toBe(`384${S}400${NB}km`);
    expect(misuraDistanza(UA_KM).unita).toBe('UA');
    expect(misuraDistanza(UA_KM).valore).toBe('1,0000');
    expect(misuraDistanza(0.009 * UA_KM).unita).toBe('km');
  });

  it('valore approssimato con "≈" quando l’errore relativo supera 1e-3 (es. "≈ 34,2 UA")', () => {
    const m = misuraDistanza(34.2 * UA_KM, { erroreRelativo: 0.01 });
    expect(m.approssimato).toBe(true);
    expect(testoMisura(m)).toBe(`≈${NB}34,2${NB}UA`);
  });

  it('velocità e tempo luce', () => {
    expect(testoMisura(misuraVelocita(29.7859, null))).toBe(`29,79${NB}km/s`);
    expect(formatTempoLuce(1.282)).toBe(`1,28${NB}s`);
    expect(formatTempoLuce(499.0)).toBe(`8${NB}min 19${NB}s`);
    expect(formatTempoLuce(5 * 3600 + 31 * 60 + 10)).toBe(`5${NB}h 31${NB}min`);
    expect(formatTempoLuce(1e8)).toBe(`3,2${NB}anni`);
  });

  it('velocità e coordinate con le cifre dell’errore stimato (§ 11.13)', () => {
    // Terra: errore di circa 3 m/s, 4 cifre.
    expect(testoMisura(misuraVelocita(29.7859, 0.003))).toBe(`29,79${NB}km/s`);
    // Errore di alcuni km/s, come per Apophis nel 2120 (ε 34°).
    expect(testoMisura(misuraVelocita(24.272, 2.7))).toBe(`≈${NB}24${NB}km/s`);
    // Notte: errore dell'1,1 %, due cifre (Horizons 0,1434 km/s il 1° gennaio 2024).
    expect(testoMisura(misuraVelocita(0.1427, 0.0016))).toBe(`≈${NB}0,14${NB}km/s`);
    expect(formatGradiConErrore(123.51 * RAD, 1e-5)).toBe('123,51°');
    expect(formatGradiConErrore(123.51 * RAD, 0.003 * RAD)).toBe('123,51°');
    expect(formatGradiConErrore(123.51 * RAD, 0.05 * RAD)).toBe('123,5°');
    expect(formatGradiConErrore(123.51 * RAD, 0.2 * RAD)).toBe(`≈${NB}124°`);
    expect(formatGradiConErrore(-2.24 * RAD, 36 * RAD)).toBe(`≈${NB}${MENO}2°`);
  });

  it('GM dei corpi piccoli in m³/s², senza zeri iniziali da contare', () => {
    // Bennu, SBDB (Chesley et al. 2020): 4,8904·10⁻⁹ ± 0,0009·10⁻⁹ km³/s².
    expect(testoMisura(misuraGM(4.8904e-9, 9e-13, 7))).toBe(`4,89040 ± 0,00090${NB}m³/s²`);
    // Eros, SBDB (Yeomans et al. 2000): 4,463·10⁻⁴ ± 0,001·10⁻⁴ km³/s².
    expect(testoMisura(misuraGM(4.463e-4, 1e-7, 7))).toBe(`446${S}300 ± 100${NB}m³/s²`);
    expect(testoMisura(misuraGM(62.6284, 0.0009, 7))).toBe(`62,62840 ± 0,00090${NB}km³/s²`);
    expect(testoMisura(misuraGM(398600.4355, null, 7))).toBe(`398${S}600,4${NB}km³/s²`);
    for (const gm of [2.34e-9, 3e-8, 6.662e-7, 9.6e-5]) expect(misuraGM(gm, null, 7).valore).not.toMatch(/^0,0/);
  });

  it('GM con più di 7 cifre intere: parte intera della fonte, senza zeri di riempimento (§ 11.13)', () => {
    // DE441, GMS (Park et al. 2021): 132 712 440 041,279 km³/s².
    expect(misuraGM(132_712_440_041.279_42, null, 7).valore).toBe(`132${S}712${S}440${S}041`);
    // JUP365, GM 599: 126 686 531,9 km³/s².
    expect(misuraGM(126_686_531.900_370_4, null, 7).valore).toBe(`126${S}686${S}532`);
    // SAT441, GM 699: 37 931 206,2 km³/s².
    expect(misuraGM(37_931_206.234_361_67, null, 7).valore).toBe(`37${S}931${S}206`);
    // Urano e Nettuno, 7 cifre intere: invariati.
    expect(misuraGM(5_793_951.256, null, 7).valore).toBe(`5${S}793${S}951`);
    expect(misuraGM(6_835_099.97, null, 7).valore).toBe(`6${S}835${S}100`);
  });

  it('ampiezze compatte con singolare e plurale', () => {
    expect(formatAmpiezza(1.2e6)).toBe(`1,2${NB}milioni di km`);
    expect(formatAmpiezza(1e6)).toBe(`1${NB}milione di km`);
    expect(formatAmpiezza(3e7)).toBe(`30${NB}milioni di km`);
    expect(formatAmpiezza(4 * UA_KM)).toBe(`4${NB}UA`);
    expect(formatAmpiezza(2e5 * UA_KM)).toBe(`200${S}000${NB}UA`);
    expect(formatAmpiezza(2e5)).toBe(`200${S}000${NB}km`);
  });

  it('periodi', () => {
    expect(formatPeriodo(365.256)).toBe(`365,256${NB}giorni`);
    expect(formatPeriodo(4332.59)).toBe(`11,862${NB}anni`);
  });

  it('angoli ed errori angolari', () => {
    expect(formatGradi(7.004_98 * RAD, 3)).toBe('7,005°');
  });

  it('angoli ciclici in [0°, 360°) dopo l’arrotondamento: 359,97° a un decimale è 0,0°', () => {
    expect(formatGradi(359.97 * RAD, 1, true)).toBe('0,0°');
    expect(formatGradi(359.97 * RAD, 0, true)).toBe('0°');
    expect(formatGradi(359.97 * RAD, 2, true)).toBe('359,97°');
    expect(formatGradi(-0.01 * RAD, 1, true)).toBe('0,0°');
    expect(formatGradi(-10 * RAD, 1, true)).toBe('350,0°');
    expect(formatGradi(370.25 * RAD, 2, true)).toBe('10,25°');
    expect(formatGradiConErrore(359.97 * RAD, 1e-3, 2, true)).toBe('0,0°');
    expect(formatGradiConErrore(359.996 * RAD, 1e-5, 2, true)).toBe('0,00°');
    expect(formatGradiConErrore(359.7 * RAD, 0.01, 2, true)).toBe(`≈${NB}0°`);
    // Senza `ciclico` (inclinazione, latitudine) il valore resta com'è.
    expect(formatGradi(-5 * RAD, 1)).toBe(`${MENO}5,0°`);
    expect(formatErroreAngolare((2 / 3600) * RAD)).toBe('2,0″');
    expect(formatErroreAngolare((30 / 60) * RAD)).toBe('30′');
    expect(formatErroreAngolare(3.24 * RAD)).toBe('3,2°');
    expect(formatErroreAngolare(45 * RAD)).toBe('45°');
  });
});

describe('date e anni', () => {
  it('anni mai raggruppati; a.C. sempre; d.C. solo fino all’anno 1000 nella data principale', () => {
    expect(formatAnno(-9999)).toBe(`10000${NB}a.C.`);
    expect(formatAnno(0)).toBe(`1${NB}a.C.`);
    expect(formatAnno(1)).toBe(`1${NB}d.C.`);
    expect(formatAnno(1000)).toBe(`1000${NB}d.C.`);
    expect(formatAnno(1001)).toBe('1001');
    expect(formatAnno(2026)).toBe('2026');
    expect(formatAnno(2026, 'sempre')).toBe(`2026${NB}d.C.`);
    expect(formatAnnoAstronomico(-9999)).toBe(`${MENO}9999`);
    expect(formatAnnoAstronomico(2026)).toBe('+2026');
  });

  it('date con mese per esteso e "1°"', () => {
    expect(formatData({ anno: -9999, mese: 1, giorno: 1 })).toBe(`1° gennaio 10000${NB}a.C.`);
    expect(formatData({ anno: 2026, mese: 10, giorno: 18 })).toBe('18 ottobre 2026');
    const d = { anno: 1500, mese: 3, giorno: 21, ora: 12, minuto: 0, secondo: 0, calendario: 'giuliano' as const };
    expect(formatDataOra(d, 'UT')).toBe('21 marzo 1500, 12:00 UT');
  });

  it('ora a 24 ore e offset fisso', () => {
    expect(formatOra(7, 5)).toBe('07:05');
    expect(formatOffset(120)).toBe('UTC+2');
    expect(formatOffset(-210)).toBe(`UTC${MENO}3:30`);
    expect(formatOffset(345)).toBe('UTC+5:45');
    expect(formatOffset(0)).toBe('UTC+0');
  });

  it('JD con 5 decimali raggruppato', () => {
    expect(formatJd(2_451_545)).toBe(`2${S}451${S}545,00000`);
    expect(formatJd(-1_931_076.5)).toBe(`${MENO}1${S}931${S}076,50000`);
  });

  it('nessun carattere U+2014 nelle uscite', () => {
    const uscite = [formatNumero(-1234.5, 1), formatAnno(-100), formatTempoLuce(4000), formatOffset(-90)];
    for (const u of uscite) expect(u.includes(String.fromCharCode(0x2014))).toBe(false);
  });
});

describe('cifre coerenti con l’incertezza (§ 11.13)', () => {
  it('ΔT e incertezza nella stessa unità, con la stessa ultima cifra; l’avviso riusa l’incertezza in ore', () => {
    // Valori della console al 1/1/10000 a.C., 1/1/3001 a.C., 9/1/721 a.C., 23/12/1499 e 19/10/2026.
    expect(formatDeltaT(438_384.19, 102_960)).toEqual({ valore: '121,8', sigma: `28,6${NB}h`, sigmaOre: '28,6' });
    expect(formatDeltaT(73_053.33, 8978)).toEqual({ valore: '20,3', sigma: `2,5${NB}h`, sigmaOre: '2,5' });
    expect(formatDeltaT(20_370.94, 518.1)).toEqual({ valore: `20${S}371`, sigma: `518${NB}s`, sigmaOre: '0,14' });
    expect(formatDeltaT(292.3, 8.46)).toEqual({ valore: '292,3', sigma: `8,5${NB}s`, sigmaOre: '0,0024' });
    expect(formatDeltaT(69.19, 3.26)).toEqual({ valore: '69,2', sigma: `3,3${NB}s`, sigmaOre: '0,00091' });
    // periodo IERS (§ 6.5): σ di millisecondi, non arrotondata a "0,00 s"
    expect(formatDeltaT(69.192_96, 0.001_68)).toMatchObject({ valore: '69,193', sigma: `0,002${NB}s` });
    expect(formatDeltaT(63.83, 0.114)).toMatchObject({ valore: '63,83', sigma: `0,11${NB}s` });
  });

  it('errore angolare: unità scelta dopo l’arrotondamento', () => {
    // ε_modello della Luna da reliability.bin (Float32): 59,99998984″.
    expect(formatErroreAngolare((59.999_989_84 / 3600) * RAD)).toBe('1,0′');
    expect(formatErroreAngolare((59.6 / 60) * RAD)).toBe('1,0°');
    expect(formatErroreAngolare((9.96 / 3600) * RAD)).toBe('10″');
    expect(formatErroreAngolare((9.96 / 60) * RAD)).toBe('10′');
    expect(formatErroreAngolare((59.4 / 3600) * RAD)).toBe('59″');
  });

  it('valori fisici: cifre dall’incertezza o dalla fonte, senza zeri non significativi', () => {
    expect(formatConIncertezza(18.0, 1.0)).toEqual({ valore: '18,0', incertezza: '1,0' });
    expect(formatValoreFisico(18.0, 1.0, 6)).toBe('18,0 ± 1,0');
    expect(formatValoreFisico(1.51, 1.29, 6)).toBe('1,5 ± 1,3');
    expect(formatValoreFisico(350, 57.5, 6)).toBe('350 ± 58');
    expect(formatValoreFisico(497.5, 40, 6)).toBe('498 ± 40');
    expect(formatValoreFisico(0.001_496_176, 0.0005, 7)).toBe('0,00150 ± 0,00050');
    // Senza incertezza: cifre del valore memorizzato.
    expect(formatValoreFisico(25.9, null, 6)).toBe('25,9');
    expect(formatValoreFisico(-17.240_000_000_255_407, null, 6)).toBe(`${MENO}17,24`);
    expect(formatValoreFisico(176.0, null, 6, 1 / 24)).toBe('7,33');
    expect(formatValoreFisico(7.937, null, 6)).toBe('7,937');
    expect(formatValoreFisico(18, null, 6)).toBe('18');
    expect(formatValoreFisico(83.0, null, 6)).toBe('83');
    expect(formatValoreFisico(0.102, null, 6)).toBe('0,102');
    // Incertezza oltre le cifre massime: valore con le cifre massime, senza incertezza.
    expect(formatValoreFisico(5.342_127_632_2, 4e-10, 6)).toBe('5,34213');
  });
});
