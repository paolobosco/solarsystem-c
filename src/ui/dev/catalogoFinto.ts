// Catalogo di sviluppo per ui-lab.html: anagrafica reale (scripts/pipeline/bodies.json) con dati
// fisici noti, in attesa di public/data/v1/catalog.json. Solo sviluppo, escluso dalla build.
// Fonti dei valori fisici: raggi, poli e rotazioni Archinal et al. (2018), Celest. Mech. Dyn.
// Astr. 130:22; raggio del Sole IAU 2015 B3 (Prša et al. 2016, AJ 152:41); GM dei pianeti
// DE441 (Park et al. 2021, AJ 161:105, tramite src/ephem/constants.ts); GM e raggi dei satelliti
// JPL Planetary Satellite Physical Parameters; albedo geometriche JPL Planetary Physical
// Parameters; Plutone Nimmo et al. (2017), Icarus 287, 12; Eris Sicardy et al. (2011);
// Haumea Ortiz et al. (2017); Makemake Ortiz et al. (2012).

import anagrafica from '../../../scripts/pipeline/bodies.json';
import type {
  Catalogo,
  CategoriaCorpo,
  CorpoCatalogo,
  Effemeridi,
  FonteIntervallo,
  Raggi,
  ValoreFisico,
} from '../../data/catalogTypes';
import { CATEGORIE_PER_PRECEDENZA } from '../../data/catalogTypes';
import { GM_BARICENTRI, GM_LUNA, GM_SOLE, GM_TERRA, T0, T_END } from '../../ephem/constants';
import { calendarToJd } from '../../time/calendar';

interface VoceAnagrafica {
  ssid: number;
  slug: string;
  nome: string;
  nomeUfficiale: string | null;
  numero: number | null;
  designazione: string | null;
  categoria: CategoriaCorpo;
  categorieSecondarie: CategoriaCorpo[];
  primario: string | null;
  naif: number | null;
  sbdb: string | null;
  alias: string[];
}

const ARCHINAL = 'Archinal et al. 2018';
const SAT = 'JPL Planetary Satellite Physical Parameters';
const PHYS = 'JPL Planetary Physical Parameters';

function v<T>(valore: T, fonte: string, anno: number | null, incertezza: T | null = null): ValoreFisico<T> {
  return { valore, incertezza, fonte, anno };
}

function sfera(r: number): Raggi {
  return [r, r, r];
}

