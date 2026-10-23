// Messaggi in pagina (§ 11.11, § 11.12): barra di caricamento, errori con "Riprova", avvisi
// chiudibili e nota di benvenuto non modale, intera o ridotta a un comando che ne apre il testo.
// Gli errori bloccanti usano role="alert"; gli altri sono annunciati dalla live region unica.

import type { OpzioniAnnuncio } from './annunci';
import { h, testo } from './dom';
import { icona } from './icone';
import { T } from './testi.it';

export interface ErroreInterfaccia {
  /** Identificatore per rimuovere o sostituire il messaggio (es. "blocco:planets/p11.bin"). */
  id: string;
  testo: string;
  /** Errore bloccante (role="alert"), ad esempio WebGL2 assente. */
  bloccante?: boolean;
  /** Azione "Riprova". */
  riprova?: () => void;
  /** Errore prodotto dal tempo (caricamento dei dati per l'istante raggiunto): in riproduzione non si annuncia. */
  dalTempo?: boolean;
}

export interface Avvisi {
  elemento: HTMLElement;
  benvenuto: HTMLElement;
  impostaCaricamento(testo: string | null): void;
  mostraErrore(e: ErroreInterfaccia): void;
  rimuoviErrore(id: string): void;
  /** Avviso informativo chiudibile; `annuncio` è il testo della live region se diverso da quello in pagina. */
  notifica(id: string, testo: string, annuncio?: string): void;
  /** Nota visibile o no; `ridotta`: al posto del testo il comando che lo apre in un dialogo (poco spazio, § 11.3). */
  mostraBenvenuto(v: boolean, ridotta?: boolean): void;
  /** Focus sulla nota di benvenuto, se visibile. */
  focusBenvenuto(): void;
}

/**
 * `concludi` riceve il testo di caricamento annunciato quando il caricamento finisce, perché la live region non
 * resti su uno stato superato. `rifugio` indica l'elemento stabile che riceve il focus quando sparisce il messaggio
 * che lo conteneva (WCAG 2.4.3): chiusura, "Riprova", nota di benvenuto. `leggiBenvenuto` apre il testo della nota
 * ridotta; riceve il comando, a cui torna il focus.
 */
