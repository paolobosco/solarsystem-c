"""Dati fisici e anagrafica del catalogo (§ 4.3, § 9): priorità delle fonti, coerenza con il modello di rotazione,
ordine dei semiassi, anno della fonte, testi delle fonti dei satelliti."""

from __future__ import annotations

import json
import math
import re

import pytest

from common import constants as cst
from sats import fisica as sf
from sats.uscite import OUT, SOLUZIONE
from small import catalogo as sc
from small import mpc, sbdb
from small.anagrafica import leggi_corpi, per_slug

G_CODATA_2018 = 6.67430e-20  # km^3 kg^-1 s^-2


@pytest.fixture(scope="module")
def ctx():
    lett = json.loads(sc.FILE_LETTERATURA.read_text(encoding="utf-8"))["corpi"]
    return per_slug(), lett, sc._pck()


def _fisica(ctx, slug: str) -> dict:
    corpi, lett, pck = ctx
    c = corpi[slug]
    return sc.fisica(c, sbdb.leggi(c), lett, pck)


def test_eris_rotazione_sincrona(ctx):
    """LCDB 25,9 h da copertura parziale (nota SBDB); rotazione sincrona con Disnomia (Szakáts et al. 2023)."""
    r = _fisica(ctx, "eris")["rotazione"]
    assert r["fonte"].startswith("Szakáts et al. 2023") and r["anno"] == 2023
    assert r["valore"] == pytest.approx(15.78 * 24.0, abs=0.5)


def test_borrelly_raggio_entro_il_semiasse_massimo(ctx):
    """pck00011: primo semiasse 3,5 km; il raggio medio 4,22 km dello stesso file è escluso."""
    r = _fisica(ctx, "19p-borrelly")["raggi_km"]
    assert max(r["valore"]) <= 3.5
    assert r["valore"] == [2.4, 2.4, 2.4] and r["fonte"].startswith("JPL SBDB")


def test_haumea_gm_dalla_massa_misurata(ctx):
    """Ragozzine e Brown 2009, tab. 2: massa di Haumea 4,006 ± 0,040 × 10^21 kg."""
    g = _fisica(ctx, "haumea")["gm_km3s2"]
    assert g is not None and g["fonte"].startswith("Ragozzine e Brown 2009")
    assert g["valore"] == pytest.approx(G_CODATA_2018 * 4.006e21, abs=0.01)
    assert g["incertezza"] == pytest.approx(G_CODATA_2018 * 0.040e21, abs=0.01)


def test_periodo_uguale_alla_rotazione_disegnata(ctx):
    """Corpi con modello WGCCRE: periodo nella scheda = 360°/Ẇ del modello disegnato (19P, 67P)."""
    _, _, pck = ctx
    for slug, naif in sc.NAIF_PCK.items():
        pm = pck[f"BODY{naif}_PM"]
        r = _fisica(ctx, slug)["rotazione"]
        assert r is not None, slug
        assert r["valore"] == pytest.approx(360.0 / pm[1] * 24.0, rel=1e-12), slug
        assert "pck00011" in r["fonte"] and "Ẇ" in r["fonte"], slug


def test_semiassi_in_ordine_decrescente(ctx):
    """Raggi [a, b, c] con a ≥ b ≥ c (§ 8.10), come in pck00011: c è l'asse z del corpo."""
    corpi, _, _ = ctx
    for slug in corpi:
        r = _fisica(ctx, slug)["raggi_km"]
        if r is not None:
            assert r["valore"] == sorted(r["valore"], reverse=True), slug
    assert _fisica(ctx, "toutatis")["raggi_km"]["valore"] == [2.13, 1.015, 0.85]


def test_anno_di_pubblicazione_non_dal_titolo(ctx):
    rif = (
        'Taylor et al, "Arecibo Radar Observations of near-Earth asteroid (3200) Phaethon during the 2017 '
        'apparition", Planetary and Space Science. 10.1016/j.pss.2019.01.009'
    )
    assert sc._anno(rif) == 2019
    assert sc._anno("Hudson et al. (2003) Icarus 161:346-355") == 2003
    assert sc._anno("LCDB (Rev. 2023-October); Warner et al., 2009") == 2023
    assert _fisica(ctx, "phaethon")["raggi_km"]["anno"] == 2019


def test_comete_nome_ufficiale_dall_mpc():
    """§ 4.3: nome = fullname SBDB (forma d'uso, con il numerale); nome ufficiale = nome dell'MPC per le periodiche
    numerate (9P/Tempel, 29P/Schwassmann-Wachmann, 81P/Wild, 103P/Hartley: linee guida IAU/WGSBN, art. 5.5), uguale al
    fullname SBDB per le altre."""
    mpc_risposta = json.loads(mpc.FILE_MPC.read_text(encoding="utf-8"))["risposta"]
    con_numerale = {
        "9p-tempel-1": "9P/Tempel",
        "29p-schwassmann-wachmann-1": "29P/Schwassmann-Wachmann",
        "81p-wild-2": "81P/Wild",
        "103p-hartley-2": "103P/Hartley",
    }
    visti = set()
    for c in leggi_corpi():
        if c["categoria"] != "cometa":
            continue
        full = json.loads((sbdb.CARTELLA / f"{c['slug']}.json").read_text(encoding="utf-8"))["object"]["fullname"]
        assert c["nome"] == full.strip(), c["slug"]
        if re.fullmatch(r"\d+P", c["designazione"] or ""):
            r = mpc_risposta[c["designazione"]]
            assert r["found"] and c["nomeUfficiale"] == f"{r['permid']}/{r['name']}", c["slug"]
        else:
            assert c["nomeUfficiale"] == c["nome"], c["slug"]
        if c["slug"] in con_numerale:
            visti.add(c["slug"])
            assert c["nomeUfficiale"] == con_numerale[c["slug"]] != c["nome"], c["slug"]
    assert visti == set(con_numerale)


