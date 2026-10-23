// Accessibilità e interfaccia sull'applicazione reale (§ 13, A12-A17; § 11.9, § 11.4.2):
// - A12 riadattamento a 320, 400, 640 (scala 2: 1280 × 1024 al 200 %), 690 (pieghevole aperto), 768 e 1280 px: layout
//   atteso (telefono fino a 699 px, tablet da 700 px), niente scorrimento orizzontale, controlli ad almeno 16 px dai
//   bordi, destinazioni di almeno 44 px (tocco) o 24 px (desktop);
// - A13 solo tastiera; A14 preferenze di sistema; A15 axe-core (WCAG 2.2 A e AA, nessuna violazione grave o
//   critica); A16 messaggi di validazione delle date; A17 live region: in riproduzione tace solo per gli
//   annunci dovuti al tempo.
// Le prove a 320, 400, 640 e 690 px (layout del telefono) sono marcate @telefono e girano nel progetto mobile.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { apri, attendiQuiete, cerca, chiudiBenvenuto, schermata, verificaPulita } from './aiuti';
import type { Aperta } from './aiuti';

const NB = ' ';

interface OpzioniContesto {
  larghezza: number;
  altezza: number;
  tocco?: boolean;
  /** Fattore di scala del dispositivo (zoom del browser: 1280 × 1024 al 200 % = 640 × 512 con scala 2). */
  scala?: number;
  media?: Parameters<Page['emulateMedia']>[0];
  /** Nota di benvenuto già chiusa (preferenza salvata in una sessione precedente). */
  senzaBenvenuto?: boolean;
}

interface Sessione extends Aperta {
  ctx: BrowserContext;
}

async function sessione(browser: Browser, o: OpzioniContesto, percorso = '/'): Promise<Sessione> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: o.tocco ?? false,
    isMobile: (o.tocco ?? false) && o.larghezza < 700,
    deviceScaleFactor: o.scala ?? 1,
  });
  if (o.senzaBenvenuto) await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
  const page = await ctx.newPage();
  if (o.media) await page.emulateMedia(o.media);
  const a = await apri(page, percorso);
  await page.evaluate(() => document.fonts.ready);
  return { ...a, ctx };
}

async function chiudi(s: Sessione): Promise<void> {
  verificaPulita(s);
  await s.ctx.close();
}

// --- A12 ---

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

const VISTE = [
  { larghezza: 320, altezza: 640, tocco: true, minimo: 44, layout: 'telefono', tag: ' @telefono' },
  { larghezza: 400, altezza: 800, tocco: true, minimo: 44, layout: 'telefono', tag: ' @telefono' },
  // Zoom al 200 % su 1280 × 1024 con il mouse: finestra di 640 × 512 con scala 2, layout del telefono.
  { larghezza: 640, altezza: 512, scala: 2, tocco: false, minimo: 24, layout: 'telefono', tag: ' @telefono' },
  // Pieghevole aperto in verticale (Galaxy Z Fold 5, 690 × 829).
  { larghezza: 690, altezza: 829, tocco: true, minimo: 44, layout: 'telefono', tag: ' @telefono' },
  { larghezza: 768, altezza: 1024, tocco: true, minimo: 44, layout: 'tablet', tag: '' },
  { larghezza: 1280, altezza: 800, tocco: false, minimo: 24, layout: 'desktop', tag: '' },
] as const;

for (const v of VISTE) {
  test(`A12 riadattamento a ${v.larghezza} px${'scala' in v ? ` con scala ${v.scala}` : ''}${v.tag}`, async ({ browser }) => {
    const s = await sessione(browser, v);
    const { page } = s;
    await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', v.layout);
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'avvio con nota di benvenuto');
    await schermata(page, `a12-${v.larghezza}-avvio`);
    await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'avvio');
    if (v.layout === 'telefono') {
      await page.locator('.ss-maniglia').click();
      await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'foglio medio');
      await schermata(page, `a12-${v.larghezza}-foglio-medio`);
      await page.locator('.ss-maniglia').click();
      await page.locator('.ss-chip-scheda').click();
      await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'scheda nel foglio');
      await schermata(page, `a12-${v.larghezza}-scheda`);
    } else {
      await page.locator('.ss-scheda button[aria-controls]').first().click();
      await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'scheda espansa');
      await schermata(page, `a12-${v.larghezza}-scheda`);
    }
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'catalogo');
    await schermata(page, `a12-${v.larghezza}-catalogo`);
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await page.locator('.ss-data').click();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'editor della data');
    await schermata(page, `a12-${v.larghezza}-editor`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    await expect(page.locator('.ss-testuale')).toBeVisible();
    await verificaRiadattamento(page, v.larghezza, v.altezza, v.minimo, 'vista testuale');
    await schermata(page, `a12-${v.larghezza}-testuale`);
    await chiudi(s);
  });
}

