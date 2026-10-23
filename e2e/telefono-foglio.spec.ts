// Telefono: foglio inferiore, vista testuale e focus sull'applicazione reale (§ 11.3, § 11.7, § 11.9, § 11.12).
// "Inquadra" della scheda con il foglio esteso, riga della tabella coperta dal foglio, focus al cambio di layout,
// pulsante "Apri la scheda" sotto la vista testuale. Misure con getBoundingClientRect ed elementFromPoint.

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { apri, attendiQuiete, cerca, posizione } from './aiuti';

interface OpzioniSessione {
  larghezza: number;
  altezza: number;
}

/** Contesto con tocco (telefono), nota di benvenuto già chiusa. */
async function sessione(browser: Browser, o: OpzioniSessione, tocco = true, percorso = '/'): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: tocco,
    isMobile: tocco,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
  const page = await ctx.newPage();
  await apri(page, percorso);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

const dueFotogrammi = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function layout(page: Page, larghezza: number, altezza: number, atteso: string): Promise<void> {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', atteso);
  await dueFotogrammi(page);
}

/** Elemento con il focus: etichetta e visibilità (almeno un riquadro disegnato). */
function attivo(page: Page): Promise<{ tag: string; classe: string; testo: string; disegnato: boolean }> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return {
      tag: a?.tagName ?? '',
      classe: a?.className.toString() ?? '',
      testo: (a?.textContent ?? '').trim(),
      disegnato: a !== null && a !== document.body && a.getClientRects().length > 0,
    };
  });
}

/** Vero se il punto centrale dell'elemento con il focus appartiene all'elemento stesso (non è coperto). */
function focusNonCoperto(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const r = a.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t !== null && (t === a || a.contains(t));
  });
}

async function registraAnnunci(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __annunci: string[] };
    w.__annunci = [];
    const r = document.querySelector('.ss-annunci')!;
    new MutationObserver(() => w.__annunci.push((r.textContent ?? '').trim())).observe(r, { childList: true, characterData: true, subtree: true });
  });
}

const annunci = (page: Page) => page.evaluate(() => (window as unknown as { __annunci: string[] }).__annunci);

test.describe('"Inquadra" della scheda nel foglio esteso (§ 11.3, § 11.7)', () => {
  test('telefono: il foglio si riduce, il corpo inquadrato resta sopra il foglio, il focus passa al pulsante della scheda', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 400, altezza: 800 });
    await cerca(page, 'Saturno');
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
    await expect(page.locator('.ss-scheda')).toBeVisible();
    await registraAnnunci(page);
    await page.locator('.ss-scheda').getByRole('button', { name: 'Inquadra', exact: true }).click();
    await attendiQuiete(page);
    await dueFotogrammi(page);
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'compatto');
    const cimaFoglio = await page.locator('.ss-foglio').evaluate((el) => el.getBoundingClientRect().top);
    const p = await posizione(page, 'saturno');
    expect(p?.visibile, 'Saturno disegnato').toBe(true);
    expect(p!.y, 'Saturno sopra il foglio').toBeLessThan(cimaFoglio - 20);
    const sotto = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.ss-foglio') !== null, [p!.x, p!.y]);
    expect(sotto, 'nessun pannello copre il corpo').toBe(false);
    // Il pulsante premuto sparisce con la scheda: il focus non cade sul body.
    const a = await attivo(page);
    expect(a.disegnato, 'focus su un elemento visibile').toBe(true);
    expect(a.classe).toContain('ss-chip-scheda');
    // L'annuncio resta quello di prima.
    await expect.poll(() => annunci(page), { timeout: 8_000 }).toContain('Vista centrata su Saturno');
    await ctx.close();
  });

  test('orizzontale: il pannello laterale non cambia (la mappa ha già l’area libera)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 844, altezza: 390 });
    await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', 'orizzontale');
    await cerca(page, 'Saturno');
    await page.locator('.ss-scheda').getByRole('button', { name: 'Inquadra', exact: true }).click();
    await attendiQuiete(page);
    await dueFotogrammi(page);
    await expect(page.locator('.ss-scheda')).toBeVisible();
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
    await ctx.close();
  });
});

