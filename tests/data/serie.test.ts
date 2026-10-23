// Intestazione comune, formato SSSERIE1 e interpolazione contro le fixture Python (tests/fixtures/common/).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { B, K, T0, T_END } from '../../src/ephem/constants';
import {
  DENOMINATORI_LAGRANGE,
  basiHermite,
  hermiteCubica,
  lagrange8,
  nodoSinistro,
  pesiLagrange8,
} from '../../src/ephem/interp';
import {
  DIM_INTESTAZIONE,
  ErroreFormato,
  MAGIC_LUNA,
  MAGIC_SERIE,
  TIPO_LUNA,
  TIPO_PIANETI,
  TIPO_PICCOLI_CORPI,
  allinea8,
  bloccoDi,
  fineBlocco,
  inizioBlocco,
  leggiIntestazione,
} from '../../src/data/binHeader';
import { SEG_C, SEG_E, leggiSerie, passoAmmesso } from '../../src/data/serie';
import { generatore } from '../time/casuale';

interface CasoSerie {
  ssid: number;
  t: number;
  esito: string;
  segmento: number | null;
  stato: number[] | null;
}

const binario = readFileSync(new URL('../fixtures/common/serie-prova.bin', import.meta.url));
const attesi = JSON.parse(readFileSync(new URL('../fixtures/common/serie-prova.json', import.meta.url), 'utf-8')) as {
  sha256: string;
  casi: CasoSerie[];
};

/** Copia del file di prova in un ArrayBuffer proprio. */
function copia(): ArrayBuffer {
  const out = new ArrayBuffer(binario.byteLength);
  new Uint8Array(out).set(binario);
  return out;
}

/** Copia modificata dalla funzione indicata. */
function alterato(f: (v: DataView) => void, lunghezza = binario.byteLength): ArrayBuffer {
  const out = new ArrayBuffer(lunghezza);
  new Uint8Array(out).set(binario.subarray(0, Math.min(lunghezza, binario.byteLength)));
  f(new DataView(out));
  return out;
}

/** Intestazione minima di 64 byte. */
function intestazione(magic: string, tipo: number, blocco: number, inizio: number, fine: number, extra = 0): ArrayBuffer {
  const out = new ArrayBuffer(DIM_INTESTAZIONE + extra);
  const v = new DataView(out);
  for (let i = 0; i < 8; i++) v.setUint8(i, magic.charCodeAt(i));
  v.setUint32(8, 1, true);
  v.setUint32(12, tipo, true);
  v.setInt32(16, blocco, true);
  v.setUint32(20, 0, true);
  v.setFloat64(24, inizio, true);
  v.setFloat64(32, fine, true);
  v.setUint32(40, DIM_INTESTAZIONE, true);
  v.setUint32(44, DIM_INTESTAZIONE + extra, true);
  return out;
}

// Offset nel file di prova: voci da 64; tabella dei segmenti della prima voce.
const OFF_VOCI = 64;
function offTabella(v: DataView, voce: number): number {
  return v.getUint32(OFF_VOCI + 8 * voce + 4, true);
}

describe('blocchi (§ 8.1)', () => {
  it('nuclei e confini con confronti esatti', () => {
    expect(inizioBlocco(0)).toBe(T0);
    expect(inizioBlocco(12)).toBe(2455615.5);
    expect(fineBlocco(12)).toBe(T_END);
    expect(fineBlocco(3)).toBe(inizioBlocco(4));
    expect(() => inizioBlocco(K)).toThrow(RangeError);
    expect(() => fineBlocco(-1)).toThrow(RangeError);
    expect(bloccoDi(T0)).toBe(0);
    expect(bloccoDi(T0 - 1e-9)).toBe(-1);
    expect(bloccoDi(T_END)).toBe(-1);
    expect(bloccoDi(Number.NaN)).toBe(-1);
    for (let k = 1; k < K; k++) {
      const c = T0 + k * B;
      expect(bloccoDi(c)).toBe(k);
      // Istante immediatamente precedente al confine (il quoziente arrotonda al blocco k).
      const prima = c - Math.abs(c) * Number.EPSILON;
      expect(prima).toBeLessThan(c);
      expect(bloccoDi(prima)).toBe(k - 1);
    }
    expect(bloccoDi(T_END - 1e-6)).toBe(12);
  });
});

