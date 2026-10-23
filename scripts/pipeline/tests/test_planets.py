"""Pianeti, Plutone ed EMB: file planets/pKK.bin, tolleranze A4, continuità, raccordo, catalogo."""

import json
import math

import numpy as np
import pytest

import planets as P
from common import binio
from common import constants as cst
from common.de441 import CARTELLA_PREDEFINITA, De441
from common.equinoctial import elementi_da_stato, stato_da_elementi
from common.manifest import sha256_bytes

HA_DE441 = all((CARTELLA_PREDEFINITA / n).exists() for n in ("de441_part-1.bsp", "de441_part-2.bsp"))
HA_DATI = all((P.CARTELLA_DATI / P.nome_file(k)).exists() for k in range(cst.K))
SSID_ATTESI = {1, 2, 4, 5, 6, 7, 8, 10, 200}


@pytest.fixture(scope="module")
def blocchi():
    if not HA_DATI:
        pytest.skip("file dei pianeti assenti")
    return P.leggi_blocchi()


@pytest.fixture(scope="module")
def de():
    if not HA_DE441:
        pytest.skip("DE441 assente")
    with De441() as d:
        yield d


def test_passi_e_corpi():
    assert {c.ssid for c in P.CORPI} == SSID_ATTESI
    assert {c.naif for c in P.CORPI} == set(range(1, 10))
    for c in P.CORPI:
        for k in range(cst.K):
            h = P.passo(c, k)
            assert h in binio.PASSI_AMMESSI
            assert cst.B % h == 0
    assert P.PER_SSID[1].passo == 16.0 and P.PER_SSID[200].passo == 16.0
    assert [P.PER_SSID[s].passo for s in (2, 4, 5, 6, 7, 8, 10)] == [32.0, 64.0, 256.0, 256.0, 512.0, 512.0, 512.0]


def test_file_conformi(blocchi):
    totale = 0
    for k, fs in enumerate(blocchi):
        i = fs.intestazione
        assert (i.tipo, i.blocco, i.inizio, i.fine) == (binio.TIPO_PIANETI, k, cst.inizio_blocco(k), cst.fine_blocco(k))
        assert set(fs.corpi) == SSID_ATTESI
        for ssid, segs in fs.corpi.items():
            c = P.PER_SSID[ssid]
            (s,) = segs
            assert s.tipo == binio.SEG_E and s.h == P.passo(c, k) and s.fattore_i == 1
            assert s.mu == cst.MU_ELIO[c.naif]
            assert (s.t_primo - cst.T0) / s.h == math.floor((s.t_primo - cst.T0) / s.h)
            assert s.inizio == i.inizio and s.fine == i.fine
            # 4 campioni fuori dal nucleo per lato; l'ultimo nodo del nucleo è il primo ≥ fine
            assert s.t_primo == s.inizio - 4 * s.h
            assert s.t_primo + (s.n_campioni - 5) * s.h < s.fine <= s.t_primo + (s.n_campioni - 4) * s.h
            assert np.max(np.abs(s.dati[:, 5])) < 1.0
        n = (P.CARTELLA_DATI / P.nome_file(k)).stat().st_size
        assert n <= 4 * 1024 * 1024
        totale += n
    # budget misurato (§ 8.1): 12 blocchi completi da 1,63 MB e il blocco 12 ridotto
    assert totale < 20_000_000


def test_continuita_ai_confini(blocchi):
    for c in P.CORPI:
        assert max(P.continuita(blocchi, c)) < P.TOLL_CONTINUITA_KM * 1e-3


