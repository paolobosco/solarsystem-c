// ΔT = TT - UT1 e sua incertezza (§ 6.4, § 6.5 di docs/PROGETTO.md), dai dati di time.json (§ 8.9).
// Stesse formule e stesso ordine delle operazioni di scripts/pipeline/time_model.py (ModelloDeltaT).
// Fonti: manuale di JPL Horizons, sezione "Universal Time" (parabola prima di -720); Morrison,
// Stephenson, Hohenkerk, Zawilski (2021), Proc. R. Soc. A 477:20200776, tabella S15.2020; IERS EOP 20 C04;
// Stephenson, Morrison, Hohenkerk (2016), Proc. R. Soc. A 472:20160404 (32,5 s/cy²);
// Morrison e Stephenson (2004), J. Hist. Astron. 35, 327 (0,8·u², dal -1000 al 1200); Stephenson e Houlden (1986)
// tramite Espenak e Meeus (2006) (era telescopica); Huber (2000); eccesso di LOD di EOP 20 C04 (deriva dopo y_obs).
// Nessuna allocazione.

import { J2000 } from '../ephem/constants';
import type { TimeState } from './types';

/** Dati del modello di ΔT e σ(ΔT), letti da time.json (src/data/timeReader.ts). */
export interface DatiDeltaT {
  /** Nodi della spline S15.2020 per intervallo: [K_0, K_1, K_1, K_2, ...] (2 valori per intervallo), anni. */
  readonly s15Nodi: Float64Array;
  /** Coefficienti per intervallo: a0, a1, a2, a3 (s). */
  readonly s15Coeff: Float64Array;
  /** Parabola prima di -720: a + b·u² + delta, u = (y - 1825)/100. */
  readonly pre720A: number;
  readonly pre720B: number;
  readonly pre720Delta: number;
  /** Raccordo C0 tra S15 e IERS: [inizio, fine) in anni (2019, 2020). */
  readonly raccordoInizio: number;
  readonly raccordoFine: number;
  /** Valori IERS (anni giuliani UT1 e ΔT in s), interpolazione lineare. */
  readonly iersAnni: Float64Array;
  readonly iersValori: Float64Array;
  /** Ultimo valore IERS: anno e ΔT (s). */
  readonly yObs: number;
  readonly deltaTObs: number;
  /** Curvatura dell'estrapolazione futura, s/anno². */
  readonly cFuturo: number;
  /** σ (§ 6.5): m·u² fino al primo nodo storico; H con Q (ms²/anno) e M (anni) prima di annoPassato e dopo yObs. */
  readonly sigmaM: number;
  readonly sigmaQ: number;
  readonly sigmaMAnni: number;
  readonly sigmaAnnoPassato: number;
  /** Nodi storici (anni, σ in s) dal 1200, interpolati linearmente nel logaritmo; σ costante dopo l'ultimo. */
  readonly sigmaStoricoAnni: Float64Array;
  readonly sigmaStoricoValori: Float64Array;
  /** Scarto quadratico medio da EOP 20 C04 della S15.2020 (1972-2018) e dei valori IERS mensili interpolati (s). */
  readonly sigmaS15: number;
  readonly sigmaIers: number;
  /** Scarto della S15.2020 nel 1962-1971 (s), usato prima di sigmaS15RaccordoInizio; raccordo lineare fino alla fine. */
  readonly sigmaS15Iniziale: number;
  readonly sigmaS15RaccordoInizio: number;
  readonly sigmaS15RaccordoFine: number;
  /** Eccesso di LOD dell'ultimo anno di C04, radice della media dei quadrati (s): deriva 365,25·N·lodRms dopo yObs. */
  readonly lodRms: number;
}

/** Epoca giuliana dal JD: 2000 + (JD - 2 451 545)/365,25 (§ 6.4). */
export function annoGiuliano(jd: number): number {
  return 2000 + (jd - J2000) / 365.25;
}

