// Satelliti naturali tranne la Luna (§ 7.5 di docs/PROGETTO.md) dai file sats/sKK.bin (§ 8.5) e centri
// dei pianeti (§ 7.3.5). Posizioni planetocentriche nell'eclittica J2000 (km, km/s); nessuna allocazione
// nei percorsi chiamati a ogni frame; mai estrapolazione oltre i record presenti nei file caricati.
//
// Composizione dello stato eliocentrico di un satellite (a cura del servizio delle effemeridi):
//   r_sat = r_bar + offset + ρ, con r_bar baricentro del sistema (planets.ts), offset = planetCenterOffset
//   e ρ = statoPlanetocentrico. Centro del pianeta: r_bar + offset.
//
// Piano secolare (§ 7.5.4): per i satelliti il cui piano di Laplace segue l'equatore del primario, negli intervalli
// serviti dai record secolari il sistema F ruota con il polo WGCCRE del primario: F(t) = Q(t)·R_F, con Q(t) rotazione
// minima che porta il polo all'epoca di giunzione con i record da SPK sul polo all'istante t (Q = I alla giunzione).

import { bloccoDi, fineBlocco, inizioBlocco, TIPO_SATELLITI } from '../data/binHeader';
import type { Catalogo, CoefficientiWgccre, FonteIntervallo } from '../data/catalogTypes';
import { elementiRecord, leggiSatelliti } from '../data/satsReader';
import type { ElementiModello, FileSatelliti } from '../data/satsReader';
import { GM_BARICENTRI, K } from './constants';
import type { Scrivibile } from './equinoctial';
import { risolviKeplero } from './kepler';
import { poloWgccreEclittica } from './orientation';
import type { ElementiOrbita, StatoEffemeride } from './types';

/** Intervallo [inizio, fine) servito da un record secolare ed epoca di giunzione con i record da SPK (JD TDB). */
export interface IntervalloSecolare {
  readonly inizio: number;
  readonly fine: number;
  readonly giunzione: number;
}

/** Piano secolare che segue l'equatore del primario: polo WGCCRE del primario e intervalli secolari. */
export interface PianoSecolare {
  readonly coefficienti: CoefficientiWgccre;
  readonly intervalli: readonly IntervalloSecolare[];
}

/** Configurazione di un satellite, dal catalogo (§ 8.10). */
export interface ConfigSatellite {
  readonly ssid: number;
  /** ssid del corpo primario (pianeta, Plutone o Eris). */
  readonly primario: number;
  /** R_F: matrice 3×3 per righe dal sistema F all'eclittica J2000. */
  readonly rF: readonly number[];
  /** Frequenze ν_k dei termini periodici (rad/d). */
  readonly frequenze: readonly number[];
  /** GM (km³/s²); 0 se non noto. */
  readonly gm: number;
  /** Vero se il modello è relativo al baricentro del sistema (satelliti circumbinari di Plutone). */
  readonly baricentrico: boolean;
  /** Rotazione di F con il polo del primario nei record secolari; assente o null: F fisso. */
  readonly pianoSecolare?: PianoSecolare | null;
}

/** Codice NAIF del sistema (baricentro DE441) per ssid del pianeta (scripts/pipeline/bodies.json). */
export const SISTEMA_PER_PIANETA: Readonly<Record<number, number>> = { 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 10: 9 };

/** Percorso relativo in data/v1/ del file del blocco k. */
export function percorsoBloccoSatelliti(k: number): string {
  if (!(Number.isInteger(k) && k >= 0 && k < K)) throw new RangeError(`blocco fuori intervallo: ${k}`);
  return `sats/s${k < 10 ? '0' : ''}${k}.bin`;
}

/**
 * Intervalli delle fonti 'secolare' con l'epoca di giunzione: estremo adiacente a una fonte di altro tipo (fine per
 * l'estrapolazione verso il passato, inizio per quella verso il futuro). Intervalli senza fonti adiacenti esclusi.
 */
export function intervalliSecolari(fonti: readonly FonteIntervallo[]): IntervalloSecolare[] {
  const out: IntervalloSecolare[] = [];
  fonti.forEach((f, j) => {
    if (f.tipo !== 'secolare') return;
    const succ = fonti[j + 1];
    const prec = fonti[j - 1];
    if (succ !== undefined && succ.tipo !== 'secolare') out.push({ inizio: f.inizio, fine: f.fine, giunzione: f.fine });
    else if (prec !== undefined && prec.tipo !== 'secolare') out.push({ inizio: f.inizio, fine: f.fine, giunzione: f.inizio });
  });
  return out;
}

