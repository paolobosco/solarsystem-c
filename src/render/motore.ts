// Motore della scena su CPU (§ 5.5): stati in Float64, origine sul corpo a fuoco, proiezione unica,
// occlusione analitica, raggruppamento delle lune, marcatori, orbite con budget, etichette.
// Nessun accesso al DOM né a WebGL: è eseguibile in Node (test e benchmark, A20, A21).

import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import type { CorpoCatalogo } from '../data/catalogTypes';
import { UA_KM } from '../ephem/constants';
import type { Affidabilita, ElementiOrbita, EphemerisService, Livello, StatoEffemeride } from '../ephem/types';
import type { TimeState } from '../time/types';
import {
  ANELLI_DISTANZA_UA,
  BUDGET_ORBITE,
  DIMENSIONE_MARCATORE,
  DURATA_DISSOLVENZA_MS,
  DURATA_TRANSIZIONE_MS,
  ELEVAZIONE_PREDEFINITA,
  ESTENSIONE_INIZIALE_KM,
  ETICHETTE_ALTEZZA_PX,
  ETICHETTE_SCOSTAMENTO_PX,
  FRAZIONE_PERIODO_MAX,
  MARGINE_ANELLO_SELEZIONE_PX,
  MARGINE_INQUADRATURA_ORBITA,
  OPACITA_OCCLUSO,
  RAGGIO_MIN_IMPOSTORE_PX,
  SOGLIA_DISSOLVENZA_DIAMETRO_PX,
  SOGLIA_LUNE_PX,
  SOGLIA_ORBITE_LUNE_PX,
} from './costanti';
import {
  angoliDaVettore,
  creaCamera,
  distanzaDaEstensione,
  distanzaInquadraCorpo,
  distanzaMassima,
  distanzaMinima,
  estensioneDaDistanza,
  tanMezzoFov,
  versoreDaAngoli,
} from './camera';
import { MASCHERA_TUTTE, RegistroCorpi, bitCategoria } from './corpi';
import type { CorpoScena } from './corpi';
import { PUNTI_ANELLO, verticiAnelloDistanza } from './grid';
import { LayoutEtichette } from './labels';
import { CAPACITA_ORBITA, campionaOrbita, creaOrbitaCampionata } from './orbits';
import type { OrbitaCampionata } from './orbits';
import { identita3 } from './orientamento';
import type { FornitoreOrientamento } from './orientamento';
import { GestoreFuoco, corpoConPosizione } from './origin';
import type { StatiFrame } from './origin';
import { Selettore } from './picking';
import type { DatiSelezione, EsitoSelezione } from './picking';
import { Proiettore, bordoContorno, cordaContorno, intersezioneEllissoide, intersezioneSfera, semiampiezzaX, semiampiezzaY } from './projection';
import { LIVELLI_PREDEFINITI } from './tipi';
import type { Inquadratura, InfoCorpoScena, LivelliVisivi, OpzioniFuoco, PosizioneSchermo, StatoVista } from './tipi';
import type { CategoriaCorpo } from '../data/catalogTypes';

const STATI: readonly StatoEffemeride[] = ['ok', 'caricamento', 'fuori-copertura', 'non-determinabile'];
const LIVELLI: readonly Livello[] = ['precisa', 'buona', 'approssimata', 'indicativa', 'non-determinabile'];
export const LIV_INDICATIVA = 3;
export const LIV_NON_DETERMINABILE = 4;

function codiceStato(s: StatoEffemeride): number {
  return s === 'ok' ? 0 : s === 'caricamento' ? 1 : s === 'fuori-copertura' ? 2 : 3;
}

function codiceLivello(l: Livello): number {
  return l === 'precisa' ? 0 : l === 'buona' ? 1 : l === 'approssimata' ? 2 : l === 'indicativa' ? 3 : 4;
}

export interface OpzioniMotore {
  catalogo: readonly CorpoCatalogo[];
  effemeridi: EphemerisService;
  orientamento?: FornitoreOrientamento | null;
  aspetto?: number;
  movimentoRidotto?: boolean;
}

/** Dati CPU di un anello di distanza. */
export interface AnelloDistanza {
  readonly raggio: number;
  readonly vertici: Float32Array;
  readonly param: Float32Array;
  n: number;
  theta: number;
  versione: number;
  visibile: boolean;
  /** Posizione dell'ancora relativa all'origine (Float64). */
  readonly pos: Float64Array;
}

export class Motore implements StatiFrame, DatiSelezione {
  readonly registro: RegistroCorpi;
  readonly n: number;
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3();
  readonly fuoco: GestoreFuoco;
  readonly proiettore = new Proiettore();
  readonly selettore: Selettore;
  readonly layout: LayoutEtichette;
  readonly effemeridi: EphemerisService;
  orientamento: FornitoreOrientamento | null;
  movimentoRidotto: boolean;

  // Tempo e riproduzione.
  tempo: TimeState | null = null;
  versioneTempo = 0;
  private versioneStati = -1;
  private ricaricaStati = false;
  /** Ultimo fuoco con inquadratura 'orbita' impostato prima che gli stati fossero calcolati. */
  private fuocoDaRiapplicare: { ssid: number; opz: OpzioniFuoco } | null = null;
  /** Velocità di riproduzione in giorni simulati per secondo reale (0 = pausa). */
  velocita = 0;
  /** Durata media del frame in secondi (misurata dal renderer). */
  intervalloFrameS = 1 / 60;

  // Stato di vista.
  livelli: LivelliVisivi = { ...LIVELLI_PREDEFINITI };
  mascheraFiltri = MASCHERA_TUTTE;
  selezione = -1;
  passaggio = -1;
  readonly esclusi: Uint8Array;
  readonly orbiteExtra = new Set<number>();
  larghezza = 1;
  altezza = 1;

  // Per corpo.
  readonly stati: Float64Array;
  readonly ok: Uint8Array;
  readonly esito: Uint8Array;
  readonly livello: Uint8Array;
  readonly eps: Float64Array;
  readonly orient: Float64Array;
  readonly orientOk: Uint8Array;
  /** Viste di 9 elementi su orient, una per corpo (create una volta). */
  private readonly orientViste: Float64Array[];
  readonly omega: Float64Array;
  readonly rel: Float64Array;
  readonly vista: Float64Array;
  readonly schermo: Float64Array;
  readonly dist: Float64Array;
  readonly raggioPx: Float64Array;
  /**
   * Contorno proiettato del disco (sfera di raggio massimo, Proiettore.contorno), 7 valori per corpo: centro x e y
   * (px CSS), semiasse radiale a, semiasse tangenziale b, versore radiale sullo schermo, k. Senza raggi a = b = 0;
   * con la sfera non tutta davanti alla camera a = b = Infinity. Centro sul centro proiettato in entrambi i casi.
   */
  readonly contorno: Float64Array;
  readonly davanti: Uint8Array;
  readonly nelCampo: Uint8Array;
  readonly visibile: Uint8Array;
  readonly occluso: Uint8Array;
  readonly lunaNascosta: Uint8Array;
  readonly contatoreLune: Uint16Array;
  readonly troppoRapido: Uint8Array;
  /** Comete: direzione della coda antisolare sullo schermo (rad, y verso l'alto). */
  readonly rotazioneCoda: Float32Array;
  /** Fattore di dissolvenza 0..1 (disco > 10 px), animato in 200 ms. */
  readonly dissolvenza: Float32Array;
  /** Opacità finale del marcatore (0 = non disegnato). */
  readonly opacitaMarcatore: Float32Array;
  readonly marcatoreSelezionabile: Uint8Array;
  readonly discoVisibile: Uint8Array;
  readonly precedenza: Int32Array;