/** Indice dell'ultimo intervallo con K_i ≤ y, limitato a [0, n - 1] (come numpy.searchsorted 'right' - 1). */
function intervalloS15(d: DatiDeltaT, y: number): number {
  const n = d.s15Coeff.length / 4;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (d.s15Nodi[2 * m]! <= y) lo = m + 1;
    else hi = m;
  }
  const i = lo - 1;
  return i < 0 ? 0 : i > n - 1 ? n - 1 : i;
}

/** Spline S15.2020; oltre l'ultimo nodo prolunga l'ultimo polinomio (raccordo 2019-2020). */
export function deltaTS15(d: DatiDeltaT, y: number): number {
  const i = intervalloS15(d, y);
  const k0 = d.s15Nodi[2 * i]!;
  const k1 = d.s15Nodi[2 * i + 1]!;
  const c = 4 * i;
  const t = (y - k0) / (k1 - k0);
  return d.s15Coeff[c]! + t * (d.s15Coeff[c + 1]! + t * (d.s15Coeff[c + 2]! + t * d.s15Coeff[c + 3]!));
}

/** Parabola del manuale di Horizons con l'offset di continuità a -720. */
export function deltaTParabola(d: DatiDeltaT, y: number): number {
  const u = (y - 1825) / 100;
  return d.pre720A + d.pre720B * u * u + d.pre720Delta;
}

/** Interpolazione lineare dei valori IERS; costante fuori dalla serie. */
export function deltaTIers(d: DatiDeltaT, y: number): number {
  const a = d.iersAnni;
  const v = d.iersValori;
  const n = a.length;
  if (y <= a[0]!) return v[0]!;
  if (y >= a[n - 1]!) return v[n - 1]!;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (a[m]! <= y) lo = m + 1;
    else hi = m;
  }
  const j = lo - 1;
  const y0 = a[j]!;
  const v0 = v[j]!;
  return v0 + ((v[j + 1]! - v0) / (a[j + 1]! - y0)) * (y - y0);
}

/** ΔT (s) per anno giuliano y (UT1). */
export function deltaTDaAnno(d: DatiDeltaT, y: number): number {
  if (y < d.s15Nodi[0]!) return deltaTParabola(d, y);
  if (y < d.raccordoInizio) return deltaTS15(d, y);
  if (y < d.raccordoFine) {
    const w = y - d.raccordoInizio;
    return (1 - w) * deltaTS15(d, y) + w * deltaTIers(d, y);
  }
  if (y <= d.yObs) return deltaTIers(d, y);
  const dy = y - d.yObs;
  return d.deltaTObs + d.cFuturo * dy * dy;
}

/** ΔT = TT - UT1 (s) all'istante JD UT1. */
export function deltaT(d: DatiDeltaT, jdUT: number): number {
  return deltaTDaAnno(d, annoGiuliano(jdUT));
}

/** Modello di Huber (2000): H(N) = 365,25·N·√((N·Q/3)·(1 + N/M))/1000 s. */
function huber(d: DatiDeltaT, n: number): number {
  return (365.25 * n * Math.sqrt(((n * d.sigmaQ) / 3) * (1 + n / d.sigmaMAnni))) / 1000;
}

/** σ dei dati storici (s): m·u² fino al primo nodo, poi interpolazione lineare nel logaritmo dei nodi. */
export function sigmaStorica(d: DatiDeltaT, y: number): number {
  const a = d.sigmaStoricoAnni;
  const v = d.sigmaStoricoValori;
  const n = a.length;
  if (y <= a[0]!) {
    const u = (y - 1825) / 100;
    return d.sigmaM * u * u;
  }
  if (y >= a[n - 1]!) return v[n - 1]!;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (a[m]! <= y) lo = m + 1;
    else hi = m;
  }
  const j = lo - 1;
  const w = (y - a[j]!) / (a[j + 1]! - a[j]!);
  const l0 = Math.log(v[j]!);
  return Math.exp(l0 + w * (Math.log(v[j + 1]!) - l0));
}

