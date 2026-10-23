// Proiezione unica su CPU in Float64 (§ 5.5 punto 6): posizioni in spazio vista, coordinate
// schermo e raggi apparenti per etichette, selezione, occlusione e marcatori.
// Coordinate schermo in pixel CSS rispetto all'angolo in alto a sinistra della canvas.

import type { PerspectiveCamera } from 'three';

export class Proiettore {
  /** Rotazione mondo → vista, 3×3 per righe. */
  readonly rot = new Float64Array(9);
  /** Posizione della camera relativa all'origine della scena, km. */
  readonly cam = new Float64Array(3);
  /** Elementi della matrice di proiezione usati: P00, P11, P20, P21 (colonna-maggiore: 0, 5, 8, 9). */
  p00 = 1;
  p11 = 1;
  p20 = 0;
  p21 = 0;
  larghezza = 1;
  altezza = 1;
  /** Lunghezza focale in pixel CSS lungo y: altezza/2 · P11. */
  focale = 1;

  /** Copia lo stato della camera dopo camera.updateMatrixWorld() e updateProjectionMatrix(). */
  imposta(camera: PerspectiveCamera, larghezza: number, altezza: number): void {
    const vi = camera.matrixWorldInverse.elements;
    const mw = camera.matrixWorld.elements;
    const r = this.rot;
    r[0] = vi[0]!;
    r[1] = vi[4]!;
    r[2] = vi[8]!;
    r[3] = vi[1]!;
    r[4] = vi[5]!;
    r[5] = vi[9]!;
    r[6] = vi[2]!;
    r[7] = vi[6]!;
    r[8] = vi[10]!;
    this.cam[0] = mw[12]!;
    this.cam[1] = mw[13]!;
    this.cam[2] = mw[14]!;
    const p = camera.projectionMatrix.elements;
    this.p00 = p[0]!;
    this.p11 = p[5]!;
    this.p20 = p[8]!;
    this.p21 = p[9]!;
    this.larghezza = larghezza;
    this.altezza = altezza;
    this.focale = 0.5 * altezza * this.p11;
  }

  /** Spazio vista di un punto relativo all'origine: rot·(p - cam). */
  vista(x: number, y: number, z: number, out: Float64Array, off = 0): void {
    const dx = x - this.cam[0]!;
    const dy = y - this.cam[1]!;
    const dz = z - this.cam[2]!;
    const r = this.rot;
    out[off] = r[0]! * dx + r[1]! * dy + r[2]! * dz;
    out[off + 1] = r[3]! * dx + r[4]! * dy + r[5]! * dz;
    out[off + 2] = r[6]! * dx + r[7]! * dy + r[8]! * dz;
  }

  /** Direzione mondo ruotata in spazio vista. */
  ruota(x: number, y: number, z: number, out: Float64Array, off = 0): void {
    const r = this.rot;
    out[off] = r[0]! * x + r[1]! * y + r[2]! * z;
    out[off + 1] = r[3]! * x + r[4]! * y + r[5]! * z;
    out[off + 2] = r[6]! * x + r[7]! * y + r[8]! * z;
  }

  /** Direzione vista riportata nel mondo (trasposta). */
  ruotaInversa(x: number, y: number, z: number, out: Float64Array, off = 0): void {
    const r = this.rot;
    out[off] = r[0]! * x + r[3]! * y + r[6]! * z;
    out[off + 1] = r[1]! * x + r[4]! * y + r[7]! * z;
    out[off + 2] = r[2]! * x + r[5]! * y + r[8]! * z;
  }

  /** Coordinate schermo (px CSS) di un punto in spazio vista; false se dietro la camera. */
  schermo(vx: number, vy: number, vz: number, out: Float64Array, off = 0): boolean {
    const w = -vz;
    const xn = (this.p00 * vx + this.p20 * vz) / w;
    const yn = (this.p11 * vy + this.p21 * vz) / w;
    out[off] = 0.5 * (xn + 1) * this.larghezza;
    out[off + 1] = 0.5 * (1 - yn) * this.altezza;
    return w > 0;
  }

