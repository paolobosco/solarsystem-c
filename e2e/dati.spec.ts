// Verifica e scaricamento dei dati sull'applicazione reale (§ 5.6, § 11.11, A19; I9):
// - contesto non sicuro (pagina in HTTP da un host non locale), dove crypto.subtle manca: avvio completo con lo
//   SHA-256 calcolato in JavaScript;
// - cache HTTP con nomi stabili: versioni precedenti di catalog.json e di un blocco nella cache del browser,
//   scaricate di nuovo dal server senza errori; manifest.json rivalidato a ogni avvio;
// - richiesta senza risposta: dopo 30 s messaggio con "Riprova", all'avvio e per il blocco della data iniziale;
//   "Riprova" carica i dati e la mappa si disegna.
// Data iniziale nel blocco 5 (orologio di sistema spostato): un solo blocco voluto, lontano dai confini.

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { B, T0, apri, attendiQuiete, chiudiBenvenuto, instradaFont, registra, stato, verificaPulita } from './aiuti';

const DIST = fileURLToPath(new URL('../dist-test/', import.meta.url));
/** Centro del blocco 5 (4996 a.C.-3996 a.C.). */
const JD_BLOCCO_5 = T0 + 5.5 * B;
const PERIODO_5 = 'Impossibile caricare i dati per il periodo 4996 a.C.-3996 a.C.';

/** Orologio di sistema al centro del blocco 5. */
async function orologioNelBlocco5(page: Page): Promise<void> {
  await page.addInitScript((ms) => {
    const ora = Date.now.bind(Date);
    const scarto = ms - ora();
    Date.now = () => ora() + scarto;
  }, (JD_BLOCCO_5 - 2_440_587.5) * 86_400_000);
}

/** Messaggi d'errore dei blocchi e di moon.bin. */
const avvisi = (page: Page) => page.locator('.ss-avvisi-elenco .ss-avviso--errore', { hasText: /Impossibile caricare i dati/ });

test.describe('verifica dei dati senza crypto.subtle (§ 5.6, I9)', () => {
  test('contesto non sicuro: avvio completo e dati verificati con lo SHA-256 in JavaScript', async ({ page }) => {
    await orologioNelBlocco5(page);
    await page.addInitScript(() => {
      // Come in una pagina servita in HTTP da un host non locale: l'attributo è [SecureContext].
      Object.defineProperty(Crypto.prototype, 'subtle', { configurable: true, get: () => undefined });
    });
    const a = await apri(page);
    expect(await page.evaluate(() => typeof crypto.subtle)).toBe('undefined');
    for (const slug of ['sole', 'terra', 'marte', 'giove']) expect((await stato(page, slug)).stato, slug).toBe('ok');
    await expect(avvisi(page)).toHaveCount(0);
    expect(a.dati).toEqual(expect.arrayContaining(['manifest.json', 'catalog.json', 'time.json', 'planets/p05.bin', 'moon.bin']));
    verificaPulita(a);
  });
});

interface Servitore {
  origine: string;
  /** Richieste ricevute per percorso, con l'intestazione Cache-Control (vuota se assente). */
  richieste: Map<string, string[]>;
  chiudi: () => Promise<void>;
}

const TIPI: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serve dist-test/ come un host statico con cache HTTP sui dati (Cache-Control: max-age=3600, nomi stabili).
 * Alla prima richiesta dei percorsi in `vecchi` risponde con una versione precedente (un byte diverso); poi
 * con il file corrente. index.html senza i collegamenti a Google Fonts: la prova non usa page.route, che
 * disattiva la cache HTTP del browser.
 */
