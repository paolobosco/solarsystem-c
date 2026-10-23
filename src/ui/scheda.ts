// Scheda del corpo selezionato (§ 11.7, § 11.8): intestazione con nome, nome ufficiale,
// categoria e affidabilità; blocco "Ora"; sezioni richiudibili Orbita, Caratteristiche
// fisiche, Fonte e affidabilità. Riducibile all'intestazione.

import type { CategoriaCorpo, CorpoCatalogo, ValoreFisico } from '../data/catalogTypes';
import { jdToCalendarLocale } from '../time/calendar';
import type { MakeTimeState, ScalaTempo } from '../time/types';
import { etichettaScala } from './console';
import { rotazioneMostrata } from './datiScheda';
import type { DatiScheda } from './datiScheda';
import { attributo, h, nuovoId, svuota, testo } from './dom';
import {
  SPAZIO_NB,
  cifreSorgente,
  decimaliLimitati,
  formatCifre,
  formatData,
  formatDataOra,
  formatErroreAngolare,
  formatGradi,
  formatNumero,
  formatPeriodo,
  formatTempoLuce,
  formatValoreFisico,
  misuraDistanza,
  misuraGM,
  misuraVelocita,
} from './format';
import type { Misura } from './format';
import { icona } from './icone';
import { testoAffidabilita } from './messaggi';
import { nodoMisura, nodoNumero, nodoTesto, nodoUnita } from './nodi';
import { iconaAffidabilita, simbolo } from './simboli';
import { NOMI_CATEGORIE, NOMI_CATEGORIE_IN_FRASE, NOMI_CATEGORIE_PLURALE_IN_FRASE, NOMI_LIVELLI, T, UNITA, URI_LICENZE } from './testi.it';

export interface DipendenzeScheda {
  inquadra: (c: CorpoCatalogo) => void;
  copiaCollegamento: (c: CorpoCatalogo) => void;
  chiudi: () => void;
  alternaEspansione: () => void;
  mostraCategoria: (c: CategoriaCorpo) => void;
  annuncia: (t: string) => void;
  /** Conversione TT/UT per il passaggio al pericentro (src/time/timescale.ts). */
  makeTimeState: MakeTimeState;
}

export interface ContestoScheda {
  /** Data dell'istante per "Elementi osculanti al ...". */
  dataTesto: string;
  /** Scala dell'istante inserito: con TT l'errore da ΔT è nullo. */
  scala: ScalaTempo;
  /** Offset orario fisso dell'istante mostrato (solo in UT), per il passaggio al pericentro. */
  offsetMinuti: number | null;
  inRiproduzione: boolean;
  motoRapido: boolean;
  /** Categoria nascosta dai filtri del corpo selezionato, se tutte le sue categorie lo sono. */
  categoriaNascosta: CategoriaCorpo | null;
  espansa: boolean;
  /**
   * Caricamento dei dati della data in corso (barra di caricamento visibile). Lo stato 'caricamento' resta anche dopo
   * l'errore di un blocco, quando il testo "in caricamento" sarebbe falso.
   */
  caricamentoInCorso: boolean;
}

export interface Scheda {
  elemento: HTMLElement;
  mostra(dati: DatiScheda | null, ctx: ContestoScheda): void;
  focusTitolo(): void;
  /** Esito visibile di "Copia collegamento": conferma breve o, se la copia non riesce, l'URL in un campo selezionato. */
  esitoCopia(riuscita: boolean, url: string): void;
}

/** Durata della conferma visibile della copia, ms. */
const DURATA_CONFERMA_COPIA_MS = 4000;

/** Riga di una lista di definizioni. */
function voce(termine: Node | string, valore: Node | string, classe = ''): HTMLDivElement {
  return h('div', { class: `ss-voce ${classe}`.trim() }, h('dt', null, termine), h('dd', null, valore));
}

function termineElemento(simboloEl: string, nome: string): HTMLElement {
  return h('span', null, h('span', { class: 'ss-simbolo-elemento' }, simboloEl), ' ', nome);
}

function valoreConFonte(contenuto: Node, v: ValoreFisico<unknown> | null): Node {
  if (v === null) return document.createTextNode(T.scheda.nonNoto);
  const frammento = h('span', { class: 'ss-valore-fonte' }, contenuto);
  frammento.appendChild(h('span', { class: 'ss-fonte' }, T.scheda.fonteDi(v.fonte)));
  return frammento;
}

