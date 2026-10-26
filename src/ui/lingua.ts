// Lingua dell'interfaccia (RNF8, RF8 di docs/PROGETTO.md): italiano o inglese, scelta una sola volta all'avvio.
// Ordine: preferenza salvata; altrimenti lingua del browser (la prima tra quelle con prefisso "it" o "en": italiano se
// è "it", inglese altrimenti, anche se nessuna corrisponde); senza browser (Node, Vitest) italiano.
// La preferenza è letta da localStorage dentro try/catch, come in src/app/preferenze.ts, che la scrive.

export type Lingua = 'it' | 'en';

/** Chiave della preferenza (valore JSON: "it" o "en"). */
export const CHIAVE_LINGUA = 'ss.ui.lingua';

export function eLingua(x: unknown): x is Lingua {
  return x === 'it' || x === 'en';
}

/**
 * Lingua da una preferenza e dall'elenco delle lingue del browser, in ordine di preferenza. Le sole lingue considerate
 * sono "it" e "en" (qualsiasi variante regionale); senza corrispondenza inglese.
 */
export function sceglieLingua(preferenza: unknown, linguaggiBrowser: readonly string[]): Lingua {
  if (eLingua(preferenza)) return preferenza;
  for (const l of linguaggiBrowser) {
    const primo = l.trim().toLowerCase().split(/[-_]/)[0];
    if (primo === 'it') return 'it';
    if (primo === 'en') return 'en';
  }
  return 'en';
}

/** Ambiente da cui si ricava la lingua: separato per poterlo sostituire nelle prove. */
export interface AmbienteLingua {
  /** Preferenza salvata, già decodificata (null se assente o illeggibile). */
  preferenza(): unknown;
  /** Lingue del browser; null senza browser. */
  linguaggi(): readonly string[] | null;
}

function preferenzaSalvata(): unknown {
  try {
    const grezzo = globalThis.localStorage?.getItem(CHIAVE_LINGUA);
    return grezzo === null || grezzo === undefined ? null : (JSON.parse(grezzo) as unknown);
  } catch {
    return null;
  }
}

function linguaggiBrowser(): readonly string[] | null {
  // Node 22 espone un navigator proprio: il browser c'è solo con la finestra.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const elenco = navigator.languages;
  if (Array.isArray(elenco) && elenco.length > 0) return elenco as readonly string[];
  return typeof navigator.language === 'string' && navigator.language !== '' ? [navigator.language] : [];
}

const AMBIENTE_BROWSER: AmbienteLingua = { preferenza: preferenzaSalvata, linguaggi: linguaggiBrowser };

/** Lingua iniziale nell'ambiente dato (predefinito: quello corrente). */
export function determinaLingua(ambiente: AmbienteLingua = AMBIENTE_BROWSER): Lingua {
  const l = ambiente.linguaggi();
  if (l === null) return 'it';
  return sceglieLingua(ambiente.preferenza(), l);
}

/** Lingua dell'interfaccia, fissata al caricamento del modulo: per cambiarla la pagina si ricarica. */
export const LINGUA: Lingua = determinaLingua();
