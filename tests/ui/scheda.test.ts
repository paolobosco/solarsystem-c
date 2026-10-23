// Dati della scheda con i dati pubblicati (§ 11.7, § 11.8, § 11.13): elementi osculanti con cifre coerenti con
// l'accuratezza contro gli elementi di JPL Horizons (tests/fixtures/scheda/elementi-horizons.json), passaggio al
// pericentro più vicino, satelliti circumbinari rispetto al baricentro, distanze del Sole, errori delle lune,
// sorgenti senza parole ripetute, verso della rotazione.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo, CorpoCatalogo } from '../../src/data/catalogTypes';
import { percorsoBlocco } from '../../src/data/manifest';
import { leggiLuna } from '../../src/data/moonReader';
import { leggiAffidabilita } from '../../src/data/reliabilityReader';
import { leggiTimeDaBuffer } from '../../src/data/timeReader';
import { bloccoDi } from '../../src/data/binHeader';
import { C_KM_S, K, UA_KM } from '../../src/ephem/constants';
import { ServizioEffemeridi, TIPI_BLOCCO } from '../../src/ephem/service';
import { JD_MAX_UT_EXCL, JD_MIN_UT, calendarToJd, jdToCalendarLocale } from '../../src/time/calendar';
import { creaMakeTimeState } from '../../src/time/timescale';
import type { TimeState } from '../../src/time/types';
import { CalcolatoreScheda, fonteAllaData, rotazioneMostrata, testoSorgente } from '../../src/ui/datiScheda';
import { MENO, SPAZIO_NB as NB, cifreDaSigma, decimaliLimitati, misuraDistanza, misuraVelocita } from '../../src/ui/format';
import { annuncioPosizione, testoEccentricita, testoOrbitaSenzaElementi, testoPassaggio, testoSenzaPosizione } from '../../src/ui/scheda';
import { testoBande, titoloBanda } from '../../src/ui/messaggi';
import { NOMI_LIVELLI, T, UNITA } from '../../src/ui/testi.it';
import { testoCoordinate } from '../../src/ui/vistaTestuale';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const GRADI = 180 / Math.PI;

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

const catalogo: Catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
const servizio = new ServizioEffemeridi({ catalogo, affidabilita: leggiAffidabilita(buffer(new URL('reliability.bin', DATI))) });
servizio.impostaLuna(leggiLuna(buffer(new URL('moon.bin', DATI))));
for (let k = 0; k < K; k++) for (const t of TIPI_BLOCCO) servizio.registraBlocco(t, k, buffer(new URL(percorsoBlocco(t, k), DATI)));
const calc = new CalcolatoreScheda(servizio, catalogo.corpi);
const corpo = (slug: string): CorpoCatalogo => catalogo.corpi.find((c) => c.slug === slug)!;
const istanteTT = (jd: number): TimeState => ({ jdUT: jd, jdTT: jd, deltaT: 0, deltaTSigma: 0, scalaIngresso: 'TT' });
const istanteUT = (jd: number): TimeState => ({ jdUT: jd, jdTT: jd + 69.2 / 86400, deltaT: 69.2, deltaTSigma: 3.3, scalaIngresso: 'UT' });

interface CasoHorizons {
  slug: string;
  centro: string;
  jdTDB: number;
  e: number;
  q_km: number;
  i_gradi: number;
  nodo_gradi: number;
  argPeri_gradi: number;
  tp_jdTDB: number;
  M_gradi: number;
  a_km: number;
  P_s: number | null;
}

const horizons = JSON.parse(readFileSync(new URL('../fixtures/scheda/elementi-horizons.json', import.meta.url), 'utf-8')) as {
  casi: CasoHorizons[];
};

/** Tolleranza di un angolo mostrato: un'unità dell'ultima cifra, o l'incertezza stimata se maggiore (angoli mal definiti). */
function tolleranzaAngolo(sigmaRad: number): number {
  return Math.max(10 ** -decimaliLimitati(sigmaRad * GRADI, 0, 4), sigmaRad * GRADI);
}

/** Unità dell'ultima cifra mostrata per x con cifre significative. */
function unitaUltimaCifra(x: number, cifre: number): number {
  return 10 ** (Math.floor(Math.log10(Math.abs(x))) - cifre + 1);
}

