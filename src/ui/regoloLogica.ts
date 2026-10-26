// Logica del regolo temporale a due livelli (§ 11.4.3): tacche adattive del regolo inferiore,
// posizioni della barra panoramica, scala da 1 giorno a 12 000 anni. Senza DOM.

import { JD_MAX_UT_EXCL, JD_MIN_UT, calendarLocaleToJd, calendarioApplicato, jdToCalendarLocale } from '../time/calendar';
import type { UnitaPasso } from '../time/steps';
import { UNITA_PASSO } from '../time/steps';
import { formatAnno, formatDataBreve, formatOra } from './format';
import { MESI_BREVI } from './testi';

export const GIORNI_ANNO = 365.25;
/** Ampiezza del regolo inferiore: da 1 giorno a 12 000 anni (§ 11.4.3). */
export const AMPIEZZA_MIN = 1;
export const AMPIEZZA_MAX = 12_000 * GIORNI_ANNO;
export const AMPIEZZA_PREDEFINITA = 4 * GIORNI_ANNO;

export function limitaAmpiezza(giorni: number): number {
  if (!Number.isFinite(giorni)) return AMPIEZZA_PREDEFINITA;
  return Math.min(AMPIEZZA_MAX, Math.max(AMPIEZZA_MIN, giorni));
}

/** Ascissa (px) di un istante nel regolo inferiore centrato su jdCentro. */
export function xDaJd(jd: number, jdCentro: number, ampiezza: number, larghezza: number): number {
  return larghezza / 2 + ((jd - jdCentro) * larghezza) / ampiezza;
}

/** Istante sotto l'ascissa x (px). */
export function jdDaX(x: number, jdCentro: number, ampiezza: number, larghezza: number): number {
  return jdCentro + ((x - larghezza / 2) * ampiezza) / larghezza;
}

/** Spostamento in giorni per un trascinamento di dx px (verso destra = indietro nel tempo). */
export function deltaTrascinamento(dx: number, ampiezza: number, larghezza: number): number {
  return (-dx * ampiezza) / Math.max(1, larghezza);
}

type UnitaTacca =
  | { tipo: 'ore'; n: number }
  | { tipo: 'giorni'; n: number }
  | { tipo: 'mesi'; n: number }
  | { tipo: 'anni'; n: number };

const SCALA_TACCHE: readonly UnitaTacca[] = [
  { tipo: 'ore', n: 1 },
  { tipo: 'ore', n: 3 },
  { tipo: 'ore', n: 6 },
  { tipo: 'ore', n: 12 },
  { tipo: 'giorni', n: 1 },
  { tipo: 'giorni', n: 2 },
  { tipo: 'giorni', n: 5 },
  // Giorni 1, 11, 21 e 1, 16 del mese: tra 5 giorni e 1 mese almeno un'etichetta resta nella finestra.
  { tipo: 'giorni', n: 10 },
  { tipo: 'giorni', n: 15 },
  { tipo: 'mesi', n: 1 },
  { tipo: 'mesi', n: 3 },
  { tipo: 'mesi', n: 6 },
  { tipo: 'anni', n: 1 },
  { tipo: 'anni', n: 2 },
  { tipo: 'anni', n: 5 },
  { tipo: 'anni', n: 10 },
  { tipo: 'anni', n: 20 },
  { tipo: 'anni', n: 50 },
  { tipo: 'anni', n: 100 },
  { tipo: 'anni', n: 200 },
  { tipo: 'anni', n: 500 },
  { tipo: 'anni', n: 1000 },
  { tipo: 'anni', n: 2000 },
  { tipo: 'anni', n: 5000 },
];

function giorniUnita(u: UnitaTacca): number {
  switch (u.tipo) {
    case 'ore':
      return u.n / 24;
    case 'giorni':
      return u.n;
    case 'mesi':
      return u.n * 30.436875;
    case 'anni':
      return u.n * GIORNI_ANNO;
  }
}

/** Distanze minime tra le tacche minori e tra le etichette, px. */
export const PASSO_MINORE_PX = 7;
export const PASSO_ETICHETTE_PX = 92;

