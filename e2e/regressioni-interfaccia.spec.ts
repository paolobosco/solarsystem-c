// Interfaccia sull'applicazione reale: tastiera dell'editor e dei regoli, annunci della live region, nomi accessibili,
// cambio di layout, telefono in orizzontale e posizione dei messaggi rispetto a legenda e pulsanti della mappa (§ 6.6,
// § 11.3, § 11.4, § 11.5.1, § 11.9, § 11.10, § 11.12). Misure con getBoundingClientRect ed elementFromPoint.

import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { JD_MAX_UT_EXCL, calendarToJd } from '../src/time/calendar';
import { apri, attendiQuiete, cerca, decodificaPng, impostaJd, tempo } from './aiuti';

/** Argomenti di Chromium del progetto (playwright.config.ts) per un browser avviato dalla prova. */
const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** Primo istante dell'intervallo (1° gennaio 10000 a.C., 00:00 UT). */
const JD_MIN_UT = -1_931_076.5;

interface OpzioniSessione {
  larghezza: number;
  altezza: number;
  tocco?: boolean;
  /** Fattore di scala del dispositivo (zoom del browser: 1280 × 1024 al 200 % = 640 × 512 con scala 2). */
  scala?: number;
  /** Nota di benvenuto già chiusa (preferenza salvata). */
  senzaBenvenuto?: boolean;
  /** Caratteri di Google Fonts sostituiti da risposte vuote: caratteri di ripiego, come senza rete. */
  senzaCaratteri?: boolean;
  /** Errori della finestra registrati dall'avvio (registraErroriFinestra). */
  erroriFinestra?: boolean;
}

async function sessione(browser: Browser, o: OpzioniSessione): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: o.tocco ?? false,
    isMobile: o.tocco ?? false,
    deviceScaleFactor: o.scala ?? 1,
  });
  if (o.senzaBenvenuto ?? true) await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
  if (o.erroriFinestra === true) await registraErroriFinestra(ctx);
  const page = await ctx.newPage();
  // L'instradamento della pagina prevale su quello del contesto (apri, instradaFont).
  if (o.senzaCaratteri === true) {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
      r.fulfill({ status: 200, contentType: r.request().url().includes('googleapis') ? 'text/css' : 'font/woff2', body: '' }),
    );
  }
  await apri(page);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

/** Testi scritti nella live region, registrati da un MutationObserver. */
async function registraAnnunci(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __annunci: string[]; __osservatore?: MutationObserver };
    w.__annunci = [];
    w.__osservatore?.disconnect();
    const r = document.querySelector('.ss-annunci')!;
    w.__osservatore = new MutationObserver(() => w.__annunci.push((r.textContent ?? '').trim()));
    w.__osservatore.observe(r, { childList: true, characterData: true, subtree: true });
  });
}

function annunci(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __annunci: string[] }).__annunci);
}

/** Oltre l'intervallo di 1,5 s tra due annunci. */
const attendiAnnunci = (page: Page) => page.waitForTimeout(2_000);

/**
 * null se il centro e quattro punti a un quarto dai bordi (oltre gli angoli arrotondati) appartengono all'elemento:
 * nessun pannello lo copre, nemmeno in parte; altrimenti il punto coperto.
 */
function nonCoperto(page: Page, selettore: string): Promise<string | null> {
  return page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = (f: number) => r.left + f * r.width;
    const y = (f: number) => r.top + f * r.height;
    const punti: [number, number][] = [
      [x(0.5), y(0.5)],
      [x(0.25), y(0.25)],
      [x(0.75), y(0.25)],
      [x(0.25), y(0.75)],
      [x(0.75), y(0.75)],
    ];
    for (const [x, y] of punti) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return `fuori dallo schermo in ${Math.round(x)},${Math.round(y)}`;
      const t = document.elementFromPoint(x, y);
      if (t === null || !(t === el || el.contains(t))) return `coperto in ${Math.round(x)},${Math.round(y)} da ${t?.className.toString() ?? 'nulla'}`;
    }
    return null;
  });
}

test.describe('tastiera', () => {
  test('editor della data: Invio sul pulsante a.C. lo attiva come Spazio e non conferma con l’era precedente', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await page.locator('.ss-data').click();
    await page.locator('.ss-input--giorno').fill('15');
    await page.locator('.ss-input--anno').fill('500');
    const aC = page.locator('.ss-segmento', { hasText: 'a.C.' });
    await aC.focus();
    await expect(aC).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(aC).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ss-editor')).toBeVisible();
    // Conferma con Invio da un campo: data a.C.
    await page.locator('.ss-input--anno').press('Enter');
    await expect(page.locator('.ss-editor')).toBeHidden();
    await expect(page.locator('.ss-data-testo')).toHaveText(/^15 \S+ 500\sa\.C\.$/);
    await ctx.close();
  });

  test('regolo: al limite il messaggio del limite resta nella live region, senza la data al rilascio (§ 6.6)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await page.selectOption('.ss-unita', 'giorno');
    const regolo = page.locator('.ss-regolo [role=slider]').first();
    // Due pressioni ravvicinate: la seconda si ferma al limite mentre l'annuncio della prima è appena uscito.
    await page.evaluate((jd) => window.__ssTest!.setTime(jd), JD_MIN_UT + 1.5);
    await attendiQuiete(page);
    await attendiAnnunci(page);
    await registraAnnunci(page);
    await regolo.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowLeft');
    await attendiAnnunci(page);
    let a = await annunci(page);
    expect(a.at(-1), a.join(' | ')).toMatch(/^Raggiunto il limite inferiore/);
    // Una pressione al limite: il messaggio del limite non è sostituito dalla data.
    await page.evaluate((jd) => window.__ssTest!.setTime(jd), JD_MIN_UT + 0.5);
    await attendiQuiete(page);
    await attendiAnnunci(page);
    await registraAnnunci(page);
    await regolo.focus();
    await page.keyboard.press('ArrowLeft');
    await attendiAnnunci(page);
    a = await annunci(page);
    expect(a, a.join(' | ')).toHaveLength(1);
    expect(a[0]).toMatch(/^Raggiunto il limite inferiore/);
    await ctx.close();
  });

  test('regolo delle distanze: 10³ km in alto accanto ad Avvicina; FrecciaSu e PagSu avvicinano come sulla mappa', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const centroY = (l: Locator) =>
      l.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    const ampiezza = () => page.evaluate(() => window.__ssTest!.vista()!.estensioneKm);
    const tacca = (testo: RegExp) => centroY(page.locator('.ss-distanze-tacca', { hasText: testo }));
    expect(await tacca(/^1\s000\skm$/)).toBeLessThan(await tacca(/^100\s000\sUA$/));
    const piu = page.locator('.ss-distanze').getByRole('button', { name: 'Avvicina' });
    const meno = page.locator('.ss-distanze').getByRole('button', { name: 'Allontana' });
    const pollice = page.locator('.ss-distanze-pollice');
    const regolo = page.locator('.ss-distanze-slider');
    expect(await centroY(piu)).toBeLessThan(await centroY(regolo));
    expect(await centroY(meno)).toBeGreaterThan(await centroY(regolo));
    // Avvicina: il pollice si sposta verso il pulsante premuto.
    const prima = await centroY(pollice);
    await piu.click();
    await expect.poll(() => centroY(pollice)).toBeLessThan(prima - 5);
    await meno.click();
    await expect.poll(() => centroY(pollice)).toBeGreaterThan(prima - 1);
    await attendiQuiete(page);
    // PagSu: avvicina sulla mappa e sul regolo delle distanze.
    const slider = page.getByRole('slider', { name: 'Ampiezza della vista' });
    for (const [bersaglio, nome] of [
      [page.locator('.ss-mappa'), 'mappa'],
      [slider, 'regolo'],
    ] as const) {
      const a0 = await ampiezza();
      const v0 = Number(await slider.getAttribute('aria-valuenow'));
      await bersaglio.focus();
      await page.keyboard.press('PageUp');
      await attendiQuiete(page);
      await expect.poll(ampiezza, nome).toBeLessThan(a0 * 0.5);
      expect(Number(await slider.getAttribute('aria-valuenow')), nome).toBeGreaterThan(v0);
      await page.keyboard.press('PageDown');
      await attendiQuiete(page);
    }
    await slider.focus();
    const a1 = await ampiezza();
    await page.keyboard.press('ArrowUp');
    await attendiQuiete(page);
    await expect.poll(ampiezza).toBeLessThan(a1);
    await ctx.close();
  });
});

test.describe('regolo delle distanze: annuncio dell’ampiezza ottenuta e dei limiti (§ 11.3, § 11.9)', () => {
  test('Inizio, Fine, frecce e puntatore: valore effettivo (non quello richiesto), messaggio del limite e aria-disabled', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await attendiAnnunci(page);
    await registraAnnunci(page);
    const slider = page.getByRole('slider', { name: 'Ampiezza della vista' });
    const avvicina = page.locator('.ss-distanze').getByRole('button', { name: 'Avvicina' });
    const allontana = page.locator('.ss-distanze').getByRole('button', { name: 'Allontana' });
    const LIMITE_MIN = 'Distanza minima della vista raggiunta.';
    const LIMITE_MAX = 'Distanza massima della vista raggiunta.';
    const ampiezza = () => page.evaluate(() => window.__ssTest!.vista()!.estensioneKm);
    /** Ultimo annuncio dopo l'azione (oltre l'intervallo tra due annunci e l'attesa del ridisegno). */
    const dopo = async (azione: () => Promise<void>) => {
      await azione();
      await attendiQuiete(page);
      await attendiAnnunci(page);
      return (await annunci(page)).at(-1);
    };
    const valore = async () => (await slider.getAttribute('aria-valuetext'))!;

    // Fuoco sul Sole: la quota minima impedisce di arrivare a 10³ km.
    await slider.focus();
    let a = await dopo(() => slider.press('End'));
    expect(await ampiezza(), 'il Sole impedisce 10³ km').toBeGreaterThan(100_000);
    expect(await valore()).toMatch(/^Vista ampia 5\d{2}\s000\skm$/);
    expect(a, 'Fine: ampiezza ottenuta e limite').toBe(`${await valore()}. ${LIMITE_MIN}`);
    await expect(avvicina).toHaveAttribute('aria-disabled', 'true');
    await expect(allontana).not.toHaveAttribute('aria-disabled', 'true');
    // Ancora al limite: senza spostamento solo il messaggio; Fine ripetuto lo stesso.
    expect(await dopo(() => slider.press('ArrowUp')), 'FrecciaSu al limite').toBe(LIMITE_MIN);
    expect(await dopo(() => slider.press('End')), 'Fine al limite').toBe(LIMITE_MIN);
    expect(await dopo(() => slider.press('PageUp')), 'PagSu al limite').toBe(LIMITE_MIN);
    await expect(avvicina).toHaveAttribute('aria-disabled', 'true');

    // Inizio: vista più ampia, limite massimo; Avvicina torna attivo.
    a = await dopo(() => slider.press('Home'));
    expect(await valore()).toMatch(/^Vista ampia 200\s000\sUA$/);
    expect(a, 'Inizio').toBe(`${await valore()}. ${LIMITE_MAX}`);
    await expect(allontana).toHaveAttribute('aria-disabled', 'true');
    await expect(avvicina).not.toHaveAttribute('aria-disabled', 'true');
    expect(await dopo(() => slider.press('ArrowDown')), 'FrecciaGiù al limite').toBe(LIMITE_MAX);
    expect(await dopo(() => slider.press('Home')), 'Inizio al limite').toBe(LIMITE_MAX);

    // Lontano dai limiti: solo l'ampiezza, nessun limite, pulsanti attivi.
    a = await dopo(() => slider.press('ArrowUp'));
    expect(a, 'FrecciaSu lontano dai limiti').toBe(await valore());
    expect(a).not.toContain('raggiunta');
    await expect(allontana).not.toHaveAttribute('aria-disabled', 'true');
    await expect(avvicina).not.toHaveAttribute('aria-disabled', 'true');

    // Puntatore: rilascio all'estremo vicino con il Sole a fuoco.
    const traccia = (await page.locator('.ss-distanze-traccia').boundingBox())!;
    a = await dopo(async () => {
      await page.mouse.move(traccia.x + traccia.width / 2, traccia.y + traccia.height / 2);
      await page.mouse.down();
      await page.mouse.move(traccia.x + traccia.width / 2, traccia.y + 1, { steps: 4 });
      await page.mouse.up();
    });
    expect(a, 'puntatore al limite vicino').toBe(`${await valore()}. ${LIMITE_MIN}`);
    await expect(avvicina).toHaveAttribute('aria-disabled', 'true');
    // Puntatore a metà corsa: nessun limite.
    a = await dopo(async () => {
      await page.mouse.click(traccia.x + traccia.width / 2, traccia.y + traccia.height / 2);
    });
    expect(a, 'puntatore a metà corsa').toBe(await valore());
    await expect(avvicina).not.toHaveAttribute('aria-disabled', 'true');

    // Fuoco sulla Terra: Fine non annuncia 1 000 km ma il valore ottenuto.
    await page.evaluate(() => (location.hash = '#terra'));
    await attendiQuiete(page);
    await attendiAnnunci(page);
    await slider.focus();
    a = await dopo(() => slider.press('End'));
    expect(await ampiezza(), 'la Terra impedisce 10³ km').toBeGreaterThan(2_000);
    expect(await ampiezza()).toBeLessThan(50_000);
    expect(a, 'Fine sulla Terra').toBe(`${await valore()}. ${LIMITE_MIN}`);
    expect(a).not.toMatch(/^Vista ampia 1\s000\skm/);
    await ctx.close();
  });

  test('vista sotto 10³ km (corpo piccolo): le frecce avvicinano ancora e Fine non allontana la vista', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await page.evaluate(() => (location.hash = '#bennu'));
    await attendiQuiete(page);
    await attendiAnnunci(page);
    const ampiezza = () => page.evaluate(() => window.__ssTest!.vista()!.estensioneKm);
    const slider = page.getByRole('slider', { name: 'Ampiezza della vista' });
    const avvicina = page.locator('.ss-distanze').getByRole('button', { name: 'Avvicina' });
    for (let i = 0; i < 6; i++) await avvicina.click();
    await attendiQuiete(page);
    const a0 = await ampiezza();
    expect(a0, 'Bennu permette di scendere sotto 10³ km').toBeLessThan(1_000);
    await registraAnnunci(page);
    await slider.focus();
    await slider.press('ArrowUp');
    await attendiQuiete(page);
    await expect.poll(ampiezza, 'FrecciaSu avvicina anche sotto l’estremo del regolo').toBeLessThan(a0 * 0.9);
    const a1 = await ampiezza();
    await attendiAnnunci(page);
    await slider.press('End');
    await attendiQuiete(page);
    await attendiAnnunci(page);
    expect(await ampiezza(), 'Fine non allontana la vista').toBeLessThanOrEqual(a1 * 1.001);
    expect((await annunci(page)).at(-1), 'Fine: senza spostamento solo il messaggio del limite').toBe('Distanza minima della vista raggiunta.');
    await ctx.close();
  });
});

