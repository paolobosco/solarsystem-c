// Anelli di Saturno e Urano (R7, § 9). Raggi dalle tabelle del PDS Ring-Moon Systems Node
// (https://pds-rings.seti.org/saturn/saturn_tables.html, https://pds-rings.seti.org/uranus/uranus_tables.html),
// letti dal campo `anelli` del catalogo (profiloDaCatalogo, raggiStrettiDaCatalogo); i valori scritti qui
// servono solo ai cataloghi senza quel campo. Profilo di opacità schematico, dichiarato. Saturno: anello piatto nel piano equatoriale,
// intersezione raggio-piano esatta nel fragment shader (spazio vista, camera nel sistema
// dell'anello calcolata in Float64), profilo radiale in texture 1D mediato sull'area di ogni texel con livelli
// mipmap letti con le derivate del raggio (lacune e anelli stretti sotto il pixel attenuati, non a tratti),
// ombra del pianeta sugli anelli. Le linee dietro il piano degli anelli sono attenuate dalla trasmissione
// dell'anello (GLSL_TRASMISSIONE_ANELLO): l'anello è trasparente e non scrive la profondità.
// Urano: linee sottili. Ombre degli anelli sul pianeta non rappresentate (dichiarato).

import {
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { Anelli } from '../data/catalogTypes';
import { GLSL_PROFONDITA, GLSL_SRGB } from './glsl';

/** Fasce di Saturno: raggio interno, esterno (km), profondità ottica normale tipica, riflettività. */
export interface FasciaAnello {
  nome: string;
  r0: number;
  r1: number;
  tau: number;
  luce: number;
}

/**
 * Bordi da PDS Ring-Moon Systems Node, Saturn ring tables (D, C, B, divisione di Cassini, A con le
 * divisioni di Encke e Keeler, F). Profondità ottiche tipiche: ordini di grandezza delle stesse
 * tabelle; la suddivisione interna dell'anello B è schematica.
 */
export const FASCE_SATURNO: readonly FasciaAnello[] = [
  { nome: 'D', r0: 66_900, r1: 74_510, tau: 0.002, luce: 0.35 },
  { nome: 'C', r0: 74_658, r1: 92_000, tau: 0.1, luce: 0.45 },
  { nome: 'B interno', r0: 92_000, r1: 99_000, tau: 1.0, luce: 0.8 },
  { nome: 'B centrale', r0: 99_000, r1: 110_000, tau: 2.5, luce: 0.95 },
  { nome: 'B esterno', r0: 110_000, r1: 117_580, tau: 1.6, luce: 0.9 },
  { nome: 'Cassini', r0: 117_580, r1: 122_170, tau: 0.1, luce: 0.4 },
  { nome: 'A interno', r0: 122_170, r1: 133_423, tau: 0.6, luce: 0.75 },
  { nome: 'Encke', r0: 133_423, r1: 133_745, tau: 0.0, luce: 0 },
  { nome: 'A esterno', r0: 133_745, r1: 136_485, tau: 0.5, luce: 0.72 },
  { nome: 'Keeler', r0: 136_485, r1: 136_527, tau: 0.0, luce: 0 },
  { nome: 'A bordo', r0: 136_527, r1: 136_775, tau: 0.5, luce: 0.72 },
  { nome: 'F', r0: 140_130, r1: 140_230, tau: 0.5, luce: 0.8 },
];

export const SATURNO_R_INTERNO = 66_900;
export const SATURNO_R_ESTERNO = 140_230;

/** Raggi degli anelli stretti di Urano (km): 6, 5, 4, α, β, η, γ, δ, λ, ε. */
export const RAGGI_URANO: readonly number[] = [41_837, 42_234, 42_571, 44_718, 45_661, 47_176, 47_627, 48_300, 50_024, 51_149];

const TAU_MAX = 3;
const LARGHEZZA_PROFILO = 2048;
/** Tinta degli anelli (sRGB lineare, schematica). */
const TINTA: readonly [number, number, number] = [0.78, 0.7, 0.56];
/** Elementi con profondità ottica tipica inferiore non sono disegnati (anelli G, E, di Febe e simili). */
export const TAU_MINIMA_DISEGNO = 1e-4;

/** Profilo radiale di Saturno: fasce in ordine di larghezza decrescente (le più strette prevalgono). */
export interface ProfiloAnelli {
  fasce: FasciaAnello[];
  rInterno: number;
  rEsterno: number;
}

/** Riflettività schematica dalla profondità ottica normale. */
export function luceDaTau(tau: number): number {
  return tau <= 0 ? 0 : 0.3 + 0.65 * (1 - Math.exp(-tau));
}

/**
 * Profilo di Saturno dagli elementi del catalogo (§ 9): elementi con τ tipica (media dell'intervallo indicato
 * dalla fonte) almeno TAU_MINIMA_DISEGNO e lacune (τ = 0); in ogni raggio prevale l'elemento più stretto (lacune
 * e anelli stretti dentro gli anelli principali e le regioni dell'anello B). Elementi senza τ: ignorati.
 */
export function profiloDaCatalogo(a: Anelli): ProfiloAnelli | null {
  const fasce: FasciaAnello[] = [];
  let r0 = Number.POSITIVE_INFINITY;
  let r1 = 0;
  for (const e of a.elementi) {
    if (e.tau === null || !(e.rEsterno_km > e.rInterno_km)) continue;
    const tau = 0.5 * (e.tau[0] + e.tau[1]);
    const lacuna = e.tipo === 'lacuna' || tau === 0;
    if (!lacuna && tau < TAU_MINIMA_DISEGNO) continue;
    fasce.push({ nome: e.nome, r0: e.rInterno_km, r1: e.rEsterno_km, tau: lacuna ? 0 : tau, luce: lacuna ? 0 : luceDaTau(tau) });
    if (!lacuna) {
      r0 = Math.min(r0, e.rInterno_km);
      r1 = Math.max(r1, e.rEsterno_km);
    }
  }
  if (!(r1 > r0)) return null;
  fasce.sort((x, y) => y.r1 - y.r0 - (x.r1 - x.r0));
  return { fasce, rInterno: r0, rEsterno: r1 };
}

/** Raggi medi degli anelli stretti (Urano, § 9) dal catalogo, in ordine crescente. */
export function raggiStrettiDaCatalogo(a: Anelli): number[] {
  return a.elementi
    .filter((e) => e.tipo === 'stretto')
    .map((e) => 0.5 * (e.rInterno_km + e.rEsterno_km))
    .sort((x, y) => x - y);
}

/** Livello di un profilo radiale: trasmissione media a incidenza normale e riflettività media pesata per l'opacità. */
export interface LivelloProfilo {
  /** Trasmissione media e^(-τ) sul texel (luce che attraversa il texel a incidenza normale). */
  trasmissione: Float64Array;
  /** Riflettività media delle parti opache: Σ(1 - e^(-τ))·luce / Σ(1 - e^(-τ)). */
  luce: Float64Array;
}

/**
 * Profilo radiale su n texel tra rInterno ed rEsterno, mediato sull'area di ogni texel: ogni fascia (le più strette
 * prevalgono, come in profiloDaCatalogo) contribuisce in proporzione alla larghezza coperta. Lacune e anelli più
 * stretti del texel restano come attenuazione della trasmissione invece di cadere o meno sul centro del texel.
 */
export function profiloMediato(fasce: readonly FasciaAnello[], rInterno: number, rEsterno: number, n = LARGHEZZA_PROFILO): LivelloProfilo {
  const bordi = new Set<number>([rInterno, rEsterno]);
  for (const f of fasce) {
    if (f.r0 > rInterno && f.r0 < rEsterno) bordi.add(f.r0);
    if (f.r1 > rInterno && f.r1 < rEsterno) bordi.add(f.r1);
  }
  const b = [...bordi].sort((x, y) => x - y);
  const trasmissione = new Float64Array(n);
  const opacita = new Float64Array(n);
  const luce = new Float64Array(n);
  const w = (rEsterno - rInterno) / n;
  for (let k = 0; k + 1 < b.length; k++) {
    const a = b[k]!;
    const z = b[k + 1]!;
    const m = 0.5 * (a + z);
    let tau = 0;
    let l = 0;
    for (const f of fasce) {
      if (m >= f.r0 && m < f.r1) {
        tau = f.tau;
        l = f.luce;
      }
    }
    const t = Math.exp(-tau);
    // Distribuzione del segmento [a, z] sui texel che copre.
    const i0 = Math.max(0, Math.floor((a - rInterno) / w));
    const i1 = Math.min(n - 1, Math.floor((z - rInterno) / w));
    for (let i = i0; i <= i1; i++) {
      const x0 = rInterno + i * w;
      const parte = (Math.min(z, x0 + w) - Math.max(a, x0)) / w;
      if (!(parte > 0)) continue;
      trasmissione[i] = trasmissione[i]! + parte * t;
      opacita[i] = opacita[i]! + parte * (1 - t);
      luce[i] = luce[i]! + parte * (1 - t) * l;
    }
  }
  for (let i = 0; i < n; i++) luce[i] = opacita[i]! > 0 ? luce[i]! / opacita[i]! : 0;
  return { trasmissione, luce };
}

/** Livello successivo della catena mipmap: media di coppie di texel (trasmissione lineare, luce pesata per l'opacità). */
export function dimezzaProfilo(p: LivelloProfilo): LivelloProfilo {
  const n = Math.max(1, p.trasmissione.length >> 1);
  const trasmissione = new Float64Array(n);
  const luce = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = Math.min(2 * i + 1, p.trasmissione.length - 1);
    const t0 = p.trasmissione[2 * i]!;
    const t1 = p.trasmissione[j]!;
    trasmissione[i] = 0.5 * (t0 + t1);
    const o = 2 - t0 - t1;
    luce[i] = o > 0 ? ((1 - t0) * p.luce[2 * i]! + (1 - t1) * p.luce[j]!) / o : 0;
  }
  return { trasmissione, luce };
}

