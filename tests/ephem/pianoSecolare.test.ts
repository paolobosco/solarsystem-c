// Piano secolare dei satelliti regolari nel servizio delle effemeridi (§ 7.5.4, § 7.5.5): orientamento sincrono
// coerente con l'orbita ruotata e nessuna allocazione nel percorso per frame dei record secolari.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bloccoDi } from '../../src/data/binHeader';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo } from '../../src/data/catalogTypes';
import { percorsoBlocco } from '../../src/data/manifest';
import { leggiLuna } from '../../src/data/moonReader';
import type { ElementiOrbita } from '../../src/ephem/types';
import { ServizioOrientamento } from '../../src/ephem/orientation';
import { ServizioEffemeridi, TIPI_BLOCCO } from '../../src/ephem/service';

const DATI = new URL('../../public/data/v1/', import.meta.url);

function buffer(url: URL): ArrayBuffer {
  const b = readFileSync(url);
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

const catalogo: Catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('catalog.json', DATI), 'utf-8')));
const ssid = (slug: string): number => catalogo.corpi.find((c) => c.slug === slug)!.ssid;
const JD = -1_931_000;
const servizio = new ServizioEffemeridi({ catalogo, affidabilita: null });
servizio.impostaLuna(leggiLuna(buffer(new URL('moon.bin', DATI))));
for (const t of TIPI_BLOCCO) servizio.registraBlocco(t, bloccoDi(JD), buffer(new URL(percorsoBlocco(t, bloccoDi(JD)), DATI)));

describe('piano secolare nel servizio delle effemeridi (§ 7.5.4)', () => {
  it('rotazione sincrona nel 10000 a.C.: polo del corpo lungo il polo dell’orbita ruotata, asse x verso il pianeta', () => {
    const o = new ServizioOrientamento(catalogo.corpi, { sincrono: (s, jd, v, p) => servizio.direzioniSincrone(s, jd, v, p) });
    const m = new Float64Array(9);
    const rel = new Float64Array(6);
    for (const slug of ['fobos', 'deimos', 'io', 'encelado', 'titano']) {
      const s = ssid(slug);
      expect(o.bodyFixedToScene(s, JD, m), slug).toBe(true);
      expect(servizio.statoRelativo(s, JD, rel)).toBe('ok');
      const r = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
      const cosx = -(m[0]! * rel[0]! + m[3]! * rel[1]! + m[6]! * rel[2]!) / r;
      expect(cosx, slug).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
      const hx = rel[1]! * rel[5]! - rel[2]! * rel[4]!;
      const hy = rel[2]! * rel[3]! - rel[0]! * rel[5]!;
      const hz = rel[0]! * rel[4]! - rel[1]! * rel[3]!;
      const cosz = (m[2]! * hx + m[5]! * hy + m[8]! * hz) / Math.hypot(hx, hy, hz);
      expect(cosz, slug).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
    }
  });

  it('stati, orbite e matrici F nei record secolari senza allocazioni', () => {
    const out = new Float64Array(6);
    const m = new Float64Array(9);
    const orb: ElementiOrbita = { primario: 0, baricentrici: false, q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0, forma: 'determinata' };
    const satelliti = Int32Array.from(catalogo.corpi.filter((c) => c.effemeridi.modello === 'satellite').map((c) => c.ssid));
    const acc = new Float64Array(1);
    const frame = (i: number): void => {
      const jd = JD + i * 0.37;
      for (let j = 0; j < satelliti.length; j++) {
        const s = satelliti[j]!;
        if (servizio.stateAt(s, jd, out) === 'ok') acc[0] = acc[0]! + out[0]!;
        if (servizio.orbitAt(s, jd, orb) === 'ok') acc[0] = acc[0]! + orb.q;
        if (servizio.matriceF(s, jd, m)) acc[0] = acc[0]! + m[0]!;
      }
    };
    frame(0);
    const nomi = ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Uint8Array', 'Array', 'Map', 'Set'] as const;
    const g = globalThis as unknown as Record<string, unknown>;
    const originali = nomi.map((n) => g[n]);
    let conteggio = 0;
    nomi.forEach((n, i) => {
      const C = originali[i] as new (...a: unknown[]) => unknown;
      g[n] = new Proxy(C, {
        construct(t, a, nt) {
          conteggio++;
          return Reflect.construct(t, a, nt) as object;
        },
        apply(t, self, a) {
          conteggio++;
          return Reflect.apply(t as unknown as (...x: unknown[]) => unknown, self, a);
        },
      });
    });
    try {
      for (let i = 1; i < 50; i++) frame(i);
    } finally {
      nomi.forEach((n, i) => {
        g[n] = originali[i];
      });
    }
    expect(conteggio).toBe(0);
    expect(Number.isFinite(acc[0]!)).toBe(true);
  });
});
