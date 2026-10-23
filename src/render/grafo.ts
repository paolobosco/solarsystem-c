// Grafo di scena three.js e sincronizzazione per frame (§ 5.5 punto 5) dai dati del motore.
// Nessun fattore di scala nel grafo (A10): impostori e anelli ricevono in spazio vista centro e
// assi calcolati su CPU; le linee hanno vertici in km relativi all'ancora. Tutti gli oggetti con
// attributi riscritti a ogni frame hanno frustumCulled = false. Costruibile anche in Node (atlante null).

import { Mesh, PerspectiveCamera, Scene, Vector2 } from 'three';
import type { BoxGeometry, ShaderMaterial, Texture } from 'three';
import type { CategoriaCorpo } from '../data/catalogTypes';
import {
  ALONE_SOLE_MAX_PX,
  COLORE_ANELLI_DISTANZA,
  COLORE_ASSI,
  COLORE_CATEGORIA,
  COLORE_GRIGLIA,
  COLORE_SELEZIONE,
  DIMENSIONE_MARCATORE,
  FAR_KM,
  FOV_GRADI,
  LARGHEZZA_ORBITA_PX,
  LARGHEZZA_ORBITA_SELEZIONATA_PX,
  MARGINE_ANELLO_SELEZIONE_PX,
  MARGINE_ARCO_INCERTEZZA_PX,
  OPACITA_ORBITA,
  STELLE_RICALCOLO_ANNI,
} from './costanti';
import { rgbDaHex, srgbALineare } from './glsl';
import { aggiornaUniformiGriglia, creaGriglia } from './grid';
import type { UniformiGriglia } from './grid';
import { aggiornaUniformiImpostore, creaAloneSole, creaGeometriaImpostore, creaMaterialeImpostore, creaMeshImpostore } from './impostor';
import type { MaterialeImpostore, UniformiAlone } from './impostor';
import { GeometriaLinea, creaMaterialeLinea } from './linee';
import type { UniformiLinea } from './linee';
import { CELLA_ANELLO, Marcatori, cellaMarcatore } from './markers';
import { LIV_INDICATIVA } from './motore';
import type { Motore } from './motore';
import { CAPACITA_ORBITA } from './orbits';
import {
  FASCE_SATURNO,
  PUNTI_ANELLO_URANO,
  RAGGI_URANO,
  SATURNO_R_ESTERNO,
  SATURNO_R_INTERNO,
  aggiornaTrasmissioneAnello,
  aggiornaUniformiAnelli,
  creaMeshAnelliSaturno,
  creaProfiloSaturno,
  creaUniformiTrasmissioneAnello,
  profiloDaCatalogo,
  raggiStrettiDaCatalogo,
  verticiAnelloUrano,
} from './rings';
import type { UniformiAnelli, UniformiTrasmissioneAnello } from './rings';
import { CieloStelle } from './stars';

type MeshLinea = Mesh<GeometriaLinea, ShaderMaterial & { uniforms: UniformiLinea }>;

const COLORE_RGB = Object.fromEntries(
  (Object.keys(COLORE_CATEGORIA) as CategoriaCorpo[]).map((c) => [c, rgbDaHex(COLORE_CATEGORIA[c])]),
) as Record<CategoriaCorpo, number[]>;
const SELEZIONE_RGB = rgbDaHex(COLORE_SELEZIONE);
/** Colore del Sole emissivo (sRGB lineare). */
const COLORE_SOLE_LINEARE = rgbDaHex('#FFF3DC').map(srgbALineare);
/** Albedo neutra dei corpi senza texture (sRGB lineare). */
const ALBEDO_NEUTRA = [0.42, 0.42, 0.42];

