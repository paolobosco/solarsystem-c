// Utilità DOM leggere per i componenti dell'interfaccia (nessun framework, § 5.2).

export type ValoreAttributo = string | number | boolean | null | undefined;
export type Ascoltatore = (evento: never) => void;
export type Proprieta = Record<string, ValoreAttributo | Ascoltatore>;
export type Figlio = Node | string | null | undefined | false;

const NS_SVG = 'http://www.w3.org/2000/svg';

function applica(el: Element, props: Proprieta | null | undefined): void {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (typeof v === 'function') {
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v as unknown as EventListener);
      continue;
    }
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function aggiungi(el: Node, figli: readonly Figlio[]): void {
  for (const f of figli) {
    if (f === null || f === undefined || f === false) continue;
    el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
  }
}

/** Crea un elemento HTML: attributi, ascoltatori (onclick, onkeydown, ...), testo e figli. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Proprieta | null,
  ...figli: Figlio[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applica(el, props);
  aggiungi(el, figli);
  return el;
}

/** Crea un elemento SVG. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: Proprieta | null,
  ...figli: Figlio[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS_SVG, tag);
  applica(el, props);
  aggiungi(el, figli);
  return el;
}

let contatore = 0;

/** Identificatore unico nella pagina. */
export function nuovoId(prefisso = 'ss'): string {
  contatore += 1;
  return `${prefisso}-${contatore}`;
}

/** Imposta o rimuove un attributo. */
export function attributo(el: Element, nome: string, valore: ValoreAttributo): void {
  if (valore === null || valore === undefined || valore === false) el.removeAttribute(nome);
  else el.setAttribute(nome, valore === true ? '' : String(valore));
}

/** Aggiorna il testo solo se cambia (evita mutazioni inutili per le tecnologie assistive). */
export function testo(el: Node, valore: string): void {
  if (el.textContent !== valore) el.textContent = valore;
}

export function svuota(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
