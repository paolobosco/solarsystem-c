"""Piccoli corpi: elementi cometari, letture SBDB e Horizons, piano delle sorgenti, affidabilità."""

import json
import math

import numpy as np
import pytest

from common import constants as cst
from common.calendario import calendario_a_jd
from common.frames import eclittica_a_icrf
from small import affidabilita as aff
from small import horizons, piano, sbdb
from small.anagrafica import RAW, SB441, per_slug, piccoli_corpi
from small.orbite import cometari_da_stato, stato_da_cometari

MU = cst.GM_SOLE
GRADI = math.pi / 180.0


def test_anagrafica():
    corpi = piccoli_corpi()
    assert len(corpi) == 72
    slug = {c.slug for c in corpi}
    assert "plutone" not in slug and "cerere" in slug and "3i-atlas" in slug
    assert set(SB441) <= slug and len(SB441) == 11
    assert sum(c.cometa_periodica for c in corpi) == 14


@pytest.mark.parametrize(
    ("q_ua", "e", "i"),
    [(2.5, 0.1, 10.0), (0.58, 0.9675, 162.2), (0.0078, 0.99991, 141.9), (0.256, 1.2011, 122.7), (1.3565, 6.14, 175.1)],
)
def test_andata_e_ritorno(q_ua, e, i):
    tp = 2451545.0
    t = np.array([tp - 30.0, tp, tp + 7.3, tp + 400.0])
    s = stato_da_cometari(q_ua * cst.UA_KM, e, i * GRADI, 1.2, 4.0, tp, t, MU)
    el = cometari_da_stato(s, t, MU)
    assert np.allclose(el["q"], q_ua * cst.UA_KM, rtol=1e-11)
    assert np.allclose(el["e"], e, rtol=1e-11)
    assert np.allclose(el["i"], i * GRADI, atol=1e-11)
    assert np.allclose(el["nodo"], 1.2, atol=1e-10)
    assert np.allclose(el["argperi"], 4.0, atol=1e-10)
    if e < 1:
        p = 2 * math.pi / el["n"][0]
        dt = (el["tp"] - tp + 0.5 * p) % p - 0.5 * p
        assert np.allclose(dt, 0.0, atol=1e-6)
    else:
        assert np.allclose(el["tp"], tp, atol=1e-6)


def test_parabola():
    tp = 2451545.0
    t = np.array([tp - 10.0, tp + 3.0])
    s = stato_da_cometari(cst.UA_KM, 1.0, 0.3, 0.2, 0.1, tp, t, MU)
    r = np.linalg.norm(s[:, :3], axis=1)
    v2 = np.sum(s[:, 3:] ** 2, axis=1)
    assert np.allclose(0.5 * v2 - MU / r, 0.0, atol=1e-6)
    el = cometari_da_stato(s, t, MU)
    assert np.allclose(el["q"], cst.UA_KM, rtol=1e-9)


def test_record_contro_horizons():
    """Elementi del record 1607 (90000025) -> stato ICRF contro le coordinate stampate da Horizons."""
    testo = (RAW / "horizons" / "vettori" / "1p-halley-90000025.txt").read_text(encoding="utf-8")
    rec = horizons.leggi_record(testo.split("Ephemeris /")[0])
    s = stato_da_cometari(
        rec.q_au * cst.UA_KM,
        rec.e,
        rec.inc_deg * GRADI,
        rec.nodo_deg * GRADI,
        rec.argperi_deg * GRADI,
        rec.tp,
        rec.epoca,
        MU,
    )
    icrf = eclittica_a_icrf(s)[0]
    blocco = testo.split("Equivalent ICRF heliocentric cartesian coordinates")[1]
    attesi = [horizons._valore(blocco, k) for k in ("X", "Y", "Z", "VX", "VY", "VZ")]
    assert np.allclose(icrf[:3] / cst.UA_KM, attesi[:3], rtol=0, atol=5e-12)
    assert np.allclose(icrf[3:] * cst.GIORNO_S / cst.UA_KM, attesi[3:], rtol=0, atol=2e-13)


def test_lettura_sbdb():
    c = per_slug()["apophis"]
    sb = sbdb.leggi(c)
    o = sb.orbita
    assert sb.spkid == 20099942
    assert o.classe == "ATE"
    assert o.cov.shape == (8, 8) and o.cov_etichette[:6] == list(sbdb.ELEMENTI_COV)
    assert np.allclose(o.cov, o.cov.T)
    assert o.ng["A2"] < 0 and not o.g_standard and o.g["ALN"] == 1.0 and o.g["NK"] == 0.0
    # Apophis: covarianza al 2021 (JD 2459215,5), orbita al 2026: i cloni usano gli elementi della covarianza
    et, cov, origine = sbdb.covarianza_elementi(sbdb.orbita_covarianza(o))
    assert origine == "sbdb" and cov.shape == (8, 8)


def test_covarianza_da_arrotondamento():
    c = per_slug()["c1680-v1"]
    o = sbdb.leggi(c).orbita
    et, cov, origine = sbdb.covarianza_elementi(o)
    assert origine == "arrotondamento"
    assert et == list(sbdb.ELEMENTI_COV)
    assert math.isclose(math.sqrt(cov[0, 0]), 5e-7)
    assert sbdb.mezza_ultima_cifra("0.999986") == pytest.approx(5e-7)
    assert sbdb.mezza_ultima_cifra("2335019.9876") == pytest.approx(5e-5)
    assert sbdb.mezza_ultima_cifra("1.5E-3") == pytest.approx(5e-5)


