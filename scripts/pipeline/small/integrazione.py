"""Integrazione con ASSIST 1.2.3 (Holman et al. 2023, PSJ 4:69) su REBOUND 4.6.0 (IAS15).

Si usa solo nell'ambiente .venv-assist. Modello di forze predefinito di ASSIST: Sole, pianeti e Luna
da DE441 (linux_m13000p17000.441), 16 asteroidi di sb441-n16, armoniche J2 di Sole e Terra,
relatività (EIH), forze non gravitazionali di Marsden et al. (1973) con A1, A2, A3 per particella e
g(r) per simulazione. ASSIST 1.2.3 non gestisce il ritardo DT: è ignorato (variante dichiarata).
Prima di JD -1 200 000,5 la forza degli asteroidi è disattivata (sb441-n16 inizia a -1 200 525,5).

Convenzioni: ASSIST lavora in UA, giorni, ICRF baricentrico, tempo relativo a jd_ref = 2 451 545,0.
In ingresso e in uscita: stati eliocentrici nell'eclittica J2000, km e km/s, tempi in JD TDB.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from common.constants import GIORNO_S, UA_KM
from common.frames import eclittica_a_icrf, icrf_a_eclittica

from .anagrafica import FILE_PIANETI_ASSIST, FILE_SB441

T_SPEGNI_ASTEROIDI = -1200000.5
MARGINE_ESATTO = 8192.0  # d
INIZIO_SB441 = -1200525.5
FORZE_TUTTE = ["SUN", "PLANETS", "ASTEROIDS", "NON_GRAVITATIONAL", "EARTH_HARMONICS", "SUN_HARMONICS", "GR_EIH"]


def _moduli():
    import assist
    import rebound

    return assist, rebound


class Ambiente:
    """Effemeridi di ASSIST caricate una volta: DE441 binario con e senza sb441-n16.

    ASSIST 1.2.3 valuta le effemeridi degli asteroidi caricati anche con la forza degli asteroidi
    disattivata (ciclo delle equazioni variazionali in forces.c): fuori dalla copertura di sb441-n16
    l'integrazione si interrompe. Senza forza degli asteroidi si usa quindi un'effemeride senza file
    degli asteroidi.
    """

    def __init__(self, asteroidi: Path = FILE_SB441) -> None:
        assist, _ = _moduli()
        self.file_asteroidi = Path(asteroidi)
        self.eph = assist.Ephem(str(FILE_PIANETI_ASSIST), str(self.file_asteroidi))
        self._eph_senza = None
        self.jd_ref = float(self.eph.jd_ref)

    def eph_senza(self):
        """Effemeride senza asteroidi (ASSIST segnala su stderr l'assenza del file, come previsto)."""
        if self._eph_senza is None:
            assist, _ = _moduli()
            self._eph_senza = assist.Ephem(str(FILE_PIANETI_ASSIST), str(self.file_asteroidi) + ".assente")
        return self._eph_senza

    def sole(self, t_jd: float) -> np.ndarray:
        """Stato baricentrico del Sole (UA, UA/d, ICRF)."""
        p = self.eph.get_particle("Sun", t_jd - self.jd_ref)
        return np.array([p.x, p.y, p.z, p.vx, p.vy, p.vz])


def elio_a_bary(stati_km: np.ndarray, sole_au: np.ndarray) -> np.ndarray:
    """Stati eliocentrici eclittici (km, km/s) -> baricentrici ICRF (UA, UA/d)."""
    s = eclittica_a_icrf(np.atleast_2d(stati_km))
    out = np.empty_like(s)
    out[:, :3] = s[:, :3] / UA_KM + sole_au[:3]
    out[:, 3:] = s[:, 3:] * GIORNO_S / UA_KM + sole_au[3:]
    return out


def bary_a_elio(stati_au: np.ndarray, sole_au: np.ndarray) -> np.ndarray:
    """Stati baricentrici ICRF (UA, UA/d) -> eliocentrici eclittici (km, km/s); sole_au (..., 6)."""
    s = np.empty_like(stati_au)
    s[..., :3] = (stati_au[..., :3] - sole_au[..., None, :3]) * UA_KM
    s[..., 3:] = (stati_au[..., 3:] - sole_au[..., None, 3:]) * UA_KM / GIORNO_S
    return icrf_a_eclittica(s)


@dataclass
class Configurazione:
    """Modello di forze: parametri NG per particella (UA/d²) e funzione g(r) di Marsden."""

    ng: np.ndarray | None = None  # (n, 3) A1, A2, A3
    g: dict[str, float] = field(default_factory=lambda: {"ALN": 1.0, "NK": 0.0, "NM": 2.0, "NN": 5.093, "R0": 1.0})
    asteroidi: bool = True  # forza degli asteroidi dove sb441-n16 è disponibile
    # passo minimo di IAS15 (d): solo per i cloni, evita l'arresto negli incontri quasi radenti
    passo_minimo: float = 0.0

    def forze(self, t_jd: float, verso: float) -> list[str]:
        f = list(FORZE_TUTTE)
        # nel verso del moto, la tratta che parte da t_jd usa gli asteroidi solo se resta dopo T_SPEGNI
        if not self.asteroidi or t_jd < T_SPEGNI_ASTEROIDI or (t_jd == T_SPEGNI_ASTEROIDI and verso < 0):
            f.remove("ASTEROIDS")
        if self.ng is None or not np.any(self.ng):
            f.remove("NON_GRAVITATIONAL")
        return f


def _crea(amb: Ambiente, t_jd: float, stati_km: np.ndarray, conf: Configurazione, verso: float):
    assist, rebound = _moduli()
    sim = rebound.Simulation()
    sim.t = t_jd - amb.jd_ref
    bary = elio_a_bary(stati_km, amb.sole(t_jd))
    for s in bary:
        sim.add(x=s[0], y=s[1], z=s[2], vx=s[3], vy=s[4], vz=s[5])
    forze = conf.forze(t_jd, verso)
    ex = assist.Extras(sim, amb.eph if "ASTEROIDS" in forze else amb.eph_senza())
    ex.forces = forze
    if conf.passo_minimo > 0:
        sim.ri_ias15.min_dt = conf.passo_minimo
    if conf.ng is not None and np.any(conf.ng):
        ex.particle_params = np.ascontiguousarray(conf.ng, dtype=np.float64).ravel()
        ex.alpha = conf.g["ALN"]
        ex.nk = conf.g["NK"]
        ex.nm = conf.g["NM"]
        ex.nn = conf.g["NN"]
        ex.r0 = conf.g["R0"]
    return sim, ex


class Propagatore:
    """Integrazione monotona nel tempo con uscite su richiesta (n particelle).

    Uscite con l'interpolazione interna di IAS15 (assist_integrate_or_interpolate), che non altera
    la sequenza dei passi. Integrando a ritroso con la forza degli asteroidi, entro MARGINE_ESATTO dal
    confine T_SPEGNI_ASTEROIDI si passa a passi con arrivo esatto sugli istanti richiesti: un passo
    lungo (oggetti lontani) oltrepasserebbe l'inizio di sb441-n16 (JD -1 200 525,5). Al confine la
    simulazione si ricrea dallo stato esatto con il nuovo insieme di forze.
    """

    def __init__(self, amb: Ambiente, t0_jd: float, stati0_km: np.ndarray, conf: Configurazione, verso: float):
        self.amb = amb
        self.conf = conf
        self.verso = 1.0 if verso >= 0 else -1.0
        self.t0 = float(t0_jd)
        self.t = float(t0_jd)
        stati = np.array(stati0_km, dtype=np.float64, ndmin=2)
        self.n = stati.shape[0]
        self._buf = np.empty(6 * self.n)
        self._ultimo = stati.copy()
        self._sim, self._ex = _crea(amb, self.t, stati, conf, self.verso)
        self._confine = conf.asteroidi and (self.verso * (T_SPEGNI_ASTEROIDI - self.t) > 0)
        self._esatto = False

    def _leggi(self, t: float) -> np.ndarray:
        self._sim.serialize_particle_data(xyzvxvyvz=self._buf)
        return bary_a_elio(self._buf.reshape(self.n, 6)[None], self.amb.sole(t)[None])[0]

    def _ricrea(self, t: float, stato: np.ndarray) -> None:
        del self._ex, self._sim
        self._sim, self._ex = _crea(self.amb, t, stato, self.conf, self.verso)

    def _vicino_al_confine(self, t: float) -> bool:
        """Vero se un passo normale verso t potrebbe oltrepassare l'inizio di sb441-n16."""
        if t <= T_SPEGNI_ASTEROIDI + MARGINE_ESATTO:
            return True
        passo = max(abs(self._sim.dt), abs(self._sim.dt_last_done))
        return t - 2.0 * passo <= INIZIO_SB441 + 1.0

    def _esatto_a(self, t: float) -> np.ndarray:
        if not self._esatto:
            self._ricrea(self.t, self._ultimo)
            self._sim.exact_finish_time = 1
            self._esatto = True
        self._sim.integrate(t - self.amb.jd_ref)
        return self._leggi(t)

    def a(self, t: float) -> np.ndarray:
        """Stati (n, 6) km e km/s all'istante t, non precedente (nel verso) all'ultimo richiesto."""
        if self.verso * (t - self.t) < 0:
            raise ValueError("istanti non monotoni nel verso dell'integrazione")
        if self._confine and self.verso < 0 and (self._esatto or self._vicino_al_confine(t)):
            if t >= T_SPEGNI_ASTEROIDI:
                out = self._esatto_a(t)
                self.t = float(t)
                self._ultimo = out
                return out
            stato = self._esatto_a(T_SPEGNI_ASTEROIDI)
            self._ricrea(T_SPEGNI_ASTEROIDI, stato)
            self._confine = False
            self._esatto = False
        elif self._confine and self.verso > 0 and t > T_SPEGNI_ASTEROIDI:
            self._ex.integrate_or_interpolate(T_SPEGNI_ASTEROIDI - self.amb.jd_ref)
            self._ricrea(T_SPEGNI_ASTEROIDI, self._leggi(T_SPEGNI_ASTEROIDI))
            self._confine = False
        self._ex.integrate_or_interpolate(t - self.amb.jd_ref)
        self.t = float(t)
        self._ultimo = self._leggi(t)
        return self._ultimo


def integra(
    amb: Ambiente,
    t0_jd: float,
    stati0_km: np.ndarray,
    conf: Configurazione,
    tempi_jd: Sequence[float] | np.ndarray,
) -> Iterator[tuple[float, np.ndarray]]:
    """Genera (t, stati (n, 6) km e km/s) agli istanti richiesti, monotoni a partire da t0."""
    tempi = np.asarray(tempi_jd, dtype=np.float64)
    if tempi.size == 0:
        return
    verso = float(np.sign(tempi[-1] - t0_jd)) or 1.0
    pr = Propagatore(amb, t0_jd, stati0_km, conf, verso)
    for t in tempi:
        yield float(t), pr.a(float(t))


def integra_array(
    amb: Ambiente, t0_jd: float, stati0_km: np.ndarray, conf: Configurazione, tempi_jd: np.ndarray
) -> np.ndarray:
    """Come `integra`, con tutte le uscite in un array (m, n, 6)."""
    tempi = np.asarray(tempi_jd, dtype=np.float64)
    out = np.empty((tempi.size, np.atleast_2d(stati0_km).shape[0], 6))
    for k, (_, s) in enumerate(integra(amb, t0_jd, stati0_km, conf, tempi)):
        out[k] = s
    return out
