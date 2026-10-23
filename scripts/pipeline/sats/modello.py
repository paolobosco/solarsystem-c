"""Modello dei satelliti: ellisse precessante a record (§ 7.5.2) e raccordo tra record (§ 7.5.3).

Per ogni record, con τ = t - t_ref (giorni):
  a, e costanti; ϖ = ϖ0 + ϖ̇·τ; tan(i/2) costante; Ω = Ω0 + Ω̇·τ;
  λ = λ0 + n·τ + c2·τ² + c3·τ³ + Σ_k [S_k·sin(ν_k·τ) + C_k·cos(ν_k·τ)].
Elementi equinoziali (§ 7.2): h = e·sin ϖ, k = e·cos ϖ, p = tan^I(i/2)·sin Ω, q = tan^I(i/2)·cos Ω;
posizione nel sistema F con le formule di Broucke e Cefola (1972), poi r = R_F·r_F. La velocità usa le
stesse formule con n_eff = dλ/dt al posto di √(μ/a³). Stesse operazioni di src/data/satsReader.ts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import ArrayLike, NDArray

from common.constants import GIORNO_S
from common.equinoctial import risolvi_keplero

TIPO_SPK = 0
TIPO_SECOLARE = 1
K_MAX = 6
# Numero di parametri senza termini periodici: a, e, ϖ0, ϖ̇, tan(i/2), Ω0, Ω̇, λ0, n, c2, c3.
N_BASE = 11
# Frazione della durata del record per la semiampiezza del raccordo (§ 7.5.3).
FRAZIONE_RACCORDO = 0.1


@dataclass
class Record:
    """Record del § 8.5. Angoli in rad, tempi in JD TDB, velocità angolari in rad/d."""

    tipo: int
    fattore_i: int
    t_inizio: float
    t_fine: float
    t_ref: float
    a: float
    e: float
    varpi0: float
    varpi_dot: float
    tan_i2: float
    omega0: float
    omega_dot: float
    lam0: float
    n: float
    c2: float = 0.0
    c3: float = 0.0
    sc: NDArray[np.float64] = field(default_factory=lambda: np.zeros((0, 2)))

    @property
    def k(self) -> int:
        return int(self.sc.shape[0])

    @property
    def durata(self) -> float:
        return self.t_fine - self.t_inizio

    def valori(self) -> list[float]:
        """Float64 [14 + 2K] nell'ordine del § 8.5."""
        base = [
            self.t_inizio,
            self.t_fine,
            self.t_ref,
            self.a,
            self.e,
            self.varpi0,
            self.varpi_dot,
            self.tan_i2,
            self.omega0,
            self.omega_dot,
            self.lam0,
            self.n,
            self.c2,
            self.c3,
        ]
        return base + [float(x) for x in self.sc.reshape(-1)]

    def parametri(self) -> NDArray[np.float64]:
        """Vettore dei parametri di adattamento [a, e, ϖ0, ϖ̇, T, Ω0, Ω̇, λ0, n, c2, c3, S1, C1, ...]
        con T = tan^I(i/2)."""
        t = self.tan_i2 if self.fattore_i > 0 else 1.0 / self.tan_i2
        base = [self.a, self.e, self.varpi0, self.varpi_dot, t, self.omega0, self.omega_dot]
        base += [self.lam0, self.n, self.c2, self.c3]
        return np.array(base + [float(x) for x in self.sc.reshape(-1)], dtype=np.float64)


