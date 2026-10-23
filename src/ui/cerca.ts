// Ricerca dei corpi (§ 4.3, § 11.6 di docs/PROGETTO.md): normalizzazione, alias,
// corrispondenza per prefisso di parola e poi per sottostringa, al massimo 8 risultati
// raggruppati per categoria. Logica pura, senza DOM.

import type { CategoriaCorpo, CorpoCatalogo } from '../data/catalogTypes';
import { CATEGORIE_PER_PRECEDENZA } from '../data/catalogTypes';
import { T } from './testi.it';

/**
 * Separatori rimossi dalla normalizzazione (§ 11.6), più parentesi e punti delle designazioni. Okina e apostrofi in tutte
 * le varianti in uso: ʻ (U+02BB), ‘ (U+2018, sostituto tipografico e apostrofo automatico a inizio parola), ’ (U+2019),
 * ʼ (U+02BC), ' (U+0027), ` (U+0060) e ´ (U+00B4). Trattino e varianti tipografiche dei testi copiati: ‐ (U+2010),
 * ‑ (U+2011), ‒ (U+2012), – (U+2013, forma tipografica dei nomi composti: Hale–Bopp), − (U+2212) e il trattino
 * morbido (U+00AD).
 */
const SEPARATORI = /[\s\u02bb\u2018\u2019\u02bc'`\u00b4\-\u2010-\u2013\u2212\u00ad/().]+/gu;
const DIACRITICI = /\p{M}+/gu;

/** Minuscole, NFD senza diacritici, senza ʻ ‘ ’ ʼ ' ` ´, trattini, / ( ) . e spazi. */
export function normalizza(testo: string): string {
  return testo.toLowerCase().normalize('NFD').replace(DIACRITICI, '').replace(SEPARATORI, '');
}

/** Suffissi normalizzati che iniziano a un confine di parola: "9P/Tempel 1" → ["9ptempel1", "tempel1", "1"]. */
export function iniziDiParola(testo: string): string[] {
  const parole = testo
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICI, '')
    .split(SEPARATORI)
    .filter((p) => p.length > 0);
  const out: string[] = [];
  for (let i = 0; i < parole.length; i++) out.push(parole.slice(i).join(''));
  return out;
}

interface Chiave {
  piena: string;
  inizi: string[];
}

interface VoceIndice {
  corpo: CorpoCatalogo;
  precedenza: number;
  chiavi: Chiave[];
}

export interface IndiceRicerca {
  readonly voci: readonly VoceIndice[];
}

/**
 * Testo secondario di un risultato di Trova (§ 4.3, § 11.6): per le lune il pianeta; per gli altri corpi il numero e il nome
 * ufficiale o la designazione, come nell'intestazione della scheda, senza ripetere ciò che il nome contiene già
 * ("433 · A898 PA" per Eros, nessun testo per 1P/Halley). null se non resta nulla da aggiungere.
 */
export function dettaglioRicerca(c: CorpoCatalogo, primario: CorpoCatalogo | undefined): string | null {
  if (c.categoria === 'luna' && primario) return T.trova.lunaDi(primario.nome);
  const parti: string[] = [];
  if (c.numero !== null && !c.nome.startsWith(`${c.numero} `)) parti.push(String(c.numero));
  // Il nome ufficiale già nel nome come parola intera ("Europa" in "52 Europa") non si ripete; "Pluto" non è in "Plutone".
  if (c.nomeUfficiale && !` ${c.nome} `.includes(` ${c.nomeUfficiale} `)) parti.push(c.nomeUfficiale);
  else if (c.designazione && c.designazione !== c.nome && !c.nome.startsWith(c.designazione)) parti.push(c.designazione);
  return parti.length === 0 ? null : parti.join(' · ');
}

/** Testi di ricerca di un corpo: nome, nome ufficiale, numero, designazione, alias, slug (§ 4.3). */
export function testiDiRicerca(c: CorpoCatalogo): string[] {
  const testi = [c.nome, c.slug];
  if (c.nomeUfficiale) testi.push(c.nomeUfficiale);
  if (c.designazione) testi.push(c.designazione);
  if (c.numero !== null) {
    testi.push(String(c.numero));
    testi.push(`${c.numero} ${c.nomeUfficiale ?? c.nome}`);
    testi.push(`${c.numero} ${c.nome}`);
  }
  for (const a of c.alias) testi.push(a);
  return testi;
}

