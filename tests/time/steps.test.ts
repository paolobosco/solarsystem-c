// Passi temporali (§ 6.6, § 11.4.3, criterio A2 di docs/PROGETTO.md).

import { describe, expect, it } from 'vitest';
import {
  JD_MAX_UT_EXCL,
  JD_MIN_UT,
  JD_ULTIMO_UT,
  calendarLocaleToJd,
  calendarToJd,
  giornoSettimana,
  giornoSettimanaLocale,
  jdToCalendar,
  jdToCalendarLocale,
  jdToProlepticGregorian,
} from '../../src/time/calendar';
import { UNITA_PASSO, aggiungiMesi, limiteRaggiunto, passo } from '../../src/time/steps';
import type { UnitaPasso } from '../../src/time/steps';
import { limitiScala } from '../../src/time/timescale';
import type { Calendario, DataCalendario } from '../../src/time/types';
import { SEME_TEMPO, generatore, interoTra } from './casuale';
import { datiTempo } from './datiTempo';

function data(anno: number, mese: number, giorno: number, calendario: Calendario, ora = 0, minuto = 0, secondo = 0): DataCalendario {
  return { anno, mese, giorno, ora, minuto, secondo, calendario };
}

function dopo(d: DataCalendario, unita: UnitaPasso, n: number, offsetMinuti = 0): DataCalendario {
  const esito = passo(calendarLocaleToJd(d, offsetMinuti), unita, n, { offsetMinuti });
  expect(esito.limite).toBeNull();
  return jdToCalendarLocale(esito.jd, offsetMinuti);
}

