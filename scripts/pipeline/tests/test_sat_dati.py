"""Satelliti: sistema F, dati fisici, Disnomia (Holler et al. 2021) contro le misure della tabella 1."""

from __future__ import annotations

import math

import numpy as np
import pytest

from common.frames import MATRICE_ICRF_A_ECLITTICA
from sats import disnomia, fisica, secolare, sistema
from sats.anagrafica import arco, arco_predefinito, satelliti
from sats.costanti import gm_kernel


def test_matrice_f_ortonormale_e_nodo_sull_equatore() -> None:
    rng = np.random.default_rng(1)
    for _ in range(20):
        p = rng.normal(size=3)
        m = sistema.matrice_f_icrf(p)
        assert np.allclose(m.T @ m, np.eye(3), atol=1e-14)
        assert np.allclose(m[:, 2], p / np.linalg.norm(p), atol=1e-14)
        assert abs(m[2, 0]) < 1e-14  # asse x sull'equatore ICRF
        assert np.linalg.det(m) == pytest.approx(1.0)
    rf = sistema.matrice_rf(np.array([0.0, 0.0, 1.0]))
    assert np.allclose(rf, MATRICE_ICRF_A_ECLITTICA, atol=1e-15)


def test_polo_di_laplace_da_cono_sintetico() -> None:
    asse = np.array([0.3, -0.2, 0.93])
    asse /= np.linalg.norm(asse)
    m = sistema.matrice_f_icrf(asse)
    nodo = np.linspace(0, 2 * math.pi, 500)
    i = math.radians(2.0)
    w_f = np.stack([math.sin(i) * np.sin(nodo), -math.sin(i) * np.cos(nodo), np.full_like(nodo, math.cos(i))], axis=1)
    w = w_f @ m.T
    polo, diag = sistema.polo_laplace(w, asse)
    assert diag["metodo"] == "piano"
    assert np.linalg.norm(np.cross(polo, asse)) < 1e-10
    assert diag["inclinazioneMediaGradi"] == pytest.approx(2.0, abs=1e-8)
    # arco breve: direzione media
    polo, diag = sistema.polo_laplace(w[:5], -asse)
    assert diag["metodo"] == "media"
    assert polo @ asse < 0  # verso dal momento angolare di rotazione indicato


def test_dati_fisici_dalla_pagina_jpl() -> None:
    t = fisica.tabella()
    assert t[501].gm == pytest.approx(5959.91547)
    assert t[501].raggio == pytest.approx(1821.49)
    assert t[606].raggio == pytest.approx(2574.76)
    assert t[802].gm is None  # massa di Nereide non determinata
    for s in satelliti():
        if s.naif is not None:
            assert s.naif in t, s.slug
            assert t[s.naif].raggio > 0


def test_gm_dai_kernel() -> None:
    assert gm_kernel("jup365.bsp")[501] == pytest.approx(5959.915466180539)
    assert gm_kernel("plu060.bsp")[0] == pytest.approx(975.4308664317557)
    assert gm_kernel("sat441.bsp")[699] == pytest.approx(37931206.23436167)


def test_archi_osservativi() -> None:
    assert arco(501) == (1900.0, 2020.0)
    assert arco(902) == (2005.0, 2020.0)
    assert arco(705) == (1948.0, 2020.0)
    # archi noti: Fobos e Deimos dal 1877 al 2019 (MAR099); la finestra di F resta sull'arco predefinito
    assert arco(401) == arco(402) == (1877.0, 2019.0)
    assert arco_predefinito(401) == (1900.0, 2020.0)


def test_sigma_ndot_misurata_per_fobos_altrove_i12() -> None:
    n_fobos = math.radians(1128.8445)  # rad/d
    # Fobos: σ_ṅ = 2·0,058·10⁻³ °/anno² (MAR099); con I12 sarebbe 1e-9·n = 4,12·10⁻⁴ °/anno², 3,6 volte di più
    assert secolare.sigma_ndot(401, n_fobos) == pytest.approx(math.radians(1.16e-4))
    assert secolare.sigma_ndot(402, n_fobos) == pytest.approx(1e-9 * n_fobos * 365.25)
    assert math.degrees(secolare.sigma_ndot(402, n_fobos)) == pytest.approx(4.123e-4, rel=1e-3)
    assert secolare.sigma_ndot(None, 1.0) == pytest.approx(1e-9 * 365.25)
    # dal 1877 al 1600: ½·τ²·σ_ṅ = 277²·0,058·10⁻³ = 4,45° (con I12: 15,8°)
    eps = secolare.estrapolazione(0.0, secolare.sigma_ndot(401, n_fobos), 277.0)
    assert math.degrees(eps) == pytest.approx(4.4503, abs=1e-4)


def test_disnomia_riproduce_la_tabella_1_con_il_tempo_luce() -> None:
    """Offset di Disnomia da Eris (Holler et al. 2021, tabella 1) con posizioni all'istante di emissione."""
    r = disnomia.verifica_offset(offline=True)
    assert r["conTempoLuce"]["rmsSigma"] < 2.5
    assert r["conTempoLuce"]["maxMas"] < 20.0
    assert r["senzaTempoLuce"]["rmsSigma"] > 10.0
    assert r["tempoLuceGiorni"] == pytest.approx(0.556, abs=0.005)


def test_disnomia_polo_e_periodo() -> None:
    p = disnomia.polo_icrf()
    # polo dell'orbita della tabella 2: α = 36,17°, δ = 44,51°
    alfa = math.degrees(math.atan2(p[1], p[0])) % 360
    delta = math.degrees(math.asin(p[2]))
    assert alfa == pytest.approx(36.17, abs=0.01)
    assert delta == pytest.approx(44.51, abs=0.01)
    rec = disnomia.record(-1e9, 1e9)
    assert 2 * math.pi / rec.n == pytest.approx(disnomia.PERIODO, rel=1e-12)