export function creaAvvisi(
  annuncia: (t: string, o?: OpzioniAnnuncio) => void,
  chiudiBenvenuto: () => void,
  concludi?: (testo: string) => void,
  rifugio?: () => HTMLElement | null,
  leggiBenvenuto?: (origine: HTMLElement) => void,
): Avvisi {
  const testoCaricamento = h('span', { class: 'ss-caricamento-testo' });
  const caricamento = h(
    'div',
    { class: 'ss-caricamento' },
    h('span', { class: 'ss-caricamento-barra', 'aria-hidden': 'true' }, h('span', { class: 'ss-caricamento-moto' })),
    testoCaricamento,
  );
  caricamento.hidden = true;
  const bloccanti = h('div', { class: 'ss-avvisi-bloccanti', role: 'alert' });
  const elenco = h('div', { class: 'ss-avvisi-elenco' });
  const elemento = h('div', { class: 'ss-avvisi' }, caricamento, bloccanti, elenco);

  const chiudiB = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-label': T.messaggi.chiudiBenvenuto, title: T.messaggi.chiudiBenvenuto },
    icona('chiudi'),
  );
  chiudiB.addEventListener('click', () => chiudiBenvenuto());
  const testoB = h('div', { class: 'ss-benvenuto-testo' }, ...T.messaggi.benvenuto.map((r) => h('p', null, r)));
  const leggiB = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-benvenuto-leggi', 'aria-haspopup': 'dialog' },
    icona('informazioni'),
    h('span', null, T.messaggi.leggiBenvenuto),
  );
  leggiB.hidden = true;
  leggiB.addEventListener('click', () => leggiBenvenuto?.(leggiB));
  const benvenuto = h(
    'section',
    { class: 'ss-benvenuto', 'aria-label': T.messaggi.benvenutoTitolo, tabindex: -1, 'data-forma': 'intera' },
    testoB,
    leggiB,
    chiudiB,
  );
  benvenuto.hidden = true;

  const voci = new Map<string, HTMLElement>();
  let caricamentoAnnunciato: string | null = null;
  // "Riprova" premuto da qui: se lo stesso messaggio torna e il focus è ancora sul rifugio, passa al nuovo "Riprova".
  let riprovaInCorso: { id: string; rifugio: HTMLElement } | null = null;

  /** Sposta il focus sul rifugio se `el`, che sta per sparire, lo contiene; restituisce il rifugio usato. */
  function salvaFocus(el: Element): HTMLElement | null {
    const attivo = document.activeElement;
    if (attivo === null || !el.contains(attivo)) return null;
    const r = rifugio?.() ?? null;
    if (r === null || !r.isConnected) return null;
    r.focus();
    return r;
  }

  function rimuovi(id: string): void {
    const el = voci.get(id);
    if (el) {
      salvaFocus(el);
      el.remove();
    }
    voci.delete(id);
  }

  return {
    elemento,
    benvenuto,
    impostaCaricamento(t) {
      caricamento.hidden = t === null;
      if (t !== null) {
        testo(testoCaricamento, t);
        // Il caricamento segue l'avanzare del tempo: in riproduzione la barra è visibile, ma non si annuncia.
        annuncia(t, { dalTempo: true });
        caricamentoAnnunciato = t;
      } else if (caricamentoAnnunciato !== null) {
        const c = caricamentoAnnunciato;
        caricamentoAnnunciato = null;
        concludi?.(c);
      }
    },
    mostraErrore(e) {
      // Messaggio sostituito con il focus dentro: il focus passa al nuovo messaggio.
      const prec = voci.get(e.id);
      const focusNelPrecedente = prec !== undefined && document.activeElement !== null && prec.contains(document.activeElement);
      rimuovi(e.id);
      const parti: (Node | null)[] = [icona('avviso'), h('span', { class: 'ss-avviso-testo' }, e.testo)];
      if (e.riprova) {
        const b = h('button', { type: 'button', class: 'ss-pulsante' }, icona('aggiorna'), h('span', null, T.messaggi.riprova));
        const riprova = e.riprova;
        b.addEventListener('click', () => {
          const el = voci.get(e.id);
          const r = el ? salvaFocus(el) : null;
          riprovaInCorso = r === null ? null : { id: e.id, rifugio: r };
          rimuovi(e.id);
          riprova();
        });
        parti.push(b);
      }
      const el = h('div', { class: 'ss-avviso ss-avviso--errore' }, ...parti);
      voci.set(e.id, el);
      if (e.bloccante) bloccanti.appendChild(el);
      else {
        elenco.appendChild(el);
        annuncia(e.testo, { dalTempo: e.dalTempo === true });
      }
      // Nuovo tentativo fallito: il focus torna sul nuovo "Riprova" se nel frattempo non è stato spostato.
      const attesa = riprovaInCorso;
      const daRiprova = attesa !== null && attesa.id === e.id;
      if (daRiprova) riprovaInCorso = null;
      if (focusNelPrecedente || (daRiprova && document.activeElement === attesa.rifugio)) el.querySelector('button')?.focus();
    },
    rimuoviErrore: rimuovi,
    notifica(id, t, testoAnnuncio) {
      const prec = voci.get(id);
      const focusNelPrecedente = prec !== undefined && document.activeElement !== null && prec.contains(document.activeElement);
      rimuovi(id);
      const chiudi = h(
        'button',
        { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-label': T.messaggi.chiudiMessaggio, title: T.messaggi.chiudiMessaggio },
        icona('chiudi'),
      );
      const el = h('div', { class: 'ss-avviso ss-avviso--info' }, h('span', { class: 'ss-avviso-testo' }, t), chiudi);
      chiudi.addEventListener('click', () => rimuovi(id));
      voci.set(id, el);
      elenco.appendChild(el);
      annuncia(testoAnnuncio ?? t);
      if (focusNelPrecedente) chiudi.focus();
    },
    mostraBenvenuto(v, ridotta = false) {
      if (!v && !benvenuto.hidden) salvaFocus(benvenuto);
      if (v && (benvenuto.dataset['forma'] === 'ridotta') !== ridotta) {
        // Il comando con il focus sparisce con la nota intera: il focus resta sulla nota.
        if (!ridotta && leggiB.contains(document.activeElement)) benvenuto.focus();
        testoB.hidden = ridotta;
        leggiB.hidden = !ridotta;
        benvenuto.dataset['forma'] = ridotta ? 'ridotta' : 'intera';
      }
      benvenuto.hidden = !v;
    },
    focusBenvenuto() {
      if (!benvenuto.hidden) benvenuto.focus();
    },
  };
}