test('A12 orizzontale con altezza inferiore a 480 px: pannello laterale di 320 px @telefono', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 844, altezza: 390, tocco: true });
  await expect(s.page.locator('.ss-app')).toHaveAttribute('data-layout', 'orizzontale');
  const r = await s.page.locator('.ss-foglio').boundingBox();
  expect(r?.width).toBeCloseTo(320, 0);
  await verificaRiadattamento(s.page, 844, 390, 44, 'orizzontale');
  await schermata(s.page, 'a12-orizzontale-844');
  await chiudi(s);
});

// --- A13 ---

test('A13 solo tastiera: 4 ottobre 1582 + 1 giorno = venerdì 15 ottobre; Marte dalla ricerca; Fonti e metodi con Esc', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800, senzaBenvenuto: true });
  const { page } = s;
  await expect(page.getByRole('button', { name: 'Chiudi la nota di benvenuto' })).toBeHidden();
  const attivo = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');

  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-salta')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-data')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-input--giorno')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('04');
  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-input--mese')).toBeFocused();
  await page.keyboard.type('ottobre');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('1582');
  for (let i = 0; i < 4 && !(await attivo()).includes('ss-input--ora'); i++) await page.keyboard.press('Tab');
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

  for (let i = 0; i < 8 && !(await attivo()).includes('ss-passo'); i++) await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Indietro di un giorno' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Avanti di un giorno' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-data-testo')).toHaveText('15 ottobre 1582');
  await expect(page.locator('.ss-settimana')).toHaveText('venerdì');
  await expect(page.locator('.ss-badge--calendario')).toHaveText('calendario gregoriano');
  await expect(page.locator('.ss-annunci')).toContainText('15 ottobre 1582, 12:00 UT, venerdì');
  await attendiQuiete(page);
  await schermata(page, 'a13-tastiera-1582');

  // Ricerca con "/": Marte selezionato e inquadrato.
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Trova' })).toBeFocused();
  await page.keyboard.type('marte');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('combobox', { name: 'Trova' })).toHaveAttribute('aria-activedescendant', /trova-op/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#marte');
  await attendiQuiete(page);
  await expect(page.locator('.ss-mappa')).toHaveAttribute('aria-label', /Marte/);
  const marte = await page.evaluate(() => window.__ssTest!.getScreenPosition('marte'));
  const vista = await page.evaluate(() => window.__ssTest!.vista()!);
  expect(marte?.visibile).toBe(true);
  // Inquadrato: Marte al centro della vista (origine della scena sul corpo a fuoco).
  expect(Math.abs(marte!.x - vista.larghezzaPx / 2)).toBeLessThan(2);
  expect(Math.abs(marte!.y - vista.altezzaPx / 2)).toBeLessThan(2);

  // Fonti e metodi: apertura con Invio, chiusura con Esc, focus restituito.
  const fonti = page.getByRole('button', { name: 'Fonti e metodi' });
  for (let i = 0; i < 12 && !(await fonti.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(fonti).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Fonti e metodi' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Fonti e metodi' })).toBeHidden();
  await expect(fonti).toBeFocused();

  // Mappa: N seleziona un corpo visibile, Esc deseleziona, Tab esce.
  await page.locator('.ss-mappa').focus();
  await page.keyboard.press('n');
  await expect(page.locator('.ss-scheda-nome')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ss-scheda')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('.ss-mappa')).not.toBeFocused();
  await chiudi(s);
});

