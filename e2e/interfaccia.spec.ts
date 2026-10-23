// Interfaccia sull'applicazione reale (§ 11): sovrapposizioni tra pannelli, editor della data, live region,
// vista testuale, scheda, ricerca, regolo, collegamenti e layout del telefono. Ogni prova riproduce un caso
// osservato: misure con getBoundingClientRect ed elementFromPoint, testi letti dal DOM.

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { apri, attendiQuiete, cerca, chiudiBenvenuto, impostaJd, preset, tempo } from './aiuti';

const NB = ' ';

interface OpzioniSessione {
  larghezza: number;
  altezza: number;
  tocco?: boolean;
  /** Nota di benvenuto già chiusa (preferenza salvata). */
  senzaBenvenuto?: boolean;
  /** Script iniettato prima dell'avvio. */
  iniziale?: () => void;
}

async function sessione(browser: Browser, o: OpzioniSessione, percorso = '/'): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: o.tocco ?? false,
    isMobile: o.tocco ?? false,
    deviceScaleFactor: 1,
  });
  if (o.senzaBenvenuto ?? true) await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
  if (o.iniziale) await ctx.addInitScript(o.iniziale);
  const page = await ctx.newPage();
  await apri(page, percorso);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

type Rett = { x0: number; y0: number; x1: number; y1: number };

function rettangolo(page: Page, selettore: string): Promise<Rett> {
  return page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  });
}

function intersecano(a: Rett, b: Rett): boolean {
  return a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
}

/** Vero se il punto centrale dell'elemento appartiene all'elemento stesso (non è coperto). */
function liberoAlCentro(page: Page, selettore: string): Promise<boolean> {
  return page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t !== null && (t === el || el.contains(t));
  });
}

/** Testi scritti nella live region, registrati da un MutationObserver. */
async function registraAnnunci(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __annunci: string[] };
    w.__annunci = [];
    const r = document.querySelector('.ss-annunci')!;
    new MutationObserver(() => w.__annunci.push(r.textContent ?? '')).observe(r, { childList: true, characterData: true, subtree: true });
  });
}

/** Espande la scheda e attende il ridisegno (i pannelli si aggiornano al fotogramma successivo). */
async function espandiScheda(page: Page): Promise<void> {
  await attendiQuiete(page);
  const espandi = page.getByRole('button', { name: 'Espandi la scheda' });
  if (await espandi.isVisible()) await espandi.click();
  await expect(page.locator('.ss-scheda')).not.toHaveClass(/ss-scheda--ridotta/);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function annunci(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __annunci: string[] }).__annunci);
}

