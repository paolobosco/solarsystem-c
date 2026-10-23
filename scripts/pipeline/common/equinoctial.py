"""Elementi equinoziali con fattore retrogrado I (§ 7.2), vettorializzati.

Riferimento: Broucke, R. A., Cefola, P. J. (1972), On the equinoctial orbit elements,
Celestial Mechanics 5, 303-310, doi:10.1007/BF01228432.
Elementi: a, h = e·sin(ω + I·Ω), k = e·cos(ω + I·Ω), p = tan^I(i/2)·sin Ω, q = tan^I(i/2)·cos Ω,
λ = M + ω + I·Ω; I = +1 per i ≤ 90°, -1 per i > 90°. Solo orbite ellittiche (e < 1).
Unità: km, km/s, km^3/s^2, rad. Colonne degli array di elementi: [a, h, k, p, q, λ].
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

DUE_PI = 2.0 * math.pi
TOLLERANZA_KEPLERO = 1e-15
MAX_ITERAZIONI_KEPLERO = 30


def riduci_angolo(x: ArrayLike) -> NDArray[np.float64]:
    """Riduzione a [-π, π): x - 2π·floor((x + π)/(2π))."""
    a = np.asarray(x, dtype=np.float64)
    return a - DUE_PI * np.floor((a + math.pi) / DUE_PI)


def fattore_retrogrado(inclinazione: ArrayLike) -> NDArray[np.int8]:
    """I = +1 per i ≤ 90°, -1 altrimenti (i in radianti)."""
    i = np.asarray(inclinazione, dtype=np.float64)
    return np.where(i <= 0.5 * math.pi, 1, -1).astype(np.int8)


def risolvi_keplero(lam: ArrayLike, h: ArrayLike, k: ArrayLike) -> NDArray[np.float64]:
    """Longitudine eccentrica F da F - k·sin F + h·cos F = λ (Newton).

    λ è ridotto a [-π, π) prima della soluzione. Partenza di Danby (1987):
    F0 = λ + 0,85·e·sign(k·sin λ - h·cos λ). Arresto a |ΔF| ≤ 1e-15 rad o dopo 30 iterazioni.
    """
    lr = riduci_angolo(lam)
    hh = np.asarray(h, dtype=np.float64)
    kk = np.asarray(k, dtype=np.float64)
    lr, hh, kk = np.broadcast_arrays(lr, hh, kk)
    e = np.sqrt(hh * hh + kk * kk)
    f = lr + 0.85 * e * np.sign(kk * np.sin(lr) - hh * np.cos(lr))
    attivo = np.ones(f.shape, dtype=bool)
    for _ in range(MAX_ITERAZIONI_KEPLERO):
        s = np.sin(f)
        c = np.cos(f)
        df = (f - kk * s + hh * c - lr) / (1.0 - kk * c - hh * s)
        f = np.where(attivo, f - df, f)
        attivo &= np.abs(df) > TOLLERANZA_KEPLERO
        if not np.any(attivo):
            break
    return f


def _vettori_fg(
    p: NDArray[np.float64], q: NDArray[np.float64], fi: NDArray[np.float64]
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Versori f, g del sistema equinoziale (forma (..., 3))."""
    p2 = p * p
    q2 = q * q
    s2 = 1.0 + p2 + q2
    f = np.stack([(1.0 - p2 + q2) / s2, 2.0 * p * q / s2, -2.0 * fi * p / s2], axis=-1)
    g = np.stack([2.0 * fi * p * q / s2, (1.0 + p2 - q2) * fi / s2, 2.0 * q / s2], axis=-1)
    return f, g


def stato_da_elementi(elementi: ArrayLike, mu: ArrayLike, fattore_i: ArrayLike) -> NDArray[np.float64]:
    """Stato (..., 6) [km, km/s] da elementi (..., 6) [a, h, k, p, q, λ], μ in km^3/s^2."""
    el = np.asarray(elementi, dtype=np.float64)
    a, h, k, p, q, lam = (el[..., i] for i in range(6))
    mu_ = np.asarray(mu, dtype=np.float64)
    fi = np.asarray(fattore_i, dtype=np.float64)
    ff = risolvi_keplero(lam, h, k)
    cf = np.cos(ff)
    sf = np.sin(ff)
    beta = 1.0 / (1.0 + np.sqrt(1.0 - h * h - k * k))
    r = a * (1.0 - k * cf - h * sf)
    n = np.sqrt(mu_ / (a * a * a))
    x1 = a * ((1.0 - beta * h * h) * cf + h * k * beta * sf - k)
    y1 = a * ((1.0 - beta * k * k) * sf + h * k * beta * cf - h)
    fatt = n * a * a / r
    vx1 = fatt * (h * k * beta * cf - (1.0 - beta * h * h) * sf)
    vy1 = fatt * ((1.0 - beta * k * k) * cf - h * k * beta * sf)
    f, g = _vettori_fg(p, q, np.broadcast_to(fi, p.shape))
    out = np.empty(np.broadcast_shapes(el.shape[:-1], mu_.shape, fi.shape) + (6,), dtype=np.float64)
    out[..., :3] = x1[..., None] * f + y1[..., None] * g
    out[..., 3:] = vx1[..., None] * f + vy1[..., None] * g
    return out


