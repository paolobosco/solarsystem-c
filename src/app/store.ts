// Store osservabile e tipizzato dello stato applicativo (§ 5.4, § 6.6, § 11.4, § 11.12 di
// docs/PROGETTO.md). Senza DOM e senza dipendenze esterne.
//
// Interfaccia:
// - get(): stato corrente, immutabile per convenzione (ogni modifica sostituisce gli oggetti toccati).
// - set(patch): sostituzione superficiale delle chiavi indicate; accetta anche una funzione dello stato.
// - aggiorna(chiave, patch): fusione superficiale dentro un ramo oggetto (riproduzione, livelli, ...).
// - osserva(selettore, cb, opzioni): cb(nuovo, precedente) quando il valore selezionato cambia
//   (Object.is o `uguale`); `immediato` chiama subito cb. Restituisce la funzione di annullamento.
// - transazione(fn): le notifiche partono una sola volta alla fine.
// Le notifiche sono sincrone, nell'ordine di registrazione; una modifica fatta da un osservatore
// produce un nuovo giro di notifiche al termine di quello in corso.

import type { CategoriaCorpo } from '../data/catalogTypes';
import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../time/calendar';
import type { ScalaTempo } from '../time/types';
import type { UnitaPasso } from '../time/steps';

export interface Store<S extends object> {
  get(): Readonly<S>;
  set(patch: Partial<S> | ((s: Readonly<S>) => Partial<S>)): void;
  aggiorna<K extends ChiaviOggetto<S>>(chiave: K, patch: Partial<S[K]>): void;
  osserva<V>(selettore: (s: Readonly<S>) => V, cb: (nuovo: V, precedente: V) => void, opzioni?: OpzioniOsserva<V>): () => void;
  transazione(fn: () => void): void;
}

export type ChiaviOggetto<S> = { [K in keyof S]: S[K] extends object ? K : never }[keyof S];

export interface OpzioniOsserva<V> {
  immediato?: boolean;
  uguale?: (a: V, b: V) => boolean;
}

interface Osservatore<S> {
  selettore: (s: Readonly<S>) => unknown;
  cb: (nuovo: unknown, precedente: unknown) => void;
  uguale: (a: unknown, b: unknown) => boolean;
  ultimo: unknown;
  attivo: boolean;
}

