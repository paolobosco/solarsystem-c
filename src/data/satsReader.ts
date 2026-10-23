// Lettore dei file dei satelliti sats/sKK.bin (§ 8.5 di docs/PROGETTO.md) e valutazione dei record
// (§ 7.5.2-7.5.3). Formato e verifiche uguali a scripts/pipeline/sats/formato.py; valutazione con le
// stesse operazioni di scripts/pipeline/sats/modello.py. La lettura alloca una volta; la valutazione no.
//
// Voce per satellite (8 byte): u16 ssid, u16 numero di record, u32 offset del primo record.
// Record: u8 tipo (0 da SPK, 1 secolare), i8 I, u16 K, u32 riservato; poi Float64 [14 + 2K]:
// t_inizio, t_fine, t_ref, a, e, ϖ0, ϖ̇, tan(i/2), Ω0, Ω̇, λ0, n, c2, c3, S_1, C_1, ..., S_K, C_K.

import { GIORNO_S } from '../ephem/constants';
import type { Scrivibile } from '../ephem/equinoctial';
import { risolviKeplero } from '../ephem/kepler';
import { DIM_INTESTAZIONE, ErroreFormato, MAGIC_SATELLITI, TIPO_SATELLITI, leggiIntestazione } from './binHeader';
import type { IntestazioneBinaria } from './binHeader';
import { ultimoInizio } from './intervalli';

export const DIM_VOCE_SAT = 8;
export const DIM_TESTA_RECORD = 8;
export const N_VALORI_BASE = 14;
export const K_MAX = 6;
export const RECORD_SPK = 0;
export const RECORD_SECOLARE = 1;
/** Semiampiezza del raccordo: L_b = 0,1·min(L_prec, L_succ) (§ 7.5.3). */
export const FRAZIONE_RACCORDO = 0.1;

// Indici dei valori del record.
const T_INIZIO = 0;
const T_FINE = 1;
const T_REF = 2;
const A = 3;
const E = 4;
const VARPI0 = 5;
const VARPI_DOT = 6;
const TAN_I2 = 7;
const OMEGA0 = 8;
const OMEGA_DOT = 9;
const LAM0 = 10;
const N = 11;
const C2 = 12;
const C3 = 13;

/** Record di un satellite: valori Float64 [14 + 2K] (vista sul buffer). */
export interface RecordSatellite {
  readonly tipo: number;
  readonly fattoreI: number;
  readonly k: number;
  readonly valori: Float64Array;
}

/** Elementi del modello a un istante, nel sistema F: a (km), e, ϖ, tan(i/2), Ω, λ (rad), n_eff (rad/d). */
export interface ElementiModello {
  a: number;
  e: number;
  varpi: number;
  tanI2: number;
  omega: number;
  lam: number;
  nEff: number;
  fattoreI: number;
}

interface Satellite {
  readonly inizi: Float64Array;
  readonly record: readonly RecordSatellite[];
}

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Elementi del record a t (τ = t - t_ref), senza controllo dell'intervallo. */
export function elementiRecord(r: RecordSatellite, frequenze: ArrayLike<number>, t: number, out: ElementiModello): void {
  const v = r.valori;
  const tau = t - v[T_REF]!;
  const n = v[N]!;
  const c2 = v[C2]!;
  const c3 = v[C3]!;
  let lam = v[LAM0]! + tau * (n + tau * (c2 + tau * c3));
  let neff = n + tau * (2 * c2 + 3 * c3 * tau);
  for (let j = 0; j < r.k; j++) {
    const s = v[N_VALORI_BASE + 2 * j]!;
    const c = v[N_VALORI_BASE + 2 * j + 1]!;
    const nu = frequenze[j]!;
    const arg = nu * tau;
    const sa = Math.sin(arg);
    const ca = Math.cos(arg);
    lam = lam + (s * sa + c * ca);
    neff = neff + nu * (s * ca - c * sa);
  }
  out.a = v[A]!;
  out.e = v[E]!;
  out.varpi = v[VARPI0]! + v[VARPI_DOT]! * tau;
  out.tanI2 = v[TAN_I2]!;
  out.omega = v[OMEGA0]! + v[OMEGA_DOT]! * tau;
  out.lam = lam;
  out.nEff = neff;
  out.fattoreI = r.fattoreI;
}