test.describe('pannelli e sovrapposizioni', () => {
  test('desktop: il catalogo aperto non copre la legenda permanente (§ 11.5.1)', async ({ browser }) => {
    for (const [w, h] of [
      [1024, 768],
      [1280, 800],
      [1440, 900],
    ] as const) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h });
      await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
      await expect(page.locator('.ss-catalogo')).toBeVisible();
      const cat = await rettangolo(page, '.ss-catalogo');
      const leg = await rettangolo(page, '.ss-legenda');
      expect(intersecano(cat, leg), `${w}x${h}: catalogo ${JSON.stringify(cat)} legenda ${JSON.stringify(leg)}`).toBe(false);
      await ctx.close();
    }
  });

  test('tablet: con la vista testuale aperta la scheda non copre Aggiorna e Chiudi', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 768, altezza: 1024 });
    await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', 'tablet');
    await page.getByRole('button', { name: 'Vista testuale' }).click();
    await expect(page.locator('.ss-testuale')).toBeVisible();
    expect(await liberoAlCentro(page, '.ss-testuale .ss-pannello-azioni .ss-pulsante:not(.ss-pulsante--icona)')).toBe(true);
    expect(await liberoAlCentro(page, ".ss-testuale button[aria-label='Chiudi la vista testuale']")).toBe(true);
    await page.getByRole('button', { name: 'Chiudi la vista testuale' }).click({ timeout: 5000 });
    await expect(page.locator('.ss-testuale')).toBeHidden();
    await ctx.close();
  });

  test('telefono: la nota di benvenuto non copre i controlli del foglio esteso (400, 600 e 699 px)', async ({ browser }) => {
    for (const [w, h] of [
      [400, 800],
      [600, 480],
      [699, 700],
    ] as const) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, tocco: true, senzaBenvenuto: false });
      await expect(page.locator('.ss-app'), `${w}x${h}`).toHaveAttribute('data-layout', 'telefono');
      await expect(page.locator('.ss-benvenuto'), `${w}x${h}`).toBeVisible();
      await cerca(page, 'Giove');
      await expect(page.locator('.ss-app'), `${w}x${h}`).toHaveAttribute('data-foglio', 'esteso');
      for (const sel of ['.ss-maniglia', '.ss-data', '.ss-riproduci', '.ss-velocita']) expect(await liberoAlCentro(page, sel), `${w}x${h}: ${sel}`).toBe(true);
      await ctx.close();
    }
  });

  test('telefono in orizzontale: pannello laterale anche sotto i 700 px; il corpo a fuoco resta nell’area libera', async ({ browser }) => {
    for (const [w, h] of [
      [568, 320],
      [640, 360],
    ] as const) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, tocco: true });
      await expect(page.locator('.ss-app'), `${w}x${h}`).toHaveAttribute('data-layout', 'orizzontale');
      await page.evaluate(() => window.__ssTest!.focus('saturno'));
      const p = await page.evaluate(() => window.__ssTest!.getScreenPosition('saturno'));
      expect(p, `${w}x${h}`).not.toBeNull();
      // Il punto del corpo a fuoco è nella mappa e non sotto il pannello laterale.
      const sottoPannello = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.ss-foglio') !== null, [p!.x, p!.y]);
      const mappa = await rettangolo(page, '.ss-mappa');
      const foglio = await rettangolo(page, '.ss-foglio');
      expect(sottoPannello, `${w}x${h}: il corpo a fuoco è sotto il pannello`).toBe(false);
      expect(p!.x, `${w}x${h}`).toBeLessThan(foglio.x0);
      expect(p!.x, `${w}x${h}`).toBeGreaterThan(mappa.x0);
      const scorrimento = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scorrimento).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });

  test('soglie di larghezza (§ 11.3): telefono fino a 699 px, tablet da 700 px, pannello laterale con altezza < 480 px anche sopra i 699 px', async ({ browser }) => {
    const casi = [
      { w: 699, h: 480, atteso: 'telefono' },
      { w: 699, h: 700, atteso: 'telefono' },
      { w: 699, h: 700, atteso: 'telefono', tocco: true },
      { w: 700, h: 480, atteso: 'tablet' },
      { w: 700, h: 700, atteso: 'tablet' },
      { w: 699, h: 479, atteso: 'orizzontale' },
      { w: 700, h: 479, atteso: 'orizzontale' },
    ] as const;
    for (const c of casi) {
      const caso = `${c.w}x${c.h}${'tocco' in c ? ' tocco' : ''}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, tocco: 'tocco' in c });
      await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', c.atteso);
      const foglio = await rettangolo(page, '.ss-foglio');
      const visibile = (sel: string) => page.locator(sel).first().isVisible();
      if (c.atteso === 'telefono') {
        // Foglio inferiore a tutta larghezza con la maniglia; Menu al posto di Fonti e Impostazioni; pulsanti +, − e
        // Inquadra sulla mappa; scheda e catalogo nel foglio; legenda sotto la barra superiore.
        expect(foglio.x0, `${caso}: foglio a sinistra`).toBeCloseTo(0, 0);
        expect(foglio.x1, `${caso}: foglio a destra`).toBeCloseTo(c.w, 0);
        expect(foglio.y1, `${caso}: foglio in basso`).toBeCloseTo(c.h, 0);
        expect(await visibile('.ss-maniglia'), `${caso}: maniglia`).toBe(true);
        expect(await visibile('.ss-zoom-mobile'), `${caso}: pulsanti della mappa`).toBe(true);
        expect(await visibile('.ss-chip-scheda'), `${caso}: «Apri la scheda»`).toBe(true);
        expect(await visibile('.ss-strumenti .ss-solo-telefono'), `${caso}: Menu`).toBe(true);
        expect(await visibile('.ss-strumenti .ss-solo-ampio'), `${caso}: Fonti e Impostazioni`).toBe(false);
        expect(await visibile('.ss-distanze'), `${caso}: colonna delle distanze`).toBe(false);
        await expect(page.locator('.ss-foglio-corpo .ss-scheda'), `${caso}: scheda nel foglio`).toHaveCount(1);
        expect((await rettangolo(page, '.ss-legenda')).y0, `${caso}: legenda sotto la barra`).toBeGreaterThanOrEqual((await rettangolo(page, '.ss-barra')).y1);
      } else if (c.atteso === 'tablet') {
        expect(foglio.x0, `${caso}: console a sinistra`).toBeCloseTo(16, 0);
        expect(await visibile('.ss-maniglia'), `${caso}: maniglia`).toBe(false);
        expect(await visibile('.ss-zoom-mobile'), `${caso}: pulsanti della mappa del telefono`).toBe(false);
        expect(await visibile('.ss-chip-scheda'), `${caso}: «Apri la scheda»`).toBe(false);
        expect(await visibile('.ss-strumenti .ss-solo-telefono'), `${caso}: Menu`).toBe(false);
        expect(await visibile('.ss-strumenti .ss-solo-ampio'), `${caso}: Fonti e Impostazioni`).toBe(true);
        expect(await visibile('.ss-distanze'), `${caso}: colonna delle distanze`).toBe(true);
        await expect(page.locator('.ss-ancora-scheda .ss-scheda'), `${caso}: scheda accanto ai controlli`).toHaveCount(1);
        expect((await rettangolo(page, '.ss-scheda')).x1 - (await rettangolo(page, '.ss-scheda')).x0, `${caso}: scheda`).toBeCloseTo(320, 0);
      } else {
        expect(foglio.x1 - foglio.x0, `${caso}: pannello laterale`).toBeCloseTo(320, 0);
        expect(foglio.x1, `${caso}: pannello a destra`).toBeCloseTo(c.w - 16, 0);
        expect(await visibile('.ss-maniglia'), `${caso}: maniglia`).toBe(false);
        expect(await visibile('.ss-zoom-mobile'), `${caso}: pulsanti della mappa`).toBe(true);
        expect(await visibile('.ss-strumenti .ss-solo-telefono'), `${caso}: Menu`).toBe(true);
        expect(await visibile('.ss-distanze'), `${caso}: colonna delle distanze`).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${caso}: scorrimento orizzontale`).toBeLessThanOrEqual(0);
      await ctx.close();
    }
  });

  test('passaggio per la soglia dei 700 px senza ricaricare: scheda e catalogo cambiano posto, il foglio compare e scompare, il focus resta visibile', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 700, altezza: 700 });
    await cerca(page, 'Giove');
    await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', 'tablet');
    await expect(page.locator('.ss-ancora-scheda .ss-scheda')).toHaveCount(1);
    await page.locator('.ss-scheda button[aria-controls]').first().focus();
    for (const [w, layout] of [
      [699, 'telefono'],
      [700, 'tablet'],
      [650, 'telefono'],
      [768, 'tablet'],
      [699, 'telefono'],
    ] as const) {
      await page.setViewportSize({ width: w, height: 700 });
      await expect(page.locator('.ss-app'), `${w} px`).toHaveAttribute('data-layout', layout);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(page.locator(layout === 'telefono' ? '.ss-foglio-corpo .ss-scheda' : '.ss-ancora-scheda .ss-scheda'), `${w} px: posto della scheda`).toHaveCount(1);
      expect(await liberoAlCentro(page, '.ss-scheda-nome'), `${w} px: nome della scheda visibile`).toBe(true);
      expect(await page.evaluate(() => document.activeElement !== document.body && (document.activeElement?.getClientRects().length ?? 0) > 0), `${w} px: focus su un elemento visibile`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${w} px: scorrimento orizzontale`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });

  test('telefono: etichette della velocità intere nel foglio compatto ed esteso (320, 400 e 699 px)', async ({ browser }) => {
    for (const w of [320, 400, 699]) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: 700, tocco: true });
      for (const foglio of ['compatto', 'esteso'] as const) {
        if (foglio === 'esteso') await cerca(page, 'Marte');
        await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', foglio);
        const n = await page.locator('.ss-velocita option').count();
        for (let i = 0; i < n; i++) {
          await page.selectOption('.ss-velocita', String(i));
          const m = await page.evaluate(() => {
            const s = document.querySelector<HTMLSelectElement>('.ss-velocita')!;
            const cs = getComputedStyle(s);
            const c = document.createElement('canvas').getContext('2d')!;
            c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const testo = s.options[s.selectedIndex]!.text;
            // Spazio per il testo: larghezza interna meno i margini interni e la freccia nativa (16 px).
            const utile = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 16;
            return { testo, larghezza: c.measureText(testo).width, utile };
          });
          expect(m.larghezza, `${w} px, ${foglio}: «${m.testo}»`).toBeLessThanOrEqual(m.utile);
        }
        // La data non si sovrappone al pulsante di riproduzione.
        const data = await rettangolo(page, '.ss-data');
        const rip = await rettangolo(page, '.ss-riproduci');
        expect(data.x1, `${w} px, ${foglio}`).toBeLessThanOrEqual(rip.x0 + 0.5);
      }
      await ctx.close();
    }
  });
});

test.describe('editor della data', () => {
  test('in orizzontale l’editor è largo e "Vai" funziona', async ({ browser }) => {
    for (const [w, h] of [
      [915, 412],
      [640, 360],
    ] as const) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, tocco: true });
      await page.locator('.ss-data').click();
      const ed = await rettangolo(page, '.ss-editor');
      expect(ed.x1 - ed.x0, `${w}x${h}`).toBeGreaterThan(300);
      expect(await liberoAlCentro(page, '.ss-editor .ss-input--anno'), `${w}x${h}`).toBe(true);
      await page.locator('.ss-editor .ss-input--anno').fill('1999');
      await page.locator('.ss-editor .ss-pulsante--primario').click({ timeout: 5000 });
      await attendiQuiete(page);
      await expect(page.locator('.ss-editor')).toBeHidden();
      await expect(page.locator('.ss-data-breve, .ss-data-testo').first()).toContainText('1999');
      await ctx.close();
    }
  });

  test('senza WebGL2 e con catalogo o tabella aperti l’editor resta in primo piano', async ({ browser }) => {
    const senzaWebGL = () => {
      const originale = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
        if (tipo === 'webgl2' || tipo === 'webgl') return null;
        return (originale as (...x: unknown[]) => unknown).call(this, tipo, ...resto);
      } as typeof originale;
    };
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900, iniziale: senzaWebGL });
    await expect(page.locator('.ss-testuale')).toBeVisible();
    await page.locator('.ss-data').click();
    for (const sel of ['.ss-editor-titolo', '.ss-input--giorno', '.ss-input--anno', '.ss-segmento', '.ss-editor .ss-pulsante--primario']) {
      expect(await liberoAlCentro(page, sel), `senza WebGL2: ${sel}`).toBe(true);
    }
    await page.locator('.ss-segmento', { hasText: 'a.C.' }).click({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await ctx.close();

    const s2 = await sessione(browser, { larghezza: 1024, altezza: 768 });
    await s2.page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await s2.page.locator('.ss-data').click();
    for (const sel of ['.ss-editor-titolo', '.ss-input--giorno', '.ss-input--mese', '.ss-input--anno']) {
      expect(await liberoAlCentro(s2.page, sel), `catalogo aperto: ${sel}`).toBe(true);
    }
    await s2.ctx.close();
  });

  test('chiudere l’editor senza modifiche non cambia l’istante né azzera i secondi', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    const jd0 = 2_461_332.5 + 37.5 / 86_400 + 10 / 1440;
    await impostaJd(page, jd0);
    await page.locator('.ss-data').click();
    await page.locator('.ss-editor').getByRole('button', { name: 'Chiudi', exact: true }).click();
    expect(Math.abs((await tempo(page)).jdUT - jd0) * 86_400).toBeLessThan(0.001);
    // Uscita dal gruppo verso le opzioni avanzate e passaggio a TT: stesso istante.
    const jd1 = 2_451_545 - 63.83 / 86_400;
    await impostaJd(page, jd1);
    const t1 = await tempo(page);
    await page.locator('.ss-data').click();
    await page.locator('.ss-avanzate summary').click();
    expect(Math.abs((await tempo(page)).jdTT - t1.jdTT) * 86_400).toBeLessThan(0.001);
    await page.getByText("Inserisci l'istante in TT").click();
    expect(Math.abs((await tempo(page)).jdTT - t1.jdTT) * 86_400).toBeLessThan(0.001);
    await page.keyboard.press('Escape');
  });

  test('editor aperto durante la riproduzione: la pausa non riavvolge l’istante', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_333.75);
    await page.selectOption('.ss-velocita', '3');
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await page.waitForTimeout(500);
    await page.locator('.ss-data').click();
    const apertura = (await tempo(page)).jdUT;
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Pausa', exact: true }).click();
    const dopo = (await tempo(page)).jdUT;
    expect(dopo - apertura, 'giorni avanzati con l’editor aperto').toBeGreaterThan(1.5);
  });

  test('"Segui l’ora attuale" resta attivo aprendo e chiudendo l’editor', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.getByRole('button', { name: 'Impostazioni' }).first().click();
    await page.getByText("Segui l'ora attuale").click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ss-adesso')).toHaveClass(/ss-attivo/);
    await page.locator('.ss-data').click();
    await page.locator('.ss-editor').getByRole('button', { name: 'Chiudi', exact: true }).click();
    await expect(page.locator('.ss-adesso')).toHaveClass(/ss-attivo/);
    await expect(page.locator('.ss-riproduci')).toHaveAttribute('aria-label', 'Pausa');
  });
});

test.describe('live region e annunci', () => {
  test('a caricamento concluso la live region non riporta più "Caricamento dati"', async ({ page }) => {
    await apri(page);
    await page.waitForTimeout(2000);
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    expect(await page.locator('.ss-annunci').textContent()).not.toMatch(/^Caricamento dati/);
  });

  test('regolo: una sola lettura della data per pressione, al rilascio', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_332.5);
    await page.waitForTimeout(1600);
    await registraAnnunci(page);
    await page.locator('.ss-regolo-inf').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(3200);
    expect(await annunci(page)).toEqual([`20 ottobre 2026, 00:00 UT, martedì`]);
  });

  test('riproduzione in attesa dei dati: il periodo compare una sola volta', async ({ page }) => {
    await page.route(/\/data\/v1\/(planets\/p09|sats\/s09|small\/b09)\.bin/, async (r) => {
      await new Promise((f) => setTimeout(f, 12_000));
      await r.continue();
    });
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 1_721_423.5 + 300 * 365.25);
    await page.selectOption('.ss-velocita', '8');
    await page.getByRole('button', { name: "Riproduci all'indietro" }).click();
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await expect(page.locator('.ss-attesa')).toBeVisible({ timeout: 9000 });
    await expect(page.locator('.ss-caricamento-testo')).toBeVisible();
    const barra = (await page.locator('.ss-caricamento-testo').textContent()) ?? '';
    const attesa = (await page.locator('.ss-attesa').textContent()) ?? '';
    expect(barra).toContain('Caricamento dati per il periodo');
    expect(attesa).not.toBe(barra);
    expect(attesa).not.toContain('il periodo');
    await page.getByRole('button', { name: 'Pausa', exact: true }).click();
  });
});

test.describe('vista testuale', () => {
  test('Sole e Terra: valori non applicabili distinti; stessa distanza Sole-Terra con le stesse cifre', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_332.94);
    await page.keyboard.press('t');
    const riga = (nome: string) =>
      page.locator('.ss-testuale tbody tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${nome}$`) }) }).first();
    const sole = await riga('Sole').locator('td').allTextContents();
    const terra = await riga('Terra').locator('td').allTextContents();
    // Colonne: categoria, distanza dal Sole, distanza dalla Terra, coordinate, affidabilità.
    expect(sole[1]).toBe('non applicabile');
    expect(sole[3]).toBe('non applicabile');
    expect(sole[4]).toBe('non applicabile');
    expect(terra[2]).toBe('non applicabile');
    expect(sole[2]).toBe(terra[1]);
    // Luna: distanza dalla Terra senza "≈" e con almeno 4 cifre (errore di circa 1′ a 400 000 km).
    const luna = await riga('Luna').locator('td').allTextContents();
    expect(luna[2]).not.toContain('≈');
    expect((luna[2] ?? '').replace(/\D/g, '').replace(/0+$/, '').length).toBeGreaterThanOrEqual(4);
  });

  test('ordinamento per Corpo: designazioni numeriche in ordine numerico, nei due versi', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.keyboard.press('t');
    const intestazione = page.locator('.ss-testuale thead button', { hasText: 'Corpo' });
    const nomi = () => page.locator('.ss-testuale tbody th.ss-col-corpo').allTextContents();
    const posizioni = (elenco: string[], voci: string[]) => voci.map((v) => elenco.findIndex((n) => n.trim() === v));
    const attesi = ['1I/ʻOumuamua', '1P/Halley', '2I/Borisov', '2P/Encke', '3I/ATLAS', '9P/Tempel 1', '12P/Pons-Brooks', '19P/Borrelly', '52 Europa', '81P/Wild 2', '103P/Hartley 2', '109P/Swift-Tuttle'];
    await intestazione.click();
    const crescente = await nomi();
    const pos = posizioni(crescente, attesi);
    expect(pos.every((i) => i >= 0), `nomi presenti: ${pos.join(',')}`).toBe(true);
    expect(pos, 'ordine crescente: 1P, 9P, 12P, 103P').toEqual([...pos].sort((a, b) => a - b));
    await intestazione.click();
    const decrescente = await nomi();
    expect(decrescente).toEqual([...crescente].reverse());
  });

  test('chiudendo con T il focus torna al pulsante della vista testuale', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.getByRole('button', { name: 'Vista testuale' }).click();
    await page.locator('.ss-testuale thead button', { hasText: 'Affidabilità' }).click();
    await page.keyboard.press('t');
    await expect(page.locator('.ss-testuale')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Tabella: vista testuale');
  });
});

