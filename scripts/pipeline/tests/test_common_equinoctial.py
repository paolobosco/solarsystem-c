"""Elementi equinoziali con fattore retrogrado (§ 7.2)."""

import math

import numpy as np
import pytest

from common import constants as cst
from common.equinoctial import (
    a_classici,
    da_classici,
    elementi_da_stato,
    fattore_retrogrado,
    lambda_continua,
    riduci_angolo,
    risolvi_keplero,
    stato_da_elementi,
)

MU = cst.GM_SOLE


def _stato_kepleriano(a, e, i, nodo, argp, m, mu):
    """Stato da elementi classici con la formulazione perifocale standard (riferimento indipendente)."""
    ea = m
    for _ in range(100):
        ea = ea - (ea - e * math.sin(ea) - m) / (1 - e * math.cos(ea))
    b = a * math.sqrt(1 - e * e)
    xp, yp = a * (math.cos(ea) - e), b * math.sin(ea)
    r = a * (1 - e * math.cos(ea))
    fv = math.sqrt(mu * a) / r
    vxp, vyp = -fv * math.sin(ea), fv * math.sqrt(1 - e * e) * math.cos(ea)
    co, so, ci, si, cw, sw = math.cos(nodo), math.sin(nodo), math.cos(i), math.sin(i), math.cos(argp), math.sin(argp)
    px = np.array([co * cw - so * sw * ci, so * cw + co * sw * ci, sw * si])
    py = np.array([-co * sw - so * cw * ci, -so * sw + co * cw * ci, cw * si])
    return np.concatenate([xp * px + yp * py, vxp * px + vyp * py])


GRIGLIA = [(i, e) for i in (0.0, 90.0, 162.0, 179.9) for e in (0.0, 0.5, 0.97)]


@pytest.mark.parametrize(("i_deg", "e"), GRIGLIA)
def test_andata_e_ritorno(i_deg, e):
    rng = np.random.default_rng(int(i_deg * 10 + e * 100))
    for _ in range(20):
        a = rng.uniform(0.3, 50.0) * cst.UA_KM
        nodo, argp, m = rng.uniform(0, 2 * math.pi, 3)
        inc = math.radians(i_deg)
        el, fi = da_classici(a, e, inc, nodo, argp, m)
        assert int(fi) == (1 if i_deg <= 90 else -1)
        s = stato_da_elementi(el, MU, fi)
        rif = _stato_kepleriano(a, e, inc, nodo, argp, m, MU)
        assert np.allclose(s[:3], rif[:3], rtol=0, atol=1e-6 * a / cst.UA_KM)
        assert np.allclose(s[3:], rif[3:], rtol=0, atol=1e-10)
        # a i = 90° il segno di w_z è dominato dall'arrotondamento: I si impone
        el2, fi2 = elementi_da_stato(s, MU, fi if i_deg == 90.0 else None)
        assert int(fi2) == int(fi)
        assert el2[0] == pytest.approx(el[0], rel=1e-12)
        assert np.allclose(el2[1:5], el[1:5], rtol=0, atol=1e-12)
        assert abs(riduci_angolo(el2[5] - el[5])) < 1e-11
        s2 = stato_da_elementi(el2, MU, fi2)
        assert np.allclose(s2[:3], s[:3], rtol=0, atol=1e-5)
        assert np.allclose(s2[3:], s[3:], rtol=0, atol=1e-11)


def test_vettorializzazione_e_classici():
    rng = np.random.default_rng(5)
    n = 500
    a = rng.uniform(1e5, 1e10, n)
    e = rng.uniform(0, 0.97, n)
    inc = rng.uniform(0, math.pi, n)
    nodo, argp, m = (rng.uniform(0, 2 * math.pi, n) for _ in range(3))
    el, fi = da_classici(a, e, inc, nodo, argp, m)
    s = stato_da_elementi(el, MU, fi)
    assert s.shape == (n, 6)
    for j in (0, 17, 499):
        assert np.array_equal(s[j], stato_da_elementi(el[j], MU, fi[j]))
    cl = a_classici(el, fi)
    assert np.allclose(cl[:, 0], a, rtol=1e-15)
    assert np.allclose(cl[:, 1], e, atol=1e-15)
    assert np.allclose(cl[:, 2], inc, atol=1e-12)
    for col, rif in ((3, nodo), (4, argp), (5, m)):
        assert np.all(np.abs(riduci_angolo(cl[:, col] - rif)) < 1e-9)


def test_fattore_retrogrado():
    assert fattore_retrogrado(np.radians([0, 45, 90, 90.0001, 180])).tolist() == [1, 1, 1, -1, -1]


def test_keplero_e_lambda_non_ridotta():
    rng = np.random.default_rng(9)
    lam = rng.uniform(-1e4, 1e4, 2000)
    e = rng.uniform(0, 0.98, 2000)
    w = rng.uniform(0, 2 * math.pi, 2000)
    h, k = e * np.sin(w), e * np.cos(w)
    f = risolvi_keplero(lam, h, k)
    res = riduci_angolo(f - k * np.sin(f) + h * np.cos(f) - lam)
    assert np.max(np.abs(res)) < 1e-12
    el = np.array([1e8, 0.3, 0.4, 0.1, -0.2, 0.7])
    el2 = el.copy()
    el2[5] += 2 * math.pi * 1000
    assert np.allclose(stato_da_elementi(el, MU, 1), stato_da_elementi(el2, MU, 1), rtol=1e-12, atol=1e-5)


def test_orbita_non_ellittica_rifiutata():
    s = np.array([cst.UA_KM, 0, 0, 0, 60.0, 0])
    with pytest.raises(ValueError):
        elementi_da_stato(s, MU)


def test_lambda_continua():
    a = 0.39 * cst.UA_KM
    n = math.sqrt(MU / a**3) * cst.GIORNO_S
    t = np.arange(0, 2000, 64.0)  # passo maggiore di mezzo periodo
    vera = 0.5 + n * t
    ridotta = riduci_angolo(vera)
    assert np.allclose(lambda_continua(t, ridotta, np.full(t.size, a), MU), vera, atol=1e-9)
