// Finestre "Fonti e metodi", "Impostazioni" e "Scorciatoie da tastiera" in <dialog> nativo
// (showModal): chiusura con Esc e ritorno del focus all'elemento che le ha aperte (§ 11.9).

import type { StoreApp } from '../app/store';
import { h, nuovoId } from './dom';
import { icona } from './icone';
import { eLingua } from './lingua';
import type { Lingua } from './lingua';
import { nodoTesto } from './nodi';
import { FONTI_METODI_SEZIONI, RIFERIMENTI, STRUMENTI, T, VOCI_ACCURATEZZA, partiTasti } from './testi';
import type { ValoriValidazione } from './valoriValidazione';

export interface Dialogo {
  elemento: HTMLDialogElement;
  apri(origine?: HTMLElement | null): void;
  chiudi(): void;
  readonly aperto: boolean;
}

/**
 * `rifugio` riceve il focus alla chiusura se l'elemento che ha aperto il dialogo non è più visibile (comando nascosto da un
 * cambio di layout mentre il dialogo era aperto).
 */
export function creaDialogo(titolo: string, contenuto: Node, classe = '', rifugio?: () => HTMLElement | null): Dialogo {
  const idTitolo = nuovoId('dialogo-t');
  const chiudiB = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-dialogo-chiudi', 'aria-label': T.chiudi, title: T.chiudi },
    icona('chiudi'),
  );
  const elemento = h(
    'dialog',
    { class: `ss-dialogo ${classe}`.trim(), 'aria-labelledby': idTitolo },
    h('div', { class: 'ss-dialogo-testa' }, h('h2', { id: idTitolo, class: 'ss-dialogo-titolo' }, titolo), chiudiB),
    // Contenuto scorrevole raggiungibile da tastiera; role="document" per la lettura continua.
    h('div', { class: 'ss-dialogo-corpo', role: 'document', tabindex: 0 }, contenuto),
  );
  let origine: HTMLElement | null = null;
  /**
   * Focus all'elemento che ha aperto il dialogo o, se non è più visibile, al rifugio; solo se il focus è ancora nel
   * dialogo chiuso o sul body. Con close() il browser riporta il focus all'origine; se l'origine è nascosta il focus
   * resterebbe nel dialogo chiuso e poi passerebbe al body.
   */
  function restituisciFocus(): void {
    const o = origine;
    origine = null;
    const attivo = document.activeElement;
    if (attivo !== null && attivo !== document.body && !elemento.contains(attivo)) return;
    const meta = o !== null && o.isConnected && o.getClientRects().length > 0 ? o : (rifugio?.() ?? null);
    meta?.focus();
  }
  /** Chiusura e focus nello stesso compito: il focus non passa mai per il body (WCAG 2.2, SC 2.4.3). */
  function chiudi(): void {
    if (!elemento.open) return;
    elemento.close();
    restituisciFocus();
  }
  chiudiB.addEventListener('click', chiudi);
  // Esc: il dialogo si chiude qui, prima della chiusura del browser, che non riporterebbe il focus a un'origine nascosta.
  elemento.addEventListener('cancel', (e) => {
    e.preventDefault();
    chiudi();
  });
  // Altre chiusure: l'evento arriva dopo la chiusura.
  elemento.addEventListener('close', restituisciFocus);
  // Clic sullo sfondo: chiude.
  elemento.addEventListener('click', (e) => {
    if (e.target === elemento) chiudi();
  });
  return {
    elemento,
    apri(o) {
      if (elemento.open) return;
      origine = o ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      elemento.showModal();
      chiudiB.focus();
    },
    chiudi,
    get aperto() {
      return elemento.open;
    },
  };
}

