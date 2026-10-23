"""Disnomia (§ 7.5.1, § 7.5.4): orbita kepleriana di Holler, Grundy, Buie, Noll (2021), Icarus 355, 114130,
doi:10.1016/j.icarus.2020.114130 (preprint arXiv:2009.13733), tabella 2, adattamento combinato.

Elementi riferiti all'equatore J2000 (ICRF) all'epoca JD 2453979,0; ϖ = ω + Ω, ε = longitudine media.
Sistema F: piano dell'orbita, asse x sul nodo ascendente sull'equatore ICRF (§ 7.5.2), quindi in F
i = 0, ϖ_F = ω e λ_F = M + ω. Un solo record secolare con ϖ̇ = Ω̇ = c2 = 0 (§ 7.5.4).
Verifica: offset di Disnomia da Eris (tabella 1 dell'articolo) ricalcolati con la posizione astrometrica
di Eris da JPL Horizons (risposta congelata).
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import NDArray

from common import constants as cst
from common.calendario import calendario_a_jd

from . import horizons, sistema
from . import modello as mod

FONTE = (
    "Holler, B. J., Grundy, W. M., Buie, M. W., Noll, K. S. (2021), The Eris/Dysnomia system I: The orbit "
    "of Dysnomia, Icarus 355, 114130, doi:10.1016/j.icarus.2020.114130, tabella 2 (adattamento combinato)"
)
EPOCA = 2453979.0
PERIODO = 15.785899  # d
SIGMA_PERIODO = 0.000050
A = 37273.0  # km
SIGMA_A = 64.0
E = 0.0062
SIGMA_E = 0.0010
I_EQ = 45.49  # gradi
SIGMA_I = 0.15
EPS = 125.78  # longitudine media all'epoca, gradi
SIGMA_EPS = 0.32
OMEGA = 126.17  # nodo ascendente, gradi
SIGMA_OMEGA = 0.26
VARPI = 307.0  # longitudine del periasse, gradi
SIGMA_VARPI = 12.0
MU = 1099.0  # km³/s², sistema Eris-Disnomia
SIGMA_MU = 6.0
# Arco osservativo: dicembre 2005 - febbraio 2018 (§ 2 dell'articolo).
ARCO = (2005.92, 2018.09)

# Offset di Disnomia da Eris (tabella 1): data UT (anno, mese, giorno, ore decimali), RA·cos δ e Dec (mas).
OFFSET_TABELLA_1 = [
    ((2007, 8, 13, 2.04194), 484.67, -178.10, 4.15, 2.68),
    ((2015, 1, 29, 4.02507), -350.03, -226.03, 2.26, 2.26),
    ((2015, 1, 29, 5.70083), -341.39, -229.13, 2.26, 2.26),
    ((2015, 2, 1, 10.02840), 287.34, -328.08, 2.26, 2.26),
    ((2015, 2, 1, 11.72611), 297.64, -323.68, 2.26, 2.26),
    ((2018, 1, 1, 6.72108), -128.18, 363.10, 3.67, 2.26),
    ((2018, 1, 1, 11.48714), -171.78, 362.48, 4.74, 2.26),
    ((2018, 1, 3, 6.18291), -454.62, 226.35, 5.95, 3.61),
    ((2018, 1, 9, 5.45492), 145.52, -366.50, 3.59, 2.74),
    ((2018, 1, 10, 10.06408), 374.03, -296.19, 2.26, 2.32),
    ((2018, 1, 14, 11.00769), 365.82, 221.95, 2.26, 2.26),
    ((2018, 2, 3, 4.60881), -378.30, 277.49, 2.26, 2.26),
]


def polo_icrf() -> NDArray[np.float64]:
    """Polo dell'orbita in ICRF da i e Ω (equatoriali)."""
    i = math.radians(I_EQ)
    om = math.radians(OMEGA)
    return np.array([math.sin(i) * math.sin(om), -math.sin(i) * math.cos(om), math.cos(i)])


def matrice_rf() -> NDArray[np.float64]:
    return sistema.matrice_rf(polo_icrf())


def record(t_inizio: float, t_fine: float, correzione_tempo_luce: float = 0.0) -> mod.Record:
    """Record secolare kepleriano; correzione_tempo_luce (d) sposta l'epoca (λ_geom(t) = λ(t + LT))."""
    n = 2.0 * math.pi / PERIODO
    omega_arg = math.radians(VARPI - OMEGA)
    lam = math.radians(EPS - VARPI) + omega_arg  # λ_F = M + ω
    lam += n * correzione_tempo_luce
    return mod.Record(
        mod.TIPO_SECOLARE,
        1,
        t_inizio,
        t_fine,
        EPOCA,
        A,
        E,
        omega_arg,
        0.0,
        1e-15,
        0.0,
        0.0,
        _rid(lam),
        n,
    )


def _rid(x: float) -> float:
    return x - 2.0 * math.pi * math.floor((x + math.pi) / (2.0 * math.pi))


def posizione_icrf(rec: mod.Record, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Posizioni ICRF (n, 3) di Disnomia rispetto a Eris."""
    rf_icrf = sistema.matrice_f_icrf(polo_icrf())
    st = mod.stato_record(rec, np.zeros(0), t)
    return st[:, :3] @ rf_icrf.T


def jd_ut(data: tuple[int, int, int, float]) -> float:
    a, m, g, ore = data
    return calendario_a_jd(a, m, g, 0, 0, 0.0, "gregoriano") + ore / 24.0


def verifica_offset(offline: bool = False) -> dict:
    """Residui (mas) degli offset della tabella 1 con e senza correzione del tempo luce.

    Istante di emissione = istante di osservazione - tempo luce (da Horizons); il passaggio UT -> TT
    (circa 65-69 s) è trascurato rispetto alla precisione delle misure.
    """
    tempi = [jd_ut(r[0]) for r in OFFSET_TABELLA_1]
    oss = horizons.osservazioni("136199;", tempi, "eris-osservazioni-tabella1", offline)
    ra = np.radians(oss[:, 0])
    de = np.radians(oss[:, 1])
    delta_km = oss[:, 2] * cst.UA_KM
    tl = delta_km / cst.C_KM_S / cst.GIORNO_S
    e_a = np.stack([-np.sin(ra), np.cos(ra), np.zeros_like(ra)], axis=1)
    e_d = np.stack([-np.sin(de) * np.cos(ra), -np.sin(de) * np.sin(ra), np.cos(de)], axis=1)
    misure = np.array([[r[1], r[2]] for r in OFFSET_TABELLA_1])
    sigma = np.array([[r[3], r[4]] for r in OFFSET_TABELLA_1])
    esito = {}
    for nome, lt in (("senzaTempoLuce", 0.0), ("conTempoLuce", 1.0)):
        rec = record(-1e9, 1e9)
        t = np.array(tempi) - lt * tl
        r = posizione_icrf(rec, t)
        mas = 180.0 / math.pi * 3600e3
        pred = np.stack([np.sum(r * e_a, axis=1) / delta_km * mas, np.sum(r * e_d, axis=1) / delta_km * mas], axis=1)
        res = (misure - pred) / sigma
        esito[nome] = {
            "residuiSigma": res.round(2).tolist(),
            "rmsSigma": float(np.sqrt(np.mean(res**2))),
            "maxMas": float(np.max(np.abs(misure - pred))),
        }
    esito["tempoLuceGiorni"] = float(np.mean(tl))
    return esito
