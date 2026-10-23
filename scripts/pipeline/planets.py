"""Pianeti, Plutone e baricentro Terra-Luna da DE441 (§ 7.3, § 8.3; passo 2 del § 12.3).

Per ogni blocco k (§ 8.1) e ogni corpo: elementi equinoziali osculanti eliocentrici campionati su una
griglia a passo costante allineata a T0, residui Float32 rispetto a riferimenti Float64, aloni di 4
campioni per lato; un file `public/data/v1/planets/pKK.bin` per blocco (formato SSSERIE1, tipo 1).

Continuità ai confini (§ 7.3.4): il nodo al confine t_b è comune ai blocchi k-1 e k. I riferimenti a0
e λ0 del blocco k sono spostati di meno di un'unità Float32 del residuo perché il campione in t_b
ricostruisca esattamente (in Float64) i valori del blocco k-1; h, k, p, q del nodo sono copiati.

Uso (da scripts/pipeline/):
  .venv/bin/python planets.py genera          # scrive i 13 file
  .venv/bin/python planets.py valida          # A4 su 2000 epoche + confini, scansione densa
  .venv/bin/python planets.py fixture         # tests/fixtures/planets/
  .venv/bin/python planets.py catalogo        # out/catalog-planets.json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from common import binio
from common import constants as cst
from common.de441 import De441
from common.equinoctial import elementi_da_stato, lambda_continua
from common.interp import griglia, tempi_campioni
from common.manifest import cerca_sorgente, sha256_bytes

RADICE = Path(__file__).resolve().parents[2]
CARTELLA_DATI = RADICE / "public" / "data" / "v1" / "planets"
CARTELLA_FIXTURE = RADICE / "tests" / "fixtures" / "planets"
CARTELLA_OUT = Path(__file__).resolve().parent / "out"

RAD_ARCSEC = 648000.0 / math.pi


@dataclass(frozen=True)
class Corpo:
    ssid: int  # ssid nei file dei pianeti (scripts/pipeline/bodies.json)
    naif: int  # baricentro DE441
    slug: str
    passo: float  # d, blocchi 0-10
    passo_moderno: float  # d, blocchi 11-12


# Passi del § 7.3.3, salvo Mercurio ed EMB a 16 d in tutti i blocchi: a 32 d la scansione densa
# supera le tolleranze (Mercurio 2,04″; EMB 328 km), misure in docs/_parti/pianeti-luna.md.
CORPI: tuple[Corpo, ...] = (
    Corpo(1, 1, "mercurio", 16.0, 16.0),
    Corpo(2, 2, "venere", 32.0, 32.0),
    Corpo(200, 3, "baricentro-terra-luna", 16.0, 16.0),
    Corpo(4, 4, "marte", 64.0, 64.0),
    Corpo(5, 5, "giove", 256.0, 256.0),
    Corpo(6, 6, "saturno", 256.0, 256.0),
    Corpo(7, 7, "urano", 512.0, 512.0),
    Corpo(8, 8, "nettuno", 512.0, 512.0),
    Corpo(10, 9, "plutone", 512.0, 512.0),
)
PER_SSID = {c.ssid: c for c in CORPI}
BLOCCHI_MODERNI = (11, 12)
SSID_EMB = 200

# Tolleranze vincolanti (§ 7.3.4, A4).
TOLL_ARCSEC = 2.0
TOLL_EMB_MODERNI_KM = 100.0
TOLL_EMB_KM = 250.0
TOLL_CONTINUITA_KM = 1.0

SEME_VALIDAZIONE = 20261101
N_EPOCHE_UNIFORMI = 2000
# Punti per passo nell'intorno ±1 passo di ogni confine (estremi inclusi).
PUNTI_CONFINE = 9


def passo(c: Corpo, k: int) -> float:
    return c.passo_moderno if k in BLOCCHI_MODERNI else c.passo


def nome_file(k: int) -> str:
    return f"p{k:02d}.bin"


# --- Costruzione dei segmenti ---


@dataclass(frozen=True)
class Raccordo:
    """Valori ricostruiti dal blocco precedente al nodo di confine (Float64) e h, k, p, q (Float32)."""

    a: float
    lam: float
    hkpq: NDArray[np.float32]


def ricostruzione_finale(seg: binio.Segmento) -> Raccordo:
    """a e λ ricostruiti al nodo finale del nucleo (stesse operazioni di valuta_segmento in un nodo)."""
    j = seg.n_campioni - 1 - binio.ALONI_E[1]
    d = seg.dati[j].astype(np.float64)
    a = seg.a0 + d[0]
    lam = seg.lam0 + seg.n * (seg.t_primo + seg.h * j - seg.t_primo) + d[5]
    return Raccordo(float(a), float(lam), seg.dati[j, 1:5].copy())


def segmento_raccordato(
    t_primo: float,
    h: float,
    inizio: float,
    fine: float,
    stati: NDArray[np.float64],
    mu: float,
    raccordo: Raccordo | None,
) -> binio.Segmento:
    """Segmento E da stati con il campione iniziale raccordato al blocco precedente."""
    _, fi = elementi_da_stato(stati, mu)
    if np.any(fi != fi[0]):
        raise ValueError("fattore I non costante nel segmento")
    fattore_i = int(fi[0])
    el, _ = elementi_da_stato(stati, mu, fattore_i)
    t = tempi_campioni(t_primo, h, stati.shape[0])
    el[:, 5] = lambda_continua(t, el[:, 5], el[:, 0], mu, cst.GIORNO_S)
    seg = binio.segmento_e(t_primo, h, inizio, fine, mu, fattore_i, el)
    if raccordo is None:
        return seg
    j0 = binio.ALONI_E[0]
    x = h * np.arange(el.shape[0], dtype=np.float64)
    x0 = float(x[j0])
    # a: a0 spostato perché a0 + δa(j0) riproduca il valore del blocco precedente
    da0 = np.float32(raccordo.a - seg.a0)
    a0 = raccordo.a - float(da0)
    # λ: bersaglio portato sul ramo continuo di questo blocco
    lin = seg.lam0 + seg.n * x0
    bersaglio = raccordo.lam + 2.0 * math.pi * round((lin + float(seg.dati[j0, 5]) - raccordo.lam) / (2.0 * math.pi))
    dl0 = np.float32(bersaglio - lin)
    lam0 = bersaglio - float(dl0) - seg.n * x0
    dati = np.empty_like(seg.dati)
    dati[:, 0] = el[:, 0] - a0
    dati[:, 1:5] = el[:, 1:5]
    dati[:, 5] = el[:, 5] - (lam0 + seg.n * x)
    dati[j0, 0] = da0
    dati[j0, 1:5] = raccordo.hkpq
    dati[j0, 5] = dl0
    if np.max(np.abs(dati[:, 5])) >= 1.0:
        raise ValueError("residuo di λ non inferiore a 1 rad")
    out = binio.Segmento(binio.SEG_E, h, t_primo, inizio, fine, dati, fattore_i, mu, a0, lam0, seg.n)
    binio.valida_segmento(out)
    return out


def segmento_blocco(de: De441, c: Corpo, k: int, raccordo: Raccordo | None) -> binio.Segmento:
    ini, fin = cst.inizio_blocco(k), cst.fine_blocco(k)
    h = passo(c, k)
    t_primo, n = griglia(ini, fin, h, *binio.ALONI_E, cst.T0)
    stati = de.stato_eliocentrico(c.naif, tempi_campioni(t_primo, h, n))
    return segmento_raccordato(t_primo, h, ini, fin, stati, cst.MU_ELIO[c.naif], raccordo)


def genera(cartella: Path = CARTELLA_DATI, de: De441 | None = None) -> dict[str, str]:
    """Scrive i 13 file pKK.bin; restituisce gli SHA-256."""
    cartella.mkdir(parents=True, exist_ok=True)
    proprio = de is None
    de = De441() if de is None else de
    raccordi: dict[int, Raccordo | None] = {c.ssid: None for c in CORPI}
    sha = {}
    try:
        for k in range(cst.K):
            corpi = {}
            for c in CORPI:
                seg = segmento_blocco(de, c, k, raccordi[c.ssid])
                raccordi[c.ssid] = ricostruzione_finale(seg)
                corpi[c.ssid] = [seg]
            dati = binio.scrivi_serie(binio.TIPO_PIANETI, k, cst.inizio_blocco(k), cst.fine_blocco(k), corpi)
            (cartella / nome_file(k)).write_bytes(dati)
            sha[nome_file(k)] = sha256_bytes(dati)
            print(f"{nome_file(k)}  {len(dati)} byte", flush=True)
    finally:
        if proprio:
            de.chiudi()
    return sha


# --- Lettura e valutazione ---


def leggi_blocchi(cartella: Path = CARTELLA_DATI) -> list[binio.FileSerie]:
    return [binio.leggi_serie((cartella / nome_file(k)).read_bytes()) for k in range(cst.K)]


def blocchi_di(t: NDArray[np.float64]) -> NDArray[np.int64]:
    return np.array([cst.blocco_di(float(x)) for x in t], dtype=np.int64)


def valuta(blocchi: list[binio.FileSerie], ssid: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Stati (n, 6) dai file, ciascun istante dal blocco che lo contiene."""
    out = np.full((t.size, 6), np.nan)
    kk = blocchi_di(t)
    for k in np.unique(kk):
        m = kk == k
        stati, esiti = binio.valuta_serie(blocchi[int(k)], ssid, t[m])
        if not np.all(esiti == binio.ESITO_OK):
            raise ValueError(f"esito non ok nel blocco {k}")
        out[m] = stati
    return out


