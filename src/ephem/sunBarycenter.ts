// Stato baricentrico del Sole (§ 7.6.5 di docs/PROGETTO.md):
//   r_⊙ = -Σ GM_i·r_i / (GM_⊙ + Σ GM_i), v_⊙ analoga,
// con r_i, v_i stati eliocentrici dei nove baricentri dei sistemi planetari di DE441 (NAIF 1-9, § 7.3.2)
// e GM di DE441 (Park et al. 2021, AJ 161:105). Eclittica J2000, km e km/s. Nessuna allocazione.

import { GM_BARICENTRI, GM_SOLE, NAIF_BARICENTRI } from './constants';
import type { Scrivibile } from './equinoctial';

/** GM dei nove sistemi planetari nell'ordine NAIF 1..9 (km³/s²). */
export const GM_SISTEMI: readonly number[] = NAIF_BARICENTRI.map((n) => GM_BARICENTRI[n]!);

/** GM totale del Sole e dei nove sistemi (km³/s²): μ degli elementi baricentrici (§ 7.6.5). */
export const GM_TOTALE_KM3_S2 = GM_SISTEMI.reduce((s, g) => s + g, GM_SOLE);

/**
 * Stato del Sole rispetto al baricentro del Sistema solare (km, km/s) in out[0..5].
 * `baricentri`: 9 stati eliocentrici consecutivi (54 valori) nell'ordine NAIF 1..9.
 */
export function soleBaricentrico(baricentri: ArrayLike<number>, out: Scrivibile): void {
  for (let j = 0; j < 6; j++) {
    let s = 0;
    for (let i = 0; i < 9; i++) s += GM_SISTEMI[i]! * baricentri[6 * i + j]!;
    out[j] = -s / GM_TOTALE_KM3_S2;
  }
}
