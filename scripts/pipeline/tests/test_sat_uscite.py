"""Uscite dei satelliti: file sKK.bin, frammenti di catalogo e affidabilità, fixture (se generati)."""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from common import affidabilita as ca
from common import constants as cst
from sats import formato, uscite
from sats.anagrafica import SEGUE_EQUATORE, satelliti, ssid_corpo
from sats.riferimento import Config, PianoSecolare, Riferimento, polo_eclittica, rotazione_minima
from sats.uscite import DATI, FIXTURE, OUT

FILE = [DATI / formato.percorso_blocco(k) for k in range(cst.K)]
presenti = all(p.exists() for p in FILE)
richiede_dati = pytest.mark.skipif(not presenti, reason="file sats/sKK.bin non generati")


@richiede_dati
def test_blocchi_leggibili_e_completi() -> None:
    ssid = {s.ssid for s in satelliti()}
    totale = 0
    for k, p in enumerate(FILE):
        dati = p.read_bytes()
        totale += len(dati)
        fs = formato.leggi(dati)
        assert fs.intestazione.blocco == k
        assert set(fs.satelliti) == ssid
        for recs in fs.satelliti.values():
            assert all(r.k <= 6 for r in recs)
    # budget del § 8.1: totale ≤ 5 MB, ogni file ≤ 4 MB
    assert totale <= 5 * 1024 * 1024
    assert max(p.stat().st_size for p in FILE) <= 4 * 1024 * 1024


@richiede_dati
def test_fixture_coerenti_con_i_file() -> None:
    meta = json.loads((FIXTURE / "satelliti.json").read_text(encoding="utf-8"))
    tab = np.frombuffer((FIXTURE / "satelliti.bin").read_bytes(), dtype="<f8").reshape(-1, len(meta["colonne"]))

    def piano(d: dict | None) -> PianoSecolare | None:
        if d is None:
            return None
        return PianoSecolare(
            d["coefficienti"], tuple((v["inizio"], v["fine"], v["giunzione"]) for v in d["intervalli"])
        )

    cfg = [
        Config(
            c["ssid"],
            c["slug"],
            c["primario"],
            tuple(c["rF"]),
            tuple(c["frequenze"]),
            c["gm"],
            c["baricentrico"],
            piano(c["pianoSecolare"]),
        )
        for c in meta["configurazioni"]
    ]
    rif = Riferimento({k: formato.leggi(p.read_bytes()) for k, p in enumerate(FILE)}, cfg)
    rng = np.random.default_rng(1)
    for i in rng.choice(tab.shape[0], size=200, replace=False):
        st = rif.planetocentrico(int(tab[i, 0]), np.array([tab[i, 1]]))
        assert np.max(np.abs(st[0] - tab[i, 2:8])) <= 1e-9 * max(1.0, np.linalg.norm(tab[i, 2:5]))


@richiede_dati
def test_frammenti_di_catalogo_e_affidabilita() -> None:
    cat = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))
    assert cat["formato"] == 1 and cat["area"] == "sats"
    assert set(cat["corpi"]) == {s.slug for s in satelliti()}
    ammessi = {"modello", "rF", "frequenze", "arcoOsservativo", "fonti", "centro", "pianoSegueEquatore"}
    chiavi_fonte = {"tipo", "inizio", "fine", "descrizione", "varianti", "saltoGiunzioneKm", "erroreRadialeKm"}
    for slug, c in cat["corpi"].items():
        e = c["effemeridi"]
        assert set(e) <= ammessi and e["modello"] == "satellite"
        assert len(e["rF"]) == 9 and len(e["frequenze"]) <= 6
        naif = next(s.naif for s in satelliti() if s.slug == slug)
        assert e["pianoSegueEquatore"] is (naif in SEGUE_EQUATORE), slug
        m = np.array(e["rF"]).reshape(3, 3)
        assert np.allclose(m @ m.T, np.eye(3), atol=1e-12), slug
        assert e["fonti"][0]["inizio"] <= cst.T0 + 1e-6 and e["fonti"][-1]["fine"] >= cst.T_END - 1e-6
        for f in e["fonti"]:
            assert set(f) == chiavi_fonte
        base = {"raggi_km", "gm_km3s2", "rotazione", "albedo"}
        # inclinazione dell'asse solo per i satelliti non sincroni con polo WGCCRE (Febe)
        atteso = base | {"inclinazioneAssiale_gradi"} if slug == "febe" else base
        assert set(c["fisica"]) == atteso, slug
        assert c["fisica"]["albedo"] is None
        assert c["fisica"]["raggi_km"]["valore"][0] > 0
        assert c["epsModelloCostante"] is None
        assert c["orientamento"]["modello"] in ("sincrono", "fisso")
    rel = json.loads((OUT / "reliability-sats.json").read_text(encoding="utf-8"))
    assert {k: rel[k] for k in ca.griglia()} == ca.griglia()
    for slug, v in rel["corpi"].items():
        assert len(v["log10eps"]) == ca.NODI, slug
        assert all(x is None or math.isfinite(x) for x in v["log10eps"])
        assert len(v["formaDeterminata"]) == ca.NODI and len(v["datiPresenti"]) == ca.NODI


