# Spike

Esiti delle prove preliminari S1-S6 del § 14.2 di `docs/PROGETTO.md`. Le misure complete sono in `docs/VALIDAZIONE.md`; i metodi in `docs/METODI.md`.

## Riepilogo

| Spike | Obiettivo | Esito | Decisione | Data |
|-------|-----------|-------|-----------|------|
| S1 Luna | correzioni con spline di Hermite, 60″ su griglia di 0,5 d, utilità di κ, ipotesi I11 | 20,56″ e 16,29 km su tutto l'intervallo; κ dimezza il residuo massimo a -9999 | κ adottato; σ_ṅ = 0,2″/cy² mantenuta | 18/10/2026 |
| S2 ASSIST | installazione, Cerere, Halley, Apophis, prima di -7999, DT, tempi dei cloni | ASSIST 1.2.3 con REBOUND 4.6.0 funzionante; Halley 12,8 km, Apophis 0,61 km; Cerere 22,55″ dopo 1000 anni; DT non supportato | ASSIST adottato; DT dichiarato non modellato; forza degli asteroidi disattivata prima di -7999 | 18-19/10/2026 |
| S3 Satelliti | record per sei satelliti, scelta di L e K, kernel lunghi contro estrapolazione secolare | K riduce l'errore dove esistono termini periodici brevi; L da 2 a 50 anni; kernel lunghi equivalenti solo per Dione, Rea e Tritone | durate e frequenze per satellite; kernel lunghi omessi per Dione, Rea, Tritone | 19/10/2026 |
| S4 Budget | dimensioni reali dei blocchi, campionamento dei piccoli corpi, totale | pianeti 19,75 MB; piccoli corpi 14,62 MB con `small/b11.bin` 5,33 MB; totale 46,62 MB | limite per file 6 MB; livello 4 di tolleranza dei piccoli corpi prima del 1600 | 18-19/10/2026; dati rimisurati il 22/10/2026 |
| S5 Rendering | impostore con profondità logaritmica e texture, orbita ancorata, emulazione Float32, prestazioni con SwiftShader | silhouette 0,000 px; orbita ancorata 0 px; frame 2-3 ms con SwiftShader | architettura del § 10 confermata | 18/10/2026 |
| S6 Pagina singola | pagina minima in uno scheletro che emula la piattaforma | eseguito con il pacchetto completo (criterio A24): script modulo relativo, fetch dei `.bin`, localStorage che lancia eccezioni, `#marte`, 400 px senza scorrimento orizzontale | modalità `artifact` di Vite e `scripts/make-artifact.mjs`; la lingua del documento è impostata da `src/main.ts` | 19/10/2026 |

## S1 Luna

- Spline di Hermite delle correzioni degli argomenti (ΔL′, ΔD, ΔM, ΔM′, ΔF) e di κ, nodi ogni 3 652,5 d da T0, 1 214 nodi; stima ai minimi quadrati contro DE441 su finestre di ±3 652,5 d a passo 1 d.
- Verifica su griglia di 0,5 d (8 853 922 istanti, nodi inclusi): errore angolare massimo 20,56″ (anno -9760), rms 3,91″; distanza 16,29 km. Soglie 60″ e 50 km rispettate.
- Senza correzioni (finestre di 10 anni contro DE441): 14,3″ dal 2000, 66″ dall'anno 0, 341″ dal -2000, 1 660″ dal -5000, 7 788″ dal -9999.

Utilità di κ (residui delle finestre su 49 nodi, uno ogni 25):

| Epoca | Senza κ: max (rms) | Con κ: max (rms) |
|-------|--------------------|------------------|
| -9999 | 37,8″ (12,1″) | 17,4″ (6,2″) |
| -7999 | 24,2″ (7,9″) | 14,8″ (4,9″) |
| -4999 | 16,3″ (4,1″) | 14,5″ (3,4″) |
| -1999 | 13,0″ (2,9″) | 13,0″ (2,9″) |
| 2001 | 14,6″ (2,8″) | 14,6″ (2,8″) |

Massimo sui 49 nodi: 37,8″ senza κ, 20,4″ con κ (distanza 21,7 km e 14,6 km). κ è adottato.

Ipotesi I11 (σ_ṅ = 0,2″/cy²):

