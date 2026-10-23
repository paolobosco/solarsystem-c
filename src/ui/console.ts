// Console temporale (§ 11.4): data principale, calendario e giorno della settimana, riga del
// gregoriano prolettico, ΔT con incertezza, stagione, "Adesso", editor, passi, regolo,
// riproduzione con direzione e velocità a gradini.

import type { StoreApp } from '../app/store';
import { VELOCITA_S } from '../app/store';
import { giornoSettimanaLocale, jdToCalendarLocale, jdToProlepticGregorian } from '../time/calendar';
import type { UnitaPasso } from '../time/steps';
import { UNITA_PASSO, limiteRaggiunto } from '../time/steps';
import type { MakeTimeState, ScalaTempo } from '../time/types';
import type { IngressoStagione } from './contrattoScena';
import { attributo, h, nuovoId, testo } from './dom';
import { creaEditor } from './editorData';
import type { EditorData } from './editorData';
import { formatAnno, formatData, formatDataBreve, formatDeltaT, formatGradiBreve, formatOffset, formatOra } from './format';
import { icona } from './icone';
import type { ModalitaLayout } from './layout';
import { testoStagione } from './messaggi';
import { creaRegolo } from './regolo';
import type { BandaAffidabilita, Regolo } from './regolo';
import type { LimitiScala } from './riproduzione';
import { GIORNI_SETTIMANA, NOMI_UNITA_PASSO, T, UNITA, VELOCITA_ETICHETTE } from './testi.it';

export interface DipendenzeConsole {
  store: StoreApp;
  makeTimeState: MakeTimeState;
  limiti: () => LimitiScala;
  /**
   * Passo con i limiti; gestisce messaggio e, se annuncia non è false, l'annuncio della data. Restituisce false se il
   * passo si è fermato al limite.
   */
  passo: (unita: UnitaPasso, n: number, annuncia?: boolean) => boolean;
  /** Porta il tempo all'istante (scala d'ingresso), limitato all'intervallo. */
  vai: (jd: number) => void;
  /** Applica un istante dall'editor e lo annuncia. */
  conferma: (jd: number) => void;
  adesso: () => void;
  annuncia: (t: string) => void;
  annunciaData: () => void;
  cambiaScala: (scala: ScalaTempo) => void;
  impostaOffset: (minuti: number | null) => void;
  /** Avvia o ferma la riproduzione. */
  alternaRiproduzione: () => void;
  cambiaVelocita: (indice: number) => void;
  /** Cambio di stato del foglio sul telefono (maniglia). */
  maniglia: HTMLButtonElement;
}

export interface InfoDeltaT {
  deltaT: number;
  sigma: number;
  /** ε_ΔT della Luna, rad; null se non disponibile. */
  epsLuna: number | null;
  scala: ScalaTempo;
}

export interface ConsoleTemporale {
  elemento: HTMLElement;
  pulsanteData: HTMLButtonElement;
  editor: EditorData;
  regolo: Regolo;
  pulsanteRiproduci: HTMLButtonElement;
  /** Aggiorna i testi dalla data dello store. */
  aggiornaData(): void;
  /** Nome del pulsante della data con la forma mostrata (dopo un cambio di layout o di foglio). */
  aggiornaNomeData(): void;
  aggiornaControlli(): void;
  impostaDeltaT(i: InfoDeltaT | null): void;
  impostaStagione(s: IngressoStagione | null): void;
  impostaBande(b: readonly BandaAffidabilita[], nome: string | null): void;
  apriEditor(): void;
  chiudiEditor(focusData: boolean): void;
  /**
   * Ordine dei controlli della seconda riga per il layout: fuori dal desktop il regolo sta sopra i passi, quindi li
   * precede nel DOM e nell'ordine di tabulazione (WCAG 2.4.3); sul desktop passi, regolo e riproduzione stanno in riga.
   */
  disponi(m: ModalitaLayout): void;
}

/** Soglia del § 11.4.3: avviso quando ε_ΔT della Luna supera 1′. */
const SOGLIA_EPS_LUNA = Math.PI / 180 / 60;

/** Etichetta della scala mostrata: "UT", "TT", "UTC+2". */
export function etichettaScala(scala: ScalaTempo, offset: number | null): string {
  if (scala === 'TT') return UNITA.tt;
  if (offset !== null) return formatOffset(offset);
  return UNITA.ut;
}