  // Orbite.
  readonly orbite: OrbitaCampionata[];
  readonly orbitaVersioneTempo: Float64Array;
  /** Incrementata a ogni ricostruzione: il renderer carica la geometria. */
  readonly orbitaGeometria: Int32Array;
  readonly orbitaAttiva: Uint8Array;
  readonly orbitaEvidenziata: Uint8Array;
  readonly orbitaTratteggiata: Uint8Array;
  readonly orbitaPrimario: Int32Array;
  readonly orbitaPos: Float64Array;
  readonly orbitaForma: Uint8Array;
  readonly elementi: ElementiOrbita = {
    primario: 0,
    baricentrici: false,
    q: 0,
    e: 0,
    i: 0,
    nodo: 0,
    argPeri: 0,
    anomaliaVera: 0,
    forma: 'determinata',
  };
  orbiteRicostruiteUltimoFrame = 0;

  // Anelli di distanza (le ultime voci del layout delle etichette).
  readonly anelli: AnelloDistanza[];

  // Memoria di lavoro.
  private readonly statoTmp = new Float64Array(6);
  private readonly aff: Affidabilita = { livello: 'precisa', epsModello: 0, epsDeltaT: 0, epsTotale: 0 };
  private readonly ordineCalcolo: Int32Array;
  private readonly tmp3 = new Float64Array(3);
  private readonly tmp3b = new Float64Array(3);
  private readonly dirRaggio = new Float64Array(3);
  private readonly centroRel = new Float64Array(3);
  private ultimaOra = 0;
  private animazioni = false;
  private readonly versore = new Float64Array(3);

  constructor(opz: OpzioniMotore) {
    this.registro = new RegistroCorpi(opz.catalogo);
    const n = this.registro.n;
    this.n = n;
    this.effemeridi = opz.effemeridi;
    this.orientamento = opz.orientamento ?? null;
    this.movimentoRidotto = opz.movimentoRidotto ?? false;
    this.camera = creaCamera(opz.aspetto ?? 1);
    this.fuoco = new GestoreFuoco(this.camera, this.target);
    this.fuoco.fuoco = this.registro.sole;
    this.fuoco.riferimento = this.registro.sole;
    this.selettore = new Selettore(n);
    this.esclusi = new Uint8Array(n);
    this.stati = new Float64Array(6 * n);
    this.ok = new Uint8Array(n);
    this.esito = new Uint8Array(n).fill(1);
    this.livello = new Uint8Array(n);
    this.eps = new Float64Array(n);
    this.orient = new Float64Array(9 * n);
    for (let i = 0; i < n; i++) identita3(this.orient, 9 * i);
    this.orientViste = Array.from({ length: n }, (_, i) => this.orient.subarray(9 * i, 9 * i + 9));
    this.orientOk = new Uint8Array(n);
    this.omega = new Float64Array(n);
    this.rel = new Float64Array(3 * n);
    this.vista = new Float64Array(3 * n);
    this.schermo = new Float64Array(2 * n);
    this.dist = new Float64Array(n);
    this.raggioPx = new Float64Array(n);
    this.contorno = new Float64Array(7 * n);
    this.davanti = new Uint8Array(n);
    this.nelCampo = new Uint8Array(n);
    this.visibile = new Uint8Array(n);
    this.occluso = new Uint8Array(n);
    this.lunaNascosta = new Uint8Array(n);
    this.contatoreLune = new Uint16Array(n);
    this.troppoRapido = new Uint8Array(n);
    this.rotazioneCoda = new Float32Array(n);
    this.dissolvenza = new Float32Array(n).fill(1);
    this.opacitaMarcatore = new Float32Array(n);
    this.marcatoreSelezionabile = new Uint8Array(n);
    this.discoVisibile = new Uint8Array(n);
    this.precedenza = Int32Array.from(this.registro.corpi.map((c) => c.precedenza));
    this.orbite = this.registro.corpi.map(() => creaOrbitaCampionata(CAPACITA_ORBITA));
    this.orbitaVersioneTempo = new Float64Array(n).fill(-1);
    this.orbitaGeometria = new Int32Array(n);
    this.orbitaAttiva = new Uint8Array(n);
    this.orbitaEvidenziata = new Uint8Array(n);
    this.orbitaTratteggiata = new Uint8Array(n);
    this.orbitaPrimario = new Int32Array(n).fill(-1);
    this.orbitaPos = new Float64Array(3 * n);
    this.orbitaForma = new Uint8Array(n);
    // Ordine di calcolo (§ 5.5 punto 2): Sole e pianeti, Luna, satelliti, altri.
    const classeCalcolo = (c: CorpoScena): number =>
      c.categoria === 'sole' ? 0 : c.categoria === 'pianeta' ? 1 : c.slug === 'luna' ? 2 : c.categoria === 'luna' ? 3 : 4;
    this.ordineCalcolo = Int32Array.from(
      this.registro.corpi.map((c) => c.ssid).sort((a, b) => classeCalcolo(this.registro.corpi[a]!) - classeCalcolo(this.registro.corpi[b]!) || a - b),
    );
    this.anelli = ANELLI_DISTANZA_UA.map((ua) => ({
      raggio: ua * UA_KM,
      vertici: new Float32Array(3 * (PUNTI_ANELLO + 64)),
      param: new Float32Array(PUNTI_ANELLO + 64),
      n: 0,
      theta: Number.NaN,
      versione: 0,
      visibile: false,
      pos: new Float64Array(3),
    }));
    this.layout = new LayoutEtichette(n + this.anelli.length);
    const ordine = new Int32Array(n + this.anelli.length);
    ordine.set(this.registro.ordineStatico);
    for (let k = 0; k < this.anelli.length; k++) ordine[n + k] = n + k;
    this.layout.ordine = ordine;
    for (let i = 0; i < n + this.anelli.length; i++) this.layout.larghezza[i] = 60;
    // Vista iniziale (§ 11.12): Sistema interno, 30° sopra l'eclittica.
    versoreDaAngoli(-Math.PI / 2, ELEVAZIONE_PREDEFINITA, this.versore);
    const d = distanzaDaEstensione(ESTENSIONE_INIZIALE_KM, opz.aspetto ?? 1);
    this.camera.position.set(this.versore[0]! * d, this.versore[1]! * d, this.versore[2]! * d);
    this.camera.lookAt(this.target);
  }

  // --- StatiFrame ---

  primario(ssid: number): number {
    return this.registro.corpi[ssid]?.primario ?? -1;
  }

  // --- Impostazioni ---

  impostaTempo(t: TimeState): void {
    const prec = this.tempo;
    if (prec && prec.jdTT === t.jdTT && prec.jdUT === t.jdUT && prec.scalaIngresso === t.scalaIngresso && prec.deltaTSigma === t.deltaTSigma) return;
    this.tempo = { jdUT: t.jdUT, jdTT: t.jdTT, deltaT: t.deltaT, deltaTSigma: t.deltaTSigma, scalaIngresso: t.scalaIngresso };
    this.versioneTempo++;
  }

  /** Dati effemeridi cambiati (blocchi caricati): ricalcolo di stati e orbite. */
  invalidaDati(): void {
    this.versioneStati = -1;
    this.orbitaVersioneTempo.fill(-1);
  }

  impostaFiltri(categorie: Iterable<CategoriaCorpo>): void {
    let m = bitCategoria('sole');
    for (const c of categorie) m |= bitCategoria(c);
    this.mascheraFiltri = m;
    this.layout.invalida();
  }

  impostaSelezione(ssid: number | null): void {
    this.selezione = ssid ?? -1;
    this.layout.invalida();
  }

  /**
   * Il corpo selezionato ha l'anello di selezione disegnato (§ 11.5.1): non senza posizione determinabile (§ 7.8.2),
   * dietro la camera, fuori dal campo o con la luna nascosta nel contatore del pianeta.
   */
  selezioneConAnello(): boolean {
    const s = this.selezione;
    return (
      s >= 0 &&
      this.visibile[s] === 1 &&
      this.davanti[s] === 1 &&
      this.nelCampo[s] === 1 &&
      this.lunaNascosta[s] === 0 &&
      this.livello[s] !== LIV_NON_DETERMINABILE
    );
  }

  // --- Fuoco e camera ---

  /**
   * Corpo che fa da origine quando ssid è a fuoco: ssid stesso, o il primo antenato con posizione se ssid non ne
   * ha alla data (§ 7.8.2); ssid se gli stati non sono ancora calcolati.
   */
  riferimentoPer(ssid: number): number {
    if (this.versioneStati < 0) return ssid;
    const r = corpoConPosizione(ssid, this);
    return r >= 0 ? r : ssid;
  }

