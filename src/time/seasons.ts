// Stagione astronomica (§ 11.4.3, § 7.7 di docs/PROGETTO.md) dallo stato eliocentrico della Terra.
// Longitudine apparente geocentrica del Sole sull'eclittica e sull'equinozio veri della data, la grandezza degli
// istanti ufficiali di equinozi e solstizi (Astronomical Almanac, USNO): direzione Terra-Sole -r + (|r|/c)·v
// (aberrazione annua al primo ordine con la velocità eliocentrica della Terra, tempo luce del Sole compreso), ruotata
// sull'eclittica e sull'equinozio medi della data (Vondrák, Capitaine, Wallace 2011, 2012: eraLtecm), più la
// nutazione in longitudine Δψ (IAU 2000B, src/time/nutation.ts). Stagione boreale: primavera da 0°, estate da 90°,
// autunno da 180°, inverno da 270°.
// Giorni dall'evento: t - t_evento, con t_evento radice di λ(t) = q·90° (metodo di Newton sugli stati della Terra
// forniti dal chiamante). Senza stati all'istante dell'evento: stima con la conica osculante del moto Terra-Sole
// (μ = GM_Sole + GM_Terra-Luna, DE441), errore fino a circa 0,05 d. Restituisce codici e numeri; i testi li compone
// l'interfaccia. Stesso algoritmo di stagione_kepler e istante_evento in scripts/pipeline/time_model.py.

import { C_KM_S, GIORNO_S, MU_ELIO_KM3_S2, OBLIQUITA_J2000_RAD } from '../ephem/constants';
import { nutazioneLongitudine } from './nutation';
import { eclitticaDataAJ2000, epocaGiuliana, ltpb, ltpecl, ltpequ } from './precession';

export type CodiceStagione = 'primavera' | 'estate' | 'autunno' | 'inverno';
export type EventoStagione = 'equinozio' | 'solstizio';

/** Stato eliocentrico della Terra (eclittica J2000: km, km/s) all'istante JD TT; falso se non disponibile. */
export type FornitoreStatoTerra = (jdTT: number, out: Float64Array) => boolean;

export interface InfoStagione {
  /** Stagione boreale. */
  stagione: CodiceStagione;
  /** Evento che apre la stagione: equinozio (primavera, autunno) o solstizio (estate, inverno). */
  evento: EventoStagione;
  /** 0 primavera, 1 estate, 2 autunno, 3 inverno. */
  quadrante: 0 | 1 | 2 | 3;
  /** Giorni interi trascorsi dall'evento (≥ 0). */
  giorniDopo: number;
  /** Giorni trascorsi dall'evento, con frazione. */
  giorniDopoEsatti: number;
  /** Istante dell'evento (JD TT). */
  istanteEvento: number;
  /** Vero se l'istante dell'evento è risolto sugli stati della Terra; falso con la stima kepleriana. */
  eventoRisolto: boolean;
  /** Longitudine apparente geocentrica del Sole, eclittica ed equinozio veri della data, rad in [0, 2π). */
  longitudineSole: number;
}

const STAGIONI: readonly CodiceStagione[] = ['primavera', 'estate', 'autunno', 'inverno'];
const EVENTI: readonly EventoStagione[] = ['equinozio', 'solstizio', 'equinozio', 'solstizio'];
const D2PI = 2 * Math.PI;
const MEZZO_PI = Math.PI / 2;
const MU = MU_ELIO_KM3_S2[3]!;
/** Convergenza del metodo di Newton sull'istante dell'evento: 1e-7 d (9 ms). */
const TOLLERANZA_EVENTO_D = 1e-7;
const ITERAZIONI_EVENTO = 8;
/** Scarto massimo accettato tra l'istante risolto e la stima kepleriana (d). */
const SCARTO_MAX_STIMA_D = 1;

const m = new Float64Array(9);
const polo = new Float64Array(3);
const poloEcl = new Float64Array(3);
const r = new Float64Array(3);
const v = new Float64Array(3);
const statoEvento = new Float64Array(6);