test.describe('live region e annunci', () => {
  test('collegamento seguito: «Corpo selezionato», anche dopo un collegamento ignorato (§ 11.9, § 11.12)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await attendiAnnunci(page);
    await registraAnnunci(page);
    for (const [hash, atteso] of [
      ['#marte', 'Corpo selezionato: Marte'],
      ['#nonesiste', /^Nessun corpo corrisponde a «nonesiste»/],
      ['#encelado', 'Corpo selezionato: Encelado'],
      ['#sole', 'Corpo selezionato: Sole'],
    ] as const) {
      await page.evaluate((h) => (location.hash = h), hash);
      await attendiQuiete(page);
      await attendiAnnunci(page);
      const a = await annunci(page);
      if (typeof atteso === 'string') expect(a.at(-1), hash).toBe(atteso);
      else expect(a.at(-1), hash).toMatch(atteso);
    }
    await ctx.close();
  });

  test('«Mostra di nuovo la nota di benvenuto»: chiude Impostazioni e porta il focus sulla nota', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const dialogo = page.getByRole('dialog', { name: 'Impostazioni' });
    const nota = page.locator('.ss-benvenuto');
    await expect(nota).toBeHidden();
    for (const caso of ['nota chiusa', 'nota già visibile']) {
      await page.getByRole('button', { name: 'Impostazioni' }).click();
      await expect(dialogo).toBeVisible();
      await page.getByRole('button', { name: 'Mostra di nuovo la nota di benvenuto' }).click();
      await expect(dialogo, caso).toBeHidden();
      await expect(nota, caso).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.closest('.ss-benvenuto') !== null), caso).toBe(true);
    }
    await ctx.close();
  });
});

test.describe('nomi accessibili (WCAG 2.5.3)', () => {
  test('pulsanti Tabella e della data: il nome contiene l’etichetta visibile, anche nel foglio del telefono', async ({ browser }) => {
    const desktop = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const tabella = desktop.page.locator('.ss-strumenti button', { hasText: 'Tabella' });
    await expect(tabella).toHaveAccessibleName(/^Tabella/);
    const visibile = async (page: Page) =>
      page.evaluate(() => {
        const vis = (sel: string) => {
          const el = document.querySelector<HTMLElement>(sel)!;
          return getComputedStyle(el).display === 'none' ? null : (el.textContent ?? '').trim();
        };
        return { data: vis('.ss-data-testo') ?? vis('.ss-data-breve'), ora: vis('.ss-data-ora') };
      });
    let v = await visibile(desktop.page);
    await expect(desktop.page.locator('.ss-data')).toHaveAccessibleName(`Data e ora: ${v.data} ${v.ora}. Modifica`);
    const r = await new AxeBuilder({ page: desktop.page }).withRules(['label-content-name-mismatch']).analyze();
    expect(r.violations.map((x) => x.nodes.map((n) => n.target.join(' ')).join(' | '))).toEqual([]);
    await desktop.ctx.close();

    const telefono = await sessione(browser, { larghezza: 400, altezza: 800, tocco: true });
    await expect(telefono.page.locator('.ss-app')).toHaveAttribute('data-foglio', 'compatto');
    v = await visibile(telefono.page);
    expect(v.data).toMatch(/^\d+ [a-z]{3} /);
    await expect(telefono.page.locator('.ss-data')).toHaveAccessibleName(`Data e ora: ${v.data} ${v.ora}. Modifica`);
    await telefono.ctx.close();
  });
});

test.describe('ordine del focus nella console (WCAG 2.4.3, § 11.9)', () => {
  type Gruppo = 'passi' | 'regolo' | 'riproduzione';
  /** Gruppi della console nell'ordine di tabulazione a partire da «Adesso», e riquadri dei gruppi. */
  async function ordineTab(page: Page): Promise<{ focus: Gruppo[]; riquadri: Record<Gruppo, { left: number; top: number; right: number; bottom: number }> }> {
    await page.locator('.ss-adesso').focus();
    const focus: Gruppo[] = [];
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      const g = await page.evaluate((): Gruppo | null => {
        const el = document.activeElement;
        if (el === null) return null;
        if (el.closest('.ss-passi')) return 'passi';
        if (el.closest('.ss-regolo')) return 'regolo';
        if (el.closest('.ss-riproduzione')) return 'riproduzione';
        return null;
      });
      if (g === null) {
        if (focus.length > 0) break;
        continue;
      }
      if (focus.at(-1) !== g) focus.push(g);
    }
    const riquadri = await page.evaluate(() => {
      const r = (sel: string) => {
        const b = document.querySelector(sel)!.getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      };
      return { passi: r('.ss-passi'), regolo: r('.ss-regolo'), riproduzione: r('.ss-riproduzione') };
    });
    return { focus, riquadri };
  }

  const LAYOUT = [
    { nome: 'desktop', layout: 'desktop', larghezza: 1280, altezza: 800, tocco: false, foglioMedio: false },
    { nome: 'tablet', layout: 'tablet', larghezza: 768, altezza: 1024, tocco: true, foglioMedio: false },
    { nome: 'telefono con il foglio medio', layout: 'telefono', larghezza: 400, altezza: 800, tocco: true, foglioMedio: true },
    { nome: 'orizzontale', layout: 'orizzontale', larghezza: 800, altezza: 400, tocco: true, foglioMedio: false },
  ] as const;

  test('Tab segue l’ordine visivo: regolo sopra i passi fuori dal desktop, passi | regolo | riproduzione sul desktop', async ({ browser }) => {
    for (const v of LAYOUT) {
      const { ctx, page } = await sessione(browser, v);
      await expect(page.locator('.ss-app'), v.nome).toHaveAttribute('data-layout', v.layout);
      if (v.foglioMedio) await page.locator('.ss-maniglia').click();
      const { focus, riquadri: r } = await ordineTab(page);
      if (v.layout === 'desktop') {
        expect(focus, v.nome).toEqual(['passi', 'regolo', 'riproduzione']);
        expect(r.passi.right, `${v.nome}: passi a sinistra del regolo`).toBeLessThanOrEqual(r.regolo.left + 1);
        expect(r.regolo.right, `${v.nome}: regolo a sinistra della riproduzione`).toBeLessThanOrEqual(r.riproduzione.left + 1);
      } else {
        expect(focus, v.nome).toEqual(['regolo', 'passi', 'riproduzione']);
        expect(r.regolo.bottom, `${v.nome}: regolo sopra i passi`).toBeLessThanOrEqual(r.passi.top + 1);
        expect(r.regolo.bottom, `${v.nome}: regolo sopra la riproduzione`).toBeLessThanOrEqual(r.riproduzione.top + 1);
        // Passi prima della riproduzione: nella riga sopra, o a sinistra nella stessa riga.
        const stessaRiga = Math.abs(r.passi.top - r.riproduzione.top) < 20;
        if (stessaRiga) expect(r.passi.right, `${v.nome}: passi a sinistra della riproduzione`).toBeLessThanOrEqual(r.riproduzione.left + 1);
        else expect(r.passi.bottom, `${v.nome}: passi sopra la riproduzione`).toBeLessThanOrEqual(r.riproduzione.top + 1);
      }
      await ctx.close();
    }
  });

  test('cambio di layout con il focus sui passi: il focus resta e l’ordine segue il nuovo layout', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const avanti = page.locator('.ss-passi').getByRole('button', { name: /^Avanti/ });
    await avanti.focus();
    for (const [w, h, layout, atteso] of [
      [768, 1024, 'tablet', ['regolo', 'passi', 'riproduzione']],
      [1280, 800, 'desktop', ['passi', 'regolo', 'riproduzione']],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', layout);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(avanti, layout).toBeFocused();
      expect((await ordineTab(page)).focus, layout).toEqual(atteso);
      await avanti.focus();
    }
    await ctx.close();
  });
});

