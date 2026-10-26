// Interfaccia pubblica del modulo di rendering (§ 5.4, § 5.5, § 10, § 11.5 di docs/PROGETTO.md).
//
// Uso tipico:
//   const scena = creaScena({ canvas, etichette, catalogo, effemeridi, orientamento, texture, stelle });
//   scena.impostaTempo(timeState);            // a ogni cambio di data o a ogni frame in riproduzione
//   scena.onSelezione((e) => ...);            // clic o tocco su marcatore, disco o etichetta
//
// Ciclo dei frame: senza ascoltatori di onRichiestaFrame la scena pianifica da sé i frame con
// requestAnimationFrame quando servono (rendering su richiesta, R12). Con almeno un ascoltatore
// la pianificazione passa al chiamante, che risponde chiamando disegna() in un requestAnimationFrame
// e richiama la pianificazione finché disegna() restituisce true o la riproduzione è attiva.
//
// La scena non crea DOM fuori dalla canvas e dal contenitore delle etichette passati dal chiamante.

import type { CategoriaCorpo, Catalogo, CorpoCatalogo } from '../data/catalogTypes';
import type { EphemerisService } from '../ephem/types';
import type { TimeState } from '../time/types';
import type { FornitoreOrientamento } from './orientamento';
import type { FornitoreStelle } from './stars';
import type { TestiScena } from './testi';
import type { FornitoreTexture } from './texture';
import type {
  EventoSelezione,
  InfoCorpoScena,
  LivelliVisivi,
  OpzioniFuoco,
  PosizioneSchermo,
  StatoVista,
  ZonaSchermo,
} from './tipi';

export type { FornitoreOrientamento } from './orientamento';
export type { DatiStelle, FornitoreStelle } from './stars';
export type { FornitoreTexture, ImmagineTexture } from './texture';
export { fornitoreTextureDaDataStore } from './texture';
export type { TestiScena } from './testi';
export type {
  EventoSelezione,
  InfoCorpoScena,
  Inquadratura,
  LivelliVisivi,
  OpzioniFuoco,
  PosizioneSchermo,
  StatoVista,
  ZonaSchermo,
} from './tipi';
export { LIVELLI_PREDEFINITI } from './tipi';
export { svgMarcatore } from './markers';

export interface OpzioniScena {
  /** Canvas di disegno; dimensioni CSS a cura del chiamante (la scena osserva i ridimensionamenti). */
  canvas: HTMLCanvasElement;
  /** Contenitore del livello etichette, sovrapposto alla canvas con le stesse dimensioni. */
  etichette: HTMLElement;
  catalogo: Catalogo | readonly CorpoCatalogo[];
  effemeridi: EphemerisService;
  /** Orientamenti dei corpi (R10); senza fornitore gli assi coincidono con l'eclittica J2000. */
  orientamento?: FornitoreOrientamento;
  /** Texture dei corpi (§ 8.12); per esempio fornitoreTextureDaDataStore(store). */
  texture?: FornitoreTexture;
  /** Stelle (§ 8.8), caricate dopo il primo frame. */
  stelle?: FornitoreStelle;
  /** Testi visibili (contatore delle lune, anelli di distanza): da src/ui/testiScena.ts. */
  testi?: Partial<TestiScena>;
  /** Movimento ridotto; predefinito: prefers-reduced-motion. */
  movimentoRidotto?: boolean;
  /** Pixel ratio massimo (R12), predefinito 2. */
  pixelRatioMax?: number;
}

export interface StatisticheFrame {
  /** Tempo CPU dell'ultimo frame (passi 2-6 e 8 del § 5.5), ms. */
  cpuMs: number;
  /** Media mobile del tempo CPU, ms. */
  cpuMediaMs: number;
  /** Tempo totale dell'ultimo frame compreso renderer.render, ms. */
  frameMs: number;
  frame: number;
  orbiteRicostruite: number;
}

export interface PixelLetti {
  /** Pixel del buffer di disegno (CSS × pixel ratio). */
  larghezza: number;
  altezza: number;
  pixelRatio: number;
  /** RGBA dall'alto verso il basso. */
  dati: Uint8Array;
}

