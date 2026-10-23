// Orbite ancorate al corpo (§ 10.2 di docs/PROGETTO.md). La conica di orbitAt, relativa al primario,
// è campionata in coordinate relative al corpo: il vertice del corpo è (0, 0, 0) e la posizione
// dell'oggetto è r_corpo - r_origine in Float64. Campionamento: 256 punti uniformi nel parametro
// (anomalia eccentrica E, iperbolica H, di Barker D per la parabola) più un raffinamento geometrico
// attorno al corpo, ±δ·2^k con δ = 1e-9 rad, finché δ·2^k < passo uniforme. Nessuna allocazione.

import type { ElementiOrbita } from '../ephem/types';
import { DUE_PI, iperbolicaDaRaggio, risolviKeplerIperbolico } from '../ephem/kepler';
import { DELTA_RAFFINAMENTO, PUNTI_ORBITA } from './costanti';

/** |e - 1| sotto questa soglia: parabola (come in src/ephem/equinoctial.ts). */
const EPS_PARABOLA = 1e-10;
/** Eccentricità oltre la quale si aggiungono punti attorno al pericentro (estensione del § 10.2). */
const E_RAFFINAMENTO_PERICENTRO = 0.9;
const LIVELLI_PERICENTRO = 8;

/** Numero di raffinamenti per lato: k = 0..K-1 con δ·2^k < passo. */
export function numeroRaffinamenti(passo: number, delta = DELTA_RAFFINAMENTO): number {
  let k = 0;
  while (delta * 2 ** k < passo) k++;
  return k;
}

/** Capacità in vertici di un'orbita campionata. */
export const CAPACITA_ORBITA = PUNTI_ORBITA + 2 * 48 + 4 * LIVELLI_PERICENTRO + 8;

export interface OrbitaCampionata {
  /** Vertici relativi all'ancora (km), Float32, 3 per vertice. */
  readonly vertici: Float32Array;
  /** Parametro relativo al corpo (rad o adimensionale per la parabola), per il tratteggio. */
  readonly param: Float32Array;
  /** Anomalia vera relativa al corpo in (-π, π], per l'arco d'incertezza. */
  readonly dnu: Float32Array;
  n: number;
  chiusa: boolean;
  /** Indice del vertice dell'ancora, (0, 0, 0): 0 per le ellissi, interno per gli archi aperti. */
  indiceAncora: number;
  /** Posizione dell'ancora relativa al primario (km), Float64. */
  readonly ancora: Float64Array;
  /** Semiasse (|a|; q per la parabola), km. */
  semiasse: number;
  e: number;
  /** true se l'ancora è il corpo; false se è il pericentro (posizione del corpo non disponibile). */
  conCorpo: boolean;
  valida: boolean;
}

export function creaOrbitaCampionata(capacita = CAPACITA_ORBITA): OrbitaCampionata {
  return {
    vertici: new Float32Array(3 * capacita),
    param: new Float32Array(capacita),
    dnu: new Float32Array(capacita),
    n: 0,
    chiusa: false,
    indiceAncora: 0,
    ancora: new Float64Array(3),
    semiasse: 0,
    e: 0,
    conCorpo: false,
    valida: false,
  };
}

// Memoria di lavoro.
const offs = new Float64Array(CAPACITA_ORBITA);
const base = new Float64Array(6);

function baseOrbita(el: ElementiOrbita): void {
  const co = Math.cos(el.nodo);
  const so = Math.sin(el.nodo);
  const cw = Math.cos(el.argPeri);
  const sw = Math.sin(el.argPeri);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);
  // P verso il pericentro, Q a 90° nel verso del moto.
  base[0] = co * cw - so * sw * ci;
  base[1] = so * cw + co * sw * ci;
  base[2] = sw * si;
  base[3] = -co * sw - so * cw * ci;
  base[4] = -so * sw + co * cw * ci;
  base[5] = cw * si;
}

function riduci(x: number): number {
  return x - DUE_PI * Math.floor((x + Math.PI) / DUE_PI);
}

/** Inserisce i raffinamenti ±δ·2^k e restituisce il numero di offset. Offset ordinati. */
function offsetEllisse(e: number, eCorpo: number): number {
  const h = DUE_PI / PUNTI_ORBITA;
  const k = numeroRaffinamenti(h);
  let n = 0;
  offs[n++] = 0;
  for (let j = 0; j < k; j++) offs[n++] = DELTA_RAFFINAMENTO * 2 ** j;
  for (let j = 1; j < PUNTI_ORBITA; j++) offs[n++] = j * h;
  for (let j = k - 1; j >= 0; j--) offs[n++] = DUE_PI - DELTA_RAFFINAMENTO * 2 ** j;
  offs[n++] = DUE_PI;
  if (e > E_RAFFINAMENTO_PERICENTRO) {
    // Punti attorno al pericentro (E = 0), dove i 256 punti uniformi in E sono radi nello spazio.
    let u0 = riduci(-eCorpo);
    if (u0 < 0) u0 += DUE_PI;
    for (let j = 1; j <= LIVELLI_PERICENTRO; j++) {
      const d = h / 2 ** j;
      const a = u0 - d;
      const b = u0 + d;
      if (a > 0 && a < DUE_PI) offs[n++] = a;
      if (b > 0 && b < DUE_PI) offs[n++] = b;
    }
    if (u0 > 0 && u0 < DUE_PI) offs[n++] = u0;
    n = ordinaSenzaDoppi(n);
  }
  return n;
}

