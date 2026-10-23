// Rete, console, preferenze e caricamento sull'applicazione reale (§ 13, A18 e A19; RF8, RNF6, RNF7, § 5.6, § 11.11):
// - A18: richieste solo verso l'origine e Google Fonts, senza query string; nessun dialog; nessun console.error o
//   console.warn; funzionamento con localStorage che lancia eccezioni; la data non entra nelle preferenze;
// - A19: con risposte ritardate i corpi interessati sono nascosti e in stato "caricamento" (mai posizioni
//   estrapolate), la barra di caricamento mostra il periodo; con un 404 compaiono il messaggio e "Riprova",
//   che funziona; un caricamento non più necessario è annullato senza messaggi d'errore; il ritorno sulla
//   data durante la verifica SHA-256 della richiesta annullata produce una nuova richiesta.

import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { B, T0, apri, attendiQuiete, cerca, chiudiBenvenuto, posizione, schermata, stato, verificaPulita } from './aiuti';
import type { Aperta } from './aiuti';

/** Centro del blocco k (TDB); a quest'epoca ΔT conta poco rispetto alla durata del blocco. */
const centroBlocco = (k: number): number => T0 + (k + 0.5) * B;

/** Imposta la data senza attendere la fine del caricamento (le prove osservano gli stati intermedi). */
function avviaData(page: Page, jdUT: number): void {
  page.evaluate((jd) => window.__ssTest!.setTime(jd), jdUT).catch(() => undefined);
}

/** Percorso con risposta trattenuta fino a `rilascia()`. */
async function trattieni(page: Page, re: RegExp): Promise<{ rilascia: () => void; richieste: () => number }> {
  let sblocca: () => void = () => undefined;
  const via = new Promise<void>((r) => (sblocca = r));
  let n = 0;
  await page.route(re, async (route: Route) => {
    n++;
    await via;
    try {
      await route.continue();
    } catch {
      // richiesta annullata dalla pagina nel frattempo
    }
  });
  return { rilascia: () => sblocca(), richieste: () => n };
}

/** Sessione d'uso: pannelli, livelli, filtri, ricerca, fuoco, passi, riproduzione, dialoghi, vista testuale. */
async function usa(a: Aperta): Promise<void> {
  const { page } = a;
  await chiudiBenvenuto(page);
  await page.getByRole('button', { name: 'Livelli' }).click();
  const caselle = page.locator('.ss-livelli-gruppo label.ss-casella');
  await caselle.nth(0).click();
  await caselle.nth(0).click();
  await page.keyboard.press('Escape');
  await cerca(page, 'giove');
  await page.getByRole('button', { name: 'Inquadra il corpo selezionato' }).click();
  await page.getByRole('button', { name: 'Avanti di un giorno' }).click();
  await page.locator('.ss-velocita').selectOption({ label: '1 settimana/s' });
  await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Pausa' }).click();
  await page.getByRole('button', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fonti e metodi' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.keyboard.press('t');
  await expect(page.locator('.ss-testuale')).toBeVisible();
  await page.keyboard.press('t');
  const espandi = page.locator('.ss-scheda button[aria-controls]').first();
  if ((await espandi.getAttribute('aria-expanded')) === 'false') await espandi.click();
  await page.getByRole('button', { name: 'Copia collegamento' }).click();
  await attendiQuiete(page);
}

test.describe('A18: rete, console e preferenze', () => {
  test('localStorage inaccessibile (SecurityError): sessione completa senza errori e senza richieste esterne', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Accesso negato', 'SecurityError');
        },
      });
    });
    const a = await apri(page);
    const accesso = await page.evaluate(() => {
      try {
        return typeof localStorage;
      } catch {
        return 'eccezione';
      }
    });
    expect(accesso).toBe('eccezione');
    await usa(a);
    // Nuovo caricamento: le preferenze non persistono, l'applicazione funziona.
    await page.reload();
    await page.waitForFunction(() => window.__ssTest !== undefined);
    await attendiQuiete(page);
    await expect(page.getByRole('button', { name: 'Chiudi la nota di benvenuto' })).toBeVisible();
    expect((await stato(page, 'giove')).stato).toBe('ok');
    verificaPulita(a);
  });

  test('metodi di Storage che lanciano eccezioni (QuotaExceededError): nessun errore', async ({ page }) => {
    await page.addInitScript(() => {
      const lancia = () => {
        throw new DOMException('Spazio esaurito', 'QuotaExceededError');
      };
      Storage.prototype.getItem = lancia;
      Storage.prototype.setItem = lancia;
      Storage.prototype.removeItem = lancia;
    });
    const a = await apri(page);
    await usa(a);
    verificaPulita(a);
  });

  test('preferenze salvate, mai la data; collegamento con il solo hash', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    await page.getByRole('button', { name: 'Livelli' }).click();
    const prima = page.locator('.ss-livelli-gruppo .ss-casella-input').first();
    const valore = await prima.isChecked();
    await page.locator('.ss-livelli-gruppo label.ss-casella').first().click();
    expect(await prima.isChecked()).toBe(!valore);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__ssTest!.setTime(2_440_000.5));
    await cerca(page, 'marte');
    expect(await page.evaluate(() => location.href)).toMatch(/\/#marte$/);
    const archivio = await page.evaluate(() => Object.entries(localStorage));
    expect(archivio.length).toBeGreaterThan(0);
    for (const [k, v] of archivio) {
      expect(k).not.toMatch(/data|tempo|jd|istante/i);
      expect(v).not.toContain('2440000');
    }
    await page.reload();
    await page.waitForFunction(() => window.__ssTest !== undefined);
    await attendiQuiete(page);
    // Nota chiusa e livello ricordati; la data torna all'istante corrente; il corpo dall'hash.
    await expect(page.getByRole('button', { name: 'Chiudi la nota di benvenuto' })).toBeHidden();
    await page.getByRole('button', { name: 'Livelli' }).click();
    expect(await page.locator('.ss-livelli-gruppo .ss-casella-input').first().isChecked()).toBe(!valore);
    await page.keyboard.press('Escape');
    expect((await page.evaluate(() => window.__ssTest!.getTime())).jdUT).toBeGreaterThan(2_461_000);
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');
    verificaPulita(a);
  });
});

