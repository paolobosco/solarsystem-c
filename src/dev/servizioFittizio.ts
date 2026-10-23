// Servizi fittizi per sviluppare e provare il rendering (mai importati dal codice di produzione):
// catalogo da scripts/pipeline/bodies.json con raggi reali, EphemerisService kepleriano,
// orientamenti WGCCRE semplificati, affidabilità per età, tempo con ΔT approssimato.

import anagrafica from '../../scripts/pipeline/bodies.json';
import type { CategoriaCorpo, CorpoCatalogo, Texture } from '../data/catalogTypes';
import { GM_SOLE, J2000, OBLIQUITA_J2000_RAD, UA_KM } from '../ephem/constants';
import { conicaDaStato } from '../ephem/equinoctial';
import type { ElementiConica } from '../ephem/equinoctial';
import { risolviKeplerEllittico, risolviKeplerIperbolico } from '../ephem/kepler';
import type { Affidabilita, ElementiOrbita, EphemerisService, Livello, StatoEffemeride } from '../ephem/types';
import type { FornitoreOrientamento } from '../render/orientamento';
import type { TimeState } from '../time/types';
import { PIANETI_STANDISH, PICCOLI_M, PICCOLI_T, POLI_IAU, RAGGI_KM, ROTAZIONE_ORE, SATELLITI } from './datiFittizi';

const GRAD = Math.PI / 180;

interface VoceAnagrafica {
  ssid: number;
  slug: string;
  nome: string;
  nomeUfficiale: string | null;
  numero: number | null;
  designazione: string | null;
  categoria: CategoriaCorpo;
  categorieSecondarie: CategoriaCorpo[];
  primario: string | null;
  naif: number | null;
  sbdb: string | null;
  alias: string[];
}

/** Corpi con texture procedurale di prova (src/dev/textureFittizie.ts). */
export const CON_TEXTURE = new Set([
  'sole', 'mercurio', 'venere', 'terra', 'marte', 'giove', 'saturno', 'urano', 'nettuno', 'luna', 'io', 'europa',
  'ganimede', 'callisto', 'titano', 'plutone', 'caronte', 'cerere', 'vesta', 'tritone', 'itokawa',
]);

export function creaCatalogoFittizio(): CorpoCatalogo[] {
  const corpi = (anagrafica as { corpi: VoceAnagrafica[] }).corpi;
  return corpi.map((v) => {
    const r = RAGGI_KM[v.slug];
    const rot = ROTAZIONE_ORE[v.slug];
    const texture: Texture | null = CON_TEXTURE.has(v.slug)
      ? { file: `dev/${v.slug}.png`, lon0_u: 0.5, verso: 'est', fonte: 'procedurale di prova', licenza: 'nessuna', areeNonOsservate: 'nessuna' }
      : null;
    return {
      ssid: v.ssid,
      slug: v.slug,
      nome: v.nome,
      nomeUfficiale: v.nomeUfficiale,
      numero: v.numero,
      designazione: v.designazione,
      alias: v.alias,
      categoria: v.categoria,
      categorieSecondarie: v.categorieSecondarie,
      naif: v.naif,
      spkid: null,
      sbdb: v.sbdb,
      primario: v.primario,
      effemeridi: { modello: 'sole' },
      soluzione: { id: 'fittizia', data: null, estrazione: null, modelloNG: null, recordDastcom: null },
      fisica: {
        raggi_km: r ? { valore: r.r, incertezza: null, fonte: r.fonte, anno: null } : null,
        gm_km3s2: null,
        // Come in catalog.json: periodo negativo per le rotazioni retrograde.
        rotazione: rot !== undefined ? { valore: rot, incertezza: null, fonte: 'Archinal 2018', anno: 2018 } : null,
        albedo: null,
      },
      orientamento: { modello: 'fisso', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: false },
      texture,
      epsModelloCostante: null,
    };
  });
}

// --- Geometria ---

/** Rotazione ICRF → eclittica J2000 (I4). */
function daIcrf(x: number, y: number, z: number, out: Float64Array, off: number): void {
  const c = Math.cos(OBLIQUITA_J2000_RAD);
  const s = Math.sin(OBLIQUITA_J2000_RAD);
  out[off] = x;
  out[off + 1] = c * y + s * z;
  out[off + 2] = -s * y + c * z;
}

