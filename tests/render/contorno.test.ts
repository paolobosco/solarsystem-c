// Contorno proiettato di un disco vicino e fuori dall'asse ottico (§ 11.5.1, § 11.5.2): ellisse esatta del cono
// tangente; anello di selezione 5 px fuori dal contorno, etichetta del disco grande accanto al contorno, campo visivo.

import { describe, expect, it } from 'vitest';
import { ETICHETTE_SCOSTAMENTO_PX, MARGINE_ANELLO_SELEZIONE_PX } from '../../src/render/costanti';
import { GrafoScena } from '../../src/render/grafo';
import { CELLA_ANELLO } from '../../src/render/markers';
import type { Motore } from '../../src/render/motore';
import { Proiettore, bordoContorno, cordaContorno } from '../../src/render/projection';
import { creaBanco, frame, tempoFittizio } from './utili';

const JD = 2_461_331.5;
const L = 1280;
const H = 800;

/** Valore normalizzato dell'equazione dell'ellisse (1 sul bordo) per il punto (x, y) dello schermo. */
function ellisse(ct: ArrayLike<number>, e: number, x: number, y: number, margine = 0): number {
  const dx = x - ct[e]!;
  const dy = y - ct[e + 1]!;
  const pu = (dx * ct[e + 4]! + dy * ct[e + 5]!) / (ct[e + 2]! + margine);
  const pw = (-dx * ct[e + 5]! + dy * ct[e + 4]!) / (ct[e + 3]! + margine);
  return Math.sqrt(pu * pu + pw * pw);
}

/** Punti del contorno della sfera (centro c in spazio vista, raggio r) proiettati sullo schermo. */
function silhouette(pr: Proiettore, c: readonly number[], r: number, n = 360): [number, number][] {
  const d = Math.hypot(c[0]!, c[1]!, c[2]!);
  const u = c.map((x) => x / d);
  // Base ortonormale perpendicolare a u.
  let e1 = Math.abs(u[2]!) < 0.9 ? [-u[1]!, u[0]!, 0] : [0, -u[2]!, u[1]!];
  const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!);
  e1 = e1.map((x) => x / l1);
  const e2 = [u[1]! * e1[2]! - u[2]! * e1[1]!, u[2]! * e1[0]! - u[0]! * e1[2]!, u[0]! * e1[1]! - u[1]! * e1[0]!];
  // Punti di tangenza: cerchio di centro u·(d - r²/d) e raggio r·√(1 - r²/d²).
  const a = d - (r * r) / d;
  const rho = r * Math.sqrt(1 - (r * r) / (d * d));
  const out: [number, number][] = [];
  const s = new Float64Array(2);
  for (let k = 0; k < n; k++) {
    const f = (2 * Math.PI * k) / n;
    const p = [0, 1, 2].map((j) => u[j]! * a + rho * (Math.cos(f) * e1[j]! + Math.sin(f) * e2[j]!));
    pr.schermo(p[0]!, p[1]!, p[2]!, s, 0);
    out.push([s[0]!, s[1]!]);
  }
  return out;
}

/** Luna selezionata e a fuoco, vicina (disco di circa 145 px), 26° fuori dall'asse ottico. */
function lunaFuoriAsse(): { m: Motore; luna: number } {
  const { m, eff } = creaBanco(L, H);
  const luna = eff.slug('luna');
  m.impostaTempo(tempoFittizio(JD));
  m.impostaFuoco(luna, 0, { transizione: false, inquadratura: 'corpo' });
  m.impostaSelezione(luna);
  const D = 11_000;
  m.impostaPosa([0, -D, 0], [-D * Math.tan((26 * Math.PI) / 180), 0, 0]);
  frame(m, 0, L, H);
  return { m, luna };
}

describe('contorno proiettato di una sfera (§ 11.5.1)', () => {
  it('ellisse esatta: punti di tangenza sul bordo entro 1e-9; sull\'asse cerchio di raggio raggioApparente', () => {
    const { m } = creaBanco(L, H);
    frame(m, 0, L, H);
    const pr = m.proiettore;
    const ct = new Float64Array(7);
    for (const c of [
      [0, 0, -12_000],
      [4000, 0, -9000],
      [-3000, 2500, -8000],
      [1e8, -6e7, -2e8],
    ]) {
      const r = 1737.4 * (c[2]! < -1e6 ? 3e4 : 1);
      expect(pr.contorno(c[0]!, c[1]!, c[2]!, r, ct, 0)).toBe(true);
      for (const [x, y] of silhouette(pr, c, r)) expect(Math.abs(ellisse(ct, 0, x, y) - 1)).toBeLessThan(1e-9);
      if (c[0] === 0 && c[1] === 0) {
        const rp = pr.raggioApparente(r, Math.hypot(c[0]!, c[1]!, c[2]!));
        expect(ct[2]! / rp).toBeCloseTo(1, 12);
        expect(ct[3]! / rp).toBeCloseTo(1, 12);
      }
    }
    // Sfera che attraversa il piano della camera: contorno illimitato.
    expect(pr.contorno(0, 0, -1000, 1500, ct, 0)).toBe(false);
  });

  it('Luna a 26° dall\'asse: ellisse più grande del cerchio di raggioApparente e centro spostato verso l\'esterno', () => {
    const { m, luna } = lunaFuoriAsse();
    const ct = m.contorno;
    const e = 7 * luna;
    const rp = m.raggioPx[luna]!;
    expect(rp).toBeGreaterThan(100);
    expect(ct[e + 2]! - rp).toBeGreaterThan(20);
    expect(ct[e + 3]! - rp).toBeGreaterThan(10);
    expect(Math.abs(ct[e]! - m.schermo[2 * luna]!)).toBeGreaterThan(5);
    // Il vecchio cerchio di raggio raggioApparente + 5 px cade dentro il disco in alto e in basso.
    const x = m.schermo[2 * luna]!;
    const y = m.schermo[2 * luna + 1]!;
    expect(ellisse(ct, e, x, y - rp - MARGINE_ANELLO_SELEZIONE_PX)).toBeLessThan(1);
  });
});

