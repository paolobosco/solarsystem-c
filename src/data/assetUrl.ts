// Risoluzione degli URL delle risorse (§ 5.4, § 5.7, RNF7 di docs/PROGETTO.md):
// percorsi relativi alla pagina, senza host, query string o frammento.

const NON_AMMESSO = /^[a-z][a-z0-9+.-]*:|^\/|[?#\\]|(^|\/)\.\.(\/|$)/i;

/** Verifica che il percorso sia relativo e interno alla base; lancia un errore altrimenti. */
export function verificaPercorso(percorso: string): void {
  if (percorso.length === 0 || NON_AMMESSO.test(percorso)) {
    throw new Error(`Percorso di risorsa non ammesso: "${percorso}"`);
  }
}

/** URL assoluto di una risorsa rispetto a una base esplicita. */
export function risolviAsset(percorso: string, base: string): string {
  verificaPercorso(percorso);
  return new URL(percorso, base).href;
}

/** URL assoluto di una risorsa: new URL(percorso, document.baseURI).href. */
export function assetUrl(percorso: string): string {
  return risolviAsset(percorso, document.baseURI);
}