def test_febe_periodo_da_pck00011():
    """BODY609_PM = (178,58; 931,639): 360°/931,639 = 9,27398 h (Archinal et al. 2018)."""
    assert sf.periodo_wgccre(609) == pytest.approx(360.0 / 931.639 * 24.0, rel=1e-12)
    assert sf.periodo_wgccre(607) is None  # Iperione: nessun modello (rotazione caotica)


def test_riferimenti_delle_soluzioni_senza_ripetizioni():
    for nome, (sol, _, rif) in SOLUZIONE.items():
        assert f"soluzione {sol}" not in rif, nome


@pytest.mark.skipif(not (OUT / "catalog-sats.json").exists(), reason="frammento dei satelliti non generato")
def test_frammento_satelliti_fonti():
    corpi = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))["corpi"]
    for slug, c in corpi.items():
        for campo, v in c["fisica"].items():
            if v is not None:
                assert "§" not in v["fonte"], (slug, campo)
    r = corpi["febe"]["fisica"]["rotazione"]
    assert r is not None and r["valore"] == pytest.approx(9.27398, abs=1e-5)
    assert corpi["febe"]["orientamento"]["modello"] == "fisso"


def test_disnomia_raggio_di_brown_e_butler_2023():
    """§ 9: nuova osservazione ALMA a 6,5σ, diametro 615 +60/-50 km (raggio 307,5 km, incertezza maggiore +30/-25),
    che supera i 700 ± 115 km del 2018 (3,5σ): Brown e Butler (2023), PSJ 4:193, doi:10.3847/PSJ/ace52a, § 2.3."""
    from sats import anagrafica, uscite

    assert sf.RAGGIO_DISNOMIA == 307.5 and sf.RAGGIO_DISNOMIA_SIGMA == 30.0
    fonte = sf.FONTE_RAGGIO_DISNOMIA
    assert "doi:10.3847/PSJ/ace52a" in fonte and "615 +60/-50 km" in fonte and "2018" not in fonte
    assert sf.ANNO_RAGGIO_DISNOMIA == 2023 == int(re.search(r"\((\d{4})\)", fonte).group(1))
    disnomia = next(s for s in anagrafica.satelliti() if s.naif is None)
    raggi = uscite._fisica(disnomia)["raggi_km"]
    assert raggi == {"valore": [307.5] * 3, "incertezza": [30.0] * 3, "fonte": fonte, "anno": 2023}


@pytest.mark.skipif(not (OUT / "catalog-sats.json").exists(), reason="frammento dei satelliti non generato")
def test_disnomia_frammento_e_catalogo_pubblicato():
    """Il frammento dei satelliti e catalog.json riportano il raggio del 2023, senza albedo (§ 9: nessuna albedo
    per i satelliti)."""
    import catalog as cg

    frammento = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))["corpi"]["disnomia"]["fisica"]
    assert frammento["raggi_km"]["valore"] == [307.5] * 3 and frammento["raggi_km"]["anno"] == 2023
    if cg.FILE_CATALOGO.exists():
        per = {c["slug"]: c for c in json.loads(cg.FILE_CATALOGO.read_text(encoding="utf-8"))["corpi"]}
        assert per["disnomia"]["fisica"]["raggi_km"] == frammento["raggi_km"]
        assert per["disnomia"]["fisica"]["albedo"] is None


def test_raggi_superati_da_misure_dirette(ctx):
    """§ 9: dati SBDB superati da occultazioni, sorvoli o radiometria più recente (PRECEDENZA_LETTERATURA)."""
    attesi = {
        "chiron": ([107.8] * 3, "Fornasier et al. 2013"),  # D = 215,6 ± 9,9 km (SBDB: 166 km, lista del 1998)
        "chariklo": ([143.8, 135.2, 99.1], "Morgado et al. 2021"),  # SBDB: 302 km (2002)
        "mani": ([398] * 3, "Rommel et al. 2023"),  # occultazione, 796 ± 24 km (radiometria: 934 km)
        "didymos": ([0.4255, 0.4245, 0.31], "Daly et al. 2023"),  # DART, 851 × 849 × 620 m
        "103p-hartley-2": ([0.58] * 3, "Thomas et al. 2013"),  # EPOXI (SBDB: 1,6 km di diametro)
    }
    for slug, (valore, fonte) in attesi.items():
        r = _fisica(ctx, slug)["raggi_km"]
        assert r["valore"] == valore and r["fonte"].startswith(fonte), slug
    a = _fisica(ctx, "mani")["albedo"]
    assert a["valore"] == 0.1 and a["fonte"].startswith("Rommel et al. 2023")