/** Configurazioni dei satelliti del catalogo (corpi con effemeridi di modello 'satellite'). */
export function configDaCatalogo(catalogo: Catalogo): ConfigSatellite[] {
  const perSlug = new Map(catalogo.corpi.map((c) => [c.slug, c] as const));
  const out: ConfigSatellite[] = [];
  for (const c of catalogo.corpi) {
    const eff = c.effemeridi;
    if (eff.modello !== 'satellite') continue;
    const p = c.primario === null ? undefined : perSlug.get(c.primario);
    if (p === undefined) throw new RangeError(`primario non trovato per ${c.slug}`);
    if (eff.rF.length !== 9) throw new RangeError(`R_F non valida per ${c.slug}`);
    let pianoSecolare: PianoSecolare | null = null;
    if (eff.pianoSegueEquatore === true) {
      const o = p.orientamento;
      if (o.modello !== 'wgccre' || o.coefficienti === null) throw new RangeError(`polo del primario non disponibile per ${c.slug}`);
      pianoSecolare = { coefficienti: o.coefficienti, intervalli: intervalliSecolari(eff.fonti) };
    }
    out.push({
      ssid: c.ssid,
      primario: p.ssid,
      rF: eff.rF,
      frequenze: eff.frequenze,
      gm: c.fisica.gm_km3s2?.valore ?? 0,
      baricentrico: eff.centro === 'baricentro',
      pianoSecolare,
    });
  }
  return out;
}

/**
 * Rotazione minima (matrice per righe) che porta il versore p0 sul versore p1 (formula di Rodrigues):
 * Q = I + [k]× + [k]×²/(1 + c), con k = p0 × p1 e c = p0 · p1 (p1 ≠ -p0).
 */
export function rotazioneMinima(p0: ArrayLike<number>, p1: ArrayLike<number>, out: Scrivibile): void {
  const kx = p0[1]! * p1[2]! - p0[2]! * p1[1]!;
  const ky = p0[2]! * p1[0]! - p0[0]! * p1[2]!;
  const kz = p0[0]! * p1[1]! - p0[1]! * p1[0]!;
  const c = p0[0]! * p1[0]! + p0[1]! * p1[1]! + p0[2]! * p1[2]!;
  const f = 1 / (1 + c);
  const k2 = kx * kx + ky * ky + kz * kz;
  out[0] = 1 + f * (kx * kx - k2);
  out[1] = -kz + f * kx * ky;
  out[2] = ky + f * kx * kz;
  out[3] = kz + f * kx * ky;
  out[4] = 1 + f * (ky * ky - k2);
  out[5] = -kx + f * ky * kz;
  out[6] = -ky + f * kx * kz;
  out[7] = kx + f * ky * kz;
  out[8] = 1 + f * (kz * kz - k2);
}

/** Prodotto di matrici 3×3 per righe: out = a·b (out distinto da a e da b). */
function prodotto(a: ArrayLike<number>, b: ArrayLike<number>, out: Scrivibile): void {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!;
  }
}

function ruota(m: ArrayLike<number>, v: ArrayLike<number>, out: Scrivibile): void {
  for (let i = 0; i < 3; i++) {
    const r0 = m[3 * i]!;
    const r1 = m[3 * i + 1]!;
    const r2 = m[3 * i + 2]!;
    out[i] = r0 * v[0]! + r1 * v[1]! + r2 * v[2]!;
    out[i + 3] = r0 * v[3]! + r1 * v[4]! + r2 * v[5]!;
  }
}

// Memoria di lavoro.
const statoF = new Float64Array(6);
const statoE = new Float64Array(6);
// stato dei membri del sistema nel calcolo del centro (distinto da statoE, in uso nel chiamante)
const statoMembro = new Float64Array(6);
const offsetLavoro = new Float64Array(6);
const elLavoro: ElementiModello = { a: 0, e: 0, varpi: 0, tanI2: 0, omega: 0, lam: 0, nEff: 0, fattoreI: 1 };
const vett = new Float64Array(12);
// rotazione del piano secolare, polo del primario alla data e matrice F(t) = Q(t)·R_F
const qLavoro = new Float64Array(9);
const poloData = new Float64Array(3);
const matriceLavoro = new Float64Array(9);

interface Sistema {
  readonly gmSistema: number;
  readonly membri: readonly ConfigSatellite[];
}