/** Vettore -x (posizione o velocità della Terra) nell'eclittica e nell'equinozio della data: out = Mᵀ·(-x). */
function versoData(x: ArrayLike<number>, off: number, out: Float64Array): void {
  const a = -x[off]!;
  const b = -x[off + 1]!;
  const c = -x[off + 2]!;
  out[0] = m[0]! * a + m[3]! * b + m[6]! * c;
  out[1] = m[1]! * a + m[4]! * b + m[7]! * c;
  out[2] = m[2]! * a + m[5]! * b + m[8]! * c;
}

function riduci(x: number): number {
  const y = x % D2PI;
  return y < 0 ? y + D2PI : y;
}

/**
 * Riempie r (Sole - Terra) e v (velocità del Sole rispetto alla Terra) nell'eclittica e nell'equinozio medi della
 * data; restituisce la longitudine apparente (rad, [0, 2π)).
 */
function longitudineApparente(statoTerra: ArrayLike<number>, jdTT: number): number {
  eclitticaDataAJ2000(epocaGiuliana(jdTT), m);
  versoData(statoTerra, 0, r);
  versoData(statoTerra, 3, v);
  // Direzione apparente: -r_Terra + (|r|/c)·v_Terra = r - (|r|/c)·v (v qui è -v_Terra).
  const tau = Math.hypot(r[0]!, r[1]!, r[2]!) / C_KM_S;
  return riduci(Math.atan2(r[1]! - tau * v[1]!, r[0]! - tau * v[0]!) + nutazioneLongitudine(jdTT));
}

/** Longitudine apparente geocentrica del Sole (rad, [0, 2π)) dallo stato eliocentrico della Terra (eclittica J2000). */
export function longitudineSole(statoTerra: ArrayLike<number>, jdTT: number): number {
  if (statoTerra.length < 6) throw new RangeError('servono posizione e velocità della Terra');
  return longitudineApparente(statoTerra, jdTT);
}

function anomaliaMedia(nu: number, e: number): number {
  const ecc = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  return ecc - e * Math.sin(ecc);
}

/** Velocità angolare geocentrica del Sole (rad/d) dai vettori r, v della data. */
function velocitaAngolare(): number {
  const hz = r[0]! * v[1]! - r[1]! * v[0]!;
  return (hz / (r[0]! * r[0]! + r[1]! * r[1]!)) * GIORNO_S;
}

/** Istante (JD TT) in cui la longitudine apparente vale q·90°, da tStima; NaN se gli stati non sono disponibili. */
function risolviEvento(fornitore: FornitoreStatoTerra, q: number, tStima: number): number {
  const obiettivo = q * MEZZO_PI;
  let t = tStima;
  for (let i = 0; i < ITERAZIONI_EVENTO; i++) {
    if (!fornitore(t, statoEvento)) return Number.NaN;
    let d = longitudineApparente(statoEvento, t) - obiettivo;
    d -= D2PI * Math.round(d / D2PI);
    const passo = d / velocitaAngolare();
    t -= passo;
    if (!Number.isFinite(t) || Math.abs(t - tStima) > SCARTO_MAX_STIMA_D) return Number.NaN;
    if (Math.abs(passo) < TOLLERANZA_EVENTO_D) return t;
  }
  return t;
}

/**
 * Stagione astronomica dallo stato eliocentrico della Terra (eclittica J2000: km, km/s) all'istante jdTT.
 * Con il fornitore degli stati della Terra l'istante dell'evento è risolto (stagioneAstronomica è allora pura se lo
 * è il fornitore); senza fornitore, o se non ha lo stato, stima kepleriana.
 */
