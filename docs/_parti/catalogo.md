# Catalogo, dati fisici, orientamento, stelle, texture, affidabilità e manifest

Riferimento: `docs/PROGETTO.md` versione 2.0, § 4, 5.4, 5.6, 7.6.4, 7.7, 7.8, 8.1, 8.2, 8.7, 8.8, 8.10-8.12, 9, 12, 13 (A22, A26), 16.3. Misure del 19/10/2026.

## 1. Contenuto

| File | Contenuto |
|------|-----------|
| `scripts/pipeline/physical.py` | Sole, pianeti, Plutone e Luna: raggi, GM, periodo di rotazione, albedo, inclinazione assiale derivata; modello WGCCRE con termini periodici; anelli di Saturno e Urano; frammento `out/catalog-phys.json`; fixture `tests/fixtures/catalogo/orientamento.json` |
| `scripts/pipeline/stars.py` | BSC5 (V/50) con astrometria Hipparcos 2007 (I/311) associata via HD (I/239); `public/data/v1/stars.bin`; `out/validazione-stelle.json`; fixture `stelle.json` |
| `scripts/pipeline/textures.py` | 24 texture JPEG 2048 × 1024 in `public/data/v1/tex/`; frammento `out/catalog-tex.json`; estratti delle pagine di licenza in `raw/tex/fonti.json` |
| `scripts/pipeline/catalog.py` | `public/data/v1/catalog.json` da `bodies.json` e da tutti i frammenti `out/catalog-*.json`; completamenti in `out/catalogo-mancanti.json` |
| `scripts/pipeline/reliability_pack.py` | `public/data/v1/reliability.bin` dai frammenti `out/reliability-*.json`; fixture `affidabilita.json` |
| `scripts/pipeline/pack.py` | `public/data/v1/manifest.json`, verifiche di A22 e budget del § 8.1 |
| `docs/schema/manifest.schema.json` | schema del manifest (nuovo) |
| `src/data/manifest.ts`, `dataStore.ts`, `catalog.ts`, `starsReader.ts`, `reliabilityReader.ts` | runtime dei dati |
| `src/ephem/orientation.ts`, `reliability.ts` | orientamento dei corpi e affidabilità |
| `docs/LICENZE.md` | licenze e crediti (A26) |

Ordine di esecuzione (da `scripts/pipeline/`, dopo le altre aree):

```sh
.venv/bin/python physical.py catalogo      # richiede DE441 in cache
.venv/bin/python textures.py catalogo
.venv/bin/python catalog.py
.venv/bin/python reliability_pack.py        # scrive anche la fixture affidabilita.json
.venv/bin/python physical.py fixture        # dopo l'aggiornamento dei frammenti con modello WGCCRE
.venv/bin/python pack.py                    # ultimo: SHA-256 di tutti i file
```

Download (una volta): `physical.py scarica`, `stars.py scarica` (poi `stars.py genera`, che scrive anche la fixture), `textures.py genera`, `textures.py pagine`. Le sorgenti voluminose sono in `.cache/` con SHA-256 in `raw/manifest-sorgenti.json`; le sorgenti delle texture oltre 40 MB sono eliminate dopo l'uso e l'immagine ricampionata resta in `.cache/tex/<corpo>/canonica.png`.

## 2. Modifiche fuori perimetro

- `docs/schema/catalog.schema.json` e `src/data/catalogTypes.ts`: campi facoltativi `fisica.inclinazioneAssiale_gradi` (ValoreFisico, gradi) e `anelli` del corpo (fonte, estrazione, profilo, piano, elementi con nome, tipo, raggi interno ed esterno in km, τ [min, max], livello). Nessun campo obbligatorio nuovo.
- `tests/data/catalogSchema.test.ts`: `anelli` aggiunto alle proprietà facoltative del corpo.
- `scripts/pipeline/requirements.txt`: jsonschema 4.26.0 e pillow 13.0.0 con dipendenze (attrs, jsonschema-specifications, referencing, rpds-py).

