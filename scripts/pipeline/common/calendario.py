"""Conversione calendario <-> giorno giuliano (§ 6.1).

Algoritmo: Meeus, Astronomical Algorithms, 2a ed. (1998), cap. 7, con parte intera per
difetto (floor) in tutte le divisioni, anche per JD negativi (regola T1).
Calendario giuliano se JD < 2 299 160,5, gregoriano altrimenti (regola T2).
"""

from __future__ import annotations

import math
from typing import Literal, NamedTuple

Calendario = Literal["giuliano", "gregoriano"]

# Primo giorno gregoriano: 1582-10-15 00:00 (bolla Inter gravissimas).
JD_INIZIO_GREGORIANO = 2299160.5


class DataCalendario(NamedTuple):
    anno: int  # astronomico (1 a.C. = 0)
    mese: int
    giorno: int
    ora: int
    minuto: int
    secondo: float
    calendario: Calendario


def calendario_a_jd(
    anno: int,
    mese: int,
    giorno: int,
    ora: int = 0,
    minuto: int = 0,
    secondo: float = 0.0,
    calendario: Calendario = "gregoriano",
) -> float:
    """JD della data indicata nel calendario indicato (nessuna validazione della data)."""
    y, m = anno, mese
    if m <= 2:
        y -= 1
        m += 12
    if calendario == "gregoriano":
        a = math.floor(y / 100)
        b = 2 - a + math.floor(a / 4)
    elif calendario == "giuliano":
        b = 0
    else:
        raise ValueError(f"calendario non valido: {calendario}")
    giorni = math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + giorno + b - 1524.5
    return giorni + (ora * 3600 + minuto * 60 + secondo) / 86400.0


def jd_a_calendario(jd: float) -> DataCalendario:
    """Data di calendario del JD, con calendario automatico (T2).

    Ora del giorno arrotondata al millisecondo con riporto al giorno, come jdToCalendar
    in src/time/calendar.ts: le andate e ritorno con secondi interi sono esatte.
    """
    x = jd + 0.5
    z = math.floor(x)
    ms = math.floor((x - z) * 86_400_000.0 + 0.5)
    riporto = ms // 86_400_000
    z += riporto
    ms -= riporto * 86_400_000
    if z < 2299161:
        a = z
        cal: Calendario = "giuliano"
    else:
        alfa = math.floor((z - 1867216.25) / 36524.25)
        a = z + 1 + alfa - math.floor(alfa / 4)
        cal = "gregoriano"
    b = a + 1524
    c = math.floor((b - 122.1) / 365.25)
    d = math.floor(365.25 * c)
    e = math.floor((b - d) / 30.6001)
    giorno = b - d - math.floor(30.6001 * e)
    mese = e - 1 if e < 14 else e - 13
    anno = c - 4716 if mese > 2 else c - 4715
    ora = ms // 3_600_000
    resto = ms - ora * 3_600_000
    minuto = resto // 60_000
    secondo = (resto - minuto * 60_000) / 1000.0
    return DataCalendario(int(anno), int(mese), int(giorno), int(ora), int(minuto), secondo, cal)
