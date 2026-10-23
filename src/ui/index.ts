// Interfaccia utente (§ 11 di docs/PROGETTO.md): punto d'ingresso per l'integrazione.
//
// creaInterfaccia(radice, dipendenze) costruisce l'interfaccia nella radice e restituisce un
// controller. L'interfaccia osserva lo store (src/app/store.ts) e comanda la scena tramite
// ScenaUi (src/ui/contrattoScena.ts). L'app deve:
// - montare la scena: lo fa l'interfaccia chiamando scena.monta(contenitoreScena);
// - calcolare il TimeState per la scena dallo store (tempo.jd, tempo.scala) con makeTimeState;
// - chiamare aggiornaTempo() quando cambiano i dati disponibili (blocchi caricati), anche a
//   tempo invariato, e aggiornaAffidabilita() dopo il caricamento di reliability.bin;
// - segnalare caricamenti ed errori con impostaCaricamento() e mostraErrore().

import './tokens.css';
import './stile.css';

import { CATEGORIE_FILTRO, FILTRI_PREDEFINITI, LIVELLI_PREDEFINITI, VELOCITA_S, creaStoreApp } from '../app/store';
import type { CategoriaFiltro, LivelloVisivo, StoreApp } from '../app/store';
import type { Preferenze, UrlState } from '../app/types';
import type { Catalogo, CategoriaCorpo, CorpoCatalogo } from '../data/catalogTypes';
import { RE_SLUG } from '../data/catalogTypes';
import type { Affidabilita, EphemerisService, Livello } from '../ephem/types';
import { JD_MAX_UT_EXCL, JD_MIN_UT, giornoSettimanaLocale, jdToCalendarLocale } from '../time/calendar';
import { UNITA_PASSO, passo as passoTempo } from '../time/steps';
import type { UnitaPasso } from '../time/steps';
import type { LimiteIntervallo, MakeTimeState, ScalaTempo, TimeState } from '../time/types';
import { Annunciatore, scrittoreRegione } from './annunci';
import type { OpzioniAnnuncio } from './annunci';
import { creaCatalogo, visibileConFiltri } from './catalogo';
import { creaIndice, dettaglioRicerca } from './cerca';
import type { IndiceRicerca } from './cerca';
import { creaConsole, etichettaScala, testoVelocita } from './console';
import type { InfoDeltaT } from './console';
import type { IngressoStagione, OpzioniFuoco, ScenaUi, StatoVista } from './contrattoScena';
import { CalcolatoreScheda } from './datiScheda';
import type { DatiScheda } from './datiScheda';
import { contenutoFontiMetodi, contenutoImpostazioni, contenutoScorciatoie, creaDialogo } from './dialoghi';
import { attributo, h, nuovoId } from './dom';
import { creaDistanze } from './distanze';
import { formatAmpiezza, formatData, formatOra } from './format';
import { icona } from './icone';
import { collocaPannelli, modalitaLayout, usaFoglio } from './layout';
import type { ModalitaLayout } from './layout';
import { creaPannelloLivelli } from './livelli';
import { istanteAlLimite, messaggioLimite, testoIntervallo } from './messaggi';
import { creaAvvisi } from './avvisi';
import type { ErroreInterfaccia } from './avvisi';
import { creaDisclosure } from './popover';
import { MotoreRiproduzione } from './riproduzione';
import type { LimitiScala } from './riproduzione';
import { PRESET_VISTA, presetCorrispondente } from './scala';
import type { PresetVista } from './scala';
import { creaScheda } from './scheda';
import { azioneGlobale, azioneMappa, contestoDa } from './scorciatoie';
import { creaTrova } from './trova';
import { GIORNI_SETTIMANA, NOMI_PRESET, T } from './testi.it';
import { VALORI_VALIDAZIONE } from './valoriValidazione';
import type { ValoriValidazione } from './valoriValidazione';
import { creaVistaTestuale } from './vistaTestuale';
import type { RigaTestuale } from './vistaTestuale';

export type { ScenaUi, StatoVista, IngressoStagione } from './contrattoScena';
export type { ErroreInterfaccia } from './avvisi';
export type { DatiScheda } from './datiScheda';

export interface DipendenzeInterfaccia {
  /** Effemeridi runtime (§ 5.4). */
  effemeridi: EphemerisService;
  /** Conversione UT/TT (src/time/timescale.ts): unico punto di conversione. */
  makeTimeState: MakeTimeState;
  /** Scena 3D; null senza WebGL2 (la vista testuale diventa l'unica vista). */
  scena: ScenaUi | null;
  /** Istante corrente in JD UT (src/app/clock.ts). */
  adessoJdUT: () => number;
  /** Preferenze locali protette (mai la data). */
  preferenze: Preferenze;
  /** Catalogo, se già caricato; altrimenti impostaCatalogo(). */
  catalogo?: Catalogo | null;
  /** Stato nell'URL (hash con lo slug del corpo a fuoco). */
  url?: UrlState;
  /** Store condiviso; se assente se ne crea uno con statoIniziale(adessoJdUT()). */
  store?: StoreApp;
  /** Dati dell'istante (JD TT) mancanti per un errore di caricamento: la riproduzione si ferma (§ 5.6). */
  datiInErrore?: (jdTT: number) => boolean;
  /** Stagione astronomica dell'istante (src/time/seasons.ts o adattatore). */
  stagione?: (t: TimeState) => IngressoStagione | null;
  /** Valori di accuratezza per "Fonti e metodi". */
  valori?: ValoriValidazione;
  /** Orologio monotono in ms (predefinito performance.now). */
  ora?: () => number;
  /** Copia negli appunti (predefinito navigator.clipboard). */
  copia?: (testo: string) => Promise<void>;
  /** URL della pagina senza frammento (predefinito location.href senza hash). */
  urlBase?: () => string;
}

export interface StatoCaricamento {
  /** Intervallo dei dati attesi, JD TT. */
  jd0?: number;
  jd1?: number;
  /** Testo alternativo all'intervallo. */
  testo?: string;
}

/** Controller per l'integrazione. */
export interface ControllerInterfaccia {
  readonly store: StoreApp;
  /** Contenitore della mappa in cui la scena monta la canvas. */
  readonly contenitoreScena: HTMLElement;
  /** Imposta o sostituisce il catalogo (ricerca, elenchi, scheda). */
  impostaCatalogo(c: Catalogo): void;
  /**
   * Ridisegna i pannelli che dipendono dal tempo e dai dati (console, scheda, ΔT, stagione,
   * vista testuale). Con t usa quel TimeState invece di ricalcolarlo. Al massimo 4 volte al
   * secondo in riproduzione.
   */
  aggiornaTempo(t?: TimeState): void;
  /** Ricalcola affidabilità di scheda, catalogo, fasce del regolo e tabella (dopo reliability.bin). */
  aggiornaAffidabilita(): void;
  /** Stato di caricamento (barra sottile con testo); null per nasconderlo. */
  impostaCaricamento(s: StatoCaricamento | null): void;
  /** Errore in pagina con "Riprova" facoltativo (§ 11.11). */
  mostraErrore(e: ErroreInterfaccia): void;
  rimuoviErrore(id: string): void;
  /** Errore di caricamento di un blocco: "Impossibile caricare i dati per il periodo ...". */
  erroreBlocco(id: string, jd0: number, jd1: number, riprova: () => void): void;
  /** Avviso informativo chiudibile (ad esempio il limite dell'intervallo, § 11.4.3). */
  notifica(id: string, testo: string): void;
  /**
   * Annuncio nella live region unica (al massimo uno ogni 1,5 s). In riproduzione tacciono solo gli annunci dovuti
   * al tempo (`dalTempo`): quelli che seguono un'azione dell'utente si pronunciano sempre.
   */
  annuncia(testo: string, opzioni?: OpzioniAnnuncio): void;
  /** Dati della scheda forniti dall'integrazione: sostituiscono quelli calcolati per il corpo indicato. */
  impostaDatiScheda(dati: DatiScheda | null): void;
  /** Stagione da src/time/seasons.ts; disattiva il calcolo con dipendenze.stagione. */
  impostaStagione(s: IngressoStagione | null): void;
  /** ΔT e incertezza da mostrare; disattiva il calcolo dal TimeState. */
  impostaDeltaT(i: InfoDeltaT | null): void;
  /** Senza WebGL2: messaggio bloccante e vista testuale permanente (§ 11.11). */
  senzaWebGL(): void;
  /** Ricalcola barra di scala, regolo delle distanze ed etichetta della mappa. */
  aggiornaVista(): void;
  /** Mette a fuoco un corpo (con transizione), come la ricerca. */
  mettiAFuoco(slug: string, opzioni?: OpzioniFuoco): void;
  distruggi(): void;
}

const CHIAVI_PREF = {
  livelli: 'ss.ui.livelli',
  filtri: 'ss.ui.filtri',
  unita: 'ss.ui.unitaPasso',
  velocita: 'ss.ui.velocita',
  scorciatoie: 'ss.ui.scorciatoie',
  prolettica: 'ss.ui.rigaProlettica',
  benvenuto: 'ss.ui.benvenutoChiuso',
} as const;

const INTERVALLO_PANNELLI_MS = 250;
/** Larghezza minima (px) della nota di benvenuto intera su desktop e tablet: con meno spazio la nota è ridotta (§ 11.3). */
const LARGHEZZA_MIN_NOTA_PX = 200;
/** Altezza minima (px) della nota intera su desktop e tablet, come il minimo dei messaggi su telefono e in orizzontale (§ 11.3). */
const ALTEZZA_MIN_NOTA_PX = 120;
/** Caratteri dell'hash riportati nel messaggio del collegamento ignorato. */
const LUNGHEZZA_HASH_MOSTRATA = 40;
const CAMPIONI_BANDE = 240;

function leggiBooleani<K extends string>(pref: Preferenze, chiave: string, base: Readonly<Record<K, boolean>>): Record<K, boolean> {
  const v = pref.leggi<unknown>(chiave, null);
  const out = { ...base } as Record<K, boolean>;
  if (v && typeof v === 'object') {
    for (const k of Object.keys(base) as K[]) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'boolean') out[k] = x;
    }
  }
  return out;
}

