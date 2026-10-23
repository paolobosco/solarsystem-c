// Console temporale sull'applicazione reale: giorno della settimana e riga del gregoriano prolettico della data mostrata
// quando la mezzanotte si raggiunge con passi di ora (§ 6.1 T2 e T4, § 11.4.1). La somma di 1/24 al JD non è esatta:
// l'istante resta qualche µs sotto la mezzanotte, mostrata come 00:00 del giorno dopo.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { apri, attendiQuiete, impostaJd, tempo } from './aiuti';

/** 21 ottobre 2026 e 15 ottobre 1582, 00:00 UT. */
const JD_21_10_2026 = 2_461_334.5;
const JD_15_10_1582 = 2_299_160.5;

async function dueOreAvanti(page: Page): Promise<void> {
  const avanti = page.getByRole('button', { name: "Avanti di un'ora" });
  await avanti.click();
  await avanti.click();
  await attendiQuiete(page);
}

test('mezzanotte dopo due passi di ora: giorno della settimana e riga prolettica della data mostrata', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('ss.ui.benvenutoChiuso', 'true');
    localStorage.setItem('ss.ui.unitaPasso', '"ora"');
    localStorage.setItem('ss.ui.rigaProlettica', 'true');
  });
  const page = await ctx.newPage();
  await apri(page);
  const annunci = page.locator('.ss-annunci');

  // 20 ottobre 2026 22:00 UT + 2 ore: mercoledì 21 ottobre (Python datetime.date(2026, 10, 21).weekday() = 2).
  await impostaJd(page, JD_21_10_2026 - 1 + 22 / 24);
  await dueOreAvanti(page);
  expect((await tempo(page)).jdUT).toBeLessThan(JD_21_10_2026);
  await expect(page.locator('.ss-data-testo')).toHaveText('21 ottobre 2026');
  await expect(page.locator('.ss-data-ora')).toHaveText('00:00 UT');
  await expect(page.locator('.ss-settimana')).toHaveText('mercoledì');
  await expect(page.locator('.ss-prolettica')).toBeHidden();
  await expect(annunci).toContainText('21 ottobre 2026, 00:00 UT, mercoledì');

  // 4 ottobre 1582 22:00 UT (giuliano) + 2 ore: venerdì 15 ottobre, gregoriano, senza riga prolettica.
  await impostaJd(page, JD_15_10_1582 - 1 + 22 / 24);
  await expect(page.locator('.ss-prolettica')).toHaveText('gregoriano prolettico: 14 ottobre 1582');
  await dueOreAvanti(page);
  expect((await tempo(page)).jdUT).toBeLessThan(JD_15_10_1582);
  await expect(page.locator('.ss-data-testo')).toHaveText('15 ottobre 1582');
  await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario gregoriano');
  await expect(page.locator('.ss-settimana')).toHaveText('venerdì');
  await expect(page.locator('.ss-prolettica')).toBeHidden();
  await expect(annunci).toContainText('15 ottobre 1582, 00:00 UT, venerdì');

  // Offset fisso UTC+1: 20 ottobre 2026 22:00 locale + 2 ore = mercoledì 21 ottobre, 00:00 UTC+1.
  await page.locator('.ss-data').click();
  await page.getByText('Opzioni avanzate', { exact: true }).click();
  await page.getByLabel('Usa un offset orario fisso').check();
  await page.getByLabel('Offset orario fisso', { exact: true }).selectOption({ label: 'UTC+1 (fisso)' });
  await page.keyboard.press('Escape');
  await impostaJd(page, JD_21_10_2026 - 1 + 21 / 24);
  await expect(page.locator('.ss-data-ora')).toHaveText('22:00 UTC+1');
  await dueOreAvanti(page);
  expect((await tempo(page)).jdUT).toBeLessThan(JD_21_10_2026 - 1 / 24);
  await expect(page.locator('.ss-data-testo')).toHaveText('21 ottobre 2026');
  await expect(page.locator('.ss-data-ora')).toHaveText('00:00 UTC+1');
  await expect(page.locator('.ss-settimana')).toHaveText('mercoledì');
  await expect(annunci).toContainText('21 ottobre 2026, 00:00 UTC+1, mercoledì');
  await ctx.close();
});
