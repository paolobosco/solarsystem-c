// Intestazione comune dei file binari (§ 8.2 di docs/PROGETTO.md) e blocchi temporali (§ 8.1).
// Little endian. Stesse verifiche di scripts/pipeline/common/binio.py (leggi_intestazione).

import { B, K, T0, T_END } from '../ephem/constants';

export const DIM_INTESTAZIONE = 64;
export const VERSIONE_FORMATO = 1;

export const TIPO_PIANETI = 1;
export const TIPO_SATELLITI = 2;
export const TIPO_PICCOLI_CORPI = 3;
export const TIPO_LUNA = 4;
export const TIPO_AFFIDABILITA = 5;
export const TIPO_STELLE = 6;

export const MAGIC_SERIE = 'SSSERIE1';
export const MAGIC_SATELLITI = 'SSSATS01';
export const MAGIC_LUNA = 'SSMOON01';
export const MAGIC_AFFIDABILITA = 'SSRELI02';
export const MAGIC_STELLE = 'SSSTAR01';

/** Tipi ammessi per ciascun magic. */
export const TIPI_PER_MAGIC: Readonly<Record<string, readonly number[]>> = {
  [MAGIC_SERIE]: [TIPO_PIANETI, TIPO_PICCOLI_CORPI],
  [MAGIC_SATELLITI]: [TIPO_SATELLITI],
  [MAGIC_LUNA]: [TIPO_LUNA],
  [MAGIC_AFFIDABILITA]: [TIPO_AFFIDABILITA],
  [MAGIC_STELLE]: [TIPO_STELLE],
};

/** File binario non conforme al formato. */
export class ErroreFormato extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreFormato';
  }
}

export interface IntestazioneBinaria {
  magic: string;
  versione: number;
  tipo: number;
  blocco: number; // -1 se non applicabile
  nVoci: number;
  inizio: number; // nucleo, JD TDB
  fine: number; // esclusa
  offsetVoci: number;
  dimensione: number;
}

// --- Blocchi (§ 8.1) ---

/** Inizio del nucleo del blocco k (JD TDB). */
export function inizioBlocco(k: number): number {
  if (!(Number.isInteger(k) && k >= 0 && k < K)) throw new RangeError(`blocco fuori intervallo: ${k}`);
  return T0 + k * B;
}

/** Fine esclusa del nucleo del blocco k; il blocco 12 termina a T_END. */
export function fineBlocco(k: number): number {
  if (!(Number.isInteger(k) && k >= 0 && k < K)) throw new RangeError(`blocco fuori intervallo: ${k}`);
  return Math.min(T0 + (k + 1) * B, T_END);
}

/**
 * Indice del blocco il cui nucleo contiene t, oppure -1 fuori da [T0, T_END).
 * Il quoziente (t - T0)/B può arrotondare oltre un confine: si corregge con confronti esatti.
 */
export function bloccoDi(t: number): number {
  if (!(t >= T0 && t < T_END)) return -1;
  let k = Math.min(Math.floor((t - T0) / B), K - 1);
  if (t < T0 + k * B) k -= 1;
  else if (k < K - 1 && t >= T0 + (k + 1) * B) k += 1;
  return k;
}

// --- Lettura e verifica ---

function leggiMagic(v: DataView): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += String.fromCharCode(v.getUint8(i));
  return s;
}

/** Verifica dei campi; dimensioneReale è la lunghezza del buffer. */
export function validaIntestazione(i: IntestazioneBinaria, dimensioneReale?: number): void {
  const tipi = Object.hasOwn(TIPI_PER_MAGIC, i.magic) ? TIPI_PER_MAGIC[i.magic] : undefined;
  if (tipi === undefined) throw new ErroreFormato(`magic sconosciuto: ${JSON.stringify(i.magic)}`);
  if (i.versione !== VERSIONE_FORMATO) throw new ErroreFormato(`versione non supportata: ${i.versione}`);
  if (!tipi.includes(i.tipo)) throw new ErroreFormato(`tipo ${i.tipo} incoerente con ${i.magic}`);
  if (!(Number.isFinite(i.inizio) && Number.isFinite(i.fine) && i.inizio < i.fine)) {
    throw new ErroreFormato('nucleo non valido');
  }
  if (i.blocco !== -1) {
    if (!(i.blocco >= 0 && i.blocco < K)) throw new ErroreFormato(`indice di blocco non valido: ${i.blocco}`);
    if (i.inizio !== inizioBlocco(i.blocco) || i.fine !== fineBlocco(i.blocco)) {
      throw new ErroreFormato(`nucleo del blocco ${i.blocco} non conforme: [${i.inizio}, ${i.fine})`);
    }
  }
  if (i.dimensione % 8 !== 0 || i.dimensione < DIM_INTESTAZIONE) {
    throw new ErroreFormato(`dimensione non valida: ${i.dimensione}`);
  }
  if (dimensioneReale !== undefined && dimensioneReale !== i.dimensione) {
    throw new ErroreFormato(`dimensione dichiarata ${i.dimensione}, reale ${dimensioneReale}`);
  }
  if (i.offsetVoci % 8 !== 0 || i.offsetVoci < DIM_INTESTAZIONE || i.offsetVoci > i.dimensione) {
    throw new ErroreFormato(`offset della tabella delle voci non valido: ${i.offsetVoci}`);
  }
}

/**
 * Legge e verifica l'intestazione: magic, versione, tipo, nucleo, blocco, dimensione uguale
 * alla lunghezza del buffer, offset, campo riservato nullo. Con magicAtteso verifica anche il magic.
 */
export function leggiIntestazione(buf: ArrayBuffer, magicAtteso?: string): IntestazioneBinaria {
  if (buf.byteLength < DIM_INTESTAZIONE) throw new ErroreFormato("file più corto dell'intestazione");
  const v = new DataView(buf, 0, DIM_INTESTAZIONE);
  const i: IntestazioneBinaria = {
    magic: leggiMagic(v),
    versione: v.getUint32(8, true),
    tipo: v.getUint32(12, true),
    blocco: v.getInt32(16, true),
    nVoci: v.getUint32(20, true),
    inizio: v.getFloat64(24, true),
    fine: v.getFloat64(32, true),
    offsetVoci: v.getUint32(40, true),
    dimensione: v.getUint32(44, true),
  };
  for (let o = 48; o < DIM_INTESTAZIONE; o++) {
    if (v.getUint8(o) !== 0) throw new ErroreFormato("campo riservato dell'intestazione non nullo");
  }
  validaIntestazione(i, buf.byteLength);
  if (magicAtteso !== undefined && i.magic !== magicAtteso) {
    throw new ErroreFormato(`magic atteso ${magicAtteso}, trovato ${JSON.stringify(i.magic)}`);
  }
  return i;
}

/** Arrotondamento al multiplo di 8 successivo. */
export function allinea8(n: number): number {
  return (n + 7) & ~7;
}
