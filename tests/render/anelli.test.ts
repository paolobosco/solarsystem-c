// Anelli di Saturno e Urano dal catalogo (§ 9, R7): raggi delle tabelle PDS nel campo `anelli` di catalog.json.

import { readFileSync } from 'node:fs';
import { LinearMipmapLinearFilter } from 'three';
import { describe, expect, it } from 'vitest';
import { leggiCatalogo } from '../../src/data/catalog';
import type { Catalogo } from '../../src/data/catalogTypes';
import { RegistroCorpi } from '../../src/render/corpi';
import { TAU_MINIMA_DISEGNO, creaProfiloSaturno, luceDaTau, profiloDaCatalogo, raggiStrettiDaCatalogo } from '../../src/render/rings';

const catalogo: Catalogo = leggiCatalogo(JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf-8')));
const corpo = (s: string) => catalogo.corpi.find((c) => c.slug === s)!;

describe('anelli dal catalogo (§ 9)', () => {
  it('Saturno: dall\'anello D all\'anello F; lacune e regioni più strette prevalgono', () => {
    const a = corpo('saturno').anelli!;
    const p = profiloDaCatalogo(a)!;
    const d = a.elementi.find((e) => e.nome === 'D Ring')!;
    const f = a.elementi.find((e) => e.nome === 'F Ring')!;
    expect(p.rInterno).toBe(d.rInterno_km);
    expect(p.rEsterno).toBe(f.rEsterno_km);
    // elementi troppo tenui (anelli G, E, di Febe) non disegnati
    expect(p.fasce.some((x) => x.nome === 'E Ring' || x.nome === 'Phoebe Ring' || x.nome === 'G Ring')).toBe(false);
    // ordine per larghezza decrescente: la divisione di Encke dopo l'anello A
    const iA = p.fasce.findIndex((x) => x.nome === 'A Ring');
    const iEncke = p.fasce.findIndex((x) => x.nome === 'Encke Gap');
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(iEncke).toBeGreaterThan(iA);
    expect(p.fasce[iEncke]!.tau).toBe(0);
    for (const x of p.fasce) expect(x.tau === 0 || x.tau >= TAU_MINIMA_DISEGNO).toBe(true);
    expect(luceDaTau(0)).toBe(0);
    expect(luceDaTau(3)).toBeGreaterThan(luceDaTau(0.1));
  });

  it('Urano: i dieci anelli stretti, raggi medi in ordine crescente', () => {
    const r = raggiStrettiDaCatalogo(corpo('urano').anelli!);
    expect(r.length).toBe(10);
    expect(r[0]).toBeCloseTo(41_837, 0);
    expect(r[9]).toBeCloseTo(51_149, 0);
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThan(r[i - 1]!);
  });

  it('il registro della scena conserva gli anelli del catalogo', () => {
    const reg = new RegistroCorpi(catalogo.corpi);
    expect(reg.perSlug.get('saturno')!.anelli).toBe(corpo('saturno').anelli);
    expect(reg.perSlug.get('giove')!.anelli).toBeNull();
  });
});

describe('profilo radiale di Saturno mediato sul pixel (R7)', () => {
  // 2048 texel da 36 km tra 0 e 73 728 km; anello uniforme τ 0,5 con una lacuna di 4 km nel texel 10, lontana
  // dal centro del texel (378 km).
  const fasce = [
    { nome: 'A', r0: 0, r1: 73_728, tau: 0.5, luce: 0.7 },
    { nome: 'lacuna', r0: 361, r1: 365, tau: 0, luce: 0 },
  ];
  const t = creaProfiloSaturno(fasce, 0, 73_728);
  const tau = (dati: ArrayLike<number>, i: number): number => (dati[4 * i]! / 255) * 3;

  it('una lacuna più stretta del texel ne attenua l\'opacità senza scurire la luce', () => {
    const d = t.image.data as Uint8Array;
    // Trasmissione media a incidenza normale: (32·e^-0,5 + 4)/36 = 0,650, τ efficace 0,431.
    expect(tau(d, 10)).toBeCloseTo(-Math.log((32 * Math.exp(-0.5) + 4) / 36), 1);
    expect(d[40]!).toBeLessThan(d[36]!);
    expect(d[41]).toBe(d[37]);
  });

  it('livelli mipmap fino a 1 texel; trasmissione media conservata', () => {
    expect(t.minFilter).toBe(LinearMipmapLinearFilter);
    expect(t.generateMipmaps).toBe(false);
    const livelli = (x: typeof t): { data: Uint8Array; width: number }[] => x.mipmaps as unknown as { data: Uint8Array; width: number }[];
    expect(livelli(t).length).toBe(12);
    expect(livelli(t)[11]!.width).toBe(1);
    const media = (dati: Uint8Array): number => {
      let s = 0;
      for (let i = 0; i < dati.length / 4; i++) s += Math.exp(-tau(dati, i));
      return (4 * s) / dati.length;
    };
    const p = profiloDaCatalogo(corpo('saturno').anelli!)!;
    const ts = creaProfiloSaturno(p.fasce, p.rInterno, p.rEsterno);
    const m0 = media(livelli(ts)[0]!.data);
    for (const l of livelli(ts)) expect(Math.abs(media(l.data) - m0)).toBeLessThan(0.02);
  });
});
