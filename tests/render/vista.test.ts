// Vista e inquadrature del motore: corpo senza posizione alla data (§ 7.8.2, § 10.3), estensione della vista al
// cambio di aspetto (§ 10.3, § 11.12), inquadratura 'orbita' (§ 11.12), orientamento delle rotazioni retrograde
// (§ 11.4.3), etichette degli anelli di distanza dietro un disco (§ 11.5.1, § 11.5.2).

import { describe, expect, it } from 'vitest';
import { UA_KM } from '../../src/ephem/constants';
import { distanzaMinima, estensioneDaDistanza } from '../../src/render/camera';
import { ESTENSIONE_INIZIALE_KM } from '../../src/render/costanti';
import { Motore } from '../../src/render/motore';
import { EffemeridiFittizie, OrientamentoFittizio, creaCatalogoFittizio } from '../../src/dev/servizioFittizio';
import { PRESET_VISTA } from '../../src/ui/scala';
import { creaBanco, frame, tempoFittizio } from './utili';

const JD = 2_461_331.5;

/** Frazione dei vertici dell'orbita di ssid proiettati fuori dalla vista larghezza × altezza. */
function fuoriVista(m: Motore, ssid: number, larghezza: number, altezza: number): number {
  const o = m.orbite[ssid]!;
  const v = new Float64Array(3);
  let fuori = 0;
  for (let i = 0; i < o.n; i++) {
    m.proiettore.vista(
      m.orbitaPos[3 * ssid]! + o.vertici[3 * i]!,
      m.orbitaPos[3 * ssid + 1]! + o.vertici[3 * i + 1]!,
      m.orbitaPos[3 * ssid + 2]! + o.vertici[3 * i + 2]!,
      v,
      0,
    );
    const davanti = m.proiettore.schermo(v[0]!, v[1]!, v[2]!, v, 0);
    if (!davanti || v[0]! < 0 || v[1]! < 0 || v[0]! > larghezza || v[1]! > altezza) fuori++;
  }
  return fuori / o.n;
}

describe('corpo a fuoco senza posizione alla data (§ 7.8.2, § 10.3)', () => {
  it.each(['corpo', 'orbita'] as const)("inquadratura '%s': camera fuori dal Sole, che fa da origine", (inq) => {
    const { m, eff } = creaBanco();
    const halley = eff.slug('1p-halley');
    const sole = m.registro.sole;
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    eff.livelliForzati.set(halley, 'non-determinabile');
    m.invalidaDati();
    frame(m, 16);
    expect(m.ok[halley]).toBe(0);
    // Vista ravvicinata su un altro corpo, poi fuoco sulla cometa.
    m.impostaFuoco(eff.slug('terra'), 16, { transizione: false, inquadratura: 'corpo' });
    frame(m, 32);
    m.impostaFuoco(halley, 48, { transizione: false, inquadratura: inq });
    frame(m, 64);
    expect(m.fuoco.senzaPosizione).toBe(true);
    expect(m.fuoco.riferimento).toBe(sole);
    const rSole = m.registro.corpi[sole]!.raggioMax;
    expect(m.distanzaMinimaFuoco()).toBe(distanzaMinima(rSole));
    expect(m.distanzaCamera()).toBeGreaterThanOrEqual(distanzaMinima(rSole));
    expect(m.statoVista(false).fuocoSenzaPosizione).toBe(true);
    // Il Sole, origine della scena, è visibile al centro (disco o marcatore secondo la distanza).
    const ps = m.posizioneSchermo(sole)!;
    expect(ps.visibile).toBe(true);
    expect(Math.hypot(ps.x - 960, ps.y - 540)).toBeLessThan(1);
    if (inq === 'corpo') expect(m.discoVisibile[sole]).toBe(1);
    else expect(fuoriVista(m, halley, 1920, 1080)).toBe(0);
    // Lo zoom non porta la camera dentro il Sole.
    m.impostaDistanza(1);
    expect(m.distanzaCamera()).toBeCloseTo(distanzaMinima(rSole), 6);
  });

  it('vista ampia mantenuta: Sistema interno resta tale', () => {
    const { m, eff } = creaBanco();
    const halley = eff.slug('1p-halley');
    m.impostaTempo(tempoFittizio(JD));
    eff.livelliForzati.set(halley, 'non-determinabile');
    frame(m, 0);
    const d0 = m.distanzaCamera();
    m.impostaFuoco(halley, 16, { transizione: false, inquadratura: 'corpo' });
    frame(m, 32);
    expect(m.distanzaCamera() / d0).toBeCloseTo(1, 12);
  });

  it('la data cambia e il corpo a fuoco perde la posizione: distanza minima del primario', () => {
    const { m, eff } = creaBanco();
    const halley = eff.slug('1p-halley');
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    m.impostaFuoco(halley, 16, { transizione: false, inquadratura: 'corpo' });
    frame(m, 32);
    expect(m.distanzaMinimaFuoco()).toBe(distanzaMinima(m.registro.corpi[halley]!.raggioMax));
    eff.livelliForzati.set(halley, 'non-determinabile');
    m.impostaTempo(tempoFittizio(JD + 1));
    frame(m, 48);
    expect(m.distanzaMinimaFuoco()).toBe(distanzaMinima(m.registro.corpi[m.registro.sole]!.raggioMax));
  });
});

