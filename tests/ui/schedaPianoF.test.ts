// Elementi dei satelliti nella scheda, nel sistema F alla data (§ 7.5.4): lontano dai kernel il piano di riferimento
// segue l'equatore del primario disegnato dalla scena, quindi l'inclinazione mostrata è quella sull'equatore.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bloccoDi } from '../../src/data/binHeader';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo, CorpoCatalogo } from '../../src/data/catalogTypes';
import { percorsoBlocco } from '../../src/data/manifest';
import { leggiLuna } from '../../src/data/moonReader';
import { matriceWgccre } from '../../src/ephem/orientation';
import { ServizioEffemeridi, TIPI_BLOCCO } from '../../src/ephem/service';
import type { TimeState } from '../../src/time/types';
import { CalcolatoreScheda } from '../../src/ui/datiScheda';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const GRADI = 180 / Math.PI;

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

const catalogo: Catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
const corpo = (slug: string): CorpoCatalogo => catalogo.corpi.find((c) => c.slug === slug)!;
const istanteTT = (jd: number): TimeState => ({ jdUT: jd, jdTT: jd, deltaT: 0, deltaTSigma: 0, scalaIngresso: 'TT' });

describe('scheda dei satelliti: piano F alla data (§ 7.5.4)', () => {
  it('nel 10000 a.C. l’inclinazione di Fobos e Deimos è riferita all’equatore di Marte disegnato', () => {
    const jd = -1_931_000;
    const servizio = new ServizioEffemeridi({ catalogo, affidabilita: null });
    servizio.impostaLuna(leggiLuna(buffer(new URL('moon.bin', DATI))));
    const k = bloccoDi(jd);
    for (const t of TIPI_BLOCCO) servizio.registraBlocco(t, k, buffer(new URL(percorsoBlocco(t, k), DATI)));
    const calc = new CalcolatoreScheda(servizio, catalogo.corpi);
    const m = new Float64Array(9);
    matriceWgccre(corpo('marte').orientamento.coefficienti!, jd, m);
    const polo = [m[2]!, m[5]!, m[8]!];
    const rm = new Float64Array(6);
    const rs = new Float64Array(6);
    expect(servizio.stateAt(corpo('marte').ssid, jd, rm)).toBe('ok');
    // Scarto massimo tra il polo di F alla data e il polo di Marte (alla giunzione con MAR099, 1599): 0,33° e 0,94°.
    for (const [slug, limite] of [
      ['fobos', 0.4],
      ['deimos', 1.0],
    ] as const) {
      const el = calc.calcola(corpo(slug), istanteTT(jd)).elementi!;
      expect(el.riferimento).toBe('planetocentrici-F');
      expect(servizio.stateAt(corpo(slug).ssid, jd, rs)).toBe('ok');
      const r = [rs[0]! - rm[0]!, rs[1]! - rm[1]!, rs[2]! - rm[2]!];
      const v = [rs[3]! - rm[3]!, rs[4]! - rm[4]!, rs[5]! - rm[5]!];
      const h = [r[1]! * v[2]! - r[2]! * v[1]!, r[2]! * v[0]! - r[0]! * v[2]!, r[0]! * v[1]! - r[1]! * v[0]!];
      const c = (h[0]! * polo[0]! + h[1]! * polo[1]! + h[2]! * polo[2]!) / Math.hypot(h[0]!, h[1]!, h[2]!);
      const sullEquatore = Math.acos(Math.min(1, Math.max(-1, c))) * GRADI;
      // Con F fisso: i = 1,1° e 1,3° nella scheda, ma 10,7° e 9,0° sull'equatore disegnato.
      expect(Math.abs(el.i * GRADI - sullEquatore), slug).toBeLessThan(limite);
      expect(sullEquatore, slug).toBeLessThan(2);
    }
  });
});
