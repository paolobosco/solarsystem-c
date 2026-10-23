// Eventi noti calcolati attraverso l'applicazione (§ 13, A9): data impostata nello store come dalla console,
// stati letti dal servizio delle effemeridi dell'applicazione (window.__ssTest.getState), ΔT dell'applicazione.
// - Congiunzione Giove-Saturno del 21/12/2020: minimo della separazione geocentrica 6,1′ ± 0,5′ tra le 12 e
//   le 24 UT;
// - Apophis, 13/04/2029: distanza minima dal centro della Terra e istante entro 500 km e 10 min da JPL CNEOS
//   (soluzione JPL#220: JD 2 462 240,407092 TDB, 38 011,5 km; https://cneos.jpl.nasa.gov/ca/);
// - novilunio dell'08/04/2024: congiunzione geocentrica in longitudine eclittica della data alle 18:21 UT ± 3 min;
// - indicatore della stagione (§ 11.4.3) attorno all'equinozio del 20/03/2024 03:06 UT (USNO,
//   https://aa.usno.navy.mil/api/seasons?year=2024) e riga ΔT (§ 6.5) dopo l'ultimo valore IERS e con la S15.2020.
// Posizioni geometriche (I6).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { calendarToJd } from '../src/time/calendar';
import { eclitticaDataAJ2000, epocaGiuliana } from '../src/time/precession';
import {
  GRADI,
  angolo,
  apri,
  attendiQuiete,
  chiudiBenvenuto,
  differenza,
  distanza,
  impostaJd,
  schermata,
  stati,
  tempo,
  verificaPulita,
} from './aiuti';

const jdUT = (anno: number, mese: number, giorno: number, ora: number, minuto = 0): number =>
  calendarToJd({ anno, mese, giorno, ora, minuto, secondo: 0, calendario: 'gregoriano' });

/** Minimo di f su [a, b] per sezione aurea (f unimodale nell'intervallo). */
async function minimo(f: (x: number) => Promise<number>, a: number, b: number, tolleranza: number): Promise<{ x: number; y: number }> {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = await f(c);
  let fd = await f(d);
  while (b - a > tolleranza) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = await f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = await f(d);
    }
  }
  const x = 0.5 * (a + b);
  return { x, y: await f(x) };
}

/** Stati di più corpi alla data UT indicata, impostata nell'applicazione. */
async function statiA(page: Page, jd: number, slug: string[]) {
  await impostaJd(page, jd);
  const s = await stati(page, slug);
  for (const x of slug) expect(s[x]!.stato, `${x} a JD ${jd}`).toBe('ok');
  return s;
}

