// Regolo logaritmico delle distanze con preset (§ 11.3), pulsanti +, − e Inquadra (alternativa
// ai gesti, WCAG 2.5.7), barra di scala e legenda permanente (R14, § 11.5.1).

import { attributo, h, nuovoId } from './dom';
import { icona } from './icone';
import { aggiornaMisura, nodoTesto } from './nodi';
import { creaDisclosure } from './popover';
import type { Disclosure } from './popover';
import type { PresetVista } from './scala';
import {
  LOG_AMPIEZZA_MAX,
  LOG_AMPIEZZA_MIN,
  PRESET_VISTA,
  TACCHE_DISTANZE,
  ampiezzaDaFrazione,
  barraScala,
  etichettaAmpiezza,
  frazioneDaAmpiezza,
} from './scala';
import type { StatoVista } from './contrattoScena';
import { formatAmpiezza } from './format';
import { NOMI_PRESET, T } from './testi.it';

export interface DipendenzeDistanze {
  /** Imposta l'ampiezza della vista (km) alla distanza del corpo a fuoco. */
  impostaAmpiezza: (km: number) => void;
  zoom: (fattore: number) => void;
  inquadra: () => void;
  preset: (p: PresetVista) => void;
  annuncia: (t: string) => void;
}

export interface ComandiDistanze {
  /** Colonna sul bordo sinistro (desktop e tablet). */
  colonna: HTMLElement;
  /** Pulsanti +, −, Inquadra per il telefono. */
  zoomMobile: HTMLElement;
  /** Barra di scala e legenda permanente. */
  legenda: HTMLElement;
  /** Elenco dei preset per il menu Vista del telefono. */
  creaElencoPreset(dopo?: () => void): HTMLElement;
  /** Menu Viste aperto ricollocato dopo un cambio di finestra, di console o di disposizione dei pulsanti. */
  collocaPreset(): void;
  aggiorna(v: StatoVista | null, barraVisibile: boolean): void;
  /** Zoom con annuncio dell'ampiezza e del limite, come i pulsanti + e − (tasti della mappa, § 11.9). */
  zoom(fattore: number): void;
  disclosurePreset: Disclosure;
}

/** Valore massimo dello slider delle distanze: livello di avvicinamento a 10³ km (0 alla vista più ampia). */
const LIVELLO_MAX = LOG_AMPIEZZA_MAX - LOG_AMPIEZZA_MIN;

/** Fattore dell'ampiezza della vista per un clic su − (allontana); + usa l'inverso. */
const FATTORE_ZOOM_PULSANTE = 10;
/** Variazione del logaritmo dell'ampiezza per Su, Giù, Destra e Sinistra sul regolo (un decimo di decade). */
const PASSO_SLIDER = 0.1;
/** Attesa del ridisegno della vista prima dell'annuncio, ms. */
const ATTESA_ZOOM_MS = 300;

function pulsanteIcona(nome: Parameters<typeof icona>[0], etichetta: string, classe = ''): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `ss-pulsante ss-pulsante--icona ${classe}`.trim(), 'aria-label': etichetta, title: etichetta },
    icona(nome),
  );
}

