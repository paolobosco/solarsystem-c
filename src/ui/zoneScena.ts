// Zone della mappa coperte dall'interfaccia (§ 11.3: pannelli sovrapposti alla scena), passate alla scena
// perché le etichette non vi si dispongano (§ 11.5.2). È una zona ogni elemento visibile fuori dalla mappa
// con sfondo quasi opaco (alfa ≥ 0,5) o con un'immagine di sfondo, senza scendere nei suoi discendenti; dei
// contenitori trasparenti (barra superiore, ancore, foglio) contano solo i discendenti opachi.
// Ricalcolo al più una volta per fotogramma dopo cambi di attributi o di figli dei pannelli, ridimensionamenti
// della mappa o delle zone, fine di transizioni e animazioni.

/** Rettangolo in px CSS rispetto alla canvas. */
export interface Zona {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}

const ALFA_MIN = 0.5;

/** Attributi che cambiano visibilità, posizione o aspetto dei pannelli. */
const ATTRIBUTI = ['class', 'hidden', 'style', 'open', 'data-layout', 'data-stato', 'aria-expanded'];

function valoreAlfa(t: string): number {
  const s = t.trim();
  const v = Number.parseFloat(s);
  if (!Number.isFinite(v)) return 1;
  return s.endsWith('%') ? v / 100 : v;
}

/** Alfa di un colore calcolato: "rgba(r, g, b, a)", "rgb(r g b / a)", "color(... / a)", "transparent". */
export function alfaColore(colore: string): number {
  if (colore === 'transparent') return 0;
  const m = /\(([^)]*)\)/.exec(colore);
  if (!m) return 1;
  const interno = m[1]!;
  const barra = interno.split('/');
  if (barra.length === 2) return valoreAlfa(barra[1]!);
  const parti = interno.split(',');
  return parti.length === 4 ? valoreAlfa(parti[3]!) : 1;
}

function raccogli(el: Element, mappa: Element, out: Element[]): void {
  for (const c of el.children) {
    if (c === mappa) continue;
    const cs = getComputedStyle(c);
    if (cs.display === 'none' || Number.parseFloat(cs.opacity) === 0) continue;
    const r = c.getBoundingClientRect();
    const opaco = alfaColore(cs.backgroundColor) >= ALFA_MIN || cs.backgroundImage !== 'none';
    if (opaco && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) {
      out.push(c);
      continue;
    }
    if (c.children.length > 0) raccogli(c, mappa, out);
  }
}

/** Elementi che coprono la mappa, discendenti di radice. */
export function elementiCoprenti(radice: Element, mappa: Element): Element[] {
  const out: Element[] = [];
  raccogli(radice, mappa, out);
  return out;
}

/**
 * Osserva i pannelli della radice (il contenitore dell'applicazione) e chiama imposta con le zone
 * rispetto al riferimento (la canvas). Restituisce la funzione che interrompe l'osservazione.
 */
export function osservaZone(radice: HTMLElement, mappa: HTMLElement, riferimento: HTMLElement, imposta: (zone: Zona[]) => void): () => void {
  let raf = 0;
  const osservati = new Set<Element>();
  const conMutazioni = new WeakSet<Element>();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => pianifica()) : null;
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => pianifica()) : null;

  function pianifica(): void {
    if (raf === 0) raf = requestAnimationFrame(calcola);
  }

  function calcola(): void {
    raf = 0;
    // Figli diretti della radice (pannelli, barra, foglio): attributi e figli nel loro sottoalbero.
    for (const c of radice.children) {
      if (c === mappa || conMutazioni.has(c)) continue;
      conMutazioni.add(c);
      mo?.observe(c, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRIBUTI });
    }
    const elementi = elementiCoprenti(radice, mappa);
    const nuovi = new Set<Element>(elementi);
    for (const e of osservati) if (!nuovi.has(e)) ro?.unobserve(e);
    for (const e of nuovi) if (!osservati.has(e)) ro?.observe(e);
    osservati.clear();
    for (const e of nuovi) osservati.add(e);
    const rif = riferimento.getBoundingClientRect();
    const zone: Zona[] = [];
    for (const e of elementi) {
      const r = e.getBoundingClientRect();
      const x0 = Math.max(r.left, rif.left);
      const y0 = Math.max(r.top, rif.top);
      const x1 = Math.min(r.right, rif.right);
      const y1 = Math.min(r.bottom, rif.bottom);
      if (x1 > x0 && y1 > y0) zone.push({ x: x0 - rif.left, y: y0 - rif.top, larghezza: x1 - x0, altezza: y1 - y0 });
    }
    imposta(zone);
  }

  mo?.observe(radice, { childList: true, attributes: true, attributeFilter: ATTRIBUTI });
  ro?.observe(riferimento);
  const opz: AddEventListenerOptions = { capture: true };
  radice.addEventListener('transitionend', pianifica, opz);
  radice.addEventListener('animationend', pianifica, opz);
  window.addEventListener('resize', pianifica);
  pianifica();
  return () => {
    if (raf !== 0) cancelAnimationFrame(raf);
    ro?.disconnect();
    mo?.disconnect();
    radice.removeEventListener('transitionend', pianifica, opz);
    radice.removeEventListener('animationend', pianifica, opz);
    window.removeEventListener('resize', pianifica);
  };
}
