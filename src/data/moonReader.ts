// Lettore del file della Luna moon.bin (§ 8.4 di docs/PROGETTO.md) e spline di Hermite delle correzioni.
// Formato e verifiche uguali a scripts/pipeline/moon.py (scrivi_moon_bin, leggi_moon_bin).
// Dopo l'intestazione comune (tipo 4, blocco -1, voci = nodi, offset delle voci = 64):
// f64 t_nodo0, f64 passo, u32 nodi, u32 colonne, poi Float64 [nodi × colonne × 2] (valore, derivata in /d).
// La lettura alloca una volta; correzioniLuna non alloca.

import type { Scrivibile } from '../ephem/equinoctial';
import { basiHermite, nodoSinistro } from '../ephem/interp';
import { DIM_INTESTAZIONE, ErroreFormato, MAGIC_LUNA, TIPO_LUNA, leggiIntestazione } from './binHeader';

/** Colonne: ΔL', ΔD, ΔM, ΔM', ΔF (rad) e κ (adimensionale). */
export const COLONNE_LUNA = 6;
export const OFFSET_DATI_LUNA = DIM_INTESTAZIONE + 24;

export interface DatiLuna {
  /** Nucleo coperto (JD TDB): [inizio, fine). */
  readonly inizio: number;
  readonly fine: number;
  readonly t0: number;
  readonly passo: number; // d
  readonly nodi: number;
  /** Float64 [nodi × 6 × 2]: (valore, derivata per giorno) per colonna. */
  readonly dati: Float64Array;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Legge e verifica moon.bin: intestazione, nodi, colonne, copertura del nucleo, valori finiti. */
export function leggiLuna(buf: ArrayBuffer): DatiLuna {
  const intest = leggiIntestazione(buf, MAGIC_LUNA);
  if (intest.tipo !== TIPO_LUNA || intest.blocco !== -1) throw new ErroreFormato('file della Luna non conforme');
  if (intest.offsetVoci !== DIM_INTESTAZIONE) throw new ErroreFormato('offset dei dati della Luna non conforme');
  if (intest.dimensione < OFFSET_DATI_LUNA) throw new ErroreFormato('file troppo corto');
  const v = new DataView(buf);
  const t0 = v.getFloat64(DIM_INTESTAZIONE, true);
  const passo = v.getFloat64(DIM_INTESTAZIONE + 8, true);
  const nodi = v.getUint32(DIM_INTESTAZIONE + 16, true);
  const colonne = v.getUint32(DIM_INTESTAZIONE + 20, true);
  if (colonne !== COLONNE_LUNA || nodi !== intest.nVoci || nodi < 2) {
    throw new ErroreFormato('colonne o nodi non conformi');
  }
  if (!(Number.isFinite(t0) && passo > 0 && t0 <= intest.inizio && t0 + passo * (nodi - 1) >= intest.fine)) {
    throw new ErroreFormato('nodi non coprono il nucleo');
  }
  const n = nodi * colonne * 2;
  if (OFFSET_DATI_LUNA + 8 * n > intest.dimensione) throw new ErroreFormato('file troppo corto');
  let dati: Float64Array;
  if (LITTLE_ENDIAN) {
    dati = new Float64Array(buf, OFFSET_DATI_LUNA, n);
  } else {
    dati = new Float64Array(n);
    for (let i = 0; i < n; i++) dati[i] = v.getFloat64(OFFSET_DATI_LUNA + 8 * i, true);
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(dati[i]!)) throw new ErroreFormato('dati non finiti');
  return { inizio: intest.inizio, fine: intest.fine, t0, passo, nodi, dati };
}

const basi = new Float64Array(8);

/**
 * Correzioni (out[0..5]) e derivate per giorno (derivate[0..5]) a t con Hermite cubica tra i nodi
 * j e j + 1, j = floor((t - t0)/passo) limitato a [0, nodi - 2]; stesse operazioni di
 * common/interp.py (hermite_cubica). Non controlla la copertura.
 */
export function correzioniLuna(d: DatiLuna, t: number, out: Scrivibile, derivate: Scrivibile): void {
  const h = d.passo;
  const x = (t - d.t0) / h;
  const j = nodoSinistro(x, 0, d.nodi - 2);
  basiHermite(x - j, basi);
  const h00 = basi[0]!;
  const h10 = basi[1]!;
  const h01 = basi[2]!;
  const h11 = basi[3]!;
  const d00 = basi[4]!;
  const d10 = basi[5]!;
  const d01 = basi[6]!;
  const d11 = basi[7]!;
  const r0 = j * 2 * COLONNE_LUNA;
  const r1 = r0 + 2 * COLONNE_LUNA;
  const a = d.dati;
  for (let c = 0; c < COLONNE_LUNA; c++) {
    const p0 = a[r0 + 2 * c]!;
    const v0 = a[r0 + 2 * c + 1]!;
    const p1 = a[r1 + 2 * c]!;
    const v1 = a[r1 + 2 * c + 1]!;
    out[c] = h00 * p0 + h10 * (h * v0) + h01 * p1 + h11 * (h * v1);
    derivate[c] = (d00 * p0 + d01 * p1) / h + d10 * v0 + d11 * v1;
  }
}
