// Motore della riproduzione (§ 6.6, § 5.6 di docs/PROGETTO.md): jd = jd_inizio + v·(t - t_inizio)
// con t da performance.now(); riancoraggio a ogni cambio di velocità, direzione o data; nessun
// accumulo per incrementi. Si ferma ai limiti e attende i blocchi non pronti; si ferma anche quando i dati
// attesi mancano per un errore di caricamento (restano il messaggio e "Riprova", § 11.11).

import type { LimiteIntervallo } from '../time/types';
import { VELOCITA_S } from '../app/store';
import type { StoreApp } from '../app/store';

export interface LimitiScala {
  /** Limite inferiore incluso, nella scala d'ingresso. */
  min: number;
  /** Limite superiore escluso, nella scala d'ingresso. */
  maxEscl: number;
}

export interface DipendenzeMotore {
  store: StoreApp;
  /** Orologio monotono in ms (performance.now). */
  ora: () => number;
  /** Prossimo fotogramma (requestAnimationFrame). */
  pianifica: (cb: (t: number) => void) => number;
  annulla: (id: number) => void;
  limiti: () => LimitiScala;
  /** Dati pronti per l'istante (nella scala d'ingresso). */
  pronto: (jd: number) => boolean;
  /** Dati dell'istante mancanti per un errore di caricamento (nella scala d'ingresso). */
  inErrore?: (jd: number) => boolean;
  /** JD dell'istante attuale nella scala d'ingresso, per "Segui l'ora attuale". */
  adesso: () => number;
  /** Chiamata quando la riproduzione si ferma a un limite. */
  alLimite: (limite: LimiteIntervallo, jd: number) => void;
  /** Chiamata quando la riproduzione si ferma da sola per un errore di caricamento dei dati (già con `attiva` falso). */
  alErrore?: () => void;
}

const SECONDI_GIORNO = 86_400;

/** Giorni simulati per millisecondo reale. */
export function giorniPerMs(indiceVelocita: number, direzione: 1 | -1): number {
  const v = VELOCITA_S[Math.max(0, Math.min(VELOCITA_S.length - 1, indiceVelocita))] ?? 1;
  return (direzione * v) / SECONDI_GIORNO / 1000;
}

export class MotoreRiproduzione {
  private ancora: { jd: number; t: number } | null = null;
  private ultimoScritto: number | null = null;
  private richiesta: number | null = null;
  private ultimoT: number | null = null;
  /** Passo dell'ultimo fotogramma in giorni (regola di 1/8 del periodo, § 11.4.3). */
  passoFotogramma = 0;
  private readonly annullaOsservatori: (() => void)[] = [];

  constructor(private readonly d: DipendenzeMotore) {
    const s = d.store;
    this.annullaOsservatori.push(
      s.osserva(
        (st) => st.riproduzione.attiva,
        (attiva) => (attiva ? this.avvia() : this.ferma()),
      ),
      s.osserva(
        (st) => st.riproduzione.velocita * 2 + (st.riproduzione.direzione === 1 ? 1 : 0),
        () => this.riancora(),
      ),
      s.osserva(
        (st) => st.tempo.scala,
        () => this.riancora(),
      ),
    );
    if (s.get().riproduzione.attiva) this.avvia();
  }

  /** Forza il riancoraggio al prossimo fotogramma (data cambiata dall'esterno). */
  riancora(): void {
    this.ancora = null;
  }

  private avvia(): void {
    this.ancora = null;
    this.ultimoT = null;
    this.passoFotogramma = 0;
    if (this.richiesta === null) this.richiesta = this.d.pianifica((t) => this.tick(t));
  }

  private ferma(): void {
    if (this.richiesta !== null) this.d.annulla(this.richiesta);
    this.richiesta = null;
    this.ancora = null;
    this.passoFotogramma = 0;
    if (this.d.store.get().riproduzione.attesaDati) this.d.store.aggiorna('riproduzione', { attesaDati: false });
  }

  /** Un fotogramma della riproduzione; t in ms dello stesso orologio di `ora`. */
  tick(t: number): void {
    this.richiesta = null;
    const store = this.d.store;
    const s = store.get();
    if (!s.riproduzione.attiva) return;
    const jdCorrente = s.tempo.jd;
    const lim = this.d.limiti();
    const ultimo = lim.maxEscl - 1 / SECONDI_GIORNO;

    if (s.riproduzione.seguiOra) {
      const jd = Math.min(ultimo, Math.max(lim.min, this.d.adesso()));
      this.scrivi(jd, jdCorrente);
      this.richiesta = this.d.pianifica((tt) => this.tick(tt));
      return;
    }

    if (this.ancora === null || this.ultimoScritto !== jdCorrente) this.ancora = { jd: jdCorrente, t };
    const v = giorniPerMs(s.riproduzione.velocita, s.riproduzione.direzione);
    let jd = this.ancora.jd + v * (t - this.ancora.t);
    let limite: LimiteIntervallo | null = null;
    if (jd < lim.min) {
      jd = lim.min;
      limite = 'inferiore';
    } else if (jd > ultimo) {
      jd = ultimo;
      limite = 'superiore';
    }

    if (!this.d.pronto(jd)) {
      if (this.d.inErrore?.(jd)) {
        // Errore di caricamento: nessuna attesa senza fine, la riproduzione si ferma all'istante corrente.
        store.aggiorna('riproduzione', { attiva: false, attesaDati: false });
        this.d.alErrore?.();
        return;
      }
      // Attesa dei dati: l'istante resta fermo e si riancora finché il blocco non è pronto.
      this.ancora = { jd: jdCorrente, t };
      this.ultimoScritto = jdCorrente;
      this.passoFotogramma = 0;
      if (!s.riproduzione.attesaDati) store.aggiorna('riproduzione', { attesaDati: true });
      this.richiesta = this.d.pianifica((tt) => this.tick(tt));
      return;
    }

    store.transazione(() => {
      if (store.get().riproduzione.attesaDati) store.aggiorna('riproduzione', { attesaDati: false });
      this.scrivi(jd, jdCorrente);
      if (limite !== null) store.aggiorna('riproduzione', { attiva: false });
    });
    this.ultimoT = t;
    if (limite !== null) {
      this.d.alLimite(limite, jd);
      return;
    }
    if (store.get().riproduzione.attiva && this.richiesta === null) this.richiesta = this.d.pianifica((tt) => this.tick(tt));
  }

  private scrivi(jd: number, precedente: number): void {
    this.passoFotogramma = Math.abs(jd - precedente);
    this.ultimoScritto = jd;
    if (jd !== precedente) this.d.store.aggiorna('tempo', { jd });
  }

  /** Istante dell'ultimo fotogramma elaborato (ms), null prima del primo. */
  get ultimoFotogramma(): number | null {
    return this.ultimoT;
  }

  distruggi(): void {
    this.ferma();
    for (const a of this.annullaOsservatori) a();
  }
}