/** Piano secolare con i poli del primario alle epoche di giunzione (eclittica J2000), calcolati una volta. */
interface PianoInterno {
  readonly coefficienti: CoefficientiWgccre;
  readonly intervalli: readonly IntervalloSecolare[];
  readonly poliGiunzione: readonly Float64Array[];
}

/** Blocchi caricati dei satelliti, stati planetocentrici e centri dei pianeti. */
export class EffemeridiSatelliti {
  private readonly blocchi: (FileSatelliti | null)[] = new Array<FileSatelliti | null>(K).fill(null);
  private readonly config = new Map<number, ConfigSatellite>();
  private readonly sistemi = new Map<number, Sistema>();
  private readonly piani = new Map<number, PianoInterno>();

  constructor(config: readonly ConfigSatellite[]) {
    for (const c of config) {
      if (c.rF.length !== 9) throw new RangeError(`R_F non valida per ${c.ssid}`);
      if (c.frequenze.length > 6) throw new RangeError(`troppe frequenze per ${c.ssid}`);
      this.config.set(c.ssid, c);
      const ps = c.pianoSecolare;
      if (ps !== null && ps !== undefined && ps.intervalli.length > 0) {
        const poliGiunzione = ps.intervalli.map((iv) => {
          const p = new Float64Array(3);
          poloWgccreEclittica(ps.coefficienti, iv.giunzione, p);
          return p;
        });
        this.piani.set(c.ssid, { coefficienti: ps.coefficienti, intervalli: ps.intervalli, poliGiunzione });
      }
    }
    for (const [pianeta, naif] of Object.entries(SISTEMA_PER_PIANETA)) {
      const p = Number(pianeta);
      const gm = GM_BARICENTRI[naif];
      if (gm === undefined) continue;
      this.sistemi.set(p, { gmSistema: gm, membri: config.filter((c) => c.primario === p) });
    }
  }

  /** Legge, verifica e registra un file sKK.bin; restituisce l'indice di blocco. */
  carica(buf: ArrayBuffer): number {
    return this.aggiungi(leggiSatelliti(buf));
  }

  /** Registra un file già letto (tipo 2, blocco 0..K-1). */
  aggiungi(file: FileSatelliti): number {
    const i = file.intestazione;
    const k = i.blocco;
    if (i.tipo !== TIPO_SATELLITI || !(k >= 0 && k < K)) throw new RangeError('file non di un blocco dei satelliti');
    if (i.inizio !== inizioBlocco(k) || i.fine !== fineBlocco(k)) throw new RangeError('nucleo del blocco non conforme');
    this.blocchi[k] = file;
    return k;
  }

  rimuovi(k: number): void {
    if (k >= 0 && k < K) this.blocchi[k] = null;
  }

  file(k: number): FileSatelliti | null {
    return k >= 0 && k < K ? (this.blocchi[k] ?? null) : null;
  }

  haBlocco(k: number): boolean {
    return k >= 0 && k < K && this.blocchi[k] !== null;
  }

  /** Vero se il blocco che contiene jdTT è caricato. */
  pronto(jdTT: number): boolean {
    const k = bloccoDi(jdTT);
    return k >= 0 && this.blocchi[k] !== null;
  }

  configurazione(ssid: number): ConfigSatellite | undefined {
    return this.config.get(ssid);
  }

  /**
   * Matrice per righe dal sistema F all'eclittica J2000 all'istante jdTT: Q(t)·R_F negli intervalli secolari dei
   * satelliti con piano che segue l'equatore del primario, R_F altrove. La velocità trascura dQ/dt (velocità angolare del
   * polo ≤ 1,3·10⁻¹² rad/s: errore relativo ≤ 3·10⁻⁸, Callisto). false (out invariato) se il satellite non è configurato.
   */
  matriceF(ssid: number, jdTT: number, out: Scrivibile): boolean {
    const c = this.config.get(ssid);
    if (c === undefined) return false;
    const m = this.matriceAllaData(c, jdTT);
    for (let i = 0; i < 9; i++) out[i] = m[i]!;
    return true;
  }

  /** R_F, oppure Q(t)·R_F nella memoria di lavoro se l'istante è in un intervallo secolare del piano mobile. */
  private matriceAllaData(c: ConfigSatellite, jdTT: number): ArrayLike<number> {
    const p = this.piani.get(c.ssid);
    if (p === undefined) return c.rF;
    const iv = p.intervalli;
    for (let j = 0; j < iv.length; j++) {
      const x = iv[j]!;
      if (!(jdTT >= x.inizio && jdTT < x.fine)) continue;
      poloWgccreEclittica(p.coefficienti, jdTT, poloData);
      rotazioneMinima(p.poliGiunzione[j]!, poloData, qLavoro);
      prodotto(qLavoro, c.rF, matriceLavoro);
      return matriceLavoro;
    }
    return c.rF;
  }

