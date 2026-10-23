"""Parametri per satellite: sistema F (polo, R_F, fattore I), μ, periodo ed eccentricità nominali.

Il polo di F è stimato sui campioni di una finestra sull'arco predefinito del § 7.5.6 (1900-2020, inizio non
anteriore all'anno di scoperta, ± 50 anni):
il piano di Laplace dei satelliti interni segue l'equatore del pianeta, che precessa (per Marte circa
0,2° per secolo), e un polo medio su millenni lascerebbe nei record un errore fuori dal piano pari allo
scarto tra i due poli. Se nella finestra il cono di precessione non è determinato si allarga la finestra
alla copertura del kernel moderno e poi a tutte le fonti. Risultati in .cache/sats/sistemi.json.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass

import numpy as np

from common.equinoctial import elementi_da_stato
from common.frames import icrf_a_eclittica

from . import campioni, sistema
from . import kernel as kn
from .anagrafica import Satellite, arco_predefinito, satelliti
from .costanti import gm_kernel

FILE = kn.CACHE / "sistemi.json"
MARGINE_ARCO = 50.0  # anni
# Rapporto tra i due autovalori maggiori sopra il quale il cono di precessione è percorso quasi per intero.
RAPPORTO_FINESTRA = 0.5


def jd_da_anno(y: float) -> float:
    return 2451545.0 + (y - 2000.0) * 365.25


@dataclass
class ParametriSistema:
    naif: int
    slug: str
    polo_icrf: list[float]
    rf: list[float]
    fattore_i: int
    mu: float
    periodo: float  # d
    e: float
    kernel: list[str]
    diagnostica: dict


def mu_satellite(s: Satellite) -> float:
    """μ = GM_pianeta + GM_satellite dal kernel moderno (§ 7.1); GM del sistema per i circumbinari."""
    assert s.naif is not None and s.sistema is not None and s.kernel_moderno is not None
    gm = gm_kernel(s.kernel_moderno)
    if s.baricentrico:
        return gm[0]
    gm_sat = gm.get(s.naif, 0.0)
    gm_pianeta = gm.get(kn.CENTRO_PIANETA[s.sistema])
    if gm_pianeta is None:
        # jup347 non contiene il centro di Giove: si usa jup365
        gm_pianeta = gm_kernel("jup365.bsp")[kn.CENTRO_PIANETA[s.sistema]]
    return gm_pianeta + gm_sat


def kernel_disponibili(s: Satellite) -> list[str]:
    nomi = [n for n in [s.kernel_moderno, *s.kernel_lunghi] if n is not None]
    return [n for n in nomi if campioni.percorso(n, s.naif or 0).exists()]


def calcola(s: Satellite) -> ParametriSistema:
    assert s.naif is not None and s.sistema is not None
    nomi = kernel_disponibili(s)
    tempi = np.concatenate([campioni.leggi(n, s.naif)["t"] for n in nomi])
    stati = np.concatenate([campioni.leggi(n, s.naif)["stati"] for n in nomi])
    w = sistema.normali_orbita(stati)
    # finestra di stima di F sull'arco predefinito: non cambia con gli archi noti di ε_estrapolazione
    a0, a1 = arco_predefinito(s.naif)
    # (nome, inizio, fine, rapporto minimo tra gli autovalori: cono percorso quasi per intero nelle prime due)
    finestre = [
        ("arco", jd_da_anno(a0 - MARGINE_ARCO), jd_da_anno(a1 + MARGINE_ARCO), RAPPORTO_FINESTRA),
        ("moderno", *campioni.leggi(nomi[0], s.naif)["copertura"], RAPPORTO_FINESTRA),
        ("tutte", -np.inf, np.inf, sistema.RAPPORTO_MINIMO_CONO),
    ]
    for nome_f, fa, fb, minimo in finestre:
        m = (tempi >= fa) & (tempi <= fb)
        polo, diag = sistema.polo_laplace(w[m], sistema.spin_icrf(s.sistema))
        diag["finestra"] = nome_f
        if diag["metodo"] == "piano" and diag["rapportoAutovalori"] >= minimo:
            break
    fi = 1 if float(np.mean(w @ polo)) > 0 else -1
    rf = sistema.matrice_rf(polo)
    mu = mu_satellite(s)
    st_f = sistema.in_f(rf, icrf_a_eclittica(stati[:: max(1, stati.shape[0] // 20000)]))
    el, _ = elementi_da_stato(st_f, mu, fi)
    a = float(np.median(el[:, 0]))
    e = float(np.median(np.hypot(el[:, 1], el[:, 2])))
    periodo = 2.0 * math.pi * math.sqrt(a**3 / mu) / 86400.0
    return ParametriSistema(s.naif, s.slug, polo.tolist(), rf.reshape(-1).tolist(), fi, mu, periodo, e, nomi, diag)


def calcola_tutti() -> dict[str, ParametriSistema]:
    out = {s.slug: calcola(s) for s in satelliti() if s.naif is not None and kernel_disponibili(s)}
    FILE.write_text(json.dumps({k: asdict(v) for k, v in out.items()}, indent=1) + "\n", encoding="utf-8")
    return out


def leggi() -> dict[str, ParametriSistema]:
    d = json.loads(FILE.read_text(encoding="utf-8"))
    return {k: ParametriSistema(**v) for k, v in d.items()}
