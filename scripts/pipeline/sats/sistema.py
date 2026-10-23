"""Sistema di riferimento F di ciascun satellite (§ 7.5.2).

Polo di F: polo medio dell'orbita (piano di Laplace), stimato come normale al piano che meglio
approssima i versori del momento angolare osculante campionati sull'intera copertura (il polo
dell'orbita precessa su un cono attorno al polo di Laplace). Se i versori non coprono un arco
sufficiente del cono il piano non è determinato: si usa la direzione media del momento angolare.
Verso del polo: dalla parte del momento angolare di rotazione del pianeta (quindi Tritone e Febe,
retrogradi, hanno I = -1). Asse x: nodo ascendente del piano F sull'equatore ICRF.
R_F trasforma da F all'eclittica J2000 (I4).
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

from common.frames import MATRICE_ICRF_A_ECLITTICA

# Poli di rotazione dei pianeti a J2000 (α0, δ0 in gradi) e verso della rotazione rispetto al polo:
# Archinal et al. (2018), Celest. Mech. Dyn. Astr. 130:22, tabelle 2 e 3. Servono solo a scegliere il
# verso del polo di F; W crescente = rotazione diretta attorno al polo indicato.
POLI_ROTAZIONE: dict[int, tuple[float, float, int]] = {
    4: (317.269202, 54.432516, 1),
    5: (268.056595, 64.495303, 1),
    6: (40.589, 83.537, 1),
    7: (257.311, -15.175, -1),
    8: (299.36, 43.46, 1),
    9: (132.993, -6.163, 1),
}

# Rapporto minimo tra il secondo e il primo autovalore della dispersione dei versori perché il
# piano del cono sia considerato determinato.
RAPPORTO_MINIMO_CONO = 0.05


def versore_radec(alfa_deg: float, delta_deg: float) -> NDArray[np.float64]:
    a = math.radians(alfa_deg)
    d = math.radians(delta_deg)
    return np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])


def spin_icrf(sistema: int) -> NDArray[np.float64]:
    """Versore ICRF del momento angolare di rotazione del pianeta del sistema."""
    alfa, delta, verso = POLI_ROTAZIONE[sistema]
    return verso * versore_radec(alfa, delta)


def normali_orbita(stati_icrf: ArrayLike) -> NDArray[np.float64]:
    """Versori (n, 3) del momento angolare osculante r × v."""
    s = np.asarray(stati_icrf, dtype=np.float64)
    w = np.cross(s[:, :3], s[:, 3:])
    return w / np.linalg.norm(w, axis=1, keepdims=True)


def polo_laplace(normali: ArrayLike, spin: ArrayLike) -> tuple[NDArray[np.float64], dict]:
    """Polo di F (ICRF) dai versori del momento angolare; restituisce anche le diagnostiche."""
    w = np.asarray(normali, dtype=np.float64)
    c = w.mean(axis=0)
    d = w - c
    cov = d.T @ d / w.shape[0]
    val, vec = np.linalg.eigh(cov)  # autovalori crescenti
    rapporto = float(val[1] / val[2]) if val[2] > 0 else 0.0
    if rapporto >= RAPPORTO_MINIMO_CONO:
        polo = vec[:, 0]
        metodo = "piano"
    else:
        polo = c / np.linalg.norm(c)
        metodo = "media"
    s = np.asarray(spin, dtype=np.float64)
    if float(polo @ s) < 0:
        polo = -polo
    angoli = np.degrees(np.arccos(np.clip(w @ polo, -1.0, 1.0)))
    diag = {
        "metodo": metodo,
        "rapportoAutovalori": rapporto,
        "inclinazioneMediaGradi": float(angoli.mean()),
        "inclinazioneMinGradi": float(angoli.min()),
        "inclinazioneMaxGradi": float(angoli.max()),
    }
    return polo, diag


def matrice_f_icrf(polo: ArrayLike) -> NDArray[np.float64]:
    """Matrice (colonne x_F, y_F, z_F) da F a ICRF: z_F = polo, x_F = nodo ascendente sull'equatore ICRF."""
    z = np.asarray(polo, dtype=np.float64)
    z = z / np.linalg.norm(z)
    nodo = np.cross(np.array([0.0, 0.0, 1.0]), z)
    if np.linalg.norm(nodo) < 1e-12:
        nodo = np.array([1.0, 0.0, 0.0])
    x = nodo / np.linalg.norm(nodo)
    y = np.cross(z, x)
    return np.column_stack([x, y, z])


def matrice_rf(polo_icrf: ArrayLike) -> NDArray[np.float64]:
    """R_F: da F all'eclittica J2000."""
    return MATRICE_ICRF_A_ECLITTICA @ matrice_f_icrf(polo_icrf)


def in_f(rf: NDArray[np.float64], stati_eclittica: ArrayLike) -> NDArray[np.float64]:
    """Stati (n, 6) dall'eclittica J2000 al sistema F."""
    s = np.asarray(stati_eclittica, dtype=np.float64)
    out = np.empty_like(s)
    out[:, :3] = s[:, :3] @ rf
    out[:, 3:] = s[:, 3:] @ rf
    return out
