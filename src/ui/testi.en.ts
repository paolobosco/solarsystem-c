// English texts of the interface. Same exports and same structure as src/ui/testi.it.ts: the
// types below fail to compile if a key is missing, extra or of a different shape.
// Chosen at start-up by src/ui/testi.ts. No U+2014 character.

import type { LivelloVisivo } from '../app/store';
import type { CategoriaCorpo } from '../data/catalogTypes';
import type { Livello } from '../ephem/types';
import type { UnitaPasso } from '../time/steps';
import { partiTastiCon, testoDaParti } from './testi.it';
import type { IdPreset, T as TIt, TastiScorciatoia } from './testi.it';
import type { IdAccuratezza } from './valoriValidazione';

/** Shape of the Italian texts with the string literals widened to string. */
export type Wide<X> = X extends string
  ? string
  : X extends (...args: infer A) => infer R
    ? (...args: A) => Wide<R>
    : X extends readonly unknown[]
      ? { [K in keyof X]: Wide<X[K]> }
      : X extends object
        ? { -readonly [K in keyof X]: Wide<X[K]> }
        : X;

export type FormaTesti = Wide<typeof TIt>;

/** English name of a calendar from its identifier (the identifiers are Italian: 'giuliano', 'gregoriano'). */
const nomeCalendario = (c: string): string => (c === 'giuliano' ? 'Julian' : 'Gregorian');

export const MESI = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Three-letter months for the ruler ticks. */
export const MESI_BREVI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** 0 = Monday. */
export const GIORNI_SETTIMANA = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Proper names that take the definite article: "of the Sun", "to the Moon". */
const CON_ARTICOLO: ReadonlySet<string> = new Set(['Sun', 'Moon']);

function the(nome: string): string {
  return CON_ARTICOLO.has(nome) ? `the ${nome}` : nome;
}

/** "of Jupiter", "of the Sun". */
function ofName(nome: string): string {
  return `of ${the(nome)}`;
}

/** "to Jupiter", "to the Sun". */
function toName(nome: string): string {
  return `to ${the(nome)}`;
}

/** "on Jupiter", "on the Sun". */
function onName(nome: string): string {
  return `on ${the(nome)}`;
}

/** "from 1 January 10000 BC". */
function fromDate(data: string): string {
  return `from ${data}`;
}

/** "to 31 December 2120". */
function toDate(data: string): string {
  return `to ${data}`;
}

/** "as of 19 October 2026". */
function asOfDate(data: string): string {
  return `as of ${data}`;
}

export const UNITA = {
  km: 'km',
  ua: 'au',
  uaEsteso: 'astronomical unit (IAU symbol: au)',
  kmS: 'km/s',
  s: 's',
  min: 'min',
  h: 'h',
  giorni: 'days',
  giorno: 'day',
  anni: 'years',
  anno: 'year',
  gradi: '°',
  primi: '′',
  secondi: '″',
  milioniKm: 'million km',
  milioneKm: 'million km',
  kmCubiS2: 'km³/s²',
  mCubiS2: 'm³/s²',
  aC: 'BC',
  dC: 'AD',
  ut: 'UT',
  tt: 'TT',
  utc: 'UTC',
  nonDisponibile: 'n/a',
  infinito: '∞',
  circa: '≈',
  piuMeno: '±',
} as const;

export const NOMI_CATEGORIE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'Sun',
  pianeta: 'Planet',
  'pianeta-nano': 'Dwarf planet',
  luna: 'Moon',
  interstellare: 'Interstellar object',
  cometa: 'Comet',
  centauro: 'Centaur',
  tno: 'TNO',
  asteroide: 'Asteroid',
};

export const NOMI_CATEGORIE_PLURALE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'Sun',
  pianeta: 'Planets',
  'pianeta-nano': 'Dwarf planets',
  luna: 'Moons',
  interstellare: 'Interstellar objects',
  cometa: 'Comets',
  centauro: 'Centaurs',
  tno: 'TNOs',
  asteroide: 'Asteroids',
};

/** Texts of the 3D scene (moon counter): the distance ring label is composed in testiScena.ts. */
export const TESTI_SCENA = {
  contatoreLune: (n: number): string => (n === 1 ? '+1 moon' : `+${n} moons`),
};

/** Licence URIs that require a reference to the licence text (CC BY 4.0, section 3(a)(1)(C)). */
export const URI_LICENZE: Readonly<Record<string, string>> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

/** First occurrence in full; elsewhere TNO with its abbreviation. */
export const TNO_ESTESO = 'Trans-Neptunian objects (TNOs)';
export const TNO_SIGLA = 'TNO';
export const TNO_TITOLO = 'trans-Neptunian objects';

/** Category names inside a sentence ("also asteroid", "Show comets"). */
export const NOMI_CATEGORIE_IN_FRASE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'Sun',
  pianeta: 'planet',
  'pianeta-nano': 'dwarf planet',
  luna: 'moon',
  interstellare: 'interstellar object',
  cometa: 'comet',
  centauro: 'centaur',
  tno: 'TNO',
  asteroide: 'asteroid',
};

export const NOMI_CATEGORIE_PLURALE_IN_FRASE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'the Sun',
  pianeta: 'planets',
  'pianeta-nano': 'dwarf planets',
  luna: 'moons',
  interstellare: 'interstellar objects',
  cometa: 'comets',
  centauro: 'centaurs',
  tno: 'TNOs',
  asteroide: 'asteroids',
};

export const NOMI_LIVELLI: Readonly<Record<Livello, string>> = {
  precisa: 'Precise',
  buona: 'Good',
  approssimata: 'Approximate',
  indicativa: 'Indicative',
  'non-determinabile': 'Undeterminable',
};

export const NOMI_UNITA_PASSO: Readonly<Record<UnitaPasso, string>> = {
  minuto: 'minute',
  ora: 'hour',
  giorno: 'day',
  mese: 'month',
  anno: 'year',
  secolo: 'century',
  millennio: 'millennium',
};

/** Complement "one minute", "one hour", ... for the step buttons: "Back one hour". */
const UNA_UNITA: Readonly<Record<UnitaPasso, string>> = {
  minuto: 'one minute',
  ora: 'one hour',
  giorno: 'one day',
  mese: 'one month',
  anno: 'one year',
  secolo: 'one century',
  millennio: 'one millennium',
};

/** Stepped speeds: short and long label, in the same order as VELOCITA_S. */
export const VELOCITA_ETICHETTE = [
  { breve: '1 s/s', lunga: '1 second per second' },
  { breve: '1 min/s', lunga: '1 minute per second' },
  { breve: '1 h/s', lunga: '1 hour per second' },
  { breve: '1 day/s', lunga: '1 day per second' },
  { breve: '1 week/s', lunga: '1 week per second' },
  { breve: '1 month/s', lunga: '1 month per second' },
  { breve: '1 year/s', lunga: '1 year per second' },
  { breve: '10 years/s', lunga: '10 years per second' },
  { breve: '100 years/s', lunga: '100 years per second' },
  { breve: '1,000 years/s', lunga: '1,000 years per second' },
] as const;

export const NOMI_LIVELLI_VISIVI: Readonly<Record<LivelloVisivo, string>> = {
  orbite: 'Orbits',
  etichette: 'Labels',
  marcatori: 'Markers',
  anelliDistanza: 'Distance rings on the ecliptic',
  grigliaEclittica: 'J2000 ecliptic grid',
  eclitticaData: 'Ecliptic of date',
  assiRotazione: 'Rotation axes',
  anelli: 'Rings of Saturn and Uranus',
  stelle: 'Stars',
  barraScala: 'Scale bar',
};