# --- Validazione (A4) ---


def epoche_uniformi(seme: int = SEME_VALIDAZIONE, n: int = N_EPOCHE_UNIFORMI) -> NDArray[np.float64]:
    rng = np.random.default_rng(seme)
    return np.sort(rng.uniform(cst.T0, cst.T_END, n))


def epoche_confini(c: Corpo) -> NDArray[np.float64]:
    """Istanti in [t_b - h, t_b + h] attorno a ogni confine (inclusi T0 e T_END), dentro [T0, T_END)."""
    out = []
    confini = [cst.inizio_blocco(k) for k in range(cst.K)] + [cst.T_END]
    for tb in confini:
        kk = [k for k in range(cst.K) if cst.inizio_blocco(k) <= tb - 1e-9 < cst.fine_blocco(k)]
        kk += [k for k in range(cst.K) if cst.inizio_blocco(k) <= tb < cst.fine_blocco(k)]
        h = max(passo(c, k) for k in kk)
        for x in np.linspace(-1.0, 1.0, 2 * PUNTI_CONFINE - 1):
            t = tb + x * h
            if cst.T0 <= t < cst.T_END:
                out.append(t)
        out.append(math.nextafter(tb, -math.inf))
    return np.array(sorted(x for x in set(out) if cst.T0 <= x < cst.T_END))


