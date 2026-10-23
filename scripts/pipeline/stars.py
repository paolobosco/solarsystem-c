"""Stelle: Bright Star Catalogue con astrometria Hipparcos 2007 e moto spaziale alla data (§ 8.8, § 9).

Sorgenti (VizieR, doi:10.26093/cds/vizier):
- V/50: Bright Star Catalogue, 5ª ed. riveduta, versione preliminare (Hoffleit e Warren 1991): HR, HD,
  posizione FK5 J2000, V, B-V, moto proprio FK5, velocità radiale.
- I/311: Hipparcos, nuova riduzione (van Leeuwen 2007, A&A 474, 653): posizione ICRS all'epoca J1991,25,
  parallasse, moto proprio ed errori.
- I/239: Hipparcos (ESA 1997), file hip_main.dat: numero HD di ogni stella HIP, per l'associazione.

Modello (§ 8.8): moto 3D rettilineo (come ERFA starpm) se la parallasse Hipparcos è positiva con errore
relativo ≤ 20% e la velocità radiale BSC è nota; altrimenti moto lineare angolare (versore più vettore
tangente). Direzione alla data: normalize(d·u + v·Δt) oppure normalize(u + v·Δt), Δt in anni giuliani
da J2000,0 (TT). Sistema: eclittica J2000 (I4).

Colore: il file conserva B-V del BSC (in sua assenza quello di I/311, se associata). La tabella di
riferimento B-V -> sRGB (Ballesteros 2012, EPL 97, 34008; corpo nero; funzioni colorimetriche CIE 1931 2°
tabulate, doi:10.25039/CIE.DS.xvudnb9b; sRGB IEC 61966-2-1) è scritta nelle fixture per verificare
l'approssimazione usata dal rendering.

Uso (da scripts/pipeline/):
  .venv/bin/python stars.py scarica   # cataloghi in .cache/stars/, ReadMe in raw/stars/ (rete)
  .venv/bin/python stars.py genera    # stars.bin, out/validazione-stelle.json e fixture
  .venv/bin/python stars.py fixture   # tests/fixtures/catalogo/stelle.json (seme 20261023)
"""

from __future__ import annotations

import argparse
import datetime as _dt
import gzip
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

import erfa
import numpy as np
from numpy.typing import NDArray

import physical as ph
from common import binio
from common import constants as cst
from common.frames import MATRICE_ICRF_A_ECLITTICA
from common.manifest import (
    CARTELLA_CACHE,
    CARTELLA_PIPELINE,
    aggiorna_manifest_sorgenti,
    cerca_sorgente,
    verifica_sorgente,
    voce_sorgente,
)

RAW = CARTELLA_PIPELINE / "raw" / "stars"
CACHE = CARTELLA_CACHE / "stars"
RADICE_REPO = CARTELLA_PIPELINE.parent.parent
FILE_STELLE = RADICE_REPO / "public" / "data" / "v1" / "stars.bin"
FILE_VALIDAZIONE = CARTELLA_PIPELINE / "out" / "validazione-stelle.json"
CARTELLA_FIXTURE = RADICE_REPO / "tests" / "fixtures" / "catalogo"
SEME_FIXTURE = 20261023

CDS = "https://cdsarc.cds.unistra.fr/ftp"
GRANDI: dict[str, tuple[str, str]] = {
    # nome nel manifest delle sorgenti -> (URL, descrizione)
    "stars/V50-catalog.gz": (f"{CDS}/V/50/catalog.gz", "Bright Star Catalogue 5a ed. riveduta (VizieR V/50)"),
    "stars/I311-hip2.dat.gz": (f"{CDS}/I/311/hip2.dat.gz", "Hipparcos, nuova riduzione (VizieR I/311)"),
    "stars/I239-hip_main.dat": (f"{CDS}/I/239/hip_main.dat", "Hipparcos, catalogo principale (VizieR I/239)"),
}
PICCOLI: dict[str, str] = {
    "V50-ReadMe.txt": f"{CDS}/V/50/ReadMe",
    "I311-ReadMe.txt": f"{CDS}/I/311/ReadMe",
    "I239-ReadMe.txt": f"{CDS}/I/239/ReadMe",
    "CIE_xyz_1931_2deg.csv": "https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv",
}