@richiede_dati
def test_errore_radiale_per_intervallo_di_fonte() -> None:
    """Errore radiale massimo dei record di ogni intervallo (§ 7.5.6), escluso da ε_modello che è angolare: Febe
    95 311 km (0,74 % di a) nel kernel moderno, oltre lo scarto radiale di 83 236 km da JPL Horizons al 4/5/2029."""
    cat = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))
    for s in satelliti():
        fonti = cat["corpi"][s.slug]["effemeridi"]["fonti"]
        if s.naif is None:
            assert [f["erroreRadialeKm"] for f in fonti] == [None]
            continue
        recs, nomi = uscite.sequenze()[s.slug]
        st = uscite.pr.carica(s.slug)
        for f in fonti:
            nome = None if f["tipo"] == "secolare" else f["descrizione"].split(" ")[0]
            valori = [
                v
                for r, n in zip(recs, nomi, strict=True)
                if n == nome and r.t_fine > f["inizio"] and r.t_inizio < f["fine"]
                if (v := uscite.errore_radiale_record(st, r, n)) is not None
            ]
            assert f["erroreRadialeKm"] == pytest.approx(max(valori), abs=0.05), (s.slug, f["descrizione"])
    febe = {f["descrizione"]: f["erroreRadialeKm"] for f in cat["corpi"]["febe"]["effemeridi"]["fonti"]}
    assert febe["sat441.bsp (SAT441)"] > 83_236


@richiede_dati
def test_fobos_con_sigma_ndot_e_arco_di_mar099() -> None:
    """σ_ṅ e arco 1877-2019 di MAR099: ε_modello di Fobos < 10° nel 1600-2120 e < 1° dal 1770 al 2120 (§ 7.8.2).

    Con σ_ṅ dell'ipotesi I12 era "indicativa" prima del 1681 e "approssimata" dal 2088.
    """
    rel = json.loads((OUT / "reliability-sats.json").read_text(encoding="utf-8"))
    serie = rel["corpi"]["fobos"]["log10eps"]
    anni = 2000.0 + (ca.bordi() - 2451545.0) / 365.25

    def massimo(a: float, b: float) -> float:
        return math.degrees(10 ** max(serie[i] for i in range(ca.NODI) if anni[i + 1] > a and anni[i] < b))

    assert massimo(1600.0, 2121.0) < 10.0
    assert massimo(1770.0, 2121.0) < 1.0
    cat = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))
    assert cat["corpi"]["fobos"]["effemeridi"]["arcoOsservativo"] == {"inizio": 1877.0, "fine": 2019.0}


@richiede_dati
def test_frammento_conforme_allo_schema() -> None:
    """Campi del frammento contro le definizioni di docs/schema/catalog.schema.json."""
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads((DATI.parent.parent.parent / "docs" / "schema" / "catalog.schema.json").read_text("utf-8"))
    cat = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))
    for campo, definizione in (
        ("effemeridi", "effemeridi"),
        ("soluzione", "soluzione"),
        ("fisica", "fisica"),
        ("orientamento", "orientamento"),
    ):
        validatore = jsonschema.Draft202012Validator({"$ref": f"#/$defs/{definizione}", "$defs": schema["$defs"]})
        for slug, c in cat["corpi"].items():
            errori = [e.message for e in validatore.iter_errors(c[campo])]
            assert not errori, (slug, campo, errori)


