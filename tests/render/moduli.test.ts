// Moduli del rendering: etichette (§ 11.5.2), selezione (§ 11.5.3), stelle (§ 8.8, § 9), nomi brevi,
// camera e barra di scala (§ 10.3, R14), proiezione.

import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { distanzaMinima } from '../../src/render/camera';
import { ETICHETTE_ISTERESI_MS } from '../../src/render/costanti';
import { LayoutEtichette } from '../../src/render/labels';
import { nomeBreve } from '../../src/render/nomi';
import { Selettore } from '../../src/render/picking';
import type { DatiSelezione } from '../../src/render/picking';
import { Proiettore, intersezioneEllissoide, intersezioneSfera } from '../../src/render/projection';
import { FLAG_MOTO_3D, direzioneAllaData, rgbCorpoNero, temperaturaDaBV } from '../../src/render/stars';
import type { DatiStelle } from '../../src/render/stars';
import { SEME_RENDER, generatore } from './utili';

describe('etichette (§ 11.5.2)', () => {
  function layout(n: number): LayoutEtichette {
    const l = new LayoutEtichette(n);
    l.larghezza.fill(50);
    l.scostamento.fill(9);
    l.candidata.fill(1);
    l.classe.fill(5);
    return l;
  }

  it('collisioni: vince la classe più alta, la seconda passa a sinistra, la terza è nascosta', () => {
    const l = layout(3);
    l.x.set([100, 100, 100]);
    l.y.set([100, 104, 108]);
    l.classe.set([5, 1, 5]);
    l.aggiorna(0, 800, 600);
    expect(l.mostrata[1]).toBe(1);
    expect(l.lato[1]).toBe(0);
    expect(l.mostrata.reduce((a, b) => a + b, 0)).toBe(2);
    expect(l.mostrata[0]! + l.mostrata[2]!).toBe(1);
  });

  it('al massimo 25 etichette sotto i 600 px di larghezza', () => {
    const l = layout(100);
    for (let i = 0; i < 100; i++) {
      l.x[i] = 10 + (i % 5) * 100;
      l.y[i] = 10 + Math.floor(i / 5) * 30;
    }
    l.aggiorna(0, 599, 800);
    expect(l.mostrata.reduce((a, b) => a + b, 0)).toBe(25);
    const largo = layout(100);
    largo.x.set(l.x);
    largo.y.set(l.y);
    largo.aggiorna(0, 1200, 800);
    expect(largo.mostrata.reduce((a, b) => a + b, 0)).toBeGreaterThan(25);
  });

  it('isteresi di 300 ms; le etichette forzate cambiano subito', () => {
    const l = layout(3);
    l.x.set([300, 1000, 1000]);
    l.y.set([100, 100, 100]);
    l.aggiorna(0, 800, 600);
    expect(l.mostrata[0]).toBe(1);
    // Due etichette di classe 1 occupano i due lati dell'etichetta 0, che deve sparire.
    l.x.set([300, 310, 240]);
    l.classe.set([5, 1, 1]);
    l.candidata.set([1, 1, 1]);
    expect(l.aggiorna(100, 800, 600)).toBe(true);
    expect(l.mostrata[0]).toBe(1);
    l.aggiorna(ETICHETTE_ISTERESI_MS - 1, 800, 600);
    expect(l.mostrata[0]).toBe(1);
    l.aggiorna(ETICHETTE_ISTERESI_MS, 800, 600);
    expect(l.mostrata[0]).toBe(0);
    // Etichetta forzata (selezione o puntatore): visibile subito.
    l.classe[0] = 0;
    l.invalida();
    l.aggiorna(ETICHETTE_ISTERESI_MS + 1, 800, 600);
    expect(l.mostrata[0]).toBe(1);
    // Ancoraggio fuori dal campo: nascosta subito.
    l.classe[0] = 5;
    l.candidata[0] = 0;
    l.aggiorna(ETICHETTE_ISTERESI_MS + 2, 800, 600);
    expect(l.mostrata[0]).toBe(0);
  });

  it('ingressi cambiati tra due disposizioni: altri frame fino alla disposizione successiva', () => {
    // Rendering su richiesta: senza frame aggiuntivi l'etichetta resterebbe nascosta (cambio di data).
    const l = layout(1);
    l.x[0] = 300;
    l.y[0] = 100;
    l.candidata[0] = 0;
    expect(l.aggiorna(0, 800, 600)).toBe(false);
    expect(l.mostrata[0]).toBe(0);
    l.candidata[0] = 1;
    expect(l.aggiorna(40, 800, 600)).toBe(true);
    expect(l.mostrata[0]).toBe(0);
    expect(l.aggiorna(100, 800, 600)).toBe(false);
    expect(l.mostrata[0]).toBe(1);
    // Spostamento oltre mezzo pixel tra due disposizioni: nuova disposizione con le posizioni aggiornate.
    l.x[0] = 400;
    expect(l.aggiorna(150, 800, 600)).toBe(true);
    expect(l.aggiorna(200, 800, 600)).toBe(false);
  });
});