- Williams e Boggs (2016): dn/dt = -25,97 ± 0,05″/cy² da Lunar Laser Ranging; differenza tra modelli geofisici della dissipazione e risultati LLR ≤ 1 % (circa 0,26″/cy²).
- Park et al. (2021): nessun valore esplicito di ṅ; DE441 senza smorzamento tra nucleo liquido e mantello; differenze lunari da DE440 inferiori a 2 m nell'arco LLR, crescenti fuori.
- σ_ṅ = 0,2″/cy² è 4 volte l'incertezza formale e dello stesso ordine della differenza tra modelli. Con 0,26″/cy² l'errore a T0 sarebbe 0,52° invece di 0,40°: il livello resta "buona". Ipotesi mantenuta; la variabilità della dissipazione mareale nell'Olocene non è quantificata dalle due fonti e resta non modellata.

## S2 ASSIST

- Installazione: ambiente `.venv-assist` con REBOUND 4.6.0, poi ASSIST 1.2.3 compilato contro il REBOUND installato (`pip install --no-build-isolation`); senza questo passo pip compila contro REBOUND 5, incompatibile.
- File: `linux_m13000p17000.441` (2 788 676 624 byte) e `sb441-n16.bsp` (645 727 232 byte), SHA-256 in `scripts/pipeline/raw/manifest-sorgenti.json`.

| Prova | Risultato |
|-------|-----------|
| Cerere: da sb441-n16 a JD -1 200 000,5, in avanti fino a -7000, contro sb441-n16 | senza asteroidi 71 850 km (31,98″); con gli altri 15 asteroidi 50 665 km (22,55″) |
| Cerere: da sb441-n16 al 2000, a ritroso fino a -7000, con 15 asteroidi | 137 921 km (61,38″) |
| Halley: traiettoria del record del -239 contro Horizons, 11 epoche dal -380 al -230 | massimo 12,8 km (0,0009″) |
| Apophis: dalla soluzione JPL#220 (A1, A2) contro Horizons, 17 epoche ogni 3 h dal 2029-04-13 0h TDB | massimo 0,61 km |
| DT (ritardo della curva non gravitazionale) | non implementato in ASSIST 1.2.3 (`src/forces.c`: solo A1, A2, A3 e g(r)) |
| Tempi dei cloni (un processo, 4 CPU condivise; misura del 18-19/10/2026, dipendente dal carico; altre misure della produzione dei dati in `docs/_parti/piccoli-corpi.md` § 3) | 16 cloni, 38 corpi: mediana 55 s (22-83 s); 64 cloni, 34 corpi: mediana 34 s (1,6-1 140 s; Chiron 1 140 s, Phaethon 653 s, Eros 461 s) |
| Passo di integrazione completo (72 corpi; misura del 18-19/10/2026) | 6 785 s di calcolo (circa 1 h con 2 processi) |

Prima di -7999 (senza asteroidi), scarto angolare dopo 100, 500, 1000 e 2000 anni di ASSIST senza asteroidi da -7999 in avanti contro sb441-n16:

| Corpo | 100 anni | 500 anni | 1000 anni | 2000 anni |
|-------|----------|----------|-----------|-----------|
| Cerere | 0,20″ | 6,5″ | 49″ | 99″ |
| Pallade | 0,54″ | 18″ | 135″ | 264″ |
| Giunone | 2,7″ | 31″ | 211″ | 964″ |
| Vesta | 1,7″ | 3,5″ | 6,4″ | 41″ |
| Igea | 4,8″ | 61″ | 140″ | 263″ |
| Psyche | 3,1″ | 28″ | 68″ | 163″ |
| Euphrosyne | 0,42″ | 7,5″ | 34″ | 93″ |
| 52 Europa | 0,33″ | 24″ | 61″ | 80″ |
| Sylvia | 0,13″ | 1,2″ | 2,5″ | 19″ |
| Davida | 1,1″ | 19″ | 78″ | 352″ |
| Interamnia | 2,5″ | 14″ | 51″ | 126″ |

Conclusioni:

- La soglia di 1″ per Cerere a -7000 (A7 nella versione 2.1 del progetto; dalla 2.2 ε(-7000) = 103″) non è raggiungibile: anche con gli stessi 15 perturbatori di sb441-n16 lo scarto dopo 1000 anni è 22,6″; la causa non è stata isolata. A -7000 i dati usano sb441-n16 stesso; prima di -7999 lo scarto della variante senza asteroidi entra in ε.
- Prima di -7999 l'integrazione riparte da uno stato fermato esattamente al limite, con un'effemeride senza asteroidi: ASSIST legge gli asteroidi anche con la forza disattivata e passi lunghi oltre l'inizio di sb441-n16 interrompono l'integrazione.
- Passo minimo di IAS15 1e-4 d per i cloni: con incontri quasi radenti di singoli cloni di Apophis l'integrazione si bloccava.
- DT ignorato per 2I, 3I, 46P, 67P, 81P, 103P: effetto solo prima del 1600, lontano dal Sole.