export function creaIndice(corpi: readonly CorpoCatalogo[]): IndiceRicerca {
  const voci = corpi.map((corpo) => {
    const visti = new Set<string>();
    const chiavi: Chiave[] = [];
    for (const t of testiDiRicerca(corpo)) {
      const piena = normalizza(t);
      if (piena.length === 0 || visti.has(piena)) continue;
      visti.add(piena);
      chiavi.push({ piena, inizi: iniziDiParola(t) });
    }
    const precedenza = CATEGORIE_PER_PRECEDENZA.indexOf(corpo.categoria);
    return { corpo, precedenza: precedenza < 0 ? CATEGORIE_PER_PRECEDENZA.length : precedenza, chiavi };
  });
  return { voci };
}

/** 0 uguale, 1 prefisso del nome, 2 prefisso di parola, 3 sottostringa. */
export type Rango = 0 | 1 | 2 | 3;

export interface RisultatoRicerca {
  corpo: CorpoCatalogo;
  rango: Rango;
}

export interface GruppoRisultati {
  categoria: CategoriaCorpo;
  risultati: RisultatoRicerca[];
}

function rangoDi(voce: VoceIndice, q: string): Rango | null {
  let migliore: Rango | null = null;
  for (const k of voce.chiavi) {
    let r: Rango | null = null;
    if (k.piena === q) r = 0;
    else if (k.piena.startsWith(q)) r = 1;
    else if (k.inizi.some((s) => s.startsWith(q))) r = 2;
    else if (k.piena.includes(q)) r = 3;
    if (r !== null && (migliore === null || r < migliore)) migliore = r;
    if (migliore === 0) break;
  }
  return migliore;
}

export const MAX_RISULTATI = 8;

/**
 * Confronto dei nomi con i numeri come numeri: le designazioni delle comete e degli interstellari seguono l'ordine
 * numerico (1P, 9P, 12P, 103P). Lo usano lo spareggio dei risultati di Trova e la colonna Corpo della vista testuale.
 */
export const CONFRONTO_NOMI = new Intl.Collator('it', { numeric: true });

/** Risultati ordinati per rango, categoria (precedenza) e nome (numeri come numeri, `CONFRONTO_NOMI`). */
export function cerca(indice: IndiceRicerca, query: string, max = MAX_RISULTATI): RisultatoRicerca[] {
  const q = normalizza(query);
  if (q.length === 0) return [];
  const trovati: { voce: VoceIndice; rango: Rango }[] = [];
  for (const voce of indice.voci) {
    const rango = rangoDi(voce, q);
    if (rango !== null) trovati.push({ voce, rango });
  }
  trovati.sort(
    (a, b) =>
      a.rango - b.rango ||
      a.voce.precedenza - b.voce.precedenza ||
      CONFRONTO_NOMI.compare(a.voce.corpo.nome, b.voce.corpo.nome) ||
      a.voce.corpo.ssid - b.voce.corpo.ssid,
  );
  return trovati.slice(0, max).map((t) => ({ corpo: t.voce.corpo, rango: t.rango }));
}

/** Raggruppa per categoria primaria, nell'ordine della prima comparsa (il gruppo migliore per primo). */
export function raggruppaRisultati(risultati: readonly RisultatoRicerca[]): GruppoRisultati[] {
  const gruppi: GruppoRisultati[] = [];
  for (const r of risultati) {
    let g = gruppi.find((x) => x.categoria === r.corpo.categoria);
    if (!g) {
      g = { categoria: r.corpo.categoria, risultati: [] };
      gruppi.push(g);
    }
    g.risultati.push(r);
  }
  return gruppi;
}

/**
 * Risultati nell'ordine mostrato: gruppi per categoria uno dopo l'altro. Frecce, aria-activedescendant e Invio
 * seguono quest'ordine (pattern combobox APG, § 11.6).
 */
export function ordineVisivo(risultati: readonly RisultatoRicerca[]): RisultatoRicerca[] {
  return raggruppaRisultati(risultati).flatMap((g) => g.risultati);
}
