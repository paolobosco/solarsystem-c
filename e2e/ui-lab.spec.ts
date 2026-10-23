// Interfaccia sulla pagina di prova con servizi fittizi (ui-lab.html): criteri A12-A17 del § 13 e
// schermate in test-results/interfaccia/. Si esegue con la configurazione dedicata:
//   npx playwright test -c e2e/ui-lab.config.ts

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

test.beforeEach(({ browserName }, info) => {
  test.skip(info.project.name !== 'ui-lab' || browserName !== 'chromium', 'Solo con e2e/ui-lab.config.ts');
});

const CARTELLA = fileURLToPath(new URL('../test-results/interfaccia/', import.meta.url));
mkdirSync(CARTELLA, { recursive: true });

/** 18 ottobre 2026, 21:36 UT. */
const JD = 2_461_332.4;
const NB = '\u00a0';

// --- Caratteri: Google Fonts tramite Node (proxy dell'ambiente), altrimenti ripiego ---

const cacheFont = new Map<string, { stato: number; tipo: string; corpo: Buffer } | null>();

async function instradaFont(ctx: BrowserContext): Promise<void> {
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const url = route.request().url();
    if (!cacheFont.has(url)) {
      try {
        const r = await fetch(url, {
          headers: { 'user-agent': route.request().headers()['user-agent'] ?? '' },
          signal: AbortSignal.timeout(6000),
        });
        cacheFont.set(url, { stato: r.status, tipo: r.headers.get('content-type') ?? '', corpo: Buffer.from(await r.arrayBuffer()) });
      } catch {
        cacheFont.set(url, null);
      }
    }
    const v = cacheFont.get(url);
    if (!v) await route.abort();
    else await route.fulfill({ status: v.stato, contentType: v.tipo, body: v.corpo, headers: { 'access-control-allow-origin': '*' } });
  });
}

interface OpzioniPagina {
  larghezza: number;
  altezza: number;
  tocco?: boolean;
  query?: string;
  media?: Parameters<Page['emulateMedia']>[0];
}

interface Aperta {
  page: Page;
  ctx: BrowserContext;
  errori: string[];
}

