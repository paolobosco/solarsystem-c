// Rotazione terrestre (§ 7.7, criterio A8): ERA, EO, GST contro le fixture Python (ERFA), contro eraGmst06,
// longitudine subsolare contro JPL Horizons (1900-2100), angolo orario del Sole alle 12:00 UT1.

import { describe, expect, it } from 'vitest';
import { sigmaDeltaTDaAnno } from '../../src/time/deltaT';
import {
  SIGMA_INDETERMINAZIONE_S,
  equazioneOrigini,
  eraRad,
  gstRad,
  longitudineSubsolare,
  normalizzaAngolo,
  orientamentoTerra,
  rotazioneIndeterminata,
} from '../../src/time/earthRotation';
import { epocaGiuliana, ltpb } from '../../src/time/precession';
import { GRADI, datiTempo, diffGradi, fixture } from './datiTempo';

interface FixtureRotazione {
  seme: number;
  casi: { jdUT: number; jdTT: number; era: number; eoDiretta: number; eoTabella: number; gst: number; gmst06: number }[];
  moderni: { jdUT: number; jdTT: number; gmst06: number }[];
  remoti: { jdUT: number; jdTT: number; gmst06: number; gst: number }[];
  matrici: { jdUT: number; jdTT: number; matrice: number[] }[];
}

interface FixtureSole {
  subsolare: { casi: { jdUT1: number; jdTT: number; stato: number[]; lonHorizons: number }[] };
  angoloOrario: { casi: { jdUT1: number; jdTT: number; deltaT: number; stato: number[]; E: number }[] };
}

const rot = fixture<FixtureRotazione>('rotazione.json');
const sole = fixture<FixtureSole>('sole.json');
const dati = datiTempo();
const eo = dati.eo;

/** Differenza angolare in radianti, in (-π, π]. */
function diffRad(a: number, b: number): number {
  const d = normalizzaAngolo(a - b);
  return d > Math.PI ? d - 2 * Math.PI : d;
}

describe('ERA ed EO', () => {
  it('ERA uguale a eraEra00 entro 1e-12 rad', () => {
    let max = 0;
    for (const c of rot.casi) max = Math.max(max, Math.abs(diffRad(eraRad(c.jdUT), c.era)));
    expect(max).toBeLessThan(1e-12);
  });

  it('EO: Hermite uguale alla pipeline entro 1e-12 rad e ai valori diretti entro 1e-9 rad', () => {
    let maxTab = 0;
    let maxDir = 0;
    for (const c of rot.casi) {
      const v = equazioneOrigini(eo, c.jdTT);
      maxTab = Math.max(maxTab, Math.abs(v - c.eoTabella));
      maxDir = Math.max(maxDir, Math.abs(diffRad(v, c.eoDiretta)));
    }
    expect(maxTab).toBeLessThan(1e-12);
    expect(maxDir).toBeLessThan(1e-9);
  });

  it('EO a J2000 coerente con GMST06 (-0,0145″) entro 3 mas (termine in sin Ω di eraS06 in s(J2000))', () => {
    const v = equazioneOrigini(eo, 2451545);
    expect(Math.abs((v * 648000) / Math.PI + 0.014506)).toBeLessThan(0.003);
  });
});

describe('GST = ERA - EO (A8)', () => {
  it('contro la fixture Python su 200 epoche ≤ 0,001°', () => {
    expect(rot.casi).toHaveLength(200);
    let max = 0;
    for (const c of rot.casi) max = Math.max(max, Math.abs(diffRad(gstRad(eo, c.jdUT, c.jdTT), c.gst)) * GRADI);
    expect(max).toBeLessThanOrEqual(0.001);
    expect(max).toBeLessThan(1e-7);
  });

  it('contro eraGmst06 ≤ 0,001° in 1600-2121', () => {
    let max = 0;
    for (const c of rot.moderni) max = Math.max(max, Math.abs(diffRad(gstRad(eo, c.jdUT, c.jdTT), c.gmst06)) * GRADI);
    expect(rot.moderni.length).toBeGreaterThanOrEqual(50);
    expect(max).toBeLessThanOrEqual(0.001);
  });

  it('contro eraGmst06 all\'inizio dei dati: -0,067° ± 0,005°', () => {
    const c = rot.remoti[0]!;
    expect(epocaGiuliana(c.jdTT)).toBeLessThan(-9999);
    const d = diffRad(gstRad(eo, c.jdUT, c.jdTT), c.gmst06) * GRADI;
    expect(Math.abs(d + 0.067)).toBeLessThanOrEqual(0.005);
    // -10000 (fuori dalla tabella): valore della pipeline
    const r = rot.remoti[1]!;
    expect(Math.abs(diffRad(r.gst, r.gmst06) * GRADI + 0.067)).toBeLessThanOrEqual(0.005);
  });
});

