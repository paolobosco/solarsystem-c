"""Dati prodotti per i piccoli corpi: blocchi small/bKK.bin, frammenti di affidabilità e catalogo."""

import json
import math

import numpy as np
import pytest

from common import affidabilita as ca
from common import binio
from common import constants as cst
from small import affidabilita as aff
from small.anagrafica import CARTELLA_DATI, CARTELLA_OUT, FILE_BLOCCHI, piccoli_corpi
from small.blocchi import CANDIDATI, LIVELLO_RIPIEGO, LOG10_PI
from small.piano import JD_1600

pytestmark = pytest.mark.skipif(not (CARTELLA_DATI / "b12.bin").exists(), reason="blocchi non ancora prodotti")

BUDGET_TOTALE = 12_000_000  # byte (MB decimali, come nel resto del progetto)
BUDGET_FILE = 4_000_000


@pytest.fixture(scope="module")
def blocchi():
    return {k: binio.leggi_serie((CARTELLA_DATI / f"b{k:02d}.bin").read_bytes()) for k in range(cst.K)}


def test_budget_misurato_e_livello():
    """Dimensioni registrate uguali ai file; livello: il primo candidato che rispetta il budget,
    altrimenti il ripiego (salvo livello esplicito, registrato)."""
    dim = [(CARTELLA_DATI / f"b{k:02d}.bin").stat().st_size for k in range(cst.K)]
    r = json.loads(FILE_BLOCCHI.read_text(encoding="utf-8"))
    assert r["byte"] == {f"b{k:02d}.bin": dim[k] for k in range(cst.K)}
    assert r["totale"] == sum(dim)
    assert r["rispetta_budget"] == (sum(dim) <= BUDGET_TOTALE and max(dim) <= BUDGET_FILE)
    if r.get("esplicito"):
        return
    entro = [
        lv for lv in CANDIDATI if isinstance(r["misure"].get(str(lv)), dict) and r["misure"][str(lv)]["rispetta_budget"]
    ]
    assert r["livello"] == (entro[0] if entro else LIVELLO_RIPIEGO)


def test_corpi_e_nuclei(blocchi):
    ssid = sorted(c.ssid for c in piccoli_corpi())
    for k, f in blocchi.items():
        assert f.intestazione.tipo == binio.TIPO_PICCOLI_CORPI
        assert f.intestazione.blocco == k
        assert sorted(f.corpi) == ssid
        for segs in f.corpi.values():
            for s in segs:
                assert cst.inizio_blocco(k) <= s.inizio < s.fine <= cst.fine_blocco(k)
                assert s.h in binio.PASSI_AMMESSI


def test_affidabilita_coerente_con_i_dati(blocchi):
    rel = json.loads((CARTELLA_OUT / "reliability-small.json").read_text(encoding="utf-8"))
    assert rel["formato"] == 2 and {k: rel[k] for k in ca.griglia()} == ca.griglia()
    nodi = aff.nodi()
    for c in piccoli_corpi():
        r = rel["corpi"][c.slug]
        assert len(r["log10eps"]) == len(r["formaDeterminata"]) == len(r["datiPresenti"]) == aff.N_NODI
        coperti = []
        for f in blocchi.values():
            coperti += [(s.inizio, s.fine) for s in f.corpi[c.ssid]]
        for k in range(aff.N_NODI):
            presenti = any(a < nodi[k + 1] and b > nodi[k] for a, b in coperti)
            assert presenti == r["datiPresenti"][k]
            x = r["log10eps"][k]
            assert x is None or x <= LOG10_PI
            if r["datiPresenti"][k]:
                assert x is not None and 10.0**x <= aff.SOGLIA_NON_DETERMINABILE * (1 + 1e-9)


def test_epsilon_finestra_include_tolleranza(blocchi):
    """Nella finestra 1600-2121 ε di ogni nodo non è inferiore alla tolleranza dei segmenti vista dal Sole,
    max(500 km, 1e-7·r)/r (§ 7.6.3), con r minimo sui nodi della griglia dei segmenti nell'intervallo."""
    rel = json.loads((CARTELLA_OUT / "reliability-small.json").read_text(encoding="utf-8"))
    nodi = aff.nodi()
    for c in piccoli_corpi():
        r_min = np.full(aff.N_NODI, np.inf)
        for f in blocchi.values():
            for s in f.corpi[c.ssid]:
                a = max(s.inizio, JD_1600)
                if not a < s.fine:
                    continue
                j = np.arange(math.ceil((a - s.t_primo) / s.h), math.floor((s.fine - s.t_primo) / s.h) + 1)
                t = np.concatenate([[a, s.fine], s.t_primo + s.h * j])
                t = t[(t >= a) & (t <= s.fine)]
                r = np.linalg.norm(binio.valuta_segmento(s, t)[:, :3], axis=1)
                k = np.clip(np.searchsorted(nodi, t, side="right") - 1, 0, aff.N_NODI - 1)
                np.minimum.at(r_min, k, r)
        log10 = rel["corpi"][c.slug]["log10eps"]
        for k in np.nonzero(np.isfinite(r_min))[0]:
            tol = max(500.0 / r_min[k], 1e-7)
            assert log10[k] is not None and 10.0 ** log10[k] >= tol, (c.slug, int(k), 10.0 ** log10[k], tol)


def test_frammento_catalogo():
    cat = json.loads((CARTELLA_OUT / "catalog-small.json").read_text(encoding="utf-8"))
    assert cat["formato"] == 1 and cat["area"] == "small"
    assert set(cat["corpi"]) == {c.slug for c in piccoli_corpi()}
    for slug, c in cat["corpi"].items():
        assert c["slug"] == slug and c["primario"] == "sole"
        assert c["effemeridi"]["modello"] == "piccolo-corpo" and c["effemeridi"]["fonti"]
        for f in c["effemeridi"]["fonti"]:
            assert f["tipo"] in ("spk-horizons", "record-dastcom", "sb441-n16", "assist")
            assert f["inizio"] < f["fine"]
        for campo in ("raggi_km", "gm_km3s2", "rotazione", "albedo"):
            v = c["fisica"][campo]
            assert v is None or (v["fonte"] and "valore" in v and "incertezza" in v and "anno" in v)
        assert c["orientamento"]["modello"] in ("wgccre", "fisso")
        assert c["epsModelloCostante"] is None


def test_stati_finiti(blocchi):
    rng = np.random.default_rng(1)
    for f in blocchi.values():
        for ssid, segs in f.corpi.items():
            for s in segs[:3]:
                t = rng.uniform(s.inizio, s.fine, 5)
                st = binio.valuta_segmento(s, t)
                assert np.all(np.isfinite(st)), ssid
