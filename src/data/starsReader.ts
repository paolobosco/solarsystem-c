// Lettore di stars.bin (§ 8.8 di docs/PROGETTO.md), formato uguale a scripts/pipeline/stars.py.
// Dopo l'intestazione comune (magic SSSTAR01, tipo 6, blocco -1, voci = numero di stelle, offset 64):
// record di 40 byte: Float32 ux, uy, uz (direzione a J2000,0, eclittica J2000); Float32 distanza (pc, 0 se
// non disponibile); Float32 vx, vy, vz (pc/anno con moto 3D, rad/anno con moto lineare angolare); Float32 V;
// Float32 B-V (NaN se assente); u16 HR; u8 flag (bit 0 moto 3D, bit 1 lineare angolare); u8 riservato.
// La lettura copia i campi in vettori separati (DatiStelle, la stessa forma attesa da src/render/stars.ts).

import type { DataStore } from './types';
import { DIM_INTESTAZIONE, ErroreFormato, MAGIC_STELLE, TIPO_STELLE, leggiIntestazione } from './binHeader';

export const PERCORSO_STELLE = 'stars.bin';
export const DIM_RECORD_STELLA = 40;
export const FLAG_MOTO_3D = 1;
export const FLAG_LINEARE_ANGOLARE = 2;

/** Campi di stars.bin, uno per stella; direzioni e velocità come vettori a 3 componenti consecutive. */
export interface DatiStelle {
  readonly numero: number;
  readonly direzione: Float32Array;
  readonly distanzaPc: Float32Array;
  readonly velocita: Float32Array;
  readonly magV: Float32Array;
  readonly bv: Float32Array;
  readonly hr: Uint16Array;
  readonly flag: Uint8Array;
}

/** Legge e verifica stars.bin: intestazione, dimensione, versori unitari, flag e riservato. */
export function leggiStelle(buf: ArrayBuffer): DatiStelle {
  const i = leggiIntestazione(buf, MAGIC_STELLE);
  if (i.tipo !== TIPO_STELLE || i.blocco !== -1 || i.offsetVoci !== DIM_INTESTAZIONE) {
    throw new ErroreFormato('file delle stelle non conforme');
  }
  const n = i.nVoci;
  if (i.dimensione !== DIM_INTESTAZIONE + DIM_RECORD_STELLA * n) throw new ErroreFormato('dimensione del file delle stelle non conforme');
  const v = new DataView(buf);
  const direzione = new Float32Array(3 * n);
  const distanzaPc = new Float32Array(n);
  const velocita = new Float32Array(3 * n);
  const magV = new Float32Array(n);
  const bv = new Float32Array(n);
  const hr = new Uint16Array(n);
  const flag = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    const o = DIM_INTESTAZIONE + DIM_RECORD_STELLA * s;
    for (let k = 0; k < 3; k++) {
      direzione[3 * s + k] = v.getFloat32(o + 4 * k, true);
      velocita[3 * s + k] = v.getFloat32(o + 16 + 4 * k, true);
    }
    distanzaPc[s] = v.getFloat32(o + 12, true);
    magV[s] = v.getFloat32(o + 28, true);
    bv[s] = v.getFloat32(o + 32, true);
    hr[s] = v.getUint16(o + 36, true);
    flag[s] = v.getUint8(o + 38);
    if (v.getUint8(o + 39) !== 0 || (flag[s]! & ~3) !== 0 || flag[s] === 3) throw new ErroreFormato(`stella ${s}: flag non validi`);
    const x = direzione[3 * s]!;
    const y = direzione[3 * s + 1]!;
    const z = direzione[3 * s + 2]!;
    const norma = Math.sqrt(x * x + y * y + z * z);
    if (!(Math.abs(norma - 1) < 1e-5)) throw new ErroreFormato(`stella ${s}: direzione non unitaria`);
    if (!(Number.isFinite(magV[s]!) && distanzaPc[s]! >= 0)) throw new ErroreFormato(`stella ${s}: valori non validi`);
    if ((flag[s]! & FLAG_MOTO_3D) !== 0 && !(distanzaPc[s]! > 0)) throw new ErroreFormato(`stella ${s}: moto 3D senza distanza`);
  }
  return { numero: n, direzione, distanzaPc, velocita, magV, bv, hr, flag };
}

/**
 * Direzione alla data (§ 8.8), Float64: normalize(d·u + v·Δt) con moto 3D, normalize(u + v·Δt) con moto lineare
 * angolare, u altrimenti; Δt in anni giuliani da J2000,0 (TT). Scrive in out[off..off+2].
 */
export function direzioneStella(s: DatiStelle, i: number, anniDaJ2000: number, out: Float64Array, off = 0): void {
  const ux = s.direzione[3 * i]!;
  const uy = s.direzione[3 * i + 1]!;
  const uz = s.direzione[3 * i + 2]!;
  const vx = s.velocita[3 * i]!;
  const vy = s.velocita[3 * i + 1]!;
  const vz = s.velocita[3 * i + 2]!;
  const f = s.flag[i]!;
  const d = s.distanzaPc[i]!;
  let x = ux;
  let y = uy;
  let z = uz;
  if ((f & FLAG_MOTO_3D) !== 0 && d > 0) {
    x = d * ux + vx * anniDaJ2000;
    y = d * uy + vy * anniDaJ2000;
    z = d * uz + vz * anniDaJ2000;
  } else if ((f & FLAG_LINEARE_ANGOLARE) !== 0) {
    x = ux + vx * anniDaJ2000;
    y = uy + vy * anniDaJ2000;
    z = uz + vz * anniDaJ2000;
  }
  const n = Math.sqrt(x * x + y * y + z * z) || 1;
  out[off] = x / n;
  out[off + 1] = y / n;
  out[off + 2] = z / n;
}

/** Fornitore delle stelle per il rendering (caricamento dopo il primo frame, § 5.6). */
export function fornitoreStelle(store: DataStore): { carica(segnale: AbortSignal): Promise<DatiStelle> } {
  return {
    async carica(segnale) {
      return leggiStelle(await store.carica(PERCORSO_STELLE, segnale));
    },
  };
}
