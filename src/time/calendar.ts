// Calendario e giorno giuliano (§ 6.1, § 6.2 di docs/PROGETTO.md).
// Algoritmo: J. Meeus, Astronomical Algorithms, 2a ed. (1998), cap. 7, con parte intera
// per difetto (Math.floor) in tutte le divisioni, valido anche per JD negativi (T1).
// Le costanti decimali di Meeus sono sostituite da forme razionali equivalenti, esatte
// in doppia precisione: 365,25 = 1461/4; INT(30,6001·x) = floor(153·x/5) per x = 4..15;
// INT(x/30,6001) = floor((5·x - 1)/153) per x intero; (x - 1867216,25)/36524,25 =
// (4·x - 7468865)/146097; (x - 122,1)/365,25 = (100·x - 12210)/36525.

import type {
  AnnoStorico,
  Calendario,
  CampoData,
  CodiceValidazione,
  DataCalendario,
  Era,
  EsitoNonValido,
  EsitoValidazione,
  GiornoSettimana,
  IngressoData,
  OpzioniValidazione,
} from './types';

const SECONDI_GIORNO = 86400;
const MS_GIORNO = 86_400_000;
const MS_ORA = 3_600_000;
const MS_MINUTO = 60_000;

/** Giorno della riforma gregoriana: 15 ottobre 1582 (bolla Inter gravissimas, 1582). */
const RIFORMA = { anno: 1582, mese: 10, primoGregoriano: 15, ultimoGiuliano: 4 } as const;

function divInt(a: number, b: number): number {
  return Math.floor(a / b);
}

