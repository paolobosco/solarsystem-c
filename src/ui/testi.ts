// Testi visibili dell'interfaccia nella lingua scelta all'avvio (RNF8, § 11.14 di docs/PROGETTO.md). Unico modulo che
// importa insieme testi.it.ts e testi.en.ts: tutti gli altri importano da qui, con i tipi comuni (FormaTesti e
// derivati), così una chiave mancante in una lingua è un errore di compilazione. Il bundle resta un solo file.

import type { Wide } from './testi.en';
import * as en from './testi.en';
import * as it from './testi.it';
import { LINGUA } from './lingua';
import type { Lingua } from './lingua';

export type { FormaTesti } from './testi.en';
export type { IdPreset, TastiScorciatoia } from './testi.it';

const INSIEMI = { it, en } as const;

/** Parti dei testi che dipendono dalla lingua e servono al formattatore (src/ui/format.ts) per una lingua qualsiasi. */
export interface TestiFormato {
  MESI: Wide<typeof it.MESI>;
  MESI_BREVI: Wide<typeof it.MESI_BREVI>;
  UNITA: Wide<typeof it.UNITA>;
}

export function testiFormatoDi(lingua: Lingua): TestiFormato {
  const s = INSIEMI[lingua];
  return { MESI: s.MESI, MESI_BREVI: s.MESI_BREVI, UNITA: s.UNITA };
}

const S = INSIEMI[LINGUA];

export const MESI: Wide<typeof it.MESI> = S.MESI;
export const MESI_BREVI: Wide<typeof it.MESI_BREVI> = S.MESI_BREVI;
export const GIORNI_SETTIMANA: Wide<typeof it.GIORNI_SETTIMANA> = S.GIORNI_SETTIMANA;
export const UNITA: Wide<typeof it.UNITA> = S.UNITA;
export const NOMI_CATEGORIE = S.NOMI_CATEGORIE;
export const NOMI_CATEGORIE_PLURALE = S.NOMI_CATEGORIE_PLURALE;
export const NOMI_CATEGORIE_IN_FRASE = S.NOMI_CATEGORIE_IN_FRASE;
export const NOMI_CATEGORIE_PLURALE_IN_FRASE = S.NOMI_CATEGORIE_PLURALE_IN_FRASE;
export const NOMI_LIVELLI = S.NOMI_LIVELLI;
export const NOMI_UNITA_PASSO = S.NOMI_UNITA_PASSO;
export const NOMI_LIVELLI_VISIVI = S.NOMI_LIVELLI_VISIVI;
export const NOMI_PRESET = S.NOMI_PRESET;
export const VELOCITA_ETICHETTE: Wide<typeof it.VELOCITA_ETICHETTE> = S.VELOCITA_ETICHETTE;
export const URI_LICENZE = S.URI_LICENZE;
export const TNO_ESTESO: string = S.TNO_ESTESO;
export const TNO_SIGLA: string = S.TNO_SIGLA;
export const TNO_TITOLO: string = S.TNO_TITOLO;
export const partiTasti = S.partiTasti;
export const testoTasti = S.testoTasti;
export const T: en.FormaTesti = S.T;
export const TESTI_SCENA_BASE = S.TESTI_SCENA;
export const FONTI_METODI_SEZIONI = S.FONTI_METODI_SEZIONI;
export const VOCI_ACCURATEZZA = S.VOCI_ACCURATEZZA;
export const RIFERIMENTI = S.RIFERIMENTI;
export const STRUMENTI = S.STRUMENTI;