def test_raccordo_riproduce_il_blocco_precedente():
    """Due segmenti sintetici consecutivi: a e λ ricostruiti al nodo comune coincidono."""
    mu = cst.MU_ELIO[9]
    h = 512.0
    ini1, fin1 = cst.inizio_blocco(3), cst.fine_blocco(3)

    def stati(t):
        tau = (t - ini1) / 36525.0
        a = 39.5 * cst.UA_KM * (1 + 1e-3 * np.sin(2 * math.pi * tau / 0.12))
        el = np.stack(
            [
                a,
                0.25 * np.sin(1.0 + 0.01 * tau),
                0.25 * np.cos(1.0 + 0.01 * tau),
                0.15 * np.sin(2.0 - 0.002 * tau),
                0.15 * np.cos(2.0 - 0.002 * tau),
                0.3 + np.sqrt(mu / a**3) * 86400.0 * (t - ini1) + 0.4 * np.sin(2 * math.pi * tau / 200.0),
            ],
            axis=-1,
        )
        return stato_da_elementi(el, mu, 1)

    from common.interp import griglia, tempi_campioni

    t1, n1 = griglia(ini1, fin1, h, *binio.ALONI_E, cst.T0)
    s1 = P.segmento_raccordato(t1, h, ini1, fin1, stati(tempi_campioni(t1, h, n1)), mu, None)
    r = P.ricostruzione_finale(s1)
    ini2, fin2 = cst.inizio_blocco(4), cst.fine_blocco(4)
    t2, n2 = griglia(ini2, fin2, h, *binio.ALONI_E, cst.T0)
    s2 = P.segmento_raccordato(t2, h, ini2, fin2, stati(tempi_campioni(t2, h, n2)), mu, r)
    x1 = binio.valuta_segmento(s1, np.array([fin1]))
    x2 = binio.valuta_segmento(s2, np.array([ini2]))
    assert np.linalg.norm(x1[0, :3] - x2[0, :3]) < 1e-3
    # i riferimenti spostati restano quasi la media di a
    assert abs(s2.a0 - np.mean(elementi_da_stato(stati(tempi_campioni(t2, h, n2)), mu, 1)[0][:, 0])) < 10.0


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_a4_campione(de, blocchi):
    """Tolleranze del § 7.3.4 su 300 epoche casuali per corpo e sugli intorni dei confini."""
    rng = np.random.default_rng(7)
    for c in P.CORPI:
        t = np.concatenate([rng.uniform(cst.T0, cst.T_END, 300), P.epoche_confini(c)])
        ea, ek = P.errori(P.valuta(blocchi, c.ssid, t), de.stato_eliocentrico(c.naif, t))
        assert np.max(ea) <= P.TOLL_ARCSEC, c.slug
        assert np.all(ek <= P.soglia_km(c, t)), c.slug


@pytest.mark.de441
@pytest.mark.skipif(not HA_DE441, reason="DE441 assente")
def test_rigenerazione_identica(de, tmp_path):
    sha = P.genera(tmp_path, de)
    for nome, h in sha.items():
        assert h == sha256_bytes((P.CARTELLA_DATI / nome).read_bytes()), nome


def test_fixture_coerente_con_i_dati():
    meta_p = P.CARTELLA_FIXTURE / "pianeti.json"
    if not (meta_p.exists() and HA_DATI):
        pytest.skip("fixture o dati assenti")
    meta = json.loads(meta_p.read_text())
    for nome, h in meta["sha256File"].items():
        assert h == sha256_bytes((P.CARTELLA_DATI / nome).read_bytes())
    tab = np.frombuffer((P.CARTELLA_FIXTURE / meta["file"]).read_bytes(), dtype="<f8").reshape(-1, 8)
    assert tab.shape[0] == meta["righe"] == sum(meta["epochePerCorpo"].values())
    assert sha256_bytes(tab.tobytes()) == meta["sha256"]


def test_frammento_catalogo():
    f = P.frammento_catalogo()
    assert f["formato"] == 1 and f["area"] == "planets"
    slug = ["sole", "mercurio", "venere", "terra", "marte", "giove", "saturno", "urano", "nettuno", "plutone", "luna"]
    assert set(f["corpi"]) == set(slug)
    assert f["corpi"]["terra"]["effemeridi"] == {"modello": "pianeta", "naifDE441": 3}
    assert f["corpi"]["plutone"]["effemeridi"] == {"modello": "pianeta", "naifDE441": 9}
    assert f["corpi"]["luna"]["epsModelloCostante"] is None
    assert f["corpi"]["sole"]["epsModelloCostante"] == 0.0
    assert f["corpi"]["marte"]["epsModelloCostante"] == pytest.approx(2.0 / P.RAD_ARCSEC, rel=1e-15)
    for v in f["corpi"].values():
        assert set(v["soluzione"]) == {"id", "data", "estrazione", "modelloNG", "recordDastcom"}
