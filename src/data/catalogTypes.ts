// Tipi del catalogo dei corpi, data/v1/catalog.json (§ 8.10 di docs/PROGETTO.md).
// Schema JSON corrispondente: docs/schema/catalog.schema.json (draft 2020-12).
// Unità: km, km³/s², radianti dove non indicato; tempi in JD TDB.

/** Slug: identificatore stabile usato in hash, catalogo e test (RNF7). */
export const RE_SLUG = /^[a-z0-9-]{1,40}$/;

export type CategoriaCorpo =
  | 'sole'
  | 'pianeta'
  | 'pianeta-nano'
  | 'luna'
  | 'interstellare'
  | 'cometa'
  | 'centauro'
  | 'tno'
  | 'asteroide';

/** Categorie in ordine di precedenza per la categoria primaria (§ 4.2); il Sole precede tutte. */
export const CATEGORIE_PER_PRECEDENZA: readonly CategoriaCorpo[] = [
  'sole',
  'pianeta',
  'pianeta-nano',
  'luna',
  'interstellare',
  'cometa',
  'centauro',
  'tno',
  'asteroide',
];

export interface CategoriaCatalogo {
  id: CategoriaCorpo;
  /** 0 = precedenza massima (§ 4.2). */
  precedenza: number;
  /** false per il Sole, che non ha filtro (RF6). */
  filtrabile: boolean;
}

// Effemeridi

export type TipoFonte =
  | 'de441'
  | 'spk-satellitare'
  | 'kepleriana'
  | 'secolare'
  | 'spk-horizons'
  | 'record-dastcom'
  | 'sb441-n16'
  | 'assist';

/** Sorgente delle effemeridi in un intervallo [inizio, fine) (§ 7.5.1, § 7.6.1, § 8.6). */
export interface FonteIntervallo {
  tipo: TipoFonte;
  inizio: number; // JD TDB
  fine: number; // JD TDB, escluso
  /** File, soluzione o record: ad esempio "jup365", "JPL#75", "1P/-239". */
  descrizione: string;
  /** Varianti di modello (ASSIST): ad esempio "senza-ng", "senza-asteroidi", "salto-record". */
  varianti: string[];
  /** Salto misurato alla giunzione con la fonte precedente, km; null se non applicabile. */
  saltoGiunzioneKm: number | null;
  /**
   * Satelliti: errore radiale massimo dei record dell'intervallo rispetto alla propria fonte, km (per l'intervallo
   * secolare il residuo radiale dell'adattamento); si somma in quadratura a ε·d (§ 7.5.6). Assente o null: non misurato.
   */
  erroreRadialeKm?: number | null;
}

export interface EffemeridiSole {
  modello: 'sole';
}

export interface EffemeridiPianeta {
  modello: 'pianeta';
  /** Codice NAIF del baricentro tabulato in DE441 (1-9; 3 = baricentro Terra-Luna per la Terra). */
  naifDE441: number;
}

export interface EffemeridiLuna {
  modello: 'luna';
}

/** Arco osservativo della soluzione, in anni (epoca giuliana). */
export interface ArcoOsservativo {
  inizio: number;
  fine: number;
}

export interface EffemeridiSatellite {
  modello: 'satellite';
  /** Matrice R_F (sistema F → eclittica J2000), 9 numeri per righe (§ 7.5.2). */
  rF: number[];
  /** Frequenze ν_k dei termini periodici, rad/d, al massimo 6. */
  frequenze: number[];
  /** null: si usa 1900-2020 (§ 7.5.6). */
  arcoOsservativo: ArcoOsservativo | null;
  fonti: FonteIntervallo[];
  /**
   * Origine del modello: centro del pianeta (predefinita) oppure baricentro del sistema, per i satelliti
   * circumbinari (Notte, Idra) attorno a Plutone-Caronte.
   */
  centro?: 'pianeta' | 'baricentro';
  /**
   * Vero se il piano di Laplace segue l'equatore del primario: negli intervalli 'secolare' il sistema F ruota con il
   * polo WGCCRE del primario dall'epoca di giunzione (§ 7.5.4). Assente: F fisso.
   */
  pianoSegueEquatore?: boolean;
}

export interface EffemeridiPiccoloCorpo {
  modello: 'piccolo-corpo';
  fonti: FonteIntervallo[];
}

export type Effemeridi =
  | EffemeridiSole
  | EffemeridiPianeta
  | EffemeridiLuna
  | EffemeridiSatellite
  | EffemeridiPiccoloCorpo;

// Soluzione orbitale

/** Funzione g(r) di Marsden et al. 1973: g = α·(r/r0)^(-m)·(1 + (r/r0)^n)^(-k). */
export interface FunzioneG {
  alfa: number;
  r0: number; // au
  m: number;
  n: number;
  k: number;
}

/** Parametri non gravitazionali della soluzione (Marsden et al. 1973), come in SBDB. */
export interface ModelloNG {
  A1: number | null; // au/d²
  A2: number | null; // au/d²
  A3: number | null; // au/d²
  DT: number | null; // d
  g: FunzioneG | null; // null: funzione standard del ghiaccio d'acqua
}

