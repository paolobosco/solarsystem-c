// Editor della data a campi (§ 11.4.1, § 11.4.2): giorno, mese, anno, era, ora e minuti;
// validazione alla conferma (Invio o uscita dal gruppo), non a ogni tasto; opzioni avanzate.

import type { StoreApp } from '../app/store';
import {
  annoStoricoDaAstronomico,
  calendarLocaleToJd,
  jdToCalendarLocale,
  validaData,
} from '../time/calendar';
import type { CampoData, Era, EsitoNonValido, MakeTimeState, ScalaTempo } from '../time/types';
import { attributo, h, nuovoId, svuota } from './dom';
import { formatAnnoAstronomico, formatJd, formatOffset } from './format';
import { icona } from './icone';
import { messaggioValidazione } from './messaggi';
import type { LimitiScala } from './riproduzione';
import { MESI, T } from './testi.it';

export interface DipendenzeEditor {
  store: StoreApp;
  limiti: () => LimitiScala;
  makeTimeState: MakeTimeState;
  /** Applica l'istante (scala d'ingresso, senza offset) e lo annuncia. */
  conferma: (jd: number) => void;
  annuncia: (t: string) => void;
  /** Chiude l'editor e restituisce il focus al pulsante della data. */
  chiudi: () => void;
  /** Cambia la scala d'ingresso convertendo l'istante (UT ↔ TT). */
  cambiaScala: (scala: ScalaTempo) => void;
  /** Offset fisso in minuti, null per disattivarlo. */
  impostaOffset: (minuti: number | null) => void;
}

export interface EditorData {
  elemento: HTMLElement;
  riempi(): void;
  /** Riallinea i campi all'istante corrente se non sono stati modificati e il focus non è nei campi. */
  allinea(): void;
  focusPrimo(): void;
  aggiornaAvanzate(): void;
}

/** Offset da -12:00 a +14:00 a passi di 15 minuti (§ 11.4.1). */
export const OFFSET_AMMESSI: readonly number[] = Array.from({ length: (840 + 720) / 15 + 1 }, (_, i) => -720 + i * 15);
export const OFFSET_PREDEFINITO = 60;

/** Intero da un campo: vuoto → undefined; non numerico → NaN. */
export function leggiIntero(testo: string): number | undefined {
  const t = testo.trim();
  if (t === '') return undefined;
  return /^\d{1,6}$/.test(t) ? Number.parseInt(t, 10) : Number.NaN;
}

function due(n: number): string {
  return String(n).padStart(2, '0');
}

