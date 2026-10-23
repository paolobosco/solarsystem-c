// Prove grafiche sull'applicazione reale (§ 13, A8 parte grafica e A25), con i pixel letti dalla canvas:
// - Terra: alle 12:00 UT negli anni 1900-2100 la longitudine 0 della texture è rivolta al Sole entro ±5°
//   (A25) e l'angolo orario del Sole è E - 0,9856°·ΔT[d] entro 1° (A8); verso di rotazione antiorario;
// - Luna: rivolge alla Terra lo stesso emisfero, entro la librazione ottica;
// - Urano: anelli nel piano dell'equatore IAU, satelliti nello stesso piano;
// - Marte nel 10000 a.C.: orbite di Fobos e Deimos vicine all'equatore disegnato (piano secolare, § 7.5.4);
// - orbite iperboliche aperte (3I/ATLAS), ellittiche chiuse (1P/Halley); Terra antioraria vista da +z.
// Le texture di Terra e Luna sono sostituite da mappe che codificano longitudine e latitudine nei canali
// rosso e verde (blu costante di riferimento); il manifest servito riporta dimensione e SHA-256 delle
// mappe sostitutive, così l'archivio dei dati le verifica come le originali.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { matriceWgccre } from '../src/ephem/orientation';
import type { CoefficientiWgccre } from '../src/data/catalogTypes';
import { calendarToJd } from '../src/time/calendar';
import {
  GRADI,
  UA,
  angolo,
  apri,
  attendiQuiete,
  differenza,
  distanza,
  impostaJd,
  posizione,
  scalare,
  schermata,
  stati,
  tempo,
  unitario,
  vettoriale,
  verificaPulita,
} from './aiuti';

interface CorpoCat {
  slug: string;
  texture: { file: string; lon0_u: number; verso: 'est' | 'ovest' } | null;
  fisica: { raggi_km: { valore: number[] } | null } | null;
  anelli?: { elementi: { nome: string; rInterno_km: number; rEsterno_km: number }[] };
}

const CATALOGO = JSON.parse(readFileSync(new URL('../public/data/v1/catalog.json', import.meta.url), 'utf-8')) as { corpi: CorpoCat[] };
const corpo = (slug: string): CorpoCat => CATALOGO.corpi.find((c) => c.slug === slug)!;

/** Pendenza della codifica: 6 livelli per grado, 128 = 0°. */
const PENDENZA = 6;

/** Livelli che lasciano sulla canvas solo i corpi (e gli anelli planetari). */
const SOLO_CORPI = { etichette: false, marcatori: false, orbite: false, anelliDistanza: false, stelle: false, grigliaEclittica: false };

// --- Texture codificate ---