def test_salacia_rotazione_sincrona(ctx):
    """Collyer et al. 2025, § 5.2: Tsid = 5,49403 ± 0,00016 d; i 6,09 h della LCDB sono un alias."""
    r = _fisica(ctx, "salacia")["rotazione"]
    assert r["fonte"].startswith("Collyer et al. 2025") and r["anno"] == 2025
    assert r["valore"] == pytest.approx(5.49403 * 24.0, abs=1e-3)
    assert r["incertezza"] == pytest.approx(0.00016 * 24.0, abs=1e-4)


def test_gm_coerenti_con_le_fonti_citate(ctx):
    """67P: GM = 666,2 ± 0,2 m³/s² (Pätzold et al. 2016; SBDB 662,2). GM SBDB dichiarati come derivati da una
    massa pubblicata ("derived from published mass of M kg"): il valore del catalogo vale G·M."""
    g = _fisica(ctx, "67p-churyumov-gerasimenko")["gm_km3s2"]
    assert g["valore"] == pytest.approx(666.2e-9, rel=1e-12) and g["fonte"].startswith("Pätzold et al. 2016")
    corpi, _, _ = ctx
    controllati = 0
    for slug, c in corpi.items():
        for p in sbdb.leggi(c).fisica:
            m = re.search(r"published mass of ([0-9.eE+-]+) kg", p.get("notes") or "")
            if p["name"] == "GM" and m:
                gm = _fisica(ctx, slug)["gm_km3s2"]["valore"]
                assert gm == pytest.approx(G_CODATA_2018 * float(m.group(1)), rel=1e-6), slug
                controllati += 1
    assert controllati >= 1  # Itokawa: SBDB 2,1e-9, massa citata 3,51e10 kg (Fujiwara et al. 2006)


def _ma_de441(n: int) -> float:
    """Costante MAnnnn (UA³/d²) della tabella DE440/DE441 nell'area commenti di nep097.bsp, in km³/s²."""
    testo = (sf.RAW / "commenti" / "nep097.bsp.commenti.txt").read_text(encoding="latin-1")
    m = re.search(rf"MA{n:04d}\s+([0-9.eE+-]+)", testo)
    assert m is not None
    return float(m.group(1)) * cst.UA_KM**3 / cst.GIORNO_S**2


def test_gm_asteroidi_da_de441(ctx):
    """GM SBDB assenti o superati (Igea: Scholl 1987; Interamnia: Landgraf 1992): costanti MA di DE441."""
    for slug, n in {
        "giunone": 3,
        "igea": 10,
        "euphrosyne": 31,
        "52-europa": 52,
        "patientia": 451,
        "davida": 511,
        "interamnia": 704,
    }.items():
        g = _fisica(ctx, slug)["gm_km3s2"]
        assert g is not None and g["fonte"].startswith("DE441") and f"MA{n:04d}" in g["fonte"], slug
        assert g["valore"] == pytest.approx(_ma_de441(n), rel=1e-14), slug


def test_gm_dei_sistemi_binari(ctx):
    """Masse dalle orbite dei satelliti (sistema, salvo Sylvia: primario del modello a tre corpi)."""
    attese = {
        "orco": (6.32e20, "Brown et al. 2010"),
        "quaoar": (1.208e21, "Braga-Ribas et al. 2025"),
        "salacia": (4.861e20, "Collyer et al. 2025"),
        "didymos": (5.6e11, "Daly et al. 2023"),
        "sylvia": (1.484e19, "Fang et al. 2012"),
    }
    for slug, (massa, fonte) in attese.items():
        g = _fisica(ctx, slug)["gm_km3s2"]
        assert g is not None and g["fonte"].startswith(fonte), slug
        assert g["valore"] == pytest.approx(G_CODATA_2018 * massa, rel=1e-6), slug
        assert g["incertezza"] is not None and 0 < g["incertezza"] < 0.1 * g["valore"], slug


def test_rotazione_retrograda_dei_piccoli_corpi(ctx):
    """Inclinazione dell'asse tra il polo WGCCRE positivo e l'orbita SBDB: oltre 90° per Itokawa, Steins, Ida,
    Lutetia e 19P (poli di pck00011.tpc)."""
    for slug in sc.NAIF_PCK:
        assert _fisica(ctx, slug)["inclinazioneAssiale_gradi"] is not None, slug
    for slug, v in {"itokawa": 178.7, "steins": 172.2, "ida": 156.0, "19p-borrelly": 103.7, "lutetia": 95.2}.items():
        assert _fisica(ctx, slug)["inclinazioneAssiale_gradi"]["valore"] == pytest.approx(v, abs=0.1), slug
    for slug in ("cerere", "pallade", "vesta", "eros", "gaspra", "67p-churyumov-gerasimenko", "9p-tempel-1"):
        assert _fisica(ctx, slug)["inclinazioneAssiale_gradi"]["valore"] < 90.0, slug
    assert "inclinazioneAssiale_gradi" not in _fisica(ctx, "chiron")  # senza polo: verso non indicato


