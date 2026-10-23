// Servizio delle effemeridi (contratto EphemerisService, § 5.4 di docs/PROGETTO.md).
// Combina i moduli dei dati in stati eliocentrici nell'eclittica J2000 (km, km/s):
// - Sole: origine della scena (I4);
// - pianeti e Plutone: baricentro del sistema (DE441, § 7.3) più lo scarto del centro dovuto ai satelliti
//   del catalogo (§ 7.3.5); Mercurio e Venere coincidono con il baricentro;
// - Terra: r_EMB - r_Luna,geo/(1 + EMRAT) (§ 7.3.5); Luna: Terra più lo stato geocentrico (§ 7.4);
// - satelliti: centro del primario più lo stato planetocentrico (§ 7.5);
// - piccoli corpi: file small/bKK.bin (§ 7.6).
// stateAt, orbitAt e affidabilita sono sincroni, senza allocazioni e mai estrapolati: fuori da [T0, T_END)
// 'fuori-copertura', blocco non caricato 'caricamento', istanti senza dati 'non-determinabile'.
// Gli stati calcolati sono conservati per istante (memoria per ssid): nello stesso frame primari, scheda,
// affidabilità e orbite non ripetono il calcolo.
// Caricamento (§ 5.6): prefetch e pronto per blocchi (§ 8.1, confronti esatti ai confini con bloccoDi); la cache
// LRU di 3 blocchi per tipo è quella del DataStore: un blocco rilasciato dall'archivio è rimosso anche qui.

import type { Catalogo, CorpoCatalogo } from '../data/catalogTypes';
import { bloccoDi } from '../data/binHeader';
import { percorsoBlocco } from '../data/manifest';
import { leggiLuna } from '../data/moonReader';
import type { DatiLuna } from '../data/moonReader';
import type { DatiAffidabilita } from '../data/reliabilityReader';
import { elementiRecord } from '../data/satsReader';
import type { ElementiModello } from '../data/satsReader';
import type { DataStore } from '../data/types';
import type { TimeState } from '../time/types';
import { EMRAT, GM_LUNA, GM_TERRA, K, MU_ELIO_KM3_S2, T0, T_END } from './constants';
import { conicaDaStato } from './equinoctial';
import type { ElementiConica } from './equinoctial';
import { EffemeridiLuna } from './moon';
import { EffemeridiPianeti, NAIF_PER_SSID_FILE } from './planets';
import { ServizioAffidabilita, velocitaAngolare } from './reliability';
import { EffemeridiSatelliti, SISTEMA_PER_PIANETA, configDaCatalogo } from './satellites';
import { EffemeridiPiccoliCorpi } from './smallBodies';
import { soleBaricentrico } from './sunBarycenter';
import type { Affidabilita, ElementiOrbita, EphemerisService, FormaOrbita, Livello, StatoEffemeride } from './types';

/** Tipi dei file a blocchi (§ 8.1), con i nomi del manifest. */
export type TipoBlocco = 'pianeti' | 'satelliti' | 'piccoli-corpi';
export const TIPI_BLOCCO: readonly TipoBlocco[] = ['pianeti', 'satelliti', 'piccoli-corpi'];

/** File della Luna (§ 8.4). */
export const PERCORSO_LUNA = 'moon.bin';

/** Livello provvisorio finché reliability.bin non è caricato: non nasconde i corpi (marcatore pieno). */
export const LIVELLO_IN_ATTESA: Livello = 'buona';

const OK = 0;
const CARICAMENTO = 1;
const FUORI = 2;
const NON_DET = 3;
const STATI: readonly StatoEffemeride[] = ['ok', 'caricamento', 'fuori-copertura', 'non-determinabile'];

function codice(s: StatoEffemeride): number {
  return s === 'ok' ? OK : s === 'caricamento' ? CARICAMENTO : s === 'fuori-copertura' ? FUORI : NON_DET;
}

// Modelli per ssid.
const M_NESSUNO = 0;
const M_SOLE = 1;
const M_PIANETA = 2;
const M_TERRA = 3;
const M_LUNA = 4;
const M_SATELLITE = 5;
const M_PICCOLO = 6;