MAGIC = b"SSSTAR01"
DIM_RECORD = 40
_FMT_RECORD = struct.Struct("<9fHBB")
assert _FMT_RECORD.size == DIM_RECORD
FLAG_MOTO_3D = 1
FLAG_LINEARE_ANGOLARE = 2

# Epoche (JD TT): Hipparcos J1991,25 e J2000,0.
JD_HIPPARCOS = 2448349.0625
ANNI_HIP_J2000 = (cst.J2000 - JD_HIPPARCOS) / 365.25
MAS = math.pi / 180.0 / 3.6e6
ARCSEC = math.pi / 648000.0
AU_PER_PC = 648000.0 / math.pi
GIORNI_ANNO = 365.25
ERRORE_RELATIVO_PARALLASSE = 0.2
SEPARAZIONE_MAX_ARCSEC = 60.0


# --- Sorgenti ---


def scarica() -> None:
    oggi = _dt.date.today().isoformat()
    for nome, url in PICCOLI.items():
        ph.congela(nome, url, cartella=RAW, offline=False)
    for nome, (url, descr) in GRANDI.items():
        p = CARTELLA_CACHE / nome
        if not p.exists():
            ph.scarica_su_file(url, p)
        aggiorna_manifest_sorgenti(voce_sorgente(nome, url, nome, oggi, descr))


def _file_grande(nome: str) -> Path:
    voce = cerca_sorgente(nome)
    verifica_sorgente(voce)
    return CARTELLA_CACHE / voce["percorsoCache"]


def _testo(nome: str) -> list[str]:
    p = _file_grande(nome)
    dati = p.read_bytes()
    if p.suffix == ".gz":
        dati = gzip.decompress(dati)
    return dati.decode("latin-1").splitlines()


def _campo(riga: str, inizio: int, fine: int) -> str:
    """Campo per byte 1-based inclusivi, come nei ReadMe di VizieR."""
    return riga[inizio - 1 : fine].strip()


def _float(s: str) -> float | None:
    s = s.strip()
    return float(s) if s else None


def _int(s: str) -> int | None:
    s = s.strip()
    return int(s) if s else None


# --- Lettura dei cataloghi ---


@dataclass
class StellaBsc:
    hr: int
    hd: int | None
    ra: float  # rad, FK5 J2000
    dec: float
    v: float
    bv: float | None
    pmra: float | None  # μα·cosδ, rad/anno (FK5)
    pmdec: float | None
    rv: float | None  # km/s


def leggi_bsc(righe: list[str]) -> list[StellaBsc]:
    """Stelle con posizione (le 14 voci rimosse dal catalogo hanno i campi vuoti); byte da V/50 ReadMe."""
    out = []
    for r in righe:
        r = r.ljust(197)
        if not _campo(r, 76, 77):
            continue
        ra = (int(_campo(r, 76, 77)) + int(_campo(r, 78, 79)) / 60.0 + float(_campo(r, 80, 83)) / 3600.0) * 15.0
        dec = int(_campo(r, 85, 86)) + int(_campo(r, 87, 88)) / 60.0 + int(_campo(r, 89, 90)) / 3600.0
        if _campo(r, 84, 84) == "-":
            dec = -dec
        v = _float(_campo(r, 103, 107))
        if v is None:
            raise ValueError(f"HR {_campo(r, 1, 4)} senza magnitudine V")
        pmra = _float(_campo(r, 149, 154))
        pmdec = _float(_campo(r, 155, 160))
        out.append(
            StellaBsc(
                hr=int(_campo(r, 1, 4)),
                hd=_int(_campo(r, 26, 31)),
                ra=math.radians(ra),
                dec=math.radians(dec),
                v=v,
                bv=_float(_campo(r, 110, 114)),
                pmra=None if pmra is None else pmra * ARCSEC,
                pmdec=None if pmdec is None else pmdec * ARCSEC,
                rv=_float(_campo(r, 167, 170)),
            )
        )
    return out


@dataclass
class StellaHip:
    hip: int
    ra: float  # rad ICRS, J1991,25
    dec: float
    plx: float  # mas
    pmra: float  # mas/anno, μα·cosδ
    pmdec: float
    e_plx: float
    bv: float | None  # B-V del catalogo Hipparcos