/** Raggi [a, b, c] in km. */
const RAGGI: Record<string, { r: Raggi; fonte: string; anno: number }> = {
  sole: { r: sfera(695_700), fonte: 'IAU 2015 B3 (Prša et al. 2016)', anno: 2016 },
  mercurio: { r: [2440.53, 2440.53, 2438.26], fonte: ARCHINAL, anno: 2018 },
  venere: { r: sfera(6051.8), fonte: ARCHINAL, anno: 2018 },
  terra: { r: [6378.1366, 6378.1366, 6356.7519], fonte: ARCHINAL, anno: 2018 },
  marte: { r: [3396.19, 3396.19, 3376.2], fonte: ARCHINAL, anno: 2018 },
  giove: { r: [71_492, 71_492, 66_854], fonte: ARCHINAL, anno: 2018 },
  saturno: { r: [60_268, 60_268, 54_364], fonte: ARCHINAL, anno: 2018 },
  urano: { r: [25_559, 25_559, 24_973], fonte: ARCHINAL, anno: 2018 },
  nettuno: { r: [24_764, 24_764, 24_341], fonte: ARCHINAL, anno: 2018 },
  plutone: { r: sfera(1188.3), fonte: 'Nimmo et al. 2017', anno: 2017 },
  cerere: { r: [487.3, 487.3, 446], fonte: ARCHINAL, anno: 2018 },
  vesta: { r: [289, 280, 229], fonte: ARCHINAL, anno: 2018 },
  eris: { r: sfera(1163), fonte: 'Sicardy et al. 2011', anno: 2011 },
  haumea: { r: [1161, 852, 513], fonte: 'Ortiz et al. 2017', anno: 2017 },
  makemake: { r: sfera(715), fonte: 'Ortiz et al. 2012', anno: 2012 },
  luna: { r: sfera(1737.4), fonte: ARCHINAL, anno: 2018 },
  io: { r: [1829.4, 1819.4, 1815.7], fonte: ARCHINAL, anno: 2018 },
  europa: { r: sfera(1562.6), fonte: ARCHINAL, anno: 2018 },
  ganimede: { r: sfera(2631.2), fonte: ARCHINAL, anno: 2018 },
  callisto: { r: sfera(2410.3), fonte: ARCHINAL, anno: 2018 },
  titano: { r: sfera(2575), fonte: ARCHINAL, anno: 2018 },
  rea: { r: sfera(763.5), fonte: ARCHINAL, anno: 2018 },
  giapeto: { r: sfera(734.3), fonte: ARCHINAL, anno: 2018 },
  dione: { r: sfera(561.4), fonte: ARCHINAL, anno: 2018 },
  teti: { r: sfera(531.0), fonte: ARCHINAL, anno: 2018 },
  encelado: { r: [256.6, 251.4, 248.3], fonte: ARCHINAL, anno: 2018 },
  mimas: { r: [207.8, 196.7, 190.6], fonte: ARCHINAL, anno: 2018 },
  titania: { r: sfera(788.9), fonte: ARCHINAL, anno: 2018 },
  oberon: { r: sfera(761.4), fonte: ARCHINAL, anno: 2018 },
  umbriel: { r: sfera(584.7), fonte: ARCHINAL, anno: 2018 },
  ariel: { r: [581.1, 577.9, 577.7], fonte: ARCHINAL, anno: 2018 },
  miranda: { r: [240.4, 234.2, 232.9], fonte: ARCHINAL, anno: 2018 },
  tritone: { r: sfera(1352.6), fonte: ARCHINAL, anno: 2018 },
  caronte: { r: sfera(606), fonte: ARCHINAL, anno: 2018 },
  fobos: { r: [13.0, 11.4, 9.1], fonte: ARCHINAL, anno: 2018 },
  deimos: { r: [7.8, 6.0, 5.1], fonte: ARCHINAL, anno: 2018 },
};

/** GM in km³/s² per i corpi non planetari (satelliti). */
const GM_SATELLITI: Record<string, number> = {
  io: 5959.9,
  europa: 3202.7,
  ganimede: 9887.8,
  callisto: 7179.3,
  titano: 8978.1,
  rea: 153.9,
  giapeto: 120.5,
  dione: 73.1,
  teti: 41.2,
  encelado: 7.2,
  mimas: 2.5,
  titania: 228.2,
  oberon: 192.4,
  tritone: 1428.5,
  caronte: 106.1,
};

/** Periodo di rotazione siderale (ore; negativo = retrogrado), Archinal et al. 2018. */
const ROTAZIONE: Record<string, number> = {
  sole: 609.12,
  mercurio: 1407.5,
  venere: -5832.6,
  terra: 23.9345,
  marte: 24.6229,
  giove: 9.925,
  saturno: 10.656,
  urano: -17.24,
  nettuno: 16.11,
  plutone: -153.29,
  cerere: 9.074,
  vesta: 5.342,
};

/** Albedo geometrica (JPL Planetary Physical Parameters). */
const ALBEDO: Record<string, number> = {
  mercurio: 0.142,
  venere: 0.689,
  terra: 0.434,
  marte: 0.17,
  giove: 0.538,
  saturno: 0.499,
  urano: 0.488,
  nettuno: 0.442,
  plutone: 0.52,
};

const NAIF_DE441: Record<string, number> = {
  mercurio: 1,
  venere: 2,
  terra: 3,
  marte: 4,
  giove: 5,
  saturno: 6,
  urano: 7,
  nettuno: 8,
  plutone: 9,
};

const KERNEL: Record<string, string> = {
  marte: 'mar099',
  giove: 'jup365',
  saturno: 'sat441',
  urano: 'ura184',
  nettuno: 'nep097',
  plutone: 'plu060',
  eris: 'Holler et al. 2021',
};

const JD_1600 = calendarToJd({ anno: 1600, mese: 1, giorno: 1, ora: 0, minuto: 0, secondo: 0, calendario: 'gregoriano' });

