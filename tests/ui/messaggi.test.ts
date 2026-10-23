// Messaggi di validazione e dei limiti (§ 11.4.2, § 11.4.3, criterio A16), testi dell'affidabilità
// (§ 11.8) e della stagione.

import { describe, expect, it } from 'vitest';
import { JD_MAX_UT_EXCL, JD_MIN_UT, JD_ULTIMO_UT, jdToCalendarLocale, validaData } from '../../src/time/calendar';
import type { EsitoNonValido, IngressoData } from '../../src/time/types';
import { SPAZIO_NB, formatData } from '../../src/ui/format';
import {
  DIAMETRO_LUNA_GRADI,
  istanteAlLimite,
  messaggioLimite,
  messaggioValidazione,
  testoAffidabilita,
  testoIntervallo,
  testoStagione,
} from '../../src/ui/messaggi';
import { bloccoDi, fineBlocco, inizioBlocco } from '../../src/data/binHeader';
import { limiteRaggiunto } from '../../src/time/steps';
import { limitiScala } from '../../src/time/timescale';
import { T } from '../../src/ui/testi.it';
import { datiTempo } from '../time/datiTempo';

const NB = SPAZIO_NB;
const RAD = Math.PI / 180;

function errore(d: IngressoData, offsetMinuti: number | null = null): EsitoNonValido {
  const e = validaData(d, { offsetMinuti: offsetMinuti ?? 0 });
  if (e.valida) throw new Error('attesa data non valida');
  return e;
}

function messaggio(d: IngressoData, offsetMinuti: number | null = null) {
  const e = errore(d, offsetMinuti);
  const anno = d.annoStorico !== undefined && d.era !== undefined ? (d.era === 'dC' ? d.annoStorico : 1 - d.annoStorico) : d.anno;
  return messaggioValidazione(e, { giorno: d.giorno, mese: d.mese, anno, offsetMinuti, scala: 'UT' });
}

