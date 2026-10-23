"""Luna (§ 7.4, § 8.4; passo 3 del § 12.3; spike S1).

Serie di Meeus (Astronomical Algorithms, 2ª ed., 1998, cap. 47), troncamento di ELP 2000-82B:
tabelle 47.A (Σl in 1e-6 gradi, Σr in 1e-3 km) e 47.B (Σb in 1e-6 gradi), argomenti fondamentali
(47.1-47.5), A1, A2, A3 ed E (47.6), termini additivi del testo. Le correzioni degli argomenti si
sommano a L', D, M, M', F; κ moltiplica E. Correzioni stimate ai minimi quadrati contro DE441
(301 rispetto a 399) su finestre di ±10 anni centrate nei nodi (ogni 3652,5 d da T0), interpolate
con Hermite cubica (C1). Catena: serie → eclittica e equinozio medi della data → eclittica J2000
con M(t) = R_x(ε0)·LTECM(t)ᵀ (Vondrák, Capitaine, Wallace 2011). Stesse formule e stesso ordine
delle operazioni di src/ephem/moon.ts.

Uso (da scripts/pipeline/):
  .venv/bin/python moon.py genera         # adattamento (circa 17 min) e public/data/v1/moon.bin
  .venv/bin/python moon.py valida         # A5 su griglia di 0,5 d da T0 a T_END
  .venv/bin/python moon.py kappa          # confronto con e senza κ (un nodo ogni 25)
  .venv/bin/python moon.py affidabilita   # out/reliability-moon.json
  .venv/bin/python moon.py fixture        # tests/fixtures/moon/
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import erfa
import numpy as np
from numpy.typing import ArrayLike, NDArray

from common import affidabilita as ca
from common import binio
from common import constants as cst
from common.de441 import De441
from common.frames import icrf_a_eclittica
from common.interp import hermite_cubica
from common.manifest import sha256_bytes

RAD_ARCSEC = 648000.0 / math.pi
RADICE = Path(__file__).resolve().parents[2]
PERCORSO_MOON = RADICE / "public" / "data" / "v1" / "moon.bin"
CARTELLA_FIXTURE = RADICE / "tests" / "fixtures" / "moon"
CARTELLA_OUT = Path(__file__).resolve().parent / "out"

GRADI = math.pi / 180.0
# Unità dei coefficienti: 1e-6 gradi in radianti; 1e-3 km.
U_ANGOLO = 1e-6 * GRADI
U_DISTANZA = 1e-3
DISTANZA_MEDIA_KM = 385000.56
J2000 = 2451545.0
GIORNI_SECOLO = 36525.0

# Tabella 47.A: D, M, M', F, Σl, Σr.
TABELLA_LR: tuple[tuple[int, int, int, int, int, int], ...] = (
    (0, 0, 1, 0, 6288774, -20905355),
    (2, 0, -1, 0, 1274027, -3699111),
    (2, 0, 0, 0, 658314, -2955968),
    (0, 0, 2, 0, 213618, -569925),
    (0, 1, 0, 0, -185116, 48888),
    (0, 0, 0, 2, -114332, -3149),
    (2, 0, -2, 0, 58793, 246158),
    (2, -1, -1, 0, 57066, -152138),
    (2, 0, 1, 0, 53322, -170733),
    (2, -1, 0, 0, 45758, -204586),
    (0, 1, -1, 0, -40923, -129620),
    (1, 0, 0, 0, -34720, 108743),
    (0, 1, 1, 0, -30383, 104755),
    (2, 0, 0, -2, 15327, 10321),
    (0, 0, 1, 2, -12528, 0),
    (0, 0, 1, -2, 10980, 79661),
    (4, 0, -1, 0, 10675, -34782),
    (0, 0, 3, 0, 10034, -23210),
    (4, 0, -2, 0, 8548, -21636),
    (2, 1, -1, 0, -7888, 24208),
    (2, 1, 0, 0, -6766, 30824),
    (1, 0, -1, 0, -5163, -8379),
    (1, 1, 0, 0, 4987, -16675),
    (2, -1, 1, 0, 4036, -12831),
    (2, 0, 2, 0, 3994, -10445),
    (4, 0, 0, 0, 3861, -11650),
    (2, 0, -3, 0, 3665, 14403),
    (0, 1, -2, 0, -2689, -7003),
    (2, 0, -1, 2, -2602, 0),
    (2, -1, -2, 0, 2390, 10056),
    (1, 0, 1, 0, -2348, 6322),
    (2, -2, 0, 0, 2236, -9884),
    (0, 1, 2, 0, -2120, 5751),
    (0, 2, 0, 0, -2069, 0),
    (2, -2, -1, 0, 2048, -4950),
    (2, 0, 1, -2, -1773, 4130),
    (2, 0, 0, 2, -1595, 0),
    (4, -1, -1, 0, 1215, -3958),
    (0, 0, 2, 2, -1110, 0),
    (3, 0, -1, 0, -892, 3258),
    (2, 1, 1, 0, -810, 2616),
    (4, -1, -2, 0, 759, -1897),
    (0, 2, -1, 0, -713, -2117),
    (2, 2, -1, 0, -700, 2354),
    (2, 1, -2, 0, 691, 0),
    (2, -1, 0, -2, 596, 0),
    (4, 0, 1, 0, 549, -1423),
    (0, 0, 4, 0, 537, -1117),
    (4, -1, 0, 0, 520, -1571),
    (1, 0, -2, 0, -487, -1739),
    (2, 1, 0, -2, -399, 0),
    (0, 0, 2, -2, -381, -4421),
    (1, 1, 1, 0, 351, 0),
    (3, 0, -2, 0, -340, 0),
    (4, 0, -3, 0, 330, 0),
    (2, -1, 2, 0, 327, 0),
    (0, 2, 1, 0, -323, 1165),
    (1, 1, -1, 0, 299, 0),
    (2, 0, 3, 0, 294, 0),
    (2, 0, -1, -2, 0, 8752),
)

# Tabella 47.B: D, M, M', F, Σb.
TABELLA_B: tuple[tuple[int, int, int, int, int], ...] = (
    (0, 0, 0, 1, 5128122),
    (0, 0, 1, 1, 280602),
    (0, 0, 1, -1, 277693),
    (2, 0, 0, -1, 173237),
    (2, 0, -1, 1, 55413),
    (2, 0, -1, -1, 46271),
    (2, 0, 0, 1, 32573),
    (0, 0, 2, 1, 17198),
    (2, 0, 1, -1, 9266),
    (0, 0, 2, -1, 8822),
    (2, -1, 0, -1, 8216),
    (2, 0, -2, -1, 4324),
    (2, 0, 1, 1, 4200),
    (2, 1, 0, -1, -3359),
    (2, -1, -1, 1, 2463),
    (2, -1, 0, 1, 2211),
    (2, -1, -1, -1, 2065),
    (0, 1, -1, -1, -1870),
    (4, 0, -1, -1, 1828),
    (0, 1, 0, 1, -1794),
    (0, 0, 0, 3, -1749),
    (0, 1, -1, 1, -1565),
    (1, 0, 0, 1, -1491),
    (0, 1, 1, 1, -1475),
    (0, 1, 1, -1, -1410),
    (0, 1, 0, -1, -1344),
    (1, 0, 0, -1, -1335),
    (0, 0, 3, 1, 1107),
    (4, 0, 0, -1, 1021),
    (4, 0, -1, 1, 833),
    (0, 0, 1, -3, 777),
    (4, 0, -2, 1, 671),
    (2, 0, 0, -3, 607),
    (2, 0, 2, -1, 596),
    (2, -1, 1, -1, 491),
    (2, 0, -2, 1, -451),
    (0, 0, 3, -1, 439),
    (2, 0, 2, 1, 422),
    (2, 0, -3, -1, 421),
    (2, 1, -1, 1, -366),
    (2, 1, 0, 1, -351),
    (4, 0, 0, 1, 331),
    (2, -1, 1, 1, 315),
    (2, -2, 0, -1, 302),
    (0, 0, 1, 3, -283),
    (2, 1, 1, -1, -229),
    (1, 1, 0, -1, 223),
    (1, 1, 0, 1, 223),
    (0, 1, -2, -1, -220),
    (2, 1, -1, -1, -220),
    (1, 0, 1, 1, -185),
    (2, -1, -2, -1, 181),
    (0, 1, 2, 1, -177),
    (4, 0, -2, -1, 176),
    (4, -1, -1, -1, 166),
    (1, 0, 1, -1, -164),
    (4, 0, 1, -1, 132),
    (1, 0, -1, -1, -119),
    (4, -1, 0, -1, 115),
    (2, -2, 0, 1, 107),
)

# Argomenti fondamentali (gradi, polinomi in T): coefficienti di T^0..T^4 (47.1-47.5).
POLI_L1 = (218.3164477, 481267.88123421, -0.0015786, 1.0 / 538841.0, -1.0 / 65194000.0)
POLI_D = (297.8501921, 445267.1114034, -0.0018819, 1.0 / 545868.0, -1.0 / 113065000.0)
POLI_M = (357.5291092, 35999.0502909, -0.0001536, 1.0 / 24490000.0, 0.0)
POLI_M1 = (134.9633964, 477198.8675055, 0.0087414, 1.0 / 69699.0, -1.0 / 14712000.0)
POLI_F = (93.2720950, 483202.0175233, -0.0036539, -1.0 / 3526000.0, 1.0 / 863310000.0)
# A1, A2, A3 (gradi) e E (47.6).
POLI_A1 = (119.75, 131.849)
POLI_A2 = (53.09, 479264.290)
POLI_A3 = (313.45, 481266.484)
POLI_E = (1.0, -0.002516, -0.0000074)

# Termini additivi (1e-6 gradi): Σl += 3958 sin A1 + 1962 sin(L' - F) + 318 sin A2;
# Σb += -2235 sin L' + 382 sin A3 + 175 sin(A1 - F) + 175 sin(A1 + F) + 127 sin(L' - M') - 115 sin(L' + M').
ADD_L = (3958.0, 1962.0, 318.0)
ADD_B = (-2235.0, 382.0, 175.0, 175.0, 127.0, -115.0)

_LR = np.array(TABELLA_LR, dtype=np.float64)
_B = np.array(TABELLA_B, dtype=np.float64)
# Moltiplicatori di D, M, M', F e potenza di E (|m|).
MOLT_LR = _LR[:, :4].copy()
MOLT_B = _B[:, :4].copy()
COEFF_L = _LR[:, 4].copy()
COEFF_R = _LR[:, 5].copy()
COEFF_B = _B[:, 4].copy()
POT_E_LR = np.abs(MOLT_LR[:, 1]).astype(np.int64)
POT_E_B = np.abs(MOLT_B[:, 1]).astype(np.int64)

NOMI_CORREZIONI = ("dL1", "dD", "dM", "dM1", "dF", "kappa")


def _poli(c: tuple[float, ...], t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Valore del polinomio Σ c_i·T^i con Horner da T^4 a T^0 (gradi)."""
    out = np.full_like(t, c[-1])
    for ci in reversed(c[:-1]):
        out = out * t + ci
    return out