## 3. Dati fisici (§ 9)

- Raggi e modelli di orientamento: NAIF `pck00011.tpc` (raw/phys/), trascrizione di Archinal et al. 2018 con la correzione del 2019. La correzione (Celest. Mech. Dyn. Astr. 131:61) riguarda il segno nelle figure 1-2 e il meridiano di Phobos: nessun effetto su Sole e pianeti.
- Raggio del Sole 695 700 km (IAU 2015 B3). Plutone 1188,3 ± 1,6 km (Nimmo et al. 2017). Incertezze dei raggi dalla tabella JPL ([D] = Archinal et al. 2018) solo per i corpi sferici: per gli sferoidi l'incertezza del raggio polare non è nelle fonti accessibili (Archinal et al. 2018 non è ad accesso aperto) e la terna resta null.
- GM: DE441 per Sole, Mercurio, Venere, Terra (GMB·EMRAT/(1 + EMRAT)) e Luna. Per Marte, Giove, Saturno, Urano, Nettuno e Plutone il GM del solo pianeta dai kernel satellitari (mar099, jup365, sat441, ura184, nep097, plu060), con soluzione, anno e riferimento della tabella `SOLUZIONE` dei satelliti (Urano: URA182, Jacobson e Park 2025; MAR099: 2025), lo stesso usato per μ = GM_pianeta + GM_satellite (§ 7.1) e da `src/ui/datiScheda.ts`. Incertezza dalla tabella "Planet and Pluto GM Values" di JPL "Planetary Satellite Physical Parameters" (`gm_pianeti_jpl`) con la regola dei satelliti (`sats.fisica.sigma_gm`): Giove ± 0,42, Saturno ± 0,24, Nettuno ± 9,63, Plutone ± 0,4 km³/s² (stessa soluzione del kernel); Marte (MAR097) e Urano (URA111) senza incertezza. Rapporto pianeta/sistema DE441: oltre 0,9997 per i giganti, 0,891 per Plutone.
- Periodo di rotazione: 360°/Ẇ, negativo per rotazione retrograda rispetto al polo dichiarato. Scarto relativo dalla tabella JPL ≤ 2·10⁻⁵ per gli otto pianeti, esclusa Nettuno: il rapporto 2015 adotta 15,9663 h (Karkoschka 2011), la tabella JPL riporta ancora 16,11 h (rapporto 2006).
- Albedo geometrica in banda V (`ALBEDO_V`): pianeti da Mallama, Krobusek, Pavlov 2017, Icarus 282, 19, tab. 7, senza incertezza; Plutone 0,52 ± 0,03, solo Plutone (Buratti et al. 2015, ApJL 804, L6, tab. 2). I valori della tabella JPL (rif. [B], Explanatory Supplement 1992; Plutone 0,3) sono superati e non usati. Sole e Luna senza albedo, come i satelliti (§ 9).
- Inclinazione assiale derivata: angolo tra il polo di rotazione positivo a J2000 e la normale all'orbita osculante DE441 del baricentro a J2000 (Sole: rispetto all'eclittica J2000). Lo stesso calcolo vale per i piccoli corpi con modello WGCCRE (orbita osculante SBDB, `small/catalogo.py`) e per Febe (orbita planetocentrica del modello, `sats/uscite.py`). Valori: Mercurio 0,034°, Venere 177,362°, Terra 23,439°, Marte 25,191°, Giove 3,120°, Saturno 26,731°, Urano 97,770°, Nettuno 28,319°, Plutone 119,617°, Sole 7,252°. Per Plutone il valore 122,53° delle schede NASA deriva da un polo precedente.
- Convenzione del polo: nord IAU per Sole e pianeti (Venere e Urano retrogradi), momento angolare per Plutone (pianeta nano, rapporti dal 2009). Terra: orientamento del modello del tempo (Vondrák). Luna: Cassini.
- Anelli: tabelle PDS Ring-Moon Systems Node, 41 elementi per Saturno (dall'anello D all'anello di Febe, con lacune e regioni dell'anello B) e 12 per Urano (raggio medio ± metà della larghezza massima). Una riga della tabella di Urano unisce la nota dell'anello ε al nome "R/2003 U 2": il nome è ricostruito. Piano degli anelli: equatore del modello di orientamento.

## 4. Orientamento (§ 7.7, R10)

- Modello WGCCRE: α0, δ0 in T (secoli), W in d, termini periodici con argomenti lineari in T. Gli angoli con termine quadratico (Phobos) non sono rappresentabili e sono rifiutati. ICRF → corpo = R3(W)·R1(90° - δ0)·R3(90° + α0); poi R1(ε0) verso l'eclittica J2000.
- Verifica della pipeline contro SPICE `pxform` con lo stesso PCK (9 corpi, 400 epoche ciascuno): scarto massimo 1,1·10⁻¹⁰ rad entro un secolo da J2000, 2,0·10⁻⁸ rad su tutto l'intervallo. Lo scarto cresce con W, che supera 10⁹ gradi a 12 000 anni (arrotondamento in doppia precisione, 0,004″).
- Runtime contro la fixture della pipeline (23 corpi con modello WGCCRE, 60 epoche, seme 20261022): 1,4·10⁻¹⁰ rad entro 200 anni, 1,3·10⁻⁸ rad oltre (Ida, Ẇ = 1864,6°/d). Il runtime riduce W modulo 360° in modo esatto prima dei radianti.
- `ServizioOrientamento.bodyFixedToScene(ssid, jdTT, out, t?)`: WGCCRE calcolato; Terra, Luna e satelliti sincroni delegati ai fornitori iniettati (`terra(jdTT, out, t?)`, `luna(jdTT, out)`, `sincrono(ssid, jdTT, versoPrimario, poloOrbita)`); senza modello o fornitore restituisce false e l'identità. `orientamento(ssid, t, out)` ha la firma di `FornitoreOrientamento` di `src/render/orientamento.ts`. `indicativo(ssid, jdTT)` è vero fuori da [2 305 447,5; 2 495 760,5) per i modelli WGCCRE e sempre per i corpi con il flag; `faseArbitraria(ssid)` per Giove, Saturno, Urano, Nettuno.

## 5. Stelle (§ 8.8)

| Misura | Valore |
|--------|--------|
| Stelle (BSC5 con posizione) | 9096 |
| Moto 3D (parallasse > 0 con errore ≤ 20% e velocità radiale BSC) | 8297 |
| Lineare angolare da Hipparcos | 698 |
| Lineare angolare dal BSC (senza associazione Hipparcos) | 101 |
| B-V da I/311 dove manca nel BSC | 286; senza B-V (NaN nel file) 24 |
| Separazione BSC-Hipparcos a J2000 | mediana 0,65″, 99° percentile 3,69″, massimo 21,8″ |
| Formula lineare del § 8.8 contro ERFA starpm (moto 3D) | 29,5″ a -9999, 0,28″ al 2120 (correzione del tempo luce di starpm) |
| Arrotondamento Float32 della direzione | 0,009″ |
| Spostamento massimo a -9999 | HR 4550, 19,9° |
| Approssimazione analitica CIE 1931 del rendering contro le funzioni tabulate CIE | 0,0068 in sRGB lineare (B-V = 2,0) |
| Dimensione di stars.bin | 363 904 byte |

Associazione: numero HD del BSC → stelle HIP con lo stesso HD (I/239); si accetta la più vicina entro 60″ a J2000; una stella HIP associata a più voci BSC resta alla più vicina. Stato a J2000 con ERFA `pmsafe` (da J1991,25) e `starpv`. Lettori di riferimento: `stars.leggi_stars_bin` e `src/data/starsReader.ts` (fixture identica entro 1e-12).

## 6. Texture (§ 8.12)

- Ogni sorgente è ricampionata nel sistema del corpo: riga 0 al polo +z, longitudine 0 al centro (lon0_u = 0,5), est crescente lungo u. Georeferenziazione dai tag GeoTIFF (tiepoint, scala, meridiano centrale, raggio): i prodotti USGS a longitudine positiva ovest hanno comunque l'est a destra. Per Terra, Luna, Giove e Solar System Scope il bordo sinistro a -180° è dichiarato dalla fonte (Giove: griglia della figura PIA07782 fig. 1).
- Tritone: il sistema del corpo (rotazione sincrona, polo sul momento angolare dell'orbita retrograda) ha +z verso il sud IAU; la mappa è ruotata di 180° (latitudine e longitudine cambiano segno).
- 24 texture, da 77 751 a 399 389 byte, 8 680 970 byte in totale; qualità JPEG da 51 (Dione) a 95, ricerca binaria entro 400 000 byte per restare nei 48 MB complessivi. Saturno, Urano, Nettuno: file Solar System Scope copiati senza ricompressione.
- Verifiche visive sui riquadri: Occator su Cerere a 21°N, -121°E; Pele su Io a destra del centro; maria lunari al centro; Sputnik Planitia di Plutone al bordo (175°E).

## 7. Catalogo (§ 8.10)

- Fusione per slug e campo, ricorsiva sugli oggetti; foglie diverse = errore. Campi vuoti di `bodies.json` completabili dai frammenti; campi identificativi uguali. Alias: quelli dei frammenti più nome, nome ufficiale, designazione, sigla SBDB e numero.
- Completamenti espliciti (`out/catalogo-mancanti.json`): fisica null, orientamento ad assi fissi dichiarati, texture ed epsModelloCostante null. Senza effemeridi o soluzione il corpo è incompleto: `catalog.json` non è scritto (codice 2) e il parziale va in `out/catalog-parziale.json`.
- Esito con i frammenti di tutte le aree (phys, planets, sats, small, tempo, tex): 112 corpi completi, validi contro lo schema e i controlli A22 (compresa la precedenza della categoria primaria del § 4.2, con la sola eccezione dichiarata di Chiron) e conformi al Minor Planet Center per nome ufficiale e designazione provvisoria primaria dei 47 pianetini numerati e per nome ufficiale ("NP/nome", senza numerale d'uso) delle 14 comete periodiche numerate (`controlli_mpc`, risposta dell'Identifier API in `raw/small/mpc-identificatori.json`; Chiron con la designazione cometaria 95P/Chiron; 9P/Tempel, 29P/Schwassmann-Wachmann, 81P/Wild e 103P/Hartley come nome ufficiale, con il numerale nel nome e tra gli alias); 24 con texture, 2 con anelli; completamenti: texture null per 88 corpi, spkid null per 40. Dimensione 246 895 byte. Riproducibilità (§ 8.10): senza `--generato`, `generato` è l'istante dell'ultima rigenerazione che ha modificato il catalogo; con dati invariati il file è identico byte per byte (`common.manifest.valore_se_invariato`). Il messaggio di `catalog.py` riporta i byte del file UTF-8.

## 8. Affidabilità (§ 7.8, § 8.7)

- `reliability.bin`: 111 corpi (frammenti moon, sats, small, più i nove corpi con modello 'pianeta' a 2″ costanti); il Sole resta fuori e usa epsModelloCostante = 0. Valori Float32 arrotondati per eccesso (`float32_per_eccesso`): il cast non riduce mai ε. 712 intervalli (§ 8.7); 396 152 byte.
- `ServizioAffidabilita.calcola(ssid, t, ω, out)`: ε_modello dalla serie a gradini o dalla costante del catalogo; ε_ΔT = ω·σ(ΔT) (0 con ingresso in TT); ε_tot in quadratura; livelli del § 7.8.2 con soglie incluse nel livello inferiore; dati assenti o ε non stimabile → non determinabile. Prima del caricamento del file, per i corpi senza costante, il risultato è provvisorio (valore di ritorno false) e il livello è 'non-determinabile' o quello indicato in `livelloInAttesa`.

## 9. Manifest e budget (§ 8.1, § 8.11, A22)

| Misura | Valore | Limite |
|--------|--------|--------|
| File (con il manifest) | 69 | 90 |
| Totale | 46 617 232 byte | 48 MB |
| Prima visualizzazione (blocco 12) | 2 233 406 byte | 4 MB |
| File più grande | small/b11.bin, 5 331 816 byte | 6 MB (§ 8.1, versione 2.1) |
| Manifest, catalogo, time.json | 315 862 byte | stima 300 kB: avviso |

`pack.py` (`MAX_PER_FILE` = 6 MB) supera tutti i controlli: budget, schema del manifest e del catalogo, SHA-256, intestazioni dei binari (magic, tipo, blocco, dimensione); unico avviso la stima di 300 kB per manifest, catalogo e `time.json`. Senza `--versione`, `versioneDati` resta quella pubblicata se file, dimensioni e SHA-256 non cambiano, altrimenti è la data del giorno (§ 8.11): con dati invariati `catalog.py`, `reliability_pack.py` e `pack.py`, eseguiti due volte, lasciano identici gli SHA-256 di tutti i file di `public/data/v1/`.

## 10. Runtime dei dati (§ 5.4, § 5.6)

- `caricaManifest()` e `leggiManifest()`: verifica del formato; `IndiceManifest` per percorso e per (tipo, blocco); `percorsoBlocco()`.
- `ArchivioDati` (contratto `DataStore`): Promise condivisa; annullamento per richiedente, richiesta di rete interrotta quando tutti annullano (una nuova richiesta della stessa risorsa ne avvia un'altra anche se quella interrotta è ancora in verifica); LRU di 3 risorse 'pronto' per tipo a blocchi; verifica di dimensione, intestazione (magic, versione, tipo, blocco, dimensione) e SHA-256 con `crypto.subtle` (o con `sha256Js` di `sha256.ts` nei contesti non sicuri, dove manca) prima di consegnare il buffer; un file non conforme si scarica subito una seconda volta dal server (`cache: 'reload'`), perché la cache HTTP può conservarne la versione precedente con lo stesso nome; stati 'assente', 'in-caricamento', 'pronto', 'errore' notificati con `onCambio`; dopo un errore una nuova richiesta riprova, con `cache: 'reload'`; richieste annullate con `ErroreDati` 'rete' dopo 30 s senza byte ricevuti (`LIMITE_INATTIVITA_MS`). `caricaManifest` richiede `manifest.json` con `cache: 'no-cache'`. `ErroreDati` con codice (rete, http, manifest, dimensione, formato, sha256).
- `leggiCatalogo()` e `IndiceCatalogo` (per ssid, slug, primario, categoria); `caricaCatalogo(store)`.
- `leggiStelle()`, `direzioneStella()`, `fornitoreStelle(store)` (forma attesa da `src/render/stars.ts`).
- `leggiAffidabilita()`, `valutaAffidabilita()`, `caricaAffidabilita(store)`.

## 11. Test

| Comando | Esito |
|---------|-------|
| `npx tsc --noEmit` | nessun errore |
| `npx eslint .` | nessun errore, nessun avviso |
| `npx vitest run` | 64 file, 714 test superati (6 file di quest'area, 58 test) |
| `.venv/bin/python -m pytest` | 304 superati, 2 saltati (ASSIST); quest'area: 6 file, 73 test |
| `.venv/bin/ruff check .`, `ruff format --check .` | nessun errore |

Il test del manifest pubblicato (pytest e Vitest) confronta sempre i file con `manifest.json`, indipendentemente dagli mtime (git non li conserva), e fallisce se non corrispondono: dopo una modifica dei dati va rieseguito `pack.py`. È saltato solo se il manifest manca.