def errori(stati: NDArray[np.float64], rif: NDArray[np.float64]) -> tuple[NDArray, NDArray]:
    """Errore angolare eliocentrico |Δr|/r (″) e |Δr| (km)."""
    dr = np.linalg.norm(stati[:, :3] - rif[:, :3], axis=1)
    r = np.linalg.norm(rif[:, :3], axis=1)
    return dr / r * RAD_ARCSEC, dr


def soglia_km(c: Corpo, t: NDArray[np.float64]) -> NDArray[np.float64]:
    if c.ssid != SSID_EMB:
        return np.full(t.size, np.inf)
    kk = blocchi_di(t)
    return np.where(np.isin(kk, BLOCCHI_MODERNI), TOLL_EMB_MODERNI_KM, TOLL_EMB_KM)


def continuita(blocchi: list[binio.FileSerie], c: Corpo) -> list[float]:
    """|Δr| (km) tra i blocchi k-1 e k valutati al confine comune."""
    out = []
    for k in range(1, cst.K):
        tb = cst.inizio_blocco(k)
        sx = binio.valuta_segmento(blocchi[k - 1].corpi[c.ssid][0], np.array([tb]))
        dx = binio.valuta_segmento(blocchi[k].corpi[c.ssid][0], np.array([tb]))
        out.append(float(np.linalg.norm(sx[0, :3] - dx[0, :3])))
    return out


FRAZIONI_DENSE = tuple(j / 8.0 for j in range(1, 8))
INTERVALLI_RAFFINATI = 40
FRAZIONI_RAFFINATE = 64


