// Coerenza dell'interfaccia sull'applicazione reale (§ 7.8.2, § 11): colonna delle distanze libera dalla console,
// sfocatura di editor e menu Viste, messaggio di Trova, avviso del limite, zoom da tastiera, vista testuale, foglio
// del telefono, ripiego senza WebGL2, focus dopo i messaggi, numeri di "Fonti e metodi", fasce del regolo, scheda.
// Ogni prova riproduce un caso osservato con misure (getBoundingClientRect, elementFromPoint) e testi del DOM.

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { JD_MAX_UT_EXCL, JD_MIN_UT, calendarToJd } from '../src/time/calendar';
import { apri, attendiQuiete, impostaJd } from './aiuti';

interface OpzioniSessione {
  larghezza: number;
  altezza: number;
  tocco?: boolean;
  /** Fattore di scala del dispositivo (zoom del browser: 1280 × 1024 al 200 % = 640 × 512 con scala 2). */
  scala?: number;
  /** Nota di benvenuto già chiusa (preferenza salvata). */
  senzaBenvenuto?: boolean;
  senzaWebGL?: boolean;
  /** Instradamenti delle richieste prima dell'apertura della pagina. */
  instrada?: (ctx: BrowserContext) => Promise<void>;
}

async function sessione(browser: Browser, o: OpzioniSessione): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: o.tocco ?? false,
    isMobile: o.tocco ?? false,
    deviceScaleFactor: o.scala ?? 1,
  });
  if (o.senzaBenvenuto ?? true) await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
  if (o.senzaWebGL) {
    await ctx.addInitScript(() => {
      const originale = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
        if (tipo === 'webgl2') return null;
        return (originale as (this: HTMLCanvasElement, ...a: unknown[]) => unknown).call(this, tipo, ...resto);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
  }
  await o.instrada?.(ctx);
  const page = await ctx.newPage();
  await apri(page, '/', { attendi: !o.senzaWebGL });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

/** Vero se il centro dell'elemento appartiene all'elemento stesso (non è coperto da un altro pannello). */
function liberoAlCentro(page: Page, selettore: string): Promise<boolean> {
  return page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t !== null && (t === el || el.contains(t));
  });
}

/** Righe della vista testuale visibili e non coperte dopo lo scorrimento della vista fino alla seconda riga. */
function righeVisibili(page: Page): Promise<number> {
  return page.evaluate(() => {
    const righe = Array.from(document.querySelectorAll('.ss-testuale tbody tr'));
    righe[1]?.scrollIntoView({ block: 'start' });
    return righe.filter((tr) => {
      const r = tr.getBoundingClientRect();
      const y = r.top + r.height / 2;
      if (y < 0 || y > innerHeight) return false;
      const t = document.elementFromPoint(r.left + 20, y);
      return t !== null && tr.contains(t);
    }).length;
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

function annunci(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __annunci: string[] }).__annunci);
}

const avvisi = (page: Page) => page.locator('.ss-avvisi-elenco .ss-avviso');

test.describe('colonna delle distanze e pannelli sfocati (§ 11.1, § 11.3, § 11.10)', () => {
  const VISTE = [
    { larghezza: 768, altezza: 600, tocco: true },
    { larghezza: 960, altezza: 600, tocco: true },
    { larghezza: 1024, altezza: 672, tocco: false },
    { larghezza: 1024, altezza: 672, tocco: true },
    { larghezza: 1024, altezza: 600, tocco: false },
    { larghezza: 1024, altezza: 768, tocco: false },
    { larghezza: 1440, altezza: 900, tocco: false },
  ];
  for (const v of VISTE) {
    test(`${v.larghezza}×${v.altezza}${v.tocco ? ' con tocco' : ''}: +, −, Inquadra e Viste non coperti dalla console`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, v);
      for (const nome of ['Avvicina', 'Allontana', 'Inquadra il corpo selezionato', 'Viste predefinite']) {
        expect(await liberoAlCentro(page, `.ss-distanze button[aria-label="${nome}"]`), nome).toBe(true);
      }
      // Le voci del menu Viste restano raggiungibili con il puntatore.
      await page.locator('.ss-distanze button[aria-label="Viste predefinite"]').click({ timeout: 5000 });
      const voci = page.locator('.ss-distanze .ss-preset-voce');
      await expect(voci.first()).toBeVisible();
      const n = await voci.count();
      for (let i = 0; i < n; i++) {
        await voci.nth(i).scrollIntoViewIfNeeded();
        expect(await voci.nth(i).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return t !== null && el.contains(t);
        }), `voce ${i}`).toBe(true);
      }
      await ctx.close();
    });
  }

  test('editor della data e menu Viste: nessun antenato con backdrop-filter (Filter Effects 2, Backdrop Root)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const annidati = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('.ss-app *'))) {
          if (el.offsetParent === null || getComputedStyle(el).backdropFilter === 'none') continue;
          for (let a = el.parentElement; a !== null; a = a.parentElement) {
            if (getComputedStyle(a).backdropFilter !== 'none') out.push(`${el.className} in ${a.className}`);
          }
        }
        return out;
      });
    await page.locator('.ss-data').first().click();
    await expect(page.locator('.ss-editor')).toBeVisible();
    expect(await annidati()).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('.ss-distanze button[aria-label="Viste predefinite"]').click();
    await expect(page.locator('.ss-preset')).toBeVisible();
    expect(await annidati()).toEqual([]);
    // La sfocatura resta: sullo pseudo-elemento della console e della colonna.
    const filtri = await page.evaluate(() =>
      ['.ss-console', '.ss-distanze'].map((s) => getComputedStyle(document.querySelector(s)!, '::before').backdropFilter),
    );
    expect(filtri.every((f) => f.includes('blur'))).toBe(true);
    await ctx.close();
  });
});