def _poli_derivata(c: tuple[float, ...], t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Derivata rispetto a T (gradi/secolo)."""
    d = tuple(i * c[i] for i in range(1, len(c)))
    return _poli(d, t)


def secoli(jd: ArrayLike) -> NDArray[np.float64]:
    return (np.asarray(jd, dtype=np.float64) - J2000) / GIORNI_SECOLO


def argomenti(jd: ArrayLike, corr: NDArray[np.float64] | None = None) -> dict[str, NDArray[np.float64]]:
    """Argomenti in radianti (L', D, M, M', F con le correzioni), A1-A3, E·κ e velocità in rad/d.

    corr: (n, 6) [ΔL', ΔD, ΔM, ΔM', ΔF (rad), κ] oppure None (correzioni nulle, κ = 1);
    dcorr facoltative non considerate qui (si sommano alle velocità dal chiamante).
    """
    t = secoli(jd)
    out: dict[str, NDArray[np.float64]] = {}
    for nome, c in (("L1", POLI_L1), ("D", POLI_D), ("M", POLI_M), ("M1", POLI_M1), ("F", POLI_F)):
        out[nome] = _poli(c, t) * GRADI
        out["v" + nome] = _poli_derivata(c, t) * (GRADI / GIORNI_SECOLO)
    for nome, c in (("A1", POLI_A1), ("A2", POLI_A2), ("A3", POLI_A3)):
        out[nome] = (c[0] + c[1] * t) * GRADI
        out["v" + nome] = np.full_like(t, c[1] * (GRADI / GIORNI_SECOLO))
    out["E"] = POLI_E[0] + t * (POLI_E[1] + t * POLI_E[2])
    if corr is not None:
        for j, nome in enumerate(("L1", "D", "M", "M1", "F")):
            out[nome] = out[nome] + corr[:, j]
        out["E"] = out["E"] * corr[:, 5]
    return out


def serie(
    jd: ArrayLike,
    corr: NDArray[np.float64] | None = None,
    dcorr: NDArray[np.float64] | None = None,
    derivate: bool = True,
) -> tuple[NDArray[np.float64], ...]:
    """λ, β (rad), Δ (km) nell'eclittica e nell'equinozio medi della data e derivate (rad/d, km/d).

    dcorr: (n, 6) derivate temporali delle correzioni (rad/d; la colonna di κ non è usata).
    Le derivate trascurano le variazioni lente di E e κ.
    """
    a = argomenti(jd, corr)
    vel = {k: a["v" + k] for k in ("L1", "D", "M", "M1", "F")}
    if dcorr is not None:
        for j, k in enumerate(("L1", "D", "M", "M1", "F")):
            vel[k] = vel[k] + dcorr[:, j]
    fond = np.stack([a["D"], a["M"], a["M1"], a["F"]], axis=-1)
    vfond = np.stack([vel["D"], vel["M"], vel["M1"], vel["F"]], axis=-1)
    e = a["E"]
    e2 = e * e

    def fattore_e(pot: NDArray[np.int64]) -> NDArray[np.float64]:
        f = np.ones((e.size, pot.size))
        f[:, pot == 1] = e[:, None]
        f[:, pot == 2] = e2[:, None]
        return f

    arg = _combina(fond, MOLT_LR)
    s, c = np.sin(arg), np.cos(arg)
    fe = fattore_e(POT_E_LR)
    sl = np.sum(COEFF_L * fe * s, axis=-1)
    sr = np.sum(COEFF_R * fe * c, axis=-1)
    argb = _combina(fond, MOLT_B)
    feb = fattore_e(POT_E_B)
    sb = np.sum(COEFF_B * feb * np.sin(argb), axis=-1)
    l1, f, m1 = a["L1"], a["F"], a["M1"]
    a1, a2, a3 = a["A1"], a["A2"], a["A3"]
    sl = sl + ADD_L[0] * np.sin(a1) + ADD_L[1] * np.sin(l1 - f) + ADD_L[2] * np.sin(a2)
    sb = (
        sb
        + ADD_B[0] * np.sin(l1)
        + ADD_B[1] * np.sin(a3)
        + ADD_B[2] * np.sin(a1 - f)
        + ADD_B[3] * np.sin(a1 + f)
        + ADD_B[4] * np.sin(l1 - m1)
        + ADD_B[5] * np.sin(l1 + m1)
    )
    lam = l1 + sl * U_ANGOLO
    beta = sb * U_ANGOLO
    dist = DISTANZA_MEDIA_KM + sr * U_DISTANZA
    if not derivate:
        return lam, beta, dist
    varg = _combina(vfond, MOLT_LR)
    dsl = np.sum(COEFF_L * fe * c * varg, axis=-1)
    dsr = -np.sum(COEFF_R * fe * s * varg, axis=-1)
    vargb = _combina(vfond, MOLT_B)
    dsb = np.sum(COEFF_B * feb * np.cos(argb) * vargb, axis=-1)
    vl1, vf, vm1 = vel["L1"], vel["F"], vel["M1"]
    va1, va2, va3 = a["vA1"], a["vA2"], a["vA3"]
    dsl = dsl + ADD_L[0] * np.cos(a1) * va1 + ADD_L[1] * np.cos(l1 - f) * (vl1 - vf) + ADD_L[2] * np.cos(a2) * va2
    dsb = (
        dsb
        + ADD_B[0] * np.cos(l1) * vl1
        + ADD_B[1] * np.cos(a3) * va3
        + ADD_B[2] * np.cos(a1 - f) * (va1 - vf)
        + ADD_B[3] * np.cos(a1 + f) * (va1 + vf)
        + ADD_B[4] * np.cos(l1 - m1) * (vl1 - vm1)
        + ADD_B[5] * np.cos(l1 + m1) * (vl1 + vm1)
    )
    return lam, beta, dist, vl1 + dsl * U_ANGOLO, dsb * U_ANGOLO, dsr * U_DISTANZA


def _combina(fond: NDArray[np.float64], molt: NDArray[np.float64]) -> NDArray[np.float64]:
    """Argomenti dei termini: d·D + m·M + m'·M' + f·F, sommati in quest'ordine."""
    return fond[:, 0:1] * molt[:, 0] + fond[:, 1:2] * molt[:, 1] + fond[:, 2:3] * molt[:, 2] + fond[:, 3:4] * molt[:, 3]


def sferiche_a_stato(lam, beta, dist, dlam, dbeta, ddist) -> NDArray[np.float64]:
    """Stato cartesiano (n, 6) in km e km/d da coordinate sferiche e derivate."""
    cl, sl = np.cos(lam), np.sin(lam)
    cb, sb = np.cos(beta), np.sin(beta)
    x = dist * cb * cl
    y = dist * cb * sl
    z = dist * sb
    vx = ddist * cb * cl - dist * sb * dbeta * cl - dist * cb * sl * dlam
    vy = ddist * cb * sl - dist * sb * dbeta * sl + dist * cb * cl * dlam
    vz = ddist * sb + dist * cb * dbeta
    return np.stack([x, y, z, vx, vy, vz], axis=-1)


# --- Catena di riferimento (§ 7.4) ---


def epoca_giuliana(jd: ArrayLike) -> NDArray[np.float64]:
    """Epoca giuliana TT come eraEpj: 2000 + (JD - 2 451 545)/365,25."""
    return 2000.0 + (np.asarray(jd, dtype=np.float64) - J2000) / 365.25


def matrici_data_j2000(jd: ArrayLike) -> NDArray[np.float64]:
    """M(t) = R_x(ε0)·LTECM(t)ᵀ per ogni istante, forma (n, 3, 3) (precession_ref.eclittica_data_a_j2000)."""
    epj = np.atleast_1d(epoca_giuliana(jd))
    return erfa.rx(cst.OBLIQUITA_J2000_RAD, np.swapaxes(erfa.ltecm(epj), -1, -2))


def stato_geocentrico(
    jd: ArrayLike, corr: NDArray[np.float64] | None = None, dcorr: NDArray[np.float64] | None = None
) -> NDArray[np.float64]:
    """Stato geocentrico della Luna (n, 6) in km e km/s, eclittica J2000.

    La velocità trascura la derivata della matrice di precessione (circa 3e-6 relativo).
    """
    t = np.atleast_1d(np.asarray(jd, dtype=np.float64))
    s = sferiche_a_stato(*serie(t, corr, dcorr))
    m = matrici_data_j2000(t)
    out = np.empty_like(s)
    out[:, :3] = np.einsum("nij,nj->ni", m, s[:, :3])
    out[:, 3:] = np.einsum("nij,nj->ni", m, s[:, 3:]) / cst.GIORNO_S
    return out


# --- Correzioni degli argomenti (§ 7.4, § 8.4) ---

PASSO_NODI = 3652.5
N_NODI = 1214
SEMI_FINESTRA = 3652.5  # ±10 anni giuliani
PASSO_ADATTAMENTO = 1.0
SFASAMENTO_ADATTAMENTO = 0.25  # campioni a t_i + 0,25 + j: non coincidono con i nodi della griglia di 0,5 d
COLONNE = 6
PERTURBAZIONE = 1e-7  # rad (o adimensionale per κ) per lo jacobiano numerico


def tempi_nodi() -> NDArray[np.float64]:
    return cst.T0 + PASSO_NODI * np.arange(N_NODI, dtype=np.float64)


def correzioni(t: ArrayLike, valori: NDArray[np.float64], derivate: NDArray[np.float64]):
    """Correzioni (n, 6) e derivate (n, 6, per giorno) da spline di Hermite cubica sui nodi."""
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    return hermite_cubica(tt, cst.T0, PASSO_NODI, valori, derivate)


def sferiche(v: NDArray[np.float64]) -> tuple[NDArray[np.float64], ...]:
    """λ, β, Δ da vettori (n, 3)."""
    d = np.linalg.norm(v, axis=-1)
    return np.arctan2(v[:, 1], v[:, 0]), np.arcsin(v[:, 2] / d), d


class RiferimentoDE441:
    """Luna (301) rispetto alla Terra (399) da DE441, nell'eclittica J2000 e nell'eclittica della data."""

    def __init__(self, de: De441) -> None:
        self.de = de

    def stato_j2000(self, t: NDArray[np.float64]) -> NDArray[np.float64]:
        return icrf_a_eclittica(self.de.stato_icrf(301, 399, t))

    def sferiche_data(self, t: NDArray[np.float64]) -> tuple[NDArray[np.float64], ...]:
        v = self.stato_j2000(t)[:, :3]
        m = matrici_data_j2000(t)
        return sferiche(np.einsum("nji,nj->ni", m, v))


def _residui(lam_r, beta_r, dist_r, lam, beta, dist) -> NDArray[np.float64]:
    """Residui (n, 3) in radianti: Δλ·cos β, Δβ, ΔΔ/Δ."""
    dl = np.remainder(lam_r - lam + math.pi, 2.0 * math.pi) - math.pi
    return np.stack([dl * np.cos(beta_r), beta_r - beta, (dist_r - dist) / dist_r], axis=-1)


def _corr_da_parametri(p: NDArray[np.float64], tau: NDArray[np.float64]) -> NDArray[np.float64]:
    """p = [X0_j, X1_j] per le 6 colonne (κ come scarto da 1); X(t) = X0 + X1·τ, τ in finestre."""
    corr = p[0::2][None, :] + p[1::2][None, :] * tau[:, None]
    corr[:, 5] += 1.0
    return corr


def adatta_nodo(
    rif: RiferimentoDE441, ti: float, p0: NDArray[np.float64], con_kappa: bool, iterazioni: int = 6
) -> tuple[NDArray[np.float64], dict]:
    """Correzioni lineari (valore e pendenza) sulla finestra ti ± 10 anni, minimi quadrati (Gauss-Newton)."""
    t = (
        ti
        - SEMI_FINESTRA
        + SFASAMENTO_ADATTAMENTO
        + PASSO_ADATTAMENTO * np.arange(int(round(2 * SEMI_FINESTRA / PASSO_ADATTAMENTO)))
    )
    tau = (t - ti) / SEMI_FINESTRA
    lam_r, beta_r, dist_r = rif.sferiche_data(t)
    p = p0.copy()
    if not con_kappa:
        p[10:12] = 0.0
    attivi = np.arange(12) if con_kappa else np.arange(10)
    jac = None
    for _ in range(iterazioni):
        corr = _corr_da_parametri(p, tau)
        lam, beta, dist = serie(t, corr, derivate=False)
        res = _residui(lam_r, beta_r, dist_r, lam, beta, dist)
        if jac is None:
            jac = np.empty((t.size, 3, 12))
            for j in range(COLONNE):
                cp = corr.copy()
                cp[:, j] += PERTURBAZIONE
                lp, bp, dp = serie(t, cp, derivate=False)
                # derivata del modello: residuo(base) - residuo(perturbato)
                dres = (res - _residui(lam_r, beta_r, dist_r, lp, bp, dp)) / PERTURBAZIONE
                jac[:, :, 2 * j] = dres
                jac[:, :, 2 * j + 1] = dres * tau[:, None]
        a = jac[:, :, attivi].reshape(-1, attivi.size)
        dp = np.linalg.lstsq(a, res.reshape(-1), rcond=None)[0]
        p[attivi] += dp
        if np.max(np.abs(dp)) < 1e-13:
            break
    corr = _corr_da_parametri(p, tau)
    lam, beta, dist = serie(t, corr, derivate=False)
    res = _residui(lam_r, beta_r, dist_r, lam, beta, dist)
    ang = np.hypot(res[:, 0], res[:, 1]) * RAD_ARCSEC
    stat = {
        "maxArcsec": float(np.max(ang)),
        "rmsArcsec": float(np.sqrt(np.mean(ang**2))),
        "maxKm": float(np.max(np.abs(res[:, 2] * dist_r))),
    }
    return p, stat


def adatta(de: De441, con_kappa: bool, nodi: NDArray[np.int64] | None = None, verboso: bool = True):
    """Correzioni a tutti i nodi (o a un sottoinsieme), dal nodo più vicino a J2000 verso gli estremi.

    Restituisce valori (N, 6), derivate (N, 6) in /d e le statistiche per nodo.
    """
    tn = tempi_nodi()
    idx = [int(i) for i in (range(N_NODI) if nodi is None else nodi)]
    centro = min(idx, key=lambda i: abs(tn[i] - J2000))
    ordine = [centro] + [i for i in idx if i > centro] + [i for i in reversed(idx) if i < centro]
    rif = RiferimentoDE441(de)
    par: dict[int, NDArray[np.float64]] = {}
    stat: dict[int, dict] = {}
    t0 = time.time()
    for n_fatti, i in enumerate(ordine):
        vicino = i - 1 if i > centro else i + 1
        if vicino in par:
            p0 = par[vicino].copy()
            passo = (tn[i] - tn[vicino]) / SEMI_FINESTRA
            p0[0::2] = p0[0::2] + p0[1::2] * passo
        else:
            p0 = np.zeros(12)
        par[i], stat[i] = adatta_nodo(rif, float(tn[i]), p0, con_kappa)
        if verboso and n_fatti % 100 == 0:
            print(f"nodo {i} ({n_fatti + 1}/{len(ordine)}): {stat[i]}, {time.time() - t0:.0f} s", flush=True)
    valori = np.full((N_NODI, COLONNE), np.nan)
    derivate = np.full((N_NODI, COLONNE), np.nan)
    for i, p in par.items():
        valori[i] = p[0::2]
        valori[i, 5] += 1.0
        derivate[i] = p[1::2] / SEMI_FINESTRA
    return valori, derivate, stat


# --- File moon.bin (§ 8.4) ---

MAGIC = b"SSMOON01"
_FMT_TESTA = struct.Struct("<ddII")
OFFSET_DATI = binio.DIM_INTESTAZIONE + _FMT_TESTA.size  # 88


@dataclass(frozen=True)
class FileLuna:
    t0: float
    passo: float
    valori: NDArray[np.float64]  # (nodi, 6)
    derivate: NDArray[np.float64]  # (nodi, 6), per giorno


def scrivi_moon_bin(valori: NDArray[np.float64], derivate: NDArray[np.float64]) -> bytes:
    """Intestazione comune (tipo 4, blocco -1, voci = nodi, offset delle voci = 64), poi t_nodo0, passo,
    nodi, colonne e Float64 [nodi × colonne × 2] (valore, derivata)."""
    if valori.shape != (N_NODI, COLONNE) or derivate.shape != valori.shape:
        raise ValueError("forma delle correzioni non valida")
    if not (np.all(np.isfinite(valori)) and np.all(np.isfinite(derivate))):
        raise ValueError("correzioni non finite")
    dati = np.empty((N_NODI, COLONNE, 2), dtype="<f8")
    dati[:, :, 0] = valori
    dati[:, :, 1] = derivate
    dimensione = binio.allinea8(OFFSET_DATI + dati.nbytes)
    out = bytearray(dimensione)
    intest = binio.Intestazione(
        MAGIC, binio.TIPO_LUNA, -1, N_NODI, cst.T0, cst.T_END, binio.DIM_INTESTAZIONE, dimensione
    )
    out[: binio.DIM_INTESTAZIONE] = binio.scrivi_intestazione(intest)
    _FMT_TESTA.pack_into(out, binio.DIM_INTESTAZIONE, cst.T0, PASSO_NODI, N_NODI, COLONNE)
    out[OFFSET_DATI : OFFSET_DATI + dati.nbytes] = dati.tobytes()
    return bytes(out)


def leggi_moon_bin(buf: bytes) -> FileLuna:
    intest = binio.leggi_intestazione(buf)
    if intest.magic != MAGIC or intest.tipo != binio.TIPO_LUNA or intest.blocco != -1:
        raise binio.ErroreFormato("file della Luna non conforme")
    if intest.offset_voci != binio.DIM_INTESTAZIONE:
        raise binio.ErroreFormato("offset dei dati della Luna non conforme")
    t0, passo, nodi, colonne = _FMT_TESTA.unpack_from(buf, binio.DIM_INTESTAZIONE)
    if colonne != COLONNE or nodi != intest.n_voci or nodi < 2:
        raise binio.ErroreFormato("colonne o nodi non conformi")
    if not (math.isfinite(t0) and passo > 0 and t0 <= intest.inizio and t0 + passo * (nodi - 1) >= intest.fine):
        raise binio.ErroreFormato("nodi non coprono il nucleo")
    if OFFSET_DATI + nodi * colonne * 16 > intest.dimensione:
        raise binio.ErroreFormato("file troppo corto")
    dati = np.frombuffer(buf, dtype="<f8", count=nodi * colonne * 2, offset=OFFSET_DATI).reshape(nodi, colonne, 2)
    if not np.all(np.isfinite(dati)):
        raise binio.ErroreFormato("dati non finiti")
    return FileLuna(t0, passo, dati[:, :, 0].copy(), dati[:, :, 1].copy())


class ModelloLuna:
    """Luna dal file moon.bin: correzioni, serie, catena di riferimento; Terra da EMB e Luna."""

    def __init__(self, f: FileLuna) -> None:
        if f.t0 != cst.T0 or f.passo != PASSO_NODI:
            raise ValueError("nodi diversi da quelli del § 8.4")
        self.f = f

    @classmethod
    def da_file(cls, percorso: Path = PERCORSO_MOON) -> ModelloLuna:
        return cls(leggi_moon_bin(Path(percorso).read_bytes()))

    def correzioni(self, t: ArrayLike):
        return correzioni(t, self.f.valori, self.f.derivate)

    def stato_geocentrico(self, t: ArrayLike) -> NDArray[np.float64]:
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        if np.any(tt < cst.T0) or np.any(tt >= cst.T_END):
            raise ValueError("istante fuori copertura")
        c, dc = self.correzioni(tt)
        return stato_geocentrico(tt, c, dc)

    def sferiche_data(self, t: NDArray[np.float64]) -> tuple[NDArray[np.float64], ...]:
        c, _ = self.correzioni(t)
        return serie(t, c, derivate=False)

    def orientamento(self, t: ArrayLike) -> NDArray[np.float64]:
        """Matrici (n, 3, 3) dal sistema solidale alla Luna all'eclittica J2000 (leggi di Cassini, § 7.4)."""
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        c, _ = self.correzioni(tt)
        return orientamento_cassini(tt, c)


def stato_terra(emb: NDArray[np.float64], luna_geo: NDArray[np.float64]) -> NDArray[np.float64]:
    """r_Terra = r_EMB - r_Luna,geo/(1 + EMRAT) (§ 7.3.5); anche per le velocità."""
    return emb - luna_geo / (1.0 + cst.EMRAT)


# --- Orientamento (§ 7.4) ---

INCLINAZIONE_EQUATORE = 1.543 * GRADI


def _rz(a: NDArray[np.float64]) -> NDArray[np.float64]:
    c, s = np.cos(a), np.sin(a)
    z, u = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([c, -s, z], -1), np.stack([s, c, z], -1), np.stack([z, z, u], -1)], -2)


