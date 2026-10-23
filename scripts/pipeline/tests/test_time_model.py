"""Modello del tempo: ΔT e σ (§ 6.4, § 6.5, A3), equazione delle origini (§ 7.7, A8), time.json (§ 8.9)."""

import json
import math

import numpy as np
import pytest

import time_model as tm
from common import constants as cst
from common.manifest import sha256_file


@pytest.fixture(scope="module")
def modello():
    return tm.costruisci_modello()


def test_sorgenti_congelate():
    s = json.loads(tm.FILE_SORGENTI.read_text(encoding="utf-8"))
    assert s["s15"]["sha256"] == sha256_file(tm.FILE_S15_NPZ) == tm.sha256_s15()
    assert s["s15"]["sha256Ruota"] == tm.SHA256_SKYFIELD
    assert s["c04"]["sha256Estratto"] == sha256_file(tm.FILE_C04_ESTRATTO)
    assert s["secondiIntercalari"]["sha256"] == sha256_file(tm.FILE_SECONDI_INTERCALARI)
    assert s["taiUtc"]["sha256"] == sha256_file(tm.FILE_TAI_UTC)
    assert s["deltaTStoricoUsno"]["sha256"] == sha256_file(tm.FILE_DELTAT_STORICO)
    assert s["c04"]["ultimoGiorno"] == "2026-09-18"


def test_tabella_s15():
    tab = tm.leggi_s15()
    c = tm.verifica_tabella_s15(tab)
    assert c["intervalli"] == 58 and c["primoNodo"] == -720.0 and c["ultimoNodo"] == 2019.0
    assert list(tab[0]) == [-720.0, -100.0, 20371.848, -9999.586, 776.247, 409.16]
    assert c["saltoMassimoAiNodi_s"] <= 0.0011
    assert np.allclose(tab, tm.tabella_s15_da_testo(tm.FILE_S15_TXT.read_text(encoding="utf-8")), rtol=0, atol=0)
    rotta = tab.copy()
    rotta[0, 2] = 20371.0
    with pytest.raises(ValueError):
        tm.verifica_tabella_s15(rotta)


def test_secondi_intercalari():
    assert tm.tai_meno_utc(41317.0) == 10.0
    assert tm.tai_meno_utc(57753.9) == 36.0
    assert tm.tai_meno_utc(61301.0) == 37.0
    # dal 1972 tai-utc.dat (USNO) e Leap_Second.dat (IERS) coincidono
    for inizio, a, _, b in tm.formule_tai_utc():
        if inizio >= 41317.0:
            assert b == 0.0 and tm.tai_meno_utc(inizio) == a


def test_tai_meno_utc_1961_1971():
    # USNO tai-utc.dat (uguale a IERS UTC-TAI.history): formule lineari in MJD prima del 1972
    assert tm.tai_meno_utc(37300.0) == pytest.approx(1.4228180, abs=1e-9)
    assert tm.tai_meno_utc(37665.0) == pytest.approx(1.8458580, abs=1e-9)
    assert tm.tai_meno_utc(38556.0) == pytest.approx(3.3401300 + (38556 - 38761) * 0.001296, abs=1e-9)
    assert tm.tai_meno_utc(41316.0) == pytest.approx(4.2131700 + (41316 - 39126) * 0.002592, abs=1e-9)
    assert tm.tai_meno_utc(41317.0) == 10.0
    with pytest.raises(ValueError):
        tm.tai_meno_utc(37299.0)


def _rapporti_c04(m, da: int, a: int) -> np.ndarray:
    """(ΔT del modello - ΔT IERS)/σ ai valori mensili congelati di EOP 20 C04 negli anni [da, a]."""
    righe = tm.leggi_c04(tm.FILE_C04_ESTRATTO.read_text(encoding="utf-8"))
    out = []
    for r in righe:
        if da <= r.anno <= a:
            jd = r.mjd + 2400000.5 + r.ut1_utc / tm.GIORNO_S
            iers = tm.TT_MENO_TAI + tm.tai_meno_utc(r.mjd) - r.ut1_utc
            out.append((m.delta_t(jd) - iers) / m.sigma(jd))
    return np.asarray(out)


