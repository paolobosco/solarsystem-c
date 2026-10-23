// Lettore delle serie di elementi SSSERIE1 (§ 8.3 di docs/PROGETTO.md): pianeti e piccoli corpi.
// Verifiche e valutazione uguali a scripts/pipeline/common/binio.py (leggi_serie, valuta_serie).
// La lettura alloca una volta; la valutazione (valuta) non alloca.

import { GIORNO_S, T0 } from '../ephem/constants';
import { statoDaElementi } from '../ephem/equinoctial';
import type { Scrivibile } from '../ephem/equinoctial';
import { hermiteCubica, lagrange8 } from '../ephem/interp';
import type { StatoEffemeride } from '../ephem/types';
import {
  DIM_INTESTAZIONE,
  ErroreFormato,
  MAGIC_SERIE,
  TIPO_PIANETI,
  leggiIntestazione,
} from './binHeader';
import type { IntestazioneBinaria } from './binHeader';
import { ultimoInizio } from './intervalli';

export const DIM_VOCE = 8;
export const DIM_SEGMENTO = 80;
export const SEG_E = 1;
export const SEG_C = 2;

/** Esito della valutazione di una serie. */
export type EsitoSerie = Exclude<StatoEffemeride, 'caricamento'>;

/** Passi ammessi: potenze di 2 da 1/64 d a 1024 d (§ 7.6.3). */
export function passoAmmesso(h: number): boolean {
  for (let k = -6; k <= 10; k++) if (h === 2 ** k) return true;
  return false;
}

export interface SegmentoSerie {
  readonly tipo: 1 | 2;
  readonly fattoreI: number; // ±1 per E, 0 per C
  readonly nCampioni: number; // aloni inclusi
  readonly h: number; // d
  readonly tPrimo: number;
  readonly inizio: number;
  readonly fine: number; // esclusa
  readonly mu: number; // km³/s² (E)
  readonly a0: number; // km (E)
  readonly lam0: number; // rad (E)
  readonly n: number; // rad/d (E)
  /** E: Float32 [δa, h, k, p, q, δλ]; C: Float64 [x, y, z (km), vx, vy, vz (km/d)]; N righe. */
  readonly dati: Float32Array | Float64Array;
}

interface Corpo {
  readonly inizi: Float64Array;
  readonly segmenti: readonly SegmentoSerie[];
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

// Memoria di lavoro della valutazione.
const residui = new Float64Array(6);
const elementi = new Float64Array(6);

/** Stato [km, km/s] dal segmento a t, senza controllo del nucleo. */
export function valutaSegmento(s: SegmentoSerie, t: number, out: Scrivibile): void {
  if (s.tipo === SEG_E) {
    lagrange8(t, s.tPrimo, s.h, s.dati, s.nCampioni, 6, residui);
    elementi[0] = s.a0 + residui[0]!;
    elementi[1] = residui[1]!;
    elementi[2] = residui[2]!;
    elementi[3] = residui[3]!;
    elementi[4] = residui[4]!;
    elementi[5] = s.lam0 + s.n * (t - s.tPrimo) + residui[5]!;
    statoDaElementi(elementi, s.mu, s.fattoreI, out);
    return;
  }
  hermiteCubica(t, s.tPrimo, s.h, s.dati, s.nCampioni, out);
  out[3] = out[3]! / GIORNO_S;
  out[4] = out[4]! / GIORNO_S;
  out[5] = out[5]! / GIORNO_S;
}

/** File SSSERIE1 letto e verificato. */
export class SerieElementi {
  readonly intestazione: IntestazioneBinaria;
  readonly ssids: readonly number[];
  private readonly corpi: Map<number, Corpo>;

  constructor(intestazione: IntestazioneBinaria, corpi: Map<number, Corpo>) {
    this.intestazione = intestazione;
    this.corpi = corpi;
    this.ssids = [...corpi.keys()];
  }

  contiene(ssid: number): boolean {
    return this.corpi.has(ssid);
  }

  segmenti(ssid: number): readonly SegmentoSerie[] | undefined {
    return this.corpi.get(ssid)?.segmenti;
  }

  /** Indice del segmento il cui nucleo contiene t, -1 se nessuno. */
  indiceSegmento(ssid: number, t: number): number {
    const c = this.corpi.get(ssid);
    if (c === undefined) return -1;
    const j = ultimoInizio(c.inizi, t);
    return j >= 0 && t < c.segmenti[j]!.fine ? j : -1;
  }