test.describe('layout', () => {
  test('cambio di layout con il focus nel catalogo o nella scheda: il focus resta e il pannello resta visibile', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1440, altezza: 900 });
    const marca = () =>
      page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (a === null || a === document.body) return null;
        a.dataset['provaFocus'] = '1';
        return a.tagName;
      });
    const conMarca = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['provaFocus'] === '1');
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await page.locator('.ss-catalogo input').first().focus();
    expect(await marca()).toBe('INPUT');
    for (const [w, h, layout] of [
      [500, 800, 'telefono'],
      [1440, 900, 'desktop'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', layout);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await conMarca(), `catalogo, ${layout}`).toBe(true);
      await expect(page.locator('.ss-catalogo'), `catalogo, ${layout}`).toBeVisible();
    }
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await cerca(page, 'Giove');
    await page.locator('.ss-scheda button[aria-controls]').first().focus();
    expect(await marca()).toBe('BUTTON');
    for (const [w, h, layout] of [
      [390, 844, 'telefono'],
      [1440, 900, 'desktop'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await expect(page.locator('.ss-app')).toHaveAttribute('data-layout', layout);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await conMarca(), `scheda, ${layout}`).toBe(true);
      await expect(page.locator('.ss-scheda'), `scheda, ${layout}`).toBeVisible();
    }
    await ctx.close();
  });

  test('telefono in orizzontale (480-640 px): campo Trova di almeno 120 px, barra e pulsanti della mappa non coperti', async ({ browser }) => {
    for (const [w, h] of [
      [480, 320],
      [568, 320],
      [640, 360],
    ] as const) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, tocco: true });
      await expect(page.locator('.ss-app'), `${w}x${h}`).toHaveAttribute('data-layout', 'orizzontale');
      const campo = await page.locator('.ss-trova-input').boundingBox();
      expect(campo!.width, `${w}x${h}: campo Trova`).toBeGreaterThanOrEqual(120);
      for (const sel of ['.ss-trova-input', '.ss-trova-catalogo', '.ss-strumenti .ss-strumento.ss-solo-telefono']) {
        expect(await nonCoperto(page, sel), `${w}x${h}: ${sel}`).toBeNull();
      }
      const n = await page.locator('.ss-zoom-mobile .ss-pulsante').count();
      for (let i = 0; i < n; i++) expect(await nonCoperto(page, `.ss-zoom-mobile .ss-pulsante >> nth=${i}`), `${w}x${h}: pulsante ${i}`).toBeNull();
      await page.locator('.ss-trova-input').fill('marte');
      const lista = await page.locator('.ss-trova-lista').boundingBox();
      expect(lista!.width, `${w}x${h}: elenco dei risultati`).toBeGreaterThanOrEqual(120);
      await ctx.close();
    }
  });

  test('nota di benvenuto e caricamento: legenda permanente visibile, pulsanti della mappa non coperti (§ 11.3, § 11.5.1)', async ({ browser }) => {
    let conChip = 0;
    for (const { w, h, scala } of [
      { w: 400, h: 800 },
      { w: 320, h: 568 },
      { w: 320, h: 480 },
      // Telefono fino a 699 px: finestre a metà schermo, pieghevoli aperti, tablet da 7-8 pollici, zoom al 200 %.
      { w: 600, h: 480 },
      { w: 640, h: 512, scala: 2 },
      { w: 650, h: 520 },
      { w: 690, h: 829 },
      { w: 699, h: 480 },
      { w: 699, h: 700 },
      { w: 700, h: 700 },
      { w: 768, h: 1024 },
      { w: 640, h: 360 },
      { w: 568, h: 320 },
      { w: 480, h: 320 },
    ]) {
      const tocco = w < 1024;
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, scala: scala ?? 1, tocco, senzaBenvenuto: false });
      const caso = `${w}x${h}${scala ? `@${scala}` : ''}`;
      await expect(page.locator('.ss-benvenuto'), caso).toBeVisible();
      for (const sel of ['.ss-legenda-frase', '.ss-barra-valore', '.ss-benvenuto button[aria-label="Chiudi la nota di benvenuto"]']) expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      const layout = await page.locator('.ss-app').getAttribute('data-layout');
      // Console non coperta dai messaggi (in orizzontale i messaggi sono nel pannello, sopra la console che scorre).
      if (layout !== 'orizzontale') for (const sel of ['.ss-data', '.ss-riproduci']) expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      const pulsanti = layout === 'tablet' ? '.ss-distanze > .ss-pulsante' : '.ss-zoom-mobile .ss-pulsante';
      const n = await page.locator(pulsanti).count();
      expect(n, caso).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < n; i++) expect(await nonCoperto(page, `${pulsanti} >> nth=${i}`), `${caso}: pulsante ${i}`).toBeNull();
      // Testo della nota non tagliato dal bordo della finestra.
      const nota = await page.locator('.ss-benvenuto').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { destra: r.right, larghezza: r.width, sinistra: r.left };
      });
      expect(nota.sinistra, caso).toBeGreaterThanOrEqual(0);
      expect(nota.destra, caso).toBeLessThanOrEqual(w);
      expect(nota.larghezza, caso).toBeGreaterThanOrEqual(200);
      // Telefono: il pulsante «Apri la scheda» non è coperto dai messaggi, nemmeno dal bordo sfumato della nota, e si attiva.
      if (layout === 'telefono' && (await page.locator('.ss-chip-scheda').isVisible())) {
        conChip++;
        expect(await nonCoperto(page, '.ss-chip-scheda'), `${caso}: pulsante «Apri la scheda»`).toBeNull();
        expect(sovrapposti(await rettangoloDi(page, '.ss-messaggi'), await rettangoloDi(page, '.ss-chip-scheda')), `${caso}: messaggi e pulsante «Apri la scheda»`).toBe(false);
        await page.locator('.ss-chip-scheda').tap();
        await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-foglio', 'esteso');
      }
      await ctx.close();
    }
    expect(conChip, 'la prova esercita il pulsante «Apri la scheda»').toBeGreaterThanOrEqual(9);
    // Messaggio di caricamento sul telefono: la legenda resta visibile.
    const { ctx, page } = await sessione(browser, { larghezza: 400, altezza: 800, tocco: true });
    await page.route(/\/data\/v1\/.*\/b\d+\.bin$/, async (r) => {
      await new Promise((f) => setTimeout(f, 8_000));
      await r.continue();
    });
    await page.evaluate(() => void window.__ssTest!.setTime(1_365_583.5));
    await expect(page.locator('.ss-caricamento')).toBeVisible();
    for (const sel of ['.ss-legenda-frase', '.ss-barra-valore']) expect(await nonCoperto(page, sel), `caricamento: ${sel}`).toBeNull();
    await ctx.close();
  });

  test('telefono in orizzontale, pannello scorso: caricamento ed errore con «Riprova» visibili, focus visibile (§ 11.3, § 11.11)', async ({ browser }) => {
    for (const [w, h] of [
      [844, 390],
      [640, 360],
      [568, 320],
    ] as const) {
      const caso = `${w}x${h}`;
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, tocco: true });
      await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', 'orizzontale');
      await page.getByRole('button', { name: 'Avanti di un giorno' }).click();
      await attendiQuiete(page);
      // Blocco 5 (4996 a.C.-3996 a.C.) trattenuto, poi non trovato.
      let rilascia = (): void => undefined;
      const trattieni = new Promise<void>((r) => (rilascia = r));
      await page.route(/\/data\/v1\/(planets|sats)\/[ps]05\.bin$/, async (r) => {
        await trattieni;
        await r.fulfill({ status: 404, body: '' });
      });
      await page.getByRole('combobox', { name: 'Unità del passo' }).selectOption('millennio');
      const indietro = page.getByRole('button', { name: 'Indietro di un millennio' });
      for (let i = 0; i < 7; i++) await indietro.click();
      await expect(page.locator('.ss-caricamento'), caso).toBeVisible();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await nonCoperto(page, '.ss-caricamento'), `${caso}: caricamento`).toBeNull();
      await expect(indietro, caso).toBeFocused();
      expect(await nonCoperto(page, '.ss-console button[aria-label="Indietro di un millennio"]'), `${caso}: pulsante con il focus`).toBeNull();
      rilascia();
      const errore = page.locator('.ss-avvisi-elenco .ss-avviso--errore');
      await expect(errore, caso).toContainText('Impossibile caricare i dati per il periodo 4996 a.C.-3996 a.C.', { timeout: 60_000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      for (const sel of ['.ss-avvisi-elenco .ss-avviso--errore', '.ss-avvisi-elenco .ss-avviso--errore button']) {
        expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      }
      await expect(indietro, caso).toBeFocused();
      expect(await nonCoperto(page, '.ss-console button[aria-label="Indietro di un millennio"]'), `${caso}: pulsante con il focus`).toBeNull();
      await ctx.close();
    }
  });
});

interface Rettangolo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rettangoloDi = (page: Page, selettore: string): Promise<Rettangolo> =>
  page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  });

const sovrapposti = (a: Rettangolo, b: Rettangolo): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Due fotogrammi: altezze dei pannelli (ResizeObserver) e forma della nota (fotogramma successivo) aggiornate. */
const dueFotogrammi = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Testo della nota di benvenuto (src/ui/testi.it.ts, T.messaggi.benvenuto). */
const FRASI_NOTA = [
  'Mappa del Sistema solare in scala reale, dal 10000 a.C. al 2120.',
  'Scegli la data nella console in basso; cerca un corpo con Trova o selezionalo nella mappa.',
  'La scheda di ogni corpo indica fonti e affidabilità della posizione.',
];

/**
 * Voci dei preset nel menu `selettore`, senza scorrere: quante sono intere (dentro il menu e la finestra) e quali sono
 * coperte in almeno uno di nove punti (da altri pannelli, dalla nota o dal bordo del menu).
 */
function vociMenu(page: Page, selettore: string): Promise<{ voci: number; intere: number; coperte: string[] }> {
  return page.locator(selettore).first().evaluate((menu) => {
    const m = menu.getBoundingClientRect();
    const voci = Array.from(menu.querySelectorAll<HTMLElement>('.ss-preset-voce'));
    let intere = 0;
    const coperte: string[] = [];
    for (const [i, el] of voci.entries()) {
      const r = el.getBoundingClientRect();
      const dentro = r.top >= m.top - 0.5 && r.bottom <= m.bottom + 0.5 && r.left >= m.left - 0.5 && r.right <= m.right + 0.5;
      if (dentro && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth) intere++;
      const sopra = new Set<string>();
      for (const fx of [0.05, 0.5, 0.95]) {
        for (const fy of [0.15, 0.5, 0.85]) {
          const t = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          if (t === null || !el.contains(t)) sopra.add(t?.className.toString() ?? 'fuori');
        }
      }
      if (sopra.size > 0) coperte.push(`${i}: ${[...sopra].join(', ')}`);
    }
    return { voci: voci.length, intere, coperte };
  });
}

/** null se l'elemento con il focus è nella finestra e nessun pannello lo copre (centro e quattro punti interni). */
function fuocoVisibile(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return 'focus sul body';
    const r = el.getBoundingClientRect();
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.2, 0.25],
      [0.8, 0.25],
      [0.2, 0.75],
      [0.8, 0.75],
    ] as const) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return `${el.className} fuori dalla finestra`;
      const t = document.elementFromPoint(x, y);
      if (t === null || !el.contains(t)) return `${el.className} coperto da ${t?.className.toString() ?? 'nulla'}`;
    }
    return null;
  });
}

/**
 * null se l'elemento con il focus mostra l'indicatore (:focus-visible, outline) e l'anello sta tutto nella parte visibile
 * del suo antenato `contenitore` (messaggi, Scheda, menu), che scorre e lo taglierebbe; altrimenti il motivo.
 */
function anelloIntero(page: Page, contenitore: string): Promise<string | null> {
  return page.evaluate((sel) => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return 'focus sul body';
    const cs = getComputedStyle(el);
    if (!el.matches(':focus-visible') || cs.outlineStyle === 'none') return `${el.className}: nessun indicatore`;
    const e = (Number.parseFloat(cs.outlineWidth) || 0) + (Number.parseFloat(cs.outlineOffset) || 0);
    const r = el.getBoundingClientRect();
    const m = el.closest<HTMLElement>(sel);
    if (m === null) return `${el.className}: fuori da ${sel}`;
    const q = m.getBoundingClientRect();
    const c = { x0: q.left + m.clientLeft, y0: q.top + m.clientTop, x1: q.left + m.clientLeft + m.clientWidth, y1: q.top + m.clientTop + m.clientHeight };
    const a = { x0: r.left - e, y0: r.top - e, x1: r.right + e, y1: r.bottom + e };
    const dentro = a.x0 >= c.x0 - 0.5 && a.y0 >= c.y0 - 0.5 && a.x1 <= c.x1 + 0.5 && a.y1 <= c.y1 + 0.5;
    const fmt = (v: number[]) => v.map((x) => Math.round(x * 10) / 10).join(',');
    return dentro ? null : `${el.className}: anello [${fmt([a.x0, a.y0, a.x1, a.y1])}] fuori da [${fmt([c.x0, c.y0, c.x1, c.y1])}]`;
  }, contenitore);
}

