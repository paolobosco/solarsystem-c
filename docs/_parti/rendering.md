# Rendering a scala reale

Riferimento: `docs/PROGETTO.md` versione 2.2, § 5.4, § 5.5, § 7.8.2, § 10, § 11.1, § 11.5, § 11.10, § 13 (A10, A20, A21, A25 parte grafica), § 14.2 (S5).

## 1. Contenuto

### 1.1 Modulo `src/render/`

| File | Contenuto |
|------|-----------|
| `api.ts` | interfaccia `ScenaApi`, opzioni di `creaScena`, tipi esportati |
| `renderer.ts` | `creaScena`: WebGLRenderer, ordine per frame, rendering su richiesta, contesto perso, texture, stelle, eventi |
| `motore.ts` | motore su CPU senza DOM né WebGL: stati, origine, proiezione, occlusione, lune raggruppate, marcatori, orbite con budget, etichette, selezione |
| `grafo.ts` | grafo three.js e sincronizzazione per frame dai dati del motore |
| `origin.ts` | origine sul corpo a fuoco, `setOrigin()`, transizioni di fuoco |
| `camera.ts` | camera (`up = (0, 0, 1)`), distanza minima, estensione della vista |
| `controls.ts` | OrbitControls (zoomSpeed 5, limiti), gesti di selezione, doppio tocco, inoltro dalle etichette |
| `projection.ts` | proiezione unica su CPU in Float64, intersezioni raggio-sfera e raggio-ellissoide |
| `impostor.ts` | impostori di ellissoide, Sole emissivo con alone, convenzione delle texture |
| `orbits.ts` | campionamento delle orbite ancorate (ellisse, iperbole, parabola) |
| `linee.ts` | linee a larghezza in pixel: orbite, anelli di distanza, anelli di Urano, assi |
| `markers.ts` | forme SVG dei marcatori, atlante, istanze in spazio vista, anello di selezione |
| `labels.ts` | disposizione delle etichette su griglia di bucket con isteresi; livello HTML |
| `picking.ts` | candidati, priorità, ciclo sui clic ripetuti |
| `rings.ts` | anelli di Saturno (profilo radiale, ombra del pianeta) e di Urano |
| `stars.ts` | interfaccia del fornitore di stelle, colore da B-V, moto alla data, eclittica della data |
| `grid.ts` | griglia dell'eclittica J2000, anelli di distanza |
| `texture.ts` | fornitore di texture e adattatore per `DataStore` |
| `orientamento.ts` | interfaccia `FornitoreOrientamento`, operazioni su matrici 3×3 |
| `corpi.ts`, `nomi.ts`, `costanti.ts`, `tipi.ts`, `testi.ts`, `glsl.ts` | anagrafica di scena, nomi brevi, costanti (con i colori della scena, letti anche dai simboli dell'interfaccia), tipi, testi, frammenti GLSL |

### 1.2 Sviluppo (`src/dev/`, `render-lab.html`)

- `servizioFittizio.ts`: catalogo da `scripts/pipeline/bodies.json` con raggi reali, `EphemerisService` kepleriano (pianeti con gli elementi di Standish, satelliti nel piano equatoriale del pianeta, piccoli corpi con elementi plausibili), orientamenti WGCCRE semplificati e rotazione sincrona, affidabilità crescente con la distanza da J2000.
- `fornitoriFittizi.ts`: texture procedurali di prova (griglia di 30°, meridiano 0 rosso, equatore chiaro) e 9096 stelle casuali con seme fisso.
- `datiFittizi.ts`: raggi con la fonte per corpo, elementi orbitali e poli.
- `renderLab.ts` e `render-lab.html`: pagina di prova con pannello e ganci `window.__lab`. La build di produzione non la include (Vite costruisce solo `index.html`; verificato).

Fonti dei raggi: Archinal et al. (2018) per pianeti, Luna, satelliti maggiori e asteroidi visitati; IAU 2015 Risoluzione B3 per il Sole; JPL Planetary Satellite Physical Parameters; JPL SBDB; le fonti primarie del § 9 per TNO e interstellari. Elementi dei pianeti: E. M. Standish, Keplerian Elements for Approximate Positions of the Major Planets, JPL, tabella 1.

## 2. Interfaccia

```ts
const scena = creaScena({ canvas, etichette, catalogo, effemeridi, orientamento, texture, stelle, testi });
scena.impostaTempo(timeState);                     // § 5.5 punto 1
scena.impostaRiproduzione(giorniPerSecondo);       // antialiasing temporale, § 11.4.3
scena.impostaFuoco(ssid, { transizione: true, inquadratura: 'orbita' });
scena.impostaSelezione(ssid);
scena.impostaLivelli({ grigliaEclittica: true });   // RF5
scena.impostaFiltri(['pianeta', 'luna']);           // RF6
scena.zoom(10); scena.impostaEstensione(km); scena.ruota(dAz, dEl); scena.sposta(dx, dy); scena.inquadra();
scena.corpiVisibiliOrdinati(); scena.corpoPiuVicinoAlCentro(); scena.statoVista(); scena.infoCorpo(ssid);
scena.getScreenPosition(ssid);                      // px CSS rispetto alla canvas
scena.impostaZoneOccupate(zone);                    // pannelli dell'interfaccia, esclusi dalle etichette (§ 11.5.2)
scena.onSelezione(cb); scena.onPassaggio(cb); scena.onVista(cb); scena.onRichiestaFrame(cb);
scena.dispose();
```

- Ciclo dei frame: senza ascoltatori di `onRichiestaFrame` la scena usa `requestAnimationFrame` solo quando serve. Con un ascoltatore il chiamante pianifica e chiama `disegna()`, che restituisce `true` finché servono altri frame (transizioni, controlli smorzati, dissolvenze, isteresi delle etichette, orbite in attesa).
- `statoVista()`: fuoco e selezione, distanza della camera, estensione della vista e km per pixel alla profondità del centro del corpo a fuoco lungo l'asse ottico (regolo delle distanze e barra di scala dell'interfaccia, R14; uno spostamento cambia la distanza, non la profondità), transizione, corpo a fuoco senza posizione alla data, contesto perso, dimensioni della canvas, direzione della camera (prove). Barra di scala e preset di vista (§ 11.3) sono dell'interfaccia (`src/ui/scala.ts`, `PRESET_VISTA`); la scena parte con l'ampiezza del preset Sistema interno (`ESTENSIONE_INIZIALE_KM`).
- Limite di zoom (RF1, § 10.3): ampiezza della vista di 2·10⁵ UA sul lato minore; la distanza massima della camera (`distanzaMassima(aspetto)`, 2,41·10⁵ UA con aspetto ≥ 1) vale per controlli, `zoom`, `impostaEstensione` e inquadrature. Movimenti dei controlli sotto 1e-9 della distanza non chiedono altri frame (al limite il passaggio per le coordinate sferiche di OrbitControls darebbe un frame dopo l'altro).
- Aspetto della canvas: a ogni ridimensionamento la distanza cambia in modo da conservare l'ampiezza sul lato minore (`Motore.impostaAspetto`), anche durante le transizioni; la prima misura della canvas, montata dopo la creazione della scena, conserva così la vista iniziale anche sugli schermi verticali. Un cambio della sola densità dei pixel (finestra spostata su un altro schermo) è rilevato con la media query `(resolution: Ndppx)`, registrata di nuovo a ogni cambio.
- Inquadrature: `'corpo'` (disco al 40% del lato minore), `'sistema'` (lune regolari, con la camera a 30° sul piano del sistema), `'orbita'` (distanza minima che porta ogni punto dell'orbita campionata entro l'85% della mezza larghezza e della mezza altezza, camera puntata sul corpo), estensione esplicita. Corpo senza posizione alla data: distanza minima, limite dei controlli e inquadratura si riferiscono al corpo d'origine (`riferimentoPer`); resta la vista attuale se almeno ampia quanto l'inquadratura del corpo d'origine, oppure l'orbita se la forma è determinata.
- Direzione della camera nel cambio di fuoco (`OpzioniFuoco`): quella attuale; con `elevazione`, lo stesso azimut a quell'elevazione sull'eclittica; con `vistaSistema` (predefinito per l'inquadratura `'sistema'` del contatore "+N lune"; dall'interfaccia per i preset Terra e Luna, Plutone e Caronte, Sistema di Giove e Sistema di Saturno, § 11.3) a 30° sul piano del sistema, con lo stesso azimut attorno al polo e dallo stesso lato del piano. Polo del sistema (`Motore.poloSistema`): momento angolare dell'orbita della luna di raggio maggiore rispetto al primario; senza lune con stato, asse di rotazione del primario. Dalla vista iniziale (azimut -90°, 30° sull'eclittica) il piano di Saturno, inclinato di circa 28° sull'eclittica, era a 2,3° dalla linea di vista.
- `impostaZoneOccupate(zone)`: rettangoli in px CSS rispetto alla canvas coperti dai pannelli; l'interfaccia li calcola in `src/ui/zoneScena.ts` (elementi fuori dalla mappa con sfondo di opacità almeno 0,5) e li aggiorna a ogni cambio di attributi, figli o dimensioni dei pannelli.
- `infoCorpo()`: stato effemeride, livello, visibilità, coordinate schermo, raggio apparente, occlusione, "moto troppo rapido" (§ 11.4.3), luna raggruppata.
- Fornitori: `FornitoreOrientamento.orientamento(ssid, t, out)` scrive la matrice corpo → eclittica J2000 (colonne: meridiano 0, y, polo); `FornitoreTexture.carica(corpo, segnale)`; `FornitoreStelle.carica(segnale)` restituisce i campi di `stars.bin` (§ 8.8) come vettori (`DatiStelle`).
- Errori: `ErroreWebGL` se il renderer WebGL2 non si crea.

