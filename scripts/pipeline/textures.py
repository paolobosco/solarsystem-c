"""Texture dei corpi: JPEG 2048 × 1024 equirettangolari da fonti di pubblico dominio o con attribuzione (§ 8.12, § 9).

Ogni sorgente è ricampionata nel sistema fisso del corpo usato a runtime (R10): riga 0 al polo +z del corpo
(convenzionePolo del catalogo), longitudine 0 al centro (lon0_u = 0,5), longitudini crescenti verso est
lungo u. La georeferenziazione delle GeoTIFF USGS è letta dai tag GeoTIFF (ModelTiepoint, ModelPixelScale,
meridiano centrale e raggio); per le immagini senza tag è dichiarata nella tabella SORGENTI con la fonte.

Frammento out/catalog-tex.json: campo `texture` (file, lon0_u, verso, fonte, licenza, aree non osservate).
Pagine ufficiali di licenza e credito: estratti in raw/tex/fonti.json (URL, data, SHA-256 della pagina,
frasi citate). Elenco completo in docs/LICENZE.md.

Uso (da scripts/pipeline/):
  .venv/bin/python textures.py pagine      # estratti delle pagine ufficiali in raw/tex/fonti.json (rete)
  .venv/bin/python textures.py genera      # scarica, ricampiona e scrive public/data/v1/tex/*.jpg
  .venv/bin/python textures.py catalogo    # out/catalog-tex.json
"""

from __future__ import annotations

import argparse
import datetime as _dt
import html
import io
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

import physical as ph
from common.manifest import (
    CARTELLA_CACHE,
    CARTELLA_PIPELINE,
    aggiorna_manifest_sorgenti,
    sha256_bytes,
    sha256_file,
    voce_sorgente,
)

Image.MAX_IMAGE_PIXELS = None

RAW = CARTELLA_PIPELINE / "raw" / "tex"
CACHE = CARTELLA_CACHE / "tex"
RADICE_REPO = CARTELLA_PIPELINE.parent.parent
CARTELLA_TEX = RADICE_REPO / "public" / "data" / "v1" / "tex"
FILE_FRAMMENTO = CARTELLA_PIPELINE / "out" / "catalog-tex.json"
FILE_FONTI = RAW / "fonti.json"

LARGHEZZA = 2048
ALTEZZA = 1024
BYTE_MAX = 600 * 1024  # § 8.12
BYTE_OBIETTIVO = 400_000  # 24 texture entro circa 9,6 MB: il budget totale di 48 MB (§ 8.1) lo richiede
SOGLIA_CANCELLAZIONE = 40 * 1024 * 1024  # le sorgenti più grandi si eliminano dopo l'uso

USGS_S3 = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic"
ASTROPEDIA = "https://astrogeology.usgs.gov/search/map"
PAG_NASA_MEDIA = "https://www.nasa.gov/nasa-brand-center/images-and-media/"
PAG_USGS_PD = "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits"

LIC_USGS = "pubblico dominio (USGS)"
LIC_NASA = "NASA: non soggetta a copyright negli Stati Uniti, con credito"
LIC_CITA = "uso libero con citazione degli autori (USGS Astropedia)"
LIC_PD_CITA = "pubblico dominio, con citazione degli autori (USGS Astropedia)"
LIC_CCBY = "CC BY 4.0"


@dataclass
class Sorgente:
    slug: str
    url: str
    pagina: str
    credito: str
    licenza: str
    aree: str = "nessuna"  # 'nessuna' | 'parziali' | 'emisfero-sud'
    # Senza tag GeoTIFF: longitudine est del bordo sinistro (gradi); None = da GeoTIFF
    lon_sinistra: float | None = None
    # Sistema del corpo con polo +z opposto al nord IAU della mappa (satelliti sincroni retrogradi)
    capovolgi: bool = False
    nota: str = ""
    estratti: list[str] = field(default_factory=list)

    @property
    def nome_file(self) -> str:
        return self.url.rsplit("/", 1)[-1]


