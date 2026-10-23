"""Traiettoria ASSIST di una particella memorizzata su istanti della griglia diadica allineata a T0.

Il passo di memorizzazione si adatta alla scala dinamica eliocentrica r/|v| (potenza di 2 tra 1/64 d e
1024 d). Gli stati in istanti non memorizzati si ottengono ripartendo con ASSIST dal campione
memorizzato precedente (stessa configurazione di forze): nessuna interpolazione aggiuntiva.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from common import constants as cst

from .integrazione import Ambiente, Configurazione, Propagatore

PASSO_MIN = 2.0**-6
PASSO_MAX = 1024.0
FRAZIONE_SCALA = 1.0 / 32.0
RIPARTENZA_MAX = 4096.0  # d: oltre questa distanza si riparte dal campione memorizzato


def passo_adattivo(stato: np.ndarray) -> float:
    """Potenza di 2 ≤ (r/|v|)/32 in giorni, limitata a [1/64, 1024] d."""
    r = float(np.linalg.norm(stato[:3]))
    v = float(np.linalg.norm(stato[3:]))
    scala = r / v / cst.GIORNO_S * FRAZIONE_SCALA
    if not scala > PASSO_MIN:
        return PASSO_MIN
    return min(PASSO_MAX, 2.0 ** math.floor(math.log2(scala)))


def prossimo_nodo(t: float, h: float, verso: float) -> float:
    """Nodo della griglia T0 + m·h strettamente successivo a t nel verso indicato."""
    x = (t - cst.T0) / h
    m = math.floor(x) + 1 if verso > 0 else math.ceil(x) - 1
    return cst.T0 + m * h


@dataclass
class TraiettoriaAssist:
    """Campioni (tempi crescenti, stati eliocentrici eclittici km, km/s) e configurazione per ripartire."""

    tempi: np.ndarray
    stati: np.ndarray
    conf: Configurazione

    @property
    def disponibile(self) -> tuple[float, float]:
        return float(self.tempi[0]), float(self.tempi[-1])

    @classmethod
    def calcola(
        cls,
        amb: Ambiente,
        t0: float,
        stato0: np.ndarray,
        conf: Configurazione,
        t_min: float,
        t_max: float,
        nodi_extra: np.ndarray | None = None,
    ) -> TraiettoriaAssist:
        """Integra da t0 verso t_min e verso t_max, memorizzando anche gli istanti in nodi_extra."""
        extra = np.sort(np.asarray(nodi_extra if nodi_extra is not None else [], dtype=np.float64))
        parti_t = [np.array([t0])]
        parti_s = [np.atleast_2d(stato0).astype(np.float64)]
        for verso, limite in ((-1.0, t_min), (1.0, t_max)):
            if verso * (limite - t0) <= 0:
                continue
            pr = Propagatore(amb, t0, stato0, conf, verso)
            tt, ss = [], []
            t = t0
            s = np.atleast_2d(stato0)[0]
            ex = extra[(extra - t0) * verso > 0]
            ex = ex[::-1] if verso < 0 else ex
            ie = 0
            while verso * (t - limite) < 0:
                tn = prossimo_nodo(t, passo_adattivo(s), verso)
                if ie < ex.size and verso * (tn - ex[ie]) >= 0:
                    tn = float(ex[ie])
                    ie += 1
                if verso * (tn - limite) > 0:
                    tn = limite
                s = pr.a(tn)[0]
                t = tn
                tt.append(t)
                ss.append(s)
            if verso < 0:
                tt.reverse()
                ss.reverse()
                parti_t.insert(0, np.array(tt))
                parti_s.insert(0, np.array(ss))
            else:
                parti_t.append(np.array(tt))
                parti_s.append(np.array(ss))
        tempi = np.concatenate(parti_t)
        stati = np.concatenate(parti_s)
        return cls(tempi, stati, conf)

    def indice_esatto(self, t: np.ndarray) -> np.ndarray:
        """Indice del campione memorizzato coincidente con t, -1 se assente."""
        j = np.searchsorted(self.tempi, t)
        j = np.clip(j, 0, self.tempi.size - 1)
        return np.where(self.tempi[j] == t, j, -1)

    def stati_a(self, amb: Ambiente | None, t: np.ndarray) -> np.ndarray:
        """Stati (n, 6) agli istanti t (in qualsiasi ordine) entro la disponibilità."""
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        a, b = self.disponibile
        if np.any(tt < a) or np.any(tt > b):
            raise ValueError("istante fuori dalla traiettoria ASSIST")
        out = np.empty((tt.size, 6))
        j = self.indice_esatto(tt)
        ok = j >= 0
        out[ok] = self.stati[j[ok]]
        mancanti = np.nonzero(~ok)[0]
        if mancanti.size:
            if amb is None:
                raise ValueError("istanti non memorizzati: serve l'ambiente ASSIST")
            ordine = mancanti[np.argsort(tt[mancanti])]
            pr = None
            t_ult = -math.inf
            for q in ordine:
                tq = float(tt[q])
                if pr is None or tq - t_ult > RIPARTENZA_MAX:
                    # riparte dal campione memorizzato precedente e prosegue in avanti
                    b0 = int(np.searchsorted(self.tempi, tq, side="right") - 1)
                    pr = Propagatore(amb, float(self.tempi[b0]), self.stati[b0], self.conf, 1.0)
                out[q] = pr.a(tq)[0]
                t_ult = tq
        return out

    def salva(self, percorso: Path) -> None:
        percorso.parent.mkdir(parents=True, exist_ok=True)
        ng = self.conf.ng if self.conf.ng is not None else np.zeros((0, 3))
        np.savez(
            percorso,
            tempi=self.tempi,
            stati=self.stati,
            ng=ng,
            g=np.array([self.conf.g[k] for k in ("ALN", "NK", "NM", "NN", "R0")]),
            asteroidi=np.array([self.conf.asteroidi]),
        )

    @classmethod
    def carica(cls, percorso: Path) -> TraiettoriaAssist:
        d = np.load(percorso)
        ng = d["ng"] if d["ng"].size else None
        g = dict(zip(("ALN", "NK", "NM", "NN", "R0"), (float(x) for x in d["g"]), strict=True))
        return cls(d["tempi"], d["stati"], Configurazione(ng=ng, g=g, asteroidi=bool(d["asteroidi"][0])))
