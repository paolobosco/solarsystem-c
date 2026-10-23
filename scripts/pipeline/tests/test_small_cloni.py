"""Cloni dei piccoli corpi (§ 7.6.2): la covarianza SBDB vale per gli elementi della sua epoca.

Per 45 corpi su 70 con covarianza (asteroidi e TNO) SBDB dà gli elementi dell'orbita all'epoca standard e la
covarianza a un'altra epoca, con i propri elementi in covariance.elements
(https://ssd-api.jpl.nasa.gov/doc/sbdb.html). Itokawa: orbita al 9/6/2026, covarianza al 1/1/2004, con in mezzo il
passaggio a 0,0129 UA dalla Terra del 26/6/2004.
"""

import json
import math

import numpy as np
import pytest

from common import constants as cst
from small import affidabilita as aff
from small import cloni, sbdb
from small.anagrafica import CACHE, FILE_PIANETI_ASSIST, FILE_SB441, per_slug, piccoli_corpi

SEME = 20261071  # SEME_CLONI + ssid di Itokawa
# JPL Horizons, soluzione JPL#237 di Itokawa (DES=20025143, CENTER 500@10, QUANTITIES 39, TIME_TYPE TT): RA_3sigma.
HORIZONS_3SIGMA_ARCSEC = {2415020.5: 4.214, 2396758.5: 62.119, 2378496.5: 197.229}  # 1900, 1850, 1800


def _itokawa() -> sbdb.OrbitaSbdb:
    return sbdb.leggi(per_slug()["itokawa"]).orbita


def test_covarianza_di_un_altra_epoca_rifiutata():
    """Il nominale all'epoca dell'orbita (2026) con la covarianza del 2004: correlazioni di un'altra epoca."""
    o = _itokawa()
    assert (o.epoca, o.cov_epoca) == (2461200.5, 2453005.5)
    assert not sbdb.covarianza_alla_stessa_epoca(o)
    with pytest.raises(ValueError, match="covarianza all'epoca JD 2453005.5"):
        sbdb.covarianza_elementi(o)
    with pytest.raises(ValueError, match="orbita_covarianza"):
        cloni.campiona(o, 8, SEME)


def test_orbita_covarianza_itokawa():
    """Epoca ed elementi di covariance.epoch e covariance.elements; stessi parametri NG dell'orbita."""
    o = _itokawa()
    oc = sbdb.orbita_covarianza(o)
    assert oc.epoca == 2453005.5 and oc.cov_epoca == oc.epoca
    assert oc.e == pytest.approx(0.279465894044321, abs=1e-15)
    assert oc.q_au == pytest.approx(0.9531059217424466, abs=1e-15)
    assert oc.tp == pytest.approx(2453145.413157202695, abs=1e-9)
    assert (oc.nodo_deg, oc.argperi_deg, oc.inc_deg) == pytest.approx(
        (70.91767938852736, 161.0144462702274, 1.727962095421385)
    )
    assert oc.ng == o.ng and oc.g == o.g
    assert o.epoca == 2461200.5 and o.nodo_deg == pytest.approx(69.07449749929083)  # l'orbita resta quella dei dati
    et, cov, origine = sbdb.covarianza_elementi(oc)
    assert origine == "sbdb" and et[:6] == list(sbdb.ELEMENTI_COV) and cov.shape == (7, 7)


def test_cloni_centrati_sul_nominale_della_covarianza():
    """Media dei cloni = elementi della covarianza (entro 5σ/√n), non quelli dell'orbita all'epoca standard."""
    oc = sbdb.orbita_covarianza(_itokawa())
    n = 4000
    cl = cloni.campiona(oc, n, SEME)
    et, cov, _ = sbdb.covarianza_elementi(oc)
    nominali = {"e": oc.e, "q": oc.q_au, "tp": oc.tp, "node": oc.nodo_deg, "peri": oc.argperi_deg, "i": oc.inc_deg}
    for k, e in enumerate(et[:6]):
        sigma = math.sqrt(cov[k, k])
        assert abs(cl[e].mean() - nominali[e]) < 5.0 * sigma / math.sqrt(n), e
        assert cl[e].std() == pytest.approx(sigma, rel=0.05), e
    # lo stato nominale dei cloni è quello all'epoca della covarianza
    assert cloni.stati_cloni(oc, cl, cst.MU_PICCOLI_CORPI).shape == (n, 6)