## 3. Ordine per frame (§ 5.5)

1. Tempo: `TimeState` dal chiamante.
2. Stati in Float64 nell'ordine Sole e pianeti, Luna, satelliti, altri corpi; affidabilità; orientamenti; velocità angolare attorno al primario.
3. Origine sul corpo a fuoco (o sul primo antenato con stato se il corpo non ne ha, che diventa anche il riferimento della distanza minima) e passo della transizione.
4. `controls.update()` (distanza minima dal bersaglio), poi `Motore.limitaDistanzaDalCentro()`: con il bersaglio spostato una rotazione può portare la camera sotto la distanza minima dal centro del corpo d'origine (§ 10.3), e la camera torna radialmente al minimo, puntata sul bersaglio; `camera.updateMatrixWorld()`.
5. Proiezione unica su CPU (punto 6 anticipato): spazio vista, coordinate schermo, raggi apparenti, contorni proiettati dei dischi (`Proiettore.contorno`), occlusione, lune raggruppate, opacità dei marcatori. Poi orbite con budget, anelli di distanza, etichette, uniformi e attributi.
6. `renderer.render`: stelle, poi scena principale.
7. Etichette: solo `transform` (la visibilità cambia solo al cambio di stato).

## 4. Precisione

- Origine sul corpo a fuoco; tutte le posizioni relative in Float64; a ogni frame i valori in spazio vista sono calcolati su CPU in Float64 e caricati come Float32.
- Impostori, anelli e griglia ricevono centro, assi e posizione della camera nel sistema del corpo (o dell'anello) calcolati in Float64; gli shader non usano `cameraPosition` né `modelMatrix` in coordinate mondo (R3).
- Orbite ancorate: vertici relativi al corpo in Float32, vertice del corpo esattamente (0, 0, 0), differenze con le formule di prostaferesi (precisione relativa piena vicino al corpo); posizione dell'oggetto r_corpo - r_origine in Float64, matrice modelView calcolata da three in doppia precisione. Orbite non ricostruite nel frame: ancora fissa rispetto al primario. Scelta delle orbite da ricostruire (`aggiornaOrbite`): fuoco fuori budget; selezione e altre orbite fino a 8 in tutto per frame; prima le orbite in campo (corpo disegnato nel campo della vista) e quelle delle lune del sistema a fuoco, la meno recente per prima (`orbitaVersioneTempo` minore, a parità l'ordine statico); l'ultimo posto va alla meno recente in assoluto, quindi ogni orbita attiva è ricostruita entro un numero finito di frame.
- Profondità logaritmica (near 1e-5 km, far 1e15 km); impostori, anelli, griglia, alone e linee calcolano `gl_FragDepth` con la formula di `logdepthbuf_fragment`; anelli di Saturno e linee, trasparenti, non scrivono la profondità e la usano solo per il test contro gli impostori.
- Marcatori, alone del Sole e linee emettono `gl_Position` già diviso per w (w = 1). Con w oltre circa 5,5·10¹¹ km (camera oltre circa 3700 UA) SwiftShader interpola male le varying: marcatori a strisce, anello di selezione in due archi, tratteggio irregolare. Nei marcatori e nell'alone i quattro vertici hanno lo stesso w e la geometria non cambia; nelle linee il taglio al riquadro dello schermo è omogeneo (estremi tagliati esatti nello spazio) e il fragment shader ricava w, profondità e parametro del tratteggio dalla frazione sullo schermo s: wa/w = (1 - s) + s·wa/wb, u = s·(wa/wb)/(wa/w).
- Linee: taglio al piano vicino con margine proporzionale alle coordinate (l'errore Float32 dell'interpolazione è circa 6e-8·|z|) e ritaglio in NDC al riquadro [-3, 3]² prima dell'allargamento in pixel.

