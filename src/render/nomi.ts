// Nomi brevi nella scena (§ 11.5.2): "Hale-Bopp", "67P". La designazione completa resta nella scheda.

import type { CategoriaCorpo } from '../data/catalogTypes';

/** Lunghezza massima del nome di una cometa periodica mostrato al posto della sigla. */
const MAX_NOME_PERIODICA = 10;
/** Lunghezza massima del nome tra parentesi delle comete non periodiche. */
const MAX_NOME_PARENTESI = 18;

/**
 * Nome breve: per le comete non periodiche il nome tra parentesi ("C/1995 O1 (Hale-Bopp)" → "Hale-Bopp"),
 * oppure la designazione se il nome è descrittivo; per le periodiche il nome se breve, altrimenti la sigla
 * ("67P/Churyumov-Gerasimenko" → "67P"). Gli altri corpi, interstellari compresi, mantengono il nome.
 */
export function nomeBreve(nome: string, categoria: CategoriaCorpo): string {
  if (categoria === 'interstellare') return nome;
  const parentesi = /^([A-Z]\/\S+(?:\s\S+)?)\s*\(([^)]+)\)\s*$/.exec(nome);
  if (parentesi) {
    const designazione = parentesi[1]!.trim();
    const interno = parentesi[2]!.trim();
    const descrittivo = interno.split(/\s+/).length > 2 || interno.length > MAX_NOME_PARENTESI;
    return descrittivo ? designazione : interno;
  }
  const periodica = /^(\d+[PD])\/(.+)$/.exec(nome);
  if (periodica) {
    const sigla = periodica[1]!;
    const proprio = periodica[2]!.trim();
    return proprio.length <= MAX_NOME_PERIODICA ? proprio : sigla;
  }
  return nome;
}