/** ssid del file dei pianeti per codice NAIF del baricentro (1-9). */
const SSID_FILE_PER_NAIF: readonly number[] = (() => {
  const out = new Array<number>(10).fill(-1);
  for (const [ssid, naif] of Object.entries(NAIF_PER_SSID_FILE)) out[naif] = Number(ssid);
  return out;
})();

export interface OpzioniServizio {
  /** Catalogo (§ 8.10): ssid = indice. */
  catalogo: Catalogo | readonly CorpoCatalogo[];
  /** Archivio dei dati per prefetch; senza archivio i dati si registrano con i metodi espliciti. */
  store?: DataStore;
  /** Affidabilità già letta (reliability.bin), se disponibile. */
  affidabilita?: DatiAffidabilita | null;
  /** Livello provvisorio prima di reliability.bin (predefinito LIVELLO_IN_ATTESA); null: non determinabile. */
  livelloInAttesa?: Livello | null;
}

/** Errore di prefetch senza archivio dei dati. */
export class ErroreServizio extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreServizio';
  }
}

export class ServizioEffemeridi implements EphemerisService {
  readonly pianeti = new EffemeridiPianeti();
  readonly luna = new EffemeridiLuna();
  readonly satelliti: EffemeridiSatelliti;
  readonly piccoli = new EffemeridiPiccoliCorpi();
  readonly servizioAffidabilita: ServizioAffidabilita;
  readonly corpi: readonly CorpoCatalogo[];
  readonly n: number;

  private readonly store: DataStore | null;
  private readonly modello: Uint8Array;
  /** ssid del primario (-1 per il Sole). */
  private readonly primario: Int32Array;
  /** Codice NAIF del baricentro DE441 per i corpi con modello 'pianeta' (0 altrove). */
  private readonly naif: Uint8Array;
  /** 1 se il pianeta ha un sistema di satelliti nel modello dei centri (§ 7.3.5). */
  private readonly conSistema: Uint8Array;
  private readonly ssidSole: number;
  private readonly ssidTerra: number;

  // Memoria per istante: slot 0..n-1 corpi; n..n+8 baricentri NAIF 1..9; n+9 Luna geocentrica; n+10 Sole baricentrico.
  private readonly slotBar: number;
  private readonly slotLunaGeo: number;
  private readonly slotSoleBar: number;
  private readonly cacheStato: Float64Array;
  private readonly cacheT: Float64Array;
  private readonly cacheV: Uint32Array;
  private readonly cacheEsito: Uint8Array;
  private versione = 1;

  // Memoria di lavoro.
  private readonly tmp = new Float64Array(6);
  private readonly tmp2 = new Float64Array(6);
  private readonly baricentri = new Float64Array(54);
  private readonly conica: ElementiConica = {
    q: 0,
    e: 0,
    i: 0,
    nodo: 0,
    argPeri: 0,
    anomaliaVera: 0,
    a: 0,
    anomaliaMedia: 0,
    motoMedio: 0,
    tempoDalPericentro: 0,
  };
  private readonly elModello: ElementiModello = { a: 0, e: 0, varpi: 0, tanI2: 0, omega: 0, lam: 0, nEff: 0, fattoreI: 1 };
  private readonly matriceFLavoro = new Float64Array(9);

  /** Buffer registrati per chiave (percorso in data/v1/). */
  private readonly registrati = new Map<string, ArrayBuffer>();
  private readonly ascoltatori = new Set<() => void>();
  private readonly annullaStore: (() => void) | null;

