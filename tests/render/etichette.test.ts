// Etichette (§ 11.5.2) e zone coperte dai pannelli dell'interfaccia (§ 11.3): un'etichetta che tocca una
// zona prova l'altro lato, altrimenti resta nascosta; le etichette forzate restano visibili.

import { describe, expect, it } from 'vitest';
import { LayoutEtichette } from '../../src/render/labels';

const LV = 800;
const AV = 600;

/** Layout con un'etichetta larga 60 px nel punto (x, y), di classe data. */
function una(x: number, y: number, classe: number): LayoutEtichette {
  const l = new LayoutEtichette(1);
  l.x[0] = x;
  l.y[0] = y;
  l.larghezza[0] = 60;
  l.scostamento[0] = 9;
  l.candidata[0] = 1;
  l.classe[0] = classe;
  return l;
}

describe('etichette e zone dei pannelli (§ 11.5.2)', () => {
  it('senza zone: etichetta a destra del punto', () => {
    const l = una(400, 300, 5);
    l.aggiorna(0, LV, AV);
    expect(l.mostrata[0]).toBe(1);
    expect(l.lato[0]).toBe(0);
  });

  it('zona sul lato destro: etichetta a sinistra', () => {
    const l = una(400, 300, 5);
    expect(l.impostaZone([{ x: 420, y: 250, larghezza: 200, altezza: 100 }])).toBe(true);
    l.aggiorna(0, LV, AV);
    expect(l.mostrata[0]).toBe(1);
    expect(l.lato[0]).toBe(1);
  });

  it('zona su entrambi i lati: etichetta nascosta, anche se tocca la zona di un solo pixel', () => {
    const l = una(400, 300, 5);
    l.impostaZone([
      { x: 468, y: 0, larghezza: 100, altezza: AV },
      { x: 0, y: 307, larghezza: LV, altezza: 10 },
    ]);
    l.aggiorna(0, LV, AV);
    expect(l.mostrata[0]).toBe(0);
  });

  it('le zone valgono anche per le etichette degli anelli di distanza (classe 6) e per il contatore delle lune', () => {
    const l = una(100, 100, 6);
    l.larghezza[0] = 120; // nome più "+3 lune"
    l.impostaZone([{ x: 200, y: 90, larghezza: 50, altezza: 20 }]);
    l.aggiorna(0, LV, AV);
    // A destra il riquadro [109, 229] tocca la zona; a sinistra [-29, 91] esce dalla vista.
    expect(l.mostrata[0]).toBe(0);
  });

  it('etichetta forzata (selezione): lato libero se c\'è, altrimenti mostrata comunque', () => {
    const l = una(400, 300, 0);
    l.impostaZone([{ x: 420, y: 250, larghezza: 200, altezza: 100 }]);
    l.aggiorna(0, LV, AV);
    expect([l.mostrata[0], l.lato[0]]).toEqual([1, 1]);
    const m = una(400, 300, 0);
    m.impostaZone([{ x: 0, y: 0, larghezza: LV, altezza: AV }]);
    m.aggiorna(0, LV, AV);
    expect([m.mostrata[0], m.lato[0]]).toEqual([1, 0]);
  });

  it('zone invariate: nessun ricalcolo; zone cambiate: ricalcolo al frame successivo', () => {
    const l = una(400, 300, 5);
    l.aggiorna(0, LV, AV);
    expect(l.impostaZone([])).toBe(false);
    expect(l.impostaZone([{ x: 300, y: 250, larghezza: 300, altezza: 100 }])).toBe(true);
    expect(l.impostaZone([{ x: 300, y: 250, larghezza: 300, altezza: 100 }])).toBe(false);
    // Entro l'intervallo di 100 ms la zona nuova vale lo stesso: impostaZone invalida il layout.
    l.aggiorna(10, LV, AV);
    // Isteresi di 300 ms prima di nascondere un'etichetta già mostrata.
    l.aggiorna(400, LV, AV);
    expect(l.mostrata[0]).toBe(0);
  });
});