export const NOMI_PRESET: Readonly<Record<IdPreset, string>> = {
  'terra-luna': 'Earth and Moon',
  'plutone-caronte': 'Pluto and Charon',
  'sistema-giove': 'Jupiter system',
  'sistema-saturno': 'Saturn system',
  'sistema-interno': 'Inner Solar System',
  'fascia-principale': 'Main belt and Jupiter',
  'pianeti-giganti': 'Giant planets',
  'fascia-kuiper': 'Kuiper belt',
  sedna: 'Sedna and distant comets',
  interstellari: 'Interstellar objects',
};

/** Parts of the key text: { tasto } for each key, strings for the connectors ("+", ", ", " and "). */
export const partiTasti = (t: TastiScorciatoia): (string | { tasto: string })[] => partiTastiCon(t, ' and ');

/** Continuous key text: "Shift + arrows", "Page Up and Page Down". */
export const testoTasti = (t: TastiScorciatoia): string => testoDaParti(partiTasti(t));

/** Singular or plural: "1 day", "3 days". */
function plurale(n: number, singolare: string, pluraleTesto: string): string {
  return n === 1 ? `1 ${singolare}` : `${n} ${pluraleTesto}`;
}

export const T: FormaTesti = {
  salta: 'Skip to the time controls',
  chiudi: 'Close',

  trova: {
    etichetta: 'Find',
    segnaposto: 'Find a body',
    risultati: 'Search results',
    nessuno: (q: string) => `No body found for “${q}”. Try another spelling, the number (e.g. 433) or the designation.`,
    conteggio: (n: number) => (n === 1 ? '1 result' : `${n} results`),
    lunaDi: (pianeta: string) => `moon ${ofName(pianeta)}`,
    apriCatalogo: 'Catalogue',
    apriCatalogoEsteso: 'Open the catalogue of bodies',
    istruzioni: 'Up and down arrows to choose, Enter to select, Esc to close.',
  },

  barra: {
    livelli: 'Layers',
    tabella: 'Table',
    tabellaEsteso: 'Text view',
    // Button name: contains the visible label "Table" (WCAG 2.5.3).
    tabellaNome: 'Table: text view',
    fonti: 'Sources and methods',
    impostazioni: 'Settings',
    menu: 'Menu',
    vista: 'View',
    strumenti: 'Tools',
  },

  mappa: {
    descrizioneRuolo: '3D map',
    etichetta: (vista: string, fuoco: string) => `3D map: ${vista}, focus ${onName(fuoco)}`,
    istruzioni:
      'Arrow keys: rotate. Shift and arrow keys: pan. + and −, Page Up and Page Down: zoom. Enter: select the body closest to the centre. N and Shift+N: next or previous visible body. F: frame. Esc: deselect. Tab: leave the map.',
    vistaAmpiezza: (ampiezza: string) => `view ${ampiezza} wide`,
    nessunCorpoAlCentro: 'No body near the centre of the view.',
    nessunCorpoVisibile: 'No visible body.',
  },

  legenda: {
    scala: 'Distances and sizes are to scale. Symbols show the position, not the size.',
    barraScalaDidascalia: 'at the distance of the focused body',
    simboli: 'Body symbols',
    affidabilita: 'Position reliability',
    selezione: 'Selected body',
    fasce:
      'In the overview of the time ruler the band of each level is as tall as the filled bars of its icon: full for “precise”, absent for “undeterminable”.',
    descrizioniLivelli: {
      precisa: 'filled marker',
      buona: 'filled marker',
      approssimata: 'filled marker, amber warning',
      indicativa: 'hollow marker, uncertainty arc, dashed orbit',
      'non-determinabile': 'no marker',
    },
  },

  livelli: {
    titolo: 'Visual layers',
    eclitticaDataNota:
      'A line on the background sky, within 1.6° of the plane of the orbits: with the initial view it stays above the edge. To see it, lower the view towards the plane: Down arrow on the map, at least twice, or drag upwards.',
  },

  distanze: {
    titolo: 'View distance',
    regolo: 'View width',
    valore: (v: string) => `View ${v} wide`,
    avvicina: 'Zoom in',
    allontana: 'Zoom out',
    limiteMinimo: 'Minimum view distance reached.',
    limiteMassimo: 'Maximum view distance reached.',
    inquadraEsteso: 'Frame the selected body',
    preset: 'Views',
    presetEsteso: 'Preset views',
  },

  console: {
    titolo: 'Time controls',
    modificaData: (data: string) => `Date and time: ${data}. Edit`,
    adesso: 'Now',
    adessoEsteso: 'Go to the current instant',
    calendario: (c: 'giuliano' | 'gregoriano') => `${c === 'giuliano' ? 'Julian' : 'Gregorian'} calendar`,
    prolettico: (data: string) => `proleptic Gregorian: ${data}`,
    deltaT: 'ΔT',
    deltaTEsteso: 'ΔT, difference between TT and UT',
    deltaTValore: (valore: string, sigma: string) => `${valore} ± ${sigma}`,
    oraIncerta: (sigmaOre: string, gradi: string) =>
      `Time uncertain by ±${sigmaOre}\u00a0h: the Moon may be ${gradi}° ahead or behind.`,
    unitaPasso: 'Step unit',
    indietro: (u: UnitaPasso) => `Back ${UNA_UNITA[u]}`,
    avanti: (u: UnitaPasso) => `Forward ${UNA_UNITA[u]}`,
    riproduci: 'Play',
    pausa: 'Pause',
    direzione: 'Play backwards',
    velocita: 'Speed',
    regolo: 'Time ruler',
    regoloPanoramico: 'Overview of the interval',
    regoloValore: (data: string, calendario: string) => `${data}, ${nomeCalendario(calendario)} calendar`,
    regoloScala: (ampiezza: string) => `Ruler span: ${ampiezza}`,
    regoloScalaMinore: 'Ruler: shorter interval',
    regoloScalaMaggiore: 'Ruler: longer interval',
    attesaDati: 'Playback waiting for data.',
    /** Text description of the bands of the overview ruler: levels and years. */
    bandeAffidabilita: (nome: string, intervalli: string) => `Reliability ${ofName(nome)} over the interval: ${intervalli}.`,
    bandaIntervallo: (livello: string, da: string, a: string) => `${livello} ${fromDate(da)} ${toDate(a)}`,
    bandaTitolo: (livello: string, da: string, a: string) => `${livello}: ${fromDate(da)} ${toDate(a)}`,
    velocitaSegui: 'With “Follow current time” the date advances at 1 second per second: speed and direction cannot be changed.',
  },

  editor: {
    titolo: 'Edit date and time',
    giorno: 'Day',
    mese: 'Month',
    anno: 'Year',
    era: 'Era',
    aC: 'BC',
    dC: 'AD',
    aCEsteso: 'before Christ',
    dCEsteso: 'anno Domini',
    ora: 'Hour',
    minuti: 'Minutes',
    separatoreOra: ':',
    vai: 'Go',
    avanzate: 'Advanced options',
    annoAstronomico: 'Astronomical year',
    jdUT: 'JD (UT)',
    jdTT: 'JD (TT)',
    ingressoTT: 'Enter the instant in TT',
    offset: 'Fixed time offset',
    offsetUsa: 'Use a fixed time offset',
    offsetEtichetta: (s: string) => `${s} (fixed)`,
    offsetNota: 'No daylight saving time. The offset does not apply when entering the instant in TT.',
    rigaProlettica: 'Show the date in the proleptic Gregorian calendar',
    istruzioni:
      'Enter, or leaving the group, to confirm. The year goes from 1 to 10000; with a negative offset the interval starts on 31 December 10001\u00a0BC. Choose the era BC or AD.',
  },

  validazione: {
    ANNO_ZERO: 'Year 0 does not exist: 1 BC is followed by 1 AD.',
    RIFORMA_1582: 'In 1582 the calendar jumped from 4 to 15 October: the days from 5 to 14 do not exist.',
    vaiAl4: 'Go to 4 October',
    vaiAl15: 'Go to 15 October',
    GIORNO_INESISTENTE: (giorno: string, mese: string, anno: string, calendario: string) =>
      `${giorno} ${mese} ${anno} does not exist in the ${nomeCalendario(calendario)} calendar.`,
    dataAlle: (data: string, ora: string) => `${data} at ${ora}`,
    FUORI_INTERVALLO: 'Dates are available from 1 January 10000 BC to 31 December 2120 (UT).',
    fuoriIntervalloOffset: (fuso: string, inizio: string, fine: string) => `In ${fuso}: ${fromDate(inizio)} ${toDate(fine)}.`,
    fuoriIntervalloTT: (inizio: string, fine: string) => `In TT: ${fromDate(inizio)} ${toDate(fine)}.`,
    campoMancante: {
      giorno: 'Enter the day.',
      mese: 'Choose the month.',
      anno: 'Enter the year.',
      era: 'Choose the era: BC or AD.',
      ora: 'Enter the hour.',
      minuto: 'Enter the minutes.',
      secondo: 'Enter the seconds.',
      calendario: 'Invalid calendar.',
    },
    ANNO_NON_VALIDO: 'Enter a whole year from 1 to 10000 (10001\u00a0BC with a negative offset).',
    ERA_NON_VALIDA: 'Choose the era: BC or AD.',
    MESE_NON_VALIDO: 'Choose a month from January to December.',
    GIORNO_NON_VALIDO: 'Enter a day from 1 to 31.',
    ORA_NON_VALIDA: 'Enter an hour from 0 to 23.',
    MINUTO_NON_VALIDO: 'Enter minutes from 0 to 59.',
    SECONDO_NON_VALIDO: 'Enter seconds from 0 to 59.',
    CALENDARIO_NON_VALIDO: 'Invalid calendar.',
    CALENDARIO_INCOERENTE: 'The calendar given is not the one in force on that date.',
  },

  limiti: {
    inferiore: (data: string, locale: string | null) =>
      `Lower limit reached: ${data}${locale === null ? '' : ` (${locale})`}`,
    superiore: (data: string, locale: string | null) =>
      `Upper limit reached: ${data}${locale === null ? '' : ` (${locale})`}`,
    locale: (testo: string, fuso: string) => `${testo} in ${fuso}`,
  },

  annunci: {
    selezionato: (nome: string) => `Selected body: ${nome}`,
    selezionatoTra: (nome: string, i: number, n: number) => `Selected body: ${nome} (${i} of ${n} here)`,
    deselezionato: 'No body selected',
    fuoco: (nome: string) => `View centred ${onName(nome)}`,
    fuocoSenzaPosizione: (nome: string) => `Position ${ofName(nome)} cannot be determined at this date`,
    data: (data: string) => data,
    riproduzioneFerma: (data: string) => `Playback paused: ${data}`,
    riproduzioneFermaErrore: (data: string) => `Playback paused: data not loaded. ${data}`,
    velocita: (v: string) => `Speed ${v}`,
    vistaTestualeAperta: 'Text view open',
    vistaTestualeChiusa: 'Text view closed',
    collegamentoCopiato: 'Link copied.',
    collegamentoNonCopiato: (url: string) => `Copy failed. Link: ${url}`,
    filtro: (categoria: CategoriaCorpo, attivo: boolean) =>
      `${NOMI_CATEGORIE_PLURALE[categoria]} ${attivo ? 'shown' : 'hidden'}`,
    livello: (nome: string, attivo: boolean) => `${nome}: ${attivo ? 'on' : 'off'}`,
    scorciatoie: (attive: boolean) => `Keyboard shortcuts ${attive ? 'on' : 'off'}`,
    seguiOra: (attivo: boolean) => `Follow current time: ${attivo ? 'on' : 'off'}`,
    /** Date or limit announced by an action that turned off "Follow current time" (a single announcement). */
    conSeguiDisattivato: (testo: string) => `${testo}. Follow current time: off`,
    preset: (nome: string) => `View: ${nome}`,
  },

  scheda: {
    riduci: 'Collapse the info card',
    espandi: 'Expand the info card',
    chiudi: 'Close the info card',
    inquadra: 'Frame',
    copiaCollegamento: 'Copy link',
    collegamento: 'Link',
    copiaNonRiuscita: 'Copy failed: select and copy the link from the field.',
    leggiPosizione: 'Read position',
    nomeUfficiale: 'Official name',
    numero: 'Number',
    anche: (categorie: string) => `also ${categorie}`,
    ora: 'Now',
    distanzaSole: 'Distance from the Sun',
    distanzaTerra: 'Distance from Earth',
    tempoLuce: (t: string) => `light: ${t}`,
    velocitaEliocentrica: 'Heliocentric speed',
    velocitaRispetto: (nome: string) => `Speed relative ${toName(nome)}`,
    velocitaRispettoSistema: (nome: string) => `Speed relative to the barycentre of the system ${ofName(nome)}`,
    motoRapido: 'Motion too fast to be shown at this speed.',
    orbita: 'Orbit',
    riferimentoElio: 'J2000 ecliptic, heliocentric',
    riferimentoBari: 'J2000 ecliptic, barycentric',
    riferimentoElioTerraLuna: 'J2000 ecliptic, heliocentric of the Earth-Moon barycentre',
    riferimentoElioSistema: (nome: string) => `J2000 ecliptic, heliocentric of the barycentre of the system ${ofName(nome)}`,
    riferimentoPlaneto: (nome: string) => `relative ${toName(nome)}, reference plane F`,
    riferimentoPlanetoEclittica: (nome: string) => `relative ${toName(nome)}, J2000 ecliptic`,
    riferimentoSistema: (nome: string) => `relative to the barycentre of the system ${ofName(nome)}, reference plane F`,
    riferimentoSistemaEclittica: (nome: string) => `relative to the barycentre of the system ${ofName(nome)}, J2000 ecliptic`,
    riferimento: 'Reference',
    osculanti: (data: string) => `Osculating elements ${asOfDate(data)}`,
    /** Date with the time scale: "15 August 10000 BC (UT)". */
    dataInScala: (data: string, scala: string) => `${data} (${scala})`,
    elementi: {
      a: { simbolo: 'a', nome: 'semi-major axis' },
      q: { simbolo: 'q', nome: 'periapsis distance' },
      e: { simbolo: 'e', nome: 'eccentricity' },
      i: { simbolo: 'i', nome: 'inclination' },
      nodo: { simbolo: 'Ω', nome: 'longitude of the ascending node' },
      argPeri: { simbolo: 'ω', nome: 'argument of periapsis' },
      M: { simbolo: 'M', nome: 'mean anomaly' },
      P: { simbolo: 'P', nome: 'period' },
      T: { simbolo: 'T', nome: 'time of periapsis passage' },
      vInf: { simbolo: 'v∞', nome: 'speed at infinity' },
    },
    iperbolica: 'Hyperbolic orbit: period undefined',
    // Eccentricity that, once rounded, does not stay on the same side of 1 as the orbit (uncertain shape), or with uncertainty above 1.
    eQuasiParabolica: '≈\u00a01 (near-parabolic)',
    eNonDeterminabile: 'undeterminable',
    orbitaNonDeterminabile: 'Orbit undeterminable.',
    formaIncerta: 'Orbit shape uncertain: semi-major axis and eccentricity are approximate.',
    orbitaNonDisponibile: 'Elements not available at this date.',
    fisica: 'Physical characteristics',
    raggio: 'Mean radius',
    raggi: 'Semi-axes',
    gm: 'GM',
    rotazione: 'Rotation period',
    albedo: 'Geometric albedo',
    retrograda: '(retrograde)',
    nonNoto: 'unknown',
    fonteDi: (fonte: string) => `source: ${fonte}`,
    fonteAffidabilita: 'Source and reliability',
    sorgente: 'Ephemeris source',
    soluzione: 'Orbital solution',
    estrazione: (d: string) => `retrieved on ${d}`,
    epsModello: 'Model error',
    epsDeltaT: 'Error from ΔT',
    epsTotale: 'Estimated total error',
    epsDeltaTNullo: 'zero: the instant is in TT',
    erroreOltre90: '>\u00a090°',
    texture: 'Surface map',
    /** Licence with URI and declared modifications (CC BY 4.0, section 3(a)(1)(B-C)). */
    licenzaModificata: (licenza: string, uri: string) => `${licenza}, ${uri}; map resampled and realigned in longitude`,
    areeNonOsservate: {
      nessuna: '',
      parziali: 'Some unobserved areas are filled in.',
      'emisfero-sud': 'The southern hemisphere has not been observed: the map fills it in.',
    },
    rotazioneIndeterminata: 'With the instant in TT the rotation of the Earth is undetermined in longitude at this date: the UT time is uncertain by more than 6 hours.',
    nascostoDaFiltri: (categoria: CategoriaCorpo) =>
      `${NOMI_CATEGORIE_PLURALE[categoria]} hidden by the filters: the body is shown because it is selected.`,
    mostraCategoria: (categoria: string) => `Show ${categoria}`,
    caricamento: 'Loading data.',
    fuoriCopertura: 'Data not available at this date.',
    /** Distances that do not apply are omitted: from the Sun for the Sun, from Earth for Earth. */
    posizione: (nome: string, sole: string | null, terra: string | null) =>
      `${nome}: ${[sole === null ? null : `${sole} from the Sun`, terra === null ? null : `${terra} from Earth`].filter((x) => x !== null).join(', ')}.`,
  },

  sorgenti: {
    sole: 'origin of the reference frame',
    de441: 'DE441 (Park et al. 2021)',
    luna: 'Meeus series with corrections from DE441',
    // Prefixes of the source description in the catalogue; words already in the description are omitted.
    'spk-satellitare': 'JPL satellite kernel',
    kepleriana: 'Keplerian orbit',
    secolare: 'secular extrapolation',
    'spk-horizons': 'JPL Horizons, solution',
    'record-dastcom': 'DASTCOM record',
    'sb441-n16': 'sb441-n16 (Farnocchia 2021)',
    assist: 'ASSIST integration',
    nessuna: 'no source at this date',
  },

  affidabilita: {
    precisa: (sorgente: string) => `Position from ${sorgente}, estimated error below 1′.`,
    buona: (gradi: string, volte: string) =>
      `Estimated error up to ${gradi}°, about ${volte} times the apparent diameter of the full Moon.`,
    buonaMinima: (gradi: string) => `Estimated error up to ${gradi}°, less than a tenth of the apparent diameter of the full Moon.`,
    approssimata: (gradi: string) => `The position along the orbit may differ by ${gradi}°.`,
    indicativa: 'The shape of the orbit is reliable, the position along the orbit is not.',
    indicativaFormaIncerta: 'The position along the orbit is not reliable and the shape of the orbit is uncertain.',
    nonDeterminabile: 'Position undeterminable at this date.',
    orbitaNonDeterminabile: 'Orbit undeterminable.',
    badge: (livello: string) => `Reliability: ${livello}`,
    sole: 'The Sun is the origin of the heliocentric reference frame.',
  },

  catalogo: {
    titolo: 'Catalogue',
    filtri: 'Show',
    lune: (pianeta: string, n: number) => `${n === 1 ? 'Moon' : 'Moons'} ${ofName(pianeta)}`,
    nascosto: 'hidden by the filters',
    nonDeterminabile: 'undeterminable',
    chiudi: 'Close the catalogue',
  },

  testuale: {
    titolo: 'Text view',
    didascalia: (data: string, calendario: string) =>
      `Positions ${asOfDate(data)} (${nomeCalendario(calendario)} calendar). Heliocentric coordinates, J2000 ecliptic.`,
    colonne: {
      corpo: 'Body',
      categoria: 'Category',
      sole: 'Distance from the Sun',
      terra: 'Distance from Earth',
      coordinate: 'J2000 ecliptic longitude and latitude',
      affidabilita: 'Reliability',
    },
    aggiorna: 'Refresh',
    chiudi: 'Close the text view',
    nonAggiornata: 'Table frozen during playback: it updates when paused.',
    conteggio: (n: number, totale: number) => (n === totale ? `${n} bodies` : `${n} bodies of ${totale} (filters on)`),
    coordinate: (lon: string, lat: string) => `λ ${lon}, β ${lat}`,
    nonDisponibile: 'not available',
    inCaricamento: 'loading',
    nonApplicabile: 'not applicable',
    regione: 'Table of positions',
  },

  messaggi: {
    webgl: 'The browser does not support the 3D graphics required (WebGL2). You can use the text view.',
    contestoPerso: '3D graphics suspended, restoring. The text view remains available.',
    blocco: (intervallo: string) => `Unable to load the data for ${intervallo}${intervallo.endsWith('.') ? '' : '.'}`,
    luna: 'Unable to load the Moon data.',
    affidabilita: 'Unable to load the reliability estimates: the levels shown are provisional.',
    riprova: 'Retry',
    caricamento: (intervallo: string) => `Loading data for ${intervallo}`,
    caricamentoGenerico: 'Loading data',
    caricamentoConcluso: 'Data loaded.',
    intervallo: (da: string, a: string) => `the period ${da}-${a}`,
    slugSconosciuto: (slug: string) => `No body matches “${slug}”: the link was ignored.`,
    chiudiMessaggio: 'Close the message',
    benvenuto: [
      'Map of the Solar System to scale, from 10000 BC to 2120.',
      'Choose the date in the console at the bottom; find a body with Find or select it on the map.',
      'The info card of each body states the sources and the reliability of its position.',
    ],
    benvenutoTitolo: 'Welcome',
    leggiBenvenuto: 'Read the welcome note',
    chiudiBenvenuto: 'Close the welcome note',
  },

  avvio: {
    titolo: '3D Solar System',
    caricamento: 'Loading the base data',
    errore: 'Unable to load the base data of the map.',
    erroreAvvio: 'Unable to start the map.',
  },

  foglio: {
    espandi: 'Expand the panel',
    riduci: 'Collapse the panel',
    apriScheda: (nome: string) => `Open the info card ${ofName(nome)}`,
  },

  impostazioni: {
    titolo: 'Settings',
    lingua: 'Lingua / Language',
    linguaItaliano: 'Italiano',
    linguaInglese: 'English',
    scorciatoie: 'Global keyboard shortcuts',
    scorciatoieNota: 'Turn them off if you use dictation software or a screen reader with single-letter commands.',
    elencoScorciatoie: 'Show the shortcuts',
    rigaProlettica: 'Show the date in the proleptic Gregorian calendar before 15 October 1582',
    segui: 'Follow current time',
    seguiNota: 'The date advances with the device clock.',
    benvenuto: 'Show the welcome note again',
    movimento: 'Animations follow the system preference for reduced motion.',
  },

  scorciatoie: {
    titolo: 'Keyboard shortcuts',
    globali: 'Everywhere, outside text fields',
    mappa: 'With focus on the map',
    regolo: 'With focus on the time ruler',
    disattivate: 'Global shortcuts are off: turn them on again in Settings.',
    tasto: 'Key',
    azione: 'Action',
    // Keys of each entry: alternatives, each with the keys to press together (one <kbd> per key).
    voci: {
      globali: [
        [[['/']], 'Go to the Find field'],
        [[['Space']], 'Start or stop playback'],
        [[[','], ['.']], 'Step back and forward'],
        [[['['], [']']], 'Slower and faster'],
        [[['?']], 'List of shortcuts'],
        [[['T']], 'Text view'],
      ],
      mappa: [
        [[['Arrows']], 'Rotate the view'],
        [[['Shift', 'arrows']], 'Pan the view'],
        [[['+'], ['−'], ['Page Up'], ['Page Down']], 'Zoom in and out'],
        [[['Enter']], 'Select the body closest to the centre'],
        [[['N'], ['Shift', 'N']], 'Next and previous visible body'],
        [[['F']], 'Frame'],
        [[['Esc']], 'Deselect'],
        [[['Tab']], 'Leave the map'],
      ],
      regolo: [
        [[['Arrows']], 'Step of the chosen unit'],
        [[['Shift', 'arrows']], 'Ten steps'],
        [[['Page Up'], ['Page Down']], 'Step of the next larger unit'],
        [[['Home'], ['End']], 'Limits of the interval'],
      ],
    },
  },

  stagioni: {
    nomi: {
      primavera: 'Northern spring',
      estate: 'Northern summer',
      autunno: 'Northern autumn',
      inverno: 'Northern winter',
    },
    // With 0 whole days: the 24 h from the instant can fall on two calendar days, so there is no "day of the event".
    menoDiUnGiorno: (stagione: string, evento: 'equinozio' | 'solstizio') =>
      `${stagione}, less than a day after the ${evento === 'equinozio' ? 'equinox' : 'solstice'}`,
    dopo: (stagione: string, giorni: number, evento: 'equinozio' | 'solstizio') =>
      `${stagione}, ${plurale(giorni, 'day', 'days')} after the ${evento === 'equinozio' ? 'equinox' : 'solstice'}`,
  },

  fonti: {
    titolo: 'Sources and methods',
    accuratezza: 'Accuracy',
    accuratezzaProgetto: 'Design values: they will be replaced by the results of the validation.',
    accuratezzaMisurata: (data: string) => `Values measured in the validation of ${data}.`,
    colonneAccuratezza: { modello: 'Model', grandezza: 'Quantity', valore: 'Value', soglia: 'Tolerance' },
    daMisurare: 'to be measured',
    riferimenti: 'References',
    strumenti: 'Tools, builds and services',
  },
};