/** Matrice (per righe) corpo → eclittica per polo (α0, δ0) e angolo del meridiano W (rad). */
export function matricePolo(alfa: number, delta: number, w: number, out: Float64Array): void {
  const zx = Math.cos(delta) * Math.cos(alfa);
  const zy = Math.cos(delta) * Math.sin(alfa);
  const zz = Math.sin(delta);
  const qx = -Math.sin(alfa);
  const qy = Math.cos(alfa);
  const qz = 0;
  // z × Q
  const px = zy * qz - zz * qy;
  const py = zz * qx - zx * qz;
  const pz = zx * qy - zy * qx;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const xx = cw * qx + sw * px;
  const xy = cw * qy + sw * py;
  const xz = cw * qz + sw * pz;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const col = new Float64Array(9);
  daIcrf(xx, xy, xz, col, 0);
  daIcrf(yx, yy, yz, col, 3);
  daIcrf(zx, zy, zz, col, 6);
  // Colonne → per righe.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[3 * r + c] = col[3 * c + r]!;
}

const baseTmp = new Float64Array(6);

/** Stato su conica (q, e, i, Ω, ω) al tempo t con passaggio al pericentro T e μ (km³/s²). */
function statoConica(q: number, e: number, i: number, nodo: number, w: number, tp: number, mu: number, t: number, out: Float64Array, off = 0): void {
  const co = Math.cos(nodo);
  const so = Math.sin(nodo);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const ci = Math.cos(i);
  const si = Math.sin(i);
  baseTmp[0] = co * cw - so * sw * ci;
  baseTmp[1] = so * cw + co * sw * ci;
  baseTmp[2] = sw * si;
  baseTmp[3] = -co * sw - so * cw * ci;
  baseTmp[4] = -so * sw + co * cw * ci;
  baseTmp[5] = cw * si;
  let x: number;
  let y: number;
  let vx: number;
  let vy: number;
  const dt = (t - tp) * 86_400;
  if (e < 1) {
    const a = q / (1 - e);
    const n = Math.sqrt(mu / (a * a * a));
    const ea = risolviKeplerEllittico(n * dt, e);
    const b = a * Math.sqrt((1 - e) * (1 + e));
    const c = Math.cos(ea);
    const s = Math.sin(ea);
    const ed = n / (1 - e * c);
    x = a * (c - e);
    y = b * s;
    vx = -a * s * ed;
    vy = b * c * ed;
  } else {
    const a = q / (1 - e);
    const aa = -a;
    const n = Math.sqrt(mu / (aa * aa * aa));
    const h = risolviKeplerIperbolico(n * dt, e);
    const b = aa * Math.sqrt((e - 1) * (e + 1));
    const ch = Math.cosh(h);
    const sh = Math.sinh(h);
    const hd = n / (e * ch - 1);
    x = aa * (e - ch);
    y = b * sh;
    vx = -aa * sh * hd;
    vy = b * ch * hd;
  }
  out[off] = x * baseTmp[0] + y * baseTmp[3];
  out[off + 1] = x * baseTmp[1] + y * baseTmp[4];
  out[off + 2] = x * baseTmp[2] + y * baseTmp[5];
  out[off + 3] = vx * baseTmp[0] + vy * baseTmp[3];
  out[off + 4] = vx * baseTmp[1] + vy * baseTmp[4];
  out[off + 5] = vx * baseTmp[2] + vy * baseTmp[5];
}

type Definizione =
  | { tipo: 'sole' }
  | { tipo: 'pianeta'; el: number[]; tassi: number[] }
  | { tipo: 'satellite'; primario: number; a: number; e: number; i: number; n: number; l0: number; telaio: Float64Array | null; mu: number }
  | { tipo: 'conica'; q: number; e: number; i: number; nodo: number; w: number; tp: number; mu: number };

/** Satelliti senza rotazione sincrona (§ 7.5.5): orientamento non rappresentato. */
const IRREGOLARI = new Set(['imalia', 'febe', 'iperione', 'nereide', 'notte', 'idra', 'disnomia']);

export interface OpzioniEffemeridiFittizie {
  /** Livello forzato per corpo (slug → livello), per provare tratteggi e marcatori cavi. */
  livelli?: Record<string, Livello>;
}

