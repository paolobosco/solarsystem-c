// Ricerca del segmento di una serie temporale, comune ai lettori dei binari (serie.ts, satsReader.ts).

/** Indice dell'ultimo inizio ≤ t in un vettore crescente (bisezione), -1 se nessuno. */
export function ultimoInizio(inizi: Float64Array, t: number): number {
  let lo = 0;
  let hi = inizi.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (inizi[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
