// Logica dei controlli: store, riproduzione (§ 6.6), live region (§ 11.9), regolo (§ 11.4.3),
// barra di scala e preset (§ 11.3, R14), scorciatoie, classi di layout, catalogo, tabella, scheda.

import { describe, expect, it } from 'vitest';
import { VELOCITA_S, creaStore, creaStoreApp, statoIniziale, ugualeSuperficiale } from '../../src/app/store';
import { UA_KM } from '../../src/ephem/constants';
import { JD_MAX_UT_EXCL, JD_MIN_UT, calendarToJd, jdToCalendar } from '../../src/time/calendar';
import { Annunciatore, INTERVALLO_ANNUNCI_MS } from '../../src/ui/annunci';
import { contaPerCategoria, sezioniCatalogo, visibileConFiltri } from '../../src/ui/catalogo';
import { CalcolatoreScheda } from '../../src/ui/datiScheda';
import { creaCatalogoFinto } from '../../src/ui/dev/catalogoFinto';
import { EffemeridiFinte } from '../../src/ui/dev/effemeridiFinte';
import { makeTimeStateFinto } from '../../src/ui/dev/tempoFinto';
import { leggiIntero, OFFSET_AMMESSI } from '../../src/ui/editorData';
import { modalitaLayout, usaFoglio } from '../../src/ui/layout';
import {
  AMPIEZZA_MAX,
  AMPIEZZA_MIN,
  PASSO_ETICHETTE_PX,
  PASSO_MINORE_PX,
  deltaTrascinamento,
  etichettaIntera,
  etichetteSenzaCollisioni,
  frazionePanoramica,
  jdDaX,
  limitaAmpiezza,
  tacche,
  tacchePanoramica,
  unitaSuperiore,
  xDaJd,
} from '../../src/ui/regoloLogica';
import { MotoreRiproduzione, giorniPerMs } from '../../src/ui/riproduzione';
import {
  LOG_AMPIEZZA_MAX,
  PRESET_VISTA,
  ampiezzaDaFrazione,
  arrotonda125,
  barraScala,
  frazioneDaAmpiezza,
  presetCorrispondente,
} from '../../src/ui/scala';
import { azioneGlobale, azioneMappa } from '../../src/ui/scorciatoie';
import type { ContestoTasto, DatiTasto } from '../../src/ui/scorciatoie';
import { nonApplicabile, ordinaRighe, testoSenzaValore } from '../../src/ui/vistaTestuale';
import type { ColonnaTestuale } from '../../src/ui/vistaTestuale';
import { SPAZIO_NB as NB, SPAZIO_SOTTILE as S } from '../../src/ui/format';
import type { RigaTestuale } from '../../src/ui/vistaTestuale';

const catalogo = creaCatalogoFinto();

describe('store', () => {
  it('set, aggiorna e osserva con valori precedenti', () => {
    const store = creaStore({ a: 1, b: { x: 1, y: 2 } });
    const visti: [number, number][] = [];
    store.osserva(
      (s) => s.b.x,
      (n, p) => visti.push([n, p]),
    );
    store.aggiorna('b', { x: 5 });
    store.aggiorna('b', { y: 9 });
    store.set({ a: 2 });
    expect(visti).toEqual([[5, 1]]);
    expect(store.get()).toEqual({ a: 2, b: { x: 5, y: 9 } });
  });

  it('transazione: una sola notifica alla fine', () => {
    const store = creaStore({ a: 1, b: 1 });
    let n = 0;
    store.osserva((s) => s, () => n++, { uguale: ugualeSuperficiale });
    store.transazione(() => {
      store.set({ a: 2 });
      store.set({ b: 3 });
    });
    expect(n).toBe(1);
  });

  it('modifiche dagli osservatori e annullamento', () => {
    const store = creaStore({ a: 1, b: 0 });
    const annulla = store.osserva(
      (s) => s.a,
      (a) => store.set({ b: a * 10 }),
    );
    store.set({ a: 3 });
    expect(store.get().b).toBe(30);
    annulla();
    store.set({ a: 4 });
    expect(store.get().b).toBe(30);
  });

  it('stato iniziale del § 11.12', () => {
    const s = statoIniziale(2_461_332.4);
    expect(s.tempo).toEqual({ jd: 2_461_332.4, scala: 'UT' });
    expect(s.offsetMinuti).toBeNull();
    expect(s.riproduzione.attiva).toBe(false);
    expect(s.selezionato).toBe('terra');
    expect(s.fuoco).toBe('sole');
    expect(s.interfaccia.schedaEspansa).toBe(false);
    expect(s.livelli.grigliaEclittica).toBe(false);
    expect(s.livelli.anelliDistanza).toBe(true);
  });

  it('stato iniziale con l\'orologio fuori dall\'intervallo: istante limitato (I2, § 11.12)', () => {
    expect(statoIniziale(JD_MAX_UT_EXCL + 1_600).tempo.jd).toBe(JD_MAX_UT_EXCL - 1 / 86_400);
    expect(statoIniziale(JD_MAX_UT_EXCL).tempo.jd).toBe(JD_MAX_UT_EXCL - 1 / 86_400);
    expect(statoIniziale(JD_MIN_UT - 10).tempo.jd).toBe(JD_MIN_UT);
    expect(creaStoreApp(JD_MAX_UT_EXCL + 155).get().tempo.jd).toBe(JD_MAX_UT_EXCL - 1 / 86_400);
  });

  it('velocità a gradini del § 6.6', () => {
    const giorni = VELOCITA_S.map((v) => v / 86_400);
    expect(giorni[3]).toBe(1);
    expect(giorni[4]).toBe(7);
    expect(giorni[5]).toBeCloseTo(30.436875, 12);
    expect(giorni[6]).toBe(365.25);
    expect(giorni[9]).toBe(365_250);
    expect(VELOCITA_S[0]).toBe(1);
  });
});