def record_da_parametri(
    x: ArrayLike, tipo: int, fattore_i: int, t_inizio: float, t_fine: float, t_ref: float
) -> Record:
    """Record dal vettore dei parametri; normalizza e ≥ 0 e T > 0 (spostando ϖ0 e Ω0 di π)."""
    p = np.asarray(x, dtype=np.float64).copy()
    if p[1] < 0:
        p[1] = -p[1]
        p[2] += math.pi
    if p[4] < 0:
        p[4] = -p[4]
        p[5] += math.pi
    p[4] = max(p[4], 1e-15)
    t = float(p[4])
    tan_i2 = t if fattore_i > 0 else 1.0 / t
    sc = p[N_BASE:].reshape(-1, 2).copy()
    return Record(
        tipo,
        int(fattore_i),
        float(t_inizio),
        float(t_fine),
        float(t_ref),
        float(p[0]),
        float(p[1]),
        _riduci(float(p[2])),
        float(p[3]),
        tan_i2,
        _riduci(float(p[5])),
        float(p[6]),
        float(p[7]),
        float(p[8]),
        float(p[9]),
        float(p[10]),
        sc,
    )


def _riduci(x: float) -> float:
    return x - 2.0 * math.pi * math.floor((x + math.pi) / (2.0 * math.pi))


# --- Valutazione vettorializzata ---


def base_periodica(t_ref: float, frequenze: ArrayLike, t: ArrayLike) -> tuple[NDArray, NDArray]:
    """sin(ν_k·τ) e cos(ν_k·τ), forma (K, n): non dipendono dai parametri e si riusano nell'adattamento."""
    tau = np.asarray(t, dtype=np.float64) - t_ref
    arg = np.outer(np.asarray(frequenze, dtype=np.float64), tau)
    return np.sin(arg), np.cos(arg)


def elementi_modello(
    x: ArrayLike,
    t_ref: float,
    frequenze: ArrayLike,
    fattore_i: int,
    t: ArrayLike,
    base: tuple[NDArray, NDArray] | None = None,
) -> tuple[NDArray[np.float64], ...]:
    """Elementi equinoziali (a, h, k, p, q, λ) e n_eff (rad/d) del modello ai tempi t.

    x: parametri [a, e, ϖ0, ϖ̇, T, Ω0, Ω̇, λ0, n, c2, c3, S1, C1, ...] con T = tan^I(i/2).
    """
    p = np.asarray(x, dtype=np.float64)
    tau = np.asarray(t, dtype=np.float64) - t_ref
    nu = np.asarray(frequenze, dtype=np.float64)
    kk = (p.size - N_BASE) // 2
    a, e, varpi0, varpi_dot, tt, om0, om_dot, lam0, n, c2, c3 = p[:N_BASE]
    varpi = varpi0 + varpi_dot * tau
    om = om0 + om_dot * tau
    lam = lam0 + tau * (n + tau * (c2 + tau * c3))
    neff = n + tau * (2.0 * c2 + 3.0 * c3 * tau)
    for j in range(kk):
        s = p[N_BASE + 2 * j]
        c = p[N_BASE + 2 * j + 1]
        if base is None:
            arg = nu[j] * tau
            sa = np.sin(arg)
            ca = np.cos(arg)
        else:
            sa = base[0][j]
            ca = base[1][j]
        lam = lam + (s * sa + c * ca)
        neff = neff + nu[j] * (s * ca - c * sa)
    h = e * np.sin(varpi)
    k = e * np.cos(varpi)
    pp = tt * np.sin(om)
    qq = tt * np.cos(om)
    aa = np.full_like(tau, a)
    return aa, h, k, pp, qq, lam, neff


