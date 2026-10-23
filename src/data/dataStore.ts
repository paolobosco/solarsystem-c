// Archivio delle risorse di data/v1/ (contratto DataStore, § 5.4 e § 5.6 di docs/PROGETTO.md).
// - Promise condivisa tra richiedenti; ogni richiedente può annullare con il proprio AbortSignal; la richiesta
//   di rete si interrompe quando tutti i richiedenti hanno annullato. Una nuova richiesta della stessa risorsa
//   ne avvia un'altra anche se quella interrotta non si è ancora conclusa (ad esempio durante la verifica).
// - Cache LRU di 3 blocchi per tipo di file a blocchi (pianeti, satelliti, piccoli corpi).
// - Verifiche prima di consegnare il buffer: dimensione del manifest; per i binari magic, versione, tipo,
//   blocco e dimensione dell'intestazione (§ 8.2); SHA-256 del manifest con crypto.subtle o, nei contesti non
//   sicuri dove manca, con sha256Js. I nomi in data/v1/ sono stabili e la cache HTTP può conservare la versione
//   precedente di un file: una copia non conforme si scarica subito una seconda volta dal server (cache
//   'reload'); se fallisce ancora la risorsa è scartata e passa allo stato 'errore', e la nuova richiesta dopo
//   un errore usa di nuovo 'reload'. manifest.json si rivalida a ogni caricamento (cache 'no-cache').
// - Limite d'inattività: senza risposta o senza byte ricevuti per LIMITE_INATTIVITA_MS la richiesta si annulla
//   con un ErroreDati 'rete' (messaggio con "Riprova", § 11.11), anche per i richiedenti senza segnale.
// - Stati: 'assente' → 'in-caricamento' → 'pronto' | 'errore'; notifiche con onCambio.

import { assetUrl } from './assetUrl';
import { ErroreFormato, leggiIntestazione } from './binHeader';
import type { DataStore, StatoRisorsa } from './types';
import { IndiceManifest, MAGIC_PER_TIPO, PERCORSO_MANIFEST, TIPI_A_BLOCCHI, leggiManifest } from './manifest';
import type { TipoFile, VoceManifest } from './manifest';
import { sha256Js } from './sha256';

export const CAPACITA_LRU = 3;
/** Inattività massima di una richiesta: nessuna risposta o nessun byte ricevuto (§ 5.6). */
export const LIMITE_INATTIVITA_MS = 30_000;

export type CodiceErroreDati = 'rete' | 'http' | 'manifest' | 'dimensione' | 'formato' | 'sha256';

/** Risorsa non disponibile o non conforme. */
export class ErroreDati extends Error {
  readonly codice: CodiceErroreDati;
  readonly percorso: string;
  constructor(codice: CodiceErroreDati, percorso: string, messaggio: string) {
    super(`${percorso}: ${messaggio}`);
    this.name = 'ErroreDati';
    this.codice = codice;
    this.percorso = percorso;
  }
}

