# Tempo: ΔT, incertezza, scale di tempo, rotazione terrestre, stagioni

Riferimento: `docs/PROGETTO.md` versione 2.0, § 6.2-6.5, 7.7, 8.9, 11.4.3, 12.3 (passo 1), 13 (A3, A8, A9). Misure del 18/10/2026 con pyerfa 2.0.1.5 e DE441 (SHA-256 in `scripts/pipeline/raw/manifest-sorgenti.json`).

## 1. Prodotti

| Percorso | Contenuto |
|----------|-----------|
| `scripts/pipeline/time_model.py` | sorgenti congelate, modello di ΔT e σ, tabella EO, `time.json`, validazione, fixture, frammento di catalogo |
| `public/data/v1/time.json` | 57 035 byte: S15.2020 (58 intervalli), parabola prima di -720, 94 valori IERS, parametri di σ, EO su 1 214 nodi |
| `scripts/pipeline/raw/time/` | `Table-S15.2020.skyfield-1.55.npz`, `Table-S15.2020.txt`, `eopc04-estratto.txt`, `Leap_Second.dat`, `tai-utc.dat`, `historic_deltat.data`, `sorgenti.json`, `horizons/` (19 risposte) |
| `scripts/pipeline/out/validazione-tempo.json` | misure di validazione |
| `scripts/pipeline/out/catalog-tempo.json` | `orientamento` della Terra (`vondrak`, `nord-IAU`) |
| `src/time/deltaT.ts`, `timescale.ts`, `earthRotation.ts`, `nutation.ts`, `seasons.ts`, `src/data/timeReader.ts` | runtime |
| `tests/fixtures/time/` | `deltaT.json` (seme 20261037), `rotazione.json` (20261038), `sole.json` (20261032, 20261035), `stagioni.json` (20261036, istanti USNO 2023-2026); 371 kB |

## 2. Sorgenti

