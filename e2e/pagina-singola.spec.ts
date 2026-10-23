// Pagina singola pubblicata (§ 5.7, RNF7, § 13 A24): il frammento di dist-artifact/index.html avvolto in uno
// scheletro minimo che emula quello della piattaforma (charset, viewport con viewport-fit=cover, reset di base),
// servito da un percorso annidato senza barra finale (/a/b/index.html) da scripts/servi-artifact.mjs, con una
// Content-Security-Policy che ammette solo l'origine e Google Fonts. Build di produzione, senza ganci di test.
// Verifiche: caricamento completo dei dati della data, dell'affidabilità e delle stelle; nessuna richiesta
// esterna oltre ai caratteri; nessuna query string; tutti i file sotto /a/b/; #marte selezionato e inquadrato;
// scena disegnata; lingua e titolo; localStorage che lancia eccezioni; 400 px senza scorrimento orizzontale;
// avvisi della licenza di three.js (A26).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { B, CARTELLA, T0, decodificaPng, instradaFont, registra, verificaPulita } from './aiuti';
import type { Aperta } from './aiuti';

const PAGINA = '/a/b/index.html';

interface ApertaPagina extends Aperta {
  /** Risposte con errore o richieste all'origine fuori da /a/b/. */
  errati: string[];
}

async function apriPagina(page: Page, hash = '#marte'): Promise<ApertaPagina> {
  await instradaFont(page.context());
  const errati: string[] = [];
  // Origine del server del progetto (baseURL di playwright.config.ts).
  const origine = new URL(test.info().project.use.baseURL ?? '').origin;
  const a: ApertaPagina = { ...registra(page, origine), errati };
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin === origine && r.status() >= 400) errati.push(`${r.status()} ${u.pathname}`);
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === origine && !u.pathname.startsWith('/a/b/')) errati.push(`fuori dalla base: ${u.pathname}`);
  });
  await page.goto(`${PAGINA}${hash}`);
  return a;
}

/** Caricamento completo: dati della data, affidabilità, stelle, blocco adiacente; nessuna richiesta in corso. */
async function attendiCompleto(page: Page, a: Aperta): Promise<void> {
  const attesi = ['manifest.json', 'catalog.json', 'time.json', 'moon.bin', 'planets/p12.bin', 'sats/s12.bin', 'small/b12.bin', 'reliability.bin', 'stars.bin'];
  // Blocco 11 adiacente se la data attuale è entro 50 anni dal confine del 2011 (§ 5.6).
  const adesso = 2_440_587.5 + Date.now() / 86_400_000;
  if (adesso - (T0 + 12 * B) < 50 * 365.25) attesi.push('planets/p11.bin');
  for (const f of attesi) {
    await expect.poll(() => a.dati.includes(f), { timeout: 90_000, message: f }).toBe(true);
  }
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.ss-caricamento')).toBeHidden();
  await expect(page.locator('.ss-avviso--errore')).toHaveCount(0);
  await expect(page.locator('.ss-avvisi-bloccanti')).toBeEmpty();
}

test('A24: frammento nello scheletro della piattaforma su /a/b/index.html, caricamento completo e #marte', async ({ page }) => {
  const a = await apriPagina(page);
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte', { timeout: 90_000 });
  await attendiCompleto(page, a);
  // Nessun gancio di test nella build pubblicata.
  expect(await page.evaluate(() => '__ssTest' in window)).toBe(false);
  // Documento: lingua (lo scheletro non la dichiara), titolo, un solo foglio dell'applicazione e un solo script.
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page).toHaveTitle('Sistema solare 3D');
  expect(await page.evaluate(() => document.querySelectorAll('script[type="module"]').length)).toBe(1);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(3, 8, 6)');
  // #marte: selezionato e inquadrato a livello di orbita; l'indirizzo resta quello della pagina.
  await expect(page.locator('.ss-mappa')).toHaveAttribute('aria-label', /Marte/);
  expect(await page.evaluate(() => location.pathname + location.hash)).toBe(`${PAGINA}#marte`);
  // Scena disegnata: il marcatore di Marte al centro della canvas e altri elementi della scena.
  await page.waitForTimeout(500);
  const box = (await page.locator('.ss-mappa canvas').boundingBox())!;
  const png = decodificaPng(await page.screenshot({ clip: { x: box.x + box.width / 2 - 8, y: box.y + box.height / 2 - 8, width: 16, height: 16 } }));
  let massimo = 0;
  for (let i = 0; i < png.w * png.h; i++) massimo = Math.max(massimo, png.dati[i * png.canali]! + png.dati[i * png.canali + 1]! + png.dati[i * png.canali + 2]!);
  expect(massimo, 'marcatore di Marte al centro').toBeGreaterThan(450);
  await page.screenshot({ path: `${CARTELLA}pagina-singola-01-marte.png` });
  // Cambio dell'hash: nuovo corpo a fuoco.
  await page.evaluate(() => (location.hash = '#giove'));
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Giove');
  await page.waitForLoadState('networkidle');
  // Riproduzione breve e dialogo Fonti e metodi: nessun errore.
  await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
  await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Pausa' }).click();
  await page.getByRole('button', { name: 'Fonti e metodi' }).click();
  await expect(page.getByRole('dialog', { name: 'Fonti e metodi' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${CARTELLA}pagina-singola-02-giove.png` });
  verificaPulita(a);
  expect(a.errati, 'risposte con errore o fuori da /a/b/').toEqual([]);
});

test('A24: localStorage che lancia eccezioni e 400 px senza scorrimento orizzontale', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Accesso negato', 'SecurityError');
      },
    });
  });
  const page = await ctx.newPage();
  const a = await apriPagina(page);
  await expect(page.locator('.ss-chip-scheda')).toContainText('Marte', { timeout: 90_000 });
  await attendiCompleto(page, a);
  const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth, b: document.body.scrollWidth }));
  expect(m.s).toBeLessThanOrEqual(m.c);
  expect(m.b).toBeLessThanOrEqual(m.c);
  await page.screenshot({ path: `${CARTELLA}pagina-singola-03-telefono.png` });
  verificaPulita(a);
  expect(a.errati).toEqual([]);
  await ctx.close();
});

test('A26: avvisi della licenza MIT di three.js pubblicati con il pacchetto', async ({ request }) => {
  const r = await request.get('/a/b/assets/LICENZE.txt');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/plain');
  const testo = await r.text();
  expect(testo).toMatch(/Copyright © 2010-\d{4} three\.js authors/);
  expect(testo).toContain('Permission is hereby granted, free of charge');
  expect(testo).toContain('The above copyright notice and this permission notice shall be included in');
  const js = await (await request.get('/a/b/assets/app.js')).text();
  expect(/@license[\s\S]*?Three\.js Authors[\s\S]*?SPDX-License-Identifier: MIT/.test(js)).toBe(true);
});