export interface ScenaApi {
  /** Istante della scena (§ 5.5 punto 1): ricalcolo di stati, affidabilità e orbite. */
  impostaTempo(t: TimeState): void;
  /**
   * Velocità di riproduzione in giorni simulati per secondo reale, 0 in pausa. Serve
   * all'antialiasing temporale (§ 11.4.3): passo per fotogramma oltre 1/8 del periodo attorno al
   * primario → il marcatore lascia il posto all'orbita evidenziata; rotazioni ferme con la stessa regola.
   */
  impostaRiproduzione(giorniPerSecondo: number): void;
  /** Corpo a fuoco (origine della scena); transizione di 1,5 s salvo opzioni o movimento ridotto. */
  impostaFuoco(ssid: number, opzioni?: OpzioniFuoco): void;
  /** Interrompe la transizione di fuoco portandola subito al termine. */
  completaTransizione(): void;
  impostaSelezione(ssid: number | null): void;
  impostaLivelli(livelli: Partial<LivelliVisivi>): void;
  /** Categorie attive (RF6): un corpo è visibile se almeno una sua categoria è attiva. */
  impostaFiltri(categorie: Iterable<CategoriaCorpo>): void;
  /** Orbite attive oltre a quelle predefinite (pianeti, selezione, fuoco, lune del sistema a fuoco). */
  impostaOrbiteExtra(ssid: Iterable<number>): void;
  /** Avvicina (fattore > 1) o allontana (fattore < 1) la camera dal bersaglio. */
  zoom(fattore: number): void;
  /** Estensione della vista alla distanza del fuoco (regolo delle distanze, 10³ km - 2·10⁵ UA), entro l'ampiezza massima. */
  impostaEstensione(km: number): void;
  /** Rotazione attorno al bersaglio (frecce, § 11.9): azimut ed elevazione in radianti. */
  ruota(dAzimut: number, dElevazione: number): void;
  /** Spostamento del bersaglio in pixel dello schermo (Maiusc+frecce, § 11.9). */
  sposta(dxPx: number, dyPx: number): void;
  /** Inquadra il corpo a fuoco (F, pulsante Inquadra, doppio tocco); senza posizione alla data, il corpo d'origine. */
  inquadra(): void;
  /** Inquadra il sistema di lune del pianeta (contatore "+N lune"). */
  inquadraSistema(ssid: number): void;
  /** Corpi disegnati nel campo visivo, in ordine di priorità (N e Maiusc+N, § 11.9). */
  corpiVisibiliOrdinati(): readonly number[];
  /** Corpo visibile più vicino al centro dello schermo (Invio, § 11.9). */
  corpoPiuVicinoAlCentro(): number | null;
  /** Dati per barra di scala e regolo delle distanze dell'interfaccia, aria-label della mappa e messaggi di stato. */
  statoVista(): StatoVista;
  infoCorpo(ssid: number): InfoCorpoScena | null;
  /** Posizione schermo (px CSS rispetto alla canvas) dalla proiezione su CPU; per i ganci di test. */
  getScreenPosition(ssid: number): PosizioneSchermo | null;
  /** Posa esplicita della camera rispetto al corpo a fuoco (km); per test e diagnostica. */
  impostaPosa(posizione: readonly number[], bersaglio: readonly number[]): void;
  /**
   * Zone dello schermo coperte dai pannelli dell'interfaccia (px CSS rispetto alla canvas): le etichette non
   * vi si dispongono (§ 11.5.2). Il chiamante le aggiorna quando i pannelli cambiano.
   */
  impostaZoneOccupate(zone: readonly ZonaSchermo[]): void;
  /** Corpi esclusi dal disegno; per test e diagnostica. */
  impostaEsclusi(ssid: Iterable<number>): void;
  /** Dati effemeridi cambiati (blocchi caricati): ricalcolo di stati e orbite. */
  invalidaDati(): void;
  /** Esegue un frame (§ 5.5); true se servono altri frame (transizioni, controlli, dissolvenze). */
  disegna(): boolean;
  /** Richiede un frame (pianificato internamente o notificato con onRichiestaFrame). */
  richiediFrame(): void;
  /** Vero se non ci sono transizioni, animazioni o orbite in attesa e l'ultimo frame è disegnato. */
  inQuiete(): boolean;
  /** Disegna un frame e legge una regione (px CSS) del buffer; per test e diagnostica. */
  leggiPixel(x: number, y: number, larghezza: number, altezza: number): PixelLetti;
  statistiche(): StatisticheFrame;
  readonly contestoPerso: boolean;
  onSelezione(cb: (e: EventoSelezione) => void): () => void;
  /** Corpo sotto il puntatore (mouse), o null. */
  onPassaggio(cb: (ssid: number | null) => void): () => void;
  /** Vista cambiata (al massimo 10 volte al secondo, più l'ultimo stato). */
  onVista(cb: (s: StatoVista) => void): () => void;
  onRichiestaFrame(cb: () => void): () => void;
  dispose(): void;
}

export { creaScena, ErroreWebGL } from './renderer';
