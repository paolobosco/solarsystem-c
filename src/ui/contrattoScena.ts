// Contratti d'ingresso dell'interfaccia verso la scena 3D e verso il calcolo delle stagioni.
// L'interfaccia programma contro queste dichiarazioni minime; l'integrazione le collega a
// src/render (ScenaApi) e a src/time/seasons.ts, con adattatori se le firme differiscono.

import type { CategoriaCorpo } from '../data/catalogTypes';
import type { LivelloVisivo } from '../app/store';

/** Stato della vista usato da barra di scala, regolo delle distanze ed etichetta della mappa (§ 10.1 R14, § 11.3). */
export interface StatoVista {
  /** Distanza della camera dal centro del corpo a fuoco, km. */
  distanzaKm: number;
  /** Ampiezza della vista (lato minore) alla distanza del corpo a fuoco, km: scala del regolo e dei preset. */
  ampiezzaKm: number;
  /** km per pixel alla distanza del corpo a fuoco: 2·d·tan(fov/2)/altezza_px (R14). */
  kmPerPixel: number;
  larghezzaPx: number;
  altezzaPx: number;
  /** ssid del corpo a fuoco. */
  fuoco: number;
  /** Transizione di fuoco in corso. */
  inTransizione: boolean;
  /** Il corpo a fuoco non ha posizione alla data (§ 7.8.2): la vista è centrata sul primario. */
  fuocoSenzaPosizione: boolean;
  /** Contesto WebGL perso (R13): disegno sospeso fino al ripristino. */
  contestoPerso: boolean;
}

/** Informazioni su una selezione fatta nella scena (§ 11.5.3). */
export interface InfoSelezione {
  /** Posizione del candidato nel ciclo dei candidati sovrapposti (1 = primo). */
  indice: number;
  /** Numero di candidati sotto il puntatore. */
  totale: number;
}

export type InquadraturaScena = 'corpo' | 'orbita' | 'sistema';

export interface OpzioniFuoco {
  /** Ampiezza della vista richiesta (lato minore), km; se assente decide l'inquadratura. */
  ampiezzaKm?: number;
  inquadratura?: InquadraturaScena;
  /** Senza transizione animata (anche con prefers-reduced-motion la scena salta). */
  immediato?: boolean;
  /** Camera a 30° sul piano del sistema del corpo (preset dei sistemi planetari, § 11.3). */
  vistaSistema?: boolean;
}

/** Livelli della scena: quelli dello store tranne la barra di scala, che è dell'interfaccia. */
export type LivelloScena = Exclude<LivelloVisivo, 'barraScala'>;

/**
 * Operazioni della scena richieste dall'interfaccia. Gli angoli sono in radianti, le distanze in km.
 * Tutte le chiamate sono sincrone e non generano eventi di ritorno, tranne onSelezione (solo per
 * selezioni fatte nella scena) e onCambioVista.
 */
export interface ScenaUi {
  /** Inserisce la canvas e il livello delle etichette nel contenitore della mappa. */
  monta(contenitore: HTMLElement): void;
  statoVista(): StatoVista;
  /** Notifica i cambi di camera, fuoco e dimensioni (al massimo una volta per fotogramma). */
  onCambioVista(cb: () => void): () => void;
  /** Selezione fatta nella scena (clic, tocco); null = deselezione. */
  onSelezione(cb: (ssid: number | null, info: InfoSelezione | null) => void): () => void;
  /** Corpo selezionato evidenziato nella scena (anello di selezione). */
  seleziona(ssid: number | null): void;
  /** Sposta l'origine sul corpo, con transizione di 1,5 s (§ 10.3). */
  mettiAFuoco(ssid: number, opzioni?: OpzioniFuoco): void;
  /** Ampiezza della vista (lato minore) alla distanza del corpo a fuoco, km; limitata dalla scena (§ 10.3). */
  impostaAmpiezza(km: number): void;
  /** Moltiplica la distanza della camera (fattore > 1 allontana). */
  zoom(fattore: number): void;
  /** Rotazione attorno al corpo a fuoco: azimut ed elevazione. */
  ruota(dAzimut: number, dElevazione: number): void;
  /** Spostamento laterale in frazioni dell'altezza della vista. */
  sposta(dx: number, dy: number): void;
  /** Corpo visibile più vicino al centro della vista, o null. */
  corpoAlCentro(): number | null;
  /** Corpo visibile successivo (verso 1) o precedente (−1) rispetto a `da`, in ordine sullo schermo. */
  corpoVisibileSuccessivo(da: number | null, verso: 1 | -1): number | null;
  impostaLivelli(livelli: Readonly<Record<LivelloScena, boolean>>): void;
  /** Categorie attive; `sempreVisibile` resta visibile anche se la sua categoria è nascosta (§ 11.6). */
  impostaFiltri(categorie: ReadonlySet<CategoriaCorpo>, sempreVisibile: number | null): void;
  /** Velocità di riproduzione in giorni simulati per secondo, 0 in pausa (antialiasing temporale, § 11.4.3). */
  impostaRiproduzione?(giorniPerSecondo: number): void;
}

// --- Stagione astronomica (§ 11.4.3) ---

/** Stagione boreale dalla longitudine del Sole sull'eclittica e sull'equinozio della data. */
export type CodiceStagione = 'primavera' | 'estate' | 'autunno' | 'inverno';

/** Evento che apre la stagione: equinozio (primavera, autunno) o solstizio (estate, inverno). */
export type EventoStagione = 'equinozio' | 'solstizio';

/**
 * Ingresso dell'indicatore della stagione, prodotto da src/time/seasons.ts (o da un adattatore):
 * "Primavera boreale, 12 giorni dopo l'equinozio".
 */
export interface IngressoStagione {
  stagione: CodiceStagione;
  evento: EventoStagione;
  /** Giorni interi trascorsi dall'evento (≥ 0). */
  giorniDopo: number;
}
