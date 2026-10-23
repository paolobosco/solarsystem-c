// Interazioni dell'interfaccia sull'applicazione reale (§ 11): focus dopo selezioni e ridisegni (WCAG 2.4.3),
// "Segui l'ora attuale" con TT, velocità e verso, pannelli del desktop, esito di "Copia collegamento", collegamenti
// con hash non conformi, scheda senza posizione alla data, licenze delle mappe, zoom da pulsante, vista testuale e
// fasce della panoramica senza dipendenza dai blocchi in memoria.

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { apri, attendiQuiete, cerca, chiudiBenvenuto, impostaJd, tempo } from './aiuti';

interface OpzioniSessione {
  larghezza: number;
  altezza: number;
  tocco?: boolean;
  iniziale?: () => void;
}

async function sessione(browser: Browser, o: OpzioniSessione, percorso = '/'): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: o.larghezza, height: o.altezza },
    hasTouch: o.tocco ?? false,
    isMobile: o.tocco ?? false,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(() => localStorage.setItem('ss.ui.benvenutoChiuso', 'true'));
  if (o.iniziale) await ctx.addInitScript(o.iniziale);
  const page = await ctx.newPage();
  await apri(page, percorso);
  return { ctx, page };
}

/** Vero se il punto centrale dell'elemento appartiene all'elemento stesso (non è coperto). */
function liberoAlCentro(page: Page, selettore: string): Promise<boolean> {
  return page.locator(selettore).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return t !== null && (t === el || el.contains(t));
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

function annunci(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __annunci: string[] }).__annunci);
}

function attivo(page: Page): Promise<{ tag: string; slug: string | null; testo: string; classe: string }> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return { tag: a?.tagName ?? '', slug: a?.dataset['slug'] ?? null, testo: (a?.textContent ?? '').trim(), classe: a?.className ?? '' };
  });
}

