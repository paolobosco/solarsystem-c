# Revisione del progetto: registro delle decisioni

Oggetto: `docs/PROGETTO.md`, dalla versione 1.0 alla versione 2.0. Data: 18/10/2026.

## 1. Metodo

- Cinque revisioni indipendenti, una per prospettiva: dati astronomici (DA), architettura e rendering (AR), interfaccia e accessibilità (UI), fattibilità e completezza (FC), fonti e conformità (FO).
- Identificativo di ogni segnalazione: prefisso della prospettiva più codice del revisore (es. DA-SAT-01). Codici uguali in prospettive diverse sono segnalazioni distinte.
- Decisioni possibili: accolta; accolta con modifiche (problema riconosciuto, soluzione diversa o parziale); respinta.
- Le affermazioni determinanti o contestabili sono state verificate in modo indipendente (§ 4). Dove una verifica non è stata ripetuta, la motivazione lo dichiara e indica su cosa si fonda la decisione.

## 2. Riepilogo

| Prospettiva | Segnalazioni | Accolte | Accolte con modifiche | Respinte |
|-------------|--------------|---------|------------------------|----------|
| Dati astronomici (DA) | 21 | 10 | 11 | 0 |
| Architettura e rendering (AR) | 20 | 11 | 9 | 0 |
| Interfaccia e accessibilità (UI) | 25 | 20 | 5 | 0 |
| Fattibilità e completezza (FC) | 20 | 11 | 9 | 0 |
| Fonti e conformità (FO) | 16 | 11 | 5 | 0 |
| Totale | 102 | 63 | 39 | 0 |

Nessuna segnalazione è stata respinta per intero. Due affermazioni contenute in segnalazioni accolte con modifiche sono risultate non confermate dalla verifica (FC-TEMPO-02 punto c; FC-LUNA-01, obiettivo "non dimostrato"): le relative motivazioni lo riportano.

Segnalazioni duplicate tra prospettive, trattate con un'unica modifica: JD del limite superiore (DA-CAL-02, AR-TIME-01, UI-UX-01, FC-DATI-01, FO-DATI-01); algoritmo di calendario con JD negativi (DA-CAL-01, FC-TEMPO-01); satelliti (DA-SAT-01, FC-SAT-01, FO-DATI-03, FO-DATI-05); ΔT (DA-TEMPO-01, FC-TEMPO-02, FO-DATI-02); integrazione dei piccoli corpi (DA-PICC-01, FC-EFF-01); comete per apparizione (DA-PICC-05, FC-COM-01); Disnomia (DA-SAT-02, FO-DATI-06); stato nell'URL (AR-URL-01, UI-UX-21, FC-PUB-01, FO-CONF-01).

## 3. Registro

