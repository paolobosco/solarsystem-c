"""Prova S3 (§ 14.2): modello a record su Io, Mimas, Iperione, Tritone, Nereide, Caronte; scelta della
durata dei record L e del numero di termini K; confronto tra estrapolazione secolare dal kernel
moderno e kernel lunghi. Funzioni dei comandi scelte, lunghi e spike (sats/pipeline.py); riepilogo in
out/spike-sats.json.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import NDArray

from common.frames import icrf_a_eclittica

from . import adatta, campioni, secolare, sorgenti
from . import modello as mod
from . import record as rc
from .anagrafica import Satellite, arco
from .sistema import in_f
from .sistemi import ParametriSistema

GIORNI_ANNO = 365.25
CASI = (501, 601, 607, 801, 802, 901)
SOGLIA_AMPIEZZA = math.radians(1.0 / 3600.0)  # 1″: termini più piccoli non si includono


def durata_predefinita(periodo: float) -> float:
    """Durata iniziale del § 7.5.2 in anni: 10 per P < 3 d, 20 per 3-20 d, 50 oltre."""
    return 10.0 if periodo < 3.0 else 20.0 if periodo < 20.0 else 50.0


def bande_escluse(n: float, varpi_dot: float, finestra: float) -> list[tuple[float, float]]:
    """Bande attorno alle armoniche della frequenza anomalistica (degeneri con e e ϖ nel record)."""
    w = abs(n - varpi_dot)
    delta = 2.0 * 2.0 * math.pi / finestra
    return [(k * w - delta, k * w + delta) for k in (1, 2, 3)]


def intervallo_moderno(s: Satellite, par: ParametriSistema, aperti: dict) -> rc.Intervallo:
    nome = s.kernel_moderno
    assert nome is not None
    a, b = sorgenti.copertura(s, nome, aperti)
    rf = np.array(par.rf).reshape(3, 3)

    def stati(t: NDArray[np.float64]) -> NDArray[np.float64]:
        return in_f(rf, icrf_a_eclittica(sorgenti.stato_icrf(s, nome, aperti, t)))

    return rc.Intervallo(nome, a, b, 2, stati)


def finestra_prova(fonte: rc.Intervallo, anni: float, centro: float = 2451545.0) -> tuple[float, float]:
    """Finestra di `anni` centrata in `centro`, spostata dentro la copertura della fonte."""
    meta = 0.5 * anni * GIORNI_ANNO
    a, b = centro - meta, centro + meta
    margine = 0.5 * 50 * GIORNI_ANNO
    if a < fonte.inizio + margine:
        a, b = fonte.inizio + margine, fonte.inizio + margine + 2 * meta
    if b > fonte.fine - margine:
        a, b = fonte.fine - margine - 2 * meta, fonte.fine - margine
    return a, b


def analisi_frequenze(
    s: Satellite, par: ParametriSistema, fonte: rc.Intervallo, durata_anni: float, anni: float = 100.0, registro=None
) -> dict:
    """Frequenze ν_k dai residui lungo la traccia di record con K = 0 (CLEAN, fino a 6 picchi ≥ 1″)."""
    L = durata_anni * GIORNI_ANNO
    a, b = finestra_prova(fonte, max(anni, 3 * durata_anni))
    conf = rc.griglia_confini(a, b, L)
    recs, _ = rc.adatta_sequenza([fonte], conf, par.periodo, par.e, par.mu, par.fattore_i, np.zeros(0), 0)
    t, y = rc.residui_lungo_traccia_sequenza(recs, np.zeros(0), fonte, par.periodo, par.e)
    n = float(np.mean([r.n for r in recs]))
    vd = float(np.mean([r.varpi_dot for r in recs]))
    finestra = 1.5 * L
    escl = bande_escluse(n, vd, finestra)
    picchi = adatta.clean_frequenze(t, y, mod.K_MAX, 2.0 * 2.0 * math.pi / finestra, 3.0 * abs(n), escl)
    scelti = [(w, amp) for w, amp in picchi if amp >= SOGLIA_AMPIEZZA]
    if registro is not None:
        registro(
            f"  {s.slug}: frequenze "
            + ", ".join(f"P={2 * math.pi / w:.3f} d A={math.degrees(amp) * 3600:.1f}″" for w, amp in picchi)
        )
    return {
        "n": n,
        "varpiDot": vd,
        "picchi": [
            {"nu": w, "periodoGiorni": 2 * math.pi / w, "ampiezzaArcsec": math.degrees(amp) * 3600} for w, amp in picchi
        ],
        "frequenze": [w for w, _ in scelti],
        "durataAnni": durata_anni,
        "finestra": [a, b],
    }


def prova_durate(
    s: Satellite,
    par: ParametriSistema,
    fonte: rc.Intervallo,
    frequenze: list[float],
    durate: tuple[float, ...],
    anni: float = 40.0,
    registro=None,
) -> list[dict]:
    """Errori massimi (angolare e radiale) con raccordo per ogni durata L, con K = numero di frequenze."""
    nu = np.array(frequenze)
    k = nu.size
    out = []
    for d in durate:
        L = d * GIORNI_ANNO
        a, b = finestra_prova(fonte, max(anni, 2 * d))
        conf = rc.griglia_confini(a, b, L)
        if conf.size < 2:
            continue
        recs, diag = rc.adatta_sequenza([fonte], conf, par.periodo, par.e, par.mu, par.fattore_i, nu, k)
        res = rc.residui_sequenza(recs, nu, [fonte], par.periodo, par.e)
        byte_secolo = len(recs) * (8 + 8 * (14 + 2 * k)) * 36525.0 / (conf[-1] - conf[0])
        r = {
            "durataAnni": d,
            "K": k,
            "record": len(recs),
            "maxAngoloArcsec": math.degrees(float(np.nanmax(res["angolo"]))) * 3600,
            "medianaAngoloArcsec": math.degrees(float(np.nanmedian(res["angolo"]))) * 3600,
            "maxRadialeKm": float(np.nanmax(res["radiale"])),
            "maxRadialeFrazioneA": float(np.nanmax(res["radiale"]) / recs[0].a),
            "byteSecolo": byte_secolo,
        }
        out.append(r)
        if registro is not None:
            registro(
                f"  {s.slug} L={d:g} anni K={k}: max {r['maxAngoloArcsec']:.1f}″, radiale {r['maxRadialeKm']:.1f} km"
                f" ({100 * r['maxRadialeFrazioneA']:.3f}% a), {r['byteSecolo']:.0f} byte/secolo"
            )
    return out


def secolare_da_moderno(
    s: Satellite, par: ParametriSistema, fonte: rc.Intervallo, frequenze: list[float], registro=None
) -> dict:
    """Estrapolazione secolare adattata sul solo kernel moderno (campioni casuali) e σ_n."""
    assert s.naif is not None and s.kernel_moderno is not None
    c = campioni.leggi(s.kernel_moderno, s.naif)
    rf = np.array(par.rf).reshape(3, 3)
    pos = in_f(rf, icrf_a_eclittica(c["stati"]))[:, :3]
    t = c["t"]
    t_ref = 0.5 * (t[0] + t[-1])
    L = durata_predefinita(par.periodo) * GIORNI_ANNO
    conf = np.array([t_ref - 0.5 * L, t_ref + 0.5 * L])
    recs, _ = rc.adatta_sequenza([fonte], conf, par.periodo, par.e, par.mu, par.fattore_i, np.zeros(0), 0)
    x0 = secolare.x0_da_record(recs, t_ref)
    es = secolare.adatta_secolare(t, pos, x0, t_ref, par.fattore_i, registro=registro)
    ang = secolare.errore_angolare(es.x, t_ref, par.fattore_i, t, pos)
    cv = secolare.sigma_n_validazione_incrociata(t, pos, es.x, t_ref, par.fattore_i)
    return {
        "x": es.x.tolist(),
        "tRef": t_ref,
        "residuoMaxGradi": math.degrees(float(ang.max())),
        "sigmaN": cv["sigmaN"],
        "validazioneIncrociata": cv,
    }


def confronto_lungo(s: Satellite, par: ParametriSistema, sec: dict) -> dict | None:
    """Secolare dal kernel moderno contro kernel lunghi: differenza angolare ed ε_estrapolazione."""
    assert s.naif is not None
    nomi = [n for n in s.kernel_lunghi if campioni.percorso(n, s.naif).exists()]
    if not nomi:
        return None
    rf = np.array(par.rf).reshape(3, 3)
    t = np.concatenate([campioni.leggi(n, s.naif)["t"] for n in nomi])
    st = np.concatenate([campioni.leggi(n, s.naif)["stati"] for n in nomi])
    # solo fuori dalla copertura del kernel moderno, dove il kernel lungo sostituirebbe l'estrapolazione
    assert s.kernel_moderno is not None
    c0, c1 = campioni.leggi(s.kernel_moderno, s.naif)["copertura"]
    fuori = (t < c0) | (t > c1)
    t, st = t[fuori], st[fuori]
    pos = in_f(rf, icrf_a_eclittica(st))[:, :3]
    x = np.array(sec["x"])
    diff = secolare.errore_angolare(x, sec["tRef"], par.fattore_i, t, pos)
    tau = secolare.tau_da_arco(t, arco(s.naif))
    eps = secolare.estrapolazione(sec["sigmaN"], secolare.sigma_ndot(s.naif, x[8]), tau)
    anni = secolare.anni_da_jd(t)
    out = {"kernel": nomi, "intervalli": []}
    # differenza per intervalli di 500 anni, dove ε_estrapolazione < 90°
    for y0 in np.arange(math.floor(anni.min() / 500) * 500, anni.max(), 500.0):
        m = (anni >= y0) & (anni < y0 + 500)
        if not np.any(m):
            continue
        utile = m & (eps < math.pi / 2)
        voce = {
            "anni": [float(y0), float(y0 + 500)],
            "maxDifferenzaGradi": math.degrees(float(diff[m].max())),
            "epsEstrapolazioneMinGradi": math.degrees(float(eps[m].min())),
            "epsEstrapolazioneMaxGradi": math.degrees(float(eps[m].max())),
        }
        if np.any(utile):
            voce["maxDifferenzaDoveDeterminabileGradi"] = math.degrees(float(diff[utile].max()))
            voce["maxRapportoDifferenzaEps"] = float(np.max(diff[utile] / np.maximum(eps[utile], 1e-12)))
        out["intervalli"].append(voce)
    utile = eps < math.pi / 2
    if np.any(utile):
        rapporto = diff[utile] / np.maximum(eps[utile], 1e-12)
        out["maxRapportoDoveDeterminabile"] = float(rapporto.max())
        out["maxDifferenzaDoveDeterminabileGradi"] = math.degrees(float(diff[utile].max()))
        out["livelloCambia"] = _livelli_diversi(eps[utile], diff[utile])
    return out


SOGLIE_LIVELLO = (math.radians(1 / 60), math.radians(1.0), math.radians(10.0), math.radians(90.0))


def _livello(eps: NDArray) -> NDArray:
    return np.searchsorted(np.array(SOGLIE_LIVELLO), eps, side="left")


def _livelli_diversi(eps: NDArray, diff: NDArray) -> float:
    """Frazione dei campioni in cui ε ⊕ differenza cambia il livello di affidabilità (§ 7.8.2)."""
    return float(np.mean(_livello(eps) != _livello(np.hypot(eps, diff))))
