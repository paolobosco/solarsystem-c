# Fondamenta: moduli comuni di pipeline e runtime

Riferimento: `docs/PROGETTO.md` versione 2.0. Le formule e i formati citati con il paragrafo (§) sono definiti lì.

## 1. Contenuto

### 1.1 Pipeline Python (`scripts/pipeline/common/`)

| Modulo | Contenuto |
|--------|-----------|
| `constants.py`, `constants.json` | UA, giorno, J2000, c, obliquità J2000, GM ed EMRAT di DE441, μ degli elementi, blocchi T0, B, K, T_END, JD_MIN_UT, JD_MAX_UT_EXCL |
| `calendario.py` | calendario ↔ JD (Meeus, cap. 7, con `floor`) |
| `frames.py` | rotazione ICRF ↔ eclittica J2000 (84 381,448″) |
| `de441.py` | lettura di DE441 (part-1 e part-2, scelta per campione al § 7.3.1) |
| `equinoctial.py` | elementi equinoziali ↔ stato (§ 7.2), Keplero, λ continua |
| `interp.py` | Lagrange a 8 punti, Hermite cubica, griglie con aloni |
| `binio.py` | intestazione a 64 byte (§ 8.2), formato SSSERIE1 (§ 8.3), valutazione di riferimento |
| `manifest.py` | SHA-256, `manifest.json` (§ 8.11), manifest delle sorgenti |
| `fixture_common.py` | fixture `tests/fixtures/common/` |
| `precession_ref.py` | precessione di Vondrák et al. (ERFA), matrice eclittica della data → eclittica J2000, fixture `tests/fixtures/precession/` |

### 1.2 Runtime TypeScript

| File | Contenuto |
|------|-----------|
| `src/time/types.ts`, `calendar.ts`, `steps.ts` | tipi del tempo, calendario e validazione delle date, passi |
| `src/time/precession.ts` | `ltpequ`, `ltpecl`, `ltp`, `ltpb`, `ltecm` come in ERFA; `eclitticaDataAJ2000` |
| `src/ephem/types.ts`, `constants.ts` | contratti delle effemeridi (§ 5.4); costanti uguali a `constants.json` |
| `src/ephem/kepler.ts` | Keplero equinoziale, ellittico e iperbolico |
| `src/ephem/equinoctial.ts` | elementi ↔ stato, classici ↔ equinoziali, conica osculante da stato |
| `src/ephem/interp.ts` | Lagrange a 8 punti e Hermite cubica, identiche a `interp.py` |
| `src/data/binHeader.ts` | intestazione comune, blocchi (`inizioBlocco`, `fineBlocco`, `bloccoDi`) |
| `src/data/serie.ts` | lettore SSSERIE1 con verifiche e valutazione senza allocazioni |
| `src/data/types.ts`, `assetUrl.ts`, `catalogTypes.ts` | contratti dei dati, URL relativi, tipi del catalogo |
| `src/app/types.ts`, `src/test-hooks.ts` | contratti dell'applicazione, ganci per i test e2e |

### 1.3 Fixture

- `tests/fixtures/common/`: `serie-prova.bin` (Mercurio da DE441 con segmento E; corpo sintetico retrogrado con E e C; corpo iperbolico con tre segmenti C e un intervallo scoperto), `serie-prova.json` (200 epoche), `equinoziali.json` (100 casi), `constants.json`. Semi 20261018 e 20261019.
- `tests/fixtures/precession/precessione.json`: 200 epoche giuliane da -10000 a 2121 (seme 20261020), calcolate con pyerfa 2.0.1.5.

## 2. Convenzioni

- Unità: km, km/s, km³/s², rad; tempi in giorni JD TDB (TT, I7). Sistema: eclittica J2000 eliocentrica (I4).
- Elementi in array `[a, h, k, p, q, λ]`; stati in array `[x, y, z, vx, vy, vz]`; matrici 3×3 in array di 9 elementi per righe.
- Fattore I: +1 per i ≤ 90°, -1 oltre. Senza indicazione, `elementiDaStato` lo sceglie dal segno della componente z del momento angolare.
- λ restituita in [-π, π); in ingresso può essere non ridotta (è ridotta prima di Keplero). Nei segmenti E: a = a0 + δa, λ = λ0 + n·(t - t_primo) + δλ.
- Nessuna allocazione nei percorsi per frame: le funzioni scrivono in `out` passati dal chiamante e usano memoria di lavoro di modulo.
- Interpolazione: Lagrange con j = floor((t - t_primo)/h) limitato a [3, N - 5]; Hermite con j limitato a [0, N - 2]; stesso ordine delle operazioni in Python e TypeScript.
- Blocchi: `bloccoDi(t)` corregge l'arrotondamento di (t - T0)/B con confronti esatti con T0 + k·B, come `blocco_di` in Python.
- Esiti della valutazione: fuori dal nucleo del file `fuori-copertura`; nel nucleo senza segmento, o con corpo assente dal file, `non-determinabile`.
- Binari little endian, offset allineati a 8 byte; i dati dei segmenti sono viste sul buffer (copia solo su piattaforme big endian).
- Costanti: stessi nomi e valori in `constants.py`, `constants.json` e `src/ephem/constants.ts` (verificato bit per bit).
- Calendario: `jd_a_calendario` e `jdToCalendar` arrotondano l'ora al millisecondo con riporto al giorno. `giornoSettimanaLocale` e `jdToProlepticGregorian` con l'offset usano la stessa scomposizione di `jdToCalendarLocale`: giorno della settimana e riga prolettica della console seguono la data mostrata.

