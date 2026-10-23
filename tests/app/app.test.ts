// Modulo applicazione (§ 5.4, § 5.6, § 7.7, RF8, § 11.12): preferenze protette, stato nell'URL, scelta dei
// blocchi da caricare, fornitori di orientamento e stagione con i dati pubblicati.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANNI_ADIACENTE, blocchiVoluti } from '../../src/app/caricamento';
import { JD_EPOCA_UNIX } from '../../src/app/clock';
import { creaOrientamento, creaStagione } from '../../src/app/fornitori';
import { creaPreferenze } from '../../src/app/preferenze';
import { creaUrlState, slugDaHash } from '../../src/app/urlState';
import { fineBlocco, inizioBlocco } from '../../src/data/binHeader';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo } from '../../src/data/catalogTypes';
import { percorsoBlocco } from '../../src/data/manifest';
import { leggiLuna } from '../../src/data/moonReader';
import { leggiTimeDaBuffer } from '../../src/data/timeReader';
import { K, T0, T_END } from '../../src/ephem/constants';
import { ServizioEffemeridi, TIPI_BLOCCO } from '../../src/ephem/service';
import { longitudineSubsolare } from '../../src/time/earthRotation';
import { creaMakeTimeState, impostaModelloTempo } from '../../src/time/timescale';
import { fixture } from '../time/datiTempo';

const DATI = new URL('../../public/data/v1/', import.meta.url);

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

describe('preferenze (RF8, RNF7)', () => {
  it('localStorage che lancia eccezioni: valori predefiniti, poi memoria della sessione', () => {
    const rotto = {
      getItem: () => {
        throw new Error('bloccato');
      },
      setItem: () => {
        throw new Error('bloccato');
      },
    } as unknown as Storage;
    const p = creaPreferenze(() => rotto);
    expect(p.leggi('ss.ui.livelli', 7)).toBe(7);
    p.scrivi('ss.ui.livelli', { orbite: false });
    expect(p.leggi('ss.ui.livelli', null)).toEqual({ orbite: false });
    const assente = creaPreferenze(() => {
      throw new Error('accesso negato');
    });
    expect(assente.leggi('x', 'def')).toBe('def');
  });

  it('JSON nel localStorage; la data non entra nelle preferenze', () => {
    const m = new Map<string, string>();
    const archivio = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
    const p = creaPreferenze(() => archivio);
    p.scrivi('ss.ui.velocita', 4);
    expect(m.get('ss.ui.velocita')).toBe('4');
    p.scrivi('ss.data', 2451545);
    p.scrivi('ss.tempo.jd', 2451545);
    expect(m.has('ss.data') || m.has('ss.tempo.jd')).toBe(false);
    m.set('rotto', '{');
    expect(creaPreferenze(() => archivio).leggi('rotto', 1)).toBe(1);
  });
});

describe('stato nell\'URL (RF8, § 11.12)', () => {
  it('testo dell\'hash decodificato: lo slug si confronta dopo, i testi non conformi producono il messaggio', () => {
    expect(slugDaHash('#marte')).toBe('marte');
    expect(slugDaHash('52-europa')).toBe('52-europa');
    // Non conformi: restituiti per il messaggio del collegamento ignorato (§ 11.12), non scartati in silenzio.
    expect(slugDaHash('#Marte')).toBe('Marte');
    expect(slugDaHash('#C/1680%20V1')).toBe('C/1680 V1');
    expect(slugDaHash('#marte%20')).toBe('marte');
    expect(slugDaHash('#%E0%A4%A')).toBe('%E0%A4%A');
    expect(slugDaHash(`#${'a'.repeat(41)}`)).toBe('a'.repeat(41));
    // Hash vuoto: nessun collegamento.
    expect(slugDaHash('')).toBeNull();
    expect(slugDaHash('#')).toBeNull();
  });

  it('scrittura con replaceState dentro try/catch e ascolto di hashchange', () => {
    const ascoltatori = new Map<string, () => void>();
    const scritti: string[] = [];
    const finta = {
      location: { hash: '#giove', pathname: '/a/b/index.html', search: '' },
      history: {
        state: null,
        replaceState: (_s: unknown, _t: string, u: string) => {
          scritti.push(u);
          finta.location.hash = u.startsWith('#') ? u : '';
        },
      },
      addEventListener: (t: string, f: () => void) => ascoltatori.set(t, f),
      removeEventListener: (t: string) => ascoltatori.delete(t),
    };
    const u = creaUrlState(finta as unknown as Window);
    expect(u.leggiSlug()).toBe('giove');
    u.scriviSlug('marte');
    u.scriviSlug('marte');
    u.scriviSlug(null);
    expect(scritti).toEqual(['#marte', '/a/b/index.html']);
    const visti: (string | null)[] = [];
    const annulla = u.onCambio((s) => visti.push(s));
    finta.location.hash = '#saturno';
    ascoltatori.get('hashchange')!();
    expect(visti).toEqual(['saturno']);
    annulla();
    expect(ascoltatori.has('hashchange')).toBe(false);
    finta.history.replaceState = () => {
      throw new Error('vietato');
    };
    expect(() => u.scriviSlug('luna')).not.toThrow();
  });
});

