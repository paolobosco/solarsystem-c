// Pannelli a comparsa non modali (modello "disclosure" APG): pulsante con aria-expanded,
// chiusura con Esc (focus restituito al pulsante), con un clic fuori dal pannello e, a richiesta,
// con il focus che esce da pulsante e pannello.

import { attributo } from './dom';

export interface Disclosure {
  readonly aperto: boolean;
  apri(focusDentro?: boolean): void;
  chiudi(restituisciFocus?: boolean): void;
  alterna(): void;
  distruggi(): void;
}

export interface OpzioniDisclosure {
  /** Chiamata dopo ogni apertura o chiusura. */
  onCambio?: (aperto: boolean) => void;
  /** Chiusura con un clic fuori (predefinito true). */
  chiudiFuori?: boolean;
  /** Elementi considerati interni oltre a pulsante e pannello. */
  interni?: () => Element[];
  /**
   * Chiusura quando il focus passa a un elemento fuori da pulsante e pannello (Tab oltre l'ultima voce): il pannello non
   * resta aperto sopra il controllo che riceve il focus (WCAG 2.2, SC 2.4.11). Un focus che non va a nessun elemento
   * (clic su un'area non attivabile del pannello) non lo chiude.
   */
  chiudiFocusFuori?: boolean;
}

export function creaDisclosure(pulsante: HTMLElement, pannello: HTMLElement, opzioni: OpzioniDisclosure = {}): Disclosure {
  let aperto = false;
  attributo(pulsante, 'aria-expanded', 'false');
  if (pannello.id) attributo(pulsante, 'aria-controls', pannello.id);
  pannello.hidden = true;

  function imposta(v: boolean): void {
    if (v === aperto) return;
    aperto = v;
    pannello.hidden = !v;
    attributo(pulsante, 'aria-expanded', v ? 'true' : 'false');
    opzioni.onCambio?.(v);
  }

  const suClic = () => imposta(!aperto);
  const suTasto = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && aperto) {
      e.stopPropagation();
      imposta(false);
      pulsante.focus();
    }
  };
  const suPuntatore = (e: PointerEvent) => {
    if (!aperto || opzioni.chiudiFuori === false) return;
    const t = e.target as Node | null;
    if (t === null) return;
    if (pulsante.contains(t) || pannello.contains(t)) return;
    if (opzioni.interni?.().some((el) => el.contains(t))) return;
    imposta(false);
  };
  const suFocusFuori = (e: FocusEvent) => {
    if (!aperto) return;
    const t = e.relatedTarget;
    if (!(t instanceof Node) || pulsante.contains(t) || pannello.contains(t)) return;
    if (opzioni.interni?.().some((el) => el.contains(t))) return;
    imposta(false);
  };
  pulsante.addEventListener('click', suClic);
  pannello.addEventListener('keydown', suTasto);
  pulsante.addEventListener('keydown', suTasto);
  document.addEventListener('pointerdown', suPuntatore, true);
  if (opzioni.chiudiFocusFuori === true) {
    pulsante.addEventListener('focusout', suFocusFuori);
    pannello.addEventListener('focusout', suFocusFuori);
  }

  return {
    get aperto() {
      return aperto;
    },
    apri(focusDentro = false) {
      imposta(true);
      if (focusDentro) {
        const primo = pannello.querySelector<HTMLElement>('button, input, select, [tabindex="0"]');
        primo?.focus();
      }
    },
    chiudi(restituisciFocus = false) {
      const conteneva = pannello.contains(document.activeElement);
      imposta(false);
      if (restituisciFocus || conteneva) pulsante.focus();
    },
    alterna() {
      imposta(!aperto);
    },
    distruggi() {
      pulsante.removeEventListener('click', suClic);
      pannello.removeEventListener('keydown', suTasto);
      pulsante.removeEventListener('keydown', suTasto);
      document.removeEventListener('pointerdown', suPuntatore, true);
      pulsante.removeEventListener('focusout', suFocusFuori);
      pannello.removeEventListener('focusout', suFocusFuori);
    },
  };
}