  constructor(opz: OpzioniServizio) {
    const elenco = Array.isArray(opz.catalogo) ? (opz.catalogo as readonly CorpoCatalogo[]) : (opz.catalogo as Catalogo).corpi;
    const corpi = [...elenco].sort((a, b) => a.ssid - b.ssid);
    corpi.forEach((c, i) => {
      if (c.ssid !== i) throw new RangeError(`ssid non contigui: atteso ${i}, trovato ${c.ssid}`);
    });
    this.corpi = corpi;
    const n = corpi.length;
    this.n = n;
    const perSlug = new Map(corpi.map((c) => [c.slug, c.ssid] as const));
    this.modello = new Uint8Array(n);
    this.primario = new Int32Array(n).fill(-1);
    this.naif = new Uint8Array(n);
    this.conSistema = new Uint8Array(n);
    let sole = -1;
    let terra = -1;
    for (const c of corpi) {
      const e = c.effemeridi;
      this.primario[c.ssid] = c.primario === null ? -1 : (perSlug.get(c.primario) ?? -1);
      switch (e.modello) {
        case 'sole':
          this.modello[c.ssid] = M_SOLE;
          sole = c.ssid;
          break;
        case 'pianeta':
          this.naif[c.ssid] = e.naifDE441;
          if (e.naifDE441 === 3) {
            this.modello[c.ssid] = M_TERRA;
            terra = c.ssid;
          } else {
            this.modello[c.ssid] = M_PIANETA;
            this.conSistema[c.ssid] = SISTEMA_PER_PIANETA[c.ssid] === e.naifDE441 ? 1 : 0;
          }
          break;
        case 'luna':
          this.modello[c.ssid] = M_LUNA;
          break;
        case 'satellite':
          this.modello[c.ssid] = M_SATELLITE;
          break;
        case 'piccolo-corpo':
          this.modello[c.ssid] = M_PICCOLO;
          break;
        default:
          this.modello[c.ssid] = M_NESSUNO;
      }
    }
    this.ssidSole = sole;
    this.ssidTerra = terra;
    this.satelliti = new EffemeridiSatelliti(configDaCatalogo({ formato: 1, generato: '', corpi, categorie: [] }));
    this.servizioAffidabilita = new ServizioAffidabilita(corpi, opz.affidabilita ?? null, {
      livelloInAttesa: opz.livelloInAttesa === undefined ? LIVELLO_IN_ATTESA : opz.livelloInAttesa,
    });
    this.slotBar = n;
    this.slotLunaGeo = n + 9;
    this.slotSoleBar = n + 10;
    const slot = n + 11;
    this.cacheStato = new Float64Array(6 * slot);
    this.cacheT = new Float64Array(slot).fill(Number.NaN);
    this.cacheV = new Uint32Array(slot);
    this.cacheEsito = new Uint8Array(slot);
    this.store = opz.store ?? null;
    this.annullaStore =
      this.store === null
        ? null
        : this.store.onCambio((chiave, stato) => {
            if (stato === 'assente' && this.registrati.has(chiave)) this.dimentica(chiave);
          });
  }

  // --- Dati ---

  /** Notifica i cambi dei dati (blocchi, Luna, affidabilità); restituisce la funzione di annullamento. */
  onDati(cb: () => void): () => void {
    this.ascoltatori.add(cb);
    return () => {
      this.ascoltatori.delete(cb);
    };
  }

  /** Numero che cambia a ogni variazione dei dati caricati. */
  get versioneDati(): number {
    return this.versione;
  }

  private cambiati(): void {
    this.versione = (this.versione + 1) >>> 0 || 1;
    for (const cb of this.ascoltatori) cb();
  }

  /** Imposta i dati della Luna (moon.bin già letto). */
  impostaLuna(dati: DatiLuna | null): void {
    this.luna.imposta(dati);
    this.cambiati();
  }

  /** Imposta reliability.bin già letto (§ 8.7); fino ad allora l'affidabilità è provvisoria. */
  impostaAffidabilita(dati: DatiAffidabilita | null): void {
    this.servizioAffidabilita.impostaDati(dati);
    this.cambiati();
  }

  /** Legge, verifica e registra il file del blocco k del tipo indicato. */
  registraBlocco(tipo: TipoBlocco, k: number, buf: ArrayBuffer): void {
    if (tipo === 'pianeti') {
      if (this.pianeti.carica(buf) !== k) throw new RangeError(`il file non è del blocco ${k}`);
    } else if (tipo === 'satelliti') {
      if (this.satelliti.carica(buf) !== k) throw new RangeError(`il file non è del blocco ${k}`);
    } else {
      this.piccoli.carica(k, buf);
    }
    this.registrati.set(percorsoBlocco(tipo, k), buf);
    this.cambiati();
  }