async function apri(browser: Browser, o: OpzioniPagina): Promise<Aperta> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: o.tocco ?? false,
    isMobile: (o.tocco ?? false) && o.larghezza < 700,
    deviceScaleFactor: 1,
  });
  await instradaFont(ctx);
  const page = await ctx.newPage();
  const errori: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errori.push(m.text());
  });
  page.on('pageerror', (e) => errori.push(String(e)));
  page.on('dialog', (d) => {
    errori.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  if (o.media) await page.emulateMedia(o.media);
  await page.goto(`/ui-lab.html${o.query ?? `?jd=${JD}&benvenuto=0`}`);
  await page.waitForFunction(() => window.__uiLab !== undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return { page, ctx, errori };
}

async function chiudi(a: Aperta): Promise<void> {
  expect(a.errori, 'nessun errore o avviso in console').toEqual([]);
  await a.ctx.close();
}

async function schermata(page: Page, nome: string): Promise<void> {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${CARTELLA}${nome}.png` });
}

const statoLab = (page: Page) =>
  page.evaluate(() => {
    const s = window.__uiLab!.store.get();
    return { jd: s.tempo.jd, selezionato: s.selezionato, fuoco: s.fuoco, riproduzione: s.riproduzione, ui: s.interfaccia };
  });

// --- Misure per A12 ---

interface Controllo {
  descr: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

function misuraControlli(page: Page): Promise<{ controlli: Controllo[]; scrollW: number; clientW: number; bodyW: number }> {
  return page.evaluate(() => {
    const sel =
      'button, input:not([type=checkbox]):not([type=hidden]), select, textarea, a[href], summary, [role=slider], [role=option], [tabindex="0"], label.ss-casella';
    const out: { descr: string; x0: number; y0: number; x1: number; y1: number; w: number; h: number }[] = [];
    const W = document.documentElement.clientWidth;
    const H = document.documentElement.clientHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.classList.contains('ss-mappa') || el.closest('.ss-sr, [hidden], dialog:not([open])')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let x0 = Math.max(0, r.left);
      let y0 = Math.max(0, r.top);
      let x1 = Math.min(W, r.right);
      let y1 = Math.min(H, r.bottom);
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') {
          const pr = p.getBoundingClientRect();
          x0 = Math.max(x0, pr.left);
          y0 = Math.max(y0, pr.top);
          x1 = Math.min(x1, pr.right);
          y1 = Math.min(y1, pr.bottom);
        }
      }
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      const nome = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? '';
      out.push({ descr: `${el.tagName.toLowerCase()}.${el.className} «${nome}»`, x0, y0, x1, y1, w: r.width, h: r.height });
    }
    return {
      controlli: out,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyW: document.body.scrollWidth,
    };
  });
}

async function verificaRiadattamento(page: Page, larghezza: number, altezza: number, minimo: number, stato: string): Promise<void> {
  // Due fotogrammi: le altezze di console e foglio si propagano con ResizeObserver.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const m = await misuraControlli(page);
  expect(m.scrollW, `${stato}: scorrimento orizzontale`).toBeLessThanOrEqual(m.clientW);
  expect(m.bodyW, `${stato}: scorrimento orizzontale del body`).toBeLessThanOrEqual(m.clientW);
  const margini = m.controlli.filter((c) => c.x0 < 15.5 || c.y0 < 15.5 || c.x1 > larghezza - 15.5 || c.y1 > altezza - 15.5);
  expect(margini.map((c) => `${c.descr} [${c.x0.toFixed(0)},${c.y0.toFixed(0)},${c.x1.toFixed(0)},${c.y1.toFixed(0)}]`), `${stato}: margini`).toEqual([]);
  const piccoli = m.controlli.filter((c) => c.w < minimo - 0.5 || c.h < minimo - 0.5);
  expect(piccoli.map((c) => `${c.descr} ${c.w.toFixed(0)}×${c.h.toFixed(0)}`), `${stato}: destinazioni`).toEqual([]);
  expect(m.controlli.length).toBeGreaterThan(5);
}

// --- A12: riadattamento ---

const VISTE = [
  { larghezza: 320, altezza: 640, tocco: true, minimo: 44 },
  { larghezza: 400, altezza: 800, tocco: true, minimo: 44 },
  { larghezza: 768, altezza: 1024, tocco: true, minimo: 44 },
  { larghezza: 1280, altezza: 800, tocco: false, minimo: 24 },
] as const;

for (const v of VISTE) {
  test(`A12 riadattamento a ${v.larghezza} px`, async ({ browser }) => {
    const a = await apri(browser, { ...v, query: `?jd=${JD}` });
    const { page } = a;
    const nome = (s: string) => `${v.larghezza}-${s}`;
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'avvio con nota di benvenuto');
    await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'avvio');
    if (v.larghezza < 700) {
      await page.locator('.ss-maniglia').click();
      await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'foglio medio');
      await page.locator('.ss-maniglia').click();
      await page.locator('.ss-chip-scheda').click();
      await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'scheda nel foglio');
    } else {
      await page.locator('.ss-scheda button[aria-controls]').click();
      await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'scheda espansa');
    }
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'catalogo');
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await page.locator('.ss-data').click();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'editor della data');
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    await expect(page.locator('.ss-testuale')).toBeVisible();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'vista testuale');
    await schermata(page, nome('testuale'));
    await chiudi(a);
  });
}

test('A12 orizzontale con altezza inferiore a 480 px: pannello laterale di 320 px', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 844, altezza: 390, tocco: true });
  await expect(a.page.locator('.ss-app')).toHaveAttribute('data-layout', 'orizzontale');
  const r = await a.page.locator('.ss-foglio').boundingBox();
  expect(r?.width).toBeCloseTo(320, 0);
  await verificaRiadattamento(a.page, 844, 390, 44, 'orizzontale');
  await schermata(a.page, 'orizzontale-844');
  await chiudi(a);
});

// --- A13: solo tastiera ---

test('A13 tastiera: 4 ottobre 1582 + 1 giorno = venerdì 15 ottobre; Marte dalla ricerca; Fonti e metodi con Esc', async ({ browser }) => {
  // 10 marzo 2026: il mese va cambiato con la tastiera.
  const a = await apri(browser, { larghezza: 1280, altezza: 800, query: '?jd=2461109.5&benvenuto=0' });
  const { page } = a;
  const attivo = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');

  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-salta')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-data')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-input--giorno')).toBeFocused();
  await page.keyboard.type('04');
  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-input--mese')).toBeFocused();
  await page.keyboard.type('ottobre');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1582');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-input--ora').first()).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('12');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('00');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-data')).toBeFocused();
  await expect(page.locator('.ss-data-testo')).toHaveText('4 ottobre 1582');
  await expect(page.locator('.ss-settimana')).toHaveText('giovedì');
  await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario giuliano');

  for (let i = 0; i < 8 && !(await attivo()).includes('ss-passo') ; i++) await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Indietro di un giorno' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Avanti di un giorno' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-data-testo')).toHaveText('15 ottobre 1582');
  await expect(page.locator('.ss-settimana')).toHaveText('venerdì');
  await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario gregoriano');
  await expect(page.locator('.ss-annunci')).toContainText('15 ottobre 1582, 12:00 UT, venerdì');
  await schermata(page, 'desktop-tastiera-1582');

  // Ricerca con la scorciatoia "/": Marte selezionato e inquadrato.
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Trova' })).toBeFocused();
  await page.keyboard.type('marte');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('combobox', { name: 'Trova' })).toHaveAttribute('aria-activedescendant', /trova-op/);
  await page.keyboard.press('Enter');
  const s = await statoLab(page);
  expect(s.selezionato).toBe('marte');
  expect(s.fuoco).toBe('marte');
  const registro = await page.evaluate(() => window.__uiLab!.scena!.registro);
  expect(registro).toContain('fuoco:marte:orbita');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');

  // Fonti e metodi: apertura con Invio, chiusura con Esc, focus restituito.
  const fonti = page.getByRole('button', { name: 'Fonti e metodi' });
  for (let i = 0; i < 10 && !(await fonti.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(fonti).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Fonti e metodi' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Fonti e metodi' })).toBeHidden();
  await expect(fonti).toBeFocused();

  // Mappa: N seleziona un corpo visibile, Esc deseleziona, Tab esce.
  await page.locator('.ss-mappa').focus();
  await page.keyboard.press('n');
  expect((await statoLab(page)).selezionato).not.toBeNull();
  await page.keyboard.press('Escape');
  expect((await statoLab(page)).selezionato).toBeNull();
  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-mappa')).not.toBeFocused();
  await chiudi(a);
});

test('A13 regolo come slider: frecce, Maiusc, PagSu, Fine e aria-valuetext', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800, query: '?jd=2269013.0&benvenuto=0' });
  const { page } = a;
  const slider = page.getByRole('slider', { name: 'Regolo temporale' });
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuetext', `21 marzo 1500, 12:00 UT, calendario giuliano`);
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', /^22 marzo 1500/);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', /^1° aprile 1500/);
  await page.keyboard.press('PageUp');
  await expect(slider).toHaveAttribute('aria-valuetext', /^1° maggio 1500/);
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', '31 dicembre 2120, 23:59 UT, calendario gregoriano');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', `1° gennaio 10000${NB}a.C., 00:00 UT, calendario giuliano`);
  await chiudi(a);
});

test('selezione al clic della scena di sviluppo come nella scena reale: etichetta, canvas vuota, disco (§ 11.5.3)', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800, query: `?jd=${JD}&benvenuto=0#terra` });
  const { page } = a;
  const disegno = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const selezionato = async () => (await statoLab(page)).selezionato;
  await disegno();
  expect(await selezionato()).toBe('terra');
  const canvas = (await page.locator('.ss-mappa canvas').boundingBox())!;

  // Il testo dell'etichetta, lontano dal marcatore, seleziona il corpo (l'etichetta è un candidato).
  const venere = (await page.evaluate(() => window.__uiLab!.scena!.geometria('venere')))!;
  expect(venere.etichetta).not.toBeNull();
  const e = venere.etichetta!;
  expect(Math.hypot((e.x0 + e.x1) / 2 - venere.x, (e.y0 + e.y1) / 2 - venere.y)).toBeGreaterThan(24);
  await page.mouse.click(canvas.x + (e.x0 + e.x1) / 2, canvas.y + (e.y0 + e.y1) / 2);
  await expect.poll(selezionato).toBe('venere');

  // Canvas vuota: nessun evento, la selezione resta (non si deseleziona).
  const vuoto = { x: canvas.x + 900, y: canvas.y + 460 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, vuoto)).toBe('CANVAS');
  await page.mouse.click(vuoto.x, vuoto.y);
  await page.waitForTimeout(300);
  expect(await selezionato()).toBe('venere');

  // Disco risolto: il clic dentro il contorno, lontano dal centro, seleziona il corpo.
  await page.evaluate(() => window.__uiLab!.scena!.impostaAmpiezza(40_000));
  await disegno();
  const terra = (await page.evaluate(() => window.__uiLab!.scena!.geometria('terra')))!;
  expect(terra.raggioPx).toBeGreaterThan(60);
  await page.mouse.click(canvas.x + terra.x + 0.6 * terra.raggioPx, canvas.y + terra.y);
  await expect.poll(selezionato).toBe('terra');
  await chiudi(a);
});