test.describe('A19: caricamento lento, errori e "Riprova"', () => {
  test('risposte ritardate: corpi nascosti in stato "caricamento", barra con il periodo, poi visibili', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const h = await trattieni(page, /\/data\/v1\/planets\/p09\.bin$/);
    avviaData(page, centroBlocco(9));
    await expect(page.locator('.ss-caricamento')).toBeVisible();
    await expect(page.locator('.ss-caricamento-testo')).toContainText('Caricamento dati per il periodo');
    await expect.poll(() => h.richieste()).toBeGreaterThan(0);
    // Pianeti, Terra, Luna e lune (centri dei pianeti) attendono il file dei pianeti; nessun disegno.
    for (const slug of ['marte', 'terra', 'luna', 'saturno']) {
      expect((await stato(page, slug)).stato, slug).toBe('caricamento');
    }
    await expect.poll(async () => (await posizione(page, 'marte'))?.visibile ?? true).toBe(false);
    for (const slug of ['mercurio', 'venere', 'terra', 'giove']) expect((await posizione(page, slug))?.visibile, slug).toBe(false);
    // Scheda della Terra: posizione in caricamento, nessun livello di affidabilità.
    await expect(page.locator('.ss-scheda .ss-badge-aff')).toBeHidden();
    // Il Sole resta disegnato.
    expect((await stato(page, 'sole')).stato).toBe('ok');
    expect((await posizione(page, 'sole'))?.visibile).toBe(true);
    await schermata(page, 'a19-caricamento', false);
    // Per due secondi nessuna posizione: mai stati estrapolati con la data nuova.
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(500);
      expect((await stato(page, 'marte')).stato).toBe('caricamento');
      expect((await posizione(page, 'marte'))?.visibile).toBe(false);
    }
    h.rilascia();
    await expect.poll(async () => (await stato(page, 'marte')).stato, { timeout: 60_000 }).toBe('ok');
    await attendiQuiete(page);
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    expect((await posizione(page, 'marte'))?.visibile).toBe(true);
    await expect(page.locator('.ss-scheda .ss-badge-aff')).toBeVisible();
    verificaPulita(a);
  });

  test('caricamento non più necessario: annullato senza messaggi d\'errore', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const h = await trattieni(page, /\/data\/v1\/planets\/p08\.bin$/);
    const oggi = (await page.evaluate(() => window.__ssTest!.getTime())).jdUT;
    avviaData(page, centroBlocco(8));
    await expect.poll(() => h.richieste()).toBeGreaterThan(0);
    await page.evaluate((jd) => window.__ssTest!.setTime(jd), oggi);
    h.rilascia();
    await attendiQuiete(page);
    await page.waitForTimeout(500);
    await expect(page.locator('.ss-avvisi-elenco')).not.toContainText('Impossibile');
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    expect((await stato(page, 'marte')).stato).toBe('ok');
    verificaPulita(a);
  });

  test('ritorno sul blocco durante la verifica SHA-256 della richiesta annullata: nuova richiesta, corpi visibili', async ({ page }) => {
    const manifest = JSON.parse(readFileSync(new URL('../public/data/v1/manifest.json', import.meta.url), 'utf-8')) as {
      file: { percorso: string; byte: number }[];
    };
    const byte = manifest.file.find((f) => f.percorso === 'planets/p00.bin')!.byte;
    const a = await apri(page);
    await chiudiBenvenuto(page);
    let richieste = 0;
    page.on('request', (r) => {
      if (/\/data\/v1\/planets\/p00\.bin$/.test(r.url())) richieste++;
    });
    // Verifica di planets/p00.bin trattenuta fino allo sblocco, come su un dispositivo lento.
    await page.evaluate((n) => {
      const w = window as unknown as { inVerifica: number; sbloccaVerifica: () => void };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      let sblocca: () => void = () => undefined;
      const via = new Promise<void>((r) => (sblocca = r));
      w.inVerifica = 0;
      w.sbloccaVerifica = () => sblocca();
      (crypto.subtle as unknown as { digest: (alg: string, dati: ArrayBuffer) => Promise<ArrayBuffer> }).digest = async (alg, dati) => {
        if (dati.byteLength === n) {
          w.inVerifica++;
          await via;
        }
        return digest(alg, dati);
      };
    }, byte);
    const inVerifica = (): Promise<number> => page.evaluate(() => (window as unknown as { inVerifica: number }).inVerifica);
    await page.getByRole('slider', { name: 'Regolo temporale' }).focus();
    await page.keyboard.press('Home');
    await expect.poll(inVerifica).toBe(1);
    // Uscita dal blocco e ritorno immediato mentre la verifica è in corso.
    await page.keyboard.press('End');
    await page.keyboard.press('Home');
    await page.evaluate(() => (window as unknown as { sbloccaVerifica: () => void }).sbloccaVerifica());
    await expect.poll(async () => (await stato(page, 'marte')).stato, { timeout: 60_000 }).toBe('ok');
    await attendiQuiete(page);
    expect(richieste).toBe(2);
    for (const slug of ['io', 'cerere']) expect((await stato(page, slug)).stato, slug).toBe('ok');
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Riprova' })).toHaveCount(0);
    verificaPulita(a);
  });

  test('404 su un blocco: corpi nascosti, messaggio e "Riprova" funzionante', async ({ page }) => {
    let fallire = true;
    await page.route(/\/data\/v1\/planets\/p05\.bin$/, async (route) => {
      if (fallire) await route.fulfill({ status: 404, body: '' });
      else await route.continue();
    });
    const a = await apri(page);
    await chiudiBenvenuto(page);
    avviaData(page, centroBlocco(5));
    await expect(page.locator('.ss-avvisi-elenco').getByText(/Impossibile caricare i dati per il periodo/)).toBeVisible();
    expect((await stato(page, 'marte')).stato).toBe('caricamento');
    expect((await stato(page, 'sole')).stato).toBe('ok');
    await expect.poll(async () => (await posizione(page, 'marte'))?.visibile ?? false).toBe(false);
    await schermata(page, 'a19-errore-blocco', false);
    fallire = false;
    await page.getByRole('button', { name: 'Riprova' }).click();
    await expect.poll(async () => (await stato(page, 'marte')).stato, { timeout: 60_000 }).toBe('ok');
    await attendiQuiete(page);
    await expect(page.locator('.ss-avvisi-elenco').getByText(/Impossibile caricare i dati per il periodo/)).toBeHidden();
    expect((await posizione(page, 'marte'))?.visibile).toBe(true);
    // Solo i messaggi di rete del 404 previsto.
    a.errori = a.errori.filter((e) => !/404/.test(e));
    verificaPulita(a);
  });

  test('404 su reliability.bin: livelli provvisori con messaggio e "Riprova" funzionante', async ({ page }) => {
    let fallire = true;
    await page.route(/\/data\/v1\/reliability\.bin$/, async (route) => {
      if (fallire) await route.fulfill({ status: 404, body: '' });
      else await route.continue();
    });
    const a = await apri(page, '/', { attendi: false });
    const avviso = page.locator('.ss-avviso-testo', { hasText: 'Impossibile caricare le stime di affidabilità: i livelli mostrati sono provvisori.' });
    await expect(avviso).toBeVisible({ timeout: 60_000 });
    // Livello provvisorio che non nasconde i corpi.
    expect((await stato(page, 'marte')).stato).toBe('ok');
    expect((await stato(page, 'marte')).livello).not.toBe('non-determinabile');
    fallire = false;
    await page.getByRole('button', { name: 'Riprova' }).click();
    await attendiQuiete(page);
    await expect(avviso).toBeHidden();
    expect((await stato(page, 'marte')).livello).toBe('precisa');
    a.errori = a.errori.filter((e) => !/404/.test(e));
    verificaPulita(a);
  });
});
