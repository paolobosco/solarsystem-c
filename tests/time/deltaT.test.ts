// ΔT e σ(ΔT) (§ 6.4, § 6.5, criterio A3) contro le fixture di scripts/pipeline/time_model.py, e lettore di time.json.

import { describe, expect, it } from 'vitest';
import { ErroreFormato } from '../../src/data/binHeader';
import { leggiTime, leggiTimeDaBuffer } from '../../src/data/timeReader';
import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../../src/time/calendar';
import {
  OMEGA_LUNA_MEDIA_RAD_S,
  annoGiuliano,
  deltaT,
  deltaTDaAnno,
  deltaTS15,
  infoRigaDeltaT,
  sigmaDeltaT,
  sigmaDeltaTDaAnno,
  sigmaS15DaAnno,
} from '../../src/time/deltaT';
import type { TimeState } from '../../src/time/types';
import { datiTempo, fixture, jsonTime } from './datiTempo';

interface FixtureDeltaT {
  seme: number;
  casi: { jdUT: number; deltaT: number; sigma: number }[];
  controlli: Record<string, number>;
}

const fx = fixture<FixtureDeltaT>('deltaT.json');
const d = datiTempo().deltaT;
const EPS = 1e-9;

describe('ΔT del § 6.4', () => {
  it('uguale alla fixture Python entro 1e-6 s', () => {
    expect(fx.casi.length).toBeGreaterThan(500);
    let max = 0;
    for (const c of fx.casi) max = Math.max(max, Math.abs(deltaT(d, c.jdUT) - c.deltaT));
    expect(max).toBeLessThanOrEqual(1e-6);
  });

  it('valori di controllo', () => {
    expect(Math.abs(deltaTDaAnno(d, -720) - 20371.85)).toBeLessThanOrEqual(0.01);
    expect(deltaTS15(d, -720)).toBe(20371.848);
    expect(deltaT(d, JD_MIN_UT)).toBeCloseTo(438384.2, 1);
    expect(d.pre720Delta).toBeCloseTo(-0.49, 2);
    // ΔT(2120) ≈ 97,5 s con y_obs ≈ 2026,7 e ΔT_obs ≈ 69,2 s
    expect(deltaTDaAnno(d, 2120)).toBeCloseTo(97.5, 0);
    expect(d.deltaTObs).toBeCloseTo(69.2, 1);
    expect(d.yObs).toBeGreaterThan(2026.5);
  });

  it('continuità a -720 (< 0,01 s), al 2019, al 2020 e a y_obs', () => {
    const salto = (y: number) => Math.abs(deltaTDaAnno(d, y + EPS) - deltaTDaAnno(d, y - EPS));
    expect(salto(-720)).toBeLessThan(0.01);
    expect(salto(2019)).toBeLessThan(1e-6);
    expect(salto(2020)).toBeLessThan(1e-6);
    expect(salto(d.yObs)).toBeLessThan(1e-6);
    // pendenze ai due lati di -720: -16,0 e -16,1 s/anno
    expect(deltaTDaAnno(d, -720.0001) - deltaTDaAnno(d, -721)).toBeCloseTo(-15.96, 1);
    expect(deltaTDaAnno(d, -719) - deltaTDaAnno(d, -720)).toBeCloseTo(-16.13, 1);
  });

  it('valori IERS nell\'intervallo 2020-y_obs', () => {
    for (let i = 0; i < d.iersAnni.length; i++) {
      const y = d.iersAnni[i]!;
      if (y >= 2020) expect(deltaTDaAnno(d, y)).toBe(d.iersValori[i]);
    }
  });

  it('argomento: epoca giuliana', () => {
    expect(annoGiuliano(2451545)).toBe(2000);
    expect(annoGiuliano(2451545 - 365.25 * 2720)).toBe(-720);
  });
});

