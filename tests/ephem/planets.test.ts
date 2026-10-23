// Pianeti, Plutone ed EMB dai file public/data/v1/planets/pKK.bin: criterio A4 contro DE441
// (fixture tests/fixtures/planets/, generate da scripts/pipeline/planets.py), continuità ai confini,
// esiti, congiunzione Giove-Saturno del 21/12/2020 (A9).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiLuna } from '../../src/data/moonReader';
import { bloccoDi, fineBlocco, inizioBlocco } from '../../src/data/binHeader';
import { valutaSegmento } from '../../src/data/serie';
import { K, T0, T_END } from '../../src/ephem/constants';
import { EffemeridiLuna, statoTerra } from '../../src/ephem/moon';
import { EffemeridiPianeti, NAIF_PER_SSID_FILE, SSID_FILE_PIANETI, percorsoBloccoPianeti } from '../../src/ephem/planets';

const RAD_ARCSEC = 648000 / Math.PI;
const DATI = new URL('../../public/data/v1/', import.meta.url);
const FIXTURE = new URL('../fixtures/planets/', import.meta.url);

interface MetaPianeti {
  seme: number;
  righe: number;
  colonne: string[];
  sha256: string;
  sha256File: Record<string, string>;
  soglie: { arcsec: number; embKmBlocchi11e12: number; embKmAltri: number; continuitaKm: number };
}

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

function sha256(url: URL): string {
  return createHash('sha256').update(readFileSync(url)).digest('hex');
}

const meta = JSON.parse(readFileSync(new URL('pianeti.json', FIXTURE), 'utf-8')) as MetaPianeti;
const tabella = new Float64Array(buffer(new URL('pianeti-de441.bin', FIXTURE)));
const NCOL = 8;

function caricaPianeti(): EffemeridiPianeti {
  const p = new EffemeridiPianeti();
  for (let k = 0; k < K; k++) expect(p.carica(buffer(new URL(percorsoBloccoPianeti(k), DATI)))).toBe(k);
  return p;
}

const pianeti = caricaPianeti();

describe('file dei pianeti (§ 8.3)', () => {
  it('SHA-256 dei 13 file uguali a quelli della fixture', () => {
    for (let k = 0; k < K; k++) {
      const nome = percorsoBloccoPianeti(k).slice('planets/'.length);
      expect(sha256(new URL(percorsoBloccoPianeti(k), DATI))).toBe(meta.sha256File[nome]);
    }
    expect(createHash('sha256').update(new Uint8Array(tabella.buffer)).digest('hex')).toBe(meta.sha256);
    expect(tabella.length).toBe(meta.righe * NCOL);
  });

  it('esiti: fuori copertura, caricamento, corpo assente', () => {
    const out = new Float64Array(6).fill(7);
    expect(pianeti.stato(5, T0 - 1, out)).toBe('fuori-copertura');
    expect(pianeti.stato(5, T_END, out)).toBe('fuori-copertura');
    expect(pianeti.stato(3, 2451545, out)).toBe('non-determinabile');
    expect(out.every((x) => x === 7)).toBe(true);
    const parziale = new EffemeridiPianeti();
    parziale.carica(buffer(new URL(percorsoBloccoPianeti(12), DATI)));
    expect(parziale.stato(5, 2451545, out)).toBe('caricamento');
    expect(parziale.pronto(2451545)).toBe(false);
    expect(parziale.stato(5, 2460000.5, out)).toBe('ok');
    parziale.rimuovi(12);
    expect(parziale.stato(5, 2460000.5, out)).toBe('caricamento');
    expect(() => percorsoBloccoPianeti(13)).toThrow(RangeError);
    expect(percorsoBloccoPianeti(3)).toBe('planets/p03.bin');
    expect(NAIF_PER_SSID_FILE[SSID_FILE_PIANETI.plutone]).toBe(9);
    expect(NAIF_PER_SSID_FILE[SSID_FILE_PIANETI.baricentroTerraLuna]).toBe(3);
  });
});

