// Formattazione numerica e delle date (§ 11.13, § 11.14 di docs/PROGETTO.md). Unico formattatore
// dell'interfaccia, per lingua. Italiano: virgola decimale; gruppi di tre cifre separati da U+2009 da 4 cifre in su;
// "1°" per il primo del mese; era dopo l'anno ("10000 a.C."). Inglese: punto decimale; gruppi separati da virgola da
// 4 cifre in su ("1,234.5"); "1 January"; "10000 BC" e "AD 800". In entrambe: anni e designazioni mai raggruppati;
// segno meno U+2212; spazio non separabile tra numero e unità; giorno prima del mese. Intl.NumberFormat non si usa
// (raggruppa a 4 cifre in modo diverso tra le lingue e dipende dal browser).
// creaFormati(lingua) dà il formattatore di una lingua (le prove lo usano per entrambe); le funzioni esportate in
// fondo al file sono quelle della lingua dell'interfaccia (LINGUA).
// Conversione UA/km con 1 UA = 149 597 870,7 km (IAU 2012, Risoluzione B2).

import { UA_KM } from '../ephem/constants';
import { annoStoricoDaAstronomico } from '../time/calendar';
import type { DataCalendario } from '../time/types';
import { LINGUA } from './lingua';
import type { Lingua } from './lingua';
import { testiFormatoDi } from './testi';

export const SPAZIO_SOTTILE = ' ';
export const SPAZIO_NB = ' ';
export const MENO = '−';

/** Soglia sotto la quale le distanze si esprimono in km (§ 11.7). */
export const SOGLIA_KM_UA = 0.01 * UA_KM;

const SECONDI_GIORNO = 86_400;
const GIORNI_ANNO = 365.25;

export interface OpzioniNumero {
  /** Raggruppa le cifre intere (predefinito true). */
  raggruppa?: boolean;
  /** Mostra il segno + per i positivi. */
  segnoPiu?: boolean;
}

/** Separatori di una lingua (§ 11.13). */
export interface SeparatoriNumero {
  decimale: string;
  migliaia: string;
}

export const SEPARATORI_PER_LINGUA: Readonly<Record<Lingua, SeparatoriNumero>> = {
  it: { decimale: ',', migliaia: SPAZIO_SOTTILE },
  en: { decimale: '.', migliaia: ',' },
};

/** Numero di decimali per mostrare `cifre` cifre significative di x. */
export function decimaliPerCifre(x: number, cifre: number): number {
  if (x === 0 || !Number.isFinite(x)) return 0;
  const esponente = Math.floor(Math.log10(Math.abs(x)));
  return Math.max(0, cifre - 1 - esponente);
}

/** Arrotonda a `cifre` cifre significative (anche nella parte intera: 384 399 a 3 cifre = 384 000). */
export function arrotondaCifre(x: number, cifre: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const n = Math.max(1, Math.round(cifre));
  const esponente = Math.floor(Math.log10(Math.abs(x)));
  const scala = 10 ** (esponente - n + 1);
  const r = Math.round(x / scala) * scala;
  // Riduce gli errori di rappresentazione (es. 0,30000000000000004).
  return Number.parseFloat(r.toPrecision(n));
}

/**
 * Cifre significative coerenti con l'incertezza (§ 11.13): l'ultima cifra mostrata è dell'ordine
 * dell'incertezza. Limitate tra `min` e `max`.
 */
export function cifreDaIncertezza(valore: number, incertezza: number, min = 2, max = 6): number {
  if (!(incertezza > 0) || !Number.isFinite(incertezza) || valore === 0) return max;
  const c = Math.floor(Math.log10(Math.abs(valore))) - Math.floor(Math.log10(incertezza)) + 1;
  return Math.max(min, Math.min(max, c));
}

/** Misura con unità separata, per costruire il DOM (abbr per UA). */
export interface Misura {
  valore: string;
  unita: string;
  /** Vero se il valore è approssimato ("≈"). */
  approssimato: boolean;
}