/** Punti (passo di 6 px, 14 px dentro i bordi arrotondati) del pannello `selettore` che appartengono ad altri elementi. */
function puntiCoperti(page: Page, selettore: string): Promise<string[]> {
  return page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const out = new Set<string>();
    for (let x = r.left + 14; x <= r.right - 14; x += 6) {
      for (let y = r.top + 14; y <= r.bottom - 14; y += 6) {
        if (x >= innerWidth || y >= innerHeight) continue;
        const t = document.elementFromPoint(x, y);
        if (t === null || !el.contains(t)) out.add(t?.className.toString() ?? 'nulla');
      }
    }
    return [...out];
  });
}

/** Errori registrati sulla finestra (anche "ResizeObserver loop completed with undelivered notifications", che non è un pageerror). */
async function registraErroriFinestra(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __erroriFinestra: string[] };
    w.__erroriFinestra = [];
    window.addEventListener('error', (e) => w.__erroriFinestra.push(String(e.message)));
  });
}

const erroriFinestra = (page: Page) => page.evaluate(() => (window as unknown as { __erroriFinestra: string[] }).__erroriFinestra);

/** Intestazione della Scheda (nome, «Espandi la scheda», «Chiudi la scheda») libera e Scheda sopra la console. */
async function intestazioneSchedaLibera(page: Page, caso: string): Promise<void> {
  for (const sel of ['.ss-scheda-nome', '.ss-scheda-pulsanti > button:first-child', '.ss-scheda-pulsanti > button:last-child']) {
    expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
  }
  const scheda = await rettangoloDi(page, '.ss-scheda');
  expect(scheda.y1, `${caso}: Scheda sopra la console`).toBeLessThanOrEqual((await rettangoloDi(page, '.ss-console')).y0 + 0.5);
}

/**
 * Messaggio `selettore` in cima alla parte visibile dei messaggi: occupa tutto lo spazio che il contenitore gli concede
 * (intero se entra), il centro della parte visibile è libero e, se ne resta fuori una parte, il bordo inferiore sfuma.
 */
function inCimaAiMessaggi(page: Page, selettore: string): Promise<string | null> {
  return page.locator(selettore).first().evaluate((el) => {
    const m = el.closest<HTMLElement>('.ss-messaggi')!;
    const r = el.getBoundingClientRect();
    const c = m.getBoundingClientRect();
    if (Math.abs(r.top - c.top) > 0.5) return `comincia a ${Math.round(r.top - c.top)} px dal bordo dei messaggi`;
    const visibile = Math.min(r.bottom, c.bottom) - r.top;
    if (visibile < Math.min(r.height, c.height) - 0.5) return `visibili ${Math.round(visibile)} px su ${Math.round(r.height)}`;
    if (r.bottom > c.bottom + 0.5 && !/giu|entrambi/.test(m.dataset['scorri'] ?? '')) return 'parte nascosta senza sfumatura';
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + visibile / 2);
    return t !== null && el.contains(t) ? null : `coperto da ${t?.className.toString() ?? 'nulla'}`;
  });
}

/** Nessun corpo selezionato: si chiude la scheda di Terra dell'avvio. */
async function senzaSelezione(page: Page): Promise<void> {
  await page.locator('.ss-scheda').getByRole('button', { name: 'Chiudi la scheda' }).click();
  await expect(page.locator('.ss-scheda')).toBeHidden();
  await dueFotogrammi(page);
}

test.describe('legenda permanente con poco spazio in altezza (§ 11.3, § 11.5.1)', () => {
  test('pulsanti in riga: la legenda non è coperta dai pulsanti, né sale sotto la barra superiore o la console', async ({ browser }) => {
    let inRiga = 0;
    for (const [w, h] of [
      [1024, 500],
      [900, 500],
      [960, 540],
      [1000, 560],
      [820, 560],
      [700, 500],
    ] as const) {
      const caso = `${w}x${h}`;
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h });
      if ((await page.locator('.ss-app').getAttribute('data-distanze')) === 'riga') inRiga++;
      // Frasi e barra di scala leggibili: nessun pulsante o pannello sopra di esse (R14).
      for (const sel of ['.ss-legenda-frase', '.ss-barra-linea', '.ss-barra-valore', '.ss-barra-didascalia']) {
        expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      }
      const legenda = await rettangoloDi(page, '.ss-legenda');
      expect(legenda.y0, `${caso}: legenda sotto il bordo superiore`).toBeGreaterThanOrEqual(0);
      for (const sel of ['.ss-distanze', '.ss-trova-campo', '.ss-console', '.ss-scheda']) {
        expect(sovrapposti(legenda, await rettangoloDi(page, sel)), `${caso}: legenda e ${sel}`).toBe(false);
      }
      // I pulsanti della mappa restano sotto la barra superiore e non coprono la console.
      const pulsanti = await rettangoloDi(page, '.ss-distanze');
      expect(sovrapposti(pulsanti, await rettangoloDi(page, '.ss-trova-campo')), `${caso}: pulsanti e campo Trova`).toBe(false);
      expect(sovrapposti(pulsanti, await rettangoloDi(page, '.ss-console')), `${caso}: pulsanti e console`).toBe(false);
      // Il menu Viste si apre sotto la riga dei pulsanti con tutte le voci intere e libere, anche sotto gli 820 px.
      await page.locator('.ss-distanze button[aria-label="Viste predefinite"]').click();
      await dueFotogrammi(page);
      expect(await vociMenu(page, '.ss-preset'), `${caso}: voci del menu Viste`).toEqual({ voci: 10, intere: 10, coperte: [] });
      await ctx.close();
    }
    expect(inRiga, 'la prova esercita la modalità in riga').toBeGreaterThanOrEqual(4);
  });
});