export function creaInterfaccia(radice: HTMLElement, d: DipendenzeInterfaccia): ControllerInterfaccia {
  const ora = d.ora ?? (() => performance.now());
  const store = d.store ?? creaStoreApp(d.adessoJdUT());
  const scena = d.scena;
  const pref = d.preferenze;

  // --- Preferenze ---
  store.transazione(() => {
    store.set({
      livelli: leggiBooleani<LivelloVisivo>(pref, CHIAVI_PREF.livelli, LIVELLI_PREDEFINITI),
      filtri: leggiBooleani<CategoriaFiltro>(pref, CHIAVI_PREF.filtri, FILTRI_PREDEFINITI),
    });
    const unita = pref.leggi<unknown>(CHIAVI_PREF.unita, null);
    if (typeof unita === 'string' && (UNITA_PASSO as readonly string[]).includes(unita)) store.set({ unitaPasso: unita as UnitaPasso });
    const vel = pref.leggi<unknown>(CHIAVI_PREF.velocita, null);
    if (typeof vel === 'number' && Number.isInteger(vel) && vel >= 0 && vel < VELOCITA_S.length) {
      store.aggiorna('riproduzione', { velocita: vel });
    }
    const sc = pref.leggi<unknown>(CHIAVI_PREF.scorciatoie, true);
    const pr = pref.leggi<unknown>(CHIAVI_PREF.prolettica, false);
    const bv = pref.leggi<unknown>(CHIAVI_PREF.benvenuto, false);
    store.aggiorna('interfaccia', {
      scorciatoie: sc !== false,
      rigaProlettica: pr === true,
      benvenutoChiuso: bv === true,
    });
  });

  // --- Stato interno ---
  let corpi: CorpoCatalogo[] = [];
  let perSlug = new Map<string, CorpoCatalogo>();
  let perSsid = new Map<number, CorpoCatalogo>();
  let indice: IndiceRicerca | null = null;
  const calcolatore = new CalcolatoreScheda(d.effemeridi, []);
  let datiEsterni: DatiScheda | null = null;
  let stagioneEsterna: IngressoStagione | null | undefined;
  let deltaTEsterno: InfoDeltaT | null | undefined;
  let tsEsterno: TimeState | null = null;
  let senzaGL = scena === null;
  let opzioniFuocoPendenti: OpzioniFuoco | null = null;
  let fuocoDaScena = false;
  let ultimaVista: StatoVista | null = null;
  let modalita: ModalitaLayout = 'desktop';
  const annullatori: (() => void)[] = [];

  // --- Live region ---
  const regioneAnnunci = h('div', { class: 'ss-sr ss-annunci', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const annunciatore = new Annunciatore({
    scrivi: scrittoreRegione(regioneAnnunci),
    ora,
    pianifica: (cb, ms) => window.setTimeout(cb, ms),
    annulla: (id) => window.clearTimeout(id),
    silenzioso: () => store.get().riproduzione.attiva,
  });
  const annuncia = (t: string, o?: OpzioniAnnuncio) => annunciatore.annuncia(t, o);

  // --- Tempo: limiti, offset, passi ---
  const cacheLimiti = new Map<ScalaTempo, LimitiScala>();
  function limiti(): LimitiScala {
    const scala = store.get().tempo.scala;
    let l = cacheLimiti.get(scala);
    if (!l) {
      l =
        scala === 'UT'
          ? { min: JD_MIN_UT, maxEscl: JD_MAX_UT_EXCL }
          : { min: d.makeTimeState(JD_MIN_UT, 'UT').jdTT, maxEscl: d.makeTimeState(JD_MAX_UT_EXCL, 'UT').jdTT };
      cacheLimiti.set(scala, l);
    }
    return l;
  }
  function offsetEffettivo(): number {
    const s = store.get();
    return s.tempo.scala === 'UT' && s.offsetMinuti !== null ? s.offsetMinuti : 0;
  }
  function limita(jd: number): number {
    const l = limiti();
    return Math.min(l.maxEscl - 1 / 86400, Math.max(l.min, jd));
  }
  function timeState(): TimeState {
    const s = store.get();
    if (tsEsterno !== null) {
      const atteso = s.tempo.scala === 'UT' ? tsEsterno.jdUT : tsEsterno.jdTT;
      if (atteso === s.tempo.jd && tsEsterno.scalaIngresso === s.tempo.scala) return tsEsterno;
    }
    return d.makeTimeState(s.tempo.jd, s.tempo.scala);
  }
  function testoData(): string {
    const s = store.get();
    const off = offsetEffettivo();
    const dc = jdToCalendarLocale(s.tempo.jd, off);
    const scala = etichettaScala(s.tempo.scala, s.tempo.scala === 'UT' ? s.offsetMinuti : null);
    const giorno = GIORNI_SETTIMANA[giornoSettimanaLocale(s.tempo.jd, off)] ?? '';
    return `${formatData(dc)}, ${formatOra(dc.ora, dc.minuto)} ${scala}, ${giorno}`;
  }
  /**
   * "Segui l'ora attuale" spento da un'azione che non è il suo comando (passo, "Adesso", regolo, editor) e non ancora
   * detto: lo si annuncia insieme alla data o al limite che l'azione annuncia, perché due annunci ravvicinati si
   * sostituirebbero (§ 11.9).
   */
  let seguiSpentoDaDire = false;
  function annunciaData(): void {
    const data = testoData();
    annuncia(seguiSpentoDaDire ? T.annunci.conSeguiDisattivato(data) : T.annunci.data(data));
    seguiSpentoDaDire = false;
  }
  function impostaTempo(jd: number): void {
    const s = store.get();
    store.transazione(() => {
      if (s.riproduzione.seguiOra) {
        store.aggiorna('riproduzione', { seguiOra: false, attiva: false });
        seguiSpentoDaDire = true;
      }
      store.aggiorna('tempo', { jd: limita(jd) });
    });
    motore.riancora();
  }
  /** Limite indicato dall'avviso "limite" in pagina: l'avviso resta finché l'istante è a quel limite (§ 6.6). */
  let limiteAvvisato: LimiteIntervallo | null = null;
  function avvisaLimite(limite: LimiteIntervallo, jd: number): void {
    const s = store.get();
    const messaggio = messaggioLimite(limite, jd, { offsetMinuti: s.offsetMinuti, scala: s.tempo.scala });
    avvisi.notifica('limite', messaggio, seguiSpentoDaDire ? T.annunci.conSeguiDisattivato(messaggio) : undefined);
    seguiSpentoDaDire = false;
    limiteAvvisato = limite;
  }
  function rimuoviAvvisoLimite(): void {
    avvisi.rimuoviErrore('limite');
    limiteAvvisato = null;
  }
  /** Passo dell'unità; false se si è fermato al limite (messaggio del limite al posto della data, § 6.6). */
  function eseguiPasso(unita: UnitaPasso, n: number, annunciaPasso = true): boolean {
    const s = store.get();
    const l = limiti();
    const esito = passoTempo(s.tempo.jd, unita, n, { offsetMinuti: offsetEffettivo(), jdMin: l.min, jdMaxEscl: l.maxEscl });
    if (!esito.fermo) impostaTempo(esito.jd);
    if (esito.limite !== null) {
      avvisaLimite(esito.limite, esito.jd);
      return false;
    }
    rimuoviAvvisoLimite();
    if (annunciaPasso) annunciaData();
    return true;
  }
  function adesso(): void {
    const s = store.get();
    const jdUT = d.adessoJdUT();
    const jd = s.tempo.scala === 'UT' ? jdUT : d.makeTimeState(jdUT, 'UT').jdTT;
    impostaTempo(jd);
    // Orologio fuori dall'intervallo (I2): istante limitato con il messaggio del limite (§ 11.4.3).
    const l = limiti();
    if (jd < l.min || jd >= l.maxEscl) avvisaLimite(jd < l.min ? 'inferiore' : 'superiore', store.get().tempo.jd);
    else annunciaData();
  }
  function cambiaScala(scala: ScalaTempo): void {
    const s = store.get();
    if (s.tempo.scala === scala) return;
    const ts = d.makeTimeState(s.tempo.jd, s.tempo.scala);
    store.transazione(() => {
      store.aggiorna('tempo', { scala, jd: scala === 'TT' ? ts.jdTT : ts.jdUT });
      // Uscita da "Segui l'ora attuale": la riproduzione si ferma, come spegnendo l'opzione (nessuna corsa a 1 giorno/s).
      if (scala === 'TT' && s.riproduzione.seguiOra) store.aggiorna('riproduzione', { seguiOra: false, attiva: false });
    });
    store.aggiorna('tempo', { jd: limita(store.get().tempo.jd) });
    // L'ingresso in TT non annuncia altro: l'uscita da "Segui l'ora attuale" si dice da sola.
    if (scala === 'TT' && s.riproduzione.seguiOra) annuncia(T.annunci.seguiOra(false));
  }
  function alternaRiproduzione(): void {
    const r = store.get().riproduzione;
    seguiSpentoDaDire = false;
    if (r.attiva) {
      store.aggiorna('riproduzione', { attiva: false, seguiOra: false });
      annuncia(T.annunci.riproduzioneFerma(testoData()));
    } else {
      annunciatore.scarta();
      store.aggiorna('riproduzione', { attiva: true, seguiOra: false });
    }
  }
  function cambiaVelocita(i: number): void {
    const r = store.get().riproduzione;
    // Con "Segui l'ora attuale" la data avanza a 1 s/s: velocità e direzione sono disattivate (console.ts).
    if (r.seguiOra && r.attiva) {
      annuncia(T.console.velocitaSegui);
      return;
    }
    const v = Math.max(0, Math.min(VELOCITA_S.length - 1, i));
    store.aggiorna('riproduzione', { velocita: v });
    annuncia(T.annunci.velocita(testoVelocita(v)));
  }
  function alternaSeguiOra(v: boolean): void {
    seguiSpentoDaDire = false;
    if (v) {
      if (store.get().tempo.scala === 'TT') cambiaScala('UT');
      store.transazione(() => {
        store.aggiorna('tempo', { jd: limita(d.adessoJdUT()) });
        store.aggiorna('riproduzione', { seguiOra: true, attiva: true });
      });
    } else store.aggiorna('riproduzione', { seguiOra: false, attiva: false });
    // Azione dell'utente: annunciata anche con la riproduzione attiva.
    annuncia(T.annunci.seguiOra(v));
  }

  const motore = new MotoreRiproduzione({
    store,
    ora,
    pianifica: (cb) => requestAnimationFrame(cb),
    annulla: (id) => cancelAnimationFrame(id),
    limiti,
    pronto: (jd) => {
      const s = store.get();
      const jdTT = s.tempo.scala === 'TT' ? jd : d.makeTimeState(jd, 'UT').jdTT;
      return d.effemeridi.pronto(jdTT);
    },
    inErrore: (jd) => {
      if (!d.datiInErrore) return false;
      const s = store.get();
      return d.datiInErrore(s.tempo.scala === 'TT' ? jd : d.makeTimeState(jd, 'UT').jdTT);
    },
    adesso: () => d.adessoJdUT(),
    alLimite: (limite, jd) => avvisaLimite(limite, jd),
    // Arresto per errore di un blocco: il messaggio in pagina era taciuto durante la riproduzione, ora si dice l'arresto.
    alErrore: () => annuncia(T.annunci.riproduzioneFermaErrore(testoData())),
  });

  // --- Corpi ---
  function ssidDi(slug: string | null): number | null {
    if (slug === null) return null;
    return perSlug.get(slug)?.ssid ?? null;
  }
  function seleziona(c: CorpoCatalogo | null, opzioni: { fuoco?: boolean; annuncio?: string } = {}): void {
    const dalCatalogo = catalogo.elemento.contains(document.activeElement);
    // Telefono: il foglio esteso della scheda copre la tabella e con essa la riga che ha il focus.
    const dallaTabella = modalita === 'telefono' && testuale.elemento.contains(document.activeElement);
    store.transazione(() => {
      store.set({ selezionato: c?.slug ?? null });
      // Da ricerca, catalogo e tabella il corpo si inquadra e la scheda si apre; dalla mappa no.
      if (c && opzioni.fuoco) {
        mettiAFuoco(c.slug, { inquadratura: 'orbita' });
        if (usaFoglio(modalita)) store.aggiorna('interfaccia', { catalogoAperto: false, foglio: 'esteso', schedaEspansa: true });
        else if (modalita === 'tablet') store.aggiorna('interfaccia', { catalogoAperto: false });
      }
    });
    annuncia(opzioni.annuncio ?? (c ? T.annunci.selezionato(c.nome) : T.annunci.deselezionato));
    // Catalogo chiuso dalla selezione (tablet e telefono): il focus passa alla scheda aperta (WCAG 2.4.3).
    if (c && dalCatalogo && catalogo.elemento.hidden) focusSchedaDopoAggiornamento = true;
    // Riga della tabella sotto il foglio esteso (telefono): il focus passa al titolo della scheda (WCAG 2.4.3, 2.4.11).
    if (c && opzioni.fuoco && dallaTabella) focusSchedaDopoAggiornamento = true;
  }
  /** Focus sul titolo della scheda al prossimo ridisegno dei pannelli, o sul pulsante del catalogo senza scheda. */
  let focusSchedaDopoAggiornamento = false;
  function mettiAFuoco(slug: string, opz: OpzioniFuoco = { inquadratura: 'orbita' }): void {
    const ssid = ssidDi(slug);
    if (ssid === null) return;
    if (store.get().fuoco === slug) scena?.mettiAFuoco(ssid, opz);
    else {
      opzioniFuocoPendenti = opz;
      store.set({ fuoco: slug });
    }
  }
  function inquadra(): void {
    const s = store.get();
    const slug = s.selezionato ?? s.fuoco;
    mettiAFuoco(slug, { inquadratura: 'corpo' });
    const c = perSlug.get(slug);
    // Senza posizione alla data (§ 7.8.2) la scena resta centrata sul primario: niente "Vista centrata su".
    if (c) annuncia(scena?.statoVista().fuocoSenzaPosizione ? T.annunci.fuocoSenzaPosizione(c.nome) : T.annunci.fuoco(c.nome));
  }
  function vaiAPreset(p: PresetVista): void {
    mettiAFuoco(p.fuoco, { ampiezzaKm: p.ampiezzaKm, vistaSistema: p.vistaSistema === true });
  }
  /** Sul telefono il pulsante della vista testuale è nel menu: il focus torna al pulsante visibile. */
  function pulsanteTestualeVisibile(): HTMLElement {
    return pulsanteTabella.offsetParent !== null ? pulsanteTabella : pulsanteMenu;
  }

  // --- Componenti ---
  const pulsanteCatalogo = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-trova-catalogo', 'aria-label': T.trova.apriCatalogoEsteso, title: T.trova.apriCatalogoEsteso },
    icona('catalogo'),
    h('span', { class: 'ss-etichetta-pulsante' }, T.trova.apriCatalogo),
  );
  pulsanteCatalogo.addEventListener('click', () => {
    const aperto = !store.get().interfaccia.catalogoAperto;
    // Modello disclosure: il focus resta sul pulsante; il catalogo segue nell'ordine di tabulazione.
    store.aggiorna('interfaccia', { catalogoAperto: aperto, ...(aperto && usaFoglio(modalita) ? { foglio: 'esteso' as const } : {}) });
  });

  const trova = creaTrova({
    indice: () => indice,
    dettaglio: (c) => dettaglioRicerca(c, c.primario ? perSlug.get(c.primario) : undefined),
    seleziona: (c) => seleziona(c, { fuoco: true }),
    annuncia: (t) => annuncia(t),
    pulsanteCatalogo,
  });

  const catalogo = creaCatalogo({
    store,
    seleziona: (c) => seleziona(c, { fuoco: true }),
    chiudi: () => {
      store.aggiorna('interfaccia', { catalogoAperto: false });
      pulsanteCatalogo.focus();
    },
    annuncia: (t) => annuncia(t),
    livello: (c) => livelloAllaData(c),
  });
  attributo(pulsanteCatalogo, 'aria-controls', catalogo.elemento.id);
  catalogo.elemento.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      store.aggiorna('interfaccia', { catalogoAperto: false });
      pulsanteCatalogo.focus();
    }
  });

  const livelli = creaPannelloLivelli(store, (t) => annuncia(t));
  const pulsanteLivelli = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-strumento', 'aria-label': T.barra.livelli, title: T.barra.livelli },
    icona('livelli'),
    h('span', { class: 'ss-etichetta-pulsante' }, T.barra.livelli),
  );
  const discLivelli = creaDisclosure(pulsanteLivelli, livelli.elemento);

  const pulsanteTabella = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-strumento ss-solo-ampio', 'aria-pressed': 'false', 'aria-label': T.barra.tabellaNome, title: T.barra.tabellaEsteso },
    icona('tabella'),
    h('span', { class: 'ss-etichetta-pulsante' }, T.barra.tabella),
  );
  pulsanteTabella.addEventListener('click', () => alternaTestuale());
  const pulsanteFonti = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-strumento ss-solo-ampio', 'aria-label': T.barra.fonti, title: T.barra.fonti },
    icona('libro'),
    h('span', { class: 'ss-etichetta-pulsante' }, T.barra.fonti),
  );
  const pulsanteImpostazioni = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-strumento ss-solo-ampio', 'aria-label': T.barra.impostazioni, title: T.barra.impostazioni },
    icona('ingranaggio'),
    h('span', { class: 'ss-etichetta-pulsante ss-etichetta-pulsante--facoltativa' }, T.barra.impostazioni),
  );

  // Menu del telefono: viste, tabella, fonti, impostazioni.
  const pulsanteMenu = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-strumento ss-solo-telefono', 'aria-label': T.barra.menu, title: T.barra.menu },
    icona('menu'),
  );
  const menuTabella = h('button', { type: 'button', class: 'ss-menu-voce', 'aria-pressed': 'false' }, icona('tabella'), h('span', null, T.barra.tabellaEsteso));
  const menuFonti = h('button', { type: 'button', class: 'ss-menu-voce' }, icona('libro'), h('span', null, T.barra.fonti));
  const menuImpostazioni = h('button', { type: 'button', class: 'ss-menu-voce' }, icona('ingranaggio'), h('span', null, T.barra.impostazioni));
  const idMenu = nuovoId('menu');
  const pannelloMenu = h('div', { class: 'ss-popover ss-menu', id: idMenu, role: 'group', 'aria-label': T.barra.menu });
  // Ogni apertura parte dalla prima voce; Tab oltre l'ultima voce chiude il menu, che non copre il controllo successivo.
  const discMenu = creaDisclosure(pulsanteMenu, pannelloMenu, {
    onCambio: (aperto) => {
      if (aperto) pannelloMenu.scrollTop = 0;
    },
    chiudiFocusFuori: true,
  });

  const distanze = creaDistanze({
    impostaAmpiezza: (km) => scena?.impostaAmpiezza(km),
    zoom: (f) => scena?.zoom(f),
    inquadra,
    preset: vaiAPreset,
    annuncia: (t) => annuncia(t),
  });
  pannelloMenu.append(
    h('h2', { class: 'ss-pannello-titolo' }, T.barra.vista),
    distanze.creaElencoPreset(() => discMenu.chiudi(true)),
    h('hr', { class: 'ss-separatore' }),
    menuTabella,
    menuFonti,
    menuImpostazioni,
  );
  menuTabella.addEventListener('click', () => {
    discMenu.chiudi();
    alternaTestuale();
  });

  const maniglia = h('button', { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-maniglia' }, icona('su'));
  const consoleT = creaConsole({
    store,
    makeTimeState: d.makeTimeState,
    limiti,
    passo: eseguiPasso,
    vai: (jd) => impostaTempo(jd),
    conferma: (jd) => {
      impostaTempo(jd);
      annunciaData();
    },
    adesso,
    annuncia: (t) => annuncia(t),
    annunciaData,
    cambiaScala,
    impostaOffset: (m) => store.set({ offsetMinuti: m }),
    alternaRiproduzione,
    cambiaVelocita,
    maniglia,
  });

  const scheda = creaScheda({
    inquadra: () => {
      inquadra();
      // Telefono: il foglio esteso copre il corpo inquadrato, quindi si riduce (la mappa resta visibile con la
      // console compatta). Con la scheda nascosta il pulsante premuto perde il focus: passa al pulsante della
      // scheda, o alla maniglia se la vista testuale lo nasconde (WCAG 2.4.3).
      if (modalita === 'telefono' && store.get().interfaccia.foglio === 'esteso') {
        store.aggiorna('interfaccia', { foglio: 'compatto' });
        (chipScheda.hidden ? maniglia : chipScheda).focus();
      }
    },
    copiaCollegamento: (c) => void copiaCollegamento(c),
    chiudi: () => {
      seleziona(null);
      if (usaFoglio(modalita)) store.aggiorna('interfaccia', { foglio: 'compatto' });
      (usaFoglio(modalita) ? maniglia : trova.input).focus();
    },
    alternaEspansione: () => {
      const e = !store.get().interfaccia.schedaEspansa;
      store.aggiorna('interfaccia', { schedaEspansa: e });
    },
    mostraCategoria: (cat) => {
      if (cat === 'sole') return;
      store.aggiorna('filtri', { [cat]: true });
      annuncia(T.annunci.filtro(cat, true));
      // L'avviso scompare con il pulsante che aveva il focus: il focus passa al titolo della scheda (WCAG 2.4.3).
      focusSchedaDopoAggiornamento = true;
    },
    annuncia: (t) => annuncia(t),
    makeTimeState: d.makeTimeState,
  });

  const chipScheda = h('button', { type: 'button', class: 'ss-pulsante ss-chip-scheda' });
  chipScheda.addEventListener('click', () => store.aggiorna('interfaccia', { foglio: 'esteso', catalogoAperto: false, schedaEspansa: true }));

  const testuale = creaVistaTestuale({
    seleziona: (c) => seleziona(c, { fuoco: true }),
    chiudi: () => {
      store.aggiorna('interfaccia', { vistaTestuale: false });
      pulsanteTestualeVisibile().focus();
    },
    aggiorna: () => aggiornaTestuale(true),
  });
  testuale.elemento.hidden = true;

  const avvisi = creaAvvisi(
    annuncia,
    () => {
      store.aggiorna('interfaccia', { benvenutoChiuso: true });
      pref.scrivi(CHIAVI_PREF.benvenuto, true);
    },
    // Fine del caricamento: la live region non resta su un testo superato (§ 11.9).
    (t) => annunciatore.sostituisci(t, T.messaggi.caricamentoConcluso),
    // Messaggio chiuso con il focus dentro: il focus passa al pulsante della data, o al campo Trova se è nascosto.
    () => (consoleT.pulsanteData.offsetParent !== null ? consoleT.pulsanteData : trova.input),
    // Nota ridotta: il testo in un dialogo (§ 11.12).
    (origine) => dialogoBenvenuto.apri(origine),
  );
  // Il comando che ha aperto il dialogo può sparire nel frattempo (nota tornata intera o chiusa): alla chiusura il focus va
  // alla nota, o al pulsante della data se la nota non c'è, senza passare per il body (creaDialogo).
  const dialogoBenvenuto = creaDialogo(
    T.messaggi.benvenutoTitolo,
    h('div', { class: 'ss-benvenuto-dialogo' }, ...T.messaggi.benvenuto.map((r) => h('p', null, r))),
    '',
    () => (avvisi.benvenuto.hidden ? consoleT.pulsanteData : avvisi.benvenuto),
  );

  // Dialoghi
  const fontiDialogo = creaDialogo(T.fonti.titolo, contenutoFontiMetodi(d.valori ?? VALORI_VALIDAZIONE), 'ss-dialogo--ampio');
  const scorciatoie = contenutoScorciatoie(store);
  const scorciatoieDialogo = creaDialogo(T.scorciatoie.titolo, scorciatoie.elemento);
  const impostazioni = contenutoImpostazioni({
    store,
    annuncia: (t) => annuncia(t),
    apriScorciatoie: () => {
      impostazioniDialogo.chiudi();
      scorciatoie.aggiorna();
      scorciatoieDialogo.apri(pulsanteImpostazioni.offsetParent !== null ? pulsanteImpostazioni : pulsanteMenu);
    },
    mostraBenvenuto: () => {
      // Riscontro percepibile anche con la nota già visibile: il dialogo si chiude e il focus passa alla nota. Sul
      // telefono la nota non compare con il foglio esteso: il foglio torna medio.
      impostazioniDialogo.chiudi();
      const esteso = modalita === 'telefono' && store.get().interfaccia.foglio === 'esteso';
      store.aggiorna('interfaccia', { benvenutoChiuso: false, ...(esteso ? { foglio: 'medio' as const } : {}) });
      pref.scrivi(CHIAVI_PREF.benvenuto, false);
      avvisi.focusBenvenuto();
    },
    alternaSeguiOra,
  });
  const impostazioniDialogo = creaDialogo(T.impostazioni.titolo, impostazioni.elemento);
  pulsanteFonti.addEventListener('click', () => fontiDialogo.apri(pulsanteFonti));
  pulsanteImpostazioni.addEventListener('click', () => {
    impostazioni.aggiorna();
    impostazioniDialogo.apri(pulsanteImpostazioni);
  });
  menuFonti.addEventListener('click', () => {
    discMenu.chiudi();
    fontiDialogo.apri(pulsanteMenu);
  });
  menuImpostazioni.addEventListener('click', () => {
    discMenu.chiudi();
    impostazioni.aggiorna();
    impostazioniDialogo.apri(pulsanteMenu);
  });

  // --- Mappa ---
  const idIstrMappa = nuovoId('mappa-istr');
  const mappa = h('div', {
    class: 'ss-mappa',
    tabindex: 0,
    role: 'application',
    'aria-roledescription': T.mappa.descrizioneRuolo,
    'aria-label': T.mappa.descrizioneRuolo,
    'aria-describedby': idIstrMappa,
  });
  const istruzioniMappa = h('p', { id: idIstrMappa, class: 'ss-sr' }, T.mappa.istruzioni);

  // --- Struttura ---
  const salta = h('a', { class: 'ss-salta', href: `#${consoleT.elemento.id}` }, T.salta);
  salta.addEventListener('click', (e) => {
    e.preventDefault();
    if (usaFoglio(modalita) && store.get().interfaccia.foglio === 'compatto') store.aggiorna('interfaccia', { foglio: 'medio' });
    consoleT.pulsanteData.focus();
  });
  const ancoraCatalogo = h('div', { class: 'ss-ancora-catalogo' });
  const strumenti = h(
    'div',
    { class: 'ss-strumenti', role: 'toolbar', 'aria-label': T.barra.strumenti },
    h('div', { class: 'ss-popover-ancora' }, pulsanteLivelli, livelli.elemento),
    pulsanteTabella,
    pulsanteFonti,
    pulsanteImpostazioni,
    h('div', { class: 'ss-popover-ancora' }, pulsanteMenu, pannelloMenu),
  );
  const barra = h('header', { class: 'ss-barra' }, h('div', { class: 'ss-barra-trova' }, trova.elemento, ancoraCatalogo), strumenti);
  const corpoFoglio = h('div', { class: 'ss-foglio-corpo' });
  const presa = h('div', { class: 'ss-foglio-presa', 'aria-hidden': 'true' });
  const foglio = h('div', { class: 'ss-foglio' }, presa, consoleT.elemento, corpoFoglio);
  const ancoraScheda = h('div', { class: 'ss-ancora-scheda' });
  // Caricamento ed errori prima della nota: restano in cima anche quando la nota scorre (§ 11.3, § 11.11).
  const messaggi = h('div', { class: 'ss-messaggi' }, avvisi.elemento, avvisi.benvenuto);

  // Contenuto principale in un landmark main con il titolo h1 della pagina (lettori di schermo, RNF3): mappa, controlli
  // delle distanze, legenda e messaggi. Console (section) e scheda (aside) restano landmark propri fuori da main.
  const principale = h(
    'main',
    { class: 'ss-principale' },
    h('h1', { class: 'ss-sr' }, T.avvio.titolo),
    mappa,
    istruzioniMappa,
    testuale.elemento,
    distanze.colonna,
    distanze.zoomMobile,
    distanze.legenda,
    messaggi,
    chipScheda,
  );
  const app = h(
    'div',
    { class: 'ss-app', 'data-layout': 'desktop' },
    salta,
    barra,
    principale,
    foglio,
    ancoraScheda,
    regioneAnnunci,
    fontiDialogo.elemento,
    impostazioniDialogo.elemento,
    scorciatoieDialogo.elemento,
    dialogoBenvenuto.elemento,
  );
  ancoraCatalogo.appendChild(catalogo.elemento);
  ancoraScheda.appendChild(scheda.elemento);
  radice.appendChild(app);

  // Altezze di console, foglio, legenda, messaggi e Scheda come variabili CSS per i pannelli che non devono coprirli. I
  // messaggi leggono legenda, console e foglio da copie proprie (stile in linea), che il ResizeObserver alza subito. I
  // messaggi sono osservati attraverso una sonda (riquadro vuoto delle loro dimensioni) un livello più in basso nel DOM di
  // legenda e console: cambiati dalle copie durante la consegna, sono notificati nello stesso fotogramma, perché ogni
  // passaggio della consegna raccoglie solo gli elementi più profondi del più alto appena notificato (Resize Observer,
  // W3C, § 3.4.1 e § 3.6.1).
  const sondaMessaggi = h('div', { class: 'ss-messaggi-sonda', 'aria-hidden': 'true' });
  messaggi.appendChild(sondaMessaggi);
  let altoMessaggi = 0;
  const roAltezze = new ResizeObserver(() => altezzeCambiate());
  roAltezze.observe(scheda.elemento);
  roAltezze.observe(consoleT.elemento);
  roAltezze.observe(foglio);
  roAltezze.observe(distanze.legenda);
  roAltezze.observe(sondaMessaggi);
  // Il contenuto dei messaggi cambia anche con il contenitore all'altezza massima: lo scorrimento si rivaluta.
  roAltezze.observe(avvisi.benvenuto);
  for (const figlio of Array.from(avvisi.elemento.children)) roAltezze.observe(figlio);
  // Caricamento, errori e nota cambiati da un compito: altezze nel fotogramma in arrivo, prima della consegna del
  // ResizeObserver, che le trova già scritte. Un attributo riscritto con lo stesso valore non conta.
  const moMessaggi = new MutationObserver((righe) => {
    if (righe.some((r) => r.type !== 'attributes' || r.oldValue !== (r.target as Element).getAttribute(r.attributeName ?? ''))) {
      pianificaAltezze();
    }
  });
  moMessaggi.observe(messaggi, { subtree: true, childList: true, characterData: true, attributeFilter: ['hidden', 'class'], attributeOldValue: true });
  annullatori.push(() => {
    roAltezze.disconnect();
    moMessaggi.disconnect();
  });

  /** Altezza di `el` in px interi, con 8 px di spazio se `spazio` (0 se nascosto). */
  function altezzaDi(el: HTMLElement, spazio: boolean): number {
    const alto = el.getBoundingClientRect().height;
    return Math.round(spazio ? (alto > 0 ? alto + 8 : 0) : alto);
  }

  /** `px` nella variabile CSS `nome` di `el`, se cambia; con `soloCrescita` solo se supera il valore scritto. */
  function scrivi(el: HTMLElement, nome: string, px: number, soloCrescita = false): void {
    const prima = el.style.getPropertyValue(nome);
    if (prima === `${px}px` || (soloCrescita && prima !== '' && Number.parseFloat(prima) >= px)) return;
    el.style.setProperty(nome, `${px}px`);
  }

  /** Altezza di `el` nella variabile `nome` dell'applicazione e nella copia dei messaggi. */
  function impostaAltezza(nome: string, el: HTMLElement, spazio: boolean): void {
    const px = altezzaDi(el, spazio);
    scrivi(app, nome, px);
    scrivi(messaggi, nome, px);
  }

  /**
   * --ss-alto-messaggi (con `soloCrescita`, solo se aumenta). In orizzontale il pannello laterale comincia sotto i
   * messaggi (stile.css): quando crescono, il controllo del pannello con il focus resta visibile (WCAG 2.4.7).
   */
  function impostaAltoMessaggi(soloCrescita: boolean): void {
    const px = altezzaDi(messaggi, true);
    if (px === altoMessaggi || (soloCrescita && px < altoMessaggi)) return;
    scrivi(app, '--ss-alto-messaggi', px);
    const attivo = document.activeElement;
    if (px > altoMessaggi && modalita === 'orizzontale' && attivo instanceof HTMLElement && foglio.contains(attivo)) {
      attivo.scrollIntoView({ block: 'nearest' });
    }
    altoMessaggi = px;
  }

  /**
   * Consegna del ResizeObserver: si scrive subito solo ciò che evita sovrapposizioni nel fotogramma in corso. Legenda,
   * console e foglio più alti vanno nelle copie dei messaggi, che cambiano solo i messaggi e il loro contenuto, più in
   * basso nel DOM; messaggi più alti in --ss-alto-messaggi. Le diminuzioni, che lasciano solo spazio libero, e il resto al
   * fotogramma successivo (pianificaAltezze): le variabili dell'applicazione cambiano altri elementi osservati (anche dalle
   * zone della scena, zoneScena.ts) alla stessa profondità o a una minore, che nella consegna resterebbero non notificati
   * fino al fotogramma dopo, con l'errore "ResizeObserver loop completed with undelivered notifications". Lo stesso vale
   * per --ss-alto-messaggi, che sposta la Scheda del tablet stretto e il pannello laterale in orizzontale: i messaggi
   * cambiati da un compito passano prima da pianificaAltezze (MutationObserver), quindi qui crescono solo per un cambio
   * nato in un fotogramma o dai caratteri caricati, e l'errore resta possibile in quei casi, senza effetti visibili.
   */
  function altezzeCambiate(): void {
    scrivi(messaggi, '--ss-alto-legenda', altezzaDi(distanze.legenda, true), true);
    scrivi(messaggi, '--ss-alto-console', altezzaDi(consoleT.elemento, false), true);
    scrivi(messaggi, '--ss-alto-foglio', altezzaDi(foglio, false), true);
    impostaAltoMessaggi(true);
    aggiornaScorrimentoMessaggi();
    pianificaAltezze();
  }

  /**
   * Altezze, colonna delle distanze, forma della nota e sfumatura dello scorrimento in un requestAnimationFrame, prima
   * della consegna del ResizeObserver di quel fotogramma: dopo un cambio consegnato (fotogramma successivo), un cambio di
   * finestra o di layout e un cambio del contenuto dei messaggi da un compito (stesso fotogramma). Misure nell'ordine delle
   * dipendenze: console, colonna delle distanze (in riga cambia la legenda), legenda, foglio, nota, messaggi, Scheda.
   */
  let altezzePianificate = 0;
  function pianificaAltezze(): void {
    if (altezzePianificate !== 0) return;
    altezzePianificate = requestAnimationFrame(() => {
      altezzePianificate = 0;
      impostaAltezza('--ss-alto-console', consoleT.elemento, false);
      aggiornaColonnaDistanze();
      impostaAltezza('--ss-alto-legenda', distanze.legenda, true);
      impostaAltezza('--ss-alto-foglio', foglio, false);
      aggiornaNota();
      impostaAltoMessaggi(false);
      scrivi(app, '--ss-alto-scheda', altezzaDi(scheda.elemento, true));
      aggiornaScorrimentoMessaggi();
    });
  }
  annullatori.push(() => cancelAnimationFrame(altezzePianificate));

  /**
   * Sfumatura del bordo dei messaggi oltre il quale c'è altro contenuto (data-scorri, stile.css). In cima basta 1 px di
   * contenuto in più; più in basso la tolleranza di 1 px assorbe lo scorrimento frazionario a fine corsa. La sfumatura
   * non è più alta del contenuto nascosto oltre il bordo (--ss-oltre-su, --ss-oltre-giu): con pochi pixel in più
   * l'ultima riga visibile resta leggibile.
   */
  function aggiornaScorrimentoMessaggi(): void {
    const sopra = messaggi.scrollTop;
    const resto = messaggi.scrollHeight - messaggi.clientHeight - sopra;
    const su = sopra > 1;
    const giu = su ? resto > 1 : resto >= 1;
    for (const [nome, px] of [
      ['--ss-oltre-su', sopra],
      ['--ss-oltre-giu', resto],
    ] as const) {
      const v = `${Math.max(0, Math.round(px))}px`;
      if (messaggi.style.getPropertyValue(nome) !== v) messaggi.style.setProperty(nome, v);
    }
    const v = su && giu ? 'entrambi' : su ? 'su' : giu ? 'giu' : null;
    if ((messaggi.dataset['scorri'] ?? null) === v) return;
    if (v === null) delete messaggi.dataset['scorri'];
    else messaggi.dataset['scorri'] = v;
  }
  messaggi.addEventListener('scroll', aggiornaScorrimentoMessaggi, { passive: true });

  // Colonna delle distanze tra la barra e la console (§ 11.3, § 11.10): regolo verticale da 100 a 180 px se c'è posto,
  // altrimenti i soli pulsanti +, −, Inquadra e Viste, in colonna o in riga (stile.css).
  const ALTEZZA_COLONNA_PULSANTI = 4 * 44 + 3 * 8 + 16;
  const REGOLO_DISTANZE_MIN = 100;
  const REGOLO_DISTANZE_MAX = 180;
  function aggiornaColonnaDistanze(): void {
    const cs = getComputedStyle(distanze.colonna);
    const libero = app.clientHeight - Number.parseFloat(cs.top) - Number.parseFloat(cs.bottom);
    const regolo = Number.isFinite(libero) ? libero - ALTEZZA_COLONNA_PULSANTI - 8 : REGOLO_DISTANZE_MAX;
    const modo = regolo >= REGOLO_DISTANZE_MIN ? 'regolo' : libero >= ALTEZZA_COLONNA_PULSANTI ? 'pulsanti' : 'riga';
    if (app.dataset['distanze'] !== modo) {
      app.dataset['distanze'] = modo;
      // Con i pulsanti in riga i messaggi si spostano (stile.css): lo spazio per la nota cambia.
      aggiornaNota();
    }
    app.style.setProperty('--ss-alto-regolo-distanze', `${Math.round(Math.min(REGOLO_DISTANZE_MAX, Math.max(REGOLO_DISTANZE_MIN, regolo)))}px`);
    distanze.collocaPreset();
  }

  // --- Layout ---
  /** Layout e stato del foglio dell'ultimo nome del pulsante della data. */
  let ultimaFormaData = '';
  function aggiornaLayout(): void {
    const m = modalitaLayout(window.innerWidth, window.innerHeight);
    const cambio = m !== modalita || app.dataset['layout'] !== m;
    modalita = m;
    // Spostare un nodo che contiene il focus lo lascia sul body (catalogo e scheda tra foglio e ancore, passi della
    // console): il focus torna all'elemento che lo aveva, dopo l'aggiornamento della visibilità (WCAG 2.4.3).
    const attivo = cambio && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    if (cambio) {
      const focusNellaScheda = attivo !== null && scheda.elemento.contains(attivo);
      collocaPannelli({ radice: app, ancoraCatalogo, ancoraScheda, corpoFoglio, catalogo: catalogo.elemento, scheda: scheda.elemento }, m);
      // Regolo sopra i passi fuori dal desktop: stesso ordine nel DOM, quindi nel focus (WCAG 2.4.3).
      consoleT.disponi(m);
      attributo(trova.input, 'placeholder', m === 'telefono' ? T.trova.etichetta : T.trova.segnaposto);
      // Il pannello aperto o con il focus resta visibile dopo il cambio di layout (finestra ridimensionata, zoom del
      // browser): nel foglio esteso e, con un pannello alla volta, la scheda con il focus al posto del catalogo.
      const ui = store.get().interfaccia;
      const foglio = usaFoglio(m) && (ui.catalogoAperto || focusNellaScheda) && ui.foglio !== 'esteso';
      const chiudiCatalogo = focusNellaScheda && ui.catalogoAperto && m !== 'desktop';
      if (foglio || chiudiCatalogo) {
        store.aggiorna('interfaccia', { ...(foglio ? { foglio: 'esteso' as const } : {}), ...(chiudiCatalogo ? { catalogoAperto: false } : {}) });
      }
    }
    aggiornaVisibilita();
    aggiornaColonnaDistanze();
    // Finestra cambiata: altezze nello stesso fotogramma, prima del ResizeObserver (l'evento resize precede i
    // requestAnimationFrame del fotogramma).
    pianificaAltezze();
    if (attivo !== null) {
      if (attivo.getClientRects().length > 0) {
        if (document.activeElement !== attivo) attivo.focus({ preventScroll: true });
      } else {
        // Controllo che il nuovo layout nasconde (regolo, passi e "Adesso" nel foglio ridotto del telefono, cursore delle
        // distanze sul telefono): il focus passa a un elemento stabile, la maniglia del foglio o il pulsante della data,
        // invece di cadere sul body (§ 11.12).
        [maniglia, consoleT.pulsanteData].find((e) => e.getClientRects().length > 0)?.focus({ preventScroll: true });
      }
    }
  }
  /**
   * Nota di benvenuto non modale (§ 11.12): nascosta dopo la chiusura; sul telefono non copre i controlli del foglio
   * esteso e torna con il foglio ridotto. Su desktop e tablet è ridotta a un comando che apre il testo in un dialogo se il
   * contenitore dei messaggi è largo meno di 200 px o alto al massimo 120 px (§ 11.3): misure che non dipendono dalla
   * forma della nota (larghezza con la barra di scorrimento, altezza massima dal foglio di stile), quindi stabili.
   */
  function aggiornaNota(): void {
    const ui = store.get().interfaccia;
    const foglioEsteso = modalita === 'telefono' && ui.foglio === 'esteso';
    let ridotta = false;
    if (modalita === 'desktop' || modalita === 'tablet') {
      const alto = Number.parseFloat(getComputedStyle(messaggi).maxHeight);
      ridotta = messaggi.getBoundingClientRect().width < LARGHEZZA_MIN_NOTA_PX || (Number.isFinite(alto) && alto < ALTEZZA_MIN_NOTA_PX + 0.5);
    }
    avvisi.mostraBenvenuto(!ui.benvenutoChiuso && !foglioEsteso, ridotta);
  }
  function aggiornaVisibilita(): void {
    const s = store.get();
    const ui = s.interfaccia;
    const foglioUsato = usaFoglio(modalita);
    const foglioStato = modalita === 'orizzontale' ? 'esteso' : ui.foglio;
    app.dataset['foglio'] = foglioStato;
    const catVisibile = ui.catalogoAperto && (!foglioUsato || foglioStato === 'esteso');
    catalogo.elemento.hidden = !catVisibile;
    attributo(pulsanteCatalogo, 'aria-expanded', ui.catalogoAperto ? 'true' : 'false');
    const conCorpo = s.selezionato !== null && perSlug.has(s.selezionato);
    const vt = ui.vistaTestuale || senzaGL;
    let schedaVisibile = conCorpo;
    // Tablet: un pannello alla volta (§ 11.3), anche con la vista testuale a tutta larghezza.
    if (modalita === 'tablet' && (ui.catalogoAperto || vt)) schedaVisibile = false;
    if (foglioUsato) schedaVisibile = conCorpo && !ui.catalogoAperto && foglioStato === 'esteso';
    scheda.elemento.hidden = !schedaVisibile;
    app.dataset['pannello'] = catVisibile ? 'catalogo' : schedaVisibile ? 'scheda' : 'nessuno';
    // Sul desktop catalogo e scheda possono essere aperti insieme: la vista testuale si restringe da entrambi i lati.
    app.dataset['catalogo'] = catVisibile ? 'aperto' : 'chiuso';
    // Scheda ridotta all'intestazione: la vista testuale le passa sotto a tutta larghezza (stile.css).
    app.dataset['scheda'] = schedaVisibile ? (ui.schedaEspansa ? 'aperta' : 'ridotta') : 'chiusa';
    // Chip della scheda sul telefono. Non con la vista testuale, che occupa la stessa zona sopra il foglio e lo
    // coprirebbe: la scheda si apre dalla riga del corpo (§ 11.3).
    const chip = modalita === 'telefono' && conCorpo && foglioStato !== 'esteso' && !vt;
    chipScheda.hidden = !chip;
    app.dataset['chip'] = chip ? 'si' : 'no';
    if (chip && s.selezionato && chipScheda.dataset['slug'] !== s.selezionato) {
      const c = perSlug.get(s.selezionato);
      if (c) {
        chipScheda.dataset['slug'] = c.slug;
        chipScheda.replaceChildren(h('span', null, c.nome), icona('su'));
        attributo(chipScheda, 'aria-label', T.foglio.apriScheda(c.nome));
      }
    }
    const espanso = foglioStato !== 'compatto';
    if (maniglia.getAttribute('aria-expanded') !== String(espanso)) {
      attributo(maniglia, 'aria-expanded', espanso ? 'true' : 'false');
      attributo(maniglia, 'aria-label', espanso ? T.foglio.riduci : T.foglio.espandi);
      attributo(maniglia, 'title', espanso ? T.foglio.riduci : T.foglio.espandi);
      maniglia.replaceChildren(icona(espanso ? 'giu' : 'su'));
    }
    // Vista testuale.
    testuale.elemento.hidden = !vt;
    app.dataset['testuale'] = vt ? 'si' : 'no';
    // Sul telefono il foglio esteso restringe la tabella a pochi pixel: righe e intestazioni non restano nell'ordine di
    // Tab con il focus invisibile (WCAG 2.4.7, 2.4.11); tornano con il foglio ridotto (§ 11.9).
    testuale.copri(vt && modalita === 'telefono' && foglioStato === 'esteso', maniglia);
    attributo(pulsanteTabella, 'aria-pressed', vt ? 'true' : 'false');
    attributo(menuTabella, 'aria-pressed', vt ? 'true' : 'false');
    // Editor della data aperto: il foglio sale sopra pannelli e barra (stile.css).
    app.dataset['editor'] = ui.editorAperto ? 'aperto' : 'chiuso';
    aggiornaNota();
    // Forma della data mostrata (estesa o breve) cambiata con layout e foglio: nome del pulsante della data.
    const formaData = `${modalita}/${foglioStato}`;
    if (formaData !== ultimaFormaData) {
      ultimaFormaData = formaData;
      consoleT.aggiornaNomeData();
    }
  }
  maniglia.addEventListener('click', () => {
    const f = store.get().interfaccia.foglio;
    const prossimo = f === 'compatto' ? 'medio' : 'compatto';
    store.aggiorna('interfaccia', { foglio: prossimo, catalogoAperto: false });
  });
  // Trascinamento della presa del foglio: su espande, giù riduce.
  let presaY: number | null = null;
  presa.addEventListener('pointerdown', (e) => {
    presaY = e.clientY;
    presa.setPointerCapture(e.pointerId);
  });
  presa.addEventListener('pointerup', (e) => {
    if (presaY === null) return;
    const dy = e.clientY - presaY;
    presaY = null;
    const ordine = ['compatto', 'medio', 'esteso'] as const;
    const i = ordine.indexOf(store.get().interfaccia.foglio);
    if (dy < -30) store.aggiorna('interfaccia', { foglio: ordine[Math.min(2, i + 1)] ?? 'esteso' });
    else if (dy > 30) store.aggiorna('interfaccia', { foglio: ordine[Math.max(0, i - 1)] ?? 'compatto', catalogoAperto: false });
  });

  // Tastiera virtuale: il foglio segue VisualViewport.
  const vv = window.visualViewport;
  const suViewport = () => {
    if (!vv) return;
    const coperto = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    app.style.setProperty('--ss-tastiera', `${Math.round(coperto)}px`);
  };
  vv?.addEventListener('resize', suViewport);
  vv?.addEventListener('scroll', suViewport);
  const suResize = () => aggiornaLayout();
  window.addEventListener('resize', suResize);
  annullatori.push(() => {
    vv?.removeEventListener('resize', suViewport);
    vv?.removeEventListener('scroll', suViewport);
    window.removeEventListener('resize', suResize);
  });

  // --- Pannelli dipendenti dal tempo ---
  let ultimoPannelli = Number.NEGATIVE_INFINITY;
  // Barra di caricamento visibile: i dati della data stanno arrivando. Senza (errore del blocco) i valori che mancano
  // non si dicono "in caricamento" (§ 11.9, § 11.11).
  let caricamentoInCorso = false;
  let pannelliPianificati = false;
  let timerPannelli: number | null = null;
  function pianificaPannelli(): void {
    if (pannelliPianificati) return;
    pannelliPianificati = true;
    const attesa = store.get().riproduzione.attiva ? Math.max(0, ultimoPannelli + INTERVALLO_PANNELLI_MS - ora()) : 0;
    const esegui = () => {
      timerPannelli = null;
      requestAnimationFrame(() => {
        pannelliPianificati = false;
        ultimoPannelli = ora();
        aggiornaPannelli();
      });
    };
    if (attesa > 0) timerPannelli = window.setTimeout(esegui, attesa);
    else esegui();
  }

  const affTmp: Affidabilita = { livello: 'non-determinabile', epsModello: 0, epsDeltaT: 0, epsTotale: 0 };
  function livelloAllaData(c: CorpoCatalogo): Livello | null {
    if (c.categoria === 'sole') return null;
    d.effemeridi.affidabilita(c.ssid, timeState(), affTmp);
    return affTmp.livello;
  }

  function categoriaNascosta(c: CorpoCatalogo): CategoriaCorpo | null {
    const f = store.get().filtri;
    return visibileConFiltri(c, f) ? null : c.categoria;
  }

  function aggiornaPannelli(): void {
    const s = store.get();
    const ts = timeState();
    if (bandeInAttesa !== null && bandeInAttesa === s.selezionato) aggiornaBande();
    consoleT.aggiornaData();
    consoleT.aggiornaControlli();
    // ΔT e stagione.
    if (deltaTEsterno !== undefined) consoleT.impostaDeltaT(deltaTEsterno);
    else {
      const luna = perSlug.get('luna');
      let epsLuna: number | null = null;
      if (luna) {
        d.effemeridi.affidabilita(luna.ssid, ts, affTmp);
        epsLuna = Number.isFinite(affTmp.epsDeltaT) ? affTmp.epsDeltaT : null;
      }
      consoleT.impostaDeltaT({ deltaT: ts.deltaT, sigma: ts.deltaTSigma, epsLuna, scala: ts.scalaIngresso });
    }
    if (stagioneEsterna !== undefined) consoleT.impostaStagione(stagioneEsterna);
    else consoleT.impostaStagione(d.stagione ? d.stagione(ts) : null);
    // Scheda.
    const sel = s.selezionato === null ? undefined : perSlug.get(s.selezionato);
    if (sel) {
      const dati = datiEsterni !== null && datiEsterni.corpo.slug === sel.slug ? datiEsterni : calcolatore.calcola(sel, ts);
      const P = dati.elementi?.P ?? Number.POSITIVE_INFINITY;
      const motoRapido = s.riproduzione.attiva && Number.isFinite(P) && motore.passoFotogramma > P / 8;
      const dc = jdToCalendarLocale(s.tempo.jd, offsetEffettivo());
      scheda.mostra(dati, {
        dataTesto: `${formatData(dc)}, ${formatOra(dc.ora, dc.minuto)} ${etichettaScala(s.tempo.scala, s.tempo.scala === 'UT' ? s.offsetMinuti : null)}`,
        scala: s.tempo.scala,
        offsetMinuti: s.tempo.scala === 'UT' ? s.offsetMinuti : null,
        inRiproduzione: s.riproduzione.attiva,
        motoRapido,
        categoriaNascosta: categoriaNascosta(sel),
        espansa: s.interfaccia.schedaEspansa,
        caricamentoInCorso,
      });
    } else scheda.mostra(null, { dataTesto: '', scala: s.tempo.scala, offsetMinuti: null, inRiproduzione: false, motoRapido: false, categoriaNascosta: null, espansa: false, caricamentoInCorso });
    if (!catalogo.elemento.hidden && !s.riproduzione.attiva) catalogo.aggiorna();
    aggiornaTestuale(false);
    aggiornaVisibilita();
    if (focusSchedaDopoAggiornamento) {
      focusSchedaDopoAggiornamento = false;
      if (!scheda.elemento.hidden) scheda.focusTitolo();
      else if (pulsanteCatalogo.offsetParent !== null) pulsanteCatalogo.focus();
    }
  }

  // --- Vista testuale ---
  function aggiornaTestuale(forza: boolean): void {
    const s = store.get();
    if (testuale.elemento.hidden && !forza) return;
    const ts = timeState();
    const dc = jdToCalendarLocale(s.tempo.jd, offsetEffettivo());
    const scala = etichettaScala(s.tempo.scala, s.tempo.scala === 'UT' ? s.offsetMinuti : null);
    const didascalia = T.testuale.didascalia(`${formatData(dc)}, ${formatOra(dc.ora, dc.minuto)} ${scala}`, dc.calendario);
    if (s.riproduzione.attiva && !forza) {
      testuale.imposta([], didascalia, '', true);
      return;
    }
    // Righe con gli errori e il livello della scheda: stesse cifre e stesso livello nelle due viste (§ 11.13).
    const righe: RigaTestuale[] = [];
    for (const c of corpi) {
      if (!visibileConFiltri(c, s.filtri) && c.slug !== s.selezionato) continue;
      const riga = calcolatore.rigaTestuale(c, ts);
      righe.push(riga.inCaricamento && !caricamentoInCorso ? { ...riga, inCaricamento: false } : riga);
    }
    testuale.imposta(righe, didascalia, T.testuale.conteggio(righe.length, corpi.length), false);
  }
  function alternaTestuale(): void {
    if (senzaGL) return;
    const v = !store.get().interfaccia.vistaTestuale;
    // Chiudendo con il focus nella tabella il focus torna al pulsante della vista (WCAG 2.4.3).
    const focusDentro = !v && testuale.elemento.contains(document.activeElement);
    // Sul telefono la tabella prende il posto della mappa: il foglio si riduce.
    store.aggiorna('interfaccia', { vistaTestuale: v, ...(v && usaFoglio(modalita) ? { foglio: 'compatto' as const, catalogoAperto: false } : {}) });
    annuncia(v ? T.annunci.vistaTestualeAperta : T.annunci.vistaTestualeChiusa);
    if (v) requestAnimationFrame(() => testuale.focus());
    else if (focusDentro) pulsanteTestualeVisibile().focus();
  }

  // --- Fasce di affidabilità del regolo ---
  // Corpo selezionato in attesa dei dati della data per la velocità angolare di riferimento delle fasce.
  let bandeInAttesa: string | null = null;
  function aggiornaBande(): void {
    const s = store.get();
    const c = s.selezionato === null ? undefined : perSlug.get(s.selezionato);
    bandeInAttesa = null;
    if (!c || c.categoria === 'sole') {
      consoleT.impostaBande([], null);
      return;
    }
    // ε_ΔT dalla velocità angolare dell'orbita alla data, non dai blocchi in memoria (§ 7.8.1).
    const bande = calcolatore.bandeAffidabilita(c, timeState(), d.makeTimeState, JD_MIN_UT, JD_MAX_UT_EXCL, CAMPIONI_BANDE);
    if (bande === null) bandeInAttesa = c.slug;
    consoleT.impostaBande(bande ?? [], c.nome);
  }

  // --- Vista della scena ---
  function etichettaMappa(): void {
    const s = store.get();
    const fuoco = perSlug.get(s.fuoco);
    if (!scena || !fuoco) {
      attributo(mappa, 'aria-label', T.mappa.descrizioneRuolo);
      return;
    }
    const v = ultimaVista ?? scena.statoVista();
    const ampiezza = v.ampiezzaKm;
    const p = presetCorrispondente(s.fuoco, ampiezza);
    const vista = p ? NOMI_PRESET[p.id] : T.mappa.vistaAmpiezza(formatAmpiezza(ampiezza));
    attributo(mappa, 'aria-label', T.mappa.etichetta(vista, fuoco.nome));
  }
  let contestoPersoMostrato = false;
  function aggiornaVista(): void {
    if (!scena) {
      distanze.aggiorna(null, false);
      return;
    }
    const v = scena.statoVista();
    ultimaVista = v;
    // Contesto WebGL perso (R13): la scena è sospesa, il messaggio resta fino al ripristino.
    if (v.contestoPerso !== contestoPersoMostrato) {
      contestoPersoMostrato = v.contestoPerso;
      if (v.contestoPerso) avvisi.mostraErrore({ id: 'contesto', testo: T.messaggi.contestoPerso });
      else avvisi.rimuoviErrore('contesto');
    }
    distanze.aggiorna(v, store.get().livelli.barraScala);
    const c = perSsid.get(v.fuoco);
    if (c && c.slug !== store.get().fuoco) {
      fuocoDaScena = true;
      store.set({ fuoco: c.slug });
      fuocoDaScena = false;
    }
    etichettaMappa();
  }

  // --- Osservatori dello store ---
  annullatori.push(
    store.osserva(
      (s) => s.tempo,
      (t) => {
        consoleT.regolo.aggiorna();
        pianificaPannelli();
        // L'avviso del limite resta solo con l'istante a quel limite: Inizio e Fine portano al limite opposto.
        if (limiteAvvisato !== null && !istanteAlLimite(limiteAvvisato, t.jd, limiti())) rimuoviAvvisoLimite();
      },
    ),
    store.osserva(
      (s) => s.offsetMinuti,
      () => {
        consoleT.regolo.aggiorna();
        pianificaPannelli();
      },
    ),
    store.osserva(
      (s) => s.riproduzione,
      (r, prec) => {
        consoleT.aggiornaControlli();
        if (r.velocita !== prec.velocita) pref.scrivi(CHIAVI_PREF.velocita, r.velocita);
        if (r.attiva !== prec.attiva) pianificaPannelli();
        const giorniPerSecondo = r.attiva && !r.seguiOra ? (r.direzione * (VELOCITA_S[r.velocita] ?? 0)) / 86_400 : 0;
        scena?.impostaRiproduzione?.(giorniPerSecondo);
      },
    ),
    store.osserva(
      (s) => s.unitaPasso,
      (u) => {
        consoleT.aggiornaControlli();
        pref.scrivi(CHIAVI_PREF.unita, u);
      },
    ),
    store.osserva(
      (s) => s.selezionato,
      (sel) => {
        // L'hash riporta il corpo selezionato (RF8, § 11.12), non il fuoco dei preset.
        if (d.url) d.url.scriviSlug(sel);
        if (sel !== null) avvisi.rimuoviErrore('slug');
        // Selezione da catalogo, mappa o collegamento: la ricerca in corso nel campo Trova è superata (§ 11.6).
        const corpoSel = sel === null ? undefined : perSlug.get(sel);
        if (corpoSel) trova.selezioneEsterna(corpoSel.nome);
        scena?.seleziona(ssidDi(sel));
        aggiornaBande();
        aggiornaFiltriScena();
        pianificaPannelli();
        catalogo.aggiorna();
        aggiornaVisibilita();
      },
    ),
    store.osserva(
      (s) => s.fuoco,
      (f) => {
        const ssid = ssidDi(f);
        if (!fuocoDaScena && ssid !== null) scena?.mettiAFuoco(ssid, opzioniFuocoPendenti ?? { inquadratura: 'orbita' });
        opzioniFuocoPendenti = null;
        etichettaMappa();
      },
    ),
    store.osserva(
      (s) => s.livelli,
      (lv) => {
        livelli.aggiorna();
        const { barraScala, ...scenaLv } = lv;
        scena?.impostaLivelli(scenaLv);
        if (ultimaVista) distanze.aggiorna(ultimaVista, barraScala);
        pref.scrivi(CHIAVI_PREF.livelli, lv);
      },
    ),
    store.osserva(
      (s) => s.filtri,
      (f) => {
        aggiornaFiltriScena();
        catalogo.aggiorna();
        pianificaPannelli();
        pref.scrivi(CHIAVI_PREF.filtri, f);
      },
    ),
    store.osserva(
      (s) => s.interfaccia,
      (ui, prec) => {
        if (ui.scorciatoie !== prec.scorciatoie) {
          pref.scrivi(CHIAVI_PREF.scorciatoie, ui.scorciatoie);
          scorciatoie.aggiorna();
        }
        if (ui.rigaProlettica !== prec.rigaProlettica) {
          pref.scrivi(CHIAVI_PREF.prolettica, ui.rigaProlettica);
          consoleT.aggiornaData();
        }
        if (ui.catalogoAperto && !prec.catalogoAperto) catalogo.aggiorna();
        if (ui.vistaTestuale !== prec.vistaTestuale && ui.vistaTestuale) aggiornaTestuale(true);
        if (ui.schedaEspansa !== prec.schedaEspansa || ui.foglio !== prec.foglio) pianificaPannelli();
        aggiornaVisibilita();
      },
    ),
  );

  function aggiornaFiltriScena(): void {
    if (!scena) return;
    const f = store.get().filtri;
    const attive = new Set<CategoriaCorpo>(['sole']);
    for (const c of CATEGORIE_FILTRO) if (f[c]) attive.add(c);
    scena.impostaFiltri(attive, ssidDi(store.get().selezionato));
  }

  // --- Scena ---
  if (scena) {
    scena.monta(mappa);
    annullatori.push(
      scena.onCambioVista(() => aggiornaVista()),
      scena.onSelezione((ssid, info) => {
        const c = ssid === null ? null : (perSsid.get(ssid) ?? null);
        const testoAnn =
          c && info && info.totale > 1 ? T.annunci.selezionatoTra(c.nome, info.indice, info.totale) : undefined;
        seleziona(c, { annuncio: testoAnn });
      }),
    );
    const { barraScala: _b, ...lv } = store.get().livelli;
    scena.impostaLivelli(lv);
  } else {
    mappa.hidden = true;
  }

  // --- Tastiera ---
  mappa.addEventListener('keydown', (e) => {
    if (e.target !== mappa || !scena) return;
    const a = azioneMappa(e);
    if (a === null) return;
    e.preventDefault();
    e.stopPropagation();
    switch (a.tipo) {
      case 'ruota':
        scena.ruota(a.dAzimut, a.dElevazione);
        break;
      case 'sposta':
        scena.sposta(a.dx, a.dy);
        break;
      case 'zoom':
        // Stesso riscontro dei pulsanti + e −: annuncio dell'ampiezza e del limite raggiunto (§ 11.9).
        distanze.zoom(a.fattore);
        break;
      case 'selezionaCentro': {
        const ssid = scena.corpoAlCentro();
        if (ssid === null) annuncia(T.mappa.nessunCorpoAlCentro);
        else seleziona(perSsid.get(ssid) ?? null);
        break;
      }
      case 'successivo': {
        const ssid = scena.corpoVisibileSuccessivo(ssidDi(store.get().selezionato), a.verso);
        if (ssid === null) annuncia(T.mappa.nessunCorpoVisibile);
        else seleziona(perSsid.get(ssid) ?? null);
        break;
      }
      case 'inquadra':
        inquadra();
        break;
      case 'deseleziona':
        if (store.get().selezionato !== null) seleziona(null);
        break;
    }
  });
  const suTastoGlobale = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const s = store.get();
    const dialogo = fontiDialogo.aperto || impostazioniDialogo.aperto || scorciatoieDialogo.aperto;
    const azione = azioneGlobale(e, contestoDa(document.activeElement, s.interfaccia.scorciatoie, dialogo));
    if (azione === null) return;
    e.preventDefault();
    switch (azione) {
      case 'trova':
        trova.focus();
        break;
      case 'riproduzione':
        alternaRiproduzione();
        break;
      case 'passoIndietro':
        eseguiPasso(s.unitaPasso, -1);
        break;
      case 'passoAvanti':
        eseguiPasso(s.unitaPasso, 1);
        break;
      case 'velocitaMinore':
        cambiaVelocita(s.riproduzione.velocita - 1);
        break;
      case 'velocitaMaggiore':
        cambiaVelocita(s.riproduzione.velocita + 1);
        break;
      case 'scorciatoie':
        scorciatoie.aggiorna();
        scorciatoieDialogo.apri(document.activeElement instanceof HTMLElement ? document.activeElement : null);
        break;
      case 'testuale':
        alternaTestuale();
        break;
    }
  };
  document.addEventListener('keydown', suTastoGlobale);
  annullatori.push(() => document.removeEventListener('keydown', suTastoGlobale));

  // --- Collegamenti ---
  async function copiaCollegamento(c: CorpoCatalogo): Promise<void> {
    const base = d.urlBase ? d.urlBase() : location.href.split('#')[0] ?? '';
    const url = `${base}#${c.slug}`;
    // Esito visibile accanto al pulsante e annunciato anche in riproduzione (azione dell'utente).
    try {
      if (d.copia) await d.copia(url);
      else await navigator.clipboard.writeText(url);
      scheda.esitoCopia(true, url);
      annuncia(T.annunci.collegamentoCopiato);
    } catch {
      scheda.esitoCopia(false, url);
      annuncia(T.annunci.collegamentoNonCopiato(url));
    }
  }
  /**
   * Applica il testo dell'hash; restituisce true se ha messo a fuoco un corpo. Lo slug si confronta in minuscolo
   * (#Marte = #marte); ogni altro testo non vuoto produce il messaggio con il proprio testo (§ 11.12).
   */
  function applicaSlug(testoHash: string | null, iniziale: boolean): boolean {
    if (corpi.length === 0) return false;
    if (testoHash === null) {
      // Hash vuoto: nessun collegamento, nessun messaggio superato.
      if (!iniziale) avvisi.rimuoviErrore('slug');
      return false;
    }
    const slug = testoHash.toLowerCase();
    const c = RE_SLUG.test(slug) ? perSlug.get(slug) : undefined;
    if (!c) {
      avvisi.notifica('slug', T.messaggi.slugSconosciuto(testoHash.length > LUNGHEZZA_HASH_MOSTRATA ? `${testoHash.slice(0, LUNGHEZZA_HASH_MOSTRATA)}…` : testoHash));
      return false;
    }
    avvisi.rimuoviErrore('slug');
    // Il Sole non ha un'orbita da inquadrare: vista Sistema interno (§ 11.12).
    const interno = PRESET_VISTA.find((x) => x.id === 'sistema-interno');
    const opz: OpzioniFuoco =
      c.categoria === 'sole' && interno ? { ampiezzaKm: interno.ampiezzaKm, immediato: iniziale } : { inquadratura: 'orbita', immediato: iniziale };
    store.transazione(() => {
      store.set({ selezionato: c.slug });
      mettiAFuoco(c.slug, opz);
    });
    // Collegamento seguito dopo l'avvio (hashchange, indietro e avanti): annuncio della selezione, che sostituisce
    // anche quello di un collegamento ignorato (§ 11.9, § 11.12).
    if (!iniziale) annuncia(T.annunci.selezionato(c.nome));
    return true;
  }
  if (d.url) {
    const url = d.url;
    annullatori.push(url.onCambio((slug) => void applicaSlug(slug, false)));
  }

  // --- Catalogo ---
  function impostaCatalogo(c: Catalogo): void {
    corpi = [...c.corpi].sort((a, b) => a.ssid - b.ssid);
    perSlug = new Map(corpi.map((x) => [x.slug, x]));
    perSsid = new Map(corpi.map((x) => [x.ssid, x]));
    indice = creaIndice(corpi);
    calcolatore.impostaCorpi(corpi);
    catalogo.impostaCorpi(corpi);
    aggiornaFiltriScena();
    scena?.seleziona(ssidDi(store.get().selezionato));
    aggiornaBande();
    const daHash = d.url ? applicaSlug(d.url.leggiSlug(), true) : false;
    if (!avviato) {
      avviato = true;
      // Vista iniziale (§ 11.12): Sistema interno con fuoco sul Sole, senza transizione.
      const sole = ssidDi('sole');
      const p = PRESET_VISTA.find((x) => x.id === 'sistema-interno');
      if (!daHash && scena && sole !== null && p) scena.mettiAFuoco(sole, { ampiezzaKm: p.ampiezzaKm, immediato: true });
    }
    aggiornaVista();
    pianificaPannelli();
  }
  let avviato = false;

  // --- Avvio ---
  aggiornaLayout();
  consoleT.aggiornaData();
  consoleT.aggiornaControlli();
  if (d.catalogo) impostaCatalogo(d.catalogo);
  if (senzaGL) attivaSenzaWebGL();
  pianificaPannelli();

  function attivaSenzaWebGL(): void {
    senzaGL = true;
    mappa.hidden = true;
    app.dataset['scena'] = 'assente';
    testuale.impostaObbligatoria(true);
    // Unica vista disponibile (RF10, § 11.11): i messaggi entrano nella vista, che scorre per intero, e non la spingono
    // fuori dallo schermo sui telefoni bassi e in orizzontale (stile.css).
    testuale.ospita(messaggi);
    avvisi.mostraErrore({ id: 'webgl', testo: T.messaggi.webgl, bloccante: true });
    aggiornaVisibilita();
    aggiornaTestuale(true);
  }

  return {
    store,
    contenitoreScena: mappa,
    impostaCatalogo,
    aggiornaTempo(t) {
      tsEsterno = t ?? null;
      pianificaPannelli();
    },
    aggiornaAffidabilita() {
      aggiornaBande();
      catalogo.aggiorna();
      pianificaPannelli();
    },
    impostaCaricamento(stato) {
      // Scheda e tabella distinguono i dati in arrivo da quelli che mancano per un errore: ridisegno al cambio.
      if ((stato !== null) !== caricamentoInCorso) {
        caricamentoInCorso = stato !== null;
        pianificaPannelli();
      }
      if (stato === null) {
        avvisi.impostaCaricamento(null);
        return;
      }
      const intervallo =
        stato.testo ?? (stato.jd0 !== undefined && stato.jd1 !== undefined ? testoIntervallo(stato.jd0, stato.jd1) : null);
      avvisi.impostaCaricamento(intervallo === null ? T.messaggi.caricamentoGenerico : T.messaggi.caricamento(intervallo));
    },
    mostraErrore: (e) => avvisi.mostraErrore(e),
    rimuoviErrore: (id) => avvisi.rimuoviErrore(id),
    erroreBlocco(id, jd0, jd1, riprova) {
      // Blocco richiesto dall'avanzare del tempo: in riproduzione l'errore è in pagina, ma non si annuncia.
      avvisi.mostraErrore({ id, testo: T.messaggi.blocco(testoIntervallo(jd0, jd1)), riprova, dalTempo: true });
    },
    notifica: (id, t) => avvisi.notifica(id, t),
    annuncia,
    impostaDatiScheda(dati) {
      datiEsterni = dati;
      pianificaPannelli();
    },
    impostaStagione(s) {
      stagioneEsterna = s;
      consoleT.impostaStagione(s);
    },
    impostaDeltaT(i) {
      deltaTEsterno = i;
      consoleT.impostaDeltaT(i);
    },
    senzaWebGL: attivaSenzaWebGL,
    aggiornaVista,
    mettiAFuoco: (slug, o) => mettiAFuoco(slug, o),
    distruggi() {
      for (const a of annullatori) a();
      motore.distruggi();
      if (timerPannelli !== null) window.clearTimeout(timerPannelli);
      discLivelli.distruggi();
      discMenu.distruggi();
      distanze.disclosurePreset.distruggi();
      app.remove();
    },
  };
}
