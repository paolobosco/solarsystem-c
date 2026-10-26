// Catalogo dei corpi (§ 11.6): elenchi annidati di pulsanti per categoria, con le lune sotto il
// pianeta; filtri per categoria con contatore.

import type { CategoriaFiltro, StoreApp } from '../app/store';
import { CATEGORIE_FILTRO } from '../app/store';
import type { CategoriaCorpo, CorpoCatalogo } from '../data/catalogTypes';
import type { Livello } from '../ephem/types';
import { attributo, h, nuovoId, svuota } from './dom';
import { icona } from './icone';
import { nodoTesto } from './nodi';
import { simbolo } from './simboli';
import { NOMI_CATEGORIE_PLURALE, T, TNO_ESTESO } from './testi';

/** Corpi che hanno la categoria come primaria o secondaria (§ 11.6). */
export function contaPerCategoria(corpi: readonly CorpoCatalogo[]): Record<CategoriaFiltro, number> {
  const n = Object.fromEntries(CATEGORIE_FILTRO.map((c) => [c, 0])) as Record<CategoriaFiltro, number>;
  for (const c of corpi) {
    const cat = new Set<CategoriaCorpo>([c.categoria, ...c.categorieSecondarie]);
    for (const k of cat) if (k !== 'sole') n[k] += 1;
  }
  return n;
}

/** Visibile se almeno una delle categorie è attiva (§ 4.2); il Sole è sempre visibile. */
export function visibileConFiltri(c: CorpoCatalogo, filtri: Readonly<Record<CategoriaFiltro, boolean>>): boolean {
  if (c.categoria === 'sole') return true;
  for (const k of [c.categoria, ...c.categorieSecondarie]) if (k !== 'sole' && filtri[k]) return true;
  return false;
}

export interface VoceCatalogo {
  corpo: CorpoCatalogo;
  lune: CorpoCatalogo[];
}

export interface SezioneCatalogo {
  categoria: CategoriaCorpo;
  voci: VoceCatalogo[];
}

/** Ordine delle sezioni del catalogo; le lune sono annidate sotto il loro primario. */
const ORDINE_SEZIONI: readonly CategoriaCorpo[] = [
  'sole',
  'pianeta',
  'pianeta-nano',
  'asteroide',
  'centauro',
  'cometa',
  'tno',
  'interstellare',
];

/** Sezioni del catalogo nell'ordine dell'anagrafica (ssid). */
export function sezioniCatalogo(corpi: readonly CorpoCatalogo[]): SezioneCatalogo[] {
  const perSlug = new Map(corpi.map((c) => [c.slug, c]));
  const lune = new Map<string, CorpoCatalogo[]>();
  const orfane: CorpoCatalogo[] = [];
  for (const c of corpi) {
    if (c.categoria !== 'luna') continue;
    if (c.primario !== null && perSlug.has(c.primario)) {
      const l = lune.get(c.primario) ?? [];
      l.push(c);
      lune.set(c.primario, l);
    } else orfane.push(c);
  }
  const sezioni: SezioneCatalogo[] = [];
  for (const cat of ORDINE_SEZIONI) {
    const voci = corpi
      .filter((c) => c.categoria === cat)
      .sort((a, b) => a.ssid - b.ssid)
      .map((c) => ({ corpo: c, lune: (lune.get(c.slug) ?? []).sort((a, b) => a.ssid - b.ssid) }));
    if (voci.length > 0) sezioni.push({ categoria: cat, voci });
  }
  if (orfane.length > 0) sezioni.push({ categoria: 'luna', voci: orfane.map((c) => ({ corpo: c, lune: [] })) });
  return sezioni;
}

export interface DipendenzeCatalogo {
  store: StoreApp;
  seleziona: (c: CorpoCatalogo) => void;
  chiudi: () => void;
  annuncia: (t: string) => void;
  /** Livello di affidabilità alla data, se noto. */
  livello: (c: CorpoCatalogo) => Livello | null;
}

export interface Catalogo {
  elemento: HTMLElement;
  impostaCorpi(corpi: readonly CorpoCatalogo[]): void;
  /** Aggiorna selezione, filtri e stato alla data. */
  aggiorna(): void;
  focusIniziale(): void;
}