def scansione_densa(de: De441, blocchi: list[binio.FileSerie], c: Corpo) -> dict:
    """Errore in 7 punti interni di ogni intervallo della griglia, in tutti i blocchi; poi 64 punti
    negli intervalli peggiori di ogni blocco (stima del massimo vero)."""
    massimo_arcsec, massimo_km, t_max = 0.0, 0.0, 0.0
    per_blocco = []
    for k in range(cst.K):
        seg = blocchi[k].corpi[c.ssid][0]
        nodi = np.arange(seg.inizio, seg.fine, seg.h)
        t = np.concatenate([nodi + f * seg.h for f in FRAZIONI_DENSE])
        stati = binio.valuta_segmento(seg, t)
        rif = de.stato_eliocentrico(c.naif, t)
        ea, ek = errori(stati, rif)
        rms = float(np.sqrt(np.mean(ea**2)))
        # raffinamento negli intervalli peggiori
        peggiori = np.unique(np.floor((t[np.argsort(ea)[-INTERVALLI_RAFFINATI:]] - seg.inizio) / seg.h))
        f = np.arange(1, FRAZIONI_RAFFINATE) / FRAZIONI_RAFFINATE
        tr = (seg.inizio + seg.h * peggiori[:, None] + seg.h * f[None, :]).ravel()
        ear, ekr = errori(binio.valuta_segmento(seg, tr), de.stato_eliocentrico(c.naif, tr))
        t = np.concatenate([t, tr])
        ea = np.concatenate([ea, ear])
        ek = np.concatenate([ek, ekr])
        i = int(np.argmax(ea))
        per_blocco.append({"blocco": k, "maxArcsec": float(ea[i]), "maxKm": float(np.max(ek)), "rmsArcsec": rms})
        if ea[i] > massimo_arcsec:
            massimo_arcsec, t_max = float(ea[i]), float(t[i])
        massimo_km = max(massimo_km, float(np.max(ek)))
    return {"maxArcsec": massimo_arcsec, "tMax": t_max, "maxKm": massimo_km, "blocchi": per_blocco}


def valida(cartella: Path = CARTELLA_DATI, densa: bool = True) -> dict:
    blocchi = leggi_blocchi(cartella)
    rapporto: dict = {"seme": SEME_VALIDAZIONE, "corpi": {}}
    ok = True
    with De441() as de:
        tu = epoche_uniformi()
        for c in CORPI:
            tc = epoche_confini(c)
            voce: dict = {"passo": c.passo, "passoModerno": c.passo_moderno}
            for nome, t in (("uniformi", tu), ("confini", tc)):
                stati = valuta(blocchi, c.ssid, t)
                rif = de.stato_eliocentrico(c.naif, t)
                ea, ek = errori(stati, rif)
                sk = soglia_km(c, t)
                voce[nome] = {
                    "n": int(t.size),
                    "maxArcsec": float(np.max(ea)),
                    "rmsArcsec": float(np.sqrt(np.mean(ea**2))),
                    "maxKm": float(np.max(ek)),
                    "superamentiKm": int(np.sum(ek > sk)),
                }
                if c.ssid == SSID_EMB:
                    mod = np.isin(blocchi_di(t), BLOCCHI_MODERNI)
                    voce[nome]["maxKmModerni"] = float(np.max(ek[mod])) if np.any(mod) else None
                    voce[nome]["maxKmAltri"] = float(np.max(ek[~mod])) if np.any(~mod) else None
                ok &= bool(np.max(ea) <= TOLL_ARCSEC and np.all(ek <= sk))
            cont = continuita(blocchi, c)
            voce["continuitaMaxKm"] = max(cont)
            ok &= max(cont) < TOLL_CONTINUITA_KM
            if densa:
                t0 = time.time()
                voce["densa"] = scansione_densa(de, blocchi, c)
                voce["densa"]["secondi"] = round(time.time() - t0, 1)
            rapporto["corpi"][c.slug] = voce
            print(c.slug, json.dumps({k: v for k, v in voce.items() if k != "densa"}), flush=True)
            if densa:
                d = voce["densa"]
                print(f"  densa: max {d['maxArcsec']:.3f}″ a JD {d['tMax']}, {d['maxKm']:.1f} km", flush=True)
    rapporto["superato"] = bool(ok)
    return rapporto


# --- Fixture per i test TypeScript ---


