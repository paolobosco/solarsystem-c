# Debug (fase F5)

Registro provvisorio della fase F5 del § 14.1 di `docs/PROGETTO.md`: errori formali, di dati e logici, ciascun rilievo con verifica indipendente.

## 1. Stato del documento

- Stato: provvisorio. Data: 22/10/2026.
- Criterio di uscita (§ 13 e § 14.1 di `docs/PROGETTO.md`): zero segnalazioni critiche o alte aperte e due cicli consecutivi senza nuove segnalazioni.
- Esito: criterio di uscita non raggiunto.
  - Segnalazioni critiche o alte aperte: nessuna tra quelle verificate. Il registro non contiene rilievi critici; i cinque rilievi di gravità alta verificata (ciclo 1, n. 79 e 80; ciclo 4, n. 33; ciclo 5, n. 25 e 26) sono corretti. I punti noti non verificati (§ 6.2) non hanno una gravità assegnata.
  - Cicli consecutivi senza nuove segnalazioni: zero. Ogni ciclo ha prodotto rilievi confermati (83, 53, 43, 37 e 29). Dopo il ciclo 5 il passaggio del 22/10/2026 ne ha confermati altri 15 su 17; il passaggio successivo sulla nota di benvenuto e sul menu Viste (§ 4.3) ha corretto 20 difetti, 11 dei quali trovati dalle sue tre verifiche indipendenti.
  - Restano 2 rilievi confermati e non corretti (§ 6.1), 11 punti noti non verificati (§ 6.2) e 9 punti emersi nei passaggi del 22/10/2026 e non corretti (§ 6.3).
