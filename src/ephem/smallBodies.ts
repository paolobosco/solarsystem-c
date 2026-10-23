// Effemeridi dei piccoli corpi (§ 7.6, § 8.3, § 8.6 di docs/PROGETTO.md): valutazione dei file
// data/v1/small/bKK.bin (SSSERIE1, tipo 3) ed elementi dell'orbita da disegnare (§ 7.6.5, § 10.2).
// Nessuna estrapolazione: fuori da [T0, T_END) 'fuori-copertura'; blocco non caricato 'caricamento';
// istanti senza segmento (livello non determinabile) 'non-determinabile'. Nessuna allocazione per frame.

import { MU_PICCOLI_CORPI_KM3_S2, GM_BARICENTRI, GM_SOLE, K, UA_KM } from './constants';
import { conicaDaStato } from './equinoctial';
import type { ElementiConica } from './equinoctial';
import type { ElementiOrbita, FormaOrbita, StatoEffemeride } from './types';
import { TIPO_PICCOLI_CORPI, bloccoDi } from '../data/binHeader';
import { leggiSerie } from '../data/serie';
import type { SerieElementi } from '../data/serie';

/**
 * Oltre questa distanza dal Sole (km) si usano elementi baricentrici (§ 7.6.5). La soglia non dipende da e: vicino al
 * Sole lo scarto del Sole dal baricentro (circa 0,005 UA e 13 m/s) altera μ/r e v² più dell'energia di un'orbita quasi
 * parabolica, e la conica baricentrica non descrive il moto.
 */
export const R_BARICENTRICO_KM = 50 * UA_KM;
/** ssid del Sole: primario delle orbite eliocentriche e baricentriche. */
export const SSID_SOLE = 0;

/** μ degli elementi baricentrici: GM del Sole più i nove sistemi planetari di DE441. */
export const MU_BARICENTRICO_KM3_S2 = (() => {
  let s = GM_SOLE;
  for (let i = 1; i <= 9; i++) s += GM_BARICENTRI[i]!;
  return s;
})();

/** Nome del file del blocco k in data/v1/ (ad esempio 'small/b07.bin'). */
export function percorsoBloccoPiccoliCorpi(k: number): string {
  if (!(Number.isInteger(k) && k >= 0 && k < K)) throw new RangeError(`blocco fuori intervallo: ${k}`);
  return `small/b${k < 10 ? '0' : ''}${k}.bin`;
}

// Memoria di lavoro di orbitAt.
const statoLavoro = new Float64Array(6);
const statoLavoroBar = new Float64Array(6);
const conicaLavoro: ElementiConica = {
  q: 0,
  e: 0,
  i: 0,
  nodo: 0,
  argPeri: 0,
  anomaliaVera: 0,
  a: 0,
  anomaliaMedia: 0,
  motoMedio: 0,
  tempoDalPericentro: 0,
};

/** Insieme dei blocchi dei piccoli corpi caricati (fino a 13); il caricamento dei byte è del chiamante. */
export class EffemeridiPiccoliCorpi {
  private readonly blocchi: (SerieElementi | null)[] = new Array<SerieElementi | null>(K).fill(null);

  /** Verifica e registra il file del blocco k (ErroreFormato se non conforme o di un altro blocco). */
  carica(k: number, buf: ArrayBuffer): SerieElementi {
    const s = leggiSerie(buf, TIPO_PICCOLI_CORPI);
    if (s.intestazione.blocco !== k) {
      throw new RangeError(`il file contiene il blocco ${s.intestazione.blocco}, atteso ${k}`);
    }
    this.blocchi[k] = s;
    return s;
  }

  rilascia(k: number): void {
    if (k >= 0 && k < K) this.blocchi[k] = null;
  }

  caricato(k: number): boolean {
    return k >= 0 && k < K && this.blocchi[k] !== null;
  }

  serie(k: number): SerieElementi | null {
    return k >= 0 && k < K ? this.blocchi[k]! : null;
  }

  /**
   * Stato eliocentrico, eclittica J2000: out[0..2] km, out[3..5] km/s.
   * 'fuori-copertura' fuori da [T0, T_END); 'caricamento' se il blocco non è caricato;
   * 'non-determinabile' senza segmento o corpo assente. Con esito diverso da 'ok' out non cambia.
   */
  stateAt(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride {
    const k = bloccoDi(jdTT);
    if (k < 0) return 'fuori-copertura';
    const s = this.blocchi[k];
    if (s === null || s === undefined) return 'caricamento';
    return s.valuta(ssid, jdTT, out);
  }

  /**
   * Elementi dell'orbita da disegnare (§ 10.2), ancorata al corpo. Eliocentrici (μ = GM del Sole);
   * baricentrici se r > 50 UA, a qualsiasi eccentricità (§ 7.6.5): il chiamante passa lo stato baricentrico del Sole
   * (km, km/s, eclittica J2000) e μ = GM del Sole più i sistemi planetari. Senza stato del Sole gli
   * elementi restano eliocentrici. La forma (§ 7.8.2) è quella indicata dal chiamante.
   */
  orbitAt(
    ssid: number,
    jdTT: number,
    soleBaricentrico: ArrayLike<number> | null,
    out: ElementiOrbita,
    forma: FormaOrbita = 'determinata',
  ): StatoEffemeride {
    const esito = this.stateAt(ssid, jdTT, statoLavoro);
    if (esito !== 'ok') return esito;
    elementiOrbitaDaStato(statoLavoro, soleBaricentrico, out, forma);
    return 'ok';
  }
}

/** Elementi da disegnare dallo stato eliocentrico (km, km/s); `stato` non è modificato. */
export function elementiOrbitaDaStato(
  stato: ArrayLike<number>,
  soleBaricentrico: ArrayLike<number> | null,
  out: ElementiOrbita,
  forma: FormaOrbita = 'determinata',
): void {
  const r = Math.hypot(stato[0]!, stato[1]!, stato[2]!);
  out.primario = SSID_SOLE;
  out.baricentrici = false;
  if (r > R_BARICENTRICO_KM && soleBaricentrico !== null) {
    for (let j = 0; j < 6; j++) statoLavoroBar[j] = stato[j]! + soleBaricentrico[j]!;
    conicaDaStato(statoLavoroBar, MU_BARICENTRICO_KM3_S2, conicaLavoro);
    out.baricentrici = true;
  } else {
    conicaDaStato(stato, MU_PICCOLI_CORPI_KM3_S2, conicaLavoro);
  }
  out.q = conicaLavoro.q;
  out.e = conicaLavoro.e;
  out.i = conicaLavoro.i;
  out.nodo = conicaLavoro.nodo;
  out.argPeri = conicaLavoro.argPeri;
  out.anomaliaVera = conicaLavoro.anomaliaVera;
  out.forma = forma;
}

