// Avvio e collegamenti dell'applicazione (§ 5.5, § 5.6, § 6.6, § 11.11, § 11.12 di docs/PROGETTO.md).
// Sequenza: verifica di WebGL2; manifest.json; catalog.json; time.json (modello di ΔT); servizi, scena e
// interfaccia; blocchi della data iniziale e moon.bin; primo frame; poi reliability.bin, stelle (dalla scena
// dopo il primo frame) e texture (dalla scena, oltre 8 px di raggio apparente).
// Collegamenti: store → TimeState (una volta per cambio di data, § 5.5 punto 1) → scena e interfaccia;
// dati caricati → ricalcolo di stati e pannelli; eventi della scena → interfaccia (adattaScena).
// Errori d'avvio (§ 11.11, A18): ogni eccezione del costruttore della scena equivale all'assenza della scena
// (vista testuale); ogni altra eccezione della costruzione libera le risorse create e mostra il messaggio con
// "Riprova", mai una pagina vuota o un'eccezione non gestita.

import { ErroreWebGL, creaScena } from '../render/api';
import type { FornitoreTexture, ScenaApi } from '../render/api';
import { caricaCatalogo } from '../data/catalog';
import type { IndiceCatalogo } from '../data/catalog';
import { ArchivioDati, caricaManifest, creaDataStore } from '../data/dataStore';
import { caricaAffidabilita } from '../data/reliabilityReader';
import { leggiTimeDaBuffer, PERCORSO_TIME } from '../data/timeReader';
import { ServizioEffemeridi } from '../ephem/service';
import { impostaModelloTempo, makeTimeState } from '../time/timescale';
import type { MakeTimeState, TimeState } from '../time/types';
import { adattaScena } from '../ui/adattatoreScena';
import { h } from '../ui/dom';
import { creaInterfaccia } from '../ui/index';
import type { ControllerInterfaccia } from '../ui/index';
import { messaggioLimite } from '../ui/messaggi';
import { LINGUA } from '../ui/lingua';
import { T } from '../ui/testi';
import { TESTI_SCENA } from '../ui/testiScena';
import { Caricatore } from './caricamento';
import { adessoJdUT } from './clock';
import { creaFornitoreStelle, creaFornitoreTexture, creaOrientamento, creaStagione } from './fornitori';
import { creaPreferenze } from './preferenze';
import { consumaRipristino } from './ripristino';
import type { StatoRipristino } from './ripristino';
import { creaStoreApp } from './store';
import type { StoreApp } from './store';
import { creaUrlState } from './urlState';

/** Passaggio del cambio di lingua: letto e cancellato una sola volta, anche se l'avvio viene ripetuto con "Riprova". */
let ripristinoLetto = false;
let ripristinoAvvio: StatoRipristino | null = null;
function ripristinoDiAvvio(): StatoRipristino | null {
  if (!ripristinoLetto) {
    ripristinoLetto = true;
    ripristinoAvvio = consumaRipristino();
  }
  return ripristinoAvvio;
}

export interface App {
  readonly store: StoreApp;
  readonly ui: ControllerInterfaccia;
  readonly servizio: ServizioEffemeridi;
  /** null senza WebGL2 (vista testuale). */
  readonly scena: ScenaApi | null;
  readonly archivio: ArchivioDati;
  readonly catalogo: IndiceCatalogo;
  readonly caricatore: Caricatore;
  readonly makeTimeState: MakeTimeState;
  /** TimeState della data corrente (calcolato una volta per cambio di data). */
  tempo(): TimeState;
  /** Frame disegnati dalla scena. */
  frameDisegnati(): number;
  /** Vero dopo il caricamento di reliability.bin. */
  affidabilitaCaricata(): boolean;
  /** Slug dei corpi con la texture decodificata e consegnata alla scena. */
  textureCaricate(): ReadonlySet<string>;
  distruggi(): void;
}

/** Verifica preventiva di WebGL2 (§ 11.11): getContext('webgl2') dentro try/catch. */
export function verificaWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return c.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

function schermataCaricamento(radice: HTMLElement): void {
  radice.replaceChildren(
    h(
      'div',
      { class: 'ss-avvio', role: 'status' },
      h('p', { class: 'ss-avvio-titolo' }, T.avvio.titolo),
      h('p', null, T.avvio.caricamento),
    ),
  );
}

function schermataErrore(radice: HTMLElement, testo: string, riprova: () => void): void {
  const pulsante = h('button', { type: 'button', class: 'ss-pulsante' }, T.messaggi.riprova);
  pulsante.addEventListener('click', riprova);
  radice.replaceChildren(
    h('div', { class: 'ss-avvio', role: 'alert' }, h('p', { class: 'ss-avvio-titolo' }, T.avvio.titolo), h('p', null, testo), pulsante),
  );
  pulsante.focus();
}

