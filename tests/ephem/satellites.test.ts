// Satelliti dai file public/data/v1/sats/sKK.bin (§ 7.5, § 8.5) e centri dei pianeti (§ 7.3.5): criterio A6
// contro i kernel SPK (fixture tests/fixtures/sats/, generate da scripts/pipeline/satellites.py),
// uguaglianza con la valutazione Python, raccordi, esiti, lettore e orbite.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ErroreFormato, fineBlocco, inizioBlocco } from '../../src/data/binHeader';
import { leggiCatalogo } from '../../src/data/catalog';
import type { CoefficientiWgccre } from '../../src/data/catalogTypes';
import { FileSatelliti, leggiSatelliti } from '../../src/data/satsReader';
import { K, T0, T_END } from '../../src/ephem/constants';
import { puntoSuConica } from '../../src/ephem/equinoctial';
import { JD_WGCCRE_INIZIO, matriceWgccre } from '../../src/ephem/orientation';
import { EffemeridiSatelliti, configDaCatalogo, percorsoBloccoSatelliti } from '../../src/ephem/satellites';
import type { ConfigSatellite } from '../../src/ephem/satellites';
import type { ElementiOrbita } from '../../src/ephem/types';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const FIXTURE = new URL('../fixtures/sats/', import.meta.url);
const RAD_ARCSEC = 648000 / Math.PI;

interface ConfigFixture extends ConfigSatellite {
  slug: string;
  tolleranzaGradi: number;
  /** Errore radiale ammesso, frazione di a: 1 % (§ 7.5.6). */
  tolleranzaRadiale: number;
}

interface Meta {
  seme: number;
  colonne: string[];
  righe: number;
  colonneCentri: string[];
  righeCentri: number;
  sha256: string;
  sha256Centri: string;
  sha256File: Record<string, string>;
  configurazioni: ConfigFixture[];
  soglie: { radialeFrazioneA: number; centriKmDovePrecisi: number; precisaRad: number };
}

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

const meta = JSON.parse(readFileSync(new URL('satelliti.json', FIXTURE), 'utf-8')) as Meta;
const tab = new Float64Array(buffer(new URL('satelliti.bin', FIXTURE)));
const tabC = new Float64Array(buffer(new URL('centri.bin', FIXTURE)));
const NC = meta.colonne.length;
const NCC = meta.colonneCentri.length;
const config = new Map(meta.configurazioni.map((c) => [c.ssid, c]));

function carica(): EffemeridiSatelliti {
  const e = new EffemeridiSatelliti(meta.configurazioni);
  for (let k = 0; k < K; k++) expect(e.carica(buffer(new URL(percorsoBloccoSatelliti(k), DATI)))).toBe(k);
  return e;
}

const eff = carica();

function angolo(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const cx = a[1]! * b[2]! - a[2]! * b[1]!;
  const cy = a[2]! * b[0]! - a[0]! * b[2]!;
  const cz = a[0]! * b[1]! - a[1]! * b[0]!;
  return Math.atan2(Math.hypot(cx, cy, cz), a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!);
}