function differenzaAngolo(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

describe('elementi osculanti: cifre mostrate coerenti con Horizons (§ 11.13)', () => {
  for (const h of horizons.casi) {
    it(`${h.slug} a JD ${h.jdTDB} (${h.centro})`, () => {
      const d = calc.calcola(corpo(h.slug), istanteTT(h.jdTDB));
      const el = d.elementi!;
      const u = el.incertezza;
      // Semiasse maggiore come lo mostra misuraDistanza: in km sotto 0,01 UA, in UA oltre.
      const inKm = Math.abs(el.a) < 0.01 * UA_KM;
      const scala = inKm ? 1 : UA_KM;
      // Per l'iperbole la scheda mostra q al posto di a e non mostra M né P.
      const iperbolica = el.e >= 1;
      const [x, xHz, ux] = iperbolica ? [el.q, h.q_km, u.q] : [el.a, h.a_km, u.a];
      // Con almeno due cifre il valore oltre l'incertezza è marcato "≈": tolleranza pari all'incertezza stimata.
      const cifreA = cifreDaSigma(x / scala, ux / scala, 2, 8);
      expect(Math.abs(x - xHz) / scala, iperbolica ? 'q' : 'a').toBeLessThanOrEqual(Math.max(unitaUltimaCifra(x / scala, cifreA), ux / scala));
      expect(Math.abs(el.e - h.e), 'e').toBeLessThanOrEqual(10 ** -decimaliLimitati(u.e, iperbolica ? 0 : 1, 6));
      if (!iperbolica) expect(differenzaAngolo(el.M * GRADI, h.M_gradi), 'M').toBeLessThanOrEqual(tolleranzaAngolo(u.M));
      // Gli angoli dei satelliti con il piano F non sono confrontabili con quelli eclittici di Horizons.
      if (el.riferimento !== 'planetocentrici-F') {
        expect(Math.abs(el.i * GRADI - h.i_gradi), 'i').toBeLessThanOrEqual(tolleranzaAngolo(u.i));
        expect(differenzaAngolo(el.nodo * GRADI, h.nodo_gradi), 'Ω').toBeLessThanOrEqual(tolleranzaAngolo(u.nodo));
        expect(differenzaAngolo(el.argPeri * GRADI, h.argPeri_gradi), 'ω').toBeLessThanOrEqual(tolleranzaAngolo(u.argPeri));
      }
      if (h.P_s !== null) {
        const pHz = h.P_s / 86400;
        const anni = el.P >= 2 * 365.25;
        const f = anni ? 365.25 : 1;
        const cifreP = cifreDaSigma(el.P / f, u.P / f, 2, 8);
        expect(Math.abs(el.P - pHz) / f, 'P').toBeLessThanOrEqual(unitaUltimaCifra(el.P / f, cifreP));
      }
      // Passaggio al pericentro: il più vicino all'istante, come Horizons; con l'ora solo se σ < 1 h.
      const dT = Math.abs(el.T - h.tp_jdTDB);
      expect(dT, 'T').toBeLessThanOrEqual(u.T < 1 / 24 ? 1 / 24 : Math.max(u.T, 1));
    });
  }

  it('passaggio al pericentro più vicino: Sedna nel 2076, Arrokoth nel 2065 (non 9311 a.C. e 1773)', () => {
    const sedna = calc.calcola(corpo('sedna'), istanteTT(2_461_332.5)).elementi!;
    const arrokoth = calc.calcola(corpo('arrokoth'), istanteTT(2_461_332.5)).elementi!;
    // SBDB: tp 2479264,751 (Sedna, epoca 2461200,5); Horizons: Tp 2475597,06 (Arrokoth, 19/10/2026).
    expect(sedna.T).toBeGreaterThan(2_461_332.5);
    expect(Math.abs(sedna.T - 2_479_300)).toBeLessThan(200);
    expect(arrokoth.T).toBeGreaterThan(2_461_332.5);
    expect(Math.abs(arrokoth.T - 2_475_597.06)).toBeLessThan(30);
  });

  it('forma dell’orbita non determinata: almeno 5 % su a, 0,05 su e e 5° su i', () => {
    const d = calc.calcola(corpo('c1680-v1'), istanteUT(2_461_332.9));
    const el = d.elementi!;
    expect(el.forma).not.toBe('determinata');
    expect(el.incertezza.a / Math.abs(el.a)).toBeGreaterThanOrEqual(0.05);
    expect(el.incertezza.e).toBeGreaterThanOrEqual(0.05);
    expect(el.incertezza.i * GRADI).toBeGreaterThanOrEqual(5);
  });
});

describe('eccentricità delle orbite quasi paraboliche (§ 11.7, § 11.13)', () => {
  // JPL Horizons, elementi osculanti a JD TDB 2461333,500801 (20/10/2026), nel riferimento della scheda (§ 7.6.5):
  // C/1965 S1-A a 77,9 UA rispetto al baricentro (CENTER 500@0), C/2023 A3 a 8,7 UA rispetto al Sole (CENTER 500@10).
  const casi = [
    { slug: 'c1965-s1-ikeya-seki', eHz: 0.9999082778200681 },
    { slug: 'c2023-a3-tsuchinshan-atlas', eHz: 1.000185325264479 },
  ];

  it('forma determinata: valore dal lato di 1 dell’orbita, entro l’ultima cifra da Horizons, coerente con q e a', () => {
    for (const { slug, eHz } of casi) {
      const el = calc.calcola(corpo(slug), istanteTT(2_461_333.500801)).elementi!;
      expect(el.forma, slug).toBe('determinata');
      const u = el.incertezza;
      // e = 1 − q/a: δe non supera |1 − e|·(δq/q ⊕ δa/a).
      expect(u.e, slug).toBeLessThanOrEqual(Math.abs(1 - el.e) * Math.hypot(u.q / el.q, u.a / Math.abs(el.a)) * (1 + 1e-12));
      const testo = testoEccentricita(el.e, u.e);
      const mostrato = Number(testo.replace(',', '.'));
      expect(mostrato !== 1 && mostrato < 1 === eHz < 1, `${slug}: «${testo}»`).toBe(true);
      expect(Math.abs(el.e - eHz), slug).toBeLessThanOrEqual(10 ** -(testo.split(',')[1] ?? '').length);
    }
  });

  it('forma incerta vicino a 1: «≈ 1 (quasi parabolica)»; incertezza oltre 1: «non determinabile»', () => {
    for (const slug of ['c1975-v1-west', 'c1996-b2-hyakutake']) {
      const el = calc.calcola(corpo(slug), istanteTT(2_461_333.5)).elementi!;
      expect(el.forma, slug).not.toBe('determinata');
      expect(testoEccentricita(el.e, el.incertezza.e), slug).toBe(T.scheda.eQuasiParabolica);
    }
    const oumuamua = calc.calcola(corpo('1i-oumuamua'), istanteTT(-1_600_000)).elementi!;
    expect(oumuamua.incertezza.e).toBeGreaterThan(1);
    expect(testoEccentricita(oumuamua.e, oumuamua.incertezza.e)).toBe(T.scheda.eNonDeterminabile);
    // Lontano da 1 le cifre restano quelle dell'incertezza: iperbole intera, ellisse con i decimali.
    expect(testoEccentricita(3.372, 8)).toBe(T.scheda.eNonDeterminabile);
    expect(testoEccentricita(6.1308, 0.5)).toBe('6');
    expect(testoEccentricita(0.96803, 2e-4)).toBe('0,968');
  });
});

describe('satelliti circumbinari di Plutone (Notte, Idra)', () => {
  it('elementi rispetto al baricentro Plutone-Caronte, come JPL (PLU060: Notte a 49 300 km, Idra 65 200 km)', () => {
    for (const [slug, aJpl, eMax] of [
      ['notte', 49_300, 0.03],
      ['idra', 65_200, 0.03],
    ] as const) {
      const d = calc.calcola(corpo(slug), istanteTT(2_451_545));
      const el = d.elementi!;
      expect(el.centroSistema, slug).toBe(true);
      expect(d.rispettoSistema, slug).toBe(true);
      expect(Math.abs(el.a - aJpl) / aJpl, slug).toBeLessThan(0.02);
      expect(el.e, slug).toBeLessThan(eMax);
    }
    // Caronte resta rispetto al centro di Plutone.
    const caronte = calc.calcola(corpo('caronte'), istanteTT(2_451_545)).elementi!;
    expect(caronte.centroSistema).toBe(false);
    expect(caronte.a).toBeCloseTo(19_595.8, 0);
  });
});

describe('blocco "Ora" e cifre delle distanze', () => {
  it('Sole: distanza dalla Terra con tempo luce (§ 11.7), errore della Terra', () => {
    const t = istanteUT(2_461_332.94);
    const d = calc.calcola(corpo('sole'), t);
    const terra = calc.calcola(corpo('terra'), t);
    expect(d.distanzaSoleKm).toBeNull();
    expect(d.distanzaTerraKm!).toBeCloseTo(terra.distanzaSoleKm!, 3);
    expect(d.tempoLuceS!).toBeCloseTo(d.distanzaTerraKm! / C_KM_S, 6);
    expect(d.erroreTerraKm!).toBeCloseTo(terra.erroreKm!, 6);
  });

  it('Luna: distanza dalla Terra con l’errore ε·d (circa 117 km), non ≈ con due cifre', () => {
    const t = istanteUT(2_461_332.94);
    const d = calc.calcola(corpo('luna'), t);
    expect(d.erroreTerraKm!).toBeGreaterThan(50);
    expect(d.erroreTerraKm!).toBeLessThan(300);
    const m = misuraDistanza(d.distanzaTerraKm!, { erroreRelativo: d.erroreTerraKm! / d.distanzaTerraKm! });
    expect(m.approssimato).toBe(false);
    expect(m.valore.replace(/\D/g, '').replace(/0+$/, '').length).toBeGreaterThanOrEqual(4);
    // Stesse cifre nella tabella (stessa funzione di errore).
    expect(calc.errori(corpo('luna'), t)).toEqual({ erroreKm: d.erroreKm, erroreTerraKm: d.erroreTerraKm });
  });

  it('satelliti irregolari: errore con lo scarto radiale dei record, non inferiore allo scarto da JPL Horizons', () => {
    // JPL Horizons, vettori geometrici, centro 500@10, eclittica J2000, km (Febe 609 da sat441l, Imalia 506 da jup347,
    // Terra 399 da DE441), interrogazione del 20/10/2026.
    const casi = [
      { slug: 'febe', jd: 2460928.5, r: [1414821120.791506, -53851839.89992784, -54311013.98818307], terra: [146901527.7918532, -33379140.91570008, 994.7402741424739] },
      { slug: 'febe', jd: 2462260.5, r: [994448097.5408013, 965225427.0973333, -57031955.64795923], terra: [-109565051.5825887, -103662640.2484956, 7435.300411999226] },
      { slug: 'imalia', jd: 2462388.5, r: [-688656419.8476955, -456107144.8958429, 16550117.71628046], terra: [146339066.2681729, -35955127.18890418, 1997.664455249906] },
    ];
    const st = new Float64Array(6);
    for (const c of casi) {
      const t = istanteTT(c.jd);
      const d = calc.calcola(corpo(c.slug), t);
      servizio.stateAt(corpo(c.slug).ssid, c.jd, st);
      const scarto3D = Math.hypot(st[0]! - c.r[0]!, st[1]! - c.r[1]!, st[2]! - c.r[2]!);
      const veroTerra = Math.hypot(c.r[0]! - c.terra[0]!, c.r[1]! - c.terra[1]!, c.r[2]! - c.terra[2]!);
      expect(d.erroreKm!, `${c.slug} ${c.jd}`).toBeGreaterThanOrEqual(scarto3D);
      expect(d.erroreTerraKm!, `${c.slug} ${c.jd}`).toBeGreaterThanOrEqual(Math.abs(d.distanzaTerraKm! - veroTerra));
      expect(calc.rigaTestuale(corpo(c.slug), t).erroreSoleKm).toBe(d.erroreKm);
    }
    // Febe al 3/10/2025: 9,47130 UA secondo Horizons; con il solo ε·d si mostravano 6 cifre («9,47113»).
    const febe = calc.calcola(corpo('febe'), istanteTT(2460928.5));
    expect(misuraDistanza(febe.distanzaSoleKm!, { erroreRelativo: febe.erroreKm! / febe.distanzaSoleKm! }).valore).toBe('9,4711');
  });

  it('lune: errore eliocentrico non inferiore a quello del pianeta, quindi non più cifre', () => {
    const t = istanteUT(2_461_332.94);
    for (const [luna, pianeta] of [
      ['disnomia', 'eris'],
      ['io', 'giove'],
      ['caronte', 'plutone'],
      ['luna', 'terra'],
    ] as const) {
      const l = calc.calcola(corpo(luna), t);
      const p = calc.calcola(corpo(pianeta), t);
      expect(l.erroreKm!, luna).toBeGreaterThanOrEqual(p.erroreKm!);
      const cifre = (x: number, err: number) => misuraDistanza(x, { erroreRelativo: err / x }).valore.replace(/\D/g, '').length;
      expect(cifre(l.distanzaSoleKm!, l.erroreKm!), luna).toBeLessThanOrEqual(cifre(p.distanzaSoleKm!, p.erroreKm!));
    }
  });
});

describe('testi della scheda dai dati', () => {
  it('sorgente delle effemeridi senza parole ripetute, per ogni corpo e fonte', () => {
    const ripetute: string[] = [];
    for (const c of catalogo.corpi) {
      const e = c.effemeridi;
      if (e.modello !== 'satellite' && e.modello !== 'piccolo-corpo') continue;
      for (const f of e.fonti) {
        const testo = testoSorgente(c, (f.inizio + f.fine) / 2);
        expect(fonteAllaData(e.fonti, (f.inizio + f.fine) / 2)).toBe(f);
        const conta = new Map<string, number>();
        for (const p of testo.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3)) conta.set(p, (conta.get(p) ?? 0) + 1);
        const nellaDescrizione = new Map<string, number>();
        for (const p of f.descrizione.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3)) {
          nellaDescrizione.set(p, (nellaDescrizione.get(p) ?? 0) + 1);
        }
        for (const [p, n] of conta) if (n > (nellaDescrizione.get(p) ?? 0) && n > 1) ripetute.push(`${c.slug}: ${testo}`);
      }
    }
    expect(ripetute).toEqual([]);
    expect(testoSorgente(corpo('disnomia'), 2_461_000.5)).toBe('orbita kepleriana di Holler et al. (2021)');
  });

  it('periodo di rotazione in valore assoluto con il verso dall’inclinazione dell’asse', () => {
    for (const slug of ['venere', 'urano', 'plutone']) {
      const r = rotazioneMostrata(corpo(slug).fisica);
      expect(r.retrograda, slug).toBe(true);
      expect(r.ore, slug).toBeGreaterThan(0);
    }
    for (const slug of ['terra', 'marte', 'giove', 'nettuno']) expect(rotazioneMostrata(corpo(slug).fisica).retrograda, slug).toBe(false);
  });

  it('verso della rotazione dei piccoli corpi e dei satelliti con polo WGCCRE (inclinazione dell’asse sull’orbita)', () => {
    for (const slug of ['itokawa', 'steins', 'ida', 'lutetia', '19p-borrelly', 'febe']) {
      const f = corpo(slug).fisica;
      expect(f.inclinazioneAssiale_gradi?.valore, slug).toBeGreaterThan(90);
      expect(rotazioneMostrata(f).retrograda, slug).toBe(true);
    }
    for (const slug of ['cerere', 'pallade', 'vesta', 'eros', '67p-churyumov-gerasimenko']) {
      expect(rotazioneMostrata(corpo(slug).fisica).retrograda, slug).toBe(false);
    }
  });
});

