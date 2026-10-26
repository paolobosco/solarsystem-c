// Accuratezza mostrata in "Fonti e metodi": tabella dei valori, importata dall'interfaccia.
// Valori misurati nella validazione (docs/VALIDAZIONE.md, § 3-7): massimi sull'intervallo dei dati
// pubblicati, con le tolleranze vincolanti di docs/PROGETTO.md (§ 6.4-6.5, § 7.3.4, § 7.4, § 7.5.6,
// § 7.6.3, § 7.7). I nomi delle righe sono in testi.it.ts e testi.en.ts (VOCI_ACCURATEZZA); qui restano numeri,
// unità e nomi propri.

import { creaFormati } from './format';
import { LINGUA } from './lingua';
import type { Lingua } from './lingua';

export type StatoValore = 'progetto' | 'misurato';

export type IdAccuratezza = 'pianeti' | 'emb' | 'luna' | 'satelliti' | 'piccoli-corpi' | 'delta-t' | 'rotazione-terrestre';

export interface VoceAccuratezza {
  id: IdAccuratezza;
  /** Valore misurato o di progetto; null finché non è misurato. */
  valore: string | null;
  /** Tolleranza vincolante. */
  soglia: string;
  stato: StatoValore;
}

export interface ValoriValidazione {
  /** Data della validazione, mostrata nel testo (italiano GG/MM/AAAA, inglese per esteso); null finché i valori sono quelli di progetto. */
  dataValidazione: string | null;
  voci: readonly VoceAccuratezza[];
}

const NB = '\u00a0';
const S = '\u2009';

const VALORI_ITALIANO: ValoriValidazione = {
  dataValidazione: '19/10/2026',
  voci: [
    {
      // scansione densa contro DE441 (planets.py valida)
      id: 'pianeti',
      valore: 'Mercurio 0,61″; Venere 1,08″; Marte 1,78″; Giove 1,52″; Saturno 1,04″; Urano 1,74″; Nettuno 1,18″; Plutone 1,53″',
      soglia: '2″',
      stato: 'misurato',
    },
    {
      // passo 16 d in tutti i blocchi, scansione densa
      id: 'emb',
      valore: `25,4${NB}km; 24,6${NB}km (1010-2121)`,
      soglia: `250${NB}km; 100${NB}km (1010-2121)`,
      stato: 'misurato',
    },
    {
      // griglia di 0,5 d su tutto l'intervallo (moon.py valida): massimo/rms; ultimo millennio; distanza
      id: 'luna',
      valore: `20,6″/3,9″; 12,6″/2,7″ (2000-2121); 16,3${NB}km`,
      soglia: `60″; 50${NB}km`,
      stato: 'misurato',
    },
    {
      // contro i kernel SPK (satellites.py valida): massimi per classe di tolleranza
      id: 'satelliti',
      valore: `0,31° (Fobos); 0,50° (Nereide); 0,38° (Iperione); 0,78${NB}% a (Imalia)`,
      soglia: `0,5°; 1° (Imalia, Febe, Nereide); 3° (Iperione); 1${NB}% a`,
      stato: 'misurato',
    },
    {
      // rapporto con la tolleranza (small_bodies.py valida): massimo su 14 400 epoche; C/1680 V1 al perielio
      id: 'piccoli-corpi',
      valore: `≤${NB}88${NB}%; 152${NB}% (C/1680 V1)`,
      soglia: `max(500${NB}km; 10⁻⁷·r) (1600-2121); max(10⁻³·r; 0,05·ε·r) (−2000-1600); max(10⁻²·r; 0,05·ε·r) (< −2000)`,
      stato: 'misurato',
    },
    {
      id: 'delta-t',
      valore: `ΔT(−720) = 20${S}371,848${NB}s; σ(−9999) = 103${S}006${NB}s; σ(−3000) = 8${S}978${NB}s; σ(2000) = 0,114${NB}s; σ(2120) = 46,6${NB}s`,
      soglia: `±0,01${NB}s; ±1${NB}%`,
      stato: 'misurato',
    },
    {
      id: 'rotazione-terrestre',
      valore: '5,2·10⁻⁶° (1600-2200); 1,0·10⁻⁴° (0-2121); −0,0672° (−10000)',
      soglia: '0,001° (1600-2200); −0,067° ± 0,005° (−10000)',
      stato: 'misurato',
    },
  ],
};

/** Nomi propri dei valori, in inglese. */
const NOMI_INGLESI: Readonly<Record<string, string>> = {
  Mercurio: 'Mercury',
  Venere: 'Venus',
  Marte: 'Mars',
  Giove: 'Jupiter',
  Saturno: 'Saturn',
  Urano: 'Uranus',
  Nettuno: 'Neptune',
  Plutone: 'Pluto',
  Fobos: 'Phobos',
  Nereide: 'Nereid',
  Iperione: 'Hyperion',
  Imalia: 'Himalia',
  Febe: 'Phoebe',
};

const RE_NOMI = new RegExp(`\\b(${Object.keys(NOMI_INGLESI).join('|')})\\b`, 'g');

/**
 * Valore scritto con le convenzioni italiane (virgola decimale, U+2009 tra i gruppi di cifre) nella convenzione della
 * lingua (§ 11.13): "20 371,848 s" diventa "20,371.848 s"; i nomi propri dei corpi sono in inglese.
 */
export function localizzaValore(testo: string, lingua: Lingua): string {
  if (lingua === 'it') return testo;
  return testo
    .replace(/(?<=\d),(?=\d)/g, '.')
    .replace(/(?<=\d)\u2009(?=\d{3}(?!\d))/g, ',')
    .replace(RE_NOMI, (n) => NOMI_INGLESI[n] ?? n);
}

/** Valori di accuratezza nella lingua indicata; la data della validazione in inglese è per esteso. */
export function valoriValidazione(lingua: Lingua): ValoriValidazione {
  if (lingua === 'it') return VALORI_ITALIANO;
  const data = VALORI_ITALIANO.dataValidazione;
  const m = data === null ? null : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data);
  return {
    dataValidazione: m === null || data === null ? data : creaFormati(lingua).formatData({ giorno: Number(m[1]), mese: Number(m[2]), anno: Number(m[3]) }),
    voci: VALORI_ITALIANO.voci.map((v) => ({
      ...v,
      valore: v.valore === null ? null : localizzaValore(v.valore, lingua),
      soglia: localizzaValore(v.soglia, lingua),
    })),
  };
}

export const VALORI_VALIDAZIONE: ValoriValidazione = valoriValidazione(LINGUA);