/** Orologio e fotogrammi manuali per il motore. */
function banco(jd0: number, pronto: (jd: number) => boolean = () => true, inErrore?: (jd: number) => boolean) {
  const store = creaStoreApp(jd0);
  let t = 1000;
  const coda: ((t: number) => void)[] = [];
  const limiti: { limite: string; jd: number }[] = [];
  const arresti = { errore: 0, attivaAlloraErrore: [] as boolean[] };
  const motore = new MotoreRiproduzione({
    store,
    ora: () => t,
    pianifica: (cb) => {
      coda.push(cb);
      return coda.length;
    },
    annulla: () => {
      coda.length = 0;
    },
    limiti: () => ({ min: JD_MIN_UT, maxEscl: JD_MAX_UT_EXCL }),
    pronto,
    inErrore,
    adesso: () => 2_461_000.5,
    alLimite: (limite, jd) => limiti.push({ limite, jd }),
    alErrore: () => {
      arresti.errore++;
      arresti.attivaAlloraErrore.push(store.get().riproduzione.attiva);
    },
  });
  const avanza = (ms: number) => {
    t += ms;
    const cb = coda.shift();
    cb?.(t);
  };
  return { store, motore, avanza, limiti, coda, arresti };
}

describe('riproduzione (§ 6.6): jd = jd_inizio + v·(t - t_inizio)', () => {
  it('avanzamento senza accumulo per incrementi', () => {
    const { store, avanza } = banco(2_451_545);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    for (let i = 0; i < 60; i++) avanza(1000 / 60);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_546, 9);
    expect(giorniPerMs(3, -1)).toBeCloseTo(-1 / 1000, 15);
  });

  it('riancoraggio al cambio di velocità e di direzione', () => {
    const { store, avanza } = banco(2_451_545);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    avanza(1000);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_546, 9);
    store.aggiorna('riproduzione', { velocita: 6 });
    avanza(0);
    avanza(1000);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_546 + 365.25, 6);
    store.aggiorna('riproduzione', { direzione: -1 });
    avanza(0);
    avanza(500);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_546 + 365.25 / 2, 6);
  });

  it('riancoraggio a una data cambiata dall’esterno', () => {
    const { store, avanza } = banco(2_451_545);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    avanza(1000);
    store.aggiorna('tempo', { jd: 2_400_000.5 });
    avanza(0);
    avanza(2000);
    expect(store.get().tempo.jd).toBeCloseTo(2_400_002.5, 9);
  });

  it('fermo al limite superiore con notifica', () => {
    const { store, avanza, limiti } = banco(JD_MAX_UT_EXCL - 0.5);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    avanza(1000);
    expect(store.get().riproduzione.attiva).toBe(false);
    expect(store.get().tempo.jd).toBeCloseTo(JD_MAX_UT_EXCL - 1 / 86_400, 9);
    expect(limiti).toEqual([{ limite: 'superiore', jd: JD_MAX_UT_EXCL - 1 / 86_400 }]);
  });

  it('attesa dei blocchi non pronti e ripresa da sola (§ 5.6)', () => {
    let disponibile = false;
    const { store, avanza } = banco(2_451_545, (jd) => jd < 2_451_545.5 || disponibile);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    avanza(400);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_545.4, 9);
    avanza(400);
    expect(store.get().riproduzione.attesaDati).toBe(true);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_545.4, 9);
    avanza(5000);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_545.4, 9);
    disponibile = true;
    avanza(250);
    expect(store.get().riproduzione.attesaDati).toBe(false);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_545.65, 9);
  });

  it('dati in errore: la riproduzione si ferma invece di attendere senza fine (§ 5.6, § 11.11)', () => {
    let errore = false;
    const { store, avanza, coda, arresti, limiti } = banco(2_451_545, (jd) => jd < 2_451_545.5, () => errore);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    avanza(400);
    avanza(400);
    expect(store.get().riproduzione.attesaDati).toBe(true);
    expect(store.get().riproduzione.attiva).toBe(true);
    expect(arresti.errore).toBe(0);
    // Il caricamento del blocco fallisce: nessun dato arriverà senza "Riprova".
    errore = true;
    avanza(200);
    expect(store.get().riproduzione.attiva).toBe(false);
    expect(store.get().riproduzione.attesaDati).toBe(false);
    expect(store.get().tempo.jd).toBeCloseTo(2_451_545.4, 9);
    expect(coda.length).toBe(0);
    // L'arresto per errore è notificato una volta, a riproduzione già ferma (l'annuncio non è più taciuto, § 11.9);
    // non è un limite.
    expect(arresti.errore).toBe(1);
    expect(arresti.attivaAlloraErrore).toEqual([false]);
    expect(limiti).toEqual([]);
  });

  it('nessuna notifica di errore all\'arresto per limite né a una pausa', () => {
    const { store, avanza, arresti, limiti } = banco(JD_MAX_UT_EXCL - 0.5);
    store.aggiorna('riproduzione', { attiva: true, velocita: 3 });
    avanza(0);
    avanza(1000);
    expect(limiti.length).toBe(1);
    expect(arresti.errore).toBe(0);
    store.aggiorna('riproduzione', { attiva: true });
    avanza(0);
    store.aggiorna('riproduzione', { attiva: false });
    expect(arresti.errore).toBe(0);
  });

  it('pausa: nessun fotogramma pianificato', () => {
    const { store, avanza, coda } = banco(2_451_545);
    store.aggiorna('riproduzione', { attiva: true });
    avanza(0);
    store.aggiorna('riproduzione', { attiva: false });
    expect(coda.length).toBe(0);
  });
});