def leggi_hip2(righe: list[str]) -> dict[int, StellaHip]:
    """I/311 hip2.dat (byte da I/311 ReadMe)."""
    out = {}
    for r in righe:
        h = int(_campo(r, 1, 6))
        out[h] = StellaHip(
            hip=h,
            ra=float(_campo(r, 16, 28)),
            dec=float(_campo(r, 30, 42)),
            plx=float(_campo(r, 44, 50)),
            pmra=float(_campo(r, 52, 59)),
            pmdec=float(_campo(r, 61, 68)),
            e_plx=float(_campo(r, 84, 89)),
            bv=_float(_campo(r, 153, 158)),
        )
    return out


def leggi_hd_hip(righe: list[str]) -> dict[int, list[int]]:
    """I/239 hip_main.dat: HD (byte 391-396) -> numeri HIP (byte 9-14); separatori '|'."""
    out: dict[int, list[int]] = {}
    for r in righe:
        hd = _int(_campo(r, 391, 396))
        if hd is not None:
            out.setdefault(hd, []).append(int(_campo(r, 9, 14)))
    return out


# --- Geometria ---


def versore(ra: float, dec: float) -> NDArray[np.float64]:
    return np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])


def tangente(ra: float, dec: float, pmra_cos: float, pmdec: float) -> NDArray[np.float64]:
    """Vettore tangente (rad/anno) da μα·cosδ e μδ: μα*·ê_α + μδ·ê_δ."""
    ea = np.array([-math.sin(ra), math.cos(ra), 0.0])
    ed = np.array([-math.sin(dec) * math.cos(ra), -math.sin(dec) * math.sin(ra), math.cos(dec)])
    return pmra_cos * ea + pmdec * ed


def separazione(a: NDArray[np.float64], b: NDArray[np.float64]) -> float:
    """Angolo tra due vettori (rad), formula stabile con atan2."""
    return math.atan2(float(np.linalg.norm(np.cross(a, b))), float(a @ b))


def direzione_alla_data(u, d: float, v, flag: int, anni: float) -> NDArray[np.float64]:
    """Formula del § 8.8 (stessa del runtime)."""
    u = np.asarray(u, dtype=np.float64)
    v = np.asarray(v, dtype=np.float64)
    if flag & FLAG_MOTO_3D and d > 0:
        x = d * u + v * anni
    elif flag & FLAG_LINEARE_ANGOLARE:
        x = u + v * anni
    else:
        x = u
    return x / np.linalg.norm(x)


@dataclass
class Record:
    hr: int
    u: NDArray[np.float64]  # eclittica J2000, versore a J2000,0
    d: float  # pc, 0 se non disponibile
    v: NDArray[np.float64]  # pc/anno (3D) o rad/anno (angolare)
    mag_v: float
    bv: float  # NaN se assente
    flag: int
    origine: str  # "hip-3d", "hip-angolare", "bsc-angolare", "bsc-fisso"
    hip: int | None = None
    separazione_bsc: float | None = None  # rad, tra BSC e Hipparcos a J2000
    bv_hipparcos: bool = False  # B-V assente nel BSC e preso da I/311


def record_3d(s: StellaBsc, h: StellaHip) -> Record:
    """Moto 3D: stato a J2000,0 con ERFA (pmsafe da J1991,25, poi starpv), in pc e pc/anno."""
    pmr = h.pmra * MAS / math.cos(h.dec)  # dα/dt (rad/anno), come richiesto da ERFA
    ra2, dec2, pmr2, pmd2, px2, rv2 = erfa.pmsafe(
        h.ra, h.dec, pmr, h.pmdec * MAS, h.plx / 1000.0, s.rv, JD_HIPPARCOS, 0.0, cst.J2000, 0.0
    )
    pv = erfa.starpv(ra2, dec2, pmr2, pmd2, px2, rv2)
    p = MATRICE_ICRF_A_ECLITTICA @ (pv["p"] / AU_PER_PC)
    v = MATRICE_ICRF_A_ECLITTICA @ (pv["v"] * GIORNI_ANNO / AU_PER_PC)
    d = float(np.linalg.norm(p))
    return Record(s.hr, p / d, d, v, s.v, _bv(s), FLAG_MOTO_3D, "hip-3d", h.hip)