| ID | Prospettiva | Gravità | Sintesi | Decisione | Motivazione | Sezione v2 |
|----|-------------|---------|---------|-----------|-------------|------------|
| DA-SAT-01 | Dati astronomici | critico | Elementi medi JPL dei satelliti inutilizzabili come sorgente di posizioni | Accolta con modifiche | Avvertenza JPL verificata sulla pagina; Horizons non serve i satelliti fuori dalle finestre moderne (verificato). Si adottano SPK moderni e lunghi con modello a ellisse precessante a record. Non si adottano integrazioni o teorie analitiche per Giove e Marte prima del 1600: la fase oltre l'orizzonte è dichiarata "non determinabile" (I12) | 4.1, 7.5, 8.5, A6 |
| DA-TEMPO-01 | Dati astronomici | alto | ΔT sottospecificato: salto a -720, futuro indefinito, incertezza sottostimata | Accolta con modifiche | Valori verificati (S15(-720) = 20 371,848 s; parabola SMH 20 730,3 s). Prima di -720 si adotta la parabola di Horizons più un offset di continuità (scarto 0,49 s) invece di una nuova parabola; futuro con curvatura mareale; σ(ΔT) da Morrison e Stephenson 2004 e Huber 2000; fixture in TDB | 6.4, 6.5, A3 |
| DA-ROT-01 | Dati astronomici | alto | Verifica "Greenwich verso il Sole ±5° alle 12 UT" logicamente errata | Accolta con modifiche | Ragionamento confermato. Test numerico contro ERFA a 0,001°; controllo di plausibilità con tolleranza 1° anziché 0,1°, perché la definizione del Sole medio a epoche remote non è univoca; verifica ±5° limitata al 1900-2100 come test di convenzione | 7.7, A8, A25 |
| DA-CAL-01 | Dati astronomici | alto | Meeus cap. 7 con troncamento non vale per JD negativi | Accolta | Verificato: -9999-03-01 dà -1 931 016,5 con troncamento, -1 931 017,5 con parte intera per difetto | 6.1, 5.4, A2 |
| DA-CAL-02 | Dati astronomici | medio | JD del limite superiore errato di un giorno | Accolta | Verificato: 2121-01-01 = JD 2 495 739,5 | I2, 5.4, A2 |
| DA-PICC-01 | Dati astronomici | alto | N-corpi REBOUND autonomo deriva da DE441; mancano NG e Yarkovsky | Accolta con modifiche | Si adotta ASSIST con DE441 e sb441-n16. ASSIST 1.2.3 richiede rebound < 5 (verificato in setup.py): ambiente virtuale separato con rebound 4.6.0; DE441 nel formato binario a copertura completa. Deriva non rimisurata: due misure indipendenti dei revisori concordano | 5.2, 7.6.1, A7 |
| DA-PICC-02 | Dati astronomici | medio | Sei asteroidi già in sb441-n16, coerente con DE441 dal -7999 | Accolta | Catena dei sommari DAF letta: 16 corpi, JD -1 200 525,5 / 5 008 242,5. Estesa a 11 corpi del catalogo presenti nel file | 7.6.1 |
| DA-PICC-03 | Dati astronomici | medio | Dispersione in longitudine non misura la predicibilità; cloni non definiti | Accolta con modifiche | Cloni dalla covarianza SBDB con NG; metrica con angolo, \|Δr\|/r e anomalia media, 95° percentile, cumulata in modo monotono; 64 cloni per corpi caotici e 16 per gli altri, con arresto al livello "non determinabile" per contenere i tempi | 7.6.2 |
| DA-PICC-04 | Dati astronomici | medio | Corpi lontani: elementi eliocentrici instabili, zoom insufficiente | Accolta | Velocità iperboliche ricalcolate dai dati SBDB citati. Rappresentazione cartesiana oltre 50 UA, elementi baricentrici per scheda e orbita, zoom fino a 2·10⁵ UA | 7.6.3, 7.6.5, RF1 |
| DA-PICC-05 | Dati astronomici | medio | Comete periodiche: soluzioni per apparizione e validazione storica | Accolta con modifiche | Verificato: 1P ha 30 record dal -239 al 1968. Sequenza dei record con cambio all'afelio (unificata con FC-COM-01); validazione dei perieli di Halley con Yeomans e Kiang 1981 | 7.6.1, A7 |
| DA-LUNA-01 | Dati astronomici | medio | Calibrazione lunare fattibile; mancano catena di riferimento e continuità | Accolta | Calibrazione rieseguita a -9999: 49,0″ massimo, 34,1 km. Catena con Vondrák, spline di Hermite C1, fattore κ su E | 7.4, 8.4, A5 |
| DA-PIAN-01 | Dati astronomici | medio | Tolleranza angolare insufficiente per l'EMB negli incontri ravvicinati | Accolta con modifiche | Verificato: EMB 0,324″ (234 km) a 32 d, 0,033″ (24 km) a 16 d. Passo 16 d solo nei blocchi 11-12 (circa 1010-2121), dove avvengono gli incontri con NEA a posizione determinata; 32 d altrove; tolleranze in km | 7.3.3, 7.3.4, A4 |
| DA-PIAN-02 | Dati astronomici | basso | Raccordo tra i due SPK, stencil ai confini, μ non dichiarato | Accolta | Regola per campione al JD 2 440 416,5; aloni di 4 campioni; copertura in TDB con margine; μ dichiarato | 7.1, 7.3.1, 8.1, 8.3 |
| DA-PIAN-03 | Dati astronomici | basso | Formula dei centri senza divisore; usare i segmenti SPK | Accolta con modifiche | Formula corretta con GM_sistema. A runtime si usa la formula con i satelliti del catalogo, per coerenza con le lune mostrate; i segmenti SPK servono alla validazione (≤ 5 km) | 7.3.5, A6 |
| DA-STELLE-01 | Dati astronomici | medio | Moto proprio lineare su 12 000 anni sbaglia di gradi | Accolta con modifiche | Moto 3D rettilineo (modello di ERFA starpm) con astrometria Hipparcos 2007 e velocità radiali BSC5; ripiego lineare angolare dichiarato. Scostamenti numerici del revisore non ricalcolati: la decisione segue dal modello standard | 8.8, 9 |
| DA-ROT-02 | Dati astronomici | medio | Poli IAU estrapolati, polo di Urano, rotazioni non sincrone | Accolta | Poli e fasi "indicativi" fuori da 1600-2121; campo `convenzionePolo`; Iperione escluso dalla rotazione sincrona; correzione WGCCRE 2019 citata | 7.5.5, 7.7, 8.10 |
| DA-MANC-01 | Dati astronomici | medio | Mancano ipotesi su posizioni geometriche e scala di tempo | Accolta | Ipotesi aggiunta: posizioni geometriche in TDB, tempo luce informativo | I6, I7 |
| DA-AFF-01 | Dati astronomici | medio | Affidabilità senza incertezze delle sorgenti e senza peso di ΔT | Accolta con modifiche | ε_tot combina modello e ΔT. DE441 resta l'unica effemeride (nessun raccordo con DE440), con differenza dichiarata trascurabile; incertezze intrinseche come ipotesi esplicite | I10, I11, 7.8 |
| DA-RIF-01 | Dati astronomici | basso | Eclittica J2000 contro eclittica della data; bias non dichiarato | Accolta | Griglia etichettata J2000; eclittica della data facoltativa; bias trascurato dichiarato | I4, 7.7, RF5 |
| DA-PICC-06 | Dati astronomici | basso | Scaricare vettori invece di elementi; registrare la soluzione | Accolta con modifiche | Si scaricano SPK Horizons (tipo 21, letti con spiceypy) anziché vettori testuali; identificativo di soluzione e data registrati | 7.6.1, 8.10, 12.2 |
| DA-SAT-02 | Dati astronomici | basso | Disnomia assente dalla tabella JPL | Accolta | Verificato: assente. Inclusa con l'orbita di Holler et al. 2021 | 4.4, 7.5.1, 7.5.4 |
| AR-ARCH-01 | Architettura e rendering | alto | Contratti tra moduli non definiti | Accolta | Interfacce, unità, assi, ordine per frame, regole ESLint | 5.4, 5.5 |
| AR-PREC-01 | Architettura e rendering | alto | Orbite: jitter Float32 ed errore di corda | Accolta | Spaziature Float32 e frecce ricalcolate (16 km a 1 UA; 2 816 km con 512 punti). Orbite ancorate al corpo con raffinamento geometrico e test a 0,5 px | 10.2, A20 |
| AR-LOAD-01 | Architettura e rendering | alto | Caricamento su richiesta senza macchina a stati | Accolta | Stati per risorsa, LRU, prefetch, annullamento, sospensione della riproduzione, nessuna estrapolazione | 5.4, 5.6, A19 |
| AR-BUILD-01 | Architettura e rendering | alto | Variante per la pubblicazione non specificata | Accolta con modifiche | La versione bloccata è Vite 7.3.7 (Rollup 4, verificato): si usa `rollupOptions.output.inlineDynamicImports` invece di `rolldownOptions.codeSplitting` | 5.7, A24 |
| AR-PREC-02 | Architettura e rendering | medio | Camera fissa all'origine in conflitto con OrbitControls | Accolta | Origine sul corpo a fuoco, `setOrigin()`, shader in spazio vista | 10.1 (R2, R3) |
| AR-PREC-03 | Architettura e rendering | medio | Depth logaritmico senza near/far e regole per shader | Accolta | Near 1e-5 km, far 1e15 km, chunk logdepthbuf obbligatori, stelle in scena separata | 10.1 (R4, R8), A20 |
| AR-PREC-04 | Architettura e rendering | medio | Sfere poligonali visibili a zoom ravvicinato | Accolta | Impostori di ellissoide (scelta preferita dal revisore), test di silhouette | 10.1 (R5), 10.3, A20 |
| AR-CONV-01 | Architettura e rendering | medio | Convenzioni di assi, longitudini e texture | Accolta con modifiche | Campi lon0_u e verso, funzione unica `bodyFixedToScene`; test del meridiano a mezzogiorno limitato al 1900-2100 per coerenza con DA-ROT-01 | 8.10, 10.1 (R10), A25 |
| AR-DATA-01 | Architettura e rendering | medio | Formato dei blocchi planetari non specificato | Accolta con modifiche | Formato binario completo. Al posto della regola di riavvolgimento di λ, residui Float32 rispetto a riferimenti Float64 (a0, λ0, n), più semplici e più precisi; blocchi di 365 568 d divisibili per tutti i passi | 8.1, 8.2, 8.3 |
| AR-DATA-02 | Architettura e rendering | medio | Manca il bilancio di dimensioni e numero di file | Accolta con modifiche | Budget ≤ 90 file, ≤ 48 MB, ≤ 4 MB per file (limite proposto 80 file e 40 MB adeguato alle stime); file aggregati per blocco; verifica in build | 8.1, RNF7, A22 |
| AR-PERF-01 | Architettura e rendering | medio | Etichette HTML e budget per frame | Accolta | Livello etichette, misure una tantum, griglia di bucket, rendering su richiesta, 4 ms per frame | 10.1 (R12), 11.5.2, A21 |
| AR-CTRL-01 | Architettura e rendering | medio | Controlli della camera su 16 ordini di grandezza | Accolta con modifiche | Calcolo degli scatti confermato. Distanza minima R + max(0,01·R; 0,5 km), conciliata con UI-UX-14 | 10.3 |
| AR-SEL-01 | Architettura e rendering | medio | Regole di selezione incomplete | Accolta con modifiche | Raggi 12 px (mouse) e 22 px (tocco) per rispettare WCAG 2.2 SC 2.5.8 e i 44 px su tocco; ciclo tra candidati | 11.5.3 |
| AR-DEP-01 | Architettura e rendering | medio | Versioni da fissare; incompatibilità | Accolta con modifiche | Si mantengono le versioni già bloccate e compatibili (three 0.180.0, vite 7.3.7, typescript 5.9.3, @playwright/test 1.56.1 con Chromium 1194), verificate con `npm ls`; nessun aggiornamento a three 0.186.1 o Vite 8; `legacy-peer-deps` mantenuto: senza il flag npm 10.9.4 termina con errore nella risoluzione delle dipendenze peer (§ 5.2) | 5.2 |
| AR-COMPAT-01 | Architettura e rendering | medio | WebGL2, perdita del contesto, mobile | Accolta | Verifica preventiva, gestione degli eventi di contesto, safe-area, test a 400 px | 10.1 (R13), 11.11, A12 |
| AR-TEST-01 | Architettura e rendering | medio | Ganci di prova, determinismo, precisione senza GPU | Accolta | `window.__ssTest`, `page.clock`, asserzioni numeriche, semi registrati, test di contratto | 5.4, 13 |
| AR-TIME-01 | Architettura e rendering | medio | JD del limite superiore errato | Accolta | Duplicato di DA-CAL-02, verificato | I2, A2 |
| AR-TIME-02 | Architettura e rendering | basso | Input nativi della data e deriva della riproduzione | Accolta | Campi segmentati; riproduzione per differenza di tempo; `Date` confinato | 6.6, 11.4.1, 5.4 |
| AR-URL-01 | Architettura e rendering | basso | Stato nell'URL senza regola comune | Accolta con modifiche | Solo `#slug` in entrambe le varianti, senza query string nemmeno nel sito ospitato | RF8, 5.4, 11.12 |
| AR-RENDER-01 | Architettura e rendering | basso | Griglia, barra di scala, traccia lunare | Accolta con modifiche | Griglia adattiva facoltativa, anelli di distanza attivi; la traccia lunare è sostituita dall'orbita osculante geocentrica figlia della Terra | 10.1 (R11, R14), 10.2 |
| UI-UX-01 | Interfaccia e accessibilità | alto | JD del limite superiore errato | Accolta | Duplicato di DA-CAL-02, verificato | I2 |
| UI-UX-02 | Interfaccia e accessibilità | alto | Codifica dei marcatori incompleta | Accolta con modifiche | Forme, dissolvenza, raggruppamento delle lune, occlusione, legenda. La scelta tra marcatori sovrapposti avviene per ciclo (AR-SEL-01) invece che con un elenco a comparsa | 11.5.1, 11.5.3 |
| UI-UX-03 | Interfaccia e accessibilità | alto | Date a.C. e giuliane: controlli nativi e Date inutilizzabili | Accolta | Verificati il comportamento di `Date` e i giorni della settimana citati | 5.4, 11.4.1, 11.4.2 |
| UI-UX-04 | Interfaccia e accessibilità | alto | Regole dei passi e dei limiti con fuso non definite | Accolta | Regole di calendario e limiti in UT | 6.2, 6.6, 11.4.3 |
| UI-UX-05 | Interfaccia e accessibilità | alto | Date giuliane remote fuorvianti rispetto alle stagioni | Accolta | Verificato: -9999-01-01 giuliano = -10000-10-16 gregoriano prolettico. Riga secondaria, indicatore della stagione, eclittica della data | I1, 7.7, 11.4.1, 11.4.3 |
| UI-UX-06 | Interfaccia e accessibilità | alto | Cursore unico inutilizzabile per regolazioni fini | Accolta | Regolo a due livelli con accessibilità APG | 11.4.3 |
| UI-UX-07 | Interfaccia e accessibilità | alto | Velocità, aliasing e caricamento non definiti | Accolta | Velocità a gradini, regola di 1/8 di periodo, attesa dei blocchi | 6.6, 11.4.3, 5.6 |
| UI-UX-08 | Interfaccia e accessibilità | alto | Livelli di affidabilità senza soglie né testi | Accolta con modifiche | Soglie 1′, 1°, 10° del revisore più un quinto livello "non determinabile" oltre 90°, coerente con FC-AFF-01 | 7.8, 11.8 |
| UI-UX-09 | Interfaccia e accessibilità | alto | Scena 3D senza alternativa testuale | Accolta | Vista testuale, ruoli ARIA, live region unica, dialog nativi | RF10, 11.9 |
| UI-UX-10 | Interfaccia e accessibilità | alto | Scorciatoie senza mappa e senza WCAG 2.1.4 | Accolta | Mappa dei tasti, scorciatoie disattivabili, focus visibile | 11.9 |
| UI-UX-11 | Interfaccia e accessibilità | alto | Tema verde senza valori | Accolta | Contrasti ricalcolati: coincidono entro 0,04 | 11.1, A11 |
| UI-UX-12 | Interfaccia e accessibilità | alto | Layout a pannelli fissi | Accolta | Scena a tutto schermo e pannelli sovrapposti per tre classi di larghezza | 11.3, A12 |
| UI-UX-13 | Interfaccia e accessibilità | medio | Etichette insufficienti per 91 corpi | Accolta | Priorità, collisioni, isteresi, alone; i corpi sono ora 112 | 11.5.2 |
| UI-UX-14 | Interfaccia e accessibilità | medio | Barra di scala ambigua, nessun preset | Accolta con modifiche | Regolo delle distanze, preset (aggiunto "Oggetti interstellari"), anelli di distanza; distanza minima della camera conciliata con AR-CTRL-01 invece di 1,5 raggi | 11.3, 10.1 (R11, R14), 10.3 |
| UI-UX-15 | Interfaccia e accessibilità | medio | Scheda senza gerarchia né riferimenti | Accolta | Struttura, riferimenti degli elementi, elementi baricentrici, iperboliche | 11.7 |
| UI-UX-16 | Interfaccia e accessibilità | medio | Colori di marcatori e orbite non definiti | Accolta con modifiche | Colori adottati; aggiunta la categoria centauri, che condivide il colore dei TNO con forma propria. Distanze CIEDE2000 non ricalcolate: la forma resta il segnale primario | 11.1, 10.2 |
| UI-UX-17 | Interfaccia e accessibilità | medio | Tre famiglie di caratteri superflue, glifi non verificati | Accolta | Glifi verificati sulla tabella cmap | 11.2 |
| UI-UX-18 | Interfaccia e accessibilità | medio | Formattazione numerica incoerente | Accolta | Comportamento di `Intl.NumberFormat` verificato in Node 22 | 11.13 |
| UI-UX-19 | Interfaccia e accessibilità | medio | Ricerca: alias e normalizzazione | Accolta | Alias, normalizzazione, combobox APG | 4.3, 11.6 |
| UI-UX-20 | Interfaccia e accessibilità | medio | Appartenenza multipla e troppe orbite attive | Accolta | Categoria primaria e secondarie, precedenza, orbite di default | 4.2, 10.2, 11.6 |
| UI-UX-21 | Interfaccia e accessibilità | medio | Stato iniziale e condivisione incompatibili con la pubblicazione | Accolta con modifiche | Hash con lo slug; all'avvio UT e offset disattivato, invece dell'offset del dispositivo, per evitare ambiguità con l'ora legale | I3, 11.12 |
| UI-UX-22 | Interfaccia e accessibilità | medio | Stati di errore e caricamento non definiti | Accolta | Messaggi e ruoli definiti | 11.11 |
| UI-UX-23 | Interfaccia e accessibilità | medio | Interazione touch non definita | Accolta | Gesti, soglie, destinazioni | 11.10 |
| UI-UX-24 | Interfaccia e accessibilità | medio | Mancano criteri di accettazione per UI e accessibilità | Accolta | Criteri aggiunti con riferimento a WCAG 2.2 | 13 (A11-A17) |
| UI-UX-25 | Interfaccia e accessibilità | basso | Glossario e convenzioni di scrittura | Accolta | Glossario adottato | 11.14 |
| FC-COM-01 | Fattibilità e completezza | critico | Comete: non usati record per apparizione né NG nel passato | Accolta | Verificato: 30 record di 1P; record -239 servito fino a B.C. 8000-FEB-22 | 7.6.1, 7.6.2, A7 |
| FC-EFF-01 | Fattibilità e completezza | alto | Integrazione pre-1600 incoerente con DE441 | Accolta con modifiche | Duplicato di DA-PICC-01: ASSIST in ambiente separato con rebound 4.6.0; spiceypy per gli SPK di tipo 21 | 5.2, 7.6.1 |
| FC-DATI-01 | Fattibilità e completezza | alto | JD del limite superiore errato | Accolta | Duplicato di DA-CAL-02, verificato | I2 |
| FC-TEMPO-01 | Fattibilità e completezza | alto | Meeus non valido per JD negativi | Accolta | Duplicato di DA-CAL-01, verificato; aggiunto modulo positivo per il giorno della settimana | 6.1, A2 |
| FC-SAT-01 | Fattibilità e completezza | alto | Satelliti: sistemi di riferimento, epoche, fase non determinabile | Accolta con modifiche | Problema confermato. Non si riadattano gli elementi su vettori Horizons, perché Horizons non serve i satelliti fuori dalle finestre moderne (verificato per Ariel, Tritone, Mimas, Io, Fobos, Caronte): si usano gli SPK, inclusi i kernel lunghi. Orizzonte di fase e soglie numeriche adottati | 7.5, A6 |
| FC-AFF-01 | Fattibilità e completezza | alto | Posizioni oltre l'orizzonte presentate come dati | Accolta con modifiche | Nessun marcatore oltre 90°; errore di modello incluso nell'orizzonte. Soglie dei livelli prese da UI-UX-08 (1′, 1°, 10°) invece di 0,01°, 0,1°, 1°, per coerenza con la scala visiva | 7.6.2, 7.8 |
| FC-PUB-01 | Fattibilità e completezza | alto | Vincoli della pubblicazione non recepiti | Accolta | Verificati: Pixel 7 a 412 px e `scripts/make-artifact.mjs` assente | RNF7, 5.7, A12, A18, A24 |
| FC-ACC-01 | Fattibilità e completezza | alto | Criteri di accettazione non misurabili | Accolta | Soglie numeriche, test logici su eventi noti, criterio di uscita dal debug | 13 |
| FC-LUNA-01 | Fattibilità e completezza | medio | Obiettivo lunare di 1′ non dimostrato, calibrazione discontinua | Accolta con modifiche | L'affermazione "non dimostrato" non è confermata: la calibrazione rieseguita dà 49,0″ a -9999. Accolti continuità C1 e fattore su E; spike S1 di conferma | 7.4, 14.2 |
| FC-TEMPO-02 | Fattibilità e completezza | medio | ΔT, rotazione terrestre e criterio di verifica | Accolta con modifiche | Punti a, b, d accolti. Punto c non confermato: (ERA - EO) lungo il polo di Vondrák differisce dal polinomio GMST IAU 2006 di soli -0,067° a -10000. Si adotta comunque ERA - EO tabulata, più rigorosa | 6.4, 7.7, A8 |
| FC-DATI-02 | Fattibilità e completezza | medio | Dati fisici assenti in SBDB per TNO e interstellari | Accolta | Verificato su SBDB (Eris, Haumea, Sedna e altri senza diametro) | 9, 8.10 |
| FC-CORPI-01 | Fattibilità e completezza | medio | Criteri impliciti, omissioni, categoria pianeti nani | Accolta con modifiche | Criteri scritti. Aggiunti: 6 asteroidi ≥ 250 km (elenco SBDB completo verificato), 6 bersagli di missione, Chiron e Chariklo, Mani, 6 comete (tra cui 26P). Pianeti nani solo IAU. Per TNO e grandi comete selezione dichiarata non esaustiva, perché molti TNO di 600-800 km hanno diametri incerti | 4.1, 4.2, 4.4 |
| FC-DATI-03 | Fattibilità e completezza | medio | Soluzioni mutevoli e risposte grezze non versionate | Accolta | Verificato `.gitignore`. Risposte piccole versionate, manifest delle sorgenti, modalità offline | 12.2 |
| FC-DATI-04 | Fattibilità e completezza | medio | Budget non stimato; Float32 incompatibile con 1e-7·r | Accolta con modifiche | Invece di Float64, residui Float32 rispetto a riferimenti Float64; budget scritto; tolleranze legate all'affidabilità | 7.6.3, 8.1, 8.3 |
| FC-PIA-01 | Fattibilità e completezza | medio | EMB senza margine, metrica ambigua, sovrapposizioni | Accolta con modifiche | Metrica \|Δr\|/r; test su 2000 epoche più i confini; aloni. EMB a 32 d con 16 d nei blocchi moderni (DA-PIAN-01) | 7.3.3, 7.3.4, A4 |
| FC-PIANO-01 | Fattibilità e completezza | medio | Sequenza del piano e dipendenze | Accolta | Spike con tempo massimo, congelamento dei formati, parallelismo su servizio fittizio, cancelli | 14 |
| FC-TEST-01 | Fattibilità e completezza | medio | Pipeline senza test né lint; file senza schema | Accolta | pytest, ruff, schema JSON, intestazioni con versione, requisiti fissati | 8.2, 8.10, 12.4 |
| FC-EQN-01 | Fattibilità e completezza | basso | Elementi equinoziali mal condizionati per orbite retrograde | Accolta | Fattore retrogrado I e test di andata e ritorno | 7.2, 8.3 |
| FC-SUP-01 | Fattibilità e completezza | basso | Elementi superflui o sottodimensionati | Accolta con modifiche | Rimossi la pubblicazione automatica su GitHub Pages e lo stato URL completo (`legacy-peer-deps` mantenuto, § 5.2); rotazioni e texture limitate; stelle 3D; zoom 2·10⁵ UA. L'offset orario resta facoltativo e disattivato all'avvio | I3, 5.2, 7.6.4, 8.8, RF1, RF8 |
| FC-NOMI-01 | Fattibilità e completezza | basso | Nomi italiani senza regola | Accolta | Regola scritta; Imalia; nomi ufficiali per gli asteroidi non tradizionali | 4.3, 4.4 |
| FO-DATI-01 | Fonti e conformità | alto | JD del limite superiore errato | Accolta | Duplicato di DA-CAL-02, verificato | I2, A2 |
| FO-DATI-02 | Fonti e conformità | alto | ΔT fuori dominio, diverso da Horizons, incertezza non supportata | Accolta con modifiche | Verificati i testi del manuale Horizons. Parabola di Horizons prima di -720; fixture in TDB; incertezza da Morrison e Stephenson 2004 e Huber 2000 invece della dicitura "non quantificata" | 6.4, 6.5, A3 |
| FO-DATI-03 | Fonti e conformità | alto | Elementi medi: sistemi errati, avvertenza omessa | Accolta con modifiche | Gli elementi medi non sono più usati (DA-SAT-01); l'avvertenza JPL è citata | 7.5.1 |
| FO-DATI-04 | Fonti e conformità | alto | Le fonti non contengono i dati fisici attribuiti | Accolta | Verificato: nessun albedo nella pagina dei satelliti; diametri assenti in SBDB | 9 |
| FO-DATI-05 | Fonti e conformità | medio | Elenco degli SPK satellitari superato | Accolta con modifiche | Elenco aggiornato da `aa_summaries.txt` (ura184_part-3, jup347, nep098_part-3, mar099) e integrato con i kernel lunghi (sat441xl, ura111xl, nep097xl, nep101xl) | 7.5.1, 16.1 |
| FO-DATI-06 | Fonti e conformità | medio | Disnomia assente dalle fonti JPL | Accolta | Holler et al. 2021 e Brown e Butler 2018 | 4.4, 7.5, 9 |
| FO-LIC-01 | Fonti e conformità | medio | Texture senza fonti né licenze | Accolta con modifiche | Fonti NASA/USGS di pubblico dominio; Solar System Scope solo come ripiego per Saturno, Urano, Nettuno; profilo degli anelli dalle tabelle PDS, non da texture | 8.12, 9, 16.3 |
| FO-BIB-01 | Fonti e conformità | medio | Affermazioni e metodi senza fonte | Accolta | Fonti aggiunte; categoria rinominata "interstellari" | 4, 16 |
| FO-BIB-02 | Fonti e conformità | basso | URL inattivi o generici, DOI mancanti | Accolta | URL e DOI aggiornati | 16 |
| FO-BIB-03 | Fonti e conformità | basso | Versioni recenti di dati e norme | Accolta | DE442 e scelta di DE441 motivate; correzione WGCCRE 2019; WCAG 2.2 | I10, 7.7, RNF3 |
| FO-LIC-02 | Fonti e conformità | basso | Bright Star Catalogue: descrizione e licenza | Accolta | 9096 stelle, FK5 J2000, uso divulgativo con citazione | 9, 16 |
| FO-DATI-07 | Fonti e conformità | basso | Anelli: fonte secondaria e profilo senza fonte | Accolta | Tabelle PDS come fonte; profilo dichiarato schematico | 9, 10.1 (R7) |
| FO-LIC-03 | Fonti e conformità | basso | Licenze del software e dei dati | Accolta | File delle licenze; codice GPL non distribuito | 16.3 |
| FO-BIB-04 | Fonti e conformità | basso | "Fonti primarie" contiene fonti non primarie | Accolta | Sezione divisa | 16.1, 16.2 |
| FO-STILE-01 | Fonti e conformità | basso | Correzioni di lingua; diagramma con U+2500 | Accolta | Testo riscritto; diagramma in ASCII; nomi degli asteroidi nella forma ufficiale (una delle due opzioni proposte) | intero documento |
| FO-CONF-01 | Fonti e conformità | basso | Stato via URL incompatibile con la pagina pubblicata | Accolta con modifiche | Un solo formato (hash con lo slug) in entrambe le varianti; localStorage solo per le preferenze | RF8, RNF7, 5.7 |