export interface Tacca {
  jd: number;
  x: number;
  maggiore: boolean;
  etichetta: string | null;
}

function sceltaUnita(pxPerGiorno: number, minPx: number): UnitaTacca {
  for (const u of SCALA_TACCHE) if (giorniUnita(u) * pxPerGiorno >= minPx) return u;
  return SCALA_TACCHE[SCALA_TACCHE.length - 1]!;
}

const MAX_TACCHE = 600;
/** Giorni prima dell'intervallo da cui partire per conoscere la tacca precedente: oltre due intervalli (al massimo 16 giorni). */
const GIORNI_RINCULO = 40;

/**
 * Istanti (UT o TT, senza offset) dei confini dell'unità nell'intervallo, nell'ora mostrata. `minPx` e `pxPerGiorno`
 * decidono se l'anno 1 d.C. prende il posto del multiplo 0 inesistente (unità di più anni).
 */
function confini(u: UnitaTacca, jd0: number, jd1: number, offsetMin: number, minPx = 0, pxPerGiorno = 0): number[] {
  const out: number[] = [];
  const off = offsetMin / 1440;
  if (u.tipo === 'ore') {
    const h0 = Math.ceil(((jd0 + off + 0.5) * 24) / u.n);
    for (let k = h0; out.length < MAX_TACCHE; k++) {
      const jd = (k * u.n) / 24 - 0.5 - off;
      if (jd > jd1) break;
      out.push(jd);
    }
    return out;
  }
  if (u.tipo === 'giorni') {
    // Con n > 1 le tacche cadono sui giorni 1, 1 + n, ... del mese. Il salto del calendario (5-14 ottobre 1582 non
    // esistono) avvicina due tacche consecutive: con n = 15 l'1 ottobre (giuliano) e il 16 (gregoriano) distano 5
    // giorni. Si omette la tacca che dista dalla precedente meno di mezza unità (senza salto la distanza non scende
    // sotto la metà: 1 giorno per n = 2, dal 29 febbraio al 1° marzo). La tacca precedente si cerca da GIORNI_RINCULO
    // giorni prima dell'intervallo, così l'esito non dipende da quanta parte del regolo si vede.
    const g0 = Math.ceil(jd0 + off + 0.5);
    let precedente: number | null = null;
    for (let g = g0 - (u.n > 1 ? GIORNI_RINCULO : 0); out.length < MAX_TACCHE; g++) {
      const jd = g - 0.5 - off;
      if (jd > jd1) break;
      if (u.n > 1) {
        const d = jdToCalendarLocale(jd, offsetMin);
        if ((d.giorno - 1) % u.n !== 0 || d.giorno + u.n > 32) continue;
        if (precedente !== null && (g - precedente) * 2 < u.n) continue;
        precedente = g;
      }
      if (g >= g0) out.push(jd);
    }
    return out;
  }
  if (u.tipo === 'mesi') {
    const d0 = jdToCalendarLocale(jd0, offsetMin);
    let anno = d0.anno;
    let mese = d0.mese;
    for (let i = 0; i < MAX_TACCHE * 6; i++) {
      if ((mese - 1) % u.n === 0) {
        const cal = calendarioApplicato(anno, mese, 1) ?? 'gregoriano';
        const jd = calendarLocaleToJd({ anno, mese, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: cal }, offsetMin);
        if (jd > jd1) break;
        if (jd >= jd0) out.push(jd);
      }
      mese += 1;
      if (mese > 12) {
        mese = 1;
        anno += 1;
      }
    }
    return out;
  }
  // Anni: multipli dell'anno storico (1 a.C. = -1 con segno, 1 d.C. = 1), così le tacche cadono
  // su 500 a.C., 1000 a.C., ... e non sugli anni astronomici. Il multiplo 0 non esiste: con unità di n > 1 anni
  // lo sostituisce l'anno 1 d.C. solo se dista dalla tacca di n d.C. (n - 1 anni) almeno la distanza minima tra
  // le tacche (minPx); altrimenti si omette e le tacche di n a.C. e n d.C. distano 2n - 1 anni.
  const conAnno1 = u.n > 1 && (u.n - 1) * GIORNI_ANNO * pxPerGiorno >= minPx;
  const y0 = jdToCalendarLocale(jd0, offsetMin).anno;
  const y1 = jdToCalendarLocale(jd1, offsetMin).anno;
  const storico = (y: number) => (y >= 1 ? y : y - 1);
  const k0 = Math.floor(storico(y0) / u.n);
  const k1 = Math.ceil(storico(y1) / u.n);
  for (let k = k0; k <= k1 && out.length < MAX_TACCHE; k++) {
    const h = k * u.n;
    let anni: number[];
    if (h === 0) anni = conAnno1 ? [1] : [];
    else anni = [h >= 1 ? h : h + 1];
    for (const anno of anni) {
      const cal = calendarioApplicato(anno, 1, 1) ?? 'gregoriano';
      const jd = calendarLocaleToJd({ anno, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: cal }, offsetMin);
      if (jd >= jd0 && jd <= jd1) out.push(jd);
    }
  }
  return out;
}

