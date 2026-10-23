// Equazioni di Keplero (§ 7.2, § 10.2 di docs/PROGETTO.md), senza allocazioni.
// Forma equinoziale: Broucke, Cefola (1972), Celestial Mechanics 5, 303, doi:10.1007/BF01228432.
// Partenza di Newton: Danby (1987), Celestial Mechanics 40, 303 (F0 = λ + 0,85·e·segno).
// Stesso algoritmo di scripts/pipeline/common/equinoctial.py (risolvi_keplero).

export const DUE_PI = 2 * Math.PI;

/** Tolleranza di Newton sulla correzione |ΔF| (rad), § 7.2. */
export const TOLLERANZA_KEPLERO = 1e-15;

/** Oltre questo numero di iterazioni la correzione è sotto il rumore di arrotondamento. */
export const MAX_ITERAZIONI_KEPLERO = 30;

/** Riduzione a [-π, π): x - 2π·floor((x + π)/2π). */
export function riduciAngolo(x: number): number {
  return x - DUE_PI * Math.floor((x + Math.PI) / DUE_PI);
}

/** Riduzione a [0, 2π). */
export function angoloPositivo(x: number): number {
  const r = x - DUE_PI * Math.floor(x / DUE_PI);
  return r >= DUE_PI ? 0 : r;
}

/**
 * Longitudine eccentrica F da F - k·sin F + h·cos F = λ (Newton).
 * λ è ridotto a [-π, π); arresto a |ΔF| ≤ 1e-15 rad o dopo 30 iterazioni. Richiede h² + k² < 1.
 */
export function risolviKeplero(lam: number, h: number, k: number): number {
  const lr = riduciAngolo(lam);
  const e = Math.sqrt(h * h + k * k);
  let f = lr + 0.85 * e * Math.sign(k * Math.sin(lr) - h * Math.cos(lr));
  for (let it = 0; it < MAX_ITERAZIONI_KEPLERO; it++) {
    const s = Math.sin(f);
    const c = Math.cos(f);
    const df = (f - k * s + h * c - lr) / (1 - k * c - h * s);
    f -= df;
    if (!(Math.abs(df) > TOLLERANZA_KEPLERO)) break;
  }
  return f;
}

/** Anomalia eccentrica E da M = E - e·sin E (0 ≤ e < 1); M ridotta a [-π, π), E nello stesso giro. */
export function risolviKeplerEllittico(m: number, e: number): number {
  const mr = riduciAngolo(m);
  let ea = mr + 0.85 * e * Math.sign(Math.sin(mr));
  for (let it = 0; it < MAX_ITERAZIONI_KEPLERO; it++) {
    const df = (ea - e * Math.sin(ea) - mr) / (1 - e * Math.cos(ea));
    ea -= df;
    if (!(Math.abs(df) > TOLLERANZA_KEPLERO)) break;
  }
  return ea + (m - mr);
}

/**
 * Anomalia iperbolica H da N = e·sinh H - H (e > 1), Newton con partenza
 * H0 = segno(N)·ln(2|N|/e + 1,8) (Danby 1987); arresto a |ΔH| ≤ 1e-15·max(1, |H|).
 */
export function risolviKeplerIperbolico(n: number, e: number): number {
  if (n === 0) return 0;
  let hh = Math.sign(n) * Math.log((2 * Math.abs(n)) / e + 1.8);
  for (let it = 0; it < 100; it++) {
    const dh = (e * Math.sinh(hh) - hh - n) / (e * Math.cosh(hh) - 1);
    hh -= dh;
    if (!(Math.abs(dh) > TOLLERANZA_KEPLERO * Math.max(1, Math.abs(hh)))) break;
  }
  return hh;
}

/** Anomalia vera da anomalia eccentrica (ellisse). */
export function veraDaEccentrica(ea: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(0.5 * ea), Math.sqrt(1 - e) * Math.cos(0.5 * ea));
}

/** Anomalia vera da anomalia iperbolica (e > 1). */
export function veraDaIperbolica(hh: number, e: number): number {
  return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(0.5 * hh));
}

/**
 * Anomalia iperbolica (≥ 0) alla distanza r su un'iperbole di semiasse a < 0 ed eccentricità e:
 * r = |a|·(e·cosh H - 1). Serve a limitare gli archi delle orbite iperboliche (§ 10.2).
 */
export function iperbolicaDaRaggio(r: number, a: number, e: number): number {
  const c = (r / Math.abs(a) + 1) / e;
  return c <= 1 ? 0 : Math.acosh(c);
}
