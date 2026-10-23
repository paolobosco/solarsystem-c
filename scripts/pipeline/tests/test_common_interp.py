"""Lagrange a 8 punti (§ 7.3.3) e Hermite cubica (§ 8.3)."""

import math

import numpy as np
import pytest

from common.interp import (
    DENOMINATORI_LAGRANGE,
    griglia,
    hermite_cubica,
    indice_e_frazione,
    lagrange8,
    pesi_lagrange8,
    tempi_campioni,
)


def test_denominatori_e_pesi():
    assert DENOMINATORI_LAGRANGE == (-5040.0, 720.0, -240.0, 144.0, -144.0, 240.0, -720.0, 5040.0)
    u = np.linspace(0, 1, 101)
    w = pesi_lagrange8(u)
    assert np.allclose(w.sum(axis=1), 1.0, atol=1e-14)
    # nei nodi j e j+1 i pesi sono unitari
    assert np.array_equal(pesi_lagrange8(np.array([0.0]))[0], [0, 0, 0, 1, 0, 0, 0, 0])
    assert np.array_equal(pesi_lagrange8(np.array([1.0]))[0], [0, 0, 0, 0, 1, 0, 0, 0])


def test_lagrange_esatto_sui_polinomi_di_grado_7():
    rng = np.random.default_rng(1)
    c = rng.normal(size=8)
    h, t_primo, n = 0.5, -100.25, 40
    tc = tempi_campioni(t_primo, h, n)
    y = np.polyval(c, tc / 10)
    t = rng.uniform(tc[3], tc[n - 4], 300)
    assert np.allclose(lagrange8(t, t_primo, h, y)[:, 0], np.polyval(c, t / 10), rtol=1e-10, atol=1e-10)


def test_stencil_e_limiti():
    # nel nucleo [t_3, t_{N-4}) lo stencil è j-3..j+4; fuori, j è limitato a [3, N-5]
    t_primo, h, n = 10.0, 2.0, 12
    j, u = indice_e_frazione(np.array([10.0, 16.0, 17.0, 26.0, 27.999, 40.0]), t_primo, h, 3, n - 5)
    assert j.tolist() == [3, 3, 3, 7, 7, 7]
    assert u.tolist() == pytest.approx([-3.0, 0.0, 0.5, 1.0, 1.9995, 8.0])
    with pytest.raises(ValueError):
        lagrange8([0.0], 0.0, 1.0, np.zeros(7))


def test_lagrange_sul_seno():
    h = 1.0 / 8
    tc = tempi_campioni(0.0, h, 100)
    y = np.sin(tc)
    t = np.linspace(tc[3], tc[95], 1000)
    err = np.max(np.abs(lagrange8(t, 0.0, h, y)[:, 0] - np.sin(t)))
    # resto di Lagrange: h^8·max|f^(8)|/8!·max|Π(u-m)| ≈ 6,4e-11
    assert err < 6.4e-11


def test_hermite_esatto_sulle_cubiche():
    rng = np.random.default_rng(2)
    c = rng.normal(size=4)
    dc = np.polyder(c)
    h, t_primo, n = 4.0, 2460000.5, 10
    tc = tempi_campioni(t_primo, h, n)
    x = (tc - t_primo) / 7
    p = np.polyval(c, x)[:, None]
    v = (np.polyval(dc, x) / 7)[:, None]
    t = rng.uniform(tc[0], tc[-1], 200)
    xt = (t - t_primo) / 7
    pos, vel = hermite_cubica(t, t_primo, h, p, v)
    assert np.allclose(pos[:, 0], np.polyval(c, xt), atol=1e-10)
    assert np.allclose(vel[:, 0], np.polyval(dc, xt) / 7, atol=1e-10)
    # nei nodi riproduce i campioni
    pos, vel = hermite_cubica(tc, t_primo, h, p, v)
    assert np.allclose(pos, p, atol=1e-12) and np.allclose(vel, v, atol=1e-12)


def test_griglia():
    t0 = -1931200.5
    # nucleo allineato: 4 campioni fuori per lato (E)
    t_primo, n = griglia(2459999.5, 2459999.5 + 23 * 32, 32.0, 4, 3, t0)
    assert t_primo == 2459999.5 - 4 * 32 and n == 23 + 8
    assert (t_primo - t0) / 32 == math.floor((t_primo - t0) / 32)
    # nucleo non allineato (fine a T_END): il nodo finale è il primo ≥ fine
    t_primo, n = griglia(2455615.5, 2495760.5, 512.0, 4, 3, t0)
    assert t_primo + (n - 4) * 512 >= 2495760.5 > t_primo + (n - 5) * 512
    t_primo, n = griglia(2460000.5, 2460010.5, 2.0, 1, 0, t0)
    assert t_primo == 2459997.5 and t_primo + (n - 1) * 2 >= 2460010.5