export class GrafoScena {
  readonly scena = new Scene();
  readonly scenaStelle = new Scene();
  readonly cameraStelle = new PerspectiveCamera(FOV_GRADI, 1, 0.1, 10);
  /** Pixel del buffer di disegno, condivisi dagli shader in spazio schermo. */
  readonly risoluzione = new Vector2(1, 1);
  readonly geometriaImpostore: BoxGeometry;
  readonly impostori: (Mesh<BoxGeometry, MaterialeImpostore> | null)[];
  readonly orbite: (MeshLinea | null)[];
  private readonly versioniOrbite: Int32Array;
  readonly anelliDistanza: MeshLinea[];
  private readonly versioniAnelli: Int32Array;
  readonly assi: (MeshLinea | null)[];
  readonly anelliSaturno: Mesh<import('three').PlaneGeometry, ShaderMaterial & { uniforms: UniformiAnelli }> | null;
  readonly anelliUrano: MeshLinea[];
  private orientUrano = new Float64Array(9).fill(Number.NaN);
  /** Raggio esterno disegnato degli anelli di Saturno e raggi degli anelli stretti di Urano (km). */
  private readonly rEsternoSaturno: number;
  private readonly raggiUrano: readonly number[];
  readonly alone: Mesh<import('three').PlaneGeometry, ShaderMaterial & { uniforms: UniformiAlone }>;
  readonly marcatori: Marcatori;
  readonly griglia: Mesh<import('three').BufferGeometry, ShaderMaterial & { uniforms: UniformiGriglia }>;
  readonly cielo = new CieloStelle();
  readonly texture = new Map<number, Texture>();
  private readonly saturno: number;
  private readonly urano: number;
  private readonly tmp = new Float64Array(3);
  private readonly verticiTmp = new Float32Array(3 * (PUNTI_ANELLO_URANO + 1));
  private readonly coloreTmp = [0, 0, 0];
  /** Trasmissione dell'anello di Saturno per le linee che gli passano dietro (uniformi condivise). */
  readonly trasmissioneAnello: UniformiTrasmissioneAnello = creaUniformiTrasmissioneAnello();

  constructor(private readonly m: Motore, atlante: Texture | null) {
    const corpi = m.registro.corpi;
    this.geometriaImpostore = creaGeometriaImpostore();
    this.impostori = corpi.map((c) => {
      if (!c.raggi) return null;
      const mat = creaMaterialeImpostore(c.raggi, c.categoria === 'sole');
      if (c.categoria === 'sole') mat.uniforms.uColore.value.set(COLORE_SOLE_LINEARE[0]!, COLORE_SOLE_LINEARE[1]!, COLORE_SOLE_LINEARE[2]!);
      else mat.uniforms.uColore.value.set(ALBEDO_NEUTRA[0]!, ALBEDO_NEUTRA[1]!, ALBEDO_NEUTRA[2]!);
      const mesh = creaMeshImpostore(this.geometriaImpostore, mat) as Mesh<BoxGeometry, MaterialeImpostore>;
      mesh.name = `impostore-${c.slug}`;
      this.scena.add(mesh);
      return mesh;
    });
    this.orbite = corpi.map(() => null);
    this.versioniOrbite = new Int32Array(corpi.length).fill(-1);
    this.assi = corpi.map(() => null);
    this.anelliDistanza = m.anelli.map((a) => {
      const mesh = this.creaLinea(a.vertici.length / 3, COLORE_ANELLI_DISTANZA, 1, 1);
      mesh.name = `anello-${Math.round(a.raggio)}`;
      mesh.renderOrder = 6;
      return mesh;
    });
    this.versioniAnelli = new Int32Array(m.anelli.length).fill(-1);
    this.saturno = m.registro.perSlug.get('saturno')?.ssid ?? -1;
    this.urano = m.registro.perSlug.get('urano')?.ssid ?? -1;
    // Anelli dal catalogo (tabelle PDS); valori del modulo solo per cataloghi senza il campo anelli.
    const anS = this.saturno >= 0 ? corpi[this.saturno]!.anelli : null;
    const profilo = anS ? profiloDaCatalogo(anS) : null;
    const rInS = profilo?.rInterno ?? SATURNO_R_INTERNO;
    this.rEsternoSaturno = profilo?.rEsterno ?? SATURNO_R_ESTERNO;
    this.anelliSaturno =
      this.saturno >= 0
        ? creaMeshAnelliSaturno(creaProfiloSaturno(profilo?.fasce ?? FASCE_SATURNO, rInS, this.rEsternoSaturno), rInS, this.rEsternoSaturno)
        : null;
    if (this.anelliSaturno) this.scena.add(this.anelliSaturno);
    const anU = this.urano >= 0 ? corpi[this.urano]!.anelli : null;
    const strettiU = anU ? raggiStrettiDaCatalogo(anU) : [];
    this.raggiUrano = strettiU.length > 0 ? strettiU : RAGGI_URANO;
    this.anelliUrano =
      this.urano >= 0 ? this.raggiUrano.map(() => this.creaLinea(PUNTI_ANELLO_URANO + 1, '#9AA3A8', 0.75, 1)) : [];
    this.alone = creaAloneSole(this.risoluzione, rgbDaHex(COLORE_CATEGORIA.sole));
    this.scena.add(this.alone);
    this.griglia = creaGriglia(rgbDaHex(COLORE_GRIGLIA));
    this.scena.add(this.griglia);
    this.marcatori = new Marcatori(corpi.length + 8, atlante, this.risoluzione);
    this.scena.add(this.marcatori.mesh);
    this.scenaStelle.add(this.cielo.punti);
    this.scenaStelle.add(this.cielo.eclitticaData);
    this.cameraStelle.matrixAutoUpdate = true;
  }