## S3 Satelliti

Metodo: analisi in frequenza su 100 anni attorno al 2000; record con raccordo su 40 anni per ogni durata L di prova, con K = 0 e con le frequenze trovate; errore massimo contro il kernel moderno su una griglia sfasata rispetto a quella di adattamento (`satellites.py scelte`, `out/spike-sats.json`).

Errore angolare massimo con K termini (tra parentesi con K = 0) / errore radiale massimo in frazione di a:

| Satellite | P (d) | K | L = 2 anni | L = 5 anni | L = 10 anni | L = 20 anni | L = 50 anni |
|-----------|-------|---|------------|------------|-------------|-------------|-------------|
| Io | 1,771 | 6 | 24″ (95″) / 0,01 % | 34″ (95″) / 0,01 % | 48″ (104″) / 0,01 % | | |
| Mimas | 0,947 | 6 | 69″ (782″) / 0,03 % | 97″ (749″) / 0,03 % | 194″ (918″) / 0,03 % | | |
| Iperione | 21,293 | 6 | 3 255″ (43 633″) / 1,58 % | 4 243″ (50 425″) / 2,65 % | 4 263″ (50 863″) / 3,29 % | | 5 010″ (54 848″) / 3,31 % |
| Tritone | 5,877 | 0 | 0,5″ / 0,00 % | 1,2″ / 0,00 % | 2,2″ / 0,00 % | 3,5″ / 0,00 % | |
| Nereide | 360,21 | 6 | 175″ (468″) / 0,04 % | 613″ (995″) / 0,09 % | 1 811″ (1 590″) / 0,17 % | | 8 773″ (8 825″) / 0,58 % |
| Caronte | 6,387 | 0 | 0,5″ / 0,00 % | 1,1″ / 0,00 % | 2,3″ / 0,00 % | 4,7″ / 0,00 % | |

Frequenze principali dei residui (K = 0): Io 462,5 d (36″), 482,4 d, 1,769 d, 2 059 d, 3,525 d (periodo sinodico Io-Europa); Mimas 225,1 d (481″) con bande laterali dovute alla librazione di 70 anni della risonanza Mimas-Teti; Iperione 640,5 d (32 941″, librazione della risonanza 4:3 con Titano); Nereide 370,5 d (402″), 182,6 d, 121,2 d; Tritone e Caronte sotto 1″ (K = 0).

Scelta di L e K: tra le durate entro le tolleranze del § 7.5.6 con margine 0,8, la più lunga con errore ≤ 30″ (per Iperione e gli irregolari un quarto della tolleranza), altrimenti la più lunga ≤ 1′, altrimenti la più lunga entro 1,5 volte il minimo; nelle zone dei kernel lunghi la più lunga entro le tolleranze. Durate adottate (kernel moderno / kernel lunghi, anni):

| Satelliti | L |
|-----------|---|
| Io, Encelado, Dione, Proteo | 2 / 10 |
| Europa, Titano | 2 / 20 |
| Giapeto | 2 / 50 |
| Imalia, Iperione, Febe | 2 / 2 |
| Ganimede, Callisto | 5 / 20 |
| Mimas, Teti, Ariel, Nereide | 5 / 10 |
| Fobos, Deimos, Amaltea, Miranda | 10 / 10 |
| Rea, Titania | 10 / 20 |
| Umbriel, Oberon, Tritone, Caronte | 20 / 20 |
| Notte, Idra | 50 / 50 |

Kernel lunghi contro estrapolazione secolare dal kernel moderno (criterio di omissione: differenza ≤ ε_estrapolazione/4 dove il satellite è determinabile, così che il livello non cambi):

