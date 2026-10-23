"""Satelliti naturali tranne la Luna (§ 7.5, § 8.5, § 12.3 passo 4, A6 di docs/PROGETTO.md).

Comandi (da scripts/pipeline/), nell'ordine di esecuzione:
  campiona [kernel ...]    scarica i kernel uno alla volta, campiona, elimina i kernel lunghi
  sistemi                  sistema F, μ, periodo per satellite
  scelte [slug ...]        frequenze dei termini periodici e durata dei record (prova sul kernel moderno)
  lunghi                   estrapolazione secolare dal kernel moderno contro i kernel lunghi (S3)
  spike                    riepilogo S3 in out/spike-sats.json
  record [slug ...]        secolare e record del kernel moderno
  record-lunghi [slug ...] record dei kernel lunghi adottati (scaricati e poi eliminati)
  ricalcola-lunghi [slug]  residui ed epoche di validazione delle zone lunghe (kernel scaricati di nuovo)
  secolare [slug ...]      ricalcolo del record secolare e di σ_n (record da SPK invariati)
  residui [slug ...]       errori di adattamento per record (kernel moderni in cache)
  genera                   file public/data/v1/sats/sKK.bin
  valida                   criterio A6 (kernel, Horizons, centri dei pianeti)
  catalogo                 frammenti out/catalog-sats.json e out/reliability-sats.json
  fixture                  tests/fixtures/sats/
"""

from __future__ import annotations

import argparse
import os
import sys

# un solo thread per processo: le CPU sono condivise con altri calcoli
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

from sats import kernel as kn  # noqa: E402
from sats import pipeline  # noqa: E402


def registro(msg: str) -> None:
    print(msg, flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("comando")
    ap.add_argument("argomenti", nargs="*")
    ap.add_argument("--offline", action="store_true", help="usa solo dati congelati e cache verificata")
    a = ap.parse_args(argv)
    comandi = {
        "campiona": lambda: pipeline.campiona_kernel(a.argomenti or list(kn.KERNEL), registro),
        "sistemi": lambda: pipeline.sistemi_cmd(registro),
        "scelte": lambda: pipeline.scelte(a.argomenti, registro),
        "lunghi": lambda: pipeline.confronto_lunghi(registro),
        "spike": lambda: pipeline.spike_cmd(registro),
        "record": lambda: pipeline.record(a.argomenti, registro),
        "record-lunghi": lambda: pipeline.record_lunghi(registro, a.argomenti),
        "ricalcola-lunghi": lambda: pipeline.ricalcola_lunghi(a.argomenti, registro),
        "secolare": lambda: pipeline.secolare_cmd(a.argomenti, registro),
        "residui": lambda: pipeline.residui(a.argomenti, registro),
        "genera": lambda: pipeline.genera(registro),
        "valida": lambda: pipeline.valida(registro, offline=a.offline),
        "catalogo": lambda: pipeline.catalogo(registro, offline=a.offline),
        "fixture": lambda: pipeline.fixture(registro),
    }
    if a.comando not in comandi:
        ap.error(f"comando sconosciuto: {a.comando}")
    comandi[a.comando]()
    return 0


if __name__ == "__main__":
    sys.exit(main())
