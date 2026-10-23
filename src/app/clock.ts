// Orologio dell'applicazione (§ 5.4, § 11.12 di docs/PROGETTO.md): unico punto del codice che usa Date.
// L'orologio del sistema è in UTC; la differenza UT1 - UTC (al massimo 0,9 s, IERS) è trascurata.

/** JD dell'epoca Unix (1970-01-01 00:00 UTC). */
export const JD_EPOCA_UNIX = 2_440_587.5;

const MS_GIORNO = 86_400_000;

/** Istante corrente in JD UT. */
export function adessoJdUT(): number {
  return JD_EPOCA_UNIX + Date.now() / MS_GIORNO;
}
