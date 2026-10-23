// Orientamento dei corpi (§ 7.7, R10): WGCCRE contro la fixture della pipeline (physical.py, a sua volta
// verificato contro SPICE pxform con lo stesso PCK), rotazione sincrona, delega ai fornitori, intervalli indicativi.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CoefficientiWgccre, CorpoCatalogo } from '../../src/data/catalogTypes';
import { J2000, OBLIQUITA_J2000_RAD } from '../../src/ephem/constants';
import {
  JD_WGCCRE_FINE,
  JD_WGCCRE_INIZIO,
  ServizioOrientamento,
  angoliWgccre,
  matriceSincrona,
  matriceWgccre,
} from '../../src/ephem/orientation';
import type { TimeState } from '../../src/time/types';

interface FixtureOrientamento {
  seme: number;
  epoche: number[];
  corpi: Record<string, { coefficienti: CoefficientiWgccre; matrici: number[][] }>;
}

const fixture = JSON.parse(readFileSync(new URL('../fixtures/catalogo/orientamento.json', import.meta.url), 'utf8')) as FixtureOrientamento;

function scarto(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < 9; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}

function ortonormale(m: Float64Array): number {
  let e = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += m[3 * k + i]! * m[3 * k + j]!;
      e = Math.max(e, Math.abs(s - (i === j ? 1 : 0)));
    }
  }
  return e;
}

describe('WGCCRE', () => {
  it('matrici uguali alla pipeline per tutti i corpi con modello WGCCRE', () => {
    const m = new Float64Array(9);
    let vicino = 0;
    let lontano = 0;
    const corpi = Object.keys(fixture.corpi);
    expect(corpi).toEqual(expect.arrayContaining(['sole', 'mercurio', 'marte', 'giove', 'nettuno', 'plutone', 'cerere', 'vesta']));
    for (const slug of corpi) {
      const c = fixture.corpi[slug]!;
      fixture.epoche.forEach((t, k) => {
        matriceWgccre(c.coefficienti, t, m);
        const s = scarto(m, c.matrici[k]!);
        if (Math.abs(t - J2000) < 200 * 365.25) vicino = Math.max(vicino, s);
        else lontano = Math.max(lontano, s);
        expect(ortonormale(m)).toBeLessThan(1e-14);
      });
    }
    // W raggiunge 10^8 gradi a 200 anni e 10^9 gradi a 12 000 anni da J2000: la riduzione modulo 360° esatta del
    // runtime differisce dalla pipeline (radianti non ridotti) per l'arrotondamento in doppia precisione
    expect(vicino).toBeLessThan(5e-10);
    expect(lontano).toBeLessThan(5e-8);
  });

  it('polo, meridiano e verso della rotazione', () => {
    const urano = fixture.corpi.urano!.coefficienti;
    const a = angoliWgccre(urano, J2000, { alfa0: 0, delta0: 0, w: 0 });
    expect([a.alfa0, a.delta0, a.w]).toEqual([257.311, -15.175, 203.81]);
    const m = new Float64Array(9);
    matriceWgccre(urano, J2000, m);
    // colonna z = polo α0, δ0 ruotato nell'eclittica
    const ar = (257.311 * Math.PI) / 180;
    const dr = (-15.175 * Math.PI) / 180;
    const p = [Math.cos(dr) * Math.cos(ar), Math.cos(dr) * Math.sin(ar), Math.sin(dr)];
    const c = Math.cos(OBLIQUITA_J2000_RAD);
    const s = Math.sin(OBLIQUITA_J2000_RAD);
    expect(m[2]).toBeCloseTo(p[0]!, 15);
    expect(m[5]).toBeCloseTo(c * p[1]! + s * p[2]!, 15);
    expect(m[8]).toBeCloseTo(-s * p[1]! + c * p[2]!, 15);
    // Urano retrogrado: Ẇ < 0
    const b = angoliWgccre(urano, J2000 + 0.01, { alfa0: 0, delta0: 0, w: 0 });
    expect(b.w).toBeLessThan(a.w);
  });
});

