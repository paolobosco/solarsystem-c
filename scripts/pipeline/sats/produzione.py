"""Produzione dei record per satellite (§ 7.5.1-7.5.4): tassellazione, adattamento sulle fonti,
estrapolazione secolare, errori del § 7.5.6. Risultati intermedi in .cache/sats/record/.
"""

from __future__ import annotations

import json
import math
from contextlib import ExitStack
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from common import constants as cst
from common.frames import icrf_a_eclittica

from . import campioni, secolare, sorgenti
from . import kernel as kn
from . import modello as mod
from . import record as rc
from .anagrafica import Satellite, arco
from .sistema import in_f
from .sistemi import ParametriSistema

GIORNI_ANNO = 365.25
CARTELLA = kn.CACHE / "record"
# Obiettivo di adattamento per la scelta della durata dei record: 30″ per i satelliti regolari (metà della
# soglia "precisa" del § 7.8.2), un quarto della tolleranza per Iperione e gli irregolari.
OBIETTIVO_REGOLARI = math.radians(30.0 / 3600.0)


def durata_predefinita(periodo: float) -> float:
    return 10.0 if periodo < 3.0 else 20.0 if periodo < 20.0 else 50.0


def candidati_durata(periodo: float) -> tuple[float, ...]:
    """Durate di prova (anni) che dividono la durata predefinita (griglie allineate)."""
    d = durata_predefinita(periodo)
    return tuple(x for x in (2.0, 5.0, 10.0, 20.0, 50.0) if x <= d and (d / x) == int(d / x))


def obiettivo(s: Satellite) -> float:
    return OBIETTIVO_REGOLARI if s.classe == "regolare" else 0.25 * s.tolleranza_rad


# Errore radiale ammesso (frazione di a, § 7.5.6).
TOLLERANZA_RADIALE = 0.01
# Margine sulle tolleranze nella scelta della durata (le prove coprono 40 anni attorno al 2000).
MARGINE_TOLLERANZA = 0.8


def _ammesse(s: Satellite, prove: list[dict]) -> list[dict]:
    """Prove entro le tolleranze del § 7.5.6 con margine; se nessuna, quella con l'errore radiale minimo
    (i record che superano le tolleranze si dividono poi in produzione)."""
    tol_ang = math.degrees(s.tolleranza_rad) * 3600.0 * MARGINE_TOLLERANZA
    tol_rad = TOLLERANZA_RADIALE * MARGINE_TOLLERANZA
    ok = [p for p in prove if p["maxAngoloArcsec"] <= tol_ang and p["maxRadialeFrazioneA"] <= tol_rad]
    return ok or [min(prove, key=lambda p: p["maxRadialeFrazioneA"])]


def scegli_durata(s: Satellite, prove: list[dict]) -> float:
    """Durata dei record (anni) nella finestra del kernel moderno, dalle prove attorno al 2000.

    Tra le durate entro le tolleranze: la più lunga che rispetta l'obiettivo; altrimenti la più lunga sotto
    la soglia "precisa" (1′); altrimenti la più lunga con errore ≤ 1,5 volte il minimo (record più brevi
    non cambiano il livello).
    """
    amm = _ammesse(s, prove)
    ob = math.degrees(obiettivo(s)) * 3600.0
    for soglia in (ob, 60.0):
        ok = [p["durataAnni"] for p in amm if p["maxAngoloArcsec"] <= soglia]
        if ok:
            return max(ok)
    minimo = min(p["maxAngoloArcsec"] for p in amm)
    return max(p["durataAnni"] for p in amm if p["maxAngoloArcsec"] <= 1.5 * minimo)


def scegli_durata_lunghi(s: Satellite, prove: list[dict]) -> float:
    """Durata dei record nelle zone dei kernel lunghi: la più lunga entro le tolleranze (lontano dall'arco
    l'errore è dominato dall'estrapolazione)."""
    return max(p["durataAnni"] for p in _ammesse(s, prove))


@dataclass
class Fonte:
    nome: str
    inizio: float
    fine: float
    tipo: str


@dataclass
class Tassellazione:
    """Confini dei record da SPK per fonte e intervalli secolari."""

    zone: list[tuple[str, NDArray[np.float64]]] = field(default_factory=list)  # (kernel, confini)
    secolare_passato: tuple[float, float] | None = None
    secolare_futuro: tuple[float, float] | None = None