/** Contenuto di "Fonti e metodi" (§ 6-9, § 16) con la tabella di accuratezza. */
export function contenutoFontiMetodi(valori: ValoriValidazione): HTMLElement {
  const out = h('div', { class: 'ss-fonti' });
  for (const sez of FONTI_METODI_SEZIONI) {
    out.appendChild(h('h3', { class: 'ss-sottotitolo' }, sez.titolo));
    // Numeri raggruppati con U+2009 senza a capo, come quelli del formattatore (§ 11.13).
    for (const p of sez.paragrafi) out.appendChild(h('p', null, nodoTesto(p)));
  }
  out.appendChild(h('h3', { class: 'ss-sottotitolo' }, T.fonti.accuratezza));
  out.appendChild(
    h(
      'p',
      { class: 'ss-nota' },
      valori.dataValidazione === null ? T.fonti.accuratezzaProgetto : T.fonti.accuratezzaMisurata(valori.dataValidazione),
    ),
  );
  const C = T.fonti.colonneAccuratezza;
  const corpo = h('tbody');
  for (const v of valori.voci) {
    const nomi = VOCI_ACCURATEZZA[v.id];
    corpo.appendChild(
      h(
        'tr',
        null,
        h('th', { scope: 'row' }, nomi.modello),
        h('td', null, nodoTesto(nomi.grandezza)),
        h('td', null, nodoTesto(v.valore ?? T.fonti.daMisurare)),
        h('td', null, nodoTesto(v.soglia)),
      ),
    );
  }
  out.appendChild(
    h(
      'div',
      { class: 'ss-tabella-scorri', role: 'region', 'aria-label': T.fonti.accuratezza, tabindex: 0 },
      h(
        'table',
        { class: 'ss-tabella ss-tabella--accuratezza' },
        h('caption', { class: 'ss-sr' }, T.fonti.accuratezza),
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, C.modello),
            h('th', { scope: 'col' }, C.grandezza),
            h('th', { scope: 'col' }, C.valore),
            h('th', { scope: 'col' }, C.soglia),
          ),
        ),
        corpo,
      ),
    ),
  );
  out.appendChild(h('h3', { class: 'ss-sottotitolo' }, T.fonti.riferimenti));
  const rif = h('ul', { class: 'ss-riferimenti' });
  for (const r of RIFERIMENTI) rif.appendChild(h('li', null, r));
  out.appendChild(rif);
  out.appendChild(h('h3', { class: 'ss-sottotitolo' }, T.fonti.strumenti));
  const str = h('ul', { class: 'ss-riferimenti' });
  for (const r of STRUMENTI) str.appendChild(h('li', null, r));
  out.appendChild(str);
  return out;
}

/** Elenco delle scorciatoie (§ 11.9). */
export function contenutoScorciatoie(store: StoreApp): { elemento: HTMLElement; aggiorna(): void } {
  const avviso = h('p', { class: 'ss-avviso ss-avviso--ambra' }, T.scorciatoie.disattivate);
  const out = h('div', { class: 'ss-scorciatoie' }, avviso);
  const gruppi: readonly ['globali' | 'mappa' | 'regolo', string][] = [
    ['globali', T.scorciatoie.globali],
    ['mappa', T.scorciatoie.mappa],
    ['regolo', T.scorciatoie.regolo],
  ];
  for (const [k, titolo] of gruppi) {
    out.appendChild(h('h3', { class: 'ss-sottotitolo' }, titolo));
    const corpo = h('tbody');
    for (const [tasti, azione] of T.scorciatoie.voci[k]) {
      // Un <kbd> per tasto; congiunzioni, virgole e "+" fuori dal riquadro (HTML, elemento kbd).
      const parti = partiTasti(tasti).map((p) => (typeof p === 'string' ? p : h('kbd', null, p.tasto)));
      corpo.appendChild(h('tr', null, h('th', { scope: 'row' }, ...parti), h('td', null, azione)));
    }
    out.appendChild(
      h(
        'table',
        { class: 'ss-tabella ss-tabella--tasti' },
        h('caption', { class: 'ss-sr' }, titolo),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, T.scorciatoie.tasto), h('th', { scope: 'col' }, T.scorciatoie.azione))),
        corpo,
      ),
    );
  }
  return {
    elemento: out,
    aggiorna() {
      avviso.hidden = store.get().interfaccia.scorciatoie;
    },
  };
}

