// Dati della scheda del corpo (§ 11.7, § 11.8): distanze, velocità, elementi alla data,
// sorgente e affidabilità, calcolati dal servizio delle effemeridi. Senza DOM.

import type { CorpoCatalogo, Fisica, FonteIntervallo } from '../data/catalogTypes';
import { C_KM_S, GIORNO_S, GM_BARICENTRI, GM_LUNA, GM_SOLE, GM_TERRA, MU_ELIO_KM3_S2, MU_PICCOLI_CORPI_KM3_S2 } from '../ephem/constants';
import { conicaDaStato } from '../ephem/equinoctial';
import type { ElementiConica } from '../ephem/equinoctial';
import { risolviKeplerIperbolico } from '../ephem/kepler';
import { epsDeltaT, livelloDaErrore } from '../ephem/reliability';
import type { Affidabilita, ElementiOrbita, EphemerisService, FormaOrbita, Livello, StatoEffemeride } from '../ephem/types';
import { calendarToJd } from '../time/calendar';
import { rotazioneIndeterminata as rotazioneIndeterminataPerSigma } from '../time/earthRotation';
import type { MakeTimeState, TimeState } from '../time/types';
import type { BandaAffidabilita } from './regolo';
import { T } from './testi';
import type { RigaTestuale } from './vistaTestuale';

export type RiferimentoElementi = 'eliocentrici' | 'baricentrici' | 'planetocentrici-F' | 'planetocentrici';

/** Incertezze stimate degli elementi (§ 11.13): a e q in km, angoli in rad, P e T in giorni. */
export interface IncertezzeElementi {
  a: number;
  q: number;
  e: number;
  i: number;
  nodo: number;
  argPeri: number;
  M: number;
  P: number;
  T: number;
}

export interface ElementiScheda {
  riferimento: RiferimentoElementi;
  /** Corpo attorno a cui si misurano gli elementi (Sole, pianeta o pianeta nano). */
  primario: CorpoCatalogo | null;
  /** Elementi rispetto al baricentro del sistema del primario (satelliti circumbinari di Plutone). */
  centroSistema: boolean;
  /**
   * Punto descritto dagli elementi dei pianeti (serie di DE441): baricentro Terra-Luna per la Terra, baricentro del
   * sistema per i pianeti con satelliti; null se gli elementi sono del corpo stesso.
   */
  baricentro: 'terra-luna' | 'sistema' | null;
  a: number; // km; negativo per l'iperbole
  q: number; // km
  e: number;
  i: number; // rad
  nodo: number; // rad
  argPeri: number; // rad
  /** Anomalia media (rad); per l'iperbole e·sinh H - H. */
  M: number;
  /** Periodo in giorni; Infinity se e ≥ 1. */
  P: number;
  /** Passaggio al pericentro, JD TT: per l'ellisse il più vicino all'istante (precedente o successivo). */
  T: number;
  /** Anomalia vera all'istante (rad), per l'errore della velocità lungo l'orbita. */
  anomaliaVera: number;
  /** Velocità all'infinito per e > 1, km/s. */
  vInf: number | null;
  forma: FormaOrbita;
  /** Incertezze da cui derivano le cifre mostrate. */
  incertezza: IncertezzeElementi;
}

export interface DatiScheda {
  corpo: CorpoCatalogo;
  stato: StatoEffemeride;
  distanzaSoleKm: number | null;
  distanzaTerraKm: number | null;
  /** Tempo luce dalla Terra, s (solo informativo, I6). */
  tempoLuceS: number | null;
  velocitaKmS: number | null;
  /** Errore stimato della velocità (km/s), per le cifre mostrate (§ 11.13). */
  erroreVelocitaKmS: number | null;
  /** Corpo rispetto a cui è misurata la velocità; null = eliocentrica. */
  velocitaRispetto: CorpoCatalogo | null;
  /** Velocità rispetto al baricentro del sistema di velocitaRispetto (satelliti circumbinari). */
  rispettoSistema: boolean;
  elementi: ElementiScheda | null;
  affidabilita: Affidabilita;
  /** Sorgente delle effemeridi alla data, in parole. */
  sorgente: string;
  /** Rotazione terrestre indeterminata in longitudine con l'istante in TT (§ 7.7). */
  rotazioneIndeterminata: boolean;
  /** Errore stimato della posizione eliocentrica in km, per le cifre della distanza dal Sole. */
  erroreKm: number | null;
  /** Errore stimato della distanza dalla Terra in km. */
  erroreTerraKm: number | null;
}

export interface ErroriPosizione {
  /** Errore della posizione eliocentrica, km (0 per il Sole). */
  erroreKm: number | null;
  /** Errore della distanza dalla Terra, km (null per la Terra). */
  erroreTerraKm: number | null;
}

/** Livello di affidabilità a un istante (JD UT) della panoramica. */
interface PuntoBanda {
  jd: number;
  livello: Livello;
}

/** Precisione (giorni) con cui si cerca il passaggio tra due livelli delle fasce del regolo (§ 11.4.3). */
const PRECISIONE_PASSAGGIO_GIORNI = 1;

/** μ dei piccoli corpi con elementi baricentrici: Sole più tutti i sistemi planetari (§ 7.6.5). */
const MU_BARICENTRICO = GM_SOLE + Object.values(GM_BARICENTRI).reduce((a, b) => a + b, 0);

/**
 * Incertezze degli elementi interpolati dalle serie (pianeti e piccoli corpi): massimi del confronto con gli
 * elementi osculanti di Horizons con margine (docs/METODI.md, elementi della scheda).
 */
const INCERTEZZE_SERIE: Readonly<Record<'pianeta' | 'piccolo-corpo', IncertezzeBase>> = {
  pianeta: { relA: 1e-4, e: 1e-4, i: 2e-5 },
  'piccolo-corpo': { relA: 5e-4, e: 2e-4, i: 1e-4 },
};