test.describe('selezione dalla vista testuale (§ 11.9, WCAG 2.4.3 e 2.4.11)', () => {
  async function apriTabellaEFocalizza(page: Page, corpo: string): Promise<void> {
    await page.keyboard.press('t');
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('ss-testuale') ?? false)).toBe(true);
    await page.locator('.ss-tabella-corpo', { hasText: new RegExp(`^${corpo}$`) }).focus();
  }

  test('telefono: Invio su una riga apre il foglio esteso e il focus passa al titolo della scheda, non coperto', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 400, altezza: 800 });
    await apriTabellaEFocalizza(page, 'Marte');
    await page.keyboard.press('Enter');
    await attendiQuiete(page);
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
    await expect.poll(() => attivo(page).then((a) => a.tag)).toBe('H2');
    const a = await attivo(page);
    expect(a.testo).toBe('Marte');
    expect(await focusNonCoperto(page), 'titolo non coperto').toBe(true);
    await ctx.close();
  });

  /** Vero se l'elemento con il focus sta nella tabella (intestazioni, righe, regione scorrevole). */
  const nellaTabella = (page: Page): Promise<boolean> =>
    page.evaluate(() => {
      const a = document.activeElement;
      const t = document.querySelector('.ss-testuale .ss-tabella-scorri')!;
      return a !== null && a !== document.body && t.contains(a);
    });

  test('telefono, foglio esteso: la tabella ridotta a pochi pixel esce dall’ordine di Tab e vi rientra con il foglio ridotto (WCAG 2.4.7 e 2.4.11)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 400, altezza: 800 });
    await apriTabellaEFocalizza(page, 'Marte');
    await page.keyboard.press('Enter');
    await attendiQuiete(page);
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
    // Il foglio esteso lascia alla tabella pochi pixel: le sue righe non sono visibili.
    const altezza = await page.locator('.ss-testuale .ss-tabella-scorri').evaluate((el) => el.getBoundingClientRect().height);
    expect(altezza, 'tabella coperta').toBeLessThan(20);
    // Nessun controllo della tabella riceve il focus, né con Maiusc+Tab né con Tab, né da programma.
    const visitati: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      const a = await attivo(page);
      visitati.push(a.classe.split(' ').pop() ?? a.tag);
      expect(await nellaTabella(page), `Maiusc+Tab ${i}: ${visitati.join(', ')}`).toBe(false);
      expect(a.disegnato, `Maiusc+Tab ${i}: focus visibile`).toBe(true);
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await nellaTabella(page), `Tab ${i}`).toBe(false);
    }
    expect(
      await page.evaluate(() => {
        const riga = document.querySelector<HTMLElement>('.ss-tabella-corpo')!;
        riga.focus();
        return document.activeElement === riga;
      }),
      'una riga coperta non accetta il focus',
    ).toBe(false);
    await expect(page.locator('.ss-testuale .ss-tabella-scorri')).toHaveJSProperty('inert', true);
    // Foglio ridotto: la tabella torna raggiungibile con Maiusc+Tab dalla maniglia.
    await page.locator('.ss-maniglia').click();
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'compatto');
    await expect(page.locator('.ss-testuale .ss-tabella-scorri')).toHaveJSProperty('inert', false);
    await page.locator('.ss-maniglia').focus();
    await page.keyboard.press('Shift+Tab');
    expect(await nellaTabella(page), 'tabella raggiungibile a foglio ridotto').toBe(true);
    expect((await attivo(page)).disegnato).toBe(true);
    await expect.poll(() => focusNonCoperto(page), { message: 'riga visibile' }).toBe(true);
    await ctx.close();
  });

  test('telefono: il foglio esteso che copre la riga con il focus lo porta alla maniglia, senza lasciarlo sul body', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 400, altezza: 800 });
    await apriTabellaEFocalizza(page, 'Marte');
    await page.keyboard.press('Enter');
    await attendiQuiete(page);
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
    // Sul tablet il foglio non c'è e la tabella è intera: il focus va su una riga.
    await layout(page, 800, 800, 'tablet');
    await expect(page.locator('.ss-testuale .ss-tabella-scorri')).toHaveJSProperty('inert', false);
    await page.locator('.ss-tabella-corpo', { hasText: /^Giove$/ }).focus();
    expect(await nellaTabella(page)).toBe(true);
    // Di nuovo sul telefono il foglio è ancora esteso e copre la tabella.
    await layout(page, 400, 800, 'telefono');
    await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
    const a = await attivo(page);
    expect(a.disegnato, 'focus su un elemento visibile').toBe(true);
    expect(a.classe).toContain('ss-maniglia');
    await expect(page.locator('.ss-testuale .ss-tabella-scorri')).toHaveJSProperty('inert', true);
    await ctx.close();
  });

  test('orizzontale: la riga resta visibile accanto al pannello e il focus non si sposta', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 844, altezza: 390 });
    await apriTabellaEFocalizza(page, 'Marte');
    await page.keyboard.press('Enter');
    await attendiQuiete(page);
    await expect(page.locator('.ss-scheda')).toBeVisible();
    await page.waitForTimeout(300);
    const a = await attivo(page);
    expect(a).toMatchObject({ tag: 'BUTTON', testo: 'Marte' });
    expect(await focusNonCoperto(page), 'riga non coperta').toBe(true);
    await ctx.close();
  });
});

