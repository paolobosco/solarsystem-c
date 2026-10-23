"""Elementi cometari (q, e, i, Ω, ω, T) <-> stato, per ellisse, parabola e iperbole, vettorializzati.

Unità: km, km/s, km^3/s^2, radianti, JD TDB. Formule classiche del problema dei due corpi
(Danby 1988, Fundamentals of Celestial Mechanics, cap. 6; equazione di Barker per la parabola).
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

from common.constants import GIORNO_S

DUE_PI = 2.0 * math.pi
EPS_PARABOLA = 1e-12
MAX_ITER = 60


def _kepler_ellittico(m: NDArray, e: NDArray) -> NDArray:
    """E da M = E - e·sin E, con M ridotta a [-π, π); partenza di Danby."""
    mr = m - DUE_PI * np.floor((m + math.pi) / DUE_PI)
    ea = mr + 0.85 * e * np.sign(np.sin(mr))
    for _ in range(MAX_ITER):
        f = ea - e * np.sin(ea) - mr
        d = f / (1.0 - e * np.cos(ea))
        ea = ea - d
        if np.all(np.abs(d) <= 1e-15 * np.maximum(1.0, np.abs(ea))):
            break
    return ea + (m - mr)


def _kepler_iperbolico(nn: NDArray, e: NDArray) -> NDArray:
    """H da N = e·sinh H - H; partenza H0 = segno(N)·ln(2|N|/e + 1,8)."""
    hh = np.sign(nn) * np.log(2.0 * np.abs(nn) / e + 1.8)
    for _ in range(MAX_ITER * 2):
        f = e * np.sinh(hh) - hh - nn
        d = f / (e * np.cosh(hh) - 1.0)
        hh = hh - d
        if np.all(np.abs(d) <= 1e-15 * np.maximum(1.0, np.abs(hh))):
            break
    return hh


def _matrice_rotazione(inc: NDArray, nodo: NDArray, argperi: NDArray) -> NDArray:
    """Matrici (n, 3, 3) dal piano perifocale all'eclittica: Rz(Ω)·Rx(i)·Rz(ω)."""
    co, so = np.cos(nodo), np.sin(nodo)
    ci, si = np.cos(inc), np.sin(inc)
    cw, sw = np.cos(argperi), np.sin(argperi)
    m = np.empty(inc.shape + (3, 3))
    m[..., 0, 0] = co * cw - so * sw * ci
    m[..., 0, 1] = -co * sw - so * cw * ci
    m[..., 0, 2] = so * si
    m[..., 1, 0] = so * cw + co * sw * ci
    m[..., 1, 1] = -so * sw + co * cw * ci
    m[..., 1, 2] = -co * si
    m[..., 2, 0] = sw * si
    m[..., 2, 1] = cw * si
    m[..., 2, 2] = ci
    return m


def stato_da_cometari(
    q: ArrayLike,
    e: ArrayLike,
    inc: ArrayLike,
    nodo: ArrayLike,
    argperi: ArrayLike,
    tp: ArrayLike,
    t: ArrayLike,
    mu: float,
) -> NDArray[np.float64]:
    """Stato (n, 6) [km, km/s] all'istante t (JD) da q [km], e, angoli [rad], T del perielio [JD]."""
    q_, e_, i_, o_, w_, tp_, t_ = np.broadcast_arrays(
        *(np.atleast_1d(np.asarray(x, dtype=np.float64)) for x in (q, e, inc, nodo, argperi, tp, t))
    )
    n = q_.size
    dt = (t_ - tp_) * GIORNO_S
    x = np.empty(n)
    y = np.empty(n)
    vx = np.empty(n)
    vy = np.empty(n)
    ell = e_ < 1.0 - EPS_PARABOLA
    ipe = e_ > 1.0 + EPS_PARABOLA
    par = ~(ell | ipe)
    if np.any(ell):
        ee = e_[ell]
        a = q_[ell] / (1.0 - ee)
        nm = np.sqrt(mu / a**3)
        ea = _kepler_ellittico(nm * dt[ell], ee)
        ce, se = np.cos(ea), np.sin(ea)
        b = a * np.sqrt(1.0 - ee * ee)
        den = 1.0 - ee * ce
        x[ell] = a * (ce - ee)
        y[ell] = b * se
        vx[ell] = -a * nm * se / den
        vy[ell] = b * nm * ce / den
    if np.any(ipe):
        ee = e_[ipe]
        a = q_[ipe] / (ee - 1.0)  # |a|
        nm = np.sqrt(mu / a**3)
        hh = _kepler_iperbolico(nm * dt[ipe], ee)
        ch, sh = np.cosh(hh), np.sinh(hh)
        b = a * np.sqrt(ee * ee - 1.0)
        den = ee * ch - 1.0
        x[ipe] = a * (ee - ch)
        y[ipe] = b * sh
        vx[ipe] = -a * nm * sh / den
        vy[ipe] = b * nm * ch / den
    if np.any(par):
        qq = q_[par]
        # Barker: tan(ν/2) = D, D + D³/3 = √(μ/(2q³))·Δt
        w = 1.5 * np.sqrt(mu / (2.0 * qq**3)) * dt[par]
        d = np.cbrt(w + np.sqrt(w * w + 1.0)) - np.cbrt(np.sqrt(w * w + 1.0) - w)
        nu = 2.0 * np.arctan(d)
        r = qq * (1.0 + d * d)
        x[par] = r * np.cos(nu)
        y[par] = r * np.sin(nu)
        p = 2.0 * qq
        fatt = np.sqrt(mu / p)
        vx[par] = -fatt * np.sin(nu)
        vy[par] = fatt * (1.0 + np.cos(nu))
    m = _matrice_rotazione(i_, o_, w_)
    out = np.empty((n, 6))
    out[:, :3] = m[:, :, 0] * x[:, None] + m[:, :, 1] * y[:, None]
    out[:, 3:] = m[:, :, 0] * vx[:, None] + m[:, :, 1] * vy[:, None]
    return out


