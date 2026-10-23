// Controlli della camera (§ 10.3) e gesti di selezione sulla canvas (§ 11.5.3, § 11.10).
// OrbitControls con camera.up = (0, 0, 1) impostato prima della creazione; bersaglio sull'origine
// (corpo a fuoco) salvo spostamenti; zoomSpeed 5; limiti di distanza aggiornati a ogni frame.

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PerspectiveCamera } from 'three';
import { distanzaMassima } from './camera';
import {
  CLIC_DURATA_MS,
  CLIC_SPOSTAMENTO_MOUSE_PX,
  CLIC_SPOSTAMENTO_TOCCO_PX,
  DOPPIO_TOCCO_MS,
  DOPPIO_TOCCO_PX,
  SMORZAMENTO,
  ZOOM_SPEED,
} from './costanti';

export interface CallbackControlli {
  /** Inizio di un'interazione dell'utente con i controlli. */
  inizio(): void;
  /** La camera è cambiata: serve un frame. */
  cambio(): void;
}

export class ControlliCamera {
  readonly orbit: OrbitControls;
  /** Dentro aggiorna(): il frame è già in corso, l'evento 'change' non chiede altri frame. */
  private inAggiorna = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
    cb: CallbackControlli,
    movimentoRidotto: boolean,
  ) {
    camera.up.set(0, 0, 1);
    this.orbit = new OrbitControls(camera, canvas);
    this.orbit.zoomSpeed = ZOOM_SPEED;
    this.orbit.screenSpacePanning = true;
    this.orbit.maxDistance = distanzaMassima(camera.aspect);
    this.orbit.rotateSpeed = 0.8;
    this.impostaMovimentoRidotto(movimentoRidotto);
    this.orbit.addEventListener('start', () => cb.inizio());
    this.orbit.addEventListener('change', () => {
      if (!this.inAggiorna) cb.cambio();
    });
  }

  impostaMovimentoRidotto(ridotto: boolean): void {
    this.orbit.enableDamping = !ridotto;
    this.orbit.dampingFactor = SMORZAMENTO;
  }

  /**
   * Passo 4 del § 5.5: aggiornamento dei controlli con i limiti di distanza; true se la camera si è mossa.
   * Non conta come moto uno spostamento di camera o bersaglio sotto 1e-9 della distanza (meno di 1e-6 px):
   * al limite di distanza il passaggio per le coordinate sferiche di OrbitControls può dare un raggio di un
   * ulp oltre il limite, che verrebbe riportato al limite a ogni frame senza fine.
   */
  aggiorna(distanzaMin: number, distanzaMax: number): boolean {
    this.orbit.minDistance = distanzaMin;
    this.orbit.maxDistance = distanzaMax;
    const p = this.camera.position;
    const t = this.orbit.target;
    const px = p.x;
    const py = p.y;
    const pz = p.z;
    const tx = t.x;
    const ty = t.y;
    const tz = t.z;
    this.inAggiorna = true;
    let mossa: boolean;
    try {
      mossa = this.orbit.update();
    } finally {
      this.inAggiorna = false;
    }
    if (!mossa) return false;
    const soglia = 1e-9 * Math.max(Math.hypot(px - tx, py - ty, pz - tz), distanzaMin);
    return Math.hypot(p.x - px, p.y - py, p.z - pz) > soglia || Math.hypot(t.x - tx, t.y - ty, t.z - tz) > soglia;
  }

  /** Rotazione attorno al bersaglio di dAzimut e dElevazione (rad), con up = z. */
  ruota(dAz: number, dEl: number): void {
    const t = this.orbit.target;
    const p = this.camera.position;
    const x = p.x - t.x;
    const y = p.y - t.y;
    const z = p.z - t.z;
    const r = Math.sqrt(x * x + y * y + z * z);
    if (!(r > 0)) return;
    const az = Math.atan2(y, x) + dAz;
    const lim = (89.9 * Math.PI) / 180;
    const el = Math.max(-lim, Math.min(lim, Math.asin(Math.max(-1, Math.min(1, z / r))) + dEl));
    p.set(t.x + r * Math.cos(el) * Math.cos(az), t.y + r * Math.cos(el) * Math.sin(az), t.z + r * Math.sin(el));
    this.camera.lookAt(t);
  }

  /** Spostamento del bersaglio e della camera nel piano dello schermo. */
  sposta(dxPx: number, dyPx: number, kmPerPx: number): void {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    const kx = -dxPx * kmPerPx;
    const ky = dyPx * kmPerPx;
    const dx = e[0] * kx + e[4] * ky;
    const dy = e[1] * kx + e[5] * ky;
    const dz = e[2] * kx + e[6] * ky;
    this.orbit.target.x += dx;
    this.orbit.target.y += dy;
    this.orbit.target.z += dz;
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.camera.position.z += dz;
  }

  dispose(): void {
    this.orbit.dispose();
  }
}

export interface CallbackGesti {
  /** Clic o tocco valido: selezione al rilascio. */
  clic(x: number, y: number, tipo: string, etichetta: number | null, contatore: number | null): void;
  doppioTocco(x: number, y: number): void;
  passaggio(x: number, y: number, tipo: string): void;
  uscita(): void;
}

