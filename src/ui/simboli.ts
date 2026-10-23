// Simboli dei corpi con forme e colori della scena (§ 11.1): stessi della legenda, del catalogo,
// della ricerca e della scheda. La forma è il segnale primario; il colore la rafforza.
// Colori da COLORE_CATEGORIA di src/render/costanti.ts, unica sorgente per scena e interfaccia.

import type { CategoriaCorpo } from '../data/catalogTypes';
import type { Livello } from '../ephem/types';
import { COLORE_CATEGORIA } from '../render/costanti';
import { s } from './dom';

/** Disegno su griglia 16 × 16 centrata in (8, 8). */
function forma(categoria: CategoriaCorpo, colore: string, cavo: boolean): SVGElement[] {
  const pieno = cavo ? 'none' : colore;
  const tratto = { stroke: colore, 'stroke-width': 1.6, 'stroke-linejoin': 'round' };
  switch (categoria) {
    case 'sole':
      return [s('circle', { cx: 8, cy: 8, r: 6, fill: 'none', ...tratto }), s('circle', { cx: 8, cy: 8, r: 1.8, fill: colore })];
    case 'pianeta':
      return [s('circle', { cx: 8, cy: 8, r: 5.5, fill: pieno, ...tratto })];
    case 'pianeta-nano':
      return [s('path', { d: 'M8 1.8L14.2 8L8 14.2L1.8 8z', fill: pieno, ...tratto })];
    case 'luna':
      return [s('circle', { cx: 8, cy: 8, r: 4.6, fill: 'none', ...tratto, 'stroke-width': 2.2 })];
    case 'asteroide':
      return [s('path', { d: 'M8 2.2L14 13.2H2z', fill: pieno, ...tratto })];
    case 'centauro':
      return [s('path', { d: 'M8 1.8L14.2 6.3L11.8 13.6H4.2L1.8 6.3z', fill: pieno, ...tratto })];
    case 'cometa':
      return [
        s('path', { d: 'M9.5 9.5L15 15', stroke: colore, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7 }),
        s('circle', { cx: 7, cy: 7, r: 4.4, fill: pieno, ...tratto }),
      ];
    case 'tno':
      return [s('rect', { x: 3, y: 3, width: 10, height: 10, fill: pieno, ...tratto })];
    case 'interstellare':
      return [s('path', { d: 'M8 1L9.8 6.2L15 8L9.8 9.8L8 15L6.2 9.8L1 8L6.2 6.2z', fill: pieno, ...tratto })];
  }
}

/** Simbolo decorativo della categoria (aria-hidden). `cavo` per l'affidabilità indicativa. */
export function simbolo(categoria: CategoriaCorpo, opzioni: { cavo?: boolean; dimensione?: number } = {}): SVGSVGElement {
  const d = opzioni.dimensione ?? 16;
  const svg = s('svg', {
    class: 'ss-simbolo',
    viewBox: '0 0 16 16',
    width: d,
    height: d,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  for (const f of forma(categoria, COLORE_CATEGORIA[categoria], opzioni.cavo ?? false)) svg.appendChild(f);
  return svg;
}

/** Numero di barre piene dell'icona dell'affidabilità (§ 7.8.2): il colore non è l'unico segnale. */
export const BARRE_LIVELLO: Readonly<Record<Livello, number>> = {
  precisa: 4,
  buona: 3,
  approssimata: 2,
  indicativa: 1,
  'non-determinabile': 0,
};

/** Icona a barre dell'affidabilità (aria-hidden). */
export function iconaAffidabilita(livello: Livello): SVGSVGElement {
  const svg = s('svg', {
    class: `ss-barre ss-barre--${livello}`,
    viewBox: '0 0 18 14',
    width: 18,
    height: 14,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const n = BARRE_LIVELLO[livello];
  for (let i = 0; i < 4; i++) {
    const alt = 4 + i * 3;
    svg.appendChild(
      s('rect', {
        x: 1 + i * 4.3,
        y: 13 - alt,
        width: 3,
        height: alt,
        rx: 0.6,
        class: i < n ? 'ss-barra-piena' : 'ss-barra-vuota',
      }),
    );
  }
  return svg;
}