def _rx(a: float) -> NDArray[np.float64]:
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def orientamento_cassini(t: NDArray[np.float64], corr: NDArray[np.float64]) -> NDArray[np.float64]:
    """R = M(t)·R_z(Ω + π)·R_x(I)·R_z(F): colonne = assi x (verso la Terra media), y, z (polo) della Luna.

    Ω = L' - F nodo ascendente medio dell'orbita; il nodo ascendente dell'equatore è Ω + π; il
    meridiano principale, a distanza F dal nodo lungo l'equatore, punta a L' + π (Terra media).
    """
    a = argomenti(t, corr)
    nodo_eq = a["L1"] - a["F"] + math.pi
    r = _rz(nodo_eq) @ _rx(INCLINAZIONE_EQUATORE) @ _rz(a["F"])
    return matrici_data_j2000(t) @ r


# --- Generazione e validazione (A5) ---

TOLL_ARCSEC = 60.0
TOLL_KM = 50.0
PASSO_VALIDAZIONE = 0.5
CAMPIONI_PER_LOTTO = 36525


def genera(con_kappa: bool = True, percorso: Path = PERCORSO_MOON, rapporto: Path | None = None) -> str:
    with De441() as de:
        valori, derivate, stat = adatta(de, con_kappa)
    if not con_kappa:
        valori[:, 5] = 1.0
        derivate[:, 5] = 0.0
    dati = scrivi_moon_bin(valori, derivate)
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_bytes(dati)
    if rapporto is not None:
        voci = [{"nodo": i, "t": float(tempi_nodi()[i]), **stat[i]} for i in sorted(stat)]
        peggiore = max(voci, key=lambda v: v["maxArcsec"])
        r = {
            "conKappa": con_kappa,
            "finestraGiorni": 2 * SEMI_FINESTRA,
            "passoAdattamento": PASSO_ADATTAMENTO,
            "peggiore": peggiore,
            "nodi": voci,
        }
        rapporto.parent.mkdir(parents=True, exist_ok=True)
        rapporto.write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return sha256_bytes(dati)