async function espandiScheda(page: Page): Promise<void> {
  await attendiQuiete(page);
  const espandi = page.getByRole('button', { name: 'Espandi la scheda' });
  if (await espandi.isVisible()) await espandi.click();
  await expect(page.locator('.ss-scheda')).not.toHaveClass(/ss-scheda--ridotta/);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Riga della vista testuale con il nome del corpo (colonne td: categoria, distanze, coordinate, affidabilità). */
function rigaTabella(page: Page, nome: string): Locator {
  return page.locator('.ss-testuale tbody tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${nome}$`) }) }).first();
}

async function seguiOra(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Impostazioni' }).first().click();
  await page.getByText("Segui l'ora attuale").click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ss-adesso')).toHaveClass(/ss-attivo/);
}

test.describe('riproduzione e "Segui l’ora attuale"', () => {
  test('passando a TT con "Segui l’ora attuale" la riproduzione si ferma (nessuna corsa a 1 giorno/s)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await seguiOra(page);
    await page.locator('.ss-data').click();
    await page.locator('.ss-avanzate summary').click();
    await page.getByText("Inserisci l'istante in TT").click();
    await page.keyboard.press('Escape');
    const t0 = await tempo(page);
    await page.waitForTimeout(2000);
    const t1 = await tempo(page);
    expect(Math.abs(t1.jdTT - t0.jdTT) * 86_400, 'secondi avanzati in 2 s').toBeLessThan(1);
    await expect(page.locator('.ss-riproduci')).toHaveAttribute('aria-label', 'Riproduci');
  });

  test('con "Segui l’ora attuale" velocità e verso mostrano 1 s/s in avanti e sono disattivati', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.selectOption('.ss-velocita', '6');
    await seguiOra(page);
    const velocita = page.locator('.ss-velocita');
    const verso = page.getByRole('button', { name: "Riproduci all'indietro" });
    await expect(velocita).toBeDisabled();
    await expect(velocita).toHaveValue('0');
    await expect(verso).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled: il clic resta possibile (il pulsante è nel focus) ma non cambia il verso.
    await verso.click({ force: true });
    await expect(verso).toHaveAttribute('aria-pressed', 'false');
    await page.locator('.ss-mappa').focus();
    await page.keyboard.press(']');
    await expect(velocita).toHaveValue('0');
    const t0 = await tempo(page);
    await page.waitForTimeout(2000);
    const avanzati = ((await tempo(page)).jdUT - t0.jdUT) * 86_400;
    expect(avanzati).toBeGreaterThan(1);
    expect(avanzati).toBeLessThan(3.5);
    // In pausa tornano la velocità scelta e i controlli attivi.
    await page.getByRole('button', { name: 'Pausa', exact: true }).click();
    await expect(velocita).toBeEnabled();
    await expect(velocita).toHaveValue('6');
    await expect(verso).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('pannelli e focus', () => {
  test('desktop con catalogo e scheda aperti: la vista testuale non è coperta (Aggiorna, Chiudi, titolo)', async ({ browser }) => {
    for (const [w, h] of [
      [1280, 800],
      [1440, 900],
    ] as const) {
      const { ctx, page } = await sessione(browser, { larghezza: w, altezza: h });
      await espandiScheda(page);
      await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
      await page.getByRole('button', { name: 'Vista testuale' }).click();
      await expect(page.locator('.ss-testuale')).toBeVisible();
      expect(await liberoAlCentro(page, '.ss-testuale .ss-pannello-azioni .ss-pulsante:not(.ss-pulsante--icona)'), `${w}: Aggiorna`).toBe(true);
      expect(await liberoAlCentro(page, ".ss-testuale button[aria-label='Chiudi la vista testuale']"), `${w}: Chiudi`).toBe(true);
      const inizioTitolo = await page.locator('.ss-testuale .ss-pannello-titolo').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + 2, r.top + r.height / 2);
        return t !== null && el.contains(t);
      });
      expect(inizioTitolo, `${w}: titolo`).toBe(true);
      await page.getByRole('button', { name: 'Chiudi la vista testuale' }).click({ timeout: 5000 });
      await ctx.close();
    }
  });

  test('vista testuale: dopo Invio su un corpo e dopo un passo il focus resta sul pulsante del corpo', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.getByRole('button', { name: 'Vista testuale' }).click();
    // All'apertura il focus va alla regione della tabella (fotogramma successivo).
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('ss-testuale') ?? false)).toBe(true);
    const marte = page.locator('.ss-tabella-corpo', { hasText: /^Marte$/ });
    await marte.focus();
    await page.keyboard.press('Enter');
    await attendiQuiete(page);
    await page.waitForTimeout(300);
    expect(await attivo(page)).toMatchObject({ tag: 'BUTTON', testo: 'Marte' });
    await page.keyboard.press('.');
    await page.waitForTimeout(600);
    expect(await attivo(page)).toMatchObject({ tag: 'BUTTON', testo: 'Marte' });
    await page.keyboard.press('Tab');
    expect((await attivo(page)).testo, 'il Tab prosegue dalla riga di Marte').not.toBe('Sole');
  });

  test('tablet e telefono: selezione dal catalogo con la tastiera, focus sul titolo della scheda', async ({ browser }) => {
    for (const o of [
      { larghezza: 768, altezza: 1024 },
      { larghezza: 400, altezza: 800, tocco: true },
    ]) {
      const { ctx, page } = await sessione(browser, o);
      await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
      const voce = page.locator(".ss-catalogo-voce[data-slug='marte']");
      await voce.focus();
      await page.keyboard.press('Enter');
      await attendiQuiete(page);
      await page.waitForTimeout(300);
      const a = await attivo(page);
      expect(a.tag, `${o.larghezza} px`).toBe('H2');
      expect(a.testo, `${o.larghezza} px`).toBe('Marte');
      await ctx.close();
    }
  });

  test('"Mostra le comete" nella scheda: annuncio del filtro e focus sul titolo; il pulsante non si ricrea al passo', async ({ browser }) => {
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800 });
    await page.getByRole('button', { name: 'Apri il catalogo dei corpi' }).click();
    await page.locator('.ss-casella--filtro', { hasText: 'Comete' }).click();
    await page.keyboard.press('Escape');
    await cerca(page, 'Halley');
    const pulsante = page.getByRole('button', { name: 'Mostra le comete' });
    // Passo con il focus sul pulsante: il ridisegno della scheda non lo toglie.
    await pulsante.focus();
    await page.keyboard.press('.');
    await page.waitForTimeout(600);
    expect((await attivo(page)).testo).toBe('Mostra le comete');
    await page.waitForTimeout(1600);
    await registraAnnunci(page);
    await page.keyboard.press('Enter');
    await attendiQuiete(page);
    await page.waitForTimeout(300);
    const a = await attivo(page);
    expect(a.tag).toBe('H2');
    expect(a.testo).toBe('1P/Halley');
    await expect.poll(() => annunci(page)).toContain('Comete mostrate');
    await ctx.close();
  });
});

