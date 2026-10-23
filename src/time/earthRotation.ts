// Rotazione terrestre (§ 7.7 di docs/PROGETTO.md), senza allocazioni.
// - ERA(UT1) = 2π·(0,7790572732640 + 1,00273781191135448·(JD_UT1 - 2 451 545,0)) (IERS Conventions 2010,
//   IERS TN 36, eq. 5.15), con le operazioni di ERFA eraEra00.
// - EO(TT): equazione delle origini tabulata in time.json (CIO integrato lungo il polo medio di Vondrák,
//   scripts/pipeline/time_model.py), Hermite cubica tra i nodi.
// - GST = ERA - EO: angolo del meridiano di Greenwich dall'equinozio medio della data, verso est.
// - Orientamento: matrice corpo → eclittica J2000 = R_x(ε0)·LTPBᵀ·R3(GST)ᵀ, con LTPB di Vondrák, Capitaine,
//   Wallace (2011, 2012) (eraLtpb); nutazione e moto del polo trascurati (I13).

import { OBLIQUITA_J2000_RAD } from '../ephem/constants';
import type { Scrivibile } from '../ephem/equinoctial';
import { basiHermite, nodoSinistro } from '../ephem/interp';
import { epocaGiuliana, ltpb } from './precession';

const D2PI = 2 * Math.PI;
const J2000 = 2451545.0;

/** Tabella dell'equazione delle origini (§ 8.9): nodi t0 + j·passo (JD TT), valori (rad) e derivate (rad/d). */
export interface DatiEo {
  readonly t0: number;
  readonly passo: number;
  readonly valori: Float64Array;
  readonly derivate: Float64Array;
}

/** Angolo in [0, 2π) come eraAnp. */
export function normalizzaAngolo(a: number): number {
  const w = a % D2PI;
  return w < 0 ? w + D2PI : w;
}

/** Angolo di rotazione terrestre (rad, [0, 2π)) come eraEra00(jdUT1, 0). */
export function eraRad(jdUT1: number): number {
  let d1: number;
  let d2: number;
  if (jdUT1 < 0) {
    d1 = jdUT1;
    d2 = 0;
  } else {
    d1 = 0;
    d2 = jdUT1;
  }
  const t = d1 + (d2 - J2000);
  const f = (d1 % 1) + (d2 % 1);
  return normalizzaAngolo(D2PI * (f + 0.779057273264 + 0.00273781191135448 * t));
}

const basi = new Float64Array(8);

/** Equazione delle origini (rad, continua, non ridotta) a JD TT; Hermite cubica, nessun controllo di copertura. */
export function equazioneOrigini(eo: DatiEo, jdTT: number): number {
  const h = eo.passo;
  const x = (jdTT - eo.t0) / h;
  const j = nodoSinistro(x, 0, eo.valori.length - 2);
  basiHermite(x - j, basi);
  return basi[0]! * eo.valori[j]! + basi[1]! * (h * eo.derivate[j]!) + basi[2]! * eo.valori[j + 1]! + basi[3]! * (h * eo.derivate[j + 1]!);
}

/** Tempo siderale medio GST = ERA(UT1) - EO(TT), rad in [0, 2π). */
export function gstRad(eo: DatiEo, jdUT1: number, jdTT: number): number {
  return normalizzaAngolo(eraRad(jdUT1) - equazioneOrigini(eo, jdTT));
}

const precessione = new Float64Array(9);
const C0 = Math.cos(OBLIQUITA_J2000_RAD);
const S0 = Math.sin(OBLIQUITA_J2000_RAD);

/**
 * Orientamento della Terra: matrice 3×3 per righe che porta le coordinate fisse nella Terra (x verso
 * Greenwich, z verso il polo medio della data) all'eclittica J2000 della scena. Colonne: assi del corpo.
 */
export function orientamentoTerra(eo: DatiEo, jdUT1: number, jdTT: number, out: Scrivibile): void {
  const g = gstRad(eo, jdUT1, jdTT);
  const c = Math.cos(g);
  const s = Math.sin(g);
  ltpb(epocaGiuliana(jdTT), precessione);
  const p = precessione;
  for (let k = 0; k < 3; k++) {
    // Riga k di W = R3(g)·LTPB, cioè l'asse k del corpo nel GCRS.
    let wx: number;
    let wy: number;
    let wz: number;
    if (k === 0) {
      wx = c * p[0]! + s * p[3]!;
      wy = c * p[1]! + s * p[4]!;
      wz = c * p[2]! + s * p[5]!;
    } else if (k === 1) {
      wx = -s * p[0]! + c * p[3]!;
      wy = -s * p[1]! + c * p[4]!;
      wz = -s * p[2]! + c * p[5]!;
    } else {
      wx = p[6]!;
      wy = p[7]!;
      wz = p[8]!;
    }
    // Colonna k = R_x(ε0)·asse.
    out[k] = wx;
    out[3 + k] = C0 * wy + S0 * wz;
    out[6 + k] = -S0 * wy + C0 * wz;
  }
}

/**
 * Longitudine est (rad, (-π, π]) del punto in cui la direzione eliocentrica -rTerra (il Sole visto dalla
 * Terra) attraversa la superficie, con la matrice di orientamento m (corpo → eclittica J2000).
 */
export function longitudineSubsolare(m: ArrayLike<number>, rTerra: ArrayLike<number>): number {
  const x = -rTerra[0]!;
  const y = -rTerra[1]!;
  const z = -rTerra[2]!;
  const bx = m[0]! * x + m[3]! * y + m[6]! * z;
  const by = m[1]! * x + m[4]! * y + m[7]! * z;
  return Math.atan2(by, bx);
}

/** Soglia del § 7.7: la longitudine terrestre è indeterminata se 15°/h·σ(ΔT) supera 90°, cioè σ > 6 h. */
export const SIGMA_INDETERMINAZIONE_S = (90 / 15) * 3600;

/**
 * Vero se la rotazione terrestre è indeterminata in longitudine per l'incertezza σ(ΔT) indicata (s). Si applica
 * con l'istante in TT, dove UT1 = TT - ΔT è incerto di σ; con l'istante in UT l'angolo ERA(UT1) è fissato.
 */
export function rotazioneIndeterminata(sigmaDeltaTS: number): boolean {
  return sigmaDeltaTS > SIGMA_INDETERMINAZIONE_S;
}
