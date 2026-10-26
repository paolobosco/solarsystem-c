# Progetto: mappa interattiva 3D del Sistema solare

Versione 2.2 del 19/10/2026. Sostituisce la versione 2.1 del 19/10/2026. Le decisioni sulle segnalazioni di revisione sono in `docs/REVISIONE_PROGETTO.md`.

Convenzioni del documento: numeri con virgola decimale; JD indica il giorno giuliano; "anno -N" indica l'anno astronomico (1 a.C. = anno 0); "blocco k" indica l'intervallo temporale definito al § 8.1; "a ⊕ b" indica la somma in quadratura √(a² + b²).

## Registro delle modifiche

Versione 2.2 (19/10/2026): allineamento a codice e dati pubblicati; soglie A7 adottate dopo la validazione (misure in `docs/VALIDAZIONE.md`, § 7).

| § | Modifica |
|---|----------|
| 3.1 (RF8), 3.2 (RNF8), 5.3, 11.12, 11.13, 11.14, 13 (A23) | Sito bilingue italiano e inglese: testi in `testi.it.ts` e `testi.en.ts` scelti da `testi.ts`; lingua iniziale da preferenza o browser; controllo «Lingua / Language» nelle Impostazioni con ricarica che mantiene data, corpo e vista (passaggio una tantum in sessionStorage, eccezione a RF8 per la data); numeri e date per lingua (punto decimale e virgola tra i gruppi, "1 January", "10000 BC", "AD 800"); catalogo in inglese da `catalogo.en.json`; rimossa la cartella `traduzioni/` |
| 3.2 (RNF4), 5.2 | ESLint 10.12.0 e @eslint/js 10.0.1 (linea 9 fuori supporto); regole ESLint con informazioni di tipo su `src`; nessun pacchetto deprecato nel lockfile |
| 5.1, 5.3 | Struttura del repository allineata ai file reali |
| 5.2 | Ambiente principale della pipeline con jsonschema 4.26.0 e pillow 13.0.0, come in `requirements.txt` |
| 5.4, 8.10 | `primario`: Sole, pianeta o pianeta nano (Caronte, Notte e Idra attorno a Plutone, Disnomia attorno a Eris); null per il Sole |
| 5.4 | `waitIdle()` si conclude con un frame disegnato alle dimensioni correnti della canvas |
| 5.4 | 1 UA solo in `src/ephem/constants.ts` (`UA_KM`); conversioni da km a UA per i testi in `format.ts`, `scala.ts` e `renderer.ts` |
| 5.7, 16.3 | Avviso di copyright e testo della licenza MIT di three nel bundle e in `assets/LICENZE.txt`, verificati da `make-artifact.mjs`; rimossa la costante di build `__TARGET__`, non usata |
| 5.7 | `assetFileNames` della modalità `artifact`: `assets/app.css` per il foglio di stile unico, come richiede `make-artifact.mjs` |
| 5.2, 5.7 | Modalità `artifact` in `dist-artifact-build/`, letta da `make-artifact.mjs`: `npm run build:artifact` e le prove Playwright non sovrascrivono più la build del sito in `dist/` |
| 6.5, 8.9 | σ(ΔT): 0,8·u² solo fino al 1200, come nella fonte; 20 s dal 1300 al 1600 (Espenak e Meeus 2006) e valori dell'era telescopica nel 1700, 1800 e 1900 (Stephenson e Houlden 1986); nel periodo misurato scarto del modello da EOP 20 C04 (con la S15.2020 0,45 s nel 1962-1971, adottato anche prima del 1962, e 0,114 s dal 1972; 0,0017 s con i valori IERS) invece di 0,8·u²; dopo y_obs anche la deriva dall'eccesso di LOD dell'ultimo anno; σ continua |
| 7.6.4 | Corpi con modello WGCCRE come nel catalogo; Arrokoth, assente da `pck00011.tpc`, con assi fissi |
| 9 | GM di Marte, Giove, Saturno, Urano, Nettuno, Plutone e dei satelliti dai kernel satellitari; dalla pagina JPL dei satelliti solo i raggi |
| 9 | Rotazione sincrona di Eris (Szakáts et al. 2023) e GM di Haumea (Ragozzine e Brown 2009); raggio di 19P dal diametro SBDB; periodo 360°/Ẇ per i corpi con modello WGCCRE e per Febe; semiassi in ordine decrescente |
| 10.1 (R5, R7) | Ombre tra corpi (eclissi) non rappresentate; ombra del pianeta sugli anelli di Saturno rappresentata |
| 10.1 (R7, R11, R12, R13), 10.3 | Profilo degli anelli mediato sul pixel e linee attenuate dietro gli anelli; etichette degli anelli di distanza fuori dai dischi; pixel ratio al cambio della sola densità; etichette nascoste e messaggio a contesto perso; rotella sopra le etichette; ampiezza conservata al cambio di aspetto; distanza minima e inquadratura riferite al primario per i corpi senza posizione |
| 11.4.3, 11.12 | Blocco delle rotazioni con il periodo in valore assoluto; inquadratura "orbita" con l'orbita intera nella vista |
| 3.1 (RF5), 7.6.4, 10.1 (R14), 10.3, 11.5.1, 11.5.2 | Assi di rotazione solo per i corpi con orientamento modellato; barra di scala alla profondità del corpo a fuoco; distanza minima dal centro anche con il bersaglio spostato; anello di selezione ed etichetta dei dischi grandi attorno al contorno proiettato |
| 12.1 | Programmi della pipeline allineati ai file reali |
| 13 (A7) | Giunzioni e salti tra record di apparizioni diverse ≤ ε del corpo a quell'istante; Cerere a -7000 ≤ ε(-7000) = 103″; C/1680 V1 al perielio eccezione dichiarata (759 km a 0,0062 UA dal Sole) |
| 3.1 (RF8), 11.12 | Hash con il corpo selezionato, non con il fuoco dei preset; `#sole` apre la vista Sistema interno |
| 7.1, 11.7 | Scheda: Notte e Idra rispetto al baricentro del sistema di Plutone; passaggio al pericentro più vicino all'istante; distanza dalla Terra anche per il Sole |
| 11.3 | Orizzontale (altezza < 480 px) anche sotto i 600 px di larghezza; mappa a sinistra del pannello laterale |
| 11.4.3 | Stagione dalla longitudine apparente del Sole (aberrazione annua, nutazione IAU 2000B), come gli istanti ufficiali di equinozi e solstizi; giorni interi dall'istante dell'evento risolto sugli stati della Terra |
| 11.5.3, 11.8, 11.9 | Annuncio "Corpo selezionato: ..."; "Orbita non determinabile" solo con il livello non determinabile; conclusione del caricamento nella live region |
| 11.13 | Cifre di distanze, elementi orbitali, valori fisici e ΔT dalle incertezze stimate |
| 6.6 | Passi di calendario: un risultato entro 1 ms da un limite (risoluzione della data mostrata) è il limite stesso, anche per i limiti in TT fuori dalla griglia del millisecondo |
| 11.4.3 | Stagione: con 0 giorni interi dall'istante il testo è "meno di un giorno dopo l'equinozio/il solstizio", non "giorno dell'equinozio/del solstizio" (le 24 h dall'istante possono cadere in due giorni di calendario) |
| 16.1 | DOI del capitolo di Müller et al. 2020; Wyman et al. 2013 |
| 5.4 | `leggiSlug()`: testo dell'hash decodificato, validato dal chiamante (§ 11.12) |
| 16.1 | Szakáts et al. 2023 e Ragozzine e Brown 2009, fonti del catalogo |
| 16.3 | Mosaici USGS: pubblico dominio o uso libero con citazione degli autori, come in `docs/LICENZE.md`; SIL OFL 1.1 solo per i font |
| 7.6.2 | Metrica dei cloni senza la differenza di anomalia media (errore di posizione: angolo eliocentrico e \|Δr\|/r); comete a record: ε minimo all'apparizione e crescente fino al salto misurato a ciascuna giunzione, non il massimo dei due salti in tutto l'intervallo; ε alle giunzioni non inferiore al salto |
| 8.1, 8.2, 8.7 | `reliability.bin` (`SSRELI02`): intervalli di 1,25 anni dal 12/9/1980 e di 20 anni prima; 712 nodi |
| 7.5.2, 7.5.4, 8.10 | Satelliti regolari (`pianoSegueEquatore`): nei record secolari il sistema F ruota con il polo WGCCRE del primario dall'epoca di giunzione con i record da SPK |
| 5.3, 5.6, 11.11, 13 (A19) | SHA-256 anche senza `crypto.subtle` (contesti non sicuri); cache HTTP: `manifest.json` rivalidato a ogni avvio, file non conforme scaricato di nuovo dal server; richieste annullate dopo 30 s senza byte ricevuti, con messaggio e "Riprova" |
| 5.7 | Soglia dell'avviso di Vite sulla dimensione del bundle (`build.chunkSizeWarningLimit`) dichiarata e motivata |
| 3.2 (RNF4), 11.1, 13 (A11) | Colori della scena e dei simboli solo in `src/render/costanti.ts`, verificati da A11 insieme ai token CSS; file di configurazione senza API deprecate |
| 11.3, 11.4.1, 11.4.3, 11.6, 11.7, 11.9, 11.12, 13 (A15) | Orizzontale sotto i 684 px con la barra a tutta larghezza, sotto i 512 px con il pannello più stretto; messaggi e nota di benvenuto senza coprire legenda e pulsanti della mappa; regolo delle distanze con 10³ km in alto; Invio sui pulsanti dell'era; messaggio del limite del regolo non sostituito dalla data; anno 10001 a.C. con un offset negativo; trattini tipografici nella ricerca; eccentricità dal lato di 1; `main` e `h1`, nomi accessibili con l'etichetta visibile, annuncio dei collegamenti, "Mostra di nuovo la nota di benvenuto", focus al cambio di layout |
| 5.4, 6.1 (T4), 11.4.1 | Giorno della settimana e riga del gregoriano prolettico dalla data mostrata (istante arrotondato al millisecondo, ora con offset), anche alla mezzanotte raggiunta con passi di ora o di minuto: `giornoSettimanaLocale`, `jdToProlepticGregorian` con l'offset |
| 7.8.2, 10.1 (R11), 10.2, 11.3, 11.5.1 | Preset dei sistemi planetari e contatore "+N lune" a 30° sul piano del sistema (orbita della luna maggiore), non più quasi di taglio per Saturno; tratteggio delle orbite solo per i livelli "indicativa" e "non determinabile", anche con la forma non determinata; arco d'incertezza ±ε continuo e 2 px più largo dell'orbita, distinguibile anche con il corpo selezionato |
| 11.9, 13 (A17) | Live region: in riproduzione, compresa "Segui l'ora attuale", tacciono solo gli annunci prodotti dal tempo (data che avanza, passi automatici, caricamento dei dati); gli annunci che seguono un'azione esplicita dell'utente (selezione da Trova, catalogo e mappa, numero di risultati e "Nessun corpo per ...", filtri, livelli, vista testuale, attivazione e disattivazione dell'opzione) si pronunciano sempre (WCAG 2.2, SC 4.1.3); annuncio dell'attivazione e della disattivazione di "Segui l'ora attuale" |
| 4.3, 16.2 | Nome ufficiale delle comete periodiche numerate dall'MPC, senza numerale d'uso (9P/Tempel, 29P/Schwassmann-Wachmann, 81P/Wild, 103P/Hartley; IAU Comet-Naming Guidelines, art. 5.5); nome e alias conservano il numerale; il controllo con l'Identifier API comprende le comete numerate |
| 9, 16.1 | Raggio di Disnomia da Brown e Butler (2023), diametro 615 +60/-50 km (6,5σ), al posto dei 700 ± 115 km di Brown e Butler (2018) |
| 11.4.3 | Tacche del regolo inferiore con unità di giorni: il salto del 5-14 ottobre 1582 non avvicina due tacche a meno di mezza unità (si omette il 16 ottobre con tacche ogni 15 giorni, a 5 giorni dall'1 ottobre), per le tacche maggiori e minori |
| 11.3, 11.9 | Regolo delle distanze: dopo ogni variazione (pulsanti, tasti della mappa, tastiera e puntatore sul regolo) la live region annuncia l'ampiezza ottenuta e, se la vista si ferma prima, il limite raggiunto con `aria-disabled` su + e −; Inizio e Fine non annunciano più l'ampiezza richiesta; frecce, PagSu e PagGiù del regolo con lo zoom dei pulsanti (sotto 10³ km su un corpo piccolo avvicinano invece di tornare a 10³ km), Inizio e Fine senza muovere la vista contro il verso richiesto |
| 11.9 | Console: ordine di tabulazione uguale all'ordine visivo in ogni layout; fuori dal desktop il regolo precede i passi nel DOM (cambiato al cambio di layout) invece di `order` CSS |
| 11.3, 11.7 | Telefono: "Inquadra" della scheda porta il foglio esteso a compatto, perché il corpo inquadrato resti visibile, e il focus al pulsante "Apri la scheda"; il pulsante "Apri la scheda" non compare con la vista testuale aperta, che lo coprirebbe (la scheda si apre dalla riga del corpo) |
| 11.9, 11.12 | Focus sul telefono: la selezione di un corpo dalla tabella porta il focus al titolo della scheda (il foglio esteso copre la riga); al cambio di layout un controllo nascosto dal nuovo layout cede il focus alla maniglia del foglio o al pulsante della data, non al body |
| 11.9 | Vista testuale: colonna Corpo ordinata per nome con i numeri come numeri (1P, 9P, 12P, 103P, non 103P prima di 12P e di 1P) |
| 11.6 | Testo secondario di Trova: il nome ufficiale già presente nel nome come parola intera non si ripete (52 Europa: "A858 CA", non "Europa") |
| 11.7, 11.9, 11.11 | Dati della data in arrivo: la sezione Orbita della scheda e le celle senza valore della vista testuale dicono "in caricamento" finché la barra di caricamento è visibile, non "non disponibile"; dopo l'errore di un blocco restano "non disponibile" |
| 8.10, 8.11, 12.2 | Rigenerazione riproducibile: con dati invariati `generato` e `versioneDati` restano quelli pubblicati e `catalog.json` e `manifest.json` sono identici byte per byte; cambiano solo con il contenuto (`--generato` e `--versione` li fissano) |
| 9 | Albedo SBDB di Hektor (TRIAD, 0,025, senza incertezza) non adottata: con H = 7,32 corrisponde a un diametro di circa 289 km, non ai 250 ± 26 km di Marchis et al. 2014, che non pubblicano un'albedo; "non noto" |
| 9 | Incertezza dell'inclinazione dell'asse di Arrokoth (± 1,0°) e Hektor (± 9,8°), propagata al primo ordine dall'incertezza del polo di letteratura; nessuna per i poli SBDB e WGCCRE |
| 11.3, 11.12 | Nota di benvenuto e messaggi su desktop e tablet: larghezza simmetrica attorno al centro (non coprono Catalogo né Scheda), altezza limitata sotto la barra e sopra console e legenda con scorrimento, sul tablet con i pulsanti in riga a destra della legenda; nota non mostrata, ma non chiusa, con meno di 200 px liberi (messaggi di caricamento ed errore sempre visibili, almeno 120 px); menu Viste aperto sopra i messaggi |
| 11.9 | Telefono con vista testuale e foglio esteso: la tabella coperta (pochi pixel) è `inert`, fuori dall'ordine di Tab e dall'albero di accessibilità; il focus che conteneva passa alla maniglia del foglio |
| 11.5.2 | Il marcatore del corpo selezionato con l'anello di selezione vale come zona occupata per le etichette degli altri corpi (l'altro lato, altrimenti nascoste; quelle forzate restano visibili) |
| 11.7, 11.11 | Dopo l'errore di un blocco o di `moon.bin` il blocco "Ora" della scheda e "Leggi posizione" dicono "Dati non disponibili a questa data.", non "Dati in caricamento.": questa frase solo finché la barra di caricamento è visibile, come la sezione Orbita e la vista testuale |
| 11.4.3, 11.9, 13 (A17) | Live region: l'arresto della riproduzione per l'errore di un blocco si annuncia una volta ("Riproduzione in pausa: dati non caricati" con la data); "Segui l'ora attuale" spento da un passo, da "Adesso", dal regolo, dall'editor o dall'ingresso in TT annuncia "disattivato" una sola volta, unito all'annuncio della data o del limite (da solo per l'ingresso in TT) |
| 11.6 | Trova: a pari rango e categoria i risultati seguono l'ordine numerico dei nomi (1P, 12P, 19P, 103P, 109P), come la colonna Corpo della vista testuale; con il limite di 8 risultati compaiono 1P e 12P, non 103P e 109P |
| 6.6, 11.4.3 | Limite raggiunto definito in un solo punto (`limiteRaggiunto`, confronto esatto): lo usano il passo, `aria-disabled` su Indietro e Avanti e l'avviso del limite, senza la tolleranza di 1e-9 giorni che l'avviso aveva da solo; nessun cambio ai limiti in UT e in TT |
| 11.5.3 | Un clic senza candidati non cambia la selezione; la scena della pagina di prova `ui-lab.html` usa `Selettore` di `src/render/picking.ts` (etichette e dischi come candidati, clic ripetuti, nessun evento senza candidati) |
| 5.2 | Le cartelle `dist-test*/` (build di prova con un'altra cartella di uscita) sono escluse da git e da ESLint, come `dist-test/` |
| 11.1, 11.3, 11.6, 11.12 | Nota di benvenuto su desktop e tablet ridotta al comando "Leggi la nota di benvenuto" (testo in un dialogo), non più nascosta, con meno di 200 px di larghezza o al massimo 120 px di altezza (WCAG 2.2, SC 1.4.4 e 1.4.10); tablet stretto (sotto i 736 px, sotto i 940 px con i pulsanti in riga) con i messaggi in testa alla colonna della Scheda, che conserva l'intestazione con nome e comandi; Catalogo alto almeno 160 px, o fino alla console, anche sopra la legenda; caricamento ed errori prima della nota; bordo sfumato dei messaggi che scorrono; popover della barra sopra i messaggi; menu Viste dentro la finestra con tutte le voci visibili (una o due colonne, sotto i pulsanti in riga); menu Viste e Menu riaperti dalla prima voce e chiusi da Tab oltre l'ultima; anello del focus interno ai pulsanti della nota ridotta; focus alla nota alla chiusura del suo dialogo se il comando è sparito; messaggi del telefono sopra il pulsante "Apri la scheda" |
| 11.1, 11.3, 11.12 | Anello del focus intero nei pannelli che scorrono, nei comandi della Scheda ridotta all'intestazione e nel menu Viste a due colonne con il puntatore sulla voce sottostante; sfumatura dei messaggi mai più alta del testo nascosto; alla chiusura del dialogo della nota il focus passa alla nota senza passare per il body |
| 11.3, 11.5.2, 11.9, 11.12, 13 (A12) | Soglia tra telefono e tablet a 700 px (decisione del 22/10/2026 sulle finestre larghe 600-699 px): telefono fino a 699 px, tablet da 700 a 1023 px, desktop da 1024 px; l'orizzontale (altezza < 480 px) resta prioritario a ogni larghezza e copre già lo zoom al 200 % su 1366 × 768, 1280 × 720 e 1280 × 800 e i telefoni in orizzontale. Motivi: le larghezze 600-699 px non si possono abbandonare (tablet Fire e Android da 7-8 pollici in verticale, Galaxy Z Fold 5 aperto a 690 × 829, finestre affiancate di iPadOS 26, finestre a metà schermo su schermi da 1280-1366 px, zoom al 200 %; WCAG 2.2, SC 1.4.4 e 1.4.10); WCAG ammette il cambio di layout con lo zoom (W3C, Understanding Success Criterion 1.4.4: Resize Text, WCAG 2.2, https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html: «It is not required to achieve 200% text enlargement while remaining inside a specific breakpoint»); il layout del telefono elimina i difetti del tablet stretto tra 600 e 699 px (legenda ridotta a 80 px di larghezza a 600 × 700 o sovrapposta ai pulsanti in riga a 600 × 480, pannello Livelli di 107 px a 600 × 480, vista testuale senza righe visibili a 600 × 480, 640 × 512 e 650 × 520, messaggi compressi accanto alla Scheda). Il tablet stretto (sotto i 736 px e sotto i 940 px con i pulsanti in riga) resta per le larghezze da 700 a 735 px e da 700 a 939 px. Il limite delle etichette (circa 25 sotto i 600 px di larghezza della mappa, § 11.5.2) non cambia: misura la mappa, che in orizzontale è più stretta della finestra |

Versione 2.1 (19/10/2026): correzioni fattuali e valori misurati dopo la produzione dei dati; misure in `docs/VALIDAZIONE.md` e `docs/SPIKE.md`.

| § | Modifica |
|---|----------|
| 3.2 (RNF7), 8.1 | Limite per file da 4 a 6 MB; dimensioni misurate dei dati e budget complessivo |
| 6.4 | y_obs e ΔT_obs misurati; parabola di Stephenson et al. 2016 a -9999 ricalcolata (454 050 s); confronto con Horizons: prima del 1950 il ΔT di Horizons supera le fonti adottate, quindi le fixture in UT non coincidono con Horizons |
| 7.3.3 | Passi effettivi: Mercurio 16 d ed EMB 16 d in tutti i blocchi |
| 7.4 | κ adottato (S1) |
| 7.5.1, 7.5.2 | Tritone su NEP098 (1800-2199) e NEP097 (1600-1800); kernel lunghi omessi per Dione, Rea e Tritone; durate dei record adottate in S3 |
| 7.6.1, 7.6.3 | Asteroidi di sb441-n16 su SPK Horizons nella finestra 1600-2121; DT non implementato in ASSIST 1.2.3; tolleranze del livello 4 prima del 1600 |
| 6.5, 7.7 | Soglia della rotazione terrestre indeterminata ricalcolata con la formula del § 6.5: fino all'anno -4594; vale con l'istante in TT, perché con l'istante in UT l'angolo di rotazione è fissato |
| 8.9 | Esempio di `time.json` allineato al file prodotto (serie IERS dal 2019, campi `raccordo` e `copia`) |
| 9 | Fonti effettive dei dati fisici di Quaoar, Varuna, Issione, Mani; texture di Titano, Saturno, Urano, Nettuno |
| 16.1 | URL della serie EOP 20 C04; riferimenti di Vilenius et al. 2012 e Müller et al. 2020 |

## 1. Obiettivo e ambito

Sito web statico con una mappa 3D interattiva del Sistema solare che:

1. rappresenta Sole, pianeti, pianeti nani, lune principali, asteroidi principali, centauri, comete principali, oggetti transnettuniani (TNO) principali e oggetti interstellari (§ 4);
2. usa distanze e dimensioni reali, senza ingrandimenti dei corpi né compressione delle distanze; i simboli di posizione (marcatori) sono dichiarati come tali;
3. calcola le posizioni da effemeridi riconosciute (JPL DE441, SPK satellitari JPL, JPL Horizons e SBDB, integrazione numerica con il modello dinamico di JPL) e usa dati fisici da fonti primarie (§ 9);
4. consente di scegliere data e ora dal 1° gennaio 10000 a.C. 00:00 UT al 31 dicembre 2120 23:59:59 UT;
5. dichiara per ogni corpo e istante l'affidabilità della posizione (§ 7.8);
6. ha un'interfaccia in italiano con colore di base verde, conforme a WCAG 2.2 livello AA;
7. funziona come sito ospitato e come pagina singola pubblicata con file di supporto (§ 5.7).

## 2. Ipotesi

| # | Ipotesi | Conseguenza |
|---|---------|-------------|
| I1 | Date anteriori al 15/10/1582: calendario giuliano (prolettico prima del 45 a.C.). Dal 15/10/1582: gregoriano. È la convenzione del manuale di JPL Horizons. Le irregolarità dei bisestili tra il 45 a.C. e l'8 d.C. non sono modellate. | I giorni 5-14 ottobre 1582 non esistono. Le date giuliane remote sono sfasate rispetto al gregoriano prolettico (77 giorni nel 10000 a.C.) e quindi rispetto alle stagioni (§ 11.4.3). |
| I2 | Anni a.C. storici, senza anno zero: 1 a.C. = anno astronomico 0; 10000 a.C. = anno -9999. | Limite inferiore incluso: -9999-01-01 00:00 UT (giuliano) = JD -1 931 076,5. Limite superiore escluso: 2121-01-01 00:00 UT (gregoriano) = JD 2 495 739,5; ultimo istante ammesso 2120-12-31 23:59:59 UT. Le costanti si ricavano dalla funzione di calendario, mai a mano. |
| I3 | L'istante inserito è in UT (UT1). In alternativa, nel pannello avanzato, l'istante si inserisce in TT. È disponibile un offset orario fisso facoltativo (disattivato all'avvio) per inserire e mostrare l'ora locale; nessuna ora legale. | Conversione UT → TT con ΔT (§ 6.4). L'incertezza di ΔT (§ 6.5) entra nell'affidabilità quando l'istante è in UT. |
| I4 | Scena eliocentrica, centro del Sole all'origine, assi dell'eclittica J2000: x verso l'equinozio J2000, z verso il polo nord dell'eclittica J2000. Rotazione ICRF → eclittica con obliquità 84 381,448″ attorno all'asse x, come in Horizons. Il bias di riferimento ICRF/J2000 (circa 23 mas) è trascurato. | Il moto del Sole attorno al baricentro non è mostrato, ma è calcolato dove serve (§ 7.6.5). |
| I5 | "Principali" segue i criteri scritti del § 4. L'elenco è chiuso per questa versione ed estendibile tramite catalogo senza modifiche al codice. | Ogni corpo ha almeno un criterio o una scelta editoriale dichiarata. |
| I6 | Posizioni geometriche istantanee in TDB, senza tempo luce né aberrazione. Distanze geometriche. Il tempo luce è la distanza divisa per c, solo informativo. | I confronti si fanno con vettori Horizons "Geometric". |
| I7 | TDB = TT. La differenza (meno di 2 ms) è trascurata, come in Horizons prima del 1962. | Le tabelle sono in TDB, i calcoli usano TT. |
| I8 | Il sito funziona senza servizi esterni in esecuzione. Unici host esterni ammessi: fonts.googleapis.com e fonts.gstatic.com; script esterni solo da cdnjs, jsdelivr o unpkg (non previsti in questa versione: il codice è incluso nel bundle). | Tutti i dati sono precalcolati dalla pipeline (§ 12). |
| I9 | Browser di riferimento: Chrome ed Edge 111+, Firefox 114+, Safari 16.4+, con WebGL2. Uso anche da smartphone. | Senza WebGL2 resta disponibile la vista testuale (§ 11.9). |
| I10 | DE441 è l'unica effemeride JPL che copre l'intero intervallo. DE442 (2024) copre solo 1549-2650. Nel secolo corrente DE441 è meno accurata di DE440, con differenze trascurabili alla scala dell'applicazione. | Si usa DE441 su tutto l'intervallo, senza raccordi tra effemeridi diverse. |
| I11 | L'incertezza intrinseca di DE441 per i pianeti è assunta trascurabile (inferiore a 1″) rispetto alle altre voci di errore. Per la Luna si assume un'incertezza dell'accelerazione mareale σ_ṅ = 0,2″/cy² (ipotesi conservativa, da confrontare con Park et al. 2021 e Williams e Boggs 2016 nello spike S1). | Errore lunare intrinseco ½·σ_ṅ·τ², circa 0,4° a -9999 (τ in secoli da J2000). |
| I12 | Satelliti: l'accelerazione mareale non è vincolata dalle osservazioni per la maggior parte dei satelliti. Si assume σ(ṅ/n) = 1·10⁻⁹ anno⁻¹, ordine di grandezza della misura per Io di Lainey et al. 2009. Eccezione: Fobos, con accelerazione misurata e modellata in MAR099 (λ = λ₀ + n·t + ½·ṅ·t², ½·ṅ = (1,258 ± 0,058)·10⁻³ °/anno², Brozović, Jacobson e Park 2025): σ_ṅ = 1,16·10⁻⁴ °/anno², 3,6 volte minore del valore di I12. | La fase orbitale dei satelliti interni diventa "non determinabile" entro qualche secolo o millennio dall'arco osservativo (§ 7.5.6). |
| I13 | Nutazione (al massimo circa 17″) e moto del polo sono trascurati nell'orientamento della Terra. | Orientamento terrestre da polo medio di Vondrák e angolo di rotazione terrestre (§ 7.7). |
| I14 | Tema scuro unico, scelto per la leggibilità del cielo e la coerenza con lo sfondo stellare. Non esiste un tema chiaro. | `color-scheme: dark`; sfondo esplicito su `body`. |
| I15 | Il calcolo delle effemeridi a runtime è sincrono e non estrapola mai oltre i dati caricati. | Contratto `EphemerisService` (§ 5.4). |

## 3. Requisiti

### 3.1 Funzionali

- RF1 Vista 3D navigabile: rotazione, zoom continuo da una quota minima di max(0,01·R; 0,5 km) sulla superficie del corpo a fuoco fino a un'ampiezza della vista di 2·10⁵ UA, panoramica, messa a fuoco su un corpo con transizione animata (§ 10.3).
- RF2 Selezione di un corpo: clic o tocco su marcatore, etichetta o disco risolto; elenco per categorie; ricerca con completamento e alias (§ 11.6).
- RF3 Scheda del corpo selezionato: dati fisici con fonte, elementi orbitali alla data con sistema di riferimento dichiarato, distanza dal Sole e dalla Terra (UA o km, tempo luce informativo), velocità, sorgente delle effemeridi e soluzione orbitale, affidabilità (§ 11.7).
- RF4 Controlli temporali: editor della data a campi (giorno, mese, anno, era, ora, minuti), calendario applicato e giorno della settimana, pulsante "Adesso", passi di minuto, ora, giorno, mese, anno, secolo, millennio, regolo temporale a due livelli, riproduzione con velocità a gradini, blocco ai limiti (§ 11.4).
- RF5 Livelli visivi: orbite, etichette, marcatori, anelli di distanza sull'eclittica, griglia dell'eclittica J2000 (facoltativa), eclittica della data (facoltativa), assi di rotazione (solo per i corpi con orientamento modellato), anelli di Saturno e Urano, stelle reali con moto spaziale alla data, barra di scala.
- RF6 Filtri per categoria: pianeti, pianeti nani, lune, asteroidi, centauri, comete, TNO, interstellari, con contatore (§ 11.6).
- RF7 Finestra "Fonti e metodi" con riferimenti, modelli, soluzioni orbitali, limiti, accuratezza, licenze e attribuzioni.
- RF8 Collegamento condivisibile: solo il corpo selezionato nell'hash (`#marte`), uguale nelle due varianti. Preferenze locali in localStorage, sempre dentro try/catch, compresa la lingua (`ss.ui.lingua`). La data non entra nell'URL né nelle preferenze. Unica eccezione: al cambio di lingua la pagina si ricarica e data e ora (con scala e offset), corpo selezionato e vista passano alla pagina nuova con un passaggio una tantum in sessionStorage (`ss.ripristino`), scritto subito prima della ricarica, letto e cancellato all'avvio, sempre dentro try/catch (§ 11.12).
- RF9 Scorciatoie da tastiera documentate e disattivabili (§ 11.9).
- RF10 Vista testuale tabellare, alternativa alla scena 3D e ripiego senza WebGL2 (§ 11.9).
- RF11 Preset di vista e regolo logaritmico delle distanze (§ 11.3).

### 3.2 Non funzionali

- RNF1 Prestazioni: calcolo di stati, orbite ed etichette al massimo 4 ms per frame su CPU con tutti i corpi (misura in Node e in modalità debug); rendering solo su richiesta (§ 10.1, R12); prima visualizzazione con al massimo 4 MB di dati oltre al bundle; texture e stelle dopo il primo frame.
- RNF2 Precisione numerica: calcolo in doppia precisione su CPU; origine della scena sul corpo a fuoco; vertici delle orbite relativi al corpo; depth buffer logaritmico (§ 10).
- RNF3 Accessibilità: WCAG 2.2 livello AA (contrasto, riadattamento a 320 px, tastiera, destinazioni, movimento ridotto, colori forzati, lettori di schermo).
- RNF4 Qualità: TypeScript strict, ESLint (su `src` anche le regole con informazioni di tipo `no-floating-promises`, `no-misused-promises`, `no-unnecessary-type-assertion`), Vitest, Playwright, axe-core; Python con pytest e ruff; versioni fissate e supportate, nessun pacchetto deprecato nel lockfile, nessuna API deprecata nei file di configurazione; installazione con `npm ci`.
- RNF5 Tracciabilità: ogni valore fisico o orbitale del catalogo riporta fonte, incertezza (se nota), anno; ogni corpo riporta la soluzione orbitale e la data di estrazione; risposte grezze congelate nel repository (§ 12.2).
- RNF6 Nessuna dipendenza da servizi esterni in esecuzione (I8).
- RNF7 Vincoli di pubblicazione come pagina singola: niente fetch verso host esterni; URL relativi; niente query string; hash solo come token `^[a-z0-9-]{1,40}$`; localStorage protetto; ogni file al massimo 6 MB (limite della piattaforma: 15 MB per file binario, 16 MB per file di testo); al massimo 90 file e 48 MB in totale (limite della piattaforma: 255 file e 64 MB per pubblicazione); funzionamento a 400 px senza scorrimento orizzontale, margini dei controlli di almeno 16 px, safe-area; niente alert, confirm, prompt.
- RNF8 Lingua: interfaccia bilingue, italiano e inglese. Tutti i testi visibili sono raccolti in `src/ui/testi.it.ts` e `src/ui/testi.en.ts` (stesse chiavi, verificate dal compilatore); i moduli importano da `src/ui/testi.ts`, che sceglie l'insieme una sola volta all'avvio (`src/ui/lingua.ts`). Lingua iniziale: preferenza salvata; altrimenti la prima lingua del browser con prefisso `it` o `en` (italiano se è `it`, inglese altrimenti, anche senza corrispondenza); senza browser (Node, Vitest) italiano. `html lang` e titolo del documento seguono la lingua attiva (valore iniziale `it` nell'HTML). Nomi dei corpi e testi delle fonti del catalogo in inglese da `src/data/catalogo.en.json`; i nomi dell'altra lingua restano alias di ricerca. Nessun carattere U+2014 nei testi. Il bundle resta un solo file JavaScript senza import dinamici (§ 5.7).

## 4. Corpi rappresentati

### 4.1 Criteri di selezione (I5)

- Pianeti: tutti.
- Pianeti nani: i cinque riconosciuti dall'IAU (Risoluzione 2006 B5 e successive classificazioni): Cerere, Plutone, Eris, Haumea, Makemake.
- Asteroidi: (a) diametro ≥ 250 km secondo SBDB (elenco verificato il 18/10/2026: Cerere, Vesta, Pallade, Igea, Interamnia, 52 Europa, Davida, Euphrosyne, Patientia, Sylvia); (b) corpi raggiunti da una sonda (sorvolo, orbita, impatto o campionamento) entro il 31/12/2025; (c) scelte editoriali dichiarate: Giunone (uno dei primi quattro asteroidi scoperti), Hektor (troiano più grande), Patroclus ed Eurybates (bersagli della missione Lucy), Psyche (bersaglio della missione omonima), Phaethon (corpo progenitore delle Geminidi), Apophis (passaggio ravvicinato del 2029).
- Centauri: diametro ≥ 150 km (Chiron, Chariklo); selezione non esaustiva per questa classe: altri centauri sopra la soglia secondo SBDB (elenco verificato il 19/10/2026: (95626) 2002 GZ32, Pholus, Bienor) si aggiungono via catalogo.
- TNO: i pianeti nani transnettuniani; TNO con diametro stimato di circa 600 km o più, misurato da occultazione stellare o radiometria e con fonte primaria nel catalogo (selezione non esaustiva per questa classe: altri oggetti di 600-800 km, come Varda, Aya, Achlys, Chiminigagua, si aggiungono via catalogo); Arrokoth (sorvolo di New Horizons).
- Comete: (a) visitate o osservate da vicino da sonde (1P, 19P, 21P, 26P, 9P, 81P, 103P, 67P, C/2013 A1); (b) periodiche storiche, progenitrici di sciami o bersagli di studi dedicati (2P, 12P, 55P, 109P, 29P, 46P); (c) grandi comete con magnitudine di picco ≤ 1, selezione non esaustiva di otto casi dal 1680 a oggi; (d) comete interstellari.
- Lune: satelliti dei pianeti con diametro ≥ 300 km (inclusi Proteo e Nereide); satelliti di Marte; Amaltea (maggiore satellite interno di Giove); Iperione; satelliti irregolari maggiori (Imalia, Febe); satelliti di Plutone esclusi i due minori, Cerbero e Stige (quindi Caronte, Notte, Idra); Disnomia (unico satellite noto di Eris). I satelliti degli altri TNO non sono inclusi in questa versione.

### 4.2 Categorie

Ogni corpo ha una categoria primaria, che determina forma e colore del marcatore, e categorie secondarie. Un corpo è visibile se almeno una delle sue categorie è attiva. Precedenza della primaria: pianeta, pianeta nano, luna, interstellare, cometa, centauro, TNO, asteroide. Esempi: Plutone (pianeta nano; TNO), Cerere (pianeta nano; asteroide), 3I/ATLAS (interstellare; cometa), Chiron (centauro; cometa). Eccezione dichiarata alla precedenza: Chiron, centauro con attività cometaria (95P/Chiron), ha primaria centauro; la pipeline verifica la precedenza di ogni corpo con questa sola eccezione (`ECCEZIONI_PRIMARIA` in `catalog.py`).

### 4.3 Nomi

Il nome ufficiale IAU/WGSBN è sempre visibile nella scheda. La forma italiana si usa solo dove è consolidata: pianeti, satelliti, Cerere, Pallade, Giunone, Vesta, Igea, Plutone, Caronte, Orco, Issione. Gli altri corpi usano il nome ufficiale, tranne quattro comete periodiche che portano nel nome (§ 4.4) il numerale d'uso: 9P/Tempel 1, 29P/Schwassmann-Wachmann 1, 81P/Wild 2, 103P/Hartley 2. Il loro nome ufficiale è quello dell'MPC, senza numerale (9P/Tempel, 29P/Schwassmann-Wachmann, 81P/Wild, 103P/Hartley; IAU Comet-Naming Guidelines, art. 5.5) e la scheda lo mostra nella riga "Nome ufficiale"; la forma con il numerale resta nome e alias. Gli omonimi si distinguono con il numero (52 Europa). Gli alias di ricerca includono forma italiana, nome ufficiale, numero, designazione provvisoria e sigla. Nomi ufficiali (con i diacritici: Máni, Šteins) e designazioni provvisorie primarie dei pianetini numerati, e nomi ufficiali delle comete periodiche numerate ("NP/nome"), coincidono con quelli del Minor Planet Center (Identifier API), controllati nella pipeline; Chiron conserva la designazione cometaria 95P/Chiron, con 1977 UB tra gli alias.

### 4.4 Elenco (112 corpi)

Lo slug è l'identificatore stabile usato in hash, catalogo e test.

| Gruppo | Corpi (slug) |
|--------|--------------|
| Sole (1) | Sole (`sole`) |
| Pianeti (8) | Mercurio (`mercurio`), Venere (`venere`), Terra (`terra`), Marte (`marte`), Giove (`giove`), Saturno (`saturno`), Urano (`urano`), Nettuno (`nettuno`) |
| Pianeti nani (5) | Cerere 1 (`cerere`), Plutone 134340 (`plutone`), Eris 136199 (`eris`), Haumea 136108 (`haumea`), Makemake 136472 (`makemake`) |
| TNO (9) | Gonggong 225088 (`gonggong`), Quaoar 50000 (`quaoar`), Sedna 90377 (`sedna`), Orco 90482 (`orco`), Salacia 120347 (`salacia`), Varuna 20000 (`varuna`), Issione 28978 (`issione`), Máni 307261 (`mani`), Arrokoth 486958 (`arrokoth`) |
| Centauri (2) | Chiron 2060 (`chiron`), Chariklo 10199 (`chariklo`) |
| Asteroidi (31) | Pallade 2 (`pallade`), Giunone 3 (`giunone`), Vesta 4 (`vesta`), Igea 10 (`igea`), Psyche 16 (`psyche`), Lutetia 21 (`lutetia`), Euphrosyne 31 (`euphrosyne`), 52 Europa (`52-europa`), Sylvia 87 (`sylvia`), Ida 243 (`ida`), Mathilde 253 (`mathilde`), Eros 433 (`eros`), Patientia 451 (`patientia`), Davida 511 (`davida`), Patroclus 617 (`patroclus`), Hektor 624 (`hektor`), Interamnia 704 (`interamnia`), Gaspra 951 (`gaspra`), Šteins 2867 (`steins`), Phaethon 3200 (`phaethon`), Eurybates 3548 (`eurybates`), Toutatis 4179 (`toutatis`), Annefrank 5535 (`annefrank`), Braille 9969 (`braille`), Itokawa 25143 (`itokawa`), Donaldjohanson 52246 (`donaldjohanson`), Didymos 65803 (`didymos`), Apophis 99942 (`apophis`), Bennu 101955 (`bennu`), Dinkinesh 152830 (`dinkinesh`), Ryugu 162173 (`ryugu`) |
| Comete (23) | 1P/Halley (`1p-halley`), 2P/Encke (`2p-encke`), 9P/Tempel 1 (`9p-tempel-1`), 12P/Pons-Brooks (`12p-pons-brooks`), 19P/Borrelly (`19p-borrelly`), 21P/Giacobini-Zinner (`21p-giacobini-zinner`), 26P/Grigg-Skjellerup (`26p-grigg-skjellerup`), 29P/Schwassmann-Wachmann 1 (`29p-schwassmann-wachmann-1`), 46P/Wirtanen (`46p-wirtanen`), 55P/Tempel-Tuttle (`55p-tempel-tuttle`), 67P/Churyumov-Gerasimenko (`67p-churyumov-gerasimenko`), 81P/Wild 2 (`81p-wild-2`), 103P/Hartley 2 (`103p-hartley-2`), 109P/Swift-Tuttle (`109p-swift-tuttle`), C/1680 V1 (`c1680-v1`), C/1965 S1-A Ikeya-Seki (`c1965-s1-ikeya-seki`), C/1975 V1-A West (`c1975-v1-west`), C/1995 O1 Hale-Bopp (`c1995-o1-hale-bopp`), C/1996 B2 Hyakutake (`c1996-b2-hyakutake`), C/2006 P1 McNaught (`c2006-p1-mcnaught`), C/2013 A1 Siding Spring (`c2013-a1-siding-spring`), C/2020 F3 NEOWISE (`c2020-f3-neowise`), C/2023 A3 Tsuchinshan-ATLAS (`c2023-a3-tsuchinshan-atlas`) |
| Interstellari (3) | 1I/ʻOumuamua (`1i-oumuamua`), 2I/Borisov = C/2019 Q4 (`2i-borisov`), 3I/ATLAS = C/2025 N1 (`3i-atlas`) |
| Lune (30) | Luna (`luna`); Fobos (`fobos`), Deimos (`deimos`); Io (`io`), Europa (`europa`), Ganimede (`ganimede`), Callisto (`callisto`), Amaltea (`amaltea`), Imalia (`imalia`); Mimas (`mimas`), Encelado (`encelado`), Teti (`teti`), Dione (`dione`), Rea (`rea`), Titano (`titano`), Iperione (`iperione`), Giapeto (`giapeto`), Febe (`febe`); Miranda (`miranda`), Ariel (`ariel`), Umbriel (`umbriel`), Titania (`titania`), Oberon (`oberon`); Tritone (`tritone`), Proteo (`proteo`), Nereide (`nereide`); Caronte (`caronte`), Notte (`notte`), Idra (`idra`); Disnomia (`disnomia`) |

## 5. Architettura

### 5.1 Componenti

```
pipeline dati (Python, offline)                 sito statico (TypeScript + Three.js)
  DE441 (SPK NAIF) --------+                      src/time/    calendario, ΔT, scale, precessione
  SPK satellitari NAIF ----+                      src/ephem/   effemeridi runtime, affidabilità
  Horizons API (SPK) ------+--> public/data/v1/ -->src/data/   caricamento, cache, manifest
  SBDB API, sb441-n16 -----+    (binari + JSON)   src/render/  scena a scala reale
  ASSIST (integrazione) ---+                      src/ui/      interfaccia verde, italiano
  BSC5, Hipparcos 2007 ----+                      src/app/     stato, URL, preferenze, orologio
  S15.2020, IERS EOP ------+
```

### 5.2 Tecnologie e versioni

Versioni esatte, già bloccate in `package-lock.json` e compatibili tra loro (verificato con `npm ls`):

| Pacchetto | Versione | Nota |
|-----------|----------|------|
| three | 0.180.0 | WebGL2 obbligatorio |
| @types/three | 0.180.0 | |
| vite | 7.3.7 | bundler Rollup 4: si usa `build.rollupOptions` |
| vitest | 4.1.11 | |
| typescript | 5.9.3 | compatibile con typescript-eslint 8.71.2 (richiede < 6.1) |
| eslint | 10.12.0 | la linea 9 è fuori supporto dal 6/8/2026 (eslint.org/version-support) |
| @eslint/js | 10.0.1 | |
| typescript-eslint | 8.71.2 | |
| @playwright/test | 1.56.1 | Chromium rev. 1194, installato con `npx playwright install chromium` |
| @axe-core/playwright | 4.11.0 | |
| @types/node | 22.18.0 | Node 22 |

- `.npmrc` con `legacy-peer-deps=true`: npm 10.9.4 termina con l'errore "Cannot read properties of null (reading 'edgesOut')" nella risoluzione delle dipendenze peer facoltative di vitest 4.1.11; i conflitti restano controllati con `npm ls` (criterio A1).
- Nessun framework UI: DOM nativo con componenti leggeri.
- Pipeline: Python 3.13 in `scripts/pipeline/`, con due ambienti virtuali. Ambiente principale: numpy 2.5.3, scipy 1.18.1, jplephem 2.24, pyerfa 2.0.1.5, spiceypy 8.3.0, jsonschema 4.26.0, pillow 13.0.0, pytest 9.1.1, ruff 0.17.1. Ambiente di integrazione: assist 1.2.3 con rebound 4.6.0 (assist 1.2.3 richiede rebound ≥ 4.4.11 e < 5). REBOUNDx non è più usato.
- Nessuna procedura di pubblicazione automatica su servizi esterni: la build produce `dist/` (sito) e `dist-artifact/` (pagina singola); la modalità `artifact` scrive in `dist-artifact-build/`, cartella intermedia distinta da `dist/`. Le cartelle delle build di prova (`dist-test/` e ogni `dist-test*/`, ad esempio con `--outDir`) sono escluse da git (`.gitignore`) e da ESLint (`eslint.config.js`).

### 5.3 Struttura del repository

```
index.html, package.json, tsconfig.json, vite.config.ts, eslint.config.js, playwright.config.ts
ui-lab.html, render-lab.html   pagine di prova dell'interfaccia e del rendering (fuori dalla build)
public/data/v1/        dati generati dalla pipeline (§ 8), versionati
src/main.ts            avvio (§ 5.6)
src/app/               avvio.ts, caricamento.ts, store.ts, urlState.ts, preferenze.ts, ripristino.ts, fornitori.ts,
                       clock.ts (unico uso di Date), types.ts
src/time/              calendar.ts, steps.ts, deltaT.ts, timescale.ts, precession.ts (Vondrák 2011),
                       earthRotation.ts, nutation.ts (IAU 2000B, Δψ), seasons.ts, types.ts
src/ephem/             constants.ts, equinoctial.ts, kepler.ts, interp.ts, planets.ts, moon.ts, satellites.ts,
                       smallBodies.ts, sunBarycenter.ts, orientation.ts, reliability.ts, service.ts, types.ts
src/data/              manifest.ts, dataStore.ts, assetUrl.ts, catalog.ts, catalogTypes.ts, catalogoLingua.ts,
                       catalogo.en.json (nomi e testi inglesi del catalogo), types.ts; lettori
                       binHeader.ts, serie.ts, satsReader.ts, moonReader.ts, reliabilityReader.ts,
                       starsReader.ts, timeReader.ts; intervalli.ts (ricerca del segmento, comune ai lettori);
                       sha256.ts (SHA-256 senza crypto.subtle)
src/render/            renderer.ts, motore.ts, grafo.ts, api.ts, tipi.ts, costanti.ts, origin.ts, camera.ts,
                       controls.ts, projection.ts, corpi.ts, impostor.ts, glsl.ts, texture.ts, orientamento.ts,
                       rings.ts, orbits.ts, linee.ts, markers.ts, labels.ts, nomi.ts, testi.ts, picking.ts,
                       stars.ts, grid.ts
src/ui/                tokens.css, stile.css, layout, console temporale, scheda, catalogo, ricerca,
                       vista testuale, lingua.ts (scelta della lingua), testi.ts (testi della lingua scelta),
                       testi.it.ts, testi.en.ts, testiScena.ts, valoriValidazione.ts, format.ts
src/dev/, src/ui/dev/  servizi fittizi delle pagine di prova (fuori dalla build)
src/test-hooks.ts      window.__ssTest (solo build di test)
tests/                 Vitest; tests/fixtures/ generate dalla pipeline con seme registrato
e2e/                   Playwright
scripts/make-artifact.mjs   pacchetto a pagina singola (§ 5.7)
scripts/servi-artifact.mjs  server locale per la verifica della pagina singola (A24)
scripts/pipeline/      Python (§ 12.1), requirements*.txt, raw/ (risposte congelate), tests/
docs/                  PROGETTO.md, REVISIONE_PROGETTO.md, METODI.md, VALIDAZIONE.md, SPIKE.md, LICENZE.md,
                       DEBUG.md (fase F5)
docs/_parti/           note tecniche dei moduli
docs/schema/           schemi JSON di catalogo e manifest
```

### 5.4 Contratti tra moduli

Regole generali:

- `src/time` e `src/ephem` non importano `three` né il DOM (regola ESLint `no-restricted-imports`).
- `Date`, `Date.UTC` e `Intl.DateTimeFormat` sono vietati fuori da `src/app/clock.ts` (regola `no-restricted-syntax`).
- Unità interne: km, s per le velocità esterne (km/s), giorni per il tempo, radianti per gli angoli. 1 UA = 149 597 870,7 km solo in `src/ephem/constants.ts` (`UA_KM`), importato dagli altri moduli: le grandezze definite in UA (preset di vista, anelli di distanza R11, soglia di 50 UA del § 7.6.5) si convertono in km con `UA_KM`; da km a UA si converte solo per i testi, in `src/ui/format.ts`, `src/ui/scala.ts` (barra di scala, tacche del regolo) e `src/render/renderer.ts` (etichette degli anelli di distanza).
- Sistema: eclittica J2000 eliocentrica (I4) per tutte le posizioni scambiate tra moduli.
- Nessuna allocazione nei percorsi chiamati a ogni frame (`out` passati dal chiamante).

```ts
// src/time
export const JD_MIN_UT: number;          // = calendarToJd({anno:-9999, mese:1, giorno:1, ora:0, minuto:0, secondo:0, calendario:'giuliano'}) = -1931076.5
export const JD_MAX_UT_EXCL: number;     // = calendarToJd({anno:2121, mese:1, giorno:1, ora:0, minuto:0, secondo:0, calendario:'gregoriano'}) = 2495739.5
export type Calendario = 'giuliano' | 'gregoriano';
export interface DataCalendario {
  anno: number;            // astronomico (1 a.C. = 0)
  mese: number;            // 1..12
  giorno: number;          // 1..31
  ora: number; minuto: number; secondo: number;
  calendario: Calendario;  // implicito dalla data: giuliano se JD < 2299160.5
}
export function calendarToJd(d: DataCalendario): number;              // parte intera per difetto (Math.floor)
export function jdToCalendar(jd: number): DataCalendario;             // calendario automatico
export function jdToProlepticGregorian(jd: number, offsetMinuti?: number): DataCalendario;   // per la riga secondaria (§ 11.4)
export function validaData(d: Partial<DataCalendario>): EsitoValidazione;   // codici § 11.4.2
export function giornoSettimana(jd: number): 0|1|2|3|4|5|6;           // 0 = lunedì; ((floor(jd+0.5) % 7) + 7) % 7
export function giornoSettimanaLocale(jd: number, offsetMinuti: number): 0|1|2|3|4|5|6;   // della data mostrata (T4)
export interface TimeState {
  jdUT: number;            // JD UT1
  jdTT: number;            // JD TT (= TDB, I7)
  deltaT: number;          // s
  deltaTSigma: number;     // s, 1 sigma (§ 6.5)
  scalaIngresso: 'UT' | 'TT';
}
export function makeTimeState(jd: number, scala: 'UT' | 'TT'): TimeState;   // unico punto di conversione

// src/ephem
export type StatoEffemeride = 'ok' | 'caricamento' | 'fuori-copertura' | 'non-determinabile';
export interface EphemerisService {
  // Stato eliocentrico, eclittica J2000: out[0..2] km, out[3..5] km/s. Sincrono, senza allocazioni, mai estrapolato.
  stateAt(ssid: number, jdTT: number, out: Float64Array): StatoEffemeride;
  // Elementi per disegnare l'orbita (§ 10.2): conica relativa al primario, ancorata al corpo.
  orbitAt(ssid: number, jdTT: number, out: ElementiOrbita): StatoEffemeride;
  affidabilita(ssid: number, t: TimeState, out: Affidabilita): void;     // § 7.8
  prefetch(jdTT0: number, jdTT1: number, segnale?: AbortSignal): Promise<void>;
  pronto(jdTT: number): boolean;           // tutti i blocchi necessari sono caricati
}
export interface ElementiOrbita {
  primario: number;        // ssid del corpo attorno a cui si disegna (Sole, pianeta o pianeta nano)
  baricentrici: boolean;   // true per corpi lontani (§ 7.6.5)
  q: number; e: number; i: number; nodo: number; argPeri: number;   // km, rad, nel sistema eclittico J2000
  anomaliaVera: number;    // del corpo all'istante
  forma: 'determinata' | 'indicativa' | 'non-determinata';
}
export type Livello = 'precisa' | 'buona' | 'approssimata' | 'indicativa' | 'non-determinabile';
export interface Affidabilita {
  livello: Livello;
  epsModello: number;      // rad
  epsDeltaT: number;       // rad (0 se scalaIngresso = 'TT')
  epsTotale: number;       // rad
}

// src/data
export type StatoRisorsa = 'assente' | 'in-caricamento' | 'pronto' | 'errore';
export interface DataStore {
  stato(chiave: string): StatoRisorsa;            // chiave = percorso relativo in data/v1/
  carica(chiave: string, segnale?: AbortSignal): Promise<ArrayBuffer>;   // Promise condivisa tra richiedenti
  rilascia(chiave: string): void;                 // usato dalla cache LRU
  onCambio(cb: (chiave: string, stato: StatoRisorsa) => void): () => void;
}
export function assetUrl(percorso: string): string;   // new URL(percorso, document.baseURI).href

// src/app
export interface UrlState {                        // implementazione unica: hash
  leggiSlug(): string | null;                      // testo dell'hash decodificato, null se vuoto; è uno slug valido se in minuscolo rispetta ^[a-z0-9-]{1,40}$
  scriviSlug(slug: string | null): void;           // history.replaceState in try/catch
  onCambio(cb: (slug: string | null) => void): () => void;   // hashchange
}
export interface Preferenze { leggi<T>(k: string, def: T): T; scrivi(k: string, v: unknown): void }  // try/catch, mai la data

// src/test-hooks.ts (solo con import.meta.env.MODE === 'test')
interface SsTest {
  setTime(jdUT: number): Promise<void>;
  focus(slug: string): Promise<void>;
  getScreenPosition(slug: string): { x: number; y: number; visibile: boolean } | null;
  getState(slug: string): { r: number[]; v: number[]; stato: string; livello: string } | null;
  waitIdle(): Promise<void>;                       // dati caricati, transizioni concluse, frame disegnato con le dimensioni correnti della canvas
}
```

### 5.5 Ordine delle operazioni per frame

1. Tempo: `TimeState` calcolato una sola volta (riproduzione: § 6.6).
2. Stati: Sole e baricentri planetari; Luna; satelliti (planetocentrici); centri dei pianeti (§ 7.3.5); piccoli corpi. Tutto in Float64.
3. Origine: posizioni relative al corpo a fuoco in Float64 (`origin.ts`), assegnate a `Object3D.position`.
4. `controls.update()` e `camera.updateMatrixWorld()`.
5. Aggiornamento di impostori, marcatori (riscritti relativi alla camera) e orbite (ricostruite solo se cambia il tempo, con budget, § 10.2).
6. Proiezione unica su CPU (`projection.ts`) per etichette, selezione e occlusione.
7. `renderer.render` (prima la scena delle stelle, poi la scena principale).
8. Scrittura DOM delle etichette (solo `transform`).

Gli oggetti con attributi riscritti a ogni frame (marcatori, orbite) hanno `frustumCulled = false`. Gli assi della scena coincidono con l'eclittica J2000; `camera.up = (0, 0, 1)` si imposta prima di creare `OrbitControls`.

### 5.6 Caricamento dei dati

- Sequenza di avvio: verifica WebGL2 (§ 11.11); `manifest.json`; `catalog.json`; `time.json`; blocchi della data iniziale (pianeti, satelliti, piccoli corpi) e `moon.bin`; primo frame. Dopo il primo frame: `reliability.bin`, `stars.bin`, texture.
- Cache LRU di 3 blocchi per tipo di file a blocchi.
- Prefetch del blocco adiacente quando la data è entro 50 anni dal confine o la riproduzione vi si dirige.
- `AbortController` per le richieste non più necessarie.
- Trascinamento del regolo: si aggiorna solo la data; il caricamento parte dopo 150 ms di inattività o al rilascio.
- La riproduzione si sospende al confine finché il blocco non è pronto e riprende da sola; stato visibile "Caricamento dati [intervallo]". Se i dati attesi mancano per un errore di caricamento la riproduzione si ferma.
- Con `stateAt` = `caricamento` il corpo non è disegnato (mai posizioni vecchie con la data nuova).
- Errore: messaggio in pagina con pulsante "Riprova"; i corpi interessati restano nascosti. L'errore di un blocco vale finché il blocco serve alla data (corrente o adiacente): quando la data lo esclude il messaggio si rimuove e al ritorno parte un nuovo tentativo. `moon.bin`, unico per tutto l'intervallo, si carica a parte con un proprio messaggio, che resta a ogni data fino al caricamento riuscito.
- `stars.bin` e texture: un errore non dà messaggi (il cielo resta senza stelle, il corpo senza texture); nuovo tentativo quando la risorsa serve di nuovo (stelle attive, raggio apparente oltre 8 px), non prima di 2 s dall'errore, attesa raddoppiata a ogni errore fino a 60 s.
- Ogni file è verificato all'apertura: dimensione; per i binari magic, versione, tipo, blocco e dimensione dell'intestazione; SHA-256 del manifest. In caso di errore il file è scartato. Lo SHA-256 si calcola con `crypto.subtle` o, dove manca, con l'implementazione JavaScript di `src/data/sha256.ts` (FIPS 180-4): `crypto.subtle` esiste solo nei contesti sicuri (W3C Web Cryptography API, `[SecureContext]`), quindi non nelle pagine servite in HTTP da un host non locale, come `npx vite preview --host` aperto da un telefono in rete locale (I9).
- Cache HTTP: i nomi in `data/v1/` restano stabili tra le pubblicazioni (§ 5.7), quindi la cache del browser può conservare la versione precedente di un file. `manifest.json` si richiede con `cache: 'no-cache'` (rivalidato a ogni avvio); un file non conforme si scarica subito una seconda volta con `cache: 'reload'`, e solo se fallisce ancora si ha l'errore; dopo un errore il nuovo tentativo ("Riprova" o ritorno alla data) usa `cache: 'reload'`.
- Richiesta senza risposta: senza risposta o senza byte ricevuti per 30 s la richiesta si annulla ed equivale a un errore di rete (messaggio con "Riprova", § 11.11), anche per i dati di base e per i blocchi della data iniziale, dopo i quali il primo frame si abilita comunque. Il limite riguarda l'inattività, non la durata: un file di 6 MB su una connessione lenta ma continua non scade.

### 5.7 Build e pubblicazione

- `vite.config.ts`: `base: './'`; modalità `artifact` con `build.outDir = 'dist-artifact-build'` (la build del sito in `dist/` resta invariata), `build.rollupOptions.output = { inlineDynamicImports: true, entryFileNames: 'assets/app.js', assetFileNames }` e `build.cssCodeSplit = false`, dove `assetFileNames` assegna `'assets/app.css'` al foglio di stile unico e `'assets/[name][extname]'` agli altri file (con il solo modello `'assets/[name][extname]'` Vite chiamerebbe il foglio `assets/style.css`); in ogni modalità `esbuild.legalComments = 'eof'` (commento `@license` di three in coda al bundle) e file `assets/LICENZE.txt` con il testo integrale della licenza di three (§ 16.3).
- `build.chunkSizeWarningLimit = 1500` (kB) in ogni modalità: il bundle è un solo file JavaScript (nessun import dinamico; nella pagina singola `assets/app.js`), di 864 kB (`docs/VALIDAZIONE.md`, § 12.5), oltre la soglia predefinita di Vite di 500 kB, che darebbe l'avviso a ogni build; con 1500 kB l'avviso resta per una crescita del bundle oltre 1,5 MB.
- Nessun Worker e nessun import dinamico.
- `scripts/make-artifact.mjs`: legge `dist-artifact-build/index.html` ed emette `dist-artifact/index.html` senza doctype, `html` e `head`, con: `<title>`, link a Google Fonts, `<link rel="stylesheet" href="assets/app.css">`, contenuto del body, `<script type="module" src="assets/app.js">`. Copia `assets/` e `data/v1/` con nomi stabili. Fallisce se i limiti di RNF7 sono superati o se mancano gli avvisi di licenza di three (`@license` in `assets/app.js`, testo integrale in `assets/LICENZE.txt`).
- Tutte le richieste passano da `assetUrl()` con percorsi relativi.
- Verifica della pagina singola in locale (spike S6, § 14.2) con uno scheletro che emula quello della piattaforma; la pubblicazione effettiva avviene in F6 e le eventuali correzioni si ripubblicano sullo stesso indirizzo.
- Alla ripubblicazione si rimuovono esplicitamente i file non più presenti nel manifest.

## 6. Modello temporale

### 6.1 Calendario

- T1 Conversione calendario ↔ JD con l'algoritmo di Meeus (cap. 7) usando la parte intera per difetto (`Math.floor`) in tutte le divisioni, sia nella conversione diretta sia nell'inversa. Il troncamento verso zero è vietato: con JD negativi sbaglia di un giorno (verifica: -9999-03-01 giuliano = JD -1 931 017,5; con troncamento -1 931 016,5).
- T2 Calendario giuliano se JD < 2 299 160,5, gregoriano altrimenti. 4 ottobre 1582 (giuliano, giovedì, JD 2 299 159,5) e 15 ottobre 1582 (gregoriano, venerdì, JD 2 299 160,5) sono giorni consecutivi.
- T3 Bisestili: giuliano, anni astronomici divisibili per 4 (l'anno 0 è bisestile, -9999 no); gregoriano, regola standard (2100 non bisestile).
- T4 Giorno della settimana: `((floor(JD + 0,5) mod 7) + 7) mod 7`, 0 = lunedì. Nell'interfaccia vale per la data mostrata: JD dello stesso istante arrotondato al millisecondo, nell'ora con offset. I passi di ora e di minuto non sono esatti in doppia precisione e possono lasciare l'istante qualche µs prima della mezzanotte, già mostrata come 00:00 del giorno dopo.

### 6.2 Intervallo e limiti

- Intervallo in UT: [JD_MIN_UT, JD_MAX_UT_EXCL) (I2).
- Con offset orario fisso, i limiti si applicano in UT dopo la conversione.
- Con ingresso in TT, i limiti in TT sono TT_min = JD_MIN_UT + ΔT(JD_MIN_UT)/86 400 ≈ -1 931 071,43 e TT_max = JD_MAX_UT_EXCL + ΔT/86 400.
- Copertura dei dati in TDB: da T0 = -1 931 200,5 a T_END = 2 495 760,5 (§ 8.1), con margine per l'interpolazione.

### 6.3 Scale di tempo

TT = UT1 + ΔT; TDB = TT (I7). UTC non è usato prima del 1962; dopo, ΔT già incorpora i secondi intercalari.

### 6.4 ΔT

Argomento: y = 2000 + (JD_UT - 2 451 545,0)/365,25 (epoca giuliana); u = (y - 1825)/100.

| Intervallo | Formula | Fonte |
|------------|---------|-------|
| y < -720 | ΔT = 65,62 + 31,351922682·u² + δ; δ = S15(-720) - (65,62 + 31,351922682·u(-720)²) ≈ -0,49 s | Manuale di JPL Horizons (sezione "Universal Time"); δ garantisce la continuità |
| -720 ≤ y < 2019,0 | Spline cubica S15.2020: per l'intervallo i con nodi K_i, K_(i+1): t = (y - K_i)/(K_(i+1) - K_i); ΔT = a0 + a1·t + a2·t² + a3·t³ | Morrison, Stephenson, Hohenkerk, Zawilski 2021, tabella S15.2020 (HMNAO) |
| 2019,0 ≤ y < 2020,0 | (1 - w)·S15 + w·IERS, w = y - 2019 | raccordo C0 |
| 2020,0 ≤ y ≤ y_obs | Valori IERS mensili: ΔT = 32,184 s + (TAI - UTC) - (UT1 - UTC), interpolazione lineare | IERS EOP 20 C04 |
| y > y_obs | ΔT = ΔT_obs + 0,00325·(y - y_obs)² s | curvatura mareale a lungo termine di Stephenson, Morrison, Hohenkerk 2016 (32,5 s/cy²); ipotesi dichiarata |

- y_obs e ΔT_obs sono l'ultimo valore IERS alla data di congelamento dei dati: y_obs = 2026,711841 (2026-09-18), ΔT_obs = 69,192937 s; ΔT(2120) = 97,48 s. Horizons usa invece un valore costante nel futuro: la differenza (28,6 s nel 2120) è dichiarata in "Fonti e metodi".
- La serie IERS del file parte dal 2019-01-01, per il raccordo 2019-2020.
- Valori di controllo: ΔT(-720) = 20 371,85 s (S15); ΔT(-9999-01-01 00:00 UT) ≈ 438 384,2 s = 5,074 d. La parabola di Stephenson et al. 2016 (-320 + 32,5·u²) darebbe 454 050 s; la parabola del manuale di Horizons garantisce la continuità a -720 (scarto 0,49 s, pendenza -16,0 contro -16,1 s/anno).
- Confronto con Horizons (TDB - UT, 75 epoche): prima del 1950 il ΔT effettivo di Horizons supera sia la S15.2020 sia la parabola del suo manuale (+76,2 s a -720, +1 510 s a -9997,5; la differenza decresce fino a 0 nel 1950). Le fixture in UT non coincidono quindi con Horizons prima del 1950 e le prove delle effemeridi restano in TDB (§ 13).

### 6.5 Incertezza di ΔT

σ(y) in secondi, a 1 sigma, con gli stessi tratti di ΔT (§ 6.4):

| Intervallo | σ(y) |
|------------|------|
| y < 2019,0 (parabola e S15.2020) | max( σ_s(y), σ_S15(y), H_passato(y) ) |
| 2019,0 ≤ y < 2020,0 | (1 - w)·max( σ_s(y), σ_S15(y) ) + w·σ_IERS, w = y - 2019, come il raccordo di ΔT |
| y ≥ 2020,0 (valori IERS ed estrapolazione) | max( σ_IERS, H_futuro(y), D_futuro(y) ) |

- σ_s(y), incertezza dei dati storici: 0,8·u² fino al 1200 (Morrison e Stephenson 2004, stimata per -1000/+1200); dal 1200 interpolazione lineare nel logaritmo tra i nodi (1200; 31,25 s), (1300; 20 s), (1600; 20 s), (1700; 5 s), (1800; 1 s), (1900; 0,1 s), costante dopo il 1900. Circa 20 s dal 1300 al 1600 (Espenak e Meeus 2006); 5 s, 1 s e 0,1 s nel 1700, 1800 e 1900 (Stephenson e Houlden 1986, riportati da Espenak e Meeus 2006);
- σ_S15(y): scarto quadratico medio della S15.2020, usata fino al 2019 (§ 6.4), dalla serie giornaliera IERS EOP 20 C04. σ_S15,62 = 0,4545 s nel 1962-1971 (massimo 0,677 s; TAI - UTC dalle formule di `tai-utc.dat` dell'USNO), σ_S15,72 = 0,114 s nel 1972-2018 (massimo 0,272 s). σ_S15(y) = σ_S15,62 per y < 1971,0, σ_S15,72 per y ≥ 1972,0, lineare nel 1971. Prima del 1962 C04 non c'è: σ_S15,62 è un'ipotesi, coerente con lo scarto della S15.2020 dalla tabella storica USNO (`historic_deltat.data`), 0,457 s in media quadratica nel 1900-1961;
- σ_IERS = 0,0017 s: scarto quadratico medio dei valori IERS mensili interpolati dalla serie giornaliera, 2020-y_obs (massimo 0,0051 s). L'errore formale di UT1 - UTC della serie C04 (al più 4 ms dal 1962, 0,04 ms al 2026-09-18) è trascurabile rispetto a questi scarti;
- σ_S15,62, σ_S15,72, σ_IERS e LOD_rms sono calcolati da `time_model.py sorgenti` sulla serie giornaliera e registrati in `raw/time/sorgenti.json`;
- H(N) = 365,25·N·√((N·Q/3)·(1 + N/M))/1000 s, con Q = 0,058 ms²/anno, M = 2500 anni (modello di Huber 2000);
- H_passato(y) = H(-500 - y) per y < -500; H_futuro(y) = H(y - y_obs) per y > y_obs; altrove 0;
- D_futuro(y) = 365,25·(y - y_obs)·LOD_rms per y > y_obs, altrove 0: deriva di ΔT non seguita dall'estrapolazione, che parte con pendenza nulla. LOD_rms = 0,539 ms è la radice della media dei quadrati dell'eccesso della durata del giorno su 86 400 s nella serie C04, ultimi 365 giorni fino a y_obs (variazioni stagionali comprese); D_futuro prevale su H_futuro fino a circa 15 anni dopo y_obs. Prova retrospettiva sulla serie C04 in `docs/VALIDAZIONE.md` (§ 3).

σ è continua in tutto l'intervallo. Valori di controllo: σ(-9999) ≈ 103 005 s (28,6 h); σ(-5000) ≈ 25 653 s (7,1 h); σ(-3000) ≈ 8 978 s (2,5 h; Horizons indica circa 4 h); σ(-1000) ≈ 638 s; σ(1200) = 31,25 s; σ(1700) = 5 s; σ(1825) ≈ 0,56 s; σ(1964) = 0,45 s; σ(2000) = 0,114 s; σ(y_obs) = 0,0017 s; σ(19/10/2026) = 0,017 s; σ(2030) ≈ 0,65 s; σ(2120) ≈ 47 s. Effetto per ora di σ: con l'istante in UT la Luna si sposta di ±0,55° e la direzione del Sole vista dalla Terra di ±0,04° (0,9856°/d); con l'istante in TT l'ora UT1 = TT - ΔT è incerta di σ e la rotazione terrestre di ±15°. A -9999, per un istante TT dato, la longitudine della Terra rispetto al Sole è indeterminata (§ 7.7); per un istante UT dato è incerta di 1,2°.

### 6.6 Passi e riproduzione

- Passi di minuto, ora e giorno: somma al JD. Il passaggio del 1582 è continuo (4 ottobre + 1 giorno = 15 ottobre).
- Passi di mese, anno, secolo, millennio: aritmetica di calendario sugli anni astronomici; il giorno si riduce all'ultimo valido del mese (31 gennaio + 1 mese = 28 o 29 febbraio; 29 febbraio + 1 anno = 28 febbraio); una data che cade tra il 5 e il 14 ottobre 1582 diventa il 15 ottobre in avanti e il 4 ottobre all'indietro; 1 a.C. + 1 anno = 1 d.C.
- Ai limiti il passo si ferma e un messaggio in `role="status"` lo segnala (§ 11.4.3). Un risultato di calendario entro 1 ms da un limite (risoluzione della data mostrata) è il limite stesso: l'andata e il ritorno dal limite in TT, che non cade sulla griglia del millisecondo, tornano esattamente al limite. Il limite raggiunto è definito in un solo punto (`limiteRaggiunto` di `src/time/steps.ts`: l'istante coincide con il primo o con l'ultimo istante ammesso, senza tolleranza) e lo usano il passo, `aria-disabled` su Indietro e Avanti e l'avviso del limite, che resta solo finché l'istante è a quel limite.
- Riproduzione: jd = jd_inizio + v·(t_ora - t_inizio), con t da `performance.now()`; riancoraggio a ogni cambio di velocità, direzione o data. Nessun accumulo per incrementi.
- Velocità a gradini (secondi simulati per secondo reale): 1 s, 1 min, 1 h, 1 giorno, 1 settimana, 1 mese (30,436875 d), 1 anno (365,25 d), 10 anni, 100 anni, 1000 anni. Direzione con pulsante separato.
- La riproduzione si ferma ai limiti, attende i blocchi non pronti e si ferma se il loro caricamento fallisce (§ 5.6).

## 7. Effemeridi

### 7.1 Riferimento e costanti

- Sistema: I4. Unità: km, giorni TDB. 1 UA = 149 597 870,7 km (IAU 2012, Risoluzione B2).
- GM: costanti di DE441 (Park et al. 2021; commento tecnico di DE440/441) per Sole, baricentri planetari, Terra, Luna; costanti dei file SPK satellitari per i satelliti; SBDB o letteratura per i piccoli corpi (§ 9).
- μ degli elementi: pianeti μ = GM_Sole + GM_sistema del pianeta; piccoli corpi μ = GM_Sole; satelliti μ = GM_pianeta + GM_satellite. Lo stesso μ è usato da pipeline e runtime. Nella scheda Notte e Idra, circumbinari, hanno elementi rispetto al baricentro del sistema di Plutone, con μ = GM del sistema (Plutone, Caronte e lune del catalogo).

### 7.2 Elementi equinoziali

Elementi (Broucke e Cefola 1972) con fattore retrogrado I = +1 per i ≤ 90°, I = -1 per i > 90°:

- a; h = e·sin(ω + I·Ω); k = e·cos(ω + I·Ω); p = tan^I(i/2)·sin Ω; q = tan^I(i/2)·cos Ω; λ = M + ω + I·Ω.
- Keplero: F - k·sin F + h·cos F = λ (F longitudine eccentrica), risolto con Newton a tolleranza 1e-15 rad.
- β = 1/(1 + √(1 - h² - k²)); r = a·(1 - k·cos F - h·sin F); n = √(μ/a³).
- X1 = a·[(1 - β·h²)·cos F + h·k·β·sin F - k]; Y1 = a·[(1 - β·k²)·sin F + h·k·β·cos F - h].
- Ẋ1 = (n·a²/r)·[h·k·β·cos F - (1 - β·h²)·sin F]; Ẏ1 = (n·a²/r)·[(1 - β·k²)·cos F - h·k·β·sin F].
- s² = 1 + p² + q²; f = (1 - p² + q², 2pq, -2Ip)/s²; g = (2Ipq, (1 + p² - q²)·I, 2q)/s².
- r = X1·f + Y1·g; v = Ẋ1·f + Ẏ1·g.

Test di andata e ritorno stato ↔ elementi per i ∈ {0°, 90°, 162°, 179,9°} ed e ∈ {0; 0,5; 0,97}; per e ≥ 0,98 si usa la rappresentazione cartesiana (§ 7.6.3).

### 7.3 Pianeti, Plutone, baricentro Terra-Luna

#### 7.3.1 Sorgente

DE441 (Park et al. 2021), file `de441_part-1.bsp` (-13200/1969) e `de441_part-2.bsp` (1969/17191), letti con jplephem. Scelta del file per singolo campione: JD < 2 440 416,5 → part-1, altrimenti part-2 (sovrapposizione 2 440 400,5-2 440 432,5, differenze inferiori a 1e-6 km).

#### 7.3.2 Corpi tabulati

Mercurio (1), Venere (2), baricentro Terra-Luna EMB (3), baricentri di Marte (4), Giove (5), Saturno (6), Urano (7), Nettuno (8), Plutone (9), relativi al centro del Sole (10).

#### 7.3.3 Rappresentazione

- Elementi equinoziali osculanti eliocentrici campionati su una griglia a passo costante allineata a T0 (§ 8.1).
- Memorizzazione Float32 dei residui rispetto a riferimenti Float64 (§ 8.3): a = a0 + δa; λ = λ0 + n·(t - t_primo) + δλ, con λ non ridotto (continuo) nella pipeline; |δλ| < 1 rad garantito.
- Interpolazione di Lagrange a 8 punti su ciascun elemento: per t in [t_j, t_(j+1)) si usano i campioni j-3..j+4.
- Passi: Mercurio 16 d, Venere 32 d, EMB 16 d, Marte 64 d, Giove 256 d, Saturno 256 d, Urano 512 d, Nettuno 512 d, Plutone 512 d, in tutti i blocchi. Con Mercurio a 32 d l'errore arrivava a 2,036″ (blocco 11); con l'EMB a 32 d a 328 km nei blocchi 0-10.
- Errori massimi misurati in revisione (Lagrange 8 punti, Float32, 300 epoche casuali in tutto l'intervallo): Mercurio 1,48″ (461 km); Venere 0,79″; EMB 0,33″ (235 km) a 32 d e 0,039″ (28 km) a 16 d; Marte 1,57″ (1 577 km); Giove 1,14″ (4 185 km); Saturno 0,54″; Urano 1,46″ (20 012 km); Nettuno 0,81″ (17 593 km); Plutone 1,48″ (32 435 km).

#### 7.3.4 Tolleranze vincolanti

- Errore |Δr|/r ≤ 2″ per ogni corpo su tutto l'intervallo.
- EMB: |Δr| ≤ 100 km nei blocchi 11-12, ≤ 250 km altrove.
- Continuità ai confini di blocco: differenza inferiore a 1 km tra i due blocchi valutati nello stesso istante del confine.

#### 7.3.5 Centri dei pianeti

- Terra: r_Terra = r_EMB - r_Luna,geo/(1 + EMRAT), EMRAT da DE441 (§ 7.4).
- Altri pianeti: r_centro = r_bar - Σ(GM_i·ρ_i)/GM_sistema, con ρ_i posizioni planetocentriche dei satelliti del catalogo (§ 7.5) e GM_sistema dal DE441. Ordini di grandezza: Plutone-Caronte circa 2 130 km; Saturno-Titano circa 290 km; Giove circa 200 km.
- I segmenti SPK dei centri (499, 599, 699, 799, 899, 999) servono a validare la formula nella copertura dei satelliti (scarto atteso ≤ 5 km dove i satelliti sono "precisi").

### 7.4 Luna

- Serie di Meeus (cap. 47, tabelle 47.A e 47.B, troncamento di ELP 2000-82B) incorporate nel codice.
- Correzioni degli argomenti L′, D, M, M′, F: ΔX(t) da spline cubica di Hermite con nodi ogni 3 652,5 d a partire da T0 (valori e derivate nel file `moon.bin`, § 8.4). Il fattore E di Meeus è moltiplicato per κ(t) dalla stessa spline (adottato: nello spike S1 κ riduce il residuo massimo da 37,8″ a 20,4″).
- Catena: serie → (λ, β, Δ) nell'eclittica e nell'equinozio medi della data → vettore cartesiano → rotazione all'eclittica J2000 con M(t) = R_x(ε0)·LTECM(t)ᵀ, dove LTECM è la matrice ICRS → eclittica della data di Vondrák, Capitaine, Wallace 2011 (algoritmo ERFA `eraLtecm`), ε0 = 84 381,448″. Pipeline e runtime usano la stessa catena.
- Stima delle correzioni: minimi quadrati contro DE441 (Luna 301 rispetto a Terra 399) su finestre centrate nei nodi (±10 anni), con raccordo C1.
- Prestazioni misurate in revisione con correzioni offset più deriva su finestre di 10 anni: errore massimo/rms 12,2″/2,6″ (2000), 13,2″/2,9″ (-2000), 17,2″/4,4″ (-5000), 49,0″/14,8″ (-9999); distanza entro 34 km. Senza calibrazione: 350′ a -9999.
- Tolleranza vincolante: errore angolare geocentrico ≤ 60″ e distanza ≤ 50 km, su griglia di 0,5 d nell'intero intervallo, inclusi i nodi.
- Orientamento della Luna: leggi di Cassini con inclinazione dell'equatore sull'eclittica della data I = 1,543°, nodo ascendente dell'equatore coincidente con il nodo discendente dell'orbita media (argomento F corretto), meridiano principale verso la direzione media della Terra (L′ + 180°). Ne risulta la librazione ottica.

### 7.5 Satelliti naturali

#### 7.5.1 Sorgenti

Gli elementi medi JPL ("Planetary Satellite Mean Elements") non sono usati: JPL avverte che non sono destinati al calcolo di effemeridi e i confronti con Horizons mostrano errori fino a 166° (Febe) già all'epoca.

| Satelliti | Kernel moderno (finestra) | Kernel lungo (finestra) | Centro pianeta |
|-----------|---------------------------|--------------------------|----------------|
| Fobos, Deimos | mar099 (1600-2600) | nessuno | 499 da mar099 |
| Io, Europa, Ganimede, Callisto, Amaltea | jup365 (1600-2200) | nessuno | 599 da jup365 |
| Imalia | jup347 (1799-2200) | nessuno | 599 da jup365 |
| Mimas, Encelado, Teti, Dione, Rea, Titano, Iperione, Giapeto, Febe | sat441 (1749-2250) | sat441xl_part-1 e sat441xl_part-2 (502 a.C.-4500); omesso per Dione e Rea (S3) | 699 dagli stessi file |
| Miranda, Ariel, Umbriel, Titania, Oberon | ura184_part-3 (1600-2399) | ura111xl-701..705 (-12000/17000) | 799 da ura184_part-3 e ura111xl-799 |
| Tritone | nep098_part-1 (soluzione NEP098, 1800-2199); nep097 (1600-1800) | nep097xl-801 (-12000/17000), omesso (S3) | 899 dagli stessi file |
| Proteo | nep098_part-3 (1800-2199) | nessuno | 899 da nep098_part-3 |
| Nereide | nep105 (1600-2400) | nep101xl-802 (-13000/17000) | 899 da nep105 e nep097xl-899 |
| Caronte, Notte, Idra | plu060 (1800-2199) | nessuno | 999 da plu060 |
| Disnomia | orbita kepleriana di Holler, Grundy, Buie, Noll 2021 | nessuno | Eris |

Regola: in ogni epoca si usa il kernel più recente che la copre; altrove il kernel lungo; oltre ogni copertura, l'estrapolazione secolare (§ 7.5.4). I salti tra sorgenti sono assorbiti dal raccordo tra record (§ 7.5.3) e misurati. I kernel lunghi (circa 19 GB complessivi) si scaricano, elaborano ed eliminano uno alla volta; lo spike S3 verifica se l'estrapolazione secolare dal kernel moderno è equivalente, nel qual caso il kernel lungo si omette e la scelta si documenta.

#### 7.5.2 Modello: ellisse precessante a record

Posizione planetocentrica (rispetto al centro del pianeta) in un sistema di riferimento F per satellite, definito dal polo medio dell'orbita (piano di Laplace) adattato dalla pipeline, fisso salvo nei record secolari dei satelliti regolari (§ 7.5.4); origine del nodo: nodo ascendente del piano F sull'equatore ICRF. Matrice R_F (F → eclittica J2000) nel catalogo. Per ogni record, con τ = t - t_ref:

- a costante; e costante; ϖ = ϖ0 + ϖ̇·τ; tan(i/2) costante; Ω = Ω0 + Ω̇·τ;
- λ = λ0 + n·τ + c2·τ² + c3·τ³ + Σ_k [S_k·sin(ν_k·τ) + C_k·cos(ν_k·τ)], k = 1..K (K ≤ 6; frequenze ν_k fisse per satellite, nel catalogo, scelte dalla pipeline con analisi in frequenza dei residui);
- elementi equinoziali come al § 7.2 con fattore I del record (Tritone I = -1); posizione in F, poi r = R_F·r_F;
- velocità con la formula del § 7.2 usando n_eff = dλ/dt.

Durata dei record: 10 anni per periodi < 3 d, 20 anni da 3 a 20 d, 50 anni oltre (valori iniziali); adottate in S3 durate da 2 a 50 anni per satellite, con suddivisione fino a 0,25 anni dei record oltre 0,8 volte le tolleranze (`docs/SPIKE.md`). Adattamento ai minimi quadrati su vettori SPK campionati ad almeno 20 punti per periodo orbitale, su [t_inizio - L/4, t_fine + L/4].

#### 7.5.3 Raccordo tra record

Zona di raccordo di semiampiezza L_b = 0,1·L attorno a ogni confine t_b: r = (1 - w)·r_prec + w·r_succ, w = 3x² - 2x³, x = (t - t_b + L_b)/(2·L_b). Ogni file di blocco contiene tutti i record il cui intervallo esteso interseca il blocco.

#### 7.5.4 Estrapolazione secolare

Fuori da ogni copertura: un record secolare per lato (passato, futuro), con λ quadratico (c3 = 0, K = 0) e rotazioni lineari di ϖ e Ω adattati sull'intera copertura disponibile. Disnomia: un solo record secolare kepleriano (ϖ̇ = Ω̇ = c2 = 0).

Il piano di Laplace dei satelliti regolari segue l'equatore del primario, che precessa (Tremaine, Touma e Namouni 2009): per questi satelliti (`pianoSegueEquatore` nel catalogo: tutti tranne Imalia, Febe, Nereide, Giapeto, Tritone, Proteo e Disnomia) nei record secolari F ruota con il polo WGCCRE del primario (§ 7.7): F(t) = Q(t)·R_F, con Q(t) rotazione minima che porta il polo all'epoca di giunzione con i record da SPK sul polo all'istante t. Q = I alla giunzione; la velocità trascura dQ/dt. L'angolo tra il polo di F e il polo del primario resta quello alla giunzione (Fobos 0,33°, Deimos 0,94°, satelliti di Saturno ≤ 0,64°); con F fisso arrivava nel 10000 a.C. a 10,6° (Fobos), 10,5° (Deimos) e 0,67° (satelliti interni di Saturno). Tritone e Proteo hanno F fisso: il polo di Nettuno ha solo il termine periodico dovuto a Tritone (Jacobson 2009).

#### 7.5.5 Rotazione dei satelliti

Rotazione sincrona per Luna (§ 7.4), Fobos, Deimos, galileiane, Amaltea, satelliti di Saturno escluso Iperione e Febe, satelliti di Urano, Tritone, Proteo, Caronte: asse x del corpo verso il pianeta lungo la direzione media (λ del modello), polo lungo il polo dell'orbita media. Iperione ha rotazione caotica (Wisdom, Peale, Mignard 1984; Thomas et al. 2007): orientamento fisso dichiarato "indicativo". Satelliti irregolari e Notte, Idra, Disnomia: ellissoidi senza texture e senza rotazione rappresentata.

#### 7.5.6 Errore dei satelliti

ε_modello(t) = ε_adattamento ⊕ ε_sorgente ⊕ ε_estrapolazione(τ), dove:

- ε_adattamento: massimo residuo angolare visto dal pianeta nel record;
- ε_sorgente: differenza tra kernel moderno e kernel lungo nella sovrapposizione, dove esistono entrambi;
- ε_estrapolazione(τ) = |τ|·σ_n + ½·τ²·σ_ṅ con τ = distanza dall'arco osservativo della soluzione (catalogo; 1900-2020 se non noto; Fobos e Deimos 1877-2019, arco astrometrico di MAR099), τ in anni, σ_n (rad/anno) da validazione incrociata sulle due metà della copertura, σ_ṅ = 1·10⁻⁹·n anno⁻¹ (rad/anno², I12; Fobos 1,16·10⁻⁴ °/anno²).

Tolleranze di adattamento vincolanti nella finestra dei kernel: ≤ 0,5° per i satelliti regolari, ≤ 3° per Iperione, ≤ 1° per Imalia, Febe, Nereide; errore radiale ≤ 1% di a.

ε_modello è angolare e determina il livello (§ 7.8.2). L'errore radiale non vi entra: δr = errore radiale massimo dei record dell'intervallo di fonte che contiene t, contro la fonte stessa (per l'intervallo secolare il residuo radiale dell'adattamento secolare; Disnomia nessuno, errore dalle incertezze pubblicate), registrato nel catalogo come `erroreRadialeKm` di ogni fonte. L'errore della posizione usato per le cifre delle distanze (§ 11.13) è errore del primario ⊕ ε_tot·d ⊕ δr. Per i satelliti irregolari δr supera ε·d: Febe 95 311 km (0,74 % di a) nel kernel moderno, contro ε·d = 12 939 km al 4/5/2029, quando lo scarto da JPL Horizons è 83 671 km.

### 7.6 Piccoli corpi

#### 7.6.1 Sorgenti per corpo

1. Asteroidi presenti in sb441-n16 (Cerere, Pallade, Giunone, Vesta, Igea, Psyche, Euphrosyne, 52 Europa, Sylvia, Davida, Interamnia; verificato dalla catena dei sommari DAF): sb441-n16 da -7999 (JD -1 200 525,5) al 1600; nella finestra 1600-2121 SPK Horizons della soluzione corrente (con sb441-n16 lo scarto da Horizons arrivava a 14 357 km, oltre la soglia A7); prima di -7999, integrazione ASSIST a ritroso dallo stato sb441-n16 a JD -1 200 000,5.
2. Comete periodiche con record per apparizione in Horizons (DASTCOM; ad esempio 1P ha 30 record dal -239 al 1968): sequenza dei record, ciascuno nel proprio intervallo, con cambio all'afelio tra due perieli; per ciascun record SPK Horizons (tipo 21) letto con spiceypy; prima del record più antico, ASSIST dallo stato di quel record con i suoi parametri non gravitazionali.
3. Tutti gli altri: SPK Horizons della soluzione corrente nella sua finestra (circa 1600-2500, troncata al 2121); prima, ASSIST a ritroso. ASSIST parte da 1650-01-01 (interno alla finestra) e la sovrapposizione 1600-1650 con Horizons è verificata; giunzione al 1600-01-01.

ASSIST (Holman et al. 2023) usa DE441 in formato binario `linux_m13000p17000.441` (copertura completa), sb441-n16 per i 16 asteroidi perturbatori, relatività, J2 di Sole e Terra e il modello non gravitazionale di Marsden (A1, A2, A3, g(r)) con i parametri SBDB della soluzione. Il ritardo DT non è implementato in ASSIST 1.2.3 ed è ignorato (2I, 3I, 46P, 67P, 81P, 103P; effetto solo prima del 1600). Prima di -7999 la forza degli asteroidi è disattivata, come dichiarato in "Fonti e metodi".

#### 7.6.2 Cloni e orizzonte

- Cloni dalla covarianza SBDB (`cov=mat`), inclusi i parametri NG presenti, campionati attorno agli elementi della covarianza (`covariance.elements`) e integrati dalla sua epoca (`covariance.epoch`): la matrice vale solo per gli elementi della propria epoca. Per gli asteroidi e i TNO (45 corpi su 70 con covarianza) l'epoca della covarianza precede quella dell'orbita SBDB (9/6/2026) e i due insiemi di elementi differiscono, con incontri ravvicinati tra le due epoche (Itokawa: covarianza al 1/1/2004, Terra a 0,0129 UA il 26/6/2004); la pipeline rifiuta una covarianza usata con un nominale di un'altra epoca. Seme registrato: 64 cloni per corpi caotici (classi SBDB APO, ATE, AMO, IEO, JFc, HTC, CEN e comete con perielio < 1,5 UA), 16 per gli altri. Integrazione in un'unica simulazione per corpo come particelle di prova.
- Varianti di modello: con e senza NG; con e senza asteroidi perturbatori; per le comete a record, salto tra record consecutivi.
- Metrica (errore di posizione visto dal Sole): per ogni istante, 95° percentile tra i cloni del massimo tra (a) angolo eliocentrico tra clone e nominale e (b) |Δr|/r; più la differenza tra varianti di modello. L'anomalia media non entra: dove è poco determinata la posizione può esserlo bene (orbite quasi circolari, orbite eccentriche vicino all'afelio). Valore cumulato in modo monotono allontanandosi dall'epoca della soluzione (una volta peggiorato, il livello non migliora; per le comete a record, allontanandosi dall'apparizione di ciascun record).
- Comete a record: nell'intervallo di un record intermedio ε vale all'apparizione (epoca del record) il minore dei salti con i due record adiacenti e cresce linearmente nel tempo fino al salto misurato a ciascuna giunzione; nell'intervallo del record più antico vale il salto con il record successivo; prima, cloni del record più antico con deviazioni empiriche. Alle giunzioni tra sorgenti e tra record ε non è inferiore al salto misurato.
- Integrazione dei cloni interrotta quando il livello diventa "non determinabile".
- Forma dell'orbita "determinata" se tra i cloni Δa/a ≤ 5%, Δe ≤ 0,05, Δi ≤ 5°.

#### 7.6.3 Rappresentazione

Segmenti a passo costante per corpo e blocco, di due tipi:

- E (equinoziali): Float32 residui come al § 7.3.3, Lagrange a 8 punti; ammesso se e ≤ 0,98 e r ≤ 50 UA in tutto il segmento.
- C (cartesiani): posizione e velocità eliocentriche Float64, interpolazione cubica di Hermite tra campioni consecutivi; per e > 0,98, r > 50 UA, incontri ravvicinati con pianeti, orbite iperboliche.

Il passo di ogni segmento è una potenza di 2 tra 1/64 d e 1024 d, scelto dalla pipeline per dimezzamento finché la tolleranza è rispettata (eccezione dichiarata: C/1680 V1 al perielio, § 13, A7). Tolleranze (livello 4, adottato per il budget dopo S4): nella finestra 1600-2121 max(500 km, 1e-7·r); dal -2000 al 1600 max(1e-3·r, 0,05·ε(t)·r); prima del -2000 max(1e-2·r, 0,05·ε(t)·r), con ε(t) affidabilità stimata. La tolleranza è sommata a ε come angolo visto dal Sole: per istante la parte relativa; nella finestra, per ogni intervallo dei nodi di `reliability.bin`, max(500 km/r_min, 1e-7) con r_min distanza minima dal Sole dei segmenti nell'intervallo. Prima del 1600 l'affidabilità dei piccoli corpi è al più "buona". Dove il livello è "non determinabile" non si memorizzano dati.

#### 7.6.4 Rotazione e forma

Ellissoide triassiale con raggi da fonte primaria (§ 9). Polo e rotazione da WGCCRE dove disponibili in `pck00011.tpc` (Cerere, Pallade, Vesta, Lutetia, 52 Europa, Ida, Eros, Davida, Gaspra, Šteins, Itokawa, 9P/Tempel 1, 19P/Borrelly e 67P/Churyumov-Gerasimenko), "indicativi" fuori da 1600-2121; altrimenti assi fissi allineati all'eclittica J2000, dichiarati come convenzione in "Fonti e metodi" e senza asse nel livello "Assi di rotazione" (anche Arrokoth, sorvolato nel 2019 e assente dal rapporto WGCCRE).

#### 7.6.5 Corpi lontani e Sole baricentrico

- Stato baricentrico del Sole a runtime: r_⊙ = -Σ GM_i·r_i/(GM_⊙ + Σ GM_i), v analoga, con i nove baricentri del § 7.3.
- Per corpi con r > 50 UA la scheda mostra elementi baricentrici e l'orbita si disegna dagli elementi baricentrici, ancorata al corpo (§ 10.2); entro 50 UA elementi eliocentrici a qualsiasi eccentricità. Vicino al Sole lo scarto del Sole dal baricentro (circa 0,005 UA e 13 m/s) altera μ/r e v² più dell'energia di un'orbita quasi parabolica: al perielio la conica baricentrica non descrive il moto (C/1975 V1-A il 25/2/1976: baricentrica a = 10,3 UA, e = 0,981; eliocentrica a = -11 010 UA, e = 1,0000179, come JPL Horizons con centro 500@10).

### 7.7 Orientamento e rotazione

- Terra: polo medio della data (Vondrák et al. 2011, `ltpequ`). Angolo di rotazione ERA(UT1) = 2π·(0,7790572732640 + 1,00273781191135448·(JD_UT1 - 2 451 545,0)) (IERS Conventions 2010, eq. 5.15). Tempo siderale medio GST = ERA - EO(TT), con EO (equazione delle origini) tabulata in `time.json`: la pipeline integra numericamente il CIO lungo il polo di Vondrák (s = s(J2000) - ∫(X·Ẏ - Y·Ẋ)/(1 + Z) dt, con X, Y, Z dalla terza riga di `eraLtpb` e s(J2000) da `eraS06`) e calcola EO con l'algoritmo ERFA `eraEors` sulla matrice `eraLtpb`. Valore di controllo verificato: (ERA - EO) - GMST(IAU 2006, `eraGmst06`) = -0,067° a -10000, -0,012° a -5000, inferiore a 0,001° dopo l'anno 0. Il meridiano di Greenwich ha angolo GST dall'equinozio medio della data, verso est.
- Con l'istante in TT l'ora UT1 = TT - ΔT è incerta di σ(ΔT): la rotazione terrestre è indeterminata in longitudine quando 15°/h·σ(ΔT) supera 90°, cioè σ(ΔT) > 21 600 s, fino all'anno -4594 incluso con i valori del § 6.5; la scheda lo dichiara. Con l'istante in UT l'angolo ERA(UT1) è fissato e la direzione del Sole vista dalla Terra varia di 0,9856°/d·σ(ΔT) (1,2° a -9999), compresa in ε_ΔT della Terra (§ 7.8.1); nessuna nota sulla rotazione.
- Sole, pianeti, Plutone, Cerere, Vesta e corpi con modello WGCCRE: Archinal et al. 2018 con la correzione del 2019; poli e fasi "indicativi" fuori da 1600-2121 (i termini lineari in T non descrivono la precessione reale: per Marte +13° a T = -120). Giove, Saturno, Urano, Nettuno: fase W arbitraria a lungo termine (periodi di rotazione incerti), dichiarata.
- Ogni corpo ha nel catalogo il campo `convenzionePolo` ("nord-IAU" o "momento-angolare"). Anelli, satelliti e texture dello stesso corpo usano lo stesso vettore polo. Per Urano: polo nord IAU (257,311°; -15,175°), rotazione retrograda; il piano degli anelli coincide con l'equatore.
- Eclittica della data (opzione di visualizzazione e indicatore delle stagioni): Vondrák et al. 2011 (`ltpecl`). Inclinazione sull'eclittica J2000: 1,635° a -10000, 0,265° all'anno 0; obliquità 24,149° a -10000.

### 7.8 Affidabilità

#### 7.8.1 Calcolo

ε_tot = √(ε_modello² + ε_ΔT²), con:

- ε_modello: pianeti 2″ (costante, I11); Luna 60″ ⊕ ½·σ_ṅ·τ² (I11); satelliti § 7.5.6; piccoli corpi § 7.6.2 e § 7.6.3; Sole 0. Valori dipendenti dal tempo nel file `reliability.bin` (§ 8.7). Il valore della Luna in ogni intervallo dei nodi supera 1′: la Luna non è mai "precisa", anche con l'istante in TT.
- ε_ΔT = ω·σ(ΔT), con ω velocità angolare del corpo attorno al primario (|r × v|/r²); 0 se l'istante è in TT.

#### 7.8.2 Livelli

| Livello | Soglia ε_tot | Rappresentazione |
|---------|--------------|------------------|
| Precisa | ≤ 1′ | marcatore pieno |
| Buona | ≤ 1° | marcatore pieno |
| Approssimata | ≤ 10° | marcatore pieno, badge ambra |
| Indicativa | ≤ 90° | marcatore cavo, arco d'incertezza ±ε lungo l'orbita (continuo e più largo dell'orbita), orbita tratteggiata, badge corallo |
| Non determinabile | > 90° o non stimabile | nessun marcatore; orbita tratteggiata solo se la forma è "determinata"; il corpo resta negli elenchi con lo stato |

Il colore non è mai l'unico segnale: ogni livello ha testo, icona a barre e forma.

## 8. Formati dei dati

### 8.1 Organizzazione, blocchi e budget

- Cartella `public/data/v1/` (versione 1 del formato). Tutti i binari sono little endian; offset allineati a 8 byte; tempi in JD TDB.
- Blocchi: T0 = -1 931 200,5; B = 365 568 d (= 714·512 d, circa 1000,9 anni; tutti i passi dei pianeti lo dividono); 13 blocchi k = 0..12; nucleo del blocco k: [T0 + k·B, T0 + (k+1)·B), il blocco 12 troncato a T_END = 2 495 760,5. Il blocco 12 inizia a JD 2 455 615,5 (febbraio 2011).

| File | Numero | Dimensione stimata | Misurata (dati del 22/10/2026) | Caricamento |
|------|--------|--------------------|--------------------------------|-------------|
| manifest.json, catalog.json, time.json | 3 | ≤ 300 kB | 315 862 byte | avvio |
| planets/p00..p12.bin | 13 | 1,08 MB (blocchi 0-10), 1,35 MB (11-12); totale circa 14,6 MB | 1 630 504 byte (p00-p11), 181 480 byte (p12); totale 19 747 528 byte | su richiesta |
| moon.bin | 1 | circa 120 kB | 116 632 byte | avvio |
| sats/s00..s12.bin | 13 | totale ≤ 5 MB | totale 2 371 800 byte; massimo 1 018 136 byte (s11) | su richiesta |
| small/b00..b12.bin | 13 | totale ≤ 12 MB | totale 14 624 384 byte; massimo 5 331 816 byte (b11) | su richiesta |
| reliability.bin | 1 | ≤ 400 kB | 396 152 byte | dopo il primo frame |
| stars.bin | 1 | circa 364 kB | 363 904 byte | dopo il primo frame |
| tex/*.jpg | ≤ 30 | ≤ 600 kB ciascuna, totale ≤ 13 MB | 24 file, totale 8 680 970 byte, massimo 399 389 byte | quando il raggio apparente supera 8 px |

Budget vincolante (verificato da `pack.py`): ≤ 90 file, ≤ 48 MB in totale, ≤ 6 MB per file; prima visualizzazione ≤ 4 MB di dati. Misurati: 69 file, 46 617 232 byte; prima visualizzazione 2 233 406 byte. MB = 10^6 byte.

### 8.2 Intestazione comune dei binari (64 byte)

| Offset | Tipo | Campo |
|--------|------|-------|
| 0 | char[8] | magic: `SSSERIE1` (serie di elementi), `SSSATS01`, `SSMOON01`, `SSRELI02`, `SSSTAR01` |
| 8 | u32 | versione del formato = 1 |
| 12 | u32 | tipo: 1 pianeti, 2 satelliti, 3 piccoli corpi, 4 Luna, 5 affidabilità, 6 stelle |
| 16 | i32 | indice di blocco k (-1 se non applicabile) |
| 20 | u32 | numero di voci |
| 24 | f64 | inizio nucleo (TDB) |
| 32 | f64 | fine nucleo (TDB, esclusa) |
| 40 | u32 | offset della tabella delle voci |
| 44 | u32 | dimensione totale del file in byte |
| 48 | u8[16] | riservato, zero |

### 8.3 Serie di elementi (pianeti e piccoli corpi): `planets/pKK.bin`, `small/bKK.bin`

Voce per corpo (8 byte): u16 ssid; u16 numero di segmenti; u32 offset della tabella dei segmenti.

Segmento (80 byte):

| Offset | Tipo | Campo |
|--------|------|-------|
| 0 | u8 | tipo: 1 = E, 2 = C |
| 1 | i8 | fattore I (E), 0 per C |
| 2 | u16 | riservato |
| 4 | u32 | numero di campioni N (aloni inclusi) |
| 8 | f64 | passo h (d) |
| 16 | f64 | t_primo: istante del campione 0 |
| 24 | f64 | inizio nucleo del segmento |
| 32 | f64 | fine nucleo del segmento (esclusa) |
| 40 | f64 | μ (km³/s²) (E), 0 per C |
| 48 | f64 | a0 (km) (E) |
| 56 | f64 | λ0 (rad) (E) |
| 64 | f64 | n (rad/d) (E) |
| 72 | u32 | offset dei dati |
| 76 | u32 | riservato |

- Dati E: N × 6 Float32 [δa (km), h, k, p, q, δλ (rad)]; a = a0 + δa; λ = λ0 + n·(t_j - t_primo) + δλ. Aloni di 4 campioni per lato: ogni t nel nucleo ha lo stencil completo.
- Dati C: N × 6 Float64 [x, y, z (km), vx, vy, vz (km/d)]; aloni di 1 campione.
- I nuclei dei segmenti di un corpo coprono il nucleo del blocco senza buchi né sovrapposizioni (escluse le epoche "non determinabili", che restano scoperte e restituiscono `non-determinabile`). Ricerca del segmento per bisezione sull'inizio del nucleo.
- Nei pianeti ogni corpo ha un solo segmento E; la griglia è allineata a T0 (t_j = T0 + m·h).

### 8.4 Luna: `moon.bin`

Dopo l'intestazione: f64 t_nodo0 (= T0); f64 passo (= 3 652,5 d); u32 numero di nodi (1 214, l'ultimo oltre T_END); u32 colonne (= 6); dati Float64 [nodi × colonne × 2] = (valore, derivata in /d) per ΔL′, ΔD, ΔM, ΔM′, ΔF (rad) e κ (adimensionale). Interpolazione cubica di Hermite.

### 8.5 Satelliti: `sats/sKK.bin`

Voce per satellite (8 byte): u16 ssid; u16 numero di record; u32 offset del primo record. Record contigui, ordinati per inizio:

- intestazione del record (8 byte): u8 tipo (0 = da SPK, 1 = secolare); i8 I; u16 K; u32 riservato;
- Float64 [14 + 2K]: t_inizio, t_fine (esclusa), t_ref, a (km), e, ϖ0 (rad), ϖ̇ (rad/d), tan(i/2), Ω0 (rad), Ω̇ (rad/d), λ0 (rad), n (rad/d), c2 (rad/d²), c3 (rad/d³), poi S_1, C_1, ..., S_K, C_K (rad).

### 8.6 Piccoli corpi

Formato del § 8.3. Ogni corpo ha anche nel catalogo l'elenco delle fonti per intervallo (SPK Horizons e soluzione, record, sb441-n16, ASSIST con varianti) e la giunzione misurata.

### 8.7 Affidabilità: `reliability.bin`

Dopo l'intestazione: f64 t_nodo0 (= T0); f64 passo dei nodi grossi (= 7 305 d, 20 anni giuliani); u32 nodi (712); u32 numero di corpi; f64 t_fine (= JD 2 444 494,5, 12/9/1980, nodo 599); f64 passo fine (= 456,5625 d, 1,25 anni giuliani). Nodo k: t_nodo0 + passo·k fino a t_fine, poi t_fine + passo_fine·(k - 599); intervallo k: [nodo k, nodo k+1), l'ultimo (dal 2120,7) lungo un passo fine. Nella parte fine cadono le epoche delle soluzioni dei piccoli corpi, i perieli recenti delle comete, la fine degli archi osservativi dei satelliti e la data attuale, dove ε cambia in pochi anni: con intervalli di 20 anni la data attuale prendeva il valore del 2040. Per corpo: u16 ssid; u16 riservato; Float32[nodi] log10(ε_modello in rad) come massimo nell'intervallo, arrotondato per eccesso al Float32 (NaN = non stimabile); u8[nodi] bit 0 = forma dell'orbita determinata, bit 1 = dati presenti; riempimento a multiplo di 8 byte. Valutazione a gradini (valore dell'intervallo che contiene t).

### 8.8 Stelle: `stars.bin`

Record di 40 byte per stella: Float32 ux, uy, uz (direzione a J2000.0, eclittica J2000); Float32 distanza (pc, 0 se non disponibile); Float32 vx, vy, vz (pc/anno se moto 3D, rad/anno se lineare angolare); Float32 V; Float32 B-V; u16 HR; u8 flag (bit 0 moto 3D, bit 1 lineare angolare); u8 riservato. Direzione alla data: normalize(d·u + v·Δt) con moto 3D, normalize(u + v·Δt) altrimenti; Δt in anni giuliani da J2000.0 (TT).

### 8.9 `time.json`

```json
{
  "formato": 1,
  "deltaT": {
    "s15": { "nodi": [[-720, -100], "..."], "coeff": [[20371.848, -9999.586, 776.247, 409.16], "..."], "fonte": "Table-S15.2020", "copia": "Skyfield 1.55", "sha256": "..." },
    "pre720": { "a": 65.62, "b": 31.351922682, "delta": -0.490701 },
    "raccordo": [2019.0, 2020.0],
    "iers": { "anni": [2018.9993, "..."], "valori": ["..."], "fonte": "EOP 20 C04", "estrazione": "AAAA-MM-GG" },
    "yObs": 2026.711841, "deltaTObs": 69.192937, "cFuturo": 0.00325
  },
  "sigma": { "m": 0.8, "Q": 0.058, "M": 2500, "annoPassato": -500,
             "storico": { "anni": [1200, 1300, 1600, 1700, 1800, 1900], "valori": [31.25, 20, 20, 5, 1, 0.1] },
             "s15Iniziale": 0.45452608, "raccordoS15": [1971.0, 1972.0], "s15": 0.11394568, "iers": 0.00168261,
             "lodRms": 0.00053858 },
  "eo": { "t0": -1931200.5, "passo": 3652.5, "valori": ["rad"], "derivate": ["rad/d"] }
}
```

I coefficienti s15 sono nell'ordine a0, a1, a2, a3.

### 8.10 `catalog.json`

Radice: `{ "formato": 1, "generato": "ISO 8601", "corpi": [...], "categorie": [...] }`. Campi per corpo:

| Campo | Tipo | Note |
|-------|------|------|
| ssid | intero | indice 0..N-1, stabile nella versione del formato |
| slug | stringa | `^[a-z0-9-]{1,40}$`, unico |
| nome, nomeUfficiale, numero, designazione | stringhe o null | § 4.3 |
| alias | stringa[] | per la ricerca |
| categoria, categorieSecondarie | stringhe | § 4.2 |
| naif, spkid | interi o null | |
| primario | slug o null | slug del Sole, di un pianeta o di un pianeta nano (Plutone per Caronte, Notte e Idra; Eris per Disnomia); null per il Sole |
| effemeridi | oggetto | `modello` ∈ {sole, pianeta, luna, satellite, piccolo-corpo}; per i satelliti R_F (9 numeri), frequenze ν_k, arco osservativo, `pianoSegueEquatore` (§ 7.5.4); per i piccoli corpi fonti per intervallo |
| soluzione | oggetto | id della soluzione JPL (ad esempio JPL#75), data della soluzione, data di estrazione, modello NG, record DASTCOM |
| fisica | oggetto | `raggi_km` [a, b, c], `gm_km3s2`, `rotazione`, `albedo`: ciascuno `{ valore, incertezza, fonte, anno }` oppure `null` ("non noto") |
| orientamento | oggetto | modello (WGCCRE, Vondrák, Cassini, sincrono, fisso), coefficienti, `convenzionePolo` |
| texture | oggetto o null | file, lon0_u, verso (est/ovest), fonte, licenza, aree non osservate |
| epsModelloCostante | numero o null | rad, per i corpi senza serie in `reliability.bin` |

`generato` è l'istante ISO 8601 (UTC) dell'ultima rigenerazione che ha modificato il catalogo: la pipeline conserva quello pubblicato se il resto del catalogo coincide, così che con dati invariati il file sia identico byte per byte; `--generato` lo fissa.

Uno schema JSON (`docs/schema/catalog.schema.json`) valida il file in pipeline e nei test.

### 8.11 `manifest.json`

`{ "formato": 1, "versioneDati": "AAAA-MM-GG", "blocchi": { "T0": -1931200.5, "B": 365568, "K": 13, "T_END": 2495760.5 }, "file": [{ "percorso": "planets/p00.bin", "tipo": "pianeti", "blocco": 0, "byte": 0, "sha256": "..." }] }`.

`versioneDati` è la data dell'ultima rigenerazione che ha modificato l'elenco dei file, le dimensioni o gli SHA-256: con contenuto invariato la pipeline conserva il valore pubblicato e riscrive lo stesso manifest; con contenuto modificato scrive la data del giorno; `--versione` la fissa. L'invalidazione delle copie in cache non dipende da `versioneDati` ma dal manifest rivalidato a ogni avvio e dagli SHA-256 (§ 5.6).

### 8.12 Texture

JPEG 2048 × 1024 equirettangolari, al massimo 600 kB; longitudine 0 e verso registrati nel catalogo; su mobile si rispetta `renderer.capabilities.maxTextureSize`.

## 9. Dati fisici e fonti per tipo di dato

- GM: DE440/441 (Park et al. 2021) per Sole, Mercurio, Venere, Terra e Luna e, con le costanti MA, per gli asteroidi senza GM SBDB o con GM SBDB superato (Giunone, Igea, Euphrosyne, 52 Europa, Patientia, Davida, Interamnia; per Igea e Interamnia SBDB riporta Scholl et al. 1987 e Landgraf 1992); costanti dei kernel satellitari JPL per Marte, Giove, Saturno, Urano, Nettuno, Plutone e per i satelliti, con soluzione e anno della pagina JPL "Planetary Satellite Ephemerides" (Urano e i suoi satelliti: soluzione URA182, Jacobson e Park 2025, nell'area commenti di `ura184_part-3.bsp`; Marte, Fobos e Deimos: MAR099, 2025); incertezza del GM dei pianeti dalla tabella "Planet and Pluto GM Values" della pagina JPL "Planetary Satellite Physical Parameters", con la regola dei satelliti (Giove, Saturno, Nettuno e Plutone, stessa soluzione; Marte e Urano senza incertezza, perché MAR097 e URA111 danno valori diversi); SBDB dove presente e non superato per i piccoli corpi; masse dalle orbite dei satelliti: sistema per Eris (Holler et al. 2021), Gonggong (Kiss et al. 2019), Orco (Brown et al. 2010), Quaoar (Braga-Ribas et al. 2025), Salacia (Collyer et al. 2025), Didymos (Daly et al. 2023) e Patroclus (Grundy et al. 2018), primario per Haumea (modello a tre corpi, Ragozzine e Brown 2009), Sylvia (Fang et al. 2012, al posto della costante di DE441, 2,2 volte maggiore), Hektor (Marchis et al. 2014) ed Eurybates (Brown et al. 2021); 67P da Pätzold et al. (2016) e Itokawa dalla massa di Fujiwara et al. (2006), perché i valori SBDB non coincidono con le fonti che citano.
- Raggi equatoriali e polari, poli e rotazioni: Archinal et al. 2018 (con la correzione 2019). Periodo di rotazione dei corpi con modello WGCCRE, piccoli corpi compresi: 360°/Ẇ, uguale a quello della rotazione rappresentata. Raggio del Sole: IAU 2015 Risoluzione B3 (Prša et al. 2016). Inclinazione assiale ricavata da polo e piano orbitale, dichiarata come derivata: per Sole, pianeti e Plutone dall'orbita DE441, per i piccoli corpi con modello WGCCRE dall'orbita osculante SBDB, per gli altri piccoli corpi con polo noto dal polo SBDB (Bennu, Ryugu, Didymos) o di letteratura (Arrokoth, Spencer et al. 2020; Hektor, Marchis et al. 2014, polo eclittico J2000) e dall'orbita osculante SBDB, senza modello di rotazione, per Febe dall'orbita planetocentrica del modello; oltre 90° la scheda indica la rotazione retrograda (Venere, Urano, Plutone, Lutetia, 19P, Ida, Itokawa, Šteins, Bennu, Ryugu, Didymos, Arrokoth, Hektor, Febe). Per i corpi senza polo noto il verso non è indicato. Incertezza dell'inclinazione solo dove la fonte pubblica quella del polo: Arrokoth (A.R. e Dec. ± 1°, inclinazione ± 1,0°) e Hektor (λ e β ± 10°, inclinazione ± 9,8°), propagata al primo ordine nelle coordinate della fonte, σ² = (∂ε/∂c₁·σ)² + (∂ε/∂c₂·σ)², con l'orbita osculante SBDB presa senza incertezza; nessuna per i poli SBDB (il campo sigma ha formati diversi, ad esempio "0.0003/0.0001" e "20 degrees") e per il modello WGCCRE (Archinal et al. 2018 non dà incertezze).
- Albedo geometrica in banda V: pianeti da Mallama, Krobusek, Pavlov 2017 (tab. 7, senza incertezza); Plutone 0,52 ± 0,03, solo Plutone (Buratti et al. 2015, tab. 2). I valori della tabella JPL "Planetary Physical Parameters" (Explanatory Supplement 1992; Plutone 0,3) sono superati. Nessuna albedo per Sole, Luna e satelliti.
- Satelliti: raggio medio da JPL "Planetary Satellite Physical Parameters"; Disnomia, assente dalla pagina: raggio 307,5 km (+30/-25, riportato 30 km, l'incertezza maggiore) dal diametro di 615 +60/-50 km di Brown e Butler (2023, rilevazione ALMA a 6,5σ), che supera i 700 ± 115 km (3,5σ) degli stessi autori del 2018; GM dai kernel satellitari (sopra), perché la pagina usa soluzioni precedenti (URA111 per i satelliti di Urano: differenze fino al 4,5 %, Miranda); incertezza della pagina se cita la stessa soluzione o se il valore pubblicato coincide alle sue cifre con quello del kernel (Fobos, Deimos, Imalia, Tritone, Proteo); nessun campo albedo per i satelliti (la pagina non lo riporta). Periodo di rotazione: periodo orbitale medio del modello per i satelliti sincroni (§ 7.5.5); Febe 360°/Ẇ (Archinal et al. 2018), Imalia (Pilcher, Mottola e Denk 2012, periodo sinodico), Nereide (Kiss et al. 2016), Notte e Idra (Weaver et al. 2016), senza rotazione rappresentata; "non noto" per Iperione (rotazione caotica) e Disnomia.
- Piccoli corpi: SBDB (estensione o diametro, albedo, periodo di rotazione) dove presenti; semiassi in ordine decrescente (a ≥ b ≥ c); in assenza dell'estensione SBDB, raggi di `pck00011.tpc` (codice NAIF del modello WGCCRE, 2 000 000 + numero per i pianetini, SPK-ID per le comete: anche Mathilde e 81P, senza modello WGCCRE), salvo 19P (raggio medio di 4,22 km maggiore del primo semiasse di 3,5 km dichiarato nello stesso file: diametro SBDB). Parametri che SBDB marca come non verificati ("value unverified") esclusi. Corpi senza dati SBDB (verificato) o con dato SBDB superato: fonti primarie. Plutone, raggio 1188,3 km (Nimmo et al. 2017); Eris (Sicardy et al. 2011; rotazione sincrona con Disnomia, Szakáts et al. 2023, al posto del valore LCDB di SBDB, basato su una copertura parziale); Makemake (Ortiz et al. 2012); Haumea, triassiale (Ortiz et al. 2017; GM da Ragozzine e Brown 2009); Gonggong (Kiss et al. 2019: raggio, albedo e massa con incertezza; periodo di rotazione a doppio picco di Pál et al. 2016, 44,81 h, al posto del valore LCDB a picco singolo di SBDB, 22,4 h); Quaoar (occultazione, Pereira et al. 2023: raggio equivalente all'area proiettata e albedo; il valore radiometrico del sistema di Fornasier et al. 2013 è superato; periodo a doppio picco di Ortiz et al. 2003, 17,6788 h, al posto del valore LCDB a picco singolo, 8,84 h); Sedna (Pál et al. 2012); Orco, Salacia (Fornasier et al. 2013; rotazione di Salacia sincrona con Actea, Collyer et al. 2025, al posto del valore LCDB di SBDB, alias di un periodo di giorni); Varuna (Lellouch et al. 2013, valori della tabella 3 di Müller, Lellouch, Fornasier 2020, al posto del valore SBDB non aggiornato); Issione (occultazioni, Kilic et al. 2026: raggio equivalente e albedo; il valore radiometrico di Lellouch et al. 2013 è superato); Máni (occultazione, Rommel et al. 2023; il valore radiometrico di Vilenius et al. 2012 è superato); Chiron (Fornasier et al. 2013, raggio e albedo della stessa soluzione, al posto del diametro SBDB della lista di occultazioni del 1998 e dell'albedo del 2002); Chariklo, triassiale (occultazioni, Morgado et al. 2021, al posto della radiometria del 2002 di SBDB; albedo della soluzione termofisica di Fornasier et al. 2013, diametro 248 ± 18 km, coerente con l'ellissoide); Patroclus (occultazione e curve di luce, Buie et al. 2015: assi del solo primario al posto del diametro NEOWISE di SBDB, misurato sul sistema non risolto con Menoetius; albedo NEOWISE del sistema mantenuta); Didymos (DART, Daly et al. 2023, al posto del modello radar di SBDB); 103P (sorvolo EPOXI, raggio medio di Thomas et al. 2013, al posto di Lamy et al. 2004 di SBDB); Igea (modello di forma da immagini VLT/SPHERE, Vernazza et al. 2020: raggio equivalente in volume 217 ± 7 km, al posto del diametro IRAS di SBDB); Interamnia (modello di forma ADAM, Hanuš et al. 2020: diametro equivalente in volume 332 ± 6 km, raggio 166 ± 3 km, e periodo siderale 8,712336 h, al posto del diametro NEOWISE e del periodo LCDB di SBDB); Sylvia (modello di forma del primario, Berthier et al. 2014: diametro equivalente in volume 273 km, raggio 136,5 km; l'incertezza della fonte, ± 10 km a 3 σ, è convertita a 1 σ come le altre voci, raggio ± 1,67 km; al posto del diametro NEOWISE di SBDB); le albedo SBDB di Igea, Interamnia e Sylvia (IRAS e NEOWISE) sono legate ai diametri superati e non si usano, come per Chiron e Chariklo (albedo della soluzione coerente con il raggio adottato); i modelli di forma non danno l'albedo e le fonti adottate non pubblicano una soluzione radiometrica coerente con essi: "non noto"; Hektor (Marchis et al. 2014: raggio equivalente 125 ± 13 km, cioè diametro 250 ± 26 km, periodo 6,92050885 h e polo eclittico J2000 λ = 332°, β = -32° ± 10°, al posto del diametro di 225 km di SBDB, senza incertezza, e del periodo LCDB; dal polo l'inclinazione dell'asse, 117 ± 10°; l'albedo SBDB, TRIAD 0,025 senza incertezza, non si usa: con H = 7,32 corrisponde a un diametro di circa 289 km, non ai 250 ± 26 km adottati, e Marchis et al. 2014 non pubblicano un'albedo: "non noto"); Arrokoth (Spencer et al. 2020, anche il polo); 67P, albedo a 649 nm (Rosetta, Fornasier et al. 2015); C/1996 B2 (radar, Harmon et al. 1997: nucleo di 2-3 km, al posto del diametro SBDB di 4,2 km non verificato); ʻOumuamua (Meech et al. 2017); 2I (Jewitt et al. 2020); 3I (Jewitt et al. 2025); Disnomia (Brown e Butler 2018). Comete senza dimensioni misurate: valore "non noto", solo marcatore, nessun ellissoide in scala.
- Anelli: tabelle del PDS Ring-Moon Systems Node per Saturno e Urano (raggi dei bordi, profondità ottiche tipiche); profilo di opacità schematico dichiarato; per Urano anche Jacobson e Park 2025.
- Stelle: Bright Star Catalogue 5ª ed. riveduta, versione preliminare (Hoffleit e Warren 1991, VizieR V/50): 9096 stelle, magnitudine limite circa 6,5, posizioni FK5 J2000, V, B-V, velocità radiale. Astrometria (posizione, moto proprio, parallasse) da Hipparcos, nuova riduzione (van Leeuwen 2007, VizieR I/311), associata tramite il numero HD (Hipparcos I/239). Stelle senza parallasse positiva con errore relativo ≤ 20% o senza velocità radiale: moto lineare angolare, dichiarato. Colore: temperatura da B-V (Ballesteros 2012), spettro di corpo nero, funzioni colorimetriche CIE 1931, sRGB.
- Texture (pubblico dominio NASA/USGS salvo indicazione): Terra Blue Marble Next Generation; Luna NASA SVS CGI Moon Kit (4720); Giove PIA07782 (NASA/JPL/Space Science Institute); mosaici USGS: Mercurio MESSENGER, Venere Magellan C3-MDIR colorizzato, Marte Viking, Io, Europa, Ganimede, Callisto, Encelado, Teti, Dione, Rea, Giapeto, Tritone, Plutone, Caronte, Cerere (Dawn), Vesta (Dawn); Titano PIA19658 (NASA/JPL-Caltech/Space Science Institute, Cassini ISS). Aree non osservate e riempite (Tritone, emisferi sud di Plutone e Caronte) segnalate nella scheda. Saturno, Urano, Nettuno: Solar System Scope (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/) con attribuzione e indicazione delle modifiche (ricampionate e riallineate in longitudine); lacune riempite dall'autore delle mappe. Nessuna texture "di fantasia" per corpi non osservati.

## 10. Rendering

### 10.1 Regole generali

- R1 Scala reale per distanze e dimensioni; unità km. Nessun fattore di scala sui corpi (verificato da test, A10).
- R2 Origine mobile (§ 5.5): l'origine della scena è il corpo a fuoco; target dei controlli in (0, 0, 0); `Object3D.position` = r_corpo - r_fuoco in Float64. Una sola funzione `setOrigin()` trasla camera e target dello stesso delta al cambio di fuoco.
- R3 Shader personalizzati (impostori, anelli, griglia, marcatori) solo in spazio vista, senza `cameraPosition` né `modelMatrix` in coordinate mondo.
- R4 Profondità: `WebGLRenderer({ logarithmicDepthBuffer: true })`, near 1e-5 km, far 1e15 km (risoluzione relativa circa 2e-6 con 24 bit). Ogni `ShaderMaterial` include i chunk `logdepthbuf_*`; gli impostori scrivono `gl_FragDepth` con la stessa formula. Marcatori, alone del Sole e linee emettono `gl_Position` già diviso per w (w = 1): con w oltre circa 5e11 km alcuni rasterizzatori (SwiftShader) interpolano male le varying; le linee ricostruiscono nel fragment shader l'interpolazione prospettica di profondità e tratteggio dal w dei due estremi.
- R5 Corpi risolti come impostori di ellissoide: riquadro contenitore, intersezione raggio-ellissoide nel fragment shader in spazio vista (centro e assi calcolati su CPU in Float64), normale, latitudine e longitudine analitiche per la texture (`textureGrad` per evitare la cucitura), illuminazione dal Sole con terminatore, senza ombre di altri corpi (eclissi non rappresentate, dichiarato); Sole emissivo con alone limitato in pixel. Corpi con raggio apparente < 1 px: solo marcatore.
- R6 Orbite: § 10.2.
- R7 Anelli di Saturno: anello piatto nel piano equatoriale con profilo radiale schematico (texture 1D mediata sull'area del pixel: lacune e anelli più stretti del pixel attenuati, non a tratti); le linee dietro il piano degli anelli sono attenuate dalla trasmissione dell'anello e^(-τ/μ); anelli di Urano come linee sottili; ombra del pianeta sugli anelli; ombre degli anelli sul pianeta non rappresentate (dichiarato).
- R8 Stelle in una scena separata con camera di sola rotazione, disegnata per prima con `depthWrite = false`.
- R9 Selezione (§ 11.5.3) con proiezione su CPU; corpi risolti con intersezione raggio-ellissoide su CPU in Float64.
- R10 Convenzioni texture: una sola funzione `bodyFixedToScene(ssid, jdTT)` che include la rotazione polo y → z; per ogni texture lon0_u e verso nel catalogo.
- R11 Griglia dell'eclittica J2000 (facoltativa, disattivata all'avvio): shader sul piano z = 0 in spazio vista, livelli 10^k scelti da log10 della quota della camera, dissolvenza tra livelli. Anelli di distanza (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000 UA) attivi all'avvio, etichettati in un punto non nascosto dal disco di un corpo. Eclittica della data (facoltativa, disattivata all'avvio): cerchio massimo nella scena delle stelle (R8), entro 1,635° dal piano z = 0; con l'elevazione di 30° sull'eclittica della vista iniziale, che i preset centrati sul Sole mantengono, resta sopra il bordo superiore della vista e il pannello Livelli indica come vederla (vista abbassata verso il piano: Freccia giù sulla mappa almeno due volte, o trascinamento verso l'alto).
- R12 Rendering su richiesta: solo durante riproduzione, movimento dei controlli, transizioni o caricamenti; `setPixelRatio(min(devicePixelRatio, 2))`, aggiornato anche quando cambia solo la densità dei pixel.
- R13 Contesto WebGL: `webglcontextlost` con `preventDefault` e pausa, etichette nascoste e messaggio dell'interfaccia fino al ripristino; `webglcontextrestored` ricrea le risorse dalla cache CPU.
- R14 Barra di scala: 2·d·tan(fov/2)/altezza_px alla distanza del corpo a fuoco, con d profondità del suo centro lungo l'asse ottico (uguale alla distanza con il corpo al centro della vista, invariata da uno spostamento), arrotondata a 1-2-5, con didascalia "alla distanza del corpo a fuoco".

### 10.2 Orbite

- Ogni orbita è una conica (elementi da `orbitAt`) relativa al primario, ancorata al corpo che la percorre: il vertice 0 coincide con il corpo ed è (0, 0, 0) nella geometria; la posizione dell'oggetto è r_corpo - r_origine in Float64. Vale anche per Terra (orbita dell'EMB traslata sul centro della Terra) e pianeti con satelliti.
- Campionamento: 256 punti uniformi in anomalia eccentrica più un raffinamento geometrico attorno al corpo, ±δ·2^k con δ = 1e-9 rad, k = 0..40, finché δ·2^k < 2π/256. Iperboliche: archi limitati a ±(tempo per raggiungere 3 volte la distanza attuale).
- Ricostruzione solo al cambio di tempo, con budget per frame: corpo a fuoco sempre, altri fino a 8 per frame (la selezione ne occupa uno). Priorità alle orbite in campo (corpo disegnato nel campo della vista) e alle lune del sistema a fuoco; entro il gruppo la meno recente per prima. L'ultimo posto è riservato alla meno recente in assoluto: in riproduzione nessuna orbita attiva resta esclusa dal budget.
- Visibilità: orbite delle lune solo se il semiasse proiettato supera 10 px. All'avvio sono attive le orbite dei pianeti e del corpo selezionato.
- Opacità minima 0,60 (contrasto ≥ 3:1 sullo spazio); orbita selezionata opaca, 2 px; tratteggio per livelli "indicativa" e "non determinabile", qualunque sia la forma dell'orbita; arco d'incertezza ±ε continuo e 2 px più largo dell'orbita (3 px, 4 px con l'orbita selezionata).
- Luna: orbita osculante geocentrica, figlia della Terra.

### 10.3 Controlli della camera

- `zoomSpeed` circa 5 (circa 136 scatti di rotella da 0,01 km a 1e5 UA); pulsanti e tasti per fattori 10.
- Rotella e trascinamento agiscono anche sopra le etichette.
- Distanza minima dal centro del corpo a fuoco: R_max + max(0,01·R_max; 0,5 km), anche con il bersaglio spostato (Maiusc+frecce, trascinamento con il tasto destro): dopo una rotazione attorno al bersaglio la camera è riportata radialmente a questa distanza. Distanza massima: quella che dà un'ampiezza della vista (lato minore) di 2·10⁵ UA, cioè 2·10⁵/(2·tan 22,5°·min(1, aspetto)) UA: 2,41·10⁵ UA con lo schermo orizzontale. L'ampiezza della vista resta la stessa quando cambia l'aspetto della canvas (rotazione dello schermo, prima misura).
- Corpo a fuoco senza posizione alla data (§ 7.8.2): origine, distanza minima e inquadratura si riferiscono al primo antenato con posizione; resta la vista attuale se almeno ampia quanto l'inquadratura di quel corpo, e "Inquadra" annuncia che la posizione non è determinabile.
- Transizione di fuoco: interpolazione logaritmica della distanza e interpolazione in Float64 tra le posizioni dei due corpi, ricalcolate a ogni frame; 1,5 s, interrompibile, immediata con `prefers-reduced-motion`.
- Durante la riproduzione il fuoco segue il corpo senza logica aggiuntiva (origine sul corpo).

## 11. Interfaccia

### 11.1 Tema e palette

Tema scuro unico (I14). Token CSS su `:root`:

| Token | Valore | Uso |
|-------|--------|-----|
| --spazio | #030806 | sfondo della scena e di `body` |
| --superficie | #0C1A15 | pannelli, opacità 0,94 con sfocatura 12 px, mai sotto 0,90 |
| --superficie-rialzata | #13281F | elementi in rilievo |
| --superficie-incassata | #07110D | campi |
| --linea | #23443A | divisori decorativi |
| --bordo-controllo | #5E9C86 | bordi dei controlli |
| --testo | #E6F2EC | testo |
| --testo-2 | #A9C7B9 | testo secondario |
| --testo-3 | #86A898 | unità, didascalie |
| --giada | #4FD69C | azione primaria, stato attivo (testo sopra: --su-giada #03140C) |
| --giada-testo | #7BE3B5 | collegamenti, voce attiva |
| --fuoco | #D7F75B | focus e selezione, con offset di 2 px (nella nota ridotta anello interno, sotto) |
| --ambra | #F5B94A | avvisi (testo sopra: #1A1200) |
| --corallo | #FF8F80 | errori, affidabilità indicativa |
| --cielo | #8CC8F0 | informazioni neutre |

Tinta HSL dei token verdi tra 150° e 160°. Contrasti calcolati con la formula WCAG:

| Coppia | Rapporto |
|--------|----------|
| --testo su superficie / rialzata / spazio | 15,56 / 13,53 / 17,55 |
| --testo-2 su superficie / rialzata | 9,84 / 8,55 |
| --testo-3 su superficie / rialzata | 6,87 / 5,97 |
| --giada-testo, --ambra, --corallo, --cielo su superficie | 11,49 / 10,15 / 8,08 / 9,91 |
| --su-giada su --giada; #1A1200 su --ambra | 10,31; 10,55 |
| --bordo-controllo su superficie / rialzata / incassata | 5,60 / 4,87 / 6,00 |
| --fuoco su superficie / rialzata | 14,77 / 12,84 |
| --fuoco su --giada | 1,52 (offset obbligatorio) |
| Caso peggiore: pannello a opacità 0,94 su fondo bianco (#1B2823): testo, testo-2, testo-3, bordo | 13,30 / 8,41 / 5,87 / 4,78 |
| Opacità 0,90 (#24312C): testo-3, bordo | 5,20 / 4,24 |

- `prefers-contrast: more`: pannelli opachi, --testo-2 = --testo, bordi #7FC0A8.
- `forced-colors: active`: colori di sistema; focus con `outline` (mai solo `box-shadow`).
- Focus: outline 2 px --fuoco, offset 2 px. Nei pulsanti della nota di benvenuto ridotta, a filo del contenitore dei messaggi che taglierebbe l'anello, l'anello sta dentro il pulsante, a 2 px dal bordo (§ 11.3). L'anello resta intero anche nei pannelli che scorrono (il controllo portato al bordo con Tab ne lascia visibili i 4 px), nella Scheda ridotta all'intestazione e con il puntatore su un controllo adiacente.

Colori della scena (nessun verde nei marcatori, per separare scena e interfaccia; la selezione usa il giallo-verde del focus):

| Categoria | Colore | Forma del marcatore | Contrasto su --spazio |
|-----------|--------|---------------------|-----------------------|
| Sole | #FFE7A3 | simbolo ☉ (SVG) 12 px | 16,53 |
| Pianeti | #F4F1E8 | cerchio pieno 8 px | 17,86 |
| Pianeti nani | #A89BFF | rombo 9 px | 8,45 |
| Lune | #A3AEB5 | anello 6 px | 8,91 |
| Asteroidi | #CF9A62 | triangolo 8 px | 8,12 |
| Centauri | #F0709E | pentagono 8 px | 7,22 |
| Comete | #62DDF0 | cerchio 7 px con breve coda antisolare | 12,60 |
| TNO | #F0709E | quadrato 7 px | 7,22 |
| Interstellari | #FFD23F | stella a 4 punte 10 px | 13,97 |
| Selezione | #D7F75B | anello | |

- Centauri e TNO condividono il colore e si distinguono per forma. Distanza CIEDE2000 minima tra le altre categorie 8,2 (tritanopia), verificata con le simulazioni di Machado et al. 2009.
- Anelli di distanza #3F6F5E (3,50:1), etichette #86A898 (7,75:1); griglia #2B5245 (decorativa).
- I colori della scena (categorie, selezione, anelli, etichette, griglia, assi) stanno solo in `src/render/costanti.ts`, letti anche dai simboli dell'interfaccia; i token CSS sono quelli della prima tabella.
- Stelle: colore da B-V, luminosità massima limitata.

### 11.2 Tipografia

- Source Sans 3 (400, 600) per testo e numeri; Source Serif 4 (600) per titoli e nome del corpo; Source Code Pro (400) facoltativo per JD e coordinate. Google Fonts con `display=swap`; fallback "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif. Glifi verificati: ʻ ′ ″ − ≈ ± ≤ ≥ ×; U+2009 presente nel sottoinsieme latino; U+202F assente (non usato); ☉ assente (si usa SVG).
- Dimensioni: 12 px etichette di scena, 13 px didascalie, 15 px testo, 16 px su mobile e in tutti i campi, 18 px titoli di sezione, 22 px data, 24 px nome del corpo; interlinea 1,45; nessuna altezza fissa nei contenitori di testo.

### 11.3 Layout

- Scena sempre a tutto schermo (100dvh) con pannelli sovrapposti; margini `max(16px, env(safe-area-inset-*))`; `viewport-fit=cover` nel sito ospitato.
- Desktop (≥ 1024 px): in alto a sinistra campo Trova (320 px) che apre il Catalogo; a destra Scheda (360 px) solo con un corpo selezionato, riducibile all'intestazione; in basso al centro Console temporale (larghezza massima 960 px; riga 1: data a 22 px, badge del calendario, ΔT, Adesso; riga 2: regolo, riproduzione, velocità); sul bordo sinistro regolo logaritmico delle distanze; in alto a destra Livelli, Fonti e metodi, Impostazioni.
- Tablet (700-1023 px): Catalogo e Scheda di 320 px, uno alla volta.
- Telefono (< 700 px, fino a 699 px: tablet da 7-8 pollici in verticale, pieghevoli aperti, finestre affiancate o a metà schermo, zoom al 200 %; WCAG 2.2, SC 1.4.4 e 1.4.10): barra superiore di 48 px; foglio inferiore a tre stati (64 px: data, riproduzione, velocità; circa 240 px: console completa; fino a 85dvh: Scheda o Catalogo), maniglia come pulsante con `aria-expanded`; in orizzontale con altezza < 480 px (valutata prima della soglia di larghezza, quindi a ogni larghezza maggiore dell'altezza) il foglio diventa un pannello laterale di 320 px e la mappa occupa l'area libera a sinistra del pannello; sotto i 684 px di larghezza la barra superiore occupa tutta la larghezza (campo Trova di almeno 120 px) e il pannello comincia sotto di essa; sotto i 512 px il pannello si restringe perché alla mappa restino 160 px per legenda e pulsanti +, − e Inquadra. Con la tastiera virtuale l'editor della data segue `VisualViewport`.
- Telefono, pulsante "Apri la scheda": con un corpo selezionato e il foglio non esteso sta sopra il foglio e lo porta a esteso. Non compare con la vista testuale aperta, che occupa la stessa zona e lo coprirebbe: la scheda si apre dalla riga del corpo nella tabella.
- Nota di benvenuto e messaggi di caricamento ed errore non coprono la legenda permanente, i pulsanti della mappa, la barra superiore, la console, la Scheda né il Catalogo: sul telefono sotto la legenda, accanto alla colonna dei pulsanti +, − e Inquadra, e sopra il foglio (scorrono se lo spazio non basta); sul desktop al centro, tra Catalogo e Scheda (al massimo 520 px, simmetrici attorno al centro: 360 px di pannello, margine e 8 px di respiro per lato), sotto la barra e sopra console e legenda; sul tablet a destra del regolo delle distanze, accanto al pannello aperto o, con i pulsanti in riga, a destra della legenda; sul tablet stretto, dove accanto alla Scheda resterebbero meno di 200 px (con i margini di 16 px, sotto i 736 px di larghezza, sotto i 940 px con i pulsanti in riga), in testa alla colonna della Scheda, che comincia sotto di essi (con il Catalogo aperto, alla sua destra): la Scheda conserva sempre l'intestazione con nome e comandi, con l'anello del focus dei comandi intero, i messaggi hanno fino a 120 px dello spazio che resta, poi la Scheda fino a 128 px, e quello che non entra scorre; in orizzontale in testa al pannello laterale, visibili anche a pannello scorso. Sul telefono, con il pulsante "Apri la scheda", finiscono sopra di esso. Caricamento ed errori precedono la nota. Su desktop e tablet scorrono se lo spazio in altezza non basta, con il bordo sfumato dalla parte del testo nascosto (indizio visibile anche con le barre di scorrimento sovrapposte del tocco), per al più 40 px e mai più del testo nascosto oltre quel bordo, così con pochi pixel in più le righe visibili restano leggibili; con meno di 200 px di larghezza o al massimo 120 px di altezza la nota è ridotta al comando "Leggi la nota di benvenuto", che apre il testo in un dialogo, e al pulsante di chiusura: il testo resta disponibile (WCAG 2.2, SC 1.4.4 e 1.4.10). Risultati di Trova, Catalogo, Livelli, Menu e menu Viste aperti stanno sopra i messaggi.
- Regolo delle distanze da 10³ km (in alto, accanto a +) a 2·10⁵ UA (in basso, accanto a −), l'ampiezza massima della vista; il valore dello slider è il livello di avvicinamento: FrecciaSu e PagSu avvicinano, come PagSu sulla mappa (su mobile: menu Vista); preset: Terra e Luna (circa 1,2 milioni di km), Plutone e Caronte (circa 200 000 km), Sistema di Giove (circa 5 milioni di km), Sistema di Saturno (circa 30 milioni di km), Sistema interno (circa 4 UA), Fascia principale e Giove (circa 12 UA), Pianeti giganti (circa 64 UA), Fascia di Kuiper (circa 220 UA), Sedna e comete lontane (circa 2200 UA), Oggetti interstellari (circa 2·10⁵ UA). I preset dei sistemi planetari (Terra e Luna, Plutone e Caronte, Sistema di Giove, Sistema di Saturno) portano la camera a 30° sul piano del sistema, cioè sul piano dell'orbita della luna maggiore (equatore per Giove, Saturno e Plutone, vicino all'eclittica per la Luna; senza lune con stato, equatore del pianeta), con lo stesso azimut attorno al suo polo e dallo stesso lato del piano; gli altri mantengono la direzione della camera.
- Pulsanti +, − e Inquadra come alternativa ai gesti.
- Menu Viste su desktop e tablet: sotto la barra superiore e dentro la finestra, con tutte le voci visibili senza scorrere, in una colonna o, se non entra, in due lette dall'alto in basso (ordine di Tab uguale), con la voce che ha il focus sopra le altre; con i pulsanti in riga si apre sotto la riga. Il menu Viste e il Menu di telefono e orizzontale si riaprono dalla prima voce e Tab oltre l'ultima voce li chiude, perché non coprano il controllo che riceve il focus (WCAG 2.2, SC 2.4.11).
- Riscontro dello zoom (pulsanti +, −, tasti della mappa, regolo delle distanze da tastiera e con il puntatore): dopo il ridisegno della vista la live region annuncia l'ampiezza ottenuta, mai quella richiesta (Fine con il Sole a fuoco non arriva a 10³ km: quota minima, § 10.3); se la vista si ferma prima del richiesto segue "Distanza minima della vista raggiunta." o "Distanza massima della vista raggiunta." (senza spostamento, solo il messaggio) e il pulsante + o − ha `aria-disabled` finché la vista non cambia. Sul regolo le frecce, PagSu e PagGiù fanno lo stesso zoom dei pulsanti e dei tasti della mappa; Home e Fine portano la vista all'estremo del regolo, senza muoverla contro il verso richiesto, e dichiarano sempre il limite.

### 11.4 Console temporale

#### 11.4.1 Editor della data

- Campi segmentati in linea, alti almeno 44 px, font 16 px: Giorno (2 cifre), Mese (elenco gennaio-dicembre), Anno (1-10000; con un offset negativo l'intervallo inizia il 31 dicembre 10001 a.C., § 6.2; `inputmode="numeric"`), Era (a.C./d.C., due pulsanti con `aria-pressed`), Ora : Minuti. Gruppo con `role="group"`, `aria-invalid`, `aria-describedby`.
- In sola lettura accanto: calendario applicato, giorno della settimana; per date anteriori al 15/10/1582 riga secondaria attivabile "gregoriano prolettico: [data]". Giorno della settimana e riga secondaria seguono la data mostrata (T4): la riga compare con il calendario giuliano.
- Opzioni avanzate: anno astronomico con segno, JD (UT e TT), ingresso in TT, offset orario fisso (da -12:00 a +14:00, passo 15 min; disattivato all'avvio; etichetta "UTC+2 (fisso)").
- Validazione alla conferma (Invio in un campo o uscita dal gruppo), non a ogni tasto; Invio su un pulsante dell'era lo attiva, come Spazio.

#### 11.4.2 Messaggi di validazione

- `ANNO_ZERO`: "L'anno 0 non esiste: dopo l'1 a.C. viene l'1 d.C."
- `RIFORMA_1582`: "Nel 1582 si passò dal 4 al 15 ottobre: i giorni dal 5 al 14 non esistono." con i pulsanti "Vai al 4 ottobre" e "Vai al 15 ottobre".
- `GIORNO_INESISTENTE`: "Il [giorno] [mese] [anno] non esiste nel calendario [giuliano|gregoriano]."
- `FUORI_INTERVALLO`: "Sono disponibili le date dal 1° gennaio 10000 a.C. al 31 dicembre 2120 (UT)."

#### 11.4.3 Passi, regolo, riproduzione

- Selettore d'unità (minuto, ora, giorno, mese, anno, secolo, millennio) con due pulsanti ◀ ▶; regole del § 6.6. Al limite: pulsante con `aria-disabled` e messaggio, ad esempio "Raggiunto il limite inferiore: 1° gennaio 10000 a.C., 00:00 UT (02:00 in UTC+2)".
- Regolo a due livelli: (a) barra panoramica alta 8 px con area di tocco 44 px, tacche a 10000 a.C., 5000 a.C., 1 d.C., 1582, 2120, finestra del regolo inferiore, fasce con l'affidabilità del corpo selezionato (ε_ΔT con la velocità angolare media dell'orbita alla data della selezione, indipendente dai blocchi in memoria), distinte dal colore e dall'altezza (come le barre piene dell'icona del livello), con titolo, spiegazione nella legenda dei Livelli e descrizione testuale dei livelli e degli anni collegata al regolo; (b) regolo a scala variabile con ago centrale fisso: trascinamento per scorrere, pizzico o Ctrl+rotella per la scala (da 1 giorno a 12 000 anni; pulsanti con `aria-disabled` ai limiti), tacche adattive con almeno un'etichetta di data nella finestra e tacche maggiori distanti almeno quanto due etichette (l'1 d.C. al posto del multiplo 0 solo se c'è spazio; con unità di giorni, il salto del 5-14 ottobre 1582 non avvicina due tacche a meno di mezza unità: si omette la seconda, ad esempio il 16 ottobre 1582 con tacche ogni 15 giorni, a 5 giorni dall'1 ottobre, indipendentemente da quanta parte del regolo si vede).
- Accessibilità del regolo: `role="slider"` con `aria-valuetext` leggibile ("21 marzo 1500, 12:00 UT, calendario giuliano"); frecce = passo dell'unità corrente; Maiusc+frecce = ×10; PagSu/PagGiù = unità superiore; Home/Fine = limiti; annuncio della data solo al rilascio; se il passo si è fermato al limite resta il messaggio del limite.
- Riproduzione: velocità del § 6.6; nessuna riproduzione all'avvio. Con "Segui l'ora attuale" la data avanza a 1 s/s: selettore della velocità e verso mostrano questo stato e sono disattivati; il passaggio all'ingresso in TT esce dall'opzione e ferma la riproduzione (con l'annuncio "disattivato", § 11.9). Antialiasing temporale: se il passo per fotogramma supera 1/8 del periodo attorno al primario, il marcatore lascia il posto all'orbita evidenziata e la scheda indica "moto troppo rapido per essere rappresentato a questa velocità"; rotazioni e fasi restano ferme con la stessa regola (periodo di rotazione in valore assoluto; mai in pausa). Numeri dei pannelli aggiornati al massimo 4 volte al secondo.
- Riga ΔT: valore e incertezza; quando ε_ΔT della Luna supera 1′: "Ora incerta di ±[σ] h: la Luna può trovarsi [x]° più avanti o indietro."
- Indicatore della stagione astronomica dalla longitudine apparente geocentrica del Sole riferita all'eclittica e all'equinozio veri della data (aberrazione annua e nutazione in longitudine IAU 2000B), la grandezza degli istanti ufficiali di equinozi e solstizi; giorni interi trascorsi dall'istante dell'evento, risolto sugli stati della Terra (stima con la conica osculante se lo stato all'istante dell'evento non è caricato), ad esempio "Primavera boreale, 12 giorni dopo l'equinozio"; con 0 giorni interi "Primavera boreale, meno di un giorno dopo l'equinozio" (le 24 h dall'istante possono cadere in due giorni di calendario, quindi mai "giorno dell'equinozio").

### 11.5 Marcatori, etichette, selezione

#### 11.5.1 Marcatori

- Sprite SVG con forme e colori del § 11.1; dimensione costante in pixel; il marcatore sfuma in 200 ms (subito con movimento ridotto) quando il diametro apparente reale supera 10 px, e resta l'anello di selezione, 5 px fuori dal contorno proiettato del disco (fuori dall'asse ottico un'ellisse più grande del cerchio di raggio f·R/√(d² - R²), con il centro spostato verso l'esterno).
- Lune a meno di 12 px dal pianeta: nascoste; il pianeta mostra il contatore "+N lune", che inquadra il sistema con la camera a 30° sul piano del sistema, come i preset dei sistemi planetari (§ 11.3).
- Marcatori dietro il disco del Sole o di un pianeta: opacità 30% (occlusione analitica).
- Legenda permanente: "Distanze e dimensioni in scala reale. I simboli indicano la posizione, non la grandezza."

#### 11.5.2 Etichette

- Livello HTML proprio: contenitore con `pointer-events: none`, testo delle etichette con `pointer-events: auto`, `aria-hidden="true"`.
- Larghezze misurate una volta dopo `document.fonts.ready`; aggiornamenti solo con `transform: translate3d`.
- Priorità: corpo selezionato e corpo sotto il puntatore sempre visibili; poi pianeti, pianeti nani, corpi con orbita attiva, lune del pianeta a fuoco, altri per diametro.
- Collisioni risolte con algoritmo goloso su griglia di bucket in pixel, costo O(n); ricalcolo al massimo 10 volte al secondo con isteresi di 300 ms; al massimo circa 25 etichette sotto i 600 px di larghezza della mappa.
- I pannelli sovrapposti alla scena (§ 11.3: barra, campo Trova, Scheda, Catalogo, regolo delle distanze, legenda, console, foglio, avvisi) valgono come zone occupate: un'etichetta che ne toccherebbe una prova l'altro lato, altrimenti resta nascosta, contatore "+N lune" compreso. Corpo selezionato e corpo sotto il puntatore restano visibili anche se nessun lato è libero. Zone: elementi fuori dalla mappa con sfondo di opacità almeno 0,5, aggiornate a ogni cambio dei pannelli.
- Il marcatore del corpo selezionato, con l'anello di selezione (riquadro di semilato pari al raggio del marcatore più 5 px più 2 px di tratto), vale come zona occupata per le etichette degli altri corpi: un'etichetta che lo coprirebbe prova l'altro lato, altrimenti resta nascosta; l'etichetta del corpo selezionato, accanto all'anello, non è vincolata dalla zona, e quella del corpo sotto il puntatore, forzata, prova l'altro lato ma resta visibile anche se nessun lato è libero. Con il disco più grande del marcatore l'anello sta attorno al contorno proiettato (§ 11.5.1) e la zona non si applica.
- Disco grande (raggio apparente di almeno 60 px): etichetta all'altezza del bordo a 45° sotto il centro, a destra o a sinistra del contorno proiettato, oltre l'anello di selezione.
- Nomi brevi nella scena ("Hale-Bopp", "67P"); designazione completa nella scheda. Testo #E6F2EC, 12-13 px, peso 600, alone di 3 px #030806 (`paint-order: stroke`; 17,55:1).

#### 11.5.3 Selezione

- Tolleranza: raggio 12 px con mouse (bersaglio 24 px, WCAG 2.2 SC 2.5.8), 22 px con tocco (44 px), in base a `pointerType`.
- Clic valido se lo spostamento è inferiore a 5 px e la durata inferiore a 500 ms; selezione al rilascio.
- Più candidati: vince la priorità di categoria, poi la distanza sullo schermo; un clic ripetuto entro 4 px e 1,5 s passa al candidato successivo, con annuncio "Corpo selezionato: Io (2 di 5 qui)".
- Un trascinamento iniziato su un'etichetta è inoltrato alla canvas.
- Un clic o un tocco senza candidati (né marcatore, né disco, né etichetta sotto il punto) non emette alcun evento e lascia la selezione. La scena della pagina di prova `ui-lab.html` usa la stessa logica (`Selettore` di `src/render/picking.ts`).

### 11.6 Ricerca, catalogo, filtri

- Normalizzazione: minuscole, NFD senza diacritici, rimozione di okina e apostrofi in tutte le varianti (ʻ ‘ ’ ʼ ' ` ´), del trattino e delle sue varianti tipografiche (‐ ‑ ‒ – −, trattino morbido), di / e spazi; corrispondenza prima per prefisso di parola, poi per sottostringa; al massimo 8 risultati raggruppati per categoria; pattern combobox APG con `aria-activedescendant`.
- Ordine dei risultati: rango di corrispondenza, precedenza della categoria primaria (§ 4.2), nome con i numeri come numeri (1P, 12P, 19P, 103P, 109P, non 103P prima di 12P; lo stesso confronto della colonna Corpo della vista testuale, § 11.9), identificatore del corpo.
- Testo secondario dei risultati: per le lune il pianeta; per gli altri corpi il numero e il nome ufficiale o la designazione, senza ripetere ciò che il nome contiene (Eros: "433 · A898 PA"; 1P/Halley: nessun testo). Il nome ufficiale già presente nel nome come parola intera non si ripete e lascia il posto alla designazione (52 Europa: "A858 CA"); "Pluto" non è parola intera di "Plutone" e si mostra ("134340 · Pluto").
- Nessun risultato: "Nessun corpo per «xyz». Prova con il nome inglese, il numero (es. 433) o la designazione." Il messaggio si nasconde all'uscita dal campo e torna al rientro; una selezione da catalogo, mappa o collegamento svuota la ricerca superata.
- Catalogo come elenchi annidati di pulsanti, con le lune sotto il pianeta. Su desktop e tablet sta sopra la legenda permanente; se lì restano meno di 160 px è alto 160 px (meno se la console è più vicina) e copre la legenda finché resta aperto.
- Filtri con contatore dei corpi che hanno la categoria come primaria o secondaria (es. "Lune 30"). Un corpo selezionato da ricerca ma di categoria nascosta si mostra con avviso.

### 11.7 Scheda

- Intestazione: nome (Source Serif 4, 24 px), nome ufficiale e designazione, categoria con la forma del marcatore, affidabilità.
- Blocco "Ora": distanza dal Sole, distanza dalla Terra con tempo luce (assente per la Terra), velocità. km sotto 0,01 UA. Senza posizione alla data dice "Dati in caricamento." finché i dati stanno arrivando (barra di caricamento visibile) e "Dati non disponibili a questa data." fuori copertura o dopo l'errore di un blocco (§ 11.11).
- Sezioni richiudibili: Orbita, Caratteristiche fisiche, Fonte e affidabilità.
- Elementi con nome e simbolo (a, e, i, Ω, ω, M, P; T come data nella scala e nell'offset dell'istante mostrato; Ω, ω e M in [0°, 360°)) e riga del riferimento: "eclittica J2000, eliocentrici", "eclittica J2000, baricentrici" (corpi lontani), "rispetto a [pianeta], piano di riferimento F" (F alla data, § 7.5.4).
- Con e ≥ 1: "Orbita iperbolica: periodo non definito" e velocità all'infinito. L'eccentricità mostrata resta dal lato di 1 dell'orbita (incertezza non superiore a |1 - e|·(δq/q ⊕ δa/a), `docs/METODI.md`); se il valore arrotondato non lo permette (forma incerta), "≈ 1 (quasi parabolica)".
- Ogni valore fisico rimanda alla sua fonte; "non noto" dove manca.
- In riproduzione: aggiornamento al massimo 4 volte al secondo, nessuna live region; pulsante "Leggi posizione" (distanze dal Sole e dalla Terra; senza posizione alla data, la frase del blocco "Ora" preceduta dal nome del corpo).
- "Inquadra" sul telefono: la scheda sta nel foglio esteso, che copre il centro della mappa; il foglio passa a compatto, perché il corpo inquadrato sia visibile, e il focus al pulsante "Apri la scheda" che sostituisce il pulsante premuto (alla maniglia con la vista testuale aperta). Annuncio invariato. In orizzontale il pannello laterale non cambia.

### 11.8 Affidabilità nell'interfaccia

Testi per livello (§ 7.8.2):

- Precisa: "Posizione da [sorgente], errore stimato inferiore a 1′."
- Buona: "Errore stimato fino a [x]°, circa [n] volte il diametro apparente della Luna piena."
- Approssimata: "La posizione lungo l'orbita può differire di [x]°."
- Indicativa: "La forma dell'orbita è attendibile, la posizione lungo l'orbita no."; con la forma non determinata: "La posizione lungo l'orbita non è attendibile e la forma dell'orbita è incerta."
- Non determinabile: "Posizione non determinabile a questa data." (e, se la forma non è determinata, "Orbita non determinabile.")
- Con la forma non determinata e un livello diverso da "non determinabile" la sezione Orbita indica "Forma dell'orbita incerta: semiasse maggiore ed eccentricità sono approssimati."; per errori sotto un decimo del diametro della Luna piena la frase della buona dice "meno di un decimo del diametro apparente della Luna piena".

La scheda mostra separatamente ε_modello ed ε_ΔT.

### 11.9 Accessibilità

- Vista testuale attivabile (tasto T o pulsante): tabella con caption (data e calendario) e colonne Corpo, Categoria, Distanza dal Sole, Distanza dalla Terra, Longitudine e latitudine eclittiche J2000, Affidabilità; ordinabile (la colonna Corpo per nome, con i numeri come numeri: 1P, 9P, 12P, 103P); aggiornata su pausa, passo o comando, mai durante la riproduzione. Una cella senza valore dice "non applicabile" (Sole, Terra), "in caricamento" mentre i dati della data stanno arrivando (barra di caricamento visibile) o "non disponibile" (fuori copertura, posizione non determinabile, blocco non caricato per un errore). È anche il ripiego senza WebGL2. Sul telefono, scegliendo un corpo dalla tabella (Invio o tocco) il foglio esteso copre la riga: il focus passa al titolo della scheda (WCAG 2.2, SC 2.4.3 e 2.4.11); sul tablet, sul desktop e in orizzontale la riga resta visibile e conserva il focus. Finché il foglio esteso copre la tabella, ridotta a pochi pixel, intestazioni e righe sono `inert`: fuori dall'ordine di Tab e dall'albero di accessibilità (WCAG 2.2, SC 2.4.7 e 2.4.11); tornano con il foglio ridotto, e il focus che contenevano passa alla maniglia del foglio.
- Canvas in un contenitore `tabindex="0"`, `role="application"`, `aria-roledescription="mappa 3D"`, `aria-label` dinamico (vista e corpo a fuoco), `aria-describedby` verso le istruzioni dei comandi.
- Una sola live region `role="status"` (corpo selezionato, anche da un collegamento seguito, data dopo un passo, caricamento e sua conclusione, limiti); al massimo un annuncio ogni 1,5 s. In riproduzione, compresa "Segui l'ora attuale", tacciono solo gli annunci prodotti dal tempo: la data che avanza, i passi automatici e il caricamento dei dati per gli istanti raggiunti (annuncio, conclusione ed errore del blocco); se l'errore ferma la riproduzione, l'arresto si annuncia una volta ("Riproduzione in pausa: dati non caricati", con la data), come la pausa e il limite. Gli annunci che seguono un'azione esplicita dell'utente si pronunciano sempre, con lo stesso limite di frequenza: selezione da Trova, catalogo e mappa, numero di risultati e "Nessun corpo per ..." di Trova, filtri, livelli, apertura e chiusura della vista testuale, passi, velocità, "Leggi posizione", "Copia collegamento", attivazione e disattivazione di "Segui l'ora attuale", anche quando l'opzione si spegne con un passo, "Adesso", il regolo, l'editor della data o l'ingresso in TT: "Segui l'ora attuale: disattivato" è unito all'annuncio della data o del limite di quell'azione (un solo annuncio, perché due annunci ravvicinati si sostituirebbero) e, per l'ingresso in TT, che non annuncia altro, è annunciato da solo (WCAG 2.2, SC 4.1.3 Status Messages).
- Landmark: barra in `header`; mappa, regolo delle distanze, legenda e messaggi in `main` con il titolo `h1` della pagina (visivamente nascosto); console e scheda come regioni proprie; nessun contenuto fuori dai landmark. Il nome accessibile dei pulsanti contiene l'etichetta visibile (WCAG 2.5.3): "Tabella: vista testuale", data nella forma mostrata (estesa o breve).
- "Fonti e metodi" e "Impostazioni" in `<dialog>` nativo (`showModal`), chiusura con Esc e ritorno del focus. Chiudendo un messaggio in pagina, la nota di benvenuto o premendo "Riprova" il focus passa a un elemento stabile (pulsante della data), o al nuovo "Riprova" se il tentativo fallisce (WCAG 2.4.3).
- Ordine di tabulazione: "Salta ai controlli temporali", Trova, Livelli, Impostazioni, mappa 3D, console temporale, scheda. Nella console l'ordine di tabulazione segue l'ordine visivo in ogni layout: sul desktop passi, regolo, riproduzione in riga; fuori dal desktop, dove il regolo sta sopra, regolo, passi, riproduzione (ordine del DOM cambiato al cambio di layout, non `order` CSS; il focus resta dov'era).
- Con il focus sulla mappa: frecce ruotano, Maiusc+frecce spostano, + e − o PagSu e PagGiù fanno zoom, Invio seleziona il corpo più vicino al centro, N e Maiusc+N passano al corpo visibile successivo o precedente, F inquadra, Esc deseleziona, Tab esce sempre.
- Scorciatoie globali disattivabili in Impostazioni (WCAG 2.1.4): / ricerca; Spazio riproduzione, solo fuori da campi e pulsanti; , e . passo; [ e ] velocità; ? elenco delle scorciatoie; T vista testuale.
- `prefers-reduced-motion`: transizioni immediate, nessuna dissolvenza.

### 11.10 Tocco

Un dito ruota; due dita zoom e spostamento; doppio tocco inquadra; tocco singolo seleziona con soglia di movimento di 8 px. `touch-action: none` solo sulla canvas; `overscroll-behavior: contain` nel foglio inferiore. Destinazioni ≥ 44 × 44 px con spaziatura ≥ 8 px.

### 11.11 Errori e caricamento

Messaggi in linea con `role="status"` (`role="alert"` solo per errori bloccanti):

- WebGL2 assente (verifica preventiva con `getContext('webgl2')` e try/catch sul costruttore del renderer): "Il browser non supporta la grafica 3D necessaria (WebGL2). Puoi usare la vista testuale."
- Contesto perso: ripristino automatico (R13).
- Blocco non caricato: "Impossibile caricare i dati per [intervallo]." con "Riprova"; corpi interessati nascosti.
- `moon.bin` non caricato: "Impossibile caricare i dati della Luna." con "Riprova"; Terra e Luna nascoste.
- Avvio: dati di base non caricati, "Impossibile caricare i dati di base della mappa."; eccezione nella costruzione dell'applicazione, "Impossibile avviare la mappa."; entrambi con "Riprova" e `role="alert"`. Un'eccezione nel costruttore della scena equivale all'assenza di WebGL2 (vista testuale).
- Richiesta senza byte ricevuti per 30 s: file non caricato, con il messaggio corrispondente e "Riprova" (§ 5.6).
- Caricamento: barra sottile con testo, riproduzione in pausa. Finché la barra è visibile il blocco "Ora" della scheda, senza posizione, e "Leggi posizione" dicono "Dati in caricamento.", la sezione Orbita, senza elementi, la stessa frase e la vista testuale "in caricamento" (§ 11.9); dopo l'errore di un blocco o di `moon.bin` restano "Dati non disponibili a questa data." (blocco "Ora" e "Leggi posizione"), "Elementi non disponibili a questa data." e "non disponibile".

### 11.12 Stato iniziale e URL

- Avvio: istante corrente in UT da `clock.ts`, limitato all'intervallo (I2; oltre il 2120 il 31/12/2120 23:59:59 UT, con il messaggio del limite, come per "Adesso"), orologio in pausa ("Segui l'ora attuale" è un'opzione esplicita); vista Sistema interno con camera 30° sopra l'eclittica, fuoco sul Sole, Terra selezionata con scheda ridotta all'intestazione.
- L'hash riporta il corpo selezionato (non il fuoco dei preset). Con `#slug` valido: corpo selezionato e inquadrato a livello di orbita, cioè con l'orbita intera nella vista attorno al corpo (`#sole`: vista Sistema interno); slug confrontato in minuscolo (`#Marte` = `#marte`); ogni altro testo non vuoto (slug sconosciuto o non conforme, come `#1P`) ignorato con messaggio che lo riporta, tolto al collegamento valido successivo. Lettura anche su `hashchange`, con l'annuncio del corpo selezionato. "Copia collegamento" copia l'URL con il solo hash; esito visibile accanto al pulsante e, se gli appunti non sono disponibili, URL in un campo già selezionato.
- Lingua: il controllo «Lingua / Language» delle Impostazioni (elenco a discesa con «Italiano» e «English», `lang` su ogni opzione, destinazione di almeno 44 px) salva la scelta nelle preferenze e ricarica la pagina. Dopo la ricarica restano la data e l'ora (scala UT o TT, offset), il corpo selezionato (anche nell'hash), il corpo a fuoco e l'ampiezza della vista, la vista testuale se era aperta; l'inclinazione e l'azimut della camera tornano ai valori predefiniti e la riproduzione è in pausa. Il passaggio dello stato non è una preferenza: sta in sessionStorage, è letto e cancellato una sola volta all'avvio; se sessionStorage manca la pagina riparte dallo stato iniziale.
- Nota di benvenuto non modale di tre righe, chiudibile; la chiusura è ricordata nelle preferenze. "Mostra di nuovo la nota di benvenuto" (Impostazioni) chiude il dialogo e porta il focus sulla nota, intera o ridotta (§ 11.3). La nota nascosta dal foglio esteso del telefono non è chiusa: torna con il foglio ridotto e, se era nascosta mentre conteneva il focus, lo cede al pulsante della data. Se la nota torna intera mentre "Leggi la nota di benvenuto" ha il focus, o mentre è aperto il dialogo che il comando ha aperto, il focus passa alla nota (alla chiusura del dialogo, senza passare per il body).
- Cambio di layout (finestra ridimensionata, zoom del browser): il focus nel catalogo o nella scheda resta all'elemento; nel foglio il pannello aperto o con il focus resta visibile. Un controllo che il nuovo layout nasconde (regolo, passi e "Adesso" nel foglio ridotto del telefono; cursore del regolo delle distanze sul telefono e in orizzontale) cede il focus alla maniglia del foglio sul telefono e al pulsante della data negli altri layout: il focus non cade sul body.
- La struttura della console è visibile prima dei dati.

### 11.13 Formattazione numerica

Un solo formattatore (`src/ui/format.ts`, `creaFormati(lingua)`), con le convenzioni della lingua attiva. Italiano: virgola decimale; gruppi di tre cifre separati da U+2009 dentro un elemento `white-space: nowrap`, da 4 cifre in su. Inglese: punto decimale; gruppi di tre cifre separati da virgola, da 4 cifre in su ("1,234.5"). In entrambe le lingue: anni e designazioni mai raggruppati; segno meno U+2212; spazio non separabile tra numero e unità; cifre significative coerenti con l'affidabilità (es. "≈ 34,2 UA"): distanze dall'errore stimato (per le lune con l'errore del pianeta), velocità dall'errore stimato (da 2 a 4 cifre), longitudine e latitudine della vista testuale dall'errore angolare visto dal Sole, elementi orbitali dalle incertezze stimate (`docs/METODI.md`), valori fisici dalla loro incertezza o con le cifre della fonte (GM sotto 10⁻³ km³/s² in m³/s²), ΔT e incertezza nella stessa unità; unità degli errori angolari scelta dopo l'arrotondamento, oltre 90° "> 90°". `Intl.NumberFormat` non si usa (raggruppa a 4 cifre in modo diverso tra le lingue e dipende dal browser). Date: giorno prima del mese in entrambe ("19 ottobre 2026", "19 October 2026"); "1°" per il primo del mese solo in italiano ("1 January" in inglese); era dopo l'anno in italiano ("10000 a.C.", "800 d.C.") e, in inglese, "BC" dopo l'anno ("10000 BC") e "AD" prima ("AD 800"); d.C. e AD nella data principale solo fino all'anno 1000. Anni e designazioni non sono mai raggruppati.

### 11.14 Glossario e scrittura

"UA" (inglese "au") con `<abbr>` che riporta l'unità astronomica (simbolo IAU: au); "a.C." (inglese "BC") sempre, "d.C." (inglese "AD") nella data principale solo fino all'anno 1000 e nell'editor sempre; mesi per esteso nella data principale, abbreviati a tre lettere sulle tacche; giorni della settimana in minuscolo; orario a 24 ore; "oggetto transnettuniano" per esteso alla prima occorrenza, poi TNO; verbi all'imperativo nei pulsanti ("Vai", "Riprova", "Inquadra").

## 12. Pipeline dati

### 12.1 Struttura

`scripts/pipeline/`: pacchetti `common/` (costanti, sistemi di riferimento, elementi, scrittura binari), `sats/` (satelliti) e `small/` (piccoli corpi); programmi `time_model.py`, `planets.py`, `moon.py`, `satellites.py`, `small_bodies.py` (eseguito nell'ambiente ASSIST), `stars.py`, `physical.py` (dati fisici e anelli), `textures.py`, `catalog.py`, `reliability_pack.py` (`reliability.bin`), `pack.py` (manifest, budget); `tests/` (pytest). Fixture e validazioni sono sottocomandi dei programmi (ad esempio `planets.py fixture`, `planets.py valida`).

### 12.2 Sorgenti e riproducibilità

- Risposte piccole (SBDB JSON, intestazioni e tabelle Horizons, tabella S15.2020, file IERS, pagine JPL dei parametri fisici, ReadMe dei cataloghi) congelate in `scripts/pipeline/raw/` e versionate.
- File voluminosi (SPK DE441, kernel satellitari, sb441-n16, `linux_m13000p17000.441`, SPK Horizons dei piccoli corpi, cataloghi completi) in `scripts/pipeline/.cache/`, non versionati, con SHA-256 registrato in `raw/manifest-sorgenti.json` (URL, data di estrazione, dimensione, checksum).
- Per ogni piccolo corpo: orbit_id, soln_date, record DASTCOM, data di estrazione, parametri NG.
- Modalità `--offline`: rigenera tutto dai dati congelati e dalla cache verificata.
- Con dati invariati la rigenerazione riscrive file identici byte per byte: `catalog.py` e `pack.py` conservano `generato` e `versioneDati` pubblicati se il resto del contenuto coincide (§ 8.10, § 8.11).
- Richieste sequenziali ai servizi JPL, con pausa di 1 s e ripetizione su errore.

### 12.3 Passi

1. Tempo: ΔT e σ (§ 6.4-6.5), tabella EO (§ 7.7), `time.json`.
2. Pianeti: campionamento DE441, elementi, blocchi, validazione (A4).
3. Luna: stima delle correzioni, `moon.bin`, validazione (A5).
4. Satelliti: kernel, conversione planetocentrica, sistema F, record, estrapolazioni, errori, `sats/`, validazione (A6).
5. Piccoli corpi: SBDB, Horizons, ASSIST, cloni, segmenti, affidabilità, `small/`, validazione (A7).
6. Stelle: BSC5, Hipparcos, associazione HD, `stars.bin`.
7. Catalogo, `reliability.bin`, manifest, controllo del budget.
8. Fixture per i test (TDB; seme fisso registrato).

### 12.4 Qualità della pipeline

pytest per conversioni di elementi (contro Horizons ELEMENTS e VECTORS alle stesse epoche), rotazioni di sistema, scale di tempo, lettura e scrittura dei binari; ruff; versioni fissate in `requirements.txt` e `requirements-assist.txt`.

## 13. Test e criteri di accettazione

Fixture generate in TDB per le effemeridi; le prove in UT usano lo stesso modello di ΔT. Seme casuale fisso e registrato.

| # | Criterio | Soglia |
|---|----------|--------|
| A1 | `npm run check`, `npm run build`, `npm run build:artifact`, pytest, ruff | zero errori e zero avvisi |
| A2 | Calendario | esempi di Meeus (1957-10-04,81 → 2 436 116,31; 333-01-27 12h → 1 842 713,0; -4712-01-01 12h → 0,0); JD_MIN_UT = -1 931 076,5 e JD_MAX_UT_EXCL = 2 495 739,5 dalla funzione; -9999-03-01 → -1 931 017,5; -9998-12-01 → -1 930 377,5; 1582-10-04 giovedì + 1 giorno = 1582-10-15 venerdì; 1500-01-01 giuliano mercoledì; 2000-01-01 → 2 451 544,5; 100 000 andate e ritorno casuali esatte; bisestili -100, 0, 1500, 1600, 1700, 2000, 2100; passi di mese e anno del § 6.6 |
| A3 | ΔT e σ | uguaglianza con le fixture Python entro 1e-6 s; continuità a -720 (salto < 0,01 s), al 2019-2020 e a y_obs; ΔT(-720) = 20 371,85 ± 0,01 s; σ(-9999) = 103 005 s ± 1%; σ(-3000) = 8 978 s ± 1%; confronto con TDB-UT di Horizons registrato in VALIDAZIONE.md |
| A4 | Pianeti contro DE441 | \|Δr\|/r ≤ 2″ su 2000 epoche uniformi per corpo più ±1 passo attorno a ogni confine di blocco; EMB ≤ 100 km (blocchi 11-12) e ≤ 250 km (altri); continuità ai confini < 1 km |
| A5 | Luna contro DE441 | ≤ 60″ e ≤ 50 km su griglia di 0,5 d nell'intero intervallo (pipeline); 2000 epoche più i nodi in Vitest |
| A6 | Satelliti | soglie del § 7.5.6 contro i kernel su 200 epoche per satellite; 20 epoche per satellite contro Horizons (1900-2100) con le stesse soglie; centri dei pianeti ≤ 5 km dai segmenti SPK dove i satelliti sono "precisi" |
| A7 | Piccoli corpi | interpolazione entro la tolleranza del segmento, con un'eccezione dichiarata: C/1680 V1 al perielio del 18/12/1680 (759 km a 0,0062 UA dal Sole, perché il passo minimo di 1/64 d non segue il passaggio al perielio); 50 epoche per corpo contro Horizons nella finestra 1600-2121 ≤ max(500 km, 1e-7·r); salti di giunzione (al 1600 e tra sorgenti) e salti tra record di apparizioni diverse registrati, ≤ ε del corpo a quell'istante (`reliability.bin`, § 7.8.1); perieli di 1P contro Yeomans e Kiang 1981 dal -239 al 1910 entro 2 giorni; ASSIST contro sb441-n16 per Cerere a -7000 ≤ ε(-7000) del corpo senza la tolleranza di rappresentazione (5,0e-4 rad, 103″) |
| A8 | Rotazione terrestre | GST contro fixture Python (ERA - EO) ≤ 0,001° su 200 epoche in tutto l'intervallo; contro ERFA `gmst06` ≤ 0,001° in 1600-2200 e -0,067° ± 0,005° a -10000; longitudine subsolare contro Horizons (1900-2100) ≤ 0,1°; angolo orario del Sole alle 12:00 UT1 = E - 0,9856°·ΔT[d] entro 1° (E tempo vero meno tempo medio) |
| A9 | Eventi noti | congiunzione Giove-Saturno del 21/12/2020: minimo della separazione geocentrica 6,1′ ± 0,5′ tra le 12 e le 24 UT; Apophis 2029-04-13: distanza minima dal centro della Terra e istante entro 500 km e 10 min dai valori JPL CNEOS; novilunio dell'08/04/2024 (eclissi totale): congiunzione geocentrica in longitudine eclittica della data alle 18:21 UT ± 3 min; solstizio del 20/06/2024 20:51 UT: massimo della declinazione geometrica del Sole sull'equatore medio della data entro ±1 h e pari all'obliquità media della data ± 0,01°; perieli di Halley 1910 e 1986 entro 0,5 d |
| A10 | Scala reale | raggi di impostori e marcatori risolti uguali al catalogo (errore relativo < 1e-9); nessun fattore di scala nel grafo di scena |
| A11 | Contrasti e colore base | ricalcolo dai token e dai colori disegnati nella scena (`src/render/costanti.ts`): testo ≥ 4,5:1, elementi non testuali ≥ 3:1, nei casi peggiori del § 11.1; tinta dei token verdi e dei colori verdi della scena tra 150° e 160° |
| A12 | Riadattamento | Playwright a 320, 400, 640 (scala 2, cioè 1280 × 1024 al 200 %), 690 (pieghevole aperto, 690 × 829), 768, 1280 px, con il layout atteso (telefono fino a 699 px, tablet da 700 px) e a 699 e 700 px di larghezza (altezza ≥ 480 px) e 699 × 479 (orizzontale) per la soglia: `scrollWidth ≤ clientWidth`; controlli ≥ 16 px dai bordi; destinazioni ≥ 44 px (tocco) e ≥ 24 px (desktop) |
| A13 | Solo tastiera | 4 ottobre 1582 + 1 giorno = 15 ottobre, venerdì; Marte trovato dalla ricerca e inquadrato; "Fonti e metodi" chiusa con Esc e focus restituito |
| A14 | Preferenze di sistema | `emulateMedia` con `reducedMotion` e `forcedColors`: nessuna animazione, focus visibile |
| A15 | axe-core | nessuna violazione "serious" o "critical" sulle regole WCAG 2.2 A e AA; nessun contenuto fuori dai landmark (regola `region`), un `main` e un `h1` |
| A16 | Validazione date | messaggi del § 11.4.2 per anno 0, 29 febbraio, 5-14 ottobre 1582, limiti con UTC+2 |
| A17 | Live region | in riproduzione, anche con "Segui l'ora attuale", nessun annuncio dovuto al tempo (data che avanza, caricamento dei dati); annuncio di ogni azione esplicita dell'utente: selezione da Trova, catalogo e mappa, risultati e "Nessun corpo per ..." di Trova, filtri, livelli, vista testuale, attivazione e disattivazione dell'opzione, anche implicita (passo, "Adesso", regolo, editor, ingresso in TT: "disattivato" in un solo annuncio con la data o il limite); arresto della riproduzione per l'errore di un blocco ("Riproduzione in pausa: dati non caricati") |
| A18 | Rete e console | nessuna richiesta verso host diversi dall'origine e da Google Fonts (`page.on('request')`); nessun dialog (`page.on('dialog')`); funzionamento con localStorage che lancia eccezioni; nessun `console.error` o `console.warn` |
| A19 | Caricamento | con `page.route`: ritardi → stato "caricamento" e corpi nascosti; 404 e richieste senza risposta per 30 s → messaggio e "Riprova" funzionante; mai posizioni estrapolate |
| A20 | Precisione del rendering | Vitest con emulazione Float32 (`Math.fround`): distanza schermo tra corpo e propria orbita < 0,5 px per ogni corpo su 50 date, camera da 3 raggi a 1e5 UA, viewport 1920×1080 e 400×800; in riproduzione (1 e 7 giorni simulati al secondo, dati pubblicati, Sole davanti al piano della camera, cometa selezionata) < 1 px per la Luna e per le lune di Giove e Saturno; e2e: camera a 10 km da Itokawa, oscillazione < 0,1 px tra frame; occlusione: Luna dietro la Terra e Io dietro Giove non visibili (campionamento di pixel); silhouette degli impostori < 0,5 px a quota 0,01 R |
| A21 | Prestazioni | stati, orbite ed etichette di tutti i corpi ≤ 4 ms per frame (benchmark Node sulla macchina di riferimento); in e2e con SwiftShader il tempo per frame è solo registrato |
| A22 | Dati | schema JSON di catalogo e manifest; unicità di ssid e slug; copertura temporale per corpo; esistenza e SHA-256 dei file; budget del § 8.1 |
| A23 | Lingua e testi | `html lang` uguale alla lingua attiva (`it` o `en`); nessuna stringa visibile fuori da `testi.it.ts` e `testi.en.ts`; stesse chiavi nelle due lingue; nessun U+2014 nel repository (`grep`) |
| A24 | Pagina pubblicata | frammento avvolto in uno scheletro minimo e servito da percorso annidato senza barra finale (`/a/b/index.html`): caricamento completo, zero richieste esterne, `#marte` funzionante |
| A25 | Orbite | orbite iperboliche senza periodo; Urano: piano degli anelli e dei satelliti coerenti; Terra antioraria vista da +z; la Luna rivolge alla Terra lo stesso emisfero (± librazione ottica); a 12:00 UT negli anni 1900-2100 la longitudine 0 della texture terrestre è rivolta al Sole entro ±5° |
| A26 | Documentazione | METODI.md, VALIDAZIONE.md (risultati di A3-A9), DEBUG.md, LICENZE.md, SPIKE.md presenti e coerenti con il codice |

Uscita dal debug: zero segnalazioni critiche o alte aperte e due cicli consecutivi senza nuove segnalazioni, con registro in `docs/DEBUG.md`.

## 14. Piano di lavoro

### 14.1 Fasi e cancelli

| Fase | Contenuto | Cancello di uscita |
|------|-----------|--------------------|
| F0 | Progetto 2.0 | approvazione del documento |
| F1 | Spike S1-S6 (§ 14.2) | risultati in `docs/SPIKE.md`; formato dei dati v1 congelato |
| F2 | Pipeline e fixture | A3-A7 superati in Python; budget rispettato |
| F3 | In parallelo a F2: moduli runtime (tempo, effemeridi, dati) su fixture e un `EphemerisService` fittizio con la stessa interfaccia; rendering; interfaccia | test unitari verdi; A10-A12 su dati fittizi |
| F4 | Integrazione, build, pacchetto a pagina singola | A1, A18, A22, A24 |
| F5 | Debug: errori formali, di dati e logici, con verifica indipendente di ogni segnalazione | criterio di uscita del § 13 |
| F6 | Rapporto di validazione e pubblicazione | A26 |

### 14.2 Spike (tempo massimo indicato)

- S1 Luna (4 h): spline di Hermite delle correzioni su tutto l'intervallo; verifica di 60″ su griglia di 0,5 d; utilità di κ; confronto dell'ipotesi I11 con Park et al. 2021.
- S2 ASSIST (6 h): installazione con rebound 4.6.0; Cerere contro sb441-n16; Halley con il record -239 contro Horizons; Apophis nel 2029 contro Horizons; comportamento prima di -7999 senza asteroidi; supporto di DT; tempi per 16 e 64 cloni.
- S3 Satelliti (6 h): record per Io, Mimas, Iperione, Tritone, Nereide, Caronte; scelta di L e K; equivalenza tra estrapolazione secolare e kernel lunghi.
- S4 Budget (3 h): dimensioni reali dei blocchi planetari; campionamento dei piccoli corpi per Cerere, Halley, Apophis, Sedna, 3I; stima del totale.
- S5 Rendering (6 h): impostore con log depth e texture, orbita ancorata, emulazione Float32, prestazioni con SwiftShader.
- S6 Pagina singola (2 h): pagina minima servita in locale dentro uno scheletro che emula quello della piattaforma, con script modulo relativo, fetch di un `.bin`, localStorage che lancia eccezioni, `#token`, safe-area a 400 px.

### 14.3 Stime

SBDB e Horizons: meno di 30 minuti (circa 100 richieste SPK di circa 3 s più i controlli). Integrazioni ASSIST: da 1 a 3 ore su 4 CPU, da confermare in S2. Download: kernel satellitari circa 26 GB complessivi (circa 19 GB i kernel lunghi), DE441 binario 2,6 GB, sb441-n16 0,6 GB; i kernel satellitari si elaborano uno alla volta (file più grande circa 2,1 GB; spazio libero circa 26 GB).

## 15. Rischi

| Rischio | Mitigazione |
|---------|-------------|
| Budget dei piccoli corpi oltre 12 MB | Tolleranze legate all'affidabilità, nessun dato dove "non determinabile", misura in S4; ripiego: tolleranza 1e-4·r prima del -2000, dichiarata |
| Download e spazio per i kernel satellitari lunghi | Elaborazione sequenziale con eliminazione; verifica in S3 dell'equivalenza con l'estrapolazione secolare |
| ASSIST incompatibile con rebound 5 | Ambiente virtuale separato con rebound 4.6.0 |
| Instabilità di Keplero per e vicino a 1 | Rappresentazione cartesiana per e > 0,98; test sui casi limite |
| Precisione Float32 in GPU | Origine sul corpo a fuoco, orbite ancorate, shader in spazio vista, test A20 |
| Comportamento della pagina pubblicata | Verifica locale S6 e criterio A24; correzioni ripubblicate sullo stesso indirizzo |
| Disponibilità di servizi esterni (HMNAO restituiva 503) | Dati congelati nel repository; per la tabella S15.2020, copia alternativa distribuita con Skyfield 1.55, verificata sui valori di controllo (ΔT(-720) = 20 371,848 s) |
| Licenze delle texture | Solo pubblico dominio o CC BY con attribuzione; nessuna texture di fantasia |
| Limiti di frequenza delle API JPL | Richieste sequenziali, cache, congelamento |
| Prestazioni su mobile | Rendering su richiesta, pixel ratio ≤ 2, texture ≤ 2048 px |

## 16. Fonti

### 16.1 Fonti primarie

- Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441, The Astronomical Journal 161:105, doi:10.3847/1538-3881/abd414.
- Archinal, B. A. et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015, Celestial Mechanics and Dynamical Astronomy 130:22, doi:10.1007/s10569-017-9805-5; correzione: Celest. Mech. Dyn. Astr. 131:61 (2019), doi:10.1007/s10569-019-9925-1.
- Vondrák, J., Capitaine, N., Wallace, P. (2011), New precession expressions, valid for long time intervals, Astronomy & Astrophysics 534, A22, doi:10.1051/0004-6361/201117274; corrigendum A&A 541, C1 (2012), doi:10.1051/0004-6361/201117274e.
- Stephenson, F. R., Morrison, L. V., Hohenkerk, C. Y. (2016), Measurement of the Earth's rotation: 720 BC to AD 2015, Proc. R. Soc. A 472:20160404, doi:10.1098/rspa.2016.0404.
- Morrison, L. V., Stephenson, F. R., Hohenkerk, C. Y., Zawilski, M. (2021), Addendum 2020 to "Measurement of the Earth's rotation: 720 BC to AD 2015", Proc. R. Soc. A 477:20200776, doi:10.1098/rspa.2020.0776; tabella S15.2020 (HMNAO, http://astro.ukho.gov.uk/nao/lvm/).
- Morrison, L. V., Stephenson, F. R. (2004), Historical values of the Earth's clock error ΔT and the calculation of eclipses, Journal for the History of Astronomy 35, 327-336.
- Huber, P. J. (2000), Modeling the length of day and extrapolating the rotation of the Earth, in Astronomical Amusements (Bonoli, De Meis, Panaino eds.), Roma.
- Stephenson, F. R., Houlden, M. A. (1986), Atlas of Historical Eclipse Maps: East Asia 1500 BC - AD 1900, Cambridge University Press.
- Espenak, F., Meeus, J. (2006), Five Millennium Canon of Solar Eclipses: -1999 to +3000, NASA/TP-2006-214141; sezione sull'incertezza di ΔT anche in https://eclipse.gsfc.nasa.gov/SEhelp/uncertainty2004.html.
- McCarthy, D. D., Luzum, B. J. (2003), An abridged model of the precession-nutation of the celestial pole, Celestial Mechanics and Dynamical Astronomy 85, 37-49 (nutazione IAU 2000B).
- U.S. Naval Observatory, Astronomical Applications API, "Earth's Seasons": https://aa.usno.navy.mil/api/seasons (istanti di equinozi e solstizi per la validazione).
- Petit, G., Luzum, B. (eds.) (2010), IERS Conventions (2010), IERS Technical Note 36, https://iers-conventions.obspm.fr/content/tn36.pdf.
- IERS, serie EOP 20 C04: https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now (centro di produzione EOP, Osservatorio di Parigi); la copia https://datacenter.iers.org/data/latestVersion/EOP_20_C04_one_file_1962-now.txt era ferma al 2025-05-05 il 18/10/2026. TAI - UTC: https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat; prima del 1972 https://maia.usno.navy.mil/ser7/tai-utc.dat (USNO, coefficienti uguali a https://hpiers.obspm.fr/eoppc/bul/bulc/UTC-TAI.history). Validazione di σ(ΔT): USNO, https://maia.usno.navy.mil/ser7/historic_deltat.data; IERS Rapid Service/Prediction Centre, https://datacenter.iers.org/data/latestVersion/finals.daily.iau2000.txt (consultati il 19/10/2026).
- Chapront-Touzé, M., Chapront, J. (1983), The lunar ephemeris ELP 2000, A&A 124, 50; Chapront-Touzé, M., Chapront, J. (1988), ELP 2000-85, A&A 190, 342.
- Williams, J. G., Boggs, D. H. (2016), Secular tidal changes in lunar orbit and Earth rotation, Celestial Mechanics and Dynamical Astronomy 126, 89.
- Broucke, R. A., Cefola, P. J. (1972), On the equinoctial orbit elements, Celestial Mechanics 5, 303, doi:10.1007/BF01228432.
- Holman, M. J. et al. (2023), ASSIST: an ephemeris-quality test-particle integrator, Planetary Science Journal 4:69.
- Rein, H., Liu, S.-F. (2012), REBOUND, A&A 537, A128, doi:10.1051/0004-6361/201118085; Rein, H., Spiegel, D. S. (2015), IAS15, MNRAS 446, 1424, doi:10.1093/mnras/stu2164; Pham, D., Rein, H., Spiegel, D. S. (2024), Open Journal of Astrophysics 7, doi:10.21105/astro.2401.02849.
- Marsden, B. G., Sekanina, Z., Yeomans, D. K. (1973), Comets and nongravitational forces V, The Astronomical Journal 78, 211.
- Farnocchia, D. (2021), JPL IOM 392R-21-005 (sb441-n16).
- Yeomans, D. K., Kiang, T. (1981), The long-term motion of comet Halley, MNRAS 197, 633.
- Muñoz-Gutiérrez, M. A., Reyes-Ruiz, M., Pichardo, B. (2015), Chaotic dynamics of comet 1P/Halley, MNRAS 447, 3775.
- Lainey, V. et al. (2009), Strong tidal dissipation in Io and Jupiter from astrometric observations, Nature 459, 957.
- Jacobson, R. A. (2022), AJ 164:199, doi:10.3847/1538-3881/ac90c9; Jacobson, R. A., Park, R. S. (2025), AJ 169:65, doi:10.3847/1538-3881/ad99d1; Brozović, M., Jacobson, R. A. (2024), AJ 167:256, doi:10.3847/1538-3881/ad39f0; Brozović, M., Jacobson, R. A., Park, R. S. (2025), AJ 170:42, doi:10.3847/1538-3881/addab4.
- Jacobson, R. A. (2009), The orbits of the Neptunian satellites and the orientation of the pole of Neptune, AJ 137, 4322, doi:10.1088/0004-6256/137/5/4322; Tremaine, S., Touma, J., Namouni, F. (2009), Satellite dynamics on the Laplace surface, AJ 137, 3706, doi:10.1088/0004-6256/137/3/3706.
- Holler, B. J., Grundy, W. M., Buie, M. W., Noll, K. S. (2021), Icarus 355, 114130, doi:10.1016/j.icarus.2020.114130; Brown, M. E., Butler, B. J. (2023), The Planetary Science Journal 4:193, doi:10.3847/PSJ/ace52a.
- Wisdom, J., Peale, S. J., Mignard, F. (1984), The chaotic rotation of Hyperion, Icarus 58, 137; Thomas, P. C. et al. (2007), Nature 448, 50.
- Prša, A. et al. (2016), Nominal values for selected solar and planetary quantities: IAU 2015 Resolution B3, AJ 152:41, doi:10.3847/0004-6256/152/2/41.
- Nimmo, F. et al. (2017), Icarus 287, 12; Sicardy, B. et al. (2011), Nature 478, 493, doi:10.1038/nature10550; Szakáts, R. et al. (2023), A&A 669, L3, doi:10.1051/0004-6361/202245234; Ortiz, J. L. et al. (2012), Nature 491, 566, doi:10.1038/nature11597; Ortiz, J. L. et al. (2017), Nature 550, 219, doi:10.1038/nature24051; Ragozzine, D., Brown, M. E. (2009), AJ 137, 4766, doi:10.1088/0004-6256/137/6/4766; Kiss, C. et al. (2019), Icarus 334, 3, doi:10.1016/j.icarus.2019.03.013; Pereira, C. L. et al. (2023), A&A 673, L4, doi:10.1051/0004-6361/202346365; Kilic, Y. et al. (2026), A&A 707, A70, doi:10.1051/0004-6361/202557970; Pál, A. et al. (2012), A&A 541, L6, doi:10.1051/0004-6361/201218874; Fornasier, S. et al. (2013), A&A 555, A15, doi:10.1051/0004-6361/201321329; Lellouch, E. et al. (2013), A&A 557, A60, doi:10.1051/0004-6361/201322047; Müller, T., Lellouch, E., Fornasier, S. (2020), Trans-Neptunian objects and Centaurs at thermal wavelengths, in The Trans-Neptunian Solar System, Elsevier, 153-181, doi:10.1016/B978-0-12-816490-7.00007-2 (arXiv:1905.07158); Vilenius, E. et al. (2012), A&A 541, A94, doi:10.1051/0004-6361/201118743; Spencer, J. R. et al. (2020), Science 367, eaay3999, doi:10.1126/science.aay3999; Meech, K. J. et al. (2017), Nature 552, 378, doi:10.1038/nature25020; Micheli, M. et al. (2018), Nature 559, 223, doi:10.1038/s41586-018-0254-4; Jewitt, D. et al. (2020), ApJL 888:L23, doi:10.3847/2041-8213/ab621b; Jewitt, D. et al. (2025), ApJL 990:L2, doi:10.3847/2041-8213/adf8d8.
- Morgado, B. E. et al. (2021), A&A 652, A141, doi:10.1051/0004-6361/202141543; Rommel, F. L. et al. (2023), A&A 678, A167, doi:10.1051/0004-6361/202346892; Daly, R. T. et al. (2023), Nature 616, 443, doi:10.1038/s41586-023-05810-5; Thomas, P. C. et al. (2013), Icarus 222, 550, doi:10.1016/j.icarus.2012.05.034; A'Hearn, M. F. et al. (2011), Science 332, 1396, doi:10.1126/science.1204054; Collyer, C. et al. (2025), The Planetary Science Journal 6, 270, doi:10.3847/PSJ/ae0b6a; Pätzold, M. et al. (2016), Nature 530, 63, doi:10.1038/nature16535; Fujiwara, A. et al. (2006), Science 312, 1330, doi:10.1126/science.1125841; Brown, M. E. et al. (2010), AJ 139, 2700, doi:10.1088/0004-6256/139/6/2700; Braga-Ribas, F. et al. (2025), Phil. Trans. R. Soc. A 383, 20240200, doi:10.1098/rsta.2024.0200; Fang, J. et al. (2012), AJ 144, 70, doi:10.1088/0004-6256/144/2/70; Vernazza, P. et al. (2020), Nature Astronomy 4, 136, doi:10.1038/s41550-019-0915-8; Hanuš, J. et al. (2020), A&A 633, A65, doi:10.1051/0004-6361/201936639; Berthier, J. et al. (2014), Icarus 239, 118, doi:10.1016/j.icarus.2014.05.046; Kiss, C. et al. (2016), MNRAS 457, 2908, doi:10.1093/mnras/stw081; Weaver, H. A. et al. (2016), Science 351, aae0030, doi:10.1126/science.aae0030; Pilcher, F., Mottola, S., Denk, T. (2012), Icarus 219, 741, doi:10.1016/j.icarus.2012.03.021.
- Ortiz, J. L. et al. (2003), A&A 409, L13, doi:10.1051/0004-6361:20031253; Pál, A. et al. (2016), AJ 151, 117, doi:10.3847/0004-6256/151/5/117; Buie, M. W. et al. (2015), AJ 149, 113, doi:10.1088/0004-6256/149/3/113; Grundy, W. M. et al. (2018), Icarus 305, 198, doi:10.1016/j.icarus.2018.01.009; Marchis, F. et al. (2014), ApJL 783, L37, doi:10.1088/2041-8205/783/2/L37; Brown, M. E. et al. (2021), The Planetary Science Journal 2, 170, doi:10.3847/PSJ/ac07b0.
- Mallama, A., Krobusek, B., Pavlov, H. (2017), Comprehensive wide-band magnitudes and albedos for the planets, Icarus 282, 19-33, doi:10.1016/j.icarus.2016.09.023; Buratti, B. J. et al. (2015), ApJL 804, L6, doi:10.1088/2041-8205/804/1/L6; Fornasier, S. et al. (2015), A&A 583, A30, doi:10.1051/0004-6361/201525901; Harmon, J. K. et al. (1997), Science 278, 1921, doi:10.1126/science.278.5345.1921.
- Hoffleit, D., Warren, W. H. Jr. (1991), The Bright Star Catalogue, 5th Revised Ed. (Preliminary Version), NASA ADC, VizieR V/50; van Leeuwen, F. (2007), Validation of the new Hipparcos reduction, A&A 474, 653 (VizieR I/311); ESA (1997), The Hipparcos Catalogue (VizieR I/239).
- Ballesteros, F. J. (2012), New insights into black bodies, EPL 97, 34008, doi:10.1209/0295-5075/97/34008; CIE 015:2018, Colorimetry, 4th ed.; Wyman, C., Sloan, P.-P., Shirley, P. (2013), Simple analytic approximations to the CIE XYZ color matching functions, Journal of Computer Graphics Techniques 2(2), 1.
- Machado, G. M., Oliveira, M. M., Fernandes, L. A. F. (2009), IEEE TVCG 15(6), 1291, doi:10.1109/TVCG.2009.113; Sharma, G., Wu, W., Dalal, E. N. (2005), Color Research & Application 30(1), 21, doi:10.1002/col.20070.
- IAU (2012), Resolution B2 on the re-definition of the astronomical unit of length; IAU (2006), Resolution B5 (definizione di pianeta): https://www.iau.org/Iau/Publications/List-of-Resolutions.
- W3C (2024), Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation 12 dicembre 2024, https://www.w3.org/TR/WCAG22/; W3C, WAI-ARIA Authoring Practices Guide (slider, combobox, dialog); Khronos, WebGL 2.0 Specification; WHATWG HTML Living Standard (microsintassi delle date, elemento dialog); ECMA-262 (valori temporali).
- BIPM (2019), The International System of Units, 9ª ed., § 5.4.4.

### 16.2 Strumenti, compilazioni e servizi

- JPL Horizons, manuale e API: https://ssd.jpl.nasa.gov/horizons/manual.html, https://ssd-api.jpl.nasa.gov/doc/horizons.html.
- JPL Small-Body Database API: https://ssd-api.jpl.nasa.gov/doc/sbdb.html.
- Minor Planet Center, Identifier API (nomi e designazioni dei pianetini numerati, nomi delle comete periodiche numerate): https://docs.minorplanetcenter.net/mpc-ops-docs/apis/query-identifier/.
- IAU Comet-Naming Guidelines (WGSBN, Minor Planet Center), art. 5.5: https://www.minorplanetcenter.net/iau/info/CometNamingGuidelines.html.
- JPL "Planetary Physical Parameters" (https://ssd.jpl.nasa.gov/planets/phys_par.html), "Planetary Satellite Physical Parameters" (https://ssd.jpl.nasa.gov/sats/phys_par/), costanti astrodinamiche (https://ssd.jpl.nasa.gov/astro_par.html).
- NAIF, kernel generici: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/ e .../spk/satellites/ (sommario `aa_summaries.txt`).
- File sb441-n16: https://ssd.jpl.nasa.gov/ftp/eph/small_bodies/asteroids_de441/sb441-n16.bsp.
- PDS Ring-Moon Systems Node: https://pds-rings.seti.org/saturn/saturn_tables.html, https://pds-rings.seti.org/uranus/uranus_tables.html.
- USGS Astrogeology, mosaici planetari: https://planetarymaps.usgs.gov/mosaic/; NASA SVS 4720; NASA Photojournal PIA07782; NASA Blue Marble Next Generation.
- VizieR (doi:10.26093/cds/vizier).
- Meeus, J. (1998), Astronomical Algorithms, 2ª ed., Willmann-Bell (cap. 7, 47).
- ERFA (Essential Routines for Fundamental Astronomy), usata come riferimento nei test.

### 16.3 Licenze

`docs/LICENZE.md` e la finestra "Fonti e metodi" riportano licenza e credito per librerie (three: MIT, © 2010-2025 three.js authors, con avviso di copyright e testo del permesso distribuiti nel bundle e in `assets/LICENZE.txt`; jplephem: MIT; ASSIST, REBOUND: GPL-3.0, usati solo nella pipeline e non distribuiti con il sito), dati (JPL/NASA; mosaici USGS: pubblico dominio o uso libero con citazione degli autori, secondo la scheda Astropedia, `docs/LICENZE.md` § 3-4; VizieR con citazione; uso divulgativo non commerciale), texture (NASA con credito, mosaici USGS come sopra, Solar System Scope con CC BY 4.0) e font (SIL OFL 1.1).
