"""Costanti condivise da pipeline e runtime (§ 6.2, § 7.1, § 8.1).

Gli stessi valori sono esportati in `common/constants.json` per il confronto con TypeScript.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from .calendario import calendario_a_jd

# --- Unità e costanti fondamentali ---

# 1 UA in km: IAU 2012, Risoluzione B2; coincide con la costante AU di DE441.
UA_KM = 149597870.7
# Secondi per giorno (giorno di 86 400 s SI, scala TDB).
GIORNO_S = 86400.0
# Epoca J2000.0 (JD TDB).
J2000 = 2451545.0
# Velocità della luce in km/s: definizione SI (17a CGPM, 1983); coincide con CLIGHT di DE441.
C_KM_S = 299792.458

# Obliquità per la rotazione ICRF -> eclittica J2000 (I4): 84 381,448″, valore IAU 1976
# (Lieske et al. 1977, A&A 58, 1) adottato da JPL Horizons per l'eclittica J2000.
OBLIQUITA_J2000_ARCSEC = 84381.448
OBLIQUITA_J2000_RAD = OBLIQUITA_J2000_ARCSEC * math.pi / 648000.0

# --- Costanti di DE441 ---
# Fonte: area commenti di de441_part-1.bsp e de441_part-2.bsp (identiche), sezione
# "Initial conditions and constants used for integration"; Park, Folkner, Williams, Boggs (2021),
# The JPL Planetary and Lunar Ephemerides DE440 and DE441, AJ 161:105, doi:10.3847/1538-3881/abd414.
# Valori in UA^3/d^2 come nel file; GM1..GM9 sono i sistemi (baricentri) planetari, GMB è il
# sistema Terra-Luna, GMS il Sole.
DE441_GM_UA3_D2: dict[str, float] = {
    "GM1": 4.9125001948893182e-11,
    "GM2": 7.2434523326441187e-10,
    "GMB": 8.9970113929473466e-10,
    "GM4": 9.5495488297258119e-11,
    "GM5": 2.8253458252257917e-07,
    "GM6": 8.4597059933762903e-08,
    "GM7": 1.2920265649682399e-08,
    "GM8": 1.5243573478851939e-08,
    "GM9": 2.1750964648933581e-12,
    "GMS": 2.9591220828411956e-04,
}
# Rapporto delle masse Terra/Luna (costante EMRAT di DE441).
EMRAT = 81.300568221497215
# Costanti AU (km) e CLIGHT (km/s) di DE441, per il confronto con le costanti sopra.
DE441_AU_KM = 149597870.7
DE441_CLIGHT_KM_S = 299792.458

# Conversione UA^3/d^2 -> km^3/s^2.
_CONV_GM = UA_KM**3 / GIORNO_S**2


def _gm_km3_s2(nome: str) -> float:
    return DE441_GM_UA3_D2[nome] * _CONV_GM


GM_SOLE = _gm_km3_s2("GMS")
# Sistemi planetari (baricentri NAIF 1..9); il 3 è il baricentro Terra-Luna.
GM_BARICENTRI: dict[int, float] = {
    1: _gm_km3_s2("GM1"),
    2: _gm_km3_s2("GM2"),
    3: _gm_km3_s2("GMB"),
    4: _gm_km3_s2("GM4"),
    5: _gm_km3_s2("GM5"),
    6: _gm_km3_s2("GM6"),
    7: _gm_km3_s2("GM7"),
    8: _gm_km3_s2("GM8"),
    9: _gm_km3_s2("GM9"),
}
# Terra e Luna da GMB ed EMRAT: GM_Terra = GMB·EMRAT/(1 + EMRAT), GM_Luna = GMB/(1 + EMRAT).
GM_TERRA = GM_BARICENTRI[3] * EMRAT / (1.0 + EMRAT)
GM_LUNA = GM_BARICENTRI[3] / (1.0 + EMRAT)

# GM per codice NAIF (km^3/s^2).
GM_KM3_S2: dict[int, float] = {10: GM_SOLE, **GM_BARICENTRI, 399: GM_TERRA, 301: GM_LUNA}

# μ degli elementi eliocentrici dei pianeti (§ 7.1): GM_Sole + GM del sistema.
MU_ELIO: dict[int, float] = {i: GM_SOLE + GM_BARICENTRI[i] for i in range(1, 10)}
# μ dei piccoli corpi (§ 7.1).
MU_PICCOLI_CORPI = GM_SOLE

# --- Blocchi temporali (§ 8.1), JD TDB ---
T0 = -1931200.5
B = 365568.0
K = 13
T_END = 2495760.5

# Scelta del file DE441 per campione (§ 7.3.1): JD < JD_CAMBIO_DE441 -> part-1, altrimenti part-2.
JD_CAMBIO_DE441 = 2440416.5

# --- Limiti dell'intervallo in UT (I2), dalla funzione di calendario ---
JD_MIN_UT = calendario_a_jd(-9999, 1, 1, 0, 0, 0, "giuliano")
JD_MAX_UT_EXCL = calendario_a_jd(2121, 1, 1, 0, 0, 0, "gregoriano")


def inizio_blocco(k: int) -> float:
    """Inizio del nucleo del blocco k (TDB)."""
    if not 0 <= k < K:
        raise ValueError(f"blocco fuori intervallo: {k}")
    return T0 + k * B


def fine_blocco(k: int) -> float:
    """Fine esclusa del nucleo del blocco k (TDB); il blocco 12 termina a T_END."""
    if not 0 <= k < K:
        raise ValueError(f"blocco fuori intervallo: {k}")
    return min(T0 + (k + 1) * B, T_END)


def blocco_di(t: float) -> int:
    """Indice del blocco il cui nucleo contiene t; ValueError fuori da [T0, T_END)."""
    if not T0 <= t < T_END:
        raise ValueError(f"istante fuori copertura: {t}")
    k = min(int(math.floor((t - T0) / B)), K - 1)
    # correzione dell'arrotondamento di (t - T0) vicino ai confini: confronti esatti con i limiti
    if t < T0 + k * B:
        k -= 1
    elif k < K - 1 and t >= T0 + (k + 1) * B:
        k += 1
    return k


def come_dizionario() -> dict:
    """Valori esportati in constants.json (chiavi uguali ai nomi TypeScript)."""
    return {
        "formato": 1,
        "UA_KM": UA_KM,
        "GIORNO_S": GIORNO_S,
        "J2000": J2000,
        "C_KM_S": C_KM_S,
        "OBLIQUITA_J2000_ARCSEC": OBLIQUITA_J2000_ARCSEC,
        "OBLIQUITA_J2000_RAD": OBLIQUITA_J2000_RAD,
        "EMRAT": EMRAT,
        "GM_KM3_S2": {str(k): v for k, v in GM_KM3_S2.items()},
        "MU_ELIO_KM3_S2": {str(k): v for k, v in MU_ELIO.items()},
        "MU_PICCOLI_CORPI_KM3_S2": MU_PICCOLI_CORPI,
        "T0": T0,
        "B": B,
        "K": K,
        "T_END": T_END,
        "JD_CAMBIO_DE441": JD_CAMBIO_DE441,
        "JD_MIN_UT": JD_MIN_UT,
        "JD_MAX_UT_EXCL": JD_MAX_UT_EXCL,
        "fonti": {
            "UA_KM": "IAU 2012, Risoluzione B2",
            "C_KM_S": "definizione SI (17a CGPM, 1983)",
            "OBLIQUITA_J2000_ARCSEC": "IAU 1976 (Lieske et al. 1977, A&A 58, 1), come in JPL Horizons",
            "GM_KM3_S2": (
                "DE441, costanti dell'area commenti degli SPK (Park et al. 2021, AJ 161:105), "
                "convertite da UA^3/d^2 con UA_KM e GIORNO_S; chiavi NAIF: 10 Sole, 1-9 sistemi "
                "planetari, 399 Terra, 301 Luna"
            ),
            "EMRAT": "DE441, costante EMRAT",
            "MU_ELIO_KM3_S2": "GM Sole + GM del sistema planetario (§ 7.1)",
            "blocchi": "§ 8.1",
            "JD_MIN_UT": "calendario giuliano -9999-01-01 00:00 UT (Meeus, cap. 7)",
            "JD_MAX_UT_EXCL": "calendario gregoriano 2121-01-01 00:00 UT (Meeus, cap. 7)",
        },
    }


PERCORSO_JSON = Path(__file__).with_name("constants.json")


def scrivi_json(percorso: Path = PERCORSO_JSON) -> None:
    """Scrive constants.json (float in rappresentazione esatta di andata e ritorno)."""
    testo = json.dumps(come_dizionario(), ensure_ascii=False, indent=2) + "\n"
    Path(percorso).write_text(testo, encoding="utf-8")


if __name__ == "__main__":
    scrivi_json()