describe('σ(ΔT) del § 6.5', () => {
  it('uguale alla fixture Python entro 1e-6 s', () => {
    let max = 0;
    for (const c of fx.casi) max = Math.max(max, Math.abs(sigmaDeltaT(d, c.jdUT) - c.sigma));
    expect(max).toBeLessThanOrEqual(1e-6);
  });

  it('valori di controllo', () => {
    const entro = (v: number, atteso: number, rel: number) => expect(Math.abs(v / atteso - 1)).toBeLessThanOrEqual(rel);
    entro(sigmaDeltaTDaAnno(d, -9999), 103005, 0.01);
    entro(sigmaDeltaTDaAnno(d, -5000), 25653, 0.01);
    entro(sigmaDeltaTDaAnno(d, -3000), 8978, 0.01);
    entro(sigmaDeltaTDaAnno(d, -1000), 638, 0.01);
    entro(sigmaDeltaTDaAnno(d, 2120), 47, 0.02);
    entro(sigmaDeltaT(d, JD_MIN_UT), 103005, 0.01);
  });

  it('positiva nell\'intervallo e continua ai cambi di formula', () => {
    for (let jd = JD_MIN_UT; jd < JD_MAX_UT_EXCL; jd += 3652.5) expect(sigmaDeltaT(d, jd)).toBeGreaterThan(0);
    const cambi = [d.sigmaAnnoPassato, ...d.sigmaStoricoAnni, d.sigmaS15RaccordoInizio, d.sigmaS15RaccordoFine];
    for (const y of [...cambi, d.raccordoInizio, d.raccordoFine, d.yObs]) {
      expect(Math.abs(sigmaDeltaTDaAnno(d, y + EPS) - sigmaDeltaTDaAnno(d, y - EPS)), `anno ${y}`).toBeLessThan(1e-6);
    }
  });

  it('0,8·u² solo fino al 1200; era telescopica (Stephenson e Houlden 1986)', () => {
    expect(sigmaDeltaTDaAnno(d, 1200)).toBeCloseTo(31.25, 9);
    expect(sigmaDeltaTDaAnno(d, 1250)).toBeCloseTo(25, 9);
    for (const y of [1300, 1450, 1600]) expect(sigmaDeltaTDaAnno(d, y)).toBeCloseTo(20, 9);
    expect(sigmaDeltaTDaAnno(d, 1700)).toBeCloseTo(5, 9);
    expect(sigmaDeltaTDaAnno(d, 1800)).toBeCloseTo(1, 9);
    // il minimo della parabola (1825) non dà più σ nulla
    expect(sigmaDeltaTDaAnno(d, 1825)).toBeCloseTo(0.562, 3);
  });

  it('periodo misurato: scarto del modello da EOP 20 C04, non 0,8·u²', () => {
    // S15.2020 contro C04 giornaliera 1962-1971: 0,45 s (massimo 0,68 s); 1972-2018: 0,114 s (massimo 0,27 s)
    expect(d.sigmaS15Iniziale).toBeCloseTo(0.4545, 4);
    expect(d.sigmaS15).toBeCloseTo(0.114, 3);
    for (const y of [1900, 1950, 1962, 1970.9]) expect(sigmaDeltaTDaAnno(d, y)).toBe(d.sigmaS15Iniziale);
    expect(sigmaS15DaAnno(d, 1971.5)).toBeCloseTo((d.sigmaS15Iniziale + d.sigmaS15) / 2, 12);
    for (const y of [1972, 1975, 2000, 2018.9]) expect(sigmaDeltaTDaAnno(d, y)).toBe(d.sigmaS15);
    // valori IERS mensili interpolati contro C04 giornaliera 2020-y_obs: 1,7 ms
    expect(d.sigmaIers).toBeCloseTo(0.0017, 4);
    for (let y = 2020; y <= d.yObs; y += 0.25) expect(sigmaDeltaTDaAnno(d, y)).toBe(d.sigmaIers);
    // 1° gennaio 2000: 0,11 s, non 2,45 s
    expect(sigmaDeltaT(d, 2_451_544.5)).toBeLessThan(0.12);
  });

  it('dopo y_obs: deriva dall\'eccesso di LOD dell\'ultimo anno di C04, non solo Huber', () => {
    // LOD - 86 400 s, radice della media dei quadrati 2025-09-19/2026-09-18: 0,54 ms
    expect(d.lodRms).toBeCloseTo(0.000539, 6);
    // 19/10/2026 0h UT, 31 d dopo y_obs: 0,0167 s (Huber da solo 0,0012 s)
    const n = annoGiuliano(2_461_332.5) - d.yObs;
    expect(sigmaDeltaT(d, 2_461_332.5)).toBe(365.25 * n * d.lodRms);
    expect(sigmaDeltaT(d, 2_461_332.5)).toBeCloseTo(0.0167, 4);
    // nel lungo periodo prevale Huber: σ(2120) invariata
    expect(sigmaDeltaTDaAnno(d, 2050)).toBeGreaterThan(365.25 * (2050 - d.yObs) * d.lodRms);
  });
});