def test_incertezza_gm_satelliti_con_costante_invariata():
    """Pagina JPL con soluzione precedente ma stesso valore alle cifre pubblicate: incertezza della pagina
    (Fobos, Deimos: MAR097; Imalia: JUP344; Tritone, Proteo: NEP097). Satelliti di Urano: URA111 diversa da
    URA182, nessuna incertezza."""
    from sats.costanti import gm_kernel

    casi = {401: "mar099.bsp", 402: "mar099.bsp", 506: "jup347.bsp", 801: "nep098_part-1.bsp", 808: "nep098_part-3.bsp"}
    for naif, k in casi.items():
        d = sf.dati(naif)
        assert d.gm_soluzione != SOLUZIONE[k][0]
        assert sf.sigma_gm(d, gm_kernel(k)[naif], SOLUZIONE[k][0]) == d.gm_sigma, naif
    for naif in (701, 702, 703, 704, 705):
        assert sf.sigma_gm(sf.dati(naif), gm_kernel("ura184_part-3.bsp")[naif], "URA182") is None, naif
    # stessa soluzione: incertezza della pagina (Titano, SAT441)
    assert sf.sigma_gm(sf.dati(606), gm_kernel("sat441.bsp")[606], "SAT441") == sf.dati(606).gm_sigma


def test_periodi_dei_satelliti_non_sincroni():
    """Periodi pubblicati: Imalia (Pilcher et al. 2012, sinodico), Nereide (Kiss et al. 2016), Notte e Idra
    (Weaver et al. 2016, in giorni)."""
    p = sf.PERIODI_LETTERATURA
    assert p[506][:2] == (7.7819, 0.0005) and "sinodico" in p[506][2]
    assert p[802][:2] == (11.594, 0.017)
    assert p[902][:2] == pytest.approx((1.829 * 24.0, 0.009 * 24.0))
    assert p[903][:2] == pytest.approx((0.4295 * 24.0, 0.0008 * 24.0))
    assert all(sf.periodo_wgccre(n) is None for n in p)


@pytest.mark.skipif(not (OUT / "catalog-sats.json").exists(), reason="frammento dei satelliti non generato")
def test_frammento_satelliti_rotazione_e_gm():
    corpi = json.loads((OUT / "catalog-sats.json").read_text(encoding="utf-8"))["corpi"]
    for slug in ("imalia", "nereide", "notte", "idra"):
        r = corpi[slug]["fisica"]["rotazione"]
        assert r is not None and r["incertezza"] is not None, slug
        assert corpi[slug]["orientamento"]["modello"] == "fisso", slug
    for slug in ("fobos", "deimos", "imalia", "tritone", "proteo"):
        assert corpi[slug]["fisica"]["gm_km3s2"]["incertezza"] is not None, slug
    for slug in ("miranda", "ariel", "umbriel", "titania", "oberon"):
        assert corpi[slug]["fisica"]["gm_km3s2"]["incertezza"] is None, slug
    # Febe: polo pck00011 (Ẇ > 0) a circa 156° dalla normale alla sua orbita retrograda attorno a Saturno
    assert corpi["febe"]["fisica"]["inclinazioneAssiale_gradi"]["valore"] == pytest.approx(156.1, abs=0.5)


def test_issione_e_quaoar_dalle_occultazioni(ctx):
    """§ 9: occultazioni stellari al posto della radiometria. Issione: Kilic et al. 2026, R_equiv 348,39 km,
    pV 0,106 (Lellouch et al. 2013: 308,5 ± 10 km, 4 σ). Quaoar: Pereira et al. 2023, R_equiv 543 ± 2 km,
    pV 0,124 ± 0,006 (Fornasier et al. 2013: valore del sistema con Weywot)."""
    i = _fisica(ctx, "issione")
    assert i["raggi_km"]["valore"] == [348.39] * 3 and i["raggi_km"]["incertezza"] == [5.37] * 3
    assert i["raggi_km"]["fonte"].startswith("Kilic et al. 2026") and i["raggi_km"]["anno"] == 2026
    assert i["albedo"]["valore"] == 0.106 and i["albedo"]["incertezza"] == 0.003
    q = _fisica(ctx, "quaoar")
    assert q["raggi_km"]["valore"] == [543] * 3 and q["raggi_km"]["incertezza"] == [2] * 3
    assert q["raggi_km"]["fonte"].startswith("Pereira et al. 2023")
    assert q["albedo"]["valore"] == 0.124 and q["albedo"]["fonte"].startswith("Pereira et al. 2023")


def test_albedo_misurate_e_incertezza_della_massa(ctx):
    """Gonggong: pV 0,14 ± 0,01 e massa 1,75 ± 0,07·10²¹ kg (Kiss et al. 2019, tab. 3 e § 3); 67P: albedo
    geometrica 6,5 ± 0,2 % a 649 nm (Fornasier et al. 2015, OSIRIS)."""
    g = _fisica(ctx, "gonggong")
    assert g["albedo"]["valore"] == 0.14 and g["albedo"]["incertezza"] == 0.01
    assert g["albedo"]["fonte"].startswith("Kiss et al. 2019")
    assert g["gm_km3s2"]["incertezza"] == pytest.approx(G_CODATA_2018 * 0.07e21, rel=1e-5)
    c = _fisica(ctx, "67p-churyumov-gerasimenko")["albedo"]
    assert c["valore"] == 0.065 and c["incertezza"] == 0.002
    assert c["fonte"].startswith("Fornasier et al. 2015") and "649 nm" in c["fonte"]


