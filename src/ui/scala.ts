// Barra di scala (R14) e regolo logaritmico delle distanze (§ 11.3): logica pura.

import { UA_KM } from '../ephem/constants';
import { SPAZIO_NB, arrotondaCifre, formatCifre, formatNumero } from './format';
import type { IdPreset } from './testi.it';
import { UNITA } from './testi.it';

/** Regolo delle distanze: ampiezza della vista da 10³ km a 2·10⁵ UA, l'ampiezza massima della scena (§ 11.3, RF1). */
export const LOG_AMPIEZZA_MIN = 3;
export const LOG_AMPIEZZA_MAX = Math.log10(2e5 * UA_KM);

export function limitaLog(v: number): number {
  return Math.min(LOG_AMPIEZZA_MAX, Math.max(LOG_AMPIEZZA_MIN, v));
}

/** Frazione [0, 1] da 10³ km a 2·10⁵ UA: distanza dall'alto nel regolo delle distanze (distanze.ts). */
export function frazioneDaAmpiezza(km: number): number {
  return (limitaLog(Math.log10(Math.max(km, 1e-9))) - LOG_AMPIEZZA_MIN) / (LOG_AMPIEZZA_MAX - LOG_AMPIEZZA_MIN);
}

export function ampiezzaDaFrazione(f: number): number {
  const v = LOG_AMPIEZZA_MIN + Math.min(1, Math.max(0, f)) * (LOG_AMPIEZZA_MAX - LOG_AMPIEZZA_MIN);
  return 10 ** v;
}

/** Valore 1-2-5 × 10^k non superiore a x. */
export function arrotonda125(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  const r = m >= 5 ? 5 : m >= 2 ? 2 : 1;
  return Number.parseFloat((r * p).toPrecision(1));
}

export interface BarraScala {
  /** Lunghezza della barra in px. */
  px: number;
  /** Lunghezza rappresentata, km. */
  km: number;
  /** Testo della lunghezza: "200 000 km", "5 milioni di km", "2 UA". */
  testo: string;
  /** Unità per la marcatura (abbr per UA). */
  valore: string;
  unita: string;
}

/** Soglia oltre la quale la barra si esprime in UA. */
const SOGLIA_UA_KM = 1e7;

/** Barra di scala arrotondata a 1-2-5 con lunghezza massima `maxPx` (R14). */
export function barraScala(kmPerPixel: number, maxPx = 120): BarraScala | null {
  if (!(kmPerPixel > 0) || !Number.isFinite(kmPerPixel)) return null;
  const obiettivoKm = kmPerPixel * maxPx;
  let km: number;
  let valore: string;
  let unita: string;
  if (obiettivoKm < SOGLIA_UA_KM) {
    km = arrotonda125(obiettivoKm);
    if (km >= 1e6) {
      valore = formatNumero(km / 1e6, 0);
      unita = km === 1e6 ? UNITA.milioneKm : UNITA.milioniKm;
    } else {
      valore = formatNumero(km, km < 1 ? decimaliNecessari(km) : 0);
      unita = UNITA.km;
    }
  } else {
    const ua = arrotonda125(obiettivoKm / UA_KM);
    km = ua * UA_KM;
    valore = formatNumero(ua, ua < 1 ? decimaliNecessari(ua) : 0);
    unita = UNITA.ua;
  }
  return { px: km / kmPerPixel, km, testo: valore + SPAZIO_NB + unita, valore, unita };
}

function decimaliNecessari(x: number): number {
  return Math.max(0, -Math.floor(Math.log10(x)));
}

/** Etichette delle tacche del regolo delle distanze. */
export function etichettaAmpiezza(km: number): string {
  if (km < 1e6) return formatCifre(km, 1) + SPAZIO_NB + UNITA.km;
  if (km < 0.1 * UA_KM) {
    const m = arrotondaCifre(km / 1e6, 1);
    return formatCifre(m, 1) + SPAZIO_NB + (m === 1 ? UNITA.milioneKm : UNITA.milioniKm);
  }
  return formatCifre(km / UA_KM, 1) + SPAZIO_NB + UNITA.ua;
}

/** Tacche etichettate del regolo delle distanze, distanziate in modo leggibile sulla scala logaritmica. */
export const TACCHE_DISTANZE: readonly number[] = [1e3, 1e6, UA_KM, 100 * UA_KM, 1e5 * UA_KM];

export interface PresetVista {
  id: IdPreset;
  /** Slug del corpo a fuoco. */
  fuoco: string;
  /** Ampiezza della vista alla distanza del corpo a fuoco, km (§ 11.3). */
  ampiezzaKm: number;
  /** Sistemi planetari: camera a 30° sul piano delle orbite delle lune (§ 11.3). */
  vistaSistema?: true;
}

/** Preset del § 11.3, con l'ampiezza indicata ("circa ..."). */
export const PRESET_VISTA: readonly PresetVista[] = [
  { id: 'terra-luna', fuoco: 'terra', ampiezzaKm: 1.2e6, vistaSistema: true },
  { id: 'plutone-caronte', fuoco: 'plutone', ampiezzaKm: 2e5, vistaSistema: true },
  { id: 'sistema-giove', fuoco: 'giove', ampiezzaKm: 5e6, vistaSistema: true },
  { id: 'sistema-saturno', fuoco: 'saturno', ampiezzaKm: 3e7, vistaSistema: true },
  { id: 'sistema-interno', fuoco: 'sole', ampiezzaKm: 4 * UA_KM },
  { id: 'fascia-principale', fuoco: 'sole', ampiezzaKm: 12 * UA_KM },
  { id: 'pianeti-giganti', fuoco: 'sole', ampiezzaKm: 64 * UA_KM },
  { id: 'fascia-kuiper', fuoco: 'sole', ampiezzaKm: 220 * UA_KM },
  { id: 'sedna', fuoco: 'sole', ampiezzaKm: 2200 * UA_KM },
  { id: 'interstellari', fuoco: 'sole', ampiezzaKm: 2e5 * UA_KM },
];

/** Preset che corrisponde alla vista (stesso fuoco, ampiezza entro un fattore 1,5), per l'etichetta della mappa. */
export function presetCorrispondente(fuoco: string, ampiezzaKm: number): PresetVista | null {
  let migliore: PresetVista | null = null;
  let scarto = Math.log10(1.5);
  for (const p of PRESET_VISTA) {
    if (p.fuoco !== fuoco) continue;
    const d = Math.abs(Math.log10(ampiezzaKm / p.ampiezzaKm));
    if (d <= scarto) {
      scarto = d;
      migliore = p;
    }
  }
  return migliore;
}
