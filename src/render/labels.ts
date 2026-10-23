// Etichette (§ 11.5.2): disposizione golosa su griglia di bucket in pixel, costo O(n),
// ricalcolo al massimo 10 volte al secondo con isteresi di 300 ms; livello HTML con
// aggiornamenti solo tramite transform. Le zone coperte dai pannelli dell'interfaccia (§ 11.3) e il marcatore del
// corpo selezionato, con il suo anello, valgono come occupati: un'etichetta che li tocca prova l'altro lato,
// altrimenti resta nascosta (quelle forzate restano visibili).

import {
  COLORE_ETICHETTE_ANELLI,
  COLORE_SPAZIO,
  COLORE_TESTO_ETICHETTE,
  ETICHETTE_ALTEZZA_PX,
  ETICHETTE_CELLA_PX,
  ETICHETTE_INTERVALLO_MS,
  ETICHETTE_ISTERESI_MS,
  ETICHETTE_LARGHEZZA_STRETTA_PX,
  ETICHETTE_MAX_LARGO,
  ETICHETTE_MAX_STRETTO,
} from './costanti';
import type { ZonaSchermo } from './tipi';

/** Classi di priorità: 0 forzate (selezione, puntatore), 1 Sole e pianeti, 2 pianeti nani, 3 orbita attiva, 4 lune del pianeta a fuoco, 5 altri, 6 anelli di distanza. */
export const NUMERO_CLASSI = 7;
const MAX_NODI = 8192;

export class LayoutEtichette {
  readonly n: number;
  // Ingressi del frame.
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Scostamento orizzontale dal punto di ancoraggio (px). */
  readonly scostamento: Float32Array;
  readonly larghezza: Float32Array;
  readonly candidata: Uint8Array;
  readonly classe: Uint8Array;
  /** Ordine statico (indici), usato dentro ogni classe. */
  ordine: Int32Array;
  // Uscite.
  readonly mostrata: Uint8Array;
  readonly desiderata: Uint8Array;
  /** 0 a destra del punto, 1 a sinistra. */
  readonly lato: Uint8Array;
  readonly latoDesiderato: Uint8Array;
  /** Istante dell'ultimo cambio applicato. */
  private readonly tCambio: Float64Array;
  private ultimo = Number.NEGATIVE_INFINITY;
  /** Ingressi dell'ultima disposizione: un cambio successivo richiede un'altra disposizione. */
  private readonly candidataDisposta: Uint8Array;
  private readonly xDisposta: Float64Array;
  private readonly yDisposta: Float64Array;
  // Griglia di bucket con liste concatenate e timbro per evitare l'azzeramento.
  private colonne = 0;
  private righe = 0;
  private testa = new Int32Array(0);
  private timbroCella = new Int32Array(0);
  private timbro = 0;
  private readonly succ = new Int32Array(MAX_NODI);
  private readonly voce = new Int32Array(MAX_NODI);
  private readonly rx0: Float64Array;
  private readonly ry0: Float64Array;
  private readonly rx1: Float64Array;
  private readonly ry1: Float64Array;
  /** Zone coperte dall'interfaccia: x0, y0, x1, y1 per zona. */
  private zone = new Float64Array(0);
  /** Corpo il cui marcatore con l'anello di selezione le altre etichette non coprono (-1: nessuno) e semilato del riquadro (px). */
  private protetto = -1;
  private raggioProtetto = 0;

  constructor(n: number) {
    this.n = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.scostamento = new Float32Array(n);
    this.larghezza = new Float32Array(n);
    this.candidata = new Uint8Array(n);
    this.classe = new Uint8Array(n);
    this.ordine = Int32Array.from({ length: n }, (_, i) => i);
    this.mostrata = new Uint8Array(n);
    this.desiderata = new Uint8Array(n);
    this.lato = new Uint8Array(n);
    this.latoDesiderato = new Uint8Array(n);
    this.tCambio = new Float64Array(n).fill(Number.NEGATIVE_INFINITY);
    this.candidataDisposta = new Uint8Array(n);
    this.xDisposta = new Float64Array(n);
    this.yDisposta = new Float64Array(n);
    this.rx0 = new Float64Array(n);
    this.ry0 = new Float64Array(n);
    this.rx1 = new Float64Array(n);
    this.ry1 = new Float64Array(n);
  }