## 3. Uso delle API

Lettura e valutazione di un file di serie (pianeti o piccoli corpi):

```ts
const serie = leggiSerie(buffer, TIPO_PIANETI);   // ErroreFormato se il file non è conforme
const stato = new Float64Array(6);                 // allocato una volta
const esito = serie.valuta(ssid, jdTT, stato);     // 'ok' | 'fuori-copertura' | 'non-determinabile'
```

Elementi per l'orbita e per la scheda (`orbitAt`):

```ts
const conica: ElementiConica = { q: 0, e: 0, i: 0, nodo: 0, argPeri: 0, anomaliaVera: 0,
  a: 0, anomaliaMedia: 0, motoMedio: 0, tempoDalPericentro: 0 };
conicaDaStato(stato, MU_ELIO_KM3_S2[1]!, conica);  // ellisse, parabola o iperbole
puntoSuConica(conica, nu, punto);                    // vertice dell'orbita all'anomalia vera nu
```

- `motoMedio` in rad/d, `tempoDalPericentro` in giorni (per l'ellisse dall'ultimo passaggio), `periodo(conica)` in giorni.
- Orbite circolari: `argPeri` = 0 e anomalia vera misurata dal nodo. Orbite equatoriali: `nodo` = 0.
- Archi iperbolici (§ 10.2): `iperbolicaDaRaggio(3·r, a, e)` dà l'anomalia iperbolica limite.

Catena della Luna (§ 7.4), vettore nell'eclittica e nell'equinozio della data:

```ts
eclitticaDataAJ2000(epocaGiuliana(jdTT), m);   // M = R_x(ε0)·LTECMᵀ
applicaMatrice(m, vData, vJ2000);
```

In Python la stessa matrice è `precession_ref.eclittica_data_a_j2000(epj)`.

Pipeline, segmento E di un pianeta:

```python
t_primo, n = interp.griglia(ini, fin, h, *binio.ALONI_E, constants.T0)
stati = De441().stato_eliocentrico(naif, interp.tempi_campioni(t_primo, h, n))
seg = binio.segmento_e_da_stati(t_primo, h, ini, fin, stati, constants.MU_ELIO[naif])
dati = binio.scrivi_serie(binio.TIPO_PIANETI, k, constants.inizio_blocco(k), constants.fine_blocco(k), {ssid: [seg]})
```

Rigenerazione delle fixture, da `scripts/pipeline/`:

```sh
.venv/bin/python -m common.fixture_common
.venv/bin/python -m common.precession_ref
```

## 4. Esiti dei test (18/10/2026)

| Comando | Esito |
|---------|-------|
| `npx tsc --noEmit` | nessun errore |
| `npx eslint .` | nessun errore, nessun avviso |
| `npx vitest run` | 8 file, 111 test superati |
| `.venv/bin/python -m pytest` | 62 superati, 1 saltato (ASSIST, solo in `.venv-assist`) |
| `.venv-assist/bin/python -m pytest` | 65 superati |
| `.venv/bin/ruff check .`, `ruff format --check .` | nessun errore; 20 file formattati |

Confronti tra runtime e pipeline:

| Prova | Scarto massimo | Soglia |
|-------|----------------|--------|
| Stati da `serie-prova.bin` (184 epoche valide su 200; esiti e indici di segmento uguali) | 3,2e-16 relativo in posizione (6e-8 km), 5,3e-16 in velocità | 1e-12 |
| Elementi → stato, 100 casi | 4,3e-16 relativo | 1e-12 |
| Stato → elementi, 100 casi | 4,4e-16 | 1e-10 |
| Precessione contro ERFA, 200 epoche (vettori e matrici) | 3,3e-16 rad | 1e-12 |
| Calendario Python contro TypeScript, 25 004 JD | 0 differenze | esatto |

Altre verifiche: andata e ritorno equinoziale sulla griglia del § 7.2 (i ∈ {0, 90, 162, 179,9}°, e ∈ {0; 0,5; 0,97}) entro 1e-11; conica osculante per ellissi, iperboli e parabola (equazione di Barker); tempo dal perielio dell'iperbole sintetica entro 1e-3 d dal valore del generatore; valori di controllo del § 7.7 (inclinazione dell'eclittica 1,635° a -10000 e 0,265° all'anno 0, obliquità 24,149° a -10000); 30 casi di intestazioni e file non conformi rifiutati con `ErroreFormato`.

Tempo di `valuta` in Node 22: 0,38 µs per un segmento E, 0,09 µs per un segmento C.