/** Uguaglianza superficiale per oggetti e array. */
export function ugualeSuperficiale(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

export function creaStore<S extends object>(iniziale: S): Store<S> {
  let stato: S = { ...iniziale };
  const osservatori: Osservatore<S>[] = [];
  let profondita = 0;
  let sporco = false;
  let notificando = false;

  function notifica(): void {
    if (notificando) {
      sporco = true;
      return;
    }
    notificando = true;
    try {
      let giri = 0;
      do {
        sporco = false;
        for (const o of osservatori.slice()) {
          if (!o.attivo) continue;
          const v = o.selettore(stato);
          if (!o.uguale(v, o.ultimo)) {
            const prec = o.ultimo;
            o.ultimo = v;
            o.cb(v, prec);
          }
        }
        if (++giri > 50) throw new Error('Store: notifiche cicliche');
      } while (sporco);
    } finally {
      notificando = false;
    }
  }

  function dopoModifica(): void {
    if (profondita > 0) sporco = true;
    else notifica();
  }

  return {
    get: () => stato,
    set(patch) {
      const p = typeof patch === 'function' ? patch(stato) : patch;
      stato = { ...stato, ...p };
      dopoModifica();
    },
    aggiorna(chiave, patch) {
      const ramo = stato[chiave] as object;
      stato = { ...stato, [chiave]: { ...ramo, ...patch } };
      dopoModifica();
    },
    osserva(selettore, cb, opzioni = {}) {
      const o: Osservatore<S> = {
        selettore,
        cb: cb as (n: unknown, p: unknown) => void,
        uguale: (opzioni.uguale as ((a: unknown, b: unknown) => boolean) | undefined) ?? Object.is,
        ultimo: selettore(stato),
        attivo: true,
      };
      osservatori.push(o);
      if (opzioni.immediato) cb(o.ultimo as never, o.ultimo as never);
      return () => {
        o.attivo = false;
        const i = osservatori.indexOf(o);
        if (i >= 0) osservatori.splice(i, 1);
      };
    },
    transazione(fn) {
      profondita++;
      try {
        fn();
      } finally {
        profondita--;
        if (profondita === 0 && sporco) notifica();
      }
    },
  };
}

// --- Stato dell'applicazione ---

/** Velocità a gradini in secondi simulati per secondo reale (§ 6.6); mese = 30,436875 d, anno = 365,25 d. */
export const VELOCITA_S: readonly number[] = [
  1,
  60,
  3600,
  86_400,
  7 * 86_400,
  30.436875 * 86_400,
  365.25 * 86_400,
  3652.5 * 86_400,
  36_525 * 86_400,
  365_250 * 86_400,
];

/** Indice della velocità predefinita: 1 giorno al secondo. */
export const VELOCITA_PREDEFINITA = 3;

export type LivelloVisivo =
  | 'orbite'
  | 'etichette'
  | 'marcatori'
  | 'anelliDistanza'
  | 'grigliaEclittica'
  | 'eclitticaData'
  | 'assiRotazione'
  | 'anelli'
  | 'stelle'
  | 'barraScala';

/** Livelli visivi (RF5) e valori all'avvio (R11: griglia disattivata, anelli di distanza attivi). */
export const LIVELLI_PREDEFINITI: Readonly<Record<LivelloVisivo, boolean>> = {
  orbite: true,
  etichette: true,
  marcatori: true,
  anelliDistanza: true,
  grigliaEclittica: false,
  eclitticaData: false,
  assiRotazione: false,
  anelli: true,
  stelle: true,
  barraScala: true,
};

export type CategoriaFiltro = Exclude<CategoriaCorpo, 'sole'>;

/** Categorie filtrabili (RF6), nell'ordine dei filtri. */
export const CATEGORIE_FILTRO: readonly CategoriaFiltro[] = [
  'pianeta',
  'pianeta-nano',
  'luna',
  'asteroide',
  'centauro',
  'cometa',
  'tno',
  'interstellare',
];

export const FILTRI_PREDEFINITI: Readonly<Record<CategoriaFiltro, boolean>> = {
  pianeta: true,
  'pianeta-nano': true,
  luna: true,
  asteroide: true,
  centauro: true,
  cometa: true,
  tno: true,
  interstellare: true,
};

export type StatoFoglio = 'compatto' | 'medio' | 'esteso';

export interface StatoTempo {
  /** Istante nella scala d'ingresso (JD UT1 o JD TT), senza offset. */
  jd: number;
  scala: ScalaTempo;
}

export interface StatoRiproduzione {
  attiva: boolean;
  /** Indice in VELOCITA_S. */
  velocita: number;
  direzione: 1 | -1;
  /** "Segui l'ora attuale" (§ 11.12): la data segue l'orologio. */
  seguiOra: boolean;
  /** In attesa dei dati al confine di un blocco (§ 5.6). */
  attesaDati: boolean;
}

export interface StatoInterfaccia {
  vistaTestuale: boolean;
  /** Scorciatoie globali attive (WCAG 2.1.4). */
  scorciatoie: boolean;
  /** Riga del gregoriano prolettico prima del 1582 (§ 11.4.1). */
  rigaProlettica: boolean;
  /** Scheda espansa o ridotta all'intestazione. */
  schedaEspansa: boolean;
  /** Catalogo aperto; su tablet e telefono sostituisce la scheda (uno alla volta, § 11.3). */
  catalogoAperto: boolean;
  /** Stato del foglio inferiore sul telefono. */
  foglio: StatoFoglio;
  benvenutoChiuso: boolean;
  editorAperto: boolean;
  /** Trascinamento del regolo in corso: il caricamento dei dati parte al rilascio o dopo 150 ms (§ 5.6). */
  regoloInTrascinamento: boolean;
}

export interface StatoApp {
  tempo: StatoTempo;
  /** Offset orario fisso in minuti (da −720 a +840, passo 15); null se disattivato (I3). */
  offsetMinuti: number | null;
  unitaPasso: UnitaPasso;
  riproduzione: StatoRiproduzione;
  /** Slug del corpo selezionato. */
  selezionato: string | null;
  /** Slug del corpo a fuoco (origine della scena). */
  fuoco: string;
  livelli: Readonly<Record<LivelloVisivo, boolean>>;
  filtri: Readonly<Record<CategoriaFiltro, boolean>>;
  interfaccia: StatoInterfaccia;
}

export type StoreApp = Store<StatoApp>;

/**
 * Stato iniziale (§ 11.12): istante in UT, orologio in pausa, fuoco sul Sole, Terra selezionata con scheda ridotta.
 * L'istante è limitato all'intervallo (I2): un orologio di sistema oltre il 2120 dà il 31/12/2120 23:59:59 UT.
 */
export function statoIniziale(jdUT: number): StatoApp {
  return {
    tempo: { jd: Math.min(JD_MAX_UT_EXCL - 1 / 86_400, Math.max(JD_MIN_UT, jdUT)), scala: 'UT' },
    offsetMinuti: null,
    unitaPasso: 'giorno',
    riproduzione: { attiva: false, velocita: VELOCITA_PREDEFINITA, direzione: 1, seguiOra: false, attesaDati: false },
    selezionato: 'terra',
    fuoco: 'sole',
    livelli: { ...LIVELLI_PREDEFINITI },
    filtri: { ...FILTRI_PREDEFINITI },
    interfaccia: {
      vistaTestuale: false,
      scorciatoie: true,
      rigaProlettica: false,
      schedaEspansa: false,
      catalogoAperto: false,
      foglio: 'compatto',
      benvenutoChiuso: false,
      editorAperto: false,
      regoloInTrascinamento: false,
    },
  };
}

export function creaStoreApp(jdUT: number): StoreApp {
  return creaStore(statoIniziale(jdUT));
}
