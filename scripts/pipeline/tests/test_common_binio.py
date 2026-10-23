"""Intestazione comune (§ 8.2) e formato SSSERIE1 (§ 8.3)."""

import math
import struct

import numpy as np
import pytest

from common import binio
from common import constants as cst
from common.equinoctial import da_classici, stato_da_elementi
from common.interp import griglia, tempi_campioni


def _elementi(t):
    """Orbita kepleriana con piccole variazioni lente (I = +1)."""
    tau = t - 2460000.5
    a = 2.0 * cst.UA_KM * (1 + 1e-4 * np.sin(tau / 50))
    n = math.sqrt(cst.GM_SOLE / (2.0 * cst.UA_KM) ** 3) * cst.GIORNO_S
    el, _ = da_classici(a, 0.2, 0.3, 1.0, 2.0, 0.5 + n * tau)
    return el


def _seg_e(ini, fin, h=8.0):
    t_primo, n = griglia(ini, fin, h, *binio.ALONI_E, cst.T0)
    return binio.segmento_e(t_primo, h, ini, fin, cst.GM_SOLE, 1, _elementi(tempi_campioni(t_primo, h, n)))


def _seg_c(ini, fin, h=2.0, scala=1.0):
    t_primo, n = griglia(ini, fin, h, *binio.ALONI_C, cst.T0)
    t = tempi_campioni(t_primo, h, n)
    stati = np.stack([np.cos(t / 30), np.sin(t / 30), t * 0, -np.sin(t / 30), np.cos(t / 30), t * 0], axis=1)
    stati[:, :3] *= 1e8 * scala
    stati[:, 3:] *= 1e8 * scala / 30 / cst.GIORNO_S
    return binio.segmento_c_da_stati(t_primo, h, ini, fin, stati)


INI, FIN = 2459999.5, 2460255.5


def _file():
    corpi = {
        7: [_seg_e(INI, INI + 128), _seg_c(INI + 160, FIN)],
        3: [_seg_c(INI, FIN, 4.0)],
        12: [],
    }
    return binio.scrivi_serie(binio.TIPO_PICCOLI_CORPI, -1, INI, FIN, corpi)


def test_intestazione():
    i = binio.Intestazione(b"SSMOON01", binio.TIPO_LUNA, -1, 0, cst.T0, cst.T_END, 64, 64)
    b = binio.scrivi_intestazione(i)
    assert len(b) == 64 and b[:8] == b"SSMOON01" and b[48:] == bytes(16)
    assert struct.unpack_from("<I", b, 8)[0] == 1
    assert binio.leggi_intestazione(b) == i
    with pytest.raises(binio.ErroreFormato):
        binio.leggi_intestazione(b + bytes(8))  # dimensione dichiarata diversa
    rotto = bytearray(b)
    rotto[60] = 1
    with pytest.raises(binio.ErroreFormato):
        binio.leggi_intestazione(bytes(rotto))
    for errata in (
        binio.Intestazione(b"SSXXXX01", 4, -1, 0, 0.0, 1.0, 64, 64),
        binio.Intestazione(b"SSMOON01", 1, -1, 0, 0.0, 1.0, 64, 64),
        binio.Intestazione(b"SSMOON01", 4, -1, 0, 1.0, 1.0, 64, 64),
        binio.Intestazione(b"SSMOON01", 4, 3, 0, 0.0, 1.0, 64, 64),
        binio.Intestazione(b"SSMOON01", 4, -1, 0, 0.0, 1.0, 60, 64),
        binio.Intestazione(b"SSMOON01", 4, -1, 0, 0.0, 1.0, 64, 68),
        binio.Intestazione(b"SSMOON01", 4, -1, 0, 0.0, 1.0, 64, 64, versione=2),
    ):
        with pytest.raises(binio.ErroreFormato):
            binio.scrivi_intestazione(errata)
    # blocco con nucleo conforme
    binio.scrivi_intestazione(
        binio.Intestazione(b"SSSERIE1", 1, 12, 0, cst.inizio_blocco(12), cst.fine_blocco(12), 64, 64)
    )


def test_disposizione_e_allineamento():
    dati = _file()
    assert len(dati) % 8 == 0
    i = binio.leggi_intestazione(dati)
    assert (i.magic, i.tipo, i.blocco, i.n_voci, i.offset_voci, i.dimensione) == (b"SSSERIE1", 3, -1, 3, 64, len(dati))
    voci = [struct.unpack_from("<HHI", dati, 64 + 8 * k) for k in range(3)]
    assert [v[0] for v in voci] == [3, 7, 12]
    assert voci[2] == (12, 0, 0)
    for _ssid, nseg, off in voci[:2]:
        assert off % 8 == 0
        for js in range(nseg):
            seg = struct.unpack_from("<BbHIddddddddII", dati, off + 80 * js)
            assert seg[-2] % 8 == 0 and seg[2] == 0 and seg[-1] == 0


def test_andata_e_ritorno():
    dati = _file()
    fs = binio.leggi_serie(dati)
    assert sorted(fs.corpi) == [3, 7, 12]
    seg = fs.corpi[7][0]
    orig = _seg_e(INI, INI + 128)
    assert seg.tipo == binio.SEG_E and seg.fattore_i == 1
    assert (seg.h, seg.t_primo, seg.inizio, seg.fine, seg.mu, seg.a0, seg.lam0, seg.n) == (
        orig.h, orig.t_primo, orig.inizio, orig.fine, orig.mu, orig.a0, orig.lam0, orig.n
    )  # fmt: skip
    assert np.array_equal(seg.dati, orig.dati) and seg.dati.dtype == np.float32
    assert fs.corpi[3][0].dati.dtype == np.float64
    assert binio.scrivi_serie(3, -1, INI, FIN, fs.corpi) == dati


