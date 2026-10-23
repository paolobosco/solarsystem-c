# Licenze e crediti

Riferimenti: § 9 e § 16.3 di `docs/PROGETTO.md`, criterio A26. Le licenze delle fonti sono state verificate sulle pagine ufficiali il 19/10/2026; gli estratti citati, con data e SHA-256 delle pagine, sono in `scripts/pipeline/raw/tex/fonti.json`, `scripts/pipeline/raw/phys/estrazione.json` e `scripts/pipeline/raw/stars/estrazione.json`.

## 1. Software

### 1.1 Distribuito con il sito

| Pacchetto | Versione | Licenza | Titolare |
|-----------|----------|---------|----------|
| three (con il modulo `examples/jsm/controls/OrbitControls.js` dello stesso pacchetto) | 0.180.0 | MIT | Copyright © 2010-2025 three.js authors |

| Vite (polyfill di `modulepreload` inserito dalla build) | 7.3.7 | MIT | Copyright (c) 2019-present, VoidZero Inc. and Vite contributors |

Il bundle non contiene altro codice di terze parti (nessuna altra dipendenza in `package.json`).

Avvisi distribuiti, come richiede la licenza MIT ("The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software"): la minificazione conserva in coda al bundle il commento `@license` di three (copyright e `SPDX-License-Identifier: MIT`, `esbuild.legalComments = 'eof'` in `vite.config.ts`); ogni build pubblica `assets/LICENZE.txt` con il testo integrale di `node_modules/three/LICENSE` e la licenza MIT di Vite (sezione MIT di `node_modules/vite/LICENSE.md`). `scripts/make-artifact.mjs` verifica entrambi nella pagina singola; prove in `tests/progetto/licenze.test.ts` e in `e2e/pagina-singola.spec.ts`.

Algoritmi riprodotti nel codice del sito: le funzioni di precessione, di rotazione terrestre e di nutazione (`src/time/precession.ts`, `src/time/earthRotation.ts`, `src/time/nutation.ts`) eseguono le stesse operazioni delle routine ERFA `eraLtpequ`, `eraLtpecl`, `eraLtp`, `eraLtpb`, `eraLtecm`, `eraEra00`, `eraNut00b`, con i coefficienti pubblicati da Vondrák, Capitaine e Wallace (2011), dalle IERS Conventions (2010) e da McCarthy e Luzum (2003, modello IAU 2000B). ERFA: Copyright (C) 2013-2023, NumFOCUS Foundation, derivata con permesso dalla libreria SOFA dell'IAU, licenza BSD a 3 clausole. Le serie lunari di Meeus (1998, cap. 47) sono incorporate come coefficienti numerici con citazione della fonte.

### 1.2 Sviluppo e verifica (non distribuiti)

| Pacchetto | Versione | Licenza |
|-----------|----------|---------|
| vite | 7.3.7 | MIT |
| vitest | 4.1.11 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| eslint, @eslint/js | 10.12.0, 10.0.1 | MIT |
| typescript-eslint | 8.71.2 | MIT |
| @playwright/test | 1.56.1 | Apache-2.0 |
| @axe-core/playwright | 4.11.0 | MPL-2.0 |
| @types/three, @types/node | 0.180.0, 22.18.0 | MIT |

### 1.3 Pipeline dati (non distribuita)

| Pacchetto | Versione | Licenza |
|-----------|----------|---------|
| numpy | 2.5.3 | BSD-3-Clause (con componenti 0BSD, MIT, Zlib, CC0-1.0) |
| scipy | 1.18.1 | BSD |
| jplephem | 2.24 | MIT |
| pyerfa (ERFA) | 2.0.1.5 | BSD-3-Clause |
| spiceypy | 8.3.0 | MIT |
| jsonschema | 4.26.0 | MIT |
| pillow | 13.0.0 | MIT-CMU |
| pytest, ruff | 9.1.1, 0.17.1 | MIT |
| ASSIST, REBOUND | 1.2.3, 4.6.0 | GPL-3.0 o successiva: usati solo nella pipeline, non distribuiti con il sito |
| setuptools (ambiente ASSIST) | 84.0.0 | MIT |
| Dipendenze indirette: iniconfig, pluggy, attrs, jsonschema-specifications, referencing, rpds-py | 2.3.1, 1.7.0, 26.1.0, 2025.9.1, 0.37.0, 2026.9.1 | MIT |
| Dipendenze indirette: packaging, Pygments | 26.3, 2.21.0 | Apache-2.0 o BSD-2-Clause; BSD-2-Clause |
| Skyfield (solo come sorgente della copia della tabella S15.2020, non installato) | 1.55 | MIT |

