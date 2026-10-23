// Testi visibili dell'interfaccia (RNF8, § 11.14 di docs/PROGETTO.md). Ogni stringa mostrata
// all'utente o letta dalle tecnologie assistive è qui. Nessun carattere U+2014.

import type { LivelloVisivo } from '../app/store';
import type { CategoriaCorpo } from '../data/catalogTypes';
import type { Livello } from '../ephem/types';
import type { UnitaPasso } from '../time/steps';
import type { IdAccuratezza } from './valoriValidazione';
import { formatIntero } from './format';

export const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;

/** Mesi abbreviati a tre lettere, per le tacche del regolo (§ 11.14). */
export const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'] as const;

/** 0 = lunedì (§ 6.1, T4); in minuscolo (§ 11.14). */
export const GIORNI_SETTIMANA = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const;

/** Nomi propri che vogliono l'articolo determinativo nelle preposizioni articolate. */
const ARTICOLI_NOMI: Readonly<Record<string, 'il' | 'la'>> = { Terra: 'la', Luna: 'la', Sole: 'il' };

/** "di Giove", "della Terra", "del Sole". */
export function diNome(nome: string): string {
  const a = ARTICOLI_NOMI[nome];
  return a === undefined ? `di ${nome}` : a === 'la' ? `della ${nome}` : `del ${nome}`;
}

/** "a Giove", "alla Terra", "al Sole". */
export function aNome(nome: string): string {
  const a = ARTICOLI_NOMI[nome];
  return a === undefined ? `a ${nome}` : a === 'la' ? `alla ${nome}` : `al ${nome}`;
}

/** "su Giove", "sulla Terra", "sul Sole". */
export function suNome(nome: string): string {
  const a = ARTICOLI_NOMI[nome];
  return a === undefined ? `su ${nome}` : a === 'la' ? `sulla ${nome}` : `sul ${nome}`;
}

/** Davanti a una data che inizia con 8 o 11 l'articolo si elide: "all'8 marzo", "all'11 febbraio". */
function elisaData(data: string): boolean {
  return /^(8|11)(\D|$)/.test(data);
}

/** "al 19 ottobre 2026", "all'8 marzo 2024". */
export function alData(data: string): string {
  return elisaData(data) ? `all'${data}` : `al ${data}`;
}

/** "dal 1° gennaio 10000 a.C.", "dall'11 febbraio 2024". */
export function dalData(data: string): string {
  return elisaData(data) ? `dall'${data}` : `dal ${data}`;
}

/** Davanti a un anno letto con la vocale iniziale (8, 80, 800, 8000, 11) l'articolo si elide: "dall'8000 a.C.". */
function elisoAnno(anno: string): boolean {
  return /^(8|11(\D|$))/.test(anno);
}

/** "dal 1550", "dall'8000 a.C.". */
export function dalAnno(anno: string): string {
  return elisoAnno(anno) ? `dall'${anno}` : `dal ${anno}`;
}

/** "al 2120", "all'800 a.C.". */
export function alAnno(anno: string): string {
  return elisoAnno(anno) ? `all'${anno}` : `al ${anno}`;
}

export const UNITA = {
  km: 'km',
  ua: 'UA',
  uaEsteso: 'unità astronomica (simbolo IAU: au)',
  kmS: 'km/s',
  s: 's',
  min: 'min',
  h: 'h',
  giorni: 'giorni',
  giorno: 'giorno',
  anni: 'anni',
  anno: 'anno',
  gradi: '°',
  primi: '′',
  secondi: '″',
  milioniKm: 'milioni di km',
  milioneKm: 'milione di km',
  kmCubiS2: 'km³/s²',
  mCubiS2: 'm³/s²',
  aC: 'a.C.',
  dC: 'd.C.',
  ut: 'UT',
  tt: 'TT',
  utc: 'UTC',
  nonDisponibile: 'n.d.',
  infinito: '∞',
  circa: '≈',
  piuMeno: '±',
} as const;

export const NOMI_CATEGORIE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'Sole',
  pianeta: 'Pianeta',
  'pianeta-nano': 'Pianeta nano',
  luna: 'Luna',
  interstellare: 'Oggetto interstellare',
  cometa: 'Cometa',
  centauro: 'Centauro',
  tno: 'TNO',
  asteroide: 'Asteroide',
};

export const NOMI_CATEGORIE_PLURALE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'Sole',
  pianeta: 'Pianeti',
  'pianeta-nano': 'Pianeti nani',
  luna: 'Lune',
  interstellare: 'Interstellari',
  cometa: 'Comete',
  centauro: 'Centauri',
  tno: 'TNO',
  asteroide: 'Asteroidi',
};

/** Categorie con nome plurale femminile, per l'accordo dei participi ("Lune nascoste"). */
const CATEGORIE_FEMMINILI: ReadonlySet<CategoriaCorpo> = new Set(['luna', 'cometa']);

/** Participio plurale accordato con la categoria: "mostrati"/"mostrate", "nascosti"/"nascoste". */
function participioCategoria(c: CategoriaCorpo, radice: 'mostrat' | 'nascost'): string {
  return radice + (CATEGORIE_FEMMINILI.has(c) ? 'e' : 'i');
}

/** Testi della scena 3D (contatore delle lune, anelli di distanza): opzione `testi` di creaScena. */
export const TESTI_SCENA_IT = {
  contatoreLune: (n: number): string => (n === 1 ? '+1 luna' : `+${n} lune`),
  anelloDistanza: (ua: number): string => `${formatIntero(ua)}\u00a0UA`,
};

/** URI delle licenze che chiedono il riferimento al testo della licenza (CC BY 4.0, § 3(a)(1)(C)). */
export const URI_LICENZE: Readonly<Record<string, string>> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

/** Prima occorrenza per esteso (§ 11.14); altrove TNO con abbr. */
export const TNO_ESTESO = 'Oggetti transnettuniani (TNO)';
export const TNO_SIGLA = 'TNO';
export const TNO_TITOLO = 'oggetti transnettuniani';

/** Nomi delle categorie dentro una frase ("anche asteroide", "Mostra le comete"). */
export const NOMI_CATEGORIE_IN_FRASE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'Sole',
  pianeta: 'pianeta',
  'pianeta-nano': 'pianeta nano',
  luna: 'luna',
  interstellare: 'oggetto interstellare',
  cometa: 'cometa',
  centauro: 'centauro',
  tno: 'TNO',
  asteroide: 'asteroide',
};

export const NOMI_CATEGORIE_PLURALE_IN_FRASE: Readonly<Record<CategoriaCorpo, string>> = {
  sole: 'il Sole',
  pianeta: 'i pianeti',
  'pianeta-nano': 'i pianeti nani',
  luna: 'le lune',
  interstellare: 'gli oggetti interstellari',
  cometa: 'le comete',
  centauro: 'i centauri',
  tno: 'i TNO',
  asteroide: 'gli asteroidi',
};

export const NOMI_LIVELLI: Readonly<Record<Livello, string>> = {
  precisa: 'Precisa',
  buona: 'Buona',
  approssimata: 'Approssimata',
  indicativa: 'Indicativa',
  'non-determinabile': 'Non determinabile',
};

export const NOMI_UNITA_PASSO: Readonly<Record<UnitaPasso, string>> = {
  minuto: 'minuto',
  ora: 'ora',
  giorno: 'giorno',
  mese: 'mese',
  anno: 'anno',
  secolo: 'secolo',
  millennio: 'millennio',
};

