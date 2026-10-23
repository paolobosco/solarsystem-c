"""Anagrafica dei piccoli corpi (§ 4.4) e classificazione per sorgente (§ 7.6.1).

Fonte unica: scripts/pipeline/bodies.json. Plutone (ssid 10) è tra i pianeti (§ 7.3) ed è escluso.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

CARTELLA_PIPELINE = Path(__file__).resolve().parent.parent
FILE_CORPI = CARTELLA_PIPELINE / "bodies.json"
RAW = CARTELLA_PIPELINE / "raw" / "small"
CACHE = CARTELLA_PIPELINE / ".cache" / "small"
CACHE_ASSIST = CARTELLA_PIPELINE / ".cache" / "assist"
RADICE_REPO = CARTELLA_PIPELINE.parent.parent
CARTELLA_DATI = RADICE_REPO / "public" / "data" / "v1" / "small"
CARTELLA_OUT = CARTELLA_PIPELINE / "out"
# riepiloghi versionati (RNF5): livello e dimensioni dei blocchi, risultati della validazione A7/A9
FILE_BLOCCHI = CARTELLA_OUT / "blocchi-piccoli-corpi.json"
FILE_VALIDAZIONE = CARTELLA_OUT / "validazione-piccoli-corpi.json"
CARTELLA_FIXTURE = RADICE_REPO / "tests" / "fixtures" / "small"

FILE_PIANETI_ASSIST = CACHE_ASSIST / "linux_m13000p17000.441"
FILE_SB441 = CACHE_ASSIST / "sb441-n16.bsp"

CATEGORIE_PICCOLI = {"pianeta-nano", "tno", "centauro", "asteroide", "cometa", "interstellare"}

# Asteroidi del catalogo presenti in sb441-n16 (§ 7.6.1), codice NAIF 2 000 000 + numero.
SB441: dict[str, int] = {
    "cerere": 2000001,
    "pallade": 2000002,
    "giunone": 2000003,
    "vesta": 2000004,
    "igea": 2000010,
    "psyche": 2000016,
    "euphrosyne": 2000031,
    "52-europa": 2000052,
    "sylvia": 2000087,
    "davida": 2000511,
    "interamnia": 2000704,
}

_RE_PERIODICA = re.compile(r"^\d+P$")


@dataclass(frozen=True)
class Corpo:
    ssid: int
    slug: str
    nome: str
    nome_ufficiale: str | None
    numero: int | None
    designazione: str | None
    categoria: str
    categorie_secondarie: tuple[str, ...]
    sbdb: str
    alias: tuple[str, ...]
    naif: int | None = None

    @property
    def in_sb441(self) -> bool:
        return self.slug in SB441

    @property
    def naif_sb441(self) -> int | None:
        return SB441.get(self.slug)

    @property
    def cometa_periodica(self) -> bool:
        """Cometa periodica numerata: candidata ai record per apparizione (§ 7.6.1)."""
        return bool(_RE_PERIODICA.match(self.sbdb))

    @property
    def cometa(self) -> bool:
        return self.categoria == "cometa" or "cometa" in self.categorie_secondarie


def leggi_corpi(percorso: Path = FILE_CORPI) -> list[dict]:
    return json.loads(percorso.read_text(encoding="utf-8"))["corpi"]


def piccoli_corpi(percorso: Path = FILE_CORPI) -> list[Corpo]:
    """Piccoli corpi in ordine di ssid (Plutone escluso)."""
    out = []
    for c in leggi_corpi(percorso):
        if c["categoria"] not in CATEGORIE_PICCOLI or c["slug"] == "plutone":
            continue
        out.append(
            Corpo(
                ssid=int(c["ssid"]),
                slug=c["slug"],
                nome=c["nome"],
                nome_ufficiale=c["nomeUfficiale"],
                numero=c["numero"],
                designazione=c["designazione"],
                categoria=c["categoria"],
                categorie_secondarie=tuple(c["categorieSecondarie"]),
                sbdb=str(c["sbdb"]),
                alias=tuple(c["alias"]),
                naif=c["naif"],
            )
        )
    return sorted(out, key=lambda x: x.ssid)


def per_slug(percorso: Path = FILE_CORPI) -> dict[str, Corpo]:
    return {c.slug: c for c in piccoli_corpi(percorso)}
