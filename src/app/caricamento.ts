// Caricamento dei blocchi secondo la data (§ 5.6, § 11.11 di docs/PROGETTO.md):
// - blocco della data corrente e blocco adiacente quando la data è entro 50 anni dal confine o la
//   riproduzione vi si dirige;
// - durante il trascinamento del regolo si aggiorna solo la data: il caricamento parte dopo 150 ms di
//   inattività o al rilascio;
// - AbortController per le richieste non più necessarie (annullate dopo l'avvio delle nuove); è annullamento
//   solo quello del proprio segnale: un AbortError con il segnale attivo (richiesta condivisa interrotta da
//   altri) porta a un nuovo tentativo;
// - stato "Caricamento dati per [intervallo]" finché i dati della data non sono pronti, anche quando la
//   riproduzione attende al confine;
// - errore con "Riprova"; i corpi interessati restano nascosti (stato 'caricamento'). L'errore di un blocco
//   vale finché il blocco è tra quelli voluti: quando la data lo esclude il messaggio si rimuove e al ritorno
//   parte un nuovo tentativo;
// - moon.bin, file unico per tutto l'intervallo, si carica a parte con un proprio messaggio d'errore, che
//   resta a ogni data fino al caricamento riuscito o a "Riprova".

import type { StoreApp } from '../app/store';
import { bloccoDi, fineBlocco, inizioBlocco } from '../data/binHeader';
import { GIORNI_ANNO_GIULIANO, K } from '../ephem/constants';
import type { ServizioEffemeridi } from '../ephem/service';
import type { MakeTimeState } from '../time/types';
import type { ErroreInterfaccia, StatoCaricamento } from '../ui/index';
import { T } from '../ui/testi.it';

/** Distanza dal confine entro cui si carica il blocco adiacente (§ 5.6). */
export const ANNI_ADIACENTE = 50;
/** Attesa dopo l'ultimo movimento del regolo (§ 5.6). */
export const ATTESA_REGOLO_MS = 150;
/** Identificatore del messaggio d'errore di moon.bin. */
export const ID_ERRORE_LUNA = 'luna';

export interface InterfacciaCaricamento {
  impostaCaricamento(s: StatoCaricamento | null): void;
  erroreBlocco(id: string, jd0: number, jd1: number, riprova: () => void): void;
  /** Errore di moon.bin. */
  mostraErrore(e: ErroreInterfaccia): void;
  rimuoviErrore(id: string): void;
}

export interface DipendenzeCaricatore {
  servizio: ServizioEffemeridi;
  store: StoreApp;
  makeTimeState: MakeTimeState;
  ui: InterfacciaCaricamento | null;
  pianifica?: (cb: () => void, ms: number) => number;
  annulla?: (id: number) => void;
}

