// Archivio dei dati (§ 5.4, § 5.6): Promise condivise, annullamento, LRU, verifiche, stati; manifest del
// repository con SHA-256 e intestazioni dei file pubblicati (criterio A22, lato runtime).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { B, K, T0, T_END } from '../../src/ephem/constants';
import { ArchivioDati, ErroreDati, caricaManifest, jsonDaBuffer, sha256Esadecimale, verificaRisorsa } from '../../src/data/dataStore';
import type { FunzioneFetch, RispostaMinima } from '../../src/data/dataStore';
import { IndiceManifest, leggiManifest, percorsoBlocco } from '../../src/data/manifest';
import type { Manifest, TipoFile, VoceManifest } from '../../src/data/manifest';
import { sha256Js } from '../../src/data/sha256';
import type { StatoRisorsa } from '../../src/data/types';

const DATI = new URL('../../public/data/v1/', import.meta.url);

function buf(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function sha(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}

/** Intestazione SSSERIE1 minima valida per il blocco k (64 byte, nessuna voce). */
function binarioBlocco(k: number): Uint8Array {
  const b = new Uint8Array(64);
  const v = new DataView(b.buffer);
  'SSSERIE1'.split('').forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  v.setUint32(8, 1, true);
  v.setUint32(12, 1, true);
  v.setInt32(16, k, true);
  v.setUint32(20, 0, true);
  v.setFloat64(24, T0 + k * B, true);
  v.setFloat64(32, Math.min(T0 + (k + 1) * B, T_END), true);
  v.setUint32(40, 64, true);
  v.setUint32(44, 64, true);
  return b;
}

interface Archivio {
  file: Map<string, Uint8Array>;
  manifest: Manifest;
}

function archivio(): Archivio {
  const file = new Map<string, Uint8Array>();
  const voci: VoceManifest[] = [];
  for (let k = 0; k < 6; k++) {
    const p = percorsoBlocco('pianeti', k);
    const b = binarioBlocco(k);
    file.set(p, b);
    voci.push({ percorso: p, tipo: 'pianeti', blocco: k, byte: b.length, sha256: sha(b) });
  }
  const testo = new TextEncoder().encode('{"formato":1}');
  file.set('time.json', testo);
  voci.push({ percorso: 'time.json', tipo: 'tempo', byte: testo.length, sha256: sha(testo) });
  return { file, manifest: { formato: 1, versioneDati: '2026-10-19', blocchi: { T0, B, K, T_END }, file: voci } };
}

interface FetchFinta {
  fetch: FunzioneFetch;
  chiamate: string[];
  annullate: string[];
  rilascia: () => void;
}

/** fetch simulata; con trattieni le risposte restano in sospeso fino a rilascia(). */
function fetchFinta(a: Archivio, opz: { trattieni?: boolean; status?: number; altera?: string } = {}): FetchFinta {
  const chiamate: string[] = [];
  const annullate: string[] = [];
  const attese: (() => void)[] = [];
  const f: FunzioneFetch = (url, init) => {
    chiamate.push(url);
    return new Promise<RispostaMinima>((risolvi, rifiuta) => {
      const rispondi = (): void => {
        const b = a.file.get(url);
        const dati = b === undefined ? new Uint8Array(0) : new Uint8Array(b);
        if (opz.altera === url && dati.length > 63) dati[63] = 1;
        risolvi({ ok: b !== undefined && opz.status === undefined, status: opz.status ?? (b ? 200 : 404), arrayBuffer: async () => buf(dati) });
      };
      init.signal.addEventListener('abort', () => {
        annullate.push(url);
        const e = new Error('annullata');
        e.name = 'AbortError';
        rifiuta(e);
      });
      if (opz.trattieni) attese.push(rispondi);
      else queueMicrotask(rispondi);
    });
  };
  return { fetch: f, chiamate, annullate, rilascia: () => attese.splice(0).forEach((r) => r()) };
}

function crea(a: Archivio, f: FetchFinta, capacita?: number): ArchivioDati {
  return new ArchivioDati({ manifest: new IndiceManifest(a.manifest), fetch: f.fetch, risolvi: (p) => p, capacitaLRU: capacita });
}

describe('manifest', () => {
  it('lettura e indici', () => {
    const a = archivio();
    const m = new IndiceManifest(leggiManifest(a.manifest));
    expect(m.voce('time.json')?.tipo).toBe('tempo');
    expect(m.blocco('pianeti', 3)?.percorso).toBe('planets/p03.bin');
    expect(percorsoBlocco('satelliti', 12)).toBe('sats/s12.bin');
    expect(percorsoBlocco('piccoli-corpi', 0)).toBe('small/b00.bin');
    expect(() => percorsoBlocco('pianeti', 13)).toThrow(RangeError);
  });

  it('rifiuta manifest non conformi', () => {
    const base = archivio().manifest;
    const varianti: unknown[] = [
      null,
      { ...base, formato: 2 },
      { ...base, versioneDati: '19/10/2026' },
      { ...base, blocchi: { ...base.blocchi, B: 1 } },
      { ...base, file: [] },
      { ...base, file: [...base.file, base.file[0]] },
      { ...base, file: [{ ...base.file[0], tipo: 'ignoto' as TipoFile }] },
      { ...base, file: [{ ...base.file[0], blocco: undefined }] },
      { ...base, file: [{ ...base.file[0], blocco: 13 }] },
      { ...base, file: [{ ...base.file[0], sha256: 'ABC' }] },
      { ...base, file: [{ ...base.file[0], percorso: '../x.bin' }] },
      { ...base, file: [{ ...base.file[6], blocco: 0 }] },
    ];
    for (const v of varianti) expect(() => leggiManifest(v)).toThrow();
  });
});

describe('archivio dei dati', () => {
  it('Promise condivisa, stati e notifiche', async () => {
    const a = archivio();
    const f = fetchFinta(a);
    const s = crea(a, f);
    const eventi: [string, StatoRisorsa][] = [];
    const via = s.onCambio((k, st) => eventi.push([k, st]));
    expect(s.stato('planets/p00.bin')).toBe('assente');
    const [x, y] = await Promise.all([s.carica('planets/p00.bin'), s.carica('planets/p00.bin')]);
    expect(x).toBe(y);
    expect(f.chiamate).toEqual(['planets/p00.bin']);
    expect(s.stato('planets/p00.bin')).toBe('pronto');
    expect(await s.carica('planets/p00.bin')).toBe(x);
    expect(f.chiamate.length).toBe(1);
    expect(eventi).toEqual([
      ['planets/p00.bin', 'in-caricamento'],
      ['planets/p00.bin', 'pronto'],
    ]);
    s.rilascia('planets/p00.bin');
    expect(s.stato('planets/p00.bin')).toBe('assente');
    via();
    await s.carica('planets/p00.bin');
    expect(eventi.length).toBe(3);
    expect(f.chiamate.length).toBe(2);
  });

  it('annullamento: la richiesta si interrompe solo quando tutti i richiedenti annullano', async () => {
    const a = archivio();
    const f = fetchFinta(a, { trattieni: true });
    const s = crea(a, f);
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = s.carica('planets/p01.bin', c1.signal);
    const p2 = s.carica('planets/p01.bin', c2.signal);
    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.annullate).toEqual([]);
    f.rilascia();
    expect((await p2).byteLength).toBe(64);
    const c3 = new AbortController();
    const p3 = s.carica('planets/p02.bin', c3.signal);
    c3.abort();
    await expect(p3).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.annullate).toEqual(['planets/p02.bin']);
    await Promise.resolve();
    expect(s.stato('planets/p02.bin')).toBe('assente');
    const giaAnnullato = new AbortController();
    giaAnnullato.abort();
    await expect(s.carica('planets/p03.bin', giaAnnullato.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('annullamento durante la verifica SHA-256: una nuova richiesta non si aggancia a quella interrotta', async () => {
    const a = archivio();
    const f = fetchFinta(a);
    let sblocca = (): void => undefined;
    let inVerifica = false;
    const s = new ArchivioDati({
      manifest: new IndiceManifest(a.manifest),
      fetch: f.fetch,
      risolvi: (p) => p,
      // primo SHA-256 in sospeso fino a sblocca(), come una verifica lenta; i successivi immediati
      sha256: async (b) => {
        if (!inVerifica) {
          inVerifica = true;
          await new Promise<void>((r) => {
            sblocca = r;
          });
        }
        return sha(new Uint8Array(b));
      },
    });
    const c1 = new AbortController();
    const p1 = s.carica('planets/p00.bin', c1.signal);
    await vi.waitFor(() => expect(inVerifica).toBe(true));
    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    // la data torna subito sul blocco: richiesta con un segnale attivo mentre la verifica è ancora in corso
    const c2 = new AbortController();
    const p2 = s.carica('planets/p00.bin', c2.signal);
    sblocca();
    expect((await p2).byteLength).toBe(64);
    expect(c2.signal.aborted).toBe(false);
    expect(f.chiamate).toEqual(['planets/p00.bin', 'planets/p00.bin']);
    expect(s.stato('planets/p00.bin')).toBe('pronto');
    // anche un richiedente senza segnale riceve il buffer
    const c3 = new AbortController();
    inVerifica = false;
    const p3 = s.carica('planets/p01.bin', c3.signal);
    await vi.waitFor(() => expect(inVerifica).toBe(true));
    c3.abort();
    await expect(p3).rejects.toMatchObject({ name: 'AbortError' });
    const p4 = s.carica('planets/p01.bin');
    sblocca();
    expect((await p4).byteLength).toBe(64);
    expect(s.stato('planets/p01.bin')).toBe('pronto');
  });

  it('LRU di 3 blocchi per tipo; le risorse non a blocchi restano', async () => {
    const a = archivio();
    const f = fetchFinta(a);
    const s = crea(a, f);
    await s.carica('time.json');
    for (const k of [0, 1, 2]) await s.carica(percorsoBlocco('pianeti', k));
    await s.carica('planets/p00.bin'); // uso recente: p01 diventa il più vecchio
    await s.carica('planets/p03.bin');
    expect(s.stato('planets/p01.bin')).toBe('assente');
    expect(['planets/p00.bin', 'planets/p02.bin', 'planets/p03.bin'].map((p) => s.stato(p))).toEqual(['pronto', 'pronto', 'pronto']);
    await s.carica('planets/p04.bin');
    expect(s.stato('planets/p02.bin')).toBe('assente');
    expect(s.stato('time.json')).toBe('pronto');
  });

  it('errori: HTTP, file non elencato, SHA-256, intestazione; nuova richiesta dopo un errore', async () => {
    const a = archivio();
    const s404 = crea(a, fetchFinta(a, { status: 404 }));
    await expect(s404.carica('planets/p00.bin')).rejects.toMatchObject({ codice: 'http' });
    expect(s404.stato('planets/p00.bin')).toBe('errore');
    const s = crea(a, fetchFinta(a));
    await expect(s.carica('small/b00.bin')).rejects.toMatchObject({ codice: 'manifest' });
    const alterata = crea(a, fetchFinta(a, { altera: 'planets/p00.bin' }));
    await expect(alterata.carica('planets/p00.bin')).rejects.toMatchObject({ codice: 'formato' });
    // stesso contenuto ma SHA-256 diverso nel manifest
    const m2 = structuredClone(a.manifest);
    m2.file[1]!.sha256 = '0'.repeat(64);
    const s2 = new ArchivioDati({ manifest: new IndiceManifest(m2), fetch: fetchFinta(a).fetch, risolvi: (p) => p });
    await expect(s2.carica('planets/p01.bin')).rejects.toBeInstanceOf(ErroreDati);
    expect(s2.stato('planets/p01.bin')).toBe('errore');
    // riprova dopo l'errore: nuova richiesta
    const f = fetchFinta(a, { status: 500 });
    const s3 = crea(a, f);
    await expect(s3.carica('time.json')).rejects.toMatchObject({ codice: 'http' });
    await expect(s3.carica('time.json')).rejects.toMatchObject({ codice: 'http' });
    expect(f.chiamate.length).toBe(2);
  });

  it('verifica della dimensione e del blocco nell\'intestazione', async () => {
    const b = binarioBlocco(2);
    const v: VoceManifest = { percorso: 'planets/p03.bin', tipo: 'pianeti', blocco: 3, byte: 64, sha256: sha(b) };
    await expect(verificaRisorsa(buf(b), v)).rejects.toMatchObject({ codice: 'formato' });
    await expect(verificaRisorsa(buf(b), { ...v, byte: 72 })).rejects.toMatchObject({ codice: 'dimensione' });
    await expect(verificaRisorsa(buf(b), { ...v, percorso: 'planets/p02.bin', blocco: 2 })).resolves.toBeUndefined();
    expect(await sha256Esadecimale(buf(b))).toBe(sha(b));
  });

  it('caricaManifest', async () => {
    const a = archivio();
    const testo = new TextEncoder().encode(JSON.stringify(a.manifest));
    const ok: FunzioneFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => buf(testo) });
    expect((await caricaManifest({ fetch: ok, risolvi: (p) => p })).voce('time.json')?.byte).toBe(13);
    const rotto: FunzioneFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => buf(new TextEncoder().encode('{')) });
    await expect(caricaManifest({ fetch: rotto, risolvi: (p) => p })).rejects.toMatchObject({ codice: 'formato' });
    expect(jsonDaBuffer(buf(new TextEncoder().encode('{"a":1}')))).toEqual({ a: 1 });
  });
});

