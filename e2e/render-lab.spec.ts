// Prove end-to-end del rendering sulla pagina di sviluppo render-lab.html (SwiftShader, WebGL2):
// A20 (oscillazione a 10 km da Itokawa, occlusione Luna-Terra e Io-Giove, silhouette degli
// impostori), contesto perso e ripristinato, selezione, tempo per frame (A21, solo registrato),
// anelli di Saturno (linee dietro l'anello, profilo sotto il pixel), rotella sulle etichette, cambio
// della densità dei pixel, schermate in test-results/rendering/. Eseguita con
// tests/render/playwright.render.config.ts.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CARTELLA = fileURLToPath(new URL('../test-results/rendering/', import.meta.url));

interface Pixel {
  larghezza: number;
  altezza: number;
  pixelRatio: number;
  dati: number[];
}

/** Ganci window.__lab (src/dev/renderLab.ts). */
interface LabE2e {
  scena: {
    completaTransizione(): void;
    statistiche(): { cpuMs: number; cpuMediaMs: number; frameMs: number; frame: number };
    readonly contestoPerso: boolean;
    infoCorpo(ssid: number): { occluso: boolean; visibile: boolean } | null;
    impostaLivelli(l: Record<string, boolean>): void;
  };
  ssid(slug: string): number;
  impostaJd(jd: number): void;
  jd(): number;
  riproduci(v: number): void;
  fuoco(slug: string, opz?: unknown): void;
  preset(id: string): void;
  seleziona(slug: string | null): void;
  livelli(l: Record<string, boolean>): void;
  livelloForzato(slug: string, l: string | null): void;
  rotazioniFisse(v: boolean): void;
  posa(p: number[], b: number[]): void;
  escludi(s: string[]): void;
  attendiQuiete(t?: number): Promise<void>;
  pixel(x: number, y: number, w: number, h: number): Pixel;
  posizione(slug: string): { x: number; y: number; visibile: boolean } | null;
  perdiContesto(): boolean;
  ripristinaContesto(): boolean;
  selezioni: { ssid: number | null; origine: string }[];
  pannello(v: boolean): void;
  relativo(a: string, b: string): number[];
  dentroAnalitico(slug: string, x: number, y: number): boolean;
  pianoAnelli(x: number, y: number): { r: number; mu: number; sAsse: number; nord: boolean } | null;
  raggi(slug: string): number[] | null;
  vista(): { distanzaKm: number };
}

declare const window: Window & { __lab: LabE2e };

const SOLO_CORPI = {
  stelle: false,
  etichette: false,
  marcatori: false,
  orbite: false,
  anelliDistanza: false,
  anelliPlanetari: false,
  grigliaEclittica: false,
};

async function apri(page: Page): Promise<void> {
  await page.goto('/render-lab.html?senzaPannello');
  await page.waitForFunction(() => window.__lab !== undefined, null, { timeout: 30_000 });
  await quiete(page);
}

async function quiete(page: Page): Promise<void> {
  await page.evaluate(() => window.__lab.attendiQuiete(60_000));
}

async function schermata(page: Page, nome: string): Promise<void> {
  mkdirSync(CARTELLA, { recursive: true });
  await page.screenshot({ path: `${CARTELLA}${nome}.png` });
}

function somma(p: Pixel, i: number): number {
  return p.dati[4 * i]! + p.dati[4 * i + 1]! + p.dati[4 * i + 2]!;
}

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'render-lab', 'pagina di sviluppo: tests/render/playwright.render.config.ts');
});

