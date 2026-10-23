# Validazione

Risultati delle prove di accettazione del § 13 di `docs/PROGETTO.md` (versione 2.2) e delle altre misure eseguite su pipeline e runtime. Metodi: `docs/METODI.md`. Risultati grezzi: `scripts/pipeline/out/validazione-*.json`, `scripts/pipeline/out/kappa-luna.json`, `scripts/pipeline/out/spike-sats.json`, `scripts/pipeline/out/blocchi-piccoli-corpi.json`. Le prove Vitest e pytest sono state rieseguite il 22/10/2026 sui dati pubblicati in `public/data/v1/` (manifest del 22/10/2026).

Convenzioni: "uniformi" = epoche casuali uniformi nell'intervallo; "densa" = scansione con 7 punti interni per intervallo di campionamento; ε = errore stimato dell'affidabilità (§ 7.8).

## 1. Riepilogo

| Criterio | Soglia (sintesi) | Misura principale | Esito | Metodo | Data |
|----------|------------------|-------------------|-------|--------|------|
| A1 | zero errori e avvisi | `npm ci` senza avvisi (nessun pacchetto deprecato), `tsc`, ESLint (con regole tipizzate su `src`; file di configurazione senza API deprecate), Vitest (64 file, 714 prove), `npm run build`, `npm run build:artifact`, pytest (304 superati, 2 saltati fuori da `.venv-assist`, 4 superati in `.venv-assist`), ruff: nessun errore e nessun avviso; avviso di Vite sulla dimensione del bundle con soglia di 1500 kB invece di 500 kB (§ 5.7 di `docs/PROGETTO.md`) | superato | comandi del § 15 di questo documento | 22/10/2026 |
| A2 | valori di Meeus e del § 13 esatti | tutti esatti; 100 000 andate e ritorno esatte; giorno della settimana e riga prolettica della data mostrata anche alla mezzanotte raggiunta con passi di ora e di minuto | superato | Vitest `tests/time/calendar.test.ts`, `steps.test.ts`; Playwright `e2e/tempo.spec.ts` | 19-20/10/2026 |
| A3 | ΔT(-720) = 20 371,85 ± 0,01 s; σ ± 1 %; continuità | 20 371,848 s; σ(-9999) 103 006,1 s; σ(-3000) 8 977,8 s; salto a -720 1,6e-8 s; σ continua; nel periodo misurato σ dallo scarto del modello da EOP 20 C04: 0,45 s (S15.2020, 1962-1971), 0,114 s (S15.2020, 1972-2018), 0,0017 s (valori IERS); dopo y_obs deriva da LOD, σ(19/10/2026) = 0,017 s; scarti dai valori IERS entro 2σ | superato | pipeline `time_model.py valida`; Vitest `tests/time/deltaT.test.ts` | 18-19/10/2026 |
| A4 | ≤ 2″; EMB ≤ 100/250 km; continuità < 1 km | massimo 1,777″ (Marte); EMB 24,6 km (blocchi 11-12), 25,4 km; continuità ≤ 9,8e-5 km | superato | `planets.py valida` contro DE441 | 18/10/2026 |
| A5 | ≤ 60″ e ≤ 50 km su griglia di 0,5 d | 20,56″; 16,29 km | superato | `moon.py valida`, 8 853 922 istanti | 18/10/2026 |
| A6 | § 7.5.6; centri ≤ 5 km | tutti entro tolleranza; centri ≤ 0,337 km dove precisi | superato | `satellites.py valida --offline` | 19/10/2026 |
| A7 | tolleranza del segmento; max(500 km, 1e-7·r); giunzioni e salti tra record ≤ ε all'istante; 1P entro 2 d; Cerere a -7000 ≤ ε(-7000) = 103″ | interpolazione e Horizons entro tolleranza; giunzioni e 188 salti tra record entro ε (rapporto massimo 0,9996); 1P 0,0126 d; Cerere a -7000 22,55″; C/1680 V1 al perielio 759 km (1,52 volte la tolleranza) | superato, con l'eccezione dichiarata di C/1680 V1 (§ 7) | `small_bodies.py valida`; Vitest `tests/docs/documentazione.test.ts` (rapporti con ε) | 20/10/2026 |
| A8 | ≤ 0,001°; -0,067° ± 0,005°; ≤ 0,1°; ≤ 1° | 1,8e-13°; 5,2e-6°; -0,06719°; 0,0071°; 0,361°; nell'applicazione, dalla texture: angolo orario entro 0,14° da E - 0,9856°·ΔT[d] | superato | `time_model.py valida`; Vitest `tests/time/earthRotation.test.ts`; Playwright `e2e/grafica.spec.ts` | 18-19/10/2026 |
| A9 | eventi del § 13 | tutti entro soglia, anche attraverso l'applicazione (Giove-Saturno, Apophis, novilunio); 13 equinozi e solstizi 2023-2026 entro 0,57 min da USNO, cambio di stagione nell'applicazione entro 1 min | superato | Vitest e pipeline; Playwright `e2e/eventi.spec.ts` (§ 9) | 18-19/10/2026 |
| A10 | errore relativo dei raggi < 1e-9 | < 1e-9; nessuna scala nel grafo | superato | Vitest `tests/render/scala.test.ts` | 19/10/2026 |
| A11 | testo ≥ 4,5:1, non testo ≥ 3:1, tinta 150-160° | tutti i valori del § 11.1 entro 0,05, sui token e sui colori disegnati nella scena (`src/render/costanti.ts`); tinta del token `--linea` corretta a 158,2° | superato | Vitest `tests/ui/contrasti.test.ts` | 20/10/2026 |
| A12-A17 | § 13 | applicazione con i dati reali: 19 prove superate (13 nel progetto desktop, 6 nel mobile; A12 anche a 640 × 512 con scala 2 e a 690 × 829); pagina di prova: 16 prove superate | superato | Playwright `e2e/accessibilita.spec.ts`; `e2e/ui-lab.config.ts` | 22/10/2026 |
| A18 | nessuna richiesta esterna, nessun dialog, nessun errore in console, localStorage che lancia eccezioni | nessuna violazione in tutte le prove end-to-end; nessuna query string; localStorage con SecurityError e con QuotaExceededError; la data non entra nelle preferenze; eccezioni iniettate nella costruzione (ResizeObserver assente o che lancia, Canvas 2D assente): messaggio con "Riprova" funzionante o vista testuale, nessuna eccezione non gestita | superato | Playwright `e2e/rete.spec.ts`, `e2e/errori.spec.ts` e controlli comuni di `e2e/aiuti.ts` | 19/10/2026 |
| A19 | 404 → messaggio e "Riprova"; mai posizioni estrapolate | risposte ritardate: corpi in stato "caricamento" e non disegnati per tutta l'attesa, barra con il periodo; 404 su un blocco e su `reliability.bin`: messaggio e "Riprova" funzionante; messaggio del blocco rimosso alle date di altri blocchi e nuovo tentativo al ritorno; 404 su `moon.bin`: un solo messaggio; riproduzione verso un blocco in errore ferma, senza "Caricamento dati"; caricamento annullato senza messaggi; riproduzione in attesa al confine e ripresa; richiesta senza risposta su `catalog.json` e sul blocco della data iniziale: dopo 30 s messaggio e "Riprova" funzionante, primo frame disegnato; versioni precedenti di `catalog.json` e di un blocco nella cache HTTP (max-age 3600): scaricate di nuovo dal server senza errori, `manifest.json` rivalidato al nuovo avvio; senza `crypto.subtle` (contesto non sicuro) avvio completo con lo SHA-256 in JavaScript | superato | Playwright `e2e/rete.spec.ts`, `e2e/limiti.spec.ts`, `e2e/errori.spec.ts`, `e2e/dati.spec.ts`; Vitest `tests/app/caricamento.test.ts`, `tests/data/dataStore.test.ts` | 20/10/2026 |
| A20 | < 0,5 px; oscillazione < 0,1 px; occlusione; silhouette < 0,5 px; lune in riproduzione < 1 px | 0 px (1,5e-12 px); 0,022 px; 0 differenze; 0,000 px; 0 px | superato | Vitest `tests/render/precisione.test.ts` e `tests/render/orbiteRiproduzione.test.ts`; Playwright di `tests/render/playwright.render.config.ts` | 18/10/2026 |
| A21 | ≤ 4 ms per frame | media 0,62 ms, 95° percentile 1,1 ms | superato | Vitest `tests/render/prestazioni.test.ts` (Node 22) | 18/10/2026 |
| A22 | schema, SHA-256, budget del § 8.1 (6 MB per file) | 69 file, 46 617 232 byte; file massimo 5 331 816 byte; prima visualizzazione 2 233 406 byte | superato (un avviso, § 12.5) | `pack.py`; pytest e Vitest del manifest | 22/10/2026 |
| A23 | `lang="it"`, testi in `testi.it.ts`, nessun U+2014 | nessuna violazione | superato | Vitest `tests/ui/testi.test.ts`; `grep` | 19/10/2026 |
| A24 | pagina pubblicata | frammento nello scheletro su `/a/b/index.html` con Content-Security-Policy: caricamento completo, nessuna richiesta esterna oltre ai caratteri, `#marte` e `#giove` funzionanti, `lang="it"`; avvisi della licenza di three (`@license` in `assets/app.js`, `assets/LICENZE.txt`); 73 file, 47,55 MB | superato | Playwright, progetto `pagina-singola`; `scripts/make-artifact.mjs` (§ 12.5) | 22/10/2026 |
| A25 | § 13 | iperboliche aperte; Terra antioraria; longitudine 0 verso il Sole entro 4,13° (10 date 1900-2100); punto sub-terrestre della Luna entro 4,82° in longitudine e 6,69° in latitudine; anelli di Urano entro 0,29° dall'equatore IAU, satelliti nello stesso piano | superato | Vitest `tests/render/`, `tests/app/app.test.ts`, `tests/ephem/moon.test.ts`; Playwright `e2e/grafica.spec.ts` (§ 10) | 19/10/2026 |
| A26 | documentazione | `METODI.md`, `VALIDAZIONE.md`, `SPIKE.md`, `LICENZE.md` presenti; `DEBUG.md` presente come registro provvisorio della fase F5, criterio di uscita non raggiunto (§ 13 di `docs/PROGETTO.md`) | in corso | lettura | 22/10/2026 |

## 2. A2: calendario

Metodo: Vitest (`tests/time/calendar.test.ts`, `tests/time/steps.test.ts`), seme registrato in `tests/time/casuale.ts`; Playwright `e2e/tempo.spec.ts` per la console; data 19/10/2026, mezzanotte dopo passi di ora e di minuto il 20/10/2026. Soglia: uguaglianza esatta.

| Prova | Atteso | Misura | Esito |
|-------|--------|--------|-------|
| 1957-10-04,81 → JD | 2 436 116,31 | 2 436 116,31 | superato |
| 333-01-27 12h → JD | 1 842 713,0 | 1 842 713,0 | superato |
| -4712-01-01 12h → JD | 0,0 | 0,0 | superato |
| JD 1 507 900,13 → data | -584-05-28,63 | -584-05-28,63 | superato |
| JD_MIN_UT, JD_MAX_UT_EXCL dalla funzione | -1 931 076,5; 2 495 739,5 | uguali | superato |
| -9999-03-01; -9998-12-01 (giuliano) | -1 931 017,5; -1 930 377,5 | uguali, anche all'inverso | superato |
| 2000-01-01 | 2 451 544,5 | 2 451 544,5 | superato |
| 1582-10-04 + 1 giorno | 1582-10-15, venerdì (4 ottobre giovedì) | uguale | superato |
| 1500-01-01 giuliano | mercoledì | mercoledì | superato |
| Bisestili -100, 0, 1500 (giuliano), 1600, 2000; non bisestili -9999, 1700, 2100 | regola T3 | uguale | superato |
| 100 000 date casuali: data → JD → data | esatte | esatte | superato |
| 100 000 JD casuali: JD → data → JD | esatti a 0h, entro 1 ms altrimenti | entro i limiti | superato |
| 100 000 date contro un riferimento indipendente da Meeus (due calendari prolettici) | uguali | uguali | superato |
| Passi di mese e anno del § 6.6 (31 gennaio + 1 mese, 29 febbraio + 1 anno, ottobre 1582, 1 a.C. + 1 anno) | regole del § 6.6 | uguali | superato |
| Ingresso in TT: dal limite inferiore e dall'ultimo istante, un passo di mese, anno, secolo o millennio e il passo opposto (anche con offset -120 e +330 min) | ritorno esatto al limite, con il limite segnalato al primo passo | uguale (21/10/2026; prima il ritorno dal limite inferiore cadeva 80,5 µs oltre, senza messaggio) | superato |
| Giorno della settimana e gregoriano prolettico dopo passi di ora e di minuto: 7 offset, 11 anni da -9999 a 2120, 48 passi di un'ora da 22:00 e 1 500 di un minuto da 23:30; 20 000 istanti entro 3,2 ms dalla mezzanotte locale | giorno della data mostrata (T4) | uguale in tutti i casi; dal JD grezzo 130 giorni della settimana e 10 righe prolettiche errati | superato |
| Console: 20/10/2026 22:00 UT + 2 ore; 4/10/1582 22:00 UT + 2 ore; 20/10/2026 22:00 UTC+1 + 2 ore | mercoledì; venerdì, calendario gregoriano, senza riga prolettica; mercoledì (Python `datetime.date(2026, 10, 21).weekday()` = 2, `date(1582, 10, 15).weekday()` = 4) | uguali, anche nella live region | superato |
| Calendario Python contro TypeScript, 25 004 JD | 0 differenze | 0 differenze | superato |

## 3. A3: ΔT e incertezza

Metodo: `time_model.py valida` (`out/validazione-tempo.json`) e Vitest `tests/time/deltaT.test.ts` contro le fixture Python (`tests/fixtures/time/deltaT.json`, seme 20261037); data 18/10/2026, σ del § 6.5 v2.2 il 19/10/2026 (scarti della S15.2020 nel 1962-1971 e deriva dopo y_obs: `tests/test_time_model.py`, `tests/time/deltaT.test.ts`).

