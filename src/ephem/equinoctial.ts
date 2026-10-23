// Elementi equinoziali con fattore retrogrado I (§ 7.2 di docs/PROGETTO.md), senza allocazioni.
// Broucke, Cefola (1972), On the equinoctial orbit elements, Celestial Mechanics 5, 303,
// doi:10.1007/BF01228432. Stesse formule e stesso ordine delle operazioni di
// scripts/pipeline/common/equinoctial.py. Unità: km, km/s, km³/s², rad.
// Elementi in array [a, h, k, p, q, λ]; stati in array [x, y, z, vx, vy, vz].

import { GIORNO_S } from './constants';
import { DUE_PI, angoloPositivo, riduciAngolo, risolviKeplero } from './kepler';

export type FattoreI = 1 | -1;

/** Array scrivibile di numeri (Float64Array o number[]). */
export interface Scrivibile {
  [indice: number]: number;
  readonly length: number;
}

/** I = +1 per i ≤ 90°, -1 altrimenti (i in radianti). */
export function fattoreRetrogrado(i: number): FattoreI {
  return i <= 0.5 * Math.PI ? 1 : -1;
}

/** Stato [km, km/s] da elementi [a, h, k, p, q, λ]; μ in km³/s². λ può non essere ridotto. */
export function statoDaElementi(el: ArrayLike<number>, mu: number, fattoreI: number, out: Scrivibile): void {
  const a = el[0]!;
  const h = el[1]!;
  const k = el[2]!;
  const p = el[3]!;
  const q = el[4]!;
  const ff = risolviKeplero(el[5]!, h, k);
  const cf = Math.cos(ff);
  const sf = Math.sin(ff);
  const beta = 1 / (1 + Math.sqrt(1 - h * h - k * k));
  const r = a * (1 - k * cf - h * sf);
  const n = Math.sqrt(mu / (a * a * a));
  const x1 = a * ((1 - beta * h * h) * cf + h * k * beta * sf - k);
  const y1 = a * ((1 - beta * k * k) * sf + h * k * beta * cf - h);
  const fatt = (n * a * a) / r;
  const vx1 = fatt * (h * k * beta * cf - (1 - beta * h * h) * sf);
  const vy1 = fatt * ((1 - beta * k * k) * cf - h * k * beta * sf);
  const fi = fattoreI;
  const p2 = p * p;
  const q2 = q * q;
  const s2 = 1 + p2 + q2;
  const fx = (1 - p2 + q2) / s2;
  const fy = (2 * p * q) / s2;
  const fz = (-2 * fi * p) / s2;
  const gx = (2 * fi * p * q) / s2;
  const gy = ((1 + p2 - q2) * fi) / s2;
  const gz = (2 * q) / s2;
  out[0] = x1 * fx + y1 * gx;
  out[1] = x1 * fy + y1 * gy;
  out[2] = x1 * fz + y1 * gz;
  out[3] = vx1 * fx + vy1 * gx;
  out[4] = vx1 * fy + vy1 * gy;
  out[5] = vx1 * fz + vy1 * gz;
}

/**
 * Elementi [a, h, k, p, q, λ] da stato [km, km/s]; λ in [-π, π).
 * Senza fattoreI, I = +1 se la componente z del momento angolare è ≥ 0.
 * Restituisce I, oppure 0 (e out pieno di NaN) se l'orbita non è ellittica.
 */
