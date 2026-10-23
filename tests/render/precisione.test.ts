// A20 (parte CPU): precisione del rendering con emulazione Float32 (Math.fround) della pipeline
// GPU. Distanza schermo tra corpo e propria orbita < 0,5 px per ogni corpo su 50 date, camera da
// 3 raggi a 1e5 UA, viewport 1920×1080 e 400×800. Confronto con l'orbita non ancorata.

import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { UA_KM } from '../../src/ephem/constants';
import { versoreDaAngoli } from '../../src/render/camera';
import type { Motore } from '../../src/render/motore';
import { SEME_RENDER, creaBanco, frame, generatore, tempoFittizio } from './utili';

const f = Math.fround;

/** clip = M·(x, y, z, 1) con arrotondamento Float32 dopo ogni operazione (M colonna-maggiore, Float32). */
function trasforma(m: Float32Array, x: number, y: number, z: number, out: Float64Array): void {
  for (let r = 0; r < 4; r++) {
    out[r] = f(f(f(f(m[r]! * x) + f(m[4 + r]! * y)) + f(m[8 + r]! * z)) + m[12 + r]!);
  }
}

const tmpA = new Float64Array(4);
const tmpB = new Float64Array(4);

/** Pixel schermo di un punto Float32 attraverso modelView e proiezione Float32; null se dietro. */
function pixel(mv: Float32Array, p: Float32Array, x: number, y: number, z: number, w: number, h: number): [number, number] | null {
  trasforma(mv, f(x), f(y), f(z), tmpA);
  const vx = tmpA[0]!;
  const vy = tmpA[1]!;
  const vz = tmpA[2]!;
  trasforma(p, vx, vy, vz, tmpB);
  const cw = tmpB[3]!;
  if (!(cw > 0)) return null;
  return [f(f(f(tmpB[0]! / cw) + 1) * f(0.5 * w)), f(f(1 - f(tmpB[1]! / cw)) * f(0.5 * h))];
}

function distanzaSegmento(px: number, py: number, a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)) : 0;
  return Math.hypot(a[0] + t * vx - px, a[1] + t * vy - py);
}

const IDENTITA = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

interface Esito {
  disegnato: number;
  vero: number;
  ingenuo: number;
}

/**
 * Distanze schermo (px) tra il corpo e la sua orbita: corpo disegnato (Float32) e vero (Float64)
 * contro la polilinea Float32 ancorata; corpo vero contro la polilinea non ancorata (vertici
 * relativi al primario, come senza ancoraggio).
 */
function misura(m: Motore, ssid: number, w: number, h: number): Esito | null {
  const orb = m.orbite[ssid]!;
  if (!orb.valida || !orb.conCorpo) return null;
  const vi = m.camera.matrixWorldInverse;
  const p = Float32Array.from(m.camera.projectionMatrix.elements);
  // Oggetto dell'orbita: traslazione r_corpo - r_origine (Float64), modelView in doppia precisione.
  const mw = new Matrix4().makeTranslation(m.rel[3 * ssid]!, m.rel[3 * ssid + 1]!, m.rel[3 * ssid + 2]!);
  const mv = Float32Array.from(new Matrix4().multiplyMatrices(vi, mw).elements);
  // Corpo disegnato: posizione in spazio vista caricata come Float32 (marcatore e impostore).
  const corpoD = pixel(IDENTITA, p, m.vista[3 * ssid]!, m.vista[3 * ssid + 1]!, m.vista[3 * ssid + 2]!, w, h);
  const vero = new Float64Array(2);
  const davanti = m.proiettore.schermo(m.vista[3 * ssid]!, m.vista[3 * ssid + 1]!, m.vista[3 * ssid + 2]!, vero, 0);
  if (!corpoD || !davanti) return null;
  const n = orb.n;
  const a = orb.indiceAncora;
  expect(Math.abs(orb.vertici[3 * a]!)).toBe(0);
  const indici: number[] = [];
  if (orb.chiusa) {
    for (let k = 0; k < Math.min(40, n); k++) indici.push(k);
    for (let k = Math.max(40, n - 40); k < n; k++) indici.push(k);
  } else {
    for (let k = Math.max(0, a - 40); k < Math.min(n, a + 40); k++) indici.push(k);
  }
  let dD = Number.POSITIVE_INFINITY;
  let dV = Number.POSITIVE_INFINITY;
  let prec: [number, number] | null = null;
  let precK = -2;
  for (const k of indici) {
    const q = pixel(mv, p, orb.vertici[3 * k]!, orb.vertici[3 * k + 1]!, orb.vertici[3 * k + 2]!, w, h);
    if (q && prec && precK === k - 1) {
      dD = Math.min(dD, distanzaSegmento(corpoD[0], corpoD[1], prec, q));
      dV = Math.min(dV, distanzaSegmento(vero[0]!, vero[1]!, prec, q));
    }
    prec = q;
    precK = k;
  }
  // Orbita non ancorata: vertici Float32 relativi al primario, oggetto sul primario.
  const pr = m.orbitaPrimario[ssid]!;
  const mwP = new Matrix4().makeTranslation(m.rel[3 * pr]!, m.rel[3 * pr + 1]!, m.rel[3 * pr + 2]!);
  const mvP = Float32Array.from(new Matrix4().multiplyMatrices(vi, mwP).elements);
  let dI = Number.POSITIVE_INFINITY;
  prec = null;
  precK = -2;
  for (const k of indici) {
    const q = pixel(
      mvP,
      p,
      orb.ancora[0]! + orb.vertici[3 * k]!,
      orb.ancora[1]! + orb.vertici[3 * k + 1]!,
      orb.ancora[2]! + orb.vertici[3 * k + 2]!,
      w,
      h,
    );
    if (q && prec && precK === k - 1) dI = Math.min(dI, distanzaSegmento(vero[0]!, vero[1]!, prec, q));
    prec = q;
    precK = k;
  }
  return { disegnato: dD, vero: dV, ingenuo: dI };
}