/** Stato [km, km/s] nel sistema F dagli elementi del modello (§ 7.2 con n_eff). */
export function statoDaElementiModello(el: ElementiModello, out: Scrivibile): void {
  const a = el.a;
  const h = el.e * Math.sin(el.varpi);
  const k = el.e * Math.cos(el.varpi);
  const fi = el.fattoreI;
  const tt = fi > 0 ? el.tanI2 : 1 / el.tanI2;
  const p = tt * Math.sin(el.omega);
  const q = tt * Math.cos(el.omega);
  const ff = risolviKeplero(el.lam, h, k);
  const cf = Math.cos(ff);
  const sf = Math.sin(ff);
  const beta = 1 / (1 + Math.sqrt(1 - h * h - k * k));
  const r = a * (1 - k * cf - h * sf);
  const x1 = a * ((1 - beta * h * h) * cf + h * k * beta * sf - k);
  const y1 = a * ((1 - beta * k * k) * sf + h * k * beta * cf - h);
  const fatt = ((el.nEff / GIORNO_S) * a * a) / r;
  const vx1 = fatt * (h * k * beta * cf - (1 - beta * h * h) * sf);
  const vy1 = fatt * ((1 - beta * k * k) * cf - h * k * beta * sf);
  const p2 = p * p;
  const q2 = q * q;
  const s2 = 1 + p2 + q2;
  const fx = (1 - p2 + q2) / s2;
  const fy = (2 * p * q) / s2;
  const fz = (-2 * fi * p) / s2;
  const gx = (2 * fi * p * q) / s2;
  const gy = ((1 + p2 - q2) * fi) / s2;
  const gz = (2 * q) / s2;
  out[0] = x1 * fx + y1 * gx;
  out[1] = x1 * fy + y1 * gy;
  out[2] = x1 * fz + y1 * gz;
  out[3] = vx1 * fx + vy1 * gx;
  out[4] = vx1 * fy + vy1 * gy;
  out[5] = vx1 * fz + vy1 * gz;
}

// Memoria di lavoro della valutazione.
const elLavoro: ElementiModello = { a: 0, e: 0, varpi: 0, tanI2: 0, omega: 0, lam: 0, nEff: 0, fattoreI: 1 };
const statoAltro = new Float64Array(6);

/** Stato [km, km/s] nel sistema F del record a t, senza controllo dell'intervallo. */
export function statoRecord(r: RecordSatellite, frequenze: ArrayLike<number>, t: number, out: Scrivibile): void {
  elementiRecord(r, frequenze, t, elLavoro);
  statoDaElementiModello(elLavoro, out);
}

/** Durata del nucleo del record (d). */
function durata(r: RecordSatellite): number {
  return r.valori[T_FINE]! - r.valori[T_INIZIO]!;
}

/**
 * r = (1 - w)·r_prec + w·r_succ con w = 3x² - 2x³, x = (t - t_b + L_b)/(2·L_b) limitato a [0, 1];
 * velocità con il termine dw/dt·(r_succ - r_prec). `out` contiene lo stato del record proprio.
 */
function miscela(proprio: Scrivibile, altro: Float64Array, proprioSucc: boolean, t: number, tb: number, lb: number): void {
  let x = (t - tb + lb) / (2 * lb);
  if (x < 0) x = 0;
  else if (x > 1) x = 1;
  const w = x * x * (3 - 2 * x);
  const dwdt = (6 * x * (1 - x)) / (2 * lb) / GIORNO_S;
  for (let i = 0; i < 3; i++) {
    const prec = proprioSucc ? altro[i]! : proprio[i]!;
    const succ = proprioSucc ? proprio[i]! : altro[i]!;
    const vPrec = proprioSucc ? altro[i + 3]! : proprio[i + 3]!;
    const vSucc = proprioSucc ? proprio[i + 3]! : altro[i + 3]!;
    proprio[i] = (1 - w) * prec + w * succ;
    proprio[i + 3] = (1 - w) * vPrec + w * vSucc + dwdt * (succ - prec);
  }
}