describe('σ(ΔT) contro i valori IERS (ΔT = 32,184 s + (TAI - UTC) - (UT1 - UTC))', () => {
  // [MJD, TAI - UTC (s), UT1 - UTC (s)]. TAI - UTC: USNO tai-utc.dat (prima del 1972) e IERS Leap_Second.dat;
  // UT1 - UTC: IERS EOP 20 C04 fino al 2026-09-18, poi IERS finals.daily.iau2000.txt (flag I, consultato il 19/10/2026).
  const valori: [number, number, number][] = [
    [37846, 1.8458580 + (37846 - 37665) * 0.0011232, -0.0091475], // 1962-07-01
    [38556, 3.3401300 + (38556 - 38761) * 0.001296, -0.1204971], // 1964-06-10
    [38761, 3.5401300, -0.0182914], // 1965-01-01
    [39856, 4.2131700 + (39856 - 39126) * 0.002592, 0.0941515], // 1968-01-01
    [61310, 37, -0.0178468], // 2026-09-27
    [61331, 37, -0.0384323], // 2026-10-18
    [61332, 37, -0.0392174], // 2026-10-19
  ];

  it('scarto del modello entro 2σ nel 1962-1971 e dopo l\'ultimo valore C04', () => {
    for (const [mjd, taiUtc, dut1] of valori) {
      const jd = mjd + 2_400_000.5 + dut1 / 86_400;
      const iers = 32.184 + taiUtc - dut1;
      expect(Math.abs(deltaT(d, jd) - iers), `MJD ${mjd}`).toBeLessThanOrEqual(2 * sigmaDeltaT(d, jd));
    }
  });
});

describe('riga ΔT (§ 11.4.3)', () => {
  const ts = (sigma: number, scala: 'UT' | 'TT'): TimeState => ({ jdUT: 0, jdTT: 0, deltaT: 1, deltaTSigma: sigma, scalaIngresso: scala });

  it('moto medio della Luna circa 0,55°/h', () => {
    expect(((OMEGA_LUNA_MEDIA_RAD_S * 3600 * 180) / Math.PI)).toBeCloseTo(0.549, 3);
  });

  it('avviso quando ε_ΔT della Luna supera 1′; nessun effetto in TT', () => {
    expect(infoRigaDeltaT(ts(100, 'UT')).avvisoLuna).toBe(false);
    const r = infoRigaDeltaT(ts(3600, 'UT'));
    expect(r.avvisoLuna).toBe(true);
    expect(r.sigmaOre).toBe(1);
    expect((r.epsLuna * 180) / Math.PI).toBeCloseTo(0.549, 3);
    expect(infoRigaDeltaT(ts(3600, 'TT')).epsLuna).toBe(0);
  });
});

describe('lettore di time.json', () => {
  it('fonti e struttura', () => {
    const t = datiTempo();
    expect(t.fonti.s15).toBe('Table-S15.2020');
    expect(t.fonti.iers).toBe('EOP 20 C04');
    expect(t.fonti.s15Sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(t.deltaT.s15Nodi[0]).toBe(-720);
    expect(t.deltaT.s15Coeff.length).toBe(2 * t.deltaT.s15Nodi.length);
    expect(t.eo.valori.length).toBe(1214);
  });

  interface JsonTime {
    formato: unknown;
    deltaT?: {
      s15: { nodi: number[][]; coeff: number[][] };
      iers: { anni: number[] };
      yObs: number;
      cFuturo: unknown;
      raccordo: number[];
    };
    sigma: {
      Q: number;
      s15: unknown;
      s15Iniziale: unknown;
      lodRms?: unknown;
      raccordoS15: number[];
      storico?: { anni: number[]; valori: number[] };
    };
    eo: { t0: number; valori: number[]; derivate: unknown[] };
  }
  const alterato = (f: (j: JsonTime) => void): unknown => {
    const j = jsonTime() as unknown as JsonTime;
    f(j);
    return j;
  };

  it('rifiuta file non conformi', () => {
    expect(() => leggiTimeDaBuffer(new TextEncoder().encode('{').buffer)).toThrow(ErroreFormato);
    const casi: ((j: JsonTime) => void)[] = [
      (j) => (j.formato = 2),
      (j) => delete j.deltaT,
      (j) => (j.deltaT!.s15.nodi[1]![0] = -99),
      (j) => (j.deltaT!.s15.coeff[0] = [1, 2, 3]),
      (j) => (j.deltaT!.iers.anni[3] = j.deltaT!.iers.anni[2]!),
      (j) => (j.deltaT!.yObs = 2030),
      (j) => (j.deltaT!.raccordo = [2020, 2019]),
      (j) => (j.deltaT!.raccordo = [-800, 2020]),
      (j) => (j.deltaT!.cFuturo = 'x'),
      (j) => (j.sigma.Q = -1),
      (j) => (j.sigma.s15 = 0),
      (j) => (j.sigma.s15Iniziale = -1),
      (j) => delete j.sigma.lodRms,
      (j) => (j.sigma.raccordoS15 = [1972, 1971]),
      (j) => (j.sigma.raccordoS15 = [2019, 2021]),
      (j) => delete j.sigma.storico,
      (j) => (j.sigma.storico!.valori[2] = 0),
      (j) => (j.sigma.storico!.anni[1] = 1100),
      (j) => j.eo.valori.pop(),
      (j) => (j.eo.t0 = 0),
      (j) => (j.eo.derivate[5] = null),
    ];
    for (const c of casi) expect(() => leggiTime(alterato(c))).toThrow(ErroreFormato);
  });
});
