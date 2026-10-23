"""Luna: serie di Meeus (esempio 47.a), catena di riferimento, moon.bin, A5 su campione, Terra, Cassini."""

import json
import math

import numpy as np
import pytest

import moon as L
import planets as P
from common import affidabilita as ca
from common import binio
from common import constants as cst
from common import precession_ref as pr
from common.de441 import CARTELLA_PREDEFINITA, De441
from common.manifest import sha256_bytes

HA_DE441 = all((CARTELLA_PREDEFINITA / n).exists() for n in ("de441_part-1.bsp", "de441_part-2.bsp"))
HA_MOON = L.PERCORSO_MOON.exists()
HA_PIANETI = all((P.CARTELLA_DATI / P.nome_file(k)).exists() for k in range(cst.K))
GRADI = math.pi / 180.0
# Somme di controllo dei coefficienti trascritti (tabelle 47.A e 47.B), confrontati termine per termine
# con una trascrizione indipendente (PyMeeus 0.5.12) e verificati sull'esempio 47.a.
SOMMA_L = 8279751
SOMMA_R = -28257908
SOMMA_B = 6044003


@pytest.fixture(scope="module")
def modello():
    if not HA_MOON:
        pytest.skip("moon.bin assente")
    return L.ModelloLuna.da_file()


@pytest.fixture(scope="module")
def de():
    if not HA_DE441:
        pytest.skip("DE441 assente")
    with De441() as d:
        yield d


def test_tabelle():
    assert len(L.TABELLA_LR) == 60 and len(L.TABELLA_B) == 60
    assert len({r[:4] for r in L.TABELLA_LR}) == 60
    assert len({r[:4] for r in L.TABELLA_B}) == 60
    # somme di controllo dei coefficienti trascritti (Meeus 1998, tabelle 47.A e 47.B)
    assert sum(r[4] for r in L.TABELLA_LR) == SOMMA_L
    assert sum(r[5] for r in L.TABELLA_LR) == SOMMA_R
    assert sum(r[4] for r in L.TABELLA_B) == SOMMA_B


def test_esempio_47a():
    """Meeus (1998), esempio 47.a: 1992-04-12 0h TD."""
    jd = np.array([2448724.5])
    a = L.argomenti(jd)
    attesi = {"L1": 134.290182, "D": 113.842304, "M": 97.643514, "M1": 5.150833, "F": 219.889721}
    for k, v in attesi.items():
        assert math.degrees(a[k][0]) % 360.0 == pytest.approx(v, abs=1e-6)
    assert a["E"][0] == pytest.approx(1.000194, abs=1e-6)
    lam, beta, dist = L.serie(jd, derivate=False)
    assert math.degrees(lam[0]) % 360.0 == pytest.approx(133.162655, abs=1e-6)
    assert math.degrees(beta[0]) == pytest.approx(-3.229126, abs=1e-6)
    assert dist[0] == pytest.approx(368409.7, abs=0.05)


def test_derivate_analitiche():
    """Derivate di λ, β, Δ contro differenze centrali, con correzioni non nulle."""
    t = np.array([-1.5e6, 0.0, 2451545.0, 2460000.25])
    corr = np.tile([1e-3, -2e-3, 5e-4, 1e-3, -1e-3, 1.02], (t.size, 1))
    dcorr = np.tile([1e-8, -2e-8, 1e-9, 3e-8, -1e-8, 0.0], (t.size, 1))
    _, _, _, dl, db, dd = L.serie(t, corr, dcorr)
    # passo 0,01 d: l'errore di troncamento è inferiore all'arrotondamento di λ (circa 1e6 rad a -1,5e6)
    h = 1e-2
    p = L.serie(t + h, corr + dcorr * h, derivate=False)
    m = L.serie(t - h, corr - dcorr * h, derivate=False)
    assert np.allclose((p[0] - m[0]) / (2 * h), dl, rtol=0, atol=1e-7)
    assert np.allclose((p[1] - m[1]) / (2 * h), db, rtol=0, atol=1e-7)
    assert np.allclose((p[2] - m[2]) / (2 * h), dd, rtol=0, atol=1e-2)


def test_matrice_catena():
    for jd in (cst.T0, -5e5, cst.J2000, 2470000.0):
        m = L.matrici_data_j2000([jd])[0]
        assert np.array_equal(m, pr.eclittica_data_a_j2000(pr.epoca_giuliana(jd)))


def test_moon_bin_formato(modello):
    buf = L.PERCORSO_MOON.read_bytes()
    i = binio.leggi_intestazione(buf)
    assert (i.magic, i.tipo, i.blocco, i.n_voci, i.inizio, i.fine, i.offset_voci) == (
        b"SSMOON01",
        4,
        -1,
        1214,
        cst.T0,
        cst.T_END,
        64,
    )
    assert len(buf) == 88 + 1214 * 6 * 2 * 8
    f = modello.f
    assert L.scrivi_moon_bin(f.valori, f.derivate) == buf
    assert f.t0 + f.passo * (L.N_NODI - 1) > cst.T_END
    # κ vicino a 1, correzioni entro qualche grado
    assert np.all(np.abs(f.valori[:, 5] - 1.0) < 0.05)
    assert np.all(np.abs(f.valori[:, :5]) < 0.1)
    # file troncato; colonne = 5
    for alterato in (buf[:-8], buf[:84] + b"\x05" + buf[85:]):
        with pytest.raises(binio.ErroreFormato):
            L.leggi_moon_bin(alterato)