  private creaLinea(capacita: number, colore: string, opacita: number, larghezza: number): MeshLinea {
    const g = new GeometriaLinea(capacita);
    const mat = creaMaterialeLinea(this.risoluzione, this.trasmissioneAnello);
    const rgb = rgbDaHex(colore);
    mat.uniforms.uColore.value.set(rgb[0]!, rgb[1]!, rgb[2]!);
    mat.uniforms.uColoreArco.value.set(rgb[0]!, rgb[1]!, rgb[2]!);
    mat.uniforms.uOpacita.value = opacita;
    mat.uniforms.uLarghezza.value = larghezza;
    const mesh = new Mesh(g, mat) as MeshLinea;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.renderOrder = 20;
    this.scena.add(mesh);
    return mesh;
  }

  /** Imposta la texture di un corpo (lon0_u e verso dal catalogo). */
  impostaTexture(ssid: number, tex: Texture, lon0u: number, verso: 'est' | 'ovest'): void {
    const mesh = this.impostori[ssid];
    if (!mesh) return;
    this.texture.set(ssid, tex);
    const u = mesh.material.uniforms;
    u.uTexture.value = tex;
    u.uHaTexture.value = 1;
    u.uLon0.value = lon0u;
    u.uVerso.value = verso === 'est' ? 1 : -1;
  }

