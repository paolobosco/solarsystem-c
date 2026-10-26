// Catalogo dei corpi, data/v1/catalog.json (§ 8.10 di docs/PROGETTO.md): lettura, verifiche e indici.
// La validazione completa contro docs/schema/catalog.schema.json avviene nella pipeline (catalog.py) e nei
// test; a runtime si verificano la struttura usata dal codice e i vincoli del criterio A22.

import type { DataStore } from './types';
import { RE_SLUG } from './catalogTypes';
import type { Catalogo, CategoriaCorpo, CorpoCatalogo } from './catalogTypes';
import { localizzaCatalogo } from './catalogoLingua';
import { jsonDaBuffer } from './dataStore';
import type { Lingua } from '../ui/lingua';

export const PERCORSO_CATALOGO = 'catalog.json';

const CATEGORIE = new Set<CategoriaCorpo>([
  'sole',
  'pianeta',
  'pianeta-nano',
  'luna',
  'interstellare',
  'cometa',
  'centauro',
  'tno',
  'asteroide',
]);

/** Catalogo non conforme. */
export class ErroreCatalogo extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreCatalogo';
  }
}

function controlla(cond: boolean, messaggio: string): asserts cond {
  if (!cond) throw new ErroreCatalogo(messaggio);
}

/**
 * Verifica il catalogo: formato, ssid = indice (0..N-1), slug validi e unici, categorie note, primari esistenti
 * (null solo per il Sole), campi strutturati presenti. Restituisce lo stesso oggetto tipizzato.
 */
export function leggiCatalogo(json: unknown): Catalogo {
  controlla(typeof json === 'object' && json !== null, 'catalogo: oggetto atteso');
  const c = json as Partial<Catalogo>;
  controlla(c.formato === 1, 'catalogo: formato non supportato');
  controlla(typeof c.generato === 'string', 'catalogo: campo generato assente');
  controlla(Array.isArray(c.corpi) && c.corpi.length > 0, 'catalogo: elenco dei corpi assente');
  controlla(Array.isArray(c.categorie), 'catalogo: elenco delle categorie assente');
  const slug = new Set<string>();
  for (const [i, b] of c.corpi.entries()) {
    controlla(typeof b === 'object' && b !== null, `corpo ${i}: oggetto atteso`);
    controlla(b.ssid === i, `corpo ${i}: ssid ${String(b.ssid)} diverso dall'indice`);
    controlla(typeof b.slug === 'string' && RE_SLUG.test(b.slug), `corpo ${i}: slug non valido`);
    controlla(!slug.has(b.slug), `slug duplicato: ${b.slug}`);
    slug.add(b.slug);
    controlla(typeof b.nome === 'string' && b.nome.length > 0, `${b.slug}: nome assente`);
    controlla(CATEGORIE.has(b.categoria), `${b.slug}: categoria non valida`);
    controlla(Array.isArray(b.categorieSecondarie) && b.categorieSecondarie.every((x) => CATEGORIE.has(x)), `${b.slug}: categorie secondarie non valide`);
    controlla(Array.isArray(b.alias), `${b.slug}: alias assenti`);
    controlla(typeof b.effemeridi === 'object' && b.effemeridi !== null, `${b.slug}: effemeridi assenti`);
    controlla(typeof b.soluzione === 'object' && b.soluzione !== null, `${b.slug}: soluzione assente`);
    controlla(typeof b.fisica === 'object' && b.fisica !== null, `${b.slug}: fisica assente`);
    controlla(typeof b.orientamento === 'object' && b.orientamento !== null, `${b.slug}: orientamento assente`);
    controlla(b.texture === null || typeof b.texture === 'object', `${b.slug}: texture non valida`);
    controlla(b.epsModelloCostante === null || (typeof b.epsModelloCostante === 'number' && b.epsModelloCostante >= 0), `${b.slug}: epsModelloCostante non valido`);
    if (b.orientamento.modello === 'wgccre') {
      const k = b.orientamento.coefficienti;
      controlla(k !== null && Array.isArray(k.alfa0) && Array.isArray(k.delta0) && Array.isArray(k.w) && Array.isArray(k.periodici), `${b.slug}: coefficienti WGCCRE assenti`);
    }
  }
  for (const b of c.corpi) {
    if (b.categoria === 'sole') controlla(b.primario === null, `${b.slug}: il Sole non ha primario`);
    else controlla(typeof b.primario === 'string' && slug.has(b.primario), `${b.slug}: primario sconosciuto`);
  }
  return c as Catalogo;
}

/** Indici del catalogo per ssid e slug, e satelliti per primario. */
export class IndiceCatalogo {
  readonly catalogo: Catalogo;
  private readonly perSlugMap = new Map<string, CorpoCatalogo>();
  private readonly figliMap = new Map<string, CorpoCatalogo[]>();

  constructor(catalogo: Catalogo) {
    this.catalogo = catalogo;
    for (const c of catalogo.corpi) {
      this.perSlugMap.set(c.slug, c);
      if (c.primario !== null) {
        const l = this.figliMap.get(c.primario) ?? [];
        l.push(c);
        this.figliMap.set(c.primario, l);
      }
    }
  }

  get corpi(): readonly CorpoCatalogo[] {
    return this.catalogo.corpi;
  }

  /** Corpo con l'ssid indicato (ssid = indice nel catalogo). */
  perSsid(ssid: number): CorpoCatalogo | undefined {
    return Number.isInteger(ssid) ? this.catalogo.corpi[ssid] : undefined;
  }

  perSlug(slug: string): CorpoCatalogo | undefined {
    return this.perSlugMap.get(slug);
  }

  /** Corpi che hanno lo slug indicato come primario (satelliti di un pianeta, pianeti del Sole). */
  figli(slug: string): readonly CorpoCatalogo[] {
    return this.figliMap.get(slug) ?? [];
  }

  /** Corpi la cui categoria primaria o secondaria è quella indicata (§ 4.2, RF6). */
  perCategoria(cat: CategoriaCorpo): CorpoCatalogo[] {
    return this.catalogo.corpi.filter((c) => c.categoria === cat || c.categorieSecondarie.includes(cat));
  }
}

/**
 * Legge catalog.json dall'archivio dei dati (verificato con il manifest) e costruisce gli indici, con nomi e testi
 * nella lingua indicata (catalogoLingua.ts; predefinita l'italiano, la lingua dei dati).
 */
export async function caricaCatalogo(store: DataStore, segnale?: AbortSignal, lingua: Lingua = 'it'): Promise<IndiceCatalogo> {
  const buf = await store.carica(PERCORSO_CATALOGO, segnale);
  return new IndiceCatalogo(localizzaCatalogo(leggiCatalogo(jsonDaBuffer(buf)), lingua));
}