/** Sottoinsieme di Response usato dall'archivio. */
export interface RispostaMinima {
  ok: boolean;
  status: number;
  /** Corpo a flusso (Response.body): letto a pezzi per misurare l'inattività; senza, si usa arrayBuffer(). */
  body?: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FunzioneFetch = (url: string, init: { signal: AbortSignal; cache?: RequestCache }) => Promise<RispostaMinima>;

export interface OpzioniDataStore {
  /** Manifest dei dati: senza manifest nessuna risorsa è verificabile e ogni richiesta fallisce. */
  manifest: IndiceManifest;
  fetch?: FunzioneFetch;
  /** Risoluzione del percorso relativo in data/v1/ in URL; predefinita: assetUrl('data/v1/' + percorso). */
  risolvi?: (percorso: string) => string;
  /** SHA-256 esadecimale minuscolo; predefinita: sha256Esadecimale. */
  sha256?: (buf: ArrayBuffer) => Promise<string>;
  capacitaLRU?: number;
  /** Predefinito: LIMITE_INATTIVITA_MS. */
  limiteInattivitaMs?: number;
}

const ESADECIMALI = Array.from({ length: 256 }, (_, i) => (i < 16 ? '0' : '') + i.toString(16));

/**
 * SHA-256 in esadecimale minuscolo con Web Crypto (crypto.subtle). Nei contesti non sicuri (pagina in HTTP da un
 * host non locale) crypto.subtle non esiste: si usa l'implementazione JavaScript.
 */
export async function sha256Esadecimale(buf: ArrayBuffer): Promise<string> {
  const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;
  const d = subtle ? new Uint8Array(await subtle.digest('SHA-256', buf)) : sha256Js(buf);
  let s = '';
  for (const b of d) s += ESADECIMALI[b]!;
  return s;
}

function erroreAnnullamento(): Error {
  const e = new Error('Richiesta annullata');
  e.name = 'AbortError';
  return e;
}

function fetchPredefinita(url: string, init: { signal: AbortSignal; cache?: RequestCache }): Promise<RispostaMinima> {
  return globalThis.fetch(url, init.cache === undefined ? { signal: init.signal } : { signal: init.signal, cache: init.cache });
}

/**
 * Scarica url e ne legge il corpo. Senza risposta o senza byte ricevuti per limiteMs la richiesta si annulla e
 * rifiuta con ErroreDati 'rete', come una rete assente; con `segnale` annullato rifiuta con AbortError.
 */
async function scaricaCorpo(
  f: FunzioneFetch,
  url: string,
  percorso: string,
  segnale: AbortSignal,
  cache: RequestCache,
  limiteMs: number,
): Promise<ArrayBuffer> {
  if (segnale.aborted) throw erroreAnnullamento();
  const ac = new AbortController();
  let scaduta = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arma = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      scaduta = true;
      ac.abort();
    }, limiteMs);
  };
  const inoltra = (): void => ac.abort();
  segnale.addEventListener('abort', inoltra, { once: true });
  // Rifiuta all'annullamento anche se fetch o il corpo non reagiscono al segnale.
  const interrotta = new Promise<never>((_r, rifiuta) => {
    ac.signal.addEventListener('abort', () => rifiuta(erroreAnnullamento()), { once: true });
  });
  interrotta.catch(() => undefined);
  arma();
  try {
    const r = await Promise.race([f(url, cache === 'default' ? { signal: ac.signal } : { signal: ac.signal, cache }), interrotta]);
    if (!r.ok) throw new ErroreDati('http', percorso, `risposta HTTP ${r.status}`);
    arma();
    const corpo = r.body;
    if (!corpo) return await Promise.race([r.arrayBuffer(), interrotta]);
    const lettore = corpo.getReader();
    const pezzi: Uint8Array[] = [];
    let n = 0;
    try {
      for (;;) {
        const x = await Promise.race([lettore.read(), interrotta]);
        if (x.done) break;
        arma();
        pezzi.push(x.value);
        n += x.value.byteLength;
      }
    } catch (e) {
      lettore.cancel().catch(() => undefined);
      throw e;
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of pezzi) {
      out.set(p, o);
      o += p.byteLength;
    }
    return out.buffer;
  } catch (e) {
    if (segnale.aborted) throw erroreAnnullamento();
    if (scaduta) throw new ErroreDati('rete', percorso, `nessun dato ricevuto per ${limiteMs / 1000} s`);
    if (e instanceof ErroreDati) throw e;
    throw new ErroreDati('rete', percorso, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    segnale.removeEventListener('abort', inoltra);
  }
}

export function percorsoDati(percorso: string): string {
  return `data/v1/${percorso}`;
}

interface Voce {
  stato: StatoRisorsa;
  promessa: Promise<ArrayBuffer> | null;
  buffer: ArrayBuffer | null;
  controller: AbortController | null;
  richiedenti: number;
  tipo: TipoFile | null;
  uso: number;
}

/** Verifica dimensione, intestazione binaria e SHA-256 rispetto alla voce del manifest. */
export async function verificaRisorsa(
  buf: ArrayBuffer,
  voce: VoceManifest,
  sha256: (b: ArrayBuffer) => Promise<string> = sha256Esadecimale,
): Promise<void> {
  if (buf.byteLength !== voce.byte) {
    throw new ErroreDati('dimensione', voce.percorso, `dimensione ${buf.byteLength} invece di ${voce.byte}`);
  }
  const magic = MAGIC_PER_TIPO[voce.tipo];
  if (magic !== null) {
    try {
      const i = leggiIntestazione(buf, magic);
      const atteso = voce.blocco ?? -1;
      if (i.blocco !== atteso) throw new ErroreFormato(`blocco ${i.blocco} invece di ${atteso}`);
    } catch (e) {
      if (e instanceof ErroreFormato) throw new ErroreDati('formato', voce.percorso, e.message);
      throw e;
    }
  }
  const h = await sha256(buf);
  if (h !== voce.sha256) throw new ErroreDati('sha256', voce.percorso, 'SHA-256 diverso da quello del manifest');
}