/**
 * Condizione per la verifica dei dati pubblicati: solo la presenza di manifest.json. Gli mtime non contano:
 * git non li conserva e in un checkout manifest.json può risultare anteriore ai dati.
 */
function manifestPresente(cartella: URL): boolean {
  return existsSync(new URL('manifest.json', cartella));
}

/** Carica con ArchivioDati ogni file del manifest della cartella (dimensione, intestazione, SHA-256). */
async function verificaCartella(cartella: URL): Promise<void> {
  const m = new IndiceManifest(leggiManifest(JSON.parse(readFileSync(new URL('manifest.json', cartella), 'utf8'))));
  const fetchFile: FunzioneFetch = async (url) => {
    const p = new URL(url, cartella);
    return { ok: existsSync(p), status: existsSync(p) ? 200 : 404, arrayBuffer: async () => buf(readFileSync(p)) };
  };
  const s = new ArchivioDati({ manifest: m, fetch: fetchFile, risolvi: (p) => p, capacitaLRU: 13 });
  for (const v of m.file) {
    const b = await s.carica(v.percorso);
    expect(b.byteLength).toBe(v.byte);
    s.rilascia(v.percorso);
  }
}

describe('verifica dei dati pubblicati', () => {
  it('si esegue anche con manifest anteriore ai dati, come dopo un clone, e rileva un file alterato', async () => {
    const d = mkdtempSync(join(tmpdir(), 'ss-dati-'));
    const cartella = pathToFileURL(`${d}/`);
    try {
      const a = archivio();
      for (const [p, b] of a.file) {
        mkdirSync(dirname(join(d, p)), { recursive: true });
        writeFileSync(join(d, p), b);
      }
      writeFileSync(join(d, 'manifest.json'), JSON.stringify(a.manifest));
      utimesSync(join(d, 'manifest.json'), 0, 0);
      expect(manifestPresente(cartella)).toBe(true);
      await verificaCartella(cartella);
      writeFileSync(join(d, 'time.json'), '{"formato":2}');
      await expect(verificaCartella(cartella)).rejects.toMatchObject({ codice: 'sha256' });
      rmSync(join(d, 'manifest.json'));
      expect(manifestPresente(cartella)).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!manifestPresente(DATI))('dati pubblicati', () => {
  it('ogni file del manifest esiste e supera le verifiche di dimensione, intestazione e SHA-256', async () => {
    await verificaCartella(DATI);
  });
});

const esa = (d: Uint8Array): string => Buffer.from(d).toString('hex');

describe('SHA-256 senza crypto.subtle (contesto non sicuro, § 5.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('implementazione JavaScript conforme a FIPS 180-4, anche ai confini del riempimento', () => {
    expect(esa(sha256Js(buf(new TextEncoder().encode('abc'))))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 100_003]) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255;
      expect(esa(sha256Js(buf(b))), `${n} byte`).toBe(sha(b));
    }
  });

  it('senza crypto.subtle l\'archivio verifica e consegna i file; un SHA-256 diverso resta un errore', async () => {
    vi.stubGlobal('crypto', {});
    const a = archivio();
    const s = new ArchivioDati({ manifest: new IndiceManifest(a.manifest), fetch: fetchFinta(a).fetch, risolvi: (p) => p });
    expect((await s.carica('planets/p02.bin')).byteLength).toBe(64);
    expect(await s.carica('time.json')).toBeInstanceOf(ArrayBuffer);
    expect(await sha256Esadecimale(buf(binarioBlocco(4)))).toBe(sha(binarioBlocco(4)));
    const m2 = structuredClone(a.manifest);
    m2.file[1]!.sha256 = '0'.repeat(64);
    const s2 = new ArchivioDati({ manifest: new IndiceManifest(m2), fetch: fetchFinta(a).fetch, risolvi: (p) => p });
    await expect(s2.carica('planets/p01.bin')).rejects.toMatchObject({ codice: 'sha256' });
  });
});

