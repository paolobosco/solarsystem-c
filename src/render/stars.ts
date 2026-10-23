// Stelle reali con moto spaziale alla data (RF5, R8, § 8.8, § 9). Scena separata con camera di sola
// rotazione, disegnata per prima senza scrittura di profondità. Il formato è quello di stars.bin
// (record di 40 byte, § 8.8); il lettore del file è in src/data/starsReader.ts e consegna i campi
// come vettori (DatiStelle). Colore: temperatura da B-V (Ballesteros 2012), corpo nero, funzioni
// colorimetriche CIE 1931 (approssimazione analitica di Wyman, Sloan, Shirley 2013), sRGB.

import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Line,
  LineBasicMaterial,
  Points,
  ShaderMaterial,
} from 'three';
import { GIORNI_ANNO_GIULIANO, J2000, OBLIQUITA_J2000_RAD } from '../ephem/constants';
import { ltpecl } from '../time/precession';
import { COLORE_ECLITTICA_DATA, STELLE_MAGNITUDINE_LIMITE } from './costanti';

/** Campi di stars.bin (§ 8.8), uno per stella; vettori a 3 componenti per direzione e velocità. */
export interface DatiStelle {
  readonly numero: number;
  /** Direzione a J2000.0 (eclittica J2000), versore. */
  readonly direzione: Float32Array;
  /** Distanza in pc, 0 se non disponibile. */
  readonly distanzaPc: Float32Array;
  /** pc/anno con moto 3D (bit 0 di flag), rad/anno con moto lineare angolare (bit 1). */
  readonly velocita: Float32Array;
  readonly magV: Float32Array;
  readonly bv: Float32Array;
  readonly hr: Uint16Array;
  readonly flag: Uint8Array;
}

/** Fornitore asincrono delle stelle, caricate dopo il primo frame (§ 5.6). */
export interface FornitoreStelle {
  carica(segnale: AbortSignal): Promise<DatiStelle>;
}

export const FLAG_MOTO_3D = 1;
export const FLAG_LINEARE_ANGOLARE = 2;

/** Temperatura efficace da B-V: Ballesteros (2012), EPL 97, 34008. */
export function temperaturaDaBV(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

function gauss(l: number, mu: number, s1: number, s2: number): number {
  const s = l < mu ? s1 : s2;
  const t = (l - mu) / s;
  return Math.exp(-0.5 * t * t);
}

/** Funzioni colorimetriche CIE 1931 2°: approssimazione a più lobi di Wyman, Sloan, Shirley (2013), JCGT 2(2). */
export function cmfCie1931(lambdaNm: number, out: number[]): void {
  out[0] = 1.056 * gauss(lambdaNm, 599.8, 37.9, 31.0) + 0.362 * gauss(lambdaNm, 442.0, 16.0, 26.7) - 0.065 * gauss(lambdaNm, 501.1, 20.4, 26.2);
  out[1] = 0.821 * gauss(lambdaNm, 568.8, 46.9, 40.5) + 0.286 * gauss(lambdaNm, 530.9, 16.3, 31.1);
  out[2] = 1.217 * gauss(lambdaNm, 437.0, 11.8, 36.0) + 0.681 * gauss(lambdaNm, 459.0, 26.0, 13.8);
}

/** Radianza spettrale di corpo nero (unità arbitrarie) a λ (nm) e T (K): legge di Planck. */
function planck(lambdaNm: number, t: number): number {
  const l = lambdaNm * 1e-9;
  const c2 = 1.438776877e-2; // m·K, seconda costante di radiazione (CODATA 2018)
  return 1 / (l ** 5 * (Math.exp(c2 / (l * t)) - 1));
}

/** Colore sRGB lineare (componente massima 1) del corpo nero a temperatura T. */
export function rgbCorpoNero(t: number, out: number[] = [0, 0, 0]): number[] {
  const cmf = [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const p = planck(l, t);
    cmfCie1931(l, cmf);
    x += p * cmf[0]!;
    y += p * cmf[1]!;
    z += p * cmf[2]!;
  }
  // XYZ → sRGB lineare, IEC 61966-2-1 (D65).
  const r = Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z);
  const g = Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z);
  const b = Math.max(0, 0.0557 * x - 0.204 * y + 1.057 * z);
  const m = Math.max(r, g, b) || 1;
  out[0] = r / m;
  out[1] = g / m;
  out[2] = b / m;
  return out;
}

