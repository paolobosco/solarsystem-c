// Regolo temporale a due livelli (§ 11.4.3): barra panoramica con fasce di affidabilità e
// finestra del regolo inferiore; regolo a scala variabile con ago centrale fisso, trascinamento,
// pizzico o Ctrl+rotella per la scala, ruolo slider con aria-valuetext leggibile.

import type { StoreApp } from '../app/store';
import type { Livello } from '../ephem/types';
import { JD_MAX_UT_EXCL, JD_MIN_UT } from '../time/calendar';
import type { UnitaPasso } from '../time/steps';
import { attributo, h, nuovoId, s, svuota } from './dom';
import { icona } from './icone';
import {
  AMPIEZZA_MAX,
  AMPIEZZA_MIN,
  AMPIEZZA_PREDEFINITA,
  deltaTrascinamento,
  etichettaIntera,
  etichetteSenzaCollisioni,
  frazionePanoramica,
  jdDaFrazionePanoramica,
  larghezzaEtichetta,
  limitaAmpiezza,
  tacche,
  tacchePanoramica,
  testoAmpiezza,
  unitaSuperiore,
  xDaJd,
} from './regoloLogica';
import type { LimitiScala } from './riproduzione';
import { formatIntero } from './format';
import { testoBande, titoloBanda } from './messaggi';
import { BARRE_LIVELLO } from './simboli';
import { T, UNITA, testoTasti } from './testi';

export interface BandaAffidabilita {
  jd0: number;
  jd1: number;
  livello: Livello;
}

export interface DipendenzeRegolo {
  store: StoreApp;
  limiti: () => LimitiScala;
  /** Offset effettivo in minuti per l'ora mostrata (0 in TT o senza offset). */
  offset: () => number;
  /** Testo leggibile del valore: "21 marzo 1500, 12:00 UT, calendario giuliano". */
  testoValore: (jd: number) => string;
  /** Porta il tempo all'istante indicato (limitato all'intervallo). */
  vai: (jd: number) => void;
  /** Passo da tastiera; restituisce false se si è fermato al limite (il messaggio del limite è già annunciato). */
  passo: (unita: UnitaPasso, n: number) => boolean;
  /** Annuncio della data al rilascio. */
  annunciaData: () => void;
  annuncia: (t: string) => void;
}

export interface Regolo {
  elemento: HTMLElement;
  slider: HTMLElement;
  aggiorna(): void;
  impostaBande(bande: readonly BandaAffidabilita[], nome: string | null): void;
}

const ALTEZZA_INF = 48;
const ALTEZZA_PAN = 36;

