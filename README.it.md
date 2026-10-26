# Mappa 3D del Sistema solare

English version: `README.md`.

Mappa 3D interattiva del Sistema solare a scala reale, in un sito statico. Mostra 112 corpi: Sole, pianeti, pianeti nani, 30 lune, asteroidi, centauri, comete, oggetti transnettuniani e interstellari. Le posizioni vengono dalle effemeridi JPL (DE441, SPK satellitari, Horizons, SBDB) e da integrazioni numeriche con ASSIST, per qualsiasi data e ora dal 1° gennaio 10000 a.C. al 31 dicembre 2120. Per ogni corpo e istante il sito dichiara l'affidabilità della posizione. Interfaccia in italiano e in inglese (lingua scelta dal browser, cambiabile dalle Impostazioni), verde, conforme a WCAG 2.2 AA; senza WebGL2 resta disponibile una vista testuale.

Realizzato con Claude (Anthropic). Licenza MIT (file `LICENSE`); i materiali di terzi mantengono le proprie licenze (`docs/LICENZE.md`).

Documenti: specifica `docs/PROGETTO.md`, metodi `docs/METODI.md`, verifiche `docs/VALIDAZIONE.md` e `docs/SPIKE.md`, registro del debug `docs/DEBUG.md`, licenze e crediti `docs/LICENZE.md`.

## Requisiti

- Uso: browser recente con WebGL2 (senza WebGL2 solo la vista testuale). I dati (circa 47 MB) si scaricano a blocchi secondo la data; la prima visualizzazione ne richiede circa 2,2 MB. I caratteri si caricano da Google Fonts; senza rete verso Google si usano quelli di sistema.
- Pubblicazione: qualsiasi server di file statici, anche in HTTP; la cartella `dist/` funziona in un sottopercorso.
- Compilazione: Node 22 e npm 10.9 (`.npmrc` con `legacy-peer-deps=true`, § 5.2 del progetto).
- Prove end-to-end: Chromium di Playwright 1.56.1 (`npx playwright install chromium`).
- Pipeline dati (facoltativa: i dati sono già in `public/data/v1/`): Python 3.13, compilatore C per ASSIST, circa 6 GB di spazio per le sorgenti, rete verso JPL, NAIF, IERS, USNO, MPC e VizieR.

## Bug noti

Elenco completo, con misure e riferimenti, in `docs/DEBUG.md` § 6.

- Telefono e orizzontale: con il pannello Livelli aperto il tasto Tab porta il focus su controlli coperti dal pannello.
- Telefono: con la scheda aperta il messaggio di caricamento copre parte della console; con la nota di benvenuto e il foglio medio su schermi bassi (circa 480-568 px) la nota copre parte del foglio e il pulsante «Apri la scheda».
- Tablet con poca altezza (larghezza da 700 px, altezza fino a circa 600 px): pannello Livelli basso, vista testuale con 0-2 righe visibili; a 700 × 480 i pulsanti coprono la legenda per 11 px.
- Anello del focus tagliato di 3-4 px ai bordi dei pannelli che scorrono.
- Passaggio tra layout (rotazione, finestra ridimensionata): il Menu del telefono resta aperto; «Fonti e metodi» e «Impostazioni» aperti dal Menu, chiusi dopo il passaggio, lasciano il focus sul corpo della pagina; in orizzontale la voce del catalogo con il focus può restare fuori vista.
- Regolo delle distanze sotto i 1 000 km: «Avvicina» risulta disattivato anche se la vista può ancora avvicinarsi.
- La rotella sul regolo del tempo spegne «Segui l'ora attuale» senza annunciarlo subito.
- Con un dialogo aperto gli annunci per i lettori di schermo potrebbero non essere letti (da verificare con uno screen reader reale).
- Avviso «ResizeObserver loop» nella console del browser quando i messaggi crescono durante un'animazione, senza effetti visibili.
- Apophis: affidabilità «indicativa» dal 2060 circa e dati fino al 13/9/2120, per una stima della dispersione probabilmente troppo prudente.
- Catalogo: per Igea periodo e polo di Vernazza et al. (2020) non usati; Sylvia, Patroclus ed Eurybates senza inclinazione dell'asse; albedo di Disnomia non mostrata.
- Strumenti di prova: la prova di prestazioni A21 è sensibile al carico della CPU; i controlli di codice duplicato e di codice morto non rilevano tutti i casi.

