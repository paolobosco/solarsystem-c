"""Pipeline dei piccoli corpi (§ 7.6, § 8.3, § 8.6, § 12.3 passo 5).

Uso, da scripts/pipeline/ e nell'ambiente .venv-assist:

    .venv-assist/bin/python small_bodies.py scarica [--offline] [--corpi slug,...]
    .venv-assist/bin/python small_bodies.py integra [--corpi ...] [--processi 2]
    .venv-assist/bin/python small_bodies.py segmenti [--corpi ...] [--livello 0..6]
    .venv-assist/bin/python small_bodies.py blocchi [--livello-blocchi 0..4]
    .venv-assist/bin/python small_bodies.py catalogo
    .venv-assist/bin/python small_bodies.py valida
    .venv-assist/bin/python small_bodies.py fixture
    .venv-assist/bin/python small_bodies.py tutto [--offline]
"""

from __future__ import annotations

import argparse
import sys


def _corpi(arg: str | None) -> list[str] | None:
    return None if not arg else [x.strip() for x in arg.split(",") if x.strip()]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pipeline dei piccoli corpi")
    ap.add_argument(
        "passo", choices=["scarica", "integra", "segmenti", "blocchi", "catalogo", "valida", "fixture", "tutto"]
    )
    ap.add_argument("--offline", action="store_true", help="usa solo dati congelati e cache verificata")
    ap.add_argument("--corpi", default=None, help="slug separati da virgole")
    ap.add_argument("--processi", type=int, default=2, help="processi di integrazione in parallelo (massimo 2)")
    ap.add_argument(
        "--livello",
        type=int,
        default=0,
        choices=[0, 1, 2, 3, 4, 5, 6],
        help="tolleranza (costruzione.LIVELLI): 0 specifica, 1 ripiego del § 15, 2-4 candidati, 5-6 misure",
    )
    ap.add_argument(
        "--livello-blocchi",
        type=int,
        default=None,
        choices=[0, 1, 2, 3, 4],
        help="livello dei blocchi pubblicati (predefinito: il primo candidato che rispetta il budget, altrimenti 4)",
    )
    a = ap.parse_args(argv)
    slug = _corpi(a.corpi)
    passi = (
        ["scarica", "integra", "segmenti", "blocchi", "catalogo", "valida", "fixture"]
        if a.passo == "tutto"
        else [a.passo]
    )
    for p in passi:
        if p == "scarica":
            from small.scarica import scarica_tutto

            scarica_tutto(offline=a.offline, slug=slug)
        elif p == "integra":
            from small.elabora import integra_tutti

            integra_tutti(slug, processi=min(2, max(1, a.processi)))
        elif p == "segmenti":
            from small.blocchi import CANDIDATI
            from small.elabora import segmenti_tutti

            # nel passo 'tutto': i livelli candidati per il budget (blocchi.CANDIDATI)
            livelli = list(CANDIDATI) if a.passo == "tutto" else [a.livello]
            for lv in livelli:
                segmenti_tutti(slug, livello=lv, processi=min(2, max(1, a.processi)))
        elif p == "blocchi":
            from small.blocchi import scrivi_blocchi

            scrivi_blocchi(a.livello_blocchi)
        elif p == "catalogo":
            from small.catalogo import scrivi_frammenti

            scrivi_frammenti()
        elif p == "valida":
            from small.validazione import valida_tutto

            valida_tutto(slug, offline=a.offline)
        elif p == "fixture":
            from small.fixture import scrivi_fixture

            scrivi_fixture()
    return 0


if __name__ == "__main__":
    sys.exit(main())