export class ArchivioDati implements DataStore {
  private readonly voci = new Map<string, Voce>();
  private readonly ascoltatori = new Set<(chiave: string, stato: StatoRisorsa) => void>();
  private readonly manifest: IndiceManifest;
  private readonly fetchFn: FunzioneFetch;
  private readonly risolvi: (percorso: string) => string;
  private readonly sha256: (buf: ArrayBuffer) => Promise<string>;
  private readonly capacita: number;
  private readonly limiteMs: number;
  /** Risorse il cui ultimo tentativo è fallito: il successivo scavalca la cache HTTP. */
  private readonly daRicaricare = new Set<string>();
  private contatoreUso = 0;

  constructor(opz: OpzioniDataStore) {
    this.manifest = opz.manifest;
    this.fetchFn = opz.fetch ?? fetchPredefinita;
    this.risolvi = opz.risolvi ?? ((p) => assetUrl(percorsoDati(p)));
    this.sha256 = opz.sha256 ?? sha256Esadecimale;
    this.capacita = opz.capacitaLRU ?? CAPACITA_LRU;
    this.limiteMs = opz.limiteInattivitaMs ?? LIMITE_INATTIVITA_MS;
  }

  stato(chiave: string): StatoRisorsa {
    return this.voci.get(chiave)?.stato ?? 'assente';
  }

  /** Buffer già pronto (senza avviare richieste), oppure null. */
  pronto(chiave: string): ArrayBuffer | null {
    const v = this.voci.get(chiave);
    if (v?.stato !== 'pronto' || v.buffer === null) return null;
    v.uso = ++this.contatoreUso;
    return v.buffer;
  }

  carica(chiave: string, segnale?: AbortSignal): Promise<ArrayBuffer> {
    if (segnale?.aborted) return Promise.reject(erroreAnnullamento());
    let v = this.voci.get(chiave);
    if (v?.stato === 'pronto' && v.buffer !== null) {
      v.uso = ++this.contatoreUso;
      return Promise.resolve(v.buffer);
    }
    // Richiesta interrotta da tutti i richiedenti ma non ancora conclusa: rifiuterà con AbortError, se ne avvia un'altra.
    if (v === undefined || v.promessa === null || v.controller?.signal.aborted === true) v = this.avvia(chiave);
    return this.richiedente(v, segnale);
  }

  rilascia(chiave: string): void {
    const v = this.voci.get(chiave);
    if (v === undefined) return;
    this.voci.delete(chiave);
    if (v.controller !== null && v.promessa !== null) v.controller.abort();
    if (v.stato !== 'assente') this.notifica(chiave, 'assente');
  }

  onCambio(cb: (chiave: string, stato: StatoRisorsa) => void): () => void {
    this.ascoltatori.add(cb);
    return () => {
      this.ascoltatori.delete(cb);
    };
  }

  private notifica(chiave: string, stato: StatoRisorsa): void {
    for (const cb of this.ascoltatori) {
      try {
        cb(chiave, stato);
      } catch (e) {
        // un ascoltatore difettoso non interrompe gli altri: l'errore resta visibile come eccezione non gestita
        queueMicrotask(() => {
          throw e;
        });
      }
    }
  }

  private imposta(chiave: string, v: Voce, stato: StatoRisorsa): void {
    if (this.voci.get(chiave) !== v) return; // voce rilasciata nel frattempo
    v.stato = stato;
    this.notifica(chiave, stato);
  }

  private avvia(chiave: string): Voce {
    const voce = this.manifest.voce(chiave);
    const controller = new AbortController();
    const v: Voce = {
      stato: 'in-caricamento',
      promessa: null,
      buffer: null,
      controller,
      richiedenti: 0,
      tipo: voce?.tipo ?? null,
      uso: ++this.contatoreUso,
    };
    this.voci.set(chiave, v);
    this.notifica(chiave, 'in-caricamento');
    const cache: RequestCache = this.daRicaricare.has(chiave) ? 'reload' : 'default';
    v.promessa = this.scarica(chiave, voce, controller.signal, cache).then(
      (buf) => {
        this.daRicaricare.delete(chiave);
        v.promessa = null;
        v.controller = null;
        v.buffer = buf;
        v.uso = ++this.contatoreUso;
        this.imposta(chiave, v, 'pronto');
        this.applicaLRU(chiave, v);
        return buf;
      },
      (e: unknown) => {
        v.promessa = null;
        v.controller = null;
        if (!controller.signal.aborted) this.daRicaricare.add(chiave);
        if (this.voci.get(chiave) === v) {
          if (controller.signal.aborted) {
            this.voci.delete(chiave);
            this.notifica(chiave, 'assente');
          } else {
            this.imposta(chiave, v, 'errore');
          }
        }
        throw e;
      },
    );
    // la Promise condivisa non deve produrre rifiuti non gestiti quando tutti i richiedenti hanno annullato
    v.promessa.catch(() => undefined);
    return v;
  }

