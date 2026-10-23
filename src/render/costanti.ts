// Costanti del rendering (§ 10, § 11.1, § 11.3, § 11.5 di docs/PROGETTO.md).
// Unità: km, radianti, pixel CSS, millisecondi.

import type { CategoriaCorpo } from '../data/catalogTypes';
import { UA_KM } from '../ephem/constants';

// Camera e profondità (R4, § 10.3)

/** Piano vicino e lontano (R4): risoluzione relativa circa 2e-6 con 24 bit di profondità logaritmica. */
export const NEAR_KM = 1e-5;
export const FAR_KM = 1e15;
/** Campo visivo verticale. */
export const FOV_GRADI = 45;
/** Velocità di zoom di OrbitControls: 0,95^5 per scatto, circa 136 scatti da 0,01 km a 1e5 UA. */
export const ZOOM_SPEED = 5;
/**
 * Ampiezza massima della vista (lato minore alla distanza del corpo a fuoco): 2·10⁵ UA (RF1, § 10.3).
 * La distanza massima della camera ne discende con l'aspetto: 2,41·10⁵ UA con aspetto ≥ 1.
 */
export const AMPIEZZA_MAX_KM = 2e5 * UA_KM;
/** Quota minima sulla superficie: max(0,01·R; 0,5 km) (RF1, § 10.3). */
export const QUOTA_MIN_FRAZIONE = 0.01;
export const QUOTA_MIN_KM = 0.5;
/** Distanza minima per i corpi senza raggio noto. */
export const DISTANZA_MIN_SENZA_RAGGIO_KM = 1;
/** Durata della transizione di fuoco (§ 10.3). */
export const DURATA_TRANSIZIONE_MS = 1500;
/** Elevazione della camera sopra l'eclittica all'avvio e nei preset (§ 11.12). */
export const ELEVAZIONE_PREDEFINITA = (30 * Math.PI) / 180;
/**
 * Ampiezza della vista alla creazione della scena: 4 UA, quella del preset Sistema interno della vista iniziale
 * (§ 11.12). I preset di vista (§ 11.3) sono dell'interfaccia (PRESET_VISTA in src/ui/scala.ts).
 */
export const ESTENSIONE_INIZIALE_KM = 4 * UA_KM;
/** Inquadratura 'orbita': l'orbita resta entro questa frazione della mezza larghezza e della mezza altezza della vista. */
export const MARGINE_INQUADRATURA_ORBITA = 0.85;
/** Fattore di smorzamento dei controlli (0 con movimento ridotto). */
export const SMORZAMENTO = 0.12;
/** Pixel ratio massimo (R12). */
export const PIXEL_RATIO_MAX = 2;

// Colori della scena (§ 11.1)

export const COLORE_SPAZIO = '#030806';
export const COLORE_SELEZIONE = '#D7F75B';
export const COLORE_ANELLI_DISTANZA = '#3F6F5E';
export const COLORE_ETICHETTE_ANELLI = '#86A898';
export const COLORE_GRIGLIA = '#2B5245';
export const COLORE_TESTO_ETICHETTE = '#E6F2EC';
export const COLORE_ASSI = '#A9C7B9';
export const COLORE_ECLITTICA_DATA = '#8CC8F0';

export const COLORE_CATEGORIA: Readonly<Record<CategoriaCorpo, string>> = {
  sole: '#FFE7A3',
  pianeta: '#F4F1E8',
  'pianeta-nano': '#A89BFF',
  luna: '#A3AEB5',
  asteroide: '#CF9A62',
  centauro: '#F0709E',
  cometa: '#62DDF0',
  tno: '#F0709E',
  interstellare: '#FFD23F',
};

/** Dimensione nominale del marcatore in pixel CSS (§ 11.1). */
export const DIMENSIONE_MARCATORE: Readonly<Record<CategoriaCorpo, number>> = {
  sole: 12,
  pianeta: 8,
  'pianeta-nano': 9,
  luna: 6,
  asteroide: 8,
  centauro: 8,
  cometa: 7,
  tno: 7,
  interstellare: 10,
};

// Marcatori, etichette, selezione (§ 11.5)

