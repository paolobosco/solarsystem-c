"""Dati fisici e orientamento di Sole, pianeti, Plutone e Luna (physical.py)."""

import json
import math
import re

import numpy as np
import pytest

import physical as ph
from common import constants as cst

PCK = ph.RAW / "pck00011.tpc"


@pytest.fixture(scope="module")
def pck():
    return ph.leggi_pck(PCK.read_text(encoding="latin-1"))


@pytest.fixture(scope="module")
def frammento():
    return json.loads(ph.FILE_FRAMMENTO.read_text(encoding="utf-8"))


def test_lettura_pck_sintetica():
    testo = "\n".join(
        [
            "testo libero BODY1_X = ( 9 )",
            "\\begindata",
            "BODY1_A = ( 1.5  -2D-3",
            "            3.0E+01 )",
            "BODY1_B = 7",
            "BODY1_A += ( 4 )",
            "BODY1_NOME = 'X'",
            "\\begintext",
            "BODY1_C = ( 5 )",
        ]
    )
    d = ph.leggi_pck(testo)
    assert d == {"BODY1_A": [1.5, -0.002, 30.0, 4.0], "BODY1_B": [7.0]}


def test_coefficienti_nettuno_e_giove(pck):
    n = ph.coefficienti_wgccre(pck, 899)
    assert n["alfa0"] == [299.36] and n["delta0"] == [43.46] and n["w"] == [249.978, 541.1397757]
    per = {p["coordinata"]: p for p in n["periodici"]}
    assert per["alfa0"] == {
        "coordinata": "alfa0",
        "funzione": "sin",
        "ampiezza": 0.70,
        "argomento": [357.85, 52.316],
        "unita": "secolo",
    }
    assert per["delta0"]["funzione"] == "cos" and per["delta0"]["ampiezza"] == -0.51
    g = ph.coefficienti_wgccre(pck, 599)
    assert len([p for p in g["periodici"] if p["coordinata"] == "alfa0"]) == 5
    # Ja = 99.360714 + 4850.4046 T (Archinal et al. 2018, tabella 1)
    assert any(p["argomento"] == [99.360714, 4850.4046] for p in g["periodici"])


def test_angolo_quadratico_rifiutato(pck):
    with pytest.raises(ValueError, match="quadratico"):
        ph.coefficienti_wgccre({**pck, "BODY499_NUT_PREC_RA": [0.0] * 4 + [1.0]}, 499)


@pytest.mark.parametrize(
    ("naif", "frame"),
    [
        (10, "IAU_SUN"),
        (199, "IAU_MERCURY"),
        (299, "IAU_VENUS"),
        (499, "IAU_MARS"),
        (599, "IAU_JUPITER"),
        (699, "IAU_SATURN"),
        (799, "IAU_URANUS"),
        (899, "IAU_NEPTUNE"),
        (999, "IAU_PLUTO"),
    ],
)
def test_modello_contro_spice(pck, naif, frame):
    """Matrice corpo -> ICRF uguale a quella di SPICE (pxform) con lo stesso PCK, su tutto l'intervallo."""
    sp = pytest.importorskip("spiceypy")
    sp.furnsh(str(PCK))
    try:
        c = ph.coefficienti_wgccre(pck, naif)
        rng = np.random.default_rng(7)
        epoche = np.concatenate([[cst.J2000, cst.T0 + 1.0, cst.T_END - 1.0], rng.uniform(cst.T0, cst.T_END, 30)])
        scarti = []
        for jd in epoche:
            m_spice = np.array(sp.pxform(frame, "J2000", (jd - cst.J2000) * cst.GIORNO_S))
            m = ph.matrice_corpo_icrf(*ph.angoli_wgccre(c, jd))
            scarti.append(np.abs(m - m_spice).max())
            if abs(jd - cst.J2000) < 36525.0:
                assert scarti[-1] < 2e-10
        # lontano da J2000 W supera 1e9 gradi: l'arrotondamento in doppia precisione vale circa 1e-8 rad
        assert max(scarti) < 5e-8
    finally:
        sp.kclear()


def test_matrice_ortonormale_e_polo():
    m = ph.matrice_corpo_icrf(257.311, -15.175, 123.4)
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-15)
    assert np.linalg.det(m) == pytest.approx(1.0, abs=1e-15)
    assert np.allclose(m[:, 2], ph.polo_icrf(257.311, -15.175), atol=1e-15)
    # con W = 0 il meridiano 0 passa per il nodo ascendente dell'equatore (α0 + 90°)
    m0 = ph.matrice_corpo_icrf(10.0, 20.0, 0.0)
    q = math.radians(100.0)
    assert np.allclose(m0[:, 0], [math.cos(q), math.sin(q), 0.0], atol=1e-15)