/** Rilascia il contesto WebGL lasciato da un costruttore della scena interrotto. */
function rilasciaContesto(canvas: HTMLCanvasElement): void {
  try {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // nessun contesto da rilasciare
  }
}

interface Base {
  archivio: ArchivioDati;
  catalogo: IndiceCatalogo;
  eo: ReturnType<typeof leggiTimeDaBuffer>['eo'];
}

/** Dati di base: manifest, catalogo, modello del tempo. */
async function caricaBase(): Promise<Base> {
  const manifest = await caricaManifest();
  const archivio = creaDataStore({ manifest });
  const [catalogo, bufTempo] = await Promise.all([caricaCatalogo(archivio, undefined, LINGUA), archivio.carica(PERCORSO_TIME)]);
  const tempo = leggiTimeDaBuffer(bufTempo);
  impostaModelloTempo(tempo.deltaT);
  return { archivio, catalogo, eo: tempo.eo };
}

/**
 * Avvia l'applicazione nella radice. In caso di errore sui dati di base o nella costruzione mostra il messaggio
 * con "Riprova" e risolve alla riuscita del tentativo successivo.
 */
export function avvia(radice: HTMLElement): Promise<App> {
  return new Promise<App>((risolvi) => {
    const tenta = (): void => {
      schermataCaricamento(radice);
      caricaBase().then(
        (base) => {
          let app: App;
          try {
            app = costruisci(radice, base);
          } catch {
            schermataErrore(radice, T.avvio.erroreAvvio, tenta);
            return;
          }
          risolvi(app);
        },
        () => schermataErrore(radice, T.avvio.errore, tenta),
      );
    };
    tenta();
  });
}

/** Costruzione dell'applicazione; con un'eccezione libera le risorse già create e la rilancia. */
function costruisci(radice: HTMLElement, base: Base): App {
  const pulizie: (() => void)[] = [];
  try {
    return costruisciApp(radice, base, pulizie);
  } catch (e) {
    for (let i = pulizie.length - 1; i >= 0; i--) {
      try {
        pulizie[i]!();
      } catch {
        // si prosegue con le altre risorse
      }
    }
    throw e;
  }
}

