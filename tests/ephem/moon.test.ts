// Luna dal file public/data/v1/moon.bin: serie di Meeus (esempio 47.a), criterio A5 contro DE441
// (fixture tests/fixtures/moon/, generate da scripts/pipeline/moon.py), Terra contro DE441 (399),
// orientamento di Cassini, novilunio dell'08/04/2024 (A9).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bloccoDi } from '../../src/data/binHeader';
import { ErroreFormato } from '../../src/data/binHeader';
import { COLONNE_LUNA, correzioniLuna, leggiLuna } from '../../src/data/moonReader';
import { EMRAT, K, T0, T_END } from '../../src/ephem/constants';
import {
  EffemeridiLuna,
  INCLINAZIONE_EQUATORE_LUNA,
  TERMINI_B,
  TERMINI_LR,
  serieLuna,
  statoTerra,
} from '../../src/ephem/moon';
import { EffemeridiPianeti, SSID_FILE_PIANETI, percorsoBloccoPianeti } from '../../src/ephem/planets';
import { eclitticaDataAJ2000, epocaGiuliana } from '../../src/time/precession';

const RAD_ARCSEC = 648000 / Math.PI;
const GRADI = Math.PI / 180;
const DATI = new URL('../../public/data/v1/', import.meta.url);
const FIXTURE = new URL('../fixtures/moon/', import.meta.url);

interface MetaLuna {
  sha256: string;
  sha256MoonBin: string;
  righe: number;
  colonne: string[];
  epocheUniformi: number;
  nodi: number;
  soglie: { arcsec: number; km: number };
  orientamento: { t: number; matrice: number[]; correzioni: number[]; derivate: number[] }[];
  esempio47a: { jd: number; lambdaGradiAtteso: number; betaGradiAtteso: number; distanzaKmAttesa: number; calcolato: number[] };
}

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

const meta = JSON.parse(readFileSync(new URL('luna.json', FIXTURE), 'utf-8')) as MetaLuna;
const tabella = new Float64Array(buffer(new URL('luna-de441.bin', FIXTURE)));
const NCOL = meta.colonne.length;
const binLuna = buffer(new URL('moon.bin', DATI));
const datiLuna = leggiLuna(binLuna);
const luna = new EffemeridiLuna(datiLuna);

function angolo(a: ArrayLike<number>, b: ArrayLike<number>, oa = 0, ob = 0): number {
  const ax = a[oa]!;
  const ay = a[oa + 1]!;
  const az = a[oa + 2]!;
  const bx = b[ob]!;
  const by = b[ob + 1]!;
  const bz = b[ob + 2]!;
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
}

describe('serie di Meeus (cap. 47)', () => {
  it('60 + 60 termini; esempio 47.a (1992-04-12 0h TD)', () => {
    expect(TERMINI_LR).toBe(60);
    expect(TERMINI_B).toBe(60);
    const out = new Float64Array(6);
    serieLuna(meta.esempio47a.jd, [0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0], out);
    const lam = ((out[0]! / GRADI) % 360 + 360) % 360;
    expect(Math.abs(lam - meta.esempio47a.lambdaGradiAtteso)).toBeLessThan(1e-6);
    expect(Math.abs(out[1]! / GRADI - meta.esempio47a.betaGradiAtteso)).toBeLessThan(1e-6);
    expect(Math.abs(out[2]! - meta.esempio47a.distanzaKmAttesa)).toBeLessThan(0.05);
    for (let i = 0; i < 6; i++) {
      const atteso = meta.esempio47a.calcolato[i]!;
      expect(Math.abs(out[i]! - atteso)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(atteso)));
    }
  });
});

describe('moon.bin (§ 8.4)', () => {
  it('intestazione, nodi, copertura; SHA-256 uguale alla fixture', () => {
    expect(createHash('sha256').update(new Uint8Array(binLuna)).digest('hex')).toBe(meta.sha256MoonBin);
    expect(datiLuna.inizio).toBe(T0);
    expect(datiLuna.fine).toBe(T_END);
    expect(datiLuna.t0).toBe(T0);
    expect(datiLuna.passo).toBe(3652.5);
    expect(datiLuna.nodi).toBe(1214);
    expect(datiLuna.dati.length).toBe(1214 * COLONNE_LUNA * 2);
  });

  it('file non conformi rifiutati', () => {
    const alterato = (f: (v: DataView) => void, n = binLuna.byteLength): ArrayBuffer => {
      const out = new ArrayBuffer(n);
      new Uint8Array(out).set(new Uint8Array(binLuna).subarray(0, Math.min(n, binLuna.byteLength)));
      f(new DataView(out));
      return out;
    };
    const casi = [
      alterato((v) => v.setUint32(84, 5, true)), // colonne
      alterato((v) => v.setUint32(80, 1213, true)), // nodi diversi dalle voci
      alterato((v) => v.setFloat64(72, 3000, true)), // nodi che non coprono il nucleo
      alterato((v) => v.setFloat64(88, Number.NaN, true)), // dato non finito
      alterato((v) => v.setUint32(40, 72, true)), // offset delle voci
      alterato(() => undefined, binLuna.byteLength - 8), // troncato
    ];
    for (const b of casi) expect(() => leggiLuna(b)).toThrow(ErroreFormato);
  });

  it('esiti: caricamento e fuori copertura', () => {
    const out = new Float64Array(6).fill(3);
    expect(new EffemeridiLuna().statoGeocentrico(2451545, out)).toBe('caricamento');
    expect(luna.statoGeocentrico(T0 - 1e-6, out)).toBe('fuori-copertura');
    expect(luna.statoGeocentrico(T_END, out)).toBe('fuori-copertura');
    expect(out.every((x) => x === 3)).toBe(true);
    expect(luna.statoGeocentrico(T0, out)).toBe('ok');
  });
});

