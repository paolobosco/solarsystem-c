// Affidabilità della posizione (§ 7.8 di docs/PROGETTO.md).
// ε_tot = √(ε_modello² + ε_ΔT²):
// - ε_modello: serie a gradini di reliability.bin (§ 8.7) oppure epsModelloCostante del catalogo
//   (Sole 0, pianeti 2″); NaN se non stimabile;
// - ε_ΔT = ω·σ(ΔT), ω = |r × v|/r² velocità angolare attorno al primario (rad/s), σ(ΔT) del TimeState (s);
//   0 se l'istante è inserito in TT.
// Livelli (§ 7.8.2): precisa ≤ 1′, buona ≤ 1°, approssimata ≤ 10°, indicativa ≤ 90°, altrimenti (o non stimabile,
// o dati assenti) non determinabile.

import type { CorpoCatalogo } from '../data/catalogTypes';
import { valutaAffidabilita } from '../data/reliabilityReader';
import type { DatiAffidabilita, ValoreAffidabilita } from '../data/reliabilityReader';
import type { TimeState } from '../time/types';
import type { Affidabilita, Livello } from './types';

const GRADO = Math.PI / 180;

/** Soglie superiori (rad) dei livelli (§ 7.8.2). */
export const SOGLIE_LIVELLO = {
  precisa: GRADO / 60,
  buona: GRADO,
  approssimata: 10 * GRADO,
  indicativa: 90 * GRADO,
} as const;

/** Livello per l'errore totale (rad); NaN o valori non finiti: non determinabile. */
export function livelloDaErrore(eps: number): Livello {
  if (!(eps >= 0) || !Number.isFinite(eps)) return 'non-determinabile';
  if (eps <= SOGLIE_LIVELLO.precisa) return 'precisa';
  if (eps <= SOGLIE_LIVELLO.buona) return 'buona';
  if (eps <= SOGLIE_LIVELLO.approssimata) return 'approssimata';
  if (eps <= SOGLIE_LIVELLO.indicativa) return 'indicativa';
  return 'non-determinabile';
}

/** ω = |r × v|/r² (rad/s) da posizione (km) e velocità (km/s) relative al primario. */
export function velocitaAngolare(r: ArrayLike<number>, v: ArrayLike<number>, offR = 0, offV = 0): number {
  const x = r[offR]!;
  const y = r[offR + 1]!;
  const z = r[offR + 2]!;
  const vx = v[offV]!;
  const vy = v[offV + 1]!;
  const vz = v[offV + 2]!;
  const hx = y * vz - z * vy;
  const hy = z * vx - x * vz;
  const hz = x * vy - y * vx;
  const r2 = x * x + y * y + z * z;
  return r2 > 0 ? Math.sqrt(hx * hx + hy * hy + hz * hz) / r2 : 0;
}

/** ε_ΔT = ω·σ(ΔT) in rad; 0 se l'istante è inserito in TT. */
export function epsDeltaT(omegaRadS: number, t: TimeState): number {
  return t.scalaIngresso === 'TT' ? 0 : Math.abs(omegaRadS) * t.deltaTSigma;
}

export interface OpzioniAffidabilita {
  /**
   * Livello da usare finché reliability.bin non è caricato, per i corpi senza valore costante; null (predefinito):
   * ε_modello non stimabile e livello 'non-determinabile'.
   */
  livelloInAttesa?: Livello | null;
}

/** Calcolo dell'affidabilità per corpo e istante, senza allocazioni. */
export class ServizioAffidabilita {
  private readonly corpi: readonly CorpoCatalogo[];
  private dati: DatiAffidabilita | null;
  private readonly inAttesa: Livello | null;
  private readonly valore: ValoreAffidabilita = { eps: Number.NaN, formaDeterminata: false, datiPresenti: false };

  constructor(corpi: readonly CorpoCatalogo[], dati: DatiAffidabilita | null = null, opz: OpzioniAffidabilita = {}) {
    this.corpi = corpi;
    this.dati = dati;
    this.inAttesa = opz.livelloInAttesa ?? null;
  }

  impostaDati(dati: DatiAffidabilita | null): void {
    this.dati = dati;
  }

  /** Vero se reliability.bin è caricato. */
  pronto(): boolean {
    return this.dati !== null;
  }

  /** true se il valore per il corpo è definitivo (serie caricata o costante del catalogo). */
  private leggi(ssid: number, jdTT: number): boolean {
    const v = this.valore;
    if (this.dati !== null && valutaAffidabilita(this.dati, ssid, jdTT, v)) return true;
    const c = this.corpi[ssid]?.epsModelloCostante;
    if (c !== null && c !== undefined) {
      v.eps = c;
      v.formaDeterminata = true;
      v.datiPresenti = true;
      return true;
    }
    v.eps = Number.NaN;
    v.formaDeterminata = false;
    v.datiPresenti = this.dati === null; // in attesa del file: non si esclude la presenza dei dati
    return this.dati !== null;
  }

  /** ε_modello (rad) all'istante TDB; NaN se non stimabile. */
  epsModello(ssid: number, jdTT: number): number {
    this.leggi(ssid, jdTT);
    return this.valore.eps;
  }

  /** Forma dell'orbita determinata (§ 7.6.2): disegno a tratteggio dell'orbita anche se il corpo non lo è. */
  formaDeterminata(ssid: number, jdTT: number): boolean {
    this.leggi(ssid, jdTT);
    return this.valore.formaDeterminata;
  }

  /** Dati presenti nel file per l'intervallo (falso dove il corpo è "non determinabile" e non ha segmenti). */
  datiPresenti(ssid: number, jdTT: number): boolean {
    this.leggi(ssid, jdTT);
    return this.valore.datiPresenti;
  }

  /**
   * Affidabilità (§ 7.8) con ω (rad/s) del corpo attorno al primario. Restituisce false se il risultato è
   * provvisorio (reliability.bin non ancora caricato e nessuna costante nel catalogo).
   */
  calcola(ssid: number, t: TimeState, omegaRadS: number, out: Affidabilita): boolean {
    const definitivo = this.leggi(ssid, t.jdTT);
    const v = this.valore;
    out.epsModello = v.eps;
    out.epsDeltaT = epsDeltaT(omegaRadS, t);
    out.epsTotale = Math.hypot(v.eps, out.epsDeltaT);
    if (!definitivo && this.inAttesa !== null) out.livello = this.inAttesa;
    else if (!v.datiPresenti) out.livello = 'non-determinabile';
    else out.livello = livelloDaErrore(out.epsTotale);
    return definitivo;
  }
}
