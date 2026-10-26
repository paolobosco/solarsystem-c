// Messaggi di validazione delle date e dei limiti (§ 6.2, § 11.4.2, § 11.4.3 di docs/PROGETTO.md).
// Logica pura: dal codice di src/time/calendar.ts al testo di testi.ts.

import type { Affidabilita, FormaOrbita } from '../ephem/types';
import { JD_MAX_UT_EXCL, JD_MIN_UT, JD_ULTIMO_UT, jdToCalendarLocale } from '../time/calendar';
import { limiteRaggiunto } from '../time/steps';
import type { CampoData, DataCalendario, EsitoNonValido, LimiteIntervallo, ScalaTempo } from '../time/types';
import type { IngressoStagione } from './contrattoScena';
import { formatAnno, formatData, formatGiorno, formatGradiBreve, formatNumero, formatOffset, formatOra } from './format';
import type { BandaAffidabilita } from './regolo';
import { MESI, NOMI_LIVELLI, T, UNITA } from './testi';

export interface AzioneValidazione {
  etichetta: string;
  data: DataCalendario;
}

export interface MessaggioValidazione {
  testo: string;
  campo: CampoData | null;
  azioni: AzioneValidazione[];
}

/** Contesto dell'inserimento: campi digitati e modalità dell'ora. */
export interface ContestoValidazione {
  giorno?: number;
  mese?: number;
  /** Anno astronomico, se ricavabile. */
  anno?: number;
  /** Offset fisso attivo in minuti (null se disattivato). */
  offsetMinuti: number | null;
  scala: ScalaTempo;
  /** Limiti nella scala dell'ingresso; servono per il TT. */
  jdMin?: number;
  jdMaxEscl?: number;
}

/** "1° gennaio 10000 a.C. alle 02:00", "1 January 10000 BC at 02:00". */
function dataAlle(d: DataCalendario): string {
  return T.validazione.dataAlle(formatData(d), formatOra(d.ora, d.minuto));
}

/** Primo minuto intero non anteriore a jd: l'editor non ha i secondi, il limite inferiore annunciato deve essere accettato. */
export function minutoPerEccesso(jd: number): number {
  const m = (jd + 0.5) * 1440;
  return Math.ceil(m - 1e-6) / 1440 - 0.5;
}

/** Testo del messaggio per un esito non valido. */
export function messaggioValidazione(esito: EsitoNonValido, c: ContestoValidazione): MessaggioValidazione {
  const v = T.validazione;
  const campo = esito.campo;
  switch (esito.codice) {
    case 'ANNO_ZERO':
      return { testo: v.ANNO_ZERO, campo, azioni: [] };
    case 'RIFORMA_1582': {
      const azioni: AzioneValidazione[] = [];
      if (esito.riforma) {
        azioni.push({ etichetta: v.vaiAl4, data: esito.riforma.prima });
        azioni.push({ etichetta: v.vaiAl15, data: esito.riforma.dopo });
      }
      return { testo: v.RIFORMA_1582, campo, azioni };
    }
    case 'GIORNO_INESISTENTE': {
      const giorno = c.giorno !== undefined ? formatGiorno(c.giorno) : '';
      const mese = c.mese !== undefined ? (MESI[c.mese - 1] ?? '') : '';
      const anno = c.anno !== undefined ? formatAnno(c.anno) : '';
      const cal = esito.calendario ?? 'gregoriano';
      return { testo: v.GIORNO_INESISTENTE(giorno, mese, anno, cal), campo, azioni: [] };
    }
    case 'FUORI_INTERVALLO': {
      let testo: string = v.FUORI_INTERVALLO;
      if (c.scala === 'TT' && c.jdMin !== undefined && c.jdMaxEscl !== undefined) {
        const ini = jdToCalendarLocale(minutoPerEccesso(c.jdMin), 0);
        const fin = jdToCalendarLocale(c.jdMaxEscl - 1 / 86400, 0);
        testo += ' ' + v.fuoriIntervalloTT(dataAlle(ini), dataAlle(fin));
      } else if (c.offsetMinuti !== null && c.offsetMinuti !== 0) {
        const ini = jdToCalendarLocale(JD_MIN_UT, c.offsetMinuti);
        const fin = jdToCalendarLocale(JD_MAX_UT_EXCL - 1 / 86400, c.offsetMinuti);
        testo += ' ' + v.fuoriIntervalloOffset(formatOffset(c.offsetMinuti), dataAlle(ini), dataAlle(fin));
      }
      return { testo, campo, azioni: [] };
    }
    case 'CAMPO_MANCANTE':
      return { testo: v.campoMancante[campo ?? 'anno'], campo, azioni: [] };
    case 'ANNO_NON_VALIDO':
    case 'ERA_NON_VALIDA':
    case 'MESE_NON_VALIDO':
    case 'GIORNO_NON_VALIDO':
    case 'ORA_NON_VALIDA':
    case 'MINUTO_NON_VALIDO':
    case 'SECONDO_NON_VALIDO':
    case 'CALENDARIO_NON_VALIDO':
    case 'CALENDARIO_INCOERENTE':
      return { testo: v[esito.codice], campo, azioni: [] };
  }
}