async function servitore(vecchi: ReadonlySet<string>): Promise<Servitore> {
  const richieste = new Map<string, string[]>();
  const server = createServer((req, res) => {
    void (async () => {
      const percorso = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      const elenco = richieste.get(percorso) ?? [];
      elenco.push(String(req.headers['cache-control'] ?? ''));
      richieste.set(percorso, elenco);
      const file = normalize(join(DIST, percorso === '/' ? 'index.html' : percorso));
      if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      let corpo: Buffer;
      try {
        corpo = await readFile(file);
      } catch {
        res.writeHead(404).end();
        return;
      }
      if (percorso === '/') corpo = Buffer.from(corpo.toString('utf8').replace(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, ''));
      if (vecchi.has(percorso) && elenco.length === 1) {
        corpo = Buffer.from(corpo);
        const i = Math.min(4096, corpo.length - 2);
        corpo[i] = corpo[i]! ^ 0x01;
      }
      res.writeHead(200, {
        'content-type': TIPI[extname(file)] ?? 'application/octet-stream',
        'content-length': corpo.length,
        'cache-control': percorso.startsWith('/data/') ? 'public, max-age=3600' : 'no-store',
      });
      res.end(corpo);
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const porta = (server.address() as AddressInfo).port;
  return {
    origine: `http://127.0.0.1:${porta}`,
    richieste,
    chiudi: () => new Promise<void>((r) => server.close(() => r())),
  };
}

test.describe('cache HTTP dei dati (§ 5.6, A19)', () => {
  test('versioni precedenti nella cache del browser: scaricate di nuovo dal server, nessun errore; manifest rivalidato', async ({ page }) => {
    const s = await servitore(new Set(['/data/v1/catalog.json', '/data/v1/planets/p05.bin']));
    try {
      await orologioNelBlocco5(page);
      const a = registra(page, s.origine);
      const conta = (p: string) => s.richieste.get(`/data/v1/${p}`) ?? [];
      await page.goto(`${s.origine}/`);
      await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
      await attendiQuiete(page);
      // catalog.json e il blocco della data iniziale: seconda richiesta che scavalca la cache (cache: 'reload').
      expect(conta('catalog.json')).toEqual(['', 'no-cache']);
      expect(conta('planets/p05.bin')).toEqual(['', 'no-cache']);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(avvisi(page)).toHaveCount(0);
      expect((await stato(page, 'marte')).stato).toBe('ok');
      // Nuovo avvio: manifest.json richiesto di nuovo nonostante max-age; i file corretti vengono dalla cache.
      await page.goto(`${s.origine}/`);
      await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
      await attendiQuiete(page);
      expect(conta('manifest.json').length).toBe(2);
      expect(conta('catalog.json').length).toBe(2);
      expect(conta('planets/p05.bin').length).toBe(2);
      await expect(avvisi(page)).toHaveCount(0);
      expect((await stato(page, 'marte')).stato).toBe('ok');
      verificaPulita(a);
    } finally {
      await s.chiudi();
    }
  });
});

test.describe('richieste senza risposta (§ 5.6, § 11.11, A19)', () => {
  test('dopo 30 s messaggio con "Riprova" per i dati di base e per il blocco della data iniziale; "Riprova" carica', async ({ page }) => {
    test.setTimeout(240_000);
    await orologioNelBlocco5(page);
    const richieste = { catalogo: 0, blocco: 0 };
    // Prima richiesta senza risposta (connessione aperta, nessun byte), le successive normali.
    await page.route(/\/data\/v1\/catalog\.json$/, async (route) => {
      if (++richieste.catalogo === 1) return new Promise<void>(() => undefined);
      await route.continue();
    });
    await page.route(/\/data\/v1\/planets\/p05\.bin$/, async (route) => {
      if (++richieste.blocco === 1) return new Promise<void>(() => undefined);
      await route.continue();
    });
    await instradaFont(page.context());
    const a = registra(page, new URL(test.info().project.use.baseURL ?? 'http://localhost').origin);
    await page.goto('/');
    // Avvio: dati di base.
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Impossibile caricare i dati di base della mappa.', { timeout: 60_000 });
    await alert.getByRole('button', { name: 'Riprova' }).click();
    await page.waitForFunction(() => window.__ssTest !== undefined, null, { timeout: 90_000 });
    expect(richieste.catalogo).toBe(2);
    // Blocco della data iniziale: errore con "Riprova" invece di "Caricamento" senza fine.
    await expect(avvisi(page)).toContainText(PERIODO_5, { timeout: 60_000 });
    await expect(page.locator('.ss-caricamento')).toBeHidden();
    expect((await stato(page, 'marte')).stato).toBe('caricamento');
    await chiudiBenvenuto(page);
    await avvisi(page).filter({ hasText: PERIODO_5 }).getByRole('button', { name: 'Riprova' }).click();
    // waitIdle richiede anche un frame disegnato: il primo frame è abilitato.
    await attendiQuiete(page);
    expect(richieste.blocco).toBe(2);
    expect((await stato(page, 'marte')).stato).toBe('ok');
    await expect(avvisi(page)).toHaveCount(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    verificaPulita(a);
  });
});
