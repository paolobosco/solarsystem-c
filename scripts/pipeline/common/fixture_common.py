"""Fixture dei moduli comuni per i test TypeScript (tests/fixtures/common/).

- serie-prova.bin: file SSSERIE1 con Mercurio (segmento E da DE441, 2 anni a passo 32 d), un corpo
  sintetico retrogrado (segmento E con I = -1 seguito da un segmento C) e un corpo sintetico su
  orbita iperbolica (tre segmenti C con un intervallo scoperto);
- serie-prova.json: 200 epoche con stati attesi valutati dal file stesso (`binio.valuta_serie`);
- equinoziali.json: 100 casi stato <-> elementi equinoziali, inclusi casi retrogradi;
- constants.json: copia di common/constants.json.

Uso: python -m common.fixture_common [cartella di uscita]
"""

from __future__ import annotations

import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from . import binio
from . import constants as cst
from .de441 import De441
from .equinoctial import da_classici, elementi_da_stato, stato_da_elementi
from .interp import griglia, tempi_campioni
from .manifest import sha256_bytes

SEME = 20261018
CARTELLA_USCITA = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "common"

# Nucleo del file di prova: 23 passi di 32 d da un nodo della griglia allineata a T0.
INIZIO = 2459999.5
FINE = INIZIO + 23 * 32.0

SSID_MERCURIO = 1
SSID_RETROGRADO = 900
SSID_IPERBOLICO = 901

N_EPOCHE_SERIE = 200
N_CASI_EQUINOZIALI = 100


def _json(dati: dict) -> str:
    return json.dumps(dati, ensure_ascii=False, indent=1) + "\n"


def _lista(x: NDArray) -> list[float]:
    return [float(v) for v in x]


# --- Corpi del file di prova ---


def segmento_mercurio(de: De441, inizio: float = INIZIO, fine: float = FINE, h: float = 32.0) -> binio.Segmento:
    """Segmento E di Mercurio (baricentro 1) da DE441, griglia allineata a T0, μ = GM_Sole + GM_1."""
    t_primo, n = griglia(inizio, fine, h, *binio.ALONI_E, cst.T0)
    t = tempi_campioni(t_primo, h, n)
    stati = de.stato_eliocentrico(1, t)
    return binio.segmento_e_da_stati(t_primo, h, inizio, fine, stati, cst.MU_ELIO[1])


