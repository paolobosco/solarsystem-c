// Ripristino dello stato dopo il cambio di lingua (RF8, § 11.12 di docs/PROGETTO.md). La lingua si cambia ricaricando la
// pagina; data e ora, corpo selezionato e vista passano al caricamento successivo con un passaggio una tantum in
// sessionStorage: scritto subito prima della ricarica, letto e cancellato all'avvio. Non sono preferenze: la data non
// entra mai in localStorage (RF8) e il passaggio non sopravvive alla sessione né a una seconda ricarica.
// sessionStorage sempre dentro try/catch: se manca, la pagina riparte dallo stato iniziale.

import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../time/calendar';
import type { ScalaTempo } from '../time/types';

export const CHIAVE_RIPRISTINO = 'ss.ripristino';

/** Stato che attraversa la ricarica. */
export interface StatoRipristino {
  /** Istante nella scala d'ingresso (JD UT1 o JD TT). */
  jd: number;
  scala: ScalaTempo;
  /** Offset orario fisso in minuti; null se disattivato. */
  offsetMinuti: number | null;
  /** Slug del corpo selezionato. */
  selezionato: string | null;
  /** Slug del corpo a fuoco. */
  fuoco: string;
  /** Ampiezza della vista in km (lato minore, alla distanza del fuoco); null senza scena. */
  ampiezzaKm: number | null;
  /** Vista testuale al posto della mappa. */
  vistaTestuale: boolean;
}

function archivio(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const RE_SLUG_RIPRISTINO = /^[a-z0-9-]{1,40}$/;

/** Stato valido dal contenuto grezzo, o null. Gli estremi sono quelli dell'intervallo dei dati. */
export function leggiStatoRipristino(grezzo: unknown): StatoRipristino | null {
  if (typeof grezzo !== 'object' || grezzo === null) return null;
  const s = grezzo as Record<string, unknown>;
  const { jd, scala, offsetMinuti, selezionato, fuoco, ampiezzaKm, vistaTestuale } = s;
  if (typeof jd !== 'number' || !Number.isFinite(jd) || jd < JD_MIN_UT || jd >= JD_MAX_UT_EXCL + 1) return null;
  if (scala !== 'UT' && scala !== 'TT') return null;
  if (offsetMinuti !== null && !(typeof offsetMinuti === 'number' && Number.isInteger(offsetMinuti) && offsetMinuti >= -720 && offsetMinuti <= 840)) return null;
  if (selezionato !== null && !(typeof selezionato === 'string' && RE_SLUG_RIPRISTINO.test(selezionato))) return null;
  if (typeof fuoco !== 'string' || !RE_SLUG_RIPRISTINO.test(fuoco)) return null;
  if (ampiezzaKm !== null && !(typeof ampiezzaKm === 'number' && Number.isFinite(ampiezzaKm) && ampiezzaKm > 0)) return null;
  return { jd, scala, offsetMinuti, selezionato, fuoco, ampiezzaKm, vistaTestuale: vistaTestuale === true };
}

/** Scrive il passaggio; false se sessionStorage non è disponibile. */
export function salvaRipristino(stato: StatoRipristino, deposito: Storage | null = archivio()): boolean {
  try {
    deposito?.setItem(CHIAVE_RIPRISTINO, JSON.stringify(stato));
    return deposito !== null;
  } catch {
    return false;
  }
}

/** Legge e cancella il passaggio: null se assente o non valido. Da chiamare una sola volta, all'avvio. */
export function consumaRipristino(deposito: Storage | null = archivio()): StatoRipristino | null {
  if (deposito === null) return null;
  let grezzo: string | null = null;
  try {
    grezzo = deposito.getItem(CHIAVE_RIPRISTINO);
    deposito.removeItem(CHIAVE_RIPRISTINO);
  } catch {
    // archivio bloccato: nessun ripristino
  }
  if (grezzo === null) return null;
  try {
    return leggiStatoRipristino(JSON.parse(grezzo));
  } catch {
    return null;
  }
}
