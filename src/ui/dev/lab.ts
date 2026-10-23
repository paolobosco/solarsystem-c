// Pagina di prova dell'interfaccia (ui-lab.html, solo sviluppo): collega l'interfaccia a servizi
// fittizi. Parametri: ?jd=<JD UT iniziale>, ?webgl=0 (ripiego testuale), ?benvenuto=0,
// ?caricamento=1 (barra di caricamento), ?errore=1 (errore di blocco con "Riprova").

import { creaStoreApp } from '../../app/store';
import type { StoreApp } from '../../app/store';
import type { Preferenze, UrlState } from '../../app/types';
import { RE_SLUG } from '../../data/catalogTypes';
import { creaInterfaccia } from '../index';
import type { ControllerInterfaccia } from '../index';
import { creaCatalogoFinto } from './catalogoFinto';
import { EffemeridiFinte } from './effemeridiFinte';
import { ScenaFinta } from './scenaFinta';
import { makeTimeStateFinto, stagioneFinta } from './tempoFinto';

export interface UiLab {
  store: StoreApp;
  controller: ControllerInterfaccia;
  scena: ScenaFinta | null;
  effemeridi: EffemeridiFinte;
  preferenze: Map<string, unknown>;
  copiato: string | null;
}

declare global {
  interface Window {
    __uiLab?: UiLab;
  }
}

/** JD UT dall'orologio del browser senza Date: performance.timeOrigin è in ms dall'epoca Unix. */
function adessoJdUT(): number {
  return 2_440_587.5 + (performance.timeOrigin + performance.now()) / 86_400_000;
}

const parametri = new URLSearchParams(location.search);
const jdParam = parametri.get('jd');
const jd0 = jdParam !== null && Number.isFinite(Number(jdParam)) ? Number(jdParam) : adessoJdUT();

const memoria = new Map<string, unknown>();
const preferenze: Preferenze = {
  leggi<T>(k: string, def: T): T {
    return memoria.has(k) ? (memoria.get(k) as T) : def;
  },
  scrivi(k: string, v: unknown): void {
    memoria.set(k, v);
  },
};

const url: UrlState = {
  leggiSlug() {
    const s = location.hash.slice(1);
    return RE_SLUG.test(s) ? s : null;
  },
  scriviSlug(slug) {
    try {
      history.replaceState(null, '', slug === null ? location.pathname + location.search : `#${slug}`);
    } catch {
      // Ambienti senza history: si ignora.
    }
  },
  onCambio(cb) {
    const f = () => cb(url.leggiSlug());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  },
};

const catalogo = creaCatalogoFinto();
const effemeridi = new EffemeridiFinte(catalogo);
const scena = parametri.get('webgl') === '0' ? null : new ScenaFinta(catalogo, effemeridi);
const store = creaStoreApp(jd0);
if (parametri.get('benvenuto') === '0') memoria.set('ss.ui.benvenutoChiuso', true);

const radice = document.getElementById('app');
if (!radice) throw new Error('Elemento #app assente');

const lab: UiLab = {
  store,
  controller: undefined as unknown as ControllerInterfaccia,
  scena,
  effemeridi,
  preferenze: memoria,
  copiato: null,
};

lab.controller = creaInterfaccia(radice, {
  effemeridi,
  makeTimeState: makeTimeStateFinto,
  scena,
  adessoJdUT,
  preferenze,
  catalogo,
  url,
  store,
  stagione: stagioneFinta,
  copia: async (t) => {
    lab.copiato = t;
  },
});

store.osserva(
  (s) => s.tempo,
  (t) => scena?.impostaTempo(makeTimeStateFinto(t.jd, t.scala)),
  { immediato: true },
);

if (parametri.get('caricamento') === '1') lab.controller.impostaCaricamento({ jd0: 2_455_615.5, jd1: 2_495_760.5 });
if (parametri.get('errore') === '1') {
  lab.controller.erroreBlocco('blocco:small/b12.bin', 2_455_615.5, 2_495_760.5, () => lab.controller.impostaCaricamento(null));
}

window.__uiLab = lab;