/** File SSSATS01 letto e verificato. */
export class FileSatelliti {
  readonly intestazione: IntestazioneBinaria;
  readonly ssids: readonly number[];
  private readonly satelliti: Map<number, Satellite>;

  constructor(intestazione: IntestazioneBinaria, satelliti: Map<number, Satellite>) {
    this.intestazione = intestazione;
    this.satelliti = satelliti;
    this.ssids = [...satelliti.keys()];
  }

  contiene(ssid: number): boolean {
    return this.satelliti.has(ssid);
  }

  record(ssid: number): readonly RecordSatellite[] | undefined {
    return this.satelliti.get(ssid)?.record;
  }

  /** Indice del record il cui nucleo contiene t, -1 se nessuno (o satellite assente). */
  indiceRecord(ssid: number, t: number): number {
    const s = this.satelliti.get(ssid);
    if (s === undefined) return -1;
    const j = ultimoInizio(s.inizi, t);
    return j >= 0 && t < s.record[j]!.valori[T_FINE]! ? j : -1;
  }

  /**
   * Stato [km, km/s] nel sistema F a t (JD TDB), con raccordo ai confini dei record (§ 7.5.3).
   * Esito 'fuori-copertura' fuori dal nucleo del file o dai record; 'non-determinabile' se il satellite
   * manca dal file. Se l'esito non è 'ok' out non è modificato.
   */
  valutaF(ssid: number, frequenze: ArrayLike<number>, t: number, out: Scrivibile): 'ok' | 'fuori-copertura' | 'non-determinabile' {
    if (!(t >= this.intestazione.inizio && t < this.intestazione.fine)) return 'fuori-copertura';
    const s = this.satelliti.get(ssid);
    if (s === undefined) return 'non-determinabile';
    const j = ultimoInizio(s.inizi, t);
    if (j < 0) return 'fuori-copertura';
    const recs = s.record;
    const r = recs[j]!;
    const t0 = r.valori[T_INIZIO]!;
    const t1 = r.valori[T_FINE]!;
    if (!(t < t1)) return 'fuori-copertura';
    statoRecord(r, frequenze, t, out);
    if (j > 0) {
      const p = recs[j - 1]!;
      const lb = FRAZIONE_RACCORDO * Math.min(durata(p), durata(r));
      if (t < t0 + lb) {
        statoRecord(p, frequenze, t, statoAltro);
        miscela(out, statoAltro, true, t, t0, lb);
      }
    }
    if (j < recs.length - 1) {
      const sx = recs[j + 1]!;
      const lb = FRAZIONE_RACCORDO * Math.min(durata(r), durata(sx));
      if (t >= t1 - lb) {
        statoRecord(sx, frequenze, t, statoAltro);
        miscela(out, statoAltro, false, t, t1, lb);
      }
    }
    return 'ok';
  }
}

function valoriRecord(buf: ArrayBuffer, v: DataView, offset: number, n: number): Float64Array {
  if (LITTLE_ENDIAN) return new Float64Array(buf, offset, n);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = v.getFloat64(offset + 8 * i, true);
  return out;
}

function verificaRecord(r: RecordSatellite, ssid: number): void {
  const x = r.valori;
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i]!)) throw new ErroreFormato(`valori non finiti nel record di ${ssid}`);
  if (r.tipo !== RECORD_SPK && r.tipo !== RECORD_SECOLARE) throw new ErroreFormato(`tipo di record non valido: ${r.tipo}`);
  if (r.fattoreI !== 1 && r.fattoreI !== -1) throw new ErroreFormato(`fattore I non valido: ${r.fattoreI}`);
  if (!(x[T_INIZIO]! < x[T_FINE]!)) throw new ErroreFormato('intervallo del record vuoto');
  if (!(x[A]! > 0 && x[E]! >= 0 && x[E]! < 1 && x[TAN_I2]! > 0)) throw new ErroreFormato('elementi del record non validi');
}

