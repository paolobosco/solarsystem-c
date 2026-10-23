"""Segmenti E e C dei piccoli corpi (§ 7.6.3) su traiettorie sintetiche."""

import math

import numpy as np
import pytest

from common import binio
from common import constants as cst
from small import segmenti
from small.orbite import stato_da_cometari

MU = cst.GM_SOLE


def _valutatore(q_ua, e, i, tp, disponibile=(-math.inf, math.inf)):
    def val(t):
        t = np.asarray(t, dtype=np.float64)
        if np.any(t < disponibile[0]) or np.any(t > disponibile[1]):
            raise segmenti.DatiNonDisponibili("fuori")
        s = stato_da_cometari(q_ua * cst.UA_KM, e, i, 0.7, 1.9, tp, t, MU)
        # perturbazione periodica lenta e piccola (km), per rendere finito il passo
        s[:, 0] += 2000.0 * np.sin(2 * math.pi * (t - tp) / 4000.0)
        return s

    return val


def _toll(t, r):
    return np.maximum(500.0, 1e-7 * r)


def _copertura(esiti, a, b):
    segs = [e.seg for e in esiti]
    assert segs[0].inizio == a and segs[-1].fine == b
    for s1, s2 in zip(segs, segs[1:], strict=False):
        assert s1.fine == s2.inizio
    return segs


def test_ellisse_usa_e():
    val = _valutatore(2.7, 0.1, 0.2, 2451545.0)
    a, b = 2451545.5, 2451545.5 + 6000.0
    esiti = segmenti.costruisci(a, b, val, _toll)
    segs = _copertura(esiti, a, b)
    assert all(s.tipo == binio.SEG_E for s in segs)
    assert all(e.rapporto_max <= 1.0 for e in esiti)
    t = np.linspace(a, b - 1e-6, 501)
    for s in segs:
        m = (t >= s.inizio) & (t < s.fine)
        if np.any(m):
            d = np.linalg.norm(binio.valuta_segmento(s, t[m])[:, :3] - val(t[m])[:, :3], axis=1)
            assert np.all(d <= 1.01 * _toll(t[m], np.linalg.norm(val(t[m])[:, :3], axis=1)))


def test_iperbole_usa_c():
    val = _valutatore(1.36, 6.1, 3.05, 2460977.5)
    a, b = 2460977.5 - 400.0, 2460977.5 + 400.0
    esiti = segmenti.costruisci(a, b, val, _toll)
    segs = _copertura(esiti, a, b)
    assert all(s.tipo == binio.SEG_C for s in segs)
    assert all(e.rapporto_max <= 1.0 for e in esiti)


def test_eccentricita_alta_usa_c():
    val = _valutatore(0.58, 0.985, 2.8, 2451545.0)
    a, b = 2451545.0 - 50.0, 2451545.0 + 50.0
    segs = _copertura(segmenti.costruisci(a, b, val, _toll), a, b)
    assert all(s.tipo == binio.SEG_C for s in segs)
    # al perielio il passo è più piccolo che lontano dal perielio
    vicino = [s.h for s in segs if s.inizio <= 2451545.0 < s.fine][0]
    assert vicino <= min(s.h for s in segs) * 4


def test_aloni_ai_bordi_della_sorgente():
    tp = 2451545.0
    a, b = tp, tp + 3000.0
    val = _valutatore(2.7, 0.1, 0.2, tp, disponibile=(a - 10.0, b + 10.0))
    esiti = segmenti.costruisci(a, b, val, _toll)
    segs = _copertura(esiti, a, b)
    # le celle centrali usano passi grandi nonostante gli aloni limitati ai bordi
    assert max(s.h for s in segs) >= 32.0


def test_partizione_minima():
    tratti = [(0.0, 100.0, 4.0, 1), (100.0, 104.0, 0.5, 1), (104.0, 200.0, 4.0, 1)]
    parti = segmenti.partizione(tratti)
    assert parti[0][0] == 0.0 and parti[-1][1] == 200.0
    costo = sum(segmenti._costo(p[1] - p[0], p[2], p[3]) for p in parti)
    unico = segmenti._costo(200.0, 0.5, 1)
    assert costo <= unico


