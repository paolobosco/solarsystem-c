// Pagina di prova del rendering (render-lab.html), solo per lo sviluppo: servizi fittizi,
// pannello di controllo e ganci window.__lab per i test end-to-end.

import { creaScena, LIVELLI_PREDEFINITI } from '../render/api';
import type { LivelliVisivi, OpzioniFuoco, ScenaApi, StatoVista } from '../render/api';
import { ELEVAZIONE_PREDEFINITA } from '../render/costanti';
import { PRESET_VISTA } from '../ui/scala';
import type { IdPreset } from '../ui/testi';
import type { Livello } from '../ephem/types';
import type { Motore } from '../render/motore';
import { J2000 } from '../ephem/constants';
import { StelleFittizie, TextureFittizie } from './fornitoriFittizi';
import { EffemeridiFittizie, OrientamentoFittizio, creaCatalogoFittizio, tempoFittizio } from './servizioFittizio';

interface Lab {
  scena: ScenaApi;
  ssid(slug: string): number;
  impostaJd(jdUT: number): void;
  jd(): number;
  riproduci(giorniPerSecondo: number): void;
  fuoco(slug: string, opz?: OpzioniFuoco): void;
  /** Preset di vista dell'interfaccia (§ 11.3), con l'elevazione di 30°. */
  preset(id: IdPreset): void;
  seleziona(slug: string | null): void;
  livelli(l: Partial<LivelliVisivi>): void;
  livelloForzato(slug: string, l: Livello | null): void;
  rotazioniFisse(v: boolean): void;
  posa(posizione: number[], bersaglio: number[]): void;
  escludi(slugs: string[]): void;
  attendiQuiete(timeoutMs?: number): Promise<void>;
  pixel(x: number, y: number, w: number, h: number): { larghezza: number; altezza: number; pixelRatio: number; dati: number[] };
  posizione(slug: string): { x: number; y: number; visibile: boolean } | null;
  vista(): StatoVista;
  perdiContesto(): boolean;
  ripristinaContesto(): boolean;
  selezioni: { ssid: number | null; indice: number; totale: number; origine: string }[];
  pannello(visibile: boolean): void;
  /** Vettore r_b - r_a (km) all'istante corrente. */
  relativo(a: string, b: string): number[];
  /** Intersezione analitica (Float64) del raggio del pixel CSS (x, y) con l'ellissoide del corpo. */
  dentroAnalitico(slug: string, x: number, y: number): boolean;
  /**
   * Raggio del pixel CSS (x, y) contro il piano degli anelli di Saturno (Float64): raggio dell'intersezione (km),
   * μ = |d·n|, sAsse = coordinata lungo il polo (km, positiva a nord) del punto dell'asse più vicino al raggio,
   * nord = camera a nord del piano; null se il raggio è parallelo al piano o il piano è dietro la camera.
   */
  pianoAnelli(x: number, y: number): { r: number; mu: number; sAsse: number; nord: boolean } | null;
  raggi(slug: string): number[] | null;
}

declare global {
  interface Window {
    __lab?: Lab;
  }
}

const parametri = new URLSearchParams(location.search);
const canvas = document.getElementById('scena') as HTMLCanvasElement;
const strato = document.getElementById('etichette') as HTMLElement;
const catalogo = creaCatalogoFittizio();
const eff = new EffemeridiFittizie(catalogo);
const ori = new OrientamentoFittizio(catalogo, eff);
const scena = creaScena({
  canvas,
  etichette: strato,
  catalogo,
  effemeridi: eff,
  orientamento: ori,
  texture: new TextureFittizie(),
  stelle: new StelleFittizie(),
  movimentoRidotto: parametri.has('ridotto'),
});

/** Motore interno della scena, per le verifiche analitiche dei test. */
const motore = (scena as unknown as { motore: Motore }).motore;

// 18/10/2026 00:00 UT (JD 2 461 331,5) come istante iniziale.
let jdUT = Number(parametri.get('jd') ?? 2_461_331.5);
let velocita = 0;
let inizioRiproduzione = 0;
let jdInizio = jdUT;
const selezioni: Lab['selezioni'] = [];

function applicaTempo(): void {
  scena.impostaTempo(tempoFittizio(jdUT));
  (document.getElementById('jd') as HTMLInputElement).value = jdUT.toFixed(5);
}