- Legenda: categoria formale, logico o dati; gravità come segnalata e, dopo la freccia, come verificata (una sola voce se coincidono; n.r. se la verifica non l'ha registrata); area come nel registro della ricerca.

## 2. Metodo di ogni ciclo

1. Ricerca per aree (applicazione, build-test, catalogo, documentazione, effemeridi, interfaccia, pipeline-dati, rendering, tempo): ogni rilievo ha titolo, area, categoria e gravità segnalata.
2. Unione dei duplicati: i rilievi equivalenti diventano uno solo; le segnalazioni duplicate sono scartate e contate.
3. Verifica indipendente di ogni rilievo distinto, con verdetto (confermata, confermata in parte, respinta) e gravità verificata.
4. Correzione di ogni rilievo confermato con una prova di regressione che fallisce sul codice precedente e passa dopo la correzione.
5. Suite completa e rapporto di regressione: `npm run check`, `npm run build`, build di test e della pagina singola, Playwright, pytest, ruff, ricerca di U+2014. Le misure rimaste indietro nei documenti sono riallineate.

Dopo il ciclo 5 la verifica e la correzione procedono per gruppi di gravità (§ 4).

## 3. Riepilogo per ciclo

Data: giorno del commit con le correzioni. I rilievi di ricerca sono quelli proposti dalla ricerca; i distinti sono quelli inviati alla verifica.

| Ciclo | Rilievi della ricerca | Uniti come duplicati | Rilievi distinti | Confermati | Respinti | Corretti | Data | Commit |
|-------|-----------------------|-------------------------|------------------|------------|----------|----------|------|--------|
| 1 | 103 | 18 | 85 | 83 | 2 | 83 | 19/10/2026 | `0bcadf3` |
| 2 | 60 | 6 | 54 | 53 | 1 | 53 | 20/10/2026 | `61549c3` (parziale), `66fba48` |
| 3 | 46 | 1 | 45 | 43 | 2 | 43 | 20/10/2026 | `61549c3` (parziale), `66fba48` |
| 4 | 39 | 1 | 38 | 37 | 1 | 37 | 20/10/2026 | `66fba48` |
| 5 | 30 | 0 | 30 | 29 | 1 | 27 | 21/10/2026 | `73d403a`, `6ad2c60`, `c3ef6d9`, `92a4f93`, `316ccb8` |
| Totale cicli 1-5 | 278 | 26 | 252 | 245 | 7 | 243 | | |
| Dopo il ciclo 5 | | | 17 | 15 | 2 | 15 | 22/10/2026 | non ancora registrato |

Ciclo 5: dei 29 rilievi confermati, 2 non sono corretti (§ 6.1). Il commit `66fba48` riporta 216 segnalazioni confermate nei cicli 1-4, tutte corrette (83 + 53 + 43 + 37).

### 3.1 Rapporti di regressione

Rapporto registrato al termine di ogni ciclo. Nei cicli 1-4 nessuna correzione ha introdotto regressioni nel codice; sono stati riallineati solo conteggi, dimensioni e misure rimasti indietro nei documenti. `npm run build`, build di test e build della pagina singola riusciti, ruff senza errori, nessun U+2014 nel repository.

| Ciclo | `npm run check` (Vitest) | Playwright (suite standard) | Laboratori (ui-lab, render-lab) | pytest (`.venv`) |
|-------|--------------------------|-----------------------------|---------------------------------|------------------|
| 1 | 47 file, 485 prove | 84 su 84 | 15 su 15; 6 su 6 | 239 superati, 1 saltato |
| 2 | 52 file, 547 prove | 102 superate | 15 superate; 10 superate | 254 superati, 1 saltato |
| 3 | 59 file, 612 prove | 138 su 138 | 15 su 15; 10 su 10 | 274 superati, 1 saltato |
| 4 | 61 file, 658 prove | 152 su 152 | 15 su 15; 10 su 10 | 285 superati, 1 saltato |
| 5 | rapporto di ciclo non registrato; suite dei passaggi nel § 4 | | | |

Il test saltato di pytest richiede il modulo `assist`, presente solo in `.venv-assist`.

## 4. Passaggi mirati dopo il ciclo 5

### 4.1 21/10/2026

Correzione dei rilievi del ciclo 5 per gruppi di gravità. Suite al termine di ogni commit, come da messaggio del commit.

| Commit | Rilievi del ciclo 5 | Contenuto | Vitest | Playwright | pytest |
|--------|---------------------|-----------|--------|------------|--------|
| `73d403a` | 2, 25, 26 | due rilievi di gravità alta dell'interfaccia su telefono; prova A21 resa stabile | 658 | 156 | 285 |
| `6ad2c60` | 1 | porte dedicate delle prove e2e (4273 e 4274), nessun riuso di server già attivi | 664 | 156 | 285 |
| `c3ef6d9` | 14, 15, 16, 27 | quattro rilievi di gravità media | 674 | 160 | 285 |
| `92a4f93` | 6, 7, 8, 17, 24 | cinque rilievi verificati (confermati in parte) | 686 | 162 | 293 |
| `316ccb8` | 9, 10, 11, 12, 13, 18, 19, 20, 21, 22, 23, 28, 29, 30 | quattordici rilievi di gravità bassa | 696 | 183 | 298 |

Esito: 27 rilievi corretti, 2 confermati e non corretti (n. 3 e 4), 1 respinto (n. 5). I titoli sono nel § 5.5.

### 4.2 22/10/2026

Diciassette rilievi emersi dopo il ciclo 5, non compresi nei cicli numerati, verificati uno per uno. Esito: 15 confermati (5 in parte) e corretti, 2 respinti. Il commit non esiste ancora.

| n. | Area | Gravità | Titolo | Verdetto | Esito |
|----|------|---------|--------|----------|-------|
| 1 | catalogo | bassa | Hektor: albedo SBDB 0,025 non ricalcolata dopo la sostituzione del diametro | confermata in parte | corretto: albedo SBDB non adottata, scheda «non noto»; non ricalcolata da D e H |
| 2 | catalogo | bassa | Inclinazione dell'asse ricavata da poli di letteratura (Arrokoth, Hektor) mostrata senza incertezza | confermata in parte | corretto: incertezza propagata al primo ordine per Arrokoth (0,994°) e Hektor (9,833°); la scheda non mostrava l'inclinazione; poli SBDB senza incertezza (§ 6.3) |
| 3 | catalogo | bassa | Interamnia: ellissoide della fonte (362 x 348 x 310 km) incoerente con il diametro dichiarato (332 km) | respinta | nessuna correzione: il catalogo usa la sfera di raggio 166 ± 3 km (D = 332 ± 6 km, Hanuš et al. 2020), non un ellissoide |
| 4 | pipeline | bassa | catalog.py stampa come byte un conteggio di caratteri | confermata | corretto: il messaggio riporta la dimensione effettiva del file |
| 5 | pipeline | bassa | Data di generazione e versioneDati cambiano a ogni rigenerazione anche senza modifiche ai dati | confermata in parte | corretto: valori conservati se i dati non cambiano, aggiornati altrimenti |
| 6 | interfaccia | media | Nota di benvenuto (e messaggi) sovrapposta ai pulsanti della mappa e alla legenda; a 700x500 esce dallo schermo | confermata in parte | corretto: non copre più legenda, pulsanti, console e scheda; sotto 200 px liberi non si mostra |
| 7 | interfaccia | media | Telefono, vista testuale con foglio esteso: circa 107 controlli invisibili restano nell'ordine di Tab | confermata | corretto: tabella inerte con il foglio esteso (119 controlli, 118 non visibili) |
| 8 | rendering | bassa | L'etichetta di un altro corpo può coprire alla vista il marcatore selezionato | confermata | corretto: marcatore e anello del corpo selezionato sono zona occupata per le altre etichette (§ 11.5.2) |
| 9 | interfaccia | bassa | Dopo un errore di caricamento di un blocco, «Ora» della scheda e «Leggi posizione» dicono ancora «Dati in caricamento» | confermata | corretto: «Dati non disponibili a questa data.» |
| 10 | interfaccia | bassa | Un errore di caricamento che ferma la riproduzione non viene annunciato | confermata | corretto: l'arresto è annunciato una volta |
| 11 | interfaccia | bassa | Le uscite implicite da «Segui l'ora attuale» non annunciano «disattivato» | confermata | corretto: «disattivato» in un solo annuncio con la data o il limite |
| 12 | interfaccia | bassa | Trova: a parità di rilevanza i risultati sono ordinati come testo (103P prima di 12P) | confermata | corretto: nomi confrontati con i numeri come numeri |
| 13 | codice | bassa | Controllo dei limiti di data duplicato nella console con tolleranze diverse | confermata in parte | corretto: definizione unica con `limiteRaggiunto`; la descrizione delle tolleranze nel rilievo era errata |
| 14 | codice | bassa | Scena di sviluppo scenaFinta.ts non allineata alla nuova selezione | confermata | corretto: la scena di sviluppo usa `Selettore` |
| 15 | strumenti | bassa | Cartelle dist-test-* non escluse da git né da ESLint | confermata | corretto: `dist-test*/` in `.gitignore` e in `eslint.config.js` |
| 16 | documentazione | bassa | docs/SPIKE.md e docs/_parti/rendering.md riportano numeri superati | confermata | corretto: numeri rimisurati o datati; prova e2e di occlusione stabilizzata; prova di coerenza di `docs/SPIKE.md` in `tests/docs` |
| 17 | interfaccia | non applicabile | Regolo inferiore, ottobre 1582: con tacche mensili 1 ottobre e 1 novembre distano 21 giorni | respinta | nessuna correzione: 21 giorni sono la conseguenza della riforma (ottobre 1582 ha 21 giorni); date delle tacche corrette; distanza 0,69 unità (63,6 px), vuoto tra le etichette 20,9 px |

Suite al termine del passaggio (22/10/2026): Vitest 64 file e 714 prove (`npm run check`); pytest 304 superati e 2 saltati (9 superati nei due file ASSIST in `.venv-assist`); ruff senza errori; Playwright 191 prove superate (progetti desktop 181, mobile 7, pagina singola 3), `e2e/ui-lab.config.ts` 16 su 16, `tests/render/playwright.render.config.ts` 10 su 10; `npm run build:artifact`: 73 file, 47 536 751 byte (47,54 MB), file più grande 5 331 816 byte.

### 4.3 22/10/2026, nota di benvenuto e menu Viste

Correzioni dell'interfaccia su desktop, tablet e telefono in due giri, tre verifiche indipendenti e correzione dei difetti residui. Ogni prova nuova o estesa non è superata sul codice precedente alla correzione; elenco in `docs/VALIDAZIONE.md` § 12.6.

| Difetto | Correzione |
|---------|------------|
| Popover della barra superiore sotto la nota: risultati di Trova coperti fino al 68 %, Livelli fino all'84 %, Menu del telefono al 42,5 % (320 × 568) | barra superiore sopra i messaggi (z-index 27) |
| Con meno di 200 px liberi la nota era nascosta, con il testo assente dal DOM (640 × 512 al 200 %, tablet sotto i 736 px); "Mostra di nuovo la nota di benvenuto" senza effetto visibile | nota ridotta al comando "Leggi la nota di benvenuto", che apre il testo in un dialogo (WCAG 2.2, SC 1.4.4 e 1.4.10) |
| Tablet stretto: riserva fissa di 352 px; caricamento sopra la Scheda (600 × 480, 640 × 512, 650 × 520, 700 × 500); contenitore alto 0 px a 600 × 700 senza selezione | messaggi in testa alla colonna della Scheda |
| Nota che scorre senza indizio con le barre sovrapposte del tocco (640 × 512) | bordo sfumato dalla parte del testo nascosto |
| Forma della nota alternata a ogni aggiornamento con le barre classiche (600 × 480) | forma da misure indipendenti dalla nota e dalla barra di scorrimento |
| Menu Viste con i pulsanti in riga: 4 voci intere su 10 a 1024 × 500, 1 a 600 × 480; riapertura con lo scorrimento precedente; menu aperto dopo Tab oltre l'ultima voce | una o due colonne dentro la finestra; riapertura dalla prima voce; chiusura con il focus fuori |
| Tablet stretto con caricamento o errore: Scheda di 28-32 px, con i comandi non cliccabili e sovrapposta alla console (600 × 480) | precedenza all'intestazione della Scheda, poi fino a 120 px ai messaggi |
| Soglie del tablet stretto a 720 e 924 px: messaggi di 184-199 px accanto alla Scheda | soglie a 736 e 940 px |
| Catalogo alto 2 px a 600 × 480 e 600 × 700 | almeno 160 px, o fino alla console, anche sopra la legenda |

Verifica indipendente: 22 finestre in 6 stati (nota al primo avvio o chiusa; Scheda ridotta, espansa o nessuna selezione; anche con Trova e Livelli aperti), 8 finestre con le barre classiche. Menu Viste con 10 voci su 10 intere e libere in 20 finestre, attivabili con mouse e tastiera; nessun difetto in orizzontale (683 × 384 con scala 2, 844 × 390) e sui telefoni 375 × 667, 360 × 640 e 390 × 844. Esito: non superata per 4 difetti, corretti nello stesso passaggio.

| Difetto residuo | Correzione |
|-----------------|------------|
| 600 × 480 con i caratteri di ripiego: nota ridotta di 36 px in un contenitore di 35 px; bordo inferiore dei pulsanti tagliato, barra classica di 15 px, nessuna sfumatura | ai messaggi l'altezza di un pulsante se il resto della colonna ne dista meno di 1 px; sfumatura in cima già con 1 px di contenuto in più |
| Anello del focus dei pulsanti della nota ridotta tagliato dal contenitore: visibile per il 3-8 % ("Leggi") e il 20 % (chiusura) | anello dentro il pulsante, a 2 px dal bordo: visibile per intero |
| Dialogo della nota aperto e nota tornata intera: alla chiusura focus sul body (3 chiusure su 12 nelle misure) | focus alla nota anche quando all'evento `close` è ancora nel dialogo: 12 su 12 |
| Telefono 320 × 568 e 320 × 480: pulsante "Apri la scheda" sotto la nota, visibile attraverso la sfumatura e non attivabile | messaggi 8 px sopra il pulsante: 0 punti coperti su 210, il tocco apre la scheda |

Prove dei difetti residui: 3 prove estese di `e2e/regressioni-interfaccia.spec.ts` (nota su desktop e tablet con 600 × 480 con i caratteri di ripiego e l'anello del focus; ridimensionamento con 6 chiusure del dialogo; telefono con 320 × 568 e il pulsante "Apri la scheda"); sullo stato precedente 3 su 3 non superate.

Seconda verifica indipendente, sullo stato corretto: non superata per 6 difetti residui, corretti nello stesso passaggio.

| Difetto residuo | Correzione |
|-----------------|------------|
| Dialogo della nota aperto da "Leggi la nota di benvenuto", nota tornata intera (600 × 480, poi 1024 × 768): alla chiusura focus sul body per 31-139 ms prima della nota (Esc 20 chiusure su 24, "Chiudi" 11 su 24); la correzione precedente agiva all'evento `close`, dopo il ripristino del focus del browser | `creaDialogo` chiude il dialogo (Esc, "Chiudi", clic sullo sfondo) e sposta il focus nello stesso compito: sull'origine se visibile, altrimenti su un rifugio (la nota, o il pulsante della data) |
| Menu Viste a due colonne (600 × 480): lo sfondo `:hover` della voce sottostante copriva il lato inferiore dell'anello del focus (8 casi su 8): nella griglia ogni voce si dipinge per intero dopo la precedente | voce con il focus sopra le altre (`z-index: 1`) |
| Menu del telefono che scorre (320 × 568, 320 × 480): anello della voce portata al bordo inferiore da Tab tagliato dal contenitore (fondo a 546,5 px, limite a 543; a 320 × 480 le ultime 3 viste) | `scroll-padding-block` di 4 px nei popover |
| Messaggi a 320 × 568: 9 px in più (il margine interno della nota) attivavano la sfumatura di 40 px; ultima riga con opacità 0,1-0,6 finché non si scorreva | sfumatura mai più alta del contenuto nascosto oltre il bordo (9 px a 320 × 568; 40 px se ne restano nascosti almeno 40) |
| 600 × 480 con i caratteri di ripiego: Scheda alta 52 px che tagliava il lato inferiore dell'anello di "Espandi la scheda" e "Chiudi la scheda" (anello fino a 171 px, Scheda fino a 167) | padding superiore della Scheda di 10 px nella colonna del tablet stretto: i 4 px dell'anello stanno nell'altezza riservata all'intestazione, senza togliere spazio ai messaggi |
| "ResizeObserver loop completed with undelivered notifications" all'attivazione delle viste predefinite con la nota, senza ridimensionare (8 a 1024 × 520, 6 a 320 × 480, 4 a 320 × 568; presente anche prima delle correzioni del passaggio): durante la transizione la barra di scala cambia l'altezza della legenda e il callback del ResizeObserver scriveva `--ss-alto-legenda`, che sposta i messaggi, osservati alla stessa profondità | variabili delle altezze, colonna delle distanze e forma della nota al fotogramma successivo, nell'ordine delle dipendenze; la stessa correzione toglie gli errori nei passaggi tra 1024 × 490-600 e 1000 × 560 (5 in 14 passaggi con la nota, ora 0) |

Prove della seconda verifica: 3 prove estese (nota su desktop e tablet con l'anello dei comandi della Scheda; ridimensionamento con il focus controllato ogni millisecondo durante 6 chiusure del dialogo; popover della barra e Menu del telefono, anche a 320 × 480, con l'anello di viste e voci intero nel menu) e 3 nuove (menu Viste a due colonne con il puntatore sulla voce sottostante, lato inferiore dell'anello nei pixel della schermata; sfumatura dei messaggi a 320 × 568, 320 × 480 e 1024 × 600 in tre posizioni di scorrimento; viste predefinite attivate a 1024 × 520, 320 × 480 e 320 × 568 e passaggi tra 1024 × 490-600 e 1000 × 560 senza errori nella finestra) di `e2e/regressioni-interfaccia.spec.ts`; sullo stato precedente 6 su 6 non superate, ciascuna per il proprio difetto.

Terza verifica indipendente, sullo stato corretto: non superata per un difetto della correzione dell'errore del ResizeObserver, corretto nello stesso passaggio.

| Difetto residuo | Correzione |
|-----------------|------------|
| Variabili delle altezze scritte al fotogramma successivo al cambio: durante la transizione di una vista predefinita la barra di scala cambia l'altezza della legenda (60,5 e 81,4 px) e la nota copriva la legenda per 1-3 fotogrammi (12 px a 1024 × 520 con i caratteri veri, 1-2 fotogrammi a 320 × 480 e 320 × 568 al tocco; 0 su `6844617`); stesso ritardo per console, foglio e Scheda | nella consegna del ResizeObserver legenda, console e foglio più alti vanno nelle copie delle variabili sui messaggi (stile in linea), che cambiano solo i messaggi; i messaggi sono osservati attraverso una sonda un livello più in basso nel DOM di legenda e console, quindi notificati nello stesso fotogramma senza errore (Resize Observer, W3C, § 3.4.1 e § 3.6.1); messaggi più alti subito in `--ss-alto-messaggi`; diminuzioni, variabili dell'applicazione, colonna delle distanze e forma della nota in `pianificaAltezze`, che gira prima della consegna anche nello stesso fotogramma di un cambio di finestra o di un cambio dei messaggi da un compito (MutationObserver) |

Misure della geometria dopo ogni fotogramma disegnato, stato precedente e stato corretto: 10 viste con la nota, fotogrammi con la nota 12,4 px sopra la legenda 6 a 1024 × 520, 2 a 320 × 480 e 1 a 320 × 568, ora 0; salti di data con la nota a 844 × 390 (36 px sopra il pannello laterale), a 600 × 480 con la Scheda (6 px sopra la Scheda) e a 1024 × 520 verso il blocco 9 (12,4 px sopra la legenda), nota mostrata di nuovo a 844 × 390 (186 px sopra il pannello laterale) e ridimensionamenti tra 320 × 568 e 1024 × 520 con la nota e la Scheda (fino a 142 px sopra il pannello laterale): 1-3 fotogrammi per caso, ora 0; nessun errore nella finestra, prima e dopo. Errore residuo, senza effetti visibili: in orizzontale e sul tablet stretto, messaggi cresciuti per un cambio nato dentro un `requestAnimationFrame` o per i caratteri caricati, perché `--ss-alto-messaggi` sposta allora pannello laterale o Scheda durante la consegna (un avviso di 40 px aggiunto in un fotogramma a 844 × 390: 1 errore; aggiunto da un compito: 0; a 600 × 480: 0).

Prova della terza verifica: 1 nuova di `e2e/regressioni-interfaccia.spec.ts` (10 viste predefinite attivate con la nota a 1024 × 520 e a 320 × 480 e 320 × 568 al tocco, geometria misurata dopo ogni fotogramma: messaggi mai sopra legenda, console, foglio e Scheda); sullo stato precedente non superata (nota 12,4 px sopra la legenda a 1024 × 520). Dopo la correzione: `npm run check` senza errori (Vitest 64 file e 714 prove); `e2e/regressioni-interfaccia.spec.ts` 29 prove superate, compresa quella degli errori del ResizeObserver.

Fuori ambito, identici prima delle correzioni: legenda di 240 × 118 px sovrapposta per 206 × 51 px ai pulsanti in riga a 600 × 480 e ridotta a 80 px di larghezza a 600 × 700 (§ 4.4); popover Livelli alto 107 px a 600 × 480; vista testuale con 0 righe visibili a 600 × 480, 640 × 512, 650 × 520, 700 × 500 e 1024 × 500. Fuori ambito, presenti anche prima delle correzioni: a 1024 × 520 con la nota, durante la transizione di una vista predefinita la legenda passa da 60,5 a 81,4 px e la nota alterna le forme intera e ridotta (in 6 viste su 10); "Fonti e metodi" e "Impostazioni" aperti dal Menu del telefono e chiusi con Esc dopo il passaggio al tablet (390 × 844, poi 900 × 700): focus sul body, perché il Menu è nascosto e i due dialoghi non hanno un rifugio.

Suite sullo stato corrente (22/10/2026, dopo il § 4.4): Vitest 64 file e 714 prove, tsc ed ESLint senza errori (`npm run check`); build, build di test e `npm run build:artifact` riusciti (pagina singola: 73 file, 47 546 539 byte, 47,55 MB, file più grande 5 331 816 byte); Playwright 224 prove superate (progetti desktop 212, mobile 9, pagina singola 3); `e2e/ui-lab.config.ts` 16 su 16; `tests/render/playwright.render.config.ts` 10 su 10; nessun U+2014 nei file tracciati e nei nuovi. Non rieseguiti, senza modifiche nelle parti che verificano: pytest e ruff (nessuna modifica in `scripts/`).

### 4.4 22/10/2026, layout del telefono fino a 699 px

Decisione del responsabile del progetto sulle finestre larghe 600-699 px (soluzione 1; motivi nel registro delle modifiche di `docs/PROGETTO.md`): layout del telefono fino a 699 px, tablet da 700 a 1023 px, desktop da 1024 px; l'orizzontale (altezza < 480 px) resta prioritario a ogni larghezza.

| Modifica | Effetto |
|----------|---------|
| soglia del telefono da 600 a 700 px in `modalitaLayout` (`src/ui/layout.ts`); titoli e commenti di `src/ui/stile.css` | unica definizione della soglia: il foglio di stile usa `data-layout`, senza media query a 600 px |
| due regole del tablet stretto per il Catalogo (`left: max(margine + 336 px, 100% - margine - 320 px)`, sotto 736 px e sotto 940 px con i pulsanti in riga) tolte | da 700 px il secondo termine è sempre il maggiore (700 - 336 = 364 > 352): vale la regola generale dello stesso blocco; messaggi e Catalogo con il Catalogo aperto misurati prima e dopo in 12 finestre (da 700 × 480 a 1024 × 600): geometria identica |
| regole del tablet stretto (sotto 736 e 940 px) e condizione di larghezza della nota (meno di 200 px) | conservate: da 700 px le prime valgono per 700-735 e 700-939 px; la seconda resta come garanzia sulla larghezza (WCAG 2.2, SC 1.4.10) |
| limite delle etichette (25 sotto i 600 px di larghezza della mappa) | invariato: non è una soglia di layout, misura la mappa, che in orizzontale è più stretta della finestra (a 1024 × 400 è di 688 px) |

Misure sulle stesse finestre prima (tablet) e dopo (telefono), con la nota chiusa, senza selezione e con i caratteri caricati (con quelli di ripiego la legenda dopo è larga 549 px e Livelli prima è alto 92 px a 600 × 480). Righe della vista testuale: righe con il centro visibile e non coperto, come `righeVisibili` di `e2e/coerenza-interfaccia.spec.ts`, dopo lo scorrimento fino alla seconda riga; tra parentesi quelle intere.

| Finestra | Prima | Dopo |
|----------|-------|------|
| 600 × 480 | legenda di 240 × 118 px, sovrapposta per 206 × 51 px ai pulsanti in riga; Livelli alto 107 px (1 voce su 10 intera); vista testuale con 0 righe (area di 22 px) | legenda di 483 × 56 px libera; Livelli 388 px (6 su 10); 4 righe (3), area di 240 px |
| 640 × 512, scala 2 | legenda di 280 × 99 px; Livelli 139 px (2 su 10); 0 righe (area di 54 px) | legenda libera; Livelli 420 px (7 su 10); 5 righe (4), area di 272 px |
| 650 × 520 | legenda di 290 × 99 px; Livelli 147 px (2 su 10); 0 righe (area di 62 px) | legenda libera; Livelli 428 px (8 su 10); 5 righe (4), area di 280 px |
| 600 × 700 | legenda di 80 × 336 px; Livelli 327 px (6 su 10); 4 righe (3), area di 242 px | legenda libera; Livelli 608 px (10 su 10); 8 righe, area di 460 px |
| 699 × 480 | legenda di 339 × 79 px, sovrapposta per 206 × 12 px ai pulsanti in riga; Livelli 107 px (1 su 10); 0 righe (area di 22 px) | legenda libera; Livelli 388 px (6 su 10); 4 righe (3), area di 240 px |

Anche i messaggi compressi accanto alla Scheda (colonna di 86 px a 600 × 480) sono eliminati: sul telefono stanno sotto la legenda e sopra il foglio. Sono verificati a 600 × 480, 640 × 512 (scala 2), 650 × 520, 600 × 700, 600 × 960, 690 × 829, 699 × 480 e 699 × 700: telefono, legenda sotto la barra, mai sopra pulsanti, campo Trova, foglio o «Apri la scheda»; foglio, Catalogo, vista testuale, Menu con le dieci viste, nota di benvenuto, caricamento ed errore con «Riprova»; A12 a 640 × 512 con scala 2 e a 690 × 829.

Prove: 23 prove Playwright nuove e 13 aggiornate (8 che trattavano 600-699 px come tablet, portate a 700 px; 5 estese al telefono fino a 699 px) e 1 prova Vitest estesa (`classi di larghezza del § 11.3`); elenco in `docs/VALIDAZIONE.md` § 12.6. Sullo stato precedente non superate: Vitest 1 su 1 e Playwright 28 su 36 tra nuove e aggiornate (le 8 portate a 700 px non cambiano esito). Dopo la decisione: `npm run check` senza errori (Vitest 64 file e 714 prove); suite completa `npx playwright test` 224 prove superate su 224 (201 elencate sullo stato precedente, più le 23 nuove; progetti desktop 212, mobile 9, pagina singola 3), di cui 135 nei cinque file toccati (`accessibilita` 19, `regressioni-interfaccia` 34, `telefono-foglio` 19, `coerenza-interfaccia` 36, `interfaccia` 27); `e2e/ui-lab.config.ts` 16 su 16; `tests/render/playwright.render.config.ts` 10 su 10.

Restano, misurati dopo la decisione e fuori dal suo ambito, perché dipendono dall'altezza e valgono anche da 700 px di larghezza (§ 6.2 e § 6.3): colonna della Scheda di 86 px a 700 × 480 con la riga dell'incertezza dell'ora; legenda coperta dalla riga dei pulsanti da 700 a 712 px di larghezza e da 480 a 491 px di altezza (11,5 px a 700 × 480, 1,5 px a 700 × 490, 0,5 px a 700 × 491; 0 da 700 × 492, da 713 × 480 e a 736 × 480); Livelli alto 107 px a 700 × 480 e 127 px a 700 × 500; vista testuale con 0 righe a 700 × 480, 700 × 500 e 1024 × 500, 1 riga a 700 × 560 e 2 a 700 × 600. Sul telefono resta, come già a 320 × 480 e 320 × 568, la nota di benvenuto con il foglio medio su schermi alti 480 px: copre 63 px del foglio e il pulsante «Apri la scheda» (§ 6.3).

## 5. Registro dettagliato per ciclo

Titoli come nel registro della ricerca. Esito: corretta (con il commit per il ciclo 5), nessuna per i rilievi respinti.

### 5.1 Ciclo 1 (19/10/2026, `0bcadf3`)

| n. | Area | Categoria | Gravità | Titolo | Verdetto | Esito |
|----|------|-----------|---------|--------|----------|-------|
| 1 | applicazione | logico | media → bassa | Avvio: eccezioni diverse da ErroreWebGL lasciano la pagina vuota o ferma su 'Caricamento dei dati di base', senza messaggio né Riprova | confermata | corretta |
| 2 | applicazione | logico | media → bassa | Errore di un blocco: messaggio che resta a date di altri blocchi e nessun nuovo tentativo al ritorno sulla sua data | confermata | corretta |
| 3 | effemeridi | dati | media → bassa | La Luna risulta 'precisa' con l'istante in TT tra il 1960,7 e il 2040,7 | confermata | corretta |
| 4 | documentazione | formale | media | Soglie adottate per A7 assenti dai documenti: A7 ancora 'non superato in parte' con le soglie superate | confermata | corretta |
| 5 | build-test | formale | media | Avviso di licenza MIT di three.js assente dal codice distribuito | confermata | corretta |
| 6 | interfaccia | formale | bassa | Selettore di velocità troncato sul telefono anche con Source Sans 3 | confermata | corretta |
| 7 | rendering | logico | bassa | Etichette di scena sotto i pannelli; contatore '+N lune' troncato dalla console | confermata | corretta |
| 8 | interfaccia | formale | bassa | Catalogo aperto sovrapposto alla legenda permanente | confermata | corretta |
| 9 | interfaccia | logico | bassa | Live region con 'Caricamento dati...' dopo il caricamento concluso | confermata | corretta |
| 10 | interfaccia | formale | bassa | Testo di caricamento doppio durante l'attesa della riproduzione al confine | confermata | corretta |
| 11 | interfaccia | logico | bassa | Vista testuale: 'non disponibile' per valori non applicabili di Sole e Terra | confermata | corretta |
| 12 | rendering | formale | bassa | Colori forzati: riquadri chiari dietro le etichette di scena | respinta | nessuna |
| 13 | applicazione | logico | bassa | Pause del thread principale alla lettura e verifica dei blocchi | respinta | nessuna |
| 14 | documentazione | formale | bassa | Progetto § 5.1, § 5.3 e § 12.1: nomi di file inesistenti e refusi | confermata | corretta |
| 15 | interfaccia | formale | bassa | Accordo di genere errato negli annunci e nell'avviso dei filtri | confermata | corretta |
| 16 | interfaccia | formale | bassa | Preposizione senza articolo con 'Terra' nei testi composti | confermata | corretta |
| 17 | interfaccia | formale | bassa | Riferimenti di Fonti e metodi incompleti rispetto alle fonti dei dati mostrati | confermata | corretta |
| 18 | build-test | formale | bassa | npm ci: avviso di deprecazione di eslint 9.39.5 | confermata | corretta |
| 19 | build-test | formale | bassa | ESLint senza regole con informazioni di tipo: promessa non gestita e 58 asserzioni superflue non rilevate | confermata | corretta |
| 20 | build-test | formale | bassa | Codice morto: `__TARGET__` mai letto ed esportazioni mai usate | confermata | corretta |
| 21 | interfaccia | formale | bassa | Messaggi di caricamento ed errore con anni fuori dall'intervallo dichiarato | confermata | corretta |
| 22 | interfaccia | formale | bassa | Fonti e metodi: 'circa 28 s' nel 2120 invece di 28,6 s | confermata | corretta |
| 23 | documentazione | formale | bassa | Nota del modulo catalogo con limite di 4 MB e pack.py che fallisce | confermata | corretta |
| 24 | documentazione | formale | bassa | Risultati grezzi di A7 citati in un file non versionato | confermata | corretta |
| 25 | interfaccia | dati | media | Elementi orbitali della scheda errati oltre le cifre mostrate (pianeti esterni, comete al perielio, satelliti) | confermata | corretta |
| 26 | interfaccia | logico | media | L'editor della data riapplica i campi non modificati all'uscita dal gruppo: riavvolge la riproduzione, azzera i secondi, sposta l'istante al passaggio a TT e spegne 'Segui l'ora attuale' | confermata | corretta |
| 27 | pipeline-dati | dati | bassa | ε dei piccoli corpi nel 1600-2121 senza la parte assoluta (500 km) della tolleranza di rappresentazione | confermata | corretta |
| 28 | interfaccia | logico | media → bassa | Affidabilità 'buona': 'circa 0,0 volte il diametro apparente della Luna piena' | confermata | corretta |
| 29 | interfaccia | logico | alta → media | Elementi orbitali di Notte e Idra nella scheda errati: stato rispetto al centro di Plutone e μ senza Caronte | confermata | corretta |
| 30 | catalogo | dati | media → bassa | Periodo di rotazione di Eris superato (25,9 h): la rotazione è sincrona con Disnomia, circa 15,8 d | confermata | corretta |
| 31 | catalogo | dati | media | Raggio di 19P/Borrelly 4,22 km incoerente con la fonte stessa e con SBDB (2,4 km) | confermata | corretta |
| 32 | catalogo | dati | bassa | GM di Haumea indicato come non noto, ma la massa è misurata | confermata | corretta |
| 33 | catalogo | dati | bassa | Periodo di rotazione di Febe "non noto" benché presente in pck00011 | confermata | corretta |
| 34 | catalogo | dati | bassa | Periodo nella scheda diverso dalla rotazione disegnata per 19P e 67P | confermata | corretta |
| 35 | catalogo | dati | bassa | Semiassi di Toutatis in ordine crescente: asse lungo sul polo del corpo | confermata | corretta |
| 36 | catalogo | dati | bassa | Nome ufficiale di C/1680 V1 con dicitura italiana | confermata | corretta |
| 37 | interfaccia | formale | bassa | Parole duplicate nella sorgente delle effemeridi (Horizons, DASTCOM, kepleriana, ASSIST, vettori tabulati) | confermata | corretta |
| 38 | catalogo | formale | bassa | Fonte del GM di Tritone e Proteo con "soluzione NEP098" ripetuto | confermata | corretta |
| 39 | catalogo | formale | bassa | Rinvio interno "(§ 7.5.5)" nella fonte della rotazione dei satelliti sincroni | confermata | corretta |
| 40 | interfaccia | formale | bassa | Valori fisici con cifre significative superiori alla precisione della fonte e zeri finali | confermata | corretta |
| 41 | interfaccia | logico | bassa | Segno del periodo di rotazione non coerente tra Venere/Urano e Plutone e non spiegato | confermata | corretta |
| 42 | documentazione | formale | bassa | PROGETTO § 9: fonti del GM di pianeti e satelliti non corrispondenti al catalogo | confermata | corretta |
| 43 | documentazione | formale | bassa | PROGETTO § 7.6.4 attribuisce ad Arrokoth un modello WGCCRE inesistente | confermata | corretta |
| 44 | documentazione | formale | bassa | PROGETTO § 8.10: "primario: Sole o pianeta" smentito dal catalogo | confermata | corretta |
| 45 | documentazione | formale | bassa | LICENZE.md: risoluzione del mosaico di Giapeto 783 m invece di 803 m | confermata | corretta |
| 46 | catalogo | dati | bassa | Anno della fonte del raggio di Phaethon errato (2017 invece di 2019) | confermata | corretta |
| 47 | documentazione | formale | bassa | Evidenza di Mani in fisica-letteratura.json: tabella 5 invece di 6-7 | confermata | corretta |
| 48 | applicazione | logico | media → bassa | Riproduzione bloccata a tempo indefinito con 'Caricamento dati' dopo l'errore di un blocco | confermata | corretta |
| 49 | tempo | dati | bassa | Indicatore della stagione: cambio di stagione 4-10 minuti prima degli istanti ufficiali di equinozi e solstizi | confermata | corretta |
| 50 | tempo | logico | bassa | Indicatore della stagione: conteggio dei giorni impossibile ('89 giorni dopo il solstizio') e passaggi di giorno sfasati fino a 35 min | confermata | corretta |
| 51 | tempo | dati | media | σ(ΔT) di alcuni secondi anche nel periodo misurato da IERS (± 3,26 s nel 2026) | confermata | corretta |
| 52 | interfaccia | formale | bassa | Riga ΔT e avviso della Luna: valore e incertezza con unita' e arrotondamenti diversi | confermata | corretta |
| 53 | interfaccia | formale | bassa | Elisione mancante nelle date: 'Posizioni al 8 marzo', 'Elementi osculanti al 11 febbraio' | confermata | corretta |
| 54 | interfaccia | logico | bassa | Ingresso in TT: il messaggio indica come primo istante le 01:46 del 6/1/10000 a.C., ma le 01:46 vengono rifiutate | confermata | corretta |
| 55 | interfaccia | logico | bassa | Regolo: ogni freccia annuncia la data due volte e non solo al rilascio | confermata | corretta |
| 56 | interfaccia | logico | media | Ricerca: le frecce non seguono l'ordine visivo dei risultati | confermata | corretta |
| 57 | interfaccia | logico | media → bassa | Scorciatoie [ e ] non utilizzabili con la tastiera italiana | confermata | corretta |
| 58 | interfaccia | logico | media | Avviso di categoria nascosta invisibile con la scheda ridotta | confermata | corretta |
| 59 | interfaccia | logico | media | Tablet: la scheda copre Aggiorna e Chiudi della vista testuale | confermata | corretta |
| 60 | interfaccia | logico | media | Telefono: la nota di benvenuto copre i controlli del foglio esteso | confermata | corretta |
| 61 | interfaccia | logico | media | I preset scrivono nell'URL il fuoco: ricaricando si perde la selezione e si apre il disco del Sole | confermata | corretta |
| 62 | interfaccia | logico | media | Cifre delle distanze delle lune: errore non riferito al primario (Terra-Luna '≈ 400 000 km' in tabella; lune con più cifre del pianeta in scheda; scheda e tabella diverse) | confermata | corretta |
| 63 | interfaccia | logico | media | Scheda: 'Orbita non determinabile' insieme a livello 'buona' o 'approssimata' ed elementi completi | confermata | corretta |
| 64 | interfaccia | dati | bassa | Passaggio al pericentro: sempre il precedente, anche se il successivo è molto più vicino | confermata | corretta |
| 65 | interfaccia | logico | media → bassa | Toggle 'gregoriano prolettico' senza effetto fino al cambio di data | confermata | corretta |
| 66 | interfaccia | formale | media | Scheda: etichette compresse a larghezza zero e sovrapposte ai valori | confermata | corretta |
| 67 | interfaccia | formale | bassa | Scheda: URL lunghi delle mappe escono dal pannello | confermata | corretta |
| 68 | interfaccia | formale | bassa | Errore angolare '60″' invece di '1,0′' | confermata | corretta |
| 69 | interfaccia | logico | bassa | Scheda del Sole: blocco 'Ora' vuoto | confermata | corretta |
| 70 | interfaccia | formale | bassa | Scheda del Sole: albedo geometrica 'non noto' | confermata | corretta |
| 71 | interfaccia | logico | bassa | Messaggio 'collegamento ignorato' resta dopo un collegamento valido | confermata | corretta |
| 72 | interfaccia | logico | bassa | Chiudendo la vista testuale con T il focus finisce sul body | confermata | corretta |
| 73 | rendering | logico | bassa | Livello 'Eclittica della data' senza effetto visibile nelle viste predefinite | confermata | corretta |
| 74 | interfaccia | formale | bassa | Velocità '1000 anni/s' senza separatore delle migliaia | confermata | corretta |
| 75 | rendering | logico | bassa | Preset 'Oggetti interstellari' limitato dalla distanza massima: estensione 165 685 UA invece di 200 000, corpi sovrapposti e 3I/ATLAS fuori campo nel 10000 a.C. | confermata | corretta |
| 76 | rendering | logico | media | Marcatori, anello di selezione e tratteggio delle orbite corrotti con la camera oltre circa 5,5·10¹¹ km (≈3700 UA) | confermata | corretta |
| 77 | rendering | logico | bassa | Eclissi non rappresentate e non dichiarate tra i limiti | confermata | corretta |
| 78 | documentazione | formale | bassa | Fonti e metodi: 'anelli ... senza ombre' contraddice l'ombra del pianeta disegnata sugli anelli | confermata | corretta |
| 79 | interfaccia | formale | alta | Editor della data largo 34 px e inutilizzabile nel layout orizzontale (telefono in orizzontale) | confermata | corretta |
| 80 | interfaccia | formale | alta | Editor della data sotto la vista testuale, il catalogo e la barra superiore; senza WebGL2 è inutilizzabile | confermata | corretta |
| 81 | applicazione | logico | media → bassa | Errore di moon.bin presentato come errore dei periodi dei blocchi, ripetuto per blocco; Riprova su un messaggio lascia l'altro | confermata | corretta |
| 82 | interfaccia | logico | bassa | Telefono in orizzontale: a 568x320 non c'è il pannello laterale, a 640x360 il pannello copre il corpo a fuoco | confermata | corretta |
| 83 | applicazione | logico | bassa | Orologio di sistema oltre il 31/12/2120: avvio a una data fuori intervallo con mappa vuota | confermata | corretta |
| 84 | rendering | logico | bassa | Stelle e texture: dopo un errore nessun nuovo tentativo e nessun messaggio | confermata | corretta |
| 85 | build-test | logico | bassa | Gancio waitIdle concluso prima del ridisegno dopo un ridimensionamento | confermata | corretta |

### 5.2 Ciclo 2 (20/10/2026, `61549c3` parziale e `66fba48`)

| n. | Area | Categoria | Gravità | Titolo | Verdetto | Esito |
|----|------|-----------|---------|--------|----------|-------|
| 1 | interfaccia | formale | bassa | Fonti e metodi: l'incertezza di ΔT dal 1200 al 1600 è attribuita all'era telescopica e a Stephenson e Houlden (1986) | confermata | corretta |
| 2 | catalogo | dati | bassa | Fonte del GM dei pianeti: soluzione 'URA184' per Urano (valore e satelliti di URA182.21) e anno 2020 per MAR099 | confermata | corretta |
| 3 | documentazione | formale | bassa | PROGETTO § 5.7: con la configurazione di Vite descritta il foglio di stile si chiama style.css e make-artifact.mjs fallisce | confermata | corretta |
| 4 | build-test | formale | bassa | npm run build:artifact (e quindi npx playwright test) sovrascrive dist/ con la build in modalità artifact | confermata | corretta |
| 5 | interfaccia | formale | bassa | Testi mai usati in src/ui/testi.it.ts (23 chiavi) | confermata | corretta |
| 6 | rendering | formale | bassa | Rendering e interfaccia: barra di scala e tabella dei preset duplicate; campi di StatoVista calcolati e mai letti | confermata | corretta |
| 7 | documentazione | formale | bassa | PROGETTO § 5.4 e METODI § 1: "Conversioni UA/km solo in src/ui/format.ts" non è vero | confermata | corretta |
| 8 | documentazione | formale | bassa | Ambiente .venv della pipeline: PROGETTO § 5.2 e scripts/pipeline/README.md non elencano jsonschema e pillow | confermata | corretta |
| 9 | interfaccia | formale | bassa | Mappe CC BY 4.0 di Saturno, Urano e Nettuno senza URI della licenza | confermata | corretta |
| 10 | interfaccia | formale | bassa | Refusi e tipografia incoerente in Fonti e metodi e nel README | confermata | corretta |
| 11 | interfaccia | logico | media → bassa | Scheda di Terra e Plutone: elementi del baricentro del sistema presentati come elementi del corpo | confermata | corretta |
| 12 | interfaccia | dati | media | Elementi della scheda dei corpi lontani (interstellari, comete a centinaia o migliaia di UA) errati oltre le incertezze dichiarate | confermata | corretta |
| 13 | tempo | dati | bassa | ΔT 1962-1971: errore fino a 0,68 s con σ(ΔT) dichiarata 0,114 s | confermata | corretta |
| 14 | interfaccia | logico | bassa | Velocità della scheda e coordinate della vista testuale con cifre fisse, non coerenti con l'affidabilità | confermata | corretta |
| 15 | catalogo | dati | media | Raggi superati da fonti più recenti: Chiron, Chariklo, Mani, Didymos, 103P/Hartley 2 | confermata | corretta |
| 16 | catalogo | dati | media → bassa | Periodo di rotazione di Salacia superato (6,09 h): la rotazione è sincrona con Actea, 5,494 d | confermata | corretta |
| 17 | catalogo | dati | media → bassa | GM di 67P e Itokawa copiati da SBDB in contrasto con la fonte citata | confermata | corretta |
| 18 | catalogo | dati | media → bassa | GM di Igea e Interamnia superati (1987, 1992) e incoerenti con DE441 usato dalla pipeline | confermata | corretta |
| 19 | catalogo | dati | bassa | GM 'non noto' per corpi con massa misurata: Orco, Quaoar, Salacia, Didymos, Sylvia, Euphrosyne e altri asteroidi di DE441 | confermata | corretta |
| 20 | interfaccia | logico | bassa | Rotazione retrograda non segnalata per Itokawa, Steins, Ida, 19P, Lutetia e Febe | confermata | corretta |
| 21 | catalogo | dati | bassa | Periodo di rotazione 'non noto' per Nereide, Notte, Idra e Imalia, misurato in letteratura | confermata | corretta |
| 22 | catalogo | dati | bassa | GM di satelliti mostrati con 7 cifre senza incertezza: Proteo, Imalia, Fobos, Deimos | confermata | corretta |
| 23 | catalogo | dati | bassa | Criterio dei centauri (diametro ≥ 150 km) non rispettato: mancano 2002 GZ32 e Bienor | confermata | corretta |
| 24 | catalogo | logico | bassa | Categoria primaria di Chiron in contrasto con la precedenza del § 4.2 | confermata | corretta |
| 25 | documentazione | formale | bassa | Fonti e metodi: 'mosaici USGS (pubblico dominio)' anche per mappe senza dichiarazione di pubblico dominio | confermata | corretta |
| 26 | tempo | dati | bassa | σ(ΔT) dopo l'ultimo valore C04 sottostimata: al 18-19/10/2026 la riga mostra 69,193 ± 0,002 s, IERS dà 69,223 s | confermata | corretta |
| 27 | interfaccia | logico | media | Cambio a 'Inserisci l'istante in TT' con 'Segui l'ora attuale' attivo: la data parte alla velocità selezionata (1 giorno/s) | confermata | corretta |
| 28 | interfaccia | logico | bassa | Regolo inferiore: con tacche maggiori di 2 anni '1 d.C.' e '2 d.C.' distano 1 anno e le etichette si accalcano | confermata | corretta |
| 29 | rendering | logico | media | Fuoco su un corpo senza posizione alla data: camera a decine di km dal centro del Sole, vista vuota e annuncio di una centratura che non avviene | confermata | corretta |
| 30 | effemeridi | logico | alta → media | Fasce di affidabilità della panoramica senza ε_ΔT fuori dai blocchi in memoria: Luna 'buona' e Mercurio, Marte, Giove 'precisa' su tutto l'intervallo | confermata | corretta |
| 31 | interfaccia | logico | media | Satelliti 'non determinabili' con stato disponibile: la scheda mostra distanze, velocità, M e T; la tabella dice 'non disponibile' | confermata | corretta |
| 32 | rendering | logico | media | Schermi verticali: vista iniziale di 2 UA invece dei 4 UA del Sistema interno; la rotazione cambia l'ampiezza | confermata | corretta |
| 33 | interfaccia | logico | media | Desktop con catalogo aperto: la vista testuale finisce sotto la scheda (Aggiorna e Chiudi coperti) e sotto il catalogo | confermata | corretta |
| 34 | interfaccia | logico | media | Vista testuale: attivando un corpo, o con un passo, il focus va al body e torna alla prima riga | confermata | corretta |
| 35 | interfaccia | logico | media | Tablet e telefono: selezione dal catalogo con la tastiera, il focus va al body | confermata | corretta |
| 36 | interfaccia | logico | media → bassa | Filtro 'Pianeti nani' senza effetto con i filtri predefiniti; 'Interstellari' e 'Centauri' quasi senza effetto | respinta | nessuna |
| 37 | interfaccia | logico | bassa | Vista testuale: ordinamento per longitudine da 180° a 180° mentre i valori sono mostrati da 0° a 360° | confermata | corretta |
| 38 | interfaccia | logico | bassa | 'Segui l'ora attuale': selettore di velocità e direzione attivi ma senza effetto | confermata | corretta |
| 39 | interfaccia | logico | bassa | Regolo temporale senza etichette per ampiezze di circa 18-30 giorni | confermata | corretta |
| 40 | interfaccia | logico | bassa | Pulsanti + e − delle distanze e del regolo: attivi ai limiti, senza effetto, stato o annuncio | confermata | corretta |
| 41 | interfaccia | logico | media | Copia collegamento: esito solo nella live region nascosta; con gli appunti negati l'URL non è visibile | confermata | corretta |
| 42 | interfaccia | logico | bassa → media | Pulsante 'Mostra le comete' della scheda: focus perso e nessun annuncio | confermata | corretta |
| 43 | rendering | logico | bassa | Inquadratura 'orbita' che non contiene l'orbita: sul telefono ne resta fuori circa il 40% | confermata | corretta |
| 44 | interfaccia | logico | bassa | Hash non conforme (#Marte, #Plutone, #1P, #C/1680 V1) ignorato senza messaggio; resta il messaggio di un collegamento precedente | confermata | corretta |
| 45 | interfaccia | formale | bassa | Blocco 'Ora' della scheda con l'etichetta 'Ora' ripetuta | confermata | corretta |
| 46 | interfaccia | dati | bassa | GM dei corpi piccoli con fino a 14 decimali | confermata | corretta |
| 47 | rendering | logico | media | Venere e Urano: orientamento fermo all'istante del primo frame (periodo di rotazione negativo nella regola di 1/8 del periodo) | confermata | corretta |
| 48 | rendering | logico | bassa | Anelli di Saturno: orbite e assi che passano dietro l'anello B disegnati sopra l'anello | confermata | corretta |
| 49 | rendering | logico | bassa | Etichette degli anelli di distanza disegnate sopra il disco del corpo che nasconde l'anello | confermata | corretta |
| 50 | rendering | logico | bassa | Anelli di Saturno: lacune e anelli stretti più sottili di un pixel resi a tratti e a puntini | confermata | corretta |
| 51 | rendering | logico | media | Rotella del mouse ignorata con il puntatore sopra le etichette di scena | confermata | corretta |
| 52 | interfaccia | logico | media → bassa | Vista testuale: livello di affidabilità mostrato per corpi senza posizione e più ottimistico del reale | confermata | corretta |
| 53 | rendering | logico | bassa | Cambio di devicePixelRatio senza cambio di dimensioni: canvas alla risoluzione precedente fino alla prossima interazione | confermata | corretta |
| 54 | rendering | logico | bassa | Contesto WebGL perso: mappa nera con le etichette ferme alle posizioni precedenti, nessun messaggio | confermata | corretta |

### 5.3 Ciclo 3 (20/10/2026, `61549c3` parziale e `66fba48`)

| n. | Area | Categoria | Gravità | Titolo | Verdetto | Esito |
|----|------|-----------|---------|--------|----------|-------|
| 1 | build-test | logico | media → bassa | Clone nuovo: le verifiche SHA-256 dei dati pubblicati (A22) vengono saltate senza segnalazione | confermata | corretta |
| 2 | rendering | formale | bassa | Etichetta dell'anello di distanza '1000 UA' senza separatore delle migliaia | confermata | corretta |
| 3 | interfaccia | formale | bassa | Spazio ordinario tra numero e unità in quattro testi visibili | confermata | corretta |
| 4 | documentazione | formale | bassa | PROGETTO § 16.3: mosaici USGS indicati come CC0-1.0 | confermata | corretta |
| 5 | documentazione | formale | bassa | PROGETTO § 5.4: leggiSlug descritto come validante, l'implementazione restituisce qualsiasi testo dell'hash | confermata | corretta |
| 6 | documentazione | formale | bassa | REVISIONE_PROGETTO.md dichiara rimosso legacy-peer-deps, ancora presente e motivato | confermata | corretta |
| 7 | pipeline-dati | logico | media | Affidabilità alla data attuale: l'intervallo 2020,7-2040,7 prende il valore del 2040 e declassa 15 corpi a 'buona' o 'approssimata' | confermata | corretta |
| 8 | pipeline-dati | logico | media → bassa | Comete: la variante 'senza NG' domina ε anche quando A1, A2, A3 sono nella covarianza (21P e 46P 'indicativa' dopo il 2080 e il 2100) | respinta | nessuna |
| 9 | pipeline-dati | logico | media | Metrica di ε dei piccoli corpi: il termine \|ΔM\| non misura la posizione e gonfia ε (Arrokoth 0,91°, Gonggong 'buona', 109P 'buona' 1801-1928) | confermata | corretta |
| 10 | pipeline-dati | logico | media | Comete a record: ε costante su tutto l'intervallo del record, fissato dal salto più lontano (109P 'indicativa' all'apparizione del 1737) | confermata | corretta |
| 11 | catalogo | dati | media | Albedo geometrica di pianeti e Plutone ferma ai valori del 1992, superati | confermata | corretta |
| 12 | catalogo | dati | media | Dimensioni radiometriche di Issione e Quaoar superate dalle occultazioni stellari | confermata | corretta |
| 13 | catalogo | dati | bassa | Albedo 'non noto' per corpi con albedo misurata (Gonggong, 67P) | confermata | corretta |
| 14 | catalogo | dati | bassa | Rotazione retrograda non indicata per Arrokoth, Bennu, Ryugu e Didymos, con polo noto | confermata | corretta |
| 15 | catalogo | dati | bassa | Nomi ufficiali e designazione non conformi all'MPC: Máni, Šteins, Plutone 1930 BM | confermata | corretta |
| 16 | documentazione | formale | bassa | Szakáts et al. 2023 e Ragozzine e Brown 2009 assenti dai riferimenti di Fonti e metodi e da PROGETTO § 16.1 | confermata | corretta |
| 17 | catalogo | dati | bassa | Raggio di C/1996 B2 (Hyakutake) da un valore DASTCOM marcato 'value unverified' | confermata | corretta |
| 18 | tempo | logico | media | Nota 'Rotazione terrestre indeterminata' invertita: compare con l'istante in UT, manca con l'ingresso in TT | confermata | corretta |
| 19 | interfaccia | logico | media | Passaggio al pericentro della scheda: data in TT senza scala né offset accanto a date in UT o con offset orario (5 giorni di scarto a -10000) | confermata | corretta |
| 20 | interfaccia | logico | bassa | Avviso 'Raggiunto il limite inferiore' che resta dopo il salto al limite superiore con Fine (e viceversa con Inizio) | confermata | corretta |
| 21 | interfaccia | formale | bassa | Angoli della scheda arrotondati a '360,0°' invece di '0,0°' (anomalia media al passaggio al pericentro) | confermata | corretta |
| 22 | interfaccia | logico | media | Regolo delle distanze coperto dalla console con viewport bassi: −, Inquadra e Viste predefinite irraggiungibili | confermata | corretta |
| 23 | interfaccia | logico | media | Fasce di affidabilità del regolo panoramico distinte solo dal colore, senza legenda né testo alternativo utile | confermata | corretta |
| 24 | interfaccia | logico | bassa | Editor della data e menu Viste: sfocatura annullata, testo della legenda e della scena leggibile attraverso il pannello | confermata | corretta |
| 25 | interfaccia | logico | bassa | Ricerca: il messaggio «Nessun corpo per ...» resta dopo l'uscita dal campo e copre l'intestazione del catalogo | confermata | corretta |
| 26 | interfaccia | dati | bassa | GM di Sole, Giove e Saturno arrotondati a 7 cifre con zeri di riempimento: «132 712 400 000 km³/s²» | confermata | corretta |
| 27 | interfaccia | formale | bassa | Preposizioni senza articolo residue: «fuoco su Sole», «Vista centrata su Terra», «affidabilità di Terra», «Apri la scheda di Terra» | confermata | corretta |
| 28 | interfaccia | logico | bassa | «Leggi posizione» del Sole annuncia «Sole: n.d. dal Sole, ... dalla Terra.» | confermata | corretta |
| 29 | interfaccia | logico | bassa | Zoom da tastiera sulla mappa senza annuncio dell'ampiezza né del limite raggiunto | confermata | corretta |
| 30 | interfaccia | logico | bassa | Ricerca: «‘Oumuamua» con la virgoletta U+2018 non trova 1I/ʻOumuamua | confermata | corretta |
| 31 | interfaccia | logico | bassa | Ricerca: risultati spuri da sottostringhe a cavallo di parole («1p» dà Patientia, «io» dà 1I/ʻOumuamua) | respinta | nessuna |
| 32 | interfaccia | formale | bassa | Dettaglio dei risultati di Trova: sigla ripetuta per le comete e numero assente per gli asteroidi | confermata | corretta |
| 33 | interfaccia | logico | bassa | Vista testuale a 1280 e 1366 px: colonna Affidabilità fuori dal riquadro | confermata | corretta |
| 34 | interfaccia | logico | bassa | Telefono 320×568 con foglio medio: il pulsante della scheda copre la legenda permanente | confermata | corretta |
| 35 | rendering | logico | media | Camera dentro il corpo a fuoco dopo uno spostamento (Maiusc+frecce) seguito da una rotazione | confermata | corretta |
| 36 | rendering | logico | media | Barra di scala errata dopo uno spostamento della vista: usa la distanza euclidea dal fuoco invece della profondità | confermata | corretta |
| 37 | effemeridi | logico | media → bassa | Piani orbitali dei satelliti fissi mentre il polo del pianeta precessa: nel 10000 a.C. Fobos e Deimos a 10,7° e 9,0° dall'equatore disegnato di Marte | confermata | corretta |
| 38 | rendering | logico | bassa | Livello 'Assi di rotazione': asse lungo il polo dell'eclittica per i 65 corpi con assi fissi; per Febe 25,7° dal polo noto | confermata | corretta |
| 39 | rendering | logico | bassa | Anello di selezione ed etichetta su un cerchio attorno al centro proiettato: per un disco vicino e fuori asse cadono dentro il disco | confermata | corretta |
| 40 | applicazione | logico | media → bassa | In un contesto non sicuro (HTTP da un indirizzo non locale) il sito non parte mai: crypto.subtle manca e «Riprova» non serve | confermata | corretta |
| 41 | applicazione | logico | media | Un file in cache HTTP con SHA-256 diverso dal manifest blocca il periodo: «Riprova» e la ricarica rileggono la stessa risposta dalla cache | confermata | corretta |
| 42 | interfaccia | logico | media | Senza WebGL2, sul telefono in orizzontale la vista testuale non mostra nessuna riga | confermata | corretta |
| 43 | interfaccia | logico | media | «Riprova», «Chiudi il messaggio» e «Chiudi la nota di benvenuto» lasciano il focus sul body | confermata | corretta |
| 44 | applicazione | logico | bassa → media | Richiesta di dati che non si conclude: «Caricamento» senza fine e senza «Riprova», anche all'avvio | confermata | corretta |
| 45 | interfaccia | formale | bassa | Fonti e metodi: numeri raggruppati con U+2009 fuori da un elemento nowrap, a 320 px vanno a capo dentro il numero | confermata | corretta |

### 5.4 Ciclo 4 (20/10/2026, `66fba48`)

| n. | Area | Categoria | Gravità | Titolo | Verdetto | Esito |
|----|------|-----------|---------|--------|----------|-------|
| 1 | documentazione | formale | bassa | VALIDAZIONE.md: A24 e introduzione con valori superati dopo la rigenerazione del 20/10/2026 | confermata | corretta |
| 2 | interfaccia | formale | bassa | Fonti e metodi: simbolo u non definito nell'incertezza di ΔT e frase incompleta sul 1200-1300 | confermata | corretta |
| 3 | catalogo | formale | bassa | Stringhe 'fonte' del catalogo con refusi tipografici: '3,51·10^10 kg' (Itokawa, visibile) e 'A&A 632 L4. e dall'orbita' (Ryugu) | confermata | corretta |
| 4 | rendering | formale | bassa | Colori della scena definiti due volte e token di scena mai usati: A11 verifica i token, non i colori disegnati | confermata | corretta |
| 5 | build-test | formale | bassa | Avviso di Vite sulla dimensione del bundle soppresso con chunkSizeWarningLimit 1500 senza motivazione documentata | confermata | corretta |
| 6 | build-test | formale | bassa | eslint.config.js usa tseslint.config(), deprecata in typescript-eslint 8.71.2 | confermata | corretta |
| 7 | pipeline-dati | formale | bassa | Codice morto nella pipeline Python: 12 funzioni mai chiamate | confermata | corretta |
| 8 | build-test | formale | bassa | File di debug versionati nella radice: out/inferiore-fine.png e out/superiore-inizio.png | confermata | corretta |
| 9 | interfaccia | formale | bassa | Struttura della pagina: nessun main né h1; mappa, regolo delle distanze, Viste e barra di scala fuori da ogni landmark | confermata | corretta |
| 10 | effemeridi | dati | media → bassa | Satelliti: errore radiale escluso da ε e dagli errori della scheda; distanze di Febe errate di 6 unità nell'ultima cifra | confermata | corretta |
| 11 | pipeline-dati | dati | media | Fobos: σ_ṅ dell'ipotesi I12 applicata benché l'accelerazione mareale sia misurata; 'approssimata' dal 2090 e 'indicativa' prima del 1685 con errore reale ≤ 0,26° | confermata | corretta |
| 12 | pipeline-dati | logico | bassa | reliability.bin: intervalli di 20 anni prima del 1980 con il massimo dell'intervallo; nel 1900-1980 livelli declassati di una classe per 14 piccoli corpi | respinta | nessuna |
| 13 | catalogo | dati | media → bassa | Periodi di rotazione di Quaoar e Gonggong dimezzati: valori LCDB a picco singolo al posto dei periodi a doppio picco delle fonti primarie | confermata | corretta |
| 14 | catalogo | dati | media | Patroclus: al solo Patroclus è attribuito il diametro NEOWISE dell'intero sistema binario, con incertezza di 0,43 km | confermata | corretta |
| 15 | catalogo | dati | bassa | GM "non noto" per i troiani binari Patroclus e Hektor, la cui massa è misurata dall'orbita del satellite | confermata | corretta |
| 16 | pipeline-dati | logico | bassa | Mathilde e 81P/Wild 2 disegnati come sfere: i semiassi di pck00011 non sono usati, contro la regola dichiarata nel § 9 | confermata | corretta |
| 17 | catalogo | dati | bassa | GM di Plutone con 7 cifre (869,3261 km³/s²) e senza incertezza, mentre la pagina JPL dà ± 0,4 per la stessa soluzione PLU060 | confermata | corretta |
| 18 | catalogo | dati | bassa | Albedo di Chiron e Chariklo dalla radiometria SBDB del 2002, non coerente con i raggi adottati da altre fonti | confermata | corretta |
| 19 | documentazione | formale | bassa | METODI § 16: elenco incompleto delle masse ricavate dalle orbite dei satelliti e dei periodi da fonti primarie (Eris, Gonggong, Haumea) | confermata | corretta |
| 20 | tempo | logico | media | Giorno della settimana e riga del gregoriano prolettico sfasati di un giorno a mezzanotte dopo passi di ora o di minuto | confermata | corretta |
| 21 | interfaccia | logico | media | Editor della data: Invio sul pulsante a.C./d.C. conferma la data con l'era precedente | confermata | corretta |
| 22 | interfaccia | logico | bassa | Regolo da tastiera: al limite l'annuncio 'Raggiunto il limite' è sostituito dalla data | confermata | corretta |
| 23 | interfaccia | formale | bassa | Editor della data: istruzione 'L'anno va da 1 a 10000' smentita con offset negativo | confermata | corretta |
| 24 | rendering | logico | media | Preset 'Sistema di Saturno' e inquadratura del contatore '+N lune' visti quasi di taglio (2,3° dal piano equatoriale): 7 lune su 9 nascoste, anelli invisibili | confermata | corretta |
| 25 | interfaccia | logico | media | Nota di benvenuto e messaggi di caricamento ed errore sopra legenda permanente, barra di scala e pulsanti della mappa (telefono verticale e orizzontale, tablet) | confermata | corretta |
| 26 | interfaccia | logico | media → bassa | Eccentricità delle comete quasi paraboliche arrotondata a 1: «1,000» o «1,0» sia con periodo finito sia con «Orbita iperbolica» | confermata | corretta |
| 27 | interfaccia | formale | media | Nome accessibile diverso dall'etichetta visibile: 'Tabella' (nome 'Vista testuale') e data del foglio sul telefono ('20 ott' contro 'ottobre') | confermata | corretta |
| 28 | interfaccia | logico | bassa | Regolo delle distanze invertito rispetto ai pulsanti e ai tasti della mappa: '+' sopra ma il cursore scende, PagSu avvicina sulla mappa e allontana sul regolo | confermata | corretta |
| 29 | interfaccia | logico | bassa | Ricerca: trattini tipografici non normalizzati, 'Hale–Bopp', 'Ikeya–Seki', 'Churyumov–Gerasimenko' senza risultati | confermata | corretta |
| 30 | interfaccia | formale | bassa | Elenco delle scorciatoie: la congiunzione 'e' è dentro il riquadro del tasto (', e .', '[ e ]', 'N e Maiusc + N') | confermata | corretta |
| 31 | interfaccia | logico | bassa | Selezione da collegamento (#slug letto su hashchange) non annunciata: la live region resta sul testo precedente, anche il messaggio 'collegamento ignorato' | confermata | corretta |
| 32 | interfaccia | logico | bassa | 'Mostra di nuovo la nota di benvenuto' senza riscontro e senza effetto se la nota è già visibile | confermata | corretta |
| 33 | effemeridi | logico | alta | Orbite delle comete quasi paraboliche disegnate con elementi baricentrici anche al perielio: forma dell'orbita grossolanamente errata | confermata | corretta |
| 34 | rendering | logico | media | Orbita tratteggiata per comete 'precisa' o 'buona': criterio della forma basato su Δa/a, degenere per e vicino a 1 | confermata | corretta |
| 35 | rendering | logico | bassa | Arco d'incertezza ±ε quasi invisibile sull'orbita del corpo selezionato | confermata | corretta |
| 36 | applicazione | logico | media → bassa | Ritorno a un blocco annullato durante la verifica SHA-256: caricamento senza fine, senza nuova richiesta né Riprova | confermata | corretta |
| 37 | interfaccia | logico | media | Telefono in orizzontale 568x320 e 480x320: campo Trova largo 4 px; a 480x320 coperto da Livelli e Menu | confermata | corretta |
| 38 | interfaccia | logico | bassa | Cambio di layout (desktop o tablet ↔ telefono): focus perso sul body se è nel catalogo o nella scheda | confermata | corretta |

### 5.5 Ciclo 5 (21/10/2026)

Verdetto ed esito sono quelli finali dei passaggi mirati del § 4.1: nel registro della ricerca 25 rilievi risultavano non verificati. Dove l'esito finale è «verificata e corretta» il verdetto è «confermata», perché una correzione segue solo a una conferma. La gravità verificata dei gruppi `73d403a` (alta), `c3ef6d9` (media) e `316ccb8` (bassa) è quella indicata nel messaggio del commit; per `92a4f93` non è stata registrata.

| n. | Area | Categoria | Gravità | Titolo | Verdetto | Esito |
|----|------|-----------|---------|--------|----------|-------|
| 1 | build-test | logico | media | Playwright riusa qualsiasi server già attivo su 4173/4174: con «npm run preview» (README) le prove e2e falliscono, con un server rimasto attivo provano una build superata | confermata | corretta (`6ad2c60`) |
| 2 | build-test | formale | bassa → media | Prova A21 «costo del budget di orbite (fuoco più 8) ≤ 1 ms» instabile con la CPU occupata: npm run check fallisce in modo intermittente | confermata | corretta (`73d403a`) |
| 3 | build-test | formale | bassa | Codice duplicato tra moduli non rilevato da tests/progetto/duplicati.test.ts | confermata | confermata, non corretta |
| 4 | build-test | formale | bassa | Esportazioni di src usate solo dalle prove: codice morto in produzione non segnalato da codiceMorto.test.ts | confermata | confermata, non corretta |
| 5 | rendering | formale | bassa | HTML non conforme: elemento `<style>` inserito nel body dal contenitore delle etichette | respinta | nessuna |
| 6 | pipeline-dati | logico | media → n.r. | Cloni dei piccoli corpi campionati con la covarianza SBDB di un'altra epoca: dispersione di Itokawa sovrastimata da 280 a 1700 volte, posizioni assenti prima del 1840 e livelli declassati | confermata in parte | corretta (`92a4f93`) |
| 7 | catalogo | dati | media → n.r. | Hektor: diametro da una nota non pubblicata del 1990; la fonte già citata per il GM (Marchis et al. 2014) dà dimensioni, periodo e polo, con rotazione retrograda non indicata | confermata in parte | corretta (`92a4f93`) |
| 8 | catalogo | dati | media → n.r. | Raggi radiometrici SBDB superati da modelli di forma 3D: Igea, Interamnia, Sylvia fuori dalle incertezze mostrate | confermata in parte | corretta (`92a4f93`) |
| 9 | catalogo | dati | bassa | Disnomia: diametro di Brown e Butler 2018 superato dagli stessi autori nel 2023; albedo misurata non riportata | confermata | corretta (`316ccb8`) |
| 10 | catalogo | dati | bassa | Nome ufficiale di 9P, 29P, 81P e 103P con il numerale d'uso ('Tempel 1', 'Wild 2', 'Hartley 2', 'Schwassmann-Wachmann 1') invece della forma MPC | confermata | corretta (`316ccb8`) |
| 11 | tempo | logico | bassa | Indicatore della stagione: «giorno del solstizio/dell'equinozio» per 24 h dopo l'istante, quindi anche nel giorno di calendario successivo; nel giorno dell'evento, prima dell'istante, «N giorni dopo» l'evento precedente | confermata | corretta (`316ccb8`) |
| 12 | tempo | logico | bassa | Ingresso in TT: con passi di mese, anno, secolo o millennio avanti e indietro dal limite inferiore la data torna al limite senza messaggio e con ◀ attivo | confermata | corretta (`316ccb8`) |
| 13 | interfaccia | logico | bassa | Regolo inferiore attorno all'ottobre 1582: tacche maggiori di 15 giorni sull'1 e sul 16 ottobre distanti 5 giorni, etichette accostate sotto l'ago | confermata | corretta (`316ccb8`) |
| 14 | applicazione | logico | media | Collegamento #slug all'avvio: inquadratura dell'orbita calcolata prima degli stati; orbita tagliata e #sole sul disco del Sole | confermata | corretta (`c3ef6d9`) |
| 15 | rendering | logico | media | Etichetta di un altro corpo sopra il marcatore selezionato: il clic seleziona l'etichetta e il ciclo tra i candidati si interrompe | confermata | corretta (`c3ef6d9`) |
| 16 | interfaccia | logico | media | Fasce di affidabilità del regolo: un campione ogni 50,5 anni esteso a tutto l'intervallo; alla data iniziale 19 corpi con fascia diversa dalla scheda | confermata | corretta (`c3ef6d9`) |
| 17 | interfaccia | logico | media → n.r. | Con 'Segui l'ora attuale' la live region resta muta per ogni azione dell'utente | confermata in parte | corretta (`92a4f93`) |
| 18 | interfaccia | logico | bassa | Regolo delle distanze da tastiera: Fine annuncia l'ampiezza richiesta (1 000 km) invece di quella ottenuta; ai limiti nessun messaggio | confermata | corretta (`316ccb8`) |
| 19 | interfaccia | logico | bassa | Vista testuale: ordinamento per nome non numerico (103P prima di 12P e di 1P, 9P dopo 81P) | confermata | corretta (`316ccb8`) |
| 20 | interfaccia | logico | bassa | Trova: dettaglio di 52 Europa ripete il nome ('Europa') invece del numero o della designazione | confermata | corretta (`316ccb8`) |
| 21 | interfaccia | logico | bassa | Tablet e telefono in orizzontale: ordine del focus nella console diverso dall'ordine visivo | confermata | corretta (`316ccb8`) |
| 22 | interfaccia | logico | bassa | Telefono: 'Inquadra' della scheda agisce dietro il foglio esteso; della mappa resta visibile una striscia di 20 px | confermata | corretta (`316ccb8`) |
| 23 | interfaccia | logico | bassa | Telefono: selezionando un corpo dalla vista testuale il foglio esteso copre la riga che ha il focus | confermata | corretta (`316ccb8`) |
| 24 | rendering | logico | media → n.r. | Riproduzione: le orbite oltre il budget di 8 non vengono mai ricostruite e la Luna si stacca dalla propria orbita disegnata | confermata in parte | corretta (`92a4f93`) |
| 25 | interfaccia | logico | alta | Senza WebGL2, sui telefoni alti fino a 640 px, nota di benvenuto, avviso WebGL2 ed errori con «Riprova» collassati ad altezza zero | confermata | corretta (`73d403a`) |
| 26 | interfaccia | logico | alta | Telefono in orizzontale: barra di caricamento ed errore con «Riprova» in testa al pannello laterale, fuori dall'area visibile quando il pannello è scorso | confermata | corretta (`73d403a`) |
| 27 | interfaccia | logico | media | Legenda permanente coperta dai pulsanti della mappa in modalità «riga» e, a 700x500, dalla casella Trova | confermata | corretta (`c3ef6d9`) |
| 28 | interfaccia | logico | bassa | Cambio di layout (rotazione da orizzontale a verticale, desktop → telefono): focus sul body se è su un controllo della console nascosto dal foglio compatto | confermata | corretta (`316ccb8`) |
| 29 | interfaccia | logico | bassa | Durante il caricamento di un blocco la scheda dice «Elementi non disponibili a questa data» e la vista testuale «non disponibile» | confermata | corretta (`316ccb8`) |
| 30 | interfaccia | logico | bassa | Telefono verticale con la vista testuale aperta: il pulsante «Apri la scheda di ...» è sotto la vista testuale ma resta raggiungibile con Tab | confermata | corretta (`316ccb8`) |

## 6. Punti aperti

### 6.1 Rilievi confermati e non corretti

| Rilievo | Gravità | Riferimento |
|---------|---------|-------------|
| Ciclo 5, n. 3: codice duplicato tra moduli non rilevato | bassa | `tests/progetto/duplicati.test.ts` |
| Ciclo 5, n. 4: esportazioni di `src` usate solo dalle prove non segnalate come codice morto | bassa | `tests/progetto/codiceMorto.test.ts` |

### 6.2 Punti noti non verificati

Registrati prima del passaggio del 22/10/2026; nessuno ha una gravità assegnata.

| Area | Punto | Riferimento |
|------|-------|-------------|
| dati | Apophis: la variante senza forze non gravitazionali, integrata dall'epoca della covarianza (2021), attraversa l'incontro del 2029 e domina la dispersione: livello «indicativa» dal 2060 circa, dati fino al 13/9/2120. Conforme al § 7.6.2, probabilmente troppo prudente: da valutare | `docs/PROGETTO.md` § 7.6.2 |
| dati | Igea: periodo 13,82559 h e polo (319°, -46°) di Vernazza et al. 2020 non usati (catalogo: 13,828 h da LCDB, nessuna inclinazione dell'asse) | `scripts/pipeline/small/catalogo.py`, `scripts/pipeline/raw/small/fisica-letteratura.json` |
| dati | Sylvia, Patroclus ed Eurybates: polo noto in letteratura ma nessuna inclinazione dell'asse nel catalogo | `public/data/v1/catalog.json` |
| dati | Validazione A7 con i vettori Horizons: l'integrazione in sequenza dalla data più antica è gestita solo per Itokawa; può ripresentarsi per altri corpi | `docs/VALIDAZIONE.md` § 13 |
| dati | Disnomia: albedo 0,05 ± 0,01 (Brown e Butler 2023) non mostrata per scelta di specifica | `docs/PROGETTO.md` § 9 |
| interfaccia | Tablet larghi da 700 a 712 px e alti da 480 a 491 px con i pulsanti in riga: la riga copre la legenda di 11,5 px a 700 × 480, di 1,5 px a 700 × 490 e di 0,5 px a 700 × 491 (nessuna sovrapposizione da 700 × 492, da 713 × 480, a 736 × 480 e da 800 × 480); la legenda è larga 340 px a 700 × 480 e 180 px a 700 × 600 | `src/ui/stile.css` |
| interfaccia | Regolo delle distanze sotto i 1000 km: su un corpo piccolo, dopo Fine, «Avvicina» riceve `aria-disabled` benché lo zoom possa ancora avvicinare | `src/ui/distanze.ts` |
| accessibilità | Con un dialogo modale aperto la live region, fuori dal dialogo, è inerte: annunci forse non letti; da verificare con uno screen reader reale | `src/ui/annunci.ts`, `src/ui/dialoghi.ts` |
| strumenti | `tests/render/prestazioni.test.ts` (A21) resta sensibile al carico della CPU con molti processi in parallelo | `tests/render/prestazioni.test.ts` |
| strumenti | Configurazioni dei laboratori di sviluppo (porte 5179 e 5199) con `reuseExistingServer: true` | `tests/render/playwright.render.config.ts`, `e2e/ui-lab.config.ts` |
| documentazione | `docs/REVISIONE_PROGETTO.md` riga 122 cita Brown e Butler 2018 per Disnomia: registro storico, lasciato invariato di proposito | `docs/REVISIONE_PROGETTO.md` |

### 6.3 Esiti dei passaggi del 22/10/2026 non corretti

Osservazioni emerse nelle correzioni e lasciate aperte; gravità non valutata.

| Area | Punto | Riferimento |
|------|-------|-------------|
| interfaccia | La rotella sul regolo inferiore spegne «Segui l'ora attuale» senza annuncio: «disattivato» è detto al primo annuncio di data o di limite successivo. Il § 11.4.3 prevede l'annuncio al rilascio e la rotella non ha rilascio | `src/ui/regolo.ts`, `docs/PROGETTO.md` § 11.4.3 |
| catalogo | Incertezza dell'inclinazione dell'asse non propagata per i poli SBDB (Bennu, Ryugu, Didymos) e WGCCRE: scelta documentata, il campo `sigma` di SBDB ha formati diversi e per Didymos («20 degrees») non dichiara sistema né livello di confidenza | `docs/METODI.md` § 16 |
| codice | L'espressione dell'ultimo istante ammesso (`maxEscl - 1/86400`) è ripetuta in `index.ts`, `regolo.ts`, `riproduzione.ts`, `messaggi.ts`, `steps.ts` e come `JD_ULTIMO_UT` in `calendar.ts`: stessa grandezza, nessuna tolleranza diversa, non unificata | `src/ui`, `src/time` |
| codice | `PRIORITA` in `scenaFinta.ts` duplica `CATEGORIE_PER_PRECEDENZA` di `catalogTypes.ts` (liste uguali oggi); nel contratto `ScenaUi.onSelezione` il ramo `null` resta solo nell'adattatore | `src/ui/dev/scenaFinta.ts` |
| codice | La chiave `T.scheda.fuoriCopertura` serve ora anche all'errore di un blocco: il nome non descrive più l'uso | `src/ui/testi.it.ts` |
| strumenti | Il gancio `waitIdle` non termina (60 s, poi eccezione) quando il blocco della data corrente è in errore: le prove devono usare `apri(..., { attendi: false })`; il vincolo non è documentato | `src/test-hooks.ts` |
| interfaccia | Tablet stretto basso: a 700 × 480 con la riga dell'incertezza dell'ora (console di 290 px, 298 al tocco) la colonna della Scheda è di 86 px (78 al tocco); la Scheda conserva nome e comandi (53 px, 61 al tocco) e ai messaggi restano 25 px (9 al tocco), che scorrono con la sfumatura. Dipende dall'altezza, non dalla larghezza: la decisione sul layout del telefono (§ 4.4) l'ha tolto solo sotto i 700 px | `src/ui/stile.css`, `docs/PROGETTO.md` § 11.3 |
| interfaccia | Tablet con poca altezza: popover Livelli alto 107 px a 700 × 480 e 127 px a 700 × 500; vista testuale con 0 righe visibili a 700 × 480, 700 × 500 e 1024 × 500, 1 a 700 × 560 e 2 a 700 × 600 (già fuori ambito nel § 4.3) | `src/ui/stile.css` |
| interfaccia | Telefono con la nota di benvenuto e il foglio medio su schermi alti 480 px (320 × 480, 320 × 568, 600 × 480, 699 × 480): la nota, alta almeno 120 px, copre 63 px del foglio e il pulsante «Apri la scheda»; non accade con il foglio compatto o a nota chiusa | `src/ui/stile.css` |

Risolti dalla decisione sul layout del telefono (§ 4.4, misurati su 600 × 480, 640 × 512 con scala 2, 650 × 520 e 600 × 700): legenda sovrapposta ai pulsanti in riga (206 × 51 px a 600 × 480) e ridotta a 80 px di larghezza (600 × 700), popover Livelli alto 107 px a 600 × 480, vista testuale senza righe visibili, messaggi compressi accanto alla Scheda (colonna di 86 px).

Corretti in seguito (§ 4.3; prove in `docs/VALIDAZIONE.md` § 12.6): menu «Viste predefinite» sotto gli 820 px, popover della barra superiore sotto la nota di benvenuto, riserva di 352 px a destra con la scheda ridotta sul tablet stretto, nota di benvenuto senza indizio di scorrimento; la nota non si nasconde più per mancanza di spazio (ridotta a un comando che ne apre il testo); soglie del tablet stretto (736 e 940 px, non 720 e 924) e Scheda ridotta a 28-32 px, con i comandi non cliccabili, sotto caricamento ed errori nella sua colonna; Catalogo alto 2 px a 600 × 480 e 600 × 700 (ora almeno 160 px, o fino alla console, anche sopra la legenda).

Misure di documentazione rimaste datate:

- Tempi dei cloni e dell'integrazione completa (`docs/SPIKE.md` S2, `docs/_parti/piccoli-corpi.md` § 3): misure storiche, dipendenti dal carico, non rieseguite.

Pagina singola (`docs/VALIDAZIONE.md` § 12.5 e A24) e conteggi delle prove (`docs/VALIDAZIONE.md` A1 e A12-A17, `docs/_parti/interfaccia.md` § 5, `docs/_parti/catalogo.md` § 11) riallineati con le misure del 22/10/2026.