  rimuoviBlocco(tipo: TipoBlocco, k: number): void {
    if (tipo === 'pianeti') this.pianeti.rimuovi(k);
    else if (tipo === 'satelliti') this.satelliti.rimuovi(k);
    else this.piccoli.rilascia(k);
    this.registrati.delete(percorsoBlocco(tipo, k));
    this.cambiati();
  }

  /** Vero se il blocco k del tipo indicato è caricato. */
  bloccoCaricato(tipo: TipoBlocco, k: number): boolean {
    if (tipo === 'pianeti') return this.pianeti.haBlocco(k);
    if (tipo === 'satelliti') return this.satelliti.haBlocco(k);
    return this.piccoli.caricato(k);
  }

  private dimentica(chiave: string): void {
    for (const tipo of TIPI_BLOCCO) {
      for (let k = 0; k < K; k++) {
        if (percorsoBlocco(tipo, k) === chiave) {
          this.rimuoviBlocco(tipo, k);
          return;
        }
      }
    }
    this.registrati.delete(chiave);
  }

  // --- Caricamento (§ 5.6) ---

  /** Vero se tutti i dati necessari a jdTT sono caricati (blocchi dei tre tipi e moon.bin). */
  pronto(jdTT: number): boolean {
    const k = bloccoDi(jdTT);
    if (k < 0) return true;
    return this.pianeti.haBlocco(k) && this.satelliti.haBlocco(k) && this.piccoli.caricato(k) && this.luna.pronta();
  }

  /** Chiavi dei file mancanti per l'intervallo [jdTT0, jdTT1] (blocchi e moon.bin). */
  mancanti(jdTT0: number, jdTT1: number): string[] {
    const out: string[] = [];
    if (!this.luna.pronta()) out.push(PERCORSO_LUNA);
    const [k0, k1] = intervalloBlocchi(jdTT0, jdTT1);
    for (let k = k0; k <= k1; k++) for (const tipo of TIPI_BLOCCO) if (!this.bloccoCaricato(tipo, k)) out.push(percorsoBlocco(tipo, k));
    return out;
  }

  /**
   * Carica (tramite l'archivio) e registra i blocchi che coprono [jdTT0, jdTT1] e, salvo `conLuna` falso,
   * moon.bin. I blocchi già caricati sono richiesti di nuovo all'archivio per aggiornarne l'uso nella cache
   * LRU. Si conclude quando tutti i file sono registrati; con un errore rifiuta con il primo errore dopo aver
   * registrato gli altri.
   */
  async prefetch(jdTT0: number, jdTT1: number, segnale?: AbortSignal, conLuna = true): Promise<void> {
    const store = this.store;
    if (store === null) {
      const mancanti = this.mancanti(jdTT0, jdTT1).filter((c) => conLuna || c !== PERCORSO_LUNA);
      if (mancanti.length === 0) return;
      throw new ErroreServizio('archivio dei dati non disponibile');
    }
    const lavori: Promise<void>[] = [];
    if (conLuna && !this.luna.pronta()) lavori.push(this.caricaLuna(segnale));
    const [k0, k1] = intervalloBlocchi(jdTT0, jdTT1);
    for (let k = k0; k <= k1; k++) {
      for (const tipo of TIPI_BLOCCO) {
        const chiave = percorsoBlocco(tipo, k);
        lavori.push(
          store.carica(chiave, segnale).then((buf) => {
            if (this.registrati.get(chiave) === buf && this.bloccoCaricato(tipo, k)) return;
            this.registraBlocco(tipo, k, buf);
          }),
        );
      }
    }
    const esiti = await Promise.allSettled(lavori);
    for (const e of esiti) if (e.status === 'rejected') throw e.reason;
  }

