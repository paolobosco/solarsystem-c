"""Lettura delle risposte della JPL Small-Body Database API (https://ssd-api.jpl.nasa.gov/doc/sbdb.html).

Parametri richiesti: cov=mat (covarianza completa), phys-par=1 (dati fisici), full-prec=1.
Elementi eliocentrici osculanti nell'eclittica J2000; angoli in gradi, q in UA, tp in JD TDB.
"""

from __future__ import annotations

import dataclasses
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from common.constants import UA_KM

from . import rete
from .anagrafica import RAW, Corpo

CARTELLA = RAW / "sbdb"

# g(r) standard del ghiaccio d'acqua (Marsden, Sekanina, Yeomans 1973, AJ 78, 211).
G_STANDARD = {"ALN": 0.1112620426, "NK": 4.6142, "NM": 2.15, "NN": 5.093, "R0": 2.808}
NOMI_G = ("ALN", "NK", "NM", "NN", "R0")
NOMI_NG = ("A1", "A2", "A3", "DT")
ELEMENTI_COV = ("e", "q", "tp", "node", "peri", "i")
TOLLERANZA_EPOCA = 1e-6  # d: epoche JD della covarianza e dell'orbita uguali entro l'arrotondamento della stampa


@dataclass
class OrbitaSbdb:
    orbit_id: str
    soln_date: str | None
    epoca: float  # JD TDB
    e: float
    q_au: float
    tp: float  # JD TDB
    nodo_deg: float
    argperi_deg: float
    inc_deg: float
    sigma: dict[str, float | None]
    testo: dict[str, str]  # valori come stringhe (per le cifre significative)
    ng: dict[str, float]  # A1..A3 (au/d^2), DT (d) presenti nella soluzione
    sigma_ng: dict[str, float | None]
    g: dict[str, float]  # parametri di g(r): ALN, NK, NM, NN, R0
    g_standard: bool
    cov_etichette: list[str] | None
    cov: np.ndarray | None
    cov_epoca: float | None
    cov_elementi: dict[str, float] | None  # elementi e, q, tp, node, peri, i della covarianza, all'epoca cov_epoca
    classe: str
    nome_classe: str
    primo_oss: str | None
    ultimo_oss: str | None
    n_oss: int | None
    sorgente: str | None
    produttore: str | None
    sb_usati: str | None
    pe_usata: str | None
    altri: dict = field(default_factory=dict)

    @property
    def q_km(self) -> float:
        return self.q_au * UA_KM

    @property
    def ha_ng(self) -> bool:
        return any(self.ng.get(k, 0.0) != 0.0 for k in ("A1", "A2", "A3"))


@dataclass
class RispostaSbdb:
    corpo: str
    fullname: str
    spkid: int
    kind: str
    orbita: OrbitaSbdb
    fisica: list[dict]
    grezzo: dict


def url_sbdb(designazione: str) -> str:
    return rete.url_con_parametri(
        rete.URL_SBDB, {"sstr": designazione, "cov": "mat", "phys-par": "1", "full-prec": "1"}
    )


def percorso(c: Corpo) -> Path:
    return CARTELLA / f"{c.slug}.json"


def scarica(c: Corpo, offline: bool = False) -> bytes:
    return rete.congelato(percorso(c), url_sbdb(c.sbdb), offline)


def _f(x: str | None) -> float | None:
    if x is None or x == "":
        return None
    return float(x)


def leggi(c: Corpo, dati: bytes | None = None) -> RispostaSbdb:
    d = json.loads(dati if dati is not None else percorso(c).read_bytes())
    if "object" not in d:
        raise ValueError(f"risposta SBDB senza oggetto per {c.slug}: {str(d)[:300]}")
    o = d["orbit"]
    el = {x["name"]: x for x in o["elements"]}
    sigma = {k: _f(v.get("sigma")) for k, v in el.items()}
    testo = {k: v["value"] for k, v in el.items() if v.get("value") is not None}
    ng: dict[str, float] = {}
    sigma_ng: dict[str, float | None] = {}
    g = dict(G_STANDARD)
    g_std = True
    for m in o.get("model_pars") or []:
        nome = m["name"]
        if nome in NOMI_NG:
            ng[nome] = float(m["value"])
            sigma_ng[nome] = _f(m.get("sigma"))
        elif nome in NOMI_G:
            g[nome] = float(m["value"])
            g_std = False
    cov = None
    etich = None
    cov_ep = None
    cov_el = None
    if o.get("covariance"):
        cv = o["covariance"]
        etich = list(cv["labels"])
        cov = np.array([[float(x) for x in riga] for riga in cv["data"]], dtype=np.float64)
        cov_ep = float(cv["epoch"])
        # SBDB restituisce gli elementi della covarianza quando l'epoca della soluzione differisce da quella dell'orbita
        if cv.get("elements"):
            cov_el = {e["label"]: float(e["value"]) for e in cv["elements"] if e.get("value") is not None}
    orb = OrbitaSbdb(
        orbit_id=str(o["orbit_id"]),
        soln_date=o.get("soln_date"),
        epoca=float(o["epoch"]),
        e=float(el["e"]["value"]),
        q_au=float(el["q"]["value"]),
        tp=float(el["tp"]["value"]),
        nodo_deg=float(el["om"]["value"]),
        argperi_deg=float(el["w"]["value"]),
        inc_deg=float(el["i"]["value"]),
        sigma=sigma,
        testo=testo,
        ng=ng,
        sigma_ng=sigma_ng,
        g=g,
        g_standard=g_std,
        cov_etichette=etich,
        cov=cov,
        cov_epoca=cov_ep,
        cov_elementi=cov_el,
        classe=d["object"]["orbit_class"]["code"],
        nome_classe=d["object"]["orbit_class"]["name"],
        primo_oss=o.get("first_obs"),
        ultimo_oss=o.get("last_obs"),
        n_oss=int(o["n_obs_used"]) if o.get("n_obs_used") not in (None, "") else None,
        sorgente=o.get("source"),
        produttore=o.get("producer"),
        sb_usati=o.get("sb_used"),
        pe_usata=o.get("pe_used"),
    )
    return RispostaSbdb(
        corpo=c.slug,
        fullname=d["object"]["fullname"],
        spkid=int(d["object"]["spkid"]),
        kind=d["object"].get("kind", ""),
        orbita=orb,
        fisica=list(d.get("phys_par") or []),
        grezzo=d,
    )


