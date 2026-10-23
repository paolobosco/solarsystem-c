// Caricatore dei blocchi (§ 5.6, § 11.11) con il servizio delle effemeridi e l'archivio dei dati reali: errori
// dei blocchi legati alle date che li richiedono (messaggio rimosso fuori dal periodo, nuovo tentativo al
// ritorno), moon.bin come risorsa unica con un solo messaggio, stato d'errore per la riproduzione.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Caricatore } from '../../src/app/caricamento';
import type { InterfacciaCaricamento } from '../../src/app/caricamento';
import { creaStoreApp } from '../../src/app/store';
import { fineBlocco, inizioBlocco } from '../../src/data/binHeader';
import { leggiCatalogo } from '../../src/data/catalog';
import { ArchivioDati } from '../../src/data/dataStore';
import type { FunzioneFetch } from '../../src/data/dataStore';
import { IndiceManifest, leggiManifest } from '../../src/data/manifest';
import { ServizioEffemeridi } from '../../src/ephem/service';
import type { MakeTimeState } from '../../src/time/types';
import type { StatoCaricamento } from '../../src/ui/index';
import { T } from '../../src/ui/testi.it';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
const manifest = new IndiceManifest(leggiManifest(JSON.parse(readFileSync(new URL('manifest.json', DATI), 'utf-8'))));
const file = new Map<string, ArrayBuffer>();

function leggi(percorso: string): ArrayBuffer {
  let b = file.get(percorso);
  if (!b) {
    const x = readFileSync(new URL(percorso, DATI));
    b = new ArrayBuffer(x.byteLength);
    new Uint8Array(b).set(x);
    file.set(percorso, b);
  }
  return b;
}

/** TT = UT: la scelta dei blocchi non dipende da ΔT in queste prove. */
const makeTimeState: MakeTimeState = (jd, scala) => ({ jdUT: jd, jdTT: jd, deltaT: 0, deltaTSigma: 0, scalaIngresso: scala });

class UiFinta implements InterfacciaCaricamento {
  readonly messaggi = new Map<string, { testo: string; riprova?: () => void }>();
  caricamento: StatoCaricamento | null = null;
  impostaCaricamento(s: StatoCaricamento | null): void {
    this.caricamento = s;
  }
  erroreBlocco(id: string, jd0: number, jd1: number, riprova: () => void): void {
    this.messaggi.set(id, { testo: `${jd0}-${jd1}`, riprova });
  }
  mostraErrore(e: { id: string; testo: string; riprova?: () => void }): void {
    this.messaggi.set(e.id, { testo: e.testo, riprova: e.riprova });
  }
  rimuoviErrore(id: string): void {
    this.messaggi.delete(id);
  }
  /** "Riprova" come nell'interfaccia: il messaggio si rimuove, poi l'azione. */
  premiRiprova(id: string): void {
    const m = this.messaggi.get(id);
    this.messaggi.delete(id);
    m?.riprova?.();
  }
}

/**
 * Applicazione minima: archivio con risposte 404 per i percorsi in `guasti`, senza risposta per quelli in
 * `sospesi` e con la verifica SHA-256 in sospeso fino a sbloccaVerifiche() per quelli in `trattenuti`;
 * servizio, store e caricatore.
 */