describe('messaggi di validazione (§ 11.4.2)', () => {
  it('ANNO_ZERO', () => {
    const m = messaggio({ giorno: 1, mese: 1, annoStorico: 0, era: 'aC' });
    expect(m.testo).toBe(`L'anno 0 non esiste: dopo l'1${NB}a.C. viene l'1${NB}d.C.`);
    expect(m.campo).toBe('anno');
  });

  it('GIORNO_INESISTENTE nei due calendari', () => {
    expect(messaggio({ giorno: 29, mese: 2, annoStorico: 1900, era: 'dC' }).testo).toBe(
      'Il 29 febbraio 1900 non esiste nel calendario gregoriano.',
    );
    expect(messaggio({ giorno: 29, mese: 2, annoStorico: 2023, era: 'dC' }).testo).toBe(
      'Il 29 febbraio 2023 non esiste nel calendario gregoriano.',
    );
    expect(messaggio({ giorno: 29, mese: 2, annoStorico: 3, era: 'aC' }).testo).toBe(
      `Il 29 febbraio 3${NB}a.C. non esiste nel calendario giuliano.`,
    );
    expect(messaggio({ giorno: 31, mese: 4, annoStorico: 500, era: 'dC' }).testo).toBe(
      `Il 31 aprile 500${NB}d.C. non esiste nel calendario giuliano.`,
    );
  });

  it('RIFORMA_1582 con le due date proposte e la stessa ora', () => {
    for (let g = 5; g <= 14; g++) {
      const m = messaggio({ giorno: g, mese: 10, annoStorico: 1582, era: 'dC', ora: 9, minuto: 30 });
      expect(m.testo).toBe('Nel 1582 si passò dal 4 al 15 ottobre: i giorni dal 5 al 14 non esistono.');
      expect(m.azioni.map((a) => a.etichetta)).toEqual(['Vai al 4 ottobre', 'Vai al 15 ottobre']);
      expect(m.azioni[0]?.data).toMatchObject({ anno: 1582, mese: 10, giorno: 4, ora: 9, minuto: 30, calendario: 'giuliano' });
      expect(m.azioni[1]?.data).toMatchObject({ anno: 1582, mese: 10, giorno: 15, ora: 9, minuto: 30, calendario: 'gregoriano' });
    }
  });

  it('FUORI_INTERVALLO in UT', () => {
    const t = `Sono disponibili le date dal 1° gennaio 10000${NB}a.C. al 31 dicembre 2120 (UT).`;
    expect(messaggio({ giorno: 1, mese: 1, annoStorico: 2121, era: 'dC' }).testo).toBe(t);
    expect(messaggio({ giorno: 31, mese: 12, annoStorico: 10001, era: 'aC' }).testo).toBe(t);
  });

  it('FUORI_INTERVALLO con UTC+2: limiti applicati in UT dopo la conversione (§ 6.2)', () => {
    // 1° gennaio 10000 a.C. 00:00 in UTC+2 = 31 dicembre 10001 a.C. 22:00 UT: fuori.
    const m = messaggio({ giorno: 1, mese: 1, annoStorico: 10000, era: 'aC', ora: 0, minuto: 0 }, 120);
    expect(m.testo).toBe(
      `Sono disponibili le date dal 1° gennaio 10000${NB}a.C. al 31 dicembre 2120 (UT). ` +
        `In UTC+2: dal 1° gennaio 10000${NB}a.C. alle 02:00 al 1° gennaio 2121 alle 01:59.`,
    );
    // 1° gennaio 10000 a.C. 02:00 in UTC+2 è il limite incluso.
    expect(validaData({ giorno: 1, mese: 1, annoStorico: 10000, era: 'aC', ora: 2, minuto: 0 }, { offsetMinuti: 120 }).valida).toBe(true);
    // 1° gennaio 2121 01:59 in UTC+2 = 31 dicembre 2120 23:59 UT: ammesso.
    expect(validaData({ giorno: 1, mese: 1, annoStorico: 2121, era: 'dC', ora: 1, minuto: 59 }, { offsetMinuti: 120 }).valida).toBe(true);
  });

  it('campi mancanti o non validi', () => {
    expect(messaggio({ mese: 1, annoStorico: 2000, era: 'dC' }).testo).toBe('Inserisci il giorno.');
    expect(messaggio({ giorno: Number.NaN, mese: 1, annoStorico: 2000, era: 'dC' }).testo).toBe('Inserisci un giorno da 1 a 31.');
    expect(messaggio({ giorno: 1, mese: 1, annoStorico: 2000, era: 'dC', ora: 24 }).testo).toBe("Inserisci un'ora da 0 a 23.");
    expect(messaggio({ giorno: 1, mese: 1, annoStorico: 2000, era: 'dC', minuto: 75 }).testo).toBe('Inserisci i minuti da 0 a 59.');
  });

  it('con un offset negativo l’anno 10001 a.C. è ammesso e indicato da istruzioni e messaggio (§ 6.2, § 11.4.1)', () => {
    for (const off of [-15, -60, -720]) {
      const inizio = jdToCalendarLocale(JD_MIN_UT, off);
      // Primo istante dell'intervallo nell'ora dell'offset: 31 dicembre 10001 a.C. (anno astronomico −10000).
      expect(formatData(inizio), `${off} min`).toBe(`31 dicembre 10001${NB}a.C.`);
      const e = validaData(
        { giorno: 31, mese: 12, annoStorico: 10001, era: 'aC', ora: inizio.ora, minuto: inizio.minuto, secondo: 0 },
        { offsetMinuti: off },
      );
      expect(e.valida, `${off} min`).toBe(true);
    }
    expect(T.editor.istruzioni).toContain(`31 dicembre 10001${NB}a.C.`);
    expect(T.validazione.ANNO_NON_VALIDO).toContain(`10001${NB}a.C.`);
  });
});

describe('limiti dei passi (§ 11.4.3)', () => {
  it('limite inferiore con UTC+2, come nell’esempio del progetto', () => {
    expect(messaggioLimite('inferiore', JD_MIN_UT, { offsetMinuti: 120, scala: 'UT' })).toBe(
      `Raggiunto il limite inferiore: 1° gennaio 10000${NB}a.C., 00:00 UT (02:00 in UTC+2)`,
    );
  });

  it('limite superiore, con data locale diversa', () => {
    expect(messaggioLimite('superiore', JD_ULTIMO_UT, { offsetMinuti: null, scala: 'UT' })).toBe(
      'Raggiunto il limite superiore: 31 dicembre 2120, 23:59 UT',
    );
    expect(messaggioLimite('superiore', JD_ULTIMO_UT, { offsetMinuti: 120, scala: 'UT' })).toBe(
      'Raggiunto il limite superiore: 31 dicembre 2120, 23:59 UT (1° gennaio 2121, 01:59 in UTC+2)',
    );
    expect(JD_MAX_UT_EXCL).toBeGreaterThan(JD_ULTIMO_UT);
  });

  it('in TT nessuna ora locale', () => {
    expect(messaggioLimite('inferiore', JD_MIN_UT + 5.07, { offsetMinuti: 120, scala: 'TT' })).toMatch(/^Raggiunto il limite inferiore: 6 gennaio 10000.a\.C\., 01:40 TT$/);
  });
});

