// Scena WebGL2 (§ 5.5, § 10): WebGLRenderer con profondità logaritmica, ordine per frame,
// rendering su richiesta, contesto perso e ripristinato (R13), texture alla soglia di 8 px,
// stelle dopo il primo frame, etichette HTML, selezione.

import { NoToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import type { Catalogo, CategoriaCorpo, CorpoCatalogo } from '../data/catalogTypes';
import { UA_KM } from '../ephem/constants';
import type { TimeState } from '../time/types';
import type { OpzioniScena, PixelLetti, ScenaApi, StatisticheFrame } from './api';
import { distanzaDaEstensione, distanzaMassima } from './camera';
import { COLORE_SPAZIO, PIXEL_RATIO_MAX, SOGLIA_TEXTURE_PX } from './costanti';
import { ControlliCamera, GestoreGesti } from './controls';
import { GrafoScena } from './grafo';
import { StratoEtichette } from './labels';
import type { VoceEtichetta } from './labels';
import { creaAtlanteMarcatori } from './markers';
import { Motore } from './motore';
import { TESTI_SCENA } from './testi';
import type { TestiScena } from './testi';
import { creaTextureCorpo } from './texture';
import type { EventoSelezione, LivelliVisivi, OpzioniFuoco, StatoVista, ZonaSchermo } from './tipi';

/** WebGL2 non disponibile (§ 11.11): l'interfaccia mostra la vista testuale. */
export class ErroreWebGL extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreWebGL';
  }
}

type Ascoltatori<T> = Set<(v: T) => void>;

function emetti<T>(s: Ascoltatori<T>, v: T): void {
  for (const cb of s) cb(v);
}

function iscrivi<T>(s: Ascoltatori<T>, cb: (v: T) => void): () => void {
  s.add(cb);
  return () => s.delete(cb);
}

/** Attesa prima del nuovo tentativo di una risorsa non caricata (texture, stars.bin): 2 s, raddoppiata fino a 60 s. */
export function attesaNuovoTentativoMs(tentativi: number): number {
  return Math.min(60_000, 2000 * 2 ** Math.max(0, tentativi - 1));
}

function annullata(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError';
}

class ScenaWebGL implements ScenaApi {
  private readonly renderer: WebGLRenderer;
  readonly motore: Motore;
  private readonly grafo: GrafoScena;
  private readonly controlli: ControlliCamera;
  private readonly gesti: GestoreGesti;
  private readonly strato: StratoEtichette;
  private readonly catalogo: readonly CorpoCatalogo[];
  private readonly testi: TestiScena;
  private readonly osservatore: ResizeObserver | null;
  private readonly abort = new AbortController();
  private readonly ascSelezione: Ascoltatori<EventoSelezione> = new Set();
  private readonly ascPassaggio: Ascoltatori<number | null> = new Set();
  private readonly ascVista: Ascoltatori<StatoVista> = new Set();
  private readonly ascFrame: Ascoltatori<void> = new Set();
  private readonly texRichieste = new Set<number>();
  /** Texture non caricate: tentativi falliti e istante del prossimo tentativo (performance.now). */
  private readonly texErrori = new Map<number, { tentativi: number; prossimo: number }>();
  /** stars.bin: da richiedere, in corso, caricato, non caricato (nuovo tentativo dopo stelleProssimo). */
  private statoStelle: 'attesa' | 'corso' | 'pronte' | 'errore' = 'attesa';
  private tentativiStelle = 0;
  private stelleProssimo = 0;
  private readonly timer = new Set<ReturnType<typeof setTimeout>>();
  private readonly pixelRatioMax: number;
  private pixelRatio = 1;
  private larghezza = 1;
  private altezza = 1;
  private perso = false;
  private disposta = false;
  private rafInterno = 0;
  private frameRichiesto = false;
  private ancora = true;
  private ultimaVista = Number.NEGATIVE_INFINITY;
  private ultimoFrameOra = Number.NaN;
  private controlliAttivi = false;
  private readonly stat: StatisticheFrame = { cpuMs: 0, cpuMediaMs: 0, frameMs: 0, frame: 0, orbiteRicostruite: 0 };
  private mq: MediaQueryList | null = null;
  /** Media query sulla densità dei pixel attuale: scatta anche senza cambio delle dimensioni CSS (R12). */
  private mqDensita: MediaQueryList | null = null;
  private readonly cambioDensita = (): void => {
    this.osservaDensita();
    this.ridimensiona();
    this.richiediFrame();
  };
  private readonly rimuovi: (() => void)[] = [];

