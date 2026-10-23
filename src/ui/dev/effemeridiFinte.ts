// Servizio di effemeridi di sviluppo (solo ui-lab.html): coniche kepleriane approssimate, senza
// alcuna pretesa di accuratezza. Pianeti: elementi medi di E. M. Standish, "Keplerian Elements
// for Approximate Positions of the Major Planets" (JPL SSD, tabella 1, 1800-2050). Luna: formule
// di bassa precisione di P. Schlyter (elementi medi con regressione del nodo e degli apsidi).
// Altri corpi: elementi arrotondati da JPL SBDB e periodi dei satelliti da JPL Planetary
// Satellite Mean Elements, con anomalie iniziali convenzionali. L'affidabilità è sintetica e
// serve a mostrare tutti i livelli del § 7.8.2.

import type { Catalogo, CorpoCatalogo } from '../../data/catalogTypes';
import { GM_BARICENTRI, GM_SOLE, GIORNO_S, J2000, UA_KM } from '../../ephem/constants';
import { conicaDaStato } from '../../ephem/equinoctial';
import type { ElementiConica } from '../../ephem/equinoctial';
import type { Affidabilita, ElementiOrbita, EphemerisService, Livello, StatoEffemeride } from '../../ephem/types';
import { calendarToJd } from '../../time/calendar';
import type { TimeState } from '../../time/types';

const GRADI = Math.PI / 180;
const ARCSEC = Math.PI / 648_000;

/** Elementi kepleriani: q (km), e, i, Ω, ω (rad), Tp (JD TDB), μ (km³/s²). */
interface Conica {
  q: number;
  e: number;
  i: number;
  nodo: number;
  argPeri: number;
  tp: number;
  mu: number;
}

// Standish, tabella 1: a (UA), e, I, L, ϖ, Ω (gradi) e variazioni per secolo giuliano.
const PIANETI: Record<string, readonly number[]> = {
  mercurio: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venere: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  terra: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  marte: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  giove: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturno: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  urano: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  nettuno: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  plutone: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
};

const NAIF_PIANETA: Record<string, number> = { mercurio: 1, venere: 2, terra: 3, marte: 4, giove: 5, saturno: 6, urano: 7, nettuno: 8, plutone: 9 };

// Piccoli corpi con orbita ellittica: a (UA), e, i, Ω, ω (gradi); anomalia iniziale convenzionale.
const ELLITTICI: Record<string, readonly number[]> = {
  cerere: [2.7691, 0.076, 10.594, 80.305, 73.597],
  eris: [67.86, 0.4361, 44.04, 35.95, 151.64],
  haumea: [43.13, 0.191, 28.21, 121.8, 239.0],
  makemake: [45.43, 0.161, 28.98, 79.6, 294.8],
  gonggong: [67.4, 0.5, 30.6, 336.8, 207.2],
  quaoar: [43.69, 0.04, 7.99, 188.9, 147.5],
  orco: [39.42, 0.227, 20.57, 268.8, 72.3],
  salacia: [42.18, 0.103, 23.93, 280.3, 309.4],
  varuna: [43.0, 0.054, 17.2, 97.3, 273.2],
  issione: [39.6, 0.244, 19.6, 71.0, 298.8],
  mani: [41.6, 0.15, 17.7, 216.0, 90.0],
  arrokoth: [44.58, 0.042, 2.45, 158.9, 174.4],
  chiron: [13.69, 0.379, 6.93, 209.3, 339.3],
  chariklo: [15.82, 0.17, 23.4, 300.4, 242.0],
  pallade: [2.7724, 0.2299, 34.84, 173.02, 310.05],
  giunone: [2.6683, 0.2562, 12.99, 169.85, 248.14],
  vesta: [2.3615, 0.0887, 7.14, 103.81, 151.2],
  igea: [3.1399, 0.1124, 3.83, 283.2, 312.32],
  psyche: [2.9238, 0.134, 3.1, 150.03, 229.22],
  lutetia: [2.4352, 0.1636, 3.06, 80.87, 250.23],
  euphrosyne: [3.155, 0.221, 26.29, 31.12, 61.47],
  '52-europa': [3.1, 0.106, 7.48, 128.6, 344.0],
  sylvia: [3.48, 0.09, 10.86, 73.0, 263.0],
  ida: [2.861, 0.044, 1.13, 324.0, 110.0],
  mathilde: [2.648, 0.266, 6.74, 179.6, 157.4],
  eros: [1.458, 0.223, 10.83, 304.3, 178.8],
  patientia: [3.06, 0.07, 15.2, 89.2, 337.0],
  davida: [3.17, 0.19, 15.9, 107.6, 339.0],
  patroclus: [5.21, 0.14, 22.04, 44.3, 307.0],
  hektor: [5.26, 0.02, 18.2, 342.8, 185.0],
  interamnia: [3.06, 0.155, 17.3, 280.3, 95.0],
  gaspra: [2.21, 0.173, 4.1, 253.2, 129.5],
  steins: [2.36, 0.146, 9.94, 55.4, 250.9],
  phaethon: [1.271, 0.89, 22.26, 265.2, 322.2],
  eurybates: [5.21, 0.09, 8.06, 43.6, 27.0],
  toutatis: [2.54, 0.625, 0.45, 125.4, 278.7],
  annefrank: [2.21, 0.064, 4.25, 120.6, 9.4],
  braille: [2.34, 0.433, 29.0, 241.9, 356.0],
  itokawa: [1.324, 0.28, 1.62, 69.08, 162.8],
  donaldjohanson: [2.38, 0.186, 4.42, 262.8, 212.9],
  didymos: [1.643, 0.384, 3.41, 73.2, 319.3],
  apophis: [0.9224, 0.1914, 3.34, 204.0, 126.6],
  bennu: [1.126, 0.2037, 6.03, 2.06, 66.2],
  dinkinesh: [2.19, 0.112, 2.09, 21.4, 66.6],
  ryugu: [1.19, 0.19, 5.88, 251.6, 211.4],
};