export class EffemeridiFittizie implements EphemerisService {
  private readonly def: Definizione[];
  private readonly perSlug = new Map<string, number>();
  private readonly primari: number[];
  private readonly categorie: CategoriaCorpo[];
  readonly livelliForzati = new Map<number, Livello>();
  /** ssid per cui stateAt risponde 'caricamento' (prove del caricamento). */
  readonly inCaricamento = new Set<number>();
  private readonly tmp = new Float64Array(6);
  private readonly tmp2 = new Float64Array(6);
  private readonly relOrbita = new Float64Array(6);
  private readonly conica: ElementiConica = {
    q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0, a: 0, anomaliaMedia: 0, motoMedio: 0, tempoDalPericentro: 0,
  };

  constructor(catalogo: readonly CorpoCatalogo[], opz: OpzioniEffemeridiFittizie = {}) {
    for (const c of catalogo) this.perSlug.set(c.slug, c.ssid);
    const ordinati = [...catalogo].sort((a, b) => a.ssid - b.ssid);
    this.primari = ordinati.map((c) => (c.primario ? (this.perSlug.get(c.primario) ?? -1) : -1));
    this.categorie = ordinati.map((c) => c.categoria);
    this.def = ordinati.map((c) => this.definisci(c));
    for (const [slug, l] of Object.entries(opz.livelli ?? {})) {
      const s = this.perSlug.get(slug);
      if (s !== undefined) this.livelliForzati.set(s, l);
    }
  }

  private definisci(c: CorpoCatalogo): Definizione {
    if (c.categoria === 'sole') return { tipo: 'sole' };
    const pl = PIANETI_STANDISH[c.slug];
    if (pl) return { tipo: 'pianeta', el: pl[0], tassi: pl[1] };
    const sat = SATELLITI[c.slug];
    if (sat) {
      const primario = this.perSlug.get(c.primario ?? '') ?? 0;
      const polo = POLI_IAU[c.primario ?? ''];
      let telaio: Float64Array | null = null;
      if (polo && c.slug !== 'luna' && c.slug !== 'disnomia') {
        telaio = new Float64Array(9);
        matricePolo(polo[0] * GRAD, polo[1] * GRAD, 0, telaio);
      }
      const n = (2 * Math.PI) / (sat[3] * 86_400);
      return { tipo: 'satellite', primario, a: sat[0], e: sat[1], i: sat[2] * GRAD, n, l0: sat[4] * GRAD, telaio, mu: n * n * sat[0] ** 3 };
    }
    const m = PICCOLI_M[c.slug];
    if (m) {
      const a = m[0] * UA_KM;
      const n = Math.sqrt(GM_SOLE / (a * a * a)) * 86_400;
      return { tipo: 'conica', q: a * (1 - m[1]), e: m[1], i: m[2] * GRAD, nodo: m[3] * GRAD, w: m[4] * GRAD, tp: J2000 - (m[5] * GRAD) / n, mu: GM_SOLE };
    }
    const t = PICCOLI_T[c.slug];
    if (t) return { tipo: 'conica', q: t[0] * UA_KM, e: t[1], i: t[2] * GRAD, nodo: t[3] * GRAD, w: t[4] * GRAD, tp: t[5], mu: GM_SOLE };
    return { tipo: 'conica', q: 3 * UA_KM, e: 0.1, i: 0.1, nodo: 0, w: 0, tp: J2000, mu: GM_SOLE };
  }