def record_angolare_hip(s: StellaBsc, h: StellaHip) -> Record:
    """Moto lineare angolare dall'epoca Hipparcos: u e v scalati perché la formula del § 8.8 valga da J2000."""
    u0 = versore(h.ra, h.dec)
    v0 = tangente(h.ra, h.dec, h.pmra * MAS, h.pmdec * MAS)
    x = u0 + v0 * ANNI_HIP_J2000
    n = float(np.linalg.norm(x))
    d = 1000.0 / h.plx if h.plx > 0 else 0.0
    rec = Record(s.hr, x / n, d, v0 / n, s.v, _bv(s), FLAG_LINEARE_ANGOLARE, "hip-angolare", h.hip)
    rec.u = MATRICE_ICRF_A_ECLITTICA @ rec.u
    rec.v = MATRICE_ICRF_A_ECLITTICA @ rec.v
    return rec


def record_bsc(s: StellaBsc) -> Record:
    """Stelle senza astrometria Hipparcos: posizione e moto proprio FK5 J2000 del BSC (bias FK5/ICRS trascurato)."""
    u = MATRICE_ICRF_A_ECLITTICA @ versore(s.ra, s.dec)
    if s.pmra is None or s.pmdec is None:
        return Record(s.hr, u, 0.0, np.zeros(3), s.v, _bv(s), 0, "bsc-fisso")
    v = MATRICE_ICRF_A_ECLITTICA @ tangente(s.ra, s.dec, s.pmra, s.pmdec)
    return Record(s.hr, u, 0.0, v, s.v, _bv(s), FLAG_LINEARE_ANGOLARE, "bsc-angolare")


def _bv(s: StellaBsc) -> float:
    return float("nan") if s.bv is None else s.bv


def associa(bsc: list[StellaBsc], hip: dict[int, StellaHip], hd_hip: dict[int, list[int]]) -> list[Record]:
    """Associazione via HD con controllo di posizione (≤ 60″ a J2000); in caso di più candidati il più vicino."""
    scelte: dict[int, tuple[StellaHip, float]] = {}
    for s in bsc:
        if s.hd is None:
            continue
        ub = versore(s.ra, s.dec)
        migliore: tuple[StellaHip, float] | None = None
        for n in hd_hip.get(s.hd, []):
            h = hip.get(n)
            if h is None:
                continue
            u0 = versore(h.ra, h.dec) + tangente(h.ra, h.dec, h.pmra * MAS, h.pmdec * MAS) * ANNI_HIP_J2000
            sep = separazione(ub, u0)
            if sep <= SEPARAZIONE_MAX_ARCSEC * ARCSEC and (migliore is None or sep < migliore[1]):
                migliore = (h, sep)
        if migliore is not None:
            scelte[s.hr] = migliore
    # una stella HIP associata a più voci BSC resta alla più vicina
    per_hip: dict[int, int] = {}
    for hr, (h, sep) in scelte.items():
        if h.hip not in per_hip or sep < scelte[per_hip[h.hip]][1]:
            per_hip[h.hip] = hr
    validi = set(per_hip.values())
    out = []
    for s in bsc:
        if s.hr in validi:
            h, sep = scelte[s.hr]
            buona = h.plx > 0 and h.e_plx <= ERRORE_RELATIVO_PARALLASSE * h.plx
            rec = record_3d(s, h) if buona and s.rv is not None else record_angolare_hip(s, h)
            rec.separazione_bsc = sep
            if s.bv is None and h.bv is not None:
                rec.bv = h.bv
                rec.bv_hipparcos = True
        else:
            rec = record_bsc(s)
        out.append(rec)
    return out


# --- stars.bin (§ 8.8) ---


def scrivi_stars_bin(records: list[Record]) -> bytes:
    n = len(records)
    dim = binio.DIM_INTESTAZIONE + DIM_RECORD * n
    intest = binio.Intestazione(MAGIC, binio.TIPO_STELLE, -1, n, cst.T0, cst.T_END, binio.DIM_INTESTAZIONE, dim)
    parti = [binio.scrivi_intestazione(intest)]
    for r in records:
        parti.append(_FMT_RECORD.pack(*r.u, r.d, *r.v, r.mag_v, r.bv, r.hr, r.flag, 0))
    dati = b"".join(parti)
    assert len(dati) == dim
    return dati


