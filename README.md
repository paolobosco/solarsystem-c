# 3D Map of the Solar System

Note: the documents in `docs/` are in Italian. The Italian version of this file is `README.it.md`.

Interactive 3D map of the Solar System at true scale, as a static website. It shows 112 bodies: the Sun, planets, dwarf planets, 30 moons, asteroids, centaurs, comets, trans-Neptunian and interstellar objects. Positions come from JPL ephemerides (DE441, satellite SPKs, Horizons, SBDB) and from numerical integrations with ASSIST, for any date and time from 1 January 10000 BC to 31 December 2120. For each body and instant, the site states the reliability of the position. The interface is in Italian and English (language chosen by the browser, changeable in Settings), green, and compliant with WCAG 2.2 AA; without WebGL2 a text view remains available.

Built with Claude (Anthropic). MIT license (`LICENSE` file); third-party materials keep their own licenses (`docs/LICENZE.md`).

Documents: specification `docs/PROGETTO.md`, methods `docs/METODI.md`, checks `docs/VALIDAZIONE.md` and `docs/SPIKE.md`, debug log `docs/DEBUG.md`, licenses and credits `docs/LICENZE.md`.

## Requirements

- Use: a recent browser with WebGL2 (without WebGL2, only the text view). The data (about 47 MB) are downloaded in blocks according to the date; the first view requires about 2.2 MB. Fonts are loaded from Google Fonts; without a connection to Google, system fonts are used.
- Publishing: any static file server, even over HTTP; the `dist/` folder works in a subpath.
- Build: Node 22 and npm 10.9 (`.npmrc` with `legacy-peer-deps=true`, § 5.2 of the specification).
- End-to-end tests: Playwright 1.56.1 Chromium (`npx playwright install chromium`).
- Data pipeline (optional: the data are already in `public/data/v1/`): Python 3.13, a C compiler for ASSIST, about 6 GB of space for the sources, network access to JPL, NAIF, IERS, USNO, MPC and VizieR.

## Known bugs

Full list, with measurements and references, in `docs/DEBUG.md` § 6.

- Phone in landscape: with the Layers panel open, the Tab key moves focus to controls hidden by the panel.
- Phone: with the info card open, the loading message covers part of the console; with the welcome note and the medium sheet on short screens (about 480-568 px), the note covers part of the sheet and the "Open the info card" button.
- Tablet with low height (width from 700 px, height up to about 600 px): short Layers panel, text view with 0-2 visible rows; at 700 × 480 the buttons cover the legend by 11 px.
- Focus ring clipped by 3-4 px at the edges of scrolling panels.
- Switching between layouts (rotation, resized window): the phone Menu stays open; "Sources and methods" and "Settings" opened from the Menu and closed after the switch leave focus on the page body; in landscape, the catalog entry with focus may end up out of view.
- Distance ruler below 1,000 km: "Zoom in" is shown as disabled even though the view can still zoom in.
- The mouse wheel on the time ruler turns off "Follow current time" without announcing it immediately.
- With a dialog open, screen reader announcements might not be read (to be checked with a real screen reader).
- "ResizeObserver loop" warning in the browser console when messages grow during an animation, with no visible effect.
- Apophis: "indicative" reliability from about 2060 and data up to 13 September 2120, for a dispersion estimate that is probably too conservative.
- Catalog: for Hygiea, the period and pole of Vernazza et al. (2020) are not used; Sylvia, Patroclus and Eurybates have no axis inclination; the albedo of Dysnomia is not shown.
- Test tools: the A21 performance test is sensitive to CPU load; the duplicate code and dead code checks do not detect all cases.

## Commands

| Command | Effect |
|---------|--------|
| `npm ci` | installs the versions locked in `package-lock.json` |
| `npm run dev` | Vite development server; test pages `ui-lab.html` and `render-lab.html` with mock services |
| `npm run build` | type check and site build in `dist/` (relative paths, `base: './'`) |
| `npm run build:artifact` | build in `artifact` mode in the intermediate folder `dist-artifact-build/` (`assets/app.js`, `assets/app.css`; `dist/` is unchanged) and single-page package in `dist-artifact/` with `scripts/make-artifact.mjs`, which checks the RNF7 and platform limits and the three license notices (§ 5.7) |
| `npm run build:test` | build with the `window.__ssTest` test hooks in `dist-test/`; every `dist-test*/` folder (for example from `npx vite build --mode test --outDir dist-test-prova`) is excluded from git and ESLint |
| `npm run preview` | serves `dist/` locally at http://localhost:4173/ (Vite default port) |
| `npm run check` | `tsc --noEmit`, ESLint (with typed rules on `src`) and Vitest |
| `npm run e2e` | Playwright on the application with real data: rebuilds `dist-test/` and `dist-artifact/` at every start and serves them on ports 4273 (projects `desktop` and `mobile`) and 4274 (project `pagina-singola`); screenshots in `test-results/e2e/` |
| `node scripts/servi-artifact.mjs [port]` | serves `dist-artifact/` at `/a/b/index.html` inside a shell that emulates the platform's one (A24); default port 4174 |
| `npx playwright test -c e2e/ui-lab.config.ts` | interface tests on the `ui-lab.html` page |
| `npx playwright test -c tests/render/playwright.render.config.ts` | rendering tests on the `render-lab.html` page |