// --- A14: preferenze di sistema ---

test('A14 movimento ridotto e colori forzati: nessuna animazione, focus visibile', async ({ browser }) => {
  const a = await apri(browser, {
    larghezza: 1280,
    altezza: 800,
    query: `?jd=${JD}&benvenuto=0&caricamento=1`,
    media: { reducedMotion: 'reduce', forcedColors: 'active' },
  });
  const { page } = a;
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.locator('.ss-scheda button[aria-controls]').click();
  await page.locator('.ss-sezione summary').nth(1).click();
  await page.getByRole('button', { name: 'Livelli' }).click();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  const durata = await page.locator('.ss-pulsante').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(durata.split(',').every((d) => Number.parseFloat(d) === 0)).toBe(true);
  // Focus visibile con outline (mai solo box-shadow).
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Livelli' }).focus();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { stile: cs.outlineStyle, spessore: Number.parseFloat(cs.outlineWidth) };
  });
  expect(outline.stile).toBe('solid');
  expect(outline.spessore).toBeGreaterThanOrEqual(2);
  await page.locator('.ss-mappa').focus();
  const mappa = await page.locator('.ss-mappa').evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(mappa).toBe('solid');
  await schermata(page, 'desktop-colori-forzati');
  await chiudi(a);
});

test('A14 contrasto elevato: pannelli opachi e testo secondario uguale al testo', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800, media: { contrast: 'more' } });
  const { page } = a;
  const valori = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { t2: cs.getPropertyValue('--testo-2').trim(), t: cs.getPropertyValue('--testo').trim() };
  });
  expect(valori.t2).toBe(valori.t);
  const sfondo = await page.locator('.ss-console').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(sfondo).toBe('rgb(12, 26, 21)');
  await chiudi(a);
});