def test_residui_e_precisione():
    s = _seg_e(INI, INI + 128)
    assert s.t_primo == INI - 4 * 8 and s.n_campioni == 16 + 8
    assert np.max(np.abs(s.dati[:, 5])) < 1.0
    t = np.linspace(INI, INI + 128, 400, endpoint=False)
    rif = stato_da_elementi(_elementi(t), cst.GM_SOLE, 1)
    st = binio.valuta_segmento(s, t)
    # quantizzazione Float32 di h, k, p, q: circa 1e-8·a
    assert np.max(np.linalg.norm(st[:, :3] - rif[:, :3], axis=1)) < 1.5e-8 * 2.0 * cst.UA_KM


def test_valuta_serie_esiti():
    fs = binio.leggi_serie(_file())
    t = np.array([INI - 1, INI, INI + 100, INI + 140, INI + 160, FIN - 1e-6, FIN])
    st, es = binio.valuta_serie(fs, 7, t)
    assert es.tolist() == ["fuori-copertura", "ok", "ok", "non-determinabile", "ok", "ok", "fuori-copertura"]
    assert np.all(np.isnan(st[[0, 3, 6]])) and np.all(np.isfinite(st[[1, 2, 4, 5]]))
    _, es = binio.valuta_serie(fs, 12, t)
    assert set(es.tolist()) == {"fuori-copertura", "non-determinabile"}
    with pytest.raises(KeyError):
        binio.valuta_serie(fs, 99, t)
    # segmento C: velocità in km/s dal campione in km/d
    s = fs.corpi[3][0]
    st, _ = binio.valuta_serie(fs, 3, np.array([s.t_primo + 4 * s.h]))
    assert np.allclose(st[0, 3:], s.dati[4, 3:] / cst.GIORNO_S, rtol=1e-15)


def _altera(dati, off, fmt, valore):
    b = bytearray(dati)
    struct.pack_into(fmt, b, off, valore)
    return bytes(b)


def test_validazioni_in_lettura():
    dati = _file()
    off_tab = struct.unpack_from("<HHI", dati, 64)[2]
    casi = [
        _altera(dati, 0, "<8s", b"SSSATS01"),  # magic diverso
        _altera(dati, 44, "<I", len(dati) + 8),  # dimensione dichiarata
        _altera(dati, 40, "<I", 68),  # offset delle voci non allineato
        _altera(dati, 64, "<H", 9),  # voci non ordinate
        _altera(dati, 68, "<I", off_tab + 4),  # tabella dei segmenti non allineata
        _altera(dati, 68, "<I", len(dati) - 8),  # tabella oltre la fine del file
        _altera(dati, off_tab + 0, "<B", 3),  # tipo di segmento
        _altera(dati, off_tab + 2, "<H", 1),  # riservato
        _altera(dati, off_tab + 8, "<d", 3.0),  # passo non potenza di 2
        _altera(dati, off_tab + 4, "<I", 10**6),  # numero di campioni oltre il file
        _altera(dati, off_tab + 72, "<I", 64),  # dati sovrapposti all'intestazione
        _altera(dati, off_tab + 32, "<d", FIN + 10),  # nucleo oltre il file
    ]
    for k, rotto in enumerate(casi):
        with pytest.raises(binio.ErroreFormato):
            binio.leggi_serie(rotto)
            pytest.fail(f"caso {k} accettato")


def test_validazioni_in_scrittura():
    with pytest.raises(binio.ErroreFormato):  # sovrapposizione di nuclei
        binio.scrivi_serie(3, -1, INI, FIN, {1: [_seg_c(INI, INI + 100), _seg_c(INI + 90, FIN)]})
    with pytest.raises(binio.ErroreFormato):  # pianeti: un solo segmento E
        binio.scrivi_serie(1, -1, INI, FIN, {1: [_seg_c(INI, FIN)]})
    with pytest.raises(binio.ErroreFormato):  # stencil incompleto
        s = _seg_e(INI, INI + 128)
        s.inizio = s.t_primo + 2 * s.h
        binio.valida_segmento(s)
    with pytest.raises(binio.ErroreFormato):  # campioni di Hermite insufficienti
        s = _seg_c(INI, INI + 100)
        s.fine = s.t_primo + s.n_campioni * s.h
        binio.valida_segmento(s)
    with pytest.raises(ValueError):  # λ discontinua
        t_primo, n = griglia(INI, INI + 128, 8.0, *binio.ALONI_E, cst.T0)
        el = _elementi(tempi_campioni(t_primo, 8.0, n))
        el[10:, 5] += 2 * math.pi
        binio.segmento_e(t_primo, 8.0, INI, INI + 128, cst.GM_SOLE, 1, el)
    # file di blocco con nucleo del blocco
    k = 12
    ini, fin = cst.inizio_blocco(k), cst.inizio_blocco(k) + 512
    dati = binio.scrivi_serie(1, k, cst.inizio_blocco(k), cst.fine_blocco(k), {})
    assert binio.leggi_serie(dati).intestazione.blocco == k
    with pytest.raises(binio.ErroreFormato):
        binio.scrivi_serie(1, k, ini, fin, {})