test.describe('cambio di layout con il focus su un controllo nascosto dal nuovo layout (§ 11.12, WCAG 2.4.3)', () => {
  const CONTROLLI: [string, string][] = [
    ['regolo temporale', '.ss-regolo-inf'],
    ['unità del passo', '.ss-unita'],
    ['Avanti', '.ss-passi button:last-of-type'],
    ['Adesso', '.ss-adesso'],
  ];

  test('orizzontale → telefono (foglio compatto) e ritorno: il focus resta su un elemento visibile', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 844, altezza: 390 });
    await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', 'orizzontale');
    for (const [nome, selettore] of CONTROLLI) {
      await page.locator(selettore).first().focus();
      expect((await attivo(page)).disegnato, `${nome}: in orizzontale`).toBe(true);
      await layout(page, 390, 844, 'telefono');
      await expect(page.locator('.ss-app'), nome).toHaveAttribute('data-foglio', 'compatto');
      const a = await attivo(page);
      expect(a.disegnato, `${nome}: telefono, focus sul body`).toBe(true);
      expect(a.classe, `${nome}: maniglia del foglio`).toContain('ss-maniglia');
      await layout(page, 844, 390, 'orizzontale');
      expect((await attivo(page)).disegnato, `${nome}: ritorno in orizzontale, focus sul body`).toBe(true);
    }
    await ctx.close();
  });

  test('desktop → telefono → desktop: regolo, passi, Adesso e cursore delle distanze', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900 }, false);
    const controlli: [string, string][] = [...CONTROLLI, ['cursore delle distanze', '.ss-distanze-slider']];
    for (const [nome, selettore] of controlli) {
      await page.locator(selettore).first().focus();
      expect((await attivo(page)).disegnato, `${nome}: sul desktop`).toBe(true);
      await layout(page, 390, 844, 'telefono');
      const a = await attivo(page);
      expect(a.disegnato, `${nome}: telefono, focus sul body`).toBe(true);
      expect(a.classe, `${nome}: maniglia del foglio`).toContain('ss-maniglia');
      await layout(page, 1440, 900, 'desktop');
      const d = await attivo(page);
      expect(d.disegnato, `${nome}: ritorno sul desktop, focus sul body`).toBe(true);
      expect(d.classe, `${nome}: pulsante della data`).toContain('ss-data');
    }
    await ctx.close();
  });

  test('tablet → telefono alla soglia dei 700 px e ritorno: regolo, passi, Adesso e cursore delle distanze cedono il focus alla maniglia', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 700, altezza: 800 }, false);
    await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', 'tablet');
    const controlli: [string, string][] = [...CONTROLLI, ['cursore delle distanze', '.ss-distanze-slider']];
    for (const [nome, selettore] of controlli) {
      await page.locator(selettore).first().focus();
      expect((await attivo(page)).disegnato, `${nome}: tablet a 700 px`).toBe(true);
      await layout(page, 699, 800, 'telefono');
      await expect(page.locator('.ss-app'), nome).toHaveAttribute('data-foglio', 'compatto');
      const a = await attivo(page);
      expect(a.disegnato, `${nome}: telefono a 699 px, focus sul body`).toBe(true);
      expect(a.classe, `${nome}: maniglia del foglio`).toContain('ss-maniglia');
      await layout(page, 700, 800, 'tablet');
      const d = await attivo(page);
      expect(d.disegnato, `${nome}: ritorno a 700 px, focus sul body`).toBe(true);
      expect(d.classe, `${nome}: pulsante della data`).toContain('ss-data');
    }
    await ctx.close();
  });

  test('un controllo che il nuovo layout mostra ancora conserva il focus', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900 }, false);
    await page.locator('.ss-velocita').focus();
    await layout(page, 390, 844, 'telefono');
    expect((await attivo(page)).classe).toContain('ss-velocita');
    await ctx.close();
  });
});

