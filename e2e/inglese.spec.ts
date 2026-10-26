// Interfaccia in inglese sull'applicazione reale (RNF8, RF8, § 11.12, § 11.13, § 11.14 di docs/PROGETTO.md): lingua iniziale
// dal browser (locale en-US), testi principali, numeri con il punto decimale e la virgola tra i gruppi, date con
// l'era in inglese, nomi inglesi dei corpi in scheda e in ricerca (e ricerca anche con il nome italiano), cambio di lingua
// dalle Impostazioni con ricarica che mantiene data, corpo selezionato e vista, axe-core su più stati.
// I nomi accessibili vengono da src/ui/testi.en.ts.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { calendarToJd } from '../src/time/calendar';
import { T } from '../src/ui/testi.en';
import { T as TIt } from '../src/ui/testi.it';
import { apri, attendiQuiete, impostaJd, tempo, verificaPulita } from './aiuti';

test.use({ locale: 'en-US' });

const NBSP = /\u00a0/g;
const testo = (s: string | null): string => (s ?? '').replace(NBSP, ' ').trim();

const dataMostrata = async (page: Page): Promise<string> => testo(await page.locator('.ss-data-testo').textContent());

async function axe(page: Page, stato: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const gravi = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    gravi.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`),
    `axe in ${stato}`,
  ).toEqual([]);
  const regioni = await new AxeBuilder({ page }).withRules(['region']).analyze();
  expect(
    regioni.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 6).join(' | ')}`),
    `landmark in ${stato}`,
  ).toEqual([]);
}

/** Ricerca di un corpo e selezione del primo risultato (come `cerca` di aiuti.ts, con il nome del campo in inglese). */
async function cerca(page: Page, testoCercato: string): Promise<void> {
  const campo = page.getByRole('combobox', { name: T.trova.etichetta });
  await campo.fill(testoCercato);
  await expect(page.getByRole('listbox')).toBeVisible();
  await campo.press('ArrowDown');
  await campo.press('Enter');
  await attendiQuiete(page);
}

async function apriImpostazioni(page: Page): Promise<void> {
  await page.getByRole('button', { name: T.barra.impostazioni }).click();
  await expect(page.getByRole('dialog', { name: T.impostazioni.titolo })).toBeVisible();
}

