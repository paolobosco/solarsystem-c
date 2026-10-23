// Lettura comune di public/data/v1/time.json e delle fixture di tests/fixtures/time/ (scripts/pipeline/time_model.py).

import { readFileSync } from 'node:fs';
import { leggiTimeDaBuffer } from '../../src/data/timeReader';
import type { DatiTempo } from '../../src/data/timeReader';

const DATI = new URL('../../public/data/v1/', import.meta.url);
const FIXTURE = new URL('../fixtures/time/', import.meta.url);

export function bufferTime(): ArrayBuffer {
  const b = readFileSync(new URL('time.json', DATI));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

export function jsonTime(): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL('time.json', DATI), 'utf-8')) as Record<string, unknown>;
}

let cache: DatiTempo | null = null;

export function datiTempo(): DatiTempo {
  cache ??= leggiTimeDaBuffer(bufferTime());
  return cache;
}

export function fixture<T>(nome: string): T {
  return JSON.parse(readFileSync(new URL(nome, FIXTURE), 'utf-8')) as T;
}

export const GRADI = 180 / Math.PI;

/** Differenza angolare in (-180°, 180°]. */
export function diffGradi(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}