test.describe('collegamenti', () => {
  test('"Copia collegamento": conferma visibile; con gli appunti negati l’URL in un campo selezionato, anche in riproduzione', async ({ browser }) => {
    const rifiuta = () => {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => ({ writeText: () => Promise.reject(new DOMException('negato', 'NotAllowedError')) }),
      });
    };
    const { ctx, page } = await sessione(browser, { larghezza: 1280, altezza: 800, iniziale: rifiuta }, '/#marte');
    await espandiScheda(page);
    await registraAnnunci(page);
    await page.getByRole('button', { name: 'Riproduci', exact: true }).click();
    await page.getByRole('button', { name: 'Copia collegamento' }).click();
    const campo = page.locator('.ss-copia-campo');
    await expect(campo).toBeVisible();
    expect(await campo.inputValue()).toMatch(/#marte$/);
    const selezione = await campo.evaluate((el: HTMLInputElement) => document.activeElement === el && el.selectionEnd! - el.selectionStart! === el.value.length);
    expect(selezione).toBe(true);
    await expect.poll(() => annunci(page)).toContainEqual(expect.stringMatching(/^Copia non riuscita\. Collegamento: .*#marte$/));
    await page.getByRole('button', { name: 'Pausa', exact: true }).click();
    await ctx.close();

    const riesce = () => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => ({ writeText: () => Promise.resolve() }) });
    };
    const s2 = await sessione(browser, { larghezza: 1280, altezza: 800, iniziale: riesce }, '/#marte');
    await espandiScheda(s2.page);
    await s2.page.getByRole('button', { name: 'Copia collegamento' }).click();
    await expect(s2.page.locator('.ss-copia-esito')).toBeVisible();
    await expect(s2.page.locator('.ss-copia-esito')).toContainText('Collegamento copiato.');
    await s2.ctx.close();
  });

  test('hash non conformi: maiuscole accettate, altri testi ignorati con il proprio messaggio', async ({ page }) => {
    await apri(page, '/#Marte');
    await chiudiBenvenuto(page);
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');
    await page.evaluate(() => (location.hash = '#plutonee'));
    await expect(page.locator('.ss-avvisi')).toContainText('Nessun corpo corrisponde a «plutonee»');
    for (const [hash, testo] of [
      ['#1P', '1P'],
      ['#C/1680 V1', 'C/1680 V1'],
    ] as const) {
      await page.evaluate((h) => (location.hash = h), hash);
      await expect(page.locator('.ss-avvisi')).toContainText(`Nessun corpo corrisponde a «${testo}»`);
      await expect(page.locator('.ss-avvisi')).not.toContainText('plutonee');
    }
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Marte');
    await page.evaluate(() => (location.hash = '#Giove'));
    await attendiQuiete(page);
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Giove');
    await expect(page.locator('.ss-avvisi')).not.toContainText('Nessun corpo corrisponde');
  });
});