test.describe('ricerca (§ 11.6)', () => {
  test('messaggio senza risultati nascosto uscendo dal campo; selezione dal catalogo svuota la ricerca', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const campo = page.getByRole('combobox', { name: 'Trova' });
    const vuoto = page.locator('.ss-trova-vuoto');
    await campo.fill('xyz');
    await expect(vuoto).toBeVisible();
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await expect(vuoto).toBeHidden();
    expect(await liberoAlCentro(page, '.ss-catalogo .ss-pannello-titolo')).toBe(true);
    // Al rientro nel campo il messaggio torna.
    await campo.focus();
    await expect(vuoto).toBeVisible();
    await expect(campo).toHaveAttribute('aria-describedby', /trova-vuoto/);
    await page.locator('.ss-catalogo').getByRole('button', { name: /^Marte/ }).first().click();
    await attendiQuiete(page);
    await expect(campo).toHaveValue('');
    await expect(vuoto).toBeHidden();
    await ctx.close();
  });

  test('‘Oumuamua con U+2018 e dettaglio dei risultati con il numero', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const campo = page.getByRole('combobox', { name: 'Trova' });
    await campo.fill('‘Oumuamua');
    await expect(page.getByRole('option', { name: /ʻOumuamua/ })).toBeVisible();
    await campo.fill('433');
    await expect(page.locator('.ss-trova-opzione').first()).toContainText('Eros433 · A898 PA');
    await campo.fill('halley');
    await expect(page.locator('.ss-trova-opzione').first().locator('.ss-trova-dettaglio')).toHaveCount(0);
    // 52 Europa: il nome ufficiale è già nel nome, resta la designazione (e non si scambia con la luna Europa).
    await campo.fill('europa');
    await expect(page.locator('.ss-trova-opzione', { hasText: '52 Europa' })).toContainText('52 EuropaA858 CA');
    await ctx.close();
  });
});

test.describe('avviso del limite e zoom da tastiera (§ 6.6, § 11.4.3, § 11.9)', () => {
  test('Fine dopo il limite inferiore e Inizio dopo il superiore tolgono l’avviso del limite opposto', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900 });
    await impostaJd(page, JD_MIN_UT);
    await attendiQuiete(page);
    // Al limite il pulsante ha aria-disabled ma resta attivabile da tastiera (§ 11.4.3).
    await page.getByRole('button', { name: /^Indietro di / }).first().focus();
    await page.keyboard.press('Enter');
    await expect(avvisi(page)).toContainText('Raggiunto il limite inferiore');
    const regolo = page.getByRole('slider', { name: 'Regolo temporale' });
    await regolo.focus();
    await regolo.press('End');
    await expect(avvisi(page).filter({ hasText: 'limite inferiore' })).toHaveCount(0);
    await page.getByRole('button', { name: /^Avanti di / }).first().focus();
    await page.keyboard.press('Enter');
    await expect(avvisi(page)).toContainText('Raggiunto il limite superiore');
    await regolo.focus();
    await regolo.press('Home');
    await expect(avvisi(page).filter({ hasText: 'limite superiore' })).toHaveCount(0);
    expect((await page.evaluate(() => window.__ssTest!.getTime())).jdUT).toBeCloseTo(JD_MIN_UT, 6);
    await ctx.close();
  });

  test('tasti − sulla mappa: annuncio dell’ampiezza e del limite, come il pulsante Allontana', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900 });
    await registraAnnunci(page);
    const mappa = page.locator('[role="application"]');
    await mappa.focus();
    for (let i = 0; i < 6; i++) {
      await mappa.press('-');
      await page.waitForTimeout(1700);
    }
    const testi = await annunci(page);
    expect(testi.some((t) => t.startsWith('Vista ampia'))).toBe(true);
    expect(testi.some((t) => t.includes('Distanza massima della vista raggiunta.'))).toBe(true);
    await expect(page.locator('.ss-distanze button[aria-label="Allontana"]')).toHaveAttribute('aria-disabled', 'true');
    await ctx.close();
  });
});