describe('live region (§ 11.9)', () => {
  function annunciatore(silenzio = () => false) {
    let t = 0;
    const scritti: [number, string][] = [];
    const timer: { cb: () => void; at: number }[] = [];
    const a = new Annunciatore({
      scrivi: (x) => scritti.push([t, x]),
      ora: () => t,
      pianifica: (cb, ms) => timer.push({ cb, at: t + ms }),
      annulla: () => {
        timer.length = 0;
      },
      silenzioso: silenzio,
    });
    const avanza = (ms: number) => {
      t += ms;
      for (const x of timer.splice(0)) {
        if (x.at <= t) x.cb();
        else timer.push(x);
      }
    };
    return { a, scritti, avanza };
  }

  it('al massimo un annuncio ogni 1,5 s, si pubblica l’ultimo', () => {
    const { a, scritti, avanza } = annunciatore();
    a.annuncia('uno');
    a.annuncia('due');
    a.annuncia('tre');
    expect(scritti).toEqual([[0, 'uno']]);
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti).toEqual([
      [0, 'uno'],
      [1500, 'tre'],
    ]);
  });

  it('in riproduzione tace solo per gli annunci dovuti al tempo; quelli di un’azione dell’utente si pronunciano', () => {
    const gioca = true;
    const { a, scritti, avanza } = annunciatore(() => gioca);
    a.annuncia('Caricamento dati per il periodo 2011-2120', { dalTempo: true });
    expect(scritti).toEqual([]);
    a.annuncia('Corpo selezionato: Marte');
    expect(scritti.map((x) => x[1])).toEqual(['Corpo selezionato: Marte']);
    // Un annuncio dovuto al tempo non prende il posto di quello dell'utente in attesa dell'intervallo.
    a.annuncia('Stelle: disattivato');
    a.annuncia('Dati caricati.', { dalTempo: true });
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['Corpo selezionato: Marte', 'Stelle: disattivato']);
  });

  it('il silenzio vale al momento della pubblicazione: l’annuncio dovuto al tempo in attesa cade se la riproduzione parte', () => {
    let gioca = false;
    const { a, scritti, avanza } = annunciatore(() => gioca);
    a.annuncia('uno');
    a.annuncia('Caricamento dati per il periodo 2011-2120', { dalTempo: true });
    gioca = true;
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['uno']);
    // Quello di un'azione dell'utente in attesa si pronuncia anche a riproduzione avviata.
    gioca = false;
    avanza(INTERVALLO_ANNUNCI_MS);
    a.annuncia('due');
    a.annuncia('Comete nascoste');
    gioca = true;
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['uno', 'due', 'Comete nascoste']);
  });

  it('scarta() all’avvio della riproduzione toglie solo l’annuncio in attesa dovuto al tempo', () => {
    const { a, scritti, avanza } = annunciatore();
    a.annuncia('uno');
    a.annuncia('Caricamento dati per il periodo 2011-2120', { dalTempo: true });
    a.scarta();
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['uno']);
    a.annuncia('due');
    a.annuncia('Vista testuale aperta');
    a.scarta();
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['uno', 'due', 'Vista testuale aperta']);
  });

  it('un annuncio sostituito conserva l’origine: in riproduzione la conclusione del caricamento tace', () => {
    let gioca = false;
    const { a, scritti, avanza } = annunciatore(() => gioca);
    // Pubblicato: la regione passa a "Dati caricati." solo se la riproduzione non è attiva.
    a.annuncia('Caricamento dati per il periodo 2011-2120', { dalTempo: true });
    gioca = true;
    a.sostituisci('Caricamento dati per il periodo 2011-2120', 'Dati caricati.');
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['Caricamento dati per il periodo 2011-2120']);
    // In attesa: la sostituzione non ne cambia l'origine.
    gioca = false;
    avanza(INTERVALLO_ANNUNCI_MS);
    a.annuncia('Caricamento dati per il periodo 1011-2011', { dalTempo: true });
    a.annuncia('Caricamento dati per il periodo 0011-1011', { dalTempo: true });
    a.sostituisci('Caricamento dati per il periodo 0011-1011', 'Dati caricati.');
    gioca = true;
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['Caricamento dati per il periodo 2011-2120', 'Caricamento dati per il periodo 1011-2011']);
  });

  it('un annuncio superato si sostituisce: in attesa o pubblicato, la regione finisce sul testo nuovo', () => {
    const { a, scritti, avanza } = annunciatore();
    a.annuncia('Caricamento dati per il periodo 2011-2120');
    a.sostituisci('Caricamento dati per il periodo 2011-2120', 'Dati caricati.');
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.map((x) => x[1])).toEqual(['Caricamento dati per il periodo 2011-2120', 'Dati caricati.']);
    // In attesa: prende il posto del testo superato (la regione non resta su un messaggio precedente).
    a.annuncia('Impossibile caricare i dati per il periodo 4996 a.C.-3996 a.C.');
    avanza(INTERVALLO_ANNUNCI_MS);
    a.annuncia('Caricamento dati per il periodo 1011-2011');
    a.sostituisci('Caricamento dati per il periodo 1011-2011', 'Dati caricati.');
    avanza(2 * INTERVALLO_ANNUNCI_MS);
    expect(scritti.at(-1)?.[1]).toBe('Dati caricati.');
    expect(scritti.some((x) => x[1] === 'Caricamento dati per il periodo 1011-2011')).toBe(false);
    // Superato da un altro annuncio: nulla.
    a.annuncia('Caricamento dati per il periodo 1011-2011');
    avanza(INTERVALLO_ANNUNCI_MS);
    a.annuncia('Corpo selezionato: Marte');
    avanza(INTERVALLO_ANNUNCI_MS);
    a.sostituisci('Caricamento dati per il periodo 1011-2011', 'Dati caricati.');
    avanza(INTERVALLO_ANNUNCI_MS);
    expect(scritti.at(-1)?.[1]).toBe('Corpo selezionato: Marte');
  });
});