@pytest.mark.parametrize("h", [1024.0, 1.0, 2.0**-6])
def test_celle_allineate(h):
    j0, j1, c0, c1 = segmenti._celle(10.25, 5000.75, h)
    assert c0[0] == 10.25 and c1[-1] == 5000.75
    assert np.all(c1[:-1] == c0[1:])


def test_sorgente_che_inizia_al_bordo():
    """Sorgente disponibile solo da a (inizio SPK al 1600): l'alone sinistro dei segmenti C è estrapolato."""
    tp = 2460977.5
    a, b = tp - 64.0, tp + 64.0
    val = _valutatore(1.36, 6.1, 3.05, tp, disponibile=(a, b))
    esiti = segmenti.costruisci(a, b, val, _toll)
    segs = _copertura(esiti, a, b)
    assert all(s.tipo == binio.SEG_C for s in segs)
    assert all(e.rapporto_max <= 1.0 for e in esiti)


def test_arrotondamento_float32_lontano_dal_sole():
    """e = 0,963 a 29 UA: l'arrotondamento Float32 di h, k sposta il corpo di centinaia di km; con
    tolleranza di 500 km i segmenti devono essere C e rispettarla anche fuori dai punti verificati."""
    q_ua, e = 0.96, 0.963
    a_ua = q_ua / (1 - e)
    per = 2 * math.pi / math.sqrt(MU / (a_ua * cst.UA_KM) ** 3) / cst.GIORNO_S
    tp = 2451545.0 - 0.5 * per + 3000.0  # 3000 d dopo l'afelio
    val = _valutatore(q_ua, e, 1.97, tp)
    a, b = 2451545.0, 2451545.0 + 256.0
    segs = _copertura(segmenti.costruisci(a, b, val, _toll), a, b)
    assert all(s.tipo == binio.SEG_C for s in segs)
    t = np.linspace(a, b - 1e-6, 2001)
    for s in segs:
        m = (t >= s.inizio) & (t < s.fine)
        d = np.linalg.norm(binio.valuta_segmento(s, t[m])[:, :3] - val(t[m])[:, :3], axis=1)
        assert np.all(d <= 500.0)


def test_punti_perielio():
    tp = 2451545.0 + 100.0
    nodi = 2451545.0 + 64.0 * np.arange(10)
    st = stato_da_cometari(0.14 * cst.UA_KM, 0.89, 0.4, 0.3, 1.1, tp, nodi, MU)
    c0, c1 = nodi[:-1], nodi[1:]
    t, i = segmenti.punti_perielio(nodi, st, c0, c1, 64.0)
    assert t.size >= 3 and np.all((t >= c0[i]) & (t < c1[i]))
    assert np.min(np.abs(t - tp)) < 1e-6


def test_r_minimo_e_pavimento_finestra():
    """Distanza minima dal Sole per intervallo di nodi (perielio tra due nodi della griglia del segmento e minimo
    al bordo di un intervallo) e parte assoluta della tolleranza della finestra sommata a ε (§ 7.6.3)."""
    from small import costruzione

    q_ua, tp = 0.33, 2451545.0 + 0.37
    val = _valutatore(q_ua, 0.85, 0.2, tp)
    a, b = tp - 300.0, tp + 300.0
    segs = [e.seg for e in segmenti.costruisci(a, b, val, _toll)]
    nodi = np.array([a, tp - 50.0, b])
    r_min = costruzione.r_minimo_nodi(segs, nodi)
    t = np.linspace(tp - 2.0, tp + 2.0, 400_001)
    vero = float(np.min(np.linalg.norm(val(t)[:, :3], axis=1)))
    assert abs(r_min[1] - vero) <= 600.0
    bordo = float(np.linalg.norm(val(np.array([tp - 50.0]))[0, :3]))
    assert abs(r_min[0] - bordo) <= 600.0
    extra = costruzione.pavimento_finestra(segs, nodi)
    assert extra == pytest.approx(500.0 / r_min - 1e-7, rel=1e-12)
    # nessun segmento nella finestra o r oltre 33 UA: nessun termine aggiuntivo
    assert np.all(costruzione.pavimento_finestra(segs, nodi + 1e6) == 0.0)
    assert costruzione.pavimento_finestra([], nodi).tolist() == [0.0, 0.0]