describe('elementi dei pianeti: punto descritto dichiarato nel riferimento', () => {
  it('serie dei baricentri NAIF di DE441: Terra-Luna per la Terra, sistema per i pianeti con satelliti', () => {
    const t = istanteTT(2_461_332.5);
    const atteso: Record<string, string | null> = {
      mercurio: null,
      venere: null,
      terra: 'terra-luna',
      marte: 'sistema',
      giove: 'sistema',
      saturno: 'sistema',
      urano: 'sistema',
      nettuno: 'sistema',
      plutone: 'sistema',
    };
    for (const [slug, b] of Object.entries(atteso)) expect(calc.calcola(corpo(slug), t).elementi!.baricentro, slug).toBe(b);
    // Gli elementi confrontati con Horizons sono quelli dei comandi 1-9 (baricentri), non dei centri (199-999).
    for (const h of horizons.casi.filter((c) => corpo(c.slug).effemeridi.modello === 'pianeta')) {
      expect((h as CasoHorizons & { comando: string }).comando, h.slug).toMatch(/^[1-9]$/);
    }
    for (const slug of ['cerere', 'luna', 'io', 'notte']) expect(calc.calcola(corpo(slug), t).elementi!.baricentro, slug).toBeNull();
    expect(T.scheda.riferimentoElioTerraLuna).toBe('eclittica J2000, eliocentrici del baricentro Terra-Luna');
    expect(T.scheda.riferimentoElioSistema('Plutone')).toBe('eclittica J2000, eliocentrici del baricentro del sistema di Plutone');
  });
});

