"""Interrogazioni JPL Horizons (https://ssd-api.jpl.nasa.gov/doc/horizons.html) per i piccoli corpi.

- elenco dei record per apparizione (DASTCOM) di una cometa periodica: COMMAND='DES=nP;';
- dati di un record (OBJ_DATA): elementi osculanti eliocentrici dell'eclittica J2000 all'epoca, parametri NG;
- vettori geometrici eliocentrici (VECTORS, eclittica J2000, km e km/s, TDB) per la validazione;
- SPK di tipo 21 (EPHEM_TYPE=SPK), consentiti solo tra il 1600 e il 2500.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

from . import rete
from .anagrafica import RAW

CARTELLA = RAW / "horizons"

_RE_RIGA_RECORD = re.compile(r"^\s+(9\d{7})\s+(-?\d+)\s+(\S+)\s+(\S+)\s+(.*?)\s*$")
_RE_NUM = r"([-+]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][-+]?\d+)?)"


def apici(x: str) -> str:
    return f"'{x}'"


def url_elenco_record(designazione: str) -> str:
    return rete.horizons_url(
        {"format": "text", "COMMAND": apici(f"DES={designazione};"), "OBJ_DATA": "'YES'", "MAKE_EPHEM": "'NO'"}
    )


def url_record(record: int) -> str:
    return rete.horizons_url(
        {"format": "text", "COMMAND": apici(f"{record};"), "OBJ_DATA": "'YES'", "MAKE_EPHEM": "'NO'"}
    )


def url_spk(comando: str, inizio: str, fine: str) -> str:
    return rete.horizons_url(
        {
            "format": "json",
            "COMMAND": apici(comando),
            "EPHEM_TYPE": "SPK",
            "OBJ_DATA": "'NO'",
            "START_TIME": apici(inizio),
            "STOP_TIME": apici(fine),
        }
    )


def url_vettori(comando: str, tempi_jd: list[float]) -> str:
    return rete.horizons_url(
        {
            "format": "text",
            "COMMAND": apici(comando),
            "OBJ_DATA": "'YES'",
            "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'VECTORS'",
            "CENTER": "'500@10'",
            "REF_PLANE": "'ECLIPTIC'",
            "REF_SYSTEM": "'ICRF'",
            "VEC_TABLE": "'2'",
            "VEC_CORR": "'NONE'",
            "OUT_UNITS": "'KM-S'",
            "CSV_FORMAT": "'NO'",
            "TIME_TYPE": "'TDB'",
            "TLIST_TYPE": "'JD'",
            "TLIST": " ".join(f"'{t:.6f}'" for t in tempi_jd),
        }
    )


def url_vettori_intervallo(comando: str, inizio_jd: float, fine_jd: float, intervalli: int) -> str:
    """Vettori a passo costante: `intervalli` intervalli uguali tra inizio e fine (TDB)."""
    return rete.horizons_url(
        {
            "format": "text",
            "COMMAND": apici(comando),
            "OBJ_DATA": "'YES'",
            "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'VECTORS'",
            "CENTER": "'500@10'",
            "REF_PLANE": "'ECLIPTIC'",
            "REF_SYSTEM": "'ICRF'",
            "VEC_TABLE": "'2'",
            "VEC_CORR": "'NONE'",
            "OUT_UNITS": "'KM-S'",
            "CSV_FORMAT": "'NO'",
            "TIME_TYPE": "'TDB'",
            "START_TIME": f"'JD {inizio_jd:.6f}'",
            "STOP_TIME": f"'JD {fine_jd:.6f}'",
            "STEP_SIZE": f"'{intervalli}'",
        }
    )


def elenco_record(testo: str) -> list[tuple[int, int]]:
    """(record, anno dell'epoca) dall'elenco di ricerca DASTCOM; vuoto se la ricerca dà un solo oggetto."""
    out = []
    for riga in testo.splitlines():
        m = _RE_RIGA_RECORD.match(riga)
        if m:
            out.append((int(m.group(1)), int(m.group(2))))
    return out


@dataclass
class RecordCometa:
    record: int
    epoca: float  # JD TDB
    e: float
    q_au: float
    tp: float  # JD TDB
    nodo_deg: float
    argperi_deg: float
    inc_deg: float
    ng: dict[str, float] = field(default_factory=dict)  # A1, A2, A3 (au/d^2), DT (d)
    g: dict[str, float] | None = None  # parametri g(r) se non standard
    soluzione: str = ""
    data_soluzione: str | None = None
    n_oss: int | None = None
    arco: tuple[int, int] | None = None
    commenti: list[str] = field(default_factory=list)

    @property
    def ha_ng(self) -> bool:
        return any(self.ng.get(k, 0.0) != 0.0 for k in ("A1", "A2", "A3"))


def _valore(testo: str, chiave: str) -> float | None:
    m = re.search(r"(?<![A-Za-z0-9])" + re.escape(chiave) + r"\s*=\s*" + _RE_NUM, testo)
    if not m:
        return None
    return float(m.group(1).replace("D", "E").replace("d", "e"))


def leggi_record(testo: str) -> RecordCometa:
    """Elementi e parametri NG dai dati dell'oggetto (OBJ_DATA) di un record."""
    m = re.search(r"Rec #:\s*(\d+)", testo)
    if not m:
        raise ValueError("record non trovato nella risposta Horizons")
    rec = int(m.group(1))
    blocco = testo.split("Comet physical")[0]
    vals = {k: _valore(blocco, k) for k in ("EPOCH", "EC", "QR", "TP", "OM", "W", "IN")}
    if any(v is None for v in vals.values()):
        raise ValueError(f"elementi incompleti nel record {rec}: {vals}")
    ng = {}
    g = None
    if "non-gravitational force model" in testo:
        parte = testo.split("non-gravitational force model")[1].split("COMET comments")[0]
        for k in ("A1", "A2", "A3", "DT"):
            v = _valore(parte, k)
            if v is not None:
                ng[k] = v
        if "Non-standard" in parte or "ALN=" in parte:
            g = {k: _valore(parte, k) for k in ("ALN", "NK", "NM", "NN", "R0")}
            if any(v is None for v in g.values()):
                g = None
    sol = ""
    ms = re.search(r"soln ref\.=\s*([^,\n]+)", testo)
    if ms:
        sol = ms.group(1).strip()
    md = re.search(r"Soln\.date:\s*(\S+)", testo)
    data = None if md is None or md.group(1) == "-" else md.group(1)
    mo = re.search(r"# obs:\s*(\d+)\s*\((-?\d+)-(-?\d+)\)", testo)
    n_oss = int(mo.group(1)) if mo else None
    arco = (int(mo.group(2)), int(mo.group(3))) if mo else None
    commenti = []
    if "COMET comments" in testo:
        for riga in testo.split("COMET comments")[1].splitlines()[1:]:
            if riga.startswith("*"):
                break
            if riga.strip():
                commenti.append(riga.strip())
    return RecordCometa(
        record=rec,
        epoca=vals["EPOCH"],  # type: ignore[arg-type]
        e=vals["EC"],  # type: ignore[arg-type]
        q_au=vals["QR"],  # type: ignore[arg-type]
        tp=vals["TP"],  # type: ignore[arg-type]
        nodo_deg=vals["OM"],  # type: ignore[arg-type]
        argperi_deg=vals["W"],  # type: ignore[arg-type]
        inc_deg=vals["IN"],  # type: ignore[arg-type]
        ng=ng,
        g=g,
        soluzione=sol,
        data_soluzione=data,
        n_oss=n_oss,
        arco=arco,
        commenti=commenti,
    )


def epoca_vettori(testo: str) -> float | None:
    """Epoca degli elementi osculanti nell'intestazione di una risposta Horizons (JD TDB)."""
    x = _valore(testo.split("$$SOE")[0], "EPOCH")
    return None if x is None else float(x)


def leggi_vettori(testo: str) -> tuple[np.ndarray, np.ndarray]:
    """Tempi (JD TDB) e stati (n, 6) [km, km/s] da una tabella VECTORS (VEC_TABLE=2) di Horizons."""
    if "$$SOE" not in testo:
        raise ValueError("tabella dei vettori assente: " + testo[-500:])
    corpo = testo.split("$$SOE")[1].split("$$EOE")[0]
    tempi = []
    stati = []
    righe = [r for r in corpo.splitlines() if r.strip()]
    i = 0
    while i < len(righe):
        mt = re.match(r"^\s*" + _RE_NUM + r"\s*=", righe[i])
        if not mt:
            i += 1
            continue
        t = float(mt.group(1))
        blocco = " ".join(righe[i + 1 : i + 3])
        v = [_valore(blocco, k) for k in ("X", "Y", "Z", "VX", "VY", "VZ")]
        if any(x is None for x in v):
            raise ValueError(f"vettore incompleto a JD {t}")
        tempi.append(t)
        stati.append(v)
        i += 3
    return np.array(tempi), np.array(stati, dtype=np.float64)