test('lingua del documento, titolo e testi principali in inglese con il browser en-US', async ({ page }) => {
  const a = await apri(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle(T.avvio.titolo);
  await expect(page.getByRole('combobox', { name: T.trova.etichetta })).toBeVisible();
  await expect(page.getByRole('button', { name: T.barra.impostazioni })).toBeVisible();
  await expect(page.getByRole('button', { name: T.barra.fonti })).toBeVisible();
  await expect(page.getByRole('button', { name: T.messaggi.chiudiBenvenuto })).toBeVisible();
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Earth');
  await expect(page.locator('.ss-scheda-categoria')).toHaveText('Planet');
  // Nessun testo italiano nei controlli principali.
  const nomi = await page.locator('button, [role=slider], [role=combobox]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent ?? ''));
  for (const italiano of [TIt.trova.etichetta, TIt.barra.impostazioni, TIt.barra.fonti]) expect(nomi.join('|')).not.toContain(italiano);
  expect(await page.evaluate(() => localStorage.getItem('ss.ui.lingua'))).toBeNull();
  verificaPulita(a);
});

test('numeri con il punto decimale e la virgola tra i gruppi; nessun U+2009', async ({ page }) => {
  const a = await apri(page);
  await page.locator('.ss-scheda button[aria-controls]').first().click();
  await page.locator('summary', { hasText: T.scheda.fisica }).click();
  const scheda = testo(await page.locator('.ss-scheda').textContent());
  // Semiassi della Terra e GM: virgola tra i gruppi, punto decimale.
  expect(scheda).toMatch(/6,378\.14 × 6,378\.14 × 6,356\.75 km/);
  expect(scheda).toMatch(/398,600\.4 km³\/s²/);
  expect(scheda).toMatch(/0\.9\d+ au/);
  expect(scheda).not.toMatch(/\d\u2009\d/);
  expect(scheda).not.toMatch(/\d,\d{1,2}(?!\d)\s*(km|au|°)/);
  expect(await page.evaluate(() => document.body.innerText.includes('\u2009'))).toBe(false);
  verificaPulita(a);
});

test('date: "1 January 10000 BC", "AD 800" prima dell\'anno, giorno prima del mese', async ({ page }) => {
  const a = await apri(page);
  await impostaJd(page, calendarToJd({ anno: -9999, mese: 1, giorno: 1, ora: 12, minuto: 0, secondo: 0, calendario: 'giuliano' }));
  await attendiQuiete(page);
  await expect(page.locator('.ss-data-testo')).toHaveText(/^1 January 10000\s*BC$/);
  expect(await dataMostrata(page)).toBe('1 January 10000 BC');
  await impostaJd(page, calendarToJd({ anno: 800, mese: 3, giorno: 8, ora: 12, minuto: 0, secondo: 0, calendario: 'giuliano' }));
  await attendiQuiete(page);
  expect(await dataMostrata(page)).toBe('8 March AD 800');
  await impostaJd(page, calendarToJd({ anno: 2026, mese: 10, giorno: 19, ora: 12, minuto: 0, secondo: 0, calendario: 'gregoriano' }));
  await attendiQuiete(page);
  expect(await dataMostrata(page)).toBe('19 October 2026');
  // Editor: campi in inglese, anno ed era (BC e AD).
  await page.locator('.ss-data').click();
  await expect(page.getByRole('button', { name: /^BC/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^AD/ })).toBeVisible();
  verificaPulita(a);
});

test('nomi inglesi in scheda e in ricerca; la ricerca trova anche i nomi italiani', async ({ page }) => {
  const a = await apri(page);
  await cerca(page, 'Moon');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Moon');
  await cerca(page, 'Jupiter');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Jupiter');
  expect(new URL(page.url()).hash).toBe('#giove');
  // Nome italiano: stesso corpo, nome mostrato in inglese.
  await cerca(page, 'Luna');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Moon');
  await cerca(page, 'Giove');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Jupiter');
  // Risultato della ricerca: nome inglese e "moon of Jupiter".
  const campo = page.getByRole('combobox', { name: T.trova.etichetta });
  await campo.fill('Europa');
  await expect(page.getByRole('listbox')).toContainText('moon of Jupiter');
  await page.keyboard.press('Escape');
  verificaPulita(a);
});

test('cambio di lingua dalle Impostazioni: ricarica che mantiene data, corpo selezionato, vista e hash', async ({ page }) => {
  const a = await apri(page);
  await cerca(page, 'Jupiter');
  await impostaJd(page, calendarToJd({ anno: 2010, mese: 3, giorno: 15, ora: 12, minuto: 0, secondo: 0, calendario: 'gregoriano' }));
  await attendiQuiete(page);
  expect(await dataMostrata(page)).toBe('15 March 2010');
  const prima = await page.evaluate(() => ({ vista: window.__ssTest!.vista(), t: window.__ssTest!.getTime() }));
  expect(prima.vista).not.toBeNull();

  // Il controllo ha l'etichetta bilingue fissa e le opzioni nella propria lingua.
  await apriImpostazioni(page);
  const lingua = page.getByRole('combobox', { name: 'Lingua / Language' });
  await expect(lingua).toHaveValue('en');
  await expect(lingua.locator('option[lang="it"]')).toHaveText('Italiano');
  await expect(lingua.locator('option[lang="en"]')).toHaveText('English');
  await Promise.all([page.waitForEvent('load'), lingua.selectOption('it')]);
  await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
  await attendiQuiete(page);

  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page).toHaveTitle(TIt.avvio.titolo);
  expect(await dataMostrata(page)).toBe('15 marzo 2010');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Giove');
  expect(new URL(page.url()).hash).toBe('#giove');
  const dopo = await page.evaluate(() => ({ vista: window.__ssTest!.vista(), t: window.__ssTest!.getTime(), pref: localStorage.getItem('ss.ui.lingua'), passaggio: sessionStorage.getItem('ss.ripristino') }));
  expect(dopo.pref).toBe('"it"');
  // Passaggio una tantum: letto e cancellato; la data non entra mai nelle preferenze (RF8).
  expect(dopo.passaggio).toBeNull();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /data|jd|tempo|istante/i.test(k)))).toEqual([]);
  expect(Math.abs(dopo.t.jdUT - prima.t.jdUT)).toBeLessThan(1e-6);
  expect(Math.abs(dopo.vista!.estensioneKm / prima.vista!.estensioneKm - 1)).toBeLessThan(1e-3);
  expect(dopo.vista!.fuoco).toBe(prima.vista!.fuoco);

  // Una seconda ricarica riparte normalmente: lingua salvata, data corrente.
  await page.reload();
  await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
  await attendiQuiete(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  expect(await dataMostrata(page)).not.toBe('15 marzo 2010');
  expect((await tempo(page)).jdUT).toBeGreaterThan(prima.t.jdUT);

  // La preferenza salvata prevale sul browser en-US; si torna all'inglese dalle Impostazioni.
  await page.getByRole('button', { name: TIt.barra.impostazioni }).click();
  const selettore = page.getByRole('combobox', { name: 'Lingua / Language' });
  await expect(selettore).toHaveValue('it');
  await Promise.all([page.waitForEvent('load'), selettore.selectOption('en')]);
  await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(a.errori).toEqual([]);
});

test('controllo della lingua: etichetta, tastiera e destinazione di almeno 24 px', async ({ page }) => {
  await apri(page);
  await apriImpostazioni(page);
  const lingua = page.getByRole('combobox', { name: 'Lingua / Language' });
  await lingua.focus();
  await expect(lingua).toBeFocused();
  const r = await lingua.boundingBox();
  expect(r!.height).toBeGreaterThanOrEqual(44);
  // Esc chiude il dialogo e il focus torna al pulsante delle Impostazioni.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: T.barra.impostazioni })).toBeFocused();
});

test('axe-core in inglese: avvio, scheda espansa, catalogo, ricerca, impostazioni, Fonti e metodi, editor della data', async ({ page }) => {
  const a = await apri(page);
  await axe(page, 'avvio');
  await page.getByRole('button', { name: T.messaggi.chiudiBenvenuto }).click();
  await page.locator('.ss-scheda button[aria-controls]').first().click();
  await axe(page, 'scheda espansa');
  await page.getByRole('button', { name: T.trova.apriCatalogoEsteso }).click();
  await axe(page, 'catalogo');
  await page.getByRole('button', { name: T.trova.apriCatalogoEsteso }).click();
  await page.getByRole('combobox', { name: T.trova.etichetta }).fill('eu');
  await expect(page.getByRole('listbox')).toBeVisible();
  await axe(page, 'risultati della ricerca');
  await page.keyboard.press('Escape');
  await apriImpostazioni(page);
  await axe(page, 'impostazioni');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: T.barra.fonti }).click();
  await axe(page, 'fonti e metodi');
  await page.keyboard.press('Escape');
  await page.locator('.ss-data').click();
  await axe(page, 'editor della data');
  verificaPulita(a);
});