Fonte delle licenze: metadati dei pacchetti installati (`package.json`, metadati PyPI) e, per Skyfield, metadati PyPI della versione 1.55.

## 2. Font

Source Sans 3, Source Serif 4, Source Code Pro (Adobe), serviti da Google Fonts: SIL Open Font License 1.1 (file `LICENSE.md` dei repository adobe-fonts/source-sans, source-serif, source-code-pro). I file dei caratteri non sono inclusi nel repository: il sito li richiede a fonts.googleapis.com e fonts.gstatic.com, unici host esterni ammessi (I8).

## 3. Dati

| Dati | Fonte | Condizioni d'uso |
|------|-------|------------------|
| Effemeridi DE441, SPK satellitari, Horizons, SBDB (soluzioni, covarianze, dati fisici), CNEOS, parametri fisici JPL | NASA/JPL (Park et al. 2021; Jacobson e altri, § 16.1) | contenuti NASA non soggetti a copyright negli Stati Uniti (NASA Images and Media Usage Guidelines), con credito |
| Orientamento e raggi (Archinal et al. 2018, correzione 2019) | NAIF, pck00011.tpc | dati NASA/NAIF, con citazione della fonte |
| Anelli di Saturno e Urano | PDS Ring-Moon Systems Node, tabelle dei parametri | dati PDS (NASA), con citazione |
| Bright Star Catalogue 5ª ed. (V/50), Hipparcos (I/239, I/311) | VizieR, CDS Strasburgo, doi:10.26093/cds/vizier | "free of usage in a scientific context", con citazione di autori ed editori (regole di VizieR); uso divulgativo non commerciale con citazione |
| Funzioni colorimetriche CIE 1931 2° | CIE, doi:10.25039/CIE.DS.xvudnb9b | CC BY-SA 4.0; usate solo per la fixture di verifica dei colori, non distribuite con il sito |
| Mosaici USGS Astrogeology | schede Astropedia citate al § 4 | "USGS-authored or produced data and information are considered to be in the U.S. Public Domain" (USGS, Copyrights and Credits); condizioni della singola scheda |
| File di ASSIST: `linux_m13000p17000.441` (DE441 in formato binario) e `sb441-n16.bsp` | JPL SSD (Farnocchia 2021) | dati NASA/JPL, con credito; usati solo nella pipeline, non distribuiti |
| Tabella S15.2020 di ΔT | Morrison, Stephenson, Hohenkerk, Zawilski (2021), HMNAO; copia distribuita con Skyfield 1.55 (licenza MIT del pacchetto) | citazione dell'articolo e della tabella |
| Serie EOP 20 C04 e `Leap_Second.dat` | IERS, centro di produzione EOP dell'Osservatorio di Parigi (hpiers.obspm.fr) | file pubblici del servizio IERS, nessuna licenza esplicita nei file; citazione della fonte |
| `tai-utc.dat` (TAI - UTC prima del 1972) e `historic_deltat.data` (solo validazione) | U.S. Naval Observatory (maia.usno.navy.mil) | opere del governo federale degli Stati Uniti, non soggette a copyright (17 U.S.C. § 105); citazione della fonte; usati solo nella pipeline, non distribuiti con il sito |
| Dati fisici di letteratura (TNO, interstellari, Disnomia, Plutone) | articoli citati al § 17 di `docs/METODI.md` | valori numerici con citazione della fonte |
| Nomi ufficiali e designazioni (Identifier API, risposta congelata in `raw/small/mpc-identificatori.json`) | Minor Planet Center (IAU) | con il riconoscimento richiesto dal MPC: "This research has made use of data and/or services provided by the International Astronomical Union's Minor Planet Center." |
| Tabella dei perieli di 1P/Halley | Yeomans e Kiang (1981), MNRAS 197, 633, tabella 4 | solo per la validazione, con citazione |