// Tabella delle tinte per temperature in scala logaritmica, 1500-40 000 K.
const N_TAB = 256;
const T_MIN = 1500;
const T_MAX = 40000;
let tabella: Float32Array | null = null;

function tinta(t: number, out: number[]): void {
  if (!tabella) {
    tabella = new Float32Array(3 * N_TAB);
    const c = [0, 0, 0];
    for (let i = 0; i < N_TAB; i++) {
      const ti = T_MIN * (T_MAX / T_MIN) ** (i / (N_TAB - 1));
      rgbCorpoNero(ti, c);
      tabella[3 * i] = c[0]!;
      tabella[3 * i + 1] = c[1]!;
      tabella[3 * i + 2] = c[2]!;
    }
  }
  const f = (Math.log(Math.max(T_MIN, Math.min(T_MAX, t)) / T_MIN) / Math.log(T_MAX / T_MIN)) * (N_TAB - 1);
  const i = Math.min(N_TAB - 2, Math.floor(f));
  const w = f - i;
  for (let k = 0; k < 3; k++) out[k] = tabella[3 * i + k]! * (1 - w) + tabella[3 * (i + 1) + k]! * w;
}

function codifica(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Direzione alla data (§ 8.8): normalize(d·u + v·Δt) con moto 3D, normalize(u + v·Δt) altrimenti. */
export function direzioneAllaData(s: DatiStelle, i: number, anniDaJ2000: number, out: Float32Array, off: number): void {
  const ux = s.direzione[3 * i]!;
  const uy = s.direzione[3 * i + 1]!;
  const uz = s.direzione[3 * i + 2]!;
  const vx = s.velocita[3 * i]!;
  const vy = s.velocita[3 * i + 1]!;
  const vz = s.velocita[3 * i + 2]!;
  const f = s.flag[i]!;
  let x = ux;
  let y = uy;
  let z = uz;
  const d = s.distanzaPc[i]!;
  if ((f & FLAG_MOTO_3D) !== 0 && d > 0) {
    x = d * ux + vx * anniDaJ2000;
    y = d * uy + vy * anniDaJ2000;
    z = d * uz + vz * anniDaJ2000;
  } else if ((f & FLAG_LINEARE_ANGOLARE) !== 0) {
    x = ux + vx * anniDaJ2000;
    y = uy + vy * anniDaJ2000;
    z = uz + vz * anniDaJ2000;
  }
  const n = Math.sqrt(x * x + y * y + z * z) || 1;
  out[off] = x / n;
  out[off + 1] = y / n;
  out[off + 2] = z / n;
}

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColore;
attribute float aLato;
uniform float uPixelRatio;
varying vec3 vColore;
void main() {
  vColore = aColore;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_PointSize = aLato * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColore;
void main() {
  #include <logdepthbuf_fragment>
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a = 1.0 - smoothstep(0.35, 1.0, r2);
  gl_FragColor = vec4(vColore, a);
}
`;

/** Lato del punto (px CSS) e intensità da V: luminosità massima limitata. */
export function aspettoStella(v: number): { lato: number; intensita: number } {
  const m = STELLE_MAGNITUDINE_LIMITE - v;
  return {
    lato: Math.max(1.6, Math.min(4.8, 1.6 + 0.5 * m)),
    intensita: Math.max(0.3, Math.min(0.9, 0.3 + 0.1 * m)),
  };
}

export class CieloStelle {
  readonly punti: Points<BufferGeometry, ShaderMaterial>;
  readonly eclitticaData: Line<BufferGeometry, LineBasicMaterial>;
  private dati: DatiStelle | null = null;
  private anniUltimi = Number.NaN;
  private readonly posizioni: Float32Array;
  private readonly attrPos: BufferAttribute;

  constructor(capacita = 9200) {
    const g = new BufferGeometry();
    this.posizioni = new Float32Array(3 * capacita);
    this.attrPos = new BufferAttribute(this.posizioni, 3).setUsage(DynamicDrawUsage);
    g.setAttribute('position', this.attrPos);
    g.setAttribute('aColore', new BufferAttribute(new Float32Array(3 * capacita), 3));
    g.setAttribute('aLato', new BufferAttribute(new Float32Array(capacita), 1));
    g.setDrawRange(0, 0);
    const m = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uPixelRatio: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.punti = new Points(g, m);
    this.punti.frustumCulled = false;
    this.punti.matrixAutoUpdate = false;
    const ge = new BufferGeometry();
    ge.setAttribute('position', new BufferAttribute(new Float32Array(3 * 257), 3));
    this.eclitticaData = new Line(ge, new LineBasicMaterial({ color: COLORE_ECLITTICA_DATA, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
    this.eclitticaData.frustumCulled = false;
    this.eclitticaData.matrixAutoUpdate = false;
    this.eclitticaData.visible = false;
  }

  /** Imposta i dati del catalogo (colori e dimensioni una sola volta). */
  impostaDati(dati: DatiStelle): void {
    const n = Math.min(dati.numero, this.posizioni.length / 3);
    this.dati = dati;
    const g = this.punti.geometry;
    const col = (g.getAttribute('aColore') as BufferAttribute).array as Float32Array;
    const lato = (g.getAttribute('aLato') as BufferAttribute).array as Float32Array;
    const c = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const bv = dati.bv[i]!;
      tinta(Number.isFinite(bv) ? temperaturaDaBV(bv) : 5800, c);
      const a = aspettoStella(dati.magV[i]!);
      col[3 * i] = codifica(c[0]! * a.intensita);
      col[3 * i + 1] = codifica(c[1]! * a.intensita);
      col[3 * i + 2] = codifica(c[2]! * a.intensita);
      lato[i] = a.lato;
    }
    (g.getAttribute('aColore') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('aLato') as BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, n);
    this.anniUltimi = Number.NaN;
  }

  get caricate(): boolean {
    return this.dati !== null;
  }

  /** Ricalcola le direzioni se la data è cambiata di più di sogliaAnni; true se ha aggiornato. */
  aggiorna(jdTT: number, sogliaAnni: number): boolean {
    const anni = (jdTT - J2000) / GIORNI_ANNO_GIULIANO;
    let cambiato = false;
    if (this.dati && !(Math.abs(anni - this.anniUltimi) < sogliaAnni)) {
      const n = Math.min(this.dati.numero, this.posizioni.length / 3);
      for (let i = 0; i < n; i++) direzioneAllaData(this.dati, i, anni, this.posizioni, 3 * i);
      this.attrPos.needsUpdate = true;
      this.anniUltimi = anni;
      cambiato = true;
    }
    if (this.eclitticaData.visible) this.aggiornaEclittica(jdTT);
    return cambiato;
  }

  private readonly polo = new Float64Array(3);
  private jdEclittica = Number.NaN;

  /** Cerchio massimo dell'eclittica della data (Vondrák et al. 2011, ltpecl), nell'eclittica J2000. */
  private aggiornaEclittica(jdTT: number): void {
    if (Math.abs(jdTT - this.jdEclittica) < 365.25) return;
    this.jdEclittica = jdTT;
    ltpecl(2000 + (jdTT - J2000) / GIORNI_ANNO_GIULIANO, this.polo);
    const ce = Math.cos(OBLIQUITA_J2000_RAD);
    const se = Math.sin(OBLIQUITA_J2000_RAD);
    const px = this.polo[0]!;
    const py = this.polo[1]! * ce + this.polo[2]! * se;
    const pz = -this.polo[1]! * se + this.polo[2]! * ce;
    // Base del piano: a = polo × x̂ normalizzato (nodo), b = polo × a.
    let ax = 0;
    let ay = pz;
    let az = -py;
    const na = Math.hypot(ax, ay, az) || 1;
    ax /= na;
    ay /= na;
    az /= na;
    const bx = py * az - pz * ay;
    const by = pz * ax - px * az;
    const bz = px * ay - py * ax;
    const attr = this.eclitticaData.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let j = 0; j <= 256; j++) {
      const t = (2 * Math.PI * j) / 256;
      const c = Math.cos(t);
      const s = Math.sin(t);
      arr[3 * j] = ax * c + bx * s;
      arr[3 * j + 1] = ay * c + by * s;
      arr[3 * j + 2] = az * c + bz * s;
    }
    attr.needsUpdate = true;
  }

  impostaPixelRatio(pr: number): void {
    (this.punti.material.uniforms['uPixelRatio'] as { value: number }).value = pr;
  }
}
