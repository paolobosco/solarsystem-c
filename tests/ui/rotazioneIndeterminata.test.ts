// Nota della scheda sulla rotazione terrestre indeterminata (§ 6.5, § 7.7): con l'istante in TT l'ora
// UT1 = TT - ΔT è incerta di σ(ΔT) e l'angolo ERA(UT1) di 15°/h·σ; con l'istante in UT l'ERA è fissato.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo, CorpoCatalogo } from '../../src/data/catalogTypes';
import { leggiTimeDaBuffer } from '../../src/data/timeReader';
import { ServizioEffemeridi } from '../../src/ephem/service';
import { calendarToJd } from '../../src/time/calendar';
import { creaMakeTimeState } from '../../src/time/timescale';
import { CalcolatoreScheda } from '../../src/ui/datiScheda';

const DATI = new URL('../../public/data/v1/', import.meta.url);

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

const catalogo: Catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
// Senza blocchi né affidabilità: la nota dipende solo dal corpo e dal TimeState.
const servizio = new ServizioEffemeridi({ catalogo });
const calc = new CalcolatoreScheda(servizio, catalogo.corpi);
const mts = creaMakeTimeState(leggiTimeDaBuffer(buffer(new URL('time.json', DATI))).deltaT);
const corpo = (slug: string): CorpoCatalogo => catalogo.corpi.find((c) => c.slug === slug)!;
const mezzogiorno = (anno: number): number => calendarToJd({ anno, mese: 1, giorno: 1, ora: 12, minuto: 0, secondo: 0, calendario: 'giuliano' });

describe('rotazione terrestre indeterminata (§ 7.7)', () => {
  for (const anno of [-4999, -9999]) {
    it(`1° gennaio ${1 - anno} a.C. 12:00 UT: nessuna nota in UT, nota per lo stesso istante in TT`, () => {
      const ut = mts(mezzogiorno(anno), 'UT');
      const tt = mts(ut.jdTT, 'TT');
      expect(Math.abs(tt.jdUT - ut.jdUT) * 86_400).toBeLessThan(1e-3);
      expect(ut.deltaTSigma).toBeGreaterThan(21_600);
      expect(calc.calcola(corpo('terra'), ut).rotazioneIndeterminata).toBe(false);
      expect(calc.calcola(corpo('terra'), tt).rotazioneIndeterminata).toBe(true);
    });
  }

  it('in TT nessuna nota sotto la soglia (anno -4593, 2000) né per corpi diversi dalla Terra', () => {
    expect(calc.calcola(corpo('terra'), mts(mezzogiorno(-4593), 'TT')).rotazioneIndeterminata).toBe(false);
    expect(calc.calcola(corpo('terra'), mts(2_451_545, 'TT')).rotazioneIndeterminata).toBe(false);
    expect(calc.calcola(corpo('luna'), mts(mezzogiorno(-9999), 'TT')).rotazioneIndeterminata).toBe(false);
  });
});