/**
 * Decimali per un'incertezza assoluta σ: l'ultima cifra mostrata è quella della potenza di 10 non inferiore a σ, così
 * l'incertezza non supera un'unità dell'ultima cifra (anche negativi: −3 arrotonda alle migliaia).
 */
export function decimaliDaIncertezza(sigma: number): number {
  if (sigma === 0) return Number.POSITIVE_INFINITY;
  if (!(sigma > 0) || !Number.isFinite(sigma)) return Number.NEGATIVE_INFINITY;
  return -Math.ceil(Math.log10(sigma) - 1e-12);
}

/** Cifre significative di x con incertezza assoluta σ (vedi decimaliDaIncertezza), limitate tra min e max. */
export function cifreDaSigma(x: number, sigma: number, min = 1, max = 8): number {
  if (x === 0 || !Number.isFinite(x)) return min;
  const c = Math.floor(Math.log10(Math.abs(x))) + decimaliDaIncertezza(sigma) + 1;
  return Math.max(min, Math.min(max, c));
}

/** Decimali fissi da un'incertezza σ, limitati tra min e max. */
export function decimaliLimitati(sigma: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, decimaliDaIncertezza(sigma)));
}

export interface OpzioniDistanza {
  /** Errore relativo stimato (adimensionale, ad esempio ε in radianti). */
  erroreRelativo?: number;
  /** Incertezza assoluta in km (elementi orbitali): cifre con cifreDaSigma. */
  incertezzaKm?: number;
  /** Cifre significative senza informazioni sull'errore (predefinito 5). */
  cifre?: number;
}

/** Errore relativo oltre il quale il valore è marcato come approssimato. */
const SOGLIA_APPROSSIMATO = 1e-3;

export interface DeltaTMostrato {
  /** Valore senza unità. */
  valore: string;
  /** Incertezza con l'unità, comune al valore. */
  sigma: string;
  /** Incertezza in ore per l'avviso della Luna (§ 11.4.3); uguale a quella della riga se l'unità è l'ora. */
  sigmaOre: string;
}

/** Sotto questo GM (km³/s²) il valore si mostra in m³/s², con le stesse cifre: niente zeri iniziali da contare. */
const SOGLIA_GM_M3 = 1e-3;

/** Cifre significative di un valore come memorizzato (al più max), senza zeri finali: 25,9 → 3; 176 → 3; 0,102 → 3. */
export function cifreSorgente(x: number, max = 6): number {
  if (x === 0 || !Number.isFinite(x)) return 1;
  let t = Math.abs(x).toPrecision(max);
  if (t.includes('e')) return max;
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return Math.max(1, t.replace('.', '').replace(/^0+/, '').length);
}

const RAD_GRADI = 180 / Math.PI;