test('schermate di riferimento', async ({ page }) => {
  await apri(page);
  await schermata(page, '01-sistema-interno');
  const viste: [string, string][] = [
    ['terra-luna', '02-terra-luna'],
    ['sistema-giove', '03-sistema-giove'],
    ['pianeti-giganti', '04-pianeti-giganti'],
  ];
  for (const [preset, nome] of viste) {
    await page.evaluate((p) => {
      window.__lab.preset(p);
      window.__lab.scena.completaTransizione();
    }, preset);
    await quiete(page);
    await schermata(page, nome);
  }
  const vicino: [string, unknown, string][] = [
    ['saturno', { transizione: false, inquadratura: { estensioneKm: 4.2e5 } }, '05-saturno-anelli'],
    ['urano', { transizione: false, inquadratura: { estensioneKm: 3e5 } }, '06-urano-anelli'],
    ['terra', { transizione: false, inquadratura: 'corpo' }, '07-terra-terminatore'],
    ['sole', { transizione: false, inquadratura: 'corpo' }, '08-sole-alone'],
    ['itokawa', { transizione: false, inquadratura: { estensioneKm: 8 } }, '09-itokawa-10-km'],
  ];
  for (const [slug, opz, nome] of vicino) {
    await page.evaluate(([s, o]) => window.__lab.fuoco(s as string, o), [slug, opz] as const);
    await quiete(page);
    await schermata(page, nome);
  }
  // Griglia dell'eclittica, assi di rotazione ed eclittica della data.
  await page.evaluate(() => {
    const l = window.__lab;
    l.livelli({ grigliaEclittica: true });
    l.preset('sistema-interno');
    l.scena.completaTransizione();
  });
  await quiete(page);
  await schermata(page, '10-griglia-eclittica');
  await page.evaluate(() => {
    const l = window.__lab;
    l.livelli({ grigliaEclittica: false, assiRotazione: true, eclitticaData: true });
    l.impostaJd(-1_000_000.5); // anno -7450 circa: eclittica della data inclinata di oltre 1°
    // Camera bassa sull'eclittica: il cerchio dell'eclittica della data attraversa la vista.
    l.fuoco('giove', { transizione: false, inquadratura: 'sistema', elevazione: 0.12, vistaSistema: false });
  });
  await quiete(page);
  await schermata(page, '11-assi-eclittica-data');
  // Affidabilità: orbita tratteggiata, arco d'incertezza e marcatore cavo (§ 7.8.2).
  await page.evaluate(() => {
    const l = window.__lab;
    l.livelli({ assiRotazione: false, eclitticaData: false });
    l.impostaJd(2_461_331.5);
    l.livelloForzato('1p-halley', 'indicativa');
    l.livelloForzato('c1995-o1-hale-bopp', 'non-determinabile');
    l.seleziona('1p-halley');
    l.preset('pianeti-giganti');
    l.scena.completaTransizione();
  });
  await quiete(page);
  await schermata(page, '12-halley-indicativa');
  // Antialiasing temporale: 1 anno/s con fuoco sulla Terra.
  await page.evaluate(() => {
    const l = window.__lab;
    l.livelloForzato('1p-halley', null);
    l.livelloForzato('c1995-o1-hale-bopp', null);
    l.seleziona('terra');
    l.preset('terra-luna');
    l.scena.completaTransizione();
    l.riproduci(365.25);
  });
  await page.waitForTimeout(2000);
  const stat = await page.evaluate(() => window.__lab.scena.statistiche());
  test.info().annotations.push({ type: 'tempo per frame (SwiftShader)', description: JSON.stringify(stat) });
  const info = await page.evaluate(() => window.__lab.scena.infoCorpo(window.__lab.ssid('luna')));
  expect(info).not.toBeNull();
  await schermata(page, '13-riproduzione-rapida');
  await page.evaluate(() => window.__lab.riproduci(0));
  // Telefono: 400 × 800.
  await page.setViewportSize({ width: 400, height: 800 });
  await page.evaluate(() => {
    window.__lab.preset('sistema-interno');
    window.__lab.scena.completaTransizione();
  });
  await quiete(page);
  await schermata(page, '14-telefono-400');
});