describe('minuto, ora, giorno: somma al JD', () => {
  it('4 ottobre 1582 giovedì + 1 giorno = 15 ottobre venerdì', () => {
    const r = passo(calendarToJd(data(1582, 10, 4, 'giuliano', 12)), 'giorno', 1);
    expect(jdToCalendar(r.jd)).toEqual(data(1582, 10, 15, 'gregoriano', 12));
    expect(giornoSettimana(r.jd)).toBe(4);
    expect(jdToCalendar(passo(r.jd, 'giorno', -1).jd)).toEqual(data(1582, 10, 4, 'giuliano', 12));
  });

  it('passaggio continuo del 1582 con minuto e ora', () => {
    expect(dopo(data(1582, 10, 4, 'giuliano', 23, 59), 'minuto', 1)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(dopo(data(1582, 10, 15, 'gregoriano', 0, 30), 'ora', -1)).toEqual(data(1582, 10, 4, 'giuliano', 23, 30));
  });

  it('multipli e passi all\'indietro', () => {
    const jd = calendarToJd(data(2000, 1, 1, 'gregoriano'));
    expect(passo(jd, 'giorno', 10).jd).toBe(jd + 10);
    expect(passo(jd, 'ora', -10).jd).toBeCloseTo(jd - 10 / 24, 12);
    expect(jdToCalendar(passo(jd, 'minuto', 90).jd)).toEqual(data(2000, 1, 1, 'gregoriano', 1, 30));
  });

  it('1440 passi di un minuto = 1 giorno, senza deriva visibile', () => {
    let jd = calendarToJd(data(-5000, 6, 1, 'giuliano', 12));
    for (let i = 0; i < 1440; i++) jd = passo(jd, 'minuto', 1).jd;
    expect(jdToCalendar(jd)).toEqual(data(-5000, 6, 2, 'giuliano', 12));
  });
});

describe('mezzanotte raggiunta con passi di ora e di minuto (T4, § 11.4.1)', () => {
  it('20/10/2026 22:00 + 2 ore: 21 ottobre mercoledì; 4/10/1582 22:00 + 2 ore: 15 ottobre venerdì', () => {
    let jd = calendarToJd(data(2026, 10, 20, 'gregoriano', 22));
    for (let i = 0; i < 2; i++) jd = passo(jd, 'ora', 1).jd;
    // La somma di 1/24 non è esatta: l'istante resta sotto la mezzanotte, mostrata come 00:00 del 21.
    expect(jd).toBeLessThan(calendarToJd(data(2026, 10, 21, 'gregoriano')));
    expect(jdToCalendarLocale(jd, 0)).toEqual(data(2026, 10, 21, 'gregoriano'));
    expect(giornoSettimanaLocale(jd, 0)).toBe(2);

    let jd1582 = calendarToJd(data(1582, 10, 4, 'giuliano', 22));
    for (let i = 0; i < 2; i++) jd1582 = passo(jd1582, 'ora', 1).jd;
    expect(jdToCalendarLocale(jd1582, 0)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(giornoSettimanaLocale(jd1582, 0)).toBe(4);

    let jdOff = calendarLocaleToJd(data(2026, 10, 20, 'gregoriano', 22), 60);
    for (let i = 0; i < 2; i++) jdOff = passo(jdOff, 'ora', 1, { offsetMinuti: 60 }).jd;
    expect(jdToCalendarLocale(jdOff, 60)).toEqual(data(2026, 10, 21, 'gregoriano'));
    expect(giornoSettimanaLocale(jdOff, 60)).toBe(2);
  });

  it('giorno della settimana e gregoriano prolettico seguono la data mostrata dopo ogni passo', () => {
    const offset = [-720, -330, -60, 0, 60, 345, 840];
    const anni = [-9999, -5000, -1, 1, 1000, 1582, 1600, 1900, 2000, 2026, 2120];
    let sottoMezzanotte = 0;
    for (const off of offset) {
      for (const anno of anni) {
        const cal: Calendario = anno <= 1582 ? 'giuliano' : 'gregoriano';
        for (const [unita, n, inizio] of [['ora', 48, 22], ['minuto', 1500, 23]] as const) {
          let jd = calendarLocaleToJd(data(anno, cal === 'giuliano' ? 10 : 3, 4, cal, inizio, unita === 'minuto' ? 30 : 0), off);
          for (let i = 0; i < n; i++) {
            jd = passo(jd, unita, 1, { offsetMinuti: off }).jd;
            const dc = jdToCalendarLocale(jd, off);
            const giorno0 = calendarToJd({ ...dc, ora: 0, minuto: 0, secondo: 0 });
            if (Math.floor(jd + off / 1440 + 0.5) !== giorno0 + 0.5) sottoMezzanotte++;
            expect(giornoSettimanaLocale(jd, off)).toBe(giornoSettimana(giorno0));
            const g = jdToProlepticGregorian(jd, off);
            expect(calendarToJd({ ...g, ora: 0, minuto: 0, secondo: 0 })).toBe(giorno0);
          }
        }
      }
    }
    // Il JD grezzo con l'offset cade nel giorno precedente a quello mostrato in alcuni casi.
    expect(sottoMezzanotte).toBeGreaterThan(0);
  });
});

describe('mese, anno, secolo, millennio: aritmetica di calendario', () => {
  it('31 gennaio + 1 mese = ultimo giorno di febbraio', () => {
    expect(dopo(data(2023, 1, 31, 'gregoriano'), 'mese', 1)).toEqual(data(2023, 2, 28, 'gregoriano'));
    expect(dopo(data(2024, 1, 31, 'gregoriano'), 'mese', 1)).toEqual(data(2024, 2, 29, 'gregoriano'));
    expect(dopo(data(1500, 1, 31, 'giuliano'), 'mese', 1)).toEqual(data(1500, 2, 29, 'giuliano'));
    expect(dopo(data(1700, 1, 31, 'gregoriano'), 'mese', 1)).toEqual(data(1700, 2, 28, 'gregoriano'));
    expect(dopo(data(2024, 3, 31, 'gregoriano'), 'mese', -1)).toEqual(data(2024, 2, 29, 'gregoriano'));
    expect(dopo(data(2024, 5, 31, 'gregoriano'), 'mese', 1)).toEqual(data(2024, 6, 30, 'gregoriano'));
  });

  it('29 febbraio + 1 anno = 28 febbraio', () => {
    expect(dopo(data(2024, 2, 29, 'gregoriano', 6, 15), 'anno', 1)).toEqual(data(2025, 2, 28, 'gregoriano', 6, 15));
    expect(dopo(data(2024, 2, 29, 'gregoriano'), 'anno', -1)).toEqual(data(2023, 2, 28, 'gregoriano'));
    expect(dopo(data(2024, 2, 29, 'gregoriano'), 'anno', 4)).toEqual(data(2028, 2, 29, 'gregoriano'));
    expect(dopo(data(1696, 2, 29, 'gregoriano'), 'anno', 4)).toEqual(data(1700, 2, 28, 'gregoriano'));
    expect(dopo(data(1496, 2, 29, 'giuliano'), 'anno', 4)).toEqual(data(1500, 2, 29, 'giuliano'));
  });

  it('salto del 1582: 15 ottobre in avanti, 4 ottobre all\'indietro', () => {
    expect(dopo(data(1582, 9, 10, 'giuliano', 8), 'mese', 1)).toEqual(data(1582, 10, 15, 'gregoriano', 8));
    expect(dopo(data(1582, 11, 10, 'gregoriano', 8), 'mese', -1)).toEqual(data(1582, 10, 4, 'giuliano', 8));
    expect(dopo(data(1581, 10, 7, 'giuliano'), 'anno', 1)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(dopo(data(1583, 10, 14, 'gregoriano'), 'anno', -1)).toEqual(data(1582, 10, 4, 'giuliano'));
    expect(dopo(data(1482, 10, 5, 'giuliano'), 'secolo', 1)).toEqual(data(1582, 10, 15, 'gregoriano'));
    expect(dopo(data(2582, 10, 14, 'gregoriano'), 'millennio', -1)).toEqual(data(1582, 10, 4, 'giuliano'));
    expect(dopo(data(1582, 9, 4, 'giuliano'), 'mese', 1)).toEqual(data(1582, 10, 4, 'giuliano'));
    expect(dopo(data(1582, 11, 15, 'gregoriano'), 'mese', -1)).toEqual(data(1582, 10, 15, 'gregoriano'));
  });

  it('1 a.C. + 1 anno = 1 d.C. (anni astronomici)', () => {
    expect(dopo(data(0, 7, 1, 'giuliano'), 'anno', 1)).toEqual(data(1, 7, 1, 'giuliano'));
    expect(dopo(data(1, 7, 1, 'giuliano'), 'anno', -1)).toEqual(data(0, 7, 1, 'giuliano'));
    expect(dopo(data(0, 12, 15, 'giuliano'), 'mese', 1)).toEqual(data(1, 1, 15, 'giuliano'));
    expect(dopo(data(1, 1, 15, 'giuliano'), 'mese', -1)).toEqual(data(0, 12, 15, 'giuliano'));
  });

  it('secolo e millennio attraverso calendari diversi', () => {
    expect(dopo(data(1500, 3, 1, 'giuliano'), 'secolo', 1)).toEqual(data(1600, 3, 1, 'gregoriano'));
    expect(dopo(data(2000, 1, 1, 'gregoriano', 12), 'millennio', -1)).toEqual(data(1000, 1, 1, 'giuliano', 12));
    expect(dopo(data(-8999, 1, 2, 'giuliano'), 'millennio', -1)).toEqual(data(-9999, 1, 2, 'giuliano'));
    expect(dopo(data(500, 2, 29, 'giuliano'), 'secolo', 1)).toEqual(data(600, 2, 29, 'giuliano'));
    expect(dopo(data(1600, 2, 29, 'gregoriano'), 'secolo', 1)).toEqual(data(1700, 2, 28, 'gregoriano'));
  });

  it('aggiungiMesi conserva l\'ora e normalizza anni negativi', () => {
    expect(aggiungiMesi(data(-1, 1, 31, 'giuliano', 5, 6, 7.5), -1)).toEqual(data(-2, 12, 31, 'giuliano', 5, 6, 7.5));
    expect(aggiungiMesi(data(-1, 3, 31, 'giuliano'), -1)).toEqual(data(-1, 2, 28, 'giuliano'));
    expect(aggiungiMesi(data(0, 3, 31, 'giuliano'), -1)).toEqual(data(0, 2, 29, 'giuliano'));
  });

  it('la data mostrata con offset governa l\'aritmetica di calendario', () => {
    // 31 gennaio 2024 23:30 a UTC+1 = 31 gennaio 22:30 UT: + 1 mese = 29 febbraio 23:30 locale.
    expect(dopo(data(2024, 1, 31, 'gregoriano', 23, 30), 'mese', 1, 60)).toEqual(data(2024, 2, 29, 'gregoriano', 23, 30));
    // 1° febbraio 2024 00:30 a UTC+1 (31 gennaio UT): + 1 mese = 1° marzo locale.
    expect(dopo(data(2024, 2, 1, 'gregoriano', 0, 30), 'mese', 1, 60)).toEqual(data(2024, 3, 1, 'gregoriano', 0, 30));
  });

  it('andata e ritorno di mesi su date casuali con giorno ≤ 28', () => {
    const rnd = generatore(SEME_TEMPO + 10);
    for (let i = 0; i < 5000; i++) {
      const anno = interoTra(rnd, -9000, 2000);
      const mese = interoTra(rnd, 1, 12);
      const giorno = interoTra(rnd, 1, 28);
      if (anno === 1582 && mese === 10) continue;
      const cal: Calendario = anno < 1582 || (anno === 1582 && mese < 10) ? 'giuliano' : 'gregoriano';
      const d = data(anno, mese, giorno, cal, interoTra(rnd, 0, 23), interoTra(rnd, 0, 59));
      const unita = UNITA_PASSO[interoTra(rnd, 3, 5)] as UnitaPasso;
      const avanti = passo(calendarToJd(d), unita, 1);
      const indietro = passo(avanti.jd, unita, -1);
      const r = jdToCalendar(indietro.jd);
      const attraversa1582 = Math.abs(jdToCalendar(avanti.jd).anno - 1582) <= 100 || Math.abs(anno - 1582) <= 100;
      if (!attraversa1582) expect(r).toEqual(d);
    }
  });
});

describe('limiti dell\'intervallo', () => {
  it('limite inferiore: il passo si ferma e lo segnala', () => {
    const r = passo(JD_MIN_UT + 0.5, 'giorno', -1);
    expect(r).toEqual({ jd: JD_MIN_UT, limite: 'inferiore', fermo: false });
    expect(passo(JD_MIN_UT, 'minuto', -1)).toEqual({ jd: JD_MIN_UT, limite: 'inferiore', fermo: true });
    expect(passo(calendarToJd(data(-9999, 6, 1, 'giuliano')), 'secolo', -1).jd).toBe(JD_MIN_UT);
    expect(passo(calendarToJd(data(-9999, 1, 2, 'giuliano')), 'giorno', -1)).toEqual({ jd: JD_MIN_UT, limite: 'inferiore', fermo: false });
    expect(passo(JD_MIN_UT, 'giorno', 1).limite).toBeNull();
  });

  it('limite superiore: ultimo istante 2120-12-31 23:59:59 UT', () => {
    const r = passo(calendarToJd(data(2120, 12, 31, 'gregoriano', 12)), 'giorno', 1);
    expect(r.jd).toBe(JD_ULTIMO_UT);
    expect(r.limite).toBe('superiore');
    expect(jdToCalendar(r.jd)).toEqual(data(2120, 12, 31, 'gregoriano', 23, 59, 59));
    expect(passo(JD_ULTIMO_UT, 'anno', 1)).toEqual({ jd: JD_ULTIMO_UT, limite: 'superiore', fermo: true });
    expect(passo(calendarToJd(data(2120, 6, 15, 'gregoriano')), 'millennio', 1).jd).toBe(JD_ULTIMO_UT);
    expect(passo(JD_ULTIMO_UT, 'minuto', -1).limite).toBeNull();
    const quasi = JD_MAX_UT_EXCL - 0.2 / 86400;
    expect(passo(quasi, 'minuto', 1)).toEqual({ jd: quasi, limite: 'superiore', fermo: true });
  });

  it('con offset i limiti restano in UT', () => {
    // UTC+2: limite inferiore mostrato come 1° gennaio 10000 a.C. 02:00.
    const r = passo(calendarLocaleToJd(data(-9999, 1, 1, 'giuliano', 3), 120), 'ora', -2, { offsetMinuti: 120 });
    expect(r).toEqual({ jd: JD_MIN_UT, limite: 'inferiore', fermo: false });
    expect(jdToCalendarLocale(r.jd, 120)).toEqual(data(-9999, 1, 1, 'giuliano', 2));
    // UTC-2: 31 dicembre 10001 a.C. 22:00 locale è il limite; il mese precedente è fuori.
    expect(passo(JD_MIN_UT + 1, 'mese', -1, { offsetMinuti: -120 }).limite).toBe('inferiore');
    // UTC+2: 1° gennaio 2121 01:00 locale è ammesso (23:00 UT); + 1 mese supera il limite.
    const jdLocale = calendarLocaleToJd(data(2121, 1, 1, 'gregoriano', 1), 120);
    expect(jdLocale).toBeLessThan(JD_MAX_UT_EXCL);
    expect(passo(jdLocale, 'mese', 1, { offsetMinuti: 120 }).jd).toBe(JD_ULTIMO_UT);
  });

  it('limiti alternativi (ingresso in TT)', () => {
    const jdMin = JD_MIN_UT + 5.07;
    const r = passo(jdMin + 0.1, 'giorno', -1, { jdMin, jdMaxEscl: JD_MAX_UT_EXCL + 0.001 });
    expect(r).toEqual({ jd: jdMin, limite: 'inferiore', fermo: false });
  });

  it('ingresso in TT: andata e ritorno di mesi, anni, secoli e millenni ai limiti non lascia scarti sotto il millisecondo (§ 6.6)', () => {
    // TT_min e il limite superiore TT non cadono sulla griglia del millisecondo della data mostrata: senza il ritorno
    // esatto al limite, il pulsante resterebbe attivo e il messaggio mancherebbe al primo passo.
    const L = limitiScala(datiTempo().deltaT, 'TT');
    const opz = { jdMin: L.min, jdMaxEscl: L.maxEscl };
    const ultimo = L.maxEscl - 1 / 86_400;
    for (const unita of ['mese', 'anno', 'secolo', 'millennio'] as const) {
      const avanti = passo(L.min, unita, 1, opz);
      expect(avanti.limite, unita).toBeNull();
      const ritorno = passo(avanti.jd, unita, -1, opz);
      expect(ritorno, unita).toEqual({ jd: L.min, limite: 'inferiore', fermo: false });
      expect(limiteRaggiunto(ritorno.jd, opz), unita).toBe('inferiore');
      expect(passo(ritorno.jd, unita, -1, opz), unita).toEqual({ jd: L.min, limite: 'inferiore', fermo: true });

      const indietro = passo(ultimo, unita, -1, opz);
      expect(indietro.limite, unita).toBeNull();
      expect(passo(indietro.jd, unita, 1, opz), unita).toEqual({ jd: ultimo, limite: 'superiore', fermo: false });
    }
    // Con un offset orario fisso: stesso ritorno al limite, nell'ora mostrata.
    for (const offsetMinuti of [-120, 330]) {
      const avanti = passo(L.min, 'anno', 1, { ...opz, offsetMinuti });
      expect(passo(avanti.jd, 'anno', -1, { ...opz, offsetMinuti }).jd, String(offsetMinuti)).toBe(L.min);
    }
  });

  it('un risultato di calendario oltre un millisecondo dal limite non viene portato al limite', () => {
    const jdMin = JD_MIN_UT + 5.07;
    const jdMaxEscl = JD_MAX_UT_EXCL + 0.001;
    const opz = { jdMin, jdMaxEscl };
    const vicino = jdMin + 3 / 86_400_000;
    const r = passo(passo(vicino, 'mese', 1, opz).jd, 'mese', -1, opz);
    expect(r.limite).toBeNull();
    expect(Math.abs(r.jd - vicino)).toBeLessThan(1 / 86_400_000);
  });

  it('limiteRaggiunto per aria-disabled', () => {
    expect(limiteRaggiunto(JD_MIN_UT)).toBe('inferiore');
    expect(limiteRaggiunto(JD_ULTIMO_UT)).toBe('superiore');
    expect(limiteRaggiunto(2451545)).toBeNull();
  });

  it('argomenti non validi', () => {
    expect(() => passo(2451545, 'giorno', 0)).toThrow(RangeError);
    expect(() => passo(2451545, 'giorno', 1.5)).toThrow(RangeError);
    expect(() => passo(Number.NaN, 'giorno', 1)).toThrow(RangeError);
    expect(() => passo(2451545, 'settimana' as UnitaPasso, 1)).toThrow(RangeError);
  });
});
