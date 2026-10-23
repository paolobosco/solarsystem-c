// Precessione a lungo termine (§ 7.4, § 7.7 di docs/PROGETTO.md), senza allocazioni.
// Vondrák, Capitaine, Wallace (2011), A&A 534, A22, doi:10.1051/0004-6361/201117274;
// corrigendum A&A 541, C1 (2012), doi:10.1051/0004-6361/201117274e.
// Stessi coefficienti e stesse operazioni di ERFA (eraLtpequ, eraLtpecl, eraLtp, eraLtpb, eraLtecm).
// Matrici 3×3 in array di 9 elementi per righe: m[3·i + j].

import { OBLIQUITA_J2000_RAD } from '../ephem/constants';
import type { Scrivibile } from '../ephem/equinoctial';

/** Secondi d'arco in radianti (ERFA_DAS2R = 4,848136811095359935899141e-6, uguale a π/648 000 in doppia precisione). */
const DAS2R = 4.84813681109536e-6;
const D2PI = 2 * Math.PI;

/** Bias di riferimento ICRS (IERS Conventions 2010, eq. 5.21 e 5.33), rad. */
const BIAS_DX = -0.016617 * DAS2R;
const BIAS_DE = -0.0068192 * DAS2R;
const BIAS_DR = -0.0146 * DAS2R;

/** Obliquità a J2000.0 usata da eraLtpecl (IAU 2006): 84 381,406″. */
const EPS0_LTP = 84381.406 * DAS2R;

/** Obliquità dell'eclittica J2000 della scena (I4): 84 381,448″, la stessa costante della pipeline. */
const EPS0_SCENA = OBLIQUITA_J2000_RAD;

// Polo dell'equatore: polinomi in T (secoli da J2000) e termini periodici [periodo (cy), cos X, cos Y, sin X, sin Y] (″).
const XYPOL_X = [5453.282155, 0.4252841, -0.00037173, -0.000000152] as const;
const XYPOL_Y = [-73750.93035, -0.7675452, -0.00018725, 0.000000231] as const;
const XYPER: readonly (readonly [number, number, number, number, number])[] = [
  [256.75, -819.940624, 75004.344875, 81491.287984, 1558.515853],
  [708.15, -8444.676815, 624.033993, 787.163481, 7774.939698],
  [274.2, 2600.009459, 1251.136893, 1251.296102, -2219.534038],
  [241.45, 2755.17563, -1102.212834, -1257.950837, -2523.969396],
  [2309.0, -167.659835, -2660.66498, -2966.79973, 247.850422],
  [492.2, 871.855056, 699.291817, 639.744522, -846.485643],
  [396.1, 44.769698, 153.16722, 131.600209, -1393.124055],
  [288.9, -512.313065, -950.865637, -445.040117, 368.526116],
  [231.1, -819.415595, 499.754645, 584.522874, 749.045012],
  [1610.0, -538.071099, -145.18821, -89.756563, 444.704518],
  [620.0, -189.793622, 558.116553, 524.42963, 235.934465],
  [157.87, -402.922932, -23.923029, -13.549067, 374.049623],
  [220.3, 179.516345, -165.405086, -210.157124, -171.33018],
  [1200.0, -9.814756, 9.344131, -44.919798, -22.899655],
];

// Polo dell'eclittica: polinomi e termini periodici [periodo (cy), cos P, cos Q, sin P, sin Q] (″).
const PQPOL_P = [5851.607687, -0.1189, -0.00028913, 0.000000101] as const;
const PQPOL_Q = [-1600.8863, 1.1689818, -0.0000002, -0.000000437] as const;
const PQPER: readonly (readonly [number, number, number, number, number])[] = [
  [708.15, -5486.751211, -684.66156, 667.66673, -5523.863691],
  [2309.0, -17.127623, 2446.28388, -2354.886252, -549.74745],
  [1620.0, -617.517403, 399.671049, -428.152441, -310.998056],
  [492.2, 413.44294, -356.652376, 376.202861, 421.535876],
  [1183.0, 78.614193, -186.387003, 184.778874, -36.776172],
  [622.0, -180.732815, -316.80007, 335.321713, -145.278396],
  [882.0, -87.676083, 198.296701, -185.138669, -34.74445],
  [547.0, 46.140315, 101.135679, -120.97283, 22.885731],
];

/** Epoca giuliana (TT) da JD TT, come eraEpj: 2000 + (JD - 2 451 545)/365,25. */
export function epocaGiuliana(jdTT: number): number {
  return 2000 + (jdTT - 2451545) / 365.25;
}

/** Versore del polo dell'equatore medio della data rispetto all'equatore ed equinozio J2000 (eraLtpequ). */
export function ltpequ(epj: number, out: Scrivibile): void {
  const t = (epj - 2000) / 100;
  let x = 0;
  let y = 0;
  const w = D2PI * t;
  for (let i = 0; i < XYPER.length; i++) {
    const r = XYPER[i]!;
    const a = w / r[0];
    const s = Math.sin(a);
    const c = Math.cos(a);
    x += c * r[1] + s * r[3];
    y += c * r[2] + s * r[4];
  }
  let p = 1;
  for (let i = 0; i < 4; i++) {
    x += XYPOL_X[i]! * p;
    y += XYPOL_Y[i]! * p;
    p *= t;
  }
  x *= DAS2R;
  y *= DAS2R;
  out[0] = x;
  out[1] = y;
  const z = 1 - x * x - y * y;
  out[2] = z < 0 ? 0 : Math.sqrt(z);
}