test.describe('nota di benvenuto su desktop e tablet (§ 11.3, § 11.12; WCAG 2.2, SC 1.4.4, 1.4.10)', () => {
  test('intera o ridotta a un comando, mai nascosta per lo spazio: non copre legenda, pulsanti, console, Scheda né barra, resta nella finestra e scorre con la sfumatura', async ({ browser }) => {
    const casi = [
      { w: 1024, h: 500 },
      { w: 1024, h: 600 },
      { w: 1280, h: 720 },
      { w: 900, h: 500 },
      { w: 930, h: 500 },
      { w: 939, h: 500 },
      { w: 960, h: 540 },
      { w: 1000, h: 560 },
      { w: 768, h: 1024 },
      { w: 744, h: 1133 },
      { w: 800, h: 600 },
      { w: 819, h: 600 },
      { w: 735, h: 800, forma: 'intera' },
      { w: 730, h: 700, forma: 'intera' },
      { w: 720, h: 800, forma: 'intera' },
      { w: 700, h: 829, forma: 'intera' },
      { w: 700, h: 800 },
      { w: 700, h: 500 },
      { w: 700, h: 520 },
      // Il tablet più stretto (700 px) e la sua altezza minima (480 px); 1400 × 1024 al 200 % = 700 × 512 con scala 2.
      { w: 700, h: 512, scala: 2 },
      { w: 700, h: 960 },
      { w: 700, h: 700 },
      { w: 700, h: 480 },
      // Caratteri di ripiego: console più alta, alla nota ridotta resta poco più di un pulsante.
      { w: 700, h: 480, ripiego: true },
      { w: 700, h: 700, nessuno: true },
      { w: 700, h: 480, nessuno: true },
    ];
    let intere = 0;
    let ridotte = 0;
    for (const c of casi) {
      const caso = `${c.w}x${c.h}${c.scala ? `@${c.scala}` : ''}${c.nessuno ? ' senza selezione' : ''}${c.ripiego ? ' con i caratteri di ripiego' : ''}`;
      const { ctx, page } = await sessione(browser, {
        larghezza: c.w,
        altezza: c.h,
        scala: c.scala ?? 1,
        senzaBenvenuto: false,
        senzaCaratteri: c.ripiego ?? false,
      });
      if (c.nessuno) await senzaSelezione(page);
      await dueFotogrammi(page);
      const nota = page.locator('.ss-benvenuto');
      // Il testo resta disponibile: la nota non si nasconde per mancanza di spazio e la preferenza non cambia.
      await expect(nota, `${caso}: nota visibile`).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('ss.ui.benvenutoChiuso')), caso).toBeNull();
      const messaggi = await rettangoloDi(page, '.ss-messaggi');
      expect(messaggi.x0, `${caso}: a sinistra dello schermo`).toBeGreaterThanOrEqual(0);
      expect(messaggi.x1, `${caso}: a destra dello schermo`).toBeLessThanOrEqual(c.w);
      expect(messaggi.y1, `${caso}: in basso nello schermo`).toBeLessThanOrEqual(c.h);
      const altri = ['.ss-legenda', '.ss-distanze', '.ss-console', '.ss-trova-campo', '.ss-strumenti'];
      if (!c.nessuno) altri.push('.ss-scheda');
      for (const sel of altri) expect(sovrapposti(messaggi, await rettangoloDi(page, sel)), `${caso}: messaggi e ${sel}`).toBe(false);
      expect(await nonCoperto(page, '.ss-benvenuto button[aria-label="Chiudi la nota di benvenuto"]'), `${caso}: pulsante di chiusura`).toBeNull();
      if (!c.nessuno) {
        await intestazioneSchedaLibera(page, caso);
        // Anello del focus da tastiera dei comandi della Scheda intero, anche con la Scheda ridotta all'intestazione
        // (WCAG 2.2, SC 2.4.7).
        const schedaL = page.locator('.ss-scheda');
        await schedaL.getByRole('button', { name: 'Chiudi la scheda' }).focus();
        await page.keyboard.press('Shift+Tab');
        await expect(schedaL.getByRole('button', { name: /^(Espandi|Riduci) la scheda$/ }), caso).toBeFocused();
        expect(await anelloIntero(page, '.ss-scheda'), `${caso}: focus su «Espandi la scheda»`).toBeNull();
        await page.keyboard.press('Tab');
        expect(await anelloIntero(page, '.ss-scheda'), `${caso}: focus su «Chiudi la scheda»`).toBeNull();
        // Accanto alla Scheda almeno 200 px; altrimenti i messaggi stanno nella sua colonna, sopra di essa (tablet stretto).
        if ((await page.locator('.ss-app').getAttribute('data-layout')) === 'tablet') {
          const scheda = await rettangoloDi(page, '.ss-scheda');
          const inColonna = messaggi.x0 >= scheda.x0 - 0.5 && messaggi.x1 <= scheda.x1 + 0.5 && messaggi.y1 <= scheda.y0 + 0.5;
          expect(messaggi.x1 - messaggi.x0 >= 199.5 || inColonna, `${caso}: messaggi larghi ${Math.round(messaggi.x1 - messaggi.x0)} px accanto alla Scheda`).toBe(true);
        }
      }
      if (c.forma !== undefined) await expect(nota, caso).toHaveAttribute('data-forma', c.forma);
      if ((await nota.getAttribute('data-forma')) === 'ridotta') {
        ridotte++;
        // Un comando visibile apre il testo intero in un dialogo; il focus torna al comando.
        const leggi = nota.getByRole('button', { name: 'Leggi la nota di benvenuto' });
        expect(await nonCoperto(page, '.ss-benvenuto-leggi'), `${caso}: comando della nota`).toBeNull();
        // Nota ridotta intera nel contenitore (alta un pulsante), oppure con il bordo sfumato se ne resta fuori una parte.
        const r = await page.locator('.ss-messaggi').evaluate((el) => ({
          fuori: el.querySelector('.ss-benvenuto')!.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom,
          scorri: el.dataset['scorri'] ?? '',
        }));
        if (r.fuori > 0.5) expect(r.scorri, `${caso}: nota ridotta tagliata di ${r.fuori} px senza sfumatura`).toBe('giu');
        // Anello del focus da tastiera dei due pulsanti tutto nella parte visibile dei messaggi (WCAG 2.2, SC 2.4.7).
        await nota.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).focus();
        await page.keyboard.press('Shift+Tab');
        await expect(leggi, caso).toBeFocused();
        expect(await anelloIntero(page, '.ss-messaggi'), `${caso}: focus su «Leggi»`).toBeNull();
        await page.keyboard.press('Tab');
        expect(await anelloIntero(page, '.ss-messaggi'), `${caso}: focus su «Chiudi»`).toBeNull();
        await leggi.click();
        const dialogo = page.getByRole('dialog', { name: 'Benvenuto' });
        await expect(dialogo, caso).toBeVisible();
        for (const f of FRASI_NOTA) await expect(dialogo, caso).toContainText(f);
        await page.keyboard.press('Escape');
        await expect(dialogo, caso).toBeHidden();
        await expect(leggi, `${caso}: focus restituito`).toBeFocused();
      } else {
        intere++;
        for (const f of FRASI_NOTA) await expect(nota, caso).toContainText(f);
        // Almeno 120 px della nota; se non entra tutta scorre, e il bordo con altro testo sfuma (anche al tocco).
        const s = await page.locator('.ss-messaggi').evaluate((el) => ({ alto: el.clientHeight, contenuto: el.scrollHeight, scorri: el.dataset['scorri'] ?? '', maschera: getComputedStyle(el).maskImage }));
        expect(s.alto, `${caso}: altezza della nota`).toBeGreaterThanOrEqual(119.5);
        if (s.contenuto > s.alto) {
          expect(s.scorri, `${caso}: indizio di scorrimento`).toBe('giu');
          expect(s.maschera, `${caso}: sfumatura del bordo`).toContain('gradient');
          await page.locator('.ss-messaggi').evaluate((el) => (el.scrollTop = el.scrollHeight));
          await dueFotogrammi(page);
          const fine = await page.locator('.ss-messaggi').evaluate((el) => {
            const ultimo = el.querySelector('.ss-benvenuto-testo p:last-child')!.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return { visibile: ultimo.bottom <= r.bottom + 0.5 && ultimo.top >= r.top, scorri: el.dataset['scorri'] ?? '' };
          });
          expect(fine, `${caso}: ultima riga raggiungibile scorrendo`).toEqual({ visibile: true, scorri: 'su' });
        } else expect(s.scorri, `${caso}: nessuna sfumatura senza scorrimento`).toBe('');
      }
      await ctx.close();
    }
    expect(intere, 'la prova esercita la nota intera').toBeGreaterThanOrEqual(11);
    expect(ridotte, 'la prova esercita la nota ridotta').toBeGreaterThanOrEqual(6);
  });

  test('la forma segue la finestra senza alternarsi, il focus non cade sul body e il ResizeObserver non lascia notifiche', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 1 });
    await registraErroriFinestra(ctx);
    const page = await ctx.newPage();
    await apri(page);
    const nota = page.locator('.ss-benvenuto');
    await dueFotogrammi(page);
    await expect(nota).toHaveAttribute('data-forma', 'intera');
    await nota.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).focus();
    for (const [w, h, forma] of [
      [700, 700, 'intera'],
      [700, 480, 'ridotta'],
      // Sotto i 700 px il layout è quello del telefono: la nota è sempre intera, nel foglio compatto.
      [699, 480, 'intera'],
      [600, 700, 'intera'],
      [700, 480, 'ridotta'],
      [800, 700, 'intera'],
      [1000, 520, 'intera'],
      [900, 500, 'ridotta'],
      [1000, 520, 'intera'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await dueFotogrammi(page);
      await dueFotogrammi(page);
      await expect(nota, `${w}x${h}`).toBeVisible();
      await expect(nota, `${w}x${h}`).toHaveAttribute('data-forma', forma);
      expect(await page.evaluate(() => document.activeElement !== document.body), `${w}x${h}: focus`).toBe(true);
    }
    // Comando con il focus che sparisce (nota di nuovo intera): il focus resta sulla nota.
    await page.setViewportSize({ width: 700, height: 480 });
    await dueFotogrammi(page);
    await dueFotogrammi(page);
    await nota.getByRole('button', { name: 'Leggi la nota di benvenuto' }).focus();
    await page.setViewportSize({ width: 800, height: 700 });
    await dueFotogrammi(page);
    await dueFotogrammi(page);
    await expect(nota).toHaveAttribute('data-forma', 'intera');
    expect(await page.evaluate(() => document.activeElement?.closest('.ss-benvenuto') !== null), 'focus nella nota').toBe(true);
    // Dialogo aperto dal comando, che sparisce con la nota di nuovo intera: alla chiusura il focus va alla nota senza mai
    // passare per il body (WCAG 2.2, SC 2.4.3), controllato ogni millisecondo dall'inizio della chiusura. Il passaggio
    // durava decine di millisecondi e non a ogni chiusura: più ripetizioni.
    for (let i = 0; i < 3; i++) {
      for (const chiusura of ['Esc', 'Chiudi'] as const) {
        const caso = `dialogo chiuso con ${chiusura} (${i + 1})`;
        await page.setViewportSize({ width: 700, height: 480 });
        await dueFotogrammi(page);
        await dueFotogrammi(page);
        await nota.getByRole('button', { name: 'Leggi la nota di benvenuto' }).click();
        const dialogo = page.getByRole('dialog', { name: 'Benvenuto' });
        await expect(dialogo, caso).toBeVisible();
        await page.setViewportSize({ width: 800, height: 700 });
        await dueFotogrammi(page);
        await dueFotogrammi(page);
        await expect(nota, caso).toHaveAttribute('data-forma', 'intera');
        await page.evaluate(() => {
          const w = window as unknown as { __sulBody: number; __sonda: number };
          w.__sulBody = 0;
          w.__sonda = window.setInterval(() => {
            if (document.activeElement === null || document.activeElement === document.body) w.__sulBody++;
          }, 1);
        });
        if (chiusura === 'Esc') await page.keyboard.press('Escape');
        else await dialogo.getByRole('button', { name: 'Chiudi' }).click();
        await expect(dialogo, caso).toBeHidden();
        await dueFotogrammi(page);
        await page.waitForTimeout(300);
        const sulBody = await page.evaluate(() => {
          const w = window as unknown as { __sulBody: number; __sonda: number };
          window.clearInterval(w.__sonda);
          return w.__sulBody;
        });
        expect(sulBody, `${caso}: controlli con il focus sul body`).toBe(0);
        expect(await page.evaluate(() => document.activeElement?.className ?? ''), caso).toBe('ss-benvenuto');
      }
    }
    expect(await erroriFinestra(page), 'nessun errore nella finestra').toEqual([]);
    await ctx.close();
  });

  test('«Mostra di nuovo la nota di benvenuto» con poco spazio: la nota ridotta compare e riceve il focus', async ({ browser }) => {
    for (const [w, h, scala] of [
      [700, 480, 1],
      [700, 512, 2],
    ] as const) {
      const caso = `${w}x${h}`;
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, scala });
      const nota = page.locator('.ss-benvenuto');
      await expect(nota, caso).toBeHidden();
      await page.getByRole('button', { name: 'Impostazioni' }).click();
      await page.getByRole('button', { name: 'Mostra di nuovo la nota di benvenuto' }).click();
      await expect(page.getByRole('dialog', { name: 'Impostazioni' }), caso).toBeHidden();
      await expect(nota, caso).toBeVisible();
      await expect(nota, caso).toHaveAttribute('data-forma', 'ridotta');
      expect(await page.evaluate(() => document.activeElement?.closest('.ss-benvenuto') !== null), `${caso}: focus sulla nota`).toBe(true);
      await ctx.close();
    }
  });
});

test.describe('menu Viste sotto gli 820 px (§ 11.3, § 11.10; WCAG 2.2, SC 2.1.1, 2.4.11)', () => {
  // Sotto i 700 px il layout è quello del telefono: le viste sono nel Menu (prova «popover della barra e menu del telefono»).
  const CASI = [
    { w: 700, h: 480 },
    { w: 700, h: 512, scala: 2 },
    { w: 700, h: 520 },
    { w: 700, h: 500 },
    { w: 700, h: 700 },
    { w: 700, h: 960 },
    { w: 700, h: 829 },
    { w: 744, h: 1133 },
    { w: 768, h: 1024 },
    { w: 800, h: 600 },
    { w: 819, h: 600 },
    { w: 700, h: 480, tocco: true },
    { w: 700, h: 700, tocco: true },
    { w: 700, h: 829, tocco: true },
    { w: 800, h: 600, tocco: true },
  ];
  test('tutte le voci intere nella finestra e libere, anche con la nota; attivabili con mouse, tocco e tastiera; Tab oltre l’ultima chiude il menu', async ({ browser }) => {
    for (const c of CASI) {
      const caso = `${c.w}x${c.h}${c.scala ? `@${c.scala}` : ''}${c.tocco ? ' tocco' : ''}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false, senzaBenvenuto: false });
      await dueFotogrammi(page);
      const pulsante = page.locator('.ss-distanze button[aria-label="Viste predefinite"]');
      const voci = page.locator('.ss-preset .ss-preset-voce');
      // Puntatore: tutte le voci intere e libere senza scorrere; l'ultima si attiva e il menu si chiude con l'annuncio.
      if (c.tocco) await pulsante.tap();
      else await pulsante.click();
      await dueFotogrammi(page);
      expect(await vociMenu(page, '.ss-preset'), `${caso}: voci`).toEqual({ voci: 10, intere: 10, coperte: [] });
      await registraAnnunci(page);
      if (c.tocco) await voci.last().tap();
      else await voci.last().click();
      await expect(pulsante, caso).toHaveAttribute('aria-expanded', 'false');
      await expect.poll(() => annunci(page), { message: caso }).toContain('Vista: Oggetti interstellari');
      // Tastiera: ogni voce con il focus visibile e libera; Tab oltre l'ultima chiude il menu e il focus resta visibile.
      await pulsante.focus();
      await page.keyboard.press('Enter');
      await expect(pulsante, caso).toHaveAttribute('aria-expanded', 'true');
      await dueFotogrammi(page);
      expect(await page.locator('.ss-preset').evaluate((el) => el.scrollTop), `${caso}: riapertura dalla prima voce`).toBe(0);
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        await expect(voci.nth(i), `${caso}: voce ${i}`).toBeFocused();
        expect(await fuocoVisibile(page), `${caso}: voce ${i}`).toBeNull();
      }
      await page.keyboard.press('Tab');
      await expect(pulsante, `${caso}: Tab oltre l'ultima voce`).toHaveAttribute('aria-expanded', 'false');
      expect(await fuocoVisibile(page), `${caso}: controllo dopo il menu`).toBeNull();
      // Invio su una voce: vista scelta, menu chiuso, focus al pulsante.
      await pulsante.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(pulsante, caso).toHaveAttribute('aria-expanded', 'false');
      await expect(pulsante, caso).toBeFocused();
      await ctx.close();
    }
  });

  test('due colonne: con il puntatore sulla voce sottostante l’anello del focus resta intero (WCAG 2.2, SC 2.4.7)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 700, altezza: 480 });
    const pulsante = page.locator('.ss-distanze button[aria-label="Viste predefinite"]');
    await pulsante.focus();
    await page.keyboard.press('Enter');
    await dueFotogrammi(page);
    await expect(page.locator('.ss-preset')).toHaveAttribute('data-colonne', '2');
    const voci = page.locator('.ss-preset .ss-preset-voce');
    // Colore dell'anello (--fuoco, src/ui/tokens.css).
    const FUOCO = [0xd7, 0xf7, 0x5b];
    let casi = 0;
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      await expect(voci.nth(i)).toBeFocused();
      const r = (await voci.nth(i).boundingBox())!;
      const sotto = (await voci.nth(i + 1).boundingBox())!;
      // Solo la voce subito sotto, nella stessa colonna.
      if (Math.abs(sotto.x - r.x) > 0.5 || sotto.y < r.y) continue;
      casi++;
      await page.mouse.move(sotto.x + sotto.width / 2, sotto.y + sotto.height / 2);
      await dueFotogrammi(page);
      // Lato inferiore dell'anello (2 px, a 2 px dal bordo della voce), lontano dagli angoli arrotondati: in ogni colonna
      // di pixel almeno un pixel ha il colore dell'anello.
      const y0 = Math.floor(r.y + r.height);
      const png = decodificaPng(await page.screenshot({ clip: { x: Math.round(r.x + 10), y: y0, width: Math.round(r.width - 20), height: 6 } }));
      let colonne = 0;
      for (let x = 0; x < png.w; x++) {
        for (let y = 0; y < png.h; y++) {
          const k = (y * png.w + x) * png.canali;
          if (Math.hypot(png.dati[k]! - FUOCO[0]!, png.dati[k + 1]! - FUOCO[1]!, png.dati[k + 2]! - FUOCO[2]!) < 40) {
            colonne++;
            break;
          }
        }
      }
      expect(colonne / png.w, `voce ${i}: lato inferiore dell'anello visibile in ${colonne} colonne su ${png.w}`).toBeGreaterThanOrEqual(0.95);
    }
    expect(casi, 'voci con una voce sotto nella stessa colonna').toBe(8);
    await ctx.close();
  });
});

