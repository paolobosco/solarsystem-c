// Origine mobile sul corpo a fuoco e transizioni di fuoco (R2, § 5.5 punto 3, § 10.3).
// Tutte le posizioni sono in Float64. L'origine è la posizione eliocentrica del corpo a fuoco:
// la camera la segue senza logica aggiuntiva. setOrigin() trasla camera e bersaglio dello
// stesso delta al cambio di fuoco; la transizione porta poi il bersaglio sul nuovo corpo
// (interpolazione in Float64 tra le posizioni dei due corpi, ricalcolate a ogni frame) e la
// distanza al valore finale (interpolazione logaritmica).

import type { Vector3 } from 'three';

/** Accesso agli stati del frame: stati[6·ssid..] km, ok[ssid] = 1 se lo stato è valido. */
export interface StatiFrame {
  readonly stati: Float64Array;
  readonly ok: Uint8Array;
  /** ssid del primario, -1 per il Sole. */
  primario(ssid: number): number;
}

interface Transizione {
  da: number;
  /** Bersaglio iniziale relativo al corpo di partenza. */
  readonly offDa: Float64Array;
  /** Posizione eliocentrica di partenza, se il corpo di partenza non ha stato. */
  readonly puntoDa: Float64Array;
  t0: number;
  durata: number;
  d0: number;
  d1: number;
  distanzaAttiva: boolean;
  /** Direzione finale facoltativa (versore camera - bersaglio). */
  readonly dirFinale: Float64Array;
  conDirezione: boolean;
  readonly dir0: Float64Array;
}

/** Interpolazione cubica con accelerazione e decelerazione. */
export function andamento(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Distanza interpolata in scala logaritmica. */
export function distanzaLog(d0: number, d1: number, s: number): number {
  return Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * s);
}

/** ssid stesso se ha uno stato valido, altrimenti il primo antenato che lo ha (§ 7.8.2); -1 se nessuno. */
export function corpoConPosizione(ssid: number, f: StatiFrame): number {
  let s = ssid;
  while (s >= 0) {
    if (f.ok[s] === 1) return s;
    s = f.primario(s);
  }
  return -1;
}

export class GestoreFuoco {
  fuoco = 0;
  /** Posizione eliocentrica dell'origine della scena, km. */
  readonly origine = new Float64Array(3);
  /** Vero se il corpo a fuoco non ha uno stato valido e l'origine è su un primario. */
  senzaPosizione = false;
  /** Corpo che fa da origine: il corpo a fuoco o, senza posizione, il primo antenato con stato. */
  riferimento = 0;
  private trans: Transizione | null = null;
  private readonly tmp = new Float64Array(3);
  private readonly tmp2 = new Float64Array(3);

  constructor(
    private readonly camera: { position: Vector3 },
    private readonly target: Vector3,
  ) {}

  get inTransizione(): boolean {
    return this.trans !== null;
  }

  /** Posizione eliocentrica di ssid, o del primo antenato con stato valido; aggiorna il corpo di riferimento. */
  posizione(ssid: number, f: StatiFrame, out: Float64Array): boolean {
    const s = corpoConPosizione(ssid, f);
    this.riferimento = s >= 0 ? s : ssid;
    if (s >= 0) {
      out[0] = f.stati[6 * s]!;
      out[1] = f.stati[6 * s + 1]!;
      out[2] = f.stati[6 * s + 2]!;
      return s === ssid;
    }
    out[0] = this.origine[0]!;
    out[1] = this.origine[1]!;
    out[2] = this.origine[2]!;
    return false;
  }

  /** Trasla camera e bersaglio dello stesso delta e sposta l'origine (R2). */
  setOrigin(nuova: ArrayLike<number>): void {
    const dx = nuova[0]! - this.origine[0]!;
    const dy = nuova[1]! - this.origine[1]!;
    const dz = nuova[2]! - this.origine[2]!;
    this.camera.position.x -= dx;
    this.camera.position.y -= dy;
    this.camera.position.z -= dz;
    this.target.x -= dx;
    this.target.y -= dy;
    this.target.z -= dz;
    this.origine[0] = nuova[0]!;
    this.origine[1] = nuova[1]!;
    this.origine[2] = nuova[2]!;
  }