| Satellite | Residuo secolare | σ_n (rad/anno) | Differenza massima | Rapporto massimo d/ε | Livello cambiato | Kernel lungo |
|-----------|------------------|----------------|--------------------|----------------------|------------------|--------------|
| Mimas | 48,213° | 8,19e-5 | 51,95° | 20,117 | 22,1 % | adottato |
| Encelado | 0,471° | 2,56e-7 | 0,82° | 0,345 | 0,0 % | adottato |
| Teti | 2,242° | 8,50e-7 | 6,67° | 2,614 | 1,6 % | adottato |
| Dione | 0,066° | 3,94e-8 | 0,34° | 0,113 | 0,0 % | omesso |
| Rea | 0,060° | 5,93e-9 | 0,37° | 0,171 | 0,0 % | omesso |
| Titano | 0,082° | 9,20e-8 | 1,29° | 0,668 | 0,1 % | adottato |
| Iperione | 15,321° | 2,01e-6 | 15,90° | 159,972 | 32,8 % | adottato |
| Giapeto | 0,229° | 9,63e-7 | 115,53° | 23,551 | 81,7 % | adottato |
| Febe | 2,668° | 1,94e-6 | 14,18° | 129,250 | 80,4 % | adottato |
| Miranda | 1,594° | 5,13e-6 | 65,78° | 1,170 | 19,3 % | adottato |
| Ariel | 0,242° | 3,36e-7 | 113,90° | 2,175 | 37,8 % | adottato |
| Umbriel | 0,183° | 1,07e-7 | 12,53° | 0,264 | 0,6 % | adottato |
| Titania | 0,322° | 4,62e-8 | 4,12° | 1,188 | 1,5 % | adottato |
| Oberon | 0,235° | 1,02e-7 | 1,67° | 0,922 | 0,2 % | adottato |
| Tritone (NEP098 e NEP097) | 0,004° | 1,79e-8 | 0,41° | 1,892 | 5,8 % | adottato (NEP097, 1600-1800) |
| Nereide | 11,062° | 1,41e-5 | 179,77° | 31,234 | 24,8 % | adottato |

Tritone: con NEP097 come kernel moderno il confronto con nep097xl-801 dà rapporto 0,198 e livello cambiato 1,2 %: nep097xl-801 non è adottato.

Conclusioni:

- K: grande beneficio dove esistono termini periodici più brevi del record (Mimas da 782″ a 69″, Iperione da 43 633″ a 3 255″ con L = 2 anni).
- L: le durate iniziali del § 7.5.2 (10/20/50 anni) rispettano le tolleranze dei satelliti regolari ma non portano gli errori sotto 1′; adottate durate da 2 a 50 anni.
- Limite del modello: con polo di F fisso, tan(i/2) costante e Ω lineare restano errori fuori dal piano indipendenti da L e K (Fobos 211-240″, Deimos 98-126″).
- Iperione, Imalia e Febe: nessuna durata di prova rispetta sempre l'1 % radiale; in produzione i record oltre 0,8 volte le tolleranze si dividono fino a 0,25 anni e l'1 % è rispettato (0,80 %, 0,81 %, 0,74 %).
- Tritone: `nep098_part-1.bsp` contiene la soluzione NEP098 usata da Horizons; con NEP097 lo scarto da Horizons era 20″ nel 2000 e 384″ nel 1907, con NEP098 è 2″.

## S4 Budget

Pianeti (blocchi reali):

| Configurazione | p00-p10 | p11 | p12 | Totale |
|----------------|---------|-----|-----|--------|
| Passi della versione 2.0 (Mercurio 32 d; EMB 32 d nei blocchi 0-10) | 1 082 152 byte | 1 356 328 byte | 151 360 byte | 13 411 360 byte |
| Passi adottati (Mercurio ed EMB 16 d ovunque) | 1 630 504 byte | 1 630 504 byte | 181 480 byte | 19 747 528 byte |

Con Mercurio a 32 d l'errore arrivava a 2,036″ (blocco 11, oltre 2″); con l'EMB a 32 d a 328 km (oltre 250 km).

Piccoli corpi (MB = 10^6 byte; dimensioni dei livelli in `scripts/pipeline/out/blocchi-piccoli-corpi.json` del 21/10/2026, ricalcolate il 22/10/2026 dai segmenti di ogni livello):

| Livello | τ dal -2000 al 1600 | τ prima del -2000 | Totale | b11 | Altri file |
|---------|---------------------|-------------------|--------|-----|------------|
| 0 (§ 7.6.3 della versione 2.0) | 1e-5 | 1e-5 | 33,60 MB | 6,95 MB | 1,40-3,42 MB |
| 1 (ripiego del § 15) | 1e-5 | 1e-4 | 30,51 MB | 6,95 MB | 1,40-3,42 MB |
| 2 | 1e-4 | 1e-3 | 21,62 MB | 6,03 MB | 0,97-2,20 MB |
| 3 | 3e-4 | 3e-3 | 16,81 MB | 5,63 MB | 0,62-1,64 MB |
| 4 (pubblicato) | 1e-3 | 1e-2 | 14,62 MB | 5,33 MB | 0,52-1,40 MB |
| 5 (solo misura) | 1e-2 | 1e-2 | 12,66 MB | 4,95 MB | 0,52-1,40 MB |
| 6 (solo misura: livello 4 con tolleranza della finestra × 10) | 1e-3 | 1e-2 | 12,19 MB | 3,46 MB | 0,52-1,25 MB |

