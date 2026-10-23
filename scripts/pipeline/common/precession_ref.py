"""Precessione a lungo termine di riferimento (§ 7.4, § 7.7) e fixture per src/time/precession.ts.

Modello: Vondrák, Capitaine, Wallace (2011), A&A 534, A22, doi:10.1051/0004-6361/201117274;
corrigendum A&A 541, C1 (2012), doi:10.1051/0004-6361/201117274e. Implementazione: ERFA (pyerfa),
funzioni eraLtpequ, eraLtpecl, eraLtp, eraLtpb, eraLtecm.

Fixture: tests/fixtures/precession/precessione.json, 200 epoche giuliane (TT) da -10000 a 2121.
Uso: python -m common.precession_ref [cartella di uscita]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import erfa
import numpy as np
from numpy.typing import NDArray

from . import constants as cst

SEME = 20261020
N_EPOCHE = 200
EPOCA_MIN = -10000.0
EPOCA_MAX = 2121.0
CARTELLA_USCITA = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "precession"


def epoca_giuliana(jd_tt: float) -> float:
    """Epoca giuliana (TT) da JD TT, come eraEpj."""
    return float(erfa.epj(jd_tt, 0.0))


def eclittica_data_a_j2000(epj: float) -> NDArray[np.float64]:
    """Matrice eclittica ed equinozio della data → eclittica J2000 (§ 7.4): R_x(ε0)·LTECMᵀ, ε0 = 84 381,448″."""
    return erfa.rx(cst.OBLIQUITA_J2000_RAD, erfa.ltecm(epj).T)


def epoche(seme: int = SEME, n: int = N_EPOCHE) -> list[float]:
    """Estremi, J2000.0 e valori di controllo, poi epoche uniformi con seme fisso; ordinate."""
    fisse = [EPOCA_MIN, -9999.0, -5000.0, -2000.0, 0.0, 1000.0, 1582.0, 2000.0, 2100.0, EPOCA_MAX]
    rng = np.random.default_rng(seme)
    casuali = rng.uniform(EPOCA_MIN, EPOCA_MAX, n - len(fisse))
    return sorted(fisse + [float(x) for x in casuali])


def _lista(x: NDArray) -> list[float]:
    return [float(v) for v in np.asarray(x, dtype=np.float64).ravel()]


def casi(epj: list[float]) -> list[dict]:
    out = []
    for e in epj:
        out.append(
            {
                "epj": e,
                "ltpequ": _lista(erfa.ltpequ(e)),
                "ltpecl": _lista(erfa.ltpecl(e)),
                "ltp": _lista(erfa.ltp(e)),
                "ltpb": _lista(erfa.ltpb(e)),
                "ltecm": _lista(erfa.ltecm(e)),
                "eclitticaDataAJ2000": _lista(eclittica_data_a_j2000(e)),
            }
        )
    return out


def genera(cartella: Path = CARTELLA_USCITA) -> Path:
    cartella = Path(cartella)
    cartella.mkdir(parents=True, exist_ok=True)
    dati = {
        "descrizione": "Precessione a lungo termine di Vondrak, Capitaine, Wallace (2011, 2012) calcolata con ERFA",
        "generatore": "scripts/pipeline/common/precession_ref.py",
        "riferimento": f"pyerfa {erfa.__version__}",
        "seme": SEME,
        "unita": {"epj": "anno giuliano TT", "vettori": "versori", "matrici": "3x3 per righe"},
        "tolleranzaAssolutaSuggerita": 1e-12,
        "casi": casi(epoche()),
    }
    percorso = cartella / "precessione.json"
    percorso.write_text(json.dumps(dati, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return percorso


if __name__ == "__main__":
    print(genera(Path(sys.argv[1]) if len(sys.argv) > 1 else CARTELLA_USCITA))