export function elementiDaStato(stato: ArrayLike<number>, mu: number, out: Scrivibile, fattoreI?: number): FattoreI | 0 {
  const rx = stato[0]!;
  const ry = stato[1]!;
  const rz = stato[2]!;
  const vx = stato[3]!;
  const vy = stato[4]!;
  const vz = stato[5]!;
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const hn = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const wx = hx / hn;
  const wy = hy / hn;
  const wz = hz / hn;
  const fi: FattoreI = fattoreI === undefined ? (wz >= 0 ? 1 : -1) : fattoreI < 0 ? -1 : 1;
  const den = 1 + fi * wz;
  const p = wx / den;
  const q = -wy / den;
  const rn = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const a = 1 / (2 / rn - v2 / mu);
  const ex = (vy * hz - vz * hy) / mu - rx / rn;
  const ey = (vz * hx - vx * hz) / mu - ry / rn;
  const ez = (vx * hy - vy * hx) / mu - rz / rn;
  if (!(a > 0) || !(Math.sqrt(ex * ex + ey * ey + ez * ez) < 1)) {
    for (let j = 0; j < 6; j++) out[j] = Number.NaN;
    return 0;
  }
  const p2 = p * p;
  const q2 = q * q;
  const s2 = 1 + p2 + q2;
  const fx = (1 - p2 + q2) / s2;
  const fy = (2 * p * q) / s2;
  const fz = (-2 * fi * p) / s2;
  const gx = (2 * fi * p * q) / s2;
  const gy = ((1 + p2 - q2) * fi) / s2;
  const gz = (2 * q) / s2;
  const h = ex * gx + ey * gy + ez * gz;
  const k = ex * fx + ey * fy + ez * fz;
  const x1 = rx * fx + ry * fy + rz * fz;
  const y1 = rx * gx + ry * gy + rz * gz;
  const rad = Math.sqrt(1 - h * h - k * k);
  const beta = 1 / (1 + rad);
  const cf = k + ((1 - k * k * beta) * x1 - h * k * beta * y1) / (a * rad);
  const sf = h + ((1 - h * h * beta) * y1 - h * k * beta * x1) / (a * rad);
  const ff = Math.atan2(sf, cf);
  out[0] = a;
  out[1] = h;
  out[2] = k;
  out[3] = p;
  out[4] = q;
  out[5] = riduciAngolo(ff + h * Math.cos(ff) - k * Math.sin(ff));
  return fi;
}

/** Elementi equinoziali da classici (angoli in rad); restituisce I. */
export function daClassici(
  a: number,
  e: number,
  i: number,
  nodo: number,
  argPeri: number,
  anomaliaMedia: number,
  out: Scrivibile,
  fattoreI?: number,
): FattoreI {
  const fi: FattoreI = fattoreI === undefined ? fattoreRetrogrado(i) : fattoreI < 0 ? -1 : 1;
  const varpi = argPeri + fi * nodo;
  const tg = Math.tan(0.5 * i) ** fi;
  out[0] = a;
  out[1] = e * Math.sin(varpi);
  out[2] = e * Math.cos(varpi);
  out[3] = tg * Math.sin(nodo);
  out[4] = tg * Math.cos(nodo);
  out[5] = anomaliaMedia + varpi;
  return fi;
}

/** Elementi classici [a, e, i, Ω, ω, M] da equinoziali; angoli in [0, 2π), i in [0, π]. */
export function aClassici(el: ArrayLike<number>, fattoreI: number, out: Scrivibile): void {
  const h = el[1]!;
  const k = el[2]!;
  const p = el[3]!;
  const q = el[4]!;
  const fi = fattoreI < 0 ? -1 : 1;
  const om = Math.atan2(p, q);
  const varpi = Math.atan2(h, k);
  out[0] = el[0]!;
  out[1] = Math.hypot(h, k);
  out[2] = 2 * Math.atan(Math.hypot(p, q) ** fi);
  out[3] = angoloPositivo(om);
  out[4] = angoloPositivo(varpi - fi * om);
  out[5] = angoloPositivo(el[5]! - varpi);
}

// --- Conica generica (ellisse, parabola, iperbole) per orbitAt e per la scheda ---

/** Elementi di una conica qualsiasi; i campi q..anomaliaVera coincidono con ElementiOrbita. */
export interface ElementiConica {
  q: number; // distanza al pericentro, km
  e: number;
  i: number; // rad, [0, π]
  nodo: number; // rad, [0, 2π); 0 per orbite equatoriali
  argPeri: number; // rad, [0, 2π); 0 per orbite circolari
  anomaliaVera: number; // rad, [0, 2π) per l'ellisse, (-π, π) altrimenti
  a: number; // km; negativo per l'iperbole, Infinity per la parabola
  anomaliaMedia: number; // rad: M in [0, 2π) (ellisse), e·sinh H - H (iperbole), D + D³/3 (parabola, D = tan(ν/2))
  motoMedio: number; // rad/d: √(μ/|a|³) (ellisse e iperbole), √(μ/(2q³)) (parabola); t - T = M/n
  tempoDalPericentro: number; // d: per l'ellisse dall'ultimo passaggio, altrimenti con segno
}

/** Soglie per i casi degeneri: e sotto EPS_E è circolare, sin i sotto EPS_I è equatoriale. */
const EPS_E = 1e-13;
const EPS_I = 1e-13;
/** |e - 1| sotto questa soglia: parabola. */
const EPS_PARABOLA = 1e-10;