describe('avviso del limite coerente con l’istante (§ 6.6, § 11.4.3)', () => {
  const l = { min: JD_MIN_UT, maxEscl: JD_MAX_UT_EXCL };
  it('resta solo al limite segnalato: Inizio e Fine portano al limite opposto e lo tolgono', () => {
    expect(istanteAlLimite('inferiore', JD_MIN_UT, l)).toBe(true);
    expect(istanteAlLimite('superiore', JD_MAX_UT_EXCL - 1 / 86400, l)).toBe(true);
    // Fine dopo il limite inferiore, Inizio dopo il superiore.
    expect(istanteAlLimite('inferiore', JD_MAX_UT_EXCL - 1 / 86400, l)).toBe(false);
    expect(istanteAlLimite('superiore', JD_MIN_UT, l)).toBe(false);
    expect(istanteAlLimite('inferiore', JD_MIN_UT + 1, l)).toBe(false);
    expect(istanteAlLimite('superiore', JD_MAX_UT_EXCL - 2, l)).toBe(false);
  });

  it('stessa soglia di limiteRaggiunto (src/time/steps.ts), in UT e in TT, anche a pochi ULP dal limite (§ 6.6)', () => {
    const scale = { UT: limitiScala(datiTempo().deltaT, 'UT'), TT: limitiScala(datiTempo().deltaT, 'TT') };
    // Scarti dal limite: dal passo di un giorno a quello di un ULP del JD (circa 2,3e-10 d), da una parte e dall'altra.
    const scarti = [0, 1e-12, 1e-10, 2.4e-10, 5e-10, 7e-10, 1e-9, 1.5e-9, 2e-9, 1e-6, 1e-3, 1];
    for (const [nome, lim] of Object.entries(scale)) {
      const ultimo = lim.maxEscl - 1 / 86_400;
      for (const base of [lim.min, ultimo]) {
        for (const scarto of scarti) {
          for (const jd of [base + scarto, base - scarto]) {
            const al = limiteRaggiunto(jd, { jdMin: lim.min, jdMaxEscl: lim.maxEscl });
            for (const limite of ['inferiore', 'superiore'] as const) {
              expect(istanteAlLimite(limite, jd, lim), `${nome} ${limite} ${jd - base} d dal limite`).toBe(al === limite);
            }
          }
        }
      }
    }
  });

  it('solo l\'istante esatto del limite lo segnala: nessuna tolleranza propria', () => {
    for (const lim of [limitiScala(datiTempo().deltaT, 'UT'), limitiScala(datiTempo().deltaT, 'TT')]) {
      const ultimo = lim.maxEscl - 1 / 86_400;
      expect(istanteAlLimite('inferiore', lim.min, lim)).toBe(true);
      expect(istanteAlLimite('superiore', ultimo, lim)).toBe(true);
      expect(istanteAlLimite('inferiore', lim.min + 5e-10, lim)).toBe(false);
      expect(istanteAlLimite('superiore', ultimo - 5e-10, lim)).toBe(false);
    }
  });
});