describe('rotazione sincrona', () => {
  it('x verso il primario sul piano dell\'orbita, z polo', () => {
    const m = new Float64Array(9);
    expect(matriceSincrona([3, 4, 0.5], [0, 0, 2], m)).toBe(true);
    expect([m[0], m[3], m[6]].map((x) => +x!.toFixed(15))).toEqual([0.6, 0.8, 0]);
    expect([m[2], m[5], m[8]]).toEqual([0, 0, 1]);
    expect(ortonormale(m)).toBeLessThan(1e-15);
    // y = z × x
    expect(m[1]).toBeCloseTo(-0.8, 15);
    expect(m[4]).toBeCloseTo(0.6, 15);
    expect(matriceSincrona([0, 0, 1], [0, 0, 1], m)).toBe(false);
    expect(matriceSincrona([1, 0, 0], [0, 0, 0], m)).toBe(false);
  });
});

function corpo(ssid: number, o: CorpoCatalogo['orientamento'], naif: number | null = null): CorpoCatalogo {
  return {
    ssid,
    slug: `c${ssid}`,
    nome: `c${ssid}`,
    nomeUfficiale: null,
    numero: null,
    designazione: null,
    alias: [],
    categoria: 'asteroide',
    categorieSecondarie: [],
    naif,
    spkid: null,
    primario: 'sole',
    effemeridi: { modello: 'sole' },
    soluzione: { id: 'X', data: null, estrazione: null, modelloNG: null, recordDastcom: null },
    fisica: { raggi_km: null, gm_km3s2: null, rotazione: null, albedo: null },
    orientamento: o,
    texture: null,
    epsModelloCostante: null,
  };
}

describe('servizio di orientamento', () => {
  const giove = fixture.corpi.giove!.coefficienti;
  const corpi = [
    corpo(0, { modello: 'wgccre', coefficienti: giove, convenzionePolo: 'nord-IAU', indicativo: false }, 599),
    corpo(1, { modello: 'vondrak', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: false }),
    corpo(2, { modello: 'cassini', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: false }),
    corpo(3, { modello: 'sincrono', coefficienti: null, convenzionePolo: 'momento-angolare', indicativo: false }),
    corpo(4, { modello: 'fisso', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: true }),
  ];

  it('delega ai fornitori e identità senza modello', () => {
    const s = new ServizioOrientamento(corpi);
    const m = new Float64Array(9);
    expect(s.bodyFixedToScene(1, J2000, m)).toBe(false);
    expect(Array.from(m)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(s.bodyFixedToScene(4, J2000, m)).toBe(false);
    expect(s.bodyFixedToScene(99, J2000, m)).toBe(false);
    const chiamate: string[] = [];
    s.impostaFornitori({
      terra: (jd, out, t) => {
        chiamate.push(`terra ${jd} ${t?.jdUT ?? '-'}`);
        out.fill(0.5);
        return true;
      },
      luna: (jd, out) => {
        chiamate.push(`luna ${jd}`);
        out.fill(0.25);
        return true;
      },
      sincrono: (ssid, jd, verso, polo) => {
        chiamate.push(`sincrono ${ssid} ${jd}`);
        verso.set([0, 1, 0]);
        polo.set([0, 0, 1]);
        return true;
      },
    });
    const t: TimeState = { jdUT: J2000 - 0.0008, jdTT: J2000, deltaT: 69, deltaTSigma: 1, scalaIngresso: 'UT' };
    expect(s.orientamento(1, t, m)).toBe(true);
    expect(m[0]).toBe(0.5);
    expect(s.bodyFixedToScene(2, J2000, m)).toBe(true);
    expect(m[8]).toBe(0.25);
    expect(s.bodyFixedToScene(3, J2000, m)).toBe(true);
    expect([m[0], m[3], m[6]]).toEqual([0, 1, 0]);
    expect(chiamate).toEqual([`terra ${J2000} ${J2000 - 0.0008}`, `luna ${J2000}`, `sincrono 3 ${J2000}`]);
    expect(s.bodyFixedToScene(0, J2000, m)).toBe(true);
    expect(scarto(m, fixture.corpi.giove!.matrici[0]!)).toBeLessThan(1e-14);
  });

  it('intervalli indicativi e fase arbitraria', () => {
    const s = new ServizioOrientamento(corpi);
    expect(s.indicativo(0, JD_WGCCRE_INIZIO)).toBe(false);
    expect(s.indicativo(0, JD_WGCCRE_INIZIO - 1)).toBe(true);
    expect(s.indicativo(0, JD_WGCCRE_FINE)).toBe(true);
    expect(s.indicativo(4, J2000)).toBe(true);
    expect(s.indicativo(1, -1e6)).toBe(false);
    expect(s.faseArbitraria(0)).toBe(true);
    expect(s.faseArbitraria(1)).toBe(false);
    expect(s.modello(3)).toBe('sincrono');
  });
});
