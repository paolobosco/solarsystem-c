// Affidabilità (§ 7.8): soglie dei livelli, ε_ΔT = ω·σ(ΔT), combinazione con ε_modello da reliability.bin o
// dal valore costante del catalogo.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CorpoCatalogo } from '../../src/data/catalogTypes';
import { istanteNodo, leggiAffidabilita } from '../../src/data/reliabilityReader';
import { ARCSEC_RAD, J2000, T0, T_END } from '../../src/ephem/constants';
import { SOGLIE_LIVELLO, ServizioAffidabilita, epsDeltaT, livelloDaErrore, velocitaAngolare } from '../../src/ephem/reliability';
import type { Affidabilita } from '../../src/ephem/types';
import type { TimeState } from '../../src/time/types';

const GRADO = Math.PI / 180;

function ts(jdTT: number, sigma: number, scala: 'UT' | 'TT' = 'UT'): TimeState {
  return { jdUT: jdTT, jdTT, deltaT: 0, deltaTSigma: sigma, scalaIngresso: scala };
}

describe('livelli', () => {
  it('soglie del § 7.8.2 incluse nel livello inferiore', () => {
    expect(livelloDaErrore(0)).toBe('precisa');
    expect(livelloDaErrore(SOGLIE_LIVELLO.precisa)).toBe('precisa');
    expect(livelloDaErrore(SOGLIE_LIVELLO.precisa * 1.0001)).toBe('buona');
    expect(livelloDaErrore(GRADO)).toBe('buona');
    expect(livelloDaErrore(10 * GRADO)).toBe('approssimata');
    expect(livelloDaErrore(90 * GRADO)).toBe('indicativa');
    expect(livelloDaErrore(90.001 * GRADO)).toBe('non-determinabile');
    expect(livelloDaErrore(Number.NaN)).toBe('non-determinabile');
    expect(livelloDaErrore(Number.POSITIVE_INFINITY)).toBe('non-determinabile');
  });

  it('velocità angolare e ε_ΔT', () => {
    // orbita circolare: ω = v/r
    expect(velocitaAngolare([1e8, 0, 0], [0, 30, 0])).toBeCloseTo(3e-7, 20);
    expect(velocitaAngolare([0, 0, 0], [1, 0, 0])).toBe(0);
    expect(epsDeltaT(2e-6, ts(J2000, 3600))).toBeCloseTo(7.2e-3, 15);
    expect(epsDeltaT(2e-6, ts(J2000, 3600, 'TT'))).toBe(0);
    // Luna media (§ 6.5): circa 0,55°/h
    expect((epsDeltaT(2.6617e-6, ts(J2000, 3600)) / GRADO).toFixed(2)).toBe('0.55');
  });
});

function corpo(ssid: number, eps: number | null): CorpoCatalogo {
  return {
    ssid,
    slug: `c${ssid}`,
    nome: `c${ssid}`,
    nomeUfficiale: null,
    numero: null,
    designazione: null,
    alias: [],
    categoria: 'pianeta',
    categorieSecondarie: [],
    naif: null,
    spkid: null,
    primario: 'sole',
    effemeridi: { modello: 'sole' },
    soluzione: { id: 'X', data: null, estrazione: null, modelloNG: null, recordDastcom: null },
    fisica: { raggi_km: null, gm_km3s2: null, rotazione: null, albedo: null },
    orientamento: { modello: 'fisso', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: true },
    texture: null,
    epsModelloCostante: eps,
  };
}