def mezza_ultima_cifra(valore: str) -> float:
    """Metà dell'unità dell'ultima cifra decimale pubblicata (es. '0.999986' -> 5e-7)."""
    v = valore.strip().lower()
    if "e" in v:
        mant, esp = v.split("e")
        dec = len(mant.split(".")[1]) if "." in mant else 0
        return 0.5 * 10.0 ** (int(esp) - dec)
    dec = len(v.split(".")[1]) if "." in v else 0
    return 0.5 * 10.0**-dec


def covarianza_alla_stessa_epoca(o: OrbitaSbdb) -> bool:
    """Vero se la covarianza (se presente) è riferita agli elementi di `o`, cioè alla stessa epoca."""
    return o.cov is None or o.cov_epoca is None or abs(o.cov_epoca - o.epoca) <= TOLLERANZA_EPOCA


def orbita_covarianza(o: OrbitaSbdb) -> OrbitaSbdb:
    """Orbita a cui si riferisce la covarianza SBDB: i cloni si campionano attorno a questa e si integrano dalla sua
    epoca (https://ssd-api.jpl.nasa.gov/doc/sbdb.html: la covarianza è fornita solo all'epoca della soluzione e
    covariance.elements sono gli elementi di quell'epoca, restituiti quando differisce dall'epoca dell'orbita).

    Con la covarianza all'epoca dell'orbita restituisce `o`; altrimenti una copia con epoca ed elementi (e, q, tp,
    Ω, ω, i) di covariance.epoch e covariance.elements. Gli altri campi (parametri NG, g(r), sigma) restano quelli
    di `o`: i parametri del modello non dipendono dall'epoca."""
    if covarianza_alla_stessa_epoca(o):
        return o
    el = o.cov_elementi
    if el is None or any(k not in el for k in ELEMENTI_COV):
        raise ValueError(
            f"covarianza all'epoca {o.cov_epoca} senza gli elementi dell'epoca (covariance.elements): "
            "impossibile campionare i cloni attorno al suo nominale"
        )
    return dataclasses.replace(
        o,
        epoca=o.cov_epoca,
        e=el["e"],
        q_au=el["q"],
        tp=el["tp"],
        nodo_deg=el["node"],
        argperi_deg=el["peri"],
        inc_deg=el["i"],
    )


def covarianza_elementi(o: OrbitaSbdb) -> tuple[list[str], np.ndarray, str]:
    """Etichette, covarianza e origine ('sbdb', 'sigma', 'arrotondamento') per il campionamento dei cloni.

    Etichette nell'ordine SBDB (e, q, tp, node, peri, i, poi parametri NG). Senza covarianza si usa una
    matrice diagonale con i sigma SBDB; senza sigma, con metà dell'unità dell'ultima cifra pubblicata
    (ipotesi dichiarata: limite inferiore dell'incertezza reale).

    La covarianza SBDB vale solo per gli elementi della propria epoca (§ 7.6.2): con un'orbita di epoca diversa si
    rifiuta (ValueError); `orbita_covarianza` dà l'orbita giusta.
    """
    if o.cov is not None and o.cov_etichette is not None:
        if not covarianza_alla_stessa_epoca(o):
            raise ValueError(
                f"covarianza all'epoca JD {o.cov_epoca} usata con elementi all'epoca JD {o.epoca}: "
                "usare orbita_covarianza (covariance.epoch e covariance.elements)"
            )
        return list(o.cov_etichette), o.cov.copy(), "sbdb"
    nomi_el = {"e": "e", "q": "q", "tp": "tp", "node": "om", "peri": "w", "i": "i"}
    sig = []
    origine = "sigma"
    for k in ELEMENTI_COV:
        s = o.sigma.get(nomi_el[k])
        if s is None or not math.isfinite(s) or s <= 0:
            s = mezza_ultima_cifra(o.testo[nomi_el[k]])
            origine = "arrotondamento"
        sig.append(s)
    return list(ELEMENTI_COV), np.diag(np.square(sig)), origine