export interface DipendenzeImpostazioni {
  store: StoreApp;
  annuncia: (t: string) => void;
  apriScorciatoie: () => void;
  mostraBenvenuto: () => void;
  alternaSeguiOra: (v: boolean) => void;
  /** Lingua attuale dell'interfaccia. */
  lingua: Lingua;
  /** Cambio di lingua: salva la scelta e ricarica la pagina mantenendo data, corpo e vista (RF8). */
  cambiaLingua: (l: Lingua) => void;
}

/** Contenuto delle impostazioni: lingua, scorciatoie, riga prolettica, ora attuale, nota di benvenuto. */
export function contenutoImpostazioni(d: DipendenzeImpostazioni): { elemento: HTMLElement; aggiorna(): void } {
  // Lingua: elenco a discesa nativo (tastiera e lettori di schermo senza codice aggiuntivo); etichetta bilingue fissa e
  // ogni opzione nella propria lingua (lang), così chi non legge la lingua attuale la trova comunque.
  const idLingua = nuovoId('lingua');
  const lingua = h(
    'select',
    { id: idLingua, class: 'ss-input ss-input--lingua' },
    h('option', { value: 'it', lang: 'it' }, T.impostazioni.linguaItaliano),
    h('option', { value: 'en', lang: 'en' }, T.impostazioni.linguaInglese),
  );
  lingua.value = d.lingua;
  lingua.addEventListener('change', () => {
    if (eLingua(lingua.value)) d.cambiaLingua(lingua.value);
  });
  const scorciatoie = h('input', { type: 'checkbox', class: 'ss-casella-input' });
  const prolettica = h('input', { type: 'checkbox', class: 'ss-casella-input' });
  const segui = h('input', { type: 'checkbox', class: 'ss-casella-input' });
  const idNotaScorc = nuovoId('nota');
  const idNotaSegui = nuovoId('nota');
  scorciatoie.setAttribute('aria-describedby', idNotaScorc);
  segui.setAttribute('aria-describedby', idNotaSegui);
  scorciatoie.addEventListener('change', () => {
    d.store.aggiorna('interfaccia', { scorciatoie: scorciatoie.checked });
    d.annuncia(T.annunci.scorciatoie(scorciatoie.checked));
  });
  prolettica.addEventListener('change', () => d.store.aggiorna('interfaccia', { rigaProlettica: prolettica.checked }));
  segui.addEventListener('change', () => d.alternaSeguiOra(segui.checked));
  const elencoB = h('button', { type: 'button', class: 'ss-pulsante' }, T.impostazioni.elencoScorciatoie);
  elencoB.addEventListener('click', () => d.apriScorciatoie());
  const benvenutoB = h('button', { type: 'button', class: 'ss-pulsante' }, T.impostazioni.benvenuto);
  benvenutoB.addEventListener('click', () => d.mostraBenvenuto());
  const elemento = h(
    'div',
    { class: 'ss-impostazioni' },
    h('div', { class: 'ss-campo ss-campo--lingua' }, h('label', { class: 'ss-campo-etichetta', for: idLingua }, T.impostazioni.lingua), lingua),
    h('label', { class: 'ss-casella' }, scorciatoie, h('span', { class: 'ss-casella-testo' }, T.impostazioni.scorciatoie)),
    h('p', { class: 'ss-nota', id: idNotaScorc }, T.impostazioni.scorciatoieNota),
    elencoB,
    h('label', { class: 'ss-casella' }, prolettica, h('span', { class: 'ss-casella-testo' }, T.impostazioni.rigaProlettica)),
    h('label', { class: 'ss-casella' }, segui, h('span', { class: 'ss-casella-testo' }, T.impostazioni.segui)),
    h('p', { class: 'ss-nota', id: idNotaSegui }, T.impostazioni.seguiNota),
    benvenutoB,
    h('p', { class: 'ss-nota' }, T.impostazioni.movimento),
  );
  return {
    elemento,
    aggiorna() {
      const s = d.store.get();
      lingua.value = d.lingua;
      scorciatoie.checked = s.interfaccia.scorciatoie;
      prolettica.checked = s.interfaccia.rigaProlettica;
      segui.checked = s.riproduzione.seguiOra;
    },
  };
}
