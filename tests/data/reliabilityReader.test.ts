// reliability.bin (§ 8.7): lettura, griglia a due passi (20 anni fino al 1980,7, poi 1,25 anni), valutazione a gradini
// contro la fixture della pipeline (tests/fixtures/catalogo/affidabilita.json, scripts/pipeline/reliability_pack.py,
// seme 20261024).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ErroreFormato } from '../../src/data/binHeader';
import { istanteNodo, leggiAffidabilita, nodoAffidabilita, valutaAffidabilita } from '../../src/data/reliabilityReader';
import type { ValoreAffidabilita } from '../../src/data/reliabilityReader';
import { T0, T_END } from '../../src/ephem/constants';

interface Caso {
  ssid: number;
  t: number;
  log10eps: number | null;
  flag: number;
  nodo: number;
}

const fixture = JSON.parse(readFileSync(new URL('../fixtures/catalogo/affidabilita.json', import.meta.url), 'utf8')) as {
  sha256: string;
  casi: Caso[];
};
const file = readFileSync(new URL('../../public/data/v1/reliability.bin', import.meta.url));
const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const allineata = createHash('sha256').update(file).digest('hex') === fixture.sha256;

describe('reliability.bin', () => {
  it('griglia e corpi', () => {
    const d = leggiAffidabilita(buf);
    expect([d.t0, d.passo, d.nodi, d.tFine, d.kFine, d.passoFine]).toEqual([T0, 7305, 712, 2_444_494.5, 599, 456.5625]);
    expect(d.perSsid.has(0)).toBe(false);
    expect(d.perSsid.has(3)).toBe(true);
    expect(istanteNodo(d, d.nodi)).toBeGreaterThanOrEqual(T_END);
    expect(istanteNodo(d, d.nodi - 1)).toBe(2_495_629.5);
    expect(nodoAffidabilita(d, T0)).toBe(0);
    expect(nodoAffidabilita(d, T0 + 7305)).toBe(1);
    expect(nodoAffidabilita(d, d.tFine - 1e-6)).toBe(598);
    expect(nodoAffidabilita(d, d.tFine)).toBe(599);
    expect(nodoAffidabilita(d, d.tFine + 456.5625)).toBe(600);
    expect(nodoAffidabilita(d, T_END)).toBe(711);
    expect(nodoAffidabilita(d, T0 - 1)).toBe(-1);
    expect(nodoAffidabilita(d, istanteNodo(d, d.nodi))).toBe(-1);
  });

  it('gradini di 1,25 anni dal 1980,7: la data attuale non prende il valore del 2040', () => {
    const copia = buf.slice(0);
    const d = leggiAffidabilita(copia);
    const s = d.perSsid.get(3)!;
    const v: ValoreAffidabilita = { eps: 0, formaDeterminata: false, datiPresenti: false };
    const oggi = 2_461_333.0; // 19/10/2026
    const j = nodoAffidabilita(d, oggi);
    expect(j).toBe(635);
    expect([istanteNodo(d, j), istanteNodo(d, j + 1)]).toEqual([2_460_930.75, 2_461_387.3125]);
    s.log10eps[j] = -6;
    s.log10eps[j + 1] = -3;
    valutaAffidabilita(d, 3, oggi, v);
    expect(Math.log10(v.eps)).toBeCloseTo(-6, 9);
    valutaAffidabilita(d, 3, istanteNodo(d, j + 1), v);
    expect(Math.log10(v.eps)).toBeCloseTo(-3, 9);
    // parte grossa: intervalli di 20 anni
    s.log10eps[100] = -4;
    valutaAffidabilita(d, 3, istanteNodo(d, 100) + 0.99 * d.passo, v);
    expect(Math.log10(v.eps)).toBeCloseTo(-4, 9);
  });

  it.skipIf(!allineata)('valori uguali alla pipeline', () => {
    const d = leggiAffidabilita(buf);
    const v: ValoreAffidabilita = { eps: 0, formaDeterminata: false, datiPresenti: false };
    for (const c of fixture.casi) {
      expect(nodoAffidabilita(d, c.t)).toBe(c.nodo);
      expect(valutaAffidabilita(d, c.ssid, c.t, v)).toBe(true);
      if (c.log10eps === null) expect(v.eps).toBeNaN();
      else expect(Math.log10(v.eps)).toBeCloseTo(c.log10eps, 5);
      expect(v.formaDeterminata).toBe((c.flag & 1) !== 0);
      expect(v.datiPresenti).toBe((c.flag & 2) !== 0);
    }
  });

  it('pianeti a 2″ costanti; corpi assenti; fuori griglia', () => {
    const d = leggiAffidabilita(buf);
    const v: ValoreAffidabilita = { eps: 0, formaDeterminata: false, datiPresenti: false };
    expect(valutaAffidabilita(d, 4, 0, v)).toBe(true);
    expect(v.eps * 206264.806).toBeCloseTo(2, 4);
    expect(valutaAffidabilita(d, 0, 0, v)).toBe(false);
    expect(valutaAffidabilita(d, 4, T0 - 10, v)).toBe(true);
    expect(v.eps).toBeNaN();
    expect(v.datiPresenti).toBe(false);
  });

  it('rifiuta file non conformi', () => {
    expect(() => leggiAffidabilita(buf.slice(0, buf.byteLength - 8))).toThrow(ErroreFormato);
    const a = new Uint8Array(buf.slice(0));
    new DataView(a.buffer).setUint32(64 + 16, 600, true);
    expect(() => leggiAffidabilita(a.buffer)).toThrow(ErroreFormato);
    const b = new Uint8Array(buf.slice(0));
    new DataView(b.buffer).setUint16(64 + 40 + 2, 1, true);
    expect(() => leggiAffidabilita(b.buffer)).toThrow(ErroreFormato);
    // t_fine fuori dalla griglia dei nodi grossi
    const c = new Uint8Array(buf.slice(0));
    new DataView(c.buffer).setFloat64(64 + 24, 2_415_275.5, true);
    expect(() => leggiAffidabilita(c.buffer)).toThrow(ErroreFormato);
  });
});