// Ciclo esterno dei frame (§ 5.5 punto 1: tempo calcolato una volta per frame).
let pianificato = false;
function pianifica(): void {
  if (pianificato) return;
  pianificato = true;
  requestAnimationFrame(() => {
    pianificato = false;
    if (velocita !== 0) {
      jdUT = jdInizio + (velocita * (performance.now() - inizioRiproduzione)) / 1000;
      applicaTempo();
    }
    const ancora = scena.disegna();
    aggiornaStatistiche();
    if (ancora || velocita !== 0) pianifica();
  });
}
scena.onRichiestaFrame(pianifica);
scena.onSelezione((e) => {
  selezioni.push(e);
  if (e.ssid !== null) scena.impostaOrbiteExtra([]);
});

const selFuoco = document.getElementById('fuoco') as HTMLSelectElement;
for (const c of [...catalogo].sort((a, b) => a.ssid - b.ssid)) selFuoco.add(new Option(c.nome, c.slug));
selFuoco.addEventListener('change', () => scena.impostaFuoco(eff.slug(selFuoco.value), { inquadratura: 'corpo' }));
const selPreset = document.getElementById('preset') as HTMLSelectElement;
selPreset.add(new Option('(nessuno)', ''));
for (const p of PRESET_VISTA) selPreset.add(new Option(p.id, p.id));
selPreset.addEventListener('change', () => {
  if (selPreset.value) applicaPreset(selPreset.value as IdPreset);
});

function applicaPreset(id: IdPreset): void {
  const p = PRESET_VISTA.find((x) => x.id === id);
  if (p) {
    scena.impostaFuoco(eff.slug(p.fuoco), {
      inquadratura: { estensioneKm: p.ampiezzaKm },
      elevazione: ELEVAZIONE_PREDEFINITA,
      vistaSistema: p.vistaSistema === true,
    });
  }
}
const inJd = document.getElementById('jd') as HTMLInputElement;
inJd.addEventListener('change', () => {
  jdUT = Number(inJd.value);
  jdInizio = jdUT;
  inizioRiproduzione = performance.now();
  applicaTempo();
});
document.getElementById('meno')!.addEventListener('click', () => impostaJd(jdUT - 1));
document.getElementById('piu')!.addEventListener('click', () => impostaJd(jdUT + 1));
const selVel = document.getElementById('velocita') as HTMLSelectElement;
selVel.addEventListener('change', () => riproduci(Number(selVel.value)));
const contLivelli = document.getElementById('livelli')!;
const livelliAttuali: LivelliVisivi = { ...LIVELLI_PREDEFINITI };
for (const k of Object.keys(livelliAttuali) as (keyof LivelliVisivi)[]) {
  const l = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = livelliAttuali[k];
  c.addEventListener('change', () => {
    livelliAttuali[k] = c.checked;
    scena.impostaLivelli({ [k]: c.checked });
  });
  l.append(c, k);
  contLivelli.append(l);
}

function impostaJd(j: number): void {
  jdUT = j;
  jdInizio = j;
  inizioRiproduzione = performance.now();
  applicaTempo();
}

function riproduci(v: number): void {
  velocita = v;
  jdInizio = jdUT;
  inizioRiproduzione = performance.now();
  scena.impostaRiproduzione(v);
  pianifica();
}

const stat = document.getElementById('stat')!;
let ultimaStat = 0;
function aggiornaStatistiche(): void {
  const ora = performance.now();
  if (ora - ultimaStat < 250) return;
  ultimaStat = ora;
  const s = scena.statistiche();
  const v = scena.statoVista();
  const anni = (jdUT - J2000) / 365.25 + 2000;
  stat.textContent =
    `anno ${anni.toFixed(2)} · fuoco ${catalogo[v.fuoco]?.nome ?? ''}\n` +
    `distanza ${v.distanzaKm.toExponential(3)} km · estensione ${v.estensioneKm.toExponential(3)} km\n` +
    `CPU ${s.cpuMs.toFixed(2)} ms (media ${s.cpuMediaMs.toFixed(2)}) · frame ${s.frameMs.toFixed(1)} ms · orbite ${s.orbiteRicostruite}`;
}

let estensionePerdita: WEBGL_lose_context | null = null;

function contesto(): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2');
}

