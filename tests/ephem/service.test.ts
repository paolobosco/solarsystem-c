// Servizio delle effemeridi (§ 5.4, § 5.6, § 7.3.5, § 7.6.5, § 7.8, § 10.2) con i dati pubblicati in
// public/data/v1/: confronto con le fixture dei moduli (pianeti, Luna, satelliti, piccoli corpi) attraverso il
// servizio, confini dei blocchi, stati 'caricamento' e 'fuori-copertura', prefetch con l'archivio dei dati e
// cache LRU, orbite, affidabilità, nessuna allocazione nel percorso per frame.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { bloccoDi, fineBlocco, inizioBlocco } from '../../src/data/binHeader';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo } from '../../src/data/catalogTypes';
import { ArchivioDati } from '../../src/data/dataStore';
import type { FunzioneFetch } from '../../src/data/dataStore';
import { IndiceManifest, leggiManifest, percorsoBlocco } from '../../src/data/manifest';
import { leggiLuna } from '../../src/data/moonReader';
import { leggiAffidabilita } from '../../src/data/reliabilityReader';
import { GM_BARICENTRI, GM_SOLE, K, MU_ELIO_KM3_S2, T0, T_END, UA_KM } from '../../src/ephem/constants';
import { puntoSuConica } from '../../src/ephem/equinoctial';
import { ServizioOrientamento } from '../../src/ephem/orientation';
import { ServizioEffemeridi, TIPI_BLOCCO, intervalloBlocchi } from '../../src/ephem/service';
import type { TipoBlocco } from '../../src/ephem/service';
import { GM_TOTALE_KM3_S2, soleBaricentrico } from '../../src/ephem/sunBarycenter';
import type { Affidabilita, ElementiOrbita } from '../../src/ephem/types';
import type { TimeState } from '../../src/time/types';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const FIX = new URL('../fixtures/', import.meta.url);
const RAD_ARCSEC = 648000 / Math.PI;

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

function json<T>(url: URL): T {
  return JSON.parse(readFileSync(url, 'utf-8')) as T;
}

const catalogo: Catalogo = leggiCatalogo(json(new URL('catalog.json', DATI)));
const ssid = (slug: string): number => catalogo.corpi.find((c) => c.slug === slug)!.ssid;
const luna = leggiLuna(buffer(new URL('moon.bin', DATI)));
const affidabilita = leggiAffidabilita(buffer(new URL('reliability.bin', DATI)));
const buffers = new Map<string, ArrayBuffer>();
function bufferBlocco(tipo: TipoBlocco, k: number): ArrayBuffer {
  const p = percorsoBlocco(tipo, k);
  let b = buffers.get(p);
  if (!b) {
    b = buffer(new URL(p, DATI));
    buffers.set(p, b);
  }
  return b;
}

/** Servizio con tutti i blocchi registrati (senza archivio). */
function servizioCompleto(conAffidabilita = true): ServizioEffemeridi {
  const s = new ServizioEffemeridi({ catalogo, affidabilita: conAffidabilita ? affidabilita : null });
  s.impostaLuna(luna);
  for (let k = 0; k < K; k++) for (const t of TIPI_BLOCCO) s.registraBlocco(t, k, bufferBlocco(t, k));
  return s;
}

const servizio = servizioCompleto();

/** Archivio dei dati sul file system del repository (fetch e SHA-256 di Node). */
function archivio(capacitaLRU = 3): { store: ArchivioDati; richieste: string[] } {
  const manifest = new IndiceManifest(leggiManifest(json(new URL('manifest.json', DATI))));
  const richieste: string[] = [];
  const fetch: FunzioneFetch = async (url, init) => {
    richieste.push(url);
    if (init.signal.aborted) throw new Error('annullata');
    const b = buffer(new URL(url, DATI));
    return { ok: true, status: 200, arrayBuffer: async () => b };
  };
  const store = new ArchivioDati({
    manifest,
    fetch,
    risolvi: (p) => p,
    sha256: async (b) => createHash('sha256').update(new Uint8Array(b)).digest('hex'),
    capacitaLRU,
  });
  return { store, richieste };
}

function ts(jdTT: number, deltaTSigma = 0, scala: 'UT' | 'TT' = 'UT'): TimeState {
  return { jdUT: jdTT, jdTT, deltaT: 0, deltaTSigma, scalaIngresso: scala };
}

function nuovaOrbita(): ElementiOrbita {
  return { primario: -1, baricentrici: false, q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0, forma: 'non-determinata' };
}

function nuovaAff(): Affidabilita {
  return { livello: 'non-determinabile', epsModello: 0, epsDeltaT: 0, epsTotale: 0 };
}

// --- Pianeti (A4 attraverso il servizio) ---