## 4. Verifiche indipendenti

| # | Oggetto | Metodo | Esito |
|---|---------|--------|-------|
| V1 | Limiti in JD e calendario | Algoritmo di Meeus con parte intera per difetto e con troncamento | 2121-01-01 = 2 495 739,5; 2000-01-01 = 2 451 544,5; -9999-01-01 = -1 931 076,5; -9999-03-01: -1 931 017,5 (troncamento -1 931 016,5); -9998-12-01 = -1 930 377,5 come in Horizons |
| V2 | Giorni della settimana e corrispondenze | Calcolo da JD | 1582-10-04 giovedì, 1582-10-15 venerdì, 1500-01-01 giuliano mercoledì; -9999-01-01 giuliano = -10000-10-16 gregoriano prolettico; 21/03/-9999 giuliano = 03/01/-9999 gregoriano |
| V3 | ΔT | Manuale Horizons (sezione "Universal Time"); tabella S15.2020 nella copia distribuita con Skyfield 1.55 | Parabola di Horizons prima del 721 a.C. confermata; S15(-720) = 20 371,848 s, pendenza -16,13 s/anno; parabola di Horizons a -720: 20 372,3 s; SMH 2016: 20 730,3 s; a -9999: 454 053 s (SMH) contro 438 387 s (Horizons); "At 3000 B.C., the uncertainty in UT is about 4 hours"; futuro costante in Horizons |
| V4 | Incertezza di ΔT | Pagina NASA GSFC sull'incertezza di ΔT (Morrison e Stephenson 2004; Huber 2000) | σ = 0,8·t² (validità -1000/+1200); modello di Huber: tabella a -3000 = 8 978 s riprodotta; σ(-9999) ≈ 103 005 s |
| V5 | sb441-n16 | Lettura della catena dei sommari DAF con richieste HTTP parziali | 64 segmenti, 16 corpi (1, 2, 3, 4, 7, 10, 15, 16, 31, 52, 65, 87, 88, 107, 511, 704), JD -1 200 525,5 / 5 008 242,5 |
| V6 | Kernel satellitari | `aa_summaries.txt` NAIF; dimensioni con richieste HEAD | Coperture della tabella del § 7.5.1 confermate; kernel lunghi di circa 0,4-2,1 GB ciascuno |
| V7 | Satelliti in Horizons | Richieste VECTORS a JD -1 000 000 | Rifiuti: Ariel prima del 1600-01-05, Tritone e Nereide prima del 1800-01-02, Mimas prima del 1749-12-31, Io prima del 1600-01-11, Fobos prima del 1600-01-02, Caronte prima del 1800-01-03 |
| V8 | Record per apparizione | Horizons `DES=1P;` e record 90000001 | 30 record dal -239 al 1968; record SAO/-239 servito fino a B.C. 8000-FEB-22 |
| V9 | Elementi medi JPL | Testo della pagina | "not intended for ephemeris computation"; Disnomia ed Eris assenti |
| V10 | Dati fisici | SBDB API (`phys-par=1`, interrogazione per diametro > 249 km); pagina JPL dei satelliti | Diametri assenti per Eris, Haumea, Sedna, Gonggong, Quaoar, Orco, Salacia, Issione, Arrokoth, Makemake, Mani; asteroidi ≥ 250 km: Cerere, Vesta, Pallade, Igea, Interamnia, 52 Europa, Davida, Euphrosyne, Patientia, Sylvia; nessuna colonna albedo per i satelliti |
| V11 | ASSIST | Pacchetto 1.2.3 da PyPI (README, setup.py, licenza) | Supporto di `.bsp` e `linux_m13000p17000.441`, sb441-n16, modello di Marsden; requisito rebound ≥ 4.4.11 e < 5 (installato 5.2.2); licenza GPL-3.0 |
| V12 | Dipendenze npm | `npm ls`, `package.json` dei pacchetti | three 0.180.0, vite 7.3.7 con Rollup 4, vitest 4.1.11, typescript 5.9.3, typescript-eslint 8.71.2, @playwright/test 1.56.1; nessun conflitto; Chromium 1194 presente |
| V13 | Contrasti | Formula WCAG della luminanza relativa | Valori del § 11.1 confermati (scarti ≤ 0,04 rispetto alla revisione) |
| V14 | Font | Tabella cmap dei file serviti da Google Fonts | ʻ ′ ″ − ≈ ± ≤ presenti; U+2009 nel sottoinsieme latino; U+202F e ☉ assenti |
| V15 | Formattazione | `Intl.NumberFormat('it-IT')` in Node 22 | "1000", "10.000", segno meno ASCII |
| V16 | Precisione Float32 e corde | numpy | Spaziatura 16 km a 1 UA, 512 km a 6,6e9 km, 16 384 km a 1,4e11 km, 1,05e6 km a 1e5 UA; freccia 2 816 km (512 punti) e 176 km (2048 punti) a 1 UA |
| V17 | Luna | Calibrazione rieseguita a -9999 contro DE441 | Senza calibrazione 350′; calibrata 49,0″ massimo, 14,8″ rms, 34,1 km |
| V18 | Pianeti | Interpolazione rieseguita (Lagrange 8 punti, Float32, 300 epoche) | EMB 48 d: 1,22″; 32 d: 0,324″ (234 km); 16 d: 0,033″ (24 km); Mercurio 32 d: 1,49″ |
| V19 | Tempo siderale | CIO integrato lungo il polo di Vondrák (ERFA `ltpb`, `s06`, `eors`, `era00`) contro `gmst06` | -0,067° a -10000, -0,012° a -5000, < 0,001° dopo l'anno 0 |
| V20 | Stato del repository | Lettura dei file | `.npmrc` con `legacy-peer-deps`; `scripts/make-artifact.mjs` assente; progetto Playwright "mobile" su Pixel 7 (412 px); `.gitignore` esclude `scripts/pipeline/.cache/`; ESLint ignora `scripts/pipeline/` |

