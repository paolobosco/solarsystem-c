"""File dei satelliti SSSATS01 (§ 8.5): scrittura, lettura, verifiche, selezione dei record per blocco."""

from __future__ import annotations

import struct

import numpy as np
import pytest

from common import binio
from common import constants as cst
from sats import formato
from sats import modello as mod

K = 5
INIZIO = cst.inizio_blocco(K)
FINE = cst.fine_blocco(K)
NU = np.array([0.3, 0.8, 1.7])


def _record(t0: float, t1: float, k: int = 2, tipo: int = mod.TIPO_SPK, fi: int = 1) -> mod.Record:
    sc = np.arange(1, 2 * k + 1, dtype=np.float64).reshape(-1, 2) * 1e-4
    return mod.Record(
        tipo, fi, t0, t1, 0.5 * (t0 + t1), 4e5, 0.01, 0.2, 1e-3, 0.02, 0.4, -1e-3, 0.1, 3.5, 1e-9, 0.0, sc
    )


def _sequenza(passo: float = 3652.5) -> list[mod.Record]:
    recs = [_record(INIZIO - 50000.0, INIZIO + 1000.0, 0, mod.TIPO_SECOLARE)]
    t = INIZIO + 1000.0
    while t < FINE - 2000.0:
        recs.append(_record(t, t + passo))
        t += passo
    recs.append(_record(t, FINE + 40000.0, 0, mod.TIPO_SECOLARE))
    return recs


def test_andata_e_ritorno() -> None:
    recs = _sequenza()
    sel = formato.record_del_blocco(recs, INIZIO, FINE)
    dati = formato.scrivi(K, INIZIO, FINE, {90: sel, 85: sel})
    fs = formato.leggi(dati)
    assert fs.intestazione.magic == formato.MAGIC
    assert fs.intestazione.tipo == binio.TIPO_SATELLITI
    assert fs.intestazione.blocco == K
    assert list(fs.satelliti) == [85, 90]
    for a, b in zip(fs.satelliti[90], sel, strict=True):
        assert a.valori() == b.valori()
        assert (a.tipo, a.fattore_i, a.k) == (b.tipo, b.fattore_i, b.k)
    assert len(dati) % 8 == 0
    t = np.linspace(INIZIO, FINE - 1e-6, 50)
    st, esiti = formato.valuta(fs, 90, NU, np.eye(3), t)
    assert set(esiti) == {"ok"}
    st2, idx = mod.stato_sequenza(sel, NU, np.eye(3), t)
    assert np.array_equal(st, st2) and np.all(idx >= 0)
    _, esiti = formato.valuta(fs, 90, NU, np.eye(3), np.array([INIZIO - 1.0, FINE]))
    assert list(esiti) == ["fuori-copertura", "fuori-copertura"]


def test_selezione_per_blocco_include_i_raccordi() -> None:
    recs = _sequenza()
    sel = formato.record_del_blocco(recs, INIZIO + 5100.0, INIZIO + 6000.0)
    # l'intervallo [I+5100, I+6000) cade nel record [I+4652,5, I+8305); il raccordo con il record
    # precedente (semiampiezza 365,25 d) termina in I+5017,75
    assert [r.t_inizio for r in sel] == [INIZIO + 1000.0 + 3652.5]
    sel = formato.record_del_blocco(recs, INIZIO + 4652.5 - 100.0, INIZIO + 4652.5 + 100.0)
    assert len(sel) == 2


def _alterato(dati: bytes, offset: int, fmt: str, valore) -> bytes:
    b = bytearray(dati)
    struct.pack_into(fmt, b, offset, valore)
    return bytes(b)


def test_file_non_conformi_rifiutati() -> None:
    recs = formato.record_del_blocco(_sequenza(), INIZIO, FINE)
    dati = formato.scrivi(K, INIZIO, FINE, {90: recs})
    off_rec = struct.unpack_from("<I", dati, 64 + 4)[0]
    casi = [
        _alterato(dati, 0, "<8s", b"SSSERIE1"),
        _alterato(dati, 64, "<H", 91) + b"",  # voce valida ma ssid diverso: ancora valido
        _alterato(dati, off_rec + 4, "<I", 1),  # riservato del record
        _alterato(dati, off_rec + 2, "<H", 7),  # K > 6
        _alterato(dati, off_rec + 1, "<b", 2),  # fattore I
        _alterato(dati, off_rec + 8 + 8, "<d", recs[0].t_inizio + 1.0),  # t_fine: record non contigui
        _alterato(dati, off_rec + 8 + 8 * 4, "<d", 1.5),  # e ≥ 1
        _alterato(dati, off_rec + 8 + 8 * 3, "<d", float("nan")),
        dati[:-8],
    ]
    for j, c in enumerate(casi):
        if j == 1:
            formato.leggi(c)
            continue
        with pytest.raises(binio.ErroreFormato):
            formato.leggi(c)


def test_copertura_del_nucleo_obbligatoria() -> None:
    recs = formato.record_del_blocco(_sequenza(), INIZIO, FINE)
    with pytest.raises(binio.ErroreFormato):
        formato.scrivi(K, INIZIO, FINE, {90: recs[1:]})
    with pytest.raises(binio.ErroreFormato):
        formato.scrivi(K, INIZIO, FINE, {90: recs[:-1]})


def test_percorso_blocco() -> None:
    assert formato.percorso_blocco(0) == "sats/s00.bin"
    assert formato.percorso_blocco(12) == "sats/s12.bin"
    with pytest.raises(ValueError):
        formato.percorso_blocco(13)