def genera_fixture(cartella: Path = CARTELLA_FIXTURE, dati: Path = CARTELLA_DATI) -> Path:
    """Stati DE441 attesi su 2000 epoche uniformi per corpo più gli intorni dei confini.

    File binario Float64 little endian, righe [ssid, t, x, y, z (DE441), x, y, z (file, Python)];
    descrizione in pianeti.json.
    """
    cartella.mkdir(parents=True, exist_ok=True)
    blocchi = leggi_blocchi(dati)
    righe = []
    conteggi = {}
    with De441() as de:
        rng = np.random.default_rng(SEME_VALIDAZIONE + 1)
        for c in CORPI:
            t = np.concatenate([np.sort(rng.uniform(cst.T0, cst.T_END, N_EPOCHE_UNIFORMI)), epoche_confini(c)])
            rif = de.stato_eliocentrico(c.naif, t)
            mod = valuta(blocchi, c.ssid, t)
            righe.append(np.column_stack([np.full(t.size, c.ssid, dtype=np.float64), t, rif[:, :3], mod[:, :3]]))
            conteggi[c.slug] = int(t.size)
    tab = np.ascontiguousarray(np.concatenate(righe), dtype="<f8")
    (cartella / "pianeti-de441.bin").write_bytes(tab.tobytes())
    meta = {
        "descrizione": "Posizioni eliocentriche DE441 attese e posizioni dai file planets/pKK.bin valutate in Python",
        "generatore": "scripts/pipeline/planets.py fixture",
        "seme": SEME_VALIDAZIONE + 1,
        "file": "pianeti-de441.bin",
        "sha256": sha256_bytes(tab.tobytes()),
        "colonne": ["ssid", "t", "xDE441", "yDE441", "zDE441", "x", "y", "z"],
        "righe": int(tab.shape[0]),
        "unita": {"t": "JD TDB", "posizioni": "km, eclittica J2000 eliocentrica"},
        "epochePerCorpo": conteggi,
        "nota": "per ogni corpo: 2000 epoche uniformi in [T0, T_END) seguite dagli intorni di ±1 passo dei confini",
        "soglie": {
            "arcsec": TOLL_ARCSEC,
            "embKmBlocchi11e12": TOLL_EMB_MODERNI_KM,
            "embKmAltri": TOLL_EMB_KM,
            "continuitaKm": TOLL_CONTINUITA_KM,
        },
        "sha256File": {nome_file(k): sha256_bytes((dati / nome_file(k)).read_bytes()) for k in range(cst.K)},
        "tolleranzaRelativaPipelineSuggerita": 1e-12,
    }
    p = cartella / "pianeti.json"
    p.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return p


# --- Frammento di catalogo (§ 8.10): effemeridi, soluzione, epsModelloCostante ---

PERCORSO_CATALOGO = CARTELLA_OUT / "catalog-planets.json"
DATA_DE441 = "2020-06-25"  # "Integrated 25 June 2020", area commenti di de441_part-1.bsp
EPS_PIANETI_RAD = TOLL_ARCSEC / RAD_ARCSEC  # 2″ (§ 7.8.1, I11)
NAIF_CATALOGO = {
    "mercurio": 1,
    "venere": 2,
    "terra": 3,
    "marte": 4,
    "giove": 5,
    "saturno": 6,
    "urano": 7,
    "nettuno": 8,
    "plutone": 9,
}


def frammento_catalogo() -> dict:
    estrazione = cerca_sorgente("de441_part-1.bsp")["estrazione"]

    def soluzione(id_: str) -> dict:
        return {"id": id_, "data": DATA_DE441, "estrazione": estrazione, "modelloNG": None, "recordDastcom": None}

    corpi: dict[str, dict] = {
        "sole": {"effemeridi": {"modello": "sole"}, "soluzione": soluzione("DE441"), "epsModelloCostante": 0.0}
    }
    for slug, naif in NAIF_CATALOGO.items():
        corpi[slug] = {
            "effemeridi": {"modello": "pianeta", "naifDE441": naif},
            "soluzione": soluzione("DE441"),
            "epsModelloCostante": EPS_PIANETI_RAD,
        }
    corpi["luna"] = {
        "effemeridi": {"modello": "luna"},
        "soluzione": soluzione("ELP 2000-82B troncata (Meeus 1998, cap. 47) con correzioni stimate su DE441"),
        "epsModelloCostante": None,
    }
    return {"formato": 1, "area": "planets", "corpi": corpi}


def scrivi_catalogo(percorso: Path = PERCORSO_CATALOGO) -> Path:
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(json.dumps(frammento_catalogo(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return percorso


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("azione", choices=("genera", "valida", "fixture", "catalogo"))
    ap.add_argument("--senza-densa", action="store_true", help="salta la scansione densa")
    ap.add_argument("--rapporto", type=Path, default=CARTELLA_OUT / "validazione-pianeti.json")
    a = ap.parse_args(argv)
    if a.azione == "genera":
        for nome, h in genera().items():
            print(f"{h}  {nome}")
    elif a.azione == "valida":
        r = valida(densa=not a.senza_densa)
        a.rapporto.parent.mkdir(parents=True, exist_ok=True)
        a.rapporto.write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print("A4 superato" if r["superato"] else "A4 NON superato")
        return 0 if r["superato"] else 1
    elif a.azione == "catalogo":
        print(scrivi_catalogo())
    else:
        print(genera_fixture())
    return 0


if __name__ == "__main__":
    sys.exit(main())