Citazioni: Hoffleit, D., Warren, W. H. Jr. (1991), The Bright Star Catalogue, 5th Revised Ed. (Preliminary Version), VizieR V/50; van Leeuwen, F. (2007), A&A 474, 653, VizieR I/311; ESA (1997), The Hipparcos Catalogue, ESA SP-1200, VizieR I/239.

## 4. Texture

Tutte le texture sono ricampionate dalla pipeline (`scripts/pipeline/textures.py`) a 2048 × 1024 equirettangolari con longitudine 0 al centro e longitudini crescenti verso est. Nessuna texture per corpi non osservati.

| Corpo | Fonte e credito | Pagina ufficiale | Licenza o condizioni | Aree non osservate |
|-------|-----------------|------------------|----------------------|--------------------|
| Terra | NASA Earth Observatory, Blue Marble Next Generation, luglio 2004 (Stöckli et al. 2005) | science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/ | NASA, non soggetta a copyright negli Stati Uniti, con credito | nessuna |
| Luna | NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC) | svs.gsfc.nasa.gov/4720 | NASA, con credito ("Please give credit for this item to: NASA's Scientific Visualization Studio") | nessuna |
| Mercurio | MESSENGER Team (Arizona State University), mosaico a colori 665 m (USGS Astrogeology) | astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_color_mosaic_665m | pubblico dominio, citare gli autori | nessuna |
| Venere | USGS Astrogeology, Magellan C3-MDIR a colori sintetici (radar) | astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_synthetic_color_mosaic_4641m | pubblico dominio (USGS) | nessuna |
| Marte | USGS Astrogeology, mosaico a colori Viking 925 m | astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m | pubblico dominio (USGS) | nessuna |
| Giove | NASA/JPL/Space Science Institute, PIA07782 (Cassini) | science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/ | NASA, con credito | nessuna |
| Saturno, Urano, Nettuno | Solar System Scope (INOVE), basate su dati NASA | solarsystemscope.com/textures/ | CC BY 4.0 ("Distributed under Attribution 4.0 International license"), https://creativecommons.org/licenses/by/4.0/; mappe modificate (ricampionate e riallineate in longitudine), come dichiarato nella scheda e in "Fonti e metodi" | parziali: lacune riempite dall'autore |
| Io | USGS Astrogeology, Galileo SSI e Voyager a colori 1 km | astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km | pubblico dominio (USGS) | nessuna |
| Europa | USGS Astrogeology (T. Becker), Voyager e Galileo SSI 500 m | astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m | pubblico dominio (USGS) | nessuna |
| Ganimede | USGS Astrogeology, Voyager e Galileo SSI a colori 1,4 km | astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km | pubblico dominio (USGS) | nessuna |
| Callisto | USGS Astrogeology, Voyager e Galileo SSI 1 km | astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km | pubblico dominio (USGS) | nessuna |
| Encelado | Cassini Team, JPL, Space Science Institute, Cassini ISS 110 m | astrogeology.usgs.gov/search/map/enceladus_cassini_global_mosaic_110m | pubblico dominio, citare gli autori | nessuna |
| Teti | Roatsch, Kersten, Hoffmeister, Wählisch (DLR), Cassini ISS 293 m | astrogeology.usgs.gov/search/map/tethys_cassini_global_mosaic_293m | pubblico dominio, citare gli autori | nessuna |
| Dione | NASA, JPL, Space Science Institute, Cassini e Voyager 154 m | astrogeology.usgs.gov/search/map/dione_cassini_voyager_global_mosaic_154m | pubblico dominio, citare gli autori | nessuna |
| Rea | Roatsch, Kersten, Hoffmeister, Wählisch (DLR), Cassini e Voyager 417 m | astrogeology.usgs.gov/search/map/rhea_cassini_voyager_global_mosaic_417m | pubblico dominio, citare gli autori | nessuna |
| Giapeto | Space Science Institute, Cassini Team, JPL, Cassini e Voyager 803 m | astrogeology.usgs.gov/search/map/iapetus_cassini_voyager_global_mosaic_803m | pubblico dominio, citare gli autori | nessuna |
| Titano | NASA/JPL-Caltech/Space Science Institute, PIA19658 (Cassini ISS, 938 nm) | science.nasa.gov/photojournal/titan-global-map-june-2015/ | NASA, con credito | nessuna |
| Tritone | Lunar and Planetary Institute (P. Schenk), Voyager 2 a colori 600 m | astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m | pubblico dominio, citare gli autori | parziali |
| Plutone | New Horizons Team (NASA/JHUAPL/SwRI), LORRI e MVIC 300 m | astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_mosaic_300m | uso libero, citare gli autori | emisfero sud |
| Caronte | New Horizons Team (NASA/JHUAPL/SwRI), LORRI e MVIC 300 m | astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m | uso libero, citare gli autori | emisfero sud |
| Cerere | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA, Dawn FC (DLR) | astrogeology.usgs.gov/search/map/ceres_dawn_fc_global_mosaic_400m | uso libero, citare gli autori | nessuna |
| Vesta | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA, Dawn FC HAMO (DLR), sistema Claudia double prime | astrogeology.usgs.gov/search/map/vesta_dawn_fc_hamo_global_mosaic_60m | uso libero, citare gli autori | nessuna |