describe('regolo temporale (§ 11.4.3)', () => {
  const j2026 = calendarToJd({ anno: 2026, mese: 10, giorno: 18, ora: 0, minuto: 0, secondo: 0, calendario: 'gregoriano' });

  it('scala da 1 giorno a 12 000 anni', () => {
    expect(limitaAmpiezza(0.1)).toBe(AMPIEZZA_MIN);
    expect(limitaAmpiezza(1e9)).toBe(AMPIEZZA_MAX);
    expect(AMPIEZZA_MAX).toBe(12_000 * 365.25);
  });

  it('ago centrale: x(jd) e jd(x) inversi; trascinamento a destra va indietro', () => {
    expect(xDaJd(j2026, j2026, 100, 800)).toBe(400);
    expect(jdDaX(600, j2026, 100, 800)).toBeCloseTo(j2026 + 25, 9);
    expect(deltaTrascinamento(80, 100, 800)).toBeCloseTo(-10, 12);
  });

  it('tacche adattive: mesi e anni su 4 anni, ore su 1 giorno', () => {
    const t = tacche(j2026, 4 * 365.25, 800);
    const etichette = t.filter((x) => x.maggiore).map((x) => x.etichetta);
    expect(etichette).toEqual(expect.arrayContaining(['2025', '2026', '2027', '2028']));
    expect(t.some((x) => !x.maggiore)).toBe(true);
    for (const x of t) expect(x.x).toBeGreaterThan(-41);
    const g = tacche(j2026 + 0.5, 1, 800).filter((x) => x.maggiore);
    expect(g.map((x) => x.etichetta)).toContain('18 ott');
    expect(g.some((x) => x.etichetta === '12:00' || x.etichetta === '06:00')).toBe(true);
  });

  it('anni storici: tacche su 200 a.C., 1000 a.C., ..., non sugli anni astronomici', () => {
    const jd = calendarToJd({ anno: -749, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'giuliano' });
    const t = tacche(jd, 1200 * 365.25, 600).filter((x) => x.maggiore);
    const anni = t.map((x) => jdToCalendar(x.jd).anno);
    expect(anni).toContain(-199);
    expect(anni).toContain(-999);
    expect(anni).not.toContain(-1000);
    expect(t.map((x) => x.etichetta)).toContain(`1000${NB}a.C.`);
  });

  it('attorno all’1 d.C. le tacche maggiori distano almeno quanto due etichette (nessuna tacca a metà passo)', () => {
    const distanze = (jd: number, ampiezza: number, w: number) => {
      const m = tacche(jd, ampiezza, w).filter((x) => x.maggiore);
      return m.slice(1).map((x, i) => ({ da: m[i]!.etichetta, a: x.etichetta, dx: x.x - m[i]!.x }));
    };
    // Casi osservati: 8 anni su 600 e 412 px, 4 anni su 252 px (telefono).
    for (const [jd, anni, w] of [
      [1_721_423.5, 8, 600],
      [1_721_623.5, 8, 412],
      [1_721_604.5, 4, 252],
    ] as const) {
      for (const d of distanze(jd, anni * 365.25, w)) expect(d.dx, `${anni} anni, ${w} px: ${d.da} → ${d.a}`).toBeGreaterThanOrEqual(PASSO_ETICHETTE_PX * 0.99);
    }
    for (const w of [252, 412, 600, 1000]) {
      for (let la = 0.4; la <= 4; la += 0.05) {
        for (const d of distanze(1_721_423.5, 10 ** la * 365.25, w)) {
          expect(d.dx, `${(10 ** la).toFixed(1)} anni, ${w} px: ${d.da} → ${d.a}`).toBeGreaterThanOrEqual(PASSO_ETICHETTE_PX * 0.99);
        }
      }
    }
    // Su scale ampie l'1 d.C. resta: 1200 anni su 600 px, tacche ogni 200 anni.
    expect(tacche(1_721_423.5, 1200 * 365.25, 600).map((x) => x.etichetta)).toContain(`1${NB}d.C.`);
  });

  it('ottobre 1582: la tacca del 16 ottobre, a 5 giorni dall’1 ottobre, si omette; altrove giorni 1 e 16 invariati (§ 11.4.3)', () => {
    // Dal 5 al 14 ottobre 1582 i giorni non esistono: con l'unità di 15 giorni le tacche dell'1 (giuliano) e del 16
    // (gregoriano) distano 5 giorni, un terzo dell'unità, e le etichette «1 ott» e «16 ott» si toccano.
    const j4ott1582 = 2_299_160;
    const maggiori = (jd: number, giorni: number, w: number) => tacche(jd, giorni, w).filter((x) => x.maggiore);
    const t = maggiori(j4ott1582, 60, 412);
    expect(t.map((x) => x.etichetta)).toEqual(['1 set', '16 set', '1 ott', '1 nov', '16 nov']);
    // Nessuna coppia di tacche maggiori a meno di metà della distanza minima delle etichette (casi del 2026 inclusi).
    const troppoVicine = (m: ReturnType<typeof maggiori>) =>
      m.slice(1).flatMap((x, i) => (x.x - m[i]!.x < PASSO_ETICHETTE_PX / 2 ? [`${m[i]!.etichetta} → ${x.etichetta}: ${(x.x - m[i]!.x).toFixed(1)} px`] : []));
    // Tutte le ampiezze (e quindi le unità) a cavallo di ottobre 1582, a varie larghezze e posizioni dell'ago: l'esito
    // non dipende da quanto della finestra si vede (la tacca dell'1 ottobre può essere fuori).
    const vicine: string[] = [];
    const sedici: string[] = [];
    for (const w of [252, 412, 600, 1000]) {
      for (let la = 0.3; la <= 3.2; la += 0.02) {
        for (let c = 2_299_100; c <= 2_299_230; c += 1.7) {
          const m = maggiori(c, 10 ** la, w);
          vicine.push(...troppoVicine(m).map((s) => `${w} px, ${(10 ** la).toFixed(1)} giorni, JD ${c}: ${s}`));
          // Anche le tacche minori restano a più di metà della distanza minima (7 px): con le tacche maggiori ogni
          // 6 mesi, l'1 e il 16 ottobre 1582 distavano 3 px.
          const tutte = tacche(c, 10 ** la, w);
          for (let i = 1; i < tutte.length; i++) {
            if (tutte[i]!.x - tutte[i - 1]!.x < PASSO_MINORE_PX / 2) vicine.push(`${w} px, ${(10 ** la).toFixed(1)} giorni, JD ${c}: minori a ${(tutte[i]!.x - tutte[i - 1]!.x).toFixed(1)} px`);
          }
          // Unità di 15 giorni: la tacca del 16 ottobre non compare mai.
          if (15 * (w / 10 ** la) >= PASSO_ETICHETTE_PX && 10 * (w / 10 ** la) < PASSO_ETICHETTE_PX) {
            if (m.some((x) => x.etichetta === '16 ott')) sedici.push(`${w} px, ${(10 ** la).toFixed(1)} giorni, JD ${c}`);
          }
        }
      }
    }
    expect(vicine).toEqual([]);
    expect(sedici).toEqual([]);
    // Anni senza salto di calendario (1700 e 2026 gregoriani, 2028 bisestile): tutte e sole le tacche dei giorni 1 e 16
    // che cadono nella finestra, da -40 px a larghezza + 40 px.
    for (const anno of [1700, 2026, 2028]) {
      const nominali: number[] = [];
      for (let mese = 1; mese <= 12; mese++) {
        for (const giorno of [1, 16]) nominali.push(calendarToJd({ anno, mese, giorno, ora: 0, minuto: 0, secondo: 0, calendario: 'gregoriano' }));
      }
      for (let c = nominali[0]! + 20; c <= nominali[nominali.length - 1]! - 20; c += 3.9) {
        const m = maggiori(c, 60, 412);
        const attese = nominali.filter((jd) => jd >= jdDaX(-40, c, 60, 412) && jd <= jdDaX(452, c, 60, 412));
        expect(m.map((x) => x.jd), `${anno}, JD ${c}`).toEqual(attese);
      }
    }
    // Il 29 febbraio bisestile dista un giorno dal 1° marzo, metà dell'unità di 2 giorni: la tacca resta.
    const feb2028 = calendarToJd({ anno: 2028, mese: 2, giorno: 29, ora: 12, minuto: 0, secondo: 0, calendario: 'gregoriano' });
    expect(maggiori(feb2028, 8, 412).map((x) => x.etichetta)).toEqual(expect.arrayContaining(['27 feb', '29 feb', '1 mar']));
  });

  it('almeno un’etichetta di data intera nel regolo, da 1 giorno a 12 000 anni (anche tra 18 e 30 giorni)', () => {
    const j0 = calendarToJd({ anno: 2026, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'gregoriano' });
    const vuote: string[] = [];
    for (const w of [252, 262, 414, 1000]) {
      for (let la = 0; la <= Math.log10(12_000 * 365.25); la += 0.05) {
        const ampiezza = 10 ** la;
        for (let k = 0; k < 24; k++) {
          const jd = j0 + k * 15.3 - (ampiezza > 400 ? k * 300 * 365.25 : 0);
          if (!tacche(jd, ampiezza, w).some((t) => etichettaIntera(t, w))) vuote.push(`${w} px, ${ampiezza.toFixed(1)} giorni, JD ${jd}`);
        }
      }
    }
    expect(vuote).toEqual([]);
    // 23 giorni su 414 px al 19/10/2026: etichette dei giorni 11, 21 (unità di 10 giorni).
    const t = tacche(2_461_333, 1461 / 64, 414);
    expect(t.filter((x) => etichettaIntera(x, 414)).map((x) => x.etichetta)).toEqual(['11 ott', '21 ott']);
  });

  it('panoramica: tacche fisse e etichette senza collisioni', () => {
    const p = tacchePanoramica();
    expect(p.map((x) => x.etichetta)).toEqual([`10000${NB}a.C.`, `5000${NB}a.C.`, `1${NB}d.C.`, '1582', '2120']);
    expect(frazionePanoramica(JD_MIN_UT)).toBe(0);
    expect(frazionePanoramica(JD_MAX_UT_EXCL)).toBe(1);
    const voci = p.map((x) => ({ ...x, x: frazionePanoramica(x.jd) * 300 }));
    const tenute = etichetteSenzaCollisioni(voci, (e) => e.length * 6.4 + 4, 300);
    const nomi = voci.filter((v) => tenute.has(v)).map((v) => v.etichetta);
    expect(nomi).toContain(`10000${NB}a.C.`);
    expect(nomi).toContain('2120');
    expect(nomi).not.toContain('1582');
  });

  it('PagSu e PagGiù: unità superiore', () => {
    expect(unitaSuperiore('giorno')).toBe('mese');
    expect(unitaSuperiore('millennio')).toBe('millennio');
  });
});