async function mappaCodificata(ctx: BrowserContext, lon0u: number, verso: 'est' | 'ovest'): Promise<Buffer> {
  const p = await ctx.newPage();
  const b64 = await p.evaluate(
    async ({ lon0u, verso, pendenza }) => {
      const W = 2048;
      const H = 1024;
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext('2d')!;
      const img = g.createImageData(W, H);
      const segno = verso === 'est' ? 1 : -1;
      for (let y = 0; y < H; y++) {
        const lat = 90 - ((y + 0.5) / H) * 180;
        for (let x = 0; x < W; x++) {
          let lon = ((x + 0.5) / W - lon0u) * 360 * segno;
          lon = ((((lon + 180) % 360) + 360) % 360) - 180;
          const i = 4 * (y * W + x);
          img.data[i] = Math.max(0, Math.min(255, Math.round(128 + pendenza * lon)));
          img.data[i + 1] = Math.max(0, Math.min(255, Math.round(128 + pendenza * lat)));
          img.data[i + 2] = 128;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 1 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { lon0u, verso, pendenza: PENDENZA },
  );
  await p.close();
  return Buffer.from(b64, 'base64');
}

/** Sostituisce le texture indicate, con il manifest aggiornato (dimensione e SHA-256). */
async function sostituisciTexture(ctx: BrowserContext, slug: readonly string[]): Promise<void> {
  const nuove = new Map<string, Buffer>();
  for (const s of slug) {
    const t = corpo(s).texture!;
    nuove.set(t.file, await mappaCodificata(ctx, t.lon0_u, t.verso));
  }
  await ctx.route(/\/data\/v1\/manifest\.json$/, async (route) => {
    const r = await route.fetch();
    const m = (await r.json()) as { file: { percorso: string; byte: number; sha256: string }[] };
    for (const f of m.file) {
      const b = nuove.get(f.percorso);
      if (!b) continue;
      f.byte = b.length;
      f.sha256 = createHash('sha256').update(b).digest('hex');
    }
    await route.fulfill({ response: r, json: m });
  });
  for (const [file, b] of nuove) {
    const re = new RegExp(`/data/v1/${file.replace(/[.]/g, '\\.')}$`);
    await ctx.route(re, (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: b }));
  }
}

const decodifica = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const codifica = (l: number): number => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);

interface Lettura {
  lon: number;
  lat: number;
  rgb: number[];
}

/** Longitudine e latitudine della texture al centro della canvas (media 4 × 4 px), indipendenti dall'illuminazione. */
async function letturaCentro(page: Page): Promise<Lettura> {
  const rgb = await page.evaluate(() => {
    const v = window.__ssTest!.vista()!;
    const p = window.__ssTest!.pixel(v.larghezzaPx / 2 - 2, v.altezzaPx / 2 - 2, 4, 4)!;
    const s = [0, 0, 0];
    const n = p.larghezza * p.altezza;
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s[k]! += p.dati[4 * i + k]!;
    return s.map((x) => x / n);
  });
  const rif = decodifica(128);
  const b = decodifica(rgb[2]!);
  const valore = (c: number): number => (codifica((decodifica(c) / b) * rif) - 128) / PENDENZA;
  return { lon: valore(rgb[0]!), lat: valore(rgb[1]!), rgb };
}

/** Camera a `dist` km dal centro del corpo a fuoco, sulla direzione `u` (eclittica J2000), rivolta al centro. */
async function posa(page: Page, u: readonly number[], dist: number): Promise<void> {
  await page.evaluate(([p]) => window.__ssTest!.posa(p!, [0, 0, 0]), [[u[0]! * dist, u[1]! * dist, u[2]! * dist]]);
}

// --- Riferimenti indipendenti ---

/** Equazione del tempo E (gradi) con il Sole geometrico medio della data (Meeus 1998, eq. 25.2-25.5, 22.2, 28.1). */
function equazioneDelTempo(jdTT: number): number {
  const T = (jdTT - 2_451_545) / 36_525;
  const L0 = 280.46646 + 36_000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35_999.05029 * T - 0.0001537 * T * T) / GRADI;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const lon = (L0 + C) / GRADI;
  const eps = (23.4392911 - 0.0130042 * T) / GRADI;
  const alfa = Math.atan2(Math.cos(eps) * Math.sin(lon), Math.cos(lon)) * GRADI;
  return ((((L0 - alfa + 180) % 360) + 360) % 360) - 180;
}

/** Polo nord IAU di Urano (Archinal et al. 2018: α0 = 257,311°, δ0 = −15,175°) nell'eclittica J2000. */
function poloUrano(): number[] {
  const a = 257.311 / GRADI;
  const d = -15.175 / GRADI;
  const e = 84_381.448 / 3600 / GRADI;
  const x = Math.cos(d) * Math.cos(a);
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  return [x, Math.cos(e) * y + Math.sin(e) * z, -Math.sin(e) * y + Math.cos(e) * z];
}

const jd = (anno: number, mese: number, giorno: number, ora = 12): number =>
  calendarToJd({ anno, mese, giorno, ora, minuto: 0, secondo: 0, calendario: anno < 1582 ? 'giuliano' : 'gregoriano' });