SORGENTI: list[Sorgente] = [
    Sorgente(
        "terra",
        "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg",
        "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/",
        "NASA Earth Observatory, Blue Marble Next Generation, luglio 2004 (Stöckli et al. 2005)",
        LIC_NASA,
        lon_sinistra=-180.0,
    ),
    Sorgente(
        "luna",
        "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif",
        "https://svs.gsfc.nasa.gov/4720",
        "NASA's Scientific Visualization Studio, CGI Moon Kit (dati LRO LROC WAC)",
        LIC_NASA,
        lon_sinistra=-180.0,
        nota="mappa centrata sulla longitudine 0 (pagina SVS 4720)",
    ),
    Sorgente(
        "mercurio",
        f"{USGS_S3}/Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif",
        f"{ASTROPEDIA}/mercury_messenger_mdis_global_color_mosaic_665m",
        "MESSENGER Team (Arizona State University), mosaico a colori (USGS Astrogeology)",
        LIC_PD_CITA,
    ),
    Sorgente(
        "venere",
        f"{USGS_S3}/Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m.tif",
        f"{ASTROPEDIA}/venus_magellan_global_c3_mdir_synthetic_color_mosaic_4641m",
        "USGS Astrogeology Science Center, mosaico Magellan C3-MDIR a colori sintetici (NASA/JPL)",
        LIC_USGS,
        nota="radar: colori sintetici, non visibili",
    ),
    Sorgente(
        "marte",
        f"{USGS_S3}/Mars_Viking_ClrMosaic_global_925m.tif",
        f"{ASTROPEDIA}/mars_viking_global_color_mosaic_925m",
        "USGS Astrogeology Science Center, mosaico a colori Viking (NASA/JPL)",
        LIC_USGS,
    ),
    Sorgente(
        "giove",
        "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif",
        "https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/",
        "NASA/JPL/Space Science Institute, PIA07782 (Cassini, dicembre 2000)",
        LIC_NASA,
        lon_sinistra=-180.0,
        nota="griglia di PIA07782 fig. 1: 180°O a sinistra, 0° al centro; nubi in moto rispetto al Sistema III",
    ),
    Sorgente(
        "saturno",
        "https://www.solarsystemscope.com/textures/download/2k_saturn.jpg",
        "https://www.solarsystemscope.com/textures/",
        "Solar System Scope (INOVE), basata su dati NASA",
        LIC_CCBY,
        aree="parziali",
        lon_sinistra=-180.0,
        nota="longitudine non definita (atmosfera a bande); lacune riempite dall'autore",
    ),
    Sorgente(
        "urano",
        "https://www.solarsystemscope.com/textures/download/2k_uranus.jpg",
        "https://www.solarsystemscope.com/textures/",
        "Solar System Scope (INOVE), basata su dati NASA",
        LIC_CCBY,
        aree="parziali",
        lon_sinistra=-180.0,
        nota="longitudine non definita (atmosfera a bande); lacune riempite dall'autore",
    ),
    Sorgente(
        "nettuno",
        "https://www.solarsystemscope.com/textures/download/2k_neptune.jpg",
        "https://www.solarsystemscope.com/textures/",
        "Solar System Scope (INOVE), basata su dati NASA",
        LIC_CCBY,
        aree="parziali",
        lon_sinistra=-180.0,
        nota="longitudine non definita (atmosfera a bande); lacune riempite dall'autore",
    ),
    Sorgente(
        "io",
        f"{USGS_S3}/Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif",
        f"{ASTROPEDIA}/io_galileo_ssi_voyager_color_merged_global_mosaic_1km",
        "USGS Astrogeology Science Center, mosaico Galileo SSI e Voyager a colori (NASA/JPL)",
        LIC_USGS,
    ),
    Sorgente(
        "europa",
        f"{USGS_S3}/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif",
        f"{ASTROPEDIA}/europa_voyager_galileo_ssi_global_mosaic_500m",
        "USGS Astrogeology Science Center (T. Becker), mosaico Voyager e Galileo SSI (NASA/JPL)",
        LIC_USGS,
    ),
    Sorgente(
        "ganimede",
        f"{USGS_S3}/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif",
        f"{ASTROPEDIA}/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km",
        "USGS Astrogeology Science Center, mosaico Voyager e Galileo SSI a colori (NASA/JPL)",
        LIC_USGS,
    ),
    Sorgente(
        "callisto",
        f"{USGS_S3}/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif",
        f"{ASTROPEDIA}/callisto_galileo_voyager_global_mosaic_1km",
        "USGS Astrogeology Science Center, mosaico Voyager e Galileo SSI (NASA/JPL)",
        LIC_USGS,
    ),
    Sorgente(
        "encelado",
        f"{USGS_S3}/Enceladus_Cassini_mosaic_global_110m.tif",
        f"{ASTROPEDIA}/enceladus_cassini_global_mosaic_110m",
        "Cassini Team, JPL, Space Science Institute, mosaico Cassini ISS (USGS Astrogeology)",
        LIC_PD_CITA,
    ),
    Sorgente(
        "teti",
        f"{USGS_S3}/Tethys_Cassini_mosaic_global_293m.tif",
        f"{ASTROPEDIA}/tethys_cassini_global_mosaic_293m",
        "Roatsch, Kersten, Hoffmeister, Wählisch (DLR), mosaico Cassini ISS (NASA/JPL/SSI)",
        LIC_PD_CITA,
    ),
    Sorgente(
        "dione",
        f"{USGS_S3}/Dione_Cassini_Voyager_mosaic_global_154m.tif",
        f"{ASTROPEDIA}/dione_cassini_voyager_global_mosaic_154m",
        "NASA, JPL, Space Science Institute, mosaico Cassini ISS e Voyager (USGS Astrogeology)",
        LIC_PD_CITA,
    ),
    Sorgente(
        "rea",
        f"{USGS_S3}/Rhea_Cassini_Voyager_mosaic_global_417m.tif",
        f"{ASTROPEDIA}/rhea_cassini_voyager_global_mosaic_417m",
        "Roatsch, Kersten, Hoffmeister, Wählisch (DLR), mosaico Cassini ISS e Voyager (NASA/JPL/SSI)",
        LIC_PD_CITA,
    ),
    Sorgente(
        "giapeto",
        f"{USGS_S3}/Iapetus_Cassini_Voyager_mosaic_global_783m.tif",
        f"{ASTROPEDIA}/iapetus_cassini_voyager_global_mosaic_803m",
        "Space Science Institute, Cassini Team, JPL, mosaico Cassini ISS e Voyager (USGS Astrogeology)",
        LIC_PD_CITA,
    ),
    Sorgente(
        "titano",
        f"{USGS_S3}/Titan_ISS_P19658_Mosaic_Global_4km.tif",
        "https://science.nasa.gov/photojournal/titan-global-map-june-2015/",
        "NASA/JPL-Caltech/Space Science Institute, PIA19658 (Cassini ISS, giugno 2015), copia USGS Astrogeology",
        LIC_NASA,
        nota="immagini a 938 nm attraverso l'atmosfera: albedo superficiale, non colori visibili",
    ),
    Sorgente(
        "tritone",
        f"{USGS_S3}/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif",
        f"{ASTROPEDIA}/triton_voyager_2_global_color_mosaic_600m",
        "Lunar and Planetary Institute (P. Schenk), mosaico Voyager 2 a colori (NASA/JPL), PIA18668",
        LIC_PD_CITA,
        aree="parziali",
        capovolgi=True,
        nota="aree non osservate riempite; sistema del corpo con polo sul momento angolare dell'orbita retrograda",
    ),
    Sorgente(
        "plutone",
        f"{USGS_S3}/Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif",
        f"{ASTROPEDIA}/pluto_new_horizons_lorri_mvic_global_mosaic_300m",
        "New Horizons Team (NASA/JHUAPL/SwRI), mosaico LORRI e MVIC (USGS Astrogeology)",
        LIC_CITA,
        aree="emisfero-sud",
    ),
    Sorgente(
        "caronte",
        f"{USGS_S3}/Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif",
        f"{ASTROPEDIA}/charon_new_horizons_lorri_mvic_global_mosaic_300m",
        "New Horizons Team (NASA/JHUAPL/SwRI), mosaico LORRI e MVIC (USGS Astrogeology)",
        LIC_CITA,
        aree="emisfero-sud",
    ),
    Sorgente(
        "cerere",
        f"{USGS_S3}/Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif",
        f"{ASTROPEDIA}/ceres_dawn_fc_global_mosaic_400m",
        "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA, mosaico Dawn FC (DLR)",
        LIC_CITA,
    ),
    Sorgente(
        "vesta",
        f"{USGS_S3}/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif",
        f"{ASTROPEDIA}/vesta_dawn_fc_hamo_global_mosaic_60m",
        "NASA/JPL-Caltech/UCLA/MPS/DLR/IDA, mosaico Dawn FC HAMO (DLR)",
        LIC_CITA,
        nota="sistema Claudia double prime (IAU), come il modello WGCCRE 2015",
    ),
]