test('A20: oscillazione inferiore a 0,1 px a 10 km da Itokawa', async ({ page }) => {
  await apri(page);
  await page.evaluate((l0) => {
    const l = window.__lab;
    l.livelli(l0);
    l.rotazioniFisse(true);
    l.fuoco('itokawa', { transizione: false });
    // Camera a 10 km dal centro, 30° sopra l'eclittica.
    l.posa([0, -10 * Math.cos(Math.PI / 6), 10 * Math.sin(Math.PI / 6)], [0, 0, 0]);
  }, SOLO_CORPI);
  await quiete(page);
  const jd0 = await page.evaluate(() => window.__lab.jd());
  const misure = await page.evaluate((jd) => {
    const l = window.__lab;
    const out: { cx: number; cy: number; n: number; linea: number }[] = [];
    for (let k = 0; k < 24; k++) {
      // Passi di un minuto: Itokawa percorre circa 1500 km per passo.
      l.impostaJd(jd + k / 1440);
      l.livelli({ orbite: false });
      const p = l.pixel(540, 300, 200, 200);
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let y = 0; y < p.altezza; y++) {
        for (let x = 0; x < p.larghezza; x++) {
          const i = 4 * (y * p.larghezza + x);
          const w = Math.max(0, p.dati[i]! + p.dati[i + 1]! + p.dati[i + 2]! - 60);
          sx += w * (x + 0.5);
          sy += w * (y + 0.5);
          sw += w;
        }
      }
      // Orbita: retta x = a + b·y adattata ai baricentri della linea in 120 righe (y 60..300),
      // valutata a y = 150. La media su più righe elimina la quantizzazione del multicampionamento.
      l.livelli({ orbite: true });
      const c = l.pixel(0, 60, 1280, 240);
      let n = 0;
      let sy0 = 0;
      let sx0 = 0;
      let syy = 0;
      let sxy = 0;
      for (let y = 0; y < c.altezza; y += 2) {
        let ly = 0;
        let lw = 0;
        for (let x = 0; x < c.larghezza; x++) {
          const i = 4 * (y * c.larghezza + x);
          const w = Math.max(0, c.dati[i]! + c.dati[i + 1]! + c.dati[i + 2]! - 40);
          ly += w * (x + 0.5);
          lw += w;
        }
        if (lw <= 0) continue;
        const xc = ly / lw;
        const yc = 60 + y + 0.5;
        n++;
        sy0 += yc;
        sx0 += xc;
        syy += yc * yc;
        sxy += xc * yc;
      }
      const b = (n * sxy - sy0 * sx0) / (n * syy - sy0 * sy0);
      const a = (sx0 - b * sy0) / n;
      const linea = n > 50 ? a + b * 150 : Number.NaN;
      out.push({ cx: sx / sw, cy: sy / sw, n: sw, linea });
    }
    return out;
  }, jd0);
  // Oscillazione tra frame: escursione dei residui rispetto all'andamento lineare nel tempo
  // (il moto lungo l'orbita ruota lentamente la tangente: deriva regolare, non oscillazione).
  const oscillazione = (v: number[]): number => {
    const n = v.length;
    const mk = (n - 1) / 2;
    const mv = v.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    v.forEach((y, k) => {
      num += (k - mk) * (y - mv);
      den += (k - mk) * (k - mk);
    });
    const b = num / den;
    const r = v.map((y, k) => y - (mv + b * (k - mk)));
    return Math.max(...r) - Math.min(...r);
  };
  expect(misure[0]!.n).toBeGreaterThan(1000);
  const ex = oscillazione(misure.map((m) => m.cx));
  const ey = oscillazione(misure.map((m) => m.cy));
  test.info().annotations.push({ type: 'oscillazione impostore (px)', description: `${ex.toFixed(4)}, ${ey.toFixed(4)}` });
  expect(ex).toBeLessThan(0.1);
  expect(ey).toBeLessThan(0.1);
  const linee = misure.map((m) => m.linea);
  expect(linee.every((v) => Number.isFinite(v))).toBe(true);
  const el = oscillazione(linee);
  const deriva = Math.abs(linee[linee.length - 1]! - linee[0]!);
  test.info().annotations.push({ type: 'oscillazione orbita (px)', description: `${el.toFixed(4)} (deriva regolare ${deriva.toFixed(4)})` });
  expect(el).toBeLessThan(0.1);
  await schermata(page, '15-itokawa-stabilita');
});

