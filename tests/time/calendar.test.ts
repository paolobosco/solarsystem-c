// Criterio A2 (§ 13 di docs/PROGETTO.md): calendario, limiti, bisestili, andate e ritorno.

import { describe, expect, it } from 'vitest';
import {
  JD_MAX_UT_EXCL,
  JD_MIN_UT,
  JD_RIFORMA_GREGORIANA,
  JD_ULTIMO_UT,
  annoAstronomicoDaStorico,
  annoStoricoDaAstronomico,
  bisestile,
  calendarLocaleToJd,
  calendarToJd,
  calendarioApplicato,
  giorniNelMese,
  giorniNelMeseApplicato,
  giornoSettimana,
  giornoSettimanaLocale,
  inRiforma1582,
  jdToCalendar,
  jdToCalendarLocale,
  jdToProlepticGregorian,
  validaData,
} from '../../src/time/calendar';
import type { Calendario, DataCalendario, EsitoNonValido, EsitoValidazione } from '../../src/time/types';
import { SEME_TEMPO, generatore, interoTra } from './casuale';

function data(anno: number, mese: number, giorno: number, calendario: Calendario, ora = 0, minuto = 0, secondo = 0): DataCalendario {
  return { anno, mese, giorno, ora, minuto, secondo, calendario };
}

// Riferimenti indipendenti da Meeus (H. Hinnant, "chrono-compatible low-level date algorithms"):
// giorni dal 1970-01-01 (JD 2440587,5) nel gregoriano prolettico e dal 1° marzo dell'anno 0
// giuliano (JD 1721117,5) nel giuliano prolettico.
function jdRiferimento(anno: number, mese: number, giorno: number, calendario: Calendario): number {
  const y = mese <= 2 ? anno - 1 : anno;
  const gda = Math.floor((153 * (mese + (mese > 2 ? -3 : 9)) + 2) / 5) + giorno - 1;
  if (calendario === 'gregoriano') {
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const gde = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + gda;
    return era * 146097 + gde - 719468 + 2440587.5;
  }
  const era = Math.floor(y / 4);
  const yoe = y - era * 4;
  return era * 1461 + yoe * 365 + gda + 1721117.5;
}

function gregorianoRiferimento(jd0: number): { anno: number; mese: number; giorno: number } {
  const z = jd0 - 2440587.5 + 719468;
  const era = Math.floor(z / 146097);
  const gde = z - era * 146097;
  const yoe = Math.floor((gde - Math.floor(gde / 1460) + Math.floor(gde / 36524) - Math.floor(gde / 146096)) / 365);
  const gda = gde - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * gda + 2) / 153);
  const giorno = gda - Math.floor((153 * mp + 2) / 5) + 1;
  const mese = mp < 10 ? mp + 3 : mp - 9;
  return { anno: yoe + era * 400 + (mese <= 2 ? 1 : 0), mese, giorno };
}

function nonValido(e: EsitoValidazione): EsitoNonValido {
  if (e.valida) throw new Error('esito valido inatteso');
  return e;
}

describe('esempi di Meeus (cap. 7)', () => {
  it('1957-10-04,81 → JD 2 436 116,31', () => {
    expect(calendarToJd(data(1957, 10, 4, 'gregoriano', 19, 26, 24))).toBeCloseTo(2436116.31, 9);
    expect(calendarToJd(data(1957, 10, 4.81, 'gregoriano'))).toBeCloseTo(2436116.31, 9);
    expect(jdToCalendar(2436116.31)).toEqual(data(1957, 10, 4, 'gregoriano', 19, 26, 24));
  });

  it('333-01-27 12h → JD 1 842 713,0', () => {
    expect(calendarToJd(data(333, 1, 27, 'giuliano', 12))).toBe(1842713.0);
    expect(jdToCalendar(1842713.0)).toEqual(data(333, 1, 27, 'giuliano', 12));
  });

  it('-4712-01-01 12h → JD 0,0', () => {
    expect(calendarToJd(data(-4712, 1, 1, 'giuliano', 12))).toBe(0);
    expect(jdToCalendar(0)).toEqual(data(-4712, 1, 1, 'giuliano', 12));
  });

  it('JD 1 507 900,13 → -584-05-28,63', () => {
    expect(jdToCalendar(1507900.13)).toEqual(data(-584, 5, 28, 'giuliano', 15, 7, 12));
  });
});