  /** Forza il ricalcolo al prossimo aggiornamento (cambio di selezione, filtri, livelli). */
  invalida(): void {
    this.ultimo = Number.NEGATIVE_INFINITY;
  }

  /** Zone coperte dai pannelli (px CSS rispetto alla vista); true se sono cambiate. */
  impostaZone(zone: readonly ZonaSchermo[]): boolean {
    const z = new Float64Array(4 * zone.length);
    zone.forEach((r, k) => {
      z[4 * k] = r.x;
      z[4 * k + 1] = r.y;
      z[4 * k + 2] = r.x + r.larghezza;
      z[4 * k + 3] = r.y + r.altezza;
    });
    if (z.length === this.zone.length && z.every((v, k) => v === this.zone[k])) return false;
    this.zone = z;
    this.invalida();
    return true;
  }

  /**
   * Marcatore protetto (§ 11.5.2): riquadro di semilato `raggio` px attorno al corpo `i` (-1: nessuno), che le etichette
   * degli altri corpi non coprono; l'etichetta del corpo stesso, accanto all'anello, è esclusa. true se è cambiato.
   */
  impostaProtetto(i: number, raggio: number): boolean {
    if (i === this.protetto && raggio === this.raggioProtetto) return false;
    this.protetto = i;
    this.raggioProtetto = raggio;
    this.invalida();
    return true;
  }

  private inProtetto(i: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const p = this.protetto;
    if (p < 0 || p === i || this.candidata[p] === 0) return false;
    const r = this.raggioProtetto;
    const px = this.x[p]!;
    const py = this.y[p]!;
    return x0 < px + r && x1 > px - r && y0 < py + r && y1 > py - r;
  }

  private inZona(x0: number, y0: number, x1: number, y1: number): boolean {
    const z = this.zone;
    for (let k = 0; k < z.length; k += 4) {
      if (x0 < z[k + 2]! && x1 > z[k]! && y0 < z[k + 3]! && y1 > z[k + 1]!) return true;
    }
    return false;
  }

  /**
   * Aggiorna lo stato delle etichette. Restituisce true se ci sono cambi in attesa (isteresi):
   * il chiamante richiede altri frame.
   */
  aggiorna(ora: number, larghezzaVista: number, altezzaVista: number): boolean {
    let attesa = false;
    if (ora - this.ultimo >= ETICHETTE_INTERVALLO_MS) {
      this.ultimo = ora;
      this.disponi(larghezzaVista, altezzaVista);
    } else if (this.ingressiCambiati()) {
      // Candidate o posizioni cambiate dopo l'ultima disposizione: servono altri frame fino alla prossima,
      // altrimenti con il rendering su richiesta le etichette restano nello stato precedente.
      attesa = true;
    }
    // Isteresi: ogni etichetta resta almeno 300 ms nello stato (e sul lato) raggiunto.
    for (let i = 0; i < this.n; i++) {
      const des = this.candidata[i] === 0 ? 0 : this.desiderata[i]!;
      const latoDes = this.latoDesiderato[i]!;
      const cambio = des !== this.mostrata[i] || (des === 1 && latoDes !== this.lato[i]);
      if (!cambio) continue;
      const immediato = this.candidata[i] === 0 || this.classe[i] === 0;
      if (immediato || ora - this.tCambio[i]! >= ETICHETTE_ISTERESI_MS) {
        this.mostrata[i] = des;
        this.lato[i] = latoDes;
        this.tCambio[i] = ora;
      } else {
        attesa = true;
      }
    }
    return attesa;
  }