  /** Stato del modello (relativo al centro del pianeta, o al baricentro se circumbinario) nell'eclittica J2000. */
  private statoModello(c: ConfigSatellite, jdTT: number, out: Scrivibile): StatoEffemeride {
    const k = bloccoDi(jdTT);
    if (k < 0) return 'fuori-copertura';
    const f = this.blocchi[k];
    if (f === null || f === undefined) return 'caricamento';
    const esito = f.valutaF(c.ssid, c.frequenze, jdTT, statoF);
    if (esito !== 'ok') return esito;
    ruota(this.matriceAllaData(c, jdTT), statoF, out);
    return 'ok';
  }

  /**
   * Stato planetocentrico (rispetto al centro del primario) nell'eclittica J2000: out[0..2] km,
   * out[3..5] km/s. Esiti: 'fuori-copertura' fuori da [T0, T_END), 'caricamento' se il blocco non è
   * caricato, 'non-determinabile' se il satellite non è configurato o manca dal file.
   * Se l'esito non è 'ok' out non è modificato.
   */
  statoPlanetocentrico(ssid: number, jdTT: number, out: Scrivibile): StatoEffemeride {
    const c = this.config.get(ssid);
    if (c === undefined) return 'non-determinabile';
    const esito = this.statoModello(c, jdTT, statoE);
    if (esito !== 'ok') return esito;
    if (c.baricentrico) {
      const e2 = this.planetCenterOffset(c.primario, jdTT, offsetLavoro);
      if (e2 !== 'ok') return e2;
      for (let i = 0; i < 6; i++) out[i] = statoE[i]! - offsetLavoro[i]!;
      return 'ok';
    }
    for (let i = 0; i < 6; i++) out[i] = statoE[i]!;
    return 'ok';
  }

  /**
   * Scarto del centro del pianeta dal baricentro del sistema (§ 7.3.5), eclittica J2000:
   * r_centro - r_bar = -Σ GM_i·ρ_i / GM_sistema, con ρ_i planetocentriche dei satelliti del catalogo e
   * GM_sistema di DE441. Per i satelliti modellati rispetto al baricentro (ρ_b = ρ + offset) la
   * relazione si risolve in forma chiusa: offset = -(Σ_p GM·ρ + Σ_b GM·ρ_b)/(GM_sistema - Σ_b GM).
   * Corpo senza satelliti nel catalogo o senza GM di sistema in DE441 (ad esempio Eris, il cui rapporto
   * di massa con Disnomia non è noto): offset nullo.
   */
  planetCenterOffset(planetSsid: number, jdTT: number, out: Scrivibile): StatoEffemeride {
    const s = this.sistemi.get(planetSsid);
    if (s === undefined || s.membri.length === 0) {
      if (bloccoDi(jdTT) < 0) return 'fuori-copertura';
      for (let i = 0; i < 6; i++) out[i] = 0;
      return 'ok';
    }
    for (let i = 0; i < 6; i++) vett[i] = 0;
    let gmBar = 0;
    for (const c of s.membri) {
      const esito = this.statoModello(c, jdTT, statoMembro);
      if (esito !== 'ok') return esito;
      for (let i = 0; i < 6; i++) vett[i] = vett[i]! + c.gm * statoMembro[i]!;
      if (c.baricentrico) gmBar += c.gm;
    }
    const den = s.gmSistema - gmBar;
    for (let i = 0; i < 6; i++) out[i] = -vett[i]! / den;
    return 'ok';
  }

  /**
   * Elementi dell'orbita da disegnare (§ 10.2): ellisse del record che contiene jdTT (senza raccordo),
   * nel sistema eclittico J2000, relativa al primario e ancorata al corpo. forma = 'determinata'
   * (l'affidabilità la aggiorna il servizio).
   */
  orbitAt(ssid: number, jdTT: number, out: ElementiOrbita): StatoEffemeride {
    const c = this.config.get(ssid);
    if (c === undefined) return 'non-determinabile';
    const k = bloccoDi(jdTT);
    if (k < 0) return 'fuori-copertura';
    const f = this.blocchi[k];
    if (f === null || f === undefined) return 'caricamento';
    const j = f.indiceRecord(ssid, jdTT);
    if (j < 0) return f.contiene(ssid) ? 'fuori-copertura' : 'non-determinabile';
    const r = f.record(ssid)![j]!;
    elementiRecord(r, c.frequenze, jdTT, elLavoro);
    elementiOrbitaDaModello(elLavoro, this.matriceAllaData(c, jdTT), out);
    out.primario = c.primario;
    out.baricentrici = false;
    out.forma = 'determinata';
    return 'ok';
  }
}