export function stagioneAstronomica(statoTerra: ArrayLike<number>, jdTT: number, fornitore?: FornitoreStatoTerra): InfoStagione {
  if (statoTerra.length < 6) throw new RangeError('servono posizione e velocità della Terra');
  const lam = longitudineApparente(statoTerra, jdTT);
  let q = Math.floor(lam / MEZZO_PI);
  if (q > 3) q = 3;
  // Stima kepleriana: longitudine geometrica all'evento = geometrica attuale - (λ - q·90°).
  const lamGeo = Math.atan2(r[1]!, r[0]!);
  const delta = lam - q * MEZZO_PI;
  const rr = Math.hypot(r[0]!, r[1]!, r[2]!);
  const v2 = v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!;
  const rv = r[0]! * v[0]! + r[1]! * v[1]! + r[2]! * v[2]!;
  const k1 = v2 - MU / rr;
  const ex = (k1 * r[0]! - rv * v[0]!) / MU;
  const ey = (k1 * r[1]! - rv * v[1]!) / MU;
  const e = Math.hypot(ex, ey);
  const perigeo = Math.atan2(ey, ex);
  const a = 1 / (2 / rr - v2 / MU);
  const n = Math.sqrt(MU / (a * a * a)) * GIORNO_S;
  let dm = anomaliaMedia(lamGeo - perigeo, e) - anomaliaMedia(lamGeo - delta - perigeo, e);
  dm -= D2PI * Math.round(dm / D2PI);
  if (dm < 0) dm = 0;
  let istante = jdTT - dm / n;
  let risolto = false;
  if (fornitore !== undefined) {
    const t = risolviEvento(fornitore, q, istante);
    if (!Number.isNaN(t)) {
      istante = t;
      risolto = true;
    }
  }
  return composta(q, jdTT, istante, risolto, lam);
}

function composta(q: number, jdTT: number, istante: number, risolto: boolean, lam: number): InfoStagione {
  const giorni = Math.max(0, jdTT - istante);
  const quadrante = q as 0 | 1 | 2 | 3;
  return {
    stagione: STAGIONI[quadrante]!,
    evento: EVENTI[quadrante]!,
    quadrante,
    giorniDopo: Math.floor(giorni),
    giorniDopoEsatti: giorni,
    istanteEvento: istante,
    eventoRisolto: risolto,
    longitudineSole: lam,
  };
}

/**
 * Calcolo della stagione con memoria dell'ultimo evento risolto: lo stesso evento (stesso quadrante, stima
 * kepleriana entro 0,5 d) non richiede nuovi stati della Terra.
 */
export function creaCalcoloStagione(fornitore: FornitoreStatoTerra): (statoTerra: ArrayLike<number>, jdTT: number) => InfoStagione {
  let qMemo = -1;
  let istanteMemo = Number.NaN;
  return (statoTerra, jdTT) => {
    const stima = stagioneAstronomica(statoTerra, jdTT);
    if (stima.quadrante === qMemo && Math.abs(stima.istanteEvento - istanteMemo) < 0.5) {
      return composta(qMemo, jdTT, istanteMemo, true, stima.longitudineSole);
    }
    const t = risolviEvento(fornitore, stima.quadrante, stima.istanteEvento);
    if (Number.isNaN(t)) return stima;
    qMemo = stima.quadrante;
    istanteMemo = t;
    return composta(qMemo, jdTT, t, true, stima.longitudineSole);
  };
}

/** Obliquità media della data (rad): angolo tra i poli dell'equatore e dell'eclittica di Vondrák et al. (2011). */
export function obliquitaMedia(epj: number): number {
  ltpequ(epj, polo);
  ltpecl(epj, poloEcl);
  const d = polo[0]! * poloEcl[0]! + polo[1]! * poloEcl[1]! + polo[2]! * poloEcl[2]!;
  return Math.acos(d > 1 ? 1 : d < -1 ? -1 : d);
}

const pb = new Float64Array(9);
const COS_E0 = Math.cos(OBLIQUITA_J2000_RAD);
const SIN_E0 = Math.sin(OBLIQUITA_J2000_RAD);

/** Declinazione geometrica del Sole (rad) sull'equatore medio della data (eraLtpb). */
export function declinazioneSole(statoTerra: ArrayLike<number>, jdTT: number): number {
  ltpb(epocaGiuliana(jdTT), pb);
  // Sole - Terra nel GCRS: R_x(ε0)ᵀ·(-r).
  const x = -statoTerra[0]!;
  const ye = -statoTerra[1]!;
  const ze = -statoTerra[2]!;
  const y = COS_E0 * ye - SIN_E0 * ze;
  const z = SIN_E0 * ye + COS_E0 * ze;
  const zd = pb[6]! * x + pb[7]! * y + pb[8]! * z;
  return Math.asin(zd / Math.hypot(x, y, z));
}
