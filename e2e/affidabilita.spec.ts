// Affidabilità nell'applicazione (§ 7.8). Luna: ε_modello = 60″ ⊕ ½·σ_ṅ·τ² supera 1′ a ogni data, quindi non è
// mai 'precisa', neppure con l'istante inserito in TT (ε_ΔT = 0). Livelli alla data attuale e nel 1735 (§ 7.6.2, § 8.7).
// Arco d'incertezza ±ε del livello 'indicativa' distinguibile dall'orbita, anche con il corpo selezionato (§ 7.8.2).

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { apri, attendiQuiete, differenza, impostaJd, posizione, soloProgetto, stato, unitario, vettoriale } from './aiuti';

soloProgetto('desktop');

test('Luna mai precisa, anche con l\'istante in TT', async ({ page }) => {
  await apri(page);
  await impostaJd(page, 2_453_371.5); // 1° gennaio 2005, nel nodo 2000,7-2020,7
  await attendiQuiete(page);
  expect((await stato(page, 'luna')).livello).toBe('buona');
  await page.locator('.ss-data').click();
  await page.getByText('Opzioni avanzate', { exact: true }).click();
  await page.getByLabel("Inserisci l'istante in TT").check();
  await attendiQuiete(page);
  expect((await stato(page, 'luna')).livello).toBe('buona');
  await page.evaluate(() => window.__ssTest!.seleziona('luna'));
  await expect(page.locator('.ss-scheda-nome')).toHaveText('Luna');
  await expect(page.locator('.ss-scheda')).not.toContainText('Precisa');
});

// § 8.7: dal 1980,7 intervalli di 1,25 anni; alla data attuale il livello non prende il valore del 2040.
test('19/10/2026: livelli dall\'intervallo della data, non dal 2040', async ({ page }) => {
  await apri(page);
  await impostaJd(page, 2_461_333.0); // 19 ottobre 2026, 12:00 UT
  await attendiQuiete(page);
  const corpi = ['io', 'amaltea', 'encelado', 'teti', 'ariel', 'umbriel', 'titania', 'proteo', 'apophis', '19p-borrelly',
    '46p-wirtanen', '81p-wild-2', '103p-hartley-2', 'c2023-a3-tsuchinshan-atlas', 'gonggong'];
  const livelli: Record<string, string> = {};
  for (const slug of corpi) livelli[slug] = (await stato(page, slug)).livello;
  expect(livelli).toEqual(Object.fromEntries(corpi.map((s) => [s, 'precisa'])));
});

// § 7.6.2: ε segue l'errore di posizione (senza l'anomalia media) e, per le comete a record, l'apparizione.
test('1735: 109P vicina all\'apparizione del 1737 e Arrokoth non oltre "buona"', async ({ page }) => {
  await apri(page);
  await impostaJd(page, 2_355_000.5); // 3 settembre 1735
  await attendiQuiete(page);
  expect((await stato(page, '109p-swift-tuttle')).livello).toBe('buona');
  expect((await stato(page, 'arrokoth')).livello).toBe('buona');
});

/** Profilo dell'orbita lungo raggi uscenti dal primario (px CSS): per angolo, pixel accesi, picco e somma. */
async function profiloOrbita(page: Page, primario: string, corpo: string) {
  const e = (await posizione(page, primario))!;
  const c = (await posizione(page, corpo))!;
  return page.evaluate(
    ([ex, ey, cx, cy]) => {
      const v = window.__ssTest!.vista()!;
      const p = window.__ssTest!.pixel(0, 0, v.larghezzaPx, v.altezzaPx)!;
      const pr = p.pixelRatio;
      const lum = (x: number, y: number): number => {
        const i = 4 * (Math.floor(y * pr) * p.larghezza + Math.floor(x * pr));
        return p.dati[i]! + p.dati[i + 1]! + p.dati[i + 2]!;
      };
      const r0 = Math.hypot(cx! - ex!, cy! - ey!);
      const th0 = Math.atan2(cy! - ey!, cx! - ex!);
      const righe: { dTh: number; accesi: number; picco: number; somma: number }[] = [];
      for (let k = -720; k < 720; k++) {
        const dTh = k * 0.25;
        const th = th0 + (dTh * Math.PI) / 180;
        let accesi = 0;
        let picco = 0;
        let somma = 0;
        let dentro = true;
        // Orbita della Luna: distanza dalla Terra tra 0,896 e 1,116 volte quella attuale (e = 0,055).
        for (let r = 0.85 * r0; r <= 1.2 * r0; r += 1 / pr) {
          const x = ex! + r * Math.cos(th);
          const y = ey! + r * Math.sin(th);
          if (x < 1 || y < 1 || x > v.larghezzaPx - 1 || y > v.altezzaPx - 1) {
            dentro = false;
            break;
          }
          const l = lum(x, y);
          if (l > 90) accesi++;
          picco = Math.max(picco, l);
          somma += Math.max(0, l - 30);
        }
        if (dentro) righe.push({ dTh, accesi, picco, somma });
      }
      return righe;
    },
    [e.x, e.y, c.x, c.y],
  );
}