function etichetta(u: UnitaTacca, jd: number, offsetMin: number): string {
  const d = jdToCalendarLocale(jd, offsetMin);
  switch (u.tipo) {
    case 'ore':
      return d.ora === 0 && d.minuto === 0 ? formatDataBreve(d) : formatOra(d.ora, d.minuto);
    case 'giorni':
      return d.giorno === 1 && d.mese === 1 ? formatAnno(d.anno) : formatDataBreve(d);
    case 'mesi':
      return d.mese === 1 ? formatAnno(d.anno) : `${MESI_BREVI[d.mese - 1] ?? ''} ${formatAnno(d.anno)}`;
    case 'anni':
      return formatAnno(d.anno);
  }
}

/** Stima della larghezza in px di un'etichetta del regolo (Source Sans 3, 12 px). */
export function larghezzaEtichetta(t: string): number {
  return t.length * 6.4 + 4;
}

/** Vero se l'etichetta della tacca è intera nel regolo (2 px dai bordi). */
export function etichettaIntera(t: Pick<Tacca, 'x' | 'etichetta'>, larghezza: number): boolean {
  if (t.etichetta === null) return false;
  const meta = larghezzaEtichetta(t.etichetta) / 2;
  return t.x - meta >= 2 && t.x + meta <= larghezza - 2;
}

/**
 * Tacche adattive del regolo inferiore (minori senza etichetta, maggiori con etichetta). Se nessuna etichetta delle
 * tacche maggiori è intera nel regolo, la tacca minore più vicina all'ago riceve la propria etichetta: nella finestra
 * c'è sempre almeno un riferimento di data.
 */
export function tacche(jdCentro: number, ampiezza: number, larghezza: number, offsetMin = 0): Tacca[] {
  if (!(larghezza > 0)) return [];
  const pxPerGiorno = larghezza / ampiezza;
  const minore = sceltaUnita(pxPerGiorno, PASSO_MINORE_PX);
  const maggiore = sceltaUnita(pxPerGiorno, PASSO_ETICHETTE_PX);
  const jd0 = jdDaX(-40, jdCentro, ampiezza, larghezza);
  const jd1 = jdDaX(larghezza + 40, jdCentro, ampiezza, larghezza);
  const lo = Math.max(jd0, JD_MIN_UT - 30);
  const hi = Math.min(jd1, JD_MAX_UT_EXCL + 30);
  if (hi <= lo) return [];
  const maggiori = confini(maggiore, lo, hi, offsetMin, PASSO_ETICHETTE_PX, pxPerGiorno);
  const chiavi = new Set(maggiori.map((j) => Math.round(j * 1440)));
  const out: Tacca[] = maggiori.map((jd) => ({
    jd,
    x: xDaJd(jd, jdCentro, ampiezza, larghezza),
    maggiore: true,
    etichetta: etichetta(maggiore, jd, offsetMin),
  }));
  if (minore !== maggiore) {
    for (const jd of confini(minore, lo, hi, offsetMin, PASSO_MINORE_PX, pxPerGiorno)) {
      if (chiavi.has(Math.round(jd * 1440))) continue;
      out.push({ jd, x: xDaJd(jd, jdCentro, ampiezza, larghezza), maggiore: false, etichetta: null });
    }
  }
  out.sort((a, b) => a.jd - b.jd);
  if (!out.some((t) => etichettaIntera(t, larghezza))) {
    let migliore: Tacca | null = null;
    for (const t of out) {
      if (t.maggiore) continue;
      const prova = { x: t.x, etichetta: etichetta(minore, t.jd, offsetMin) };
      if (!etichettaIntera(prova, larghezza)) continue;
      if (migliore === null || Math.abs(t.x - larghezza / 2) < Math.abs(migliore.x - larghezza / 2)) migliore = t;
    }
    if (migliore !== null) migliore.etichetta = etichetta(minore, migliore.jd, offsetMin);
  }
  return out;
}