  /**
   * Stato eliocentrico [km, km/s] a t (JD TDB) in out[0..5].
   * Fuori dal nucleo del file: 'fuori-copertura'; nel nucleo senza segmento (o corpo assente): 'non-determinabile'.
   * Se l'esito non è 'ok' out non è modificato.
   */
  valuta(ssid: number, t: number, out: Scrivibile): EsitoSerie {
    if (!(t >= this.intestazione.inizio && t < this.intestazione.fine)) return 'fuori-copertura';
    const c = this.corpi.get(ssid);
    if (c === undefined) return 'non-determinabile';
    const j = ultimoInizio(c.inizi, t);
    if (j < 0) return 'non-determinabile';
    const s = c.segmenti[j]!;
    if (!(t < s.fine)) return 'non-determinabile';
    valutaSegmento(s, t, out);
    return 'ok';
  }
}

// --- Lettura ---

type Regione = [inizio: number, fine: number, nome: string];

function verificaRegione(r: Regione, dimensione: number): void {
  const [a, b, nome] = r;
  if (a % 8 !== 0 || a < 0 || b > dimensione || b < a) throw new ErroreFormato(`regione non valida: ${nome} [${a}, ${b})`);
}

function verificaSovrapposizioni(regioni: Regione[]): void {
  const ord = [...regioni].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (let i = 1; i < ord.length; i++) {
    if (ord[i]![0] < ord[i - 1]![1]) throw new ErroreFormato(`regioni sovrapposte: ${ord[i - 1]![2]} e ${ord[i]![2]}`);
  }
}

function tuttiFiniti(a: Float32Array | Float64Array): boolean {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return false;
  return true;
}

/** Verifiche del segmento (binio.valida_segmento). */
export function validaSegmento(s: SegmentoSerie): void {
  if (s.tipo !== SEG_E && s.tipo !== SEG_C) throw new ErroreFormato(`tipo di segmento non valido: ${String(s.tipo)}`);
  if (!passoAmmesso(s.h)) throw new ErroreFormato(`passo non ammesso: ${s.h}`);
  if (!(Number.isFinite(s.tPrimo) && Number.isFinite(s.inizio) && Number.isFinite(s.fine))) {
    throw new ErroreFormato('tempi non finiti');
  }
  if (!(s.inizio < s.fine)) throw new ErroreFormato('nucleo del segmento vuoto');
  const n = s.nCampioni;
  if (s.dati.length !== 6 * n) throw new ErroreFormato('dati del segmento di forma errata');
  if (!tuttiFiniti(s.dati)) throw new ErroreFormato('dati del segmento non finiti');
  if (s.tipo === SEG_E) {
    if (!(s.dati instanceof Float32Array)) throw new ErroreFormato('dati E devono essere Float32');
    if (s.fattoreI !== 1 && s.fattoreI !== -1) throw new ErroreFormato(`fattore I non valido: ${s.fattoreI}`);
    if (n < 8) throw new ErroreFormato('segmento E con meno di 8 campioni');
    if (!(s.mu > 0 && s.a0 > 0 && Number.isFinite(s.lam0) && Number.isFinite(s.n))) {
      throw new ErroreFormato('riferimenti del segmento E non validi');
    }
    if (s.inizio < s.tPrimo + 3 * s.h || s.fine > s.tPrimo + (n - 4) * s.h) {
      throw new ErroreFormato('stencil di Lagrange incompleto nel nucleo');
    }
  } else {
    if (!(s.dati instanceof Float64Array)) throw new ErroreFormato('dati C devono essere Float64');
    if (s.fattoreI !== 0 || s.mu !== 0 || s.a0 !== 0 || s.lam0 !== 0 || s.n !== 0) {
      throw new ErroreFormato('campi E non nulli in un segmento C');
    }
    if (n < 2) throw new ErroreFormato('segmento C con meno di 2 campioni');
    if (s.inizio < s.tPrimo || s.fine > s.tPrimo + (n - 1) * s.h) {
      throw new ErroreFormato('campioni di Hermite insufficienti nel nucleo');
    }
  }
}

function datiSegmento(buf: ArrayBuffer, tipo: number, offset: number, n: number): Float32Array | Float64Array {
  if (LITTLE_ENDIAN) {
    return tipo === SEG_E ? new Float32Array(buf, offset, 6 * n) : new Float64Array(buf, offset, 6 * n);
  }
  const v = new DataView(buf);
  if (tipo === SEG_E) {
    const out = new Float32Array(6 * n);
    for (let i = 0; i < out.length; i++) out[i] = v.getFloat32(offset + 4 * i, true);
    return out;
  }
  const out = new Float64Array(6 * n);
  for (let i = 0; i < out.length; i++) out[i] = v.getFloat64(offset + 8 * i, true);
  return out;
}

/**
 * Legge e verifica un file SSSERIE1: intestazione (magic, versione, dimensione), voci ordinate,
 * regioni allineate e disgiunte, segmenti validi, ordinati e dentro il nucleo; per i pianeti un solo
 * segmento E con griglia allineata a T0. I dati dei segmenti sono viste sul buffer.
 */
export function leggiSerie(buf: ArrayBuffer, tipoAtteso?: number): SerieElementi {
  const intest = leggiIntestazione(buf, MAGIC_SERIE);
  if (tipoAtteso !== undefined && intest.tipo !== tipoAtteso) {
    throw new ErroreFormato(`tipo atteso ${tipoAtteso}, trovato ${intest.tipo}`);
  }
  const dim = intest.dimensione;
  const v = new DataView(buf);
  const regioni: Regione[] = [[0, DIM_INTESTAZIONE, 'intestazione']];
  const voci: Regione = [intest.offsetVoci, intest.offsetVoci + DIM_VOCE * intest.nVoci, 'voci'];
  regioni.push(voci);
  verificaRegione(regioni[0]!, dim);
  verificaRegione(voci, dim);
  verificaSovrapposizioni(regioni);
  const corpi = new Map<number, Corpo>();
  let precSsid = -1;
  for (let iv = 0; iv < intest.nVoci; iv++) {
    const o = intest.offsetVoci + DIM_VOCE * iv;
    const ssid = v.getUint16(o, true);
    const nseg = v.getUint16(o + 2, true);
    const offTab = v.getUint32(o + 4, true);
    if (ssid <= precSsid) throw new ErroreFormato('voci non ordinate per ssid crescente o duplicate');
    precSsid = ssid;
    if (nseg === 0) {
      if (offTab !== 0) throw new ErroreFormato(`corpo ${ssid} senza segmenti con offset non nullo`);
      corpi.set(ssid, { inizi: new Float64Array(0), segmenti: [] });
      continue;
    }
    const tab: Regione = [offTab, offTab + DIM_SEGMENTO * nseg, `segmenti di ${ssid}`];
    verificaRegione(tab, dim);
    regioni.push(tab);
    const segmenti: SegmentoSerie[] = [];
    for (let js = 0; js < nseg; js++) {
      const s = offTab + DIM_SEGMENTO * js;
      const tipo = v.getUint8(s);
      const ris1 = v.getUint16(s + 2, true);
      const ris2 = v.getUint32(s + 76, true);
      if (ris1 !== 0 || ris2 !== 0) throw new ErroreFormato(`campo riservato non nullo nel segmento ${js} di ${ssid}`);
      if (tipo !== SEG_E && tipo !== SEG_C) throw new ErroreFormato(`tipo di segmento non valido: ${tipo}`);
      const n = v.getUint32(s + 4, true);
      const offDati = v.getUint32(s + 72, true);
      const nbyte = n * 6 * (tipo === SEG_E ? 4 : 8);
      const reg: Regione = [offDati, offDati + nbyte, `dati ${js} di ${ssid}`];
      verificaRegione(reg, dim);
      regioni.push(reg);
      segmenti.push({
        tipo,
        fattoreI: v.getInt8(s + 1),
        nCampioni: n,
        h: v.getFloat64(s + 8, true),
        tPrimo: v.getFloat64(s + 16, true),
        inizio: v.getFloat64(s + 24, true),
        fine: v.getFloat64(s + 32, true),
        mu: v.getFloat64(s + 40, true),
        a0: v.getFloat64(s + 48, true),
        lam0: v.getFloat64(s + 56, true),
        n: v.getFloat64(s + 64, true),
        dati: datiSegmento(buf, tipo, offDati, n),
      });
    }
    corpi.set(ssid, { inizi: Float64Array.from(segmenti, (x) => x.inizio), segmenti });
  }
  verificaSovrapposizioni(regioni);
  for (const [ssid, c] of corpi) {
    let precFine = Number.NEGATIVE_INFINITY;
    for (const s of c.segmenti) {
      validaSegmento(s);
      if (s.inizio < intest.inizio || s.fine > intest.fine) {
        throw new ErroreFormato(`segmento del corpo ${ssid} fuori dal nucleo del file`);
      }
      if (s.inizio < precFine) throw new ErroreFormato(`segmenti del corpo ${ssid} non ordinati o sovrapposti`);
      precFine = s.fine;
    }
    if (intest.tipo === TIPO_PIANETI) {
      const s = c.segmenti[0];
      if (c.segmenti.length !== 1 || s === undefined || s.tipo !== SEG_E) {
        throw new ErroreFormato(`il pianeta ${ssid} deve avere un solo segmento E`);
      }
      const m = (s.tPrimo - T0) / s.h;
      if (m !== Math.floor(m)) throw new ErroreFormato(`griglia del pianeta ${ssid} non allineata a T0`);
    }
  }
  return new SerieElementi(intest, corpi);
}
