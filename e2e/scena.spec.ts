// Scena sull'applicazione reale: etichette, livelli, limiti della camera, marcatori lontani, risorse dopo un errore.
// - Etichette (§ 11.5.2): nessuna etichetta mostrata, nemmeno in parte, sotto barra, pannelli, regolo e console;
// - Eclittica della data (RF5): il pannello Livelli dice come vederla e il gesto indicato la porta nel campo;
// - preset "Oggetti interstellari" (§ 11.3, RF1, § 10.3): ampiezza della vista di 2·10⁵ UA;
// - marcatori e anello di selezione (§ 11.5.1) con la camera fino a 2·10⁵ UA: stessa forma che da vicino;
// - texture e stars.bin (§ 5.6): dopo un errore un nuovo tentativo quando la risorsa serve di nuovo.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DIMENSIONE_MARCATORE, MARGINE_ANELLO_SELEZIONE_PX } from '../src/render/costanti';
import type { CategoriaCorpo } from '../src/data/catalogTypes';
import { UA, apri, attendiQuiete, chiudiBenvenuto, impostaJd, preset, schermata } from './aiuti';

/** Punti delle etichette mostrate coperti da elementi esterni alla mappa (pannelli, barra, console). */
async function etichetteCoperte(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const mappa = document.querySelector('.ss-mappa')!;
    const forzata = window.__ssTest!.vista()?.selezione ?? null;
    const out: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('.ss-etichetta')) {
      if (getComputedStyle(e).visibility !== 'visible') continue;
      if (forzata !== null && e.dataset['ssid'] === String(forzata)) continue;
      const r = e.getBoundingClientRect();
      let coperti = 0;
      let sopra = '';
      for (let y = r.top + 2; y <= r.bottom - 2; y += 4) {
        for (let x = r.left + 2; x <= r.right - 2; x += 4) {
          const el = document.elementFromPoint(x, y);
          if (el !== null && !mappa.contains(el)) {
            coperti++;
            sopra = el.className.toString();
          }
        }
      }
      if (coperti > 0) out.push(`${e.textContent ?? ''} (${coperti} punti sotto ${sopra})`);
    }
    return out;
  });
}

/**
 * Nomi delle etichette di altri corpi che coprono, in qualche punto di una griglia di 2 px, il riquadro del marcatore
 * del corpo selezionato con l'anello di selezione (raggio del marcatore + 5 px + 2 px di tratto).
 */
async function etichetteSulMarcatore(page: Page, slug: string, categoria: CategoriaCorpo): Promise<string[]> {
  const raggio = DIMENSIONE_MARCATORE[categoria] / 2 + MARGINE_ANELLO_SELEZIONE_PX + 2;
  return page.evaluate(
    ([s, r]) => {
      const t = window.__ssTest!;
      const p = t.getScreenPosition(s as string)!;
      const propria = String(t.vista()?.selezione ?? -1);
      const nomi = new Set<string>();
      // Griglia di 2 px dentro il riquadro, a 2 px dal bordo: un'etichetta che lo sfiora (il suo alone sporge di 1-2 px
      // dal riquadro) senza entrarvi non lo copre.
      const dentro = (r as number) - 2;
      for (let dy = -dentro; dy <= dentro; dy += 2) {
        for (let dx = -dentro; dx <= dentro; dx += 2) {
          const e = document.elementFromPoint(p.x + dx, p.y + dy)?.closest<HTMLElement>('.ss-etichetta');
          if (e && e.dataset['ssid'] !== propria) nomi.add((e.textContent ?? '').trim());
        }
      }
      return [...nomi];
    },
    [slug, raggio] as const,
  );
}

/** Pixel accesi (somma RGB > 120) in un riquadro della canvas centrato su (x, y). */
async function maschera(page: Page, x: number, y: number, lato: number): Promise<{ n: number; bit: number[]; x0: number; x1: number; y0: number; y1: number }> {
  return page.evaluate(
    ({ x, y, lato }) => {
      const p = window.__ssTest!.pixel(Math.round(x) - lato / 2, Math.round(y) - lato / 2, lato, lato)!;
      const bit: number[] = [];
      let n = 0;
      let x0 = lato;
      let x1 = -1;
      let y0 = lato;
      let y1 = -1;
      for (let j = 0; j < p.altezza; j++) {
        for (let i = 0; i < p.larghezza; i++) {
          const k = 4 * (j * p.larghezza + i);
          const on = p.dati[k]! + p.dati[k + 1]! + p.dati[k + 2]! > 120 ? 1 : 0;
          bit.push(on);
          if (on) {
            n++;
            x0 = Math.min(x0, i);
            x1 = Math.max(x1, i);
            y0 = Math.min(y0, j);
            y1 = Math.max(y1, j);
          }
        }
      }
      return { n, bit, x0, x1, y0, y1 };
    },
    { x, y, lato },
  );
}

