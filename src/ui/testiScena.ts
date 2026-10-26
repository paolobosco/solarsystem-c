// Testi della scena 3D (opzione `testi` di creaScena) nella lingua dell'interfaccia: il contatore delle lune viene
// dai testi, l'etichetta degli anelli di distanza dal formattatore (numero raggruppato e unità, § 11.13).

import { SPAZIO_NB, formatIntero } from './format';
import { TESTI_SCENA_BASE, UNITA } from './testi';

export const TESTI_SCENA = {
  contatoreLune: TESTI_SCENA_BASE.contatoreLune,
  anelloDistanza: (ua: number): string => `${formatIntero(ua)}${SPAZIO_NB}${UNITA.ua}`,
};
