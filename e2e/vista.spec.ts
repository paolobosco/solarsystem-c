// Vista della scena nell'applicazione reale:
// - vista iniziale Sistema interno (4 UA) anche sugli schermi verticali; ampiezza invariata alla rotazione (§ 10.3, § 11.12);
// - corpo a fuoco senza posizione alla data: camera fuori dal corpo d'origine, annuncio coerente (§ 7.8.2, § 10.3);
// - contesto WebGL perso: etichette nascoste e messaggio fino al ripristino (R13);
// - sistema di Saturno dal preset e dal contatore "+N lune": camera a 30° sul piano delle lune (§ 11.3, § 11.5.1).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GRADI, UA, angolo, apri, attendiQuiete, cerca, chiudiBenvenuto, differenza, impostaJd, posizione, preset, stato, vettoriale } from './aiuti';

/** Raggio nominale del Sole (Risoluzione IAU 2015 B3), km. */
const R_SOLE = 695_700;

function vista(page: Page) {
  return page.evaluate(() => window.__ssTest!.vista()!);
}

function etichetteVisibili(page: Page): Promise<number> {
  return page.locator('.ss-etichetta').evaluateAll((l) => l.filter((e) => getComputedStyle(e).visibility === 'visible').length);
}

test.describe('Vista: ampiezza iniziale, corpi senza posizione, contesto perso', () => {
  test('vista iniziale Sistema interno (4 UA) sullo schermo verticale del telefono (§ 11.12) @telefono', async ({ page }) => {
    await apri(page);
    const v = await vista(page);
    expect(v.altezzaPx).toBeGreaterThan(v.larghezzaPx);
    expect(v.estensioneKm / (4 * UA)).toBeCloseTo(1, 3);
    await expect(page.locator('.ss-mappa')).toHaveAttribute('aria-label', /Sistema interno/);
  });

  test('rotazione dello schermo: ampiezza della vista invariata (§ 10.3)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await apri(page);
    const e0 = (await vista(page)).estensioneKm;
    expect(e0 / (4 * UA)).toBeCloseTo(1, 3);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(async () => (await vista(page)).larghezzaPx).toBeLessThan(800);
    await attendiQuiete(page);
    expect((await vista(page)).estensioneKm / e0).toBeCloseTo(1, 6);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => (await vista(page)).larghezzaPx).toBeGreaterThan(800);
    await attendiQuiete(page);
    expect((await vista(page)).estensioneKm / e0).toBeCloseTo(1, 6);
  });

  test('corpo senza posizione alla data: camera fuori dal Sole, Inquadra lo dice (§ 7.8.2, § 10.3)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    // 13 dicembre 9998 a.C.: 1P/Halley senza posizione.
    await impostaJd(page, -1_930_000.5);
    await attendiQuiete(page);
    expect((await stato(page, '1p-halley')).stato).toBe('non-determinabile');
    await cerca(page, 'Halley');
    const v = await vista(page);
    expect(v.fuocoSenzaPosizione).toBe(true);
    expect(v.distanzaKm).toBeGreaterThanOrEqual(R_SOLE * 1.01);
    expect((await posizione(page, 'sole'))!.visibile).toBe(true);
    // Lo zoom non porta la camera dentro il Sole.
    await page.locator('.ss-mappa').hover();
    for (let k = 0; k < 40; k++) await page.mouse.wheel(0, -600);
    await attendiQuiete(page);
    expect((await vista(page)).distanzaKm).toBeGreaterThanOrEqual(R_SOLE * 1.01 - 1e-6);
    // Inquadra (F): nessuna "Vista centrata su" per un corpo che non è nella scena.
    await page.locator('.ss-mappa').focus();
    await page.keyboard.press('f');
    await expect(page.locator('.ss-annunci')).toContainText('Posizione di 1P/Halley non determinabile a questa data');
    expect((await vista(page)).distanzaKm).toBeGreaterThanOrEqual(R_SOLE * 1.01 - 1e-6);
  });

  test('contesto WebGL perso: etichette nascoste e messaggio fino al ripristino (R13)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await attendiQuiete(page);
    expect(await etichetteVisibili(page)).toBeGreaterThan(10);
    await page.evaluate(() => {
      const gl = document.querySelector<HTMLCanvasElement>('.ss-mappa canvas')!.getContext('webgl2')!;
      const e = gl.getExtension('WEBGL_lose_context')!;
      (window as Window & { __perdita?: WEBGL_lose_context }).__perdita = e;
      e.loseContext();
    });
    const messaggio = page.locator('.ss-avvisi').getByText('Grafica 3D sospesa, ripristino in corso.');
    await expect(messaggio).toBeVisible();
    expect(await etichetteVisibili(page)).toBe(0);
    await page.getByRole('button', { name: /^Avanti di un/ }).first().click();
    expect(await etichetteVisibili(page)).toBe(0);
    await page.evaluate(() => (window as Window & { __perdita?: WEBGL_lose_context }).__perdita!.restoreContext());
    await expect(messaggio).toHaveCount(0);
    await attendiQuiete(page);
    expect(await etichetteVisibili(page)).toBeGreaterThan(10);
  });

  test('sistema di Saturno dal contatore "+N lune" e dal preset: 30° sul piano delle lune (§ 11.3, § 11.5.1)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_333.5); // 20/10/2026 0h UT
    /** Elevazione (gradi) della camera sul piano dell'orbita di Titano attorno a Saturno. */
    async function elevazione(): Promise<number> {
      const s = await stato(page, 'saturno');
      const t = await stato(page, 'titano');
      const h = vettoriale(differenza(t.r, s.r), differenza(t.v, s.v));
      return 90 - angolo((await vista(page)).direzione, h) * GRADI;
    }
    // Dalla vista iniziale (azimut -90°, 30° sull'eclittica) il piano è quasi di taglio.
    expect(Math.abs(await elevazione())).toBeLessThan(4);
    await preset(page, 'Pianeti giganti');
    const contatore = page.locator('.ss-etichetta', { hasText: /^Saturno/ }).locator('.ss-contatore');
    await expect(contatore).toBeVisible();
    const saturno = Number(await contatore.getAttribute('data-sistema'));
    await contatore.click();
    await attendiQuiete(page);
    expect((await vista(page)).fuoco).toBe(saturno);
    expect(Math.abs(await elevazione())).toBeCloseTo(30, 1);
    expect((await posizione(page, 'titano'))!.visibile).toBe(true);
    // Preset dalla direzione iniziale: stessa elevazione sul piano delle lune.
    await page.evaluate(() => window.__ssTest!.posa([0, -1e9 * Math.cos(Math.PI / 6), 1e9 * Math.sin(Math.PI / 6)], [0, 0, 0]));
    expect(Math.abs(await elevazione())).toBeLessThan(4);
    await preset(page, 'Sistema di Saturno');
    expect(Math.abs(await elevazione())).toBeCloseTo(30, 1);
    await expect(page.locator('.ss-mappa')).toHaveAttribute('aria-label', /Sistema di Saturno/);
  });
});
