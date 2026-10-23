// Contratti del modulo applicazione (§ 5.4, RF8, § 11.12 di docs/PROGETTO.md).

/** Stato nell'URL: solo lo slug del corpo a fuoco nell'hash. Implementazione unica: hash. */
export interface UrlState {
  /** Testo dell'hash decodificato, null se vuoto; è uno slug valido se in minuscolo rispetta ^[a-z0-9-]{1,40}$. */
  leggiSlug(): string | null;
  /** Scrive l'hash con history.replaceState, dentro try/catch. */
  scriviSlug(slug: string | null): void;
  /** Ascolta hashchange; restituisce la funzione di annullamento. */
  onCambio(cb: (slug: string | null) => void): () => void;
}

/** Preferenze locali in localStorage, dentro try/catch; la data non vi entra mai. */
export interface Preferenze {
  leggi<T>(k: string, def: T): T;
  scrivi(k: string, v: unknown): void;
}