  /** Passo 5 del § 5.5: uniformi e attributi del frame. */
  sincronizza(pixelRatio: number, jdTT: number | null): void {
    const m = this.m;
    const corpi = m.registro.corpi;
    const rot = m.proiettore.rot;
    const pr = m.proiettore;
    const sole = m.registro.sole;
    // Impostori (R5).
    for (let i = 0; i < corpi.length; i++) {
      const mesh = this.impostori[i];
      if (!mesh) continue;
      const vis = m.discoVisibile[i] === 1;
      mesh.visible = vis;
      if (!vis) continue;
      let lx = -m.stati[6 * i]!;
      let ly = -m.stati[6 * i + 1]!;
      let lz = -m.stati[6 * i + 2]!;
      const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      lx /= l;
      ly /= l;
      lz /= l;
      pr.ruota(lx, ly, lz, this.tmp, 0);
      aggiornaUniformiImpostore(mesh.material.uniforms, m.vista, 3 * i, rot, m.orient, 9 * i, corpi[i]!.raggi!, this.tmp[0]!, this.tmp[1]!, this.tmp[2]!);
    }
    // Alone del Sole.
    const ua = this.alone.material.uniforms;
    const rSole = m.raggioPx[sole]!;
    const visAlone = m.visibile[sole] === 1 && m.davanti[sole] === 1 && m.nelCampo[sole] === 1 && rSole < 4000;
    this.alone.visible = visAlone;
    if (visAlone) {
      const alone = Math.min(ALONE_SOLE_MAX_PX, 10 + 0.4 * rSole);
      ua.uCentro.value.set(m.vista[3 * sole]!, m.vista[3 * sole + 1]!, m.vista[3 * sole + 2]!);
      ua.uRaggioPx.value = rSole;
      ua.uAlonePx.value = alone;
      ua.uLatoPx.value = rSole + alone;
      ua.uPixelRatio.value = pixelRatio;
      ua.uW.value = Math.max(0, -m.vista[3 * sole + 2]!);
    }
    this.sincronizzaAnelli(pixelRatio);
    this.sincronizzaOrbite();
    this.sincronizzaAnelliDistanza();
    this.sincronizzaAssi();
    // Griglia (R11).
    this.griglia.visible = m.livelli.grigliaEclittica;
    if (this.griglia.visible) {
      const o = m.fuoco.origine;
      this.tmp[0] = o[0]! + pr.cam[0]!;
      this.tmp[1] = o[1]! + pr.cam[1]!;
      this.tmp[2] = o[2]! + pr.cam[2]!;
      aggiornaUniformiGriglia(this.griglia.material.uniforms, this.tmp, rot, pr.p00, pr.p11, pr.p20, pr.p21);
    }
    this.sincronizzaMarcatori(pixelRatio);
    // Stelle (R8): camera di sola rotazione.
    const stelleVisibili = m.livelli.stelle && this.cielo.caricate;
    this.cielo.punti.visible = stelleVisibili;
    this.cielo.eclitticaData.visible = m.livelli.eclitticaData;
    this.cameraStelle.quaternion.copy(m.camera.quaternion);
    this.cameraStelle.fov = m.camera.fov;
    this.cameraStelle.aspect = m.camera.aspect;
    this.cameraStelle.updateProjectionMatrix();
    this.cameraStelle.updateMatrixWorld();
    this.cielo.impostaPixelRatio(pixelRatio);
    if (jdTT !== null) this.cielo.aggiorna(jdTT, STELLE_RICALCOLO_ANNI);
  }

  private sincronizzaAnelli(pixelRatio: number): void {
    const m = this.m;
    void pixelRatio;
    const s = this.saturno;
    if (this.anelliSaturno && s >= 0) {
      const c = m.registro.corpi[s]!;
      const rPx = m.dist[s]! > 0 ? (this.rEsternoSaturno / m.dist[s]!) * m.proiettore.focale : 0;
      const vis = m.livelli.anelliPlanetari && m.visibile[s] === 1 && m.davanti[s] === 1 && rPx >= 1.5 && c.raggi !== null;
      this.anelliSaturno.visible = vis;
      if (vis) {
        const sl = m.stati;
        let lx = -sl[6 * s]!;
        let ly = -sl[6 * s + 1]!;
        let lz = -sl[6 * s + 2]!;
        const l = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
        lx /= l;
        ly /= l;
        lz /= l;
        aggiornaUniformiAnelli(this.anelliSaturno.material.uniforms, m.vista, 3 * s, m.proiettore.rot, m.orient, 9 * s, c.raggi, lx, ly, lz);
      }
      aggiornaTrasmissioneAnello(this.trasmissioneAnello, this.anelliSaturno.material.uniforms, vis);
    }
    const u = this.urano;
    if (u >= 0 && this.anelliUrano.length > 0) {
      const rPx = m.dist[u]! > 0 ? (this.raggiUrano[this.raggiUrano.length - 1]! / m.dist[u]!) * m.proiettore.focale : 0;
      const vis = m.livelli.anelliPlanetari && m.visibile[u] === 1 && m.davanti[u] === 1 && rPx >= 3;
      let cambiato = false;
      for (let k = 0; k < 9; k++) if (Math.abs(this.orientUrano[k]! - m.orient[9 * u + k]!) > 1e-7 || Number.isNaN(this.orientUrano[k]!)) cambiato = true;
      for (let k = 0; k < this.anelliUrano.length; k++) {
        const mesh = this.anelliUrano[k]!;
        mesh.visible = vis;
        if (!vis) continue;
        if (cambiato) {
          const nv = verticiAnelloUrano(this.raggiUrano[k]!, m.orient, 9 * u, this.verticiTmp);
          mesh.geometry.imposta(this.verticiTmp, nv, null, null);
        }
        mesh.position.set(m.rel[3 * u]!, m.rel[3 * u + 1]!, m.rel[3 * u + 2]!);
        mesh.updateMatrix();
      }
      if (vis && cambiato) for (let k = 0; k < 9; k++) this.orientUrano[k] = m.orient[9 * u + k]!;
    }
  }

