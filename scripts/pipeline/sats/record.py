"""Suddivisione in record, adattamento in sequenza e misura dei residui con raccordo (§ 7.5.2-7.5.3)."""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from common.constants import J2000

from . import adatta
from . import modello as mod

GIORNI_ANNO = 365.25

# Funzione che restituisce gli stati (n, 6) nel sistema F ai tempi indicati (km, km/s).
Sorgente = Callable[[NDArray[np.float64]], NDArray[np.float64]]


@dataclass
class Intervallo:
    """Sorgente disponibile su [inizio, fine] (JD TDB) con la sua priorità (maggiore = preferita)."""

    nome: str
    inizio: float
    fine: float
    priorita: int
    stati: Sorgente


@dataclass
class Diagnostica:
    fonte: str
    campioni: int
    iterazioni: int
    rms_km: float
    # errori massimi sul nucleo del record, senza raccordo (rad, frazione di a)
    angolo_nucleo: float = 0.0
    radiale_nucleo: float = 0.0
    suddivisioni: int = 0


def griglia_confini(inizio: float, fine: float, durata: float) -> NDArray[np.float64]:
    """Confini dei record allineati a J2000 + m·durata, interni a [inizio, fine]."""
    m0 = math.ceil((inizio - J2000) / durata)
    m1 = math.floor((fine - J2000) / durata)
    if m1 <= m0:
        return np.zeros(0)
    return J2000 + durata * np.arange(m0, m1 + 1, dtype=np.float64)


def scegli_fonte(intervalli: list[Intervallo], a: float, b: float) -> Intervallo | None:
    """Fonte di priorità massima che copre [a, b]."""
    cand = [s for s in intervalli if s.inizio <= a and s.fine >= b]
    return max(cand, key=lambda s: s.priorita) if cand else None


def fonte_prevalente(intervalli: list[Intervallo], a: float, b: float) -> Intervallo | None:
    """Fonte di priorità massima che copre [a, b]; altrimenti quella con la sovrapposizione maggiore
    (record ai bordi delle coperture, adattati sulla parte coperta)."""
    f = scegli_fonte(intervalli, a, b)
    if f is not None:
        return f
    sovr = [(min(b, s.fine) - max(a, s.inizio), s.priorita, s) for s in intervalli]
    sovr = [x for x in sovr if x[0] > 0]
    return max(sovr, key=lambda x: (x[0], x[1]))[2] if sovr else None