  /** Stato relativo al primario (km, km/s) e μ della conica. */
  private relativo(ssid: number, jd: number, out: Float64Array): number {
    const d = this.def[ssid]!;
    switch (d.tipo) {
      case 'sole':
        out.fill(0);
        return GM_SOLE;
      case 'pianeta': {
        const tc = (jd - J2000) / 36_525;
        const a = (d.el[0]! + d.tassi[0]! * tc) * UA_KM;
        const e = d.el[1]! + d.tassi[1]! * tc;
        const i = (d.el[2]! + d.tassi[2]! * tc) * GRAD;
        const l = (d.el[3]! + d.tassi[3]! * tc) * GRAD;
        const varpi = (d.el[4]! + d.tassi[4]! * tc) * GRAD;
        const nodo = (d.el[5]! + d.tassi[5]! * tc) * GRAD;
        const n = (d.tassi[3]! * GRAD) / 36_525; // rad/d
        const mu = (n / 86_400) ** 2 * a ** 3;
        const mAnom = l - varpi;
        statoConica(a * (1 - e), e, i, nodo, varpi - nodo, jd - mAnom / n, mu, jd, out);
        return mu;
      }
      case 'satellite': {
        const ld = d.l0 + d.n * (jd - J2000) * 86_400;
        let nodo = 0;
        let w = 0;
        if (d.telaio === null && this.def[d.primario]!.tipo === 'pianeta') {
          // Luna: nodo in regressione (18,6 anni) e perigeo in avanzamento (8,85 anni), valori medi.
          const g = jd - J2000;
          nodo = (125.04 - 0.0529538083 * g) * GRAD;
          w = (318.15 + 0.1643573223 * g) * GRAD;
        }
        const mAnom = ld - nodo - w;
        statoConica(d.a * (1 - d.e), d.e, d.i, nodo, w, jd - mAnom / (d.n * 86_400), d.mu, jd, this.tmp2);
        if (d.telaio) {
          const m = d.telaio;
          for (let k = 0; k < 2; k++) {
            const o = 3 * k;
            const x = this.tmp2[o]!;
            const y = this.tmp2[o + 1]!;
            const z = this.tmp2[o + 2]!;
            out[o] = m[0]! * x + m[1]! * y + m[2]! * z;
            out[o + 1] = m[3]! * x + m[4]! * y + m[5]! * z;
            out[o + 2] = m[6]! * x + m[7]! * y + m[8]! * z;
          }
        } else {
          out.set(this.tmp2);
        }
        return d.mu;
      }
      case 'conica':
        statoConica(d.q, d.e, d.i, d.nodo, d.w, d.tp, d.mu, jd, out);
        return d.mu;
    }
  }

  stateAt(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride {
    if (ssid < 0 || ssid >= this.def.length) return 'non-determinabile';
    if (this.inCaricamento.has(ssid)) return 'caricamento';
    if (this.livelliForzati.get(ssid) === 'non-determinabile') return 'non-determinabile';
    this.relativo(ssid, jdTT, out);
    // Somma lungo la catena dei primari (il Sole è nell'origine).
    for (let p = this.primari[ssid]!; p > 0; p = this.primari[p]!) {
      this.relativo(p, jdTT, this.tmp);
      for (let k = 0; k < 6; k++) out[k] = out[k]! + this.tmp[k]!;
    }
    return 'ok';
  }

  orbitAt(ssid: number, jdTT: number, out: ElementiOrbita): StatoEffemeride {
    if (ssid < 0 || ssid >= this.def.length || this.def[ssid]!.tipo === 'sole') return 'non-determinabile';
    const rel = this.relOrbita;
    const mu = this.relativo(ssid, jdTT, rel);
    if (!conicaDaStato(rel, mu, this.conica)) return 'non-determinabile';
    const c = this.conica;
    out.primario = Math.max(0, this.primari[ssid]!);
    const r = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
    out.baricentrici = out.primario === 0 && r > 50 * UA_KM;
    out.q = c.q;
    out.e = c.e;
    out.i = c.i;
    out.nodo = c.nodo;
    out.argPeri = c.argPeri;
    out.forma = 'determinata';
    out.anomaliaVera = this.livelliForzati.get(ssid) === 'non-determinabile' ? Number.NaN : c.anomaliaVera;
    return 'ok';
  }

  affidabilita(ssid: number, t: TimeState, out: Affidabilita): void {
    const forzato = this.livelliForzati.get(ssid);
    const anni = Math.abs((t.jdTT - J2000) / 365.25);
    const cat = this.categorie[ssid];
    let eps: number;
    if (cat === 'sole') eps = 0;
    else if (cat === 'pianeta') eps = 2 / 206_265;
    else if (cat === 'luna') eps = (60 + 0.002 * anni * anni) / 206_265;
    else if (cat === 'cometa' || cat === 'interstellare') eps = 1e-6 * (1 + (anni / 50) ** 3);
    else eps = 1e-7 * (1 + (anni / 300) ** 3);
    let liv: Livello = eps <= Math.PI / 10_800 ? 'precisa' : eps <= GRAD ? 'buona' : eps <= 10 * GRAD ? 'approssimata' : eps <= 90 * GRAD ? 'indicativa' : 'non-determinabile';
    if (forzato) {
      liv = forzato;
      eps = forzato === 'precisa' ? 1e-5 : forzato === 'buona' ? 0.5 * GRAD : forzato === 'approssimata' ? 5 * GRAD : forzato === 'indicativa' ? 25 * GRAD : Math.PI;
    }
    out.livello = liv;
    out.epsModello = eps;
    out.epsDeltaT = 0;
    out.epsTotale = eps;
  }

  prefetch(): Promise<void> {
    return Promise.resolve();
  }

  pronto(): boolean {
    return true;
  }

  /** Stato relativo al primario, per l'orientamento sincrono. */
  statoRelativo(ssid: number, jd: number, out: Float64Array): void {
    this.relativo(ssid, jd, out);
  }

  slug(s: string): number {
    const v = this.perSlug.get(s);
    if (v === undefined) throw new Error(`slug sconosciuto: ${s}`);
    return v;
  }
}

/** Orientamenti fittizi: WGCCRE semplificato per i corpi principali, rotazione sincrona per i satelliti regolari. */
export class OrientamentoFittizio implements FornitoreOrientamento {
  /** Se vero, gli orientamenti non dipendono dal tempo (prove di stabilità). */
  fissi = false;
  private readonly slug: string[];
  private readonly categorie: CategoriaCorpo[];
  private readonly rel = new Float64Array(6);

