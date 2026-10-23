// Date limite e confini dei blocchi sull'applicazione reale (§ 2 I2, § 5.6, § 6.2, § 6.6, § 7.8.2, § 8.1):
// - 1° gennaio 10000 a.C. 00:00 UT e 31 dicembre 2120 23:59:59 UT: tutti i 112 corpi in stato coerente
//   ('ok' o 'non-determinabile', mai 'caricamento' o 'fuori-copertura'), nessun marcatore per i corpi non
//   determinabili, passi e riproduzione fermi al limite con messaggio;
// - riproduzione attraverso il confine tra i blocchi 10 e 11 con il blocco 11 trattenuto: attesa al confine con
//   "Caricamento dati per il periodo ...", nessun avanzamento oltre i dati, ripresa automatica;
// - continuità delle posizioni ai due lati del confine.

import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../src/time/calendar';
import {
  B,
  T0,
  apri,
  attendiQuiete,
  chiudiBenvenuto,
  distanza,
  impostaJd,
  posizione,
  schermata,
  stati,
  stato,
  tempo,
  verificaPulita,
} from './aiuti';
import type { StatoCorpo } from './aiuti';

const NB = ' ';
const SLUG = (JSON.parse(readFileSync(new URL('../public/data/v1/catalog.json', import.meta.url), 'utf-8')) as { corpi: { slug: string }[] }).corpi.map(
  (c) => c.slug,
);
const LIVELLI = new Set(['precisa', 'buona', 'approssimata', 'indicativa', 'non-determinabile']);

/** Tutti i corpi in uno stato coerente alla data corrente; restituisce il conteggio per stato e livello. */
async function verificaCoerenza(page: Page): Promise<Record<string, number>> {
  const s = await stati(page, SLUG);
  const conteggio: Record<string, number> = {};
  for (const slug of SLUG) {
    const x: StatoCorpo = s[slug]!;
    conteggio[`${x.stato}/${x.livello}`] = (conteggio[`${x.stato}/${x.livello}`] ?? 0) + 1;
    expect(['ok', 'non-determinabile'], `${slug}: stato ${x.stato}`).toContain(x.stato);
    expect(LIVELLI.has(x.livello), `${slug}: livello ${x.livello}`).toBe(true);
    if (x.stato === 'ok') {
      expect([...x.r, ...x.v].every((v) => Number.isFinite(v)), `${slug}: stato finito`).toBe(true);
      if (slug !== 'sole') expect(distanza(x.r), slug).toBeGreaterThan(0);
    } else {
      expect(x.livello, `${slug}: non determinabile`).toBe('non-determinabile');
    }
    // Nessun marcatore per i corpi non determinabili (§ 7.8.2).
    if (x.livello === 'non-determinabile') expect((await posizione(page, slug))?.visibile ?? false, `${slug}: marcatore`).toBe(false);
  }
  // Sole e pianeti sempre disponibili.
  for (const p of ['sole', 'mercurio', 'venere', 'terra', 'marte', 'giove', 'saturno', 'urano', 'nettuno', 'plutone']) {
    expect(s[p]!.stato, p).toBe('ok');
  }
  return conteggio;
}

/** Etichette dei pianeti interni visibili dopo il cambio di data. */
async function etichetteVisibili(page: Page, nomi: string[]): Promise<void> {
  for (const n of nomi) {
    await expect(page.locator('.ss-etichetta', { hasText: new RegExp(`^${n}`) }), `etichetta ${n}`).toHaveCSS('visibility', 'visible');
  }
}

