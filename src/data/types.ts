// Contratti del modulo dati (§ 5.4, § 5.6 di docs/PROGETTO.md).

export type StatoRisorsa = 'assente' | 'in-caricamento' | 'pronto' | 'errore';

export interface DataStore {
  /** Stato della risorsa; chiave = percorso relativo in data/v1/. */
  stato(chiave: string): StatoRisorsa;
  /** Carica la risorsa; la Promise è condivisa tra richiedenti. */
  carica(chiave: string, segnale?: AbortSignal): Promise<ArrayBuffer>;
  /** Libera la risorsa (cache LRU). */
  rilascia(chiave: string): void;
  /** Notifica i cambi di stato; restituisce la funzione di annullamento. */
  onCambio(cb: (chiave: string, stato: StatoRisorsa) => void): () => void;
}
