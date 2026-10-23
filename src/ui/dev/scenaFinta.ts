// Scena di sviluppo (solo ui-lab.html): proiezione ortografica su Canvas 2D che implementa
// ScenaUi, per provare l'interfaccia senza il modulo di rendering. Marcatori con forme e colori
// del § 11.1, anelli di distanza, orbite e selezione al clic. La selezione è quella della scena reale
// (Selettore di src/render/picking.ts, § 11.5.3): marcatori, dischi ed etichette come candidati, ciclo dei
// clic ripetuti, nessun evento se sotto il clic non c'è nulla. Il resto della scena è semplificato.

import type { Catalogo, CategoriaCorpo, CorpoCatalogo } from '../../data/catalogTypes';
import { UA_KM } from '../../ephem/constants';
import { puntoSuConica } from '../../ephem/equinoctial';
import type { ElementiOrbita } from '../../ephem/types';
import {
  COLORE_ANELLI_DISTANZA,
  COLORE_CATEGORIA,
  COLORE_ETICHETTE_ANELLI,
  COLORE_SELEZIONE,
  COLORE_SPAZIO,
  COLORE_TESTO_ETICHETTE,
  DIMENSIONE_MARCATORE,
} from '../../render/costanti';
import { Selettore } from '../../render/picking';
import type { DatiSelezione } from '../../render/picking';
import type { TimeState } from '../../time/types';
import type { InfoSelezione, LivelloScena, OpzioniFuoco, ScenaUi, StatoVista } from '../contrattoScena';
import type { EffemeridiFinte } from './effemeridiFinte';

const FOV = (45 * Math.PI) / 180;
const K_DISTANZA = 1 / (2 * Math.tan(FOV / 2));
const DIST_MAX = 2e5 * UA_KM;
const PRIORITA: readonly CategoriaCorpo[] = ['sole', 'pianeta', 'pianeta-nano', 'luna', 'interstellare', 'cometa', 'centauro', 'tno', 'asteroide'];
const ANELLI_UA = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

interface Proiezione {
  ssid: number;
  x: number;
  y: number;
  visibile: boolean;
}

/** Rettangolo (px della canvas) del testo di un'etichetta disegnata. */
interface RettangoloEtichetta {
  ssid: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Posizione, disco ed etichetta di un corpo come disegnati (px della canvas). */
export interface GeometriaCorpo {
  x: number;
  y: number;
  /** Raggio apparente del disco, px. */
  raggioPx: number;
  etichetta: Omit<RettangoloEtichetta, 'ssid'> | null;
}

export class ScenaFinta implements ScenaUi {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private contenitore: HTMLElement | null = null;
  private readonly corpi: CorpoCatalogo[];
  private readonly perSsid = new Map<number, CorpoCatalogo>();
  private readonly perSlug = new Map<string, CorpoCatalogo>();
  private posizioni = new Map<number, Float64Array>();
  private proiezioni: Proiezione[] = [];
  private t: TimeState | null = null;
  private fuoco = 0;
  private distanza = 4 * UA_KM * K_DISTANZA;
  private azimut = -Math.PI / 2;
  private elevazione = (30 * Math.PI) / 180;
  private panX = 0;
  private panY = 0;
  private selezionato: number | null = null;
  private livelli: Record<LivelloScena, boolean> = {
    orbite: true,
    etichette: true,
    marcatori: true,
    anelliDistanza: true,
    grigliaEclittica: false,
    eclitticaData: false,
    assiRotazione: false,
    anelli: true,
    stelle: true,
  };
  private categorie: ReadonlySet<CategoriaCorpo> = new Set(PRIORITA);
  private sempreVisibile: number | null = null;
  private readonly cbVista = new Set<() => void>();
  private readonly cbSel = new Set<(ssid: number | null, info: InfoSelezione | null) => void>();
  private larghezza = 800;
  private altezza = 600;
  private pianificato = false;
  private readonly stelle: [number, number, number][] = [];
  private readonly selettore: Selettore;
  /** Dati della vista per la selezione, riempiti a ogni disegno. */
  private readonly dati: DatiSelezione;
  private readonly raggiPx: Float64Array;
  private rettangoliEtichette: RettangoloEtichetta[] = [];
  /** Chiamate registrate, per i test. */
  readonly registro: string[] = [];

