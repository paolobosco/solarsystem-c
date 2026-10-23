// Selezione (§ 11.5.3, R9): tolleranza 12 px con mouse e 22 px con tocco; candidati da marcatori,
// dischi risolti (intersezione raggio-ellissoide su CPU in Float64) ed etichette; vince la
// precedenza di categoria, poi la distanza sullo schermo; un clic ripetuto entro 4 px e 1,5 s
// passa al candidato successivo. L'etichetta sotto il clic è un candidato in più (il suo corpo), che
// non cambia l'identità del punto: il ciclo prosegue anche se l'etichetta compare o sparisce tra due clic.

import { CICLO_DISTANZA_PX, CICLO_TEMPO_MS, TOLLERANZA_MOUSE_PX, TOLLERANZA_TOCCO_PX } from './costanti';

export type TipoPuntatore = 'mouse' | 'touch' | 'pen';

export function tolleranza(tipo: TipoPuntatore | string): number {
  return tipo === 'touch' ? TOLLERANZA_TOCCO_PX : TOLLERANZA_MOUSE_PX;
}

/** Dati di vista necessari alla selezione (vettori del motore). */
export interface DatiSelezione {
  readonly n: number;
  readonly schermo: Float64Array;
  /** 1 se il corpo è selezionabile tramite marcatore (marcatore disegnato, anche sfumato). */
  readonly marcatoreSelezionabile: Uint8Array;
  /** 1 se il disco è disegnato (raggio apparente ≥ 1 px). */
  readonly discoVisibile: Uint8Array;
  readonly precedenza: ArrayLike<number>;
  /** Intersezione del raggio del pixel con l'ellissoide del corpo (Float64). */
  colpisceDisco(ssid: number, x: number, y: number): boolean;
}

export interface EsitoSelezione {
  ssid: number;
  /** Indice (1..totale) del candidato scelto. */
  indice: number;
  totale: number;
}

export class Selettore {
  private readonly cand: Int32Array;
  private readonly dist: Float64Array;
  private nCand = 0;
  private ultimoX = Number.NaN;
  private ultimoY = Number.NaN;
  private ultimoT = Number.NEGATIVE_INFINITY;
  /** Candidati dell'ultimo clic senza l'etichetta, per riconoscere il clic ripetuto nello stesso punto. */
  private ultimaBase: readonly number[] = [];
  /** Candidati dell'ultimo clic, etichetta compresa, nell'ordine di scelta. */
  private ultimaLista: readonly number[] = [];
  private ultimoIndice = 0;

  constructor(n: number) {
    this.cand = new Int32Array(n);
    this.dist = new Float64Array(n);
  }

  /**
   * Candidati sotto il punto, ordinati per precedenza e distanza. `etichetta` è il corpo la cui etichetta si trova
   * sotto il punto (-1 se nessuna): è sempre un candidato, con la distanza dal suo marcatore.
   */
  candidati(d: DatiSelezione, x: number, y: number, tol: number, etichetta = -1): readonly number[] {
    this.nCand = 0;
    for (let i = 0; i < d.n; i++) {
      let dd = Number.POSITIVE_INFINITY;
      if (d.marcatoreSelezionabile[i] === 1 || d.discoVisibile[i] === 1 || i === etichetta) {
        const dx = d.schermo[2 * i]! - x;
        const dy = d.schermo[2 * i + 1]! - y;
        const ds = Math.sqrt(dx * dx + dy * dy);
        if (d.marcatoreSelezionabile[i] === 1 && ds <= tol) dd = ds;
        if (d.discoVisibile[i] === 1 && d.colpisceDisco(i, x, y)) dd = Math.min(dd, ds);
        if (i === etichetta) dd = Math.min(dd, ds);
      }
      if (dd < Number.POSITIVE_INFINITY) {
        this.cand[this.nCand] = i;
        this.dist[i] = dd;
        this.nCand++;
      }
    }
    const lista = Array.from(this.cand.subarray(0, this.nCand));
    lista.sort((a, b) => (d.precedenza[a]! - d.precedenza[b]!) || this.dist[a]! - this.dist[b]! || a - b);
    return lista;
  }

  /**
   * Clic valido in (x, y) all'istante ora: sceglie il candidato, con ciclo sui clic ripetuti. `etichetta` è il corpo
   * dell'etichetta su cui cade il clic (-1 se il clic cade sulla canvas): entra nella lista dei candidati come ogni
   * altro corpo, quindi l'etichetta non nasconde i marcatori che copre.
   */
  scegli(
    d: DatiSelezione,
    x: number,
    y: number,
    tipo: TipoPuntatore | string,
    ora: number,
    etichetta = -1,
  ): EsitoSelezione | null {
    const tol = tolleranza(tipo);
    const base = this.candidati(d, x, y, tol);
    const lista = etichetta >= 0 && !base.includes(etichetta) ? this.candidati(d, x, y, tol, etichetta) : base;
    if (lista.length === 0) {
      this.ultimoT = Number.NEGATIVE_INFINITY;
      return null;
    }
    // Il punto è lo stesso se i candidati propri (marcatori e dischi) sono gli stessi: l'etichetta può comparire o
    // sparire tra un clic e l'altro perché il layout cambia a ogni selezione.
    const ripetuto =
      ora - this.ultimoT <= CICLO_TEMPO_MS &&
      Math.hypot(x - this.ultimoX, y - this.ultimoY) <= CICLO_DISTANZA_PX &&
      base.length === this.ultimaBase.length &&
      base.every((v, i) => v === this.ultimaBase[i]);
    this.ultimoIndice = ripetuto ? this.successivo(lista) : 0;
    this.ultimaBase = base;
    this.ultimaLista = lista;
    this.ultimoX = x;
    this.ultimoY = y;
    this.ultimoT = ora;
    return { ssid: lista[this.ultimoIndice]!, indice: this.ultimoIndice + 1, totale: lista.length };
  }

  /** Indice in lista del primo candidato dopo quello scelto per ultimo, nell'ordine dell'ultima lista (ciclico). */
  private successivo(lista: readonly number[]): number {
    const prec = this.ultimaLista;
    for (let k = 1; k <= prec.length; k++) {
      const j = lista.indexOf(prec[(this.ultimoIndice + k) % prec.length]!);
      if (j >= 0) return j;
    }
    return 0;
  }

  /** Corpo sotto il puntatore per il passaggio (primo candidato) o -1. */
  sotto(d: DatiSelezione, x: number, y: number, tipo: TipoPuntatore | string): number {
    const lista = this.candidati(d, x, y, tolleranza(tipo));
    return lista.length > 0 ? lista[0]! : -1;
  }
}