describe('cifre della velocità e delle coordinate coerenti con l’errore (§ 11.13)', () => {
  it('Notte: velocità rispetto al baricentro con due cifre e "≈" (Horizons, plu060: 0,14340 e 0,14195 km/s)', () => {
    for (const [jd, vHz] of [
      [2_460_310.5, 0.1434],
      [2_470_000.25, 0.14195],
    ] as const) {
      const d = calc.calcola(corpo('notte'), istanteTT(jd));
      const m = misuraVelocita(d.velocitaKmS!, d.erroreVelocitaKmS);
      expect(m.approssimato, String(jd)).toBe(true);
      expect(m.valore, String(jd)).toBe('0,14');
      expect(Math.abs(d.velocitaKmS! - vHz), String(jd)).toBeLessThanOrEqual(d.erroreVelocitaKmS!);
    }
  });

  it('Apophis il 1° gennaio 2120 (livello indicativa, ε 34°): velocità e coordinate senza cifre non significative', () => {
    const t = istanteTT(2_495_400.5);
    const d = calc.calcola(corpo('apophis'), t);
    expect(d.affidabilita.livello).toBe('indicativa');
    const m = misuraVelocita(d.velocitaKmS!, d.erroreVelocitaKmS);
    expect(m.approssimato).toBe(true);
    expect(m.valore.replace(/\D/g, '').length).toBeLessThanOrEqual(2);
    // |v| = 31,1 km/s con errore stimato di 3,1 km/s.
    expect(d.erroreVelocitaKmS!).toBeGreaterThan(2.5);
    const testo = testoCoordinate({ lon: 2.156, lat: -0.039, distanzaSoleKm: d.distanzaSoleKm, erroreSoleKm: d.erroreKm })!;
    expect(testo).toBe(`λ ≈${NB}124°, β ≈${NB}${MENO}2°`);
    // Terra: errore di 2″, due decimali.
    const terra = calc.calcola(corpo('terra'), t);
    expect(misuraVelocita(terra.velocitaKmS!, terra.erroreVelocitaKmS).valore.replace(/\D/g, '').length).toBe(4);
    expect(testoCoordinate({ lon: 2.156, lat: 0, distanzaSoleKm: terra.distanzaSoleKm, erroreSoleKm: terra.erroreKm })).toBe('λ 123,53°, β 0,00°');
  });
});