/** Complemento "di un minuto", "di un'ora", ... per le etichette dei pulsanti di passo. */
const DI_UNA_UNITA: Readonly<Record<UnitaPasso, string>> = {
  minuto: 'di un minuto',
  ora: "di un'ora",
  giorno: 'di un giorno',
  mese: 'di un mese',
  anno: 'di un anno',
  secolo: 'di un secolo',
  millennio: 'di un millennio',
};

/** Velocità a gradini (§ 6.6): etichetta breve e lunga, nello stesso ordine di VELOCITA_S. */
export const VELOCITA_ETICHETTE = [
  { breve: '1 s/s', lunga: '1 secondo al secondo' },
  { breve: '1 min/s', lunga: '1 minuto al secondo' },
  { breve: '1 h/s', lunga: "1 ora al secondo" },
  { breve: '1 giorno/s', lunga: '1 giorno al secondo' },
  { breve: '1 settimana/s', lunga: '1 settimana al secondo' },
  { breve: '1 mese/s', lunga: '1 mese al secondo' },
  { breve: '1 anno/s', lunga: '1 anno al secondo' },
  { breve: '10 anni/s', lunga: '10 anni al secondo' },
  { breve: '100 anni/s', lunga: '100 anni al secondo' },
  { breve: '1 000 anni/s', lunga: '1 000 anni al secondo' },
] as const;

export const NOMI_LIVELLI_VISIVI: Readonly<Record<LivelloVisivo, string>> = {
  orbite: 'Orbite',
  etichette: 'Etichette',
  marcatori: 'Marcatori',
  anelliDistanza: "Anelli di distanza sull'eclittica",
  grigliaEclittica: "Griglia dell'eclittica J2000",
  eclitticaData: 'Eclittica della data',
  assiRotazione: 'Assi di rotazione',
  anelli: 'Anelli di Saturno e Urano',
  stelle: 'Stelle',
  barraScala: 'Barra di scala',
};

/** Identificatori dei preset di vista (§ 11.3); la tabella è PRESET_VISTA in src/ui/scala.ts. */
export type IdPreset =
  | 'terra-luna'
  | 'plutone-caronte'
  | 'sistema-giove'
  | 'sistema-saturno'
  | 'sistema-interno'
  | 'fascia-principale'
  | 'pianeti-giganti'
  | 'fascia-kuiper'
  | 'sedna'
  | 'interstellari';

export const NOMI_PRESET: Readonly<Record<IdPreset, string>> = {
  'terra-luna': 'Terra e Luna',
  'plutone-caronte': 'Plutone e Caronte',
  'sistema-giove': 'Sistema di Giove',
  'sistema-saturno': 'Sistema di Saturno',
  'sistema-interno': 'Sistema interno',
  'fascia-principale': 'Fascia principale e Giove',
  'pianeti-giganti': 'Pianeti giganti',
  'fascia-kuiper': 'Fascia di Kuiper',
  sedna: 'Sedna e comete lontane',
  interstellari: 'Oggetti interstellari',
};

/** Tasti di una scorciatoia: alternative, ciascuna con i tasti da premere insieme (Maiusc + N). */
export type TastiScorciatoia = readonly (readonly string[])[];

/** Parti del testo dei tasti: { tasto } per ogni tasto, stringhe per i connettori ("+", ", ", " e "). */
export function partiTasti(t: TastiScorciatoia): (string | { tasto: string })[] {
  const out: (string | { tasto: string })[] = [];
  t.forEach((combinazione, i) => {
    if (i > 0) out.push(i === t.length - 1 ? ' e ' : ', ');
    combinazione.forEach((tasto, j) => {
      if (j > 0) out.push(' + ');
      out.push({ tasto });
    });
  });
  return out;
}

/** Testo continuo dei tasti: "Maiusc + frecce", "PagSu e PagGiù". */
export function testoTasti(t: TastiScorciatoia): string {
  return partiTasti(t)
    .map((p) => (typeof p === 'string' ? p : p.tasto))
    .join('');
}

