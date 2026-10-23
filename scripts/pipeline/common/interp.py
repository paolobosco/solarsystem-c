"""Interpolazione su griglia uniforme, identica al runtime TypeScript.

- Lagrange a 8 punti (§ 7.3.3): x = (t - t_primo)/h, j = floor(x) limitato a [3, N - 5], u = x - j;
  campioni j-3..j+4 con nodi a scarto m = -3..4; peso w_m = Π_{n≠m}(u - n) / D_m, prodotto in ordine
  crescente di n, D_m = Π_{n≠m}(m - n); somma in ordine crescente di m.
- Hermite cubica (§ 7.6.3, segmenti C): j = floor(x) limitato a [0, N - 2], s = x - j, base
  h00 = 2s³ - 3s² + 1, h10 = s³ - 2s² + s, h01 = -2s³ + 3s², h11 = s³ - s², derivate divise per h.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

SCARTI_LAGRANGE = tuple(range(-3, 5))
PUNTI_LAGRANGE = len(SCARTI_LAGRANGE)


def _denominatori() -> tuple[float, ...]:
    out = []
    for m in SCARTI_LAGRANGE:
        d = 1.0
        for n in SCARTI_LAGRANGE:
            if n != m:
                d *= m - n
        out.append(d)
    return tuple(out)


# D_m per m = -3..4: -5040, 720, -240, 144, -144, 240, -720, 5040.
DENOMINATORI_LAGRANGE = _denominatori()


def indice_e_frazione(
    t: ArrayLike, t_primo: float, h: float, j_min: int, j_max: int
) -> tuple[NDArray[np.int64], NDArray[np.float64]]:
    """Indice del nodo sinistro (limitato a [j_min, j_max]) e frazione u = x - j."""
    x = (np.asarray(t, dtype=np.float64) - t_primo) / h
    j = np.clip(np.floor(x), j_min, j_max)
    return j.astype(np.int64), x - j


def pesi_lagrange8(u: ArrayLike) -> NDArray[np.float64]:
    """Pesi (..., 8) dei campioni j-3..j+4 per la frazione u."""
    uu = np.asarray(u, dtype=np.float64)
    out = np.empty(uu.shape + (PUNTI_LAGRANGE,), dtype=np.float64)
    for im, m in enumerate(SCARTI_LAGRANGE):
        num = np.ones_like(uu)
        for n in SCARTI_LAGRANGE:
            if n != m:
                num = num * (uu - n)
        out[..., im] = num / DENOMINATORI_LAGRANGE[im]
    return out


def lagrange8(t: ArrayLike, t_primo: float, h: float, valori: ArrayLike) -> NDArray[np.float64]:
    """Interpola valori (N, C) campionati a t_primo + j·h; restituisce (n, C) per t (n,)."""
    v = np.asarray(valori, dtype=np.float64)
    if v.ndim == 1:
        v = v[:, None]
    n_camp = v.shape[0]
    if n_camp < PUNTI_LAGRANGE:
        raise ValueError("servono almeno 8 campioni")
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    j, u = indice_e_frazione(tt, t_primo, h, 3, n_camp - 5)
    w = pesi_lagrange8(u)
    out = np.zeros((tt.size, v.shape[1]), dtype=np.float64)
    for im, m in enumerate(SCARTI_LAGRANGE):
        out += w[:, im, None] * v[j + m]
    return out


def basi_hermite(s: ArrayLike) -> tuple[NDArray[np.float64], ...]:
    """Basi h00, h10, h01, h11 e derivate rispetto a s."""
    s_ = np.asarray(s, dtype=np.float64)
    s2 = s_ * s_
    s3 = s2 * s_
    h00 = 2.0 * s3 - 3.0 * s2 + 1.0
    h10 = s3 - 2.0 * s2 + s_
    h01 = -2.0 * s3 + 3.0 * s2
    h11 = s3 - s2
    d00 = 6.0 * s2 - 6.0 * s_
    d10 = 3.0 * s2 - 4.0 * s_ + 1.0
    d01 = -6.0 * s2 + 6.0 * s_
    d11 = 3.0 * s2 - 2.0 * s_
    return h00, h10, h01, h11, d00, d10, d01, d11


def hermite_cubica(
    t: ArrayLike, t_primo: float, h: float, posizioni: ArrayLike, velocita: ArrayLike
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Posizione e velocità (n, C) per t (n,), da campioni (N, C); velocità nell'unità di h.

    p = h00·p0 + h10·(h·v0) + h01·p1 + h11·(h·v1); v = (d00·p0 + d01·p1)/h + d10·v0 + d11·v1.
    """
    p = np.asarray(posizioni, dtype=np.float64)
    v = np.asarray(velocita, dtype=np.float64)
    n_camp = p.shape[0]
    if n_camp < 2:
        raise ValueError("servono almeno 2 campioni")
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    j, s = indice_e_frazione(tt, t_primo, h, 0, n_camp - 2)
    h00, h10, h01, h11, d00, d10, d01, d11 = (b[:, None] for b in basi_hermite(s))
    p0, p1, v0, v1 = p[j], p[j + 1], v[j], v[j + 1]
    pos = h00 * p0 + h10 * (h * v0) + h01 * p1 + h11 * (h * v1)
    vel = (d00 * p0 + d01 * p1) / h + d10 * v0 + d11 * v1
    return pos, vel


def tempi_campioni(t_primo: float, h: float, n_campioni: int) -> NDArray[np.float64]:
    """Istanti t_primo + j·h, j = 0..N-1."""
    return t_primo + h * np.arange(n_campioni, dtype=np.float64)


def griglia(inizio: float, fine: float, h: float, alone_sx: int, alone_dx: int, origine: float) -> tuple[float, int]:
    """t_primo e N per coprire il nucleo [inizio, fine) con nodi origine + m·h e aloni dati.

    Nodo iniziale: l'ultimo ≤ inizio; nodo finale: il primo ≥ fine. alone_sx nodi precedono il nodo
    iniziale, alone_dx nodi seguono il nodo finale. Segmenti E: 4 e 3 (4 campioni fuori dal nucleo
    per lato, contando il nodo finale); segmenti C: 1 e 0.
    """
    m_s = math.floor((inizio - origine) / h)
    m_e = math.ceil((fine - origine) / h)
    t_primo = origine + (m_s - alone_sx) * h
    return t_primo, (m_e - m_s) + alone_sx + alone_dx + 1
