"""Campioni dai kernel (§ 7.5.1), salvati in .cache/sats/campioni/ per non ripetere gli scaricamenti.

Per ogni kernel e satellite: istanti casuali uniformi (seme registrato) sulla copertura limitata a
[T0 - 1 anno, T_END + 1 anno], stati ICRF del satellite rispetto al centro del pianeta (al baricentro
per i satelliti circumbinari) e stati ICRF del centro del pianeta rispetto al baricentro del sistema.
Servono per il sistema F, l'estrapolazione secolare, la validazione incrociata, il confronto tra kernel
e la validazione A6.
"""

from __future__ import annotations

from contextlib import ExitStack
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from common import constants as cst

from . import kernel as kn
from . import sorgenti
from .anagrafica import Satellite, satelliti

CARTELLA = kn.CACHE / "campioni"
SEME = 20261019
N_MODERNO = 100_000
N_LUNGO = 200_000
N_VALIDAZIONE = 200
MARGINE = 365.25


# Indice dei kernel nel seme: ordine alfabetico dei 20 kernel campionati per primi, poi i successivi
# (gli indici già usati non cambiano).
ORDINE_SEMI = [
    "jup347.bsp",
    "jup365.bsp",
    "mar099.bsp",
    "nep097.bsp",
    "nep097xl-801.bsp",
    "nep097xl-899.bsp",
    "nep098_part-3.bsp",
    "nep101xl-802.bsp",
    "nep105.bsp",
    "plu060.bsp",
    "sat441.bsp",
    "sat441xl_part-1.bsp",
    "sat441xl_part-2.bsp",
    "ura111xl-701.bsp",
    "ura111xl-702.bsp",
    "ura111xl-703.bsp",
    "ura111xl-704.bsp",
    "ura111xl-705.bsp",
    "ura111xl-799.bsp",
    "ura184_part-3.bsp",
    "nep098_part-1.bsp",
]


def percorso(nome_kernel: str, naif: int) -> Path:
    return CARTELLA / f"{nome_kernel.removesuffix('.bsp')}-{naif}.npz"


def intervallo_utile(a: float, b: float) -> tuple[float, float]:
    return max(a, cst.T0 - MARGINE), min(b, cst.T_END + MARGINE)


def seme(nome_kernel: str, naif: int) -> int:
    """Seme per kernel e satellite, derivato dal seme base (registrato in docs/_parti/satelliti.md)."""
    return SEME + 1000 * ORDINE_SEMI.index(nome_kernel) + naif


def campiona(nome_kernel: str, registro=print) -> list[Path]:
    """Campiona tutti i satelliti serviti dal kernel (il kernel e l'eventuale centro esterno in cache)."""
    k = kn.KERNEL[nome_kernel]
    CARTELLA.mkdir(parents=True, exist_ok=True)
    out = []
    sats = [s for s in satelliti() if s.naif in k.satelliti]
    with ExitStack() as pila:
        aperti = sorgenti.lettori([nome_kernel], pila)
        for s in sats:
            out.append(_campiona_satellite(s, nome_kernel, aperti, registro))
    return out


def _campiona_satellite(s: Satellite, nome: str, aperti: dict, registro) -> Path:
    assert s.naif is not None and s.sistema is not None
    a, b = sorgenti.copertura(s, nome, aperti)
    a, b = intervallo_utile(a, b)
    n = N_LUNGO if kn.KERNEL[nome].tipo == "lungo" else N_MODERNO
    rng = np.random.default_rng(seme(nome, s.naif))
    t = np.sort(rng.uniform(a, b, n))
    tv = np.sort(rng.uniform(max(a, cst.T0), min(b, cst.T_END), N_VALIDAZIONE))
    stati = sorgenti.stato_icrf(s, nome, aperti, t)
    stati_v = sorgenti.stato_icrf(s, nome, aperti, tv)
    centro = _centro(s, nome, aperti, t)
    centro_v = _centro(s, nome, aperti, tv)
    p = percorso(nome, s.naif)
    np.savez_compressed(
        p,
        t=t,
        stati=stati,
        centro=centro,
        t_validazione=tv,
        stati_validazione=stati_v,
        centro_validazione=centro_v,
        copertura=np.array([a, b]),
    )
    registro(f"  {s.slug}: {n} campioni in [{a:.1f}, {b:.1f}] da {nome}")
    return p


def _centro(s: Satellite, nome: str, aperti: dict, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Stato ICRF del centro del pianeta rispetto al baricentro (NaN se il kernel non lo fornisce)."""
    assert s.sistema is not None
    k = kn.KERNEL[nome]
    if k.centro is not None:
        return aperti[nome].stato_icrf(s.sistema, k.centro, t)
    est = kn.CENTRO_ESTERNO.get(nome)
    if est is not None and est in aperti:
        return aperti[est].stato_icrf(s.sistema, kn.CENTRO_PIANETA[s.sistema], t)
    return np.full((t.size, 6), np.nan)


def percorso_zona(nome_kernel: str, naif: int) -> Path:
    return CARTELLA / f"{nome_kernel.removesuffix('.bsp')}-{naif}-zona.npz"


def campiona_zona(s: Satellite, nome: str, aperti: dict, intervalli: list[tuple[float, float]]) -> Path | None:
    """Epoche di validazione (N_VALIDAZIONE, uniformi) nella parte di copertura di un kernel lungo servita dai
    suoi record (zona in cui il satellite è determinabile, § 7.5.1)."""
    assert s.naif is not None
    a, b = sorgenti.copertura(s, nome, aperti)
    iv = [(max(x, a, cst.T0), min(y, b, cst.T_END)) for x, y in intervalli]
    iv = [(x, y) for x, y in iv if y > x]
    if not iv:
        return None
    lung = np.array([y - x for x, y in iv])
    rng = np.random.default_rng(seme(nome, s.naif) + 500)
    u = np.sort(rng.uniform(0.0, float(lung.sum()), N_VALIDAZIONE))
    cum = np.concatenate([[0.0], np.cumsum(lung)])
    j = np.clip(np.searchsorted(cum, u, side="right") - 1, 0, len(iv) - 1)
    tv = np.array([iv[k][0] for k in j]) + (u - cum[j])
    p = percorso_zona(nome, s.naif)
    np.savez_compressed(
        p,
        t_validazione=tv,
        stati_validazione=sorgenti.stato_icrf(s, nome, aperti, tv),
        centro_validazione=_centro(s, nome, aperti, tv),
        intervalli=np.array(iv),
    )
    return p


def validazione(nome_kernel: str, naif: int) -> dict[str, NDArray[np.float64]]:
    """Epoche di validazione del kernel: per i kernel lunghi quelle della zona servita dai record."""
    pz = percorso_zona(nome_kernel, naif)
    if kn.KERNEL[nome_kernel].tipo == "lungo" and pz.exists():
        with np.load(pz) as z:
            return {k: z[k] for k in z.files}
    return leggi(nome_kernel, naif)


def leggi(nome_kernel: str, naif: int) -> dict[str, NDArray[np.float64]]:
    with np.load(percorso(nome_kernel, naif)) as z:
        return {k: z[k] for k in z.files}