test.describe('vista testuale e telefono (§ 11.3, § 11.5.1, § 11.9, RF10)', () => {
  for (const v of [
    { larghezza: 1280, altezza: 800 },
    { larghezza: 1366, altezza: 768 },
  ]) {
    test(`${v.larghezza}×${v.altezza}: colonna Affidabilità visibile senza scorrere, con la scheda ridotta e aperta`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, v);
      const visibile = () =>
        page.evaluate(() => {
          const s = document.querySelector('.ss-testuale .ss-tabella-scorri')!.getBoundingClientRect();
          const th = document.querySelector('.ss-testuale th.ss-col-affidabilita')!.getBoundingClientRect();
          return th.left >= s.left - 0.5 && th.right <= s.right + 0.5;
        });
      await page.keyboard.press('t');
      await expect(page.locator('.ss-testuale')).toBeVisible();
      await attendiQuiete(page);
      await expect(page.locator('.ss-scheda')).toHaveClass(/ss-scheda--ridotta/);
      expect(await visibile()).toBe(true);
      // La scheda ridotta non copre la vista testuale.
      const sovrapposte = await page.evaluate(() => {
        const a = document.querySelector('.ss-scheda')!.getBoundingClientRect();
        const b = document.querySelector('.ss-testuale')!.getBoundingClientRect();
        return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      });
      expect(sovrapposte).toBe(false);
      await page.getByRole('button', { name: 'Espandi la scheda' }).click();
      await attendiQuiete(page);
      expect(await visibile()).toBe(true);
      await ctx.close();
    });
  }

  test('telefono 320×568, foglio medio: il pulsante della scheda non copre la legenda', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 320, altezza: 568, tocco: true });
    await page.getByRole('button', { name: 'Espandi il pannello' }).click();
    await attendiQuiete(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const chip = page.locator('.ss-chip-scheda');
    await expect(chip).toBeVisible();
    const [c, l, f] = await Promise.all(
      ['.ss-chip-scheda', '.ss-legenda', '.ss-foglio'].map((s) => page.locator(s).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      })),
    );
    expect(c!.top).toBeGreaterThanOrEqual(l!.bottom);
    expect(c!.bottom).toBeLessThanOrEqual(f!.top);
    expect(await liberoAlCentro(page, '.ss-legenda-frase')).toBe(true);
    await expect(chip).toHaveAttribute('aria-label', 'Apri la scheda della Terra');
    await ctx.close();
  });

  // Con la mappa, telefono fino a 699 px: la vista testuale mostra righe intere (a 600 × 480, 640 × 512 e 650 × 520 non ne
  // mostrava nessuna con il layout del tablet).
  for (const v of [
    { larghezza: 600, altezza: 480, scala: 1 },
    { larghezza: 640, altezza: 512, scala: 2 },
    { larghezza: 650, altezza: 520, scala: 1 },
    { larghezza: 699, altezza: 480, scala: 1 },
  ]) {
    test(`telefono ${v.larghezza}×${v.altezza}${v.scala > 1 ? `@${v.scala}` : ''}: la vista testuale con la mappa mostra almeno due righe intere`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, { ...v, tocco: v.scala === 1 });
      await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', 'telefono');
      await page.keyboard.press('t');
      await expect(page.locator('.ss-testuale')).toBeVisible();
      await expect(page.locator('.ss-testuale tbody tr').first()).toBeAttached({ timeout: 60_000 });
      await expect.poll(() => righeVisibili(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
      // Intestazione, «Aggiorna» e chiusura non sono coperti.
      expect(await liberoAlCentro(page, ".ss-testuale button[aria-label='Chiudi la vista testuale']")).toBe(true);
      await ctx.close();
    });
  }

  for (const v of [
    { larghezza: 568, altezza: 320 },
    { larghezza: 640, altezza: 360 },
    { larghezza: 667, altezza: 375 },
    { larghezza: 320, altezza: 568 },
    { larghezza: 600, altezza: 480 },
    { larghezza: 650, altezza: 520 },
    { larghezza: 699, altezza: 480 },
  ]) {
    test(`senza WebGL2, ${v.larghezza}×${v.altezza}: la vista testuale mostra almeno tre righe`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, { ...v, tocco: true, senzaBenvenuto: false, senzaWebGL: true });
      await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', v.altezza < 480 && v.larghezza > v.altezza ? 'orizzontale' : 'telefono');
      await expect(page.locator('.ss-testuale tbody tr').first()).toBeAttached({ timeout: 60_000 });
      await expect(page.getByRole('alert')).toContainText('WebGL2');
      // La vista scorre fino alle righe; i messaggi sono nella vista e non la spingono fuori dallo schermo.
      const vista = await page.locator('.ss-testuale').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      expect(vista.top).toBeLessThan(v.altezza / 2);
      // Righe visibili dopo lo scorrimento della vista fino alla seconda riga (la tabella si ridisegna all'arrivo dei dati).
      await expect.poll(() => righeVisibili(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
      await ctx.close();
    });
  }

  for (const v of [
    { larghezza: 320, altezza: 568 },
    { larghezza: 360, altezza: 640 },
    { larghezza: 640, altezza: 360 },
    { larghezza: 600, altezza: 480 },
    { larghezza: 699, altezza: 480 },
  ]) {
    test(`senza WebGL2, ${v.larghezza}×${v.altezza}: nota di benvenuto, avviso WebGL2 ed errore con «Riprova» raggiungibili, righe visibili`, async ({ browser }) => {
      const { ctx, page } = await sessione(browser, {
        ...v,
        tocco: true,
        senzaBenvenuto: false,
        senzaWebGL: true,
        instrada: (c) => c.route(/\/data\/v1\/sats\/s12\.bin$/, (r) => r.fulfill({ status: 404, body: '' })),
      });
      await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', v.altezza < 480 && v.larghezza > v.altezza ? 'orizzontale' : 'telefono');
      const riprova = page.locator('.ss-messaggi').getByRole('button', { name: 'Riprova' });
      await expect(riprova).toBeAttached({ timeout: 60_000 });
      await expect(page.locator('.ss-testuale tbody tr').first()).toBeAttached({ timeout: 60_000 });
      // Ogni messaggio, portato nell'area visibile dallo scorrimento della vista, non è coperto dalla tabella.
      for (const sel of ['.ss-benvenuto', '.ss-avvisi-bloccanti .ss-avviso', '.ss-avvisi-elenco .ss-avviso--errore', '.ss-messaggi button:has-text("Riprova")']) {
        await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
        expect(await liberoAlCentro(page, sel), `${v.larghezza}×${v.altezza}: ${sel}`).toBe(true);
      }
      await expect(page.locator('.ss-avvisi-bloccanti')).toContainText('WebGL2');
      await expect(page.locator('.ss-avvisi-elenco .ss-avviso--errore')).toContainText('Impossibile caricare i dati');
      await riprova.click({ trial: true, timeout: 5_000 });
      await expect.poll(() => righeVisibili(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
      await ctx.close();
    });
  }
});