describe('file dei satelliti (§ 8.5)', () => {
  it('SHA-256 dei 13 file e delle fixture', () => {
    for (let k = 0; k < K; k++) {
      const nome = percorsoBloccoSatelliti(k).slice('sats/'.length);
      const h = createHash('sha256').update(readFileSync(new URL(percorsoBloccoSatelliti(k), DATI))).digest('hex');
      expect(h).toBe(meta.sha256File[nome]);
    }
    expect(createHash('sha256').update(new Uint8Array(tab.buffer)).digest('hex')).toBe(meta.sha256);
    expect(createHash('sha256').update(new Uint8Array(tabC.buffer)).digest('hex')).toBe(meta.sha256Centri);
    expect(tab.length).toBe(meta.righe * NC);
    expect(tabC.length).toBe(meta.righeCentri * NCC);
  });

  it('ogni blocco contiene tutti i satelliti con record che coprono il nucleo', () => {
    for (let k = 0; k < K; k++) {
      const f = eff.file(k)!;
      expect(f.intestazione.inizio).toBe(inizioBlocco(k));
      expect(f.intestazione.fine).toBe(fineBlocco(k));
      for (const c of meta.configurazioni) {
        expect(f.contiene(c.ssid)).toBe(true);
        expect(f.indiceRecord(c.ssid, inizioBlocco(k))).toBeGreaterThanOrEqual(0);
        expect(f.indiceRecord(c.ssid, fineBlocco(k) - 1e-6)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('il lettore rifiuta file non conformi', () => {
    // blocco 12: il primo satellite ha più record (serve alla prova di contiguità)
    const buf = buffer(new URL(percorsoBloccoSatelliti(12), DATI));
    const casi: [number, (v: DataView) => void][] = [
      [0, (v) => v.setUint8(0, 0x41)],
      [1, (v) => v.setUint32(44, v.getUint32(44, true) + 8, true)],
      [2, (v) => v.setUint16(64, 0xffff, true)],
    ];
    for (const [, altera] of casi) {
      const b = buf.slice(0);
      altera(new DataView(b));
      expect(() => leggiSatelliti(b)).toThrow(ErroreFormato);
    }
    // riservato del primo record del primo satellite
    const b = buf.slice(0);
    const v = new DataView(b);
    const off = v.getUint32(64 + 4, true);
    v.setUint32(off + 4, 1, true);
    expect(() => leggiSatelliti(b)).toThrow(ErroreFormato);
    // K oltre 6
    const b2 = buf.slice(0);
    new DataView(b2).setUint16(off + 2, 7, true);
    expect(() => leggiSatelliti(b2)).toThrow(ErroreFormato);
    // record non contigui: t_fine del primo record alterato
    const b3 = buf.slice(0);
    const v3 = new DataView(b3);
    v3.setFloat64(off + 16, v3.getFloat64(off + 16, true) + 1, true);
    expect(() => leggiSatelliti(b3)).toThrow(ErroreFormato);
    expect(leggiSatelliti(buf)).toBeInstanceOf(FileSatelliti);
  });
});

describe('stati planetocentrici (§ 7.5)', () => {
  const out = new Float64Array(6);

  it('uguali alla valutazione Python (posizioni ≤ 1e-6 km relativi, velocità ≤ 1e-9 km/s relativi)', () => {
    let maxP = 0;
    let maxV = 0;
    for (let r = 0; r < meta.righe; r++) {
      const o = r * NC;
      const ssid = tab[o]!;
      const t = tab[o + 1]!;
      expect(eff.statoPlanetocentrico(ssid, t, out)).toBe('ok');
      const rr = Math.hypot(tab[o + 2]!, tab[o + 3]!, tab[o + 4]!);
      const vv = Math.hypot(tab[o + 5]!, tab[o + 6]!, tab[o + 7]!);
      for (let i = 0; i < 3; i++) {
        maxP = Math.max(maxP, Math.abs(out[i]! - tab[o + 2 + i]!) / rr);
        maxV = Math.max(maxV, Math.abs(out[i + 3]! - tab[o + 5 + i]!) / vv);
      }
    }
    expect(maxP).toBeLessThan(1e-12);
    expect(maxV).toBeLessThan(1e-9);
  });

  it('A6: soglie del § 7.5.6 contro i kernel (angolo e raggio)', () => {
    const peggiori = new Map<number, number>();
    for (let r = 0; r < meta.righe; r++) {
      const o = r * NC;
      if (Number.isNaN(tab[o + 8]!)) continue;
      const ssid = tab[o]!;
      const c = config.get(ssid)!;
      expect(eff.statoPlanetocentrico(ssid, tab[o + 1]!, out)).toBe('ok');
      const vero = [tab[o + 8]!, tab[o + 9]!, tab[o + 10]!];
      const ang = angolo(out, vero);
      const rad = Math.abs(Math.hypot(out[0]!, out[1]!, out[2]!) - Math.hypot(vero[0]!, vero[1]!, vero[2]!));
      expect(ang, c.slug).toBeLessThanOrEqual((c.tolleranzaGradi * Math.PI) / 180);
      expect(rad / Math.hypot(vero[0]!, vero[1]!, vero[2]!), c.slug).toBeLessThanOrEqual(c.tolleranzaRadiale);
      peggiori.set(ssid, Math.max(peggiori.get(ssid) ?? 0, ang * RAD_ARCSEC));
    }
    expect(peggiori.size).toBe(meta.configurazioni.length);
  });

  it('continuità ai confini dei record (raccordo C1)', () => {
    // a cavallo del confine: posizione prevista con la velocità (km/s) su dt = 1e-6 d
    const dt = 1e-6;
    let n = 0;
    for (const c of meta.configurazioni) {
      const f = eff.file(12)!;
      const recs = f.record(c.ssid)!;
      for (let j = 1; j < recs.length; j++) {
        const tb = recs[j]!.valori[0]!;
        if (!(tb > inizioBlocco(12) + 1 && tb < fineBlocco(12) - 1)) continue;
        const a = new Float64Array(6);
        const b = new Float64Array(6);
        const ta = tb - dt;
        const passo = tb - ta; // intervallo effettivo (JD in doppia precisione)
        expect(eff.statoPlanetocentrico(c.ssid, ta, a)).toBe('ok');
        expect(eff.statoPlanetocentrico(c.ssid, tb, b)).toBe('ok');
        const r = Math.hypot(b[0]!, b[1]!, b[2]!);
        const v = Math.hypot(b[3]!, b[4]!, b[5]!);
        let d = 0;
        let dv = 0;
        for (let i = 0; i < 3; i++) {
          d = Math.max(d, Math.abs(a[i]! + a[i + 3]! * passo * 86400 - b[i]!));
          dv = Math.max(dv, Math.abs(a[i + 3]! - b[i + 3]!));
        }
        expect(d / r, c.slug).toBeLessThan(1e-9);
        // la velocità cambia solo per l'accelerazione orbitale μ/r² ≤ v²/(r·(1 - e)), senza salti
        expect(dv / v, c.slug).toBeLessThan(10 * (v / r) * passo * 86400 + 1e-9);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it('esiti: fuori copertura, caricamento, non determinabile', () => {
    const c = meta.configurazioni[0]!;
    expect(eff.statoPlanetocentrico(c.ssid, T0 - 1, out)).toBe('fuori-copertura');
    expect(eff.statoPlanetocentrico(c.ssid, T_END, out)).toBe('fuori-copertura');
    expect(eff.statoPlanetocentrico(9999, 2451545, out)).toBe('non-determinabile');
    const vuoto = new EffemeridiSatelliti(meta.configurazioni);
    expect(vuoto.statoPlanetocentrico(c.ssid, 2451545, out)).toBe('caricamento');
    expect(vuoto.pronto(2451545)).toBe(false);
    expect(eff.pronto(2451545)).toBe(true);
    // out non modificato se l'esito non è 'ok'
    out.fill(7);
    vuoto.statoPlanetocentrico(c.ssid, 2451545, out);
    expect([...out]).toEqual([7, 7, 7, 7, 7, 7]);
  });
});

describe('prestazioni (RNF1)', () => {
  it('stato di tutti i satelliti e centri dei pianeti per frame in pochi microsecondi', () => {
    const out = new Float64Array(6);
    const n = 2000;
    let acc = 0;
    const inizio = performance.now();
    for (let i = 0; i < n; i++) {
      const t = 2451545 + i * 0.37;
      for (const c of meta.configurazioni) {
        eff.statoPlanetocentrico(c.ssid, t, out);
        acc += out[0]!;
      }
      for (const p of [4, 5, 6, 7, 8, 10]) {
        eff.planetCenterOffset(p, t, out);
        acc += out[0]!;
      }
    }
    const usPerFrame = ((performance.now() - inizio) * 1000) / n;
    expect(Number.isFinite(acc)).toBe(true);
    expect(usPerFrame).toBeLessThan(1000);
  });
});

describe('centri dei pianeti (§ 7.3.5)', () => {
  const out = new Float64Array(6);

  it('uguali alla formula Python e entro 5 km dai segmenti SPK dove i satelliti sono precisi', () => {
    let maxPy = 0;
    let maxPrecisi = 0;
    let nPrecisi = 0;
    for (let r = 0; r < meta.righeCentri; r++) {
      const o = r * NCC;
      expect(eff.planetCenterOffset(tabC[o]!, tabC[o + 1]!, out)).toBe('ok');
      for (let i = 0; i < 3; i++) maxPy = Math.max(maxPy, Math.abs(out[i]! - tabC[o + 2 + i]!));
      if (tabC[o + 11]! <= meta.soglie.precisaRad) {
        nPrecisi++;
        const d = Math.hypot(out[0]! - tabC[o + 8]!, out[1]! - tabC[o + 9]!, out[2]! - tabC[o + 10]!);
        maxPrecisi = Math.max(maxPrecisi, d);
      }
    }
    expect(maxPy).toBeLessThan(1e-9);
    expect(nPrecisi).toBeGreaterThan(0);
    expect(maxPrecisi).toBeLessThanOrEqual(meta.soglie.centriKmDovePrecisi);
  });

  it('corpi senza satelliti nel catalogo o senza GM di sistema (Eris): scarto nullo', () => {
    expect(eff.planetCenterOffset(1, 2451545, out)).toBe('ok');
    expect([...out]).toEqual([0, 0, 0, 0, 0, 0]);
    const eris = meta.configurazioni.find((c) => c.slug === 'disnomia')!.primario;
    out.fill(1);
    expect(eff.planetCenterOffset(eris, 2451545, out)).toBe('ok');
    expect([...out]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(eff.planetCenterOffset(1, T0 - 1, out)).toBe('fuori-copertura');
  });
});

describe('orbite (§ 10.2)', () => {
  it('il corpo sta sulla conica di orbitAt (fuori dai raccordi)', () => {
    const el: ElementiOrbita = {
      primario: 0,
      baricentrici: false,
      q: 0,
      e: 0,
      i: 0,
      nodo: 0,
      argPeri: 0,
      anomaliaVera: 0,
      forma: 'non-determinata',
    };
    const st = new Float64Array(6);
    const p = new Float64Array(3);
    for (const c of meta.configurazioni) {
      for (const t of [2451545.0, 2440000.5, -1000000.5]) {
        const f = eff.file(Math.max(0, Math.min(K - 1, Math.floor((t - T0) / 365568))))!;
        const j = f.indiceRecord(c.ssid, t);
        const r = f.record(c.ssid)![j]!;
        const l = r.valori[1]! - r.valori[0]!;
        // istante lontano dai confini del record
        const tm = Math.min(Math.max(t, r.valori[0]! + 0.2 * l), r.valori[1]! - 0.2 * l);
        expect(eff.orbitAt(c.ssid, tm, el)).toBe('ok');
        expect(el.primario).toBe(c.primario);
        expect(eff.statoPlanetocentrico(c.ssid, tm, st)).toBe('ok');
        const a = el.q / (1 - el.e);
        puntoSuConica(el, el.anomaliaVera, p);
        if (c.baricentrico) continue; // la conica è attorno al baricentro del sistema
        const d = Math.hypot(p[0]! - st[0]!, p[1]! - st[1]!, p[2]! - st[2]!);
        expect(d / a, c.slug).toBeLessThan(1e-9);
      }
    }
  });
});

describe('piano secolare dei satelliti regolari (§ 7.5.4)', () => {
  // Catalogo reale: i satelliti con pianoSegueEquatore ruotano F con il polo WGCCRE del primario nei record secolari.
  const catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
  const perSlug = new Map(catalogo.corpi.map((c) => [c.slug, c]));
  const effCat = new EffemeridiSatelliti(configDaCatalogo(catalogo));
  for (let k = 0; k < K; k++) effCat.aggiungi(eff.file(k)!);
  const m = new Float64Array(9);
  const st = new Float64Array(6);
  const h = new Float64Array(3);

  /** Polo del primario (asse z del modello WGCCRE, come lo orienta la scena) nell'eclittica J2000. */
  function polo(c: CoefficientiWgccre, jd: number): Float64Array {
    matriceWgccre(c, jd, m);
    return Float64Array.of(m[2]!, m[5]!, m[8]!);
  }

  /** Angolo (gradi) tra il polo dell'orbita osculante r × v e l'asse del primario, senza verso (Urano retrogrado). */
  function scarto(ssid: number, jd: number, c: CoefficientiWgccre): number {
    expect(effCat.statoPlanetocentrico(ssid, jd, st)).toBe('ok');
    h[0] = st[1]! * st[5]! - st[2]! * st[4]!;
    h[1] = st[2]! * st[3]! - st[0]! * st[5]!;
    h[2] = st[0]! * st[4]! - st[1]! * st[3]!;
    const a = (angolo(h, polo(c, jd)) * 180) / Math.PI;
    return Math.min(a, 180 - a);
  }

  const regolari = catalogo.corpi.filter((c) => c.effemeridi.modello === 'satellite' && c.effemeridi.pianoSegueEquatore === true);

  it('22 satelliti regolari seguono l’equatore; esclusi irregolari, Giapeto, Tritone, Proteo e Disnomia', () => {
    expect(regolari.length).toBe(22);
    for (const slug of ['imalia', 'febe', 'nereide', 'giapeto', 'tritone', 'proteo', 'disnomia']) {
      const e = perSlug.get(slug)!.effemeridi;
      expect(e.modello === 'satellite' && e.pianoSegueEquatore === true, slug).toBe(false);
    }
  });

  it('nel 10000 a.C. Fobos e Deimos restano vicini all’equatore di Marte, Encelado e Dione al piano degli anelli', () => {
    const marte = perSlug.get('marte')!.orientamento.coefficienti!;
    const saturno = perSlug.get('saturno')!.orientamento.coefficienti!;
    const jd = -1_931_000;
    // Prima della correzione: 10,7° e 9,0° (Fobos, Deimos), 0,67° e 0,66° (Encelado, Dione).
    expect(scarto(perSlug.get('fobos')!.ssid, jd, marte)).toBeLessThan(1.5);
    expect(scarto(perSlug.get('deimos')!.ssid, jd, marte)).toBeLessThan(1.5);
    expect(scarto(perSlug.get('encelado')!.ssid, jd, saturno)).toBeLessThan(0.15);
    expect(scarto(perSlug.get('dione')!.ssid, jd, saturno)).toBeLessThan(0.15);
  });

  it('nei record secolari lo scarto dall’equatore non supera quello nella finestra dei kernel (+0,15°)', () => {
    for (const c of regolari) {
      const e = c.effemeridi;
      if (e.modello !== 'satellite') continue;
      const coeff = perSlug.get(c.primario!)!.orientamento.coefficienti!;
      const sec = e.fonti.find((f) => f.tipo === 'secolare')!;
      let maxSec = 0;
      let maxFin = 0;
      const n = 200;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.37) / n;
        maxSec = Math.max(maxSec, scarto(c.ssid, sec.inizio + x * (sec.fine - sec.inizio), coeff));
        const a = Math.max(sec.fine, JD_WGCCRE_INIZIO);
        maxFin = Math.max(maxFin, scarto(c.ssid, a + x * (T_END - a), coeff));
      }
      expect(maxSec, c.slug).toBeLessThanOrEqual(maxFin + 0.15);
    }
  });

  it('F alla data: Q(t)·R_F nei record secolari, angolo costante dal polo del primario, R_F altrove', () => {
    const mf = new Float64Array(9);
    for (const c of regolari) {
      const e = c.effemeridi;
      if (e.modello !== 'satellite') continue;
      const coeff = perSlug.get(c.primario!)!.orientamento.coefficienti!;
      const sec = e.fonti.find((f) => f.tipo === 'secolare')!;
      const tj = sec.fine;
      const zF = Float64Array.of(e.rF[2]!, e.rF[5]!, e.rF[8]!);
      const atteso = angolo(zF, polo(coeff, tj));
      for (const t of [T0 + 1, 0.5 * (T0 + tj), tj - 1]) {
        expect(effCat.matriceF(c.ssid, t, mf)).toBe(true);
        const z = Float64Array.of(mf[2]!, mf[5]!, mf[8]!);
        expect(Math.abs(angolo(z, polo(coeff, t)) - atteso), c.slug).toBeLessThan(1e-9);
        // ortonormale
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const d = mf[i]! * mf[j]! + mf[3 + i]! * mf[3 + j]! + mf[6 + i]! * mf[6 + j]!;
            expect(Math.abs(d - (i === j ? 1 : 0))).toBeLessThan(1e-12);
          }
        }
      }
      expect(effCat.matriceF(c.ssid, tj + 1, mf)).toBe(true);
      expect([...mf]).toEqual([...e.rF]);
    }
    // F fisso per Tritone anche nel record secolare
    const tritone = perSlug.get('tritone')!;
    const et = tritone.effemeridi;
    expect(effCat.matriceF(tritone.ssid, -1_000_000, mf)).toBe(true);
    if (et.modello === 'satellite') expect([...mf]).toEqual([...et.rF]);
  });

  it('continuità alla giunzione con i record da SPK (Q = I)', () => {
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    for (const c of regolari) {
      const e = c.effemeridi;
      if (e.modello !== 'satellite') continue;
      const tj = e.fonti.find((f) => f.tipo === 'secolare')!.fine;
      const dt = 1e-6;
      expect(effCat.statoPlanetocentrico(c.ssid, tj - dt, a)).toBe('ok');
      expect(effCat.statoPlanetocentrico(c.ssid, tj, b)).toBe('ok');
      const r = Math.hypot(b[0]!, b[1]!, b[2]!);
      let d = 0;
      for (let i = 0; i < 3; i++) d = Math.max(d, Math.abs(a[i]! + a[i + 3]! * (tj - (tj - dt)) * 86400 - b[i]!));
      expect(d / r, c.slug).toBeLessThan(1e-9);
    }
  });
});
