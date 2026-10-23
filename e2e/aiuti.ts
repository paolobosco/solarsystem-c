// Funzioni comuni alle prove end-to-end dell'applicazione reale (build di test con window.__ssTest).
// Caratteri di Google Fonts scaricati dal processo di prova (proxy dell'ambiente) o sostituiti da risposte
// vuote senza rete; registro di console, dialog e richieste per A18; schermate in test-results/e2e/ e loro
// decodifica (PNG) per le prove sui pixel dell'interfaccia.

import { mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import type { SsTest } from '../src/test-hooks';

export const CARTELLA = fileURLToPath(new URL('../test-results/e2e/', import.meta.url));
mkdirSync(CARTELLA, { recursive: true });

export const UA = 149_597_870.7;
export const HOST_FONT = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
/** Inizio del blocco 0 e durata di un blocco (§ 8.1). */
export const T0 = -1_931_200.5;
export const B = 365_568;

declare global {
  interface Window {
    __ssTest?: SsTest;
  }
}

export interface StatoCorpo {
  r: number[];
  v: number[];
  stato: string;
  livello: string;
}

const cacheFont = new Map<string, { stato: number; tipo: string; corpo: Buffer } | null>();

/** Instrada le richieste verso Google Fonts attraverso Node; senza rete risponde con un corpo vuoto. */
export async function instradaFont(ctx: BrowserContext): Promise<void> {
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
    if (!v) await route.fulfill({ status: 200, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2', body: '' });
    else await route.fulfill({ status: v.stato, contentType: v.tipo, body: v.corpo, headers: { 'access-control-allow-origin': '*' } });
  });
}

export interface Aperta {
  page: Page;
  /** console.error, console.warn, eccezioni non gestite, dialog. */
  errori: string[];
  /** Richieste verso host diversi dall'origine e da Google Fonts. */
  esterne: string[];
  /** Richieste verso l'origine con query string (RNF7). */
  conQuery: string[];
  /** Percorsi dei dati richiesti, relativi a data/v1/, in ordine. */
  dati: string[];
}

/** Registra console, dialog e richieste della pagina. */
export function registra(page: Page, origine: string): Aperta {
  const a: Aperta = { page, errori: [], esterne: [], conQuery: [], dati: [] };
  page.on('console', (m) => {
    // Avviso di prestazioni del driver dopo una lettura dei pixel richiesta dalla prova (leggiPixel).
    if (m.type() === 'warning' && /GPU stall due to ReadPixels/.test(m.text())) return;
    if (m.type() === 'error' || m.type() === 'warning') a.errori.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => a.errori.push(`eccezione: ${String(e)}`));
  page.on('dialog', (d) => {
    a.errori.push(`dialog: ${d.type()} ${d.message()}`);
    void d.dismiss();
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.protocol.startsWith('http')) return;
    if (u.origin !== origine && !HOST_FONT.has(u.hostname)) a.esterne.push(r.url());
    if (u.origin === origine && u.search !== '') a.conQuery.push(r.url());
    const i = u.pathname.indexOf('/data/v1/');
    if (i >= 0) a.dati.push(u.pathname.slice(i + 9));
  });
  return a;
}

export interface OpzioniApri {
  /** Attende dati, transizioni e primo frame (waitIdle). Predefinito: true. */
  attendi?: boolean;
}

/** Apre l'applicazione e attende i ganci di test. */
export async function apri(page: Page, percorso = '/', opz: OpzioniApri = {}): Promise<Aperta> {
  await instradaFont(page.context());
  const origine = new URL(test.info().project.use.baseURL ?? 'http://localhost').origin;
  const a = registra(page, origine);
  await page.goto(percorso);
  await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
  if (opz.attendi ?? true) await attendiQuiete(page);
  return a;
}

/** Nessun errore o avviso in console, nessun dialog, nessuna richiesta esterna o con query string. */
export function verificaPulita(a: Aperta): void {
  expect(a.errori, 'nessun errore o avviso in console, nessun dialog').toEqual([]);
  expect(a.esterne, 'nessuna richiesta verso host esterni').toEqual([]);
  expect(a.conQuery, 'nessuna query string verso l\'origine').toEqual([]);
}

export async function attendiQuiete(page: Page): Promise<void> {
  await page.evaluate(() => window.__ssTest!.waitIdle());
}

export async function schermata(page: Page, nome: string, attendi = true): Promise<void> {
  if (attendi) await attendiQuiete(page);
  await page.screenshot({ path: `${CARTELLA}${nome}.png` });
}

export function stato(page: Page, slug: string): Promise<StatoCorpo> {
  return page.evaluate((s) => window.__ssTest!.getState(s) as StatoCorpo, slug);
}

export async function stati(page: Page, slug: readonly string[]): Promise<Record<string, StatoCorpo>> {
  const v = await page.evaluate((ss) => ss.map((s) => window.__ssTest!.getState(s)), [...slug]);
  const out: Record<string, StatoCorpo> = {};
  slug.forEach((s, i) => (out[s] = v[i] as StatoCorpo));
  return out;
}

export function tempo(page: Page): Promise<{ jdUT: number; jdTT: number; deltaT: number }> {
  return page.evaluate(() => window.__ssTest!.getTime());
}

export async function impostaJd(page: Page, jdUT: number): Promise<void> {
  await page.evaluate((jd) => window.__ssTest!.setTime(jd), jdUT);
}

export function posizione(page: Page, slug: string): Promise<{ x: number; y: number; visibile: boolean } | null> {
  return page.evaluate((s) => window.__ssTest!.getScreenPosition(s), slug);
}

export async function chiudiBenvenuto(page: Page): Promise<void> {
  const b = page.getByRole('button', { name: 'Chiudi la nota di benvenuto' });
  if (await b.isVisible()) await b.click();
}

export async function preset(page: Page, nome: string): Promise<void> {
  await page.getByRole('button', { name: /Viste/ }).first().click();
  await page.getByRole('button', { name: new RegExp(`^${nome} `) }).first().click();
  await attendiQuiete(page);
}

export async function cerca(page: Page, testo: string): Promise<void> {
  const campo = page.getByRole('combobox', { name: 'Trova' });
  await campo.fill(testo);
  await expect(page.getByRole('listbox')).toBeVisible();
  await campo.press('ArrowDown');
  await campo.press('Enter');
  await attendiQuiete(page);
}

export function distanza(a: readonly number[], b: readonly number[] = [0, 0, 0]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

export function differenza(a: readonly number[], b: readonly number[]): number[] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

export function unitario(a: readonly number[]): number[] {
  const n = distanza(a);
  return [a[0]! / n, a[1]! / n, a[2]! / n];
}

export function scalare(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

export function vettoriale(a: readonly number[], b: readonly number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

/** Angolo tra due vettori (rad), formula stabile con atan2. */
export function angolo(a: readonly number[], b: readonly number[]): number {
  return Math.atan2(distanza(vettoriale(a, b)), scalare(a, b));
}

export const GRADI = 180 / Math.PI;

/** Il test gira solo nel progetto indicato (desktop o mobile). */
export function soloProgetto(nome: 'desktop' | 'mobile'): void {
  test.beforeEach(({ browserName }, info) => {
    test.skip(browserName !== 'chromium' || info.project.name !== nome, `solo nel progetto ${nome}`);
  });
}

/** Decodifica una schermata PNG di Playwright (8 bit, RGB o RGBA, senza interlacciamento). */
export function decodificaPng(buf: Buffer): { w: number; h: number; canali: number; dati: Uint8Array } {
  let p = 8;
  let w = 0;
  let h = 0;
  let tipo = 0;
  const parti: Buffer[] = [];
  while (p < buf.length) {
    const n = buf.readUInt32BE(p);
    const t = buf.toString('ascii', p + 4, p + 8);
    if (t === 'IHDR') {
      w = buf.readUInt32BE(p + 8);
      h = buf.readUInt32BE(p + 12);
      tipo = buf[p + 17]!;
    } else if (t === 'IDAT') parti.push(buf.subarray(p + 8, p + 8 + n));
    p += 12 + n;
  }
  const canali = tipo === 6 ? 4 : 3;
  const grezzi = inflateSync(Buffer.concat(parti));
  const riga = w * canali;
  const dati = new Uint8Array(h * riga);
  for (let y = 0; y < h; y++) {
    const f = grezzi[y * (riga + 1)]!;
    for (let x = 0; x < riga; x++) {
      const v = grezzi[y * (riga + 1) + 1 + x]!;
      const a = x >= canali ? dati[y * riga + x - canali]! : 0;
      const b = y > 0 ? dati[(y - 1) * riga + x]! : 0;
      const c = x >= canali && y > 0 ? dati[(y - 1) * riga + x - canali]! : 0;
      let r = v;
      if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      dati[y * riga + x] = r & 255;
    }
  }
  return { w, h, canali, dati };
}
