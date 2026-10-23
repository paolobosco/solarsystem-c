// Fornitori per il rendering (R10, § 7.4, § 7.5.5, § 7.7, § 8.8, § 8.12 di docs/PROGETTO.md):
// - orientamento: Terra dalla rotazione terrestre (src/time/earthRotation.ts, UT1 del TimeState), Luna dalle
//   leggi di Cassini (src/ephem/moon.ts), satelliti sincroni dal modello dei satelliti, altri da WGCCRE
//   (src/ephem/orientation.ts); matrici per righe corpo → eclittica J2000 (src/render/orientamento.ts);
// - texture dei corpi dal DataStore; stelle da stars.bin;
// - stagione astronomica dallo stato della Terra (src/time/seasons.ts).

import type { CorpoCatalogo } from '../data/catalogTypes';
import type { DataStore } from '../data/types';
import { fornitoreStelle } from '../data/starsReader';
import { ServizioOrientamento } from '../ephem/orientation';
import type { ServizioEffemeridi } from '../ephem/service';
import { fornitoreTextureDaDataStore } from '../render/texture';
import type { FornitoreStelle } from '../render/stars';
import type { FornitoreTexture } from '../render/texture';
import { orientamentoTerra } from '../time/earthRotation';
import type { DatiEo } from '../time/earthRotation';
import { creaCalcoloStagione } from '../time/seasons';
import { modelloTempo, utDaTT } from '../time/timescale';
import type { TimeState } from '../time/types';
import type { IngressoStagione } from '../ui/contrattoScena';

/** Orientamento di tutti i corpi del catalogo con i fornitori di Terra, Luna e satelliti sincroni. */
export function creaOrientamento(corpi: readonly CorpoCatalogo[], servizio: ServizioEffemeridi, eo: DatiEo): ServizioOrientamento {
  return new ServizioOrientamento(corpi, {
    terra: (jdTT, out, t) => {
      // UT1 del TimeState quando disponibile (stesso istante); altrimenti dal modello di ΔT
      const jdUT = t !== undefined && t.jdTT === jdTT ? t.jdUT : utDaTT(modelloTempo(), jdTT);
      orientamentoTerra(eo, jdUT, jdTT, out);
      return true;
    },
    luna: (jdTT, out) => servizio.luna.orientamento(jdTT, out) === 'ok',
    sincrono: (ssid, jdTT, verso, polo) => servizio.direzioniSincrone(ssid, jdTT, verso, polo),
  });
}

/** Texture JPEG dei corpi (§ 8.12), richieste dal rendering oltre 8 px di raggio apparente. */
export function creaFornitoreTexture(store: DataStore): FornitoreTexture {
  return fornitoreTextureDaDataStore(store);
}

/** Stelle di stars.bin (§ 8.8), caricate dopo il primo frame. */
export function creaFornitoreStelle(store: DataStore): FornitoreStelle {
  return fornitoreStelle(store);
}

/**
 * Stagione astronomica dell'istante (§ 11.4.3): null se lo stato della Terra non è disponibile. L'istante
 * dell'evento si risolve sugli stati della Terra del servizio; senza il blocco dell'evento, stima kepleriana.
 */
export function creaStagione(servizio: ServizioEffemeridi, ssidTerra: number): (t: TimeState) => IngressoStagione | null {
  const stato = new Float64Array(6);
  const calcola = creaCalcoloStagione((jdTT, out) => servizio.stateAt(ssidTerra, jdTT, out) === 'ok');
  return (t) => {
    if (ssidTerra < 0 || servizio.stateAt(ssidTerra, t.jdTT, stato) !== 'ok') return null;
    const s = calcola(stato, t.jdTT);
    return { stagione: s.stagione, evento: s.evento, giorniDopo: s.giorniDopo };
  };
}