/** Sections of the "Sources and methods" window. */
export const FONTI_METODI_SEZIONI: readonly { titolo: string; paragrafi: readonly string[] }[] = [
  {
    titolo: 'Scale and representation',
    paragrafi: [
      'Distances and sizes are to scale, with no enlargement of the bodies and no compression of distances. Markers show the position, not the size.',
      'The scene is heliocentric, in the frame of the J2000 ecliptic and equinox; the rotation from the ICRF uses the obliquity of 84,381.448″, as JPL Horizons does. Positions are geometric and instantaneous, with no light time or aberration: the light time shown in the info card is for information only.',
    ],
  },
  {
    titolo: 'Time and calendar',
    paragrafi: [
      'Until 4 October 1582 the Julian calendar is used, proleptic before 45 BC; from 15 October 1582 the Gregorian calendar, as in the JPL Horizons manual. Years BC are historical, with no year zero. The conversion between date and Julian day follows Meeus (1998, ch. 7) with the integer part rounded down.',
      'The instant is entered in UT (UT1) or, in the advanced options, in TT; an optional fixed time offset allows local time to be used, without daylight saving time. TT = UT1 + ΔT; TDB coincides with TT to within 2 ms.',
      'ΔT: before astronomical year −720 (721 BC) the parabola of the Horizons manual, joined to the table; from year −720 to 2019 the S15.2020 spline (Morrison, Stephenson, Hohenkerk and Zawilski 2021); from 2020 the IERS EOP 20 C04 values; beyond the last datum, extrapolation with the tidal curvature of Stephenson, Morrison and Hohenkerk (2016).',
      'Differences from JPL Horizons: in the future Horizons keeps ΔT constant, with a difference reaching 28.6 s in 2120; before 1950 the Horizons ΔT exceeds that of the adopted sources by about 76 s in 721 BC and about 1,510 s in 10000 BC (0.015 times the uncertainty at that date). Positions in TT are not affected.',
      'Uncertainty of ΔT: until 1200 the maximum of 0.8·u² s, with u = (year − 1825)/100 (Morrison and Stephenson 2004), and, before astronomical year −500, the model of Huber (2000), about 28.6 hours in 10000 BC; from 1200 to 1900, interpolating in the logarithm, 31.25 s in 1200, about 20 s from 1300 to 1600 (Espenak and Meeus 2006) and, in the telescopic era, 5 s in 1700, 1 s in 1800 and 0.1 s in 1900 (Stephenson and Houlden 1986, reported by Espenak and Meeus 2006); in the measured period the difference of the model from the IERS EOP 20 C04 daily series (with the S15.2020 table 0.45 s in 1962-1971, also adopted before 1962 in agreement with the historical USNO table, and 0.11 s from 1972 to 2019; 0.002 s with the IERS values); after the last IERS value the maximum of the Huber model and the drift due to the excess length of day in the last year (0.54 ms per day). With the instant in UT it enters the reliability of the positions.',
    ],
  },
  {
    titolo: 'Planets and Pluto',
    paragrafi: [
      'JPL ephemeris DE441 (Park et al. 2021), the only one covering the whole interval. States are converted to equinoctial elements (Broucke and Cefola 1972), sampled at a constant step and interpolated with 8-point Lagrange polynomials.',
      'The centre of the Earth is derived from the Earth-Moon barycentre with the EMRAT mass ratio of DE441; the other planetary centres are obtained by subtracting from the barycentre the contribution of the satellites in the catalogue.',
    ],
  },
  {
    titolo: 'Moon',
    paragrafi: [
      'Meeus series (ch. 47, truncation of ELP 2000-82B by Chapront-Touzé and Chapront) with corrections of the arguments estimated against DE441 and interpolated with Hermite splines every 10 years. The change to the J2000 ecliptic uses the precession of Vondrák, Capitaine and Wallace (2011). Orientation with the Cassini laws.',
    ],
  },
  {
    titolo: 'Satellites',
    paragrafi: [
      'Precessing ellipse per record, fitted to the JPL satellite SPK kernels (mar099, jup365, jup347, sat441, ura184, nep097, nep098, nep105, plu060 and, where they exist, the long kernels); Dysnomia with the Keplerian orbit of Holler, Grundy, Buie and Noll (2021). The JPL mean elements are not used.',
      'Outside the coverage of the kernels a secular extrapolation is used: the error grows with the distance from the observed arc, also because of the unconstrained tidal acceleration (Lainey et al. 2009).',
      'Reliability measures the angular error seen from the planet. The distance figures also take into account the radial error of the records with respect to the kernels: up to 0.8 % of the semi-major axis for Himalia, Hyperion and Phoebe (95,311 km for Phoebe).',
      'The orbital elements in the info card refer to the F plane of the satellite, the mean plane of the orbit (Laplace plane) estimated from the kernels. In the secular extrapolation the F plane of regular satellites follows the rotation pole of the planet (Archinal et al. 2018), because their Laplace plane follows the equator, which precesses (Tremaine, Touma and Namouni 2009); before 1600 the pole is extrapolated and indicative. The offset between the F plane and the equator stays that at the limit of the kernel coverage: up to 0.94° for Deimos. Triton and Proteus (the pole of Neptune varies only because of Triton: Jacobson 2009), Iapetus and the irregular satellites have a fixed F plane.',
    ],
  },
  {
    titolo: 'Small bodies',
    paragrafi: [
      'Asteroids, comets, centaurs, TNOs and interstellar objects: JPL Horizons SPK of the current solution in the 1600-2121 window; sb441-n16 file for the 16 largest asteroids (Farnocchia 2021); per-apparition records for periodic comets.',
      'Before the window, backward numerical integration with ASSIST (Holman et al. 2023) on the DE441 dynamical model, with non-gravitational forces according to Marsden, Sekanina and Yeomans (1973). The uncertainty is estimated with clones from the SBDB covariance and with model variants; where it exceeds 90° the position is not shown.',
      'Before astronomical year −7999 the attraction of the 16 largest asteroids is switched off, because sb441-n16 does not cover that period; the resulting difference is included in the reliability. The DT delay of the non-gravitational force (2I/Borisov, 3I/ATLAS, 46P, 67P, 81P, 103P) is not modelled by ASSIST: it matters only before 1600, far from the Sun.',
      'Representation tolerance of the data: in the 1600-2121 window the maximum of 500 km and 10⁻⁷ times the distance from the Sun; from 2001 BC to 1600 the maximum of 10⁻³ times the distance (about 3.4′) and one twentieth of the estimated error; before 2001 BC the maximum of 10⁻² times the distance (about 34′) and one twentieth of the estimated error. The tolerance is added to the estimated error: before 1600 the reliability of small bodies is at most “good”.',
      'Changes of source and of record (different apparitions of comets) produce position jumps within the estimated error at that instant. Declared exception: at perihelion on 18 December 1680, at 0.0062 au from the Sun, C/1680 V1 departs by up to 759 km from the source (1.52 times the tolerance), because the minimum data step, 1/64 of a day, does not follow the perihelion passage.',
      'Orbital elements in the info card and drawn orbit: heliocentric within 50 au of the Sun, at any eccentricity; beyond that, barycentric (Sun plus the planetary systems of DE441). At the perihelion of near-parabolic comets the barycentric conic does not describe the motion, because the Sun departs from the barycentre.',
    ],
  },
  {
    titolo: 'Orientation and rotation',
    paragrafi: [
      'Poles and rotations from Archinal et al. (2018) with the 2019 correction. Earth: mean pole of Vondrák et al. (2011) and Earth rotation angle (IERS Conventions 2010); nutation and polar motion are neglected.',
      'Outside the 1600-2121 interval the poles and phases of the Archinal et al. (2018) model are indicative, for all the bodies that use it; for the giant planets the long-term rotation phase is arbitrary. Hyperion has chaotic rotation: its orientation is indicative. With the instant in TT the rotation of the Earth is undetermined in longitude when the uncertainty of ΔT exceeds 6 hours (until about 4595 BC), because the UT time is as uncertain as ΔT; with the instant in UT the rotation angle is fixed and the uncertainty of ΔT enters the reliability of the positions.',
      'Without an orientation model (irregular satellites, Hyperion, Nix, Hydra, Dysnomia and small bodies absent from the report of Archinal et al. 2018, such as Arrokoth) the axes of the body are fixed and aligned with the J2000 ecliptic by convention, rotation is not represented and the “Rotation axes” layer does not draw their axis. For Phoebe the pole of Archinal et al. (2018) gives period and direction of rotation in the info card, not the orientation in the scene.',
    ],
  },
  {
    titolo: 'Reliability',
    paragrafi: [
      'For each body and instant: ε_tot = √(ε_model² + ε_ΔT²). ε_model is 2″ for the planets, 60″ plus the effect of tidal acceleration for the Moon (which is therefore never “precise”), and derives from fitting, sources, extrapolation and clones for satellites and small bodies. ε_ΔT is the angular motion of the body around the primary in the time σ(ΔT); it is zero with the instant in TT.',
      'Levels: precise up to 1′; good up to 1°; approximate up to 10°; indicative up to 90°; beyond that, undeterminable (no marker). Colour is never the only signal: each level has text, a bar icon and a shape.',
      'The figures of distances, speeds and coordinates of the text view follow the estimated error; for moons the error of the planet is added, except for the distance of the Moon from Earth. The osculating elements in the info card derive from the interpolated series or, for the Moon and satellites, from the state; for planets they are those of the system barycentre (for Earth, of the Earth-Moon barycentre), as the reference row states. The figures follow uncertainties estimated by comparison with Horizons (for planets 1·10⁻⁴ relative on a; for small bodies also the error of the interpolated velocity, up to 0.53 m/s, which matters for nearly radial trajectories); with an undetermined orbit shape at least 5 % on a, 0.05 on e and 5° on i. With the shape determined the uncertainty of e does not exceed |1 − e| times the relative uncertainty of q and a added in quadrature, because e = 1 − q/a: near-parabolic orbits stay on the side of 1 indicated by the period or by the hyperbolic orbit; with an uncertain shape, if the rounded value does not distinguish ellipse from hyperbola, the info card shows “≈ 1 (near-parabolic)”, and “undeterminable” if the uncertainty exceeds 1 and does not exclude the other side of 1. The coloured bands of the ruler use the mean angular velocity of the orbit, independent of the data in memory.',
    ],
  },
  {
    titolo: 'Physical data',
    paragrafi: [
      'GM from DE440/441 (Sun, Mercury, Venus, Earth, Moon and the asteroids without an updated SBDB value) and from the satellite kernels (Mars, Jupiter, Saturn, Uranus, Neptune, Pluto and satellites); radii, poles and rotations from Archinal et al. (2018); solar radius from IAU 2015 Resolution B3 (Prša et al. 2016); satellite radii from JPL Planetary Satellite Physical Parameters; V-band geometric albedo of the planets from Mallama, Krobusek and Pavlov (2017) and of Pluto from Buratti et al. (2015); small bodies from SBDB, excluding the values that SBDB declares unverified, or from primary sources (stellar occultations, shape models, radiometry, photometry, satellite orbits, probes). Where the datum is missing the info card says “unknown”; values carry the figures of the source or of their uncertainty. For bodies with a represented rotation the period is that of the drawn model. The rotation period is an absolute value: “retrograde” means an axis tilted by more than 90° to the orbital plane (Venus, Uranus, Pluto and, among the bodies with a known pole, Lutetia, 19P, Ida, Itokawa, Šteins, Bennu, Ryugu, Didymos, Arrokoth, Hektor and Phoebe); poles of small bodies from Archinal et al. (2018), from SBDB or from the literature; for bodies without a known pole the direction is not stated.',
    ],
  },
  {
    titolo: 'Stars and maps',
    paragrafi: [
      'Stars of the Bright Star Catalogue, 5th revised edition (Hoffleit and Warren 1991), with Hipparcos astrometry in the new reduction (van Leeuwen 2007), space motion to the date and colour from the temperature estimated from B-V (Ballesteros 2012). The 24 stars without a B-V index have the colour of a 5,800 K star.',
      'Surface maps in the public domain from NASA and USGS, unless otherwise stated in the info card. Gaps in the observations are filled in (Triton, southern hemispheres of Pluto and Charon) and flagged in the info card. Saturn, Uranus and Neptune: maps by Solar System Scope (CC BY 4.0 licence, https://creativecommons.org/licenses/by/4.0/), resampled and realigned in longitude. No map for unobserved bodies.',
    ],
  },
  {
    titolo: 'Limits',
    paragrafi: [
      'The motion of the Sun around the barycentre is not shown. The rings have a schematic profile; the shadow of the planet on the rings of Saturn is represented, the shadows of the rings on the planet are not. No body casts a shadow on another: solar and lunar eclipses and shadows of satellites on planets are not represented. The irregularities of leap years between 45 BC and 8 AD are not modelled.',
      'Remote Julian dates are out of step with the seasons (77 days in 10000 BC compared with the proleptic Gregorian calendar): the season indicator uses the apparent longitude of the Sun on the true ecliptic and equinox of date, with annual aberration and IAU 2000B nutation (McCarthy and Luzum 2003), like the official instants of equinoxes and solstices: from 2023 to 2026 they agree with those of the U.S. Naval Observatory within 1 minute. Days are counted from the instant of the event.',
      'The catalogue includes 112 bodies chosen with the criteria of the project; for trans-Neptunian objects and for centaurs the selection is not exhaustive.',
    ],
  },
  {
    titolo: 'Licences and credits',
    paragrafi: [
      'Code: three.js, © 2010-2025 three.js authors, MIT licence; full text of the licence in the file assets/LICENZE.txt distributed with the site. Data generation: jplephem (MIT); ASSIST and REBOUND (GPL-3.0), used only to produce the data and not distributed with the site.',
      'Data: JPL/NASA; USGS mosaics (public domain or free use with credit to the authors, as stated in the info card); VizieR catalogues with citation; non-commercial educational use. Maps of Saturn, Uranus and Neptune: Solar System Scope, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), resampled and realigned in longitude. Fonts: Source Sans 3, Source Serif 4, Source Code Pro (SIL Open Font License 1.1).',
    ],
  },
];