describe('intestazione comune (§ 8.2)', () => {
  it('lettura del file di prova', () => {
    const i = leggiIntestazione(copia(), MAGIC_SERIE);
    expect(i).toMatchObject({ magic: MAGIC_SERIE, versione: 1, tipo: TIPO_PICCOLI_CORPI, blocco: -1, nVoci: 3, offsetVoci: 64 });
    expect(i.dimensione).toBe(binario.byteLength);
    expect(i.inizio).toBe(2459999.5);
    expect(i.fine).toBe(2459999.5 + 23 * 32);
  });

  it('blocco conforme e magic di altri formati', () => {
    expect(leggiIntestazione(intestazione(MAGIC_LUNA, TIPO_LUNA, -1, T0, T_END)).magic).toBe(MAGIC_LUNA);
    expect(leggiIntestazione(intestazione(MAGIC_SERIE, TIPO_PIANETI, 12, inizioBlocco(12), fineBlocco(12))).blocco).toBe(12);
  });

  it('errori: magic, versione, tipo, nucleo, blocco, dimensione, offset, riservato', () => {
    const casi: ArrayBuffer[] = [
      new ArrayBuffer(32),
      intestazione('SSXXXX01', TIPO_LUNA, -1, 0, 1),
      intestazione('toString', TIPO_LUNA, -1, 0, 1),
      intestazione(MAGIC_LUNA, TIPO_PIANETI, -1, 0, 1),
      intestazione(MAGIC_LUNA, TIPO_LUNA, -1, 1, 1),
      intestazione(MAGIC_LUNA, TIPO_LUNA, -1, 0, Number.NaN),
      intestazione(MAGIC_LUNA, TIPO_LUNA, 3, 0, 1),
      intestazione(MAGIC_LUNA, TIPO_LUNA, 13, inizioBlocco(12), fineBlocco(12)),
      alterato((v) => v.setUint32(8, 2, true)),
      alterato((v) => v.setUint8(60, 1)),
      alterato((v) => v.setUint32(40, 60, true)),
      alterato((v) => v.setUint32(40, binario.byteLength + 8, true)),
      alterato(() => undefined, binario.byteLength + 8),
      alterato((v) => v.setUint32(44, binario.byteLength - 4, true), binario.byteLength - 4),
    ];
    for (const b of casi) expect(() => leggiIntestazione(b)).toThrow(ErroreFormato);
    expect(() => leggiIntestazione(intestazione(MAGIC_LUNA, TIPO_LUNA, -1, 0, 1), MAGIC_SERIE)).toThrow(ErroreFormato);
  });
});