def test_frammento_campi_e_aree(frammento):
    c = frammento["corpi"]
    assert frammento["area"] == "phys"
    assert set(c) == set(ph.CORPI)
    for slug, v in c.items():
        assert set(v) <= {"fisica", "orientamento", "anelli"}
        assert ("orientamento" in v) == (slug != "terra")
    assert c["luna"]["orientamento"]["modello"] == "cassini"
    assert c["plutone"]["orientamento"]["convenzionePolo"] == "momento-angolare"
    assert c["urano"]["orientamento"]["convenzionePolo"] == "nord-IAU"
    assert c["urano"]["orientamento"]["coefficienti"]["alfa0"] == [257.311]
    assert c["urano"]["orientamento"]["coefficienti"]["delta0"] == [-15.175]


# Periodi siderali di JPL "Planetary Physical Parameters" (giorni) e inclinazioni assiali note (gradi).
PERIODI_JPL = {
    "mercurio": 58.6462,
    "venere": -243.018,
    "terra": 0.99726968,
    "marte": 1.02595676,
    "giove": 0.41354,
    "saturno": 0.44401,
    "urano": -0.71833,
}


def test_periodi_coerenti_con_jpl(frammento):
    for slug, giorni in PERIODI_JPL.items():
        ore = frammento["corpi"][slug]["fisica"]["rotazione"]["valore"]
        assert ore / 24.0 == pytest.approx(giorni, rel=2e-5), slug
    # Nettuno: il rapporto 2015 adotta 15,9663 h (Karkoschka 2011); la tabella JPL riporta ancora 16,11 h (2006)
    assert frammento["corpi"]["nettuno"]["fisica"]["rotazione"]["valore"] == pytest.approx(15.9663, abs=5e-5)


def test_inclinazioni_assiali(frammento):
    # valori di riferimento: obliquità della Terra 84 381,448″; altri pianeti dal polo WGCCRE (≤ 0,02° di scarto)
    attese = {
        "mercurio": 0.034,
        "venere": 177.36,
        "terra": 23.4393,
        "marte": 25.19,
        "giove": 3.12,
        "saturno": 26.73,
        "urano": 97.77,
        "nettuno": 28.32,
        "sole": 7.25,
    }
    for slug, v in attese.items():
        x = frammento["corpi"][slug]["fisica"]["inclinazioneAssiale_gradi"]["valore"]
        assert x == pytest.approx(v, abs=0.02), slug


def test_gm(frammento):
    c = frammento["corpi"]
    assert c["sole"]["fisica"]["gm_km3s2"]["valore"] == cst.GM_SOLE
    assert c["terra"]["fisica"]["gm_km3s2"]["valore"] == cst.GM_TERRA
    assert c["luna"]["fisica"]["gm_km3s2"]["valore"] == cst.GM_LUNA
    for slug, k in [("marte", 4), ("giove", 5), ("saturno", 6), ("urano", 7), ("nettuno", 8), ("plutone", 9)]:
        g = c[slug]["fisica"]["gm_km3s2"]["valore"]
        rapporto = g / cst.GM_BARICENTRI[k]
        # il pianeta senza satelliti: Plutone 89 % del sistema; gli altri oltre il 99,97 %
        assert (0.89 < rapporto < 0.9) if slug == "plutone" else (0.9997 < rapporto <= 1.0), slug


def test_gm_fonte_dei_pianeti_coerente_con_i_satelliti():
    """Soluzione e anno del GM dei pianeti uguali a quelli dei loro satelliti (stesso kernel): in
    ura184_part-3.bsp il corpo 799 viene da URA182.21 (Jacobson e Park 2025); MAR099 è del 2025."""
    from sats.uscite import SOLUZIONE

    for slug in ("marte", "giove", "saturno", "urano", "nettuno", "plutone"):
        kernel = ph.KERNEL_GM_PIANETA[ph.CORPI[slug]["naif"]]
        sol, anno, rif = SOLUZIONE[kernel]
        g = ph.gm(slug)
        assert f"soluzione {sol}, {rif}" in g["fonte"] and g["anno"] == anno, slug
    u = ph.gm("urano")
    assert "URA182" in u["fonte"] and "URA184" not in u["fonte"]
    assert ph.gm("marte")["anno"] == 2025
    # il valore letto è quello della tabella "Satellite Ephemeris: URA182.21" dell'area commenti
    testo = (ph.COMMENTI_SATS / "ura184_part-3.bsp.commenti.txt").read_text(encoding="latin-1")
    blocco = testo.split("Satellite Ephemeris: URA182.21")[1].split("Satellite Ephemeris:")[0]
    m = re.search(r"Uranus\s+799\s+([-+0-9.E]+)", blocco)
    assert m is not None and float(m.group(1)) == u["valore"]


