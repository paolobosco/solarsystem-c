"""Modello del tempo (§ 6.3-6.5, § 7.7, § 8.9; passo 1 del § 12.3).

- ΔT (§ 6.4): parabola del manuale di JPL Horizons prima di -720 con offset di continuità; spline
  S15.2020 (Morrison, Stephenson, Hohenkerk, Zawilski 2021, Proc. R. Soc. A 477:20200776); raccordo
  2019-2020; valori mensili IERS EOP 20 C04; dopo l'ultimo valore IERS curvatura mareale di 32,5 s/cy²
  (Stephenson, Morrison, Hohenkerk 2016, Proc. R. Soc. A 472:20160404).
- σ(ΔT) (§ 6.5): Morrison e Stephenson (2004), J. Hist. Astron. 35, 327, fino al 1200; dal 1200 al 1900 valori
  dell'era telescopica (Stephenson e Houlden 1986, tramite Espenak e Meeus 2006); scarto quadratico medio del modello
  da EOP 20 C04 dove il modello segue la S15.2020 (1962-1971 e 1972-2018, TAI - UTC da USNO tai-utc.dat prima del
  1972) e i valori IERS mensili (2020-y_obs); Huber (2000) prima del -500; dopo y_obs Huber e la deriva di ΔT
  dall'eccesso di LOD dell'ultimo anno di C04.
- Equazione delle origini (§ 7.7): CIO integrato lungo il polo medio di Vondrák, Capitaine, Wallace
  (2011, A&A 534, A22; 2012, A&A 541, C1) con ERFA (eraLtpb, eraS06, eraEors); IERS Conventions 2010
  (IERS TN 36), eq. 5.11 e 5.15.

Uso (da scripts/pipeline/):
  .venv/bin/python time_model.py sorgenti [--offline]  # congela S15.2020, EOP 20 C04, TAI - UTC, ΔT USNO
  .venv/bin/python time_model.py genera                # public/data/v1/time.json dai dati congelati
  .venv/bin/python time_model.py horizons [--offline]  # congela le tabelle Horizons di validazione
  .venv/bin/python time_model.py valida                # controlli § 6.4, 6.5, 7.7, A3, A8, A9
  .venv/bin/python time_model.py fixture               # tests/fixtures/time/
  .venv/bin/python time_model.py catalogo              # out/catalog-tempo.json
"""

from __future__ import annotations

import argparse
import io
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import erfa
import numpy as np
from numpy.typing import ArrayLike, NDArray

from common import constants as cst
from common.calendario import calendario_a_jd
from common.frames import MATRICE_ICRF_A_ECLITTICA
from common.interp import hermite_cubica
from common.manifest import (
    CARTELLA_CACHE,
    aggiorna_manifest_sorgenti,
    cerca_sorgente,
    sha256_bytes,
    sha256_file,
    verifica_sorgente,
    voce_sorgente,
)

RADICE = Path(__file__).resolve().parents[2]
CARTELLA_PIPELINE = Path(__file__).resolve().parent
CARTELLA_RAW = CARTELLA_PIPELINE / "raw" / "time"
CARTELLA_HORIZONS = CARTELLA_RAW / "horizons"
CARTELLA_CACHE_TEMPO = CARTELLA_CACHE / "time"
PERCORSO_TIME_JSON = RADICE / "public" / "data" / "v1" / "time.json"
CARTELLA_FIXTURE = RADICE / "tests" / "fixtures" / "time"
CARTELLA_OUT = CARTELLA_PIPELINE / "out"

DATA_ESTRAZIONE = "2026-10-18"
GIORNO_S = cst.GIORNO_S
GRADI = 180.0 / math.pi
DUE_PI = 2.0 * math.pi

# --- Sorgenti ---

# Tabella S15.2020 presso HMNAO (§ 16.1); il 18/10/2026 il server risponde 503.
URL_HMNAO = ("http://astro.ukho.gov.uk/nao/lvm/Table-S15.2020.txt", "http://astro.ukho.gov.uk/nao/lvm/")
# Copia alternativa (§ 15): Skyfield 1.55, file skyfield/data/delta_t.npz, chiave "Table-S15.2020.txt",
# colonne K_i, K_(i+1), a3, a2, a1, a0. SHA-256 della ruota pubblicato da PyPI.
URL_SKYFIELD = (
    "https://files.pythonhosted.org/packages/8d/5a/c4cc09d4421de255ca0504485efceb3646a4e5381bfb665647e39bea5cb1/"
    "skyfield-1.55-py3-none-any.whl"
)
NOME_SKYFIELD = "skyfield-1.55-py3-none-any.whl"
SHA256_SKYFIELD = "9f98964855067460c94aa81a337194136f4a97a62ba8bbbfac1b8556f2b66ad4"
MEMBRO_SKYFIELD = "skyfield/data/delta_t.npz"
CHIAVE_S15 = "Table-S15.2020.txt"
FILE_S15_NPZ = CARTELLA_RAW / "Table-S15.2020.skyfield-1.55.npz"
FILE_S15_TXT = CARTELLA_RAW / "Table-S15.2020.txt"

# EOP 20 C04 dal centro di produzione (Osservatorio di Parigi). La copia di datacenter.iers.org indicata
# al § 16.1 (EOP_20_C04_one_file_1962-now.txt) il 18/10/2026 è ferma al 2025-05-05 (Last-Modified
# 2025-06-04); la serie del produttore arriva al 2026-09-18.
URL_C04 = "https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now"
URL_C04_DATACENTER = "https://datacenter.iers.org/data/latestVersion/EOP_20_C04_one_file_1962-now.txt"
NOME_C04 = "eopc04.1962-now"
FILE_C04_ESTRATTO = CARTELLA_RAW / "eopc04-estratto.txt"
URL_SECONDI_INTERCALARI = "https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat"
FILE_SECONDI_INTERCALARI = CARTELLA_RAW / "Leap_Second.dat"
# TAI - UTC dal 1961 (formule lineari in MJD fino al 1972): USNO, coefficienti uguali a quelli di IERS
# UTC-TAI.history (https://hpiers.obspm.fr/eoppc/bul/bulc/UTC-TAI.history).
URL_TAI_UTC = "https://maia.usno.navy.mil/ser7/tai-utc.dat"
FILE_TAI_UTC = CARTELLA_RAW / "tai-utc.dat"
# ΔT storico USNO 1657-1984 (semestrale): solo validazione dello scarto della S15.2020 prima del 1962.
URL_DELTAT_STORICO = "https://maia.usno.navy.mil/ser7/historic_deltat.data"
FILE_DELTAT_STORICO = CARTELLA_RAW / "historic_deltat.data"
DATA_ESTRAZIONE_USNO = "2026-10-19"
FILE_SORGENTI = CARTELLA_RAW / "sorgenti.json"

URL_HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
PAUSA_S = 1.0
TENTATIVI = 5

# --- Parametri del modello (§ 6.4, § 6.5, § 8.9) ---

# Parabola del manuale di JPL Horizons (sezione "Universal Time"): 65,62 + 31,351922682·u², u = (y - 1825)/100.
PRE720_A = 65.62
PRE720_B = 31.351922682
ANNO_INIZIO_S15 = -720.0
ANNO_RACCORDO = (2019.0, 2020.0)
# Curvatura mareale 32,5 s/cy² = 0,00325 s/anno² (Stephenson, Morrison, Hohenkerk 2016).
C_FUTURO = 0.00325
# TT - TAI (s): IERS Conventions 2010, cap. 10.
TT_MENO_TAI = 32.184
# σ: 0,8·u² (Morrison e Stephenson 2004, valida dal -1000 al 1200); modello di Huber (2000) con Q = 0,058 ms²/anno,
# M = 2500 anni.
SIGMA_M = 0.8
SIGMA_Q = 0.058
SIGMA_MM = 2500.0
SIGMA_ANNO_PASSATO = -500.0
# Fine della validità di 0,8·u² e nodi dell'era telescopica (anno, σ in s), interpolati linearmente nel logaritmo:
# circa 20 s dal 1300 al 1600; 5 s nel 1700, 1 s nel 1800, 0,1 s nel 1900 (Stephenson e Houlden 1986). Fonte:
# F. Espenak, "Uncertainty in Delta T", NASA GSFC (https://eclipse.gsfc.nasa.gov/SEhelp/uncertainty2004.html),
# da Espenak e Meeus (2006), Five Millennium Canon of Solar Eclipses, NASA/TP-2006-214141.
SIGMA_FINE_PARABOLA = 1200.0
SIGMA_NODI_TELESCOPICI = ((1300.0, 20.0), (1600.0, 20.0), (1700.0, 5.0), (1800.0, 1.0), (1900.0, 0.1))
# Intervalli in cui si misura lo scarto del modello dalla serie giornaliera EOP 20 C04: S15.2020 prima del 1972
# (TAI - UTC dalle formule di tai-utc.dat) e dal 1972 (secondi intercalari), valori IERS mensili interpolati.
SCARTI_S15_INIZIALE = ("1962-01-01", "1971-12-31")
SCARTI_S15 = ("1972-01-01", "2018-12-31")
SCARTI_IERS = ("2020-01-01", None)
# σ_S15 vale lo scarto del 1962-1971 fino al 1971,0 (anche prima del 1962, dove C04 non c'è), quello del 1972-2018
# dal 1972,0, con raccordo lineare nel 1971.
RACCORDO_SIGMA_S15 = (1971.0, 1972.0)
# Deriva dopo y_obs: radice della media dei quadrati dell'eccesso di LOD di C04 negli ultimi 365 giorni della serie
# (comprende le variazioni stagionali); D(N) = 365,25·N·LOD_rms s, N in anni.
GIORNI_LOD = 365

# Tabella EO (§ 7.7, § 8.9): nodi da T0 ogni 3652,5 d fino oltre T_END.
PASSO_EO = 3652.5
N_NODI_EO = int(math.ceil((cst.T_END - cst.T0) / PASSO_EO)) + 1
PUNTI_GAUSS = 16
PASSO_DERIVATA_ANNI = 1.0

# Velocità di rotazione terrestre dall'ERA (IERS Conventions 2010, eq. 5.15), rad/s.
OMEGA_TERRA_RAD_S = DUE_PI * 1.00273781191135448 / GIORNO_S
# Soglia del § 7.7: longitudine indeterminata se 15°/h·σ(ΔT) > 90°.
SIGMA_INDETERMINAZIONE_S = 90.0 / 15.0 * 3600.0


def anno_giuliano(jd: ArrayLike) -> NDArray[np.float64]:
    """Epoca giuliana dal JD: 2000 + (JD - 2 451 545)/365,25 (§ 6.4)."""
    return 2000.0 + (np.asarray(jd, dtype=np.float64) - cst.J2000) / 365.25


def jd_da_anno(y: ArrayLike) -> NDArray[np.float64]:
    return cst.J2000 + (np.asarray(y, dtype=np.float64) - 2000.0) * 365.25


# ======================================================================================
# Rete
# ======================================================================================

_ultima_richiesta = 0.0


def scarica(url: str, tentativi: int = TENTATIVI, timeout: float = 300.0) -> bytes:
    """GET sequenziale: pausa minima di 1 s tra richieste, ripetizione con attesa crescente."""
    global _ultima_richiesta
    errore: Exception | None = None
    for k in range(tentativi):
        attesa = PAUSA_S - (time.monotonic() - _ultima_richiesta)
        if attesa > 0:
            time.sleep(attesa)
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                dati = r.read()
            _ultima_richiesta = time.monotonic()
            return dati
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            _ultima_richiesta = time.monotonic()
            errore = e
            codice = getattr(e, "code", None)
            if codice is not None and 400 <= codice < 500 and codice not in (408, 429):
                break
            time.sleep(min(30.0, 2.0 * 2**k))
    raise RuntimeError(f"richiesta non riuscita: {url}: {errore}")


