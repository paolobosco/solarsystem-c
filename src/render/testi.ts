// Testi visibili prodotti dal modulo di rendering (RNF8). L'interfaccia può sostituirli con
// quelli di src/ui/testiScena.ts tramite l'opzione `testi` di creaScena.

export interface TestiScena {
  /** Contatore delle lune nascoste vicino al pianeta (§ 11.5.1). */
  contatoreLune(n: number): string;
  /** Etichetta di un anello di distanza (R11). */
  anelloDistanza(ua: number): string;
}

export const TESTI_SCENA: TestiScena = {
  contatoreLune: (n) => (n === 1 ? '+1 luna' : `+${n} lune`),
  anelloDistanza: (ua) => `${ua} UA`,
};
