// Applicazione completa con i dati reali (build di test con window.__ssTest, npm run build:test):
// avvio senza errori, data attuale, posizioni plausibili di Sole, pianeti, lune, asteroidi, comete, TNO e
// interstellari, selezione, fuoco, preset, riproduzione con attraversamento dei blocchi, date limite
// (10000 a.C., 1582, 2120), texture e stelle, errore di caricamento con "Riprova", ripiego senza WebGL2,
// collegamento #slug, telefono (@telefono). Errori di caricamento e "Riprova" in rete.spec.ts.
// Schermate in test-results/e2e/ (prefisso app-).

import { expect, test } from '@playwright/test';
import { JD_MIN_UT, jdToCalendar } from '../src/time/calendar';
import { formatData } from '../src/ui/format';
import { CARTELLA, UA, apri, cerca, chiudiBenvenuto, distanza, preset, schermata, stato, verificaPulita } from './aiuti';
import type { StatoCorpo } from './aiuti';

test.describe('applicazione', () => {
  test('avvio: data attuale, posizioni plausibili, sequenza di caricamento, nessun errore', async ({ page }) => {
    const prima = 2_440_587.5 + Date.now() / 86_400_000;
    const a = await apri(page);
    const dopo = 2_440_587.5 + Date.now() / 86_400_000;
    // data iniziale: istante corrente in UT
    const attese = new Set([formatData(jdToCalendar(prima)), formatData(jdToCalendar(dopo))]);
    expect(attese.has((await page.locator('.ss-data-testo').textContent()) ?? '')).toBe(true);
    await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario gregoriano');
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Terra');

    // distanze eliocentriche (UA) entro l'intervallo perielio-afelio di ciascun corpo
    const intervalli: Record<string, [number, number]> = {
      mercurio: [0.307, 0.467],
      venere: [0.718, 0.729],
      terra: [0.983, 1.017],
      marte: [1.381, 1.666],
      giove: [4.95, 5.46],
      saturno: [9.0, 10.1],
      urano: [18.2, 20.1],
      nettuno: [29.8, 30.4],
      plutone: [29.6, 49.4],
      cerere: [2.55, 2.99],
      vesta: [2.15, 2.58],
      pallade: [2.13, 3.41],
      eris: [37.9, 97.7],
      sedna: [76, 937],
      chiron: [8.4, 18.9],
      '1p-halley': [0.58, 35.2],
      '67p-churyumov-gerasimenko': [1.2, 5.7],
      'c1995-o1-hale-bopp': [0.9, 370],
      '3i-atlas': [1.3, 100],
      '1i-oumuamua': [0.25, 200],
    };
    const r: Record<string, StatoCorpo> = {};
    for (const slug of [...Object.keys(intervalli), 'sole', 'luna', 'io', 'titano', 'tritone', 'caronte']) r[slug] = await stato(page, slug);
    for (const [slug, [min, max]] of Object.entries(intervalli)) {
      expect(r[slug]!.stato, slug).toBe('ok');
      const d = distanza(r[slug]!.r) / UA;
      expect(d, slug).toBeGreaterThanOrEqual(min);
      expect(d, slug).toBeLessThanOrEqual(max);
    }
    expect(r['sole']!.r).toEqual([0, 0, 0]);
    for (const p of ['mercurio', 'venere', 'terra', 'marte', 'giove', 'saturno', 'urano', 'nettuno']) expect(r[p]!.livello, p).toBe('precisa');
    // lune: distanza dal primario (km)
    const lune: [string, string, number, number][] = [
      ['luna', 'terra', 356_000, 407_000],
      ['io', 'giove', 419_000, 424_000],
      ['titano', 'saturno', 1_185_000, 1_258_000],
      ['tritone', 'nettuno', 354_000, 355_500],
      ['caronte', 'plutone', 19_500, 19_700],
    ];
    for (const [luna, primario, min, max] of lune) {
      const p = await stato(page, primario);
      const d = distanza(r[luna]!.r, p.r);
      expect(d, luna).toBeGreaterThan(min);
      expect(d, luna).toBeLessThan(max);
    }
    // Sole, Terra e Giove sullo schermo nella vista iniziale (Sistema interno)
    const pos = await page.evaluate(() => ['sole', 'terra', 'marte'].map((s) => window.__ssTest!.getScreenPosition(s)));
    for (const p of pos) expect(p?.visibile).toBe(true);
    await schermata(page, 'app-01-avvio');

    // sequenza del § 5.6: dati di base, blocco della data e moon.bin, poi affidabilità e stelle, poi adiacenti
    const iniziali = ['manifest.json', 'catalog.json', 'time.json', 'moon.bin', 'planets/p12.bin', 'sats/s12.bin', 'small/b12.bin'];
    for (const f of iniziali) expect(a.dati).toContain(f);
    const ultimoIniziale = Math.max(...iniziali.map((f) => a.dati.indexOf(f)));
    expect(a.dati.indexOf('reliability.bin')).toBeGreaterThan(ultimoIniziale);
    expect(a.dati.indexOf('stars.bin')).toBeGreaterThan(ultimoIniziale);
    if (a.dati.includes('small/b11.bin')) expect(a.dati.indexOf('small/b11.bin')).toBeGreaterThan(ultimoIniziale);
    verificaPulita(a);
  });

  test('selezione, fuoco, preset, texture e anelli', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    // clic sul marcatore di Marte
    const m = await page.evaluate(() => window.__ssTest!.getScreenPosition('marte'));
    expect(m?.visibile).toBe(true);
    const box = (await page.locator('.ss-mappa canvas').boundingBox())!;
    await page.mouse.click(box.x + m!.x, box.y + m!.y);
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');
    // ricerca e fuoco su Giove: texture caricata, hash aggiornato
    await cerca(page, 'giove');
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Giove');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#giove');
    await page.getByRole('button', { name: 'Inquadra il corpo selezionato' }).click();
    await page.evaluate(() => window.__ssTest!.waitIdle());
    await expect.poll(() => a.dati.includes('tex/giove.jpg')).toBe(true);
    await schermata(page, 'app-02-giove');
    // preset
    await preset(page, 'Terra e Luna');
    expect((await page.evaluate(() => window.__ssTest!.getScreenPosition('luna')))?.visibile).toBe(true);
    await schermata(page, 'app-03-terra-luna');
    await preset(page, 'Sistema di Giove');
    for (const s of ['io', 'europa', 'ganimede', 'callisto']) expect((await page.evaluate((x) => window.__ssTest!.getScreenPosition(x), s))?.visibile, s).toBe(true);
    await schermata(page, 'app-04-sistema-giove');
    // Saturno inquadrato: anelli dal catalogo
    await cerca(page, 'saturno');
    await page.getByRole('button', { name: 'Inquadra il corpo selezionato' }).click();
    await page.evaluate(() => window.__ssTest!.waitIdle());
    await expect.poll(() => a.dati.includes('tex/saturno.jpg')).toBe(true);
    await schermata(page, 'app-05-saturno');
    await preset(page, 'Pianeti giganti');
    await schermata(page, 'app-06-pianeti-giganti');
    await preset(page, 'Fascia di Kuiper');
    await schermata(page, 'app-07-fascia-kuiper');
    expect(a.dati).toContain('stars.bin');
    verificaPulita(a);
  });

  test('cambio di data: 10000 a.C., 1582 dalla console, 2120', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    // limite inferiore: 1° gennaio 10000 a.C., 00:00 UT (giuliano)
    await page.evaluate((jd) => window.__ssTest!.setTime(jd), JD_MIN_UT);
    await expect(page.locator('.ss-data-testo')).toHaveText('1° gennaio 10000 a.C.');
    await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario giuliano');
    expect((await stato(page, 'terra')).livello).toBe('approssimata');
    expect((await stato(page, 'luna')).livello).toBe('indicativa');
    expect((await stato(page, 'io')).livello).toBe('non-determinabile');
    expect((await stato(page, '1p-halley')).stato).toBe('non-determinabile');
    expect((await stato(page, 'eris')).stato).toBe('ok');
    await expect(page.getByText(/Ora incerta di ±28,6\u00a0h/)).toBeVisible();
    await schermata(page, 'app-08-10000ac');

    // 4 ottobre 1582 dall'editor della data, poi un giorno avanti: 15 ottobre, venerdì
    await page.locator('.ss-data').click();
    await page.locator('.ss-input--giorno').fill('04');
    await page.locator('.ss-input--mese').selectOption('10');
    await page.locator('.ss-input--anno').fill('1582');
    await page.getByRole('button', { name: 'd.C.' }).click();
    await page.locator('.ss-input--ora').first().fill('12');
    await page.locator('.ss-input--ora').nth(1).fill('00');
    await page.locator('.ss-input--ora').nth(1).press('Enter');
    await expect(page.locator('.ss-data-testo')).toHaveText('4 ottobre 1582');
    await expect(page.locator('.ss-settimana')).toHaveText('giovedì');
    await page.getByRole('button', { name: 'Avanti di un giorno' }).click();
    await expect(page.locator('.ss-data-testo')).toHaveText('15 ottobre 1582');
    await expect(page.locator('.ss-settimana')).toHaveText('venerdì');
    await page.evaluate(() => window.__ssTest!.waitIdle());
    expect((await stato(page, 'io')).stato).toBe('ok');
    expect((await stato(page, 'giove')).livello).toBe('precisa');
    await schermata(page, 'app-09-1582');

    // 31 dicembre 2120, 12:00 UT
    await page.evaluate(() => window.__ssTest!.setTime(2_495_739.0));
    await expect(page.locator('.ss-data-testo')).toHaveText('31 dicembre 2120');
    expect((await stato(page, 'bennu')).stato).toBe('non-determinabile');
    // Apophis: cloni dalla covarianza del 2021 (§ 7.6.2), dati fino al 13 settembre 2120; Itokawa fino al 2121
    expect((await stato(page, 'apophis')).stato).toBe('non-determinabile');
    expect((await stato(page, 'itokawa')).stato).toBe('ok');
    await schermata(page, 'app-10-2120');
    verificaPulita(a);
  });

  test('riproduzione: riancoraggio, attraversamento dei blocchi con attesa e ripresa', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(() => window.__ssTest!.setTime(2_455_621.5)); // 1° marzo 2011
    await page.getByRole('combobox', { name: 'Velocità' }).selectOption('6'); // 1 anno/s
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Pausa' }).click();
    const testo = (await page.locator('.ss-data-testo').textContent()) ?? '';
    expect(Number(/(\d{4})$/.exec(testo)?.[1])).toBeGreaterThanOrEqual(2012);
    // all'indietro a 1000 anni/s: blocchi 11, 10, 9 caricati durante la riproduzione
    await page.getByRole('combobox', { name: 'Velocità' }).selectOption('9');
    await page.getByRole('button', { name: "Riproduci all'indietro" }).click();
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${CARTELLA}app-11-riproduzione.png` });
    await page.getByRole('button', { name: 'Pausa' }).click();
    await page.evaluate(() => window.__ssTest!.waitIdle());
    const anno = (await page.locator('.ss-data-testo').textContent()) ?? '';
    expect(anno).not.toContain('2011');
    for (const f of ['planets/p10.bin', 'sats/s10.bin', 'small/b10.bin']) expect(a.dati).toContain(f);
    expect((await stato(page, 'marte')).stato).toBe('ok');
    await expect(page.locator('.ss-avvisi-elenco')).not.toContainText('Impossibile');
    verificaPulita(a);
  });

  test('tastiera (§ 11.9): ricerca, corpo successivo, deselezione, riproduzione con Spazio', async ({ page }) => {
    const a = await apri(page);
    await chiudiBenvenuto(page);
    await page.locator('.ss-mappa').focus();
    await page.keyboard.press('n');
    const primo = await page.locator('.ss-scheda-nome').textContent();
    expect(primo).not.toBeNull();
    await page.keyboard.press('n');
    await expect(page.locator('.ss-scheda-nome')).not.toHaveText(primo ?? '');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ss-scheda')).toBeHidden();
    await page.keyboard.press('/');
    await expect(page.getByRole('combobox', { name: 'Trova' })).toBeFocused();
    await page.keyboard.type('saturno');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Saturno');
    await page.evaluate(() => window.__ssTest!.waitIdle());
    // Spazio fuori da campi e pulsanti: avvia e ferma la riproduzione
    await page.locator('.ss-mappa').focus();
    const prima = await page.locator('.ss-data-testo').textContent();
    await page.getByRole('combobox', { name: 'Velocità' }).selectOption('7');
    await page.locator('.ss-mappa').focus();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
    await page.waitForTimeout(800);
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Riproduci', exact: true })).toBeVisible();
    await expect(page.locator('.ss-data-testo')).not.toHaveText(prima ?? '');
    verificaPulita(a);
  });

  test('collegamento #marte: corpo selezionato e inquadrato a livello di orbita', async ({ page }) => {
    const a = await apri(page, '/#marte');
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');
    await expect(page.locator('.ss-mappa')).toHaveAttribute('aria-label', /Marte/);
    // l'orbita intera (circa 3 UA) è nella vista: il Sole sullo schermo
    expect((await page.evaluate(() => window.__ssTest!.getScreenPosition('sole')))?.visibile).toBe(true);
    await schermata(page, 'app-13-hash-marte');
    verificaPulita(a);
  });

  test('senza WebGL2: messaggio e vista testuale con i dati reali', async ({ page }) => {
    await page.addInitScript(() => {
      const originale = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
        if (tipo === 'webgl2') return null;
        return (originale as (...x: unknown[]) => unknown).call(this, tipo, ...resto);
      } as typeof originale;
    });
    const a = await apri(page);
    await expect(page.getByText('Il browser non supporta la grafica 3D necessaria (WebGL2). Puoi usare la vista testuale.')).toBeVisible();
    await expect(page.locator('.ss-testuale')).toBeVisible();
    await expect(page.locator('.ss-testuale tbody tr').first()).toBeVisible();
    expect(await page.locator('.ss-testuale tbody tr').count()).toBeGreaterThan(100);
    expect((await stato(page, 'giove')).stato).toBe('ok');
    await page.screenshot({ path: `${CARTELLA}app-14-senza-webgl.png` });
    verificaPulita(a);
  });
});

test.describe('telefono', () => {
  test('avvio sul telefono: nessuno scorrimento orizzontale, dati e scena @telefono', async ({ page }) => {
    const a = await apri(page);
    const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    expect(m.s).toBeLessThanOrEqual(m.c);
    expect((await stato(page, 'terra')).stato).toBe('ok');
    await schermata(page, 'app-15-telefono');
    verificaPulita(a);
  });
});