interface Pressione {
  id: number;
  x: number;
  y: number;
  t: number;
  tipo: string;
  mosso: boolean;
}

/**
 * Gesti della canvas: clic valido con spostamento inferiore a 5 px (mouse) o 8 px (tocco) e durata
 * inferiore a 500 ms; doppio tocco; passaggio del mouse. Un trascinamento o uno scatto della rotella
 * iniziato su un'etichetta è inoltrato alla canvas (§ 11.5.3, § 10.3).
 */
export class GestoreGesti {
  private pressione: Pressione | null = null;
  private etichettaPremuta: number | null = null;
  private contatorePremuto: number | null = null;
  private ultimoTocco = { t: Number.NEGATIVE_INFINITY, x: 0, y: 0 };
  private readonly rimuovi: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    etichette: HTMLElement,
    private readonly cb: CallbackGesti,
    private readonly orologio: () => number,
  ) {
    const su = (el: EventTarget, tipo: string, f: (e: Event) => void, opz?: AddEventListenerOptions): void => {
      el.addEventListener(tipo, f, opz);
      this.rimuovi.push(() => el.removeEventListener(tipo, f, opz));
    };
    su(canvas, 'pointerdown', (e) => this.giu(e as PointerEvent));
    su(canvas, 'pointermove', (e) => this.muovi(e as PointerEvent));
    su(canvas, 'pointerup', (e) => this.su(e as PointerEvent));
    su(canvas, 'pointercancel', () => this.annulla());
    su(canvas, 'pointerleave', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse' && !this.pressione) this.cb.uscita();
    });
    su(etichette, 'pointerdown', (e) => this.giuEtichetta(e as PointerEvent));
    su(etichette, 'pointerup', (e) => this.su(e as PointerEvent));
    // Zoom con la rotella anche sopra le etichette (pointer-events: auto): OrbitControls ascolta solo la canvas.
    su(etichette, 'wheel', (e) => this.rotella(e as WheelEvent), { passive: false });
  }

  private rotella(e: WheelEvent): void {
    e.preventDefault();
    this.canvas.dispatchEvent(new WheelEvent('wheel', e));
  }

  private coordinate(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private giu(e: PointerEvent): void {
    const { x, y } = this.coordinate(e);
    this.pressione = { id: e.pointerId, x, y, t: this.orologio(), tipo: e.pointerType, mosso: false };
  }

  private giuEtichetta(e: PointerEvent): void {
    const el = (e.target as HTMLElement | null)?.closest?.('.ss-etichetta') as HTMLElement | null;
    const ssid = el?.dataset['ssid'];
    if (ssid === undefined) return;
    const cont = (e.target as HTMLElement | null)?.closest?.('.ss-contatore') as HTMLElement | null;
    e.preventDefault();
    // Inoltro alla canvas: OrbitControls cattura il puntatore e gestisce il trascinamento.
    this.canvas.dispatchEvent(new PointerEvent('pointerdown', e));
    this.etichettaPremuta = Number(ssid);
    this.contatorePremuto = cont ? Number(cont.dataset['sistema']) : null;
  }

  private muovi(e: PointerEvent): void {
    const p = this.pressione;
    if (p && p.id === e.pointerId) {
      const { x, y } = this.coordinate(e);
      const soglia = p.tipo === 'touch' ? CLIC_SPOSTAMENTO_TOCCO_PX : CLIC_SPOSTAMENTO_MOUSE_PX;
      if (Math.hypot(x - p.x, y - p.y) >= soglia) p.mosso = true;
      return;
    }
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      const { x, y } = this.coordinate(e);
      this.cb.passaggio(x, y, e.pointerType);
    }
  }

  private su(e: PointerEvent): void {
    const p = this.pressione;
    if (!p || p.id !== e.pointerId) return;
    this.pressione = null;
    const etichetta = this.etichettaPremuta;
    const contatore = this.contatorePremuto;
    this.etichettaPremuta = null;
    this.contatorePremuto = null;
    const ora = this.orologio();
    const { x, y } = this.coordinate(e);
    const soglia = p.tipo === 'touch' ? CLIC_SPOSTAMENTO_TOCCO_PX : CLIC_SPOSTAMENTO_MOUSE_PX;
    if (p.mosso || Math.hypot(x - p.x, y - p.y) >= soglia || ora - p.t >= CLIC_DURATA_MS) return;
    if (p.tipo === 'touch') {
      const u = this.ultimoTocco;
      if (ora - u.t <= DOPPIO_TOCCO_MS && Math.hypot(x - u.x, y - u.y) <= DOPPIO_TOCCO_PX) {
        this.ultimoTocco = { t: Number.NEGATIVE_INFINITY, x: 0, y: 0 };
        this.cb.doppioTocco(x, y);
        return;
      }
      this.ultimoTocco = { t: ora, x, y };
    }
    this.cb.clic(p.x, p.y, p.tipo, etichetta, contatore);
  }

  private annulla(): void {
    this.pressione = null;
    this.etichettaPremuta = null;
    this.contatorePremuto = null;
  }

  dispose(): void {
    for (const r of this.rimuovi) r();
  }
}
