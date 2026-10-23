// Luna (§ 7.4 di docs/PROGETTO.md): serie di Meeus (Astronomical Algorithms, 2ª ed., 1998, cap. 47,
// tabelle 47.A e 47.B, troncamento di ELP 2000-82B) con correzioni degli argomenti stimate contro DE441
// (moon.bin, § 8.4), catena eclittica della data → eclittica J2000 con la precessione di Vondrák,
// Capitaine, Wallace (2011), Terra dal baricentro Terra-Luna (§ 7.3.5) e orientamento con le leggi di
// Cassini. Stesse formule e stesso ordine delle operazioni di scripts/pipeline/moon.py. Nessuna
// allocazione nelle funzioni di valutazione.

import { correzioniLuna } from '../data/moonReader';
import type { DatiLuna } from '../data/moonReader';
import { applicaMatrice, eclitticaDataAJ2000, epocaGiuliana } from '../time/precession';
import { EMRAT, GIORNO_S, J2000 } from './constants';
import type { Scrivibile } from './equinoctial';
import type { StatoEffemeride } from './types';

const GRADI = Math.PI / 180;
/** Unità dei coefficienti: 1e-6 gradi in radianti e 1e-3 km. */
const U_ANGOLO = 1e-6 * GRADI;
const U_DISTANZA = 1e-3;
const DISTANZA_MEDIA_KM = 385000.56;
const GIORNI_SECOLO = 36525;
const DIVISORE_VELOCITA = GRADI / GIORNI_SECOLO;

/** Inclinazione dell'equatore lunare sull'eclittica della data (legge di Cassini), § 7.4. */
export const INCLINAZIONE_EQUATORE_LUNA = 1.543 * GRADI;

// Tabella 47.A: D, M, M', F, Σl (1e-6 °), Σr (1e-3 km).
// prettier-ignore
const TAB_LR: readonly number[] = [
  0, 0, 1, 0, 6288774, -20905355,
  2, 0, -1, 0, 1274027, -3699111,
  2, 0, 0, 0, 658314, -2955968,
  0, 0, 2, 0, 213618, -569925,
  0, 1, 0, 0, -185116, 48888,
  0, 0, 0, 2, -114332, -3149,
  2, 0, -2, 0, 58793, 246158,
  2, -1, -1, 0, 57066, -152138,
  2, 0, 1, 0, 53322, -170733,
  2, -1, 0, 0, 45758, -204586,
  0, 1, -1, 0, -40923, -129620,
  1, 0, 0, 0, -34720, 108743,
  0, 1, 1, 0, -30383, 104755,
  2, 0, 0, -2, 15327, 10321,
  0, 0, 1, 2, -12528, 0,
  0, 0, 1, -2, 10980, 79661,
  4, 0, -1, 0, 10675, -34782,
  0, 0, 3, 0, 10034, -23210,
  4, 0, -2, 0, 8548, -21636,
  2, 1, -1, 0, -7888, 24208,
  2, 1, 0, 0, -6766, 30824,
  1, 0, -1, 0, -5163, -8379,
  1, 1, 0, 0, 4987, -16675,
  2, -1, 1, 0, 4036, -12831,
  2, 0, 2, 0, 3994, -10445,
  4, 0, 0, 0, 3861, -11650,
  2, 0, -3, 0, 3665, 14403,
  0, 1, -2, 0, -2689, -7003,
  2, 0, -1, 2, -2602, 0,
  2, -1, -2, 0, 2390, 10056,
  1, 0, 1, 0, -2348, 6322,
  2, -2, 0, 0, 2236, -9884,
  0, 1, 2, 0, -2120, 5751,
  0, 2, 0, 0, -2069, 0,
  2, -2, -1, 0, 2048, -4950,
  2, 0, 1, -2, -1773, 4130,
  2, 0, 0, 2, -1595, 0,
  4, -1, -1, 0, 1215, -3958,
  0, 0, 2, 2, -1110, 0,
  3, 0, -1, 0, -892, 3258,
  2, 1, 1, 0, -810, 2616,
  4, -1, -2, 0, 759, -1897,
  0, 2, -1, 0, -713, -2117,
  2, 2, -1, 0, -700, 2354,
  2, 1, -2, 0, 691, 0,
  2, -1, 0, -2, 596, 0,
  4, 0, 1, 0, 549, -1423,
  0, 0, 4, 0, 537, -1117,
  4, -1, 0, 0, 520, -1571,
  1, 0, -2, 0, -487, -1739,
  2, 1, 0, -2, -399, 0,
  0, 0, 2, -2, -381, -4421,
  1, 1, 1, 0, 351, 0,
  3, 0, -2, 0, -340, 0,
  4, 0, -3, 0, 330, 0,
  2, -1, 2, 0, 327, 0,
  0, 2, 1, 0, -323, 1165,
  1, 1, -1, 0, 299, 0,
  2, 0, 3, 0, 294, 0,
  2, 0, -1, -2, 0, 8752,
];

