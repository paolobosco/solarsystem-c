// Camera e disegno con il corpo a fuoco fuori dal centro della vista, sull'applicazione reale:
// - spostamento (Maiusc+frecce) e rotazione: distanza minima dal centro del corpo a fuoco (§ 10.3, RF1);
// - barra di scala alla profondità del corpo a fuoco dopo lo spostamento (R14);
// - anello di selezione ed etichetta del disco attorno al contorno proiettato, fuori dall'asse ottico (§ 11.5.1, § 11.5.2);
// - etichetta dell'anello di distanza di 1000 UA con il separatore delle migliaia (§ 11.13);
// - livello "Assi di rotazione": nessun asse per gli orientamenti convenzionali (Febe), asse per Cerere (RF5).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { UA, apri, attendiQuiete, cerca, chiudiBenvenuto, impostaJd, posizione, schermata } from './aiuti';

/** Raggio equatoriale della Terra (Archinal et al. 2018, NAIF pck00011.tpc), km. */
const R_TERRA = 6378.1366;

function vista(page: Page) {
  return page.evaluate(() => window.__ssTest!.vista()!);
}

async function tasto(page: Page, t: string, volte = 1): Promise<void> {
  for (let k = 0; k < volte; k++) {
    await page.keyboard.press(t);
    await attendiQuiete(page);
  }
}

/** Pixel della canvas come colonna (x fissato) o riga (y fissato): [r, g, b] per pixel. */
async function linea(page: Page, x: number, y: number, larghezza: number, altezza: number): Promise<number[][]> {
  return page.evaluate(
    ([x, y, w, h]) => {
      const p = window.__ssTest!.pixel(x!, y!, w!, h!)!;
      const out: number[][] = [];
      for (let k = 0; k < p.larghezza * p.altezza; k++) out.push([p.dati[4 * k]!, p.dati[4 * k + 1]!, p.dati[4 * k + 2]!]);
      return out;
    },
    [x, y, larghezza, altezza],
  );
}

/** Anello di selezione #D7F75B (verde > rosso > blu, verde alto). */
const giallo = (c: number[]): boolean => c[1]! > 180 && c[0]! > 120 && c[2]! < 140 && c[1]! - c[2]! > 80;
/** Disco della Luna: grigio più chiaro dello sfondo #030806 (l'anello, anche sfumato, è giallo-verde). */
const disco = (c: number[]): boolean => Math.abs(c[0]! - c[1]!) < 20 && Math.abs(c[1]! - c[2]!) < 20 && c[0]! + c[1]! + c[2]! > 45;