export const T = {
  salta: 'Salta ai controlli temporali',
  chiudi: 'Chiudi',

  trova: {
    etichetta: 'Trova',
    segnaposto: 'Trova un corpo',
    risultati: 'Risultati della ricerca',
    nessuno: (q: string) => `Nessun corpo per «${q}». Prova con il nome inglese, il numero (es. 433) o la designazione.`,
    conteggio: (n: number) => (n === 1 ? '1 risultato' : `${n} risultati`),
    lunaDi: (pianeta: string) => `luna ${diNome(pianeta)}`,
    apriCatalogo: 'Catalogo',
    apriCatalogoEsteso: 'Apri il catalogo dei corpi',
    istruzioni: 'Frecce su e giù per scegliere, Invio per selezionare, Esc per chiudere.',
  },

  barra: {
    livelli: 'Livelli',
    tabella: 'Tabella',
    tabellaEsteso: 'Vista testuale',
    // Nome del pulsante: contiene l'etichetta visibile "Tabella" (WCAG 2.5.3).
    tabellaNome: 'Tabella: vista testuale',
    fonti: 'Fonti e metodi',
    impostazioni: 'Impostazioni',
    menu: 'Menu',
    vista: 'Vista',
    strumenti: 'Strumenti',
  },

  mappa: {
    descrizioneRuolo: 'mappa 3D',
    etichetta: (vista: string, fuoco: string) => `Mappa 3D: ${vista}, fuoco ${suNome(fuoco)}`,
    istruzioni:
      'Frecce: ruota. Maiusc e frecce: sposta. + e −, PagSu e PagGiù: zoom. Invio: seleziona il corpo più vicino al centro. N e Maiusc+N: corpo visibile successivo o precedente. F: inquadra. Esc: deseleziona. Tab: esci dalla mappa.',
    vistaAmpiezza: (ampiezza: string) => `vista ampia ${ampiezza}`,
    nessunCorpoAlCentro: 'Nessun corpo vicino al centro della vista.',
    nessunCorpoVisibile: 'Nessun corpo visibile.',
  },

  legenda: {
    scala: 'Distanze e dimensioni in scala reale. I simboli indicano la posizione, non la grandezza.',
    barraScalaDidascalia: 'alla distanza del corpo a fuoco',
    simboli: 'Simboli dei corpi',
    affidabilita: 'Affidabilità della posizione',
    selezione: 'Corpo selezionato',
    fasce:
      "Nella panoramica del regolo temporale la fascia di ogni livello è alta come le barre piene dell'icona: intera per «precisa», assente per «non determinabile».",
    descrizioniLivelli: {
      precisa: 'marcatore pieno',
      buona: 'marcatore pieno',
      approssimata: 'marcatore pieno, avviso ambra',
      indicativa: "marcatore cavo, arco d'incertezza, orbita tratteggiata",
      'non-determinabile': 'nessun marcatore',
    } as Readonly<Record<Livello, string>>,
  },

  livelli: {
    titolo: 'Livelli visivi',
    eclitticaDataNota:
      "Linea sul cielo di fondo, entro 1,6° dal piano delle orbite: con la vista iniziale resta sopra il bordo. Per vederla abbassa la vista verso il piano: Freccia giù sulla mappa, almeno due volte, o trascinamento verso l'alto.",
  },

  distanze: {
    titolo: 'Distanza della vista',
    regolo: 'Ampiezza della vista',
    valore: (v: string) => `Vista ampia ${v}`,
    avvicina: 'Avvicina',
    allontana: 'Allontana',
    limiteMinimo: 'Distanza minima della vista raggiunta.',
    limiteMassimo: 'Distanza massima della vista raggiunta.',
    inquadraEsteso: 'Inquadra il corpo selezionato',
    preset: 'Viste',
    presetEsteso: 'Viste predefinite',
  },

  console: {
    titolo: 'Controlli temporali',
    modificaData: (data: string) => `Data e ora: ${data}. Modifica`,
    adesso: 'Adesso',
    adessoEsteso: "Vai all'istante attuale",
    calendario: (c: 'giuliano' | 'gregoriano') => `calendario ${c}`,
    prolettico: (data: string) => `gregoriano prolettico: ${data}`,
    deltaT: 'ΔT',
    deltaTEsteso: 'ΔT, differenza tra TT e UT',
    deltaTValore: (valore: string, sigma: string) => `${valore} ± ${sigma}`,
    oraIncerta: (sigmaOre: string, gradi: string) =>
      `Ora incerta di ±${sigmaOre}\u00a0h: la Luna può trovarsi ${gradi}° più avanti o indietro.`,
    unitaPasso: 'Unità del passo',
    indietro: (u: UnitaPasso) => `Indietro ${DI_UNA_UNITA[u]}`,
    avanti: (u: UnitaPasso) => `Avanti ${DI_UNA_UNITA[u]}`,
    riproduci: 'Riproduci',
    pausa: 'Pausa',
    direzione: "Riproduci all'indietro",
    velocita: 'Velocità',
    regolo: 'Regolo temporale',
    regoloPanoramico: "Panoramica dell'intervallo",
    regoloValore: (data: string, calendario: string) => `${data}, calendario ${calendario}`,
    regoloScala: (ampiezza: string) => `Ampiezza del regolo: ${ampiezza}`,
    regoloScalaMinore: 'Regolo: intervallo più breve',
    regoloScalaMaggiore: 'Regolo: intervallo più ampio',
    attesaDati: 'Riproduzione in attesa dei dati.',
    /** Descrizione testuale delle fasce del regolo panoramico (§ 7.8.2, § 11.4.3): livelli e anni. */
    bandeAffidabilita: (nome: string, intervalli: string) => `Affidabilità ${diNome(nome)} nell'intervallo: ${intervalli}.`,
    bandaIntervallo: (livello: string, da: string, a: string) => `${livello} ${dalAnno(da)} ${alAnno(a)}`,
    bandaTitolo: (livello: string, da: string, a: string) => `${livello}: ${dalAnno(da)} ${alAnno(a)}`,
    velocitaSegui: "Con «Segui l'ora attuale» la data avanza di 1 secondo al secondo: velocità e verso non si cambiano.",
  },

  editor: {
    titolo: 'Modifica data e ora',
    giorno: 'Giorno',
    mese: 'Mese',
    anno: 'Anno',
    era: 'Era',
    aC: 'a.C.',
    dC: 'd.C.',
    aCEsteso: 'avanti Cristo',
    dCEsteso: 'dopo Cristo',
    ora: 'Ora',
    minuti: 'Minuti',
    separatoreOra: ':',
    vai: 'Vai',
    avanzate: 'Opzioni avanzate',
    annoAstronomico: 'Anno astronomico',
    jdUT: 'JD (UT)',
    jdTT: 'JD (TT)',
    ingressoTT: "Inserisci l'istante in TT",
    offset: 'Offset orario fisso',
    offsetUsa: 'Usa un offset orario fisso',
    offsetEtichetta: (s: string) => `${s} (fisso)`,
    offsetNota: "Nessuna ora legale. L'offset non si applica all'ingresso in TT.",
    rigaProlettica: 'Mostra la data nel gregoriano prolettico',
    istruzioni:
      "Invio o uscita dal gruppo per confermare. L'anno va da 1 a 10000; con un offset negativo l'intervallo inizia il 31 dicembre 10001\u00a0a.C. Scegli l'era a.C. o d.C.",
  },

  validazione: {
    ANNO_ZERO: "L'anno 0 non esiste: dopo l'1 a.C. viene l'1 d.C.",
    RIFORMA_1582: 'Nel 1582 si passò dal 4 al 15 ottobre: i giorni dal 5 al 14 non esistono.',
    vaiAl4: 'Vai al 4 ottobre',
    vaiAl15: 'Vai al 15 ottobre',
    GIORNO_INESISTENTE: (giorno: string, mese: string, anno: string, calendario: string) =>
      `Il ${giorno} ${mese} ${anno} non esiste nel calendario ${calendario}.`,
    FUORI_INTERVALLO: 'Sono disponibili le date dal 1° gennaio 10000 a.C. al 31 dicembre 2120 (UT).',
    fuoriIntervalloOffset: (fuso: string, inizio: string, fine: string) => `In ${fuso}: ${dalData(inizio)} ${alData(fine)}.`,
    fuoriIntervalloTT: (inizio: string, fine: string) => `In TT: ${dalData(inizio)} ${alData(fine)}.`,
    campoMancante: {
      giorno: 'Inserisci il giorno.',
      mese: 'Scegli il mese.',
      anno: "Inserisci l'anno.",
      era: "Scegli l'era: a.C. o d.C.",
      ora: "Inserisci l'ora.",
      minuto: 'Inserisci i minuti.',
      secondo: 'Inserisci i secondi.',
      calendario: 'Calendario non valido.',
    },
    ANNO_NON_VALIDO: "Inserisci un anno intero da 1 a 10000 (10001\u00a0a.C. con un offset negativo).",
    ERA_NON_VALIDA: "Scegli l'era: a.C. o d.C.",
    MESE_NON_VALIDO: 'Scegli un mese da gennaio a dicembre.',
    GIORNO_NON_VALIDO: 'Inserisci un giorno da 1 a 31.',
    ORA_NON_VALIDA: "Inserisci un'ora da 0 a 23.",
    MINUTO_NON_VALIDO: 'Inserisci i minuti da 0 a 59.',
    SECONDO_NON_VALIDO: 'Inserisci i secondi da 0 a 59.',
    CALENDARIO_NON_VALIDO: 'Calendario non valido.',
    CALENDARIO_INCOERENTE: 'Il calendario indicato non è quello in vigore alla data.',
  },

  limiti: {
    inferiore: (data: string, locale: string | null) =>
      `Raggiunto il limite inferiore: ${data}${locale === null ? '' : ` (${locale})`}`,
    superiore: (data: string, locale: string | null) =>
      `Raggiunto il limite superiore: ${data}${locale === null ? '' : ` (${locale})`}`,
    locale: (testo: string, fuso: string) => `${testo} in ${fuso}`,
  },

  annunci: {
    selezionato: (nome: string) => `Corpo selezionato: ${nome}`,
    selezionatoTra: (nome: string, i: number, n: number) => `Corpo selezionato: ${nome} (${i} di ${n} qui)`,
    deselezionato: 'Nessun corpo selezionato',
    fuoco: (nome: string) => `Vista centrata ${suNome(nome)}`,
    fuocoSenzaPosizione: (nome: string) => `Posizione ${diNome(nome)} non determinabile a questa data`,
    data: (data: string) => data,
    riproduzioneFerma: (data: string) => `Riproduzione in pausa: ${data}`,
    riproduzioneFermaErrore: (data: string) => `Riproduzione in pausa: dati non caricati. ${data}`,
    velocita: (v: string) => `Velocità ${v}`,
    vistaTestualeAperta: 'Vista testuale aperta',
    vistaTestualeChiusa: 'Vista testuale chiusa',
    collegamentoCopiato: 'Collegamento copiato.',
    collegamentoNonCopiato: (url: string) => `Copia non riuscita. Collegamento: ${url}`,
    filtro: (categoria: CategoriaCorpo, attivo: boolean) =>
      `${NOMI_CATEGORIE_PLURALE[categoria]} ${participioCategoria(categoria, attivo ? 'mostrat' : 'nascost')}`,
    livello: (nome: string, attivo: boolean) => `${nome}: ${attivo ? 'attivo' : 'disattivato'}`,
    scorciatoie: (attive: boolean) => `Scorciatoie da tastiera ${attive ? 'attive' : 'disattivate'}`,
    seguiOra: (attivo: boolean) => `Segui l'ora attuale: ${attivo ? 'attivo' : 'disattivato'}`,
    /** Data o limite annunciati da un'azione che ha spento "Segui l'ora attuale" (un solo annuncio, § 11.9). */
    conSeguiDisattivato: (testo: string) => `${testo}. Segui l'ora attuale: disattivato`,
    preset: (nome: string) => `Vista: ${nome}`,
  },

  scheda: {
    riduci: 'Riduci la scheda',
    espandi: 'Espandi la scheda',
    chiudi: 'Chiudi la scheda',
    inquadra: 'Inquadra',
    copiaCollegamento: 'Copia collegamento',
    collegamento: 'Collegamento',
    copiaNonRiuscita: 'Copia non riuscita: seleziona e copia il collegamento dal campo.',
    leggiPosizione: 'Leggi posizione',
    nomeUfficiale: 'Nome ufficiale',
    numero: 'Numero',
    anche: (categorie: string) => `anche ${categorie}`,
    ora: 'Ora',
    distanzaSole: 'Distanza dal Sole',
    distanzaTerra: 'Distanza dalla Terra',
    tempoLuce: (t: string) => `luce: ${t}`,
    velocitaEliocentrica: 'Velocità eliocentrica',
    velocitaRispetto: (nome: string) => `Velocità rispetto ${aNome(nome)}`,
    velocitaRispettoSistema: (nome: string) => `Velocità rispetto al baricentro del sistema ${diNome(nome)}`,
    motoRapido: 'Moto troppo rapido per essere rappresentato a questa velocità.',
    orbita: 'Orbita',
    riferimentoElio: 'eclittica J2000, eliocentrici',
    riferimentoBari: 'eclittica J2000, baricentrici',
    riferimentoElioTerraLuna: 'eclittica J2000, eliocentrici del baricentro Terra-Luna',
    riferimentoElioSistema: (nome: string) => `eclittica J2000, eliocentrici del baricentro del sistema ${diNome(nome)}`,
    riferimentoPlaneto: (nome: string) => `rispetto ${aNome(nome)}, piano di riferimento F`,
    riferimentoPlanetoEclittica: (nome: string) => `rispetto ${aNome(nome)}, eclittica J2000`,
    riferimentoSistema: (nome: string) => `rispetto al baricentro del sistema ${diNome(nome)}, piano di riferimento F`,
    riferimentoSistemaEclittica: (nome: string) => `rispetto al baricentro del sistema ${diNome(nome)}, eclittica J2000`,
    riferimento: 'Riferimento',
    osculanti: (data: string) => `Elementi osculanti ${alData(data)}`,
    /** Sola data con la scala di tempo: "15 agosto 10000 a.C. (UT)". */
    dataInScala: (data: string, scala: string) => `${data} (${scala})`,
    elementi: {
      a: { simbolo: 'a', nome: 'semiasse maggiore' },
      q: { simbolo: 'q', nome: 'distanza al pericentro' },
      e: { simbolo: 'e', nome: 'eccentricità' },
      i: { simbolo: 'i', nome: 'inclinazione' },
      nodo: { simbolo: 'Ω', nome: 'longitudine del nodo ascendente' },
      argPeri: { simbolo: 'ω', nome: 'argomento del pericentro' },
      M: { simbolo: 'M', nome: 'anomalia media' },
      P: { simbolo: 'P', nome: 'periodo' },
      T: { simbolo: 'T', nome: 'passaggio al pericentro' },
      vInf: { simbolo: 'v∞', nome: "velocità all'infinito" },
    },
    iperbolica: 'Orbita iperbolica: periodo non definito',
    // Eccentricità che arrotondata non resta dal lato di 1 dell'orbita (forma incerta), o con incertezza oltre 1.
    eQuasiParabolica: '≈\u00a01 (quasi parabolica)',
    eNonDeterminabile: 'non determinabile',
    orbitaNonDeterminabile: 'Orbita non determinabile.',
    formaIncerta: "Forma dell'orbita incerta: semiasse maggiore ed eccentricità sono approssimati.",
    orbitaNonDisponibile: 'Elementi non disponibili a questa data.',
    fisica: 'Caratteristiche fisiche',
    raggio: 'Raggio medio',
    raggi: 'Semiassi',
    gm: 'GM',
    rotazione: 'Periodo di rotazione',
    albedo: 'Albedo geometrica',
    retrograda: '(retrograda)',
    nonNoto: 'non noto',
    fonteDi: (fonte: string) => `fonte: ${fonte}`,
    fonteAffidabilita: 'Fonte e affidabilità',
    sorgente: 'Sorgente delle effemeridi',
    soluzione: 'Soluzione orbitale',
    estrazione: (d: string) => `estratta il ${d}`,
    epsModello: 'Errore del modello',
    epsDeltaT: 'Errore da ΔT',
    epsTotale: 'Errore totale stimato',
    epsDeltaTNullo: "nullo: l'istante è in TT",
    erroreOltre90: '>\u00a090°',
    texture: 'Mappa della superficie',
    /** Licenza con URI e modifiche dichiarate (CC BY 4.0, § 3(a)(1)(B-C)). */
    licenzaModificata: (licenza: string, uri: string) => `${licenza}, ${uri}; mappa ricampionata e riallineata in longitudine`,
    areeNonOsservate: {
      nessuna: '',
      parziali: 'Alcune aree non osservate sono riempite.',
      'emisfero-sud': "L'emisfero sud non è stato osservato: la mappa lo riempie.",
    },
    rotazioneIndeterminata: "Con l'istante in TT la rotazione terrestre è indeterminata in longitudine a questa data: l'ora UT è incerta di oltre 6 ore.",
    nascostoDaFiltri: (categoria: CategoriaCorpo) =>
      `${NOMI_CATEGORIE_PLURALE[categoria]} ${participioCategoria(categoria, 'nascost')} dai filtri: il corpo è mostrato perché selezionato.`,
    mostraCategoria: (categoria: string) => `Mostra ${categoria}`,
    caricamento: 'Dati in caricamento.',
    fuoriCopertura: 'Dati non disponibili a questa data.',
    /** Distanze non applicabili omesse: dal Sole per il Sole, dalla Terra per la Terra (§ 11.9). */
    posizione: (nome: string, sole: string | null, terra: string | null) =>
      `${nome}: ${[sole === null ? null : `${sole} dal Sole`, terra === null ? null : `${terra} dalla Terra`].filter((x) => x !== null).join(', ')}.`,
  },

  sorgenti: {
    sole: 'origine del sistema di riferimento',
    de441: 'DE441 (Park et al. 2021)',
    luna: 'serie di Meeus con correzioni da DE441',
    // Prefissi della descrizione della fonte nel catalogo; le parole già presenti nella descrizione si omettono.
    'spk-satellitare': 'kernel satellitare JPL',
    kepleriana: 'orbita kepleriana',
    secolare: 'estrapolazione secolare',
    'spk-horizons': 'JPL Horizons, soluzione',
    'record-dastcom': 'record DASTCOM',
    'sb441-n16': 'sb441-n16 (Farnocchia 2021)',
    assist: 'integrazione ASSIST',
    nessuna: 'nessuna sorgente a questa data',
  },

  affidabilita: {
    precisa: (sorgente: string) => `Posizione da ${sorgente}, errore stimato inferiore a 1′.`,
    buona: (gradi: string, volte: string) =>
      `Errore stimato fino a ${gradi}°, circa ${volte} volte il diametro apparente della Luna piena.`,
    buonaMinima: (gradi: string) => `Errore stimato fino a ${gradi}°, meno di un decimo del diametro apparente della Luna piena.`,
    approssimata: (gradi: string) => `La posizione lungo l'orbita può differire di ${gradi}°.`,
    indicativa: "La forma dell'orbita è attendibile, la posizione lungo l'orbita no.",
    indicativaFormaIncerta: "La posizione lungo l'orbita non è attendibile e la forma dell'orbita è incerta.",
    nonDeterminabile: 'Posizione non determinabile a questa data.',
    orbitaNonDeterminabile: 'Orbita non determinabile.',
    badge: (livello: string) => `Affidabilità: ${livello}`,
    sole: "Il Sole è l'origine del sistema di riferimento eliocentrico.",
  },

  catalogo: {
    titolo: 'Catalogo',
    filtri: 'Mostra',
    lune: (pianeta: string, n: number) => `${n === 1 ? 'Luna' : 'Lune'} ${diNome(pianeta)}`,
    nascosto: 'nascosto dai filtri',
    nonDeterminabile: 'non determinabile',
    chiudi: 'Chiudi il catalogo',
  },

  testuale: {
    titolo: 'Vista testuale',
    didascalia: (data: string, calendario: string) =>
      `Posizioni ${alData(data)} (calendario ${calendario}). Coordinate eliocentriche, eclittica J2000.`,
    colonne: {
      corpo: 'Corpo',
      categoria: 'Categoria',
      sole: 'Distanza dal Sole',
      terra: 'Distanza dalla Terra',
      coordinate: 'Longitudine e latitudine eclittiche J2000',
      affidabilita: 'Affidabilità',
    },
    aggiorna: 'Aggiorna',
    chiudi: 'Chiudi la vista testuale',
    nonAggiornata: 'Tabella ferma durante la riproduzione: si aggiorna alla pausa.',
    conteggio: (n: number, totale: number) => (n === totale ? `${n} corpi` : `${n} corpi di ${totale} (filtri attivi)`),
    coordinate: (lon: string, lat: string) => `λ ${lon}, β ${lat}`,
    nonDisponibile: 'non disponibile',
    inCaricamento: 'in caricamento',
    nonApplicabile: 'non applicabile',
    regione: 'Tabella delle posizioni',
  },

  messaggi: {
    webgl: 'Il browser non supporta la grafica 3D necessaria (WebGL2). Puoi usare la vista testuale.',
    contestoPerso: 'Grafica 3D sospesa, ripristino in corso. La vista testuale resta disponibile.',
    blocco: (intervallo: string) => `Impossibile caricare i dati per ${intervallo}${intervallo.endsWith('.') ? '' : '.'}`,
    luna: 'Impossibile caricare i dati della Luna.',
    affidabilita: 'Impossibile caricare le stime di affidabilità: i livelli mostrati sono provvisori.',
    riprova: 'Riprova',
    caricamento: (intervallo: string) => `Caricamento dati per ${intervallo}`,
    caricamentoGenerico: 'Caricamento dati',
    caricamentoConcluso: 'Dati caricati.',
    intervallo: (da: string, a: string) => `il periodo ${da}-${a}`,
    slugSconosciuto: (slug: string) => `Nessun corpo corrisponde a «${slug}»: il collegamento è stato ignorato.`,
    chiudiMessaggio: 'Chiudi il messaggio',
    benvenuto: [
      'Mappa del Sistema solare in scala reale, dal 10000 a.C. al 2120.',
      'Scegli la data nella console in basso; cerca un corpo con Trova o selezionalo nella mappa.',
      "La scheda di ogni corpo indica fonti e affidabilità della posizione.",
    ],
    benvenutoTitolo: 'Benvenuto',
    leggiBenvenuto: 'Leggi la nota di benvenuto',
    chiudiBenvenuto: 'Chiudi la nota di benvenuto',
  },

  avvio: {
    titolo: 'Sistema solare 3D',
    caricamento: 'Caricamento dei dati di base',
    errore: 'Impossibile caricare i dati di base della mappa.',
    erroreAvvio: 'Impossibile avviare la mappa.',
  },

  foglio: {
    espandi: 'Espandi il pannello',
    riduci: 'Riduci il pannello',
    apriScheda: (nome: string) => `Apri la scheda ${diNome(nome)}`,
  },

  impostazioni: {
    titolo: 'Impostazioni',
    scorciatoie: 'Scorciatoie da tastiera globali',
    scorciatoieNota: 'Disattivale se usi un software di dettatura o un lettore di schermo con comandi a lettera singola.',
    elencoScorciatoie: 'Mostra le scorciatoie',
    rigaProlettica: 'Mostra la data nel gregoriano prolettico prima del 15 ottobre 1582',
    segui: "Segui l'ora attuale",
    seguiNota: "La data avanza con l'orologio del dispositivo.",
    benvenuto: 'Mostra di nuovo la nota di benvenuto',
    movimento: 'Le animazioni seguono la preferenza di sistema per il movimento ridotto.',
  },

  scorciatoie: {
    titolo: 'Scorciatoie da tastiera',
    globali: 'Ovunque, fuori dai campi di testo',
    mappa: 'Con il focus sulla mappa',
    regolo: 'Con il focus sul regolo temporale',
    disattivate: 'Le scorciatoie globali sono disattivate: riattivale in Impostazioni.',
    tasto: 'Tasto',
    azione: 'Azione',
    // Tasti di ogni voce: alternative, ciascuna con i tasti da premere insieme (un <kbd> per tasto, § 11.9).
    voci: {
      globali: [
        [[['/']], 'Vai al campo Trova'],
        [[['Spazio']], 'Avvia o ferma la riproduzione'],
        [[[','], ['.']], 'Passo indietro e avanti'],
        [[['['], [']']], 'Velocità minore e maggiore'],
        [[['?']], 'Elenco delle scorciatoie'],
        [[['T']], 'Vista testuale'],
      ],
      mappa: [
        [[['Frecce']], 'Ruota la vista'],
        [[['Maiusc', 'frecce']], 'Sposta la vista'],
        [[['+'], ['−'], ['PagSu'], ['PagGiù']], 'Avvicina e allontana'],
        [[['Invio']], 'Seleziona il corpo più vicino al centro'],
        [[['N'], ['Maiusc', 'N']], 'Corpo visibile successivo e precedente'],
        [[['F']], 'Inquadra'],
        [[['Esc']], 'Deseleziona'],
        [[['Tab']], 'Esci dalla mappa'],
      ],
      regolo: [
        [[['Frecce']], "Passo dell'unità scelta"],
        [[['Maiusc', 'frecce']], 'Dieci passi'],
        [[['PagSu'], ['PagGiù']], "Passo dell'unità superiore"],
        [[['Inizio'], ['Fine']], "Limiti dell'intervallo"],
      ],
    } as Readonly<Record<'globali' | 'mappa' | 'regolo', readonly (readonly [TastiScorciatoia, string])[]>>,
  },

  stagioni: {
    nomi: {
      primavera: 'Primavera boreale',
      estate: 'Estate boreale',
      autunno: 'Autunno boreale',
      inverno: 'Inverno boreale',
    },
    // Con 0 giorni interi: le 24 h dall'istante possono cadere in due giorni di calendario, quindi niente "giorno dell'evento".
    menoDiUnGiorno: (stagione: string, evento: 'equinozio' | 'solstizio') =>
      `${stagione}, meno di un giorno dopo ${evento === 'equinozio' ? "l'equinozio" : 'il solstizio'}`,
    dopo: (stagione: string, giorni: number, evento: 'equinozio' | 'solstizio') =>
      `${stagione}, ${giorni === 1 ? '1 giorno' : `${giorni} giorni`} dopo ${evento === 'equinozio' ? "l'equinozio" : 'il solstizio'}`,
  },

  fonti: {
    titolo: 'Fonti e metodi',
    accuratezza: 'Accuratezza',
    accuratezzaProgetto: 'Valori di progetto: saranno sostituiti dai risultati della validazione.',
    accuratezzaMisurata: (data: string) => `Valori misurati nella validazione del ${data}.`,
    colonneAccuratezza: { modello: 'Modello', grandezza: 'Grandezza', valore: 'Valore', soglia: 'Tolleranza' },
    daMisurare: 'da misurare',
    riferimenti: 'Riferimenti',
    strumenti: 'Strumenti, compilazioni e servizi',
  },
} as const;

