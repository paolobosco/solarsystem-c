"""Satelliti del catalogo (§ 4.4) e loro sorgenti (§ 7.5.1)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache

from common.manifest import CARTELLA_PIPELINE

FILE_CORPI = CARTELLA_PIPELINE / "bodies.json"

# Sistema (baricentro NAIF) per slug del pianeta primario.
SISTEMA_PER_PRIMARIO = {"marte": 4, "giove": 5, "saturno": 6, "urano": 7, "nettuno": 8, "plutone": 9}

# Sorgenti per satellite (§ 7.5.1): kernel moderno e kernel lunghi (eventuali).
KERNEL_MODERNO = {
    401: "mar099.bsp",
    402: "mar099.bsp",
    501: "jup365.bsp",
    502: "jup365.bsp",
    503: "jup365.bsp",
    504: "jup365.bsp",
    505: "jup365.bsp",
    506: "jup347.bsp",
    **dict.fromkeys(range(601, 610), "sat441.bsp"),
    **dict.fromkeys(range(701, 706), "ura184_part-3.bsp"),
    801: "nep098_part-1.bsp",
    802: "nep105.bsp",
    808: "nep098_part-3.bsp",
    901: "plu060.bsp",
    902: "plu060.bsp",
    903: "plu060.bsp",
}
KERNEL_LUNGHI: dict[int, tuple[str, ...]] = {
    **dict.fromkeys(range(601, 610), ("sat441xl_part-1.bsp", "sat441xl_part-2.bsp")),
    **{n: (f"ura111xl-{n}.bsp",) for n in range(701, 706)},
    801: ("nep097.bsp",),
    802: ("nep101xl-802.bsp",),
}

# Kernel lunghi non adottati, confrontati con il modello nella validazione (S3: equivalenti all'estrapolazione
# secolare, docs/_parti/satelliti.md).
KERNEL_CONFRONTO: dict[int, tuple[str, ...]] = {801: ("nep097xl-801.bsp",)}

# Classe per le tolleranze di adattamento (§ 7.5.6).
TOLLERANZA_GRADI = {"regolare": 0.5, "iperione": 3.0, "irregolare": 1.0}
CLASSE = {607: "iperione", 506: "irregolare", 609: "irregolare", 802: "irregolare"}

# Satelliti circumbinari: modello rispetto al baricentro del sistema invece che al centro del pianeta
# (il centro di Plutone ruota attorno al baricentro con raggio di circa 2 130 km e periodo di Caronte).
CENTRO_BARICENTRO = {902, 903}

# Piano secolare (§ 7.5.4): satelliti il cui piano di Laplace segue l'equatore del primario (Tremaine, Touma e Namouni
# 2009, AJ 137, 3706): nei record secolari il sistema F ruota con il polo WGCCRE del primario. Esclusi: Imalia, Febe e
# Nereide (piano di Laplace vicino all'orbita del pianeta), Giapeto (piano di Laplace a 15° dall'equatore di Saturno,
# intermedio tra equatore e orbita), Tritone e Proteo (il polo di Nettuno ha solo il termine periodico dovuto a Tritone,
# precessione attorno al piano invariabile del sistema: Jacobson 2009, AJ 137, 4322), Disnomia (Eris senza polo).
SEGUE_EQUATORE = {401, 402, 501, 502, 503, 504, 505, 601, 602, 603, 604, 605, 606, 607, 701, 702, 703, 704, 705}
SEGUE_EQUATORE |= {901, 902, 903}

# Rotazione (§ 7.5.5): sincrona; Iperione caotica (orientamento fisso indicativo); altri senza rotazione.
SINCRONI = {401, 402, 501, 502, 503, 504, 505, 601, 602, 603, 604, 605, 606, 608, 701, 702, 703, 704, 705}
SINCRONI |= {801, 808, 901}


@dataclass(frozen=True)
class Satellite:
    ssid: int
    slug: str
    nome: str
    naif: int | None
    primario: str
    sistema: int | None

    @property
    def classe(self) -> str:
        return CLASSE.get(self.naif or 0, "regolare")

    @property
    def tolleranza_rad(self) -> float:
        import math

        return math.radians(TOLLERANZA_GRADI[self.classe])

    @property
    def baricentrico(self) -> bool:
        return (self.naif or 0) in CENTRO_BARICENTRO

    @property
    def segue_equatore(self) -> bool:
        return (self.naif or 0) in SEGUE_EQUATORE

    @property
    def kernel_moderno(self) -> str | None:
        return KERNEL_MODERNO.get(self.naif or 0)

    @property
    def kernel_lunghi(self) -> tuple[str, ...]:
        return KERNEL_LUNGHI.get(self.naif or 0, ())

    @property
    def kernel_confronto(self) -> tuple[str, ...]:
        return KERNEL_CONFRONTO.get(self.naif or 0, ())


@cache
def corpi() -> dict:
    return json.loads(FILE_CORPI.read_text(encoding="utf-8"))


@cache
def satelliti() -> tuple[Satellite, ...]:
    """I 29 satelliti del catalogo (Luna esclusa), in ordine di ssid."""
    out = []
    for c in corpi()["corpi"]:
        if c["categoria"] != "luna" or c["slug"] == "luna":
            continue
        out.append(
            Satellite(
                c["ssid"], c["slug"], c["nome"], c["naif"], c["primario"], SISTEMA_PER_PRIMARIO.get(c["primario"])
            )
        )
    return tuple(sorted(out, key=lambda s: s.ssid))


def per_naif(naif: int) -> Satellite:
    for s in satelliti():
        if s.naif == naif:
            return s
    raise KeyError(naif)


def ssid_corpo(slug: str) -> int:
    for c in corpi()["corpi"]:
        if c["slug"] == slug:
            return int(c["ssid"])
    raise KeyError(slug)


# Anno di scoperta (JPL "Planetary Satellite Discovery Circumstances",
# https://ssd.jpl.nasa.gov/sats/discovery.html, pagina congelata in raw/sats/jpl-sats-discovery.html).
ANNO_SCOPERTA = {
    401: 1877,
    402: 1877,
    501: 1610,
    502: 1610,
    503: 1610,
    504: 1610,
    505: 1892,
    506: 1904,
    601: 1789,
    602: 1789,
    603: 1684,
    604: 1684,
    605: 1672,
    606: 1655,
    607: 1848,
    608: 1671,
    609: 1898,
    701: 1851,
    702: 1851,
    703: 1787,
    704: 1787,
    705: 1948,
    801: 1846,
    802: 1949,
    808: 1989,
    901: 1978,
    902: 2005,
    903: 2005,
}
# Arco osservativo (anni): 1900-2020 se non noto (§ 7.5.6); inizio non anteriore all'anno di scoperta.
ARCO_PREDEFINITO = (1900.0, 2020.0)
# Archi noti. Fobos e Deimos: astrometria della soluzione MAR099 dal 1877 al 2019 (Brozović, Jacobson e Park 2025,
# AJ 170:42, § 3 e § 6).
ARCO_NOTO = {401: (1877.0, 2019.0), 402: (1877.0, 2019.0)}

# σ_ṅ misurata (°/anno²) dove l'accelerazione mareale è vincolata dalle osservazioni e modellata nel kernel;
# altrove I12. Fobos: λ = λ0 + n·t + ½·ṅ·t² con ½·ṅ = (1,258 ± 0,058)·10⁻³ °/anno² in MAR099 (Brozović, Jacobson e
# Park 2025, sommario e § 4.5), quindi σ_ṅ = 2·0,058·10⁻³. Deimos: accelerazione non rilevabile dai dati (stessa
# fonte, § 1), I12.
SIGMA_NDOT_GRADI = {401: 2 * 0.058e-3}


def arco_predefinito(naif: int) -> tuple[float, float]:
    """Arco del § 7.5.6 se non noto: 1900-2020, inizio non anteriore all'anno di scoperta."""
    return (max(ARCO_PREDEFINITO[0], float(ANNO_SCOPERTA[naif])), ARCO_PREDEFINITO[1])


def arco(naif: int | None) -> tuple[float, float]:
    """Arco osservativo (anni) di ε_estrapolazione e del catalogo: noto se documentato, altrimenti predefinito."""
    if naif is None:
        raise KeyError("arco senza codice NAIF")
    return ARCO_NOTO.get(naif) or arco_predefinito(naif)