The end-to-end tests use dedicated ports (4273 for `dist-test/`, 4274 for `dist-artifact/`), different from the defaults of `npm run preview` (4173) and `scripts/servi-artifact.mjs` (4174): servers used manually and `npm run e2e` can run together. The builds are rerun at every start and Playwright never reuses a server that is already running (`reuseExistingServer: false`): if port 4273 or 4274 is occupied by another process, it stops immediately with the error `http://localhost:4273 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`; to free the ports: `fuser -k 4273/tcp 4274/tcp`. Manual check: with `npm run preview` running, `npx playwright test e2e/ganci.spec.ts --project desktop` rebuilds `dist-test/` and passes; with another server on port 4273 the same test fails immediately with the error above. The labs (`e2e/ui-lab.config.ts`, port 5199; `tests/render/playwright.render.config.ts`, port 5179) have their own configurations.

The site works without external services; the only external hosts are those of Google Fonts. The data are in `public/data/v1/` and are versioned: to use the site there is no need to run the pipeline.

The site also works when served over HTTP from a non-local host (for example `npx vite preview --host` opened from a phone on the local network). In this insecure context the browser does not offer `crypto.subtle` and the SHA-256 verification of the data uses a JavaScript implementation (§ 5.6 of the specification). The host may use HTTP caching on the files in `data/v1/`, which have stable names: `manifest.json` is revalidated at every start and a non-conforming file is downloaded again from the server.

## Repository structure

| Path | Contents |
|------|----------|
| `index.html`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `playwright.config.ts` | page and configurations |
| `src/main.ts` | entry point |
| `src/app/` | startup and data loading (§ 5.6), state store, URL, preferences, clock (the only use of `Date`), providers for rendering |
| `src/time/` | calendar, steps, ΔT, time scales, precession, Earth rotation, nutation, seasons |
| `src/ephem/` | equinoctial elements, Kepler, interpolation, planets, Moon, satellites, small bodies, barycentric Sun, orientation, reliability, ephemeris service |
| `src/data/` | manifest, data archive with SHA-256 verification, binary format readers, catalog |
| `src/render/` | true-scale three.js scene |
| `src/ui/` | interface; all visible texts in `src/ui/testi.it.ts` |
| `src/dev/`, `src/ui/dev/` | mock services of the test pages (not included in the build) |
| `src/test-hooks.ts` | `window.__ssTest` hooks, only in the test build |
| `public/data/v1/` | data produced by the pipeline (§ 8 of the specification) |
| `tests/` | Vitest; `tests/fixtures/` produced by the pipeline with a recorded seed, except `tests/fixtures/scheda/` (osculating elements downloaded from JPL Horizons on 19 October 2026); `tests/progetto/` repository checks (dependencies, lint, deprecated APIs, dead code and unread CSS tokens, duplicates, licenses, structure of § 5.3, end-to-end test ports); pipeline dead code in `scripts/pipeline/tests/test_codice_morto.py` |
| `e2e/` | Playwright: application with real data (`aiuti.ts` and specs), test pages with their own configurations |
| `scripts/make-artifact.mjs`, `scripts/servi-artifact.mjs` | single-page package (§ 5.7) and local server for the A24 check |
| `scripts/pipeline/` | Python pipeline, frozen responses in `raw/`, pytest tests |
| `docs/` | specification, review, methods, validation, spike, licenses, technical notes of the modules (`docs/_parti/`), JSON schemas (`docs/schema/`) |

## Data pipeline

Details: `scripts/pipeline/README.md` and the module notes in `docs/_parti/`. All commands are run from `scripts/pipeline/`.

### Environments