describe('pianeti, Plutone ed EMB attraverso il servizio (§ 7.3)', () => {
  const meta = json<{ righe: number; soglie: { arcsec: number; embKmBlocchi11e12: number; embKmAltri: number } }>(
    new URL('planets/pianeti.json', FIX),
  );
  const tab = new Float64Array(buffer(new URL('planets/pianeti-de441.bin', FIX)));
  // ssid del file dei pianeti → NAIF del baricentro
  const naifDaFile: Record<number, number> = { 1: 1, 2: 2, 200: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 10: 9 };

  it('baricentri uguali alla valutazione Python (≤ 1e-12 relativo) ed entro le soglie contro DE441', () => {
    const out = new Float64Array(6);
    let maxPy = 0;
    const max = new Map<number, number>();
    let embModerni = 0;
    let embAltri = 0;
    for (let r = 0; r < meta.righe; r++) {
      const o = 8 * r;
      const naif = naifDaFile[tab[o]!]!;
      const t = tab[o + 1]!;
      expect(servizio.statoBaricentro(naif, t, out)).toBe('ok');
      const rr = Math.hypot(tab[o + 2]!, tab[o + 3]!, tab[o + 4]!);
      const dDe = Math.hypot(out[0]! - tab[o + 2]!, out[1]! - tab[o + 3]!, out[2]! - tab[o + 4]!);
      const dPy = Math.hypot(out[0]! - tab[o + 5]!, out[1]! - tab[o + 6]!, out[2]! - tab[o + 7]!);
      maxPy = Math.max(maxPy, dPy / rr);
      max.set(naif, Math.max(max.get(naif) ?? 0, (dDe / rr) * RAD_ARCSEC));
      if (naif === 3) {
        if (bloccoDi(t) >= 11) embModerni = Math.max(embModerni, dDe);
        else embAltri = Math.max(embAltri, dDe);
      }
    }
    expect(maxPy).toBeLessThan(1e-12);
    for (const [naif, a] of max) expect(a, `NAIF ${naif}`).toBeLessThanOrEqual(meta.soglie.arcsec);
    expect(embModerni).toBeLessThanOrEqual(meta.soglie.embKmBlocchi11e12);
    expect(embAltri).toBeLessThanOrEqual(meta.soglie.embKmAltri);
  });

  it('Mercurio e Venere coincidono con il baricentro; Marte-Plutone: centro = baricentro + scarto dei satelliti', () => {
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    const t = 2_451_545.0;
    for (const [slug, naif] of [
      ['mercurio', 1],
      ['venere', 2],
    ] as const) {
      expect(servizio.stateAt(ssid(slug), t, a)).toBe('ok');
      servizio.statoBaricentro(naif, t, b);
      expect([...a]).toEqual([...b]);
    }
    const scarti: Record<string, number> = {};
    for (const [slug, naif] of [
      ['marte', 4],
      ['giove', 5],
      ['saturno', 6],
      ['urano', 7],
      ['nettuno', 8],
      ['plutone', 9],
    ] as const) {
      expect(servizio.stateAt(ssid(slug), t, a)).toBe('ok');
      servizio.statoBaricentro(naif, t, b);
      scarti[slug] = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    }
    // ordini di grandezza del § 7.3.5: Plutone-Caronte circa 2 130 km, Saturno circa 290 km, Giove circa 200 km
    expect(scarti['plutone']).toBeGreaterThan(1500);
    expect(scarti['plutone']).toBeLessThan(2500);
    expect(scarti['saturno']).toBeGreaterThan(100);
    expect(scarti['saturno']).toBeLessThan(500);
    expect(scarti['giove']).toBeGreaterThan(50);
    expect(scarti['giove']).toBeLessThan(400);
    expect(scarti['marte']).toBeLessThan(1);
  });
});

// --- Luna e Terra (A5 attraverso il servizio) ---

describe('Luna e Terra attraverso il servizio (§ 7.3.5, § 7.4)', () => {
  const meta = json<{ righe: number; colonne: string[]; soglie: { arcsec: number; km: number } }>(new URL('moon/luna.json', FIX));
  const tab = new Float64Array(buffer(new URL('moon/luna-de441.bin', FIX)));
  const NC = meta.colonne.length;

  it('Luna geocentrica (Luna - Terra) entro 60″ e 50 km da DE441 e uguale alla pipeline (≤ 1e-6 km)', () => {
    const l = new Float64Array(6);
    const tr = new Float64Array(6);
    let maxArc = 0;
    let maxKm = 0;
    let maxPy = 0;
    let maxTerra = 0;
    for (let r = 0; r < meta.righe; r++) {
      const o = NC * r;
      const t = tab[o]!;
      expect(servizio.stateAt(ssid('luna'), t, l)).toBe('ok');
      expect(servizio.stateAt(ssid('terra'), t, tr)).toBe('ok');
      const g = [l[0]! - tr[0]!, l[1]! - tr[1]!, l[2]! - tr[2]!];
      const de = [tab[o + 1]!, tab[o + 2]!, tab[o + 3]!];
      const cx = g[1]! * de[2]! - g[2]! * de[1]!;
      const cy = g[2]! * de[0]! - g[0]! * de[2]!;
      const cz = g[0]! * de[1]! - g[1]! * de[0]!;
      maxArc = Math.max(maxArc, Math.atan2(Math.hypot(cx, cy, cz), g[0]! * de[0]! + g[1]! * de[1]! + g[2]! * de[2]!) * RAD_ARCSEC);
      maxKm = Math.max(maxKm, Math.abs(Math.hypot(...g) - Math.hypot(...de)));
      maxPy = Math.max(maxPy, Math.hypot(g[0]! - tab[o + 7]!, g[1]! - tab[o + 8]!, g[2]! - tab[o + 9]!));
      maxTerra = Math.max(maxTerra, Math.hypot(tr[0]! - tab[o + 13]!, tr[1]! - tab[o + 14]!, tr[2]! - tab[o + 15]!));
    }
    expect(maxArc).toBeLessThanOrEqual(meta.soglie.arcsec);
    expect(maxKm).toBeLessThanOrEqual(meta.soglie.km);
    expect(maxPy).toBeLessThan(1e-6);
    // Terra contro DE441 (399): 21,6-23,5 km misurati (docs/_parti/pianeti-luna.md § 3.6), soglia EMB del § 7.3.4
    expect(maxTerra).toBeLessThan(30);
  });

  it('statoGeocentricoLuna e statoRelativo coincidono con Luna - Terra', () => {
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    const t = 2_460_000.5;
    expect(servizio.statoGeocentricoLuna(t, a)).toBe('ok');
    expect(servizio.statoRelativo(ssid('luna'), t, b)).toBe('ok');
    for (let i = 0; i < 6; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-6 * Math.max(1, Math.abs(a[i]!)));
  });
});

