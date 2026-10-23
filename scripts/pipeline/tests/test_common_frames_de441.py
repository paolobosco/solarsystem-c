"""Rotazione ICRF <-> eclittica J2000 (I4) e lettura di DE441 (§ 7.3.1)."""

import math

import numpy as np
import pytest

from common import constants as cst
from common.de441 import CARTELLA_PREDEFINITA, CORPI_ELIOCENTRICI, De441, indice_file
from common.frames import (
    MATRICE_ICRF_A_ECLITTICA,
    eclittica_a_icrf,
    icrf_a_eclittica,
)

HA_DE441 = all((CARTELLA_PREDEFINITA / n).exists() for n in ("de441_part-1.bsp", "de441_part-2.bsp"))
richiede_de441 = [pytest.mark.de441, pytest.mark.skipif(not HA_DE441, reason="DE441 assente")]


def test_matrice_ortonormale():
    m = MATRICE_ICRF_A_ECLITTICA
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-16)
    assert np.linalg.det(m) == pytest.approx(1.0, abs=1e-15)


def test_polo_eclittica_e_equinozio():
    e = cst.OBLIQUITA_J2000_RAD
    polo_icrf = np.array([0.0, -math.sin(e), math.cos(e)])
    assert np.allclose(icrf_a_eclittica(polo_icrf), [0, 0, 1], atol=1e-16)
    assert np.allclose(icrf_a_eclittica([1.0, 0, 0]), [1, 0, 0], atol=0)


def test_andata_e_ritorno_stati():
    rng = np.random.default_rng(3)
    s = rng.normal(size=(50, 6)) * 1e8
    assert np.allclose(eclittica_a_icrf(icrf_a_eclittica(s)), s, rtol=0, atol=1e-7)
    with pytest.raises(ValueError):
        icrf_a_eclittica(np.zeros(4))


def test_regola_del_file():
    t = np.array([cst.T0, 2440416.0, math.nextafter(2440416.5, 0), 2440416.5, 2440432.5, cst.T_END])
    assert indice_file(t).tolist() == [0, 0, 0, 1, 1, 1]


# Vettori JPL Horizons (API, 18/10/2026): EPHEM_TYPE=VECTORS, CENTER='500@10', REF_PLANE=ECLIPTIC,
# REF_SYSTEM=ICRF, VEC_CORR=NONE, OUT_UNITS=KM-S, TIME_TYPE=TDB; sorgente indicata: DE441.
HORIZONS = {
    (1, 2451545.0): [
        -1.946172635585372e07, -6.691327526352400e07, -3.679854343749542e06,
        3.699499185727919e01, -1.116441592561850e01, -4.307628118658220e00,
    ],
    (301, 2415020.5): [
        -2.942949097283659e07, 1.437479519887753e08, 3.904787258943170e04,
        -2.862575872491682e01, -5.957401015664922e00, 9.176238841647422e-02,
    ],
    (399, -1000000.5): [
        -1.042708933194932e08, -1.108069632120398e08, -1.643788779045247e06,
        2.113474804484585e01, -2.023635618865000e01, -5.795761840174753e-01,
    ],
    (9, 2495000.5): [
        4.588125806669110e09, 5.444157608675247e09, -1.909395013792460e09,
        -2.770300688484790e00, 2.389668460031968e00, 5.435071731784791e-01,
    ],
    (5, 2440416.5): [
        -8.026634974785184e08, -1.444684395896556e08, 1.857675557157136e07,
        2.163345616122454e00, -1.226105647754482e01, 1.951925443644420e-03,
    ],
}  # fmt: skip


@pytest.fixture(scope="module")
def de():
    if not HA_DE441:
        pytest.skip("DE441 assente")
    with De441() as d:
        yield d


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
@pytest.mark.parametrize(("chiave", "atteso"), list(HORIZONS.items()))
def test_confronto_horizons(de, chiave, atteso):
    corpo, t = chiave
    s = de.stato_eliocentrico(corpo, t)
    assert s.shape == (6,)
    assert np.max(np.abs(s[:3] - atteso[:3])) < 1e-5
    assert np.max(np.abs(s[3:] - atteso[3:])) < 1e-11


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_sovrapposizione_dei_file(de):
    t = np.linspace(2440400.5, 2440432.5, 33)
    for corpo in CORPI_ELIOCENTRICI:
        s = []
        for kernel in de._kernel:
            sole = de._da_ssb(10, t, kernel)
            s.append(de._da_ssb(corpo, t, kernel) - sole)
        assert np.max(np.abs(s[0][:, :3] - s[1][:, :3])) < 1e-6


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_vettori_e_unita(de):
    rng = np.random.default_rng(11)
    t = np.sort(rng.uniform(cst.T0, cst.T_END, 64))
    tutti = de.stati_eliocentrici(t)
    assert set(tutti) == set(CORPI_ELIOCENTRICI)
    for corpo, s in tutti.items():
        assert s.shape == (64, 6)
        assert np.array_equal(s[5], de.stato_eliocentrico(corpo, t[5]))
    # Terra = EMB - r_Luna,geo/(1 + EMRAT) (§ 7.3.5)
    luna_geo = de.stato_icrf(301, 399, t)
    terra = de.stato_icrf(399, 10, t)
    emb = de.stato_icrf(3, 10, t)
    assert np.max(np.abs(terra - (emb - luna_geo / (1.0 + cst.EMRAT)))) < 1e-6
    # velocità in km/s: differenze finite centrate su circa ±30 s, con l'intervallo effettivo
    tp = t + 30.0 / cst.GIORNO_S
    tm = t - 30.0 / cst.GIORNO_S
    for corpo in (1, 301):
        v = de.stato_eliocentrico(corpo, t)[:, 3:]
        dp = de.stato_eliocentrico(corpo, tp)[:, :3] - de.stato_eliocentrico(corpo, tm)[:, :3]
        assert np.max(np.abs(dp / ((tp - tm) * cst.GIORNO_S)[:, None] - v)) < 1e-6