export function creaEditor(d: DipendenzeEditor): EditorData {
  const idTitolo = nuovoId('editor-t');
  const idGruppo = nuovoId('editor-g');
  const idIstr = nuovoId('editor-i');
  const idMsg = nuovoId('editor-m');
  const idEra = nuovoId('editor-era');

  const campoTesto = (classe: string, max: number, etichetta?: string) =>
    h('input', {
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      maxlength: max,
      class: `ss-input ${classe}`,
      'aria-label': etichetta ?? null,
    });

  const giorno = campoTesto('ss-input--giorno', 2);
  const mese = h('select', { class: 'ss-input ss-input--mese' });
  MESI.forEach((m, i) => mese.appendChild(h('option', { value: i + 1 }, m)));
  const anno = campoTesto('ss-input--anno', 5);
  const aC = h('button', { type: 'button', class: 'ss-segmento', 'aria-pressed': 'false' }, h('abbr', { title: T.editor.aCEsteso }, T.editor.aC));
  const dC = h('button', { type: 'button', class: 'ss-segmento', 'aria-pressed': 'true' }, h('abbr', { title: T.editor.dCEsteso }, T.editor.dC));
  const ora = campoTesto('ss-input--ora', 2, T.editor.ora);
  const minuti = campoTesto('ss-input--ora', 2, T.editor.minuti);
  let era: Era = 'dC';
  // Campi modificati dall'utente dopo l'ultimo riempimento: solo allora l'uscita dal gruppo applica i valori
  // (§ 11.4.1); i campi non modificati non riapplicano un istante superato né azzerano i secondi.
  let modificato = false;
  // Ora, minuti e secondi (con la frazione) dell'istante con cui i campi sono stati riempiti.
  let riempiti = { ora: 0, minuto: 0, secondi: 0 };

  function impostaEra(e: Era): void {
    era = e;
    attributo(aC, 'aria-pressed', e === 'aC' ? 'true' : 'false');
    attributo(dC, 'aria-pressed', e === 'dC' ? 'true' : 'false');
  }
  aC.addEventListener('click', () => {
    if (era !== 'aC') modificato = true;
    impostaEra('aC');
  });
  dC.addEventListener('click', () => {
    if (era !== 'dC') modificato = true;
    impostaEra('dC');
  });

  const etichetta = (testo: string, perId?: string) =>
    h('span', { class: 'ss-campo-etichetta', id: perId ?? null }, testo);
  const idGiorno = nuovoId('c');
  const idMese = nuovoId('c');
  const idAnno = nuovoId('c');
  giorno.id = idGiorno;
  mese.id = idMese;
  anno.id = idAnno;
  const idOraEt = nuovoId('c');

  const campi = h(
    'div',
    {
      class: 'ss-campi',
      role: 'group',
      id: idGruppo,
      'aria-labelledby': idTitolo,
      'aria-describedby': idIstr,
    },
    h('div', { class: 'ss-campo ss-campo--giorno' }, h('label', { class: 'ss-campo-etichetta', for: idGiorno }, T.editor.giorno), giorno),
    h('div', { class: 'ss-campo ss-campo--mese' }, h('label', { class: 'ss-campo-etichetta', for: idMese }, T.editor.mese), mese),
    h('div', { class: 'ss-campo ss-campo--anno' }, h('label', { class: 'ss-campo-etichetta', for: idAnno }, T.editor.anno), anno),
    h(
      'div',
      { class: 'ss-campo ss-campo--era', role: 'group', 'aria-labelledby': idEra },
      etichetta(T.editor.era, idEra),
      h('div', { class: 'ss-segmenti' }, aC, dC),
    ),
    h(
      'div',
      { class: 'ss-campo ss-campo--orario', role: 'group', 'aria-labelledby': idOraEt },
      etichetta(`${T.editor.ora} ${T.editor.separatoreOra} ${T.editor.minuti}`, idOraEt),
      h('div', { class: 'ss-orario' }, ora, h('span', { class: 'ss-orario-sep', 'aria-hidden': 'true' }, T.editor.separatoreOra), minuti),
    ),
  );

  const messaggio = h('div', { id: idMsg, class: 'ss-editor-messaggio' });
  messaggio.hidden = true;
  let chiaveMessaggio = '';

  const vai = h('button', { type: 'button', class: 'ss-pulsante ss-pulsante--primario' }, T.editor.vai);
  const chiudi = h('button', { type: 'button', class: 'ss-pulsante' }, T.chiudi);

  // --- Opzioni avanzate ---
  const annoAstr = h('output', { class: 'ss-num ss-mono' });
  const jdUT = h('output', { class: 'ss-num ss-mono' });
  const jdTT = h('output', { class: 'ss-num ss-mono' });
  const ingressoTT = h('input', { type: 'checkbox', class: 'ss-casella-input' });
  const usaOffset = h('input', { type: 'checkbox', class: 'ss-casella-input' });
  const idOffset = nuovoId('offset');
  const sceltaOffset = h('select', { id: idOffset, class: 'ss-input ss-input--offset' });
  for (const m of OFFSET_AMMESSI) sceltaOffset.appendChild(h('option', { value: m }, T.editor.offsetEtichetta(formatOffset(m))));
  sceltaOffset.value = String(OFFSET_PREDEFINITO);
  const prolettica = h('input', { type: 'checkbox', class: 'ss-casella-input' });

  /** Prima di cambiare scala od offset applica i campi modificati; false se non sono validi. */
  function applicaModifiche(): boolean {
    return !modificato || valida();
  }
  ingressoTT.addEventListener('change', () => {
    if (!applicaModifiche()) {
      ingressoTT.checked = !ingressoTT.checked;
      return;
    }
    d.cambiaScala(ingressoTT.checked ? 'TT' : 'UT');
    aggiornaAvanzate();
    riempi();
  });
  usaOffset.addEventListener('change', () => {
    if (!applicaModifiche()) {
      usaOffset.checked = !usaOffset.checked;
      return;
    }
    d.impostaOffset(usaOffset.checked ? Number(sceltaOffset.value) : null);
    aggiornaAvanzate();
    riempi();
  });
  sceltaOffset.addEventListener('change', () => {
    if (usaOffset.checked) {
      if (!applicaModifiche()) return;
      d.impostaOffset(Number(sceltaOffset.value));
      riempi();
    }
  });
  prolettica.addEventListener('change', () => d.store.aggiorna('interfaccia', { rigaProlettica: prolettica.checked }));

  const idJdUT = nuovoId('jd');
  const idJdTT = nuovoId('jd');
  const idAnnoA = nuovoId('aa');
  annoAstr.id = idAnnoA;
  jdUT.id = idJdUT;
  jdTT.id = idJdTT;
  const avanzate = h(
    'details',
    { class: 'ss-avanzate' },
    h('summary', null, T.editor.avanzate),
    h(
      'dl',
      { class: 'ss-dati ss-dati--compatti' },
      h('div', null, h('dt', null, T.editor.annoAstronomico), h('dd', null, annoAstr)),
      h('div', null, h('dt', null, T.editor.jdUT), h('dd', null, jdUT)),
      h('div', null, h('dt', null, T.editor.jdTT), h('dd', null, jdTT)),
    ),
    h('label', { class: 'ss-casella' }, ingressoTT, h('span', { class: 'ss-casella-testo' }, T.editor.ingressoTT)),
    h('label', { class: 'ss-casella' }, usaOffset, h('span', { class: 'ss-casella-testo' }, T.editor.offsetUsa)),
    h(
      'div',
      { class: 'ss-campo ss-campo--offset' },
      h('label', { class: 'ss-campo-etichetta', for: idOffset }, T.editor.offset),
      sceltaOffset,
    ),
    h('p', { class: 'ss-nota' }, T.editor.offsetNota),
    h('label', { class: 'ss-casella' }, prolettica, h('span', { class: 'ss-casella-testo' }, T.editor.rigaProlettica)),
  );

  const elemento = h(
    'div',
    { class: 'ss-editor', id: nuovoId('editor'), role: 'region', 'aria-labelledby': idTitolo },
    h('h2', { id: idTitolo, class: 'ss-editor-titolo' }, T.editor.titolo),
    campi,
    h('p', { id: idIstr, class: 'ss-editor-istruzioni' }, T.editor.istruzioni),
    messaggio,
    h('div', { class: 'ss-editor-azioni' }, vai, chiudi),
    avanzate,
  );

  function offsetEffettivo(): number {
    const s = d.store.get();
    return s.tempo.scala === 'UT' && s.offsetMinuti !== null ? s.offsetMinuti : 0;
  }

  function riempi(): void {
    const s = d.store.get();
    const dc = jdToCalendarLocale(s.tempo.jd, offsetEffettivo());
    const st = annoStoricoDaAstronomico(dc.anno);
    giorno.value = due(dc.giorno);
    mese.value = String(dc.mese);
    anno.value = String(st.annoStorico);
    impostaEra(st.era);
    ora.value = due(dc.ora);
    minuti.value = due(dc.minuto);
    riempiti = { ora: dc.ora, minuto: dc.minuto, secondi: dc.secondo };
    modificato = false;
    pulisciErrore();
    aggiornaAvanzate();
  }

  function aggiornaAvanzate(): void {
    const s = d.store.get();
    const ts = d.makeTimeState(s.tempo.jd, s.tempo.scala);
    const dc = jdToCalendarLocale(s.tempo.jd, offsetEffettivo());
    annoAstr.textContent = formatAnnoAstronomico(dc.anno);
    jdUT.textContent = formatJd(ts.jdUT);
    jdTT.textContent = formatJd(ts.jdTT);
    ingressoTT.checked = s.tempo.scala === 'TT';
    usaOffset.checked = s.offsetMinuti !== null;
    usaOffset.disabled = s.tempo.scala === 'TT';
    sceltaOffset.disabled = s.tempo.scala === 'TT' || s.offsetMinuti === null;
    if (s.offsetMinuti !== null) sceltaOffset.value = String(s.offsetMinuti);
    prolettica.checked = s.interfaccia.rigaProlettica;
  }

  const perCampo: Partial<Record<CampoData, HTMLElement>> = {
    giorno,
    mese,
    anno,
    era: aC.parentElement ?? undefined,
    ora,
    minuto: minuti,
  };

  function pulisciErrore(): void {
    messaggio.hidden = true;
    svuota(messaggio);
    chiaveMessaggio = '';
    attributo(campi, 'aria-invalid', null);
    attributo(campi, 'aria-describedby', idIstr);
    for (const el of Object.values(perCampo)) attributo(el, 'aria-invalid', null);
  }

  function mostraErrore(esito: EsitoNonValido, giornoN: number | undefined, meseN: number, annoAstronomico: number | undefined): void {
    const s = d.store.get();
    const lim = d.limiti();
    const m = messaggioValidazione(esito, {
      giorno: giornoN,
      mese: meseN,
      anno: annoAstronomico,
      offsetMinuti: s.tempo.scala === 'UT' ? s.offsetMinuti : null,
      scala: s.tempo.scala,
      jdMin: lim.min,
      jdMaxEscl: lim.maxEscl,
    });
    const chiave = `${esito.codice}|${m.testo}`;
    attributo(campi, 'aria-invalid', 'true');
    attributo(campi, 'aria-describedby', `${idIstr} ${idMsg}`);
    for (const [k, el] of Object.entries(perCampo)) attributo(el, 'aria-invalid', k === m.campo ? 'true' : null);
    if (chiave === chiaveMessaggio) return;
    chiaveMessaggio = chiave;
    svuota(messaggio);
    messaggio.appendChild(h('p', { class: 'ss-editor-errore' }, icona('avviso'), h('span', null, m.testo)));
    if (m.azioni.length > 0) {
      const azioni = h('div', { class: 'ss-editor-proposte' });
      for (const a of m.azioni) {
        const b = h('button', { type: 'button', class: 'ss-pulsante' }, a.etichetta);
        b.addEventListener('click', () => {
          const jd = calendarLocaleToJd(a.data, offsetEffettivo());
          d.conferma(jd);
          riempi();
          giorno.focus();
        });
        azioni.appendChild(b);
      }
      messaggio.appendChild(azioni);
    }
    messaggio.hidden = false;
    d.annuncia(m.testo);
  }

  /** Valida i campi; se validi applica l'istante. Restituisce l'esito. */
  function valida(): boolean {
    const g = leggiIntero(giorno.value);
    const me = Number(mese.value);
    const a = leggiIntero(anno.value);
    const o = leggiIntero(ora.value);
    const mi = leggiIntero(minuti.value);
    const lim = d.limiti();
    const esito = validaData(
      { giorno: g, mese: me, annoStorico: a, era, ora: o, minuto: mi, secondo: 0 },
      { offsetMinuti: offsetEffettivo(), jdMin: lim.min, jdMaxEscl: lim.maxEscl },
    );
    if (!esito.valida) {
      const annoA = a !== undefined && Number.isInteger(a) && a > 0 ? (era === 'dC' ? a : 1 - a) : undefined;
      mostraErrore(esito, g, me, annoA);
      return false;
    }
    pulisciErrore();
    // Con ora e minuti invariati si conservano i secondi dell'istante con cui i campi sono stati riempiti.
    const jd = o === riempiti.ora && mi === riempiti.minuto ? esito.jd + riempiti.secondi / 86400 : esito.jd;
    if (jd !== d.store.get().tempo.jd) d.conferma(jd);
    modificato = false;
    aggiornaAvanzate();
    return true;
  }

  let annullando = false;
  campi.addEventListener('input', () => {
    modificato = true;
  });
  campi.addEventListener('keydown', (e) => {
    // Invio su un pulsante del gruppo (era) lo attiva come Spazio (APG, Button): conferma solo dai campi.
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      // Senza modifiche Invio chiude come Vai, senza riapplicare i campi.
      if (!modificato || valida()) {
        annullando = true;
        d.chiudi();
        annullando = false;
      }
    }
  });
  campi.addEventListener('focusout', (e) => {
    if (annullando || elemento.hidden || !modificato) return;
    // Verso i pulsanti e le opzioni dell'editor non si valida: Vai conferma, Chiudi ed Esc annullano.
    const verso = e.relatedTarget as Node | null;
    if (verso !== null && elemento.contains(verso)) return;
    valida();
  });
  elemento.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      annullando = true;
      d.chiudi();
      annullando = false;
    }
  });
  vai.addEventListener('click', () => {
    if (!modificato) {
      annullando = true;
      d.chiudi();
      annullando = false;
      return;
    }
    if (valida()) {
      annullando = true;
      d.chiudi();
      annullando = false;
    }
  });
  chiudi.addEventListener('click', () => {
    annullando = true;
    d.chiudi();
    annullando = false;
  });

  return {
    elemento,
    riempi,
    allinea() {
      const attivo = document.activeElement;
      if (modificato || (attivo !== null && campi.contains(attivo))) {
        aggiornaAvanzate();
        return;
      }
      riempi();
    },
    focusPrimo() {
      giorno.focus();
      giorno.select();
    },
    aggiornaAvanzate,
  };
}
