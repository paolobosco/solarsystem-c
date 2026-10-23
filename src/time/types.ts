// Tipi del modulo tempo (§ 5.4, § 6 di docs/PROGETTO.md).

export type Calendario = 'giuliano' | 'gregoriano';

export interface DataCalendario {
  anno: number; // astronomico (1 a.C. = 0)
  mese: number; // 1..12
  giorno: number; // 1..31
  ora: number;
  minuto: number;
  secondo: number;
  calendario: Calendario; // implicito dalla data: giuliano se JD < 2299160.5
}

/** Era dell'anno storico: 'aC' (avanti Cristo) o 'dC' (dopo Cristo). */
export type Era = 'aC' | 'dC';

/** Anno storico senza anno zero: 1 a.C. = anno astronomico 0 (I2). */
export interface AnnoStorico {
  annoStorico: number; // 1, 2, 3, ...
  era: Era;
}

export type ScalaTempo = 'UT' | 'TT';

export interface TimeState {
  jdUT: number; // JD UT1
  jdTT: number; // JD TT (= TDB, I7)
  deltaT: number; // s
  deltaTSigma: number; // s, 1 sigma (§ 6.5)
  scalaIngresso: ScalaTempo;
}

/** Firma del punto unico di conversione UT/TT (implementato in src/time/timescale.ts). */
export type MakeTimeState = (jd: number, scala: ScalaTempo) => TimeState;

/** 0 = lunedì, ..., 6 = domenica (§ 6.1, T4). */
export type GiornoSettimana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type LimiteIntervallo = 'inferiore' | 'superiore';

/**
 * Codici di validazione. I primi quattro hanno i messaggi del § 11.4.2;
 * gli altri segnalano un campo mancante o non valido.
 */
export type CodiceValidazione =
  | 'ANNO_ZERO'
  | 'RIFORMA_1582'
  | 'GIORNO_INESISTENTE'
  | 'FUORI_INTERVALLO'
  | 'CAMPO_MANCANTE'
  | 'ANNO_NON_VALIDO'
  | 'ERA_NON_VALIDA'
  | 'MESE_NON_VALIDO'
  | 'GIORNO_NON_VALIDO'
  | 'ORA_NON_VALIDA'
  | 'MINUTO_NON_VALIDO'
  | 'SECONDO_NON_VALIDO'
  | 'CALENDARIO_NON_VALIDO'
  | 'CALENDARIO_INCOERENTE';

export type CampoData = 'anno' | 'era' | 'mese' | 'giorno' | 'ora' | 'minuto' | 'secondo' | 'calendario';

/**
 * Ingresso di validaData: i campi di DataCalendario, oppure l'anno storico con l'era
 * al posto dell'anno astronomico (editor della data, § 11.4.1).
 */
export type IngressoData = Partial<DataCalendario> & Partial<AnnoStorico>;

export interface OpzioniValidazione {
  /** Offset orario fisso in minuti: ora inserita = UT + offset. I limiti si applicano dopo la conversione. */
  offsetMinuti?: number;
  /** Limite inferiore incluso nella scala dell'ingresso (predefinito JD_MIN_UT). */
  jdMin?: number;
  /** Limite superiore escluso nella scala dell'ingresso (predefinito JD_MAX_UT_EXCL). */
  jdMaxEscl?: number;
}

export interface EsitoValido {
  valida: true;
  /** Data completa con il calendario applicato, nell'ora inserita (locale se c'è l'offset). */
  data: DataCalendario;
  /** Istante senza offset, nella scala dell'ingresso. */
  jd: number;
}

export interface EsitoNonValido {
  valida: false;
  codice: CodiceValidazione;
  /** Campo da segnalare con aria-invalid, se individuabile. */
  campo: CampoData | null;
  /** GIORNO_INESISTENTE: calendario in cui il giorno non esiste. */
  calendario: Calendario | null;
  /** FUORI_INTERVALLO: limite superato. */
  limite: LimiteIntervallo | null;
  /** RIFORMA_1582: date proposte ("Vai al 4 ottobre", "Vai al 15 ottobre"), con la stessa ora. */
  riforma: { prima: DataCalendario; dopo: DataCalendario } | null;
}

export type EsitoValidazione = EsitoValido | EsitoNonValido;