// Tabella 47.B: D, M, M', F, Σb (1e-6 °).
// prettier-ignore
const TAB_B: readonly number[] = [
  0, 0, 0, 1, 5128122,
  0, 0, 1, 1, 280602,
  0, 0, 1, -1, 277693,
  2, 0, 0, -1, 173237,
  2, 0, -1, 1, 55413,
  2, 0, -1, -1, 46271,
  2, 0, 0, 1, 32573,
  0, 0, 2, 1, 17198,
  2, 0, 1, -1, 9266,
  0, 0, 2, -1, 8822,
  2, -1, 0, -1, 8216,
  2, 0, -2, -1, 4324,
  2, 0, 1, 1, 4200,
  2, 1, 0, -1, -3359,
  2, -1, -1, 1, 2463,
  2, -1, 0, 1, 2211,
  2, -1, -1, -1, 2065,
  0, 1, -1, -1, -1870,
  4, 0, -1, -1, 1828,
  0, 1, 0, 1, -1794,
  0, 0, 0, 3, -1749,
  0, 1, -1, 1, -1565,
  1, 0, 0, 1, -1491,
  0, 1, 1, 1, -1475,
  0, 1, 1, -1, -1410,
  0, 1, 0, -1, -1344,
  1, 0, 0, -1, -1335,
  0, 0, 3, 1, 1107,
  4, 0, 0, -1, 1021,
  4, 0, -1, 1, 833,
  0, 0, 1, -3, 777,
  4, 0, -2, 1, 671,
  2, 0, 0, -3, 607,
  2, 0, 2, -1, 596,
  2, -1, 1, -1, 491,
  2, 0, -2, 1, -451,
  0, 0, 3, -1, 439,
  2, 0, 2, 1, 422,
  2, 0, -3, -1, 421,
  2, 1, -1, 1, -366,
  2, 1, 0, 1, -351,
  4, 0, 0, 1, 331,
  2, -1, 1, 1, 315,
  2, -2, 0, -1, 302,
  0, 0, 1, 3, -283,
  2, 1, 1, -1, -229,
  1, 1, 0, -1, 223,
  1, 1, 0, 1, 223,
  0, 1, -2, -1, -220,
  2, 1, -1, -1, -220,
  1, 0, 1, 1, -185,
  2, -1, -2, -1, 181,
  0, 1, 2, 1, -177,
  4, 0, -2, -1, 176,
  4, -1, -1, -1, 166,
  1, 0, 1, -1, -164,
  4, 0, 1, -1, 132,
  1, 0, -1, -1, -119,
  4, -1, 0, -1, 115,
  2, -2, 0, 1, 107,
];

export const TERMINI_LR = TAB_LR.length / 6;
export const TERMINI_B = TAB_B.length / 5;

// Argomenti fondamentali (gradi): coefficienti di T^0..T^4 (Meeus 47.1-47.5).
const POLI_L1 = [218.3164477, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000] as const;
const POLI_D = [297.8501921, 445267.1114034, -0.0018819, 1 / 545868, -1 / 113065000] as const;
const POLI_M = [357.5291092, 35999.0502909, -0.0001536, 1 / 24490000, 0] as const;
const POLI_M1 = [134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000] as const;
const POLI_F = [93.272095, 483202.0175233, -0.0036539, -1 / 3526000, 1 / 863310000] as const;
const POLI = [POLI_L1, POLI_D, POLI_M, POLI_M1, POLI_F] as const;
// A1, A2, A3 (gradi) ed E (47.6).
const POLI_A = [
  [119.75, 131.849],
  [53.09, 479264.29],
  [313.45, 481266.484],
] as const;
const E1 = -0.002516;
const E2 = -0.0000074;
// Termini additivi (1e-6 °).
const ADD_L = [3958, 1962, 318] as const;
const ADD_B = [-2235, 382, 175, 175, 127, -115] as const;