test.describe('scheda', () => {
  test('avviso della categoria nascosta visibile con la scheda ridotta', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await page.locator('.ss-casella--filtro', { hasText: 'Lune' }).click();
    await page.keyboard.press('Escape');
    await cerca(page, 'Titano');
    await expect(page.locator('.ss-scheda')).toHaveClass(/ss-scheda--ridotta/);
    await expect(page.locator('.ss-scheda .ss-avviso')).toBeVisible();
    await expect(page.locator('.ss-scheda .ss-avviso')).toContainText('Lune nascoste dai filtri');
    await ctx.close();
  });

  test('voci leggibili: etichette non compresse, URL a capo, nessuno scorrimento orizzontale', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    for (const slug of ['io', 'sole', 'cerere']) {
      await page.evaluate((s) => window.__ssTest!.seleziona(s), slug);
      await espandiScheda(page);
      await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>('.ss-scheda details').forEach((d) => (d.open = true)));
      const m = await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>('.ss-scheda')!;
        const voci = [...s.querySelectorAll('.ss-voce')].map((v) => {
          const dt = v.querySelector('dt')!.getBoundingClientRect();
          const dd = v.querySelector('dd')!.getBoundingClientRect();
          const e = v.querySelector('dt')!;
          return { testo: e.textContent, dt: dt.width, traboccante: e.scrollWidth > e.clientWidth + 1, sovrapposte: dt.right > dd.left + 1 };
        });
        return { scroll: s.scrollWidth - s.clientWidth, voci };
      });
      expect(m.scroll, `${slug}: scorrimento orizzontale`).toBeLessThanOrEqual(1);
      for (const v of m.voci) {
        expect(v.dt, `${slug}: ${v.testo}`).toBeGreaterThan(10);
        expect(v.traboccante, `${slug}: ${v.testo}`).toBe(false);
        expect(v.sovrapposte, `${slug}: ${v.testo}`).toBe(false);
      }
    }
  });

  test('Sole: blocco "Ora" con la distanza dalla Terra, nessuna albedo; rotazioni retrograde senza segno', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(() => window.__ssTest!.seleziona('sole'));
    await espandiScheda(page);
    await expect(page.locator('.ss-scheda-ora dl')).toContainText('Distanza dalla Terra');
    await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>('.ss-scheda details').forEach((d) => (d.open = true)));
    await expect(page.locator('.ss-scheda')).not.toContainText('Albedo geometrica');
    for (const slug of ['venere', 'urano', 'plutone']) {
      await page.evaluate((s) => window.__ssTest!.seleziona(s), slug);
      const rot = page.locator('.ss-scheda .ss-voce', { hasText: 'Periodo di rotazione' }).locator('dd');
      await expect(rot, slug).toContainText('(retrograda)');
      expect(await rot.textContent(), slug).not.toMatch(/^−/);
    }
    await page.evaluate(() => window.__ssTest!.seleziona('notte'));
    await expect(page.locator('.ss-scheda .ss-voce', { hasText: 'Raggio medio' })).toContainText(`18,0 ± 1,0${NB}km`);
  });

  test('forma dell’orbita incerta con livello buono: nessun "Orbita non determinabile"', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_332.94);
    await page.evaluate(() => window.__ssTest!.seleziona('c1975-v1-west'));
    await espandiScheda(page);
    await expect(page.locator('.ss-badge-aff')).toContainText('Buona');
    await expect(page.locator('.ss-scheda')).not.toContainText('Orbita non determinabile.');
    await expect(page.locator('.ss-scheda')).toContainText("Forma dell'orbita incerta");
  });

  test('"gregoriano prolettico" si mostra e si nasconde subito', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_268_923.5);
    await expect(page.locator('.ss-prolettica')).toBeHidden();
    await page.getByRole('button', { name: 'Impostazioni' }).first().click();
    await page.getByText('Mostra la data nel gregoriano prolettico prima del 15 ottobre 1582').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ss-prolettica')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('.ss-prolettica')).toHaveText('gregoriano prolettico: 1° gennaio 1500');
    await page.locator('.ss-data').click();
    await page.locator('.ss-avanzate summary').click();
    await page.getByText('Mostra la data nel gregoriano prolettico', { exact: true }).click();
    await expect(page.locator('.ss-prolettica')).toBeHidden({ timeout: 1000 });
    await page.keyboard.press('Escape');
  });
});

