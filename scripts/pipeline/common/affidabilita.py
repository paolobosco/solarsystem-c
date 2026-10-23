"""Griglia degli intervalli di `reliability.bin` (§ 8.7) e valutazione di riferimento.

Fino al 12/9/1980 intervalli di 7 305 d (20 anni giuliani) da T0: nodo k = T0 + 7305·k (k ≤ 599); poi intervalli
di 456,5625 d (1,25 anni giuliani): nodo k = T_FINE + 456,5625·(k - 599), fino all'intervallo che contiene la fine
del nucleo. Per ogni intervallo [nodo k, nodo k+1) il file ha log10 del massimo di ε_modello e i bit di forma e
di dati. La parte fine segue ε dove cambia in pochi anni: epoche delle soluzioni dei piccoli corpi, perieli
recenti delle comete, fine degli archi osservativi dei satelliti, data attuale.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

from . import constants as cst

PASSO = 7305.0  # intervalli grossi: 20 anni giuliani
K_FINE = 599  # primo nodo della parte fine (JD 2 444 494,5, 12/9/1980)
SUDDIVISIONE = 16
T_FINE = cst.T0 + K_FINE * PASSO
PASSO_FINE = PASSO / SUDDIVISIONE  # 1,25 anni giuliani
NODI = K_FINE + math.ceil((cst.T_END - T_FINE) / PASSO_FINE)


def griglia() -> dict:
    """Parametri della griglia, come nell'intestazione del file e nei frammenti out/reliability-*.json."""
    return {"t0": cst.T0, "passo": PASSO, "nodi": NODI, "tFine": T_FINE, "passoFine": PASSO_FINE}


def bordi() -> NDArray[np.float64]:
    """Estremi dei NODI intervalli: NODI + 1 istanti (JD TDB); l'ultimo intervallo contiene T_END."""
    k = np.arange(NODI + 1, dtype=np.float64)
    return np.where(k <= K_FINE, cst.T0 + PASSO * k, T_FINE + PASSO_FINE * (k - K_FINE))


def intervallo(t: ArrayLike) -> NDArray[np.int64]:
    """Indice dell'intervallo che contiene t; -1 fuori dalla griglia."""
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    j = np.where(tt < T_FINE, np.floor((tt - cst.T0) / PASSO), K_FINE + np.floor((tt - T_FINE) / PASSO_FINE))
    j = np.where(np.isfinite(j), j, -1.0)
    return np.where((j >= 0) & (j < NODI), j, -1).astype(np.int64)


def valuta(serie: ArrayLike, t: ArrayLike) -> NDArray[np.float64]:
    """Valutazione di riferimento (come il lettore runtime): valore dell'intervallo che contiene t, NaN fuori."""
    v = np.asarray(serie, dtype=np.float64)
    if v.size != NODI:
        raise ValueError(f"servono {NODI} valori")
    j = intervallo(t)
    return np.where(j >= 0, v[np.maximum(j, 0)], np.nan)


def per_eccesso(y: float, cifre: int = 4) -> float:
    """Arrotondamento per eccesso a `cifre` decimali (log10 ε: ε non è mai sottostimato)."""
    f = 10.0**cifre
    return math.ceil(round(y * f, 6)) / f