describe('fasce della panoramica e vista testuale indipendenti dai blocchi in memoria', () => {
  const tempoDati = leggiTimeDaBuffer(buffer(new URL('time.json', DATI))).deltaT;
  const mts = creaMakeTimeState(tempoDati);
  const ora = mts(2_461_333, 'UT');
  // Servizio con il solo blocco della data attuale, come all'avvio dell'applicazione.
  const parziale = new ServizioEffemeridi({ catalogo, affidabilita: leggiAffidabilita(buffer(new URL('reliability.bin', DATI))) });
  parziale.impostaLuna(leggiLuna(buffer(new URL('moon.bin', DATI))));
  for (const t of TIPI_BLOCCO) parziale.registraBlocco(t, bloccoDi(ora.jdTT), buffer(new URL(percorsoBlocco(t, bloccoDi(ora.jdTT)), DATI)));
  const calcParziale = new CalcolatoreScheda(parziale, catalogo.corpi);
  const anno = (a: number) => calendarToJd({ anno: a, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: a < 1583 ? 'giuliano' : 'gregoriano' });
  const livelloA = (b: readonly { jd0: number; jd1: number; livello: string }[], jd: number) => b.find((x) => jd >= x.jd0 && jd < x.jd1)?.livello;

  it('fasce uguali con tutti i blocchi o con il solo blocco della data, con ε_ΔT (§ 7.8.1)', () => {
    for (const slug of ['mercurio', 'luna', 'terra', 'marte', 'giove', 'titano', 'sedna']) {
      const completo = calc.bandeAffidabilita(corpo(slug), ora, mts, JD_MIN_UT, JD_MAX_UT_EXCL, 240)!;
      expect(calcParziale.bandeAffidabilita(corpo(slug), ora, mts, JD_MIN_UT, JD_MAX_UT_EXCL, 240), slug).toEqual(completo);
      // Livello della scheda (velocità angolare istantanea) al centro dei campioni: diverso solo vicino alle soglie.
      let diversi = 0;
      const passo = (JD_MAX_UT_EXCL - JD_MIN_UT) / 240;
      for (let i = 0; i < 240; i++) {
        const t = mts(JD_MIN_UT + (i + 0.5) * passo, 'UT');
        if (calc.calcola(corpo(slug), t).affidabilita.livello !== livelloA(completo, t.jdUT)) diversi++;
      }
      expect(diversi, slug).toBeLessThanOrEqual(24);
    }
    const fasce = (slug: string) => calcParziale.bandeAffidabilita(corpo(slug), ora, mts, JD_MIN_UT, JD_MAX_UT_EXCL, 240)!;
    // Casi osservati: con ω = 0 fuori dai blocchi la Luna era «buona» e Mercurio, Terra, Marte, Giove «precisa» ovunque.
    expect(livelloA(fasce('luna'), anno(-9999) + 10)).toBe('indicativa');
    expect(livelloA(fasce('luna'), anno(-4999))).toBe('approssimata');
    expect(livelloA(fasce('mercurio'), anno(-9636) + 218)).toBe('approssimata');
    expect(livelloA(fasce('terra'), anno(-9999) + 10)).toBe('approssimata');
    expect(livelloA(fasce('marte'), anno(-9999) + 10)).toBe('buona');
    expect(livelloA(fasce('giove'), anno(-9999) + 10)).toBe('buona');
  });

  it('vista testuale: senza i dati della data nessun livello, come nella scheda; con i dati il livello con ε_ΔT', () => {
    const t = mts(810_560, 'UT'); // 12 marzo 2494 a.C., blocco 7
    const senza = calcParziale.rigaTestuale(corpo('marte'), t);
    expect(senza.distanzaSoleKm).toBeNull();
    expect(senza.livello).toBeNull();
    expect(calcParziale.calcola(corpo('marte'), t).stato).toBe('caricamento');
    const con = calc.rigaTestuale(corpo('marte'), t);
    expect(con.livello).toBe('buona');
    expect(con.distanzaSoleKm).not.toBeNull();
    expect(calc.rigaTestuale(corpo('sole'), t).livello).toBeNull();
  });

  it('vista testuale: valori mancanti per i dati non ancora caricati distinti da quelli assenti alla data (§ 11.9)', () => {
    const t = mts(810_560, 'UT'); // blocco 7, non caricato in calcParziale
    for (const slug of ['mercurio', 'marte', 'giove', 'cerere', 'luna']) {
      expect(calcParziale.rigaTestuale(corpo(slug), t).inCaricamento, slug).toBe(true);
      expect(calc.rigaTestuale(corpo(slug), t).inCaricamento, slug).toBe(false);
    }
    // Il Sole non ha il blocco in sospeso: manca la distanza dalla Terra, che è dei dati della Terra.
    expect(calcParziale.rigaTestuale(corpo('sole'), t).inCaricamento).toBe(true);
    expect(calc.rigaTestuale(corpo('sole'), t).inCaricamento).toBe(false);
    // La Terra senza moon.bin: i corpi con i loro dati restano "ok", ma la distanza dalla Terra manca perché non caricata.
    const senzaLuna = new ServizioEffemeridi({ catalogo, affidabilita: leggiAffidabilita(buffer(new URL('reliability.bin', DATI))) });
    for (let k = 0; k < K; k++) for (const tipo of TIPI_BLOCCO) senzaLuna.registraBlocco(tipo, k, buffer(new URL(percorsoBlocco(tipo, k), DATI)));
    const rigaSenzaLuna = new CalcolatoreScheda(senzaLuna, catalogo.corpi).rigaTestuale(corpo('marte'), t);
    expect(rigaSenzaLuna.distanzaSoleKm).not.toBeNull();
    expect(rigaSenzaLuna.distanzaTerraKm).toBeNull();
    expect(rigaSenzaLuna.inCaricamento).toBe(true);
    // Fuori dall'intervallo i valori non esistono: non sono in caricamento.
    const fuori = istanteTT(-2_100_000);
    for (const slug of ['marte', 'sole']) {
      const r = calc.rigaTestuale(corpo(slug), fuori);
      expect(r.inCaricamento, slug).toBe(false);
      expect(r.lon, slug).toBeNull();
    }
  });

  it('scheda: sezione Orbita senza elementi, con i dati in arrivo o senza (§ 11.7, § 11.11)', () => {
    const dati = (slug: string, stato: 'ok' | 'caricamento' | 'fuori-copertura' | 'non-determinabile') => ({ corpo: corpo(slug), stato });
    // Durante il caricamento la stessa frase del blocco "Ora"; il Sole ha la sua.
    expect(testoOrbitaSenzaElementi(dati('marte', 'caricamento'), true)).toBe(T.scheda.caricamento);
    expect(testoOrbitaSenzaElementi(dati('sole', 'caricamento'), true)).toBe(T.affidabilita.sole);
    // Stato 'caricamento' senza caricamento in corso (errore del blocco), fuori copertura, non determinabile: non disponibili.
    expect(testoOrbitaSenzaElementi(dati('marte', 'caricamento'), false)).toBe(T.scheda.orbitaNonDisponibile);
    expect(testoOrbitaSenzaElementi(dati('marte', 'fuori-copertura'), true)).toBe(T.scheda.orbitaNonDisponibile);
    expect(testoOrbitaSenzaElementi(dati('chiron', 'non-determinabile'), true)).toBe(T.scheda.orbitaNonDisponibile);
    // I dati reali alla data senza blocco danno proprio lo stato 'caricamento'.
    const t = mts(810_560, 'UT');
    const d = calcParziale.calcola(corpo('marte'), t);
    expect(d.stato).toBe('caricamento');
    expect(d.elementi).toBeNull();
    expect(testoOrbitaSenzaElementi(d, true)).toBe('Dati in caricamento.');
  });

  it('blocco «Ora» e «Leggi posizione» senza posizione: in caricamento solo finché i dati arrivano, poi non disponibili (§ 11.7, § 11.11)', () => {
    // Dati reali alla data senza blocco: lo stato è 'caricamento' sia con i dati in arrivo sia dopo l'errore del blocco.
    const d = calcParziale.calcola(corpo('marte'), mts(810_560, 'UT'));
    expect(d.stato).toBe('caricamento');
    expect(testoSenzaPosizione(d, true)).toBe('Dati in caricamento.');
    expect(testoSenzaPosizione(d, false)).toBe('Dati non disponibili a questa data.');
    expect(annuncioPosizione(d, true)).toBe('Marte: Dati in caricamento.');
    expect(annuncioPosizione(d, false)).toBe('Marte: Dati non disponibili a questa data.');
    // Senza l'indicazione il testo è quello del caricamento in corso.
    expect(annuncioPosizione(d)).toBe('Marte: Dati in caricamento.');
    // Con la posizione disponibile il caricamento non conta.
    const ok = calc.calcola(corpo('marte'), istanteUT(2_461_332.94));
    expect(testoSenzaPosizione(ok, false)).toBeNull();
    expect(annuncioPosizione(ok, false)).toMatch(/^Marte: .+ dal Sole, .+ dalla Terra\.$/);
  });
});

