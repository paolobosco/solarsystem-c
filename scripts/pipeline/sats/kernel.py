"""Kernel SPK satellitari NAIF (§ 7.5.1): elenco, scaricamento, verifica, stati planetocentrici.

Fonte: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/ (sommario `aa_summaries.txt`,
congelato in raw/sats/). I kernel si scaricano uno alla volta in .cache/sats/ e si eliminano dopo l'uso;
URL, dimensione e SHA-256 sono registrati in raw/manifest-sorgenti.json.
"""

from __future__ import annotations

import datetime as _dt
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from jplephem.spk import SPK
from numpy.typing import ArrayLike, NDArray

from common.constants import GIORNO_S
from common.manifest import (
    CARTELLA_CACHE,
    CARTELLA_PIPELINE,
    aggiorna_manifest_sorgenti,
    cerca_sorgente,
    sha256_file,
    voce_sorgente,
)

URL_BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/"
CACHE = CARTELLA_CACHE / "sats"
RAW = CARTELLA_PIPELINE / "raw" / "sats"
# Spazio libero minimo da lasciare sul disco dopo ogni scaricamento (byte).
MARGINE_DISCO = 4 * 1024**3


@dataclass(frozen=True)
class Kernel:
    """Kernel SPK: satelliti serviti (NAIF), centro del pianeta (NAIF) e sistema (baricentro NAIF)."""

    nome: str
    tipo: str  # 'moderno' | 'lungo'
    soluzione: str
    sistema: int
    satelliti: tuple[int, ...]
    centro: int | None  # segmento del centro del pianeta nel file, se presente
    byte_attesi: int  # dimensione indicata dall'elenco NAIF (arrotondata), per il controllo dello spazio

    @property
    def percorso(self) -> Path:
        return CACHE / self.nome

    @property
    def url(self) -> str:
        return URL_BASE + self.nome


_G = 1024**3
_M = 1024**2

# Tabella del § 7.5.1, verificata su aa_summaries.txt e sulle aree commenti (raw/sats/commenti/).
KERNEL: dict[str, Kernel] = {
    k.nome: k
    for k in (
        Kernel("mar099.bsp", "moderno", "MAR099", 4, (401, 402), 499, int(1.1 * _G)),
        Kernel("jup365.bsp", "moderno", "JUP365", 5, (501, 502, 503, 504, 505), 599, int(1.1 * _G)),
        Kernel("jup347.bsp", "moderno", "JUP347", 5, (506,), None, 879 * _M),
        Kernel("sat441.bsp", "moderno", "SAT441", 6, tuple(range(601, 610)), 699, 631 * _M),
        Kernel("ura184_part-3.bsp", "moderno", "URA184", 7, (701, 702, 703, 704, 705), 799, 369 * _M),
        # Tritone: NEP098 (2026), la soluzione più recente che lo copre (1800-2199, usata da Horizons);
        # NEP097 resta come kernel precedente per 1600-1800 (docs/_parti/satelliti.md, § 2)
        Kernel("nep098_part-1.bsp", "moderno", "NEP098", 8, (801,), 899, 784 * _M),
        Kernel("nep097.bsp", "lungo", "NEP097", 8, (801,), 899, 100 * _M),
        Kernel("nep098_part-3.bsp", "moderno", "NEP098", 8, (808,), 899, int(1.7 * _G)),
        Kernel("nep105.bsp", "moderno", "NEP105", 8, (802,), 899, 201 * _M),
        Kernel("plu060.bsp", "moderno", "PLU060", 9, (901, 902, 903), 999, 129 * _M),
        Kernel("sat441xl_part-1.bsp", "lungo", "SAT441", 6, tuple(range(601, 610)), 699, int(1.9 * _G)),
        Kernel("sat441xl_part-2.bsp", "lungo", "SAT441", 6, tuple(range(601, 610)), 699, int(1.9 * _G)),
        Kernel("ura111xl-701.bsp", "lungo", "URA111", 7, (701,), None, int(2.0 * _G)),
        Kernel("ura111xl-702.bsp", "lungo", "URA111", 7, (702,), None, 828 * _M),
        Kernel("ura111xl-703.bsp", "lungo", "URA111", 7, (703,), None, 414 * _M),
        Kernel("ura111xl-704.bsp", "lungo", "URA111", 7, (704,), None, 414 * _M),
        Kernel("ura111xl-705.bsp", "lungo", "URA111", 7, (705,), None, int(2.0 * _G)),
        Kernel("ura111xl-799.bsp", "lungo", "URA111", 7, (), 799, int(1.0 * _G)),
        Kernel("nep097xl-801.bsp", "lungo", "NEP097", 8, (801,), None, int(2.0 * _G)),
        Kernel("nep097xl-899.bsp", "lungo", "NEP097", 8, (), 899, 354 * _M),
        Kernel("nep101xl-802.bsp", "lungo", "NEP101", 8, (802,), None, 731 * _M),
    )
}