  private ingressiCambiati(): boolean {
    for (let i = 0; i < this.n; i++) {
      const c = this.candidata[i]!;
      if (c !== this.candidataDisposta[i]) return true;
      if (c === 1 && (Math.abs(this.x[i]! - this.xDisposta[i]!) > 0.5 || Math.abs(this.y[i]! - this.yDisposta[i]!) > 0.5)) return true;
    }
    return false;
  }

  /** Algoritmo goloso: classi in ordine, ordine statico dentro la classe, due posizioni per etichetta. */
  private disponi(lv: number, av: number): void {
    this.candidataDisposta.set(this.candidata);
    this.xDisposta.set(this.x);
    this.yDisposta.set(this.y);
    const cella = ETICHETTE_CELLA_PX;
    const colonne = Math.max(1, Math.ceil(lv / cella));
    const righe = Math.max(1, Math.ceil(av / cella));
    if (colonne * righe > this.testa.length) {
      this.testa = new Int32Array(colonne * righe);
      this.timbroCella = new Int32Array(colonne * righe);
    }
    this.colonne = colonne;
    this.righe = righe;
    this.timbro++;
    let nodi = 0;
    const max = lv < ETICHETTE_LARGHEZZA_STRETTA_PX ? ETICHETTE_MAX_STRETTO : ETICHETTE_MAX_LARGO;
    let piazzate = 0;
    this.desiderata.fill(0);
    const h = ETICHETTE_ALTEZZA_PX;
    for (let c = 0; c < NUMERO_CLASSI; c++) {
      for (let k = 0; k < this.ordine.length; k++) {
        const i = this.ordine[k]!;
        if (this.candidata[i] === 0 || this.classe[i] !== c) continue;
        if (c > 0 && piazzate >= max) continue;
        const w = this.larghezza[i]!;
        const off = this.scostamento[i]!;
        const yc = this.y[i]!;
        let scelto = -1;
        // Forzata senza lato libero: primo lato dentro la vista, altrimenti il secondo; mostrata comunque.
        let ripiego = -1;
        // Preferenza: lato attuale se l'etichetta è già mostrata, altrimenti destra.
        const primo = this.mostrata[i] === 1 ? this.lato[i]! : 0;
        for (let tentativo = 0; tentativo < 2 && scelto < 0; tentativo++) {
          const lato = tentativo === 0 ? primo : 1 - primo;
          const x0 = lato === 0 ? this.x[i]! + off : this.x[i]! - off - w;
          const y0 = yc - h / 2;
          const dentro = x0 >= 0 && y0 >= 0 && x0 + w <= lv && y0 + h <= av;
          if (c === 0 && ripiego < 0 && (dentro || tentativo === 1)) ripiego = lato;
          if (!dentro || this.inZona(x0, y0, x0 + w, y0 + h) || this.inProtetto(i, x0, y0, x0 + w, y0 + h)) continue;
          if (c === 0 || this.libero(x0, y0, x0 + w, y0 + h)) scelto = lato;
        }
        if (scelto < 0) scelto = ripiego;
        if (scelto < 0) continue;
        const x0 = scelto === 0 ? this.x[i]! + off : this.x[i]! - off - w;
        const y0 = yc - h / 2;
        this.rx0[i] = x0;
        this.ry0[i] = y0;
        this.rx1[i] = x0 + w;
        this.ry1[i] = y0 + h;
        nodi = this.inserisci(i, nodi);
        this.desiderata[i] = 1;
        this.latoDesiderato[i] = scelto;
        piazzate++;
      }
    }
  }

  private c0 = 0;
  private r0 = 0;
  private c1 = 0;
  private r1 = 0;

