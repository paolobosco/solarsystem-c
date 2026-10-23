// § 10.2: ricostruzione delle orbite con budget durante la riproduzione (tempo nuovo a ogni frame).
// Nessuna orbita attiva resta esclusa dal budget; le orbite in campo e le lune del sistema a fuoco hanno la
// precedenza; con i dati pubblicati, in riproduzione la distanza tra il marcatore di una luna e la sua orbita
// disegnata resta sotto 1 px anche con il Sole davanti al piano della camera e un corpo non planetario selezionato.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creaOrientamento } from '../../src/app/fornitori';
import { leggiCatalogo } from '../../src/data/catalog';
import { percorsoBlocco } from '../../src/data/manifest';
import { leggiLuna } from '../../src/data/moonReader';
import { leggiTimeDaBuffer } from '../../src/data/timeReader';
import { ServizioEffemeridi, TIPI_BLOCCO } from '../../src/ephem/service';
import { BUDGET_ORBITE, ELEVAZIONE_PREDEFINITA } from '../../src/render/costanti';
import { Motore } from '../../src/render/motore';
import { creaMakeTimeState, impostaModelloTempo } from '../../src/time/timescale';
import { PRESET_VISTA } from '../../src/ui/scala';
import type { IdPreset } from '../../src/ui/testi.it';
import { applicaPreset, creaBanco, frame, tempoFittizio } from './utili';
import type { Banco } from './utili';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const JD0 = 2_461_333.5;
const LARGHEZZA = 1440;
const ALTEZZA = 900;
/** Soglia di § 10.2 in riproduzione: sotto 1 px tra corpo e orbita disegnata. */
const SOGLIA_PX = 1;

function buffer(percorso: string): ArrayBuffer {
  const b = readFileSync(new URL(percorso, DATI));
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

/** Ruota la camera attorno all'asse z passante per il bersaglio. */
function ruotaCamera(m: Motore, azimutGradi: number): void {
  const a = (azimutGradi * Math.PI) / 180;
  const c = m.camera.position;
  const t = m.target;
  const dx = c.x - t.x;
  const dy = c.y - t.y;
  c.set(t.x + dx * Math.cos(a) - dy * Math.sin(a), t.y + dx * Math.sin(a) + dy * Math.cos(a), c.z);
}

/** Distanza in pixel tra il punto proiettato del corpo e la polilinea proiettata dell'orbita disegnata. */
function scartoCorpoOrbitaPx(m: Motore, i: number, vista: Float64Array, s1: Float64Array, s2: Float64Array): number {
  const o = m.orbite[i]!;
  const pr = m.proiettore;
  pr.vista(m.rel[3 * i]!, m.rel[3 * i + 1]!, m.rel[3 * i + 2]!, vista, 0);
  pr.schermo(vista[0]!, vista[1]!, vista[2]!, s1, 0);
  let migliore = Number.POSITIVE_INFINITY;
  let precedente = false;
  let ax = 0;
  let ay = 0;
  for (let j = 0; j < o.n; j++) {
    pr.vista(m.orbitaPos[3 * i]! + o.vertici[3 * j]!, m.orbitaPos[3 * i + 1]! + o.vertici[3 * j + 1]!, m.orbitaPos[3 * i + 2]! + o.vertici[3 * j + 2]!, vista, 0);
    if (!pr.schermo(vista[0]!, vista[1]!, vista[2]!, s2, 0)) {
      precedente = false;
      continue;
    }
    const bx = s2[0]!;
    const by = s2[1]!;
    if (precedente) {
      const vx = bx - ax;
      const vy = by - ay;
      const l2 = vx * vx + vy * vy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((s1[0]! - ax) * vx + (s1[1]! - ay) * vy) / l2)) : 0;
      migliore = Math.min(migliore, Math.hypot(ax + t * vx - s1[0]!, ay + t * vy - s1[1]!));
    }
    ax = bx;
    ay = by;
    precedente = true;
  }
  return migliore;
}