test.describe('scheda', () => {
  test('senza posizione alla data: "Ora" non ripetuto; Titano non determinabile senza distanze, M, T e anello di selezione', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, -104_826.5);
    await page.evaluate(() => window.__ssTest!.seleziona('1p-halley'));
    await espandiScheda(page);
    await expect(page.locator('.ss-scheda-ora dt')).toHaveCount(0);
    await expect(page.locator('.ss-scheda-ora')).toContainText('Posizione non determinabile a questa data.');
    await page.evaluate(() => window.__ssTest!.seleziona('titano'));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect((await page.evaluate(() => window.__ssTest!.getState('titano')))!.livello).toBe('non-determinabile');
    await expect(page.locator('.ss-scheda-nome')).toHaveText('Titano');
    await expect(page.locator('.ss-scheda-ora dt')).toHaveCount(0);
    await expect(page.locator('.ss-scheda-ora')).toContainText('Posizione non determinabile a questa data.');
    await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>('.ss-scheda details').forEach((d) => (d.open = true)));
    await expect(page.locator('.ss-scheda')).not.toContainText('anomalia media');
    await expect(page.locator('.ss-scheda')).not.toContainText('passaggio al pericentro');
    await expect(page.locator('.ss-scheda .ss-voce', { hasText: 'Errore del modello' }).locator('dd')).toHaveText('> 90°');
    // Nessun anello di selezione sul punto: pixel gialli attorno a Titano con e senza selezione.
    await page.evaluate(() => window.__ssTest!.focus('saturno'));
    await page.evaluate(() => window.__ssTest!.escludi(['saturno']));
    const gialli = async (): Promise<number> => {
      const pos = await page.evaluate(() => window.__ssTest!.getScreenPosition('titano'));
      const px = await page.evaluate((p) => {
        const r = window.__ssTest!.pixel(Math.round(p!.x) - 15, Math.round(p!.y) - 15, 30, 30);
        return r ? Array.from(r.dati) : [];
      }, pos);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i]! > 150 && px[i + 1]! > 150 && px[i + 2]! < 120) n++;
      return n;
    };
    await page.evaluate(() => window.__ssTest!.seleziona('titano'));
    await attendiQuiete(page);
    expect(await gialli()).toBe(0);
  });

  test('mappe CC BY 4.0 con l’URI della licenza; GM dei corpi piccoli in m³/s²', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(() => window.__ssTest!.seleziona('saturno'));
    await espandiScheda(page);
    await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>('.ss-scheda details').forEach((d) => (d.open = true)));
    await expect(page.locator('.ss-scheda')).toContainText('CC BY 4.0, https://creativecommons.org/licenses/by/4.0/; mappa ricampionata');
    await page.evaluate(() => window.__ssTest!.seleziona('bennu'));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.locator('.ss-scheda .ss-voce', { hasText: 'GM' }).locator('dd')).toContainText('m³/s²');
    await expect(page.locator('.ss-scheda .ss-voce', { hasText: 'GM' }).locator('dd .ss-num')).toHaveText(/^4,89040 ± /);
  });
});

test.describe('zoom e regolo ai limiti', () => {
  test('Allontana: annuncio dell’ampiezza; al limite messaggio e aria-disabled', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.waitForTimeout(1600);
    await registraAnnunci(page);
    const allontana = page.locator('.ss-distanze').getByRole('button', { name: 'Allontana' });
    await allontana.click();
    await expect.poll(() => annunci(page)).toContainEqual(expect.stringMatching(/^Vista ampia 40\u00a0UA$/));
    for (let i = 0; i < 6 && (await allontana.getAttribute('aria-disabled')) !== 'true'; i++) {
      await page.waitForTimeout(1700);
      await allontana.click();
      await page.waitForTimeout(500);
    }
    await expect(allontana).toHaveAttribute('aria-disabled', 'true');
    await expect.poll(() => annunci(page)).toContainEqual(expect.stringContaining('Distanza massima della vista raggiunta.'));
    // Avvicinando torna attivo.
    await page.locator('.ss-distanze').getByRole('button', { name: 'Avvicina' }).click();
    await expect(allontana).not.toHaveAttribute('aria-disabled', 'true');
    // Regolo temporale: aria-disabled a 1 giorno.
    const breve = page.getByRole('button', { name: 'Regolo: intervallo più breve' });
    for (let i = 0; i < 6; i++) await breve.click();
    await expect(breve).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.ss-regolo-scala')).toHaveText('Ampiezza del regolo: 1 giorno');
  });
});