def test_rotazione_retrograda_da_poli_sbdb_e_di_letteratura(ctx):
    """Senza modello WGCCRE: polo SBDB (Bennu, Ryugu, Didymos) o di letteratura (Arrokoth, Spencer et al. 2020:
    obliquità 99 ± 1°; Hektor, Marchis et al. 2014: polo eclittico 332°, -32° ± 10°), con la normale all'orbita
    osculante SBDB."""
    attese = {"bennu": 177.5, "ryugu": 171.7, "didymos": 170.8, "arrokoth": 99.3, "hektor": 117.0}
    for slug, v in attese.items():
        a = _fisica(ctx, slug)["inclinazioneAssiale_gradi"]
        assert a["valore"] == pytest.approx(v, abs=0.1), slug
        assert a["fonte"].startswith("derivata dal polo") and "orbita osculante della soluzione SBDB" in a["fonte"]
    assert "Spencer et al. 2020" in _fisica(ctx, "arrokoth")["inclinazioneAssiale_gradi"]["fonte"]
    assert "Marchis et al. 2014" in _fisica(ctx, "hektor")["inclinazioneAssiale_gradi"]["fonte"]
    # convenzione del polo SBDB (polo positivo): stesso verso del polo WGCCRE per i corpi che hanno entrambi
    corpi, lett, _ = ctx
    for slug in ("cerere", "pallade", "vesta", "lutetia", "eros", "itokawa", "67p-churyumov-gerasimenko"):
        sb = sbdb.leggi(corpi[slug])
        pole = next(p for p in sb.fisica if p["name"] == "pole")
        da_sbdb = sc.inclinazione_da_polo(*sc.polo_noto(pole, None), sb.orbita)["valore"]
        wgccre = _fisica(ctx, slug)["inclinazioneAssiale_gradi"]["valore"]
        assert da_sbdb == pytest.approx(wgccre, abs=5.0), slug


def test_parametri_sbdb_non_verificati_esclusi(ctx):
    """§ 9: un valore che SBDB marca "value unverified" (C/1996 B2, diametro 4,2 km, rif. DASTCOM) non è usato;
    nucleo di Hyakutake dal radar di Goldstone, 2-3 km di diametro (Harmon et al. 1997)."""
    r = _fisica(ctx, "c1996-b2-hyakutake")["raggi_km"]
    assert r["valore"] == [1.25] * 3 and r["incertezza"] == [0.25] * 3
    assert r["fonte"].startswith("Harmon et al. 1997") and r["anno"] == 1997
    corpi, _, _ = ctx
    for slug, c in corpi.items():
        f = _fisica(ctx, slug)
        for p in sbdb.leggi(c).fisica:
            if "unverified" in (p.get("notes") or "").lower():
                fonti = [v["fonte"] for v in f.values() if v is not None]
                assert all(not x.startswith("JPL SBDB") or p["ref"] not in x for x in fonti), (slug, p["name"])


def test_fonti_senza_refusi_tipografici(ctx):
    """Potenze con esponenti tipografici (Itokawa: massa 3,51·10¹⁰ kg) e nessun punto prima della congiunzione nelle
    fonti composte (Ryugu: riferimento SBDB del polo che termina con "L4.")."""
    corpi, _, _ = ctx
    for slug in corpi:
        for campo, v in _fisica(ctx, slug).items():
            if v is not None:
                assert "^" not in v["fonte"], (slug, campo)
                assert ". e " not in v["fonte"], (slug, campo)
    assert _fisica(ctx, "itokawa")["gm_km3s2"]["fonte"].endswith("(massa 3,51·10¹⁰ kg)")
    assert "A&A 632 L4 e dall'orbita osculante" in _fisica(ctx, "ryugu")["inclinazioneAssiale_gradi"]["fonte"]


def test_periodi_a_doppio_picco_di_quaoar_e_gonggong(ctx):
    """LCDB 8,84 h e 22,4 h (picco singolo, copertura parziale): superati dai periodi a doppio picco (Ortiz et al.
    2003, riportato in Pereira et al. 2023, tab. 1; Pál et al. 2016, preferito con probabilità superiore al 99 %)."""
    q = _fisica(ctx, "quaoar")["rotazione"]
    assert (q["valore"], q["incertezza"], q["anno"]) == (17.6788, 0.0004, 2003)
    assert q["fonte"].startswith("Ortiz et al. 2003, A&A 409, L13")
    g = _fisica(ctx, "gonggong")["rotazione"]
    assert (g["valore"], g["incertezza"], g["anno"]) == (44.81, 0.37, 2016)
    assert g["fonte"].startswith("Pál et al. 2016, AJ 151, 117")


