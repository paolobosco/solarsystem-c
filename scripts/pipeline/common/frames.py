"""Rotazione ICRF <-> eclittica J2000 (I4).

Rotazione attorno all'asse x di ε0 = 84 381,448″, come in JPL Horizons; bias ICRF/J2000 trascurato.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .constants import OBLIQUITA_J2000_RAD

_C = math.cos(OBLIQUITA_J2000_RAD)
_S = math.sin(OBLIQUITA_J2000_RAD)

# r_ecl = M · r_icrf, M = R_x(ε0).
MATRICE_ICRF_A_ECLITTICA: NDArray[np.float64] = np.array(
    [[1.0, 0.0, 0.0], [0.0, _C, _S], [0.0, -_S, _C]], dtype=np.float64
)
MATRICE_ECLITTICA_A_ICRF: NDArray[np.float64] = MATRICE_ICRF_A_ECLITTICA.T.copy()


def _ruota(m: NDArray[np.float64], v: ArrayLike) -> NDArray[np.float64]:
    a = np.asarray(v, dtype=np.float64)
    if a.shape[-1] == 3:
        return a @ m.T
    if a.shape[-1] == 6:
        out = np.empty_like(a)
        out[..., :3] = a[..., :3] @ m.T
        out[..., 3:] = a[..., 3:] @ m.T
        return out
    raise ValueError("l'ultima dimensione deve essere 3 (vettore) o 6 (stato)")


def icrf_a_eclittica(v: ArrayLike) -> NDArray[np.float64]:
    """Vettori (..., 3) o stati (..., 6) da ICRF a eclittica J2000."""
    return _ruota(MATRICE_ICRF_A_ECLITTICA, v)


def eclittica_a_icrf(v: ArrayLike) -> NDArray[np.float64]:
    """Vettori (..., 3) o stati (..., 6) da eclittica J2000 a ICRF."""
    return _ruota(MATRICE_ECLITTICA_A_ICRF, v)