  constructor(private readonly opz: OpzioniScena) {
    const canvas = opz.canvas;
    let gl: WebGLRenderer;
    try {
      gl = new WebGLRenderer({
        canvas,
        antialias: true,
        logarithmicDepthBuffer: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    } catch (e) {
      throw new ErroreWebGL(e instanceof Error ? e.message : String(e));
    }
    if (!gl.capabilities.isWebGL2) throw new ErroreWebGL('WebGL2 non disponibile');
    this.renderer = gl;
    gl.autoClear = false;
    gl.setClearColor(COLORE_SPAZIO, 1);
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = NoToneMapping;
    this.pixelRatioMax = opz.pixelRatioMax ?? PIXEL_RATIO_MAX;
    const corpi = Array.isArray(opz.catalogo) ? (opz.catalogo as readonly CorpoCatalogo[]) : (opz.catalogo as Catalogo).corpi;
    this.catalogo = [...corpi].sort((a, b) => a.ssid - b.ssid);
    this.testi = { ...TESTI_SCENA, ...opz.testi };
    let ridotto = opz.movimentoRidotto;
    if (ridotto === undefined && typeof matchMedia === 'function') {
      this.mq = matchMedia('(prefers-reduced-motion: reduce)');
      ridotto = this.mq.matches;
      const f = (): void => this.impostaMovimentoRidotto(this.mq!.matches);
      this.mq.addEventListener('change', f);
      this.rimuovi.push(() => this.mq?.removeEventListener('change', f));
    }
    this.motore = new Motore({
      catalogo: this.catalogo,
      effemeridi: opz.effemeridi,
      orientamento: opz.orientamento ?? null,
      aspetto: 1,
      movimentoRidotto: ridotto ?? false,
    });
    this.grafo = new GrafoScena(this.motore, creaAtlanteMarcatori());
    this.controlli = new ControlliCamera(
      this.motore.camera,
      canvas,
      {
        inizio: () => {
          this.motore.fuoco.interrompiDistanza();
          this.controlliAttivi = true;
          this.richiediFrame();
        },
        cambio: () => this.richiediFrame(),
      },
      ridotto ?? false,
    );
    this.controlli.orbit.target = this.motore.target;
    // Livello etichette: corpi e anelli di distanza.
    const voci: VoceEtichetta[] = this.motore.registro.corpi.map((c) => ({ testo: c.nomeBreve, tipo: 'corpo', ssid: c.ssid }));
    for (const a of this.motore.anelli) voci.push({ testo: this.testi.anelloDistanza(Math.round(a.raggio / UA_KM)), tipo: 'anello', ssid: -1 });
    this.strato = new StratoEtichette(opz.etichette, voci, this.testi.contatoreLune);
    for (const c of this.motore.registro.corpi) if (c.lune.length > 0) this.strato.abilitaContatore(c.ssid, c.ssid);
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    const misura = (): void => {
      if (this.disposta) return;
      this.strato.misura(this.motore.layout.larghezza);
      this.motore.layout.invalida();
      this.richiediFrame();
    };
    if (fonts) void fonts.ready.then(misura);
    else misura();
    this.gesti = new GestoreGesti(
      canvas,
      opz.etichette,
      {
        clic: (x, y, tipo, etichetta, contatore) => this.clic(x, y, tipo, etichetta, contatore),
        doppioTocco: () => this.inquadra(),
        passaggio: (x, y, tipo) => this.passaggio(x, y, tipo),
        uscita: () => this.impostaPassaggio(-1),
      },
      () => performance.now(),
    );
    // Contesto WebGL (R13): pausa alla perdita, ripristino delle risorse dalla cache CPU. Durante la pausa le
    // etichette sono nascoste: non seguirebbero più la data e la vista; l'interfaccia lo segnala (statoVista).
    const perso = (e: Event): void => {
      e.preventDefault();
      this.perso = true;
      this.strato.nascondi();
      this.emettiVista(true);
    };
    const ripristinato = (): void => {
      this.perso = false;
      this.grafo.texture.forEach((t) => (t.needsUpdate = true));
      this.motore.invalidaDati();
      this.emettiVista(true);
      this.richiediFrame();
    };
    canvas.addEventListener('webglcontextlost', perso, false);
    canvas.addEventListener('webglcontextrestored', ripristinato, false);
    this.rimuovi.push(() => canvas.removeEventListener('webglcontextlost', perso, false));
    this.rimuovi.push(() => canvas.removeEventListener('webglcontextrestored', ripristinato, false));
    this.osservatore =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            this.ridimensiona();
            this.richiediFrame();
          })
        : null;
    this.osservatore?.observe(canvas);
    // Cambio della sola densità dei pixel (finestra spostata su uno schermo diverso): il ResizeObserver non scatta.
    this.osservaDensita();
    this.rimuovi.push(() => this.mqDensita?.removeEventListener('change', this.cambioDensita));
    // Vista iniziale (§ 11.12): ESTENSIONE_INIZIALE_KM dal motore, mantenuta da ridimensiona() con l'aspetto reale.
    this.ridimensiona();
    this.richiediFrame();
  }