def test_patroclus_primario_senza_menoetius(ctx):
    """Diametro NEOWISE di SBDB (140,4 km): sistema non risolto. Assi medi 127 × 117 × 98 km del solo Patroclus
    (Buie et al. 2015), diametro equivalente in volume 113 km."""
    r = _fisica(ctx, "patroclus")["raggi_km"]
    assert r["valore"] == [63.5, 58.5, 49.0] and r["anno"] == 2015
    assert r["fonte"].startswith("Buie et al. 2015, AJ 149, 113")
    assert 2.0 * math.prod(r["valore"]) ** (1.0 / 3.0) == pytest.approx(113.0, abs=0.5)


def test_gm_dei_troiani_binari(ctx):
    """Masse dalle orbite dei satelliti: sistema Patroclus-Menoetius (Grundy et al. 2018, μ = 0,0941 ± 0,0019
    km³/s²); primario per Hektor (Marchis et al. 2014) ed Eurybates (Brown et al. 2021)."""
    p = _fisica(ctx, "patroclus")["gm_km3s2"]
    assert (p["valore"], p["incertezza"], p["anno"]) == (0.0941, 0.0019, 2018)
    assert p["fonte"].startswith("Grundy et al. 2018") and "massa del sistema" in p["fonte"]
    for slug, massa, sigma, fonte, anno in (
        ("hektor", 7.9e18, 1.4e18, "Marchis et al. 2014", 2014),
        ("eurybates", 1.51e17, 0.03e17, "Brown et al. 2021", 2021),
    ):
        g = _fisica(ctx, slug)["gm_km3s2"]
        assert g is not None and g["fonte"].startswith(fonte) and g["anno"] == anno, slug
        assert "massa del primario dal modello" in g["fonte"], slug
        assert g["valore"] == pytest.approx(G_CODATA_2018 * massa, rel=1e-6), slug
        assert g["incertezza"] == pytest.approx(G_CODATA_2018 * sigma, rel=1e-5), slug


def test_raggi_pck_senza_estensione_sbdb(ctx):
    """§ 9: senza estensione SBDB, semiassi di pck00011.tpc anche per i corpi senza modello WGCCRE (codice NAIF
    2 000 000 + numero per i pianetini, SPK-ID per le comete). Mathilde 33 × 24 × 23 km, 81P 2,7 × 1,9 × 1,5 km."""
    corpi, lett, pck = ctx
    m = _fisica(ctx, "mathilde")["raggi_km"]
    assert m["valore"] == [33.0, 24.0, 23.0] and m["fonte"] == sc.FONTE_PCK and m["anno"] == 2018
    w = _fisica(ctx, "81p-wild-2")["raggi_km"]
    assert w["valore"] == [2.7, 1.9, 1.5] and w["fonte"] == sc.FONTE_PCK
    controllati = 0
    for slug, c in corpi.items():
        sb = sbdb.leggi(c)
        if slug in sc.RAGGI_PCK_ESCLUSI or "raggi_km" in sc.PRECEDENZA_LETTERATURA.get(slug, set()):
            continue
        if any(p["name"] == "extent" for p in sb.fisica):
            continue
        codici = {sc.NAIF_PCK.get(slug), c.naif_sb441}
        codici.add(sb.spkid if c.categoria == "cometa" else (2_000_000 + c.numero if c.numero else None))
        if any(f"BODY{k}_RADII" in pck for k in codici if k):
            assert _fisica(ctx, slug)["raggi_km"]["fonte"] == sc.FONTE_PCK, slug
            controllati += 1
    assert controllati >= 6  # 52 Europa, Davida, Šteins, 67P, Mathilde, 81P


def test_albedo_dalla_stessa_soluzione_del_raggio(ctx):
    """Chiron: pV 16,7 (+3,7 -3,0) % della soluzione NEATM del raggio adottato (Fornasier et al. 2013, tab. 4).
    Chariklo: TPM di Fornasier et al. 2013 (D = 248 ± 18 km, pV 3,5 ± 1,0 %), coerente con il diametro equivalente
    in volume dell'ellissoide di Morgado et al. 2021 (249 km); l'albedo SBDB 0,045 è della radiometria del 2002."""
    c = _fisica(ctx, "chiron")["albedo"]
    assert (c["valore"], c["incertezza"], c["anno"]) == (0.167, 0.037, 2013)
    assert c["fonte"] == _fisica(ctx, "chiron")["raggi_km"]["fonte"]
    k = _fisica(ctx, "chariklo")
    assert (k["albedo"]["valore"], k["albedo"]["incertezza"]) == (0.035, 0.01)
    assert k["albedo"]["fonte"].startswith("Fornasier et al. 2013")
    d_vol = 2.0 * math.prod(k["raggi_km"]["valore"]) ** (1.0 / 3.0)
    assert d_vol == pytest.approx(248.0, abs=18.0)


