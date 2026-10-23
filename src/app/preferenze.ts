// Preferenze locali (RF8, RNF7 di docs/PROGETTO.md): localStorage sempre dentro try/catch, valori in JSON.
// Se localStorage non è disponibile o lancia eccezioni, le preferenze restano in memoria per la sessione.
// La data non è mai salvata: le chiavi che la riguardano sono rifiutate.

import type { Preferenze } from './types';

/** Chiavi vietate: la data e l'istante non entrano nelle preferenze (RF8). */
const VIETATE = /(^|\.)(data|tempo|jd|istante)(\.|$)/i;

function archivioLocale(): Storage | null {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function creaPreferenze(archivio: () => Storage | null = archivioLocale): Preferenze {
  const memoria = new Map<string, string>();
  return {
    leggi<T>(k: string, def: T): T {
      let grezzo: string | null | undefined = memoria.get(k);
      if (grezzo === undefined) {
        try {
          grezzo = archivio()?.getItem(k) ?? null;
        } catch {
          grezzo = null;
        }
      }
      if (grezzo === null || grezzo === undefined) return def;
      try {
        return JSON.parse(grezzo) as T;
      } catch {
        return def;
      }
    },
    scrivi(k: string, v: unknown): void {
      if (VIETATE.test(k)) return;
      let testo: string;
      try {
        testo = JSON.stringify(v);
      } catch {
        return;
      }
      if (testo === undefined) return;
      memoria.set(k, testo);
      try {
        archivio()?.setItem(k, testo);
      } catch {
        // spazio esaurito, archivio bloccato o modalità privata: resta il valore in memoria
      }
    },
  };
}
