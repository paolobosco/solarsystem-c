// Elementi equinoziali, coniche e Keplero contro le fixture Python (tests/fixtures/common/equinoziali.json).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GM_SOLE, UA_KM } from '../../src/ephem/constants';
import {
  aClassici,
  conicaDaStato,
  daClassici,
  elementiDaStato,
  fattoreRetrogrado,
  periodo,
  puntoSuConica,
  statoDaElementi,
} from '../../src/ephem/equinoctial';
import type { ElementiConica } from '../../src/ephem/equinoctial';
import {
  DUE_PI,
  angoloPositivo,
  iperbolicaDaRaggio,
  riduciAngolo,
  risolviKeplerEllittico,
  risolviKeplerIperbolico,
  risolviKeplero,
  veraDaEccentrica,
  veraDaIperbolica,
} from '../../src/ephem/kepler';
import { generatore } from '../time/casuale';

interface Classici {
  a: number;
  e: number;
  i: number;
  nodo: number;
  argPeri: number;
  anomaliaMedia: number;
  giriAggiunti: number;
}

interface Caso {
  id: number;
  mu: number;
  classici: Classici;
  fattoreI: number;
  elementi: number[];
  stato: number[];
  elementiDaStato: number[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/common/equinoziali.json', import.meta.url), 'utf-8'),
) as { seme: number; casi: Caso[] };

const SEME = 20261021;

function norma(v: ArrayLike<number>, da = 0): number {
  return Math.hypot(v[da]!, v[da + 1]!, v[da + 2]!);
}

function scartoVettore(a: ArrayLike<number>, b: ArrayLike<number>, da: number): number {
  return Math.hypot(a[da]! - b[da]!, a[da + 1]! - b[da + 1]!, a[da + 2]! - b[da + 2]!) / norma(b, da);
}

function scartoAngolo(a: number, b: number): number {
  return Math.abs(riduciAngolo(a - b));
}

/** Scarto massimo tra elementi: a relativo, h, k, p, q assoluti, λ modulo 2π. */
function scartoElementi(x: ArrayLike<number>, y: ArrayLike<number>): number {
  let m = Math.abs(x[0]! - y[0]!) / y[0]!;
  for (let j = 1; j < 5; j++) m = Math.max(m, Math.abs(x[j]! - y[j]!));
  return Math.max(m, scartoAngolo(x[5]!, y[5]!));
}

/** Stato su una conica (anche iperbolica) da elementi classici e anomalia vera. */
function statoDaConica(c: Pick<ElementiConica, 'q' | 'e' | 'i' | 'nodo' | 'argPeri'>, nu: number, mu: number): Float64Array {
  const out = new Float64Array(6);
  puntoSuConica(c, nu, out);
  const p = c.q * (1 + c.e);
  const f = Math.sqrt(mu / p);
  const vx = -f * Math.sin(nu);
  const vy = f * (c.e + Math.cos(nu));
  const co = Math.cos(c.nodo);
  const so = Math.sin(c.nodo);
  const ci = Math.cos(c.i);
  const si = Math.sin(c.i);
  const cw = Math.cos(c.argPeri);
  const sw = Math.sin(c.argPeri);
  const px = [co * cw - so * sw * ci, so * cw + co * sw * ci, sw * si];
  const py = [-co * sw - so * cw * ci, -so * sw + co * cw * ci, cw * si];
  for (let j = 0; j < 3; j++) out[3 + j] = vx * px[j]! + vy * py[j]!;
  return out;
}

function conicaVuota(): ElementiConica {
  return { q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0, a: 0, anomaliaMedia: 0, motoMedio: 0, tempoDalPericentro: 0 };
}

describe('Keplero', () => {
  it('forma equinoziale: residuo dell’equazione sotto 1e-14 rad, anche con e = 0,97', () => {
    const rnd = generatore(SEME);
    for (let n = 0; n < 20000; n++) {
      const e = n < 10000 ? 0.97 * rnd() : 0.97;
      const varpi = DUE_PI * rnd();
      const h = e * Math.sin(varpi);
      const k = e * Math.cos(varpi);
      const lam = (rnd() - 0.5) * 2000 * Math.PI;
      const f = risolviKeplero(lam, h, k);
      const res = f - k * Math.sin(f) + h * Math.cos(f) - riduciAngolo(lam);
      expect(Math.abs(res)).toBeLessThan(1e-14);
    }
  });

  it('ellittica e iperbolica', () => {
    const rnd = generatore(SEME + 1);
    for (let n = 0; n < 5000; n++) {
      const e = 0.999 * rnd();
      const m = (rnd() - 0.5) * 40;
      const ea = risolviKeplerEllittico(m, e);
      expect(Math.abs(ea - e * Math.sin(ea) - m)).toBeLessThan(1e-13);
      const eh = 1 + 10 * rnd();
      const nh = (rnd() - 0.5) * 2e4;
      const hh = risolviKeplerIperbolico(nh, eh);
      expect(Math.abs(eh * Math.sinh(hh) - hh - nh)).toBeLessThan(1e-12 * Math.max(1, Math.abs(nh)));
    }
    expect(risolviKeplerIperbolico(0, 1.5)).toBe(0);
  });

  it('anomalie vere e raggio dell’iperbole', () => {
    const e = 0.6;
    const ea = 1.234;
    const nu = veraDaEccentrica(ea, e);
    expect(Math.cos(nu)).toBeCloseTo((Math.cos(ea) - e) / (1 - e * Math.cos(ea)), 14);
    const eh = 1.8;
    const a = -1.5;
    const hh = 0.9;
    const nuh = veraDaIperbolica(hh, eh);
    const r = a * (1 - eh * Math.cosh(hh));
    expect((a * (1 - eh * eh)) / (1 + eh * Math.cos(nuh))).toBeCloseTo(r, 13);
    expect(iperbolicaDaRaggio(r, a, eh)).toBeCloseTo(hh, 13);
    expect(iperbolicaDaRaggio(0.1, a, eh)).toBe(0);
  });

  it('riduzione degli angoli', () => {
    expect(riduciAngolo(Math.PI)).toBe(-Math.PI);
    expect(riduciAngolo(-Math.PI)).toBe(-Math.PI);
    expect(angoloPositivo(-1e-300)).toBeLessThan(DUE_PI);
    expect(angoloPositivo(DUE_PI)).toBe(0);
    expect(fattoreRetrogrado(Math.PI / 2)).toBe(1);
    expect(fattoreRetrogrado(Math.PI / 2 + 1e-15)).toBe(-1);
  });
});

describe('elementi equinoziali contro la pipeline', () => {
  it('fixture: 100 casi, griglia del § 7.2 inclusa', () => {
    expect(fixture.casi).toHaveLength(100);
    expect(fixture.casi.some((c) => c.fattoreI === -1)).toBe(true);
    expect(fixture.casi.some((c) => c.classici.giriAggiunti !== 0)).toBe(true);
  });

  it('elementi → stato entro 1e-12 relativo', () => {
    const out = new Float64Array(6);
    let max = 0;
    for (const c of fixture.casi) {
      statoDaElementi(c.elementi, c.mu, c.fattoreI, out);
      max = Math.max(max, scartoVettore(out, c.stato, 0), scartoVettore(out, c.stato, 3));
    }
    expect(max).toBeLessThan(1e-12);
  });

  it('stato → elementi entro 1e-10', () => {
    const out = new Float64Array(6);
    let max = 0;
    for (const c of fixture.casi) {
      expect(elementiDaStato(c.stato, c.mu, out, c.fattoreI)).toBe(c.fattoreI);
      max = Math.max(max, scartoElementi(out, c.elementiDaStato));
      expect(out[5]).toBeGreaterThanOrEqual(-Math.PI);
      expect(out[5]).toBeLessThan(Math.PI);
    }
    expect(max).toBeLessThan(1e-10);
  });

  it('classici → equinoziali uguali alla pipeline, giri aggiunti inclusi', () => {
    const out = new Float64Array(6);
    let max = 0;
    for (const c of fixture.casi) {
      const k = c.classici;
      expect(daClassici(k.a, k.e, k.i, k.nodo, k.argPeri, k.anomaliaMedia, out)).toBe(c.fattoreI);
      out[5] = out[5]! + DUE_PI * k.giriAggiunti;
      for (let j = 0; j < 6; j++) max = Math.max(max, Math.abs(out[j]! - c.elementi[j]!) / Math.max(1, Math.abs(c.elementi[j]!)));
    }
    expect(max).toBeLessThan(1e-14);
  });

  it('andata e ritorno su i ∈ {0, 90, 162, 179,9}° ed e ∈ {0; 0,5; 0,97}', () => {
    const rnd = generatore(SEME + 2);
    const st = new Float64Array(6);
    const el = new Float64Array(6);
    const el2 = new Float64Array(6);
    for (const iGradi of [0, 90, 162, 179.9]) {
      for (const e of [0, 0.5, 0.97]) {
        for (let n = 0; n < 20; n++) {
          const a = UA_KM * (0.3 + 40 * rnd());
          const fi = daClassici(a, e, (iGradi * Math.PI) / 180, DUE_PI * rnd(), DUE_PI * rnd(), DUE_PI * rnd(), el);
          statoDaElementi(el, GM_SOLE, fi, st);
          elementiDaStato(st, GM_SOLE, el2, fi);
          expect(scartoElementi(el2, el)).toBeLessThan(1e-11);
        }
      }
    }
  });

  it('equinoziali → classici', () => {
    const out = new Float64Array(6);
    let max = 0;
    for (const c of fixture.casi) {
      const k = c.classici;
      if (k.e < 1e-3 || Math.sin(k.i) < 1e-3) continue;
      aClassici(c.elementi, c.fattoreI, out);
      max = Math.max(
        max,
        Math.abs(out[0]! - k.a) / k.a,
        Math.abs(out[1]! - k.e),
        Math.abs(out[2]! - k.i),
        scartoAngolo(out[3]!, k.nodo),
        scartoAngolo(out[4]!, k.argPeri),
        scartoAngolo(out[5]!, k.anomaliaMedia),
      );
      for (const j of [3, 4, 5]) {
        expect(out[j]).toBeGreaterThanOrEqual(0);
        expect(out[j]).toBeLessThan(DUE_PI);
      }
    }
    expect(max).toBeLessThan(1e-10);
  });

  it('orbita non ellittica: esito 0 e NaN', () => {
    const out = new Float64Array(6);
    const c = { q: UA_KM, e: 1.5, i: 0.3, nodo: 1, argPeri: 2 };
    expect(elementiDaStato(statoDaConica(c, 0.4, GM_SOLE), GM_SOLE, out)).toBe(0);
    expect(Number.isNaN(out[0])).toBe(true);
  });
});

describe('conica da stato', () => {
  it('ellissi della fixture: elementi classici e ricostruzione della posizione', () => {
    const c = conicaVuota();
    const p = new Float64Array(3);
    let maxPos = 0;
    let maxEl = 0;
    for (const caso of fixture.casi) {
      expect(conicaDaStato(caso.stato, caso.mu, c)).toBe(true);
      puntoSuConica(c, c.anomaliaVera, p);
      maxPos = Math.max(maxPos, scartoVettore(p, caso.stato, 0));
      const k = caso.classici;
      expect(Math.abs(c.a - k.a) / k.a).toBeLessThan(1e-11);
      expect(Math.abs(c.q - k.a * (1 - k.e)) / k.a).toBeLessThan(1e-11);
      expect(Math.abs(c.e - k.e)).toBeLessThan(1e-11);
      expect(Math.abs(c.i - k.i)).toBeLessThan(1e-11);
      if (k.e > 1e-3 && Math.sin(k.i) > 1e-3) {
        maxEl = Math.max(
          maxEl,
          scartoAngolo(c.nodo, k.nodo),
          scartoAngolo(c.argPeri, k.argPeri),
          scartoAngolo(c.anomaliaMedia, k.anomaliaMedia),
        );
      }
      expect(c.anomaliaVera).toBeGreaterThanOrEqual(0);
      expect(c.anomaliaVera).toBeLessThan(DUE_PI);
      expect(c.tempoDalPericentro * c.motoMedio).toBeCloseTo(c.anomaliaMedia, 12);
      expect(periodo(c)).toBeCloseTo(DUE_PI / c.motoMedio, 6);
    }
    expect(maxPos).toBeLessThan(1e-12);
    expect(maxEl).toBeLessThan(1e-9);
  });

  it('orbite circolari ed equatoriali: convenzioni e ricostruzione', () => {
    const c = conicaVuota();
    const p = new Float64Array(3);
    for (const iGradi of [0, 180]) {
      const st = statoDaConica({ q: UA_KM, e: 0, i: (iGradi * Math.PI) / 180, nodo: 0, argPeri: 0 }, 1.1, GM_SOLE);
      conicaDaStato(st, GM_SOLE, c);
      expect(c.nodo).toBe(0);
      expect(c.argPeri).toBe(0);
      puntoSuConica(c, c.anomaliaVera, p);
      expect(scartoVettore(p, st, 0)).toBeLessThan(1e-14);
    }
  });

  it('iperbole e parabola', () => {
    const c = conicaVuota();
    const p = new Float64Array(3);
    const iperbole = { q: 1.2 * UA_KM, e: 1.8, i: (40 * Math.PI) / 180, nodo: (80 * Math.PI) / 180, argPeri: (120 * Math.PI) / 180 };
    for (const nu of [-2.1, -0.5, 0, 0.7, 2.1]) {
      const st = statoDaConica(iperbole, nu, GM_SOLE);
      expect(conicaDaStato(st, GM_SOLE, c)).toBe(true);
      expect(c.e).toBeCloseTo(1.8, 13);
      expect(Math.abs(c.q / iperbole.q - 1)).toBeLessThan(1e-13);
      expect(c.i).toBeCloseTo(iperbole.i, 13);
      expect(c.nodo).toBeCloseTo(iperbole.nodo, 13);
      expect(c.argPeri).toBeCloseTo(iperbole.argPeri, 12);
      expect(c.anomaliaVera).toBeCloseTo(nu, 12);
      expect(c.a).toBeLessThan(0);
      expect(Math.sign(c.tempoDalPericentro)).toBe(Math.sign(nu));
      const hh = risolviKeplerIperbolico(c.anomaliaMedia, c.e);
      expect(veraDaIperbolica(hh, c.e)).toBeCloseTo(nu, 12);
      expect(periodo(c)).toBe(Number.POSITIVE_INFINITY);
      puntoSuConica(c, c.anomaliaVera, p);
      expect(scartoVettore(p, st, 0)).toBeLessThan(1e-13);
    }
    const parabola = { q: 0.5 * UA_KM, e: 1, i: 0.4, nodo: 2, argPeri: 3 };
    const st = statoDaConica(parabola, 1.3, GM_SOLE);
    expect(conicaDaStato(st, GM_SOLE, c)).toBe(true);
    expect(c.a).toBe(Number.POSITIVE_INFINITY);
    const d = Math.tan(0.65);
    // Equazione di Barker: t - T = √(2q³/μ)·(D + D³/3), in giorni.
    const atteso = (Math.sqrt((2 * parabola.q ** 3) / GM_SOLE) * (d + d ** 3 / 3)) / 86400;
    expect(c.tempoDalPericentro / atteso).toBeCloseTo(1, 9);
  });

  it('tempo dal perielio dell’iperbole sintetica della fixture (perielio a JD 2460300,5)', () => {
    const serie = JSON.parse(readFileSync(new URL('../fixtures/common/serie-prova.json', import.meta.url), 'utf-8')) as {
      casi: { ssid: number; t: number; esito: string; stato: number[] | null }[];
    };
    const c = conicaVuota();
    let n = 0;
    for (const caso of serie.casi) {
      if (caso.ssid !== 901 || caso.stato === null) continue;
      conicaDaStato(caso.stato, GM_SOLE, c);
      expect(Math.abs(caso.t - c.tempoDalPericentro - 2460300.5)).toBeLessThan(1e-3);
      expect(c.e).toBeCloseTo(1.8, 6);
      n++;
    }
    expect(n).toBeGreaterThan(10);
  });

  it('moto radiale: esito falso', () => {
    const c = conicaVuota();
    expect(conicaDaStato([UA_KM, 0, 0, 10, 0, 0], GM_SOLE, c)).toBe(false);
    expect(Number.isNaN(c.q)).toBe(true);
  });
});