test.describe('focus dopo la chiusura dei messaggi (WCAG 2.4.3)', () => {
  test('«Chiudi la nota di benvenuto» e «Chiudi il messaggio»: il focus passa al pulsante della data', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900, senzaBenvenuto: false });
    const chiudiNota = page.getByRole('button', { name: 'Chiudi la nota di benvenuto' });
    await chiudiNota.focus();
    await page.keyboard.press('Enter');
    await expect(chiudiNota).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ss-data') ?? false)).toBe(true);
    await impostaJd(page, JD_MAX_UT_EXCL - 0.6);
    await attendiQuiete(page);
    await page.getByRole('button', { name: /^Avanti di / }).first().focus();
    await page.keyboard.press('Enter');
    const chiudi = avvisi(page).getByRole('button', { name: 'Chiudi il messaggio' });
    await chiudi.focus();
    await page.keyboard.press('Enter');
    await expect(avvisi(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ss-data') ?? false)).toBe(true);
    await ctx.close();
  });

  test('«Riprova»: focus sul nuovo «Riprova» se il tentativo fallisce, sul pulsante della data se riesce', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
    const page = await ctx.newPage();
    let fallire = true;
    await page.route(/\/data\/v1\/planets\/p05\.bin$/, async (route) => {
      if (fallire) await route.fulfill({ status: 404, body: '' });
      else await route.continue();
    });
    await apri(page);
    // Blocco 5 (§ 8.1): T0 + 5,5 B; senza attendere la quiete, che con il blocco in errore non arriva.
    await page.evaluate((jd) => void window.__ssTest!.setTime(jd).catch(() => undefined), -1_931_200.5 + 5.5 * 365_568);
    const riprova = avvisi(page).getByRole('button', { name: 'Riprova' });
    await expect(riprova).toBeVisible({ timeout: 60_000 });
    await riprova.focus();
    await page.keyboard.press('Enter');
    await expect(avvisi(page).getByRole('button', { name: 'Riprova' })).toBeFocused({ timeout: 60_000 });
    fallire = false;
    await page.keyboard.press('Enter');
    await expect(avvisi(page)).toHaveCount(0, { timeout: 60_000 });
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ss-data') ?? false)).toBe(true);
    await ctx.close();
  });
});