describe('anello di selezione ed etichetta attorno al contorno (§ 11.5.1, § 11.5.2)', () => {
  it('anello: ellisse 5 px fuori dal contorno, centrata sul contorno e orientata lungo la direzione radiale', () => {
    const { m, luna } = lunaFuoriAsse();
    const grafo = new GrafoScena(m, null);
    grafo.sincronizza(1, null);
    const mk = grafo.marcatori;
    let i = -1;
    for (let k = 0; k < mk.n; k++) if (mk.dati[4 * k] === CELLA_ANELLO) i = k;
    expect(i).toBeGreaterThanOrEqual(0);
    const e = 7 * luna;
    const ct = m.contorno;
    const s = new Float64Array(2);
    m.proiettore.schermo(mk.pos[3 * i]!, mk.pos[3 * i + 1]!, mk.pos[3 * i + 2]!, s, 0);
    expect(Math.hypot(s[0]! - ct[e]!, s[1]! - ct[e + 1]!)).toBeLessThan(0.01);
    // Semiassi dell'anello: metà del lato meno 2 px lungo x locale, per il rapporto di forma lungo y locale.
    const A = mk.dati[4 * i + 1]! / 2 - 2;
    const B = A * mk.forma[i]!;
    expect(A - ct[e + 2]!).toBeCloseTo(MARGINE_ANELLO_SELEZIONE_PX, 3);
    expect(B - ct[e + 3]!).toBeCloseTo(MARGINE_ANELLO_SELEZIONE_PX, 3);
    // x locale lungo la direzione radiale (rotazione con y verso l'alto).
    const rot = mk.dati[4 * i + 2]!;
    expect(Math.cos(rot) * ct[e + 4]! - Math.sin(rot) * ct[e + 5]!).toBeCloseTo(1, 6);
    // Ogni punto del contorno ad almeno 4,5 px dentro l'anello, misurato lungo la normale uscente.
    const pr = m.proiettore;
    const c = [m.vista[3 * luna]!, m.vista[3 * luna + 1]!, m.vista[3 * luna + 2]!];
    for (const [x, y] of silhouette(pr, c, m.registro.corpi[luna]!.raggioMax, 720)) {
      const v = ellisse(ct, e, x, y, MARGINE_ANELLO_SELEZIONE_PX - 0.5);
      expect(v).toBeLessThan(1);
    }
  });

  it('etichetta del disco grande accanto al contorno, fuori dal disco, anche fuori dall\'asse', () => {
    const { m, luna } = lunaFuoriAsse();
    expect(m.raggioPx[luna]).toBeGreaterThan(60);
    const L0 = m.layout;
    expect(L0.mostrata[luna]).toBe(1);
    const w = L0.larghezza[luna]!;
    const off = L0.scostamento[luna]!;
    const x0 = L0.lato[luna] === 0 ? L0.x[luna]! + off : L0.x[luna]! - off - w;
    const y0 = L0.y[luna]! - 8;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x0 + w).toBeLessThanOrEqual(L);
    const e = 7 * luna;
    // Nessun punto del riquadro dell'etichetta dentro il contorno.
    for (let y = y0; y <= y0 + 16; y += 1) {
      for (let x = x0; x <= x0 + w; x += 1) expect(ellisse(m.contorno, e, x, y)).toBeGreaterThan(1);
    }
    // Accanto al bordo, oltre l'anello di selezione (5 px): 9 px dal contorno lungo la riga più vicina al centro.
    const riga = L0.y[luna]! > m.contorno[e + 1]! ? y0 : y0 + 16;
    const corda = new Float64Array(2);
    expect(cordaContorno(m.contorno, e, riga, corda)).toBe(true);
    const distanza = L0.lato[luna] === 0 ? x0 - corda[1]! : corda[0]! - (x0 + w);
    expect(distanza).toBeCloseTo(ETICHETTE_SCOSTAMENTO_PX, 3);
    for (let y = y0; y <= y0 + 16; y += 1) {
      for (let x = x0; x <= x0 + w; x += 1) expect(ellisse(m.contorno, e, x, y, MARGINE_ANELLO_SELEZIONE_PX + 1)).toBeGreaterThan(1);
    }
  });

  it('disco grande sull\'asse: etichetta all\'altezza del bordo a 45° sotto il centro', () => {
    const { m, eff } = creaBanco(L, H);
    const terra = eff.slug('terra');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(terra, 0, { transizione: false, inquadratura: 'corpo' });
    m.impostaSelezione(terra);
    frame(m, 0, L, H);
    const e = 7 * terra;
    const rp = m.raggioPx[terra]!;
    expect(rp).toBeGreaterThan(60);
    expect(bordoContorno(m.contorno, e, Math.SQRT1_2, Math.SQRT1_2) / rp).toBeCloseTo(1, 9);
    expect(m.layout.y[terra]! - m.contorno[e + 1]!).toBeCloseTo(Math.SQRT1_2 * rp, 6);
  });
});