describe('barra di scala e regolo delle distanze (R14, § 11.3)', () => {
  it('arrotondamento 1-2-5', () => {
    expect(arrotonda125(7.3)).toBe(5);
    expect(arrotonda125(19)).toBe(10);
    expect(arrotonda125(0.023)).toBe(0.02);
    expect(arrotonda125(3e7)).toBe(2e7);
  });

  it('barra in km o UA, non più lunga del massimo', () => {
    const b = barraScala(1000, 120);
    expect(b?.km).toBe(100_000);
    expect(b?.testo).toBe(`100${S}000${NB}km`);
    expect(b?.px).toBe(100);
    const u = barraScala(UA_KM / 50, 120);
    expect(u?.unita).toBe('UA');
    expect(u?.valore).toBe('2');
    expect(u?.px).toBeLessThanOrEqual(120);
    expect(barraScala(0)).toBeNull();
    // Valori 1-2-5 × 10^k (in km o in UA), lunghezza tra 120/2,5 e 120 px.
    for (const k of [0.37, 12.3, 4321, 9.9e7]) {
      const b = barraScala(k, 120)!;
      const v = b.unita === 'UA' ? b.km / UA_KM : b.km;
      expect([1, 2, 5]).toContain(Math.round(v / 10 ** Math.floor(Math.log10(v) + 1e-12)));
      expect(b.px).toBeLessThanOrEqual(120 + 1e-9);
      expect(b.px).toBeGreaterThan(120 / 2.5 - 1e-9);
    }
  });

  it('regolo logaritmico da 10³ km a 2·10⁵ UA, ampiezza massima della scena (RF1)', () => {
    expect(frazioneDaAmpiezza(1e3)).toBe(0);
    expect(frazioneDaAmpiezza(2e5 * UA_KM)).toBeCloseTo(1, 12);
    expect(frazioneDaAmpiezza(1e5 * UA_KM)).toBeLessThan(1);
    expect(frazioneDaAmpiezza(1)).toBe(0);
    expect(ampiezzaDaFrazione(1)).toBeCloseTo(10 ** LOG_AMPIEZZA_MAX, 0);
  });

  it('preset del § 11.3 e riconoscimento della vista', () => {
    expect(PRESET_VISTA.length).toBe(10);
    expect(PRESET_VISTA.find((p) => p.id === 'sistema-interno')).toMatchObject({ fuoco: 'sole', ampiezzaKm: 4 * UA_KM });
    expect(presetCorrispondente('sole', 4.5 * UA_KM)?.id).toBe('sistema-interno');
    expect(presetCorrispondente('terra', 1.2e6)?.id).toBe('terra-luna');
    expect(presetCorrispondente('sole', 30 * UA_KM)).toBeNull();
  });
});