def leggi_stars_bin(dati: bytes) -> dict[str, NDArray]:
    """Lettura di riferimento (stesse verifiche del lettore runtime)."""
    i = binio.leggi_intestazione(dati)
    if i.magic != MAGIC or i.tipo != binio.TIPO_STELLE or i.blocco != -1:
        raise binio.ErroreFormato("file delle stelle non conforme")
    if i.offset_voci != binio.DIM_INTESTAZIONE or i.dimensione != binio.DIM_INTESTAZIONE + DIM_RECORD * i.n_voci:
        raise binio.ErroreFormato("dimensione del file delle stelle non conforme")
    campi = [("u", "<f4", 3), ("d", "<f4"), ("v", "<f4", 3), ("V", "<f4"), ("BV", "<f4")]
    dt = np.dtype([*campi, ("HR", "<u2"), ("flag", "u1"), ("r", "u1")])
    a = np.frombuffer(dati, dtype=dt, count=i.n_voci, offset=binio.DIM_INTESTAZIONE)
    return {k: a[k] for k in dt.names}


# --- Colore di riferimento (fixture) ---


def temperatura_da_bv(bv: float) -> float:
    """Ballesteros (2012), EPL 97, 34008, eq. 14."""
    return 4600.0 * (1.0 / (0.92 * bv + 1.7) + 1.0 / (0.92 * bv + 0.62))


def leggi_cmf() -> NDArray[np.float64]:
    righe = (RAW / "CIE_xyz_1931_2deg.csv").read_text(encoding="utf-8").split()
    return np.array([[float(x) for x in r.split(",")] for r in righe])


def srgb_lineare_corpo_nero(t: float, cmf: NDArray[np.float64]) -> NDArray[np.float64]:
    """Corpo nero (Planck) integrato con le funzioni CIE 1931 2° tabulate a 1 nm, XYZ -> sRGB lineare (D65),
    massimo 1 (IEC 61966-2-1)."""
    lam = cmf[:, 0] * 1e-9
    c2 = 1.438776877e-2  # m·K, CODATA 2018
    b = 1.0 / (lam**5 * np.expm1(c2 / (lam * t)))
    xyz = (b[:, None] * cmf[:, 1:]).sum(axis=0)
    m = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    rgb = np.maximum(m @ xyz, 0.0)
    return rgb / rgb.max()


# --- Generazione e validazione ---


def costruisci() -> tuple[list[Record], dict]:
    bsc = leggi_bsc(_testo("stars/V50-catalog.gz"))
    hip = leggi_hip2(_testo("stars/I311-hip2.dat.gz"))
    hd_hip = leggi_hd_hip(_testo("stars/I239-hip_main.dat"))
    rec = associa(bsc, hip, hd_hip)
    stat = statistiche(rec)
    return rec, stat


def statistiche(rec: list[Record]) -> dict:
    origini: dict[str, int] = {}
    for r in rec:
        origini[r.origine] = origini.get(r.origine, 0) + 1
    sep = np.array([r.separazione_bsc for r in rec if r.separazione_bsc is not None]) / ARCSEC
    # moto 3D: formula lineare del § 8.8 contro ERFA starpm (con il tempo luce) agli estremi dell'intervallo
    scarti = {}
    for anno, jd in (("-9999", cst.JD_MIN_UT), ("2120", cst.JD_MAX_UT_EXCL)):
        mx = 0.0
        anni = (jd - cst.J2000) / GIORNI_ANNO
        for r in rec:
            if r.flag != FLAG_MOTO_3D:
                continue
            p = r.d * r.u
            v = r.v
            # ERFA lavora in ICRS: si riporta lo stato dall'eclittica, si propaga e si confronta
            pi = MATRICE_ICRF_A_ECLITTICA.T @ p * AU_PER_PC
            vi = MATRICE_ICRF_A_ECLITTICA.T @ v * AU_PER_PC / GIORNI_ANNO
            pv = np.zeros((), dtype=erfa.dt_pv)
            pv["p"], pv["v"] = pi, vi
            ra, dec, pmr, pmd, px, rv = erfa.pvstar(pv)
            ra2, dec2, *_ = erfa.starpm(ra, dec, pmr, pmd, px, rv, cst.J2000, 0.0, jd, 0.0)
            atteso = MATRICE_ICRF_A_ECLITTICA @ versore(ra2, dec2)
            mx = max(mx, separazione(direzione_alla_data(r.u, r.d, r.v, r.flag, anni), atteso))
        scarti[anno] = mx / ARCSEC
    # Float32: arrotondamento della direzione memorizzata (rispetto a Float64)
    f32 = 0.0
    for r in rec:
        u32 = np.asarray(r.u, dtype=np.float32).astype(np.float64)
        f32 = max(f32, separazione(u32, r.u))
    spostamenti = sorted(
        (
            (
                separazione(direzione_alla_data(r.u, r.d, r.v, r.flag, (cst.JD_MIN_UT - cst.J2000) / GIORNI_ANNO), r.u),
                r.hr,
            )
            for r in rec
        ),
        reverse=True,
    )[:5]
    return {
        "formato": 1,
        "stelle": len(rec),
        "origini": dict(sorted(origini.items())),
        "senzaBV": sum(1 for r in rec if math.isnan(r.bv)),
        "bvDaHipparcos": sum(1 for r in rec if r.bv_hipparcos),
        "separazioneBscHipArcsec": {
            "mediana": float(np.median(sep)),
            "p99": float(np.percentile(sep, 99)),
            "massimo": float(sep.max()),
        },
        "moto3dControStarpmArcsec": scarti,
        "arrotondamentoFloat32Arcsec": f32 / ARCSEC,
        "spostamentiMaggioriA-9999Gradi": [{"hr": hr, "gradi": math.degrees(a)} for a, hr in spostamenti],
    }