def test_elenco_e_dati_record():
    c = per_slug()["1p-halley"]
    testo = piano.percorso_elenco(c).read_text(encoding="utf-8")
    el = horizons.elenco_record(testo)
    assert len(el) == 30 and el[0] == (90000001, -239) and el[-1] == (90000030, 1968)
    r = horizons.leggi_record(piano.percorso_record(c, 90000030).read_text(encoding="utf-8"))
    assert r.soluzione.startswith("JPL#75")
    assert r.ng["A1"] == pytest.approx(4.887055233121e-10) and r.ng["A2"] == pytest.approx(1.554720290005e-10)
    assert r.g is not None and r.g["NK"] == pytest.approx(4.6142)
    r0 = horizons.leggi_record(piano.percorso_record(c, 90000001).read_text(encoding="utf-8"))
    assert r0.e == 0.9676 and r0.q_au == 0.5854 and not r0.ha_ng


def test_piano_record_contiguo():
    c = per_slug()["1p-halley"]
    sb = sbdb.leggi(c)
    recs = piano.seleziona_record(piano.scarica_record(c, offline=True))
    cambi = piano.tempi_cambio(recs)
    for a, b, s in zip(recs, recs[1:], cambi, strict=False):
        assert a.tp < s < b.tp
    pezzi = piano.piano(c, sb, recs)
    assert pezzi[0].inizio == cst.T0 and pezzi[-1].fine == cst.T_END
    for p1, p2 in zip(pezzi, pezzi[1:], strict=False):
        assert p1.fine == p2.inizio
    assert any(p.inizio == piano.JD_1600 for p in pezzi)


def test_piano_classi():
    corpi = per_slug()
    for slug, tipi in (("cerere", ["assist", "sb441-n16", "spk-horizons"]), ("sedna", ["assist", "spk-horizons"])):
        c = corpi[slug]
        p = piano.piano(c, sbdb.leggi(c), [])
        assert [x.tipo for x in p] == tipi
        assert p[0].inizio == cst.T0 and p[-1].fine == cst.T_END
    assert piano.JD_1600 == calendario_a_jd(1600, 1, 1)


def test_cumula_e_serie():
    v = np.array([1e-6, 5e-7, 2e-6, np.nan, 1e-9])
    c = aff.cumula(v)
    assert c[:3].tolist() == [1e-6, 1e-6, 2e-6] and np.all(np.isnan(c[3:]))
    n = aff.nodi()
    assert n.size == aff.N_NODI + 1 and n[0] == cst.T0 and n[-1] > cst.T_END
    t = np.array([n[0], n[1], n[1] + 10.0, n[2]])
    e = np.array([1e-3, 1e-4, 1e-4, np.nan])
    log10, forma, dati = aff.serie_nodi(t, e, np.array([True, True, False, True]), np.ones(4, dtype=bool))
    assert log10[0] == pytest.approx(-3.0) and log10[1] is None and log10[2] is None
    assert forma[0] and not forma[1]


def test_metrica():
    tp = 2451545.0
    s = stato_da_cometari(2.5 * cst.UA_KM, 0.1, 0.2, 1.0, 2.0, tp, np.array([tp, tp]), MU)
    m = aff.metrica(s, s[0])
    assert np.allclose(m, 0.0, atol=1e-12)
    s2 = stato_da_cometari(2.5 * cst.UA_KM, 0.1, 0.2, 1.0, 2.0, tp + 10.0, np.array([tp]), MU)
    m2 = aff.metrica(s2, s[0])
    assert m2[0] > 0.01


def test_frammenti_e_fonti_letteratura():
    lett = json.loads((RAW / "fisica-letteratura.json").read_text(encoding="utf-8"))["corpi"]
    slug = {c.slug for c in piccoli_corpi()}
    assert set(lett) <= slug
    for v in lett.values():
        for campo in v.values():
            assert campo["fonte"] and campo["anno"] and campo["evidenza"]
    # Mani: occultazione di Rommel et al. 2023 (796 ± 24 km), al posto della radiometria di Vilenius et al. 2012
    # (934 ± 47 km, superata)
    mani = lett["mani"]["raggi_km"]
    assert mani["valore"] == [398, 398, 398] and "796 ± 24 km" in mani["evidenza"]
    assert mani["fonte"].startswith("Rommel et al. 2023") and "Vilenius et al. 2012, 934 ± 47 km" in mani["evidenza"]


def test_piano_record_prima_del_suo_intervallo():
    """Record più antico dopo il 1600 (9P, 1867): dal 1600 SPK dello stesso record, prima ASSIST."""
    c = per_slug()["9p-tempel-1"]
    recs = piano.seleziona_record(piano.scarica_record(c, offline=True))
    pezzi = piano.piano(c, sbdb.leggi(c), recs)
    assert pezzi[0].tipo == "assist" and pezzi[0].fine == piano.JD_1600
    assert pezzi[1].inizio == piano.JD_1600 and pezzi[1].chiave == f"spk:9p-tempel-1-{recs[0].record}"
    assert all(p.chiave.startswith("spk:") for p in pezzi[1:])