test.describe('Camera e disegno fuori dall\'asse ottico', () => {
  test('Terra: spostamento e rotazione non portano la camera sotto la distanza minima dal centro (§ 10.3, RF1)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await cerca(page, 'Terra');
    await page.getByRole('button', { name: 'Inquadra il corpo selezionato' }).click();
    await attendiQuiete(page);
    await page.locator('.ss-mappa').focus();
    await tasto(page, '+', 3);
    const dMin = R_TERRA + 0.01 * R_TERRA;
    expect((await vista(page)).distanzaKm).toBeCloseTo(dMin, 0);
    await tasto(page, 'Shift+ArrowRight', 4);
    expect((await vista(page)).distanzaKm).toBeGreaterThan(dMin + 100);
    let minimo = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 36; k++) {
      await tasto(page, 'ArrowRight');
      minimo = Math.min(minimo, (await vista(page)).distanzaKm);
    }
    expect(minimo).toBeGreaterThanOrEqual(dMin * (1 - 1e-9));
  });

  test('Luna fuori asse: barra di scala invariata, anello di selezione fuori dal disco, etichetta accanto al contorno (R14, § 11.5.1, § 11.5.2)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2460394.79167);
    await page.evaluate(() => window.__ssTest!.livelli({ stelle: false, orbite: false, anelliDistanza: false }));
    await cerca(page, 'Luna');
    await page.getByRole('button', { name: 'Inquadra il corpo selezionato' }).click();
    await attendiQuiete(page);
    await page.locator('.ss-mappa').focus();
    const v0 = await vista(page);
    const barra = page.locator('.ss-barra-linea');
    const valore = page.locator('.ss-barra-valore');
    const w0 = (await barra.boundingBox())!.width;
    const t0 = await valore.textContent();
    await tasto(page, 'Shift+ArrowRight', 6);
    const v1 = await vista(page);
    expect(v1.distanzaKm / v0.distanzaKm).toBeGreaterThan(1.05);
    // La profondità della Luna non cambia: stessa scala, stessa barra.
    expect(v1.kmPerPx / v0.kmPerPx).toBeCloseTo(1, 6);
    await expect(valore).toHaveText(t0!);
    expect(Math.abs((await barra.boundingBox())!.width - w0)).toBeLessThan(0.5);
    // Colonna e riga per il centro proiettato della Luna.
    const p = (await posizione(page, 'luna'))!;
    expect(p.x).toBeGreaterThan(v1.larghezzaPx / 2 + 300);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const colonna = await linea(page, x, 0, 1, v1.altezzaPx);
    const yDisco = colonna.map((c, i) => (disco(c) ? i : -1)).filter((i) => i >= 0);
    const yGiallo = colonna.map((c, i) => (giallo(c) ? i : -1)).filter((i) => i >= 0);
    expect(yDisco.length).toBeGreaterThan(200);
    const sopra = yGiallo.filter((i) => i < y);
    const sotto = yGiallo.filter((i) => i > y);
    expect(sopra.length).toBeGreaterThan(0);
    expect(sotto.length).toBeGreaterThan(0);
    // Anello 5 px fuori dal bordo del disco (tratto di 2 px antialiasato: almeno 3 px).
    expect(Math.min(...yDisco) - Math.max(...sopra)).toBeGreaterThanOrEqual(3);
    expect(Math.min(...sotto) - Math.max(...yDisco)).toBeGreaterThanOrEqual(3);
    const riga = await linea(page, 0, y, v1.larghezzaPx, 1);
    const xDisco = riga.map((c, i) => (disco(c) ? i : -1)).filter((i) => i >= 0);
    const xGiallo = riga.map((c, i) => (giallo(c) ? i : -1)).filter((i) => i >= 0 && i < x);
    expect(xGiallo.length).toBeGreaterThan(0);
    expect(Math.min(...xDisco) - Math.max(...xGiallo)).toBeGreaterThanOrEqual(3);
    // Etichetta "Luna" visibile e fuori dal disco: nessun pixel del disco sotto il suo riquadro.
    const etichetta = page.locator('.ss-etichetta', { hasText: /^Luna$/ });
    await expect(etichetta).toBeVisible();
    const box = (await etichetta.boundingBox())!;
    const mappa = (await page.locator('.ss-mappa canvas').boundingBox())!;
    const sottoEtichetta = await linea(page, Math.round(box.x - mappa.x), Math.round(box.y - mappa.y), Math.round(box.width), Math.round(box.height));
    expect(sottoEtichetta.filter(disco).length).toBe(0);
    // Accanto al disco: pixel del disco entro 12 px dal riquadro, sulla stessa altezza.
    const xs = Math.max(0, Math.round(box.x - mappa.x) - 12);
    const vicino = await linea(page, xs, Math.round(box.y - mappa.y), Math.round(box.width) + 24, Math.round(box.height));
    expect(vicino.filter(disco).length).toBeGreaterThan(0);
    await schermata(page, 'camera-luna-fuori-asse');
  });

  test('anello di distanza di 1000 UA: "1 000 UA" con U+2009 (§ 11.13)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await page.evaluate(() => window.__ssTest!.focus('sole'));
    await page.evaluate((ua) => window.__ssTest!.posa([0, -1200 * ua, 1500 * ua], [0, 0, 0]), UA);
    await attendiQuiete(page);
    const testi = await page.locator('.ss-etichetta').evaluateAll((l) =>
      l.filter((e) => getComputedStyle(e).visibility === 'visible' && /UA$/.test(e.textContent ?? '')).map((e) => e.textContent ?? ''),
    );
    expect(testi).toContain('1 000 UA');
    expect(testi).not.toContain('1000 UA');
  });

  test('assi di rotazione: nessun asse per Febe (assi convenzionali), asse per Cerere (RF5, § 7.5.5, § 7.6.4)', async ({ page }) => {
    await apri(page);
    await chiudiBenvenuto(page);
    await impostaJd(page, 2460600.5);
    await page.evaluate(() => window.__ssTest!.livelli({ orbite: false, marcatori: false, etichette: false, stelle: false, anelliDistanza: false }));
    const pixelAsse = async (slug: string, distanza: number): Promise<number> =>
      page.evaluate(
        async ([s, d]) => {
          const t = window.__ssTest!;
          await t.focus(s as string);
          await t.posa([0, -(d as number), 0], [0, 0, 0]);
          const leggi = (): Uint8Array => {
            const v = t.vista()!;
            return t.pixel(0, 0, v.larghezzaPx, v.altezzaPx)!.dati;
          };
          await t.livelli({ assiRotazione: false });
          const senza = leggi();
          await t.livelli({ assiRotazione: true });
          const con = leggi();
          let n = 0;
          for (let k = 0; k + 3 < senza.length; k += 4) {
            if (Math.abs(senza[k]! - con[k]!) + Math.abs(senza[k + 1]! - con[k + 1]!) + Math.abs(senza[k + 2]! - con[k + 2]!) > 30) n++;
          }
          return n;
        },
        [slug, distanza] as const,
      );
    expect(await pixelAsse('febe', 875)).toBe(0);
    expect(await pixelAsse('cerere', 8 * 482)).toBeGreaterThan(100);
  });
});