/** Pixel della canvas che cambiano (oltre 6 livelli RGB in tutto) accendendo il livello visivo indicato. */
async function pixelDelLivello(page: Page, livello: 'eclitticaData' | 'stelle'): Promise<number> {
  return page.evaluate(async (l) => {
    const t = window.__ssTest!;
    const leggi = (): Uint8Array => {
      const v = t.vista()!;
      return t.pixel(0, 0, v.larghezzaPx, v.altezzaPx)!.dati;
    };
    await t.livelli({ [l]: false });
    const spento = leggi();
    await t.livelli({ [l]: true });
    const acceso = leggi();
    let n = 0;
    for (let k = 0; k + 3 < spento.length; k += 4) {
      const d = Math.abs(spento[k]! - acceso[k]!) + Math.abs(spento[k + 1]! - acceso[k + 1]!) + Math.abs(spento[k + 2]! - acceso[k + 2]!);
      if (d > 6) n++;
    }
    return n;
  }, livello);
}

test.describe('Scena: etichette, livelli, limiti della camera, risorse', () => {
  test('etichette mai coperte da barra, pannelli, regolo e console (§ 11.5.2)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await attendiQuiete(page);
    expect(await page.locator('.ss-etichetta').evaluateAll((l) => l.filter((e) => getComputedStyle(e).visibility === 'visible').length)).toBeGreaterThan(10);
    expect(await etichetteCoperte(page), 'vista iniziale').toEqual([]);
    await page.evaluate(() => window.__ssTest!.focus('saturno'));
    await preset(page, 'Pianeti giganti');
    expect(await etichetteCoperte(page), 'Pianeti giganti').toEqual([]);
  });

  test("clic sul marcatore coperto dall'etichetta di un altro corpo: l'etichetta è un candidato e il ciclo prosegue (§ 11.5.3)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_334.0);
    await preset(page, 'Fascia di Kuiper');
    await page.evaluate(() => window.__ssTest!.seleziona(null));
    await attendiQuiete(page);
    const sole = (await page.evaluate(() => window.__ssTest!.getScreenPosition('sole')))!;
    const x = Math.round(sole.x);
    const y = Math.round(sole.y);
    const sopra = (): Promise<string | null> =>
      page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('.ss-etichetta')?.textContent ?? null, [x, y]);
    // Condizione della prova: l'etichetta di Giove copre il marcatore del Sole.
    await expect.poll(sopra).toMatch(/^Giove/);
    const corpo = (): Promise<string> => page.evaluate(() => location.hash);
    const scelti: string[] = [];
    for (let k = 0; k < 4; k++) {
      const prima = await corpo();
      await page.mouse.click(x, y);
      await page.waitForFunction((h) => location.hash !== h, prima, { timeout: 1000 }).catch(() => undefined);
      scelti.push(await corpo());
    }
    await schermata(page, 'scena-clic-marcatore-coperto');
    // Il Sole vince per priorità di categoria e i clic ripetuti passano ai candidati successivi: nessun corpo si ripete.
    expect(scelti[0]).toBe('#sole');
    expect(new Set(scelti).size, scelti.join(' ')).toBe(4);
    expect(scelti).not.toContain('#giove');
  });

  test("marcatore e anello del corpo selezionato mai coperti dalle etichette degli altri corpi (§ 11.5.2)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2_461_334.0);
    await preset(page, 'Fascia di Kuiper');
    // Puntatore lontano dai corpi: l'etichetta del corpo sotto il puntatore è forzata e può coprire il marcatore.
    await page.mouse.move(1270, 790);
    // Condizione della prova: senza selezione l'etichetta di Giove copre il marcatore del Sole.
    await page.evaluate(() => window.__ssTest!.seleziona(null));
    await attendiQuiete(page);
    await expect
      .poll(async () => (await etichetteSulMarcatore(page, 'sole', 'sole')).some((nome) => nome.startsWith('Giove')), { timeout: 5_000 })
      .toBe(true);
    for (const [slug, categoria] of [
      ['sole', 'sole'],
      ['2p-encke', 'cometa'],
    ] as const) {
      await page.evaluate((s) => window.__ssTest!.seleziona(s), slug);
      await attendiQuiete(page);
      // Il layout si ricalcola ogni 100 ms e le etichette cambiano stato dopo 300 ms: l'esito si stabilizza in meno di 1 s.
      await page.waitForTimeout(1_000);
      expect(await etichetteSulMarcatore(page, slug, categoria), `${slug} selezionato`).toEqual([]);
      // L'etichetta del corpo selezionato resta visibile, accanto all'anello.
      const propria = await page.evaluate(() => {
        const sel = window.__ssTest!.vista()?.selezione;
        const e = document.querySelector<HTMLElement>(`.ss-etichetta[data-ssid="${sel}"]`);
        return e !== null && getComputedStyle(e).visibility === 'visible';
      });
      expect(propria, `${slug}: etichetta propria`).toBe(true);
    }
    await schermata(page, 'scena-marcatore-selezionato-libero');
  });

  test('etichette mai coperte da barra e foglio inferiore sul telefono (§ 11.5.2) @telefono', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await attendiQuiete(page);
    expect(await etichetteCoperte(page), 'foglio compatto').toEqual([]);
    await page.evaluate(() => window.__ssTest!.seleziona('giove'));
    expect(await etichetteCoperte(page), 'con la scheda di Giove').toEqual([]);
  });

  test("Eclittica della data: il pannello Livelli spiega come vederla e Freccia giù la porta nel campo (RF5)", async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.getByRole('button', { name: 'Livelli', exact: true }).click();
    const casella = page.getByRole('checkbox', { name: 'Eclittica della data' });
    await expect(casella).toHaveAccessibleDescription(/Freccia giù/);
    await page.keyboard.press('Escape');
    // Gesto indicato dalla nota: due scatti di Freccia giù sulla mappa (elevazione da 30° a 20°).
    await page.locator('.ss-mappa').focus();
    expect(await pixelDelLivello(page, 'eclitticaData'), 'vista iniziale (30°): linea fuori campo').toBe(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await pixelDelLivello(page, 'eclitticaData'), 'dopo due scatti di Freccia giù (20°)').toBeGreaterThan(500);
  });

  test('preset "Oggetti interstellari": ampiezza della vista di 2·10⁵ UA (§ 11.3, RF1)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await preset(page, 'Oggetti interstellari');
    const v = await page.evaluate(() => window.__ssTest!.vista()!);
    expect(v.estensioneKm / UA).toBeGreaterThan(199_000);
    expect(v.estensioneKm / UA).toBeLessThan(201_000);
    await expect(page.getByRole('slider', { name: 'Ampiezza della vista' })).toHaveAttribute('aria-valuetext', /^Vista ampia 200\s000\sUA$/);
    // "Allontana" non va oltre l'ampiezza massima.
    await page.getByRole('button', { name: 'Allontana' }).first().click();
    await attendiQuiete(page);
    const w = await page.evaluate(() => window.__ssTest!.vista()!);
    expect(w.estensioneKm / v.estensioneKm).toBeCloseTo(1, 6);
  });

  test('anello di selezione con la camera fino a 2·10⁵ UA: stessa forma che a 1000 UA (§ 11.5.1)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(async () => {
      const t = window.__ssTest!;
      await t.setTime(2_461_333.0);
      await t.focus('terra');
      await t.seleziona('terra');
      await t.livelli({ etichette: false, marcatori: false, orbite: false, anelliDistanza: false, stelle: false });
    });
    const forma = async (ua: number): Promise<Awaited<ReturnType<typeof maschera>>> => {
      const d = ua * UA;
      await page.evaluate((d) => window.__ssTest!.posa([0, -0.5 * d, 0.8660254037844386 * d], [0, 0, 0]), d);
      const p = (await page.evaluate(() => window.__ssTest!.getScreenPosition('terra')))!;
      return maschera(page, p.x, p.y, 40);
    };
    const rif = await forma(1000);
    expect(rif.n).toBeGreaterThan(60);
    for (const ua of [3000, 4000, 1e4, 1e5, 2e5]) {
      const m = await forma(ua);
      let diversi = 0;
      for (let k = 0; k < rif.bit.length; k++) if (rif.bit[k] !== m.bit[k]) diversi++;
      expect({ ua, x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1 }).toEqual({ ua, x0: rif.x0, x1: rif.x1, y0: rif.y0, y1: rif.y1 });
      expect(diversi, `pixel diversi a ${ua} UA`).toBeLessThanOrEqual(0.1 * rif.n);
    }
  });

  test('stars.bin: dopo un errore nuovo tentativo e stelle disegnate (§ 5.6)', async ({ page }) => {
    let blocca = true;
    let richieste = 0;
    await page.route(/\/stars\.bin$/, (r) => {
      richieste++;
      return blocca ? r.fulfill({ status: 404, body: '' }) : r.continue();
    });
    await apri(page);
    await chiudiBenvenuto(page);
    await expect.poll(() => richieste).toBeGreaterThanOrEqual(1);
    blocca = false;
    await expect.poll(() => richieste, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await attendiQuiete(page);
    expect(await pixelDelLivello(page, 'stelle'), 'stelle disegnate dopo il nuovo tentativo').toBeGreaterThan(200);
  });

  test('texture: dopo un errore nuovo tentativo quando serve di nuovo (§ 5.6)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    let blocca = true;
    let richieste = 0;
    await page.route(/\/tex\/terra\.jpg$/, (r) => {
      richieste++;
      return blocca ? r.fulfill({ status: 404, body: '' }) : r.continue();
    });
    await page.evaluate(async () => {
      await window.__ssTest!.focus('terra');
      await window.__ssTest!.posa([0, -20_000, 5000], [0, 0, 0]);
    });
    await expect.poll(() => richieste).toBeGreaterThanOrEqual(1);
    blocca = false;
    await expect.poll(() => richieste, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.__ssTest!.attendiTexture('terra'));
  });
});