## Comandi

| Comando | Effetto |
|---------|---------|
| `npm ci` | installa le versioni bloccate in `package-lock.json` |
| `npm run dev` | server di sviluppo Vite; pagine di prova `ui-lab.html` e `render-lab.html` con servizi fittizi |
| `npm run build` | controllo dei tipi e build del sito in `dist/` (percorsi relativi, `base: './'`) |
| `npm run build:artifact` | build in modalità `artifact` nella cartella intermedia `dist-artifact-build/` (`assets/app.js`, `assets/app.css`; `dist/` non cambia) e pacchetto a pagina singola in `dist-artifact/` con `scripts/make-artifact.mjs`, che verifica i limiti di RNF7 e della piattaforma e gli avvisi della licenza di three (§ 5.7) |
| `npm run build:test` | build con i ganci di prova `window.__ssTest` in `dist-test/`; ogni cartella `dist-test*/` (ad esempio da `npx vite build --mode test --outDir dist-test-prova`) è esclusa da git e da ESLint |
| `npm run preview` | serve `dist/` in locale su http://localhost:4173/ (porta predefinita di Vite) |
| `npm run check` | `tsc --noEmit`, ESLint (con regole tipizzate su `src`) e Vitest |
| `npm run e2e` | Playwright sull'applicazione con i dati reali: ricostruisce `dist-test/` e `dist-artifact/` a ogni avvio e le serve sulle porte 4273 (progetti `desktop` e `mobile`) e 4274 (progetto `pagina-singola`); schermate in `test-results/e2e/` |
| `node scripts/servi-artifact.mjs [porta]` | serve `dist-artifact/` su `/a/b/index.html` dentro uno scheletro che emula quello della piattaforma (A24); porta predefinita 4174 |
| `npx playwright test -c e2e/ui-lab.config.ts` | prove dell'interfaccia sulla pagina `ui-lab.html` |
| `npx playwright test -c tests/render/playwright.render.config.ts` | prove del rendering sulla pagina `render-lab.html` |

Le prove end-to-end usano porte dedicate (4273 per `dist-test/`, 4274 per `dist-artifact/`), diverse da quelle predefinite di `npm run preview` (4173) e di `scripts/servi-artifact.mjs` (4174): i server di uso manuale e `npm run e2e` possono girare insieme. Le build sono rieseguite a ogni avvio e Playwright non riusa mai un server già attivo (`reuseExistingServer: false`): se la 4273 o la 4274 è occupata da un altro processo, si ferma subito con l'errore `http://localhost:4273 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`; per liberare le porte: `fuser -k 4273/tcp 4274/tcp`. Verifica manuale: con `npm run preview` attivo, `npx playwright test e2e/ganci.spec.ts --project desktop` ricostruisce `dist-test/` e passa; con un altro server sulla 4273 la stessa prova fallisce subito con l'errore sopra. I laboratori (`e2e/ui-lab.config.ts`, porta 5199; `tests/render/playwright.render.config.ts`, porta 5179) hanno configurazioni proprie.

Il sito funziona senza servizi esterni; gli unici host esterni sono quelli di Google Fonts. I dati stanno in `public/data/v1/` e sono versionati: per usare il sito non serve eseguire la pipeline.

Il sito funziona anche servito in HTTP da un host non locale (per esempio `npx vite preview --host` aperto da un telefono in rete locale). In questo contesto non sicuro il browser non offre `crypto.subtle` e la verifica SHA-256 dei dati usa un'implementazione JavaScript (§ 5.6 del progetto). L'host può usare la cache HTTP sui file di `data/v1/`, che hanno nomi stabili: `manifest.json` si rivalida a ogni avvio e un file non conforme si scarica di nuovo dal server.

## Struttura del repository