def test_raggi_dai_modelli_di_forma_di_igea_interamnia_sylvia(ctx):
    """§ 9: i diametri radiometrici SBDB (IRAS 407 km; NEOWISE 306 e 253 km) sono superati dai modelli di forma 3D.
    Igea: raggio equivalente in volume 217 ± 7 km (Vernazza et al. 2020). Interamnia: D = 332 ± 6 km e periodo
    siderale 8,712336(10) h (Hanuš et al. 2020, tab. 2). Sylvia: Dv = 273 km, ± 10 km a 3 σ (Berthier et al. 2014,
    tab. 6), cioè ± 3,33 km a 1 σ come le altre voci. Le albedo SBDB, legate ai diametri superati, non sono adottate."""
    igea = _fisica(ctx, "igea")["raggi_km"]
    assert igea["valore"] == [217] * 3 and igea["incertezza"] == [7] * 3 and igea["anno"] == 2020
    assert igea["fonte"].startswith("Vernazza et al. 2020, Nature Astronomy 4, 136")
    i = _fisica(ctx, "interamnia")
    assert i["raggi_km"]["valore"] == [166] * 3 and i["raggi_km"]["incertezza"] == [3] * 3
    assert i["raggi_km"]["fonte"].startswith("Hanuš et al. 2020, A&A 633, A65") and i["raggi_km"]["anno"] == 2020
    r = i["rotazione"]
    assert (r["valore"], r["incertezza"], r["anno"]) == (8.712336, 1e-5, 2020)
    assert r["fonte"].startswith("Hanuš et al. 2020") and "siderale" in r["fonte"]
    sy = _fisica(ctx, "sylvia")["raggi_km"]
    assert sy["valore"] == [136.5] * 3 and sy["anno"] == 2014
    assert sy["incertezza"] == pytest.approx([10.0 / 3.0 / 2.0] * 3, abs=1e-4)
    assert sy["fonte"].startswith("Berthier et al. 2014, Icarus 239, 118") and "3 σ" in sy["fonte"]
    corpi, _, _ = ctx
    for slug in ("igea", "interamnia", "sylvia", "hektor"):
        # esiste un'albedo SBDB (IRAS, NEOWISE, TRIAD), ma non è coerente con il diametro adottato: non noto
        assert any(p["name"] == "albedo" for p in sbdb.leggi(corpi[slug]).fisica), slug
        assert _fisica(ctx, slug)["albedo"] is None, slug
    assert set(sc.SBDB_SUPERATO_SENZA_SOSTITUTO) == {"igea", "interamnia", "sylvia", "hektor"}
    # l'esclusione riguarda solo questi quattro corpi
    for slug, c in corpi.items():
        if slug not in sc.SBDB_SUPERATO_SENZA_SOSTITUTO and any(
            p["name"] == "albedo" and sc._verificato(p) for p in sbdb.leggi(c).fisica
        ):
            assert _fisica(ctx, slug)["albedo"] is not None, slug


def test_hektor_dal_modello_di_marchis(ctx):
    """SBDB: 225 km di "J.G. Williams 9-90" senza incertezza, P = 6,924 h (LCDB), nessun polo. Marchis et al. 2014,
    tab. 1: diametro equivalente 250 ± 26 km (1 σ), P = 6,92050885 ± 0,000002 h, polo eclittico J2000 λ = 332°,
    β = -32° (± 10°): obliquità 117°, rotazione retrograda."""
    f = _fisica(ctx, "hektor")
    r = f["raggi_km"]
    assert r["valore"] == [125] * 3 and r["incertezza"] == [13] * 3 and r["anno"] == 2014
    assert r["fonte"].startswith("Marchis et al. 2014, ApJL 783, L37") and "250 ± 26 km" in r["fonte"]
    p = f["rotazione"]
    assert (p["valore"], p["incertezza"], p["anno"]) == (6.92050885, 2e-6, 2014)
    assert p["fonte"].startswith("Marchis et al. 2014")
    a = f["inclinazioneAssiale_gradi"]
    # angolo tra il polo eclittico (332°, -32°) e la normale all'orbita osculante SBDB (i = 18,147°, Ω = 342,80°)
    corpi, _, _ = ctx
    lam, beta = math.radians(332.0), math.radians(-32.0)
    polo = [math.cos(beta) * math.cos(lam), math.cos(beta) * math.sin(lam), math.sin(beta)]
    n = sc.normale_orbita(sbdb.leggi(corpi["hektor"]).orbita)
    atteso = math.degrees(math.acos(sum(x * y for x, y in zip(polo, n, strict=True))))
    assert a["valore"] == pytest.approx(atteso, abs=1e-9) and a["valore"] == pytest.approx(117.0, abs=0.1)
    assert a["fonte"].startswith("derivata dal polo di Marchis et al. 2014") and a["anno"] == 2014
    # albedo SBDB (TRIAD, 0,025, senza incertezza): con H = 7,32 corrisponde a D ≈ 289 km, non ai 250 km adottati;
    # Marchis et al. 2014 non pubblicano un'albedo: non nota
    fisica_sbdb = sbdb.leggi(corpi["hektor"]).fisica
    alb = next(p for p in fisica_sbdb if p["name"] == "albedo")
    h = next(p for p in fisica_sbdb if p["name"] == "H")
    assert (alb["value"], alb["ref"]) == ("0.025", "EAR-A-5-DDR-ALBEDOS-V1.0:TRIAD")
    assert 1329.0 / math.sqrt(0.025) * 10 ** (-float(h["value"]) / 5.0) == pytest.approx(289.0, abs=1.0)
    assert f["albedo"] is None
    # il polo di letteratura in coordinate eclittiche vale quello in A.R. e Dec. (ICRF) dato alla funzione comune
    ra, dec, _, _ = sc.polo_noto(None, {"lambda_ecl": 332, "beta_ecl": -32, "fonte": "x", "anno": 2014})
    assert (ra, dec) == pytest.approx((348.34, -40.13), abs=0.01)  # sin δ = sin β cos ε + cos β sin ε sin λ