/** Conica osculante da stato [km, km/s] e μ [km³/s²]. Restituisce false (out NaN) per moti radiali. */
export function conicaDaStato(stato: ArrayLike<number>, mu: number, out: ElementiConica): boolean {
  const rx = stato[0]!;
  const ry = stato[1]!;
  const rz = stato[2]!;
  const vx = stato[3]!;
  const vy = stato[4]!;
  const vz = stato[5]!;
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const hn = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const rn = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (!(hn > 0) || !(rn > 0) || !(mu > 0)) {
    out.q = out.e = out.i = out.nodo = out.argPeri = out.anomaliaVera = Number.NaN;
    out.a = out.anomaliaMedia = out.motoMedio = out.tempoDalPericentro = Number.NaN;
    return false;
  }
  const ex = (vy * hz - vz * hy) / mu - rx / rn;
  const ey = (vz * hx - vx * hz) / mu - ry / rn;
  const ez = (vx * hy - vy * hx) / mu - rz / rn;
  const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const hxy = Math.sqrt(hx * hx + hy * hy);
  const i = Math.atan2(hxy, hz);
  // Linea dei nodi N e direzione M = ĥ × N nel piano dell'orbita.
  let nx = 1;
  let ny = 0;
  let nodo = 0;
  if (hxy > EPS_I * hn) {
    nx = -hy / hxy;
    ny = hx / hxy;
    nodo = angoloPositivo(Math.atan2(ny, nx));
  }
  const wx = hx / hn;
  const wy = hy / hn;
  const wz = hz / hn;
  const mx = -wz * ny;
  const my = wz * nx;
  const mz = wx * ny - wy * nx;
  const u = Math.atan2(rx * mx + ry * my + rz * mz, rx * nx + ry * ny);
  let argPeri = 0;
  if (e > EPS_E) argPeri = Math.atan2(ex * mx + ey * my + ez * mz, ex * nx + ey * ny);
  let nu = riduciAngolo(u - argPeri);
  const p = (hn * hn) / mu;
  const q = p / (1 + e);
  out.q = q;
  out.e = e;
  out.i = i;
  out.nodo = nodo;
  out.argPeri = angoloPositivo(argPeri);
  if (e < 1 - EPS_PARABOLA) {
    const a = p / (1 - e * e);
    const ea = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu));
    const m = angoloPositivo(ea - e * Math.sin(ea));
    const n = Math.sqrt(mu / (a * a * a)) * GIORNO_S;
    nu = angoloPositivo(nu);
    out.a = a;
    out.anomaliaMedia = m;
    out.motoMedio = n;
    out.tempoDalPericentro = m / n;
  } else if (e > 1 + EPS_PARABOLA) {
    const a = p / (1 - e * e);
    const hh = Math.asinh((Math.sqrt(e * e - 1) * Math.sin(nu)) / (1 + e * Math.cos(nu)));
    const m = e * Math.sinh(hh) - hh;
    const n = Math.sqrt(mu / -(a * a * a)) * GIORNO_S;
    out.a = a;
    out.anomaliaMedia = m;
    out.motoMedio = n;
    out.tempoDalPericentro = m / n;
  } else {
    // Equazione di Barker: t - T = √(2q³/μ)·(D + D³/3), D = tan(ν/2).
    const d = Math.tan(0.5 * nu);
    const m = d + (d * d * d) / 3;
    const n = Math.sqrt(mu / (2 * q * q * q)) * GIORNO_S;
    out.a = Number.POSITIVE_INFINITY;
    out.anomaliaMedia = m;
    out.motoMedio = n;
    out.tempoDalPericentro = m / n;
  }
  out.anomaliaVera = nu;
  return true;
}

/** Posizione [km] sulla conica all'anomalia vera ν, in out[off..off+2]. */
export function puntoSuConica(
  c: Pick<ElementiConica, 'q' | 'e' | 'i' | 'nodo' | 'argPeri'>,
  nu: number,
  out: Scrivibile,
  off = 0,
): void {
  const r = (c.q * (1 + c.e)) / (1 + c.e * Math.cos(nu));
  const u = c.argPeri + nu;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const co = Math.cos(c.nodo);
  const so = Math.sin(c.nodo);
  const ci = Math.cos(c.i);
  const si = Math.sin(c.i);
  out[off] = r * (co * cu - so * su * ci);
  out[off + 1] = r * (so * cu + co * su * ci);
  out[off + 2] = r * (su * si);
}

/** Periodo orbitale in giorni (Infinity se e ≥ 1). */
export function periodo(c: Pick<ElementiConica, 'e' | 'motoMedio'>): number {
  return c.e < 1 ? DUE_PI / c.motoMedio : Number.POSITIVE_INFINITY;
}
