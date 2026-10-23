# Piccoli corpi

Riferimento: `docs/PROGETTO.md` versione 2.0, § 4, 7.6, 7.8, 8.3, 8.6, 9, 12, 13 (A7, A9), 14.2 (S2, S4). Estrazione SBDB e Horizons del 18/10/2026 (`raw/small/estrazione.json`); SHA-256 dei file voluminosi in `scripts/pipeline/raw/manifest-sorgenti.json`. Tutte le misure sono del 18-19/10/2026 sui file e sulle cache indicati.

## 1. Prodotti

| Percorso | Contenuto |
|----------|-----------|
| `scripts/pipeline/small_bodies.py`, `scripts/pipeline/small/` | pipeline: scaricamento e congelamento, piano delle sorgenti, ASSIST, cloni, affidabilità, segmenti, blocchi, catalogo, validazione, fixture |
| `public/data/v1/small/b00.bin` … `b12.bin` | SSSERIE1 tipo 3, 72 corpi per file (§ 8.3, § 8.6) |
| `scripts/pipeline/out/catalog-small.json` | frammento di catalogo dei 72 corpi (§ 8.10) |
| `scripts/pipeline/out/reliability-small.json` | log10 ε_modello (rad), forma determinata, dati presenti sui 712 intervalli di `reliability.bin` (§ 8.7) |
| `scripts/pipeline/raw/small/` | risposte congelate: SBDB (72), elenchi e dati dei record DASTCOM (14 comete), vettori di validazione Horizons (50 epoche per corpo, richiesta unica e per gruppi), tabelle Horizons di Bennu e C/2013 A1, CNEOS, tabella 4 di Yeomans e Kiang 1981, `pck00011.tpc`, dati fisici di letteratura |
| `scripts/pipeline/.cache/assist/`, `.cache/small/` | file ASSIST, SPK Horizons (231 file, 681,9 MB), traiettorie, cloni, segmenti per livello, riepiloghi |
| `src/ephem/smallBodies.ts` | runtime |
| `tests/fixtures/small/casi.json` | fixture per Vitest |
| `scripts/pipeline/tests/test_small_*.py`, `tests/ephem/smallBodies.test.ts` | test |

Comandi (da `scripts/pipeline/`, ambiente `.venv-assist`): `small_bodies.py scarica | integra | segmenti --livello L | blocchi | catalogo | valida | fixture | tutto [--offline]`. Ogni passo salva i risultati per corpo in `.cache/small/<slug>/` e si può riprendere.

## 2. Sorgenti (§ 7.6.1)

- SBDB API (`sstr`, `cov=mat`, `phys-par=1`, `full-prec=1`): 72 risposte con orbit_id, soln_date, covarianza, parametri NG e dati fisici.
- Record per apparizione (DASTCOM, Horizons): 14 comete periodiche. Due record con perieli entro 100 d: si tiene quello con più osservazioni. Cambio all'afelio kepleriano del record precedente più vicino al punto medio tra i perieli.