/** Polinomio di grado 4 con Horner da T^4 a T^0. */
function poli(c: readonly [number, number, number, number, number], t: number): number {
  return (((c[4] * t + c[3]) * t + c[2]) * t + c[1]) * t + c[0];
}

/** Derivata rispetto a T del polinomio di grado 4. */
function poliDerivata(c: readonly [number, number, number, number, number], t: number): number {
  return ((4 * c[4] * t + 3 * c[3]) * t + 2 * c[2]) * t + 1 * c[1];
}

// Memoria di lavoro: argomenti [L', D, M, M', F] e velocità (rad/d).
const fond = new Float64Array(5);
const vfond = new Float64Array(5);
const sfer = new Float64Array(6);
const vettore = new Float64Array(6);
const matrice = new Float64Array(9);
const corr = new Float64Array(6);
const dcorr = new Float64Array(6);
const tmp = new Float64Array(3);

/**
 * λ, β (rad), Δ (km) nell'eclittica e nell'equinozio medi della data e derivate (rad/d, km/d) in out[0..5].
 * c: [ΔL', ΔD, ΔM, ΔM', ΔF (rad), κ]; dc: derivate per giorno (la colonna di κ non è usata).
 * Le derivate trascurano le variazioni lente di E e κ.
 */
export function serieLuna(jdTT: number, c: ArrayLike<number>, dc: ArrayLike<number>, out: Scrivibile): void {
  const t = (jdTT - J2000) / GIORNI_SECOLO;
  for (let i = 0; i < 5; i++) {
    fond[i] = poli(POLI[i]!, t) * GRADI + c[i]!;
    vfond[i] = poliDerivata(POLI[i]!, t) * DIVISORE_VELOCITA + dc[i]!;
  }
  const a1 = (POLI_A[0][0] + POLI_A[0][1] * t) * GRADI;
  const a2 = (POLI_A[1][0] + POLI_A[1][1] * t) * GRADI;
  const a3 = (POLI_A[2][0] + POLI_A[2][1] * t) * GRADI;
  const va1 = POLI_A[0][1] * DIVISORE_VELOCITA;
  const va2 = POLI_A[1][1] * DIVISORE_VELOCITA;
  const va3 = POLI_A[2][1] * DIVISORE_VELOCITA;
  const e = (1 + t * (E1 + t * E2)) * c[5]!;
  const e2 = e * e;
  const l1 = fond[0]!;
  const dd = fond[1]!;
  const m = fond[2]!;
  const m1 = fond[3]!;
  const f = fond[4]!;
  const vd = vfond[1]!;
  const vm = vfond[2]!;
  const vm1 = vfond[3]!;
  const vf = vfond[4]!;
  const vl1 = vfond[0]!;
  let sl = 0;
  let sr = 0;
  let dsl = 0;
  let dsr = 0;
  for (let i = 0; i < TERMINI_LR; i++) {
    const o = 6 * i;
    const kd = TAB_LR[o]!;
    const km = TAB_LR[o + 1]!;
    const km1 = TAB_LR[o + 2]!;
    const kf = TAB_LR[o + 3]!;
    const arg = dd * kd + m * km + m1 * km1 + f * kf;
    const varg = vd * kd + vm * km + vm1 * km1 + vf * kf;
    const fe = km === 0 ? 1 : km === 1 || km === -1 ? e : e2;
    const s = Math.sin(arg);
    const co = Math.cos(arg);
    const cl = TAB_LR[o + 4]!;
    const cr = TAB_LR[o + 5]!;
    sl += cl * fe * s;
    sr += cr * fe * co;
    dsl += cl * fe * co * varg;
    dsr += cr * fe * s * varg;
  }
  dsr = -dsr;
  let sb = 0;
  let dsb = 0;
  for (let i = 0; i < TERMINI_B; i++) {
    const o = 5 * i;
    const kd = TAB_B[o]!;
    const km = TAB_B[o + 1]!;
    const km1 = TAB_B[o + 2]!;
    const kf = TAB_B[o + 3]!;
    const arg = dd * kd + m * km + m1 * km1 + f * kf;
    const varg = vd * kd + vm * km + vm1 * km1 + vf * kf;
    const fe = km === 0 ? 1 : km === 1 || km === -1 ? e : e2;
    const cb = TAB_B[o + 4]!;
    sb += cb * fe * Math.sin(arg);
    dsb += cb * fe * Math.cos(arg) * varg;
  }
  sl = sl + ADD_L[0] * Math.sin(a1) + ADD_L[1] * Math.sin(l1 - f) + ADD_L[2] * Math.sin(a2);
  sb =
    sb +
    ADD_B[0] * Math.sin(l1) +
    ADD_B[1] * Math.sin(a3) +
    ADD_B[2] * Math.sin(a1 - f) +
    ADD_B[3] * Math.sin(a1 + f) +
    ADD_B[4] * Math.sin(l1 - m1) +
    ADD_B[5] * Math.sin(l1 + m1);
  dsl =
    dsl +
    ADD_L[0] * Math.cos(a1) * va1 +
    ADD_L[1] * Math.cos(l1 - f) * (vl1 - vf) +
    ADD_L[2] * Math.cos(a2) * va2;
  dsb =
    dsb +
    ADD_B[0] * Math.cos(l1) * vl1 +
    ADD_B[1] * Math.cos(a3) * va3 +
    ADD_B[2] * Math.cos(a1 - f) * (va1 - vf) +
    ADD_B[3] * Math.cos(a1 + f) * (va1 + vf) +
    ADD_B[4] * Math.cos(l1 - m1) * (vl1 - vm1) +
    ADD_B[5] * Math.cos(l1 + m1) * (vl1 + vm1);
  out[0] = l1 + sl * U_ANGOLO;
  out[1] = sb * U_ANGOLO;
  out[2] = DISTANZA_MEDIA_KM + sr * U_DISTANZA;
  out[3] = vl1 + dsl * U_ANGOLO;
  out[4] = dsb * U_ANGOLO;
  out[5] = dsr * U_DISTANZA;
}

