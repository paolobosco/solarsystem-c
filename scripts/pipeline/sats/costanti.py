"""Costanti dei satelliti: GM dai kernel SPK (aree commenti congelate in raw/sats/commenti/), periodi
nominali, durate dei record, arco osservativo.
"""

from __future__ import annotations

import re
from functools import cache

from .kernel import RAW

CARTELLA_COMMENTI = RAW / "commenti"

_RE_CORPO = re.compile(r"^\s+([A-Z][A-Za-z_/0-9]*)\s+(\d{3})\s+([-+0-9.E]+)\s+\d+\s+\d+\s+SATORBINT\s*$")
_RE_SISTEMA = re.compile(r"^\s+System\s+([-+0-9.E]+)\s*$")


@cache
def gm_kernel(nome_kernel: str) -> dict[int, float]:
    """GM (km³/s²) per codice NAIF dalla tabella "Bodies on the File" del kernel; chiave 0 = sistema.

    Si usa la prima tabella dell'area commenti (le tabelle dei segmenti dello stesso kernel coincidono).
    """
    testo = (CARTELLA_COMMENTI / f"{nome_kernel}.commenti.txt").read_text(encoding="latin-1")
    out: dict[int, float] = {}
    for riga in testo.splitlines():
        m = _RE_CORPO.match(riga)
        if m:
            out.setdefault(int(m.group(2)), float(m.group(3)))
            continue
        m = _RE_SISTEMA.match(riga)
        if m:
            out.setdefault(0, float(m.group(1)))
    if not out:
        raise ValueError(f"nessuna costante GM nel kernel {nome_kernel}")
    return out
