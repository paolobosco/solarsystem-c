// Orientamento dei corpi (§ 7.5.5, § 7.6.4, § 7.7, R10 di docs/PROGETTO.md), senza allocazioni.
// Convenzione: matrice 3×3 per righe che porta le coordinate fisse nel corpo all'eclittica J2000 della scena;
// le colonne sono gli assi del corpo: x (meridiano 0), y (90° est), z (polo secondo convenzionePolo).
// - WGCCRE (Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22, con la correzione del 2019):
//   α0, δ0 polinomi in T (secoli giuliani da J2000 TDB), W polinomio in d (giorni), più termini periodici;
//   ICRF -> corpo = R3(W)·R1(90° - δ0)·R3(90° + α0); ICRF -> eclittica = R1(ε0), ε0 = 84 381,448″ (I4).
// - Rotazione sincrona: x verso il primario (direzione proiettata sul piano dell'orbita), z polo dell'orbita.
// - Assi fissi: identità (assi allineati all'eclittica J2000, dichiarati come convenzione).
// - Terra (Vondrák, src/time/earthRotation.ts), Luna (Cassini, src/ephem/moon.ts) e satelliti sincroni (modello
//   dei satelliti) sono forniti dall'esterno: bodyFixedToScene delega ai fornitori iniettati.

import type { CoefficientiWgccre, CorpoCatalogo, ModelloOrientamento } from '../data/catalogTypes';
import type { TimeState } from '../time/types';
import { GIORNI_SECOLO_GIULIANO, J2000, OBLIQUITA_J2000_RAD } from './constants';

const GRADI = Math.PI / 180;
const CE = Math.cos(OBLIQUITA_J2000_RAD);
const SE = Math.sin(OBLIQUITA_J2000_RAD);

/** Intervallo in cui i poli e le fasi WGCCRE non sono indicativi (§ 7.7): 1600-01-01 - 2121-01-01 (JD TT). */
export const JD_WGCCRE_INIZIO = 2_305_447.5;
export const JD_WGCCRE_FINE = 2_495_760.5;

/** Angoli WGCCRE in gradi (W ridotto a [0, 360)). */
export interface AngoliWgccre {
  alfa0: number;
  delta0: number;
  w: number;
}

function polinomio(c: readonly number[], x: number): number {
  let s = 0;
  for (let k = c.length - 1; k >= 0; k--) s = s * x + c[k]!;
  return s;
}

/** α0, δ0, W (gradi) all'istante TDB; W ridotto modulo 360° in modo esatto prima dei termini periodici. */
export function angoliWgccre(c: CoefficientiWgccre, jdTT: number, out: AngoliWgccre): AngoliWgccre {
  const d = jdTT - J2000;
  const t = d / GIORNI_SECOLO_GIULIANO;
  let a = polinomio(c.alfa0, t);
  let de = polinomio(c.delta0, t);
  let w = polinomio(c.w, d) % 360;
  for (const p of c.periodici) {
    const x = p.unita === 'secolo' ? t : d;
    const arg = (p.argomento[0] + p.argomento[1] * x) * GRADI;
    const v = p.ampiezza * (p.funzione === 'sin' ? Math.sin(arg) : Math.cos(arg));
    if (p.coordinata === 'alfa0') a += v;
    else if (p.coordinata === 'delta0') de += v;
    else w += v;
  }
  out.alfa0 = a;
  out.delta0 = de;
  w %= 360;
  out.w = w < 0 ? w + 360 : w;
  return out;
}