describe('scorciatoie (§ 11.9, WCAG 2.1.4)', () => {
  const tasto = (key: string, extra: Partial<DatiTasto> = {}): DatiTasto => ({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...extra,
  });
  const libero: ContestoTasto = { campo: false, attivabile: false, dialogoAperto: false, attive: true };

  it('mappa dei tasti globali', () => {
    expect(azioneGlobale(tasto('/'), libero)).toBe('trova');
    expect(azioneGlobale(tasto(' '), libero)).toBe('riproduzione');
    expect(azioneGlobale(tasto(','), libero)).toBe('passoIndietro');
    expect(azioneGlobale(tasto('.'), libero)).toBe('passoAvanti');
    expect(azioneGlobale(tasto('['), libero)).toBe('velocitaMinore');
    expect(azioneGlobale(tasto(']'), libero)).toBe('velocitaMaggiore');
    expect(azioneGlobale(tasto('?', { shiftKey: true }), libero)).toBe('scorciatoie');
    expect(azioneGlobale(tasto('t'), libero)).toBe('testuale');
  });

  it('disattivabili; mai nei campi; Spazio mai su pulsanti; mai con modificatori o dialoghi', () => {
    expect(azioneGlobale(tasto('t'), { ...libero, attive: false })).toBeNull();
    expect(azioneGlobale(tasto('t'), { ...libero, campo: true })).toBeNull();
    expect(azioneGlobale(tasto(' '), { ...libero, attivabile: true })).toBeNull();
    expect(azioneGlobale(tasto('.'), { ...libero, attivabile: true })).toBe('passoAvanti');
    expect(azioneGlobale(tasto('t', { ctrlKey: true }), libero)).toBeNull();
    expect(azioneGlobale(tasto('t'), { ...libero, dialogoAperto: true })).toBeNull();
  });

  it('[ e ] con Opzione (macOS) o AltGr (Ctrl+Alt) della tastiera italiana; Alt non attiva le lettere', () => {
    expect(azioneGlobale(tasto(']', { altKey: true }), libero)).toBe('velocitaMaggiore');
    expect(azioneGlobale(tasto('[', { altKey: true }), libero)).toBe('velocitaMinore');
    expect(azioneGlobale(tasto(']', { ctrlKey: true, altKey: true }), libero)).toBe('velocitaMaggiore');
    expect(azioneGlobale(tasto(']', { ctrlKey: true }), libero)).toBeNull();
    expect(azioneGlobale(tasto(']', { metaKey: true }), libero)).toBeNull();
    expect(azioneGlobale(tasto('t', { altKey: true }), libero)).toBeNull();
    expect(azioneGlobale(tasto(' ', { altKey: true }), libero)).toBeNull();
  });

  it('tasti della mappa', () => {
    expect(azioneMappa(tasto('ArrowLeft'))).toMatchObject({ tipo: 'ruota' });
    expect(azioneMappa(tasto('ArrowLeft', { shiftKey: true }))).toMatchObject({ tipo: 'sposta' });
    expect(azioneMappa(tasto('+'))).toEqual({ tipo: 'zoom', fattore: 0.1 });
    expect(azioneMappa(tasto('PageDown'))).toEqual({ tipo: 'zoom', fattore: 10 });
    expect(azioneMappa(tasto('Enter'))).toEqual({ tipo: 'selezionaCentro' });
    expect(azioneMappa(tasto('n'))).toEqual({ tipo: 'successivo', verso: 1 });
    expect(azioneMappa(tasto('N', { shiftKey: true }))).toEqual({ tipo: 'successivo', verso: -1 });
    expect(azioneMappa(tasto('f'))).toEqual({ tipo: 'inquadra' });
    expect(azioneMappa(tasto('Escape'))).toEqual({ tipo: 'deseleziona' });
    expect(azioneMappa(tasto('Tab'))).toBeNull();
  });
});