const lab: Lab = {
  scena,
  ssid: (slug) => eff.slug(slug),
  impostaJd,
  jd: () => jdUT,
  riproduci,
  fuoco: (slug, opz) => scena.impostaFuoco(eff.slug(slug), opz),
  preset: applicaPreset,
  seleziona: (slug) => scena.impostaSelezione(slug === null ? null : eff.slug(slug)),
  livelli: (l) => scena.impostaLivelli(l),
  livelloForzato: (slug, l) => {
    const s = eff.slug(slug);
    if (l) eff.livelliForzati.set(s, l);
    else eff.livelliForzati.delete(s);
    scena.invalidaDati();
  },
  rotazioniFisse: (v) => {
    ori.fissi = v;
    scena.invalidaDati();
  },
  posa: (p, b) => scena.impostaPosa(p, b),
  escludi: (slugs) => scena.impostaEsclusi(slugs.map((s) => eff.slug(s))),
  attendiQuiete: (timeoutMs = 10_000) =>
    new Promise<void>((risolvi, rifiuta) => {
      const t0 = performance.now();
      let quiete = 0;
      const passo = (): void => {
        if (scena.inQuiete()) quiete++;
        else quiete = 0;
        if (quiete >= 3) {
          risolvi();
          return;
        }
        if (performance.now() - t0 > timeoutMs) {
          rifiuta(new Error('scena non in quiete'));
          return;
        }
        requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }),
  pixel: (x, y, w, h) => {
    const p = scena.leggiPixel(x, y, w, h);
    return { larghezza: p.larghezza, altezza: p.altezza, pixelRatio: p.pixelRatio, dati: Array.from(p.dati) };
  },
  posizione: (slug) => scena.getScreenPosition(eff.slug(slug)),
  vista: () => scena.statoVista(),
  perdiContesto: () => {
    // L'estensione si ottiene prima della perdita: a contesto perso getExtension restituisce null.
    estensionePerdita = contesto()?.getExtension('WEBGL_lose_context') ?? null;
    if (!estensionePerdita) return false;
    estensionePerdita.loseContext();
    return true;
  },
  ripristinaContesto: () => {
    if (!estensionePerdita) return false;
    estensionePerdita.restoreContext();
    return true;
  },
  selezioni,
  pannello: (v) => document.getElementById('pannello')!.classList.toggle('nascosto', !v),
  relativo: (a, b) => {
    const jdTT = tempoFittizio(jdUT).jdTT;
    const ra = new Float64Array(6);
    const rb = new Float64Array(6);
    eff.stateAt(eff.slug(a), jdTT, ra);
    eff.stateAt(eff.slug(b), jdTT, rb);
    return [rb[0]! - ra[0]!, rb[1]! - ra[1]!, rb[2]! - ra[2]!];
  },
  dentroAnalitico: (slug, x, y) => motore.colpisceDisco(eff.slug(slug), x, y),
  pianoAnelli: (x, y) => {
    const s = eff.slug('saturno');
    const pr = motore.proiettore;
    const v = new Float64Array(3);
    const d = new Float64Array(3);
    pr.raggioVista(x, y, v, 0);
    pr.ruotaInversa(v[0]!, v[1]!, v[2]!, d, 0);
    const l = Math.hypot(d[0]!, d[1]!, d[2]!);
    // Centro di Saturno rispetto alla camera e polo (terza colonna dell'orientamento).
    const c = [0, 1, 2].map((k) => motore.rel[3 * s + k]! - pr.cam[k]!);
    const n = [motore.orient[9 * s + 2]!, motore.orient[9 * s + 5]!, motore.orient[9 * s + 8]!];
    const dn = (d[0]! * n[0]! + d[1]! * n[1]! + d[2]! * n[2]!) / l;
    const cn = c[0]! * n[0]! + c[1]! * n[1]! + c[2]! * n[2]!;
    if (Math.abs(dn) < 1e-12) return null;
    const t = cn / dn;
    if (!(t > 0)) return null;
    const q = [0, 1, 2].map((k) => (t * d[k]!) / l - c[k]!);
    // Punto dell'asse c + s·n più vicino al raggio t·d: s = (dn·(d·c) - n·c)/(1 - dn²).
    const dc = (d[0]! * c[0]! + d[1]! * c[1]! + d[2]! * c[2]!) / l;
    return { r: Math.hypot(q[0]!, q[1]!, q[2]!), mu: Math.abs(dn), sAsse: (dn * dc - cn) / (1 - dn * dn), nord: cn < 0 };
  },
  raggi: (slug) => catalogo[eff.slug(slug)]?.fisica.raggi_km?.valore ?? null,
};
window.__lab = lab;

applicaTempo();
// Stato iniziale (§ 11.12): fuoco sul Sole, vista Sistema interno, Terra selezionata.
scena.impostaSelezione(eff.slug('terra'));
if (parametri.has('senzaPannello')) lab.pannello(false);
pianifica();