/**
 * Conica nell'eclittica J2000 dagli elementi del modello nel sistema F: q, e, i, nodo, argomento del
 * pericentro e anomalia vera del corpo. Versori nel sistema F: f, g della base equinoziale (§ 7.2),
 * pericentro P = cos ϖ·f + sin ϖ·g, polo W = f × g.
 */
export function elementiOrbitaDaModello(el: ElementiModello, rF: ArrayLike<number>, out: ElementiOrbita): void {
  const fi = el.fattoreI;
  const tt = fi > 0 ? el.tanI2 : 1 / el.tanI2;
  const p = tt * Math.sin(el.omega);
  const q = tt * Math.cos(el.omega);
  const p2 = p * p;
  const q2 = q * q;
  const s2 = 1 + p2 + q2;
  const fx = (1 - p2 + q2) / s2;
  const fy = (2 * p * q) / s2;
  const fz = (-2 * fi * p) / s2;
  const gx = (2 * fi * p * q) / s2;
  const gy = ((1 + p2 - q2) * fi) / s2;
  const gz = (2 * q) / s2;
  const cv = Math.cos(el.varpi);
  const sv = Math.sin(el.varpi);
  // pericentro e polo in F
  vett[0] = cv * fx + sv * gx;
  vett[1] = cv * fy + sv * gy;
  vett[2] = cv * fz + sv * gz;
  vett[3] = fy * gz - fz * gy;
  vett[4] = fz * gx - fx * gz;
  vett[5] = fx * gy - fy * gx;
  // nell'eclittica J2000
  const px = rF[0]! * vett[0] + rF[1]! * vett[1] + rF[2]! * vett[2];
  const py = rF[3]! * vett[0] + rF[4]! * vett[1] + rF[5]! * vett[2];
  const pz = rF[6]! * vett[0] + rF[7]! * vett[1] + rF[8]! * vett[2];
  const wx = rF[0]! * vett[3] + rF[1]! * vett[4] + rF[2]! * vett[5];
  const wy = rF[3]! * vett[3] + rF[4]! * vett[4] + rF[5]! * vett[5];
  const wz = rF[6]! * vett[3] + rF[7]! * vett[4] + rF[8]! * vett[5];
  const wn = Math.sqrt(wx * wx + wy * wy + wz * wz);
  const i = Math.acos(Math.max(-1, Math.min(1, wz / wn)));
  // nodo ascendente: N = z × W
  let nx = -wy;
  let ny = wx;
  const nn = Math.sqrt(nx * nx + ny * ny);
  if (nn < 1e-15) {
    nx = 1;
    ny = 0;
  } else {
    nx /= nn;
    ny /= nn;
  }
  const nodo = nn < 1e-15 ? 0 : Math.atan2(ny, nx);
  // argomento del pericentro: angolo da N a P attorno a W
  const cw = nx * px + ny * py;
  const sw = (ny * pz * wx - nx * pz * wy + (nx * py - ny * px) * wz) / wn;
  const argPeri = Math.atan2(sw, cw);
  // anomalia vera: angolo dal pericentro alla posizione nel piano (f, g)
  const h = el.e * sv;
  const k = el.e * cv;
  const ff = risolviKeplero(el.lam, h, k);
  const cf = Math.cos(ff);
  const sf = Math.sin(ff);
  const beta = 1 / (1 + Math.sqrt(1 - h * h - k * k));
  const x1 = (1 - beta * h * h) * cf + h * k * beta * sf - k;
  const y1 = (1 - beta * k * k) * sf + h * k * beta * cf - h;
  // coordinate (f, g) del pericentro: (cos ϖ, sin ϖ); anomalia vera = atan2(P × r, P · r)
  const nu = Math.atan2(cv * y1 - sv * x1, cv * x1 + sv * y1);
  out.q = el.a * (1 - el.e);
  out.e = el.e;
  out.i = i;
  out.nodo = nodo < 0 ? nodo + 2 * Math.PI : nodo;
  out.argPeri = argPeri < 0 ? argPeri + 2 * Math.PI : argPeri;
  out.anomaliaVera = nu;
}