describe('cache HTTP (§ 5.6)', () => {
  /**
   * Server con la versione corrente dei file e cache del browser che conserva le copie di `vecchie` (versioni
   * precedenti con lo stesso nome): la cache risponde alle richieste predefinite; 'reload' va al server e
   * aggiorna la cache.
   */
  function conCache(a: Archivio, vecchie: Map<string, Uint8Array>, status = 200): { f: FunzioneFetch; modi: string[] } {
    const cache = new Map(vecchie);
    const modi: string[] = [];
    const f: FunzioneFetch = async (url, init) => {
      const modo = init.cache ?? 'default';
      modi.push(`${url} ${modo}`);
      let b = modo === 'default' ? cache.get(url) : undefined;
      if (b === undefined) {
        b = a.file.get(url)!;
        cache.set(url, b);
      }
      const copia = new Uint8Array(b);
      return { ok: status === 200, status, arrayBuffer: async () => buf(copia) };
    };
    return { f, modi };
  }

  it('copia precedente nella cache HTTP: scaricata subito di nuovo dal server (cache "reload"), senza errore', async () => {
    const a = archivio();
    const vecchioTempo = new TextEncoder().encode('{"formato":0}');
    const vecchioBlocco = new Uint8Array(a.file.get('planets/p01.bin')!);
    vecchioBlocco[63] = 1;
    const { f, modi } = conCache(a, new Map([['time.json', vecchioTempo], ['planets/p01.bin', vecchioBlocco]]));
    const s = new ArchivioDati({ manifest: new IndiceManifest(a.manifest), fetch: f, risolvi: (p) => p });
    expect(new Uint8Array(await s.carica('time.json'))).toEqual(a.file.get('time.json'));
    expect(new Uint8Array(await s.carica('planets/p01.bin'))).toEqual(a.file.get('planets/p01.bin'));
    expect([s.stato('time.json'), s.stato('planets/p01.bin')]).toEqual(['pronto', 'pronto']);
    // la cache contiene ora la versione corrente: le richieste successive tornano alla modalità predefinita
    s.rilascia('planets/p01.bin');
    await s.carica('planets/p01.bin');
    expect(modi).toEqual([
      'time.json default',
      'time.json reload',
      'planets/p01.bin default',
      'planets/p01.bin reload',
      'planets/p01.bin default',
    ]);
  });

  it('file non conforme anche sul server: errore dopo la seconda richiesta; il nuovo tentativo scavalca la cache', async () => {
    const a = archivio();
    const m2 = structuredClone(a.manifest);
    m2.file[1]!.sha256 = '0'.repeat(64);
    const { f, modi } = conCache(a, new Map());
    const s = new ArchivioDati({ manifest: new IndiceManifest(m2), fetch: f, risolvi: (p) => p });
    await expect(s.carica('planets/p01.bin')).rejects.toMatchObject({ codice: 'sha256' });
    expect(s.stato('planets/p01.bin')).toBe('errore');
    await expect(s.carica('planets/p01.bin')).rejects.toMatchObject({ codice: 'sha256' });
    expect(modi).toEqual(['planets/p01.bin default', 'planets/p01.bin reload', 'planets/p01.bin reload']);
  });

  it('errore HTTP: nessuna seconda richiesta immediata; il nuovo tentativo scavalca la cache', async () => {
    const a = archivio();
    const { f, modi } = conCache(a, new Map(), 404);
    const s = new ArchivioDati({ manifest: new IndiceManifest(a.manifest), fetch: f, risolvi: (p) => p });
    await expect(s.carica('time.json')).rejects.toMatchObject({ codice: 'http' });
    await expect(s.carica('time.json')).rejects.toMatchObject({ codice: 'http' });
    expect(modi).toEqual(['time.json default', 'time.json reload']);
  });

  it('manifest.json rivalidato a ogni caricamento (cache "no-cache")', async () => {
    const a = archivio();
    const testo = new TextEncoder().encode(JSON.stringify(a.manifest));
    const modi: string[] = [];
    const f: FunzioneFetch = async (_url, init) => {
      modi.push(init.cache ?? 'default');
      return { ok: true, status: 200, arrayBuffer: async () => buf(testo) };
    };
    await caricaManifest({ fetch: f, risolvi: (p) => p });
    expect(modi).toEqual(['no-cache']);
  });
});

