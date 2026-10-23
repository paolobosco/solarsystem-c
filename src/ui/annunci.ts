// Live region unica (§ 11.9): un annuncio al massimo ogni 1,5 s. In riproduzione tace solo per gli annunci dovuti
// al tempo; quelli che seguono un'azione dell'utente si pronunciano sempre (WCAG 2.2, SC 4.1.3).
// Gli annunci ravvicinati si riducono all'ultimo, pubblicato allo scadere dell'intervallo.

export const INTERVALLO_ANNUNCI_MS = 1500;

export interface DipendenzeAnnunci {
  /** Scrive il testo nella live region. */
  scrivi: (testo: string) => void;
  /** Orologio monotono in ms. */
  ora: () => number;
  pianifica: (cb: () => void, ms: number) => number;
  annulla: (id: number) => void;
  /** Vero durante la riproduzione: gli annunci dovuti al tempo si scartano. */
  silenzioso: () => boolean;
}

export interface OpzioniAnnuncio {
  /**
   * Annuncio prodotto dal tempo e non da un'azione dell'utente (caricamento dei dati per l'istante raggiunto): in
   * riproduzione si scarta. Senza questa opzione l'annuncio segue un'azione dell'utente e si pronuncia sempre.
   */
  dalTempo?: boolean;
}

interface Annuncio {
  testo: string;
  dalTempo: boolean;
}

export class Annunciatore {
  private ultimo = Number.NEGATIVE_INFINITY;
  private inAttesa: Annuncio | null = null;
  private timer: number | null = null;
  /** Ultimo annuncio scritto nella regione. */
  private pubblicato: Annuncio | null = null;

  constructor(private readonly d: DipendenzeAnnunci) {}

  annuncia(testo: string, opzioni: OpzioniAnnuncio = {}): void {
    const dalTempo = opzioni.dalTempo ?? false;
    if (testo.length === 0) return;
    if (dalTempo && this.d.silenzioso()) return;
    const adesso = this.d.ora();
    const attesa = this.ultimo + INTERVALLO_ANNUNCI_MS - adesso;
    if (attesa <= 0 && this.timer === null) {
      this.pubblica({ testo, dalTempo }, adesso);
      return;
    }
    this.inAttesa = { testo, dalTempo };
    if (this.timer === null) this.timer = this.d.pianifica(() => this.scaduto(), Math.max(0, attesa));
  }

  /**
   * Sostituisce un annuncio superato (ad esempio "Caricamento dati ..." a caricamento concluso) con `nuovo`: se
   * `testo` è in attesa prende il suo posto; se è l'ultimo scritto nella regione si annuncia `nuovo`. Il nuovo
   * annuncio conserva l'origine di quello sostituito.
   */
  sostituisci(testo: string, nuovo: string): void {
    if (this.inAttesa !== null) {
      if (this.inAttesa.testo === testo) this.inAttesa = { testo: nuovo, dalTempo: this.inAttesa.dalTempo };
      return;
    }
    if (this.pubblicato?.testo === testo) this.annuncia(nuovo, { dalTempo: this.pubblicato.dalTempo });
  }

  /**
   * Scarta l'annuncio in attesa se dovuto al tempo (all'avvio della riproduzione); quello di un'azione dell'utente
   * resta e si pubblica allo scadere dell'intervallo.
   */
  scarta(): void {
    if (this.inAttesa === null || !this.inAttesa.dalTempo) return;
    this.inAttesa = null;
    if (this.timer !== null) {
      this.d.annulla(this.timer);
      this.timer = null;
    }
  }

  private scaduto(): void {
    this.timer = null;
    const a = this.inAttesa;
    this.inAttesa = null;
    if (a === null) return;
    if (a.dalTempo && this.d.silenzioso()) return;
    this.pubblica(a, this.d.ora());
  }

  private pubblica(a: Annuncio, adesso: number): void {
    this.ultimo = adesso;
    this.pubblicato = a;
    this.d.scrivi(a.testo);
  }
}

/** Scrittura nella live region: un testo uguale al precedente si ripete alternando uno spazio finale. */
export function scrittoreRegione(regione: HTMLElement): (testo: string) => void {
  let alterna = false;
  return (testo: string) => {
    if (regione.textContent === testo || regione.textContent === testo + '\u00a0') {
      alterna = !alterna;
      regione.textContent = alterna ? testo + '\u00a0' : testo;
    } else {
      alterna = false;
      regione.textContent = testo;
    }
  };
}
