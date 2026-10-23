// Anagrafica dei corpi per la scena: dati del catalogo (§ 8.10) ridotti a ciò che serve al rendering.
// ssid = indice 0..N-1 (catalogo); i vettori del motore sono indicizzati per ssid.

import { CATEGORIE_PER_PRECEDENZA } from '../data/catalogTypes';
import type { Anelli, CategoriaCorpo, CorpoCatalogo, Texture } from '../data/catalogTypes';
import { nomeBreve } from './nomi';

/** Bit della categoria nella maschera dei filtri. */
export function bitCategoria(c: CategoriaCorpo): number {
  return 1 << CATEGORIE_PER_PRECEDENZA.indexOf(c);
}

export const MASCHERA_TUTTE = (1 << CATEGORIE_PER_PRECEDENZA.length) - 1;

export interface CorpoScena {
  readonly ssid: number;
  readonly slug: string;
  readonly nome: string;
  readonly nomeBreve: string;
  readonly categoria: CategoriaCorpo;
  /** Categoria primaria e secondarie (§ 4.2). */
  readonly maschera: number;
  /** 0 = Sole, poi l'ordine del § 4.2. */
  readonly precedenza: number;
  /** ssid del primario; -1 per il Sole. */
  readonly primario: number;
  /** Semiassi [a, b, c] in km, uguali al catalogo; null se non noti (solo marcatore). */
  readonly raggi: Float64Array | null;
  readonly raggioMax: number;
  /** Periodo di rotazione siderale, ore, negativo per le rotazioni retrograde (come nel catalogo); null se non noto. */
  readonly rotazioneOre: number | null;
  readonly texture: Texture | null;
  /** Anelli del catalogo (tabelle PDS, § 9); null se assenti. */
  readonly anelli: Anelli | null;
  /** ssid delle lune (corpi con questo primario e categoria luna). */
  readonly lune: number[];
  /** Posizione nell'ordine statico di priorità (§ 11.5.2): Sole, pianeti, pianeti nani, altri per diametro. */
  rango: number;
}

/** Errore di catalogo non utilizzabile dalla scena. */
export class ErroreCatalogoScena extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreCatalogoScena';
  }
}

export class RegistroCorpi {
  readonly corpi: readonly CorpoScena[];
  readonly perSlug: ReadonlyMap<string, CorpoScena>;
  /** ssid in ordine statico di priorità. */
  readonly ordineStatico: Int32Array;
  readonly sole: number;

  constructor(catalogo: readonly CorpoCatalogo[]) {
    const n = catalogo.length;
    const perSlug = new Map<string, CorpoScena>();
    const corpi: CorpoScena[] = new Array<CorpoScena>(n);
    const ordinati = [...catalogo].sort((a, b) => a.ssid - b.ssid);
    ordinati.forEach((c, i) => {
      if (c.ssid !== i) throw new ErroreCatalogoScena(`ssid non contigui: atteso ${i}, trovato ${c.ssid}`);
    });
    const ssidDaSlug = new Map(ordinati.map((c) => [c.slug, c.ssid] as const));
    for (const c of ordinati) {
      const raggiCat = c.fisica.raggi_km?.valore ?? null;
      const raggi = raggiCat ? Float64Array.from(raggiCat) : null;
      let maschera = bitCategoria(c.categoria);
      for (const s of c.categorieSecondarie) maschera |= bitCategoria(s);
      const primario = c.primario === null ? -1 : (ssidDaSlug.get(c.primario) ?? -1);
      if (c.primario !== null && primario < 0) throw new ErroreCatalogoScena(`primario sconosciuto per ${c.slug}`);
      const corpo: CorpoScena = {
        ssid: c.ssid,
        slug: c.slug,
        nome: c.nome,
        nomeBreve: nomeBreve(c.nome, c.categoria),
        categoria: c.categoria,
        maschera,
        precedenza: CATEGORIE_PER_PRECEDENZA.indexOf(c.categoria),
        primario,
        raggi,
        raggioMax: raggi ? Math.max(raggi[0]!, raggi[1]!, raggi[2]!) : 0,
        rotazioneOre: c.fisica.rotazione?.valore ?? null,
        texture: c.texture,
        anelli: c.anelli ?? null,
        lune: [],
        rango: 0,
      };
      corpi[c.ssid] = corpo;
      perSlug.set(c.slug, corpo);
    }
    for (const c of corpi) if (c.primario >= 0 && c.categoria === 'luna') corpi[c.primario]!.lune.push(c.ssid);
    const classe = (c: CorpoScena): number =>
      c.categoria === 'sole' ? 0 : c.categoria === 'pianeta' ? 1 : c.categoria === 'pianeta-nano' ? 2 : 3;
    const ordine = corpi
      .map((c) => c.ssid)
      .sort((a, b) => {
        const ca = corpi[a]!;
        const cb = corpi[b]!;
        return classe(ca) - classe(cb) || cb.raggioMax - ca.raggioMax || a - b;
      });
    ordine.forEach((s, i) => (corpi[s]!.rango = i));
    this.corpi = corpi;
    this.perSlug = perSlug;
    this.ordineStatico = Int32Array.from(ordine);
    this.sole = corpi.find((c) => c.categoria === 'sole')?.ssid ?? 0;
  }

  get n(): number {
    return this.corpi.length;
  }

  corpo(ssid: number): CorpoScena {
    const c = this.corpi[ssid];
    if (!c) throw new ErroreCatalogoScena(`ssid sconosciuto: ${ssid}`);
    return c;
  }
}