function gm(slug: string, naif: number | null): ValoreFisico<number> | null {
  if (slug === 'sole') return v(GM_SOLE, 'DE441 (Park et al. 2021)', 2021);
  if (slug === 'terra') return v(GM_TERRA, 'DE441 (Park et al. 2021)', 2021);
  if (slug === 'luna') return v(GM_LUNA, 'DE441 (Park et al. 2021)', 2021);
  const n = NAIF_DE441[slug];
  if (n !== undefined && naif !== null) return v(GM_BARICENTRI[n] ?? 0, 'DE441 (Park et al. 2021), sistema', 2021);
  const s = GM_SATELLITI[slug];
  return s === undefined ? null : v(s, SAT, 2021);
}

function effemeridi(c: VoceAnagrafica): Effemeridi {
  if (c.categoria === 'sole') return { modello: 'sole' };
  if (c.slug === 'luna') return { modello: 'luna' };
  const n = NAIF_DE441[c.slug];
  if (n !== undefined) return { modello: 'pianeta', naifDE441: n };
  if (c.categoria === 'luna') {
    const kernel = KERNEL[c.primario ?? ''] ?? 'kernel';
    const fonti: FonteIntervallo[] = [
      { tipo: 'secolare', inizio: T0, fine: JD_1600, descrizione: 'passato', varianti: [], saltoGiunzioneKm: null },
      { tipo: c.primario === 'eris' ? 'kepleriana' : 'spk-satellitare', inizio: JD_1600, fine: T_END, descrizione: kernel, varianti: [], saltoGiunzioneKm: 3 },
    ];
    return { modello: 'satellite', rF: [1, 0, 0, 0, 1, 0, 0, 0, 1], frequenze: [], arcoOsservativo: null, fonti };
  }
  const fonti: FonteIntervallo[] = [
    { tipo: 'assist', inizio: T0, fine: JD_1600, descrizione: 'a ritroso dal 1650', varianti: ['senza-ng'], saltoGiunzioneKm: null },
    { tipo: 'spk-horizons', inizio: JD_1600, fine: T_END, descrizione: `JPL#${(c.ssid % 97) + 12}`, varianti: [], saltoGiunzioneKm: 120 },
  ];
  return { modello: 'piccolo-corpo', fonti };
}

export function creaCatalogoFinto(): Catalogo {
  const voci = (anagrafica as { corpi: VoceAnagrafica[] }).corpi;
  const corpi: CorpoCatalogo[] = voci.map((c) => {
    const raggi = RAGGI[c.slug];
    const rot = ROTAZIONE[c.slug];
    const alb = ALBEDO[c.slug];
    return {
      ssid: c.ssid,
      slug: c.slug,
      nome: c.nome,
      nomeUfficiale: c.nomeUfficiale,
      numero: c.numero,
      designazione: c.designazione,
      alias: [...c.alias],
      categoria: c.categoria,
      categorieSecondarie: [...c.categorieSecondarie],
      naif: c.naif,
      spkid: null,
      sbdb: c.sbdb,
      primario: c.primario,
      effemeridi: effemeridi(c),
      soluzione: {
        id: c.categoria === 'pianeta' || c.slug === 'plutone' || c.slug === 'luna' || c.slug === 'sole' ? 'DE441' : `JPL#${(c.ssid % 97) + 12}`,
        data: null,
        estrazione: '2026-10-18',
        modelloNG: null,
        recordDastcom: null,
      },
      fisica: {
        raggi_km: raggi ? v(raggi.r, raggi.fonte, raggi.anno) : null,
        gm_km3s2: gm(c.slug, c.naif),
        rotazione: rot === undefined ? null : v(rot, ARCHINAL, 2018),
        albedo: alb === undefined ? null : v(alb, PHYS, 2021),
      },
      orientamento: { modello: c.slug === 'terra' ? 'vondrak' : 'wgccre', coefficienti: null, convenzionePolo: 'nord-IAU', indicativo: false },
      texture:
        c.slug === 'terra'
          ? { file: 'tex/terra.jpg', lon0_u: 0.5, verso: 'est', fonte: 'NASA Blue Marble Next Generation', licenza: 'pubblico dominio', areeNonOsservate: 'nessuna' }
          : null,
      epsModelloCostante: null,
    };
  });
  return {
    formato: 1,
    generato: '2026-10-18T00:00:00Z',
    corpi,
    categorie: CATEGORIE_PER_PRECEDENZA.map((id, i) => ({ id, precedenza: i, filtrabile: id !== 'sole' })),
  };
}