  private async scarica(
    chiave: string,
    voce: VoceManifest | undefined,
    segnale: AbortSignal,
    cache: RequestCache,
  ): Promise<ArrayBuffer> {
    if (voce === undefined) throw new ErroreDati('manifest', chiave, 'file non elencato nel manifest');
    const url = this.risolvi(chiave);
    let buf = await scaricaCorpo(this.fetchFn, url, chiave, segnale, cache, this.limiteMs);
    try {
      await verificaRisorsa(buf, voce, this.sha256);
    } catch (e) {
      // Copia non conforme, forse una versione precedente con lo stesso nome rimasta nella cache HTTP:
      // un solo nuovo tentativo dal server prima dell'errore.
      if (cache === 'reload' || !(e instanceof ErroreDati) || segnale.aborted) throw e;
      buf = await scaricaCorpo(this.fetchFn, url, chiave, segnale, 'reload', this.limiteMs);
      await verificaRisorsa(buf, voce, this.sha256);
    }
    if (segnale.aborted) throw erroreAnnullamento();
    return buf;
  }

  private richiedente(v: Voce, segnale?: AbortSignal): Promise<ArrayBuffer> {
    const condivisa = v.promessa!;
    v.richiedenti++;
    if (segnale === undefined) {
      return condivisa.finally(() => {
        v.richiedenti--;
      });
    }
    return new Promise<ArrayBuffer>((risolvi, rifiuta) => {
      let concluso = false;
      const fine = (): void => {
        if (concluso) return;
        concluso = true;
        v.richiedenti--;
        segnale.removeEventListener('abort', annulla);
      };
      const annulla = (): void => {
        if (concluso) return;
        fine();
        if (v.richiedenti === 0 && v.controller !== null && v.promessa !== null) v.controller.abort();
        rifiuta(erroreAnnullamento());
      };
      segnale.addEventListener('abort', annulla, { once: true });
      condivisa.then(
        (buf) => {
          if (concluso) return;
          fine();
          risolvi(buf);
        },
        (e: unknown) => {
          if (concluso) return;
          fine();
          rifiuta(e);
        },
      );
    });
  }

  private applicaLRU(chiave: string, v: Voce): void {
    if (v.tipo === null || !TIPI_A_BLOCCHI.includes(v.tipo)) return;
    for (;;) {
      let n = 0;
      let vecchia: string | null = null;
      let usoMin = Infinity;
      for (const [k, x] of this.voci) {
        if (x.tipo !== v.tipo || x.stato !== 'pronto') continue;
        n++;
        if (k !== chiave && x.uso < usoMin) {
          usoMin = x.uso;
          vecchia = k;
        }
      }
      if (n <= this.capacita || vecchia === null) return;
      this.rilascia(vecchia);
    }
  }
}

/** Crea l'archivio dei dati dal manifest già letto. */
export function creaDataStore(opz: OpzioniDataStore): ArchivioDati {
  return new ArchivioDati(opz);
}

/**
 * Scarica e verifica manifest.json (primo passo dell'avvio, § 5.6). Il manifest non ha SHA-256 di riferimento:
 * si verifica solo il formato. Cache 'no-cache': rivalidato a ogni avvio, così non resta più vecchio dei file.
 */
export async function caricaManifest(
  opz: { fetch?: FunzioneFetch; risolvi?: (percorso: string) => string; segnale?: AbortSignal; limiteInattivitaMs?: number } = {},
): Promise<IndiceManifest> {
  const f = opz.fetch ?? fetchPredefinita;
  const url = (opz.risolvi ?? ((p: string) => assetUrl(percorsoDati(p))))(PERCORSO_MANIFEST);
  const segnale = opz.segnale ?? new AbortController().signal;
  const buf = await scaricaCorpo(f, url, PERCORSO_MANIFEST, segnale, 'no-cache', opz.limiteInattivitaMs ?? LIMITE_INATTIVITA_MS);
  const testo = new TextDecoder().decode(buf);
  let json: unknown;
  try {
    json = JSON.parse(testo);
  } catch {
    throw new ErroreDati('formato', PERCORSO_MANIFEST, 'JSON non valido');
  }
  try {
    return new IndiceManifest(leggiManifest(json));
  } catch (e) {
    throw new ErroreDati('formato', PERCORSO_MANIFEST, e instanceof Error ? e.message : String(e));
  }
}

/** Decodifica JSON di un buffer già verificato dall'archivio (catalog.json, time.json). */
export function jsonDaBuffer(buf: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(buf));
}
