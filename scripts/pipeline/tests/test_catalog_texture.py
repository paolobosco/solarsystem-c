"""Texture (textures.py): georeferenziazione GeoTIFF, ricampionamento canonico, dimensioni e frammento."""

import io
import json

import numpy as np
import pytest
from PIL import Image, TiffImagePlugin

import textures as tx


def _geotiff(a: np.ndarray, lon_c: float, x_ul: float, scala: float, raggio: float) -> Image.Image:
    """GeoTIFF sintetico equirettangolare (tag 33550, 33922, 34735, 34736) letto con Pillow."""
    im = Image.fromarray(a)
    info = TiffImagePlugin.ImageFileDirectory_v2()
    info[33550] = (scala, scala, 0.0)
    info[33922] = (0.0, 0.0, 0.0, x_ul, raggio * np.pi / 2, 0.0)
    # chiavi: intestazione (1, 1, 0, 4), poi 2057 raggio, 3088 meridiano centrale, 3078 parallelo standard
    info[34735] = (1, 1, 0, 3, 2057, 34736, 1, 0, 3088, 34736, 1, 1, 3078, 34736, 1, 2)
    info[34736] = (raggio, lon_c, 0.0)
    buf = io.BytesIO()
    im.save(buf, "TIFF", tiffinfo=info)
    buf.seek(0)
    return Image.open(buf)


def _mappa_con_punto(w: int, h: int, lon_sx: float, lon: float, lat: float) -> np.ndarray:
    """Mappa nera con un punto bianco (3×3 pixel) alla longitudine est e latitudine indicate."""
    a = np.zeros((h, w), dtype=np.uint8)
    c = int(((lon - lon_sx) % 360.0) / 360.0 * w)
    r = int((90.0 - lat) / 180.0 * h)
    a[r - 1 : r + 2, c - 1 : c + 2] = 255
    return a


def _posizione(im: Image.Image) -> tuple[float, float]:
    a = np.asarray(im.convert("L"), dtype=np.float64)
    r, c = np.unravel_index(np.argmax(a), a.shape)
    lon = -180.0 + (c + 0.5) * 360.0 / tx.LARGHEZZA
    lat = 90.0 - (r + 0.5) * 180.0 / tx.ALTEZZA
    return lon, lat


def test_georef_e_canonica_da_geotiff():
    # mappa centrata su 180° (bordo sinistro a 0° est), come i prodotti USGS a longitudine positiva ovest
    raggio = 1000.0
    w, h = 4096, 2048
    scala = 2 * np.pi * raggio / w
    im = _geotiff(_mappa_con_punto(w, h, 0.0, 30.0, 20.0), 180.0, -np.pi * raggio, scala, raggio)
    g = tx.georef_geotiff(im)
    assert g is not None
    assert g.lon_sinistra == pytest.approx(0.0, abs=1e-9)
    assert g.lat_alto == pytest.approx(90.0, abs=1e-9)
    assert g.dlon == pytest.approx(360.0 / w)
    lon, lat = _posizione(tx.canonica(im, g))
    assert lon == pytest.approx(30.0, abs=0.2) and lat == pytest.approx(20.0, abs=0.2)


def test_canonica_bordo_sinistro_qualsiasi():
    for lon_sx in (-180.0, 0.0, 180.0, 37.5):
        a = _mappa_con_punto(2048, 1024, lon_sx, -100.0, -45.0)
        g = tx.georef_globale(2048, 1024, lon_sx)
        lon, lat = _posizione(tx.canonica(Image.fromarray(a), g))
        assert lon == pytest.approx(-100.0, abs=0.36) and lat == pytest.approx(-45.0, abs=0.36), lon_sx


def test_mappa_non_globale_rifiutata():
    with pytest.raises(ValueError):
        tx.canonica(Image.new("L", (1000, 1000)), tx.Georef(-180.0, 90.0, 0.18, 0.18))


def test_capovolgimento_tritone():
    """Polo del corpo opposto al nord della mappa: (lon, lat) -> (-lon, -lat) dopo la rotazione di 180°."""
    a = _mappa_con_punto(2048, 1024, -180.0, 60.0, 30.0)
    im = tx.canonica(Image.fromarray(a), tx.georef_globale(2048, 1024, -180.0)).rotate(180)
    lon, lat = _posizione(im)
    assert lon == pytest.approx(-60.0, abs=0.36) and lat == pytest.approx(-30.0, abs=0.36)


def test_jpeg_entro_limite():
    rng = np.random.default_rng(1)
    im = Image.fromarray(rng.integers(0, 255, (1024, 2048), dtype=np.uint8))
    dati, q = tx.jpeg_entro(im, 900_000)
    assert len(dati) <= 900_000 and 40 <= q <= 95
    with pytest.raises(ValueError):
        tx.jpeg_entro(im, 1_000)


def test_estratti_pagina():
    pagina = b"<html><dt>Use Constraints</dt><dd>Please cite authors</dd><p>Credits: </p><p>NASA/JPL</p></html>"
    e = tx.estratti_pagina(pagina)
    assert e["Use Constraints"] == "Please cite authors"
    assert e["frase0"] == "Credits: NASA/JPL"


def test_texture_pubblicate_e_frammento():
    fr = tx.frammento()
    assert fr["area"] == "tex"
    slug = {s.slug for s in tx.SORGENTI}
    assert set(fr["corpi"]) <= slug
    totale = 0
    for s, v in fr["corpi"].items():
        t = v["texture"]
        assert (t["file"], t["lon0_u"], t["verso"]) == (f"tex/{s}.jpg", 0.5, "est")
        p = tx.CARTELLA_TEX / f"{s}.jpg"
        with Image.open(p) as im:
            assert im.format == "JPEG" and im.size == (2048, 1024)
        n = p.stat().st_size
        assert n <= 600_000
        totale += n
    assert totale <= 13_000_000
    assert fr["corpi"]["tritone"]["texture"]["areeNonOsservate"] == "parziali"
    assert fr["corpi"]["plutone"]["texture"]["areeNonOsservate"] == "emisfero-sud"
    pagine = json.loads(tx.FILE_FONTI.read_text(encoding="utf-8"))["pagine"]
    for s in tx.SORGENTI:
        assert s.pagina in pagine, s.slug
