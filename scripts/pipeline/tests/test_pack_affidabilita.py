"""reliability.bin (§ 8.7): scrittura, lettura, serie costanti dei pianeti (reliability_pack.py)."""

import json
import math
import struct

import numpy as np
import pytest

import reliability_pack as rp
from common import affidabilita as ca
from common import binio
from common import constants as cst

N = rp.NODI


def test_andata_e_ritorno():
    serie = {
        3: {"log10eps": [-5.0] * N, "formaDeterminata": [True] * N, "datiPresenti": [True] * N},
        57: {
            "log10eps": [None] * 10 + [-2.5] * (N - 10),
            "formaDeterminata": [False] * 10 + [True] * (N - 10),
            "datiPresenti": [False] * 10 + [True] * (N - 10),
        },
    }
    dati = rp.scrivi(serie)
    blocco = binio.allinea8(4 + 5 * N)
    assert blocco == 3568 and len(dati) == 64 + 40 + 2 * blocco and len(dati) % 8 == 0
    assert dati[:8] == b"SSRELI02"
    testa, corpi = rp.leggi(dati)
    assert testa == {"t0": cst.T0, "passo": 7305.0, "nodi": 712, "tFine": 2444494.5, "passoFine": 456.5625}
    assert testa == ca.griglia()
    assert sorted(corpi) == [3, 57]
    e, f = corpi[57]
    assert np.isnan(e[:10]).all() and e[10] == np.float32(-2.5)
    assert list(f[:10]) == [0] * 10 and f[10] == rp.BIT_FORMA | rp.BIT_DATI
    with pytest.raises(binio.ErroreFormato):
        rp.leggi(dati[:-8])


def test_float32_per_eccesso():
    """Il cast a Float32 non riduce ε: valore memorizzato = il più piccolo Float32 non inferiore al valore."""
    rng = np.random.default_rng(5)
    valori = [-3.536273881955, *rng.uniform(-9.0, 0.5, N - 2).tolist(), None]
    dati = rp.scrivi({82: {"log10eps": valori, "formaDeterminata": [True] * N, "datiPresenti": [True] * N}})
    e, _ = rp.leggi(dati)[1][82]
    x = np.array(valori[:-1], dtype=np.float64)
    m = e[:-1].astype(np.float64)
    assert np.all(m >= x)
    assert np.all(np.nextafter(e[:-1], np.float32(-np.inf)).astype(np.float64) < x)
    assert np.isnan(e[-1])
    # Luna a J2000 (frammento di moon.py): sopra 1′ anche dopo il cast
    assert 10.0 ** float(e[0]) > math.pi / 10800.0


def test_copertura_dei_nodi():
    b = ca.bordi()
    assert b.size == rp.NODI + 1 and b[-1] >= cst.T_END > b[-2]


def test_griglia_non_conforme():
    dati = bytearray(
        rp.scrivi({3: {"log10eps": [-5.0] * N, "formaDeterminata": [True] * N, "datiPresenti": [True] * N}})
    )
    struct.pack_into("<d", dati, 64 + 24, ca.T_FINE + 1.0)  # t_fine fuori dai nodi grossi
    with pytest.raises(binio.ErroreFormato, match="griglia"):
        rp.leggi(bytes(dati))


def test_frammento_griglia_diversa(tmp_path):
    for griglia in (
        {"formato": 1, "t0": cst.T0, "passo": 7305.0, "nodi": 607},
        {"formato": 2, **ca.griglia(), "nodi": 607},
    ):
        (tmp_path / "reliability-x.json").write_text(json.dumps({**griglia, "corpi": {}}), encoding="utf-8")
        with pytest.raises(ValueError, match="griglia"):
            rp.leggi_frammenti(tmp_path)


def test_serie_pianeti(tmp_path):
    (tmp_path / "catalog-planets.json").write_text(
        json.dumps(
            {
                "formato": 1,
                "corpi": {
                    "marte": {"effemeridi": {"modello": "pianeta", "naifDE441": 4}, "epsModelloCostante": None},
                    "luna": {"effemeridi": {"modello": "luna"}},
                },
            }
        ),
        encoding="utf-8",
    )
    s = rp.serie_pianeti(tmp_path)
    assert list(s) == ["marte"]
    assert s["marte"]["log10eps"][0] == pytest.approx(math.log10(2.0 / 206264.80624709636))


@pytest.mark.skipif(not rp.FILE_AFFIDABILITA.exists(), reason="reliability.bin non ancora generato")
def test_file_pubblicato():
    dati = rp.FILE_AFFIDABILITA.read_bytes()
    assert len(dati) <= 400_000
    _, corpi = rp.leggi(dati)
    assert 0 not in corpi  # Sole: costante nel catalogo
    for ssid in (1, 2, 3, 4, 5, 6, 7, 8, 10):
        e, f = corpi[ssid]
        assert np.allclose(e, math.log10(2.0 * math.pi / 648000.0), atol=1e-6) and (f == 3).all()
    # Luna (ssid 82): ε_modello = 60″ ⊕ ½·σ_ṅ·τ² > 1′ a ogni nodo, quindi mai 'precisa' (§ 7.8.1)
    e, _ = corpi[82]
    assert np.all(10.0 ** e.astype(np.float64) > math.pi / 10800.0)
    fix = json.loads((rp.CARTELLA_FIXTURE / "affidabilita.json").read_text(encoding="utf-8"))
    assert fix["sha256"] == rp.sha256_bytes(dati)
