// Motore della scena: origine e transizioni (R2, § 10.3), occlusione analitica e lune raggruppate
// (§ 11.5.1), antialiasing temporale (§ 11.4.3), filtri (§ 4.2), stato 'caricamento' (§ 5.6),
// orbite attive (§ 10.2), A25 parte grafica (orbite iperboliche, Terra antioraria vista da +z).

import { describe, expect, it } from 'vitest';
import { UA_KM } from '../../src/ephem/constants';
import { distanzaDaEstensione } from '../../src/render/camera';
import { andamento } from '../../src/render/origin';
import { applicaPreset, creaBanco, frame, tempoFittizio } from './utili';

const JD = 2_461_331.5;

describe('origine e transizioni (R2, § 10.3)', () => {
  it('setOrigin lascia ferma la camera nello spazio; la transizione interpola in scala logaritmica', () => {
    const { m, eff } = creaBanco();
    m.movimentoRidotto = false;
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    const terra = eff.slug('terra');
    const prima = [m.fuoco.origine[0]! + m.camera.position.x, m.fuoco.origine[1]! + m.camera.position.y];
    const d0 = m.distanzaCamera();
    m.impostaFuoco(terra, 0, { transizione: true, inquadratura: { estensioneKm: 1 } });
    // Distanza finale richiesta: estensione minima limitata dalla distanza minima del corpo.
    const dFin = Math.max(m.distanzaMinimaFuoco(), distanzaDaEstensione(1, m.camera.aspect));
    const dopo = [m.fuoco.origine[0]! + m.camera.position.x, m.fuoco.origine[1]! + m.camera.position.y];
    expect(Math.abs(dopo[0]! - prima[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(dopo[1]! - prima[1]!)).toBeLessThan(1e-6);
    // A metà durata: s = 0,5 → distanza = √(d0·d1).
    expect(andamento(0.5)).toBe(0.5);
    m.aggiornaStati(750);
    expect(m.distanzaCamera() / Math.sqrt(d0 * dFin)).toBeCloseTo(1, 9);
    m.aggiornaStati(1500);
    expect(m.fuoco.inTransizione).toBe(false);
    expect(m.target.length()).toBe(0);
    expect(m.distanzaCamera() / dFin).toBeCloseTo(1, 12);
    // Origine sul corpo a fuoco: posizione relativa nulla.
    frame(m, 1600);
    expect(Math.hypot(m.rel[3 * terra]!, m.rel[3 * terra + 1]!, m.rel[3 * terra + 2]!)).toBe(0);
  });

  it('movimento ridotto: transizione immediata', () => {
    const { m, eff } = creaBanco();
    m.movimentoRidotto = true;
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    m.impostaFuoco(eff.slug('marte'), 0, { inquadratura: 'corpo' });
    expect(m.fuoco.inTransizione).toBe(false);
  });

  it('il fuoco segue il corpo durante la riproduzione senza logica aggiuntiva', () => {
    const { m, eff } = creaBanco();
    const giove = eff.slug('giove');
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    m.impostaFuoco(giove, 0, { transizione: false, inquadratura: 'corpo' });
    frame(m, 0);
    const c0 = m.camera.position.clone();
    m.impostaTempo(tempoFittizio(JD + 30));
    frame(m, 16);
    expect(m.camera.position.distanceTo(c0)).toBe(0);
    expect(Math.abs(m.vista[3 * giove + 2]! + m.distanzaCamera())).toBeLessThan(1e-6);
  });
});

describe('marcatori e occlusione (§ 11.5.1)', () => {
  it('Luna dietro la Terra: occlusa; senza la Terra: visibile', () => {
    const { m, eff } = creaBanco();
    const terra = eff.slug('terra');
    const luna = eff.slug('luna');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(terra, 0, { transizione: false });
    frame(m, 0);
    const u = [m.rel[3 * luna]!, m.rel[3 * luna + 1]!, m.rel[3 * luna + 2]!];
    const l = Math.hypot(u[0]!, u[1]!, u[2]!);
    // Camera a 1e5 km dalla parte opposta alla Luna, spostata di 3866 km di lato: la Luna (disco
    // sotto i 10 px) resta dietro il disco della Terra a circa 40 px dal centro, oltre i 12 px.
    const px = -u[1]! / Math.hypot(u[0]!, u[1]!);
    const py = u[0]! / Math.hypot(u[0]!, u[1]!);
    m.impostaPosa([(-u[0]! / l) * 1e5 + px * 3866, (-u[1]! / l) * 1e5 + py * 3866, (-u[2]! / l) * 1e5], [0, 0, 0]);
    frame(m, 0);
    expect(m.occluso[luna]).toBe(1);
    expect(m.opacitaMarcatore[luna]).toBeCloseTo(0.3, 6);
    m.esclusi[terra] = 1;
    frame(m, 0);
    expect(m.occluso[luna]).toBe(0);
  });

  it('lune entro 12 px dal pianeta: nascoste e contate', () => {
    const { m, eff } = creaBanco();
    m.impostaTempo(tempoFittizio(JD));
    applicaPreset(m, 'sistema-interno');
    m.fuoco.completa();
    frame(m, 0);
    expect(m.lunaNascosta[eff.slug('luna')]).toBe(1);
    expect(m.contatoreLune[eff.slug('terra')]).toBe(1);
    expect(m.contatoreLune[eff.slug('marte')]).toBe(2);
    // Selezionata: sempre visibile.
    m.impostaSelezione(eff.slug('luna'));
    frame(m, 0);
    expect(m.lunaNascosta[eff.slug('luna')]).toBe(0);
  });

  it('marcatore sfumato quando il diametro apparente supera 10 px', () => {
    const { m, eff } = creaBanco();
    const terra = eff.slug('terra');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(terra, 0, { transizione: false, inquadratura: 'corpo' });
    frame(m, 0);
    expect(2 * m.raggioPx[terra]!).toBeGreaterThan(10);
    expect(m.opacitaMarcatore[terra]).toBe(0);
    m.impostaDistanza(1e9);
    frame(m, 0);
    expect(m.opacitaMarcatore[terra]).toBe(1);
  });

  it('antialiasing temporale: passo per fotogramma oltre 1/8 del periodo', () => {
    const { m, eff } = creaBanco();
    m.impostaTempo(tempoFittizio(JD));
    applicaPreset(m, 'terra-luna');
    m.fuoco.completa();
    m.velocita = 365.25; // 1 anno/s: 6,1 giorni per fotogramma a 60 Hz
    frame(m, 0);
    const luna = eff.slug('luna');
    expect(m.troppoRapido[luna]).toBe(1);
    expect(m.opacitaMarcatore[luna]).toBe(0);
    expect(m.orbitaEvidenziata[luna]).toBe(1);
    expect(m.orbitaAttiva[luna]).toBe(1);
    expect(m.troppoRapido[eff.slug('marte')]).toBe(0);
    m.velocita = 3652.5; // 61 giorni per fotogramma: oltre 1/8 del periodo di Venere (28 d)
    frame(m, 0);
    expect(m.troppoRapido[eff.slug('venere')]).toBe(1);
    expect(m.troppoRapido[eff.slug('marte')]).toBe(0);
    // Il corpo a fuoco non è soggetto alla regola (la camera lo segue).
    expect(m.troppoRapido[eff.slug('terra')]).toBe(0);
  });
});

describe('filtri, stati e orbite', () => {
  it('categoria primaria o secondaria attiva (§ 4.2); selezione sempre visibile', () => {
    const { m, eff } = creaBanco();
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFiltri(['pianeta']);
    frame(m, 0);
    expect(m.visibile[eff.slug('marte')]).toBe(1);
    expect(m.visibile[eff.slug('cerere')]).toBe(0);
    expect(m.visibile[eff.slug('sole')]).toBe(1);
    m.impostaFiltri(['asteroide']);
    frame(m, 0);
    expect(m.visibile[eff.slug('cerere')]).toBe(1);
    expect(m.visibile[eff.slug('chiron')]).toBe(0);
    m.impostaFiltri(['cometa']);
    frame(m, 0);
    expect(m.visibile[eff.slug('chiron')]).toBe(1);
    expect(m.visibile[eff.slug('3i-atlas')]).toBe(1);
    m.impostaSelezione(eff.slug('marte'));
    frame(m, 0);
    expect(m.visibile[eff.slug('marte')]).toBe(1);
  });

  it("stato 'caricamento': corpo non disegnato e stati richiesti di nuovo", () => {
    const { m, eff } = creaBanco();
    const marte = eff.slug('marte');
    eff.inCaricamento.add(marte);
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    expect(m.visibile[marte]).toBe(0);
    expect(m.info(marte)!.stato).toBe('caricamento');
    eff.inCaricamento.delete(marte);
    frame(m, 16);
    expect(m.visibile[marte]).toBe(1);
  });

  it("livello 'non-determinabile': né marcatore né disco, anche con il corpo risolto", () => {
    const { m, eff } = creaBanco();
    const luna = eff.slug('luna');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(eff.slug('terra'), 0, { transizione: false, inquadratura: { estensioneKm: 1e6 } });
    frame(m, 0);
    expect(m.discoVisibile[luna]).toBe(1);
    expect(m.info(luna)!.visibile).toBe(true);
    eff.livelliForzati.set(luna, 'non-determinabile');
    m.impostaTempo(tempoFittizio(JD + 1e-6));
    frame(m, 16);
    expect(m.opacitaMarcatore[luna]).toBe(0);
    expect(m.discoVisibile[luna]).toBe(0);
    expect(m.info(luna)!.visibile).toBe(false);
  });

  it('orbite attive: pianeti e selezione; lune solo oltre 10 px', () => {
    const { m, eff } = creaBanco();
    m.impostaTempo(tempoFittizio(JD));
    applicaPreset(m, 'sistema-interno');
    m.fuoco.completa();
    m.impostaSelezione(eff.slug('cerere'));
    for (let k = 0; k < 20; k++) frame(m, 16 * k);
    expect(m.orbitaAttiva[eff.slug('venere')]).toBe(1);
    expect(m.orbitaAttiva[eff.slug('cerere')]).toBe(1);
    expect(m.orbitaAttiva[eff.slug('vesta')]).toBe(0);
    applicaPreset(m, 'sistema-giove');
    m.fuoco.completa();
    for (let k = 0; k < 20; k++) frame(m, 16 * k);
    expect(m.orbitaAttiva[eff.slug('io')]).toBe(1);
    expect(m.orbitaAttiva[eff.slug('luna')]).toBe(0);
  });

  it.each([
    ['precisa', 'non-determinata', 0],
    ['buona', 'non-determinata', 0],
    ['approssimata', 'non-determinata', 0],
    ['precisa', 'determinata', 0],
    ['indicativa', 'non-determinata', 1],
    ['indicativa', 'determinata', 1],
    ['non-determinabile', 'determinata', 1],
  ] as const)("orbita tratteggiata solo da 'indicativa' (§ 7.8.2, § 10.2): livello %s, forma %s", (livello, forma, atteso) => {
    const { m, eff } = creaBanco();
    const c = eff.slug('c1995-o1-hale-bopp');
    const orbitAt = eff.orbitAt.bind(eff);
    eff.orbitAt = (s, jd, out) => {
      const esito = orbitAt(s, jd, out);
      if (s === c) out.forma = forma;
      return esito;
    };
    eff.livelliForzati.set(c, livello);
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    expect(m.costruisciOrbita(c)).toBe(true);
    expect(m.orbitaTratteggiata[c]).toBe(atteso);
  });

  it("livello 'non-determinabile' con forma non determinata: nessuna orbita (§ 7.8.2)", () => {
    const { m, eff } = creaBanco();
    const c = eff.slug('c1995-o1-hale-bopp');
    const orbitAt = eff.orbitAt.bind(eff);
    eff.orbitAt = (s, jd, out) => {
      const esito = orbitAt(s, jd, out);
      if (s === c) out.forma = 'non-determinata';
      return esito;
    };
    eff.livelliForzati.set(c, 'non-determinabile');
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    expect(m.costruisciOrbita(c)).toBe(false);
  });

  it('A25: orbite iperboliche aperte; Terra antioraria vista da +z', () => {
    const { m, eff } = creaBanco();
    m.impostaTempo(tempoFittizio(2_458_060.5)); // novembre 2017
    frame(m, 0);
    const oum = eff.slug('1i-oumuamua');
    m.costruisciOrbita(oum);
    expect(m.orbite[oum]!.chiusa).toBe(false);
    expect(m.orbite[oum]!.e).toBeGreaterThan(1);
    const terra = eff.slug('terra');
    m.costruisciOrbita(terra);
    const o = m.orbite[terra]!;
    // Momento angolare dei vertici successivi rispetto al Sole: componente z positiva.
    const a = o.ancora;
    const x0 = a[0]! + o.vertici[0]!;
    const y0 = a[1]! + o.vertici[1]!;
    const x1 = a[0]! + o.vertici[3 * 30]!;
    const y1 = a[1]! + o.vertici[3 * 30 + 1]!;
    expect(x0 * y1 - y0 * x1).toBeGreaterThan(0);
    expect(o.semiasse / UA_KM).toBeCloseTo(1, 2);
  });
});

describe('A25 (parte grafica): convenzione delle texture', () => {
  it('a 12:00 UT (1900-2100) la longitudine 0 della texture terrestre è rivolta al Sole entro ±5°', async () => {
    const { uvDaPuntoCorpo } = await import('../../src/render/impostor');
    const { eff, ori, catalogo } = creaBanco();
    const terra = eff.slug('terra');
    const tex = catalogo[terra]!.texture!;
    const stato = new Float64Array(6);
    const m = new Float64Array(9);
    let max = 0;
    for (let anno = 1900; anno <= 2100; anno += 7) {
      // 12:00 UT del 1° gennaio di ogni anno (calendario gregoriano, Meeus cap. 7).
      const jd = 2_415_020.0 + 365.2425 * (anno - 1900);
      const t = tempoFittizio(Math.floor(jd - 0.5) + 1.0);
      eff.stateAt(terra, t.jdTT, stato);
      expect(ori.orientamento(terra, t, m)).toBe(true);
      const n = Math.hypot(stato[0]!, stato[1]!, stato[2]!);
      const s = [-stato[0]! / n, -stato[1]! / n, -stato[2]! / n];
      // Direzione del Sole nel sistema del corpo: mᵀ·s (colonne di m = assi del corpo).
      const xb = m[0]! * s[0]! + m[3]! * s[1]! + m[6]! * s[2]!;
      const yb = m[1]! * s[0]! + m[4]! * s[1]! + m[7]! * s[2]!;
      const zb = m[2]! * s[0]! + m[5]! * s[1]! + m[8]! * s[2]!;
      const [u] = uvDaPuntoCorpo(xb, yb, zb, tex.lon0_u, tex.verso);
      let du = (u - tex.lon0_u) * 360;
      du -= 360 * Math.round(du / 360);
      max = Math.max(max, Math.abs(du));
    }
    expect(max).toBeLessThan(5);
  });
});