Non ripetute, con decisione fondata su altro: errori angolari degli elementi medi contro Horizons (DA-SAT-01; decisione fondata sull'avvertenza JPL verificata); deriva di REBOUND autonomo (DA-PICC-01, FC-EFF-01; due misure indipendenti concordanti); scostamenti stellari a -10000 (DA-STELLE-01; modello standard di moto rettilineo); distanze CIEDE2000 (UI-UX-16; la forma resta il segnale primario); DOI su Crossref (FO-BIB-02; verifica del revisore, da ripetere nella compilazione di LICENZE.md).

## 5. Modifiche principali della versione 2.0

1. Limite superiore corretto (JD 2 495 739,5) e calendario con parte intera per difetto, valido per JD negativi.
2. Modello di ΔT completo e continuo, con incertezza σ(ΔT) quantificata e propagata all'affidabilità.
3. Satelliti da SPK JPL (moderni e lunghi) con modello a record; elementi medi abbandonati; Disnomia inclusa.
4. Piccoli corpi: ASSIST con DE441 e sb441-n16, record cometari per apparizione, cloni dalla covarianza, orizzonte di predicibilità.
5. Cinque livelli di affidabilità con soglie numeriche e regole di rappresentazione.
6. Formati binari e JSON specificati byte per byte, con blocchi, residui Float32 e budget dei file.
7. Contratti TypeScript tra moduli, ordine per frame, macchina a stati del caricamento, build a pagina singola.
8. Rendering: origine sul corpo a fuoco, orbite ancorate, impostori di ellissoide, profondità logaritmica con regole per gli shader.
9. Interfaccia: palette verde con contrasti calcolati, layout sovrapposto, editor della data, regolo a due livelli, vista testuale, WCAG 2.2 AA.
10. Criteri di accettazione misurabili (A1-A26), spike con tempo massimo e cancelli di fase.
