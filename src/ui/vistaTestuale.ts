// Vista testuale (RF10, § 11.9): tabella ordinabile delle posizioni alla data, alternativa alla
// scena 3D e ripiego senza WebGL2. Aggiornata su pausa, passo o comando, mai in riproduzione.

import type { CorpoCatalogo } from '../data/catalogTypes';
import { CATEGORIE_PER_PRECEDENZA } from '../data/catalogTypes';
import type { Livello } from '../ephem/types';
import { CONFRONTO_NOMI } from './cerca';
import { attributo, h, nuovoId, svuota } from './dom';
import { formatGradiConErrore, misuraDistanza } from './format';
import { icona } from './icone';
import { nodoMisura, nodoTesto } from './nodi';
import { iconaAffidabilita, simbolo } from './simboli';
import { NOMI_CATEGORIE, NOMI_LIVELLI, T } from './testi.it';

export interface RigaTestuale {
  corpo: CorpoCatalogo;
  distanzaSoleKm: number | null;
  distanzaTerraKm: number | null;
  /** Longitudine e latitudine eclittiche J2000 eliocentriche, rad. */
  lon: number | null;
  lat: number | null;
  livello: Livello | null;
  /** Errori stimati (km) della distanza dal Sole e dalla Terra, per le cifre significative (come nella scheda). */
  erroreSoleKm: number | null;
  erroreTerraKm: number | null;
  /** Valori mancanti perché i dati della data non sono ancora caricati (stato 'caricamento'), non perché non esistono. */
  inCaricamento: boolean;
}

/**
 * Colonne che non si applicano al corpo: per il Sole, origine del sistema, distanza dal Sole, coordinate e
 * affidabilità; per la Terra la distanza dalla Terra. Si distinguono dai dati mancanti ("non disponibile").
 */
export function nonApplicabile(corpo: Pick<CorpoCatalogo, 'categoria' | 'slug'>, colonna: ColonnaTestuale): boolean {
  if (corpo.categoria === 'sole') return colonna === 'sole' || colonna === 'coordinate' || colonna === 'affidabilita';
  return corpo.slug === 'terra' && colonna === 'terra';
}

/** Testo di una cella senza valore: non applicabile, dati in caricamento o non disponibili (assenti alla data). */
export function testoSenzaValore(
  corpo: Pick<CorpoCatalogo, 'categoria' | 'slug'>,
  colonna: ColonnaTestuale,
  inCaricamento: boolean,
): string {
  if (nonApplicabile(corpo, colonna)) return T.testuale.nonApplicabile;
  return inCaricamento ? T.testuale.inCaricamento : T.testuale.nonDisponibile;
}

function angolo0_2pi(x: number): number {
  const d = 2 * Math.PI;
  return ((x % d) + d) % d;
}

/**
 * Longitudine e latitudine eclittiche con i decimali dell'errore angolare visto dal Sole (errore della posizione
 * eliocentrica diviso la distanza, come le cifre delle distanze, § 11.13); null senza posizione.
 */
export function testoCoordinate(r: Pick<RigaTestuale, 'lon' | 'lat' | 'distanzaSoleKm' | 'erroreSoleKm'>): string | null {
  if (r.lon === null || r.lat === null) return null;
  const sigma = r.erroreSoleKm === null || r.distanzaSoleKm === null || !(r.distanzaSoleKm > 0) ? Number.POSITIVE_INFINITY : r.erroreSoleKm / r.distanzaSoleKm;
  return T.testuale.coordinate(formatGradiConErrore(r.lon, sigma, 2, true), formatGradiConErrore(r.lat, sigma));
}

export type ColonnaTestuale = 'corpo' | 'categoria' | 'sole' | 'terra' | 'coordinate' | 'affidabilita';
export type Verso = 'ascending' | 'descending';

const ORDINE_LIVELLI: readonly Livello[] = ['precisa', 'buona', 'approssimata', 'indicativa', 'non-determinabile'];