| Dato | Sorgente | Verifica |
|------|----------|----------|
| Tabella S15.2020 | HMNAO (http://astro.ukho.gov.uk/nao/lvm/): HTTP 503 il 18/10/2026 su pagina e tabella. Copia di Skyfield 1.55 (§ 15): ruota PyPI SHA-256 `9f98964855067460c94aa81a337194136f4a97a62ba8bbbfac1b8556f2b66ad4` (uguale al valore pubblicato da PyPI), membro `skyfield/data/delta_t.npz`, chiave `Table-S15.2020.txt`, SHA-256 `2d12bd3e789543b78a1f53c8b76ed7fecffdf7e5149cfb6a0aed21a8b3db5ff6` | prima riga [-720, -100, 20 371,848, -9 999,586, 776,247, 409,16]; S15(-720) = 20 371,848 s; 58 intervalli contigui da -720 a 2019; salto massimo ai nodi 0,001 s, della derivata 0,00067 s/anno |
| EOP 20 C04 | `https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now` (centro di produzione, Osservatorio di Parigi), fino al 2026-09-18; serie completa in `.cache/time/` (5 177 232 byte, SHA-256 nel manifest), estratto mensile congelato | la copia `datacenter.iers.org/.../EOP_20_C04_one_file_1962-now.txt` citata al § 16.1 è ferma al 2025-05-05 (Last-Modified 2025-06-04) |
| TAI - UTC | `Leap_Second.dat` (IERS, Bollettino C 72, luglio 2026): 37 s dal 2017-01-01. Prima del 1972 `tai-utc.dat` (USNO, https://maia.usno.navy.mil/ser7/tai-utc.dat, 19/10/2026): TAI - UTC = a + (MJD - MJD_rif)·b, 14 tratti dal 1961-01-01 | coefficienti uguali a IERS `UTC-TAI.history`; dal 1972 uguale a `Leap_Second.dat` |
| ΔT storico | `historic_deltat.data` (USNO, https://maia.usno.navy.mil/ser7/historic_deltat.data, 19/10/2026), semestrale 1657-1984 | solo validazione dello scarto della S15.2020 prima del 1962 |
| Validazione | JPL Horizons, tabelle osservatore: TDB-UT (quantità 30) a 75 epoche; RA apparente geocentrica del Sole (quantità 2) e tempo siderale apparente locale a Greenwich (quantità 7, sito 0°, 0°, 0 km) a 200 epoche 1900-2100; richieste da 25 epoche | Horizons non produce effemeridi prima del 9999 a.C. marzo 15 |

## 3. ΔT (§ 6.4)

Argomento y = 2000 + (JD_UT1 - 2 451 545)/365,25.

| Intervallo | Formula |
|------------|---------|
| y < -720 | 65,62 + 31,351922682·u² + δ, u = (y - 1825)/100, δ = S15(-720) - (65,62 + 31,351922682·25,45²) = -0,490701 s |
| -720 ≤ y < 2019 | spline S15.2020, forma di Horner a0 + t·(a1 + t·(a2 + t·a3)) |
| 2019 ≤ y < 2020 | (1 - w)·S15 + w·IERS, w = y - 2019; S15 prolunga l'ultimo polinomio (2016-2019) |
| 2020 ≤ y ≤ y_obs | IERS lineare |
| y > y_obs | ΔT_obs + 0,00325·(y - y_obs)² |

- Serie IERS: ΔT = 32,184 + (TAI - UTC) - (UT1 - UTC) al giorno 1 di ogni mese dalle 0h UTC del 2019-01-01 (y = 2018,9993) e all'ultimo giorno della serie; argomento da JD_UT1 = JD_UTC + (UT1 - UTC)/86 400. La serie parte dal 2019 (non dal 2020 come nell'esempio del § 8.9) perché il raccordo usa i valori IERS tra 2019 e 2020.
- y_obs = 2026,711841 (2026-09-18), ΔT_obs = 69,192937 s.
- `time.json` aggiunge ai campi del § 8.9 `deltaT.raccordo` = [2019, 2020] e `deltaT.s15.copia` = "Skyfield 1.55".

Valori di controllo (misurati):

| Grandezza | Valore | Atteso |
|-----------|--------|--------|
| ΔT(-720) | 20 371,848 s | 20 371,85 ± 0,01 s |
| ΔT(-9999-01-01 00:00 UT) | 438 384,190 s (5,074 d) | ≈ 438 384,2 s |
| Parabola di Stephenson et al. 2016 allo stesso istante | 454 049,9 s | 454 053 s |
| Salto a -720 | 1,6e-8 s | < 0,01 s |
| Salti a 2019, 2020, y_obs | 2,8e-10 s, 5,6e-11 s, 0 | continuità |
| Pendenze a -720 | -15,96 s/anno (parabola), -16,13 s/anno (S15) | -16,0 e -16,1 |
| ΔT(2120,0); ΔT(2120-12-31) | 97,48 s; 98,09 s | ≈ 97,5 s |
| S15(2019) e IERS(2019,0) | 69,240 s e 69,220 s | |
| TT_min, TT_max | -1 931 071,4261; 2 495 739,50114 | ≈ -1 931 071,43 |

## 4. Incertezza di ΔT (§ 6.5)

Per tratti, come ΔT: per y < 2019 max(σ_s, σ_S15(y), H(-500 - y) per y < -500); dal 2019 al 2020 (1 - w)·max(σ_s, σ_S15(y)) + w·σ_IERS; dal 2020 max(σ_IERS, H(N), D(N)), N = y - y_obs > 0, D(N) = 365,25·N·LOD_rms s. H(N) = 365,25·N·√((N·Q/3)·(1 + N/M))/1000 s, Q = 0,058 ms²/anno, M = 2 500 anni.

- σ_s: 0,8·u² fino al 1200 (Morrison e Stephenson 2004, validità -1000/+1200); poi interpolazione lineare nel logaritmo tra (1200; 31,25 s), (1300; 20 s), (1600; 20 s), (1700; 5 s), (1800; 1 s), (1900; 0,1 s), costante dopo il 1900. Fonte: F. Espenak, "Uncertainty in Delta T" (https://eclipse.gsfc.nasa.gov/SEhelp/uncertainty2004.html, da Espenak e Meeus 2006), con i valori di Stephenson e Houlden (1986) per il 1700-1900.
- σ_S15 e σ_IERS: scarti del ΔT del modello dalla serie giornaliera C04 (ΔT = 32,184 + (TAI - UTC) - (UT1 - UTC)), calcolati da `time_model.py sorgenti` sulla serie completa in `.cache/time/` e registrati in `raw/time/sorgenti.json` (`c04.scartiModello`):

| Tratto | Giorni | Scarto quadratico medio | Massimo |
|--------|--------|-------------------------|---------|
| S15.2020, 1962-01-01/1971-12-31 | 3 652 | 0,4545 s (σ_S15,62) | 0,6767 s (1964,42) |
| S15.2020, 1972-01-01/2018-12-31 | 17 167 | 0,1139 s (σ_S15,72) | 0,2721 s (1978,4) |
| Valori IERS mensili interpolati, 2020-01-01/2026-09-18 | 2 453 | 0,00168 s (σ_IERS) | 0,0051 s |

- σ_S15(y) = σ_S15,62 per y < 1971,0, σ_S15,72 per y ≥ 1972,0, lineare nel 1971 (`sigma.s15Iniziale`, `sigma.raccordoS15`, `sigma.s15` di `time.json`). Nel 1962-1971 la S15.2020 è sempre più bassa dei valori IERS; scarto quadratico medio per anno da 0,64 s (1964, 1965) a 0,20 s (1971). Prima della correzione σ valeva 0,114 s dal 1962: errore fino a 5,9σ.
- Prima del 1962 C04 non c'è e si adotta σ_S15,62 (ipotesi): contro la tabella storica USNO la S15.2020 ha scarto quadratico medio 0,457 s nel 1900-1961 (124 valori, massimo 1,198 s) e 0,458 s nel 1962-1971, come contro C04 (`time_model.py valida`, `usnoStorico`).
- L'errore formale di UT1 - UTC della serie C04 non supera 4,1 ms (2019-06-09) ed è 0,037 ms al 2026-09-18.
- Dopo y_obs: ΔT resta ΔT_obs + 0,00325·N², con pendenza nulla in y_obs, mentre ΔT varia ogni giorno dell'eccesso di LOD. LOD_rms = 0,539 ms (radice della media dei quadrati, 2025-09-19/2026-09-18; media 0,273 ms, massimo 1,266 ms; `c04.lodUltimoAnno`, `sigma.lodRms`). D supera σ_IERS dopo 3 giorni e H fino a circa 15 anni. Contro IERS Rapid Service (`finals.daily.iau2000.txt`, flag I, 19/09-19/10/2026) lo scarto resta entro 1,98σ (al 18/10/2026: IERS 69,2224 s, modello 69,1929 ± 0,0162 s); prima della correzione σ restava 0,0017 s (17,5σ al 18/10/2026).
- Prova retrospettiva su C04 (`time_model.py valida`, `provaDeriva`): da ogni t0 ogni 10 giorni dal 1975, ΔT(t0) + 0,00325·N² e σ con LOD_rms dei 365 giorni prima di t0; scarti entro 1σ nel 59 % (7 d), 60 % (30 d), 66 % (90 d), 78 % (1 e 5 anni), 79 % (10 anni) dei casi, entro 2σ nel 99,5 % (7 d) e nel 100 % (altri orizzonti).
- Prima della correzione σ era max(0,8·u², Huber) ovunque: 3,26 s il 19/10/2026, 2,45 s il 1/1/2000, 0 nel 1825.

| y | σ misurata | Atteso |
|---|------------|--------|
| -9999 | 103 006,1 s (28,6 h) | 103 005 s ± 1 % |
| -9999-01-01 (y = -9998,96) | 103 005,4 s | |
| -5000 | 25 653,2 s | ≈ 25 653 s |
| -3000 | 8 977,8 s | 8 978 s ± 1 % |
| -1000 | 638,45 s | ≈ 638 s |
| 1200 | 31,25 s | 31 s (Espenak e Meeus 2006, tabella 1) |
| 1700; 1800 | 5,0 s; 1,0 s | 5 s; 1 s (Stephenson e Houlden 1986) |
| 1825 | 0,56 s | |
| 1900-1970,99 | 0,4545 s | σ_S15,62 |
| 1971,5 | 0,284 s | raccordo |
| 2000 | 0,114 s | σ_S15,72 |
| y_obs | 0,0017 s | σ_IERS |
| 19/10/2026 0h UT | 0,0167 s | D(31 d) |
| 2027,0; 2030,0 | 0,057 s; 0,65 s | D |
| 2050,0 | 5,73 s | H |
| 2120 | 46,6 s | ≈ 47 s |

Soglia del § 7.7 (15°/h·σ > 90°, σ > 21 600 s): superata fino all'anno -4594 incluso. Vale con l'istante in TT, perché UT1 = TT - ΔT è incerto di σ; con l'istante in UT l'angolo ERA(UT1) è fissato e la direzione del Sole varia di 0,9856°/d·σ (1,2° a -9999). Il § 7.7 indica "circa prima del -2400", in contrasto con i valori di σ del § 6.5 (a -3000 15°/h·σ = 37°); il codice applica la formula.

## 5. Confronto con TDB-UT di Horizons (A3)

Horizons dà TDB - UT1 prima del 1962 e TDB - UTC dopo; la colonna "UT1" sottrae UT1 - UTC della serie C04 (dal 1972).

| Anno | Horizons (s) | Modello (s) | Modello - Horizons (s) |
|------|--------------|-------------|------------------------|
| -9997,5 | 439 785,79 | 438 275,68 | -1 510,1 (-0,34 %) |
| -5000 | 146 616,08 | 146 104,35 | -511,7 |
| -2000 | 46 100,81 | 45 934,95 | -165,9 |
| -720 | 20 448,02 | 20 371,85 | -76,2 (-0,37 %) |
| 0 | 10 482,08 | 10 441,31 | -40,8 |
| 1000 | 1 660,21 | 1 650,39 | -9,8 |
| 1600 | 110,47 | 109,13 | -1,35 |
| 1900 | -1,946 | -1,977 | -0,031 |
| 1950 | 28,932 | 28,932 | 0,000 |
| 1975; 1990; 2000 (UT1) | | | -0,196; 0,136; -0,020 |
| 2020-2026,5 (UT1) | | | ≤ 0,0005 in valore assoluto |
| 2050; 2100; 2120,5 | 69,184 | 70,96; 86,65; 97,78 | 1,8; 17,5; 28,6 |

- Prima del 1962 Horizons supera la S15.2020 e la parabola del proprio manuale: +76,2 s a -720 (la parabola documentata dà 20 372,3 s), +1 510 s a -9997,5; la differenza decresce con continuità fino a 0 nel 1950. Il modello segue le fonti pubblicate; la differenza vale 0,15·σ a -720 e 0,015·σ a -9998. Le fixture in UT non coincidono quindi con Horizons prima del 1950: le prove di effemeridi restano in TDB (§ 13).
- Dopo y_obs Horizons tiene TDB - UTC costante; lo scarto di 28,6 s al 2120 è quello dichiarato al § 6.4.

## 6. Equazione delle origini e tempo siderale (§ 7.7)

- s(t) = s(J2000) - ∫(X·Ẏ - Y·Ẋ)/(1 + Z) dt (IERS Conventions 2010, eq. 5.11), X, Y, Z dalla terza riga di `eraLtpb`, s(J2000) = `eraS06`(J2000, X, Y) = -9,7567e-9 rad.
- Ẋ, Ẏ: differenze centrali con estrapolazione di Richardson (passi 1 e 0,5 anni). Integrale: Gauss-Legendre a 16 punti su sottointervalli di 3 652,5 d, cumulato da J2000 verso i due estremi.
- EO = `eraEors`(LTPB, s), resa continua (salti di 2π rimossi); derivata = -integrando + d/dt `eraEors`(LTPB, 0). Nodi T0 + j·3 652,5 d, j = 0..1213. EO(T0) = 2,6128 rad.
- Interpolazione di Hermite contro calcolo diretto su 300 epoche: 2,7e-15 rad.
- s(J2000) da `eraS06` contiene il termine di nutazione -2 640,73 µas·sin Ω: EO(J2000) = -0,01661″ contro -0,01451″ di GMST06, offset costante di 2,1 mas (6e-7°).
- ERA come `eraEra00`; GST = ERA - EO in [0, 2π).

| (ERA - EO) - GMST06 | Misura | Atteso |
|---------------------|--------|--------|
| -10000 | -0,06720° | -0,067° ± 0,005° |
| T0 (-9999,66) | -0,06719° | |
| -5000 | -0,01218° | -0,012° |
| -2000; 0 | -0,00110°; -0,00010° | < 0,001° dopo l'anno 0 |
| 0-2121 (200 epoche), massimo | 1,0e-4° | < 0,001° |
| 1600-2200 (300 epoche, Python), massimo | 5,2e-6° | ≤ 0,001° |

Orientamento della Terra nella scena (matrice per righe corpo → eclittica J2000, colonne = assi x verso Greenwich, y a 90° E, z polo medio): M = R_x(ε0)·LTPBᵀ·R3(GST)ᵀ. Nutazione e moto del polo trascurati (I13).

## 7. Stagioni (§ 11.4.3)

- Longitudine apparente geocentrica del Sole sull'eclittica e sull'equinozio veri della data, come gli istanti ufficiali (Astronomical Almanac, USNO): direzione -r_Terra + (|r|/c)·v_Terra (aberrazione annua, circa -20,5″, con il tempo luce del Sole), ruotata con (R_x(ε0)·LTECMᵀ)ᵀ, più Δψ IAU 2000B (`src/time/nutation.ts`, stesse operazioni di `eraNut00b`; uguale a pyerfa entro 1e-15 rad su 200 epoche). Quadrante: primavera [0°, 90°), estate, autunno, inverno (boreali); eventi equinozio, solstizio, equinozio, solstizio.
- Giorni dall'evento: parte intera di t - t_evento; t_evento risolto con il metodo di Newton su λ(t) = q·90° con gli stati della Terra del servizio (`creaCalcoloStagione`, tolleranza 1e-7 d, ultimo evento in memoria), a partire dalla stima con la conica osculante (μ = GM_Sole + GM_Terra-Luna di DE441, Δt = ΔM/n). Senza lo stato della Terra all'istante dell'evento resta la stima. Con 0 giorni interi l'interfaccia scrive "meno di un giorno dopo l'equinozio" (o "il solstizio"): le 24 h dall'istante possono cadere in due giorni di calendario.
- Stima con la conica contro gli istanti trovati su DE441 (2 000 epoche, seme 20261036): errore massimo 0,052 d, quadranti tutti uguali. Con la longitudine geometrica media gli eventi 2024-2026 risultavano anticipati di 4-10 min (aberrazione circa 8,3 min più Δψ tra -4,4″ e +9,7″) e la conica poteva mostrare un giorno in più della durata della stagione (89 giorni nell'inverno 2023-2024, che dura 88 d 23 h 39 min).
- Restituisce `stagione`, `evento`, `quadrante`, `giorniDopo` (intero), `giorniDopoEsatti`, `istanteEvento`, `eventoRisolto`, `longitudineSole`; compatibile con `IngressoStagione` di `src/ui/contrattoScena.ts`.

## 8. Criteri A8 e A9

| Prova | Misura | Soglia |
|-------|--------|--------|
| GST TypeScript contro fixture Python (ERA - EO diretta), 200 epoche | 1,8e-13° | ≤ 0,001° |
| GST TypeScript contro `eraGmst06`, 60 epoche 1600-2121 | 5,2e-6° | ≤ 0,001° |
| GST TypeScript contro `eraGmst06` a T0 | -0,06719° | -0,067° ± 0,005° |
| Longitudine subsolare (RA apparente - TSL apparente di Horizons) contro modello con stati DE441, 200 epoche 1900-2100 | massimo 0,0071°, medio +0,0056° (aberrazione annua) | ≤ 0,1° |
| Angolo orario del Sole alle 12:00 UT1 contro E - 0,9856°·ΔT[d], 200 giorni nell'intervallo (seme 20261035) | 0,361° con L0 di Meeus eq. 25.2; 0,904° con L0 di Meeus eq. 28.2 (termini fino a τ⁵) | ≤ 1° |
| Solstizio 20/06/2024 20:51 UT: massimo della declinazione geometrica sull'equatore medio della data | 20:38,1 UT (-12,9 min); 23,43593° contro obliquità media 23,43610° (-0,00016°) | ± 1 h; ± 0,01° |
| Equinozi e solstizi da dicembre 2023 a dicembre 2026 (13 eventi) contro USNO (https://aa.usno.navy.mil/api/seasons, UT al minuto): longitudine apparente su DE441 | da -0,34 a +0,57 min | ± 1 min |
| Gli stessi eventi attraverso `creaStagione` con i dati pubblicati: stagione 1 min prima e 1 min dopo l'istante USNO; giorni interi 1 min prima e dopo evento + N giorni | stagione e giorni attesi in tutti i casi; 20/03/2024 02:40 UT: inverno, 88 giorni | uguaglianza |

- E = L0 - α, α geometrica media della data (Meeus 1998, eq. 28.1 senza aberrazione e nutazione). Lo scarto cresce con la distanza da J2000 (0,006° dopo il 1000, 0,36° a -9999): il Sole medio non è definito in modo univoco a epoche remote.
- UT1 delle epoche Horizons: UTC + (UT1 - UTC) della serie C04 dal 1972 al 2026-09-18, ultimo valore dopo, nessuna correzione prima del 1962 (Horizons dà UT1).
- TypeScript riproduce le stesse misure dalle fixture (`tests/time/earthRotation.test.ts`, `seasons.test.ts`).

## 9. Runtime

| Funzione | Uso |
|----------|-----|
| `leggiTimeDaBuffer(buf)`, `leggiTime(json)` | `DatiTempo` { `deltaT`, `eo`, `fonti` }; `ErroreFormato` se non conforme |
| `impostaModelloTempo(dati.deltaT)`, `makeTimeState(jd, scala)` | contratto del § 5.4; `creaMakeTimeState(d)` per un modello esplicito |
| `limitiScala(d, scala)`, `nelIntervallo`, `utDaTT`, `ttDaUT` | limiti del § 6.2 in UT e in TT |
| `deltaT`, `sigmaDeltaT`, `sigmaS15DaAnno`, `infoRigaDeltaT(t, ω)` | riga ΔT (§ 11.4.3): σ in ore, ε della Luna, avviso oltre 1′ |
| `eraRad`, `equazioneOrigini`, `gstRad`, `orientamentoTerra(eo, jdUT1, jdTT, out)` | rotazione terrestre, senza allocazioni |
| `longitudineSubsolare(m, rTerra)`, `rotazioneIndeterminata(σ)` | punto subsolare; soglia del § 7.7 (la scheda la applica con l'istante in TT) |
| `stagioneAstronomica(statoTerra, jdTT, fornitore?)`, `creaCalcoloStagione(fornitore)`, `longitudineSole`, `declinazioneSole`, `obliquitaMedia` | stagione (longitudine apparente, istante dell'evento) e grandezze del Sole |
| `nutazioneLongitudine(jdTT)` | Δψ IAU 2000B (rad) |

Tempi in Node 22 (200 000 chiamate): `makeTimeState` 0,26 µs (UT e TT), `orientamentoTerra` 0,53 µs, `stagioneAstronomica` 5,5 µs (con i 77 termini della nutazione; misura del 19/10/2026). ΔT, ERA ed EO TypeScript coincidono bit per bit con la pipeline sulle fixture; σ salvo un caso su 902 (3,6e-15 s nel 1276, interpolazione nel logaritmo).

## 10. Comandi

Da `scripts/pipeline/`:

```sh
.venv/bin/python time_model.py sorgenti     # congela S15.2020, C04, TAI - UTC, ΔT USNO (--offline: solo verifica)
.venv/bin/python time_model.py genera       # public/data/v1/time.json
.venv/bin/python time_model.py horizons     # risposte Horizons in raw/time/horizons/
.venv/bin/python time_model.py valida       # out/validazione-tempo.json
.venv/bin/python time_model.py fixture      # tests/fixtures/time/
.venv/bin/python time_model.py catalogo     # out/catalog-tempo.json
```

## 11. Fonti

- Morrison, L. V., Stephenson, F. R., Hohenkerk, C. Y., Zawilski, M. (2021), Proc. R. Soc. A 477:20200776, tabella S15.2020.
- Stephenson, F. R., Morrison, L. V., Hohenkerk, C. Y. (2016), Proc. R. Soc. A 472:20160404.
- Morrison, L. V., Stephenson, F. R. (2004), J. Hist. Astron. 35, 327; Huber, P. J. (2000).
- Stephenson, F. R., Houlden, M. A. (1986), Atlas of Historical Eclipse Maps, Cambridge University Press; Espenak, F., Meeus, J. (2006), Five Millennium Canon of Solar Eclipses, NASA/TP-2006-214141.
- McCarthy, D. D., Luzum, B. J. (2003), Celest. Mech. Dyn. Astron. 85, 37 (IAU 2000B); ERFA `eraNut00b`.
- USNO, Astronomical Applications API, "Earth's Seasons" (https://aa.usno.navy.mil/api/seasons?year=2023, 2024, 2025, 2026), consultata il 19/10/2026.
- JPL Horizons, manuale (https://ssd.jpl.nasa.gov/horizons/manual.html), sezioni "Universal Time" e "Greenwich Mean Sidereal Time".
- IERS EOP 20 C04; IERS, `Leap_Second.dat` e `UTC-TAI.history`; IERS Rapid Service/Prediction Centre, `finals.daily.iau2000.txt` (https://datacenter.iers.org/data/latestVersion/finals.daily.iau2000.txt), consultato il 19/10/2026; Petit, G., Luzum, B. (2010), IERS Conventions (2010), IERS TN 36, eq. 5.11, 5.15.
- USNO, `tai-utc.dat` e `historic_deltat.data` (https://maia.usno.navy.mil/ser7/), consultati il 19/10/2026.
- Vondrák, J., Capitaine, N., Wallace, P. (2011), A&A 534, A22; corrigendum A&A 541, C1 (2012). ERFA: `eraLtpb`, `eraLtecm`, `eraS06`, `eraEors`, `eraEra00`, `eraGmst06`.
- Meeus, J. (1998), Astronomical Algorithms, 2ª ed., eq. 25.2, 28.1, 28.2, 47.1.
- Solstizio del 20/06/2024 alle 20:51 UT (§ 13, A9): JPL Horizons dà a quell'istante RA apparente geocentrica del Sole 89,999988° (interrogazione del 18/10/2026).
