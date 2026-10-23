// A10: scala reale. Raggi di impostori e marcatori risolti uguali al catalogo (errore relativo
// < 1e-9); nessun fattore di scala nel grafo di scena.

import { describe, expect, it } from 'vitest';
import { Matrix3, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { GrafoScena } from '../../src/render/grafo';
import type { UniformiImpostore } from '../../src/render/impostor';
import { creaBanco, frame, tempoFittizio } from './utili';

function colonna(m: Matrix3, c: number): Vector3 {
  const e = m.elements; // colonna-maggiore
  return new Vector3(e[3 * c], e[3 * c + 1], e[3 * c + 2]);
}

describe('A10: scala reale', () => {
  it('raggi del motore uguali al catalogo', () => {
    const { m, catalogo } = creaBanco();
    for (const c of catalogo) {
      const atteso = c.fisica.raggi_km?.valore ?? null;
      const r = m.registro.corpi[c.ssid]!.raggi;
      if (!atteso) {
        expect(r).toBeNull();
        continue;
      }
      for (let k = 0; k < 3; k++) expect(Math.abs(r![k]! / atteso[k]! - 1)).toBeLessThan(1e-9);
    }
  });

  it('impostori e raggi apparenti dai raggi del catalogo, nessuna scala nel grafo', () => {
    const { m, catalogo } = creaBanco();
    const grafo = new GrafoScena(m, null);
    m.impostaTempo(tempoFittizio(2_461_331.5));
    let verificati = 0;
    for (const c of catalogo) {
      const raggi = c.fisica.raggi_km?.valore;
      if (!raggi) continue;
      // Camera a 4 raggi massimi dal corpo, fuoco sul corpo.
      m.impostaFuoco(c.ssid, 0, { transizione: false });
      const rmax = Math.max(...raggi);
      m.impostaPosa([0, -4 * rmax, 1.5 * rmax], [0, 0, 0]);
      frame(m, 0);
      grafo.sincronizza(1, null);
      const mesh = grafo.impostori[c.ssid]!;
      expect(mesh.visible).toBe(true);
      const u = mesh.material.uniforms as UniformiImpostore;
      // Semiassi in spazio vista: norme delle colonne di uAssi (Float64 prima del caricamento).
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(colonna(u.uAssi.value, k).length() / raggi[k]! - 1)).toBeLessThan(1e-9);
      }
      // Raggio apparente del motore: focale·R/√(d² - R²) con R dal catalogo.
      const d = m.dist[c.ssid]!;
      const atteso = (m.proiettore.focale * rmax) / Math.sqrt(d * d - rmax * rmax);
      expect(Math.abs(m.raggioPx[c.ssid]! / atteso - 1)).toBeLessThan(1e-9);
      verificati++;
    }
    expect(verificati).toBeGreaterThan(90);
    // Nessun fattore di scala: ogni oggetto ha scala unitaria e matrice mondo senza scala.
    grafo.scena.updateMatrixWorld(true);
    const s = new Vector3();
    grafo.scena.traverse((o: Object3D) => {
      expect(o.scale.x).toBe(1);
      expect(o.scale.y).toBe(1);
      expect(o.scale.z).toBe(1);
      s.setFromMatrixScale(o.matrixWorld);
      expect(Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1)).toBeLessThan(1e-12);
    });
    // Geometria dell'impostore: cubo unitario [-1, 1]³.
    const g = (grafo.impostori.find((x) => x) as Mesh).geometry;
    g.computeBoundingBox();
    expect(g.boundingBox!.min.toArray()).toEqual([-1, -1, -1]);
    expect(g.boundingBox!.max.toArray()).toEqual([1, 1, 1]);
  });

  it('oggetti riscritti a ogni frame con frustumCulled = false', () => {
    const { m } = creaBanco();
    const grafo = new GrafoScena(m, null);
    grafo.scena.traverse((o) => {
      if (o !== grafo.scena) expect(o.frustumCulled).toBe(false);
    });
  });
});