| Grandezza | Soglia | Misura | Esito |
|-----------|--------|--------|-------|
| ΔT(-720) | 20 371,85 ± 0,01 s | 20 371,848 s | superato |
| ΔT(-9999-01-01 00:00 UT) | ≈ 438 384,2 s | 438 384,190 s (5,074 d) | superato |
| Salto a -720 | < 0,01 s | 1,6e-8 s | superato |
| Salti a 2019, 2020, y_obs | continuità | 2,8e-10 s; 5,6e-11 s; 0 | superato |
| Pendenze a -720 (parabola; S15) | -16,0; -16,1 s/anno | -15,96; -16,13 s/anno | registrato |
| ΔT(2120,0); ΔT(2120-12-31) | ≈ 97,5 s | 97,48 s; 98,09 s | registrato |
| σ(-9999) | 103 005 s ± 1 % | 103 006,1 s | superato |
| σ(-5000) | ≈ 25 653 s | 25 653,2 s | registrato |
| σ(-3000) | 8 978 s ± 1 % | 8 977,8 s | superato |
| σ(-1000) | ≈ 638 s | 638,45 s | registrato |
| σ(2120) | ≈ 47 s | 46,6 s | registrato |
| σ(1200); σ(1700); σ(1800) | 31 s; 5 s; 1 s (Espenak e Meeus 2006; Stephenson e Houlden 1986) | 31,25 s; 5,0 s; 1,0 s | superato |
| σ(1825) | > 0 | 0,56 s | superato |
| σ_S15,62: scarto quadratico medio della S15.2020 da EOP 20 C04 giornaliera, 1962-1971 (3 652 giorni; TAI - UTC da `tai-utc.dat` dell'USNO) | registrato | 0,4545 s (massimo 0,6767 s, 1964,42; S15.2020 sempre più bassa); σ(1964) = 0,45 s | registrato |
| σ_S15,72: come sopra, 1972-2018 (17 167 giorni) | registrato | 0,1139 s (massimo 0,2721 s); σ(2000) = 0,114 s | registrato |
| Scarto del modello dai valori IERS mensili 1962-1971 (120), in unità di σ | ≤ 2σ; media quadratica ≤ 1,2σ | al più 1,48σ; media quadratica 1,02σ (prima della correzione 5,9σ con σ = 0,114 s) | superato |
| S15.2020 contro la tabella storica USNO (`historic_deltat.data`), prima del 1962 dove C04 non c'è | registrato | 1900-1961 (124 valori): 0,457 s in media quadratica (massimo 1,198 s); 1962-1971: 0,458 s, come contro C04 | registrato |
| σ_IERS: valori IERS mensili interpolati contro EOP 20 C04 giornaliera, 2020-01-01/2026-09-18 (2 453 giorni) | registrato | 0,00168 s (massimo 0,0051 s); σ(y_obs) = 0,0017 s | registrato |
| LOD_rms: eccesso di LOD di C04, 2025-09-19/2026-09-18 (365 giorni) | registrato | 0,539 ms (media 0,273 ms, massimo 1,266 ms); σ(19/10/2026) = 0,0167 s (Huber da solo 0,0012 s) | registrato |
| Dopo y_obs contro IERS Rapid Service (`finals.daily.iau2000.txt`, flag I, 2026-09-19/2026-10-19, 31 giorni; consultato il 19/10/2026) | ≤ 2σ | scarti da -0,0005 a -0,0303 s, al più 1,98σ (2026-09-30); 18/10/2026: IERS 69,2224 s, modello 69,1929 ± 0,0162 s (1,82σ; prima della correzione 17,5σ) | superato |
| Dopo y_obs contro le previsioni dello stesso file (flag P, 91 giorni) | registrato | al più 2,11σ (2026-12-05) | registrato |
| Prova retrospettiva della σ dopo y_obs su C04 giornaliera: ΔT(t0) + 0,00325·N² da t0 ogni 10 giorni dal 1975, σ con LOD_rms dei 365 giorni prima di t0 | entro 2σ ≥ 95 % | entro 1σ: 59 % (7 d), 60 % (30 d), 66 % (90 d), 78 % (1 anno), 78 % (5 anni), 79 % (10 anni); entro 2σ: 99,5 % (7 d), 100 % negli altri orizzonti; 1 524-1 889 casi | superato |
| Continuità di σ a -500, 1200, 1300, 1600, 1700, 1800, 1900, 1971, 1972, 2019, 2020, y_obs | < 1e-6 s | rispettata | superato |
| TT_min; TT_max | ≈ -1 931 071,43 | -1 931 071,4261; 2 495 739,50114 | registrato |
| ΔT, σ TypeScript contro fixture Python (902 casi) | 1e-6 s | ΔT uguale bit per bit; σ uguale salvo un caso del 1276 (3,6e-15 s, interpolazione nel logaritmo) | superato |
| Soglia della rotazione indeterminata con l'istante in TT (σ > 21 600 s) | registrata | fino all'anno -4594 incluso; nessuna nota con l'istante in UT | registrato |

### 3.1 Confronto con TDB - UT di JPL Horizons

Metodo: tabelle osservatore di Horizons, quantità 30, 75 epoche (risposte congelate in `scripts/pipeline/raw/time/horizons/`). Horizons dà TDB - UT1 prima del 1962 e TDB - UTC dopo; per il 1975-2026,5 la colonna è riportata a UT1 con UT1 - UTC della serie C04. Soglia: nessuna (registrazione richiesta da A3).

| Anno | Horizons (s) | Modello (s) | Modello - Horizons (s) |
|------|--------------|-------------|------------------------|
| -9997,5 | 439 785,79 | 438 275,68 | -1 510,1 |
| -9000 | 368 717,61 | 367 448,92 | -1 268,7 |
| -8000 | 303 754,95 | 302 707,20 | -1 047,8 |
| -7000 | 245 083,81 | 244 235,86 | -848,0 |
| -6000 | 192 704,19 | 192 034,91 | -669,3 |
| -5000 | 146 616,07 | 146 104,34 | -511,7 |
| -4000 | 106 819,47 | 106 444,16 | -375,3 |
| -3000 | 73 314,39 | 73 054,36 | -260,0 |
| -2000 | 46 100,81 | 45 934,95 | -165,9 |
| -1000 | 25 178,75 | 25 085,92 | -92,8 |
| -720 | 20 448,02 | 20 371,85 | -76,2 |
| 0 | 10 482,08 | 10 441,31 | -40,8 |
| 500 | 5 609,30 | 5 586,60 | -22,7 |
| 1000 | 1 660,21 | 1 650,39 | -9,817 |
| 1500 | 294,60 | 292,34 | -2,258 |
| 1600 | 110,47 | 109,13 | -1,346 |
| 1700 | 14,790 | 14,100 | -0,691 |
| 1800 | 18,624 | 18,367 | -0,257 |
| 1900 | -1,946 | -1,977 | -0,031 |
| 1950 | 28,932 | 28,932 | 0,000 |
| 1975 (UT1) | 45,477 | 45,281 | -0,1960 |
| 1990 (UT1) | 56,855 | 56,991 | 0,1356 |
| 2000 (UT1) | 63,829 | 63,809 | -0,0199 |
| 2010 (UT1) | 66,070 | 66,061 | -0,0088 |
| 2020 (UT1) | 69,361 | 69,361 | 0,0001 |
| 2026,5 (UT1) | 69,169 | 69,170 | 0,0004 |
| 2030 | 69,184 | 69,228 | 0,044 |
| 2050 | 69,184 | 70,956 | 1,772 |
| 2100 | 69,184 | 86,649 | 17,5 |
| 2120,5 | 69,184 | 97,781 | 28,6 |

- Prima del 1950 il ΔT di Horizons supera sia la S15.2020 sia la parabola del proprio manuale (che a -720 darebbe 20 372,3 s); la differenza decresce con continuità fino a 0 nel 1950. Vale 0,15·σ a -720 e 0,015·σ a -9998.
- Nel 2020-2026,5 la differenza in UT1 è al massimo 0,0005 s in valore assoluto.
- Dopo y_obs Horizons tiene TDB - UTC costante: lo scarto arriva a 28,6 s nel 2120.

## 4. A4: pianeti, Plutone, baricentro Terra-Luna

Metodo: `planets.py valida` contro DE441 (seme 20261101); "confini": 17 istanti in [t_b - h, t_b + h] per ogni confine più l'istante precedente t_b (234 istanti per corpo); "densa": 7 punti interni per intervallo in tutti i blocchi, poi 63 punti negli intervalli dei 40 campioni peggiori di ogni blocco; continuità: differenza tra i due blocchi valutati nell'istante del confine. Data 18/10/2026. Soglie: |Δr|/r ≤ 2″; continuità < 1 km.

| Corpo | Passo | Uniformi, 2000 epoche: max (rms) | Confini max | Densa max | Densa |Δr| max | Continuità max | Esito |
|-------|-------|----------------------------------|-------------|-----------|----------------|----------------|-------|
| Mercurio | 16 d | 0,471″ (0,085″) | 0,355″ | 0,615″ | 138 km | 4,7e-5 km | superato |
| Venere | 32 d | 0,832″ (0,164″) | 0,500″ | 1,080″ | 565 km | 7,2e-5 km | superato |
| EMB | 16 d | 0,029″ (0,005″) | 0,025″ | 0,036″ | 25 km | 9,8e-5 km | superato |
| Marte | 64 d | 1,299″ (0,196″) | 1,020″ | 1,777″ | 1 787 km | 6,2e-5 km | superato |
| Giove | 256 d | 1,320″ (0,444″) | 1,077″ | 1,520″ | 5 560 km | 1,6e-5 km | superato |
| Saturno | 256 d | 0,787″ (0,168″) | 0,341″ | 1,042″ | 6 666 km | 3,0e-5 km | superato |
| Urano | 512 d | 1,497″ (0,507″) | 1,433″ | 1,741″ | 23 976 km | 2,2e-5 km | superato |
| Nettuno | 512 d | 1,072″ (0,339″) | 0,887″ | 1,178″ | 25 593 km | 0 | superato |
| Plutone | 512 d | 1,421″ (0,291″) | 1,064″ | 1,535″ | 33 745 km | 0 | superato |

| Baricentro Terra-Luna | Soglia | Misura | Esito |
|-----------------------|--------|--------|-------|
| Blocchi 11-12 (dal 1010 circa), uniformi; densa | 100 km | 10,9 km; 24,6 km | superato |
| Blocchi 0-10, uniformi; densa | 250 km | 20,8 km; 25,4 km | superato |
| Confini (blocchi 11-12; altri) | 100 km; 250 km | 6,9 km; 18,3 km | superato |

- Margine minimo sulla scansione densa: Marte 11 %, Urano 13 %.
- Contributo dell'arrotondamento Float32 (blocchi 0, 6, 11): al massimo 0,0065″ (Plutone); l'errore è dominato dall'interpolazione di Lagrange.
- Senza raccordo ai confini l'arrotondamento Float32 indipendente nei due blocchi dava salti fino a 1,49 km (Plutone): il raccordo li riduce a ≤ 9,8e-5 km.
- Runtime contro pipeline (fixture `tests/fixtures/planets/`): ≤ 1e-12 relativo (Vitest, 19/10/2026).

## 5. A5: Luna

Metodo: `moon.py valida`, griglia di 0,5 d da T0 a T_END, 8 853 922 istanti inclusi i nodi, contro DE441 (301 rispetto a 399); data 18/10/2026. Soglie: 60″ e 50 km.

| Grandezza | Misura | Esito |
|-----------|--------|-------|
| Errore angolare geocentrico massimo | 20,56″ (anno -9760) | superato |
| rms | 3,91″ | registrato |
| Errore massimo sulla distanza | 16,29 km (anno -5797) | superato |
| |Δr| massimo | 35,8 km | registrato |
| Velocità, scarto massimo | 0,21 m/s | registrato |
| Massimo per intervallo tra nodi | da 5,99″ a 20,56″, mediana 13,9″ | registrato |

| Millennio (anni) | Max | rms | Distanza max |
|------------------|-----|-----|--------------|
| -10000 / -9001 | 20,6″ | 6,22″ | 15,4 km |
| -9000 / -8001 | 20,4″ | 5,49″ | 16,2 km |
| -8000 / -7001 | 20,1″ | 4,81″ | 15,4 km |
| -7000 / -6001 | 18,9″ | 4,18″ | 15,3 km |
| -6000 / -5001 | 18,1″ | 3,70″ | 16,3 km |
| -5000 / -4001 | 17,8″ | 3,35″ | 15,0 km |
| -4000 / -3001 | 16,3″ | 3,10″ | 14,9 km |
| -3000 / -2001 | 17,7″ | 2,97″ | 14,0 km |
| -2000 / -1001 | 17,0″ | 2,88″ | 15,1 km |
| -1000 / -1 | 16,0″ | 2,82″ | 14,2 km |
| 0 / 999 | 15,8″ | 2,78″ | 13,7 km |
| 1000 / 1999 | 15,7″ | 2,73″ | 14,9 km |
| 2000 / 2121 | 12,6″ | 2,70″ | 12,9 km |

Fattore κ (`moon.py kappa`, residui delle finestre su 49 nodi, uno ogni 25): massimo 37,8″ senza κ e 20,4″ con κ; distanza 21,7 km e 14,6 km. A -9999: 37,8″ (rms 12,1″) senza κ, 17,4″ (6,2″) con κ.

| Altre prove della Luna e della Terra | Soglia | Misura | Esito | Metodo |
|--------------------------------------|--------|--------|-------|--------|
| Esempio 47.a di Meeus (1992-04-12 0h TD) | valori del libro | λ = 133,162655°, β = -3,229126°, Δ = 368 409,7 km, uguali | superato | pytest e Vitest |
| 120 termini contro una trascrizione indipendente (PyMeeus 0.5.12) | uguali | nessuna differenza | superato | pytest |
| Runtime contro pipeline (posizione; velocità; orientamento) | 1e-6 km; 1e-9 km/s; 1e-12 | entro le soglie | superato | Vitest |
| Terra (EMB - Luna/(1 + EMRAT)) contro DE441 399, 20 000 epoche (seme 20261104) | registrato | 0,033″; 21,6 km (blocchi 11-12), 23,5 km (altri) | registrato | pipeline |
| Orientamento: ortonormalità; polo dall'eclittica della data; asse x dalla Terra | 1e-13; 1,543°; librazione ottica | entro 1e-13; 1,543°; entro 11° | superato | Vitest |
| Affidabilità: ε_modello della Luna in `reliability.bin`, 712 intervalli; livello con l'istante in TT | > 1′ (mai "precisa", § 7.8.1) | minimo 60,0000228″ (intervalli dal 1940,7 al 2071,9); "buona" in TT al 2005 | superato | pytest, Vitest, Playwright `e2e/affidabilita.spec.ts` |

Senza correzioni degli argomenti la serie di Meeus dista da DE441 14,3″ dal 2000, 66″ dall'anno 0, 341″ dal -2000, 1 660″ dal -5000, 7 788″ (767 km) dal -9999 (finestre di 10 anni).

## 6. A6: satelliti

### 6.1 Contro i kernel SPK

Metodo: `satellites.py valida --offline` (`out/validazione-sats.json`); 200 epoche per kernel adottato nella finestra servita dai suoi record, fuori dalle giunzioni tra sorgenti; errore angolare visto dal pianeta; errore radiale in frazione di a (mediana dei record). Data 19/10/2026.

| Satellite | Kernel | Epoche | Angolo max | Angolo medio | Radiale max | Tolleranza | Esito |
|-----------|--------|--------|------------|--------------|-------------|------------|-------|
| Fobos | mar099 | 200 | 1 117″ | 354,4″ | 1,2 km (0,012 %) | 0,5° | superato |
| Deimos | mar099 | 200 | 342″ | 69,0″ | 2,2 km (0,009 %) | 0,5° | superato |
| Io | jup365 | 200 | 29″ | 8,4″ | 33,6 km (0,008 %) | 0,5° | superato |
| Europa | jup365 | 200 | 43″ | 13,9″ | 358,5 km (0,053 %) | 0,5° | superato |
| Ganimede | jup365 | 200 | 37″ | 11,2″ | 881,5 km (0,082 %) | 0,5° | superato |
| Callisto | jup365 | 200 | 21″ | 10,2″ | 336,5 km (0,018 %) | 0,5° | superato |
| Amaltea | jup365 | 200 | 48″ | 12,3″ | 5,4 km (0,003 %) | 0,5° | superato |
| Imalia | jup347 | 200 | 1 342″ | 290,4″ | 88 948,6 km (0,777 %) | 1,0° | superato |
| Mimas | sat441 | 200 | 81″ | 30,4″ | 46,1 km (0,025 %) | 0,5° | superato |
| Mimas | sat441xl_part-1 | 200 | 384″ | 153,5″ | 46,5 km (0,025 %) | 0,5° | superato |
| Encelado | sat441 | 200 | 44″ | 17,4″ | 19,8 km (0,008 %) | 0,5° | superato |
| Encelado | sat441xl_part-1 | 200 | 80″ | 36,4″ | 41,1 km (0,017 %) | 0,5° | superato |
| Teti | sat441 | 200 | 76″ | 20,6″ | 32,0 km (0,011 %) | 0,5° | superato |
| Teti | sat441xl_part-1 | 200 | 530″ | 195,1″ | 35,5 km (0,012 %) | 0,5° | superato |
| Dione | sat441 | 200 | 32″ | 9,9″ | 55,3 km (0,015 %) | 0,5° | superato |
| Rea | sat441 | 200 | 72″ | 19,1″ | 87,7 km (0,017 %) | 0,5° | superato |
| Titano | sat441 | 200 | 14″ | 4,1″ | 34,7 km (0,003 %) | 0,5° | superato |
| Titano | sat441xl_part-1 | 200 | 85″ | 32,8″ | 117,7 km (0,010 %) | 0,5° | superato |
| Iperione | sat441 | 200 | 1 286″ | 349,8″ | 10 889,2 km (0,735 %) | 3,0° | superato |
| Iperione | sat441xl_part-1 | 200 | 1 371″ | 382,0″ | 11 314,5 km (0,764 %) | 3,0° | superato |
| Giapeto | sat441 | 200 | 49″ | 18,8″ | 737,6 km (0,021 %) | 0,5° | superato |
| Giapeto | sat441xl_part-1 | 200 | 254″ | 89,9″ | 2 123,8 km (0,060 %) | 0,5° | superato |
| Febe | sat441 | 200 | 174″ | 61,4″ | 87 879,0 km (0,679 %) | 1,0° | superato |
| Febe | sat441xl_part-1 | 200 | 207″ | 56,4″ | 79 005,3 km (0,610 %) | 1,0° | superato |
| Miranda | ura184_part-3 | 200 | 143″ | 43,9″ | 30,8 km (0,024 %) | 0,5° | superato |
| Miranda | ura111xl-705 | 200 | 104″ | 42,9″ | 32,4 km (0,025 %) | 0,5° | superato |
| Ariel | ura184_part-3 | 200 | 58″ | 14,9″ | 49,2 km (0,026 %) | 0,5° | superato |
| Ariel | ura111xl-701 | 200 | 110″ | 33,7″ | 60,6 km (0,032 %) | 0,5° | superato |
| Umbriel | ura184_part-3 | 200 | 83″ | 23,4″ | 170,8 km (0,064 %) | 0,5° | superato |
| Umbriel | ura111xl-702 | 200 | 68″ | 25,6″ | 196,9 km (0,074 %) | 0,5° | superato |
| Titania | ura184_part-3 | 199 | 234″ | 23,9″ | 447,2 km (0,102 %) | 0,5° | superato |
| Titania | ura111xl-703 | 200 | 371″ | 43,9″ | 471,8 km (0,108 %) | 0,5° | superato |
| Oberon | ura184_part-3 | 200 | 110″ | 34,0″ | 588,1 km (0,101 %) | 0,5° | superato |
| Oberon | ura111xl-704 | 200 | 101″ | 32,8″ | 651,6 km (0,112 %) | 0,5° | superato |
| Tritone | nep098_part-1 | 200 | 3″ | 0,7″ | 0,3 km (0,000 %) | 0,5° | superato |
| Tritone | nep097 | 200 | 2″ | 0,4″ | 0,4 km (0,000 %) | 0,5° | superato |
| Proteo | nep098_part-3 | 200 | 42″ | 11,8″ | 2,0 km (0,002 %) | 0,5° | superato |
| Nereide | nep105 | 200 | 378″ | 39,0″ | 4 457,8 km (0,081 %) | 1,0° | superato |
| Nereide | nep101xl-802 | 200 | 1 815″ | 125,9″ | 8 784,4 km (0,159 %) | 1,0° | superato |
| Caronte | plu060 | 200 | 4″ | 0,5″ | 0,0 km (0,000 %) | 0,5° | superato |
| Notte | plu060 | 198 | 290″ | 166,2″ | 151,4 km (0,311 %) | 0,5° | superato |
| Idra | plu060 | 200 | 62″ | 28,3″ | 34,8 km (0,054 %) | 0,5° | superato |

Kernel lunghi non adottati, contro il modello prodotto dove il modello usa l'estrapolazione secolare e il satellite è determinabile (soglia di adozione: differenza ≤ ε/4; 20/10/2026, con il piano secolare del § 6.5):

| Satellite, kernel | Campioni | Differenza massima | Rapporto massimo differenza/ε | Esito |
|-------------------|----------|--------------------|-------------------------------|-------|
| Dione, sat441xl_part-1 | 141 825 | 0,30° | 0,112 | omissione confermata |
| Rea, sat441xl_part-1 | 178 880 | 0,30° | 0,168 | omissione confermata |
| Tritone, nep097xl-801 | 41 673 | 2,64° | 0,062 | omissione confermata |

### 6.2 Contro JPL Horizons

Metodo: vettori geometrici Horizons nell'eclittica J2000 rispetto al centro del pianeta (500@499 … 500@999; Disnomia rispetto a Eris, 500@920136199); 20 epoche per satellite (seme 20261020 + ssid) nel 1900-2100; Disnomia nel 2000-2030, l'intervallo servito da Horizons. Soglie del § 7.5.6 (0,5°; Iperione 3°; Imalia, Febe, Nereide 1°; radiale 1 % di a). Data 19/10/2026.

| Satellite | Angolo max | Radiale max | Esito |
|-----------|------------|-------------|-------|
| Fobos | 313″ | 1,1 km (0,012 %) | superato |
| Deimos | 137″ | 1,7 km (0,007 %) | superato |
| Io | 14″ | 26,2 km (0,006 %) | superato |
| Europa | 49″ | 322,1 km (0,048 %) | superato |
| Ganimede | 28″ | 839,4 km (0,078 %) | superato |
| Callisto | 19″ | 293,8 km (0,016 %) | superato |
| Amaltea | 13″ | 4,3 km (0,002 %) | superato |
| Imalia | 926″ | 81 679,2 km (0,660 %) | superato |
| Mimas | 57″ | 42,8 km (0,023 %) | superato |
| Encelado | 28″ | 10,3 km (0,004 %) | superato |
| Teti | 26″ | 17,1 km (0,006 %) | superato |
| Dione | 18″ | 33,1 km (0,009 %) | superato |
| Rea | 21″ | 86,7 km (0,016 %) | superato |
| Titano | 16″ | 15,6 km (0,001 %) | superato |
| Iperione | 1 191″ | 10 584,7 km (0,706 %) | superato |
| Giapeto | 31″ | 633,4 km (0,018 %) | superato |
| Febe | 132″ | 66 342,7 km (0,505 %) | superato |
| Miranda | 75″ | 20,7 km (0,016 %) | superato |
| Ariel | 53″ | 37,5 km (0,020 %) | superato |
| Umbriel | 100″ | 157,6 km (0,059 %) | superato |
| Titania | 66″ | 406,8 km (0,093 %) | superato |
| Oberon | 67″ | 525,3 km (0,090 %) | superato |
| Tritone | 2″ | 0,3 km (0,000 %) | superato |
| Proteo | 43″ | 1,5 km (0,001 %) | superato |
| Nereide | 138″ | 2 174,9 km (0,025 %) | superato |
| Caronte | 2″ | 0,0 km (0,000 %) | superato |
| Notte | 259″ | 140,5 km (0,286 %) | superato |
| Idra | 45″ | 30,3 km (0,047 %) | superato |
| Disnomia | 324″ | 15,7 km (0,042 %) | superato |

"Radiale max" è il massimo sulle 20 epoche campione, non un limite: il massimo dei record contro i kernel è nel § 5 di `docs/_parti/satelliti.md` (Febe 0,736 %, Imalia 0,805 %, Iperione 0,797 % di a). Al 4/5/2029 lo scarto radiale di Febe da Horizons è 83 236 km (0,570 %).

Errore stimato delle distanze contro Horizons (§ 7.5.6, § 11.13): Febe (609), Imalia (506) e Iperione (607) dal 1/1/2025 al 31/12/2031 TT, passo 4 d (639 epoche), vettori geometrici con centro 500@10 e Terra 399. Rapporto massimo tra lo scarto della distanza dal Sole o dalla Terra e l'errore stimato: con il solo ε·d 4,49 (Febe, 244 epoche oltre la stima e 7 con una cifra in più: "9,47113 UA" il 3/10/2025 contro 9,47130 UA), 2,59 (Imalia), 0,61 (Iperione); con δr, errore radiale dei record, 0,86, 0,74 e 0,50, nessuna epoca oltre la stima. Prove: Vitest `tests/ui/scheda.test.ts` (Febe al 3/10/2025 e al 4/5/2029, Imalia al 9/9/2029: errore stimato non inferiore allo scarto 3D), pytest `test_sat_uscite.py::test_errore_radiale_per_intervallo_di_fonte`. Data 20/10/2026.

Affidabilità di Fobos (I12, § 7.5.6): con σ_ṅ di MAR099 (2·0,058·10⁻³ °/anno², Brozović, Jacobson e Park 2025) e arco 1877-2019, ε_modello < 10° nel 1600-2120 (massimo 5,1° nell'intervallo che contiene il 1600) e < 1° dal 1770 al 2120 (massimo 0,81°); con σ_ṅ di I12 e arco 1900-2020 era "indicativa" prima del 1681 (21,0° nel 1600) e "approssimata" dal 2088 (2,1° nel 2120). Prove: pytest `test_sat_uscite.py::test_fobos_con_sigma_ndot_e_arco_di_mar099`, Vitest `tests/ephem/service.test.ts` (affidabilità). Data 20/10/2026.

### 6.3 Centri dei pianeti

Metodo: scarto del centro dal baricentro con la formula del § 7.3.5 contro i segmenti SPK dei centri (499 … 999) alle epoche di validazione dei kernel moderni; "precise" = tutti i satelliti rilevanti con ε_modello ≤ 1′. Soglia: 5 km dove precisi. Data 19/10/2026.

| Pianeta | Satelliti rilevanti | Epoche (precise) | Scarto tipico | Errore max | Errore max dove precisi | Esito |
|---------|---------------------|------------------|---------------|------------|-------------------------|-------|
| Marte | nessuno | 400 (400) | 0,0 km | 0,000 km | 0,000 km | superato |
| Giove | Callisto, Europa, Ganimede, Io | 1200 (422) | 128,8 km | 0,085 km | 0,079 km | superato |
| Saturno | Dione, Giapeto, Rea, Titano | 1800 (563) | 289,5 km | 0,029 km | 0,029 km | superato |
| Urano | Ariel, Oberon, Titania, Umbriel | 1000 (0) | 27,2 km | 0,048 km | - km | superato |
| Nettuno | Tritone | 600 (305) | 74,1 km | 0,430 km | 0,337 km | superato |
| Plutone | Caronte | 600 (238) | 2 131,5 km | 0,160 km | 0,160 km | superato |

Urano: nessuna epoca "precisa" (Oberon ha ε_adattamento ≤ 1′ solo in 2 record su 226); su tutte le 1 000 epoche l'errore massimo è 0,048 km.

### 6.4 Disnomia

Gli elementi di Holler et al. (2021) riproducono gli offset della tabella 1 dell'articolo con le posizioni all'istante di emissione (tempo luce 0,556 d): scarto quadratico medio 1,9σ, massimo 16,0 mas (pytest `test_sat_dati.py`, 19/10/2026).

### 6.5 Piano dei satelliti regolari nei record secolari

Metodo: angolo tra il polo dell'orbita osculante (r × v planetocentrici) e il polo WGCCRE del primario usato dalla scena, per i 22 satelliti con `pianoSegueEquatore`; massimo su 40 epoche (pytest) e 200 epoche (Vitest) nei record secolari, confrontato con il massimo nella finestra 1600-2121. Soglia: massimo nei record secolari ≤ massimo nella finestra + 0,15°. Prove: `test_sat_uscite.py::test_piano_secolare_segue_l_equatore_del_primario`, `tests/ephem/satellites.test.ts` (piano secolare), `tests/ui/schedaPianoF.test.ts`. Data 20/10/2026.

| Caso | F fisso | F con il polo del primario | Esito |
|------|---------|----------------------------|-------|
| Fobos, JD -1 931 000 | 10,7° | 1,20° | superato (≤ 1,5°) |
| Deimos, JD -1 931 000 | 9,0° | 1,31° | superato (≤ 1,5°) |
| Encelado, JD -1 931 000 | 0,67° | 0,08° | superato (≤ 0,15°) |
| Dione, JD -1 931 000 | 0,66° | 0,03° | superato (≤ 0,15°) |
| Fobos, massimo nei record secolari (finestra 1,38°) | 11,7° | 1,40° | superato |
| Deimos, massimo nei record secolari (finestra 2,76°) | 12,2° | 2,74° | superato |
| Dione e Rea contro sat441xl_part-1 (§ 6.1) | 0,34° e 0,37° | 0,30° e 0,30° | migliorato |

Per i 22 satelliti il massimo nei record secolari non supera il massimo nella finestra più 0,15° (Encelado: 0,092° contro 0,022°, per lo scarto di 0,084° alla giunzione). Nella scheda, per Fobos e Deimos nel 10000 a.C., l'inclinazione sul piano F alla data differisce dall'inclinazione sull'equatore disegnato al più dello scarto alla giunzione (0,33° e 0,94°; con F fisso 9,6°).

## 7. A7: piccoli corpi

Metodo: `small_bodies.py valida` con risposte congelate (`scripts/pipeline/out/validazione-piccoli-corpi.json`); dati del livello pubblicato (livello 4). Data 18-19/10/2026; ripetuto il 20/10/2026 dopo la metrica senza anomalia media, la griglia fine di `reliability.bin` e ε delle comete a record (§ 7.6.2, § 8.7) e il 21/10/2026 dopo i cloni dall'epoca della covarianza (§ 7.5).

| Prova | Soglia | Misura | Esito |
|-------|--------|--------|-------|
| Interpolazione: 200 epoche casuali per corpo nei nuclei con dati (seme 20261023 + ssid) contro la sorgente | tolleranza del segmento | 14 400 epoche, tutte 'ok'; rapporto massimo 0,884 (Dinkinesh) | superato |
| Verifica di costruzione di ogni segmento | tolleranza; eccezione dichiarata per C/1680 V1 al perielio (§ 13 del progetto) | rapporto ≤ 0,900 per 7 308 segmenti; C/1680 V1 1,517 (759 km al perielio del 1680-12-18, a 0,0062 UA dal Sole) | superato, con l'eccezione dichiarata di C/1680 V1 |
| 50 epoche per corpo contro i vettori Horizons nella finestra (seme 20261021 + ssid) | max(500 km, 1e-7·r) | 3 545 epoche servite da Horizons, 3 352 con dati; rapporto massimo 0,882 (9P), mediana dei massimi per corpo 0,652 | superato |
| Giunzione ASSIST-Horizons al 1600 (45 corpi; C/2013 A1 da tabella) | ε all'istante | 0,7-53,3 km (≤ 1,3e-7·r); C/2013 A1 1 899,7 km (4,1e-8·r); Bennu al 1900 2,5 km; rapporto massimo con ε 1,2e-4 (Ryugu); sovrapposizione 1600-1650 al massimo 3,7e-7·r (Toutatis) | superato |
| Giunzione al 1600, sb441-n16 contro SPK Horizons (11 corpi) | ε all'istante | Pallade 8,9e-7, Giunone 1,8e-6, Sylvia 1,9e-6, Davida 5,4e-6, Vesta 6,1e-6, Interamnia 6,3e-6, 52 Europa 9,3e-6, Cerere 1,1e-5 (4 281 km), Euphrosyne 1,1e-5, Igea 2,0e-5, Psyche 3,9e-5 (15 220 km) contro ε da 1,0e-3 a 1,05e-3; rapporto massimo 0,037 (Psyche) | superato |
| Giunzione al 1600 delle comete a record (ASSIST e SPK dello stesso record) | ε all'istante | 1P 1,4 km, 2P 15,2 km, 12P 261 km, 29P 471 km, 55P 212 km, 109P 185 km (≤ 5,2e-7·r); 19P 5 312 km (7,1e-6); 9P 48 008 km (1,3e-4, con ε(1600) = 1,28 rad); rapporto massimo con ε 1,6e-4 (55P) | superato |
| Salti tra record consecutivi (188) | ε all'istante del cambio | da 1,5e-7 a 4,4e-2 di r (tabella 7.1); rapporto massimo con ε 0,9996 (26P, 1854): alla giunzione ε vale il salto misurato più la tolleranza di rappresentazione e scende verso l'apparizione di ciascun record (§ 7.6.2) | superato |
| ε nella finestra contro la tolleranza dei segmenti vista dal Sole, max(500 km, 1e-7·r)/r alla distanza minima del nodo (pytest `test_small_dati.py`) | ε ≥ tolleranza | tutti i nodi dei 72 corpi; contro le 3 352 epoche Horizons: errore ≤ 0,780·ε (Donaldjohanson, 2024) (prima della correzione 35 epoche oltre ε, fino a 0,232″ contro 0,123″ per Giunone) | superato |
| Perieli di 1P contro Yeomans e Kiang (1981), tabella 4, dal -239 al 1910 | 2 d | 29 perieli: scarto massimo 0,0126 d (218), Δq massimo 5,0e-5 UA | superato |
| Cerere: ASSIST contro sb441-n16 a -7000 | ε(-7000) senza la tolleranza di rappresentazione: 5,0e-4 rad (103″) | 22,55″ con 15 asteroidi (0,22·ε), 31,98″ senza | superato |

Tabella 7.1, salti tra record per cometa (minimo-massimo relativo a r; tra parentesi i salti oltre 1e-5·r, soglia della versione 2.1 del progetto, sul totale): 1P 3,1e-5-6,2e-4 (29 su 29); 2P 1,2e-6-2,8e-3 (47 su 59); 9P 1,5e-7-1,5e-4 (1 su 11); 12P 1,2e-4-1,7e-4 (2 su 2); 19P 1,6e-5-7,5e-5 (13 su 13); 21P 2,5e-5-1,7e-4 (15 su 15); 26P 2,1e-6-2,3e-2 (8 su 19); 29P 3,5e-7-2,3e-6 (0 su 6); 46P 1,5e-5-5,9e-4 (9 su 9); 55P 3,2e-4-2,6e-3 (4 su 4); 67P 3,3e-6-1,5e-5 (5 su 7); 81P 3,3e-6-2,4e-5 (4 su 6); 103P 1,9e-6-3,3e-5 (2 su 4); 109P 5,8e-6-4,4e-2 (3 su 4).

Cause degli scarti maggiori:

- Giunzioni sb441-n16: differenza tra sb441-n16 e la soluzione corrente di SBDB al 1600; per questo nella finestra 1600-2121 si usa la soluzione corrente (con sb441-n16 nella finestra l'A7 contro Horizons dava fino a 14 357 km per Psyche nel 1621).
- Salti tra record: record DASTCOM indipendenti per apparizione, i più antichi con 4 cifre significative; i salti definiscono ε nell'intervallo del record.
- Cerere a -7000: il modello di ASSIST per una particella di prova non riproduce entro 1″ su 1000 anni l'integrazione a N corpi di sb441-n16 (soglia della versione 2.1); a -7000 i dati usano sb441-n16 stesso, e prima di -7999 lo scarto è incluso in ε.
- C/1680 V1: passaggio al perielio (q = 0,0062 UA, q/v_q circa 0,02 d) non rappresentabile con il passo minimo di 1/64 d; eccezione dichiarata nel § 13 del progetto (A7), nel README e in "Fonti e metodi".

### 7.1 ASSIST (spike S2)

| Prova | Misura |
|-------|--------|
| Halley: traiettoria del record del -239 contro Horizons, 11 epoche dal -380 al -230 | massimo 12,8 km (0,0009″) |
| Apophis: ASSIST dalla soluzione JPL#220 contro Horizons, 17 epoche ogni 3 h dal 2029-04-13 0h TDB | massimo 0,61 km |
| Bennu: A1 e A2 adattati ai vettori Horizons | 1,74 km rms, 5,16 km massimo |
| Continuità ai confini dei blocchi (604 confronti) | al massimo 18,4 km (2,4e-8·r, Hektor) |

### 7.2 Per corpo

Metodo: come sopra; "Dati dal" = inizio della prima regione determinabile; "Byte" = byte del corpo nei 13 file. Soglia: rapporto con la tolleranza ≤ 1. Esito: superato per tutti i corpi in entrambe le colonne. Tra parentesi dopo il rapporto, le epoche Horizons con dati quando non sono tutte.

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

### 7.3 Runtime

Vitest `tests/ephem/smallBodies.test.ts` (fixture `tests/fixtures/small/casi.json`, seme 20261024, 2 916 casi su 12 corpi): esiti uguali alla pipeline e scarto relativo ≤ 1e-12 in posizione e velocità; `orbitAt` ancorata al corpo con scarto relativo < 1e-9. Data 19/10/2026.

### 7.4 Affidabilità alla data e metrica (§ 7.6.2, § 8.7)

Metodo: pytest `tests/test_affidabilita_nodi.py` sui frammenti `out/reliability-*.json`; Vitest `tests/ephem/reliability.test.ts` e Playwright `e2e/affidabilita.spec.ts` su `reliability.bin`. Confronto: JPL Horizons (vettori, `VEC_TABLE='2xa'`) e SBDB. Data 20/10/2026.

| Prova | Soglia | Misura | Esito |
|-------|--------|--------|-------|
| 19/10/2026, corpi che con l'intervallo 2020,7-2040,7 prendevano il valore del 2040 | "precisa" (≤ 1′) | Io 26,0″, Amaltea 24,5″, Encelado 35,3″, Teti 25,8″, Ariel 32,8″, Umbriel 56,4″, Titania 57,3″, Proteo 51,0″; Apophis 1,0″, 19P 18,5″, 46P 32,8″, 81P 9,2″, 103P 29,6″, C/2023 A3 36,2″ (prima da 62,6″ a 4 508″) | superato |
| 21P al 19/10/2026 | ≤ ε all'istante | 397″ ("buona"): variante senza NG al perielio del 2025, cumulata; prima 1 088″ | registrato |
| Transnettuniani quasi circolari, metrica senza \|ΔM\| | ε dell'ordine dell'errore di posizione | Gonggong 3,0″ nel 2026 (prima 97,6″); Arrokoth 868″ nel 1735, "buona" (prima 4 180″, "approssimata"); Horizons 1σ in 3D: Arrokoth 29,6″ nel 2025 e 437″ nel 1700 | superato |
| 109P, record SAO/1737 (906-1801) | ε piccolo all'apparizione | 647″ nel 1700, 212″ nel 1735-1740 ("buona"; prima 44 099″, "indicativa"); scarto dalla soluzione JPL#32 al perielio del 1737 circa 170″ | superato |

### 7.5 Cloni e epoca della covarianza (§ 7.6.2)

Metodo: pytest `tests/test_small_cloni.py` (covarianza con un nominale di un'altra epoca rifiutata; cloni centrati sul nominale della covarianza; in `.venv-assist` il 95° percentile dei cloni di Itokawa contro i 3σ di Horizons); `small_bodies.py integra`, `segmenti` (livelli 0-6), `blocchi`, `catalogo`, `valida` per i 45 corpi con covarianza a un'epoca diversa da quella dell'orbita; confronto con la serie precedente (stessi semi, 64 cloni per Itokawa e Apophis). Horizons: RA_3sigma, vettori OBSERVER dal centro del Sole, TT (DES=20025143 e DES=20099942). Data 21/10/2026.

| Prova | Soglia | Misura | Esito |
|-------|--------|--------|-------|
| 95° percentile dei 64 cloni di Itokawa (covarianza al 1/1/2004, orbita al 9/6/2026, incontro con la Terra a 0,0129 UA il 26/6/2004) al 1° gennaio 1900, 1850 e 1800 contro RA_3sigma di Horizons (JPL#237: 4,214″, 62,12″, 197,2″) | sotto i 3σ (il percentile vale circa 2σ) | 2,69″, 38,7″ e 127,5″ (0,64, 0,62 e 0,65 dei 3σ); prima 756,3″, 45 073″ e 216 843″ (da 180 a 1 100 volte i 3σ): 281, 1 164 e 1 701 volte meno | superato |
| Itokawa ai nodi 1850,7 e 1900,7 | registrato | 106 478″ → 88,5″ e 1 541″ → 5,46″ | registrato |
| Itokawa, primo istante con dati | registrato | 11/9/1840 → 10/9/1700 (ε 69,8°, "indicativa"); dal 1700,7 al 1840,7 ogni 10 anni il percentile dei cloni vale da 0,03 a 0,74 dei 3σ di Horizons | superato |
| Itokawa, livello per intervallo (ε massimo) a 1840,7, 1860,7, 1880,7, 1900,7 e 1920,7 | registrato | "indicativa" (42,2°), "approssimata" (5,2°), "approssimata" (2,4°), "approssimata" (1,34°), "buona" (0,051°) → "buona" (0,095°), "buona" (0,022°), "precisa" (38″), "precisa" (20″), "precisa" (2″) | registrato |
| Itokawa contro i vettori di Horizons (A7) | tolleranza della finestra | 38 epoche su 50 con dati (prima 25), massimo 430,1 km (0,860); le 13 epoche anteriori all'11/9/1840 richieste a parte: massimo 199,3 km (0,399); richieste insieme a quelle dopo il 1923, queste si scostavano fino a 3,2e5 km (Horizons integra in sequenza dalla più antica) | superato |
| Apophis (covarianza al 2021, orbita al 2026): percentile dei cloni al 1900, 1850 e 1800 contro RA_3sigma di Horizons (JPL#220: 8,111″, 1 758″, 281 645″) | sotto i 3σ | 4,76″, 1 054″ e 77 517″ (0,59, 0,60 e 0,28 dei 3σ); prima 10,36″, 2 347″ e 438 283″ (1,28, 1,34 e 1,56 dei 3σ): 2,2, 2,2 e 5,7 volte meno | superato |
| Apophis dopo il 2029: percentile dei cloni contro RA_3sigma di Horizons nel 2039, 2059, 2079, 2099, 2109 e 2118 | sotto i 3σ | 0,65, 0,65, 0,80, 0,63, 0,64 e 0,97 dei 3σ (prima da 0,47 a 0,75); la variante senza NG, integrata dal 2021 e non dal 2026 prima dell'incontro del 2029 a 38 000 km dalla Terra, passa da 337″ a 25 283″ nel 2059 e da 230″ a 73 808″ nel 2079: ε da 0,18° e 0,11° a 7,1° e 20,6°, dati fino al 13/9/2120 (prima fino al 2121) | registrato |
| Apophis al 19/10/2026 | "precisa" (≤ 1′) | 0,97″ (prima 0,93″) | superato |
| Altri 43 corpi: rapporto prima/dopo del percentile a 1800,7, 1850,7 e 1900,7 | registrato | 38 corpi da 0,85 a 1,23 (mediana 1,03 su 114 valori); Cerere 0,08-0,85 (percentile sotto 0,005″), Chiron 1,49-1,82, Hektor 0,89-1,81, Orco 1,30-1,95, Ryugu 1,09-1,76 (dati dal 1420 invece che dal 1440) | registrato |
| Livelli per intervallo diversi dopo la correzione | registrato | 11 corpi: Apophis 63 intervalli, Arrokoth 24, Itokawa 12, Gaspra 11, Didymos 10, Chiron 4, Patientia 4, Toutatis 4, Donaldjohanson 3, Phaethon 2, Ryugu 2; serie di ε diversa per tutti i 45 corpi, dati presenti diversi per Itokawa, Apophis e Ryugu | registrato |

## 8. A8: rotazione terrestre e stagioni

Metodo: `time_model.py valida` e Vitest `tests/time/earthRotation.test.ts`, `seasons.test.ts`; Horizons: RA apparente geocentrica del Sole (quantità 2) e tempo siderale apparente locale a Greenwich (quantità 7) a 200 epoche 1900-2100. Data 18/10/2026.

| Prova | Soglia | Misura | Esito |
|-------|--------|--------|-------|
| GST TypeScript contro fixture Python (ERA - EO), 200 epoche in tutto l'intervallo | 0,001° | 1,8e-13° | superato |
| GST contro `eraGmst06`, 60 epoche 1600-2121 (TypeScript); 300 epoche 1600-2200 (Python) | 0,001° | 5,2e-6° | superato |
| (ERA - EO) - GMST06 a -10000; a T0 | -0,067° ± 0,005° | -0,06720°; -0,06719° | superato |
| (ERA - EO) - GMST06 a -5000; -2000; 0 | registrato | -0,01218°; -0,00110°; -0,00010° | registrato |
| Massimo 0-2121 (200 epoche) | < 0,001° | 1,0e-4° | superato |
| EO: Hermite contro calcolo diretto, 300 epoche | registrato | 2,7e-15 rad | registrato |
| Longitudine subsolare (RA apparente - TSL apparente di Horizons) contro il modello con stati DE441, 200 epoche 1900-2100 | 0,1° | massimo 0,0071°, medio +0,0056° (aberrazione annua) | superato |
| Angolo orario del Sole alle 12:00 UT1 contro E - 0,9856°·ΔT[d], 200 giorni (seme 20261035) | 1° | 0,361° (L0 di Meeus eq. 25.2); 0,904° (eq. 28.2) | superato |
| Stagioni (longitudine apparente): quadranti e stima con la conica dei giorni dall'evento contro gli eventi trovati su DE441, 2 000 epoche (seme 20261036) | registrato | quadranti uguali; errore massimo della stima 0,052 d (nell'applicazione l'evento è risolto sugli stati della Terra) | registrato |
| A25: a 12:00 UT del 1° gennaio, aprile, luglio, ottobre 2020 la longitudine 0 della Terra è rivolta al Sole (dati pubblicati, UT1 del `TimeState`) | 5° | entro 5° | superato |
| A8 e A25 nell'applicazione: texture della Terra sostituita da una mappa che codifica longitudine e latitudine nei canali rosso e verde; camera sulla congiungente Terra-Sole; pixel al centro della canvas = punto subsolare; 10 date alle 12:00 UT dal 1900 al 2100 (Playwright, 19/10/2026) | 1° (angolo orario); 5° (longitudine 0) | scarto massimo 0,14° da E - 0,9856°·ΔT[d] (E dal Sole medio geometrico di Meeus, eq. 25.2-25.5 e 28.1); longitudine del punto subsolare entro 4,13°; un'ora dopo il punto subsolare si sposta di -14,94° (rotazione verso est) | superato |

## 9. A9: eventi noti

| Evento | Soglia | Misura | Esito | Metodo | Data |
|--------|--------|--------|-------|--------|------|
| Giove-Saturno, 21/12/2020 | 6,1′ ± 0,5′ tra 12 e 24 UT | 6,105′ alle 18:11 UT (passo 1 min); DE441 diretto uguale | superato | Vitest con runtime e pipeline; ΔT da EOP 20 C04 (69,362 s) | 18/10/2026 |
| Novilunio, 08/04/2024 | 18:21 UT ± 3 min | 18:21:25 UT; DE441 diretto uguale | superato | Vitest; ΔT 69,20 s | 18/10/2026 |
| Solstizio, 20/06/2024 20:51 UT: massimo della declinazione geometrica sull'equatore medio della data | ± 1 h; obliquità media ± 0,01° | 20:38,1 UT (-12,9 min); 23,43593° contro 23,43610° (-0,00016°) | superato | `time_model.py valida` | 18/10/2026 |
| Equinozi e solstizi da dicembre 2023 a dicembre 2026 (13 eventi), longitudine apparente su DE441, contro USNO (https://aa.usno.navy.mil/api/seasons, UT al minuto) | ± 1 min | da -0,34 a +0,57 min; con la longitudine geometrica media gli eventi risultavano anticipati di 4-10 min | superato | `time_model.py valida`; pytest `test_time_validazione.py` | 19/10/2026 |
| Gli stessi eventi attraverso `creaStagione` con i dati pubblicati: stagione 1 min prima e 1 min dopo l'istante USNO; giorni interi 1 min prima e dopo evento + N giorni (N fino a 93) | stagione e giorni attesi | tutti attesi; 20/03/2024 02:40 UT: "Inverno boreale, 88 giorni dopo il solstizio" (prima 89); dal 20/03/2024 03:07 UT al 21/03/2024 03:05 UT "Primavera boreale, meno di un giorno dopo l'equinozio" (prima "giorno dell'equinozio" anche il 21 marzo) | superato | Vitest `tests/app/app.test.ts`, `tests/ui/messaggi.test.ts`; Playwright `e2e/eventi.spec.ts` | 19-21/10/2026 |
| Apophis, 2029-04-13: distanza minima dal centro della Terra e istante contro JPL CNEOS (JPL#220: JD 2 462 240,407092 TDB, 38 011,5 km) | 500 km; 10 min | 37 824,4 km (-187,1 km); +1,36 min | superato | `small_bodies.py valida` | 18-19/10/2026 |
| Apophis: file contro vettori Horizons, 17 epoche ogni 3 h dal 2029-04-13 0h TDB | registrato | massimo 262,8 km | registrato | come sopra | 18-19/10/2026 |
| Perielio di 1P del 1910 contro Yeomans e Kiang (1981) | 0,5 d | +0,0010 d | superato | come sopra | 18-19/10/2026 |
| Perielio di 1P del 1986 contro la distanza minima nei vettori Horizons del record JPL#75 (passo 0,01 d) | 0,5 d | -0,00035 d | superato | come sopra | 18-19/10/2026 |
| Giove-Saturno attraverso l'applicazione (data impostata nello store, stati del servizio dell'applicazione, ΔT dell'applicazione; minimo per sezione aurea a 1 min) | 6,1′ ± 0,5′ tra 12 e 24 UT | 6,105′ alle 18:12 UT | superato | Playwright `e2e/eventi.spec.ts` | 19/10/2026 |
| Apophis attraverso l'applicazione (minimo a 2 s) | 500 km; 10 min | 37 824,4 km (-187,1 km); +1,36 min | superato | come sopra | 19/10/2026 |
| Novilunio attraverso l'applicazione (longitudini nell'eclittica della data con `eclitticaDataAJ2000`, bisezione a 1 s) | 18:21 UT ± 3 min | 18:21:26 UT (+0,43 min) | superato | come sopra | 19/10/2026 |

Posizioni geometriche (I6), senza tempo luce e aberrazione.

## 10. A10, A20, A21: rendering

Metodo: Vitest con emulazione Float32 (`Math.fround`) e Playwright con SwiftShader (`tests/render/playwright.render.config.ts`, pagina di prova con servizi fittizi); data 18/10/2026 (Vitest rieseguito il 19/10/2026).

| Criterio | Prova | Soglia | Misura | Esito |
|----------|-------|--------|--------|-------|
| A10 | raggi del motore e semiassi degli impostori contro il catalogo; scala nel grafo | < 1e-9; nessuna scala | < 1e-9; scala 1 e matrici mondo senza scala | superato |
| A20 | distanza schermo tra corpo disegnato e orbita: 11 100 casi (111 corpi, 50 date, 5 distanze da 3 R a 1e5 UA, 1920 × 1080 e 400 × 800) | < 0,5 px | 0 px; corpo vero 1,5e-12 px | superato |
| A20 | lune con fuoco sul pianeta, camera a 3 raggi, 1 500 casi | < 0,5 px | 8e-13 px | superato |
| A20 | orbita non ancorata (controllo) | registrato | fino a 1,4e5 px | registrato |
| A20 | riproduzione con i dati pubblicati: Luna a 1 e 7 giorni simulati al secondo, lune di Giove e Saturno a 7, cometa o asteroide selezionato, camera ruotata attorno a z (45°, 135°, 180°, 270°) con il Sole davanti al piano | < 1 px | 0 px | superato |
| A20 | riproduzione, scelta delle orbite per ordine statico (controllo) | registrato | Luna fino a 10,4 px, lune di Giove fino a 1,9 px | registrato |
| A20 | oscillazione: camera a 10 km da Itokawa, 24 passi di un minuto | < 0,1 px | impostore 0,0006 e 0,0003 px; orbita 0,022 px (deriva regolare 0,11 px) | superato |
| A20 | occlusione: Luna dietro la Terra, Io dietro Giove (pixel) | invisibili | differenza 0 tra frame con e senza luna; controllo senza pianeta 319 e 481 pixel | superato |
| A20 | silhouette: Terra e Giove a quota 0,01 R, orizzonte in 20 righe | < 0,5 px | 0,000 px | superato |
| A21 | 112 corpi in riproduzione, tutte le orbite attive, etichette a ogni frame (Node 22, 4 CPU condivise) | ≤ 4 ms | media 0,62 ms, 95° percentile 1,1 ms; ricostruzione di tutte le 111 orbite in un frame 5,8 ms (il budget ne ricostruisce 9) | superato |
| A21 | frame in e2e con SwiftShader | solo registrato | CPU 1,3-2,8 ms, frame completo 2-3 ms | registrato |
| § 11.5.1 (applicazione, pixel) | anello di selezione della Terra con la camera a 1000, 3000, 4000, 10⁴, 10⁵ e 2·10⁵ UA, SwiftShader (Playwright `e2e/scena.spec.ts`, 19/10/2026) | stessa forma che a 1000 UA | riquadro dei pixel accesi uguale, pixel diversi ≤ 10 %; prima della correzione dei vertex shader due archi sfalsati da circa 3700 UA | superato |
| R7 (pixel) | Saturno il 16/10/2017 a 600 000 km dalla direzione della Terra (pagina di prova): pixel dell'asse sud dietro l'anello B (22), differenza con e senza asse | ≤ e^(-τ/μ)·contrasto + 12 | 22 su 22; scarto medio 0,8 (prima della correzione 9 su 22, 36,1) | superato |
| R7 (pixel) | stessa scena, anello A con le divisioni di Encke e Keeler (17 513 pixel): salti oltre 120 tra le distanze 600 000 e 600 600 km | ≤ 3 | 0 (prima della correzione 727) | superato |
| § 10.3, § 11.12 | ampiezza della vista dopo la prima misura della canvas e alla rotazione (Vitest `tests/render/vista.test.ts`; Playwright `e2e/vista.spec.ts`, Pixel 7 e 1024 × 768 → 768 × 1024) | 4 UA; invariata | 4,000 UA; scarto relativo < 1e-6 (prima 1,96 UA e 3,00 UA) | superato |
| § 11.12 | inquadratura "orbita": vertici dell'orbita fuori dalla vista (Saturno, Terra, Marte, Cerere, Luna, Halley; 400 × 800, 412 × 839, 1280 × 800) | 0 | 0 (prima fino al 37 %) | superato |
| § 7.8.2, § 10.3 | 1P/Halley a fuoco il 13/12/9998 a.C. (applicazione): distanza della camera dal Sole, anche dopo lo zoom; annuncio di "Inquadra" | ≥ 702 657 km; posizione non determinabile | ≥ 702 657 km; "Posizione di 1P/Halley non determinabile a questa data" (prima 45 km, "Vista centrata su") | superato |
| § 11.4.3 | orientamento di Venere e Urano (periodo negativo nel catalogo) in pausa a due date | ricalcolato | variazione della matrice > 0,1 (prima 0) | superato |
| § 11.5.2 | etichette degli anelli di distanza con la camera a 1,2 raggi terrestri, punto dell'anello dietro la Terra | nessuna | nessuna (prima "2 UA" sul disco) | superato |
| R12, R13, § 10.3 | densità dei pixel da 1 a 2 senza cambio di dimensioni; contesto perso; rotella sopra un'etichetta (Playwright) | buffer 2×; etichette nascoste e messaggio; zoom | buffer 2× senza interazione; 0 etichette, messaggio fino al ripristino; distanza ridotta di oltre il 20 % | superato |
| § 10.3, RF1 (applicazione) | Terra a 6 442 km dal centro, 4 scatti di Maiusc+Freccia destra, poi 36 di Freccia destra (180°), 1440 × 900 (Vitest `tests/render/camera.test.ts`; Playwright `e2e/camera.spec.ts`, 20/10/2026) | ≥ 6 441,918 km dal centro | minimo 6 441,918 km (prima 4 715,6 km, Terra non disegnata) | superato |
| R14 (applicazione) | Luna inquadrata il 25/3/2024 07:00 UT, 6 scatti di Maiusc+Freccia destra: km per pixel e barra di scala | invariati (profondità invariata) | 9,6522 km/px prima e dopo, barra di 103,6 px invariata (prima 10,78 km/px, +11,7 %) | superato |
| § 11.5.1, § 11.5.2 | contorno proiettato di sfere fuori asse (fino a 30°): punti di tangenza sull'ellisse (Vitest `tests/render/contorno.test.ts`) | < 1e-9 | < 1e-9 | superato |
| § 11.5.1, § 11.5.2 (applicazione, pixel) | stessa scena della riga R14 (Luna a 26° dall'asse): anello di selezione sopra, sotto e a sinistra del disco; pixel del disco sotto l'etichetta "Luna" | anello fuori dal disco; 0 pixel | anello 5 px fuori dal disco nei tre punti (prima 11-14 px dentro); 0 pixel, etichetta a sinistra del disco | superato |
| § 11.13 (applicazione) | etichetta dell'anello di distanza di 1000 UA con la camera a 1921 UA dal Sole | "1 000 UA" con U+2009 | "1 000 UA" (prima "1000 UA") | superato |
| § 11.3, § 11.5.1 (applicazione) | 20/10/2026, 1440 × 900: elevazione della camera sul piano dell'orbita di Titano dopo il contatore "+N lune" di Saturno (da "Pianeti giganti") e dopo il preset "Sistema di Saturno" dalla direzione iniziale; nel motore, preset dei quattro sistemi planetari sul piano della luna maggiore (Vitest `tests/render/vista.test.ts`; Playwright `e2e/vista.spec.ts`, 20/10/2026) | 30° ± 0,05° | 30,00° in tutti i casi; Titano visibile dopo il contatore (prima 2,7° dalla vista iniziale, Titano e Rea sovrapposti a Saturno) | superato |
| § 7.8.2, § 10.2 | tratteggio dell'orbita per livello e forma, 7 combinazioni (Vitest `tests/render/motore.test.ts`, 20/10/2026) | solo "indicativa" e "non determinabile" | "precisa", "buona" e "approssimata" continue anche con la forma non determinata (prima tratteggiate: C/2006 P1 "precisa" il 12/1/2007, 1I e C/2013 A1 "buona" nel 10000 a.C.) | superato |
| § 7.8.2 (applicazione, pixel) | Luna nel 10000 a.C. ("indicativa"), camera a 1,6·10⁶ km lungo il polo dell'orbita, Terra esclusa, 1440 × 900: frazione dei raggi con pixel accesi e pixel accesi per raggio sull'arco ±ε (da 3° a 9° dalla Luna) e sull'orbita (oltre 100°), con la Luna selezionata e no (Playwright `e2e/affidabilita.spec.ts`, 20/10/2026) | arco continuo (> 0,97), orbita tratteggiata (< 0,8), arco largo più di 1,5 volte l'orbita | selezionata: 1,00 contro 0,57, 4,8 contro 2,6 pixel; non selezionata: 1,00 contro 0,55, 3,8 contro 1,7 pixel (prima, con la Luna selezionata: arco 0,56, rapporto 1,41) | superato |
| RF5, § 7.5.5, § 7.6.4 (applicazione, pixel) | livello "Assi di rotazione" acceso e spento: Febe a 875 km (assi convenzionali), Cerere a 3 856 km (WGCCRE); servizio di orientamento sul catalogo pubblicato | Febe 0 pixel; Cerere asse; nessun orientamento per i corpi "fisso" senza coefficienti | Febe 0 pixel (prima 316, asse lungo il polo dell'eclittica); Cerere 345 pixel; 65 corpi senza orientamento | superato |
| A25 | orbite iperboliche; Terra vista da +z | aperte; antioraria | aperte; antioraria | superato |
| A25 (applicazione, pixel) | orbita evidenziata vista dall'alto, settori di 5° attorno al Sole con pixel dell'orbita: 3I/ATLAS (e ≈ 6,1) e 2P/Encke | iperbole ≤ 2·arccos(-1/e) ≈ 199°; ellisse 360° | 190°; 360° | superato |
| A25 (applicazione, pixel) | Urano di taglio, camera perpendicolare al polo IAU (Archinal et al. 2018), lune escluse: scarto dei pixel degli anelli dalla linea | inclinazione apparente < 0,5° | 0,89 px, ≤ 0,29° | superato |
| A25 (applicazione) | latitudine planetocentrica delle cinque lune maggiori sull'equatore IAU e distanza dalla linea degli anelli sullo schermo | Miranda ≤ 4,6°, altre ≤ 0,6° | Miranda 4,04°; altre ≤ 0,11°; schermo e stati concordi entro 0,003° | superato |
| A25 (applicazione, pixel) | Luna: punto sub-terrestre dalla texture codificata, 7 date 1900-2100 con fase sotto 40° | librazione ottica (7,9°; 6,9°) | longitudine -4,30°…4,82°; latitudine -6,66°…6,69° | superato |

## 11. Servizio delle effemeridi con i dati pubblicati

Metodo: Vitest `tests/ephem/service.test.ts` (25 prove), attraverso `ServizioEffemeridi`; data 19/10/2026.

| Prova | Soglia | Misura | Esito |
|-------|--------|--------|-------|
| Baricentri contro la valutazione Python | 1e-12 relativo | < 1e-12 | superato |
| Baricentri contro DE441 | 2″; EMB 100 km (blocchi 11-12), 250 km | entro le soglie | superato |
| Luna - Terra contro DE441; contro la pipeline | 60″ e 50 km; 1e-6 km | entro le soglie | superato |
| Terra contro DE441 (399) | 30 km | < 30 km | superato |
| Satelliti planetocentrici contro Python | 1e-9 relativo | < 1e-9 | superato |
| Centro del pianeta - baricentro: contro Python; contro gli SPK dove precisi | 1e-6 km; 5 km | entro le soglie | superato |
| Piccoli corpi: 2 916 casi | esiti uguali, 1e-12 relativo | uguali, ≤ 1e-12 | superato |
| Confini dei blocchi: blocco servito all'istante t_b; continuità dei pianeti | blocco k; < 1 km | blocco k; < 1 km | superato |
| Allocazioni nel percorso per frame: costruzioni su 600 frame in tre blocchi | 0 | 0 (una allocazione inserita di prova è rilevata: 67 200) | superato |
| Memoria trattenuta dopo 40 000 frame | stabile | crescita < 256 kB | superato |
| Tempo per frame (112 stati con affidabilità, 13 orbite, orientamenti) | registrato | circa 0,16 ms (Node 22) | registrato |

Altre prove della stessa suite: stati 'caricamento' e 'fuori-copertura', prefetch con la cache LRU, annullamento, orbite per tipo di corpo, affidabilità provvisoria prima di `reliability.bin`, orientamento dei satelliti sincroni.

## 12. Altre misure

### 12.1 Runtime contro pipeline (moduli comuni)

Metodo: Vitest sulle fixture `tests/fixtures/common/` e `tests/fixtures/precession/` (semi 20261018, 20261019, 20261020); data 18/10/2026.

| Prova | Soglia | Misura | Esito |
|-------|--------|--------|-------|
| Stati da `serie-prova.bin` (184 epoche valide su 200; esiti e indici di segmento uguali) | 1e-12 relativo | 3,2e-16 in posizione (6e-8 km), 5,3e-16 in velocità | superato |
| Elementi → stato, 100 casi | 1e-12 | 4,3e-16 | superato |
| Stato → elementi, 100 casi | 1e-10 | 4,4e-16 | superato |
| Andata e ritorno equinoziale (i ∈ {0; 90; 162; 179,9}°, e ∈ {0; 0,5; 0,97}) | 1e-11 | entro 1e-11 | superato |
| Precessione contro ERFA, 200 epoche da -10000 a 2121 | 1e-12 rad | 3,3e-16 rad | superato |
| Inclinazione dell'eclittica (-10000; 0); obliquità a -10000 | 1,635°; 0,265°; 24,149° | uguali | superato |
| Intestazioni e file non conformi (30 casi) | rifiutati | rifiutati con `ErroreFormato` | superato |

### 12.2 Orientamento dei corpi

| Prova | Soglia | Misura | Esito | Data |
|-------|--------|--------|-------|------|
| Pipeline contro SPICE `pxform` con lo stesso PCK (9 corpi, 400 epoche ciascuno) | registrato | 1,1e-10 rad entro un secolo da J2000; 2,0e-8 rad su tutto l'intervallo | registrato | 19/10/2026 |
| Runtime contro fixture della pipeline (23 corpi WGCCRE, 60 epoche, seme 20261022) | registrato | 1,4e-10 rad entro 200 anni; 1,3e-8 rad oltre (Ida) | registrato | 19/10/2026 |
| Asse x della Luna, di Io e di Titano verso il primario (dati pubblicati) | 11°; 5°; 5° | entro le soglie | superato | 19/10/2026 |

Periodi di rotazione derivati (360°/Ẇ) contro la tabella JPL: scarto relativo ≤ 2e-5 per gli otto pianeti tranne Nettuno (15,9663 h di Archinal et al. 2018 contro 16,11 h della tabella JPL).

### 12.3 Stelle

Metodo: `stars.py genera` (`out/validazione-stelle.json`); data 19/10/2026.

| Misura | Valore |
|--------|--------|
| Stelle con posizione; moto 3D; lineare angolare da Hipparcos; lineare angolare dal BSC | 9 096; 8 297; 698; 101 |
| B-V da Hipparcos dove manca nel BSC; senza B-V | 286; 24 |
| Separazione BSC-Hipparcos a J2000: mediana, 99° percentile, massimo | 0,65″; 3,69″; 21,8″ |
| Formula lineare del § 8.8 contro ERFA `starpm` (moto 3D) | 29,5″ a -9999; 0,28″ al 2120 |
| Arrotondamento Float32 della direzione | 0,009″ |
| Spostamento massimo a -9999 | HR 4550, 19,9° |
| Approssimazione CIE analitica contro le funzioni tabulate | 0,0068 in sRGB lineare (B-V = 2,0) |
| Temperatura del Sole da B-V = 0,65 (Vitest) | tra 5 700 e 5 850 K |
| Lettore TypeScript contro lettore Python | entro 1e-12 |

### 12.4 Prestazioni dei moduli (Node 22)

| Funzione | Tempo |
|----------|-------|
| `valuta` di un segmento E; C | 0,38 µs; 0,09 µs |
| Pianeta (stato) | 0,34-0,41 µs |
| Luna geocentrica; orientamento della Luna | 5,9 µs; 0,47 µs |
| `makeTimeState`; `orientamentoTerra`; `stagioneAstronomica` | 0,26 µs; 0,53 µs; 5,5 µs (con la nutazione IAU 2000B) |
| 29 satelliti e 6 centri dei pianeti per frame | 37-38 µs (2000), 31-33 µs (1600), 21 µs (-1975) |

### 12.5 Dati e budget (A22)

Metodo: `pack.py` e test del manifest (pytest e Vitest), eseguiti su qualsiasi checkout e saltati solo se manca `manifest.json`; data 19/10/2026, misure aggiornate il 22/10/2026.

| Misura | Valore | Limite | Esito |
|--------|--------|--------|-------|
| File (con il manifest) | 69 | 90 | superato |
| Totale | 46 617 232 byte | 48 MB | superato |
| File più grande | `small/b11.bin`, 5 331 816 byte | 6 MB | superato |
| Prima visualizzazione (blocco 12, dati di base, `moon.bin`) | 2 233 406 byte | 4 MB | superato |
| Texture: numero; totale; massima | 24; 8 680 970 byte; 399 389 byte | 30; 13 MB; 600 kB | superato |
| `reliability.bin` | 396 152 byte | 400 kB (stima) | superato |
| Manifest, catalogo, `time.json` | 315 862 byte | 300 kB (stima, avviso) | avviso |
| Schema del manifest e del catalogo; SHA-256; intestazioni dei binari | conformi | | superato |
| Catalogo | 112 corpi completi; 24 con texture; 2 con anelli | | superato |
| Pagina singola (`dist-artifact/`, `scripts/make-artifact.mjs`): file; totale; file più grande; testo più grande | 73; 47 546 539 byte; `data/v1/small/b11.bin` 5 331 816 byte; `assets/app.js` 871 803 byte | RNF7: 90 file, 48 MB, 6 MB per file; piattaforma: 255 file e 64 MB per pubblicazione, 16 MB per file di testo, 15 MB per file binario | superato |

Ripartizione: pianeti 19 747 528 byte (p00-p11 1 630 504 byte ciascuno, p12 181 480); piccoli corpi 14 624 384 (b11 5 331 816); texture 8 680 970; satelliti 2 371 800 (s11 1 018 136); stelle 363 904; affidabilità 396 152; catalogo 246 895; Luna 116 632; `time.json` 57 035; manifest 11 932.

### 12.6 Interfaccia e applicazione

| Prova | Misura | Esito | Metodo | Data |
|-------|--------|-------|--------|------|
| A11: contrasti ricalcolati dai token e dai colori della scena | entro 0,05 dai valori del § 11.1 e del § 11.5.2 (anche simboli, anelli di distanza ed etichette della scena); testo ≥ 4,5:1 e bordi ≥ 3:1 anche a opacità 0,94 e 0,90 su bianco; tinta dei token verdi e dei colori verdi della scena tra 150° e 160° | superato | Vitest | 20/10/2026 |
| A12: 320, 400, 640 (scala 2), 690, 768, 1280 px e orizzontale | layout atteso (telefono fino a 699 px, tablet da 700 px); nessuno scorrimento orizzontale; margini e destinazioni | superato; 640 × 512 con scala 2 (1280 × 1024 al 200 %) e 690 × 829 (pieghevole aperto) non superate sullo stato precedente alla decisione del 22/10/2026 (layout del tablet) | Playwright `e2e/accessibilita.spec.ts` (applicazione) e ui-lab | 22/10/2026 |
| A13-A17, A23 | tastiera (1582, Marte dalla ricerca e inquadrato al centro, Fonti e metodi con Esc, regolo), movimento ridotto (fuoco senza transizione) e colori forzati, contrasto elevato, axe-core (17 stati dell'applicazione, anche a 10000 a.C. e senza WebGL2; regole WCAG 2.2 A e AA e regola `region`, un `main` e un `h1`: prima delle correzioni da 5 a 6 nodi fuori dai landmark in ogni stato), validazione date, live region, testi | superato | Playwright `e2e/accessibilita.spec.ts`, ui-lab, Vitest | 20/10/2026 |
| Date limite: 1° gennaio 10000 a.C. 00:00 UT e 31 dicembre 2120 23:59:59 UT | 112 corpi 'ok' o 'non-determinabile' (mai 'caricamento' o 'fuori-copertura'); nessun marcatore né disco dei non determinabili; passi e riproduzione fermi al limite con messaggio; 1° gennaio 2121 rifiutato | superato | Playwright `e2e/limiti.spec.ts` | 19/10/2026 |
| Riproduzione attraverso il confine 9/10 con il blocco 10 trattenuto | attesa prima del confine con "Caricamento dati per il periodo 9 d.C.-1010", corpi disegnati, ripresa automatica al rilascio | superato | come sopra | 19/10/2026 |
| Continuità ai confini 11/12 e 10/11 attraverso l'applicazione (± 1 s TT, moto sottratto con la velocità media) | pianeti ≤ 0,0016 km; Luna ≤ 0,0001 km; Io, Titano, Tritone ≤ 0,0015 km; Cerere 0,144 km; Vesta 0,020 km | superato | come sopra | 19/10/2026 |
| Orologio di sistema al 1° giugno 2125 | avvio al 31 dicembre 2120 23:59:59 UT con Sole, Terra e Marte 'ok' e il messaggio del limite; "Adesso" limitato con lo stesso messaggio | superato | Playwright `e2e/errori.spec.ts`; Vitest (`statoIniziale`) | 19/10/2026 |
| Avvio con i dati reali: data attuale, distanze di 20 corpi entro perielio-afelio, 5 lune entro i limiti, pianeti "precisa" | entro i limiti | superato | Playwright `e2e/integrazione.spec.ts` | 19/10/2026 |
| Ordine di caricamento del § 5.6 | dati di base e blocchi della data prima di `reliability.bin`, stelle e blocchi adiacenti | superato | come sopra | 19/10/2026 |
| Date limite: 10000 a.C. (Terra approssimata, Luna indicativa, Io non determinabile), 1582 dalla console, 2120 | come atteso | superato | come sopra | 19/10/2026 |
| Riproduzione a 1 anno/s e 1000 anni/s all'indietro attraverso i blocchi 11, 10, 9 | attesa e ripresa | superato | come sopra | 19/10/2026 |
| Collegamento `#marte`; tastiera del § 11.9; ripiego senza WebGL2; telefono (Pixel 7) | come atteso | superato | come sopra | 19/10/2026 |
| Interazioni dell'interfaccia: TT con "Segui l'ora attuale" (ferma la riproduzione), velocità e verso disattivati con "Segui l'ora attuale", vista testuale non coperta con catalogo e scheda aperti (1280 e 1440 px), focus dopo Invio e passo nella tabella, dopo la selezione dal catalogo (768 e 400 px) e dopo "Mostra le comete", esito visibile di "Copia collegamento" anche con gli appunti negati, hash non conformi (`#Marte`, `#1P`, `#C/1680 V1`), scheda senza posizione (Halley e Titano nel 5000 a.C.: nessun "Ora" ripetuto, niente M, T e anello di selezione), licenza CC BY con URI, GM di Bennu in m³/s², zoom e regolo ai limiti, tabella con un blocco in errore, fasce di Mercurio e Luna | 13 prove; prima delle correzioni 13 su 13 non superate | superato | Playwright `e2e/interazioni.spec.ts` | 19/10/2026 |
| Etichette e pannelli (§ 11.5.2): vista iniziale e "Pianeti giganti" con fuoco su Saturno a 1440 × 900; telefono (Pixel 7) con e senza scheda | nessun punto delle etichette mostrate (griglia di 4 px) coperto da barra, pannelli, regolo, legenda o console; prima: 9 etichette coperte nella vista iniziale e, in "Pianeti giganti", "Plutone +3 lune" ridotta a "lune" | superato | Playwright `e2e/scena.spec.ts`; Vitest `tests/render/etichette.test.ts` | 19/10/2026 |
| Eclittica della data (RF5) | nota nel pannello Livelli, descrizione della casella; 0 pixel cambiati con l'elevazione di 30°, oltre 500 dopo due scatti di Freccia giù | superato | Playwright `e2e/scena.spec.ts` | 19/10/2026 |
| Preset "Oggetti interstellari" e limite di zoom (RF1, § 10.3, § 11.3) | ampiezza 200 000 UA a 1440 × 900 (prima 165 685 UA), regolo "Vista ampia 200 000 UA", "Allontana" fermo al limite; in Node ampiezza al limite 2·10⁵ UA con aspetti 1440/900, 1280/800, 1 e 412/839 | superato | Playwright `e2e/scena.spec.ts`; Vitest `tests/render/limiti.test.ts` | 19/10/2026 |
| `stars.bin` e texture della Terra con risposta 404, poi disponibili (§ 5.6) | nuovo tentativo dopo circa 2 s, stelle disegnate e texture caricata senza ricaricare la pagina | superato | Playwright `e2e/scena.spec.ts` | 19/10/2026 |
| Interfaccia (§ 11.3-11.13): catalogo e legenda, tablet con vista testuale, telefono (nota di benvenuto, velocità a 320 e 400 px, orizzontale a 568 × 320 e 640 × 360), editor della data (orizzontale, senza WebGL2, chiusura senza modifiche, riproduzione, "Segui l'ora attuale"), live region (fine del caricamento, regolo, attesa in riproduzione), vista testuale, scheda, ricerca, hash | 23 prove: nessuna sovrapposizione né testo tagliato; istante invariato senza modifiche; un annuncio per passo del regolo; frecce nell'ordine mostrato; hash del corpo selezionato | superato | Playwright `e2e/interfaccia.spec.ts` | 19/10/2026 |
| Coerenza dell'interfaccia (§ 7.8.2, § 11.1-11.13): colonna delle distanze libera dalla console (768-1024 × 600-672, 1024 × 768, 1440 × 900) con il menu Viste raggiungibile; nessun antenato con `backdrop-filter` per editor della data e menu Viste; messaggio di Trova nascosto fuori dal campo e ricerca svuotata dalla selezione dal catalogo; ‘Oumuamua con U+2018 e dettaglio "433 · A898 PA"; avviso del limite tolto da Inizio e Fine; annuncio dello zoom da tastiera e del suo limite; colonna Affidabilità visibile a 1280 × 800 e 1366 × 768; pulsante della scheda sotto la legenda a 320 × 568; senza WebGL2 almeno tre righe a 568 × 320, 640 × 360, 667 × 375 e 320 × 568; senza WebGL2 nota di benvenuto, avviso WebGL2 ed errore con "Riprova" raggiungibili con le righe visibili a 320 × 568, 360 × 640 e 640 × 360; focus dopo la chiusura dei messaggi e dopo "Riprova"; numeri di "Fonti e metodi" su una riga a 320 px; fasce del regolo con altezza, titolo e testo; M e T di Marte al pericentro a −10000 | 27 prove; prima delle correzioni 24 su 27 non superate (1024 × 768, 1440 × 900 e la prova dei messaggi senza WebGL2 a 640 × 360 già corrette) | superato | Playwright `e2e/coerenza-interfaccia.spec.ts` | 21/10/2026 |
| Regressioni dell'interfaccia (§ 6.6, § 11.3-11.12): Invio sul pulsante a.C. dell'editor; messaggio del limite del regolo non sostituito dalla data al rilascio; regolo delle distanze con 10³ km in alto accanto ad Avvicina e PagSu che avvicina come sulla mappa; annuncio del corpo selezionato da collegamento, anche dopo uno ignorato; "Mostra di nuovo la nota di benvenuto" con focus sulla nota; nome di "Tabella" e della data (desktop e foglio del telefono) con l'etichetta visibile (WCAG 2.5.3); focus nel catalogo e nella scheda dopo il cambio di layout (1440 ↔ 500 e 390 px); campo Trova di almeno 120 px a 480 × 320, 568 × 320 e 640 × 360; nota di benvenuto e caricamento senza coprire legenda, console e pulsanti della mappa a 400 × 800, 320 × 568, 320 × 480, 768 × 1024, 640 × 360, 568 × 320 e 480 × 320, con il pulsante "Apri la scheda" del telefono libero e attivabile (prima della correzione del 22/10/2026 i messaggi lo coprivano a 320 × 568 e 320 × 480); in orizzontale, a pannello laterale scorso, caricamento ed errore con "Riprova" visibili e pulsante con il focus visibile a 844 × 390, 640 × 360 e 568 × 320; regolo delle distanze da tastiera e con il puntatore: Inizio e Fine con il Sole e con la Terra a fuoco annunciano l'ampiezza ottenuta e il limite, le frecce al limite il solo messaggio, `aria-disabled` su Avvicina e Allontana; con la vista sotto 10³ km (Bennu) FrecciaSu avvicina e Fine non allontana; ordine di Tab della console uguale all'ordine visivo a 1280 × 800, 768 × 1024, 400 × 800 (foglio medio) e 800 × 400, anche dopo il cambio di layout con il focus sui passi | 14 prove; prima delle correzioni 14 su 14 non superate | superato | Playwright `e2e/regressioni-interfaccia.spec.ts` | 22/10/2026 |
| Telefono, foglio e focus (§ 11.3, § 11.7, § 11.9, § 11.12): "Inquadra" della scheda a 400 × 800 con Saturno (foglio compatto, Saturno sopra il foglio e non coperto, focus sul pulsante "Apri la scheda", annuncio invariato; a 844 × 390 la scheda resta aperta); Invio su una riga della tabella a 400 × 800 (focus sul titolo "Marte" non coperto; a 844 × 390 il focus resta sulla riga); cambio di layout con il focus su regolo, unità del passo, passo avanti e "Adesso" (844 × 390 ↔ 390 × 844) e anche sul cursore delle distanze (1440 × 900 ↔ 390 × 844): focus sulla maniglia del foglio o sul pulsante della data, mai sul body, e "Velocità" che lo conserva; pulsante "Apri la scheda" nascosto con la vista testuale aperta a 390 × 844 e 320 × 568, di nuovo visibile e non coperto a vista chiusa, tasto T con il focus sul pulsante | 12 prove; prima delle correzioni 6 su 12 non superate (le altre 6 verificano ciò che non cambia) | superato | Playwright `e2e/telefono-foglio.spec.ts` | 21/10/2026 |
| Tacche del regolo inferiore a cavallo della riforma del calendario (§ 11.4.3): ampiezze da 2 a 1600 giorni, larghezze 252, 412, 600 e 1000 px, ago da luglio a dicembre 1582; 1700, 2026 e 2028 | nessuna coppia di tacche maggiori a meno di 46 px (metà della distanza minima delle etichette) né di tacche a meno di 3,5 px (metà di quella delle tacche minori); nessuna tacca del 16 ottobre con le tacche ogni 15 giorni; negli anni senza salto, tutte e sole le tacche dei giorni 1 e 16 | superato; prima della correzione l'1 e il 16 ottobre 1582 distavano da 30,7 a 45,9 px | Vitest `tests/ui/controlli.test.ts` | 21/10/2026 |
| Nota di benvenuto e messaggi su desktop e tablet (§ 11.3, § 11.12; WCAG 2.2, SC 1.4.4 e 1.4.10): primo avvio a 1024 × 500, 1024 × 600, 1280 × 720, 900 × 500, 930 × 500, 939 × 500, 960 × 540, 1000 × 560, 768 × 1024, 744 × 1133, 800 × 600, 819 × 600, 735 × 800, 730 × 700, 720 × 800, 700 × 829, 700 × 800, 700 × 500, 700 × 520, 700 × 512 con scala 2 (1400 × 1024 al 200 %), 700 × 960, 700 × 700 e 700 × 480, gli ultimi due anche senza selezione, 700 × 480 anche con i caratteri di ripiego (sotto i 700 px il layout è quello del telefono: riga seguente); finestra ridimensionata tra le due forme della nota, anche con il dialogo della nota aperto (3 chiusure con Esc e 3 con "Chiudi"); "Mostra di nuovo la nota di benvenuto" a 700 × 480 e 700 × 512 con scala 2 | nota sempre visibile, preferenza invariata; contenitore dei messaggi nello schermo, senza sovrapposizioni con legenda, pulsanti, console, campo Trova, strumenti e Scheda; con la Scheda sul tablet messaggi larghi almeno 200 px o nella colonna della Scheda, sopra di essa; nome, "Espandi la scheda" e "Chiudi la scheda" liberi e Scheda sopra la console; nota intera da 700 a 735 px; pulsante di chiusura libero; nota intera alta almeno 120 px, con il bordo sfumato finché c'è altro testo e l'ultima riga raggiungibile scorrendo; nota ridotta intera nel contenitore, o con il bordo sfumato, con il comando libero che apre il dialogo con le tre frasi e riceve il focus alla chiusura, anello del focus di "Leggi" e "Chiudi" tutto nella parte visibile dei messaggi; dialogo chiuso dopo il ritorno alla nota intera: focus sulla nota; forma stabile, focus mai sul body, nessun errore nella finestra (anche del ResizeObserver); 3 prove; prima delle correzioni del 22/10/2026 la nota copriva 24 px della scheda e la legenda a 1024 × 500, "Viste predefinite" a 900 × 500 e usciva dallo schermo a 700 × 500 (491 px di altezza); prima di quelle successive 3 su 3 non superate: nota nascosta a 600 × 480 e 640 × 512 con il testo assente dal DOM, nessun indizio di scorrimento a 1024 × 500, "Mostra di nuovo la nota di benvenuto" senza effetto visibile; con le soglie del tablet stretto a 720 e 924 px, messaggi larghi 190 px accanto alla Scheda a 930 × 500 e nota ridotta da 720 a 735 px; dopo la verifica indipendente 2 su 3 non superate: anello del focus di "Leggi" visibile per il 5 % a 900 × 500, focus sul body alla chiusura del dialogo, nota ridotta di 36 px in 35 px a 600 × 480 con i caratteri di ripiego | superato | Playwright `e2e/regressioni-interfaccia.spec.ts` | 22/10/2026 |
| Menu Viste, popover della barra e barre di scorrimento classiche (§ 11.3; WCAG 2.2, SC 2.1.1 e 2.4.11): menu Viste con la nota a 700 × 480, 700 × 512 (scala 2), 700 × 520, 700 × 500, 700 × 700, 700 × 960, 700 × 829, 744 × 1133, 768 × 1024, 800 × 600 e 819 × 600 con il mouse, a 700 × 480, 700 × 700, 700 × 829 e 800 × 600 al tocco, e con i pulsanti in riga da 700 × 500 a 1024 × 500; risultati di Trova, Livelli e Menu con la nota a 768 × 1024, 1024 × 500, 1280 × 1024, 320 × 568 al tocco, 683 × 384 con scala 2 (anche al tocco) e, sul telefono fino a 699 px, a 600 × 480, 640 × 512 (scala 2), 650 × 520, 699 × 700, 699 × 480 al tocco, 600 × 700 al tocco e 690 × 829 al tocco (viste nel Menu); Chromium con barre di scorrimento di 15 px a 700 × 480 senza selezione e 844 × 390 | 10 voci su 10 intere nella finestra e libere senza scorrere, l'ultima attivata con il puntatore e annunciata; da tastiera ogni voce con il focus libera, riapertura dalla prima voce, Tab oltre l'ultima chiude il menu e lascia libero il controllo successivo, Invio sceglie la vista e riporta il focus al pulsante; popover e viste del Menu senza punti coperti (griglia di 6 px); forma della nota invariata per 4 passi della data; nessuna notifica del ResizeObserver non consegnata; 4 prove (una è la prova dei pulsanti in riga, estesa sotto gli 820 px); prima delle correzioni 4 su 4 non superate: 4 voci intere su 10 a 1024 × 500 e 1 a 600 × 480, risultati di Trova coperti dalla nota a 768 × 1024, nota alternata (visibile, nascosta) a 600 × 480 | superato | Playwright `e2e/regressioni-interfaccia.spec.ts` | 22/10/2026 |
| Anello del focus, sfumatura dei messaggi, dialogo della nota e ResizeObserver (§ 11.1, § 11.3, § 11.12; WCAG 2.2, SC 2.4.3 e 2.4.7): comandi della Scheda nei 24 casi con la Scheda della prova della nota (anche 700 × 480 con i caratteri di ripiego); 6 chiusure del dialogo della nota (3 con Esc, 3 con "Chiudi") dopo il ritorno alla nota intera, con il focus controllato ogni millisecondo; menu Viste a due colonne a 700 × 480 con il puntatore sulla voce sottostante (8 voci); viste, Tabella, Fonti e metodi e Impostazioni del Menu del telefono da tastiera a 320 × 568 e 320 × 480 al tocco; messaggi a 320 × 568 (9 px in più), 320 × 480 e 1024 × 600 all'inizio, a 4 px e alla fine dello scorrimento; 10 viste predefinite attivate con la nota a 1024 × 520, 320 × 480 e 320 × 568 e 8 passaggi tra 1024 × 490-600 e 1000 × 560 | anello di "Espandi la scheda" e "Chiudi la scheda" dentro la Scheda e delle voci dentro il Menu; lato inferiore dell'anello col colore --fuoco in almeno il 95 % delle colonne di pixel; nessun controllo con il focus sul body; sfumatura mai più alta del contenuto nascosto e presente, fino a 40 px o al 30 % dell'altezza, se ce n'è; a 320 × 568 righe intere della nota con opacità almeno 0,95; nessun errore nella finestra; 6 prove (3 estese, 3 nuove); prima delle correzioni 6 su 6 non superate: anello della Scheda fino a 171 px con la Scheda fino a 167, focus sul body (12 controlli alla prima chiusura con Esc), lato inferiore dell'anello in 0 colonne su 229, anello dell'ultima vista fino a 546,5 px con il Menu fino a 543, sfumatura di 40 px con 9 px nascosti, notifiche del ResizeObserver non consegnate a 1024 × 520 | superato | Playwright `e2e/regressioni-interfaccia.spec.ts` | 22/10/2026 |
| Messaggi di caricamento ed errore e Catalogo con poco spazio in altezza (§ 11.3, § 11.6, § 11.11): 7/10/975 a.C. (blocco 9, console con la riga dell'incertezza dell'ora); caricamento con i blocchi ritardati di 8 s a 700 × 480, 700 × 512 con scala 2 e 700 × 500 con e senza la nota, 700 × 520 e 900 × 500 con la nota, 700 × 700 senza selezione, 800 × 600 e 1024 × 600 con la nota; errore persistente (blocco 9 con risposta 404) a 700 × 480 con e senza la nota, 700 × 512 con scala 2, 700 × 500 e 900 × 500; Catalogo aperto a 700 × 480, 700 × 700, 700 × 512 con scala 2, 700 × 520, 700 × 500 e 900 × 500 | messaggio in cima ai messaggi, intero se entra, altrimenti in tutta la parte visibile con il bordo sfumato, centro libero; messaggi senza sovrapposizioni con la Scheda; nome, "Espandi la scheda" e "Chiudi la scheda" liberi e Scheda sopra la console; "Riprova" con il focus visibile e libero; Catalogo sopra la console, alto almeno 160 px o fino a 24 px dalla console, con titolo, chiusura e "Mostra" dentro il pannello e liberi, prima voce con il focus visibile; 3 prove; prima delle correzioni 3 su 3 non superate: su e6ce56e caricamento ed errore sopra il nome della Scheda a 600 × 480 e Catalogo alto 2 px a 600 × 480 e 600 × 700; con i messaggi in testa alla colonna della Scheda senza riserva per l'intestazione, Scheda di 28-32 px con i comandi non cliccabili e sovrapposta alla console a 600 × 480 | superato | Playwright `e2e/regressioni-interfaccia.spec.ts` | 22/10/2026 |
| Soglia tra telefono e tablet a 700 px (§ 11.3, § 11.5.1, § 11.6, § 11.9, § 11.11, § 11.12, A12; WCAG 2.2, SC 1.4.4 e 1.4.10), decisione del 22/10/2026 sulle finestre larghe 600-699 px: `modalitaLayout` a 320, 599, 600, 690, 699, 700, 1023 e 1024 px e in orizzontale a 568 × 320, 699 × 479 e 700 × 479 (Vitest); a 699 × 480, 699 × 700 (anche al tocco), 700 × 480, 700 × 700, 699 × 479 e 700 × 479 layout atteso, foglio, maniglia, pulsanti della mappa, «Apri la scheda», Menu, posto della scheda e del catalogo, colonna delle distanze e scorrimento orizzontale; passaggio per i 700 px senza ricaricare (700, 699, 700, 650, 768, 699 px) con la scheda al suo posto e il focus su un elemento visibile; cambio di layout tra 700 e 699 px con il focus su regolo, passi, «Adesso» e cursore delle distanze; A12 a 640 × 512 con scala 2 e a 690 × 829; telefono a 600 × 480, 640 × 512 (scala 2), 650 × 520, 600 × 700, 600 × 960, 690 × 829, 699 × 480 e 699 × 700: legenda, pulsanti della mappa, campo Trova, foglio e «Apri la scheda», Livelli, «Mostra di nuovo la nota di benvenuto» dal Menu, caricamento ed errore con «Riprova», Catalogo nel foglio, nota con il foglio esteso (400, 600 e 699 px), etichette della velocità a 699 px, vista testuale con la mappa e senza WebGL2, pulsante «Apri la scheda» con la vista testuale a 600 × 480 e 699 × 700 | layout del telefono fino a 699 px e del tablet da 700 px, orizzontale a 699 × 479; legenda larga almeno 300 px e alta al più 80 px (483 × 56 px misurata), mai sopra pulsanti, campo Trova, foglio o «Apri la scheda» (prima, sul tablet: 80 × 336 px a 600 × 700 e 240 × 118 px, sovrapposta per 206 × 51 px ai pulsanti in riga, a 600 × 480); Livelli alto quanto la finestra concede e libero (388 px a 600 × 480, prima 107 px); vista testuale con la mappa, a nota chiusa e senza selezione, con righe visibili (centro visibile e non coperto, come `righeVisibili`): 4 a 600 × 480 e 699 × 480 (3 intere), 5 a 640 × 512 e 650 × 520 (4 intere) (la prova chiede almeno 2; prima 0), senza WebGL2 almeno tre righe; messaggi sotto la legenda e sopra il foglio, «Riprova» libero; Catalogo nel foglio alto almeno 160 px; nessuno scorrimento orizzontale; 23 prove Playwright nuove e 13 aggiornate (8 che trattavano 600-699 px come tablet, portate a 700 px; 5 estese al telefono fino a 699 px), 1 prova Vitest estesa; sullo stato precedente non superate: Vitest 1 su 1 e Playwright 28 su 36 tra nuove e aggiornate (le 8 portate a 700 px non cambiano esito); dopo: suite completa 224 prove Playwright superate, 135 nei cinque file | superato | Vitest `tests/ui/controlli.test.ts`; Playwright `e2e/interfaccia.spec.ts`, `e2e/accessibilita.spec.ts`, `e2e/regressioni-interfaccia.spec.ts`, `e2e/coerenza-interfaccia.spec.ts`, `e2e/telefono-foglio.spec.ts` | 22/10/2026 |
| Telefono con vista testuale e foglio esteso (§ 11.9; WCAG 2.2, SC 2.4.7 e 2.4.11) a 400 × 800: Maiusc+Tab e Tab dal titolo della scheda; riga della tabella con il focus quando il foglio torna esteso (800 × 800 e ritorno a 400 × 800) | tabella ridotta a 2 px con il contenitore `inert`: nessuno dei 119 controlli (112 righe, 6 intestazioni, 1 regione) nell'ordine di Tab, focus sulla maniglia del foglio; con il foglio ridotto la tabella torna raggiungibile e la riga con il focus non è coperta | 2 prove; prima della correzione Maiusc+Tab dalla maniglia entrava nell'ultima riga, invisibile, e il focus restava in una riga coperta | superato | Playwright `e2e/telefono-foglio.spec.ts` | 22/10/2026 |
| Marcatore del corpo selezionato ed etichette degli altri corpi (§ 11.5.2): preset "Fascia di Kuiper" a 1280 × 800 al JD 2 461 334,0 con il Sole e 2P/Encke selezionati; layout con marcatore protetto (altro lato, nessun lato libero, etichette forzate, etichetta del corpo stesso) | nessun punto di una griglia di 2 px nel riquadro di marcatore e anello coperto da un'etichetta di un altro corpo; etichetta del corpo selezionato visibile; Vitest: l'etichetta di un altro corpo passa all'altro lato, resta nascosta senza lati liberi, quella forzata resta visibile | superato; prima della correzione "Giove +6 lune" e "Borrelly" coprivano il marcatore del Sole | Playwright `e2e/scena.spec.ts`; Vitest `tests/render/etichette.test.ts` | 22/10/2026 |
| Live region in riproduzione (§ 11.9, A17; WCAG 2.2, SC 4.1.3): riproduzione ordinaria a 1 min/s e "Segui l'ora attuale" a 1 s/s senza annunci dovuti al tempo (data che avanza, barra di caricamento di un blocco in attesa); annunciati durante la riproduzione passo, velocità, risultati di Trova, selezione da Trova, "Nessun corpo per ...", filtro e selezione dal catalogo, livello, selezione con N, vista testuale aperta e chiusa, attivazione e disattivazione dell'opzione; annunciatore (origine dell'annuncio, scarto all'avvio della riproduzione, sostituzione del testo di caricamento) | 3 prove Playwright e 4 prove Vitest; prima della correzione, con "Segui l'ora attuale", la regione restava su "Dati caricati." dopo ognuna delle 11 azioni (2 prove Playwright su 3 e 3 prove Vitest su 4 non superate) | superato | Playwright `e2e/accessibilita.spec.ts`, ui-lab; Vitest `tests/ui/controlli.test.ts` | 21/10/2026 |
| Annunci di errore e di uscita da "Segui l'ora attuale" (§ 11.4.3, § 11.7, § 11.9, § 11.11, A17; WCAG 2.2, SC 4.1.3): riproduzione a 10 anni/s verso un blocco in errore; con l'opzione attiva, passo, "Adesso", regolo da tastiera, "Vai" dell'editor dopo una modifica, passo fino al limite, pausa, disattivazione esplicita e ingresso in TT; blocco "Ora" e "Leggi posizione" con il blocco della data in errore, con "Riprova" in corso e a caricamento riuscito | arresto per errore annunciato una volta ("Riproduzione in pausa: dati non caricati" con la data); "disattivato" unito alla data (passo, "Adesso", regolo, editor) o al messaggio del limite, da solo per l'ingresso in TT, mai ripetuto al passo successivo; pausa e disattivazione esplicita invariate; "Dati non disponibili a questa data." con il blocco in errore, "Dati in caricamento." con "Riprova" in corso, valori a caricamento riuscito; 4 prove Playwright e 3 prove Vitest, prima della correzione 4 prove Playwright e 3 prove Vitest non superate | superato | Playwright `e2e/accessibilita.spec.ts`, `e2e/errori.spec.ts`, `e2e/interazioni.spec.ts`; Vitest `tests/ui/controlli.test.ts`, `tests/ui/scheda.test.ts`, `tests/ui/testi.test.ts` | 22/10/2026 |
| Selezione al clic nella scena della pagina di prova dell'interfaccia (§ 11.5.3), 1280 × 800 al JD 2 461 332,4 con Terra selezionata: clic sul testo dell'etichetta di Venere (29 px dal marcatore), su canvas vuota e a 0,6 R dal centro del disco di Terra (ampiezza 40 000 km, R = 127,6 px) | Venere selezionata, selezione invariata, Terra selezionata, come nella scena reale; prima della correzione nessuna selezione, selezione azzerata, nessuna selezione | superato | Playwright `e2e/ui-lab.spec.ts` | 22/10/2026 |
| Ordine di Trova e limiti della data (§ 6.6, § 11.4.3, § 11.6): query «1» sul catalogo pubblicato; istanti a 0 e fino a 1 giorno dai limiti in UT e in TT, dall'una e dall'altra parte | comete di rango 1 in ordine 1P, 12P, 19P, 103P, 109P (prima 103P, 109P, 12P, 19P, 1P), con il limite di 8 risultati 1P e 12P; `istanteAlLimite` uguale a `limiteRaggiunto` in ogni punto (prima discordi entro 1e-9 giorni dal limite); console e messaggi senza confronti propri con i limiti | superato | Vitest `tests/ui/cerca.test.ts`, `tests/ui/messaggi.test.ts`, `tests/progetto/limitiData.test.ts` | 22/10/2026 |
| Build di prova in `dist-test-rot/` con `--outDir` (§ 5.2) | ignorata da git e da ESLint come `dist-test/`; prima `git status` la mostrava e `eslint .` segnalava errori sul bundle | superato | Vitest `tests/progetto/cartelleBuild.test.ts` | 22/10/2026 |
| Elementi osculanti della scheda contro Horizons (32 casi: pianeti al 2026 e al 1956, Cerere, Eros, 1P al 1986, Sedna, Arrokoth, Eris, Luna, Io, Titano, Caronte, Notte, Idra; corpi lontani rispetto al baricentro, centro 500@0: 3I/ATLAS nel 1626, 1666 e 2121, 2I/Borisov e 1I/'Oumuamua nel 1626, C/1995 O1 nel 1627, Sedna nel 1907 e nel 2050) | differenza entro un'unità dell'ultima cifra mostrata (o l'incertezza stimata per gli angoli mal definiti e per i valori con "≈"); pianeti confrontati con i baricentri dei sistemi (comandi 1-9), come dichiara la riga del riferimento della scheda; Notte e Idra confrontati con gli elementi rispetto al baricentro Plutone-Caronte (Horizons, centro 500@9: 49 206 km e 65 355 km); pericentro più vicino all'istante; prima delle incertezze dipendenti dallo stato 7 casi lontani su 8 fuori tolleranza (3I nel 1626: e 428 volte l'incertezza, T 8,8 h). Comete quasi paraboliche (Horizons, 20/10/2026, nel riferimento della scheda): C/1965 S1-A a 78 UA, centro 500@0, e = 0,99990828, mostrata 0,99991 (prima "1,000" con P 795 anni), C/2023 A3 a 8,7 UA, centro 500@10, e = 1,0001853, mostrata 1,00019 (prima "1,000" con "Orbita iperbolica"); al perielio C/1975 V1-A, C/1995 O1 e C/2020 F3 con elementi eliocentrici, 1/a entro 2·v·δv/μ (δv = 0,6 m/s) da Horizons, centro 500@10 (con gli elementi baricentrici, prima della correzione del § 7.6.5: West a = 10,3 UA invece di -11 010 UA, NEOWISE 95,8 UA invece di 358,5 UA); forma incerta (C/1975 V1-A, C/1996 B2) "≈ 1 (quasi parabolica)"; 1I/'Oumuamua nel 9094 a.C. "non determinabile" (δe = 32) | superato | Vitest `tests/ui/scheda.test.ts`, `tests/fixtures/scheda/elementi-horizons.json`, `tests/ephem/service.test.ts` (comete al perielio) | 20/10/2026 |

## 13. Differenze note rispetto a JPL Horizons

| Argomento | Differenza | Effetto |
|-----------|------------|---------|
| ΔT prima del 1950 | Horizons supera S15.2020 e la parabola del proprio manuale: +76,2 s a -720, +511,7 s a -5000, +1 510,1 s a -9997,5; differenza 0 nel 1950 (§ 3.1) | le fixture in UT non coincidono con Horizons prima del 1950; le prove delle effemeridi sono in TDB |
| ΔT dopo l'ultimo dato IERS | Horizons tiene TDB - UTC costante; il modello usa la curvatura mareale: +1,8 s nel 2050, +17,5 s nel 2100, +28,6 s nel 2120 | dichiarato in "Fonti e metodi" |
| Scala di TDB - UT | Horizons dà TDB - UT1 prima del 1962 e TDB - UTC dopo | confronto in UT1 con la serie C04 dal 1972 |
| Intervallo | Horizons non produce effemeridi prima del 9999 a.C. marzo 15 | confronto ΔT dal -9997,5 |
| Longitudine subsolare | il modello è geometrico, Horizons apparente: scarto medio +0,0056° (aberrazione annua) | entro la soglia di A8 |
| Nereide | modello su NEP105 (tabella del § 7.5.1), Horizons su NEP098: 138″ nel 1900-2100 | sotto ε_adattamento di Nereide (613″) |
| Tritone | il modello usa NEP098 (1800-2199), come Horizons; con NEP097 lo scarto era 20″ nel 2000 e 384″ nel 1907 | scarto da Horizons 2″ |
| Disnomia | soluzione Horizons `tnosat_v001_20136199_jpl` solo nel 2000-2030; modello kepleriano di Holler et al. (2021) | 324″ nel 2000-2030 |
| Asteroidi di sb441-n16 nel 1600-2121 | sb441-n16 dista dalla soluzione corrente fino a 14 357 km (Psyche, 1621) | nella finestra si usa l'SPK Horizons della soluzione corrente |
| Bennu, C/2013 A1 | Horizons rifiuta l'SPK degli oggetti precalcolati | vettori Horizons tabulati e interpolati |
| Vettori di validazione | Horizons ordina le epoche richieste e integra in sequenza: con un'epoca antica in un tratto caotico cambiano le successive (Apophis, 1,8e8 km nel 1986 con una richiesta unica 1601-2121) | epoche richieste in due gruppi per record o soluzione |
| Equazione delle origini | s(J2000) da `eraS06` include il termine di nutazione -2 640,73 µas·sin Ω: offset costante di 2,1 mas rispetto a GMST06 | 6e-7°, trascurabile |

## 14. Prove non eseguite o parziali

- A7: superato con l'eccezione dichiarata di C/1680 V1 al perielio del 18/12/1680 (759 km, 1,52 volte la tolleranza di 500 km, a 0,0062 UA dal Sole; § 7).
- A24: verificata in locale con uno scheletro che emula quello della piattaforma; la pubblicazione effettiva avviene nella fase F6 (§ 5.7).
- A26: `docs/DEBUG.md` è il registro provvisorio della fase F5 (debug); il criterio di uscita del § 13 di `docs/PROGETTO.md` non è raggiunto.
- A21 in e2e con SwiftShader: solo registrato, come previsto dal § 13.

## 15. Comandi

Dalla radice:

```sh
npm ci --no-audit --no-fund                                 # nessun avviso
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build
npm run build:artifact                                      # pagina singola in dist-artifact/ con il controllo dei limiti e degli avvisi di licenza
npx playwright test                                         # applicazione con i dati reali (desktop, mobile) e pagina singola (A24)
npx playwright test -c e2e/ui-lab.config.ts                 # interfaccia (A11-A17, A23)
npx playwright test -c tests/render/playwright.render.config.ts   # rendering (A20, A21)
```

Da `scripts/pipeline/`:

```sh
.venv/bin/python -m pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/python time_model.py valida
.venv/bin/python planets.py valida
.venv/bin/python moon.py valida
.venv/bin/python satellites.py valida --offline
.venv-assist/bin/python small_bodies.py valida --offline
.venv/bin/python pack.py
```
