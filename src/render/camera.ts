// Camera e grandezze di vista (§ 10.3, R14, § 11.3 di docs/PROGETTO.md). La barra di scala è dell'interfaccia (src/ui/scala.ts).

import { PerspectiveCamera } from 'three';
import { AMPIEZZA_MAX_KM, DISTANZA_MIN_SENZA_RAGGIO_KM, FAR_KM, FOV_GRADI, NEAR_KM, QUOTA_MIN_FRAZIONE, QUOTA_MIN_KM } from './costanti';

/** Camera prospettica con asse z verso il polo nord dell'eclittica (camera.up prima dei controlli, § 5.5). */
export function creaCamera(aspetto: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(FOV_GRADI, aspetto, NEAR_KM, FAR_KM);
  camera.up.set(0, 0, 1);
  return camera;
}

/** Distanza minima dal centro: R_max + max(0,01·R_max; 0,5 km) (§ 10.3). */
export function distanzaMinima(raggioMax: number): number {
  if (!(raggioMax > 0)) return DISTANZA_MIN_SENZA_RAGGIO_KM;
  return raggioMax + Math.max(QUOTA_MIN_FRAZIONE * raggioMax, QUOTA_MIN_KM);
}

export function tanMezzoFov(): number {
  return Math.tan((FOV_GRADI * Math.PI) / 360);
}

/** Estensione della vista alla distanza d: lato minore del campo visivo, km. */
export function estensioneDaDistanza(d: number, aspetto: number): number {
  return 2 * d * tanMezzoFov() * Math.min(1, aspetto);
}

export function distanzaDaEstensione(estensione: number, aspetto: number): number {
  return estensione / (2 * tanMezzoFov() * Math.min(1, aspetto));
}

/** Distanza massima della camera dal bersaglio: quella che dà l'ampiezza massima della vista (RF1, § 10.3). */
export function distanzaMassima(aspetto: number): number {
  return distanzaDaEstensione(AMPIEZZA_MAX_KM, aspetto);
}

/** Distanza che inquadra un corpo di raggio r con il disco pari a circa il 40% del lato minore. */
export function distanzaInquadraCorpo(r: number, aspetto: number): number {
  return Math.max(distanzaMinima(r) * 1.05, distanzaDaEstensione(r / 0.2, aspetto));
}

/** Azimut ed elevazione di un vettore (camera - bersaglio) nell'eclittica. */
export function angoliDaVettore(x: number, y: number, z: number): { azimut: number; elevazione: number } {
  const r = Math.sqrt(x * x + y * y + z * z);
  return { azimut: Math.atan2(y, x), elevazione: r > 0 ? Math.asin(Math.max(-1, Math.min(1, z / r))) : 0 };
}

/** Versore da azimut ed elevazione. */
export function versoreDaAngoli(azimut: number, elevazione: number, out: Float64Array): void {
  const ce = Math.cos(elevazione);
  out[0] = ce * Math.cos(azimut);
  out[1] = ce * Math.sin(azimut);
  out[2] = Math.sin(elevazione);
}