test('A13 regolo come slider: frecce, Maiusc, PagSu, Fine, Home e aria-valuetext', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await chiudiBenvenuto(page);
  await page.evaluate(() => window.__ssTest!.setTime(2_269_013.0)); // 21 marzo 1500, 12:00 UT
  const slider = page.getByRole('slider', { name: 'Regolo temporale' });
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuetext', '21 marzo 1500, 12:00 UT, calendario giuliano');
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
  await attendiQuiete(page);
  await chiudi(s);
});

// --- A14 ---

test('A14 movimento ridotto e colori forzati: nessuna animazione, fuoco immediato, focus visibile', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800, media: { reducedMotion: 'reduce', forcedColors: 'active' } });
  const { page } = s;
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await chiudiBenvenuto(page);
  // Fuoco senza transizione animata (§ 10.3): al frame successivo alla scelta la transizione è conclusa.
  const campo = page.getByRole('combobox', { name: 'Trova' });
  await campo.fill('giove');
  await expect(page.getByRole('listbox')).toBeVisible();
  await campo.press('ArrowDown');
  await campo.press('Enter');
  const transizione = await page.evaluate(
    () => new Promise<boolean>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(window.__ssTest!.vista()!.transizione)))),
  );
  expect(transizione).toBe(false);
  await attendiQuiete(page);
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.locator('.ss-scheda button[aria-controls]').first().click();
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
    const cs = getComputedStyle(document.activeElement as HTMLElement);
    return { stile: cs.outlineStyle, spessore: Number.parseFloat(cs.outlineWidth) };
  });
  expect(outline.stile).toBe('solid');
  expect(outline.spessore).toBeGreaterThanOrEqual(2);
  await page.locator('.ss-mappa').focus();
  expect(await page.locator('.ss-mappa').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await schermata(page, 'a14-colori-forzati');
  await chiudi(s);
});

test('A14 contrasto elevato: pannelli opachi e testo secondario uguale al testo', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800, media: { contrast: 'more' } });
  const { page } = s;
  const valori = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { t2: cs.getPropertyValue('--testo-2').trim(), t: cs.getPropertyValue('--testo').trim() };
  });
  expect(valori.t2).toBe(valori.t);
  expect(await page.locator('.ss-console').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(12, 26, 21)');
  await schermata(page, 'a14-contrasto-elevato');
  await chiudi(s);
});

// --- A15 ---

async function axe(page: Page, stato: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const gravi = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    gravi.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`),
    `axe in ${stato}`,
  ).toEqual([]);
  // Navigazione per landmark (RNF3): tutto il contenuto in un landmark, un solo main e un titolo h1. Le regole
  // landmark-one-main e page-has-heading-one di axe passano anche senza, perché la mappa a tutto schermo sembra una
  // finestra modale aperta: main e h1 si contano nel DOM.
  const regioni = await new AxeBuilder({ page }).withRules(['region']).analyze();
  expect(
    regioni.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 6).join(' | ')}`),
    `landmark in ${stato}`,
  ).toEqual([]);
  expect(await page.evaluate(() => [document.querySelectorAll('main, [role=main]').length, document.querySelectorAll('h1').length]), `main e h1 in ${stato}`).toEqual([1, 1]);
}

test('A15 axe-core su desktop nei principali stati', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await axe(page, 'avvio');
  await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
  await page.locator('.ss-scheda button[aria-controls]').first().click();
  await axe(page, 'scheda espansa');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await axe(page, 'catalogo');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.getByRole('combobox', { name: 'Trova' }).fill('eu');
  await expect(page.getByRole('listbox')).toBeVisible();
  await axe(page, 'risultati della ricerca');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Livelli' }).click();
  await axe(page, 'livelli');
  await page.keyboard.press('Escape');
  await page.locator('.ss-data').click();
  await page.locator('.ss-input--anno').fill('0');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ss-editor-messaggio')).toBeVisible();
  await axe(page, 'editor con errore');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Tabella: vista testuale', exact: true }).click();
  await axe(page, 'vista testuale');
  await page.getByRole('button', { name: 'Tabella: vista testuale', exact: true }).click();
  await page.getByRole('button', { name: 'Fonti e metodi' }).click();
  await axe(page, 'Fonti e metodi');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Impostazioni' }).click();
  await axe(page, 'Impostazioni');
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Scorciatoie da tastiera' })).toBeVisible();
  await axe(page, 'scorciatoie');
  await page.keyboard.press('Escape');
  // Data remota: avviso sull'ora incerta, livelli di affidabilità ridotti nella scheda.
  await page.evaluate(() => window.__ssTest!.setTime(-1_931_076.5));
  await page.locator('.ss-scheda button[aria-controls]').first().click();
  await axe(page, '10000 a.C.');
  await schermata(page, 'a15-10000ac');
  await chiudi(s);
});

