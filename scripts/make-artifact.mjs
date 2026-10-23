// Pacchetto a pagina singola (§ 5.7 e RNF7 di docs/PROGETTO.md).
// Legge dist-artifact-build/index.html, prodotto da `vite build --mode artifact` (npm run build:artifact) in una
// cartella distinta da dist/ (build del sito), ed emette in dist-artifact/:
// - index.html: frammento senza doctype, html e head, con <title>, collegamenti a Google Fonts, foglio di stile
//   assets/app.css, stile in linea dello sfondo, contenuto del body, script modulo assets/app.js;
// - assets/ e data/v1/ con nomi stabili (i dati sono quelli elencati in data/v1/manifest.json).
// Controlli: nomi stabili, corrispondenza tra manifest e file copiati, assenza dei ganci di test, avvisi della
// licenza MIT di three.js (@license nel bundle, testo integrale in assets/LICENZE.txt), limiti di RNF7
// (90 file, 48 MB in totale, 6 MB per file) e della piattaforma (255 file e 64 MB per pubblicazione, 16 MB per
// file di testo, 15 MB per file binario). MB = 10^6 byte. Codice d'uscita 1 con l'elenco dei problemi.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, sep } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('..', import.meta.url));
const NOME_ORIGINE = 'dist-artifact-build';
const ORIGINE = join(RADICE, NOME_ORIGINE);
const DESTINAZIONE = join(RADICE, 'dist-artifact');
const MB = 1_000_000;
const LIMITI_RNF7 = { file: 90, totale: 48 * MB, perFile: 6 * MB };
const LIMITI_PIATTAFORMA = { file: 255, totale: 64 * MB, testo: 16 * MB, binario: 15 * MB };
const ESTENSIONI_TESTO = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);
const FONT_GOOGLE = /^https:\/\/fonts\.googleapis\.com\/css2\?[^"'<>\s]+$/;

const errori = [];
const fallisci = (messaggio) => errori.push(messaggio);
const mb = (b) => `${(b / MB).toFixed(2).replace('.', ',')} MB`;

function termina() {
  if (errori.length === 0) return;
  console.error('make-artifact: pacchetto non valido');
  for (const e of errori) console.error(`- ${e}`);
  process.exit(1);
}

function elenca(cartella) {
  const out = [];
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const p = join(cartella, voce.name);
    if (voce.isDirectory()) out.push(...elenca(p));
    else if (voce.isFile()) out.push(p);
  }
  return out;
}

const posix = (p) => p.split(sep).join('/');

// --- Build di partenza ---

const indice = join(ORIGINE, 'index.html');
if (!existsSync(indice)) fallisci(`manca ${NOME_ORIGINE}/index.html: eseguire npm run build:artifact`);
for (const f of ['assets/app.js', 'assets/app.css']) {
  if (!existsSync(join(ORIGINE, f))) fallisci(`manca ${NOME_ORIGINE}/${f}: la build non è in modalità artifact (vite build --mode artifact)`);
}
termina();

const html = readFileSync(indice, 'utf-8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
const titolo = /<title>([^<]*)<\/title>/i.exec(head)?.[1]?.trim() ?? '';
const linkFont = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
const foglioFont = linkFont.map((l) => /href="([^"]+)"/.exec(l)?.[1] ?? '').find((h) => FONT_GOOGLE.test(h));
const stili = [...head.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map((m) => m[1].trim());
const script = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/gi)].map((m) => m[1]);
const fogli = linkFont.filter((l) => /rel="stylesheet"/.test(l)).map((l) => /href="([^"]+)"/.exec(l)?.[1] ?? '');

if (titolo === '') fallisci(`${NOME_ORIGINE}/index.html senza <title>`);
if (!foglioFont) fallisci(`${NOME_ORIGINE}/index.html senza il foglio di stile di Google Fonts`);
if (script.length !== 1 || script[0] !== './assets/app.js') fallisci(`script attesi: ./assets/app.js; trovati: ${script.join(', ') || 'nessuno'}`);
const fogliLocali = fogli.filter((f) => !f.startsWith('https://'));
if (fogliLocali.length !== 1 || fogliLocali[0] !== './assets/app.css') fallisci(`fogli di stile locali attesi: ./assets/app.css; trovati: ${fogliLocali.join(', ') || 'nessuno'}`);
if (/<script\b(?![^>]*\bsrc=)/i.test(html)) fallisci(`${NOME_ORIGINE}/index.html contiene script in linea`);
const contenuto = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').trim();
if (!/<div id="app"><\/div>/.test(contenuto)) fallisci('il body non contiene <div id="app"></div>');
termina();

// --- Frammento ---

const frammento = [
  `<title>${titolo}</title>`,
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  `<link rel="stylesheet" href="${foglioFont}">`,
  '<link rel="stylesheet" href="assets/app.css">',
  ...stili.map((s) => `<style>\n${s}\n</style>`),
  contenuto,
  '<script type="module" src="assets/app.js"></script>',
  '',
].join('\n');
if (/<!doctype|<html\b|<head\b|<body\b/i.test(frammento)) fallisci('il frammento contiene doctype, html, head o body');
termina();

// --- Copia con nomi stabili ---

rmSync(DESTINAZIONE, { recursive: true, force: true });
mkdirSync(DESTINAZIONE, { recursive: true });
writeFileSync(join(DESTINAZIONE, 'index.html'), frammento);

