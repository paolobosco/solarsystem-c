// Campo Trova: combobox con elenco a comparsa (WAI-ARIA APG, aria-activedescendant), risultati
// raggruppati per categoria (§ 11.6).

import type { CorpoCatalogo } from '../data/catalogTypes';
import { cerca, ordineVisivo, raggruppaRisultati } from './cerca';
import type { IndiceRicerca, RisultatoRicerca } from './cerca';
import { attributo, h, nuovoId, svuota, testo } from './dom';
import { icona } from './icone';
import { nodoTesto } from './nodi';
import { simbolo } from './simboli';
import { NOMI_CATEGORIE_PLURALE, T } from './testi.it';

export interface DipendenzeTrova {
  indice: () => IndiceRicerca | null;
  /** Testo secondario dell'opzione (es. "luna di Giove"). */
  dettaglio: (c: CorpoCatalogo) => string | null;
  seleziona: (c: CorpoCatalogo) => void;
  annuncia: (testo: string) => void;
  /** Pulsante del catalogo creato altrove e inserito nel campo. */
  pulsanteCatalogo: HTMLButtonElement;
}

export interface Trova {
  elemento: HTMLElement;
  input: HTMLInputElement;
  focus(): void;
  chiudi(): void;
  /** Corpo selezionato da un'altra via (catalogo, mappa, collegamento): la ricerca superata si svuota. */
  selezioneEsterna(nome: string): void;
}