describe('estensione della vista al cambio di aspetto (§ 10.3, § 11.12)', () => {
  it('canvas creata fuori dal DOM (300 × 150) e montata in verticale: Sistema interno, 4 UA', () => {
    const { m } = creaBanco(300, 150);
    expect(estensioneDaDistanza(m.distanzaCamera(), m.camera.aspect) / ESTENSIONE_INIZIALE_KM).toBeCloseTo(1, 12);
    expect(ESTENSIONE_INIZIALE_KM).toBe(PRESET_VISTA.find((p) => p.id === 'sistema-interno')!.ampiezzaKm);
    for (const [w, h] of [
      [400, 800],
      [412, 839],
      [800, 1280],
    ]) {
      m.impostaAspetto(w! / h!);
      expect(m.statoVista(false).estensioneKm / (4 * UA_KM)).toBeCloseTo(1, 12);
    }
  });

  it('rotazione 1024 × 768 → 768 × 1024 → 1024 × 768: ampiezza invariata', () => {
    const { m } = creaBanco(1024, 768);
    const e0 = m.statoVista(false).estensioneKm;
    m.impostaAspetto(768 / 1024);
    expect(m.statoVista(false).estensioneKm / e0).toBeCloseTo(1, 12);
    m.impostaAspetto(1024 / 768);
    expect(m.statoVista(false).estensioneKm / e0).toBeCloseTo(1, 12);
  });

  it('durante una transizione di fuoco: estensione finale quella richiesta', () => {
    const { m, eff } = creaBanco(1440, 900);
    m.movimentoRidotto = false;
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0, 1440, 900);
    m.impostaFuoco(eff.slug('giove'), 0, { inquadratura: { estensioneKm: 5e6 } });
    m.aggiornaStati(500);
    m.impostaAspetto(400 / 800);
    m.aggiornaStati(2000);
    expect(m.fuoco.inTransizione).toBe(false);
    expect(m.statoVista(false).estensioneKm / 5e6).toBeCloseTo(1, 9);
  });
});