test.describe('A9: eventi noti attraverso l\'applicazione', () => {
  test('congiunzione Giove-Saturno del 21/12/2020: 6,1′ ± 0,5′ tra le 12 e le 24 UT', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const separazione = async (jd: number): Promise<number> => {
      const s = await statiA(page, jd, ['terra', 'giove', 'saturno']);
      return angolo(differenza(s['giove']!.r, s['terra']!.r), differenza(s['saturno']!.r, s['terra']!.r)) * GRADI * 60;
    };
    const m = await minimo(separazione, jdUT(2020, 12, 21, 12), jdUT(2020, 12, 22, 0), 1 / 1440);
    const ore = (m.x - jdUT(2020, 12, 21, 0)) * 24;
    test.info().annotations.push({ type: 'Giove-Saturno', description: `minimo ${m.y.toFixed(3)}′ alle ${Math.floor(ore)}:${String(Math.round((ore % 1) * 60)).padStart(2, '0')} UT` });
    expect(Math.abs(m.y - 6.1)).toBeLessThanOrEqual(0.5);
    expect(ore).toBeGreaterThanOrEqual(12);
    expect(ore).toBeLessThanOrEqual(24);
    await expect(page.locator('.ss-data-testo')).toHaveText('21 dicembre 2020');
    await page.evaluate(() => window.__ssTest!.focus('giove'));
    await schermata(page, 'eventi-01-giove-saturno');
    verificaPulita(a);
  });

  test('Apophis 13/04/2029: distanza minima dalla Terra e istante contro JPL CNEOS', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const CNEOS_JD_TDB = 2_462_240.407092;
    const CNEOS_KM = 38_011.5;
    await impostaJd(page, CNEOS_JD_TDB);
    const dT = (await tempo(page)).deltaT / 86_400;
    const dist = async (jd: number): Promise<number> => {
      const s = await statiA(page, jd, ['terra', 'apophis']);
      return distanza(s['apophis']!.r, s['terra']!.r);
    };
    const centro = CNEOS_JD_TDB - dT;
    const m = await minimo(dist, centro - 0.25, centro + 0.25, 2 / 86_400);
    const t = await tempo(page);
    const scartoMin = (t.jdTT - CNEOS_JD_TDB) * 1440;
    test.info().annotations.push({
      type: 'Apophis',
      description: `distanza minima ${m.y.toFixed(1)} km (${(m.y - CNEOS_KM).toFixed(1)} km), istante TT ${t.jdTT.toFixed(6)} (${scartoMin.toFixed(2)} min)`,
    });
    expect(Math.abs(m.y - CNEOS_KM)).toBeLessThanOrEqual(500);
    expect(Math.abs(scartoMin)).toBeLessThanOrEqual(10);
    await expect(page.locator('.ss-data-testo')).toHaveText('13 aprile 2029');
    await page.evaluate(() => window.__ssTest!.seleziona('apophis'));
    await page.evaluate(() => window.__ssTest!.focus('terra'));
    await schermata(page, 'eventi-02-apophis');
    verificaPulita(a);
  });

  test('novilunio dell\'08/04/2024: congiunzione in longitudine eclittica della data alle 18:21 UT ± 3 min', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const m = new Float64Array(9);
    const longitudineData = (v: number[], jdTT: number): number => {
      eclitticaDataAJ2000(epocaGiuliana(jdTT), m);
      // Matrice eclittica della data → J2000 per righe: si applica la trasposta.
      const x = m[0]! * v[0]! + m[3]! * v[1]! + m[6]! * v[2]!;
      const y = m[1]! * v[0]! + m[4]! * v[1]! + m[7]! * v[2]!;
      return Math.atan2(y, x);
    };
    const differenzaLon = async (jd: number): Promise<number> => {
      const s = await statiA(page, jd, ['sole', 'terra', 'luna']);
      const jdTT = (await tempo(page)).jdTT;
      const lL = longitudineData(differenza(s['luna']!.r, s['terra']!.r), jdTT);
      const lS = longitudineData(differenza(s['sole']!.r, s['terra']!.r), jdTT);
      return Math.atan2(Math.sin(lL - lS), Math.cos(lL - lS));
    };
    let x0 = jdUT(2024, 4, 8, 16);
    let x1 = jdUT(2024, 4, 8, 21);
    let f0 = await differenzaLon(x0);
    const f1 = await differenzaLon(x1);
    expect(f0).toBeLessThan(0);
    expect(f1).toBeGreaterThan(0);
    while (x1 - x0 > 1 / 86_400) {
      const xm = 0.5 * (x0 + x1);
      const fm = await differenzaLon(xm);
      if (fm < 0 === f0 < 0) {
        x0 = xm;
        f0 = fm;
      } else x1 = xm;
    }
    const scarto = (0.5 * (x0 + x1) - jdUT(2024, 4, 8, 18, 21)) * 1440;
    test.info().annotations.push({ type: 'novilunio', description: `congiunzione ${scarto.toFixed(2)} min dalle 18:21 UT` });
    expect(Math.abs(scarto)).toBeLessThanOrEqual(3);
    await expect(page.locator('.ss-data-testo')).toHaveText('8 aprile 2024');
    await page.evaluate(() => window.__ssTest!.focus('terra'));
    await schermata(page, 'eventi-03-novilunio');
    verificaPulita(a);
  });

  test('stagione attorno all\'equinozio USNO del 20/03/2024 03:06 UT; riga ΔT con σ del § 6.5', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const stagione = async (jd: number): Promise<string> => {
      await impostaJd(page, jd);
      await attendiQuiete(page);
      return ((await page.locator('.ss-stagione').textContent()) ?? '').trim();
    };
    // l'inverno 2023-2024 dura 88 d 23 h 39 min (USNO: solstizio 22/12/2023 03:27 UT): mai 89 giorni
    expect(await stagione(jdUT(2024, 3, 20, 2, 40))).toBe('Inverno boreale, 88 giorni dopo il solstizio');
    expect(await stagione(jdUT(2024, 3, 20, 3, 5))).toBe('Inverno boreale, 88 giorni dopo il solstizio');
    // 0 giorni interi: le 24 h dall'istante coprono anche il 21 marzo, quindi niente "giorno dell'equinozio"
    expect(await stagione(jdUT(2024, 3, 20, 3, 7))).toBe("Primavera boreale, meno di un giorno dopo l'equinozio");
    expect(await stagione(jdUT(2024, 3, 21, 0, 30))).toBe("Primavera boreale, meno di un giorno dopo l'equinozio");
    expect(await stagione(jdUT(2024, 3, 21, 3, 5))).toBe("Primavera boreale, meno di un giorno dopo l'equinozio");
    expect(await stagione(jdUT(2024, 3, 21, 3, 8))).toBe("Primavera boreale, 1 giorno dopo l'equinozio");
    // 19/10/2026 0h UT: 25 d 23 h 55 min dopo l'equinozio del 23/09/2026 00:05 UT
    expect(await stagione(jdUT(2026, 10, 19, 0))).toBe("Autunno boreale, 25 giorni dopo l'equinozio");
    // 31 d dopo l'ultimo valore C04: deriva da LOD 0,017 s, non 0,002 s (IERS Rapid Service: ΔT = 69,223 s)
    await expect(page.locator('.ss-deltat')).toContainText(/69,19 ± 0,02\s?s/);
    await impostaJd(page, jdUT(2000, 1, 1, 0));
    await attendiQuiete(page);
    await expect(page.locator('.ss-deltat')).toContainText(/63,81 ± 0,11\s?s/);
    // 1964: scarto della S15.2020 da C04 nel 1962-1971, 0,45 s (IERS: ΔT = 35,38 s)
    await impostaJd(page, jdUT(1964, 6, 10, 0));
    await attendiQuiete(page);
    await expect(page.locator('.ss-deltat')).toContainText(/34,70 ± 0,45\s?s/);
    verificaPulita(a);
  });
});