function modPos(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

/** JD delle 0h del giorno indicato (Meeus, eq. 7.1). Il giorno può avere parte frazionaria. */
function jdInizioGiorno(anno: number, mese: number, giorno: number, calendario: Calendario): number {
  // Normalizzazione del mese fuori da 1..12.
  let y = anno + divInt(mese - 1, 12);
  let m = modPos(mese - 1, 12) + 1;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  let b = 0;
  if (calendario === 'gregoriano') {
    const a = divInt(y, 100);
    b = 2 - a + divInt(a, 4);
  }
  return divInt(1461 * (y + 4716), 4) + divInt(153 * (m + 1), 5) + giorno + b - 1524.5;
}

/** Anno, mese e giorno dal numero intero Z = floor(JD + 0,5) (Meeus, cap. 7, conversione inversa). */
function campiDaGiorno(z: number, calendario: Calendario): { anno: number; mese: number; giorno: number } {
  let a = z;
  if (calendario === 'gregoriano') {
    const alfa = divInt(4 * z - 7468865, 146097);
    a = z + 1 + alfa - divInt(alfa, 4);
  }
  const b = a + 1524;
  const c = divInt(100 * b - 12210, 36525);
  const d = divInt(1461 * c, 4);
  const e = divInt(5 * (b - d) - 1, 153);
  const giorno = b - d - divInt(153 * e, 5);
  const mese = e < 14 ? e - 1 : e - 13;
  const anno = mese > 2 ? c - 4716 : c - 4715;
  return { anno, mese, giorno };
}

/** 15 ottobre 1582 gregoriano: primo giorno del calendario gregoriano (T2). */
export const JD_RIFORMA_GREGORIANA: number = jdInizioGiorno(RIFORMA.anno, RIFORMA.mese, RIFORMA.primoGregoriano, 'gregoriano');

const Z_RIFORMA = JD_RIFORMA_GREGORIANA + 0.5;

function secondiDelGiorno(d: Pick<DataCalendario, 'ora' | 'minuto' | 'secondo'>): number {
  return d.ora * 3600 + d.minuto * 60 + d.secondo;
}

/** JD dalla data; il calendario è quello indicato nella data. Parte intera per difetto (T1). */
export function calendarToJd(d: DataCalendario): number {
  return jdInizioGiorno(d.anno, d.mese, d.giorno, d.calendario) + secondiDelGiorno(d) / SECONDI_GIORNO;
}

/** JD (UT) da una data espressa nell'ora con offset fisso: ora inserita = UT + offset. */
export function calendarLocaleToJd(d: DataCalendario, offsetMinuti: number): number {
  return jdInizioGiorno(d.anno, d.mese, d.giorno, d.calendario) + (secondiDelGiorno(d) - offsetMinuti * 60) / SECONDI_GIORNO;
}

/**
 * Scompone il JD in giorno intero e millisecondi del giorno. La risoluzione di 1 ms supera
 * la precisione del JD in doppia precisione nell'intervallo (circa 40 µs) e rende esatte
 * le andate e ritorno con secondi interi o millesimi.
 */
function scomponi(jd: number, offsetMs: number): { z: number; ms: number } {
  if (!Number.isFinite(jd)) throw new RangeError(`JD non finito: ${jd}`);
  const x = jd + 0.5;
  let z = Math.floor(x);
  let ms = Math.round((x - z) * MS_GIORNO) + offsetMs;
  const riporto = divInt(ms, MS_GIORNO);
  z += riporto;
  ms -= riporto * MS_GIORNO;
  return { z, ms };
}

function componi(z: number, ms: number, calendario: Calendario): DataCalendario {
  const { anno, mese, giorno } = campiDaGiorno(z, calendario);
  const ora = divInt(ms, MS_ORA);
  const resto = ms - ora * MS_ORA;
  const minuto = divInt(resto, MS_MINUTO);
  const secondo = (resto - minuto * MS_MINUTO) / 1000;
  return { anno, mese, giorno, ora, minuto, secondo, calendario };
}

function calendarioDaGiorno(z: number): Calendario {
  return z < Z_RIFORMA ? 'giuliano' : 'gregoriano';
}

/** Data dal JD con il calendario applicato: giuliano se JD < 2299160,5, gregoriano altrimenti (T2). */
export function jdToCalendar(jd: number): DataCalendario {
  const { z, ms } = scomponi(jd, 0);
  return componi(z, ms, calendarioDaGiorno(z));
}

function offsetMs(offsetMinuti: number): number {
  if (!Number.isFinite(offsetMinuti)) throw new RangeError(`Offset non finito: ${offsetMinuti}`);
  return Math.round(offsetMinuti * MS_MINUTO);
}

/** Data nell'ora con offset fisso (ora mostrata = UT + offset); calendario applicato alla data mostrata. */
export function jdToCalendarLocale(jd: number, offsetMinuti: number): DataCalendario {
  const { z, ms } = scomponi(jd, offsetMs(offsetMinuti));
  return componi(z, ms, calendarioDaGiorno(z));
}

/**
 * Data nel calendario gregoriano prolettico, per qualunque JD (riga secondaria, § 11.4.1), nell'ora con offset fisso:
 * stesso giorno della data di jdToCalendarLocale.
 */
export function jdToProlepticGregorian(jd: number, offsetMinuti = 0): DataCalendario {
  const { z, ms } = scomponi(jd, offsetMs(offsetMinuti));
  return componi(z, ms, 'gregoriano');
}

/** Bisestile (T3): giuliano, anni astronomici divisibili per 4; gregoriano, regola standard. */
export function bisestile(anno: number, calendario: Calendario): boolean {
  if (calendario === 'giuliano') return modPos(anno, 4) === 0;
  return (modPos(anno, 4) === 0 && modPos(anno, 100) !== 0) || modPos(anno, 400) === 0;
}

const GIORNI_MESE = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function giorniNelMese(anno: number, mese: number, calendario: Calendario): number {
  if (mese === 2) return bisestile(anno, calendario) ? 29 : 28;
  const n = GIORNI_MESE[mese - 1];
  if (n === undefined) throw new RangeError(`Mese non valido: ${mese}`);
  return n;
}

/**
 * Calendario applicato a una data (T2): giuliano prima del 5 ottobre 1582, gregoriano dal
 * 15 ottobre 1582; null per i giorni 5-14 ottobre 1582, che non esistono.
 */
export function calendarioApplicato(anno: number, mese: number, giorno: number): Calendario | null {
  if (anno !== RIFORMA.anno) return anno < RIFORMA.anno ? 'giuliano' : 'gregoriano';
  if (mese !== RIFORMA.mese) return mese < RIFORMA.mese ? 'giuliano' : 'gregoriano';
  if (giorno <= RIFORMA.ultimoGiuliano) return 'giuliano';
  if (giorno >= RIFORMA.primoGregoriano) return 'gregoriano';
  return null;
}

/** Ultimo giorno del mese nel calendario applicato; ottobre 1582 termina il 31 (gregoriano). */
export function giorniNelMeseApplicato(anno: number, mese: number): number {
  const calendario = calendarioApplicato(anno, mese, 1) ?? 'gregoriano';
  return giorniNelMese(anno, mese, calendario);
}

/** Vero per i giorni 5-14 ottobre 1582. */
export function inRiforma1582(anno: number, mese: number, giorno: number): boolean {
  return anno === RIFORMA.anno && mese === RIFORMA.mese && giorno > RIFORMA.ultimoGiuliano && giorno < RIFORMA.primoGregoriano;
}

/** Giorno della settimana (T4): ((floor(JD + 0,5) mod 7) + 7) mod 7, 0 = lunedì. */
export function giornoSettimana(jd: number): GiornoSettimana {
  return (((Math.floor(jd + 0.5) % 7) + 7) % 7) as GiornoSettimana;
}

/**
 * Giorno della settimana (T4) della data mostrata da jdToCalendarLocale: stesso arrotondamento al millisecondo, nell'ora
 * con offset fisso. Dal JD grezzo, un istante pochi µs prima della mezzanotte (passi di ora e di minuto, la cui somma
 * non è esatta in doppia precisione) darebbe il giorno precedente a quello mostrato.
 */
export function giornoSettimanaLocale(jd: number, offsetMinuti: number): GiornoSettimana {
  return giornoSettimana(scomponi(jd, offsetMs(offsetMinuti)).z - 0.5);
}

/** Anno astronomico dall'anno storico (I2): 1 a.C. = 0, N a.C. = 1 - N. */
export function annoAstronomicoDaStorico(annoStorico: number, era: Era): number {
  return era === 'dC' ? annoStorico : 1 - annoStorico;
}

/** Anno storico con era dall'anno astronomico: 0 = 1 a.C., -9999 = 10000 a.C. */
export function annoStoricoDaAstronomico(anno: number): AnnoStorico {
  return anno >= 1 ? { annoStorico: anno, era: 'dC' } : { annoStorico: 1 - anno, era: 'aC' };
}

/** Limite inferiore incluso: 1° gennaio 10000 a.C. (anno -9999) 00:00 UT, giuliano (I2). */
export const JD_MIN_UT: number = calendarToJd({ anno: -9999, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'giuliano' });

/** Limite superiore escluso: 1° gennaio 2121 00:00 UT, gregoriano (I2). */
export const JD_MAX_UT_EXCL: number = calendarToJd({ anno: 2121, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'gregoriano' });

/** Ultimo istante ammesso: 31 dicembre 2120 23:59:59 UT (I2). */
export const JD_ULTIMO_UT: number = JD_MAX_UT_EXCL - 1 / SECONDI_GIORNO;

function nonValida(codice: CodiceValidazione, campo: CampoData | null, extra: Partial<EsitoNonValido> = {}): EsitoNonValido {
  return { valida: false, codice, campo, calendario: null, limite: null, riforma: null, ...extra };
}

function intero(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

/** Oltre questo valore assoluto l'anno è fuori intervallo senza calcolare il JD. */
const ANNO_ASSOLUTO_MAX = 1_000_000;

/**
 * Valida una data inserita (§ 11.4.2). Ora, minuto e secondo mancanti valgono 0.
 * Il calendario, se presente, deve coincidere con quello applicato (T2).
 * I limiti si applicano all'istante senza offset (§ 6.2).
 */
export function validaData(d: IngressoData, opzioni: OpzioniValidazione = {}): EsitoValidazione {
  const offset = opzioni.offsetMinuti ?? 0;
  if (!Number.isFinite(offset)) throw new RangeError(`Offset non finito: ${offset}`);
  const jdMin = opzioni.jdMin ?? JD_MIN_UT;
  const jdMaxEscl = opzioni.jdMaxEscl ?? JD_MAX_UT_EXCL;

  let anno: number;
  if (d.annoStorico !== undefined || d.era !== undefined) {
    if (d.annoStorico === undefined) return nonValida('CAMPO_MANCANTE', 'anno');
    if (d.era === undefined) return nonValida('CAMPO_MANCANTE', 'era');
    if (d.era !== 'aC' && d.era !== 'dC') return nonValida('ERA_NON_VALIDA', 'era');
    if (!intero(d.annoStorico) || d.annoStorico < 0) return nonValida('ANNO_NON_VALIDO', 'anno');
    if (d.annoStorico === 0) return nonValida('ANNO_ZERO', 'anno');
    anno = annoAstronomicoDaStorico(d.annoStorico, d.era);
    if (d.anno !== undefined && d.anno !== anno) return nonValida('ANNO_NON_VALIDO', 'anno');
  } else {
    if (d.anno === undefined) return nonValida('CAMPO_MANCANTE', 'anno');
    if (!intero(d.anno)) return nonValida('ANNO_NON_VALIDO', 'anno');
    anno = d.anno;
  }

  if (d.mese === undefined) return nonValida('CAMPO_MANCANTE', 'mese');
  if (!intero(d.mese) || d.mese < 1 || d.mese > 12) return nonValida('MESE_NON_VALIDO', 'mese');
  const mese = d.mese;

  if (d.giorno === undefined) return nonValida('CAMPO_MANCANTE', 'giorno');
  if (!intero(d.giorno) || d.giorno < 1 || d.giorno > 31) return nonValida('GIORNO_NON_VALIDO', 'giorno');
  const giorno = d.giorno;

  const ora = d.ora ?? 0;
  if (!intero(ora) || ora < 0 || ora > 23) return nonValida('ORA_NON_VALIDA', 'ora');
  const minuto = d.minuto ?? 0;
  if (!intero(minuto) || minuto < 0 || minuto > 59) return nonValida('MINUTO_NON_VALIDO', 'minuto');
  const secondo = d.secondo ?? 0;
  if (typeof secondo !== 'number' || !Number.isFinite(secondo) || secondo < 0 || secondo >= 60) {
    return nonValida('SECONDO_NON_VALIDO', 'secondo');
  }

  if (d.calendario !== undefined && d.calendario !== 'giuliano' && d.calendario !== 'gregoriano') {
    return nonValida('CALENDARIO_NON_VALIDO', 'calendario');
  }

  const calendario = calendarioApplicato(anno, mese, giorno);
  if (calendario === null) {
    const orario = { ora, minuto, secondo };
    return nonValida('RIFORMA_1582', 'giorno', {
      riforma: {
        prima: { anno, mese, giorno: RIFORMA.ultimoGiuliano, ...orario, calendario: 'giuliano' },
        dopo: { anno, mese, giorno: RIFORMA.primoGregoriano, ...orario, calendario: 'gregoriano' },
      },
    });
  }
  if (d.calendario !== undefined && d.calendario !== calendario) return nonValida('CALENDARIO_INCOERENTE', 'calendario');

  if (giorno > giorniNelMese(anno, mese, calendario)) return nonValida('GIORNO_INESISTENTE', 'giorno', { calendario });

  if (Math.abs(anno) > ANNO_ASSOLUTO_MAX) {
    return nonValida('FUORI_INTERVALLO', 'anno', { limite: anno < 0 ? 'inferiore' : 'superiore' });
  }
  const data: DataCalendario = { anno, mese, giorno, ora, minuto, secondo, calendario };
  const jd = calendarLocaleToJd(data, offset);
  if (jd < jdMin) return nonValida('FUORI_INTERVALLO', 'anno', { limite: 'inferiore' });
  if (jd >= jdMaxEscl) return nonValida('FUORI_INTERVALLO', 'anno', { limite: 'superiore' });
  return { valida: true, data, jd };
}
