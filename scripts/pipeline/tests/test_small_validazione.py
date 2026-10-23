"""Validazione dei piccoli corpi: lettura delle risposte Horizons congelate e risultati registrati."""

import json
import shutil
import subprocess

import numpy as np
import pytest

from small import horizons
from small.anagrafica import CARTELLA_OUT, CARTELLA_PIPELINE, FILE_BLOCCHI, FILE_VALIDAZIONE, RAW

VETTORI = RAW / "horizons" / "vettori"
RIEPILOGO = FILE_VALIDAZIONE


def test_epoca_vettori():
    testo = (VETTORI / "apophis.txt").read_text(encoding="utf-8")
    assert horizons.epoca_vettori(testo) == 2459215.5
    t, s = horizons.leggi_vettori(testo)
    assert t.size == 50 and s.shape == (50, 6) and np.all(np.diff(t) > 0)


def test_gruppi_congelati_coerenti():
    """Le risposte per gruppi (dopo e prima dell'epoca) contengono solo epoche della richiesta unica."""
    cartella = RAW / "horizons" / "vettori-gruppi"
    if not cartella.exists():
        pytest.skip("validazione non ancora eseguita")
    for p in sorted(cartella.glob("*.txt")):
        nome = p.stem.rsplit("-", 1)[0]
        t_tutte, _ = horizons.leggi_vettori((VETTORI / f"{nome}.txt").read_text(encoding="utf-8"))
        t, _ = horizons.leggi_vettori(p.read_text(encoding="utf-8"))
        assert all(np.min(np.abs(t_tutte - x)) < 1e-5 for x in t), p.name


def test_itokawa_confronto_con_horizons_dal_1700():
    """Itokawa, con i dati dal 1700 (cloni dall'epoca della covarianza): 38 epoche su 50 confrontate con Horizons.
    Le epoche anteriori all'11/9/1840 si richiedono a parte: insieme a quelle dopo il 1923 queste si scostavano
    fino a 3,2e5 km (Horizons integra in sequenza dalla più antica, con incontri ravvicinati nel 1902 e nel 1905)."""
    from small.validazione import TAGLIO_ANTICO

    t_antico, _ = horizons.leggi_vettori(
        (RAW / "horizons" / "vettori-gruppi" / "itokawa-antico.txt").read_text("utf-8")
    )
    t_prima, _ = horizons.leggi_vettori((RAW / "horizons" / "vettori-gruppi" / "itokawa-prima.txt").read_text("utf-8"))
    assert t_antico.size == 13 and t_antico.max() < TAGLIO_ANTICO["itokawa"] <= t_prima.min()
    h = json.loads(RIEPILOGO.read_text(encoding="utf-8"))["corpi"]["itokawa"]["horizons"]
    assert (h["epoche"], h["valutate"]) == (50, 38)
    assert h["oltre_soglia"] == [] and h["max_rapporto"] < 1.0


def test_riepiloghi_versionati():
    """Risultati grezzi di A7/A9 e riepilogo dei blocchi in out/, versionati con gli altri moduli (RNF5)."""
    for p in (FILE_VALIDAZIONE, FILE_BLOCCHI):
        assert p.parent == CARTELLA_OUT and p.exists(), p
        if shutil.which("git"):
            r = subprocess.run(["git", "check-ignore", "-q", str(p)], cwd=CARTELLA_PIPELINE, check=False)
            assert r.returncode == 1, f"{p.name} escluso da git"
    v = json.loads(FILE_VALIDAZIONE.read_text(encoding="utf-8"))
    assert {"corpi", "halley", "apophis_2029", "cerere_meno7000"} <= set(v)


def test_a9_apophis_e_halley():
    """A9: Apophis 2029 entro 500 km e 10 min da CNEOS; perieli di 1P nel 1910 e nel 1986 entro 0,5 d."""
    v = json.loads(RIEPILOGO.read_text(encoding="utf-8"))
    ap = v["apophis_2029"]
    assert abs(ap["diff_km"]) <= 500.0 and abs(ap["diff_min"]) <= 10.0
    h = v["halley"]
    assert abs(h["1910_dT_d"]) <= 0.5 and abs(h["1986"]["dT_d"]) <= 0.5
    assert h["max_dT_-239_1910_d"] <= 2.0