Python 3.13 with two virtual environments (pinned versions):

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
python3.13 -m venv .venv-assist
.venv-assist/bin/pip install -r requirements-assist.txt
.venv-assist/bin/pip install --no-build-isolation -r requirements-assist-build.txt
```

`.venv`: numpy, scipy, jplephem, pyerfa, spiceypy, jsonschema, pillow, pytest, ruff. `.venv-assist`: ASSIST 1.2.3 built against REBOUND 4.6.0 (a C compiler is required).

### Large sources

Large files are in `scripts/pipeline/.cache/` (excluded from git), with URL, size, SHA-256 and extraction date in `raw/manifest-sorgenti.json`. Small responses (SBDB, Horizons, IERS, JPL and PDS pages, catalog ReadMe files) are frozen in `raw/`.

| Source | Size | Use |
|--------|------|-----|
| DE441, `de441_part-1.bsp` and `de441_part-2.bsp` | 1.65 GB each | time, planets, Moon, catalog |
| `linux_m13000p17000.441`, `sb441-n16.bsp` | 2.79 GB; 0.65 GB | ASSIST |
| Satellite SPK kernels (modern and long) | about 26 GB downloaded one at a time | satellites; the long kernels are deleted after use |
| Horizons SPKs of small bodies | 231 files, 681.9 MB | small bodies |
| Texture mosaics | up to 0.8 GB per file | deleted after use if over 40 MB; the resampled image remains |

The folder takes up about 5.7 GB when the work is complete; the free space check precedes every download of satellite kernels.

### Commands

Order for a full regeneration (the `--offline` options use only frozen responses and verified cache):

```sh
.venv/bin/python time_model.py sorgenti && .venv/bin/python time_model.py genera
.venv/bin/python time_model.py valida && .venv/bin/python time_model.py fixture && .venv/bin/python time_model.py catalogo
.venv/bin/python planets.py genera && .venv/bin/python planets.py valida && .venv/bin/python planets.py fixture && .venv/bin/python planets.py catalogo
.venv/bin/python moon.py genera && .venv/bin/python moon.py valida && .venv/bin/python moon.py kappa
.venv/bin/python moon.py affidabilita && .venv/bin/python moon.py fixture
.venv/bin/python satellites.py campiona      # then: sistemi, scelte, lunghi, spike, record, record-lunghi,
                                             # residui, genera, valida, catalogo, fixture