function eAnnullamento(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

/** Blocchi voluti per l'istante: corrente, adiacenti entro 50 anni dal confine, verso della riproduzione. */
export function blocchiVoluti(jdTT: number, verso: -1 | 0 | 1): number[] {
  const k = bloccoDi(jdTT);
  if (k < 0) return [];
  const out = [k];
  const soglia = ANNI_ADIACENTE * GIORNI_ANNO_GIULIANO;
  if (k > 0 && (jdTT - inizioBlocco(k) < soglia || verso < 0)) out.push(k - 1);
  if (k < K - 1 && (fineBlocco(k) - jdTT < soglia || verso > 0)) out.push(k + 1);
  return out;
}

export class Caricatore {
  private readonly d: DipendenzeCaricatore;
  private readonly inVolo = new Map<number, AbortController>();
  /** Blocchi voluti il cui ultimo caricamento è fallito: nessuna nuova richiesta fino a "Riprova" o all'uscita dai voluti. */
  private readonly errori = new Set<number>();
  /** Richiesta di moon.bin in corso: non si annulla al cambio di data. */
  private luna: AbortController | null = null;
  private erroreLuna = false;
  private timer: number | null = null;
  private ultimoVoluto = '';
  /** Ultimo stato della barra di caricamento, per scrivere il DOM solo quando cambia. */
  private ultimoIndicatore = '';
  private readonly annullatori: (() => void)[] = [];
  private readonly pianifica: (cb: () => void, ms: number) => number;
  private readonly annulla: (id: number) => void;
  /** Blocchi adiacenti esclusi fino al primo frame (prima visualizzazione con il solo blocco della data). */
  private adiacenti = false;

  constructor(d: DipendenzeCaricatore) {
    this.d = d;
    this.pianifica = d.pianifica ?? ((cb, ms) => window.setTimeout(cb, ms));
    this.annulla = d.annulla ?? ((id) => window.clearTimeout(id));
    const s = d.store;
    this.annullatori.push(
      s.osserva(
        (st) => st.tempo,
        () => this.cambio(),
      ),
      s.osserva(
        (st) => st.riproduzione,
        () => this.cambio(),
      ),
      s.osserva(
        (st) => st.interfaccia.regoloInTrascinamento,
        (trascina) => {
          if (!trascina) this.esegui();
        },
      ),
      // Dati cambiati: se un blocco della data è stato rilasciato dalla cache, si richiede di nuovo.
      d.servizio.onDati(() => {
        this.pulisciErroriRisolti();
        if (this.inVolo.size === 0 && this.timer === null && this.daRichiedere()) {
          this.ultimoVoluto = '';
          this.esegui();
        } else this.aggiornaIndicatore();
      }),
    );
  }

  /** Abilita il caricamento dei blocchi adiacenti (dopo il primo frame) e lo avvia. */
  abilitaAdiacenti(): void {
    this.adiacenti = true;
    this.ultimoVoluto = '';
    this.esegui();
  }

  /** Istante corrente in TT. */
  jdTT(): number {
    const t = this.d.store.get().tempo;
    return this.d.makeTimeState(t.jd, t.scala).jdTT;
  }

  /** Vero se ci sono richieste in corso. */
  get occupato(): boolean {
    return this.inVolo.size > 0 || this.luna !== null || this.timer !== null;
  }

  /**
   * Vero se all'istante jdTT mancano dati per un errore di caricamento (blocco o moon.bin): senza "Riprova" o
   * un cambio di data non arriveranno. La riproduzione si ferma invece di attenderli (§ 5.6, § 11.11).
   */
  inErrore(jdTT: number): boolean {
    const k = bloccoDi(jdTT);
    return k >= 0 && this.erroreDi(k);
  }

  private erroreDi(k: number): boolean {
    return (this.errori.has(k) && !this.completo(k)) || (this.erroreLuna && !this.d.servizio.luna.pronta());
  }

  /** Dati del blocco k in arrivo: file del blocco mancanti e non in errore, oppure moon.bin in caricamento. */
  private inAttesa(k: number): boolean {
    if (!this.completo(k)) return !this.errori.has(k);
    return !this.d.servizio.luna.pronta() && !this.erroreLuna;
  }

  /** Dati della data mancanti e non bloccati da un errore, senza richieste in corso per moon.bin. */
  private daRichiedere(): boolean {
    const k = bloccoDi(this.jdTT());
    if (k < 0) return false;
    if (!this.completo(k) && !this.errori.has(k)) return true;
    return !this.d.servizio.luna.pronta() && !this.erroreLuna && this.luna === null;
  }

  /** Errori superati da un caricamento riuscito per altra via (ad esempio attendi()). */
  private pulisciErroriRisolti(): void {
    for (const k of this.errori) {
      if (this.completo(k)) {
        this.errori.delete(k);
        this.d.ui?.rimuoviErrore(idErrore(k));
      }
    }
    if (this.erroreLuna && this.d.servizio.luna.pronta()) {
      this.erroreLuna = false;
      this.d.ui?.rimuoviErrore(ID_ERRORE_LUNA);
    }
  }

  private cambio(): void {
    if (this.d.store.get().interfaccia.regoloInTrascinamento) {
      if (this.timer !== null) this.annulla(this.timer);
      this.timer = this.pianifica(() => {
        this.timer = null;
        this.esegui();
      }, ATTESA_REGOLO_MS);
      this.aggiornaIndicatore();
      return;
    }
    this.esegui();
  }

  /** Avvia i caricamenti necessari alla data corrente. */
  esegui(): void {
    if (this.timer !== null) {
      this.annulla(this.timer);
      this.timer = null;
    }
    const s = this.d.store.get();
    const r = s.riproduzione;
    const verso: -1 | 0 | 1 = r.attiva && !r.seguiOra ? r.direzione : 0;
    const jd = this.jdTT();
    const tutti = blocchiVoluti(jd, verso);
    const voluti = this.adiacenti ? tutti : tutti.slice(0, 1);
    const chiave = voluti.join(',');
    const cambiati = chiave !== this.ultimoVoluto;
    this.ultimoVoluto = chiave;
    // Errori dei blocchi non più voluti: il messaggio non riguarda la data mostrata; al ritorno nuovo tentativo.
    for (const k of this.errori) {
      if (!voluti.includes(k)) {
        this.errori.delete(k);
        this.d.ui?.rimuoviErrore(idErrore(k));
      }
    }
    if (voluti.length > 0 && this.luna === null && !this.erroreLuna && !this.d.servizio.luna.pronta()) this.avviaLuna();
    for (const k of voluti) {
      if (this.inVolo.has(k) || this.errori.has(k)) continue;
      // Blocchi già caricati: nuova richiesta solo al cambio dell'insieme, per aggiornare l'uso nella cache LRU.
      if (!cambiati && this.completo(k)) continue;
      this.avvia(k);
    }
    // Annulla dopo aver avviato le nuove richieste: i file condivisi restano richiesti.
    for (const [k, ac] of this.inVolo) {
      if (!voluti.includes(k)) {
        ac.abort();
        this.inVolo.delete(k);
      }
    }
    this.aggiornaIndicatore();
  }

  /** File del blocco k (pianeti, satelliti, piccoli corpi) registrati; moon.bin è a parte. */
  private completo(k: number): boolean {
    const sv = this.d.servizio;
    return sv.bloccoCaricato('pianeti', k) && sv.bloccoCaricato('satelliti', k) && sv.bloccoCaricato('piccoli-corpi', k);
  }

  private avvia(k: number): void {
    const ac = new AbortController();
    this.inVolo.set(k, ac);
    const centro = 0.5 * (inizioBlocco(k) + fineBlocco(k));
    this.d.servizio.prefetch(centro, centro, ac.signal, false).then(
      () => {
        if (this.inVolo.get(k) === ac) this.inVolo.delete(k);
        this.d.ui?.rimuoviErrore(idErrore(k));
        this.aggiornaIndicatore();
      },
      (e: unknown) => {
        if (this.inVolo.get(k) === ac) this.inVolo.delete(k);
        if (ac.signal.aborted) {
          this.aggiornaIndicatore();
          return;
        }
        if (eAnnullamento(e)) {
          this.ripeti();
          return;
        }
        this.errori.add(k);
        this.d.ui?.erroreBlocco(idErrore(k), inizioBlocco(k), fineBlocco(k), () => this.riprova(k));
        this.aggiornaIndicatore();
      },
    );
  }

  private avviaLuna(): void {
    const ac = new AbortController();
    this.luna = ac;
    this.d.servizio.caricaLuna(ac.signal).then(
      () => {
        if (this.luna === ac) this.luna = null;
        this.d.ui?.rimuoviErrore(ID_ERRORE_LUNA);
        this.aggiornaIndicatore();
      },
      (e: unknown) => {
        if (this.luna === ac) this.luna = null;
        if (ac.signal.aborted) {
          this.aggiornaIndicatore();
          return;
        }
        if (eAnnullamento(e)) {
          this.ripeti();
          return;
        }
        this.erroreLuna = true;
        this.d.ui?.mostraErrore({ id: ID_ERRORE_LUNA, testo: T.messaggi.luna, riprova: () => this.riprovaLuna() });
        this.aggiornaIndicatore();
      },
    );
  }

  /** Nuovo tentativo dopo una richiesta interrotta da altri: subito, o alla fine dell'attesa del regolo. */
  private ripeti(): void {
    if (this.timer === null) this.esegui();
    else this.aggiornaIndicatore();
  }

  /** "Riprova" dopo un errore di caricamento del blocco k. */
  riprova(k: number): void {
    this.errori.delete(k);
    this.d.ui?.rimuoviErrore(idErrore(k));
    this.ultimoVoluto = '';
    this.esegui();
  }

  /** "Riprova" dopo un errore di caricamento di moon.bin. */
  riprovaLuna(): void {
    this.erroreLuna = false;
    this.d.ui?.rimuoviErrore(ID_ERRORE_LUNA);
    this.esegui();
  }

  /** Attende che i dati della data corrente siano pronti (o rifiuta con l'errore del blocco). */
  async attendi(): Promise<void> {
    const jd = this.jdTT();
    if (this.d.servizio.pronto(jd)) return;
    await this.d.servizio.prefetch(jd, jd);
  }

  /** Barra di caricamento: dati della data assenti, oppure riproduzione in attesa al confine. */
  aggiornaIndicatore(): void {
    const ui = this.d.ui;
    if (ui === null) return;
    const jd = this.jdTT();
    const sv = this.d.servizio;
    const k = bloccoDi(jd);
    let atteso = -1;
    if (k >= 0 && !sv.pronto(jd) && this.inAttesa(k)) atteso = k;
    else {
      const r = this.d.store.get().riproduzione;
      if (r.attesaDati && k >= 0) {
        const k2 = Math.max(0, Math.min(K - 1, k + r.direzione));
        if (!this.erroreDi(k2)) atteso = k2;
      }
    }
    const stato = String(atteso);
    if (stato === this.ultimoIndicatore) return;
    this.ultimoIndicatore = stato;
    ui.impostaCaricamento(atteso < 0 ? null : { jd0: inizioBlocco(atteso), jd1: fineBlocco(atteso) });
  }

  distruggi(): void {
    for (const a of this.annullatori) a();
    for (const ac of this.inVolo.values()) ac.abort();
    this.inVolo.clear();
    this.luna?.abort();
    this.luna = null;
    if (this.timer !== null) this.annulla(this.timer);
  }
}

function idErrore(k: number): string {
  return `blocco:${k}`;
}
