// Lettore di time.json (§ 8.9 di docs/PROGETTO.md): modello di ΔT e σ(ΔT) (§ 6.4, § 6.5) e tabella
// dell'equazione delle origini (§ 7.7). Verifica struttura, monotonia dei nodi e copertura; ErroreFormato
// se il file non è conforme. Prodotto da scripts/pipeline/time_model.py.

import { T0, T_END } from '../ephem/constants';
import type { DatiDeltaT } from '../time/deltaT';
import type { DatiEo } from '../time/earthRotation';
import { ErroreFormato } from './binHeader';

/** Percorso relativo in data/v1/. */
export const PERCORSO_TIME = 'time.json';

export interface DatiTempo {
  readonly deltaT: DatiDeltaT;
  readonly eo: DatiEo;
  readonly fonti: {
    /** Tabella della spline ("Table-S15.2020"), copia usata e SHA-256 del file congelato. */
    readonly s15: string;
    readonly s15Copia: string | null;
    readonly s15Sha256: string;
    /** Serie IERS ("EOP 20 C04") e data di estrazione (AAAA-MM-GG). */
    readonly iers: string;
    readonly estrazioneIers: string;
  };
}

type Oggetto = Record<string, unknown>;

function oggetto(x: unknown, nome: string): Oggetto {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new ErroreFormato(`time.json: ${nome} non è un oggetto`);
  return x as Oggetto;
}

function numero(x: unknown, nome: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new ErroreFormato(`time.json: ${nome} non è un numero finito`);
  return x;
}

function testo(x: unknown, nome: string): string {
  if (typeof x !== 'string') throw new ErroreFormato(`time.json: ${nome} non è una stringa`);
  return x;
}

function numeri(x: unknown, nome: string, lunghezza?: number): Float64Array {
  if (!Array.isArray(x)) throw new ErroreFormato(`time.json: ${nome} non è un elenco`);
  if (lunghezza !== undefined && x.length !== lunghezza) throw new ErroreFormato(`time.json: ${nome} ha lunghezza ${x.length}`);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = numero(x[i], `${nome}[${i}]`);
  return out;
}

function crescente(a: Float64Array, nome: string): void {
  for (let i = 1; i < a.length; i++) if (!(a[i]! > a[i - 1]!)) throw new ErroreFormato(`time.json: ${nome} non crescente`);
}

function leggiS15(x: unknown): { nodi: Float64Array; coeff: Float64Array; fonte: string; copia: string | null; sha: string } {
  const s = oggetto(x, 'deltaT.s15');
  if (!Array.isArray(s.nodi) || !Array.isArray(s.coeff) || s.nodi.length < 1 || s.nodi.length !== s.coeff.length) {
    throw new ErroreFormato('time.json: nodi e coefficienti S15 non conformi');
  }
  const n = s.nodi.length;
  const nodi = new Float64Array(2 * n);
  const coeff = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) {
    nodi.set(numeri(s.nodi[i], `deltaT.s15.nodi[${i}]`, 2), 2 * i);
    coeff.set(numeri(s.coeff[i], `deltaT.s15.coeff[${i}]`, 4), 4 * i);
    if (!(nodi[2 * i + 1]! > nodi[2 * i]!)) throw new ErroreFormato('time.json: intervallo S15 vuoto');
    if (i > 0 && nodi[2 * i] !== nodi[2 * i - 1]) throw new ErroreFormato('time.json: intervalli S15 non contigui');
  }
  const copia = s.copia === undefined || s.copia === null ? null : testo(s.copia, 'deltaT.s15.copia');
  return { nodi, coeff, fonte: testo(s.fonte, 'deltaT.s15.fonte'), copia, sha: testo(s.sha256, 'deltaT.s15.sha256') };
}