describe('blocchi da caricare (§ 5.6)', () => {
  it('blocco della data, adiacente entro 50 anni dal confine o verso la riproduzione', () => {
    const anni = ANNI_ADIACENTE * 365.25;
    const k = 6;
    const centro = 0.5 * (inizioBlocco(k) + fineBlocco(k));
    expect(blocchiVoluti(centro, 0)).toEqual([k]);
    expect(blocchiVoluti(centro, 1)).toEqual([k, k + 1]);
    expect(blocchiVoluti(centro, -1)).toEqual([k, k - 1]);
    expect(blocchiVoluti(inizioBlocco(k) + anni - 1, 0)).toEqual([k, k - 1]);
    expect(blocchiVoluti(fineBlocco(k) - anni + 1, 0)).toEqual([k, k + 1]);
    expect(blocchiVoluti(inizioBlocco(k), 0)).toEqual([k, k - 1]);
    expect(blocchiVoluti(T0, -1)).toEqual([0]);
    expect(blocchiVoluti(T_END - 1, 1)).toEqual([K - 1]);
    expect(blocchiVoluti(T_END - 1, -1)).toEqual([K - 1, K - 2]);
    expect(blocchiVoluti(T0 - 1, 0)).toEqual([]);
  });

  it('epoca Unix in JD (orologio)', () => {
    expect(JD_EPOCA_UNIX).toBe(2_440_587.5);
  });
});