async function provaOcclusione(page: Page, pianeta: string, luna: string, distanza: number, nome: string): Promise<void> {
  await page.evaluate(
    ([p, s, d, l0]) => {
      const l = window.__lab;
      l.escludi([]);
      l.livelli(l0 as Record<string, boolean>);
      l.fuoco(p as string, { transizione: false });
      const u = l.relativo(p as string, s as string);
      const n = Math.hypot(u[0]!, u[1]!, u[2]!);
      const k = -(d as number) / n;
      l.posa([u[0]! * k, u[1]! * k, u[2]! * k], [0, 0, 0]);
    },
    [pianeta, luna, distanza, SOLO_CORPI] as const,
  );
  await quiete(page);
  const pos = await page.evaluate((s) => window.__lab.posizione(s), luna);
  expect(pos).not.toBeNull();
  expect(pos!.visibile).toBe(false);
  const x = Math.round(pos!.x) - 1;
  const y = Math.round(pos!.y) - 1;
  const leggi = (esclusi: string[]): Promise<Pixel> =>
    page.evaluate(
      ([e, xx, yy]) => {
        window.__lab.escludi(e as string[]);
        return window.__lab.pixel(xx as number, yy as number, 3, 3);
      },
      [esclusi, x, y] as const,
    );
  const con = await leggi([]);
  const senza = await leggi([luna]);
  const soloLuna = await leggi([pianeta]);
  const vuoto = await leggi([pianeta, luna]);
  let diffOcclusa = 0;
  let diffControllo = 0;
  for (let i = 0; i < 9; i++) {
    diffOcclusa = Math.max(diffOcclusa, Math.abs(somma(con, i) - somma(senza, i)));
    diffControllo = Math.max(diffControllo, Math.abs(somma(soloLuna, i) - somma(vuoto, i)));
  }
  test.info().annotations.push({ type: `occlusione ${luna}`, description: `differenza ${diffOcclusa}, controllo ${diffControllo}` });
  // Con il pianeta davanti la luna non cambia alcun pixel; senza pianeta è visibile.
  expect(diffOcclusa).toBeLessThanOrEqual(3);
  expect(diffControllo).toBeGreaterThan(15);
  await page.evaluate(() => window.__lab.escludi([]));
  await page.evaluate(() => window.__lab.livelli({ marcatori: true }));
  await quiete(page);
  const info = await page.evaluate((s) => window.__lab.scena.infoCorpo(window.__lab.ssid(s)), luna);
  expect(info!.occluso).toBe(true);
  await quiete(page);
  await schermata(page, nome);
}

test('A20: occlusione della Luna dietro la Terra e di Io dietro Giove', async ({ page }) => {
  await apri(page);
  await provaOcclusione(page, 'terra', 'luna', 1e5, '16-occlusione-luna');
  await provaOcclusione(page, 'giove', 'io', 3e5, '17-occlusione-io');
});