const copiati = ['index.html'];
for (const cartella of ['assets', 'data/v1']) {
  const base = join(ORIGINE, cartella);
  if (!existsSync(base)) {
    fallisci(`manca ${NOME_ORIGINE}/${cartella}`);
    continue;
  }
  for (const f of elenca(base)) {
    const rel = posix(relative(ORIGINE, f));
    const dest = join(DESTINAZIONE, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(f, dest);
    copiati.push(rel);
  }
}
termina();

// Nomi stabili: nessun hash di contenuto negli asset.
for (const f of copiati.filter((p) => p.startsWith('assets/'))) {
  if (/-[A-Za-z0-9_]{8}\.[a-z0-9]+$/.test(f)) fallisci(`asset con nome non stabile: ${f}`);
}
// Ganci di test assenti dalla build pubblicata.
const bundle = readFileSync(join(DESTINAZIONE, 'assets/app.js'), 'utf-8');
if (bundle.includes('__ssTest')) fallisci('assets/app.js contiene i ganci di test');
// Licenza di three.js (MIT): avviso di copyright nel bundle e testo integrale del permesso.
if (!/@license[\s\S]*?Three\.js Authors[\s\S]*?SPDX-License-Identifier: MIT/.test(bundle)) fallisci("assets/app.js senza l'avviso @license di three.js");
const licenzaThree = readFileSync(join(RADICE, 'node_modules/three/LICENSE'), 'utf-8').trim();
const avvisi = join(DESTINAZIONE, 'assets/LICENZE.txt');
if (!existsSync(avvisi) || !readFileSync(avvisi, 'utf-8').includes(licenzaThree)) fallisci('assets/LICENZE.txt assente o senza il testo integrale della licenza di three.js');

// Dati: esattamente i file del manifest, con la dimensione dichiarata.
const manifest = JSON.parse(readFileSync(join(DESTINAZIONE, 'data/v1/manifest.json'), 'utf-8'));
const attesi = new Map(manifest.file.map((v) => [`data/v1/${v.percorso}`, v.byte]));
const dati = copiati.filter((p) => p.startsWith('data/v1/') && p !== 'data/v1/manifest.json');
for (const p of dati) {
  if (!attesi.has(p)) fallisci(`file di dati non elencato nel manifest: ${p}`);
  else if (statSync(join(DESTINAZIONE, p)).size !== attesi.get(p)) fallisci(`dimensione diversa dal manifest: ${p}`);
}
for (const p of attesi.keys()) if (!dati.includes(p)) fallisci(`file del manifest mancante: ${p}`);
termina();

// --- Limiti ---

const dimensioni = copiati.map((p) => ({ p, byte: statSync(join(DESTINAZIONE, p)).size, testo: ESTENSIONI_TESTO.has(extname(p)) }));
const totale = dimensioni.reduce((s, d) => s + d.byte, 0);
const massimo = dimensioni.reduce((m, d) => (d.byte > m.byte ? d : m));
const massimoTesto = dimensioni.filter((d) => d.testo).reduce((m, d) => (d.byte > m.byte ? d : m), { p: '-', byte: 0 });
const massimoBinario = dimensioni.filter((d) => !d.testo).reduce((m, d) => (d.byte > m.byte ? d : m), { p: '-', byte: 0 });

if (dimensioni.length > LIMITI_RNF7.file) fallisci(`RNF7: ${dimensioni.length} file, limite ${LIMITI_RNF7.file}`);
if (totale > LIMITI_RNF7.totale) fallisci(`RNF7: ${totale} byte in totale (${mb(totale)}), limite ${mb(LIMITI_RNF7.totale)}`);
for (const d of dimensioni) if (d.byte > LIMITI_RNF7.perFile) fallisci(`RNF7: ${d.p} di ${d.byte} byte (${mb(d.byte)}), limite ${mb(LIMITI_RNF7.perFile)} per file`);
if (dimensioni.length > LIMITI_PIATTAFORMA.file) fallisci(`piattaforma: ${dimensioni.length} file, limite ${LIMITI_PIATTAFORMA.file} per pubblicazione`);
if (totale > LIMITI_PIATTAFORMA.totale) fallisci(`piattaforma: ${mb(totale)} in totale, limite ${mb(LIMITI_PIATTAFORMA.totale)} per pubblicazione`);
for (const d of dimensioni) {
  const lim = d.testo ? LIMITI_PIATTAFORMA.testo : LIMITI_PIATTAFORMA.binario;
  if (d.byte > lim) fallisci(`piattaforma: ${d.p} di ${mb(d.byte)}, limite ${mb(lim)} per file ${d.testo ? 'di testo' : 'binario'}`);
}
termina();

console.log('make-artifact: dist-artifact/ pronto');
console.log(`  file: ${dimensioni.length} (RNF7 ${LIMITI_RNF7.file}, piattaforma ${LIMITI_PIATTAFORMA.file})`);
console.log(`  totale: ${totale} byte, ${mb(totale)} (RNF7 ${mb(LIMITI_RNF7.totale)}, piattaforma ${mb(LIMITI_PIATTAFORMA.totale)})`);
console.log(`  file più grande: ${massimo.p}, ${mb(massimo.byte)} (RNF7 ${mb(LIMITI_RNF7.perFile)})`);
console.log(`  testo più grande: ${massimoTesto.p}, ${mb(massimoTesto.byte)} (piattaforma ${mb(LIMITI_PIATTAFORMA.testo)})`);
console.log(`  binario più grande: ${massimoBinario.p}, ${mb(massimoBinario.byte)} (piattaforma ${mb(LIMITI_PIATTAFORMA.binario)})`);
