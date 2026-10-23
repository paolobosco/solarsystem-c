// Interpolazione su griglia uniforme (§ 7.3.3, § 7.6.3 di docs/PROGETTO.md), senza allocazioni.
// Stesso algoritmo e stesso ordine delle operazioni di scripts/pipeline/common/interp.py.
// - Lagrange a 8 punti: x = (t - tPrimo)/h, j = floor(x) limitato a [3, N - 5], u = x - j;
//   campioni j-3..j+4; w_m = Π_{n≠m}(u - n)/D_m con prodotto per n crescente.
// - Hermite cubica: j = floor(x) limitato a [0, N - 2], s = x - j.

import type { Scrivibile } from './equinoctial';

export const PUNTI_LAGRANGE = 8;

/** D_m = Π_{n≠m}(m - n) per m = -3..4. */
export const DENOMINATORI_LAGRANGE: readonly number[] = [-5040, 720, -240, 144, -144, 240, -720, 5040];

/** Indice del nodo sinistro di x, limitato a [jMin, jMax]. */
export function nodoSinistro(x: number, jMin: number, jMax: number): number {
  const j = Math.floor(x);
  return j < jMin ? jMin : j > jMax ? jMax : j;
}

/** Pesi dei campioni j-3..j+4 per la frazione u, in out[0..7]. */
export function pesiLagrange8(u: number, out: Scrivibile): void {
  for (let im = 0; im < PUNTI_LAGRANGE; im++) {
    const m = im - 3;
    let num = 1;
    for (let n = -3; n <= 4; n++) if (n !== m) num = num * (u - n);
    out[im] = num / DENOMINATORI_LAGRANGE[im]!;
  }
}

const pesi = new Float64Array(PUNTI_LAGRANGE);

/**
 * Lagrange a 8 punti su campioni in righe di `colonne` valori (riga j a partire da base + j·colonne).
 * Scrive in out[0..colonne-1] i valori interpolati a t. Richiede nCampioni ≥ 8.
 */
export function lagrange8(
  t: number,
  tPrimo: number,
  h: number,
  valori: ArrayLike<number>,
  nCampioni: number,
  colonne: number,
  out: Scrivibile,
  base = 0,
): void {
  const x = (t - tPrimo) / h;
  const j = nodoSinistro(x, 3, nCampioni - 5);
  pesiLagrange8(x - j, pesi);
  const primo = base + (j - 3) * colonne;
  for (let c = 0; c < colonne; c++) {
    let acc = 0;
    for (let im = 0; im < PUNTI_LAGRANGE; im++) acc += pesi[im]! * valori[primo + im * colonne + c]!;
    out[c] = acc;
  }
}

/** Basi di Hermite h00, h10, h01, h11 e derivate rispetto a s, in out[0..7]. */
export function basiHermite(s: number, out: Scrivibile): void {
  const s2 = s * s;
  const s3 = s2 * s;
  out[0] = 2 * s3 - 3 * s2 + 1;
  out[1] = s3 - 2 * s2 + s;
  out[2] = -2 * s3 + 3 * s2;
  out[3] = s3 - s2;
  out[4] = 6 * s2 - 6 * s;
  out[5] = 3 * s2 - 4 * s + 1;
  out[6] = -6 * s2 + 6 * s;
  out[7] = 3 * s2 - 2 * s;
}

const basi = new Float64Array(8);

/**
 * Hermite cubica su righe [p (3), v (3)] (riga j a partire da base + 6·j), velocità nell'unità di h.
 * Scrive out[0..2] posizione e out[3..5] velocità (unità di posizione per unità di h).
 * p = h00·p0 + h10·(h·v0) + h01·p1 + h11·(h·v1); v = (d00·p0 + d01·p1)/h + d10·v0 + d11·v1.
 */
export function hermiteCubica(
  t: number,
  tPrimo: number,
  h: number,
  dati: ArrayLike<number>,
  nCampioni: number,
  out: Scrivibile,
  base = 0,
): void {
  const x = (t - tPrimo) / h;
  const j = nodoSinistro(x, 0, nCampioni - 2);
  basiHermite(x - j, basi);
  const h00 = basi[0]!;
  const h10 = basi[1]!;
  const h01 = basi[2]!;
  const h11 = basi[3]!;
  const d00 = basi[4]!;
  const d10 = basi[5]!;
  const d01 = basi[6]!;
  const d11 = basi[7]!;
  const r0 = base + 6 * j;
  const r1 = r0 + 6;
  for (let c = 0; c < 3; c++) {
    const p0 = dati[r0 + c]!;
    const p1 = dati[r1 + c]!;
    const v0 = dati[r0 + 3 + c]!;
    const v1 = dati[r1 + 3 + c]!;
    out[c] = h00 * p0 + h10 * (h * v0) + h01 * p1 + h11 * (h * v1);
    out[3 + c] = (d00 * p0 + d01 * p1) / h + d10 * v0 + d11 * v1;
  }
}
