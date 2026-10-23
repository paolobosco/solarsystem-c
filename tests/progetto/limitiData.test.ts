// Limiti della data (§ 6.6, § 11.4.3 di docs/PROGETTO.md): una sola soglia per il limite raggiunto, quella di
// limiteRaggiunto in src/time/steps.ts. Il passo, i pulsanti Indietro e Avanti della console e l'avviso del limite
// non ripetono i confronti con i limiti, che con tolleranze diverse darebbero risposte diverse sullo stesso istante.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
const FILE = ['src/ui/console.ts', 'src/ui/messaggi.ts'];

const CONFRONTI = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

const analizza = (f: string): ts.SourceFile => ts.createSourceFile(f, readFileSync(join(RADICE, f), 'utf8'), ts.ScriptTarget.Latest, true);

/** Confronti (<, <=, >, >=) con un limite dell'intervallo (`.min`, `.maxEscl`, `jdMin`, `jdMaxEscl`). */
function confrontiConLimiti(f: string): string[] {
  const sf = analizza(f);
  const trovati: string[] = [];
  const visita = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && CONFRONTI.has(n.operatorToken.kind) && /\b(min|maxEscl|jdMin|jdMaxEscl)\b/.test(n.getText(sf))) {
      trovati.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.getText(sf)}`);
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return trovati;
}

function importaLimiteRaggiunto(f: string): boolean {
  return analizza(f).statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.moduleSpecifier.text === '../time/steps' &&
      st.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(st.importClause.namedBindings) &&
      st.importClause.namedBindings.elements.some((e) => e.name.text === 'limiteRaggiunto'),
  );
}

describe('limiti della data (§ 6.6, § 11.4.3)', () => {
  it('console e messaggi leggono il limite raggiunto da limiteRaggiunto (src/time/steps.ts)', () => {
    for (const f of FILE) expect(importaLimiteRaggiunto(f), f).toBe(true);
  });

  it('console e messaggi non confrontano l\'istante con i limiti: nessuna soglia o tolleranza propria', () => {
    expect(FILE.flatMap(confrontiConLimiti)).toEqual([]);
  });
});
