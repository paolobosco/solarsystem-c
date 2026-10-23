// § 10.2: campionamento delle orbite ancorate (ellisse, iperbole, parabola), raffinamento
// geometrico, archi iperbolici limitati, vertici sulla conica.

import { describe, expect, it } from 'vitest';
import type { ElementiOrbita } from '../../src/ephem/types';
import { UA_KM } from '../../src/ephem/constants';
import { CAPACITA_ORBITA, campionaOrbita, creaOrbitaCampionata, distanzaPolilinea, numeroRaffinamenti } from '../../src/render/orbits';
import { PUNTI_ORBITA } from '../../src/render/costanti';

function el(q: number, e: number, i: number, nodo: number, w: number, nu: number): ElementiOrbita {
  return { primario: 0, baricentrici: false, q, e, i, nodo, argPeri: w, anomaliaVera: nu, forma: 'determinata' };
}

/** Distanza dal fuoco e anomalia vera del punto ancora + v: verifica r = p/(1 + e cos ν). */
function scartoConica(o: ReturnType<typeof creaOrbitaCampionata>, e: ElementiOrbita, k: number): number {
  const x = o.ancora[0]! + o.vertici[3 * k]!;
  const y = o.ancora[1]! + o.vertici[3 * k + 1]!;
  const z = o.ancora[2]! + o.vertici[3 * k + 2]!;
  const r = Math.hypot(x, y, z);
  // Componenti nel piano dell'orbita lungo P e Q.
  const co = Math.cos(e.nodo);
  const so = Math.sin(e.nodo);
  const cw = Math.cos(e.argPeri);
  const sw = Math.sin(e.argPeri);
  const ci = Math.cos(e.i);
  const si = Math.sin(e.i);
  const P = [co * cw - so * sw * ci, so * cw + co * sw * ci, sw * si];
  const Q = [-co * sw - so * cw * ci, -so * sw + co * cw * ci, cw * si];
  const xp = x * P[0]! + y * P[1]! + z * P[2]!;
  const yq = x * Q[0]! + y * Q[1]! + z * Q[2]!;
  const nu = Math.atan2(yq, xp);
  const p = e.q * (1 + e.e);
  return Math.abs(r - p / (1 + e.e * Math.cos(nu))) / r;
}

