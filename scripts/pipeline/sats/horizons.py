"""Interrogazioni JPL Horizons (https://ssd-api.jpl.nasa.gov/doc/horizons.html) per i satelliti.

Richieste sequenziali con pausa di 1 s e ripetizione su errore; risposte congelate in raw/sats/horizons/.
- vettori planetocentrici geometrici (VECTORS, eclittica J2000, km e km/s, TDB) per la validazione A6;
- tabella osservativa di Eris (RA/Dec astrometriche ICRF e distanza) per la verifica dell'orbita di Disnomia.
"""

from __future__ import annotations

import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

from .kernel import RAW

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
CARTELLA = RAW / "horizons"
PAUSA_S = 1.0
TENTATIVI = 6

_ultima = 0.0


class AssenteOffline(FileNotFoundError):
    """Risposta non congelata e modalità offline attiva."""


def _scarica(url: str) -> bytes:
    global _ultima
    errore: Exception | None = None
    for k in range(TENTATIVI):
        attesa = PAUSA_S - (time.monotonic() - _ultima)
        if attesa > 0:
            time.sleep(attesa)
        try:
            with urllib.request.urlopen(url, timeout=600) as r:
                dati = r.read()
            _ultima = time.monotonic()
            return dati
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            _ultima = time.monotonic()
            errore = e
            time.sleep(min(60.0, 2.0 * 2**k))
    raise OSError(f"richiesta Horizons non riuscita: {errore}")


def _url(parametri: dict[str, str]) -> str:
    return URL + "?" + urllib.parse.urlencode(parametri, quote_via=urllib.parse.quote)


def congelato(nome: str, parametri: dict[str, str], offline: bool) -> str:
    """Risposta testuale congelata in raw/sats/horizons/<nome>.txt (scaricata se assente)."""
    p = CARTELLA / f"{nome}.txt"
    if p.exists():
        return p.read_text(encoding="utf-8")
    if offline:
        raise AssenteOffline(f"risposta non congelata: {p}")
    testo = _scarica(_url(parametri)).decode("utf-8")
    if "$$SOE" not in testo:
        raise OSError(f"risposta Horizons senza dati per {nome}: {testo[:500]}")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(testo, encoding="utf-8")
    return testo


def _tlist(tempi: list[float]) -> str:
    return " ".join(f"'{t:.9f}'" for t in tempi)


def vettori(comando: str, centro: str, tempi_tdb: list[float], nome: str, offline: bool = False) -> np.ndarray:
    """Stati (n, 6) geometrici [km, km/s] nell'eclittica J2000 del corpo rispetto al centro (TDB)."""
    parametri = {
        "format": "text",
        "COMMAND": f"'{comando}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'",
        "CENTER": f"'{centro}'",
        "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'ICRF'",
        "VEC_TABLE": "'2'",
        "VEC_CORR": "'NONE'",
        "OUT_UNITS": "'KM-S'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'TDB'",
        "TLIST_TYPE": "'JD'",
        "TLIST": _tlist(tempi_tdb),
    }
    testo = congelato(nome, parametri, offline)
    blocco = testo[testo.index("$$SOE") + 5 : testo.index("$$EOE")]
    righe = [r for r in blocco.strip().splitlines() if r.strip()]
    out = []
    for r in righe:
        c = [x.strip() for x in r.split(",")]
        out.append([float(c[0])] + [float(x) for x in c[2:8]])
    a = np.array(out)
    if a.shape[0] != len(tempi_tdb) or np.max(np.abs(a[:, 0] - np.array(tempi_tdb))) > 1e-6:
        raise ValueError(f"tempi della risposta Horizons diversi da quelli richiesti: {nome}")
    return a[:, 1:]


_RE_NUM = re.compile(r"[-+]?\d+\.\d+(?:[Ee][-+]?\d+)?")


def osservazioni(comando: str, tempi_ut: list[float], nome: str, offline: bool = False) -> np.ndarray:
    """RA, Dec astrometriche (ICRF, gradi) e distanza geocentrica (UA) agli istanti UT (JD)."""
    parametri = {
        "format": "text",
        "COMMAND": f"'{comando}'",
        "OBJ_DATA": "'YES'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'500@399'",
        "QUANTITIES": "'1,20'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
        "TLIST_TYPE": "'JD'",
        "TLIST": _tlist(tempi_ut),
    }
    testo = congelato(nome, parametri, offline)
    blocco = testo[testo.index("$$SOE") + 5 : testo.index("$$EOE")]
    out = []
    for r in blocco.strip().splitlines():
        c = [x.strip() for x in r.split(",")]
        num = [float(x) for x in c[3:] if _RE_NUM.fullmatch(x)]
        out.append(num[:3])
    return np.array(out)


def percorso(nome: str) -> Path:
    return CARTELLA / f"{nome}.txt"