// --- A15: axe-core ---

async function axe(page: Page, stato: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const gravi = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    gravi.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`),
    `axe in ${stato}`,
  ).toEqual([]);
}

test('A15 axe-core su desktop nei principali stati', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800, query: `?jd=${JD}` });
  const { page } = a;
  await axe(page, 'avvio');
  await schermata(page, 'desktop-avvio');
  await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
  await page.locator('.ss-scheda button[aria-controls]').click();
  await axe(page, 'scheda espansa');
  await schermata(page, 'desktop-scheda');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await axe(page, 'catalogo');
  await schermata(page, 'desktop-catalogo');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.getByRole('combobox', { name: 'Trova' }).fill('eu');
  await expect(page.getByRole('listbox')).toBeVisible();
  await axe(page, 'risultati della ricerca');
  await schermata(page, 'desktop-ricerca');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Livelli' }).click();
  await axe(page, 'livelli');
  await schermata(page, 'desktop-livelli');
  await page.keyboard.press('Escape');
  await page.locator('.ss-data').click();
  await page.locator('.ss-input--anno').fill('0');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-editor-messaggio')).toBeVisible();
  await axe(page, 'editor con errore');
  await schermata(page, 'desktop-editor-errore');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Tabella: vista testuale', exact: true }).click();
  await axe(page, 'vista testuale');
  await page.getByRole('button', { name: 'Tabella: vista testuale', exact: true }).click();
  await page.getByRole('button', { name: 'Fonti e metodi' }).click();
  await axe(page, 'Fonti e metodi');
  await schermata(page, 'desktop-fonti');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Impostazioni' }).click();
  await axe(page, 'Impostazioni');
  await schermata(page, 'desktop-impostazioni');
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Scorciatoie da tastiera' })).toBeVisible();
  await axe(page, 'scorciatoie');
  await page.keyboard.press('Escape');
  await chiudi(a);
});

test('A15 axe-core su telefono e senza WebGL2', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 400, altezza: 800, tocco: true });
  const { page } = a;
  await axe(page, 'telefono compatto');
  await schermata(page, 'telefono-compatto');
  await page.locator('.ss-maniglia').click();
  await axe(page, 'telefono medio');
  await schermata(page, 'telefono-medio');
  await page.locator('.ss-maniglia').click();
  await page.locator('.ss-chip-scheda').click();
  await axe(page, 'telefono scheda');
  await schermata(page, 'telefono-scheda');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await axe(page, 'telefono catalogo');
  await schermata(page, 'telefono-catalogo');
  await page.getByRole('button', { name: 'Menu' }).click();
  await axe(page, 'telefono menu');
  await schermata(page, 'telefono-menu');
  await chiudi(a);

  const b = await apri(browser, { larghezza: 1280, altezza: 800, query: `?jd=${JD}&benvenuto=0&webgl=0` });
  await expect(b.page.getByRole('alert')).toContainText('Il browser non supporta la grafica 3D necessaria (WebGL2). Puoi usare la vista testuale.');
  await expect(b.page.locator('.ss-testuale')).toBeVisible();
  await expect(b.page.getByRole('button', { name: 'Chiudi la vista testuale' })).toBeHidden();
  await axe(b.page, 'senza WebGL2');
  await schermata(b.page, 'desktop-senza-webgl');
  await chiudi(b);
});

// --- A16: validazione delle date ---

test('A16 messaggi per anno 0, 29 febbraio, 5-14 ottobre 1582, limiti con UTC+2', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800 });
  const { page } = a;
  const msg = page.locator('.ss-editor-messaggio');
  const campi = page.getByRole('group', { name: 'Modifica data e ora' });
  async function inserisci(g: string, mese: string, anno: string, era: 'a.C.' | 'd.C.', ora = '00', minuti = '00') {
    await page.locator('.ss-input--giorno').fill(g);
    await page.locator('.ss-input--mese').selectOption({ label: mese });
    await page.locator('.ss-input--anno').fill(anno);
    await page.locator('.ss-segmento', { hasText: era }).click();
    await page.locator('.ss-input--ora').first().fill(ora);
    await page.locator('.ss-input--ora').nth(1).fill(minuti);
    await page.locator('.ss-input--ora').nth(1).press('Enter');
  }
  await page.locator('.ss-data').click();

  await inserisci('1', 'gennaio', '0', 'a.C.');
  await expect(msg).toHaveText(`L'anno 0 non esiste: dopo l'1${NB}a.C. viene l'1${NB}d.C.`);
  await expect(campi).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.ss-input--anno')).toHaveAttribute('aria-invalid', 'true');
  await expect(campi).toHaveAttribute('aria-describedby', /editor-m/);

  await inserisci('29', 'febbraio', '1900', 'd.C.');
  await expect(msg).toHaveText('Il 29 febbraio 1900 non esiste nel calendario gregoriano.');
  await expect(page.locator('.ss-input--giorno')).toHaveAttribute('aria-invalid', 'true');

  await inserisci('29', 'febbraio', '2023', 'd.C.');
  await expect(msg).toHaveText('Il 29 febbraio 2023 non esiste nel calendario gregoriano.');

  await inserisci('10', 'ottobre', '1582', 'd.C.', '08', '30');
  await expect(msg).toContainText('Nel 1582 si passò dal 4 al 15 ottobre: i giorni dal 5 al 14 non esistono.');
  await expect(page.getByRole('button', { name: 'Vai al 4 ottobre' })).toBeVisible();
  await page.getByRole('button', { name: 'Vai al 15 ottobre' }).click();
  await expect(page.locator('.ss-data-testo')).toHaveText('15 ottobre 1582');
  await expect(page.locator('.ss-data-ora')).toHaveText('08:30 UT');
  await expect(msg).toBeHidden();

  // Offset fisso UTC+2 (opzioni avanzate): limiti applicati in UT dopo la conversione.
  await page.getByText('Opzioni avanzate', { exact: true }).click();
  await page.getByLabel('Usa un offset orario fisso').check();
  await page.getByLabel('Offset orario fisso', { exact: true }).selectOption({ label: 'UTC+2 (fisso)' });
  await inserisci('1', 'gennaio', '10000', 'a.C.', '00', '00');
  await expect(msg).toHaveText(
    `Sono disponibili le date dal 1° gennaio 10000${NB}a.C. al 31 dicembre 2120 (UT). In UTC+2: dal 1° gennaio 10000${NB}a.C. alle 02:00 al 1° gennaio 2121 alle 01:59.`,
  );
  await inserisci('1', 'gennaio', '10000', 'a.C.', '02', '00');
  await expect(msg).toBeHidden();
  await expect(page.locator('.ss-data-ora')).toHaveText('02:00 UTC+2');
  // Il pulsante al limite ha aria-disabled ma resta attivabile: mostra il messaggio.
  await expect(page.getByRole('button', { name: 'Indietro di un giorno' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Indietro di un giorno' }).focus();
  await page.keyboard.press('Enter');
  const limite = `Raggiunto il limite inferiore: 1° gennaio 10000${NB}a.C., 00:00 UT (02:00 in UTC+2)`;
  await expect(page.locator('.ss-avviso--info')).toContainText(limite);
  await expect(page.locator('.ss-annunci')).toContainText(limite);
  await expect(page.getByRole('button', { name: 'Indietro di un giorno' })).toHaveAttribute('aria-disabled', 'true');
  await schermata(page, 'desktop-limite-utc2');
  await chiudi(a);
});

// --- A17: live region ---

test('A17 in riproduzione nessun annuncio dovuto al tempo, annunci delle azioni dell’utente; pannelli al massimo 4 volte al secondo', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800 });
  const { page } = a;
  await page.evaluate(() => {
    const w = window as unknown as { __mutazioni: number; __date: number };
    w.__mutazioni = 0;
    w.__date = 0;
    new MutationObserver(() => w.__mutazioni++).observe(document.querySelector('.ss-annunci')!, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    new MutationObserver(() => w.__date++).observe(document.querySelector('.ss-data-ora')!, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.locator('.ss-velocita').selectOption({ label: '1 min/s' });
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    (window as unknown as { __mutazioni: number }).__mutazioni = 0;
  });
  await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
  const jd0 = (await statoLab(page)).jd;
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { __date: number }).__date = 0;
  });
  // Nessuna azione dell'utente: la data avanza e la live region resta muta.
  await page.waitForTimeout(2000);
  const durante = await page.evaluate(() => {
    const w = window as unknown as { __mutazioni: number; __date: number };
    return { annunci: w.__mutazioni, date: w.__date };
  });
  expect(durante.annunci).toBe(0);
  expect(durante.date).toBeGreaterThan(0);
  expect(durante.date).toBeLessThanOrEqual(9);
  expect((await statoLab(page)).jd).toBeGreaterThan(jd0);
  // Azioni esplicite dell'utente durante la riproduzione: passo e velocità sono annunciati.
  const regione = page.locator('.ss-annunci');
  await page.locator('.ss-mappa').focus();
  await page.keyboard.press('.');
  await expect(regione).toHaveText(/\d{2}:\d{2} UT, \S+$/);
  await page.waitForTimeout(1700);
  await page.keyboard.press(']');
  await expect(regione).toContainText('Velocità');
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(regione).toContainText('Riproduzione in pausa');
  await chiudi(a);
});

