"""Criterio A6 (§ 13): soglie del § 7.5.6 contro i kernel (200 epoche per kernel e satellite) e contro JPL
Horizons (20 epoche per satellite, 1900-2100); centri dei pianeti contro i segmenti SPK (≤ 5 km dove i
satelliti sono "precisi").
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import NDArray

from common.calendario import calendario_a_jd
from common.frames import icrf_a_eclittica

from . import horizons
from .anagrafica import Satellite

SEME_HORIZONS = 20261020
N_HORIZONS = 20
JD_1900 = calendario_a_jd(1900, 1, 1, 0, 0, 0.0, "gregoriano")
JD_2100 = calendario_a_jd(2100, 1, 1, 0, 0, 0.0, "gregoriano")

# Centro per Horizons: corpo del pianeta (500@NAIF); Disnomia rispetto al corpo di Eris.
CENTRO_HORIZONS = {4: "500@499", 5: "500@599", 6: "500@699", 7: "500@799", 8: "500@899", 9: "500@999"}
COMANDO_DISNOMIA = "120136199"
CENTRO_DISNOMIA = "500@920136199"


# Horizons serve Disnomia (soluzione JPL dei satelliti dei TNO) solo tra il 2000 e il 2030.
JD_2000 = calendario_a_jd(2000, 1, 2, 0, 0, 0.0, "gregoriano")
JD_2030 = calendario_a_jd(2029, 12, 31, 0, 0, 0.0, "gregoriano")


def epoche_horizons(s: Satellite) -> NDArray[np.float64]:
    rng = np.random.default_rng(SEME_HORIZONS + s.ssid)
    a, b = (JD_2000, JD_2030) if s.naif is None else (JD_1900, JD_2100)
    return np.sort(rng.uniform(a, b, N_HORIZONS))


def vettori_horizons(s: Satellite, offline: bool = False) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Epoche (TDB) e stati planetocentrici geometrici di Horizons nell'eclittica J2000."""
    t = epoche_horizons(s)
    if s.naif is None:
        comando, centro = COMANDO_DISNOMIA, CENTRO_DISNOMIA
    else:
        assert s.sistema is not None
        comando, centro = str(s.naif), CENTRO_HORIZONS[s.sistema]
    st = horizons.vettori(comando, centro, t.tolist(), f"vettori-{s.slug}", offline)
    return t, st


def errori(modello: NDArray[np.float64], vero: NDArray[np.float64]) -> tuple[NDArray, NDArray]:
    """Errore angolare visto dal pianeta (rad) e radiale (km)."""
    m = modello[:, :3]
    v = vero[:, :3]
    croce = np.linalg.norm(np.cross(m, v), axis=1)
    ang = np.arctan2(croce, np.sum(m * v, axis=1))
    return ang, np.linalg.norm(m, axis=1) - np.linalg.norm(v, axis=1)


def planetocentrico_vero(stati_icrf: NDArray, centro_icrf: NDArray, baricentrico: bool) -> NDArray:
    """Stato planetocentrico nell'eclittica J2000 dai campioni (relativi al centro o al baricentro)."""
    st = stati_icrf - centro_icrf if baricentrico else stati_icrf
    return icrf_a_eclittica(st)


def gradi(x: float) -> float:
    return math.degrees(x)
