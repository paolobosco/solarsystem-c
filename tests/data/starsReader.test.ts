// stars.bin (§ 8.8): lettura, verifiche, direzioni alla data contro la fixture della pipeline
// (tests/fixtures/catalogo/stelle.json, scripts/pipeline/stars.py, seme 20261023).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ErroreFormato } from '../../src/data/binHeader';
import { FLAG_LINEARE_ANGOLARE, FLAG_MOTO_3D, direzioneStella, fornitoreStelle, leggiStelle } from '../../src/data/starsReader';
import type { DataStore } from '../../src/data/types';
import { GIORNI_ANNO_GIULIANO, J2000 } from '../../src/ephem/constants';
import { rgbCorpoNero, temperaturaDaBV } from '../../src/render/stars';

interface FixtureStelle {
  seme: number;
  numero: number;
  sha256: string;
  epoche: number[];
  stelle: { indice: number; hr: number; flag: number; direzioni: number[][] }[];
  colori: { bv: number; temperatura: number; rgbLineare: number[] }[];
}

const fixture = JSON.parse(readFileSync(new URL('../fixtures/catalogo/stelle.json', import.meta.url), 'utf8')) as FixtureStelle;
const file = readFileSync(new URL('../../public/data/v1/stars.bin', import.meta.url));
const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const hashFile = createHash('sha256').update(file).digest('hex');

describe('stars.bin', () => {
  it('lettura e contenuto', () => {
    const s = leggiStelle(buf);
    expect(s.numero).toBe(9096);
    expect(new Set(s.hr).size).toBe(9096);
    let n3d = 0;
    let nAng = 0;
    for (let i = 0; i < s.numero; i++) {
      if (s.flag[i] === FLAG_MOTO_3D) n3d++;
      if (s.flag[i] === FLAG_LINEARE_ANGOLARE) nAng++;
    }
    expect(n3d).toBeGreaterThan(8000);
    expect(n3d + nAng).toBe(9096);
  });

  it.skipIf(hashFile !== fixture.sha256)('direzioni alla data uguali alla pipeline', () => {
    const s = leggiStelle(buf);
    const out = new Float64Array(3);
    let max = 0;
    for (const st of fixture.stelle) {
      expect(s.hr[st.indice]).toBe(st.hr);
      fixture.epoche.forEach((t, k) => {
        direzioneStella(s, st.indice, (t - J2000) / GIORNI_ANNO_GIULIANO, out);
        const e = st.direzioni[k]!;
        max = Math.max(max, Math.hypot(out[0]! - e[0]!, out[1]! - e[1]!, out[2]! - e[2]!));
      });
    }
    expect(max).toBeLessThan(1e-12);
  });

  it('Arturo si sposta di circa 2,28″/anno', () => {
    const s = leggiStelle(buf);
    const i = s.hr.indexOf(5340);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    direzioneStella(s, i, 0, a);
    direzioneStella(s, i, 100, b);
    const sep = Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)) * 206264.806;
    expect(sep / 100).toBeCloseTo(2.28, 1);
  });

  it('rifiuta file non conformi', () => {
    const corto = buf.slice(0, buf.byteLength - 40);
    expect(() => leggiStelle(corto)).toThrow(ErroreFormato);
    const alterato = new Uint8Array(buf.slice(0));
    new DataView(alterato.buffer).setUint8(64 + 39, 7);
    expect(() => leggiStelle(alterato.buffer)).toThrow(ErroreFormato);
    const nonUnitario = new Uint8Array(buf.slice(0));
    new DataView(nonUnitario.buffer).setFloat32(64, 2, true);
    expect(() => leggiStelle(nonUnitario.buffer)).toThrow(ErroreFormato);
  });

  it('fornitore per il rendering', async () => {
    const store: DataStore = {
      stato: () => 'pronto',
      carica: async (k) => {
        expect(k).toBe('stars.bin');
        return buf;
      },
      rilascia: () => undefined,
      onCambio: () => () => undefined,
    };
    const s = await fornitoreStelle(store).carica(new AbortController().signal);
    expect(s.numero).toBe(9096);
  });
});

describe('colore delle stelle', () => {
  it('temperatura da B-V uguale alla pipeline (Ballesteros 2012)', () => {
    for (const c of fixture.colori) expect(temperaturaDaBV(c.bv)).toBeCloseTo(c.temperatura, 6);
  });

  it('approssimazione analitica CIE 1931 del rendering contro le funzioni tabulate CIE (scarto registrato)', () => {
    let max = 0;
    const rgb = [0, 0, 0];
    for (const c of fixture.colori) {
      rgbCorpoNero(c.temperatura, rgb);
      for (let k = 0; k < 3; k++) max = Math.max(max, Math.abs(rgb[k]! - c.rgbLineare[k]!));
    }
    // valore misurato: docs/_parti/catalogo.md
    expect(max).toBeLessThan(0.01);
  });
});