# Kernel che fornisce il centro del pianeta quando il file del satellite non lo contiene.
CENTRO_ESTERNO: dict[str, str] = {
    "jup347.bsp": "jup365.bsp",
    "ura111xl-701.bsp": "ura111xl-799.bsp",
    "ura111xl-702.bsp": "ura111xl-799.bsp",
    "ura111xl-703.bsp": "ura111xl-799.bsp",
    "ura111xl-704.bsp": "ura111xl-799.bsp",
    "ura111xl-705.bsp": "ura111xl-799.bsp",
    "nep097xl-801.bsp": "nep097xl-899.bsp",
    "nep101xl-802.bsp": "nep097xl-899.bsp",
}

# Centro del pianeta per sistema (NAIF).
CENTRO_PIANETA = {4: 499, 5: 599, 6: 699, 7: 799, 8: 899, 9: 999}


def spazio_libero(percorso: Path = CARTELLA_CACHE) -> int:
    return shutil.disk_usage(percorso).free


def _nome_manifest(k: Kernel) -> str:
    return f"sats/{k.nome}"


def scarica(k: Kernel, tentativi: int = 5) -> Path:
    """Scarica il kernel in .cache/sats/ (se assente o diverso dal manifest) e registra SHA-256 e URL.

    Prima del trasferimento verifica che resti almeno MARGINE_DISCO di spazio libero.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    p = k.percorso
    if p.exists():
        try:
            v = cerca_sorgente(_nome_manifest(k))
            if v.get("byte") == p.stat().st_size and v.get("sha256") == sha256_file(p):
                return p
        except KeyError:
            pass
    libero = spazio_libero(CACHE)
    if libero - k.byte_attesi < MARGINE_DISCO:
        raise OSError(f"spazio insufficiente per {k.nome}: liberi {libero / _G:.1f} GB")
    parziale = p.with_suffix(p.suffix + ".parziale")
    errore = ""
    for n in range(tentativi):
        # curl riprende il trasferimento interrotto (-C -); pausa crescente tra i tentativi
        r = subprocess.run(
            ["curl", "-sS", "-f", "-L", "-C", "-", "-o", str(parziale), k.url], capture_output=True, text=True
        )
        if r.returncode == 0:
            break
        errore = r.stderr
        time.sleep(2.0 * 2**n)
    else:
        raise OSError(f"scaricamento non riuscito: {k.url}: {errore}")
    parziale.replace(p)
    voce = voce_sorgente(
        _nome_manifest(k),
        k.url,
        f"sats/{k.nome}",
        _dt.date.today().isoformat(),
        f"SPK satellitare NAIF ({k.tipo}), soluzione {k.soluzione}",
    )
    # il manifest è condiviso con altri processi: si rilegge subito prima di scrivere
    aggiorna_manifest_sorgenti(voce)
    time.sleep(1.0)
    return p


def elimina(k: Kernel) -> None:
    """Elimina il file dalla cache (la voce del manifest resta per la verifica futura)."""
    if k.percorso.exists():
        k.percorso.unlink()


class LettoreSpk:
    """Stati planetocentrici da uno o più kernel dello stesso sistema (jplephem)."""

    def __init__(self, *kernel: Kernel) -> None:
        self.kernel = kernel
        self._spk = [SPK.open(str(k.percorso)) for k in kernel]

    def chiudi(self) -> None:
        for s in self._spk:
            s.close()
        self._spk = []

    def __enter__(self) -> LettoreSpk:
        return self

    def __exit__(self, *_: object) -> None:
        self.chiudi()

    def _segmenti(self, centro: int, bersaglio: int) -> list:
        out = []
        for s in self._spk:
            for seg in s.segments:
                if seg.center == centro and seg.target == bersaglio:
                    out.append(seg)
        if not out:
            raise KeyError(f"segmento {bersaglio} rispetto a {centro} assente")
        return out

    def copertura(self, centro: int, bersaglio: int) -> tuple[float, float]:
        """Intervallo [inizio, fine] (JD TDB) coperto dai segmenti, supposti contigui."""
        segs = self._segmenti(centro, bersaglio)
        return min(s.start_jd for s in segs), max(s.end_jd for s in segs)

    def stato_icrf(self, centro: int, bersaglio: int, t: ArrayLike) -> NDArray[np.float64]:
        """Stato (n, 6) ICRF del bersaglio rispetto al centro: km e km/s."""
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        out = np.full((tt.size, 6), np.nan)
        intero = np.floor(tt)
        frazione = tt - intero
        for seg in self._segmenti(centro, bersaglio):
            m = (tt >= seg.start_jd) & (tt <= seg.end_jd) & np.isnan(out[:, 0])
            if not np.any(m):
                continue
            pos, vel = seg.compute_and_differentiate(intero[m], frazione[m])
            out[m, :3] = np.asarray(pos).reshape(3, -1).T
            out[m, 3:] = np.asarray(vel).reshape(3, -1).T / GIORNO_S
        if np.any(np.isnan(out[:, 0])):
            raise ValueError("istanti fuori dalla copertura del segmento")
        return out
