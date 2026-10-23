// Scheda, caratteristiche fisiche e nomi: valori e fonti adottati nel catalogo (§ 4.3, § 9 di docs/PROGETTO.md).

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { apri, attendiQuiete, cerca, chiudiBenvenuto } from './aiuti';

async function scheda(page: Page, slug: string): Promise<void> {
  await page.evaluate((s) => window.__ssTest!.seleziona(s), slug);
  await attendiQuiete(page);
  const espandi = page.getByRole('button', { name: 'Espandi la scheda' });
  if (await espandi.isVisible()) await espandi.click();
  await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>('.ss-scheda details').forEach((d) => (d.open = true)));
}

function voce(page: Page, termine: string): Locator {
  return page.locator('.ss-scheda .ss-voce', { has: page.locator('dt', { hasText: termine }) }).locator('dd');
}

test('caratteristiche fisiche dalle fonti adottate; nome ufficiale di C/1680 V1', async ({ page }) => {
  await apri(page);
  await chiudiBenvenuto(page);

  await scheda(page, 'eris');
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/15,78\d*\s?d/);
  await expect(voce(page, 'Periodo di rotazione')).toContainText('Szakáts et al. 2023');

  await scheda(page, 'haumea');
  await expect(voce(page, 'GM')).toContainText('267,4');
  await expect(voce(page, 'GM')).toContainText('Ragozzine e Brown 2009');

  await scheda(page, 'febe');
  await expect(voce(page, 'Periodo di rotazione')).toContainText('9,27398');

  await scheda(page, '19p-borrelly');
  await expect(voce(page, 'Raggio medio')).toContainText(/^2,4\s?km/);
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^26,642\s?h/);

  await scheda(page, '67p-churyumov-gerasimenko');
  await expect(voce(page, 'Periodo di rotazione')).toContainText('12,4041');

  await scheda(page, 'toutatis');
  await expect(voce(page, 'Semiassi')).toContainText(/^2,13\d* × 1,015\d* × 0,85\d*/);

  await scheda(page, 'tritone');
  await expect(voce(page, 'GM')).toContainText('(soluzione NEP098, JPL SSD (2026))');
  await expect(voce(page, 'Periodo di rotazione')).not.toContainText('§');

  await cerca(page, 'Grande cometa del 1680');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('C/1680 V1');
});

test('Disnomia: raggio di Brown e Butler 2023; comete con numerale d\u2019uso: nome ufficiale dell\u2019MPC', async ({ page }) => {
  await apri(page);
  await chiudiBenvenuto(page);

  await scheda(page, 'disnomia');
  await expect(voce(page, 'Raggio medio')).toContainText(/^308\s?±\s?30\s?km/);
  await expect(voce(page, 'Raggio medio')).toContainText('Brown, M. E., Butler, B. J. (2023)');
  await expect(voce(page, 'Raggio medio')).toContainText('diametro 615 +60/-50 km');
  await expect(voce(page, 'Raggio medio')).not.toContainText('2018');
  await expect(page.locator('.ss-scheda .ss-voce dt', { hasText: 'Albedo' })).toHaveCount(0);

  for (const [slug, nome, ufficiale] of [
    ['9p-tempel-1', '9P/Tempel 1', '9P/Tempel'],
    ['29p-schwassmann-wachmann-1', '29P/Schwassmann-Wachmann 1', '29P/Schwassmann-Wachmann'],
    ['81p-wild-2', '81P/Wild 2', '81P/Wild'],
    ['103p-hartley-2', '103P/Hartley 2', '103P/Hartley'],
  ] as const) {
    await scheda(page, slug);
    await expect(page.locator('.ss-scheda-nome'), slug).toHaveText(nome);
    await expect(page.locator('.ss-scheda-ufficiale'), slug).toContainText(`Nome ufficiale: ${ufficiale}`);
  }
  await scheda(page, '1p-halley');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('1P/Halley');
  await expect(page.locator('.ss-scheda-ufficiale')).not.toContainText('Nome ufficiale');

  // la ricerca trova la cometa con il nome ufficiale e con la forma d'uso
  for (const testo of ['9P/Tempel', 'Tempel 1']) {
    await cerca(page, testo);
    await expect(page.locator('.ss-scheda-nome'), testo).toHaveText('9P/Tempel 1');
  }
});

test('dati fisici delle fonti più recenti: verso della rotazione con polo noto, periodi, masse e incertezze', async ({ page }) => {
  await apri(page);
  await chiudiBenvenuto(page);

  for (const slug of ['itokawa', 'febe']) {
    await scheda(page, slug);
    await expect(voce(page, 'Periodo di rotazione'), slug).toContainText('(retrograda)');
  }
  await expect(voce(page, 'GM')).toContainText(/^0,5548\s?±\s?0,0011/);

  await scheda(page, 'salacia');
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^5,49403\s?±\s?0,00016\s?giorni/);
  await expect(voce(page, 'Periodo di rotazione')).toContainText('Collyer et al. 2025');

  await scheda(page, 'chariklo');
  await expect(voce(page, 'Semiassi')).toContainText(/^143,8 × 135,2 × 99,1\s?km/);

  await scheda(page, 'proteo');
  await expect(voce(page, 'GM')).toContainText(/^2,6\s?±\s?2,4\s?km³\/s²/);

  await scheda(page, 'nereide');
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^11,594\s?±\s?0,017\s?h/);

  await scheda(page, 'orco');
  await expect(voce(page, 'GM')).toContainText(/^42,182\s?±\s?0,067/);

  await scheda(page, 'urano');
  await expect(voce(page, 'GM')).toContainText('soluzione URA182');
});

