// Camera con il bersaglio spostato (Maiusc+frecce o trascinamento con il tasto destro, § 11.9): distanza minima dal
// centro del corpo a fuoco anche dopo una rotazione attorno al bersaglio (§ 10.3, RF1); km per pixel della barra di
// scala alla profondità del corpo a fuoco, non alla sua distanza (R14).

import { describe, expect, it } from 'vitest';
import { distanzaMinima } from '../../src/render/camera';
import type { Motore } from '../../src/render/motore';
import { creaBanco, frame, tempoFittizio } from './utili';

const JD = 2_461_331.5;
const L = 1280;
const H = 800;

/** Spostamento di camera e bersaglio nel piano dello schermo, come ControlliCamera.sposta (px CSS). */
function sposta(m: Motore, dxPx: number, dyPx: number): void {
  m.camera.updateMatrixWorld();
  const e = m.camera.matrixWorld.elements;
  const kmPerPx = m.proiettore.kmPerPx(m.distanzaCamera());
  const kx = -dxPx * kmPerPx;
  const ky = dyPx * kmPerPx;
  const d = [e[0]! * kx + e[4]! * ky, e[1]! * kx + e[5]! * ky, e[2]! * kx + e[6]! * ky];
  m.target.set(m.target.x + d[0]!, m.target.y + d[1]!, m.target.z + d[2]!);
  m.camera.position.set(m.camera.position.x + d[0]!, m.camera.position.y + d[1]!, m.camera.position.z + d[2]!);
}

/** Rotazione attorno al bersaglio di dAz in azimut, come ControlliCamera.ruota. */
function ruota(m: Motore, dAz: number): void {
  const t = m.target;
  const p = m.camera.position;
  const x = p.x - t.x;
  const y = p.y - t.y;
  const z = p.z - t.z;
  const r = Math.hypot(x, y, z);
  const az = Math.atan2(y, x) + dAz;
  const el = Math.asin(z / r);
  p.set(t.x + r * Math.cos(el) * Math.cos(az), t.y + r * Math.cos(el) * Math.sin(az), t.z + r * Math.sin(el));
  m.camera.lookAt(t);
}

describe('distanza minima dal centro del corpo a fuoco con il bersaglio spostato (§ 10.3, RF1)', () => {
  it('Terra: spostamento di 4 scatti poi rotazione di 180°, mai sotto R_max + max(0,01·R_max; 0,5 km)', () => {
    const { m, eff } = creaBanco(L, H);
    const terra = eff.slug('terra');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(terra, 0, { transizione: false, inquadratura: 'corpo' });
    frame(m, 0, L, H);
    const dMin = distanzaMinima(m.registro.corpi[terra]!.raggioMax);
    expect(dMin).toBeCloseTo(6441.9, 0);
    m.impostaDistanza(1);
    frame(m, 16, L, H);
    expect(m.distanzaCamera()).toBeCloseTo(dMin, 6);
    for (let k = 0; k < 4; k++) sposta(m, 64, 0);
    frame(m, 32, L, H);
    // Bersaglio fuori dal centro: la distanza camera-bersaglio resta quella minima, il centro si allontana.
    expect(m.target.length()).toBeGreaterThan(1000);
    let minimo = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 36; k++) {
      ruota(m, (5 * Math.PI) / 180);
      m.limitaDistanzaDalCentro();
      frame(m, 48 + 16 * k, L, H);
      minimo = Math.min(minimo, m.camera.position.length());
      // La camera guarda ancora il bersaglio.
      const avanti = m.target.clone().sub(m.camera.position).normalize();
      const asse = m.camera.getWorldDirection(m.target.clone());
      expect(avanti.dot(asse)).toBeCloseTo(1, 9);
    }
    expect(minimo).toBeGreaterThanOrEqual(dMin * (1 - 1e-12));
    expect(m.statoVista(false).distanzaKm).toBeGreaterThanOrEqual(dMin * (1 - 1e-12));
  });

  it('senza spostamento nessun effetto: la camera resta dove i controlli la lasciano', () => {
    const { m, eff } = creaBanco(L, H);
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(eff.slug('marte'), 0, { transizione: false, inquadratura: 'corpo' });
    frame(m, 0, L, H);
    const p0 = m.camera.position.clone();
    expect(m.limitaDistanzaDalCentro()).toBe(false);
    expect(m.camera.position.distanceTo(p0)).toBe(0);
  });
});

describe('barra di scala con il corpo a fuoco fuori dal centro della vista (R14)', () => {
  it('Luna: km per pixel uguali alla profondità del centro divisa per la focale, dopo spostamenti e rotazioni', () => {
    const { m, eff } = creaBanco(L, H);
    const luna = eff.slug('luna');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(luna, 0, { transizione: false, inquadratura: 'corpo' });
    frame(m, 0, L, H);
    const kmPerPx0 = m.statoVista(false).kmPerPx;
    expect(kmPerPx0).toBeCloseTo(m.distanzaCamera() / m.proiettore.focale, 9);
    // Sei scatti di Maiusc+Freccia destra (64 px ciascuno): la profondità della Luna non cambia, la distanza sì.
    for (let k = 0; k < 6; k++) sposta(m, 64, 0);
    frame(m, 16, L, H);
    const v = m.statoVista(false);
    expect(v.distanzaKm / m.distanzaCamera()).toBeGreaterThan(1.07);
    expect(v.kmPerPx / kmPerPx0).toBeCloseTo(1, 9);
    expect(v.kmPerPx).toBeCloseTo(-m.vista[3 * luna + 2]! / m.proiettore.focale, 9);
    // Semiasse tangenziale del disco disegnato: R/b = (km per pixel alla profondità z)·√(1 - R²/z²).
    const b = m.contorno[7 * luna + 3]!;
    const r = m.registro.corpi[luna]!.raggioMax;
    const z = -m.vista[3 * luna + 2]!;
    expect(r / b / (v.kmPerPx * Math.sqrt(1 - (r / z) ** 2))).toBeCloseTo(1, 9);
    // Spostamento e rotazione: vale la profondità del corpo, non la distanza del bersaglio.
    ruota(m, 0.3);
    frame(m, 32, L, H);
    const w = m.statoVista(false);
    expect(w.kmPerPx).toBeCloseTo(-m.vista[3 * luna + 2]! / m.proiettore.focale, 9);
  });

  it('corpo a fuoco dietro la camera: km per pixel alla distanza del bersaglio', () => {
    const { m, eff } = creaBanco(L, H);
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(eff.slug('terra'), 0, { transizione: false, inquadratura: 'corpo' });
    m.impostaPosa([0, -2e4, 0], [0, -1e5, 0]);
    frame(m, 0, L, H);
    expect(m.statoVista(false).kmPerPx).toBeCloseTo(m.distanzaCamera() / m.proiettore.focale, 9);
  });
});
