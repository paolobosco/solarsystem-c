// Criterio A26: documentazione coerente con codice, dati pubblicati e risultati della validazione.
// Struttura del repository e programmi della pipeline (PROGETTO § 5.3, § 12.1), catalogo (§ 7.6.4,
// § 8.10, § 9), soglie ed esito di A7 (PROGETTO § 13, VALIDAZIONE, METODI, README, "Fonti e metodi"),
// budget (nota del catalogo), limiti del rendering (eclissi, ombre degli anelli), mosaici USGS (LICENZE e
// "Fonti e metodi"), ambiente della pipeline (§ 5.2), unità astronomica (§ 5.4, METODI § 1), build della
// pagina singola (§ 5.7), fonti dell'incertezza di ΔT (§ 6.5, registro, "Fonti e metodi"), licenze (§ 16.3),
// contratto UrlState (§ 5.4), registro delle decisioni di revisione (.npmrc), riferimenti delle fonti del catalogo
// ("Fonti e metodi", § 16.1), misure e date di A22 e A24 (VALIDAZIONE § 1 e § 12.5, § 8.1), dimensioni dei dati e
// dei livelli dei piccoli corpi in docs/SPIKE.md (S4, S6), soglia dell'avviso di Vite sul bundle (§ 5.7, A1),
// masse e periodi di rotazione da fonti primarie (METODI § 16 e § 17).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigEnv, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { creaUrlState } from '../../src/app/urlState';
import { FONTI_METODI_SEZIONI, RIFERIMENTI, VOCI_ACCURATEZZA } from '../../src/ui/testi.it';
import configura from '../../vite.config';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const leggi = (rel: string): string => readFileSync(join(RADICE, rel), 'utf8');
const esiste = (rel: string): boolean => existsSync(join(RADICE, rel));
const elenca = (rel: string): string[] => readdirSync(join(RADICE, rel));
const cartella = (rel: string): boolean => statSync(join(RADICE, rel)).isDirectory();

const PROGETTO = leggi('docs/PROGETTO.md');
const VALIDAZIONE = leggi('docs/VALIDAZIONE.md');
const METODI = leggi('docs/METODI.md');
const README = leggi('README.md');

/** Sezione Markdown: dalla riga del titolo alla successiva di livello uguale o superiore (fuori dai blocchi di codice). */
function sezione(md: string, titolo: RegExp): string {
  const righe = md.split('\n');
  const livello = (r: string): number => /^(#+) /.exec(r)?.[1]?.length ?? 0;
  let codice = false;
  let inizio = -1;
  let fine = righe.length;
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i] ?? '';
    if (r.startsWith('```')) codice = !codice;
    if (codice || livello(r) === 0) continue;
    if (inizio < 0 && titolo.test(r)) inizio = i;
    else if (inizio >= 0 && livello(r) <= livello(righe[inizio] ?? '')) {
      fine = i;
      break;
    }
  }
  if (inizio < 0) throw new Error(`sezione assente: ${titolo}`);
  return righe.slice(inizio, fine).join('\n');
}

/** Celle della riga di tabella che inizia con `| chiave |`. */
function riga(md: string, chiave: string): string[] {
  const r = md.split('\n').find((x) => x.startsWith(`| ${chiave} |`));
  if (r === undefined) throw new Error(`riga assente: ${chiave}`);
  return r
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((c) => c.trim());
}

/** Paragrafi della sezione, con gli spazi non separabili (tra numero e unità) resi come spazi dei documenti. */
function paragrafiFonti(titolo: string): string {
  const s = FONTI_METODI_SEZIONI.find((x) => x.titolo === titolo);
  if (!s) throw new Error(`sezione di "Fonti e metodi" assente: ${titolo}`);
  return s.paragrafi.join('\n').replace(/[\u00a0\u202f]/g, ' ');
}

interface Corpo {
  slug: string;
  nome: string;
  categoria: string;
  primario: string | null;
  effemeridi: { modello: string };
  orientamento: { modello: string } | null;
  fisica: { gm_km3s2: { fonte: string } | null };
  texture: { licenza: string } | null;
}
const CORPI = (JSON.parse(leggi('public/data/v1/catalog.json')) as { corpi: Corpo[] }).corpi;