/** Stato cartesiano (km, km/d) da λ, β, Δ e derivate. */
function sfericheAStato(s: ArrayLike<number>, out: Scrivibile): void {
  const lam = s[0]!;
  const beta = s[1]!;
  const dist = s[2]!;
  const dlam = s[3]!;
  const dbeta = s[4]!;
  const ddist = s[5]!;
  const cl = Math.cos(lam);
  const sl = Math.sin(lam);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  out[0] = dist * cb * cl;
  out[1] = dist * cb * sl;
  out[2] = dist * sb;
  out[3] = ddist * cb * cl - dist * sb * dbeta * cl - dist * cb * sl * dlam;
  out[4] = ddist * cb * sl - dist * sb * dbeta * sl + dist * cb * cl * dlam;
  out[5] = ddist * sb + dist * cb * dbeta;
}

/**
 * Stato geocentrico della Luna (km, km/s; eclittica J2000) date le correzioni e le loro derivate.
 * La velocità trascura la derivata della matrice di precessione (circa 3e-6 relativo).
 */
export function statoGeocentricoDaCorrezioni(
  jdTT: number,
  c: ArrayLike<number>,
  dc: ArrayLike<number>,
  out: Scrivibile,
): void {
  serieLuna(jdTT, c, dc, sfer);
  sfericheAStato(sfer, vettore);
  eclitticaDataAJ2000(epocaGiuliana(jdTT), matrice);
  applicaMatrice(matrice, vettore, tmp);
  out[0] = tmp[0]!;
  out[1] = tmp[1]!;
  out[2] = tmp[2]!;
  tmp[0] = vettore[3]!;
  tmp[1] = vettore[4]!;
  tmp[2] = vettore[5]!;
  applicaMatrice(matrice, tmp, tmp);
  out[3] = tmp[0] / GIORNO_S;
  out[4] = tmp[1] / GIORNO_S;
  out[5] = tmp[2] / GIORNO_S;
}

