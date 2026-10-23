"""Rotazione terrestre e Sole contro DE441 e JPL Horizons (A8), solstizio del 20/06/2024 (A9), stagioni."""

import math

import pytest

import time_model as tm
from common.de441 import CARTELLA_PREDEFINITA, NOMI_FILE

pytestmark = pytest.mark.de441
if not all((CARTELLA_PREDEFINITA / n).exists() for n in NOMI_FILE):
    pytest.skip("DE441 assente da .cache/de441", allow_module_level=True)


@pytest.fixture(scope="module")
def de():
    from common.de441 import De441

    d = De441()
    yield d
    d.chiudi()


def test_longitudine_subsolare_horizons(de):
    v = tm.validazione_subsolare(de)
    assert len(v["righe"]) == 200
    assert v["maxAss_gradi"] <= 0.1


def test_angolo_orario_mezzogiorno(de):
    v = tm.validazione_angolo_orario(de)
    assert len(v["righe"]) == 200
    assert v["maxAss_gradi"] <= 1.0


def test_solstizio_2024(de):
    v = tm.validazione_solstizio(de)
    assert abs(v["scartoMinuti"]) <= 60.0
    assert abs(v["differenza_gradi"]) <= 0.01
    assert v["longitudineAlMassimo_gradi"] == pytest.approx(90.0, abs=0.01)


def test_stagioni(de):
    v = tm.validazione_stagioni(de, 300)
    assert v["quadrantiDiversi"] == 0
    assert v["maxAss_giorni"] <= 0.1


def test_eventi_usno(de):
    # longitudine apparente (aberrazione e nutazione): istanti USNO al minuto entro 1 min
    v = tm.validazione_eventi_usno(de)
    assert len(v["righe"]) == 13
    assert v["maxAss_minuti"] <= 1.0
    # all'istante dell'evento la longitudine geometrica media ha già superato q·90° di 11-27″ (eventi anticipati di
    # 4-10 min senza aberrazione e nutazione)
    for r in v["righe"]:
        t = r["istanteTT"]
        d = math.degrees(tm.longitudine_sole(de.stato_eliocentrico(399, t), t)) - 90.0 * r["quadrante"]
        d = (d + 180.0) % 360.0 - 180.0
        assert 10.0 < d * 3600.0 < 30.0


def test_fixture_de441_rigenerate_identiche(tmp_path, de):
    p = tm._scrivi_fixture("stagioni.json", tm.fixture_stagioni(de), tmp_path)
    assert p.read_text(encoding="utf-8") == (tm.CARTELLA_FIXTURE / "stagioni.json").read_text(encoding="utf-8")
    p = tm._scrivi_fixture("sole.json", tm.fixture_sole(de), tmp_path)
    assert p.read_text(encoding="utf-8") == (tm.CARTELLA_FIXTURE / "sole.json").read_text(encoding="utf-8")
