// Scale di tempo e stagione di sviluppo (solo ui-lab.html), in attesa di src/time/timescale.ts e
// src/time/seasons.ts. ΔT: parabola del manuale di JPL Horizons prima del 1600 (65,62 + 31,35·u²),
// valori IERS arrotondati dal 1900, estrapolazione 0,00325·(y - 2026,75)² (§ 6.4); incertezza
// con la formula del § 6.5 (Morrison e Stephenson 2004; Huber 2000). Longitudine del Sole:
// Meeus (1998), cap. 25, bassa precisione.

import { J2000 } from '../../ephem/constants';
import type { ScalaTempo, TimeState } from '../../time/types';
import type { IngressoStagione } from '../contrattoScena';

const SECONDI_GIORNO = 86_400;

/** ΔT in secondi, valori IERS arrotondati per anno decimale (1900-2026,75). */
const TABELLA: readonly [number, number][] = [
  [1900, -2.7],
  [1920, 21.2],
  [1950, 29.1],
  [1970, 40.2],
  [1990, 56.9],
  [2000, 63.8],
  [2010, 66.1],
  [2020, 69.4],
  [2026.75, 69.2],
];

function annoDecimale(jd: number): number {
  return 2000 + (jd - J2000) / 365.25;
}

function parabola(y: number): number {
  const u = (y - 1825) / 100;
  return 65.62 + 31.351922682 * u * u - 0.49;
}

export function deltaTFinto(jdUT: number): number {
  const y = annoDecimale(jdUT);
  if (y < 1600) return parabola(y);
  if (y < 1900) {
    const w = (y - 1600) / 300;
    return (1 - w) * parabola(1600) + w * TABELLA[0]![1];
  }
  if (y > 2026.75) return 69.2 + 0.00325 * (y - 2026.75) ** 2;
  for (let i = 0; i < TABELLA.length - 1; i++) {
    const [y0, v0] = TABELLA[i]!;
    const [y1, v1] = TABELLA[i + 1]!;
    if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
  }
  return 69.2;
}

/** σ(ΔT) del § 6.5: max(0,8·u², H_passato, H_futuro), Q = 0,058 ms²/anno, M = 2500 anni. */
export function sigmaDeltaTFinto(jdUT: number): number {
  const y = annoDecimale(jdUT);
  const u = (y - 1825) / 100;
  const h = (n: number) => (365.25 * n * Math.sqrt(((n * 0.058) / 3) * (1 + n / 2500))) / 1000;
  const passato = y < -500 ? h(-500 - y) : 0;
  const futuro = y > 2026.75 ? h(y - 2026.75) : 0;
  return Math.max(0.8 * u * u, passato, futuro);
}

export function makeTimeStateFinto(jd: number, scala: ScalaTempo): TimeState {
  let jdUT = jd;
  if (scala === 'TT') {
    for (let k = 0; k < 3; k++) jdUT = jd - deltaTFinto(jdUT) / SECONDI_GIORNO;
  }
  const deltaT = deltaTFinto(jdUT);
  return {
    jdUT,
    jdTT: scala === 'TT' ? jd : jdUT + deltaT / SECONDI_GIORNO,
    deltaT,
    deltaTSigma: sigmaDeltaTFinto(jdUT),
    scalaIngresso: scala,
  };
}

/** Stagione dalla longitudine geometrica del Sole (equinozio della data, bassa precisione). */
export function stagioneFinta(t: TimeState): IngressoStagione {
  const T = (t.jdTT - J2000) / 36_525;
  const L0 = 280.46646 + 36_000.76983 * T;
  const M = ((357.52911 + 35_999.05029 * T) * Math.PI) / 180;
  const C = 1.9146 * Math.sin(M) + 0.019993 * Math.sin(2 * M);
  const lambda = (((L0 + C) % 360) + 360) % 360;
  const quadrante = Math.floor(lambda / 90) as 0 | 1 | 2 | 3;
  const stagioni = ['primavera', 'estate', 'autunno', 'inverno'] as const;
  return {
    stagione: stagioni[quadrante],
    evento: quadrante % 2 === 0 ? 'equinozio' : 'solstizio',
    giorniDopo: Math.floor((lambda - quadrante * 90) / 0.9856),
  };
}