describe('selezione (§ 11.5.3)', () => {
  function dati(punti: [number, number][], precedenza: number[]): DatiSelezione {
    return {
      n: punti.length,
      schermo: Float64Array.from(punti.flat()),
      marcatoreSelezionabile: new Uint8Array(punti.length).fill(1),
      discoVisibile: new Uint8Array(punti.length),
      precedenza,
      colpisceDisco: () => false,
    };
  }

  it('tolleranze 12 px (mouse) e 22 px (tocco)', () => {
    const s = new Selettore(1);
    const d = dati([[100, 100]], [1]);
    expect(s.scegli(d, 111, 100, 'mouse', 0)?.ssid).toBe(0);
    expect(s.scegli(d, 113, 100, 'mouse', 5000)).toBeNull();
    expect(s.scegli(d, 121, 100, 'touch', 10000)?.ssid).toBe(0);
    expect(s.scegli(d, 123, 100, 'touch', 15000)).toBeNull();
  });

  it('precedenza di categoria, poi distanza; ciclo sui clic ripetuti entro 4 px e 1,5 s', () => {
    const s = new Selettore(3);
    // 0: luna a 2 px; 1: pianeta a 8 px; 2: luna a 5 px.
    const d = dati(
      [
        [102, 100],
        [108, 100],
        [105, 100],
      ],
      [3, 1, 3],
    );
    const a = s.scegli(d, 100, 100, 'mouse', 0)!;
    expect([a.ssid, a.indice, a.totale]).toEqual([1, 1, 3]);
    expect(s.scegli(d, 102, 101, 'mouse', 1000)!.ssid).toBe(0);
    expect(s.scegli(d, 101, 100, 'mouse', 2000)!.ssid).toBe(2);
    expect(s.scegli(d, 101, 100, 'mouse', 2500)!.indice).toBe(1);
    expect(s.scegli(d, 101, 100, 'mouse', 5000)!.ssid).toBe(1);
  });

  it("etichetta sotto il clic: candidato in più con la distanza dal suo marcatore, ordinato come gli altri (§ 11.5.3)", () => {
    const s = new Selettore(3);
    // 0: pianeta a 3 px; 1: luna a 6 px; 2: pianeta a 40 px, fuori tolleranza, con l'etichetta sotto il clic.
    const d = dati(
      [
        [103, 100],
        [106, 100],
        [140, 100],
      ],
      [1, 3, 1],
    );
    expect(s.candidati(d, 100, 100, 12)).toEqual([0, 1]);
    expect(s.candidati(d, 100, 100, 12, 2)).toEqual([0, 2, 1]);
    const a = s.scegli(d, 100, 100, 'mouse', 0, 2)!;
    expect([a.ssid, a.indice, a.totale]).toEqual([0, 1, 3]);
    // Senza altri candidati sotto il clic l'etichetta seleziona il proprio corpo.
    const b = s.scegli(d, 140, 100, 'mouse', 5000, 2)!;
    expect([b.ssid, b.indice, b.totale]).toEqual([2, 1, 1]);
    expect(s.scegli(d, 300, 300, 'mouse', 10000)).toBeNull();
  });

  it("l'etichetta che compare o sparisce tra due clic nello stesso punto non interrompe il ciclo (§ 11.5.3)", () => {
    const s = new Selettore(4);
    // 0, 1, 2: corpi della stessa categoria a 1, 2 e 3 px dal clic; 3: corpo a 30 px, di cui l'etichetta copre il punto.
    const d = dati(
      [
        [101, 100],
        [102, 100],
        [103, 100],
        [130, 100],
      ],
      [1, 1, 1, 1],
    );
    const passo = (ora: number, etichetta?: number): number[] => {
      const e = s.scegli(d, 100, 100, 'mouse', ora, etichetta)!;
      return [e.ssid, e.indice, e.totale];
    };
    expect(passo(0)).toEqual([0, 1, 3]);
    expect(passo(500, 3)).toEqual([1, 2, 4]);
    expect(passo(1000, 3)).toEqual([2, 3, 4]);
    // L'etichetta sparisce dopo aver mostrato il corpo 3: il ciclo riparte dal primo candidato dopo l'ultimo scelto.
    expect(passo(1500)).toEqual([0, 1, 3]);
    expect(passo(2000, 3)).toEqual([1, 2, 4]);
    expect(passo(2500, 3)).toEqual([2, 3, 4]);
    expect(passo(3000, 3)).toEqual([3, 4, 4]);
    expect(passo(3500)).toEqual([0, 1, 3]);
    // Oltre 1,5 s il ciclo ricomincia.
    expect(passo(6000, 3)).toEqual([0, 1, 4]);
  });

  it('intersezioni raggio-sfera e raggio-ellissoide in Float64', () => {
    expect(intersezioneSfera(0, 0, -1, 0, 0, -10, 2)).toBeCloseTo(8, 12);
    expect(intersezioneSfera(0, 0, -1, 0, 3, -10, 2)).toBe(-1);
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(intersezioneEllissoide([0, 0, -1], [0, 0, -10], id, [1, 1, 3])).toBeCloseTo(7, 12);
    expect(intersezioneEllissoide([0, 0, -1], [0.9, 0, -10], id, [1, 1, 3])).toBeGreaterThan(0);
    expect(intersezioneEllissoide([0, 0, -1], [1.1, 0, -10], id, [1, 1, 3])).toBe(-1);
  });
});

