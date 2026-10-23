# Pipeline dati

Programmi Python che producono i dati in `public/data/v1/` e le fixture in `tests/fixtures/` (§ 12 di `docs/PROGETTO.md`). Tutti i comandi si eseguono da `scripts/pipeline/`.

## Ambienti virtuali

Servono Python 3.13 e accesso a PyPI. Le versioni sono fissate nei file `requirements*.txt`.

Ambiente principale (`.venv`): numpy, scipy, jplephem, pyerfa, spiceypy, jsonschema, pillow, pytest, ruff.

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Ambiente di integrazione (`.venv-assist`): ASSIST 1.2.3 con REBOUND 4.6.0 (ASSIST richiede REBOUND ≥ 4.4.11 e < 5). ASSIST si compila contro il REBOUND già installato, quindi l'installazione avviene in due passi e il secondo senza isolamento di compilazione (altrimenti pip compilerebbe contro REBOUND 5):

```sh
python3.13 -m venv .venv-assist
.venv-assist/bin/pip install -r requirements-assist.txt
.venv-assist/bin/pip install --no-build-isolation -r requirements-assist-build.txt
```

Serve un compilatore C. Le due cartelle sono escluse da git.

## Sorgenti voluminose

I file grandi stanno in `.cache/` (escluso da git); URL, dimensione, SHA-256 e data di estrazione sono in `raw/manifest-sorgenti.json`.

DE441: `.cache/de441/de441_part-1.bsp` e `.cache/de441/de441_part-2.bsp`, scaricati dagli URL del manifest oppure collegati a una copia locale:

```sh
mkdir -p .cache/de441
ln -s /percorso/de441_part-1.bsp .cache/de441/
ln -s /percorso/de441_part-2.bsp .cache/de441/
.venv/bin/python -c "from common.manifest import cerca_sorgente, verifica_sorgente; [verifica_sorgente(cerca_sorgente(n)) for n in ('de441_part-1.bsp', 'de441_part-2.bsp')]"
```

I file di ASSIST (`linux_m13000p17000.441`, `sb441-n16.bsp`) si aggiungono alla cache e al manifest con la fase dei piccoli corpi.

## Test e controlli

```sh
.venv/bin/python -m pytest
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv-assist/bin/python -m pytest tests/test_common_assist.py
```

I test con il marcatore `de441` sono saltati se DE441 manca dalla cache; `tests/test_common_assist.py` è saltato fuori da `.venv-assist`.
`tests/test_codice_morto.py` verifica che ogni funzione o classe di livello modulo sia usata da un modulo, da un comando o da una prova (codice morto, come `tests/progetto/codiceMorto.test.ts` per `src`).

## Costanti e fixture comuni

```sh
.venv/bin/python -m common.constants        # riscrive common/constants.json
.venv/bin/python -m common.fixture_common   # riscrive tests/fixtures/common/
```

Le fixture usano semi casuali fissi (registrati nei JSON, campo `seme`). Il test `test_fixture_rigenerate_identiche` verifica che le fixture nel repository coincidano con quelle rigenerate.

## Struttura

| Percorso | Contenuto |
|----------|-----------|
| `common/constants.py`, `common/constants.json` | UA, obliquità, GM ed EMRAT di DE441, μ, blocchi, limiti dell'intervallo, c |
| `common/calendario.py` | calendario ↔ JD (Meeus, cap. 7, con parte intera per difetto) |
| `common/frames.py` | rotazione ICRF ↔ eclittica J2000 |
| `common/de441.py` | lettura dei due SPK DE441, stati eliocentrici in eclittica J2000 |
| `common/equinoctial.py` | elementi equinoziali con fattore retrogrado, equazione di Keplero |
| `common/interp.py` | Lagrange a 8 punti e Hermite cubica su griglia uniforme |
| `common/binio.py` | intestazione comune a 64 byte, formato SSSERIE1, valutazione di riferimento |
| `common/manifest.py` | SHA-256, voci di `manifest.json` e di `raw/manifest-sorgenti.json` |
| `common/fixture_common.py` | fixture per i test TypeScript in `tests/fixtures/common/` |
| `raw/` | risposte piccole congelate e manifest delle sorgenti voluminose (versionati) |
| `.cache/` | sorgenti voluminose (non versionate) |
| `tests/` | test pytest |
| `pyproject.toml` | configurazione di ruff e pytest |

## Convenzioni dei moduli comuni

- Tempi in JD TDB; posizioni in km, velocità in km/s (km/d solo nei dati dei segmenti C); GM in km³/s²; angoli in radianti.
- Stati eliocentrici rispetto al centro del Sole (NAIF 10) nell'eclittica J2000.
- DE441: JD < 2 440 416,5 dal file part-1, altrimenti dal part-2; il JD è passato a jplephem come parte intera più frazione.
- Segmenti E: 4 campioni fuori dal nucleo per lato (aloni), λ continua con residui |δλ| < 1 rad, a0 media di a, λ0 e n da retta ai minimi quadrati. Segmenti C: 1 campione fuori dal nucleo per lato. Passi potenze di 2 tra 1/64 d e 1024 d.
- Lagrange: x = (t - t_primo)/h, j = floor(x) limitato a [3, N - 5], u = x - j; pesi Π(u - n)/D_m con D_m = -5040, 720, -240, 144, -144, 240, -720, 5040 per m = -3..4.
- Hermite: j = floor(x) limitato a [0, N - 2]; velocità divise per h.
- Keplero equinoziale: λ ridotta a [-π, π), partenza F0 = λ + 0,85·e·sign(k·sin λ - h·cos λ), Newton fino a |ΔF| ≤ 1e-15 rad o 30 iterazioni.