def _sigma_montecarlo(polo: dict, o, n: int = 200_000, seme: int = 20261022) -> float:
    """Deviazione standard dell'inclinazione con le coordinate della fonte estratte da gaussiane indipendenti di
    deviazione standard "incertezza_gradi" (riferimento indipendente dalla propagazione al primo ordine)."""
    import numpy as np

    from common.frames import MATRICE_ICRF_A_ECLITTICA

    rng = np.random.default_rng(seme)
    eclittico = "lambda_ecl" in polo
    c1, c2 = (polo["lambda_ecl"], polo["beta_ecl"]) if eclittico else (polo["ra"], polo["dec"])
    a = np.radians(c1 + polo["incertezza_gradi"] * rng.standard_normal(n))
    b = np.radians(c2 + polo["incertezza_gradi"] * rng.standard_normal(n))
    v = np.stack([np.cos(b) * np.cos(a), np.cos(b) * np.sin(a), np.sin(b)], axis=1)
    p = v if eclittico else v @ MATRICE_ICRF_A_ECLITTICA.T
    return float(np.degrees(np.arccos(np.clip(p @ np.array(sc.normale_orbita(o)), -1.0, 1.0))).std())


def test_inclinazione_dal_polo_di_letteratura_con_incertezza(ctx):
    """Arrokoth (A.R. 317,5° ± 1°, Dec. -24,9° ± 1°; obliquità pubblicata 99 ± 1°, Spencer et al. 2020) e Hektor
    (λ = 332° ± 10°, β = -32° ± 10°, Marchis et al. 2014, tab. 1): incertezza propagata al primo ordine nelle
    coordinate della fonte."""
    corpi, lett, _ = ctx
    arr = _fisica(ctx, "arrokoth")["inclinazioneAssiale_gradi"]
    hek = _fisica(ctx, "hektor")["inclinazioneAssiale_gradi"]
    assert arr["incertezza"] == pytest.approx(1.0, abs=0.05)
    assert hek["incertezza"] == pytest.approx(9.8, abs=0.1)
    for slug, a in (("arrokoth", arr), ("hektor", hek)):
        o = sbdb.leggi(corpi[slug]).orbita
        assert a["incertezza"] == pytest.approx(_sigma_montecarlo(lett[slug]["polo"], o), rel=0.03), slug
    # ±10° di λ e β non valgono come ±10° di A.R. e Dec.: nelle coordinate della fonte il risultato è diverso
    polo = dict(lett["hektor"]["polo"])
    ra, dec, _, _ = sc.polo_noto(None, polo)
    equatoriale = {"ra": ra, "dec": dec, "incertezza_gradi": polo["incertezza_gradi"]}
    o = sbdb.leggi(corpi["hektor"]).orbita
    sbagliata = sc.incertezza_inclinazione(None, equatoriale, o)
    assert abs(sbagliata - hek["incertezza"]) > 0.3


def test_incertezza_inclinazione_solo_con_polo_di_letteratura_e_incertezza_pubblicata(ctx):
    corpi, _, _ = ctx
    o = sbdb.leggi(corpi["hektor"]).orbita
    base = {"lambda_ecl": 332, "beta_ecl": -32, "fonte": "x", "anno": 2014}
    assert sc.incertezza_inclinazione(None, base, o) is None  # incertezza non pubblicata
    assert sc.incertezza_inclinazione(None, None, o) is None
    assert sc.incertezza_inclinazione(None, {**base, "incertezza_gradi": 10}, o) == pytest.approx(9.833, abs=1e-3)
    # con un polo SBDB utilizzabile si adotta quello (polo_noto) e l'incertezza della letteratura non vale
    sb_polo = {"value": "78, -71 degrees", "ref": "Naidu et al. (2020)", "sigma": "20 degrees"}
    assert sc.incertezza_inclinazione(sb_polo, {**base, "incertezza_gradi": 10}, o) is None
    # l'incertezza passa alla voce dell'inclinazione e resta null senza di essa
    assert sc.inclinazione_da_polo(10.0, 20.0, "polo di x", 2020, o, 1.5)["incertezza"] == 1.5
    assert sc.inclinazione_da_polo(10.0, 20.0, "polo di x", 2020, o)["incertezza"] is None
    # i poli SBDB e WGCCRE restano senza incertezza (§ 9)
    for slug in ("bennu", "ryugu", "didymos", "cerere", "vesta"):
        assert _fisica(ctx, slug)["inclinazioneAssiale_gradi"]["incertezza"] is None, slug