test('A20: silhouette degli impostori entro 0,5 px a quota 0,01 R', async ({ page }) => {
  await apri(page);
  for (const slug of ['terra', 'giove']) {
    const esito = await page.evaluate(
      ([s, l0]) => {
        const l = window.__lab;
        l.livelli(l0 as Record<string, boolean>);
        l.rotazioniFisse(true);
        l.fuoco(s as string, { transizione: false });
        const r = l.raggi(s as string)!;
        const rmax = Math.max(...r);
        // Camera sopra il punto subsolare a quota 0,01 R (lato illuminato), sguardo all'orizzonte.
        const u = l.relativo(s as string, 'sole');
        const n = Math.hypot(u[0]!, u[1]!, u[2]!);
        const su = [u[0]! / n, u[1]! / n, u[2]! / n];
        const d = 1.0105 * rmax;
        const cam = [su[0]! * d, su[1]! * d, su[2]! * d];
        // Orizzontale: z × su; abbassata dell'angolo di depressione dell'orizzonte.
        let h = [-su[1]!, su[0]!, 0];
        const nh = Math.hypot(h[0]!, h[1]!);
        h = [h[0]! / nh, h[1]! / nh, 0];
        const dip = Math.acos(rmax / d);
        const dir = [h[0]! * Math.cos(dip) - su[0]! * Math.sin(dip), h[1]! * Math.cos(dip) - su[1]! * Math.sin(dip), -su[2]! * Math.sin(dip)];
        l.posa(cam, [cam[0]! + dir[0]! * 1e5, cam[1]! + dir[1]! * 1e5, cam[2]! + dir[2]! * 1e5]);
        return { rmax };
      },
      [slug, SOLO_CORPI] as const,
    );
    expect(esito.rmax).toBeGreaterThan(0);
    await quiete(page);
    const risultato = await page.evaluate((s) => {
      const l = window.__lab;
      const errori: number[] = [];
      for (let y = 20; y < 800; y += 40) {
        const a = l.dentroAnalitico(s, 0.5, y + 0.5);
        const b = l.dentroAnalitico(s, 1279.5, y + 0.5);
        if (a === b) continue;
        // Bordo analitico per bisezione (Float64).
        let x0 = 0.5;
        let x1 = 1279.5;
        for (let k = 0; k < 50; k++) {
          const xm = 0.5 * (x0 + x1);
          if (l.dentroAnalitico(s, xm, y + 0.5) === a) x0 = xm;
          else x1 = xm;
        }
        const xe = 0.5 * (x0 + x1);
        const riga = l.pixel(0, y, 1280, 1);
        const pianeta = (i: number): boolean => riga.dati[4 * i]! + riga.dati[4 * i + 1]! + riga.dati[4 * i + 2]! > 80;
        // Transizione disegnata più vicina al bordo analitico.
        let migliore = Number.POSITIVE_INFINITY;
        for (let i = 1; i < riga.larghezza; i++) {
          if (pianeta(i) === pianeta(i - 1)) continue;
          // Centri dei pixel i - 1 e i: il bordo analitico deve stare tra i - 0,5 e i + 0,5.
          const lo = i - 0.5;
          const hi = i + 0.5;
          const err = xe < lo ? lo - xe : xe > hi ? xe - hi : 0;
          migliore = Math.min(migliore, err);
        }
        errori.push(migliore);
      }
      return errori;
    }, slug);
    expect(risultato.length).toBeGreaterThan(5);
    const max = Math.max(...risultato);
    test.info().annotations.push({ type: `silhouette ${slug} (px)`, description: `${risultato.length} righe, errore massimo ${max.toFixed(3)}` });
    expect(max).toBeLessThan(0.5);
    await schermata(page, `18-silhouette-${slug}`);
  }
});

test('contesto WebGL perso e ripristinato (R13)', async ({ page }) => {
  await apri(page);
  await page.evaluate(() => window.__lab.fuoco('terra', { transizione: false, inquadratura: 'corpo' }));
  await quiete(page);
  const prima = await page.evaluate(() => window.__lab.pixel(630, 390, 20, 20));
  const media = (p: Pixel): number => {
    let s = 0;
    for (let i = 0; i < p.larghezza * p.altezza; i++) s += somma(p, i);
    return s / (p.larghezza * p.altezza);
  };
  expect(media(prima)).toBeGreaterThan(60);
  expect(await page.evaluate(() => window.__lab.perdiContesto())).toBe(true);
  await page.waitForFunction(() => window.__lab.scena.contestoPerso);
  // Durante la pausa le etichette sono nascoste: non seguirebbero più la data (R13).
  const etichetteVisibili = (): Promise<number> =>
    page.evaluate(() => [...document.querySelectorAll('.ss-etichetta')].filter((e) => getComputedStyle(e).visibility === 'visible').length);
  expect(await etichetteVisibili()).toBe(0);
  await page.evaluate(() => window.__lab.impostaJd(window.__lab.jd() + 1));
  expect(await etichetteVisibili()).toBe(0);
  expect(await page.evaluate(() => window.__lab.ripristinaContesto())).toBe(true);
  await page.waitForFunction(() => !window.__lab.scena.contestoPerso);
  await page.evaluate(() => window.__lab.impostaJd(window.__lab.jd() - 1));
  await quiete(page);
  expect(await etichetteVisibili()).toBeGreaterThan(0);
  const dopo = await page.evaluate(() => window.__lab.pixel(630, 390, 20, 20));
  expect(Math.abs(media(dopo) - media(prima))).toBeLessThan(3);
  await schermata(page, '19-contesto-ripristinato');
});