/** Inizio della finestra 1600-2121 e anno astronomico −2000: confini delle tolleranze dei segmenti (docs/METODI.md § 9.4). */
const JD_1600 = calendarToJd({ anno: 1600, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'gregoriano' });
const JD_MENO_2000 = calendarToJd({ anno: -2000, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'giuliano' });

/**
 * Errore della velocità eliocentrica interpolata dei piccoli corpi (km/s): massimo misurato contro Horizons nella finestra
 * 1600-2121, 0,53 m/s (12 corpi, 7 epoche; docs/METODI.md), con margine. È comune ai corpi lontani alla stessa epoca e
 * pesa sugli elementi delle traiettorie quasi radiali (velocità trasversale di pochi m/s).
 */
export const ERRORE_VELOCITA_PICCOLI_KM_S = 6e-4;

/**
 * Tolleranza di rappresentazione dei segmenti dei piccoli corpi (km) a distanza r (km), con ε_modello (rad): nella finestra
 * max(500 km, 1e-7·r); dal −2000 al 1600 max(1e-3·r, 0,05·ε·r); prima max(1e-2·r, 0,05·ε·r) (docs/METODI.md § 9.4).
 */
export function tolleranzaPiccoliCorpi(jdTT: number, r: number, eps: number): number {
  if (jdTT >= JD_1600) return Math.max(500, 1e-7 * r);
  const rel = jdTT >= JD_MENO_2000 ? 1e-3 : 1e-2;
  return Math.max(rel, 0.05 * (Number.isFinite(eps) ? eps : 0)) * r;
}

/** Incertezze degli elementi dovute agli errori dello stato (§ 11.13). */
export type IncertezzeStato = Pick<IncertezzeElementi, 'a' | 'q' | 'e' | 'i' | 'nodo' | 'argPeri' | 'T'>;