// --- Satelliti (A6 attraverso il servizio) ---

describe('satelliti e centri dei pianeti attraverso il servizio (§ 7.3.5, § 7.5)', () => {
  interface Meta {
    righe: number;
    colonne: string[];
    righeCentri: number;
    colonneCentri: string[];
    configurazioni: { ssid: number; slug: string; primario: number }[];
    soglie: { centriKmDovePrecisi: number; precisaRad: number };
  }
  const meta = json<Meta>(new URL('sats/satelliti.json', FIX));
  const tab = new Float64Array(buffer(new URL('sats/satelliti.bin', FIX)));
  const tabC = new Float64Array(buffer(new URL('sats/centri.bin', FIX)));
  const NC = meta.colonne.length;
  const NCC = meta.colonneCentri.length;

  it('stati planetocentrici (statoRelativo) uguali alla valutazione Python', () => {
    const out = new Float64Array(6);
    let maxP = 0;
    let maxV = 0;
    for (let r = 0; r < meta.righe; r++) {
      const o = NC * r;
      const s = tab[o]!;
      const t = tab[o + 1]!;
      expect(servizio.statoRelativo(s, t, out)).toBe('ok');
      const rr = Math.hypot(tab[o + 2]!, tab[o + 3]!, tab[o + 4]!);
      const vv = Math.hypot(tab[o + 5]!, tab[o + 6]!, tab[o + 7]!);
      // differenza di due stati eliocentrici: errore assoluto ≈ 1e-16 · 5e9 km
      maxP = Math.max(maxP, Math.hypot(out[0]! - tab[o + 2]!, out[1]! - tab[o + 3]!, out[2]! - tab[o + 4]!) / rr);
      maxV = Math.max(maxV, Math.hypot(out[3]! - tab[o + 5]!, out[4]! - tab[o + 6]!, out[5]! - tab[o + 7]!) / vv);
    }
    expect(maxP).toBeLessThan(1e-9);
    expect(maxV).toBeLessThan(1e-9);
  });

  it('centro del pianeta - baricentro uguale alla formula Python e entro 5 km dagli SPK dove i satelliti sono precisi', () => {
    const naifPianeta: Record<number, number> = { 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 10: 9 };
    const c = new Float64Array(6);
    const b = new Float64Array(6);
    let maxPy = 0;
    let maxPrecisi = 0;
    let n = 0;
    for (let r = 0; r < meta.righeCentri; r++) {
      const o = NCC * r;
      const p = tabC[o]!;
      const t = tabC[o + 1]!;
      expect(servizio.stateAt(p, t, c)).toBe('ok');
      expect(servizio.statoBaricentro(naifPianeta[p]!, t, b)).toBe('ok');
      const d = [c[0]! - b[0]!, c[1]! - b[1]!, c[2]! - b[2]!];
      maxPy = Math.max(maxPy, Math.hypot(d[0]! - tabC[o + 2]!, d[1]! - tabC[o + 3]!, d[2]! - tabC[o + 4]!));
      if (tabC[o + 11]! <= meta.soglie.precisaRad) {
        n++;
        maxPrecisi = Math.max(maxPrecisi, Math.hypot(d[0]! - tabC[o + 8]!, d[1]! - tabC[o + 9]!, d[2]! - tabC[o + 10]!));
      }
    }
    expect(maxPy).toBeLessThan(1e-6);
    expect(n).toBeGreaterThan(0);
    expect(maxPrecisi).toBeLessThanOrEqual(meta.soglie.centriKmDovePrecisi);
  });

  it('Disnomia attorno a Eris (piccolo corpo); Notte e Idra attorno al centro di Plutone', () => {
    const a = new Float64Array(6);
    const e = new Float64Array(6);
    const t = 2_460_000.5;
    expect(servizio.stateAt(ssid('disnomia'), t, a)).toBe('ok');
    expect(servizio.stateAt(ssid('eris'), t, e)).toBe('ok');
    const d = Math.hypot(a[0]! - e[0]!, a[1]! - e[1]!, a[2]! - e[2]!);
    expect(d).toBeGreaterThan(36_000);
    expect(d).toBeLessThan(38_500);
    expect(servizio.statoRelativo(ssid('idra'), t, a)).toBe('ok');
    expect(Math.hypot(a[0]!, a[1]!, a[2]!)).toBeGreaterThan(60_000);
  });
});