def elementi_da_stato(
    stato: ArrayLike, mu: ArrayLike, fattore_i: ArrayLike | None = None
) -> tuple[NDArray[np.float64], NDArray[np.int8]]:
    """Elementi (..., 6) [a, h, k, p, q, λ] e fattore I da stato (..., 6) [km, km/s].

    Con fattore_i assente, I è scelto dall'inclinazione. λ è restituito in [-π, π).
    ValueError per orbite non ellittiche (e ≥ 1).
    """
    s = np.asarray(stato, dtype=np.float64)
    r = s[..., :3]
    v = s[..., 3:]
    mu_ = np.asarray(mu, dtype=np.float64)
    hv = np.cross(r, v)
    w = hv / np.linalg.norm(hv, axis=-1, keepdims=True)
    if fattore_i is None:
        fi8 = np.where(w[..., 2] >= 0.0, 1, -1).astype(np.int8)
    else:
        fi8 = np.broadcast_to(np.asarray(fattore_i), w.shape[:-1]).astype(np.int8)
    fi = fi8.astype(np.float64)
    den = 1.0 + fi * w[..., 2]
    p = w[..., 0] / den
    q = -w[..., 1] / den
    rn = np.linalg.norm(r, axis=-1)
    v2 = np.sum(v * v, axis=-1)
    a = 1.0 / (2.0 / rn - v2 / mu_)
    ev = np.cross(v, hv) / mu_[..., None] - r / rn[..., None]
    if np.any(~(a > 0.0)) or np.any(np.linalg.norm(ev, axis=-1) >= 1.0):
        raise ValueError("orbita non ellittica: elementi equinoziali non definiti")
    f, g = _vettori_fg(p, q, fi)
    h = np.sum(ev * g, axis=-1)
    k = np.sum(ev * f, axis=-1)
    x1 = np.sum(r * f, axis=-1)
    y1 = np.sum(r * g, axis=-1)
    rad = np.sqrt(1.0 - h * h - k * k)
    beta = 1.0 / (1.0 + rad)
    cf = k + ((1.0 - k * k * beta) * x1 - h * k * beta * y1) / (a * rad)
    sf = h + ((1.0 - h * h * beta) * y1 - h * k * beta * x1) / (a * rad)
    ff = np.arctan2(sf, cf)
    lam = riduci_angolo(ff + h * np.cos(ff) - k * np.sin(ff))
    return np.stack([a, h, k, p, q, lam], axis=-1), fi8


def da_classici(
    a: ArrayLike,
    e: ArrayLike,
    i: ArrayLike,
    nodo: ArrayLike,
    arg_peri: ArrayLike,
    anomalia_media: ArrayLike,
    fattore_i: ArrayLike | None = None,
) -> tuple[NDArray[np.float64], NDArray[np.int8]]:
    """Elementi equinoziali (..., 6) e I da elementi classici (angoli in radianti)."""
    a_, e_, i_, om, w, m = (np.asarray(x, dtype=np.float64) for x in (a, e, i, nodo, arg_peri, anomalia_media))
    fi8 = fattore_retrogrado(i_) if fattore_i is None else np.asarray(fattore_i).astype(np.int8)
    fi = fi8.astype(np.float64)
    varpi = w + fi * om
    tg = np.tan(0.5 * i_) ** fi
    out = np.stack(
        np.broadcast_arrays(a_, e_ * np.sin(varpi), e_ * np.cos(varpi), tg * np.sin(om), tg * np.cos(om), m + varpi),
        axis=-1,
    )
    return out, np.broadcast_to(fi8, out.shape[:-1]).copy()


def a_classici(elementi: ArrayLike, fattore_i: ArrayLike) -> NDArray[np.float64]:
    """Elementi classici (..., 6) [a, e, i, Ω, ω, M] da equinoziali; angoli in [0, 2π), i in [0, π]."""
    el = np.asarray(elementi, dtype=np.float64)
    a, h, k, p, q, lam = (el[..., j] for j in range(6))
    fi = np.asarray(fattore_i, dtype=np.float64)
    e = np.hypot(h, k)
    tg = np.hypot(p, q)
    i = 2.0 * np.arctan(tg**fi)
    om = np.arctan2(p, q)
    varpi = np.arctan2(h, k)
    w = varpi - fi * om
    m = lam - varpi
    return np.stack(np.broadcast_arrays(a, e, i, np.mod(om, DUE_PI), np.mod(w, DUE_PI), np.mod(m, DUE_PI)), axis=-1)


def lambda_continua(
    t: ArrayLike, lam: ArrayLike, a: ArrayLike, mu: float, giorno_s: float = 86400.0
) -> NDArray[np.float64]:
    """Rende λ continua (non ridotta) lungo una serie temporale ordinata.

    Ogni campione è spostato di un multiplo di 2π verso la previsione λ_prec + n̄·Δt, con n̄ media
    dei moti medi osculanti ai due estremi (t in giorni, a in km, μ in km^3/s^2).
    """
    tt = np.asarray(t, dtype=np.float64)
    ll = np.asarray(lam, dtype=np.float64).copy()
    aa = np.asarray(a, dtype=np.float64)
    n = np.sqrt(mu / aa**3) * giorno_s
    for j in range(1, ll.size):
        prev = ll[j - 1] + 0.5 * (n[j - 1] + n[j]) * (tt[j] - tt[j - 1])
        ll[j] += DUE_PI * np.round((prev - ll[j]) / DUE_PI)
    return ll