/** Ordinamento per inserzione (sequenza quasi ordinata) ed eliminazione dei doppioni. */
function ordinaSenzaDoppi(n: number): number {
  for (let i = 1; i < n; i++) {
    const v = offs[i]!;
    let j = i - 1;
    while (j >= 0 && offs[j]! > v) {
      offs[j + 1] = offs[j]!;
      j--;
    }
    offs[j + 1] = v;
  }
  let m = 1;
  for (let i = 1; i < n; i++) if (offs[i]! - offs[m - 1]! > 1e-15) offs[m++] = offs[i]!;
  return m;
}

function scrivi(out: OrbitaCampionata, i: number, x: number, y: number, z: number, p: number, dnu: number): void {
  out.vertici[3 * i] = x;
  out.vertici[3 * i + 1] = y;
  out.vertici[3 * i + 2] = z;
  out.param[i] = p;
  out.dnu[i] = dnu;
}

/**
 * Campiona la conica di el. Con conCorpo il vertice del corpo (anomalia vera el.anomaliaVera) è
 * l'origine; senza, l'ancora è il pericentro. Restituisce false per elementi non validi.
 */
export function campionaOrbita(el: ElementiOrbita, conCorpo: boolean, out: OrbitaCampionata): boolean {
  out.valida = false;
  out.n = 0;
  const q = el.q;
  const e = el.e;
  if (!(q > 0) || !(e >= 0) || !Number.isFinite(q) || !Number.isFinite(el.i)) return false;
  baseOrbita(el);
  const px = base[0]!;
  const py = base[1]!;
  const pz = base[2]!;
  const qx = base[3]!;
  const qy = base[4]!;
  const qz = base[5]!;
  out.conCorpo = conCorpo;
  out.e = e;
  const nu = conCorpo ? el.anomaliaVera : 0;
  let n: number;
  if (e < 1 - EPS_PARABOLA) {
    const a = q / (1 - e);
    const b = a * Math.sqrt((1 - e) * (1 + e));
    const eb = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(0.5 * nu), Math.sqrt(1 + e) * Math.cos(0.5 * nu));
    const cb = Math.cos(eb);
    const sb = Math.sin(eb);
    const xa = a * (cb - e);
    const ya = b * sb;
    out.ancora[0] = xa * px + ya * qx;
    out.ancora[1] = xa * py + ya * qy;
    out.ancora[2] = xa * pz + ya * qz;
    out.semiasse = a;
    const k = Math.sqrt((1 + e) / (1 - e));
    const nuB = riduci(nu);
    n = offsetEllisse(e, eb);
    for (let j = 0; j < n; j++) {
      const u = offs[j]!;
      // Differenze con le formule di prostaferesi: precisione relativa piena vicino al corpo.
      // Il vertice di chiusura (u = 2π) coincide esattamente con il corpo.
      const s = u === DUE_PI ? 0 : Math.sin(0.5 * u);
      const m = eb + 0.5 * u;
      const dx = -2 * a * Math.sin(m) * s;
      const dy = 2 * b * Math.cos(m) * s;
      const ee = eb + u;
      const nuJ = 2 * Math.atan(k * Math.tan(0.5 * riduci(ee)));
      const p = u > Math.PI ? u - DUE_PI : u;
      scrivi(out, j, dx * px + dy * qx, dx * py + dy * qy, dx * pz + dy * qz, p, riduci(nuJ - nuB));
    }
    out.chiusa = true;
  } else if (e > 1 + EPS_PARABOLA) {
    const a = q / (1 - e); // negativo
    const aa = -a;
    const b = aa * Math.sqrt((e - 1) * (e + 1));
    const kk = Math.sqrt((e - 1) / (e + 1));
    const nuMax = Math.acos(-1 / e);
    const nuC = Math.max(-nuMax + 1e-9, Math.min(nuMax - 1e-9, riduci(nu)));
    const hb = 2 * Math.atanh(kk * Math.tan(0.5 * nuC));
    const rNow = aa * (e * Math.cosh(hb) - 1);
    const hLim = iperbolicaDaRaggio(3 * rNow, a, e);
    const mB = e * Math.sinh(hb) - hb;
    const dM = Math.max(0, e * Math.sinh(hLim) - hLim - mB);
    const h0 = risolviKeplerIperbolico(mB - dM, e);
    const h1 = risolviKeplerIperbolico(mB + dM, e);
    out.ancora[0] = aa * (e - Math.cosh(hb)) * px + b * Math.sinh(hb) * qx;
    out.ancora[1] = aa * (e - Math.cosh(hb)) * py + b * Math.sinh(hb) * qy;
    out.ancora[2] = aa * (e - Math.cosh(hb)) * pz + b * Math.sinh(hb) * qz;
    out.semiasse = aa;
    n = offsetAperti(h0 - hb, h1 - hb);
    const kInv = 1 / kk;
    for (let j = 0; j < n; j++) {
      const u = offs[j]!;
      const s = Math.sinh(0.5 * u);
      const m = hb + 0.5 * u;
      const dx = -2 * aa * Math.sinh(m) * s;
      const dy = 2 * b * Math.cosh(m) * s;
      const nuJ = 2 * Math.atan(kInv * Math.tanh(0.5 * (hb + u)));
      scrivi(out, j, dx * px + dy * qx, dx * py + dy * qy, dx * pz + dy * qz, u, nuJ - nuC);
    }
    out.chiusa = false;
  } else {
    // Parabola: x = q(1 - D²), y = 2qD, r = q(1 + D²), t - T ∝ D + D³/3 (Barker).
    const db = Math.tan(0.5 * Math.max(-Math.PI + 1e-9, Math.min(Math.PI - 1e-9, riduci(nu))));
    const dLim = Math.sqrt(3 * (1 + db * db) - 1);
    const mB = db + (db * db * db) / 3;
    const dM = Math.max(0, dLim + (dLim * dLim * dLim) / 3 - mB);
    const d0 = barkerInversa(mB - dM);
    const d1 = barkerInversa(mB + dM);
    const xa = q * (1 - db * db);
    const ya = 2 * q * db;
    out.ancora[0] = xa * px + ya * qx;
    out.ancora[1] = xa * py + ya * qy;
    out.ancora[2] = xa * pz + ya * qz;
    out.semiasse = q;
    n = offsetAperti(d0 - db, d1 - db);
    const nuB = 2 * Math.atan(db);
    for (let j = 0; j < n; j++) {
      const u = offs[j]!;
      const dx = -q * u * (2 * db + u);
      const dy = 2 * q * u;
      const nuJ = 2 * Math.atan(db + u);
      scrivi(out, j, dx * px + dy * qx, dx * py + dy * qy, dx * pz + dy * qz, u, nuJ - nuB);
    }
    out.chiusa = false;
  }
  out.n = n;
  out.indiceAncora = 0;
  for (let j = 0; j < n; j++) {
    if (offs[j] === 0) {
      out.indiceAncora = j;
      break;
    }
  }
  out.valida = n > 1;
  return out.valida;
}

