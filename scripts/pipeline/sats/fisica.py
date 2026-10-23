"""Dati fisici dei satelliti (§ 9): GM e raggio medio da JPL "Planetary Satellite Physical Parameters"
(https://ssd.jpl.nasa.gov/sats/phys_par/, pagina congelata in raw/sats/jpl-sats-phys_par.html).

Disnomia è assente dalla pagina: raggio da Brown e Butler (2023), PSJ 4:193, doi:10.3847/PSJ/ace52a, § 2.3
(diametro 615 +60/-50 km da una rilevazione ALMA a 6,5σ, che supera i 700 ± 115 km a 3,5σ degli stessi autori del 2018);
GM non noto.
"""

from __future__ import annotations

import html
import math
import re
from dataclasses import dataclass
from functools import cache

from .kernel import RAW

PAGINA = RAW / "jpl-sats-phys_par.html"
URL_PAGINA = "https://ssd.jpl.nasa.gov/sats/phys_par/"
ANNO_PAGINA = 2026


@dataclass(frozen=True)
class DatiFisici:
    naif: int
    gm: float | None
    gm_sigma: float | None
    gm_fonte: str
    gm_soluzione: str
    gm_decimali: int | None  # decimali del GM pubblicato nella pagina
    raggio: float
    raggio_sigma: float | None
    raggio_fonte: str


def _celle(riga: str) -> list[str]:
    celle = re.findall(r"<td[^>]*>(.*?)(?=<td|$)", riga, re.S)
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip() for c in celle]


def _riferimenti_raggi(testo: str) -> list[str]:
    i = testo.find('id="refs"')
    blocco = testo[i : i + 20000]
    voci = re.findall(r"<li[^>]*>(.*?)</li>", blocco, re.S)
    testi = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", v))).strip() for v in voci]
    # spazi TeX e spazi prima della punteggiatura della pagina
    return [re.sub(r"\s+([:,.])", r"\1", t.replace("~", " ")) for t in testi]


def _numero(x: str) -> float | None:
    try:
        return float(x)
    except ValueError:
        return None


def _decimali(x: str) -> int | None:
    m = re.fullmatch(r"\d+(?:\.(\d+))?", x.strip())
    return len(m.group(1) or "") if m else None


@cache
def tabella() -> dict[int, DatiFisici]:
    testo = PAGINA.read_text(encoding="utf-8", errors="replace")
    corpo = testo[testo.find("<tbody>") : testo.find("</tbody>")]
    rif = _riferimenti_raggi(testo)
    out: dict[int, DatiFisici] = {}
    for riga in re.findall(r"<tr>(.*?)</tr>", corpo, re.S):
        c = _celle(riga)
        if len(c) < 9 or not c[2].isdigit():
            continue
        naif = int(c[2])
        gm = _numero(c[3])
        gm_sigma = _numero(c[4])
        if gm == 0.0 and gm_sigma == 0.0:
            gm = gm_sigma = None  # massa non determinata (ad esempio Nereide)
        try:
            fonte_r = rif[int(c[8]) - 1]
        except (ValueError, IndexError):
            fonte_r = c[8]
        out[naif] = DatiFisici(
            naif,
            gm,
            gm_sigma,
            f'JPL "Planetary Satellite Physical Parameters" ({URL_PAGINA}), GM dalla soluzione {c[5]}',
            c[5],
            _decimali(c[3]),
            float(c[6]),
            _numero(c[7]),
            f'JPL "Planetary Satellite Physical Parameters" ({URL_PAGINA}); raggio medio: {fonte_r}',
        )
    return out


def dati(naif: int) -> DatiFisici:
    return tabella()[naif]


def sigma_gm(d: DatiFisici, gm: float, soluzione: str) -> float | None:
    """Incertezza della pagina JPL per la costante GM del kernel (soluzione `soluzione`).

    Vale se la pagina cita la stessa soluzione, oppure se il valore del kernel coincide con quello pubblicato
    alle cifre pubblicate, arrotondato o troncato (costante invariata tra le soluzioni: MAR097 e MAR099, JUP344 e
    JUP347, NEP097 e NEP098). Altrimenti None: per i satelliti di Urano la pagina (URA111) differisce da URA182
    fino al 4,5 %.
    """
    if d.gm is None or d.gm_sigma is None:
        return None
    if d.gm_soluzione == soluzione:
        return d.gm_sigma
    if d.gm_decimali is not None:
        scala = 10.0**d.gm_decimali
        pagina = round(d.gm * scala)
        if pagina in (round(gm * scala), math.floor(gm * scala)):
            return d.gm_sigma
    return None


# Periodi di rotazione pubblicati dei satelliti non sincroni senza modello WGCCRE (§ 9), in ore: periodo,
# incertezza, fonte, anno. La rotazione non è rappresentata (assi fissi, § 7.5.5).
PERIODI_LETTERATURA: dict[int, tuple[float, float, str, int]] = {
    506: (
        7.7819,
        0.0005,
        "Pilcher, Mottola, Denk (2012), Photometric lightcurve and rotation period of Himalia (Jupiter VI), "
        "Icarus 219, 741, doi:10.1016/j.icarus.2012.03.021 (periodo sinodico)",
        2012,
    ),
    802: (
        11.594,
        0.017,
        "Kiss et al. (2016), Nereid from space, MNRAS 457, 2908, doi:10.1093/mnras/stw081 (curva di luce di K2)",
        2016,
    ),
    902: (
        round(1.829 * 24.0, 6),
        round(0.009 * 24.0, 6),
        "Weaver et al. (2016), The small satellites of Pluto as observed by New Horizons, Science 351, aae0030, "
        "doi:10.1126/science.aae0030 (1,829 ± 0,009 d)",
        2016,
    ),
    903: (
        round(0.4295 * 24.0, 6),
        round(0.0008 * 24.0, 6),
        "Weaver et al. (2016), The small satellites of Pluto as observed by New Horizons, Science 351, aae0030, "
        "doi:10.1126/science.aae0030 (0,4295 ± 0,0008 d)",
        2016,
    ),
}


# Disnomia (§ 9): Brown e Butler (2023), diametro 615 +60/-50 km, quindi raggio 307,5 km; con incertezze asimmetriche
# si riporta la maggiore (+30 km, come per gli altri valori del catalogo).
RAGGIO_DISNOMIA = 307.5
RAGGIO_DISNOMIA_SIGMA = 30.0
ANNO_RAGGIO_DISNOMIA = 2023
FONTE_RAGGIO_DISNOMIA = (
    "Brown, M. E., Butler, B. J. (2023), Masses and densities of dwarf planet satellites measured with ALMA, "
    "The Planetary Science Journal 4:193, doi:10.3847/PSJ/ace52a (diametro 615 +60/-50 km)"
)


@cache
def _pck() -> dict[str, list[float]]:
    import physical as ph

    return ph.leggi_pck((ph.RAW / "pck00011.tpc").read_text(encoding="latin-1"))


def periodo_wgccre(naif: int) -> float | None:
    """Periodo siderale (ore) 360°/Ẇ del modello WGCCRE di pck00011.tpc (Archinal et al. 2018), se presente."""
    pm = _pck().get(f"BODY{naif}_PM")
    return 360.0 / pm[1] * 24.0 if pm and len(pm) > 1 and pm[1] != 0.0 else None


def fonte_periodo_wgccre() -> str:
    import physical as ph

    return f"{ph.FONTE_WGCCRE}, da Ẇ"