describe('stelle (§ 8.8, § 9)', () => {
  it('temperatura da B-V (Ballesteros 2012) e colore del corpo nero', () => {
    expect(temperaturaDaBV(0.65)).toBeGreaterThan(5700);
    expect(temperaturaDaBV(0.65)).toBeLessThan(5850);
    const bianco = rgbCorpoNero(6500);
    expect(Math.min(...bianco)).toBeGreaterThan(0.85);
    const rosso = rgbCorpoNero(3000);
    expect(rosso[0]!).toBeGreaterThan(rosso[2]! * 2);
    const blu = rgbCorpoNero(20_000);
    expect(blu[2]!).toBeGreaterThan(blu[0]!);
  });

  it('direzione alla data con moto 3D e senza moto', () => {
    const s: DatiStelle = {
      numero: 2,
      direzione: Float32Array.from([1, 0, 0, 0, 1, 0]),
      distanzaPc: Float32Array.from([10, 0]),
      velocita: Float32Array.from([0, 1e-3, 0, 0, 0, 0]),
      magV: Float32Array.from([1, 2]),
      bv: Float32Array.from([0, 0]),
      hr: Uint16Array.from([1, 2]),
      flag: Uint8Array.from([FLAG_MOTO_3D, 0]),
    };
    const out = new Float32Array(6);
    direzioneAllaData(s, 0, 1000, out, 0);
    direzioneAllaData(s, 1, 1000, out, 3);
    // normalize(10·(1, 0, 0) + 1000·(0, 1e-3, 0)) = (10, 1, 0)/√101.
    expect(out[0]).toBeCloseTo(10 / Math.sqrt(101), 6);
    expect(out[1]).toBeCloseTo(1 / Math.sqrt(101), 6);
    expect(Array.from(out.subarray(3))).toEqual([0, 1, 0]);
  });
});

describe('nomi brevi (§ 11.5.2)', () => {
  it('comete, interstellari e altri corpi', () => {
    expect(nomeBreve('C/1995 O1 (Hale-Bopp)', 'cometa')).toBe('Hale-Bopp');
    expect(nomeBreve('67P/Churyumov-Gerasimenko', 'cometa')).toBe('67P');
    expect(nomeBreve('1P/Halley', 'cometa')).toBe('Halley');
    expect(nomeBreve('C/1680 V1 (Grande cometa del 1680)', 'cometa')).toBe('C/1680 V1');
    expect(nomeBreve('C/1965 S1-A (Ikeya-Seki)', 'cometa')).toBe('Ikeya-Seki');
    expect(nomeBreve('3I/ATLAS', 'interstellare')).toBe('3I/ATLAS');
    expect(nomeBreve('52 Europa', 'asteroide')).toBe('52 Europa');
  });
});

describe('camera e proiezione (§ 10.3, R14)', () => {
  it('distanza minima', () => {
    expect(distanzaMinima(6378)).toBeCloseTo(6378 + 63.78, 9);
    expect(distanzaMinima(10)).toBeCloseTo(10.5, 12);
  });

  it('proiezione su CPU uguale a Vector3.project di three', () => {
    const cam = new PerspectiveCamera(45, 1.6, 1e-5, 1e15);
    cam.up.set(0, 0, 1);
    cam.position.set(3e5, -2e5, 1e5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const p = new Proiettore();
    p.imposta(cam, 1600, 1000);
    const rnd = generatore(SEME_RENDER);
    const v = new Float64Array(3);
    const s = new Float64Array(2);
    for (let k = 0; k < 200; k++) {
      const x = (rnd() - 0.5) * 2e5;
      const y = (rnd() - 0.5) * 2e5;
      const z = (rnd() - 0.5) * 2e5;
      p.vista(x, y, z, v, 0);
      p.schermo(v[0]!, v[1]!, v[2]!, s, 0);
      const t = new Vector3(x, y, z).project(cam);
      expect(Math.abs(s[0]! - (t.x + 1) * 800)).toBeLessThan(1e-6);
      expect(Math.abs(s[1]! - (1 - t.y) * 500)).toBeLessThan(1e-6);
    }
  });
});