  private intervalloCelle(x0: number, y0: number, x1: number, y1: number): void {
    const cella = ETICHETTE_CELLA_PX;
    this.c0 = Math.max(0, Math.floor(x0 / cella));
    this.r0 = Math.max(0, Math.floor(y0 / cella));
    this.c1 = Math.min(this.colonne - 1, Math.floor(x1 / cella));
    this.r1 = Math.min(this.righe - 1, Math.floor(y1 / cella));
  }

  private libero(x0: number, y0: number, x1: number, y1: number): boolean {
    this.intervalloCelle(x0, y0, x1, y1);
    for (let r = this.r0; r <= this.r1; r++) {
      for (let c = this.c0; c <= this.c1; c++) {
        const id = r * this.colonne + c;
        if (this.timbroCella[id] !== this.timbro) continue;
        for (let nodo = this.testa[id]!; nodo >= 0; nodo = this.succ[nodo]!) {
          const j = this.voce[nodo]!;
          if (x0 < this.rx1[j]! && x1 > this.rx0[j]! && y0 < this.ry1[j]! && y1 > this.ry0[j]!) return false;
        }
      }
    }
    return true;
  }

  private inserisci(i: number, nodi: number): number {
    this.intervalloCelle(this.rx0[i]!, this.ry0[i]!, this.rx1[i]!, this.ry1[i]!);
    for (let r = this.r0; r <= this.r1; r++) {
      for (let c = this.c0; c <= this.c1; c++) {
        if (nodi >= MAX_NODI) return nodi;
        const id = r * this.colonne + c;
        if (this.timbroCella[id] !== this.timbro) {
          this.timbroCella[id] = this.timbro;
          this.testa[id] = -1;
        }
        this.voce[nodi] = i;
        this.succ[nodi] = this.testa[id]!;
        this.testa[id] = nodi;
        nodi++;
      }
    }
    return nodi;
  }
}

// Livello HTML

export interface VoceEtichetta {
  testo: string;
  tipo: 'corpo' | 'anello';
  /** ssid del corpo, -1 per gli anelli. */
  ssid: number;
}

const STILE = `
.ss-etichetta{position:absolute;left:0;top:0;white-space:nowrap;pointer-events:auto;cursor:pointer;
font:600 12px/16px "Source Sans 3","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:${COLORE_TESTO_ETICHETTE};
-webkit-text-stroke:6px ${COLORE_SPAZIO};paint-order:stroke fill;will-change:transform;visibility:hidden;
user-select:none;-webkit-user-select:none;touch-action:none}
.ss-etichetta.ss-anello{color:${COLORE_ETICHETTE_ANELLI};cursor:default;pointer-events:none;font-weight:400}
.ss-etichetta .ss-contatore{margin-left:6px;color:${COLORE_ETICHETTE_ANELLI}}
@media (forced-colors: active){.ss-etichetta{-webkit-text-stroke:0;color:CanvasText}}
`;

export class StratoEtichette {
  readonly elementi: HTMLElement[] = [];
  private readonly contatori = new Map<number, HTMLElement>();
  private readonly valoreContatore = new Map<number, number>();
  private readonly larghezzaNome: Float32Array;
  private readonly visibili: Uint8Array;
  private readonly ultimaX: Float64Array;
  private readonly ultimaY: Float64Array;
  private readonly stile: HTMLStyleElement;
  private misurate = false;