describe('A4: pianeti contro DE441', () => {
  const out = new Float64Array(6);
  const massimi = new Map<number, { arcsec: number; km: number; kmModerni: number }>();
  let maxPipeline = 0;
  for (let r = 0; r < meta.righe; r++) {
    const o = r * NCOL;
    const ssid = tabella[o]!;
    const t = tabella[o + 1]!;
    expect(pianeti.stato(ssid, t, out)).toBe('ok');
    let dr2 = 0;
    let dp2 = 0;
    let r2 = 0;
    for (let i = 0; i < 3; i++) {
      const rif = tabella[o + 2 + i]!;
      dr2 += (out[i]! - rif) ** 2;
      dp2 += (out[i]! - tabella[o + 5 + i]!) ** 2;
      r2 += rif * rif;
    }
    const km = Math.sqrt(dr2);
    maxPipeline = Math.max(maxPipeline, Math.sqrt(dp2 / r2));
    const m = massimi.get(ssid) ?? { arcsec: 0, km: 0, kmModerni: 0 };
    m.arcsec = Math.max(m.arcsec, (km / Math.sqrt(r2)) * RAD_ARCSEC);
    if (bloccoDi(t) >= 11) m.kmModerni = Math.max(m.kmModerni, km);
    else m.km = Math.max(m.km, km);
    massimi.set(ssid, m);
  }

  it('runtime uguale alla valutazione Python (errore relativo ≤ 1e-12)', () => {
    expect(maxPipeline).toBeLessThan(1e-12);
  });

  it('|Δr|/r ≤ 2″ per ogni corpo su 2000 epoche uniformi e attorno ai confini', () => {
    expect(massimi.size).toBe(9);
    for (const [ssid, m] of massimi) {
      expect(m.arcsec, `ssid ${ssid}`).toBeLessThanOrEqual(meta.soglie.arcsec);
    }
  });

  it('EMB: ≤ 100 km nei blocchi 11-12, ≤ 250 km altrove', () => {
    const m = massimi.get(SSID_FILE_PIANETI.baricentroTerraLuna)!;
    expect(m.kmModerni).toBeLessThanOrEqual(meta.soglie.embKmBlocchi11e12);
    expect(m.km).toBeLessThanOrEqual(meta.soglie.embKmAltri);
  });

  it('continuità ai confini dei blocchi < 1 km', () => {
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    let massimo = 0;
    for (const ssid of Object.values(SSID_FILE_PIANETI)) {
      for (let k = 1; k < K; k++) {
        const tb = inizioBlocco(k);
        expect(fineBlocco(k - 1)).toBe(tb);
        expect(pianeti.stato(ssid, tb, b)).toBe('ok');
        // il blocco k-1 valutato al proprio confine finale (fuori dal nucleo, stencil completo)
        valutaSegmento(pianeti.serie(k - 1)!.segmenti(ssid)![0]!, tb, a);
        massimo = Math.max(massimo, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!));
      }
    }
    expect(massimo).toBeLessThan(meta.soglie.continuitaKm);
  });
});

describe('A9: congiunzione Giove-Saturno del 21/12/2020', () => {
  it('separazione geocentrica minima 6,1′ ± 0,5′ tra le 12 e le 24 UT', () => {
    // ΔT = 32,184 s + (TAI - UTC = 37 s) - (UT1 - UTC = -0,1783 s, IERS EOP 20 C04 del 21/12/2020).
    const DELTA_T = 69.362;
    const luna = new EffemeridiLuna(leggiLuna(buffer(new URL('moon.bin', DATI))));
    const jdUt0 = 2459204.5; // 2020-12-21 00:00 UT
    const emb = new Float64Array(6);
    const geo = new Float64Array(6);
    const terra = new Float64Array(6);
    const giove = new Float64Array(6);
    const saturno = new Float64Array(6);
    let minimo = Number.POSITIVE_INFINITY;
    let tMin = 0;
    for (let m = 0; m <= 1440; m++) {
      const jdTT = jdUt0 + m / 1440 + DELTA_T / 86400;
      expect(pianeti.stato(SSID_FILE_PIANETI.baricentroTerraLuna, jdTT, emb)).toBe('ok');
      expect(luna.statoGeocentrico(jdTT, geo)).toBe('ok');
      statoTerra(emb, geo, terra);
      pianeti.stato(SSID_FILE_PIANETI.giove, jdTT, giove);
      pianeti.stato(SSID_FILE_PIANETI.saturno, jdTT, saturno);
      const gx = giove[0]! - terra[0]!;
      const gy = giove[1]! - terra[1]!;
      const gz = giove[2]! - terra[2]!;
      const sx = saturno[0]! - terra[0]!;
      const sy = saturno[1]! - terra[1]!;
      const sz = saturno[2]! - terra[2]!;
      const cx = gy * sz - gz * sy;
      const cy = gz * sx - gx * sz;
      const cz = gx * sy - gy * sx;
      const sep = Math.atan2(Math.hypot(cx, cy, cz), gx * sx + gy * sy + gz * sz) * RAD_ARCSEC;
      if (sep < minimo) {
        minimo = sep;
        tMin = m;
      }
    }
    expect(minimo / 60).toBeGreaterThanOrEqual(6.1 - 0.5);
    expect(minimo / 60).toBeLessThanOrEqual(6.1 + 0.5);
    expect(tMin).toBeGreaterThanOrEqual(12 * 60);
    expect(tMin).toBeLessThanOrEqual(24 * 60);
  });
});