  /**
   * Distanza finale per un'inquadratura; dir: versore finale camera - bersaglio (predefinito: quello attuale).
   * Distanza minima e inquadratura si riferiscono al corpo che fa da origine: per un corpo senza posizione alla
   * data resta la vista attuale, se almeno ampia quanto l'inquadratura del corpo d'origine, oppure l'orbita.
   */
  distanzaPer(ssid: number, inq: Inquadratura, dir?: ArrayLike<number>): number | null {
    const c = this.registro.corpo(ssid);
    const aspetto = this.camera.aspect;
    const rif = this.riferimentoPer(ssid);
    const dMin = distanzaMinima(this.registro.corpo(rif).raggioMax);
    const dMax = distanzaMassima(aspetto);
    const limita = (d: number): number => Math.min(dMax, Math.max(dMin, d));
    if (typeof inq === 'object') return limita(distanzaDaEstensione(inq.estensioneKm, aspetto));
    if (inq === 'orbita' && this.orbite[ssid]!.valida) return limita(this.distanzaOrbita(ssid, rif, aspetto, dir ?? this.versoreCamera()));
    if (rif !== ssid) return limita(Math.max(this.distanzaCamera(), this.distanzaPer(rif, 'corpo')!));
    if (inq === 'mantieni') return null;
    if (inq === 'corpo') return c.raggioMax > 0 ? distanzaInquadraCorpo(c.raggioMax, aspetto) : distanzaDaEstensione(1e4, aspetto);
    if (inq === 'sistema') {
      let amax = 0;
      for (const l of c.lune) {
        const o = this.orbite[l]!;
        if (o.valida && o.e < 0.1) amax = Math.max(amax, o.semiasse);
        else if (!o.valida) amax = Math.max(amax, this.semiasseStimato(l));
      }
      if (amax > 0) return Math.max(distanzaMinima(c.raggioMax), distanzaDaEstensione(2.4 * amax, aspetto));
      return this.distanzaPer(ssid, 'corpo');
    }
    // 'orbita' senza orbita campionata: cerchio di raggio a attorno al primario, punti fino a 2a dal corpo.
    const a = this.semiasseStimato(ssid);
    if (a > 0) {
      const k = MARGINE_INQUADRATURA_ORBITA * tanMezzoFov() * Math.min(1, aspetto);
      return limita(2 * a * (1 + 1 / k));
    }
    return this.distanzaPer(ssid, 'corpo');
  }

  /**
   * Distanza che porta l'orbita campionata di ssid entro MARGINE_INQUADRATURA_ORBITA della mezza larghezza e della
   * mezza altezza della vista, con la camera puntata sul corpo d'origine rif lungo dir (proiezione prospettica:
   * per ogni punto q, d ≥ q·dir + |q·x|/(m·tan·aspetto) e d ≥ q·dir + |q·y|/(m·tan)).
   */
  private distanzaOrbita(ssid: number, rif: number, aspetto: number, dir: ArrayLike<number>): number {
    const o = this.orbite[ssid]!;
    const p = this.orbitaPrimario[ssid]!;
    // Vertici relativi all'ancora; ancora relativa al primario; bersaglio sul corpo d'origine.
    let cx = o.ancora[0]!;
    let cy = o.ancora[1]!;
    let cz = o.ancora[2]!;
    if (p >= 0 && this.ok[p] === 1 && this.ok[rif] === 1) {
      cx += this.stati[6 * p]! - this.stati[6 * rif]!;
      cy += this.stati[6 * p + 1]! - this.stati[6 * rif + 1]!;
      cz += this.stati[6 * p + 2]! - this.stati[6 * rif + 2]!;
    }
    const uz0 = dir[0]!;
    const uz1 = dir[1]!;
    const uz2 = dir[2]!;
    // Assi della camera con up = z (come lookAt): x = up × u, y = u × x.
    let ux0 = -uz1;
    let ux1 = uz0;
    const lx = Math.hypot(ux0, ux1);
    if (lx > 1e-9) {
      ux0 /= lx;
      ux1 /= lx;
    } else {
      ux0 = 1;
      ux1 = 0;
    }
    const uy0 = -uz2 * ux1;
    const uy1 = uz2 * ux0;
    const uy2 = uz0 * ux1 - uz1 * ux0;
    const t = MARGINE_INQUADRATURA_ORBITA * tanMezzoFov();
    let d = 0;
    for (let i = 0; i < o.n; i++) {
      const qx = cx + o.vertici[3 * i]!;
      const qy = cy + o.vertici[3 * i + 1]!;
      const qz = cz + o.vertici[3 * i + 2]!;
      const x = qx * ux0 + qy * ux1;
      const y = qx * uy0 + qy * uy1 + qz * uy2;
      const z = qx * uz0 + qy * uz1 + qz * uz2;
      d = Math.max(d, z + Math.abs(x) / (t * aspetto), z + Math.abs(y) / t);
    }
    return d;
  }