function banco(jd0: number, limiteInattivitaMs?: number) {
  const guasti = new Set<string>();
  const sospesi = new Set<string>();
  const trattenuti = new Set<string>();
  const inVerifica: string[] = [];
  const attese: (() => void)[] = [];
  const richieste: string[] = [];
  const fetch: FunzioneFetch = async (url, init) => {
    richieste.push(url);
    if (init.signal.aborted) throw new Error('annullata');
    if (sospesi.has(url)) {
      return new Promise((_r, rifiuta) => {
        init.signal.addEventListener('abort', () => rifiuta(Object.assign(new Error('annullata'), { name: 'AbortError' })));
      });
    }
    if (guasti.has(url)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const b = leggi(url);
    return { ok: true, status: 200, arrayBuffer: async () => b };
  };
  const archivio = new ArchivioDati({
    manifest,
    fetch,
    risolvi: (p) => p,
    sha256: async (b) => {
      const percorso = [...file].find(([, x]) => x === b)?.[0];
      if (percorso !== undefined && trattenuti.has(percorso)) {
        inVerifica.push(percorso);
        await new Promise<void>((r) => attese.push(r));
      }
      return createHash('sha256').update(new Uint8Array(b)).digest('hex');
    },
    limiteInattivitaMs,
  });
  const servizio = new ServizioEffemeridi({ catalogo, store: archivio });
  const store = creaStoreApp(jd0);
  const ui = new UiFinta();
  const caricatore = new Caricatore({
    servizio,
    store,
    makeTimeState,
    ui,
    pianifica: (cb) => setTimeout(cb, 0) as unknown as number,
    annulla: (id) => clearTimeout(id),
  });
  const quiete = () => vi.waitFor(() => expect(caricatore.occupato).toBe(false), { timeout: 20_000, interval: 5 });
  const data = (jd: number) => store.aggiorna('tempo', { jd });
  const conta = (percorso: string) => richieste.filter((r) => r === percorso).length;
  const sbloccaVerifiche = (): void => {
    trattenuti.clear();
    attese.splice(0).forEach((r) => r());
  };
  return { guasti, sospesi, trattenuti, inVerifica, sbloccaVerifiche, richieste, archivio, servizio, store, ui, caricatore, quiete, data, conta };
}

const centro = (k: number): number => 0.5 * (inizioBlocco(k) + fineBlocco(k));

describe('errore di un blocco legato alla sua data (§ 5.6, § 11.11)', () => {
  it('messaggio rimosso quando la data lascia il blocco; nuovo tentativo al ritorno sulla sua data', async () => {
    const b = banco(centro(5));
    b.guasti.add('planets/p05.bin');
    b.caricatore.abilitaAdiacenti();
    await b.quiete();
    expect([...b.ui.messaggi.keys()]).toEqual(['blocco:5']);
    expect(b.ui.caricamento).toBeNull();
    expect(b.conta('planets/p05.bin')).toBe(1);
    // Data di un altro blocco: il messaggio non riguarda più la data mostrata.
    b.data(centro(9));
    await b.quiete();
    expect(b.servizio.pronto(centro(9))).toBe(true);
    expect(b.ui.messaggi.size).toBe(0);
    // Rete ripristinata, ritorno sulla data: nuova richiesta senza "Riprova".
    b.guasti.clear();
    b.data(centro(5));
    await b.quiete();
    expect(b.conta('planets/p05.bin')).toBe(2);
    expect(b.servizio.pronto(centro(5))).toBe(true);
    expect(b.ui.messaggi.size).toBe(0);
    b.caricatore.distruggi();
  });

  it('stato d\'errore per la riproduzione: vero solo finché i dati della data mancano per un errore', async () => {
    const b = banco(centro(5));
    b.guasti.add('planets/p05.bin');
    b.caricatore.abilitaAdiacenti();
    await b.quiete();
    expect(b.caricatore.inErrore(centro(5))).toBe(true);
    expect(b.caricatore.inErrore(centro(9))).toBe(false);
    b.guasti.clear();
    b.ui.premiRiprova('blocco:5');
    await b.quiete();
    expect(b.caricatore.inErrore(centro(5))).toBe(false);
    b.caricatore.distruggi();
  });

  it('con l\'errore ancora presente il ritorno produce un solo nuovo tentativo e il messaggio', async () => {
    const b = banco(centro(5));
    b.guasti.add('planets/p05.bin');
    b.caricatore.abilitaAdiacenti();
    await b.quiete();
    // Cambi di data dentro lo stesso blocco: nessuna nuova richiesta finché il blocco resta voluto.
    b.data(centro(5) + 1000);
    await b.quiete();
    expect(b.conta('planets/p05.bin')).toBe(1);
    b.data(centro(9));
    await b.quiete();
    b.data(centro(5));
    await b.quiete();
    expect(b.conta('planets/p05.bin')).toBe(2);
    expect([...b.ui.messaggi.keys()]).toEqual(['blocco:5']);
    // "Riprova" dopo il ripristino.
    b.guasti.clear();
    b.ui.premiRiprova('blocco:5');
    await b.quiete();
    expect(b.servizio.pronto(centro(5))).toBe(true);
    expect(b.ui.messaggi.size).toBe(0);
    b.caricatore.distruggi();
  });
});

describe('moon.bin come risorsa unica (§ 5.6, § 8.4, § 11.11)', () => {
  it('un solo messaggio per la Luna, nessun errore attribuito ai blocchi; "Riprova" lo risolve', async () => {
    // 2026: blocco 12 a meno di 50 anni dal confine con l'11, quindi due blocchi voluti.
    const jd = 2_461_000.5;
    const b = banco(jd);
    b.guasti.add('moon.bin');
    b.caricatore.esegui();
    await b.quiete();
    b.caricatore.abilitaAdiacenti();
    await b.quiete();
    expect([...b.ui.messaggi.keys()]).toEqual(['luna']);
    expect(b.ui.messaggi.get('luna')!.testo).toBe(T.messaggi.luna);
    for (const k of [11, 12]) {
      expect(b.servizio.bloccoCaricato('pianeti', k) && b.servizio.bloccoCaricato('satelliti', k) && b.servizio.bloccoCaricato('piccoli-corpi', k)).toBe(true);
    }
    expect(b.caricatore.inErrore(jd)).toBe(true);
    expect(b.ui.caricamento).toBeNull();
    // Il messaggio resta a ogni data: moon.bin serve a tutto l'intervallo.
    b.data(centro(9));
    await b.quiete();
    expect([...b.ui.messaggi.keys()]).toEqual(['luna']);
    b.data(jd);
    await b.quiete();
    b.guasti.clear();
    b.ui.premiRiprova('luna');
    await b.quiete();
    expect(b.servizio.pronto(jd)).toBe(true);
    expect(b.caricatore.inErrore(jd)).toBe(false);
    expect(b.ui.messaggi.size).toBe(0);
    expect(b.conta('moon.bin')).toBe(2);
    b.caricatore.distruggi();
  });
});

describe('richiesta senza risposta (§ 5.6, § 11.11)', () => {
  it('blocco della data iniziale: dopo il limite errore con "Riprova" e attendi() concluso; "Riprova" carica', async () => {
    const b = banco(centro(5), 100);
    b.sospesi.add('planets/p05.bin');
    b.caricatore.esegui();
    // attendi() (avvio, primo frame) non ha segnale: si conclude con l'errore invece di restare in sospeso
    await expect(b.caricatore.attendi()).rejects.toMatchObject({ codice: 'rete' });
    await b.quiete();
    expect([...b.ui.messaggi.keys()]).toEqual(['blocco:5']);
    expect(b.ui.caricamento).toBeNull();
    expect(b.caricatore.inErrore(centro(5))).toBe(true);
    b.sospesi.clear();
    b.ui.premiRiprova('blocco:5');
    await b.quiete();
    expect(b.servizio.pronto(centro(5))).toBe(true);
    expect(b.ui.messaggi.size).toBe(0);
    expect(b.conta('planets/p05.bin')).toBe(2);
    b.caricatore.distruggi();
  }, 10_000);
});

describe('richieste annullate o interrotte (§ 5.6, § 11.11)', () => {
  it('ritorno sul blocco durante la verifica SHA-256 della richiesta annullata: nuova richiesta, blocco caricato', async () => {
    const b = banco(centro(5));
    b.trattenuti.add('planets/p05.bin');
    b.caricatore.esegui();
    await vi.waitFor(() => expect(b.inVerifica).toEqual(['planets/p05.bin']));
    // uscita dal blocco e ritorno immediato (Fine e Inizio sul regolo) mentre la verifica è in corso
    b.data(centro(9));
    b.data(centro(5));
    b.sbloccaVerifiche();
    await b.quiete();
    expect(b.conta('planets/p05.bin')).toBe(2);
    expect(b.servizio.pronto(centro(5))).toBe(true);
    expect(b.ui.caricamento).toBeNull();
    expect(b.ui.messaggi.size).toBe(0);
    b.caricatore.distruggi();
  });

  it('richiesta interrotta da altri con il blocco ancora voluto: nuovo tentativo, nessun errore', async () => {
    const b = banco(centro(5));
    b.sospesi.add('planets/p05.bin');
    b.caricatore.esegui();
    await vi.waitFor(() => expect(b.conta('planets/p05.bin')).toBe(1));
    b.sospesi.clear();
    // risorsa liberata durante il caricamento: AbortError con il segnale del caricatore attivo
    b.archivio.rilascia('planets/p05.bin');
    await b.quiete();
    expect(b.conta('planets/p05.bin')).toBe(2);
    expect(b.servizio.pronto(centro(5))).toBe(true);
    expect(b.ui.messaggi.size).toBe(0);
    b.caricatore.distruggi();
  });

  it('moon.bin interrotto da altri: nuovo tentativo, nessun errore', async () => {
    const b = banco(centro(5));
    b.sospesi.add('moon.bin');
    b.caricatore.esegui();
    await vi.waitFor(() => expect(b.conta('moon.bin')).toBe(1));
    b.sospesi.clear();
    b.archivio.rilascia('moon.bin');
    await b.quiete();
    expect(b.conta('moon.bin')).toBe(2);
    expect(b.servizio.pronto(centro(5))).toBe(true);
    expect(b.ui.messaggi.size).toBe(0);
    b.caricatore.distruggi();
  });
});
