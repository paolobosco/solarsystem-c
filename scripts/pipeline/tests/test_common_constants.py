"""Costanti, calendario e blocchi (§ 6.1, § 6.2, § 7.1, § 8.1)."""

import json
import math
import re

import numpy as np
import pytest

from common import constants as cst
from common.calendario import calendario_a_jd, jd_a_calendario
from common.de441 import CARTELLA_PREDEFINITA, De441

HA_DE441 = all((CARTELLA_PREDEFINITA / n).exists() for n in ("de441_part-1.bsp", "de441_part-2.bsp"))


def test_unita_fondamentali():
    assert cst.UA_KM == 149597870.7
    assert cst.C_KM_S == 299792.458
    assert cst.OBLIQUITA_J2000_ARCSEC == 84381.448
    assert cst.OBLIQUITA_J2000_RAD == pytest.approx(math.radians(23.439291111111), abs=1e-12)


def test_gm_derivati():
    # Valori km^3/s^2 dell'area commenti di DE441 (6 decimali).
    tabella = {
        1: 22031.868551,
        2: 324858.592000,
        3: 403503.235625,
        4: 42828.375816,
        5: 126712764.100000,
        6: 37940584.841800,
        7: 5794556.400000,
        8: 6836527.100580,
        9: 975.500000,
        10: 132712440041.279419,
        399: 398600.435507,
        301: 4902.800118,
    }
    for naif, v in tabella.items():
        assert cst.GM_KM3_S2[naif] == pytest.approx(v, abs=1e-6, rel=1e-15)
    assert cst.GM_TERRA + cst.GM_LUNA == pytest.approx(cst.GM_BARICENTRI[3], rel=1e-15)
    assert cst.GM_TERRA / cst.GM_LUNA == pytest.approx(cst.EMRAT, rel=1e-14)
    for i in range(1, 10):
        assert cst.MU_ELIO[i] == cst.GM_SOLE + cst.GM_BARICENTRI[i]


def _costanti_spk(testo: str) -> dict[str, float]:
    out = {}
    for m in re.finditer(r"^([A-Z0-9]+)\s+(-?\d+\.\d+D[+-]\d+)\s*$", testo, re.MULTILINE):
        out[m.group(1)] = float(m.group(2).replace("D", "E"))
    return out


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_costanti_uguali_all_area_commenti_spk():
    with De441() as de:
        for indice in (0, 1):
            c = _costanti_spk(de.commenti(indice))
            assert c["DENUM"] == 441.0
            for nome, v in cst.DE441_GM_UA3_D2.items():
                assert c[nome] == v, nome
            assert c["EMRAT"] == cst.EMRAT
            assert c["AU"] == cst.DE441_AU_KM == cst.UA_KM
            assert c["CLIGHT"] == cst.DE441_CLIGHT_KM_S == cst.C_KM_S


def test_constants_json_allineato():
    dati = json.loads(cst.PERCORSO_JSON.read_text(encoding="utf-8"))
    assert dati == json.loads(json.dumps(cst.come_dizionario()))
    assert dati["GM_KM3_S2"]["10"] == cst.GM_SOLE
    assert dati["JD_MIN_UT"] == -1931076.5
    assert dati["JD_MAX_UT_EXCL"] == 2495739.5


def test_blocchi():
    assert cst.B == 714 * 512
    assert cst.inizio_blocco(12) == 2455615.5
    assert cst.fine_blocco(12) == cst.T_END
    assert cst.fine_blocco(3) == cst.inizio_blocco(4)
    assert cst.blocco_di(cst.T0) == 0
    assert cst.blocco_di(2455615.5) == 12
    assert cst.blocco_di(math.nextafter(2455615.5, 0)) == 11
    for passo in (16, 32, 64, 256, 512):
        assert cst.B % passo == 0
    with pytest.raises(ValueError):
        cst.blocco_di(cst.T_END)
    with pytest.raises(ValueError):
        cst.blocco_di(cst.T0 - 1e-6)
    # copertura con margine attorno ai limiti in UT (§ 6.2)
    assert cst.T0 < cst.JD_MIN_UT - 100 and cst.JD_MAX_UT_EXCL + 1 < cst.T_END


@pytest.mark.parametrize(
    ("data", "jd"),
    [
        ((1957, 10, 4, 19, 26, 24.0, "gregoriano"), 2436116.31),
        ((333, 1, 27, 12, 0, 0.0, "giuliano"), 1842713.0),
        ((-4712, 1, 1, 12, 0, 0.0, "giuliano"), 0.0),
        ((2000, 1, 1, 0, 0, 0.0, "gregoriano"), 2451544.5),
        ((-9999, 3, 1, 0, 0, 0.0, "giuliano"), -1931017.5),
        ((-9998, 12, 1, 0, 0, 0.0, "giuliano"), -1930377.5),
        ((1582, 10, 4, 0, 0, 0.0, "giuliano"), 2299159.5),
        ((1582, 10, 15, 0, 0, 0.0, "gregoriano"), 2299160.5),
    ],
)
def test_calendario_esempi(data, jd):
    assert calendario_a_jd(*data) == pytest.approx(jd, abs=1e-9)


def test_calendario_andata_e_ritorno():
    rng = np.random.default_rng(7)
    for jd in np.round(rng.uniform(cst.JD_MIN_UT, cst.JD_MAX_UT_EXCL, 20000)) - 0.5:
        d = jd_a_calendario(float(jd))
        assert calendario_a_jd(d.anno, d.mese, d.giorno, 0, 0, 0.0, d.calendario) == jd
    d = jd_a_calendario(cst.JD_MIN_UT)
    assert (d.anno, d.mese, d.giorno, d.calendario) == (-9999, 1, 1, "giuliano")
    d = jd_a_calendario(2299160.5)
    assert (d.anno, d.mese, d.giorno, d.calendario) == (1582, 10, 15, "gregoriano")