/** Dati del tempo da time.json già analizzato con JSON.parse. */
export function leggiTime(json: unknown): DatiTempo {
  const r = oggetto(json, 'radice');
  if (r.formato !== 1) throw new ErroreFormato('time.json: formato diverso da 1');
  const dt = oggetto(r.deltaT, 'deltaT');
  const s15 = leggiS15(dt.s15);
  const pre = oggetto(dt.pre720, 'deltaT.pre720');
  const iers = oggetto(dt.iers, 'deltaT.iers');
  const anni = numeri(iers.anni, 'deltaT.iers.anni');
  const valori = numeri(iers.valori, 'deltaT.iers.valori', anni.length);
  if (anni.length < 2) throw new ErroreFormato('time.json: serie IERS troppo corta');
  crescente(anni, 'deltaT.iers.anni');
  const raccordo = dt.raccordo === undefined ? new Float64Array([2019, 2020]) : numeri(dt.raccordo, 'deltaT.raccordo', 2);
  const yObs = numero(dt.yObs, 'deltaT.yObs');
  const deltaTObs = numero(dt.deltaTObs, 'deltaT.deltaTObs');
  if (yObs !== anni[anni.length - 1] || deltaTObs !== valori[valori.length - 1]) {
    throw new ErroreFormato("time.json: yObs e deltaTObs diversi dall'ultimo valore IERS");
  }
  // ordine degli intervalli del § 6.4: inizio S15 < inizio raccordo < fine raccordo ≤ y_obs; IERS dal raccordo
  if (!(s15.nodi[0]! < raccordo[0]! && raccordo[0]! < raccordo[1]! && raccordo[1]! <= yObs && anni[0]! <= raccordo[0]!)) {
    throw new ErroreFormato('time.json: intervalli di ΔT non ordinati');
  }
  const sig = oggetto(r.sigma, 'sigma');
  const storico = oggetto(sig.storico, 'sigma.storico');
  const storicoAnni = numeri(storico.anni, 'sigma.storico.anni');
  const storicoValori = numeri(storico.valori, 'sigma.storico.valori', storicoAnni.length);
  crescente(storicoAnni, 'sigma.storico.anni');
  const raccordoS15 = numeri(sig.raccordoS15, 'sigma.raccordoS15', 2);
  const deltaT: DatiDeltaT = {
    s15Nodi: s15.nodi,
    s15Coeff: s15.coeff,
    pre720A: numero(pre.a, 'deltaT.pre720.a'),
    pre720B: numero(pre.b, 'deltaT.pre720.b'),
    pre720Delta: numero(pre.delta, 'deltaT.pre720.delta'),
    raccordoInizio: raccordo[0]!,
    raccordoFine: raccordo[1]!,
    iersAnni: anni,
    iersValori: valori,
    yObs,
    deltaTObs,
    cFuturo: numero(dt.cFuturo, 'deltaT.cFuturo'),
    sigmaM: numero(sig.m, 'sigma.m'),
    sigmaQ: numero(sig.Q, 'sigma.Q'),
    sigmaMAnni: numero(sig.M, 'sigma.M'),
    sigmaAnnoPassato: numero(sig.annoPassato, 'sigma.annoPassato'),
    sigmaStoricoAnni: storicoAnni,
    sigmaStoricoValori: storicoValori,
    sigmaS15: numero(sig.s15, 'sigma.s15'),
    sigmaIers: numero(sig.iers, 'sigma.iers'),
    sigmaS15Iniziale: numero(sig.s15Iniziale, 'sigma.s15Iniziale'),
    sigmaS15RaccordoInizio: raccordoS15[0]!,
    sigmaS15RaccordoFine: raccordoS15[1]!,
    lodRms: numero(sig.lodRms, 'sigma.lodRms'),
  };
  if (
    !(
      deltaT.sigmaM >= 0 &&
      deltaT.sigmaQ > 0 &&
      deltaT.sigmaMAnni > 0 &&
      deltaT.sigmaS15 > 0 &&
      deltaT.sigmaIers > 0 &&
      deltaT.sigmaS15Iniziale > 0 &&
      deltaT.lodRms >= 0 &&
      storicoAnni.length >= 1 &&
      storicoValori.every((x) => x > 0) &&
      storicoAnni[storicoAnni.length - 1]! < raccordo[0]! &&
      raccordoS15[0]! < raccordoS15[1]! &&
      raccordoS15[1]! <= raccordo[0]!
    )
  ) {
    throw new ErroreFormato('time.json: parametri di σ non validi');
  }
  const e = oggetto(r.eo, 'eo');
  const t0 = numero(e.t0, 'eo.t0');
  const passo = numero(e.passo, 'eo.passo');
  const valoriEo = numeri(e.valori, 'eo.valori');
  const derivate = numeri(e.derivate, 'eo.derivate', valoriEo.length);
  if (!(passo > 0 && valoriEo.length >= 2 && t0 <= T0 && t0 + passo * (valoriEo.length - 1) >= T_END)) {
    throw new ErroreFormato('time.json: la tabella EO non copre [T0, T_END]');
  }
  return {
    deltaT,
    eo: { t0, passo, valori: valoriEo, derivate },
    fonti: {
      s15: s15.fonte,
      s15Copia: s15.copia,
      s15Sha256: s15.sha,
      iers: testo(iers.fonte, 'deltaT.iers.fonte'),
      estrazioneIers: testo(iers.estrazione, 'deltaT.iers.estrazione'),
    },
  };
}

/** Dati del tempo dal contenuto del file (UTF-8). */
export function leggiTimeDaBuffer(buf: ArrayBuffer): DatiTempo {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf));
  } catch {
    throw new ErroreFormato('time.json: JSON non valido');
  }
  return leggiTime(json);
}
