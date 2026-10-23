// Adattatore da ScenaApi (src/render/api.ts) al contratto dell'interfaccia ScenaUi
// (src/ui/contrattoScena.ts). Solo importazioni di tipo: nessun codice di rendering nel modulo.
// Al montaggio passa alla scena le zone coperte dai pannelli (src/ui/zoneScena.ts), escluse dalle etichette.
//
// Uso nell'integrazione:
//   const canvas = document.createElement('canvas');
//   const etichette = document.createElement('div');
//   const api = creaScena({ canvas, etichette, catalogo, effemeridi, testi: TESTI_SCENA_IT });
//   const scena = adattaScena(api, canvas, etichette);
//   creaInterfaccia(radice, { scena, ... });

import type { CategoriaCorpo } from '../data/catalogTypes';
import type { ScenaApi } from '../render/api';
import type { InfoSelezione, LivelloScena, OpzioniFuoco, ScenaUi, StatoVista } from './contrattoScena';
import { osservaZone } from './zoneScena';

export function adattaScena(api: ScenaApi, canvas: HTMLCanvasElement, etichette: HTMLElement): ScenaUi {
  let ultimaVista: StatoVista | null = null;

  function vista(): StatoVista {
    const v = api.statoVista();
    ultimaVista = {
      distanzaKm: v.distanzaKm,
      ampiezzaKm: v.estensioneKm,
      kmPerPixel: v.kmPerPx,
      larghezzaPx: v.larghezzaPx,
      altezzaPx: v.altezzaPx,
      fuoco: v.fuoco,
      inTransizione: v.transizione,
      fuocoSenzaPosizione: v.fuocoSenzaPosizione,
      contestoPerso: v.contestoPerso,
    };
    return ultimaVista;
  }

  return {
    monta(contenitore) {
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      contenitore.appendChild(canvas);
      contenitore.appendChild(etichette);
      // Zone occupate da tutti i pannelli dell'applicazione, anche fuori dal landmark main che contiene la mappa.
      const radice = contenitore.closest<HTMLElement>('.ss-app') ?? contenitore.parentElement;
      if (radice) osservaZone(radice, contenitore, canvas, (zone) => api.impostaZoneOccupate(zone));
    },
    statoVista: vista,
    onCambioVista: (cb) => api.onVista(() => cb()),
    onSelezione: (cb: (ssid: number | null, info: InfoSelezione | null) => void) =>
      api.onSelezione((e) => cb(e.ssid, e.ssid === null ? null : { indice: e.indice, totale: e.totale })),
    seleziona: (ssid) => api.impostaSelezione(ssid),
    mettiAFuoco(ssid, o: OpzioniFuoco = {}) {
      api.impostaFuoco(ssid, {
        transizione: o.immediato !== true,
        inquadratura: o.ampiezzaKm !== undefined ? { estensioneKm: o.ampiezzaKm } : (o.inquadratura ?? 'mantieni'),
        ...(o.vistaSistema !== undefined ? { vistaSistema: o.vistaSistema } : {}),
      });
    },
    impostaAmpiezza: (km) => api.impostaEstensione(km),
    // Contratto dell'interfaccia: fattore > 1 allontana; nella scena fattore > 1 avvicina.
    zoom: (fattore) => api.zoom(1 / fattore),
    ruota: (dAz, dEl) => api.ruota(dAz, dEl),
    sposta(dx, dy) {
      const h = (ultimaVista ?? vista()).altezzaPx;
      api.sposta(dx * h, -dy * h);
    },
    corpoAlCentro: () => api.corpoPiuVicinoAlCentro(),
    corpoVisibileSuccessivo(da, verso) {
      const elenco = api.corpiVisibiliOrdinati();
      if (elenco.length === 0) return null;
      const i = da === null ? -1 : elenco.indexOf(da);
      const j = i < 0 ? (verso === 1 ? 0 : elenco.length - 1) : (i + verso + elenco.length) % elenco.length;
      return elenco[j] ?? null;
    },
    impostaLivelli(l: Readonly<Record<LivelloScena, boolean>>) {
      api.impostaLivelli({
        orbite: l.orbite,
        etichette: l.etichette,
        marcatori: l.marcatori,
        anelliDistanza: l.anelliDistanza,
        grigliaEclittica: l.grigliaEclittica,
        eclitticaData: l.eclitticaData,
        assiRotazione: l.assiRotazione,
        anelliPlanetari: l.anelli,
        stelle: l.stelle,
      });
    },
    // La scena non prevede l'eccezione per il corpo selezionato di categoria nascosta (§ 11.6):
    // si passano solo le categorie attive.
    impostaFiltri: (categorie: ReadonlySet<CategoriaCorpo>) => api.impostaFiltri(categorie),
    impostaRiproduzione: (g) => api.impostaRiproduzione(g),
  };
}
