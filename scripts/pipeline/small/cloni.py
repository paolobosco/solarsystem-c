"""Cloni dalla covarianza della soluzione (§ 7.6.2).

Campionamento gaussiano degli elementi cometari (e, q, tp, Ω, ω, i) e dei parametri non gravitazionali
presenti nella covarianza SBDB (cov=mat), con seme registrato. Parametri non dinamici della covarianza
(ad esempio S0, scarto tra centro di luce e centro di massa) sono campionati e ignorati.

La covarianza vale solo per gli elementi della sua epoca: `campiona`, `stati_cloni` e `stato_nominale` si usano con
l'orbita di `sbdb.orbita_covarianza` (epoca ed elementi di covariance.epoch e covariance.elements quando SBDB li
dà a un'epoca diversa da quella dell'orbita) e `campiona` rifiuta una covarianza con un nominale di un'altra epoca.
"""

from __future__ import annotations

import math

import numpy as np

from common.constants import UA_KM

from .orbite import stato_da_cometari
from .sbdb import OrbitaSbdb, covarianza_elementi

CLASSI_CAOTICHE = {"APO", "ATE", "AMO", "IEO", "JFc", "HTC", "CEN"}
N_CLONI_CAOTICI = 64
N_CLONI_ALTRI = 16
SEME_CLONI = 20261022


def n_cloni(orb: OrbitaSbdb, cometa: bool) -> int:
    """64 cloni per le classi caotiche e le comete con perielio < 1,5 UA, 16 per gli altri."""
    if orb.classe in CLASSI_CAOTICHE or (cometa and orb.q_au < 1.5):
        return N_CLONI_CAOTICI
    return N_CLONI_ALTRI


def _nominale(orb: OrbitaSbdb, etichetta: str, grezzo: dict | None) -> float:
    mappa = {
        "e": orb.e,
        "q": orb.q_au,
        "tp": orb.tp,
        "node": orb.nodo_deg,
        "peri": orb.argperi_deg,
        "i": orb.inc_deg,
    }
    if etichetta in mappa:
        return mappa[etichetta]
    if etichetta in orb.ng:
        return orb.ng[etichetta]
    if grezzo is not None:
        for m in grezzo["orbit"].get("model_pars") or []:
            if m["name"] == etichetta:
                return float(m["value"])
    return 0.0


def fattore_matrice(cov: np.ndarray) -> np.ndarray:
    """L con L·Lᵀ = cov (autovalori negativi da arrotondamento posti a zero)."""
    try:
        return np.linalg.cholesky(cov)
    except np.linalg.LinAlgError:
        w, v = np.linalg.eigh(cov)
        return v * np.sqrt(np.clip(w, 0.0, None))


def campiona(orb: OrbitaSbdb, n: int, seme: int, grezzo: dict | None = None) -> dict[str, np.ndarray]:
    """Elementi di n cloni (indice 0 escluso: i cloni sono tutti campionati) e origine della covarianza.

    `orb` ha l'epoca della covarianza (ValueError altrimenti, da `sbdb.covarianza_elementi`)."""
    etich, cov, origine = covarianza_elementi(orb)
    nom = np.array([_nominale(orb, e, grezzo) for e in etich])
    rng = np.random.default_rng(seme)
    z = rng.standard_normal((n, len(etich)))
    x = nom + z @ fattore_matrice(cov).T
    out = {e: x[:, k] for k, e in enumerate(etich)}
    for e in ("A1", "A2", "A3"):
        if e not in out:
            out[e] = np.full(n, orb.ng.get(e, 0.0))
    out["origine"] = np.array([origine])
    return out


def stati_cloni(orb: OrbitaSbdb, cl: dict[str, np.ndarray], mu: float) -> np.ndarray:
    """Stati eliocentrici eclittici (n, 6) dei cloni all'epoca di `orb`, quella della covarianza."""
    d = math.pi / 180.0
    return stato_da_cometari(
        cl["q"] * UA_KM, cl["e"], cl["i"] * d, cl["node"] * d, cl["peri"] * d, cl["tp"], orb.epoca, mu
    )


def stato_nominale(orb: OrbitaSbdb, mu: float) -> np.ndarray:
    d = math.pi / 180.0
    return stato_da_cometari(
        orb.q_km, orb.e, orb.inc_deg * d, orb.nodo_deg * d, orb.argperi_deg * d, orb.tp, orb.epoca, mu
    )[0]


def ng_cloni(cl: dict[str, np.ndarray]) -> np.ndarray:
    return np.stack([cl["A1"], cl["A2"], cl["A3"]], axis=1)
