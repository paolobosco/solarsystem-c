"""Valutazione di riferimento dai file sKK.bin, con le stesse regole di src/ephem/satellites.ts:
stato planetocentrico nell'eclittica J2000 e scarto del centro del pianeta dal baricentro (§ 7.3.5).

Piano secolare (§ 7.5.4): per i satelliti il cui piano di Laplace segue l'equatore del primario, negli intervalli
serviti dai record secolari lo stato è ruotato da Q(t), rotazione minima che porta il polo WGCCRE del primario
all'epoca di giunzione con i record da SPK sul polo all'istante t: F(t) = Q(t)·R_F, Q = I alla giunzione.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from common import constants as cst
from common.frames import MATRICE_ICRF_A_ECLITTICA

from . import formato


@dataclass(frozen=True)
class PianoSecolare:
    """Polo WGCCRE del primario (coefficienti come in catalog.json) e intervalli (inizio, fine, giunzione) in JD TDB."""

    coefficienti: dict
    intervalli: tuple[tuple[float, float, float], ...]


@dataclass(frozen=True)
class Config:
    ssid: int
    slug: str
    primario: int  # ssid del primario
    rf: tuple[float, ...]
    frequenze: tuple[float, ...]
    gm: float
    baricentrico: bool
    piano_secolare: PianoSecolare | None = None


def polo_eclittica(coeff: dict, jd_tdb: float) -> NDArray[np.float64]:
    """Versore del polo WGCCRE (α0, δ0 di physical.angoli_wgccre) nell'eclittica J2000."""
    import physical as ph

    a, d, _ = ph.angoli_wgccre(coeff, jd_tdb)
    return MATRICE_ICRF_A_ECLITTICA @ ph.polo_icrf(a, d)


def rotazione_minima(p0: NDArray[np.float64], p1: NDArray[np.float64]) -> NDArray[np.float64]:
    """Rotazione minima che porta il versore p0 su p1 (Rodrigues): I + [k]× + [k]×²/(1 + c), k = p0 × p1, c = p0·p1."""
    k = np.cross(p0, p1)
    c = float(p0 @ p1)
    kx = np.array([[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]])
    return np.eye(3) + kx + (kx @ kx) / (1.0 + c)


def rotazione_piano(c: Config, t: float) -> NDArray[np.float64] | None:
    """Q(t) se t è in un intervallo secolare di un piano che segue l'equatore del primario, altrimenti None."""
    ps = c.piano_secolare
    if ps is None:
        return None
    for inizio, fine, giunzione in ps.intervalli:
        if inizio <= t < fine:
            return rotazione_minima(polo_eclittica(ps.coefficienti, giunzione), polo_eclittica(ps.coefficienti, t))
    return None


# ssid del pianeta -> codice NAIF del sistema (baricentro DE441), come SISTEMA_PER_PIANETA nel runtime.
SISTEMA_PER_PIANETA = {4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 10: 9}


class Riferimento:
    def __init__(self, file: dict[int, formato.FileSatelliti], config: list[Config]) -> None:
        self.file = file
        self.config = {c.ssid: c for c in config}

    def stato_modello(self, ssid: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
        c = self.config[ssid]
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        out = np.full((tt.size, 6), np.nan)
        rf = np.array(c.rf).reshape(3, 3)
        # con il piano secolare mobile si valuta nel sistema F e si ruota con F(t) istante per istante
        rot = rf if c.piano_secolare is None else np.eye(3)
        k = np.array([cst.blocco_di(x) if cst.T0 <= x < cst.T_END else -1 for x in tt])
        for kk in np.unique(k):
            if kk < 0:
                continue
            m = k == kk
            st, es = formato.valuta(self.file[int(kk)], ssid, c.frequenze, rot, tt[m])
            out[m] = st
        if c.piano_secolare is not None:
            for i, x in enumerate(tt):
                if not np.isfinite(out[i, 0]):
                    continue
                q = rotazione_piano(c, float(x))
                # F(t) = Q(t)·R_F -> eclittica J2000 (dQ/dt trascurata, come nel runtime)
                m_t = rf if q is None else q @ rf
                out[i, :3] = m_t @ out[i, :3]
                out[i, 3:] = m_t @ out[i, 3:]
        return out

    def offset_centro(self, pianeta: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
        """r_centro - r_bar = -(Σ_p GM·ρ + Σ_b GM·ρ_b)/(GM_sistema - Σ_b GM), eclittica J2000."""
        gm_sis = cst.GM_BARICENTRI[SISTEMA_PER_PIANETA[pianeta]]
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        somma = np.zeros((tt.size, 6))
        gm_bar = 0.0
        for c in self.config.values():
            if c.primario != pianeta:
                continue
            somma += c.gm * self.stato_modello(c.ssid, tt)
            if c.baricentrico:
                gm_bar += c.gm
        return -somma / (gm_sis - gm_bar)

    def planetocentrico(self, ssid: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
        c = self.config[ssid]
        st = self.stato_modello(ssid, t)
        if c.baricentrico:
            st = st - self.offset_centro(c.primario, t)
        return st
