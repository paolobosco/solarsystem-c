// Errori d'avvio e di caricamento, orologio fuori dall'intervallo (§ 2 I2, § 5.6, § 11.11, § 11.12; A18, A19):
// - eccezioni durante la costruzione: messaggio role="alert" con "Riprova" funzionante, oppure vista testuale
//   quando si interrompe il costruttore della scena; mai una pagina vuota o un'eccezione non gestita;
// - errore di un blocco: messaggio rimosso quando la data passa ad altri blocchi, nuovo tentativo al ritorno;
// - riproduzione verso un blocco in errore: si ferma, senza "Caricamento dati" quando nulla è in caricamento;
// - errore di moon.bin: un solo messaggio, risolto da "Riprova";
// - orologio di sistema oltre il 2120: istante iniziale al 31/12/2120 23:59:59 UT con il messaggio del limite.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { B, T0, apri, attendiQuiete, chiudiBenvenuto, instradaFont, registra, stato, tempo, verificaPulita } from './aiuti';
import type { Aperta } from './aiuti';

/** Apre la pagina senza attendere i ganci di test (avvio che può non concludersi). */
async function apriGrezza(page: Page): Promise<Aperta> {
  await instradaFont(page.context());
  const origine = new URL(test.info().project.use.baseURL ?? 'http://localhost').origin;
  const a = registra(page, origine);
  await page.goto('/');
  return a;
}

const avvisi = (page: Page) => page.locator('.ss-avvisi-elenco .ss-avviso--errore');

test.describe('errori d\'avvio (§ 11.11, A18)', () => {
  test('ResizeObserver assente: messaggio con "Riprova", nessuna eccezione non gestita', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { ResizeObserver: unknown }).ResizeObserver = undefined;
    });
    const a = await apriGrezza(page);
    const avviso = page.getByRole('alert');
    await expect(avviso).toContainText('Impossibile avviare la mappa.', { timeout: 60_000 });
    await expect(avviso.getByRole('button', { name: 'Riprova' })).toBeFocused();
    expect(await page.evaluate(() => window.__ssTest === undefined)).toBe(true);
    verificaPulita(a);
  });

  test('eccezione transitoria nella costruzione: "Riprova" avvia l\'applicazione completa', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { ResizeObserver: typeof ResizeObserver; __guasto: boolean };
      const Originale = w.ResizeObserver;
      w.__guasto = true;
      w.ResizeObserver = class extends Originale {
        constructor(cb: ResizeObserverCallback) {
          if (w.__guasto) throw new TypeError('ResizeObserver non disponibile');
          super(cb);
        }
      };
    });
    const a = await apriGrezza(page);
    const riprova = page.getByRole('alert').getByRole('button', { name: 'Riprova' });
    await expect(riprova).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => {
      (window as unknown as { __guasto: boolean }).__guasto = false;
    });
    await riprova.click();
    await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
    await attendiQuiete(page);
    expect(await page.evaluate(() => window.__ssTest!.vista() !== null)).toBe(true);
    expect((await stato(page, 'marte')).stato).toBe('ok');
    await expect(page.locator('.ss-mappa canvas')).toHaveCount(1);
    verificaPulita(a);
  });

  test('Canvas 2D non disponibile nel costruttore della scena: vista testuale con i dati', async ({ page }) => {
    await page.addInitScript(() => {
      const originale = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
        if (tipo === '2d') return null;
        return (originale as (...x: unknown[]) => unknown).call(this, tipo, ...resto);
      } as typeof originale;
    });
    const a = await apri(page);
    await expect(page.getByText('Il browser non supporta la grafica 3D necessaria (WebGL2). Puoi usare la vista testuale.')).toBeVisible();
    await expect(page.locator('.ss-testuale')).toBeVisible();
    expect(await page.locator('.ss-testuale tbody tr').count()).toBeGreaterThan(100);
    expect((await stato(page, 'giove')).stato).toBe('ok');
    verificaPulita(a);
  });
});