test.describe('popover della barra e menu del telefono sopra i messaggi (§ 11.3)', () => {
  test('Trova, Livelli e Menu aperti non sono coperti dalla nota; le viste del Menu restano visibili da tastiera, con l’anello del focus intero', async ({ browser }) => {
    const casi = [
      { w: 768, h: 1024 },
      { w: 1024, h: 500 },
      { w: 1280, h: 1024 },
      { w: 320, h: 568, tocco: true },
      { w: 320, h: 480, tocco: true },
      { w: 683, h: 384, scala: 2 },
      { w: 683, h: 384, scala: 2, tocco: true },
      // Telefono fino a 699 px: le viste predefinite sono nel Menu, come a 320 px.
      { w: 600, h: 480, telefono: true },
      { w: 640, h: 512, scala: 2, telefono: true },
      { w: 650, h: 520, telefono: true },
      { w: 699, h: 480, tocco: true, telefono: true },
      { w: 600, h: 700, tocco: true, telefono: true },
      { w: 690, h: 829, tocco: true, telefono: true },
      { w: 699, h: 700, telefono: true },
    ];
    for (const c of casi) {
      const caso = `${c.w}x${c.h}${c.scala ? `@${c.scala}` : ''}${c.tocco ? ' tocco' : ''}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false, senzaBenvenuto: false });
      await dueFotogrammi(page);
      await expect(page.locator('.ss-benvenuto'), caso).toBeVisible();
      if ('telefono' in c) await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', 'telefono');
      const telefono = (await page.locator('.ss-app').getAttribute('data-layout')) !== 'desktop' && (await page.locator('.ss-app').getAttribute('data-layout')) !== 'tablet';
      // Risultati di Trova.
      await page.getByRole('combobox', { name: 'Trova' }).fill('a');
      await expect(page.locator('.ss-trova-lista'), caso).toBeVisible();
      expect(await puntiCoperti(page, '.ss-trova-lista'), `${caso}: risultati di Trova`).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByRole('combobox', { name: 'Trova' }).fill('');
      if (!telefono) {
        await page.getByRole('button', { name: 'Livelli' }).click();
        expect(await puntiCoperti(page, '.ss-livelli'), `${caso}: Livelli`).toEqual([]);
        await page.keyboard.press('Escape');
      } else {
        const menu = page.getByRole('button', { name: 'Menu' });
        await menu.click();
        expect(await puntiCoperti(page, '.ss-menu'), `${caso}: Menu`).toEqual([]);
        // Tastiera: ogni vista con il focus intera nel menu e libera.
        await page.keyboard.press('Escape');
        await menu.focus();
        await page.keyboard.press('Enter');
        const voci = page.locator('.ss-menu .ss-preset-voce');
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          await expect(voci.nth(i), `${caso}: vista ${i}`).toBeFocused();
          expect(await fuocoVisibile(page), `${caso}: vista ${i}`).toBeNull();
          const intera = await voci.nth(i).evaluate((el) => {
            const r = el.getBoundingClientRect();
            const m = el.closest('.ss-menu')!.getBoundingClientRect();
            return r.top >= m.top - 0.5 && r.bottom <= m.bottom + 0.5;
          });
          expect(intera, `${caso}: vista ${i} intera nel menu`).toBe(true);
          // Il menu scorre: la voce portata al bordo con Tab non ha l'anello tagliato (WCAG 2.2, SC 2.4.7).
          expect(await anelloIntero(page, '.ss-menu'), `${caso}: anello della vista ${i}`).toBeNull();
        }
        // Tabella, Fonti e metodi, Impostazioni; oltre l'ultima voce del menu il focus esce e il menu si chiude; riaperto,
        // riparte dall'inizio.
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Tab');
          expect(await anelloIntero(page, '.ss-menu'), `${caso}: anello della voce ${i} dopo le viste`).toBeNull();
        }
        await page.keyboard.press('Tab');
        await expect(menu, `${caso}: Tab oltre l'ultima voce`).toHaveAttribute('aria-expanded', 'false');
        await menu.click();
        expect(await page.locator('.ss-menu').evaluate((el) => el.scrollTop), `${caso}: riapertura dall'inizio`).toBe(0);
      }
      await ctx.close();
    }
  });
});

/**
 * Sfumature dei messaggi (px) in cima e in fondo, dalle tappe del gradiente della maschera calcolata, e contenuto nascosto
 * oltre i due bordi; `righe`: opacità della maschera al centro di ogni riga del testo della nota intera nella parte
 * visibile.
 */
function sfumatureMessaggi(page: Page): Promise<{ alto: number; su: number; giu: number; oltreSu: number; oltreGiu: number; righe: number[] }> {
  return page.locator('.ss-messaggi').evaluate((m) => {
    const c = m.getBoundingClientRect();
    const alto = c.height;
    /** Argomenti di primo livello di una funzione CSS. */
    const argomenti = (t: string): string[] => {
      const out: string[] = [];
      let d = 0;
      let parte = '';
      for (const ch of t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'))) {
        if (ch === '(') d++;
        else if (ch === ')') d--;
        if (ch === ',' && d === 0) {
          out.push(parte.trim());
          parte = '';
        } else parte += ch;
      }
      out.push(parte.trim());
      return out;
    };
    /** Posizione (px dall'inizio del gradiente) della tappa dopo il colore, risolta su un elemento alto quanto i messaggi. */
    const posizione = (tappa: string): number => {
      const resto = tappa.slice(tappa.indexOf(')') + 1).trim();
      const prova = document.createElement('div');
      prova.style.cssText = `position: absolute; visibility: hidden; width: 1px; height: ${alto}px`;
      const figlio = document.createElement('div');
      figlio.style.height = resto;
      prova.appendChild(figlio);
      document.body.appendChild(prova);
      const px = figlio.getBoundingClientRect().height;
      prova.remove();
      return px;
    };
    let su = 0;
    let giu = 0;
    const maschera = getComputedStyle(m).maskImage;
    if (maschera.startsWith('linear-gradient')) {
      const a = argomenti(maschera);
      const versoAlto = a[0] === 'to top' || a[0] === '0deg';
      const tappe = a.filter((t) => t.startsWith('rgb'));
      if (tappe.length === 4) {
        su = posizione(tappe[1]!);
        giu = alto - posizione(tappe[2]!);
      } else if (versoAlto) su = alto - posizione(tappe[0]!);
      else giu = alto - posizione(tappe[0]!);
    }
    const righe: number[] = [];
    for (const p of m.querySelectorAll('.ss-benvenuto-testo p')) {
      const r = document.createRange();
      r.selectNodeContents(p);
      for (const q of r.getClientRects()) {
        if (q.top < c.top - 0.5 || q.bottom > c.bottom + 0.5) continue;
        const y = (q.top + q.bottom) / 2 - c.top;
        righe.push(Math.min(su > 0 ? y / su : 1, giu > 0 ? (alto - y) / giu : 1, 1));
      }
    }
    return { alto, su, giu, oltreSu: m.scrollTop, oltreGiu: m.scrollHeight - m.clientHeight - m.scrollTop, righe };
  });
}

test.describe('sfumatura dei messaggi che scorrono (§ 11.3)', () => {
  test('mai più alta del contenuto nascosto oltre il bordo: con pochi pixel in più il testo visibile resta leggibile', async ({ browser }) => {
    for (const c of [
      { w: 320, h: 568, tocco: true },
      { w: 320, h: 480, tocco: true },
      { w: 1024, h: 600 },
    ]) {
      const caso = `${c.w}x${c.h}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, tocco: c.tocco ?? false, senzaBenvenuto: false });
      await dueFotogrammi(page);
      await expect(page.locator('.ss-benvenuto'), caso).toBeVisible();
      const corsa = await page.locator('.ss-messaggi').evaluate((m) => m.scrollHeight - m.clientHeight);
      for (const scorri of [0, 4, corsa]) {
        await page.locator('.ss-messaggi').evaluate((m, v) => (m.scrollTop = v), scorri);
        await dueFotogrammi(page);
        const s = await sfumatureMessaggi(page);
        const fase = `${caso}, scorrimento ${scorri} su ${corsa}`;
        // Mai più alta del contenuto nascosto; presente, fino a 40 px (o al 30 % dell'altezza), se ce n'è.
        expect(s.su, `${fase}: sfumatura in cima`).toBeLessThanOrEqual(s.oltreSu + 0.5);
        expect(s.giu, `${fase}: sfumatura in fondo`).toBeLessThanOrEqual(s.oltreGiu + 0.5);
        if (s.oltreSu > 1) expect(s.su, `${fase}: indizio in cima`).toBeGreaterThanOrEqual(Math.min(40, 0.3 * s.alto, s.oltreSu) - 0.5);
        if (s.oltreGiu >= 1) expect(s.giu, `${fase}: indizio in fondo`).toBeGreaterThanOrEqual(Math.min(40, 0.3 * s.alto, s.oltreGiu) - 0.5);
        // Con meno di una riga nascosta (320 × 568: il solo margine interno della nota) le righe intere sono leggibili.
        if (corsa > 0 && corsa < 12) {
          expect(s.righe.length, fase).toBeGreaterThan(0);
          expect(Math.min(...s.righe), `${fase}: opacità minima delle righe intere`).toBeGreaterThanOrEqual(0.95);
        }
      }
      await ctx.close();
    }
  });
});

/** Le 10 viste predefinite in ordine, dal menu Viste (dal Menu sul telefono), ciascuna fino alla fine della transizione. */
async function attivaLeViste(page: Page): Promise<void> {
  const telefono = (await page.locator('.ss-app').getAttribute('data-layout')) === 'telefono';
  for (let i = 0; i < 10; i++) {
    if (telefono) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.locator('.ss-menu .ss-preset-voce').nth(i).click();
    } else {
      await page.locator('.ss-distanze button[aria-label="Viste predefinite"]').click();
      await page.locator('.ss-preset .ss-preset-voce').nth(i).click();
    }
    await attendiQuiete(page);
    await dueFotogrammi(page);
  }
}

/** Pannelli che i messaggi non coprono (§ 11.3). */
const PANNELLI_SOTTO_I_MESSAGGI = ['.ss-legenda', '.ss-console', '.ss-foglio', '.ss-scheda'];

/**
 * Geometria di ogni fotogramma disegnato: a ogni requestAnimationFrame un messaggio (MessageChannel), ricevuto dopo il
 * disegno, confronta il contenitore dei messaggi, con la nota visibile, con legenda, console, foglio e Scheda visibili e
 * registra le sovrapposizioni oltre 0,5 px. Un evento del puntatore o della tastiera tra il fotogramma e la misura cambia il
 * DOM dopo il disegno: quel fotogramma non si misura. `fineFotogrammi` ferma il campionamento e restituisce l'esito.
 */
async function campionaFotogrammi(page: Page): Promise<void> {
  await page.evaluate((pannelli) => {
    const w = window as unknown as { __campioni: { misurati: number; sovrapposti: string[]; attivo: boolean } };
    const c = { misurati: 0, sovrapposti: [] as string[], attivo: true };
    w.__campioni = c;
    let evento = false;
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup']) {
      window.addEventListener(t, () => (evento = true), true);
    }
    const visibile = (el: Element | null): DOMRect | null => {
      if (el === null || el.closest('[hidden]') !== null) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const canale = new MessageChannel();
    let fotogramma = 0;
    canale.port1.onmessage = () => {
      if (evento) return;
      const m = visibile(document.querySelector('.ss-messaggi'));
      if (m === null || visibile(document.querySelector('.ss-benvenuto')) === null) return;
      c.misurati++;
      for (const sel of pannelli) {
        const p = visibile(document.querySelector(sel));
        if (p === null) continue;
        const x = Math.min(m.right, p.right) - Math.max(m.left, p.left);
        const y = Math.min(m.bottom, p.bottom) - Math.max(m.top, p.top);
        if (x > 0.5 && y > 0.5) c.sovrapposti.push(`fotogramma ${fotogramma}: ${sel} ${y.toFixed(1)} px`);
      }
    };
    const passo = () => {
      if (!c.attivo) return;
      fotogramma++;
      evento = false;
      requestAnimationFrame(passo);
      canale.port2.postMessage(null);
    };
    requestAnimationFrame(passo);
  }, PANNELLI_SOTTO_I_MESSAGGI);
}

function fineFotogrammi(page: Page): Promise<{ misurati: number; sovrapposti: string[] }> {
  return page.evaluate(() => {
    const c = (window as unknown as { __campioni: { misurati: number; sovrapposti: string[]; attivo: boolean } }).__campioni;
    c.attivo = false;
    return { misurati: c.misurati, sovrapposti: c.sovrapposti };
  });
}

test.describe('viste predefinite e ResizeObserver (§ 11.3)', () => {
  test('attivate con la nota: in nessun fotogramma i messaggi coprono legenda, console, foglio o Scheda', async ({ browser }) => {
    for (const c of [
      { w: 1024, h: 520 },
      { w: 320, h: 480, tocco: true },
      { w: 320, h: 568, tocco: true },
    ]) {
      const caso = `${c.w}x${c.h}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, tocco: c.tocco ?? false, senzaBenvenuto: false });
      await campionaFotogrammi(page);
      await attivaLeViste(page);
      const esito = await fineFotogrammi(page);
      // Durante le transizioni la barra di scala cambia l'altezza della legenda (a 1024 × 520 da 60,5 a 81,4 px).
      expect(esito.misurati, `${caso}: fotogrammi misurati con la nota`).toBeGreaterThan(50);
      expect(esito.sovrapposti, `${caso}: messaggi sopra altri pannelli`).toEqual([]);
      await ctx.close();
    }
  });

  test('attivate senza ridimensionare la finestra e passaggi tra 1024 × 490-600 e 1000 × 560, con la nota: nessuna notifica del ResizeObserver lasciata', async ({ browser }) => {
    for (const c of [
      { w: 1024, h: 520 },
      { w: 320, h: 480, tocco: true },
      { w: 320, h: 568, tocco: true },
    ]) {
      const caso = `${c.w}x${c.h}`;
      const { ctx, page } = await sessione(browser, {
        larghezza: c.w,
        altezza: c.h,
        tocco: c.tocco ?? false,
        senzaBenvenuto: false,
        erroriFinestra: true,
      });
      const telefono = (await page.locator('.ss-app').getAttribute('data-layout')) === 'telefono';
      await attivaLeViste(page);
      expect(await erroriFinestra(page), `${caso}: errori nella finestra`).toEqual([]);
      // Finestra ridimensionata: la forma della nota e la colonna delle distanze cambiano tra questi passaggi.
      if (!telefono) {
        for (const [w, h] of [
          [1024, 490],
          [1024, 520],
          [1024, 500],
          [1024, 600],
          [1000, 560],
          [1024, 520],
          [1000, 560],
          [1024, 520],
        ] as const) {
          await page.setViewportSize({ width: w, height: h });
          await dueFotogrammi(page);
          await dueFotogrammi(page);
        }
        expect(await erroriFinestra(page), `${caso}: errori nella finestra dopo i ridimensionamenti`).toEqual([]);
      }
      await ctx.close();
    }
  });
});