  /**
   * Cambia il corpo a fuoco. d1: distanza finale dal corpo (null: mantiene quella attuale).
   * dirFinale: versore facoltativo della direzione camera - corpo a fine transizione.
   */
  avvia(
    ssid: number,
    f: StatiFrame | null,
    oraMs: number,
    durataMs: number,
    d1: number | null,
    dirFinale: ArrayLike<number> | null,
  ): void {
    const vecchio = this.fuoco;
    const offDa = new Float64Array([this.target.x, this.target.y, this.target.z]);
    const puntoDa = new Float64Array([
      this.origine[0]! + this.target.x,
      this.origine[1]! + this.target.y,
      this.origine[2]! + this.target.z,
    ]);
    if (f) {
      this.senzaPosizione = !this.posizione(ssid, f, this.tmp);
      this.setOrigin(this.tmp);
    } else this.riferimento = ssid;
    this.fuoco = ssid;
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    const d0 = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 1e-9);
    const dFin = d1 ?? d0;
    if (durataMs <= 0 || !f) {
      this.trans = null;
      const dir = this.tmp2;
      if (dirFinale) {
        dir[0] = dirFinale[0]!;
        dir[1] = dirFinale[1]!;
        dir[2] = dirFinale[2]!;
      } else {
        dir[0] = dx / d0;
        dir[1] = dy / d0;
        dir[2] = dz / d0;
      }
      this.target.set(0, 0, 0);
      this.camera.position.set(dir[0] * dFin, dir[1] * dFin, dir[2] * dFin);
      return;
    }
    this.trans = {
      da: vecchio,
      offDa,
      puntoDa,
      t0: oraMs,
      durata: durataMs,
      d0,
      d1: dFin,
      distanzaAttiva: true,
      dirFinale: new Float64Array(3),
      conDirezione: dirFinale !== null,
      dir0: new Float64Array([dx / d0, dy / d0, dz / d0]),
    };
    if (dirFinale) {
      this.trans.dirFinale[0] = dirFinale[0]!;
      this.trans.dirFinale[1] = dirFinale[1]!;
      this.trans.dirFinale[2] = dirFinale[2]!;
    }
  }

  /** Distanza camera-bersaglio moltiplicata per k, anche agli estremi della transizione in corso. */
  scalaDistanza(k: number): void {
    const t = this.trans;
    if (t) {
      t.d0 *= k;
      t.d1 *= k;
    }
    const p = this.camera.position;
    const b = this.target;
    p.set(b.x + (p.x - b.x) * k, b.y + (p.y - b.y) * k, b.z + (p.z - b.z) * k);
  }

  /** L'utente ha agito sui controlli: la distanza e la direzione non sono più interpolate. */
  interrompiDistanza(): void {
    if (this.trans) {
      this.trans.distanzaAttiva = false;
      this.trans.conDirezione = false;
    }
  }

  /** Conclude subito la transizione. */
  completa(): void {
    if (!this.trans) return;
    const t = this.trans;
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const dist = t.distanzaAttiva ? t.d1 : d;
    let ux = dx / d;
    let uy = dy / d;
    let uz = dz / d;
    if (t.conDirezione) {
      ux = t.dirFinale[0]!;
      uy = t.dirFinale[1]!;
      uz = t.dirFinale[2]!;
    }
    this.target.set(0, 0, 0);
    this.camera.position.set(ux * dist, uy * dist, uz * dist);
    this.trans = null;
  }

  /**
   * Passo 3 del § 5.5: origine sul corpo a fuoco (la camera lo segue) e passo della transizione.
   * Restituisce true se la transizione è ancora in corso.
   */
  aggiorna(oraMs: number, f: StatiFrame): boolean {
    this.senzaPosizione = !this.posizione(this.fuoco, f, this.tmp);
    this.origine[0] = this.tmp[0]!;
    this.origine[1] = this.tmp[1]!;
    this.origine[2] = this.tmp[2]!;
    const t = this.trans;
    if (!t) return false;
    const u = t.durata > 0 ? (oraMs - t.t0) / t.durata : 1;
    if (u >= 1) {
      this.completa();
      return false;
    }
    const s = andamento(u);
    // Punto di partenza ricalcolato con gli stati del frame.
    const p = this.tmp2;
    if (f.ok[t.da] === 1) {
      p[0] = f.stati[6 * t.da]! + t.offDa[0]!;
      p[1] = f.stati[6 * t.da + 1]! + t.offDa[1]!;
      p[2] = f.stati[6 * t.da + 2]! + t.offDa[2]!;
    } else {
      p[0] = t.puntoDa[0]!;
      p[1] = t.puntoDa[1]!;
      p[2] = t.puntoDa[2]!;
    }
    const k = 1 - s;
    const tx = k * (p[0] - this.origine[0]);
    const ty = k * (p[1] - this.origine[1]);
    const tz = k * (p[2] - this.origine[2]);
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    const dAtt = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    let ux = dx / dAtt;
    let uy = dy / dAtt;
    let uz = dz / dAtt;
    if (t.conDirezione) {
      // Interpolazione sferica lineare tra direzione iniziale e finale.
      const c = Math.max(-1, Math.min(1, t.dir0[0]! * t.dirFinale[0]! + t.dir0[1]! * t.dirFinale[1]! + t.dir0[2]! * t.dirFinale[2]!));
      const om = Math.acos(c);
      if (om > 1e-9) {
        const a = Math.sin((1 - s) * om) / Math.sin(om);
        const b = Math.sin(s * om) / Math.sin(om);
        ux = a * t.dir0[0]! + b * t.dirFinale[0]!;
        uy = a * t.dir0[1]! + b * t.dirFinale[1]!;
        uz = a * t.dir0[2]! + b * t.dirFinale[2]!;
      } else {
        ux = t.dirFinale[0]!;
        uy = t.dirFinale[1]!;
        uz = t.dirFinale[2]!;
      }
    }
    const d = t.distanzaAttiva ? distanzaLog(t.d0, t.d1, s) : dAtt;
    this.target.set(tx, ty, tz);
    this.camera.position.set(tx + ux * d, ty + uy * d, tz + uz * d);
    return true;
  }
}
