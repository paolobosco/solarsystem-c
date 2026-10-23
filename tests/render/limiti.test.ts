// Limite di zoom (RF1, § 10.3) e preset "Oggetti interstellari" (§ 11.3): l'ampiezza massima della vista è
// 2·10⁵ UA con ogni aspetto, quindi il preset e il regolo delle distanze arrivano all'ampiezza dichiarata.

import { describe, expect, it } from 'vitest';
import { UA_KM } from '../../src/ephem/constants';
import { distanzaDaEstensione, distanzaMassima, estensioneDaDistanza } from '../../src/render/camera';
import { AMPIEZZA_MAX_KM } from '../../src/render/costanti';
import { PRESET_VISTA } from '../../src/ui/scala';
import { applicaPreset, creaBanco, frame, tempoFittizio } from './utili';

const ASPETTI: readonly [number, number][] = [
  [1440, 900],
  [1280, 800],
  [800, 800],
  [412, 839],
];

describe('ampiezza massima della vista (RF1, § 10.3)', () => {
  it('2·10⁵ UA, uguale al preset "Oggetti interstellari"', () => {
    expect(AMPIEZZA_MAX_KM / UA_KM).toBe(2e5);
    expect(PRESET_VISTA.find((p) => p.id === 'interstellari')!.ampiezzaKm).toBe(AMPIEZZA_MAX_KM);
  });

  it.each(ASPETTI)('%i×%i: allontanando oltre il limite l\'ampiezza resta 2·10⁵ UA', (w, h) => {
    const { m } = creaBanco(w, h);
    m.impostaTempo(tempoFittizio(2_461_331.5));
    frame(m, 0, w, h);
    m.impostaDistanza(1e30);
    const v = m.statoVista(false);
    expect(v.estensioneKm / AMPIEZZA_MAX_KM).toBeCloseTo(1, 12);
    expect(m.distanzaCamera() / distanzaMassima(w / h)).toBeCloseTo(1, 12);
    // Con lo schermo orizzontale la distanza è 2·10⁵ / (2·tan 22,5°) = 241 421 UA.
    if (w >= h) expect(m.distanzaCamera() / UA_KM).toBeCloseTo(241_421.36, 1);
  });

  it.each(ASPETTI)('%i×%i: preset "Oggetti interstellari" all\'ampiezza dichiarata', (w, h) => {
    const { m } = creaBanco(w, h);
    m.impostaTempo(tempoFittizio(2_461_331.5));
    frame(m, 0, w, h);
    applicaPreset(m, 'interstellari');
    m.fuoco.completa();
    frame(m, 2000, w, h);
    expect(m.statoVista(false).estensioneKm / AMPIEZZA_MAX_KM).toBeCloseTo(1, 9);
    expect(m.distanzaCamera()).toBeLessThanOrEqual(distanzaMassima(w / h) * (1 + 1e-12));
    // Il regolo può chiedere un'ampiezza maggiore: la scena la limita.
    m.impostaDistanza(distanzaDaEstensione(3e5 * UA_KM, w / h));
    expect(estensioneDaDistanza(m.distanzaCamera(), w / h) / AMPIEZZA_MAX_KM).toBeCloseTo(1, 12);
  });
});