.venv-assist/bin/python small_bodies.py tutto
.venv/bin/python stars.py scarica && .venv/bin/python stars.py genera
.venv/bin/python textures.py genera && .venv/bin/python textures.py pagine
.venv/bin/python physical.py scarica && .venv/bin/python physical.py catalogo
.venv/bin/python textures.py catalogo
.venv/bin/python catalog.py
.venv/bin/python reliability_pack.py
.venv/bin/python physical.py fixture
.venv/bin/python pack.py                     # last: manifest, SHA-256, budget of § 8.1
```

Measured times: `planets.py genera` 4 s, `valida` 18 s; `moon.py genera` about 17 min, `valida` 165 s; `small_bodies.py integra` 8,702 s of computation (about 1 h 15 min with 2 processes), `valida` about 2 min. Each step for satellites and small bodies saves results per body in `.cache/` and can be resumed.

Checks:

```sh
.venv/bin/python -m pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv-assist/bin/python -m pytest tests/test_common_assist.py
```

After every data change, `pack.py` must be rerun. Without `--versione`, the manifest's `versioneDati` stays at the published value if files, sizes and SHA-256 do not change; otherwise it becomes the current date; `--versione YYYY-MM-DD` fixes it. Likewise `catalog.py` keeps the `generato` field if the catalog does not change (`--generato` fixes it): with unchanged data the pipeline rewrites byte-for-byte identical files. The manifest tests (pytest and Vitest) always compare the size, header and SHA-256 of every file with `manifest.json`, on any checkout, and fail if they do not match; they are skipped only if the manifest is missing.

## Data sources and licenses

| Data | Source | License or terms |
|------|--------|------------------|
| Planets, Pluto, Moon (corrections) | JPL DE441 (Park et al. 2021) | NASA/JPL, with credit |
| Satellites | JPL/NAIF satellite SPK kernels; Dysnomia from Holler et al. (2021) | NASA/JPL, with credit |
| Small bodies | JPL Horizons, SBDB, sb441-n16; ASSIST integration | NASA/JPL, with credit |
| ΔT | table S15.2020 (Morrison et al. 2021), IERS EOP 20 C04 | citation of sources |
| Orientation and radii | Archinal et al. (2018), NAIF `pck00011.tpc` | with citation |
| Rings | PDS Ring-Moon Systems Node | with citation |
| Stars | Bright Star Catalogue (V/50), Hipparcos (I/311, I/239) via VizieR | use with citation |
| Textures | NASA, USGS Astrogeology (public domain or free use with citation); Saturn, Uranus, Neptune from Solar System Scope | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) for Solar System Scope, maps resampled and realigned in longitude |
| Fonts | Source Sans 3, Source Serif 4, Source Code Pro | SIL Open Font License 1.1 |
| Official names | Minor Planet Center (IAU), Identifier API | with acknowledgment |
| Distributed code | three.js 0.180.0, © 2010-2025 three.js authors; Vite `modulepreload` polyfill, © 2019-present VoidZero Inc. and Vite contributors | MIT: `@license` notice in the bundle and full texts in `assets/LICENZE.txt` |

ASSIST and REBOUND (GPL-3.0) are used only to produce the data and are not distributed. `scripts/pipeline/raw/` contains frozen copies of third-party sources, each with its own terms. Full list and credits: `docs/LICENZE.md`.

This research has made use of data and/or services provided by the International Astronomical Union's Minor Planet Center.

## Known limitations

- Instantaneous geometric positions, without light time or aberration; the motion of the Sun about the barycenter is not shown.
- ΔT: before 1950 it differs from that of JPL Horizons (about 76 s in 721 BC, 1,510 s in 10000 BC); in the future Horizons keeps it constant (28.6 s difference in 2120).
- With the instant in TT, Earth rotation is undetermined in longitude up to year -4594 (4595 BC), because of the uncertainty of UT1 = TT - ΔT; nutation and polar motion are neglected.
- Seasons: instants of equinoxes and solstices from the apparent longitude of the Sun (within 1 min of USNO in 2023-2026); if the state of the Earth at the instant of the event is not loaded, the days since the event are estimated with the osculating conic (error up to 0.05 d).
- ΔT from 1962 to 2019 from table S15.2020, not from IERS values: root-mean-square difference from EOP 20 C04 of 0.45 s in 1962-1971 (maximum 0.68 s, adopted also before 1962) and 0.11 s in 1972-2018 (maximum 0.27 s), used as the uncertainty; from 2020, 0.002 s. After the last IERS value (18 September 2026), ΔT stays almost constant and the uncertainty grows with the drift from the excess of the length of day (0.54 ms per day): 0.017 s on 19 October 2026, against an actual difference of 0.030 s.
- Moon: model error of at least 60″ (Meeus series with corrections from DE441), hence reliability at most "good", even with the instant in TT.
- Small bodies before 1600: representation tolerance 1e-3·r from 2001 BC and 1e-2·r earlier, added to the estimated error (reliability at most "good"); force of the 16 largest asteroids switched off before year -7999; DT delay of non-gravitational forces not modeled.
- C/1680 V1: at perihelion on 18 December 1680, at 0.0062 AU from the Sun, difference of up to 759 km from the source (1.52 times the tolerance), because the minimum step of 1/64 d does not follow the perihelion passage; declared exception of A7.
- Satellites: pole of plane F fixed in the SPK records, with out-of-plane errors for Phobos and Deimos of up to 0.31° within the kernel window; in the secular records of regular satellites, F follows the pole of the primary (Archinal et al. 2018), extrapolated and indicative outside 1600-2121, with the junction offset (up to 0.94°, Deimos); Triton, Proteus, Iapetus and the irregulars keep F fixed (for Proteus up to 1.05° from Neptune's pole).
- Irregular satellites: radial error of the records up to 0.8% of the semimajor axis (Phoebe 95,311 km, Himalia 92,196 km, Hyperion 11,797 km in the modern kernels), excluded from ε and therefore from the level, added to the estimated distance error.
- Poles and rotation phases indicative outside 1600-2121; arbitrary long-term rotation phase for the giant planets; Hyperion with indicative orientation.
- Rings with a schematic profile; shadow of the planet on Saturn's rings shown, shadows of the rings on the planet not shown.
- No shadows between bodies: solar and lunar eclipses and shadows of satellites on planets are not shown.
- Textures with filled gaps (Triton, southern hemispheres of Pluto and Charon; Saturn, Uranus, Neptune).
- Catalog: non-exhaustive selection for TNOs and centaurs (§ 4.1 of the specification); rotation direction given only for bodies with a known pole (Archinal et al. 2018, SBDB or literature); GM of asteroids taken from DE441 without published uncertainty.
- Criteria not yet met or not verified: see `docs/VALIDAZIONE.md`, § 14.