describe('fasce della panoramica: passaggi di livello esatti e coerenti con la scheda alla data (§ 11.4.3)', () => {
  const mtsF = creaMakeTimeState(leggiTimeDaBuffer(buffer(new URL('time.json', DATI))).deltaT);
  const ora = mtsF(2_461_334.8665, 'UT');
  const fasce = (slug: string) => calc.bandeAffidabilita(corpo(slug), ora, mtsF, JD_MIN_UT, JD_MAX_UT_EXCL, 240)!;
  const livelloA = (b: readonly { jd0: number; jd1: number; livello: string }[], jd: number) => b.find((x) => jd >= x.jd0 && jd < x.jd1)?.livello;
  const anno = (a: number) => calendarToJd({ anno: a, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: a < 1583 ? 'giuliano' : 'gregoriano' });

  it('alla data mostrata la fascia coincide con il livello della scheda per le orbite quasi circolari', () => {
    const diversi: string[] = [];
    let controllati = 0;
    for (const c of catalogo.corpi) {
      if (c.categoria === 'sole') continue;
      const d = calc.calcola(c, ora);
      if (d.elementi === null || !(d.elementi.e < 0.02)) continue;
      controllati++;
      const livello = livelloA(fasce(c.slug), ora.jdUT);
      if (livello !== d.affidabilita.livello) diversi.push(`${c.slug}: fascia ${livello}, scheda ${d.affidabilita.livello}`);
    }
    expect(controllati).toBeGreaterThan(20);
    expect(diversi).toEqual([]);
  });

  it('i passaggi di livello cadono dove cambia il livello della scheda, non sulla griglia dei campioni', () => {
    const passoGriglia = (JD_MAX_UT_EXCL - JD_MIN_UT) / 240;
    for (const slug of ['io', 'cerere']) {
      const bande = fasce(slug);
      const confini = bande.slice(1).map((b) => b.jd0);
      let confrontati = 0;
      // Ogni sei mesi dal 1500 al 2120: il livello della scheda coincide con quello della fascia, salvo entro un anno da un passaggio.
      for (let jd = anno(1500); jd < anno(2120); jd += 182.6) {
        if (confini.some((c) => Math.abs(c - jd) < 366)) continue;
        confrontati++;
        expect(livelloA(bande, jd), `${slug} ${jdToCalendarLocale(jd, 0).anno}`).toBe(calc.calcola(corpo(slug), mtsF(jd, 'UT')).affidabilita.livello);
      }
      expect(confrontati, slug).toBeGreaterThan(300);
      // Il passaggio non è un multiplo del passo dei campioni: i confini non stanno tutti sulla griglia.
      const sullaGriglia = confini.filter((c) => Math.abs(((c - JD_MIN_UT) / passoGriglia) % 1) < 1e-6);
      expect(sullaGriglia.length, `${slug}: confini sulla griglia`).toBeLessThan(confini.length);
    }
  });

  it('piccoli corpi: la fascia precisa comincia con la finestra delle effemeridi (1600) e non cinquanta anni dopo', () => {
    const bande = fasce('cerere');
    expect(livelloA(bande, anno(1602))).toBe('precisa');
    expect(livelloA(bande, anno(1598))).not.toBe('precisa');
    const precisa = bande.find((b) => b.livello === 'precisa')!;
    expect(jdToCalendarLocale(precisa.jd0, 0).anno).toBeLessThanOrEqual(1601);
  });
});