/** fetch che non risponde mai; con `ignoraSegnale` non reagisce nemmeno all'annullamento. */
function senzaRisposta(ignoraSegnale = false): FunzioneFetch {
  return (_url, init) =>
    new Promise<RispostaMinima>((_r, rifiuta) => {
      if (ignoraSegnale) return;
      init.signal.addEventListener('abort', () => {
        const e = new Error('annullata');
        e.name = 'AbortError';
        rifiuta(e);
      });
    });
}

/** Risposta a flusso: i pezzi di `b` a intervalli di `passoMs`, poi chiusura (o sospensione dopo `fermaDopo` pezzi). */
function flusso(b: Uint8Array, pezzi: number, passoMs: number, fermaDopo = Infinity): Response {
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const corpo = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i >= fermaDopo) return new Promise<void>(() => undefined);
      return new Promise<void>((fatto) => {
        timer = setTimeout(() => {
          const n = Math.ceil(b.length / pezzi);
          ctrl.enqueue(b.slice(i * n, (i + 1) * n));
          i++;
          if (i >= pezzi) ctrl.close();
          fatto();
        }, passoMs);
      });
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  return new Response(corpo, { status: 200 });
}

describe('richieste senza risposta (§ 5.6, § 11.11)', () => {
  const opz = (a: Archivio, fetch: FunzioneFetch) => ({ manifest: new IndiceManifest(a.manifest), fetch, risolvi: (p: string) => p, limiteInattivitaMs: 80 });

  it('nessuna risposta entro il limite: ErroreDati "rete" e stato "errore", anche per un richiedente senza segnale', async () => {
    const a = archivio();
    for (const ignora of [false, true]) {
      const s = new ArchivioDati(opz(a, senzaRisposta(ignora)));
      await expect(s.carica('planets/p00.bin')).rejects.toMatchObject({ codice: 'rete' });
      expect(s.stato('planets/p00.bin')).toBe('errore');
    }
  }, 5000);

  it('corpo che si ferma: errore dopo il limite di inattività; corpo lento ma continuo: nessun errore', async () => {
    const a = archivio();
    const b = a.file.get('planets/p03.bin')!;
    const fermo = new ArchivioDati(opz(a, async () => flusso(b, 4, 10, 1)));
    await expect(fermo.carica('planets/p03.bin')).rejects.toMatchObject({ codice: 'rete' });
    // 8 pezzi a 40 ms: 320 ms in tutto, oltre il limite di 80 ms, ma mai 80 ms senza byte
    const lento = new ArchivioDati(opz(a, async () => flusso(b, 8, 40)));
    expect(new Uint8Array(await lento.carica('planets/p03.bin'))).toEqual(b);
  }, 5000);

  it('annullamento del richiedente prima del limite: AbortError, stato "assente"', async () => {
    const a = archivio();
    const s = new ArchivioDati(opz(a, senzaRisposta()));
    const c = new AbortController();
    const p = s.carica('planets/p00.bin', c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(s.stato('planets/p00.bin')).toBe('assente');
  });

  it('manifest.json senza risposta: ErroreDati "rete"', async () => {
    await expect(caricaManifest({ fetch: senzaRisposta(), risolvi: (p) => p, limiteInattivitaMs: 80 })).rejects.toMatchObject({ codice: 'rete' });
  }, 5000);
});