test('A15 axe-core su telefono e senza WebGL2 @telefono', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 400, altezza: 800, tocco: true });
  const { page } = s;
  await axe(page, 'telefono compatto');
  await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
  await page.locator('.ss-maniglia').click();
  await axe(page, 'telefono medio');
  await page.locator('.ss-maniglia').click();
  await page.locator('.ss-chip-scheda').click();
  await axe(page, 'telefono scheda');
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await axe(page, 'telefono catalogo');
  await page.getByRole('button', { name: 'Menu' }).click();
  await axe(page, 'telefono menu');
  await schermata(page, 'a15-telefono-menu');
  await chiudi(s);

  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const originale = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
      if (tipo === 'webgl2') return null;
      return (originale as (...x: unknown[]) => unknown).call(this, tipo, ...resto);
    } as typeof originale;
  });
  const b = await apri(p);
  await expect(p.getByRole('alert')).toContainText('Il browser non supporta la grafica 3D necessaria (WebGL2). Puoi usare la vista testuale.');
  await expect(p.locator('.ss-testuale')).toBeVisible();
  await axe(p, 'senza WebGL2');
  await schermata(p, 'a15-telefono-senza-webgl');
  verificaPulita(b);
  await ctx.close();
});

// --- A16 ---

test('A16 messaggi per anno 0, 29 febbraio, 5-14 ottobre 1582, limiti con UTC+2', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await chiudiBenvenuto(page);
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

  // Offset fisso UTC+2: limiti applicati in UT dopo la conversione.
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
  await expect(page.getByRole('button', { name: 'Indietro di un giorno' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Indietro di un giorno' }).focus();
  await page.keyboard.press('Enter');
  const limite = `Raggiunto il limite inferiore: 1° gennaio 10000${NB}a.C., 00:00 UT (02:00 in UTC+2)`;
  await expect(page.locator('.ss-avviso--info')).toContainText(limite);
  await expect(page.locator('.ss-annunci')).toContainText(limite);
  await attendiQuiete(page);
  await schermata(page, 'a16-limite-utc2');
  await chiudi(s);
});

// --- A17 ---

test('A17 in riproduzione nessun annuncio dovuto al tempo, annunci delle azioni dell’utente; pannelli al massimo 4 volte al secondo', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await chiudiBenvenuto(page);
  await page.evaluate(() => {
    const w = window as unknown as { __mutazioni: number; __date: number };
    w.__mutazioni = 0;
    w.__date = 0;
    new MutationObserver(() => w.__mutazioni++).observe(document.querySelector('.ss-annunci')!, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => w.__date++).observe(document.querySelector('.ss-data-ora')!, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('.ss-velocita').selectOption({ label: '1 min/s' });
  await page.waitForTimeout(1700);
  await page.evaluate(() => ((window as unknown as { __mutazioni: number }).__mutazioni = 0));
  await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
  const jd0 = (await page.evaluate(() => window.__ssTest!.getTime())).jdUT;
  await page.waitForTimeout(500);
  await page.evaluate(() => ((window as unknown as { __date: number }).__date = 0));
  // Nessuna azione dell'utente: la data avanza e la live region resta muta.
  await page.waitForTimeout(2000);
  const durante = await page.evaluate(() => {
    const w = window as unknown as { __mutazioni: number; __date: number };
    return { annunci: w.__mutazioni, date: w.__date };
  });
  expect(durante.annunci).toBe(0);
  expect(durante.date).toBeGreaterThan(0);
  expect(durante.date).toBeLessThanOrEqual(9);
  expect((await page.evaluate(() => window.__ssTest!.getTime())).jdUT).toBeGreaterThan(jd0);
  // Azioni esplicite dell'utente durante la riproduzione: passo, velocità e selezione da Trova sono annunciati.
  const regione = page.locator('.ss-annunci');
  await page.locator('.ss-mappa').focus();
  await page.keyboard.press('.');
  await expect(regione).toHaveText(/\d{2}:\d{2} UT, \S+$/);
  await page.waitForTimeout(1700);
  await page.keyboard.press(']');
  await expect(regione).toContainText('Velocità');
  await page.waitForTimeout(1700);
  const trova = page.getByRole('combobox', { name: 'Trova' });
  await trova.fill('marte');
  await trova.press('ArrowDown');
  await trova.press('Enter');
  await expect(regione).toHaveText('Corpo selezionato: Marte');
  await page.waitForTimeout(1700);
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(regione).toContainText('Riproduzione in pausa');
  await attendiQuiete(page);
  await chiudi(s);
});

test('A17 il caricamento dei dati dovuto all’avanzare del tempo non è annunciato in riproduzione', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await chiudiBenvenuto(page);
  // Blocco 9 ritardato: la riproduzione all'indietro dal blocco 10 resta in attesa dei dati.
  await page.route(/\/data\/v1\/(planets\/p09|sats\/s09|small\/b09)\.bin/, async (r) => {
    await new Promise((f) => setTimeout(f, 12_000));
    await r.continue();
  });
  await page.evaluate((jd) => window.__ssTest!.setTime(jd), 1_721_423.5 + 300 * 365.25);
  await attendiQuiete(page);
  await page.selectOption('.ss-velocita', '8');
  await page.getByRole('button', { name: "Riproduci all'indietro" }).click();
  // La scelta della velocità è un'azione dell'utente e si annuncia: si registra dopo l'intervallo di 1,5 s.
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    const w = window as unknown as { __testi: string[] };
    w.__testi = [];
    const r = document.querySelector('.ss-annunci')!;
    new MutationObserver(() => w.__testi.push((r.textContent ?? '').trim())).observe(r, { childList: true, characterData: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
  await expect(page.locator('.ss-attesa')).toBeVisible({ timeout: 9000 });
  await expect(page.locator('.ss-caricamento-testo')).toContainText('Caricamento dati per il periodo');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as unknown as { __testi: string[] }).__testi), 'barra di caricamento e attesa, mai nella live region').toEqual([]);
  await page.getByRole('button', { name: 'Pausa', exact: true }).click();
  await expect(page.locator('.ss-annunci')).toContainText('Riproduzione in pausa');
  await chiudi(s);
});

test('A17 con «Segui l’ora attuale» le azioni dell’utente sono annunciate, la data che avanza no', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await chiudiBenvenuto(page);
  const regione = page.locator('.ss-annunci');
  const riproduci = page.locator('.ss-riproduci');
  /** Oltre l'intervallo di 1,5 s tra due annunci: ogni azione riceve il proprio. */
  const intervallo = () => page.waitForTimeout(1700);
  const impostazioni = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Impostazioni' }).first().click();
    await page.locator('label.ss-casella', { hasText: "Segui l'ora attuale" }).click();
  };

  // Attivazione: annunciata, la riproduzione segue l'orologio.
  await impostazioni();
  await expect(regione).toHaveText("Segui l'ora attuale: attivo");
  await page.keyboard.press('Escape');
  await expect(riproduci).toHaveAttribute('aria-label', 'Pausa');
  // La data avanza di 1 s ogni secondo: nessun annuncio.
  await intervallo();
  await page.evaluate(() => {
    const w = window as unknown as { __mutazioni: number };
    w.__mutazioni = 0;
    new MutationObserver(() => w.__mutazioni++).observe(document.querySelector('.ss-annunci')!, { childList: true, characterData: true, subtree: true });
  });
  const t0 = (await page.evaluate(() => window.__ssTest!.getTime())).jdUT;
  await page.waitForTimeout(2500);
  const t1 = (await page.evaluate(() => window.__ssTest!.getTime())).jdUT;
  const mutazioni = await page.evaluate(() => (window as unknown as { __mutazioni: number }).__mutazioni);
  expect((t1 - t0) * 86_400, 'la data avanza di 1 s al secondo').toBeGreaterThan(1.5);
  expect(mutazioni, 'nessun annuncio dovuto al tempo').toBe(0);

  // Trova: numero di risultati, selezione, nessun risultato.
  const trova = page.getByRole('combobox', { name: 'Trova' });
  await trova.fill('marte');
  await expect(regione).toHaveText(/^\d+ risultat(o|i)$/);
  await intervallo();
  await trova.press('ArrowDown');
  await trova.press('Enter');
  await expect(regione).toHaveText('Corpo selezionato: Marte');
  await intervallo();
  await trova.fill('zzzzq');
  await expect(regione).toHaveText(/^Nessun corpo per «zzzzq»/);
  await intervallo();

  // Catalogo: filtro e selezione.
  await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
  await page.locator('.ss-casella--filtro', { hasText: 'Comete' }).click();
  await expect(regione).toHaveText('Comete nascoste');
  await intervallo();
  await page.locator(".ss-catalogo-voce[data-slug='giove']").click();
  await expect(regione).toHaveText('Corpo selezionato: Giove');
  await intervallo();

  // Livelli.
  await page.getByRole('button', { name: 'Livelli' }).click();
  await page.locator('.ss-livelli-gruppo .ss-casella', { hasText: 'Stelle' }).click();
  await expect(regione).toHaveText('Stelle: disattivato');
  await page.keyboard.press('Escape');
  await intervallo();

  // Mappa: N seleziona il corpo visibile successivo, T apre e chiude la vista testuale.
  await page.locator('.ss-mappa').focus();
  await page.keyboard.press('n');
  await expect(regione).toHaveText(/^Corpo selezionato: /);
  await expect(regione).not.toHaveText('Corpo selezionato: Giove');
  await intervallo();
  await page.keyboard.press('t');
  await expect(regione).toHaveText('Vista testuale aperta');
  await intervallo();
  await page.keyboard.press('t');
  await expect(regione).toHaveText('Vista testuale chiusa');
  await intervallo();

  // Nessuna di queste azioni ha fermato l'opzione.
  await expect(riproduci).toHaveAttribute('aria-label', 'Pausa');

  // Disattivazione: annunciata, la riproduzione si ferma.
  await impostazioni();
  await expect(regione).toHaveText("Segui l'ora attuale: disattivato");
  await page.keyboard.press('Escape');
  await expect(riproduci).toHaveAttribute('aria-label', 'Riproduci');
  await attendiQuiete(page);
  await chiudi(s);
});