def test_incertezza_gm_dei_pianeti_dalla_pagina_jpl():
    """Tabella "Planet and Pluto GM Values" di JPL "Planetary Satellite Physical Parameters": incertezza della pagina
    se cita la soluzione del kernel (JUP365, SAT441, NEP097, PLU060: Plutone 869,3 ± 0,4); Marte (MAR097 contro
    MAR099) e Urano (URA111 contro URA182) con valori diversi alle cifre pubblicate: nessuna incertezza."""
    attese = {"giove": 0.42, "saturno": 0.24, "nettuno": 9.63, "plutone": 0.4, "marte": None, "urano": None}
    for slug, sigma in attese.items():
        assert ph.gm(slug)["incertezza"] == sigma, slug
    pag = ph.gm_pianeti_jpl()
    assert (pag["Pluto"].gm, pag["Pluto"].gm_sigma, pag["Pluto"].gm_soluzione) == (869.3, 0.4, "PLU060")
    assert ph.gm("plutone")["valore"] == pytest.approx(869.3, abs=0.05)


def test_raggi(frammento):
    c = frammento["corpi"]
    assert c["sole"]["fisica"]["raggi_km"]["valore"] == [695700.0] * 3
    assert c["plutone"]["fisica"]["raggi_km"]["valore"] == [1188.3] * 3
    assert c["plutone"]["fisica"]["raggi_km"]["incertezza"] == [1.6] * 3
    assert c["terra"]["fisica"]["raggi_km"]["valore"] == [6378.1366, 6378.1366, 6356.7519]
    assert c["luna"]["fisica"]["raggi_km"]["valore"] == [1737.4] * 3
    for v in c.values():
        a, b, cc = v["fisica"]["raggi_km"]["valore"]
        assert a >= b >= cc > 0


def test_anelli(frammento):
    s = {e["nome"]: e for e in frammento["corpi"]["saturno"]["anelli"]["elementi"]}
    assert (s["A Ring"]["rInterno_km"], s["A Ring"]["rEsterno_km"]) == (122050.0, 136770.0)
    assert (s["Encke Gap"]["tipo"], s["Encke Gap"]["livello"]) == ("lacuna", 1)
    assert s["D Ring"]["tau"] == [1e-5, 1e-3]
    assert s["Region B2"]["tau"] == [1.5, 4.0]
    u = {e["nome"]: e for e in frammento["corpi"]["urano"]["anelli"]["elementi"]}
    eps = u["Epsilon"]
    assert (eps["rInterno_km"] + eps["rEsterno_km"]) / 2 == 51149.0
    assert eps["rEsterno_km"] - eps["rInterno_km"] == 96.0
    assert "R/2003 U 2" in u
    for e in [*s.values(), *u.values()]:
        assert e["rEsterno_km"] >= e["rInterno_km"] > 0


def test_tau_testo():
    assert ph._intervallo_tau("10^-5 to 10^-3") == [1e-5, 1e-3]
    assert ph._intervallo_tau("5x10^-6") == [5e-6, 5e-6]
    assert ph._intervallo_tau("0.5 to >5") == [0.5, 5.0]
    assert ph._intervallo_tau("~0") == [0.0, 0.0]
    assert ph._intervallo_tau("") is None


def test_fixture_orientamento():
    f = json.loads((ph.CARTELLA_FIXTURE / "orientamento.json").read_text(encoding="utf-8"))
    assert f["seme"] == ph.SEME_FIXTURE
    for slug in ["sole", "marte", "giove", "plutone"]:
        c = f["corpi"][slug]
        for t, m in zip(f["epoche"][:5], c["matrici"][:5], strict=True):
            assert np.allclose(np.array(m).reshape(3, 3), ph.matrice_corpo_eclittica(c["coefficienti"], t), atol=1e-15)


def test_albedo_geometrica_in_banda_v(frammento):
    """§ 9: pianeti da Mallama, Krobusek, Pavlov 2017, tab. 7 (V); Plutone da Buratti et al. 2015, tab. 2 (V, solo
    Plutone). I valori della tabella JPL (Explanatory Supplement 1992; Plutone 0,3) sono superati."""
    attese = {
        "mercurio": 0.142,
        "venere": 0.689,
        "terra": 0.434,
        "marte": 0.170,
        "giove": 0.538,
        "saturno": 0.499,
        "urano": 0.488,
        "nettuno": 0.442,
        "plutone": 0.52,
    }
    c = frammento["corpi"]
    for slug, v in attese.items():
        a = c[slug]["fisica"]["albedo"]
        assert a["valore"] == v and a["anno"] >= 2015 and "1992" not in a["fonte"], slug
        assert "banda V" in a["fonte"], slug
    p = c["plutone"]["fisica"]["albedo"]
    assert p["fonte"].startswith("Buratti et al. 2015") and p["incertezza"] == 0.03
    assert c["sole"]["fisica"]["albedo"] is None and c["luna"]["fisica"]["albedo"] is None
