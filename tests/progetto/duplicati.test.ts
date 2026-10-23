// Codice duplicato e campi calcolati ma mai letti (RNF4): una sola implementazione per funzione e per tabella,
// una sola sorgente per ogni colore, nessun campo di StatoVista del rendering senza lettori fuori dal modulo
// che lo calcola.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));

function sorgenti(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...sorgenti(p));
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const FILE_SRC = sorgenti(join(RADICE, 'src'));
const rel = (f: string): string => relative(RADICE, f).split('\\').join('/');
const analizza = (f: string): ts.SourceFile => ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
/** Testo senza commenti né spazi, per confrontare implementazioni. */
const normalizza = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '');

describe('duplicati in src (RNF4)', () => {
  it('nessuna funzione esportata con lo stesso nome in due moduli', () => {
    const nomi = new Map<string, string[]>();
    for (const f of FILE_SRC) {
      for (const st of analizza(f).statements) {
        if (!ts.isFunctionDeclaration(st) || !st.name || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        nomi.set(st.name.text, [...(nomi.get(st.name.text) ?? []), rel(f)]);
      }
    }
    expect([...nomi].filter(([, v]) => v.length > 1)).toEqual([]);
  });

  it('nessuna funzione di primo livello con lo stesso corpo in due moduli', () => {
    const corpi = new Map<string, string[]>();
    for (const f of FILE_SRC) {
      const sf = analizza(f);
      for (const st of sf.statements) {
        if (!ts.isFunctionDeclaration(st) || !st.body || !st.name) continue;
        const k = normalizza(st.body.getText(sf));
        if (k.length < 60) continue;
        corpi.set(k, [...(corpi.get(k) ?? []), `${rel(f)}: ${st.name.text}`]);
      }
    }
    expect([...corpi.values()].filter((v) => new Set(v.map((x) => x.split(':')[0])).size > 1)).toEqual([]);
  });

  it('nessuna tabella di oggetti (almeno 4 righe) ripetuta con gli stessi valori', () => {
    const tabelle = new Map<string, string[]>();
    for (const f of FILE_SRC) {
      const sf = analizza(f);
      const visita = (n: ts.Node): void => {
        if (ts.isArrayLiteralExpression(n) && n.elements.length >= 4 && n.elements.every((e) => ts.isObjectLiteralExpression(e))) {
          const valori = n.elements
            .map((e) =>
              (e as ts.ObjectLiteralExpression).properties.map((p) => (ts.isPropertyAssignment(p) ? normalizza(p.initializer.getText(sf)) : '?')).join(','),
            )
            .join(';');
          const riga = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          tabelle.set(valori, [...(tabelle.get(valori) ?? []), `${rel(f)}:${riga}`]);
        }
        ts.forEachChild(n, visita);
      };
      visita(sf);
    }
    expect([...tabelle.values()].filter((v) => v.length > 1)).toEqual([]);
  });

  it('nessuna tabella esportata (almeno 4 voci) che ripete per ogni chiave i valori di un\'altra', () => {
    interface Tabella {
      dove: string;
      voci: Map<string, string[]>;
    }
    /** Valori letterali di un'espressione, o null se contiene altro (identificatori, chiamate). */
    const foglie = (n: ts.Expression): string[] | null => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text.toLowerCase()];
      if (ts.isNumericLiteral(n)) return [n.text];
      if (ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand)) return [`-${n.operand.text}`];
      if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword) return [String(n.kind === ts.SyntaxKind.TrueKeyword)];
      const figli = ts.isArrayLiteralExpression(n)
        ? [...n.elements]
        : ts.isObjectLiteralExpression(n)
          ? n.properties.map((p) => (ts.isPropertyAssignment(p) ? p.initializer : null))
          : [null];
      const out: string[] = [];
      for (const f of figli) {
        const v = f ? foglie(f) : null;
        if (!v) return null;
        out.push(...v);
      }
      return out;
    };
    const svolgi = (e: ts.Expression): ts.Expression => {
      for (;;) {
        if (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
        else if (ts.isCallExpression(e) && e.arguments.length === 1 && e.expression.getText() === 'Object.freeze') e = e.arguments[0]!;
        else return e;
      }
    };
    const tabelle: Tabella[] = [];
    for (const f of FILE_SRC) {
      const sf = analizza(f);
      for (const st of sf.statements) {
        if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        for (const d of st.declarationList.declarations) {
          const o = d.initializer && svolgi(d.initializer);
          if (!o || !ts.isObjectLiteralExpression(o) || o.properties.length < 4 || !o.properties.every(ts.isPropertyAssignment)) continue;
          const voci = new Map<string, string[]>();
          for (const p of o.properties as ts.NodeArray<ts.PropertyAssignment>) {
            const v = foglie(p.initializer);
            if (!v || v.length === 0) break;
            voci.set(p.name.getText(sf).replace(/^['"]|['"]$/g, ''), v);
          }
          if (voci.size === o.properties.length) tabelle.push({ dove: `${rel(f)}: ${d.name.getText(sf)}`, voci });
        }
      }
    }
    const chiavi = (t: Tabella): string => [...t.voci.keys()].sort().join(',');
    const ripetute: string[] = [];
    for (const a of tabelle) {
      for (const b of tabelle) {
        if (a === b || a.dove.split(':')[0] === b.dove.split(':')[0] || chiavi(a) !== chiavi(b)) continue;
        if ([...a.voci].every(([k, v]) => v.every((x) => b.voci.get(k)!.includes(x)))) ripetute.push(`${a.dove} in ${b.dove}`);
      }
    }
    expect(ripetute).toEqual([]);
  });

  it('ogni colore esadecimale è scritto in un solo modulo', () => {
    const colori = new Map<string, Set<string>>();
    for (const f of FILE_SRC) {
      const sf = analizza(f);
      const visita = (n: ts.Node): void => {
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateLiteralToken(n)) {
          for (const m of n.text.matchAll(/#[0-9a-f]{6}(?:[0-9a-f]{2})?\b/gi)) {
            const c = m[0].toLowerCase();
            colori.set(c, (colori.get(c) ?? new Set()).add(rel(f)));
          }
        }
        ts.forEachChild(n, visita);
      };
      visita(sf);
    }
    expect([...colori].filter(([, v]) => v.size > 1).map(([c, v]) => `${c}: ${[...v].join(', ')}`)).toEqual([]);
  });
});

describe('StatoVista del rendering (src/render/tipi.ts)', () => {
  it("ogni campo è letto dall'applicazione o dalle prove e2e, fuori dal motore che lo calcola", () => {
    const cfg = ts.readConfigFile(join(RADICE, 'tsconfig.json'), (p) => ts.sys.readFile(p));
    const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, RADICE);
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => parsed.fileNames,
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
    const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
    const percorso = join(RADICE, 'src/render/tipi.ts');
    const sf = ls.getProgram()!.getSourceFile(percorso)!;
    const interfaccia = sf.statements.find((s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === 'StatoVista')!;
    const senzaLettori: string[] = [];
    for (const m of interfaccia.members) {
      if (!m.name) continue;
      const letture = (ls.findReferences(percorso, m.name.getStart(sf)) ?? [])
        .flatMap((r) => r.references)
        .filter((r) => !r.isDefinition && !r.isWriteAccess && /^(src|e2e)\//.test(rel(r.fileName)) && rel(r.fileName) !== 'src/render/motore.ts');
      if (letture.length === 0) senzaLettori.push(m.name.getText(sf));
    }
    expect(senzaLettori).toEqual([]);
  }, 180_000);
});
