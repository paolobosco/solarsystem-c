// Nodi per numeri e unità (§ 11.13, § 11.14): numeri dentro un elemento senza a capo, UA con abbr.

import { h } from './dom';
import type { Misura } from './format';
import { SEPARATORI, SPAZIO_NB } from './format';
import { TNO_SIGLA, TNO_TITOLO, UNITA } from './testi';

/** Numero in un elemento white-space: nowrap (i gruppi di cifre usano U+2009). */
export function nodoNumero(valore: string): HTMLSpanElement {
  return h('span', { class: 'ss-num' }, valore);
}

/** Unità: UA come abbreviazione con il titolo del glossario. */
export function nodoUnita(unita: string): Node {
  if (unita === UNITA.ua) return h('abbr', { title: UNITA.uaEsteso }, UNITA.ua);
  return document.createTextNode(unita);
}

/** Misura completa: "≈ 34,2 UA" con numero senza a capo e spazio non separabile. */
export function nodoMisura(m: Misura): HTMLSpanElement {
  const out = h('span', { class: 'ss-misura' });
  if (m.approssimato) out.appendChild(document.createTextNode(UNITA.circa + SPAZIO_NB));
  out.appendChild(nodoNumero(m.valore));
  if (m.unita !== '') {
    out.appendChild(document.createTextNode(SPAZIO_NB));
    out.appendChild(nodoUnita(m.unita));
  }
  return out;
}

/**
 * Numero con gruppi di cifre (§ 11.13): "84 381,448" e "1 510" con U+2009 in italiano, "84,381.448" e "1,510" in inglese.
 * Il gruppo è un solo token: U+2009 ammette l'interruzione di riga e va chiuso in un elemento senza a capo.
 */
const NUMERO_RAGGRUPPATO =
  SEPARATORI.migliaia === ','
    ? /(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/
    : new RegExp(`(\\d{1,3}(?:${SEPARATORI.migliaia}\\d{3})+(?:${SEPARATORI.decimale}\\d+)?)`);

/**
 * Parti di un testo fisso: alle posizioni dispari i numeri raggruppati, che vanno in un elemento senza a capo perché
 * U+2009 ammette l'interruzione di riga (§ 11.13). "obliquità di 84 381,448″" → ["obliquità di ", "84 381,448", "″"].
 */
export function partiConNumeri(testo: string): string[] {
  return testo.split(NUMERO_RAGGRUPPATO);
}

/** Sigle del glossario in un testo: l'unità astronomica e TNO, anche al plurale inglese ("TNOs"). */
const SIGLE = new RegExp(`\\b(${UNITA.ua}|${TNO_SIGLA})(s?)\\b`);

/** Testo con le sigle del glossario come abbr (UA, TNO, § 11.14) e i numeri raggruppati senza a capo (§ 11.13). */
export function nodoTesto(testo: string): DocumentFragment {
  const f = document.createDocumentFragment();
  partiConNumeri(testo).forEach((pezzo, j) => {
    if (j % 2 === 1) {
      f.appendChild(nodoNumero(pezzo));
      return;
    }
    // split con due gruppi: [testo, sigla, "s" o "", testo, ...]
    const parti = pezzo.split(SIGLE);
    for (let i = 0; i < parti.length; i += 3) {
      const t = parti[i] ?? '';
      if (t !== '') f.appendChild(document.createTextNode(t));
      const sigla = parti[i + 1];
      if (sigla === undefined) continue;
      const plurale = parti[i + 2] ?? '';
      f.appendChild(sigla === UNITA.ua ? h('abbr', { title: UNITA.uaEsteso }, UNITA.ua) : h('abbr', { title: TNO_TITOLO }, TNO_SIGLA));
      if (plurale !== '') f.appendChild(document.createTextNode(plurale));
    }
  });
  return f;
}

/** Sostituisce il contenuto di un nodo con una misura, solo se il testo cambia. */
export function aggiornaMisura(el: HTMLElement, m: Misura): void {
  const t = (m.approssimato ? UNITA.circa + SPAZIO_NB : '') + m.valore + (m.unita === '' ? '' : SPAZIO_NB + m.unita);
  if (el.dataset['testo'] === t) return;
  el.dataset['testo'] = t;
  el.replaceChildren(nodoMisura(m));
}
