// Server locale della pagina singola per la verifica A24 (§ 5.7, § 13 di docs/PROGETTO.md).
// Emula la pubblicazione su percorso annidato: GET /a/b/index.html restituisce il frammento di
// dist-artifact/index.html avvolto in uno scheletro minimo (charset, viewport con viewport-fit=cover, reset di
// base), come fa la piattaforma; i file di supporto sono serviti da /a/b/<percorso>. Intestazione
// Content-Security-Policy che ammette solo l'origine e Google Fonts. Uso: node scripts/servi-artifact.mjs [porta]

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('../dist-artifact/', import.meta.url));
const BASE = '/a/b/';
const PORTA = Number(process.argv[2] ?? 4174);

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

function scheletro(frammento) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}</style>',
    '</head>',
    '<body>',
    frammento,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404).end();
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice(BASE.length));
  if (rel === 'index.html') {
    const corpo = scheletro(readFileSync(join(RADICE, 'index.html'), 'utf-8'));
    res.writeHead(200, { 'content-type': TIPI['.html'], 'content-security-policy': CSP, 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : corpo);
    return;
  }
  const percorso = normalize(join(RADICE, rel));
  if (!percorso.startsWith(RADICE) || rel.includes(`..${sep}`) || !existsSync(percorso) || !statSync(percorso).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const corpo = readFileSync(percorso);
  res.writeHead(200, {
    'content-type': TIPI[extname(percorso)] ?? 'application/octet-stream',
    'content-length': corpo.length,
    'cache-control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : corpo);
});

server.listen(PORTA, () => console.log(`pagina singola su http://localhost:${PORTA}${BASE}index.html`));