describe('orbite ancorate (§ 10.2)', () => {
  it('raffinamento: k = 0..24 per il passo 2π/256', () => {
    expect(numeroRaffinamenti((2 * Math.PI) / PUNTI_ORBITA)).toBe(25);
    expect(1e-9 * 2 ** 24).toBeLessThan((2 * Math.PI) / 256);
    expect(1e-9 * 2 ** 25).toBeGreaterThanOrEqual((2 * Math.PI) / 256);
  });

  it('ellisse: vertice 0 nel corpo, polilinea chiusa, punti sulla conica', () => {
    const o = creaOrbitaCampionata();
    const e = el(0.983 * UA_KM, 0.0167, 0.1, 1.2, 1.8, 2.5);
    expect(campionaOrbita(e, true, o)).toBe(true);
    expect(o.chiusa).toBe(true);
    expect(o.n).toBe(1 + 25 + 255 + 25 + 1);
    expect(o.indiceAncora).toBe(0);
    for (const k of [0, o.n - 1]) for (let c = 0; c < 3; c++) expect(Math.abs(o.vertici[3 * k + c]!)).toBe(0);
    // Primo raffinamento: δ = 1e-9 rad in anomalia eccentrica ≈ a·δ km.
    const d1 = Math.hypot(o.vertici[3]!, o.vertici[4]!, o.vertici[5]!);
    expect(d1 / (e.q / (1 - e.e)) / 1e-9).toBeGreaterThan(0.95);
    expect(d1 / (e.q / (1 - e.e)) / 1e-9).toBeLessThan(1.05);
    // Distanze crescenti per raddoppio nei primi 25 vertici.
    for (let k = 2; k <= 25; k++) {
      const a = Math.hypot(o.vertici[3 * k]!, o.vertici[3 * k + 1]!, o.vertici[3 * k + 2]!);
      const b = Math.hypot(o.vertici[3 * k - 3]!, o.vertici[3 * k - 2]!, o.vertici[3 * k - 1]!);
      expect(a / b).toBeGreaterThan(1.9);
      expect(a / b).toBeLessThan(2.1);
    }
    let max = 0;
    for (let k = 0; k < o.n; k++) max = Math.max(max, scartoConica(o, e, k));
    expect(max).toBeLessThan(1e-6);
    expect(o.dnu[0]).toBe(0);
  });

  it('ellisse molto eccentrica: punti aggiuntivi attorno al pericentro', () => {
    const o = creaOrbitaCampionata();
    const e = el(0.0062 * UA_KM, 0.99998, 1.06, 4.8, 6.1, 3.0);
    expect(campionaOrbita(e, true, o)).toBe(true);
    expect(o.n).toBeGreaterThan(307);
    expect(o.n).toBeLessThanOrEqual(CAPACITA_ORBITA);
    let max = 0;
    for (let k = 0; k < o.n; k++) max = Math.max(max, scartoConica(o, e, k));
    expect(max).toBeLessThan(1e-5);
  });

  it('iperbole: arco limitato al tempo per 3 volte la distanza attuale, ancora interna', () => {
    const o = creaOrbitaCampionata();
    const e = el(0.2559 * UA_KM, 1.2011, 2.14, 0.43, 4.22, 0.6);
    expect(campionaOrbita(e, true, o)).toBe(true);
    expect(o.chiusa).toBe(false);
    const a = o.indiceAncora;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(o.n - 1);
    for (let c = 0; c < 3; c++) expect(Math.abs(o.vertici[3 * a + c]!)).toBe(0);
    const rNow = Math.hypot(o.ancora[0]!, o.ancora[1]!, o.ancora[2]!);
    const rFine = Math.hypot(
      o.ancora[0]! + o.vertici[3 * (o.n - 1)]!,
      o.ancora[1]! + o.vertici[3 * (o.n - 1) + 1]!,
      o.ancora[2]! + o.vertici[3 * (o.n - 1) + 2]!,
    );
    // Il corpo è in uscita (ν > 0): il ramo futuro termina a 3 r.
    expect(Math.abs(rFine / (3 * rNow) - 1)).toBeLessThan(1e-6);
    let max = 0;
    for (let k = 0; k < o.n; k++) max = Math.max(max, scartoConica(o, e, k));
    expect(max).toBeLessThan(1e-6);
    // Anomalie vere relative monotone.
    for (let k = 1; k < o.n; k++) expect(o.dnu[k]!).toBeGreaterThanOrEqual(o.dnu[k - 1]!);
  });

  it('parabola e ancora al pericentro senza posizione del corpo', () => {
    const o = creaOrbitaCampionata();
    const e = el(1.0 * UA_KM, 1, 0.5, 0.2, 0.3, 1.0);
    expect(campionaOrbita(e, true, o)).toBe(true);
    let max = 0;
    for (let k = 0; k < o.n; k++) max = Math.max(max, scartoConica(o, e, k));
    expect(max).toBeLessThan(1e-6);
    const p = creaOrbitaCampionata();
    expect(campionaOrbita(el(2 * UA_KM, 0.3, 0.2, 0.1, 0.4, Number.NaN), false, p)).toBe(true);
    expect(Math.hypot(p.ancora[0]!, p.ancora[1]!, p.ancora[2]!) / (2 * UA_KM)).toBeCloseTo(1, 12);
  });

  it('distanza da una polilinea', () => {
    const xy = [0, 0, 10, 0, 10, 10];
    expect(distanzaPolilinea(5, 3, xy, 3)).toBeCloseTo(3, 12);
    expect(distanzaPolilinea(12, 5, xy, 3)).toBeCloseTo(2, 12);
  });
});
