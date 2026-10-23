"""Griglia di reliability.bin (§ 8.7, common/affidabilita.py), metrica dei piccoli corpi (§ 7.6.2) e ε delle
comete a record: funzioni e dati prodotti."""

import json
import math

import numpy as np
import pytest

from common import affidabilita as ca
from common import constants as cst
from small import affidabilita as aff
from small.anagrafica import CARTELLA_OUT
from small.costruzione import _rampa_record
from small.elabora import MU
from small.orbite import cometari_da_stato, stato_da_cometari

ARCSEC = 180.0 / math.pi * 3600.0
B = ca.bordi()
JD_2026_10_19 = 2461333.0


def test_griglia():
    """Intervalli di 20 anni fino al 12/9/1980, poi di 1,25 anni; l'ultimo contiene T_END."""
    assert ca.NODI == 712 and B.size == 713 and B[0] == cst.T0
    assert np.all(np.diff(B[: ca.K_FINE + 1]) == ca.PASSO) and np.all(np.diff(B[ca.K_FINE :]) == ca.PASSO_FINE)
    assert B[ca.K_FINE] == ca.T_FINE == 2444494.5 and ca.PASSO_FINE == 456.5625
    assert B[-2] == 2495629.5 < cst.T_END < B[-1]
    assert ca.intervallo([cst.T0, ca.T_FINE - 1e-6, ca.T_FINE, cst.T_END]).tolist() == [0, 598, 599, 711]
    assert ca.intervallo([cst.T0 - 1.0, B[-1]]).tolist() == [-1, -1]
    # la data attuale sta in un intervallo di 1,25 anni, non in 2020,7-2040,7
    j = int(ca.intervallo(JD_2026_10_19)[0])
    assert B[j + 1] - B[j] == ca.PASSO_FINE and B[j] <= JD_2026_10_19 < B[j + 1] < 2462000.0
    assert aff.nodi().tolist() == B.tolist() and aff.N_NODI == ca.NODI


def test_valuta_a_gradini():
    v = np.arange(ca.NODI, dtype=np.float64)
    assert ca.valuta(v, [B[10], B[11] - 1e-6, B[650] + 1.0, cst.T_END]).tolist() == [10.0, 10.0, 650.0, 711.0]
    assert np.isnan(ca.valuta(v, [cst.T0 - 1.0, B[-1]])).all()


def test_tempi_campionamento():
    """Cloni campionati ogni 10 anni fino al 1900,7, poi ogni 1,25 anni; ogni nodo della griglia è campionato."""
    indietro, avanti = aff.tempi_campionamento(2461200.5)
    t = np.sort(np.concatenate([indietro, avanti]))
    assert np.allclose(np.diff(t[t <= aff.T_CAMPIONI_FINI]), 0.5 * ca.PASSO)
    assert np.allclose(np.diff(t[(t >= aff.T_CAMPIONI_FINI) & (t < B[-2])]), aff.PASSO_CAMPIONI_FINI)
    assert set(B[B <= cst.T_END].tolist()) <= set(t.tolist()) | {2461200.5}


def test_per_eccesso():
    assert ca.per_eccesso(-3.123401) == -3.1234
    assert ca.per_eccesso(-3.12341) == -3.1234
    assert ca.per_eccesso(-3.1234) == -3.1234


