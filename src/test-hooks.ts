// Ganci per i test end-to-end (§ 5.4 di docs/PROGETTO.md): window.__ssTest, solo con
// import.meta.env.MODE === 'test' (npm run build:test). Nelle altre build il ramo è eliminato.
// Oltre ai cinque metodi del § 5.4: istante corrente, posa della camera, livelli, selezione, stato della
// vista e lettura dei pixel, per le prove grafiche (A8, A25) sull'applicazione reale.

import type { App } from './app/avvio';
import type { LivelloVisivo } from './app/store';
import type { Affidabilita } from './ephem/types';
import type { PixelLetti, StatoVista } from './render/api';

export interface PosizioneSchermo {
  x: number;
  y: number;
  visibile: boolean;
}

export interface StatoCorpoTest {
  r: number[]; // km, eclittica J2000 eliocentrica
  v: number[]; // km/s
  stato: string; // StatoEffemeride
  livello: string; // Livello
}

export interface SsTest {
  setTime(jdUT: number): Promise<void>;
  focus(slug: string): Promise<void>;
  getScreenPosition(slug: string): PosizioneSchermo | null;
  getState(slug: string): StatoCorpoTest | null;
  /** Dati caricati, transizioni concluse, frame disegnato. */
  waitIdle(): Promise<void>;
  /** Istante corrente: JD UT1, JD TT e ΔT (s). */
  getTime(): { jdUT: number; jdTT: number; deltaT: number };
  /** Posa della camera rispetto al corpo a fuoco (km, eclittica J2000). */
  posa(posizione: readonly number[], bersaglio: readonly number[]): Promise<void>;
  /** Livelli visivi dello store (RF5). */
  livelli(l: Partial<Record<LivelloVisivo, boolean>>): Promise<void>;
  /** Corpo selezionato (slug) o nessuno. */
  seleziona(slug: string | null): Promise<void>;
  /** Stato della vista della scena; null senza WebGL2. */
  vista(): StatoVista | null;
  /** Disegna un frame e legge una regione della canvas (px CSS); null senza WebGL2. */
  pixel(x: number, y: number, larghezza: number, altezza: number): PixelLetti | null;
  /** Attende che la texture del corpo sia nella scena e che il frame successivo sia disegnato. */
  attendiTexture(slug: string): Promise<void>;
  /** Corpi esclusi dal disegno (prove sui pixel). */
  escludi(slug: readonly string[]): Promise<void>;
}

declare global {
  interface Window {
    __ssTest?: SsTest;
  }
}

/** Installa i ganci; restituisce false fuori dalla build di test. */
export function installaGanciTest(impl: SsTest): boolean {
  if (import.meta.env.MODE !== 'test') return false;
  window.__ssTest = impl;
  return true;
}

const ATTESA_MAX_MS = 60_000;

function prossimoFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** Ganci sull'applicazione avviata. */
export function creaGanciTest(app: App): SsTest {
  const ssid = (slug: string): number | null => app.catalogo.perSlug(slug)?.ssid ?? null;

  /**
   * Vero se l'ultimo frame ha le dimensioni correnti della canvas (stessa regola del renderer). Dopo un
   * ridimensionamento il ResizeObserver interviene dopo le callback di requestAnimationFrame: fino al frame
   * successivo statoVista() e le posizioni sullo schermo riflettono le dimensioni precedenti.
   */
  function dimensioniCorrenti(): boolean {
    const canvas = app.ui.contenitoreScena.querySelector('canvas');
    if (app.scena === null || canvas === null) return true;
    const v = app.scena.statoVista();
    const ok =
      v.larghezzaPx === Math.max(1, canvas.clientWidth || canvas.width) && v.altezzaPx === Math.max(1, canvas.clientHeight || canvas.height);
    if (!ok) app.scena.richiediFrame();
    return ok;
  }

  async function waitIdle(): Promise<void> {
    const inizio = performance.now();
    let stabili = 0;
    for (;;) {
      if (performance.now() - inizio > ATTESA_MAX_MS) throw new Error('waitIdle: tempo scaduto');
      const t = app.tempo();
      const pronto = app.servizio.pronto(t.jdTT) && !app.caricatore.occupato && app.affidabilitaCaricata();
      const quieta = app.scena === null || (app.scena.inQuiete() && app.frameDisegnati() > 0 && dimensioniCorrenti());
      stabili = pronto && quieta && !app.store.get().riproduzione.attiva ? stabili + 1 : 0;
      // due frame consecutivi senza lavoro: l'ultimo frame riflette i dati e la vista
      if (stabili >= 2) return;
      await prossimoFrame();
    }
  }

  return {
    async setTime(jdUT) {
      app.store.transazione(() => {
        app.store.aggiorna('riproduzione', { attiva: false, seguiOra: false });
        app.store.aggiorna('tempo', { jd: jdUT, scala: 'UT' });
      });
      try {
        await app.caricatore.attendi();
      } catch {
        // l'errore è mostrato dall'interfaccia; waitIdle resta in attesa fino al limite
      }
      await waitIdle();
    },
    async focus(slug) {
      if (ssid(slug) === null) throw new Error(`slug sconosciuto: ${slug}`);
      app.ui.mettiAFuoco(slug, { inquadratura: 'orbita', immediato: true });
      app.scena?.completaTransizione();
      await waitIdle();
    },
    getScreenPosition(slug) {
      const s = ssid(slug);
      if (s === null || app.scena === null) return null;
      // visibile: disegnato (marcatore o disco), nel campo visivo e non occluso.
      const info = app.scena.infoCorpo(s);
      return info ? { x: info.x, y: info.y, visibile: info.visibile } : null;
    },
    getState(slug) {
      const s = ssid(slug);
      if (s === null) return null;
      const t = app.tempo();
      const out = new Float64Array(6);
      const stato = app.servizio.stateAt(s, t.jdTT, out);
      const aff: Affidabilita = { livello: 'non-determinabile', epsModello: Number.NaN, epsDeltaT: 0, epsTotale: Number.NaN };
      app.servizio.affidabilita(s, t, aff);
      return { r: [out[0]!, out[1]!, out[2]!], v: [out[3]!, out[4]!, out[5]!], stato, livello: aff.livello };
    },
    waitIdle,
    getTime() {
      const t = app.tempo();
      return { jdUT: t.jdUT, jdTT: t.jdTT, deltaT: t.deltaT };
    },
    async posa(posizione, bersaglio) {
      app.scena?.completaTransizione();
      app.scena?.impostaPosa(posizione, bersaglio);
      await waitIdle();
    },
    async livelli(l) {
      app.store.aggiorna('livelli', l);
      await waitIdle();
    },
    async seleziona(slug) {
      if (slug !== null && ssid(slug) === null) throw new Error(`slug sconosciuto: ${slug}`);
      app.store.set({ selezionato: slug });
      await waitIdle();
    },
    vista() {
      return app.scena?.statoVista() ?? null;
    },
    pixel(x, y, larghezza, altezza) {
      return app.scena?.leggiPixel(x, y, larghezza, altezza) ?? null;
    },
    async escludi(slug) {
      app.scena?.impostaEsclusi(slug.map((s) => ssid(s)).filter((s): s is number => s !== null));
      await waitIdle();
    },
    async attendiTexture(slug) {
      const inizio = performance.now();
      while (!app.textureCaricate().has(slug)) {
        if (performance.now() - inizio > ATTESA_MAX_MS) throw new Error(`attendiTexture: tempo scaduto per ${slug}`);
        await prossimoFrame();
      }
      app.scena?.richiediFrame();
      await waitIdle();
    },
  };
}