  constructor(
    catalogo: Catalogo,
    private readonly effemeridi: EffemeridiFinte,
  ) {
    this.corpi = [...catalogo.corpi];
    for (const c of this.corpi) {
      this.perSsid.set(c.ssid, c);
      this.perSlug.set(c.slug, c);
    }
    const n = this.corpi.reduce((m, c) => Math.max(m, c.ssid + 1), 0);
    this.selettore = new Selettore(n);
    const schermo = new Float64Array(2 * n);
    const raggiPx = new Float64Array(n);
    const precedenza = new Float64Array(n);
    for (const c of this.corpi) precedenza[c.ssid] = PRIORITA.indexOf(c.categoria);
    this.raggiPx = raggiPx;
    this.dati = {
      n,
      schermo,
      marcatoreSelezionabile: new Uint8Array(n),
      discoVisibile: new Uint8Array(n),
      precedenza,
      colpisceDisco: (ssid, x, y) => Math.hypot(schermo[2 * ssid]! - x, schermo[2 * ssid + 1]! - y) <= raggiPx[ssid]!,
    };
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D non disponibile');
    this.ctx = ctx;
    let seme = 20261018;
    const caso = () => {
      seme = (seme * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seme / 2_147_483_648;
    };
    for (let i = 0; i < 260; i++) this.stelle.push([caso(), caso(), 0.25 + caso() * 0.75]);
  }

  monta(contenitore: HTMLElement): void {
    this.contenitore = contenitore;
    contenitore.appendChild(this.canvas);
    const ro = new ResizeObserver(() => this.ridimensiona());
    ro.observe(contenitore);
    this.ridimensiona();
    this.ascolta();
  }

  impostaTempo(t: TimeState): void {
    this.t = t;
    const tmp = new Float64Array(6);
    const nuove = new Map<number, Float64Array>();
    for (const c of this.corpi) {
      if (this.effemeridi.stateAt(c.ssid, t.jdTT, tmp) === 'ok') nuove.set(c.ssid, tmp.slice());
    }
    this.posizioni = nuove;
    this.ridisegna();
  }

  statoVista(): StatoVista {
    const kmPerPixel = (2 * this.distanza * Math.tan(FOV / 2)) / this.altezza;
    return {
      distanzaKm: this.distanza,
      ampiezzaKm: kmPerPixel * Math.min(this.altezza, this.larghezza),
      kmPerPixel,
      altezzaPx: this.altezza,
      larghezzaPx: this.larghezza,
      fuoco: this.fuoco,
      inTransizione: false,
      fuocoSenzaPosizione: !this.posizioni.has(this.fuoco),
      contestoPerso: false,
    };
  }

  /** Rapporto distanza della camera / ampiezza della vista sul lato minore. */
  private rapporto(): number {
    return (this.altezza / Math.min(this.altezza, this.larghezza)) * K_DISTANZA;
  }

  onCambioVista(cb: () => void): () => void {
    this.cbVista.add(cb);
    return () => this.cbVista.delete(cb);
  }

  onSelezione(cb: (ssid: number | null, info: InfoSelezione | null) => void): () => void {
    this.cbSel.add(cb);
    return () => this.cbSel.delete(cb);
  }

  seleziona(ssid: number | null): void {
    this.selezionato = ssid;
    this.registro.push(`seleziona:${ssid}`);
    this.ridisegna();
  }

  mettiAFuoco(ssid: number, opzioni: OpzioniFuoco = {}): void {
    this.registro.push(`fuoco:${this.perSsid.get(ssid)?.slug ?? ssid}:${opzioni.inquadratura ?? ''}`);
    this.fuoco = ssid;
    this.panX = 0;
    this.panY = 0;
    if (opzioni.ampiezzaKm !== undefined) this.distanza = opzioni.ampiezzaKm * this.rapporto();
    else this.distanza = this.distanzaInquadratura(ssid, opzioni.inquadratura ?? 'orbita');
    this.limitaDistanza();
    this.cambioVista();
  }

  impostaAmpiezza(km: number): void {
    this.distanza = km * this.rapporto();
    this.limitaDistanza();
    this.cambioVista();
  }

  zoom(fattore: number): void {
    this.distanza *= fattore;
    this.limitaDistanza();
    this.cambioVista();
  }

  ruota(dAzimut: number, dElevazione: number): void {
    this.azimut += dAzimut;
    this.elevazione = Math.max(-1.55, Math.min(1.55, this.elevazione + dElevazione));
    this.cambioVista();
  }

  sposta(dx: number, dy: number): void {
    this.panX += dx * this.altezza;
    this.panY -= dy * this.altezza;
    this.cambioVista();
  }

  corpoAlCentro(): number | null {
    let migliore: Proiezione | null = null;
    let d2 = 80 * 80;
    for (const p of this.proiezioni) {
      if (!p.visibile) continue;
      const d = (p.x - this.larghezza / 2) ** 2 + (p.y - this.altezza / 2) ** 2;
      if (d < d2) {
        d2 = d;
        migliore = p;
      }
    }
    return migliore?.ssid ?? null;
  }

  corpoVisibileSuccessivo(da: number | null, verso: 1 | -1): number | null {
    const vis = this.proiezioni.filter((p) => p.visibile).sort((a, b) => a.x - b.x || a.y - b.y);
    if (vis.length === 0) return null;
    const i = vis.findIndex((p) => p.ssid === da);
    const j = i < 0 ? (verso === 1 ? 0 : vis.length - 1) : (i + verso + vis.length) % vis.length;
    return vis[j]?.ssid ?? null;
  }

  impostaLivelli(livelli: Readonly<Record<LivelloScena, boolean>>): void {
    this.livelli = { ...livelli };
    this.ridisegna();
  }

  impostaFiltri(categorie: ReadonlySet<CategoriaCorpo>, sempreVisibile: number | null): void {
    this.categorie = new Set(categorie);
    this.sempreVisibile = sempreVisibile;
    this.ridisegna();
  }

  // --- Interni ---

  private raggio(ssid: number): number {
    const r = this.perSsid.get(ssid)?.fisica.raggi_km?.valore;
    return r ? Math.max(r[0], r[1], r[2]) : 1;
  }

  private distanzaInquadratura(ssid: number, inq: 'corpo' | 'orbita' | 'sistema'): number {
    const c = this.perSsid.get(ssid);
    if (!c) return this.distanza;
    if (c.categoria === 'sole') return 4 * UA_KM * K_DISTANZA;
    if (inq === 'corpo') return Math.max(this.raggio(ssid) * 6, 2000) * K_DISTANZA;
    const t = this.t?.jdTT ?? 2_451_545;
    const o = this.orbita(ssid, t);
    const apo = o ? (o.e < 1 ? (o.q * (1 + o.e)) / (1 - o.e) : o.q * 6) : 1e7;
    return Math.min(apo * 2.4, 1e4 * UA_KM) * K_DISTANZA;
  }

  private orbita(ssid: number, jd: number): ElementiOrbita | null {
    const o: ElementiOrbita = { primario: 0, baricentrici: false, q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0, forma: 'determinata' };
    return this.effemeridi.orbitAt(ssid, jd, o) === 'ok' ? o : null;
  }

  private limitaDistanza(): void {
    const r = this.raggio(this.fuoco);
    this.distanza = Math.min(DIST_MAX, Math.max(r + Math.max(0.01 * r, 0.5), this.distanza));
  }

  /** Velocità di riproduzione registrata per i test. */
  impostaRiproduzione(giorniPerSecondo: number): void {
    this.registro.push(`riproduzione:${giorniPerSecondo}`);
  }

  private cambioVista(): void {
    this.ridisegna();
    for (const cb of this.cbVista) cb();
  }

  private ridimensiona(): void {
    if (!this.contenitore) return;
    const r = this.contenitore.getBoundingClientRect();
    this.larghezza = Math.max(1, r.width);
    this.altezza = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.larghezza * dpr);
    this.canvas.height = Math.round(this.altezza * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cambioVista();
  }

  private ascolta(): void {
    const c = this.canvas;
    let inizio: { x: number; y: number; t: number; az: number; el: number } | null = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      inizio = { x: e.clientX, y: e.clientY, t: performance.now(), az: this.azimut, el: this.elevazione };
    });
    c.addEventListener('pointermove', (e) => {
      if (!inizio) return;
      this.azimut = inizio.az + (e.clientX - inizio.x) * 0.006;
      this.elevazione = Math.max(-1.55, Math.min(1.55, inizio.el + (e.clientY - inizio.y) * 0.006));
      this.cambioVista();
    });
    c.addEventListener('pointerup', (e) => {
      if (!inizio) return;
      const mosso = Math.hypot(e.clientX - inizio.x, e.clientY - inizio.y);
      const durata = performance.now() - inizio.t;
      inizio = null;
      if (mosso < 5 && durata < 500) this.clic(e.clientX, e.clientY, e.pointerType);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  /** Clic valido: come nella scena reale l'etichetta sotto il punto è un candidato in più e, senza candidati, nessun evento. */
  private clic(cx: number, cy: number, tipo: string): void {
    const r = this.canvas.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top;
    const etichetta = this.rettangoliEtichette.find((e) => x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1)?.ssid ?? -1;
    const esito = this.selettore.scegli(this.dati, x, y, tipo, performance.now(), etichetta);
    if (!esito) return;
    for (const cb of this.cbSel) cb(esito.ssid, { indice: esito.indice, totale: esito.totale });
  }

  /** Posizione, disco ed etichetta di un corpo come disegnati, per i test; null se il corpo non è disegnato. */
  geometria(slug: string): GeometriaCorpo | null {
    const ssid = this.perSlug.get(slug)?.ssid;
    const p = ssid === undefined ? undefined : this.proiezioni.find((q) => q.ssid === ssid && q.visibile);
    if (ssid === undefined || !p) return null;
    const e = this.rettangoliEtichette.find((q) => q.ssid === ssid);
    return { x: p.x, y: p.y, raggioPx: this.raggiPx[ssid]!, etichetta: e ? { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1 } : null };
  }

  private ridisegna(): void {
    if (this.pianificato) return;
    this.pianificato = true;
    requestAnimationFrame(() => {
      this.pianificato = false;
      this.disegna();
    });
  }

  private proietta(x: number, y: number, z: number, out: { x: number; y: number }): void {
    const ca = Math.cos(this.azimut);
    const sa = Math.sin(this.azimut);
    const x1 = x * ca + y * sa;
    const y1 = -x * sa + y * ca;
    const su = y1 * Math.sin(this.elevazione) + z * Math.cos(this.elevazione);
    const s = this.altezza / (2 * this.distanza * Math.tan(FOV / 2));
    out.x = this.larghezza / 2 + x1 * s + this.panX;
    out.y = this.altezza / 2 - su * s + this.panY;
  }

  private visibile(c: CorpoCatalogo): boolean {
    if (c.ssid === this.sempreVisibile || c.categoria === 'sole') return true;
    if (this.categorie.has(c.categoria)) return true;
    return c.categorieSecondarie.some((k) => this.categorie.has(k));
  }

  private disegna(): void {
    const ctx = this.ctx;
    const W = this.larghezza;
    const H = this.altezza;
    ctx.fillStyle = COLORE_SPAZIO;
    ctx.fillRect(0, 0, W, H);
    if (this.livelli.stelle) {
      for (const [sx, sy, l] of this.stelle) {
        ctx.fillStyle = `rgba(230, 240, 255, ${0.25 + 0.55 * l})`;
        ctx.fillRect(sx * W, sy * H, l > 0.85 ? 1.6 : 1, l > 0.85 ? 1.6 : 1);
      }
    }
    const origine = this.posizioni.get(this.fuoco) ?? new Float64Array(6);
    const p = { x: 0, y: 0 };
    const s = this.altezza / (2 * this.distanza * Math.tan(FOV / 2));

    if (this.livelli.anelliDistanza) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORE_ANELLI_DISTANZA;
      ctx.fillStyle = COLORE_ETICHETTE_ANELLI;
      ctx.font = '600 12px "Source Sans 3", "Segoe UI", Roboto, Arial, sans-serif';
      for (const ua of ANELLI_UA) {
        const rpx = ua * UA_KM * s;
        if (rpx < 30 || rpx > 4 * Math.max(W, H)) continue;
        ctx.beginPath();
        for (let k = 0; k <= 128; k++) {
          const a = (k / 128) * 2 * Math.PI;
          this.proietta(ua * UA_KM * Math.cos(a) - origine[0]!, ua * UA_KM * Math.sin(a) - origine[1]!, -origine[2]!, p);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        this.proietta(ua * UA_KM * Math.cos(-0.5) - origine[0]!, ua * UA_KM * Math.sin(-0.5) - origine[1]!, -origine[2]!, p);
        ctx.fillText(`${ua} UA`, p.x + 4, p.y - 4);
      }
    }

    const jd = this.t?.jdTT ?? 2_451_545;
    const punto = new Float64Array(3);
    if (this.livelli.orbite) {
      for (const c of this.corpi) {
        const conOrbita = c.categoria === 'pianeta' || c.ssid === this.selezionato || (c.categoria === 'luna' && c.primario === this.perSsid.get(this.fuoco)?.slug);
        if (!conOrbita || !this.visibile(c)) continue;
        const o = this.orbita(c.ssid, jd);
        if (!o) continue;
        const prim = this.posizioni.get(o.primario) ?? new Float64Array(6);
        const sel = c.ssid === this.selezionato;
        ctx.strokeStyle = sel ? COLORE_SELEZIONE : 'rgba(244, 241, 232, 0.6)';
        ctx.lineWidth = sel ? 2 : 1;
        ctx.beginPath();
        const n = 180;
        const lim = o.e < 1 ? Math.PI : Math.acos(-1 / o.e) * 0.95;
        for (let k = 0; k <= n; k++) {
          const nu = -lim + (2 * lim * k) / n;
          puntoSuConica(o, nu, punto);
          this.proietta(punto[0]! + prim[0]! - origine[0]!, punto[1]! + prim[1]! - origine[1]!, punto[2]! + prim[2]! - origine[2]!, p);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        if (o.e < 1) ctx.closePath();
        ctx.stroke();
      }
    }

    this.proiezioni = [];
    this.rettangoliEtichette = [];
    this.dati.marcatoreSelezionabile.fill(0);
    this.dati.discoVisibile.fill(0);
    const etichette: { ssid: number; x: number; y: number; testo: string; pr: number }[] = [];
    for (const c of this.corpi) {
      const r = this.posizioni.get(c.ssid);
      if (!r || !this.visibile(c)) continue;
      this.proietta(r[0]! - origine[0]!, r[1]! - origine[1]!, r[2]! - origine[2]!, p);
      const dentro = p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20;
      // Lune troppo vicine al pianeta: nascoste (§ 11.5.1).
      let visibile = dentro;
      if (c.categoria === 'luna' && c.primario) {
        const pr = this.posizioni.get(this.perSlug.get(c.primario)?.ssid ?? -1);
        if (pr) {
          const d = Math.hypot(r[0]! - pr[0]!, r[1]! - pr[1]!, r[2]! - pr[2]!) * s;
          if (d < 12 && c.ssid !== this.selezionato) visibile = false;
        }
      }
      this.proiezioni.push({ ssid: c.ssid, x: p.x, y: p.y, visibile });
      if (!visibile) continue;
      const raggioPx = this.raggio(c.ssid) * s;
      // Selezionabile come nella scena reale: con il marcatore disegnato, con il disco disegnato (§ 11.5.3).
      this.dati.schermo[2 * c.ssid] = p.x;
      this.dati.schermo[2 * c.ssid + 1] = p.y;
      this.raggiPx[c.ssid] = raggioPx;
      this.dati.discoVisibile[c.ssid] = raggioPx > 1.5 ? 1 : 0;
      this.dati.marcatoreSelezionabile[c.ssid] = this.livelli.marcatori && raggioPx < 10 ? 1 : 0;
      if (raggioPx > 1.5) {
        ctx.fillStyle = c.categoria === 'sole' ? COLORE_CATEGORIA.sole : '#5b6b74';
        ctx.beginPath();
        ctx.arc(p.x, p.y, raggioPx, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (this.livelli.marcatori && raggioPx < 10) this.marcatore(c.categoria, p.x, p.y);
      if (c.ssid === this.selezionato) {
        ctx.strokeStyle = COLORE_SELEZIONE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(9, raggioPx + 4), 0, 2 * Math.PI);
        ctx.stroke();
      }
      const pr = c.ssid === this.selezionato ? -1 : PRIORITA.indexOf(c.categoria);
      etichette.push({ ssid: c.ssid, x: p.x, y: p.y, testo: c.nome, pr });
    }

    if (this.livelli.etichette) {
      ctx.font = '600 12px "Source Sans 3", "Segoe UI", Roboto, Arial, sans-serif';
      ctx.lineJoin = 'round';
      etichette.sort((a, b) => a.pr - b.pr);
      const occupati: [number, number, number, number][] = [];
      const max = W < 600 ? 25 : 60;
      let n = 0;
      for (const e of etichette) {
        if (n >= max) break;
        const w = ctx.measureText(e.testo).width;
        const x0 = e.x + 9;
        const y0 = e.y - 14;
        if (occupati.some(([a, b, c, d]) => x0 < c && x0 + w > a && y0 < d && y0 + 16 > b)) continue;
        occupati.push([x0, y0, x0 + w, y0 + 16]);
        this.rettangoliEtichette.push({ ssid: e.ssid, x0, y0: e.y - 10, x1: x0 + w, y1: e.y + 4 });
        ctx.strokeStyle = COLORE_SPAZIO;
        ctx.lineWidth = 3;
        ctx.strokeText(e.testo, x0, e.y + 2);
        ctx.fillStyle = COLORE_TESTO_ETICHETTE;
        ctx.fillText(e.testo, x0, e.y + 2);
        n++;
      }
    }
  }

  private marcatore(cat: CategoriaCorpo, x: number, y: number): void {
    const ctx = this.ctx;
    const colore = COLORE_CATEGORIA[cat];
    const r = DIMENSIONE_MARCATORE[cat] / 2;
    ctx.fillStyle = colore;
    ctx.strokeStyle = colore;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    switch (cat) {
      case 'sole':
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
        ctx.fill();
        return;
      case 'luna':
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      case 'pianeta-nano':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        break;
      case 'asteroide':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        break;
      case 'centauro':
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
          if (k === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
          else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        break;
      case 'tno':
        ctx.rect(x - r, y - r, 2 * r, 2 * r);
        break;
      case 'interstellare':
        for (let k = 0; k < 8; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 4;
          const rr = k % 2 === 0 ? r : r * 0.35;
          if (k === 0) ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
          else ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
        }
        break;
      case 'cometa': {
        const sole = this.posizioni.get(0);
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        const ang = sole ? Math.atan2(y - this.altezza / 2, x - this.larghezza / 2) : 0;
        ctx.globalAlpha = 0.6;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * 10, y + Math.sin(ang) * 10);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      default:
        ctx.arc(x, y, r, 0, 2 * Math.PI);
    }
    ctx.closePath();
    ctx.fill();
  }
}