def _elementi_retrogradi(t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Elementi equinoziali sintetici (I = -1) con variazioni lente su tutte le componenti."""
    tau = t - 2460000.5
    a = 3.0 * cst.UA_KM * (1.0 + 2e-4 * np.sin(2 * math.pi * tau / 400.0))
    e = 0.6 + 1e-3 * np.cos(2 * math.pi * tau / 700.0)
    varpi = 1.1 + 2e-4 * tau / 365.25
    inc = math.radians(162.0) + math.radians(0.01) * np.sin(2 * math.pi * tau / 500.0)
    nodo = 4.0 - 1e-4 * tau / 365.25
    n0 = math.sqrt(cst.GM_SOLE / (3.0 * cst.UA_KM) ** 3) * cst.GIORNO_S
    lam = 0.3 + n0 * tau + 1e-3 * np.sin(2 * math.pi * tau / 300.0)
    tg = 1.0 / np.tan(0.5 * inc)
    return np.stack([a, e * np.sin(varpi), e * np.cos(varpi), tg * np.sin(nodo), tg * np.cos(nodo), lam], axis=-1)


def segmenti_retrogrado() -> list[binio.Segmento]:
    """Segmento E (h = 8 d, I = -1) e segmento C (h = 2 d) consecutivi."""
    meta = INIZIO + 400.0
    t_primo, n = griglia(INIZIO, meta, 8.0, *binio.ALONI_E, cst.T0)
    el = _elementi_retrogradi(tempi_campioni(t_primo, 8.0, n))
    seg_e = binio.segmento_e(t_primo, 8.0, INIZIO, meta, cst.GM_SOLE, -1, el)
    t_primo, n = griglia(meta, FINE, 2.0, *binio.ALONI_C, cst.T0)
    t = tempi_campioni(t_primo, 2.0, n)
    stati = stato_da_elementi(_elementi_retrogradi(t), cst.GM_SOLE, -1)
    seg_c = binio.segmento_c_da_stati(t_primo, 2.0, meta, FINE, stati)
    return [seg_e, seg_c]


def stato_iperbolico(t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Moto kepleriano iperbolico sintetico attorno al Sole (eclittica J2000, km e km/s)."""
    mu = cst.GM_SOLE
    q = 1.2 * cst.UA_KM
    e = 1.8
    a = q / (e - 1.0)
    inc, nodo, argp = math.radians(40.0), math.radians(80.0), math.radians(120.0)
    t_peri = 2460300.5
    n = math.sqrt(mu / a**3)
    m = n * (np.asarray(t, dtype=np.float64) - t_peri) * cst.GIORNO_S
    hh = np.arcsinh(m / e)
    for _ in range(60):
        hh = hh - (e * np.sinh(hh) - hh - m) / (e * np.cosh(hh) - 1.0)
    r = a * (e * np.cosh(hh) - 1.0)
    rq = math.sqrt(e * e - 1.0)
    xp = a * (e - np.cosh(hh))
    yp = a * rq * np.sinh(hh)
    fv = math.sqrt(mu * a) / r
    vxp = -fv * np.sinh(hh)
    vyp = fv * rq * np.cosh(hh)
    co, so, ci, si, cw, sw = (
        math.cos(nodo),
        math.sin(nodo),
        math.cos(inc),
        math.sin(inc),
        math.cos(argp),
        math.sin(argp),
    )
    px = np.array([co * cw - so * sw * ci, so * cw + co * sw * ci, sw * si])
    py = np.array([-co * sw - so * cw * ci, -so * sw + co * cw * ci, cw * si])
    pos = xp[:, None] * px + yp[:, None] * py
    vel = vxp[:, None] * px + vyp[:, None] * py
    return np.concatenate([pos, vel], axis=1)


def segmenti_iperbolico() -> list[binio.Segmento]:
    """Tre segmenti C (h = 4, 1, 2 d) con un intervallo scoperto [INIZIO + 400, INIZIO + 500)."""
    limiti = [(INIZIO, INIZIO + 200.0, 4.0), (INIZIO + 200.0, INIZIO + 400.0, 1.0), (INIZIO + 500.0, FINE, 2.0)]
    segs = []
    for ini, fin, h in limiti:
        t_primo, n = griglia(ini, fin, h, *binio.ALONI_C, cst.T0)
        stati = stato_iperbolico(tempi_campioni(t_primo, h, n))
        segs.append(binio.segmento_c_da_stati(t_primo, h, ini, fin, stati))
    return segs


def crea_serie_prova(de: De441) -> bytes:
    corpi = {
        SSID_MERCURIO: [segmento_mercurio(de)],
        SSID_RETROGRADO: segmenti_retrogrado(),
        SSID_IPERBOLICO: segmenti_iperbolico(),
    }
    return binio.scrivi_serie(binio.TIPO_PICCOLI_CORPI, -1, INIZIO, FINE, corpi)


# --- Epoche di prova ---


def epoche_serie(fs: binio.FileSerie, rng: np.random.Generator) -> list[tuple[int, float]]:
    """Epoche speciali (confini, nodi, intervalli scoperti, fuori copertura) più epoche casuali."""
    ini, fin = fs.intestazione.inizio, fs.intestazione.fine
    out: list[tuple[int, float]] = []
    for ssid, segs in sorted(fs.corpi.items()):
        out += [(ssid, ini - 1.0), (ssid, ini), (ssid, math.nextafter(fin, -math.inf)), (ssid, fin)]
        for s in segs:
            nodo = s.t_primo + s.h * math.ceil((s.inizio - s.t_primo) / s.h + 1)
            out += [(ssid, s.inizio), (ssid, math.nextafter(s.fine, -math.inf)), (ssid, nodo)]
    out.append((SSID_IPERBOLICO, INIZIO + 450.0))
    out = list(dict.fromkeys(out))
    ssids = sorted(fs.corpi)
    while len(out) < N_EPOCHE_SERIE:
        out.append((int(rng.choice(ssids)), float(rng.uniform(ini, fin))))
    return out


def casi_serie(fs: binio.FileSerie, epoche: list[tuple[int, float]]) -> list[dict]:
    casi = []
    for ssid, t in epoche:
        stato, esito = binio.valuta_serie(fs, ssid, np.array([t]))
        segs = fs.corpi[ssid]
        idx = None
        if esito[0] == binio.ESITO_OK:
            idx = max(j for j, s in enumerate(segs) if s.inizio <= t)
        casi.append(
            {
                "ssid": ssid,
                "t": t,
                "esito": str(esito[0]),
                "segmento": idx,
                "stato": _lista(stato[0]) if esito[0] == binio.ESITO_OK else None,
            }
        )
    return casi


# --- Casi equinoziali ---


def casi_equinoziali(rng: np.random.Generator) -> list[dict]:
    """12 casi su griglia (i ∈ {0, 90, 162, 179,9}°, e ∈ {0; 0,5; 0,97}) e 88 casuali."""
    mus = [cst.GM_SOLE, cst.GM_BARICENTRI[5], cst.GM_TERRA]
    scale = [cst.UA_KM, 1.0e6, 4.0e5]
    parametri = []
    for i_deg in (0.0, 90.0, 162.0, 179.9):
        for e in (0.0, 0.5, 0.97):
            parametri.append((0, rng.uniform(0.3, 40.0), e, math.radians(i_deg), 0))
    while len(parametri) < N_CASI_EQUINOZIALI:
        im = int(rng.integers(0, 3))
        giri = int(rng.integers(-1000, 1001)) if rng.uniform() < 0.25 else 0
        parametri.append((im, rng.uniform(0.3, 40.0), rng.uniform(0.0, 0.97), rng.uniform(0.0, math.pi), giri))
    casi = []
    for idc, (im, fa, e, inc, giri) in enumerate(parametri):
        mu = mus[im]
        a = fa * scale[im]
        nodo, argp, m = rng.uniform(0.0, 2 * math.pi, 3)
        el, fi = da_classici(a, e, inc, nodo, argp, m)
        el = np.asarray(el, dtype=np.float64)
        el[5] += 2 * math.pi * giri
        stato = stato_da_elementi(el, mu, int(fi))
        el2, _ = elementi_da_stato(stato, mu, int(fi))
        casi.append(
            {
                "id": idc,
                "mu": mu,
                "classici": {
                    "a": a,
                    "e": e,
                    "i": inc,
                    "nodo": float(nodo),
                    "argPeri": float(argp),
                    "anomaliaMedia": float(m),
                    "giriAggiunti": giri,
                },
                "fattoreI": int(fi),
                "elementi": _lista(el),
                "stato": _lista(stato),
                "elementiDaStato": _lista(el2),
            }
        )
    return casi


# --- Scrittura ---


def genera(cartella: Path = CARTELLA_USCITA, de: De441 | None = None) -> dict[str, str]:
    """Scrive le fixture e restituisce gli SHA-256 dei file prodotti."""
    cartella = Path(cartella)
    cartella.mkdir(parents=True, exist_ok=True)
    proprio = de is None
    de = De441() if de is None else de
    try:
        dati = crea_serie_prova(de)
    finally:
        if proprio:
            de.chiudi()
    fs = binio.leggi_serie(dati)
    rng = np.random.default_rng(SEME)
    serie = {
        "descrizione": "Stati attesi dal file serie-prova.bin, valutati con la funzione di riferimento Python",
        "generatore": "scripts/pipeline/common/fixture_common.py",
        "seme": SEME,
        "file": "serie-prova.bin",
        "sha256": sha256_bytes(dati),
        "unita": {"t": "JD TDB", "stato": "km, km/s, eclittica J2000 eliocentrica"},
        "tolleranzaRelativaSuggerita": 1e-12,
        "corpi": {
            str(SSID_MERCURIO): "Mercurio (baricentro 1, DE441), segmento E, h = 32 d",
            str(SSID_RETROGRADO): "sintetico retrogrado: segmento E (I = -1, h = 8 d) e segmento C (h = 2 d)",
            str(SSID_IPERBOLICO): "sintetico iperbolico (q = 1,2 UA, e = 1,8): segmenti C, h = 4, 1, 2 d, "
            f"intervallo scoperto [{INIZIO + 400.0}, {INIZIO + 500.0})",
        },
        "casi": casi_serie(fs, epoche_serie(fs, rng)),
    }
    rng = np.random.default_rng(SEME + 1)
    equin = {
        "descrizione": "Conversioni elementi equinoziali <-> stato (§ 7.2) calcolate in Python",
        "generatore": "scripts/pipeline/common/fixture_common.py",
        "seme": SEME + 1,
        "unita": {"a": "km", "mu": "km^3/s^2", "angoli": "rad", "stato": "km, km/s"},
        "colonneElementi": ["a", "h", "k", "p", "q", "lambda"],
        "nota": "elementiDaStato: calcolati dallo stato con fattoreI imposto; lambda ridotta a [-pi, pi)",
        "tolleranzaRelativaSuggerita": 1e-12,
        "casi": casi_equinoziali(rng),
    }
    file = {
        "serie-prova.bin": dati,
        "serie-prova.json": _json(serie).encode("utf-8"),
        "equinoziali.json": _json(equin).encode("utf-8"),
    }
    for nome, contenuto in file.items():
        (cartella / nome).write_bytes(contenuto)
    shutil.copyfile(cst.PERCORSO_JSON, cartella / "constants.json")
    return {nome: sha256_bytes((cartella / nome).read_bytes()) for nome in [*file, "constants.json"]}


if __name__ == "__main__":
    uscita = Path(sys.argv[1]) if len(sys.argv) > 1 else CARTELLA_USCITA
    for nome, h in genera(uscita).items():
        print(f"{h}  {nome}")
