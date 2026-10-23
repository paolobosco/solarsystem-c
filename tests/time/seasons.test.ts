// Stagione astronomica (§ 11.4.3): longitudine apparente del Sole e nutazione IAU 2000B contro la pipeline
// (pyerfa), stima kepleriana dei giorni dall'evento contro gli eventi trovati con DE441, e solstizio del 20/06/2024
// 20:51 UT (A9): massimo della declinazione geometrica del Sole sull'equatore medio della data.

import { describe, expect, it } from 'vitest';
import { calendarToJd } from '../../src/time/calendar';
import { epocaGiuliana } from '../../src/time/precession';
import { nutazioneLongitudine } from '../../src/time/nutation';
import { declinazioneSole, longitudineSole, obliquitaMedia, stagioneAstronomica } from '../../src/time/seasons';
import { creaMakeTimeState } from '../../src/time/timescale';
import { GRADI, datiTempo, fixture } from './datiTempo';

interface FixtureStagioni {
  seme: number;
  casi: {
    jdTT: number;
    stato: number[];
    quadrante: number;
    longitudine: number;
    giorniDopo: number;
    giorniDopoStima: number;
    nutazione: number;
  }[];
}

interface FixtureSole {
  solstizio: { istanteAttesoUT: number; tempiTT: number[]; stati: number[][] };
}

const st = fixture<FixtureStagioni>('stagioni.json');
const sol = fixture<FixtureSole>('sole.json').solstizio;
const mts = creaMakeTimeState(datiTempo().deltaT);
const CODICI = ['primavera', 'estate', 'autunno', 'inverno'];
const EVENTI = ['equinozio', 'solstizio', 'equinozio', 'solstizio'];

describe('stagione astronomica', () => {
  it('quadrante, codici e longitudine uguali alla pipeline su 200 epoche', () => {
    expect(st.casi).toHaveLength(200);
    for (const c of st.casi) {
      const s = stagioneAstronomica(c.stato, c.jdTT);
      expect(s.quadrante).toBe(c.quadrante);
      expect(s.stagione).toBe(CODICI[c.quadrante]);
      expect(s.evento).toBe(EVENTI[c.quadrante]);
      expect(Math.abs(s.longitudineSole - c.longitudine)).toBeLessThan(1e-12);
      expect(longitudineSole(c.stato, c.jdTT)).toBe(s.longitudineSole);
    }
  });

  it('nutazione in longitudine uguale a pyerfa nut00b (IAU 2000B)', () => {
    let max = 0;
    for (const c of st.casi) max = Math.max(max, Math.abs(nutazioneLongitudine(c.jdTT) - c.nutazione));
    expect(max).toBeLessThan(1e-15);
    // ampiezza del termine principale: 17,2″
    for (const c of st.casi) expect(Math.abs(c.nutazione) * GRADI * 3600).toBeLessThan(19);
  });

  it('senza stati all\'istante dell\'evento: stima kepleriana uguale alla pipeline, entro 0,1 d dai valori DE441', () => {
    let max = 0;
    for (const c of st.casi) {
      const s = stagioneAstronomica(c.stato, c.jdTT);
      expect(s.eventoRisolto).toBe(false);
      expect(Math.abs(s.giorniDopoEsatti - c.giorniDopoStima)).toBeLessThan(1e-9);
      max = Math.max(max, Math.abs(s.giorniDopoEsatti - c.giorniDopo));
      expect(s.giorniDopo).toBe(Math.floor(s.giorniDopoEsatti));
      expect(s.giorniDopo).toBeGreaterThanOrEqual(0);
      expect(s.giorniDopoEsatti).toBeLessThan(95);
      expect(s.istanteEvento).toBe(c.jdTT - s.giorniDopoEsatti);
    }
    expect(max).toBeLessThanOrEqual(0.1);
  });

  it('con un fornitore senza dati resta la stima kepleriana', () => {
    const c = st.casi[0]!;
    const s = stagioneAstronomica(c.stato, c.jdTT, () => false);
    expect(s.eventoRisolto).toBe(false);
    expect(s.giorniDopoEsatti).toBe(stagioneAstronomica(c.stato, c.jdTT).giorniDopoEsatti);
  });

  it('obliquità media della data: 24,149° a -10000 (§ 7.7)', () => {
    expect(obliquitaMedia(-10000) * GRADI).toBeCloseTo(24.149, 3);
  });

  it('richiede posizione e velocità', () => {
    expect(() => stagioneAstronomica([1, 0, 0], 2451545)).toThrow(RangeError);
  });
});

describe('solstizio del 20/06/2024 (A9)', () => {
  const attesoUT = calendarToJd({ anno: 2024, mese: 6, giorno: 20, ora: 20, minuto: 51, secondo: 0, calendario: 'gregoriano' });

  it('istante atteso della fixture', () => {
    expect(sol.istanteAttesoUT).toBeCloseTo(attesoUT, 9);
  });

  it('massimo della declinazione entro ±1 h e pari all\'obliquità media della data ± 0,01°', () => {
    const t = sol.tempiTT;
    const dec = sol.stati.map((s, i) => declinazioneSole(s, t[i]!));
    let i = 0;
    for (let k = 1; k < dec.length; k++) if (dec[k]! > dec[i]!) i = k;
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(dec.length - 1);
    const y0 = dec[i - 1]!;
    const y1 = dec[i]!;
    const y2 = dec[i + 1]!;
    const f = (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2);
    const tMaxTT = t[i]! + f * (t[i + 1]! - t[i]!);
    const decMax = y1 - 0.25 * (y0 - y2) * f;
    const tMaxUT = mts(tMaxTT, 'TT').jdUT;
    expect(Math.abs(tMaxUT - attesoUT) * 24).toBeLessThanOrEqual(1);
    const eps = obliquitaMedia(epocaGiuliana(tMaxTT));
    expect(Math.abs(decMax - eps) * GRADI).toBeLessThanOrEqual(0.01);
    expect(eps * GRADI).toBeCloseTo(23.436, 3);
  });

  it('passaggio dalla primavera all\'estate entro ±1 h', () => {
    const t = sol.tempiTT;
    let passaggio = -1;
    for (let k = 1; k < t.length; k++) {
      const a = stagioneAstronomica(sol.stati[k - 1]!, t[k - 1]!);
      const b = stagioneAstronomica(sol.stati[k]!, t[k]!);
      if (a.stagione === 'primavera' && b.stagione === 'estate') {
        passaggio = k;
        expect(a.giorniDopo).toBe(92);
        expect(b.evento).toBe('solstizio');
        expect(b.giorniDopoEsatti).toBeLessThan(15 / 1440 + 1e-6);
      }
    }
    expect(passaggio).toBeGreaterThan(0);
    const tUT = mts(t[passaggio]!, 'TT').jdUT;
    expect(Math.abs(tUT - attesoUT) * 24).toBeLessThanOrEqual(1);
  });
});
