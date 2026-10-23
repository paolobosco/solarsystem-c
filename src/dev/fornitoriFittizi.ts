// Texture procedurali e stelle fittizie per lo sviluppo (mai importate dal codice di produzione).
// Le texture servono a verificare orientamento, cuciture e terminatore: griglia di 30°,
// meridiano 0 rosso, equatore chiaro, emisfero nord più chiaro.

import type { CorpoCatalogo } from '../data/catalogTypes';
import type { DatiStelle, FornitoreStelle } from '../render/stars';
import type { FornitoreTexture } from '../render/texture';

const COLORI: Readonly<Record<string, string>> = {
  sole: '#fff1d6',
  mercurio: '#8f8a85',
  venere: '#d9c9a0',
  terra: '#2d5f9e',
  marte: '#b5552f',
  giove: '#c9a77d',
  saturno: '#d8c690',
  urano: '#9fd3dc',
  nettuno: '#3f63c7',
  luna: '#9a9a96',
  io: '#d8c35a',
  europa: '#c9bfae',
  ganimede: '#8c8275',
  callisto: '#5f574e',
  titano: '#c99a4b',
  plutone: '#c7a98a',
  caronte: '#8a8580',
  cerere: '#7d7a76',
  vesta: '#a39e94',
  tritone: '#c7b8b0',
  itokawa: '#8f8473',
};

/** Disegna una texture equirettangolare 1024 × 512 con lon0_u = 0,5 e longitudini verso est. */
export function disegnaTextureProva(slug: string): HTMLCanvasElement {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = COLORI[slug] ?? '#888888';
  ctx.fillRect(0, 0, w, h);
  // Emisfero nord più chiaro.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, w, h / 2);
  // Bande per i giganti gassosi.
  if (['giove', 'saturno'].includes(slug)) {
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = k % 2 ? 'rgba(90,60,30,0.25)' : 'rgba(255,240,210,0.15)';
      ctx.fillRect(0, (k * h) / 14, w, h / 28);
    }
  }
  if (slug === 'terra') {
    ctx.fillStyle = '#3f7d3a';
    for (const [lon, lat, rx, ry] of [
      [20, 10, 40, 35],
      [-100, 45, 45, 25],
      [-60, -15, 20, 30],
      [100, 45, 60, 25],
      [135, -25, 25, 12],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(((lon + 180) / 360) * w, ((90 - lat) / 180) * h, (rx / 360) * w, (ry / 180) * h, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  // Griglia di 30°.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Equatore e meridiano 0.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.strokeStyle = '#ff2a2a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  return c;
}

export class TextureFittizie implements FornitoreTexture {
  readonly richieste: string[] = [];
  async carica(corpo: CorpoCatalogo): Promise<HTMLCanvasElement | null> {
    if (!corpo.texture) return null;
    this.richieste.push(corpo.slug);
    return disegnaTextureProva(corpo.slug);
  }
}

/** Generatore pseudocasuale deterministico (mulberry32, T. Ettinger, dominio pubblico). */
function generatore(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cielo fittizio con il numero di stelle del BSC5 (9096), seme 20261018. */
export function stelleFittizie(n = 9096, seme = 20261018): DatiStelle {
  const rnd = generatore(seme);
  const direzione = new Float32Array(3 * n);
  const distanzaPc = new Float32Array(n);
  const velocita = new Float32Array(3 * n);
  const magV = new Float32Array(n);
  const bv = new Float32Array(n);
  const hr = new Uint16Array(n);
  const flag = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const z = 2 * rnd() - 1;
    const f = 2 * Math.PI * rnd();
    const r = Math.sqrt(1 - z * z);
    direzione[3 * i] = r * Math.cos(f);
    direzione[3 * i + 1] = r * Math.sin(f);
    direzione[3 * i + 2] = z;
    // Distribuzione crescente verso la magnitudine limite.
    magV[i] = 6.5 - 8 * Math.pow(rnd(), 3.2);
    bv[i] = -0.3 + 2.1 * rnd() * rnd() + 0.3 * rnd();
    hr[i] = i + 1;
    if (rnd() < 0.3) {
      flag[i] = 1;
      distanzaPc[i] = 5 + 500 * rnd();
      for (let k = 0; k < 3; k++) velocita[3 * i + k] = (rnd() - 0.5) * 1e-4;
    }
  }
  return { numero: n, direzione, distanzaPc, velocita, magV, bv, hr, flag };
}

export class StelleFittizie implements FornitoreStelle {
  async carica(): Promise<DatiStelle> {
    return stelleFittizie();
  }
}
