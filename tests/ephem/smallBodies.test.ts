// Piccoli corpi: runtime TypeScript contro la valutazione Python dei file pubblicati
// (tests/fixtures/small/casi.json, generata da scripts/pipeline/small/fixture.py).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { K, T0, T_END, UA_KM } from '../../src/ephem/constants';
import { puntoSuConica } from '../../src/ephem/equinoctial';
import {
  EffemeridiPiccoliCorpi,
  MU_BARICENTRICO_KM3_S2,
  R_BARICENTRICO_KM,
  elementiOrbitaDaStato,
  percorsoBloccoPiccoliCorpi,
} from '../../src/ephem/smallBodies';
import type { ElementiOrbita } from '../../src/ephem/types';
import { ErroreFormato } from '../../src/data/binHeader';

interface Caso {
  slug: string;
  ssid: number;
  t: number;
  esito: string;
  stato: number[] | null;
}

const urlFixture = new URL('../fixtures/small/casi.json', import.meta.url);
const disponibile = existsSync(urlFixture);
const fixture = disponibile
  ? (JSON.parse(readFileSync(urlFixture, 'utf-8')) as { file: Record<string, string>; casi: Caso[] })
  : { file: {}, casi: [] as Caso[] };

function bufferBlocco(k: number): ArrayBuffer {
  const b = readFileSync(new URL(`../../public/data/v1/${percorsoBloccoPiccoliCorpi(k)}`, import.meta.url));
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

function caricaTutti(): EffemeridiPiccoliCorpi {
  const e = new EffemeridiPiccoliCorpi();
  for (let k = 0; k < K; k++) e.carica(k, bufferBlocco(k));
  return e;
}

describe.skipIf(!disponibile)('piccoli corpi: file pubblicati', () => {
  it('SHA-256 dei blocchi uguale a quello della fixture', () => {
    for (let k = 0; k < K; k++) {
      const nome = percorsoBloccoPiccoliCorpi(k).split('/')[1]!;
      const h = createHash('sha256').update(new Uint8Array(bufferBlocco(k))).digest('hex');
      expect(h).toBe(fixture.file[nome]);
    }
  });

  it('stati ed esiti uguali alla valutazione Python (scarto relativo ≤ 1e-12)', () => {
    const e = caricaTutti();
    const out = new Float64Array(6);
    let maxRel = 0;
    let maxVel = 0;
    for (const c of fixture.casi) {
      out.fill(Number.NaN);
      const esito = e.stateAt(c.ssid, c.t, out);
      expect(esito, `${c.slug} a ${c.t}`).toBe(c.esito);
      if (c.stato === null) continue;
      const r = Math.hypot(c.stato[0]!, c.stato[1]!, c.stato[2]!);
      const v = Math.hypot(c.stato[3]!, c.stato[4]!, c.stato[5]!);
      const dr = Math.hypot(out[0]! - c.stato[0]!, out[1]! - c.stato[1]!, out[2]! - c.stato[2]!);
      const dv = Math.hypot(out[3]! - c.stato[3]!, out[4]! - c.stato[4]!, out[5]! - c.stato[5]!);
      maxRel = Math.max(maxRel, dr / r);
      maxVel = Math.max(maxVel, dv / v);
    }
    expect(maxRel).toBeLessThanOrEqual(1e-12);
    expect(maxVel).toBeLessThanOrEqual(1e-12);
  });

  it('blocco non caricato: caricamento; fuori da [T0, T_END): fuori-copertura', () => {
    const e = new EffemeridiPiccoliCorpi();
    const out = new Float64Array(6);
    expect(e.stateAt(9, 2_451_545, out)).toBe('caricamento');
    e.carica(12, bufferBlocco(12));
    expect(e.stateAt(9, 2_461_000.5, out)).toBe('ok');
    expect(e.stateAt(9, T_END, out)).toBe('fuori-copertura');
    expect(e.stateAt(9, T0 - 1, out)).toBe('fuori-copertura');
    expect(e.stateAt(9, T0, out)).toBe('caricamento');
    e.rilascia(12);
    expect(e.stateAt(9, 2_461_000.5, out)).toBe('caricamento');
  });

  it('rifiuta un file di un altro blocco', () => {
    const e = new EffemeridiPiccoliCorpi();
    expect(() => e.carica(3, bufferBlocco(4))).toThrow(RangeError);
    expect(() => e.carica(3, new ArrayBuffer(64))).toThrow(ErroreFormato);
  });

  it('orbitAt: conica ancorata al corpo, elementi baricentrici oltre 50 UA', () => {
    const e = caricaTutti();
    const stato = new Float64Array(6);
    const punto = new Float64Array(3);
    // Sole baricentrico fittizio di ampiezza tipica (circa 1e6 km, 0,01 km/s)
    const sole = [7.4e5, -2.9e5, -1.6e4, 0.006, 0.011, -0.0002];
    const orb: ElementiOrbita = {
      primario: -1,
      baricentrici: false,
      q: 0,
      e: 0,
      i: 0,
      nodo: 0,
      argPeri: 0,
      anomaliaVera: 0,
      forma: 'non-determinata',
    };
    let n = 0;
    for (const c of fixture.casi) {
      if (c.stato === null) continue;
      expect(e.orbitAt(c.ssid, c.t, sole, orb)).toBe('ok');
      e.stateAt(c.ssid, c.t, stato);
      const r = Math.hypot(stato[0]!, stato[1]!, stato[2]!);
      expect(orb.primario).toBe(0);
      expect(orb.forma).toBe('determinata');
      puntoSuConica(orb, orb.anomaliaVera, punto);
      const rif = orb.baricentrici ? [stato[0]! + sole[0]!, stato[1]! + sole[1]!, stato[2]! + sole[2]!] : stato;
      const d = Math.hypot(punto[0]! - rif[0]!, punto[1]! - rif[1]!, punto[2]! - rif[2]!);
      expect(d / r).toBeLessThan(1e-9);
      expect(orb.baricentrici).toBe(r > R_BARICENTRICO_KM);
      n++;
    }
    expect(n).toBeGreaterThan(100);
    // senza stato del Sole gli elementi restano eliocentrici
    const lontano = fixture.casi.find((c) => c.stato !== null && Math.hypot(c.stato[0]!, c.stato[1]!, c.stato[2]!) > 60 * UA_KM)!;
    expect(e.orbitAt(lontano.ssid, lontano.t, null, orb, 'indicativa')).toBe('ok');
    expect(orb.baricentrici).toBe(false);
    expect(orb.forma).toBe('indicativa');
  });

  it('elementiOrbitaDaStato: soglie del § 7.6.5', () => {
    const out: ElementiOrbita = {
      primario: -1,
      baricentrici: false,
      q: 0,
      e: 0,
      i: 0,
      nodo: 0,
      argPeri: 0,
      anomaliaVera: 0,
      forma: 'determinata',
    };
    const sole = [1e6, 0, 0, 0, 0.01, 0];
    // orbita circolare a 1 UA: eliocentrica
    const v1 = Math.sqrt(1.32712440041279419e11 / UA_KM);
    elementiOrbitaDaStato([UA_KM, 0, 0, 0, v1, 0], sole, out);
    expect(out.baricentrici).toBe(false);
    expect(out.q).toBeCloseTo(UA_KM, -2);
    // quasi parabolica vicino al Sole: eliocentrica, e dallo stato eliocentrico
    elementiOrbitaDaStato([UA_KM, 0, 0, 0, v1 * Math.sqrt(1.995), 0], sole, out);
    expect(out.baricentrici).toBe(false);
    expect(out.e).toBeCloseTo(0.995, 9);
    // oltre 50 UA: baricentrica, a qualsiasi eccentricità
    const r60 = 60 * UA_KM;
    elementiOrbitaDaStato([r60, 0, 0, 0, Math.sqrt(1.32712440041279419e11 / r60), 0], sole, out);
    expect(out.baricentrici).toBe(true);
    expect(R_BARICENTRICO_KM).toBe(50 * UA_KM);
    expect(MU_BARICENTRICO_KM3_S2).toBeGreaterThan(1.3271244e11);
  });
});
