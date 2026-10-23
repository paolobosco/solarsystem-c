"""Validazione dei piccoli corpi (§ 13, A7 e A9; § 14.2, S2 e S4).

Le prove usano i file pubblicati public/data/v1/small/bKK.bin (valutazione di riferimento di binio):
- A7: interpolazione contro la sorgente; 50 epoche per corpo contro Horizons (1600-2121);
  giunzione al 1600 e salti tra record; perieli di 1P contro Yeomans e Kiang 1981; ASSIST contro
  sb441-n16 per Cerere a -7000;
- A9: Apophis 2029-04-13 contro JPL CNEOS; perieli di 1P nel 1910 e nel 1986.
Risultati in out/validazione-piccoli-corpi.json.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np

from common import binio
from common import constants as cst
from common.calendario import calendario_a_jd

from . import horizons, rete
from .anagrafica import CACHE_ASSIST, CARTELLA_DATI, FILE_VALIDAZIONE, RAW, Corpo, per_slug, piccoli_corpi
from .blocchi import livello_scelto, suffisso_scelto
from .elabora import _salva_json, cartella, contesto
from .scarica import CARTELLA_VETTORI, gruppi_validazione

MU = cst.MU_PICCOLI_CORPI
SEME_INTERPOLAZIONE = 20261023
N_EPOCHE_INTERPOLAZIONE = 200


class File:
    """Blocchi pubblicati, letti una volta."""

    def __init__(self, cartella_dati: Path = CARTELLA_DATI) -> None:
        self._f: dict[int, binio.FileSerie] = {}
        self.cartella = cartella_dati

    def blocco(self, k: int) -> binio.FileSerie:
        if k not in self._f:
            self._f[k] = binio.leggi_serie((self.cartella / f"b{k:02d}.bin").read_bytes())
        return self._f[k]

    def valuta(self, ssid: int, t: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        stati = np.full((tt.size, 6), np.nan)
        esiti = np.full(tt.size, "fuori-copertura", dtype=object)
        for k in range(cst.K):
            m = (tt >= cst.inizio_blocco(k)) & (tt < cst.fine_blocco(k))
            if np.any(m):
                s, e = binio.valuta_serie(self.blocco(k), ssid, tt[m])
                stati[m] = s
                esiti[m] = e
        return stati, esiti.astype(str)


def _tolleranza_finestra(r: np.ndarray) -> np.ndarray:
    return np.maximum(500.0, 1e-7 * r)


CARTELLA_VETTORI_GRUPPI = RAW / "horizons" / "vettori-gruppi"
# Epoche anteriori al taglio (JD) richieste a parte, nel gruppo "antico": Itokawa, con i dati dal 1700, ha incontri
# ravvicinati nel 1902, 1905 e 2004; richieste insieme a quelle del 1700-1840, le epoche dopo il 1923 si scostavano
# fino a 3,2e5 km dai file (integrazione di Horizons in sequenza dalla più antica), separate fino a 430 km.
TAGLIO_ANTICO = {"itokawa": 2393359.5}  # 11/9/1840


def vettori_per_gruppi(nome: str, comando: str, t: np.ndarray, esiti: np.ndarray, epoca: float | None, offline: bool):
    """Vettori Horizons alle epoche t richiesti in due gruppi: dall'epoca della soluzione in avanti e,
    prima dell'epoca, solo le epoche con dati (con un terzo gruppo per i corpi di TAGLIO_ANTICO). Horizons ordina
    le epoche e integra in sequenza dalla più antica: con un'epoca antica in un tratto caotico (incontri
    ravvicinati) le epoche successive cambiano (Apophis: 1,8e8 km nel 1986 con la richiesta unica, 0,5 km con la
    richiesta del solo 1923-1986). Restituisce (tempi, stati) ordinati."""
    ep = -math.inf if epoca is None else epoca
    prima = (t < ep) & (esiti == "ok")
    taglio = TAGLIO_ANTICO.get(nome, -math.inf)
    gruppi = (("dopo", t >= ep), ("antico", prima & (t < taglio)), ("prima", prima & (t >= taglio)))
    tt, ss = [], []
    for parte, m in gruppi:
        if not np.any(m):
            continue
        p = CARTELLA_VETTORI_GRUPPI / f"{nome}-{parte}.txt"
        p.parent.mkdir(parents=True, exist_ok=True)
        testo = rete.congelato(p, horizons.url_vettori(comando, [float(x) for x in t[m]]), offline).decode()
        a, b = horizons.leggi_vettori(testo)
        tt.append(a)
        ss.append(b)
    if not tt:
        return np.zeros(0), np.zeros((0, 6))
    tutti = np.concatenate(tt)
    o = np.argsort(tutti)
    return tutti[o], np.concatenate(ss)[o]


def a7_horizons(f: File, c: Corpo, offline: bool = False) -> dict:
    sb, recs, pezzi = contesto(c)
    righe = []
    for nome, comando, t_attesi in gruppi_validazione(c, pezzi, sb):
        p = CARTELLA_VETTORI / f"{nome}.txt"
        testo = p.read_text(encoding="utf-8")
        t, _ = horizons.leggi_vettori(testo)
        # Horizons può servire solo una parte delle epoche (oggetti precalcolati): sottoinsieme
        if not all(np.min(np.abs(t_attesi - x)) < 1e-5 for x in t):
            raise ValueError(f"epoche di {nome} diverse da quelle richieste")
        _, e0 = f.valuta(c.ssid, t)
        for x, esito in zip(t, e0, strict=True):
            if esito != "ok":
                righe.append((float(x), str(esito), math.nan, math.nan, math.nan))
        t, ref = vettori_per_gruppi(nome, comando, t, e0, horizons.epoca_vettori(testo), offline)
        s, e = f.valuta(c.ssid, t)
        for k in range(t.size):
            if e[k] != "ok":
                continue
            r = float(np.linalg.norm(ref[k, :3]))
            d = float(np.linalg.norm(s[k, :3] - ref[k, :3]))
            righe.append((float(t[k]), str(e[k]), d, r, d / float(_tolleranza_finestra(np.array([r]))[0])))
    righe.sort()
    ok = [x for x in righe if x[1] == "ok"]
    return {
        "epoche": len(righe),
        "valutate": len(ok),
        "non_ok": [x[:2] for x in righe if x[1] != "ok"],
        "max_km": max((x[2] for x in ok), default=None),
        "max_rapporto": max((x[4] for x in ok), default=None),
        "oltre_soglia": [(x[0], round(x[2], 3), round(x[4], 3)) for x in ok if x[4] > 1.0],
    }


def a7_interpolazione(f: File, c: Corpo) -> dict:
    """Errore dei file contro la sorgente in 200 epoche casuali dei nuclei con dati (seme registrato)."""
    from .costruzione import Sorgenti, _tolleranza

    sb, recs, pezzi = contesto(c)
    segs = []
    for k in range(cst.K):
        segs += [(s.inizio, s.fine) for s in f.blocco(k).corpi.get(c.ssid, [])]
    if not segs:
        return {"epoche": 0}
    rng = np.random.default_rng(SEME_INTERPOLAZIONE + c.ssid)
    lung = np.array([b - a for a, b in segs])
    scelti = rng.choice(len(segs), N_EPOCHE_INTERPOLAZIONE, p=lung / lung.sum())
    t = np.sort(np.array([segs[i][0] + rng.uniform(0, segs[i][1] - segs[i][0]) for i in scelti]))
    stima, esiti = f.valuta(c.ssid, t)
    src = Sorgenti(c)
    # ε per istante usato nella costruzione (stessa tolleranza dei segmenti)
    campioni = np.load(cartella(c.slug) / f"eps{suffisso_scelto()}.npz")

    def eps(tt: np.ndarray) -> np.ndarray:
        return np.interp(tt, campioni["t"], campioni["eps"])

    tol = _tolleranza(eps, livello_scelto())
    rapp = []
    for i, ti in enumerate(t):
        p = next(p for p in pezzi if p.inizio <= ti < p.fine)
        vero = src.stati(p.chiave, np.array([ti]))[0]
        r = float(np.linalg.norm(vero[:3]))
        d = float(np.linalg.norm(stima[i, :3] - vero[:3]))
        rapp.append(d / float(tol(np.array([ti]), np.array([r]))[0]))
    return {"epoche": int(t.size), "tutti_ok": bool(np.all(esiti == "ok")), "max_rapporto": float(np.max(rapp))}


def _minimo(funzione, a: float, b: float, n: int = 200, iterazioni: int = 80) -> tuple[float, float]:
    """Minimo di una funzione scalare su [a, b]: griglia, poi sezione aurea attorno al minimo."""
    t = np.linspace(a, b, n)
    v = np.array([funzione(x) for x in t])
    k = int(np.argmin(v))
    lo, hi = t[max(k - 1, 0)], t[min(k + 1, n - 1)]
    g = (math.sqrt(5.0) - 1.0) / 2.0
    x1, x2 = hi - g * (hi - lo), lo + g * (hi - lo)
    f1, f2 = funzione(x1), funzione(x2)
    for _ in range(iterazioni):
        if f1 < f2:
            hi, x2, f2 = x2, x1, f1
            x1 = hi - g * (hi - lo)
            f1 = funzione(x1)
        else:
            lo, x1, f1 = x1, x2, f2
            x2 = lo + g * (hi - lo)
            f2 = funzione(x2)
    x = 0.5 * (lo + hi)
    return x, funzione(x)


def perieli_halley(f: File, offline: bool = False) -> dict:
    c = per_slug()["1p-halley"]
    yk = json.loads((RAW / "yeomans-kiang-1981-tabella4.json").read_text(encoding="utf-8"))["perieli"]
    out = []
    for p in yk:
        t0 = p["jdTT"]

        def r(t: float) -> float:
            s, e = f.valuta(c.ssid, np.array([t]))
            return float(np.linalg.norm(s[0, :3])) if e[0] == "ok" else math.inf

        if not math.isfinite(r(t0)):
            out.append({"anno": p["anno"], "T_YK": t0, "esito": "non-determinabile"})
            continue
        tm, rm = _minimo(r, t0 - 60.0, t0 + 60.0)
        out.append(
            {
                "anno": p["anno"],
                "T_YK": t0,
                "T_dati": tm,
                "dT_d": tm - t0,
                "q_dati_ua": rm / cst.UA_KM,
                "q_YK_ua": p["q_au"],
            }
        )
    # 1986: istante della distanza minima dal Sole nei vettori Horizons della soluzione JPL#75
    t_rif = perielio_horizons_1986(offline)

    def r86(t: float) -> float:
        s, e = f.valuta(c.ssid, np.array([t]))
        return float(np.linalg.norm(s[0, :3])) if e[0] == "ok" else math.inf

    t86, _ = _minimo(r86, t_rif - 60.0, t_rif + 60.0, n=2401)
    finestra = [x for x in out if -239 <= x["anno"] <= 1910 and "dT_d" in x]
    return {
        "perieli": out,
        "max_dT_-239_1910_d": max(abs(x["dT_d"]) for x in finestra) if finestra else None,
        "1910_dT_d": next((x["dT_d"] for x in out if x["anno"] == 1910), None),
        "1986": {"T_horizons_JPL75": t_rif, "T_dati": t86, "dT_d": t86 - t_rif},
    }


def perielio_horizons_1986(offline: bool = False) -> float:
    """Distanza minima dal Sole di 1P nel 1986 dai vettori Horizons (record 90000030, JPL#75) a passo
    di 0,01 d tra il 1986-02-08 e il 1986-02-11 TDB, con raffinamento parabolico."""
    p = RAW / "horizons" / "validazione" / "1p-halley-1986.txt"
    testo = rete.congelato(p, horizons.url_vettori_intervallo("90000030;", 2446469.5, 2446472.5, 300), offline).decode()
    t, ref = horizons.leggi_vettori(testo)
    r = np.linalg.norm(ref[:, :3], axis=1)
    k = int(np.clip(np.argmin(r), 1, r.size - 2))
    c2, c1, _ = np.polyfit(t[k - 1 : k + 2] - t[k], r[k - 1 : k + 2], 2)
    return float(t[k] - c1 / (2.0 * c2))


def apophis_2029(f: File) -> dict:
    from common.de441 import De441

    c = per_slug()["apophis"]
    d = json.loads((RAW / "cneos" / "apophis-2029.json").read_text(encoding="utf-8"))
    riga = dict(zip(d["fields"], d["data"][0], strict=True))
    t_cad = float(riga["jd"])
    d_cad = float(riga["dist"]) * cst.UA_KM
    with De441() as de:

        def dist(t: float) -> float:
            s, e = f.valuta(c.ssid, np.array([t]))
            terra = de.stato_eliocentrico(399, np.array([t]))[0]
            return float(np.linalg.norm(s[0, :3] - terra[:3]))

        tm, dm = _minimo(dist, t_cad - 0.5, t_cad + 0.5, n=400, iterazioni=100)
    return {
        "cneos": {"jd_tdb": t_cad, "dist_km": d_cad, "orbit_id": riga["orbit_id"]},
        "dati": {"jd_tdb": tm, "dist_km": dm},
        "diff_km": dm - d_cad,
        "diff_min": (tm - t_cad) * 1440.0,
    }


def cerere_meno7000() -> dict:
    """ASSIST contro sb441-n16 per Cerere a -7000: (a) modello di produzione prima di -7999 (senza
    asteroidi) da JD -1 200 000,5 in avanti; (b) con gli altri 15 asteroidi di sb441-n16."""
    from .integrazione import T_SPEGNI_ASTEROIDI, Ambiente, Configurazione, integra_array
    from .sorgenti import ValutatoreSb441, sb441_senza

    t7000 = calendario_a_jd(-7000, 1, 1, 0, 0, 0, "giuliano")
    v = ValutatoreSb441(2000001)
    s0 = v.stati(np.array([T_SPEGNI_ASTEROIDI]))
    ref = v.stati(np.array([t7000]))[0]
    out = {"jd": t7000}
    f = sb441_senza(2000001, CACHE_ASSIST / "sb441-n16-senza-2000001.bsp")
    try:
        amb = Ambiente(f)
        for nome, ast in (("senza_asteroidi", False), ("con_15_asteroidi", True)):
            s = integra_array(amb, T_SPEGNI_ASTEROIDI, s0, Configurazione(asteroidi=ast), np.array([t7000]))[0, 0]
            dk = float(np.linalg.norm(s[:3] - ref[:3]))
            out[nome] = {"km": dk, "arcsec": dk / float(np.linalg.norm(ref[:3])) * 206264.806}
        # dal 2000 a ritroso fino a -7000, con gli altri 15 asteroidi
        s2000 = v.stati(np.array([cst.J2000]))
        s = integra_array(amb, cst.J2000, s2000, Configurazione(asteroidi=True), np.array([t7000]))[0, 0]
        dk = float(np.linalg.norm(s[:3] - ref[:3]))
        out["da_J2000_con_15_asteroidi"] = {"km": dk, "arcsec": dk / float(np.linalg.norm(ref[:3])) * 206264.806}
    finally:
        del amb
        f.unlink(missing_ok=True)
    return out


def halley_record_antico(offline: bool = False) -> dict:
    """S2: traiettoria ASSIST del record 90000001 (-239) contro Horizons, dall'inizio dei dati (-380) al
    -230. Horizons integra in sequenza le epoche richieste: con epoche molto lontane dal record
    (-1000 e oltre) l'ordine d'integrazione cambia i valori vicini al record, quindi le epoche restano
    nell'intervallo dei dati."""
    from .costruzione import Sorgenti

    c = per_slug()["1p-halley"]
    anni = (-380, -350, -320, -300, -280, -260, -250, -245, -240, -235, -230)
    tempi = [calendario_a_jd(a, 1, 1, 0, 0, 0, "giuliano") for a in anni]
    p = RAW / "horizons" / "validazione" / "1p-halley-90000001-vicino.txt"
    testo = rete.congelato(p, horizons.url_vettori("90000001;", tempi), offline).decode()
    t, ref = horizons.leggi_vettori(testo)
    src = Sorgenti(c)
    out = []
    for k in range(t.size):
        try:
            s = src.stati("assist:90000001", np.array([t[k]]))[0]
        except Exception:
            out.append({"jd": float(t[k]), "esito": "fuori dalla traiettoria"})
            continue
        d = float(np.linalg.norm(s[:3] - ref[k, :3]))
        out.append({"jd": float(t[k]), "km": d, "arcsec": d / float(np.linalg.norm(ref[k, :3])) * 206264.806})
    return {"confronti": out}


def apophis_horizons(f: File, offline: bool = False) -> dict:
    """S2: Apophis attorno al 2029-04-13 contro Horizons (soluzione corrente)."""
    c = per_slug()["apophis"]
    t0 = calendario_a_jd(2029, 4, 13, 0, 0, 0, "gregoriano")
    tempi = [t0 + k * 0.125 for k in range(0, 17)]
    p = RAW / "horizons" / "validazione" / "apophis-2029.txt"
    testo = rete.congelato(p, horizons.url_vettori("DES=20099942;", tempi), offline).decode()
    t, ref = horizons.leggi_vettori(testo)
    s, e = f.valuta(c.ssid, t)
    d = np.linalg.norm(s[:, :3] - ref[:, :3], axis=1)
    return {"max_km": float(np.max(d)), "epoche": int(t.size)}


def apophis_assist(offline: bool = False) -> dict:
    """S2: ASSIST dalla soluzione SBDB (con A1, A2) contro Horizons attorno al 2029-04-13."""
    from .cloni import stato_nominale
    from .integrazione import Ambiente, Configurazione, integra_array
    from .sbdb import leggi

    c = per_slug()["apophis"]
    o = leggi(c).orbita
    t0 = calendario_a_jd(2029, 4, 13, 0, 0, 0, "gregoriano")
    tempi = [t0 + k * 0.125 for k in range(0, 17)]
    p = RAW / "horizons" / "validazione" / "apophis-2029.txt"
    testo = rete.congelato(p, horizons.url_vettori("DES=20099942;", tempi), offline).decode()
    t, ref = horizons.leggi_vettori(testo)
    ng = np.array([[o.ng.get(k, 0.0) for k in ("A1", "A2", "A3")]])
    conf = Configurazione(ng=ng if np.any(ng) else None, g=o.g, asteroidi=True)
    s = integra_array(Ambiente(), o.epoca, stato_nominale(o, MU)[None], conf, t)[:, 0]
    d = np.linalg.norm(s[:, :3] - ref[:, :3], axis=1)
    return {"epoca_soluzione": o.epoca, "orbit_id": o.orbit_id, "max_km": float(np.max(d)), "epoche": int(t.size)}


def tempi_integrazione() -> dict:
    out = {"16": [], "64": []}
    totale = 0.0
    for c in piccoli_corpi():
        p = cartella(c.slug) / "integrazione.json"
        if not p.exists():
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        n = str(d.get("cloni", {}).get("n"))
        if n in out:
            out[n].append((c.slug, round(d.get("cloni_s", 0.0), 1)))
        totale += d["fine"] - d["inizio"]
    return {"cloni": out, "totale_s": totale}


def valida_tutto(slug: list[str] | None = None, offline: bool = False) -> dict:
    f = File()
    tic = time.time()
    risultati: dict = {"corpi": {}}
    for c in piccoli_corpi():
        if slug is not None and c.slug not in slug:
            continue
        r: dict = {}
        r["horizons"] = a7_horizons(f, c, offline)
        r["interpolazione"] = a7_interpolazione(f, c)
        costr = json.loads((cartella(c.slug) / f"costruzione{suffisso_scelto()}.json").read_text(encoding="utf-8"))
        r["giunzioni"] = costr["giunzioni"]
        r["salti_record"] = costr["salti_record"]
        r["sovrapposizione_1600_1650"] = costr["sovrapposizione_1600_1650"]
        r["max_rapporto_segmenti"] = max((e["rapporto"] for e in costr["errori"]), default=None)
        risultati["corpi"][c.slug] = r
        print(c.slug, json.dumps(r["horizons"])[:200], flush=True)
    if slug is None or "1p-halley" in slug:
        risultati["halley"] = perieli_halley(f, offline)
        risultati["halley_record_antico"] = halley_record_antico(offline)
    if slug is None or "apophis" in slug:
        risultati["apophis_2029"] = apophis_2029(f)
        risultati["apophis_horizons"] = apophis_horizons(f, offline)
        risultati["apophis_assist"] = apophis_assist(offline)
    if slug is None or "cerere" in slug:
        risultati["cerere_meno7000"] = cerere_meno7000()
    risultati["tempi"] = tempi_integrazione()
    risultati["durata_s"] = time.time() - tic
    _salva_json(FILE_VALIDAZIONE, risultati)
    return risultati