- La finestra 1600-2121 alla tolleranza dell'A7 occupa 5,90 MB nei livelli 0-5 (4,50 MB in b11) e 3,47 MB nel livello 6; prima del 1600 la dimensione ha un minimo dovuto al passo massimo di 1024 d (segmenti C di corpi oltre 50 UA, iperbolici o quasi parabolici: 2,67 MB).
- Corpi campione del § 14.2 (byte nei 13 file, livello 4, rimisurati il 22/10/2026): Cerere 272 520; 1P/Halley 167 840; Apophis 121 264; Sedna 233 296; 3I/ATLAS 219 616.
- Satelliti 2 371 800 byte (file massimo 1 018 136); texture 8 680 970 byte; totale pubblicato 46 617 232 byte in 69 file (manifest compreso, 22/10/2026).

Decisioni: limite per file da 4 a 6 MB (limite della piattaforma: 15 MB per file binario), livello 4 per i piccoli corpi prima del 1600 (errore di rappresentazione ≤ 1e-3·r dal -2000 al 1600 e ≤ 1e-2·r prima, sommato a ε: prima del 1600 l'affidabilità dei piccoli corpi è al più "buona").

## S5 Rendering

| Prova | Risultato |
|-------|-----------|
| Impostore di ellissoide con profondità logaritmica e `gl_FragDepth`: silhouette di Terra e Giove a quota 0,01 R | errore massimo 0,000 px rispetto al bordo analitico in Float64 |
| Texture: convenzione u = lon0_u ± lon/2π, v = 0,5 - lat/π, riga 0 al polo nord | verificata con texture di prova (meridiano 0 rosso) e con le mappe reali (Occator su Cerere, Pele su Io, maria lunari, Sputnik Planitia) |
| Orbita ancorata con emulazione Float32 (`Math.fround`): 11 100 casi | 0 px; orbita non ancorata fino a 1,4e5 px |
| Oscillazione a 10 km da Itokawa | 0,0006 px (impostore), 0,022 px (orbita) |
| Prestazioni con SwiftShader (misura del 18/10/2026, dipendente dal carico) | CPU 1,3-2,8 ms per frame; frame completo 2-3 ms |
| Prestazioni in Node (misura del 18/10/2026, 4 CPU condivise; rimisure del 22/10/2026 in `docs/_parti/rendering.md` § 6) | media 0,62 ms per frame, 95° percentile 1,1 ms |

Scelte confermate: proiezione unica su CPU prima dell'aggiornamento di marcatori e orbite; interfaccia `FornitoreOrientamento` (matrice corpo → eclittica J2000) al posto di `bodyFixedToScene` con rotazione polo y → z; 16 punti aggiuntivi attorno al pericentro per e > 0,9.

## S6 Pagina singola

Eseguito sul pacchetto completo invece che su una pagina minima, con la prova A24 (Playwright, progetto `pagina-singola`).

- Pacchetto: `npm run build:artifact` (Vite in modalità `artifact`: `assets/app.js` e `assets/app.css` con nomi stabili, un solo file JavaScript) e `scripts/make-artifact.mjs`, che scrive il frammento senza doctype, `html` e `head` (titolo, Google Fonts, foglio di stile, stile in linea dello sfondo, `<div id="app">`, script modulo) e copia `assets/` e `data/v1/`.
- Server di prova `scripts/servi-artifact.mjs`: frammento avvolto in uno scheletro con charset, viewport con `viewport-fit=cover` e reset di base, servito da `/a/b/index.html`; Content-Security-Policy con la sola origine e Google Fonts.
- Esiti: caricamento completo (dati della data, `reliability.bin`, stelle, blocco adiacente) senza richieste esterne oltre ai caratteri e senza query string; tutti i file richiesti sotto `/a/b/`; `#marte` seleziona e inquadra Marte, `#giove` cambia il corpo; localStorage che lancia eccezioni senza errori; 400 px senza scorrimento orizzontale.
- Unica correzione: lo scheletro della piattaforma non dichiara la lingua; `src/main.ts` imposta `lang="it"` sull'elemento `html` (RNF8).
- Limiti (misura del 22/10/2026 sul pacchetto di `npm run build:artifact`; `assets/app.js` cambia a ogni modifica del codice, valori correnti in `docs/VALIDAZIONE.md` § 12.5): 73 file e 47,55 MB (RNF7: 90 file, 48 MB; piattaforma: 255 file e 64 MB per pubblicazione); file più grande `small/b11.bin`, 5,33 MB (RNF7 6 MB; piattaforma 15 MB per file binario); testo più grande `assets/app.js`, 0,87 MB (piattaforma 16 MB).