test.describe('A8 e A25: orientamento della Terra e della Luna dalle texture', () => {
  test('Terra: longitudine 0 verso il Sole alle 12:00 UT (1900-2100), angolo orario E entro 1°, rotazione verso est', async ({ page }) => {
    await sostituisciTexture(page.context(), ['terra']);
    const a = await apri(page);
    await page.evaluate(() => window.__ssTest!.seleziona(null));
    await page.evaluate((l) => window.__ssTest!.livelli(l), SOLO_CORPI);
    await page.evaluate(() => window.__ssTest!.focus('terra'));
    const R = corpo('terra').fisica!.raggi_km!.valore[0]!;
    // Date con l'equazione del tempo vicina agli estremi (febbraio, novembre) e distribuite nel periodo.
    const date: [number, number, number][] = [
      [1900, 3, 15],
      [1925, 7, 26],
      [1950, 11, 3],
      [1975, 2, 11],
      [2000, 1, 1],
      [2011, 2, 23],
      [2024, 4, 15],
      [2050, 9, 1],
      [2075, 5, 14],
      [2100, 12, 24],
    ];
    const righe: string[] = [];
    let primo = true;
    for (const [anno, mese, giorno] of date) {
      await impostaJd(page, jd(anno, mese, giorno));
      const s = await stati(page, ['terra']);
      const t = await tempo(page);
      // Camera sulla congiungente Terra-Sole, dal lato del Sole: al centro della canvas il punto subsolare.
      await posa(page, unitario(s['terra']!.r.map((x) => -x)), 4 * R);
      if (primo) {
        await page.evaluate(() => window.__ssTest!.attendiTexture('terra'));
        primo = false;
      }
      const l = await letturaCentro(page);
      // Angolo orario del Sole a Greenwich = − longitudine del punto subsolare.
      const H = -l.lon;
      const atteso = equazioneDelTempo(t.jdTT) - 0.9856 * (t.deltaT / 86_400);
      righe.push(`${anno}-${mese}-${giorno}: λ subsolare ${l.lon.toFixed(2)}°, H ${H.toFixed(2)}°, E ${atteso.toFixed(2)}°, φ ${l.lat.toFixed(2)}°`);
      expect(Math.abs(l.lon), `${anno}-${mese}-${giorno}: longitudine 0 verso il Sole (A25)`).toBeLessThanOrEqual(5);
      expect(Math.abs(H - atteso), `${anno}-${mese}-${giorno}: angolo orario (A8)`).toBeLessThanOrEqual(1);
      // Latitudine del punto subsolare: declinazione del Sole, entro ±23,5°
      expect(Math.abs(l.lat)).toBeLessThan(23.6);
      if (anno === 2024) {
        await schermata(page, 'grafica-01-terra-subsolare', false);
        // Un'ora dopo il punto subsolare si sposta di circa 15° verso ovest (rotazione antioraria vista da nord).
        await impostaJd(page, jd(anno, mese, giorno, 13));
        const s2 = await stati(page, ['terra']);
        await posa(page, unitario(s2['terra']!.r.map((x) => -x)), 4 * R);
        const l2 = await letturaCentro(page);
        righe.push(`  13:00 UT: λ subsolare ${l2.lon.toFixed(2)}°`);
        expect(l2.lon - l.lon).toBeGreaterThan(-15.6);
        expect(l2.lon - l.lon).toBeLessThan(-14.4);
      }
    }
    test.info().annotations.push({ type: 'Terra alle 12:00 UT', description: righe.join('\n') });
    verificaPulita(a);
  });

  test('Luna: lo stesso emisfero rivolto alla Terra, entro la librazione ottica', async ({ page }) => {
    await sostituisciTexture(page.context(), ['luna']);
    const a = await apri(page);
    await page.evaluate(() => window.__ssTest!.seleziona(null));
    await page.evaluate((l) => window.__ssTest!.livelli(l), SOLO_CORPI);
    await page.evaluate(() => window.__ssTest!.focus('luna'));
    const R = corpo('luna').fisica!.raggi_km!.valore[0]!;
    const inizi: [number, number, number][] = [
      [1900, 6, 1],
      [1950, 1, 1],
      [1987, 8, 1],
      [2000, 1, 1],
      [2024, 4, 15],
      [2060, 3, 1],
      [2100, 6, 1],
    ];
    const righe: string[] = [];
    const lon: number[] = [];
    const lat: number[] = [];
    let primo = true;
    for (const [anno, mese, giorno] of inizi) {
      // Primo giorno con il punto sub-terrestre illuminato (angolo di fase sotto 40°).
      let j = jd(anno, mese, giorno, 0);
      let s = await stati(page, ['sole', 'terra', 'luna']);
      for (let k = 0; k < 32; k++) {
        await impostaJd(page, j);
        s = await stati(page, ['sole', 'terra', 'luna']);
        const fase = angolo(differenza(s['sole']!.r, s['luna']!.r), differenza(s['terra']!.r, s['luna']!.r));
        if (fase < 40 / GRADI) break;
        j += 1;
      }
      const u = unitario(differenza(s['terra']!.r, s['luna']!.r));
      await posa(page, u, 4 * R);
      if (primo) {
        await page.evaluate(() => window.__ssTest!.attendiTexture('luna'));
        primo = false;
      }
      const l = await letturaCentro(page);
      righe.push(`JD ${j.toFixed(1)}: punto sub-terrestre λ ${l.lon.toFixed(2)}°, φ ${l.lat.toFixed(2)}°`);
      lon.push(l.lon);
      lat.push(l.lat);
      // Librazione ottica: al massimo circa 7,9° in longitudine e 6,9° in latitudine (Meeus 1998, cap. 53).
      expect(Math.abs(l.lon), `JD ${j}: longitudine`).toBeLessThanOrEqual(8.5);
      expect(Math.abs(l.lat), `JD ${j}: latitudine`).toBeLessThanOrEqual(7.5);
      if (anno === 2024) await schermata(page, 'grafica-02-luna-sub-terrestre', false);
    }
    // La librazione varia tra le date: la misura non è costante.
    expect(Math.max(...lon) - Math.min(...lon)).toBeGreaterThan(1);
    test.info().annotations.push({ type: 'Luna', description: righe.join('\n') });
    verificaPulita(a);
  });
});