function misuraSemplice(valore: string, unita: string): Misura {
  return { valore, unita, approssimato: false };
}

/** Cifre massime dei valori fisici senza incertezza (§ 11.13): quelle della fonte, al più 6 (GM 7, albedo 4), parte intera esclusa. */
const MAX_CIFRE_FISICA = 6;
const MAX_CIFRE_GM = 7;
const MAX_CIFRE_ALBEDO = 4;

/** Gradi con decimali coerenti con l'incertezza σ (rad), da 0 a 4; `ciclico` per gli angoli in [0°, 360°) (Ω, ω, M). */
function gradiConIncertezza(rad: number, sigma: number, ciclico = false): string {
  return formatGradi(rad, decimaliLimitati((sigma * 180) / Math.PI, 0, 4), ciclico);
}

export function creaScheda(d: DipendenzeScheda): Scheda {
  const idNome = nuovoId('scheda-n');
  const idCorpo = nuovoId('scheda-c');
  const nome = h('h2', { id: idNome, class: 'ss-scheda-nome', tabindex: -1 });
  const ufficiale = h('p', { class: 'ss-scheda-ufficiale' });
  const categoria = h('p', { class: 'ss-scheda-categoria' });
  const badge = h('p', { class: 'ss-badge-aff' });
  const espandi = h('button', { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-controls': idCorpo });
  const chiudi = h(
    'button',
    { type: 'button', class: 'ss-pulsante ss-pulsante--icona', 'aria-label': T.scheda.chiudi, title: T.scheda.chiudi },
    icona('chiudi'),
  );
  espandi.addEventListener('click', () => d.alternaEspansione());
  chiudi.addEventListener('click', () => d.chiudi());

  const avvisoFiltri = h('div', { class: 'ss-avviso ss-avviso--ambra' });
  avvisoFiltri.hidden = true;
  // Categoria dell'avviso mostrato: il pulsante si ricrea solo quando cambia (il focus non si perde ai ridisegni).
  let categoriaAvviso: CategoriaCorpo | null = null;

  const ora = h('dl', { class: 'ss-dati' });
  // Senza posizione alla data una sola frase sotto il titolo "Ora", senza termine ripetuto.
  const oraNota = h('p', { class: 'ss-nota' });
  oraNota.hidden = true;
  const idOra = `${idCorpo}-ora`;
  const titoloOra = h('h3', { id: idOra, class: 'ss-sottotitolo' }, T.scheda.ora);
  const leggi = h('button', { type: 'button', class: 'ss-pulsante' }, icona('altoparlante'), h('span', null, T.scheda.leggiPosizione));
  const motoRapido = h('p', { class: 'ss-nota ss-nota--ambra' }, T.scheda.motoRapido);
  motoRapido.hidden = true;
  const inquadra = h('button', { type: 'button', class: 'ss-pulsante' }, icona('inquadra'), h('span', null, T.scheda.inquadra));
  const copia = h('button', { type: 'button', class: 'ss-pulsante' }, icona('collegamento'), h('span', null, T.scheda.copiaCollegamento));
  const esitoCopia = h('div', { class: 'ss-copia-esito' });
  esitoCopia.hidden = true;
  let timerCopia: number | null = null;

  const orbitaCorpo = h('div', { class: 'ss-sezione-corpo' });
  const fisicaCorpo = h('div', { class: 'ss-sezione-corpo' });
  const fonteCorpo = h('div', { class: 'ss-sezione-corpo' });
  const sezione = (titolo: string, corpo: HTMLElement, aperta: boolean) => {
    const det = h('details', { class: 'ss-sezione' }, h('summary', null, h('h3', { class: 'ss-sezione-titolo' }, titolo)), corpo);
    det.open = aperta;
    return det;
  };

  const corpoScheda = h(
    'div',
    { class: 'ss-scheda-corpo', id: idCorpo },
    h('section', { class: 'ss-scheda-ora', 'aria-labelledby': idOra }, titoloOra, ora, oraNota, motoRapido, leggi),
    h('div', { class: 'ss-scheda-azioni' }, inquadra, copia),
    esitoCopia,
    sezione(T.scheda.orbita, orbitaCorpo, true),
    sezione(T.scheda.fisica, fisicaCorpo, false),
    sezione(T.scheda.fonteAffidabilita, fonteCorpo, false),
  );

  const elemento = h(
    'aside',
    { class: 'ss-pannello ss-scheda', 'aria-labelledby': idNome },
    h(
      'header',
      { class: 'ss-scheda-testa' },
      h('div', { class: 'ss-scheda-titoli' }, nome, ufficiale, categoria),
      h('div', { class: 'ss-scheda-pulsanti' }, espandi, chiudi),
      badge,
    ),
    // Fuori dal corpo: visibile anche con la scheda ridotta all'intestazione (§ 11.6).
    avvisoFiltri,
    corpoScheda,
  );

  let corrente: DatiScheda | null = null;
  let corpoCorrente: string | null = null;
  /** Caricamento in corso all'ultimo ridisegno: distingue i dati in arrivo da quelli mancanti per un errore. */
  let caricamentoCorrente = true;

  leggi.addEventListener('click', () => {
    if (corrente !== null) d.annuncia(annuncioPosizione(corrente, caricamentoCorrente));
  });
  inquadra.addEventListener('click', () => corrente && d.inquadra(corrente.corpo));
  copia.addEventListener('click', () => corrente && d.copiaCollegamento(corrente.corpo));

  function intestazione(c: CorpoCatalogo, dati: DatiScheda): void {
    testo(nome, c.nome);
    const parti: string[] = [];
    if (c.nomeUfficiale && c.nomeUfficiale !== c.nome) parti.push(`${T.scheda.nomeUfficiale}: ${c.nomeUfficiale}`);
    if (c.numero !== null) parti.push(`${T.scheda.numero} ${c.numero}`);
    if (c.designazione && c.designazione !== c.nome && !c.nome.startsWith(c.designazione)) parti.push(c.designazione);
    testo(ufficiale, parti.join(' · '));
    ufficiale.hidden = parti.length === 0;
    svuota(categoria);
    categoria.appendChild(simbolo(c.categoria, { cavo: dati.affidabilita.livello === 'indicativa' }));
    let cat = NOMI_CATEGORIE[c.categoria];
    if (c.categoria === 'luna' && dati.velocitaRispetto) cat = `${cat} · ${T.trova.lunaDi(dati.velocitaRispetto.nome)}`;
    const secondarie = c.categorieSecondarie.filter((k) => k !== c.categoria).map((k) => NOMI_CATEGORIE_IN_FRASE[k]);
    if (secondarie.length > 0) cat += ` · ${T.scheda.anche(secondarie.join(', '))}`;
    categoria.appendChild(h('span', null, nodoTesto(cat)));
  }

  function badgeAffidabilita(dati: DatiScheda): void {
    const l = dati.affidabilita.livello;
    badge.className = `ss-badge-aff ss-aff ss-aff--${l}`;
    svuota(badge);
    badge.appendChild(iconaAffidabilita(l));
    badge.appendChild(h('span', { class: 'ss-sr' }, T.affidabilita.badge('')));
    badge.appendChild(h('span', null, NOMI_LIVELLI[l]));
    // Senza posizione alla data (dati in caricamento o fuori copertura) il livello non ha significato.
    badge.hidden = dati.corpo.categoria === 'sole' || dati.stato === 'caricamento' || dati.stato === 'fuori-copertura';
  }

  function bloccoOra(dati: DatiScheda, caricamentoInCorso: boolean): void {
    svuota(ora);
    const nota = testoSenzaPosizione(dati, caricamentoInCorso);
    oraNota.hidden = nota === null;
    if (nota !== null) {
      testo(oraNota, nota);
      return;
    }
    if (dati.distanzaSoleKm !== null) {
      ora.appendChild(
        voce(T.scheda.distanzaSole, nodoMisura(misuraDistanza(dati.distanzaSoleKm, { erroreRelativo: rel(dati.erroreKm, dati.distanzaSoleKm) }))),
      );
    }
    if (dati.distanzaTerraKm !== null) {
      const v = h(
        'span',
        null,
        nodoMisura(misuraDistanza(dati.distanzaTerraKm, { erroreRelativo: rel(dati.erroreTerraKm, dati.distanzaTerraKm) })),
      );
      if (dati.tempoLuceS !== null) v.appendChild(h('span', { class: 'ss-secondario' }, ` · ${T.scheda.tempoLuce(formatTempoLuce(dati.tempoLuceS))}`));
      ora.appendChild(voce(T.scheda.distanzaTerra, v));
    }
    if (dati.velocitaKmS !== null) {
      const p = dati.velocitaRispetto;
      const termine = p === null ? T.scheda.velocitaEliocentrica : dati.rispettoSistema ? T.scheda.velocitaRispettoSistema(p.nome) : T.scheda.velocitaRispetto(p.nome);
      ora.appendChild(voce(termine, nodoMisura(misuraVelocita(dati.velocitaKmS, dati.erroreVelocitaKmS))));
    }
  }

  function bloccoOrbita(dati: DatiScheda, ctx: ContestoScheda): void {
    svuota(orbitaCorpo);
    const el = dati.elementi;
    if (el === null) {
      orbitaCorpo.appendChild(h('p', { class: 'ss-nota' }, testoOrbitaSenzaElementi(dati, ctx.caricamentoInCorso)));
      return;
    }
    const prim = el.primario?.nome ?? '';
    const piano = el.riferimento === 'planetocentrici-F';
    const rif =
      el.riferimento === 'eliocentrici'
        ? el.baricentro === 'terra-luna'
          ? T.scheda.riferimentoElioTerraLuna
          : el.baricentro === 'sistema'
            ? T.scheda.riferimentoElioSistema(dati.corpo.nome)
            : T.scheda.riferimentoElio
        : el.riferimento === 'baricentrici'
          ? T.scheda.riferimentoBari
          : el.centroSistema
            ? piano
              ? T.scheda.riferimentoSistema(prim)
              : T.scheda.riferimentoSistemaEclittica(prim)
            : piano
              ? T.scheda.riferimentoPlaneto(prim)
              : T.scheda.riferimentoPlanetoEclittica(prim);
    orbitaCorpo.appendChild(h('p', { class: 'ss-riferimento' }, `${T.scheda.riferimento}: ${rif}`));
    orbitaCorpo.appendChild(h('p', { class: 'ss-nota' }, T.scheda.osculanti(ctx.dataTesto)));
    // § 11.8: "Orbita non determinabile" solo con il livello non determinabile; altrimenti forma incerta.
    if (el.forma !== 'determinata') {
      const nonDet = dati.affidabilita.livello === 'non-determinabile';
      orbitaCorpo.appendChild(h('p', { class: 'ss-nota ss-nota--ambra' }, nonDet ? T.scheda.orbitaNonDeterminabile : T.scheda.formaIncerta));
    }
    // Cifre coerenti con le incertezze stimate (§ 11.13; docs/METODI.md, elementi della scheda).
    const u = el.incertezza;
    const E = T.scheda.elementi;
    const dl = h('dl', { class: 'ss-dati' });
    const iperbolica = el.e >= 1;
    if (!iperbolica) dl.appendChild(voce(termineElemento(E.a.simbolo, E.a.nome), nodoMisura(misuraDistanza(el.a, { incertezzaKm: u.a }))));
    else dl.appendChild(voce(termineElemento(E.q.simbolo, E.q.nome), nodoMisura(misuraDistanza(el.q, { incertezzaKm: u.q }))));
    dl.appendChild(voce(termineElemento(E.e.simbolo, E.e.nome), nodoNumero(testoEccentricita(el.e, u.e))));
    dl.appendChild(voce(termineElemento(E.i.simbolo, E.i.nome), nodoNumero(gradiConIncertezza(el.i, u.i))));
    dl.appendChild(voce(termineElemento(E.nodo.simbolo, E.nodo.nome), nodoNumero(gradiConIncertezza(el.nodo, u.nodo, true))));
    dl.appendChild(voce(termineElemento(E.argPeri.simbolo, E.argPeri.nome), nodoNumero(gradiConIncertezza(el.argPeri, u.argPeri, true))));
    // Con la posizione non determinabile anomalia media e passaggio al pericentro non hanno significato (§ 11.8).
    const faseNota = dati.affidabilita.livello !== 'non-determinabile';
    if (!iperbolica) {
      if (faseNota) dl.appendChild(voce(termineElemento(E.M.simbolo, E.M.nome), nodoNumero(gradiConIncertezza(el.M, u.M, true))));
      dl.appendChild(voce(termineElemento(E.P.simbolo, E.P.nome), nodoNumeroUnita(formatPeriodo(el.P, u.P))));
    }
    if (faseNota) dl.appendChild(voce(termineElemento(E.T.simbolo, E.T.nome), testoPassaggio(el.T, u.T, ctx, d.makeTimeState)));
    orbitaCorpo.appendChild(dl);
    if (iperbolica) {
      orbitaCorpo.appendChild(h('p', { class: 'ss-nota' }, T.scheda.iperbolica));
      if (el.vInf !== null) {
        const dl2 = h('dl', { class: 'ss-dati' });
        // v∞ = √(-μ/a): δv∞/v∞ = ½·δa/|a|.
        const sigmaVInf = (0.5 * u.a * el.vInf) / Math.abs(el.a);
        dl2.appendChild(voce(termineElemento(E.vInf.simbolo, E.vInf.nome), nodoMisura(misuraVelocita(el.vInf, sigmaVInf))));
        orbitaCorpo.appendChild(dl2);
      }
    }
  }

  function bloccoFisica(c: CorpoCatalogo): void {
    svuota(fisicaCorpo);
    const f = c.fisica;
    const dl = h('dl', { class: 'ss-dati' });
    // Cifre dall'incertezza o, senza, dalla fonte (§ 11.13).
    if (f.raggi_km !== null) {
      const [a, b, cc] = f.raggi_km.valore;
      const uguali = Math.abs(a - b) < 1e-9 && Math.abs(a - cc) < 1e-9;
      const inc = f.raggi_km.incertezza;
      const testoRaggi = uguali
        ? formatValoreFisico(a, inc?.[0] ?? null, MAX_CIFRE_FISICA)
        : [a, b, cc].map((x) => formatCifre(x, cifreSorgente(x, MAX_CIFRE_FISICA))).join(' × ');
      dl.appendChild(voce(uguali ? T.scheda.raggio : T.scheda.raggi, valoreConFonte(nodoMisura(misuraSemplice(testoRaggi, UNITA.km)), f.raggi_km)));
    } else dl.appendChild(voce(T.scheda.raggio, T.scheda.nonNoto));
    if (f.gm_km3s2 !== null) {
      const g = misuraGM(f.gm_km3s2.valore, f.gm_km3s2.incertezza, MAX_CIFRE_GM);
      dl.appendChild(voce(T.scheda.gm, valoreConFonte(nodoMisura(g), f.gm_km3s2)));
    } else dl.appendChild(voce(T.scheda.gm, T.scheda.nonNoto));
    if (f.rotazione !== null) {
      const { ore, retrograda } = rotazioneMostrata(f);
      const inc = f.rotazione.incertezza === null ? null : Math.abs(f.rotazione.incertezza);
      const m =
        ore < 48
          ? misuraSemplice(formatValoreFisico(ore, inc, MAX_CIFRE_FISICA), UNITA.h)
          : misuraSemplice(formatValoreFisico(ore, inc, MAX_CIFRE_FISICA, 1 / 24), UNITA.giorni);
      const valore = retrograda ? h('span', null, nodoMisura(m), ' ', h('span', { class: 'ss-secondario' }, T.scheda.retrograda)) : nodoMisura(m);
      dl.appendChild(voce(T.scheda.rotazione, valoreConFonte(valore, f.rotazione)));
    } else dl.appendChild(voce(T.scheda.rotazione, T.scheda.nonNoto));
    // L'albedo geometrica non si applica al Sole; le lune non la riportano.
    if (c.categoria !== 'luna' && c.categoria !== 'sole') {
      dl.appendChild(
        voce(
          T.scheda.albedo,
          f.albedo === null ? T.scheda.nonNoto : valoreConFonte(nodoNumero(formatValoreFisico(f.albedo.valore, f.albedo.incertezza, MAX_CIFRE_ALBEDO)), f.albedo),
        ),
      );
    }
    fisicaCorpo.appendChild(dl);
    if (c.texture !== null) {
      const t = c.texture;
      const uri = URI_LICENZE[t.licenza];
      const licenza = uri === undefined ? t.licenza : T.scheda.licenzaModificata(t.licenza, uri);
      const p = h('p', { class: 'ss-nota' }, `${T.scheda.texture}: ${t.fonte} (${licenza}).`);
      const nota = T.scheda.areeNonOsservate[t.areeNonOsservate];
      if (nota !== '') p.appendChild(document.createTextNode(` ${nota}`));
      fisicaCorpo.appendChild(p);
    }
  }

  function bloccoFonte(dati: DatiScheda, ctx: ContestoScheda): void {
    svuota(fonteCorpo);
    const c = dati.corpo;
    const aff = dati.affidabilita;
    const forma = dati.elementi?.forma ?? null;
    const dl = h('dl', { class: 'ss-dati' });
    dl.appendChild(voce(T.scheda.sorgente, dati.sorgente));
    const sol = c.soluzione;
    const testoSol = [sol.id, sol.data ?? '', sol.estrazione ? T.scheda.estrazione(sol.estrazione) : ''].filter((x) => x !== '').join(', ');
    if (c.categoria !== 'sole') dl.appendChild(voce(T.scheda.soluzione, testoSol));
    fonteCorpo.appendChild(dl);
    fonteCorpo.appendChild(
      h(
        'p',
        { class: `ss-aff-frase ss-aff ss-aff--${aff.livello}` },
        c.categoria === 'sole' ? null : iconaAffidabilita(aff.livello),
        h('span', null, testoAffidabilita(aff, dati.sorgente, forma, c.categoria === 'sole')),
      ),
    );
    if (c.categoria !== 'sole') {
      const dl2 = h('dl', { class: 'ss-dati' });
      dl2.appendChild(voce(T.scheda.epsModello, nodoNumero(erroreMostrato(aff.epsModello))));
      dl2.appendChild(voce(T.scheda.epsDeltaT, ctx.scala === 'TT' ? T.scheda.epsDeltaTNullo : nodoNumero(erroreMostrato(aff.epsDeltaT))));
      dl2.appendChild(voce(T.scheda.epsTotale, nodoNumero(erroreMostrato(aff.epsTotale))));
      fonteCorpo.appendChild(dl2);
    }
    if (dati.rotazioneIndeterminata) fonteCorpo.appendChild(h('p', { class: 'ss-nota ss-nota--ambra' }, T.scheda.rotazioneIndeterminata));
  }

  return {
    elemento,
    mostra(dati, ctx) {
      elemento.hidden = dati === null;
      if (dati === null) {
        corrente = null;
        corpoCorrente = null;
        return;
      }
      corrente = dati;
      caricamentoCorrente = ctx.caricamentoInCorso;
      const cambioCorpo = corpoCorrente !== dati.corpo.slug;
      corpoCorrente = dati.corpo.slug;
      if (cambioCorpo) esitoCopia.hidden = true;
      attributo(espandi, 'aria-expanded', ctx.espansa ? 'true' : 'false');
      attributo(espandi, 'aria-label', ctx.espansa ? T.scheda.riduci : T.scheda.espandi);
      attributo(espandi, 'title', ctx.espansa ? T.scheda.riduci : T.scheda.espandi);
      espandi.replaceChildren(icona(ctx.espansa ? 'su' : 'giu'));
      corpoScheda.hidden = !ctx.espansa;
      elemento.classList.toggle('ss-scheda--ridotta', !ctx.espansa);
      intestazione(dati.corpo, dati);
      badgeAffidabilita(dati);
      avvisoFiltri.hidden = ctx.categoriaNascosta === null;
      if (ctx.categoriaNascosta !== categoriaAvviso) {
        categoriaAvviso = ctx.categoriaNascosta;
        svuota(avvisoFiltri);
      }
      if (ctx.categoriaNascosta !== null && avvisoFiltri.childElementCount === 0) {
        const cat = ctx.categoriaNascosta;
        const b = h('button', { type: 'button', class: 'ss-pulsante' }, T.scheda.mostraCategoria(NOMI_CATEGORIE_PLURALE_IN_FRASE[cat]));
        b.addEventListener('click', () => d.mostraCategoria(cat));
        avvisoFiltri.appendChild(h('p', null, icona('avviso'), h('span', null, T.scheda.nascostoDaFiltri(cat))));
        avvisoFiltri.appendChild(b);
      }
      leggi.hidden = !ctx.inRiproduzione;
      motoRapido.hidden = !ctx.motoRapido;
      if (!ctx.espansa && !cambioCorpo) return;
      bloccoOra(dati, ctx.caricamentoInCorso);
      titoloOra.hidden = ora.childElementCount === 0 && oraNota.hidden;
      bloccoOrbita(dati, ctx);
      if (cambioCorpo || fisicaCorpo.childElementCount === 0) bloccoFisica(dati.corpo);
      bloccoFonte(dati, ctx);
    },
    focusTitolo() {
      nome.focus();
    },
    esitoCopia(riuscita, url) {
      if (timerCopia !== null) window.clearTimeout(timerCopia);
      timerCopia = null;
      svuota(esitoCopia);
      esitoCopia.hidden = false;
      if (riuscita) {
        esitoCopia.appendChild(h('p', { class: 'ss-nota' }, icona('collegamento'), h('span', null, T.annunci.collegamentoCopiato)));
        timerCopia = window.setTimeout(() => {
          timerCopia = null;
          esitoCopia.hidden = true;
        }, DURATA_CONFERMA_COPIA_MS);
        return;
      }
      const id = nuovoId('copia');
      const campo = h('input', { id, class: 'ss-input ss-copia-campo', type: 'text', readonly: true, value: url, 'aria-label': T.scheda.collegamento });
      esitoCopia.appendChild(h('p', { class: 'ss-nota ss-nota--ambra' }, h('label', { for: id }, T.scheda.copiaNonRiuscita)));
      esitoCopia.appendChild(campo);
      campo.focus();
      campo.select();
    },
  };
}

/**
 * Frase del blocco "Ora" senza posizione alla data (§ 11.7, § 11.11): dati in caricamento, non disponibili (fuori
 * copertura, o blocco non caricato per un errore: lo stato resta 'caricamento', ma `caricamentoInCorso` è falso) o
 * posizione non determinabile (stato o livello, § 11.8); null se la posizione è mostrata.
 */
export function testoSenzaPosizione(dati: DatiScheda, caricamentoInCorso: boolean): string | null {
  if (dati.stato === 'caricamento') return caricamentoInCorso ? T.scheda.caricamento : T.scheda.fuoriCopertura;
  if (dati.stato === 'fuori-copertura') return T.scheda.fuoriCopertura;
  if (dati.stato !== 'ok' || (dati.corpo.categoria !== 'sole' && dati.affidabilita.livello === 'non-determinabile')) return T.affidabilita.nonDeterminabile;
  return null;
}

/**
 * Nota della sezione Orbita senza elementi: l'origine del sistema per il Sole; i dati in caricamento (come il blocco
 * "Ora") se il caricamento è in corso; altrimenti gli elementi non disponibili alla data (fuori copertura, non
 * determinabili, blocco non caricato per un errore).
 */
export function testoOrbitaSenzaElementi(dati: Pick<DatiScheda, 'corpo' | 'stato'>, caricamentoInCorso: boolean): string {
  if (dati.corpo.categoria === 'sole') return T.affidabilita.sole;
  return dati.stato === 'caricamento' && caricamentoInCorso ? T.scheda.caricamento : T.scheda.orbitaNonDisponibile;
}

/**
 * Testo di "Leggi posizione" (§ 11.7): distanze dal Sole e dalla Terra con le cifre della scheda. Le distanze che non si
 * applicano si omettono: dal Sole per il Sole (null per costruzione), dalla Terra per la Terra (§ 11.9). Senza posizione
 * alla data, la stessa frase del blocco "Ora" (in caricamento o non disponibile).
 */
export function annuncioPosizione(c: DatiScheda, caricamentoInCorso = true): string {
  const nota = testoSenzaPosizione(c, caricamentoInCorso);
  if (nota !== null) return `${c.corpo.nome}: ${nota}`;
  const sole =
    c.distanzaSoleKm === null
      ? c.corpo.categoria === 'sole'
        ? null
        : UNITA.nonDisponibile
      : testoMisuraSemplice(misuraDistanza(c.distanzaSoleKm, { erroreRelativo: rel(c.erroreKm, c.distanzaSoleKm) }));
  const terra =
    c.distanzaTerraKm === null
      ? null
      : testoMisuraSemplice(misuraDistanza(c.distanzaTerraKm, { erroreRelativo: rel(c.erroreTerraKm, c.distanzaTerraKm) }));
  return T.scheda.posizione(c.corpo.nome, sole, terra);
}

/**
 * Passaggio al pericentro T (JD TT) nella scala e nell'offset dell'istante mostrato, come la console e la riga «Elementi
 * osculanti» (§ 6.3, § 11.4.1): in UT T_UT1 = T_TT − ΔT, con σ(ΔT) sommata in quadratura all'incertezza di T. Ora solo con
 * un'incertezza inferiore a un'ora; altrimenti la sola data, sempre con la scala.
 */
/**
 * Eccentricità con le cifre dell'incertezza: almeno un decimale; per l'iperbole anche intera, se l'incertezza supera
 * 0,1. Un valore arrotondato che non resta dal lato di 1 dell'orbita (forma incerta) contraddirebbe periodo o "Orbita
 * iperbolica": "≈ 1 (quasi parabolica)". Con un'incertezza di almeno 1 che non esclude l'altro lato di 1 nessuna cifra
 * è significativa: "non determinabile".
 */
export function testoEccentricita(e: number, sigma: number): string {
  if (sigma >= 1 && sigma >= Math.abs(1 - e)) return T.scheda.eNonDeterminabile;
  const iperbolica = e >= 1;
  const decimali = decimaliLimitati(sigma, iperbolica ? 0 : 1, 6);
  const arrotondato = Number(e.toFixed(decimali));
  return (iperbolica ? arrotondato > 1 : arrotondato < 1) ? formatNumero(e, decimali) : T.scheda.eQuasiParabolica;
}

export function testoPassaggio(
  jdTT: number,
  sigmaGiorni: number,
  mostrato: Pick<ContestoScheda, 'scala' | 'offsetMinuti'>,
  makeTimeState: MakeTimeState,
): string {
  if (!Number.isFinite(jdTT)) return UNITA.nonDisponibile;
  let jd = jdTT;
  let sigma = sigmaGiorni;
  let offset = 0;
  if (mostrato.scala === 'UT') {
    const ts = makeTimeState(jdTT, 'TT');
    jd = ts.jdUT;
    sigma = Math.hypot(sigmaGiorni, ts.deltaTSigma / 86_400);
    offset = mostrato.offsetMinuti ?? 0;
  }
  const etichetta = etichettaScala(mostrato.scala, mostrato.scala === 'UT' ? mostrato.offsetMinuti : null);
  const dc = jdToCalendarLocale(jd, offset);
  return sigma < 1 / 24 ? formatDataOra(dc, etichetta) : T.scheda.dataInScala(formatData(dc), etichetta);
}

/** Errore angolare; oltre 90° (posizione non determinabile, § 7.8.2) "> 90°". */
function erroreMostrato(rad: number): string {
  return rad > Math.PI / 2 ? T.scheda.erroreOltre90 : formatErroreAngolare(rad);
}

function rel(erroreKm: number | null, d: number): number | undefined {
  return erroreKm === null || !(d > 0) ? undefined : erroreKm / d;
}

function testoMisuraSemplice(m: Misura): string {
  return (m.approssimato ? UNITA.circa + SPAZIO_NB : '') + m.valore + (m.unita === '' ? '' : SPAZIO_NB + m.unita);
}

/** "29,78 km/s" già formattato: numero senza a capo e unità (UA come abbr). */
function nodoNumeroUnita(testoCompleto: string): HTMLElement {
  const i = testoCompleto.lastIndexOf(SPAZIO_NB);
  if (i < 0) return nodoNumero(testoCompleto);
  const out = h('span', { class: 'ss-misura' }, nodoNumero(testoCompleto.slice(0, i)), SPAZIO_NB);
  out.appendChild(nodoUnita(testoCompleto.slice(i + 1)));
  return out;
}
