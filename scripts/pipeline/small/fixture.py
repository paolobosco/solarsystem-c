"""Fixture per i test TypeScript dei piccoli corpi: tests/fixtures/small/casi.json.

Per un corpo campione di ogni classe, 200 epoche (seme registrato) in [T0 - 400, T_END + 400] più
le epoche dei confini dei segmenti; stato atteso ed esito dalla valutazione di riferimento di binio
sui file pubblicati public/data/v1/small/bKK.bin, con lo SHA-256 dei file.
"""

from __future__ import annotations

import json

import numpy as np

from common import constants as cst
from common.manifest import sha256_file

from .anagrafica import CARTELLA_DATI, CARTELLA_FIXTURE, per_slug
from .validazione import File

SEME = 20261024
N_EPOCHE = 200
CAMPIONI = {
    "cerere": "asteroide in sb441-n16 (pianeta nano)",
    "ida": "asteroide della fascia principale",
    "apophis": "asteroide vicino alla Terra",
    "hektor": "troiano di Giove",
    "1p-halley": "cometa periodica a record",
    "2p-encke": "cometa periodica a record",
    "c1995-o1-hale-bopp": "cometa a lungo periodo",
    "chiron": "centauro",
    "sedna": "oggetto transnettuniano",
    "eris": "pianeta nano transnettuniano",
    "1i-oumuamua": "oggetto interstellare",
    "3i-atlas": "oggetto interstellare",
}


def scrivi_fixture() -> dict:
    f = File()
    corpi = per_slug()
    rng = np.random.default_rng(SEME)
    casi = []
    for slug in CAMPIONI:
        c = corpi[slug]
        t = rng.uniform(cst.T0 - 400.0, cst.T_END + 400.0, N_EPOCHE)
        bordi = []
        for k in range(cst.K):
            for s in f.blocco(k).corpi.get(c.ssid, []):
                bordi += [s.inizio, np.nextafter(s.fine, -np.inf)]
        if bordi:
            scelti = rng.choice(len(bordi), min(40, len(bordi)), replace=False)
            t = np.concatenate([t, np.array(bordi)[scelti]])
        # fuori dalla copertura: prima di T0 e da T_END (escluso) in poi
        t = np.sort(np.concatenate([t, [cst.T0 - 1.0, cst.T_END, cst.T_END + 10.0]]))
        stati, esiti = f.valuta(c.ssid, t)
        for k in range(t.size):
            casi.append(
                {
                    "slug": slug,
                    "ssid": c.ssid,
                    "t": float(t[k]),
                    "esito": str(esiti[k]),
                    "stato": [float(x) for x in stati[k]] if esiti[k] == "ok" else None,
                }
            )
    file = {f"b{k:02d}.bin": sha256_file(CARTELLA_DATI / f"b{k:02d}.bin") for k in range(cst.K)}
    doc = {"formato": 1, "seme": SEME, "campioni": CAMPIONI, "file": file, "casi": casi}
    CARTELLA_FIXTURE.mkdir(parents=True, exist_ok=True)
    (CARTELLA_FIXTURE / "casi.json").write_text(json.dumps(doc, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"casi": len(casi)}