type Riga = Awaited<ReturnType<typeof profiloOrbita>>[number];

function sintesi(righe: Riga[]) {
  const accese = righe.filter((r) => r.accesi > 0);
  const media = (f: (r: Riga) => number): number => accese.reduce((s, r) => s + f(r), 0) / Math.max(1, accese.length);
  return { n: righe.length, copertura: accese.length / Math.max(1, righe.length), larghezza: media((r) => r.accesi), somma: media((r) => r.somma) };
}

test("arco ±ε dell'indicativa: continuo e più largo dell'orbita, anche con il corpo selezionato (§ 7.8.2)", async ({ page }) => {
  await apri(page);
  await impostaJd(page, -1_931_076.0); // 10000 a.C.: Luna 'indicativa'
  expect((await stato(page, 'luna')).livello).toBe('indicativa');
  await page.evaluate(() => window.__ssTest!.seleziona('luna'));
  await page.evaluate(() => window.__ssTest!.focus('luna'));
  await page.evaluate(() => window.__ssTest!.livelli({ stelle: false, anelliDistanza: false, etichette: false, marcatori: false }));
  // Terra esclusa dal disegno (disco e orbita): attorno alla Luna resta solo la sua orbita.
  await page.evaluate(() => window.__ssTest!.escludi(['terra']));
  const t = await stato(page, 'terra');
  const l = await stato(page, 'luna');
  const n = unitario(vettoriale(differenza(l.r, t.r), differenza(l.v, t.v)));
  // Camera lungo il polo dell'orbita: orbita quasi circolare sullo schermo, Luna al centro.
  await page.evaluate((p) => window.__ssTest!.posa(p, [0, 0, 0]), n.map((x) => x * 1.6e6));
  for (const selezionata of [true, false]) {
    await page.evaluate((s) => window.__ssTest!.seleziona(s ? 'luna' : null), selezionata);
    await attendiQuiete(page);
    const righe = await profiloOrbita(page, 'terra', 'luna');
    // Arco: entro 3°-9° dalla Luna (ε > 10° per 'indicativa', fuori dall'anello di selezione); fuori: oltre 100°.
    const arco = sintesi(righe.filter((r) => Math.abs(r.dTh) >= 3 && Math.abs(r.dTh) <= 9));
    const fuori = sintesi(righe.filter((r) => Math.abs(r.dTh) >= 100));
    const nota = `${selezionata ? 'selezionata' : 'non selezionata'}: arco ${JSON.stringify(arco)}, fuori ${JSON.stringify(fuori)}`;
    test.info().annotations.push({ type: 'arco', description: nota });
    expect(arco.n, nota).toBeGreaterThan(30);
    expect(fuori.n, nota).toBeGreaterThan(100);
    // Orbita tratteggiata, arco continuo.
    expect(fuori.copertura, nota).toBeLessThan(0.8);
    expect(arco.copertura, nota).toBeGreaterThan(0.97);
    // Arco più largo dell'orbita: almeno 1,5 volte i pixel accesi e l'intensità per raggio.
    expect(arco.larghezza / fuori.larghezza, nota).toBeGreaterThan(1.5);
    expect(arco.somma / fuori.somma, nota).toBeGreaterThan(1.5);
  }
});
