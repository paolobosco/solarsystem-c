// Scale di tempo (§ 5.4, § 6.2, § 6.3 di docs/PROGETTO.md): unico punto di conversione UT1 ↔ TT.
// TT = UT1 + ΔT; TDB = TT (I7). Con ingresso in TT, UT1 si ottiene risolvendo jdUT + ΔT(jdUT)/86 400 = jdTT
// con l'iterazione di punto fisso di scripts/pipeline/time_model.py (ut_da_tt).

import { JD_MAX_UT_EXCL, JD_MIN_UT } from './calendar';
import { deltaT, sigmaDeltaT } from './deltaT';
import type { DatiDeltaT } from './deltaT';
import type { MakeTimeState, ScalaTempo, TimeState } from './types';

export const SECONDI_GIORNO = 86_400;
const ITERAZIONI_MAX = 20;

/** JD UT1 dal JD TT (iterazione di punto fisso; ΔT varia di meno di 0,3 s al giorno). */
export function utDaTT(d: DatiDeltaT, jdTT: number): number {
  let jdUT = jdTT;
  for (let k = 0; k < ITERAZIONI_MAX; k++) {
    const nuovo = jdTT - deltaT(d, jdUT) / SECONDI_GIORNO;
    if (nuovo === jdUT) break;
    jdUT = nuovo;
  }
  return jdUT;
}

/** JD TT dal JD UT1. */
export function ttDaUT(d: DatiDeltaT, jdUT: number): number {
  return jdUT + deltaT(d, jdUT) / SECONDI_GIORNO;
}

/** Conversione con il modello indicato; il risultato non è limitato all'intervallo (§ 6.2: vedi limitiScala). */
export function timeStateCon(d: DatiDeltaT, jd: number, scala: ScalaTempo): TimeState {
  if (!Number.isFinite(jd)) throw new RangeError(`JD non finito: ${jd}`);
  if (scala === 'UT') {
    const dt = deltaT(d, jd);
    return { jdUT: jd, jdTT: jd + dt / SECONDI_GIORNO, deltaT: dt, deltaTSigma: sigmaDeltaT(d, jd), scalaIngresso: 'UT' };
  }
  if (scala !== 'TT') throw new RangeError(`scala non valida: ${String(scala)}`);
  const jdUT = utDaTT(d, jd);
  return { jdUT, jdTT: jd, deltaT: deltaT(d, jdUT), deltaTSigma: sigmaDeltaT(d, jdUT), scalaIngresso: 'TT' };
}

/** MakeTimeState legato al modello indicato. */
export function creaMakeTimeState(d: DatiDeltaT): MakeTimeState {
  return (jd, scala) => timeStateCon(d, jd, scala);
}

let modelloCorrente: DatiDeltaT | null = null;

/** Installa il modello letto da time.json (avvio, § 5.6); null lo rimuove. */
export function impostaModelloTempo(d: DatiDeltaT | null): void {
  modelloCorrente = d;
}

/** Modello installato; Error se time.json non è ancora stato letto. */
export function modelloTempo(): DatiDeltaT {
  if (modelloCorrente === null) throw new Error('modello del tempo non caricato (time.json)');
  return modelloCorrente;
}

/** Contratto del § 5.4: unico punto di conversione, con il modello installato da impostaModelloTempo. */
export const makeTimeState: MakeTimeState = (jd, scala) => timeStateCon(modelloTempo(), jd, scala);

export interface LimitiScala {
  /** Limite inferiore incluso nella scala indicata. */
  min: number;
  /** Limite superiore escluso nella scala indicata. */
  maxEscl: number;
}

/**
 * Limiti del § 6.2 nella scala indicata: in UT [JD_MIN_UT, JD_MAX_UT_EXCL); in TT
 * [JD_MIN_UT + ΔT(JD_MIN_UT)/86 400, JD_MAX_UT_EXCL + ΔT(JD_MAX_UT_EXCL)/86 400).
 */
export function limitiScala(d: DatiDeltaT, scala: ScalaTempo): LimitiScala {
  if (scala === 'UT') return { min: JD_MIN_UT, maxEscl: JD_MAX_UT_EXCL };
  return { min: ttDaUT(d, JD_MIN_UT), maxEscl: ttDaUT(d, JD_MAX_UT_EXCL) };
}

/** Vero se jd (nella scala indicata) è nell'intervallo ammesso. */
export function nelIntervallo(d: DatiDeltaT, jd: number, scala: ScalaTempo): boolean {
  const l = limitiScala(d, scala);
  return jd >= l.min && jd < l.maxEscl;
}