describe('marcatore del corpo selezionato (§ 11.5.2)', () => {
  /** Anello di selezione attorno a un marcatore di 8 px: raggio 4 + 5 + 2. */
  const R_ANELLO = 11;

  /** Corpo 0 selezionato in (400, 300); corpo 1 a 28 px a sinistra, con un'etichetta larga 26 px di classe data. */
  function coppia(classeAltro: number): LayoutEtichette {
    const l = new LayoutEtichette(2);
    for (const [i, x, classe, w] of [
      [0, 400, 0, 60],
      [1, 372, classeAltro, 26],
    ] as const) {
      l.x[i] = x;
      l.y[i] = 300;
      l.larghezza[i] = w;
      l.scostamento[i] = 9;
      l.candidata[i] = 1;
      l.classe[i] = classe;
    }
    return l;
  }

  it('senza marcatore protetto l\'etichetta di un altro corpo, a destra del proprio punto, copre il marcatore selezionato', () => {
    const l = coppia(1);
    l.aggiorna(0, LV, AV);
    // Riquadro dell'etichetta [381, 407] x [292, 308] contro il marcatore con l'anello [389, 411] x [289, 311].
    expect([l.mostrata[1], l.lato[1]]).toEqual([1, 0]);
  });

  it('con il marcatore protetto l\'etichetta di un altro corpo prova l\'altro lato', () => {
    const l = coppia(1);
    expect(l.impostaProtetto(0, R_ANELLO)).toBe(true);
    l.aggiorna(0, LV, AV);
    expect([l.mostrata[1], l.lato[1]]).toEqual([1, 1]);
  });

  it('nessun lato libero (zona dei pannelli a sinistra): l\'etichetta di un altro corpo resta nascosta', () => {
    const l = coppia(1);
    l.impostaZone([{ x: 300, y: 250, larghezza: 70, altezza: 100 }]);
    l.impostaProtetto(0, R_ANELLO);
    l.aggiorna(0, LV, AV);
    expect(l.mostrata[1]).toBe(0);
  });

  it('un\'etichetta forzata (corpo sotto il puntatore) resta visibile anche se nessun lato è libero', () => {
    const l = coppia(0);
    l.impostaZone([{ x: 300, y: 250, larghezza: 70, altezza: 100 }]);
    l.impostaProtetto(0, R_ANELLO);
    l.aggiorna(0, LV, AV);
    expect(l.mostrata[1]).toBe(1);
  });

  it('l\'etichetta del corpo protetto, accanto all\'anello, non è esclusa da se stessa', () => {
    const l = coppia(1);
    l.impostaProtetto(0, R_ANELLO);
    l.aggiorna(0, LV, AV);
    // Riquadro [409, 469]: tocca il riquadro dell'anello [389, 411] ma resta a destra.
    expect([l.mostrata[0], l.lato[0]]).toEqual([1, 0]);
  });

  it('protezione tolta o corpo non candidato: nessun effetto; impostazione invariata: nessun ricalcolo', () => {
    const l = coppia(1);
    l.impostaProtetto(0, R_ANELLO);
    expect(l.impostaProtetto(0, R_ANELLO)).toBe(false);
    expect(l.impostaProtetto(-1, 0)).toBe(true);
    l.aggiorna(0, LV, AV);
    expect(l.lato[1]).toBe(0);
    const m = coppia(1);
    m.candidata[0] = 0;
    m.impostaProtetto(0, R_ANELLO);
    m.aggiorna(0, LV, AV);
    expect(m.lato[1]).toBe(0);
  });

  it('il cambio della protezione ricalcola subito, entro l\'intervallo di 100 ms', () => {
    const l = coppia(1);
    l.aggiorna(0, LV, AV);
    expect(l.lato[1]).toBe(0);
    l.impostaProtetto(0, R_ANELLO);
    l.aggiorna(10, LV, AV);
    // Isteresi di 300 ms sul cambio di lato di un'etichetta già mostrata.
    l.aggiorna(400, LV, AV);
    expect([l.mostrata[1], l.lato[1]]).toEqual([1, 1]);
  });
});
