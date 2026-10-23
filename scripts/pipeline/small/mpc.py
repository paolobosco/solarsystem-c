"""Nomi e designazioni dei pianetini numerati e delle comete periodiche numerate dal Minor Planet Center (§ 4.3).

Identifier API (https://data.minorplanetcenter.net/api/query-identifier, documentazione:
https://docs.minorplanetcenter.net/mpc-ops-docs/apis/query-identifier/): GET con corpo JSON {"ids": [...]}, una sola
richiesta per tutti i pianetini numerati di bodies.json (numeri) e le comete periodiche numerate (identificatori "NP",
con il nome senza numerale: "Tempel" per 9P). Risposta congelata in raw/small/mpc-identificatori.json; il confronto
con il catalogo è in catalog.py (controlli_mpc).
"""

from __future__ import annotations

import datetime as _dt
import json
import re
import time
import urllib.request

from . import rete
from .anagrafica import RAW, leggi_corpi

URL_MPC = "https://data.minorplanetcenter.net/api/query-identifier"
FILE_MPC = RAW / "mpc-identificatori.json"


def numeri() -> list[str]:
    """Numeri MPC dei pianetini del catalogo (pianeti nani compresi; comete escluse)."""
    return [
        str(c["numero"])
        for c in leggi_corpi()
        if c["numero"] is not None and c["categoria"] not in ("cometa", "interstellare", "luna")
    ]


def comete() -> list[str]:
    """Identificatori MPC ("9P") delle comete periodiche numerate del catalogo (designazione "NP"); le altre comete
    non hanno numero e Chiron (95P/Chiron) è un pianetino numerato."""
    return [
        c["designazione"]
        for c in leggi_corpi()
        if c["categoria"] == "cometa" and re.fullmatch(r"\d+P", c["designazione"] or "")
    ]


def scarica(offline: bool = False) -> dict:
    """Risposta congelata; se assente (o con identificatori mancanti) la richiede all'MPC, salvo modalità offline."""
    ids = numeri() + comete()
    if FILE_MPC.exists():
        d = json.loads(FILE_MPC.read_text(encoding="utf-8"))
        if set(ids) <= set(d["risposta"]):
            return d
    if offline:
        raise rete.AssenteOffline(f"risposta non congelata: {FILE_MPC}")
    corpo = json.dumps({"ids": ids}).encode("utf-8")
    errore: Exception | None = None
    for k in range(rete.TENTATIVI):
        time.sleep(rete.PAUSA_S)
        req = urllib.request.Request(URL_MPC, data=corpo, method="GET", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=rete.TIMEOUT_S) as r:
                risposta = json.loads(r.read())
            break
        except (OSError, ValueError) as e:
            errore = e
            time.sleep(min(60.0, 2.0 * 2**k))
    else:
        raise rete.ErroreRete(f"richiesta non riuscita: {URL_MPC}: {errore}")
    d = {
        "formato": 1,
        "url": URL_MPC,
        "estrazione": _dt.date.today().isoformat(),
        "richiesta": {"ids": ids},
        "risposta": risposta,
    }
    FILE_MPC.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return d