describe('orbite in riproduzione con i dati pubblicati (§ 10.2)', () => {
  const catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
  const tempo = leggiTimeDaBuffer(buffer('time.json'));
  impostaModelloTempo(tempo.deltaT);
  const makeTimeState = creaMakeTimeState(tempo.deltaT);
  const servizio = new ServizioEffemeridi({ catalogo });
  servizio.impostaLuna(leggiLuna(buffer('moon.bin')));
  for (const t of TIPI_BLOCCO) servizio.registraBlocco(t, 12, buffer(percorsoBlocco(t, 12)));
  const orientamento = creaOrientamento(catalogo.corpi, servizio, tempo.eo);

  /**
   * Riproduzione di `frameTotali` frame a 60 Hz con il preset dato, il corpo `selezione` selezionato e la camera
   * ruotata di `azimut` gradi attorno a z; restituisce il massimo scarto corpo-orbita (px) delle lune del sistema a
   * fuoco con l'orbita attiva e il corpo nel campo, e il numero di orbite attive.
   */
  function riproduci(preset: IdPreset, selezione: string, giorniAlSecondo: number, frameTotali: number, azimut: number): { scarto: number; attive: number } {
    const m = new Motore({ catalogo: catalogo.corpi, effemeridi: servizio, orientamento, aspetto: LARGHEZZA / ALTEZZA, movimentoRidotto: true });
    const ssid = (slug: string): number => m.registro.perSlug.get(slug)!.ssid;
    let jd = JD0;
    m.impostaTempo(makeTimeState(jd, 'UT'));
    frame(m, 0, LARGHEZZA, ALTEZZA);
    const p = PRESET_VISTA.find((x) => x.id === preset)!;
    m.impostaFuoco(ssid(p.fuoco), 0, { inquadratura: { estensioneKm: p.ampiezzaKm }, elevazione: ELEVAZIONE_PREDEFINITA, vistaSistema: p.vistaSistema === true });
    m.fuoco.completa();
    ruotaCamera(m, azimut);
    m.impostaSelezione(ssid(selezione));
    for (let k = 0; k < 5; k++) frame(m, 16 * k, LARGHEZZA, ALTEZZA);
    m.velocita = giorniAlSecondo;
    const fuoco = m.fuoco.fuoco;
    const lune: number[] = [];
    for (let i = 0; i < m.n; i++) if (m.registro.corpi[i]!.categoria === 'luna' && m.registro.corpi[i]!.primario === fuoco) lune.push(i);
    const vista = new Float64Array(3);
    const s1 = new Float64Array(2);
    const s2 = new Float64Array(2);
    let scarto = 0;
    let attive = 0;
    for (let f = 0; f < frameTotali; f++) {
      jd += giorniAlSecondo / 60;
      m.impostaTempo(makeTimeState(jd, 'UT'));
      frame(m, 100 + 16 * f, LARGHEZZA, ALTEZZA);
      attive = 0;
      for (let i = 0; i < m.n; i++) attive += m.orbitaAttiva[i]!;
      for (const i of lune) {
        if (m.orbitaAttiva[i] !== 1 || !m.orbite[i]!.valida || m.ok[i] !== 1 || m.nelCampo[i] !== 1) continue;
        const d = scartoCorpoOrbitaPx(m, i, vista, s1, s2);
        if (d < 1e6) scarto = Math.max(scarto, d);
      }
    }
    return { scarto, attive };
  }

  /** Azimut della camera attorno a z (gradi): il Sole è davanti al piano della camera per 90°-180° (Luna), 180°-270° (Giove), 45°-180° (Saturno). */
  const AZIMUT = [45, 135, 180, 270];

  it.each([
    ['terra-luna', 1, 480],
    ['terra-luna', 7, 240],
    ['sistema-giove', 7, 360],
    ['sistema-saturno', 7, 360],
  ] as const)('%s a %i giorni simulati al secondo, cometa selezionata: scarto lune-orbita sotto 1 px per ogni azimut', (preset, giorni, frameTotali) => {
    let massimo = 0;
    for (const az of AZIMUT) {
      const r = riproduci(preset, '1p-halley', giorni, frameTotali, az);
      // Premessa: le orbite attive superano il budget (fuoco più BUDGET_ORBITE).
      expect(r.attive).toBeGreaterThan(1 + BUDGET_ORBITE);
      massimo = Math.max(massimo, r.scarto);
    }
    expect(massimo).toBeLessThan(SOGLIA_PX);
  }, 120_000);

  it('terra-luna a 1 giorno simulato al secondo, asteroide selezionato: scarto Luna-orbita sotto 1 px', () => {
    let massimo = 0;
    for (const az of [135, 180]) massimo = Math.max(massimo, riproduci('terra-luna', 'cerere', 1, 480, az).scarto);
    expect(massimo).toBeLessThan(SOGLIA_PX);
  }, 120_000);
});

