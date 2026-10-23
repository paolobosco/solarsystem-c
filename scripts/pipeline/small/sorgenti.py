"""Valutatori delle sorgenti dei dati: sb441-n16 (SPK tipo 2) e SPK Horizons (tipo 21).

Uscita comune: stati eliocentrici (rispetto al centro del Sole) nell'eclittica J2000, km e km/s.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from common.constants import GIORNO_S, J2000
from common.frames import icrf_a_eclittica

from .anagrafica import FILE_SB441


class ValutatoreSb441:
    """Asteroide di sb441-n16 (Farnocchia 2021, JPL IOM 392R-21-005), centro Sole, ICRF."""

    def __init__(self, naif: int, percorso: Path = FILE_SB441) -> None:
        from jplephem.spk import SPK

        self._k = SPK.open(str(percorso))
        self._segmenti = sorted(
            (s for s in self._k.segments if s.target == naif and s.center == 10), key=lambda s: s.start_jd
        )
        if not self._segmenti:
            raise KeyError(f"corpo {naif} assente da sb441-n16")
        self.naif = naif
        self.disponibile = (self._segmenti[0].start_jd, self._segmenti[-1].end_jd)

    def chiudi(self) -> None:
        self._k.close()

    def stati(self, t: np.ndarray) -> np.ndarray:
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        if np.any(tt < self.disponibile[0]) or np.any(tt > self.disponibile[1]):
            raise ValueError("istante fuori dalla copertura di sb441-n16")
        out = np.empty((tt.size, 6))
        inizi = np.array([s.start_jd for s in self._segmenti])
        idx = np.clip(np.searchsorted(inizi, tt, side="right") - 1, 0, len(self._segmenti) - 1)
        for j, s in enumerate(self._segmenti):
            m = idx == j
            if not np.any(m):
                continue
            intero = np.floor(tt[m])
            pos, vel = s.compute_and_differentiate(intero, tt[m] - intero)
            out[m, :3] = np.asarray(pos).reshape(3, -1).T
            out[m, 3:] = np.asarray(vel).reshape(3, -1).T / GIORNO_S
        return icrf_a_eclittica(out)


class ValutatoreSpk:
    """SPK di tipo 21 prodotto da Horizons, letto con spiceypy (CSPICE); centro Sole (10), J2000."""

    def __init__(self, percorso: Path) -> None:
        import spiceypy as sp

        self.percorso = Path(percorso)
        ids = sp.spkobj(str(self.percorso))
        if len(ids) != 1:
            raise ValueError(f"atteso un solo corpo in {self.percorso}")
        self.naif = int(ids[0])
        cop = sp.spkcov(str(self.percorso), self.naif)
        n = sp.wncard(cop)
        a0, _ = sp.wnfetd(cop, 0)
        _, b1 = sp.wnfetd(cop, n - 1)
        self.disponibile = (J2000 + a0 / GIORNO_S, J2000 + b1 / GIORNO_S)
        self.intervalli = [tuple(J2000 + x / GIORNO_S for x in sp.wnfetd(cop, k)) for k in range(n)]

    def stati(self, t: np.ndarray) -> np.ndarray:
        import spiceypy as sp

        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        if np.any(tt < self.disponibile[0]) or np.any(tt > self.disponibile[1]):
            raise ValueError(f"istante fuori dalla copertura di {self.percorso.name}")
        out = np.empty((tt.size, 6))
        sp.furnsh(str(self.percorso))
        try:
            for k, x in enumerate(tt):
                et = (x - J2000) * GIORNO_S
                st, _ = sp.spkgeo(self.naif, et, "J2000", 10)
                out[k] = st
        finally:
            sp.unload(str(self.percorso))
        return icrf_a_eclittica(out)


def sb441_senza(naif: int, destinazione: Path, origine: Path = FILE_SB441) -> Path:
    """Copia di sb441-n16 senza i segmenti del corpo `naif`, per integrare quel corpo con ASSIST.

    ASSIST applica le forze di tutti gli asteroidi del file: una particella che coincide con uno di
    essi subirebbe la propria attrazione. I segmenti degli altri 15 corpi sono copiati interi (spksub).
    """
    import spiceypy as sp

    if destinazione.exists():
        return destinazione
    destinazione.parent.mkdir(parents=True, exist_ok=True)
    tmp = destinazione.with_suffix(".tmp")
    if tmp.exists():
        tmp.unlink()
    h = sp.dafopr(str(origine))
    nuovo = sp.spkopn(str(tmp), "sb441-n16 senza un corpo", 0)
    try:
        sp.dafbfs(h)
        while sp.daffna():
            somm = sp.dafgs(5)
            dc, ic = sp.dafus(somm, 2, 6)
            if ic[0] == naif:
                continue
            ident = sp.dafgn()
            sp.spksub(h, somm, ident, dc[0], dc[1], nuovo)
    finally:
        sp.spkcls(nuovo)
        sp.dafcls(h)
    tmp.rename(destinazione)
    return destinazione