// --- Piccoli corpi (A7 attraverso il servizio) ---

describe('piccoli corpi attraverso il servizio (§ 7.6)', () => {
  const fix = json<{ casi: { slug: string; ssid: number; t: number; esito: string; stato: number[] | null }[] }>(
    new URL('small/casi.json', FIX),
  );

  it('stati ed esiti uguali alla valutazione Python (scarto relativo ≤ 1e-12)', () => {
    const out = new Float64Array(6);
    let maxRel = 0;
    for (const c of fix.casi) {
      const esito = servizio.stateAt(c.ssid, c.t, out);
      expect(esito, `${c.slug} a ${c.t}`).toBe(c.esito);
      if (c.stato === null) continue;
      const r = Math.hypot(c.stato[0]!, c.stato[1]!, c.stato[2]!);
      maxRel = Math.max(maxRel, Math.hypot(out[0]! - c.stato[0]!, out[1]! - c.stato[1]!, out[2]! - c.stato[2]!) / r);
    }
    expect(maxRel).toBeLessThanOrEqual(1e-12);
  });
});

// --- Sole baricentrico ---

describe('Sole baricentrico (§ 7.6.5)', () => {
  it('r_⊙ = -Σ GM_i·r_i/(GM_⊙ + Σ GM_i) con i nove baricentri', () => {
    const t = 2_451_545.0;
    const bar = new Float64Array(54);
    const b = new Float64Array(6);
    for (let n = 1; n <= 9; n++) {
      expect(servizio.statoBaricentro(n, t, b)).toBe('ok');
      bar.set(b, 6 * (n - 1));
    }
    const atteso = new Float64Array(6);
    soleBaricentrico(bar, atteso);
    const s = new Float64Array(6);
    expect(servizio.statoSoleBaricentrico(t, s)).toBe('ok');
    expect([...s]).toEqual([...atteso]);
    let gm = GM_SOLE;
    for (let n = 1; n <= 9; n++) gm += GM_BARICENTRI[n]!;
    expect(GM_TOTALE_KM3_S2).toBe(gm);
    // ampiezza tipica: entro 2,2 raggi solari dal baricentro
    const r = Math.hypot(s[0]!, s[1]!, s[2]!);
    expect(r).toBeGreaterThan(1e4);
    expect(r).toBeLessThan(2.2 * 695_700);
  });
});

// --- Confini dei blocchi e stati ---