  private osservaDensita(): void {
    this.mqDensita?.removeEventListener('change', this.cambioDensita);
    this.mqDensita = null;
    if (this.disposta || typeof matchMedia !== 'function' || typeof devicePixelRatio !== 'number') return;
    this.mqDensita = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.mqDensita.addEventListener('change', this.cambioDensita);
  }

  private impostaMovimentoRidotto(r: boolean): void {
    this.motore.movimentoRidotto = r;
    this.controlli.impostaMovimentoRidotto(r);
  }

  private ridimensiona(): void {
    const c = this.opz.canvas;
    const w = Math.max(1, c.clientWidth || c.width);
    const h = Math.max(1, c.clientHeight || c.height);
    const pr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, this.pixelRatioMax);
    if (w === this.larghezza && h === this.altezza && pr === this.pixelRatio) return;
    this.larghezza = w;
    this.altezza = h;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    // A parità di estensione della vista (lato minore, § 10.3) la distanza segue il nuovo aspetto: anche la prima
    // misura della canvas, montata dopo la creazione della scena, conserva la vista iniziale.
    this.motore.impostaAspetto(w / h);
    const buf = this.renderer.getDrawingBufferSize(this.grafo.risoluzione);
    this.grafo.ridimensiona(buf.x, buf.y);
    this.motore.layout.invalida();
  }

  // --- Eventi della scena ---

  private clic(x: number, y: number, tipo: string, etichetta: number | null, contatore: number | null): void {
    if (contatore !== null) {
      this.inquadraSistema(contatore);
      return;
    }
    // L'etichetta su cui cade il clic è un candidato come gli altri (§ 11.5.3): non nasconde i marcatori che copre.
    const esito = this.motore.scegli(x, y, tipo, performance.now(), etichetta ?? -1);
    if (!esito) return;
    this.motore.impostaSelezione(esito.ssid);
    emetti(this.ascSelezione, {
      ssid: esito.ssid,
      indice: esito.indice,
      totale: esito.totale,
      origine: etichetta !== null && esito.ssid === etichetta ? 'etichetta' : 'puntatore',
    });
    this.richiediFrame();
  }

  private passaggio(x: number, y: number, tipo: string): void {
    this.impostaPassaggio(this.motore.corpoSotto(x, y, tipo));
  }

  private impostaPassaggio(ssid: number): void {
    if (ssid === this.motore.passaggio) return;
    this.motore.passaggio = ssid;
    this.motore.layout.invalida();
    this.opz.canvas.style.cursor = ssid >= 0 ? 'pointer' : '';
    emetti(this.ascPassaggio, ssid >= 0 ? ssid : null);
    this.richiediFrame();
  }

  private emettiVista(forza = false): void {
    const ora = performance.now();
    if (!forza && ora - this.ultimaVista < 100) return;
    this.ultimaVista = ora;
    if (this.ascVista.size > 0) emetti(this.ascVista, this.motore.statoVista(this.perso));
  }

  // --- ScenaApi ---

  get contestoPerso(): boolean {
    return this.perso;
  }

  impostaTempo(t: TimeState): void {
    this.motore.impostaTempo(t);
    this.richiediFrame();
  }

  impostaRiproduzione(giorniPerSecondo: number): void {
    this.motore.velocita = Number.isFinite(giorniPerSecondo) ? giorniPerSecondo : 0;
    if (this.motore.velocita === 0) this.ultimoFrameOra = Number.NaN;
    this.richiediFrame();
  }

  impostaFuoco(ssid: number, opzioni: OpzioniFuoco = {}): void {
    this.motore.impostaFuoco(ssid, performance.now(), opzioni);
    this.richiediFrame();
  }

  completaTransizione(): void {
    this.motore.fuoco.completa();
    this.richiediFrame();
  }

  impostaSelezione(ssid: number | null): void {
    this.motore.impostaSelezione(ssid);
    this.richiediFrame();
  }

  impostaLivelli(livelli: Partial<LivelliVisivi>): void {
    Object.assign(this.motore.livelli, livelli);
    this.motore.layout.invalida();
    this.richiediFrame();
  }

  impostaFiltri(categorie: Iterable<CategoriaCorpo>): void {
    this.motore.impostaFiltri(categorie);
    this.richiediFrame();
  }

  impostaOrbiteExtra(ssid: Iterable<number>): void {
    this.motore.orbiteExtra.clear();
    for (const s of ssid) this.motore.orbiteExtra.add(s);
    this.richiediFrame();
  }

  zoom(fattore: number): void {
    if (!(fattore > 0)) return;
    this.motore.fuoco.completa();
    this.motore.impostaDistanza(this.motore.distanzaCamera() / fattore);
    this.richiediFrame();
  }

  impostaEstensione(km: number): void {
    this.motore.fuoco.completa();
    this.motore.impostaDistanza(distanzaDaEstensione(km, this.motore.camera.aspect));
    this.richiediFrame();
  }

  ruota(dAzimut: number, dElevazione: number): void {
    this.controlli.ruota(dAzimut, dElevazione);
    this.richiediFrame();
  }

  sposta(dxPx: number, dyPx: number): void {
    this.controlli.sposta(dxPx, dyPx, this.motore.proiettore.kmPerPx(this.motore.distanzaCamera()));
    this.richiediFrame();
  }

  inquadra(): void {
    this.impostaFuoco(this.motore.fuoco.fuoco, { inquadratura: 'corpo' });
  }

  inquadraSistema(ssid: number): void {
    this.impostaFuoco(ssid, { inquadratura: 'sistema' });
  }

  corpiVisibiliOrdinati(): readonly number[] {
    return this.motore.corpiVisibiliOrdinati();
  }

  corpoPiuVicinoAlCentro(): number | null {
    return this.motore.corpoPiuVicinoAlCentro();
  }

  statoVista(): StatoVista {
    return this.motore.statoVista(this.perso);
  }

  infoCorpo(ssid: number) {
    return this.motore.info(ssid);
  }

  getScreenPosition(ssid: number) {
    return this.motore.posizioneSchermo(ssid);
  }

  impostaPosa(posizione: readonly number[], bersaglio: readonly number[]): void {
    this.motore.impostaPosa(posizione, bersaglio);
    this.richiediFrame();
  }

  impostaZoneOccupate(zone: readonly ZonaSchermo[]): void {
    if (this.motore.layout.impostaZone(zone)) this.richiediFrame();
  }

  impostaEsclusi(ssid: Iterable<number>): void {
    this.motore.esclusi.fill(0);
    for (const s of ssid) if (s >= 0 && s < this.motore.n) this.motore.esclusi[s] = 1;
    this.motore.layout.invalida();
    this.richiediFrame();
  }

  invalidaDati(): void {
    this.motore.invalidaDati();
    this.richiediFrame();
  }

  inQuiete(): boolean {
    return !this.ancora && !this.frameRichiesto;
  }

  statistiche(): StatisticheFrame {
    return { ...this.stat };
  }

  onSelezione(cb: (e: EventoSelezione) => void): () => void {
    return iscrivi(this.ascSelezione, cb);
  }

  onPassaggio(cb: (ssid: number | null) => void): () => void {
    return iscrivi(this.ascPassaggio, cb);
  }

  onVista(cb: (s: StatoVista) => void): () => void {
    return iscrivi(this.ascVista, cb);
  }

  onRichiestaFrame(cb: () => void): () => void {
    if (this.rafInterno) {
      cancelAnimationFrame(this.rafInterno);
      this.rafInterno = 0;
    }
    return iscrivi(this.ascFrame, cb);
  }

  richiediFrame(): void {
    if (this.disposta) return;
    this.ancora = true;
    if (this.ascFrame.size > 0) {
      this.frameRichiesto = true;
      emetti(this.ascFrame, undefined);
      return;
    }
    if (this.rafInterno) return;
    this.frameRichiesto = true;
    this.rafInterno = requestAnimationFrame(() => {
      this.rafInterno = 0;
      if (this.disegna()) this.richiediFrame();
    });
  }

  /** Un frame completo nell'ordine del § 5.5. */
  disegna(): boolean {
    this.frameRichiesto = false;
    if (this.disposta || this.perso) {
      this.ancora = false;
      return false;
    }
    const t0 = performance.now();
    const m = this.motore;
    // Durata del frame per l'antialiasing temporale (solo in riproduzione).
    if (m.velocita !== 0 && Number.isFinite(this.ultimoFrameOra)) {
      const dt = Math.max(1 / 240, Math.min(0.25, (t0 - this.ultimoFrameOra) / 1000));
      m.intervalloFrameS = 0.9 * m.intervalloFrameS + 0.1 * dt;
    }
    this.ultimoFrameOra = t0;
    this.ridimensiona();
    // Passi 2-3: stati, origine, transizione.
    const transizione = m.aggiornaStati(t0);
    // Passo 4: controlli e matrici.
    const minimo = m.fuoco.inTransizione ? 1e-3 : m.distanzaMinimaFuoco();
    // Il minimo dei controlli vale dal bersaglio; quello dal centro del corpo (§ 10.3) è applicato dopo.
    const mossaControlli = this.controlli.aggiorna(minimo, distanzaMassima(m.camera.aspect));
    const mossa = m.limitaDistanzaDalCentro() || mossaControlli;
    if (!mossa) this.controlliAttivi = false;
    m.camera.updateMatrixWorld();
    // Passo 6 anticipato (proiezione unica), poi passo 5 su CPU.
    m.aggiornaVista(t0, this.larghezza, this.altezza);
    const costruite = m.aggiornaOrbite();
    m.aggiornaAnelli();
    const attesaEtichette = m.aggiornaEtichette(t0);
    for (const c of m.registro.corpi) {
      if (c.lune.length > 0) this.strato.impostaContatore(c.ssid, m.contatoreLune[c.ssid]!, m.layout.larghezza);
    }
    // Passo 5 su GPU: uniformi e attributi.
    this.grafo.sincronizza(this.pixelRatio, m.tempo ? m.tempo.jdTT : null);
    this.richiediTexture();
    const t1 = performance.now();
    // Passo 7: stelle, poi scena principale.
    const r = this.renderer;
    r.clear(true, true, true);
    if (this.grafo.cielo.punti.visible || this.grafo.cielo.eclitticaData.visible) r.render(this.grafo.scenaStelle, this.grafo.cameraStelle);
    r.clearDepth();
    r.render(this.grafo.scena, m.camera);
    const t2 = performance.now();
    // Passo 8: etichette (solo transform).
    this.strato.scrivi(m.layout, m.livelli.etichette);
    const t3 = performance.now();
    this.stat.cpuMs = t1 - t0 + (t3 - t2);
    this.stat.cpuMediaMs = this.stat.frame === 0 ? this.stat.cpuMs : 0.95 * this.stat.cpuMediaMs + 0.05 * this.stat.cpuMs;
    this.stat.frameMs = t3 - t0;
    this.stat.frame++;
    this.stat.orbiteRicostruite = costruite;
    // stars.bin alla fine del primo frame (§ 5.6); dopo un errore, nuovo tentativo quando le stelle servono.
    if (this.statoStelle === 'attesa' || (this.statoStelle === 'errore' && m.livelli.stelle && t3 >= this.stelleProssimo)) this.caricaStelle();
    const orbiteInAttesa = this.orbiteInAttesa();
    this.ancora = transizione || mossa || this.controlliAttivi || m.inAnimazione || attesaEtichette || orbiteInAttesa;
    // Vista: al massimo 10 notifiche al secondo durante il moto, sempre lo stato finale.
    this.emettiVista(!this.ancora);
    return this.ancora;
  }

  private orbiteInAttesa(): boolean {
    const m = this.motore;
    for (let i = 0; i < m.n; i++) if (m.orbitaAttiva[i] === 1 && m.orbitaVersioneTempo[i] !== m.versioneTempo) return true;
    return false;
  }

  /** Frame richiesto dopo ms millisecondi (nuovi tentativi delle risorse). */
  private frameTra(ms: number): void {
    const id = setTimeout(() => {
      this.timer.delete(id);
      this.richiediFrame();
    }, ms);
    this.timer.add(id);
  }

  /**
   * Texture dei corpi con raggio apparente oltre 8 px (§ 8.1). Dopo un errore il corpo torna richiedibile
   * all'attesa di attesaNuovoTentativoMs: il nuovo tentativo parte se in quel momento la texture serve.
   */
  private richiediTexture(): void {
    const f = this.opz.texture;
    if (!f) return;
    const m = this.motore;
    const ora = performance.now();
    for (let i = 0; i < m.n; i++) {
      if (this.texRichieste.has(i) || !(m.raggioPx[i]! > SOGLIA_TEXTURE_PX) || m.discoVisibile[i] !== 1) continue;
      const corpo = this.catalogo[i]!;
      if (!corpo.texture) continue;
      const errore = this.texErrori.get(i);
      if (errore && ora < errore.prossimo) continue;
      this.texRichieste.add(i);
      const info = corpo.texture;
      f.carica(corpo, this.abort.signal).then(
        (img) => {
          this.texErrori.delete(i);
          if (!img || this.disposta) return;
          const tex = creaTextureCorpo(img, this.renderer.capabilities.getMaxAnisotropy());
          this.grafo.impostaTexture(i, tex, info.lon0_u, info.verso);
          this.richiediFrame();
        },
        (e: unknown) => {
          if (annullata(e) || this.disposta) return;
          console.warn('Texture non caricata', corpo.slug, e);
          const tentativi = (this.texErrori.get(i)?.tentativi ?? 0) + 1;
          const attesa = attesaNuovoTentativoMs(tentativi);
          this.texErrori.set(i, { tentativi, prossimo: performance.now() + attesa });
          this.texRichieste.delete(i);
          this.frameTra(attesa + 20);
        },
      );
    }
  }

  /** stars.bin (§ 8.8); dopo un errore nuovo tentativo, con le stelle attive, all'attesa di attesaNuovoTentativoMs. */
  private caricaStelle(): void {
    const f = this.opz.stelle;
    if (!f) {
      this.statoStelle = 'pronte';
      return;
    }
    this.statoStelle = 'corso';
    setTimeout(() => {
      if (this.disposta) return;
      f.carica(this.abort.signal).then(
        (dati) => {
          if (this.disposta) return;
          this.statoStelle = 'pronte';
          this.grafo.cielo.impostaDati(dati);
          this.richiediFrame();
        },
        (e: unknown) => {
          if (annullata(e) || this.disposta) return;
          console.warn('Stelle non caricate', e);
          this.tentativiStelle++;
          const attesa = attesaNuovoTentativoMs(this.tentativiStelle);
          this.statoStelle = 'errore';
          this.stelleProssimo = performance.now() + attesa;
          this.frameTra(attesa + 20);
        },
      );
    }, 0);
  }

  leggiPixel(x: number, y: number, larghezza: number, altezza: number): PixelLetti {
    this.disegna();
    const pr = this.pixelRatio;
    const gl = this.renderer.getContext();
    const bw = this.grafo.risoluzione.x;
    const bh = this.grafo.risoluzione.y;
    const px = Math.max(0, Math.floor(x * pr));
    const pw = Math.max(1, Math.min(bw - px, Math.round(larghezza * pr)));
    const ph = Math.max(1, Math.min(bh, Math.round(altezza * pr)));
    const py = Math.max(0, bh - Math.floor(y * pr) - ph);
    const buf = new Uint8Array(4 * pw * ph);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // Righe dall'alto verso il basso.
    const dati = new Uint8Array(buf.length);
    for (let r = 0; r < ph; r++) dati.set(buf.subarray((ph - 1 - r) * 4 * pw, (ph - r) * 4 * pw), r * 4 * pw);
    return { larghezza: pw, altezza: ph, pixelRatio: pr, dati };
  }

  dispose(): void {
    if (this.disposta) return;
    this.disposta = true;
    this.abort.abort();
    if (this.rafInterno) cancelAnimationFrame(this.rafInterno);
    for (const id of this.timer) clearTimeout(id);
    this.timer.clear();
    this.osservatore?.disconnect();
    for (const r of this.rimuovi) r();
    this.gesti.dispose();
    this.controlli.dispose();
    this.strato.dispose();
    this.grafo.dispose();
    this.renderer.dispose();
  }
}

/** Crea la scena; lancia ErroreWebGL se WebGL2 non è disponibile. */
export function creaScena(opzioni: OpzioniScena): ScenaApi {
  return new ScenaWebGL(opzioni);
}
