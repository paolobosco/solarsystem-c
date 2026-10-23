// Livello "Assi di rotazione" (RF5, § 7.5.5, § 7.6.4): asse disegnato solo per i corpi con orientamento modellato;
// con assi fissi allineati all'eclittica J2000 per convenzione (fornitore senza modello) nessun asse.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CorpoCatalogo } from '../../src/data/catalogTypes';
import { ServizioOrientamento } from '../../src/ephem/orientation';
import { GrafoScena } from '../../src/render/grafo';
import { creaBanco, frame, tempoFittizio } from './utili';

const JD = 2_461_331.5;

/** Asse del corpo dopo un frame con il livello attivo e la camera a 8 raggi, nel piano dell'eclittica. */
function asse(slug: string): { visibile: boolean; z: number[] | null; orientOk: number } {
  const { m, eff } = creaBanco(1280, 800);
  const s = eff.slug(slug);
  m.impostaTempo(tempoFittizio(JD));
  m.livelli.assiRotazione = true;
  m.impostaFuoco(s, 0, { transizione: false, inquadratura: 'corpo' });
  const r = m.registro.corpi[s]!.raggioMax;
  m.impostaPosa([0, -8 * r, 0], [0, 0, 0]);
  frame(m, 0, 1280, 800);
  const grafo = new GrafoScena(m, null);
  grafo.sincronizza(1, null);
  const mesh = grafo.assi[s] ?? null;
  const visibile = mesh !== null && mesh.visible;
  return { visibile, z: visibile ? [m.orient[9 * s + 2]!, m.orient[9 * s + 5]!, m.orient[9 * s + 8]!] : null, orientOk: m.orientOk[s]! };
}

describe('assi di rotazione (RF5, § 7.5.5, § 7.6.4)', () => {
  it.each(['febe', 'imalia', 'iperione', 'notte'])('%s: orientamento non modellato, nessun asse', (slug) => {
    const a = asse(slug);
    expect(a.orientOk).toBe(0);
    expect(a.visibile).toBe(false);
  });

  it.each(['terra', 'cerere', 'titano'])('%s: orientamento modellato, asse lungo il polo del modello', (slug) => {
    const a = asse(slug);
    expect(a.orientOk).toBe(1);
    expect(a.visibile).toBe(true);
    // Polo diverso da quello dell'eclittica J2000.
    expect(Math.abs(a.z![2]!)).toBeLessThan(0.9999);
  });

  it('catalogo pubblicato: il servizio di orientamento nessun asse per i corpi con modello "fisso" senza coefficienti, Febe compresa', () => {
    const cat = JSON.parse(readFileSync(new URL('../../public/data/v1/catalog.json', import.meta.url), 'utf8')) as { corpi: CorpoCatalogo[] };
    const corpi = [...cat.corpi].sort((a, b) => a.ssid - b.ssid);
    const servizio = new ServizioOrientamento(corpi);
    const t = tempoFittizio(JD);
    const out = new Float64Array(9);
    const convenzionali: string[] = [];
    for (const c of corpi) {
      const ok = servizio.orientamento(c.ssid, t, out);
      if (c.orientamento.modello === 'fisso' && c.orientamento.coefficienti === null) {
        expect(ok, c.slug).toBe(false);
        convenzionali.push(c.slug);
      }
      if (c.orientamento.modello === 'wgccre') expect(ok, c.slug).toBe(true);
    }
    expect(convenzionali.length).toBeGreaterThan(50);
    for (const slug of ['febe', 'imalia', 'iperione', 'nereide', 'notte', 'idra', 'disnomia', 'arrokoth']) expect(convenzionali).toContain(slug);
  });
});