describe('serie SSSERIE1 (§ 8.3) contro la pipeline', () => {
  it('SHA-256 del file uguale a quello registrato', () => {
    expect(createHash('sha256').update(binario).digest('hex')).toBe(attesi.sha256);
  });

  it('struttura', () => {
    const s = leggiSerie(copia());
    expect(s.ssids).toEqual([1, 900, 901]);
    expect(s.contiene(900)).toBe(true);
    expect(s.contiene(2)).toBe(false);
    expect(s.segmenti(1)!.map((x) => x.tipo)).toEqual([SEG_E]);
    expect(s.segmenti(900)!.map((x) => x.tipo)).toEqual([SEG_E, SEG_C]);
    expect(s.segmenti(901)!.map((x) => x.h)).toEqual([4, 1, 2]);
    const e = s.segmenti(900)![0]!;
    expect(e.fattoreI).toBe(-1);
    expect(e.dati).toBeInstanceOf(Float32Array);
    expect(s.segmenti(900)![1]!.dati).toBeInstanceOf(Float64Array);
  });

  it('200 epoche: esito, segmento e stato entro 1e-12 relativo', () => {
    const s = leggiSerie(copia());
    const out = new Float64Array(6);
    let maxR = 0;
    let maxV = 0;
    const conteggi: Record<string, number> = {};
    for (const c of attesi.casi) {
      out.fill(-1);
      const esito = s.valuta(c.ssid, c.t, out);
      expect(esito, `ssid ${c.ssid}, t ${c.t}`).toBe(c.esito);
      conteggi[esito] = (conteggi[esito] ?? 0) + 1;
      expect(s.indiceSegmento(c.ssid, c.t)).toBe(c.segmento === null || c.esito !== 'ok' ? -1 : c.segmento);
      if (c.stato === null) {
        expect(Array.from(out)).toEqual([-1, -1, -1, -1, -1, -1]);
        continue;
      }
      const r = Math.hypot(c.stato[0]!, c.stato[1]!, c.stato[2]!);
      const v = Math.hypot(c.stato[3]!, c.stato[4]!, c.stato[5]!);
      maxR = Math.max(maxR, Math.hypot(out[0]! - c.stato[0]!, out[1]! - c.stato[1]!, out[2]! - c.stato[2]!) / r);
      maxV = Math.max(maxV, Math.hypot(out[3]! - c.stato[3]!, out[4]! - c.stato[4]!, out[5]! - c.stato[5]!) / v);
    }
    expect(attesi.casi).toHaveLength(200);
    expect(conteggi['ok']).toBeGreaterThan(150);
    expect(conteggi['fuori-copertura']).toBeGreaterThan(0);
    expect(conteggi['non-determinabile']).toBeGreaterThan(0);
    expect(maxR).toBeLessThan(1e-12);
    expect(maxV).toBeLessThan(1e-12);
  });

  it('fuori dal nucleo del file, corpo assente, NaN', () => {
    const s = leggiSerie(copia());
    const out = new Float64Array(6);
    const { inizio, fine } = s.intestazione;
    expect(s.valuta(1, inizio - 1e-9, out)).toBe('fuori-copertura');
    expect(s.valuta(1, fine, out)).toBe('fuori-copertura');
    expect(s.valuta(1, Number.NaN, out)).toBe('fuori-copertura');
    expect(s.valuta(2, inizio + 1, out)).toBe('non-determinabile');
    expect(s.valuta(901, inizio + 450, out)).toBe('non-determinabile');
    expect(s.valuta(1, inizio, out)).toBe('ok');
  });

  it('continuità tra segmenti consecutivi dello stesso corpo', () => {
    const s = leggiSerie(copia());
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    const segs = s.segmenti(900)!;
    const t = segs[1]!.inizio;
    s.valuta(900, t, a);
    s.valuta(900, t - 1e-7, b);
    // Salto dovuto solo alla quantizzazione Float32 del segmento E (circa 1e-8 relativo).
    const salto = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) / Math.hypot(a[0]!, a[1]!, a[2]!);
    expect(salto).toBeLessThan(1e-7);
  });

  it('errori di formato del contenuto', () => {
    const v0 = new DataView(copia());
    const tab900 = offTabella(v0, 1);
    const casi: ArrayBuffer[] = [
      // tipo del file: pianeti con due segmenti per il corpo 900
      alterato((v) => v.setUint32(12, TIPO_PIANETI, true)),
      // voci non ordinate
      alterato((v) => v.setUint16(OFF_VOCI + 8, 0, true)),
      // campo riservato del segmento
      alterato((v) => v.setUint16(tab900 + 2, 1, true)),
      // tipo di segmento
      alterato((v) => v.setUint8(tab900, 3)),
      // passo non potenza di 2
      alterato((v) => v.setFloat64(tab900 + 8, 3, true)),
      // fattore I nullo in un segmento E
      alterato((v) => v.setInt8(tab900 + 1, 0)),
      // dati oltre la fine del file
      alterato((v) => v.setUint32(tab900 + 72, binario.byteLength - 8, true)),
      // dati non allineati
      alterato((v) => v.setUint32(tab900 + 72, v.getUint32(tab900 + 72, true) + 4, true)),
      // dati sovrapposti alla tabella delle voci
      alterato((v) => v.setUint32(tab900 + 72, OFF_VOCI, true)),
      // dati non finiti
      alterato((v) => v.setFloat32(v.getUint32(tab900 + 72, true), Number.NaN, true)),
      // nucleo del segmento fuori dal file
      alterato((v) => v.setFloat64(tab900 + 24, 2459999.5 - 8, true)),
      // stencil incompleto: N ridotto
      alterato((v) => v.setUint32(tab900 + 4, v.getUint32(tab900 + 4, true) - 1, true)),
      // segmenti sovrapposti: il secondo (C) anticipato di 8 d, griglia compresa
      alterato((v) => {
        for (const o of [16, 24, 32]) v.setFloat64(tab900 + 80 + o, v.getFloat64(tab900 + 80 + o, true) - 8, true);
      }),
    ];
    for (const [i, b] of casi.entries()) expect(() => leggiSerie(b), `caso ${i}`).toThrow(ErroreFormato);
    expect(() => leggiSerie(copia(), TIPO_PIANETI)).toThrow(ErroreFormato);
    expect(() => leggiSerie(intestazione(MAGIC_LUNA, TIPO_LUNA, -1, 0, 1))).toThrow(ErroreFormato);
  });

  it('file senza voci e passi ammessi', () => {
    const vuoto = leggiSerie(intestazione(MAGIC_SERIE, TIPO_PIANETI, 12, inizioBlocco(12), fineBlocco(12)));
    expect(vuoto.ssids).toEqual([]);
    expect(passoAmmesso(1 / 64)).toBe(true);
    expect(passoAmmesso(1024)).toBe(true);
    expect(passoAmmesso(2048)).toBe(false);
    expect(passoAmmesso(0.75)).toBe(false);
    expect(allinea8(65)).toBe(72);
  });
});

