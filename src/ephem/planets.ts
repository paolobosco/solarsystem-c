// Pianeti, Plutone e baricentro Terra-Luna (§ 7.3 di docs/PROGETTO.md) dai file planets/pKK.bin (§ 8.3).
// Stati eliocentrici dei baricentri dei sistemi (NAIF 1-9) nell'eclittica J2000, km e km/s, valutati
// con src/data/serie.ts; un file per blocco (§ 8.1). Nessuna allocazione nella valutazione.

import { bloccoDi, inizioBlocco, fineBlocco, TIPO_PIANETI } from '../data/binHeader';
import { leggiSerie } from '../data/serie';
import type { SerieElementi } from '../data/serie';
import { K, SSID_BARICENTRO_TERRA_LUNA } from './constants';
import type { Scrivibile } from './equinoctial';
import type { StatoEffemeride } from './types';

/**
 * ssid usati nei file dei pianeti (scripts/pipeline/bodies.json): 1-8 e 10 indicano il baricentro del
 * sistema del pianeta (NAIF 1-9, Plutone = 10), 200 il baricentro Terra-Luna (NAIF 3).
 */
export const SSID_FILE_PIANETI = {
  mercurio: 1,
  venere: 2,
  baricentroTerraLuna: SSID_BARICENTRO_TERRA_LUNA,
  marte: 4,
  giove: 5,
  saturno: 6,
  urano: 7,
  nettuno: 8,
  plutone: 10,
} as const;

/** Codice NAIF del baricentro DE441 per ssid del file. */
export const NAIF_PER_SSID_FILE: Readonly<Record<number, number>> = {
  1: 1,
  2: 2,
  [SSID_BARICENTRO_TERRA_LUNA]: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  10: 9,
};

/** Percorso relativo in data/v1/ del file del blocco k. */
export function percorsoBloccoPianeti(k: number): string {
  if (!(Number.isInteger(k) && k >= 0 && k < K)) throw new RangeError(`blocco fuori intervallo: ${k}`);
  return `planets/p${k < 10 ? '0' : ''}${k}.bin`;
}

/** Blocchi caricati dei pianeti e valutazione degli stati eliocentrici. */
export class EffemeridiPianeti {
  private readonly blocchi: (SerieElementi | null)[] = new Array<SerieElementi | null>(K).fill(null);

  /** Legge, verifica e registra un file pKK.bin; restituisce l'indice di blocco. */
  carica(buf: ArrayBuffer): number {
    return this.aggiungi(leggiSerie(buf, TIPO_PIANETI));
  }

  /** Registra una serie già letta (tipo 1, blocco 0..K-1). */
  aggiungi(serie: SerieElementi): number {
    const i = serie.intestazione;
    const k = i.blocco;
    if (i.tipo !== TIPO_PIANETI || !(k >= 0 && k < K)) throw new RangeError('serie non di un blocco dei pianeti');
    if (i.inizio !== inizioBlocco(k) || i.fine !== fineBlocco(k)) throw new RangeError('nucleo del blocco non conforme');
    this.blocchi[k] = serie;
    return k;
  }

  rimuovi(k: number): void {
    if (k >= 0 && k < K) this.blocchi[k] = null;
  }

  /** Serie del blocco k, null se non caricata. */
  serie(k: number): SerieElementi | null {
    return k >= 0 && k < K ? (this.blocchi[k] ?? null) : null;
  }

  haBlocco(k: number): boolean {
    return k >= 0 && k < K && this.blocchi[k] !== null;
  }

  /** Vero se il blocco che contiene jdTT è caricato. */
  pronto(jdTT: number): boolean {
    const k = bloccoDi(jdTT);
    return k >= 0 && this.blocchi[k] !== null;
  }

  /**
   * Stato eliocentrico del corpo con ssid del file (SSID_FILE_PIANETI) a jdTT (JD TDB) in out[0..5].
   * Esiti: 'fuori-copertura' fuori da [T0, T_END), 'caricamento' se il blocco non è caricato,
   * 'non-determinabile' se il corpo manca dal file. Se l'esito non è 'ok' out non è modificato.
   */
  stato(ssidFile: number, jdTT: number, out: Scrivibile): StatoEffemeride {
    const k = bloccoDi(jdTT);
    if (k < 0) return 'fuori-copertura';
    const s = this.blocchi[k];
    if (s === null || s === undefined) return 'caricamento';
    return s.valuta(ssidFile, jdTT, out);
  }
}