function confrontaNumeri(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** Ordinamento stabile delle righe; i valori mancanti vanno in fondo in entrambi i versi. */
export function ordinaRighe(righe: readonly RigaTestuale[], colonna: ColonnaTestuale, verso: Verso): RigaTestuale[] {
  const segno = verso === 'ascending' ? 1 : -1;
  const nome = (r: RigaTestuale) => r.corpo.nome;
  const cmp = (a: RigaTestuale, b: RigaTestuale): number => {
    switch (colonna) {
      case 'corpo':
        return segno * CONFRONTO_NOMI.compare(nome(a), nome(b));
      case 'categoria':
        return (
          segno * (CATEGORIE_PER_PRECEDENZA.indexOf(a.corpo.categoria) - CATEGORIE_PER_PRECEDENZA.indexOf(b.corpo.categoria))
        );
      case 'sole':
      case 'terra':
      case 'coordinate': {
        // Longitudine nell'intervallo mostrato, [0°, 360°).
        const lon = (r: RigaTestuale) => (r.lon === null ? null : angolo0_2pi(r.lon));
        const va = colonna === 'sole' ? a.distanzaSoleKm : colonna === 'terra' ? a.distanzaTerraKm : lon(a);
        const vb = colonna === 'sole' ? b.distanzaSoleKm : colonna === 'terra' ? b.distanzaTerraKm : lon(b);
        if (va === null || vb === null) return confrontaNumeri(va, vb);
        return segno * (va - vb);
      }
      case 'affidabilita': {
        const la = a.livello === null ? 99 : ORDINE_LIVELLI.indexOf(a.livello);
        const lb = b.livello === null ? 99 : ORDINE_LIVELLI.indexOf(b.livello);
        if (la === 99 || lb === 99) return la - lb;
        return segno * (la - lb);
      }
    }
  };
  return righe
    .map((r, i) => ({ r, i }))
    .sort((x, y) => cmp(x.r, y.r) || x.i - y.i)
    .map((x) => x.r);
}

export interface DipendenzeVistaTestuale {
  seleziona: (c: CorpoCatalogo) => void;
  chiudi: () => void;
  aggiorna: () => void;
}

export interface VistaTestuale {
  elemento: HTMLElement;
  imposta(righe: readonly RigaTestuale[], didascalia: string, conteggio: string, ferma: boolean): void;
  /** Senza WebGL2 la vista non si chiude. */
  impostaObbligatoria(v: boolean): void;
  /** Inserisce un nodo (i messaggi in pagina) tra la testata e la tabella: senza WebGL2 la vista è l'unica vista. */
  ospita(nodo: Node): void;
  /**
   * Tabella coperta dal foglio esteso del telefono (§ 11.9): intestazioni e righe, ridotte a pochi pixel, escono
   * dall'ordine di Tab e dall'albero di accessibilità; il focus che contenevano passa a `rifugio`, senza cadere sul body.
   */
  copri(v: boolean, rifugio: HTMLElement): void;
  focus(): void;
}

const COLONNE: readonly ColonnaTestuale[] = ['corpo', 'categoria', 'sole', 'terra', 'coordinate', 'affidabilita'];

export function creaVistaTestuale(d: DipendenzeVistaTestuale): VistaTestuale {
  const idTitolo = nuovoId('testuale-t');
  let colonna: ColonnaTestuale = 'corpo';
  let verso: Verso = 'ascending';
  let righe: readonly RigaTestuale[] = [];
  // Ordine iniziale: quello del catalogo.
  let ordinata = false;

  const didascalia = h('caption', { class: 'ss-tabella-didascalia' });
  const intestazioni = new Map<ColonnaTestuale, HTMLTableCellElement>();
  const riga = h('tr');
  for (const c of COLONNE) {
    const nome = T.testuale.colonne[c];
    const b = h('button', { type: 'button', class: 'ss-ordina' }, h('span', null, nome), icona('giu', 'ss-icona ss-ordina-icona'));
    b.addEventListener('click', () => {
      if (ordinata && colonna === c) verso = verso === 'ascending' ? 'descending' : 'ascending';
      else {
        colonna = c;
        verso = 'ascending';
      }
      ordinata = true;
      disegna();
    });
    const th = h('th', { scope: 'col', class: `ss-col-${c}` }, b);
    intestazioni.set(c, th);
    riga.appendChild(th);
  }
  const corpoTabella = h('tbody');
  const tabella = h('table', { class: 'ss-tabella' }, didascalia, h('thead', null, riga), corpoTabella);
  const contenitore = h(
    'div',
    { class: 'ss-tabella-scorri', role: 'region', 'aria-label': T.testuale.regione, tabindex: 0 },
    tabella,
  );
  const conteggio = h('p', { class: 'ss-tabella-conteggio' });
  const nota = h('p', { class: 'ss-nota ss-tabella-nota' }, T.testuale.nonAggiornata);
  nota.hidden = true;
  const aggiorna = h('button', { type: 'button', class: 'ss-pulsante' }, icona('aggiorna'), h('span', null, T.testuale.aggiorna));
  aggiorna.addEventListener('click', () => d.aggiorna());
  const chiudi = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-label': T.testuale.chiudi, title: T.testuale.chiudi },
    icona('chiudi'),
  );
  chiudi.addEventListener('click', () => d.chiudi());

  const testa = h(
    'div',
    { class: 'ss-pannello-testa' },
    h('h2', { id: idTitolo, class: 'ss-pannello-titolo' }, T.testuale.titolo),
    h('div', { class: 'ss-pannello-azioni' }, aggiorna, chiudi),
  );
  const elemento = h(
    'section',
    { class: 'ss-pannello ss-testuale', 'aria-labelledby': idTitolo, tabindex: -1 },
    testa,
    h('div', { class: 'ss-testuale-info' }, conteggio, nota),
    contenitore,
  );

  function cella(contenuto: Node | string | null, classe: string, r: RigaTestuale, colonna: ColonnaTestuale): HTMLTableCellElement {
    return h('td', { class: classe }, contenuto ?? testoSenzaValore(r.corpo, colonna, r.inCaricamento));
  }

  function disegna(): void {
    for (const [c, th] of intestazioni) {
      attributo(th, 'aria-sort', ordinata && c === colonna ? verso : null);
      th.classList.toggle('ss-ordinata', ordinata && c === colonna);
      th.classList.toggle('ss-ordinata--disc', ordinata && c === colonna && verso === 'descending');
    }
    // Il ridisegno ricrea i pulsanti: il focus torna sul pulsante dello stesso corpo (WCAG 2.4.3), o sulla tabella.
    const attivo = document.activeElement;
    const slugFocus = attivo instanceof HTMLElement && corpoTabella.contains(attivo) ? (attivo.dataset['slug'] ?? '') : null;
    svuota(corpoTabella);
    const elenco = ordinata ? ordinaRighe(righe, colonna, verso) : righe;
    let daFocalizzare: HTMLElement | null = slugFocus === null ? null : contenitore;
    for (const r of elenco) {
      const nome = h(
        'button',
        { type: 'button', class: 'ss-tabella-corpo', 'data-slug': r.corpo.slug },
        simbolo(r.corpo.categoria),
        h('span', null, r.corpo.nome),
      );
      if (slugFocus === r.corpo.slug) daFocalizzare = nome;
      nome.addEventListener('click', () => d.seleziona(r.corpo));
      const relativo = (err: number | null, d: number) => (err === null || !(d > 0) ? undefined : err / d);
      const sole =
        r.distanzaSoleKm === null
          ? null
          : nodoMisura(misuraDistanza(r.distanzaSoleKm, { erroreRelativo: relativo(r.erroreSoleKm, r.distanzaSoleKm) }));
      const terra =
        r.distanzaTerraKm === null
          ? null
          : nodoMisura(misuraDistanza(r.distanzaTerraKm, { erroreRelativo: relativo(r.erroreTerraKm, r.distanzaTerraKm) }));
      const testoCoord = testoCoordinate(r);
      const coord = testoCoord === null ? null : h('span', { class: 'ss-num' }, testoCoord);
      const aff =
        r.livello === null
          ? null
          : h('span', { class: `ss-aff ss-aff--${r.livello}` }, iconaAffidabilita(r.livello), h('span', null, NOMI_LIVELLI[r.livello]));
      corpoTabella.appendChild(
        h(
          'tr',
          null,
          h('th', { scope: 'row', class: 'ss-col-corpo' }, nome),
          h('td', { class: 'ss-col-categoria' }, nodoTesto(NOMI_CATEGORIE[r.corpo.categoria])),
          cella(sole, 'ss-col-sole ss-destra', r, 'sole'),
          cella(terra, 'ss-col-terra ss-destra', r, 'terra'),
          cella(coord, 'ss-col-coordinate', r, 'coordinate'),
          cella(aff, 'ss-col-affidabilita', r, 'affidabilita'),
        ),
      );
    }
    daFocalizzare?.focus();
  }

  return {
    elemento,
    imposta(r, testoDidascalia, testoConteggio, ferma) {
      nota.hidden = !ferma;
      if (ferma) return;
      righe = r;
      didascalia.textContent = testoDidascalia;
      conteggio.textContent = testoConteggio;
      disegna();
    },
    impostaObbligatoria(v) {
      chiudi.hidden = v;
    },
    ospita(nodo) {
      testa.after(nodo);
    },
    copri(v, rifugio) {
      if (contenitore.inert === v) return;
      if (v && contenitore.contains(document.activeElement)) rifugio.focus({ preventScroll: true });
      contenitore.inert = v;
    },
    focus() {
      elemento.focus();
    },
  };
}
