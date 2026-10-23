// Nota della scheda sulla rotazione terrestre indeterminata (§ 6.5, § 7.7): con l'istante in TT l'ora
// UT1 = TT - ΔT è incerta di σ(ΔT); con l'istante in UT l'angolo di rotazione è fissato e la nota non compare.

import { expect, test } from '@playwright/test';
import { apri, attendiQuiete, chiudiBenvenuto, impostaJd, soloProgetto, tempo } from './aiuti';

soloProgetto('desktop');

test('1° gennaio 5000 a.C. 12:00: nota sulla rotazione con l\'istante in TT, non in UT', async ({ page }) => {
  await apri(page);
  await chiudiBenvenuto(page);
  await impostaJd(page, -104_826); // 1° gennaio 5000 a.C. 12:00 UT, σ(ΔT) = 7,1 h
  await page.evaluate(() => window.__ssTest!.seleziona('terra'));
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Terra');
  const espandi = page.locator('.ss-scheda button[aria-controls]').first();
  if ((await espandi.getAttribute('aria-expanded')) !== 'true') await espandi.click();
  await attendiQuiete(page);
  const scheda = page.locator('.ss-scheda');
  await scheda.locator('summary', { hasText: 'Fonte e affidabilità' }).click();
  const nota = scheda.locator('.ss-nota--ambra', { hasText: 'rotazione terrestre è indeterminata' });
  const erroreDeltaT = scheda.locator('.ss-dati > div', { hasText: 'Errore da ΔT' });

  await expect(erroreDeltaT).not.toContainText("l'istante è in TT");
  await expect(scheda.locator('.ss-aff-frase')).toBeVisible();
  await expect(nota).toHaveCount(0);
  const ut = await tempo(page);

  await page.locator('.ss-data').click();
  await page.getByText('Opzioni avanzate', { exact: true }).click();
  await page.getByLabel("Inserisci l'istante in TT").check();
  await page.keyboard.press('Escape');
  await attendiQuiete(page);
  expect((await tempo(page)).jdUT).toBe(ut.jdUT);
  await expect(erroreDeltaT).toContainText("l'istante è in TT");
  await expect(nota).toHaveCount(1);
});