/** Texel RGBA8: τ efficace = -ln(trasmissione) su TAU_MAX nel rosso, riflettività × tinta negli altri canali. */
function texelProfilo(p: LivelloProfilo): Uint8Array {
  const n = p.trasmissione.length;
  const dati = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) {
    const t = p.trasmissione[i]!;
    const tau = t > 0 ? -Math.log(t) : TAU_MAX;
    dati[4 * i] = Math.round((Math.min(Math.max(tau, 0), TAU_MAX) / TAU_MAX) * 255);
    dati[4 * i + 1] = Math.round(p.luce[i]! * TINTA[0] * 255);
    dati[4 * i + 2] = Math.round(p.luce[i]! * TINTA[1] * 255);
    dati[4 * i + 3] = Math.round(p.luce[i]! * TINTA[2] * 255);
  }
  return dati;
}

export function creaProfiloSaturno(
  fasce: readonly FasciaAnello[] = FASCE_SATURNO,
  rInterno = SATURNO_R_INTERNO,
  rEsterno = SATURNO_R_ESTERNO,
): DataTexture {
  let livello = profiloMediato(fasce, rInterno, rEsterno);
  const base = texelProfilo(livello);
  const t = new DataTexture(base, LARGHEZZA_PROFILO, 1, RGBAFormat, UnsignedByteType);
  // Catena mipmap fino a 1 texel: il fragment shader sceglie il livello dall'ampiezza radiale del pixel.
  t.mipmaps = [{ data: base, width: LARGHEZZA_PROFILO, height: 1 }];
  while (livello.trasmissione.length > 1) {
    livello = dimezzaProfilo(livello);
    t.mipmaps.push({ data: texelProfilo(livello), width: livello.trasmissione.length, height: 1 });
  }
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCentro;
uniform vec3 uU;
uniform vec3 uV;
varying vec3 vPosVista;
void main() {
  vec3 pv = uCentro + position.x * uU + position.y * uV;
  vPosVista = pv;
  gl_Position = projectionMatrix * vec4(pv, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform mat3 uVistaAnello;
uniform vec3 uO;
uniform vec3 uSole;
uniform vec3 uRaggiPianeta;
uniform float uRin;
uniform float uRout;
uniform sampler2D uProfilo;
varying vec3 vPosVista;
${GLSL_SRGB}
${GLSL_PROFONDITA}
void main() {
  vec3 D = normalize(vPosVista);
  vec3 dr = uVistaAnello * D;
  float dz = abs(dr.z) < 1.0e-7 ? 1.0e-7 : dr.z;
  float t = -uO.z / dz;
  vec2 p = uO.xy + t * dr.xy;
  float r = length(p);
  // Coordinata radiale e sue derivate prima di ogni discard: il livello mipmap copre l'ampiezza radiale del pixel.
  float ur = (r - uRin) / (uRout - uRin);
  vec2 gx = vec2(dFdx(ur), 0.0);
  vec2 gy = vec2(dFdy(ur), 0.0);
  if (abs(dr.z) < 1.0e-7 || t <= 0.0 || r < uRin || r > uRout) discard;
  vec4 prof = textureGrad(uProfilo, vec2(ur, 0.5), gx, gy);
  float tau = prof.r * ${TAU_MAX.toFixed(1)};
  float mu = max(abs(dr.z), 0.02);
  float alfa = 1.0 - exp(-tau / mu);
  if (alfa < 0.004) discard;
  // Lato illuminato se camera e Sole stanno dalla stessa parte del piano.
  float muSole = abs(uSole.z);
  bool stessoLato = uO.z * uSole.z > 0.0;
  float luce = stessoLato ? (0.15 + 0.85 * clamp(muSole * 6.0, 0.0, 1.0)) : 0.25 * exp(-tau) + 0.03;
  // Ombra del pianeta: raggio dal punto verso il Sole contro l'ellissoide del pianeta.
  vec3 ps = vec3(p, 0.0) / uRaggiPianeta;
  vec3 ss = uSole / uRaggiPianeta;
  float aa = dot(ss, ss);
  float bb = dot(ps, ss);
  float cc = dot(ps, ps) - 1.0;
  float disc = bb * bb - aa * cc;
  float ombra = (disc > 0.0 && (-bb + sqrt(disc)) > 0.0) ? 1.0 : 0.0;
  vec3 col = prof.gba * luce * (1.0 - 0.9 * ombra);
  gl_FragColor = vec4(ssLineareASrgb(col), alfa);
  ssScriviProfondita(t * (-D.z));
}
`;

/**
 * Trasmissione dell'anello di Saturno lungo il raggio dalla camera al punto P (spazio vista): 1 se il raggio non
 * attraversa il piano degli anelli prima di P o lo attraversa fuori da [uAnRin, uAnRout], altrimenti e^(-τ/μ)
 * con lo stesso profilo e lo stesso modello di opacità dell'anello. Da chiamare fuori da rami non uniformi.
 */
export const GLSL_TRASMISSIONE_ANELLO = /* glsl */ `
uniform float uAnAttivo;
uniform mat3 uAnVista;
uniform vec3 uAnO;
uniform float uAnRin;
uniform float uAnRout;
uniform sampler2D uAnProfilo;
float ssTrasmissioneAnello(vec3 P) {
  float l = max(length(P), 1.0e-30);
  vec3 dr = uAnVista * (P / l);
  float dz = abs(dr.z) < 1.0e-7 ? 1.0e-7 : dr.z;
  float t = -uAnO.z / dz;
  float r = length(uAnO.xy + t * dr.xy);
  float ur = (r - uAnRin) / max(uAnRout - uAnRin, 1.0);
  float tau = textureGrad(uAnProfilo, vec2(ur, 0.5), vec2(dFdx(ur), 0.0), vec2(dFdy(ur), 0.0)).r * ${TAU_MAX.toFixed(1)};
  bool dietro = uAnAttivo > 0.5 && abs(dr.z) >= 1.0e-7 && t > 0.0 && t < l && r >= uAnRin && r <= uAnRout;
  return dietro ? exp(-tau / max(abs(dr.z), 0.02)) : 1.0;
}
`;

/** Uniformi di GLSL_TRASMISSIONE_ANELLO, condivise da tutti i materiali delle linee. */
export interface UniformiTrasmissioneAnello {
  uAnAttivo: { value: number };
  uAnVista: { value: Matrix3 };
  uAnO: { value: Vector3 };
  uAnRin: { value: number };
  uAnRout: { value: number };
  uAnProfilo: { value: DataTexture | null };
}

export function creaUniformiTrasmissioneAnello(): UniformiTrasmissioneAnello {
  return {
    uAnAttivo: { value: 0 },
    uAnVista: { value: new Matrix3() },
    uAnO: { value: new Vector3() },
    uAnRin: { value: 0 },
    uAnRout: { value: 1 },
    uAnProfilo: { value: null },
  };
}

/** Copia nelle uniformi delle linee lo stato dell'anello di Saturno del frame. */
export function aggiornaTrasmissioneAnello(t: UniformiTrasmissioneAnello, a: UniformiAnelli | null, visibile: boolean): void {
  t.uAnAttivo.value = a && visibile ? 1 : 0;
  if (!a || !visibile) return;
  t.uAnVista.value.copy(a.uVistaAnello.value);
  t.uAnO.value.copy(a.uO.value);
  t.uAnRin.value = a.uRin.value;
  t.uAnRout.value = a.uRout.value;
  t.uAnProfilo.value = a.uProfilo.value;
}

export interface UniformiAnelli {
  uCentro: { value: Vector3 };
  uU: { value: Vector3 };
  uV: { value: Vector3 };
  uVistaAnello: { value: Matrix3 };
  uO: { value: Vector3 };
  uSole: { value: Vector3 };
  uRaggiPianeta: { value: Vector3 };
  uRin: { value: number };
  uRout: { value: number };
  uProfilo: { value: DataTexture };
}

export function creaMeshAnelliSaturno(
  profilo: DataTexture,
  rInterno = SATURNO_R_INTERNO,
  rEsterno = SATURNO_R_ESTERNO,
): Mesh<PlaneGeometry, ShaderMaterial & { uniforms: UniformiAnelli }> {
  const uniforms: UniformiAnelli = {
    uCentro: { value: new Vector3() },
    uU: { value: new Vector3() },
    uV: { value: new Vector3() },
    uVistaAnello: { value: new Matrix3() },
    uO: { value: new Vector3() },
    uSole: { value: new Vector3(1, 0, 0) },
    uRaggiPianeta: { value: new Vector3(60_268, 60_268, 54_364) },
    uRin: { value: rInterno },
    uRout: { value: rEsterno },
    uProfilo: { value: profilo },
  };
  const m = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), m as ShaderMaterial & { uniforms: UniformiAnelli });
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.renderOrder = 10;
  return mesh;
}

const tmp = new Float64Array(9);

/**
 * Uniformi degli anelli: centro del pianeta in vista c, rotazione mondo → vista rot, orientamento
 * del pianeta (colonne: assi del corpo; z = polo, piano degli anelli = equatore), semiassi del
 * pianeta, direzione del Sole nel mondo (unitaria).
 */
export function aggiornaUniformiAnelli(
  u: UniformiAnelli,
  c: ArrayLike<number>,
  offC: number,
  rot: ArrayLike<number>,
  orient: ArrayLike<number>,
  offO: number,
  raggiPianeta: ArrayLike<number>,
  sx: number,
  sy: number,
  sz: number,
): void {
  // Assi dell'anello in vista: colonne di rot·orient.
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      tmp[3 * i + j] = rot[3 * i]! * orient[offO + j]! + rot[3 * i + 1]! * orient[offO + 3 + j]! + rot[3 * i + 2]! * orient[offO + 6 + j]!;
    }
  }
  const R = u.uRout.value;
  u.uCentro.value.set(c[offC]!, c[offC + 1]!, c[offC + 2]!);
  u.uU.value.set(tmp[0]! * R, tmp[3]! * R, tmp[6]! * R);
  u.uV.value.set(tmp[1]! * R, tmp[4]! * R, tmp[7]! * R);
  // Vista → anello: trasposta di tmp.
  u.uVistaAnello.value.set(tmp[0]!, tmp[3]!, tmp[6]!, tmp[1]!, tmp[4]!, tmp[7]!, tmp[2]!, tmp[5]!, tmp[8]!);
  const cx = c[offC]!;
  const cy = c[offC + 1]!;
  const cz = c[offC + 2]!;
  u.uO.value.set(
    -(tmp[0]! * cx + tmp[3]! * cy + tmp[6]! * cz),
    -(tmp[1]! * cx + tmp[4]! * cy + tmp[7]! * cz),
    -(tmp[2]! * cx + tmp[5]! * cy + tmp[8]! * cz),
  );
  // Sole nel sistema dell'anello: orientᵀ·s.
  u.uSole.value.set(
    orient[offO]! * sx + orient[offO + 3]! * sy + orient[offO + 6]! * sz,
    orient[offO + 1]! * sx + orient[offO + 4]! * sy + orient[offO + 7]! * sz,
    orient[offO + 2]! * sx + orient[offO + 5]! * sy + orient[offO + 8]! * sz,
  );
  u.uRaggiPianeta.value.set(raggiPianeta[0]!, raggiPianeta[1]!, raggiPianeta[2]!);
}

/** Vertici (Float32, relativi al centro di Urano) delle circonferenze degli anelli, separate da salti. */
export const PUNTI_ANELLO_URANO = 256;

/** Scrive l'anello k come polilinea chiusa nel piano equatoriale (colonne x, y di orient). */
export function verticiAnelloUrano(raggio: number, orient: ArrayLike<number>, offO: number, out: Float32Array): number {
  const n = PUNTI_ANELLO_URANO + 1;
  for (let j = 0; j < n; j++) {
    const a = (2 * Math.PI * j) / PUNTI_ANELLO_URANO;
    const ca = Math.cos(a) * raggio;
    const sa = Math.sin(a) * raggio;
    out[3 * j] = orient[offO]! * ca + orient[offO + 1]! * sa;
    out[3 * j + 1] = orient[offO + 3]! * ca + orient[offO + 4]! * sa;
    out[3 * j + 2] = orient[offO + 6]! * ca + orient[offO + 7]! * sa;
  }
  return n;
}
