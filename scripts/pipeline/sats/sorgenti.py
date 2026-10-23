"""Sorgenti SPK di un satellite come funzioni del tempo nel sistema F (§ 7.5.1)."""

from __future__ import annotations

from contextlib import ExitStack

import numpy as np
from numpy.typing import NDArray

from common.frames import icrf_a_eclittica

from . import kernel as kn
from .anagrafica import Satellite
from .record import Intervallo
from .sistema import in_f

# Priorità: kernel moderno sopra i kernel lunghi (§ 7.5.1).
PRIORITA = {"moderno": 2, "lungo": 1}


def lettori(nomi: list[str], pila: ExitStack) -> dict[str, kn.LettoreSpk]:
    """Apre i kernel indicati (già in cache) e quelli dei centri esterni presenti."""
    out: dict[str, kn.LettoreSpk] = {}
    for n in nomi:
        if n not in out:
            out[n] = pila.enter_context(kn.LettoreSpk(kn.KERNEL[n]))
        est = kn.CENTRO_ESTERNO.get(n)
        if est is not None and est not in out and kn.KERNEL[est].percorso.exists():
            out[est] = pila.enter_context(kn.LettoreSpk(kn.KERNEL[est]))
    return out


def stato_icrf(sat: Satellite, nome: str, aperti: dict[str, kn.LettoreSpk], t: NDArray[np.float64]) -> NDArray:
    """Stato ICRF (n, 6) del satellite rispetto al centro del pianeta (o al baricentro se circumbinario)."""
    k = kn.KERNEL[nome]
    assert sat.naif is not None and sat.sistema is not None
    s = aperti[nome].stato_icrf(sat.sistema, sat.naif, t)
    if sat.baricentrico:
        return s
    if k.centro is not None:
        c = aperti[nome].stato_icrf(sat.sistema, k.centro, t)
    else:
        c = aperti[kn.CENTRO_ESTERNO[nome]].stato_icrf(sat.sistema, kn.CENTRO_PIANETA[sat.sistema], t)
    return s - c


def copertura(sat: Satellite, nome: str, aperti: dict[str, kn.LettoreSpk]) -> tuple[float, float]:
    assert sat.naif is not None and sat.sistema is not None
    a, b = aperti[nome].copertura(sat.sistema, sat.naif)
    if not sat.baricentrico:
        est = kn.CENTRO_ESTERNO.get(nome)
        lc = aperti[est] if est is not None else aperti[nome]
        ca, cb = lc.copertura(sat.sistema, kn.CENTRO_PIANETA[sat.sistema])
        a, b = max(a, ca), min(b, cb)
    return a, b


def intervalli(sat: Satellite, aperti: dict[str, kn.LettoreSpk], rf: NDArray[np.float64]) -> list[Intervallo]:
    """Intervalli delle sorgenti aperte del satellite, con stati nel sistema F."""
    out = []
    for nome in [sat.kernel_moderno, *sat.kernel_lunghi]:
        if nome is None or nome not in aperti:
            continue
        a, b = copertura(sat, nome, aperti)

        def stati(t: NDArray[np.float64], nome: str = nome) -> NDArray[np.float64]:
            return in_f(rf, icrf_a_eclittica(stato_icrf(sat, nome, aperti, t)))

        out.append(Intervallo(nome, a, b, PRIORITA[kn.KERNEL[nome].tipo], stati))
    return out