export interface ContestoLimite {
  offsetMinuti: number | null;
  scala: ScalaTempo;
}

/**
 * Messaggio per il passo fermato al limite (§ 11.4.3): "Raggiunto il limite inferiore:
 * 1° gennaio 10000 a.C., 00:00 UT (02:00 in UTC+2)". jd è nella scala dell'ingresso.
 */
export function messaggioLimite(limite: LimiteIntervallo, jd: number, c: ContestoLimite): string {
  const scala = c.scala === 'TT' ? UNITA.tt : UNITA.ut;
  const d = jdToCalendarLocale(jd, 0);
  const principale = `${formatData(d)}, ${formatOra(d.ora, d.minuto)} ${scala}`;
  let locale: string | null = null;
  if (c.scala === 'UT' && c.offsetMinuti !== null && c.offsetMinuti !== 0) {
    const l = jdToCalendarLocale(jd, c.offsetMinuti);
    const fuso = formatOffset(c.offsetMinuti);
    const stessoGiorno = l.anno === d.anno && l.mese === d.mese && l.giorno === d.giorno;
    const testo = stessoGiorno ? formatOra(l.ora, l.minuto) : `${formatData(l)}, ${formatOra(l.ora, l.minuto)}`;
    locale = T.limiti.locale(testo, fuso);
  }
  return limite === 'inferiore' ? T.limiti.inferiore(principale, locale) : T.limiti.superiore(principale, locale);
}

/**
 * Vero se l'istante è ancora al limite segnalato (§ 6.6, § 11.4.3): l'avviso del limite resta solo in quel caso, così
 * Inizio e Fine del regolo, che portano al limite opposto, non lasciano un avviso in contrasto con la data.
 */
export function istanteAlLimite(limite: LimiteIntervallo, jd: number, l: { min: number; maxEscl: number }): boolean {
  return limiteRaggiunto(jd, { jdMin: l.min, jdMaxEscl: l.maxEscl }) === limite;
}

// --- Affidabilità (§ 11.8) e stagione (§ 11.4.3) ---

/** Diametro apparente medio della Luna piena, gradi: 2·atan(1737,4/384 400) (raggio IAU, distanza media). */
export const DIAMETRO_LUNA_GRADI = (2 * Math.atan(1737.4 / 384_400) * 180) / Math.PI;

