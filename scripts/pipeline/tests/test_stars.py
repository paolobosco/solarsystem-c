"""Stelle: lettura dei cataloghi, moto spaziale, formato di stars.bin (stars.py)."""

import json
import math

import numpy as np
import pytest

import stars as st
from common import binio
from common import constants as cst
from common.frames import MATRICE_ICRF_A_ECLITTICA


def _cache_presente() -> bool:
    try:
        for nome in st.GRANDI:
            st._file_grande(nome)
    except (FileNotFoundError, KeyError):
        return False
    return True


# Riga di HR 2491 (Sirio) da V/50 catalog.gz
RIGA_SIRIO = (
    "2491  9Alp CMaBD-16 1591  48915151881 257I   5423           064044.6-163444064508.9-164258227.22-08."
    "88-1.46   0.00 -0.05 -0.03   A1Vm               -0.553-1.205 +.375-008SBO    13 10.3  11.2AB   4*"
)


def test_lettura_riga_bsc():
    (s,) = st.leggi_bsc([RIGA_SIRIO])
    assert (s.hr, s.hd, s.v, s.bv, s.rv) == (2491, 48915, -1.46, 0.0, -8.0)
    assert math.degrees(s.ra) * 3600 == pytest.approx((6 * 3600 + 45 * 60 + 8.9) * 15, abs=1e-6)
    assert math.degrees(s.dec) == pytest.approx(-(16 + 42 / 60 + 58 / 3600), abs=1e-12)
    assert s.pmra == pytest.approx(-0.553 * st.ARCSEC) and s.pmdec == pytest.approx(-1.205 * st.ARCSEC)


def test_formato_andata_e_ritorno():
    r1 = st.Record(1, np.array([1.0, 0.0, 0.0]), 2.5, np.array([1e-5, 2e-5, -3e-5]), 1.5, 0.3, st.FLAG_MOTO_3D, "x")
    r2 = st.Record(9110, np.array([0.0, 0.6, 0.8]), 0.0, np.zeros(3), 6.5, float("nan"), 0, "y")
    dati = st.scrivi_stars_bin([r1, r2])
    assert len(dati) == 64 + 80 and dati[:8] == b"SSSTAR01"
    i = binio.leggi_intestazione(dati)
    assert (i.tipo, i.blocco, i.n_voci, i.inizio, i.fine) == (6, -1, 2, cst.T0, cst.T_END)
    s = st.leggi_stars_bin(dati)
    assert list(s["HR"]) == [1, 9110] and list(s["flag"]) == [1, 0]
    assert np.isnan(s["BV"][1]) and s["d"][0] == 2.5
    with pytest.raises(binio.ErroreFormato):
        st.leggi_stars_bin(dati[:-8])


def test_direzione_alla_data():
    u = np.array([1.0, 0.0, 0.0])
    v = np.array([0.0, 1e-3, 0.0])
    # moto 3D: d·u + v·Δt
    x = st.direzione_alla_data(u, 10.0, v, st.FLAG_MOTO_3D, 1000.0)
    assert np.allclose(x, np.array([10.0, 1.0, 0.0]) / math.hypot(10.0, 1.0))
    # lineare angolare: u + v·Δt
    y = st.direzione_alla_data(u, 10.0, v, st.FLAG_LINEARE_ANGOLARE, 1000.0)
    assert np.allclose(y, np.array([1.0, 1.0, 0.0]) / math.sqrt(2.0))
    assert np.array_equal(st.direzione_alla_data(u, 0.0, v, 0, 1e4), u)