describe('passaggio al pericentro nella scala mostrata, «Leggi posizione» e descrizione delle fasce', () => {
  const mtsT = creaMakeTimeState(leggiTimeDaBuffer(buffer(new URL('time.json', DATI))).deltaT);
  // TT 20 agosto 10000 a.C. 13:45 (giuliano): Marte al passaggio al pericentro (M ≈ 0°), ΔT = 5,07 giorni.
  const jdTT = calendarToJd({ anno: -9999, mese: 8, giorno: 20, ora: 13, minuto: 45, secondo: 0, calendario: 'giuliano' });

  it('a −10000: data TT con la scala in TT; in UT T − ΔT, la data della console (15 agosto)', () => {
    const el = calc.calcola(corpo('marte'), istanteTT(jdTT)).elementi!;
    expect(Math.abs(el.T - jdTT)).toBeLessThan(1);
    expect(testoPassaggio(el.T, el.incertezza.T, { scala: 'TT', offsetMinuti: null }, mtsT)).toBe(`20 agosto 10000${NB}a.C. (TT)`);
    // σ(ΔT) = 28,6 h sommata all'incertezza: la sola data, con la scala.
    expect(testoPassaggio(el.T, el.incertezza.T, { scala: 'UT', offsetMinuti: null }, mtsT)).toBe(`15 agosto 10000${NB}a.C. (UT)`);
    // Il testo dipende dalla scala d'ingresso.
    expect(testoPassaggio(el.T, el.incertezza.T, { scala: 'UT', offsetMinuti: 120 }, mtsT)).toBe(`15 agosto 10000${NB}a.C. (UTC+2)`);
  });

  it('oggi con l’offset fisso: ora del passaggio in UTC+2, come la console, senza TT', () => {
    const t = mtsT(calendarToJd({ anno: 2026, mese: 10, giorno: 19, ora: 23, minuto: 3, secondo: 0, calendario: 'gregoriano' }), 'UT');
    const el = calc.calcola(corpo('fobos'), t).elementi!;
    expect(el.incertezza.T).toBeLessThan(1 / 24);
    const testoT = testoPassaggio(el.T, el.incertezza.T, { scala: 'UT', offsetMinuti: 120 }, mtsT);
    const atteso = jdToCalendarLocale(mtsT(el.T, 'TT').jdUT, 120);
    expect(testoT).toBe(`${atteso.giorno === 1 ? '1°' : atteso.giorno} ottobre 2026, ${String(atteso.ora).padStart(2, '0')}:${String(atteso.minuto).padStart(2, '0')} UTC+2`);
    expect(testoT).not.toContain('TT');
    expect(testoPassaggio(el.T, el.incertezza.T, { scala: 'TT', offsetMinuti: null }, mtsT)).toMatch(/ TT$/);
  });

  it('«Leggi posizione» del Sole senza «n.d. dal Sole»; della Terra senza «dalla Terra»', () => {
    const t = istanteUT(2_461_332.94);
    const sole = annuncioPosizione(calc.calcola(corpo('sole'), t));
    expect(sole).toMatch(/^Sole: \d,\d+\u00a0UA dalla Terra\.$/);
    expect(sole).not.toContain(UNITA.nonDisponibile);
    expect(annuncioPosizione(calc.calcola(corpo('terra'), t))).toMatch(/^Terra: \d,\d+\u00a0UA dal Sole\.$/);
    expect(annuncioPosizione(calc.calcola(corpo('marte'), t))).toMatch(/^Marte: .+ dal Sole, .+ dalla Terra\.$/);
  });

  it('fasce del regolo descritte a testo con livelli e anni (§ 7.8.2)', () => {
    const ora = mtsT(2_461_333, 'UT');
    const bande = calc.bandeAffidabilita(corpo('terra'), ora, mtsT, JD_MIN_UT, JD_MAX_UT_EXCL, 240)!;
    const testo = testoBande(bande, 'Terra');
    expect(testo.startsWith(`Affidabilità della Terra nell'intervallo: approssimata dal 10000${NB}a.C. `)).toBe(true);
    expect(testo.endsWith('al 2120.')).toBe(true);
    for (const b of bande) expect(testo).toContain(NOMI_LIVELLI[b.livello].toLowerCase());
    expect(testo.split('; ')).toHaveLength(bande.length);
    expect(titoloBanda(bande[bande.length - 1]!)).toMatch(/^Precisa: dal .+ al 2120$/);
    expect(testoBande([], 'Terra')).toBe('');
  });
});