def cometari_da_stato(stato: ArrayLike, t: ArrayLike, mu: float) -> dict[str, NDArray[np.float64]]:
    """Elementi osculanti da stati (n, 6) [km, km/s] agli istanti t (JD).

    Restituisce q [km], e, i, Ω, ω [rad], tp [JD] (ultimo o prossimo perielio, il più vicino a t
    per l'ellisse), a [km] (negativo per l'iperbole, inf per la parabola), M [rad] (ellisse: [0, 2π);
    iperbole: e·sinh H - H), n [rad/d].
    """
    s = np.atleast_2d(np.asarray(stato, dtype=np.float64))
    tt = np.broadcast_to(np.atleast_1d(np.asarray(t, dtype=np.float64)), (s.shape[0],))
    r = s[:, :3]
    v = s[:, 3:]
    rn = np.linalg.norm(r, axis=1)
    hv = np.cross(r, v)
    hn = np.linalg.norm(hv, axis=1)
    ev = np.cross(v, hv) / mu - r / rn[:, None]
    e = np.linalg.norm(ev, axis=1)
    inc = np.arctan2(np.hypot(hv[:, 0], hv[:, 1]), hv[:, 2])
    nodo = np.mod(np.arctan2(hv[:, 0], -hv[:, 1]), DUE_PI)
    nx, ny = np.cos(nodo), np.sin(nodo)
    w = hv / hn[:, None]
    mx, my, mz = -w[:, 2] * ny, w[:, 2] * nx, w[:, 0] * ny - w[:, 1] * nx
    argperi = np.mod(np.arctan2(ev[:, 0] * mx + ev[:, 1] * my + ev[:, 2] * mz, ev[:, 0] * nx + ev[:, 1] * ny), DUE_PI)
    u = np.arctan2(r[:, 0] * mx + r[:, 1] * my + r[:, 2] * mz, r[:, 0] * nx + r[:, 1] * ny)
    nu = u - argperi
    nu = nu - DUE_PI * np.floor((nu + math.pi) / DUE_PI)
    p = hn * hn / mu
    q = p / (1.0 + e)
    a = np.full_like(e, np.inf)
    mm = np.zeros_like(e)
    n = np.zeros_like(e)
    ell = e < 1.0 - EPS_PARABOLA
    ipe = e > 1.0 + EPS_PARABOLA
    a[ell] = p[ell] / (1.0 - e[ell] ** 2)
    a[ipe] = p[ipe] / (1.0 - e[ipe] ** 2)
    n[ell | ipe] = np.sqrt(mu / np.abs(a[ell | ipe]) ** 3) * GIORNO_S
    if np.any(ell):
        ee = e[ell]
        ea = np.arctan2(np.sqrt(1.0 - ee * ee) * np.sin(nu[ell]), ee + np.cos(nu[ell]))
        mm[ell] = ea - ee * np.sin(ea)  # in (-π, π]: perielio più vicino
    if np.any(ipe):
        ee = e[ipe]
        hh = np.arcsinh(np.sqrt(ee * ee - 1.0) * np.sin(nu[ipe]) / (1.0 + ee * np.cos(nu[ipe])))
        mm[ipe] = ee * np.sinh(hh) - hh
    par = ~(ell | ipe)
    tp = np.empty_like(e)
    tp[ell | ipe] = tt[ell | ipe] - mm[ell | ipe] / n[ell | ipe]
    if np.any(par):
        d = np.tan(0.5 * nu[par])
        tp[par] = tt[par] - (d + d**3 / 3.0) / (np.sqrt(mu / (2.0 * q[par] ** 3)) * GIORNO_S)
    mm[ell] = np.mod(mm[ell], DUE_PI)
    return {"q": q, "e": e, "i": inc, "nodo": nodo, "argperi": argperi, "tp": tp, "a": a, "M": mm, "n": n}