/** Ora a 24 ore: "07:05". */
export function formatOra(ora: number, minuto: number): string {
  return `${String(ora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

export type SuffissoEra = 'auto' | 'sempre';

/** Anno astronomico con segno, mai raggruppato: "−9999", "+2026", "0". */
export function formatAnnoAstronomico(anno: number): string {
  if (anno === 0) return '0';
  return (anno < 0 ? MENO : '+') + String(Math.abs(anno));
}

/** Formattatore di una lingua. */
export function creaFormati(lingua: Lingua) {
  const SEP = SEPARATORI_PER_LINGUA[lingua];
  const { MESI, MESI_BREVI, UNITA } = testiFormatoDi(lingua);

  function raggruppa(cifre: string): string {
    if (cifre.length < 4) return cifre;
    const primo = cifre.length % 3 || 3;
    let out = cifre.slice(0, primo);
    for (let i = primo; i < cifre.length; i += 3) out += SEP.migliaia + cifre.slice(i, i + 3);
    return out;
  }

  /** Numero con decimali fissi: "1 234,5" (it), "1,234.5" (en), "−0,25". -0 diventa 0. */
  function formatNumero(x: number, decimali = 0, opzioni: OpzioniNumero = {}): string {
    if (Number.isNaN(x)) return UNITA.nonDisponibile;
    if (!Number.isFinite(x)) return (x < 0 ? MENO : '') + UNITA.infinito;
    const d = Math.max(0, Math.min(20, Math.round(decimali)));
    const assoluto = Math.abs(x).toFixed(d);
    const [intera = '0', frazione] = assoluto.split('.');
    const zero = /^[0.]*$/.test(assoluto);
    const segno = x < 0 && !zero ? MENO : opzioni.segnoPiu && !zero ? '+' : '';
    const parteIntera = opzioni.raggruppa === false ? intera : raggruppa(intera);
    return segno + parteIntera + (frazione === undefined ? '' : SEP.decimale + frazione);
  }

  /** Numero con cifre significative: "1,524", "149 600 000". */
  function formatCifre(x: number, cifre: number, opzioni: OpzioniNumero = {}): string {
    if (!Number.isFinite(x)) return formatNumero(x);
    const r = arrotondaCifre(x, cifre);
    return formatNumero(r, decimaliPerCifre(r, cifre), opzioni);
  }

  /** Intero raggruppato. */
  function formatIntero(n: number): string {
    return formatNumero(Math.round(n), 0);
  }

  /** Testo di una misura: "≈ 34,2 UA" con spazio non separabile prima dell'unità. */
  function testoMisura(m: Misura): string {
    const v = m.unita === '' ? m.valore : m.valore + SPAZIO_NB + m.unita;
    return m.approssimato ? UNITA.circa + SPAZIO_NB + v : v;
  }

  /** Distanza in km sotto 0,01 UA, in UA altrimenti (§ 11.7). */
  function misuraDistanza(km: number, opzioni: OpzioniDistanza = {}): Misura {
    if (!Number.isFinite(km)) return { valore: UNITA.nonDisponibile, unita: '', approssimato: false };
    const inc = opzioni.incertezzaKm;
    const err = opzioni.erroreRelativo ?? (inc !== undefined && km !== 0 ? inc / Math.abs(km) : undefined);
    const approssimato = err !== undefined && err > SOGLIA_APPROSSIMATO;
    const inKm = Math.abs(km) < SOGLIA_KM_UA;
    const valore = inKm ? km : km / UA_KM;
    const cifre =
      inc !== undefined
        ? cifreDaSigma(valore, inKm ? inc : inc / UA_KM, 2, 8)
        : err !== undefined
          ? cifreDaIncertezza(valore, Math.abs(valore) * err, 2, 7)
          : (opzioni.cifre ?? 5);
    if (inKm) {
      // In km non si mostrano decimali oltre il metro.
      const r = arrotondaCifre(valore, cifre);
      const dec = Math.min(3, decimaliPerCifre(r, cifre));
      return { valore: formatNumero(r, dec), unita: UNITA.km, approssimato };
    }
    return { valore: formatCifre(valore, cifre), unita: UNITA.ua, approssimato };
  }

  /** Due cifre significative senza zeri decimali finali: 4 → "4", 1,2 → "1,2", 0,25 → "0,25". */
  function cifreCompatte(x: number): string {
    const zeri = new RegExp(`${SEP.decimale === '.' ? '\\.' : SEP.decimale}0+$`);
    return formatCifre(x, 2).replace(zeri, '');
  }

  /** Distanza compatta per scale, regoli e preset: "1000 km", "1,2 milioni di km", "30 milioni di km", "4 UA". */
  function formatAmpiezza(km: number): string {
    if (!Number.isFinite(km) || km <= 0) return UNITA.nonDisponibile;
    if (km < 1e6) return cifreCompatte(km) + SPAZIO_NB + UNITA.km;
    if (km < 1e8) {
      const m = arrotondaCifre(km / 1e6, 2);
      return cifreCompatte(m) + SPAZIO_NB + (m === 1 ? UNITA.milioneKm : UNITA.milioniKm);
    }
    return cifreCompatte(km / UA_KM) + SPAZIO_NB + UNITA.ua;
  }

  /**
   * Velocità in km/s con le cifre dell'errore stimato σ (km/s), da 2 a 4 (§ 11.13), e "≈" oltre l'errore relativo
   * delle distanze approssimate; senza σ 4 cifre.
   */
  function misuraVelocita(kmS: number, sigma: number | null): Misura {
    if (!Number.isFinite(kmS)) return { valore: UNITA.nonDisponibile, unita: '', approssimato: false };
    const s = sigma === null || Number.isNaN(sigma) ? 0 : Math.abs(sigma);
    const cifre = s > 0 ? cifreDaSigma(kmS, s, 2, 4) : 4;
    return { valore: formatCifre(kmS, cifre), unita: UNITA.kmS, approssimato: kmS !== 0 && s / Math.abs(kmS) > SOGLIA_APPROSSIMATO };
  }

  /** Tempo luce: "1,28 s", "8 min 19 s", "5 h 31 min", "12,3 giorni", "1,6 anni". */
  function formatTempoLuce(s: number): string {
    if (!Number.isFinite(s) || s < 0) return UNITA.nonDisponibile;
    if (s < 60) return formatCifre(s, 3) + SPAZIO_NB + UNITA.s;
    if (s < 3600) {
      const tot = Math.round(s);
      const m = Math.floor(tot / 60);
      const r = tot - m * 60;
      return `${m}${SPAZIO_NB}${UNITA.min} ${r}${SPAZIO_NB}${UNITA.s}`;
    }
    if (s < SECONDI_GIORNO) {
      const tot = Math.round(s / 60);
      const h = Math.floor(tot / 60);
      const m = tot - h * 60;
      return `${h}${SPAZIO_NB}${UNITA.h} ${m}${SPAZIO_NB}${UNITA.min}`;
    }
    const giorni = s / SECONDI_GIORNO;
    if (giorni < GIORNI_ANNO) return formatCifre(giorni, 3) + SPAZIO_NB + UNITA.giorni;
    return formatCifre(giorni / GIORNI_ANNO, 2) + SPAZIO_NB + UNITA.anni;
  }

  /**
   * ΔT e incertezza nella stessa unità, scelta dall'incertezza (secondi sotto un'ora, ore oltre), con il valore
   * arrotondato alla cifra dell'incertezza (§ 11.13): "69,2 ± 3,3 s", "20 371 ± 518 s", "121,8 ± 28,6 h"; sotto 0,01 s
   * una cifra significativa: "69,193 ± 0,002 s".
   */
  function formatDeltaT(deltaT: number, sigma: number): DeltaTMostrato {
    if (!Number.isFinite(deltaT) || !Number.isFinite(sigma)) {
      return { valore: UNITA.nonDisponibile, sigma: UNITA.nonDisponibile, sigmaOre: UNITA.nonDisponibile };
    }
    const a = Math.abs(sigma);
    if (a >= 3600) {
      const ore = formatNumero(sigma / 3600, 1);
      return { valore: formatNumero(deltaT / 3600, 1), sigma: ore + SPAZIO_NB + UNITA.h, sigmaOre: ore };
    }
    const d = a < 0.01 ? Math.min(6, Math.ceil(-Math.log10(a))) : a < 1 ? 2 : a < 100 ? 1 : 0;
    return {
      valore: formatNumero(deltaT, d),
      sigma: formatNumero(sigma, d) + SPAZIO_NB + UNITA.s,
      sigmaOre: formatCifre(sigma / 3600, 2),
    };
  }

  /**
   * Periodo orbitale in giorni: "87,969 giorni", "11,862 anni", "11 400 anni"; con l'incertezza (giorni) le cifre
   * seguono cifreDaSigma.
   */
  function formatPeriodo(giorni: number, incertezza?: number): string {
    if (!Number.isFinite(giorni)) return UNITA.nonDisponibile;
    if (giorni < 2 * GIORNI_ANNO) {
      const c = incertezza === undefined ? 6 : cifreDaSigma(giorni, incertezza, 2, 8);
      return formatCifre(giorni, c) + SPAZIO_NB + UNITA.giorni;
    }
    const anni = giorni / GIORNI_ANNO;
    const c = incertezza === undefined ? 5 : cifreDaSigma(anni, incertezza / GIORNI_ANNO, 2, 8);
    return formatCifre(anni, c) + SPAZIO_NB + UNITA.anni;
  }

  /**
   * Valore con incertezza (§ 11.13): incertezza a due cifre significative, valore arrotondato alla stessa cifra:
   * 18 ± 1 → "18,0" e "1,0"; 350 ± 57,5 → "350" e "58"; 0,001496 ± 0,0005 → "0,00150" e "0,00050".
   */
  function formatConIncertezza(valore: number, incertezza: number): { valore: string; incertezza: string } {
    if (!Number.isFinite(valore) || !(incertezza > 0) || !Number.isFinite(incertezza)) {
      return { valore: formatNumero(valore), incertezza: formatNumero(incertezza) };
    }
    const potenza = Math.floor(Math.log10(arrotondaCifre(incertezza, 2))) - 1;
    const passo = 10 ** potenza;
    const dec = Math.max(0, -potenza);
    return { valore: formatNumero(Math.round(valore / passo) * passo, dec), incertezza: formatNumero(Math.round(incertezza / passo) * passo, dec) };
  }

  /**
   * Valore fisico con le cifre dell'incertezza ("18,0 ± 1,0") o, senza incertezza, con le cifre significative del valore
   * memorizzato ("25,9", "176"), al più max. L'incertezza si omette se il valore che ne deriva supera max cifre (Vesta:
   * 5,3421276322 ± 4·10⁻¹⁰ h). `fattore` converte l'unità (ore → giorni) conservando le cifre. La parte intera non si
   * arrotonda: oltre max cifre intere il valore è intero, senza zeri di riempimento (GM del Sole 132 712 440 041).
   */
  function formatValoreFisico(valore: number, incertezza: number | null, max: number, fattore = 1): string {
    if (incertezza !== null && incertezza > 0 && Number.isFinite(incertezza)) {
      const v = formatConIncertezza(valore * fattore, incertezza * fattore);
      if (v.valore.replace(/\D/g, '').replace(/^0+/, '').length <= max) return `${v.valore} ${UNITA.piuMeno} ${v.incertezza}`;
    }
    const x = valore * fattore;
    const intere = x === 0 || !Number.isFinite(x) ? 0 : Math.floor(Math.log10(Math.abs(x))) + 1;
    return formatCifre(x, Math.max(cifreSorgente(valore, max), intere));
  }

  /**
   * GM con incertezza o con le cifre della fonte (formatValoreFisico): in km³/s², sotto 10⁻³ km³/s² in m³/s² (1 km³ = 10⁹ m³).
   * Bennu: "4,8904 ± 0,0009 m³/s²" invece di "0,00000000489040 ± 0,00000000000090 km³/s²".
   */
  function misuraGM(valore: number, incertezza: number | null, max: number): Misura {
    const inM3 = Math.abs(valore) < SOGLIA_GM_M3;
    return {
      valore: formatValoreFisico(valore, incertezza, max, inM3 ? 1e9 : 1),
      unita: inM3 ? UNITA.mCubiS2 : UNITA.kmCubiS2,
      approssimato: false,
    };
  }

  /**
   * Angolo in gradi con decimali fissi: "7,005°". Con `ciclico` (longitudini, nodo, argomento del pericentro, anomalia
   * media) il valore mostrato è in [0°, 360°): la riduzione segue l'arrotondamento, 359,97° a un decimale è "0,0°".
   */
  function formatGradi(rad: number, decimali = 3, ciclico = false): string {
    if (!Number.isFinite(rad)) return UNITA.nonDisponibile;
    if (!ciclico) return formatNumero(rad * RAD_GRADI, decimali) + UNITA.gradi;
    const d = Math.max(0, Math.min(20, Math.round(decimali)));
    const arrotondato = Number.parseFloat((rad * RAD_GRADI).toFixed(d));
    const r = ((arrotondato % 360) + 360) % 360;
    return formatNumero(r, d) + UNITA.gradi;
  }

  /**
   * Angolo in gradi con decimali dall'errore angolare σ (rad), da 0 a `max`, e "≈" oltre 10⁻³ rad, la soglia relativa delle
   * distanze approssimate (§ 11.13): "123,51°", "≈ 124°". `ciclico` come in formatGradi.
   */
  function formatGradiConErrore(rad: number, sigma: number, max = 2, ciclico = false): string {
    if (!Number.isFinite(rad)) return UNITA.nonDisponibile;
    const s = Number.isFinite(sigma) ? Math.abs(sigma) : Number.POSITIVE_INFINITY;
    const testo = formatGradi(rad, decimaliLimitati(s * RAD_GRADI, 0, max), ciclico);
    return s > SOGLIA_APPROSSIMATO ? UNITA.circa + SPAZIO_NB + testo : testo;
  }

  /** Valore mostrato con un decimale sotto 10 e intero oltre, arrotondato prima di scegliere (9,96 → 10). */
  function arrotondatoMostrato(x: number): number {
    const r = Math.round(x * 10) / 10;
    return r < 10 ? r : Math.round(x);
  }

  function unDecimaleSotto10(x: number): string {
    const r = arrotondatoMostrato(x);
    return r < 10 ? formatNumero(r, 1) : formatNumero(r, 0);
  }

  /**
   * Errore angolare: secondi d'arco sotto 1′, primi sotto 1°, gradi oltre: "2,0″", "12′", "3,2°". L'unità si sceglie
   * dopo l'arrotondamento: 59,99999″ è "1,0′", non "60″".
   */
  function formatErroreAngolare(rad: number): string {
    if (!Number.isFinite(rad)) return UNITA.nonDisponibile;
    const gradi = Math.abs(rad) * RAD_GRADI;
    if (arrotondatoMostrato(gradi * 3600) < 60) return unDecimaleSotto10(gradi * 3600) + UNITA.secondi;
    if (arrotondatoMostrato(gradi * 60) < 60) return unDecimaleSotto10(gradi * 60) + UNITA.primi;
    return unDecimaleSotto10(gradi) + UNITA.gradi;
  }

  /** Gradi senza simbolo con una cifra decimale sotto 10 (per testi come "la Luna può trovarsi 3,2° ..."). */
  function formatGradiBreve(gradi: number): string {
    if (!Number.isFinite(gradi)) return UNITA.nonDisponibile;
    const a = Math.abs(gradi);
    return a < 10 ? formatNumero(gradi, a < 1 ? 2 : 1) : formatNumero(gradi, 0);
  }

  // --- Date ---

  /**
   * Anno storico, mai raggruppato. Italiano: "10000 a.C.", "800 d.C.", "2026". Inglese: "10000 BC", "AD 800", "2026".
   * Con 'auto' il suffisso d.C. (AD) compare solo fino all'anno 1000 (§ 11.14).
   */
  function formatAnno(annoAstronomico: number, suffisso: SuffissoEra = 'auto'): string {
    const { annoStorico, era } = annoStoricoDaAstronomico(annoAstronomico);
    if (era === 'aC') return `${annoStorico}${SPAZIO_NB}${UNITA.aC}`;
    if (suffisso === 'sempre' || annoStorico <= 1000) {
      return lingua === 'en' ? `${UNITA.dC}${SPAZIO_NB}${annoStorico}` : `${annoStorico}${SPAZIO_NB}${UNITA.dC}`;
    }
    return String(annoStorico);
  }

  /** Giorno del mese: in italiano "1°" per il primo, altrimenti il numero. */
  function formatGiorno(giorno: number): string {
    return giorno === 1 && lingua === 'it' ? '1°' : String(giorno);
  }

  /** Data, con il giorno prima del mese: "1° gennaio 10000 a.C.", "18 ottobre 2026", "1 January 10000 BC". */
  function formatData(d: Pick<DataCalendario, 'anno' | 'mese' | 'giorno'>, suffisso: SuffissoEra = 'auto'): string {
    return `${formatGiorno(d.giorno)} ${MESI[d.mese - 1] ?? ''} ${formatAnno(d.anno, suffisso)}`;
  }

  /** Data breve per le tacche: "18 ott", "18 Oct". */
  function formatDataBreve(d: Pick<DataCalendario, 'mese' | 'giorno'>): string {
    return `${d.giorno} ${MESI_BREVI[d.mese - 1] ?? ''}`;
  }

  /** Data e ora: "18 ottobre 2026, 21:45 UT". */
  function formatDataOra(d: DataCalendario, scala: string, suffisso: SuffissoEra = 'auto'): string {
    return `${formatData(d, suffisso)}, ${formatOra(d.ora, d.minuto)} ${scala}`;
  }

  /** Offset fisso: "UTC+2", "UTC−3:30", "UTC+5:45", "UTC+0". */
  function formatOffset(minuti: number): string {
    const segno = minuti < 0 ? MENO : '+';
    const a = Math.abs(Math.round(minuti));
    const h = Math.floor(a / 60);
    const m = a - h * 60;
    return `${UNITA.utc}${segno}${h}${m === 0 ? '' : ':' + String(m).padStart(2, '0')}`;
  }

  /** JD con 5 decimali (circa 1 s), raggruppato: "2 461 332,40417", "2,461,332.40417". */
  function formatJd(jd: number): string {
    return formatNumero(jd, 5);
  }

  return {
    separatori: SEP,
    formatNumero,
    formatCifre,
    formatIntero,
    testoMisura,
    misuraDistanza,
    formatAmpiezza,
    misuraVelocita,
    formatTempoLuce,
    formatDeltaT,
    formatPeriodo,
    formatConIncertezza,
    formatValoreFisico,
    misuraGM,
    formatGradi,
    formatGradiConErrore,
    formatErroreAngolare,
    formatGradiBreve,
    formatAnno,
    formatGiorno,
    formatData,
    formatDataBreve,
    formatDataOra,
    formatOffset,
    formatJd,
  };
}

const F = creaFormati(LINGUA);

/** Separatori della lingua dell'interfaccia. */
export const SEPARATORI: SeparatoriNumero = F.separatori;
export const formatNumero = F.formatNumero;
export const formatCifre = F.formatCifre;
export const formatIntero = F.formatIntero;
export const testoMisura = F.testoMisura;
export const misuraDistanza = F.misuraDistanza;
export const formatAmpiezza = F.formatAmpiezza;
export const misuraVelocita = F.misuraVelocita;
export const formatTempoLuce = F.formatTempoLuce;
export const formatDeltaT = F.formatDeltaT;
export const formatPeriodo = F.formatPeriodo;
export const formatConIncertezza = F.formatConIncertezza;
export const formatValoreFisico = F.formatValoreFisico;
export const misuraGM = F.misuraGM;
export const formatGradi = F.formatGradi;
export const formatGradiConErrore = F.formatGradiConErrore;
export const formatErroreAngolare = F.formatErroreAngolare;
export const formatGradiBreve = F.formatGradiBreve;
export const formatAnno = F.formatAnno;
export const formatGiorno = F.formatGiorno;
export const formatData = F.formatData;
export const formatDataBreve = F.formatDataBreve;
export const formatDataOra = F.formatDataOra;
export const formatOffset = F.formatOffset;
export const formatJd = F.formatJd;
