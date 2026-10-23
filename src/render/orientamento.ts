// Orientamento dei corpi per impostori, texture, anelli e assi (R10, § 7.7 di docs/PROGETTO.md).
// Convenzione: matrice 3×3 per righe che porta le coordinate fisse nel corpo all'eclittica J2000;
// le colonne sono gli assi del corpo x (meridiano 0), y, z (polo nord, convenzionePolo del catalogo).

import type { TimeState } from '../time/types';

export interface FornitoreOrientamento {
  /**
   * Orientamento corpo → eclittica J2000 all'istante; false se il corpo non ha un modello
   * (assi fissi allineati all'eclittica J2000, § 7.6.4). Sincrono, senza allocazioni.
   */
  orientamento(ssid: number, t: TimeState, out: Float64Array): boolean;
}

export const IDENTITA_3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function identita3(out: Float64Array, off = 0): void {
  for (let i = 0; i < 9; i++) out[off + i] = IDENTITA_3[i]!;
}
