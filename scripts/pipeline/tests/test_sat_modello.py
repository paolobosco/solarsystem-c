"""Modello a record dei satelliti (§ 7.5.2-7.5.3): valutazione, jacobiano, traslazione, raccordo, adattamento."""

from __future__ import annotations

import math

import numpy as np
import pytest

from common.equinoctial import da_classici, stato_da_elementi
from sats import adatta
from sats import modello as mod

T_REF = 2451545.0
NU = np.array([0.7, 2.1])


def _parametri(fattore_i: int) -> np.ndarray:
    t = 0.2 if fattore_i > 0 else 0.15
    return np.array([4.0e5, 0.3, 0.4, 0.01, t, 1.1, -0.003, 0.5, 3.5, 1e-7, -2e-11, 0.01, -0.02, 0.003, 0.004])


@pytest.mark.parametrize("fattore_i", [1, -1])
def test_jacobiano_contro_differenze_finite(fattore_i: int) -> None:
    x = _parametri(fattore_i)
    rng = np.random.default_rng(20261019)
    t = T_REF + rng.uniform(-50, 50, 40)
    _, jac = mod.jacobiano_posizione(x, T_REF, NU, fattore_i, t)
    for j in range(x.size):
        errori = []
        for rel in (1e-4, 1e-5, 1e-6, 1e-7):
            h = rel * max(abs(x[j]), 1e-3)
            dx = np.zeros_like(x)
            dx[j] = h
            fd = (
                mod.posizione_parametri(x + dx, T_REF, NU, fattore_i, t)
                - mod.posizione_parametri(x - dx, T_REF, NU, fattore_i, t)
            ) / (2 * h)
            errori.append(np.max(np.abs(jac[:, :, j] - fd)) / np.max(np.abs(fd)))
        assert min(errori) < 1e-7, (j, errori)


def test_posizione_coincide_con_elementi_equinoziali_senza_termini() -> None:
    """Con ϖ̇ = Ω̇ = c2 = c3 = 0 e K = 0 il record è un'orbita kepleriana: posizione uguale a § 7.2."""
    mu = 3.0e5
    a, e, i, om, w, m = 2.0e5, 0.2, math.radians(30), 0.7, 1.3, 0.4
    el, fi = da_classici(a, e, i, om, w, m)
    n = math.sqrt(mu / a**3) * 86400.0
    varpi = w + om
    x = np.array([a, e, varpi, 0.0, math.tan(i / 2), om, 0.0, float(el[5]), n, 0.0, 0.0])
    st = mod.stato_parametri(x, T_REF, np.zeros(0), 1, np.array([T_REF]))
    rif = stato_da_elementi(el, mu, fi)
    assert np.max(np.abs(st[0] - rif)) < 1e-8 * a


@pytest.mark.parametrize("fattore_i", [1, -1])
def test_record_parametri_andata_ritorno(fattore_i: int) -> None:
    x = _parametri(fattore_i)
    rec = mod.record_da_parametri(x, mod.TIPO_SPK, fattore_i, T_REF - 100, T_REF + 100, T_REF)
    t = T_REF + np.linspace(-100, 100, 17)
    a = mod.stato_record(rec, NU, t)
    b = mod.stato_parametri(x, T_REF, NU, fattore_i, t)
    assert np.max(np.abs(a - b)) < 1e-6
    assert len(rec.valori()) == 14 + 2 * rec.k


def test_traslazione_parametri_invariante() -> None:
    x = _parametri(1)
    delta = 123.456
    y = adatta.trasla_parametri(x, delta, NU)
    t = T_REF + np.linspace(-80, 80, 11)
    a = mod.posizione_parametri(x, T_REF, NU, 1, t)
    b = mod.posizione_parametri(y, T_REF + delta, NU, 1, t)
    # arrotondamento di λ (circa 300 rad) su raggi di 4e5 km
    assert np.max(np.abs(a - b)) < 1e-3