describe('limiti e date di controllo', () => {
  it('JD_MIN_UT e JD_MAX_UT_EXCL dalla funzione', () => {
    expect(JD_MIN_UT).toBe(-1931076.5);
    expect(JD_MAX_UT_EXCL).toBe(2495739.5);
    expect(calendarToJd(data(-9999, 1, 1, 'giuliano'))).toBe(JD_MIN_UT);
    expect(calendarToJd(data(2121, 1, 1, 'gregoriano'))).toBe(JD_MAX_UT_EXCL);
    expect(jdToCalendar(JD_MIN_UT)).toEqual(data(-9999, 1, 1, 'giuliano'));
    expect(jdToCalendar(JD_MAX_UT_EXCL)).toEqual(data(2121, 1, 1, 'gregoriano'));
    expect(jdToCalendar(JD_ULTIMO_UT)).toEqual(data(2120, 12, 31, 'gregoriano', 23, 59, 59));
  });

  it('parte intera per difetto con JD negativi', () => {
    expect(calendarToJd(data(-9999, 3, 1, 'giuliano'))).toBe(-1931017.5);
    expect(calendarToJd(data(-9998, 12, 1, 'giuliano'))).toBe(-1930377.5);
    expect(jdToCalendar(-1931017.5)).toEqual(data(-9999, 3, 1, 'giuliano'));
    expect(jdToCalendar(-1930377.5)).toEqual(data(-9998, 12, 1, 'giuliano'));
  });

  it('2000-01-01 → JD 2 451 544,5', () => {
    expect(calendarToJd(data(2000, 1, 1, 'gregoriano'))).toBe(2451544.5);
    expect(jdToCalendar(2451544.5)).toEqual(data(2000, 1, 1, 'gregoriano'));
  });

  it('riforma del 1582: 4 ottobre giovedì, poi 15 ottobre venerdì', () => {
    const jd4 = calendarToJd(data(1582, 10, 4, 'giuliano'));
    expect(jd4).toBe(2299159.5);
    expect(JD_RIFORMA_GREGORIANA).toBe(2299160.5);
    expect(jdToCalendar(jd4 + 1)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(giornoSettimana(jd4)).toBe(3);
    expect(giornoSettimana(jd4 + 1)).toBe(4);
    expect(jdToCalendar(JD_RIFORMA_GREGORIANA - 1e-6).calendario).toBe('giuliano');
  });

  it('giorno della settimana', () => {
    expect(giornoSettimana(calendarToJd(data(1500, 1, 1, 'giuliano')))).toBe(2);
    expect(giornoSettimana(2451544.5)).toBe(5);
    expect(giornoSettimana(2451545.0)).toBe(5);
    expect(giornoSettimana(JD_MIN_UT)).toBe(((Math.floor(JD_MIN_UT + 0.5) % 7) + 7) % 7);
    const rnd = generatore(SEME_TEMPO + 1);
    for (let i = 0; i < 1000; i++) {
      const jd = JD_MIN_UT + rnd() * (JD_MAX_UT_EXCL - JD_MIN_UT);
      expect(giornoSettimana(jd + 1)).toBe((giornoSettimana(jd) + 1) % 7);
    }
  });

  it('gregoriano prolettico: -9999-01-01 giuliano = -10000-10-16 (77 giorni)', () => {
    expect(jdToProlepticGregorian(JD_MIN_UT)).toEqual(data(-10000, 10, 16, 'gregoriano'));
    expect(calendarToJd(data(-9999, 1, 1, 'gregoriano')) - JD_MIN_UT).toBe(77);
    expect(jdToProlepticGregorian(2451544.5)).toEqual(data(2000, 1, 1, 'gregoriano'));
    expect(jdToProlepticGregorian(2299159.5)).toEqual(data(1582, 10, 14, 'gregoriano'));
  });
});

describe('bisestili (T3)', () => {
  it.each([
    [-100, 'giuliano', true],
    [0, 'giuliano', true],
    [-9999, 'giuliano', false],
    [1500, 'giuliano', true],
    [1600, 'gregoriano', true],
    [1700, 'gregoriano', false],
    [2000, 'gregoriano', true],
    [2100, 'gregoriano', false],
  ] as const)('anno %i (%s): bisestile = %s', (anno, calendario, atteso) => {
    expect(bisestile(anno, calendario)).toBe(atteso);
    expect(giorniNelMese(anno, 2, calendario)).toBe(atteso ? 29 : 28);
    expect(giorniNelMeseApplicato(anno, 2)).toBe(atteso ? 29 : 28);
    const durata = calendarToJd(data(anno, 3, 1, calendario)) - calendarToJd(data(anno, 2, 1, calendario));
    expect(durata).toBe(atteso ? 29 : 28);
  });

  it('1500 non bisestile nel gregoriano prolettico', () => {
    expect(bisestile(1500, 'gregoriano')).toBe(false);
  });

  it('calendario applicato e ottobre 1582', () => {
    expect(calendarioApplicato(1582, 10, 4)).toBe('giuliano');
    expect(calendarioApplicato(1582, 10, 5)).toBeNull();
    expect(calendarioApplicato(1582, 10, 14)).toBeNull();
    expect(calendarioApplicato(1582, 10, 15)).toBe('gregoriano');
    expect(calendarioApplicato(1582, 9, 30)).toBe('giuliano');
    expect(calendarioApplicato(1583, 1, 1)).toBe('gregoriano');
    expect(inRiforma1582(1582, 10, 10)).toBe(true);
    expect(inRiforma1582(1582, 10, 15)).toBe(false);
    expect(giorniNelMeseApplicato(1582, 10)).toBe(31);
  });
});

describe('andate e ritorno (seme ' + SEME_TEMPO + ')', () => {
  it('100 000 date casuali: data → JD → data esatte', () => {
    const rnd = generatore(SEME_TEMPO);
    for (let i = 0; i < 100_000; i++) {
      const anno = interoTra(rnd, -9999, 2120);
      const mese = interoTra(rnd, 1, 12);
      const giorno = interoTra(rnd, 1, giorniNelMeseApplicato(anno, mese));
      const calendario = calendarioApplicato(anno, mese, giorno);
      if (calendario === null) {
        i--;
        continue;
      }
      const d = data(anno, mese, giorno, calendario, interoTra(rnd, 0, 23), interoTra(rnd, 0, 59), interoTra(rnd, 0, 59));
      const jd = calendarToJd(d);
      const r = jdToCalendar(jd);
      if (r.anno !== d.anno || r.mese !== d.mese || r.giorno !== d.giorno || r.ora !== d.ora || r.minuto !== d.minuto || r.secondo !== d.secondo || r.calendario !== d.calendario) {
        expect(r).toEqual(d);
      }
      expect(jd).toBeGreaterThanOrEqual(JD_MIN_UT);
      expect(jd).toBeLessThan(JD_MAX_UT_EXCL);
    }
  });

  it('100 000 JD casuali: JD → data → JD (esatti a 0h, entro 1 ms altrimenti)', () => {
    const rnd = generatore(SEME_TEMPO + 2);
    const giorni = JD_MAX_UT_EXCL - JD_MIN_UT;
    for (let i = 0; i < 100_000; i++) {
      const jd0 = JD_MIN_UT + Math.floor(rnd() * giorni);
      expect(calendarToJd(jdToCalendar(jd0))).toBe(jd0);
      const jd = jd0 + interoTra(rnd, 0, 86_399_999) / 86_400_000;
      const delta = Math.abs(calendarToJd(jdToCalendar(jd)) - jd);
      if (delta > 1e-8) expect(delta).toBeLessThanOrEqual(1e-8);
    }
  });

  it('100 000 date contro il riferimento indipendente, nei due calendari prolettici', () => {
    const rnd = generatore(SEME_TEMPO + 3);
    for (let i = 0; i < 100_000; i++) {
      const anno = interoTra(rnd, -10001, 2121);
      const mese = interoTra(rnd, 1, 12);
      const calendario: Calendario = rnd() < 0.5 ? 'giuliano' : 'gregoriano';
      const giorno = interoTra(rnd, 1, giorniNelMese(anno, mese, calendario));
      const jd = calendarToJd(data(anno, mese, giorno, calendario));
      const atteso = jdRiferimento(anno, mese, giorno, calendario);
      if (jd !== atteso) expect(jd).toBe(atteso);
      if (calendario === 'gregoriano') {
        const g = jdToProlepticGregorian(jd);
        const r = gregorianoRiferimento(jd);
        if (g.anno !== r.anno || g.mese !== r.mese || g.giorno !== r.giorno) expect(g).toMatchObject(r);
      }
    }
  });

  it('arrotondamento al millisecondo con riporto al giorno successivo', () => {
    const jd = calendarToJd(data(2000, 1, 1, 'gregoriano')) + 1 - 1e-10;
    expect(jdToCalendar(jd)).toEqual(data(2000, 1, 2, 'gregoriano'));
    expect(jdToCalendar(2451544.5 + 0.5 + 0.25)).toEqual(data(2000, 1, 1, 'gregoriano', 18));
    expect(() => jdToCalendar(Number.NaN)).toThrow(RangeError);
  });
});

describe('offset orario fisso', () => {
  it('conversione locale ↔ UT', () => {
    expect(jdToCalendarLocale(JD_MIN_UT, 120)).toEqual(data(-9999, 1, 1, 'giuliano', 2));
    expect(jdToCalendarLocale(JD_MIN_UT, -60)).toEqual(data(-10000, 12, 31, 'giuliano', 23));
    expect(calendarLocaleToJd(data(-9999, 1, 1, 'giuliano', 2), 120)).toBe(JD_MIN_UT);
    expect(jdToCalendarLocale(JD_RIFORMA_GREGORIANA - 1 / 48, 60)).toEqual(data(1582, 10, 15, 'gregoriano', 0, 30));
    expect(jdToCalendarLocale(2451544.5, 0)).toEqual(jdToCalendar(2451544.5));
  });
});

describe('giorno della settimana e gregoriano prolettico della data mostrata (T4, § 11.4.1)', () => {
  /** Un ulp sotto 2^22: istante 40 µs prima della mezzanotte, mostrato come 00:00:00 del giorno dopo. */
  const ULP = 2 ** -31;
  const zero = (d: DataCalendario): DataCalendario => ({ ...d, ora: 0, minuto: 0, secondo: 0 });

  it('istante appena prima della mezzanotte: giorno della data arrotondata al millisecondo', () => {
    // Riferimento indipendente: Python datetime.date(2026, 10, 21).weekday() = 2, date(1582, 10, 15).weekday() = 4.
    const jd2026 = 2461334.5 - ULP;
    expect(jdToCalendarLocale(jd2026, 0)).toEqual(data(2026, 10, 21, 'gregoriano'));
    expect(giornoSettimanaLocale(jd2026, 0)).toBe(2);
    const jdLocale = 2461334.5 - 1 / 24 - ULP;
    expect(jdToCalendarLocale(jdLocale, 60)).toEqual(data(2026, 10, 21, 'gregoriano'));
    expect(giornoSettimanaLocale(jdLocale, 60)).toBe(2);
    const jd1582 = JD_RIFORMA_GREGORIANA - ULP;
    expect(jdToCalendarLocale(jd1582, 0)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(giornoSettimanaLocale(jd1582, 0)).toBe(4);
    expect(jdToProlepticGregorian(jd1582, 0)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(jdToProlepticGregorian(JD_RIFORMA_GREGORIANA - 1 / 48, 60)).toEqual(data(1582, 10, 15, 'gregoriano', 0, 30));
    expect(jdToProlepticGregorian(JD_RIFORMA_GREGORIANA - 1 / 24, -60)).toEqual(data(1582, 10, 14, 'gregoriano', 22));
    expect(() => giornoSettimanaLocale(2451545, Number.NaN)).toThrow(RangeError);
    expect(() => jdToProlepticGregorian(2451545, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('istanti casuali vicini alla mezzanotte locale: stesso giorno di jdToCalendarLocale', () => {
    const rnd = generatore(SEME_TEMPO + 4);
    for (let i = 0; i < 20000; i++) {
      const off = -720 + 15 * interoTra(rnd, 0, 104);
      const mezzanotte = Math.floor(JD_MIN_UT + 1 + rnd() * (JD_MAX_UT_EXCL - JD_MIN_UT - 2)) + 0.5 - off / 1440;
      const jd = mezzanotte + interoTra(rnd, -40, 40) * 2 ** -30;
      const dc = jdToCalendarLocale(jd, off);
      const inizio = calendarToJd(zero(dc));
      expect(giornoSettimanaLocale(jd, off)).toBe(giornoSettimana(inizio));
      expect(calendarToJd(zero(jdToProlepticGregorian(jd, off)))).toBe(inizio);
    }
  });
});

describe('anno storico ed era', () => {
  it('conversioni (I2)', () => {
    expect(annoAstronomicoDaStorico(1, 'aC')).toBe(0);
    expect(annoAstronomicoDaStorico(10000, 'aC')).toBe(-9999);
    expect(annoAstronomicoDaStorico(1, 'dC')).toBe(1);
    expect(annoStoricoDaAstronomico(0)).toEqual({ annoStorico: 1, era: 'aC' });
    expect(annoStoricoDaAstronomico(-9999)).toEqual({ annoStorico: 10000, era: 'aC' });
    expect(annoStoricoDaAstronomico(2120)).toEqual({ annoStorico: 2120, era: 'dC' });
    for (let a = -10000; a <= 2200; a++) {
      const s = annoStoricoDaAstronomico(a);
      expect(s.annoStorico).toBeGreaterThan(0);
      expect(annoAstronomicoDaStorico(s.annoStorico, s.era)).toBe(a);
    }
  });
});

describe('validaData (§ 11.4.2, A16)', () => {
  it('ANNO_ZERO', () => {
    const e = nonValido(validaData({ annoStorico: 0, era: 'aC', mese: 1, giorno: 1 }));
    expect(e.codice).toBe('ANNO_ZERO');
    expect(e.campo).toBe('anno');
    expect(nonValido(validaData({ annoStorico: 0, era: 'dC', mese: 1, giorno: 1 })).codice).toBe('ANNO_ZERO');
  });

  it('RIFORMA_1582 con le date proposte', () => {
    for (let g = 5; g <= 14; g++) {
      const e = nonValido(validaData({ anno: 1582, mese: 10, giorno: g, ora: 9, minuto: 30 }));
      expect(e.codice).toBe('RIFORMA_1582');
      expect(e.riforma?.prima).toEqual(data(1582, 10, 4, 'giuliano', 9, 30));
      expect(e.riforma?.dopo).toEqual(data(1582, 10, 15, 'gregoriano', 9, 30));
    }
    expect(validaData({ anno: 1582, mese: 10, giorno: 4 }).valida).toBe(true);
    expect(validaData({ anno: 1582, mese: 10, giorno: 15 }).valida).toBe(true);
  });

  it('GIORNO_INESISTENTE con il calendario applicato', () => {
    const e2023 = nonValido(validaData({ anno: 2023, mese: 2, giorno: 29 }));
    expect(e2023.codice).toBe('GIORNO_INESISTENTE');
    expect(e2023.calendario).toBe('gregoriano');
    const e1700 = nonValido(validaData({ annoStorico: 1700, era: 'dC', mese: 2, giorno: 29 }));
    expect(e1700.codice).toBe('GIORNO_INESISTENTE');
    expect(nonValido(validaData({ anno: 2024, mese: 4, giorno: 31 })).codice).toBe('GIORNO_INESISTENTE');
    const e102 = nonValido(validaData({ annoStorico: 102, era: 'aC', mese: 2, giorno: 29 }));
    expect(e102.codice).toBe('GIORNO_INESISTENTE');
    expect(e102.calendario).toBe('giuliano');
    expect(validaData({ annoStorico: 1500, era: 'dC', mese: 2, giorno: 29 }).valida).toBe(true);
    expect(validaData({ annoStorico: 1, era: 'aC', mese: 2, giorno: 29 }).valida).toBe(true);
    expect(validaData({ anno: 2000, mese: 2, giorno: 29 }).valida).toBe(true);
  });

  it('FUORI_INTERVALLO in UT, anche con offset', () => {
    expect(nonValido(validaData({ annoStorico: 10001, era: 'aC', mese: 12, giorno: 31, ora: 23, minuto: 59 })).limite).toBe('inferiore');
    expect(nonValido(validaData({ anno: 2121, mese: 1, giorno: 1 })).codice).toBe('FUORI_INTERVALLO');
    expect(nonValido(validaData({ anno: 2121, mese: 1, giorno: 1 })).limite).toBe('superiore');
    expect(nonValido(validaData({ anno: 1e12, mese: 1, giorno: 1 })).limite).toBe('superiore');
    // UTC+2: 1° gennaio 10000 a.C. 01:00 locale = 31 dicembre 10001 a.C. 23:00 UT.
    const sotto = nonValido(validaData({ annoStorico: 10000, era: 'aC', mese: 1, giorno: 1, ora: 1 }, { offsetMinuti: 120 }));
    expect(sotto.codice).toBe('FUORI_INTERVALLO');
    expect(sotto.limite).toBe('inferiore');
    const limite = validaData({ annoStorico: 10000, era: 'aC', mese: 1, giorno: 1, ora: 2 }, { offsetMinuti: 120 });
    expect(limite).toMatchObject({ valida: true, jd: JD_MIN_UT });
    // UTC+2: 1° gennaio 2121 01:59 locale = 31 dicembre 2120 23:59 UT.
    expect(validaData({ anno: 2121, mese: 1, giorno: 1, ora: 1, minuto: 59 }, { offsetMinuti: 120 }).valida).toBe(true);
    expect(nonValido(validaData({ anno: 2121, mese: 1, giorno: 1, ora: 2 }, { offsetMinuti: 120 })).limite).toBe('superiore');
    // UTC-1: 31 dicembre 2120 23:30 locale = 1° gennaio 2121 00:30 UT.
    expect(nonValido(validaData({ anno: 2120, mese: 12, giorno: 31, ora: 23, minuto: 30 }, { offsetMinuti: -60 })).limite).toBe('superiore');
    expect(validaData({ anno: 2120, mese: 12, giorno: 31, ora: 23, minuto: 59, secondo: 59 }).valida).toBe(true);
  });

  it('limiti alternativi (ingresso in TT)', () => {
    const d = { anno: -9999, mese: 1, giorno: 1, ora: 1 };
    expect(nonValido(validaData(d, { jdMin: JD_MIN_UT + 5.07, jdMaxEscl: JD_MAX_UT_EXCL + 0.001 })).limite).toBe('inferiore');
    expect(validaData(d, { jdMin: JD_MIN_UT, jdMaxEscl: JD_MAX_UT_EXCL }).valida).toBe(true);
  });

  it('campi mancanti o non validi', () => {
    expect(nonValido(validaData({ mese: 1, giorno: 1 })).codice).toBe('CAMPO_MANCANTE');
    expect(nonValido(validaData({ annoStorico: 5, mese: 1, giorno: 1 })).campo).toBe('era');
    expect(nonValido(validaData({ era: 'dC', mese: 1, giorno: 1 })).campo).toBe('anno');
    expect(nonValido(validaData({ anno: 2000, giorno: 1 })).campo).toBe('mese');
    expect(nonValido(validaData({ anno: 2000, mese: 1 })).campo).toBe('giorno');
    expect(nonValido(validaData({ annoStorico: 5, era: 'xx' as 'aC', mese: 1, giorno: 1 })).codice).toBe('ERA_NON_VALIDA');
    expect(nonValido(validaData({ annoStorico: -5, era: 'dC', mese: 1, giorno: 1 })).codice).toBe('ANNO_NON_VALIDO');
    expect(nonValido(validaData({ annoStorico: 5, era: 'dC', anno: 6, mese: 1, giorno: 1 })).codice).toBe('ANNO_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000.5, mese: 1, giorno: 1 })).codice).toBe('ANNO_NON_VALIDO');
    expect(nonValido(validaData({ anno: Number.NaN, mese: 1, giorno: 1 })).codice).toBe('ANNO_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 13, giorno: 1 })).codice).toBe('MESE_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 0, giorno: 1 })).codice).toBe('MESE_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 32 })).codice).toBe('GIORNO_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 0 })).codice).toBe('GIORNO_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 1, ora: 24 })).codice).toBe('ORA_NON_VALIDA');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 1, minuto: 60 })).codice).toBe('MINUTO_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 1, secondo: 60 })).codice).toBe('SECONDO_NON_VALIDO');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 1, calendario: 'giuliano' })).codice).toBe('CALENDARIO_INCOERENTE');
    expect(nonValido(validaData({ anno: 2000, mese: 1, giorno: 1, calendario: 'altro' as Calendario })).codice).toBe('CALENDARIO_NON_VALIDO');
  });

  it('esito valido con data completa e JD', () => {
    const e = validaData({ annoStorico: 44, era: 'aC', mese: 3, giorno: 15, ora: 12 });
    expect(e).toEqual({
      valida: true,
      data: data(-43, 3, 15, 'giuliano', 12),
      jd: calendarToJd(data(-43, 3, 15, 'giuliano', 12)),
    });
    const conOffset = validaData({ anno: 2000, mese: 1, giorno: 1, ora: 2 }, { offsetMinuti: 120 });
    expect(conOffset).toMatchObject({ valida: true, jd: 2451544.5 });
  });
});