export interface Soluzione {
  /** Identificativo: "DE441", "JPL#75", nome del kernel satellitare. */
  id: string;
  /** Data della soluzione (ISO 8601), se nota. */
  data: string | null;
  /** Data di estrazione (AAAA-MM-GG). */
  estrazione: string | null;
  modelloNG: ModelloNG | null;
  /** Record DASTCOM usati per le comete a record (§ 7.6.1). */
  recordDastcom: string[] | null;
}

// Dati fisici

/** Valore fisico con fonte (RNF5); l'incertezza ha la stessa forma e unità del valore. */
export interface ValoreFisico<T> {
  valore: T;
  incertezza: T | null;
  fonte: string;
  anno: number | null;
}

export type Raggi = [number, number, number];

export interface Fisica {
  /** Semiassi dell'ellissoide [a, b, c], km. */
  raggi_km: ValoreFisico<Raggi> | null;
  gm_km3s2: ValoreFisico<number> | null;
  /** Periodo di rotazione siderale, ore. */
  rotazione: ValoreFisico<number> | null;
  /** Albedo geometrica. */
  albedo: ValoreFisico<number> | null;
  /** Inclinazione assiale in gradi, derivata da polo e piano orbitale (§ 9); assente se non calcolata. */
  inclinazioneAssiale_gradi?: ValoreFisico<number> | null;
}

// Orientamento

export type ModelloOrientamento = 'wgccre' | 'vondrak' | 'cassini' | 'sincrono' | 'fisso';
export type ConvenzionePolo = 'nord-IAU' | 'momento-angolare';

/** Termine periodico WGCCRE: ampiezza · funzione(argomento0 + argomento1 · t), in gradi. */
export interface TerminePeriodico {
  coordinata: 'alfa0' | 'delta0' | 'w';
  funzione: 'sin' | 'cos';
  ampiezza: number; // gradi
  argomento: [number, number]; // gradi, gradi per unità
  unita: 'giorno' | 'secolo'; // d o T da J2000 TDB
}

/** Modello WGCCRE (Archinal et al. 2018): polinomi in T (secoli) per α0, δ0 e in d (giorni) per W, in gradi. */
export interface CoefficientiWgccre {
  alfa0: number[];
  delta0: number[];
  w: number[];
  periodici: TerminePeriodico[];
}

export interface Orientamento {
  modello: ModelloOrientamento;
  /** WGCCRE, oppure polo e fase fissi per 'fisso'; null se gli assi sono quelli dell'eclittica J2000. */
  coefficienti: CoefficientiWgccre | null;
  convenzionePolo: ConvenzionePolo;
  /** Vero se l'orientamento è indicativo a ogni epoca (ad esempio Iperione). */
  indicativo: boolean;
}

// Texture

export interface Texture {
  /** Percorso relativo in data/v1/ (ad esempio "tex/terra.jpg"). */
  file: string;
  /** Coordinata u (0..1) della longitudine 0. */
  lon0_u: number;
  /** Verso delle longitudini crescenti lungo u. */
  verso: 'est' | 'ovest';
  fonte: string;
  licenza: string;
  areeNonOsservate: 'nessuna' | 'parziali' | 'emisfero-sud';
}

// Anelli (§ 9, R7): raggi dalle tabelle del PDS Ring-Moon Systems Node, profilo schematico

export interface ElementoAnello {
  nome: string;
  /** denso, tenue, lacuna o anello stretto, dal tipo indicato nella tabella sorgente. */
  tipo: 'denso' | 'tenue' | 'lacuna' | 'stretto';
  rInterno_km: number;
  rEsterno_km: number;
  /** Profondità ottica normale [minima, massima] indicata dalla fonte; null se non indicata. */
  tau: [number, number] | null;
  /** 0 = struttura principale, 1 = struttura contenuta in un elemento più ampio. */
  livello: 0 | 1;
}

export interface Anelli {
  fonte: string;
  /** Data di estrazione della tabella (AAAA-MM-GG). */
  estrazione: string | null;
  profilo: 'schematico';
  /** Piano degli anelli: equatore del pianeta (polo del modello di orientamento). */
  piano: 'equatore';
  elementi: ElementoAnello[];
}

// Corpo e radice

export interface CorpoCatalogo {
  /** Indice 0..N-1, stabile nella versione del formato. */
  ssid: number;
  slug: string;
  nome: string;
  nomeUfficiale: string | null;
  /** Numero MPC del piccolo corpo. */
  numero: number | null;
  designazione: string | null;
  alias: string[];
  categoria: CategoriaCorpo;
  categorieSecondarie: CategoriaCorpo[];
  naif: number | null;
  spkid: number | null;
  /** Designazione usata per le interrogazioni SBDB (scripts/pipeline/bodies.json). */
  sbdb?: string | null;
  /** Slug del corpo attorno a cui orbita; null solo per il Sole. */
  primario: string | null;
  effemeridi: Effemeridi;
  soluzione: Soluzione;
  fisica: Fisica;
  orientamento: Orientamento;
  texture: Texture | null;
  /** Anelli di Saturno e Urano; assente per gli altri corpi. */
  anelli?: Anelli | null;
  /** rad, per i corpi senza serie in reliability.bin. */
  epsModelloCostante: number | null;
}

export interface Catalogo {
  formato: 1;
  /** Istante di generazione, ISO 8601. */
  generato: string;
  corpi: CorpoCatalogo[];
  categorie: CategoriaCatalogo[];
}
