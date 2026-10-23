// Scorciatoie da tastiera (§ 11.9, WCAG 2.1.4): interpretazione dei tasti globali, disattivabili,
// e dei tasti con il focus sulla mappa. Funzioni pure sui dati dell'evento.

export type AzioneGlobale =
  | 'trova'
  | 'riproduzione'
  | 'passoIndietro'
  | 'passoAvanti'
  | 'velocitaMinore'
  | 'velocitaMaggiore'
  | 'scorciatoie'
  | 'testuale';

export interface DatiTasto {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Natura dell'elemento con il focus. */
export interface ContestoTasto {
  /** Campo in cui si digita (input di testo, select, textarea, contenteditable). */
  campo: boolean;
  /** Elemento in cui Spazio ha un significato proprio (pulsante, casella, collegamento, summary, opzione). */
  attivabile: boolean;
  /** Una finestra modale è aperta. */
  dialogoAperto: boolean;
  /** Scorciatoie globali attive in Impostazioni. */
  attive: boolean;
}

/**
 * Simboli che su alcune tastiere si ottengono con Opzione (macOS, altKey) o AltGr (Windows di browser datati: ctrlKey
 * e altKey): con la tastiera italiana [ e ]. Per questi tasti Alt non esclude la scorciatoia.
 */
const SIMBOLI_CON_ALT = new Set(['[', ']', '/', '?']);

export function azioneGlobale(t: DatiTasto, c: ContestoTasto): AzioneGlobale | null {
  if (!c.attive || c.dialogoAperto || c.campo) return null;
  if (t.metaKey) return null;
  if (t.altKey ? !SIMBOLI_CON_ALT.has(t.key) : t.ctrlKey) return null;
  switch (t.key) {
    case '/':
      return 'trova';
    case ' ':
    case 'Spacebar':
      return c.attivabile ? null : 'riproduzione';
    case ',':
      return 'passoIndietro';
    case '.':
      return 'passoAvanti';
    case '[':
      return 'velocitaMinore';
    case ']':
      return 'velocitaMaggiore';
    case '?':
      return 'scorciatoie';
    case 't':
    case 'T':
      return 'testuale';
    default:
      return null;
  }
}

export type AzioneMappa =
  | { tipo: 'ruota'; dAzimut: number; dElevazione: number }
  | { tipo: 'sposta'; dx: number; dy: number }
  | { tipo: 'zoom'; fattore: number }
  | { tipo: 'selezionaCentro' }
  | { tipo: 'successivo'; verso: 1 | -1 }
  | { tipo: 'inquadra' }
  | { tipo: 'deseleziona' };

/** Passo di rotazione da tastiera: 5°. */
export const PASSO_ROTAZIONE = (5 * Math.PI) / 180;
/** Spostamento laterale: un decimo dell'altezza della vista. */
export const PASSO_SPOSTAMENTO = 0.1;
/** Zoom da tasti e pulsanti: fattori 10 (§ 10.3). */
export const FATTORE_ZOOM = 10;

/** Tasti con il focus sulla mappa (§ 11.9); Tab non è mai intercettato. */
export function azioneMappa(t: DatiTasto): AzioneMappa | null {
  if (t.ctrlKey || t.altKey || t.metaKey) return null;
  switch (t.key) {
    case 'ArrowLeft':
      return t.shiftKey ? { tipo: 'sposta', dx: -PASSO_SPOSTAMENTO, dy: 0 } : { tipo: 'ruota', dAzimut: -PASSO_ROTAZIONE, dElevazione: 0 };
    case 'ArrowRight':
      return t.shiftKey ? { tipo: 'sposta', dx: PASSO_SPOSTAMENTO, dy: 0 } : { tipo: 'ruota', dAzimut: PASSO_ROTAZIONE, dElevazione: 0 };
    case 'ArrowUp':
      return t.shiftKey ? { tipo: 'sposta', dx: 0, dy: PASSO_SPOSTAMENTO } : { tipo: 'ruota', dAzimut: 0, dElevazione: PASSO_ROTAZIONE };
    case 'ArrowDown':
      return t.shiftKey ? { tipo: 'sposta', dx: 0, dy: -PASSO_SPOSTAMENTO } : { tipo: 'ruota', dAzimut: 0, dElevazione: -PASSO_ROTAZIONE };
    case '+':
    case '=':
    case 'PageUp':
      return { tipo: 'zoom', fattore: 1 / FATTORE_ZOOM };
    case '-':
    case '\u2212':
    case '_':
    case 'PageDown':
      return { tipo: 'zoom', fattore: FATTORE_ZOOM };
    case 'Enter':
      return { tipo: 'selezionaCentro' };
    case 'n':
      return { tipo: 'successivo', verso: 1 };
    case 'N':
      return { tipo: 'successivo', verso: t.shiftKey ? -1 : 1 };
    case 'f':
    case 'F':
      return { tipo: 'inquadra' };
    case 'Escape':
      return { tipo: 'deseleziona' };
    default:
      return null;
  }
}

const RUOLI_ATTIVABILI = new Set(['button', 'checkbox', 'switch', 'option', 'combobox', 'menuitem', 'tab', 'link', 'radio']);

/** Contesto dell'elemento con il focus. */
export function contestoDa(el: Element | null, attive: boolean, dialogoAperto: boolean): ContestoTasto {
  let campo = false;
  let attivabile = false;
  if (el instanceof HTMLElement) {
    const tag = el.tagName;
    if (el.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT') campo = true;
    else if (tag === 'INPUT') {
      const tipo = (el as HTMLInputElement).type;
      campo = !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(tipo);
      attivabile = !campo;
    }
    const ruolo = el.getAttribute('role');
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || (ruolo !== null && RUOLI_ATTIVABILI.has(ruolo))) attivabile = true;
  }
  return { campo, attivabile, dialogoAperto, attive };
}
