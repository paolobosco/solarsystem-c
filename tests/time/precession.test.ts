// Precessione a lungo termine contro ERFA (fixture di scripts/pipeline/common/precession_ref.py).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applicaMatrice,
  eclitticaDataAJ2000,
  epocaGiuliana,
  ltecm,
  ltp,
  ltpb,
  ltpecl,
  ltpequ,
} from '../../src/time/precession';

interface Caso {
  epj: number;
  ltpequ: number[];
  ltpecl: number[];
  ltp: number[];
  ltpb: number[];
  ltecm: number[];
  eclitticaDataAJ2000: number[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/precession/precessione.json', import.meta.url), 'utf-8'),
) as { seme: number; casi: Caso[] };

const TOLLERANZA = 1e-12;
const GRADI = 180 / Math.PI;

type Funzione = (epj: number, out: Float64Array) => void;
const FUNZIONI: [keyof Omit<Caso, 'epj'>, Funzione, number][] = [
  ['ltpequ', ltpequ, 3],
  ['ltpecl', ltpecl, 3],
  ['ltp', ltp, 9],
  ['ltpb', ltpb, 9],
  ['ltecm', ltecm, 9],
  ['eclitticaDataAJ2000', eclitticaDataAJ2000, 9],
];

function angolo(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return Math.acos(Math.min(1, d)) * GRADI;
}

describe('precessione di Vondrák, Capitaine, Wallace (2011, 2012)', () => {
  it('fixture: 200 epoche da -10000 a 2121', () => {
    expect(fixture.casi).toHaveLength(200);
    expect(fixture.casi[0]!.epj).toBe(-10000);
    expect(fixture.casi.at(-1)!.epj).toBe(2121);
  });

  for (const [nome, f, n] of FUNZIONI) {
    it(`${nome} uguale a ERFA entro 1e-12`, () => {
      const out = new Float64Array(n);
      let max = 0;
      for (const c of fixture.casi) {
        f(c.epj, out);
        const atteso = c[nome];
        for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(out[i]! - atteso[i]!));
      }
      expect(max).toBeLessThanOrEqual(TOLLERANZA);
    });
  }

  it('matrici ortonormali', () => {
    const m = new Float64Array(9);
    for (const f of [ltp, ltpb, ltecm, eclitticaDataAJ2000]) {
      for (const epj of [-10000, -3000, 2000, 2121]) {
        f(epj, m);
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += m[3 * i + k]! * m[3 * j + k]!;
            expect(Math.abs(s - (i === j ? 1 : 0))).toBeLessThan(1e-13);
          }
        }
      }
    }
  });

  it('valori di controllo del § 7.7: inclinazione dell’eclittica e obliquità', () => {
    const e = new Float64Array(3);
    const e0 = new Float64Array(3);
    const q = new Float64Array(3);
    ltpecl(2000, e0);
    ltpecl(-10000, e);
    ltpequ(-10000, q);
    expect(angolo(e, e0)).toBeCloseTo(1.635, 3);
    expect(angolo(e, q)).toBeCloseTo(24.149, 3);
    ltpecl(0, e);
    expect(angolo(e, e0)).toBeCloseTo(0.265, 3);
  });

  it('eclittica della data → eclittica J2000: il polo della data ha inclinazione corretta', () => {
    const m = new Float64Array(9);
    const z = new Float64Array([0, 0, 1]);
    eclitticaDataAJ2000(-10000, m);
    applicaMatrice(m, z, z);
    expect(Math.acos(z[2]!) * GRADI).toBeCloseTo(1.635, 3);
    // A J2000 differisce dall'identità solo per bias e per 84 381,448″ - 84 381,406″.
    eclitticaDataAJ2000(2000, m);
    for (let i = 0; i < 9; i++) expect(Math.abs(m[i]! - (i % 4 === 0 ? 1 : 0))).toBeLessThan(3e-7);
  });

  it('epoca giuliana', () => {
    expect(epocaGiuliana(2451545)).toBe(2000);
    expect(epocaGiuliana(2451545 + 36525)).toBe(2100);
  });
});