/** Offset ordinati per un arco aperto [u0, u1] (u0 ≤ 0 ≤ u1) con raffinamento attorno a 0. */
function offsetAperti(u0: number, u1: number): number {
  const h = (u1 - u0) / PUNTI_ORBITA;
  let n = 0;
  if (!(h > 0)) {
    offs[n++] = 0;
    return n;
  }
  const k = numeroRaffinamenti(h);
  // Punti uniformi a sinistra di 0 (esclusi quelli entro il raffinamento), raffinamento, destra.
  const jZero = Math.floor(-u0 / h);
  for (let j = 0; j <= jZero; j++) {
    const u = u0 + j * h;
    if (u < -DELTA_RAFFINAMENTO * 2 ** (k - 1) * 1.000001) offs[n++] = u;
  }
  for (let j = k - 1; j >= 0; j--) offs[n++] = -DELTA_RAFFINAMENTO * 2 ** j;
  offs[n++] = 0;
  for (let j = 0; j < k; j++) offs[n++] = DELTA_RAFFINAMENTO * 2 ** j;
  for (let j = jZero + 1; j <= PUNTI_ORBITA; j++) {
    const u = u0 + j * h;
    if (u > DELTA_RAFFINAMENTO * 2 ** (k - 1) * 1.000001) offs[n++] = u;
  }
  return n;
}

/** D da M = D + D³/3 (soluzione in forma chiusa dell'equazione di Barker). */
function barkerInversa(m: number): number {
  const w = 1.5 * m;
  const y = Math.cbrt(w + Math.sqrt(w * w + 1));
  return y - 1 / y;
}

/** Distanza minima (px) tra un punto e una polilinea di punti schermo; per i test e la selezione. */
export function distanzaPolilinea(px: number, py: number, xy: ArrayLike<number>, n: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < n; i++) {
    const ax = xy[2 * i]!;
    const ay = xy[2 * i + 1]!;
    const bx = xy[2 * i + 2]!;
    const by = xy[2 * i + 3]!;
    const vx = bx - ax;
    const vy = by - ay;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = ax + t * vx - px;
    const dy = ay + t * vy - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}