describe("inquadratura 'orbita' (§ 11.12)", () => {
  it.each([
    [400, 800, 'saturno'],
    [400, 800, 'terra'],
    [1280, 800, 'saturno'],
    [1280, 800, 'terra'],
    [1280, 800, 'marte'],
    [1280, 800, 'cerere'],
    [1280, 800, 'luna'],
    [412, 839, '1p-halley'],
  ] as const)('%i × %i, %s: orbita intera nella vista', (w, h, slug) => {
    const { m, eff } = creaBanco(w, h);
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0, w, h);
    const s = eff.slug(slug);
    m.impostaFuoco(s, 0, { transizione: false, inquadratura: 'orbita' });
    frame(m, 16, w, h);
    expect(m.orbite[s]!.valida).toBe(true);
    expect(fuoriVista(m, s, w, h)).toBe(0);
    // Non troppo lontana: lato minore entro 1,5 volte quello che contiene la distanza dal primario più l'apocentro.
    const p = m.registro.corpi[s]!.primario;
    const r = Math.hypot(m.stati[6 * s]! - m.stati[6 * p]!, m.stati[6 * s + 1]! - m.stati[6 * p + 1]!, m.stati[6 * s + 2]! - m.stati[6 * p + 2]!);
    expect(m.statoVista(false).estensioneKm).toBeLessThan((1.5 * 2 * (r + m.orbite[s]!.semiasse * (1 + m.orbite[s]!.e))) / 0.85);
  });

  // Collegamento #slug all'avvio (§ 11.12): il fuoco è impostato prima del primo calcolo degli stati.
  it.each(['luna', 'terra', 'marte', '1p-halley'] as const)('%s richiesta prima degli stati: vista uguale a quella con gli stati', (slug) => {
    const dopo = creaBanco();
    dopo.m.impostaTempo(tempoFittizio(JD));
    frame(dopo.m, 0);
    dopo.m.impostaFuoco(dopo.eff.slug(slug), 0, { transizione: false, inquadratura: 'orbita' });
    frame(dopo.m, 16);

    const prima = creaBanco();
    prima.m.impostaTempo(tempoFittizio(JD));
    const s = prima.eff.slug(slug);
    prima.m.impostaFuoco(s, 0, { transizione: false, inquadratura: 'orbita' });
    frame(prima.m, 16);

    expect(fuoriVista(prima.m, s, 1920, 1080)).toBe(0);
    expect(prima.m.statoVista(false).estensioneKm / dopo.m.statoVista(false).estensioneKm).toBeCloseTo(1, 9);
  });

  it('richiesta prima degli stati: riapplicata una sola volta, poi la camera resta libera', () => {
    const { m, eff } = creaBanco();
    const s = eff.slug('luna');
    m.impostaTempo(tempoFittizio(JD));
    m.impostaFuoco(s, 0, { transizione: false, inquadratura: 'orbita' });
    frame(m, 16);
    const e = m.statoVista(false).estensioneKm;
    m.fuoco.scalaDistanza(0.5);
    m.invalidaDati();
    frame(m, 32);
    frame(m, 48);
    expect(m.statoVista(false).estensioneKm / e).toBeCloseTo(0.5, 9);
  });
});