test.describe('date limite', () => {
  test('1° gennaio 10000 a.C. 00:00 UT: tutti i corpi coerenti, passo indietro fermo al limite', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, JD_MIN_UT);
    expect((await tempo(page)).jdUT).toBe(JD_MIN_UT);
    await expect(page.locator('.ss-data-testo')).toHaveText(`1° gennaio 10000${NB}a.C.`);
    await expect(page.locator('.ss-data-ora')).toHaveText('00:00 UT');
    await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario giuliano');
    const c = await verificaCoerenza(page);
    test.info().annotations.push({ type: 'stati a 10000 a.C.', description: JSON.stringify(c) });
    await etichetteVisibili(page, ['Mercurio', 'Venere', 'Terra', 'Marte']);
    await schermata(page, 'limiti-01-10000ac');
    // Passo indietro: fermo con messaggio; riproduzione all'indietro ferma al limite.
    const indietro = page.getByRole('button', { name: 'Indietro di un giorno' });
    await expect(indietro).toHaveAttribute('aria-disabled', 'true');
    // Pulsante con aria-disabled: resta attivabile da tastiera e mostra il messaggio.
    await indietro.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ss-avviso--info')).toContainText(`Raggiunto il limite inferiore: 1° gennaio 10000${NB}a.C., 00:00 UT`);
    await page.getByRole('button', { name: "Riproduci all'indietro" }).click();
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Riproduci', exact: true })).toBeVisible();
    expect((await tempo(page)).jdUT).toBe(JD_MIN_UT);
    // Vista testuale: tutti i corpi elencati.
    await page.keyboard.press('t');
    await expect(page.locator('.ss-testuale')).toBeVisible();
    expect(await page.locator('.ss-testuale tbody tr').count()).toBeGreaterThanOrEqual(SLUG.length - 1);
    await schermata(page, 'limiti-02-10000ac-tabella');
    await page.keyboard.press('t');
    await attendiQuiete(page);
    verificaPulita(a);
  });

  test('istante in TT al limite inferiore: un mese avanti e uno indietro tornano al limite con messaggio e pulsante disattivato', async ({ page }) => {
    // TT_min non cade sulla griglia del millisecondo della data mostrata: il ritorno deve essere esatto (§ 6.6).
    const a = await apri(page);
    await chiudiBenvenuto(page);
    await page.locator('.ss-data').click();
    await page.locator('.ss-avanzate summary').click();
    await page.getByLabel("Inserisci l'istante in TT").check();
    await page.keyboard.press('Escape');
    await attendiQuiete(page);
    await page.selectOption('.ss-unita', 'mese');
    await page.locator('.ss-regolo [role=slider]').first().focus();
    await page.keyboard.press('Home');
    await attendiQuiete(page);
    const limite = (await tempo(page)).jdTT;
    const indietro = page.getByRole('button', { name: 'Indietro di un mese' });
    await expect(indietro).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Avanti di un mese' }).click();
    await expect(indietro).not.toHaveAttribute('aria-disabled', 'true');
    expect((await tempo(page)).jdTT).toBeGreaterThan(limite);
    await indietro.click();
    // Al primo ritorno: istante esatto del limite, pulsante disattivato e messaggio del limite.
    expect((await tempo(page)).jdTT).toBe(limite);
    await expect(indietro).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.ss-avviso--info')).toContainText(`Raggiunto il limite inferiore: 6 gennaio 10000${NB}a.C., 01:46 TT`);
    verificaPulita(a);
  });

  test('31 dicembre 2120 23:59:59 UT: tutti i corpi coerenti, passo avanti e riproduzione fermi al limite', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const ultimo = JD_MAX_UT_EXCL - 1 / 86_400;
    await impostaJd(page, ultimo);
    const t = await tempo(page);
    expect(t.jdUT).toBe(ultimo);
    expect(t.jdTT).toBeLessThan(T0 + 13 * B);
    await expect(page.locator('.ss-data-testo')).toHaveText('31 dicembre 2120');
    await expect(page.locator('.ss-data-ora')).toHaveText('23:59 UT');
    const c = await verificaCoerenza(page);
    test.info().annotations.push({ type: 'stati al 2120', description: JSON.stringify(c) });
    await etichetteVisibili(page, ['Mercurio', 'Venere', 'Terra', 'Marte']);
    await schermata(page, 'limiti-03-2120');
    const avanti = page.getByRole('button', { name: 'Avanti di un giorno' });
    await expect(avanti).toHaveAttribute('aria-disabled', 'true');
    await avanti.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ss-avviso--info')).toContainText('Raggiunto il limite superiore: 31 dicembre 2120');
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Riproduci', exact: true })).toBeVisible();
    expect((await tempo(page)).jdUT).toBeLessThan(JD_MAX_UT_EXCL);
    // Editor: 1° gennaio 2121 fuori intervallo.
    await page.locator('.ss-data').click();
    await page.locator('.ss-input--giorno').fill('1');
    await page.locator('.ss-input--mese').selectOption({ label: 'gennaio' });
    await page.locator('.ss-input--anno').fill('2121');
    await page.locator('.ss-input--ora').nth(1).press('Enter');
    await expect(page.locator('.ss-editor-messaggio')).toHaveText(`Sono disponibili le date dal 1° gennaio 10000${NB}a.C. al 31 dicembre 2120 (UT).`);
    await page.keyboard.press('Escape');
    await attendiQuiete(page);
    verificaPulita(a);
  });
});

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