describe('fornitori con i dati pubblicati (§ 7.4, § 7.5.5, § 7.7, § 11.4.3)', () => {
  const catalogo: Catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
  const tempo = leggiTimeDaBuffer(buffer(new URL('time.json', DATI)));
  impostaModelloTempo(tempo.deltaT);
  const mts = creaMakeTimeState(tempo.deltaT);
  const servizio = new ServizioEffemeridi({ catalogo });
  servizio.impostaLuna(leggiLuna(buffer(new URL('moon.bin', DATI))));
  for (const t of TIPI_BLOCCO) servizio.registraBlocco(t, 12, buffer(new URL(percorsoBlocco(t, 12), DATI)));
  const ori = creaOrientamento(catalogo.corpi, servizio, tempo.eo);
  const ssid = (s: string) => catalogo.corpi.find((c) => c.slug === s)!.ssid;

  it('Terra con UT1 del TimeState: a 12:00 UT la longitudine 0 è rivolta al Sole entro 5° (A25)', () => {
    const m = new Float64Array(9);
    const terra = new Float64Array(6);
    // 1° gennaio, 1° aprile, 1° luglio, 1° ottobre 2020 alle 12:00 UT
    for (const jd of [2_458_850.0, 2_458_941.0, 2_459_032.0, 2_459_124.0]) {
      const t = mts(jd, 'UT');
      expect(ori.orientamento(ssid('terra'), t, m)).toBe(true);
      expect(servizio.stateAt(ssid('terra'), t.jdTT, terra)).toBe('ok');
      const lon = (longitudineSubsolare(m, terra) * 180) / Math.PI;
      expect(Math.abs(lon)).toBeLessThan(5);
    }
    // senza TimeState: UT1 dal modello di ΔT, stesso risultato
    const t = mts(2_458_850.0, 'UT');
    ori.orientamento(ssid('terra'), t, m);
    const m2 = new Float64Array(9);
    ori.bodyFixedToScene(ssid('terra'), t.jdTT, m2);
    for (let i = 0; i < 9; i++) expect(Math.abs(m2[i]! - m[i]!)).toBeLessThan(1e-9);
  });

  it('Luna (Cassini) e satelliti sincroni: asse x verso il primario', () => {
    const m = new Float64Array(9);
    const rel = new Float64Array(6);
    const t = mts(2_460_000.5, 'UT');
    for (const [slug, gradi] of [
      ['luna', 11],
      ['io', 5],
      ['titano', 5],
    ] as const) {
      expect(ori.orientamento(ssid(slug), t, m), slug).toBe(true);
      servizio.statoRelativo(ssid(slug), t.jdTT, rel);
      const r = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
      const c = -(m[0]! * rel[0]! + m[3]! * rel[1]! + m[6]! * rel[2]!) / r;
      expect(c, slug).toBeGreaterThan(Math.cos((gradi * Math.PI) / 180));
    }
  });

  it('stagione dallo stato della Terra; null senza dati', () => {
    const stagione = creaStagione(servizio, ssid('terra'));
    // 19 ottobre 2026, 0h UT: 25 d 23 h 55 min dopo l'equinozio del 23/09/2026 00:05 UT (USNO)
    const s = stagione(mts(2_461_332.5, 'UT'));
    expect(s).toEqual({ stagione: 'autunno', evento: 'equinozio', giorniDopo: 25 });
    expect(stagione(mts(2_451_545, 'UT'))).toBeNull();
    expect(creaStagione(servizio, -1)(mts(2_461_332.5, 'UT'))).toBeNull();
  });

  // Istanti ufficiali USNO 2023-2026 (https://aa.usno.navy.mil/api/seasons, UT al minuto) e istanti degli stessi
  // eventi con la longitudine apparente su DE441 (tests/fixtures/time/stagioni.json, time_model.py fixture).
  const usno = fixture<{
    eventiUsno: { eventi: { evento: string; quadrante: number; usnoUT: number; istanteTT: number }[] };
  }>('stagioni.json').eventiUsno.eventi;
  const CODICI = ['primavera', 'estate', 'autunno', 'inverno'] as const;
  const MINUTO = 1 / 1440;

  it('cambio di stagione entro 1 min dagli istanti USNO 2024-2026 (longitudine apparente)', () => {
    const stagione = creaStagione(servizio, ssid('terra'));
    expect(usno).toHaveLength(13);
    for (let k = 1; k < usno.length; k++) {
      const e = usno[k]!;
      const prima = stagione(mts(e.usnoUT - MINUTO, 'UT'))!;
      const dopo = stagione(mts(e.usnoUT + MINUTO, 'UT'))!;
      expect(prima.stagione, `1 min prima di ${e.usnoUT}`).toBe(CODICI[usno[k - 1]!.quadrante]);
      expect(dopo, `1 min dopo ${e.usnoUT}`).toEqual({ stagione: CODICI[e.quadrante], evento: e.evento, giorniDopo: 0 });
    }
  });

  it('giorni dall\'evento: parte intera del tempo trascorso, mai oltre la durata della stagione', () => {
    const stagione = creaStagione(servizio, ssid('terra'));
    // 20/03/2024 02:40 UT: l'inverno 2023-2024 dura 88 d 23 h 39 min (USNO), quindi 88 giorni
    expect(stagione(mts(2_460_389.6111, 'UT'))).toEqual({ stagione: 'inverno', evento: 'solstizio', giorniDopo: 88 });
    for (let k = 0; k + 1 < usno.length; k++) {
      const e = usno[k]!;
      const durata = usno[k + 1]!.istanteTT - e.istanteTT;
      // passaggi dei giorni interi: 1 min prima e 1 min dopo l'istante evento + N giorni
      for (const n of [1, 10, 30, 60, 88, 89, 90, 92, 93]) {
        if (e.istanteTT + n + MINUTO >= usno[k + 1]!.istanteTT) continue;
        const prima = stagione(mts(e.istanteTT + n - MINUTO, 'TT'))!;
        const dopo = stagione(mts(e.istanteTT + n + MINUTO, 'TT'))!;
        expect(prima.giorniDopo, `evento ${k}, ${n} giorni`).toBe(n - 1);
        expect(dopo.giorniDopo, `evento ${k}, ${n} giorni`).toBe(n);
        expect(dopo.stagione).toBe(CODICI[e.quadrante]);
      }
      // fine della stagione
      const fine = stagione(mts(usno[k + 1]!.istanteTT - MINUTO, 'TT'))!;
      expect(fine.giorniDopo).toBe(Math.floor(durata - MINUTO));
    }
  });
});