// Comete e interstellari: q (UA), e, i, Ω, ω (gradi), perielio [anno, mese, giorno].
const CON_PERIELIO: Record<string, readonly number[]> = {
  sedna: [76.2, 0.8496, 11.93, 144.5, 311.3, 2076, 1, 1],
  '1p-halley': [0.586, 0.967, 162.26, 58.42, 111.33, 1986, 2, 9],
  '2p-encke': [0.336, 0.848, 11.78, 334.57, 186.54, 2023, 10, 22],
  '9p-tempel-1': [1.54, 0.51, 10.5, 68.9, 179.2, 2022, 3, 4],
  '12p-pons-brooks': [0.781, 0.955, 74.19, 255.86, 198.99, 2024, 4, 21],
  '19p-borrelly': [1.31, 0.64, 30.3, 74.3, 351.9, 2022, 2, 1],
  '21p-giacobini-zinner': [1.01, 0.71, 32.0, 195.4, 172.8, 2018, 9, 10],
  '26p-grigg-skjellerup': [1.08, 0.64, 22.4, 211.4, 2.2, 2018, 10, 1],
  '29p-schwassmann-wachmann-1': [5.77, 0.04, 9.4, 312.4, 50.0, 2019, 3, 7],
  '46p-wirtanen': [1.06, 0.66, 11.7, 82.2, 356.3, 2018, 12, 12],
  '55p-tempel-tuttle': [0.976, 0.906, 162.5, 235.3, 172.5, 1998, 2, 28],
  '67p-churyumov-gerasimenko': [1.21, 0.65, 3.87, 36.3, 22.1, 2021, 11, 2],
  '81p-wild-2': [1.6, 0.54, 3.24, 136.1, 41.7, 2022, 12, 15],
  '103p-hartley-2': [1.06, 0.69, 13.6, 219.8, 181.3, 2023, 10, 12],
  '109p-swift-tuttle': [0.96, 0.963, 113.45, 139.38, 152.98, 1992, 12, 12],
  'c1680-v1': [0.0062, 0.9999, 60.68, 276.6, 350.7, 1680, 12, 18],
  'c1965-s1-ikeya-seki': [0.0078, 0.9999, 141.86, 346.99, 69.05, 1965, 10, 21],
  'c1975-v1-west': [0.197, 0.9999, 43.07, 118.9, 358.4, 1976, 2, 25],
  'c1995-o1-hale-bopp': [0.914, 0.9951, 89.43, 282.47, 130.59, 1997, 4, 1],
  'c1996-b2-hyakutake': [0.23, 0.9999, 124.92, 188.05, 130.18, 1996, 5, 1],
  'c2006-p1-mcnaught': [0.171, 0.9999, 77.84, 267.4, 155.98, 2007, 1, 12],
  'c2013-a1-siding-spring': [1.4, 1.0006, 129.0, 300.97, 2.43, 2014, 10, 25],
  'c2020-f3-neowise': [0.295, 0.9992, 128.94, 61.01, 37.28, 2020, 7, 3],
  'c2023-a3-tsuchinshan-atlas': [0.391, 1.0001, 139.1, 21.56, 308.5, 2024, 9, 27],
  '1i-oumuamua': [0.2559, 1.2011, 122.74, 24.6, 241.81, 2017, 9, 9],
  '2i-borisov': [2.0066, 3.3565, 44.05, 308.15, 209.12, 2019, 12, 8],
  '3i-atlas': [1.357, 6.139, 175.11, 322.16, 128.01, 2025, 10, 29],
};