test.describe('ricerca e collegamenti', () => {
  test('frecce nell’ordine mostrato dei risultati', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    const campo = page.getByRole('combobox', { name: 'Trova' });
    await campo.fill('io');
    await expect(page.getByRole('listbox')).toBeVisible();
    const mostrati = await page.locator('.ss-trova-opzione .ss-trova-nome').allTextContents();
    const visitati: string[] = [];
    for (let i = 0; i < mostrati.length; i++) {
      await campo.press('ArrowDown');
      visitati.push(
        await page.evaluate(() => {
          const id = document.querySelector('.ss-trova-input')!.getAttribute('aria-activedescendant')!;
          return document.getElementById(id)!.querySelector('.ss-trova-nome')!.textContent!;
        }),
      );
    }
    expect(visitati).toEqual(mostrati);
  });

  test('l’hash riporta il corpo selezionato, non il fuoco dei preset; #sole apre il Sistema interno', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await cerca(page, 'Giove');
    expect(await page.evaluate(() => location.hash)).toBe('#giove');
    await preset(page, 'Sistema interno');
    expect(await page.evaluate(() => location.hash)).toBe('#giove');
    await page.reload();
    await page.waitForFunction(() => window.__ssTest !== undefined);
    await attendiQuiete(page);
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Giove');
    await page.goto('/#sole');
    await page.waitForFunction(() => window.__ssTest !== undefined);
    await attendiQuiete(page);
    await expect(page.locator('.ss-mappa')).toHaveAttribute('aria-label', 'Mappa 3D: Sistema interno, fuoco sul Sole');
  });

  test('#slug all’avvio: stessa vista dello stesso collegamento seguito dopo l’avvio (§ 11.12)', async ({ page }) => {
    const misura = (p: Page): Promise<{ km: number; mappa: string }> =>
      p.evaluate(() => ({ km: window.__ssTest!.vista()!.estensioneKm, mappa: document.querySelector('.ss-mappa')!.getAttribute('aria-label')! }));
    // Riferimento: collegamento seguito dopo l'avvio (hashchange), dalla vista iniziale.
    const dopo = new Map<string, { km: number; mappa: string }>();
    const slug = ['sole', 'terra', '1p-halley', 'giove'];
    await apri(page);
    for (const s of slug) {
      await page.evaluate((x) => (location.hash = `#${x}`), s);
      await attendiQuiete(page);
      dopo.set(s, await misura(page));
    }
    // Avvio con lo stesso collegamento: una pagina nuova per ogni slug (page.goto sulla stessa pagina cambia solo l'hash).
    for (const s of slug) {
      const nuova = await page.context().newPage();
      await apri(nuova, `/#${s}`);
      const v = await misura(nuova);
      const atteso = dopo.get(s)!;
      expect(v.km / atteso.km, `${s}: estensione all'avvio ${v.km} km, dopo l'avvio ${atteso.km} km`).toBeCloseTo(1, 3);
      expect(v.mappa, s).toBe(atteso.mappa);
      if (s === 'sole') expect(v.mappa).toBe('Mappa 3D: Sistema interno, fuoco sul Sole');
      await nuova.close();
    }
  });

  test('il messaggio del collegamento ignorato si toglie con un collegamento valido', async ({ page }) => {
    await apri(page, '/#giove');
    await chiudiBenvenuto(page);
    await page.evaluate(() => (location.hash = '#halley'));
    await expect(page.locator('.ss-avvisi')).toContainText('Nessun corpo corrisponde a «halley»');
    await page.evaluate(() => (location.hash = '#1p-halley'));
    await attendiQuiete(page);
    await expect(page.locator('.ss-scheda-nome')).toHaveText('1P/Halley');
    await expect(page.locator('.ss-avvisi')).not.toContainText('Nessun corpo corrisponde');
  });
});