describe('orientamento della Terra', () => {
  const m = new Float64Array(9);
  const p = new Float64Array(9);

  it('matrice uguale alla pipeline (R_x(ε0)·LTPBᵀ·R3(GST)ᵀ) entro 1e-12', () => {
    let max = 0;
    for (const c of rot.matrici) {
      orientamentoTerra(eo, c.jdUT, c.jdTT, m);
      for (let i = 0; i < 9; i++) max = Math.max(max, Math.abs(m[i]! - c.matrice[i]!));
    }
    expect(max).toBeLessThan(1e-12);
  });

  it('ortonormale, destrorsa, polo lungo il polo medio della data', () => {
    for (const c of rot.matrici) {
      orientamentoTerra(eo, c.jdUT, c.jdTT, m);
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          const dot = m[a]! * m[b]! + m[3 + a]! * m[3 + b]! + m[6 + a]! * m[6 + b]!;
          expect(Math.abs(dot - (a === b ? 1 : 0))).toBeLessThan(1e-13);
        }
      }
      const det =
        m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
      expect(Math.abs(det - 1)).toBeLessThan(1e-13);
      // terza colonna = R_x(ε0)·(terza riga di LTPB)
      ltpb(epocaGiuliana(c.jdTT), p);
      expect(Math.abs(m[2]! - p[6]!)).toBeLessThan(1e-15);
    }
  });

  it('longitudine subsolare contro Horizons (1900-2100) ≤ 0,1°', () => {
    let max = 0;
    for (const c of sole.subsolare.casi) {
      orientamentoTerra(eo, c.jdUT1, c.jdTT, m);
      const lon = longitudineSubsolare(m, c.stato) * GRADI;
      max = Math.max(max, Math.abs(diffGradi(lon, c.lonHorizons)));
    }
    expect(sole.subsolare.casi).toHaveLength(200);
    expect(max).toBeLessThanOrEqual(0.1);
  });

  it('angolo orario del Sole alle 12:00 UT1 = E - 0,9856°·ΔT[d] entro 1°', () => {
    let max = 0;
    for (const c of sole.angoloOrario.casi) {
      orientamentoTerra(eo, c.jdUT1, c.jdTT, m);
      const h = -longitudineSubsolare(m, c.stato) * GRADI;
      const atteso = c.E - (0.9856 * c.deltaT) / 86400;
      max = Math.max(max, Math.abs(diffGradi(h, atteso)));
    }
    expect(sole.angoloOrario.casi).toHaveLength(200);
    expect(max).toBeLessThanOrEqual(1);
  });
});

describe('indeterminazione della longitudine (§ 7.7)', () => {
  it('soglia 15°/h·σ(ΔT) > 90°', () => {
    expect(SIGMA_INDETERMINAZIONE_S).toBe(21600);
    expect(rotazioneIndeterminata(21600)).toBe(false);
    expect(rotazioneIndeterminata(21600.1)).toBe(true);
  });

  it('con il modello di σ la soglia cade nel -4594', () => {
    const d = dati.deltaT;
    expect(rotazioneIndeterminata(sigmaDeltaTDaAnno(d, -4594))).toBe(true);
    expect(rotazioneIndeterminata(sigmaDeltaTDaAnno(d, -4593))).toBe(false);
  });
});