def test_primari_nel_catalogo() -> None:
    for s in satelliti():
        assert ssid_corpo(s.primario) >= 0


def test_rotazione_minima() -> None:
    rng = np.random.default_rng(3)
    for _ in range(20):
        p0, p1 = (v / np.linalg.norm(v) for v in rng.normal(size=(2, 3)))
        q = rotazione_minima(p0, p1)
        assert np.allclose(q @ p0, p1, atol=1e-14)
        assert np.allclose(q @ q.T, np.eye(3), atol=1e-14) and np.linalg.det(q) == pytest.approx(1.0)
        # asse della rotazione perpendicolare a p0 e p1: invariato
        k = np.cross(p0, p1)
        assert np.allclose(q @ k, k, atol=1e-14)
    assert np.allclose(rotazione_minima(p0, p0), np.eye(3))


def _scarto(st: np.ndarray, coeff: dict, t: float) -> float:
    h = np.cross(st[:3], st[3:])
    p = polo_eclittica(coeff, t)
    a = math.degrees(math.atan2(np.linalg.norm(np.cross(h, p)), h @ p))
    return min(a, 180.0 - a)


@richiede_dati
def test_piano_secolare_segue_l_equatore_del_primario() -> None:
    """Satelliti regolari (§ 7.5.4): nei record secolari il polo dell'orbita resta vicino al polo WGCCRE del primario
    quanto nella finestra dei kernel; nel 10000 a.C. Fobos e Deimos entro 1,5° dall'equatore di Marte (erano 10,7° e
    9,0° con F fisso), Encelado e Dione entro 0,15° dal piano degli anelli di Saturno (erano 0,67° e 0,66°)."""
    import physical as ph
    from sats import fisica

    cfg = {c.slug: c for c in uscite.configurazioni()}
    rif = Riferimento({k: formato.leggi(p.read_bytes()) for k, p in enumerate(FILE)}, list(cfg.values()))
    phys = json.loads((OUT / "catalog-phys.json").read_text(encoding="utf-8"))["corpi"]
    n = 0
    for s in satelliti():
        c = cfg[s.slug]
        if not s.segue_equatore:
            assert c.piano_secolare is None, s.slug
            continue
        ps = c.piano_secolare
        assert ps is not None and len(ps.intervalli) == 1, s.slug
        # stessi coefficienti del polo del primario in catalog.json (frammento di physical.py)
        assert ps.coefficienti == phys[s.primario]["orientamento"]["coefficienti"], s.slug
        assert ps.coefficienti == ph.coefficienti_wgccre(fisica._pck(), 100 * (s.sistema or 0) + 99)
        a, b, g = ps.intervalli[0]
        assert a == cst.T0 and g == b
        ts = a + (np.arange(40) + 0.37) / 40 * (b - a)
        fin0 = max(g, 2_305_447.5)
        tw = fin0 + (np.arange(40) + 0.37) / 40 * (cst.T_END - fin0)
        sec = max(_scarto(x, ps.coefficienti, t) for x, t in zip(rif.planetocentrico(c.ssid, ts), ts, strict=True))
        fin = max(_scarto(x, ps.coefficienti, t) for x, t in zip(rif.planetocentrico(c.ssid, tw), tw, strict=True))
        assert sec <= fin + 0.15, (s.slug, sec, fin)
        n += 1
    assert n == len(SEGUE_EQUATORE) == 22
    jd = -1_931_000.0
    for slug, limite in (("fobos", 1.5), ("deimos", 1.5), ("encelado", 0.15), ("dione", 0.15)):
        c = cfg[slug]
        st = rif.planetocentrico(c.ssid, np.array([jd]))[0]
        assert _scarto(st, c.piano_secolare.coefficienti, jd) < limite, slug
