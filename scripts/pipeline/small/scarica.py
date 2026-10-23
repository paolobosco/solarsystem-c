"""Scaricamento e congelamento delle sorgenti dei piccoli corpi (§ 12.2).

Risposte piccole (SBDB, elenchi e dati dei record, vettori di validazione, CNEOS) in raw/small/;
SPK di Horizons in .cache/small/spk/ con SHA-256 in raw/manifest-sorgenti.json.
"""

from __future__ import annotations

import datetime as _dt
import json
import re

import numpy as np

from common import constants as cst
from common.calendario import calendario_a_jd
from common.manifest import aggiorna_manifest_sorgenti, cerca_sorgente, sha256_file, voce_sorgente

from . import horizons, piano, rete, sbdb
from .anagrafica import CACHE, RAW, Corpo, piccoli_corpi

CARTELLA_VETTORI = RAW / "horizons" / "vettori"
N_EPOCHE_VALIDAZIONE = 50
SEME_VALIDAZIONE = 20261021
FILE_ESTRAZIONE = RAW / "estrazione.json"


def data_estrazione() -> str:
    """Data della prima estrazione (AAAA-MM-GG), registrata in raw/small/estrazione.json."""
    if FILE_ESTRAZIONE.exists():
        return json.loads(FILE_ESTRAZIONE.read_text(encoding="utf-8"))["estrazione"]
    oggi = _dt.date.today().isoformat()
    FILE_ESTRAZIONE.parent.mkdir(parents=True, exist_ok=True)
    FILE_ESTRAZIONE.write_text(json.dumps({"formato": 1, "estrazione": oggi}) + "\n", encoding="utf-8")
    return oggi


def percorso_spk(nome: str):
    return CACHE / "spk" / f"{nome}.bsp"


def scarica_spk(r: piano.RichiestaSpk, offline: bool = False) -> None:
    p = percorso_spk(r.nome)
    nome_manifest = f"small/spk/{r.nome}.bsp"
    if p.exists():
        try:
            v = cerca_sorgente(nome_manifest)
            if v["byte"] == p.stat().st_size and v["sha256"] == sha256_file(p):
                return
        except KeyError:
            pass
    if offline:
        if p.exists():
            return
        raise rete.AssenteOffline(f"SPK assente: {p}")
    rifiuto = piano.percorso_rifiuto_spk(r.nome)
    if rifiuto.exists():
        return
    url = horizons.url_spk(r.comando, piano.data_horizons(r.inizio), piano.data_horizons(r.fine))
    risposta = rete.scarica(url)
    try:
        dati = rete.spk_da_horizons(risposta)
    except rete.ErroreRete:
        if b"pre-computed objects" not in risposta:
            raise
        # Horizons non produce SPK per gli oggetti precalcolati dell'indice dei corpi maggiori
        rifiuto.parent.mkdir(parents=True, exist_ok=True)
        rifiuto.write_bytes(risposta)
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(dati)
    voce = voce_sorgente(
        nome_manifest,
        url,
        f"small/spk/{r.nome}.bsp",
        data_estrazione(),
        f"SPK Horizons tipo 21, COMMAND {r.comando}, {piano.data_horizons(r.inizio)} / {piano.data_horizons(r.fine)}",
    )
    aggiorna_manifest_sorgenti(voce)


def epoche_validazione(c: Corpo) -> np.ndarray:
    """50 epoche uniformi casuali in [1600-01-01, T_END - 1) con seme registrato (20261021 + ssid)."""
    rng = np.random.default_rng(SEME_VALIDAZIONE + c.ssid)
    t = np.sort(rng.uniform(piano.JD_1600, cst.T_END - 1.0, N_EPOCHE_VALIDAZIONE))
    # quattro decimali: valori esatti in TLIST e nel confronto
    return np.round(t, 4)


def gruppi_validazione(c: Corpo, pezzi: list[piano.Pezzo], sb: sbdb.RispostaSbdb) -> list[tuple[str, str, np.ndarray]]:
    """(nome, comando Horizons, epoche) per gruppo: soluzione corrente o record del pezzo."""
    t = epoche_validazione(c)
    gruppi: dict[str, tuple[str, list[np.ndarray]]] = {}
    for p in pezzi:
        if p.fine <= piano.JD_1600:
            continue
        m = (t >= p.inizio) & (t < p.fine)
        if not np.any(m):
            continue
        if p.record is not None:
            nome, comando = f"{c.slug}-{p.record}", f"{p.record};"
        else:
            nome, comando = c.slug, piano.comando_corrente(sb)
        gruppi.setdefault(nome, (comando, []))[1].append(t[m])
    return [(nome, comando, np.concatenate(v)) for nome, (comando, v) in gruppi.items()]


MESI = {
    m: i + 1 for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"])
}


def limite_horizons(testo: str) -> float | None:
    """Inizio della disponibilità dichiarato da Horizons ('No ephemeris ... prior to A.D. ...')."""
    m = re.search(r"prior to A\.D\. (\d{4})-([A-Z]{3})-(\d{2})", testo)
    if not m:
        return None
    return calendario_a_jd(int(m.group(1)), MESI[m.group(2)], int(m.group(3)), 0, 0, 0, "gregoriano")


def scarica_vettori(c: Corpo, pezzi: list[piano.Pezzo], sb: sbdb.RispostaSbdb, offline: bool = False) -> None:
    for nome, comando, t in gruppi_validazione(c, pezzi, sb):
        p = CARTELLA_VETTORI / f"{nome}.txt"
        testo = rete.congelato(p, horizons.url_vettori(comando, list(t)), offline).decode()
        lim = limite_horizons(testo) if "$$SOE" not in testo else None
        if lim is not None and not offline:
            # Horizons serve il corpo solo da una certa data: si richiedono le sole epoche disponibili
            ammesse = [x for x in t if x >= lim + 1.0]
            p.write_bytes(rete.scarica(horizons.url_vettori(comando, ammesse)))


def url_cneos_apophis() -> str:
    return rete.url_con_parametri(
        rete.URL_CAD,
        {"des": "99942", "date-min": "2029-04-01", "date-max": "2029-04-30", "dist-max": "0.05", "body": "Earth"},
    )


def scarica_tutto(offline: bool = False, slug: list[str] | None = None, log=print) -> None:
    data_estrazione()
    corpi = [c for c in piccoli_corpi() if slug is None or c.slug in slug]
    for c in corpi:
        sbdb.scarica(c, offline)
    for c in corpi:
        sb = sbdb.leggi(c)
        records = piano.scarica_record(c, offline)
        pezzi = piano.piano(c, sb, records)
        piano.salva_piano(c, pezzi)
        richieste = piano.richieste_spk(c, sb, records)
        for r in richieste:
            scarica_spk(r, offline)
        from .tabelle import scarica_tabella

        scarica_tabella(c, sb, offline)
        pezzi = piano.piano(c, sb, records)
        piano.salva_piano(c, pezzi)
        scarica_vettori(c, pezzi, sb, offline)
        log(f"{c.slug}: {len(records)} record, {len(pezzi)} pezzi, {len(richieste)} SPK")
    rete.congelato(RAW / "cneos" / "apophis-2029.json", url_cneos_apophis(), offline)
    from .mpc import scarica as scarica_mpc

    scarica_mpc(offline)
