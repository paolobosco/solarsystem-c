// Catalogo nella lingua dell'interfaccia (RNF8 di docs/PROGETTO.md). catalog.json è in italiano; per l'inglese, dal
// dizionario catalogo.en.json: nome mostrato (per slug), alias aggiuntivi e traduzione dei testi delle fonti (dati
// fisici, sorgenti delle effemeridi, soluzione, licenze delle texture). In entrambe le lingue i nomi dell'altra lingua
// restano alias di ricerca. Gli identificatori (slug, categorie, tipo degli elementi degli anelli e delle sorgenti)
// non si traducono: il codice li confronta.

import type { Lingua } from '../ui/lingua';
import dizionarioInglese from './catalogo.en.json';
import type { Catalogo, CorpoCatalogo, ValoreFisico } from './catalogTypes';

export interface DizionarioCatalogo {
  /** Nome mostrato per slug, dove differisce dal nome del catalogo. */
  nomi: Readonly<Record<string, string>>;
  /** Alias di ricerca da aggiungere, per slug. */
  aliasAggiuntivi: Readonly<Record<string, readonly string[]>>;
  /** Testo italiano esatto, testo inglese. */
  stringhe: Readonly<Record<string, string>>;
}

export const DIZIONARIO_EN: DizionarioCatalogo = dizionarioInglese;

function unione(...elenchi: readonly (readonly string[])[]): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const e of elenchi) {
    for (const a of e) {
      if (a !== '' && !visti.has(a)) {
        visti.add(a);
        out.push(a);
      }
    }
  }
  return out;
}

function traduci(testo: string, d: DizionarioCatalogo): string {
  return d.stringhe[testo] ?? testo;
}

function valore<V>(v: ValoreFisico<V> | null | undefined, d: DizionarioCatalogo): ValoreFisico<V> | null | undefined {
  return v ? { ...v, fonte: traduci(v.fonte, d) } : v;
}

function corpoInglese(c: CorpoCatalogo, d: DizionarioCatalogo): CorpoCatalogo {
  const nome = d.nomi[c.slug] ?? c.nome;
  const fisica = c.fisica;
  const e = c.effemeridi;
  const out: CorpoCatalogo = {
    ...c,
    nome,
    // Il nome italiano resta cercabile.
    alias: unione([nome], c.alias, d.aliasAggiuntivi[c.slug] ?? [], [c.nome]),
    soluzione: { ...c.soluzione, id: traduci(c.soluzione.id, d) },
    fisica: {
      ...fisica,
      raggi_km: valore(fisica.raggi_km, d) ?? null,
      gm_km3s2: valore(fisica.gm_km3s2, d) ?? null,
      rotazione: valore(fisica.rotazione, d) ?? null,
      albedo: valore(fisica.albedo, d) ?? null,
      ...(fisica.inclinazioneAssiale_gradi === undefined ? {} : { inclinazioneAssiale_gradi: valore(fisica.inclinazioneAssiale_gradi, d) ?? null }),
    },
    texture: c.texture ? { ...c.texture, fonte: traduci(c.texture.fonte, d), licenza: traduci(c.texture.licenza, d) } : null,
  };
  if (e.modello === 'satellite' || e.modello === 'piccolo-corpo') {
    out.effemeridi = { ...e, fonti: e.fonti.map((f) => ({ ...f, descrizione: traduci(f.descrizione, d) })) };
  }
  return out;
}

/** Solo gli alias: nomi e alias inglesi di un catalogo italiano (il nome e i testi restano italiani). */
function corpoItaliano(c: CorpoCatalogo, d: DizionarioCatalogo): CorpoCatalogo {
  const inglese = d.nomi[c.slug];
  const extra = d.aliasAggiuntivi[c.slug] ?? [];
  if (inglese === undefined && extra.length === 0) return c;
  return { ...c, alias: unione(c.alias, inglese === undefined ? [] : [inglese], extra) };
}

/**
 * Catalogo nella lingua indicata. In italiano nomi e testi non cambiano; si aggiungono agli alias il nome inglese e gli
 * alias inglesi. In inglese nome mostrato, testi delle fonti e alias dal dizionario; il nome italiano diventa alias.
 */
export function localizzaCatalogo(catalogo: Catalogo, lingua: Lingua, dizionario: DizionarioCatalogo = DIZIONARIO_EN): Catalogo {
  const corpi = catalogo.corpi.map((c) => (lingua === 'en' ? corpoInglese(c, dizionario) : corpoItaliano(c, dizionario)));
  return { ...catalogo, corpi };
}