/** Scarto della S15.2020 da IERS (s): valore del 1962-1971, raccordo lineare, valore del 1972-2018. */
export function sigmaS15DaAnno(d: DatiDeltaT, y: number): number {
  const r0 = d.sigmaS15RaccordoInizio;
  const r1 = d.sigmaS15RaccordoFine;
  if (y < r0) return d.sigmaS15Iniziale;
  if (y < r1) {
    const w = (y - r0) / (r1 - r0);
    return (1 - w) * d.sigmaS15Iniziale + w * d.sigmaS15;
  }
  return d.sigmaS15;
}

/**
 * σ(ΔT) a 1 sigma (s) per anno giuliano y (§ 6.5): dove ΔT segue la parabola o la S15.2020, il massimo tra σ
 * storica, scarto della S15.2020 da IERS e, prima di annoPassato, Huber; nel raccordo la media pesata come ΔT;
 * con i valori IERS il loro scarto e, dopo yObs, il massimo con Huber e con la deriva da LOD.
 */
export function sigmaDeltaTDaAnno(d: DatiDeltaT, y: number): number {
  if (y < d.raccordoInizio) {
    let s = Math.max(sigmaStorica(d, y), sigmaS15DaAnno(d, y));
    if (y < d.sigmaAnnoPassato) s = Math.max(s, huber(d, d.sigmaAnnoPassato - y));
    return s;
  }
  if (y < d.raccordoFine) {
    const w = y - d.raccordoInizio;
    return (1 - w) * Math.max(sigmaStorica(d, y), sigmaS15DaAnno(d, y)) + w * d.sigmaIers;
  }
  let s = d.sigmaIers;
  if (y > d.yObs) {
    const n = y - d.yObs;
    s = Math.max(s, huber(d, n), 365.25 * n * d.lodRms);
  }
  return s;
}

/** σ(ΔT) a 1 sigma (s) all'istante JD UT1. */
export function sigmaDeltaT(d: DatiDeltaT, jdUT: number): number {
  return sigmaDeltaTDaAnno(d, annoGiuliano(jdUT));
}

/**
 * Moto medio della Luna in longitudine: 481 267,88123421° per secolo giuliano (Meeus 1998, eq. 47.1,
 * da ELP 2000-82), in rad/s; circa 0,55°/h (§ 6.5).
 */
export const OMEGA_LUNA_MEDIA_RAD_S = (481_267.88123421 * Math.PI) / 180 / (36_525 * 86_400);

/** Soglia della riga ΔT (§ 11.4.3): 1′ in radianti. */
export const SOGLIA_AVVISO_LUNA_RAD = Math.PI / 10_800;

/** Valori numerici della riga ΔT della console (§ 11.4.3); i testi li compone l'interfaccia. */
export interface InfoRigaDeltaT {
  deltaT: number; // s
  sigma: number; // s, 1 sigma
  sigmaOre: number; // h
  /** Incertezza angolare della Luna dovuta a σ(ΔT), rad (0 con ingresso in TT). */
  epsLuna: number;
  /** Vero se epsLuna supera 1′: "Ora incerta di ±[σ] h: la Luna può trovarsi [x]° più avanti o indietro." */
  avvisoLuna: boolean;
}

/** Riga ΔT dal TimeState; omegaLuna in rad/s (predefinito il moto medio, oppure |r × v|/r² geocentrico). */
export function infoRigaDeltaT(t: TimeState, omegaLuna: number = OMEGA_LUNA_MEDIA_RAD_S): InfoRigaDeltaT {
  const eps = t.scalaIngresso === 'UT' ? omegaLuna * t.deltaTSigma : 0;
  return {
    deltaT: t.deltaT,
    sigma: t.deltaTSigma,
    sigmaOre: t.deltaTSigma / 3600,
    epsLuna: eps,
    avvisoLuna: eps > SOGLIA_AVVISO_LUNA_RAD,
  };
}
