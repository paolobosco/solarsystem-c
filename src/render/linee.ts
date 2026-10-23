// Linee con larghezza in pixel per orbite, anelli di distanza, anelli di Urano e assi di rotazione.
// Ogni segmento è un'istanza: i due estremi (Float32, relativi all'ancora dell'oggetto) sono
// portati in spazio vista con modelViewMatrix (calcolata da three in doppia precisione), tagliati
// al piano vicino e allargati in spazio schermo. Tratteggio a periodo costante in pixel con
// livelli in potenze di 2 del parametro; arco d'incertezza ±ε lungo l'orbita, continuo e più largo (§ 7.8.2). Dietro il piano
// degli anelli di Saturno l'opacità è moltiplicata per la trasmissione dell'anello (rings.ts).

import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { PERIODO_TRATTEGGIO_PX } from './costanti';
import { GLSL_PROFONDITA } from './glsl';
import { GLSL_TRASMISSIONE_ANELLO, creaUniformiTrasmissioneAnello } from './rings';
import type { UniformiTrasmissioneAnello } from './rings';

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iA;
attribute vec3 iB;
attribute vec2 iParam;
attribute vec2 iDnu;
uniform vec2 uRisoluzione;
uniform float uLarghezza;
uniform float uLarghezzaArco;
uniform float uEps;
// Interpolazione prospettica calcolata nel fragment shader: gl_Position ha w = 1, perché alcuni
// rasterizzatori (SwiftShader) interpolano male le varying con w oltre circa 5e11 km. vS è la frazione
// sullo schermo lungo il segmento tagliato (0 nel primo estremo, 1 nel secondo); vWa è il w del primo
// estremo, vRapporto = wa/wb; vParamAB il parametro del tratteggio ai due estremi tagliati.
varying float vS;
varying float vWa;
varying float vRapporto;
varying vec2 vParamAB;
varying float vArco;
// Estremi tagliati in spazio vista, uguali nei quattro vertici: il punto del frammento è mix(vA, vB, u).
varying vec3 vA;
varying vec3 vB;
void main() {
  vec4 a = modelViewMatrix * vec4(iA, 1.0);
  vec4 b = modelViewMatrix * vec4(iB, 1.0);
  float pa = iParam.x;
  float pb = iParam.y;
  // Piano di taglio davanti alla camera, con margine proporzionale alle coordinate: in Float32
  // l'interpolazione ha errore assoluto circa 6e-8·|z| e non deve portare l'estremo dietro la camera.
  float zn = -max(1.0e-5, 1.0e-5 * max(abs(a.z), abs(b.z)));
  vArco = (abs(iDnu.x) <= uEps && abs(iDnu.y) <= uEps) ? 1.0 : 0.0;
  vS = 0.0;
  vWa = 1.0;
  vRapporto = 1.0;
  vParamAB = iParam;
  vA = vec3(0.0);
  vB = vec3(0.0);
  if (a.z > zn && b.z > zn) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    #include <logdepthbuf_vertex>
    return;
  }
  if (a.z > zn) {
    float f = (a.z - zn) / (a.z - b.z);
    a = mix(a, b, f);
    a.z = zn;
    pa = mix(pa, pb, f);
  }
  if (b.z > zn) {
    float f = (b.z - zn) / (b.z - a.z);
    b = mix(b, a, f);
    b.z = zn;
    pb = mix(pb, pa, f);
  }
  vec4 ca = projectionMatrix * a;
  vec4 cb = projectionMatrix * b;
  // Taglio omogeneo al riquadro |x|, |y| <= L·w (Liang-Barsky): un estremo portato sul piano vicino
  // avrebbe coordinate enormi, che alcuni rasterizzatori scartano. Per ogni lato f = L·w - (±x o ±y)
  // è lineare nella frazione u del segmento nello spazio, quindi i due estremi tagliati sono esatti.
  const float L = 3.0;
  float u0 = 0.0;
  float u1 = 1.0;
  for (int k = 0; k < 4; k++) {
    float qa = k == 0 ? ca.x : k == 1 ? -ca.x : k == 2 ? ca.y : -ca.y;
    float qb = k == 0 ? cb.x : k == 1 ? -cb.x : k == 2 ? cb.y : -cb.y;
    float fa = L * ca.w - qa;
    float fb = L * cb.w - qb;
    if (fa < 0.0 && fb < 0.0) {
      u1 = -1.0;
    } else if (fa < 0.0) {
      u0 = max(u0, fa / (fa - fb));
    } else if (fb < 0.0) {
      u1 = min(u1, fa / (fa - fb));
    }
  }
  if (u1 < u0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    #include <logdepthbuf_vertex>
    return;
  }
  vec4 c0 = mix(ca, cb, u0);
  vec4 c1 = mix(ca, cb, u1);
  vec2 sa = c0.xy / c0.w * uRisoluzione * 0.5;
  vec2 sb = c1.xy / c1.w * uRisoluzione * 0.5;
  vec2 dir = sb - sa;
  float l = length(dir);
  dir = l > 1.0e-6 ? dir / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float larg = vArco > 0.5 ? uLarghezzaArco : uLarghezza;
  bool inA = position.x < 0.5;
  float lungo = (inA ? -0.5 : 0.5) * 0.5 * larg;
  vec2 schermo = (inA ? sa : sb) + nrm * position.y * 0.5 * larg + dir * lungo;
  vS = (inA ? 0.0 : 1.0) + (l > 1.0e-6 ? lungo / l : 0.0);
  vWa = c0.w;
  vRapporto = c0.w / c1.w;
  vParamAB = vec2(mix(pa, pb, u0), mix(pa, pb, u1));
  vA = mix(a, b, u0).xyz;
  vB = mix(a, b, u1).xyz;
  gl_Position = vec4(schermo / (uRisoluzione * 0.5), inA ? c0.z / c0.w : c1.z / c1.w, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColore;
uniform float uOpacita;
uniform vec3 uColoreArco;
uniform float uTratteggio;
uniform float uPeriodoPx;
varying float vS;
varying float vWa;
varying float vRapporto;
varying vec2 vParamAB;
varying float vArco;
varying vec3 vA;
varying vec3 vB;
${GLSL_PROFONDITA}
${GLSL_TRASMISSIONE_ANELLO}
void main() {
  // Frazione nello spazio u dalla frazione sullo schermo s: 1/w è affine sullo schermo,
  // wa/w = (1 - s) + s·wa/wb, u = s·(wa/wb)/(wa/w). Nelle estremità arrotondate s esce di poco da [0, 1].
  float s = vS;
  float k = (1.0 - s) + s * vRapporto;
  if (k < 1.0e-6) {
    s = clamp(s, 0.0, 1.0);
    k = (1.0 - s) + s * vRapporto;
  }
  float u = s * vRapporto / k;
  ssScriviProfondita(vWa / k);
  float trasmissione = ssTrasmissioneAnello(mix(vA, vB, u));
  float param = mix(vParamAB.x, vParamAB.y, u);
  // Tratteggio sull'orbita; l'arco d'incertezza resta continuo (§ 7.8.2).
  if (uTratteggio > 0.5 && vArco < 0.5) {
    float f = max(fwidth(param), 1.0e-30);
    float periodo = exp2(ceil(log2(f * uPeriodoPx)));
    periodo = max(periodo, abs(param) * 4.0e-7);
    if (fract(param / periodo) > 0.55) discard;
  }
  vec3 col = mix(uColore, uColoreArco, vArco);
  float op = mix(uOpacita, 1.0, vArco) * trasmissione;
  gl_FragColor = vec4(col, op);
}
`;

export interface UniformiLinea {
  uRisoluzione: { value: Vector2 };
  uLarghezza: { value: number };
  uLarghezzaArco: { value: number };
  uEps: { value: number };
  uColore: { value: Vector3 };
  uOpacita: { value: number };
  uColoreArco: { value: Vector3 };
  uTratteggio: { value: number };
  uPeriodoPx: { value: number };
}

/**
 * Materiale di una linea; uRisoluzione (pixel del buffer di disegno) e le uniformi della trasmissione dell'anello
 * di Saturno sono condivise tra le linee.
 */
export function creaMaterialeLinea(
  risoluzione: Vector2,
  anello: UniformiTrasmissioneAnello = creaUniformiTrasmissioneAnello(),
): ShaderMaterial & { uniforms: UniformiLinea } {
  const uniforms: UniformiLinea = {
    uRisoluzione: { value: risoluzione },
    uLarghezza: { value: 1 },
    uLarghezzaArco: { value: 3 },
    uEps: { value: -1 },
    uColore: { value: new Vector3(1, 1, 1) },
    uOpacita: { value: 1 },
    uColoreArco: { value: new Vector3(1, 1, 1) },
    uTratteggio: { value: 0 },
    uPeriodoPx: { value: PERIODO_TRATTEGGIO_PX },
  };
  const m = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...uniforms, ...anello } as unknown as Record<string, { value: unknown }>,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  return m as ShaderMaterial & { uniforms: UniformiLinea };
}

/** Geometria a segmenti istanziati per una polilinea fino a `capacita` vertici. */
export class GeometriaLinea extends InstancedBufferGeometry {
  readonly capacita: number;
  private readonly a: InstancedBufferAttribute;
  private readonly b: InstancedBufferAttribute;
  private readonly par: InstancedBufferAttribute;
  private readonly dnu: InstancedBufferAttribute;
  private readonly attributi: InstancedBufferAttribute[];

  constructor(capacita: number) {
    super();
    this.capacita = capacita;
    // Quadrilatero di base: x ∈ {0, 1} estremo, y ∈ {-1, 1} lato.
    this.setAttribute('position', new BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
    this.setIndex([0, 2, 1, 2, 3, 1]);
    const seg = Math.max(1, capacita - 1);
    this.a = new InstancedBufferAttribute(new Float32Array(3 * seg), 3).setUsage(DynamicDrawUsage);
    this.b = new InstancedBufferAttribute(new Float32Array(3 * seg), 3).setUsage(DynamicDrawUsage);
    this.par = new InstancedBufferAttribute(new Float32Array(2 * seg), 2).setUsage(DynamicDrawUsage);
    this.dnu = new InstancedBufferAttribute(new Float32Array(2 * seg), 2).setUsage(DynamicDrawUsage);
    this.setAttribute('iA', this.a);
    this.setAttribute('iB', this.b);
    this.setAttribute('iParam', this.par);
    this.setAttribute('iDnu', this.dnu);
    this.attributi = [this.a, this.b, this.par, this.dnu];
    this.instanceCount = 0;
  }

  /** Copia una polilinea di n vertici (param e dnu facoltativi: zero). */
  imposta(vertici: Float32Array, n: number, param: Float32Array | null, dnu: Float32Array | null): void {
    const m = Math.min(n, this.capacita);
    const a = this.a.array as Float32Array;
    const b = this.b.array as Float32Array;
    const p = this.par.array as Float32Array;
    const d = this.dnu.array as Float32Array;
    for (let i = 0; i + 1 < m; i++) {
      a[3 * i] = vertici[3 * i]!;
      a[3 * i + 1] = vertici[3 * i + 1]!;
      a[3 * i + 2] = vertici[3 * i + 2]!;
      b[3 * i] = vertici[3 * i + 3]!;
      b[3 * i + 1] = vertici[3 * i + 4]!;
      b[3 * i + 2] = vertici[3 * i + 5]!;
      p[2 * i] = param ? param[i]! : 0;
      p[2 * i + 1] = param ? param[i + 1]! : 0;
      d[2 * i] = dnu ? dnu[i]! : 0;
      d[2 * i + 1] = dnu ? dnu[i + 1]! : 0;
    }
    const seg = Math.max(0, m - 1);
    this.instanceCount = seg;
    for (let k = 0; k < this.attributi.length; k++) {
      const attr = this.attributi[k]!;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, seg * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
}