/** Diametro apparente oltre il quale il marcatore sfuma (§ 11.5.1). */
export const SOGLIA_DISSOLVENZA_DIAMETRO_PX = 10;
export const DURATA_DISSOLVENZA_MS = 200;
/** Lune a meno di questa distanza dal pianeta: nascoste e contate (§ 11.5.1). */
export const SOGLIA_LUNE_PX = 12;
/** Opacità dei marcatori dietro il disco del Sole o di un pianeta (§ 11.5.1). */
export const OPACITA_OCCLUSO = 0.3;
/** Raggio apparente minimo per disegnare l'impostore (R5). */
export const RAGGIO_MIN_IMPOSTORE_PX = 1;
/** Raggio apparente oltre il quale si carica la texture (§ 8.1). */
export const SOGLIA_TEXTURE_PX = 8;
/** Lato della cella del marcatore in pixel CSS (atlante). */
export const CELLA_MARCATORE_PX = 32;
/** Distanza tra anello di selezione e bordo del disco. */
export const MARGINE_ANELLO_SELEZIONE_PX = 5;

/** Tolleranze di selezione: raggio 12 px con mouse, 22 px con tocco (§ 11.5.3, WCAG 2.2 SC 2.5.8). */
export const TOLLERANZA_MOUSE_PX = 12;
export const TOLLERANZA_TOCCO_PX = 22;
/** Clic valido: spostamento inferiore a 5 px (mouse) o 8 px (tocco, § 11.10) e durata inferiore a 500 ms. */
export const CLIC_SPOSTAMENTO_MOUSE_PX = 5;
export const CLIC_SPOSTAMENTO_TOCCO_PX = 8;
export const CLIC_DURATA_MS = 500;
/** Clic ripetuto entro 4 px e 1,5 s: candidato successivo (§ 11.5.3). */
export const CICLO_DISTANZA_PX = 4;
export const CICLO_TEMPO_MS = 1500;
/** Doppio tocco: intervallo e distanza massimi (§ 11.10). */
export const DOPPIO_TOCCO_MS = 350;
export const DOPPIO_TOCCO_PX = 24;

/** Etichette (§ 11.5.2). */
export const ETICHETTE_INTERVALLO_MS = 100;
export const ETICHETTE_ISTERESI_MS = 300;
export const ETICHETTE_MAX_STRETTO = 25;
export const ETICHETTE_MAX_LARGO = 80;
export const ETICHETTE_LARGHEZZA_STRETTA_PX = 600;
export const ETICHETTE_SCOSTAMENTO_PX = 9;
export const ETICHETTE_ALTEZZA_PX = 16;
export const ETICHETTE_CELLA_PX = 32;

// Orbite (§ 10.2)

export const PUNTI_ORBITA = 256;
export const DELTA_RAFFINAMENTO = 1e-9;
/** Orbite ricostruite per frame oltre al corpo a fuoco. */
export const BUDGET_ORBITE = 8;
/** Orbite delle lune visibili solo se il semiasse proiettato supera 10 px. */
export const SOGLIA_ORBITE_LUNE_PX = 10;
/** Opacità minima delle orbite: contrasto ≥ 3:1 sullo spazio. */
export const OPACITA_ORBITA = 0.6;
export const LARGHEZZA_ORBITA_PX = 1;
export const LARGHEZZA_ORBITA_SELEZIONATA_PX = 2;
/**
 * Arco d'incertezza ±ε (§ 7.8.2): continuo e più largo dell'orbita di questo margine (3 px, 4 px con l'orbita
 * selezionata), distinguibile anche sull'orbita tratteggiata e opaca del corpo selezionato.
 */
export const MARGINE_ARCO_INCERTEZZA_PX = 2;
/** Lunghezza del tratto nel tratteggio, in pixel. */
export const PERIODO_TRATTEGGIO_PX = 14;
/** Antialiasing temporale: passo per fotogramma oltre 1/8 del periodo (§ 11.4.3). */
export const FRAZIONE_PERIODO_MAX = 1 / 8;

// Anelli di distanza e griglia (R11)

export const ANELLI_DISTANZA_UA: readonly number[] = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

// Sole

/** Raggio massimo dell'alone del Sole oltre il disco, in pixel (R5). */
export const ALONE_SOLE_MAX_PX = 48;

// Stelle

export const STELLE_MAGNITUDINE_LIMITE = 6.5;
/** Intervallo minimo, in anni giuliani, tra due ricalcoli delle direzioni stellari. */
export const STELLE_RICALCOLO_ANNI = 0.5;
