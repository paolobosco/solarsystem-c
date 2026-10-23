// Manifest dei dati, data/v1/manifest.json (§ 8.11 di docs/PROGETTO.md).
// Schema JSON corrispondente: docs/schema/manifest.schema.json; scritto da scripts/pipeline/pack.py.

import { B, K, T0, T_END } from '../ephem/constants';
import { MAGIC_AFFIDABILITA, MAGIC_LUNA, MAGIC_SATELLITI, MAGIC_SERIE, MAGIC_STELLE } from './binHeader';

export type TipoFile =
  | 'pianeti'
  | 'satelliti'
  | 'piccoli-corpi'
  | 'luna'
  | 'affidabilita'
  | 'stelle'
  | 'tempo'
  | 'catalogo'
  | 'texture';

export const TIPI_FILE: readonly TipoFile[] = [
  'pianeti',
  'satelliti',
  'piccoli-corpi',
  'luna',
  'affidabilita',
  'stelle',
  'tempo',
  'catalogo',
  'texture',
];

/** Tipi di file divisi in blocchi temporali (§ 8.1), gestiti con cache LRU (§ 5.6). */
export const TIPI_A_BLOCCHI: readonly TipoFile[] = ['pianeti', 'satelliti', 'piccoli-corpi'];

/** Magic atteso dei file binari per tipo (§ 8.2); null per JSON e immagini. */
export const MAGIC_PER_TIPO: Readonly<Record<TipoFile, string | null>> = {
  pianeti: MAGIC_SERIE,
  satelliti: MAGIC_SATELLITI,
  'piccoli-corpi': MAGIC_SERIE,
  luna: MAGIC_LUNA,
  affidabilita: MAGIC_AFFIDABILITA,
  stelle: MAGIC_STELLE,
  tempo: null,
  catalogo: null,
  texture: null,
};

export const PERCORSO_MANIFEST = 'manifest.json';

export interface VoceManifest {
  /** Percorso relativo in data/v1/. */
  percorso: string;
  tipo: TipoFile;
  /** Indice di blocco per i file a blocchi. */
  blocco?: number;
  byte: number;
  /** SHA-256 esadecimale minuscolo. */
  sha256: string;
}

export interface Manifest {
  formato: 1;
  /** AAAA-MM-GG */
  versioneDati: string;
  blocchi: { T0: number; B: number; K: number; T_END: number };
  file: VoceManifest[];
}

/** Manifest non conforme al formato. */
export class ErroreManifest extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreManifest';
  }
}

const RE_PERCORSO = /^(?!.*\.\.)[a-z0-9][a-z0-9_./-]*$/;
const RE_SHA = /^[0-9a-f]{64}$/;
const RE_DATA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function oggetto(v: unknown, dove: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ErroreManifest(`${dove}: oggetto atteso`);
  return v as Record<string, unknown>;
}

/**
 * Verifica il manifest (stessi vincoli dello schema): formato, data, blocchi uguali alle costanti del § 8.1,
 * voci con percorso relativo, tipo noto, blocco nei limiti, dimensione e SHA-256 validi, percorsi unici.
 */
export function leggiManifest(json: unknown): Manifest {
  const r = oggetto(json, 'manifest');
  if (r.formato !== 1) throw new ErroreManifest('formato non supportato');
  if (typeof r.versioneDati !== 'string' || !RE_DATA.test(r.versioneDati)) throw new ErroreManifest('versioneDati non valida');
  const b = oggetto(r.blocchi, 'blocchi');
  if (b.T0 !== T0 || b.B !== B || b.K !== K || b.T_END !== T_END) {
    throw new ErroreManifest('blocchi diversi dalle costanti del formato (§ 8.1)');
  }
  if (!Array.isArray(r.file) || r.file.length === 0) throw new ErroreManifest('elenco dei file assente');
  const visti = new Set<string>();
  const file: VoceManifest[] = [];
  for (const [i, x] of r.file.entries()) {
    const v = oggetto(x, `file[${i}]`);
    const { percorso, tipo, blocco, byte, sha256 } = v;
    if (typeof percorso !== 'string' || !RE_PERCORSO.test(percorso)) throw new ErroreManifest(`file[${i}]: percorso non valido`);
    if (visti.has(percorso)) throw new ErroreManifest(`percorso duplicato: ${percorso}`);
    visti.add(percorso);
    if (typeof tipo !== 'string' || !(TIPI_FILE as readonly string[]).includes(tipo)) {
      throw new ErroreManifest(`${percorso}: tipo non valido`);
    }
    const aBlocchi = (TIPI_A_BLOCCHI as readonly string[]).includes(tipo);
    if (aBlocchi !== (blocco !== undefined)) throw new ErroreManifest(`${percorso}: blocco incoerente con il tipo`);
    if (blocco !== undefined && !(Number.isInteger(blocco) && (blocco as number) >= 0 && (blocco as number) < K)) {
      throw new ErroreManifest(`${percorso}: blocco fuori intervallo`);
    }
    if (!(Number.isInteger(byte) && (byte as number) >= 0)) throw new ErroreManifest(`${percorso}: dimensione non valida`);
    if (typeof sha256 !== 'string' || !RE_SHA.test(sha256)) throw new ErroreManifest(`${percorso}: SHA-256 non valido`);
    const voce: VoceManifest = { percorso, tipo: tipo as TipoFile, byte: byte as number, sha256 };
    if (blocco !== undefined) voce.blocco = blocco as number;
    file.push(voce);
  }
  return { formato: 1, versioneDati: r.versioneDati, blocchi: { T0, B, K, T_END }, file };
}

/** Indice del manifest per percorso e per (tipo, blocco). */
export class IndiceManifest {
  readonly manifest: Manifest;
  private readonly perPercorso = new Map<string, VoceManifest>();
  private readonly perBlocco = new Map<string, VoceManifest>();

  constructor(manifest: Manifest) {
    this.manifest = manifest;
    for (const v of manifest.file) {
      this.perPercorso.set(v.percorso, v);
      if (v.blocco !== undefined) this.perBlocco.set(`${v.tipo}:${v.blocco}`, v);
    }
  }

  voce(percorso: string): VoceManifest | undefined {
    return this.perPercorso.get(percorso);
  }

  /** Voce del file a blocchi del tipo indicato per il blocco k, se presente. */
  blocco(tipo: TipoFile, k: number): VoceManifest | undefined {
    return this.perBlocco.get(`${tipo}:${k}`);
  }

  get file(): readonly VoceManifest[] {
    return this.manifest.file;
  }
}

/** Percorso convenzionale di un file a blocchi: planets/pKK.bin, sats/sKK.bin, small/bKK.bin. */
export function percorsoBlocco(tipo: 'pianeti' | 'satelliti' | 'piccoli-corpi', k: number): string {
  if (!(Number.isInteger(k) && k >= 0 && k < K)) throw new RangeError(`blocco fuori intervallo: ${k}`);
  const kk = k < 10 ? `0${k}` : `${k}`;
  if (tipo === 'pianeti') return `planets/p${kk}.bin`;
  if (tipo === 'satelliti') return `sats/s${kk}.bin`;
  return `small/b${kk}.bin`;
}