Note:
- "pubblico dominio, citare gli autori": la scheda Astropedia riporta "Access Constraints: public domain" e "Use Constraints: Please cite authors".
- "uso libero, citare gli autori": la scheda riporta "Access Constraints: None" e "Use Constraints: Please cite authors", senza licenza esplicita; i dati sono archiviati nel PDS della NASA.
- Riferimento per la Terra: Stöckli, R., Vermote, E., Saleous, N., Simmon, R., Herring, D. (2005), The Blue Marble Next Generation, NASA Earth Observatory.

## 5. Materiali di terzi ridistribuiti nel repository

`scripts/pipeline/raw/` contiene copie congelate delle sorgenti, per la riproducibilità (RNF5). Restano dei rispettivi titolari, con le condizioni del § 3:

| File | Titolare | Condizioni |
|------|----------|------------|
| `raw/small/`, `raw/sats/`, `raw/time/horizons/`, `raw/phys/jpl-phys_par.html`: risposte di JPL Horizons, SBDB e CNEOS, commenti dei kernel SPK, pagine JPL | NASA/JPL-Caltech | contenuti NASA, con credito |
| `raw/phys/pck00011.tpc`, `raw/small/pck00011.tpc` | NASA/NAIF | con citazione |
| `raw/phys/pds-*.html` | PDS Ring-Moon Systems Node (NASA) | con citazione |
| `raw/stars/V50-ReadMe.txt`, `I239-ReadMe.txt`, `I311-ReadMe.txt` | CDS Strasburgo (VizieR) e autori dei cataloghi | con citazione |
| `raw/stars/CIE_xyz_1931_2deg.csv` | CIE, doi:10.25039/CIE.DS.xvudnb9b | CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), copia non modificata |
| `raw/time/Table-S15.2020.skyfield-1.55.npz` e `Table-S15.2020.txt` | tabella di Morrison, Stephenson, Hohenkerk, Zawilski (2021); file del pacchetto Skyfield, Copyright © 2013-2018 Brandon Rhodes | MIT: testo integrale in `raw/time/LICENSE-skyfield.txt`; citazione dell'articolo |
| `raw/time/eopc04-estratto.txt`, `Leap_Second.dat`, `raw/planets/eop20c04-estratto-a9.txt` | IERS (Osservatorio di Parigi) | citazione della fonte |
| `raw/time/tai-utc.dat`, `historic_deltat.data` | U.S. Naval Observatory | 17 U.S.C. § 105, citazione della fonte |
| `raw/small/mpc-identificatori.json` | Minor Planet Center (IAU) | riconoscimento del § 3 |
| `raw/tex/fonti.json` | estratti delle pagine di licenza e credito delle texture (§ 4) | brevi citazioni con fonte |

## 6. Licenza del progetto

Il codice, i documenti e i dati elaborati di questo repository sono distribuiti con licenza MIT (file `LICENSE`, Copyright (c) 2026 Paolo Bosco). La licenza non si estende ai materiali di terzi elencati in questo documento, che restano soggetti alle proprie licenze e condizioni.