  /** Raggio apparente in px di una sfera di raggio r alla distanza d dal centro; Infinity se d ≤ r. */
  raggioApparente(r: number, d: number): number {
    if (!(r > 0)) return 0;
    if (d <= r) return Number.POSITIVE_INFINITY;
    return (this.focale * r) / Math.sqrt((d - r) * (d + r));
  }

  /**
   * Contorno proiettato di una sfera di raggio r con centro (vx, vy, vz) in spazio vista: il cono tangente con vertice
   * nella camera taglia il piano dell'immagine in un'ellisse, cerchio di raggio raggioApparente solo sull'asse ottico.
   * Con z = -vz profondità e d distanza: semiasse radiale a = f·r·√(d² - r²)/(z² - r²), lungo la direzione del centro
   * dal punto principale; semiasse tangenziale b = f·r/√(z² - r²); centro nella proiezione di (vx·k, vy·k, vz) con
   * k = z²/(z² - r²), spostato verso l'esterno rispetto al centro proiettato. Scrive in out: centro x e y (px CSS), a, b,
   * versore radiale sullo schermo (x, y verso il basso) e k. false se la sfera non è tutta davanti al piano della
   * camera (z ≤ r): contorno illimitato.
   */
  contorno(vx: number, vy: number, vz: number, r: number, out: Float64Array, off = 0): boolean {
    const z = -vz;
    if (!(r > 0) || !(z > r)) return false;
    const q = (z - r) * (z + r);
    const d2 = vx * vx + vy * vy + z * z;
    const k = (z * z) / q;
    this.schermo(vx * k, vy * k, vz, out, off);
    out[off + 2] = (this.focale * r * Math.sqrt(Math.max(0, d2 - r * r))) / q;
    out[off + 3] = (this.focale * r) / Math.sqrt(q);
    const rho = Math.sqrt(vx * vx + vy * vy);
    out[off + 4] = rho > 0 ? vx / rho : 1;
    out[off + 5] = rho > 0 ? -vy / rho : 0;
    out[off + 6] = k;
    return true;
  }

  /** Direzione in spazio vista (non normalizzata) del raggio per il pixel (x, y) CSS. */
  raggioVista(x: number, y: number, out: Float64Array, off = 0): void {
    const xn = (2 * x) / this.larghezza - 1;
    const yn = 1 - (2 * y) / this.altezza;
    out[off] = (xn + this.p20) / this.p00;
    out[off + 1] = (yn + this.p21) / this.p11;
    out[off + 2] = -1;
  }

  /** Chilometri per pixel alla distanza d (R14): 2·d·tan(fov/2)/altezza. */
  kmPerPx(d: number): number {
    return d / this.focale;
  }
}

// Grandezze del contorno scritto da Proiettore.contorno (7 valori a partire da e: centro x e y, a, b, versore radiale,
// k), in px CSS con y verso il basso. Con a infinito (contorno illimitato) valgono infinito.

/** Semiampiezza orizzontale del contorno: √(a²·ux² + b²·uy²). */
export function semiampiezzaX(ct: ArrayLike<number>, e: number): number {
  const a = ct[e + 2]!;
  const b = ct[e + 3]!;
  if (!Number.isFinite(a)) return a;
  return Math.sqrt(a * a * ct[e + 4]! * ct[e + 4]! + b * b * ct[e + 5]! * ct[e + 5]!);
}

/** Semiampiezza verticale del contorno: √(a²·uy² + b²·ux²). */
export function semiampiezzaY(ct: ArrayLike<number>, e: number): number {
  const a = ct[e + 2]!;
  const b = ct[e + 3]!;
  if (!Number.isFinite(a)) return a;
  return Math.sqrt(a * a * ct[e + 5]! * ct[e + 5]! + b * b * ct[e + 4]! * ct[e + 4]!);
}

/** Distanza dal centro al bordo del contorno lungo la direzione unitaria (dx, dy) dello schermo. */
export function bordoContorno(ct: ArrayLike<number>, e: number, dx: number, dy: number): number {
  const a = ct[e + 2]!;
  const b = ct[e + 3]!;
  if (!Number.isFinite(a) || !(a > 0) || !(b > 0)) return a;
  const pu = (dx * ct[e + 4]! + dy * ct[e + 5]!) / a;
  const pw = (-dx * ct[e + 5]! + dy * ct[e + 4]!) / b;
  return 1 / Math.sqrt(pu * pu + pw * pw);
}