/** Sezioni della finestra "Fonti e metodi" (§ 6-9, 16). */
export const FONTI_METODI_SEZIONI: readonly { titolo: string; paragrafi: readonly string[] }[] = [
  {
    titolo: 'Scala e rappresentazione',
    paragrafi: [
      'Distanze e dimensioni sono in scala reale, senza ingrandimenti dei corpi né compressione delle distanze. I marcatori indicano la posizione, non la grandezza.',
      "La scena è eliocentrica, nel sistema dell'eclittica e dell'equinozio J2000; la rotazione dall'ICRF usa l'obliquità di 84 381,448″, come JPL Horizons. Le posizioni sono geometriche e istantanee, senza tempo luce né aberrazione: il tempo luce indicato nella scheda è solo informativo.",
    ],
  },
  {
    titolo: 'Tempo e calendario',
    paragrafi: [
      'Fino al 4 ottobre 1582 si usa il calendario giuliano, prolettico prima del 45 a.C.; dal 15 ottobre 1582 il gregoriano, come nel manuale di JPL Horizons. Gli anni a.C. sono storici, senza anno zero. La conversione tra data e giorno giuliano segue Meeus (1998, cap. 7) con parte intera per difetto.',
      "L'istante si inserisce in UT (UT1) o, nelle opzioni avanzate, in TT; un offset orario fisso facoltativo permette di usare l'ora locale, senza ora legale. TT = UT1 + ΔT; TDB coincide con TT entro 2 ms.",
      "ΔT: prima dell'anno astronomico −720 (721 a.C.) la parabola del manuale di Horizons, raccordata alla tabella; dall'anno −720 al 2019 la spline S15.2020 (Morrison, Stephenson, Hohenkerk e Zawilski 2021); dal 2020 i valori IERS EOP 20 C04; oltre l'ultimo dato, l'estrapolazione con la curvatura mareale di Stephenson, Morrison e Hohenkerk (2016).",
      "Differenze da JPL Horizons: nel futuro Horizons tiene ΔT costante, con uno scarto che arriva a 28,6 s nel 2120; prima del 1950 il ΔT di Horizons supera quello delle fonti adottate di circa 76 s nel 721 a.C. e di circa 1 510 s nel 10000 a.C. (0,015 volte l'incertezza a quella data). Le posizioni in TT non ne risentono.",
      "Incertezza di ΔT: fino al 1200 il massimo tra 0,8·u² s, con u = (anno − 1825)/100 (Morrison e Stephenson 2004), e, prima dell'anno astronomico −500, il modello di Huber (2000), circa 28,6 ore nel 10000 a.C.; dal 1200 al 1900, con interpolazione nel logaritmo, 31,25 s nel 1200, circa 20 s dal 1300 al 1600 (Espenak e Meeus 2006) e, nell'era telescopica, 5 s nel 1700, 1 s nel 1800 e 0,1 s nel 1900 (Stephenson e Houlden 1986, riportati da Espenak e Meeus 2006); nel periodo misurato lo scarto del modello dalla serie giornaliera IERS EOP 20 C04 (con la tabella S15.2020 0,45 s nel 1962-1971, adottato anche prima del 1962 in accordo con la tabella storica dell'USNO, e 0,11 s dal 1972 al 2019; 0,002 s con i valori IERS); dopo l'ultimo valore IERS il massimo tra il modello di Huber e la deriva dovuta all'eccesso della durata del giorno nell'ultimo anno (0,54 ms al giorno). Con l'istante in UT entra nell'affidabilità delle posizioni.",
    ],
  },
  {
    titolo: 'Pianeti e Plutone',
    paragrafi: [
      "Effemeride JPL DE441 (Park et al. 2021), l'unica che copre l'intero intervallo. Gli stati sono convertiti in elementi equinoziali (Broucke e Cefola 1972), campionati a passo costante e interpolati con polinomi di Lagrange a 8 punti.",
      'Il centro della Terra si ricava dal baricentro Terra-Luna con il rapporto delle masse EMRAT di DE441; gli altri centri planetari sottraggono dal baricentro il contributo dei satelliti del catalogo.',
    ],
  },
  {
    titolo: 'Luna',
    paragrafi: [
      "Serie di Meeus (cap. 47, troncamento di ELP 2000-82B di Chapront-Touzé e Chapront) con correzioni degli argomenti stimate contro DE441 e interpolate con spline di Hermite ogni 10 anni. Il passaggio all'eclittica J2000 usa la precessione di Vondrák, Capitaine e Wallace (2011). Orientamento con le leggi di Cassini.",
    ],
  },
  {
    titolo: 'Satelliti',
    paragrafi: [
      "Ellisse precessante a record adattata ai kernel SPK satellitari di JPL (mar099, jup365, jup347, sat441, ura184, nep097, nep098, nep105, plu060 e, dove esistono, i kernel lunghi); Disnomia con l'orbita kepleriana di Holler, Grundy, Buie e Noll (2021). Gli elementi medi JPL non sono usati.",
      "Fuori dalla copertura dei kernel si usa un'estrapolazione secolare: l'errore cresce con la distanza dall'arco osservativo, anche per l'accelerazione mareale non vincolata (Lainey et al. 2009).",
      "L'affidabilità misura l'errore angolare visto dal pianeta. Le cifre delle distanze tengono conto anche dell'errore radiale dei record rispetto ai kernel: fino allo 0,8 % del semiasse maggiore per Imalia, Iperione e Febe (95 311 km per Febe).",
      "Gli elementi orbitali della scheda sono riferiti al piano F del satellite, il piano medio dell'orbita (piano di Laplace) stimato dai kernel. Nell'estrapolazione secolare il piano F dei satelliti regolari segue il polo di rotazione del pianeta (Archinal et al. 2018), perché il loro piano di Laplace segue l'equatore, che precessa (Tremaine, Touma e Namouni 2009); prima del 1600 il polo è estrapolato e indicativo. Lo scarto tra piano F ed equatore resta quello al limite della copertura dei kernel: fino a 0,94° per Deimos. Tritone e Proteo (il polo di Nettuno varia solo per effetto di Tritone: Jacobson 2009), Giapeto e i satelliti irregolari hanno il piano F fisso.",
    ],
  },
  {
    titolo: 'Piccoli corpi',
    paragrafi: [
      'Asteroidi, comete, centauri, TNO e oggetti interstellari: SPK di JPL Horizons della soluzione corrente nella finestra 1600-2121; file sb441-n16 per i 16 asteroidi maggiori (Farnocchia 2021); record per apparizione delle comete periodiche.',
      "Prima della finestra, integrazione numerica a ritroso con ASSIST (Holman et al. 2023) sul modello dinamico di DE441, con forze non gravitazionali secondo Marsden, Sekanina e Yeomans (1973). L'incertezza è stimata con cloni dalla covarianza di SBDB e con varianti di modello; dove supera 90° la posizione non è mostrata.",
      "Prima dell'anno astronomico −7999 l'attrazione dei 16 asteroidi maggiori è disattivata, perché sb441-n16 non copre quel periodo; lo scarto che ne deriva è incluso nell'affidabilità. Il ritardo DT della forza non gravitazionale (2I/Borisov, 3I/ATLAS, 46P, 67P, 81P, 103P) non è modellato da ASSIST: conta solo prima del 1600, lontano dal Sole.",
      "Tolleranza di rappresentazione dei dati: nella finestra 1600-2121 il massimo tra 500 km e 10⁻⁷ volte la distanza dal Sole; dal 2001 a.C. al 1600 il massimo tra 10⁻³ volte la distanza (circa 3,4′) e un ventesimo dell'errore stimato; prima del 2001 a.C. il massimo tra 10⁻² volte la distanza (circa 34′) e un ventesimo dell'errore stimato. La tolleranza è sommata all'errore stimato: prima del 1600 l'affidabilità dei piccoli corpi è al più «buona».",
      "I cambi di sorgente e di record (apparizioni diverse delle comete) producono salti di posizione entro l'errore stimato a quell'istante. Eccezione dichiarata: al perielio del 18 dicembre 1680, a 0,0062 UA dal Sole, C/1680 V1 si scosta fino a 759 km dalla sorgente (1,52 volte la tolleranza), perché il passo minimo dei dati, 1/64 di giorno, non segue il passaggio al perielio.",
      "Elementi orbitali della scheda e orbita disegnata: eliocentrici entro 50 UA dal Sole, a qualsiasi eccentricità; oltre, baricentrici (Sole più i sistemi planetari di DE441). Al perielio delle comete quasi paraboliche la conica baricentrica non descrive il moto, perché il Sole si scosta dal baricentro.",
    ],
  },
  {
    titolo: 'Orientamento e rotazione',
    paragrafi: [
      'Poli e rotazioni da Archinal et al. (2018) con la correzione del 2019. Terra: polo medio di Vondrák et al. (2011) e angolo di rotazione terrestre (IERS Conventions 2010); nutazione e moto del polo sono trascurati.',
      "Fuori dall'intervallo 1600-2121 poli e fasi del modello di Archinal et al. (2018) sono indicativi, per tutti i corpi che lo usano; per i pianeti giganti la fase di rotazione a lungo termine è arbitraria. Iperione ha rotazione caotica: il suo orientamento è indicativo. Con l'istante in TT la rotazione terrestre è indeterminata in longitudine quando l'incertezza di ΔT supera 6 ore (fino al 4595 a.C. circa), perché l'ora UT è incerta quanto ΔT; con l'istante in UT l'angolo di rotazione è fissato e l'incertezza di ΔT entra nell'affidabilità delle posizioni.",
      "Senza un modello di orientamento (satelliti irregolari, Iperione, Notte, Idra, Disnomia e piccoli corpi assenti dal rapporto di Archinal et al. 2018, come Arrokoth) gli assi del corpo sono fissi e allineati all'eclittica J2000 per convenzione, la rotazione non è rappresentata e il livello «Assi di rotazione» non ne disegna l'asse. Per Febe il polo di Archinal et al. (2018) dà periodo e verso della rotazione nella scheda, non l'orientamento nella scena.",
    ],
  },
  {
    titolo: 'Affidabilità',
    paragrafi: [
      "Per ogni corpo e istante: ε_tot = √(ε_modello² + ε_ΔT²). ε_modello vale 2″ per i pianeti, 60″ più l'effetto dell'accelerazione mareale per la Luna (che quindi non è mai «precisa»), e deriva da adattamento, sorgenti, estrapolazione e cloni per satelliti e piccoli corpi. ε_ΔT è il moto angolare del corpo attorno al primario nel tempo σ(ΔT); è nullo con l'istante in TT.",
      "Livelli: precisa fino a 1′; buona fino a 1°; approssimata fino a 10°; indicativa fino a 90°; oltre, non determinabile (nessun marcatore). Il colore non è mai l'unico segnale: ogni livello ha testo, icona a barre e forma.",
      "Le cifre delle distanze, delle velocità e delle coordinate della vista testuale seguono l'errore stimato; per le lune si somma l'errore del pianeta, salvo per la distanza della Luna dalla Terra. Gli elementi osculanti della scheda derivano dalle serie interpolate o, per Luna e satelliti, dallo stato; per i pianeti sono quelli del baricentro del sistema (per la Terra del baricentro Terra-Luna), come indica la riga del riferimento. Le cifre seguono incertezze stimate dal confronto con Horizons (per i pianeti 1·10⁻⁴ relativo su a; per i piccoli corpi anche l'errore della velocità interpolata, fino a 0,53 m/s, che conta per le traiettorie quasi radiali); con la forma dell'orbita non determinata almeno 5 % su a, 0,05 su e e 5° su i. Con la forma determinata l'incertezza di e non supera |1 − e| per quella relativa di q e a sommate in quadratura, perché e = 1 − q/a: le orbite quasi paraboliche restano dal lato di 1 indicato dal periodo o dall'orbita iperbolica; con la forma incerta, se il valore arrotondato non distingue ellisse e iperbole, la scheda indica «≈ 1 (quasi parabolica)», e «non determinabile» se l'incertezza supera 1 e non esclude l'altro lato di 1. Le fasce colorate del regolo usano la velocità angolare media dell'orbita, indipendente dai dati in memoria.",
    ],
  },
  {
    titolo: 'Dati fisici',
    paragrafi: [
      'GM da DE440/441 (Sole, Mercurio, Venere, Terra, Luna e gli asteroidi senza un valore SBDB aggiornato) e dai kernel satellitari (Marte, Giove, Saturno, Urano, Nettuno, Plutone e satelliti); raggi, poli e rotazioni da Archinal et al. (2018); raggio del Sole dalla Risoluzione IAU 2015 B3 (Prša et al. 2016); raggi dei satelliti da JPL Planetary Satellite Physical Parameters; albedo geometrica in banda V dei pianeti da Mallama, Krobusek e Pavlov (2017) e di Plutone da Buratti et al. (2015); piccoli corpi da SBDB, esclusi i valori che SBDB dichiara non verificati, o da fonti primarie (occultazioni stellari, modelli di forma, radiometria, fotometria, orbite dei satelliti, sonde). Dove il dato manca la scheda indica «non noto»; i valori hanno le cifre della fonte o della loro incertezza. Per i corpi con rotazione rappresentata il periodo è quello del modello disegnato. Il periodo di rotazione è in valore assoluto: «retrograda» indica un asse inclinato di oltre 90° sul piano dell\'orbita (Venere, Urano, Plutone e, tra i corpi con polo noto, Lutetia, 19P, Ida, Itokawa, Šteins, Bennu, Ryugu, Didymos, Arrokoth, Hektor e Febe); poli dei piccoli corpi da Archinal et al. (2018), da SBDB o dalla letteratura; per i corpi senza polo noto il verso non è indicato.',
    ],
  },
  {
    titolo: 'Stelle e mappe',
    paragrafi: [
      'Stelle del Bright Star Catalogue, 5ª ed. riveduta (Hoffleit e Warren 1991), con astrometria Hipparcos nella nuova riduzione (van Leeuwen 2007), moto spaziale alla data e colore dalla temperatura stimata da B-V (Ballesteros 2012). Le 24 stelle senza indice B-V hanno il colore di una stella di 5 800 K.',
      'Mappe delle superfici di pubblico dominio NASA e USGS, salvo diversa indicazione nella scheda. Le lacune delle osservazioni sono riempite (Tritone, emisferi sud di Plutone e Caronte) e segnalate nella scheda. Saturno, Urano e Nettuno: mappe di Solar System Scope (licenza CC BY 4.0, https://creativecommons.org/licenses/by/4.0/), ricampionate e riallineate in longitudine. Nessuna mappa per i corpi non osservati.',
    ],
  },
  {
    titolo: 'Limiti',
    paragrafi: [
      "Il moto del Sole attorno al baricentro non è mostrato. Gli anelli hanno un profilo schematico; l'ombra del pianeta sugli anelli di Saturno è rappresentata, le ombre degli anelli sul pianeta non sono rappresentate. Nessun corpo proietta ombra su un altro: eclissi di Sole e di Luna e ombre dei satelliti sui pianeti non sono rappresentate. Le irregolarità dei bisestili tra il 45 a.C. e l'8 d.C. non sono modellate.",
      "Le date giuliane remote sono sfasate rispetto alle stagioni (77 giorni nel 10000 a.C. rispetto al gregoriano prolettico): l'indicatore della stagione usa la longitudine apparente del Sole sull'eclittica e sull'equinozio veri della data, con aberrazione annua e nutazione IAU 2000B (McCarthy e Luzum 2003), come gli istanti ufficiali di equinozi e solstizi: dal 2023 al 2026 coincidono con quelli dello U.S. Naval Observatory entro 1 minuto. I giorni si contano dall'istante dell'evento.",
      'Il catalogo comprende 112 corpi scelti con i criteri del progetto; per gli oggetti transnettuniani e per i centauri la selezione non è esaustiva.',
    ],
  },
  {
    titolo: 'Licenze e attribuzioni',
    paragrafi: [
      'Codice: three.js, © 2010-2025 three.js authors, licenza MIT; testo integrale della licenza nel file assets/LICENZE.txt distribuito con il sito. Generazione dei dati: jplephem (MIT); ASSIST e REBOUND (GPL-3.0), usati solo per produrre i dati e non distribuiti con il sito.',
      'Dati: JPL/NASA; mosaici USGS (pubblico dominio o uso libero con citazione degli autori, come indicato nella scheda); cataloghi VizieR con citazione; uso divulgativo non commerciale. Mappe di Saturno, Urano e Nettuno: Solar System Scope, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), ricampionate e riallineate in longitudine. Caratteri: Source Sans 3, Source Serif 4, Source Code Pro (SIL Open Font License 1.1).',
    ],
  },
];