describe('A5: Luna contro DE441 su 2000 epoche e sui nodi', () => {
  const out = new Float64Array(6);
  let maxAng = 0;
  let maxKm = 0;
  let maxPipeline = 0;
  let maxPipelineV = 0;
  let maxV = 0;
  for (let r = 0; r < meta.righe; r++) {
    const o = r * NCOL;
    const t = tabella[o]!;
    expect(luna.statoGeocentrico(t, out)).toBe('ok');
    maxAng = Math.max(maxAng, angolo(out, tabella, 0, o + 1) * RAD_ARCSEC);
    const dRif = Math.hypot(tabella[o + 1]!, tabella[o + 2]!, tabella[o + 3]!);
    maxKm = Math.max(maxKm, Math.abs(Math.hypot(out[0]!, out[1]!, out[2]!) - dRif));
    for (let i = 0; i < 3; i++) {
      maxPipeline = Math.max(maxPipeline, Math.abs(out[i]! - tabella[o + 7 + i]!));
      maxPipelineV = Math.max(maxPipelineV, Math.abs(out[3 + i]! - tabella[o + 10 + i]!));
    }
    maxV = Math.max(maxV, Math.hypot(out[3]! - tabella[o + 4]!, out[4]! - tabella[o + 5]!, out[5]! - tabella[o + 6]!));
  }

  it('righe: epoche uniformi e nodi', () => {
    expect(meta.righe).toBe(meta.epocheUniformi + meta.nodi);
    expect(meta.nodi).toBe(1213);
    expect(createHash('sha256').update(new Uint8Array(tabella.buffer)).digest('hex')).toBe(meta.sha256);
  });

  it('runtime uguale al modello Python (posizione ≤ 1e-6 km, velocità ≤ 1e-9 km/s)', () => {
    expect(maxPipeline).toBeLessThanOrEqual(1e-6);
    expect(maxPipelineV).toBeLessThanOrEqual(1e-9);
  });

  it('errore angolare geocentrico ≤ 60″ e distanza ≤ 50 km', () => {
    expect(maxAng).toBeLessThanOrEqual(meta.soglie.arcsec);
    expect(maxKm).toBeLessThanOrEqual(meta.soglie.km);
  });

  it('velocità geocentrica entro 2 m/s da DE441', () => {
    expect(maxV).toBeLessThan(2e-3);
  });
});

function caricaPianeti(): EffemeridiPianeti {
  const p = new EffemeridiPianeti();
  for (let k = 0; k < K; k++) p.carica(buffer(new URL(percorsoBloccoPianeti(k), DATI)));
  return p;
}

const pianeti = caricaPianeti();

describe('Terra = EMB - Luna/(1 + EMRAT) contro DE441 (399)', () => {
  it('|Δr|/r ≤ 2″; |Δr| entro la soglia dell’EMB più 1 km', () => {
    const emb = new Float64Array(6);
    const geo = new Float64Array(6);
    const terra = new Float64Array(6);
    let maxAng = 0;
    let maxKmModerni = 0;
    let maxKm = 0;
    for (let r = 0; r < meta.righe; r++) {
      const o = r * NCOL;
      const t = tabella[o]!;
      expect(pianeti.stato(SSID_FILE_PIANETI.baricentroTerraLuna, t, emb)).toBe('ok');
      expect(luna.statoGeocentrico(t, geo)).toBe('ok');
      statoTerra(emb, geo, terra);
      const dx = terra[0]! - tabella[o + 13]!;
      const dy = terra[1]! - tabella[o + 14]!;
      const dz = terra[2]! - tabella[o + 15]!;
      const km = Math.hypot(dx, dy, dz);
      maxAng = Math.max(maxAng, (km / Math.hypot(tabella[o + 13]!, tabella[o + 14]!, tabella[o + 15]!)) * RAD_ARCSEC);
      if (bloccoDi(t) >= 11) maxKmModerni = Math.max(maxKmModerni, km);
      else maxKm = Math.max(maxKm, km);
    }
    expect(maxAng).toBeLessThanOrEqual(2);
    expect(maxKmModerni).toBeLessThanOrEqual(101);
    expect(maxKm).toBeLessThanOrEqual(251);
    // EMRAT di DE441
    expect(EMRAT).toBe(81.300568221497215);
  });
});