test.describe('messaggi di caricamento ed errore su desktop e tablet (§ 11.3, § 11.11)', () => {
  /** 7/10/975 a.C., blocco 9 (993 a.C.-9 d.C.): la console ha anche la riga dell'incertezza dell'ora. */
  const JD_BLOCCO_9 = 1_365_583.5;

  test('caricamento in cima ai messaggi, anche con la nota; la Scheda conserva nome e comandi e non sale sulla console', async ({ browser }) => {
    const casi = [
      { w: 700, h: 480, nota: false },
      { w: 700, h: 480, nota: true },
      { w: 700, h: 512, scala: 2, nota: false },
      { w: 700, h: 512, scala: 2, nota: true },
      { w: 700, h: 520, nota: true },
      { w: 700, h: 500, nota: false },
      { w: 700, h: 500, nota: true },
      { w: 900, h: 500, nota: true },
      { w: 700, h: 700, nota: false, nessuno: true },
      { w: 800, h: 600, nota: true },
      { w: 1024, h: 600, nota: true },
    ];
    for (const c of casi) {
      const caso = `${c.w}x${c.h}${c.scala ? `@${c.scala}` : ''}${c.nota ? ' con la nota' : ''}${c.nessuno ? ' senza selezione' : ''}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, senzaBenvenuto: !c.nota });
      if (c.nessuno) await senzaSelezione(page);
      await page.route(/\/data\/v1\/.*\/b\d+\.bin$/, async (r) => {
        await new Promise((f) => setTimeout(f, 8_000));
        await r.continue();
      });
      await page.evaluate((jd) => void window.__ssTest!.setTime(jd), JD_BLOCCO_9);
      await expect(page.locator('.ss-caricamento'), caso).toBeVisible();
      await dueFotogrammi(page);
      await dueFotogrammi(page);
      expect(await inCimaAiMessaggi(page, '.ss-caricamento'), `${caso}: messaggio di caricamento`).toBeNull();
      if (!c.nessuno) {
        expect(sovrapposti(await rettangoloDi(page, '.ss-messaggi'), await rettangoloDi(page, '.ss-scheda')), `${caso}: messaggi e Scheda`).toBe(false);
        await intestazioneSchedaLibera(page, caso);
      }
      await ctx.close();
    }
  });

  test('errore persistente: in cima ai messaggi con «Riprova» raggiungibile; la Scheda conserva nome e comandi e non sale sulla console', async ({ browser }) => {
    const casi = [
      { w: 700, h: 480, nota: false },
      { w: 700, h: 480, nota: true },
      { w: 700, h: 512, scala: 2, nota: true },
      { w: 700, h: 500, nota: false },
      { w: 900, h: 500, nota: true },
    ];
    for (const c of casi) {
      const caso = `${c.w}x${c.h}${c.scala ? `@${c.scala}` : ''}${c.nota ? ' con la nota' : ''}`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, senzaBenvenuto: !c.nota });
      await page.route(/\/data\/v1\/(planets|sats|small)\/[psb]09\.bin$/, (r) => r.fulfill({ status: 404, body: '' }));
      await page.evaluate((jd) => void window.__ssTest!.setTime(jd), JD_BLOCCO_9);
      const errore = page.locator('.ss-avvisi-elenco .ss-avviso--errore').first();
      await expect(errore, caso).toContainText('Impossibile caricare i dati per il periodo 993 a.C.-9 d.C.', { timeout: 60_000 });
      await dueFotogrammi(page);
      await dueFotogrammi(page);
      expect(await inCimaAiMessaggi(page, '.ss-avvisi-elenco .ss-avviso--errore'), `${caso}: errore`).toBeNull();
      expect(sovrapposti(await rettangoloDi(page, '.ss-messaggi'), await rettangoloDi(page, '.ss-scheda')), `${caso}: messaggi e Scheda`).toBe(false);
      await intestazioneSchedaLibera(page, caso);
      // «Riprova» con il focus scorre nella parte visibile dei messaggi, fuori dalla sfumatura, e non è coperto.
      await errore.getByRole('button', { name: 'Riprova' }).focus();
      await dueFotogrammi(page);
      expect(await fuocoVisibile(page), `${caso}: Riprova`).toBeNull();
      await ctx.close();
    }
  });
});

test.describe('Catalogo con poco spazio in altezza (§ 11.3, § 11.6)', () => {
  test('alto almeno 160 px, o fino alla console se lo spazio è minore: titolo, chiusura e filtri dentro il pannello, voci raggiungibili', async ({ browser }) => {
    for (const [w, h, scala] of [
      [700, 480, 1],
      [700, 700, 1],
      [700, 512, 2],
      [700, 520, 1],
      [700, 500, 1],
      [900, 500, 1],
    ] as const) {
      const caso = `${w}x${h}${scala > 1 ? `@${scala}` : ''}`;
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h, scala });
      await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
      await expect(page.locator('.ss-catalogo'), caso).toBeVisible();
      await dueFotogrammi(page);
      const cat = await rettangoloDi(page, '.ss-catalogo');
      const cons = await rettangoloDi(page, '.ss-console');
      expect(cat.y1, `${caso}: Catalogo sopra la console`).toBeLessThanOrEqual(cons.y0);
      expect(cat.y1 - cat.y0, `${caso}: altezza del Catalogo`).toBeGreaterThanOrEqual(Math.min(160, cons.y0 - 24 - cat.y0) - 1);
      for (const sel of ['.ss-catalogo .ss-pannello-titolo', '.ss-catalogo .ss-pannello-testa button', '.ss-catalogo .ss-filtri-titolo']) {
        const r = await rettangoloDi(page, sel);
        expect(r.y0 >= cat.y0 && r.y1 <= cat.y1, `${caso}: ${sel} dentro il Catalogo`).toBe(true);
        expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      }
      await page.locator('.ss-catalogo .ss-catalogo-voce').first().focus();
      expect(await fuocoVisibile(page), `${caso}: prima voce con il focus`).toBeNull();
      await ctx.close();
    }
  });
});

test.describe('nota con le barre di scorrimento classiche (§ 11.3)', () => {
  test('a 700 × 480 senza selezione la nota non si alterna ai passi della data; in orizzontale la chiusura non lascia notifiche del ResizeObserver', async () => {
    // Chromium senza --hide-scrollbars: barre di scorrimento di 15 px, che cambiano la larghezza utile dei messaggi.
    const classico = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'], args: SWIFTSHADER });
    const baseURL = test.info().project.use.baseURL;
    for (const [w, h, nessuno] of [
      [700, 480, true],
      [844, 390, false],
    ] as const) {
      const caso = `${w}x${h}`;
      const ctx = await classico.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, baseURL });
      await registraErroriFinestra(ctx);
      const page = await ctx.newPage();
      await apri(page);
      if (nessuno) await senzaSelezione(page);
      const forme: string[] = [];
      for (let i = 0; i < 4; i++) {
        await page.getByRole('button', { name: 'Avanti di un giorno' }).click();
        await dueFotogrammi(page);
        await dueFotogrammi(page);
        forme.push(await page.locator('.ss-benvenuto').evaluate((el: HTMLElement) => (el.hidden ? 'nascosta' : (el.dataset['forma'] ?? 'visibile'))));
      }
      expect(new Set(forme).size, `${caso}: forme ${forme.join(', ')}`).toBe(1);
      expect(forme[0], caso).not.toBe('nascosta');
      await page.getByRole('button', { name: 'Chiudi la nota di benvenuto' }).click();
      await dueFotogrammi(page);
      await dueFotogrammi(page);
      expect(await erroriFinestra(page), `${caso}: errori nella finestra`).toEqual([]);
      await ctx.close();
    }
    await classico.close();
  });
});

test.describe('telefono fino a 699 px (§ 11.3, § 11.5.1, § 11.6, § 11.11, § 11.12; WCAG 2.2, SC 1.4.4 e 1.4.10)', () => {
  /**
   * Finestre che prima dei 700 px di soglia avevano il layout del tablet: tablet Fire e Android da 7-8 pollici in verticale,
   * pieghevole aperto (Galaxy Z Fold 5, 690 × 829), finestre a metà schermo su 1280-1366 px, zoom al 200 % su 1280 × 1024
   * (640 × 512 con scala 2).
   */
  const CASI = [
    { w: 600, h: 480 },
    { w: 640, h: 512, scala: 2 },
    { w: 650, h: 520 },
    { w: 600, h: 700 },
    { w: 600, h: 960 },
    { w: 690, h: 829, tocco: true },
    { w: 699, h: 480, tocco: true },
    { w: 699, h: 700 },
  ];
  const nomeCaso = (c: { w: number; h: number; scala?: number; tocco?: boolean }) => `${c.w}x${c.h}${c.scala ? `@${c.scala}` : ''}${c.tocco ? ' tocco' : ''}`;
  /** Finestre più basse e più strette, dove i messaggi e il foglio hanno meno spazio. */
  const CASI_MESSAGGI = [
    { w: 600, h: 480 },
    { w: 640, h: 512, scala: 2 },
    { w: 699, h: 480, tocco: true },
    { w: 690, h: 829, tocco: true },
  ];
  /** 7/10/975 a.C., blocco 9 (993 a.C.-9 d.C.). */
  const JD_BLOCCO_9 = 1_365_583.5;

  test('legenda larga e libera, sotto la barra, mai sopra i pulsanti della mappa, il campo Trova, il foglio o «Apri la scheda»; Livelli intero', async ({ browser }) => {
    for (const c of CASI) {
      const caso = nomeCaso(c);
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false, senzaBenvenuto: false });
      await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', 'telefono');
      await dueFotogrammi(page);
      for (const sel of ['.ss-legenda-frase', '.ss-barra-linea', '.ss-barra-valore']) expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      const legenda = await rettangoloDi(page, '.ss-legenda');
      // Larga quanto il suo testo (non 80 px, con il testo su molte righe) e dentro i margini.
      expect(legenda.x1 - legenda.x0, `${caso}: larghezza della legenda`).toBeGreaterThanOrEqual(300);
      expect(legenda.y1 - legenda.y0, `${caso}: altezza della legenda`).toBeLessThanOrEqual(80);
      expect(legenda.x1, `${caso}: legenda dentro il margine destro`).toBeLessThanOrEqual(c.w - 16 + 0.5);
      expect(legenda.y0, `${caso}: legenda sotto la barra superiore`).toBeGreaterThanOrEqual((await rettangoloDi(page, '.ss-barra')).y1);
      for (const sel of ['.ss-trova-campo', '.ss-strumenti', '.ss-foglio', '.ss-chip-scheda', '.ss-zoom-mobile']) {
        expect(sovrapposti(legenda, await rettangoloDi(page, sel)), `${caso}: legenda e ${sel}`).toBe(false);
      }
      const zoom = await rettangoloDi(page, '.ss-zoom-mobile');
      for (const sel of ['.ss-foglio', '.ss-chip-scheda', '.ss-trova-campo']) expect(sovrapposti(zoom, await rettangoloDi(page, sel)), `${caso}: pulsanti della mappa e ${sel}`).toBe(false);
      const n = await page.locator('.ss-zoom-mobile .ss-pulsante').count();
      for (let i = 0; i < n; i++) expect(await nonCoperto(page, `.ss-zoom-mobile .ss-pulsante >> nth=${i}`), `${caso}: pulsante ${i}`).toBeNull();
      // Livelli: il pannello ha l'altezza concessa dalla finestra (non 92 px) e nessun pannello lo copre.
      await page.getByRole('button', { name: 'Livelli' }).click();
      const livelli = await rettangoloDi(page, '.ss-livelli');
      const naturale = await page.locator('.ss-livelli').evaluate((el) => el.scrollHeight);
      expect(livelli.y1 - livelli.y0, `${caso}: altezza di Livelli`).toBeGreaterThanOrEqual(Math.min(naturale, c.h - 16 - 60 - 16) - 1);
      expect(await puntiCoperti(page, '.ss-livelli'), `${caso}: Livelli coperto`).toEqual([]);
      await ctx.close();
    }
  });

  test('«Mostra di nuovo la nota di benvenuto» dal Menu: la nota compare intera nel foglio compatto e riceve il focus', async ({ browser }) => {
    for (const c of CASI.filter((x) => x.h <= 700)) {
      const caso = nomeCaso(c);
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false });
      await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', 'telefono');
      const nota = page.locator('.ss-benvenuto');
      await expect(nota, caso).toBeHidden();
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('button', { name: 'Impostazioni' }).click();
      await page.getByRole('button', { name: 'Mostra di nuovo la nota di benvenuto' }).click();
      await expect(page.getByRole('dialog', { name: 'Impostazioni' }), caso).toBeHidden();
      await expect(nota, caso).toBeVisible();
      await expect(nota, caso).toHaveAttribute('data-forma', 'intera');
      expect(await page.evaluate(() => document.activeElement?.closest('.ss-benvenuto') !== null), `${caso}: focus sulla nota`).toBe(true);
      await dueFotogrammi(page);
      for (const f of FRASI_NOTA) await expect(nota, caso).toContainText(f);
      expect(await nonCoperto(page, '.ss-benvenuto button[aria-label="Chiudi la nota di benvenuto"]'), `${caso}: pulsante di chiusura`).toBeNull();
      for (const sel of ['.ss-legenda', '.ss-foglio', '.ss-zoom-mobile', '.ss-chip-scheda', '.ss-barra']) {
        expect(sovrapposti(await rettangoloDi(page, '.ss-messaggi'), await rettangoloDi(page, sel)), `${caso}: messaggi e ${sel}`).toBe(false);
      }
      await ctx.close();
    }
  });

  test('caricamento: in cima ai messaggi, sotto la legenda e sopra il foglio, con la nota e senza', async ({ browser }) => {
    for (const c of CASI_MESSAGGI) {
      for (const nota of [false, true]) {
        const caso = `${nomeCaso(c)}${nota ? ' con la nota' : ''}`;
        const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false, senzaBenvenuto: !nota });
        await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', 'telefono');
        await page.route(/\/data\/v1\/.*\/b\d+\.bin$/, async (r) => {
          await new Promise((f) => setTimeout(f, 8_000));
          await r.continue();
        });
        await page.evaluate((jd) => void window.__ssTest!.setTime(jd), JD_BLOCCO_9);
        await expect(page.locator('.ss-caricamento'), caso).toBeVisible();
        await dueFotogrammi(page);
        await dueFotogrammi(page);
        expect(await inCimaAiMessaggi(page, '.ss-caricamento'), `${caso}: messaggio di caricamento`).toBeNull();
        for (const sel of ['.ss-legenda', '.ss-foglio', '.ss-zoom-mobile', '.ss-chip-scheda', '.ss-barra']) {
          expect(sovrapposti(await rettangoloDi(page, '.ss-messaggi'), await rettangoloDi(page, sel)), `${caso}: messaggi e ${sel}`).toBe(false);
        }
        expect(await nonCoperto(page, '.ss-legenda-frase'), `${caso}: legenda`).toBeNull();
        await ctx.close();
      }
    }
  });

  test('errore persistente: in cima ai messaggi con «Riprova» raggiungibile, sopra il foglio e senza coprire legenda e pulsanti', async ({ browser }) => {
    for (const c of CASI_MESSAGGI) {
      const caso = `${nomeCaso(c)} con la nota`;
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false, senzaBenvenuto: false });
      await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-layout', 'telefono');
      await page.route(/\/data\/v1\/(planets|sats|small)\/[psb]09\.bin$/, (r) => r.fulfill({ status: 404, body: '' }));
      await page.evaluate((jd) => void window.__ssTest!.setTime(jd), JD_BLOCCO_9);
      const errore = page.locator('.ss-avvisi-elenco .ss-avviso--errore').first();
      await expect(errore, caso).toContainText('Impossibile caricare i dati per il periodo 993 a.C.-9 d.C.', { timeout: 60_000 });
      await dueFotogrammi(page);
      await dueFotogrammi(page);
      expect(await inCimaAiMessaggi(page, '.ss-avvisi-elenco .ss-avviso--errore'), `${caso}: errore`).toBeNull();
      for (const sel of ['.ss-legenda', '.ss-foglio', '.ss-zoom-mobile', '.ss-chip-scheda', '.ss-barra']) {
        expect(sovrapposti(await rettangoloDi(page, '.ss-messaggi'), await rettangoloDi(page, sel)), `${caso}: messaggi e ${sel}`).toBe(false);
      }
      // «Riprova» con il focus scorre nella parte visibile dei messaggi, fuori dalla sfumatura, e non è coperto.
      await errore.getByRole('button', { name: 'Riprova' }).focus();
      await dueFotogrammi(page);
      expect(await fuocoVisibile(page), `${caso}: Riprova`).toBeNull();
      await ctx.close();
    }
  });

  test('Catalogo nel foglio esteso: alto almeno 160 px, titolo, chiusura e filtri dentro il foglio, voci raggiungibili', async ({ browser }) => {
    for (const c of CASI) {
      const caso = nomeCaso(c);
      const { ctx, page } = await sessione(browser, { larghezza: c.w, altezza: c.h, scala: c.scala ?? 1, tocco: c.tocco ?? false });
      await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
      await expect(page.locator('.ss-catalogo'), caso).toBeVisible();
      await expect(page.locator('.ss-app'), caso).toHaveAttribute('data-foglio', 'esteso');
      await dueFotogrammi(page);
      const cat = await rettangoloDi(page, '.ss-catalogo');
      const foglio = await rettangoloDi(page, '.ss-foglio');
      expect(cat.y0 >= foglio.y0 && cat.x0 >= foglio.x0 - 0.5 && cat.x1 <= foglio.x1 + 0.5, `${caso}: Catalogo nel foglio`).toBe(true);
      expect(cat.y1 - cat.y0, `${caso}: altezza del Catalogo`).toBeGreaterThanOrEqual(160);
      for (const sel of ['.ss-catalogo .ss-pannello-titolo', '.ss-catalogo .ss-pannello-testa button', '.ss-catalogo .ss-filtri-titolo']) {
        expect(await nonCoperto(page, sel), `${caso}: ${sel}`).toBeNull();
      }
      await page.locator('.ss-catalogo .ss-catalogo-voce').first().focus();
      await dueFotogrammi(page);
      expect(await fuocoVisibile(page), `${caso}: prima voce con il focus`).toBeNull();
      await ctx.close();
    }
  });
});

test.describe('fasce di affidabilità del regolo (§ 11.4.3)', () => {
  /** Livello della fascia che copre l'istante jd nella panoramica e livello del badge della scheda. */
  const fasciaEBadge = (page: Page, jd: number): Promise<{ fascia: string | null; badge: string }> =>
    page.evaluate(
      ([istante, jd0, jd1]) => {
        const svg = document.querySelector('.ss-panoramica-svg')!;
        const x = ((istante! - jd0!) / (jd1! - jd0!)) * Number(svg.getAttribute('width'));
        let fascia: string | null = null;
        for (const r of Array.from(svg.querySelectorAll('rect.ss-banda'))) {
          const x0 = Number(r.getAttribute('x'));
          if (x >= x0 && x < x0 + Number(r.getAttribute('width'))) fascia = (r.getAttribute('class') ?? '').replace(/.*ss-banda--/, '');
        }
        return { fascia, badge: (document.querySelector('.ss-badge-aff')?.className ?? '').replace(/.*ss-aff--/, '') };
      },
      [jd, JD_MIN_UT, JD_MAX_UT_EXCL],
    );

  test('alla data mostrata la fascia ha il livello del badge della scheda (satelliti e piccoli corpi)', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    const oggi = (await tempo(page)).jdUT;
    const divergenti: string[] = [];
    for (const slug of ['io', 'europa', 'amaltea', 'encelado', 'teti', 'dione', 'ariel', 'umbriel', 'titania', 'proteo']) {
      await page.evaluate((s) => window.__ssTest!.seleziona(s), slug);
      await attendiQuiete(page);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const { fascia, badge } = await fasciaEBadge(page, oggi);
      if (fascia !== badge) divergenti.push(`${slug}: fascia ${fascia}, scheda ${badge}`);
    }
    expect(divergenti).toEqual([]);
    // Cerere nel 1605: la finestra delle effemeridi comincia nel 1600, non cinquanta anni dopo.
    await impostaJd(page, calendarToJd({ anno: 1605, mese: 1, giorno: 1, ora: 12, minuto: 0, secondo: 0, calendario: 'gregoriano' }));
    await page.evaluate(() => window.__ssTest!.seleziona('cerere'));
    await attendiQuiete(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const cerere = await fasciaEBadge(page, (await tempo(page)).jdUT);
    expect(cerere.badge).toBe('precisa');
    expect(cerere.fascia).toBe('precisa');
    await ctx.close();
  });
});
