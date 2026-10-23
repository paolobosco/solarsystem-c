// Costanti runtime contro la pipeline (constants.json) e contro i valori pubblicati di DE441.

import { describe, expect, it } from 'vitest';
import * as costanti from '../../src/ephem/constants';
import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../../src/time/calendar';

type Valore = number | Record<string, number>;

// constants.json della pipeline: prima la copia tra le fixture, poi quella generata da common/constants.py.
const trovati: Record<string, Record<string, unknown>> = {
  ...import.meta.glob<Record<string, unknown>>('../../scripts/pipeline/common/constants.json', { eager: true, import: 'default' }),
  ...import.meta.glob<Record<string, unknown>>('../fixtures/common/constants.json', { eager: true, import: 'default' }),
};
const fixture = trovati['../fixtures/common/constants.json'] ?? trovati['../../scripts/pipeline/common/constants.json'];

const runtime: Record<string, unknown> = { ...costanti, JD_MIN_UT, JD_MAX_UT_EXCL };
const CHIAVI_NON_NUMERICHE = new Set(['formato', 'fonti']);

function uguale(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) <= 4e-16 * Math.abs(b);
}

describe('costanti DE441', () => {
  it('GM in km³/s² come in Park et al. 2021 (tabella delle costanti di DE440/DE441)', () => {
    expect(costanti.GM_SOLE).toBeCloseTo(132712440041.279419, 3);
    expect(costanti.GM_BARICENTRI[1]).toBeCloseTo(22031.868551, 5);
    expect(costanti.GM_BARICENTRI[3]).toBeCloseTo(403503.235625, 5);
    expect(costanti.GM_BARICENTRI[5]).toBeCloseTo(126712764.1, 4);
    expect(costanti.GM_BARICENTRI[9]).toBeCloseTo(975.5, 6);
    expect(costanti.GM_TERRA).toBeCloseTo(398600.435507, 5);
    expect(costanti.GM_LUNA).toBeCloseTo(4902.800118, 5);
    expect(costanti.GM_KM3_S2[399]! + costanti.GM_KM3_S2[301]!).toBeCloseTo(costanti.GM_BARICENTRI[3]!, 6);
    expect(costanti.MU_ELIO_KM3_S2[5]).toBe(costanti.GM_SOLE + costanti.GM_BARICENTRI[5]!);
  });

  it('blocchi del § 8.1', () => {
    expect(costanti.B).toBe(714 * 512);
    expect(costanti.T0 + 12 * costanti.B).toBe(2455615.5);
    expect(costanti.T0 + (costanti.K - 1) * costanti.B).toBeLessThan(costanti.T_END);
    expect(costanti.T0 + costanti.K * costanti.B).toBeGreaterThan(costanti.T_END);
    expect(costanti.T0).toBeLessThan(JD_MIN_UT);
    expect(costanti.T_END).toBeGreaterThan(JD_MAX_UT_EXCL);
  });
});

describe('costanti uguali a quelle della pipeline', () => {
  it.skipIf(fixture === undefined)('ogni chiave di constants.json ha lo stesso valore in TypeScript', () => {
    const json = fixture ?? {};
    let confronti = 0;
    for (const [chiave, atteso] of Object.entries(json)) {
      if (CHIAVI_NON_NUMERICHE.has(chiave)) continue;
      expect(runtime, `chiave ${chiave} assente in TypeScript`).toHaveProperty(chiave);
      const valore = runtime[chiave] as Valore;
      if (typeof atteso === 'number') {
        expect(typeof valore).toBe('number');
        if (!uguale(valore as number, atteso)) expect(valore).toBe(atteso);
        confronti++;
      } else {
        const oggetto = atteso as Record<string, number>;
        const mappa = valore as Record<string, number>;
        expect(Object.keys(mappa).sort()).toEqual(Object.keys(oggetto).sort());
        for (const [k, v] of Object.entries(oggetto)) {
          const r = mappa[k];
          if (r === undefined || !uguale(r, v)) expect(r, `${chiave}[${k}]`).toBe(v);
          confronti++;
        }
      }
    }
    expect(confronti).toBeGreaterThan(10);
  });
});
