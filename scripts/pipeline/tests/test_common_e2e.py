"""Prova completa: Mercurio da DE441, file SSSERIE1, rilettura, interpolazione, confronto."""

import json
from pathlib import Path

import numpy as np
import pytest

from common import binio
from common import constants as cst
from common.de441 import CARTELLA_PREDEFINITA, De441
from common.equinoctial import elementi_da_stato, stato_da_elementi
from common.fixture_common import CARTELLA_USCITA, FINE, INIZIO, genera, segmento_mercurio
from common.manifest import sha256_bytes

HA_DE441 = all((CARTELLA_PREDEFINITA / n).exists() for n in ("de441_part-1.bsp", "de441_part-2.bsp"))
RAD_ARCSEC = 206264.80624709636


@pytest.fixture(scope="module")
def de():
    if not HA_DE441:
        pytest.skip("DE441 assente")
    with De441() as d:
        yield d


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_mercurio_due_anni(de, tmp_path):
    seg = segmento_mercurio(de)
    assert seg.h == 32.0 and seg.fattore_i == 1 and seg.mu == cst.MU_ELIO[1]
    percorso = tmp_path / "p.bin"
    percorso.write_bytes(binio.scrivi_serie(binio.TIPO_PIANETI, -1, INIZIO, FINE, {1: [seg]}))
    fs = binio.leggi_serie(percorso.read_bytes())
    rng = np.random.default_rng(2026)
    t = np.concatenate([rng.uniform(INIZIO, FINE, 3000), INIZIO + 32.0 * np.arange(23)])
    stati, esiti = binio.valuta_serie(fs, 1, t)
    assert np.all(esiti == "ok")
    rif = de.stato_eliocentrico(1, t)
    dr = np.linalg.norm(stati[:, :3] - rif[:, :3], axis=1)
    r = np.linalg.norm(rif[:, :3], axis=1)
    assert np.max(dr / r) * RAD_ARCSEC < 2.0
    dv = np.linalg.norm(stati[:, 3:] - rif[:, 3:], axis=1)
    assert np.max(dv) < 1e-3  # km/s
    # elementi osculanti ricostruiti: a e λ coerenti con DE441
    el, _ = elementi_da_stato(rif, cst.MU_ELIO[1])
    el2, _ = elementi_da_stato(stati, cst.MU_ELIO[1])
    assert np.max(np.abs(el2[:, 0] - el[:, 0]) / el[:, 0]) < 1e-5
    assert np.allclose(stato_da_elementi(el, cst.MU_ELIO[1], 1), rif, rtol=0, atol=1e-6)


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_fixture_rigenerate_identiche(de, tmp_path):
    """Fixture del repository uguali a quelle rigenerate (a meno dell'ultimo bit delle funzioni trigonometriche)."""
    sha = genera(tmp_path, de)
    if all(sha256_bytes((CARTELLA_USCITA / nome).read_bytes()) == h for nome, h in sha.items()):
        return
    nuovo = binio.leggi_serie((tmp_path / "serie-prova.bin").read_bytes())
    vecchio = binio.leggi_serie((CARTELLA_USCITA / "serie-prova.bin").read_bytes())
    assert nuovo.intestazione == vecchio.intestazione and nuovo.corpi.keys() == vecchio.corpi.keys()
    for ssid, segs in nuovo.corpi.items():
        for s, v in zip(segs, vecchio.corpi[ssid], strict=True):
            assert (s.tipo, s.fattore_i, s.n_campioni, s.h, s.t_primo, s.inizio, s.fine) == (
                v.tipo, v.fattore_i, v.n_campioni, v.h, v.t_primo, v.inizio, v.fine
            )  # fmt: skip
            assert np.allclose([s.mu, s.a0, s.lam0, s.n], [v.mu, v.a0, v.lam0, v.n], rtol=1e-12, atol=0)
            scala = np.max(np.abs(v.dati), axis=0)
            assert np.all(np.abs(s.dati.astype(float) - v.dati) <= 1e-6 * scala), f"fixture non aggiornata: {ssid}"
    for nome in ("serie-prova.json", "equinoziali.json"):
        a = json.loads((tmp_path / nome).read_text(encoding="utf-8"))
        b = json.loads((CARTELLA_USCITA / nome).read_text(encoding="utf-8"))
        assert len(a["casi"]) == len(b["casi"]), nome
        for ca, cb in zip(a["casi"], b["casi"], strict=True):
            for chiave in ("stato", "elementi", "elementiDaStato"):
                if ca.get(chiave) is not None or cb.get(chiave) is not None:
                    assert np.allclose(ca[chiave], cb[chiave], rtol=1e-6, atol=1e-6), f"{nome}: {chiave}"


def test_fixture_coerenti_con_il_file():
    cartella = Path(CARTELLA_USCITA)
    dati = (cartella / "serie-prova.bin").read_bytes()
    js = json.loads((cartella / "serie-prova.json").read_text(encoding="utf-8"))
    assert js["sha256"] == sha256_bytes(dati) and len(js["casi"]) == 200
    fs = binio.leggi_serie(dati)
    tipi = {ssid: [s.tipo for s in segs] for ssid, segs in fs.corpi.items()}
    assert tipi == {1: [1], 900: [1, 2], 901: [2, 2, 2]}
    assert fs.corpi[900][0].fattore_i == -1
    esiti = {c["esito"] for c in js["casi"]}
    assert esiti == {"ok", "non-determinabile", "fuori-copertura"}
    for c in js["casi"]:
        st, es = binio.valuta_serie(fs, c["ssid"], np.array([c["t"]]))
        assert es[0] == c["esito"]
        if c["esito"] == "ok":
            assert np.allclose(st[0], c["stato"], rtol=1e-12, atol=0)
    eq = json.loads((cartella / "equinoziali.json").read_text(encoding="utf-8"))
    assert len(eq["casi"]) == 100
    assert sum(c["fattoreI"] == -1 for c in eq["casi"]) >= 20
    for c in eq["casi"]:
        st = stato_da_elementi(np.array(c["elementi"]), c["mu"], c["fattoreI"])
        assert np.allclose(st, c["stato"], rtol=1e-12, atol=0)
        el, _ = elementi_da_stato(np.array(c["stato"]), c["mu"], c["fattoreI"])
        assert np.allclose(el, c["elementiDaStato"], rtol=1e-12, atol=1e-14)
    copia = json.loads((cartella / "constants.json").read_text(encoding="utf-8"))
    assert copia == json.loads(cst.PERCORSO_JSON.read_text(encoding="utf-8"))