def test_sigma_1962_1971_coerente_con_c04(modello):
    # nel 1962-1971 la S15.2020 è più bassa dei valori IERS fino a 0,68 s: σ a 1 sigma deve coprire lo scarto
    q = _rapporti_c04(modello, 1962, 1971)
    assert q.size == 120
    assert np.max(np.abs(q)) <= 2.0
    assert np.sqrt(np.mean(q * q)) <= 1.2


# IERS Rapid Service/Prediction Centre, finals.daily.iau2000.txt (https://datacenter.iers.org/data/latestVersion/
# finals.daily.iau2000.txt), consultato il 19/10/2026: MJD e UT1 - UTC (s) con flag I (osservati) dopo l'ultimo
# valore C04 (2026-09-18); TAI - UTC = 37 s.
UT1_UTC_RAPIDI = (
    (61305.0, -0.0113932),
    (61310.0, -0.0178468),
    (61312.0, -0.0206339),
    (61320.0, -0.0272589),
    (61331.0, -0.0384323),
    (61332.0, -0.0392174),
)


def test_sigma_dopo_y_obs_coerente_con_iers_rapido(modello):
    m = modello
    for mjd, dut1 in UT1_UTC_RAPIDI:
        jd = mjd + 2400000.5 + dut1 / tm.GIORNO_S
        iers = tm.TT_MENO_TAI + 37.0 - dut1
        assert jd > tm.jd_da_anno(m.y_obs)
        assert abs(m.delta_t(jd) - iers) <= 2.0 * m.sigma(jd), mjd


def test_valori_di_controllo_delta_t(modello):
    m = modello
    assert m.da_anno(-720.0) == pytest.approx(20371.85, abs=0.01)
    assert m.delta_t(cst.JD_MIN_UT) == pytest.approx(438384.2, abs=0.1)
    assert m.pre_delta == pytest.approx(-0.49, abs=0.005)
    assert m.dt_obs == pytest.approx(69.19, abs=0.01)
    assert m.y_obs == pytest.approx(2026.712, abs=0.001)
    assert m.da_anno(2120.0) == pytest.approx(97.5, abs=0.1)
    # parabola di Stephenson et al. 2016 a -9999: 454 053 s (§ 6.4)
    c = tm.controlli_delta_t(m)
    assert c["parabola_SMH2016_meno9999"] == pytest.approx(454053, abs=5)
    # pendenze a -720: -16,0 (parabola) e -16,1 s/anno (S15)
    assert c["pendenza_parabola_meno720"] == pytest.approx(-16.0, abs=0.05)
    assert c["pendenza_s15_meno720"] == pytest.approx(-16.1, abs=0.05)


def test_continuita(modello):
    m = modello
    eps = 1e-9
    for y in (-720.0, 2019.0, 2020.0, m.y_obs):
        assert abs(m.da_anno(y + eps) - m.da_anno(y - eps)) < 0.01
    for y in (2019.0, 2020.0, m.y_obs):
        assert abs(m.da_anno(y + eps) - m.da_anno(y - eps)) < 1e-6


def test_iers(modello):
    m = modello
    assert m.iers_anni[0] < 2019.0 < m.iers_anni[1]
    assert np.all(np.diff(m.iers_anni) > 0)
    # ΔT = 32,184 + 37 - (UT1 - UTC) dal 2017
    assert np.all(np.abs(m.iers_valori - 69.184) < 0.9)
    for y, v in zip(m.iers_anni, m.iers_valori, strict=True):
        if y >= 2020.0:
            assert m.da_anno(float(y)) == v


def test_sigma(modello):
    m = modello
    assert m.sigma_da_anno(-9999.0) == pytest.approx(103005, rel=0.01)
    assert m.sigma(cst.JD_MIN_UT) == pytest.approx(103005, rel=0.01)
    assert m.sigma_da_anno(-5000.0) == pytest.approx(25653, rel=0.01)
    assert m.sigma_da_anno(-3000.0) == pytest.approx(8978, rel=0.01)
    assert m.sigma_da_anno(-1000.0) == pytest.approx(638, rel=0.01)
    assert m.sigma_da_anno(2120.0) == pytest.approx(47, rel=0.02)
    assert tm.controlli_delta_t(m)["annoIndeterminazione"] == -4594.0


