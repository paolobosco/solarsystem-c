// Passi temporali (§ 6.6, § 11.4.3 di docs/PROGETTO.md).
// Minuto, ora, giorno: somma al JD. Mese, anno, secolo, millennio: aritmetica di calendario
// sugli anni astronomici, nell'ora mostrata (con offset fisso, se attivo).

import {
  JD_MAX_UT_EXCL,
  JD_MIN_UT,
  calendarLocaleToJd,
  calendarioApplicato,
  giorniNelMeseApplicato,
  jdToCalendarLocale,
} from './calendar';
import type { DataCalendario, LimiteIntervallo } from './types';

export type UnitaPasso = 'minuto' | 'ora' | 'giorno' | 'mese' | 'anno' | 'secolo' | 'millennio';

/** Unità in ordine crescente (PagSu passa all'unità successiva, § 11.4.3). */
export const UNITA_PASSO: readonly UnitaPasso[] = ['minuto', 'ora', 'giorno', 'mese', 'anno', 'secolo', 'millennio'];

/** Divisore del giorno per le unità sommate al JD. */
const DIVISORE_GIORNO: Partial<Record<UnitaPasso, number>> = { minuto: 1440, ora: 24, giorno: 1 };

/**
 * Risoluzione della data mostrata (jdToCalendarLocale arrotonda al millisecondo), in giorni: un risultato di calendario
 * entro questa distanza da un limite è, per la data mostrata, il limite stesso.
 */
const RISOLUZIONE_DATA = 1 / 86_400_000;

/** Numero di mesi per le unità di calendario. */
const MESI: Partial<Record<UnitaPasso, number>> = { mese: 1, anno: 12, secolo: 1200, millennio: 12000 };

export interface OpzioniPasso {
  /** Offset orario fisso in minuti (ora mostrata = UT + offset). Influisce solo sull'aritmetica di calendario. */
  offsetMinuti?: number;
  /** Limite inferiore incluso (predefinito JD_MIN_UT). */
  jdMin?: number;
  /** Limite superiore escluso (predefinito JD_MAX_UT_EXCL); l'ultimo istante ammesso è un secondo prima. */
  jdMaxEscl?: number;
}

export interface EsitoPasso {
  /** Nuovo istante, sempre nell'intervallo. */
  jd: number;
  /** Limite raggiunto dal nuovo istante; il passo si è fermato al limite invece di superarlo. */
  limite: LimiteIntervallo | null;
  /** Vero se l'istante non è cambiato (passo verso un limite già raggiunto). */
  fermo: boolean;
}

/**
 * Somma n mesi a una data con aritmetica di calendario (§ 6.6): il giorno si riduce all'ultimo
 * valido del mese; una data tra il 5 e il 14 ottobre 1582 diventa il 15 ottobre se n > 0,
 * il 4 ottobre se n < 0. L'ora resta invariata. Gli anni sono astronomici: 0 + 12 mesi = 1.
 */
export function aggiungiMesi(d: DataCalendario, n: number): DataCalendario {
  const totale = d.anno * 12 + (d.mese - 1) + n;
  const anno = Math.floor(totale / 12);
  const mese = totale - anno * 12 + 1;
  let giorno = Math.min(d.giorno, giorniNelMeseApplicato(anno, mese));
  let calendario = calendarioApplicato(anno, mese, giorno);
  if (calendario === null) {
    giorno = n > 0 ? 15 : 4;
    calendario = n > 0 ? 'gregoriano' : 'giuliano';
  }
  return { anno, mese, giorno, ora: d.ora, minuto: d.minuto, secondo: d.secondo, calendario };
}

function limiteDi(jd: number, jdMin: number, jdUltimo: number): LimiteIntervallo | null {
  if (jd <= jdMin) return 'inferiore';
  if (jd >= jdUltimo) return 'superiore';
  return null;
}

/**
 * Esegue n passi dell'unità indicata (n intero non nullo, negativo all'indietro).
 * Ai limiti il passo si ferma: l'istante resta nell'intervallo e l'esito segnala il limite.
 */
export function passo(jd: number, unita: UnitaPasso, n: number, opzioni: OpzioniPasso = {}): EsitoPasso {
  if (!Number.isInteger(n) || n === 0) throw new RangeError(`Numero di passi non valido: ${n}`);
  if (!Number.isFinite(jd)) throw new RangeError(`JD non finito: ${jd}`);
  const offset = opzioni.offsetMinuti ?? 0;
  const jdMin = opzioni.jdMin ?? JD_MIN_UT;
  const jdMaxEscl = opzioni.jdMaxEscl ?? JD_MAX_UT_EXCL;
  const jdUltimo = jdMaxEscl - 1 / 86400;

  const divisore = DIVISORE_GIORNO[unita];
  let nuovo: number;
  if (divisore !== undefined) {
    nuovo = jd + n / divisore;
  } else {
    const mesi = MESI[unita];
    if (mesi === undefined) throw new RangeError(`Unità non valida: ${String(unita)}`);
    const data = aggiungiMesi(jdToCalendarLocale(jd, offset), n * mesi);
    nuovo = calendarLocaleToJd(data, offset);
    // Un limite fuori dalla griglia del millisecondo (il limite in TT) torna dall'andata e ritorno con uno scarto
    // di decine di microsecondi: lo si porta al limite, così messaggio e pulsante disattivato scattano subito (§ 6.6).
    if (Math.abs(nuovo - jdMin) < RISOLUZIONE_DATA) nuovo = jdMin;
    else if (Math.abs(nuovo - jdUltimo) < RISOLUZIONE_DATA) nuovo = jdUltimo;
  }

  if (nuovo < jdMin) {
    return { jd: jdMin, limite: 'inferiore', fermo: jd === jdMin };
  }
  if (nuovo > jdUltimo) {
    // Un istante già oltre l'ultimo secondo ma ancora ammesso non arretra.
    const finale = jd > jdUltimo && jd < jdMaxEscl ? jd : jdUltimo;
    return { jd: finale, limite: 'superiore', fermo: finale === jd };
  }
  return { jd: nuovo, limite: limiteDi(nuovo, jdMin, jdUltimo), fermo: nuovo === jd };
}

/** Limite già raggiunto da un istante: serve a disattivare (aria-disabled) i pulsanti di passo. */
export function limiteRaggiunto(jd: number, opzioni: Pick<OpzioniPasso, 'jdMin' | 'jdMaxEscl'> = {}): LimiteIntervallo | null {
  const jdMin = opzioni.jdMin ?? JD_MIN_UT;
  const jdMaxEscl = opzioni.jdMaxEscl ?? JD_MAX_UT_EXCL;
  return limiteDi(jd, jdMin, jdMaxEscl - 1 / 86400);
}