export function creaTrova(d: DipendenzeTrova): Trova {
  const idInput = nuovoId('trova');
  const idLista = nuovoId('trova-lista');
  const idIstr = nuovoId('trova-istr');
  const idVuoto = nuovoId('trova-vuoto');

  const input = h('input', {
    id: idInput,
    class: 'ss-trova-input',
    type: 'text',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': idLista,
    'aria-describedby': idIstr,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    placeholder: T.trova.segnaposto,
  });
  const lista = h('div', { id: idLista, class: 'ss-trova-lista', role: 'listbox', 'aria-label': T.trova.risultati });
  lista.hidden = true;
  const vuoto = h('p', { id: idVuoto, class: 'ss-trova-vuoto' });
  vuoto.hidden = true;

  const elemento = h(
    'div',
    { class: 'ss-trova', role: 'search' },
    h('label', { class: 'ss-sr', for: idInput }, T.trova.etichetta),
    h('div', { class: 'ss-trova-campo' }, icona('cerca', 'ss-icona ss-trova-lente'), input, d.pulsanteCatalogo),
    lista,
    vuoto,
    h('span', { id: idIstr, class: 'ss-sr' }, T.trova.istruzioni),
  );

  let risultati: RisultatoRicerca[] = [];
  let opzioni: HTMLElement[] = [];
  let attivo = -1;
  let ultimaQuery = '';

  function apriLista(v: boolean): void {
    lista.hidden = !v;
    attributo(input, 'aria-expanded', v ? 'true' : 'false');
    if (!v) impostaAttivo(-1);
  }

  function impostaAttivo(i: number): void {
    if (attivo >= 0) opzioni[attivo]?.setAttribute('aria-selected', 'false');
    attivo = i;
    const op = i >= 0 ? opzioni[i] : undefined;
    if (op) {
      op.setAttribute('aria-selected', 'true');
      attributo(input, 'aria-activedescendant', op.id);
      op.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  /** Messaggio "Nessun corpo per ..." legato alla ricerca in corso (§ 11.6): visibile solo con il focus nel campo. */
  function mostraVuoto(v: boolean): void {
    vuoto.hidden = !v;
    attributo(input, 'aria-describedby', v ? `${idIstr} ${idVuoto}` : idIstr);
  }

  function scegli(i: number): void {
    const r = risultati[i];
    if (!r) return;
    input.value = r.corpo.nome;
    ultimaQuery = input.value;
    apriLista(false);
    mostraVuoto(false);
    d.seleziona(r.corpo);
  }

  function disegna(): void {
    svuota(lista);
    opzioni = [];
    attivo = -1;
    input.removeAttribute('aria-activedescendant');
    for (const g of raggruppaRisultati(risultati)) {
      const idGruppo = nuovoId('trova-g');
      const gruppo = h(
        'ul',
        { class: 'ss-trova-gruppo', role: 'group', 'aria-labelledby': idGruppo },
        h('li', { id: idGruppo, class: 'ss-trova-gruppo-nome', role: 'presentation' }, nodoTesto(NOMI_CATEGORIE_PLURALE[g.categoria])),
      );
      for (const r of g.risultati) {
        const i = risultati.indexOf(r);
        const det = d.dettaglio(r.corpo);
        const op = h(
          'li',
          { id: nuovoId('trova-op'), class: 'ss-trova-opzione', role: 'option', 'aria-selected': 'false' },
          simbolo(r.corpo.categoria),
          h('span', { class: 'ss-trova-nome' }, r.corpo.nome),
          det ? h('span', { class: 'ss-trova-dettaglio' }, det) : null,
        );
        op.addEventListener('pointerdown', (e) => e.preventDefault());
        op.addEventListener('click', () => scegli(i));
        opzioni[i] = op;
        gruppo.appendChild(op);
      }
      lista.appendChild(gruppo);
    }
  }

  function aggiornaRisultati(): void {
    const q = input.value.trim();
    if (q === ultimaQuery && !lista.hidden) return;
    ultimaQuery = q;
    const indice = d.indice();
    if (q.length === 0 || indice === null) {
      risultati = [];
      apriLista(false);
      mostraVuoto(false);
      return;
    }
    risultati = ordineVisivo(cerca(indice, q));
    if (risultati.length === 0) {
      apriLista(false);
      const msg = T.trova.nessuno(q);
      testo(vuoto, msg);
      mostraVuoto(true);
      d.annuncia(msg);
      return;
    }
    mostraVuoto(false);
    disegna();
    apriLista(true);
    d.annuncia(T.trova.conteggio(risultati.length));
  }

  input.addEventListener('input', () => {
    ultimaQuery = '\u0000';
    aggiornaRisultati();
  });
  input.addEventListener('keydown', (e) => {
    const n = risultati.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (lista.hidden) {
          if (n > 0) {
            apriLista(true);
            impostaAttivo(0);
          } else {
            ultimaQuery = '\u0000';
            aggiornaRisultati();
            if (risultati.length > 0) impostaAttivo(0);
          }
        } else if (n > 0) impostaAttivo((attivo + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!lista.hidden && n > 0) impostaAttivo(attivo <= 0 ? n - 1 : attivo - 1);
        break;
      case 'Enter':
        if (!lista.hidden && n > 0) {
          e.preventDefault();
          scegli(attivo >= 0 ? attivo : 0);
        }
        break;
      case 'Escape':
        if (!lista.hidden) {
          e.preventDefault();
          e.stopPropagation();
          apriLista(false);
        } else if (input.value !== '') {
          e.preventDefault();
          e.stopPropagation();
          input.value = '';
          ultimaQuery = '';
          mostraVuoto(false);
        }
        break;
      case 'Tab':
        apriLista(false);
        break;
    }
  });
  // Uscendo dal campo si chiudono elenco e messaggio, che non devono coprire i pannelli (catalogo); al rientro tornano.
  input.addEventListener('blur', () => {
    apriLista(false);
    mostraVuoto(false);
  });
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q === '') return;
    if (risultati.length > 0) apriLista(true);
    else if (q === ultimaQuery && vuoto.textContent !== '') mostraVuoto(true);
  });

  return {
    elemento,
    input,
    focus() {
      input.focus();
      input.select();
    },
    chiudi() {
      apriLista(false);
    },
    selezioneEsterna(nome) {
      if (input.value === '' || input.value === nome) return;
      input.value = '';
      ultimaQuery = '';
      risultati = [];
      apriLista(false);
      mostraVuoto(false);
      testo(vuoto, '');
    },
  };
}