test.describe('vista testuale e fasce senza dipendenza dai blocchi in memoria', () => {
  test('blocco in errore: nessun livello senza posizione nella tabella', async ({ page }) => {
    await page.route(/\/data\/v1\/planets\/p07\.bin/, (r) => r.fulfill({ status: 404, body: '' }));
    await apri(page);
    await chiudiBenvenuto(page);
    await page.keyboard.press('t');
    // Senza attendere: il blocco della data non arriva mai.
    await page.evaluate(() => void window.__ssTest!.setTime(810_560));
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Aggiorna' }).click();
    const marte = await page
      .locator('.ss-testuale tbody tr')
      .filter({ has: page.locator('th', { hasText: /^Marte$/ }) })
      .first()
      .locator('td')
      .allTextContents();
    expect(marte[1]).toBe('non disponibile');
    expect(marte[4]).toBe('non disponibile');
  });

  test('blocco in caricamento: tabella e sezione Orbita dicono «in caricamento», non «non disponibile»', async ({ page }) => {
    let rilascia!: () => void;
    const rilasciato = new Promise<void>((r) => (rilascia = r));
    await page.route(/\/data\/v1\/(planets\/p07|sats\/s07|small\/b07)\.bin/, async (r) => {
      await rilasciato;
      await r.continue();
    });
    await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(() => window.__ssTest!.seleziona('marte'));
    await espandiScheda(page);
    await page.keyboard.press('t');
    // Senza attendere: il blocco della data arriva solo al rilascio.
    await page.evaluate(() => void window.__ssTest!.setTime(810_560));
    await expect(page.locator('.ss-caricamento')).toBeVisible();
    const cellaMarte = (n: number) => rigaTabella(page, 'Marte').locator('td').nth(n);
    // Colonne: categoria, distanza dal Sole, distanza dalla Terra, coordinate, affidabilità.
    for (const n of [1, 2, 3, 4]) await expect(cellaMarte(n), `colonna ${n}`).toHaveText('in caricamento');
    // Il Sole non ha dati propri da attendere, ma la distanza dalla Terra sì; ciò che non si applica resta tale.
    const sole = rigaTabella(page, 'Sole').locator('td');
    await expect(sole.nth(1)).toHaveText('non applicabile');
    await expect(sole.nth(2)).toHaveText('in caricamento');
    await expect(sole.nth(4)).toHaveText('non applicabile');
    await expect(rigaTabella(page, 'Terra').locator('td').nth(2)).toHaveText('non applicabile');
    await expect(page.locator('.ss-scheda .ss-sezione-corpo').first()).toHaveText('Dati in caricamento.');
    rilascia();
    await expect(page.locator('.ss-caricamento')).toBeHidden({ timeout: 60_000 });
    await expect(cellaMarte(1)).toHaveText(/UA|km/);
    for (const n of [1, 2, 3, 4]) await expect(cellaMarte(n), `colonna ${n}`).not.toHaveText(/caricamento|non disponibile/);
    await expect(page.locator('.ss-scheda .ss-sezione-corpo').first()).not.toContainText('caricamento');
  });

  test('blocco in errore: «non disponibile» e non «in caricamento»; con «Riprova» di nuovo «in caricamento»', async ({ page }) => {
    let modo: 'errore' | 'trattieni' | 'passa' = 'errore';
    let rilascia!: () => void;
    const rilasciato = new Promise<void>((r) => (rilascia = r));
    await page.route(/\/data\/v1\/planets\/p07\.bin$/, async (r) => {
      if (modo === 'errore') await r.fulfill({ status: 404, body: '' });
      else {
        if (modo === 'trattieni') await rilasciato;
        await r.continue();
      }
    });
    await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(() => window.__ssTest!.seleziona('marte'));
    await espandiScheda(page);
    await page.keyboard.press('t');
    await page.evaluate(() => void window.__ssTest!.setTime(810_560));
    const riprova = page.locator('.ss-avvisi-elenco .ss-avviso--errore').getByRole('button', { name: 'Riprova' });
    await expect(riprova).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    const cellaMarte = (n: number) => rigaTabella(page, 'Marte').locator('td').nth(n);
    for (const n of [1, 2, 3, 4]) await expect(cellaMarte(n), `errore, colonna ${n}`).toHaveText('non disponibile');
    await expect(page.locator('.ss-scheda .ss-sezione-corpo').first()).toHaveText('Elementi non disponibili a questa data.');
    // Il blocco «Ora» della scheda dice lo stesso della tabella e della sezione Orbita (§ 11.7, § 11.11).
    const notaOra = page.locator('.ss-scheda-ora p.ss-nota:not([hidden])');
    await expect(notaOra).toHaveText('Dati non disponibili a questa data.');
    // Nuovo tentativo in corso: i dati stanno arrivando.
    modo = 'trattieni';
    await riprova.click();
    await expect(page.locator('.ss-caricamento')).toBeVisible();
    for (const n of [1, 2, 3, 4]) await expect(cellaMarte(n), `nuovo tentativo, colonna ${n}`).toHaveText('in caricamento');
    await expect(page.locator('.ss-scheda .ss-sezione-corpo').first()).toHaveText('Dati in caricamento.');
    await expect(notaOra).toHaveText('Dati in caricamento.');
    modo = 'passa';
    rilascia();
    await expect(page.locator('.ss-caricamento')).toBeHidden({ timeout: 60_000 });
    await expect(cellaMarte(1)).toHaveText(/UA|km/);
    await expect(notaOra).toHaveCount(0);
    await expect(page.locator('.ss-scheda-ora dl')).toContainText('Distanza dal Sole');
  });

  test('blocco in errore con «Segui l’ora attuale»: «Ora» e «Leggi posizione» dicono «non disponibili»; con «Riprova» in corso «in caricamento»', async ({ page }) => {
    let modo: 'errore' | 'trattieni' | 'passa' = 'errore';
    let rilascia!: () => void;
    const rilasciato = new Promise<void>((r) => (rilascia = r));
    // Blocco 12 (2011-2120): quello dell'istante attuale.
    await page.route(/\/data\/v1\/planets\/p12\.bin$/, async (r) => {
      if (modo === 'errore') await r.fulfill({ status: 404, body: '' });
      else {
        if (modo === 'trattieni') await rilasciato;
        await r.continue();
      }
    });
    await apri(page, '/', { attendi: false });
    const riprova = page.locator('.ss-avvisi-elenco .ss-avviso--errore').getByRole('button', { name: 'Riprova' });
    await expect(riprova).toBeVisible({ timeout: 60_000 });
    await chiudiBenvenuto(page);
    // Senza attendere: i dati della data non arrivano senza «Riprova».
    const campo = page.getByRole('combobox', { name: 'Trova' });
    await campo.fill('marte');
    await expect(page.getByRole('listbox')).toBeVisible();
    await campo.press('ArrowDown');
    await campo.press('Enter');
    await page.getByRole('button', { name: 'Espandi la scheda' }).click();
    await seguiOra(page);
    await registraAnnunci(page);
    const notaOra = page.locator('.ss-scheda-ora p.ss-nota:not([hidden])');
    const leggi = page.getByRole('button', { name: 'Leggi posizione' });
    const ultimo = async (): Promise<string | undefined> => (await annunci(page)).at(-1);
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    await expect(notaOra).toHaveText('Dati non disponibili a questa data.');
    await expect(leggi).toBeVisible();
    await leggi.click();
    await expect.poll(ultimo).toBe('Marte: Dati non disponibili a questa data.');
    // Nuovo tentativo in corso: i dati stanno arrivando.
    modo = 'trattieni';
    await riprova.click();
    await expect(page.locator('.ss-caricamento')).toBeVisible();
    await expect(notaOra).toHaveText('Dati in caricamento.');
    await page.waitForTimeout(1700);
    await leggi.click();
    await expect.poll(ultimo).toBe('Marte: Dati in caricamento.');
    modo = 'passa';
    rilascia();
    await expect(page.locator('.ss-caricamento')).toBeHidden({ timeout: 60_000 });
    await expect(notaOra).toHaveCount(0);
    await expect(page.locator('.ss-scheda-ora dl')).toContainText('Distanza dal Sole');
    await page.waitForTimeout(1700);
    await leggi.click();
    await expect.poll(ultimo).toMatch(/^Marte: .+ dal Sole, .+ dalla Terra\.$/);
  });

  test('fasce della panoramica con ε_ΔT anche fuori dai blocchi: Mercurio e Luna non «precisa» o «buona» nel 10000 a.C.', async ({ page }) => {
    await apri(page, '/#mercurio');
    await chiudiBenvenuto(page);
    const prima = (): Promise<string> =>
      page.locator('.ss-panoramica-svg rect.ss-banda').first().evaluate((el) => el.getAttribute('class') ?? '');
    await expect.poll(prima).toContain('ss-banda--approssimata');
    await page.evaluate(() => window.__ssTest!.seleziona('luna'));
    await expect.poll(prima).toContain('ss-banda--indicativa');
  });
});