def posizione_velocita(
    a: NDArray, h: NDArray, k: NDArray, p: NDArray, q: NDArray, lam: NDArray, neff: NDArray, fattore_i: int
) -> NDArray[np.float64]:
    """Stato (n, 6) nel sistema F: km e km/s, con n_eff in rad/d."""
    ff = risolvi_keplero(lam, h, k)
    cf = np.cos(ff)
    sf = np.sin(ff)
    beta = 1.0 / (1.0 + np.sqrt(1.0 - h * h - k * k))
    r = a * (1.0 - k * cf - h * sf)
    x1 = a * ((1.0 - beta * h * h) * cf + h * k * beta * sf - k)
    y1 = a * ((1.0 - beta * k * k) * sf + h * k * beta * cf - h)
    fatt = (neff / GIORNO_S) * a * a / r
    vx1 = fatt * (h * k * beta * cf - (1.0 - beta * h * h) * sf)
    vy1 = fatt * ((1.0 - beta * k * k) * cf - h * k * beta * sf)
    fi = float(fattore_i)
    p2 = p * p
    q2 = q * q
    s2 = 1.0 + p2 + q2
    fx = (1.0 - p2 + q2) / s2
    fy = 2.0 * p * q / s2
    fz = -2.0 * fi * p / s2
    gx = 2.0 * fi * p * q / s2
    gy = (1.0 + p2 - q2) * fi / s2
    gz = 2.0 * q / s2
    out = np.empty(np.shape(lam) + (6,), dtype=np.float64)
    out[..., 0] = x1 * fx + y1 * gx
    out[..., 1] = x1 * fy + y1 * gy
    out[..., 2] = x1 * fz + y1 * gz
    out[..., 3] = vx1 * fx + vy1 * gx
    out[..., 4] = vx1 * fy + vy1 * gy
    out[..., 5] = vx1 * fz + vy1 * gz
    return out


def stato_parametri(
    x: ArrayLike,
    t_ref: float,
    frequenze: ArrayLike,
    fattore_i: int,
    t: ArrayLike,
    base: tuple[NDArray, NDArray] | None = None,
) -> NDArray[np.float64]:
    """Stato (n, 6) nel sistema F dal vettore dei parametri."""
    el = elementi_modello(x, t_ref, frequenze, fattore_i, t, base)
    return posizione_velocita(*el, fattore_i)


def stato_record(rec: Record, frequenze: ArrayLike, t: ArrayLike) -> NDArray[np.float64]:
    """Stato (n, 6) nel sistema F del record ai tempi t (senza controllo dell'intervallo)."""
    nu = np.asarray(frequenze, dtype=np.float64)[: rec.k]
    return stato_parametri(rec.parametri(), rec.t_ref, nu, rec.fattore_i, np.atleast_1d(t))