describe('orientamento della Luna (leggi di Cassini, § 7.4)', () => {
  it('uguale al modello Python; ortonormale; polo inclinato di I sull’eclittica della data', () => {
    const r = new Float64Array(9);
    const c = new Float64Array(6);
    const dc = new Float64Array(6);
    const m = new Float64Array(9);
    const geo = new Float64Array(6);
    for (const caso of meta.orientamento) {
      correzioniLuna(datiLuna, caso.t, c, dc);
      for (let i = 0; i < 6; i++) {
        expect(Math.abs(c[i]! - caso.correzioni[i]!)).toBeLessThanOrEqual(1e-15 * Math.max(1, Math.abs(caso.correzioni[i]!)));
        expect(Math.abs(dc[i]! - caso.derivate[i]!)).toBeLessThanOrEqual(1e-18 + 1e-12 * Math.abs(caso.derivate[i]!));
      }
      expect(luna.orientamento(caso.t, r)).toBe('ok');
      for (let i = 0; i < 9; i++) expect(Math.abs(r[i]! - caso.matrice[i]!)).toBeLessThanOrEqual(1e-12);
      // colonne ortonormali
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          // tolleranza 1e-13: il bias ICRS in ltecm è applicato al primo ordine (non esattamente ortogonale)
          const p = r[a]! * r[b]! + r[3 + a]! * r[3 + b]! + r[6 + a]! * r[6 + b]!;
          expect(Math.abs(p - (a === b ? 1 : 0))).toBeLessThan(1e-13);
        }
      }
      eclitticaDataAJ2000(epocaGiuliana(caso.t), m);
      const cosI = r[2]! * m[2]! + r[5]! * m[5]! + r[8]! * m[8]!;
      expect(Math.abs(Math.acos(cosI) - INCLINAZIONE_EQUATORE_LUNA)).toBeLessThan(1e-9);
      // asse x verso la Terra entro la librazione ottica: fino a circa 7,9° in longitudine e 6,7° in latitudine
      // (Meeus 1998, cap. 53), in combinazione meno di 11°
      luna.statoGeocentrico(caso.t, geo);
      const cosX = -(r[0]! * geo[0]! + r[3]! * geo[1]! + r[6]! * geo[2]!) / Math.hypot(geo[0]!, geo[1]!, geo[2]!);
      expect(Math.acos(cosX) / GRADI).toBeLessThan(11);
    }
  });
});

describe('A9: novilunio dell’08/04/2024', () => {
  it('congiunzione in longitudine eclittica della data alle 18:21 UT ± 3 min', () => {
    // ΔT = 32,184 s + (TAI - UTC = 37 s) - (UT1 - UTC = -0,0166 s, IERS EOP 20 C04, 08/04/2024 18 UT).
    const DELTA_T = 69.2;
    const m = new Float64Array(9);
    const emb = new Float64Array(6);
    const geo = new Float64Array(6);
    const terra = new Float64Array(6);
    /** Longitudine della Luna meno quella del Sole, eclittica della data, in (-π, π]. */
    const differenza = (jdUT: number): number => {
      const jdTT = jdUT + DELTA_T / 86400;
      expect(pianeti.stato(SSID_FILE_PIANETI.baricentroTerraLuna, jdTT, emb)).toBe('ok');
      expect(luna.statoGeocentrico(jdTT, geo)).toBe('ok');
      statoTerra(emb, geo, terra);
      eclitticaDataAJ2000(epocaGiuliana(jdTT), m);
      // vettore nella data: Mᵀ·v
      const lon = (x: number, y: number, z: number): number =>
        Math.atan2(m[1]! * x + m[4]! * y + m[7]! * z, m[0]! * x + m[3]! * y + m[6]! * z);
      const d = lon(geo[0]!, geo[1]!, geo[2]!) - lon(-terra[0]!, -terra[1]!, -terra[2]!);
      return Math.atan2(Math.sin(d), Math.cos(d));
    };
    let a = 2460408.5 + 17 / 24; // 2024-04-08 17:00 UT
    let b = 2460408.5 + 20 / 24;
    expect(differenza(a)).toBeLessThan(0);
    expect(differenza(b)).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) {
      const c = 0.5 * (a + b);
      if (differenza(c) < 0) a = c;
      else b = c;
    }
    const minutiUT = (0.5 * (a + b) - 2460408.5) * 1440;
    expect(Math.abs(minutiUT - (18 * 60 + 21))).toBeLessThanOrEqual(3);
  });
});