def test_metrica_errore_di_posizione():
    """Orbita quasi circolare: Δω e ΔM opposti lasciano la posizione quasi invariata; la metrica segue la
    posizione (§ 7.6.2), non |ΔM| (prima: 0,01 rad per uno spostamento di 2e-5·r)."""
    tp = 2451545.0
    t = tp + 3000.0
    q = 44.0 * cst.UA_KM
    e = 0.001
    s0 = stato_da_cometari(q, e, 0.04, 2.6, 3.0, tp, np.array([t]), MU)
    n = math.sqrt(MU / (q / (1.0 - e)) ** 3) * 86400.0
    d = 0.01
    s1 = stato_da_cometari(q, e, 0.04, 2.6, 3.0 + d, tp + d / n, np.array([t]), MU)
    dm = cometari_da_stato(s1, t, MU)["M"][0] - cometari_da_stato(s0, t, MU)["M"][0]
    assert abs(dm) == pytest.approx(d, rel=1e-6)
    pos = np.linalg.norm(s1[0, :3] - s0[0, :3]) / np.linalg.norm(s0[0, :3])
    m = aff.metrica(s1, s0[0])[0]
    assert m == pytest.approx(pos, rel=1e-6) and m < 0.05 * d


def test_rampa_record():
    """ε nell'intervallo di un record: minimo all'apparizione, salti misurati alle giunzioni."""
    a, b = B[300] + 100.0, B[304] - 50.0
    t_ep = B[302] + 10.0
    t, e = _rampa_record(a, b, t_ep, 0.2, 1e-4, B, 0.5 * (B[:-1] + B[1:]))
    assert t[0] == a and e[0] == 0.2 and t[-1] == b - 1e-6 and e[-1] == 1e-4
    assert e[t == t_ep][0] == 1e-4 and e.min() == 1e-4
    assert np.all(np.diff(t) > 0)
    assert np.all(np.diff(e[t <= t_ep]) <= 0) and np.all(np.diff(e[t >= t_ep]) >= 0)
    assert set(B[(B > a) & (B < b)]) <= set(t)


# --- dati prodotti ---


def _frammento(nome: str) -> dict:
    p = CARTELLA_OUT / f"reliability-{nome}.json"
    if not p.exists():
        pytest.skip(f"{p.name} assente")
    d = json.loads(p.read_text(encoding="utf-8"))
    assert {k: d.get(k) for k in ca.griglia()} == ca.griglia()
    return d["corpi"]


def _eps_arcsec(serie: dict, t: float) -> float:
    v = np.array([np.nan if x is None else x for x in serie["log10eps"]])
    return float(10.0 ** ca.valuta(v, t)[0] * ARCSEC)


def test_livello_alla_data_attuale():
    """19/10/2026: ε_modello entro 1′ per i corpi che il massimo dell'intervallo 2020,7-2040,7 declassava."""
    sats = _frammento("sats")
    small = _frammento("small")
    oltre = {}
    for slug in ("io", "amaltea", "encelado", "teti", "ariel", "umbriel", "titania", "proteo"):
        if (x := _eps_arcsec(sats[slug], JD_2026_10_19)) > 60.0:
            oltre[slug] = x
    for slug in (
        "apophis",
        "19p-borrelly",
        "46p-wirtanen",
        "81p-wild-2",
        "103p-hartley-2",
        "c2023-a3-tsuchinshan-atlas",
    ):
        if (x := _eps_arcsec(small[slug], JD_2026_10_19)) > 60.0:
            oltre[slug] = x
    assert oltre == {}
    # 21P: ε all'istante dalla variante senza NG dopo il perielio del 2025 (397″), non il valore del 2040 (1 088″)
    assert _eps_arcsec(small["21p-giacobini-zinner"], JD_2026_10_19) <= 400.0


def test_transnettuniani_quasi_circolari():
    """Senza |ΔM| ε segue l'errore di posizione: Gonggong 'precisa' nel 2026, Arrokoth 'buona' nel 1735."""
    small = _frammento("small")
    assert _eps_arcsec(small["gonggong"], JD_2026_10_19) <= 60.0
    assert _eps_arcsec(small["arrokoth"], 2355000.5) <= 3600.0


def test_109p_all_apparizione_del_1737():
    """Record SAO/1737 di 109P: ε piccolo all'apparizione, non il salto del 906 (12,25°)."""
    small = _frammento("small")
    for t in (2341972.5, 2355000.5):
        assert _eps_arcsec(small["109p-swift-tuttle"], t) <= 3600.0