test.describe('confini dei blocchi', () => {
  test('riproduzione attraverso il confine 9/10: attesa del blocco trattenuto e ripresa automatica', async ({ page }) => {
    // Confine tra i blocchi 9 e 10 (TDB, anno 9 circa): all'avvio sono già in memoria i blocchi 12 e 11.
    const CONFINE = T0 + 10 * B;
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const h = await trattieni(page, /\/data\/v1\/(planets\/p10|sats\/s10|small\/b10)\.bin$/);
    // Circa 100 giorni prima del confine: blocco 9 caricato, blocco 10 richiesto (entro 50 anni) e trattenuto.
    page.evaluate((jd) => window.__ssTest!.setTime(jd), CONFINE - 100).catch(() => undefined);
    // Tutti i file del blocco 9 pronti (pianeti, satelliti, piccoli corpi, Luna); blocco 10 richiesto.
    for (const slug of ['marte', 'luna', 'io', 'cerere']) {
      await expect.poll(async () => (await stato(page, slug)).stato, { timeout: 60_000, message: slug }).not.toBe('caricamento');
    }
    await expect.poll(() => h.richieste(), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.getByRole('combobox', { name: 'Velocità' }).selectOption({ label: '1 anno/s' });
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    // Al confine la riproduzione attende: stato visibile, data ferma prima del confine, corpi disegnati.
    await expect(page.locator('.ss-caricamento-testo')).toContainText('Caricamento dati per il periodo', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
    await expect.poll(async () => (await tempo(page)).jdTT, { timeout: 20_000 }).toBeGreaterThan(CONFINE - 30);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(400);
      const t = await tempo(page);
      expect(t.jdTT).toBeLessThan(CONFINE);
      expect(t.jdTT).toBeGreaterThan(CONFINE - 30);
      expect((await stato(page, 'marte')).stato).toBe('ok');
    }
    expect((await posizione(page, 'sole'))?.visibile).toBe(true);
    await schermata(page, 'limiti-04-attesa-confine', false);
    // Dati disponibili: la riproduzione riprende da sola e attraversa il confine.
    h.rilascia();
    await expect.poll(async () => (await tempo(page)).jdTT, { timeout: 60_000 }).toBeGreaterThan(CONFINE + 60);
    await page.getByRole('button', { name: 'Pausa' }).click();
    await attendiQuiete(page);
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    await expect(page.locator('.ss-avvisi-elenco')).not.toContainText('Impossibile');
    for (const slug of ['marte', 'giove', 'luna', 'cerere']) expect((await stato(page, slug)).stato, slug).toBe('ok');
    verificaPulita(a);
  });

  test('continuità delle posizioni ai due lati dei confini 11/12 e 10/11', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    const corpi = ['mercurio', 'venere', 'terra', 'marte', 'giove', 'saturno', 'urano', 'nettuno', 'plutone', 'luna', 'io', 'titano', 'tritone', 'cerere', 'vesta', 'eris'];
    const righe: string[] = [];
    for (const k of [12, 11]) {
      const confine = T0 + k * B;
      await impostaJd(page, confine);
      const dT = (await tempo(page)).deltaT / 86_400;
      const lati: Record<string, StatoCorpo>[] = [];
      const istanti: number[] = [];
      for (const d of [-1, 1]) {
        await impostaJd(page, confine - dT + d / 86_400);
        const t = await tempo(page);
        expect(Math.sign(t.jdTT - confine), `lato ${d} del confine ${k}`).toBe(d);
        istanti.push(t.jdTT);
        lati.push(await stati(page, corpi));
      }
      const dt = (istanti[1]! - istanti[0]!) * 86_400;
      for (const slug of corpi) {
        const p = lati[0]![slug]!;
        const q = lati[1]![slug]!;
        if (p.stato !== 'ok' || q.stato !== 'ok') {
          righe.push(`${k} ${slug}: ${p.stato}/${q.stato}`);
          continue;
        }
        // Salto oltre il moto previsto con la velocità media (km).
        const salto = Math.hypot(
          q.r[0]! - p.r[0]! - 0.5 * (p.v[0]! + q.v[0]!) * dt,
          q.r[1]! - p.r[1]! - 0.5 * (p.v[1]! + q.v[1]!) * dt,
          q.r[2]! - p.r[2]! - 0.5 * (p.v[2]! + q.v[2]!) * dt,
        );
        righe.push(`${k} ${slug}: ${salto.toFixed(4)} km`);
        // A4: continuità dei pianeti ai confini inferiore a 1 km; per gli altri corpi 1e-6 della distanza dal Sole.
        const soglia = ['mercurio', 'venere', 'marte', 'giove', 'saturno', 'urano', 'nettuno', 'plutone'].includes(slug) ? 1 : Math.max(1, 1e-6 * distanza(p.r));
        expect(salto, `${slug} al confine ${k}`).toBeLessThan(soglia);
      }
    }
    test.info().annotations.push({ type: 'salti ai confini', description: righe.join('\n') });
    verificaPulita(a);
  });
});