/**
 * Orientamento con le leggi di Cassini (§ 7.4): out = M(t)·R_z(Ω + π)·R_x(I)·R_z(F), matrice 3×3 per righe
 * dal sistema solidale alla Luna (x verso la Terra media, z polo nord) all'eclittica J2000.
 * Ω = L' - F è il nodo ascendente medio dell'orbita; argomenti con le correzioni.
 */
export function orientamentoDaCorrezioni(jdTT: number, c: ArrayLike<number>, out: Scrivibile): void {
  const t = (jdTT - J2000) / GIORNI_SECOLO;
  const l1 = poli(POLI_L1, t) * GRADI + c[0]!;
  const f = poli(POLI_F, t) * GRADI + c[4]!;
  const nodo = l1 - f + Math.PI;
  const cn = Math.cos(nodo);
  const sn = Math.sin(nodo);
  const ci = Math.cos(INCLINAZIONE_EQUATORE_LUNA);
  const si = Math.sin(INCLINAZIONE_EQUATORE_LUNA);
  const cf = Math.cos(f);
  const sf = Math.sin(f);
  // A = R_z(nodo)·R_x(I)
  const a00 = cn;
  const a01 = -sn * ci;
  const a02 = sn * si;
  const a10 = sn;
  const a11 = cn * ci;
  const a12 = -cn * si;
  const a21 = si;
  const a22 = ci;
  // R = A·R_z(F), in vettore (per righe)
  vettore[0] = a00 * cf + a01 * sf;
  vettore[1] = -a00 * sf + a01 * cf;
  vettore[2] = a02;
  vettore[3] = a10 * cf + a11 * sf;
  vettore[4] = -a10 * sf + a11 * cf;
  vettore[5] = a12;
  const r20 = a21 * sf;
  const r21 = a21 * cf;
  const r22 = a22;
  eclitticaDataAJ2000(epocaGiuliana(jdTT), matrice);
  for (let i = 0; i < 3; i++) {
    const m0 = matrice[3 * i]!;
    const m1 = matrice[3 * i + 1]!;
    const m2 = matrice[3 * i + 2]!;
    out[3 * i] = m0 * vettore[0] + m1 * vettore[3] + m2 * r20;
    out[3 * i + 1] = m0 * vettore[1] + m1 * vettore[4] + m2 * r21;
    out[3 * i + 2] = m0 * vettore[2] + m1 * vettore[5] + m2 * r22;
  }
}

/** r_Terra = r_EMB - r_Luna,geo/(1 + EMRAT) (§ 7.3.5), anche per le velocità; out può coincidere con emb. */
export function statoTerra(emb: ArrayLike<number>, lunaGeo: ArrayLike<number>, out: Scrivibile): void {
  const f = 1 / (1 + EMRAT);
  for (let i = 0; i < 6; i++) out[i] = emb[i]! - lunaGeo[i]! * f;
}

/** Luna dal file moon.bin: stato geocentrico e orientamento, senza allocazioni. */
export class EffemeridiLuna {
  private dati: DatiLuna | null;

  constructor(dati: DatiLuna | null = null) {
    this.dati = dati;
  }

  imposta(dati: DatiLuna | null): void {
    this.dati = dati;
  }

  pronta(): boolean {
    return this.dati !== null;
  }

  private copertura(jdTT: number): StatoEffemeride {
    const d = this.dati;
    if (d === null) return 'caricamento';
    if (!(jdTT >= d.inizio && jdTT < d.fine)) return 'fuori-copertura';
    correzioniLuna(d, jdTT, corr, dcorr);
    return 'ok';
  }

  /** Stato geocentrico (km, km/s; eclittica J2000). Se l'esito non è 'ok' out non è modificato. */
  statoGeocentrico(jdTT: number, out: Scrivibile): StatoEffemeride {
    const esito = this.copertura(jdTT);
    if (esito === 'ok') statoGeocentricoDaCorrezioni(jdTT, corr, dcorr, out);
    return esito;
  }

  /** Matrice 3×3 per righe dal sistema solidale alla Luna all'eclittica J2000. */
  orientamento(jdTT: number, out: Scrivibile): StatoEffemeride {
    const esito = this.copertura(jdTT);
    if (esito === 'ok') orientamentoDaCorrezioni(jdTT, corr, out);
    return esito;
  }
}