// --- A23 lato interfaccia ---

test('A23 lingua della pagina e assenza di U+2014 nel DOM', async ({ browser }) => {
  const a = await apri(browser, { larghezza: 1280, altezza: 800 });
  await expect(a.page.locator('html')).toHaveAttribute('lang', 'it');
  const testo = await a.page.evaluate(() => document.body.innerText + document.body.innerHTML);
  expect(testo.includes(String.fromCharCode(0x2014))).toBe(false);
  await chiudi(a);
});

// --- Schermate di riepilogo ---

test('schermate: tablet, telefono stretto, riproduzione', async ({ browser }) => {
  const t = await apri(browser, { larghezza: 768, altezza: 1024, tocco: true, query: `?jd=${JD}` });
  await schermata(t.page, 'tablet-avvio');
  await chiudi(t);
  const s = await apri(browser, { larghezza: 320, altezza: 640, tocco: true });
  await schermata(s.page, 'telefono-320-compatto');
  await s.page.locator('.ss-maniglia').click();
  await schermata(s.page, 'telefono-320-medio');
  await chiudi(s);
  const r = await apri(browser, { larghezza: 1280, altezza: 800, query: '?jd=2446470.5&benvenuto=0#1p-halley' });
  await expect(r.page.locator('.ss-scheda-nome')).toHaveText('1P/Halley');
  await r.page.locator('.ss-scheda button[aria-controls]').click();
  await r.page.getByRole('button', { name: 'Riproduci', exact: true }).click();
  await r.page.waitForTimeout(800);
  await schermata(r.page, 'desktop-riproduzione-halley');
  await r.page.getByRole('button', { name: 'Pausa' }).click();
  await chiudi(r);
});