# --- Pagine ufficiali (licenza e credito) ---

CAMPI_ASTROPEDIA = ("Primary Authors", "Originators", "Publisher", "Access Constraints", "Use Constraints")
FRASI = (
    r"Credits?:\s*\n\s*[^\n]+",
    r"Please give credit for this item to:\s*\n\s*[^\n]+",
    r"Distributed under Attribution 4\.0 International license[^\n]*",
    r"generally are not subject to copyright in the United States\.",
    r"The map is centered on 0° longitude\.",
    r"The map is centered on 0. longitude\.",
)


def _testo_pagina(dati: bytes) -> str:
    t = dati.decode("utf-8", errors="replace")
    t = re.sub(r"<script.*?</script>", "", t, flags=re.S)
    t = re.sub(r"<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    t = html.unescape(t)
    return re.sub(r"\n\s*\n+", "\n", t)


def estratti_pagina(dati: bytes) -> dict[str, str]:
    """Campi di licenza e credito citati testualmente dalla pagina."""
    t = _testo_pagina(dati)
    out: dict[str, str] = {}
    for k in CAMPI_ASTROPEDIA:
        m = re.search(re.escape(k) + r"\s*\n\s*([^\n]+)", t)
        if m:
            out[k] = re.sub(r"\s+", " ", m.group(1)).strip()
    for i, rx in enumerate(FRASI):
        m = re.search(rx, t)
        if m:
            out[f"frase{i}"] = re.sub(r"\s+", " ", m.group(0)).strip()
    return out


def aggiorna_pagine() -> dict:
    """Scarica le pagine ufficiali e ne registra URL, data, SHA-256 ed estratti (risposte piccole congelate)."""
    pagine = sorted({s.pagina for s in SORGENTI} | {PAG_NASA_MEDIA})
    reg: dict = {"formato": 1, "pagine": {}}
    for url in pagine:
        dati = ph.scarica(url)
        reg["pagine"][url] = {
            "estrazione": _dt.date.today().isoformat(),
            "byte": len(dati),
            "sha256": sha256_bytes(dati),
            "estratti": estratti_pagina(dati),
        }
    # la pagina USGS sul pubblico dominio rifiuta i client non interattivi: frase citata a mano
    reg["pagine"][PAG_USGS_PD] = {
        "estrazione": _dt.date.today().isoformat(),
        "estratti": {
            "frase": "USGS-authored or produced data and information are considered to be in the U.S. Public Domain."
        },
    }
    RAW.mkdir(parents=True, exist_ok=True)
    FILE_FONTI.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return reg


# --- Georeferenziazione ---


@dataclass
class Georef:
    """Bordo sinistro (longitudine est, gradi), bordo superiore (latitudine, gradi) e passo in gradi per pixel."""

    lon_sinistra: float
    lat_alto: float
    dlon: float
    dlat: float


def georef_geotiff(im: Image.Image) -> Georef | None:
    """Tag GeoTIFF: tiepoint (pixel 0,0 -> x, y in metri), scala in metri, raggio e meridiano centrale."""
    t = im.tag_v2 if hasattr(im, "tag_v2") else {}
    tie = t.get(33922)
    scala = t.get(33550)
    chiavi = t.get(34735)
    doppi = t.get(34736)
    if not (tie and scala and chiavi and doppi):
        return None
    geo: dict[int, float] = {}
    for i in range(4, len(chiavi) - 3, 4):
        k, loc, cnt, off = chiavi[i : i + 4]
        if loc == 34736 and cnt == 1:
            geo[k] = doppi[off]
    raggio = geo.get(2057)  # GeogSemiMajorAxisGeoKey
    lon_c = geo.get(3088, 0.0)  # ProjCenterLongGeoKey
    lat_ts = geo.get(3078, 0.0)  # ProjStdParallel1GeoKey
    if not raggio:
        return None
    i0, j0, _, x0, y0, _ = tie
    sx, sy = scala[0], scala[1]
    k_x = raggio * math.cos(math.radians(lat_ts)) * math.pi / 180.0
    k_y = raggio * math.pi / 180.0
    lon_sin = lon_c + (x0 - i0 * sx) / k_x
    lat_alto = (y0 + j0 * sy) / k_y
    return Georef(lon_sin, lat_alto, sx / k_x, sy / k_y)


def georef_globale(larghezza: int, altezza: int, lon_sinistra: float) -> Georef:
    return Georef(lon_sinistra, 90.0, 360.0 / larghezza, 180.0 / altezza)


# --- Ricampionamento ---


def canonica(im: Image.Image, g: Georef) -> Image.Image:
    """Immagine 2048 × 1024 con longitudine -180° al bordo sinistro, est verso destra, nord in alto."""
    if im.mode in ("I;16", "I;16B", "I", "F"):
        a16 = np.asarray(im, dtype=np.float64)
        im = Image.fromarray(np.clip(a16 / max(float(a16.max()), 1.0) * 255.0 + 0.5, 0, 255).astype(np.uint8))
    im = im.convert("L") if im.mode in ("L", "1") else im.convert("RGB")
    w, h = im.size
    if abs(w * g.dlon - 360.0) > 2.0 * g.dlon or abs(g.lat_alto - 90.0) > 2.0 * g.dlat:
        raise ValueError(f"mappa non globale: {w} × {g.dlon}°, bordo superiore {g.lat_alto}°")
    if abs(h * g.dlat - 180.0) > 2.0 * g.dlat:
        raise ValueError(f"mappa non globale in latitudine: {h} × {g.dlat}°")
    # riduzione intera preliminare (filtro a scatola) fino a circa 2 volte la risoluzione finale
    k = max(1, int(min(w / (2 * LARGHEZZA), h / (2 * ALTEZZA))))
    if k > 1:
        im = im.reduce(k)
        g = Georef(g.lon_sinistra, g.lat_alto, g.dlon * k, g.dlat * k)
        w, h = im.size
    # rotazione orizzontale: colonna (frazionaria) della longitudine -180°
    c = ((-180.0 - g.lon_sinistra) / g.dlon) % w
    n = int(math.floor(c))
    f = c - n
    a = np.asarray(im)
    a = np.roll(a, -n, axis=1)
    a = np.concatenate([a, a[:, :1]], axis=1)  # colonna di raccordo per il bordo destro
    r = Image.fromarray(a)
    y0 = max(0.0, (g.lat_alto - 90.0) / g.dlat)
    box = (f, y0, min(f + 360.0 / g.dlon, w + 1.0), min(y0 + 180.0 / g.dlat, float(h)))
    return r.resize((LARGHEZZA, ALTEZZA), Image.Resampling.LANCZOS, box=box)


def jpeg_entro(im: Image.Image, byte_max: int = BYTE_OBIETTIVO) -> tuple[bytes, int]:
    """Massima qualità JPEG (ricerca binaria 40-95) entro byte_max."""
    lo, hi = 40, 95
    migliore: tuple[bytes, int] | None = None
    while lo <= hi:
        q = (lo + hi) // 2
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        d = buf.getvalue()
        if len(d) <= byte_max:
            migliore = (d, q)
            lo = q + 1
        else:
            hi = q - 1
    if migliore is None:
        raise ValueError("impossibile rispettare la dimensione massima")
    return migliore


# --- Generazione ---


def _sorgente_locale(s: Sorgente, offline: bool) -> Path:
    p = CACHE / s.slug / s.nome_file
    if not p.exists():
        if offline:
            raise FileNotFoundError(f"sorgente assente: {p}")
        ph.scarica_su_file(s.url, p)
        nome = f"tex/{s.slug}/{s.nome_file}"
        oggi = _dt.date.today().isoformat()
        aggiorna_manifest_sorgenti(voce_sorgente(nome, s.url, nome, oggi, f"texture di {s.slug}"))
    return p


def _png_canonica(s: Sorgente) -> Path:
    return CACHE / s.slug / "canonica.png"


def canonica_sorgente(s: Sorgente, offline: bool = False, conserva: bool = False) -> tuple[Image.Image, dict]:
    """Immagine canonica del corpo (2048 × 1024, PNG senza perdita in cache) e metadati dell'elaborazione."""
    png = _png_canonica(s)
    meta_f = png.with_suffix(".json")
    if png.exists() and meta_f.exists():
        return Image.open(png), json.loads(meta_f.read_text(encoding="utf-8"))
    p = _sorgente_locale(s, offline)
    with Image.open(p) as im:
        im.load()
        g = georef_geotiff(im) if s.lon_sinistra is None else georef_globale(*im.size, s.lon_sinistra)
        if g is None:
            raise ValueError(f"{s.slug}: georeferenziazione assente")
        meta = {
            "slug": s.slug,
            "sorgente": s.nome_file,
            "sha256Sorgente": sha256_file(p),
            "modo": im.mode,
            "dimensioni": list(im.size),
            "georef": {"lonSinistra": g.lon_sinistra, "latAlto": g.lat_alto, "dlon": g.dlon, "dlat": g.dlat},
            "capovolta": s.capovolgi,
        }
        out = canonica(im, g)
    if s.capovolgi:
        # polo del corpo opposto al nord della mappa: latitudine e longitudine cambiano segno
        out = out.rotate(180)
    png.parent.mkdir(parents=True, exist_ok=True)
    out.save(png, optimize=False)
    meta_f.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not conserva and p.stat().st_size > SOGLIA_CANCELLAZIONE:
        p.unlink()
    return out, meta


def elabora(s: Sorgente, offline: bool = False, conserva: bool = False, byte_max: int = BYTE_OBIETTIVO) -> dict:
    p_src = CACHE / s.slug / s.nome_file
    # sorgente già JPEG 2048 × 1024 con longitudine -180° a sinistra: copiata senza ricompressione
    if (
        s.nome_file.lower().endswith(".jpg")
        and s.lon_sinistra == -180.0
        and not s.capovolgi
        and (p_src.exists() or not offline)
    ):
        p_src = _sorgente_locale(s, offline)
        with Image.open(p_src) as im:
            if im.size == (LARGHEZZA, ALTEZZA) and p_src.stat().st_size <= byte_max:
                dati = p_src.read_bytes()
                CARTELLA_TEX.mkdir(parents=True, exist_ok=True)
                (CARTELLA_TEX / f"{s.slug}.jpg").write_bytes(dati)
                return {"slug": s.slug, "sorgente": s.nome_file, "copia": True, "qualita": None, "byte": len(dati)}
    out, meta = canonica_sorgente(s, offline, conserva)
    dati, q = jpeg_entro(out, byte_max)
    CARTELLA_TEX.mkdir(parents=True, exist_ok=True)
    (CARTELLA_TEX / f"{s.slug}.jpg").write_bytes(dati)
    return {**meta, "copia": False, "qualita": q, "byte": len(dati)}


def genera(slug: list[str] | None = None, offline: bool = False) -> list[dict]:
    """Elabora le sorgenti richieste; il registro out/texture-elaborazione.json è aggiornato dopo ogni corpo."""
    registro = CARTELLA_PIPELINE / "out" / "texture-elaborazione.json"
    esiti = []
    for s in SORGENTI:
        if slug and s.slug not in slug:
            continue
        e = elabora(s, offline=offline)
        print(json.dumps(e, ensure_ascii=False), flush=True)
        esiti.append(e)
        prec = json.loads(registro.read_text(encoding="utf-8")) if registro.exists() else {}
        prec[e["slug"]] = e
        testo = json.dumps(dict(sorted(prec.items())), ensure_ascii=False, indent=1) + "\n"
        registro.write_text(testo, encoding="utf-8")
    return esiti


def frammento() -> dict:
    corpi = {}
    for s in SORGENTI:
        f = CARTELLA_TEX / f"{s.slug}.jpg"
        if not f.exists():
            continue
        fonte = f"{s.credito}; {s.pagina}"
        if s.nota:
            fonte += f"; {s.nota}"
        corpi[s.slug] = {
            "texture": {
                "file": f"tex/{s.slug}.jpg",
                "lon0_u": 0.5,
                "verso": "est",
                "fonte": fonte,
                "licenza": s.licenza,
                "areeNonOsservate": s.aree,
            }
        }
    return {"formato": 1, "area": "tex", "corpi": corpi}


def scrivi_frammento() -> Path:
    FILE_FRAMMENTO.write_text(json.dumps(frammento(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return FILE_FRAMMENTO


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("comando", choices=["pagine", "genera", "catalogo"])
    ap.add_argument("--corpo", action="append", help="limita a uno o più slug")
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args(argv)
    if a.comando == "pagine":
        aggiorna_pagine()
    elif a.comando == "genera":
        genera(a.corpo, a.offline)
    else:
        print(f"scritto {scrivi_frammento()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