def test_raccordo_continuo_ai_confini() -> None:
    """Nel raccordo w = 3x² - 2x³: ai bordi della zona lo stato coincide con i record adiacenti."""
    x1 = _parametri(1)
    x2 = x1.copy()
    x2[7] += 1e-3  # piccolo salto
    r1 = mod.record_da_parametri(x1, 0, 1, T_REF - 3650, T_REF, T_REF - 1825)
    r2 = mod.record_da_parametri(x2, 0, 1, T_REF, T_REF + 3650, T_REF + 1825)
    lb = mod.semiampiezza_raccordo(r1, r2)
    assert lb == pytest.approx(365.0)
    eye = np.eye(3)
    t = np.array([T_REF - lb - 1e-6, T_REF - lb + 1e-6, T_REF + lb - 1e-6, T_REF + lb + 1e-6])
    st, idx = mod.stato_sequenza([r1, r2], NU, eye, t)
    assert list(idx) == [0, 0, 1, 1]
    s1 = mod.stato_record(r1, NU, t)
    s2 = mod.stato_record(r2, NU, t)
    assert np.max(np.abs(st[0, :3] - s1[0, :3])) < 1e-6
    assert np.max(np.abs(st[1, :3] - s1[1, :3])) < 1e-3
    assert np.max(np.abs(st[2, :3] - s2[2, :3])) < 1e-3
    assert np.max(np.abs(st[3, :3] - s2[3, :3])) < 1e-6
    # fuori dai record
    st, idx = mod.stato_sequenza([r1, r2], NU, eye, np.array([T_REF + 4000.0]))
    assert idx[0] == -1 and np.isnan(st[0, 0])


def test_velocita_con_raccordo_derivata_della_posizione() -> None:
    x1 = _parametri(1)
    x1[3] = 1e-4  # ϖ̇ e Ω̇ realistici (rad/d)
    x1[6] = -3e-5
    x2 = x1.copy()
    x2[7] += 2e-3
    r1 = mod.record_da_parametri(x1, 0, 1, T_REF - 3650, T_REF, T_REF - 1825)
    r2 = mod.record_da_parametri(x2, 0, 1, T_REF, T_REF + 3650, T_REF + 1825)
    t = np.array([T_REF - 100.0, T_REF + 37.0])
    h = 1e-4
    st, _ = mod.stato_sequenza([r1, r2], NU, np.eye(3), t)
    sp, _ = mod.stato_sequenza([r1, r2], NU, np.eye(3), t + h)
    sm, _ = mod.stato_sequenza([r1, r2], NU, np.eye(3), t - h)
    v = (sp[:, :3] - sm[:, :3]) / (2 * h) / 86400.0
    # la velocità del modello trascura ϖ̇ e Ω̇ (§ 7.5.2): scarto relativo piccolo
    assert np.max(np.abs(v - st[:, 3:])) / np.max(np.abs(v)) < 1e-3


@pytest.mark.parametrize("fattore_i", [1, -1])
def test_adattamento_recupera_record_sintetico(fattore_i: int) -> None:
    x = _parametri(fattore_i)
    x[0] = 3.0e5
    x[1] = 0.05
    x[8] = 0.9
    x[9] = 0.0
    x[10] = 0.0
    nu = np.array([0.05, 0.11])
    x[11:] = [1e-3, -2e-3, 5e-4, 1e-4]
    t = T_REF + np.arange(-900.0, 900.0, 0.35)
    st = mod.stato_parametri(x, T_REF, nu, fattore_i, t)
    mu = (x[8] / 86400.0) ** 2 * x[0] ** 3
    x0 = adatta.stima_iniziale(t, st, mu, fattore_i, T_REF, 2)
    es = adatta.levenberg_marquardt(x0, T_REF, nu, fattore_i, t, st[:, :3])
    assert es.rms_km < 1e-3
    r = mod.posizione_parametri(es.x, T_REF, nu, fattore_i, t)
    ang, rad = adatta.errori(r, st[:, :3])
    assert ang.max() < 1e-9 and np.abs(rad).max() < 1e-3


def test_clean_trova_frequenze_iniettate() -> None:
    t = np.arange(0.0, 4000.0, 0.5)
    y = 3e-4 * np.sin(0.13 * t + 0.4) + 1e-4 * np.cos(0.71 * t) + 1e-6 * np.sin(5.0 * t)
    picchi = adatta.clean_frequenze(t, y, 3, 0.01, 3.0)
    assert picchi[0][0] == pytest.approx(0.13, rel=1e-5)
    assert picchi[0][1] == pytest.approx(3e-4, rel=1e-3)
    assert picchi[1][0] == pytest.approx(0.71, rel=1e-5)
    # banda esclusa
    picchi = adatta.clean_frequenze(t, y, 1, 0.01, 3.0, escluse=[(0.12, 0.14)])
    assert picchi[0][0] == pytest.approx(0.71, rel=1e-5)


def test_campioni_per_orbita() -> None:
    assert adatta.campioni_per_orbita(0.0) == 20
    assert adatta.campioni_per_orbita(0.75) > 200