function scartoAngolo(x: number): number {
  return Math.abs(((x + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
}

const conicaPiu: ElementiConica = { q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0, a: 0, anomaliaMedia: 0, motoMedio: 0, tempoDalPericentro: 0 };
const conicaMeno: ElementiConica = { ...conicaPiu };
const statoPerturbato = new Float64Array(6);

/** Tempo dal passaggio al pericentro più vicino (d), come in CalcolatoreScheda. */
function dalPericentroVicino(c: ElementiConica): number {
  return c.e < 1 && c.anomaliaMedia > Math.PI ? (c.anomaliaMedia - 2 * Math.PI) / c.motoMedio : c.tempoDalPericentro;
}

/**
 * Incertezze di a, q, e, i, Ω, ω e T dallo stato (km, km/s) con errore σr (km) su ogni componente della posizione e σv
 * (km/s) su ogni componente della velocità: differenze simmetriche degli elementi, sommate in quadratura. Vale anche per le
 * traiettorie quasi radiali, dove e, i, Ω, ω e T dipendono dalla piccola velocità trasversale. a da 1/a = 2/r - v²/μ.
 */
export function incertezzeDaStatoPerturbato(stato: ArrayLike<number>, mu: number, sr: number, sv: number): IncertezzeStato {
  const somma = { a: 0, q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, T: 0 };
  const inverso = (s: ArrayLike<number>) => 2 / Math.hypot(s[0]!, s[1]!, s[2]!) - (s[3]! ** 2 + s[4]! ** 2 + s[5]! ** 2) / mu;
  const a0 = 1 / inverso(stato);
  for (let k = 0; k < 6; k++) {
    const d = k < 3 ? sr : sv;
    for (let j = 0; j < 6; j++) statoPerturbato[j] = stato[j]!;
    statoPerturbato[k] = stato[k]! + d;
    const okPiu = conicaDaStato(statoPerturbato, mu, conicaPiu);
    const invPiu = inverso(statoPerturbato);
    statoPerturbato[k] = stato[k]! - d;
    const okMeno = conicaDaStato(statoPerturbato, mu, conicaMeno);
    const invMeno = inverso(statoPerturbato);
    if (!okPiu || !okMeno) return { a: Infinity, q: Infinity, e: Infinity, i: Infinity, nodo: Infinity, argPeri: Infinity, T: Infinity };
    const p = conicaPiu;
    const m = conicaMeno;
    let dT = (dalPericentroVicino(m) - dalPericentroVicino(p)) / 2;
    if (p.e < 1 && m.e < 1) {
      const periodo = (2 * Math.PI) / p.motoMedio;
      dT = Math.abs(((dT + 1.5 * periodo) % periodo) - 0.5 * periodo);
    }
    somma.a += (((invMeno - invPiu) / 2) * a0 * a0) ** 2;
    somma.q += ((p.q - m.q) / 2) ** 2;
    somma.e += ((p.e - m.e) / 2) ** 2;
    somma.i += ((p.i - m.i) / 2) ** 2;
    somma.nodo += (scartoAngolo(p.nodo - m.nodo) / 2) ** 2;
    somma.argPeri += (scartoAngolo(p.argPeri - m.argPeri) / 2) ** 2;
    somma.T += dT ** 2;
  }
  return {
    a: Math.sqrt(somma.a),
    q: Math.sqrt(somma.q),
    e: Math.sqrt(somma.e),
    i: Math.sqrt(somma.i),
    nodo: Math.min(Math.PI, Math.sqrt(somma.nodo)),
    argPeri: Math.min(Math.PI, Math.sqrt(somma.argPeri)),
    T: Math.sqrt(somma.T),
  };
}

/**
 * Errore relativo della velocità rispetto a ε_modello per gli elementi calcolati dallo stato (Luna e satelliti):
 * contro Horizons fino a 0,5 ε; per Notte e Idra, rispetto al baricentro del sistema, fino a 4 ε.
 */
const K_VELOCITA_STATO = 2;
const K_VELOCITA_CIRCUMBINARI = 8;

/** Soglie della forma determinata (§ 7.6.2): oltre, a, e ed i hanno almeno queste incertezze. */
const FORMA_REL_A = 0.05;
const FORMA_E = 0.05;
const FORMA_I = (5 * Math.PI) / 180;

function norma(v: ArrayLike<number>, o = 0): number {
  return Math.hypot(v[o]!, v[o + 1]!, v[o + 2]!);
}

function distanza(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/**
 * Periodo di rotazione mostrato (ore, valore assoluto) e verso: retrograda se l'asse è inclinato di oltre 90°
 * sull'orbita; senza inclinazione nota, se il periodo è negativo rispetto al polo dichiarato. Il segno del catalogo
 * dipende dal polo adottato (nord IAU per Venere e Urano, momento angolare per Plutone): non si mostra.
 */
export function rotazioneMostrata(f: Pick<Fisica, 'rotazione' | 'inclinazioneAssiale_gradi'>): { ore: number; retrograda: boolean } {
  const v = f.rotazione?.valore ?? Number.NaN;
  const incl = f.inclinazioneAssiale_gradi?.valore;
  return { ore: Math.abs(v), retrograda: incl !== undefined && incl !== null ? incl > 90 : v < 0 };
}

export function fonteAllaData(fonti: readonly FonteIntervallo[], jdTT: number): FonteIntervallo | null {
  for (const f of fonti) if (jdTT >= f.inizio && jdTT < f.fine) return f;
  return null;
}

/**
 * Errore radiale dei satelliti (km) alla data: massimo dei record della fonte rispetto alla fonte stessa (§ 7.5.6),
 * non compreso in ε_modello, che è angolare; 0 per gli altri corpi e dove non è misurato (Disnomia).
 */
export function erroreRadialeSatellite(corpo: CorpoCatalogo, jdTT: number): number {
  const e = corpo.effemeridi;
  if (e.modello !== 'satellite') return 0;
  return fonteAllaData(e.fonti, jdTT)?.erroreRadialeKm ?? 0;
}

function parole(testo: string): Set<string> {
  return new Set(
    testo
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((p) => p.length > 0),
  );
}

/**
 * Prefisso e descrizione della fonte senza parole ripetute: le parole del prefisso già presenti nella
 * descrizione si omettono ("JPL Horizons, soluzione" + "SPK Horizons, soluzione JPL#103" → la sola descrizione).
 */
export function componiSorgente(prefisso: string, descrizione: string): string {
  const giaPresenti = parole(descrizione);
  const resto = prefisso
    .split(' ')
    .filter((w) => {
      const p = [...parole(w)];
      return p.length === 0 || !p.every((x) => giaPresenti.has(x));
    })
    .join(' ')
    .replace(/[,:;]\s*$/u, '');
  return resto === '' ? descrizione : `${resto} ${descrizione}`;
}

/** Sorgente delle effemeridi in parole (scheda e testo dell'affidabilità "precisa"). */
export function testoSorgente(corpo: CorpoCatalogo, jdTT: number): string {
  const e = corpo.effemeridi;
  const S = T.sorgenti;
  switch (e.modello) {
    case 'sole':
      return S.sole;
    case 'pianeta':
      return S.de441;
    case 'luna':
      return S.luna;
    case 'satellite':
    case 'piccolo-corpo': {
      const f = fonteAllaData(e.fonti, jdTT);
      if (f === null) return e.modello === 'satellite' ? S.secolare : S.nessuna;
      switch (f.tipo) {
        case 'de441':
          return S.de441;
        case 'secolare':
          return S.secolare;
        case 'sb441-n16':
          return S['sb441-n16'];
        case 'spk-satellitare':
        case 'kepleriana':
        case 'spk-horizons':
        case 'record-dastcom':
        case 'assist':
          return componiSorgente(S[f.tipo], f.descrizione);
      }
    }
  }
}

function angoloPiccolo(x: number): number {
  return Math.min(Math.PI, x);
}

/** Incertezze di partenza: relativa di a, assoluta di e, di i (rad). */
export interface IncertezzeBase {
  relA: number;
  e: number;
  i: number;
}

/**
 * Incertezze di a, e, i per elementi calcolati dallo stato relativo al primario (r km) con errore relativo della
 * velocità dv: δa/a = 2·|2a/r - 1|·dv (vis viva), δe ≈ 2·(2 - r/a)·dv, δi ≈ dv.
 */
export function incertezzeDaStato(c: Pick<ElementiConica, 'a'>, r: number, dv: number): IncertezzeBase {
  const finita = Number.isFinite(c.a) && c.a !== 0;
  const x = finita ? Math.abs((2 * c.a) / r - 1) : 1;
  const w = finita ? Math.abs(2 - r / c.a) : 2;
  return { relA: 2 * x * dv, e: 2 * w * dv, i: dv };
}

/**
 * Incertezze di tutti gli elementi (§ 11.13): δΩ = δi/sin i, δω = δe/e + δΩ, δM = (δe/e) ⊕ ε (direzione del pericentro
 * ed errore lungo l'orbita ε), δq/q = δa/a ⊕ δe, δP/P = 1,5·δa/a, δT = δM/n. Con la forma dell'orbita non determinata
 * almeno 5 % su a, 0,05 su e e 5° su i (§ 7.6.2).
 */
export function incertezzeElementi(
  c: Pick<ElementiConica, 'a' | 'q' | 'e' | 'i' | 'motoMedio'>,
  base: IncertezzeBase,
  eps: number,
  forma: FormaOrbita,
): IncertezzeElementi {
  const determinata = forma === 'determinata';
  const relA = Math.max(base.relA, determinata ? 0 : FORMA_REL_A);
  const sE = Math.max(base.e, determinata ? 0 : FORMA_E);
  const sI = Math.max(base.i, determinata ? 0 : FORMA_I);
  const sNodo = angoloPiccolo(sI / Math.max(Math.sin(c.i), 1e-9));
  const sArg = angoloPiccolo(sE / Math.max(c.e, 1e-9) + sNodo);
  const sM = angoloPiccolo(Math.hypot(sE / Math.max(c.e, 1e-9), Number.isFinite(eps) ? eps : 0));
  const ellisse = c.e < 1 && Number.isFinite(c.a);
  const P = ellisse ? (2 * Math.PI) / c.motoMedio : Number.POSITIVE_INFINITY;
  return {
    a: relA * Math.abs(c.a),
    q: Math.hypot(relA, sE) * c.q,
    e: sE,
    i: sI,
    nodo: sNodo,
    argPeri: sArg,
    M: sM,
    P: 1.5 * relA * P,
    T: c.motoMedio > 0 ? sM / c.motoMedio : Number.POSITIVE_INFINITY,
  };
}

/**
 * e = 1 − q/a: con a e q noti entro le loro incertezze, δe non supera |1 − e|·(δq/q ⊕ δa/a). Vicino a 1 il limite è molto
 * più stretto dell'incertezza assoluta delle serie e tiene e dal lato di 1 indicato dal periodo o da "Orbita
 * iperbolica" (Horizons, 20/10/2026: C/1965 S1-A baricentrica e = 0,99990828, C/2023 A3 eliocentrica e = 1,0001853). Con la
 * forma non determinata resta il minimo del § 7.6.2.
 */
export function limitaIncertezzaE(c: Pick<ElementiConica, 'a' | 'q' | 'e'>, u: IncertezzeElementi, forma: FormaOrbita): void {
  if (forma !== 'determinata' || !Number.isFinite(c.a) || c.a === 0 || !(c.q > 0)) return;
  const limite = Math.abs(1 - c.e) * Math.hypot(u.q / c.q, u.a / Math.abs(c.a));
  if (limite < u.e) u.e = limite;
}

/** Calcolatore senza allocazioni ripetute dei buffer di stato. */
export class CalcolatoreScheda {
  private readonly r = new Float64Array(6);
  private readonly rp = new Float64Array(6);
  private readonly rt = new Float64Array(6);
  private readonly rel = new Float64Array(6);
  private readonly relF = new Float64Array(6);
  private readonly matriceF = new Float64Array(9);
  private readonly membro = new Float64Array(6);
  private readonly bar = new Float64Array(6);
  private readonly eA = new Float64Array(6);
  private readonly eB = new Float64Array(6);
  private readonly affErr: Affidabilita = { livello: 'non-determinabile', epsModello: 0, epsDeltaT: 0, epsTotale: 0 };
  private readonly orb: ElementiOrbita = {
    primario: 0,
    baricentrici: false,
    q: 0,
    e: 0,
    i: 0,
    nodo: 0,
    argPeri: 0,
    anomaliaVera: 0,
    forma: 'determinata',
  };
  private readonly conica: ElementiConica = {
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
  private perSlug = new Map<string, CorpoCatalogo>();
  private perSsid = new Map<number, CorpoCatalogo>();
  private lune = new Map<string, CorpoCatalogo[]>();

  constructor(
    private readonly effemeridi: EphemerisService,
    corpi: readonly CorpoCatalogo[],
  ) {
    this.impostaCorpi(corpi);
  }

  impostaCorpi(corpi: readonly CorpoCatalogo[]): void {
    this.perSlug = new Map(corpi.map((c) => [c.slug, c]));
    this.perSsid = new Map(corpi.map((c) => [c.ssid, c]));
    this.lune = new Map();
    for (const c of corpi) {
      if (c.primario === null || c.categoria !== 'luna') continue;
      const l = this.lune.get(c.primario) ?? [];
      l.push(c);
      this.lune.set(c.primario, l);
    }
  }

  /** μ (km³/s²) del moto del corpo attorno al primario (§ 7.1). */
  mu(corpo: CorpoCatalogo, baricentrici: boolean): number {
    if (baricentrici) return MU_BARICENTRICO;
    const e = corpo.effemeridi;
    if (e.modello === 'pianeta') return MU_ELIO_KM3_S2[e.naifDE441] ?? GM_SOLE;
    if (e.modello === 'luna') return GM_TERRA + GM_LUNA;
    if (e.modello === 'satellite') {
      const p = corpo.primario === null ? undefined : this.perSlug.get(corpo.primario);
      const gmP =
        p?.fisica.gm_km3s2?.valore ??
        (p !== undefined && p.effemeridi.modello === 'pianeta' ? (GM_BARICENTRI[p.effemeridi.naifDE441] ?? 0) : 0);
      return gmP + (corpo.fisica.gm_km3s2?.valore ?? 0);
    }
    return GM_SOLE;
  }

  /**
   * Baricentro del sistema del primario (primario e sue lune del catalogo, pesati con il GM) in out;
   * restituisce il GM del sistema, o null se manca uno stato o un GM.
   */
  private baricentroSistema(primario: CorpoCatalogo, jdTT: number, out: Float64Array): number | null {
    const membri = [primario, ...(this.lune.get(primario.slug) ?? [])];
    out.fill(0);
    let gm = 0;
    for (const m of membri) {
      const g = m.fisica.gm_km3s2?.valore;
      if (g === undefined || !(g > 0)) {
        if (m === primario) return null;
        continue;
      }
      if (this.effemeridi.stateAt(m.ssid, jdTT, this.membro) !== 'ok') return null;
      for (let k = 0; k < 6; k++) out[k] = out[k]! + g * this.membro[k]!;
      gm += g;
    }
    for (let k = 0; k < 6; k++) out[k] = out[k]! / gm;
    return gm;
  }

  /**
   * Errore assoluto stimato della posizione eliocentrica (km): ε·r, e per le lune errore del primario ⊕ ε·d ⊕ δr, con δr
   * l'errore radiale massimo dei record della fonte alla data (satelliti, § 7.5.6): ε è solo angolare.
   */
  private erroreAssoluto(corpo: CorpoCatalogo, t: TimeState, profondita = 0): number | null {
    if (corpo.categoria === 'sole') return 0;
    const eff = this.effemeridi;
    eff.affidabilita(corpo.ssid, t, this.affErr);
    const eps = this.affErr.epsTotale;
    if (!Number.isFinite(eps)) return null;
    if (eff.stateAt(corpo.ssid, t.jdTT, this.eA) !== 'ok') return null;
    const primario = corpo.primario === null ? undefined : this.perSlug.get(corpo.primario);
    if (primario === undefined || primario.categoria === 'sole' || profondita > 2) return eps * norma(this.eA);
    if (eff.stateAt(primario.ssid, t.jdTT, this.eB) !== 'ok') return null;
    const propria = Math.hypot(eps * distanza(this.eA, this.eB), erroreRadialeSatellite(corpo, t.jdTT));
    const ep = this.erroreAssoluto(primario, t, profondita + 1);
    return ep === null ? null : Math.hypot(ep, propria);
  }

  /**
   * Errori stimati della distanza dal Sole e dalla Terra (§ 11.13). ε è l'angolo attorno al primario (§ 7.8.1):
   * per le lune l'errore del primario si somma in quadratura; la distanza dalla Terra della Luna, misurata dal
   * primario stesso, ha il solo errore ε·d. Il Sole è l'origine: la sua distanza dalla Terra ha l'errore della Terra.
   */
  errori(corpo: CorpoCatalogo, t: TimeState): ErroriPosizione {
    const err = this.erroreAssoluto(corpo, t);
    const terra = this.perSlug.get('terra');
    if (terra === undefined || corpo.slug === 'terra') return { erroreKm: err, erroreTerraKm: null };
    if (corpo.primario === 'terra') {
      const eff = this.effemeridi;
      eff.affidabilita(corpo.ssid, t, this.affErr);
      const eps = this.affErr.epsTotale;
      if (!Number.isFinite(eps) || eff.stateAt(corpo.ssid, t.jdTT, this.eA) !== 'ok' || eff.stateAt(terra.ssid, t.jdTT, this.eB) !== 'ok') {
        return { erroreKm: err, erroreTerraKm: null };
      }
      return { erroreKm: err, erroreTerraKm: eps * distanza(this.eA, this.eB) };
    }
    const errTerra = this.erroreAssoluto(terra, t);
    return { erroreKm: err, erroreTerraKm: err === null || errTerra === null ? null : Math.hypot(err, errTerra) };
  }

  calcola(corpo: CorpoCatalogo, t: TimeState): DatiScheda {
    const eff = this.effemeridi;
    const aff: Affidabilita = { livello: 'non-determinabile', epsModello: Number.NaN, epsDeltaT: 0, epsTotale: Number.NaN };
    eff.affidabilita(corpo.ssid, t, aff);
    const jdTT = t.jdTT;
    const stato = eff.stateAt(corpo.ssid, jdTT, this.r);
    const sorgente = testoSorgente(corpo, jdTT);
    const terra = this.perSlug.get('terra');
    const primario = corpo.primario === null ? null : (this.perSlug.get(corpo.primario) ?? null);
    // Con l'istante in TT l'ora UT1 = TT - ΔT è incerta di σ(ΔT) e l'angolo ERA(UT1) di 15°/h·σ; con l'istante
    // in UT l'ERA è fissato e la direzione del Sole varia solo di 0,9856°/d·σ (§ 7.7).
    const rotazioneIndeterminata =
      corpo.slug === 'terra' && t.scalaIngresso === 'TT' && rotazioneIndeterminataPerSigma(t.deltaTSigma);

    const dati: DatiScheda = {
      corpo,
      stato,
      distanzaSoleKm: null,
      distanzaTerraKm: null,
      tempoLuceS: null,
      velocitaKmS: null,
      erroreVelocitaKmS: null,
      velocitaRispetto: null,
      rispettoSistema: false,
      elementi: null,
      affidabilita: aff,
      sorgente,
      rotazioneIndeterminata,
      erroreKm: null,
      erroreTerraKm: null,
    };
    if (stato !== 'ok') return dati;

    // Distanza dalla Terra con tempo luce, anche per il Sole (§ 11.7: assente solo per la Terra).
    if (terra && terra.ssid !== corpo.ssid && eff.stateAt(terra.ssid, jdTT, this.rt) === 'ok') {
      const d = distanza(this.r, this.rt);
      dati.distanzaTerraKm = d;
      dati.tempoLuceS = d / C_KM_S;
    }
    const errori = this.errori(corpo, t);
    dati.erroreKm = errori.erroreKm;
    dati.erroreTerraKm = errori.erroreTerraKm;
    if (corpo.categoria === 'sole') return dati;

    dati.distanzaSoleKm = norma(this.r);
    const satellite = corpo.categoria === 'luna' && primario !== null && primario.categoria !== 'sole';
    const e = corpo.effemeridi;
    // Satelliti circumbinari (Notte, Idra): stato e μ rispetto al baricentro del sistema del primario.
    let muSistema: number | null = null;
    let relOk = !satellite;
    if (satellite && e.modello === 'satellite' && e.centro === 'baricentro') {
      muSistema = this.baricentroSistema(primario, jdTT, this.bar);
      if (muSistema !== null) {
        for (let k = 0; k < 6; k++) this.rel[k] = this.r[k]! - this.bar[k]!;
        relOk = true;
        dati.rispettoSistema = true;
      }
    } else if (satellite && eff.stateAt(primario.ssid, jdTT, this.rp) === 'ok') {
      for (let k = 0; k < 6; k++) this.rel[k] = this.r[k]! - this.rp[k]!;
      relOk = true;
    }
    if (satellite && relOk) {
      dati.velocitaKmS = norma(this.rel, 3);
      dati.velocitaRispetto = primario;
    } else if (!satellite) {
      for (let k = 0; k < 6; k++) this.rel[k] = this.r[k]!;
      dati.velocitaKmS = norma(this.r, 3);
    }

    dati.elementi = this.elementi(corpo, primario, satellite, relOk, muSistema, aff.epsModello, jdTT);
    dati.erroreVelocitaKmS = this.erroreVelocita(dati, muSistema !== null);
    return dati;
  }

  /**
   * Errore stimato della velocità mostrata (km/s): variazione di |v| lungo l'orbita entro ±ε_tot (posizione incerta lungo
   * l'orbita) in quadratura con l'errore dello stato: dv = 2·ε_modello (8·ε_modello per Notte e Idra) per Luna e
   * satelliti, errore relativo delle serie per pianeti e piccoli corpi, con l'errore misurato della velocità interpolata.
   */
  private erroreVelocita(dati: DatiScheda, circumbinario: boolean): number | null {
    const v = dati.velocitaKmS;
    const el = dati.elementi;
    if (v === null) return null;
    const aff = dati.affidabilita;
    const epsTot = Number.isFinite(aff.epsTotale) ? aff.epsTotale : Math.PI;
    const epsMod = Number.isFinite(aff.epsModello) ? aff.epsModello : 0;
    const e = dati.corpo.effemeridi;
    const stato =
      e.modello === 'pianeta' || e.modello === 'piccolo-corpo'
        ? Math.hypot(INCERTEZZE_SERIE[e.modello].e * v, e.modello === 'piccolo-corpo' ? ERRORE_VELOCITA_PICCOLI_KM_S : 0)
        : (circumbinario ? K_VELOCITA_CIRCUMBINARI : K_VELOCITA_STATO) * epsMod * v;
    const orbita = el === null ? v : variazioneVelocitaSullOrbita(v, el.q, el.e, el.anomaliaVera, epsTot);
    return Math.hypot(stato, orbita);
  }

  private elementi(
    corpo: CorpoCatalogo,
    primario: CorpoCatalogo | null,
    satellite: boolean,
    relOk: boolean,
    muSistema: number | null,
    epsModello: number,
    jdTT: number,
  ): ElementiScheda | null {
    const esito = this.effemeridi.orbitAt(corpo.ssid, jdTT, this.orb);
    const forma: FormaOrbita = esito === 'ok' ? this.orb.forma : 'non-determinata';
    const baricentrici = esito === 'ok' && this.orb.baricentrici;
    const mu = muSistema ?? this.mu(corpo, baricentrici);
    const c = this.conica;

    let riferimento: RiferimentoElementi = baricentrici ? 'baricentrici' : satellite ? 'planetocentrici' : 'eliocentrici';
    const e = corpo.effemeridi;
    if (satellite && relOk && e.modello === 'satellite' && e.rF.length === 9) {
      // Stato planetocentrico nel sistema F alla data: r_F = R_Fᵀ · r (R_F porta da F all'eclittica J2000; nei record
      // secolari dei satelliti con piano che segue l'equatore, F ruota con il polo del primario).
      const m = this.effemeridi.matriceF?.(corpo.ssid, jdTT, this.matriceF) === true ? this.matriceF : e.rF;
      for (let o = 0; o < 6; o += 3) {
        const x = this.rel[o]!;
        const y = this.rel[o + 1]!;
        const z = this.rel[o + 2]!;
        this.relF[o] = m[0]! * x + m[3]! * y + m[6]! * z;
        this.relF[o + 1] = m[1]! * x + m[4]! * y + m[7]! * z;
        this.relF[o + 2] = m[2]! * x + m[5]! * y + m[8]! * z;
      }
      if (!conicaDaStato(this.relF, mu, c)) return null;
      riferimento = 'planetocentrici-F';
    } else if (esito === 'ok' && muSistema === null) {
      const o = this.orb;
      c.q = o.q;
      c.e = o.e;
      c.i = o.i;
      c.nodo = o.nodo;
      c.argPeri = o.argPeri;
      c.anomaliaVera = o.anomaliaVera;
      completaConica(c, mu);
    } else if (relOk) {
      if (!conicaDaStato(this.rel, mu, c)) return null;
    } else {
      return null;
    }

    const ellisse = c.e < 1;
    const P = ellisse ? (2 * Math.PI) / c.motoMedio : Number.POSITIVE_INFINITY;
    // Passaggio al pericentro più vicino all'istante: oltre metà orbita (M > 180°) il successivo.
    const dalPericentro = ellisse && c.anomaliaMedia > Math.PI ? (c.anomaliaMedia - 2 * Math.PI) / c.motoMedio : c.tempoDalPericentro;
    const eps = Number.isFinite(epsModello) ? epsModello : 0;
    const base =
      e.modello === 'pianeta' || e.modello === 'piccolo-corpo'
        ? INCERTEZZE_SERIE[e.modello]
        : incertezzeDaStato(c, relOk ? norma(this.rel) : c.q, (muSistema !== null ? K_VELOCITA_CIRCUMBINARI : K_VELOCITA_STATO) * eps);
    const incertezza = incertezzeElementi(c, base, eps, forma);
    if (e.modello === 'piccolo-corpo') {
      // Errori dello stato interpolato: tolleranza del segmento sulla posizione, errore misurato sulla velocità (§ 11.13).
      const r = norma(this.r);
      const sr = tolleranzaPiccoliCorpi(jdTT, r, eps);
      const sv = Math.max(ERRORE_VELOCITA_PICCOLI_KM_S, (norma(this.r, 3) * sr) / r);
      const s = incertezzeDaStatoPerturbato(this.r, MU_PICCOLI_CORPI_KM3_S2, sr, sv);
      const u = incertezza;
      u.a = Math.hypot(u.a, s.a);
      u.q = Math.hypot(u.q, s.q);
      u.e = Math.hypot(u.e, s.e);
      u.i = Math.hypot(u.i, s.i);
      u.nodo = Math.min(Math.PI, Math.hypot(u.nodo, s.nodo));
      u.argPeri = Math.min(Math.PI, Math.hypot(u.argPeri, s.argPeri));
      u.T = Math.hypot(u.T, s.T);
      u.M = Math.min(Math.PI, Math.hypot(u.M, s.T * c.motoMedio));
      if (Number.isFinite(P)) u.P = Math.hypot(u.P, (1.5 * s.a * P) / Math.abs(c.a));
    }
    limitaIncertezzaE(c, incertezza, forma);
    // Le serie dei pianeti sono quelle dei baricentri NAIF 1-9 di DE441 (orbitAt).
    const baricentro =
      e.modello !== 'pianeta' ? null : e.naifDE441 === 3 ? 'terra-luna' : (this.lune.get(corpo.slug)?.length ?? 0) > 0 ? 'sistema' : null;
    return {
      riferimento,
      primario,
      centroSistema: muSistema !== null,
      baricentro,
      a: c.a,
      q: c.q,
      e: c.e,
      i: c.i,
      nodo: c.nodo,
      argPeri: c.argPeri,
      M: c.anomaliaMedia,
      P,
      T: jdTT - dalPericentro,
      anomaliaVera: c.anomaliaVera,
      vInf: c.e > 1 && Number.isFinite(c.a) ? Math.sqrt(-mu / c.a) : null,
      forma,
      incertezza,
    };
  }

  corpo(ssid: number): CorpoCatalogo | undefined {
    return this.perSsid.get(ssid);
  }

  /**
   * Fasce di affidabilità della panoramica (§ 11.4.3) su [jd0, jd1) (UT), con la velocità angolare di riferimento
   * dell'orbita all'istante t (velocitaAngolareConica): uguali con qualsiasi blocco in memoria. Il livello si valuta al
   * centro di `campioni` intervalli e all'istante t; tra due punti di livello diverso il passaggio si cerca per
   * bisezione, a meno di un giorno (PRECISIONE_PASSAGGIO_GIORNI): gli anni delle fasce sono quelli veri e alla data
   * mostrata la fascia ha il livello del punto t. null se a t lo stato del corpo non è disponibile.
   */
  bandeAffidabilita(corpo: CorpoCatalogo, t: TimeState, makeTimeState: MakeTimeState, jd0: number, jd1: number, campioni: number): BandaAffidabilita[] | null {
    if (corpo.categoria === 'sole') return [];
    const el = this.calcola(corpo, t).elementi;
    if (el === null || !(el.q > 0) || !Number.isFinite(el.e)) return null;
    const mu = el.vInf !== null ? el.vInf * el.vInf * Math.abs(el.a) : this.mu(corpo, el.riferimento === 'baricentrici');
    const aff = this.affErr;
    const punto = (jd: number): PuntoBanda => {
      const ts = makeTimeState(jd, 'UT');
      this.effemeridi.affidabilita(corpo.ssid, ts, aff);
      return { jd, livello: livelloBanda(aff, velocitaAngolareConica(el, mu, ts.jdTT), ts) };
    };
    // Punti tra a e b (esclusi) che, aggiunti a quelli noti, separano i livelli a meno della precisione.
    const raffina = (a: PuntoBanda, b: PuntoBanda, out: PuntoBanda[]): void => {
      if (a.livello === b.livello || b.jd - a.jd <= PRECISIONE_PASSAGGIO_GIORNI) return;
      const m = punto((a.jd + b.jd) / 2);
      raffina(a, m, out);
      out.push(m);
      raffina(m, b, out);
    };
    const passo = (jd1 - jd0) / campioni;
    const punti: PuntoBanda[] = [];
    for (let i = 0; i < campioni; i++) punti.push(punto(jd0 + (i + 0.5) * passo));
    // L'istante mostrato è un punto a sé: il suo livello vale per la fascia che lo contiene.
    if (t.jdUT >= jd0 && t.jdUT < jd1) {
      const k = punti.findIndex((p) => p.jd >= t.jdUT);
      if (k < 0 || punti[k]!.jd !== t.jdUT) punti.splice(k < 0 ? punti.length : k, 0, punto(t.jdUT));
    }
    const infittiti: PuntoBanda[] = [];
    for (let k = 0; k < punti.length; k++) {
      infittiti.push(punti[k]!);
      const b = punti[k + 1];
      if (b !== undefined) raffina(punti[k]!, b, infittiti);
    }
    const bande: BandaAffidabilita[] = [];
    let inizio = jd0;
    for (let k = 0; k < infittiti.length; k++) {
      const a = infittiti[k]!;
      const b = infittiti[k + 1];
      if (b !== undefined && b.livello === a.livello) continue;
      // Il passaggio è a metà tra gli ultimi due punti di livelli diversi.
      const fine = b === undefined ? jd1 : (a.jd + b.jd) / 2;
      bande.push({ jd0: inizio, jd1: fine, livello: a.livello });
      inizio = fine;
    }
    return bande;
  }

  /**
   * Riga della vista testuale (§ 11.9): distanze e coordinate eliocentriche con gli errori della scheda (§ 11.13). Senza
   * posizione alla data (dati in caricamento o fuori copertura) nessun livello, come nella scheda; livello non
   * determinabile senza posizione. `inCaricamento` distingue i valori che mancano perché il blocco della data non è
   * caricato da quelli che non esistono.
   */
  rigaTestuale(corpo: CorpoCatalogo, t: TimeState): RigaTestuale {
    const eff = this.effemeridi;
    const terra = this.perSlug.get('terra');
    const esitoTerra = terra === undefined ? 'non-determinabile' : eff.stateAt(terra.ssid, t.jdTT, this.rt);
    const terraOk = esitoTerra === 'ok';
    const esito = eff.stateAt(corpo.ssid, t.jdTT, this.r);
    let livello: Livello | null = null;
    if (corpo.categoria !== 'sole' && esito !== 'caricamento' && esito !== 'fuori-copertura') {
      eff.affidabilita(corpo.ssid, t, this.affErr);
      livello = this.affErr.livello;
    }
    const ok = esito === 'ok' && livello !== 'non-determinabile';
    const r = ok ? norma(this.r) : null;
    const errori = ok ? this.errori(corpo, t) : { erroreKm: null, erroreTerraKm: null };
    // La distanza dalla Terra dipende anche dai dati della Terra (e di moon.bin), che possono mancare con quelli del corpo.
    const inCaricamento = esito === 'caricamento' || (ok && corpo.slug !== 'terra' && esitoTerra === 'caricamento');
    return {
      corpo,
      distanzaSoleKm: corpo.categoria === 'sole' ? null : r,
      distanzaTerraKm: ok && terraOk && corpo.slug !== 'terra' ? distanza(this.r, this.rt) : null,
      lon: ok && r !== null && r > 0 ? Math.atan2(this.r[1]!, this.r[0]!) : null,
      lat: ok && r !== null && r > 0 ? Math.asin(this.r[2]! / r) : null,
      livello,
      erroreSoleKm: errori.erroreKm,
      erroreTerraKm: errori.erroreTerraKm,
      inCaricamento,
    };
  }
}

/**
 * Massima variazione di |v| (km/s) per anomalie vere entro ν ± ε sulla conica (q, e), con v la velocità a ν: per vis viva
 * v² ∝ 2(1 + e·cos ν)/p - (1 - e)/q, p = q(1 + e). Per l'iperbole ν resta entro gli asintoti.
 */
export function variazioneVelocitaSullOrbita(v: number, q: number, e: number, nu: number, eps: number): number {
  if (!(v > 0) || !(q > 0) || !Number.isFinite(e) || !Number.isFinite(nu)) return Number.POSITIVE_INFINITY;
  const p = q * (1 + e);
  const g = (x: number) => (2 * (1 + e * Math.cos(x))) / p - (1 - e) / q;
  const g0 = g(nu);
  if (!(g0 > 0)) return Number.POSITIVE_INFINITY;
  const d = Math.min(Math.PI, Math.abs(eps));
  // ν ridotto a (-π, π]; per l'iperbole entro ±acos(-1/e).
  const n0 = Math.atan2(Math.sin(nu), Math.cos(nu));
  const lim = e >= 1 ? Math.acos(-1 / e) - 1e-9 : Math.PI;
  const lo = Math.max(-lim, n0 - d);
  const hi = Math.min(lim, n0 + d);
  const candidati = [lo, hi];
  // Estremi di g: pericentro (ν = 0) e, per l'ellisse, apocentro (ν = ±π) se compresi nell'intervallo.
  if (lo <= 0 && hi >= 0) candidati.push(0);
  if (e < 1 && (n0 + d >= Math.PI || n0 - d <= -Math.PI)) candidati.push(Math.PI);
  let massimo = 0;
  for (const x of candidati) massimo = Math.max(massimo, Math.abs(v * Math.sqrt(Math.max(0, g(x)) / g0) - v));
  return massimo;
}

/**
 * Velocità angolare attorno al primario (rad/s) sulla conica (q, e, a, T, P) con μ (km³/s²), all'istante jdTT: per l'ellisse
 * il moto medio 2π/P (media di |r × v|/r² sull'orbita), per l'iperbole e la parabola h/r² con r dalla conica propagata.
 */
export function velocitaAngolareConica(el: Pick<ElementiScheda, 'q' | 'e' | 'a' | 'T' | 'P'>, mu: number, jdTT: number): number {
  if (el.e < 1) return (2 * Math.PI) / (el.P * GIORNO_S);
  const dt = (jdTT - el.T) * GIORNO_S;
  let r: number;
  if (el.e > 1 + 1e-9 && Number.isFinite(el.a)) {
    const a = Math.abs(el.a);
    const hh = risolviKeplerIperbolico(Math.sqrt(mu / (a * a * a)) * dt, el.e);
    r = a * (el.e * Math.cosh(hh) - 1);
  } else {
    // Parabola (Barker): s³ + 3s = 3·√(μ/2q³)·Δt, r = q(1 + s²).
    const w = 3 * Math.sqrt(mu / (2 * el.q ** 3)) * dt;
    const z = Math.sqrt(1 + (w * w) / 4);
    const s = Math.cbrt(w / 2 + z) + Math.cbrt(w / 2 - z);
    r = el.q * (1 + s * s);
  }
  return Math.sqrt(mu * el.q * (1 + el.e)) / (r * r);
}

/**
 * Livello di una fascia della panoramica: ε_modello dell'istante con ε_ΔT = ω·σ(ΔT) dalla velocità angolare di
 * riferimento, non da quella dei dati in memoria (§ 7.8.1). Livello non determinabile e livelli provvisori restano.
 */
export function livelloBanda(aff: Affidabilita, omega: number, t: TimeState): Livello {
  if (aff.livello === 'non-determinabile' || !Number.isFinite(aff.epsModello)) return aff.livello;
  return livelloDaErrore(Math.hypot(aff.epsModello, epsDeltaT(omega, t)));
}

/** Completa a, M, n e tempo dal pericentro da (q, e, ν) e μ, come conicaDaStato. */
export function completaConica(c: ElementiConica, mu: number): void {
  const e = c.e;
  const nu = c.anomaliaVera;
  if (e < 1 - 1e-10) {
    const a = c.q / (1 - e);
    const ea = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu));
    let m = ea - e * Math.sin(ea);
    m = ((m % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const n = Math.sqrt(mu / (a * a * a)) * GIORNO_S;
    c.a = a;
    c.anomaliaMedia = m;
    c.motoMedio = n;
    c.tempoDalPericentro = m / n;
  } else if (e > 1 + 1e-10) {
    const a = c.q / (1 - e);
    const hh = Math.asinh((Math.sqrt(e * e - 1) * Math.sin(nu)) / (1 + e * Math.cos(nu)));
    const m = e * Math.sinh(hh) - hh;
    const n = Math.sqrt(mu / -(a * a * a)) * GIORNO_S;
    c.a = a;
    c.anomaliaMedia = m;
    c.motoMedio = n;
    c.tempoDalPericentro = m / n;
  } else {
    const d = Math.tan(0.5 * nu);
    const m = d + (d * d * d) / 3;
    const n = Math.sqrt(mu / (2 * c.q * c.q * c.q)) * GIORNO_S;
    c.a = Number.POSITIVE_INFINITY;
    c.anomaliaMedia = m;
    c.motoMedio = n;
    c.tempoDalPericentro = m / n;
  }
}