test('selezione: clic sul marcatore entro 12 px e sull\'etichetta', async ({ page }) => {
  await apri(page);
  const marte = await page.evaluate(() => window.__lab.posizione('marte'));
  expect(marte!.visibile).toBe(true);
  await page.mouse.click(marte!.x + 9, marte!.y + 2);
  await expect.poll(() => page.evaluate(() => window.__lab.selezioni.at(-1)?.ssid)).toBe(await page.evaluate(() => window.__lab.ssid('marte')));
  await page.mouse.click(marte!.x + 20, marte!.y + 20);
  const venere = page.locator(`.ss-etichetta[data-ssid="${await page.evaluate(() => window.__lab.ssid('venere'))}"]`);
  await expect(venere).toBeVisible();
  await venere.click();
  const ultima = await page.evaluate(() => window.__lab.selezioni.at(-1));
  expect(ultima!.origine).toBe('etichetta');
  expect(ultima!.ssid).toBe(await page.evaluate(() => window.__lab.ssid('venere')));
  await quiete(page);
  await schermata(page, '20-selezione-venere');
});

/** Saturno il 16/10/2017 visto dalla direzione della Terra a 600 000 km (anelli aperti di circa 27°), solo anelli. */
async function saturno2017(page: Page, distanzaKm = 600_000): Promise<void> {
  await page.evaluate((d) => {
    const l = window.__lab;
    l.impostaJd(2_458_042.5);
    l.seleziona(null);
    l.livelli({
      stelle: false,
      etichette: false,
      marcatori: false,
      orbite: false,
      anelliDistanza: false,
      grigliaEclittica: false,
      eclitticaData: false,
      assiRotazione: false,
      anelliPlanetari: true,
    });
    l.fuoco('saturno', { transizione: false });
    const u = l.relativo('saturno', 'terra');
    const n = Math.hypot(u[0]!, u[1]!, u[2]!);
    l.posa(u.map((x) => (x / n) * d), [0, 0, 0]);
  }, distanzaKm);
  await quiete(page);
}

test('anelli di Saturno: assi e orbite dietro l\'anello B attenuati dalla sua trasmissione (R7)', async ({ page }) => {
  await apri(page);
  await saturno2017(page);
  const r = await page.evaluate(() => {
    const l = window.__lab;
    const c = l.posizione('saturno')!;
    const x0 = Math.max(0, Math.round(c.x - 260));
    const y0 = Math.max(0, Math.round(c.y - 260));
    const leggi = (assi: boolean, anelli: boolean) => {
      l.livelli({ assiRotazione: assi, anelliPlanetari: anelli });
      return l.pixel(x0, y0, 520, 520);
    };
    const A = leggi(true, true);
    const B = leggi(false, true);
    const C = leggi(true, false);
    const D = leggi(false, false);
    const diff = (p: { dati: number[] }, q: { dati: number[] }, i: number): number =>
      Math.abs(p.dati[4 * i]! - q.dati[4 * i]!) + Math.abs(p.dati[4 * i + 1]! - q.dati[4 * i + 1]!) + Math.abs(p.dati[4 * i + 2]! - q.dati[4 * i + 2]!);
    let n = 0;
    let entro = 0;
    let scarto = 0;
    let nord = true;
    for (let j = 0; j < A.altezza; j++) {
      for (let i = 0; i < A.larghezza; i++) {
        const k = j * A.larghezza + i;
        const linea = diff(C, D, k);
        if (linea < 60) continue;
        const x = x0 + i + 0.5;
        const y = y0 + j + 0.5;
        const g = l.pianoAnelli(x, y);
        // Asse sud (dietro il piano visto da nord) sopra l'anello B, fuori dal disco e lontano dai bordi delle
        // fasce di FASCE_SATURNO (B interno τ 1, centrale τ 2,5, esterno τ 1,6).
        if (!g || g.sAsse >= 0 || l.dentroAnalitico('saturno', x, y)) continue;
        const tau = g.r > 92_500 && g.r < 98_500 ? 1 : g.r > 99_500 && g.r < 109_500 ? 2.5 : g.r > 110_500 && g.r < 117_000 ? 1.6 : 0;
        if (tau === 0) continue;
        nord = nord && g.nord;
        n++;
        const ab = diff(A, B, k);
        scarto += ab;
        if (ab <= Math.exp(-tau / g.mu) * linea + 12) entro++;
      }
    }
    return { n, entro, scartoMedio: n > 0 ? scarto / n : 0, nord };
  });
  expect(r.nord).toBe(true);
  expect(r.n, JSON.stringify(r)).toBeGreaterThanOrEqual(10);
  expect(r.entro / r.n).toBeGreaterThanOrEqual(0.9);
  expect(r.scartoMedio).toBeLessThan(12);
  await page.evaluate(() => window.__lab.livelli({ assiRotazione: true, orbite: true, anelliPlanetari: true }));
  await quiete(page);
  await schermata(page, '21-saturno-linee-dietro-anelli');
});