describe('blocchi, confini e stati (§ 5.6, § 8.1)', () => {
  it("'caricamento' senza dati, 'fuori-copertura' fuori da [T0, T_END), Sole sempre disponibile nell'intervallo", () => {
    const s = new ServizioEffemeridi({ catalogo });
    const out = new Float64Array(6).fill(7);
    const t = 2_460_000.5;
    expect(s.pronto(t)).toBe(false);
    for (const slug of ['terra', 'giove', 'luna', 'io', 'cerere', '1p-halley']) {
      expect(s.stateAt(ssid(slug), t, out), slug).toBe('caricamento');
    }
    expect([...out]).toEqual([7, 7, 7, 7, 7, 7]);
    expect(s.stateAt(ssid('sole'), t, out)).toBe('ok');
    expect([...out]).toEqual([0, 0, 0, 0, 0, 0]);
    for (const slug of ['sole', 'terra', 'cerere']) {
      expect(s.stateAt(ssid(slug), T0 - 1, out)).toBe('fuori-copertura');
      expect(s.stateAt(ssid(slug), T_END, out)).toBe('fuori-copertura');
      expect(s.stateAt(ssid(slug), Number.NaN, out)).toBe('fuori-copertura');
    }
    expect(s.stateAt(999, t, out)).toBe('non-determinabile');
    expect(s.stateAt(-1, t, out)).toBe('non-determinabile');
    expect(s.stateAt(1.5, t, out)).toBe('non-determinabile');
    const orb = nuovaOrbita();
    expect(s.orbitAt(ssid('terra'), t, orb)).toBe('caricamento');
    expect(s.orbitAt(ssid('sole'), t, orb)).toBe('non-determinabile');
    expect(s.orbitAt(ssid('terra'), T_END, orb)).toBe('fuori-copertura');
    // fuori da [T0, T_END) non serve alcun blocco
    expect(s.pronto(T0 - 1)).toBe(true);
  });

  it('pianeti caricati senza Luna: Terra e Luna in caricamento, Giove dipende dai satelliti', () => {
    const s = new ServizioEffemeridi({ catalogo });
    s.registraBlocco('pianeti', 12, bufferBlocco('pianeti', 12));
    const out = new Float64Array(6);
    const t = 2_460_000.5;
    expect(s.stateAt(ssid('mercurio'), t, out)).toBe('ok');
    expect(s.stateAt(ssid('terra'), t, out)).toBe('caricamento');
    expect(s.stateAt(ssid('giove'), t, out)).toBe('caricamento');
    s.registraBlocco('satelliti', 12, bufferBlocco('satelliti', 12));
    expect(s.stateAt(ssid('giove'), t, out)).toBe('ok');
    expect(s.stateAt(ssid('io'), t, out)).toBe('ok');
    expect(s.pronto(t)).toBe(false);
    s.impostaLuna(luna);
    s.registraBlocco('piccoli-corpi', 12, bufferBlocco('piccoli-corpi', 12));
    expect(s.pronto(t)).toBe(true);
    expect(s.stateAt(ssid('terra'), t, out)).toBe('ok');
    s.rimuoviBlocco('pianeti', 12);
    expect(s.stateAt(ssid('terra'), t, out)).toBe('caricamento');
    expect(s.pronto(t)).toBe(false);
  });

  it('al confine t_b = inizio del blocco k serve il blocco k; un istante prima il blocco k - 1 (confronti esatti)', () => {
    const s = new ServizioEffemeridi({ catalogo });
    s.impostaLuna(luna);
    const k = 11;
    for (const tipo of TIPI_BLOCCO) s.registraBlocco(tipo, k - 1, bufferBlocco(tipo, k - 1));
    const tb = inizioBlocco(k);
    expect(fineBlocco(k - 1)).toBe(tb);
    const prima = tb - 1e-6;
    expect(bloccoDi(prima)).toBe(k - 1);
    expect(bloccoDi(tb)).toBe(k);
    const out = new Float64Array(6);
    expect(s.pronto(prima)).toBe(true);
    expect(s.pronto(tb)).toBe(false);
    expect(s.stateAt(ssid('terra'), prima, out)).toBe('ok');
    expect(s.stateAt(ssid('terra'), tb, out)).toBe('caricamento');
    expect(s.mancanti(tb, tb)).toEqual(['planets/p11.bin', 'sats/s11.bin', 'small/b11.bin']);
    for (const tipo of TIPI_BLOCCO) s.registraBlocco(tipo, k, bufferBlocco(tipo, k));
    expect(s.pronto(tb)).toBe(true);
    expect(s.mancanti(prima, tb)).toEqual([]);
    expect(intervalloBlocchi(prima, tb)).toEqual([k - 1, k]);
    expect(intervalloBlocchi(T0 - 5, T_END + 5)).toEqual([0, K - 1]);
  });

  it('continuità ai confini dei blocchi per tutti i corpi con dati (§ 7.3.4: pianeti < 1 km)', () => {
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    let maxPianeti = 0;
    for (let k = 1; k < K; k++) {
      const tb = inizioBlocco(k);
      // istante precedente rappresentabile e moto lineare su quell'intervallo
      const dt = tb - (tb - 1e-6);
      for (const c of catalogo.corpi) {
        if (c.categoria === 'sole') continue;
        if (servizio.stateAt(c.ssid, tb - dt, a) !== 'ok' || servizio.stateAt(c.ssid, tb, b) !== 'ok') continue;
        let d = 0;
        for (let i = 0; i < 3; i++) d = Math.max(d, Math.abs(a[i]! + a[i + 3]! * dt * 86_400 - b[i]!));
        const r = Math.hypot(b[0]!, b[1]!, b[2]!);
        if (c.categoria === 'pianeta' || c.slug === 'plutone') maxPianeti = Math.max(maxPianeti, d);
        // piccoli corpi: salto ≤ 1e-7·r tra segmenti di blocchi diversi (docs/_parti/piccoli-corpi.md § 5.2)
        expect(d / r, `${c.slug} al confine ${k}`).toBeLessThan(1e-7);
      }
    }
    expect(maxPianeti).toBeLessThan(1);
  });
});

// --- Prefetch con l'archivio dei dati ---