describe('PROGETTO § 5.3 e § 12.1: struttura del repository', () => {
  const NOME_FILE = /(?<![\w./-])([\w-]+(?:\.[\w-]+)*\.(?:ts|mjs|js|md|css|html|json))(?![\w.-])/g;
  const blocco = /```\n([\s\S]*?)```/.exec(sezione(PROGETTO, /^### 5\.3 /))?.[1] ?? '';
  const perCartella = new Map<string, Set<string>>();
  const percorsi: string[] = [];
  let correnti: string[] = [];
  for (const r of blocco.split('\n')) {
    if (!r.trim()) continue;
    let resto = r;
    if (!/^\s/.test(r)) {
      const m = /^(\S.*?)(?:\s{2,}(.*))?$/.exec(r);
      const voci = (m?.[1] ?? '').split(/,\s*/);
      resto = m?.[2] ?? '';
      if (voci.every((v) => v.endsWith('/'))) {
        correnti = voci;
        for (const c of voci) if (!perCartella.has(c)) perCartella.set(c, new Set());
      } else {
        correnti = [];
        percorsi.push(...voci);
      }
    }
    for (const m of resto.matchAll(NOME_FILE)) for (const c of correnti) perCartella.get(c)?.add(m[1] ?? '');
  }

  it('ogni file e cartella citati esistono', () => {
    const mancanti: string[] = [];
    for (const p of percorsi) if (!esiste(p)) mancanti.push(p);
    for (const [c, nomi] of perCartella) {
      if (!esiste(c)) mancanti.push(c);
      for (const n of nomi) if (!esiste(c + n)) mancanti.push(c + n);
    }
    expect(mancanti).toEqual([]);
  });

  it('elenchi completi per i moduli TypeScript, gli script, src e docs', () => {
    const assenti: string[] = [];
    for (const c of ['src/app/', 'src/time/', 'src/ephem/', 'src/data/', 'src/render/']) {
      for (const f of elenca(c)) if (f.endsWith('.ts') && !perCartella.get(c)?.has(f)) assenti.push(c + f);
    }
    for (const f of elenca('src')) {
      if (cartella(`src/${f}`)) {
        if (!perCartella.has(`src/${f}/`)) assenti.push(`src/${f}/`);
      } else if (!percorsi.includes(`src/${f}`)) assenti.push(`src/${f}`);
    }
    for (const f of elenca('scripts')) if (f.endsWith('.mjs') && !percorsi.includes(`scripts/${f}`)) assenti.push(`scripts/${f}`);
    for (const f of elenca('.')) if (f.endsWith('.html') && !percorsi.includes(f)) assenti.push(f);
    for (const f of elenca('docs')) {
      if (cartella(`docs/${f}`)) {
        if (!perCartella.has(`docs/${f}/`)) assenti.push(`docs/${f}/`);
      } else if (f.endsWith('.md') && !perCartella.get('docs/')?.has(f)) assenti.push(`docs/${f}`);
    }
    expect(assenti).toEqual([]);
  });

  it('§ 12.1: programmi e pacchetti della pipeline uguali ai file reali', () => {
    const testo = sezione(PROGETTO, /^### 12\.1 /);
    const citati = [...testo.matchAll(/`([\w./-]+)`/g)].map((m) => m[1] ?? '');
    const py = citati.filter((c) => /^\w+\.py$/.test(c));
    expect(py.filter((f) => !esiste(`scripts/pipeline/${f}`))).toEqual([]);
    const reali = elenca('scripts/pipeline').filter((f) => f.endsWith('.py'));
    expect(reali.filter((f) => !py.includes(f))).toEqual([]);
    const pacchetti = elenca('scripts/pipeline').filter((d) => esiste(`scripts/pipeline/${d}/__init__.py`));
    expect(pacchetti.filter((d) => !citati.includes(`${d}/`))).toEqual([]);
  });

  it('Vondrák con l’accento in tutti i documenti', () => {
    const file = ['README.md', ...elenca('docs').filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
    file.push(...elenca('docs/_parti').map((f) => `docs/_parti/${f}`));
    expect(file.filter((f) => /Vondrak/.test(leggi(f)))).toEqual([]);
  });
});

describe('PROGETTO § 7.6.4, § 8.10, § 9: coerenza con il catalogo', () => {
  it('§ 7.6.4: piccoli corpi con modello WGCCRE uguali al catalogo', () => {
    const elenco = /WGCCRE dove disponibili[^(]*\(([^)]*)\)/.exec(sezione(PROGETTO, /^#### 7\.6\.4 /))?.[1] ?? '';
    const nomi = elenco.split(/,\s*|\s+e\s+/).map((n) => n.trim());
    const attesi = CORPI.filter((b) => b.effemeridi.modello === 'piccolo-corpo' && b.orientamento?.modello === 'wgccre').map(
      (b) => b.nome,
    );
    expect([...nomi].sort()).toEqual([...attesi].sort());
  });

  it('§ 8.10 e § 5.4: primario del Sole, di un pianeta o di un pianeta nano', () => {
    const perSlug = new Map(CORPI.map((b) => [b.slug, b]));
    const parole: Record<string, string> = { sole: 'Sole', pianeta: 'pianeta', 'pianeta-nano': 'pianeta nano' };
    const categorie = new Set(CORPI.map((b) => (b.primario === null ? 'null' : (perSlug.get(b.primario)?.categoria ?? '?'))));
    const testo = riga(sezione(PROGETTO, /^### 8\.10 /), 'primario').slice(1).join(' ');
    const commento = /primario: number;\s*\/\/(.*)/.exec(sezione(PROGETTO, /^### 5\.4 /))?.[1] ?? '';
    for (const c of categorie) {
      expect(testo, c).toContain(parole[c] ?? c);
      if (c !== 'null') expect(commento, c).toContain(parole[c] ?? c);
    }
  });

  it('§ 9: fonti del GM uguali a quelle del catalogo', () => {
    const testo = sezione(PROGETTO, /^## 9\. /);
    const gm = testo.split('\n').find((r) => r.startsWith('- GM:')) ?? '';
    const iDe = gm.indexOf('DE440/441');
    const iKernel = gm.indexOf('kernel satellitari');
    expect(iDe).toBeGreaterThanOrEqual(0);
    expect(iKernel).toBeGreaterThan(iDe);
    const daDe = gm.slice(iDe, iKernel);
    const daKernel = gm.slice(iKernel, gm.indexOf(';', iKernel));
    for (const b of CORPI) {
      const fonte = b.fisica.gm_km3s2?.fonte ?? '';
      if (fonte.includes('kernel')) expect(daKernel, b.slug).toContain(b.categoria === 'luna' ? 'satelliti' : b.nome);
      else if (fonte.startsWith('DE441')) expect(daDe, b.slug).toContain(b.nome);
    }
    const satelliti = testo.split('\n').find((r) => r.startsWith('- Satelliti:')) ?? '';
    const i = satelliti.indexOf('Planetary Satellite Physical Parameters');
    expect(i).toBeGreaterThan(0);
    expect(satelliti.slice(0, i)).not.toMatch(/GM/);
  });
});

describe('A7: soglie adottate, risultati e documenti', () => {
  interface Salto {
    t: number;
    rel?: number | null;
    metrica?: number | null;
  }
  interface EsitoCorpo {
    giunzioni: Salto[];
    salti_record?: Salto[] | null;
    max_rapporto_segmenti: number | null;
    interpolazione: { tutti_ok: boolean; max_rapporto: number };
  }
  const val = JSON.parse(leggi('scripts/pipeline/out/validazione-piccoli-corpi.json')) as {
    corpi: Record<string, EsitoCorpo>;
    cerere_meno7000: { jd: number; con_15_asteroidi: { arcsec: number } };
  };
  const aff = JSON.parse(leggi('scripts/pipeline/out/reliability-small.json')) as {
    t0: number;
    passo: number;
    nodi: number;
    tFine: number;
    passoFine: number;
    corpi: Record<string, { log10eps: (number | null)[] }>;
  };
  /** ε dichiarato (rad) nell'intervallo che contiene t (20 anni fino a tFine, poi passoFine; § 8.7). */
  const eps = (slug: string, t: number): number => {
    const kFine = Math.round((aff.tFine - aff.t0) / aff.passo);
    const j = t < aff.tFine ? Math.floor((t - aff.t0) / aff.passo) : kFine + Math.floor((t - aff.tFine) / aff.passoFine);
    const i = Math.min(Math.max(j, 0), aff.nodi - 1);
    const x = aff.corpi[slug]?.log10eps[i];
    return x === null || x === undefined ? Number.NaN : 10 ** x;
  };
  const ARCSEC = (180 / Math.PI) * 3600;
  // Tolleranza relativa di rappresentazione del livello 4 prima del -2000 (§ 7.6.3), sommata a ε.
  const TOLLERANZA_PRIMA_DEL_MENO_2000 = 1e-2;

  it('giunzioni e salti tra record entro ε del corpo a quell’istante', () => {
    const oltre: string[] = [];
    let salti = 0;
    for (const [slug, c] of Object.entries(val.corpi)) {
      salti += c.salti_record?.length ?? 0;
      for (const g of [...c.giunzioni, ...(c.salti_record ?? [])]) {
        const m = Math.max(g.rel ?? 0, g.metrica ?? 0);
        if (m > 0 && !(m <= eps(slug, g.t))) oltre.push(`${slug} ${g.t}: ${m} > ${eps(slug, g.t)}`);
      }
    }
    expect(oltre).toEqual([]);
    expect(salti).toBe(188);
  });

  it('Cerere a -7000 entro ε(-7000) senza la tolleranza di rappresentazione (103″)', () => {
    const c = val.cerere_meno7000;
    const epsModello = (eps('cerere', c.jd) - TOLLERANZA_PRIMA_DEL_MENO_2000) * ARCSEC;
    // 103″ dai cloni; il file arrotonda per eccesso log10 ε alla quarta cifra: fino a +0,5″ su ε totale di 0,0105 rad.
    expect(epsModello).toBeGreaterThanOrEqual(103);
    expect(epsModello).toBeLessThan(104);
    expect(c.con_15_asteroidi.arcsec).toBeLessThanOrEqual(epsModello);
  });

  it('interpolazione entro la tolleranza; unica eccezione C/1680 V1 al perielio (1,52)', () => {
    const oltre = Object.entries(val.corpi)
      .filter(([, c]) => (c.max_rapporto_segmenti ?? 0) > 1)
      .map(([s, c]) => [s, Math.round((c.max_rapporto_segmenti ?? 0) * 100) / 100]);
    expect(oltre).toEqual([['c1680-v1', 1.52]]);
    for (const [s, c] of Object.entries(val.corpi)) {
      expect(c.interpolazione.tutti_ok, s).toBe(true);
      expect(c.interpolazione.max_rapporto, s).toBeLessThanOrEqual(1);
    }
  });

  it('PROGETTO § 13 e registro: soglie adottate ed eccezione dichiarata', () => {
    const soglia = riga(sezione(PROGETTO, /^## 13\. /), 'A7')[2] ?? '';
    expect(soglia).not.toMatch(/1e-5·r|≤ 1″/);
    expect(soglia).toContain("≤ ε del corpo a quell'istante");
    expect(soglia).toContain('103″');
    expect(soglia).toMatch(/eccezione dichiarata: C\/1680 V1 al perielio/);
    const versione = /^Versione (\d+\.\d+) del /m.exec(PROGETTO)?.[1];
    const registro = sezione(PROGETTO, /^## Registro delle modifiche/);
    expect(/^Versione (\d+\.\d+) \(/m.exec(registro)?.[1]).toBe(versione);
    expect(registro.split(/^Versione /m)[1]).toContain('| 13 (A7) |');
    expect(/§ 13 di `docs\/PROGETTO.md` \(versione (\d+\.\d+)\)/.exec(VALIDAZIONE)?.[1]).toBe(versione);
  });

  it('VALIDAZIONE § 1, § 7 e § 14: A7 superato con l’eccezione dichiarata', () => {
    const r = riga(sezione(VALIDAZIONE, /^## 1\. /), 'A7');
    expect(r[3]).toMatch(/^superato/);
    expect(r[3]).toContain('C/1680 V1');
    expect(sezione(VALIDAZIONE, /^## 7\. /)).not.toMatch(/non superat/);
    const p14 = sezione(VALIDAZIONE, /^## 14\. /);
    expect(p14).toMatch(/A7.*C\/1680 V1/);
  });

  it('METODI, README e "Fonti e metodi" dichiarano l’eccezione di C/1680 V1', () => {
    const testi = {
      metodi: sezione(METODI, /^### 9\.4 /),
      readme: sezione(README, /^## Limiti noti/),
      fonti: paragrafiFonti('Piccoli corpi'),
      progetto: riga(sezione(PROGETTO, /^## 13\. /), 'A7')[2] ?? '',
    };
    for (const [k, t] of Object.entries(testi)) {
      expect(t, k).toContain('C/1680 V1');
      expect(t, k).toContain('759 km');
      expect(t, k).toContain('0,0062 UA');
    }
    expect(testi.fonti).toMatch(/[Ee]ccezione dichiarata/);
    expect(VOCI_ACCURATEZZA['piccoli-corpi'].grandezza).toContain('eccezione dichiarata');
  });
});

describe('Budget, rendering e licenze', () => {
  it('nota del catalogo: limite per file uguale a pack.py e al § 8.1', () => {
    const mb = Number(/^MAX_PER_FILE = (\d+) \* MB/m.exec(leggi('scripts/pipeline/pack.py'))?.[1]);
    expect(mb).toBeGreaterThan(0);
    expect(sezione(PROGETTO, /^### 8\.1 /)).toContain(`≤ ${mb} MB per file`);
    const nota = sezione(leggi('docs/_parti/catalogo.md'), /^## 9\. /);
    const r = riga(nota, 'File più grande');
    expect(r[2]).toMatch(new RegExp(`^${mb} MB`));
    expect(r[2]).not.toContain('superato');
    expect(Number((/([\d ]+) byte/.exec(r[1] ?? '')?.[1] ?? '').replace(/ /g, ''))).toBeLessThanOrEqual(mb * 1e6);
    expect(nota).not.toMatch(/fallisce/);
  });

  it('eclissi non rappresentate: limite dichiarato in PROGETTO, METODI, README e "Fonti e metodi"', () => {
    const r5 = sezione(PROGETTO, /^### 10\.1 /).split('\n').find((x) => x.startsWith('- R5 ')) ?? '';
    for (const [k, t] of Object.entries({
      progetto: r5,
      metodi: sezione(METODI, /^## 13\. /),
      readme: sezione(README, /^## Limiti noti/),
      fonti: paragrafiFonti('Limiti'),
    })) {
      expect(t, k).toMatch(/eclissi/);
    }
  });

  it('anelli: ombra del pianeta disegnata e dichiarata; nessun "senza ombre"', () => {
    expect(leggi('src/render/rings.ts')).toMatch(/Ombra del pianeta/);
    const fonti = paragrafiFonti('Limiti');
    expect(fonti).not.toContain('senza ombre');
    expect(fonti).toContain("l'ombra del pianeta sugli anelli");
    expect(sezione(METODI, /^## 13\. /)).toContain('ombra del pianeta sugli anelli');
    expect(sezione(README, /^## Limiti noti/)).toContain('ombra del pianeta sugli anelli');
  });

  it('LICENZE: risoluzione dei mosaici USGS uguale a quella della pagina Astropedia citata', () => {
    const errate: string[] = [];
    for (const r of leggi('docs/LICENZE.md').split('\n')) {
      const slug = /astrogeology\.usgs\.gov\/search\/map\/\w*?_(\d+(?:_\d+)?)(k?m)\b/.exec(r);
      const celle = r.split('|').map((c) => c.trim());
      const testo = /(\d+(?:,\d+)?) (k?m)\b/.exec(celle[2] ?? '');
      if (!slug || !testo) continue;
      const atteso = `${(slug[1] ?? '').replace('_', ',')} ${slug[2] ?? ''}`;
      if (`${testo[1]} ${testo[2]}` !== atteso) errate.push(`${celle[1]}: ${testo[0]} invece di ${atteso}`);
    }
    expect(errate).toEqual([]);
  });

  it('"Fonti e metodi": condizioni d’uso dei mosaici USGS come nelle schede del catalogo', () => {
    const clausola = /mosaici USGS \(([^)]*)\)/.exec(paragrafiFonti('Licenze e attribuzioni'))?.[1] ?? '';
    const tipi = new Set(
      CORPI.map((b) => b.texture?.licenza ?? '')
        .filter((l) => l.includes('USGS'))
        .map((l) => (l.split(/[,(]/)[0] ?? '').trim()),
    );
    expect(tipi.size).toBeGreaterThan(1);
    for (const t of tipi) expect(clausola, t).toContain(t);
  });
});

describe('PROGETTO § 5.2 e README: ambiente principale della pipeline', () => {
  it('pacchetti diretti di requirements.txt elencati, con la versione nel § 5.2', () => {
    const diretti = leggi('scripts/pipeline/requirements.txt').split('# dipendenze indirette')[0] ?? '';
    const pacchetti = [...diretti.matchAll(/^([\w.-]+)==(\S+)$/gm)].map((m) => [m[1] ?? '', m[2] ?? ''] as const);
    expect(pacchetti.length).toBeGreaterThan(0);
    const pipeline = sezione(PROGETTO, /^### 5\.2 /).split('\n').find((r) => r.startsWith('- Pipeline:')) ?? '';
    const progetto = /Ambiente principale: (.*?) Ambiente di integrazione/.exec(pipeline)?.[1] ?? '';
    const readmePipeline = leggi('scripts/pipeline/README.md').split('\n').find((r) => r.startsWith('Ambiente principale (`.venv`):')) ?? '';
    const readme = /^`\.venv`: (.*?) `\.venv-assist`/m.exec(README)?.[1] ?? '';
    for (const [nome, versione] of pacchetti) {
      expect(progetto, nome).toContain(`${nome} ${versione}`);
      expect(readmePipeline, nome).toMatch(new RegExp(`\\b${nome}\\b`));
      expect(readme, nome).toMatch(new RegExp(`\\b${nome}\\b`));
    }
  });
});

describe('PROGETTO § 5.4 e METODI § 1: unità astronomica nel sito', () => {
  const sorgenti = readdirSync(join(RADICE, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `src/${f}`);
  const regola = {
    progetto: sezione(PROGETTO, /^### 5\.4 /).split('\n').find((r) => r.startsWith('- Unità interne:')) ?? '',
    metodi: sezione(METODI, /^## 1\. /).split('\n').find((r) => r.startsWith('- Unità interne:')) ?? '',
  };

  it('1 UA = 149 597 870,7 km solo in src/ephem/constants.ts (UA_KM)', () => {
    expect(leggi('src/ephem/constants.ts')).toMatch(/^export const UA_KM = 149_597_870\.7;$/m);
    const copie = sorgenti.filter((f) => f !== 'src/ephem/constants.ts' && /149_?597_?870\.7/.test(leggi(f)));
    expect(copie).toEqual([]);
    for (const [k, t] of Object.entries(regola)) expect(t, k).toContain('`src/ephem/constants.ts`');
  });

  it('conversioni da km a UA (divisione per UA_KM) solo nei file citati dalla regola', () => {
    const conversioni = sorgenti.filter((f) => /[\w)\]]\s*\/\s*UA_KM\b/.test(leggi(f)));
    expect(conversioni).toContain('src/ui/format.ts');
    for (const [k, t] of Object.entries(regola)) {
      const citati = [...t.matchAll(/`(src\/[\w/.-]+\.ts)`/g)].map((m) => m[1] ?? '');
      expect(
        conversioni.filter((f) => !citati.includes(f)),
        k,
      ).toEqual([]);
    }
  });
});

describe('PROGETTO § 5.7: build della pagina singola', () => {
  it('assetFileNames come in vite.config.ts: assets/app.css per il foglio di stile unico', () => {
    const voce = sezione(PROGETTO, /^### 5\.7 /).split('\n').find((r) => r.startsWith('- `vite.config.ts`')) ?? '';
    const descritto = /assetFileNames[^;]*/.exec(voce)?.[0] ?? '';
    expect(descritto).toContain("'assets/app.css'");
    expect(descritto).toContain("'assets/[name][extname]'");
    const env: ConfigEnv = { command: 'build', mode: 'artifact', isSsrBuild: false, isPreview: false };
    const cfg = (typeof configura === 'function' ? configura(env) : configura) as UserConfig;
    const uscita = cfg.build?.rollupOptions?.output as { assetFileNames: (i: { names: string[] }) => string };
    expect(uscita.assetFileNames({ names: ['index.css'] })).toBe('assets/app.css');
    expect(uscita.assetFileNames({ names: ['font.woff2'] })).toBe('assets/[name][extname]');
    expect(leggi('scripts/make-artifact.mjs')).toContain("'assets/app.css'");
  });
});

describe('Incertezza di ΔT dal 1200 al 1900: fonti come nel § 6.5', () => {
  const testi = {
    progetto: sezione(PROGETTO, /^### 6\.5 /).split('\n').find((r) => r.startsWith('- σ_s(y)')) ?? '',
    registro: riga(sezione(PROGETTO, /^## Registro delle modifiche/), '6.5, 8.9')[1] ?? '',
    fonti: (paragrafiFonti('Tempo e calendario').split('\n').find((p) => p.startsWith('Incertezza di ΔT')) ?? '').replace(
      /\u00a0/g,
      ' ',
    ),
  };
  /** Testo che precede `s` nella stessa proposizione, dopo l'ultima parentesi chiusa o l'ultimo punto e virgola. */
  const prima = (t: string, s: string): string => {
    const p = t.slice(0, t.indexOf(s));
    return p.slice(Math.max(p.lastIndexOf(')'), p.lastIndexOf(';')) + 1);
  };

  it('20 s dal 1300 al 1600 da Espenak e Meeus; Stephenson e Houlden solo per il 1700-1900 (era telescopica dal 1600)', () => {
    for (const [k, t] of Object.entries(testi)) {
      expect(t, k).toContain('20 s dal 1300 al 1600 (Espenak e Meeus 2006)');
      expect(t, k).toContain('Stephenson e Houlden 1986');
      const valori = prima(t, 'Stephenson e Houlden 1986');
      expect(valori, k).toMatch(/1700/);
      expect(valori, k).not.toMatch(/\b1[0-5]\d\d\b/);
      for (const m of t.matchAll(/era telescopica([^;]*)/g)) expect(m[1], k).not.toMatch(/\b1[0-5]\d\d\b/);
    }
  });
});

describe('PROGETTO § 16.3: licenze dei dati e delle texture come in LICENZE e nel catalogo', () => {
  const s163 = sezione(PROGETTO, /^### 16\.3 /);

  it('mosaici USGS: condizioni delle schede del catalogo, nessuna licenza CC0', () => {
    expect(s163).not.toMatch(/CC0/);
    const clausola = /mosaici USGS: ([^;]*)/.exec(s163)?.[1] ?? '';
    const tipi = new Set(
      CORPI.map((b) => b.texture?.licenza ?? '')
        .filter((l) => l.includes('USGS'))
        .map((l) => (l.split(/[,(]/)[0] ?? '').trim()),
    );
    expect(tipi.size).toBeGreaterThan(1);
    for (const t of tipi) expect(clausola, t).toContain(t);
  });

  it('CC BY 4.0 per le texture di Solar System Scope; SIL OFL solo per i font', () => {
    expect(CORPI.some((b) => b.texture?.licenza === 'CC BY 4.0')).toBe(true);
    expect(s163).toMatch(/texture \([^)]*CC BY 4\.0/);
    expect(s163).toContain('font (SIL OFL 1.1)');
    expect(s163).not.toMatch(/texture e font \(SIL OFL/);
  });
});

describe('PROGETTO § 5.4: contratto UrlState come in src/app/types.ts', () => {
  it('leggiSlug restituisce il testo dell’hash; la validazione dello slug spetta al chiamante (§ 11.12)', () => {
    const contratto = /leggiSlug\(\): string \| null;\s*\/\/\s*(.*)$/m.exec(sezione(PROGETTO, /^### 5\.4 /))?.[1]?.trim() ?? '';
    const jsdoc = /\/\*\* (.*?) \*\/\s*leggiSlug\(\)/.exec(leggi('src/app/types.ts'))?.[1] ?? '';
    const norma = (s: string): string => s.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
    expect(jsdoc).not.toBe('');
    expect(norma(contratto)).toBe(norma(jsdoc));
    // Comportamento descritto: testo non conforme restituito com'è (il chiamante lo segnala), null se vuoto.
    const finestra = (hash: string): Window => ({ location: { hash } }) as unknown as Window;
    expect(creaUrlState(finestra('#1P')).leggiSlug()).toBe('1P');
    expect(creaUrlState(finestra('#Marte')).leggiSlug()).toBe('Marte');
    expect(creaUrlState(finestra('#%20marte%20')).leggiSlug()).toBe('marte');
    expect(creaUrlState(finestra('#')).leggiSlug()).toBeNull();
  });
});

describe('REVISIONE_PROGETTO: decisioni coerenti con il repository e con il § 5.2', () => {
  const REVISIONE = leggi('docs/REVISIONE_PROGETTO.md');

  it('legacy-peer-deps mantenuto in .npmrc e motivato nel § 5.2; nessuna decisione lo dichiara rimosso', () => {
    expect(leggi('.npmrc')).toMatch(/^legacy-peer-deps=true$/m);
    expect(sezione(PROGETTO, /^### 5\.2 /)).toContain('`.npmrc` con `legacy-peer-deps=true`');
    const righe = REVISIONE.split('\n').filter((r) => r.includes('legacy-peer-deps'));
    expect(righe.length).toBeGreaterThan(0);
    for (const r of righe) expect(r).not.toMatch(/[Rr]imoss\w*[^;(|]*`legacy-peer-deps`/);
    for (const id of ['AR-DEP-01', 'FC-SUP-01']) {
      const motivazione = riga(REVISIONE, id)[5] ?? '';
      expect(motivazione, id).toMatch(/`legacy-peer-deps` mantenuto[^;|]*§ 5\.2/);
    }
  });
});

describe('Riferimenti: fonti di letteratura del catalogo in "Fonti e metodi" e nel § 16.1', () => {
  /** Autori e anni delle citazioni di letteratura nelle fonti dei dati (esclusi SBDB, che cita a sua volta, e le texture). */
  const citazioni = new Map<string, string>();
  const visita = (x: unknown, chiave: string): void => {
    if (Array.isArray(x)) x.forEach((v) => visita(v, chiave));
    else if (x !== null && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) if (k !== 'texture') visita(v, k);
    } else if (chiave === 'fonte' && typeof x === 'string' && !x.startsWith('JPL SBDB')) {
      for (const m of x.matchAll(/([A-ZÀ-Ž][\p{Ll}'-]+) et al\. \(?(\d{4})\)?/gu)) citazioni.set(`${m[1]} ${m[2]}`, x);
      const iniziale = /^([A-ZÀ-Ž][\p{Ll}'-]+)(?:,? (?:[A-Z]\.|[A-ZÀ-Ž][\p{Ll}'-]+|e [A-ZÀ-Ž][\p{Ll}'-]+))*,? \(?(\d{4})\)?[,;]/u.exec(x);
      if (iniziale) citazioni.set(`${iniziale[1]} ${iniziale[2]}`, x);
    }
  };
  visita(JSON.parse(leggi('public/data/v1/catalog.json')), '');
  const presente = (testo: string, chiave: string): boolean => {
    const [autore, anno] = chiave.split(' ');
    return new RegExp(`${autore}, [^;()]*\\(${anno}\\)`, 'u').test(testo);
  };

  it('ogni autore-anno citato nel catalogo compare in RIFERIMENTI e nel § 16.1 di PROGETTO.md', () => {
    expect(citazioni.size).toBeGreaterThan(25);
    for (const c of ['Szakáts 2023', 'Ragozzine 2009', 'Pilcher 2012', 'Brown 2023', 'Park 2021']) expect([...citazioni.keys()]).toContain(c);
    const rif = RIFERIMENTI.join('\n');
    const s161 = sezione(PROGETTO, /^### 16\.1 /);
    const mancanti = [...citazioni.keys()].filter((c) => !presente(rif, c) || !presente(s161, c));
    expect(mancanti).toEqual([]);
  });
});

describe('A22 e A24: misure e date coerenti con i dati pubblicati (VALIDAZIONE § 1 e § 12.5, PROGETTO § 8.1)', () => {
  const DATI = 'public/data/v1';
  interface VoceManifest {
    percorso: string;
    tipo: string;
    blocco?: number;
    byte: number;
  }
  const manifest = JSON.parse(leggi(`${DATI}/manifest.json`)) as {
    versioneDati: string;
    blocchi: { K: number };
    file: VoceManifest[];
  };
  const dimensione = (rel: string): number => statSync(join(RADICE, DATI, rel)).size;
  const file = readdirSync(join(RADICE, DATI), { recursive: true, encoding: 'utf8' }).filter((f) => !cartella(`${DATI}/${f}`));
  const totale = file.reduce((s, f) => s + dimensione(f), 0);
  const massimo = Math.max(...file.map(dimensione));
  // Come pack.py: manifest, catalogo, time.json, moon.bin e blocchi della data iniziale (ultimo blocco).
  const primaVista =
    dimensione('manifest.json') +
    manifest.file
      .filter(
        (v) =>
          ['catalogo', 'tempo', 'luna'].includes(v.tipo) ||
          (['pianeti', 'satelliti', 'piccoli-corpi'].includes(v.tipo) && v.blocco === manifest.blocchi.K - 1),
      )
      .reduce((s, v) => s + v.byte, 0);
  /** Intero scritto con gli spazi delle migliaia. */
  const intero = (s: string | undefined): number => Number((s ?? '').replace(/\s/g, ''));
  /** Data gg/mm/aaaa (ultima di un intervallo "gg-gg/mm/aaaa") in forma aaaa-mm-gg, confrontabile. */
  const iso = (s: string | undefined): string => {
    const m = /(\d{1,2})\/(\d{2})\/(\d{4})\s*$/.exec(s ?? '');
    return m ? `${m[3]}-${m[2]}-${(m[1] ?? '').padStart(2, '0')}` : '';
  };
  const dataManifest = manifest.versioneDati.split('-').reverse().join('/');
  const s125 = sezione(VALIDAZIONE, /^### 12\.5 /);
  const rigaDa = (md: string, inizio: string): string[] => {
    const r = md.split('\n').find((x) => x.startsWith(`| ${inizio}`)) ?? '';
    return r
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
  };

  it('A22, § 12.5 e § 8.1: numero di file, totale, file massimo e prima visualizzazione dei file pubblicati', () => {
    expect(file.length).toBe(manifest.file.length + 1);
    const a22 = riga(sezione(VALIDAZIONE, /^## 1\. /), 'A22')[2] ?? '';
    const m = /^(\d+) file, ([\d\s]+) byte; file massimo ([\d\s]+) byte; prima visualizzazione ([\d\s]+) byte/.exec(a22);
    expect(m, a22).not.toBeNull();
    expect([Number(m?.[1]), intero(m?.[2]), intero(m?.[3]), intero(m?.[4])]).toEqual([file.length, totale, massimo, primaVista]);
    expect(Number(rigaDa(s125, 'File (con il manifest)')[1])).toBe(file.length);
    expect(intero(/^([\d\s]+) byte$/.exec(rigaDa(s125, 'Totale')[1] ?? '')?.[1])).toBe(totale);
    expect(intero(/([\d\s]+) byte$/.exec(rigaDa(s125, 'File più grande')[1] ?? '')?.[1])).toBe(massimo);
    expect(intero(/^([\d\s]+) byte$/.exec(rigaDa(s125, 'Prima visualizzazione')[1] ?? '')?.[1])).toBe(primaVista);
    const s81 = /Misurati: (\d+) file, ([\d\s]+) byte; prima visualizzazione ([\d\s]+) byte/.exec(sezione(PROGETTO, /^### 8\.1 /));
    expect([Number(s81?.[1]), intero(s81?.[2]), intero(s81?.[3])]).toEqual([file.length, totale, primaVista]);
  });

  it('A24 come la pagina singola del § 12.5 (MB con due decimali, come make-artifact.mjs)', () => {
    const pagina = rigaDa(s125, 'Pagina singola')[1] ?? '';
    const p = /^(\d+); ([\d\s]+) byte; `data\/v1\/[\w/.]+` ([\d\s]+) byte; `assets\/app\.js` ([\d\s]+) byte$/.exec(pagina);
    expect(p, pagina).not.toBeNull();
    const [nPagina, totPagina, maxPagina, app] = [Number(p?.[1]), intero(p?.[2]), intero(p?.[3]), intero(p?.[4])];
    expect(maxPagina).toBe(massimo);
    expect(nPagina).toBeGreaterThan(file.length);
    expect(totPagina).toBeGreaterThanOrEqual(totale + app);
    const a24 = riga(sezione(VALIDAZIONE, /^## 1\. /), 'A24')[2] ?? '';
    const mb = (totPagina / 1e6).toFixed(2).replace('.', ',');
    expect(a24).toMatch(new RegExp(`\\b${nPagina} file, ${mb} MB\\b`));
  });

  it('SPIKE S4 e S6: ripartizione e totale dei dati pubblicati, tabella dei livelli dei piccoli corpi, file e file più grande della pagina singola', () => {
    const spike = leggi('docs/SPIKE.md');
    const mb = (b: number): string => (b / 1e6).toFixed(2).replace('.', ',');
    const spazi = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const per = (tipo: string): number => manifest.file.filter((v) => v.tipo === tipo).reduce((somma, v) => somma + v.byte, 0);
    const b11 = manifest.file.find((v) => v.percorso === 'small/b11.bin')?.byte ?? 0;
    const riepilogo = riga(sezione(spike, /^## Riepilogo/), 'S4 Budget')[2] ?? '';
    expect(riepilogo).toContain(`pianeti ${mb(per('pianeti'))} MB`);
    expect(riepilogo).toContain(`piccoli corpi ${mb(per('piccoli-corpi'))} MB con \`small/b11.bin\` ${mb(b11)} MB`);
    expect(riepilogo).toContain(`totale ${mb(totale)} MB`);
    const s4 = sezione(spike, /^## S4 /);
    expect(s4).toContain(`Satelliti ${spazi(per('satelliti'))} byte`);
    expect(s4).toContain(`texture ${spazi(per('texture'))} byte`);
    expect(s4).toContain(`totale pubblicato ${spazi(totale)} byte in ${file.length} file`);
    const blocchi = JSON.parse(leggi('scripts/pipeline/out/blocchi-piccoli-corpi.json')) as {
      livello: number;
      misure: Record<string, { totale: number; per_file: number[] }>;
    };
    expect(blocchi.misure[String(blocchi.livello)]?.totale).toBe(per('piccoli-corpi'));
    for (const [livello, m] of Object.entries(blocchi.misure)) {
      const r = s4.split('\n').find((x) => x.startsWith(`| ${livello} `)) ?? '';
      const c = r.split('|').slice(1, -1).map((x) => x.trim());
      const altri = m.per_file.filter((_, k) => k !== 11);
      expect(c[3], `livello ${livello}`).toBe(`${mb(m.totale)} MB`);
      expect(c[4], `livello ${livello}`).toBe(`${mb(m.per_file[11] ?? 0)} MB`);
      expect(c[5], `livello ${livello}`).toBe(`${mb(Math.min(...altri))}-${mb(Math.max(...altri))} MB`);
    }
    const nPagina = /^(\d+);/.exec(rigaDa(s125, 'Pagina singola')[1] ?? '')?.[1];
    const s6 = sezione(spike, /^## S6 /).split('\n').find((x) => x.startsWith('- Limiti')) ?? '';
    expect(s6).toContain(`${nPagina} file e `);
    expect(s6).toContain(`\`small/b11.bin\`, ${mb(b11)} MB`);
  });

  it('date: introduzione, § 8.1, A22 e A24 non anteriori al manifest pubblicato', () => {
    const intro = VALIDAZIONE.split('\n## ')[0] ?? '';
    expect(/\(manifest del (\d\d\/\d\d\/\d{4})\)/.exec(intro)?.[1]).toBe(dataManifest);
    expect(iso(/rieseguite il (\d\d\/\d\d\/\d{4})/.exec(intro)?.[1]) >= manifest.versioneDati).toBe(true);
    expect(/Misurata \(dati del (\d\d\/\d\d\/\d{4})\)/.exec(sezione(PROGETTO, /^### 8\.1 /))?.[1]).toBe(dataManifest);
    for (const id of ['A22', 'A24']) {
      const data = riga(sezione(VALIDAZIONE, /^## 1\. /), id).at(-1);
      expect(iso(data) >= manifest.versioneDati, `${id}: ${data}`).toBe(true);
    }
  });
});

describe('PROGETTO § 5.7: soglia dell’avviso di Vite sulla dimensione del bundle', () => {
  const limite = (mode: string): number | undefined => {
    const env: ConfigEnv = { command: 'build', mode, isSsrBuild: false, isPreview: false };
    const cfg = (typeof configura === 'function' ? configura(env) : configura) as UserConfig;
    return cfg.build?.chunkSizeWarningLimit;
  };

  it('chunkSizeWarningLimit dichiarato e motivato in § 5.7, vite.config.ts e A1; bundle misurato sotto la soglia', () => {
    const kb = limite('production');
    expect(kb).toBeGreaterThan(500);
    expect(limite('artifact')).toBe(kb);
    const voce = sezione(PROGETTO, /^### 5\.7 /).split('\n').find((r) => r.includes('chunkSizeWarningLimit')) ?? '';
    expect(voce).toContain(`\`build.chunkSizeWarningLimit = ${kb}\``);
    expect(voce).toContain('500 kB');
    expect(voce).toMatch(/un solo file JavaScript/);
    const commento = leggi('vite.config.ts')
      .split('\n')
      .filter((r) => r.trim().startsWith('//'))
      .join('\n');
    expect(commento).toMatch(/chunkSizeWarningLimit[\s\S]*500 kB/);
    expect(riga(sezione(VALIDAZIONE, /^## 1\. /), 'A1')[2]).toContain(`${kb} kB`);
    const app = /`assets\/app\.js` ([\d\s]+) byte/.exec(sezione(VALIDAZIONE, /^### 12\.5 /))?.[1] ?? '';
    const byte = Number(app.replace(/\s/g, ''));
    expect(byte).toBeGreaterThan(500_000);
    expect(byte / 1000).toBeLessThan(kb ?? 0);
  });
});

describe('METODI § 16 e § 17: masse dalle orbite dei satelliti e periodi da fonti primarie come nel catalogo', () => {
  const s16 = sezione(METODI, /^## 16\. /);
  const s17 = sezione(METODI, /^## 17\. /);
  const fisica = (b: Corpo): { gm_km3s2: { fonte: string } | null; rotazione?: { fonte: string } | null } =>
    b.fisica as { gm_km3s2: { fonte: string } | null; rotazione?: { fonte: string } | null };
  const gm = (b: Corpo): string => fisica(b).gm_km3s2?.fonte ?? '';
  const sistemi = CORPI.filter((b) => /massa del sistema/.test(gm(b)));
  const primari = CORPI.filter((b) => /massa (?:del primario|di \S+) dal modello/.test(gm(b)));
  const nomi = (s: string | undefined): string[] =>
    (s ?? '')
      .split(/,\s*|\s+e\s+/)
      .map((n) => n.trim())
      .sort();

  it('§ 16: masse del sistema e del primario dalle orbite dei satelliti', () => {
    const clausola = /masse dalle orbite dei satelliti: ([^;]*)/.exec(s16)?.[1] ?? '';
    const m = /^del sistema per (.*?), del primario per (.*)$/.exec(clausola);
    expect(m, clausola).not.toBeNull();
    expect(nomi(m?.[1])).toEqual(sistemi.map((b) => b.nome).sort());
    expect(nomi(m?.[2])).toEqual(primari.map((b) => b.nome).sort());
    expect(sistemi.map((b) => b.slug)).toContain('eris');
    expect(primari.map((b) => b.slug)).toContain('haumea');
  });

  it('§ 16: periodi di rotazione da fonti primarie (non SBDB, non WGCCRE, non sincroni del modello)', () => {
    const letteratura = CORPI.filter((b) => {
      const f = fisica(b).rotazione?.fonte ?? '';
      return f !== '' && !/^(?:Archinal|JPL SBDB|rotazione sincrona)/.test(f);
    });
    expect(letteratura.map((b) => b.slug)).toContain('eris');
    const clausola = /altrimenti SBDB o fonti primarie \(([^)]*)\)/.exec(s16)?.[1] ?? '';
    for (const b of letteratura) expect(clausola, b.slug).toContain(b.nome);
  });

  it('§ 17: la fonte di ogni massa dalle orbite dei satelliti è citata con il corpo', () => {
    for (const b of [...sistemi, ...primari]) {
      const a = /^([A-ZÀ-Ž][\p{L}'-]+)(?: et al\.| e [\p{L}'-]+)? (\d{4})/u.exec(gm(b));
      expect(a, b.slug).not.toBeNull();
      const usi = [...s17.matchAll(new RegExp(`\\b${a?.[1]}\\b[^;\\n]*?\\(${a?.[2]}\\)[^;()\\n]*\\(([^)]*)\\)`, 'gu'))].map(
        (x) => x[1] ?? '',
      );
      expect(
        usi.some((u) => u.includes(b.nome) && /massa|GM/.test(u)),
        `${b.slug}: ${a?.[1]} ${a?.[2]}`,
      ).toBe(true);
    }
  });
});
