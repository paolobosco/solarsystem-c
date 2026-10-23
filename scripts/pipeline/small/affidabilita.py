"""Affidabilità dei piccoli corpi (§ 7.6.2, § 7.8, § 8.7).

Metrica per istante (errore di posizione visto dal Sole): 95° percentile tra i cloni del massimo tra
(a) angolo eliocentrico tra clone e nominale e (b) |Δr|/r (norma della differenza dei vettori posizione);
più la differenza tra varianti di modello con la stessa metrica. Valore cumulato in modo monotono
allontanandosi dall'epoca della soluzione.
Serie per intervallo della griglia di reliability.bin (common.affidabilita): massimo nell'intervallo chiuso,
forma e dati.
"""

from __future__ import annotations

import math

import numpy as np

from common import affidabilita as ca
from common import constants as cst

from .orbite import cometari_da_stato

PASSO_NODI = ca.PASSO  # passo dei nodi grossi (20 anni giuliani)
N_NODI = ca.NODI  # intervalli della griglia di reliability.bin
T_CAMPIONI_FINI = cst.T0 + 595 * PASSO_NODI  # 12/9/1900: da qui cloni campionati ogni 1,25 anni
PASSO_CAMPIONI_FINI = PASSO_NODI / 16
SOGLIA_NON_DETERMINABILE = 0.5 * math.pi  # 90° (§ 7.8.2)
SOGLIA_DA = 0.05
SOGLIA_DE = 0.05
SOGLIA_DI = math.radians(5.0)


def nodi() -> np.ndarray:
    """Estremi degli N_NODI intervalli della griglia (common.affidabilita.bordi)."""
    return ca.bordi()


def tempi_campionamento(epoca: float, t_min: float = cst.T0, t_max: float = cst.T_END) -> tuple[np.ndarray, np.ndarray]:
    """Istanti di valutazione dei cloni, a ritroso e in avanti dall'epoca: ogni 3 652,5 d (nodi grossi e punti
    medi) fino a T_CAMPIONI_FINI, poi ogni 456,5625 d; comprendono tutti i nodi della griglia di reliability.bin."""
    grossi = cst.T0 + 0.5 * PASSO_NODI * np.arange(2 * ca.K_FINE + 2, dtype=np.float64)
    fini = T_CAMPIONI_FINI + PASSO_CAMPIONI_FINI * np.arange(
        math.ceil((cst.T_END - T_CAMPIONI_FINI) / PASSO_CAMPIONI_FINI) + 1, dtype=np.float64
    )
    tutti = np.unique(np.concatenate([grossi[grossi < T_CAMPIONI_FINI], fini, [t_min, t_max]]))
    tutti = tutti[(tutti >= t_min) & (tutti <= t_max)]
    indietro = tutti[tutti < epoca][::-1]
    avanti = tutti[tutti > epoca]
    return indietro, avanti


def metrica(cloni: np.ndarray, nominale: np.ndarray) -> np.ndarray:
    """Per clone, errore di posizione rispetto al nominale (rad): max tra angolo eliocentrico e |Δr|/r.

    L'anomalia media non entra: dove M è poco determinata ma la posizione no (orbite quasi circolari,
    orbite eccentriche vicino all'afelio) |ΔM| supera di molto l'errore di posizione."""
    rc = cloni[:, :3]
    rn = nominale[:3]
    nr = float(np.linalg.norm(rn))
    nc = np.linalg.norm(rc, axis=1)
    cosang = np.clip((rc @ rn) / (nc * nr), -1.0, 1.0)
    ang = np.arccos(cosang)
    dr = np.linalg.norm(rc - rn, axis=1) / nr
    return np.maximum(ang, dr)


def forma_scarti(cloni: np.ndarray, nominale: np.ndarray, t: float, mu: float) -> tuple[float, float, float]:
    """95° percentile di |Δa/a|, |Δe|, |Δi| tra cloni e nominale."""
    el_c = cometari_da_stato(cloni, t, mu)
    el_n = cometari_da_stato(nominale[None], t, mu)
    an = el_n["a"][0]
    if math.isfinite(an):
        da = np.abs((el_c["a"] - an) / an)
        da = np.where(np.isfinite(da), da, np.inf)
    else:
        da = np.full(cloni.shape[0], np.inf)
    de = np.abs(el_c["e"] - el_n["e"][0])
    di = np.abs(el_c["i"] - el_n["i"][0])
    return float(np.percentile(da, 95)), float(np.percentile(de, 95)), float(np.percentile(di, 95))


def forma_determinata(scarti: tuple[float, float, float]) -> bool:
    da, de, di = scarti
    return da <= SOGLIA_DA and de <= SOGLIA_DE and di <= SOGLIA_DI


def cumula(valori: np.ndarray) -> np.ndarray:
    """Massimo progressivo (valori ordinati allontanandosi dall'epoca); da un NaN in poi tutto NaN."""
    v = np.asarray(valori, dtype=np.float64)
    out = np.maximum.accumulate(np.where(np.isnan(v), np.inf, v))
    out[np.isinf(out)] = np.nan
    return out


def serie_nodi(tempi: np.ndarray, eps: np.ndarray, determinata: np.ndarray, presenti: np.ndarray):
    """Serie per intervallo: log10(ε) massimo in [nodo, nodo+1] (None se non stimabile), forma e dati.

    tempi crescenti; eps NaN = non stimabile; determinata e presenti booleani per istante.
    Il valore di un intervallo è il massimo degli istanti nell'intervallo chiuso (i due estremi
    inclusi): con la cumulazione monotona coincide con il valore all'estremo più lontano dall'epoca.
    """
    n = nodi()
    log10 = []
    forma = []
    dati = []
    for k in range(N_NODI):
        a, b = n[k], n[k + 1]
        m = (tempi >= a) & (tempi <= b)
        if not np.any(m):
            log10.append(None)
            forma.append(False)
            dati.append(False)
            continue
        e = eps[m]
        if np.any(np.isnan(e)):
            log10.append(None)
        else:
            log10.append(ca.per_eccesso(float(np.log10(max(np.max(e), 1e-15)))))
        forma.append(bool(np.all(determinata[m])))
        dati.append(bool(np.any(presenti[m])))
    return log10, forma, dati