| Percorso | Contenuto |
|----------|-----------|
| `index.html`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `playwright.config.ts` | pagina e configurazioni |
| `src/main.ts` | punto d'ingresso |
| `src/app/` | avvio e caricamento dei dati (§ 5.6), store dello stato, URL, preferenze, orologio (unico uso di `Date`), fornitori per il rendering |
| `src/time/` | calendario, passi, ΔT, scale di tempo, precessione, rotazione terrestre, nutazione, stagioni |
| `src/ephem/` | elementi equinoziali, Keplero, interpolazione, pianeti, Luna, satelliti, piccoli corpi, Sole baricentrico, orientamento, affidabilità, servizio delle effemeridi |
| `src/data/` | manifest, archivio dei dati con verifica SHA-256, lettori dei formati binari, catalogo |
| `src/render/` | scena three.js a scala reale |
| `src/ui/` | interfaccia; tutti i testi visibili in `src/ui/testi.it.ts` |
| `src/dev/`, `src/ui/dev/` | servizi fittizi delle pagine di prova (non inclusi nella build) |
| `src/test-hooks.ts` | ganci `window.__ssTest`, solo nella build di test |
| `public/data/v1/` | dati prodotti dalla pipeline (§ 8 del progetto) |
| `tests/` | Vitest; `tests/fixtures/` prodotte dalla pipeline con seme registrato, salvo `tests/fixtures/scheda/` (elementi osculanti scaricati da JPL Horizons il 19/10/2026); `tests/progetto/` controlli del repository (dipendenze, lint, API deprecate, codice morto e token CSS non letti, duplicati, licenze, struttura del § 5.3, porte delle prove end-to-end); codice morto della pipeline in `scripts/pipeline/tests/test_codice_morto.py` |
| `e2e/` | Playwright: applicazione con i dati reali (`aiuti.ts` e spec), pagine di prova con configurazioni proprie |
| `scripts/make-artifact.mjs`, `scripts/servi-artifact.mjs` | pacchetto a pagina singola (§ 5.7) e server locale per la verifica A24 |
| `scripts/pipeline/` | pipeline Python, risposte congelate in `raw/`, test pytest |
| `docs/` | progetto, revisione, metodi, validazione, spike, licenze, note tecniche dei moduli (`docs/_parti/`), schemi JSON (`docs/schema/`) |

## Pipeline dati

Dettagli: `scripts/pipeline/README.md` e note dei moduli in `docs/_parti/`. Tutti i comandi si eseguono da `scripts/pipeline/`.

### Ambienti

Python 3.13 con due ambienti virtuali (versioni fissate):

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
python3.13 -m venv .venv-assist
.venv-assist/bin/pip install -r requirements-assist.txt
.venv-assist/bin/pip install --no-build-isolation -r requirements-assist-build.txt
```

`.venv`: numpy, scipy, jplephem, pyerfa, spiceypy, jsonschema, pillow, pytest, ruff. `.venv-assist`: ASSIST 1.2.3 compilato contro REBOUND 4.6.0 (serve un compilatore C).

### Sorgenti voluminose

I file grandi stanno in `scripts/pipeline/.cache/` (escluso da git), con URL, dimensione, SHA-256 e data di estrazione in `raw/manifest-sorgenti.json`. Le risposte piccole (SBDB, Horizons, IERS, pagine JPL e PDS, ReadMe dei cataloghi) sono congelate in `raw/`.

| Sorgente | Dimensione | Uso |
|----------|------------|-----|
| DE441, `de441_part-1.bsp` e `de441_part-2.bsp` | 1,65 GB ciascuno | tempo, pianeti, Luna, catalogo |
| `linux_m13000p17000.441`, `sb441-n16.bsp` | 2,79 GB; 0,65 GB | ASSIST |
| Kernel SPK satellitari (moderni e lunghi) | circa 26 GB scaricati uno alla volta | satelliti; i kernel lunghi si eliminano dopo l'uso |
| SPK Horizons dei piccoli corpi | 231 file, 681,9 MB | piccoli corpi |
| Mosaici delle texture | fino a 0,8 GB per file | eliminati dopo l'uso se oltre 40 MB; resta l'immagine ricampionata |

La cartella occupa circa 5,7 GB a lavoro concluso; il controllo dello spazio libero precede ogni scaricamento dei kernel satellitari.

### Comandi

Ordine di rigenerazione completa (le opzioni `--offline` usano solo risposte congelate e cache verificata):

```sh
.venv/bin/python time_model.py sorgenti && .venv/bin/python time_model.py genera
.venv/bin/python time_model.py valida && .venv/bin/python time_model.py fixture && .venv/bin/python time_model.py catalogo
.venv/bin/python planets.py genera && .venv/bin/python planets.py valida && .venv/bin/python planets.py fixture && .venv/bin/python planets.py catalogo
.venv/bin/python moon.py genera && .venv/bin/python moon.py valida && .venv/bin/python moon.py kappa
.venv/bin/python moon.py affidabilita && .venv/bin/python moon.py fixture
.venv/bin/python satellites.py campiona      # poi: sistemi, scelte, lunghi, spike, record, record-lunghi,
                                             # residui, genera, valida, catalogo, fixture