  /** Versore attuale camera - bersaglio. */
  private versoreCamera(): Float64Array {
    const v = this.vettoreCamera();
    const l = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!) || 1;
    this.versore[0] = v[0]! / l;
    this.versore[1] = v[1]! / l;
    this.versore[2] = v[2]! / l;
    return this.versore;
  }

  /** Semiasse dall'orbita campionata o, in mancanza, dalla distanza attuale dal primario. */
  private semiasseStimato(ssid: number): number {
    const o = this.orbite[ssid]!;
    if (o.valida) return o.semiasse;
    const p = this.primario(ssid);
    if (p < 0 || this.ok[ssid] !== 1 || this.ok[p] !== 1) return 0;
    const dx = this.stati[6 * ssid]! - this.stati[6 * p]!;
    const dy = this.stati[6 * ssid + 1]! - this.stati[6 * p + 1]!;
    const dz = this.stati[6 * ssid + 2]! - this.stati[6 * p + 2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  impostaFuoco(ssid: number, ora: number, opz: OpzioniFuoco = {}): void {
    this.registro.corpo(ssid);
    const transizione = (opz.transizione ?? true) && !this.movimentoRidotto;
    const inq = opz.inquadratura ?? 'mantieni';
    // Elementi dell'orbita necessari all'inquadratura.
    if (inq === 'orbita' && !this.orbite[ssid]!.valida) this.costruisciOrbita(ssid);
    if (inq === 'sistema') for (const l of this.registro.corpo(ssid).lune) if (!this.orbite[l]!.valida) this.costruisciOrbita(l);
    // Direzione finale: quella attuale o, con l'elevazione richiesta, lo stesso azimut (sull'eclittica o sul piano
    // del sistema del corpo).
    let dir: Float64Array | null = null;
    const polo = new Float64Array(3);
    if ((opz.vistaSistema ?? inq === 'sistema') && this.poloSistema(ssid, polo)) {
      dir = new Float64Array(3);
      this.direzioneSulPiano(polo, opz.elevazione ?? ELEVAZIONE_PREDEFINITA, dir);
    } else if (opz.elevazione !== undefined) {
      const v = this.vettoreCamera();
      const { azimut } = angoliDaVettore(v[0]!, v[1]!, v[2]!);
      dir = new Float64Array(3);
      versoreDaAngoli(azimut, opz.elevazione, dir);
    }
    const d1 = this.distanzaPer(ssid, inq, dir ?? undefined);
    const haStati = this.versioneStati >= 0;
    this.fuoco.avvia(ssid, haStati ? this : null, ora, transizione ? DURATA_TRANSIZIONE_MS : 0, d1, dir);
    // Senza stati l'orbita non si può traslare sul primario: l'inquadratura si ricalcola al primo calcolo degli stati.
    this.fuocoDaRiapplicare = inq === 'orbita' && !haStati ? { ssid, opz } : null;
    this.layout.invalida();
  }

  /**
   * Polo del piano del sistema di ssid (§ 11.3): polo dell'orbita della luna di raggio maggiore, dallo stato relativo
   * al corpo (piano equatoriale per Marte, Giove, Saturno, Urano e Plutone; orbita della Luna, vicina all'eclittica,
   * per la Terra); senza lune con stato, asse di rotazione del corpo. False se nessuno dei due è disponibile.
   */
  poloSistema(ssid: number, out: Float64Array): boolean {
    const c = this.registro.corpo(ssid);
    let luna = -1;
    let rMax = -1;
    if (this.versioneStati >= 0 && this.ok[ssid] === 1) {
      for (const l of c.lune) {
        if (this.ok[l] !== 1) continue;
        const r = this.registro.corpo(l).raggioMax;
        if (r > rMax) {
          rMax = r;
          luna = l;
        }
      }
    }
    if (luna >= 0) {
      const s = this.stati;
      const a = 6 * luna;
      const b = 6 * ssid;
      const rx = s[a]! - s[b]!;
      const ry = s[a + 1]! - s[b + 1]!;
      const rz = s[a + 2]! - s[b + 2]!;
      const vx = s[a + 3]! - s[b + 3]!;
      const vy = s[a + 4]! - s[b + 4]!;
      const vz = s[a + 5]! - s[b + 5]!;
      const hx = ry * vz - rz * vy;
      const hy = rz * vx - rx * vz;
      const hz = rx * vy - ry * vx;
      const l = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (l > 0) {
        out[0] = hx / l;
        out[1] = hy / l;
        out[2] = hz / l;
        return true;
      }
    }
    if (this.orientOk[ssid] === 1) {
      const o = 9 * ssid;
      out[0] = this.orient[o + 2]!;
      out[1] = this.orient[o + 5]!;
      out[2] = this.orient[o + 8]!;
      return true;
    }
    return false;
  }

  /**
   * Versore camera - bersaglio con elevazione elev sul piano di polo n (versore), con l'azimut attuale attorno a n e
   * dallo stesso lato del piano (sul piano: lato di n). Con la camera lungo n, azimut della proiezione di -y.
   */
  private direzioneSulPiano(n: ArrayLike<number>, elev: number, out: Float64Array): void {
    const v = this.versoreCamera();
    const s = v[0]! * n[0]! + v[1]! * n[1]! + v[2]! * n[2]!;
    let hx = v[0]! - s * n[0]!;
    let hy = v[1]! - s * n[1]!;
    let hz = v[2]! - s * n[2]!;
    let lh = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (lh < 1e-9) {
      hx = n[1]! * n[0]!;
      hy = n[1]! * n[1]! - 1;
      hz = n[1]! * n[2]!;
      lh = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (lh < 1e-9) {
        hx = 1 - n[0]! * n[0]!;
        hy = -n[0]! * n[1]!;
        hz = -n[0]! * n[2]!;
        lh = Math.sqrt(hx * hx + hy * hy + hz * hz);
      }
    }
    const ce = Math.cos(elev) / lh;
    const se = (s < 0 ? -1 : 1) * Math.sin(elev);
    out[0] = hx * ce + n[0]! * se;
    out[1] = hy * ce + n[1]! * se;
    out[2] = hz * ce + n[2]! * se;
  }

  /** Nuovo aspetto della canvas: l'estensione della vista sul lato minore resta la stessa (§ 10.3, § 11.12). */
  impostaAspetto(aspetto: number): void {
    const cam = this.camera;
    if (!(aspetto > 0) || aspetto === cam.aspect) return;
    const k = Math.min(1, cam.aspect) / Math.min(1, aspetto);
    cam.aspect = aspetto;
    cam.updateProjectionMatrix();
    if (k !== 1) this.fuoco.scalaDistanza(k);
  }

  vettoreCamera(): Float64Array {
    this.tmp3[0] = this.camera.position.x - this.target.x;
    this.tmp3[1] = this.camera.position.y - this.target.y;
    this.tmp3[2] = this.camera.position.z - this.target.z;
    return this.tmp3;
  }

  distanzaCamera(): number {
    const v = this.vettoreCamera();
    return Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
  }

  /** Imposta la distanza camera-bersaglio mantenendo la direzione, entro i limiti del corpo a fuoco. */
  impostaDistanza(d: number): void {
    const v = this.vettoreCamera();
    const att = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!) || 1;
    const lim = Math.min(distanzaMassima(this.camera.aspect), Math.max(this.distanzaMinimaFuoco(), d));
    const k = lim / att;
    this.camera.position.set(this.target.x + v[0]! * k, this.target.y + v[1]! * k, this.target.z + v[2]! * k);
  }

  /** Distanza minima dal corpo che fa da origine (il corpo a fuoco o, senza posizione, il primario: § 10.3). */
  distanzaMinimaFuoco(): number {
    return distanzaMinima(this.registro.corpo(this.fuoco.riferimento).raggioMax);
  }

  /**
   * Distanza minima dal centro del corpo d'origine (§ 10.3, RF1) anche con il bersaglio spostato: OrbitControls
   * limita solo la distanza camera-bersaglio, e dopo uno spostamento una rotazione attorno al bersaglio porterebbe la
   * camera dentro il corpo. La camera torna radialmente alla distanza minima e resta puntata sul bersaglio. Vero se
   * la camera si è mossa di più di 1e-9 della distanza minima (sotto, nessun frame in più).
   */
  limitaDistanzaDalCentro(): boolean {
    if (this.fuoco.inTransizione) return false;
    const p = this.camera.position;
    const dMin = this.distanzaMinimaFuoco();
    const d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    if (!(d < dMin)) return false;
    if (d > 0) {
      const k = dMin / d;
      p.set(p.x * k, p.y * k, p.z * k);
    } else {
      // Camera nel centro: verso il bersaglio opposto, o lungo +z se coincide.
      const v = this.vettoreCamera();
      const l = Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);
      if (l > 0) p.set((v[0]! / l) * dMin, (v[1]! / l) * dMin, (v[2]! / l) * dMin);
      else p.set(0, 0, dMin);
    }
    this.camera.lookAt(this.target);
    return dMin - d > 1e-9 * dMin;
  }

  /** Posa esplicita della camera rispetto al corpo a fuoco (km); per test e diagnostica. */
  impostaPosa(posizione: ArrayLike<number>, bersaglio: ArrayLike<number>): void {
    this.fuoco.completa();
    this.target.set(bersaglio[0]!, bersaglio[1]!, bersaglio[2]!);
    this.camera.position.set(posizione[0]!, posizione[1]!, posizione[2]!);
    this.camera.lookAt(this.target);
  }

  // --- Passi del frame ---

  /** Passi 2 e 3 del § 5.5: stati in Float64, affidabilità, orientamenti, origine e transizione. */
  aggiornaStati(ora: number): boolean {
    this.ultimaOra = ora;
    const t = this.tempo;
    if (t && (this.versioneStati !== this.versioneTempo || this.ricaricaStati)) {
      this.ricaricaStati = false;
      const eff = this.effemeridi;
      for (let k = 0; k < this.n; k++) {
        const i = this.ordineCalcolo[k]!;
        const s = eff.stateAt(i, t.jdTT, this.statoTmp);
        const c = codiceStato(s);
        this.esito[i] = c;
        if (c === 1) this.ricaricaStati = true;
        const okI = c === 0 && Number.isFinite(this.statoTmp[0]!) ? 1 : 0;
        this.ok[i] = okI;
        for (let j = 0; j < 6; j++) this.stati[6 * i + j] = okI ? this.statoTmp[j]! : 0;
        eff.affidabilita(i, t, this.aff);
        this.livello[i] = okI ? codiceLivello(this.aff.livello) : LIV_NON_DETERMINABILE;
        this.eps[i] = this.aff.epsTotale;
      }
      const passoS = Math.abs(this.velocita) * 86_400 * this.intervalloFrameS;
      for (let i = 0; i < this.n; i++) {
        const c = this.registro.corpi[i]!;
        // Velocità angolare attorno al primario: |r × v|/r² (rad/s).
        const p = c.primario;
        this.omega[i] = 0;
        if (p >= 0 && this.ok[i] === 1 && this.ok[p] === 1) {
          const rx = this.stati[6 * i]! - this.stati[6 * p]!;
          const ry = this.stati[6 * i + 1]! - this.stati[6 * p + 1]!;
          const rz = this.stati[6 * i + 2]! - this.stati[6 * p + 2]!;
          const vx = this.stati[6 * i + 3]! - this.stati[6 * p + 3]!;
          const vy = this.stati[6 * i + 4]! - this.stati[6 * p + 4]!;
          const vz = this.stati[6 * i + 5]! - this.stati[6 * p + 5]!;
          const hx = ry * vz - rz * vy;
          const hy = rz * vx - rx * vz;
          const hz = rx * vy - ry * vx;
          const r2 = rx * rx + ry * ry + rz * rz;
          this.omega[i] = r2 > 0 ? Math.sqrt(hx * hx + hy * hy + hz * hz) / r2 : 0;
        }
        // Orientamento; fermo se il passo per fotogramma supera 1/8 del periodo di rotazione (§ 11.4.3). Il periodo
        // del catalogo è negativo per le rotazioni retrograde (Venere, Urano): conta il valore assoluto.
        if (this.orientamento && c.raggi) {
          const rot = c.rotazioneOre;
          const fermo = rot !== null && this.orientOk[i] === 1 && passoS > Math.abs(rot) * 3600 * FRAZIONE_PERIODO_MAX;
          if (!fermo) {
            const okO = this.orientamento.orientamento(i, t, this.orientViste[i]!);
            this.orientOk[i] = okO ? 1 : 0;
            if (!okO) identita3(this.orient, 9 * i);
          }
        }
      }
      this.versioneStati = this.versioneTempo;
      // Inquadratura 'orbita' richiesta prima degli stati (collegamento #slug all'avvio, § 11.12).
      const da = this.fuocoDaRiapplicare;
      if (da) {
        this.costruisciOrbita(da.ssid);
        this.impostaFuoco(da.ssid, ora, da.opz);
      }
    }
    const inTransizione = this.fuoco.aggiorna(ora, this);
    const o = this.fuoco.origine;
    for (let i = 0; i < this.n; i++) {
      this.rel[3 * i] = this.stati[6 * i]! - o[0]!;
      this.rel[3 * i + 1] = this.stati[6 * i + 1]! - o[1]!;
      this.rel[3 * i + 2] = this.stati[6 * i + 2]! - o[2]!;
    }
    return inTransizione || this.ricaricaStati;
  }

  /** Vero se il corpo è visibile per filtri, stato ed esclusioni. */
  private calcolaVisibile(i: number): number {
    if (this.ok[i] !== 1 || this.esclusi[i] === 1) return 0;
    const c = this.registro.corpi[i]!;
    if (c.categoria === 'sole' || i === this.selezione || i === this.fuoco.fuoco) return 1;
    return (c.maschera & this.mascheraFiltri) !== 0 ? 1 : 0;
  }

  /**
   * Passo 6 del § 5.5, anticipato rispetto agli aggiornamenti grafici perché marcatori e orbite
   * ne usano i risultati: proiezione, raggi apparenti, occlusione, lune raggruppate, marcatori.
   * Da chiamare dopo controls.update() e camera.updateMatrixWorld().
   */
  aggiornaVista(ora: number, larghezza: number, altezza: number): void {
    this.larghezza = larghezza;
    this.altezza = altezza;
    const pr = this.proiettore;
    pr.imposta(this.camera, larghezza, altezza);
    const n = this.n;
    for (let i = 0; i < n; i++) {
      this.visibile[i] = this.calcolaVisibile(i);
      pr.vista(this.rel[3 * i]!, this.rel[3 * i + 1]!, this.rel[3 * i + 2]!, this.vista, 3 * i);
      const vx = this.vista[3 * i]!;
      const vy = this.vista[3 * i + 1]!;
      const vz = this.vista[3 * i + 2]!;
      const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
      this.dist[i] = d;
      const dav = pr.schermo(vx, vy, vz, this.schermo, 2 * i);
      this.davanti[i] = dav ? 1 : 0;
      const c = this.registro.corpi[i]!;
      const rp = c.raggi ? pr.raggioApparente(c.raggioMax, d) : 0;
      this.raggioPx[i] = rp;
      // Nel campo se lo è il riquadro del contorno proiettato (almeno 16 px attorno al centro).
      const e = 7 * i;
      const ct = this.contorno;
      if (!c.raggi || !pr.contorno(vx, vy, vz, c.raggioMax, ct, e)) {
        ct[e] = this.schermo[2 * i]!;
        ct[e + 1] = this.schermo[2 * i + 1]!;
        ct[e + 2] = c.raggi ? Number.POSITIVE_INFINITY : 0;
        ct[e + 3] = ct[e + 2]!;
        ct[e + 4] = 1;
        ct[e + 5] = 0;
        ct[e + 6] = 1;
      }
      const mx = Math.max(16, Math.min(semiampiezzaX(ct, e), 1e6));
      const my = Math.max(16, Math.min(semiampiezzaY(ct, e), 1e6));
      const x = ct[e]!;
      const y = ct[e + 1]!;
      this.nelCampo[i] = dav && x >= -mx && x <= larghezza + mx && y >= -my && y <= altezza + my ? 1 : 0;
      this.lunaNascosta[i] = 0;
      this.contatoreLune[i] = 0;
      this.occluso[i] = 0;
    }
    // Lune a meno di 12 px dal pianeta: nascoste e contate (§ 11.5.1).
    for (let i = 0; i < n; i++) {
      const c = this.registro.corpi[i]!;
      if (c.categoria !== 'luna' || c.primario < 0) continue;
      const p = c.primario;
      if (i === this.selezione || i === this.fuoco.fuoco || this.visibile[i] !== 1 || this.davanti[i] !== 1) continue;
      if (this.visibile[p] !== 1 || this.davanti[p] !== 1) continue;
      const dx = this.schermo[2 * i]! - this.schermo[2 * p]!;
      const dy = this.schermo[2 * i + 1]! - this.schermo[2 * p + 1]!;
      if (dx * dx + dy * dy < SOGLIA_LUNE_PX * SOGLIA_LUNE_PX) {
        this.lunaNascosta[i] = 1;
        if (this.livello[i] !== LIV_NON_DETERMINABILE) this.contatoreLune[p] = this.contatoreLune[p]! + 1;
      }
    }
    // Occlusione analitica (§ 11.5.1): raggio camera-corpo contro le sfere dei corpi risolti più vicini.
    for (let j = 0; j < n; j++) {
      if (this.visibile[j] !== 1 || this.davanti[j] !== 1 || !(this.raggioPx[j]! >= 1)) continue;
      const rj = this.registro.corpi[j]!.raggioMax;
      const cx = this.vista[3 * j]!;
      const cy = this.vista[3 * j + 1]!;
      const cz = this.vista[3 * j + 2]!;
      for (let i = 0; i < n; i++) {
        if (i === j || this.occluso[i] === 1 || this.visibile[i] !== 1 || this.davanti[i] !== 1) continue;
        const di = this.dist[i]!;
        if (!(this.dist[j]! < di)) continue;
        const t = intersezioneSfera(this.vista[3 * i]! / di, this.vista[3 * i + 1]! / di, this.vista[3 * i + 2]! / di, cx, cy, cz, rj);
        if (t >= 0 && t < di) this.occluso[i] = 1;
      }
    }
    // Coda delle comete: derivata della proiezione prospettica lungo il versore Sole → cometa.
    const sole = this.registro.sole;
    for (let i = 0; i < n; i++) {
      if (this.registro.corpi[i]!.categoria !== 'cometa') continue;
      const x = this.vista[3 * i]!;
      const y = this.vista[3 * i + 1]!;
      const z = this.vista[3 * i + 2]!;
      const ax = x - this.vista[3 * sole]!;
      const ay = y - this.vista[3 * sole + 1]!;
      const az = z - this.vista[3 * sole + 2]!;
      this.rotazioneCoda[i] = Math.atan2(ay * -z + y * az, ax * -z + x * az);
    }
    // Antialiasing temporale (§ 11.4.3).
    const passoS = Math.abs(this.velocita) * 86_400 * this.intervalloFrameS;
    const soglia = 2 * Math.PI * 0.125;
    for (let i = 0; i < n; i++) {
      this.troppoRapido[i] = i !== this.fuoco.fuoco && this.omega[i]! * passoS > soglia ? 1 : 0;
    }
    // Marcatori: dissolvenza in 200 ms quando il diametro apparente supera 10 px.
    const dt = ora - (this.oraVistaPrec ?? ora);
    this.oraVistaPrec = ora;
    const passoDiss = this.movimentoRidotto ? 1 : DURATA_DISSOLVENZA_MS > 0 ? Math.max(0, dt) / DURATA_DISSOLVENZA_MS : 1;
    this.animazioni = false;
    for (let i = 0; i < n; i++) {
      const target = 2 * this.raggioPx[i]! > SOGLIA_DISSOLVENZA_DIAMETRO_PX ? 0 : 1;
      let f = this.dissolvenza[i]!;
      if (f !== target) {
        f = target > f ? Math.min(target, f + passoDiss) : Math.max(target, f - passoDiss);
        if (this.versioneVista === 0) f = target;
        this.dissolvenza[i] = f;
        if (f !== target) this.animazioni = true;
      }
      const base =
        this.livelli.marcatori &&
        this.visibile[i] === 1 &&
        this.nelCampo[i] === 1 &&
        this.lunaNascosta[i] === 0 &&
        this.troppoRapido[i] === 0 &&
        this.livello[i] !== LIV_NON_DETERMINABILE;
      this.opacitaMarcatore[i] = base ? f * (this.occluso[i] === 1 ? OPACITA_OCCLUSO : 1) : 0;
      this.marcatoreSelezionabile[i] =
        this.visibile[i] === 1 && this.nelCampo[i] === 1 && this.lunaNascosta[i] === 0 && this.livello[i] !== LIV_NON_DETERMINABILE ? 1 : 0;
      // Posizione non determinabile (§ 7.8.2): né marcatore né disco, il corpo resta negli elenchi.
      this.discoVisibile[i] =
        this.visibile[i] === 1 && this.davanti[i] === 1 && this.raggioPx[i]! >= RAGGIO_MIN_IMPOSTORE_PX && this.livello[i] !== LIV_NON_DETERMINABILE ? 1 : 0;
    }
    this.versioneVista++;
    this.aggiornaAttivitaOrbite();
  }

  private oraVistaPrec: number | null = null;
  private versioneVista = 0;

  get inAnimazione(): boolean {
    return this.animazioni;
  }

  /** Corpi la cui orbita è attiva (§ 10.2): pianeti, selezione, fuoco, extra, lune del sistema a fuoco. */
  private aggiornaAttivitaOrbite(): void {
    const f = this.fuoco.fuoco;
    const sistema = this.registro.corpi[f]!.categoria === 'luna' ? this.primario(f) : f;
    for (let i = 0; i < this.n; i++) {
      const c = this.registro.corpi[i]!;
      this.orbitaEvidenziata[i] = this.troppoRapido[i]!;
      let attiva = false;
      if (this.livelli.orbite && c.primario >= 0 && this.esclusi[i] !== 1) {
        const filtrato = (c.maschera & this.mascheraFiltri) !== 0 || i === this.selezione || i === f;
        const richiesta =
          c.categoria === 'pianeta' ||
          i === this.selezione ||
          i === f ||
          this.orbiteExtra.has(i) ||
          this.troppoRapido[i] === 1 ||
          (c.categoria === 'luna' && c.primario === sistema);
        const statoOk = this.ok[i] === 1 || this.orbitaForma[i] === 1;
        attiva = filtrato && richiesta && statoOk;
        if (attiva && c.categoria === 'luna' && i !== this.selezione && i !== f) {
          // Semiasse proiettato oltre 10 px (§ 10.2).
          const p = c.primario;
          const a = this.orbite[i]!.valida ? this.orbite[i]!.semiasse : this.semiasseStimato(i);
          const dp = this.dist[p]!;
          attiva = dp > 0 && (a / dp) * this.proiettore.focale > SOGLIA_ORBITE_LUNE_PX;
        }
      }
      this.orbitaAttiva[i] = attiva ? 1 : 0;
    }
  }

  /** Costruisce l'orbita di ssid all'istante corrente; restituisce true se valida. */
  costruisciOrbita(ssid: number): boolean {
    const t = this.tempo;
    if (!t) return false;
    const el = this.elementi;
    const s = this.effemeridi.orbitAt(ssid, t.jdTT, el);
    const o = this.orbite[ssid]!;
    this.orbitaVersioneTempo[ssid] = this.versioneTempo;
    this.orbitaGeometria[ssid]!++;
    if (s !== 'ok') {
      o.valida = false;
      this.orbitaForma[ssid] = 0;
      return false;
    }
    this.orbitaForma[ssid] = el.forma === 'determinata' ? 1 : 0;
    const conCorpo = this.ok[ssid] === 1 && Number.isFinite(el.anomaliaVera);
    // Livello "non determinabile" o posizione assente: orbita solo se la forma è determinata (§ 7.8.2).
    if ((!conCorpo || this.livello[ssid] === LIV_NON_DETERMINABILE) && el.forma !== 'determinata') {
      o.valida = false;
      return false;
    }
    campionaOrbita(el, conCorpo, o);
    this.orbitaPrimario[ssid] = el.primario;
    // Tratteggio solo per "indicativa" e "non determinabile" (§ 7.8.2, § 10.2): la forma non lo cambia.
    this.orbitaTratteggiata[ssid] = this.livello[ssid]! >= LIV_INDICATIVA ? 1 : 0;
    return o.valida;
  }

  /** Orbita in campo (§ 10.2): corpo disegnato nel campo della vista, o luna del sistema a fuoco. */
  private orbitaInCampo(i: number, sistema: number): boolean {
    if (this.visibile[i] === 1 && this.nelCampo[i] === 1) return true;
    const c = this.registro.corpi[i]!;
    return c.categoria === 'luna' && c.primario === sistema;
  }

  /**
   * Prossima orbita attiva da ricostruire: la meno recente (orbitaVersioneTempo minore, a parità l'ordine statico)
   * tra quelle in campo; se non ce ne sono, o con soloAnzianita, la meno recente tra tutte. -1 se sono tutte aggiornate.
   */
  private prossimaOrbita(sistema: number, soloAnzianita: boolean): number {
    const v = this.versioneTempo;
    const ordine = this.registro.ordineStatico;
    let scelta = -1;
    let sceltaFuori = 1;
    let sceltaVersione = Number.POSITIVE_INFINITY;
    for (let k = 0; k < this.n; k++) {
      const i = ordine[k]!;
      const versione = this.orbitaVersioneTempo[i]!;
      if (this.orbitaAttiva[i] !== 1 || versione === v) continue;
      const fuori = soloAnzianita || this.orbitaInCampo(i, sistema) ? 0 : 1;
      if (fuori < sceltaFuori || (fuori === sceltaFuori && versione < sceltaVersione)) {
        scelta = i;
        sceltaFuori = fuori;
        sceltaVersione = versione;
      }
    }
    return scelta;
  }

  /** Passo 5 del § 5.5 (parte CPU): orbite con budget e posizioni delle ancore in Float64. */
  aggiornaOrbite(): number {
    let costruite = 0;
    const v = this.versioneTempo;
    const f = this.fuoco.fuoco;
    if (this.tempo) {
      if (this.orbitaAttiva[f] === 1 && this.orbitaVersioneTempo[f] !== v) {
        this.costruisciOrbita(f);
        costruite++;
      }
      // Priorità: selezione; poi le orbite in campo e quelle delle lune del sistema a fuoco; poi le altre. Entro il
      // gruppo la meno recente per prima; l'ultimo posto va alla meno recente in assoluto (nessuna orbita esclusa).
      let budget = BUDGET_ORBITE;
      const sel = this.selezione;
      if (sel >= 0 && sel !== f && this.orbitaAttiva[sel] === 1 && this.orbitaVersioneTempo[sel] !== v) {
        this.costruisciOrbita(sel);
        costruite++;
        budget--;
      }
      const sistema = this.registro.corpi[f]!.categoria === 'luna' ? this.primario(f) : f;
      for (; budget > 0; budget--) {
        const i = this.prossimaOrbita(sistema, budget === 1);
        if (i < 0) break;
        this.costruisciOrbita(i);
        costruite++;
      }
    }
    // Posizioni delle ancore: il corpo se l'orbita è aggiornata, altrimenti fissa rispetto al primario.
    const o = this.fuoco.origine;
    for (let i = 0; i < this.n; i++) {
      const orb = this.orbite[i]!;
      if (this.orbitaAttiva[i] !== 1 || !orb.valida) continue;
      if (orb.conCorpo && this.orbitaVersioneTempo[i] === v && this.ok[i] === 1) {
        this.orbitaPos[3 * i] = this.rel[3 * i]!;
        this.orbitaPos[3 * i + 1] = this.rel[3 * i + 1]!;
        this.orbitaPos[3 * i + 2] = this.rel[3 * i + 2]!;
        continue;
      }
      const p = this.orbitaPrimario[i]!;
      const px = p >= 0 && this.ok[p] === 1 ? this.stati[6 * p]! : 0;
      const py = p >= 0 && this.ok[p] === 1 ? this.stati[6 * p + 1]! : 0;
      const pz = p >= 0 && this.ok[p] === 1 ? this.stati[6 * p + 2]! : 0;
      this.orbitaPos[3 * i] = px + orb.ancora[0]! - o[0]!;
      this.orbitaPos[3 * i + 1] = py + orb.ancora[1]! - o[1]!;
      this.orbitaPos[3 * i + 2] = pz + orb.ancora[2]! - o[2]!;
    }
    this.orbiteRicostruiteUltimoFrame = costruite;
    return costruite;
  }

  /** Anelli di distanza: ancoraggio vicino al fuoco e visibilità (R11). */
  aggiornaAnelli(): void {
    const o = this.fuoco.origine;
    const sole = this.registro.sole;
    const cam = this.proiettore.cam;
    const cx = o[0]! + cam[0]!;
    const cy = o[1]! + cam[1]!;
    const cz = o[2]! + cam[2]!;
    const dCamSole = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const dCam = this.distanzaCamera();
    const thetaF = Math.hypot(o[0]!, o[1]!) > 1 ? Math.atan2(o[1]!, o[0]!) : Math.atan2(cy, cx);
    for (const a of this.anelli) {
      const rPx = (a.raggio / Math.max(dCamSole, 1)) * this.proiettore.focale;
      a.visibile = this.livelli.anelliDistanza && this.visibile[sole] === 1 && rPx >= 6 && rPx <= 4e4;
      if (!a.visibile) continue;
      let dth = Math.abs(thetaF - a.theta);
      if (dth > Math.PI) dth = 2 * Math.PI - dth;
      if (!(dth * a.raggio <= 0.05 * Math.max(dCam, 1))) {
        a.theta = thetaF;
        a.n = verticiAnelloDistanza(a.raggio, thetaF, a.vertici, a.param);
        a.versione++;
      }
      a.pos[0] = a.raggio * Math.cos(a.theta) - o[0]!;
      a.pos[1] = a.raggio * Math.sin(a.theta) - o[1]!;
      a.pos[2] = -o[2]!;
    }
  }

  /** Etichette (§ 11.5.2): candidati, classi di priorità, layout con isteresi. */
  aggiornaEtichette(ora: number): boolean {
    const L = this.layout;
    const f = this.fuoco.fuoco;
    const sistema = this.registro.corpi[f]!.categoria === 'luna' ? this.primario(f) : f;
    const attivo = this.livelli.etichette;
    for (let i = 0; i < this.n; i++) {
      const c = this.registro.corpi[i]!;
      const forzata = i === this.selezione || i === this.passaggio;
      const disegnato = this.opacitaMarcatore[i]! > 0 || this.discoVisibile[i] === 1;
      const candidata =
        attivo &&
        this.visibile[i] === 1 &&
        this.nelCampo[i] === 1 &&
        this.lunaNascosta[i] === 0 &&
        this.livello[i] !== LIV_NON_DETERMINABILE &&
        (disegnato || forzata) &&
        (this.occluso[i] === 0 || forzata) &&
        (this.troppoRapido[i] === 0 || forzata);
      L.candidata[i] = candidata ? 1 : 0;
      const rp = this.raggioPx[i]!;
      const e = 7 * i;
      const x = this.schermo[2 * i]!;
      const y = this.schermo[2 * i + 1]!;
      if (rp < 60) {
        L.x[i] = x;
        L.y[i] = y;
        // Le code delle comete (fino a 13 px) non devono finire sotto l'etichetta; il disco occupa il contorno
        // proiettato, spostato rispetto al centro fuori dall'asse ottico.
        const coda = c.categoria === 'cometa' ? 13 * Math.abs(Math.cos(this.rotazioneCoda[i]!)) : 0;
        const disco = rp > 0 ? semiampiezzaX(this.contorno, e) + Math.abs(this.contorno[e]! - x) : 0;
        L.scostamento[i] = Math.max(ETICHETTE_SCOSTAMENTO_PX + coda, disco + 5);
      } else {
        this.etichettaDiscoGrande(i, L.larghezza[i]!);
      }
      L.classe[i] = forzata
        ? 0
        : c.categoria === 'sole' || c.categoria === 'pianeta'
          ? 1
          : c.categoria === 'pianeta-nano'
            ? 2
            : this.orbitaAttiva[i] === 1
              ? 3
              : c.categoria === 'luna' && c.primario === sistema
                ? 4
                : 5;
    }
    // Marcatore del corpo selezionato con l'anello (raggio del marcatore + 5 px + 2 px di tratto): le etichette degli
    // altri corpi non lo coprono (§ 11.5.2). Con il disco più grande del marcatore l'anello sta attorno al contorno
    // proiettato, e l'etichetta del disco è già oltre l'anello.
    const sel = this.selezione;
    const rMarcatore = sel >= 0 ? DIMENSIONE_MARCATORE[this.registro.corpi[sel]!.categoria] / 2 : 0;
    if (this.selezioneConAnello() && !(this.raggioPx[sel]! > rMarcatore)) L.impostaProtetto(sel, rMarcatore + MARGINE_ANELLO_SELEZIONE_PX + 2);
    else L.impostaProtetto(-1, 0);
    // Anelli di distanza: punto più basso dello schermo tra otto candidati sulla circonferenza, esclusi i punti
    // nascosti da un disco risolto (stessa occlusione analitica delle etichette dei corpi, § 11.5.1).
    const o = this.fuoco.origine;
    for (let k = 0; k < this.anelli.length; k++) {
      const a = this.anelli[k]!;
      const idx = this.n + k;
      L.candidata[idx] = 0;
      L.classe[idx] = 6;
      L.scostamento[idx] = 4;
      if (!attivo || !a.visibile) continue;
      let migliore = -1;
      let by = 0;
      let bx = 0;
      for (let j = 0; j < 8; j++) {
        const th = (2 * Math.PI * j) / 8 + Math.PI / 8;
        this.proiettore.vista(a.raggio * Math.cos(th) - o[0]!, a.raggio * Math.sin(th) - o[1]!, -o[2]!, this.tmp3b, 0);
        const px = this.tmp3b[0]!;
        const py = this.tmp3b[1]!;
        const pz = this.tmp3b[2]!;
        if (!this.proiettore.schermo(px, py, pz, this.tmp3b, 0)) continue;
        const x = this.tmp3b[0]!;
        const y = this.tmp3b[1]!;
        if (x < 0 || y < 0 || x > this.larghezza - 40 || y > this.altezza - 12) continue;
        if (this.puntoOccluso(px, py, pz)) continue;
        if (migliore < 0 || y > by) {
          migliore = j;
          by = y;
          bx = x;
        }
      }
      if (migliore >= 0) {
        L.candidata[idx] = 1;
        L.x[idx] = bx;
        L.y[idx] = by;
      }
    }
    return L.aggiorna(ora, this.larghezza, this.altezza);
  }

  /**
   * Disco grande: etichetta accanto al contorno proiettato, all'altezza del bordo a 45° sotto il centro (sopra se
   * fuori dalla vista). L'ancora è il centro della corda orizzontale del contorno alla riga dell'etichetta più vicina
   * al centro, lo scostamento metà della corda più ETICHETTE_SCOSTAMENTO_PX: a destra e a sinistra l'etichetta resta
   * fuori dal disco e dall'anello di selezione (5 px).
   * Senza un lato dentro la vista, o con il contorno illimitato, etichetta sul centro del disco.
   */
  private etichettaDiscoGrande(i: number, w: number): void {
    const L = this.layout;
    const ct = this.contorno;
    const e = 7 * i;
    const cx = ct[e]!;
    const cy = ct[e + 1]!;
    const h = ETICHETTE_ALTEZZA_PX;
    L.x[i] = cx;
    L.y[i] = cy;
    L.scostamento[i] = 4;
    let yl = cy + Math.SQRT1_2 * bordoContorno(ct, e, Math.SQRT1_2, Math.SQRT1_2);
    if (!(yl < this.altezza - 10)) yl = cy - Math.SQRT1_2 * bordoContorno(ct, e, Math.SQRT1_2, -Math.SQRT1_2);
    if (!(yl > 10 && yl < this.altezza - 10)) return;
    const riga = yl > cy ? Math.max(cy, yl - h / 2) : Math.min(cy, yl + h / 2);
    const corda = this.tmp3b;
    if (!cordaContorno(ct, e, riga, corda)) return;
    const xs = corda[0]!;
    const xd = corda[1]!;
    const g = ETICHETTE_SCOSTAMENTO_PX;
    if (xd + g + w > this.larghezza && xs - g - w < 0) return;
    L.x[i] = 0.5 * (xs + xd);
    L.y[i] = yl;
    L.scostamento[i] = 0.5 * (xd - xs) + g;
  }

  /** Punto in spazio vista nascosto dal disco di un corpo risolto più vicino alla camera (§ 11.5.1). */
  private puntoOccluso(px: number, py: number, pz: number): boolean {
    const dp = Math.sqrt(px * px + py * py + pz * pz);
    if (!(dp > 0)) return false;
    for (let j = 0; j < this.n; j++) {
      if (this.discoVisibile[j] !== 1 || !(this.dist[j]! < dp)) continue;
      const t = intersezioneSfera(px / dp, py / dp, pz / dp, this.vista[3 * j]!, this.vista[3 * j + 1]!, this.vista[3 * j + 2]!, this.registro.corpi[j]!.raggioMax);
      if (t >= 0 && t < dp) return true;
    }
    return false;
  }

  // --- Interrogazioni ---

  colpisceDisco(ssid: number, x: number, y: number): boolean {
    const c = this.registro.corpi[ssid]!;
    if (!c.raggi) return false;
    this.proiettore.raggioVista(x, y, this.tmp3b, 0);
    this.proiettore.ruotaInversa(this.tmp3b[0]!, this.tmp3b[1]!, this.tmp3b[2]!, this.dirRaggio, 0);
    const d = this.dirRaggio;
    const l = Math.sqrt(d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!);
    d[0] = d[0]! / l;
    d[1] = d[1]! / l;
    d[2] = d[2]! / l;
    const cam = this.proiettore.cam;
    this.centroRel[0] = this.rel[3 * ssid]! - cam[0]!;
    this.centroRel[1] = this.rel[3 * ssid + 1]! - cam[1]!;
    this.centroRel[2] = this.rel[3 * ssid + 2]! - cam[2]!;
    return intersezioneEllissoide(d, this.centroRel, this.orient, c.raggi, 0, 9 * ssid) >= 0;
  }

  scegli(x: number, y: number, tipo: string, ora: number, etichetta = -1): EsitoSelezione | null {
    return this.selettore.scegli(this, x, y, tipo, ora, etichetta);
  }

  corpoSotto(x: number, y: number, tipo: string): number {
    return this.selettore.sotto(this, x, y, tipo);
  }

  /** Corpi disegnati e nel campo, in ordine statico di priorità (navigazione con N, § 11.9). */
  corpiVisibiliOrdinati(): number[] {
    const out: number[] = [];
    for (let k = 0; k < this.n; k++) {
      const i = this.registro.ordineStatico[k]!;
      if (this.marcatoreSelezionabile[i] === 1 || this.discoVisibile[i] === 1) {
        const x = this.schermo[2 * i]!;
        const y = this.schermo[2 * i + 1]!;
        if (this.davanti[i] === 1 && x >= 0 && y >= 0 && x <= this.larghezza && y <= this.altezza) out.push(i);
      }
    }
    return out;
  }

  corpoPiuVicinoAlCentro(): number | null {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const i of this.corpiVisibiliOrdinati()) {
      const dx = this.schermo[2 * i]! - this.larghezza / 2;
      const dy = this.schermo[2 * i + 1]! - this.altezza / 2;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  }

  posizioneSchermo(ssid: number): PosizioneSchermo | null {
    if (ssid < 0 || ssid >= this.n) return null;
    const x = this.schermo[2 * ssid]!;
    const y = this.schermo[2 * ssid + 1]!;
    const visibile =
      this.visibile[ssid] === 1 &&
      this.davanti[ssid] === 1 &&
      this.occluso[ssid] === 0 &&
      x >= 0 &&
      y >= 0 &&
      x <= this.larghezza &&
      y <= this.altezza;
    return { x, y, visibile };
  }

  info(ssid: number): InfoCorpoScena | null {
    const c = this.registro.corpi[ssid];
    if (!c) return null;
    const p = this.posizioneSchermo(ssid)!;
    return {
      ssid,
      stato: STATI[this.esito[ssid]!]!,
      livello: LIVELLI[this.livello[ssid]!]!,
      visibile: p.visibile && (this.opacitaMarcatore[ssid]! > 0 || this.discoVisibile[ssid] === 1),
      x: p.x,
      y: p.y,
      raggioPx: this.raggioPx[ssid]!,
      occluso: this.occluso[ssid] === 1,
      motoTroppoRapido: this.troppoRapido[ssid] === 1,
      raggruppata: this.lunaNascosta[ssid] === 1,
      categoria: c.categoria,
    };
  }

  statoVista(contestoPerso: boolean): StatoVista {
    const d = this.distanzaCamera();
    // Distanza dal centro del corpo a fuoco (il bersaglio può essere spostato).
    const cam = this.camera.position;
    const dFuoco = Math.sqrt(cam.x * cam.x + cam.y * cam.y + cam.z * cam.z);
    // Profondità del centro del corpo a fuoco lungo l'asse ottico (camera → bersaglio): la scala del piano che lo
    // contiene (R14). Dopo uno spostamento il corpo esce dall'asse e la distanza cresce, la profondità no. Col
    // corpo dietro la camera vale la profondità del bersaglio.
    const v = this.vettoreCamera();
    const profondita = d > 0 ? (cam.x * v[0]! + cam.y * v[1]! + cam.z * v[2]!) / d : 0;
    return {
      fuoco: this.fuoco.fuoco,
      selezione: this.selezione >= 0 ? this.selezione : null,
      distanzaKm: dFuoco,
      estensioneKm: estensioneDaDistanza(d, this.camera.aspect),
      kmPerPx: this.proiettore.kmPerPx(profondita > 0 ? profondita : d),
      transizione: this.fuoco.inTransizione,
      fuocoSenzaPosizione: this.fuoco.senzaPosizione,
      contestoPerso,
      larghezzaPx: this.larghezza,
      altezzaPx: this.altezza,
      direzione: d > 0 ? [v[0]! / d, v[1]! / d, v[2]! / d] : [0, 0, 1],
    };
  }

  /** Ultimo istante passato ad aggiornaStati (ms). */
  get ora(): number {
    return this.ultimaOra;
  }
}