# ======================================================================================
# Sorgenti: S15.2020, EOP 20 C04, secondi intercalari
# ======================================================================================


def _scrivi_s15_txt(tab: NDArray[np.float64], origine: str) -> None:
    righe = [
        "# Tabella S15.2020: Morrison, Stephenson, Hohenkerk, Zawilski (2021), Proc. R. Soc. A 477:20200776.",
        f"# Origine: {origine}",
        "# Spline cubica: t = (y - K_i)/(K_(i+1) - K_i); dT = a0 + a1*t + a2*t^2 + a3*t^3 (s), y anno giuliano.",
        "# K_i K_(i+1) a0 a1 a2 a3",
    ]
    for r in tab:
        righe.append(" ".join(repr(float(x)) for x in r))
    FILE_S15_TXT.write_text("\n".join(righe) + "\n", encoding="utf-8")


def tabella_s15_da_npz(dati: bytes) -> NDArray[np.float64]:
    """Righe (n, 6) [K_i, K_(i+1), a0, a1, a2, a3] dalla copia di Skyfield (colonne x0, x1, a3, a2, a1, a0)."""
    z = np.load(io.BytesIO(dati), allow_pickle=False)
    a = np.asarray(z[CHIAVE_S15], dtype=np.float64)
    if a.shape[0] != 6:
        raise ValueError("tabella S15 di Skyfield non conforme")
    x0, x1, a3, a2, a1, a0 = a
    return np.column_stack([x0, x1, a0, a1, a2, a3])


def tabella_s15_da_testo(testo: str) -> NDArray[np.float64]:
    """Righe numeriche [K_i, K_(i+1), a0, a1, a2, a3] da un file di testo (righe non numeriche ignorate)."""
    righe = []
    for riga in testo.splitlines():
        campi = riga.split()
        if len(campi) < 6:
            continue
        try:
            valori = [float(c) for c in campi[:6]]
        except ValueError:
            continue
        righe.append(valori)
    if not righe:
        raise ValueError("nessuna riga numerica nella tabella S15")
    return np.asarray(righe, dtype=np.float64)


def verifica_tabella_s15(tab: NDArray[np.float64]) -> dict:
    """Valori di controllo (§ 15) e continuità della spline ai nodi; ValueError se non conforme."""
    if tab.ndim != 2 or tab.shape[1] != 6 or tab.shape[0] < 2:
        raise ValueError("forma della tabella S15 non conforme")
    if not np.all(np.isfinite(tab)):
        raise ValueError("valori non finiti nella tabella S15")
    if np.any(tab[1:, 0] != tab[:-1, 1]) or np.any(tab[:, 1] <= tab[:, 0]):
        raise ValueError("nodi della tabella S15 non contigui o non crescenti")
    if tab[0, 0] != ANNO_INIZIO_S15 or tab[0, 2] != 20371.848:
        raise ValueError("valore di controllo S15(-720) = 20 371,848 s non verificato")
    fine = tab[:-1, 2] + tab[:-1, 3] + tab[:-1, 4] + tab[:-1, 5]
    salti = fine - tab[1:, 2]
    # derivate ai nodi (s/anno): a1/(K1-K0) all'inizio, (a1 + 2a2 + 3a3)/(K1-K0) alla fine
    durata = tab[:, 1] - tab[:, 0]
    d_fine = (tab[:-1, 3] + 2 * tab[:-1, 4] + 3 * tab[:-1, 5]) / durata[:-1]
    d_inizio = tab[1:, 3] / durata[1:]
    if np.max(np.abs(salti)) > 0.01:
        raise ValueError(f"spline S15 discontinua: {np.max(np.abs(salti))} s")
    return {
        "intervalli": int(tab.shape[0]),
        "primoNodo": float(tab[0, 0]),
        "ultimoNodo": float(tab[-1, 1]),
        "s15Meno720": float(tab[0, 2]),
        "saltoMassimoAiNodi_s": float(np.max(np.abs(salti))),
        "saltoMassimoDerivata_sAnno": float(np.max(np.abs(d_fine - d_inizio))),
    }


def _registra(nome: str, url: str, percorso_cache: str, descrizione: str) -> dict:
    voce = voce_sorgente(nome, url, percorso_cache, DATA_ESTRAZIONE, descrizione)
    aggiorna_manifest_sorgenti(voce)
    return voce


def congela_s15(offline: bool = False) -> dict:
    """Tabella S15.2020 da HMNAO; se non raggiungibile, dalla copia di Skyfield 1.55 (§ 15)."""
    esiti = []
    if not offline:
        for url in URL_HMNAO:
            try:
                dati = scarica(url, tentativi=2, timeout=60)
                tab = tabella_s15_da_testo(dati.decode("utf-8", errors="replace"))
                controllo = verifica_tabella_s15(tab)
                FILE_S15_NPZ.unlink(missing_ok=True)
                (CARTELLA_RAW / "Table-S15.2020.hmnao.txt").write_bytes(dati)
                _scrivi_s15_txt(tab, url)
                return {"origine": "HMNAO", "url": url, "sha256": sha256_bytes(dati), "controllo": controllo}
            except (RuntimeError, ValueError) as e:
                esiti.append({"url": url, "esito": str(e)[:200], "data": DATA_ESTRAZIONE})
    ruota = CARTELLA_CACHE_TEMPO / NOME_SKYFIELD
    if not FILE_S15_NPZ.exists() or not offline:
        if not ruota.exists():
            if offline:
                raise FileNotFoundError(f"copia S15 assente: {FILE_S15_NPZ}")
            ruota.parent.mkdir(parents=True, exist_ok=True)
            ruota.write_bytes(scarica(URL_SKYFIELD))
        if sha256_file(ruota) != SHA256_SKYFIELD:
            raise ValueError("SHA-256 della ruota di Skyfield diverso dal valore di PyPI")
        with zipfile.ZipFile(ruota) as z:
            npz = z.read(MEMBRO_SKYFIELD)
        FILE_S15_NPZ.write_bytes(npz)
        _registra(
            NOME_SKYFIELD,
            URL_SKYFIELD,
            f"time/{NOME_SKYFIELD}",
            "Skyfield 1.55 (PyPI): contiene skyfield/data/delta_t.npz con la tabella S15.2020",
        )
    npz = FILE_S15_NPZ.read_bytes()
    tab = tabella_s15_da_npz(npz)
    controllo = verifica_tabella_s15(tab)
    _scrivi_s15_txt(tab, f"Skyfield 1.55, {MEMBRO_SKYFIELD}, chiave {CHIAVE_S15} (SHA-256 {sha256_bytes(npz)})")
    return {
        "origine": "Skyfield 1.55",
        "url": URL_SKYFIELD,
        "sha256Ruota": SHA256_SKYFIELD,
        "membro": MEMBRO_SKYFIELD,
        "chiave": CHIAVE_S15,
        "sha256": sha256_bytes(npz),
        "tentativiHmnao": esiti,
        "controllo": controllo,
    }


def estratto_c04(testo: str) -> str:
    """Intestazione, righe del giorno 1 di ogni mese e ultima riga della serie C04."""
    intest, dati = [], []
    for riga in testo.splitlines():
        if riga.startswith("#"):
            intest.append(riga.rstrip())
        elif riga.strip():
            dati.append(riga.rstrip())
    scelte = [r for r in dati if int(r.split()[2]) == 1]
    if dati and (not scelte or scelte[-1] != dati[-1]):
        scelte.append(dati[-1])
    return "\n".join(intest + scelte) + "\n"


def congela_c04(offline: bool = False) -> dict:
    """Serie EOP 20 C04 completa in cache (SHA-256 nel manifest) ed estratto mensile congelato."""
    percorso = CARTELLA_CACHE_TEMPO / NOME_C04
    if not offline:
        percorso.parent.mkdir(parents=True, exist_ok=True)
        percorso.write_bytes(scarica(URL_C04))
        _registra(
            NOME_C04,
            URL_C04,
            f"time/{NOME_C04}",
            "IERS EOP 20 C04, serie giornaliera 1962-oggi dal centro di produzione (Osservatorio di Parigi)",
        )
    voce = cerca_sorgente(NOME_C04)
    if percorso.exists():
        verifica_sorgente(voce)
        FILE_C04_ESTRATTO.write_text(estratto_c04(percorso.read_text(encoding="utf-8")), encoding="utf-8")
    elif not FILE_C04_ESTRATTO.exists():
        raise FileNotFoundError(f"serie C04 assente: {percorso}")
    righe = leggi_c04(FILE_C04_ESTRATTO.read_text(encoding="utf-8"))
    out = {
        "url": URL_C04,
        "nome": NOME_C04,
        "sha256Serie": voce["sha256"],
        "sha256Estratto": sha256_file(FILE_C04_ESTRATTO),
        "ultimoGiorno": f"{righe[-1].anno:04d}-{righe[-1].mese:02d}-{righe[-1].giorno:02d}",
        "notaDatacenter": (
            f"{URL_C04_DATACENTER}: copia ferma al 2025-05-05 (Last-Modified 2025-06-04) il {DATA_ESTRAZIONE}"
        ),
    }
    if percorso.exists():
        # σ(ΔT) (§ 6.5): scarti del modello dalla serie giornaliera ed eccesso di LOD dell'ultimo anno
        completa = leggi_c04(percorso.read_text(encoding="utf-8"))
        out["scartiModello"] = scarti_modello_c04(costruisci_modello(), completa)
        out["lodUltimoAnno"] = lod_ultimo_anno(completa)
    elif FILE_SORGENTI.exists():
        precedenti = json.loads(FILE_SORGENTI.read_text(encoding="utf-8"))["c04"]
        for chiave in ("scartiModello", "lodUltimoAnno"):
            if chiave in precedenti:
                out[chiave] = precedenti[chiave]
    return out


def congela_secondi_intercalari(offline: bool = False) -> dict:
    if not offline:
        FILE_SECONDI_INTERCALARI.write_bytes(scarica(URL_SECONDI_INTERCALARI))
    return {"url": URL_SECONDI_INTERCALARI, "sha256": sha256_file(FILE_SECONDI_INTERCALARI)}


def congela_usno(url: str, percorso: Path, offline: bool = False) -> dict:
    if not offline:
        percorso.write_bytes(scarica(url))
    return {"url": url, "data": DATA_ESTRAZIONE_USNO, "sha256": sha256_file(percorso)}


