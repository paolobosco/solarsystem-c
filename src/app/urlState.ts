// Stato nell'URL (RF8, § 11.12 di docs/PROGETTO.md): solo lo slug del corpo selezionato nell'hash (#marte), uguale
// nel sito e nella pagina singola. Nessuna query string; la data non entra mai nell'URL.

import { RE_SLUG } from '../data/catalogTypes';
import type { UrlState } from './types';

/** Caratteri dell'hash letti al più: oltre, il testo è comunque ignorato con il messaggio (§ 11.12). */
const MAX_HASH = 200;

/**
 * Testo dell'hash decodificato (percent-encoding) e senza spazi ai bordi; null se vuoto. Chi lo usa confronta lo slug in
 * minuscolo (#Marte = #marte) e segnala il collegamento ignorato con il testo letto (§ 11.12).
 */
export function slugDaHash(hash: string): string | null {
  const grezzo = (hash.startsWith('#') ? hash.slice(1) : hash).slice(0, MAX_HASH);
  let s: string;
  try {
    s = decodeURIComponent(grezzo);
  } catch {
    s = grezzo;
  }
  s = s.trim();
  return s === '' ? null : s;
}

export function creaUrlState(finestra: Window = window): UrlState {
  return {
    leggiSlug() {
      try {
        return slugDaHash(finestra.location.hash);
      } catch {
        return null;
      }
    },
    scriviSlug(slug) {
      try {
        const l = finestra.location;
        const base = l.pathname + l.search;
        const voluto = slug !== null && RE_SLUG.test(slug) ? `#${slug}` : '';
        if (l.hash === voluto) return;
        finestra.history.replaceState(finestra.history.state, '', voluto === '' ? base : voluto);
      } catch {
        // history non disponibile (pagina in un contesto limitato): l'hash resta invariato
      }
    },
    onCambio(cb) {
      const f = (): void => {
        try {
          cb(slugDaHash(finestra.location.hash));
        } catch {
          cb(null);
        }
      };
      finestra.addEventListener('hashchange', f);
      return () => finestra.removeEventListener('hashchange', f);
    },
  };
}