test.describe('errori di caricamento (§ 5.6, § 11.11, A19)', () => {
  test('errore di un blocco: messaggio rimosso alle date di altri blocchi, nuovo tentativo al ritorno', async ({ page }) => {
    let fallire = true;
    let richieste = 0;
    await page.route(/\/data\/v1\/planets\/p00\.bin$/, async (route) => {
      richieste++;
      if (fallire) await route.fulfill({ status: 404, body: '' });
      else await route.continue();
    });
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const regolo = page.getByRole('slider', { name: 'Regolo temporale' });
    await regolo.focus();
    // 1° gennaio 10000 a.C. (blocco 0): errore con "Riprova".
    await regolo.press('Home');
    await expect(avvisi(page)).toContainText('Impossibile caricare i dati per il periodo 10000 a.C.-9000 a.C.');
    expect((await stato(page, 'marte')).stato).toBe('caricamento');
    expect(richieste).toBe(1);
    // 31 dicembre 2120: il messaggio non riguarda la data mostrata.
    await regolo.press('End');
    await expect.poll(async () => (await stato(page, 'marte')).stato, { timeout: 60_000 }).toBe('ok');
    await expect(avvisi(page)).toHaveCount(0);
    // Rete ripristinata, ritorno alla data: nuova richiesta senza "Riprova".
    fallire = false;
    await regolo.press('Home');
    await expect.poll(async () => (await stato(page, 'marte')).stato, { timeout: 60_000 }).toBe('ok');
    expect(richieste).toBe(2);
    await attendiQuiete(page);
    await expect(avvisi(page)).toHaveCount(0);
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    a.errori = a.errori.filter((e) => !/404/.test(e));
    verificaPulita(a);
  });

  test('riproduzione verso un blocco in errore: si ferma senza "Caricamento dati"; dopo "Riprova" riparte', async ({ page }) => {
    let fallire = true;
    await page.route(/\/data\/v1\/planets\/p11\.bin$/, async (route) => {
      if (fallire) await route.fulfill({ status: 404, body: '' });
      else await route.continue();
    });
    const a = await apri(page);
    await chiudiBenvenuto(page);
    // Blocco 11 (1010-2011) adiacente alla data corrente: errore già all'avvio.
    await expect(avvisi(page)).toContainText('Impossibile caricare i dati per il periodo 1010-2011.');
    await page.getByRole('combobox', { name: 'Velocità' }).selectOption({ label: '10\u00a0anni/s' });
    await page.getByRole('button', { name: 'Riproduci all\'indietro' }).click();
    await page.evaluate(() => {
      const w = window as unknown as { __scritti: string[] };
      w.__scritti = [];
      const regione = document.querySelector('.ss-annunci')!;
      new MutationObserver(() => w.__scritti.push((regione.textContent ?? '').trim())).observe(regione, { childList: true, characterData: true, subtree: true });
    });
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
    // Al confine del 2011 la riproduzione si ferma: nessuna attesa senza richieste in corso.
    await expect(page.getByRole('button', { name: 'Riproduci', exact: true })).toBeVisible({ timeout: 30_000 });
    // L'arresto per errore è annunciato una volta (WCAG 2.2, SC 4.1.3): in riproduzione l'errore del blocco taceva.
    const arresto = /^Riproduzione in pausa: dati non caricati\. \d+.*\d{2}:\d{2} UT, \p{L}+$/u;
    await expect(page.locator('.ss-annunci')).toHaveText(arresto);
    await page.waitForTimeout(2000);
    const scritti = await page.evaluate(() => (window as unknown as { __scritti: string[] }).__scritti);
    expect(scritti.filter((t) => arresto.test(t)), 'un solo annuncio dell\'arresto').toHaveLength(1);
    const confine = T0 + 12 * B;
    const t = await tempo(page);
    expect(t.jdTT).toBeGreaterThanOrEqual(confine);
    expect(t.jdTT).toBeLessThan(confine + 50 * 365.25);
    await expect(page.locator('.ss-attesa')).toBeHidden();
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    await expect(avvisi(page)).toContainText('Impossibile caricare i dati per il periodo 1010-2011.');
    // "Riprova" con la rete ripristinata; la riproduzione attraversa il confine.
    fallire = false;
    await avvisi(page).getByRole('button', { name: 'Riprova' }).click();
    await expect(avvisi(page)).toHaveCount(0, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await expect.poll(async () => (await tempo(page)).jdTT, { timeout: 60_000 }).toBeLessThan(confine - 365);
    await page.getByRole('button', { name: 'Pausa' }).click();
    await attendiQuiete(page);
    expect((await stato(page, 'marte')).stato).toBe('ok');
    a.errori = a.errori.filter((e) => !/404/.test(e));
    verificaPulita(a);
  });

  test('errore di moon.bin: un solo messaggio per la Luna, risolto da "Riprova"', async ({ page }) => {
    let fallire = true;
    await page.route(/\/data\/v1\/moon\.bin$/, async (route) => {
      if (fallire) await route.fulfill({ status: 404, body: '' });
      else await route.continue();
    });
    const a = await apri(page, '/', { attendi: false });
    await expect(avvisi(page)).toContainText('Impossibile caricare i dati della Luna.', { timeout: 60_000 });
    // Dopo il caricamento dei blocchi adiacenti: ancora un solo messaggio, nessun periodo.
    await expect.poll(async () => (await stato(page, 'marte')).stato, { timeout: 60_000 }).toBe('ok');
    await page.waitForTimeout(2000);
    await expect(avvisi(page)).toHaveCount(1);
    await expect(avvisi(page)).not.toContainText('periodo');
    for (const slug of ['terra', 'luna']) expect((await stato(page, slug)).stato, slug).toBe('caricamento');
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    fallire = false;
    await avvisi(page).getByRole('button', { name: 'Riprova' }).click();
    await expect.poll(async () => (await stato(page, 'luna')).stato, { timeout: 60_000 }).toBe('ok');
    await attendiQuiete(page);
    expect((await stato(page, 'terra')).stato).toBe('ok');
    await expect(avvisi(page)).toHaveCount(0);
    a.errori = a.errori.filter((e) => !/404/.test(e));
    verificaPulita(a);
  });
});

test.describe('orologio di sistema fuori dall\'intervallo (§ 2 I2, § 11.12)', () => {
  test('1° giugno 2125: avvio al 31 dicembre 2120 23:59:59 UT con il messaggio del limite', async ({ page }) => {
    await page.addInitScript(() => {
      const ora = Date.now.bind(Date);
      const scarto = Date.UTC(2125, 5, 1, 12) - ora();
      Date.now = () => ora() + scarto;
    });
    const a = await apri(page);
    await expect(page.locator('.ss-data-testo')).toContainText('31 dicembre 2120');
    expect((await tempo(page)).jdUT).toBeCloseTo(2_495_739.5 - 1 / 86_400, 6);
    for (const slug of ['sole', 'marte', 'terra']) expect((await stato(page, slug)).stato, slug).toBe('ok');
    const limite = page.locator('.ss-avvisi-elenco .ss-avviso--info', { hasText: 'Raggiunto il limite superiore' });
    await expect(limite).toBeVisible();
    await chiudiBenvenuto(page);
    await limite.getByRole('button', { name: 'Chiudi il messaggio' }).click();
    await expect(limite).toHaveCount(0);
    // "Adesso" limita allo stesso istante e lo segnala.
    await page.getByRole('button', { name: 'Adesso', exact: true }).click();
    await expect(limite).toBeVisible();
    await expect(page.locator('.ss-data-testo')).toContainText('31 dicembre 2120');
    verificaPulita(a);
  });
});
