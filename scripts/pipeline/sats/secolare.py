"""Estrapolazione secolare (§ 7.5.4) e validazione incrociata per σ_n (§ 7.5.6).

Modello secolare: record con K = 0 e c3 = 0 (λ quadratico, rotazioni lineari di ϖ e Ω, a, e, i costanti),
adattato ai minimi quadrati sulle posizioni campionate nell'intera copertura disponibile. Per la
convergenza l'adattamento procede per continuazione: intervallo centrato in t_ref, raddoppiato a ogni
passo fino alla copertura completa.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import NDArray

from . import adatta
from . import modello as mod
from .anagrafica import SIGMA_NDOT_GRADI

GIORNI_ANNO = 365.25
# σ(ṅ/n) dove l'accelerazione mareale non è vincolata dalle osservazioni (I12), anno⁻¹.
SIGMA_NDOT_RELATIVA = 1e-9
FISSI_SECOLARE = (10,)  # c3 = 0


def x0_da_record(records: list[mod.Record], t_ref: float) -> NDArray[np.float64]:
    """Parametri secolari iniziali (K = 0) dal record più vicino a t_ref, traslato in t_ref."""
    j = int(np.argmin([abs(r.t_ref - t_ref) for r in records]))
    r = records[j]
    x = r.parametri()[: mod.N_BASE].copy()
    # i termini periodici entrano in λ0 e n come valore e derivata medi nel record: si trascurano
    x[10] = 0.0
    x = adatta.trasla_parametri(x, t_ref - r.t_ref, np.zeros(0))
    x[10] = 0.0
    # n medio dei record vicini (riduce l'effetto dei termini a lungo periodo)
    vicini = [q for q in records if abs(q.t_ref - t_ref) <= 50 * GIORNI_ANNO] or [r]
    x[8] = float(np.mean([q.n for q in vicini]))
    x[9] = 0.0
    return x


def adatta_secolare(
    t: NDArray[np.float64],
    pos_f: NDArray[np.float64],
    x0: NDArray[np.float64],
    t_ref: float,
    fattore_i: int,
    semiampiezza_iniziale: float = 5 * GIORNI_ANNO,
    registro=None,
    crescita: float = 1.5,
) -> adatta.EsitoAdattamento:
    """Adattamento per continuazione su [t_ref - h, t_ref + h] con h moltiplicato per `crescita` fino a
    coprire t: a ogni allargamento l'errore di λ ai nuovi estremi resta molto minore di π anche con
    librazioni ampie (Mimas: 44° in 70 anni)."""
    x = np.array(x0, dtype=np.float64)
    x[10] = 0.0
    hmax = float(np.max(np.abs(t - t_ref)))
    h = min(semiampiezza_iniziale, hmax)
    es = None
    while True:
        m = np.abs(t - t_ref) <= h
        if np.count_nonzero(m) >= 50:
            es = adatta.levenberg_marquardt(x, t_ref, np.zeros(0), fattore_i, t[m], pos_f[m], fissi=FISSI_SECOLARE)
            x = es.x
            if registro is not None:
                registro(f"    secolare ±{h / GIORNI_ANNO:.0f} anni: rms {es.rms_km:.1f} km")
        if h >= hmax:
            break
        h = min(crescita * h, hmax)
    assert es is not None
    return es


def angolo_lungo_traccia(x: NDArray[np.float64], t_ref: float, fattore_i: int, t: NDArray, pos_f: NDArray) -> NDArray:
    """Angolo con segno (rad) nel piano del modello tra posizione del modello e posizione vera."""
    st = mod.stato_parametri(x, t_ref, np.zeros(0), fattore_i, t)
    r = st[:, :3]
    w = np.cross(r, st[:, 3:])
    w /= np.linalg.norm(w, axis=1, keepdims=True)
    s = np.sum(np.cross(r, pos_f) * w, axis=1)
    c = np.sum(r * pos_f, axis=1)
    return np.arctan2(s, c)


def errore_angolare(x: NDArray[np.float64], t_ref: float, fattore_i: int, t: NDArray, pos_f: NDArray) -> NDArray:
    r = mod.posizione_parametri(x, t_ref, np.zeros(0), fattore_i, t)
    ang, _ = adatta.errori(r, pos_f)
    return ang


def sigma_n_validazione_incrociata(
    t: NDArray[np.float64],
    pos_f: NDArray[np.float64],
    x0: NDArray[np.float64],
    t_ref: float,
    fattore_i: int,
    registro=None,
) -> dict:
    """σ_n (rad/anno): adattamento su ciascuna metà della copertura (c2 fisso al valore dell'adattamento
    completo) e previsione sull'altra.

    Per ogni direzione si calcola la pendenza ai minimi quadrati dell'errore lungo la traccia (non
    ridotto) rispetto al tempo nella metà prevista; σ_n è il massimo dei due valori assoluti.
    """
    order = np.argsort(t)
    t = t[order]
    pos_f = pos_f[order]
    tm = 0.5 * (t[0] + t[-1])
    esiti = {}
    pendenze = []
    for nome, m_fit, m_prev in (("primaMeta", t < tm, t >= tm), ("secondaMeta", t >= tm, t < tm)):
        tc = float(np.mean(t[m_fit]))
        xc = adatta.trasla_parametri(x0, tc - t_ref, np.zeros(0))
        xc[10] = 0.0
        # partenza dall'adattamento completo, con c2 fisso al suo valore: la crescita quadratica è già nel
        # termine σ_ṅ (I12) e un c2 libero su metà copertura assorbirebbe le librazioni a lungo periodo
        es = adatta.levenberg_marquardt(xc, tc, np.zeros(0), fattore_i, t[m_fit], pos_f[m_fit], fissi=(9, 10))
        d = angolo_lungo_traccia(es.x, tc, fattore_i, t[m_prev], pos_f[m_prev])
        d = np.unwrap(d)
        anni = (t[m_prev] - tc) / GIORNI_ANNO
        pend, _ = np.polyfit(anni, d, 1)
        pendenze.append(abs(float(pend)))
        esiti[nome] = {"pendenzaRadAnno": float(pend), "maxRad": float(np.max(np.abs(d)))}
    esiti["sigmaN"] = max(pendenze)
    return esiti


def sigma_ndot(naif: int | None, n_rad_giorno: float) -> float:
    """σ_ṅ (rad/anno²): misurata dove nota (anagrafica.SIGMA_NDOT_GRADI), altrimenti 1e-9·n anno⁻¹ (I12)."""
    if naif in SIGMA_NDOT_GRADI:
        return math.radians(SIGMA_NDOT_GRADI[naif])
    return SIGMA_NDOT_RELATIVA * (abs(n_rad_giorno) * GIORNI_ANNO)


def estrapolazione(sigma_n: float, sigma_ndot: float, tau_anni: NDArray | float) -> NDArray | float:
    """ε_estrapolazione(τ) = |τ|·σ_n + ½·τ²·σ_ṅ (rad); τ in anni, σ_n in rad/anno, σ_ṅ in rad/anno² (sigma_ndot)."""
    tau = np.abs(tau_anni)
    return tau * sigma_n + 0.5 * tau * tau * sigma_ndot


def tau_da_arco(t: NDArray | float, arco: tuple[float, float]) -> NDArray | float:
    """Distanza in anni dall'arco osservativo [inizio, fine] (anni giuliani), 0 all'interno."""
    anni = 2000.0 + (np.asarray(t, dtype=np.float64) - 2451545.0) / GIORNI_ANNO
    return np.maximum(0.0, np.maximum(arco[0] - anni, anni - arco[1]))


def anni_da_jd(t: NDArray | float) -> NDArray | float:
    return 2000.0 + (np.asarray(t, dtype=np.float64) - 2451545.0) / GIORNI_ANNO


def gradi(x: float) -> float:
    return math.degrees(x)