  constructor(
    catalogo: readonly CorpoCatalogo[],
    private readonly eff: EffemeridiFittizie,
  ) {
    const ord = [...catalogo].sort((a, b) => a.ssid - b.ssid);
    this.slug = ord.map((c) => c.slug);
    this.categorie = ord.map((c) => c.categoria);
  }

  orientamento(ssid: number, t: TimeState, out: Float64Array): boolean {
    const slug = this.slug[ssid]!;
    const jd = this.fissi ? J2000 : slug === 'terra' ? t.jdUT : t.jdTT;
    const p = POLI_IAU[slug];
    if (p) {
      const w = (p[2] + p[3] * (jd - J2000)) * GRAD;
      matricePolo(p[0] * GRAD, p[1] * GRAD, w, out);
      return true;
    }
    if (this.categorie[ssid] === 'luna' && !IRREGOLARI.has(slug)) {
      this.eff.statoRelativo(ssid, jd, this.rel);
      const r = this.rel;
      const d = Math.hypot(r[0]!, r[1]!, r[2]!) || 1;
      const xx = -r[0]! / d;
      const xy = -r[1]! / d;
      const xz = -r[2]! / d;
      let zx = r[1]! * r[5]! - r[2]! * r[4]!;
      let zy = r[2]! * r[3]! - r[0]! * r[5]!;
      let zz = r[0]! * r[4]! - r[1]! * r[3]!;
      const nz = Math.hypot(zx, zy, zz) || 1;
      zx /= nz;
      zy /= nz;
      zz /= nz;
      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;
      out[0] = xx;
      out[1] = yx;
      out[2] = zx;
      out[3] = xy;
      out[4] = yy;
      out[5] = zy;
      out[6] = xz;
      out[7] = yz;
      out[8] = zz;
      return true;
    }
    return false;
  }
}

/** TimeState di sviluppo: ΔT = 69,2 s dopo il 2020, altrove la parabola di Morrison e Stephenson (2004). */
export function tempoFittizio(jdUT: number, scala: 'UT' | 'TT' = 'UT'): TimeState {
  const y = 2000 + (jdUT - J2000) / 365.25;
  const u = (y - 1820) / 100;
  const deltaT = y >= 2020 ? 69.2 : y >= 1900 ? 30 + 0.39 * (y - 1900) : -20 + 32 * u * u;
  const sigma = 0.8 * ((y - 1825) / 100) ** 2;
  return { jdUT, jdTT: scala === 'TT' ? jdUT : jdUT + deltaT / 86_400, deltaT, deltaTSigma: sigma, scalaIngresso: scala };
}