// --- Barra panoramica ---

export interface TaccaPanoramica {
  jd: number;
  etichetta: string;
  /** Priorità di visualizzazione dell'etichetta (0 = massima). */
  priorita: number;
}

/** Tacche fisse della panoramica: 10000 a.C., 5000 a.C., 1 d.C., 1582, 2120 (§ 11.4.3). */
export function tacchePanoramica(): TaccaPanoramica[] {
  const inizio = (anno: number) => {
    const cal = calendarioApplicato(anno, 1, 1) ?? 'gregoriano';
    return calendarLocaleToJd({ anno, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: cal }, 0);
  };
  return [
    { jd: JD_MIN_UT, etichetta: formatAnno(-9999), priorita: 0 },
    { jd: inizio(-4999), etichetta: formatAnno(-4999), priorita: 3 },
    { jd: inizio(1), etichetta: formatAnno(1, 'sempre'), priorita: 2 },
    { jd: inizio(1582), etichetta: formatAnno(1582), priorita: 4 },
    { jd: JD_MAX_UT_EXCL, etichetta: formatAnno(2120), priorita: 1 },
  ];
}

/** Frazione [0, 1] di un istante nella panoramica. */
export function frazionePanoramica(jd: number): number {
  return Math.min(1, Math.max(0, (jd - JD_MIN_UT) / (JD_MAX_UT_EXCL - JD_MIN_UT)));
}

export function jdDaFrazionePanoramica(f: number): number {
  return JD_MIN_UT + Math.min(1, Math.max(0, f)) * (JD_MAX_UT_EXCL - JD_MIN_UT);
}

/**
 * Etichette visibili senza sovrapposizioni: si tengono per priorità finché non collidono.
 * `larghezzaEtichetta` stima la larghezza in px di un'etichetta.
 */
export function etichetteSenzaCollisioni<T extends { x: number; priorita: number; etichetta: string }>(
  voci: readonly T[],
  larghezzaEtichetta: (e: string) => number,
  larghezza: number,
  margine = 8,
): Set<T> {
  const tenute: { a: number; b: number }[] = [];
  const out = new Set<T>();
  for (const v of [...voci].sort((p, q) => p.priorita - q.priorita)) {
    const w = larghezzaEtichetta(v.etichetta);
    let a = v.x - w / 2;
    a = Math.max(0, Math.min(larghezza - w, a));
    const b = a + w;
    if (tenute.some((t) => a < t.b + margine && b > t.a - margine)) continue;
    tenute.push({ a, b });
    out.add(v);
  }
  return out;
}

/** Unità superiore per PagSu/PagGiù (§ 11.4.3); il millennio resta tale. */
export function unitaSuperiore(u: UnitaPasso): UnitaPasso {
  const i = UNITA_PASSO.indexOf(u);
  return UNITA_PASSO[Math.min(UNITA_PASSO.length - 1, i + 1)] ?? u;
}

/** Testo dell'ampiezza del regolo: "4 anni", "1 giorno", "12 000 anni". */
export function testoAmpiezza(giorni: number): { valore: number; unita: 'giorni' | 'anni' } {
  if (giorni < GIORNI_ANNO) return { valore: Math.round(giorni), unita: 'giorni' };
  return { valore: Math.round(giorni / GIORNI_ANNO), unita: 'anni' };
}