// Satelliti: a (km), periodo (giorni), e, i, Ω (gradi, eclittica approssimata).
const SATELLITI: Record<string, readonly number[]> = {
  fobos: [9376, 0.31891, 0.015, 26.0, 82.0],
  deimos: [23_463, 1.26244, 0.0002, 27.0, 83.0],
  io: [421_700, 1.769138, 0.0041, 2.2, 337.0],
  europa: [671_034, 3.551181, 0.009, 2.6, 336.0],
  ganimede: [1_070_412, 7.154553, 0.0013, 2.3, 340.0],
  callisto: [1_882_709, 16.689018, 0.0074, 2.0, 337.0],
  amaltea: [181_366, 0.498179, 0.0032, 2.6, 335.0],
  imalia: [11_460_000, 250.56, 0.16, 28.0, 57.0],
  mimas: [185_539, 0.942422, 0.0196, 28.0, 169.0],
  encelado: [237_948, 1.370218, 0.0047, 28.0, 169.0],
  teti: [294_619, 1.887802, 0.0001, 28.0, 169.0],
  dione: [377_396, 2.736915, 0.0022, 28.0, 169.0],
  rea: [527_108, 4.518212, 0.001, 28.0, 169.0],
  titano: [1_221_870, 15.945421, 0.0288, 27.7, 169.0],
  iperione: [1_500_880, 21.276609, 0.1042, 27.5, 168.0],
  giapeto: [3_560_820, 79.330183, 0.0283, 17.0, 140.0],
  febe: [12_947_780, 550.564636, 0.1562, 175.0, 241.0],
  miranda: [129_390, 1.413479, 0.0013, 97.8, 167.0],
  ariel: [191_020, 2.520379, 0.0012, 97.7, 167.0],
  umbriel: [266_000, 4.144176, 0.0039, 97.7, 167.0],
  titania: [435_910, 8.705867, 0.0011, 97.8, 167.0],
  oberon: [583_520, 13.463234, 0.0014, 97.9, 167.0],
  tritone: [354_759, 5.876854, 0.00002, 130.0, 178.0],
  proteo: [117_647, 1.122315, 0.0005, 29.0, 49.0],
  nereide: [5_513_818, 360.13619, 0.7507, 7.2, 334.0],
  caronte: [19_591, 6.387221, 0.0002, 112.9, 228.0],
  notte: [48_694, 24.85463, 0.002, 112.9, 228.0],
  idra: [64_738, 38.20177, 0.0059, 112.9, 228.0],
  disnomia: [37_273, 15.785899, 0.0062, 78.3, 126.0],
};

const LIVELLI_SOGLIE: readonly [number, Livello][] = [
  [ARCSEC * 60, 'precisa'],
  [GRADI, 'buona'],
  [10 * GRADI, 'approssimata'],
  [90 * GRADI, 'indicativa'],
];

function livelloDa(eps: number): Livello {
  if (!Number.isFinite(eps)) return 'non-determinabile';
  for (const [s, l] of LIVELLI_SOGLIE) if (eps <= s) return l;
  return 'non-determinabile';
}