  private sincronizzaOrbite(): void {
    const m = this.m;
    const corpi = m.registro.corpi;
    for (let i = 0; i < corpi.length; i++) {
      const attiva = m.orbitaAttiva[i] === 1 && m.orbite[i]!.valida;
      let mesh = this.orbite[i] ?? null;
      if (!attiva) {
        if (mesh) mesh.visible = false;
        continue;
      }
      if (!mesh) {
        mesh = this.creaLinea(CAPACITA_ORBITA, COLORE_CATEGORIA[corpi[i]!.categoria], OPACITA_ORBITA, LARGHEZZA_ORBITA_PX);
        mesh.name = `orbita-${corpi[i]!.slug}`;
        this.orbite[i] = mesh;
      }
      const orb = m.orbite[i]!;
      if (this.versioniOrbite[i] !== m.orbitaGeometria[i]) {
        mesh.geometry.imposta(orb.vertici, orb.n, orb.param, orb.dnu);
        this.versioniOrbite[i] = m.orbitaGeometria[i]!;
      }
      mesh.position.set(m.orbitaPos[3 * i]!, m.orbitaPos[3 * i + 1]!, m.orbitaPos[3 * i + 2]!);
      mesh.updateMatrix();
      mesh.visible = true;
      const u = mesh.material.uniforms;
      const forte = i === m.selezione || m.orbitaEvidenziata[i] === 1;
      const larghezza = forte ? LARGHEZZA_ORBITA_SELEZIONATA_PX : LARGHEZZA_ORBITA_PX;
      u.uOpacita.value = forte ? 1 : OPACITA_ORBITA;
      u.uLarghezza.value = larghezza;
      u.uTratteggio.value = m.orbitaTratteggiata[i]!;
      // Arco d'incertezza ±ε lungo l'orbita per il livello "indicativa" (§ 7.8.2): continuo e più largo dell'orbita.
      u.uEps.value = m.livello[i] === LIV_INDICATIVA && m.ok[i] === 1 && orb.conCorpo ? Math.min(Math.PI, m.eps[i]!) : -1;
      u.uLarghezzaArco.value = larghezza + MARGINE_ARCO_INCERTEZZA_PX;
    }
  }

  private sincronizzaAnelliDistanza(): void {
    const m = this.m;
    for (let k = 0; k < m.anelli.length; k++) {
      const a = m.anelli[k]!;
      const mesh = this.anelliDistanza[k]!;
      mesh.visible = a.visibile;
      if (!a.visibile) continue;
      if (this.versioniAnelli[k] !== a.versione) {
        mesh.geometry.imposta(a.vertici, a.n, a.param, null);
        this.versioniAnelli[k] = a.versione;
      }
      mesh.position.set(a.pos[0]!, a.pos[1]!, a.pos[2]!);
      mesh.updateMatrix();
    }
  }

  private readonly verticiAsse = new Float32Array(6);

  private sincronizzaAssi(): void {
    const m = this.m;
    const corpi = m.registro.corpi;
    for (let i = 0; i < corpi.length; i++) {
      const c = corpi[i]!;
      // Solo orientamenti modellati: senza modello (assi fissi allineati all'eclittica J2000 per convenzione, § 7.5.5,
      // § 7.6.4) il fornitore restituisce false e l'asse non è disegnato.
      const vis = m.livelli.assiRotazione && c.raggi !== null && m.orientOk[i] === 1 && m.discoVisibile[i] === 1 && m.raggioPx[i]! >= 3;
      let mesh = this.assi[i] ?? null;
      if (!vis) {
        if (mesh) mesh.visible = false;
        continue;
      }
      if (!mesh) {
        mesh = this.creaLinea(2, COLORE_ASSI, 0.9, 1.5);
        mesh.name = `asse-${c.slug}`;
        this.assi[i] = mesh;
      }
      const l = 1.6 * c.raggi[2]!;
      const zx = m.orient[9 * i + 2]!;
      const zy = m.orient[9 * i + 5]!;
      const zz = m.orient[9 * i + 8]!;
      const v = this.verticiAsse;
      v[0] = -zx * l;
      v[1] = -zy * l;
      v[2] = -zz * l;
      v[3] = zx * l;
      v[4] = zy * l;
      v[5] = zz * l;
      mesh.geometry.imposta(v, 2, null, null);
      mesh.position.set(m.rel[3 * i]!, m.rel[3 * i + 1]!, m.rel[3 * i + 2]!);
      mesh.updateMatrix();
      mesh.visible = true;
    }
  }