  constructor(
    contenitore: HTMLElement,
    voci: readonly VoceEtichetta[],
    private readonly testoContatore: (n: number) => string,
  ) {
    contenitore.setAttribute('aria-hidden', 'true');
    contenitore.style.pointerEvents = 'none';
    contenitore.style.overflow = 'hidden';
    if (getComputedStyle(contenitore).position === 'static') contenitore.style.position = 'relative';
    this.stile = document.createElement('style');
    this.stile.textContent = STILE;
    contenitore.appendChild(this.stile);
    const n = voci.length;
    this.larghezzaNome = new Float32Array(n);
    this.visibili = new Uint8Array(n);
    this.ultimaX = new Float64Array(n).fill(Number.NaN);
    this.ultimaY = new Float64Array(n).fill(Number.NaN);
    voci.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = v.tipo === 'anello' ? 'ss-etichetta ss-anello' : 'ss-etichetta';
      const nome = document.createElement('span');
      nome.textContent = v.testo;
      el.appendChild(nome);
      if (v.tipo === 'corpo') el.dataset['ssid'] = String(v.ssid);
      contenitore.appendChild(el);
      this.elementi[i] = el;
    });
  }

  /** Aggiunge il contatore "+N lune" all'etichetta i. */
  abilitaContatore(i: number, ssid: number): void {
    const el = this.elementi[i];
    if (!el) return;
    const c = document.createElement('span');
    c.className = 'ss-contatore';
    c.dataset['sistema'] = String(ssid);
    c.hidden = true;
    el.appendChild(c);
    this.contatori.set(i, c);
  }

  /** Misura le larghezze una sola volta (dopo document.fonts.ready). */
  misura(larghezze: Float32Array): void {
    for (let i = 0; i < this.elementi.length; i++) {
      const el = this.elementi[i]!;
      const nome = el.firstElementChild as HTMLElement | null;
      const w = nome ? nome.getBoundingClientRect().width : el.getBoundingClientRect().width;
      this.larghezzaNome[i] = Math.ceil(w) + 2;
      larghezze[i] = this.larghezzaNome[i]! + this.larghezzaContatore(i);
    }
    this.misurate = true;
  }

  get pronte(): boolean {
    return this.misurate;
  }

  private larghezzaContatore(i: number): number {
    const c = this.contatori.get(i);
    if (!c || c.hidden) return 0;
    return Math.ceil(c.getBoundingClientRect().width) + 6;
  }

  /** Aggiorna il contatore delle lune (solo quando cambia; misura la nuova larghezza). */
  impostaContatore(i: number, n: number, larghezze: Float32Array): void {
    const c = this.contatori.get(i);
    if (!c || this.valoreContatore.get(i) === n) return;
    this.valoreContatore.set(i, n);
    if (n > 0) {
      c.textContent = this.testoContatore(n);
      c.hidden = false;
    } else {
      c.hidden = true;
    }
    if (this.misurate) larghezze[i] = this.larghezzaNome[i]! + this.larghezzaContatore(i);
  }

  /** Passo 8 del § 5.5: scrittura delle posizioni (solo transform) e della visibilità al cambio. */
  scrivi(layout: LayoutEtichette, attivo: boolean): void {
    const h = ETICHETTE_ALTEZZA_PX;
    for (let i = 0; i < this.elementi.length; i++) {
      const el = this.elementi[i]!;
      const vis = attivo && layout.mostrata[i] === 1 ? 1 : 0;
      if (vis !== this.visibili[i]) {
        el.style.visibility = vis ? 'visible' : 'hidden';
        this.visibili[i] = vis;
      }
      if (!vis) continue;
      const w = layout.larghezza[i]!;
      const off = layout.scostamento[i]!;
      const x = Math.round(layout.lato[i] === 0 ? layout.x[i]! + off : layout.x[i]! - off - w);
      const y = Math.round(layout.y[i]! - h / 2);
      if (x !== this.ultimaX[i] || y !== this.ultimaY[i]) {
        el.style.transform = `translate3d(${x}px,${y}px,0)`;
        this.ultimaX[i] = x;
        this.ultimaY[i] = y;
      }
    }
  }

  /** Nasconde tutte le etichette (contesto WebGL perso, R13); il primo frame disegnato le riscrive. */
  nascondi(): void {
    for (let i = 0; i < this.elementi.length; i++) {
      if (this.visibili[i] !== 1) continue;
      this.elementi[i]!.style.visibility = 'hidden';
      this.visibili[i] = 0;
    }
  }

  dispose(): void {
    for (const el of this.elementi) el.remove();
    this.stile.remove();
  }
}