/**
 * Legge e verifica un file SSSATS01: intestazione (magic, versione, tipo 2, dimensione), voci ordinate,
 * record nel file e disgiunti, K ≤ 6, campi riservati nulli, valori finiti, record contigui che coprono
 * il nucleo del blocco. I valori dei record sono viste sul buffer.
 */
export function leggiSatelliti(buf: ArrayBuffer): FileSatelliti {
  const intest = leggiIntestazione(buf, MAGIC_SATELLITI);
  if (intest.tipo !== TIPO_SATELLITI) throw new ErroreFormato(`tipo atteso ${TIPO_SATELLITI}, trovato ${intest.tipo}`);
  const dim = intest.dimensione;
  const v = new DataView(buf);
  const fineVoci = intest.offsetVoci + DIM_VOCE_SAT * intest.nVoci;
  if (fineVoci > dim) throw new ErroreFormato('tabella delle voci oltre la fine del file');
  const regioni: [number, number][] = [
    [0, DIM_INTESTAZIONE],
    [intest.offsetVoci, fineVoci],
  ];
  const satelliti = new Map<number, Satellite>();
  let prec = -1;
  for (let iv = 0; iv < intest.nVoci; iv++) {
    const o = intest.offsetVoci + DIM_VOCE_SAT * iv;
    const ssid = v.getUint16(o, true);
    const nrec = v.getUint16(o + 2, true);
    const off = v.getUint32(o + 4, true);
    if (ssid <= prec) throw new ErroreFormato('voci non ordinate per ssid crescente o duplicate');
    prec = ssid;
    if (nrec === 0) throw new ErroreFormato(`satellite ${ssid} senza record`);
    let p = off;
    const record: RecordSatellite[] = [];
    const inizi = new Float64Array(nrec);
    for (let j = 0; j < nrec; j++) {
      if (p % 8 !== 0 || p + DIM_TESTA_RECORD > dim) throw new ErroreFormato(`record di ${ssid} fuori dal file`);
      const tipo = v.getUint8(p);
      const fi = v.getInt8(p + 1);
      const k = v.getUint16(p + 2, true);
      if (v.getUint32(p + 4, true) !== 0) throw new ErroreFormato('campo riservato del record non nullo');
      if (k > K_MAX) throw new ErroreFormato(`K non valido: ${k}`);
      const n = N_VALORI_BASE + 2 * k;
      if (p + DIM_TESTA_RECORD + 8 * n > dim) throw new ErroreFormato(`record di ${ssid} oltre la fine del file`);
      const r: RecordSatellite = { tipo, fattoreI: fi, k, valori: valoriRecord(buf, v, p + DIM_TESTA_RECORD, n) };
      verificaRecord(r, ssid);
      if (j > 0 && record[j - 1]!.valori[T_FINE]! !== r.valori[T_INIZIO]!) throw new ErroreFormato('record non contigui');
      inizi[j] = r.valori[T_INIZIO]!;
      record.push(r);
      p += DIM_TESTA_RECORD + 8 * n;
    }
    if (inizi[0]! > intest.inizio || record[nrec - 1]!.valori[T_FINE]! < intest.fine) {
      throw new ErroreFormato(`i record di ${ssid} non coprono il nucleo del blocco`);
    }
    regioni.push([off, p]);
    satelliti.set(ssid, { inizi, record });
  }
  regioni.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (let i = 1; i < regioni.length; i++) {
    if (regioni[i]![0] < regioni[i - 1]![1]) throw new ErroreFormato('regioni sovrapposte');
  }
  return new FileSatelliti(intest, satelliti);
}
