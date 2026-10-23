// Utilità dei test del rendering: motore con i servizi fittizi e passi CPU del frame (§ 5.5).

import { Motore } from '../../src/render/motore';
import { ELEVAZIONE_PREDEFINITA } from '../../src/render/costanti';
import { PRESET_VISTA } from '../../src/ui/scala';
import type { IdPreset } from '../../src/ui/testi.it';
import { EffemeridiFittizie, OrientamentoFittizio, creaCatalogoFittizio, tempoFittizio } from '../../src/dev/servizioFittizio';
import type { CorpoCatalogo } from '../../src/data/catalogTypes';

export interface Banco {
  m: Motore;
  eff: EffemeridiFittizie;
  ori: OrientamentoFittizio;
  catalogo: CorpoCatalogo[];
}

export function creaBanco(larghezza = 1920, altezza = 1080): Banco {
  const catalogo = creaCatalogoFittizio();
  const eff = new EffemeridiFittizie(catalogo);
  const ori = new OrientamentoFittizio(catalogo, eff);
  const m = new Motore({ catalogo, effemeridi: eff, orientamento: ori, aspetto: larghezza / altezza, movimentoRidotto: true });
  m.camera.aspect = larghezza / altezza;
  m.camera.updateProjectionMatrix();
  m.layout.larghezza.fill(60);
  return { m, eff, ori, catalogo };
}

/** Passi CPU di un frame: stati, origine, camera, proiezione, orbite, anelli, etichette. */
export function frame(m: Motore, ora: number, larghezza = 1920, altezza = 1080): void {
  m.aggiornaStati(ora);
  m.camera.lookAt(m.target);
  m.camera.updateMatrixWorld();
  m.aggiornaVista(ora, larghezza, altezza);
  m.aggiornaOrbite();
  m.aggiornaAnelli();
  m.aggiornaEtichette(ora);
}

export { tempoFittizio };

/**
 * Preset di vista dell'interfaccia (§ 11.3) applicato al motore: 30° sul piano del sistema per i sistemi planetari,
 * 30° sull'eclittica per gli altri.
 */
export function applicaPreset(m: Motore, id: IdPreset, ora = 0): void {
  const p = PRESET_VISTA.find((x) => x.id === id)!;
  m.impostaFuoco(m.registro.perSlug.get(p.fuoco)!.ssid, ora, {
    inquadratura: { estensioneKm: p.ampiezzaKm },
    elevazione: ELEVAZIONE_PREDEFINITA,
    vistaSistema: p.vistaSistema === true,
  });
}

/** Generatore pseudocasuale deterministico (mulberry32, T. Ettinger, dominio pubblico). */
export function generatore(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seme registrato dei test del rendering. */
export const SEME_RENDER = 20261021;
