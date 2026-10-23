// Tipi condivisi del modulo di rendering, riesportati da src/render/api.ts.

import type { CategoriaCorpo } from '../data/catalogTypes';
import type { Livello, StatoEffemeride } from '../ephem/types';

/** Livelli visivi (RF5). */
export interface LivelliVisivi {
  orbite: boolean;
  etichette: boolean;
  marcatori: boolean;
  anelliDistanza: boolean;
  grigliaEclittica: boolean;
  eclitticaData: boolean;
  assiRotazione: boolean;
  anelliPlanetari: boolean;
  stelle: boolean;
  /** Barra di scala dell'interfaccia (src/ui/scala.ts, R14): la scena la memorizza soltanto. */
  barraScala: boolean;
}

/** Stato all'avvio (§ 10.1 R11, § 10.2, RF5): griglia ed eclittica della data disattivate. */
export const LIVELLI_PREDEFINITI: Readonly<LivelliVisivi> = Object.freeze({
  orbite: true,
  etichette: true,
  marcatori: true,
  anelliDistanza: true,
  grigliaEclittica: false,
  eclitticaData: false,
  assiRotazione: false,
  anelliPlanetari: true,
  stelle: true,
  barraScala: true,
});

/**
 * Inquadratura al cambio di fuoco: 'mantieni' (distanza attuale), 'corpo' (disco circa al 40% del
 * lato minore), 'orbita' (orbita intera attorno al primario), 'sistema' (lune regolari del pianeta),
 * oppure un'estensione esplicita della vista in km.
 */
export type Inquadratura = 'mantieni' | 'corpo' | 'orbita' | 'sistema' | { estensioneKm: number };

export interface OpzioniFuoco {
  /** Transizione animata di 1,5 s (immediata con movimento ridotto). Predefinito: true. */
  transizione?: boolean;
  /** Predefinito: 'mantieni'. */
  inquadratura?: Inquadratura;
  /**
   * Elevazione finale della camera (rad), con lo stesso azimut: sull'eclittica o, con vistaSistema, sul piano del
   * sistema (predefinita 30°). Facoltativa: senza, resta la direzione attuale.
   */
  elevazione?: number;
  /**
   * Direzione riferita al piano del sistema del corpo (§ 11.3): polo dell'orbita della luna di raggio maggiore o, senza
   * lune con stato, asse di rotazione; stesso azimut attorno al polo e stesso lato del piano. Predefinito: vero con
   * l'inquadratura 'sistema' (contatore "+N lune", § 11.5.1), falso altrimenti.
   */
  vistaSistema?: boolean;
}

export interface EventoSelezione {
  /** ssid scelto, o null per la deselezione. */
  ssid: number | null;
  /** Posizione nel ciclo dei candidati sovrapposti (1..totale). */
  indice: number;
  totale: number;
  origine: 'puntatore' | 'etichetta';
}

export interface StatoVista {
  fuoco: number;
  selezione: number | null;
  /** Distanza tra camera e centro del corpo a fuoco (dell'origine se il corpo non ha posizione), km. */
  distanzaKm: number;
  /** Lato minore della vista alla distanza del fuoco, km (regolo delle distanze). */
  estensioneKm: number;
  /**
   * R14: km per pixel alla distanza del corpo a fuoco, cioè alla profondità del suo centro lungo l'asse ottico
   * (uguale alla distanza col corpo al centro della vista; barra di scala dell'interfaccia).
   */
  kmPerPx: number;
  transizione: boolean;
  /**
   * Il corpo a fuoco non ha posizione a questa data (§ 7.8.2): l'origine, l'inquadratura e la distanza minima si
   * riferiscono al primo antenato con posizione.
   */
  fuocoSenzaPosizione: boolean;
  /** Contesto WebGL perso (R13): disegno ed etichette sospesi fino al ripristino. */
  contestoPerso: boolean;
  larghezzaPx: number;
  altezzaPx: number;
  /** Versore camera - bersaglio nell'eclittica J2000 (prove e diagnostica). */
  direzione: [number, number, number];
}

export interface InfoCorpoScena {
  ssid: number;
  stato: StatoEffemeride;
  livello: Livello;
  /** Disegnato (marcatore o disco) e nel campo visivo, non occluso. */
  visibile: boolean;
  /** Coordinate schermo in px CSS rispetto alla canvas. */
  x: number;
  y: number;
  raggioPx: number;
  occluso: boolean;
  /** Antialiasing temporale (§ 11.4.3): il marcatore lascia il posto all'orbita evidenziata. */
  motoTroppoRapido: boolean;
  /** Luna nascosta perché a meno di 12 px dal pianeta (§ 11.5.1). */
  raggruppata: boolean;
  categoria: CategoriaCorpo;
}

export interface PosizioneSchermo {
  x: number;
  y: number;
  visibile: boolean;
}

/** Rettangolo dello schermo in px CSS rispetto alla canvas, coperto da un pannello dell'interfaccia. */
export interface ZonaSchermo {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}