/**
 * Corda orizzontale del contorno alla riga y dello schermo: out[0] e out[1] ascisse del bordo a sinistra e a destra.
 * false se la riga non incontra il contorno (o il contorno è illimitato o nullo).
 */
export function cordaContorno(ct: ArrayLike<number>, e: number, y: number, out: Float64Array): boolean {
  const a = ct[e + 2]!;
  const b = ct[e + 3]!;
  if (!Number.isFinite(a) || !(a > 0) || !(b > 0)) return false;
  const ux = ct[e + 4]!;
  const uy = ct[e + 5]!;
  const dy = y - ct[e + 1]!;
  // (dx·ux + dy·uy)²/a² + (-dx·uy + dy·ux)²/b² = 1, equazione di secondo grado in dx.
  const ia = 1 / (a * a);
  const ib = 1 / (b * b);
  const qa = ux * ux * ia + uy * uy * ib;
  const qb = 2 * dy * ux * uy * (ia - ib);
  const qc = dy * dy * (uy * uy * ia + ux * ux * ib) - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (!(disc >= 0)) return false;
  const s = Math.sqrt(disc);
  out[0] = ct[e]! + (-qb - s) / (2 * qa);
  out[1] = ct[e]! + (-qb + s) / (2 * qa);
  return true;
}

/** Intersezione raggio-sfera: distanza minima lungo il raggio unitario dall'origine, o -1. */
export function intersezioneSfera(dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const b = dx * cx + dy * cy + dz * cz;
  const hx = cx - b * dx;
  const hy = cy - b * dy;
  const hz = cz - b * dz;
  const h2 = hx * hx + hy * hy + hz * hz;
  const disc = r * r - h2;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = b - s;
  if (t0 >= 0) return t0;
  return b + s >= 0 ? 0 : -1;
}

/**
 * Intersezione raggio-ellissoide in Float64: raggio dall'origine con direzione d (unitaria) in un
 * sistema qualunque, ellissoide di centro c, assi (colonne di m, 3×3 per righe) e semiassi r.
 * Restituisce la distanza lungo il raggio, oppure -1.
 */
export function intersezioneEllissoide(
  d: ArrayLike<number>,
  c: ArrayLike<number>,
  m: ArrayLike<number>,
  r: ArrayLike<number>,
  offC = 0,
  offM = 0,
): number {
  // Coordinate nel sistema dell'ellissoide scalato: u = diag(1/r)·mᵀ·v.
  const ox = -c[offC]!;
  const oy = -c[offC + 1]!;
  const oz = -c[offC + 2]!;
  const r0 = r[0]!;
  const r1 = r[1]!;
  const r2 = r[2]!;
  const pox = (m[offM]! * ox + m[offM + 3]! * oy + m[offM + 6]! * oz) / r0;
  const poy = (m[offM + 1]! * ox + m[offM + 4]! * oy + m[offM + 7]! * oz) / r1;
  const poz = (m[offM + 2]! * ox + m[offM + 5]! * oy + m[offM + 8]! * oz) / r2;
  const pdx = (m[offM]! * d[0]! + m[offM + 3]! * d[1]! + m[offM + 6]! * d[2]!) / r0;
  const pdy = (m[offM + 1]! * d[0]! + m[offM + 4]! * d[1]! + m[offM + 7]! * d[2]!) / r1;
  const pdz = (m[offM + 2]! * d[0]! + m[offM + 5]! * d[1]! + m[offM + 8]! * d[2]!) / r2;
  const ld = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
  const ux = pdx / ld;
  const uy = pdy / ld;
  const uz = pdz / ld;
  const b = pox * ux + poy * uy + poz * uz;
  const hx = pox - b * ux;
  const hy = poy - b * uy;
  const hz = poz - b * uz;
  const disc = 1 - (hx * hx + hy * hy + hz * hz);
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return -1;
  return t / ld;
}