def test_spline_c1_ai_nodi(modello):
    tn = L.tempi_nodi()[1:-1:97]
    eps = 1e-6
    a, da = modello.correzioni(tn - eps)
    b, db = modello.correzioni(tn + eps)
    assert np.allclose(a, b, rtol=0, atol=1e-11)
    assert np.allclose(da, db, rtol=0, atol=1e-12)


@pytest.mark.de441
@pytest.mark.skipif(not (HA_DE441 and HA_MOON), reason="DE441 o moon.bin assenti")
def test_a5_campione(modello, de):
    rng = np.random.default_rng(11)
    tn = L.tempi_nodi()
    t = np.concatenate([rng.uniform(cst.T0, cst.T_END, 1500), tn[tn < cst.T_END][::5]])
    rif = L.RiferimentoDE441(de).stato_j2000(t)
    mod = modello.stato_geocentrico(t)
    ang = L.errore_angolare(mod[:, :3], rif[:, :3])
    dd = np.abs(np.linalg.norm(mod[:, :3], axis=1) - np.linalg.norm(rif[:, :3], axis=1))
    assert np.max(ang) <= L.TOLL_ARCSEC
    assert np.max(dd) <= L.TOLL_KM
    # velocità entro 2 m/s
    assert np.max(np.linalg.norm(mod[:, 3:] - rif[:, 3:], axis=1)) < 2e-3


@pytest.mark.de441
@pytest.mark.skipif(not (HA_DE441 and HA_MOON and HA_PIANETI), reason="dati assenti")
def test_terra_contro_de441_399(modello, de):
    blocchi = P.leggi_blocchi()
    rng = np.random.default_rng(12)
    t = rng.uniform(cst.T0, cst.T_END, 800)
    emb = P.valuta(blocchi, 200, t)
    terra = L.stato_terra(emb, modello.stato_geocentrico(t))
    rif = de.stato_eliocentrico(399, t)
    ea, ek = P.errori(terra, rif)
    assert np.max(ea) <= P.TOLL_ARCSEC
    soglia = np.where(np.isin(P.blocchi_di(t), P.BLOCCHI_MODERNI), P.TOLL_EMB_MODERNI_KM, P.TOLL_EMB_KM) + 1.0
    assert np.all(ek <= soglia)


@pytest.mark.skipif(not HA_MOON, reason="moon.bin assente")
def test_orientamento_cassini(modello):
    t = np.linspace(cst.T0, cst.T_END - 1.0, 200)
    r = modello.orientamento(t)
    assert np.allclose(r @ np.swapaxes(r, -1, -2), np.eye(3), atol=1e-13)  # bias ICRS al primo ordine in eraLtecm
    assert np.allclose(np.linalg.det(r), 1.0, atol=1e-13)
    # asse x verso la Terra entro la librazione ottica (7,9° in longitudine, 6,7° in latitudine; Meeus cap. 53)
    luna = modello.stato_geocentrico(t)[:, :3]
    verso_terra = -luna / np.linalg.norm(luna, axis=1, keepdims=True)
    assert np.max(np.degrees(np.arccos(np.clip(np.sum(r[:, :, 0] * verso_terra, 1), -1, 1)))) < 11.0
    # polo inclinato di I sul polo dell'eclittica della data
    m = L.matrici_data_j2000(t)
    polo_ecl = m[:, :, 2]
    incl = np.degrees(np.arccos(np.clip(np.sum(r[:, :, 2] * polo_ecl, 1), -1, 1)))
    assert np.allclose(incl, 1.543, atol=1e-9)


def test_affidabilita():
    f = L.frammento_affidabilita()
    v = f["corpi"]["luna"]
    assert {k: f[k] for k in ca.griglia()} == ca.griglia() and f["nodi"] == 712
    assert len(v["log10eps"]) == len(v["formaDeterminata"]) == len(v["datiPresenti"]) == 712
    eps = 10.0 ** np.array(v["log10eps"]) * L.RAD_ARCSEC
    assert eps.min() == pytest.approx(60.0, rel=1e-6)
    # ½·0,2″·τ² a T0 (τ ≈ -120 secoli): circa 0,40°
    assert eps[0] / 3600.0 == pytest.approx(0.4003, abs=2e-4)
    assert all(v["formaDeterminata"]) and all(v["datiPresenti"])


def test_fixture_coerente():
    p = L.CARTELLA_FIXTURE / "luna.json"
    if not (p.exists() and HA_MOON):
        pytest.skip("fixture o moon.bin assenti")
    meta = json.loads(p.read_text())
    assert meta["sha256MoonBin"] == sha256_bytes(L.PERCORSO_MOON.read_bytes())
    tab = (L.CARTELLA_FIXTURE / meta["file"]).read_bytes()
    assert sha256_bytes(tab) == meta["sha256"]
    assert len(tab) == meta["righe"] * len(meta["colonne"]) * 8
