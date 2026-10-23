// Griglia dell'eclittica J2000 e anelli di distanza (R11). La griglia è uno shader sul piano z = 0
// eliocentrico, calcolato in spazio vista: intersezione raggio-piano relativa alla proiezione della
// camera sul piano, con le frazioni delle coordinate eliocentriche per ogni livello calcolate su CPU
// in Float64. Livelli 10^k scelti da log10 della quota della camera, con dissolvenza tra livelli.
// Gli anelli di distanza (1-1000 UA) sono circonferenze ancorate al punto più vicino al fuoco.

import { BufferGeometry, Float32BufferAttribute, Matrix3, Mesh, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { GLSL_PROFONDITA } from './glsl';

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform mat3 uVistaMondo;
uniform vec2 uInvProiezione;
uniform vec2 uCentroProiezione;
uniform float uQuota;
uniform vec4 uFrazioni; // livello fine (x, y), livello grosso (x, y)
uniform vec2 uPassi;    // km: fine, grosso
uniform float uAlfaFine;
uniform vec3 uColore;
uniform float uOpacita;
varying vec2 vNdc;
${GLSL_PROFONDITA}
float linee(vec2 g) {
  vec2 f = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1.0e-12));
  return 1.0 - min(min(f.x, f.y), 1.0);
}
void main() {
  vec3 dv = normalize(vec3((vNdc + uCentroProiezione) * uInvProiezione, -1.0));
  vec3 w = uVistaMondo * dv;
  float t = -uQuota / w.z;
  if (!(t > 0.0) || abs(w.z) < 1.0e-6) discard;
  vec2 rel = t * w.xy;
  float lf = linee(uFrazioni.xy + rel / uPassi.x) * uAlfaFine;
  float lg = linee(uFrazioni.zw + rel / uPassi.y);
  float l = max(lf, lg);
  // Dissolvenza radente e lontana: evita il moiré all'orizzonte.
  float radente = smoothstep(0.02, 0.15, abs(w.z));
  float lontano = 1.0 - smoothstep(20.0, 60.0, t / max(abs(uQuota), 1.0e-9));
  float a = l * uOpacita * radente * lontano;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColore, a);
  ssScriviProfondita(t * (-dv.z));
}
`;

export interface UniformiGriglia {
  uVistaMondo: { value: Matrix3 };
  uInvProiezione: { value: Vector2 };
  uCentroProiezione: { value: Vector2 };
  uQuota: { value: number };
  uFrazioni: { value: Vector4 };
  uPassi: { value: Vector2 };
  uAlfaFine: { value: number };
  uColore: { value: Vector3 };
  uOpacita: { value: number };
}

export function creaGriglia(colore: ArrayLike<number>): Mesh<BufferGeometry, ShaderMaterial & { uniforms: UniformiGriglia }> {
  const g = new BufferGeometry();
  // Triangolo che copre lo schermo.
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const uniforms: UniformiGriglia = {
    uVistaMondo: { value: new Matrix3() },
    uInvProiezione: { value: new Vector2(1, 1) },
    uCentroProiezione: { value: new Vector2(0, 0) },
    uQuota: { value: 1 },
    uFrazioni: { value: new Vector4() },
    uPassi: { value: new Vector2(1, 10) },
    uAlfaFine: { value: 1 },
    uColore: { value: new Vector3(colore[0], colore[1], colore[2]) },
    uOpacita: { value: 0.9 },
  };
  const m = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new Mesh(g, m as ShaderMaterial & { uniforms: UniformiGriglia });
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  return mesh;
}

/** Frazione di x/s in [0, 1) calcolata in Float64. */
function frazione(x: number, s: number): number {
  const q = x / s;
  return q - Math.floor(q);
}

/**
 * Uniformi della griglia. camElio: posizione eliocentrica della camera (Float64), rot: mondo → vista
 * (3×3 per righe), p00, p11, p20, p21: elementi della proiezione.
 */
export function aggiornaUniformiGriglia(
  u: UniformiGriglia,
  camElio: ArrayLike<number>,
  rot: ArrayLike<number>,
  p00: number,
  p11: number,
  p20: number,
  p21: number,
): void {
  const h = camElio[2]!;
  const L = Math.log10(Math.max(Math.abs(h), 1e-3));
  const k = Math.floor(L);
  const fine = 10 ** (k - 1);
  const grosso = 10 ** k;
  u.uQuota.value = h;
  u.uPassi.value.set(fine, grosso);
  u.uAlfaFine.value = 1 - (L - k);
  u.uFrazioni.value.set(frazione(camElio[0]!, fine), frazione(camElio[1]!, fine), frazione(camElio[0]!, grosso), frazione(camElio[1]!, grosso));
  // Vista → mondo: trasposta di rot.
  u.uVistaMondo.value.set(rot[0]!, rot[3]!, rot[6]!, rot[1]!, rot[4]!, rot[7]!, rot[2]!, rot[5]!, rot[8]!);
  u.uInvProiezione.value.set(1 / p00, 1 / p11);
  u.uCentroProiezione.value.set(p20, p21);
}

/** Vertici di un anello di distanza ancorato all'angolo theta0: vertice 0 nel punto di ancoraggio. */
export const PUNTI_ANELLO = 256;

export function verticiAnelloDistanza(raggio: number, theta0: number, out: Float32Array, param: Float32Array): number {
  // Stesso schema delle orbite: punti uniformi più raffinamento geometrico attorno all'ancora.
  const h = (2 * Math.PI) / PUNTI_ANELLO;
  let n = 0;
  const push = (u: number): void => {
    const s = u === 2 * Math.PI ? 0 : Math.sin(0.5 * u);
    const m = theta0 + 0.5 * u;
    out[3 * n] = -2 * raggio * Math.sin(m) * s;
    out[3 * n + 1] = 2 * raggio * Math.cos(m) * s;
    out[3 * n + 2] = 0;
    param[n] = u > Math.PI ? u - 2 * Math.PI : u;
    n++;
  };
  push(0);
  let k = 0;
  while (1e-9 * 2 ** k < h) push(1e-9 * 2 ** k++);
  for (let j = 1; j < PUNTI_ANELLO; j++) push(j * h);
  for (let j = k - 1; j >= 0; j--) push(2 * Math.PI - 1e-9 * 2 ** j);
  push(2 * Math.PI);
  return n;
}
