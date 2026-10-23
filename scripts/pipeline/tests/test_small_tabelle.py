"""Vettori Horizons tabulati degli oggetti senza SPK (Bennu, C/2013 A1): lettura, interpolazione, piano."""

import math

import numpy as np
import pytest

from common import constants as cst
from small import piano, sbdb, tabelle
from small.anagrafica import per_slug
from small.orbite import stato_da_cometari

MU = cst.GM_SOLE


def test_lettura_sonda_congelata():
    testo = (tabelle.CARTELLA_SPEC / "bennu-sonda-1.txt").read_text(encoding="utf-8")
    t, s = tabelle.leggi_tabella(testo)
    assert t[0] == 2415021.5 and s.shape == (t.size, 6)
    r = np.linalg.norm(s[:, :3], axis=1) / cst.UA_KM
    assert np.all((r > 0.8) & (r < 1.4))
    sonda0 = (tabelle.CARTELLA_SPEC / "bennu-sonda-0.txt").read_text(encoding="utf-8")
    assert tabelle._limite(sonda0, "prior to") == 2415021.5


def test_hermite_su_orbita_kepleriana(tmp_path):
    tp = 2451545.0
    t = np.arange(tp - 400.0, tp + 400.0 + 0.5, 1.0)
    s = stato_da_cometari(1.0 * cst.UA_KM, 0.2, 0.1, 0.3, 1.1, tp, t, MU)
    p = tmp_path / "tab.npz"
    np.savez(p, t=t, stati=s)
    v = tabelle.ValutatoreTabella(p)
    tm = t[:-1] + 0.37
    vero = stato_da_cometari(1.0 * cst.UA_KM, 0.2, 0.1, 0.3, 1.1, tp, tm, MU)
    stima = v.stati(tm)
    assert np.max(np.linalg.norm(stima[:, :3] - vero[:, :3], axis=1)) < 0.1  # km
    assert np.max(np.linalg.norm(stima[:, 3:] - vero[:, 3:], axis=1)) < 5e-6  # km/s (derivata di Hermite)
    assert np.allclose(v.stati(t[:5]), s[:5], rtol=0, atol=1e-6)
    with pytest.raises(ValueError):
        v.stati(np.array([t[-1] + 1.0]))


def test_passi_per_distanza():
    assert tabelle.passo_per_distanza(np.array([0.5, 2.9, 3.0, 9.9, 10.0, 400.0])).tolist() == [
        1.0,
        1.0,
        4.0,
        4.0,
        32.0,
        32.0,
    ]


@pytest.mark.parametrize("slug", ["bennu", "c2013-a1-siding-spring"])
def test_piano_con_tabella(slug):
    c = per_slug()[slug]
    sp = tabelle.spec(c)
    assert sp is not None and len(sp["file"]) == len(sp["intervalli"])
    for (_a, b, h), (a2, _, _) in zip(sp["intervalli"], sp["intervalli"][1:], strict=False):
        assert b == a2 and h in (1.0, 4.0, 32.0)
    pezzi = piano.piano(c, sbdb.leggi(c), [])
    assert [p.tipo for p in pezzi] == ["assist", "spk-horizons"]
    assert pezzi[1].chiave == f"tab:{slug}" and pezzi[1].inizio == sp["inizio"]
    assert pezzi[0].fine == pezzi[1].inizio and pezzi[1].fine == cst.T_END
    assert math.isclose(piano.ancora(piano.JD_1600), piano.JD_1650)
