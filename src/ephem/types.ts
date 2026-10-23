// Contratti del modulo effemeridi (§ 5.4, § 7.8 di docs/PROGETTO.md).
// Posizioni eliocentriche nell'eclittica J2000 (I4); km, km/s, radianti, giorni TDB.

import type { TimeState } from '../time/types';

export type StatoEffemeride = 'ok' | 'caricamento' | 'fuori-copertura' | 'non-determinabile';

export interface EphemerisService {
  /** Stato eliocentrico, eclittica J2000: out[0..2] km, out[3..5] km/s. Sincrono, senza allocazioni, mai estrapolato. */
  stateAt(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride;
  /** Elementi per disegnare l'orbita (§ 10.2): conica relativa al primario, ancorata al corpo. */
  orbitAt(ssid: number, jdTT: number, out: ElementiOrbita): StatoEffemeride;
  /** Affidabilità della posizione (§ 7.8). */
  affidabilita(ssid: number, t: TimeState, out: Affidabilita): void;
  prefetch(jdTT0: number, jdTT1: number, segnale?: AbortSignal): Promise<void>;
  /** Vero se tutti i blocchi necessari sono caricati. */
  pronto(jdTT: number): boolean;
  /**
   * Satelliti: matrice per righe dal sistema F alla data all'eclittica J2000 (§ 7.5.2, § 7.5.4); false se non
   * disponibile. Facoltativo: senza, si usa R_F del catalogo.
   */
  matriceF?(ssid: number, jdTT: number, out: Float64Array): boolean;
}

export type FormaOrbita = 'determinata' | 'indicativa' | 'non-determinata';

export interface ElementiOrbita {
  primario: number; // ssid del corpo attorno a cui si disegna (Sole, pianeta o pianeta nano)
  baricentrici: boolean; // true per corpi lontani (§ 7.6.5)
  q: number; // km
  e: number;
  i: number; // rad, eclittica J2000
  nodo: number; // rad
  argPeri: number; // rad
  anomaliaVera: number; // rad, del corpo all'istante
  forma: FormaOrbita;
}

export type Livello = 'precisa' | 'buona' | 'approssimata' | 'indicativa' | 'non-determinabile';

export interface Affidabilita {
  livello: Livello;
  epsModello: number; // rad
  epsDeltaT: number; // rad (0 se scalaIngresso = 'TT')
  epsTotale: number; // rad
}