describe('selezione delle orbite da ricostruire (§ 10.2, servizio fittizio)', () => {
  /** Riproduzione a 1 giorno/s nel Sistema interno con le orbite di tutti i corpi attive. */
  function bancoSistemaInterno(azimut: number): Banco {
    const b = creaBanco(LARGHEZZA, ALTEZZA);
    const { m } = b;
    m.impostaTempo(tempoFittizio(JD0));
    frame(m, 0, LARGHEZZA, ALTEZZA);
    applicaPreset(m, 'sistema-interno');
    m.fuoco.completa();
    ruotaCamera(m, azimut);
    for (let i = 1; i < m.n; i++) m.orbiteExtra.add(i);
    m.velocita = 1;
    return b;
  }

  it('con le orbite di tutti i corpi attive nessuna resta esclusa dal budget', () => {
    const { m } = bancoSistemaInterno(135);
    let attive = 0;
    let anzianitaMassima = 0;
    for (let k = 0; k < 600; k++) {
      m.impostaTempo(tempoFittizio(JD0 + (k + 1) / 60));
      frame(m, 100 * k, LARGHEZZA, ALTEZZA);
      attive = 0;
      for (let i = 0; i < m.n; i++) {
        if (m.orbitaAttiva[i] !== 1) continue;
        attive++;
        if (k >= 300) anzianitaMassima = Math.max(anzianitaMassima, m.versioneTempo - m.orbitaVersioneTempo[i]!);
      }
      expect(m.orbiteRicostruiteUltimoFrame).toBeLessThanOrEqual(BUDGET_ORBITE);
    }
    expect(attive).toBeGreaterThan(50);
    // Ogni orbita attiva è ricostruita almeno ogni `attive` frame.
    expect(anzianitaMassima).toBeLessThanOrEqual(attive);
  });

  it('con una cometa selezionata e il Sole davanti al piano della camera la Luna è ricostruita a ogni frame', () => {
    const { m, eff } = creaBanco(LARGHEZZA, ALTEZZA);
    const luna = eff.slug('luna');
    m.impostaTempo(tempoFittizio(JD0));
    frame(m, 0, LARGHEZZA, ALTEZZA);
    applicaPreset(m, 'terra-luna');
    m.fuoco.completa();
    ruotaCamera(m, 135);
    m.impostaSelezione(eff.slug('1p-halley'));
    for (let k = 0; k < 5; k++) frame(m, 16 * k, LARGHEZZA, ALTEZZA);
    expect(m.davanti[eff.slug('sole')]).toBe(1);
    m.velocita = 1;
    for (let k = 0; k < 300; k++) {
      m.impostaTempo(tempoFittizio(JD0 + (k + 1) / 60));
      frame(m, 100 + 16 * k, LARGHEZZA, ALTEZZA);
      expect(m.orbitaAttiva[luna]).toBe(1);
      expect(m.orbitaVersioneTempo[luna]).toBe(m.versioneTempo);
    }
  });

  it('le orbite fuori campo non precedono quelle dei corpi nel campo (al più un posto riservato)', () => {
    const { m } = bancoSistemaInterno(135);
    let frameConAttesa = 0;
    for (let k = 0; k < 300; k++) {
      m.impostaTempo(tempoFittizio(JD0 + (k + 1) / 60));
      frame(m, 100 + 16 * k, LARGHEZZA, ALTEZZA);
      let nelCampoInAttesa = 0;
      let fuoriCampoRicostruite = 0;
      for (let i = 0; i < m.n; i++) {
        if (m.orbitaAttiva[i] !== 1) continue;
        const nelCampo = m.visibile[i] === 1 && m.nelCampo[i] === 1;
        const aggiornata = m.orbitaVersioneTempo[i] === m.versioneTempo;
        if (nelCampo && !aggiornata) nelCampoInAttesa++;
        if (!nelCampo && aggiornata) fuoriCampoRicostruite++;
      }
      if (nelCampoInAttesa === 0) continue;
      frameConAttesa++;
      expect(fuoriCampoRicostruite).toBeLessThanOrEqual(1);
    }
    // Premessa: le orbite in campo superano il budget.
    expect(frameConAttesa).toBeGreaterThan(250);
  });
});