def test_sigma_era_telescopica_e_periodo_misurato(modello):
    m = modello
    # 0,8·u² fino al 1200 (Morrison e Stephenson 2004), poi i valori dell'era telescopica
    assert m.sigma_da_anno(1200.0) == pytest.approx(31.25, abs=1e-9)
    assert m.sigma_da_anno(1450.0) == pytest.approx(20.0, abs=1e-9)
    assert m.sigma_da_anno(1700.0) == pytest.approx(5.0, abs=1e-9)
    assert m.sigma_da_anno(1800.0) == pytest.approx(1.0, abs=1e-9)
    assert m.sigma_da_anno(1825.0) > 0.5
    # periodo misurato: scarto quadratico medio del modello da EOP 20 C04
    assert m.sigma_s15 == pytest.approx(0.114, abs=0.001)
    assert m.sigma_iers == pytest.approx(0.0017, abs=0.0001)
    assert m.sigma_s15_iniziale == pytest.approx(0.4545, abs=0.0001)
    for y in (1900.0, 1950.0, 1964.5):
        assert m.sigma_da_anno(y) == m.sigma_s15_iniziale
    assert m.sigma_da_anno(2000.0) == m.sigma_s15
    assert m.sigma_da_anno(2026.5) == m.sigma_iers
    # dopo y_obs la deriva dall'eccesso di LOD (0,54 ms/d) domina Huber per circa 15 anni
    assert m.lod_rms == pytest.approx(0.000539, abs=1e-6)
    assert m.sigma(2461332.5) == pytest.approx(0.0167, abs=0.0001)  # 19/10/2026
    assert m.sigma_da_anno(2030.0) == m.deriva(2030.0 - m.y_obs)
    assert m.sigma_da_anno(2050.0) == m.huber(2050.0 - m.y_obs)
    eps = 1e-9
    for y in (-500.0, *m.storico_anni, *m.raccordo_s15, 2019.0, 2020.0, m.y_obs):
        assert abs(m.sigma_da_anno(y + eps) - m.sigma_da_anno(y - eps)) < 1e-6


@pytest.mark.skipif(not (tm.CARTELLA_CACHE_TEMPO / tm.NOME_C04).exists(), reason="serie C04 completa assente da .cache")
def test_scarti_c04_registrati(modello):
    righe = tm.leggi_c04((tm.CARTELLA_CACHE_TEMPO / tm.NOME_C04).read_text(encoding="utf-8"))
    sc = tm.scarti_modello_c04(modello, righe)
    assert sc["s15Iniziale"]["rms_s"] == modello.sigma_s15_iniziale
    assert sc["s15"]["rms_s"] == modello.sigma_s15
    assert sc["iers"]["rms_s"] == modello.sigma_iers
    assert sc["s15Iniziale"]["maxAss_s"] < 0.7
    assert sc["s15"]["maxAss_s"] < 0.3 and sc["iers"]["maxAss_s"] < 0.006
    assert tm.lod_ultimo_anno(righe)["rms_s"] == modello.lod_rms
    # prova retrospettiva della σ dopo y_obs (1975-2026): scarti entro 2σ in almeno il 95 % dei casi
    for voce in tm.prova_deriva(modello, righe, passo=30).values():
        assert voce["entro2Sigma"] >= 0.95 and 0.5 <= voce["entro1Sigma"] <= 0.9


def test_confronto_usno_storico(modello):
    # prima del 1962 la S15.2020 dista dalla tabella storica USNO quanto nel 1962-1971 dalla serie C04
    c = tm.confronto_usno_storico(modello)
    assert c["1900-1962"]["rms_s"] == pytest.approx(modello.sigma_s15_iniziale, rel=0.05)
    assert c["1962-1972"]["rms_s"] == pytest.approx(modello.sigma_s15_iniziale, rel=0.05)