| Cometa | Record | Primo | Ultimo (soluzione) |
|--------|--------|-------|--------------------|
| 1P | 30 | -239 | 1986 (JPL#75) |
| 2P | 60 | 1786 | 2023 (K273/23) |
| 9P | 12 | 1867 | 2016 |
| 12P | 3 | 1812 | 2024 |
| 19P | 14 | 1905 | 2022 |
| 21P | 16 | 1900 | 2018 |
| 26P | 20 | 1808 | 2013 |
| 29P | 7 | 1908 | 2019 |
| 46P | 10 | 1947 | 2018 |
| 55P | 5 | 1366 | 1998 |
| 67P | 8 | 1969 | 2015 |
| 81P | 7 | 1978 | 2022 |
| 103P | 5 | 1985 | 2017 |
| 109P | 5 | -68 | 1992 (JPL#32) |

Piano per intervallo (`small/piano.py`; fonti per intervallo nel catalogo, campo `effemeridi.fonti`):

| Classe | Corpi | Sorgenti |
|--------|-------|----------|
| sb441-n16 | 11 (Cerere, Pallade, Giunone, Vesta, Igea, Psyche, Euphrosyne, 52 Europa, Sylvia, Davida, Interamnia) | ASSIST [T0, JD -1 200 000,5) dallo stato sb441-n16, senza forza degli asteroidi; sb441-n16 [JD -1 200 000,5, 1600); SPK Horizons della soluzione corrente [1600, T_END) |
| comete a record | 14 | ogni record nel proprio intervallo: SPK Horizons del record (tipo 21, `spiceypy`) dal 1600, ASSIST dallo stato del record prima del 1600; prima del record più antico ASSIST dallo stesso record con i suoi parametri NG |
| altri | 45 | SPK Horizons della soluzione corrente [1600, T_END); prima ASSIST a ritroso dallo stato SPK al 1650-01-01, giunzione al 1600-01-01 |
| oggetti precalcolati | Bennu, C/2013 A1 | Horizons rifiuta l'SPK ("pre-computed object"): vettori Horizons tabulati a 1, 4 o 32 d secondo la distanza dal Sole (r < 3, < 10, oltre UA), Hermite cubica; prima ASSIST come sopra |

- Scostamento dal § 7.6.1 per i corpi in sb441-n16: nella finestra 1600-2121 si usa la soluzione corrente. Con sb441-n16 nella finestra l'A7 contro Horizons dava fino a 14 357 km (Psyche, 1621), 8 826 km (Euphrosyne), 8 359 km (Igea), 4 278 km (Cerere) contro la soglia di 500 km.
- Bennu: il modello NG della soluzione JPL#118 (AMRAT, RHO) non esiste in ASSIST; A1 = 7,1747e-13 e A2 = -4,5628e-14 UA/d² (g = 1/r²) adattati ai vettori Horizons: scarto 1,74 km rms, 5,16 km massimo.
- Vettori Horizons di validazione: Horizons ordina le epoche richieste e integra in sequenza dalla più antica. Con un'epoca antica in un tratto caotico le epoche successive cambiano: Apophis, richiesta unica 1601-2121, 1,8e8 km dall'SPK nel 1986; richiesta del solo 1923-1986, ≤ 0,5 km; richiesta di una sola epoca, 0,0 km. Le epoche si richiedono quindi in due gruppi per record o soluzione: dall'epoca degli elementi in avanti, e prima dell'epoca solo quelle con dati (`raw/small/horizons/vettori-gruppi/`).

## 3. ASSIST (S2)

- File (URL della documentazione di ASSIST e § 16.2): `linux_m13000p17000.441` (2 788 676 624 byte, SHA-256 4760964…cd4da, https://ssd.jpl.nasa.gov/ftp/eph/planets/Linux/de441/) e `sb441-n16.bsp` (645 727 232 byte, SHA-256 919d612…47fd90, https://ssd.jpl.nasa.gov/ftp/eph/small_bodies/asteroids_de441/), in `.cache/assist/`.
- ASSIST 1.2.3 con REBOUND 4.6.0 (ambiente `.venv-assist`), IAS15 adattivo; forze: Sole, pianeti, 16 asteroidi, NG di Marsden et al. 1973 (A1, A2, A3, g(r) con α, r0, m, n, k), J2 di Terra e Sole, relatività (GR_EIH). Coordinate baricentriche ICRF (UA, UA/d), conversione all'eclittica J2000 con `common.frames`.
- DT (ritardo della curva NG) non è implementato in ASSIST 1.2.3 (`src/forces.c`: solo A1, A2, A3 e g(r)): per 2I, 3I, 46P, 67P, 81P, 103P il DT della soluzione è ignorato nelle integrazioni (prima del 1600, lontano dal Sole; nella finestra valgono gli SPK Horizons).
- Prima di -7999 (JD -1 200 000,5) la forza degli asteroidi è disattivata: l'integrazione riparte da uno stato fermato esattamente al limite, con un'effemeride senza asteroidi (ASSIST legge gli asteroidi anche con la forza disattivata e passi lunghi oltre l'inizio di sb441-n16 interrompono l'integrazione).
- Simulazioni dei cloni: passo minimo di IAS15 1e-4 d (con incontri quasi radenti di singoli cloni di Apophis l'integrazione si bloccava); traiettorie nominali senza passo minimo.

Misure:

| Prova | Risultato |
|-------|-----------|
| Cerere: ASSIST da sb441-n16 a JD -1 200 000,5, in avanti fino a -7000, contro sb441-n16 | senza asteroidi 71 850 km (31,98″); con gli altri 15 asteroidi 50 665 km (22,55″) |
| Cerere: ASSIST da sb441-n16 al 2000, a ritroso fino a -7000, con 15 asteroidi | 137 921 km (61,38″) |
| ASSIST senza asteroidi da -7999 in avanti contro sb441-n16 (scarto angolare dopo 100, 500, 1000, 2000 anni) | Cerere 0,20″, 6,5″, 49″, 99″; Pallade 0,54″, 18″, 135″, 264″; Giunone 2,7″, 31″, 211″, 964″; Vesta 1,7″, 3,5″, 6,4″, 41″; Igea 4,8″, 61″, 140″, 263″; Psyche 3,1″, 28″, 68″, 163″; Euphrosyne 0,42″, 7,5″, 34″, 93″; 52 Europa 0,33″, 24″, 61″, 80″; Sylvia 0,13″, 1,2″, 2,5″, 19″; Davida 1,1″, 19″, 78″, 352″; Interamnia 2,5″, 14″, 51″, 126″ |
| Halley: traiettoria ASSIST del record 90000001 (-239) contro Horizons, epoche dal -380 al -230 | massimo 12,8 km (0,0009″) su 11 epoche |
| Apophis: ASSIST dalla soluzione JPL#220 (A1, A2) contro Horizons, 17 epoche ogni 3 h dal 2029-04-13 0h TDB | massimo 0,61 km |
| Tempi dei cloni (un processo, 4 CPU condivise) | 16 cloni, 38 corpi: mediana 60 s (20-150 s); 64 cloni, 34 corpi: mediana 48 s (2,4-1 462 s; Chiron 1 462 s, Phaethon 682 s, Eros 538 s); comete a record brevi perché i cloni coprono solo l'intervallo dell'ultimo record |
| Passo `integra` completo (72 corpi) | 8 702 s di calcolo (2,42 h; circa 1 h 15 min con 2 processi; cloni campionati ogni 1,25 anni dal 1900,7): 64 cloni mantenuti per le classi caotiche |

Cerere a -7000: la soglia A7 di 1″ non è raggiungibile. Anche con gli stessi 15 perturbatori di sb441-n16 lo scarto dopo 1000 anni è 22,6″: il modello di ASSIST per una particella di prova non riproduce l'integrazione a N corpi di sb441-n16 entro 1″ su 1000 anni; la causa non è stata isolata. Prima di -7999 questo scarto è incluso in ε (termine "senza asteroidi" alla stessa distanza da -7999); a -7000 vale sb441-n16 stesso. Proposta: soglia A7 per Cerere a -7000 pari a ε(-7000) senza errore di rappresentazione (5,0e-4 rad, 103″). Adottata nella versione 2.2 del progetto.

## 4. Cloni e affidabilità (§ 7.6.2, § 7.8)

- Cloni dalla covarianza SBDB (`cov=mat`), campionati attorno agli elementi della covarianza (`covariance.elements`) e integrati dalla sua epoca (`covariance.epoch`, dal 2004 al 2024 per i 45 corpi su 70 con covarianza in cui differisce da quella dell'orbita, 9/6/2026): elementi cometari e parametri NG presenti; parametri non dinamici (S0, AMRAT, RHO) campionati e ignorati. Seme 20261022 + ssid (record: + 1000). 64 cloni per le classi APO, ATE, AMO, IEO, JFc, HTC, CEN e per le comete con q < 1,5 UA, 16 per gli altri. C/1680 V1 e C/1965 S1-A (soluzioni senza covarianza): deviazioni pari a metà dell'ultima cifra stampata.
- Una simulazione per corpo: nominale, nominale senza NG (se NG), cloni come particelle di prova; variante senza asteroidi in parallelo. Integrazione interrotta quando ε supera 90°.
- Metrica per istante (ogni 10 anni fino al 1900,7, ogni 1,25 anni dopo; comprende tutti i nodi di `reliability.bin`): 95° percentile tra i cloni del massimo tra angolo eliocentrico e |Δr|/r, cioè l'errore di posizione visto dal Sole; più la massima differenza tra varianti (senza NG, senza asteroidi; per i corpi in sb441-n16 ASSIST contro sb441-n16); prima di -7999 più lo scarto della variante senza asteroidi alla stessa distanza dall'epoca (per i corpi in sb441-n16: prova in avanti da -7999 contro sb441-n16). Cumulata in modo monotono allontanandosi dall'epoca.
- Comete a record: nell'intervallo di un record intermedio ε vale all'apparizione (epoca del record) il minore dei salti (stessa metrica) con i record adiacenti e cresce linearmente nel tempo fino al salto misurato a ciascun istante di cambio (`costruzione._rampa_record`); nell'intervallo del record più antico, il salto con il successivo; prima del record più antico cloni con deviazioni empiriche (differenza tra il record successivo propagato all'epoca del più antico e il più antico, con minimo a metà dell'ultima cifra).
- Errore di rappresentazione: la tolleranza dei segmenti del livello pubblicato è sommata a ε (§ 5) come angolo visto dal Sole. Per istante la parte relativa; nella finestra 1600-2121, per ogni intervallo dei nodi, max(500 km/r_min, 1e-7), con r_min distanza minima dal Sole dei segmenti nell'intervallo (`costruzione.pavimento_finestra`). Cerere nell'intervallo 1999,4-2000,7: ε da 0,033″ a 0,283″ (r_min 2,55 UA); Phaethon (q = 0,14 UA) passa da "precisa" a "buona" negli intervalli 1920,7-1960,7 (da 55,1″ a 60,1″).
- Forma determinata: 95° percentile tra i cloni di |Δa/a| ≤ 5 %, |Δe| ≤ 0,05, |Δi| ≤ 5°, cumulata.
- Alle giunzioni tra sorgenti e tra record ε non è inferiore al salto misurato (campioni aggiunti agli istanti di giunzione).
- Frammento `reliability-small.json`: per intervallo, log10 del massimo di ε nell'intervallo chiuso [nodo, nodo successivo], arrotondato per eccesso; null oltre l'arresto dei cloni; `datiPresenti` dalla copertura effettiva dei segmenti. `epsModelloCostante` = null per tutti i 72 corpi.
- Bennu: la variante senza NG (senza Yarkovsky) dopo l'incontro con la Terra del 2060 porta ε a 0,81 rad nel 2102 e oltre 90° nel 2118: Bennu è "non determinabile" dall'intervallo che inizia nel 2116,9. La covarianza JPL#118 contiene AMRAT e RHO, non A1 e A2: i cloni non disperdono la forza NG e la variante senza NG, prescritta dal § 7.6.2, è l'unica stima del suo effetto.
- 21P: la variante senza NG al perielio del 2105 si scosta di 2,28 rad (campione del 2105,7): 21P è "non determinabile" dall'intervallo che inizia nel 2104,4.
- Epoca della covarianza: SBDB dà gli elementi dell'orbita all'epoca standard (JD 2 461 200,5, 9/6/2026) e la covarianza a un'altra epoca, con i propri elementi in `covariance.elements` (la documentazione dell'API dice che la covarianza vale solo all'epoca della soluzione). Riguarda gli asteroidi e i TNO (45 corpi su 70 con covarianza; non comete, interstellari e Bennu). Prima della correzione `campiona` sommava il rumore della matrice agli elementi dell'orbita e `stati_cloni` integrava da 9/6/2026: le correlazioni di un'altra epoca, con incontri ravvicinati nel mezzo (Itokawa: covarianza al 1/1/2004, orbita al 9/6/2026, Terra a 0,0129 UA il 26/6/2004), davano una dispersione da 280 a 1 700 volte maggiore. Ora `sbdb.orbita_covarianza` fornisce epoca ed elementi della covarianza; `elabora.integra_corpo` campiona, integra nominale, varianti e cloni e cumula ε da quell'epoca, mentre la traiettoria dei dati parte dall'orbita all'epoca standard; `sbdb.covarianza_elementi` (quindi `campiona`) rifiuta una covarianza con un nominale di un'altra epoca (`tests/test_small_cloni.py`). Rigenerati i cloni dei 45 corpi (15 862 s di calcolo con 2 processi e CPU condivise), poi segmenti (livelli 0-6), blocchi, frammenti di catalogo e di affidabilità, fixture, `catalog.py`, `reliability_pack.py`, `pack.py`; gli altri 27 corpi sono invariati.
- Effetto (VALIDAZIONE § 7.5): Itokawa, 95° percentile dei cloni al 1° gennaio 1900, 1850 e 1800 da 756,3″, 45 073″ e 216 843″ a 2,69″, 38,7″ e 127,5″ (281, 1 164 e 1 701 volte meno), contro 4,214″, 62,12″ e 197,2″ (3σ di JPL Horizons, RA_3sigma, JPL#237): prima da 180 a 1 100 volte i 3σ, ora 0,64, 0,62 e 0,65 volte (circa 2σ). Dati di Itokawa dal 10/9/1700 invece che dall'11/9/1840 e livelli più alti fino al 1920 (1860,7: da "approssimata" a "buona"; 1900,7: da "approssimata" a "precisa"). Apophis: 2,2, 2,2 e 5,7 volte meno nel 1900, 1850 e 1800 (4,76″, 1 054″ e 77 517″ contro 8,11″, 1 758″ e 281 645″ di Horizons); dopo il 2029 i cloni dal 2021 dispersono di più e la variante senza NG, integrata dal 2021, passa nel 2059 da 337″ a 25 283″ (ε da 0,18° a 7,1°): dati di Apophis fino al 13/9/2120. Gli altri 43 corpi: rapporto prima/dopo da 0,85 a 1,23 (38 corpi, mediana 1,03) e da 1,3 a 1,95 per Chiron, Hektor, Orco e Ryugu (dati di Ryugu dal 1420 invece che dal 1440); Cerere, con percentile sotto 0,005″, da 0,08 a 0,85.

Inizio dei dati (primo istante determinabile; fine al 2121 per tutti tranne Apophis, 2120,7, Bennu, 2116,9, e 21P, 2104,4):

| Inizio | Corpi |
|--------|-------|
| T0 (-10000-08-30) | 12 TNO (pianeti nani inclusi), Chariklo, 20 asteroidi della fascia principale (Cerere e Sylvia incluse), Eros, 3 troiani, C/1975 V1, C/1996 B2, C/2006 P1, C/2013 A1, C/2023 A3, 1I, 2I, 3I (45 corpi) |
| -8000 … -1000 | C/1680 V1 (-8000), Hale-Bopp (-6880), NEOWISE (-2440), Braille (-1420), Phaethon (-1240), 12P (-1100) |
| -1000 … 1600 | 109P (-440), 1P (-380), Chiron (360), Didymos (760), Ikeya-Seki (1140), 55P (1320), Toutatis (1340), 29P (1380), Ryugu (1420), 9P (1580) |
| 1600 … 2121 | 2P, 19P (1600), 21P (1680), Bennu, Itokawa (1700), 26P, 46P (1780), 67P (1820), Apophis (1860), 81P (1900), 103P (1940) |

## 5. Segmenti e budget (§ 7.6.3, § 8.1, § 15; S4)

### 5.1 Metodo (`small/segmenti.py`, `small/costruzione.py`)

- Segmenti E (residui Float32, Lagrange a 8 punti) ammessi se e ≤ 0,98, orbita ellittica e r ≤ 50 UA in tutti i campioni dello stencil, e se l'arrotondamento Float32 di h, k, p, q (memorizzati come valori assoluti) sposta il corpo di non più di metà della tolleranza; altrimenti C (Float64, Hermite cubica). Passi 2^k d da 1/64 a 1024 d, griglie allineate a T0.
- Per ogni cella della griglia il passo più grande che rispetta la tolleranza nel punto medio, nei punti delle celle tagliate dai bordi e, se il passaggio al perielio è breve rispetto al passo, a tp + {0, ±0,5, ±1, ±2}·q/v_q; accettazione con errore ≤ 0,9 volte la tolleranza. Nei tratti a passo E ≤ 16 d si sceglie C se occupa meno byte. Partizione in segmenti di dimensione minima (programmazione dinamica su intestazione di 80 byte, aloni e campioni) e verifica finale di ogni segmento.
- Elementi E oltre 2-4 UA (peso 0 entro 2 UA, 1 oltre 4 UA, raccordo C¹): velocità con la velocità baricentrica del Sole dovuta a Mercurio, Venere, Terra-Luna e Marte (≤ 0,2 m/s). La posizione ai nodi non cambia; sparisce l'oscillazione annua degli elementi osculanti. Eris al JD -500 000,5, passo 256 d: errore massimo 787 km con la correzione, 2 615 km senza. La velocità restituita dai segmenti E include la correzione.
- Tolleranze: finestra [1600, 2121) max(500 km, 1e-7·r) (§ 7.6.3); prima del 1600 max(τ·r, 0,05·ε(t)·r), con τ del livello (tabella 5.2). Dove il livello è "non determinabile" nessun dato.
- Sorgente unica per segmento; negli aloni oltre la copertura di una sorgente si usa la sorgente adiacente se il salto alla giunzione è ≤ 0,1 volte la tolleranza.
- Segmenti al livello pubblicato: 6 404 E (10 870 648 byte) e 893 C (3 680 032 byte).
- Unica eccedenza: C/1680 V1 al perielio (q = 0,0062 UA, 1680-12-18), segmento C al passo minimo di 1/64 d con errore di 759 km (1,52 volte la tolleranza di 500 km): il passaggio al perielio (q/v_q circa 0,02 d) non è rappresentabile con il passo minimo del § 7.6.3.

### 5.2 Dimensioni misurate (S4)

MB = 10^6 byte. Livelli in `small/costruzione.py` (`LIVELLI`); misure in `out/blocchi-piccoli-corpi.json`.

| Livello | τ dal -2000 al 1600 | τ prima del -2000 | Totale | b11 | Altri file |
|---------|---------------------|-------------------|--------|-----|------------|
| 0 (§ 7.6.3) | 1e-5 | 1e-5 | 33,60 MB | 6,95 MB | 1,40-3,42 MB |
| 1 (ripiego del § 15) | 1e-5 | 1e-4 | 30,51 MB | 6,95 MB | 1,40-3,42 MB |
| 2 | 1e-4 | 1e-3 | 21,62 MB | 6,03 MB | 0,97-2,20 MB |
| 3 | 3e-4 | 3e-3 | 16,81 MB | 5,63 MB | 0,62-1,64 MB |
| 4 (pubblicato) | 1e-3 | 1e-2 | 14,62 MB | 5,33 MB | 0,52-1,40 MB |
| 5 (solo misura) | 1e-2 | 1e-2 | 12,66 MB | 4,95 MB | 0,52-1,40 MB |
| 6 (solo misura: livello 4 con tolleranza della finestra × 10) | 1e-3 | 1e-2 | 12,19 MB | 3,46 MB | 0,52-1,25 MB |

- Finestra 1600-2121, uguale in tutti i livelli: 5,90 MB (b11 4,50 MB per il 1600-2011, b12 1,40 MB). Per classe: fascia principale 19 corpi 1,51 MB (E a 64 d), NEA e Braille 9 corpi 1,51 MB (Phaethon 0,29 MB; Itokawa, con i dati dal 1700, da 0,11 a 0,17 MB), comete gioviane ed Encke 10 corpi 1,06 MB, TNO 12 corpi 0,53 MB, comete di Halley 4 corpi 0,43 MB, comete non periodiche e interstellari 12 corpi 0,47 MB, troiani 0,18 MB, centauri 0,14 MB, Sylvia 0,08 MB. Intestazioni e aloni: 17 % della finestra.
- Sensibilità della finestra alla tolleranza (livello 6, max(5 000 km, 1e-6·r)): finestra 3,47 MB (-41 %), b11 3,46 MB, b12 0,84 MB, totale 12,19 MB. Il guadagno viene da passi E e C più lunghi e da segmenti E ammessi dove a 500 km l'arrotondamento Float32 impone C. Non è adottato: abbassa la soglia A7 nella finestra (500 km) e quella A9 di Apophis (500 km). Esempio di dipendenza dal passo: Cerere da sb441-n16 (120 nodi da JD 0,5), errore massimo 7 316 km con passo 128 d e 109 086 km con 256 d; nella finestra serve il passo di 64 d.
- Prima del 1600 la dimensione ha un minimo: nel livello 4 il 65 % dei byte prima del 1600 (5,63 MB su 8,70 MB) è già al passo massimo di 1024 d (C 2,67 MB: corpi oltre 50 UA, iperbolici o con e > 0,98, che il § 7.6.3 ammette solo come C; E 2,96 MB). Con 1e-2·r in tutto il periodo prima del 1600 (livello 5) il totale resta 12,66 MB e b11 4,95 MB.
- Continuità ai confini dei blocchi (livello pubblicato, 604 confronti): al massimo 18,4 km (2,4e-8·r, Hektor al confine 6).

### 5.3 Scelta ed effetto sull'accuratezza

- Nessun livello rispetta il budget della versione 2.0 del progetto (4 MB per file, 12 MB per i piccoli corpi): b11 supera 4 MB per la sola finestra (4,50 MB) e il totale non scende sotto 12,66 MB (livello 5) senza allargare la tolleranza della finestra. `blocchi` pubblica quindi il livello 4, il più compatto tra i candidati (0-4); il livello è registrato in `out/blocchi-piccoli-corpi.json` e si cambia con `small_bodies.py blocchi --livello-blocchi L`.
- Pubblicato: livello 4, 14 624 384 byte (b00-b07 0,52-0,58 MB, b08-b10 1,07-1,25 MB, b11 5,33 MB, b12 1,40 MB).
- Effetto: nella finestra 1600-2121 nessuno (tolleranza del § 7.6.3, A7). Prima del 1600 errore di rappresentazione ≤ 1e-3·r (3,4′) dal -2000 al 1600 e ≤ 1e-2·r (34′) prima del -2000, o 0,05·ε·r se maggiore, contro 1e-5·r (2,1″) del § 7.6.3 e 1e-4·r (21″) del ripiego del § 15. La tolleranza è sommata a ε nel frammento di affidabilità: prima del 1600 nessun corpo è "preciso" (≤ 1′); il livello è al più "buono" (≤ 1°). Per i corpi con ε propria piccola (Cerere, senza errore di rappresentazione: 1,9e-5 rad all'anno 0, 2,4e-4 rad al -6000) la rappresentazione domina l'errore dichiarato.

### 5.4 Proposta

Esito: la versione 2.1 del progetto porta il limite per file a 6 MB (§ 8.1, RNF7); il livello 4 lo rispetta e `pack.py` non segnala errori.

- Budget dei piccoli corpi 14,6 MB e limite di 5,4 MB per `small/b11.bin` (limite della piattaforma: 15 MB per file binario, RNF7), da ripartire con gli altri moduli nel limite complessivo di 48 MB (pianeti: 19,75 MB misurati).
- Con budget maggiore: livello 3 (errore di rappresentazione ≤ 1′ dal -2000 al 1600, ≤ 10′ prima), 16,81 MB, b11 5,63 MB.
- Per rispettare 4 MB per file serve una tolleranza più larga anche nella finestra: con max(5 000 km, 1e-6·r) b11 scende a 3,46 MB e il totale a 12,19 MB (livello 6). Richiede di abbassare la soglia A7 nella finestra e di mantenere 500 km attorno agli incontri ravvicinati per l'A9 di Apophis (forma mista non misurata).
- I segmenti C al passo massimo di 1024 d prima del 1600 occupano 2,67 MB (corpi oltre 50 UA, iperbolici o quasi parabolici): un passo massimo maggiore per i soli segmenti C ridurrebbe questa quota, con modifica del § 7.6.3 e del formato (non misurata).

## 6. Catalogo (§ 4.3, § 8.10, § 9)

- Nomi: forma italiana solo per Cerere, Pallade, Giunone, Vesta, Igea, Orco, Issione (§ 4.3); alias: forma italiana, nome ufficiale, numero, designazione provvisoria, sigla. Comete con numerale d'uso (9P/Tempel 1, 29P/Schwassmann-Wachmann 1, 81P/Wild 2, 103P/Hartley 2): nome con il numerale, nome ufficiale dell'MPC senza numerale (§ 4.3).
- `soluzione`: id JPL (orbit_id), data della soluzione, data di estrazione, modello NG (A1, A2, A3, DT, g(r) se non standard; per Bennu i parametri adattati), record DASTCOM con soluzione per le comete a record.
- `effemeridi.fonti`: intervalli con tipo (`sb441-n16`, `spk-horizons`, `record-dastcom`, `assist`), descrizione, varianti e salto misurato alla giunzione d'inizio (km). Gli intervalli non determinabili sono esclusi.
- Dati fisici con fonte e anno (`{valore, incertezza, fonte, anno}` o null): priorità SBDB (estensione triassiale, con i semiassi in ordine decrescente, poi biassiale, poi raggi di `pck00011.tpc` cercati con `codici_naif`, cioè codice del modello WGCCRE o di sb441-n16, 2 000 000 + numero per i pianetini, SPK-ID per le comete: anche Mathilde e 81P, poi diametro), altrimenti fonti primarie del § 9 (`raw/small/fisica-letteratura.json`): Eris (Sicardy et al. 2011; GM del sistema da Holler et al. 2021), Haumea triassiale (Ortiz et al. 2017; GM da Ragozzine e Brown 2009, massa di Haumea dal modello a tre corpi), Makemake (Ortiz et al. 2012), Gonggong (Kiss et al. 2019: raggio, albedo pV 0,14 ± 0,01 della tab. 3, massa 1,75 ± 0,07·10²¹ kg; periodo a doppio picco di Pál et al. 2016, 44,81 ± 0,37 h), Quaoar (occultazione del 2022, Pereira et al. 2023: raggio equivalente all'area 543 ± 2 km, pV 0,124 ± 0,006; il valore radiometrico del sistema di Fornasier et al. 2013 è superato), Sedna (Pál et al. 2012), Orco e Salacia (Fornasier et al. 2013; masse dei sistemi da Brown et al. 2010 e Collyer et al. 2025), Quaoar (massa del sistema da Braga-Ribas et al. 2025; periodo a doppio picco di Ortiz et al. 2003, 17,6788 ± 0,0004 h, adottato da Pereira et al. 2023), Patroclus (assi medi 127 × 117 × 98 km del primario, Buie et al. 2015; massa del sistema con Menoetius, Grundy et al. 2018), Hektor (Marchis et al. 2014: massa del primario, raggio equivalente 125 ± 13 km, periodo 6,92050885 h, polo eclittico J2000 λ = 332°, β = -32° ± 10°) ed Eurybates (massa del primario, Brown et al. 2021), Varuna (Lellouch et al. 2013, valori riportati nella tabella 3 di Müller, Lellouch, Fornasier 2020; il dato SBDB non è aggiornato), Issione (occultazioni 2020-2023, Kilic et al. 2026: raggio equivalente 348,39 km, pV 0,106 ± 0,003; la radiometria di Lellouch et al. 2013, 308,5 ± 10 km, è superata), Máni (occultazione, Rommel et al. 2023, al posto della radiometria di Vilenius et al. 2012), Sylvia (raggio 136,5 km dal diametro equivalente in volume di 273 km del modello di forma, Berthier et al. 2014, con ± 10 km a 3 σ convertiti a 1 σ, ± 1,67 km; massa del primario, Fang et al. 2012), Igea (raggio equivalente 217 ± 7 km, Vernazza et al. 2020), Interamnia (diametro equivalente 332 ± 6 km, raggio 166 ± 3 km, e periodo siderale 8,712336 h, Hanuš et al. 2020), Giunone, Euphrosyne, 52 Europa, Patientia, Davida (GM: costanti MA di DE441), Arrokoth (Spencer et al. 2020, anche il polo), 67P (albedo 0,065 ± 0,002 a 649 nm, Fornasier et al. 2015), C/1996 B2 (nucleo di 2-3 km dal radar, Harmon et al. 1997), ʻOumuamua (Meech et al. 2017), 2I (Jewitt et al. 2020), 3I (Jewitt et al. 2025). Valori di letteratura che prevalgono sul dato SBDB superato (`PRECEDENZA_LETTERATURA`): Varuna, raggi e albedo; Eris, rotazione sincrona con Disnomia (Szakáts et al. 2023; il valore LCDB di 25,9 h si basa su una copertura parziale); Salacia, rotazione sincrona con Actea (Collyer et al. 2025; i 6,09 h della LCDB sono un alias); Quaoar e Gonggong, periodi a doppio picco (LCDB: 8,84 h e 22,4 h a picco singolo, copertura parziale); raggi di Chiron (Fornasier et al. 2013), Chariklo (triassiale, Morgado et al. 2021), Didymos (Daly et al. 2023), 103P (raggio medio del sorvolo EPOXI, Thomas et al. 2013), Igea (il diametro IRAS di SBDB, 407 km, è superato dal modello di forma), Interamnia (diametro NEOWISE 306 km e periodo LCDB 8,727 h, superati dal modello di forma), Sylvia (diametro NEOWISE 253 km), Hektor (diametro di 225 km di "J.G. Williams 9-90", senza incertezza) e Patroclus (il diametro NEOWISE di SBDB, 140,4 km, è del sistema non risolto con Menoetius); albedo di Chiron e Chariklo da Fornasier et al. 2013 (Chiron: stessa soluzione NEATM del raggio, 0,167; Chariklo: soluzione termofisica con D = 248 ± 18 km, 0,035 ± 0,010; SBDB: radiometria del 2002); albedo SBDB di Igea (IRAS, 0,0717), Interamnia (NEOWISE, 0,078) e Sylvia (NEOWISE, 0,046) non adottate, perché legate ai diametri superati (portate al diametro maggiore scenderebbero del 12-15 %) e senza una soluzione coerente nelle fonti dei modelli di forma: "non noto"; albedo SBDB di Hektor (TRIAD, 0,025, qualità 3, senza incertezza) non adottata, perché con H = 7,32 corrisponde a un diametro di circa 289 km e non ai 250 ± 26 km di Marchis et al. 2014, che non pubblicano un'albedo: "non noto" (`SBDB_SUPERATO_SENZA_SOSTITUTO`); GM di 67P (Pätzold et al. 2016: 666,2 m³/s², SBDB 662,2 con lo stesso riferimento), Itokawa (G·M con la massa di Fujiwara et al. 2006 citata da SBDB, che riporta 2,1·10⁻⁹ km³/s²), Igea e Interamnia (costanti MA di DE441 al posto di Scholl et al. 1987 e Landgraf 1992). GM di Didymos: massa del sistema (Daly et al. 2023). 19P: diametro SBDB, perché il raggio medio di `pck00011.tpc` (4,22 km) supera il primo semiasse dichiarato nello stesso file (3,5 km). Corpi con modello WGCCRE: periodo di rotazione 360°/Ẇ, uguale alla rotazione rappresentata (19P: 26,64 h; 67P: 12,4041 h, mentre SBDB riporta 12,76129 h, valore anteriore al perielio 2009 secondo Mottola et al. 2014), e inclinazione dell'asse tra il polo positivo e la normale all'orbita osculante SBDB (oltre 90°, rotazione retrograda: Lutetia 95,2°, 19P 103,7°, Ida 156,0°, Šteins 172,2°, Itokawa 178,7°). Anno della fonte SBDB: primo anno del riferimento, esclusi i titoli tra virgolette; punto finale del riferimento del polo tolto prima di "e dall'orbita" (Ryugu). Ryugu: estensione biassiale SBDB interpretata come sferoide oblato. Parametri SBDB marcati "value unverified" esclusi (diametro di C/1996 B2, 4,2 km, rif. DASTCOM). Senza modello WGCCRE, inclinazione dell'asse dal polo SBDB ("spin-pole direction": Bennu 177,5°, Ryugu 171,7°, Didymos 170,8°) o di letteratura (Arrokoth 99,3° ± 1,0°, Spencer et al. 2020; Hektor 117,0° ± 9,8°, Marchis et al. 2014, polo eclittico J2000 convertito in A.R. e Dec. da `polo_noto`) e dall'orbita osculante SBDB, senza modello di rotazione. Incertezza dell'inclinazione (`incertezza_inclinazione`) solo con il polo di letteratura: "incertezza_gradi" della fonte (1 σ su ciascuna coordinata), propagata al primo ordine nelle coordinate della fonte (A.R. e Dec. per Arrokoth, λ e β eclittici per Hektor, non convertiti), σ² = (∂ε/∂c₁·σ)² + (∂ε/∂c₂·σ)², derivate per differenze centrali con passo di 10⁻³ gradi, orbita osculante SBDB senza incertezza; confronto con una simulazione Monte Carlo di 200 000 poli (seme 20261022) entro il 3 %; nessuna incertezza per i poli SBDB (campo sigma in formati diversi) e WGCCRE (Archinal et al. 2018 non la dà). Nomi e designazioni dei pianetini numerati e nomi ufficiali delle comete periodiche numerate ("NP/nome", senza numerale d'uso: 9P/Tempel, 29P/Schwassmann-Wachmann, 81P/Wild, 103P/Hartley; IAU Comet-Naming Guidelines, art. 5.5): Identifier API del Minor Planet Center (`small/mpc.py`, risposta in `raw/small/mpc-identificatori.json`), confrontati da `catalog.py`. Comete senza dimensioni misurate: null.
- Orientamento: WGCCRE (Archinal et al. 2018, valori di NAIF `pck00011.tpc`) per Cerere, Pallade, Vesta, Lutetia, 52 Europa, Eros, Davida, Šteins, Itokawa, Ida, Gaspra, 19P, 67P, 9P; `convenzionePolo` "momento-angolare" (polo positivo per pianeti nani, asteroidi e comete); `indicativo` vero fuori dal 1600-2121 come da § 7.6.4. Altri corpi: modello "fisso" (assi allineati all'eclittica J2000), dichiarato indicativo.

## 7. Runtime (`src/ephem/smallBodies.ts`)

- `EffemeridiPiccoliCorpi`: `carica(k, buf)` (lettore SSSERIE1 delle fondamenta, tipo 3, controllo del blocco), `rilascia(k)`, `caricato(k)`, `serie(k)`, `stateAt(ssid, jdTT, out)` e `orbitAt(ssid, jdTT, soleBaricentrico, out, forma)`.
- Esiti: 'fuori-copertura' fuori da [T0, T_END), 'caricamento' se il blocco non è caricato, 'non-determinabile' senza segmento; mai estrapolazione; nessuna allocazione per chiamata (memoria di lavoro di modulo).
- `elementiOrbitaDaStato`: elementi eliocentrici (μ = GM del Sole) o baricentrici se r > 50 UA, a qualsiasi eccentricità, e il chiamante passa lo stato baricentrico del Sole (§ 7.6.5, μ = GM del Sole più i nove sistemi di DE441). Vicino al perielio delle comete quasi paraboliche la conica baricentrica non descrive il moto (C/1975 V1-A il 25/2/1976: a = 10,3 UA invece di -11 010 UA).
- `percorsoBloccoPiccoliCorpi(k)` → `small/bKK.bin`.

## 8. Validazione (§ 13)

Comando: `small_bodies.py valida` (2 min con risposte congelate; `--offline` senza rete). Risultati in `out/validazione-piccoli-corpi.json` (versionato).

### 8.1 A7

| Prova | Soglia | Risultato | Esito |
|-------|--------|-----------|-------|
| Interpolazione: 200 epoche casuali per corpo nei nuclei con dati (seme 20261023 + ssid) contro la sorgente | tolleranza del segmento | 14 400 epoche, tutte 'ok'; rapporto massimo 0,884 (Dinkinesh) | superata |
| Verifica di costruzione di ogni segmento (punti medi delle celle, celle tagliate, perieli) | tolleranza | rapporto ≤ 0,900 per 7 308 segmenti; C/1680 V1 1,517 (759 km al perielio) | superata tranne C/1680 V1 |
| 50 epoche per corpo contro i vettori Horizons nella finestra (seme 20261021 + ssid; per le comete a record il record in vigore) | max(500 km, 1e-7·r) | 3 545 epoche servite da Horizons, 3 352 con dati (le altre "non determinabili"); rapporto massimo 0,882 (9P), mediana dei massimi per corpo 0,652 | superata |
| Giunzione ASSIST-Horizons (47 corpi) | 1e-5·r | al 1600: 45 corpi 0,7-53,3 km (≤ 1,3e-7·r), C/2013 A1 (tabella) 1 899,7 km (4,1e-8·r); Bennu al 1900, inizio della tabella Horizons, 2,5 km; sovrapposizione 1600-1650 (45 corpi): massimo 1 899,7 km, massimo relativo 3,7e-7·r (Toutatis) | superata |
| Giunzione al 1600, sb441-n16 contro SPK Horizons (11 corpi) | 1e-5·r | Pallade 8,9e-7, Giunone 1,8e-6, Sylvia 1,9e-6, Davida 5,4e-6, Vesta 6,1e-6, Interamnia 6,3e-6, 52 Europa 9,3e-6, Cerere 1,1e-5 (4 281 km), Euphrosyne 1,1e-5, Igea 2,0e-5, Psyche 3,9e-5 (15 220 km) | non superata per 4 corpi |
| Giunzione al 1600 delle comete a record (ASSIST e SPK dello stesso record) | 1e-5·r | 1P 1,4 km, 2P 15,2 km, 12P 261 km, 29P 471 km, 55P 212 km, 109P 185 km (≤ 5,2e-7·r); 19P 5 312 km (7,1e-6); 9P 48 008 km (1,3e-4) | 9P non superata (ε(1600) = 1,28 rad) |
| Salti tra record consecutivi (188) | 1e-5·r | 142 oltre la soglia; per cometa (minimo-massimo, oltre soglia): 1P 3,1e-5-6,2e-4 (29 su 29), 2P 1,2e-6-2,8e-3 (47 su 59), 9P 1,5e-7-1,5e-4 (1 su 11), 12P 1,2e-4-1,7e-4 (2 su 2), 19P 1,6e-5-7,5e-5 (13 su 13), 21P 2,5e-5-1,7e-4 (15 su 15), 26P 2,1e-6-2,3e-2 (8 su 19), 29P 3,5e-7-2,3e-6 (0 su 6), 46P 1,5e-5-5,9e-4 (9 su 9), 55P 3,2e-4-2,6e-3 (4 su 4), 67P 3,3e-6-1,5e-5 (5 su 7), 81P 3,3e-6-2,4e-5 (4 su 6), 103P 1,9e-6-3,3e-5 (2 su 4), 109P 5,8e-6-4,4e-2 (3 su 4) | non superata; salti inclusi in ε |
| Perieli di 1P contro Yeomans e Kiang 1981 (tabella 4), dal -239 al 1910 | 2 d | 29 perieli nell'intervallo: scarto massimo 0,0126 d (218), Δq massimo 5,0e-5 UA. Fuori dall'intervallo: -314, primo perielio con dati (estensione ASSIST del record del -239), 7,69 d; i 15 perieli dal -390 al -1403 cadono dove 1P è "non determinabile" | superata |
| Cerere: ASSIST contro sb441-n16 a -7000 | 1″ | 22,55″ con 15 asteroidi, 31,98″ senza (§ 3) | non superata |

Soglie ed esiti della tabella: versione 2.1 del progetto. La versione 2.2 (§ 13, A7) adotta le proposte del § 9: giunzioni e salti tra record ≤ ε del corpo a quell'istante, Cerere a -7000 ≤ ε(-7000) = 103″, eccezione dichiarata per C/1680 V1 al perielio. Con queste soglie tutte le prove sono superate (`docs/VALIDAZIONE.md`, § 7).

### 8.2 A9 e S2

| Prova | Soglia | Risultato | Esito |
|-------|--------|-----------|-------|
| Apophis 2029-04-13: distanza minima dal centro della Terra (DE441, NAIF 399) e istante, contro JPL CNEOS (JPL#220: JD 2 462 240,407092 TDB, 38 011,5 km) | 500 km, 10 min | 37 824,4 km (-187,1 km), +1,36 min | superata |
| Apophis: file contro vettori Horizons, 17 epoche ogni 3 h dal 2029-04-13 0h TDB | | massimo 262,8 km | |
| Perielio di 1P del 1910 contro Yeomans e Kiang 1981 | 0,5 d | +0,0010 d | superata |
| Perielio di 1P del 1986 contro la distanza minima nei vettori Horizons del record 90000030 (JPL#75, passo 0,01 d): JD 2 446 470,9590 | 0,5 d | -0,00035 d | superata |

### 8.3 Per corpo (livello pubblicato)

Classe SBDB; "Dati dal": inizio della prima regione determinabile; byte del corpo nei 13 file; A7 Horizons: scarto massimo e rapporto massimo con la soglia sulle epoche con dati.

| Corpo | Classe | Cloni | Dati dal | Byte | A7 Horizons: max km (rapporto) | A7 interpolazione: rapporto max |
|-------|--------|-------|----------|------|-------------------------------|------------------------------|
| Cerere | MBA | 16 | -10000 | 272 520 | 216,8 (0,434) | 0,807 |
| Eris | TNO | 16 | -10000 | 291 472 | 975,7 (0,677) | 0,801 |
| Haumea | TNO | 16 | -10000 | 297 576 | 489,7 (0,845) | 0,632 |
| Makemake | TNO | 16 | -10000 | 299 200 | 469,8 (0,707) | 0,651 |
| Gonggong | TNO | 16 | -10000 | 296 728 | 978,9 (0,771) | 0,270 |
| Quaoar | TNO | 16 | -10000 | 139 560 | 440,2 (0,655) | 0,658 |
| Sedna | TNO | 16 | -10000 | 233 296 | 2 459,8 (0,700) | 0,836 |
| Orco | TNO | 16 | -10000 | 151 288 | 472,0 (0,795) | 0,784 |
| Salacia | TNO | 16 | -10000 | 140 696 | 457,9 (0,758) | 0,805 |
| Varuna | TNO | 16 | -10000 | 139 560 | 462,2 (0,760) | 0,692 |
| Issione | TNO | 16 | -10000 | 151 952 | 487,1 (0,740) | 0,418 |
| Máni | TNO | 16 | -10000 | 142 648 | 442,8 (0,734) | 0,724 |
| Arrokoth | TNO | 16 | -10000 | 139 560 | 443,5 (0,648) | 0,714 |
| Chiron | CEN | 64 | 360 | 84 592 | 387,4 (0,775) | 0,842 |
| Chariklo | CEN | 64 | -10000 | 172 736 | 367,6 (0,735) | 0,171 |
| Pallade | MBA | 16 | -10000 | 273 232 | 370,5 (0,741) | 0,625 |
| Giunone | MBA | 16 | -10000 | 276 552 | 352,2 (0,704) | 0,747 |
| Vesta | MBA | 16 | -10000 | 277 432 | 246,0 (0,492) | 0,685 |
| Igea | MBA | 16 | -10000 | 271 456 | 165,1 (0,330) | 0,555 |
| Psyche | MBA | 16 | -10000 | 270 208 | 247,9 (0,496) | 0,810 |
| Lutetia | MBA | 16 | -10000 | 256 352 | 240,9 (0,482) | 0,656 |
| Euphrosyne | MBA | 16 | -10000 | 265 960 | 311,8 (0,624) | 0,529 |
| 52 Europa | MBA | 16 | -10000 | 267 944 | 156,1 (0,312) | 0,589 |
| Sylvia | OMB | 16 | -10000 | 267 816 | 89,5 (0,179) | 0,680 |
| Ida | MBA | 16 | -10000 | 265 064 | 172,9 (0,346) | 0,749 |
| Mathilde | MBA | 16 | -10000 | 288 904 | 262,2 (0,524) | 0,376 |
| Eros | AMO | 64 | -10000 | 277 288 | 320,3 (0,641) | 0,455 |
| Patientia | MBA | 16 | -10000 | 250 240 | 139,6 (0,279) | 0,602 |
| Davida | MBA | 16 | -10000 | 271 000 | 201,9 (0,404) | 0,672 |
| Patroclus | TJN | 16 | -10000 | 164 672 | 405,9 (0,812) | 0,819 |
| Hektor | TJN | 16 | -10000 | 164 936 | 405,6 (0,811) | 0,664 |
| Interamnia | MBA | 16 | -10000 | 248 128 | 203,3 (0,407) | 0,577 |
| Gaspra | MBA | 16 | -10000 | 241 888 | 244,1 (0,488) | 0,867 |
| Šteins | MBA | 16 | -10000 | 278 768 | 248,6 (0,497) | 0,759 |
| Phaethon | APO | 64 | -1240 | 533 032 | 347,0 (0,694) | 0,414 |
| Eurybates | TJN | 16 | -10000 | 163 928 | 403,8 (0,808) | 0,815 |
| Toutatis | APO | 64 | 1340 | 196 560 | 302,9 (0,606) | 0,719 |
| Annefrank | MBA | 16 | -10000 | 210 920 | 245,6 (0,491) | 0,758 |
| Braille | MCA | 16 | -1420 | 230 440 | 298,9 (0,598) | 0,797 |
| Itokawa | APO | 64 | 1700 | 166 792 | 430,1 (0,860); 38/50 epoche | 0,784 |
| Donaldjohanson | MBA | 16 | -10000 | 291 072 | 420,6 (0,841) | 0,527 |
| Didymos | APO | 64 | 760 | 199 928 | 291,3 (0,583) | 0,666 |
| Apophis | ATE | 64 | 1860 | 121 264 | 75,5 (0,151); 17/50 epoche | 0,593 |
| Bennu | APO | 64 | 1780 | 132 216 | 108,1 (0,216) | 0,760 |
| Dinkinesh | MBA | 16 | -10000 | 227 616 | 427,6 (0,855) | 0,884 |
| Ryugu | APO | 64 | 1420 | 179 272 | 111,2 (0,222) | 0,633 |
| 1P/Halley | HTC | 64 | -380 | 167 840 | 316,7 (0,633) | 0,634 |
| 2P/Encke | ETc | 64 | 1600 | 236 088 | 242,7 (0,485) | 0,842 |
| 9P/Tempel 1 | JFc | 64 | 1580 | 118 824 | 441,2 (0,882) | 0,738 |
| 12P/Pons-Brooks | HTC | 64 | -1100 | 162 176 | 226,3 (0,453) | 0,628 |
| 19P/Borrelly | JFc | 64 | 1600 | 133 096 | 248,9 (0,498) | 0,789 |
| 21P/Giacobini-Zinner | JFc | 64 | 1680 | 114 648 | 400,0 (0,800); 41/50 epoche | 0,854 |
| 26P/Grigg-Skjellerup | JFc | 64 | 1780 | 117 496 | 177,0 (0,354); 27/45 epoche | 0,579 |
| 29P/Schwassmann-Wachmann 1 | JFc | 64 | 1380 | 74 152 | 427,7 (0,855) | 0,829 |
| 46P/Wirtanen | JFc | 64 | 1780 | 89 824 | 399,5 (0,799); 29/50 epoche | 0,827 |
| 55P/Tempel-Tuttle | HTC | 64 | 1320 | 115 880 | 370,0 (0,740) | 0,679 |
| 67P/Churyumov-Gerasimenko | JFc | 64 | 1820 | 69 264 | 261,2 (0,522); 28/50 epoche | 0,819 |
| 81P/Wild 2 | JFc | 64 | 1900 | 55 928 | 60,3 (0,121); 18/47 epoche | 0,561 |
| 103P/Hartley 2 | JFc | 64 | 1940 | 54 928 | 404,2 (0,808); 12/48 epoche | 0,748 |
| 109P/Swift-Tuttle | HTC | 64 | -440 | 148 584 | 155,6 (0,311) | 0,307 |
| C/1680 V1 | COM | 64 | -8000 | 212 864 | 2 892,7 (0,710) | 0,402 |
| C/1965 S1-A (Ikeya-Seki) | COM | 64 | 1140 | 62 576 | 1 019,3 (0,714) | 0,735 |
| C/1975 V1-A (West) | HYP | 64 | -10000 | 245 984 | 2 660,0 (0,850) | 0,621 |
| C/1995 O1 (Hale-Bopp) | COM | 64 | -6880 | 192 224 | 2 704,8 (0,723) | 0,587 |
| C/1996 B2 (Hyakutake) | COM | 64 | -10000 | 245 600 | 2 194,7 (0,594) | 0,491 |
| C/2006 P1 (McNaught) | HYP | 64 | -10000 | 245 536 | 2 620,1 (0,646) | 0,573 |
| C/2013 A1 (Siding Spring) | HYP | 64 | -10000 | 242 208 | 2 108,7 (0,724) | 0,541 |
| C/2020 F3 (NEOWISE) | COM | 64 | -2440 | 114 704 | 1 585,9 (0,515) | 0,654 |
| C/2023 A3 (Tsuchinshan-ATLAS) | HYP | 64 | -10000 | 243 024 | 2 865,6 (0,811) | 0,705 |
| 1I/ʻOumuamua | HYA | 16 | -10000 | 226 128 | 11 926,4 (0,727) | 0,542 |
| 2I/Borisov | HYP | 16 | -10000 | 222 608 | 11 049,4 (0,756) | 0,373 |
| 3I/ATLAS | HYP | 64 | -10000 | 219 616 | 13 200,8 (0,607) | 0,229 |

### 8.4 Fixture e test

- `tests/fixtures/small/casi.json` (seme 20261024): 12 corpi campione (Cerere, Ida, Apophis, Hektor, 1P, 2P, Hale-Bopp, Chiron, Sedna, Eris, ʻOumuamua, 3I), 200 epoche uniformi in [T0 - 400, T_END + 400] più fino a 40 confini di segmento e 3 epoche fuori copertura: 2 916 casi (2 112 'ok', 768 'non-determinabile', 36 'fuori-copertura'), con SHA-256 dei 13 file.
- Vitest (`tests/ephem/smallBodies.test.ts`): SHA-256; stato ed esito del runtime uguali alla valutazione Python (scarto relativo ≤ 1e-12 in posizione e velocità); 'caricamento' e 'fuori-copertura'; rifiuto di un blocco errato; `orbitAt` ancorata al corpo (scarto relativo < 1e-9) con elementi baricentrici solo oltre 50 UA; soglia del § 7.6.5 (quasi parabolica a 1 UA eliocentrica). `tests/ephem/service.test.ts`: C/1975 V1-A, C/1995 O1 e C/2020 F3 al perielio con elementi eliocentrici, 1/a entro 2·v·δv/μ (δv = 0,6 m/s) e q entro 1e-5 relativo dagli elementi di JPL Horizons (centro 500@10).
- pytest (`scripts/pipeline/tests/test_small_*.py`): conversioni cometarie e cartesiane contro Horizons, piano delle sorgenti, record, segmenti E e C su orbite sintetiche (Float32, perieli stretti), tabelle Horizons, dati prodotti (budget registrato, ssid, nuclei, coerenza tra affidabilità e dati, frammento di catalogo), risposte di validazione congelate, A9, covarianza usata solo con il nominale della sua epoca (rifiuto, cloni centrati, 95° percentile di Itokawa contro Horizons in `.venv-assist`).
- pytest (`scripts/pipeline/tests/test_affidabilita_nodi.py`): griglia di `reliability.bin` (§ 8.7), metrica senza |ΔM| su un'orbita quasi circolare, rampa di ε nell'intervallo di un record; sui dati prodotti livelli al 19/10/2026, Gonggong nel 2026, Arrokoth nel 1735, 109P nel 1700 e nel 1735 (VALIDAZIONE § 7.4).

## 9. Scostamenti e proposte

| Punto | Scostamento | Causa (misura) | Proposta |
|-------|-------------|----------------|----------|
| § 8.1, § 15 budget | 14,62 MB (limite 12 MB); `b11.bin` 5,33 MB (limite 4 MB) | finestra 1600-2121 alla tolleranza dell'A7: 5,90 MB, di cui 4,50 MB in b11; prima del 1600 minimo dovuto al passo massimo di 1024 d (livello 5: 12,66 MB) (§ 5.2) | budget dei piccoli corpi 14,6 MB e limite per `small/b11.bin` 5,4 MB (piattaforma: 15 MB per file binario, RNF7), da ripartire con gli altri moduli nel limite di 48 MB; in alternativa tolleranza della finestra × 10 con A7 abbassato (§ 5.4). Adottata nella versione 2.1: 6 MB per file |
| § 7.6.3 tolleranza prima del 1600 | livello 4: 1e-3·r dal -2000 al 1600, 1e-2·r prima (§ 7.6.3: 1e-5·r; § 15: 1e-4·r prima del -2000) | budget | livello 4 dichiarato in "Fonti e metodi"; livello 3 (1′ e 10′, 16,81 MB) se il budget lo consente |
| § 7.6.1 corpi in sb441-n16 | nella finestra SPK Horizons della soluzione corrente invece di sb441-n16 | A7: sb441-n16 dista dalla soluzione corrente fino a 14 357 km nel 1600-1700 | adottare nel § 7.6.1 |
| A7 giunzione al 1600 | 4 corpi in sb441-n16 oltre 1e-5·r: Psyche 3,9e-5, Igea 2,0e-5, Cerere e Euphrosyne 1,1e-5 | differenza tra sb441-n16 e la soluzione corrente al 1600 | soglia ≤ ε(1600) del corpo (salto incluso in ε). Adottata nella versione 2.2 (§ 13, A7) |
| A7 salti tra record | 142 salti su 188 oltre 1e-5·r | record DASTCOM indipendenti per apparizione; i più antichi con 4 cifre (1P, record 90000001: EC = .9676, QR = .5854) | soglia ≤ ε del corpo all'istante del cambio (ε cresce fino al salto misurato, § 7.6.2). Adottata nella versione 2.2 |
| A7 Cerere a -7000 | 22,55″ con 15 asteroidi (soglia 1″) | ASSIST non riproduce sb441-n16 entro 1″ su 1000 anni | soglia ≤ ε(-7000) del corpo. Adottata nella versione 2.2 (103″) |
| A7 interpolazione | C/1680 V1 al perielio 1680-12-18: 759 km (1,52 volte la tolleranza) | passo minimo 1/64 d con q = 0,0062 UA | eccezione dichiarata o passo minimo 1/256 d per le comete radenti. Adottata nella versione 2.2: eccezione dichiarata |
| ASSIST e DT | DT ignorato (2I, 3I, 46P, 67P, 81P, 103P) | ASSIST 1.2.3 non implementa DT | effetto solo prima del 1600, lontano dal Sole; dichiarato |
| Bennu | non determinabile dal 2100 | variante senza NG del § 7.6.2 dopo l'incontro del 2060 | variante NG pesata con la significatività dei parametri (A2 di Bennu misurato) |
| Bennu, C/2013 A1 | vettori Horizons tabulati invece dell'SPK | Horizons rifiuta l'SPK degli oggetti precalcolati | nessuna |
| Record prima del 1600 | ASSIST dallo stato del record | Horizons non produce SPK prima del 1600 | nessuna |
| Fisica di Quaoar | occultazione di Pereira et al. 2023 (A&A 673, L4, accesso aperto), al posto di Fornasier et al. 2013 e di Braga-Ribas et al. 2013 | radiometria del sistema superata; testo di Braga-Ribas non verificabile | § 9 aggiornato |
| Fisica di Máni | Rommel et al. 2023 (occultazione), al posto di Vilenius et al. 2012 | il § 9 rinviava alla fase dati; radiometria superata | § 9 aggiornato |
| Fisica di Issione | Kilic et al. 2026 (occultazioni), al posto di Lellouch et al. 2013 | raggio radiometrico 4 σ sotto quello delle occultazioni, albedo più alta del 25 % | § 9 aggiornato |
| Diametro di C/1996 B2 | Harmon et al. 1997 (radar), al posto del diametro SBDB | SBDB lo marca "value unverified", senza riferimento | regola generale: parametri SBDB non verificati esclusi |
| Forma determinata | falsa per le comete quasi paraboliche in quasi tutto l'intervallo (\|Δa/a\| non regolare per e vicino a 1: C/2006 P1, C/1975 V1, C/2013 A1, C/2023 A3, C/1996 B2, C/1680 V1); vera per 2I e 3I | criterio del § 7.6.2 su a | per e vicino a 1 usare Δq/q; effetto limitato alla nota della scheda e alle orbite dei corpi non determinabili, perché il tratteggio segue solo il livello (§ 10.2) |