function anno(jd: number): number {
  return 2000 + (jd - J2000) / 365.25;
}

function risolviEllittico(m: number, e: number): number {
  let ea = e < 0.8 ? m : Math.PI * Math.sign(Math.sin(m) || 1);
  for (let k = 0; k < 60; k++) {
    const d = (ea - e * Math.sin(ea) - m) / (1 - e * Math.cos(ea));
    ea -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return ea;
}

function risolviIperbolico(m: number, e: number): number {
  let hh = Math.asinh(m / e);
  for (let k = 0; k < 80; k++) {
    const d = (e * Math.sinh(hh) - hh - m) / (e * Math.cosh(hh) - 1);
    hh -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return hh;
}

/** Stato kepleriano [km, km/s] relativo al primario. */
function statoConica(c: Conica, jd: number, out: Float64Array): void {
  const e = c.e;
  let X: number;
  let Y: number;
  let VX: number;
  let VY: number;
  if (e < 1) {
    const a = c.q / (1 - e);
    const n = Math.sqrt(c.mu / (a * a * a));
    let m = n * (jd - c.tp) * GIORNO_S;
    m = ((m % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const ea = risolviEllittico(m, e);
    const b = a * Math.sqrt(1 - e * e);
    const den = 1 - e * Math.cos(ea);
    X = a * (Math.cos(ea) - e);
    Y = b * Math.sin(ea);
    VX = (-a * n * Math.sin(ea)) / den;
    VY = (b * n * Math.cos(ea)) / den;
  } else {
    const A = c.q / (e - 1);
    const n = Math.sqrt(c.mu / (A * A * A));
    const m = n * (jd - c.tp) * GIORNO_S;
    const hh = risolviIperbolico(m, e);
    const k = Math.sqrt(e * e - 1);
    const hd = n / (e * Math.cosh(hh) - 1);
    X = A * (e - Math.cosh(hh));
    Y = A * k * Math.sinh(hh);
    VX = -A * Math.sinh(hh) * hd;
    VY = A * k * Math.cosh(hh) * hd;
  }
  const co = Math.cos(c.nodo);
  const so = Math.sin(c.nodo);
  const cw = Math.cos(c.argPeri);
  const sw = Math.sin(c.argPeri);
  const ci = Math.cos(c.i);
  const si = Math.sin(c.i);
  const p11 = co * cw - so * sw * ci;
  const p12 = -co * sw - so * cw * ci;
  const p21 = so * cw + co * sw * ci;
  const p22 = -so * sw + co * cw * ci;
  const p31 = sw * si;
  const p32 = cw * si;
  out[0] = p11 * X + p12 * Y;
  out[1] = p21 * X + p22 * Y;
  out[2] = p31 * X + p32 * Y;
  out[3] = p11 * VX + p12 * VY;
  out[4] = p21 * VX + p22 * VY;
  out[5] = p31 * VX + p32 * VY;
}

function pseudo(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43_758.5453;
  return x - Math.floor(x);
}

/** Intervallo dei dati in caricamento simulato, JD TT. */
export interface BloccoSimulato {
  da: number;
  a: number;
}

export class EffemeridiFinte implements EphemerisService {
  private readonly perSsid = new Map<number, CorpoCatalogo>();
  private readonly perSlug = new Map<string, CorpoCatalogo>();
  private readonly tmp = new Float64Array(6);
  private readonly tmp2 = new Float64Array(6);
  private readonly conicaTmp: ElementiConica = {
    q: 0,
    e: 0,
    i: 0,
    nodo: 0,
    argPeri: 0,
    anomaliaVera: 0,
    a: 0,
    anomaliaMedia: 0,
    motoMedio: 0,
    tempoDalPericentro: 0,
  };
  /** Dati non pronti in questo intervallo (simulazione del caricamento dei blocchi). */
  bloccoInCaricamento: BloccoSimulato | null = null;

  constructor(catalogo: Catalogo) {
    for (const c of catalogo.corpi) {
      this.perSsid.set(c.ssid, c);
      this.perSlug.set(c.slug, c);
    }
  }

  private inCaricamento(jd: number): boolean {
    const b = this.bloccoInCaricamento;
    return b !== null && jd >= b.da && jd < b.a;
  }

  /** Conica del corpo relativa al primario all'istante (per i pianeti elementi medi alla data). */
  conica(c: CorpoCatalogo, jd: number): Conica | null {
    const T = (jd - J2000) / 36_525;
    const p = PIANETI[c.slug];
    if (p) {
      const el = (k: number) => p[k]! + p[k + 6]! * T;
      const a = el(0) * UA_KM;
      const e = el(1);
      const i = el(2) * GRADI;
      const L = el(3) * GRADI;
      const varpi = el(4) * GRADI;
      const nodo = el(5) * GRADI;
      const mu = GM_SOLE + (GM_BARICENTRI[NAIF_PIANETA[c.slug] ?? 0] ?? 0);
      const nGiorno = Math.sqrt(mu / (a * a * a)) * GIORNO_S;
      const m = (((L - varpi) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return { q: a * (1 - e), e, i, nodo, argPeri: varpi - nodo, tp: jd - m / nGiorno, mu };
    }
    if (c.slug === 'luna') {
      const d = jd - 2_451_543.5;
      const nodo = (125.1228 - 0.0529538083 * d) * GRADI;
      const w = (318.0634 + 0.1643573223 * d) * GRADI;
      const m = (115.3654 + 13.0649929509 * d) * GRADI;
      const mu = 398_600.435 + 4902.8;
      const a = 384_400;
      const n = Math.sqrt(mu / (a * a * a));
      const mr = ((m % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return { q: a * (1 - 0.0549), e: 0.0549, i: 5.1454 * GRADI, nodo, argPeri: w, tp: jd - mr / n / GIORNO_S, mu };
    }
    const s = SATELLITI[c.slug];
    if (s) {
      const [a, periodo, e, i, nodo] = s as [number, number, number, number, number];
      const mu = (4 * Math.PI * Math.PI * a * a * a) / (periodo * GIORNO_S) ** 2;
      const m0 = pseudo(c.ssid) * 2 * Math.PI;
      const n = (2 * Math.PI) / periodo;
      return { q: a * (1 - e), e, i: i * GRADI, nodo: nodo * GRADI, argPeri: pseudo(c.ssid + 7) * 2 * Math.PI, tp: J2000 - m0 / n, mu };
    }
    const el = ELLITTICI[c.slug];
    if (el) {
      const [aUa, e, i, nodo, w] = el as [number, number, number, number, number];
      const a = aUa * UA_KM;
      const n = Math.sqrt(GM_SOLE / (a * a * a)) * GIORNO_S;
      const m0 = pseudo(c.ssid) * 2 * Math.PI;
      return { q: a * (1 - e), e, i: i * GRADI, nodo: nodo * GRADI, argPeri: w * GRADI, tp: J2000 - m0 / n, mu: GM_SOLE };
    }
    const cp = CON_PERIELIO[c.slug];
    if (cp) {
      const [q, e, i, nodo, w, y, mo, g] = cp as [number, number, number, number, number, number, number, number];
      const tp = calendarToJd({ anno: y, mese: mo, giorno: g, ora: 0, minuto: 0, secondo: 0, calendario: y < 1582 ? 'giuliano' : 'gregoriano' });
      return { q: q * UA_KM, e, i: i * GRADI, nodo: nodo * GRADI, argPeri: w * GRADI, tp, mu: GM_SOLE };
    }
    return null;
  }

  stateAt(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride {
    const c = this.perSsid.get(ssid);
    if (!c) return 'non-determinabile';
    if (this.inCaricamento(jdTT)) return 'caricamento';
    if (c.categoria === 'sole') {
      out.fill(0);
      return 'ok';
    }
    const k = this.conica(c, jdTT);
    if (k === null) return 'non-determinabile';
    statoConica(k, jdTT, out);
    const primario = c.primario === null ? undefined : this.perSlug.get(c.primario);
    if (primario && primario.categoria !== 'sole') {
      const esito = this.stateAt(primario.ssid, jdTT, this.tmp2);
      if (esito !== 'ok') return esito;
      for (let j = 0; j < 6; j++) out[j] = out[j]! + this.tmp2[j]!;
    }
    return 'ok';
  }

  orbitAt(ssid: number, jdTT: number, out: ElementiOrbita): StatoEffemeride {
    const c = this.perSsid.get(ssid);
    if (!c || c.categoria === 'sole') return 'non-determinabile';
    if (this.inCaricamento(jdTT)) return 'caricamento';
    const k = this.conica(c, jdTT);
    if (k === null) return 'non-determinabile';
    statoConica(k, jdTT, this.tmp);
    const ck = this.conicaTmp;
    if (!conicaDaStato(this.tmp, k.mu, ck)) return 'non-determinabile';
    const primario = c.primario === null ? undefined : this.perSlug.get(c.primario);
    out.primario = primario?.ssid ?? 0;
    out.baricentrici = primario?.categoria === 'sole' && (ck.q / (1 - Math.min(ck.e, 0.999)) > 50 * UA_KM || ck.e > 0.98);
    out.q = ck.q;
    out.e = ck.e;
    out.i = ck.i;
    out.nodo = ck.nodo;
    out.argPeri = ck.argPeri;
    out.anomaliaVera = ck.anomaliaVera;
    const eps = this.epsModello(c, jdTT);
    out.forma = eps < 0.6 ? 'determinata' : eps < 3 ? 'indicativa' : 'non-determinata';
    return 'ok';
  }

  /** Errore del modello sintetico (rad). */
  epsModello(c: CorpoCatalogo, jd: number): number {
    const y = anno(jd);
    const secoli = Math.abs(y - 2000) / 100;
    switch (c.categoria) {
      case 'sole':
        return 0;
      case 'pianeta':
        return 2 * ARCSEC;
      case 'pianeta-nano':
        return c.slug === 'plutone' ? 2 * ARCSEC : 1e-6 * Math.exp(Math.abs(y - 2000) / 1800);
      case 'luna': {
        if (c.slug === 'luna') return Math.hypot(60 * ARCSEC, 0.5 * 0.2 * ARCSEC * secoli * secoli);
        const fuori = y < 1600 || y > 2200 ? (Math.abs(y < 1600 ? 1600 - y : y - 2200) / 100) ** 2 : 0;
        return Math.hypot(0.1 * GRADI, 0.004 * fuori);
      }
      case 'cometa':
      case 'centauro':
        return 1e-5 * Math.exp(Math.abs(y - 2000) / 320);
      case 'interstellare': {
        const passaggio = { '1i-oumuamua': 2017.7, '2i-borisov': 2019.9, '3i-atlas': 2025.8 }[c.slug] ?? 2020;
        return 2e-5 * Math.exp(Math.abs(y - passaggio) / 25);
      }
      default:
        return 1e-6 * Math.exp(Math.abs(y - 2000) / 1500);
    }
  }

  affidabilita(ssid: number, t: TimeState, out: Affidabilita): void {
    const c = this.perSsid.get(ssid);
    if (!c) {
      out.livello = 'non-determinabile';
      out.epsModello = out.epsDeltaT = out.epsTotale = Number.NaN;
      return;
    }
    const eps = this.epsModello(c, t.jdTT);
    let epsDT = 0;
    if (t.scalaIngresso === 'UT' && c.categoria !== 'sole') {
      // ε_ΔT = ω·σ(ΔT), ω moto angolare attorno al primario (§ 7.8.1).
      const k = this.conica(c, t.jdTT);
      if (k !== null) {
        statoConica(k, t.jdTT, this.tmp);
        const [x, y, z, vx, vy, vz] = this.tmp as unknown as [number, number, number, number, number, number];
        const r2 = x * x + y * y + z * z;
        const h = Math.hypot(y * vz - z * vy, z * vx - x * vz, x * vy - y * vx);
        epsDT = (h / r2) * t.deltaTSigma;
      }
    }
    out.epsModello = eps;
    out.epsDeltaT = epsDT;
    out.epsTotale = Math.hypot(eps, epsDT);
    out.livello = c.categoria === 'sole' ? 'precisa' : livelloDa(out.epsTotale);
  }

  prefetch(): Promise<void> {
    return Promise.resolve();
  }

  pronto(jdTT: number): boolean {
    return !this.inCaricamento(jdTT);
  }
}