export function creaDistanze(d: DipendenzeDistanze): ComandiDistanze {
  // --- Regolo verticale ---
  // 10³ km in alto, accanto ad Avvicina (+), e 2·10⁵ UA in basso, accanto ad Allontana (−): il valore dello slider è il
  // livello di avvicinamento, così FrecciaSu e PagSu avvicinano come sulla mappa (§ 11.3, § 11.9) e Su aumenta il valore
  // (APG, slider). La frazione f di scala.ts (0 a 10³ km) è la distanza dall'alto.
  const pollice = h('span', { class: 'ss-distanze-pollice', 'aria-hidden': 'true' });
  const traccia = h('span', { class: 'ss-distanze-traccia', 'aria-hidden': 'true' }, pollice);
  const tacche = h('span', { class: 'ss-distanze-tacche', 'aria-hidden': 'true' });
  for (const km of TACCHE_DISTANZE) {
    const f = frazioneDaAmpiezza(km);
    tacche.appendChild(h('span', { class: 'ss-distanze-tacca', style: `top: ${(f * 100).toFixed(2)}%` }, nodoTesto(etichettaAmpiezza(km))));
  }
  for (const p of PRESET_VISTA) {
    const f = frazioneDaAmpiezza(p.ampiezzaKm);
    traccia.appendChild(h('span', { class: 'ss-distanze-preset', style: `top: ${(f * 100).toFixed(2)}%` }));
  }
  const slider = h(
    'div',
    {
      class: 'ss-distanze-slider',
      role: 'slider',
      tabindex: 0,
      'aria-orientation': 'vertical',
      'aria-label': T.distanze.regolo,
      'aria-valuemin': formatNum(0),
      'aria-valuemax': formatNum(LIVELLO_MAX),
      'aria-valuenow': formatNum(0),
    },
    traccia,
    tacche,
  );

  let logCorrente = LOG_AMPIEZZA_MIN;
  // Pulsanti della colonna e del telefono, creati qui perché lo stato del limite vale per entrambe le serie.
  const piuM = pulsanteIcona('piu', T.distanze.avvicina);
  const menoM = pulsanteIcona('meno', T.distanze.allontana);
  const inquadraM = pulsanteIcona('inquadra', T.distanze.inquadraEsteso);
  const piu = pulsanteIcona('piu', T.distanze.avvicina);
  const meno = pulsanteIcona('meno', T.distanze.allontana);
  const inquadra = pulsanteIcona('inquadra', T.distanze.inquadraEsteso);

  // Riscontro di ogni variazione della vista (§ 11.3, § 11.9; per i passi § 11.4.3): dopo il ridisegno si annuncia
  // l'ampiezza ottenuta, non quella richiesta, e se la vista si è fermata prima si aggiunge il limite raggiunto, con
  // aria-disabled su + e −. Vale per i pulsanti, i tasti della mappa e lo slider (tastiera e puntatore).
  let limite: 'minimo' | 'massimo' | null = null;
  let attesaZoom: number | null = null;
  /** Ampiezza (logaritmo) prima della prima variazione in attesa di riscontro. */
  let primaDellaSerie = logCorrente;
  function aggiornaLimiti(): void {
    for (const b of [piu, piuM]) attributo(b, 'aria-disabled', limite === 'minimo' ? 'true' : null);
    for (const b of [meno, menoM]) attributo(b, 'aria-disabled', limite === 'massimo' ? 'true' : null);
  }
  /**
   * `prima` è l'ampiezza (logaritmo) prima della variazione; `fermata` è valutata dopo il ridisegno e dice quale limite
   * ha fermato la vista, se uno l'ha fermata. Variazioni ravvicinate (tasto tenuto premuto) hanno un solo riscontro.
   */
  function riscontroDopoRidisegno(prima: number, fermata: () => 'minimo' | 'massimo' | null): void {
    if (attesaZoom !== null) window.clearTimeout(attesaZoom);
    else primaDellaSerie = prima;
    attesaZoom = window.setTimeout(() => {
      attesaZoom = null;
      limite = fermata();
      aggiornaLimiti();
      const testo = T.distanze.valore(formatAmpiezza(10 ** logCorrente));
      if (limite === null) {
        d.annuncia(testo);
        return;
      }
      const msg = limite === 'minimo' ? T.distanze.limiteMinimo : T.distanze.limiteMassimo;
      d.annuncia(Math.abs(logCorrente - primaDellaSerie) > 1e-9 ? `${testo}. ${msg}` : msg);
    }, ATTESA_ZOOM_MS);
  }
  function zoomDaPulsante(fattore: number): void {
    const prima = logCorrente;
    d.zoom(fattore);
    riscontroDopoRidisegno(prima, () => {
      const atteso = Math.log10(fattore);
      const fermo = Math.abs(logCorrente - prima) < Math.abs(atteso) * 0.99;
      return fermo ? (fattore < 1 ? 'minimo' : 'massimo') : null;
    });
  }

  /**
   * Home e Fine portano l'ampiezza all'estremo del regolo (vista più ampia, 10³ km) senza muoverla contro il verso
   * richiesto: sotto 10³ km, dopo uno zoom su un corpo piccolo, Fine non allontana. L'estremo è il bersaglio, quindi
   * il limite si dichiara comunque; l'ampiezza annunciata è quella ottenuta (quota minima sul corpo a fuoco, § 10.3).
   */
  function vaiAllEstremo(verso: 'minimo' | 'massimo'): void {
    const prima = logCorrente;
    const inviato = verso === 'minimo' ? Math.min(prima, LOG_AMPIEZZA_MIN) : Math.max(prima, LOG_AMPIEZZA_MAX);
    d.impostaAmpiezza(10 ** inviato);
    riscontroDopoRidisegno(prima, () => verso);
  }
  // Su, Destra e PagSu avvicinano, Giù, Sinistra e PagGiù allontanano, come i pulsanti e i tasti della mappa: stesso
  // zoom (relativo alla vista, quindi senza i valori di una vista non ancora ridisegnata) e stesso riscontro.
  slider.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        zoomDaPulsante(10 ** -PASSO_SLIDER);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        zoomDaPulsante(10 ** PASSO_SLIDER);
        break;
      case 'PageUp':
        zoomDaPulsante(1 / FATTORE_ZOOM_PULSANTE);
        break;
      case 'PageDown':
        zoomDaPulsante(FATTORE_ZOOM_PULSANTE);
        break;
      case 'Home':
        vaiAllEstremo('massimo');
        break;
      case 'End':
        vaiAllEstremo('minimo');
        break;
      default:
        return;
    }
    e.preventDefault();
  });
  let trascina: number | null = null;
  /** Ultima ampiezza richiesta con il puntatore (logaritmo) e ampiezza al suo inizio. */
  let richiestoPuntatore = logCorrente;
  let primaPuntatore = logCorrente;
  function daPuntatore(e: PointerEvent): void {
    const r = traccia.getBoundingClientRect();
    if (r.height <= 0) return;
    const f = (e.clientY - r.top) / r.height;
    const km = ampiezzaDaFrazione(f);
    richiestoPuntatore = Math.log10(km);
    d.impostaAmpiezza(km);
  }
  slider.addEventListener('pointerdown', (e) => {
    trascina = e.pointerId;
    slider.setPointerCapture(e.pointerId);
    slider.focus();
    primaPuntatore = logCorrente;
    daPuntatore(e);
  });
  slider.addEventListener('pointermove', (e) => {
    if (trascina === e.pointerId) daPuntatore(e);
  });
  // Al rilascio: ampiezza ottenuta e, se la vista si è fermata prima del punto indicato, il limite raggiunto.
  const fine = (e: PointerEvent) => {
    if (trascina !== e.pointerId) return;
    trascina = null;
    const richiesto = richiestoPuntatore;
    riscontroDopoRidisegno(primaPuntatore, () => {
      const fermo = Math.abs(logCorrente - richiesto) > 0.01;
      return fermo ? (richiesto < logCorrente ? 'minimo' : 'massimo') : null;
    });
  };
  slider.addEventListener('pointerup', fine);
  slider.addEventListener('pointercancel', fine);

  piu.addEventListener('click', () => zoomDaPulsante(1 / FATTORE_ZOOM_PULSANTE));
  meno.addEventListener('click', () => zoomDaPulsante(FATTORE_ZOOM_PULSANTE));
  inquadra.addEventListener('click', () => d.inquadra());

  function elencoPreset(dopo?: () => void): HTMLElement {
    const ul = h('ul', { class: 'ss-preset-lista' });
    for (const p of PRESET_VISTA) {
      const b = h(
        'button',
        { type: 'button', class: 'ss-preset-voce' },
        h('span', { class: 'ss-preset-nome' }, NOMI_PRESET[p.id]),
        h('span', { class: 'ss-preset-ampiezza' }, nodoTesto(formatAmpiezza(p.ampiezzaKm))),
      );
      b.addEventListener('click', () => {
        d.preset(p);
        d.annuncia(T.annunci.preset(NOMI_PRESET[p.id]));
        dopo?.();
      });
      ul.appendChild(h('li', null, b));
    }
    return ul;
  }

  const pulsantePreset = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-label': T.distanze.presetEsteso, title: T.distanze.presetEsteso },
    icona('vista'),
  );
  const idPreset = nuovoId('preset');
  const pannelloPreset = h(
    'div',
    { class: 'ss-popover ss-preset', id: idPreset, role: 'group', 'aria-label': T.distanze.presetEsteso },
    h('h2', { class: 'ss-pannello-titolo' }, T.distanze.preset),
  );
  const disclosurePreset = creaDisclosure(pulsantePreset, pannelloPreset, {
    // Ogni apertura parte dalla prima voce, nella posizione calcolata per la finestra di quel momento.
    onCambio: (aperto) => {
      if (!aperto) return;
      pannelloPreset.scrollTop = 0;
      collocaPreset();
    },
    chiudiFocusFuori: true,
  });
  const listaPreset = elencoPreset(() => disclosurePreset.chiudi(true));
  listaPreset.style.setProperty('--ss-preset-righe', String(Math.ceil(PRESET_VISTA.length / 2)));
  pannelloPreset.appendChild(listaPreset);

  /**
   * Menu Viste interamente nella finestra, sotto la barra superiore (limiti in scroll-margin, stile.css), con tutte le
   * voci visibili senza scorrere (§ 11.3): una colonna se entra nello spazio disponibile (con i pulsanti in riga, sotto
   * la riga; altrimenti tra la barra e il margine inferiore, anche sopra la console), altrimenti due; poi lo spostamento
   * minimo che lo porta dentro i limiti. Con i pulsanti nascosti (telefono, orizzontale) non fa nulla.
   */
  function collocaPreset(): void {
    const p = pannelloPreset;
    p.style.removeProperty('transform');
    delete p.dataset['colonne'];
    if (!disclosurePreset.aperto) return;
    let r = p.getBoundingClientRect();
    if (r.height === 0) return;
    const cs = getComputedStyle(p);
    const cima = Number.parseFloat(cs.scrollMarginTop) || 0;
    const fondo = window.innerHeight - (Number.parseFloat(cs.scrollMarginBottom) || 0);
    const sinistra = Number.parseFloat(cs.scrollMarginLeft) || 0;
    const destra = window.innerWidth - (Number.parseFloat(cs.scrollMarginRight) || 0);
    const bordi = r.height - p.clientHeight;
    // Sotto la riga dei pulsanti il menu non sale: coprirebbe la riga. Accanto alla colonna può salire fino alla barra.
    const inRiga = colonna.closest('[data-distanze]')?.getAttribute('data-distanze') === 'riga';
    if (p.scrollHeight + bordi > (inRiga ? fondo - r.top : fondo - cima) + 0.5) {
      p.dataset['colonne'] = '2';
      r = p.getBoundingClientRect();
    }
    const dy = r.top < cima ? cima - r.top : r.bottom > fondo ? Math.max(cima - r.top, fondo - r.bottom) : 0;
    const dx = r.left < sinistra ? sinistra - r.left : r.right > destra ? Math.max(sinistra - r.left, destra - r.right) : 0;
    if (dx !== 0 || dy !== 0) p.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  const idTitolo = nuovoId('distanze-t');
  const colonna = h(
    'div',
    { class: 'ss-distanze', role: 'group', 'aria-labelledby': idTitolo },
    h('span', { id: idTitolo, class: 'ss-sr' }, T.distanze.titolo),
    piu,
    slider,
    meno,
    inquadra,
    h('div', { class: 'ss-preset-ancora' }, pulsantePreset, pannelloPreset),
  );

  piuM.addEventListener('click', () => zoomDaPulsante(1 / FATTORE_ZOOM_PULSANTE));
  menoM.addEventListener('click', () => zoomDaPulsante(FATTORE_ZOOM_PULSANTE));
  inquadraM.addEventListener('click', () => d.inquadra());
  const zoomMobile = h('div', { class: 'ss-zoom-mobile', role: 'group', 'aria-label': T.distanze.titolo }, piuM, menoM, inquadraM);

  // --- Barra di scala e legenda ---
  const linea = h('span', { class: 'ss-barra-linea', 'aria-hidden': 'true' });
  const valore = h('span', { class: 'ss-barra-valore' });
  const barra = h(
    'p',
    { class: 'ss-barra-scala' },
    linea,
    valore,
    h('span', { class: 'ss-barra-didascalia' }, T.legenda.barraScalaDidascalia),
  );
  const legenda = h('div', { class: 'ss-legenda' }, barra, h('p', { class: 'ss-legenda-frase' }, T.legenda.scala));

  return {
    colonna,
    zoomMobile,
    legenda,
    creaElencoPreset: elencoPreset,
    collocaPreset,
    disclosurePreset,
    zoom: zoomDaPulsante,
    aggiorna(v, barraVisibile) {
      if (v === null) {
        barra.hidden = true;
        return;
      }
      const ampiezza = v.ampiezzaKm;
      const nuovo = Math.log10(Math.max(ampiezza, 1e-9));
      // Vista cambiata da un altro comando: il limite raggiunto non vale più.
      if (limite !== null && attesaZoom === null && Math.abs(nuovo - logCorrente) > 1e-6) {
        limite = null;
        aggiornaLimiti();
      }
      logCorrente = nuovo;
      const f = frazioneDaAmpiezza(ampiezza);
      slider.style.setProperty('--f', f.toFixed(4));
      attributo(slider, 'aria-valuenow', formatNum(LOG_AMPIEZZA_MAX - Math.min(LOG_AMPIEZZA_MAX, Math.max(LOG_AMPIEZZA_MIN, logCorrente))));
      attributo(slider, 'aria-valuetext', T.distanze.valore(formatAmpiezza(ampiezza)));
      const b = barraScala(v.kmPerPixel, 120);
      barra.hidden = !barraVisibile || b === null;
      if (b) {
        linea.style.width = `${Math.max(8, b.px).toFixed(1)}px`;
        aggiornaMisura(valore, { valore: b.valore, unita: b.unita, approssimato: false });
      }
    },
  };
}

function formatNum(x: number): string {
  return x.toFixed(3);
}