/** Rows of the accuracy table (values in valoriValidazione.ts). */
export const VOCI_ACCURATEZZA: Readonly<Record<IdAccuratezza, { modello: string; grandezza: string }>> = {
  pianeti: { modello: 'Planets and Pluto (DE441, 8-point Lagrange)', grandezza: 'Maximum heliocentric angular error' },
  emb: { modello: 'Earth-Moon barycentre', grandezza: 'Maximum position error per sampling step' },
  luna: { modello: 'Moon (Meeus with corrections)', grandezza: 'Maximum and rms geocentric error; distance' },
  satelliti: { modello: 'Satellites (precessing ellipse)', grandezza: 'Fit in the kernel window; radial error' },
  'piccoli-corpi': { modello: 'Small bodies', grandezza: 'Interpolation against the source (C/1680 V1 at perihelion: declared exception)' },
  'delta-t': { modello: 'ΔT and its uncertainty', grandezza: 'Check values (astronomical years)' },
  'rotazione-terrestre': { modello: 'Earth rotation', grandezza: 'Sidereal time against ERFA (astronomical years)' },
};

/** Bibliographic references. */
export const RIFERIMENTI: readonly string[] = [
  'Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441, The Astronomical Journal 161:105, doi:10.3847/1538-3881/abd414.',
  'Archinal, B. A. et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015, Celestial Mechanics and Dynamical Astronomy 130:22, doi:10.1007/s10569-017-9805-5; erratum 131:61 (2019), doi:10.1007/s10569-019-9925-1.',
  'Vondrák, J., Capitaine, N., Wallace, P. (2011), New precession expressions, valid for long time intervals, Astronomy & Astrophysics 534, A22, doi:10.1051/0004-6361/201117274; corrigendum A&A 541, C1 (2012).',
  "Stephenson, F. R., Morrison, L. V., Hohenkerk, C. Y. (2016), Measurement of the Earth's rotation: 720 BC to AD 2015, Proc. R. Soc. A 472:20160404, doi:10.1098/rspa.2016.0404.",
  'Morrison, L. V., Stephenson, F. R., Hohenkerk, C. Y., Zawilski, M. (2021), Addendum 2020, Proc. R. Soc. A 477:20200776, doi:10.1098/rspa.2020.0776; table S15.2020 (HMNAO).',
  "Morrison, L. V., Stephenson, F. R. (2004), Historical values of the Earth's clock error ΔT and the calculation of eclipses, Journal for the History of Astronomy 35, 327-336.",
  'Huber, P. J. (2000), Modeling the length of day and extrapolating the rotation of the Earth, in Astronomical Amusements (Bonoli, De Meis, Panaino eds.), Rome.',
  'Stephenson, F. R., Houlden, M. A. (1986), Atlas of Historical Eclipse Maps, Cambridge University Press; Espenak, F., Meeus, J. (2006), Five Millennium Canon of Solar Eclipses, NASA/TP-2006-214141.',
  'McCarthy, D. D., Luzum, B. J. (2003), An abridged model of the precession-nutation of the celestial pole, Celestial Mechanics and Dynamical Astronomy 85, 37-49.',
  'Petit, G., Luzum, B. (eds.) (2010), IERS Conventions (2010), IERS Technical Note 36.',
  'IERS, EOP 20 C04 series; USNO, tables of TAI - UTC (tai-utc.dat) and of historical ΔT (historic_deltat.data).',
  'Chapront-Touzé, M., Chapront, J. (1983), The lunar ephemeris ELP 2000, A&A 124, 50; (1988), ELP 2000-85, A&A 190, 342.',
  'Williams, J. G., Boggs, D. H. (2016), Secular tidal changes in lunar orbit and Earth rotation, Celestial Mechanics and Dynamical Astronomy 126, 89.',
  'Broucke, R. A., Cefola, P. J. (1972), On the equinoctial orbit elements, Celestial Mechanics 5, 303, doi:10.1007/BF01228432.',
  'Holman, M. J. et al. (2023), ASSIST: an ephemeris-quality test-particle integrator, Planetary Science Journal 4:69.',
  'Rein, H., Liu, S.-F. (2012), REBOUND, A&A 537, A128; Rein, H., Spiegel, D. S. (2015), IAS15, MNRAS 446, 1424; Pham, D., Rein, H., Spiegel, D. S. (2024), Open Journal of Astrophysics 7.',
  'Marsden, B. G., Sekanina, Z., Yeomans, D. K. (1973), Comets and nongravitational forces V, The Astronomical Journal 78, 211.',
  'Farnocchia, D. (2021), JPL IOM 392R-21-005 (sb441-n16).',
  'Yeomans, D. K., Kiang, T. (1981), The long-term motion of comet Halley, MNRAS 197, 633.',
  'Muñoz-Gutiérrez, M. A., Reyes-Ruiz, M., Pichardo, B. (2015), Chaotic dynamics of comet 1P/Halley, MNRAS 447, 3775.',
  'Lainey, V. et al. (2009), Strong tidal dissipation in Io and Jupiter from astrometric observations, Nature 459, 957.',
  'Tremaine, S., Touma, J., Namouni, F. (2009), Satellite dynamics on the Laplace surface, AJ 137, 3706, doi:10.1088/0004-6256/137/3/3706.',
  'Jacobson, R. A. (2009), AJ 137, 4322, doi:10.1088/0004-6256/137/5/4322; Jacobson, R. A. (2022), AJ 164:199; Jacobson, R. A., Park, R. S. (2025), AJ 169:65; Brozović, M., Jacobson, R. A. (2024), AJ 167:256; Brozović, M., Jacobson, R. A., Park, R. S. (2025), AJ 170:42.',
  'Holler, B. J., Grundy, W. M., Buie, M. W., Noll, K. S. (2021), Icarus 355, 114130; Brown, M. E., Butler, B. J. (2023), The Planetary Science Journal 4:193, doi:10.3847/PSJ/ace52a.',
  'Wisdom, J., Peale, S. J., Mignard, F. (1984), The chaotic rotation of Hyperion, Icarus 58, 137; Thomas, P. C. et al. (2007), Nature 448, 50.',
  'Prša, A. et al. (2016), Nominal values for selected solar and planetary quantities: IAU 2015 Resolution B3, AJ 152:41.',
  'Nimmo, F. et al. (2017), Icarus 287, 12; Sicardy, B. et al. (2011), Nature 478, 493; Szakáts, R. et al. (2023), A&A 669, L3, doi:10.1051/0004-6361/202245234; Ortiz, J. L. et al. (2012), Nature 491, 566; Ortiz, J. L. et al. (2017), Nature 550, 219; Ragozzine, D., Brown, M. E. (2009), AJ 137, 4766, doi:10.1088/0004-6256/137/6/4766; Kiss, C. et al. (2019), Icarus 334, 3; Pereira, C. L. et al. (2023), A&A 673, L4; Kilic, Y. et al. (2026), A&A 707, A70; Pál, A. et al. (2012), A&A 541, L6; Fornasier, S. et al. (2013), A&A 555, A15; Lellouch, E. et al. (2013), A&A 557, A60; Müller, T., Lellouch, E., Fornasier, S. (2020), Trans-Neptunian objects and Centaurs at thermal wavelengths, in The Trans-Neptunian Solar System, Elsevier, 153-181, doi:10.1016/B978-0-12-816490-7.00007-2 (arXiv:1905.07158); Vilenius, E. et al. (2012), A&A 541, A94, doi:10.1051/0004-6361/201118743; Spencer, J. R. et al. (2020), Science 367, eaay3999; Meech, K. J. et al. (2017), Nature 552, 378; Micheli, M. et al. (2018), Nature 559, 223; Jewitt, D. et al. (2020), ApJL 888:L23; Jewitt, D. et al. (2025), ApJL 990:L2.',
  "Morgado, B. E. et al. (2021), A&A 652, A141; Rommel, F. L. et al. (2023), A&A 678, A167; Daly, R. T. et al. (2023), Nature 616, 443; Thomas, P. C. et al. (2013), Icarus 222, 550; A'Hearn, M. F. et al. (2011), Science 332, 1396; Collyer, C. et al. (2025), The Planetary Science Journal 6, 270; Pätzold, M. et al. (2016), Nature 530, 63; Fujiwara, A. et al. (2006), Science 312, 1330; Brown, M. E. et al. (2010), AJ 139, 2700; Braga-Ribas, F. et al. (2025), Phil. Trans. R. Soc. A 383, 20240200; Fang, J. et al. (2012), AJ 144, 70; Vernazza, P. et al. (2020), Nature Astronomy 4, 136; Hanuš, J. et al. (2020), A&A 633, A65; Berthier, J. et al. (2014), Icarus 239, 118; Kiss, C. et al. (2016), MNRAS 457, 2908; Weaver, H. A. et al. (2016), Science 351, aae0030; Pilcher, F., Mottola, S., Denk, T. (2012), Icarus 219, 741.",
  'Ortiz, J. L. et al. (2003), A&A 409, L13; Pál, A. et al. (2016), AJ 151, 117; Buie, M. W. et al. (2015), AJ 149, 113; Grundy, W. M. et al. (2018), Icarus 305, 198; Marchis, F. et al. (2014), ApJL 783, L37; Brown, M. E. et al. (2021), The Planetary Science Journal 2, 170.',
  'Mallama, A., Krobusek, B., Pavlov, H. (2017), Comprehensive wide-band magnitudes and albedos for the planets, Icarus 282, 19-33, doi:10.1016/j.icarus.2016.09.023; Buratti, B. J. et al. (2015), ApJL 804, L6; Fornasier, S. et al. (2015), A&A 583, A30; Harmon, J. K. et al. (1997), Science 278, 1921.',
  'Hoffleit, D., Warren, W. H. Jr. (1991), The Bright Star Catalogue, 5th Revised Ed. (Preliminary Version), VizieR V/50; van Leeuwen, F. (2007), Validation of the new Hipparcos reduction, A&A 474, 653 (VizieR I/311); ESA (1997), The Hipparcos Catalogue (VizieR I/239).',
  'Ballesteros, F. J. (2012), New insights into black bodies, EPL 97, 34008; CIE 015:2018, Colorimetry, 4th ed.; Wyman, C., Sloan, P.-P., Shirley, P. (2013), Simple analytic approximations to the CIE XYZ color matching functions, Journal of Computer Graphics Techniques 2(2), 1.',
  'Machado, G. M., Oliveira, M. M., Fernandes, L. A. F. (2009), IEEE TVCG 15(6), 1291; Sharma, G., Wu, W., Dalal, E. N. (2005), Color Research & Application 30(1), 21.',
  'IAU (2012), Resolution B2 on the re-definition of the astronomical unit of length; IAU (2006), Resolution B5.',
  'W3C (2024), Web Content Accessibility Guidelines (WCAG) 2.2; W3C, WAI-ARIA Authoring Practices Guide.',
  'Meeus, J. (1998), Astronomical Algorithms, 2nd ed., Willmann-Bell.',
  'BIPM (2019), The International System of Units, 9th ed., section 5.4.4.',
];

/** Tools and services. */
export const STRUMENTI: readonly string[] = [
  'JPL Horizons, manual and API; JPL Small-Body Database API; Minor Planet Center, Identifier API; IAU Comet-Naming Guidelines.',
  'JPL Planetary Physical Parameters; Planetary Satellite Physical Parameters; astrodynamic constants.',
  'NAIF, generic SPK kernels of planets and satellites.',
  'PDS Ring-Moon Systems Node: tables of the rings of Saturn and Uranus.',
  'USGS Astrogeology, planetary mosaics; NASA SVS 4720; NASA Photojournal PIA07782; NASA Blue Marble Next Generation.',
  'VizieR (doi:10.26093/cds/vizier); ERFA, used as a reference in the tests.',
];