/** Matrice corpo -> eclittica J2000 dagli angoli WGCCRE (gradi). */
export function matriceDaAngoli(alfa0: number, delta0: number, w: number, out: Float64Array): void {
  const ca = -Math.sin(alfa0 * GRADI); // cos(90° + α0)
  const sa = Math.cos(alfa0 * GRADI); // sin(90° + α0)
  const cb = Math.sin(delta0 * GRADI); // cos(90° - δ0)
  const sb = Math.cos(delta0 * GRADI); // sin(90° - δ0)
  const cw = Math.cos(w * GRADI);
  const sw = Math.sin(w * GRADI);
  // righe di R1(b)·R3(a)
  const r0x = ca;
  const r0y = sa;
  const r1x = -cb * sa;
  const r1y = cb * ca;
  const r1z = sb;
  // assi del corpo in ICRF: x = cw·r0 + sw·r1, y = -sw·r0 + cw·r1, z = r2
  const xx = cw * r0x + sw * r1x;
  const xy = cw * r0y + sw * r1y;
  const xz = sw * r1z;
  const yx = -sw * r0x + cw * r1x;
  const yy = -sw * r0y + cw * r1y;
  const yz = cw * r1z;
  const zx = sb * sa;
  const zy = -sb * ca;
  const zz = cb;
  // colonne = assi ruotati nell'eclittica: (x, c·y + s·z, -s·y + c·z)
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = CE * xy + SE * xz;
  out[4] = CE * yy + SE * yz;
  out[5] = CE * zy + SE * zz;
  out[6] = -SE * xy + CE * xz;
  out[7] = -SE * yy + CE * yz;
  out[8] = -SE * zy + CE * zz;
}

const angoli: AngoliWgccre = { alfa0: 0, delta0: 0, w: 0 };

/** Matrice corpo -> eclittica J2000 del modello WGCCRE all'istante TDB. */
export function matriceWgccre(c: CoefficientiWgccre, jdTT: number, out: Float64Array): void {
  angoliWgccre(c, jdTT, angoli);
  matriceDaAngoli(angoli.alfa0, angoli.delta0, angoli.w, out);
}

/** Versore del polo WGCCRE (α0, δ0) all'istante TDB nell'eclittica J2000. */
export function poloWgccreEclittica(c: CoefficientiWgccre, jdTT: number, out: Float64Array): void {
  angoliWgccre(c, jdTT, angoli);
  const a = angoli.alfa0 * GRADI;
  const d = angoli.delta0 * GRADI;
  const y = Math.cos(d) * Math.sin(a);
  const z = Math.sin(d);
  out[0] = Math.cos(d) * Math.cos(a);
  out[1] = CE * y + SE * z;
  out[2] = -SE * y + CE * z;
}

/**
 * Rotazione sincrona (§ 7.5.5): z lungo il polo dell'orbita, x verso il primario proiettato sul piano
 * perpendicolare al polo, y = z × x. Vettori nell'eclittica J2000, di lunghezza qualsiasi.
 * Restituisce false (out invariato) se i vettori sono nulli o paralleli.
 */
export function matriceSincrona(versoPrimario: ArrayLike<number>, poloOrbita: ArrayLike<number>, out: Float64Array): boolean {
  let zx = poloOrbita[0]!;
  let zy = poloOrbita[1]!;
  let zz = poloOrbita[2]!;
  const nz = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (!(nz > 0)) return false;
  zx /= nz;
  zy /= nz;
  zz /= nz;
  const px = versoPrimario[0]!;
  const py = versoPrimario[1]!;
  const pz = versoPrimario[2]!;
  const pn = px * zx + py * zy + pz * zz;
  let xx = px - pn * zx;
  let xy = py - pn * zy;
  let xz = pz - pn * zz;
  const nx = Math.sqrt(xx * xx + xy * xy + xz * xz);
  const np = Math.sqrt(px * px + py * py + pz * pz);
  if (!(nx > 1e-12 * np)) return false;
  xx /= nx;
  xy /= nx;
  xz /= nx;
  out[0] = xx;
  out[3] = xy;
  out[6] = xz;
  out[1] = zy * xz - zz * xy;
  out[4] = zz * xx - zx * xz;
  out[7] = zx * xy - zy * xx;
  out[2] = zx;
  out[5] = zy;
  out[8] = zz;
  return true;
}

export function identita(out: Float64Array): void {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
}

