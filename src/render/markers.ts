// Marcatori (§ 11.5.1, § 11.1): sprite SVG con forme e colori per categoria, dimensione costante
// in pixel, variante cava per l'affidabilità "indicativa" (§ 7.8.2), anello di selezione.
// Le forme sono tracciati SVG (viewBox 32 × 32, centro 16, 16) rasterizzati in un atlante con
// Path2D; le istanze hanno posizione in spazio vista (riscritta a ogni frame, Float64 → Float32).

import {
  BufferAttribute,
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  ShaderMaterial,
  Vector2,
} from 'three';
import type { Texture } from 'three';
import { CATEGORIE_PER_PRECEDENZA } from '../data/catalogTypes';
import type { CategoriaCorpo } from '../data/catalogTypes';
import { CELLA_MARCATORE_PX, COLORE_CATEGORIA, COLORE_SPAZIO } from './costanti';

interface Tratto {
  d: string;
  riempito: boolean;
  spessore: number;
  alfa: number;
}

function cerchio(cx: number, cy: number, r: number): string {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
}

function poligono(punti: readonly (readonly [number, number])[]): string {
  return punti.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`).join(' ') + ' Z';
}

function pentagono(r: number): string {
  const p: [number, number][] = [];
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / 5;
    p.push([16 + r * Math.cos(a), 16 + r * Math.sin(a)]);
  }
  return poligono(p);
}

/** Tracciati delle forme piene (§ 11.1): dimensioni nominali 12, 8, 9, 6, 8, 8, 7, 7, 10 px. */
const FORME: Readonly<Record<CategoriaCorpo, readonly Tratto[]>> = {
  sole: [
    { d: cerchio(16, 16, 5.25), riempito: false, spessore: 1.5, alfa: 1 },
    { d: cerchio(16, 16, 1.75), riempito: true, spessore: 0, alfa: 1 },
  ],
  pianeta: [{ d: cerchio(16, 16, 4), riempito: true, spessore: 0, alfa: 1 }],
  'pianeta-nano': [{ d: poligono([[16, 11.5], [20.5, 16], [16, 20.5], [11.5, 16]]), riempito: true, spessore: 0, alfa: 1 }],
  luna: [{ d: cerchio(16, 16, 2.4), riempito: false, spessore: 1.2, alfa: 1 }],
  asteroide: [{ d: poligono([[16, 11.38], [20, 18.31], [12, 18.31]]), riempito: true, spessore: 0, alfa: 1 }],
  centauro: [{ d: pentagono(4), riempito: true, spessore: 0, alfa: 1 }],
  cometa: [
    { d: cerchio(16, 16, 3.5), riempito: true, spessore: 0, alfa: 1 },
    { d: poligono([[19, 14.7], [29, 16], [19, 17.3]]), riempito: true, spessore: 0, alfa: 0.7 },
  ],
  tno: [{ d: poligono([[12.5, 12.5], [19.5, 12.5], [19.5, 19.5], [12.5, 19.5]]), riempito: true, spessore: 0, alfa: 1 }],
  interstellare: [
    {
      d: poligono([[16, 11], [17.25, 14.75], [21, 16], [17.25, 17.25], [16, 21], [14.75, 17.25], [11, 16], [14.75, 14.75]]),
      riempito: true,
      spessore: 0,
      alfa: 1,
    },
  ],
};

/** Variante cava: stesso tracciato, solo contorno; il Sole e le lune assottigliano il tratto. */
function formeCave(c: CategoriaCorpo): readonly Tratto[] {
  return FORME[c].map((t, i) => {
    if (c === 'sole' && i === 1) return { ...t, alfa: 0 };
    if (!t.riempito) return { ...t, spessore: t.spessore * 0.6 };
    return { ...t, riempito: false, spessore: 1.25 };
  });
}

/** SVG del marcatore, riutilizzabile dall'interfaccia (legenda, scheda). */
export function svgMarcatore(categoria: CategoriaCorpo, cavo = false, colore = COLORE_CATEGORIA[categoria]): string {
  const tratti = cavo ? formeCave(categoria) : FORME[categoria];
  const corpo = tratti
    .filter((t) => t.alfa > 0)
    .map((t) =>
      t.riempito
        ? `<path d="${t.d}" fill="${colore}" fill-opacity="${t.alfa}"/>`
        : `<path d="${t.d}" fill="none" stroke="${colore}" stroke-width="${t.spessore}" stroke-opacity="${t.alfa}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">${corpo}</svg>`;
}

/** Indice della cella nell'atlante: piene 0..8 nell'ordine di CATEGORIE_PER_PRECEDENZA, cave 9..17. */
export function cellaMarcatore(categoria: CategoriaCorpo, cavo: boolean): number {
  return CATEGORIE_PER_PRECEDENZA.indexOf(categoria) + (cavo ? CATEGORIE_PER_PRECEDENZA.length : 0);
}

/** Cella speciale: anello di selezione procedurale. */
export const CELLA_ANELLO = -1;

export const COLONNE_ATLANTE = 8;
export const RIGHE_ATLANTE = 4;
export const SCALA_ATLANTE = 4;

/** Rasterizza l'atlante (bianco = forma, scuro = contorno di separazione). Richiede il DOM. */
export function creaAtlanteMarcatori(): Texture {
  const lato = CELLA_MARCATORE_PX * SCALA_ATLANTE;
  const canvas = document.createElement('canvas');
  canvas.width = lato * COLONNE_ATLANTE;
  canvas.height = lato * RIGHE_ATLANTE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponibile');
  CATEGORIE_PER_PRECEDENZA.forEach((cat) => {
    for (const cavo of [false, true]) {
      const cella = cellaMarcatore(cat, cavo);
      const cx = (cella % COLONNE_ATLANTE) * lato;
      const cy = Math.floor(cella / COLONNE_ATLANTE) * lato;
      ctx.setTransform(SCALA_ATLANTE, 0, 0, SCALA_ATLANTE, cx, cy);
      const tratti = cavo ? formeCave(cat) : FORME[cat];
      // Contorno scuro di separazione sotto la forma.
      ctx.strokeStyle = COLORE_SPAZIO;
      ctx.fillStyle = COLORE_SPAZIO;
      ctx.lineJoin = 'round';
      for (const t of tratti) {
        if (t.alfa <= 0) continue;
        const p = new Path2D(t.d);
        ctx.globalAlpha = 0.8 * t.alfa;
        ctx.lineWidth = (t.riempito ? 0 : t.spessore) + 2;
        ctx.stroke(p);
      }
      ctx.strokeStyle = '#FFFFFF';
      ctx.fillStyle = '#FFFFFF';
      for (const t of tratti) {
        if (t.alfa <= 0) continue;
        const p = new Path2D(t.d);
        ctx.globalAlpha = t.alfa;
        if (t.riempito) ctx.fill(p);
        else {
          ctx.lineWidth = t.spessore;
          ctx.stroke(p);
        }
      }
    }
  });
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos;
attribute vec4 iDati; // cella, lato (px CSS), rotazione (rad), opacità
attribute vec3 iColore;
attribute float iForma; // anello di selezione: rapporto tra i semiassi (minore lungo y locale / maggiore lungo x)
uniform vec2 uRisoluzione;
uniform float uPixelRatio;
varying vec2 vUv;
varying vec2 vLocale;
varying vec3 vColore;
varying float vOpacita;
varying float vCella;
varying float vLato;
varying float vForma;
void main() {
  vec4 clip = projectionMatrix * vec4(iPos, 1.0);
  float lato = iDati.y * uPixelRatio;
  float c = cos(iDati.z);
  float s = sin(iDati.z);
  vec2 q = position.xy;
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  float cella = iDati.x;
  vec2 cxy = vec2(mod(max(cella, 0.0), ${COLONNE_ATLANTE}.0), floor(max(cella, 0.0) / ${COLONNE_ATLANTE}.0));
  vUv = (cxy + vec2(q.x + 0.5, 0.5 - q.y)) / vec2(${COLONNE_ATLANTE}.0, ${RIGHE_ATLANTE}.0);
  vLocale = q * iDati.y;
  vColore = iColore;
  vOpacita = iDati.w;
  vCella = cella;
  vLato = iDati.y;
  vForma = iForma;
  gl_Position = clip;
  #include <logdepthbuf_vertex>
  // Divisione prospettica nel vertex shader (w = 1): i quattro vertici dell'istanza hanno lo stesso w, quindi la
  // geometria non cambia e le varying si interpolano in modo affine. Con w oltre circa 5e11 km alcuni
  // rasterizzatori (SwiftShader) interpolano male le varying e il quadrilatero si spezza.
  if (clip.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  gl_Position = vec4(clip.xy / clip.w + r * lato * 2.0 / uRisoluzione, clip.z / clip.w, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uAtlante;
varying vec2 vUv;
varying vec2 vLocale;
varying vec3 vColore;
varying float vOpacita;
varying float vCella;
varying float vLato;
varying float vForma;
void main() {
  #include <logdepthbuf_fragment>
  if (vCella < -0.5) {
    // Anello di selezione: ellisse di semiassi lato/2 - 2 px (x locale) e vForma volte tanto (y locale), tratto 2 px,
    // contorno scuro. Distanza dal bordo al primo ordine: F/|∇F| con F = |p/R| - 1.
    float r = 0.5 * vLato - 2.0;
    vec2 R = vec2(r, r * vForma);
    vec2 p = vLocale;
    float k1 = length(p / R);
    float k2 = length(p / (R * R));
    float d = k1 * (k1 - 1.0) / max(k2, 1e-6);
    float a = 1.0 - smoothstep(0.6, 1.4, abs(d));
    float bordo = 1.0 - smoothstep(1.4, 2.4, abs(d));
    vec3 col = mix(vec3(0.012, 0.031, 0.024), vColore, a);
    float alfa = max(a, 0.7 * bordo) * vOpacita;
    if (alfa < 0.003) discard;
    gl_FragColor = vec4(col, alfa);
    return;
  }
  vec4 t = texture2D(uAtlante, vUv);
  float alfa = t.a * vOpacita;
  if (alfa < 0.003) discard;
  vec3 col = mix(vec3(0.012, 0.031, 0.024), vColore, clamp(t.r, 0.0, 1.0));
  gl_FragColor = vec4(col, alfa);
}
`;

/** Insieme di istanze dei marcatori, riscritte a ogni frame. */
export class Marcatori {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly capacita: number;
  readonly pos: Float32Array;
  readonly dati: Float32Array;
  readonly colore: Float32Array;
  readonly forma: Float32Array;
  private readonly aPos: InstancedBufferAttribute;
  private readonly aDati: InstancedBufferAttribute;
  private readonly aColore: InstancedBufferAttribute;
  private readonly aForma: InstancedBufferAttribute;
  n = 0;

  constructor(capacita: number, atlante: Texture | null, risoluzione: Vector2) {
    this.capacita = capacita;
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    this.pos = new Float32Array(3 * capacita);
    this.dati = new Float32Array(4 * capacita);
    this.colore = new Float32Array(3 * capacita);
    this.forma = new Float32Array(capacita);
    this.aPos = new InstancedBufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    this.aDati = new InstancedBufferAttribute(this.dati, 4).setUsage(DynamicDrawUsage);
    this.aColore = new InstancedBufferAttribute(this.colore, 3).setUsage(DynamicDrawUsage);
    this.aForma = new InstancedBufferAttribute(this.forma, 1).setUsage(DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iDati', this.aDati);
    g.setAttribute('iColore', this.aColore);
    g.setAttribute('iForma', this.aForma);
    g.instanceCount = 0;
    const m = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uAtlante: { value: atlante },
        uRisoluzione: { value: risoluzione },
        uPixelRatio: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 100;
  }

  inizia(): void {
    this.n = 0;
  }

  /**
   * Aggiunge un'istanza; posizione in spazio vista (Float64 → Float32). forma: per l'anello di selezione, rapporto
   * tra il semiasse lungo y locale e quello lungo x locale (1 = cerchio); x locale ruotato di `rotazione`.
   */
  aggiungi(
    vx: number,
    vy: number,
    vz: number,
    cella: number,
    latoPx: number,
    rotazione: number,
    opacita: number,
    rgb: ArrayLike<number>,
    forma = 1,
  ): void {
    if (this.n >= this.capacita) return;
    const i = this.n++;
    this.pos[3 * i] = vx;
    this.pos[3 * i + 1] = vy;
    this.pos[3 * i + 2] = vz;
    this.dati[4 * i] = cella;
    this.dati[4 * i + 1] = latoPx;
    this.dati[4 * i + 2] = rotazione;
    this.dati[4 * i + 3] = opacita;
    this.colore[3 * i] = rgb[0]!;
    this.colore[3 * i + 1] = rgb[1]!;
    this.colore[3 * i + 2] = rgb[2]!;
    this.forma[i] = forma;
  }

  concludi(pixelRatio: number): void {
    this.mesh.geometry.instanceCount = this.n;
    (this.mesh.material.uniforms['uPixelRatio'] as { value: number }).value = pixelRatio;
    this.aPos.clearUpdateRanges();
    this.aPos.addUpdateRange(0, 3 * this.n);
    this.aPos.needsUpdate = true;
    this.aDati.clearUpdateRanges();
    this.aDati.addUpdateRange(0, 4 * this.n);
    this.aDati.needsUpdate = true;
    this.aColore.clearUpdateRanges();
    this.aColore.addUpdateRange(0, 3 * this.n);
    this.aColore.needsUpdate = true;
    this.aForma.clearUpdateRanges();
    this.aForma.addUpdateRange(0, this.n);
    this.aForma.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }
}