  private sincronizzaMarcatori(pixelRatio: number): void {
    const m = this.m;
    const mk = this.marcatori;
    const corpi = m.registro.corpi;
    mk.inizia();
    // Ordine inverso di priorità: i corpi importanti sono disegnati per ultimi, sopra gli altri.
    const ord = m.registro.ordineStatico;
    for (let k = ord.length - 1; k >= 0; k--) {
      const i = ord[k]!;
      const op = m.opacitaMarcatore[i]!;
      if (!(op > 0)) continue;
      const c = corpi[i]!;
      const rotazione = c.categoria === 'cometa' ? m.rotazioneCoda[i]! : 0;
      const cella = cellaMarcatore(c.categoria, m.livello[i] === LIV_INDICATIVA);
      mk.aggiungi(m.vista[3 * i]!, m.vista[3 * i + 1]!, m.vista[3 * i + 2]!, cella, 32, rotazione, op, COLORE_RGB[c.categoria]);
    }
    const s = m.selezione;
    // Posizione non determinabile: nessun marcatore, nemmeno l'anello di selezione (§ 7.8.2).
    if (m.selezioneConAnello()) {
      const c = corpi[s]!;
      this.coloreTmp[0] = SELEZIONE_RGB[0]!;
      this.coloreTmp[1] = SELEZIONE_RGB[1]!;
      this.coloreTmp[2] = SELEZIONE_RGB[2]!;
      const rMarcatore = DIMENSIONE_MARCATORE[c.categoria] / 2;
      const vx = m.vista[3 * s]!;
      const vy = m.vista[3 * s + 1]!;
      const vz = m.vista[3 * s + 2]!;
      if (!(m.raggioPx[s]! > rMarcatore)) {
        // Attorno al marcatore.
        mk.aggiungi(vx, vy, vz, CELLA_ANELLO, 2 * (rMarcatore + MARGINE_ANELLO_SELEZIONE_PX + 2), 0, 1, this.coloreTmp);
      } else {
        // Attorno al contorno proiettato del disco: ellisse con il semiasse maggiore lungo la direzione radiale e il
        // centro nella proiezione di (vx·k, vy·k, vz), fuori dall'asse ottico spostato rispetto al centro del corpo.
        const e = 7 * s;
        const a = m.contorno[e + 2]! + MARGINE_ANELLO_SELEZIONE_PX;
        const b = m.contorno[e + 3]! + MARGINE_ANELLO_SELEZIONE_PX;
        if (a < 3000) {
          const k = m.contorno[e + 6]!;
          const rotazione = Math.atan2(-m.contorno[e + 5]!, m.contorno[e + 4]!);
          mk.aggiungi(vx * k, vy * k, vz, CELLA_ANELLO, 2 * (a + 2), rotazione, 1, this.coloreTmp, b / a);
        }
      }
    }
    mk.concludi(pixelRatio);
  }

  /** Aggiorna la risoluzione del buffer di disegno e le camere. */
  ridimensiona(larghezzaPx: number, altezzaPx: number): void {
    this.risoluzione.set(larghezzaPx, altezzaPx);
  }

  /** Libera le risorse GPU. */
  dispose(): void {
    this.scena.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as ShaderMaterial | undefined;
      if (mat && typeof mat.dispose === 'function') mat.dispose();
    });
    this.scenaStelle.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const t of this.texture.values()) t.dispose();
  }

  /** Far della camera principale, per i test. */
  static readonly FAR = FAR_KM;
}