describe('servizio di affidabilità', () => {
  const corpi = [corpo(0, 0), corpo(1, 2 * ARCSEC_RAD), corpo(2, null), corpo(3, null)];
  const out: Affidabilita = { livello: 'precisa', epsModello: 0, epsDeltaT: 0, epsTotale: 0 };

  it('costanti del catalogo e combinazione in quadratura', () => {
    const s = new ServizioAffidabilita(corpi);
    expect(s.calcola(0, ts(J2000, 1e5), 0, out)).toBe(true);
    expect(out).toEqual({ livello: 'precisa', epsModello: 0, epsDeltaT: 0, epsTotale: 0 });
    // pianeta: 2″ e ω della Terra (2·10⁻⁷ rad/s) con σ = 103 005 s: circa 1,2°
    s.calcola(1, ts(-1931076.5, 103005), 1.99e-7, out);
    expect(out.epsModello).toBeCloseTo(2 * ARCSEC_RAD, 15);
    expect(out.epsTotale).toBeCloseTo(Math.hypot(2 * ARCSEC_RAD, 1.99e-7 * 103005), 15);
    expect(out.livello).toBe('approssimata');
    s.calcola(1, ts(-1931076.5, 103005, 'TT'), 1.99e-7, out);
    expect(out.livello).toBe('precisa');
  });

  it('serie in attesa del file: non stimabile oppure livello provvisorio', () => {
    const s = new ServizioAffidabilita(corpi);
    expect(s.pronto()).toBe(false);
    expect(s.calcola(2, ts(J2000, 1), 1e-7, out)).toBe(false);
    expect(out.epsModello).toBeNaN();
    expect(out.livello).toBe('non-determinabile');
    const p = new ServizioAffidabilita(corpi, null, { livelloInAttesa: 'buona' });
    expect(p.calcola(2, ts(J2000, 1), 1e-7, out)).toBe(false);
    expect(out.livello).toBe('buona');
  });

  it('serie da reliability.bin', () => {
    const f = readFileSync(new URL('../../public/data/v1/reliability.bin', import.meta.url));
    const d = leggiAffidabilita(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
    const catalogo = JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf8')) as {
      corpi: CorpoCatalogo[];
    };
    const s = new ServizioAffidabilita(catalogo.corpi, d);
    expect(s.pronto()).toBe(true);
    // Luna (ssid 82): ε_modello dalla serie, entro 60″ ⊕ termine mareale (§ 7.8.1)
    const luna = s.epsModello(82, J2000);
    expect(luna).toBeGreaterThan(0);
    expect(luna).toBeLessThan(0.01);
    // Luna mai 'precisa' (ε_modello > 60″ per costruzione), anche con l'istante in TT (ε_ΔT = 0)
    for (let j = 0; j < d.nodi; j++) {
      for (const f of [0, 0.25, 0.5, 0.75]) {
        const t = istanteNodo(d, j) + f * (istanteNodo(d, j + 1) - istanteNodo(d, j));
        if (t < T_END) expect(s.epsModello(82, t)).toBeGreaterThan(SOGLIE_LIVELLO.precisa);
      }
    }
    s.calcola(82, ts(J2000, 0, 'TT'), 2.66e-6, out);
    expect(out.epsDeltaT).toBe(0);
    expect(out.livello).toBe('buona');
    // Sole: assente dal file, costante 0 del catalogo
    expect(s.epsModello(0, J2000)).toBe(0);
    // fuori dalla griglia: non stimabile, dati assenti
    expect(s.calcola(82, ts(T0 - 1, 0), 0, out)).toBe(true);
    expect(out.livello).toBe('non-determinabile');
    expect(s.datiPresenti(82, T0 - 1)).toBe(false);
    expect(s.formaDeterminata(4, J2000)).toBe(true);
  });

  it('19/10/2026: il livello segue ε dell\'intervallo di 1,25 anni, non il valore del 2040 (§ 8.7)', () => {
    const f = readFileSync(new URL('../../public/data/v1/reliability.bin', import.meta.url));
    const d = leggiAffidabilita(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
    const catalogo = JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf8')) as {
      corpi: CorpoCatalogo[];
    };
    const s = new ServizioAffidabilita(catalogo.corpi, d);
    const ssid = new Map(catalogo.corpi.map((c) => [c.slug, c.ssid]));
    // Corpi che con l'intervallo 2020,7-2040,7 passavano a 'buona' (46P ad 'approssimata').
    const corpi = ['io', 'amaltea', 'encelado', 'teti', 'ariel', 'umbriel', 'titania', 'proteo', 'apophis', '19p-borrelly',
      '46p-wirtanen', '81p-wild-2', '103p-hartley-2', 'c2023-a3-tsuchinshan-atlas'];
    const livelli: Record<string, string> = {};
    for (const slug of corpi) {
      s.calcola(ssid.get(slug)!, ts(2_461_333.0008, 0, 'TT'), 0, out);
      livelli[slug] = out.livello;
    }
    expect(livelli).toEqual(Object.fromEntries(corpi.map((x) => [x, 'precisa'])));
    // 21P: ε all'istante dalla variante senza NG dopo il perielio del 2025 (397″), non il valore del 2040 (1 088″)
    expect(s.epsModello(ssid.get('21p-giacobini-zinner')!, 2_461_333.0008) / ARCSEC_RAD).toBeLessThanOrEqual(400);
  });
});