export function creaCatalogo(d: DipendenzeCatalogo): Catalogo {
  const idTitolo = nuovoId('catalogo-t');
  const filtri = h('fieldset', { class: 'ss-filtri' }, h('legend', { class: 'ss-filtri-titolo' }, T.catalogo.filtri));
  const elenco = h('div', { class: 'ss-catalogo-elenco' });
  const chiudi = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-label': T.catalogo.chiudi, title: T.catalogo.chiudi },
    icona('chiudi'),
  );
  chiudi.addEventListener('click', () => d.chiudi());
  const elemento = h(
    'section',
    { class: 'ss-pannello ss-catalogo', id: nuovoId('catalogo'), 'aria-labelledby': idTitolo },
    h('div', { class: 'ss-pannello-testa' }, h('h2', { id: idTitolo, class: 'ss-pannello-titolo' }, T.catalogo.titolo), chiudi),
    h('div', { class: 'ss-pannello-corpo' }, filtri, elenco),
  );

  let corpi: readonly CorpoCatalogo[] = [];
  const caselle = new Map<CategoriaFiltro, HTMLInputElement>();
  const pulsanti = new Map<string, { b: HTMLButtonElement; stato: HTMLElement; corpo: CorpoCatalogo }>();

  function disegnaFiltri(): void {
    for (const el of Array.from(filtri.querySelectorAll('.ss-filtri-griglia'))) el.remove();
    caselle.clear();
    const n = contaPerCategoria(corpi);
    const griglia = h('div', { class: 'ss-filtri-griglia' });
    for (const cat of CATEGORIE_FILTRO) {
      const input = h('input', { type: 'checkbox', class: 'ss-casella-input' });
      input.checked = d.store.get().filtri[cat];
      input.addEventListener('change', () => {
        d.store.aggiorna('filtri', { [cat]: input.checked });
        d.annuncia(T.annunci.filtro(cat, input.checked));
      });
      caselle.set(cat, input);
      griglia.appendChild(
        h(
          'label',
          { class: 'ss-casella ss-casella--filtro' },
          input,
          simbolo(cat),
          h('span', { class: 'ss-casella-testo' }, nodoTesto(NOMI_CATEGORIE_PLURALE[cat])),
          h('span', { class: 'ss-contatore' }, String(n[cat])),
        ),
      );
    }
    filtri.appendChild(griglia);
  }

  function voce(c: CorpoCatalogo): HTMLLIElement {
    const stato = h('span', { class: 'ss-catalogo-stato' });
    const b = h(
      'button',
      { type: 'button', class: 'ss-catalogo-voce', 'data-slug': c.slug },
      simbolo(c.categoria),
      h('span', { class: 'ss-catalogo-nome' }, c.nome),
      stato,
    );
    b.addEventListener('click', () => d.seleziona(c));
    pulsanti.set(c.slug, { b, stato, corpo: c });
    return h('li', null, b);
  }

  function disegnaElenco(): void {
    svuota(elenco);
    pulsanti.clear();
    for (const sez of sezioniCatalogo(corpi)) {
      const idSez = nuovoId('catalogo-s');
      const titolo = sez.categoria === 'tno' ? TNO_ESTESO : NOMI_CATEGORIE_PLURALE[sez.categoria];
      const ul = h('ul', { class: 'ss-catalogo-lista', 'aria-labelledby': idSez });
      for (const v of sez.voci) {
        const li = voce(v.corpo);
        if (v.lune.length > 0) {
          const sotto = h('ul', { class: 'ss-catalogo-lune', 'aria-label': T.catalogo.lune(v.corpo.nome, v.lune.length) });
          for (const l of v.lune) sotto.appendChild(voce(l));
          li.appendChild(sotto);
        }
        ul.appendChild(li);
      }
      elenco.appendChild(h('h3', { id: idSez, class: 'ss-catalogo-sezione' }, titolo));
      elenco.appendChild(ul);
    }
  }

  function aggiorna(): void {
    const s = d.store.get();
    for (const [cat, input] of caselle) if (input.checked !== s.filtri[cat]) input.checked = s.filtri[cat];
    for (const { b, stato, corpo } of pulsanti.values()) {
      attributo(b, 'aria-current', corpo.slug === s.selezionato ? 'true' : null);
      const nascosto = !visibileConFiltri(corpo, s.filtri);
      const liv = d.livello(corpo);
      const parti: string[] = [];
      if (liv === 'non-determinabile') parti.push(T.catalogo.nonDeterminabile);
      if (nascosto) parti.push(T.catalogo.nascosto);
      const t = parti.join(', ');
      if (stato.textContent !== t) stato.textContent = t;
      b.classList.toggle('ss-catalogo-voce--nascosta', nascosto);
    }
  }

  return {
    elemento,
    impostaCorpi(c) {
      corpi = c;
      disegnaFiltri();
      disegnaElenco();
      aggiorna();
    },
    aggiorna,
    focusIniziale() {
      const s = d.store.get();
      const sel = s.selezionato === null ? undefined : pulsanti.get(s.selezionato)?.b;
      (sel ?? elemento.querySelector<HTMLElement>('input, button'))?.focus();
    },
  };
}
