// Impostori di ellissoide (R5): riquadro contenitore (cubo unitario portato in spazio vista dagli
// assi del corpo), intersezione raggio-ellissoide nel fragment shader in spazio vista con centro,
// assi e posizione della camera nel sistema del corpo calcolati su CPU in Float64; normale,
// latitudine e longitudine analitiche, textureGrad senza cucitura, illuminazione dal Sole con
// terminatore; il Sole è emissivo con oscuramento al bordo. gl_FragDepth con la formula logaritmica.

import { AdditiveBlending, BackSide, BoxGeometry, Matrix3, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { Texture, Vector2 } from 'three';
import { GLSL_PROFONDITA, GLSL_SRGB } from './glsl';

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCentro;
uniform mat3 uAssi;
varying vec3 vPosVista;
void main() {
  vec3 pv = uCentro + uAssi * position;
  vPosVista = pv;
  gl_Position = projectionMatrix * vec4(pv, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform mat3 uMinv;
uniform vec3 uO;
uniform mat3 uRotN;
uniform vec3 uSole;
uniform vec3 uRaggi;
uniform vec3 uColore;
uniform sampler2D uTexture;
uniform float uHaTexture;
uniform float uLon0;
uniform float uVerso;
uniform float uEmissivo;
uniform float uAmbiente;
varying vec3 vPosVista;
${GLSL_SRGB}
${GLSL_PROFONDITA}
void main() {
  vec3 D = normalize(vPosVista);
  vec3 d = uMinv * D;
  float ld = length(d);
  vec3 dn = d / ld;
  float b = dot(uO, dn);
  vec3 h = uO - b * dn;
  float disc = 1.0 - dot(h, h);
  bool dentro = disc >= 0.0;
  float tu = -b - sqrt(max(disc, 0.0));
  dentro = dentro && tu >= 0.0;
  vec3 pu = uO + tu * dn;
  vec3 xb = pu * uRaggi;
  vec3 nb = normalize(pu / uRaggi);
  vec3 nv = normalize(uRotN * nb);
  // Coordinate planetocentriche: longitudine dall'asse x verso y (est), latitudine dal piano xy.
  float lon = atan(xb.y, xb.x);
  float lat = atan(xb.z, length(xb.xy));
  float u1 = fract(uLon0 + uVerso * lon / 6.283185307179586);
  float u2 = fract(u1 + 0.5) - 0.5;
  float v = 0.5 - lat / 3.141592653589793;
  vec2 dx1 = vec2(dFdx(u1), dFdx(v));
  vec2 dy1 = vec2(dFdy(u1), dFdy(v));
  vec2 dx2 = vec2(dFdx(u2), dFdx(v));
  vec2 dy2 = vec2(dFdy(u2), dFdy(v));
  vec2 gx = abs(dx1.x) <= abs(dx2.x) ? dx1 : dx2;
  vec2 gy = abs(dy1.x) <= abs(dy2.x) ? dy1 : dy2;
  vec3 albedo = uColore;
  if (uHaTexture > 0.5) albedo = textureGrad(uTexture, vec2(u1, v), gx, gy).rgb;
  if (!dentro) discard;
  vec3 col;
  if (uEmissivo > 0.5) {
    float mu = max(dot(nv, -D), 0.0);
    col = uColore * (1.0 - 0.6 * (1.0 - mu));
  } else {
    float lambert = max(dot(nv, uSole), 0.0);
    col = albedo * (lambert + uAmbiente);
  }
  gl_FragColor = vec4(ssLineareASrgb(col), 1.0);
  ssScriviProfondita(tu / ld * (-D.z));
}
`;

export interface UniformiImpostore {
  uCentro: { value: Vector3 };
  uAssi: { value: Matrix3 };
  uMinv: { value: Matrix3 };
  uO: { value: Vector3 };
  uRotN: { value: Matrix3 };
  uSole: { value: Vector3 };
  uRaggi: { value: Vector3 };
  uColore: { value: Vector3 };
  uTexture: { value: Texture | null };
  uHaTexture: { value: number };
  uLon0: { value: number };
  uVerso: { value: number };
  uEmissivo: { value: number };
  uAmbiente: { value: number };
}

export type MaterialeImpostore = ShaderMaterial & { uniforms: UniformiImpostore };

/** Cubo unitario [-1, 1]³ condiviso. */
export function creaGeometriaImpostore(): BoxGeometry {
  return new BoxGeometry(2, 2, 2);
}

/** Illuminazione diffusa minima del lato notturno, per leggere la sagoma (dichiarata). */
export const AMBIENTE_NOTTE = 0.035;

export function creaMaterialeImpostore(raggi: ArrayLike<number>, emissivo: boolean): MaterialeImpostore {
  const uniforms: UniformiImpostore = {
    uCentro: { value: new Vector3() },
    uAssi: { value: new Matrix3() },
    uMinv: { value: new Matrix3() },
    uO: { value: new Vector3() },
    uRotN: { value: new Matrix3() },
    uSole: { value: new Vector3(1, 0, 0) },
    uRaggi: { value: new Vector3(raggi[0], raggi[1], raggi[2]) },
    uColore: { value: new Vector3(0.5, 0.5, 0.5) },
    uTexture: { value: null },
    uHaTexture: { value: 0 },
    uLon0: { value: 0.5 },
    uVerso: { value: 1 },
    uEmissivo: { value: emissivo ? 1 : 0 },
    uAmbiente: { value: AMBIENTE_NOTTE },
  };
  const m = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    side: BackSide,
    depthTest: true,
    depthWrite: true,
  });
  return m as MaterialeImpostore;
}

// Memoria di lavoro del calcolo su CPU.
const rv = new Float64Array(9); // corpo → vista
const minv = new Float64Array(9);

/**
 * Aggiorna le uniformi in Float64 e le carica come Float32: centro in vista c, rotazione
 * mondo → vista rot, orientamento corpo → mondo orient (3×3 per righe), semiassi r, direzione
 * del Sole in vista (unitaria).
 */
export function aggiornaUniformiImpostore(
  u: UniformiImpostore,
  c: ArrayLike<number>,
  offC: number,
  rot: ArrayLike<number>,
  orient: ArrayLike<number>,
  offO: number,
  r: ArrayLike<number>,
  sx: number,
  sy: number,
  sz: number,
): void {
  // rv = rot · orient
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      rv[3 * i + j] =
        rot[3 * i]! * orient[offO + j]! + rot[3 * i + 1]! * orient[offO + 3 + j]! + rot[3 * i + 2]! * orient[offO + 6 + j]!;
    }
  }
  const r0 = r[0]!;
  const r1 = r[1]!;
  const r2 = r[2]!;
  // minv = diag(1/r) · rvᵀ
  for (let i = 0; i < 3; i++) {
    const ri = i === 0 ? r0 : i === 1 ? r1 : r2;
    for (let j = 0; j < 3; j++) minv[3 * i + j] = rv[3 * j + i]! / ri;
  }
  const cx = c[offC]!;
  const cy = c[offC + 1]!;
  const cz = c[offC + 2]!;
  u.uCentro.value.set(cx, cy, cz);
  u.uAssi.value.set(
    rv[0]! * r0, rv[1]! * r1, rv[2]! * r2,
    rv[3]! * r0, rv[4]! * r1, rv[5]! * r2,
    rv[6]! * r0, rv[7]! * r1, rv[8]! * r2,
  );
  u.uMinv.value.set(minv[0]!, minv[1]!, minv[2]!, minv[3]!, minv[4]!, minv[5]!, minv[6]!, minv[7]!, minv[8]!);
  // Camera nel sistema del corpo scalato: minv · (0 - c), in Float64.
  u.uO.value.set(
    -(minv[0]! * cx + minv[1]! * cy + minv[2]! * cz),
    -(minv[3]! * cx + minv[4]! * cy + minv[5]! * cz),
    -(minv[6]! * cx + minv[7]! * cy + minv[8]! * cz),
  );
  u.uRotN.value.set(rv[0]!, rv[1]!, rv[2]!, rv[3]!, rv[4]!, rv[5]!, rv[6]!, rv[7]!, rv[8]!);
  u.uSole.value.set(sx, sy, sz);
}

export function creaMeshImpostore(geometria: BoxGeometry, materiale: MaterialeImpostore): Mesh {
  const m = new Mesh(geometria, materiale);
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  m.visible = false;
  return m;
}

// Alone del Sole limitato in pixel (R5): quadrato in spazio schermo attorno al centro, miscela
// additiva, profondità del centro del Sole (i corpi davanti lo nascondono).

const VERTEX_ALONE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uCentro;
uniform float uLatoPx;
uniform vec2 uRisoluzione;
uniform float uPixelRatio;
varying vec2 vLocale;
void main() {
  vec4 clip = projectionMatrix * vec4(uCentro, 1.0);
  vLocale = position.xy * uLatoPx;
  gl_Position = clip;
  #include <logdepthbuf_vertex>
  // Divisione prospettica nel vertex shader, come per i marcatori: stesso w per i quattro vertici.
  if (clip.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  gl_Position = vec4(clip.xy / clip.w + position.xy * uLatoPx * uPixelRatio * 2.0 / uRisoluzione, clip.z / clip.w, 1.0);
}
`;

const FRAGMENT_ALONE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uRaggioPx;
uniform float uAlonePx;
uniform vec3 uColore;
uniform float uW;
varying vec2 vLocale;
${GLSL_PROFONDITA}
void main() {
  float d = length(vLocale);
  if (d < uRaggioPx * 0.98) discard;
  float x = max(d - uRaggioPx, 0.0) / uAlonePx;
  float a = exp(-4.0 * x) * (1.0 - smoothstep(0.75, 1.0, x)) * 0.55;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColore * a, a);
  ssScriviProfondita(uW);
}
`;

export interface UniformiAlone {
  uCentro: { value: Vector3 };
  uLatoPx: { value: number };
  uRisoluzione: { value: Vector2 };
  uPixelRatio: { value: number };
  uRaggioPx: { value: number };
  uAlonePx: { value: number };
  uColore: { value: Vector3 };
  uW: { value: number };
}

export function creaAloneSole(risoluzione: Vector2, colore: ArrayLike<number>): Mesh<PlaneGeometry, ShaderMaterial & { uniforms: UniformiAlone }> {
  const uniforms: UniformiAlone = {
    uCentro: { value: new Vector3() },
    uLatoPx: { value: 1 },
    uRisoluzione: { value: risoluzione },
    uPixelRatio: { value: 1 },
    uRaggioPx: { value: 0 },
    uAlonePx: { value: 10 },
    uColore: { value: new Vector3(colore[0], colore[1], colore[2]) },
    uW: { value: 1 },
  };
  const m = new ShaderMaterial({
    vertexShader: VERTEX_ALONE,
    fragmentShader: FRAGMENT_ALONE,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), m as ShaderMaterial & { uniforms: UniformiAlone });
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.renderOrder = 30;
  return mesh;
}

/**
 * Coordinate texture (u, v) di un punto fisso nel corpo, con la stessa convenzione dello shader
 * (R10): longitudine planetocentrica dall'asse x verso y, u = lon0_u ± lon/2π, v = 0,5 - lat/π
 * (riga 0 al polo nord). Serve alle verifiche su CPU (A25).
 */
export function uvDaPuntoCorpo(x: number, y: number, z: number, lon0u: number, verso: 'est' | 'ovest'): [number, number] {
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(z, Math.hypot(x, y));
  const u = lon0u + ((verso === 'est' ? 1 : -1) * lon) / (2 * Math.PI);
  return [u - Math.floor(u), 0.5 - lat / Math.PI];
}
