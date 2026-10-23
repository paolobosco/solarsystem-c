// Codice morto: esportazioni di src mai usate, costanti di build e token CSS mai letti.
// Riferimenti cercati con il servizio di linguaggio di TypeScript su tutti i file di tsconfig.json
// (src, tests, e2e e configurazioni).

import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { ConfigEnv, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import configura from '../../vite.config';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));

/** Esportazioni usate solo per nome da un import di namespace (nessun riferimento diretto). */
const USATE_PER_NOME = new Set([
  // tests/ephem/constants.test.ts confronta ogni chiave di constants.json con import * as costanti.
  'src/ephem/constants.ts: JD_CAMBIO_DE441',
]);

function servizio(): { ls: ts.LanguageService; file: string[] } {
  const cfg = ts.readConfigFile(join(RADICE, 'tsconfig.json'), (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, RADICE);
  const file = parsed.fileNames;
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => file,
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => {
      const t = ts.sys.readFile(f);
      return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
    },
    getCurrentDirectory: () => RADICE,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (p) => ts.sys.fileExists(p),
    readFile: (p) => ts.sys.readFile(p),
    readDirectory: (...a) => ts.sys.readDirectory(...a),
    directoryExists: (p) => ts.sys.directoryExists(p),
    getDirectories: (p) => ts.sys.getDirectories(p),
  };
  return { ls: ts.createLanguageService(host, ts.createDocumentRegistry()), file };
}

describe('codice morto', () => {
  it('ogni esportazione di src è usata', () => {
    const { ls, file } = servizio();
    const programma = ls.getProgram()!;
    const checker = programma.getTypeChecker();
    const inutilizzate: string[] = [];
    for (const f of file) {
      const rel = relative(RADICE, f).split('\\').join('/');
      if (!rel.startsWith('src/') || rel.endsWith('.d.ts')) continue;
      const sf = programma.getSourceFile(f);
      const modulo = sf ? checker.getSymbolAtLocation(sf) : undefined;
      if (!sf || !modulo) continue;
      for (const esportazione of checker.getExportsOfModule(modulo)) {
        const decl = esportazione.declarations?.[0];
        if (!decl || decl.getSourceFile() !== sf) continue;
        const nodo = ts.getNameOfDeclaration(decl) ?? decl;
        const usi = (ls.findReferences(f, nodo.getStart()) ?? []).flatMap((r) => r.references).filter((r) => !r.isDefinition);
        const chiave = `${rel}: ${esportazione.name}`;
        if (usi.length === 0 && !USATE_PER_NOME.has(chiave)) inutilizzate.push(chiave);
      }
    }
    expect(inutilizzate).toEqual([]);
  }, 180_000);

  it('ogni testo di src/ui/testi.it.ts è letto (RNF8, § 11.14)', () => {
    const { ls } = servizio();
    const programma = ls.getProgram()!;
    const percorso = join(RADICE, 'src/ui/testi.it.ts');
    const sf = programma.getSourceFile(percorso)!;
    // Solo le letture in src contano: un testo letto soltanto dalle prove non è mostrato.
    const usi = (f: string, pos: number) =>
      (ls.findReferences(f, pos) ?? [])
        .flatMap((r) => r.references)
        .filter((r) => !r.isDefinition && relative(RADICE, r.fileName).split('\\').join('/').startsWith('src/'));
    const nodoA = (s: ts.SourceFile, pos: number): ts.Node => {
      let n: ts.Node = s;
      for (;;) {
        const figlio = n.getChildren(s).find((c) => c.getStart(s) <= pos && pos < c.getEnd());
        if (!figlio) return n;
        n = figlio;
      }
    };
    // Contenitore letto con un indice dinamico (X[k], anche tramite un alias const S = T.x) o passato per intero a
    // un altro tipo (testi della scena): i figli sono usati.
    const dinamico = (f: string, pos: number, profondita = 0): boolean =>
      usi(f, pos).some((r) => {
        const s = programma.getSourceFile(r.fileName);
        if (!s) return false;
        const n = nodoA(s, r.textSpan.start);
        const e = ts.isPropertyAccessExpression(n.parent) && n.parent.name === n ? n.parent : n;
        const p = e.parent;
        if (ts.isElementAccessExpression(p) && p.expression === e) return true;
        if (ts.isVariableDeclaration(p) && p.initializer === e) return profondita === 0 && dinamico(r.fileName, p.name.getStart(s), 1);
        return !(ts.isPropertyAccessExpression(p) && p.expression === e) && !ts.isImportSpecifier(p) && !ts.isExportSpecifier(p);
      });
    const nonLetti: string[] = [];
    const visita = (o: ts.ObjectLiteralExpression, prefisso: string): void => {
      for (const p of o.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const chiave = `${prefisso}.${p.name.getText(sf)}`;
        let init: ts.Expression = p.initializer;
        while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
        if (ts.isObjectLiteralExpression(init)) {
          if (!dinamico(percorso, p.name.getStart(sf))) visita(init, chiave);
        } else if (usi(percorso, p.name.getStart(sf)).length === 0) nonLetti.push(chiave);
      }
    };
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        let init = d.initializer;
        while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) init = init.expression;
        if (init && ts.isObjectLiteralExpression(init) && !dinamico(percorso, d.name.getStart(sf))) visita(init, d.name.getText(sf));
      }
    }
    expect(nonLetti).toEqual([]);
  }, 180_000);

  it('ogni costante di build di vite.config.ts è letta da src', () => {
    const lettura = (p: string): string => ts.sys.readFile(p) ?? '';
    const sorgenti = ts.sys
      .readDirectory(join(RADICE, 'src'), ['.ts'])
      .filter((p) => !p.endsWith('.d.ts'))
      .map(lettura)
      .join('\n');
    for (const mode of ['production', 'test', 'artifact']) {
      const env: ConfigEnv = { command: 'build', mode, isSsrBuild: false, isPreview: false };
      const cfg = (typeof configura === 'function' ? configura(env) : configura) as UserConfig;
      for (const nome of Object.keys(cfg.define ?? {})) {
        expect(new RegExp(`\\b${nome}\\b`).test(sorgenti), `${mode}: ${nome}`).toBe(true);
      }
    }
  });

  it('ogni token di src/ui/tokens.css è letto da un foglio di stile, da una pagina o dal codice', () => {
    const lettura = (p: string): string => ts.sys.readFile(p) ?? '';
    const token = new Set([...lettura(join(RADICE, 'src/ui/tokens.css')).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
    const sorgenti = [
      ...ts.sys.readDirectory(join(RADICE, 'src'), ['.css', '.ts']),
      ...['index.html', 'ui-lab.html', 'render-lab.html'].map((f) => join(RADICE, f)),
    ]
      .map(lettura)
      .join('\n');
    const nonLetti = [...token].filter((t) => !new RegExp(`var\\(\\s*${t}\\s*[,)]|['"\`]${t}['"\`]`).test(sorgenti));
    expect(token.size).toBeGreaterThan(20);
    expect(nonLetti).toEqual([]);
  });
});