test('albedo in banda V, occultazioni, verso dai poli SBDB e di letteratura, nomi MPC', async ({ page }) => {
  await apri(page);
  await chiudiBenvenuto(page);

  await scheda(page, 'plutone');
  await expect(voce(page, 'Albedo geometrica')).toContainText(/^0,52\d*\s?±\s?0,03/);
  await expect(voce(page, 'Albedo geometrica')).toContainText('Buratti et al. 2015');
  await scheda(page, 'terra');
  await expect(voce(page, 'Albedo geometrica')).toContainText(/^0,434/);

  await scheda(page, 'issione');
  await expect(voce(page, 'Raggio medio')).toContainText(/^348,\d\s?±\s?5,\d\s?km/);
  await expect(voce(page, 'Albedo geometrica')).toContainText(/^0,1060?\s?±\s?0,0030?/);
  await scheda(page, 'gonggong');
  await expect(voce(page, 'Albedo geometrica')).toContainText(/^0,14\d*\s?±\s?0,01/);
  await scheda(page, 'c1996-b2-hyakutake');
  await expect(voce(page, 'Raggio medio')).toContainText('Harmon et al. 1997');

  for (const slug of ['bennu', 'ryugu', 'didymos', 'arrokoth', 'hektor']) {
    await scheda(page, slug);
    await expect(voce(page, 'Periodo di rotazione'), slug).toContainText('(retrograda)');
  }

  await scheda(page, 'mani');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Máni');
  await cerca(page, '1930 BM');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Plutone');
});

test('periodi a doppio picco, troiani binari, raggi di pck00011, incertezza del GM di Plutone, fonti senza refusi', async ({ page }) => {
  await apri(page);
  await chiudiBenvenuto(page);

  await scheda(page, 'quaoar');
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^17,6788\s?h/);
  await expect(voce(page, 'Periodo di rotazione')).toContainText('Ortiz et al. 2003');
  await scheda(page, 'gonggong');
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^44,81\s?±\s?0,37\s?h/);

  await scheda(page, 'patroclus');
  await expect(voce(page, 'Semiassi')).toContainText(/^63,5 × 58,5 × 49\s?km/);
  await expect(voce(page, 'Semiassi')).toContainText('Buie et al. 2015');
  await expect(voce(page, 'GM')).toContainText(/^0,0941\s?±\s?0,0019/);
  await scheda(page, 'hektor');
  await expect(voce(page, 'GM')).toContainText(/^0,527\s?±\s?0,093/);
  await expect(voce(page, 'Raggio medio')).toContainText(/^125\s?±\s?13\s?km/);
  await expect(voce(page, 'Raggio medio')).toContainText('Marchis et al. 2014');
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^6,92051\s?h/);
  // l'albedo SBDB (TRIAD, 0,025) non è coerente con il diametro di Marchis et al. 2014: non nota
  await expect(voce(page, 'Albedo geometrica')).toContainText('non noto');
  await scheda(page, 'eurybates');
  await expect(voce(page, 'GM')).toContainText(/^0,01008\s?±\s?0,00020/);

  await scheda(page, 'mathilde');
  await expect(voce(page, 'Semiassi')).toContainText(/^33 × 24 × 23\s?km/);
  await scheda(page, '81p-wild-2');
  await expect(voce(page, 'Semiassi')).toContainText(/^2,7 × 1,9 × 1,5\s?km/);

  await scheda(page, 'plutone');
  await expect(voce(page, 'GM')).toContainText(/^869,33\s?±\s?0,40/);

  await scheda(page, 'chiron');
  await expect(voce(page, 'Albedo geometrica')).toContainText(/^0,167\s?±\s?0,037/);
  await scheda(page, 'chariklo');
  await expect(voce(page, 'Albedo geometrica')).toContainText(/^0,035\s?±\s?0,010/);

  await scheda(page, 'itokawa');
  await expect(voce(page, 'GM')).toContainText('(massa 3,51·10¹⁰ kg)');

  // modelli di forma al posto dei diametri radiometrici SBDB superati; albedo legate a quei diametri non mostrate
  await scheda(page, 'igea');
  await expect(voce(page, 'Raggio medio')).toContainText(/^217,0\s?±\s?7,0\s?km/);
  await expect(voce(page, 'Raggio medio')).toContainText('Vernazza et al. 2020');
  await expect(voce(page, 'Albedo geometrica')).toContainText('non noto');
  await scheda(page, 'interamnia');
  await expect(voce(page, 'Raggio medio')).toContainText(/^166,0\s?±\s?3,0\s?km/);
  await expect(voce(page, 'Periodo di rotazione')).toContainText(/^8,71234\s?h/);
  await expect(voce(page, 'Periodo di rotazione')).toContainText('Hanuš et al. 2020');
  await expect(voce(page, 'Albedo geometrica')).toContainText('non noto');
  await scheda(page, 'sylvia');
  await expect(voce(page, 'Raggio medio')).toContainText(/^136,5\s?±\s?1,7\s?km/);
  await expect(voce(page, 'Raggio medio')).toContainText('Berthier et al. 2014');
  await expect(voce(page, 'Albedo geometrica')).toContainText('non noto');
});