describe('interpolazione (§ 7.3.3, § 7.6.3)', () => {
  it('pesi di Lagrange: denominatori, somma 1, delta sui nodi', () => {
    const w = new Float64Array(8);
    expect(DENOMINATORI_LAGRANGE).toEqual([-5040, 720, -240, 144, -144, 240, -720, 5040]);
    for (const u of [0, 0.25, 0.5, 0.999]) {
      pesiLagrange8(u, w);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
    }
    pesiLagrange8(0, w);
    for (let i = 0; i < 8; i++) expect(Math.abs(w[i]!)).toBe(i === 3 ? 1 : 0);
  });

  it('Lagrange esatto sui polinomi di grado 7 e stencil limitato ai bordi', () => {
    const rnd = generatore(20261022);
    const coeff = Array.from({ length: 8 }, () => rnd() - 0.5);
    const poli = (x: number) => coeff.reduceRight((acc, c) => acc * x + c, 0);
    const n = 20;
    const h = 0.5;
    const t0 = 100;
    const valori = new Float64Array(2 * n);
    for (let j = 0; j < n; j++) {
      valori[2 * j] = poli(j * h);
      valori[2 * j + 1] = 3;
    }
    const out = new Float64Array(2);
    for (let m = 0; m < 200; m++) {
      const x = (n - 1) * h * rnd();
      lagrange8(t0 + x, t0, h, valori, n, 2, out);
      expect(Math.abs(out[0]! - poli(x)) / Math.max(1, Math.abs(poli(x)))).toBeLessThan(1e-12);
      expect(out[1]).toBeCloseTo(3, 13);
    }
    expect(nodoSinistro(0.5, 3, n - 5)).toBe(3);
    expect(nodoSinistro(n - 1.5, 3, n - 5)).toBe(n - 5);
    expect(nodoSinistro(7.2, 3, n - 5)).toBe(7);
  });

  it('Hermite esatta sulle cubiche, velocità nell’unità del passo', () => {
    const cubica = (x: number) => 2 + x - 0.5 * x * x + 0.25 * x * x * x;
    const derivata = (x: number) => 1 - x + 0.75 * x * x;
    const n = 6;
    const h = 2;
    const dati = new Float64Array(6 * n);
    for (let j = 0; j < n; j++) {
      for (let c = 0; c < 3; c++) {
        dati[6 * j + c] = (c + 1) * cubica(j * h);
        dati[6 * j + 3 + c] = (c + 1) * derivata(j * h);
      }
    }
    const out = new Float64Array(6);
    for (const x of [0, 0.3, 3.9, 7.5, 10]) {
      hermiteCubica(10 + x, 10, h, dati, n, out);
      for (let c = 0; c < 3; c++) {
        expect(out[c]).toBeCloseTo((c + 1) * cubica(x), 11);
        expect(out[3 + c]).toBeCloseTo((c + 1) * derivata(x), 11);
      }
    }
    const b = new Float64Array(8);
    basiHermite(0, b);
    expect(Array.from(b)).toEqual([1, 0, 0, 0, 0, 1, 0, 0]);
    basiHermite(1, b);
    expect(Array.from(b)).toEqual([0, 0, 1, 0, 0, 0, 0, 1]);
  });
});