export function creaRegolo(d: DipendenzeRegolo): Regolo {
  let ampiezza = AMPIEZZA_PREDEFINITA;
  let larghezzaInf = 0;
  let larghezzaPan = 0;
  let bande: readonly BandaAffidabilita[] = [];
  let pianificato = false;

  // --- Panoramica ---
  const svgPan = s('svg', { class: 'ss-panoramica-svg', 'aria-hidden': 'true', focusable: 'false' });
  const descrBande = h('span', { class: 'ss-sr', id: nuovoId('bande') });
  const panoramica = h('div', { class: 'ss-panoramica', title: T.console.regoloPanoramico }, svgPan);

  // --- Regolo inferiore ---
  const svgInf = s('svg', { class: 'ss-regolo-svg', 'aria-hidden': 'true', focusable: 'false' });
  const ago = h('span', { class: 'ss-ago', 'aria-hidden': 'true' });
  const idIstr = nuovoId('regolo-istr');
  const slider = h(
    'div',
    {
      class: 'ss-regolo-inf',
      role: 'slider',
      tabindex: 0,
      'aria-label': T.console.regolo,
      'aria-valuemin': String(JD_MIN_UT),
      'aria-valuemax': String(JD_MAX_UT_EXCL),
      'aria-valuenow': '0',
      'aria-describedby': `${idIstr} ${descrBande.id}`,
    },
    svgInf,
    ago,
  );
  const istruzioni = h(
    'span',
    { id: idIstr, class: 'ss-sr' },
    T.scorciatoie.voci.regolo.map(([k, a]) => `${testoTasti(k)}: ${a}`).join('. ') + '.',
  );
  const restringi = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-pulsante--piccolo', 'aria-label': T.console.regoloScalaMinore, title: T.console.regoloScalaMinore },
    icona('piu'),
  );
  const allarga = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona ss-pulsante--piccolo', 'aria-label': T.console.regoloScalaMaggiore, title: T.console.regoloScalaMaggiore },
    icona('meno'),
  );
  const scalaTesto = h('span', { class: 'ss-regolo-scala', 'aria-live': 'off' });
  restringi.addEventListener('click', () => cambiaAmpiezza(ampiezza / 4, true));
  allarga.addEventListener('click', () => cambiaAmpiezza(ampiezza * 4, true));

  const elemento = h(
    'div',
    { class: 'ss-regolo' },
    panoramica,
    descrBande,
    h('div', { class: 'ss-regolo-riga' }, allarga, slider, restringi),
    h('div', { class: 'ss-regolo-piede' }, scalaTesto),
    istruzioni,
  );

  function cambiaAmpiezza(nuova: number, annuncio: boolean): void {
    ampiezza = limitaAmpiezza(nuova);
    pianifica();
    if (annuncio) d.annuncia(testoScala());
  }

  function testoScala(): string {
    const a = testoAmpiezza(ampiezza);
    const unita = a.unita === 'anni' ? (a.valore === 1 ? UNITA.anno : UNITA.anni) : a.valore === 1 ? UNITA.giorno : UNITA.giorni;
    return T.console.regoloScala(`${formatIntero(a.valore)} ${unita}`);
  }

  function pianifica(): void {
    if (pianificato) return;
    pianificato = true;
    requestAnimationFrame(() => {
      pianificato = false;
      disegna();
    });
  }

  function disegnaPanoramica(jd: number): void {
    const w = larghezzaPan;
    if (w <= 0) return;
    svuota(svgPan);
    attributo(svgPan, 'viewBox', `0 0 ${w} ${ALTEZZA_PAN}`);
    attributo(svgPan, 'width', w);
    attributo(svgPan, 'height', ALTEZZA_PAN);
    const y = 18;
    svgPan.appendChild(s('rect', { x: 0, y, width: w, height: 8, rx: 4, class: 'ss-pan-base' }));
    for (const b of bande) {
      const x0 = frazionePanoramica(b.jd0) * w;
      const x1 = frazionePanoramica(b.jd1) * w;
      if (x1 - x0 <= 0) continue;
      // Secondo segnale oltre al colore (§ 7.8.2): altezza come le barre piene dell'icona dell'affidabilità (8, 6, 4, 2 px);
      // la fascia non determinabile è vuota. Il titolo riporta livello e anni.
      const alt = b.livello === 'non-determinabile' ? 8 : 2 * BARRE_LIVELLO[b.livello];
      svgPan.appendChild(
        s(
          'rect',
          { x: x0, y: y + 8 - alt, width: Math.max(1, x1 - x0), height: alt, class: `ss-banda ss-banda--${b.livello}` },
          s('title', null, titoloBanda(b)),
        ),
      );
    }
    const voci = tacchePanoramica().map((t) => ({ ...t, x: frazionePanoramica(t.jd) * w }));
    const visibili = etichetteSenzaCollisioni(voci, larghezzaEtichetta, w);
    for (const t of voci) {
      svgPan.appendChild(s('line', { x1: t.x, x2: t.x, y1: y - 3, y2: y + 11, class: 'ss-pan-tacca' }));
      if (!visibili.has(t)) continue;
      const anchor = t.x < 30 ? 'start' : t.x > w - 30 ? 'end' : 'middle';
      svgPan.appendChild(s('text', { x: t.x, y: 11, 'text-anchor': anchor, class: 'ss-pan-etichetta' }, t.etichetta));
    }
    const x0 = frazionePanoramica(jd - ampiezza / 2) * w;
    const x1 = frazionePanoramica(jd + ampiezza / 2) * w;
    const larg = Math.max(4, x1 - x0);
    const xc = (x0 + x1) / 2;
    svgPan.appendChild(
      s('rect', { x: Math.min(w - larg, Math.max(0, xc - larg / 2)), y: y - 4, width: larg, height: 16, rx: 3, class: 'ss-pan-finestra' }),
    );
  }

  function disegnaInferiore(jd: number): void {
    const w = larghezzaInf;
    if (w <= 0) return;
    svuota(svgInf);
    attributo(svgInf, 'viewBox', `0 0 ${w} ${ALTEZZA_INF}`);
    attributo(svgInf, 'width', w);
    attributo(svgInf, 'height', ALTEZZA_INF);
    const lim = d.limiti();
    // Zone fuori intervallo, tratteggiate.
    const xMin = xDaJd(lim.min, jd, ampiezza, w);
    const xMax = xDaJd(lim.maxEscl, jd, ampiezza, w);
    if (xMin > 0) svgInf.appendChild(s('rect', { x: 0, y: 0, width: xMin, height: ALTEZZA_INF, class: 'ss-fuori' }));
    if (xMax < w) svgInf.appendChild(s('rect', { x: xMax, y: 0, width: w - xMax, height: ALTEZZA_INF, class: 'ss-fuori' }));
    svgInf.appendChild(s('line', { x1: 0, x2: w, y1: 0.5, y2: 0.5, class: 'ss-regolo-base' }));
    const elenco = tacche(jd, ampiezza, w, d.offset());
    for (const t of elenco) {
      const alt = t.maggiore ? 14 : 7;
      svgInf.appendChild(s('line', { x1: t.x, x2: t.x, y1: 0, y2: alt, class: t.maggiore ? 'ss-tacca-maggiore' : 'ss-tacca' }));
      // Etichette intere o nessuna: niente testo tagliato ai bordi.
      if (etichettaIntera(t, w)) {
        svgInf.appendChild(s('text', { x: t.x, y: 31, 'text-anchor': 'middle', class: 'ss-tacca-etichetta' }, t.etichetta));
      }
    }
  }

  function disegna(): void {
    const st = d.store.get();
    const jd = st.tempo.jd;
    const lim = d.limiti();
    attributo(slider, 'aria-valuemin', String(lim.min));
    attributo(slider, 'aria-valuemax', String(lim.maxEscl - 1 / 86400));
    attributo(slider, 'aria-valuenow', jd.toFixed(5));
    attributo(slider, 'aria-valuetext', d.testoValore(jd));
    const t = testoScala();
    if (scalaTesto.textContent !== t) scalaTesto.textContent = t;
    // Ai limiti della scala (1 giorno, 12 000 anni) il pulsante resta nel focus ma è segnato come inattivo.
    attributo(restringi, 'aria-disabled', ampiezza <= AMPIEZZA_MIN ? 'true' : null);
    attributo(allarga, 'aria-disabled', ampiezza >= AMPIEZZA_MAX ? 'true' : null);
    disegnaPanoramica(jd);
    disegnaInferiore(jd);
  }

  // --- Misure ---
  const ro = new ResizeObserver(() => {
    larghezzaInf = Math.round(slider.clientWidth);
    larghezzaPan = Math.round(panoramica.clientWidth);
    pianifica();
  });
  ro.observe(slider);
  ro.observe(panoramica);

  // --- Panoramica: clic e trascinamento ---
  let panPuntatore: number | null = null;
  function daPanoramica(e: PointerEvent): void {
    const r = panoramica.getBoundingClientRect();
    if (r.width <= 0) return;
    d.vai(jdDaFrazionePanoramica((e.clientX - r.left) / r.width));
  }
  panoramica.addEventListener('pointerdown', (e) => {
    panPuntatore = e.pointerId;
    panoramica.setPointerCapture(e.pointerId);
    d.store.aggiorna('interfaccia', { regoloInTrascinamento: true });
    daPanoramica(e);
  });
  panoramica.addEventListener('pointermove', (e) => {
    if (panPuntatore === e.pointerId) daPanoramica(e);
  });
  const finePan = (e: PointerEvent) => {
    if (panPuntatore !== e.pointerId) return;
    panPuntatore = null;
    d.store.aggiorna('interfaccia', { regoloInTrascinamento: false });
    d.annunciaData();
  };
  panoramica.addEventListener('pointerup', finePan);
  panoramica.addEventListener('pointercancel', finePan);

  // --- Regolo inferiore: trascinamento e pizzico ---
  const puntatori = new Map<number, number>();
  let inizio: { x: number; jd: number } | null = null;
  let pizzico: { dist: number; ampiezza: number } | null = null;

  function distanzaPizzico(): number {
    const xs = Array.from(puntatori.values());
    return Math.abs((xs[0] ?? 0) - (xs[1] ?? 0));
  }
  slider.addEventListener('pointerdown', (e) => {
    slider.setPointerCapture(e.pointerId);
    puntatori.set(e.pointerId, e.clientX);
    if (puntatori.size === 1) {
      inizio = { x: e.clientX, jd: d.store.get().tempo.jd };
      d.store.aggiorna('interfaccia', { regoloInTrascinamento: true });
    } else if (puntatori.size === 2) {
      inizio = null;
      pizzico = { dist: Math.max(10, distanzaPizzico()), ampiezza };
    }
  });
  slider.addEventListener('pointermove', (e) => {
    if (!puntatori.has(e.pointerId)) return;
    puntatori.set(e.pointerId, e.clientX);
    if (pizzico !== null && puntatori.size >= 2) {
      cambiaAmpiezza((pizzico.ampiezza * pizzico.dist) / Math.max(10, distanzaPizzico()), false);
    } else if (inizio !== null) {
      d.vai(inizio.jd + deltaTrascinamento(e.clientX - inizio.x, ampiezza, larghezzaInf));
    }
  });
  const fineInf = (e: PointerEvent) => {
    if (!puntatori.delete(e.pointerId)) return;
    if (puntatori.size < 2) pizzico = null;
    if (puntatori.size === 1) {
      const [x] = Array.from(puntatori.values());
      inizio = { x: x ?? e.clientX, jd: d.store.get().tempo.jd };
    }
    if (puntatori.size === 0) {
      const mosso = inizio !== null;
      inizio = null;
      d.store.aggiorna('interfaccia', { regoloInTrascinamento: false });
      if (mosso) d.annunciaData();
    }
  };
  slider.addEventListener('pointerup', fineInf);
  slider.addEventListener('pointercancel', fineInf);
  slider.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        cambiaAmpiezza(ampiezza * Math.exp(e.deltaY * 0.01), false);
        return;
      }
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      d.vai(d.store.get().tempo.jd + (delta * ampiezza) / Math.max(1, larghezzaInf));
    },
    { passive: false },
  );

  // --- Tastiera (APG slider) ---
  const tastiNavigazione = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
  // Ultimo passo fermo al limite: al rilascio resta il messaggio del limite, senza la data che lo sostituirebbe (§ 6.6).
  let fermoAlLimite = false;
  slider.addEventListener('keydown', (e) => {
    if (!tastiNavigazione.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const unita = d.store.get().unitaPasso;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        fermoAlLimite = !d.passo(unita, e.shiftKey ? -10 : -1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        fermoAlLimite = !d.passo(unita, e.shiftKey ? 10 : 1);
        break;
      case 'PageUp':
        fermoAlLimite = !d.passo(unitaSuperiore(unita), 1);
        break;
      case 'PageDown':
        fermoAlLimite = !d.passo(unitaSuperiore(unita), -1);
        break;
      case 'Home':
        fermoAlLimite = false;
        d.vai(d.limiti().min);
        break;
      case 'End':
        fermoAlLimite = false;
        d.vai(d.limiti().maxEscl - 1 / 86400);
        break;
    }
  });
  slider.addEventListener('keyup', (e) => {
    if (tastiNavigazione.has(e.key) && !fermoAlLimite) d.annunciaData();
  });

  return {
    elemento,
    slider,
    aggiorna: pianifica,
    impostaBande(b, nome) {
      bande = b;
      descrBande.textContent = nome === null ? '' : testoBande(b, nome);
      pianifica();
    },
  };
}