describe('rotazioni retrograde (§ 11.4.3)', () => {
  it('periodo negativo nel catalogo: orientamento ricalcolato a ogni data, anche in pausa', () => {
    const catalogo = creaCatalogoFittizio();
    // Convenzione di catalog.json: periodo negativo per le rotazioni retrograde.
    for (const c of catalogo) {
      if (c.slug === 'venere' || c.slug === 'urano') c.fisica.rotazione = { ...c.fisica.rotazione!, valore: -Math.abs(c.fisica.rotazione!.valore) };
    }
    const eff = new EffemeridiFittizie(catalogo);
    const m = new Motore({ catalogo, effemeridi: eff, orientamento: new OrientamentoFittizio(catalogo, eff), aspetto: 16 / 9 });
    m.velocita = 0;
    const scarto = (slug: string, dj: number): number => {
      const s = eff.slug(slug);
      m.impostaTempo(tempoFittizio(JD));
      m.aggiornaStati(0);
      const o0 = m.orient.slice(9 * s, 9 * s + 9);
      m.impostaTempo(tempoFittizio(JD + dj));
      m.aggiornaStati(16);
      let max = 0;
      for (let k = 0; k < 9; k++) max = Math.max(max, Math.abs(m.orient[9 * s + k]! - o0[k]!));
      return max;
    };
    expect(m.registro.perSlug.get('venere')!.rotazioneOre!).toBeLessThan(0);
    expect(scarto('venere', 20)).toBeGreaterThan(0.1);
    expect(scarto('urano', 0.2)).toBeGreaterThan(0.1);
    expect(scarto('marte', 0.1)).toBeGreaterThan(0.1);
  });

  it('in riproduzione rapida il blocco vale con il periodo in valore assoluto', () => {
    const catalogo = creaCatalogoFittizio();
    const eff = new EffemeridiFittizie(catalogo);
    const m = new Motore({ catalogo, effemeridi: eff, orientamento: new OrientamentoFittizio(catalogo, eff), aspetto: 16 / 9 });
    const v = eff.slug('venere');
    expect(m.registro.corpi[v]!.rotazioneOre!).toBeLessThan(0);
    m.impostaTempo(tempoFittizio(JD));
    m.aggiornaStati(0);
    const o0 = m.orient.slice(9 * v, 9 * v + 9);
    // 3000 giorni per secondo: passo per fotogramma di 50 giorni, oltre 1/8 di 243 giorni.
    m.velocita = 3000;
    m.impostaTempo(tempoFittizio(JD + 30));
    m.aggiornaStati(16);
    for (let k = 0; k < 9; k++) expect(m.orient[9 * v + k]).toBe(o0[k]);
  });
});

describe('etichette degli anelli di distanza dietro un disco (§ 11.5.1, § 11.5.2)', () => {
  it('punto dell\'anello dietro la Terra: nessuna etichetta sopra il disco', () => {
    const w = 1920;
    const h = 1080;
    const { m, eff } = creaBanco(w, h);
    const terra = eff.slug('terra');
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0, w, h);
    m.impostaFuoco(terra, 0, { transizione: false });
    frame(m, 16, w, h);
    // Candidato j = 0 dell'anello di 2 UA (angolo π/8), dietro la Terra lungo la direzione di vista.
    const k = m.anelli.findIndex((a) => Math.abs(a.raggio - 2 * UA_KM) < 1);
    const th = Math.PI / 8;
    const o = m.fuoco.origine;
    const p = [2 * UA_KM * Math.cos(th) - o[0]!, 2 * UA_KM * Math.sin(th) - o[1]!, -o[2]!];
    const l = Math.hypot(p[0]!, p[1]!, p[2]!);
    const rT = m.registro.corpi[terra]!.raggioMax;
    m.impostaPosa(p.map((x) => (-1.2 * rT * x) / l), [0, 0, 0]);
    frame(m, 32, w, h);
    expect(m.anelli[k]!.visibile).toBe(true);
    const sch = m.posizioneSchermo(terra)!;
    expect(Math.abs(sch.x - w / 2)).toBeLessThan(1);
    // Il disco della Terra copre tutta la vista: ogni punto degli anelli sullo schermo è dietro il disco.
    expect(m.raggioPx[terra]!).toBeGreaterThan(Math.hypot(w, h) / 2);
    for (let j = 0; j < m.anelli.length; j++) expect(m.layout.candidata[m.n + j], `anello ${j}`).toBe(0);
  });

  it('senza dischi davanti l\'etichetta resta', () => {
    const { m } = creaBanco();
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0);
    const k = m.anelli.findIndex((a) => Math.abs(a.raggio - UA_KM) < 1);
    expect(m.layout.candidata[m.n + k]).toBe(1);
  });
});