export function creaConsole(d: DipendenzeConsole): ConsoleTemporale {
  const idTitolo = nuovoId('console-t');
  const idEditor = nuovoId('editor');

  // --- Riga 1 ---
  const testoData = h('span', { class: 'ss-data-testo' });
  const testoDataBreve = h('span', { class: 'ss-data-breve', 'aria-hidden': 'true' });
  const testoOra = h('span', { class: 'ss-data-ora' });
  const pulsanteData = h(
    'button',
    { type: 'button', class: 'ss-data', 'aria-expanded': 'false', 'aria-controls': idEditor, id: nuovoId('data') },
    icona('calendario', 'ss-icona ss-data-icona'),
    // Spazio tra data e ora anche nel testo (nel contenitore flessibile non si vede): l'etichetta visibile letta dalle
    // tecnologie assistive è "20 ottobre 2026 07:25 UT", contenuta nel nome.
    h('span', { class: 'ss-data-corpo' }, testoData, testoDataBreve, ' ', testoOra),
  );
  const settimana = h('span', { class: 'ss-settimana' });
  const calendario = h('span', { class: 'ss-badge ss-badge--calendario' });
  const prolettica = h('span', { class: 'ss-prolettica' });
  const stagione = h('span', { class: 'ss-stagione' });
  const meta = h('p', { class: 'ss-data-meta' }, calendario, settimana, prolettica, stagione);
  const deltaValore = h('span', { class: 'ss-num' });
  const deltaT = h(
    'p',
    { class: 'ss-deltat' },
    h('abbr', { title: T.console.deltaTEsteso }, T.console.deltaT),
    ' ',
    deltaValore,
  );
  const avvisoDeltaT = h('p', { class: 'ss-avviso-deltat' }, icona('avviso'), h('span'));
  avvisoDeltaT.hidden = true;
  const adesso = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-adesso', title: T.console.adessoEsteso },
    icona('adesso'),
    h('span', null, T.console.adesso),
  );
  adesso.addEventListener('click', () => d.adesso());

  // --- Passi ---
  const unita = h('select', { class: 'ss-input ss-unita', 'aria-label': T.console.unitaPasso });
  for (const u of UNITA_PASSO) unita.appendChild(h('option', { value: u }, NOMI_UNITA_PASSO[u]));
  unita.addEventListener('change', () => d.store.set({ unitaPasso: unita.value as UnitaPasso }));
  const indietro = h('button', { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-passo' }, icona('indietro'));
  const avanti = h('button', { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-passo' }, icona('avanti'));
  indietro.addEventListener('click', () => d.passo(d.store.get().unitaPasso, -1));
  avanti.addEventListener('click', () => d.passo(d.store.get().unitaPasso, 1));
  const passi = h('div', { class: 'ss-passi', role: 'group', 'aria-label': T.console.unitaPasso }, indietro, unita, avanti);

  // --- Riproduzione ---
  const iconaPlay = icona('riproduci');
  const iconaPausa = icona('pausa');
  const pulsanteRiproduci = h('button', { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-riproduci' }, iconaPlay);
  pulsanteRiproduci.addEventListener('click', () => d.alternaRiproduzione());
  const direzione = h(
    'button',
    {
      type: 'button',
      class: 'ss-pulsante ss-pulsante--icona ss-direzione',
      'aria-pressed': 'false',
      'aria-label': T.console.direzione,
      title: T.console.direzione,
    },
    icona('direzione'),
  );
  direzione.addEventListener('click', () => {
    const r = d.store.get().riproduzione;
    // Con "Segui l'ora attuale" il verso è fisso (aria-disabled): solo il motivo, letto in ogni caso.
    if (r.seguiOra && r.attiva) {
      d.annuncia(T.console.velocitaSegui);
      return;
    }
    d.store.aggiorna('riproduzione', { direzione: r.direzione === 1 ? -1 : 1 });
  });
  const velocita = h('select', { class: 'ss-input ss-velocita', 'aria-label': T.console.velocita });
  VELOCITA_ETICHETTE.forEach((v, i) => velocita.appendChild(h('option', { value: i, title: v.lunga }, v.breve)));
  velocita.addEventListener('change', () => d.cambiaVelocita(Number(velocita.value)));
  const riproduzione = h(
    'div',
    { class: 'ss-riproduzione', role: 'group', 'aria-label': T.console.velocita },
    pulsanteRiproduci,
    direzione,
    velocita,
  );
  const attesa = h('p', { class: 'ss-attesa' });
  attesa.hidden = true;

  // --- Editor e regolo ---
  const editor = creaEditor({
    store: d.store,
    limiti: d.limiti,
    makeTimeState: d.makeTimeState,
    conferma: d.conferma,
    annuncia: d.annuncia,
    chiudi: () => chiudiEditor(true),
    cambiaScala: d.cambiaScala,
    impostaOffset: d.impostaOffset,
  });
  editor.elemento.id = idEditor;
  editor.elemento.hidden = true;

  const regolo = creaRegolo({
    store: d.store,
    limiti: d.limiti,
    offset: () => offsetEffettivo(),
    testoValore: (jd) => testoValoreRegolo(jd),
    vai: d.vai,
    // Il regolo annuncia la data solo al rilascio del tasto (§ 11.4.3).
    passo: (u, n) => d.passo(u, n, false),
    annunciaData: d.annunciaData,
    annuncia: d.annuncia,
  });

  const riga2 = h('div', { class: 'ss-console-riga2' }, passi, regolo.elemento, riproduzione);
  const elemento = h(
    'section',
    { class: 'ss-console', id: nuovoId('console'), 'aria-labelledby': idTitolo, tabindex: -1 },
    h('h2', { id: idTitolo, class: 'ss-sr' }, T.console.titolo),
    editor.elemento,
    h(
      'div',
      { class: 'ss-console-riga1' },
      d.maniglia,
      h('div', { class: 'ss-console-data' }, pulsanteData, meta),
      h('div', { class: 'ss-console-destra' }, deltaT, adesso),
    ),
    avvisoDeltaT,
    riga2,
    attesa,
  );

  function offsetEffettivo(): number {
    const s = d.store.get();
    return s.tempo.scala === 'UT' && s.offsetMinuti !== null ? s.offsetMinuti : 0;
  }

  function testoValoreRegolo(jd: number): string {
    const s = d.store.get();
    const dc = jdToCalendarLocale(jd, offsetEffettivo());
    const scala = etichettaScala(s.tempo.scala, s.tempo.scala === 'UT' ? s.offsetMinuti : null);
    return T.console.regoloValore(`${formatData(dc)}, ${formatOra(dc.ora, dc.minuto)} ${scala}`, dc.calendario);
  }

  function aggiornaData(): void {
    const s = d.store.get();
    const off = offsetEffettivo();
    const dc = jdToCalendarLocale(s.tempo.jd, off);
    const scala = etichettaScala(s.tempo.scala, s.tempo.scala === 'UT' ? s.offsetMinuti : null);
    const data = formatData(dc);
    const oraTesto = `${formatOra(dc.ora, dc.minuto)} ${scala}`;
    testo(testoData, data);
    testo(testoDataBreve, `${formatDataBreve(dc)} ${formatAnno(dc.anno)}`);
    testo(testoOra, oraTesto);
    aggiornaNomeData();
    // Giorno della settimana e riga prolettica della data mostrata (ora con offset, istante arrotondato al ms come dc).
    testo(settimana, GIORNI_SETTIMANA[giornoSettimanaLocale(s.tempo.jd, off)] ?? '');
    testo(calendario, T.console.calendario(dc.calendario));
    const mostraProl = s.interfaccia.rigaProlettica && dc.calendario === 'giuliano';
    prolettica.hidden = !mostraProl;
    if (mostraProl) testo(prolettica, T.console.prolettico(formatData(jdToProlepticGregorian(s.tempo.jd, off))));
    // Editor aperto senza modifiche: i campi seguono l'istante (riproduzione, "Segui l'ora attuale").
    if (!editor.elemento.hidden) editor.allinea();
  }

  /**
   * Nome del pulsante della data con la forma mostrata, estesa o breve (foglio del telefono, stile.css): contiene
   * l'etichetta visibile (WCAG 2.5.3). Da richiamare anche quando cambiano layout e foglio.
   */
  function aggiornaNomeData(): void {
    const breve = getComputedStyle(testoData).display === 'none';
    const data = (breve ? testoDataBreve : testoData).textContent ?? '';
    attributo(pulsanteData, 'aria-label', T.console.modificaData(`${data} ${testoOra.textContent ?? ''}`));
  }

  function aggiornaControlli(): void {
    const s = d.store.get();
    if (unita.value !== s.unitaPasso) unita.value = s.unitaPasso;
    attributo(indietro, 'aria-label', T.console.indietro(s.unitaPasso));
    attributo(indietro, 'title', T.console.indietro(s.unitaPasso));
    attributo(avanti, 'aria-label', T.console.avanti(s.unitaPasso));
    attributo(avanti, 'title', T.console.avanti(s.unitaPasso));
    // Un solo controllo dei limiti (src/time/steps.ts), lo stesso del passo e dell'avviso del limite (§ 6.6).
    const lim = d.limiti();
    const al = limiteRaggiunto(s.tempo.jd, { jdMin: lim.min, jdMaxEscl: lim.maxEscl });
    attributo(indietro, 'aria-disabled', al === 'inferiore' ? 'true' : null);
    attributo(avanti, 'aria-disabled', al === 'superiore' ? 'true' : null);
    const r = s.riproduzione;
    const etichetta = r.attiva ? T.console.pausa : T.console.riproduci;
    attributo(pulsanteRiproduci, 'aria-label', etichetta);
    attributo(pulsanteRiproduci, 'title', etichetta);
    pulsanteRiproduci.replaceChildren(r.attiva ? iconaPausa : iconaPlay);
    pulsanteRiproduci.classList.toggle('ss-attivo', r.attiva);
    // "Segui l'ora attuale": la data avanza a 1 s/s in avanti; velocità e verso mostrano questo stato e sono disattivati.
    const segui = r.seguiOra && r.attiva;
    const indice = segui ? 0 : r.velocita;
    attributo(direzione, 'aria-pressed', !segui && r.direzione === -1 ? 'true' : 'false');
    attributo(direzione, 'aria-disabled', segui ? 'true' : null);
    attributo(direzione, 'title', segui ? T.console.velocitaSegui : T.console.direzione);
    velocita.disabled = segui;
    if (velocita.value !== String(indice)) velocita.value = String(indice);
    attributo(velocita, 'title', segui ? T.console.velocitaSegui : (VELOCITA_ETICHETTE[r.velocita]?.lunga ?? ''));
    // Il periodo in caricamento è nella barra di caricamento (§ 11.11): qui solo lo stato della riproduzione.
    attesa.hidden = !r.attesaDati;
    if (r.attesaDati) testo(attesa, T.console.attesaDati);
    adesso.classList.toggle('ss-attivo', r.seguiOra && r.attiva);
  }

  function impostaDeltaT(i: InfoDeltaT | null): void {
    if (i === null) {
      testo(deltaValore, UNITA.nonDisponibile);
      avvisoDeltaT.hidden = true;
      return;
    }
    // Valore e incertezza nella stessa unità; l'avviso riusa l'incertezza in ore della riga (§ 11.4.3, § 11.13).
    const dt = formatDeltaT(i.deltaT, i.sigma);
    testo(deltaValore, T.console.deltaTValore(dt.valore, dt.sigma));
    const avviso = i.scala === 'UT' && i.epsLuna !== null && i.epsLuna > SOGLIA_EPS_LUNA;
    avvisoDeltaT.hidden = !avviso;
    if (avviso && i.epsLuna !== null) {
      const t = T.console.oraIncerta(dt.sigmaOre, formatGradiBreve((i.epsLuna * 180) / Math.PI));
      testo(avvisoDeltaT.lastElementChild ?? avvisoDeltaT, t);
    }
  }

  function apriEditor(): void {
    editor.riempi();
    editor.elemento.hidden = false;
    attributo(pulsanteData, 'aria-expanded', 'true');
    d.store.aggiorna('interfaccia', { editorAperto: true });
    editor.focusPrimo();
  }

  function chiudiEditor(focusData: boolean): void {
    if (editor.elemento.hidden) return;
    editor.elemento.hidden = true;
    attributo(pulsanteData, 'aria-expanded', 'false');
    d.store.aggiorna('interfaccia', { editorAperto: false });
    if (focusData) pulsanteData.focus();
  }

  pulsanteData.addEventListener('click', () => {
    if (editor.elemento.hidden) apriEditor();
    else chiudiEditor(false);
  });

  return {
    elemento,
    pulsanteData,
    editor,
    regolo,
    pulsanteRiproduci,
    aggiornaData,
    aggiornaNomeData,
    aggiornaControlli,
    impostaDeltaT,
    impostaStagione(s) {
      stagione.hidden = s === null;
      if (s !== null) testo(stagione, testoStagione(s));
    },
    impostaBande: (b, nome) => regolo.impostaBande(b, nome),
    apriEditor,
    chiudiEditor,
    disponi(m) {
      // Si sposta il gruppo dei passi, solo se serve: il regolo (con le sue misure e i gesti) resta dov'è.
      const regoloSopra = m !== 'desktop';
      if ((riga2.firstElementChild === regolo.elemento) === regoloSopra) return;
      riga2.insertBefore(passi, regoloSopra ? riproduzione : regolo.elemento);
    },
  };
}

/** Velocità corrente in parole, per gli annunci. */
export function testoVelocita(indice: number): string {
  return VELOCITA_ETICHETTE[indice]?.lunga ?? String(VELOCITA_S[indice] ?? '');
}