test.describe('testi e fasce (§ 7.8.2, § 11.7, § 11.13)', () => {
  test('«Fonti e metodi» a 320 px: i numeri raggruppati non vanno a capo', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 320, altezza: 640, tocco: true });
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name: 'Fonti e metodi' }).click();
    const dialogo = page.locator('dialog[open]');
    await expect(dialogo).toBeVisible();
    const esito = await dialogo.evaluate((d) => {
      const out: { numero: string; nowrap: boolean; righe: number }[] = [];
      const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n !== null; n = w.nextNode()) {
        const t = n.textContent ?? '';
        for (const m of t.matchAll(/\d{1,3}(?:\u2009\d{3})+(?:,\d+)?/g)) {
          const r = document.createRange();
          r.setStart(n, m.index);
          r.setEnd(n, m.index + m[0].length);
          const tops = new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top)));
          let nowrap = false;
          for (let a = n.parentElement; a !== null && a !== d; a = a.parentElement) if (getComputedStyle(a).whiteSpace === 'nowrap') nowrap = true;
          out.push({ numero: m[0], nowrap, righe: tops.size });
        }
      }
      return out;
    });
    expect(esito.map((e) => e.numero)).toEqual(expect.arrayContaining(['84\u2009381,448', '20\u2009371,848']));
    expect(esito.filter((e) => !e.nowrap || e.righe !== 1)).toEqual([]);
    await ctx.close();
  });

  test('fasce del regolo: altezza per livello, titolo e descrizione con livelli e anni', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await page.evaluate(() => window.__ssTest!.seleziona('terra'));
    await attendiQuiete(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const bande = await page.locator('.ss-banda').evaluateAll((els) =>
      els.map((e) => ({ livello: e.getAttribute('class')!.replace(/.*ss-banda--/, ''), altezza: Number(e.getAttribute('height')), titolo: e.querySelector('title')?.textContent ?? '' })),
    );
    const attese: Record<string, number> = { precisa: 8, buona: 6, approssimata: 4, indicativa: 2 };
    expect(bande.length).toBeGreaterThan(1);
    for (const b of bande) {
      expect(b.altezza, b.livello).toBe(attese[b.livello]);
      expect(b.titolo, b.livello).toMatch(/^(Precisa|Buona|Approssimata|Indicativa|Non determinabile): dal(l')? ?.+ al(l')? ?.+$/);
    }
    const descr = await page.getByRole('slider', { name: 'Regolo temporale' }).evaluate((el) =>
      (el.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '),
    );
    expect(descr).toContain("Affidabilità della Terra nell'intervallo: approssimata dal 10000\u00a0a.C.");
    expect(descr).toMatch(/precisa dal .+ al 2120\./);
    await ctx.close();
  });

  test('scheda di Marte al passaggio al pericentro a −10000: M «0,0°», T nella scala della console', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900 });
    // TT 20 agosto 10000 a.C. 13:45; ΔT ≈ 5,07 giorni.
    const jdTT = calendarToJd({ anno: -9999, mese: 8, giorno: 20, ora: 13, minuto: 45, secondo: 0, calendario: 'giuliano' });
    await impostaJd(page, jdTT - 438_338 / 86_400);
    await page.evaluate(() => window.__ssTest!.seleziona('marte'));
    await attendiQuiete(page);
    await page.getByRole('button', { name: 'Espandi la scheda' }).click();
    await attendiQuiete(page);
    const riga = (simbolo: string) =>
      page.locator('.ss-scheda .ss-voce').filter({ has: page.locator('.ss-simbolo-elemento', { hasText: new RegExp(`^${simbolo}$`) }) }).locator('dd');
    await expect(riga('M')).toHaveText(/^0,\d°$/);
    await expect(riga('T')).toHaveText('15 agosto 10000\u00a0a.C. (UT)');
    await ctx.close();
  });
});
