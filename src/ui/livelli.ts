// Pannello dei livelli visivi (RF5) con la legenda dei simboli e dell'affidabilità (§ 11.1, § 7.8.2).

import type { LivelloVisivo, StoreApp } from '../app/store';
import type { CategoriaCorpo } from '../data/catalogTypes';
import type { Livello } from '../ephem/types';
import { COLORE_SELEZIONE } from '../render/costanti';
import { h, nuovoId, s } from './dom';
import { nodoTesto } from './nodi';
import { iconaAffidabilita, simbolo } from './simboli';
import { NOMI_CATEGORIE_PLURALE, NOMI_LIVELLI, NOMI_LIVELLI_VISIVI, T } from './testi.it';

const ORDINE_LIVELLI: readonly LivelloVisivo[] = [
  'orbite',
  'etichette',
  'marcatori',
  'anelliDistanza',
  'grigliaEclittica',
  'eclitticaData',
  'assiRotazione',
  'anelli',
  'stelle',
  'barraScala',
];

const CATEGORIE_LEGENDA: readonly CategoriaCorpo[] = [
  'sole',
  'pianeta',
  'pianeta-nano',
  'luna',
  'asteroide',
  'centauro',
  'cometa',
  'tno',
  'interstellare',
];

const LIVELLI_LEGENDA: readonly Livello[] = ['precisa', 'buona', 'approssimata', 'indicativa', 'non-determinabile'];

export interface PannelloLivelli {
  elemento: HTMLElement;
  aggiorna(): void;
}

function anelloSelezione(): SVGSVGElement {
  const svg = s('svg', { class: 'ss-simbolo', viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' });
  svg.appendChild(s('circle', { cx: 8, cy: 8, r: 6, fill: 'none', stroke: COLORE_SELEZIONE, 'stroke-width': 2 }));
  return svg;
}

/** Legenda dei simboli e dei livelli di affidabilità. */
export function creaLegendaSimboli(): HTMLElement {
  const idSimboli = nuovoId('leg-s');
  const idAff = nuovoId('leg-a');
  const simboli = h('ul', { class: 'ss-legenda-lista', 'aria-labelledby': idSimboli });
  for (const c of CATEGORIE_LEGENDA) {
    simboli.appendChild(h('li', null, simbolo(c), h('span', null, nodoTesto(NOMI_CATEGORIE_PLURALE[c]))));
  }
  simboli.appendChild(h('li', null, anelloSelezione(), h('span', null, T.legenda.selezione)));
  const aff = h('ul', { class: 'ss-legenda-lista ss-legenda-lista--aff', 'aria-labelledby': idAff });
  for (const l of LIVELLI_LEGENDA) {
    aff.appendChild(
      h(
        'li',
        null,
        iconaAffidabilita(l),
        h('span', null, h('strong', { class: `ss-aff-testo ss-aff-testo--${l}` }, NOMI_LIVELLI[l]), `: ${T.legenda.descrizioniLivelli[l]}`),
      ),
    );
  }
  return h(
    'div',
    { class: 'ss-legenda-simboli' },
    h('h3', { id: idSimboli, class: 'ss-sottotitolo' }, T.legenda.simboli),
    simboli,
    h('h3', { id: idAff, class: 'ss-sottotitolo' }, T.legenda.affidabilita),
    aff,
    h('p', { class: 'ss-nota' }, T.legenda.fasce),
  );
}

export function creaPannelloLivelli(store: StoreApp, annuncia: (t: string) => void): PannelloLivelli {
  const idTitolo = nuovoId('livelli-t');
  const caselle = new Map<LivelloVisivo, HTMLInputElement>();
  const gruppo = h('fieldset', { class: 'ss-livelli-gruppo' }, h('legend', { class: 'ss-sr' }, T.livelli.titolo));
  for (const l of ORDINE_LIVELLI) {
    const input = h('input', { type: 'checkbox', class: 'ss-casella-input' });
    input.checked = store.get().livelli[l];
    input.addEventListener('change', () => {
      store.aggiorna('livelli', { [l]: input.checked });
      annuncia(T.annunci.livello(NOMI_LIVELLI_VISIVI[l], input.checked));
    });
    caselle.set(l, input);
    gruppo.appendChild(h('label', { class: 'ss-casella' }, input, h('span', { class: 'ss-casella-testo' }, NOMI_LIVELLI_VISIVI[l])));
    if (l === 'eclitticaData') {
      // La linea sta sul cielo di fondo: con l'elevazione dei preset (30°) è fuori campo.
      const idNota = nuovoId('livelli-ecl');
      input.setAttribute('aria-describedby', idNota);
      gruppo.appendChild(h('p', { id: idNota, class: 'ss-nota ss-livelli-nota' }, T.livelli.eclitticaDataNota));
    }
  }
  const elemento = h(
    'section',
    { class: 'ss-popover ss-livelli', id: nuovoId('livelli'), 'aria-labelledby': idTitolo },
    h('h2', { id: idTitolo, class: 'ss-pannello-titolo' }, T.livelli.titolo),
    gruppo,
    creaLegendaSimboli(),
  );
  return {
    elemento,
    aggiorna() {
      const lv = store.get().livelli;
      for (const [k, input] of caselle) if (input.checked !== lv[k]) input.checked = lv[k];
    },
  };
}