## 5. Elementi grafici

- Impostori (R5): cubo unitario portato in spazio vista dagli assi del corpo, facce posteriori; intersezione raggio-ellissoide con la forma stabile `h = o - (o·d)d`; normale, latitudine e longitudine planetocentriche analitiche; `textureGrad` con derivate scelte tra due parametrizzazioni di u (nessuna cucitura); illuminazione lambertiana con terminatore e luce diffusa minima 0,035 sul lato notturno, senza ombre di altri corpi (eclissi non rappresentate); Sole emissivo con oscuramento al bordo e alone additivo limitato a 48 px oltre il disco. Raggio apparente sotto 1 px: solo marcatore.
- Texture: richieste quando il raggio apparente supera 8 px; convenzione `u = lon0_u ± lon/2π`, `v = 0,5 - lat/π`, riga 0 al polo nord; immagini conservate per il ripristino del contesto. Dopo un errore il corpo torna richiedibile dopo 2 s, attesa raddoppiata a ogni errore fino a 60 s; il nuovo tentativo parte se la texture serve in quel momento (§ 5.6). Stesso schema per `stars.bin`, con le stelle attive.
- Orbite (§ 10.2): 256 punti uniformi in anomalia eccentrica (iperbolica, di Barker) più ±δ·2^k, δ = 1e-9 rad, k = 0..24; archi iperbolici limitati a ±(tempo per raggiungere 3 volte la distanza attuale); ricostruzione al cambio di tempo, corpo a fuoco sempre, altri 8 per frame con priorità alle orbite visibili; orbite attive: pianeti, selezione, fuoco, orbite aggiuntive, lune del sistema a fuoco con semiasse proiettato oltre 10 px; opacità 0,60, selezionata opaca e 2 px; tratteggio per "indicativa" e "non determinabile" (in questo caso solo con forma determinata); arco d'incertezza ±ε continuo e 2 px più largo dell'orbita (3 px, 4 px con l'orbita selezionata), distinguibile anche sull'orbita del corpo selezionato; il tratteggio non dipende dalla forma dell'orbita.
- Marcatori (§ 11.5.1): tracciati SVG per categoria rasterizzati con Path2D in un atlante 8 × 4 a scala 4, contorno scuro di separazione, varianti cave; colori e dimensioni del § 11.1; coda antisolare delle comete orientata con la derivata della proiezione; dissolvenza in 200 ms oltre 10 px di diametro (immediata con movimento ridotto); lune a meno di 12 px dal pianeta nascoste con contatore "+N lune" che inquadra il sistema; anello di selezione 5 px fuori dal contorno proiettato del disco (ellisse del cono tangente: fuori dall'asse ottico più grande del cerchio di raggio apparente e con il centro spostato verso l'esterno), disegnato come ellisse nel fragment shader (distanza dal bordo al primo ordine, F/|∇F|); opacità 30% dietro un disco risolto (occlusione analitica raggio-sfera in Float64); anello di selezione #D7F75B attorno al disco.
- Etichette (§ 11.5.2): classi di priorità (forzate, Sole e pianeti, pianeti nani, orbita attiva, lune del sistema a fuoco, altri per diametro, anelli di distanza), algoritmo goloso su bucket di 32 px con due posizioni (destra, sinistra), al massimo 25 sotto i 600 px di larghezza della mappa, ricalcolo ogni 100 ms, permanenza minima di 300 ms in ogni stato; testo #E6F2EC 12 px peso 600 con alone di 3 px #030806. Le zone dei pannelli valgono come occupate (contatore "+N lune" compreso); le forzate restano visibili. Vale come occupato anche il marcatore del corpo selezionato con l'anello di selezione (`LayoutEtichette.impostaProtetto(i, raggio)`: riquadro di semilato raggio del marcatore + 5 px + 2 px, centrato su `x[i]`, `y[i]`; impostato da `Motore.aggiornaEtichette` solo se `selezioneConAnello()` e il disco non supera il marcatore): le etichette degli altri corpi provano l'altro lato, altrimenti restano nascoste; l'etichetta del corpo stesso non è vincolata e quelle forzate ripiegano come per le zone. Etichetta di un anello di distanza: punto più basso sullo schermo tra otto della circonferenza, esclusi quelli nascosti da un disco risolto (occlusione analitica come per i corpi); senza punti liberi l'etichetta è nascosta. Disco con raggio apparente di almeno 60 px: etichetta all'altezza del bordo a 45° sotto il centro (sopra se fuori dalla vista), ancorata al centro della corda orizzontale del contorno proiettato alla riga dell'etichetta più vicina al centro e scostata di metà corda più 9 px (oltre l'anello di selezione); senza un lato nella vista, sul centro del disco. Dischi minori: scostamento di almeno metà dell'ampiezza orizzontale del contorno più la distanza tra il suo centro e il centro proiettato, più 5 px.
- Selezione (§ 11.5.3, § 11.10): tolleranza 12 px (mouse) o 22 px (tocco), dischi risolti con intersezione su CPU, precedenza di categoria poi distanza, ciclo entro 4 px e 1,5 s; clic valido sotto 5 px (mouse) o 8 px (tocco) e 500 ms; doppio tocco inquadra; il trascinamento e la rotella iniziati su un'etichetta passano alla canvas.
- Anelli (R7): Saturno con bordi delle tabelle PDS (D, C, B, divisione di Cassini, A con Encke e Keeler, F), profondità ottiche tipiche, profilo schematico; lato illuminato e non illuminato; ombra del pianeta sugli anelli. Profilo mediato sull'area di ogni texel (trasmissione media e^(-τ) e luminosità media delle parti opache) con catena mipmap letta con `textureGrad` dalle derivate del raggio: lacune e anelli stretti sotto il pixel restano continui e attenuati, senza tratteggio né scintillio. Linee dietro il piano degli anelli (orbite, assi, anelli di distanza): opacità moltiplicata per la trasmissione dell'anello lungo il raggio di vista (`GLSL_TRASMISSIONE_ANELLO`, uniformi condivise). Urano: dieci anelli stretti come linee. Ombre degli anelli sul pianeta non rappresentate.
- Stelle (R8): scena separata con camera di sola rotazione, senza scrittura di profondità; direzione alla data secondo il § 8.8, ricalcolata ogni 0,5 anni; colore da B-V con Ballesteros (2012), corpo nero, funzioni colorimetriche CIE 1931 nell'approssimazione di Wyman, Sloan, Shirley (2013), sRGB IEC 61966-2-1; luminosità massima limitata.
- Griglia (R11): piano z = 0 in spazio vista, livelli 10^k dalla quota della camera con dissolvenza; anelli di distanza 1-1000 UA ancorati al punto più vicino al fuoco, con etichette.
- Assi di rotazione (RF5): segmento lungo il polo del modello di orientamento, 1,6 volte il semiasse polare per lato, solo se il fornitore restituisce un orientamento modellato; con assi fissi allineati all'eclittica J2000 per convenzione (§ 7.5.5, § 7.6.4: satelliti irregolari, Iperione, Notte, Idra, Disnomia, piccoli corpi senza modello WGCCRE) il fornitore restituisce false e l'asse non è disegnato.
- Eclittica della data: cerchio massimo nella scena delle stelle con il polo di Vondrák et al. (2011) (`ltpecl`). Con l'elevazione di 30° sull'eclittica della vista iniziale, mantenuta dai preset centrati sul Sole, è sopra il bordo della vista (bordo a latitudine eclittica -7,5° al centro, inclinazione massima 1,635°): il pannello Livelli lo dice e indica come vederla; compare da 20° di elevazione.
- Antialiasing temporale (§ 11.4.3): passo per fotogramma = velocità × durata media del frame; se supera 1/8 del periodo attorno al primario (velocità angolare |r × v|/r²) il marcatore sparisce e l'orbita è evidenziata; l'orientamento resta fermo se il passo supera 1/8 del valore assoluto del periodo di rotazione (negativo nel catalogo per Venere e Urano).
- Contesto (R13): `webglcontextlost` con `preventDefault` e pausa, etichette nascoste (non seguirebbero più data e vista) e `statoVista().contestoPerso` per il messaggio dell'interfaccia; `webglcontextrestored` ricarica geometrie e texture dalla memoria CPU.

## 6. Verifiche

| Comando | Esito |
|---------|-------|
| `npx vitest run tests/render` | 14 file, 130 test superati (22/10/2026) |
| `npx playwright test -c tests/render/playwright.render.config.ts` | 10 test superati (SwiftShader, 22/10/2026); il test A20 di occlusione, ripetuto 10 volte da solo, 10 su 10 |
| `npx tsc --noEmit`, `npx eslint .` | nessun errore |

| Criterio | Misura | Soglia |
|----------|--------|--------|
| A10 raggi | raggi del motore e semiassi degli impostori uguali al catalogo, errore relativo < 1e-9; nessuna scala nel grafo (scala 1 e matrici mondo senza scala) | < 1e-9 |
| A20 orbita (Vitest, Float32) | 11 100 casi (111 corpi, 50 date, 5 distanze da 3 R a 1e5 UA, 1920×1080 e 400×800): distanza tra corpo disegnato e orbita 0 px; corpo vero 1,5e-12 px. Lune con fuoco sul pianeta, camera a 3 raggi: 1500 casi, 8e-13 px. Orbita non ancorata: fino a 1,4e5 px | < 0,5 px |
| A20 riproduzione (Vitest, dati pubblicati) | Luna a 1 e 7 giorni simulati al secondo, lune di Giove e Saturno a 7, cometa o asteroide selezionato, camera ruotata attorno a z (45°, 135°, 180°, 270°) con il Sole davanti al piano: distanza tra marcatore e orbita disegnata 0 px. Controllo con la scelta delle orbite per ordine statico: Luna fino a 10,4 px, lune di Giove fino a 1,9 px | < 1 px |
| A20 oscillazione (e2e) | camera a 10 km da Itokawa, 24 passi di un minuto: residui dell'impostore 0,0006 e 0,0003 px; orbita 0,022 px (deriva regolare 0,11 px dovuta alla rotazione della tangente) | < 0,1 px |
| A20 occlusione (e2e) | Luna dietro la Terra e Io dietro Giove: differenza 0 tra frame con e senza luna; controllo senza pianeta 319 e 481 | invisibili |
| A20 silhouette (e2e) | Terra e Giove a quota 0,01 R, orizzonte in 20 righe: errore massimo 0,000 px rispetto al bordo analitico in Float64 | < 0,5 px |
| A21 (Vitest, Node 22.22.0, 4 CPU) | 112 corpi in riproduzione, tutte le orbite attive, etichette a ogni frame; tre esecuzioni del 22/10/2026: media 0,58-0,66 ms, 95° percentile 0,62-0,93 ms; ricostruzione di tutte le 111 orbite in un frame 5,6-6,4 ms; il budget ne ricostruisce 9: 0,45-0,52 ms. Misura del 18/10/2026 (4 CPU condivise): media 0,62 ms, 95° percentile 1,1 ms, 111 orbite 5,8 ms. I tempi dipendono dal carico della macchina | ≤ 4 ms |
| A21 (e2e, SwiftShader) | tempo CPU per frame 1,3-2,8 ms, frame completo 2-3 ms (registrato il 18/10/2026); 22/10/2026, una esecuzione: CPU 1,30 ms (media 1,54 ms), frame completo 1,8 ms | solo registrato |
| A25 (parte grafica) | orbite iperboliche aperte; Terra antioraria vista da +z; a 12:00 UT (1900-2100) la longitudine 0 della texture terrestre è rivolta al Sole entro 5° con l'orientamento di prova | ±5° |
| R7 linee (e2e) | Saturno il 16/10/2017 a 600 000 km: 22 pixel dell'asse sud dietro l'anello B, tutti entro e^(-τ/μ)·contrasto + 12; scarto medio 0,8 | ≥ 90 % entro |
| R7 profilo (e2e) | stessa scena, anello A (17 513 pixel): salti oltre 120 tra 600 000 e 600 600 km: 0 | ≤ 3 |

Altri test: campionamento delle orbite (vertici sulla conica entro 1e-6, raddoppio delle distanze nel raffinamento, archi iperbolici a 3 r), etichette (collisioni, limite di 25, isteresi), selezione (tolleranze, priorità, ciclo), stelle (temperatura del Sole da B-V 0,65 tra 5700 e 5850 K, colori, moto 3D), nomi brevi, proiezione uguale a `Vector3.project`, transizioni logaritmiche, `setOrigin`, occlusione, lune raggruppate, antialiasing temporale (anche con periodo di rotazione negativo), filtri, stato "caricamento", orbite attive, corpo a fuoco senza posizione, ampiezza conservata al cambio di aspetto, inquadratura "orbita" con l'orbita intera nella vista, etichette degli anelli di distanza dietro un disco, profilo degli anelli mediato e catena mipmap (`tests/render/vista.test.ts`, `tests/render/anelli.test.ts`), distanza minima dal centro e barra di scala con il bersaglio spostato (`tests/render/camera.test.ts`), contorno proiettato, anello di selezione ed etichetta dei dischi fuori asse (`tests/render/contorno.test.ts`), assi solo con orientamento modellato (`tests/render/assi.test.ts`); in e2e rotella sopra le etichette, cambio della sola densità dei pixel, etichette nascoste a contesto perso, e le stesse prove della camera, del contorno e degli assi sull'applicazione con la Terra, la Luna fuori asse, Febe e Cerere, più l'etichetta "1 000 UA" (`e2e/camera.spec.ts`); vista dei sistemi planetari a 30° sul piano della luna maggiore, anche dal contatore "+N lune" (`tests/render/vista.test.ts`, `e2e/vista.spec.ts`), tratteggio delle orbite per livello e non per forma (`tests/render/motore.test.ts`), arco ±ε continuo e più largo dell'orbita anche con il corpo selezionato (`e2e/affidabilita.spec.ts`).

## 7. Schermate (`test-results/rendering/`)

Pagina di prova a 1280 × 800 con i servizi fittizi, 18/10/2026 00:00 UT salvo indicazione.

| File | Contenuto |
|------|-----------|
| `01-sistema-interno.png` | vista iniziale (Sistema interno, 30° sopra l'eclittica, Terra selezionata): orbite dei pianeti, anelli di distanza etichettati, marcatori per categoria, contatori "+N lune", stelle |
| `02-terra-luna.png` | preset Terra e Luna: orbita della Luna, orbita della Terra ancorata e selezionata |
| `03-sistema-giove.png` | preset Sistema di Giove: disco di Giove con texture, orbite delle galileiane |
| `04-pianeti-giganti.png` | preset Pianeti giganti: TNO, centauri, comete con coda antisolare |
| `05-saturno-anelli.png` | Saturno da 4,2·10⁵ km: terminatore, anelli visti dal lato non illuminato (Sole a sud del piano nel 2026), orbite delle lune dietro il disco |
| `06-urano-anelli.png` | Urano con i dieci anelli stretti e le orbite delle lune nel piano equatoriale |
| `07-terra-terminatore.png` | Terra inquadrata: texture di prova, terminatore, anello di selezione attorno al disco |
| `08-sole-alone.png` | Sole emissivo con oscuramento al bordo e alone limitato |
| `09-itokawa-10-km.png` | Itokawa (535 × 294 × 209 m) a circa 10 km |
| `10-griglia-eclittica.png` | griglia dell'eclittica J2000 attiva |
| `11-assi-eclittica-data.png` | anno -7450 circa, camera bassa: eclittica della data (azzurra) distinta dagli anelli di distanza, orbite delle lune tratteggiate con arco d'incertezza, marcatori cavi |
| `12-halley-indicativa.png` | Halley con livello "indicativa": orbita tratteggiata, arco ±ε, marcatore cavo; Hale-Bopp "non determinabile" assente |
| `13-riproduzione-rapida.png` | 1 anno/s con fuoco sulla Terra: marcatore della Luna sostituito dall'orbita evidenziata |
| `14-telefono-400.png` | 400 × 800: etichette limitate e disposte a destra o a sinistra |
| `15-itokawa-stabilita.png` | prova di oscillazione: Itokawa e la sua orbita |
| `16-occlusione-luna.png`, `17-occlusione-io.png` | prove di occlusione dopo la verifica dei pixel (marcatori riattivati) |
| `18-silhouette-terra.png`, `18-silhouette-giove.png` | orizzonte a quota 0,01 R dal punto subsolare |
| `19-contesto-ripristinato.png` | Terra dopo perdita e ripristino del contesto |
| `20-selezione-venere.png` | selezione da etichetta |
| `21-saturno-linee-dietro-anelli.png` | Saturno il 16/10/2017 a 600 000 km con orbite e assi: le linee dietro l'anello B sono nascoste, quelle davanti restano |
| `22-saturno-profilo-mediato.png` | stessa scena senza linee: divisioni di Encke e Keeler continue e attenuate |

## 8. Scostamenti dichiarati

- La proiezione su CPU (punto 6 del § 5.5) precede l'aggiornamento di marcatori e orbite, che ne usano i risultati; resta unica per frame.
- Orbite con e > 0,9: 16 punti aggiuntivi attorno al pericentro, oltre ai 256 uniformi e al raffinamento attorno al corpo.
- Archi aperti (iperbole, parabola): il vertice del corpo è interno alla polilinea (`indiceAncora`), non il primo.
- R10: la funzione unica `bodyFixedToScene` è sostituita dall'interfaccia `FornitoreOrientamento` (matrice corpo → eclittica J2000); gli impostori calcolano latitudine e longitudine analiticamente e non serve la rotazione polo y → z.
- Isteresi delle etichette: permanenza minima di 300 ms in ogni stato e su ogni lato; le etichette forzate e quelle con ancoraggio fuori campo cambiano subito.
- Luce diffusa minima 0,035 sul lato notturno, per leggere la sagoma.
- A21 in Vitest verifica media e mediana; il 95° percentile dipende dal carico della macchina ed è riportato al § 6.
- Oscillazione e2e: escursione dei residui rispetto all'andamento lineare nel tempo.
- Ombra del pianeta sugli anelli di Saturno rappresentata (non richiesta).
- Testi della scena (`+N lune`, `N UA`) in `src/render/testi.ts`, sostituibili con l'opzione `testi`.