def errore_angolare(a: NDArray[np.float64], b: NDArray[np.float64]) -> NDArray[np.float64]:
    """Angolo tra vettori (n, 3) in secondi d'arco (atan2 di |a×b| e a·b)."""
    return np.arctan2(np.linalg.norm(np.cross(a, b), axis=1), np.sum(a * b, axis=1)) * RAD_ARCSEC


def valida(modello: ModelloLuna, passo: float = PASSO_VALIDAZIONE, verboso: bool = True) -> dict:
    """Errore geocentrico contro DE441 (301 - 399) su griglia di passo `passo` da T0 a T_END (nodi inclusi)."""
    n_tot = int(math.ceil((cst.T_END - cst.T0) / passo))
    intervalli = np.zeros(N_NODI - 1)
    intervalli_km = np.zeros(N_NODI - 1)
    millenni: dict[int, list[float]] = {}
    mx = {"ang": (0.0, 0.0), "km": (0.0, 0.0), "kmVett": (0.0, 0.0), "vel": (0.0, 0.0)}
    somma2 = 0.0
    t_ini = time.time()
    with De441() as de:
        rif_de = RiferimentoDE441(de)
        for inizio in range(0, n_tot, CAMPIONI_PER_LOTTO):
            j = np.arange(inizio, min(inizio + CAMPIONI_PER_LOTTO, n_tot), dtype=np.float64)
            t = cst.T0 + passo * j
            rif = rif_de.stato_j2000(t)
            mod = modello.stato_geocentrico(t)
            ang = errore_angolare(mod[:, :3], rif[:, :3])
            dd = np.abs(np.linalg.norm(mod[:, :3], axis=1) - np.linalg.norm(rif[:, :3], axis=1))
            dr = np.linalg.norm(mod[:, :3] - rif[:, :3], axis=1)
            dv = np.linalg.norm(mod[:, 3:] - rif[:, 3:], axis=1)
            somma2 += float(np.sum(ang**2))
            for nome, x in (("ang", ang), ("km", dd), ("kmVett", dr), ("vel", dv)):
                i = int(np.argmax(x))
                if x[i] > mx[nome][0]:
                    mx[nome] = (float(x[i]), float(t[i]))
            iv = np.minimum(np.floor((t - cst.T0) / PASSO_NODI).astype(np.int64), N_NODI - 2)
            np.maximum.at(intervalli, iv, ang)
            np.maximum.at(intervalli_km, iv, dd)
            anni = np.floor((2000.0 + (t - J2000) / 365.25) / 1000.0).astype(np.int64)
            for a_ in np.unique(anni):
                m = anni == a_
                v = millenni.setdefault(int(a_), [0.0, 0.0, 0.0, 0])
                v[0] = max(v[0], float(np.max(ang[m])))
                v[1] = max(v[1], float(np.max(dd[m])))
                v[2] += float(np.sum(ang[m] ** 2))
                v[3] += int(np.sum(m))
            if verboso and (inizio // CAMPIONI_PER_LOTTO) % 40 == 0:
                print(
                    f"{inizio}/{n_tot}: max {mx['ang'][0]:.2f}″, {mx['km'][0]:.2f} km, {time.time() - t_ini:.0f} s",
                    flush=True,
                )
    return {
        "passoGiorni": passo,
        "campioni": n_tot,
        "maxArcsec": mx["ang"][0],
        "tMaxArcsec": mx["ang"][1],
        "rmsArcsec": math.sqrt(somma2 / n_tot),
        "maxKmDistanza": mx["km"][0],
        "tMaxKm": mx["km"][1],
        "maxKmVettore": mx["kmVett"][0],
        "maxVelocitaKmS": mx["vel"][0],
        "superato": bool(mx["ang"][0] <= TOLL_ARCSEC and mx["km"][0] <= TOLL_KM),
        "millenni": {
            str(k * 1000): {"maxArcsec": v[0], "maxKm": v[1], "rmsArcsec": math.sqrt(v[2] / v[3])}
            for k, v in sorted(millenni.items())
        },
        "maxArcsecPerIntervallo": [float(x) for x in intervalli],
        "maxKmPerIntervallo": [float(x) for x in intervalli_km],
        "secondi": round(time.time() - t_ini, 1),
    }


def confronto_kappa(ogni: int = 25) -> dict:
    """Residui delle finestre con e senza κ su un nodo ogni `ogni` (spike S1)."""
    nodi = np.arange(0, N_NODI, ogni)
    out = {}
    with De441() as de:
        for con in (False, True):
            _, _, stat = adatta(de, con, nodi, verboso=False)
            out["conKappa" if con else "senzaKappa"] = {str(i): stat[i] for i in sorted(stat)}
    return out


# --- Affidabilità (§ 7.8.1, § 8.7) ---

EPS_MODELLO_ARCSEC = 60.0  # tolleranza del modello (§ 7.4)
SIGMA_NDOT_ARCSEC_CY2 = 0.2  # I11; confronto con Williams e Boggs 2016 in docs/_parti/pianeti-luna.md
PERCORSO_AFFIDABILITA = CARTELLA_OUT / "reliability-moon.json"


def eps_luna(t: ArrayLike) -> NDArray[np.float64]:
    """ε_modello = 60″ ⊕ ½·σ_ṅ·τ² (rad), τ in secoli giuliani da J2000 (I11)."""
    tau = (np.asarray(t, dtype=np.float64) - J2000) / GIORNI_SECOLO
    mareale = 0.5 * SIGMA_NDOT_ARCSEC_CY2 * tau * tau
    return np.hypot(EPS_MODELLO_ARCSEC, mareale) / RAD_ARCSEC


def frammento_affidabilita() -> dict:
    """Massimo di ε in [nodo, nodo successivo) ∩ [T0, T_END] per intervallo della griglia di reliability.bin
    (common.affidabilita): all'estremo più lontano da J2000."""
    bordi = ca.bordi()
    a = bordi[:-1]
    b = np.minimum(bordi[1:], cst.T_END)
    if np.any(a >= cst.T_END) or bordi[-1] < cst.T_END:
        raise ValueError("gli intervalli di affidabilità non coprono [T0, T_END)")
    eps = np.maximum(eps_luna(a), eps_luna(b))
    return {
        "formato": 2,
        **ca.griglia(),
        "corpi": {
            "luna": {
                "log10eps": [float(x) for x in np.log10(eps)],
                "formaDeterminata": [True] * ca.NODI,
                "datiPresenti": [True] * ca.NODI,
            }
        },
    }


def scrivi_affidabilita(percorso: Path = PERCORSO_AFFIDABILITA) -> Path:
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(json.dumps(frammento_affidabilita(), ensure_ascii=False) + "\n", encoding="utf-8")
    return percorso


# --- Fixture per i test TypeScript ---

SEME_FIXTURE = 20261102
N_EPOCHE_FIXTURE = 2000
N_ORIENTAMENTO = 50
COLONNE_FIXTURE = (
    "t",
    "xDE441",
    "yDE441",
    "zDE441",
    "vxDE441",
    "vyDE441",
    "vzDE441",
    "x",
    "y",
    "z",
    "vx",
    "vy",
    "vz",
    "xTerraDE441",
    "yTerraDE441",
    "zTerraDE441",
)


def epoche_fixture() -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """2000 epoche uniformi in [T0, T_END) e i nodi dentro [T0, T_END)."""
    rng = np.random.default_rng(SEME_FIXTURE)
    tn = tempi_nodi()
    return np.sort(rng.uniform(cst.T0, cst.T_END, N_EPOCHE_FIXTURE)), tn[tn < cst.T_END]


def genera_fixture(cartella: Path = CARTELLA_FIXTURE, percorso: Path = PERCORSO_MOON) -> Path:
    """Luna geocentrica DE441 e del modello, Terra eliocentrica DE441 (399), orientamenti, esempio 47.a."""
    cartella.mkdir(parents=True, exist_ok=True)
    modello = ModelloLuna.da_file(percorso)
    tu, tn = epoche_fixture()
    t = np.concatenate([tu, tn])
    with De441() as de:
        rif = RiferimentoDE441(de).stato_j2000(t)
        terra = de.stato_eliocentrico(399, t)
    mod = modello.stato_geocentrico(t)
    tab = np.ascontiguousarray(np.column_stack([t, rif, mod, terra[:, :3]]), dtype="<f8")
    (cartella / "luna-de441.bin").write_bytes(tab.tobytes())
    rng = np.random.default_rng(SEME_FIXTURE + 1)
    to = np.sort(rng.uniform(cst.T0, cst.T_END, N_ORIENTAMENTO))
    ori = modello.orientamento(to)
    c, dc = modello.correzioni(to)
    lam, beta, dist, dlam, dbeta, ddist = serie(np.array([2448724.5]))
    meta = {
        "descrizione": "Luna geocentrica (DE441 301 - 399 e modello moon.bin valutato in Python), Terra DE441 (399)",
        "generatore": "scripts/pipeline/moon.py fixture",
        "seme": SEME_FIXTURE,
        "file": "luna-de441.bin",
        "sha256": sha256_bytes(tab.tobytes()),
        "colonne": list(COLONNE_FIXTURE),
        "righe": int(tab.shape[0]),
        "epocheUniformi": int(tu.size),
        "nodi": int(tn.size),
        "unita": {"t": "JD TDB", "posizioni": "km, eclittica J2000", "velocita": "km/s"},
        "nota": "righe: 2000 epoche uniformi in [T0, T_END), poi i nodi della spline dentro [T0, T_END)",
        "soglie": {"arcsec": TOLL_ARCSEC, "km": TOLL_KM},
        "sha256MoonBin": sha256_bytes(Path(percorso).read_bytes()),
        "tolleranzaPipelineKm": 1e-6,
        "orientamento": [
            {
                "t": float(x),
                "matrice": [float(v) for v in m.ravel()],
                "correzioni": [float(v) for v in cc],
                "derivate": [float(v) for v in dd],
            }
            for x, m, cc, dd in zip(to, ori, c, dc, strict=True)
        ],
        "esempio47a": {
            "fonte": "Meeus (1998), Astronomical Algorithms, 2a ed., esempio 47.a: 1992-04-12 0h TD",
            "jd": 2448724.5,
            "lambdaGradiAtteso": 133.162655,
            "betaGradiAtteso": -3.229126,
            "distanzaKmAttesa": 368409.7,
            "calcolato": [
                float(lam[0]),
                float(beta[0]),
                float(dist[0]),
                float(dlam[0]),
                float(dbeta[0]),
                float(ddist[0]),
            ],
        },
    }
    p = cartella / "luna.json"
    p.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Luna: correzioni, moon.bin, validazione (§ 7.4, § 8.4, A5)")
    ap.add_argument("azione", choices=("genera", "valida", "kappa", "affidabilita", "fixture"))
    ap.add_argument("--senza-kappa", action="store_true")
    ap.add_argument("--passo", type=float, default=PASSO_VALIDAZIONE)
    a = ap.parse_args(argv)
    CARTELLA_OUT.mkdir(parents=True, exist_ok=True)
    if a.azione == "genera":
        print(genera(not a.senza_kappa, rapporto=CARTELLA_OUT / "adattamento-luna.json"))
    elif a.azione == "valida":
        r = valida(ModelloLuna.da_file(), a.passo)
        (CARTELLA_OUT / "validazione-luna.json").write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n")
        print({k: v for k, v in r.items() if not k.startswith("maxArcsecPer") and not k.startswith("maxKmPer")})
        return 0 if r["superato"] else 1
    elif a.azione == "kappa":
        r = confronto_kappa()
        (CARTELLA_OUT / "kappa-luna.json").write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n")
    elif a.azione == "affidabilita":
        print(scrivi_affidabilita())
    else:
        print(genera_fixture())
    return 0


if __name__ == "__main__":
    sys.exit(main())