def _su_griglia(t: float, L: float, verso: str) -> float:
    m = (t - cst.J2000) / L
    m = math.ceil(m) if verso == "su" else math.floor(m)
    return cst.J2000 + m * L


def _confini(inizio: float, fine: float, L: float) -> NDArray[np.float64]:
    """Confini da `inizio` a `fine` sulla griglia J2000 + m·L; i pezzi agli estremi più corti di L/2 si
    uniscono al record vicino."""
    interni = []
    g = _su_griglia(inizio + 0.5 * L, L, "su")
    while g <= fine - 0.5 * L:
        interni.append(g)
        g += L
    return np.array([inizio, *interni, fine], dtype=np.float64)


def tassella(fonti: list[Fonte], L_mod: float, L_lungo: float) -> Tassellazione:
    """Zona del kernel moderno con record di durata L_mod, zone dei kernel lunghi con L_lungo, secolari ai lati.

    La zona di ogni kernel inizia 0,1·L prima della sua copertura e termina 0,1·L dopo, così che il
    raccordo con la zona vicina cada fuori dalla finestra del kernel (il record vi è usato solo per il
    raccordo); confini interni sulla griglia J2000 + m·L. Si copre [T0, T_END).
    """
    out = Tassellazione()
    mod_f = next(f for f in fonti if f.tipo == "moderno")
    lunghi = sorted((f for f in fonti if f.tipo == "lungo"), key=lambda f: f.inizio)
    rb = mod.FRAZIONE_RACCORDO
    fine_utile = _su_griglia(cst.T_END, L_mod, "su")
    m0 = max(mod_f.inizio - rb * L_mod, cst.T0)
    m1 = min(mod_f.fine + rb * L_mod, fine_utile)
    inizio_spk, fine_spk = m0, m1
    if lunghi:
        l0 = max(min(f.inizio for f in lunghi) - rb * L_lungo, cst.T0)
        if l0 < m0 - 0.5 * L_lungo:
            out.zone.append(("lungo", _confini(l0, m0, L_lungo)))
            inizio_spk = l0
        l1 = min(max(f.fine for f in lunghi) + rb * L_lungo, _su_griglia(cst.T_END, L_lungo, "su"))
        if l1 > m1 + 0.5 * L_lungo and m1 < cst.T_END:
            dopo = _confini(m1, l1, L_lungo)
            fine_spk = l1
        else:
            dopo = None
    else:
        dopo = None
    out.zone.append(("moderno", _confini(m0, m1, L_mod)))
    if dopo is not None:
        out.zone.append(("lungo", dopo))
    if inizio_spk > cst.T0:
        out.secolare_passato = (cst.T0, inizio_spk)
    if fine_spk < cst.T_END:
        out.secolare_futuro = (fine_spk, cst.T_END + L_lungo)
    return out


def intervallo_sorgente(s: Satellite, par: ParametriSistema, nome: str, aperti: dict) -> rc.Intervallo:
    a, b = sorgenti.copertura(s, nome, aperti)
    rf = np.array(par.rf).reshape(3, 3)

    def stati(t: NDArray[np.float64]) -> NDArray[np.float64]:
        return in_f(rf, icrf_a_eclittica(sorgenti.stato_icrf(s, nome, aperti, t)))

    return rc.Intervallo(nome, a, b, 2 if kn.KERNEL[nome].tipo == "moderno" else 1, stati)


def adatta_zona(
    s: Satellite,
    par: ParametriSistema,
    nomi: list[str],
    confini: NDArray[np.float64],
    frequenze: list[float],
    registro,
) -> tuple[list[mod.Record], list[rc.Diagnostica]]:
    """Record sui confini indicati con le fonti `nomi` (kernel in cache)."""
    nu = np.array(frequenze)
    # durata minima dei record suddivisi: 0,25 anni (per Imalia anche meno di un periodo: la prova con
    # L = 0,5 anni rispetta le tolleranze, vedi docs/_parti/satelliti.md)
    durata_minima = 0.25 * GIORNI_ANNO
    tol = rc.Tolleranze(MARGINE_TOLLERANZA * s.tolleranza_rad, MARGINE_TOLLERANZA * TOLLERANZA_RADIALE, durata_minima)
    with ExitStack() as pila:
        aperti = sorgenti.lettori(nomi, pila)
        iv = [intervallo_sorgente(s, par, n, aperti) for n in nomi]
        return rc.adatta_sequenza(
            iv, confini, par.periodo, par.e, par.mu, par.fattore_i, nu, nu.size, registro, tolleranze=tol
        )