test('anelli di Saturno: lacune e bordi sotto il pixel stabili al variare della distanza dello 0,1% (R7)', async ({ page }) => {
  await apri(page);
  const leggi = async (d: number) => {
    await saturno2017(page, d);
    return page.evaluate(() => {
      const l = window.__lab;
      const c = l.posizione('saturno')!;
      return { x0: Math.round(c.x - 260), y0: Math.round(c.y - 260), p: l.pixel(Math.round(c.x - 260), Math.round(c.y - 260), 520, 520) };
    });
  };
  const a = await leggi(600_000);
  const b = await leggi(600_600);
  expect(b.x0).toBe(a.x0);
  expect(b.y0).toBe(a.y0);
  const r = await page.evaluate(
    ({ x0, y0, pa, pb }) => {
      const l = window.__lab;
      let n = 0;
      let salti = 0;
      const dettagli: string[] = [];
      for (let j = 0; j < 520; j++) {
        for (let i = 0; i < 520; i++) {
          const x = x0 + i + 0.5;
          const y = y0 + j + 0.5;
          const g = l.pianoAnelli(x, y);
          // Anello A con le divisioni di Encke (322 km) e Keeler (42 km): circa 1200 km per pixel in senso radiale.
          // Esclusi i pixel entro 2 px dal disco, il cui bordo si sposta con la distanza.
          if (!g || g.r < 120_000 || g.r > 137_500) continue;
          if ([-2, 0, 2].some((dx) => [-2, 0, 2].some((dy) => l.dentroAnalitico('saturno', x + dx, y + dy)))) continue;
          n++;
          const k = 4 * (j * 520 + i);
          const d = Math.abs(pa[k]! - pb[k]!) + Math.abs(pa[k + 1]! - pb[k + 1]!) + Math.abs(pa[k + 2]! - pb[k + 2]!);
          if (d > 120) {
            salti++;
            if (dettagli.length < 20) dettagli.push(`${Math.round(g.r)} km (${i}, ${j}): ${d}`);
          }
        }
      }
      return { n, salti, dettagli };
    },
    { x0: a.x0, y0: a.y0, pa: a.p.dati, pb: b.p.dati },
  );
  expect(r.n).toBeGreaterThan(1000);
  expect(r.salti, r.dettagli.join('; ')).toBeLessThanOrEqual(3);
  await schermata(page, '22-saturno-profilo-mediato');
});

test('rotella sopra un\'etichetta: zoom come sulla canvas (§ 10.3)', async ({ page }) => {
  await apri(page);
  const terra = await page.evaluate(() => window.__lab.ssid('terra'));
  const etichetta = page.locator(`.ss-etichetta[data-ssid="${terra}"]`);
  await expect(etichetta).toBeVisible();
  const box = (await etichetta.boundingBox())!;
  const x = box.x + 8;
  const y = box.y + box.height / 2;
  expect(await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('.ss-etichetta') !== null, [x, y])).toBe(true);
  const d0 = await page.evaluate(() => window.__lab.vista().distanzaKm);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => page.evaluate(() => window.__lab.vista().distanzaKm)).toBeLessThan(0.8 * d0);
  await quiete(page);
  const d1 = await page.evaluate(() => window.__lab.vista().distanzaKm);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.__lab.vista().distanzaKm)).toBeGreaterThan(1.2 * d1);
});

test('cambio della sola densità dei pixel: buffer di disegno aggiornato senza interazione (R12)', async ({ page }) => {
  await apri(page);
  const rapporto = (): Promise<number> =>
    page.evaluate(() => {
      const c = document.getElementById('scena') as HTMLCanvasElement;
      return c.width / c.clientWidth;
    });
  expect(await rapporto()).toBe(1);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await expect.poll(rapporto, { timeout: 5000 }).toBe(2);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await expect.poll(rapporto, { timeout: 5000 }).toBe(1);
});
