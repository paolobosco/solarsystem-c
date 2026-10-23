"""Lettura di DE441 (§ 7.3.1) con jplephem.

Due file SPK: de441_part-1.bsp (-13200/1969) e de441_part-2.bsp (1969/17191).
Scelta per singolo campione: JD < 2 440 416,5 -> part-1, altrimenti part-2.
Stati eliocentrici rispetto al centro del Sole (NAIF 10), eclittica J2000, km e km/s.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from jplephem.spk import SPK
from numpy.typing import ArrayLike, NDArray

from .constants import GIORNO_S, JD_CAMBIO_DE441
from .frames import icrf_a_eclittica

CARTELLA_PREDEFINITA = Path(__file__).resolve().parent.parent / ".cache" / "de441"
NOMI_FILE = ("de441_part-1.bsp", "de441_part-2.bsp")

# Corpi per cui si forniscono stati eliocentrici: baricentri 1..9, Terra, Luna.
CORPI_ELIOCENTRICI = (1, 2, 3, 4, 5, 6, 7, 8, 9, 399, 301)

# Catena dei segmenti dal baricentro del Sistema solare (0) a ciascun corpo.
_CATENE: dict[int, tuple[tuple[int, int], ...]] = {
    0: (),
    **{i: ((0, i),) for i in range(1, 11)},
    199: ((0, 1), (1, 199)),
    299: ((0, 2), (2, 299)),
    301: ((0, 3), (3, 301)),
    399: ((0, 3), (3, 399)),
}


def indice_file(t: ArrayLike) -> NDArray[np.int8]:
    """0 per part-1, 1 per part-2, per ogni istante TDB (§ 7.3.1)."""
    return (np.asarray(t, dtype=np.float64) >= JD_CAMBIO_DE441).astype(np.int8)


class De441:
    """Accesso ai due SPK di DE441, vettorializzato su array di tempi TDB (JD)."""

    def __init__(self, cartella: Path | str | None = None) -> None:
        base = Path(cartella) if cartella is not None else CARTELLA_PREDEFINITA
        self.percorsi = tuple(base / n for n in NOMI_FILE)
        for p in self.percorsi:
            if not p.exists():
                raise FileNotFoundError(f"file DE441 assente: {p}")
        self._kernel = [SPK.open(str(p)) for p in self.percorsi]

    def chiudi(self) -> None:
        for k in self._kernel:
            k.close()
        self._kernel = []

    def __enter__(self) -> De441:
        return self

    def __exit__(self, *_: object) -> None:
        self.chiudi()

    def commenti(self, indice: int = 0) -> str:
        """Area commenti del file (0 = part-1, 1 = part-2)."""
        return self._kernel[indice].comments()

    def _da_ssb(self, corpo: int, t: NDArray[np.float64], kernel: SPK) -> NDArray[np.float64]:
        """Stato ICRF del corpo rispetto al baricentro, km e km/d, forma (n, 6)."""
        out = np.zeros((t.size, 6), dtype=np.float64)
        # parte intera e frazione separate: jplephem converte in secondi senza perdere precisione
        intero = np.floor(t)
        frazione = t - intero
        for centro, bersaglio in _CATENE[corpo]:
            pos, vel = kernel[centro, bersaglio].compute_and_differentiate(intero, frazione)
            out[:, :3] += np.asarray(pos).reshape(3, -1).T
            out[:, 3:] += np.asarray(vel).reshape(3, -1).T
        return out

    def stato_icrf(self, bersaglio: int, centro: int, t: ArrayLike) -> NDArray[np.float64]:
        """Stato ICRF del bersaglio rispetto al centro: km e km/s; forma (n, 6) o (6,) per t scalare."""
        if bersaglio not in _CATENE or centro not in _CATENE:
            raise ValueError(f"corpo non disponibile in DE441: {bersaglio} o {centro}")
        tt = np.asarray(t, dtype=np.float64)
        scalare = tt.ndim == 0
        tt = np.atleast_1d(tt).ravel()
        out = np.empty((tt.size, 6), dtype=np.float64)
        sel = indice_file(tt)
        for i, kernel in enumerate(self._kernel):
            m = sel == i
            if not np.any(m):
                continue
            ts = tt[m]
            out[m] = self._da_ssb(bersaglio, ts, kernel) - self._da_ssb(centro, ts, kernel)
        out[:, 3:] /= GIORNO_S
        return out[0] if scalare else out

    def stato_eliocentrico(self, corpo: int, t: ArrayLike) -> NDArray[np.float64]:
        """Stato rispetto al centro del Sole (10), eclittica J2000, km e km/s."""
        return icrf_a_eclittica(self.stato_icrf(corpo, 10, t))

    def stati_eliocentrici(
        self, t: ArrayLike, corpi: tuple[int, ...] = CORPI_ELIOCENTRICI
    ) -> dict[int, NDArray[np.float64]]:
        """Stati eliocentrici in eclittica J2000 per più corpi alle stesse epoche."""
        return {c: self.stato_eliocentrico(c, t) for c in corpi}