  /** Carica e registra moon.bin, file unico per tutto l'intervallo (§ 8.4); subito risolta se già pronto. */
  async caricaLuna(segnale?: AbortSignal): Promise<void> {
    if (this.luna.pronta()) return;
    const store = this.store;
    if (store === null) throw new ErroreServizio('archivio dei dati non disponibile');
    const buf = await store.carica(PERCORSO_LUNA, segnale);
    if (this.registrati.get(PERCORSO_LUNA) === buf && this.luna.pronta()) return;
    this.luna.imposta(leggiLuna(buf));
    this.registrati.set(PERCORSO_LUNA, buf);
    this.cambiati();
  }

  dispose(): void {
    this.annullaStore?.();
    this.ascoltatori.clear();
  }

  // --- Stati ---

  /** Stato eliocentrico (eclittica J2000): out[0..2] km, out[3..5] km/s. Se l'esito non è 'ok' out non cambia. */
  stateAt(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride {
    if (!(Number.isInteger(ssid) && ssid >= 0 && ssid < this.n)) return 'non-determinabile';
    const c = this.assicura(ssid, jdTT);
    if (c === OK) this.copia(ssid, out);
    return STATI[c]!;
  }

  /** Stato eliocentrico del baricentro del sistema NAIF 1..9 (DE441, § 7.3.2). */
  statoBaricentro(naif: number, jdTT: number, out: Float64Array): StatoEffemeride {
    if (!(Number.isInteger(naif) && naif >= 1 && naif <= 9)) return 'non-determinabile';
    const slot = this.slotBar + naif - 1;
    const c = this.assicura(slot, jdTT);
    if (c === OK) this.copia(slot, out);
    return STATI[c]!;
  }

  /** Stato geocentrico della Luna (km, km/s). */
  statoGeocentricoLuna(jdTT: number, out: Float64Array): StatoEffemeride {
    const c = this.assicura(this.slotLunaGeo, jdTT);
    if (c === OK) this.copia(this.slotLunaGeo, out);
    return STATI[c]!;
  }

  /** Stato del Sole rispetto al baricentro del Sistema solare (§ 7.6.5). */
  statoSoleBaricentrico(jdTT: number, out: Float64Array): StatoEffemeride {
    const c = this.assicura(this.slotSoleBar, jdTT);
    if (c === OK) this.copia(this.slotSoleBar, out);
    return STATI[c]!;
  }

  /** Stato relativo al primario (planetocentrico, geocentrico o eliocentrico). */
  statoRelativo(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride {
    if (!(Number.isInteger(ssid) && ssid >= 0 && ssid < this.n)) return 'non-determinabile';
    const c = this.assicura(ssid, jdTT);
    if (c !== OK) return STATI[c]!;
    const p = this.primario[ssid]!;
    if (p < 0 || p === this.ssidSole) {
      this.copia(ssid, out);
      return 'ok';
    }
    const cp = this.assicura(p, jdTT);
    if (cp !== OK) return STATI[cp]!;
    const a = this.cacheStato;
    const o = 6 * ssid;
    const op = 6 * p;
    for (let j = 0; j < 6; j++) out[j] = a[o + j]! - a[op + j]!;
    return 'ok';
  }

  private copia(slot: number, out: Float64Array): void {
    const a = this.cacheStato;
    const o = 6 * slot;
    out[0] = a[o]!;
    out[1] = a[o + 1]!;
    out[2] = a[o + 2]!;
    out[3] = a[o + 3]!;
    out[4] = a[o + 4]!;
    out[5] = a[o + 5]!;
  }

  private scrivi(slot: number, v: ArrayLike<number>): void {
    const a = this.cacheStato;
    const o = 6 * slot;
    for (let j = 0; j < 6; j++) a[o + j] = v[j]!;
  }

  /** Calcola (o riusa) lo slot all'istante; restituisce il codice dell'esito. */
  private assicura(slot: number, jdTT: number): number {
    if (this.cacheT[slot] === jdTT && this.cacheV[slot] === this.versione) return this.cacheEsito[slot]!;
    const c = jdTT >= T0 && jdTT < T_END ? this.calcola(slot, jdTT) : FUORI;
    this.cacheT[slot] = jdTT;
    this.cacheV[slot] = this.versione;
    this.cacheEsito[slot] = c;
    return c;
  }

  private calcola(slot: number, jd: number): number {
    const t = this.tmp;
    if (slot >= this.n) {
      if (slot < this.slotLunaGeo) {
        const c = codice(this.pianeti.stato(SSID_FILE_PER_NAIF[slot - this.slotBar + 1]!, jd, t));
        if (c === OK) this.scrivi(slot, t);
        return c;
      }
      if (slot === this.slotLunaGeo) {
        const c = codice(this.luna.statoGeocentrico(jd, t));
        if (c === OK) this.scrivi(slot, t);
        return c;
      }
      // Sole baricentrico: nove baricentri.
      for (let i = 0; i < 9; i++) {
        const s = this.slotBar + i;
        const c = this.assicura(s, jd);
        if (c !== OK) return c;
        const o = 6 * s;
        for (let j = 0; j < 6; j++) this.baricentri[6 * i + j] = this.cacheStato[o + j]!;
      }
      soleBaricentrico(this.baricentri, t);
      this.scrivi(slot, t);
      return OK;
    }
    switch (this.modello[slot]) {
      case M_SOLE: {
        const a = this.cacheStato;
        for (let j = 0; j < 6; j++) a[6 * slot + j] = 0;
        return OK;
      }
      case M_PIANETA: {
        const sb = this.slotBar + this.naif[slot]! - 1;
        const c = this.assicura(sb, jd);
        if (c !== OK) return c;
        if (this.conSistema[slot] === 1) {
          const c2 = codice(this.satelliti.planetCenterOffset(slot, jd, t));
          if (c2 !== OK) return c2;
        } else {
          for (let j = 0; j < 6; j++) t[j] = 0;
        }
        const a = this.cacheStato;
        for (let j = 0; j < 6; j++) a[6 * slot + j] = a[6 * sb + j]! + t[j]!;
        return OK;
      }
      case M_TERRA: {
        const sb = this.slotBar + 2;
        const c = this.assicura(sb, jd);
        if (c !== OK) return c;
        const c2 = this.assicura(this.slotLunaGeo, jd);
        if (c2 !== OK) return c2;
        const a = this.cacheStato;
        // r_Terra = r_EMB - r_Luna,geo/(1 + EMRAT), come statoTerra di moon.ts
        const f = 1 / (1 + EMRAT);
        for (let j = 0; j < 6; j++) a[6 * slot + j] = a[6 * sb + j]! - a[6 * this.slotLunaGeo + j]! * f;
        return OK;
      }
      case M_LUNA: {
        const p = this.ssidTerra;
        if (p < 0) return NON_DET;
        const c = this.assicura(p, jd);
        if (c !== OK) return c;
        const c2 = this.assicura(this.slotLunaGeo, jd);
        if (c2 !== OK) return c2;
        const a = this.cacheStato;
        for (let j = 0; j < 6; j++) a[6 * slot + j] = a[6 * p + j]! + a[6 * this.slotLunaGeo + j]!;
        return OK;
      }
      case M_SATELLITE: {
        const p = this.primario[slot]!;
        if (p < 0) return NON_DET;
        const c = this.assicura(p, jd);
        if (c !== OK) return c;
        const c2 = codice(this.satelliti.statoPlanetocentrico(slot, jd, t));
        if (c2 !== OK) return c2;
        const a = this.cacheStato;
        for (let j = 0; j < 6; j++) a[6 * slot + j] = a[6 * p + j]! + t[j]!;
        return OK;
      }
      case M_PICCOLO: {
        const c = codice(this.piccoli.stateAt(slot, jd, t));
        if (c === OK) this.scrivi(slot, t);
        return c;
      }
      default:
        return NON_DET;
    }
  }

  // --- Orbite (§ 10.2) ---

  /**
   * Conica da disegnare, relativa al primario e ancorata al corpo: pianeti e Plutone dal baricentro del sistema
   * (μ = GM_Sole + GM_sistema), la Terra dall'EMB (orbita traslata sul centro della Terra), la Luna osculante
   * geocentrica (μ = GM_Terra + GM_Luna), i satelliti dall'ellisse del record nel sistema planetocentrico, i
   * piccoli corpi eliocentrici, baricentrici oltre 50 UA dal Sole (§ 7.6.5).
   */
  orbitAt(ssid: number, jdTT: number, out: ElementiOrbita): StatoEffemeride {
    if (!(Number.isInteger(ssid) && ssid >= 0 && ssid < this.n)) return 'non-determinabile';
    if (!(jdTT >= T0 && jdTT < T_END)) return 'fuori-copertura';
    switch (this.modello[ssid]) {
      case M_PIANETA:
      case M_TERRA: {
        const naif = this.naif[ssid]!;
        const sb = this.slotBar + naif - 1;
        const c = this.assicura(sb, jdTT);
        if (c !== OK) return STATI[c]!;
        if (!this.conicaDaSlot(sb, MU_ELIO_KM3_S2[naif]!, out)) return 'non-determinabile';
        out.primario = this.ssidSole;
        out.baricentrici = false;
        out.forma = this.forma(ssid, jdTT);
        return 'ok';
      }
      case M_LUNA: {
        const c = this.assicura(this.slotLunaGeo, jdTT);
        if (c !== OK) return STATI[c]!;
        if (!this.conicaDaSlot(this.slotLunaGeo, GM_TERRA + GM_LUNA, out)) return 'non-determinabile';
        out.primario = this.ssidTerra;
        out.baricentrici = false;
        out.forma = this.forma(ssid, jdTT);
        return 'ok';
      }
      case M_SATELLITE: {
        const s = this.satelliti.orbitAt(ssid, jdTT, out);
        if (s === 'ok') out.forma = this.forma(ssid, jdTT);
        return s;
      }
      case M_PICCOLO: {
        const cs = this.assicura(this.slotSoleBar, jdTT);
        const sole = cs === OK ? this.soleVista() : null;
        return this.piccoli.orbitAt(ssid, jdTT, sole, out, this.forma(ssid, jdTT));
      }
      default:
        return 'non-determinabile';
    }
  }

  private readonly soleTmp = new Float64Array(6);

  private soleVista(): Float64Array {
    const o = 6 * this.slotSoleBar;
    for (let j = 0; j < 6; j++) this.soleTmp[j] = this.cacheStato[o + j]!;
    return this.soleTmp;
  }

  private conicaDaSlot(slot: number, mu: number, out: ElementiOrbita): boolean {
    const t = this.tmp2;
    const o = 6 * slot;
    for (let j = 0; j < 6; j++) t[j] = this.cacheStato[o + j]!;
    if (!conicaDaStato(t, mu, this.conica)) return false;
    const c = this.conica;
    out.q = c.q;
    out.e = c.e;
    out.i = c.i;
    out.nodo = c.nodo;
    out.argPeri = c.argPeri;
    out.anomaliaVera = c.anomaliaVera;
    return true;
  }

  /** Forma dell'orbita (§ 7.6.2) dal file di affidabilità; prima del caricamento 'determinata'. */
  private forma(ssid: number, jdTT: number): FormaOrbita {
    const a = this.servizioAffidabilita;
    if (!a.pronto()) return 'determinata';
    return a.formaDeterminata(ssid, jdTT) ? 'determinata' : 'non-determinata';
  }

  // --- Affidabilità (§ 7.8) ---

  /** ε_modello, ε_ΔT = ω·σ(ΔT) con ω velocità angolare attorno al primario, ε_tot e livello. */
  affidabilita(ssid: number, t: TimeState, out: Affidabilita): void {
    if (!(Number.isInteger(ssid) && ssid >= 0 && ssid < this.n)) {
      out.livello = 'non-determinabile';
      out.epsModello = Number.NaN;
      out.epsDeltaT = 0;
      out.epsTotale = Number.NaN;
      return;
    }
    this.servizioAffidabilita.calcola(ssid, t, this.omega(ssid, t.jdTT), out);
  }

  /** Livello di affidabilità definitivo (true) o provvisorio (false: reliability.bin non ancora caricato). */
  affidabilitaDefinitiva(): boolean {
    return this.servizioAffidabilita.pronto();
  }

  /** Velocità angolare del corpo attorno al primario (rad/s), 0 se lo stato non è disponibile. */
  omega(ssid: number, jdTT: number): number {
    if (this.modello[ssid] === M_SOLE) return 0;
    const c = this.statoRelativo(ssid, jdTT, this.tmp2);
    return c === 'ok' ? velocitaAngolare(this.tmp2, this.tmp2, 0, 3) : 0;
  }

  // --- Sistema F dei satelliti (§ 7.5.2, § 7.5.4) ---

  /**
   * Matrice per righe dal sistema F alla data all'eclittica J2000 (R_F, ruotata con il polo del primario negli
   * intervalli secolari dei satelliti con piano che segue l'equatore). false se il corpo non è un satellite del modello.
   */
  matriceF(ssid: number, jdTT: number, out: Float64Array): boolean {
    return this.satelliti.matriceF(ssid, jdTT, out);
  }

  // --- Orientamento dei satelliti sincroni (§ 7.5.5) ---

  /**
   * Direzione media dal satellite al pianeta (longitudine media λ del modello, nel piano dell'orbita del record)
   * e polo dell'orbita media, nell'eclittica J2000. false se il record non è disponibile.
   */
  direzioniSincrone(ssid: number, jdTT: number, versoPrimario: Float64Array, poloOrbita: Float64Array): boolean {
    const cfg = this.satelliti.configurazione(ssid);
    if (cfg === undefined) return false;
    const k = bloccoDi(jdTT);
    if (k < 0) return false;
    const f = this.satelliti.file(k);
    if (f === null) return false;
    const j = f.indiceRecord(ssid, jdTT);
    if (j < 0) return false;
    elementiRecord(f.record(ssid)![j]!, cfg.frequenze, jdTT, this.elModello);
    const el = this.elModello;
    const fi = el.fattoreI;
    const tt = fi > 0 ? el.tanI2 : 1 / el.tanI2;
    const p = tt * Math.sin(el.omega);
    const q = tt * Math.cos(el.omega);
    const p2 = p * p;
    const q2 = q * q;
    const s2 = 1 + p2 + q2;
    const fx = (1 - p2 + q2) / s2;
    const fy = (2 * p * q) / s2;
    const fz = (-2 * fi * p) / s2;
    const gx = (2 * fi * p * q) / s2;
    const gy = ((1 + p2 - q2) * fi) / s2;
    const gz = (2 * q) / s2;
    const cl = Math.cos(el.lam);
    const sl = Math.sin(el.lam);
    // direzione dal pianeta al satellite (media) e polo f × g, nel sistema F
    const ux = cl * fx + sl * gx;
    const uy = cl * fy + sl * gy;
    const uz = cl * fz + sl * gz;
    const wx = fy * gz - fz * gy;
    const wy = fz * gx - fx * gz;
    const wz = fx * gy - fy * gx;
    this.satelliti.matriceF(ssid, jdTT, this.matriceFLavoro);
    const m = this.matriceFLavoro;
    versoPrimario[0] = -(m[0]! * ux + m[1]! * uy + m[2]! * uz);
    versoPrimario[1] = -(m[3]! * ux + m[4]! * uy + m[5]! * uz);
    versoPrimario[2] = -(m[6]! * ux + m[7]! * uy + m[8]! * uz);
    poloOrbita[0] = m[0]! * wx + m[1]! * wy + m[2]! * wz;
    poloOrbita[1] = m[3]! * wx + m[4]! * wy + m[5]! * wz;
    poloOrbita[2] = m[6]! * wx + m[7]! * wy + m[8]! * wz;
    return true;
  }
}

/** Primo e ultimo blocco (limitati a 0..K-1) che coprono [jd0, jd1]. */
export function intervalloBlocchi(jd0: number, jd1: number): [number, number] {
  const a = Math.min(jd0, jd1);
  const b = Math.max(jd0, jd1);
  const k0 = a < T0 ? 0 : a >= T_END ? K - 1 : bloccoDi(a);
  const k1 = b < T0 ? 0 : b >= T_END ? K - 1 : bloccoDi(b);
  return [k0, k1];
}
