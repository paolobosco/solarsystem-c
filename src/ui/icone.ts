// Icone SVG in linea (24 × 24, tratto currentColor): decorative, sempre con aria-hidden.

import { s } from './dom';

export type NomeIcona =
  | 'cerca'
  | 'catalogo'
  | 'livelli'
  | 'tabella'
  | 'libro'
  | 'ingranaggio'
  | 'menu'
  | 'chiudi'
  | 'riproduci'
  | 'pausa'
  | 'indietro'
  | 'avanti'
  | 'direzione'
  | 'adesso'
  | 'piu'
  | 'meno'
  | 'inquadra'
  | 'collegamento'
  | 'su'
  | 'giu'
  | 'avviso'
  | 'informazioni'
  | 'aggiorna'
  | 'vista'
  | 'calendario'
  | 'altoparlante';

const PERCORSI: Readonly<Record<NomeIcona, readonly string[]>> = {
  cerca: ['M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13z', 'M15.5 15.5L20 20'],
  catalogo: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  livelli: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  tabella: ['M4 5h16v14H4z', 'M4 10h16', 'M4 14.5h16', 'M10 5v14'],
  libro: ['M4 5.5C6.5 4 9.5 4 12 5.5v14C9.5 18 6.5 18 4 19.5z', 'M20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0z'],
  ingranaggio: [
    'M12 9a3 3 0 1 1 0 6a3 3 0 0 1 0-6z',
    'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  ],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  chiudi: ['M6 6l12 12', 'M18 6L6 18'],
  riproduci: ['M8 5.5v13l10.5-6.5z'],
  pausa: ['M8 5.5v13', 'M16 5.5v13'],
  indietro: ['M15 6l-6 6 6 6'],
  avanti: ['M9 6l6 6-6 6'],
  direzione: ['M4 9h14l-3.5-3.5', 'M20 15H6l3.5 3.5'],
  adesso: ['M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17z', 'M12 7.5V12l3 2'],
  piu: ['M12 5v14', 'M5 12h14'],
  meno: ['M5 12h14'],
  inquadra: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5', 'M12 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4z'],
  collegamento: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  su: ['M6 15l6-6 6 6'],
  giu: ['M6 9l6 6 6-6'],
  avviso: ['M12 4l9 16H3z', 'M12 10v4.5', 'M12 17.5h.01'],
  informazioni: ['M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17z', 'M12 11v5.5', 'M12 7.5h.01'],
  aggiorna: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v4h-4'],
  vista: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5z'],
  calendario: ['M4.5 6h15v13.5h-15z', 'M4.5 10h15', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  altoparlante: ['M4 9.5h3.5L12 6v12l-4.5-3.5H4z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
};

/** Icona decorativa: aria-hidden, non focalizzabile. */
export function icona(nome: NomeIcona, classe = 'ss-icona'): SVGSVGElement {
  const svg = s('svg', {
    class: classe,
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const riempita = nome === 'riproduci';
  for (const d of PERCORSI[nome]) {
    svg.appendChild(
      s('path', {
        d,
        fill: riempita ? 'currentColor' : 'none',
        stroke: 'currentColor',
        'stroke-width': nome === 'pausa' ? 3 : 1.8,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
  }
  return svg;
}