/** Versore del polo dell'eclittica della data rispetto all'equatore ed equinozio J2000 (eraLtpecl). */
export function ltpecl(epj: number, out: Scrivibile): void {
  const t = (epj - 2000) / 100;
  let p = 0;
  let q = 0;
  let w = D2PI * t;
  for (let i = 0; i < PQPER.length; i++) {
    const r = PQPER[i]!;
    const a = w / r[0];
    const s = Math.sin(a);
    const c = Math.cos(a);
    p += c * r[1] + s * r[3];
    q += c * r[2] + s * r[4];
  }
  w = 1;
  for (let i = 0; i < 4; i++) {
    p += PQPOL_P[i]! * w;
    q += PQPOL_Q[i]! * w;
    w *= t;
  }
  p *= DAS2R;
  q *= DAS2R;
  w = 1 - p * p - q * q;
  w = w < 0 ? 0 : Math.sqrt(w);
  const s = Math.sin(EPS0_LTP);
  const c = Math.cos(EPS0_LTP);
  out[0] = p;
  out[1] = -q * c - w * s;
  out[2] = -q * s + w * c;
}

// Memoria di lavoro.
const polo = new Float64Array(3);
const poloEcl = new Float64Array(3);
const eqx = new Float64Array(3);
const medio = new Float64Array(3);
const mat = new Float64Array(9);
const RIGHE_LTECM = [eqx, medio, poloEcl] as const;

/** out = a × b. */
function prodottoVettoriale(a: ArrayLike<number>, b: ArrayLike<number>, out: Scrivibile): void {
  const x = a[1]! * b[2]! - a[2]! * b[1]!;
  const y = a[2]! * b[0]! - a[0]! * b[2]!;
  const z = a[0]! * b[1]! - a[1]! * b[0]!;
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

/** Normalizzazione in loco come eraPn (vettore nullo lasciato a zero). */
function normalizza(v: Scrivibile): void {
  const m = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
  const f = m === 0 ? 0 : 1 / m;
  v[0] = v[0]! * f;
  v[1] = v[1]! * f;
  v[2] = v[2]! * f;
}

/** Matrice di precessione J2000 → equatore ed equinozio medi della data (eraLtp): P_data = R·P_J2000. */
export function ltp(epj: number, out: Scrivibile): void {
  ltpequ(epj, polo);
  ltpecl(epj, poloEcl);
  prodottoVettoriale(polo, poloEcl, eqx);
  normalizza(eqx);
  prodottoVettoriale(polo, eqx, medio);
  for (let i = 0; i < 3; i++) {
    out[i] = eqx[i]!;
    out[3 + i] = medio[i]!;
    out[6 + i] = polo[i]!;
  }
}

/** Precessione con bias ICRS (eraLtpb): P_data = R·P_ICRS. */
export function ltpb(epj: number, out: Scrivibile): void {
  ltp(epj, mat);
  for (let i = 0; i < 3; i++) {
    const r0 = mat[3 * i]!;
    const r1 = mat[3 * i + 1]!;
    const r2 = mat[3 * i + 2]!;
    out[3 * i] = r0 - r1 * BIAS_DR + r2 * BIAS_DX;
    out[3 * i + 1] = r0 * BIAS_DR + r1 + r2 * BIAS_DE;
    out[3 * i + 2] = -r0 * BIAS_DX - r1 * BIAS_DE + r2;
  }
}

/** Matrice ICRS → eclittica ed equinozio della data (eraLtecm): E_data = R·P_ICRS. */
export function ltecm(epj: number, out: Scrivibile): void {
  ltpequ(epj, polo);
  ltpecl(epj, poloEcl);
  prodottoVettoriale(polo, poloEcl, eqx);
  normalizza(eqx);
  prodottoVettoriale(poloEcl, eqx, medio);
  for (let i = 0; i < 3; i++) {
    const r = RIGHE_LTECM[i]!;
    const x = r[0]!;
    const y = r[1]!;
    const z = r[2]!;
    out[3 * i] = x - y * BIAS_DR + z * BIAS_DX;
    out[3 * i + 1] = x * BIAS_DR + y + z * BIAS_DE;
    out[3 * i + 2] = -x * BIAS_DX - y * BIAS_DE + z;
  }
}

/**
 * Matrice eclittica ed equinozio della data → eclittica J2000 della scena (§ 7.4):
 * M = R_x(ε0)·LTECMᵀ, ε0 = 84 381,448″, R_x come eraRx. Stessa catena della pipeline.
 */
export function eclitticaDataAJ2000(epj: number, out: Scrivibile): void {
  ltecm(epj, mat);
  const c = Math.cos(EPS0_SCENA);
  const s = Math.sin(EPS0_SCENA);
  for (let j = 0; j < 3; j++) {
    // Colonna j di LTECMᵀ = riga j di LTECM.
    const x = mat[3 * j]!;
    const y = mat[3 * j + 1]!;
    const z = mat[3 * j + 2]!;
    out[j] = x;
    out[3 + j] = c * y + s * z;
    out[6 + j] = -s * y + c * z;
  }
}

/** out = m·v (m 3×3 per righe); out può coincidere con v. */
export function applicaMatrice(m: ArrayLike<number>, v: ArrayLike<number>, out: Scrivibile): void {
  const x = v[0]!;
  const y = v[1]!;
  const z = v[2]!;
  out[0] = m[0]! * x + m[1]! * y + m[2]! * z;
  out[1] = m[3]! * x + m[4]! * y + m[5]! * z;
  out[2] = m[6]! * x + m[7]! * y + m[8]! * z;
}