describe('layout, catalogo, editor, tabella', () => {
  it('classi di larghezza del § 11.3', () => {
    expect(modalitaLayout(320, 640)).toBe('telefono');
    expect(modalitaLayout(599, 900)).toBe('telefono');
    // Il telefono arriva a 699 px, il tablet comincia a 700 px (schede 7-8 pollici, pieghevoli aperti, finestre a metà schermo).
    expect(modalitaLayout(600, 900)).toBe('telefono');
    expect(modalitaLayout(690, 829)).toBe('telefono');
    expect(modalitaLayout(699, 480)).toBe('telefono');
    expect(modalitaLayout(700, 480)).toBe('tablet');
    expect(modalitaLayout(700, 900)).toBe('tablet');
    expect(modalitaLayout(1023, 768)).toBe('tablet');
    expect(modalitaLayout(1024, 768)).toBe('desktop');
    expect(modalitaLayout(844, 390)).toBe('orizzontale');
    // Orizzontale con altezza < 480 px: prima della soglia dei 700 px, anche sopra di essa.
    expect(modalitaLayout(699, 479)).toBe('orizzontale');
    expect(modalitaLayout(700, 479)).toBe('orizzontale');
    expect(modalitaLayout(568, 320)).toBe('orizzontale');
    expect(modalitaLayout(320, 568)).toBe('telefono');
    // Finestra più alta che larga con altezza < 480 px: non è orizzontale.
    expect(modalitaLayout(320, 479)).toBe('telefono');
    expect(usaFoglio('orizzontale')).toBe(true);
    expect(usaFoglio('tablet')).toBe(false);
  });

  it('contatori dei filtri: categoria primaria o secondaria (§ 11.6)', () => {
    expect(contaPerCategoria(catalogo.corpi)).toEqual({
      pianeta: 8,
      'pianeta-nano': 5,
      luna: 30,
      asteroide: 32,
      centauro: 2,
      cometa: 26,
      tno: 13,
      interstellare: 3,
    });
  });

  it('visibilità per categorie primarie e secondarie (§ 4.2)', () => {
    const plutone = catalogo.corpi.find((c) => c.slug === 'plutone')!;
    const filtri = { pianeta: true, 'pianeta-nano': false, luna: true, asteroide: true, centauro: true, cometa: true, tno: true, interstellare: true };
    expect(visibileConFiltri(plutone, filtri)).toBe(true);
    expect(visibileConFiltri(plutone, { ...filtri, tno: false })).toBe(false);
  });

  it('lune annidate sotto il pianeta', () => {
    const sez = sezioniCatalogo(catalogo.corpi);
    expect(sez.map((s) => s.categoria)).toEqual(['sole', 'pianeta', 'pianeta-nano', 'asteroide', 'centauro', 'cometa', 'tno', 'interstellare']);
    const pianeti = sez.find((s) => s.categoria === 'pianeta')!;
    expect(pianeti.voci.find((v) => v.corpo.slug === 'terra')?.lune.map((l) => l.slug)).toEqual(['luna']);
    expect(pianeti.voci.find((v) => v.corpo.slug === 'giove')?.lune.length).toBe(6);
    const nani = sez.find((s) => s.categoria === 'pianeta-nano')!;
    expect(nani.voci.find((v) => v.corpo.slug === 'plutone')?.lune.map((l) => l.slug)).toEqual(['caronte', 'notte', 'idra']);
    expect(nani.voci.find((v) => v.corpo.slug === 'eris')?.lune.map((l) => l.slug)).toEqual(['disnomia']);
    const totale = sez.reduce((n, s) => n + s.voci.reduce((m, v) => m + 1 + v.lune.length, 0), 0);
    expect(totale).toBe(112);
  });

  it('campi numerici dell’editor', () => {
    expect(leggiIntero('')).toBeUndefined();
    expect(leggiIntero(' 04 ')).toBe(4);
    expect(leggiIntero('1a')).toBeNaN();
    expect(leggiIntero('-3')).toBeNaN();
    expect(OFFSET_AMMESSI[0]).toBe(-720);
    expect(OFFSET_AMMESSI[OFFSET_AMMESSI.length - 1]).toBe(840);
    expect(OFFSET_AMMESSI.length).toBe(105);
  });

  it('tabella: valori non applicabili distinti dai mancanti', () => {
    const c = (slug: string) => catalogo.corpi.find((x) => x.slug === slug)!;
    expect(['sole', 'terra', 'coordinate', 'affidabilita'].filter((k) => nonApplicabile(c('sole'), k as ColonnaTestuale))).toEqual([
      'sole',
      'coordinate',
      'affidabilita',
    ]);
    expect(nonApplicabile(c('terra'), 'terra')).toBe(true);
    expect(nonApplicabile(c('terra'), 'sole')).toBe(false);
    expect(nonApplicabile(c('marte'), 'terra')).toBe(false);
  });

  it('ordinamento della tabella con valori mancanti in fondo', () => {
    const c = (slug: string) => catalogo.corpi.find((x) => x.slug === slug)!;
    const righe: RigaTestuale[] = [
      { corpo: c('marte'), distanzaSoleKm: 2, distanzaTerraKm: 1, lon: 1, lat: 0, livello: 'precisa', erroreSoleKm: null, erroreTerraKm: null, inCaricamento: false },
      { corpo: c('sole'), distanzaSoleKm: null, distanzaTerraKm: 1, lon: null, lat: null, livello: null, erroreSoleKm: null, erroreTerraKm: null, inCaricamento: false },
      { corpo: c('venere'), distanzaSoleKm: 1, distanzaTerraKm: 3, lon: 2, lat: 0, livello: 'buona', erroreSoleKm: null, erroreTerraKm: null, inCaricamento: false },
    ];
    expect(ordinaRighe(righe, 'sole', 'ascending').map((r) => r.corpo.slug)).toEqual(['venere', 'marte', 'sole']);
    expect(ordinaRighe(righe, 'sole', 'descending').map((r) => r.corpo.slug)).toEqual(['marte', 'venere', 'sole']);
    expect(ordinaRighe(righe, 'corpo', 'ascending').map((r) => r.corpo.slug)).toEqual(['marte', 'sole', 'venere']);
    expect(ordinaRighe(righe, 'affidabilita', 'descending').map((r) => r.corpo.slug)).toEqual(['venere', 'marte', 'sole']);
  });

  it('ordinamento per nome con i numeri come numeri: 1P, 9P, 12P, 103P (§ 11.9)', () => {
    const base = catalogo.corpi.find((x) => x.slug === 'marte')!;
    const riga = (nome: string): RigaTestuale => ({
      corpo: { ...base, nome, slug: nome },
      distanzaSoleKm: 1,
      distanzaTerraKm: 1,
      lon: 0,
      lat: 0,
      livello: 'precisa',
      erroreSoleKm: null,
      erroreTerraKm: null,
      inCaricamento: false,
    });
    // Nomi come nel catalogo: comete e interstellari con la designazione numerica, un asteroide con il numero, un nome.
    const attesi = ['1I/ʻOumuamua', '1P/Halley', '2I/Borisov', '2P/Encke', '3I/ATLAS', '9P/Tempel 1', '12P/Pons-Brooks', '19P/Borrelly', '52 Europa', '81P/Wild 2', '103P/Hartley 2', '109P/Swift-Tuttle', 'Amaltea'];
    // In ingresso l'ordine lessicografico (103P prima di 12P e di 1P).
    const mescolati = [...attesi].sort();
    expect(mescolati).not.toEqual(attesi);
    expect(ordinaRighe(mescolati.map(riga), 'corpo', 'ascending').map((r) => r.corpo.nome)).toEqual(attesi);
    expect(ordinaRighe(mescolati.map(riga), 'corpo', 'descending').map((r) => r.corpo.nome)).toEqual([...attesi].reverse());
  });

  it('cella senza valore: non applicabile, in caricamento o non disponibile (§ 11.9)', () => {
    const c = (slug: string) => catalogo.corpi.find((x) => x.slug === slug)!;
    // Non applicabile prevale, anche con i dati in caricamento.
    expect(testoSenzaValore(c('sole'), 'sole', true)).toBe('non applicabile');
    expect(testoSenzaValore(c('sole'), 'affidabilita', false)).toBe('non applicabile');
    expect(testoSenzaValore(c('terra'), 'terra', true)).toBe('non applicabile');
    // Altrimenti dipende dai dati: in arrivo o assenti alla data (o non caricati per un errore).
    expect(testoSenzaValore(c('marte'), 'sole', true)).toBe('in caricamento');
    expect(testoSenzaValore(c('marte'), 'affidabilita', true)).toBe('in caricamento');
    expect(testoSenzaValore(c('sole'), 'terra', true)).toBe('in caricamento');
    expect(testoSenzaValore(c('marte'), 'coordinate', false)).toBe('non disponibile');
    expect(testoSenzaValore(c('sole'), 'terra', false)).toBe('non disponibile');
  });

  it('ordinamento per longitudine nell’intervallo mostrato, da 0° a 360° (non da −180° a 180°)', () => {
    const c = (slug: string) => catalogo.corpi.find((x) => x.slug === slug)!;
    const riga = (slug: string, gradi: number): RigaTestuale => ({
      corpo: c(slug),
      distanzaSoleKm: 1,
      distanzaTerraKm: 1,
      lon: Math.atan2(Math.sin((gradi * Math.PI) / 180), Math.cos((gradi * Math.PI) / 180)),
      lat: 0,
      livello: 'precisa',
      erroreSoleKm: null,
      erroreTerraKm: null,
      inCaricamento: false,
    });
    const righe = [riga('marte', 183.38), riga('venere', 10), riga('giove', 350), riga('saturno', 170), riga('urano', 184.46)];
    expect(ordinaRighe(righe, 'coordinate', 'ascending').map((r) => r.corpo.slug)).toEqual(['venere', 'saturno', 'marte', 'urano', 'giove']);
    expect(ordinaRighe(righe, 'coordinate', 'descending').map((r) => r.corpo.slug)).toEqual(['giove', 'urano', 'marte', 'saturno', 'venere']);
  });
});