const VIEWPORT: readonly [number, number][] = [
  [1920, 1080],
  [400, 800],
];

describe('A20: orbita ancorata ed emulazione Float32', () => {
  it('corpo e propria orbita entro 0,5 px su 50 date, 5 distanze, 2 viewport', () => {
    const rnd = generatore(SEME_RENDER);
    const banco = creaBanco();
    const m = banco.m;
    const n = m.n;
    let max = 0;
    let maxVero = 0;
    let maxIngenuo = 0;
    let casi = 0;
    let peggiore = '';
    const dir = new Float64Array(3);
    for (let d = 0; d < 50; d++) {
      const jd = 2_378_496.5 + rnd() * 109_573; // 1800-2100
      m.impostaTempo(tempoFittizio(jd));
      for (const [w, h] of VIEWPORT) {
        m.camera.aspect = w / h;
        m.camera.updateProjectionMatrix();
        for (let s = 1; s < n; s++) {
          const c = m.registro.corpi[s]!;
          const r = c.raggioMax > 0 ? c.raggioMax : 1;
          // Una distanza per corpo e data, a rotazione: 3R, 100R, 1 UA, 1e3 UA, 1e5 UA.
          const distanze = [3 * r, 100 * r, UA_KM, 1e3 * UA_KM, 1e5 * UA_KM];
          const dist = distanze[(d + s) % distanze.length]!;
          m.impostaFuoco(s, 0, { transizione: false });
          versoreDaAngoli(2 * Math.PI * rnd(), (Math.PI / 6) * (2 * rnd() - 1), dir);
          m.impostaPosa([dir[0]! * dist, dir[1]! * dist, dir[2]! * dist], [0, 0, 0]);
          frame(m, 0, w, h);
          m.costruisciOrbita(s);
          const e = misura(m, s, w, h);
          if (!e) continue;
          casi++;
          if (e.disegnato > max) {
            max = e.disegnato;
            peggiore = `${c.slug} jd ${jd.toFixed(1)} dist ${dist.toExponential(2)} ${w}x${h}`;
          }
          maxVero = Math.max(maxVero, e.vero);
          maxIngenuo = Math.max(maxIngenuo, e.ingenuo);
        }
      }
    }
    expect(casi).toBeGreaterThan(50 * 2 * 100);
    expect(max, peggiore).toBeLessThan(0.5);
    expect(maxVero).toBeLessThan(0.5);
    // Senza ancoraggio l'errore Float32 dei vertici supera il mezzo pixel.
    expect(maxIngenuo).toBeGreaterThan(0.5);
  });

  it('lune viste con il fuoco sul pianeta: orbita entro 0,5 px a 3 raggi dalla luna', () => {
    const rnd = generatore(SEME_RENDER + 1);
    const { m } = creaBanco();
    const dir = new Float64Array(3);
    let max = 0;
    let casi = 0;
    for (let d = 0; d < 50; d++) {
      m.impostaTempo(tempoFittizio(2_378_496.5 + rnd() * 109_573));
      for (const c of m.registro.corpi) {
        if (c.categoria !== 'luna' || !c.raggi) continue;
        m.impostaFuoco(c.primario, 0, { transizione: false });
        frame(m, 0);
        // Bersaglio sulla luna (non sull'origine), camera a 3 raggi.
        const t = [m.rel[3 * c.ssid]!, m.rel[3 * c.ssid + 1]!, m.rel[3 * c.ssid + 2]!];
        const dist = 3 * c.raggioMax;
        versoreDaAngoli(2 * Math.PI * rnd(), 0.3, dir);
        m.impostaPosa([t[0]! + dir[0]! * dist, t[1]! + dir[1]! * dist, t[2]! + dir[2]! * dist], t);
        frame(m, 0);
        m.costruisciOrbita(c.ssid);
        const e = misura(m, c.ssid, 1920, 1080);
        if (!e) continue;
        casi++;
        max = Math.max(max, e.disegnato, e.vero);
      }
    }
    expect(casi).toBeGreaterThan(1000);
    expect(max).toBeLessThan(0.5);
  });
});