def genera() -> dict:
    rec, stat = costruisci()
    dati = scrivi_stars_bin(rec)
    FILE_STELLE.parent.mkdir(parents=True, exist_ok=True)
    FILE_STELLE.write_bytes(dati)
    stat["byte"] = len(dati)
    FILE_VALIDAZIONE.write_text(json.dumps(stat, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return stat


def scrivi_fixture(cartella: Path = CARTELLA_FIXTURE) -> Path:
    """Campione di stelle dal file pubblicato con direzioni attese e tabella dei colori di riferimento."""
    dati = FILE_STELLE.read_bytes()
    s = leggi_stars_bin(dati)
    rng = np.random.default_rng(SEME_FIXTURE)
    n = len(s["HR"])
    idx = sorted({int(i) for i in rng.choice(n, 60, replace=False)} | _indici_notevoli(s))
    epoche = [cst.JD_MIN_UT, -1000000.5, 0.0, 2299160.5, cst.J2000, cst.JD_MAX_UT_EXCL]
    stelle = []
    for i in idx:
        u = s["u"][i].astype(np.float64)
        v = s["v"][i].astype(np.float64)
        d = float(s["d"][i])
        f = int(s["flag"][i])
        dirs = [direzione_alla_data(u, d, v, f, (t - cst.J2000) / GIORNI_ANNO).tolist() for t in epoche]
        stelle.append({"indice": i, "hr": int(s["HR"][i]), "flag": f, "direzioni": dirs})
    cmf = leggi_cmf()
    colori = []
    for bv in np.round(np.arange(-0.4, 2.01, 0.1), 2):
        t = temperatura_da_bv(float(bv))
        colori.append({"bv": float(bv), "temperatura": t, "rgbLineare": srgb_lineare_corpo_nero(t, cmf).tolist()})
    out = {
        "formato": 1,
        "seme": SEME_FIXTURE,
        "numero": int(n),
        "sha256": ph.sha256_bytes(dati),
        "epoche": epoche,
        "stelle": stelle,
        "colori": colori,
        "fonteColori": "Ballesteros 2012; Planck; CIE 1931 2° (CIE 018:2019, tab. 6, CC BY-SA 4.0); sRGB D65",
    }
    cartella.mkdir(parents=True, exist_ok=True)
    p = cartella / "stelle.json"
    p.write_text(json.dumps(out) + "\n", encoding="utf-8")
    return p


def _indici_notevoli(s: dict[str, NDArray]) -> set[int]:
    """Sirio (HR 2491), Arturo (5340), Vega (7001), Polare (424), Rigel Kentaurus A (5459), Betelgeuse (2061)."""
    hr = s["HR"]
    return {int(np.nonzero(hr == h)[0][0]) for h in (2491, 5340, 7001, 424, 5459, 2061) if np.any(hr == h)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("comando", choices=["scarica", "genera", "fixture"])
    a = ap.parse_args(argv)
    if a.comando == "scarica":
        scarica()
    elif a.comando == "genera":
        print(json.dumps(genera(), ensure_ascii=False, indent=1))
        scrivi_fixture()  # la fixture dei test segue sempre il file pubblicato
    else:
        print(f"scritto {scrivi_fixture()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