/** Righe della tabella di accuratezza (valori in valoriValidazione.ts). */
export const VOCI_ACCURATEZZA: Readonly<Record<IdAccuratezza, { modello: string; grandezza: string }>> = {
  pianeti: { modello: 'Pianeti e Plutone (DE441, Lagrange a 8 punti)', grandezza: 'Errore angolare eliocentrico massimo' },
  emb: { modello: 'Baricentro Terra-Luna', grandezza: 'Errore di posizione massimo per passo di campionamento' },
  luna: { modello: 'Luna (Meeus con correzioni)', grandezza: 'Errore geocentrico massimo e rms; distanza' },
  satelliti: { modello: 'Satelliti (ellisse precessante)', grandezza: 'Adattamento nella finestra dei kernel; errore radiale' },
  'piccoli-corpi': { modello: 'Piccoli corpi', grandezza: 'Interpolazione rispetto alla sorgente (C/1680 V1 al perielio: eccezione dichiarata)' },
  'delta-t': { modello: 'ΔT e sua incertezza', grandezza: 'Valori di controllo (anni astronomici)' },
  'rotazione-terrestre': { modello: 'Rotazione terrestre', grandezza: 'Tempo siderale contro ERFA (anni astronomici)' },
};

/** Riferimenti bibliografici (§ 16.1). */
export const RIFERIMENTI: readonly string[] = [
  'Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441, The Astronomical Journal 161:105, doi:10.3847/1538-3881/abd414.',
  'Archinal, B. A. et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015, Celestial Mechanics and Dynamical Astronomy 130:22, doi:10.1007/s10569-017-9805-5; correzione 131:61 (2019), doi:10.1007/s10569-019-9925-1.',
  'Vondrák, J., Capitaine, N., Wallace, P. (2011), New precession expressions, valid for long time intervals, Astronomy & Astrophysics 534, A22, doi:10.1051/0004-6361/201117274; corrigendum A&A 541, C1 (2012).',
  "Stephenson, F. R., Morrison, L. V., Hohenkerk, C. Y. (2016), Measurement of the Earth's rotation: 720 BC to AD 2015, Proc. R. Soc. A 472:20160404, doi:10.1098/rspa.2016.0404.",
  'Morrison, L. V., Stephenson, F. R., Hohenkerk, C. Y., Zawilski, M. (2021), Addendum 2020, Proc. R. Soc. A 477:20200776, doi:10.1098/rspa.2020.0776; tabella S15.2020 (HMNAO).',
  "Morrison, L. V., Stephenson, F. R. (2004), Historical values of the Earth's clock error ΔT and the calculation of eclipses, Journal for the History of Astronomy 35, 327-336.",
  'Huber, P. J. (2000), Modeling the length of day and extrapolating the rotation of the Earth, in Astronomical Amusements (Bonoli, De Meis, Panaino eds.), Roma.',
  'Stephenson, F. R., Houlden, M. A. (1986), Atlas of Historical Eclipse Maps, Cambridge University Press; Espenak, F., Meeus, J. (2006), Five Millennium Canon of Solar Eclipses, NASA/TP-2006-214141.',
  'McCarthy, D. D., Luzum, B. J. (2003), An abridged model of the precession-nutation of the celestial pole, Celestial Mechanics and Dynamical Astronomy 85, 37-49.',
  'Petit, G., Luzum, B. (eds.) (2010), IERS Conventions (2010), IERS Technical Note 36.',
  'IERS, serie EOP 20 C04; USNO, tabelle di TAI - UTC (tai-utc.dat) e di ΔT storico (historic_deltat.data).',
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
  'Meeus, J. (1998), Astronomical Algorithms, 2ª ed., Willmann-Bell.',
  'BIPM (2019), The International System of Units, 9ª ed., § 5.4.4.',
];

/** Strumenti e servizi (§ 16.2). */
export const STRUMENTI: readonly string[] = [
  'JPL Horizons, manuale e API; JPL Small-Body Database API; Minor Planet Center, Identifier API; IAU Comet-Naming Guidelines.',
  'JPL Planetary Physical Parameters; Planetary Satellite Physical Parameters; costanti astrodinamiche.',
  'NAIF, kernel generici SPK dei pianeti e dei satelliti.',
  'PDS Ring-Moon Systems Node: tabelle degli anelli di Saturno e Urano.',
  'USGS Astrogeology, mosaici planetari; NASA SVS 4720; NASA Photojournal PIA07782; NASA Blue Marble Next Generation.',
  'VizieR (doi:10.26093/cds/vizier); ERFA, usata come riferimento nei test.',
];