test('A17 uscite implicite da «Segui l’ora attuale»: «disattivato» annunciato una volta, insieme alla data o al limite', async ({ browser }) => {
  const s = await sessione(browser, { larghezza: 1280, altezza: 800 });
  const { page } = s;
  await chiudiBenvenuto(page);
  const regione = page.locator('.ss-annunci');
  const riproduci = page.locator('.ss-riproduci');
  await page.evaluate(() => {
    const w = window as unknown as { __scritti: string[] };
    w.__scritti = [];
    const r = document.querySelector('.ss-annunci')!;
    new MutationObserver(() => w.__scritti.push((r.textContent ?? '').trim())).observe(r, { childList: true, characterData: true, subtree: true });
  });
  /** Scritture nella live region dopo l'azione, oltre l'intervallo di 1,5 s tra due annunci (nessun annuncio in coda). */
  const scritture = async (): Promise<string[]> => {
    await page.waitForTimeout(2200);
    return page.evaluate(() => (window as unknown as { __scritti: string[] }).__scritti.splice(0));
  };
  const attiva = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Impostazioni' }).first().click();
    await page.locator('label.ss-casella', { hasText: "Segui l'ora attuale" }).click();
    await expect(regione).toHaveText("Segui l'ora attuale: attivo");
    await page.keyboard.press('Escape');
    await expect(riproduci).toHaveAttribute('aria-label', 'Pausa');
    await scritture();
  };
  const ferma = async (): Promise<void> => {
    await expect(riproduci).toHaveAttribute('aria-label', 'Riproduci');
  };
  const dataConSegui = /^\d+.* \d{2}:\d{2} UT, \p{L}+\. Segui l'ora attuale: disattivato$/u;
  const soloData = /^\d+.* \d{2}:\d{2} UT, \p{L}+$/u;

  // Passo: la data e la disattivazione in un solo annuncio.
  await attiva();
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await ferma();
  expect(await scritture()).toEqual([expect.stringMatching(dataConSegui)]);
  // La disattivazione è già stata detta: il passo successivo annuncia la sola data.
  await page.getByRole('button', { name: /^Avanti/ }).click();
  expect(await scritture()).toEqual([expect.stringMatching(soloData)]);

  // «Adesso».
  await attiva();
  await page.locator('.ss-adesso').click();
  await ferma();
  expect(await scritture()).toEqual([expect.stringMatching(dataConSegui)]);

  // Regolo da tastiera: l'annuncio al rilascio del tasto.
  await attiva();
  await page.locator('.ss-regolo-inf').focus();
  await page.keyboard.press('ArrowLeft');
  await ferma();
  expect(await scritture()).toEqual([expect.stringMatching(dataConSegui)]);

  // Editor della data: «Vai» dopo una modifica.
  await attiva();
  await page.locator('.ss-data').click();
  const minuti = page.getByLabel('Minuti', { exact: true });
  await minuti.fill(String((Number(await minuti.inputValue()) + 7) % 60));
  await page.getByRole('button', { name: 'Vai', exact: true }).click();
  await ferma();
  expect(await scritture()).toEqual([expect.stringMatching(dataConSegui)]);

  // Passo che si ferma al limite: il messaggio del limite al posto della data, con la disattivazione.
  await attiva();
  await page.locator('.ss-unita').selectOption('millennio');
  await page.getByRole('button', { name: /^Avanti/ }).click();
  await ferma();
  expect(await scritture()).toEqual([expect.stringMatching(/^Raggiunto il limite superiore: .+\. Segui l'ora attuale: disattivato$/)]);
  await expect(page.locator('.ss-avvisi-elenco .ss-avviso--info')).toContainText('Raggiunto il limite superiore');
  await expect(page.locator('.ss-avvisi-elenco .ss-avviso--info')).not.toContainText('Segui');

  // Pausa: «Riproduzione in pausa» con la data, come prima.
  await page.locator('.ss-adesso').click();
  await scritture();
  await attiva();
  await riproduci.click();
  await ferma();
  expect(await scritture()).toEqual([expect.stringMatching(/^Riproduzione in pausa: \d+.* \d{2}:\d{2} UT, \p{L}+$/u)]);

  // Disattivazione esplicita: invariata.
  await attiva();
  await page.getByRole('button', { name: 'Impostazioni' }).first().click();
  await page.locator('label.ss-casella', { hasText: "Segui l'ora attuale" }).click();
  await ferma();
  expect(await scritture()).toEqual(["Segui l'ora attuale: disattivato"]);
  await page.keyboard.press('Escape');

  // Ingresso in TT: annuncia solo la disattivazione.
  await attiva();
  await page.locator('.ss-data').click();
  await page.locator('.ss-avanzate summary').click();
  await scritture();
  await page.getByText("Inserisci l'istante in TT").click();
  await ferma();
  expect(await scritture()).toEqual(["Segui l'ora attuale: disattivato"]);
  await page.keyboard.press('Escape');
  await attendiQuiete(page);
  await chiudi(s);
});

test('A23 lingua della pagina, titolo e assenza di U+2014 nel DOM', async ({ page }) => {
  const a = await apri(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page).toHaveTitle('Sistema solare 3D');
  await cerca(page, 'saturno');
  await page.getByRole('button', { name: 'Fonti e metodi' }).click();
  const testo = await page.evaluate(() => document.body.innerText + document.body.innerHTML);
  expect(testo.includes(String.fromCharCode(0x2014))).toBe(false);
  await page.keyboard.press('Escape');
  verificaPulita(a);
});