function costruisciApp(radice: HTMLElement, base: Base, pulizie: (() => void)[]): App {
  const { archivio, catalogo, eo } = base;
  const corpi = catalogo.corpi;
  const ssidTerra = catalogo.perSlug('terra')?.ssid ?? -1;
  const servizio = new ServizioEffemeridi({ catalogo: catalogo.catalogo, store: archivio });
  pulizie.push(() => servizio.dispose());
  const orientamento = creaOrientamento(corpi, servizio, eo);

  // Texture consegnate alla scena (per i ganci di test e la diagnostica).
  const texturePronte = new Set<string>();
  const fornitoreTexture = creaFornitoreTexture(archivio);
  const texture: FornitoreTexture = {
    carica: (corpo, segnale) =>
      fornitoreTexture.carica(corpo, segnale).then((img) => {
        if (img) texturePronte.add(corpo.slug);
        return img;
      }),
  };

  // Scena 3D (WebGL2); senza WebGL2 o con il costruttore interrotto la vista testuale (§ 11.9, § 11.11).
  let scena: ScenaApi | null = null;
  const canvas = document.createElement('canvas');
  const etichette = document.createElement('div');
  if (verificaWebGL2()) {
    try {
      scena = creaScena({
        canvas,
        etichette,
        catalogo: catalogo.catalogo,
        effemeridi: servizio,
        orientamento,
        texture,
        stelle: creaFornitoreStelle(archivio),
        testi: TESTI_SCENA,
      });
    } catch (e) {
      if (!(e instanceof ErroreWebGL)) rilasciaContesto(canvas);
      scena = null;
    }
  }
  if (scena) {
    const s = scena;
    pulizie.push(() => s.dispose());
  }

  radice.replaceChildren();
  // Istante iniziale limitato all'intervallo (I2) da statoIniziale.
  const orologio = adessoJdUT();
  const store = creaStoreApp(orologio);
  const t0Orologio = store.get().tempo;
  // Dopo il cambio di lingua (§ 11.12): data e ora come prima della ricarica, dal passaggio una tantum in sessionStorage.
  const ripristino = ripristinoDiAvvio();
  if (ripristino !== null) store.set({ tempo: { jd: ripristino.jd, scala: ripristino.scala }, offsetMinuti: ripristino.offsetMinuti });
  const t0 = store.get().tempo;
  let tempo: TimeState = makeTimeState(t0.jd, t0.scala);
  scena?.impostaTempo(tempo);
  const url = creaUrlState();
  let caricatoreRif: Caricatore | null = null;
  const ui = creaInterfaccia(radice, {
    effemeridi: servizio,
    makeTimeState,
    scena: scena ? adattaScena(scena, canvas, etichette) : null,
    adessoJdUT,
    preferenze: creaPreferenze(),
    catalogo: catalogo.catalogo,
    url,
    store,
    stagione: creaStagione(servizio, ssidTerra),
    datiInErrore: (jdTT) => caricatoreRif?.inErrore(jdTT) ?? false,
    ripristino,
  });
  pulizie.push(() => ui.distruggi());
  // Orologio di sistema fuori dall'intervallo: messaggio del limite (§ 11.4.3).
  if (ripristino === null && t0Orologio.jd !== orologio) {
    ui.notifica('limite', messaggioLimite(orologio < t0Orologio.jd ? 'inferiore' : 'superiore', t0Orologio.jd, { offsetMinuti: null, scala: 'UT' }));
  }

  // --- Tempo: un TimeState per cambio di data (§ 5.5 punto 1) ---
  const annullatori: (() => void)[] = [];
  pulizie.push(() => {
    for (const a of annullatori) a();
  });
  annullatori.push(
    store.osserva(
      (s) => s.tempo,
      (t) => {
        tempo = makeTimeState(t.jd, t.scala);
        scena?.impostaTempo(tempo);
        ui.aggiornaTempo(tempo);
      },
    ),
  );

  // --- Ciclo dei frame (R12: rendering su richiesta; in riproduzione a ogni frame) ---
  let frame = 0;
  let pianificato = false;
  let rafId = 0;
  // Il primo frame segue il caricamento dei dati della data iniziale (§ 5.6).
  let frameAbilitati = false;
  const disegna = (): void => {
    pianificato = false;
    rafId = 0;
    if (!scena) return;
    const ancora = scena.disegna();
    frame++;
    if (ancora) pianifica();
  };
  const pianifica = (): void => {
    if (pianificato || !scena || !frameAbilitati) return;
    pianificato = true;
    rafId = requestAnimationFrame(disegna);
  };
  if (scena) annullatori.push(scena.onRichiestaFrame(pianifica));

  // --- Dati caricati: ricalcolo di stati, orbite e pannelli ---
  annullatori.push(
    servizio.onDati(() => {
      scena?.invalidaDati();
      ui.aggiornaTempo(tempo);
    }),
  );

  const caricatore = new Caricatore({ servizio, store, makeTimeState, ui });
  caricatoreRif = caricatore;
  pulizie.push(() => caricatore.distruggi());

  // --- Sequenza di avvio: dati della data iniziale, primo frame, poi reliability.bin ---
  let affidabilitaPronta = false;
  const caricaAffidabilitaConRiprova = (): void => {
    caricaAffidabilita(archivio).then(
      (dati) => {
        servizio.impostaAffidabilita(dati);
        affidabilitaPronta = true;
        ui.rimuoviErrore('affidabilita');
        ui.aggiornaAffidabilita();
      },
      () => ui.mostraErrore({ id: 'affidabilita', testo: T.messaggi.affidabilita, riprova: caricaAffidabilitaConRiprova }),
    );
  };
  caricatore.esegui();
  // L'errore dei dati della data è già in pagina con "Riprova": il primo frame si abilita comunque.
  caricatore
    .attendi()
    .catch(() => undefined)
    .then(() => {
      frameAbilitati = true;
      pianifica();
      // Dopo il primo frame (§ 5.6): reliability.bin, poi i blocchi adiacenti; stelle e texture dalla scena.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          caricaAffidabilitaConRiprova();
          caricatore.abilitaAdiacenti();
        }),
      );
    })
    .catch(() => undefined);

  return {
    store,
    ui,
    servizio,
    scena,
    archivio,
    catalogo,
    caricatore,
    makeTimeState,
    tempo: () => tempo,
    frameDisegnati: () => frame,
    affidabilitaCaricata: () => affidabilitaPronta,
    textureCaricate: () => texturePronte,
    distruggi() {
      for (const a of annullatori) a();
      if (rafId) cancelAnimationFrame(rafId);
      caricatore.distruggi();
      ui.distruggi();
      scena?.dispose();
      servizio.dispose();
    },
  };
}