def congela_sorgenti(offline: bool = False) -> dict:
    CARTELLA_RAW.mkdir(parents=True, exist_ok=True)
    s15 = congela_s15(offline)
    secondi = congela_secondi_intercalari(offline)
    # gli scarti del modello da C04 richiedono TAI - UTC prima del 1972
    tai_utc = congela_usno(URL_TAI_UTC, FILE_TAI_UTC, offline)
    sorgenti = {
        "formato": 1,
        "estrazione": DATA_ESTRAZIONE,
        "s15": s15,
        "c04": congela_c04(offline),
        "secondiIntercalari": secondi,
        "taiUtc": tai_utc,
        "deltaTStoricoUsno": congela_usno(URL_DELTAT_STORICO, FILE_DELTAT_STORICO, offline),
    }
    if offline and FILE_SORGENTI.exists():
        precedenti = json.loads(FILE_SORGENTI.read_text(encoding="utf-8"))
        sorgenti["s15"]["tentativiHmnao"] = precedenti["s15"].get("tentativiHmnao", [])
    FILE_SORGENTI.write_text(json.dumps(sorgenti, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return sorgenti


# ======================================================================================
# Lettura delle sorgenti congelate
# ======================================================================================


@dataclass(frozen=True)
class RigaC04:
    anno: int
    mese: int
    giorno: int
    mjd: float
    ut1_utc: float
    lod: float  # eccesso della durata del giorno su 86 400 s (s)


def leggi_c04(testo: str) -> list[RigaC04]:
    out = []
    for riga in testo.splitlines():
        if riga.startswith("#") or not riga.strip():
            continue
        c = riga.split()
        out.append(RigaC04(int(c[0]), int(c[1]), int(c[2]), float(c[4]), float(c[7]), float(c[12])))
    return out


@cache
def secondi_intercalari() -> tuple[tuple[float, float], ...]:
    """(MJD di inizio, TAI - UTC) da Leap_Second.dat (IERS), dal 1972."""
    out = []
    for riga in FILE_SECONDI_INTERCALARI.read_text(encoding="utf-8").splitlines():
        if riga.lstrip().startswith("#") or not riga.strip():
            continue
        c = riga.split()
        out.append((float(c[0]), float(c[4])))
    return tuple(out)


_RIGA_TAI_UTC = re.compile(r"=JD\s+([\d.]+)\s+TAI-UTC=\s+([\d.]+)\s*S\s*\+\s*\(MJD\s*-\s*([\d.]+)\)\s*X\s*([\d.]+)\s*S")


@cache
def formule_tai_utc() -> tuple[tuple[float, float, float, float], ...]:
    """(MJD di inizio, a, MJD di riferimento, b) da tai-utc.dat (USNO): TAI - UTC = a + (MJD - MJD_rif)·b s."""
    out = []
    for riga in FILE_TAI_UTC.read_text(encoding="utf-8").splitlines():
        m = _RIGA_TAI_UTC.search(riga)
        if m:
            jd, a, rif, b = (float(x) for x in m.groups())
            out.append((jd - 2400000.5, a, rif, b))
    if not out:
        raise ValueError("tai-utc.dat senza righe valide")
    return tuple(out)


def tai_meno_utc(mjd: float) -> float:
    """TAI - UTC (s) per MJD (UTC) dal 1961-01-01: formule di tai-utc.dat prima del 1972, Leap_Second.dat dopo."""
    tab = secondi_intercalari()
    if mjd < tab[0][0]:
        formule = formule_tai_utc()
        if mjd < formule[0][0]:
            raise ValueError("TAI - UTC non definito prima del 1961")
        valore = math.nan
        for inizio, a, rif, b in formule:
            if mjd >= inizio:
                valore = a + (mjd - rif) * b
        return valore
    valore = tab[0][1]
    for inizio, v in tab:
        if mjd >= inizio:
            valore = v
    return valore


def leggi_s15() -> NDArray[np.float64]:
    if FILE_S15_NPZ.exists():
        return tabella_s15_da_npz(FILE_S15_NPZ.read_bytes())
    return tabella_s15_da_testo(FILE_S15_TXT.read_text(encoding="utf-8"))


def sha256_s15() -> str:
    if FILE_S15_NPZ.exists():
        return sha256_file(FILE_S15_NPZ)
    return sha256_file(CARTELLA_RAW / "Table-S15.2020.hmnao.txt")


# ======================================================================================
# Modello di ΔT e σ (§ 6.4, § 6.5)
# ======================================================================================


@dataclass(frozen=True)
class ModelloDeltaT:
    s15_nodi: NDArray[np.float64]  # (n, 2)
    s15_coeff: NDArray[np.float64]  # (n, 4): a0, a1, a2, a3
    pre_a: float
    pre_b: float
    pre_delta: float
    iers_anni: NDArray[np.float64]
    iers_valori: NDArray[np.float64]
    y_obs: float
    dt_obs: float
    c_futuro: float = C_FUTURO
    sigma_m: float = SIGMA_M
    sigma_q: float = SIGMA_Q
    sigma_mm: float = SIGMA_MM
    anno_passato: float = SIGMA_ANNO_PASSATO
    # Nodi dal 1200: il primo vale sigma_m·u(1200)²; σ costante dopo l'ultimo.
    storico_anni: tuple[float, ...] = ()
    storico_valori: tuple[float, ...] = ()
    # Scarto quadratico medio del modello da EOP 20 C04 (s): S15.2020 dal 1972 e valori IERS mensili.
    sigma_s15: float = math.nan
    sigma_iers: float = math.nan
    # S15.2020 nel 1962-1971, usato fino a raccordo_s15[0], e raccordo lineare verso sigma_s15.
    sigma_s15_iniziale: float = math.nan
    raccordo_s15: tuple[float, float] = RACCORDO_SIGMA_S15
    # Eccesso di LOD, radice della media dei quadrati nell'ultimo anno della serie (s).
    lod_rms: float = math.nan

    def s15(self, y: float) -> float:
        """Spline S15; oltre l'ultimo nodo prolunga l'ultimo polinomio (raccordo 2019-2020)."""
        n = self.s15_nodi.shape[0]
        i = int(np.searchsorted(self.s15_nodi[:, 0], y, side="right")) - 1
        i = min(max(i, 0), n - 1)
        k0, k1 = self.s15_nodi[i]
        a0, a1, a2, a3 = self.s15_coeff[i]
        t = (y - k0) / (k1 - k0)
        return float(a0 + t * (a1 + t * (a2 + t * a3)))

    def parabola(self, y: float) -> float:
        u = (y - 1825.0) / 100.0
        return self.pre_a + self.pre_b * u * u + self.pre_delta

    def iers(self, y: float) -> float:
        """Interpolazione lineare dei valori IERS; costante fuori dalla serie."""
        a, v = self.iers_anni, self.iers_valori
        if y <= a[0]:
            return float(v[0])
        if y >= a[-1]:
            return float(v[-1])
        j = int(np.searchsorted(a, y, side="right")) - 1
        y0, y1, v0, v1 = a[j], a[j + 1], v[j], v[j + 1]
        return float(v0 + (v1 - v0) / (y1 - y0) * (y - y0))

    def da_anno(self, y: float) -> float:
        if y < ANNO_INIZIO_S15:
            return self.parabola(y)
        if y < ANNO_RACCORDO[0]:
            return self.s15(y)
        if y < ANNO_RACCORDO[1]:
            w = y - ANNO_RACCORDO[0]
            return (1.0 - w) * self.s15(y) + w * self.iers(y)
        if y <= self.y_obs:
            return self.iers(y)
        dy = y - self.y_obs
        return self.dt_obs + self.c_futuro * dy * dy

    def delta_t(self, jd_ut: float) -> float:
        """ΔT = TT - UT1 (s) all'istante UT1."""
        return self.da_anno(float(anno_giuliano(jd_ut)))

    def huber(self, n: float) -> float:
        return 365.25 * n * math.sqrt((n * self.sigma_q / 3.0) * (1.0 + n / self.sigma_mm)) / 1000.0

    def sigma_storica(self, y: float) -> float:
        """σ dei dati storici: sigma_m·u² fino al primo nodo, poi interpolazione lineare nel logaritmo."""
        a, v = self.storico_anni, self.storico_valori
        if y <= a[0]:
            u = (y - 1825.0) / 100.0
            return self.sigma_m * u * u
        if y >= a[-1]:
            return v[-1]
        j = int(np.searchsorted(a, y, side="right")) - 1
        w = (y - a[j]) / (a[j + 1] - a[j])
        l0 = math.log(v[j])
        return math.exp(l0 + w * (math.log(v[j + 1]) - l0))

    def sigma_s15_di(self, y: float) -> float:
        """Scarto della S15.2020 da C04: valore del 1962-1971, raccordo lineare, valore del 1972-2018."""
        r0, r1 = self.raccordo_s15
        if y < r0:
            return self.sigma_s15_iniziale
        if y < r1:
            w = (y - r0) / (r1 - r0)
            return (1.0 - w) * self.sigma_s15_iniziale + w * self.sigma_s15
        return self.sigma_s15

    def deriva(self, n: float) -> float:
        """D(N) = 365,25·N·LOD_rms (s), N anni dopo y_obs."""
        return 365.25 * n * self.lod_rms

    def sigma_da_anno(self, y: float) -> float:
        if y < ANNO_RACCORDO[0]:
            s = max(self.sigma_storica(y), self.sigma_s15_di(y))
            if y < self.anno_passato:
                s = max(s, self.huber(self.anno_passato - y))
            return s
        if y < ANNO_RACCORDO[1]:
            w = y - ANNO_RACCORDO[0]
            return (1.0 - w) * max(self.sigma_storica(y), self.sigma_s15_di(y)) + w * self.sigma_iers
        s = self.sigma_iers
        if y > self.y_obs:
            n = y - self.y_obs
            s = max(s, self.huber(n), self.deriva(n))
        return s

    def sigma(self, jd_ut: float) -> float:
        """σ(ΔT) a 1 sigma (s)."""
        return self.sigma_da_anno(float(anno_giuliano(jd_ut)))


def nodi_storici() -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Nodi di σ dal 1200: (1200, 0,8·u(1200)²) e nodi dell'era telescopica."""
    u = (SIGMA_FINE_PARABOLA - 1825.0) / 100.0
    anni = (SIGMA_FINE_PARABOLA, *(a for a, _ in SIGMA_NODI_TELESCOPICI))
    valori = (SIGMA_M * u * u, *(v for _, v in SIGMA_NODI_TELESCOPICI))
    return anni, valori


def scarti_registrati() -> dict[str, float]:
    """Scarti quadratici medi del modello da EOP 20 C04 ed eccesso di LOD dell'ultimo anno registrati in
    raw/time/sorgenti.json (NaN se assenti)."""
    out = {"s15Iniziale": math.nan, "s15": math.nan, "iers": math.nan, "lod": math.nan}
    if not FILE_SORGENTI.exists():
        return out
    c04 = json.loads(FILE_SORGENTI.read_text(encoding="utf-8"))["c04"]
    for nome, voce in c04.get("scartiModello", {}).items():
        out[nome] = float(voce["rms_s"])
    if "lodUltimoAnno" in c04:
        out["lod"] = float(c04["lodUltimoAnno"]["rms_s"])
    return out


def costruisci_modello() -> ModelloDeltaT:
    """Modello di ΔT dai file congelati in raw/time/."""
    tab = leggi_s15()
    verifica_tabella_s15(tab)
    nodi = tab[:, :2].copy()
    coeff = tab[:, 2:].copy()
    u720 = (ANNO_INIZIO_S15 - 1825.0) / 100.0
    delta = float(coeff[0, 0] - (PRE720_A + PRE720_B * u720 * u720))
    anni, valori = serie_iers()
    s_anni, s_valori = nodi_storici()
    sc = scarti_registrati()
    return ModelloDeltaT(
        nodi,
        coeff,
        PRE720_A,
        PRE720_B,
        delta,
        anni,
        valori,
        float(anni[-1]),
        float(valori[-1]),
        storico_anni=s_anni,
        storico_valori=s_valori,
        sigma_s15=sc["s15"],
        sigma_iers=sc["iers"],
        sigma_s15_iniziale=sc["s15Iniziale"],
        lod_rms=sc["lod"],
    )


def _giorno(r: RigaC04) -> str:
    return f"{r.anno:04d}-{r.mese:02d}-{r.giorno:02d}"


def scarti_modello_c04(m: ModelloDeltaT, righe: list[RigaC04]) -> dict:
    """Scarti del ΔT del modello dalla serie giornaliera C04 (ΔT = 32,184 + (TAI - UTC) - (UT1 - UTC))."""
    out = {}
    for nome, (da, a) in (("s15Iniziale", SCARTI_S15_INIZIALE), ("s15", SCARTI_S15), ("iers", SCARTI_IERS)):
        sel = [r for r in righe if _giorno(r) >= da and (a is None or _giorno(r) <= a)]
        d = []
        for r in sel:
            jd_ut1 = r.mjd + 2400000.5 + r.ut1_utc / GIORNO_S
            d.append(m.da_anno(float(anno_giuliano(jd_ut1))) - (TT_MENO_TAI + tai_meno_utc(r.mjd) - r.ut1_utc))
        d = np.asarray(d)
        out[nome] = {
            "da": _giorno(sel[0]),
            "a": _giorno(sel[-1]),
            "n": int(d.size),
            "rms_s": float(np.sqrt(np.mean(d * d))),
            "maxAss_s": float(np.max(np.abs(d))),
        }
    return out


def lod_ultimo_anno(righe: list[RigaC04]) -> dict:
    """Eccesso di LOD negli ultimi GIORNI_LOD giorni della serie C04: media quadratica, media, massimo."""
    sel = righe[-GIORNI_LOD:]
    lod = np.asarray([r.lod for r in sel])
    return {
        "da": _giorno(sel[0]),
        "a": _giorno(sel[-1]),
        "n": int(lod.size),
        "rms_s": float(np.sqrt(np.mean(lod * lod))),
        "media_s": float(np.mean(lod)),
        "maxAss_s": float(np.max(np.abs(lod))),
    }


def serie_iers() -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Valori mensili di ΔT = 32,184 + (TAI - UTC) - (UT1 - UTC) dal 2019-01-01 e ultimo valore C04."""
    righe = leggi_c04(FILE_C04_ESTRATTO.read_text(encoding="utf-8"))
    anni, valori = [], []
    for r in righe:
        if r.anno < 2019:
            continue
        jd_ut1 = r.mjd + 2400000.5 + r.ut1_utc / GIORNO_S
        anni.append(float(anno_giuliano(jd_ut1)))
        valori.append(TT_MENO_TAI + tai_meno_utc(r.mjd) - r.ut1_utc)
    return np.asarray(anni), np.asarray(valori)


def ut_da_tt(m: ModelloDeltaT, jd_tt: float) -> float:
    """JD UT1 da JD TT risolvendo jd_ut + ΔT(jd_ut)/86 400 = jd_tt (iterazione di punto fisso)."""
    jd_ut = jd_tt
    for _ in range(20):
        nuovo = jd_tt - m.delta_t(jd_ut) / GIORNO_S
        if nuovo == jd_ut:
            break
        jd_ut = nuovo
    return jd_ut


# ======================================================================================
# Equazione delle origini (§ 7.7)
# ======================================================================================


def epj_da_jd(jd_tt: ArrayLike) -> NDArray[np.float64]:
    return anno_giuliano(jd_tt)


def polo_xyz(epj: ArrayLike) -> NDArray[np.float64]:
    """Terza riga di eraLtpb: X, Y, Z del polo medio di Vondrák nel GCRS."""
    return np.asarray(erfa.ltpb(np.asarray(epj, dtype=np.float64)))[..., 2, :]


def derivata_xy(epj: ArrayLike) -> NDArray[np.float64]:
    """dX/dt, dY/dt (rad/d) per differenze centrali con estrapolazione di Richardson (passo 1 e 0,5 anni)."""
    e = np.asarray(epj, dtype=np.float64)
    h = PASSO_DERIVATA_ANNI
    d1 = (polo_xyz(e + h) - polo_xyz(e - h)) / (2.0 * h)
    d2 = (polo_xyz(e + h / 2) - polo_xyz(e - h / 2)) / h
    return ((4.0 * d2 - d1) / 3.0)[..., :2] / 365.25


def integrando_s(jd_tt: ArrayLike) -> NDArray[np.float64]:
    """(X·Ẏ - Y·Ẋ)/(1 + Z) in rad/d (IERS Conventions 2010, eq. 5.11)."""
    e = epj_da_jd(jd_tt)
    p = polo_xyz(e)
    d = derivata_xy(e)
    return (p[..., 0] * d[..., 1] - p[..., 1] * d[..., 0]) / (1.0 + p[..., 2])


_GL_X, _GL_W = np.polynomial.legendre.leggauss(PUNTI_GAUSS)


def integrale(a: float, b: float) -> float:
    """∫_a^b dell'integrando con Gauss-Legendre su sottointervalli di al più PASSO_EO."""
    n = max(1, int(math.ceil(abs(b - a) / PASSO_EO)))
    bordi = np.linspace(a, b, n + 1)
    tot = 0.0
    for x0, x1 in zip(bordi[:-1], bordi[1:], strict=True):
        c = 0.5 * (x0 + x1)
        r = 0.5 * (x1 - x0)
        tot += r * float(np.dot(_GL_W, integrando_s(c + r * _GL_X)))
    return tot


@dataclass(frozen=True)
class TabellaEO:
    t0: float
    passo: float
    tempi: NDArray[np.float64]
    s: NDArray[np.float64]  # CIO locator ai nodi (rad)
    valori: NDArray[np.float64]  # EO ai nodi (rad), continua
    derivate: NDArray[np.float64]  # rad/d
    s_j2000: float

    def interpola(self, jd_tt: ArrayLike) -> NDArray[np.float64]:
        """EO con Hermite cubica tra i nodi (stesse operazioni del runtime)."""
        pos, _ = hermite_cubica(jd_tt, self.t0, self.passo, self.valori[:, None], self.derivate[:, None])
        return pos[:, 0]


def eors_senza_s(epj: ArrayLike) -> NDArray[np.float64]:
    """Termine di eraEors che dipende solo dalla matrice: eraEors(ltpb, 0)."""
    e = np.asarray(epj, dtype=np.float64)
    return np.asarray(erfa.eors(erfa.ltpb(e), np.zeros_like(e)))


def _riduci(x: NDArray[np.float64]) -> NDArray[np.float64]:
    """Angolo in (-π, π]."""
    return x - DUE_PI * np.round(x / DUE_PI)


def derivata_eors(epj: ArrayLike) -> NDArray[np.float64]:
    """d/dt di eraEors(ltpb, 0) in rad/d (Richardson su passi di 1 e 0,5 anni, salti di 2π rimossi)."""
    e = np.asarray(epj, dtype=np.float64)
    h = PASSO_DERIVATA_ANNI
    d1 = _riduci(eors_senza_s(e + h) - eors_senza_s(e - h)) / (2.0 * h)
    d2 = _riduci(eors_senza_s(e + h / 2) - eors_senza_s(e - h / 2)) / h
    return (4.0 * d2 - d1) / 3.0 / 365.25


def s_j2000() -> float:
    x, y, _ = polo_xyz(2000.0)
    return float(erfa.s06(cst.J2000, 0.0, x, y))


@cache
def tabella_eo() -> TabellaEO:
    """CIO integrato lungo il polo di Vondrák: s = s(J2000) - ∫(XẎ - YẊ)/(1 + Z) dt; EO = eraEors(ltpb, s)."""
    tempi = cst.T0 + PASSO_EO * np.arange(N_NODI_EO, dtype=np.float64)
    s0 = s_j2000()
    j = int(np.searchsorted(tempi, cst.J2000, side="right")) - 1
    s = np.empty(N_NODI_EO)
    s[j] = s0 - integrale(cst.J2000, tempi[j])
    s[j + 1] = s0 - integrale(cst.J2000, tempi[j + 1])
    for i in range(j + 1, N_NODI_EO - 1):
        s[i + 1] = s[i] - integrale(tempi[i], tempi[i + 1])
    for i in range(j, 0, -1):
        s[i - 1] = s[i] + integrale(tempi[i - 1], tempi[i])
    epj = epj_da_jd(tempi)
    valori = np.unwrap(s + eors_senza_s(epj))
    derivate = -integrando_s(tempi) + derivata_eors(epj)
    return TabellaEO(cst.T0, PASSO_EO, tempi, s, valori, derivate, s0)


def s_diretto(jd_tt: float) -> float:
    """CIO locator a un istante qualsiasi, integrando dal nodo più vicino."""
    tab = tabella_eo()
    j = int(np.clip(np.rint((jd_tt - tab.t0) / tab.passo), 0, N_NODI_EO - 1))
    return float(tab.s[j] - integrale(float(tab.tempi[j]), jd_tt))


def eo_diretta(jd_tt: float) -> float:
    """EO (rad) calcolata senza tabella, ridotta in (-π, π]."""
    epj = float(epj_da_jd(jd_tt))
    return float(_riduci(np.asarray(erfa.eors(erfa.ltpb(epj), s_diretto(jd_tt)))))


def era(jd_ut1: float) -> float:
    return float(erfa.era00(jd_ut1, 0.0))


def gst_diretto(jd_ut1: float, jd_tt: float) -> float:
    """GST = ERA - EO in [0, 2π) (§ 7.7), EO senza tabella."""
    return float(np.mod(era(jd_ut1) - eo_diretta(jd_tt), DUE_PI))


def gst_tabella(jd_ut1: float, jd_tt: float) -> float:
    return float(np.mod(era(jd_ut1) - tabella_eo().interpola(jd_tt)[0], DUE_PI))


def gmst06(jd_ut1: float, jd_tt: float) -> float:
    return float(erfa.gmst06(jd_ut1, 0.0, jd_tt, 0.0))


def orientamento_terra(jd_ut1: float, jd_tt: float, tabella: bool = True) -> NDArray[np.float64]:
    """Matrice corpo → eclittica J2000 (colonne: Greenwich, 90° E, polo medio): R_x(ε0)·LTPBᵀ·R3(GST)ᵀ."""
    g = gst_tabella(jd_ut1, jd_tt) if tabella else gst_diretto(jd_ut1, jd_tt)
    w = erfa.rz(g, erfa.ltpb(float(epj_da_jd(jd_tt))))
    return MATRICE_ICRF_A_ECLITTICA @ np.asarray(w).T


def obliquita_media(epj: float) -> float:
    """Angolo tra il polo dell'equatore medio e il polo dell'eclittica della data (Vondrák et al. 2011)."""
    return float(np.arccos(np.clip(np.dot(erfa.ltpequ(epj), erfa.ltpecl(epj)), -1.0, 1.0)))


# ======================================================================================
# time.json (§ 8.9)
# ======================================================================================


def dati_time_json(m: ModelloDeltaT | None = None) -> dict:
    m = m or costruisci_modello()
    if not all(math.isfinite(x) for x in (m.sigma_s15, m.sigma_iers, m.sigma_s15_iniziale, m.lod_rms)):
        raise ValueError("scarti del modello da C04 assenti: eseguire time_model.py sorgenti")
    tab = tabella_eo()
    sorgenti = json.loads(FILE_SORGENTI.read_text(encoding="utf-8"))
    return {
        "formato": 1,
        "deltaT": {
            "s15": {
                "nodi": [[float(a), float(b)] for a, b in m.s15_nodi],
                "coeff": [[float(x) for x in r] for r in m.s15_coeff],
                "fonte": "Table-S15.2020",
                "copia": sorgenti["s15"]["origine"],
                "sha256": sha256_s15(),
            },
            "pre720": {"a": m.pre_a, "b": m.pre_b, "delta": m.pre_delta},
            "raccordo": list(ANNO_RACCORDO),
            "iers": {
                "anni": [float(x) for x in m.iers_anni],
                "valori": [float(x) for x in m.iers_valori],
                "fonte": "EOP 20 C04",
                "estrazione": DATA_ESTRAZIONE,
            },
            "yObs": m.y_obs,
            "deltaTObs": m.dt_obs,
            "cFuturo": m.c_futuro,
        },
        "sigma": {
            "m": m.sigma_m,
            "Q": m.sigma_q,
            "M": m.sigma_mm,
            "annoPassato": m.anno_passato,
            "storico": {"anni": list(m.storico_anni), "valori": list(m.storico_valori)},
            "s15Iniziale": m.sigma_s15_iniziale,
            "raccordoS15": list(m.raccordo_s15),
            "s15": m.sigma_s15,
            "iers": m.sigma_iers,
            "lodRms": m.lod_rms,
        },
        "eo": {
            "t0": tab.t0,
            "passo": tab.passo,
            "valori": [float(x) for x in tab.valori],
            "derivate": [float(x) for x in tab.derivate],
        },
    }


def testo_json(d: dict) -> str:
    return json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n"


def genera(percorso: Path = PERCORSO_TIME_JSON) -> Path:
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(testo_json(dati_time_json()), encoding="utf-8")
    return percorso


def modello_da_json(d: dict) -> ModelloDeltaT:
    """Modello ricostruito da time.json (per i test di coerenza)."""
    dt = d["deltaT"]
    s = d["sigma"]
    return ModelloDeltaT(
        np.asarray(dt["s15"]["nodi"], dtype=np.float64),
        np.asarray(dt["s15"]["coeff"], dtype=np.float64),
        dt["pre720"]["a"],
        dt["pre720"]["b"],
        dt["pre720"]["delta"],
        np.asarray(dt["iers"]["anni"], dtype=np.float64),
        np.asarray(dt["iers"]["valori"], dtype=np.float64),
        dt["yObs"],
        dt["deltaTObs"],
        dt["cFuturo"],
        s["m"],
        s["Q"],
        s["M"],
        s["annoPassato"],
        tuple(s["storico"]["anni"]),
        tuple(s["storico"]["valori"]),
        s["s15"],
        s["iers"],
        s["s15Iniziale"],
        (s["raccordoS15"][0], s["raccordoS15"][1]),
        s["lodRms"],
    )


# ======================================================================================
# Horizons (validazione)
# ======================================================================================


def url_horizons(parametri: dict[str, str]) -> str:
    return URL_HORIZONS + "?" + urllib.parse.urlencode(parametri, quote_via=urllib.parse.quote)


def tlist(jd: list[float]) -> str:
    return " ".join(f"'{x:.9f}'" for x in jd)


def richiesta_osservatore(jd: list[float], centro: str, quantita: str, extra: dict | None = None) -> dict[str, str]:
    p = {
        "format": "text",
        "COMMAND": "'10'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": f"'{centro}'",
        "TLIST_TYPE": "'JD'",
        "TLIST": tlist(jd),
        "QUANTITIES": f"'{quantita}'",
        "CAL_FORMAT": "'JD'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "EXTRA_PREC": "'YES'",
    }
    p.update(extra or {})
    return p


def righe_csv(testo: str) -> list[list[str]]:
    """Righe della tabella Horizons tra $$SOE e $$EOE, campi separati da virgola."""
    if "$$SOE" not in testo:
        raise ValueError(f"risposta Horizons senza tabella: {testo[:400]}")
    corpo = testo.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    return [[c.strip() for c in r.split(",")] for r in corpo.strip().splitlines() if r.strip()]


SEME_TDB_UT = 20261031
SEME_SUBSOLARE = 20261032


def anni_tdb_ut() -> list[float]:
    """Epoche giuliane del confronto di ΔT con Horizons (A3); Horizons parte dal 9999 a.C. marzo 15."""
    anni = [-9997.5, *range(-9500, -720, 500), -721.0, -720.5, -720.0, -719.5, -700.0]
    anni += list(range(-600, 1900, 100)) + [1900.0, 1925.0, 1950.0, 1962.5, 1975.0, 1990.0, 2000.0]
    anni += [2010.0, 2015.0, 2018.5, 2019.0, 2019.5, 2020.0, 2021.0, 2022.0, 2023.0, 2024.0, 2025.0, 2026.0]
    anni += [2026.5, 2027.0, 2030.0, 2050.0, 2075.0, 2100.0, 2120.5]
    return [float(a) for a in anni]


def epoche_subsolari(n: int = 200) -> list[float]:
    """JD UT uniformi 1900-2100 (seme fisso), arrotondati a 1e-6 d."""
    rng = np.random.default_rng(SEME_SUBSOLARE)
    y = rng.uniform(1900.0, 2100.0, n)
    return [round(float(x), 6) for x in np.sort(jd_da_anno(y))]


PREFISSO_HZ_TDB_UT = "tdb-ut"
PREFISSO_HZ_SOLE = "sole-geocentrico"
PREFISSO_HZ_TSL = "tsl-greenwich"
EPOCHE_PER_RICHIESTA = 25


def file_horizons(prefisso: str, n_epoche: int) -> list[Path]:
    """File congelati di una tabella divisa in richieste di al più 25 epoche (limite di lunghezza dell'URL)."""
    n = (n_epoche + EPOCHE_PER_RICHIESTA - 1) // EPOCHE_PER_RICHIESTA
    return [CARTELLA_HORIZONS / f"{prefisso}-{i:02d}.txt" for i in range(n)]


def _congela_horizons(
    prefisso: str, jd: list[float], centro: str, quantita: str, extra: dict | None, offline: bool
) -> list[list[str]]:
    righe: list[list[str]] = []
    for i, percorso in enumerate(file_horizons(prefisso, len(jd))):
        parte = jd[i * EPOCHE_PER_RICHIESTA : (i + 1) * EPOCHE_PER_RICHIESTA]
        if percorso.exists():
            testo = percorso.read_text(encoding="utf-8")
        elif offline:
            raise FileNotFoundError(f"risposta Horizons non congelata: {percorso}")
        else:
            testo = scarica(url_horizons(richiesta_osservatore(parte, centro, quantita, extra))).decode("utf-8")
            righe_csv(testo)
            percorso.parent.mkdir(parents=True, exist_ok=True)
            percorso.write_text(testo, encoding="utf-8")
        blocco = righe_csv(testo)
        if len(blocco) != len(parte) or any(abs(float(r[0]) - t) > 1e-8 for r, t in zip(blocco, parte, strict=True)):
            raise ValueError(f"epoche della tabella Horizons diverse da quelle richieste: {percorso}")
        righe += blocco
    return righe


SITO_GREENWICH = {"COORD_TYPE": "'GEODETIC'", "SITE_COORD": "'0,0,0'"}


def tabella_tdb_ut(offline: bool = True) -> list[list[str]]:
    jd = [float(x) for x in jd_da_anno(anni_tdb_ut())]
    return _congela_horizons(PREFISSO_HZ_TDB_UT, jd, "500@399", "30", None, offline)


def tabella_sole(offline: bool = True) -> list[list[str]]:
    return _congela_horizons(PREFISSO_HZ_SOLE, epoche_subsolari(), "500@399", "2,30", None, offline)


def tabella_tsl(offline: bool = True) -> list[list[str]]:
    return _congela_horizons(PREFISSO_HZ_TSL, epoche_subsolari(), "coord@399", "7", SITO_GREENWICH, offline)


def congela_horizons(offline: bool = False) -> None:
    tabella_tdb_ut(offline)
    tabella_sole(offline)
    tabella_tsl(offline)


def horizons_congelato() -> bool:
    return all(p.exists() for p in file_horizons(PREFISSO_HZ_TDB_UT, len(anni_tdb_ut())))


def leggi_tdb_ut() -> list[tuple[float, float]]:
    return [(float(r[0]), float(r[3])) for r in tabella_tdb_ut()]


def leggi_subsolari_horizons() -> list[dict]:
    """JD UT, RA apparente geocentrico (°), TSL apparente a Greenwich (h), longitudine subsolare (°, est)."""
    out = []
    for a, b in zip(tabella_sole(), tabella_tsl(), strict=True):
        jd = float(a[0])
        ra = float(a[3])
        last = float(b[3])
        lon = (ra - 15.0 * last + 180.0) % 360.0 - 180.0
        out.append({"jdUT": jd, "ra": ra, "tsl": last, "tdbMenoUt": float(a[5]), "lonSubsolare": lon})
    return out


# ======================================================================================
# UT1 - UTC (validazione dopo il 1962) dalla serie C04 completa
# ======================================================================================


@cache
def serie_c04_completa() -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """MJD e UT1 - TAI (s, continua) dalla serie giornaliera C04 in cache, dal 1972."""
    righe = leggi_c04((CARTELLA_CACHE_TEMPO / NOME_C04).read_text(encoding="utf-8"))
    mjd = np.array([r.mjd for r in righe if r.anno >= 1972])
    ut1_tai = np.array([r.ut1_utc - tai_meno_utc(r.mjd) for r in righe if r.anno >= 1972])
    return mjd, ut1_tai


def ut1_da_utc(jd_utc: float) -> float:
    """UT1 dall'UTC di Horizons: correzione C04 dal 1972 al termine della serie, poi ultimo valore."""
    mjd_q = jd_utc - 2400000.5
    mjd, ut1_tai = serie_c04_completa()
    if mjd_q < mjd[0]:
        return jd_utc
    if mjd_q > mjd[-1]:
        dut1 = float(ut1_tai[-1] + tai_meno_utc(mjd[-1]))
    else:
        dut1 = float(np.interp(mjd_q, mjd, ut1_tai) + tai_meno_utc(mjd_q))
    return jd_utc + dut1 / GIORNO_S


# ======================================================================================
# Sole, stagioni, angolo orario (validazione; algoritmi identici al runtime)
# ======================================================================================


def matrice_j2000_a_data(epj: float) -> NDArray[np.float64]:
    """Eclittica J2000 → eclittica ed equinozio della data: (R_x(ε0)·LTECMᵀ)ᵀ."""
    return np.asarray(erfa.rx(cst.OBLIQUITA_J2000_RAD, erfa.ltecm(epj).T)).T


def longitudine_sole(r_terra: NDArray[np.float64], jd_tt: float) -> float:
    """Longitudine geometrica geocentrica del Sole sull'eclittica e sull'equinozio medi della data (rad, [0, 2π))."""
    s = matrice_j2000_a_data(float(epj_da_jd(jd_tt))) @ (-np.asarray(r_terra[:3]))
    return float(np.mod(math.atan2(s[1], s[0]), DUE_PI))


def declinazione_sole(r_terra: NDArray[np.float64], jd_tt: float) -> float:
    """Declinazione geometrica del Sole sull'equatore medio della data (rad)."""
    s_icrf = MATRICE_ICRF_A_ECLITTICA.T @ (-np.asarray(r_terra[:3]))
    s = np.asarray(erfa.ltpb(float(epj_da_jd(jd_tt)))) @ s_icrf
    return math.asin(s[2] / np.linalg.norm(s))


def ascensione_retta_sole(r_terra: NDArray[np.float64], jd_tt: float) -> float:
    """Ascensione retta geometrica del Sole sull'equatore e sull'equinozio medi della data (rad)."""
    s_icrf = MATRICE_ICRF_A_ECLITTICA.T @ (-np.asarray(r_terra[:3]))
    s = np.asarray(erfa.ltpb(float(epj_da_jd(jd_tt)))) @ s_icrf
    return float(np.mod(math.atan2(s[1], s[0]), DUE_PI))


def longitudine_subsolare(r_terra: NDArray[np.float64], jd_ut1: float, jd_tt: float) -> float:
    """Longitudine est del punto subsolare (rad, (-π, π]) dalla matrice di orientamento."""
    m = orientamento_terra(jd_ut1, jd_tt)
    s = m.T @ (-np.asarray(r_terra[:3]))
    return math.atan2(s[1], s[0])


def longitudine_media_sole(jd_tt: float) -> float:
    """L0 = 280,46646° + 36 000,76983°·T + 0,0003032°·T² (Meeus 1998, eq. 25.2; T secoli da J2000 TT), rad."""
    t = (jd_tt - cst.J2000) / 36525.0
    return math.radians(280.46646 + 36000.76983 * t + 0.0003032 * t * t)


def longitudine_media_sole_vsop(jd_tt: float) -> float:
    """L0 di Meeus (1998), eq. 28.2 (VSOP87, termini fino a τ⁵), rad; solo per confronto."""
    tau = (jd_tt - cst.J2000) / 365250.0
    gradi = (
        280.4664567
        + 360007.6982779 * tau
        + 0.03032028 * tau**2
        + tau**3 / 49931.0
        - tau**4 / 15300.0
        - tau**5 / 2000000.0
    )
    return math.radians(gradi)


def equazione_del_tempo(r_terra: NDArray[np.float64], jd_tt: float, l0=longitudine_media_sole) -> float:
    """E = L0 - α (rad, (-π, π]), α geometrica media della data (Meeus 1998, eq. 28.1 senza aberrazione e nutazione)."""
    e = l0(jd_tt) - ascensione_retta_sole(r_terra, jd_tt)
    return float(_riduci(np.asarray(e)))


def nutazione_longitudine(jd_tt: float) -> float:
    """Δψ (rad), IAU 2000B (McCarthy e Luzum 2003; ERFA eraNut00b), come src/time/nutation.ts."""
    return float(erfa.nut00b(jd_tt, 0.0)[0])


def _date_apparente(stato: NDArray[np.float64], jd_tt: float) -> tuple[NDArray[np.float64], NDArray[np.float64], float]:
    """r (Sole - Terra), v (Sole rispetto alla Terra) sull'eclittica e sull'equinozio medi della data e longitudine
    apparente (rad, [0, 2π)): direzione -r + (|r|/c)·v_Terra più Δψ, come src/time/seasons.ts."""
    m = matrice_j2000_a_data(float(epj_da_jd(jd_tt)))
    r = m @ (-np.asarray(stato[:3]))
    v = m @ (-np.asarray(stato[3:6]))
    tau = float(np.linalg.norm(r)) / cst.C_KM_S
    lam = math.atan2(r[1] - tau * v[1], r[0] - tau * v[0]) + nutazione_longitudine(jd_tt)
    return r, v, float(np.mod(lam, DUE_PI))


def stagione_kepler(stato: NDArray[np.float64], jd_tt: float) -> dict:
    """Stagione astronomica come src/time/seasons.ts senza fornitore: quadrante della longitudine apparente e stima
    kepleriana dell'istante dell'evento."""
    r, v, lam = _date_apparente(stato, jd_tt)
    q = min(int(lam // (math.pi / 2)), 3)
    lam_geo = math.atan2(r[1], r[0])
    delta = lam - q * math.pi / 2
    mu = cst.MU_ELIO[3]
    rr = float(np.linalg.norm(r))
    v2 = float(np.dot(v, v))
    ev = ((v2 - mu / rr) * r - float(np.dot(r, v)) * v) / mu
    e = math.hypot(ev[0], ev[1])
    perigeo = math.atan2(ev[1], ev[0])
    a = 1.0 / (2.0 / rr - v2 / mu)
    n = math.sqrt(mu / a**3) * GIORNO_S

    def anomalia_media(nu: float) -> float:
        ecc = 2.0 * math.atan(math.sqrt((1.0 - e) / (1.0 + e)) * math.tan(nu / 2.0))
        return ecc - e * math.sin(ecc)

    dm = anomalia_media(lam_geo - perigeo) - anomalia_media(lam_geo - delta - perigeo)
    dm -= DUE_PI * round(dm / DUE_PI)
    dm = max(dm, 0.0)
    return {"quadrante": q, "longitudine": lam, "giorniDopo": dm / n, "istanteEvento": jd_tt - dm / n}


def istante_evento(fornitore, q: int, t_stima: float, tolleranza: float = 1e-7) -> float:
    """Istante (JD TT) in cui la longitudine apparente vale q·90°: metodo di Newton da t_stima, come risolviEvento
    di src/time/seasons.ts. fornitore(jd_tt) restituisce lo stato eliocentrico della Terra (eclittica J2000)."""
    obiettivo = q * math.pi / 2
    t = t_stima
    for _ in range(8):
        r, v, lam = _date_apparente(fornitore(t), t)
        d = lam - obiettivo
        d -= DUE_PI * round(d / DUE_PI)
        passo = d / ((r[0] * v[1] - r[1] * v[0]) / (r[0] * r[0] + r[1] * r[1]) * GIORNO_S)
        t -= passo
        if abs(passo) < tolleranza:
            break
    return t


def stagione_vera(de, jd_tt: float) -> dict:
    """Quadrante e giorni dall'evento con gli stati DE441 della Terra (metodo di Newton sull'istante)."""
    stima = stagione_kepler(de.stato_eliocentrico(399, jd_tt), jd_tt)
    t = istante_evento(lambda x: de.stato_eliocentrico(399, x), stima["quadrante"], stima["istanteEvento"], 1e-9)
    return {
        "quadrante": stima["quadrante"],
        "longitudine": stima["longitudine"],
        "giorniDopo": jd_tt - t,
        "istanteEvento": t,
    }


# Istanti ufficiali di equinozi e solstizi (UT, al minuto): USNO, Astronomical Applications API, "Earth's Seasons",
# https://aa.usno.navy.mil/api/seasons?year=2023 (2024, 2025, 2026), consultata il 19/10/2026. Per evento:
# quadrante della stagione che si apre (0 primavera, 1 estate, 2 autunno, 3 inverno), anno, mese, giorno, ora, minuto.
URL_USNO_STAGIONI = "https://aa.usno.navy.mil/api/seasons?year="
EVENTI_USNO = (
    (3, 2023, 12, 22, 3, 27),
    (0, 2024, 3, 20, 3, 6),
    (1, 2024, 6, 20, 20, 51),
    (2, 2024, 9, 22, 12, 44),
    (3, 2024, 12, 21, 9, 20),
    (0, 2025, 3, 20, 9, 1),
    (1, 2025, 6, 21, 2, 42),
    (2, 2025, 9, 22, 18, 19),
    (3, 2025, 12, 21, 15, 3),
    (0, 2026, 3, 20, 14, 46),
    (1, 2026, 6, 21, 8, 24),
    (2, 2026, 9, 23, 0, 5),
    (3, 2026, 12, 21, 20, 50),
)


def validazione_eventi_usno(de) -> dict:
    """Istanti degli eventi con la longitudine apparente su DE441 contro USNO (UT al minuto)."""
    m = costruisci_modello()
    righe = []
    for q, anno, mese, giorno, ora, minuto in EVENTI_USNO:
        ut = calendario_a_jd(anno, mese, giorno, ora, minuto, 0, "gregoriano")
        tt = ut + m.delta_t(ut) / GIORNO_S
        t = istante_evento(lambda x: de.stato_eliocentrico(399, x), q, tt, 1e-9)
        t_ut = ut_da_tt(m, t)
        righe.append(
            {
                "evento": "equinozio" if q % 2 == 0 else "solstizio",
                "quadrante": q,
                "usnoUT": ut,
                "istanteTT": t,
                "istanteUT": t_ut,
                "scartoMinuti": (t_ut - ut) * 1440.0,
            }
        )
    scarti = np.array([r["scartoMinuti"] for r in righe])
    return {"fonte": URL_USNO_STAGIONI, "righe": righe, "maxAss_minuti": float(np.max(np.abs(scarti)))}


# ======================================================================================
# Validazione (§ 6.4, § 6.5, § 7.7, A3, A8, A9)
# ======================================================================================

SOLSTIZIO_2024_UT = calendario_a_jd(2024, 6, 20, 20, 51, 0, "gregoriano")


def controlli_delta_t(m: ModelloDeltaT) -> dict:
    eps = 1e-9
    jd_min = cst.JD_MIN_UT
    y = {
        "dT_meno720": m.da_anno(-720.0),
        "dT_meno9999_0101": m.delta_t(jd_min),
        "dT_2120": m.da_anno(2120.0),
        "dT_2120_1231": m.delta_t(cst.JD_MAX_UT_EXCL),
        "delta": m.pre_delta,
        "yObs": m.y_obs,
        "dTObs": m.dt_obs,
        "salto_meno720": m.da_anno(-720.0) - m.da_anno(-720.0 - eps),
        "salto_2019": m.da_anno(2019.0) - m.da_anno(2019.0 - eps),
        "salto_2020": m.da_anno(2020.0) - m.da_anno(2020.0 - eps),
        "salto_yObs": m.da_anno(m.y_obs + eps) - m.da_anno(m.y_obs),
        "pendenza_parabola_meno720": (m.parabola(-720.0) - m.parabola(-721.0)),
        "pendenza_s15_meno720": (m.s15(-719.0) - m.s15(-720.0)),
        "parabola_SMH2016_meno9999": -320.0 + 32.5 * ((float(anno_giuliano(jd_min)) - 1825) / 100) ** 2,
        "sigma_meno9999": m.sigma_da_anno(-9999.0),
        "sigma_meno9999_0101": m.sigma(jd_min),
        "sigma_meno5000": m.sigma_da_anno(-5000.0),
        "sigma_meno3000": m.sigma_da_anno(-3000.0),
        "sigma_meno1000": m.sigma_da_anno(-1000.0),
        "sigma_2120": m.sigma_da_anno(2120.0),
        "sigma_1200": m.sigma_da_anno(1200.0),
        "sigma_1700": m.sigma_da_anno(1700.0),
        "sigma_1825": m.sigma_da_anno(1825.0),
        "sigma_1950": m.sigma_da_anno(1950.0),
        "sigma_1964_5": m.sigma_da_anno(1964.5),
        "sigma_1971_5": m.sigma_da_anno(1971.5),
        "sigma_2000": m.sigma_da_anno(2000.0),
        "sigma_yObs": m.sigma_da_anno(m.y_obs),
        "sigma_2026_10_19": m.sigma(2461332.5),
        "sigma_2027": m.sigma_da_anno(2027.0),
        "sigma_2030": m.sigma_da_anno(2030.0),
        "sigma_2050": m.sigma_da_anno(2050.0),
        "ttMin": cst.JD_MIN_UT + m.delta_t(cst.JD_MIN_UT) / GIORNO_S,
        "ttMaxEscl": cst.JD_MAX_UT_EXCL + m.delta_t(cst.JD_MAX_UT_EXCL) / GIORNO_S,
    }
    # anno in cui 15°/h·σ supera 90° (§ 7.7)
    anni = np.arange(-9999.0, 2121.0, 1.0)
    sig = np.array([m.sigma_da_anno(a) for a in anni])
    sopra = anni[sig > SIGMA_INDETERMINAZIONE_S]
    y["annoIndeterminazione"] = float(sopra.max()) if sopra.size else None
    return y


def leggi_deltat_storico() -> list[tuple[float, float]]:
    """(anno, ΔT in s) dalla tabella storica USNO congelata."""
    out = []
    for riga in FILE_DELTAT_STORICO.read_text(encoding="utf-8").splitlines():
        c = riga.split()
        try:
            out.append((float(c[0]), float(c[1])))
        except (IndexError, ValueError):
            continue
    return out


def confronto_usno_storico(m: ModelloDeltaT) -> dict:
    """Scarto della S15.2020 dalla tabella storica USNO per tratti (giustifica σ_S15 del 1962-1971 prima del 1962)."""
    valori = leggi_deltat_storico()
    out = {"fonte": URL_DELTAT_STORICO}
    for da, a in ((1900.0, 1962.0), (1962.0, 1972.0), (1972.0, 1985.0)):
        d = np.asarray([m.da_anno(y) - v for y, v in valori if da <= y < a])
        out[f"{da:.0f}-{a:.0f}"] = {
            "n": int(d.size),
            "rms_s": float(np.sqrt(np.mean(d * d))),
            "maxAss_s": float(np.max(np.abs(d))),
            "sigmaModello_s": m.sigma_da_anno(0.5 * (da + a)),
        }
    return out


ORIZZONTI_DERIVA_GIORNI = (7, 30, 90, 365, 1826, 3652)


def prova_deriva(m: ModelloDeltaT, righe: list[RigaC04], passo: int = 10, da: float = 1975.0) -> dict:
    """Prova retrospettiva della σ dopo y_obs sulla serie giornaliera C04: da ogni istante t0 (ogni `passo` giorni
    dal `da`) ΔT(t0) + c·N² con σ = max(σ_IERS, H(N), 365,25·N·LOD_rms(t0)), LOD_rms dei GIORNI_LOD giorni
    precedenti; frazione degli scarti da C04 entro 1σ e 2σ per orizzonte."""
    mjd = np.asarray([r.mjd for r in righe])
    dt = np.asarray([TT_MENO_TAI + tai_meno_utc(r.mjd) - r.ut1_utc for r in righe])
    lod = np.asarray([r.lod for r in righe])
    anni = anno_giuliano(mjd + 2400000.5)
    inizio = int(max(np.searchsorted(anni, da), GIORNI_LOD))
    out = {}
    for h in ORIZZONTI_DERIVA_GIORNI:
        q = []
        for i in range(inizio, len(righe) - h, passo):
            n = h / 365.25
            rms = math.sqrt(float(np.mean(lod[i - GIORNI_LOD + 1 : i + 1] ** 2)))
            sigma = max(m.sigma_iers, m.huber(n), 365.25 * n * rms)
            q.append(abs(dt[i + h] - dt[i] - m.c_futuro * n * n) / sigma)
        a = np.asarray(q)
        out[str(h)] = {
            "n": int(a.size),
            "entro1Sigma": float(np.mean(a <= 1.0)),
            "entro2Sigma": float(np.mean(a <= 2.0)),
            "mediana": float(np.median(a)),
            "max": float(np.max(a)),
        }
    return out


def confronto_horizons_tdb_ut(m: ModelloDeltaT) -> list[dict]:
    out = []
    for jd, dt_h in leggi_tdb_ut():
        y = float(anno_giuliano(jd))
        nostro = m.delta_t(jd)
        voce = {"anno": y, "jdUT": jd, "horizons": dt_h, "modello": nostro, "differenza": nostro - dt_h}
        if 1972.0 <= y <= float(anno_giuliano(serie_c04_completa()[0][-1] + 2400000.5)):
            # dopo il 1962 Horizons dà TDB - UTC: ΔT di Horizons in UT1 = (TDB - UTC) - (UT1 - UTC)
            dut1 = (ut1_da_utc(jd) - jd) * GIORNO_S
            voce["horizonsUt1"] = dt_h - dut1
            voce["differenzaUt1"] = m.delta_t(ut1_da_utc(jd)) - voce["horizonsUt1"]
        out.append(voce)
    return out


def controlli_eo() -> dict:
    tab = tabella_eo()
    m = costruisci_modello()
    out: dict = {"sJ2000": tab.s_j2000, "nodi": int(tab.tempi.size)}
    differenze = {}
    for anno in (-10000.0, -9999.0, -5000.0, -2000.0, 0.0, 1000.0, 1600.0, 2000.0, 2100.0, 2200.0):
        jd_tt = float(jd_da_anno(anno))
        jd_ut = ut_da_tt(m, jd_tt)
        d = _riduci(np.asarray(gst_diretto(jd_ut, jd_tt) - gmst06(jd_ut, jd_tt)))
        differenze[str(anno)] = float(d) * GRADI
    out["gstMenoGmst06_gradi"] = differenze
    # Hermite contro valori diretti a metà tra i nodi
    rng = np.random.default_rng(20261033)
    t = np.sort(rng.uniform(cst.T0, cst.T_END, 300))
    diretti = np.array([eo_diretta(x) for x in t])
    interp = tab.interpola(t)
    out["erroreInterpolazioneMax_rad"] = float(np.max(np.abs(_riduci(interp - diretti))))
    # massimo scarto 1600-2200 su 300 epoche
    rng = np.random.default_rng(20261034)
    anni = rng.uniform(1600.0, 2200.0, 300)
    scarti = []
    for a in anni:
        jd_tt = float(jd_da_anno(a))
        jd_ut = ut_da_tt(m, jd_tt)
        scarti.append(float(_riduci(np.asarray(gst_diretto(jd_ut, jd_tt) - gmst06(jd_ut, jd_tt)))) * GRADI)
    out["gstMenoGmst06_1600_2200_maxAss_gradi"] = float(np.max(np.abs(scarti)))
    anni = np.linspace(0.0, 2121.0, 200)
    scarti = []
    for a in anni:
        jd_tt = float(jd_da_anno(a))
        jd_ut = ut_da_tt(m, jd_tt)
        scarti.append(float(_riduci(np.asarray(gst_diretto(jd_ut, jd_tt) - gmst06(jd_ut, jd_tt)))) * GRADI)
    out["gstMenoGmst06_0_2121_maxAss_gradi"] = float(np.max(np.abs(scarti)))
    return out


def validazione_subsolare(de) -> dict:
    m = costruisci_modello()
    righe = []
    for h in leggi_subsolari_horizons():
        jd_ut1 = ut1_da_utc(h["jdUT"])
        jd_tt = jd_ut1 + m.delta_t(jd_ut1) / GIORNO_S
        r = de.stato_eliocentrico(399, jd_tt)
        lon = longitudine_subsolare(r, jd_ut1, jd_tt) * GRADI
        d = (lon - h["lonSubsolare"] + 180.0) % 360.0 - 180.0
        righe.append({**h, "jdUT1": jd_ut1, "jdTT": jd_tt, "stato": r, "lon": lon, "differenza": d})
    diff = np.array([r["differenza"] for r in righe])
    return {"righe": righe, "maxAss_gradi": float(np.max(np.abs(diff))), "media_gradi": float(np.mean(diff))}


SEME_ORARIO = 20261035


def epoche_mezzogiorno(n: int = 200) -> list[float]:
    """Giorni a 12:00 UT1 uniformi nell'intervallo, estremi inclusi (seme fisso)."""
    rng = np.random.default_rng(SEME_ORARIO)
    z = rng.integers(int(cst.JD_MIN_UT + 0.5), int(cst.JD_MAX_UT_EXCL - 0.5), n - 2)
    giorni = [int(cst.JD_MIN_UT + 0.5), *sorted(int(x) for x in z), int(cst.JD_MAX_UT_EXCL - 0.5) - 1]
    return [float(g) for g in giorni]


def validazione_angolo_orario(de, n: int = 200) -> dict:
    """A8: angolo orario del Sole alle 12:00 UT1 = E - 0,9856°·ΔT[d] entro 1°."""
    m = costruisci_modello()
    righe = []
    for jd_ut in epoche_mezzogiorno(n):
        dt = m.delta_t(jd_ut)
        jd_tt = jd_ut + dt / GIORNO_S
        r = de.stato_eliocentrico(399, jd_tt)
        h = float(_riduci(np.asarray(gst_tabella(jd_ut, jd_tt) - ascensione_retta_sole(r, jd_tt)))) * GRADI
        e = equazione_del_tempo(r, jd_tt) * GRADI
        atteso = e - 0.9856 * dt / GIORNO_S
        d = (h - atteso + 180.0) % 360.0 - 180.0
        e_vsop = equazione_del_tempo(r, jd_tt, longitudine_media_sole_vsop) * GRADI
        d_vsop = (h - (e_vsop - 0.9856 * dt / GIORNO_S) + 180.0) % 360.0 - 180.0
        righe.append(
            {
                "jdUT1": jd_ut,
                "jdTT": jd_tt,
                "deltaT": dt,
                "stato": r,
                "angoloOrario": h,
                "E": e,
                "differenza": d,
                "differenzaL0Vsop": d_vsop,
            }
        )
    diff = np.array([r["differenza"] for r in righe])
    diff_vsop = np.array([r["differenzaL0Vsop"] for r in righe])
    return {
        "righe": righe,
        "maxAss_gradi": float(np.max(np.abs(diff))),
        "maxAssL0Vsop_gradi": float(np.max(np.abs(diff_vsop))),
    }


def validazione_solstizio(de) -> dict:
    """A9: massimo della declinazione geometrica sull'equatore medio della data vicino al 20/06/2024 20:51 UT."""
    m = costruisci_modello()
    dt = m.delta_t(SOLSTIZIO_2024_UT)
    centro_tt = SOLSTIZIO_2024_UT + dt / GIORNO_S
    t = centro_tt + np.arange(-1440, 1441) / 1440.0  # ±1 d al minuto
    stati = de.stato_eliocentrico(399, t)
    dec = np.array([declinazione_sole(s, x) for s, x in zip(stati, t, strict=True)])
    i = int(np.argmax(dec))
    # vertice della parabola sui tre punti attorno al massimo
    y0, y1, y2 = dec[i - 1], dec[i], dec[i + 1]
    frazione = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)
    t_max_tt = float(t[i] + frazione / 1440.0)
    dec_max = float(y1 - 0.25 * (y0 - y2) * frazione)
    t_max_ut = ut_da_tt(m, t_max_tt)
    eps = obliquita_media(float(epj_da_jd(t_max_tt)))
    lam = longitudine_sole(de.stato_eliocentrico(399, t_max_tt), t_max_tt)
    return {
        "istanteMassimoUT": t_max_ut,
        "scartoMinuti": (t_max_ut - SOLSTIZIO_2024_UT) * 1440.0,
        "declinazioneMassima_gradi": dec_max * GRADI,
        "obliquitaMedia_gradi": eps * GRADI,
        "differenza_gradi": (dec_max - eps) * GRADI,
        "longitudineAlMassimo_gradi": lam * GRADI,
        "deltaT": dt,
    }


SEME_STAGIONI = 20261036


def epoche_stagioni(n: int = 200) -> list[float]:
    rng = np.random.default_rng(SEME_STAGIONI)
    tt_min = cst.JD_MIN_UT + 0.1
    tt_max = cst.JD_MAX_UT_EXCL
    return [float(x) for x in np.sort(rng.uniform(tt_min, tt_max, n))]


def validazione_stagioni(de, n: int = 200) -> dict:
    righe = []
    for jd_tt in epoche_stagioni(n):
        vero = stagione_vera(de, jd_tt)
        stato = de.stato_eliocentrico(399, jd_tt)
        stima = stagione_kepler(stato, jd_tt)
        righe.append(
            {
                "jdTT": jd_tt,
                "stato": stato,
                "quadrante": vero["quadrante"],
                "quadranteStima": stima["quadrante"],
                "longitudine": vero["longitudine"],
                "giorniDopo": vero["giorniDopo"],
                "giorniDopoStima": stima["giorniDopo"],
                "differenza": stima["giorniDopo"] - vero["giorniDopo"],
                "nutazione": nutazione_longitudine(jd_tt),
            }
        )
    diff = np.array([r["differenza"] for r in righe])
    return {
        "righe": righe,
        "maxAss_giorni": float(np.max(np.abs(diff))),
        "quadrantiDiversi": sum(r["quadrante"] != r["quadranteStima"] for r in righe),
    }


def valida(con_de441: bool = True) -> dict:
    m = costruisci_modello()
    out: dict = {"deltaT": controlli_delta_t(m), "eo": controlli_eo(), "usnoStorico": confronto_usno_storico(m)}
    completa = CARTELLA_CACHE_TEMPO / NOME_C04
    if completa.exists():
        out["provaDeriva"] = prova_deriva(m, leggi_c04(completa.read_text(encoding="utf-8")))
    if horizons_congelato():
        out["horizonsTdbUt"] = confronto_horizons_tdb_ut(m)
    if con_de441:
        from common.de441 import De441

        with De441() as de:
            ss = validazione_subsolare(de)
            ao = validazione_angolo_orario(de)
            so = validazione_solstizio(de)
            st = validazione_stagioni(de, 2000)
            us = validazione_eventi_usno(de)
        out["subsolare"] = {"maxAss_gradi": ss["maxAss_gradi"], "media_gradi": ss["media_gradi"], "n": len(ss["righe"])}
        out["angoloOrario"] = {
            "maxAss_gradi": ao["maxAss_gradi"],
            "maxAssL0Vsop_gradi": ao["maxAssL0Vsop_gradi"],
            "n": len(ao["righe"]),
        }
        out["solstizio2024"] = so
        out["stagioni"] = {"maxAss_giorni": st["maxAss_giorni"], "quadrantiDiversi": st["quadrantiDiversi"], "n": 2000}
        out["eventiUsno"] = us
    return out


# ======================================================================================
# Fixture (tests/fixtures/time/)
# ======================================================================================

SEME_FIXTURE_DT = 20261037
SEME_FIXTURE_ROT = 20261038


def _lista(x: ArrayLike) -> list[float]:
    return [float(v) for v in np.asarray(x, dtype=np.float64).ravel()]


def _scrivi_fixture(nome: str, dati: dict, cartella: Path) -> Path:
    cartella.mkdir(parents=True, exist_ok=True)
    p = cartella / nome
    p.write_text(json.dumps(dati, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


def fixture_delta_t(m: ModelloDeltaT) -> dict:
    rng = np.random.default_rng(SEME_FIXTURE_DT)
    casuali = rng.uniform(cst.JD_MIN_UT - 30.0, cst.JD_MAX_UT_EXCL + 30.0, 400)
    speciali = [cst.JD_MIN_UT, cst.JD_MAX_UT_EXCL, cst.T0, cst.T_END, cst.J2000]
    for y in [*m.s15_nodi[:, 0], m.s15_nodi[-1, 1], *m.iers_anni, m.y_obs, -9999.0, -5000.0, -3000.0, -1000.0]:
        jd = float(jd_da_anno(y))
        speciali += [jd, jd - 1e-6, jd + 1e-6]
    for y in (2019.0, 2020.0, -720.0, -500.0, 2120.0, *RACCORDO_SIGMA_S15):
        jd = float(jd_da_anno(y))
        speciali += [jd, jd - 1e-6, jd + 1e-6, jd - 0.5, jd + 0.5]
    jd_ut = sorted({float(x) for x in [*speciali, *casuali]})
    casi = [{"jdUT": j, "deltaT": m.delta_t(j), "sigma": m.sigma(j)} for j in jd_ut]
    tt = [cst.JD_MIN_UT, cst.T0 + 10.0, cst.J2000, cst.T_END - 30.0, *rng.uniform(cst.T0 + 10.0, cst.T_END - 30.0, 100)]
    inversi = [{"jdTT": float(t), "jdUT": ut_da_tt(m, float(t))} for t in sorted(tt)]
    return {
        "descrizione": "ΔT e σ(ΔT) del § 6.4-6.5 calcolati da scripts/pipeline/time_model.py",
        "generatore": "scripts/pipeline/time_model.py fixture",
        "seme": SEME_FIXTURE_DT,
        "unita": {"jd": "giorni", "deltaT": "s", "sigma": "s"},
        "tolleranzaSuggerita_s": 1e-6,
        "controlli": controlli_delta_t(m),
        "casi": casi,
        "inversi": inversi,
    }


def fixture_rotazione(m: ModelloDeltaT) -> dict:
    tab = tabella_eo()
    rng = np.random.default_rng(SEME_FIXTURE_ROT)
    ut = [
        cst.JD_MIN_UT,
        *np.sort(rng.uniform(cst.JD_MIN_UT, cst.JD_MAX_UT_EXCL, 197)),
        cst.J2000,
        cst.JD_MAX_UT_EXCL - 1e-3,
    ]
    casi = []
    for jd_ut in ut:
        jd_ut = float(jd_ut)
        jd_tt = jd_ut + m.delta_t(jd_ut) / GIORNO_S
        casi.append(
            {
                "jdUT": jd_ut,
                "jdTT": jd_tt,
                "era": era(jd_ut),
                "eoDiretta": eo_diretta(jd_tt),
                "eoTabella": float(tab.interpola(jd_tt)[0]),
                "gst": gst_diretto(jd_ut, jd_tt),
                "gmst06": gmst06(jd_ut, jd_tt),
            }
        )
    # 1600-2121 per il confronto con gmst06 ≤ 0,001°
    moderni = []
    for y in np.sort(rng.uniform(1600.0, 2121.0, 60)):
        jd_tt = float(jd_da_anno(y))
        jd_ut = ut_da_tt(m, jd_tt)
        moderni.append({"jdUT": jd_ut, "jdTT": jd_tt, "gmst06": gmst06(jd_ut, jd_tt)})
    # inizio dei dati (-9999,66) e -10000 (fuori dalla tabella, solo Python)
    remoti = []
    for jd_tt in (cst.T0, float(jd_da_anno(-10000.0))):
        jd_ut = ut_da_tt(m, jd_tt)
        remoti.append({"jdUT": jd_ut, "jdTT": jd_tt, "gmst06": gmst06(jd_ut, jd_tt), "gst": gst_diretto(jd_ut, jd_tt)})
    matrici = []
    for c in casi[::10]:
        matrici.append(
            {"jdUT": c["jdUT"], "jdTT": c["jdTT"], "matrice": _lista(orientamento_terra(c["jdUT"], c["jdTT"]))}
        )
    return {
        "descrizione": "ERA (eraEra00), EO (eraEors, CIO integrato lungo il polo di Vondrák), GST = ERA - EO, gmst06",
        "generatore": "scripts/pipeline/time_model.py fixture",
        "riferimento": f"pyerfa {erfa.__version__}",
        "seme": SEME_FIXTURE_ROT,
        "unita": {"jd": "giorni", "angoli": "rad", "matrice": "3x3 per righe, corpo -> eclittica J2000"},
        "casi": casi,
        "moderni": moderni,
        "remoti": remoti,
        "matrici": matrici,
    }


def _stato(x: ArrayLike) -> list[float]:
    return _lista(x)


def fixture_sole(de) -> dict:
    ss = validazione_subsolare(de)
    ao = validazione_angolo_orario(de)
    so = validazione_solstizio(de)
    m = costruisci_modello()
    dt = m.delta_t(SOLSTIZIO_2024_UT)
    centro_tt = SOLSTIZIO_2024_UT + dt / GIORNO_S
    t = centro_tt + np.arange(-48, 49) * (15.0 / 1440.0)  # ±12 h ogni 15 min
    stati = de.stato_eliocentrico(399, t)
    return {
        "descrizione": "Stati eliocentrici DE441 della Terra (eclittica J2000, km e km/s) per A8 e A9",
        "generatore": "scripts/pipeline/time_model.py fixture",
        "sorgenteStati": "DE441 (de441_part-1.bsp, de441_part-2.bsp), NAIF 399 rispetto a 10",
        "subsolare": {
            "fonte": "JPL Horizons: RA apparente geocentrica del Sole e TSL apparente a Greenwich (raw/time/horizons/)",
            "seme": SEME_SUBSOLARE,
            "maxAssPython_gradi": ss["maxAss_gradi"],
            "casi": [
                {"jdUT1": r["jdUT1"], "jdTT": r["jdTT"], "stato": _stato(r["stato"]), "lonHorizons": r["lonSubsolare"]}
                for r in ss["righe"]
            ],
        },
        "angoloOrario": {
            "seme": SEME_ORARIO,
            "maxAssPython_gradi": ao["maxAss_gradi"],
            "casi": [
                {
                    "jdUT1": r["jdUT1"],
                    "jdTT": r["jdTT"],
                    "deltaT": r["deltaT"],
                    "stato": _stato(r["stato"]),
                    "E": r["E"],
                }
                for r in ao["righe"]
            ],
        },
        "solstizio": {
            "istanteAttesoUT": SOLSTIZIO_2024_UT,
            "deltaT": dt,
            "python": so,
            "tempiTT": _lista(t),
            "stati": [_stato(s) for s in stati],
        },
    }


def fixture_stagioni(de) -> dict:
    st = validazione_stagioni(de)
    us = validazione_eventi_usno(de)
    return {
        "descrizione": (
            "Stagione astronomica: quadrante della longitudine apparente del Sole, giorni dall'evento (DE441), "
            "stima kepleriana, nutazione IAU 2000B (pyerfa nut00b); istanti USNO 2024-2026"
        ),
        "generatore": "scripts/pipeline/time_model.py fixture",
        "seme": SEME_STAGIONI,
        "maxAssPython_giorni": st["maxAss_giorni"],
        "casi": [
            {
                "jdTT": r["jdTT"],
                "stato": _stato(r["stato"]),
                "quadrante": r["quadrante"],
                "longitudine": r["longitudine"],
                "giorniDopo": r["giorniDopo"],
                "giorniDopoStima": r["giorniDopoStima"],
                "nutazione": r["nutazione"],
            }
            for r in st["righe"]
        ],
        "eventiUsno": {
            "fonte": us["fonte"],
            "maxAssPython_minuti": us["maxAss_minuti"],
            "eventi": [
                {"evento": r["evento"], "quadrante": r["quadrante"], "usnoUT": r["usnoUT"], "istanteTT": r["istanteTT"]}
                for r in us["righe"]
            ],
        },
    }


def genera_fixture(cartella: Path = CARTELLA_FIXTURE, con_de441: bool = True) -> list[Path]:
    m = costruisci_modello()
    out = [
        _scrivi_fixture("deltaT.json", fixture_delta_t(m), cartella),
        _scrivi_fixture("rotazione.json", fixture_rotazione(m), cartella),
    ]
    if con_de441:
        from common.de441 import De441

        with De441() as de:
            out.append(_scrivi_fixture("sole.json", fixture_sole(de), cartella))
            out.append(_scrivi_fixture("stagioni.json", fixture_stagioni(de), cartella))
    return out


# ======================================================================================
# Catalogo
# ======================================================================================


def frammento_catalogo() -> dict:
    return {
        "formato": 1,
        "area": "tempo",
        "corpi": {
            "terra": {
                "orientamento": {
                    "modello": "vondrak",
                    "coefficienti": None,
                    "convenzionePolo": "nord-IAU",
                    "indicativo": False,
                }
            }
        },
    }


def scrivi_catalogo(percorso: Path = CARTELLA_OUT / "catalog-tempo.json") -> Path:
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(json.dumps(frammento_catalogo(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return percorso


def _serializzabile(x):
    if isinstance(x, dict):
        return {k: _serializzabile(v) for k, v in x.items()}
    if isinstance(x, list | tuple):
        return [_serializzabile(v) for v in x]
    if isinstance(x, np.ndarray):
        return _lista(x)
    if isinstance(x, np.floating | np.integer):
        return x.item()
    return x


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("comando", choices=["sorgenti", "genera", "horizons", "valida", "fixture", "catalogo"])
    ap.add_argument("--offline", action="store_true", help="usa solo i dati congelati e la cache")
    a = ap.parse_args(argv)
    if a.comando == "sorgenti":
        print(json.dumps(congela_sorgenti(a.offline), ensure_ascii=False, indent=1))
    elif a.comando == "genera":
        print(genera())
    elif a.comando == "horizons":
        congela_horizons(a.offline)
        print(CARTELLA_HORIZONS)
    elif a.comando == "valida":
        esito = _serializzabile(valida())
        p = CARTELLA_OUT / "validazione-tempo.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(esito, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(json.dumps({k: v for k, v in esito.items() if k != "horizonsTdbUt"}, ensure_ascii=False, indent=1))
    elif a.comando == "fixture":
        for p in genera_fixture():
            print(p)
    elif a.comando == "catalogo":
        print(scrivi_catalogo())
    return 0


if __name__ == "__main__":
    sys.exit(main())
