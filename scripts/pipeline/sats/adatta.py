"""Adattamento ai minimi quadrati del modello a record (§ 7.5.2) su posizioni SPK nel sistema F.

- Stima iniziale da elementi osculanti: λ e n da retta su λ continua; e, ϖ0, ϖ̇ e tan^I(i/2), Ω0, Ω̇
  dal massimo del periodogramma delle serie complesse k + i·h e q + i·p.
- Levenberg-Marquardt con jacobiano analitico, colonne normalizzate, soluzione per autovalori.
- Analisi in frequenza dei residui lungo la traccia (CLEAN) per le frequenze ν_k dei termini periodici.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from common.constants import GIORNO_S
from common.equinoctial import elementi_da_stato

from . import modello as mod


@dataclass
class EsitoAdattamento:
    x: NDArray[np.float64]
    costo: float
    iterazioni: int
    rms_km: float


def campioni_per_orbita(e: float, minimo: int = 20) -> int:
    """Campioni per periodo: almeno 20 (§ 7.5.2), più fitti per orbite eccentriche (velocità al pericentro)."""
    fattore = (1.0 + e) ** 2 / (1.0 - e * e) ** 1.5 if e < 1 else 1.0
    return int(math.ceil(minimo * max(1.0, fattore)))


# --- Periodogramma complesso ---


def picco_complesso(tau: NDArray[np.float64], z: NDArray[np.complex128], omega_max: float) -> tuple[float, complex]:
    """Frequenza ω (rad/d) con |ω| ≤ omega_max che massimizza |mean(z·e^{-iωτ})| e ampiezza complessa.

    τ su griglia uniforme: FFT con riempimento di zeri (fattore 4), poi raffinamento a sezione aurea
    sui dati completi.
    """
    if tau.size < 4:
        return 0.0, complex(np.mean(z))
    dt = float(tau[1] - tau[0])
    npad = 1 << int(math.ceil(math.log2(4 * tau.size)))
    spettro = np.fft.fft(z, npad)
    omega = 2.0 * math.pi * np.fft.fftfreq(npad, dt)
    ammessi = np.abs(omega) <= omega_max
    if not np.any(ammessi):
        return 0.0, complex(np.mean(z))
    amp = np.where(ammessi, np.abs(spettro), -1.0)
    j = int(np.argmax(amp))
    w0 = float(omega[j])
    passo = 2.0 * math.pi / (npad * dt)

    def f(w: float) -> float:
        return -float(np.abs(np.mean(z * np.exp(-1j * w * tau))))

    a, b = w0 - passo, w0 + passo
    g = (math.sqrt(5.0) - 1.0) / 2.0
    c, d = b - g * (b - a), a + g * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(80):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = f(d)
        if b - a < 1e-13 * max(1.0, abs(w0)):
            break
    w = 0.5 * (a + b)
    return w, complex(np.mean(z * np.exp(-1j * w * tau)))


# --- Stima iniziale ---


def lambda_continua(t: NDArray, lam: NDArray, a: NDArray, mu: float) -> NDArray:
    """λ continua (vettorializzata): ogni passo è l'incremento previsto n̄·Δt più lo scarto ridotto a [-π, π),
    come common.equinoctial.lambda_continua."""
    n = np.sqrt(mu / a**3) * GIORNO_S
    inc = 0.5 * (n[1:] + n[:-1]) * np.diff(t)
    d = np.diff(lam) - inc
    d -= 2.0 * math.pi * np.round(d / (2.0 * math.pi))
    out = np.empty_like(lam)
    out[0] = lam[0]
    out[1:] = lam[0] + np.cumsum(inc + d)
    return out


def stima_iniziale(
    t: NDArray[np.float64],
    stati_f: NDArray[np.float64],
    mu: float,
    fattore_i: int,
    t_ref: float,
    k: int,
    omega_max: float | None = None,
) -> NDArray[np.float64]:
    """Parametri iniziali [a, e, ϖ0, ϖ̇, T, Ω0, Ω̇, λ0, n, c2, c3, S1, C1, ...]."""
    el, _ = elementi_da_stato(stati_f, mu, fattore_i)
    lam = lambda_continua(t, el[:, 5], el[:, 0], mu)
    tau = t - t_ref
    n, lam0 = np.polyfit(tau, lam, 1)
    if omega_max is None:
        omega_max = 0.2 * abs(n)
    w_hk, a_hk = picco_complesso(tau, el[:, 2] + 1j * el[:, 1], omega_max)
    w_pq, a_pq = picco_complesso(tau, el[:, 4] + 1j * el[:, 3], omega_max)
    e = abs(a_hk)
    r_medio = float(np.mean(np.linalg.norm(stati_f[:, :3], axis=1)))
    a = r_medio / (1.0 + 0.5 * e * e)
    x = [a, e, math.atan2(a_hk.imag, a_hk.real), w_hk, abs(a_pq), math.atan2(a_pq.imag, a_pq.real), w_pq]
    x += [lam0, n, 0.0, 0.0] + [0.0] * (2 * k)
    return np.array(x, dtype=np.float64)


def trasla_parametri(x: ArrayLike, delta: float, frequenze: ArrayLike) -> NDArray[np.float64]:
    """Parametri equivalenti con t_ref spostato di delta (giorni)."""
    p = np.asarray(x, dtype=np.float64).copy()
    nu = np.asarray(frequenze, dtype=np.float64)
    n, c2, c3 = p[8], p[9], p[10]
    p[2] += p[3] * delta
    p[5] += p[6] * delta
    p[7] += delta * (n + delta * (c2 + delta * c3))
    p[8] = n + 2.0 * c2 * delta + 3.0 * c3 * delta * delta
    p[9] = c2 + 3.0 * c3 * delta
    for j in range((p.size - mod.N_BASE) // 2):
        s, c = p[mod.N_BASE + 2 * j], p[mod.N_BASE + 2 * j + 1]
        cs, sn = math.cos(nu[j] * delta), math.sin(nu[j] * delta)
        p[mod.N_BASE + 2 * j] = s * cs - c * sn
        p[mod.N_BASE + 2 * j + 1] = s * sn + c * cs
    return p


# --- Levenberg-Marquardt ---


def levenberg_marquardt(
    x0: NDArray[np.float64],
    t_ref: float,
    frequenze: NDArray[np.float64],
    fattore_i: int,
    t: NDArray[np.float64],
    dati: NDArray[np.float64],
    max_iterazioni: int = 60,
    tolleranza: float = 1e-10,
    fissi: tuple[int, ...] = (),
) -> EsitoAdattamento:
    """Minimi quadrati sulle posizioni (km) nel sistema F; `fissi`: indici di parametri non adattati.

    Arresto quando la riduzione relativa del costo scende sotto `tolleranza` o dopo 8 tentativi falliti.
    Colonne del jacobiano normalizzate, passo da (JᵀJ + μ·λ_max·I) δ = -Jᵀr per autovalori; aggiornamento
    di μ secondo Nielsen (1999) con il rapporto tra riduzione effettiva e prevista.
    """
    x = np.array(x0, dtype=np.float64)
    liberi = np.array([j for j in range(x.size) if j not in fissi])
    base = mod.base_periodica(t_ref, frequenze[: (x.size - mod.N_BASE) // 2], t)

    def residui(xx: NDArray[np.float64]) -> NDArray[np.float64]:
        return (mod.posizione_parametri(xx, t_ref, frequenze, fattore_i, t, base) - dati).ravel()

    r_mod, jac = mod.jacobiano_posizione(x, t_ref, frequenze, fattore_i, t, base)
    r = (r_mod - dati).ravel()
    costo = float(r @ r)
    mu = 1e-6
    nu_fatt = 2.0
    iterazioni = 0
    for passo in range(1, max_iterazioni + 1):
        iterazioni = passo
        j2 = jac.reshape(-1, x.size)[:, liberi]
        scala = np.sqrt(np.sum(j2 * j2, axis=0))
        scala[scala == 0] = 1.0
        js = j2 / scala
        a = js.T @ js
        g = js.T @ r
        val, vec = np.linalg.eigh(a)
        val = np.clip(val, 0.0, None)
        gv = vec.T @ g
        lmax = max(float(val[-1]), 1e-300)
        migliorato = False
        riduzione = 0.0
        for _ in range(8):
            ds = -(vec @ (gv / (val + mu * lmax)))
            dx = np.zeros_like(x)
            dx[liberi] = ds / scala
            xn = x + dx
            rn = residui(xn)
            cn = float(rn @ rn)
            prevista = -(2.0 * float(g @ ds) + float(ds @ (a @ ds)))
            if np.isfinite(cn) and cn < costo:
                rho = (costo - cn) / prevista if prevista > 0 else 1.0
                migliorato = True
                riduzione = (costo - cn) / costo
                x, costo = xn, cn
                mu *= max(1.0 / 3.0, 1.0 - (2.0 * rho - 1.0) ** 3)
                mu = max(mu, 1e-15)
                nu_fatt = 2.0
                break
            mu *= nu_fatt
            nu_fatt *= 2.0
            if mu > 1e12:
                break
        if not migliorato or riduzione < tolleranza:
            break
        r_mod, jac = mod.jacobiano_posizione(x, t_ref, frequenze, fattore_i, t, base)
        r = (r_mod - dati).ravel()
    return EsitoAdattamento(x, costo, iterazioni, math.sqrt(costo / max(1, dati.shape[0])))


# --- Misure dei residui ---


def errori(modello_r: NDArray[np.float64], dati_r: NDArray[np.float64]) -> tuple[NDArray, NDArray]:
    """Errore angolare visto dal pianeta (rad) e radiale (km) tra posizioni (n, 3)."""
    nm = np.linalg.norm(modello_r, axis=1)
    nd = np.linalg.norm(dati_r, axis=1)
    croce = np.linalg.norm(np.cross(modello_r, dati_r), axis=1)
    ang = np.arctan2(croce, np.sum(modello_r * dati_r, axis=1))
    return ang, nm - nd


def residuo_lungo_traccia(modello_st: NDArray[np.float64], dati_r: NDArray[np.float64]) -> NDArray[np.float64]:
    """Residuo angolare lungo la traccia (rad): componente di (dati - modello) lungo v⊥, divisa per r."""
    r = modello_st[:, :3]
    v = modello_st[:, 3:]
    rn = np.linalg.norm(r, axis=1, keepdims=True)
    ur = r / rn
    vp = v - np.sum(v * ur, axis=1, keepdims=True) * ur
    up = vp / np.linalg.norm(vp, axis=1, keepdims=True)
    return np.sum((dati_r - r) * up, axis=1) / rn[:, 0]


def clean_frequenze(
    t: NDArray[np.float64],
    y: NDArray[np.float64],
    k_max: int,
    omega_min: float,
    omega_max: float,
    escluse: list[tuple[float, float]] | None = None,
) -> list[tuple[float, float]]:
    """Frequenze (rad/d) e ampiezze (rad) dei picchi principali di y(t) con omega_min ≤ ω ≤ omega_max,
    fuori dalle bande `escluse` [(ω1, ω2), ...].

    t su griglia uniforme. CLEAN: picco dello spettro, sottrazione della sinusoide ai minimi quadrati,
    ripetizione.
    """
    res = y - np.mean(y)
    tau = t - t[0]
    dt = float(tau[1] - tau[0])
    npad = 1 << int(math.ceil(math.log2(4 * tau.size)))
    omega = 2.0 * math.pi * np.fft.rfftfreq(npad, dt)
    ammessi = (omega >= omega_min) & (omega <= omega_max)
    for w1, w2 in escluse or []:
        ammessi &= ~((omega >= w1) & (omega <= w2))
    out: list[tuple[float, float]] = []
    for _ in range(k_max):
        amp = np.where(ammessi, np.abs(np.fft.rfft(res, npad)), -1.0)
        j = int(np.argmax(amp))
        if amp[j] <= 0:
            break
        w0 = float(omega[j])
        passo = 2.0 * math.pi / (npad * dt)
        w, _ = picco_reale(tau, res, w0 - passo, w0 + passo)
        base = np.column_stack([np.sin(w * tau), np.cos(w * tau)])
        coef, *_ = np.linalg.lstsq(base, res, rcond=None)
        res = res - base @ coef
        out.append((w, float(np.hypot(*coef))))
    return out


def picco_reale(tau: NDArray, y: NDArray, a: float, b: float) -> tuple[float, float]:
    """Massimo di |Σ y·e^{-iωτ}| per ω in [a, b] (sezione aurea)."""

    def f(w: float) -> float:
        return -float(np.abs(np.sum(y * np.exp(-1j * w * tau))))

    g = (math.sqrt(5.0) - 1.0) / 2.0
    c, d = b - g * (b - a), a + g * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(80):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = f(d)
        if b - a < 1e-13 * max(1.0, abs(a)):
            break
    w = 0.5 * (a + b)
    return w, -f(w)