describe('dati della scheda (§ 11.7)', () => {
  const eff = new EffemeridiFinte(catalogo);
  const calc = new CalcolatoreScheda(eff, catalogo.corpi);
  const t = makeTimeStateFinto(2_461_332.4, 'UT');
  const corpo = (slug: string) => catalogo.corpi.find((c) => c.slug === slug)!;

  it('Terra: circa 1 UA dal Sole, elementi eliocentrici, nessuna distanza dalla Terra', () => {
    const d = calc.calcola(corpo('terra'), t);
    expect(d.stato).toBe('ok');
    expect(d.distanzaSoleKm! / UA_KM).toBeGreaterThan(0.98);
    expect(d.distanzaSoleKm! / UA_KM).toBeLessThan(1.02);
    expect(d.distanzaTerraKm).toBeNull();
    expect(d.elementi?.riferimento).toBe('eliocentrici');
    expect(d.elementi!.a / UA_KM).toBeCloseTo(1, 2);
    expect(d.elementi!.P).toBeGreaterThan(365);
    expect(d.elementi!.P).toBeLessThan(366);
    expect(d.sorgente).toBe('DE441 (Park et al. 2021)');
  });

  it('Luna: velocità rispetto alla Terra e tempo luce', () => {
    const d = calc.calcola(corpo('luna'), t);
    expect(d.velocitaRispetto?.slug).toBe('terra');
    expect(d.velocitaKmS!).toBeGreaterThan(0.9);
    expect(d.velocitaKmS!).toBeLessThan(1.2);
    expect(d.distanzaTerraKm!).toBeGreaterThan(350_000);
    expect(d.tempoLuceS!).toBeCloseTo(d.distanzaTerraKm! / 299_792.458, 9);
    // La Luna non usa il modello dei satelliti: elementi geocentrici nell'eclittica J2000.
    expect(d.elementi?.riferimento).toBe('planetocentrici');
  });

  it('oggetto interstellare: orbita iperbolica senza periodo, con velocità all’infinito', () => {
    const d = calc.calcola(corpo('1i-oumuamua'), makeTimeStateFinto(2_458_100.5, 'UT'));
    expect(d.elementi!.e).toBeGreaterThan(1);
    expect(d.elementi!.P).toBe(Number.POSITIVE_INFINITY);
    expect(d.elementi!.vInf!).toBeGreaterThan(20);
    expect(d.elementi!.vInf!).toBeLessThan(30);
  });

  it('Sole: nessun elemento', () => {
    const d = calc.calcola(corpo('sole'), t);
    expect(d.elementi).toBeNull();
    expect(d.distanzaSoleKm).toBeNull();
  });
});