describe('affidabilità (§ 11.8) e stagione', () => {
  const aff = (livello: 'precisa' | 'buona' | 'approssimata' | 'indicativa' | 'non-determinabile', gradi: number) => ({
    livello,
    epsTotale: gradi * RAD,
  });

  it('testi per livello', () => {
    expect(testoAffidabilita(aff('precisa', 0.0005), 'DE441 (Park et al. 2021)', 'determinata')).toBe(
      'Posizione da DE441 (Park et al. 2021), errore stimato inferiore a 1′.',
    );
    expect(testoAffidabilita(aff('buona', 0.8), '', 'determinata')).toBe(
      `Errore stimato fino a 0,80°, circa ${(0.8 / DIAMETRO_LUNA_GRADI).toFixed(1).replace('.', ',')} volte il diametro apparente della Luna piena.`,
    );
    expect(testoAffidabilita(aff('approssimata', 4.2), '', 'determinata')).toBe("La posizione lungo l'orbita può differire di 4,2°.");
    expect(testoAffidabilita(aff('indicativa', 40), '', 'determinata')).toBe(
      "La forma dell'orbita è attendibile, la posizione lungo l'orbita no.",
    );
    expect(testoAffidabilita(aff('non-determinabile', 200), '', 'determinata')).toBe('Posizione non determinabile a questa data.');
    expect(testoAffidabilita(aff('non-determinabile', 200), '', 'non-determinata')).toBe(
      'Posizione non determinabile a questa data. Orbita non determinabile.',
    );
  });

  it('diametro apparente medio della Luna circa 0,518°', () => {
    expect(DIAMETRO_LUNA_GRADI).toBeCloseTo(0.518, 3);
  });

  it('stagione dai codici', () => {
    expect(testoStagione({ stagione: 'primavera', evento: 'equinozio', giorniDopo: 12 })).toBe(
      "Primavera boreale, 12 giorni dopo l'equinozio",
    );
    expect(testoStagione({ stagione: 'estate', evento: 'solstizio', giorniDopo: 1 })).toBe('Estate boreale, 1 giorno dopo il solstizio');
    // 24 h dall'istante coprono due giorni di calendario: con 0 giorni interi il testo descrive il tempo trascorso
    expect(testoStagione({ stagione: 'inverno', evento: 'solstizio', giorniDopo: 0 })).toBe('Inverno boreale, meno di un giorno dopo il solstizio');
    expect(testoStagione({ stagione: 'primavera', evento: 'equinozio', giorniDopo: 0 })).toBe(
      "Primavera boreale, meno di un giorno dopo l'equinozio",
    );
    expect(testoStagione({ stagione: 'primavera', evento: 'equinozio', giorniDopo: 0.4 })).toBe(
      "Primavera boreale, meno di un giorno dopo l'equinozio",
    );
  });
});

describe('affidabilità e limiti: casi di confine', () => {
  it('"buona" con errore piccolo: nessun "0,0 volte" (Luna con ε di 1′)', () => {
    const t = testoAffidabilita({ livello: 'buona', epsTotale: (60.02 / 3600) * RAD }, 'x', 'determinata');
    expect(t).toBe('Errore stimato fino a 0,02°, meno di un decimo del diametro apparente della Luna piena.');
    const fobos = testoAffidabilita({ livello: 'buona', epsTotale: 0.13 * RAD }, 'x', 'determinata');
    expect(fobos).toBe('Errore stimato fino a 0,13°, circa 0,3 volte il diametro apparente della Luna piena.');
  });

  it('"indicativa" con la forma dell’orbita non determinata non la dichiara attendibile', () => {
    const t = testoAffidabilita({ livello: 'indicativa', epsTotale: 30 * RAD }, 'x', 'non-determinata');
    expect(t).not.toContain('attendibile, la posizione');
    expect(t).toBe("La posizione lungo l'orbita non è attendibile e la forma dell'orbita è incerta.");
  });

  it('ingresso in TT: il primo istante annunciato è accettato dall’editor (minuti interi)', () => {
    const lim = limitiScala(datiTempo().deltaT, 'TT');
    const ingresso = (ora: number, minuto: number) =>
      validaData({ giorno: 6, mese: 1, annoStorico: 10000, era: 'aC', ora, minuto, secondo: 0 }, { offsetMinuti: 0, jdMin: lim.min, jdMaxEscl: lim.maxEscl });
    const e = ingresso(1, 46);
    expect(e.valida).toBe(false);
    if (e.valida) return;
    const m = messaggioValidazione(e, { giorno: 6, mese: 1, anno: -9999, offsetMinuti: null, scala: 'TT', jdMin: lim.min, jdMaxEscl: lim.maxEscl });
    expect(m.testo).toContain(`In TT: dal 6 gennaio 10000${NB}a.C. alle 01:47 al 1° gennaio 2121 alle 00:01.`);
    expect(ingresso(1, 47).valida).toBe(true);
  });

  it('periodo dei blocchi ai confini limitato all’intervallo ammesso (I2)', () => {
    expect(testoIntervallo(inizioBlocco(0), fineBlocco(0))).toBe(`il periodo 10000${NB}a.C.-9000${NB}a.C.`);
    const ultimo = bloccoDi(JD_MAX_UT_EXCL - 10);
    expect(testoIntervallo(inizioBlocco(ultimo), fineBlocco(ultimo))).toBe('il periodo 2011-2120');
    expect(testoIntervallo(inizioBlocco(10), fineBlocco(10))).toBe(`il periodo 9${NB}d.C.-1010`);
    expect(testoIntervallo(JD_MIN_UT, JD_ULTIMO_UT)).toBe(`il periodo 10000${NB}a.C.-2120`);
  });
});