/** Testo dell'affidabilità per livello (§ 11.8); `forma` decide la frase sull'orbita non determinabile. */
export function testoAffidabilita(
  aff: Pick<Affidabilita, 'livello' | 'epsTotale'>,
  sorgente: string,
  forma: FormaOrbita | null,
  sole = false,
): string {
  const A = T.affidabilita;
  if (sole) return A.sole;
  const gradi = (aff.epsTotale * 180) / Math.PI;
  switch (aff.livello) {
    case 'precisa':
      return A.precisa(sorgente);
    case 'buona': {
      const volte = gradi / DIAMETRO_LUNA_GRADI;
      // Sotto un decimo il confronto con la Luna piena perde significato ("0,0 volte").
      if (volte < 0.1) return A.buonaMinima(formatGradiBreve(gradi));
      return A.buona(formatGradiBreve(gradi), volte < 10 ? formatNumero(volte, 1) : formatNumero(volte, 0));
    }
    case 'approssimata':
      return A.approssimata(formatGradiBreve(gradi));
    case 'indicativa':
      // La frase dichiara attendibile la forma dell'orbita: con la forma non determinata non si può usare.
      return forma === null || forma === 'determinata' ? A.indicativa : A.indicativaFormaIncerta;
    case 'non-determinabile':
      return forma === 'determinata' ? A.nonDeterminabile : `${A.nonDeterminabile} ${A.orbitaNonDeterminabile}`;
  }
}

/** "Primavera boreale, 12 giorni dopo l'equinozio"; entro il primo giorno dall'istante "meno di un giorno dopo l'equinozio". */
export function testoStagione(s: IngressoStagione): string {
  const nome = T.stagioni.nomi[s.stagione];
  const g = Math.max(0, Math.floor(s.giorniDopo));
  return g === 0 ? T.stagioni.menoDiUnGiorno(nome, s.evento) : T.stagioni.dopo(nome, g, s.evento);
}

/**
 * "il periodo 1011-2011", "il periodo 3001 a.C.-2001 a.C." (anni del calendario applicato), con gli estremi limitati
 * all'intervallo ammesso (I2): i nuclei dei blocchi 0 e 12 sporgono di pochi giorni oltre il 10000 a.C. e il 2120.
 */
export function testoIntervallo(jd0: number, jd1: number): string {
  const a0 = Math.max(jdToCalendarLocale(jd0, 0).anno, jdToCalendarLocale(JD_MIN_UT, 0).anno);
  const a1 = Math.min(jdToCalendarLocale(jd1, 0).anno, jdToCalendarLocale(JD_ULTIMO_UT, 0).anno);
  return T.messaggi.intervallo(formatAnno(a0), formatAnno(a1));
}

/** Anni (calendario applicato) di inizio e di fine di una fascia del regolo; jd1 escluso. */
export function anniBanda(b: Pick<BandaAffidabilita, 'jd0' | 'jd1'>): { da: string; a: string } {
  const fine = Math.max(b.jd0, b.jd1 - 1 / 86_400);
  return { da: formatAnno(jdToCalendarLocale(b.jd0, 0).anno), a: formatAnno(jdToCalendarLocale(fine, 0).anno) };
}

/** Titolo di una fascia: "Precisa: dal 1550 al 2120". */
export function titoloBanda(b: BandaAffidabilita): string {
  const { da, a } = anniBanda(b);
  return T.console.bandaTitolo(NOMI_LIVELLI[b.livello], da, a);
}

/**
 * Descrizione testuale delle fasce del regolo (§ 7.8.2: il colore non è l'unico segnale): "Affidabilità della Terra
 * nell'intervallo: approssimata dal 10000 a.C. al 7576 a.C.; buona ...". Vuota senza fasce.
 */
export function testoBande(bande: readonly BandaAffidabilita[], nome: string): string {
  if (bande.length === 0) return '';
  const parti = bande.map((b) => {
    const { da, a } = anniBanda(b);
    return T.console.bandaIntervallo(NOMI_LIVELLI[b.livello].toLowerCase(), da, a);
  });
  return T.console.bandeAffidabilita(nome, parti.join('; '));
}
