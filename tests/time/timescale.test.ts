// Scale di tempo (§ 5.4, § 6.2, § 6.3): makeTimeState con ingresso UT e TT, limiti in TT.

import { afterEach, describe, expect, it } from 'vitest';
import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../../src/time/calendar';
import { deltaT } from '../../src/time/deltaT';
import {
  SECONDI_GIORNO,
  creaMakeTimeState,
  impostaModelloTempo,
  limitiScala,
  makeTimeState,
  modelloTempo,
  nelIntervallo,
  ttDaUT,
  utDaTT,
} from '../../src/time/timescale';
import { datiTempo, fixture } from './datiTempo';

interface FixtureDeltaT {
  inversi: { jdTT: number; jdUT: number }[];
  controlli: Record<string, number>;
}

const fx = fixture<FixtureDeltaT>('deltaT.json');
const d = datiTempo().deltaT;

afterEach(() => impostaModelloTempo(null));

describe('makeTimeState (§ 5.4)', () => {
  it('senza modello installato segnala l\'errore', () => {
    expect(() => makeTimeState(2451545, 'UT')).toThrow(Error);
    expect(() => modelloTempo()).toThrow(Error);
  });

  it('ingresso UT: TT = UT1 + ΔT', () => {
    impostaModelloTempo(d);
    const t = makeTimeState(2451545, 'UT');
    expect(t.scalaIngresso).toBe('UT');
    expect(t.jdUT).toBe(2451545);
    expect(t.deltaT).toBe(deltaT(d, 2451545));
    expect(t.jdTT).toBe(2451545 + t.deltaT / SECONDI_GIORNO);
    expect(t.deltaTSigma).toBeGreaterThan(0);
  });

  it('ingresso TT: UT1 uguale alla fixture Python', () => {
    const mts = creaMakeTimeState(d);
    let max = 0;
    for (const c of fx.inversi) {
      const t = mts(c.jdTT, 'TT');
      expect(t.jdTT).toBe(c.jdTT);
      expect(t.scalaIngresso).toBe('TT');
      max = Math.max(max, Math.abs(t.jdUT - c.jdUT));
      // coerenza interna: jdUT + ΔT(jdUT)/86 400 = jdTT entro 1e-9 d (0,1 ms)
      expect(Math.abs(t.jdUT + t.deltaT / SECONDI_GIORNO - c.jdTT)).toBeLessThan(1e-9);
    }
    expect(max).toBeLessThan(1e-9);
  });

  it('andata e ritorno UT → TT → UT', () => {
    const mts = creaMakeTimeState(d);
    for (let jd = JD_MIN_UT; jd < JD_MAX_UT_EXCL; jd += 9999.37) {
      const a = mts(jd, 'UT');
      const b = mts(a.jdTT, 'TT');
      expect(Math.abs(b.jdUT - jd)).toBeLessThan(1e-9);
      expect(Math.abs(b.deltaT - a.deltaT)).toBeLessThan(1e-4);
    }
  });

  it('JD non finito o scala non valida', () => {
    const mts = creaMakeTimeState(d);
    expect(() => mts(Number.NaN, 'UT')).toThrow(RangeError);
    expect(() => mts(Infinity, 'TT')).toThrow(RangeError);
    expect(() => mts(0, 'XX' as 'UT')).toThrow(RangeError);
  });
});

describe('limiti del § 6.2', () => {
  it('UT: [JD_MIN_UT, JD_MAX_UT_EXCL)', () => {
    expect(limitiScala(d, 'UT')).toEqual({ min: -1931076.5, maxEscl: 2495739.5 });
  });

  it('TT: TT_min ≈ -1 931 071,43 e TT_max = JD_MAX_UT_EXCL + ΔT/86 400', () => {
    const l = limitiScala(d, 'TT');
    expect(l.min).toBeCloseTo(-1931071.43, 2);
    expect(l.min).toBe(fx.controlli.ttMin);
    expect(l.maxEscl).toBe(fx.controlli.ttMaxEscl);
    expect(l.maxEscl).toBe(ttDaUT(d, JD_MAX_UT_EXCL));
    expect(utDaTT(d, l.min)).toBeCloseTo(JD_MIN_UT, 9);
  });

  it('appartenenza all\'intervallo nelle due scale', () => {
    const l = limitiScala(d, 'TT');
    expect(nelIntervallo(d, JD_MIN_UT, 'UT')).toBe(true);
    expect(nelIntervallo(d, JD_MIN_UT - 1e-6, 'UT')).toBe(false);
    expect(nelIntervallo(d, JD_MAX_UT_EXCL, 'UT')).toBe(false);
    expect(nelIntervallo(d, l.min, 'TT')).toBe(true);
    expect(nelIntervallo(d, JD_MIN_UT + 1, 'TT')).toBe(false);
    expect(nelIntervallo(d, l.maxEscl - 1e-6, 'TT')).toBe(true);
    expect(nelIntervallo(d, l.maxEscl, 'TT')).toBe(false);
  });
});