test.describe('pulsante "Apri la scheda" e vista testuale (§ 11.3)', () => {
  for (const v of [
    { larghezza: 390, altezza: 844 },
    { larghezza: 320, altezza: 568 },
    { larghezza: 600, altezza: 480 },
    { larghezza: 699, altezza: 700 },
  ]) {
    test(`telefono ${v.larghezza}×${v.altezza}: con la vista testuale aperta il pulsante non c'è sotto la tabella; torna a vista chiusa`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, v, true, '/#giove');
      const chip = page.locator('.ss-chip-scheda');
      await expect(chip).toBeVisible();
      await page.keyboard.press('t');
      await expect(page.locator('.ss-testuale')).toBeVisible();
      await expect(chip).toBeHidden();
      await expect(page.locator('.ss-app')).toHaveAttribute('data-chip', 'no');
      // Nessun controllo coperto raggiungibile con Tab: il pulsante non riceve il focus.
      await page.locator('.ss-testuale').focus();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        expect((await attivo(page)).classe).not.toContain('ss-chip-scheda');
      }
      // La scheda si apre dalla riga del corpo selezionato.
      await page.locator('.ss-tabella-corpo', { hasText: /^Giove$/ }).click();
      await expect(page.locator('.ss-app')).toHaveAttribute('data-foglio', 'esteso');
      await expect(page.locator('.ss-scheda')).toBeVisible();
      await ctx.close();
    });

    test(`telefono ${v.larghezza}×${v.altezza}: chiudendo la vista testuale il pulsante torna visibile e non coperto`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, v, true, '/#giove');
      await page.keyboard.press('t');
      await expect(page.locator('.ss-testuale')).toBeVisible();
      await page.keyboard.press('t');
      await expect(page.locator('.ss-testuale')).toBeHidden();
      const chip = page.locator('.ss-chip-scheda');
      await expect(chip).toBeVisible();
      const libero = await chip.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return t !== null && (t === el || el.contains(t));
      });
      expect(libero).toBe(true);
      await ctx.close();
    });
  }

  test('con il focus sul pulsante, il tasto T apre la vista testuale e il focus passa alla tabella', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 390, altezza: 844 }, true, '/#giove');
    await page.locator('.ss-chip-scheda').focus();
    await page.keyboard.press('t');
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('ss-testuale') ?? false)).toBe(true);
    await ctx.close();
  });
});
