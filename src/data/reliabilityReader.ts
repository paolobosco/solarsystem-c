// Lettore di reliability.bin (§ 8.7 di docs/PROGETTO.md), formato uguale a scripts/pipeline/reliability_pack.py.
// Dopo l'intestazione comune (magic SSRELI02, tipo 5, blocco -1, voci = numero di corpi, offset 64):
// f64 t_nodo0; f64 passo dei nodi grossi (d); u32 nodi; u32 numero di corpi; f64 t_fine; f64 passo fine (d).
// Nodo k: t_nodo0 + passo·k fino a t_fine (nodo k_fine), poi t_fine + passo_fine·(k - k_fine); intervallo k:
// [nodo k, nodo k+1), l'ultimo lungo un passo fine. Per corpo: u16 ssid; u16 riservato; Float32[nodi]
// log10(ε_modello in rad) (NaN = non stimabile); u8[nodi] bit 0 forma determinata, bit 1 dati presenti;
// riempimento a multiplo di 8 byte. Valutazione a gradini (valore dell'intervallo che contiene t).

import type { DataStore } from './types';
import { DIM_INTESTAZIONE, ErroreFormato, MAGIC_AFFIDABILITA, TIPO_AFFIDABILITA, allinea8, leggiIntestazione } from './binHeader';

export const PERCORSO_AFFIDABILITA = 'reliability.bin';
export const BIT_FORMA_DETERMINATA = 1;
export const BIT_DATI_PRESENTI = 2;

export interface SerieAffidabilita {
  readonly log10eps: Float32Array;
  readonly flag: Uint8Array;
}

export interface DatiAffidabilita {
  readonly t0: number;
  /** Passo dei nodi grossi (d), fino a tFine. */
  readonly passo: number;
  readonly nodi: number;
  /** Primo nodo della parte fine (JD TDB) e suo indice. */
  readonly tFine: number;
  readonly kFine: number;
  /** Passo dei nodi fini (d). */
  readonly passoFine: number;
  /** Nucleo coperto (JD TDB): [inizio, fine). */
  readonly inizio: number;
  readonly fine: number;
  readonly perSsid: ReadonlyMap<number, SerieAffidabilita>;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
/** Byte dopo l'intestazione comune: t_nodo0, passo, nodi, corpi, t_fine, passo fine. */
const TESTA = 40;

/** Legge e verifica reliability.bin: intestazione, griglia dei nodi che copre il nucleo, voci e dimensione. */
export function leggiAffidabilita(buf: ArrayBuffer): DatiAffidabilita {
  const i = leggiIntestazione(buf, MAGIC_AFFIDABILITA);
  if (i.tipo !== TIPO_AFFIDABILITA || i.blocco !== -1 || i.offsetVoci !== DIM_INTESTAZIONE) {
    throw new ErroreFormato('file di affidabilità non conforme');
  }
  if (i.dimensione < DIM_INTESTAZIONE + TESTA) throw new ErroreFormato('file troppo corto');
  const v = new DataView(buf);
  const t0 = v.getFloat64(DIM_INTESTAZIONE, true);
  const passo = v.getFloat64(DIM_INTESTAZIONE + 8, true);
  const nodi = v.getUint32(DIM_INTESTAZIONE + 16, true);
  const n = v.getUint32(DIM_INTESTAZIONE + 20, true);
  const tFine = v.getFloat64(DIM_INTESTAZIONE + 24, true);
  const passoFine = v.getFloat64(DIM_INTESTAZIONE + 32, true);
  if (n !== i.nVoci || nodi < 1) throw new ErroreFormato('numero di corpi o di nodi non conforme');
  const kFine = (tFine - t0) / passo;
  if (!(Number.isFinite(t0) && passo > 0 && passoFine > 0 && Number.isInteger(kFine) && kFine >= 0 && kFine < nodi)) {
    throw new ErroreFormato('griglia dei nodi non conforme');
  }
  if (!(t0 <= i.inizio && tFine + passoFine * (nodi - kFine) >= i.fine)) {
    throw new ErroreFormato('i nodi non coprono il nucleo');
  }
  const blocco = allinea8(4 + 5 * nodi);
  if (i.dimensione !== DIM_INTESTAZIONE + TESTA + n * blocco) throw new ErroreFormato('dimensione non conforme');
  const perSsid = new Map<number, SerieAffidabilita>();
  for (let k = 0; k < n; k++) {
    const o = DIM_INTESTAZIONE + TESTA + k * blocco;
    const ssid = v.getUint16(o, true);
    if (v.getUint16(o + 2, true) !== 0 || perSsid.has(ssid)) throw new ErroreFormato(`voce ${k} non conforme`);
    let log10eps: Float32Array;
    if (LITTLE_ENDIAN && (o + 4) % 4 === 0) {
      log10eps = new Float32Array(buf, o + 4, nodi);
    } else {
      log10eps = new Float32Array(nodi);
      for (let j = 0; j < nodi; j++) log10eps[j] = v.getFloat32(o + 4 + 4 * j, true);
    }
    const flag = new Uint8Array(buf, o + 4 + 4 * nodi, nodi);
    for (let j = 0; j < nodi; j++) if ((flag[j]! & ~3) !== 0) throw new ErroreFormato(`voce ${k}: flag non validi`);
    perSsid.set(ssid, { log10eps, flag });
  }
  return { t0, passo, nodi, tFine, kFine, passoFine, inizio: i.inizio, fine: i.fine, perSsid };
}

/** Istante del nodo j (JD TDB); per j = nodi, fine dell'ultimo intervallo. */
export function istanteNodo(d: DatiAffidabilita, j: number): number {
  return j <= d.kFine ? d.t0 + d.passo * j : d.tFine + d.passoFine * (j - d.kFine);
}

/** Indice del nodo dell'intervallo che contiene t, oppure -1 fuori dalla griglia. */
export function nodoAffidabilita(d: DatiAffidabilita, t: number): number {
  if (!(t >= d.t0)) return -1;
  const j = t < d.tFine ? Math.floor((t - d.t0) / d.passo) : d.kFine + Math.floor((t - d.tFine) / d.passoFine);
  return j < d.nodi ? j : -1;
}

export interface ValoreAffidabilita {
  /** ε_modello in rad; NaN se non stimabile o fuori griglia. */
  eps: number;
  formaDeterminata: boolean;
  datiPresenti: boolean;
}

/** Valore a gradini per il corpo e l'istante; false se il corpo non ha serie nel file. Senza allocazioni. */
export function valutaAffidabilita(d: DatiAffidabilita, ssid: number, t: number, out: ValoreAffidabilita): boolean {
  const s = d.perSsid.get(ssid);
  if (s === undefined) return false;
  const j = nodoAffidabilita(d, t);
  if (j < 0) {
    out.eps = Number.NaN;
    out.formaDeterminata = false;
    out.datiPresenti = false;
    return true;
  }
  const l = s.log10eps[j]!;
  const f = s.flag[j]!;
  out.eps = Number.isNaN(l) ? Number.NaN : 10 ** l;
  out.formaDeterminata = (f & BIT_FORMA_DETERMINATA) !== 0;
  out.datiPresenti = (f & BIT_DATI_PRESENTI) !== 0;
  return true;
}

/** Carica reliability.bin dall'archivio dei dati (dopo il primo frame, § 5.6). */
export async function caricaAffidabilita(store: DataStore, segnale?: AbortSignal): Promise<DatiAffidabilita> {
  return leggiAffidabilita(await store.carica(PERCORSO_AFFIDABILITA, segnale));
}