def test_ut_da_tt(modello):
    m = modello
    for jd_ut in (cst.JD_MIN_UT, -5e5, cst.J2000, cst.JD_MAX_UT_EXCL):
        jd_tt = jd_ut + m.delta_t(jd_ut) / tm.GIORNO_S
        assert abs(tm.ut_da_tt(m, jd_tt) - jd_ut) < 1e-9
    assert tm.controlli_delta_t(m)["ttMin"] == pytest.approx(-1931071.43, abs=0.005)


def test_eo_valori_di_controllo():
    c = tm.controlli_eo()
    d = c["gstMenoGmst06_gradi"]
    assert d["-10000.0"] == pytest.approx(-0.067, abs=0.005)
    assert d["-5000.0"] == pytest.approx(-0.012, abs=0.001)
    assert c["gstMenoGmst06_0_2121_maxAss_gradi"] < 0.001
    assert c["gstMenoGmst06_1600_2200_maxAss_gradi"] <= 0.001
    assert c["erroreInterpolazioneMax_rad"] < 1e-12


def test_eo_tabella():
    tab = tm.tabella_eo()
    assert tab.tempi.size == tm.N_NODI_EO == 1214
    assert tab.tempi[0] == cst.T0 and tab.tempi[-1] >= cst.T_END
    assert np.all(np.abs(np.diff(tab.valori)) < 0.1)
    # derivata a J2000 ≈ -4612,16″ per secolo (GMST06)
    j = int(np.searchsorted(tab.tempi, cst.J2000))
    assert tab.derivate[j] * 36525 * 648000 / math.pi == pytest.approx(-4612.16, abs=0.5)


def test_orientamento():
    jd_ut = 2460000.25
    jd_tt = jd_ut + 69.2 / 86400
    m = tm.orientamento_terra(jd_ut, jd_tt)
    assert np.allclose(m.T @ m, np.eye(3), atol=1e-13)
    assert np.linalg.det(m) == pytest.approx(1.0, abs=1e-13)
    polo = tm.MATRICE_ICRF_A_ECLITTICA @ tm.polo_xyz(tm.epj_da_jd(jd_tt))
    assert np.allclose(m[:, 2], polo, atol=1e-15)


def test_time_json_rigenerato_identico():
    atteso = tm.testo_json(tm.dati_time_json())
    assert tm.PERCORSO_TIME_JSON.read_text(encoding="utf-8") == atteso
    d = json.loads(atteso)
    assert d["formato"] == 1
    assert d["deltaT"]["s15"]["coeff"][0] == [20371.848, -9999.586, 776.247, 409.16]
    assert d["deltaT"]["s15"]["nodi"][0] == [-720.0, -100.0]
    assert len(d["eo"]["valori"]) == len(d["eo"]["derivate"]) == 1214
    m = tm.modello_da_json(d)
    for jd in np.linspace(cst.JD_MIN_UT, cst.JD_MAX_UT_EXCL, 101):
        assert m.delta_t(float(jd)) == tm.costruisci_modello().delta_t(float(jd))


def test_fixture_rigenerate_identiche(tmp_path):
    tm.genera_fixture(tmp_path, con_de441=False)
    for nome in ("deltaT.json", "rotazione.json"):
        assert (tmp_path / nome).read_text(encoding="utf-8") == (tm.CARTELLA_FIXTURE / nome).read_text(encoding="utf-8")


def test_confronto_horizons_tdb_ut(modello):
    conf = tm.confronto_horizons_tdb_ut(modello)
    assert len(conf) == len(tm.anni_tdb_ut())
    for r in conf:
        if "differenzaUt1" in r and r["anno"] >= 2020.0:
            assert abs(r["differenzaUt1"]) < 0.01
    # prima del 1962 Horizons supera il modello: fino a 77 s in -720/1962, fino allo 0,4 % prima (docs/_parti/tempo.md)
    for r in conf:
        if r["anno"] < -720.0:
            assert 0.0 <= -r["differenza"] <= 0.004 * r["horizons"]
        elif r["anno"] < 1962.0:
            assert 0.0 <= -r["differenza"] <= 77.0


def test_frammento_catalogo():
    f = tm.frammento_catalogo()
    assert f["area"] == "tempo"
    assert f["corpi"]["terra"]["orientamento"]["modello"] == "vondrak"
