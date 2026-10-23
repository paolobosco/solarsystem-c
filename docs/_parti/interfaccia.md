# Interfaccia: struttura, contratti, verifiche

Riferimento: `docs/PROGETTO.md` versione 2.0 (§ 3, § 6.6, § 11, § 13 A11-A17, A23). Dove una scelta precisa o si discosta dal progetto, la sezione 6 lo dichiara.

## 1. Contenuto

| File | Contenuto |
|------|-----------|
| `index.html`, `ui-lab.html` | `lang="it"`, Google Fonts (Source Sans 3, Source Serif 4, Source Code Pro, `display=swap`), sfondo esplicito; `ui-lab.html` solo sviluppo, non entra nella build (Vite costruisce solo `index.html`) |
| `src/app/store.ts` | store osservabile tipizzato, stato applicativo, velocità a gradini (§ 6.6), stato iniziale (§ 11.12) |
| `src/ui/index.ts` | `creaInterfaccia(radice, dipendenze)`: costruzione, osservatori, layout, tastiera, collegamenti; controller per l'integrazione |
| `src/ui/contrattoScena.ts` | `ScenaUi` (operazioni della scena richieste dall'interfaccia), `StatoVista`, `IngressoStagione` |
| `src/ui/adattatoreScena.ts` | `adattaScena(api, canvas, etichette)`: da `ScenaApi` di `src/render/api.ts` a `ScenaUi`; al montaggio passa alla scena le zone dei pannelli |
| `src/ui/zoneScena.ts` | zone della mappa coperte dai pannelli (elementi fuori dalla mappa con sfondo di opacità almeno 0,5), escluse dalle etichette (§ 11.5.2) |
| `src/ui/tokens.css`, `src/ui/stile.css` | token del § 11.1, tipografia del § 11.2, layout per classi di larghezza, preferenze di sistema |
| `src/ui/testi.it.ts` | tutti i testi visibili, testo di "Fonti e metodi", riferimenti, testi della scena (`TESTI_SCENA_IT`) |
| `src/ui/format.ts` | unico formattatore (§ 11.13): U+2009, U+2212, spazio non separabile, cifre dall'incertezza, date e anni |
| `src/ui/console.ts`, `editorData.ts`, `regolo.ts`, `regoloLogica.ts`, `riproduzione.ts` | console temporale, editor della data, regolo a due livelli, motore della riproduzione |
| `src/ui/scheda.ts`, `datiScheda.ts` | scheda del corpo e calcolo di distanze, velocità, elementi, sorgente e affidabilità |
| `src/ui/trova.ts`, `cerca.ts`, `catalogo.ts` | combobox APG, normalizzazione e ricerca, catalogo con lune annidate e filtri con contatori |
| `src/ui/livelli.ts`, `distanze.ts`, `scala.ts` | livelli visivi e legenda (con la nota su come vedere l'eclittica della data); regolo delle distanze da 10³ km a 2·10⁵ UA, preset, +, −, Inquadra; barra di scala |
| `src/ui/vistaTestuale.ts` | tabella ordinabile, ripiego senza WebGL2 |
| `src/ui/dialoghi.ts`, `valoriValidazione.ts` | "Fonti e metodi", "Impostazioni", "Scorciatoie da tastiera"; tabella dei valori di accuratezza |
| `src/ui/avvisi.ts`, `annunci.ts`, `messaggi.ts` | messaggi in pagina, live region unica, testi di validazione, limiti, affidabilità, stagione |
| `src/ui/scorciatoie.ts`, `layout.ts`, `popover.ts`, `dom.ts`, `nodi.ts`, `icone.ts`, `simboli.ts` | tasti, classi di layout, pannelli a comparsa, utilità DOM, simboli dei corpi |
| `src/ui/dev/` | servizi fittizi per `ui-lab.html` (catalogo da `bodies.json` con dati fisici, effemeridi kepleriane, scena su Canvas 2D con la selezione della scena reale, ΔT e stagione approssimati) |
| `tests/ui/`, `e2e/ui-lab.spec.ts`, `e2e/ui-lab.config.ts` | Vitest e Playwright |

## 2. Integrazione

```ts
const store = creaStoreApp(adessoJdUT());
const canvas = document.createElement('canvas');
const etichette = document.createElement('div');
let api: ScenaApi | null = null;
try {
  api = creaScena({ canvas, etichette, catalogo, effemeridi, testi: TESTI_SCENA_IT });
} catch {
  api = null; // WebGL2 assente: vista testuale (§ 11.11)
}
const ui = creaInterfaccia(document.getElementById('app')!, {
  effemeridi, makeTimeState, adessoJdUT, preferenze, url, store, catalogo,
  scena: api ? adattaScena(api, canvas, etichette) : null,
  stagione: (t) => adattaStagione(stagioneAllaData(t)),
});
store.osserva((s) => s.tempo, (t) => api?.impostaTempo(makeTimeState(t.jd, t.scala)), { immediato: true });
dataStore.onCambio(() => { api?.invalidaDati(); ui.aggiornaTempo(); });
```

### 2.1 Dipendenze di `creaInterfaccia`

| Campo | Uso |
|-------|-----|
| `effemeridi` | `stateAt`, `orbitAt`, `affidabilita`, `pronto` (attesa dei blocchi in riproduzione) |
| `makeTimeState` | unico punto di conversione UT/TT; limiti in TT, ΔT e σ della console |
| `scena` | `ScenaUi` o `null` |
| `adessoJdUT` | "Adesso" e "Segui l'ora attuale" (da `src/app/clock.ts`) |
| `preferenze` | chiavi `ss.ui.livelli`, `ss.ui.filtri`, `ss.ui.unitaPasso`, `ss.ui.velocita`, `ss.ui.scorciatoie`, `ss.ui.rigaProlettica`, `ss.ui.benvenutoChiuso`; mai la data |
| `catalogo` | facoltativo all'avvio; altrimenti `impostaCatalogo()` |
| `url` | `UrlState`: lettura dello slug all'avvio e su `hashchange`, scrittura al cambio del corpo selezionato |
| `store` | facoltativo; altrimenti creato con `statoIniziale` (istante limitato all'intervallo, I2) |
| `datiInErrore` | facoltativo: `(jdTT) => boolean`, dati dell'istante mancanti per un errore di caricamento; la riproduzione si ferma invece di attendere e annuncia l'arresto una volta ("Riproduzione in pausa: dati non caricati", `alErrore` del motore, a riproduzione già ferma) |
| `stagione` | facoltativo: `(TimeState) => IngressoStagione \| null` |
| `valori`, `ora`, `copia`, `urlBase` | valori di accuratezza, orologio monotono, appunti, base del collegamento |

### 2.2 Controller

| Metodo | Effetto |
|--------|---------|
| `impostaCatalogo(c)` | indice di ricerca, catalogo, scheda, fasce del regolo, slug dell'hash, vista iniziale "Sistema interno" senza transizione |
| `aggiornaTempo(t?)` | ridisegna console, ΔT, stagione, scheda, tabella (al massimo 4 volte al secondo in riproduzione); `t` evita il ricalcolo |
| `aggiornaAffidabilita()` | dopo `reliability.bin`: scheda, catalogo, fasce del regolo |
| `impostaCaricamento({ jd0, jd1 } \| { testo } \| null)` | barra sottile "Caricamento dati per il periodo ..." con gli anni limitati all'intervallo ammesso; alla fine "Dati caricati." nella live region se il testo di caricamento vi era rimasto; in riproduzione la console indica solo "Riproduzione in attesa dei dati."; con la barra visibile sezione Orbita e vista testuale dicono "in caricamento" per i dati mancanti (al cambio di stato i pannelli si ridisegnano) |
| `mostraErrore(e)`, `rimuoviErrore(id)`, `erroreBlocco(id, jd0, jd1, riprova)` | messaggi del § 11.11; `bloccante` usa `role="alert"` |
| `notifica(id, testo)` | avviso informativo chiudibile (limite dell'intervallo con l'orologio di sistema fuori intervallo) |
| `annuncia(testo, { dalTempo })` | live region unica: un annuncio ogni 1,5 s; con la riproduzione attiva, compresa "Segui l'ora attuale", si scartano solo gli annunci con `dalTempo` (caricamento dei dati per l'istante raggiunto); quelli che seguono un'azione dell'utente si pronunciano sempre |
| `impostaDatiScheda(dati)` | sostituisce i dati calcolati per lo stesso corpo |
| `impostaStagione(s)`, `impostaDeltaT(i)` | valori forniti dall'integrazione; disattivano il calcolo interno |
| `senzaWebGL()` | messaggio bloccante e vista testuale permanente |
| `aggiornaVista()`, `mettiAFuoco(slug, opzioni)` | barra di scala, regolo delle distanze, etichetta della mappa; fuoco con transizione |

### 2.3 Store (`src/app/store.ts`)

`get()`, `set(patch)`, `aggiorna(ramo, patch)`, `osserva(selettore, cb, { immediato, uguale })`, `transazione(fn)`. Notifiche sincrone; le modifiche fatte dagli osservatori producono un nuovo giro al termine di quello in corso.

| Ramo | Contenuto | Chi scrive |
|------|-----------|------------|
| `tempo` | `{ jd, scala }`: istante nella scala d'ingresso, senza offset | interfaccia, motore della riproduzione |
| `offsetMinuti` | offset fisso (−720..+840, passo 15) o `null` | editor |
| `unitaPasso` | minuto ... millennio | console |
| `riproduzione` | `attiva`, `velocita` (indice in `VELOCITA_S`), `direzione`, `seguiOra`, `attesaDati` | console, motore |
| `selezionato`, `fuoco` | slug | interfaccia; `fuoco` anche dalla scena (`onCambioVista`) |
| `livelli`, `filtri` | livelli visivi e categorie attive | pannelli |
| `interfaccia` | vista testuale, scorciatoie, riga prolettica, scheda espansa, catalogo, foglio, benvenuto, editor, `regoloInTrascinamento` | interfaccia |

`interfaccia.regoloInTrascinamento` permette all'integrazione di avviare il caricamento dei blocchi al rilascio o dopo 150 ms di inattività (§ 5.6).

### 2.4 Differenze tra `ScenaApi` e `ScenaUi` (assorbite da `adattaScena`)

| `ScenaUi` | `ScenaApi` | Nota |
|-----------|------------|------|
| `zoom(f)`, f > 1 allontana | `zoom(f)`, f > 1 avvicina | l'adattatore passa 1/f |
| `impostaAmpiezza(km)` | `impostaEstensione(km)` | stessa grandezza: lato minore della vista |
| `mettiAFuoco(ssid, { ampiezzaKm, inquadratura, immediato, vistaSistema })` | `impostaFuoco(ssid, { inquadratura, transizione, vistaSistema })` | `ampiezzaKm` → `{ estensioneKm }`; `vistaSistema` dai preset dei sistemi planetari (camera a 30° sul piano del sistema, § 11.3) |
| `sposta(dx, dy)` in frazioni dell'altezza, y verso l'alto | `sposta(dxPx, dyPx)` | conversione in pixel |
| `corpoVisibileSuccessivo(da, verso)` | `corpiVisibiliOrdinati()` | ciclo nell'adattatore |
| livello `anelli` | `anelliPlanetari` | |
| `impostaFiltri(categorie, sempreVisibile)` | `impostaFiltri(categorie)` | la scena non mostra il corpo selezionato di categoria nascosta (§ 11.6); l'interfaccia mostra comunque l'avviso nella scheda, fuori dal corpo e quindi visibile anche con la scheda ridotta |
| `onSelezione(cb(ssid, info))` | `onSelezione(cb(evento))` | |

Identificatori dei preset uguali a `src/render/costanti.ts`. Testi della scena: `TESTI_SCENA_IT`.

### 2.5 Stagione (`src/time/seasons.ts`)

Ingresso dichiarato: `IngressoStagione = { stagione: 'primavera' | 'estate' | 'autunno' | 'inverno'; evento: 'equinozio' | 'solstizio'; giorniDopo: number }` (stagioni boreali dalla longitudine apparente del Sole sull'eclittica e sull'equinozio veri della data, `src/time/seasons.ts`). Testo: "Primavera boreale, 12 giorni dopo l'equinozio"; con 0 giorni interi "Primavera boreale, meno di un giorno dopo l'equinozio" (le 24 h dall'istante possono cadere in due giorni di calendario).

## 3. Comportamenti principali

- Layout per classi di larghezza (`data-layout`): desktop ≥ 1024 px, tablet 700-1023 px, telefono < 700 px (fino a 699 px); in orizzontale con altezza < 480 px (valutato prima della soglia dei 700 px, quindi anche a 700 px e più) il foglio è un pannello laterale di 320 px (`--ss-pannello-laterale`; sotto i 512 px di larghezza più stretto, con 160 px di mappa per legenda e pulsanti) e la mappa occupa l'area a sinistra del pannello; sotto i 684 px la barra superiore occupa tutta la larghezza e il pannello comincia sotto di essa. Messaggi e nota di benvenuto: sul telefono sotto la legenda, accanto alla colonna dei pulsanti della mappa e sopra il foglio; sul desktop al centro, tra Catalogo e Scheda (larghezza `min(520px, 100% - 768px)`, simmetrica attorno al centro); sul tablet a destra del regolo delle distanze o, con i pulsanti in riga (`data-distanze='riga'`), a destra della legenda (348 px), accanto al pannello aperto; sul tablet stretto (sotto i 736 px, sotto i 940 px con i pulsanti in riga: accanto alla Scheda resterebbero W - 536 o W - 740 px, meno di 200) nella colonna della Scheda (320 px a destra), anche senza pannello, e la Scheda comincia sotto di essi (`--ss-alto-messaggi`): con la Scheda la colonna va dalla barra a 16 px dalla console, la Scheda conserva l'intestazione con nome e comandi (`--bersaglio` + 17 px: bordi, padding superiore di 10 px, i 4 px dell'anello del focus sotto i comandi e 1 px) e i messaggi hanno `max(min(120px, colonna - 8px - intestazione), colonna - 136px)` (`--ss-minimo-messaggi`, `--ss-fuori-messaggi`): fino a 120 px del resto, poi la Scheda fino a 128 px; se il resto (`--ss-resto-colonna`) dista meno di 1 px dall'altezza di un pulsante, i messaggi hanno quella, così la nota ridotta entra intera e alla Scheda restano bordo, padding e pulsanti; quello che non entra scorre (la sfumatura è di `min(40px, 30%)`); con il Catalogo aperto stanno alla sua destra; su desktop e tablet sotto la barra e sopra console e legenda (con i pulsanti in riga la legenda è alla loro sinistra e non si sottrae l'altezza), con altezza massima in unità della finestra (letta da `aggiornaNota`) e scorrimento se lo spazio in altezza non basta; caricamento ed errori precedono la nota (`.ss-avvisi` con `display: contents`) e restano in cima quando la nota scorre; il bordo oltre il quale c'è altro contenuto sfuma (`data-scorri` con `mask-image`, aggiornato allo scorrimento, nella consegna del ResizeObserver e con le altezze; in cima basta 1 px di contenuto in più, più in basso la tolleranza è di 1 px), per non più del contenuto nascosto oltre quel bordo (`--ss-oltre-su`, `--ss-oltre-giu`: a 320 × 568 i 9 px in più danno una sfumatura di 9 px, non di 40); sul telefono, con il pulsante "Apri la scheda" (`data-chip='si'`), i messaggi finiscono 8 px sopra di esso; la barra superiore (z-index 27) sta sopra i messaggi (24, sul telefono 26), quindi risultati di Trova, Catalogo, Livelli e Menu non sono coperti; il menu Viste aperto porta la colonna delle distanze sopra i messaggi; in orizzontale in testa al pannello laterale, fuori dalla parte che scorre: il pannello comincia sotto di essi (`--ss-alto-messaggi`) e, quando crescono, il controllo con il focus resta visibile; senza WebGL2 stanno nella vista testuale, che scorre per intero, senza altezza massima né scorrimento proprio. Altezze di legenda, console, foglio, messaggi e Scheda (`--ss-alto-*`) dal ResizeObserver di `index.ts`, senza fotogrammi con i messaggi sopra legenda, console, foglio o Scheda: nella consegna si scrive solo ciò che lo evita, cioè legenda, console e foglio più alti nelle copie dei messaggi (stile in linea di `.ss-messaggi`, che cambiano solo i messaggi e il loro contenuto) e messaggi più alti in `--ss-alto-messaggi`; i messaggi sono osservati attraverso una sonda (`.ss-messaggi-sonda`, riquadro vuoto delle loro dimensioni, un livello sotto legenda e console nel DOM), notificata nello stesso fotogramma (Resize Observer, W3C, § 3.4.1 e § 3.6.1). Diminuzioni, variabili dell'applicazione, colonna delle distanze e forma della nota si aggiornano in un `requestAnimationFrame` (`pianificaAltezze`), nell'ordine delle dipendenze (console, colonna delle distanze, legenda, foglio, nota, messaggi, Scheda) e prima della consegna di quel fotogramma: al fotogramma successivo a un cambio consegnato; nello stesso fotogramma dopo un cambio di finestra o di layout e dopo un cambio del contenuto dei messaggi da un compito (MutationObserver). Scritte durante la consegna, le variabili dell'applicazione cambierebbero elementi osservati, anche dalle zone della scena, alla stessa profondità o a una minore, notificati solo al fotogramma dopo con l'errore "ResizeObserver loop completed with undelivered notifications". L'errore resta possibile, senza effetti visibili, in orizzontale e sul tablet stretto quando i messaggi crescono per un cambio nato dentro un fotogramma o per i caratteri caricati: `--ss-alto-messaggi` sposta allora pannello laterale o Scheda durante la consegna. Mappa, colonna delle distanze, legenda e messaggi stanno in `main` con il titolo `h1` nascosto; le zone dei pannelli si raccolgono dall'intero `.ss-app`. Su telefono e in orizzontale catalogo e scheda si spostano nel foglio. Sul tablet catalogo, scheda e vista testuale si alternano. Su desktop e tablet il Catalogo sta sopra la legenda (`max-height` al netto di `--ss-alto-legenda`); se lì restano meno di 160 px arriva a 160 px, o fino alla console, e copre la legenda finché resta aperto. Il foglio non fa da blocco contenitore per l'editor (fondo e sfocatura su uno pseudo-elemento); con l'editor aperto il foglio sale sopra pannelli e barra (`data-editor`). Anche console e colonna delle distanze hanno la sfocatura su uno pseudo-elemento: con il `backdrop-filter` sull'elemento, che diventa Backdrop Root (Filter Effects Level 2, § 3), editor e menu Viste non sfocherebbero la scena. La colonna delle distanze sta tra barra e console: regolo verticale da 100 a 180 px se c'è posto, altrimenti i soli pulsanti, in colonna o in riga (`data-distanze`); in riga (206 px) i pulsanti stanno in cima alla colonna e la legenda scende al margine sinistro, sotto di essi, più larga (348 px) perché non salga sotto la barra superiore. Sul telefono, con il foglio medio e il pulsante della scheda, la console scorre perché il pulsante resti sotto la legenda (`data-chip`).
- Selettore della velocità nel foglio compatto ed esteso: larghezza dell'opzione più lunga; la data può andare a capo. La nota di benvenuto si nasconde con il foglio esteso del telefono (non è chiusa, la preferenza resta com'è e il focus che conteneva passa al pulsante della data). Su desktop e tablet è ridotta (`data-forma='ridotta'`) quando `.ss-messaggi` è largo meno di 200 px o ha un'altezza massima di 120 px al più (`aggiornaNota` in `index.ts`, dopo ogni cambio di layout, di pannello e di `data-distanze` e al fotogramma successivo a ogni cambio di altezza; misure che non dipendono dalla forma della nota né dalla barra di scorrimento, quindi senza alternanze): il testo lascia il posto al comando "Leggi la nota di benvenuto" (`aria-haspopup="dialog"`), che apre lo stesso testo in un `<dialog>` modale e riceve il focus alla chiusura; se il comando sparisce con il focus, o mentre il dialogo è aperto, il focus passa alla nota: alla chiusura del dialogo (Esc, "Chiudi" o clic sullo sfondo) `creaDialogo` chiude e sposta il focus nello stesso compito, sull'origine se visibile, altrimenti sul rifugio (la nota, o il pulsante della data senza la nota), mai sul body. Nella nota ridotta l'anello del focus sta dentro i pulsanti (`outline-offset: -4px`), che sono a filo del contenitore dei messaggi. Menu Viste (`collocaPreset` in `distanze.ts`, a ogni apertura e cambio di finestra, console o `data-distanze`): limiti in `scroll-margin` (sotto la barra, dentro i margini), una colonna se entra, altrimenti due (`data-colonne='2'`, griglia per colonne, ordine di Tab uguale a quello visivo), poi lo spostamento minimo (`transform`) che lo porta dentro i limiti; con i pulsanti in riga si apre sotto la riga. La voce con il focus (`li:focus-within`) ha `z-index: 1`: nella griglia ogni voce si dipinge per intero dopo la precedente e lo sfondo `:hover` della voce sotto copriva l'anello. I popover hanno `scroll-padding-block: 4px`: la voce portata al bordo con Tab (Menu del telefono) mostra l'anello intero. Menu Viste e Menu del telefono si riaprono con `scrollTop` 0 e si chiudono quando il focus esce da pulsante e pannello (`chiudiFocusFuori` di `creaDisclosure`).
- Foglio inferiore: compatto (64 px: data, riproduzione, velocità), medio (console completa), esteso (scheda o catalogo); maniglia con `aria-expanded`; trascinamento della presa; il foglio segue `VisualViewport`. "Inquadra" della scheda sul telefono porta il foglio a compatto (`index.ts`, `creaScheda`: `inquadra`) e il focus al pulsante "Apri la scheda" (`chipScheda`), o alla maniglia se la vista testuale lo nasconde. Il pulsante "Apri la scheda" non compare con la vista testuale aperta o senza WebGL2 (`aggiornaVisibilita`: `!vt`).
- Riproduzione: `jd = jd_inizio + v·(t - t_inizio)` con `performance.now()`, riancoraggio a ogni cambio di velocità, direzione, scala o data; arresto ai limiti con messaggio; attesa dei blocchi con `effemeridi.pronto`.
- Pannelli numerici al massimo 4 volte al secondo in riproduzione; tabella ferma in riproduzione; regolo ridisegnato a ogni fotogramma.
- Editor: validazione con Invio in un campo o uscita dal gruppo (Invio sui pulsanti dell'era li attiva), solo se i campi sono stati modificati e il focus esce dall'editor (Vai conferma, Chiudi ed Esc annullano); con ora e minuti invariati si conservano i secondi; campi non modificati riallineati all'istante (riproduzione, "Segui l'ora attuale"); `aria-invalid` sul gruppo e sul campo; proposte "Vai al 4 ottobre" e "Vai al 15 ottobre"; limiti in UT dopo l'offset, in TT con i limiti convertiti e il primo minuto ammesso arrotondato per eccesso.
- Regolo: le frecce eseguono il passo senza annuncio; la data si annuncia al rilascio del tasto, salvo se l'ultimo passo si è fermato al limite (resta il messaggio del limite). Ricerca: frecce e `aria-activedescendant` nell'ordine mostrato (gruppi per categoria). Scorciatoie [ e ] anche con Alt (Opzione su macOS, AltGr).
- Passi e regolo con i limiti di `steps.ts` (un risultato di calendario entro 1 ms da un limite è il limite, anche in TT); al limite `aria-disabled` e messaggio nella live region. Pulsanti della scala del regolo con `aria-disabled` a 1 giorno e 12 000 anni. Tacche del regolo inferiore: unità da 1 ora a 5000 anni (giorni 1, 2, 5, 10, 15); se nessuna etichetta maggiore entra intera, la tacca minore più vicina all'ago riceve la propria; con unità di più anni l'1 d.C. sostituisce il multiplo 0 solo se dista dalla tacca successiva almeno la distanza minima delle etichette; con unità di giorni (2, 5, 10, 15) si omette la tacca che il salto del 5-14 ottobre 1582 porta a meno di mezza unità dalla precedente (16 ottobre con tacche ogni 15 giorni; `confini()` parte 40 giorni prima dell'intervallo per conoscere la tacca precedente, così l'esito non dipende da quanta parte del regolo si vede).
- Regolo delle distanze: 10³ km in alto, accanto a +; il valore è il livello di avvicinamento, quindi FrecciaSu, FrecciaDestra e PagSu avvicinano come PagSu sulla mappa; Home porta alla vista più ampia, Fine a 10³ km.
- Pulsanti + e − delle distanze, tasti di zoom della mappa (+, −, PagSu, PagGiù) e regolo delle distanze (frecce, PagSu, PagGiù, Inizio e Fine; rilascio del puntatore): dopo il ridisegno della vista (300 ms) annuncio "Vista ampia ..." con l'ampiezza ottenuta, non quella richiesta; se la vista si ferma prima del richiesto (con Inizio e Fine sempre), messaggio di distanza minima o massima, senza l'ampiezza se non è cambiata, e `aria-disabled` su + e − finché la vista non cambia. Sul regolo frecce, PagSu e PagGiù chiamano lo stesso zoom relativo dei pulsanti (`zoomDaPulsante`); Inizio e Fine impostano l'estremo senza muovere la vista contro il verso richiesto (`vaiAllEstremo`). Un unico riscontro (`riscontroDopoRidisegno` di `distanze.ts`) serve tutti i comandi; il tasto tenuto premuto produce un solo annuncio.
- Inquadra (pulsante, F) su un corpo senza posizione alla data: la scena resta sul corpo d'origine e l'annuncio è "Posizione di ... non determinabile a questa data" (preposizione articolata per Sole, Terra e Luna: "della Luna") (`fuocoSenzaPosizione` dello stato della vista). Contesto WebGL perso: messaggio "Grafica 3D sospesa, ripristino in corso" fino al ripristino (`contestoPerso`).
- "Segui l'ora attuale": selettore della velocità disattivato su "1 s/s" e verso con `aria-disabled` (clic e [ ] annunciano il motivo); il passaggio all'ingresso in TT ferma la riproduzione, come lo spegnimento dell'opzione. Attivazione e disattivazione sono annunciate ("Segui l'ora attuale: attivo", "Segui l'ora attuale: disattivato"). Lo spegnimento da un passo, da "Adesso", dal regolo, dall'editor o dall'ingresso in TT si annuncia una volta: `impostaTempo` ricorda l'uscita non ancora detta e `annunciaData` o `avvisaLimite` la uniscono al proprio annuncio (`T.annunci.conSeguiDisattivato`, "<data>. Segui l'ora attuale: disattivato"; il messaggio in pagina del limite resta senza), perché due annunci ravvicinati si sostituirebbero; l'ingresso in TT, che non annuncia altro, la dice da solo.
- Focus (WCAG 2.4.3): chiudendo un messaggio, la nota di benvenuto o premendo "Riprova" il focus passa al pulsante della data (o al campo Trova), e al nuovo "Riprova" se il tentativo fallisce; la vista testuale ridisegnata riporta il focus sul pulsante dello stesso corpo (o sulla tabella); la selezione dal catalogo che lo chiude (tablet, telefono), la selezione dalla tabella sul telefono (il foglio esteso copre la riga) e "Mostra le ..." della scheda portano il focus sul titolo della scheda; il pulsante dell'avviso dei filtri si ricrea solo al cambio di categoria; al cambio di layout il focus nel catalogo, nella scheda o nei messaggi torna all'elemento che lo aveva e nel foglio il pannello aperto o con il focus resta visibile (foglio esteso); un controllo che il nuovo layout nasconde (regolo, passi e "Adesso" nel foglio ridotto, cursore delle distanze sul telefono e in orizzontale) cede il focus alla maniglia (telefono) o al pulsante della data (`aggiornaLayout`); "Mostra di nuovo la nota di benvenuto" chiude Impostazioni e porta il focus sulla nota.
- "Copia collegamento": esito visibile sotto i pulsanti (conferma per 4 s; con gli appunti non disponibili, URL in un campo di sola lettura già selezionato) e annuncio anche in riproduzione.
- Ricerca: il messaggio "Nessun corpo per ..." si nasconde all'uscita dal campo e torna al rientro; una selezione da catalogo, mappa o collegamento svuota la ricerca superata. Avviso del limite: resta solo con l'istante al limite indicato (Inizio e Fine del regolo lo tolgono).
- Vista testuale sul desktop: con la scheda ridotta passa sotto la scheda a tutta larghezza (`data-scheda="ridotta"`); l'intestazione delle coordinate va a capo. Senza WebGL2 accoglie i messaggi in pagina e scorre per intero; sugli schermi alti fino a 640 px la tabella non ha uno scorrimento verticale proprio. Sul telefono con il foglio esteso la tabella è ridotta a pochi pixel: il suo contenitore (`.ss-tabella-scorri`) è `inert` (`VistaTestuale.copri`, chiamata da `aggiornaVisibilita` con vista testuale, telefono e foglio esteso), quindi intestazioni e righe escono dall'ordine di Tab e dall'albero di accessibilità e tornano con il foglio ridotto; il focus che contenevano passa alla maniglia del foglio.
- Hash: testo decodificato, slug confrontato in minuscolo; ogni testo non vuoto che non corrisponde a un corpo produce il messaggio con quel testo (al più 40 caratteri); l'hash vuoto toglie il messaggio; un collegamento seguito dopo l'avvio annuncia "Corpo selezionato: ...".
- Scheda senza elementi orbitali: la sezione Orbita dice "Dati in caricamento." solo con lo stato 'caricamento' e la barra di caricamento visibile (`ContestoScheda.caricamentoInCorso`, fornito dall'interfaccia da `impostaCaricamento`; `testoOrbitaSenzaElementi`), altrimenti "Elementi non disponibili a questa data."; dopo l'errore di un blocco lo stato resta 'caricamento' ma la barra non c'è.
- Scheda senza posizione alla data (dati in caricamento o fuori copertura, posizione non determinabile per stato o livello): una frase sotto il titolo "Ora", senza distanze né velocità ("Dati in caricamento." solo con la barra di caricamento visibile, altrimenti "Dati non disponibili a questa data.", anche dopo l'errore di un blocco o di `moon.bin`: `testoSenzaPosizione(dati, caricamentoInCorso)`, usata anche da "Leggi posizione", che conserva il valore dell'ultimo ridisegno); con il livello non determinabile niente anomalia media e passaggio al pericentro, errori oltre 90° come "> 90°" e nessun anello di selezione nella scena. Velocità con le cifre dell'errore stimato; GM sotto 10⁻³ km³/s² in m³/s²; licenza CC BY delle mappe con URI e modifiche dichiarate.
- Eccentricità della scheda (`testoEccentricita`, `limitaIncertezzaE`): con la forma determinata incertezza non superiore a |1 - e|·(δq/q ⊕ δa/a), così le comete quasi paraboliche restano dal lato di 1 indicato da periodo o "Orbita iperbolica"; "≈ 1 (quasi parabolica)" se il valore arrotondato non resta dal lato di 1; "non determinabile" con δe ≥ 1 e δe ≥ |1 - e|.
- Riferimento degli elementi dei pianeti: "eliocentrici del baricentro Terra-Luna" per la Terra, "del baricentro del sistema di ..." per i pianeti con satelliti.
- Tastiera: ordine di tabulazione del § 11.9, uguale all'ordine visivo anche nella console: `disponi(m)` di `console.ts`, chiamato da `aggiornaLayout` al cambio di layout, mette il regolo prima dei passi fuori dal desktop (nessun `order` CSS; il focus torna all'elemento che lo aveva); tasti della mappa sul contenitore `role="application"`; scorciatoie globali disattivabili, ignorate nei campi, Spazio ignorato su pulsanti e caselle.
- Fasce di affidabilità della panoramica: livello valutato in 240 punti dell'intervallo e all'istante mostrato per il corpo selezionato, con ε_ΔT dalla velocità angolare media dell'orbita alla data della selezione (`CalcolatoreScheda.bandeAffidabilita`), uguali con qualsiasi blocco in memoria; tra due punti di livello diverso il passaggio si cerca per bisezione a meno di un giorno, così gli anni di titoli e descrizione sono quelli veri e alla data mostrata la fascia ha il livello della scheda (salvo l'effetto della velocità angolare media per le orbite eccentriche); se lo stato del corpo alla data manca, le fasce arrivano con i dati. Oltre al colore, l'altezza della fascia segue le barre piene dell'icona (8, 6, 4, 2 px; vuota se non determinabile), anche con i colori forzati; ogni fascia ha un titolo con livello e anni e il regolo è descritto da un testo con gli intervalli ("Affidabilità della Terra nell'intervallo: approssimata dal 10000 a.C. al ...").

## 4. Pagina di prova

`npx vite` e poi `ui-lab.html`. Parametri: `?jd=<JD UT>`, `?benvenuto=0`, `?webgl=0`, `?caricamento=1`, `?errore=1`, `#slug`. `window.__uiLab` espone store, controller, scena fittizia (con registro delle chiamate e `geometria(slug)`, posizione, disco ed etichetta del corpo come disegnati) ed effemeridi.

La scena fittizia usa `Selettore` di `src/render/picking.ts` (§ 11.5.3): marcatori, dischi ed etichette sono candidati come nella scena reale, i clic ripetuti sullo stesso punto passano al candidato successivo e un clic senza candidati non emette eventi e lascia la selezione. Le soglie sono quelle di `src/render/costanti.ts`. Restano semplificati disegno, proiezione ortografica e raggio del disco circolare.

Prove: `npx vitest run tests/ui`; `NODE_USE_ENV_PROXY=1 npx playwright test -c e2e/ui-lab.config.ts` (la configurazione avvia Vite sulla porta 5199; i caratteri di Google Fonts si scaricano dal processo di prova attraverso il proxy dell'ambiente, altrimenti si usano quelli di ripiego). Schermate in `test-results/interfaccia/`.

## 5. Esiti (22/10/2026)

| Comando | Esito |
|---------|-------|
| `npx tsc --noEmit` | nessun errore nei file dell'interfaccia |
| `npx eslint src/ui src/app tests/ui e2e/ui-lab.spec.ts e2e/ui-lab.config.ts` | nessun errore, nessun avviso |
| `npx vitest run tests/ui` | 13 file, 215 test superati |
| `npx playwright test -c e2e/ui-lab.config.ts` | 16 test superati: A12 (320, 400, 768, 1280 px e orizzontale), A13, A14 (movimento ridotto, colori forzati, contrasto elevato), A15 (axe-core, 16 stati, nessuna violazione grave o critica), A16, A17, A23, selezione al clic della scena di sviluppo |

Contrasti ricalcolati dai token e dai colori disegnati nella scena (A11): tutti i valori delle tabelle del § 11.1 entro 0,05; testo ≥ 4,5:1 e bordi ≥ 3:1 anche sui pannelli a opacità 0,94 e 0,90 su bianco; tinta dei token verdi e dei colori verdi della scena tra 150° e 160°. I simboli (`simboli.ts`) leggono i colori da `COLORE_CATEGORIA` di `src/render/costanti.ts`, unica sorgente con la scena.

## 6. Scelte e scostamenti

| Punto | Scelta |
|-------|--------|
| § 11.1, `--linea` | #23443A ha tinta 161,8°, fuori da 150-160°; si usa #234438 (158,2°), decorativo |
| § 11.3, foglio medio | circa 360 px a 400 px di larghezza e 380 px a 320 px (console completa con regolo a due livelli, passi e riproduzione su due righe), contro "circa 240 px"; lo stato compatto resta di 64 px |
| § 11.3, regolo delle distanze | mostra l'ampiezza della vista (lato minore), la stessa grandezza dei preset |
| § 11.6, normalizzazione | rimuove anche parentesi e punti delle designazioni |
| § 11.6, testo secondario | `dettaglioRicerca`: il nome ufficiale si omette se il nome lo contiene come parola intera (confronto tra spazi: "Europa" in "52 Europa", "9P/Tempel" in "9P/Tempel 1"; "Pluto" non è in "Plutone"); resta la designazione |
| § 11.9, nomi accessibili | "Tabella: vista testuale" per il pulsante "Tabella"; il nome del pulsante della data usa la forma mostrata (estesa, o breve nel foglio del telefono), senza virgola tra data e ora (WCAG 2.5.3) |
| § 11.7, Luna | elementi geocentrici nell'eclittica J2000 (la Luna non usa il modello dei satelliti né il piano F) |
| § 11.7, satelliti | elementi nel piano F alla data (`EphemerisService.matriceF`): nei record secolari dei satelliti regolari F segue il polo del primario (§ 7.5.4); senza il metodo si usa R_F del catalogo |
| § 11.9, vista testuale | coordinate eliocentriche; corpo selezionato sempre in tabella anche se la categoria è nascosta; "non applicabile" per distanza dal Sole, coordinate e affidabilità del Sole e per la distanza dalla Terra della Terra; cifre delle distanze come nella scheda; longitudine e latitudine con i decimali dell'errore angolare visto dal Sole, ordinate da 0° a 360°; colonna Corpo ordinata con `Intl.Collator('it', { numeric: true })` (1P, 9P, 12P, 103P); senza posizione alla data (dati in caricamento o in errore) nessun livello, come nella scheda (`CalcolatoreScheda.rigaTestuale`); celle senza valore: "non applicabile", "in caricamento" (`RigaTestuale.inCaricamento`, vero con lo stato 'caricamento' del corpo o della Terra, e solo con la barra di caricamento visibile) o "non disponibile" (`testoSenzaValore`) |
| § 11.14, TNO | sigla con `abbr` ("oggetti transnettuniani") nei filtri e nella legenda; per esteso come titolo di sezione del catalogo |
| A23 | `valoriValidazione.ts` contiene solo numeri, unità e nomi propri; i nomi delle righe sono in `testi.it.ts` |