def jacobiano_posizione(
    x: ArrayLike,
    t_ref: float,
    frequenze: ArrayLike,
    fattore_i: int,
    t: ArrayLike,
    base: tuple[NDArray, NDArray] | None = None,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Posizioni (n, 3) in F e jacobiano analitico (n, 3, P) rispetto ai parametri."""
    p = np.asarray(x, dtype=np.float64)
    tt = np.asarray(t, dtype=np.float64)
    tau = tt - t_ref
    nu = np.asarray(frequenze, dtype=np.float64)
    a, h, k, pp, qq, lam, _ = elementi_modello(p, t_ref, nu, fattore_i, tt, base)
    fi = float(fattore_i)
    ff = risolvi_keplero(lam, h, k)
    cf = np.cos(ff)
    sf = np.sin(ff)
    s = np.sqrt(1.0 - h * h - k * k)
    beta = 1.0 / (1.0 + s)
    dbh = beta * beta * h / s
    dbk = beta * beta * k / s
    d = 1.0 - k * cf - h * sf  # r/a
    x1 = a * ((1.0 - beta * h * h) * cf + h * k * beta * sf - k)
    y1 = a * ((1.0 - beta * k * k) * sf + h * k * beta * cf - h)
    # derivate di X1, Y1 rispetto a F, h, k (F da Keplero: dF/dλ = 1/d, dF/dh = -cos F/d, dF/dk = sin F/d)
    x1f = a * (-(1.0 - beta * h * h) * sf + h * k * beta * cf)
    y1f = a * ((1.0 - beta * k * k) * cf - h * k * beta * sf)
    x1h = a * (-2.0 * beta * h * cf - h * h * cf * dbh + k * beta * sf + h * k * sf * dbh) - x1f * cf / d
    x1k = a * (-h * h * cf * dbk + h * beta * sf + h * k * sf * dbk - 1.0) + x1f * sf / d
    y1h = a * (-k * k * sf * dbh + k * beta * cf + h * k * cf * dbh - 1.0) - y1f * cf / d
    y1k = a * (-2.0 * beta * k * sf - k * k * sf * dbk + h * beta * cf + h * k * cf * dbk) + y1f * sf / d
    x1l = x1f / d
    y1l = y1f / d
    p2 = pp * pp
    q2 = qq * qq
    s2 = 1.0 + p2 + q2
    fn = np.stack([1.0 - p2 + q2, 2.0 * pp * qq, -2.0 * fi * pp], axis=-1)
    gn = np.stack([2.0 * fi * pp * qq, (1.0 + p2 - q2) * fi, 2.0 * qq], axis=-1)
    f = fn / s2[:, None]
    g = gn / s2[:, None]
    zero = np.zeros_like(pp)
    s22 = (s2 * s2)[:, None]
    dfp = (
        np.stack([-2.0 * pp, 2.0 * qq, np.full_like(pp, -2.0 * fi)], axis=-1) * s2[:, None] - fn * 2.0 * pp[:, None]
    ) / s22
    dfq = (np.stack([2.0 * qq, 2.0 * pp, zero], axis=-1) * s2[:, None] - fn * 2.0 * qq[:, None]) / s22
    dgp = (np.stack([2.0 * fi * qq, 2.0 * fi * pp, zero], axis=-1) * s2[:, None] - gn * 2.0 * pp[:, None]) / s22
    dgq = (
        np.stack([2.0 * fi * pp, -2.0 * fi * qq, np.full_like(pp, 2.0)], axis=-1) * s2[:, None] - gn * 2.0 * qq[:, None]
    ) / s22
    r = x1[:, None] * f + y1[:, None] * g
    dr_da = r / a[:, None]
    dr_dlam = x1l[:, None] * f + y1l[:, None] * g
    dr_dh = x1h[:, None] * f + y1h[:, None] * g
    dr_dk = x1k[:, None] * f + y1k[:, None] * g
    dr_dp = x1[:, None] * dfp + y1[:, None] * dgp
    dr_dq = x1[:, None] * dfq + y1[:, None] * dgq
    e = p[1]
    varpi = p[2] + p[3] * tau
    t_mag = p[4]
    om = p[5] + p[6] * tau
    sv = np.sin(varpi)[:, None]
    cv = np.cos(varpi)[:, None]
    so = np.sin(om)[:, None]
    co = np.cos(om)[:, None]
    nparam = p.size
    jac = np.empty((tt.size, 3, nparam), dtype=np.float64)
    jac[:, :, 0] = dr_da
    jac[:, :, 1] = sv * dr_dh + cv * dr_dk
    d_varpi = e * (cv * dr_dh - sv * dr_dk)
    jac[:, :, 2] = d_varpi
    jac[:, :, 3] = tau[:, None] * d_varpi
    jac[:, :, 4] = so * dr_dp + co * dr_dq
    d_om = t_mag * (co * dr_dp - so * dr_dq)
    jac[:, :, 5] = d_om
    jac[:, :, 6] = tau[:, None] * d_om
    jac[:, :, 7] = dr_dlam
    jac[:, :, 8] = tau[:, None] * dr_dlam
    jac[:, :, 9] = (tau * tau)[:, None] * dr_dlam
    jac[:, :, 10] = (tau * tau * tau)[:, None] * dr_dlam
    for j in range((nparam - N_BASE) // 2):
        if base is None:
            arg = nu[j] * tau
            sa, ca = np.sin(arg), np.cos(arg)
        else:
            sa, ca = base[0][j], base[1][j]
        jac[:, :, N_BASE + 2 * j] = sa[:, None] * dr_dlam
        jac[:, :, N_BASE + 2 * j + 1] = ca[:, None] * dr_dlam
    return r, jac


def posizione_parametri(
    x: ArrayLike,
    t_ref: float,
    frequenze: ArrayLike,
    fattore_i: int,
    t: ArrayLike,
    base: tuple[NDArray, NDArray] | None = None,
) -> NDArray[np.float64]:
    """Solo posizioni (n, 3) in F."""
    return stato_parametri(x, t_ref, frequenze, fattore_i, t, base)[:, :3]


# --- Sequenza di record con raccordo ---


def semiampiezza_raccordo(r1: Record, r2: Record) -> float:
    """L_b = 0,1·min(L_prec, L_succ) per il confine tra due record consecutivi (§ 7.5.3)."""
    return FRAZIONE_RACCORDO * min(r1.durata, r2.durata)


def peso_raccordo(x: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """w = 3x² - 2x³ e dw/dx, con x limitato a [0, 1]."""
    xx = np.clip(x, 0.0, 1.0)
    return xx * xx * (3.0 - 2.0 * xx), 6.0 * xx * (1.0 - xx)


def stato_sequenza(
    records: list[Record], frequenze: ArrayLike, rot: NDArray[np.float64], t: ArrayLike
) -> tuple[NDArray[np.float64], NDArray[np.int64]]:
    """Stato (n, 6) nell'eclittica J2000 (km, km/s) da una sequenza contigua di record, con raccordo.

    rot: matrice R_F (F -> eclittica J2000). Restituisce anche l'indice del record il cui nucleo
    contiene t (-1 fuori da ogni record; stato NaN).
    """
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    inizi = np.array([r.t_inizio for r in records])
    fini = np.array([r.t_fine for r in records])
    idx = np.searchsorted(inizi, tt, side="right") - 1
    valido = (idx >= 0) & (tt < fini[np.clip(idx, 0, None)])
    idx = np.where(valido, idx, -1)
    out = np.full((tt.size, 6), np.nan)
    for j, rec in enumerate(records):
        m = idx == j
        if not np.any(m):
            continue
        tj = tt[m]
        s = stato_record(rec, frequenze, tj)
        # raccordo a sinistra
        if j > 0:
            lb = semiampiezza_raccordo(records[j - 1], rec)
            zona = tj < rec.t_inizio + lb
            if np.any(zona):
                s[zona] = _miscela(records[j - 1], rec, frequenze, tj[zona], s[zona], rec.t_inizio, lb, True)
        if j < len(records) - 1:
            lb = semiampiezza_raccordo(rec, records[j + 1])
            zona = tj >= rec.t_fine - lb
            if np.any(zona):
                s[zona] = _miscela(rec, records[j + 1], frequenze, tj[zona], s[zona], rec.t_fine, lb, False)
        out[m] = s
    st = out.copy()
    st[:, :3] = out[:, :3] @ rot.T
    st[:, 3:] = out[:, 3:] @ rot.T
    return st, idx


def _miscela(
    prec: Record,
    succ: Record,
    frequenze: ArrayLike,
    t: NDArray[np.float64],
    proprio: NDArray[np.float64],
    tb: float,
    lb: float,
    proprio_e_succ: bool,
) -> NDArray[np.float64]:
    """r = (1 - w)·r_prec + w·r_succ, w = 3x² - 2x³, x = (t - t_b + L_b)/(2·L_b); velocità con dw/dt."""
    altro = stato_record(prec if proprio_e_succ else succ, frequenze, t)
    s_prec = altro if proprio_e_succ else proprio
    s_succ = proprio if proprio_e_succ else altro
    x = (t - tb + lb) / (2.0 * lb)
    w, dw = peso_raccordo(x)
    w = w[:, None]
    out = (1.0 - w) * s_prec + w * s_succ
    # dw/dt in 1/d, velocità in km/s
    dwdt = (dw / (2.0 * lb) / GIORNO_S)[:, None]
    out[:, 3:] += dwdt * (s_succ[:, :3] - s_prec[:, :3])
    return out