def test_covarianza_di_ogni_corpo_con_il_proprio_nominale():
    """Tutti i corpi: con orbita_covarianza la covarianza SBDB è usata solo con il nominale della sua epoca."""
    diversi = 0
    for c in piccoli_corpi():
        o = sbdb.leggi(c).orbita
        oc = sbdb.orbita_covarianza(o)
        sbdb.covarianza_elementi(oc)  # nessun rifiuto
        if sbdb.covarianza_alla_stessa_epoca(o):  # senza covarianza, o con la covarianza all'epoca dell'orbita
            assert oc is o, c.slug
        else:
            diversi += 1
            assert oc.epoca == o.cov_epoca != o.epoca, c.slug
            assert oc.e == o.cov_elementi["e"] and oc.tp == o.cov_elementi["tp"], c.slug
            with pytest.raises(ValueError):
                cloni.campiona(o, 2, 1)
    assert diversi == 45  # asteroidi e TNO; comete, interstellari e Bennu hanno le due epoche uguali


@pytest.mark.skipif(not (CACHE / "itokawa" / "cloni.npz").exists(), reason="cloni non generati (.cache/small)")
def test_cloni_prodotti_all_epoca_della_covarianza():
    """Passo 'integra': i cloni di ogni corpo hanno l'epoca della covarianza SBDB (per 45 corpi diversa da quella
    dell'orbita) e, per Itokawa, i dati cominciano prima dell'11/9/1840 (con la covarianza del 2004 sul nominale del
    2026 il 95° percentile superava 90° prima di quella data)."""
    controllati = 0
    for c in piccoli_corpi():
        f = CACHE / c.slug / "cloni.npz"
        if not f.exists():
            continue
        o = sbdb.leggi(c).orbita
        atteso = o.epoca if o.cov is None or o.cov_epoca is None else o.cov_epoca
        assert float(np.load(f)["epoca"][0]) == atteso, c.slug
        controllati += 1
    assert controllati == 72
    iniz = json.loads((CACHE / "itokawa" / "integrazione.json").read_text(encoding="utf-8"))
    assert iniz["cloni"]["epoca"] == 2453005.5 and iniz["cloni"]["epoca_orbita"] == 2461200.5
    assert iniz["inizio_dati_soluzione"] < 2393359.5  # 11/9/1840


@pytest.mark.assist
@pytest.mark.skipif(
    not (FILE_PIANETI_ASSIST.exists() and FILE_SB441.exists()), reason="file di ASSIST assenti da .cache/assist"
)
def test_dispersione_dei_cloni_di_itokawa_contro_horizons():
    """p95 dei cloni (integrati a ritroso dall'epoca della covarianza, attraverso l'incontro del 2004) coerente con i
    3σ di JPL Horizons: circa 2σ, quindi sotto i 3σ. Con la covarianza del 2004 sul nominale del 2026 il p95 era 756″,
    45 073″ e 216 843″ nel 1900, 1850, 1800 (da 180 a 1100 volte i 3σ di Horizons)."""
    pytest.importorskip("assist")
    from small.elabora import MU, PASSO_MINIMO_CLONI
    from small.integrazione import Ambiente, Configurazione, integra

    o = _itokawa()
    oc = sbdb.orbita_covarianza(o)
    cl = cloni.campiona(oc, cloni.N_CLONI_CAOTICI, SEME)
    ng_nom = np.array([o.ng.get(k, 0.0) for k in ("A1", "A2", "A3")])
    stati0 = np.concatenate([cloni.stato_nominale(oc, MU)[None], cloni.stati_cloni(oc, cl, MU)])
    ng = np.concatenate([ng_nom[None], cloni.ng_cloni(cl)])
    conf = Configurazione(ng=ng, g=o.g, asteroidi=True, passo_minimo=PASSO_MINIMO_CLONI)
    tempi = sorted(HORIZONS_3SIGMA_ARCSEC, reverse=True)  # a ritroso: 1900, 1850, 1800
    arcsec = 180.0 / math.pi * 3600.0
    for t, s in integra(Ambiente(), oc.epoca, stati0, conf, tempi):
        p95 = float(np.percentile(aff.metrica(s[1:], s[0]), 95)) * arcsec
        h3 = HORIZONS_3SIGMA_ARCSEC[t]
        assert 0.2 * h3 < p95 < h3, (t, p95, h3)