/** Elevazione (gradi, con segno) della direzione camera - bersaglio sul piano dell'orbita di luna attorno a primario. */
function elevazioneSulPiano(m: Motore, primario: number, luna: number): number {
  const s = m.stati;
  const r = [0, 1, 2].map((k) => s[6 * luna + k]! - s[6 * primario + k]!);
  const v = [3, 4, 5].map((k) => s[6 * luna + k]! - s[6 * primario + k]!);
  const h = [r[1]! * v[2]! - r[2]! * v[1]!, r[2]! * v[0]! - r[0]! * v[2]!, r[0]! * v[1]! - r[1]! * v[0]!];
  const c = m.vettoreCamera();
  const p = (c[0]! * h[0]! + c[1]! * h[1]! + c[2]! * h[2]!) / (Math.hypot(c[0]!, c[1]!, c[2]!) * Math.hypot(h[0]!, h[1]!, h[2]!));
  return (Math.asin(p) * 180) / Math.PI;
}

describe('vista dei sistemi planetari: 30° sul piano delle lune (§ 11.3, § 11.5.1)', () => {
  it.each([
    ['terra-luna', 'terra', 'luna'],
    ['plutone-caronte', 'plutone', 'caronte'],
    ['sistema-giove', 'giove', 'ganimede'],
    ['sistema-saturno', 'saturno', 'titano'],
  ] as const)("preset '%s' come nell'interfaccia, dalla vista iniziale", (id, slugP, slugL) => {
    const { m, eff } = creaBanco(1280, 800);
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0, 1280, 800);
    const p = PRESET_VISTA.find((x) => x.id === id)!;
    const s = eff.slug(slugP);
    expect(p.vistaSistema).toBe(true);
    const lato = Math.sign(elevazioneSulPiano(m, s, eff.slug(slugL)));
    m.impostaFuoco(s, 0, { transizione: false, inquadratura: { estensioneKm: p.ampiezzaKm }, vistaSistema: p.vistaSistema });
    frame(m, 16, 1280, 800);
    const el = elevazioneSulPiano(m, s, eff.slug(slugL));
    expect(Math.abs(el)).toBeCloseTo(30, 6);
    // Stesso lato del piano della vista di partenza.
    expect(Math.sign(el)).toBe(lato);
    expect(m.statoVista(false).estensioneKm / p.ampiezzaKm).toBeCloseTo(1, 9);
  });

  it("Saturno: dalla vista iniziale il piano degli anelli è quasi di taglio; il contatore '+N lune' lo apre a 30°", () => {
    const { m, eff } = creaBanco(1280, 800);
    const saturno = eff.slug('saturno');
    const titano = eff.slug('titano');
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0, 1280, 800);
    // Vista iniziale (azimut -90°, 30° sull'eclittica): pochi gradi sull'equatore di Saturno.
    expect(Math.abs(elevazioneSulPiano(m, saturno, titano))).toBeLessThan(4);
    m.impostaFuoco(saturno, 0, { transizione: false, inquadratura: 'sistema' });
    frame(m, 16, 1280, 800);
    expect(Math.abs(elevazioneSulPiano(m, saturno, titano))).toBeCloseTo(30, 6);
    // Asse di rotazione di Saturno (colonna z dell'orientamento): 60° ± 1° dalla direzione di vista.
    const o = m.orient.subarray(9 * saturno, 9 * saturno + 9);
    const c = m.vettoreCamera();
    const cosAsse = Math.abs(c[0]! * o[2]! + c[1]! * o[5]! + c[2]! * o[8]!) / Math.hypot(c[0]!, c[1]!, c[2]!);
    expect(Math.abs((Math.acos(cosAsse) * 180) / Math.PI - 60)).toBeLessThan(1);
  });

  it("elevazione esplicita senza vista del sistema: resta riferita all'eclittica", () => {
    const { m, eff } = creaBanco(1280, 800);
    m.impostaTempo(tempoFittizio(JD));
    frame(m, 0, 1280, 800);
    m.impostaFuoco(eff.slug('giove'), 0, { transizione: false, inquadratura: 'sistema', elevazione: 0.12, vistaSistema: false });
    frame(m, 16, 1280, 800);
    const c = m.vettoreCamera();
    expect(Math.asin(c[2]! / Math.hypot(c[0]!, c[1]!, c[2]!))).toBeCloseTo(0.12, 9);
  });
});