/** Fornitori esterni dell'orientamento (scrivono la matrice corpo -> eclittica J2000 per righe). */
export interface FornitoriOrientamento {
  /** Terra: polo medio di Vondrák e GST (src/time/earthRotation.ts); t completo quando disponibile (UT1). */
  terra?: (jdTT: number, out: Float64Array, t?: TimeState) => boolean;
  /** Luna: leggi di Cassini (src/ephem/moon.ts, EffemeridiLuna.orientamento). */
  luna?: (jdTT: number, out: Float64Array) => boolean;
  /**
   * Satelliti sincroni: direzione dal satellite al pianeta e polo dell'orbita media (eclittica J2000), dal modello
   * dei satelliti (§ 7.5.2).
   */
  sincrono?: (ssid: number, jdTT: number, versoPrimario: Float64Array, poloOrbita: Float64Array) => boolean;
}

/** Corpi con fase W arbitraria a lungo termine (§ 7.7): Giove, Saturno, Urano, Nettuno (codici NAIF). */
const NAIF_FASE_ARBITRARIA = new Set([599, 699, 799, 899]);

/** Orientamento di tutti i corpi del catalogo, con fornitori esterni per Terra, Luna e satelliti sincroni. */
export class ServizioOrientamento {
  private readonly corpi: readonly CorpoCatalogo[];
  private fornitori: FornitoriOrientamento;
  private readonly verso = new Float64Array(3);
  private readonly polo = new Float64Array(3);

  constructor(corpi: readonly CorpoCatalogo[], fornitori: FornitoriOrientamento = {}) {
    this.corpi = corpi;
    this.fornitori = { ...fornitori };
  }

  /** Aggiunge o sostituisce fornitori (ad esempio dopo il caricamento di moon.bin o time.json). */
  impostaFornitori(f: Partial<FornitoriOrientamento>): void {
    this.fornitori = { ...this.fornitori, ...f };
  }

  modello(ssid: number): ModelloOrientamento | null {
    return this.corpi[ssid]?.orientamento.modello ?? null;
  }

  /**
   * Matrice corpo -> eclittica J2000 (R10). false se il corpo non ha un modello o il fornitore non è disponibile:
   * in quel caso out contiene l'identità (assi fissi allineati all'eclittica J2000).
   */
  bodyFixedToScene(ssid: number, jdTT: number, out: Float64Array, t?: TimeState): boolean {
    const c = this.corpi[ssid];
    if (c === undefined) {
      identita(out);
      return false;
    }
    const o = c.orientamento;
    let ok = false;
    switch (o.modello) {
      case 'wgccre':
        if (o.coefficienti !== null) {
          matriceWgccre(o.coefficienti, jdTT, out);
          ok = true;
        }
        break;
      case 'vondrak':
        ok = this.fornitori.terra?.(jdTT, out, t) ?? false;
        break;
      case 'cassini':
        ok = this.fornitori.luna?.(jdTT, out) ?? false;
        break;
      case 'sincrono':
        ok = (this.fornitori.sincrono?.(ssid, jdTT, this.verso, this.polo) ?? false) && matriceSincrona(this.verso, this.polo, out);
        break;
      case 'fisso':
        if (o.coefficienti !== null) {
          matriceWgccre(o.coefficienti, jdTT, out);
          ok = true;
        }
        break;
    }
    if (!ok) identita(out);
    return ok;
  }

  /** Forma attesa dal rendering (FornitoreOrientamento di src/render/orientamento.ts). */
  orientamento(ssid: number, t: TimeState, out: Float64Array): boolean {
    return this.bodyFixedToScene(ssid, t.jdTT, out, t);
  }

  /** Vero se polo e fase sono indicativi: flag del catalogo, o modello WGCCRE fuori da 1600-2121 (§ 7.6.4, § 7.7). */
  indicativo(ssid: number, jdTT: number): boolean {
    const c = this.corpi[ssid];
    if (c === undefined) return true;
    if (c.orientamento.indicativo) return true;
    if (c.orientamento.modello === 'wgccre') return !(jdTT >= JD_WGCCRE_INIZIO && jdTT < JD_WGCCRE_FINE);
    return false;
  }

  /** Vero per i pianeti giganti: fase W arbitraria a lungo termine (periodi di rotazione incerti, § 7.7). */
  faseArbitraria(ssid: number): boolean {
    const n = this.corpi[ssid]?.naif;
    return n !== null && n !== undefined && NAIF_FASE_ARBITRARIA.has(n);
  }
}