def test_record_3d_contro_erfa_starpm():
    """Stella sintetica a 5 pc: la formula lineare del § 8.8 segue starpm entro 0,05″ in 100 anni.

    Lo scarto residuo (0,017″) è la correzione del tempo luce applicata da starpm e non dal modello rettilineo.
    """
    erfa = pytest.importorskip("erfa")
    s = st.StellaBsc(1, 1, 1.0, 0.3, 1.0, 0.5, None, None, 30.0)
    h = st.StellaHip(1, 1.0, 0.3, 200.0, 1500.0, -800.0, 1.0, 0.5)
    r = st.record_3d(s, h)
    assert r.flag == st.FLAG_MOTO_3D and r.d == pytest.approx(5.0, rel=1e-3)
    pmr = h.pmra * st.MAS / math.cos(h.dec)
    jd = cst.J2000 + 100 * 365.25
    ra, dec, *_ = erfa.starpm(h.ra, h.dec, pmr, h.pmdec * st.MAS, 0.2, 30.0, st.JD_HIPPARCOS, 0.0, jd, 0.0)
    atteso = MATRICE_ICRF_A_ECLITTICA @ st.versore(ra, dec)
    stima = st.direzione_alla_data(r.u, r.d, r.v, r.flag, 100.0)
    assert st.separazione(stima, atteso) / st.ARCSEC < 0.05


def test_record_angolare_epoca():
    """Lineare angolare da J1991,25: a Δt = -8,75 anni si ritrova la posizione Hipparcos."""
    s = st.StellaBsc(2, 2, 2.0, -0.5, 3.0, None, None, None, None)
    h = st.StellaHip(2, 2.0, -0.5, -1.0, 300.0, 400.0, 2.0, None)
    r = st.record_angolare_hip(s, h)
    assert r.flag == st.FLAG_LINEARE_ANGOLARE and r.d == 0.0
    x = st.direzione_alla_data(r.u, r.d, r.v, r.flag, -st.ANNI_HIP_J2000)
    assert st.separazione(x, MATRICE_ICRF_A_ECLITTICA @ st.versore(h.ra, h.dec)) < 1e-15


def test_colore_riferimento():
    assert st.temperatura_da_bv(0.65) == pytest.approx(5778, abs=2)
    cmf = st.leggi_cmf()
    assert cmf.shape == (471, 4) and cmf[0, 0] == 360.0
    bianco = st.srgb_lineare_corpo_nero(6504.0, cmf)
    assert np.all(bianco > 0.9)
    rosso = st.srgb_lineare_corpo_nero(3000.0, cmf)
    assert rosso[0] == 1.0 and rosso[2] < 0.3


def test_validazione_registrata():
    v = json.loads(st.FILE_VALIDAZIONE.read_text(encoding="utf-8"))
    assert v["stelle"] == 9096 and v["byte"] == 64 + 40 * 9096
    assert sum(v["origini"].values()) == 9096
    assert v["origini"]["hip-3d"] > 8000
    assert v["separazioneBscHipArcsec"]["p99"] < 5.0
    assert v["moto3dControStarpmArcsec"]["-9999"] < 60.0
    assert v["arrotondamentoFloat32Arcsec"] < 0.02


def test_file_pubblicato():
    dati = st.FILE_STELLE.read_bytes()
    s = st.leggi_stars_bin(dati)
    assert len(s["HR"]) == 9096 and len(set(s["HR"].tolist())) == 9096
    n = np.linalg.norm(s["u"].astype(np.float64), axis=1)
    assert np.all(np.abs(n - 1.0) < 1e-6)
    assert np.all((s["flag"] & st.FLAG_MOTO_3D == 0) | (s["d"] > 0))
    # Arturo (HR 5340): 11,3 pc, velocità spaziale circa 122 km/s
    i = int(np.nonzero(s["HR"] == 5340)[0][0])
    assert s["d"][i] == pytest.approx(11.26, abs=0.05)
    km_s = float(np.linalg.norm(s["v"][i])) * st.AU_PER_PC * cst.UA_KM / (365.25 * 86400.0)
    assert km_s == pytest.approx(122.0, abs=2.0)
    f = json.loads((st.CARTELLA_FIXTURE / "stelle.json").read_text(encoding="utf-8"))
    assert f["sha256"] == st.ph.sha256_bytes(dati)


@pytest.mark.skipif(not _cache_presente(), reason="cataloghi assenti dalla cache")
def test_rigenerazione_identica(tmp_path, monkeypatch):
    rec, _ = st.costruisci()
    assert st.scrivi_stars_bin(rec) == st.FILE_STELLE.read_bytes()