test.describe('A25: anelli, satelliti e orbite', () => {
  test('Urano: anelli nel piano equatoriale IAU, satelliti nello stesso piano', async ({ page }) => {
    const a = await apri(page);
    await page.evaluate(() => window.__ssTest!.seleziona(null));
    await page.evaluate(() => window.__ssTest!.focus('urano'));
    await page.evaluate((l) => window.__ssTest!.livelli({ ...l, anelli: true }), SOLO_CORPI);
    const polo = poloUrano();
    // Camera nel piano equatoriale (perpendicolare al polo): gli anelli si riducono a un segmento.
    const lato = unitario(vettoriale(polo, [0, 0, 1]));
    const lune: [string, number][] = [
      ['miranda', 4.6],
      ['ariel', 0.6],
      ['umbriel', 0.6],
      ['titania', 0.6],
      ['oberon', 0.6],
    ];
    // Lune escluse dal disegno nella vista ravvicinata: restano solo pianeta e anelli.
    await page.evaluate((l) => window.__ssTest!.escludi(l), lune.map((l) => l[0]));
    await posa(page, lato, 3.2e5);
    const anelli = await page.evaluate(() => {
      const v = window.__ssTest!.vista()!;
      const W = v.larghezzaPx;
      const H = v.altezzaPx;
      const p = window.__ssTest!.pixel(0, 0, W, H)!;
      const pr = p.pixelRatio;
      const cx = (W / 2) * pr;
      const cy = (H / 2) * pr;
      const punti: number[][] = [];
      for (let y = 0; y < p.altezza; y++) {
        for (let x = 0; x < p.larghezza; x++) {
          const i = 4 * (y * p.larghezza + x);
          const b = p.dati[i]! + p.dati[i + 1]! + p.dati[i + 2]!;
          if (b > 60) punti.push([(x + 0.5 - cx) / pr, (y + 0.5 - cy) / pr, b]);
        }
      }
      return { punti, kmPerPx: v.kmPerPx };
    });
    const rDisco = 25_559 / anelli.kmPerPx;
    // Pixel degli anelli: oltre il disco ed entro 55 000 km (anello ε a 51 149 km).
    const fuori = anelli.punti.filter((q) => {
      const r = Math.hypot(q[0]!, q[1]!);
      return r > 1.15 * rDisco && r * anelli.kmPerPx < 55_000;
    });
    expect(fuori.length, 'pixel degli anelli fuori dal disco').toBeGreaterThan(50);
    // Direzione della linea: media dei doppi angoli.
    let c2 = 0;
    let s2 = 0;
    for (const q of fuori) {
      const f = Math.atan2(q[1]!, q[0]!);
      c2 += Math.cos(2 * f);
      s2 += Math.sin(2 * f);
    }
    const th = 0.5 * Math.atan2(s2, c2);
    const perp = fuori.map((q) => Math.abs(-Math.sin(th) * q[0]! + Math.cos(th) * q[1]!));
    const raggi = fuori.map((q) => Math.hypot(q[0]!, q[1]!) * anelli.kmPerPx);
    const maxPerp = Math.max(...perp);
    const rMax = Math.max(...raggi);
    // Anello ε (51 149 km): un'inclinazione δ del piano darebbe un'ellisse con semiasse minore r·sin δ.
    const inclinazione = Math.asin(Math.min(1, (maxPerp * anelli.kmPerPx) / rMax)) * GRADI;
    test.info().annotations.push({
      type: 'anelli di Urano di taglio',
      description: `${fuori.length} px, scarto massimo dalla linea ${maxPerp.toFixed(2)} px, raggio massimo ${rMax.toFixed(0)} km, inclinazione apparente ≤ ${inclinazione.toFixed(3)}°`,
    });
    expect(rMax, 'anello ε').toBeGreaterThan(50_000);
    expect(inclinazione, 'piano degli anelli = equatore IAU').toBeLessThan(0.5);
    await schermata(page, 'grafica-03-urano-di-taglio', false);

    // Satelliti: posizione sullo schermo rispetto alla linea degli anelli (vista prospettica corretta: la camera
    // giace nel piano equatoriale, che si proietta nella linea) e latitudine planetocentrica sull'equatore IAU.
    await page.evaluate(() => window.__ssTest!.escludi([]));
    await posa(page, lato, 3e6);
    const v = await page.evaluate(() => window.__ssTest!.vista()!);
    const s = await stati(page, ['urano', ...lune.map((l) => l[0])]);
    const centro = { x: v.larghezzaPx / 2, y: v.altezzaPx / 2 };
    const righe: string[] = [];
    for (const [slug, iMax] of lune) {
      const rho = differenza(s[slug]!.r, s['urano']!.r);
      const lat = Math.asin(scalare(rho, polo) / distanza(rho)) * GRADI;
      const p = (await posizione(page, slug))!;
      const dx = p.x - centro.x;
      const dy = p.y - centro.y;
      const h = -Math.sin(th) * dx + Math.cos(th) * dy;
      // Angolo sotteso dalla distanza dalla linea, riportato alla distanza della luna dalla camera.
      const dCam = distanza(differenza(rho, lato.map((x) => x * 3e6)));
      const quota = ((Math.abs(h) * v.kmPerPx) / 3e6) * dCam;
      const latSchermo = Math.asin(Math.min(1, quota / distanza(rho))) * GRADI;
      righe.push(`${slug}: latitudine ${lat.toFixed(3)}°, dallo schermo ${latSchermo.toFixed(3)}°`);
      expect(Math.abs(lat), `${slug}: piano equatoriale`).toBeLessThanOrEqual(iMax);
      expect(latSchermo, `${slug}: sulla linea degli anelli`).toBeLessThanOrEqual(iMax + 0.2);
    }
    test.info().annotations.push({ type: 'satelliti di Urano', description: righe.join('\n') });
    await page.evaluate(() => window.__ssTest!.livelli({ orbite: true }));
    await schermata(page, 'grafica-04-urano-satelliti', false);
    verificaPulita(a);
  });

  test('Marte nel 10000 a.C.: orbite di Fobos e Deimos vicine all’equatore disegnato', async ({ page }) => {
    const a = await apri(page);
    await impostaJd(page, -1_931_000);
    await page.evaluate(() => window.__ssTest!.focus('marte'));
    await page.evaluate(() => window.__ssTest!.livelli({ orbite: true, assiRotazione: true }));
    const t = await tempo(page);
    const cat = JSON.parse(readFileSync('public/data/v1/catalog.json', 'utf-8')) as {
      corpi: { slug: string; orientamento: { coefficienti: CoefficientiWgccre | null } }[];
    };
    const m = new Float64Array(9);
    matriceWgccre(cat.corpi.find((c) => c.slug === 'marte')!.orientamento.coefficienti!, t.jdTT, m);
    const polo = [m[2]!, m[5]!, m[8]!];
    const s = await stati(page, ['marte', 'fobos', 'deimos']);
    const righe: string[] = [];
    for (const slug of ['fobos', 'deimos']) {
      expect(s[slug]!.stato, slug).toBe('ok');
      const h = vettoriale(differenza(s[slug]!.r, s['marte']!.r), differenza(s[slug]!.v, s['marte']!.v));
      const scarto = angolo(h, polo) * GRADI;
      righe.push(`${slug}: polo dell'orbita a ${scarto.toFixed(2)}° dal polo di Marte`);
      // Con F fisso: 10,7° (Fobos) e 9,0° (Deimos).
      expect(scarto, slug).toBeLessThan(1.5);
    }
    test.info().annotations.push({ type: 'Marte nel 10000 a.C.', description: righe.join('\n') });
    // Equatore di taglio (asse nel piano dell'immagine): le orbite appaiono quasi come segmenti.
    await posa(page, unitario(vettoriale(polo, [0, 0, 1])), 60_000);
    await schermata(page, 'grafica-04b-marte-10000ac-di-taglio');
    verificaPulita(a);
  });

  test('orbite: iperbolica aperta (3I/ATLAS), ellittica chiusa (2P/Encke), Terra antioraria vista da +z', async ({ page }) => {
    const a = await apri(page);
    await page.evaluate(() => window.__ssTest!.focus('sole'));
    await page.evaluate(() => window.__ssTest!.livelli({ etichette: false, marcatori: false, anelliDistanza: false, stelle: false, orbite: true }));
    // Vista dall'alto (+z), quasi perpendicolare all'eclittica; distanza della camera scelta per la scala voluta.
    const D0 = 10 * UA;
    const dallAlto = (d: number) => page.evaluate(([x]) => window.__ssTest!.posa([0, -x! * 1e-3, x!], [0, 0, 0]), [d]);
    await dallAlto(D0);
    const fuocoPx = D0 / (await page.evaluate(() => window.__ssTest!.vista()!.kmPerPx));
    const scala = (uaPerPx: number) => dallAlto(uaPerPx * UA * fuocoPx);

    /** Copertura angolare attorno al Sole (gradi) dei pixel dell'orbita evidenziata del colore indicato. */
    const copertura = (filtro: 'giallo' | 'ciano') =>
      page.evaluate((f) => {
        const v = window.__ssTest!.vista()!;
        const p = window.__ssTest!.pixel(0, 0, v.larghezzaPx, v.altezzaPx)!;
        const pr = p.pixelRatio;
        const sole = window.__ssTest!.getScreenPosition('sole')!;
        // Settori di 5°: al perielio (circa 30 px dal Sole) un settore copre almeno 2 px.
        const settori = new Uint8Array(72);
        let n = 0;
        for (let y = 0; y < p.altezza; y++) {
          for (let x = 0; x < p.larghezza; x++) {
            const i = 4 * (y * p.larghezza + x);
            const r = p.dati[i]!;
            const g = p.dati[i + 1]!;
            const b = p.dati[i + 2]!;
            // Giallo degli interstellari (#FFD23F, verde < rosso: escluso l'anello di selezione #D7F75B); ciano delle comete.
            const ok = f === 'giallo' ? r > 80 && g > 0.6 * r && g < 0.95 * r && b < 0.45 * r : b > 80 && g > 0.7 * b && r < 0.6 * b;
            if (!ok) continue;
            const dx = (x + 0.5) / pr - sole.x;
            const dy = (y + 0.5) / pr - sole.y;
            if (Math.hypot(dx, dy) < 6) continue;
            settori[Math.floor((((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) / 5)] = 1;
            n++;
          }
        }
        return { gradi: 5 * settori.reduce((s, x) => s + x, 0), pixel: n };
      }, filtro);

    // 3I/ATLAS (e ≈ 6,1, q ≈ 1,36 UA) a 0,03 UA/px: il perielio è risolto (45 px).
    await page.evaluate(() => window.__ssTest!.seleziona('3i-atlas'));
    await scala(0.03);
    const iperbole = await copertura('giallo');
    await schermata(page, 'grafica-05-orbita-iperbolica', false);
    // 2P/Encke (q ≈ 0,34 UA, Q ≈ 4,1 UA) a 0,012 UA/px.
    await page.evaluate(() => window.__ssTest!.seleziona('2p-encke'));
    await scala(0.012);
    const ellisse = await copertura('ciano');
    await schermata(page, 'grafica-06-orbita-ellittica', false);
    test.info().annotations.push({
      type: 'copertura angolare attorno al Sole',
      description: `3I/ATLAS ${iperbole.gradi}° (${iperbole.pixel} px), 2P/Encke ${ellisse.gradi}° (${ellisse.pixel} px)`,
    });
    // e = 6,1: l'arco iperbolico resta entro ±arccos(−1/e) ≈ ±99° dal perielio.
    expect(iperbole.pixel).toBeGreaterThan(50);
    expect(iperbole.gradi, 'orbita iperbolica aperta').toBeLessThanOrEqual(210);
    expect(ellisse.gradi, 'orbita ellittica chiusa').toBe(360);
    // Scheda: orbita iperbolica senza periodo.
    await expect(page.locator('.ss-scheda-nome')).toHaveText('2P/Encke');
    await page.evaluate(() => window.__ssTest!.seleziona('3i-atlas'));
    await page.locator('.ss-scheda button[aria-controls]').first().click();
    await expect(page.locator('.ss-scheda')).toContainText('Orbita iperbolica: periodo non definito');

    // Terra antioraria vista da +z: il prodotto vettoriale sullo schermo (y verso il basso) è negativo.
    await page.evaluate(() => window.__ssTest!.seleziona('terra'));
    await page.evaluate(([d]) => window.__ssTest!.posa([0, -d! * 1e-3, d!], [0, 0, 0]), [4 * UA]);
    const t0 = (await tempo(page)).jdUT;
    const p0 = (await posizione(page, 'terra'))!;
    await impostaJd(page, t0 + 20);
    await page.evaluate(([d]) => window.__ssTest!.posa([0, -d! * 1e-3, d!], [0, 0, 0]), [4 * UA]);
    const p1 = (await posizione(page, 'terra'))!;
    const sole = (await posizione(page, 'sole'))!;
    const z = (p0.x - sole.x) * (p1.y - sole.y) - (p0.y - sole.y) * (p1.x - sole.x);
    expect(z, 'moto antiorario visto da +z').toBeLessThan(0);
    await attendiQuiete(page);
    verificaPulita(a);
  });
});
