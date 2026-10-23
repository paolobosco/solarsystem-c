// Classi di larghezza e collocazione dei pannelli (§ 11.3): desktop ≥ 1024 px; tablet 700-1023 px;
// telefono < 700 px con foglio inferiore a tre stati; in orizzontale con altezza < 480 px il
// foglio diventa un pannello laterale di 320 px (più stretto sotto i 512 px di larghezza, stile.css).

export type ModalitaLayout = 'desktop' | 'tablet' | 'telefono' | 'orizzontale';

export function modalitaLayout(larghezza: number, altezza: number): ModalitaLayout {
  // L'orientamento si valuta prima della soglia dei 700 px: un telefono in orizzontale (568 × 320) ha il pannello laterale.
  if (altezza < 480 && larghezza > altezza) return 'orizzontale';
  if (larghezza < 700) return 'telefono';
  if (larghezza < 1024) return 'tablet';
  return 'desktop';
}

/** Vero se i pannelli vivono nel foglio (telefono e orizzontale). */
export function usaFoglio(m: ModalitaLayout): boolean {
  return m === 'telefono' || m === 'orizzontale';
}

export interface ElementiLayout {
  radice: HTMLElement;
  /** Posizione del catalogo su desktop e tablet (subito dopo il campo Trova). */
  ancoraCatalogo: HTMLElement;
  /** Posizione della scheda su desktop e tablet (dopo la console). */
  ancoraScheda: HTMLElement;
  /** Corpo del foglio su telefono. */
  corpoFoglio: HTMLElement;
  catalogo: HTMLElement;
  scheda: HTMLElement;
}

/** Sposta catalogo e scheda nel foglio o accanto ai controlli, conservando stato e ascoltatori. */
export function collocaPannelli(el: ElementiLayout, m: ModalitaLayout): void {
  el.radice.dataset['layout'] = m;
  if (usaFoglio(m)) {
    if (el.catalogo.parentElement !== el.corpoFoglio) el.corpoFoglio.appendChild(el.catalogo);
    if (el.scheda.parentElement !== el.corpoFoglio) el.corpoFoglio.appendChild(el.scheda);
  } else {
    if (el.catalogo.parentElement !== el.ancoraCatalogo) el.ancoraCatalogo.appendChild(el.catalogo);
    if (el.scheda.parentElement !== el.ancoraScheda) el.ancoraScheda.appendChild(el.scheda);
  }
}