def adatta_record(
    fonte: Intervallo,
    t_inizio: float,
    t_fine: float,
    periodo: float,
    e_nominale: float,
    mu: float,
    fattore_i: int,
    frequenze: NDArray[np.float64],
    k: int,
    x_prec: NDArray[np.float64] | None = None,
    t_ref_prec: float | None = None,
    frazione_estesa: float = 0.25,
    rms_prec: float = math.inf,
) -> tuple[mod.Record, Diagnostica]:
    """Adatta un record sul nucleo [t_inizio, t_fine) esteso di L/4 per lato (limitato alla fonte)."""
    durata = t_fine - t_inizio
    a = max(fonte.inizio, t_inizio - frazione_estesa * durata)
    b = min(fonte.fine, t_fine + frazione_estesa * durata)
    dt = periodo / adatta.campioni_per_orbita(e_nominale)
    t = np.arange(a, b, dt)
    st = fonte.stati(t)
    t_ref = 0.5 * (t_inizio + t_fine)
    nu = frequenze[:k]
    migliore = adatta.levenberg_marquardt(
        adatta.stima_iniziale(t, st, mu, fattore_i, t_ref, k), t_ref, nu, fattore_i, t, st[:, :3]
    )
    if x_prec is not None and t_ref_prec is not None and migliore.rms_km > 1.5 * rms_prec:
        # stima iniziale alternativa: record precedente traslato
        xp = adatta.trasla_parametri(x_prec, t_ref - t_ref_prec, frequenze[: (x_prec.size - mod.N_BASE) // 2])
        if xp.size < mod.N_BASE + 2 * k:
            xp = np.concatenate([xp, np.zeros(mod.N_BASE + 2 * k - xp.size)])
        es = adatta.levenberg_marquardt(xp[: mod.N_BASE + 2 * k], t_ref, nu, fattore_i, t, st[:, :3])
        if es.costo < migliore.costo:
            migliore = es
    assert migliore is not None
    rec = mod.record_da_parametri(migliore.x, mod.TIPO_SPK, fattore_i, t_inizio, t_fine, t_ref)
    nucleo = (t >= t_inizio) & (t < t_fine)
    ang, rad = adatta.errori(mod.posizione_parametri(migliore.x, t_ref, nu, fattore_i, t[nucleo]), st[nucleo, :3])
    return rec, Diagnostica(
        fonte.nome,
        int(t.size),
        migliore.iterazioni,
        migliore.rms_km,
        float(ang.max()) if ang.size else 0.0,
        float(np.abs(rad).max() / rec.a) if rad.size else 0.0,
    )


@dataclass
class Tolleranze:
    """Soglie per la suddivisione dei record: errore angolare (rad) e radiale (frazione di a) sul nucleo."""

    angolo: float
    radiale: float
    durata_minima: float = 0.0  # d


def adatta_sequenza(
    intervalli: list[Intervallo],
    confini: NDArray[np.float64],
    periodo: float,
    e_nominale: float,
    mu: float,
    fattore_i: int,
    frequenze: NDArray[np.float64],
    k: int,
    registro: Callable[[str], None] | None = None,
    tolleranze: Tolleranze | None = None,
) -> tuple[list[mod.Record], list[Diagnostica]]:
    """Record sui nuclei [confini[j], confini[j+1]).

    Con `tolleranze`, un record il cui errore sul nucleo supera le soglie si divide in due metà, finché
    le metà non scendono sotto la durata minima.
    """
    records: list[mod.Record] = []
    diag: list[Diagnostica] = []
    stato = {"x": None, "t_ref": None, "rms": math.inf}

    def adatta_intervallo(t0: float, t1: float, livello: int) -> None:
        lb = mod.FRAZIONE_RACCORDO * (t1 - t0)
        fonte = fonte_prevalente(intervalli, t0 - lb, t1 + lb)
        if fonte is None:
            raise ValueError(f"nessuna fonte copre il record [{t0}, {t1})")
        rec, d = adatta_record(
            fonte,
            t0,
            t1,
            periodo,
            e_nominale,
            mu,
            fattore_i,
            frequenze,
            k,
            stato["x"],
            stato["t_ref"],
            rms_prec=stato["rms"],
        )
        fuori = tolleranze is not None and (
            d.angolo_nucleo > tolleranze.angolo or d.radiale_nucleo > tolleranze.radiale
        )
        if fuori and tolleranze is not None and 0.5 * (t1 - t0) >= tolleranze.durata_minima:
            tm = 0.5 * (t0 + t1)
            adatta_intervallo(t0, tm, livello + 1)
            adatta_intervallo(tm, t1, livello + 1)
            return
        d.suddivisioni = livello
        records.append(rec)
        diag.append(d)
        stato["x"] = rec.parametri()
        stato["t_ref"] = rec.t_ref
        stato["rms"] = d.rms_km

    for j in range(confini.size - 1):
        adatta_intervallo(float(confini[j]), float(confini[j + 1]), 0)
        if registro is not None and (j % 20 == 0 or j == confini.size - 2):
            d = diag[-1]
            registro(
                f"  record {j + 1}/{confini.size - 1} ({d.fonte}) rms {d.rms_km:.2f} km, it {d.iterazioni},"
                f" record totali {len(records)}"
            )
    return records, diag


def residui_sequenza(
    records: list[mod.Record],
    frequenze: NDArray[np.float64],
    intervalli: list[Intervallo],
    periodo: float,
    e_nominale: float,
    sfasamento: float = 0.37,
    fonti_record: list[str | None] | None = None,
) -> dict:
    """Errori del modello con raccordo (nel sistema F) su una griglia sfasata rispetto a quella di adattamento.

    Per ogni record: massimo errore angolare (rad) e radiale (km) sul nucleo, rispetto alla fonte che lo
    ha generato (`fonti_record`, nomi dei kernel; senza, la fonte di priorità massima che copre il nucleo).
    NaN se la fonte non è disponibile. Con `fonti_record` si escludono le zone di raccordo con un record di
    fonte diversa (giunzione tra sorgenti): vi si assorbe il salto tra le sorgenti (§ 7.5.1), misurato a parte.
    """
    eye = np.eye(3)
    dt = periodo / adatta.campioni_per_orbita(e_nominale)
    ang_max = np.zeros(len(records))
    rad_max = np.zeros(len(records))
    per_nome = {iv.nome: iv for iv in intervalli}
    for j, rec in enumerate(records):
        if fonti_record is not None:
            nome = fonti_record[j]
            fonte = per_nome.get(nome) if nome is not None else None
        else:
            fonte = scegli_fonte(intervalli, rec.t_inizio, rec.t_fine)
        if fonte is None:
            ang_max[j] = rad_max[j] = np.nan
            continue
        t0, t1 = rec.t_inizio, rec.t_fine
        if fonti_record is not None:
            if j > 0 and fonti_record[j - 1] != fonti_record[j]:
                t0 += mod.semiampiezza_raccordo(records[j - 1], rec)
            if j < len(records) - 1 and fonti_record[j + 1] != fonti_record[j]:
                t1 -= mod.semiampiezza_raccordo(rec, records[j + 1])
        t = np.arange(max(t0, fonte.inizio) + sfasamento * dt, min(t1, fonte.fine), dt)
        lo = max(0, j - 1)
        st, _ = mod.stato_sequenza(records[lo : j + 2], frequenze, eye, t)
        dati = fonte.stati(t)
        ang, rad = adatta.errori(st[:, :3], dati[:, :3])
        ang_max[j] = float(ang.max())
        rad_max[j] = float(np.abs(rad).max())
    return {"angolo": ang_max, "radiale": rad_max}


def residui_lungo_traccia_sequenza(
    records: list[mod.Record], frequenze: NDArray[np.float64], fonte: Intervallo, periodo: float, e_nominale: float
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Residuo angolare lungo la traccia su griglia uniforme continua sui nuclei dei record."""
    dt = periodo / adatta.campioni_per_orbita(e_nominale)
    t = np.arange(records[0].t_inizio, records[-1].t_fine, dt)
    st, _ = mod.stato_sequenza(records, frequenze, np.eye(3), t)
    dati = fonte.stati(t)
    return t, adatta.residuo_lungo_traccia(st, dati[:, :3])