.venv-assist/bin/python small_bodies.py tutto
.venv/bin/python stars.py scarica && .venv/bin/python stars.py genera
.venv/bin/python textures.py genera && .venv/bin/python textures.py pagine
.venv/bin/python physical.py scarica && .venv/bin/python physical.py catalogo
.venv/bin/python textures.py catalogo
.venv/bin/python catalog.py
.venv/bin/python reliability_pack.py
.venv/bin/python physical.py fixture
.venv/bin/python pack.py                     # ultimo: manifest, SHA-256, budget del § 8.1
```

Tempi misurati: `planets.py genera` 4 s, `valida` 18 s; `moon.py genera` circa 17 min, `valida` 165 s; `small_bodies.py integra` 8 702 s di calcolo (circa 1 h 15 min con 2 processi), `valida` circa 2 min. Ogni passo dei satelliti e dei piccoli corpi salva i risultati per corpo in `.cache/` e si può riprendere.

Controlli:

```sh
.venv/bin/python -m pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv-assist/bin/python -m pytest tests/test_common_assist.py
```

Dopo ogni modifica dei dati va rieseguito `pack.py`. Senza `--versione` la `versioneDati` del manifest resta quella pubblicata se file, dimensioni e SHA-256 non cambiano, altrimenti diventa la data del giorno; `--versione AAAA-MM-GG` la fissa. Allo stesso modo `catalog.py` conserva il campo `generato` se il catalogo non cambia (`--generato` lo fissa): con dati invariati la pipeline riscrive file identici byte per byte. I test del manifest (pytest e Vitest) confrontano sempre dimensione, intestazione e SHA-256 di ogni file con `manifest.json`, su qualsiasi checkout, e falliscono se non corrispondono; sono saltati solo se il manifest manca.

## Fonti dei dati e licenze

| Dati | Fonte | Licenza o condizioni |
|------|-------|----------------------|
| Pianeti, Plutone, Luna (correzioni) | JPL DE441 (Park et al. 2021) | NASA/JPL, con credito |
| Satelliti | kernel SPK satellitari JPL/NAIF; Disnomia da Holler et al. (2021) | NASA/JPL, con credito |
| Piccoli corpi | JPL Horizons, SBDB, sb441-n16; integrazione ASSIST | NASA/JPL, con credito |
| ΔT | tabella S15.2020 (Morrison et al. 2021), IERS EOP 20 C04 | citazione delle fonti |
| Orientamento e raggi | Archinal et al. (2018), NAIF `pck00011.tpc` | con citazione |
| Anelli | PDS Ring-Moon Systems Node | con citazione |
| Stelle | Bright Star Catalogue (V/50), Hipparcos (I/311, I/239) via VizieR | uso con citazione |
| Texture | NASA, USGS Astrogeology (pubblico dominio o uso libero con citazione); Saturno, Urano, Nettuno da Solar System Scope | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) per Solar System Scope, mappe ricampionate e riallineate in longitudine |
| Caratteri | Source Sans 3, Source Serif 4, Source Code Pro | SIL Open Font License 1.1 |
| Nomi ufficiali | Minor Planet Center (IAU), Identifier API | con riconoscimento |
| Codice distribuito | three.js 0.180.0, © 2010-2025 three.js authors; polyfill di `modulepreload` di Vite, © 2019-present VoidZero Inc. and Vite contributors | MIT: avviso `@license` nel bundle e testi integrali in `assets/LICENZE.txt` |

ASSIST e REBOUND (GPL-3.0) sono usati solo per produrre i dati e non sono distribuiti. `scripts/pipeline/raw/` contiene copie congelate di sorgenti di terzi, ciascuna con le proprie condizioni. Elenco completo e crediti: `docs/LICENZE.md`.

This research has made use of data and/or services provided by the International Astronomical Union's Minor Planet Center.

## Limiti noti

- Posizioni geometriche istantanee, senza tempo luce né aberrazione; il moto del Sole attorno al baricentro non è mostrato.
- ΔT: prima del 1950 differisce da quello di JPL Horizons (circa 76 s nel 721 a.C., 1 510 s nel 10000 a.C.); nel futuro Horizons lo tiene costante (28,6 s di differenza nel 2120).
- Con l'istante in TT rotazione terrestre indeterminata in longitudine fino all'anno -4594 (4595 a.C.), per l'incertezza di UT1 = TT - ΔT; nutazione e moto del polo trascurati.
- Stagioni: istanti di equinozi e solstizi dalla longitudine apparente del Sole (entro 1 min da USNO nel 2023-2026); se lo stato della Terra all'istante dell'evento non è caricato, i giorni dall'evento sono stimati con la conica osculante (errore fino a 0,05 d).
- ΔT dal 1962 al 2019 dalla tabella S15.2020, non dai valori IERS: scarto da EOP 20 C04 in media quadratica di 0,45 s nel 1962-1971 (massimo 0,68 s, adottato anche prima del 1962) e di 0,11 s nel 1972-2018 (massimo 0,27 s), usato come incertezza; dal 2020 0,002 s. Dopo l'ultimo valore IERS (18/09/2026) ΔT resta quasi costante e l'incertezza cresce con la deriva dall'eccesso della durata del giorno (0,54 ms al giorno): 0,017 s il 19/10/2026, contro uno scarto effettivo di 0,030 s.
- Luna: errore del modello di almeno 60″ (serie di Meeus con correzioni da DE441), quindi affidabilità al più "buona", anche con l'istante in TT.
- Piccoli corpi prima del 1600: tolleranza di rappresentazione 1e-3·r dal 2001 a.C. e 1e-2·r prima, sommata all'errore stimato (affidabilità al più "buona"); forza dei 16 asteroidi maggiori disattivata prima dell'anno -7999; ritardo DT delle forze non gravitazionali non modellato.
- C/1680 V1: al perielio del 18/12/1680, a 0,0062 UA dal Sole, scarto fino a 759 km dalla sorgente (1,52 volte la tolleranza), perché il passo minimo di 1/64 d non segue il passaggio al perielio; eccezione dichiarata dell'A7.
- Satelliti: polo del piano F fisso nei record da SPK, con errori fuori dal piano per Fobos e Deimos fino a 0,31° nella finestra del kernel; nei record secolari dei satelliti regolari F segue il polo del primario (Archinal et al. 2018), estrapolato e indicativo fuori dal 1600-2121, con lo scarto della giunzione (fino a 0,94°, Deimos); Tritone, Proteo, Giapeto e gli irregolari mantengono F fisso (per Proteo fino a 1,05° dal polo di Nettuno).
- Satelliti irregolari: errore radiale dei record fino allo 0,8 % del semiasse maggiore (Febe 95 311 km, Imalia 92 196 km, Iperione 11 797 km nei kernel moderni), escluso da ε e quindi dal livello, sommato all'errore stimato delle distanze.
- Poli e fasi di rotazione indicativi fuori dal 1600-2121; fase di rotazione arbitraria a lungo termine per i pianeti giganti; Iperione con orientamento indicativo.
- Anelli con profilo schematico; ombra del pianeta sugli anelli di Saturno rappresentata, ombre degli anelli sul pianeta no.
- Nessuna ombra tra corpi: eclissi di Sole e di Luna e ombre dei satelliti sui pianeti non rappresentate.
- Texture con lacune riempite (Tritone, emisferi sud di Plutone e Caronte; Saturno, Urano, Nettuno).
- Catalogo: selezione non esaustiva per TNO e centauri (§ 4.1 del progetto); verso della rotazione indicato solo per i corpi con polo noto (Archinal et al. 2018, SBDB o letteratura); GM degli asteroidi presi da DE441 senza incertezza pubblicata.
- Criteri non ancora soddisfatti o non verificati: vedi `docs/VALIDAZIONE.md`, § 14.