def campioni_fonti(s: Satellite, par: ParametriSistema, nomi: list[str]) -> tuple[NDArray, NDArray]:
    """Tempi e posizioni in F dei campioni casuali delle fonti, ordinati."""
    assert s.naif is not None
    rf = np.array(par.rf).reshape(3, 3)
    t = np.concatenate([campioni.leggi(n, s.naif)["t"] for n in nomi])
    st = np.concatenate([campioni.leggi(n, s.naif)["stati"] for n in nomi])
    o = np.argsort(t)
    return t[o], in_f(rf, icrf_a_eclittica(st[o]))[:, :3]


def differenza_sorgenti(s: Satellite, par: ParametriSistema, moderno: str, lunghi: list[str]) -> dict:
    """ε_sorgente: massima differenza angolare tra kernel moderno e lunghi nella sovrapposizione."""
    assert s.naif is not None
    cm = campioni.leggi(moderno, s.naif)
    out = {"maxGradi": 0.0, "maxKm": 0.0, "campioni": 0}
    for nome in lunghi:
        cl = campioni.leggi(nome, s.naif)
        a = max(cm["copertura"][0], cl["copertura"][0])
        b = min(cm["copertura"][1], cl["copertura"][1])
        m = (cm["t"] >= a) & (cm["t"] <= b)
        if not np.any(m):
            continue
        with ExitStack() as pila:
            if not kn.KERNEL[nome].percorso.exists():
                continue
            aperti = sorgenti.lettori([nome], pila)
            st_l = sorgenti.stato_icrf(s, nome, aperti, cm["t"][m])
        st_m = cm["stati"][m]
        d = np.linalg.norm(st_l[:, :3] - st_m[:, :3], axis=1)
        croce = np.linalg.norm(np.cross(st_l[:, :3], st_m[:, :3]), axis=1)
        ang = np.arctan2(croce, np.sum(st_l[:, :3] * st_m[:, :3], axis=1))
        out["maxGradi"] = max(out["maxGradi"], math.degrees(float(ang.max())))
        out["maxKm"] = max(out["maxKm"], float(d.max()))
        out["campioni"] += int(np.count_nonzero(m))
    return out


def record_secolare(
    x: NDArray[np.float64], t_ref: float, fattore_i: int, intervallo: tuple[float, float]
) -> mod.Record:
    return mod.record_da_parametri(x, mod.TIPO_SECOLARE, fattore_i, intervallo[0], intervallo[1], t_ref)


def epsilon_estrapolazione(s: Satellite, sigma_n: float, n: float, t: NDArray | float) -> NDArray | float:
    return secolare.estrapolazione(sigma_n, secolare.sigma_ndot(s.naif, n), secolare.tau_da_arco(t, arco(s.naif)))


def salva(slug: str, dati: dict) -> None:
    """Scrittura atomica (file temporaneo e rinomina): un'interruzione non lascia file troncati."""
    CARTELLA.mkdir(parents=True, exist_ok=True)
    tmp = CARTELLA / f".{slug}.json.tmp"
    tmp.write_text(json.dumps(dati) + "\n", encoding="utf-8")
    tmp.replace(CARTELLA / f"{slug}.json")


def carica(slug: str) -> dict:
    return json.loads((CARTELLA / f"{slug}.json").read_text(encoding="utf-8"))


def record_in_dizionario(r: mod.Record) -> dict:
    return {"tipo": r.tipo, "I": r.fattore_i, "valori": r.valori()}


def record_da_dizionario(d: dict) -> mod.Record:
    v = d["valori"]
    return mod.Record(d["tipo"], d["I"], *v[:14], sc=np.array(v[14:], dtype=np.float64).reshape(-1, 2))