describe('prefetch, pronto e cache LRU con ArchivioDati (§ 5.6)', () => {
  it('carica i blocchi necessari e moon.bin; il blocco rilasciato dalla LRU torna in caricamento', async () => {
    const { store, richieste } = archivio(3);
    const s = new ServizioEffemeridi({ catalogo, store });
    let notifiche = 0;
    s.onDati(() => notifiche++);
    const t12 = 2_460_000.5;
    expect(s.pronto(t12)).toBe(false);
    await s.prefetch(t12, t12);
    expect(s.pronto(t12)).toBe(true);
    expect(notifiche).toBe(4);
    expect(richieste.sort()).toEqual(['moon.bin', 'planets/p12.bin', 'sats/s12.bin', 'small/b12.bin']);
    const out = new Float64Array(6);
    expect(s.stateAt(ssid('terra'), t12, out)).toBe('ok');
    // una seconda richiesta non scarica di nuovo
    await s.prefetch(t12, t12);
    expect(richieste.length).toBe(4);
    // blocchi 11, 10, 9: il 12 è il meno usato e l'archivio lo rilascia
    for (const k of [11, 10, 9]) await s.prefetch(inizioBlocco(k) + 10, inizioBlocco(k) + 10);
    expect(store.stato('planets/p12.bin')).toBe('assente');
    expect(s.bloccoCaricato('pianeti', 12)).toBe(false);
    expect(s.stateAt(ssid('terra'), t12, out)).toBe('caricamento');
    expect(s.pronto(inizioBlocco(9) + 10)).toBe(true);
    s.dispose();
  });

  it('richieste annullate: AbortError e nessun blocco registrato', async () => {
    const { store } = archivio(3);
    const s = new ServizioEffemeridi({ catalogo, store });
    const ac = new AbortController();
    ac.abort();
    await expect(s.prefetch(2_460_000.5, 2_460_000.5, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(s.pronto(2_460_000.5)).toBe(false);
    s.dispose();
  });

  it('senza archivio prefetch rifiuta se mancano dati e si risolve se tutto è caricato', async () => {
    await expect(new ServizioEffemeridi({ catalogo }).prefetch(2_460_000.5, 2_460_000.5)).rejects.toThrow();
    await expect(servizio.prefetch(2_460_000.5, 2_460_000.5)).resolves.toBeUndefined();
  });
});

// --- Orbite (§ 10.2) ---

describe('orbitAt per tipo di corpo (§ 10.2)', () => {
  const orb = nuovaOrbita();
  const st = new Float64Array(6);
  const bar = new Float64Array(6);
  const p = new Float64Array(3);
  const t = 2_460_000.5;

  it('pianeti e Terra: conica del baricentro (EMB per la Terra), primario il Sole', () => {
    for (const [slug, naif] of [
      ['mercurio', 1],
      ['terra', 3],
      ['giove', 5],
      ['plutone', 9],
    ] as const) {
      expect(servizio.orbitAt(ssid(slug), t, orb), slug).toBe('ok');
      expect(orb.primario).toBe(ssid('sole'));
      expect(orb.baricentrici).toBe(false);
      expect(orb.forma).toBe('determinata');
      servizio.statoBaricentro(naif, t, bar);
      puntoSuConica(orb, orb.anomaliaVera, p);
      const r = Math.hypot(bar[0]!, bar[1]!, bar[2]!);
      expect(Math.hypot(p[0]! - bar[0]!, p[1]! - bar[1]!, p[2]! - bar[2]!) / r, slug).toBeLessThan(1e-9);
      expect(MU_ELIO_KM3_S2[naif]).toBeGreaterThan(GM_SOLE);
    }
  });

  it('Luna: osculante geocentrica, primario la Terra', () => {
    expect(servizio.orbitAt(ssid('luna'), t, orb)).toBe('ok');
    expect(orb.primario).toBe(ssid('terra'));
    servizio.statoGeocentricoLuna(t, st);
    puntoSuConica(orb, orb.anomaliaVera, p);
    expect(Math.hypot(p[0]! - st[0]!, p[1]! - st[1]!, p[2]! - st[2]!)).toBeLessThan(1e-4);
    expect(orb.e).toBeLessThan(0.1);
  });

  it('satelliti: planetocentriche, primario il pianeta', () => {
    for (const slug of ['io', 'titano', 'tritone', 'caronte']) {
      expect(servizio.orbitAt(ssid(slug), t, orb), slug).toBe('ok');
      expect(orb.primario).toBe(ssid(catalogo.corpi[ssid(slug)]!.primario!));
      expect(orb.q).toBeLessThan(2e6);
    }
  });

  it('piccoli corpi lontani: elementi baricentrici con il Sole baricentrico del servizio', () => {
    expect(servizio.orbitAt(ssid('sedna'), t, orb)).toBe('ok');
    servizio.stateAt(ssid('sedna'), t, st);
    expect(Math.hypot(st[0]!, st[1]!, st[2]!)).toBeGreaterThan(50 * UA_KM);
    expect(orb.baricentrici).toBe(true);
    const sole = new Float64Array(6);
    servizio.statoSoleBaricentrico(t, sole);
    puntoSuConica(orb, orb.anomaliaVera, p);
    const d = Math.hypot(p[0]! - st[0]! - sole[0]!, p[1]! - st[1]! - sole[1]!, p[2]! - st[2]! - sole[2]!);
    expect(d / Math.hypot(st[0]!, st[1]!, st[2]!)).toBeLessThan(1e-9);
    expect(servizio.orbitAt(ssid('cerere'), t, orb)).toBe('ok');
    expect(orb.baricentrici).toBe(false);
    expect(orb.primario).toBe(ssid('sole'));
  });

  it('comete quasi paraboliche al perielio: elementi eliocentrici, come JPL Horizons (CENTER=500@10)', () => {
    // Elementi osculanti eliocentrici di JPL Horizons (eclittica J2000, stesse soluzioni del catalogo) all'istante.
    // Tolleranza su 1/a: 2·v·δv/μ con δv = 0,6 m/s, errore della velocità interpolata (ERRORE_VELOCITA_PICCOLI_KM_S).
    const casi = [
      { slug: 'c1975-v1-west', jd: 2442834.0, e: 1.000017856460529, q: 0.1966006188329814, a: -11010.05535249838 },
      { slug: 'c1995-o1-hale-bopp', jd: 2450540.0, e: 0.9951316160413701, q: 0.9141695067438145, a: 187.7767888711967 },
      { slug: 'c2020-f3-neowise', jd: 2459034.0, e: 0.9991781615704928, q: 0.2946512464915416, a: 358.5269755126186 },
    ];
    for (const c of casi) {
      expect(servizio.orbitAt(ssid(c.slug), c.jd, orb), c.slug).toBe('ok');
      expect(orb.baricentrici, c.slug).toBe(false);
      expect(orb.primario).toBe(ssid('sole'));
      servizio.stateAt(ssid(c.slug), c.jd, st);
      const v = Math.hypot(st[3]!, st[4]!, st[5]!);
      const tolInvA = ((2 * v * 6e-4) / GM_SOLE) * UA_KM;
      const invA = (1 - orb.e) / (orb.q / UA_KM);
      expect(Math.abs(invA - 1 / c.a), c.slug).toBeLessThan(tolInvA);
      expect(orb.e > 1, c.slug).toBe(c.e > 1);
      expect(Math.abs(orb.q / UA_KM - c.q) / c.q, c.slug).toBeLessThan(1e-5);
    }
  });

  it('forma dal file di affidabilità; prima del caricamento resta determinata', () => {
    const s = servizioCompleto(false);
    expect(s.orbitAt(ssid('1p-halley'), 2_000_000.5, orb)).toBe('ok');
    expect(orb.forma).toBe('determinata');
  });
});

// --- Affidabilità (§ 7.8) ---

describe('affidabilità (§ 7.8)', () => {
  const aff = nuovaAff();

  it('Sole preciso; pianeti precisi al 2000; ε_ΔT = ω·σ e nullo con ingresso in TT', () => {
    servizio.affidabilita(ssid('sole'), ts(2_451_545, 1e5), aff);
    expect(aff.livello).toBe('precisa');
    expect(aff.epsTotale).toBe(0);
    servizio.affidabilita(ssid('giove'), ts(2_451_545, 1), aff);
    expect(aff.livello).toBe('precisa');
    const sigma = 103_005;
    servizio.affidabilita(ssid('luna'), ts(T0 + 1000, sigma), aff);
    const omega = servizio.omega(ssid('luna'), T0 + 1000);
    expect(omega).toBeGreaterThan(2.4e-6);
    expect(omega).toBeLessThan(3.0e-6);
    expect(aff.epsDeltaT).toBeCloseTo(omega * sigma, 12);
    expect(aff.epsTotale).toBeCloseTo(Math.hypot(aff.epsModello, aff.epsDeltaT), 12);
    servizio.affidabilita(ssid('luna'), ts(T0 + 1000, sigma, 'TT'), aff);
    expect(aff.epsDeltaT).toBe(0);
    expect(aff.livello).toBe('buona');
  });

  it("Fobos con σ_ṅ e arco di MAR099: mai 'indicativa' dal 1600 al 2120, almeno 'buona' dal 1770 (istante in TT)", () => {
    // Con σ_ṅ dell'ipotesi I12 (3,6 volte l'incertezza di MAR099) era 'indicativa' prima del 1681 e 'approssimata'
    // dal 2088.
    const fobos = ssid('fobos');
    for (let anno = 1600; anno < 2121; anno += 0.25) {
      servizio.affidabilita(fobos, ts(2_451_545 + (anno - 2000) * 365.25, 0, 'TT'), aff);
      const ammessi = anno >= 1770 ? ['precisa', 'buona'] : ['precisa', 'buona', 'approssimata'];
      expect(ammessi, `${anno}`).toContain(aff.livello);
    }
  });

  it("prima di reliability.bin il livello è provvisorio ('buona') e non nasconde i corpi", () => {
    const s = servizioCompleto(false);
    expect(s.affidabilitaDefinitiva()).toBe(false);
    s.affidabilita(ssid('1p-halley'), ts(-100_000.5), aff);
    expect(aff.livello).toBe('buona');
    // pianeti: costante del catalogo, già definitiva
    s.affidabilita(ssid('marte'), ts(2_451_545), aff);
    expect(aff.livello).toBe('precisa');
    s.impostaAffidabilita(affidabilita);
    expect(s.affidabilitaDefinitiva()).toBe(true);
    s.affidabilita(ssid('1p-halley'), ts(-1_000_000.5), aff);
    expect(aff.livello).toBe('non-determinabile');
  });
});

// --- Orientamento dei satelliti sincroni ---

describe('orientamento sincrono dal modello dei satelliti (§ 7.5.5)', () => {
  it('asse x verso il pianeta entro pochi gradi, polo lungo il momento angolare', () => {
    const verso = new Float64Array(3);
    const polo = new Float64Array(3);
    const rel = new Float64Array(6);
    const o = new ServizioOrientamento(catalogo.corpi, {
      sincrono: (s, jd, v, p) => servizio.direzioniSincrone(s, jd, v, p),
    });
    const m = new Float64Array(9);
    for (const slug of ['io', 'titano', 'tritone', 'caronte', 'fobos']) {
      const s = ssid(slug);
      const t = 2_460_000.5;
      expect(servizio.direzioniSincrone(s, t, verso, polo), slug).toBe(true);
      expect(o.bodyFixedToScene(s, t, m)).toBe(true);
      servizio.statoRelativo(s, t, rel);
      const r = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
      // colonna x della matrice: verso il pianeta (meno la posizione planetocentrica)
      const cosx = -(m[0]! * rel[0]! + m[3]! * rel[1]! + m[6]! * rel[2]!) / r;
      expect(cosx, slug).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
      const hx = rel[1]! * rel[5]! - rel[2]! * rel[4]!;
      const hy = rel[2]! * rel[3]! - rel[0]! * rel[5]!;
      const hz = rel[0]! * rel[4]! - rel[1]! * rel[3]!;
      const cosz = (m[2]! * hx + m[5]! * hy + m[8]! * hz) / Math.hypot(hx, hy, hz);
      expect(cosz, slug).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
    }
    expect(servizio.direzioniSincrone(ssid('giove'), 2_460_000.5, verso, polo)).toBe(false);
  });
});

// --- Nessuna allocazione nel percorso per frame (§ 5.4) ---

/** Conta le costruzioni di vettori tipizzati, Array, Map e Set eseguite da fn (costruttori globali sostituiti). */
function contaCostruzioni(fn: () => void): number {
  const nomi = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Uint8Array', 'Uint16Array', 'Array', 'Map', 'Set'] as const;
  const g = globalThis as unknown as Record<string, unknown>;
  const originali = nomi.map((n) => g[n]);
  let conteggio = 0;
  nomi.forEach((n, i) => {
    const C = originali[i] as new (...a: unknown[]) => unknown;
    g[n] = new Proxy(C, {
      construct(t, a, nt) {
        conteggio++;
        return Reflect.construct(t, a, nt) as object;
      },
      apply(t, self, a) {
        conteggio++;
        return Reflect.apply(t as unknown as (...x: unknown[]) => unknown, self, a);
      },
    });
  });
  try {
    fn();
  } finally {
    nomi.forEach((n, i) => {
      g[n] = originali[i];
    });
  }
  return conteggio;
}

describe('nessuna allocazione nel percorso per frame (§ 5.4, RNF1)', () => {
  it('stateAt, affidabilita, orbitAt e orientamenti di tutti i corpi: nessuna costruzione, memoria stabile', async () => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    const s = servizio;
    const ori = new ServizioOrientamento(catalogo.corpi, { sincrono: (x, jd, v, p) => s.direzioniSincrone(x, jd, v, p) });
    const out = new Float64Array(6);
    const m = new Float64Array(9);
    const acc = new Float64Array(1);
    const aff = nuovaAff();
    const orb = nuovaOrbita();
    const tempo = ts(2_460_000.5, 2);
    const n = catalogo.corpi.length;
    const conRaggi = Int32Array.from(catalogo.corpi.filter((c) => c.fisica.raggi_km !== null).map((c) => c.ssid));
    const orbite = Int32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 10, ssid('luna'), ssid('io'), ssid('sedna'), ssid('1p-halley')]);
    const frame = (i: number, jd0 = 2_460_000.5): void => {
      tempo.jdTT = jd0 + i * 0.37;
      tempo.jdUT = tempo.jdTT;
      for (let j = 0; j < n; j++) {
        if (s.stateAt(j, tempo.jdTT, out) === 'ok') acc[0] = acc[0]! + out[0]!;
        s.affidabilita(j, tempo, aff);
      }
      for (let j = 0; j < orbite.length; j++) if (s.orbitAt(orbite[j]!, tempo.jdTT, orb) === 'ok') acc[0] = acc[0]! + orb.q;
      for (let j = 0; j < conRaggi.length; j++) if (ori.orientamento(conRaggi[j]!, tempo, m)) acc[0] = acc[0]! + m[0]!;
    };
    for (let i = 0; i < 6000; i++) frame(i);
    // Contatore: nessun vettore tipizzato, Array, Map o Set creato nei frame (date in tre blocchi diversi).
    const costruzioni = contaCostruzioni(() => {
      for (let i = 0; i < 200; i++) frame(i);
      for (let i = 0; i < 200; i++) frame(i, -1_000_000.5);
      for (let i = 0; i < 200; i++) frame(i, 2_300_000.5);
    });
    expect(costruzioni).toBe(0);
    // Stabilità della memoria: dopo 40 000 frame la memoria trattenuta non cresce.
    gc();
    await new Promise((r) => setTimeout(r, 20));
    const ritenuto0 = process.memoryUsage().heapUsed;
    const FRAME = 2000;
    const inizio = performance.now();
    for (let i = 6000; i < 6000 + FRAME; i++) frame(i);
    const ms = (performance.now() - inizio) / FRAME;
    for (let i = 6000 + FRAME; i < 6000 + 20 * FRAME; i++) frame(i);
    gc();
    await new Promise((r) => setTimeout(r, 20));
    const ritenuto1 = process.memoryUsage().heapUsed;
    expect(Number.isFinite(acc[0]!)).toBe(true);
    expect(ritenuto1 - ritenuto0).toBeLessThan(256 * 1024);
    // RNF1: stati, affidabilità, orbite e orientamenti di tutti i corpi ≤ 4 ms per frame
    expect(ms).toBeLessThan(4);
  });
});
