"""Assemblaggio del catalogo (catalog.py): fusione dei frammenti, completamenti, validazione."""

import copy
import json

import pytest

import catalog as cg

ANAG = {
    "formato": 1,
    "corpi": [
        {
            "ssid": 0,
            "slug": "sole",
            "nome": "Sole",
            "nomeUfficiale": "Sun",
            "numero": None,
            "designazione": None,
            "categoria": "sole",
            "categorieSecondarie": [],
            "primario": None,
            "naif": 10,
            "sbdb": None,
            "alias": [],
        },
        {
            "ssid": 1,
            "slug": "cerere",
            "nome": "Cerere",
            "nomeUfficiale": "Ceres",
            "numero": 1,
            "designazione": None,
            "categoria": "pianeta-nano",
            "categorieSecondarie": ["asteroide"],
            "primario": "sole",
            "naif": 2000001,
            "sbdb": "1",
            "alias": [],
        },
    ],
}
SOL = {"id": "X", "data": None, "estrazione": "2026-10-19", "modelloNG": None, "recordDastcom": None}


def _fr(area, corpi):
    return (area, {"formato": 1, "area": area, "corpi": corpi})


def test_fondi_ricorsiva_e_conflitto():
    d = {"fisica": {"raggi_km": None}}
    orig = {}
    cg.fondi(d, {"fisica": {"albedo": None}}, "x", orig, "a")
    assert d == {"fisica": {"raggi_km": None, "albedo": None}}
    cg.fondi(d, {"fisica": {"albedo": None}}, "x", orig, "b")  # valore uguale: nessun conflitto
    with pytest.raises(cg.ConflittoCatalogo, match="x.fisica.albedo"):
        cg.fondi(d, {"fisica": {"albedo": 0.1}}, "x", orig, "c")


def test_assembla_completa_e_registra():
    fr = [
        _fr("a", {"sole": {"effemeridi": {"modello": "sole"}, "soluzione": SOL, "epsModelloCostante": 0.0}}),
        _fr(
            "b",
            {
                "cerere": {
                    "designazione": "A801 AA",
                    "alias": ["Ceres", "1 Ceres"],
                    "effemeridi": {"modello": "piccolo-corpo", "fonti": []},
                    "soluzione": SOL,
                    "fisica": {"raggi_km": None, "gm_km3s2": None},
                }
            },
        ),
    ]
    corpi, mancanti, incompleti = cg.assembla(copy.deepcopy(ANAG), fr)
    assert incompleti == []
    c = corpi[1]
    assert c["designazione"] == "A801 AA"
    assert c["alias"][:2] == ["Ceres", "1 Ceres"] and "Cerere" in c["alias"] and "1" in c["alias"]
    assert c["fisica"] == {"raggi_km": None, "gm_km3s2": None, "rotazione": None, "albedo": None}
    assert c["orientamento"]["modello"] == "fisso" and c["texture"] is None
    assert "fisica.albedo" in mancanti["cerere"] and "orientamento" in mancanti["cerere"]
    assert list(corpi[0])[: len(cg.ORDINE) - 3] == [k for k in cg.ORDINE if k in corpi[0]][: len(cg.ORDINE) - 3]


def test_assembla_conflitti_e_incompleti():
    with pytest.raises(cg.ConflittoCatalogo, match="categoria"):
        cg.assembla(copy.deepcopy(ANAG), [_fr("a", {"cerere": {"categoria": "asteroide"}})])
    with pytest.raises(cg.ConflittoCatalogo, match="naif"):
        cg.assembla(copy.deepcopy(ANAG), [_fr("a", {"cerere": {"naif": 1}})])
    fr = [_fr("a", {"sole": {"soluzione": SOL}}), _fr("b", {"sole": {"soluzione": {**SOL, "id": "Y"}}})]
    with pytest.raises(cg.ConflittoCatalogo, match="sole.soluzione.id"):
        cg.assembla(copy.deepcopy(ANAG), fr)
    with pytest.raises(ValueError, match="sconosciuto"):
        cg.assembla(copy.deepcopy(ANAG), [_fr("a", {"plutone": {}})])
    _, _, incompleti = cg.assembla(copy.deepcopy(ANAG), [_fr("a", {"sole": {"soluzione": SOL}})])
    assert incompleti == ["sole", "cerere"]


def test_categorie():
    c = cg.categorie()
    assert [x["id"] for x in c] == cg.CATEGORIE
    assert c[0] == {"id": "sole", "precedenza": 0, "filtrabile": False}
    assert all(x["filtrabile"] for x in c[1:])


def test_precedenza_della_categoria_primaria():
    """§ 4.2: la primaria è la categoria di precedenza minima tra quelle del corpo, salvo le eccezioni dichiarate
    (Chiron, centauro con attività cometaria)."""

    def corpo(ssid: int, slug: str, cat: str, sec: list[str]) -> dict:
        return {"ssid": ssid, "slug": slug, "categoria": cat, "categorieSecondarie": sec, "primario": "sole"}

    cat = {
        "corpi": [
            {**corpo(0, "sole", "sole", []), "primario": None},
            corpo(1, "cerere", "pianeta-nano", ["asteroide"]),
            corpo(2, "chiron", "centauro", ["cometa"]),
            corpo(3, "x", "centauro", ["cometa"]),
            corpo(4, "y", "asteroide", ["interstellare"]),
        ]
    }
    assert cg.controlli_a22(cat) == [
        "x: categoria primaria centauro invece di cometa (precedenza del § 4.2)",
        "y: categoria primaria asteroide invece di interstellare (precedenza del § 4.2)",
    ]


@pytest.mark.skipif(not cg.FILE_CATALOGO.exists(), reason="catalog.json non ancora generato")
def test_catalogo_pubblicato():
    cat = json.loads(cg.FILE_CATALOGO.read_text(encoding="utf-8"))
    assert cg.valida(cat) == []
    assert cg.controlli_a22(cat) == []
    corpi = cat["corpi"]
    assert len(corpi) == 112 and [c["ssid"] for c in corpi] == list(range(112))
    per = {c["slug"]: c for c in corpi}
    assert per["terra"]["orientamento"]["modello"] == "vondrak"
    assert per["luna"]["orientamento"]["modello"] == "cassini"
    assert per["urano"]["orientamento"]["convenzionePolo"] == "nord-IAU"
    assert per["saturno"]["anelli"]["elementi"]
    assert per["giove"]["fisica"]["gm_km3s2"]["valore"] > 1.26e8
    assert "Giove" in per["giove"]["alias"] and "Jupiter" in per["giove"]["alias"]


def test_nomi_e_designazioni_dal_minor_planet_center(tmp_path):
    """§ 4.3: nome ufficiale con i diacritici dell'MPC (Máni, Šteins) e designazione provvisoria primaria
    (Plutone 1930 BM) tra designazione e alias; Chiron conserva la designazione cometaria del doppio stato."""
    mpc = {
        "risposta": {
            "307261": {"found": 1, "name": "Máni", "unpacked_primary_provisional_designation": "2002 MS4"},
            "2060": {"found": 1, "name": "Chiron", "unpacked_primary_provisional_designation": "1977 UB"},
        }
    }
    f = tmp_path / "mpc.json"
    f.write_text(json.dumps(mpc, ensure_ascii=False), encoding="utf-8")

    def corpo(slug, nome, numero, des, alias):
        return {
            "slug": slug,
            "categoria": "tno",
            "nomeUfficiale": nome,
            "numero": numero,
            "designazione": des,
            "alias": alias,
        }

    cat = {
        "corpi": [
            corpo("mani", "Mani", 307261, "2002 MS4", ["Mani", "2002 MS4"]),
            corpo("chiron", "Chiron", 2060, "95P/Chiron", ["Chiron", "1977 UB"]),
        ]
    }
    assert cg.controlli_mpc(cat, f) == ["mani: nome ufficiale 'Mani', MPC 'Máni'"]
    cat["corpi"][1]["alias"] = ["Chiron"]
    assert cg.controlli_mpc(cat, f)[-1] == "chiron: designazione provvisoria MPC '1977 UB' assente dagli alias"


def test_nome_ufficiale_delle_comete_periodiche_numerate_dal_minor_planet_center(tmp_path):
    """§ 4.3: per le comete periodiche numerate il nome ufficiale è "NP/nome" dell'MPC, senza il numerale d'uso
    (9P/Tempel, non 9P/Tempel 1; linee guida IAU/WGSBN, art. 5.5); le comete non periodiche non sono numerate."""
    mpc = {
        "risposta": {
            "9P": {"found": 1, "name": "Tempel", "permid": "9P"},
            "1P": {"found": 1, "name": "Halley", "permid": "1P"},
        }
    }
    f = tmp_path / "mpc.json"
    f.write_text(json.dumps(mpc, ensure_ascii=False), encoding="utf-8")

    def cometa(slug, nome, ufficiale, des):
        return {
            "slug": slug,
            "categoria": "cometa",
            "nome": nome,
            "nomeUfficiale": ufficiale,
            "numero": None,
            "designazione": des,
            "alias": [nome, ufficiale, des],
        }

    cat = {
        "corpi": [
            cometa("1p-halley", "1P/Halley", "1P/Halley", "1P"),
            cometa("9p-tempel-1", "9P/Tempel 1", "9P/Tempel 1", "9P"),
            cometa("c1995-o1-hale-bopp", "C/1995 O1 (Hale-Bopp)", "C/1995 O1 (Hale-Bopp)", "C/1995 O1"),
        ]
    }
    assert cg.controlli_mpc(cat, f) == ["9p-tempel-1: nome ufficiale '9P/Tempel 1', MPC '9P/Tempel'"]
    cat["corpi"][1]["nomeUfficiale"] = "9P/Tempel"
    assert cg.controlli_mpc(cat, f) == []
    del mpc["risposta"]["9P"]
    f.write_text(json.dumps(mpc, ensure_ascii=False), encoding="utf-8")
    assert cg.controlli_mpc(cat, f) == ["9p-tempel-1: cometa 9P assente dalla risposta MPC"]


def test_identificatori_mpc_comprendono_le_comete_periodiche_numerate():
    """La richiesta all'Identifier API include i numeri dei pianetini e gli identificatori "NP" delle periodiche."""
    from small import mpc

    ids = mpc.numeri() + mpc.comete()
    for i in ("1P", "9P", "29P", "81P", "103P", "109P"):
        assert i in ids, i
    assert "95P" not in ids and "2060" in ids  # Chiron: pianetino numerato (centauro)
    assert not [i for i in ids if i.startswith("C/")]


@pytest.mark.skipif(not cg.FILE_CATALOGO.exists(), reason="catalog.json non ancora generato")
def test_catalogo_pubblicato_nomi_ufficiali_delle_comete():
    cat = json.loads(cg.FILE_CATALOGO.read_text(encoding="utf-8"))
    per = {c["slug"]: c for c in cat["corpi"]}
    for slug, nome, ufficiale in (
        ("9p-tempel-1", "9P/Tempel 1", "9P/Tempel"),
        ("29p-schwassmann-wachmann-1", "29P/Schwassmann-Wachmann 1", "29P/Schwassmann-Wachmann"),
        ("81p-wild-2", "81P/Wild 2", "81P/Wild"),
        ("103p-hartley-2", "103P/Hartley 2", "103P/Hartley"),
    ):
        c = per[slug]
        assert (c["nome"], c["nomeUfficiale"]) == (nome, ufficiale), slug
        assert {nome, ufficiale} <= set(c["alias"]), slug
    assert per["1p-halley"]["nome"] == per["1p-halley"]["nomeUfficiale"] == "1P/Halley"


@pytest.mark.skipif(not cg.FILE_CATALOGO.exists(), reason="catalog.json non ancora generato")
def test_catalogo_pubblicato_conforme_all_mpc():
    cat = json.loads(cg.FILE_CATALOGO.read_text(encoding="utf-8"))
    assert cg.controlli_mpc(cat) == []
    per = {c["slug"]: c for c in cat["corpi"]}
    assert per["mani"]["nomeUfficiale"] == "Máni" and per["steins"]["nomeUfficiale"] == "Šteins"
    assert per["plutone"]["designazione"] == "1930 BM" and "1930 BM" in per["plutone"]["alias"]


def test_main_stampa_i_byte_effettivi_del_file(tmp_path, monkeypatch, capsys):
    """Il messaggio riporta la dimensione del file UTF-8, non il numero di caratteri del testo."""
    cat = {"formato": 1, "generato": "2026-10-22T00:00:00Z", "corpi": [{"nome": "Šteins ± ʻOumuamua"}], "categorie": []}
    monkeypatch.setattr(cg, "costruisci", lambda generato=None: (cat, {}, [], []))
    monkeypatch.setattr(cg, "RADICE_REPO", tmp_path)
    monkeypatch.setattr(cg, "FILE_CATALOGO", tmp_path / "catalog.json")
    monkeypatch.setattr(cg, "FILE_MANCANTI", tmp_path / "mancanti.json")
    monkeypatch.setattr(cg, "FILE_PARZIALE", tmp_path / "parziale.json")
    assert cg.main(["--generato", "2026-10-22T00:00:00Z"]) == 0
    byte = (tmp_path / "catalog.json").stat().st_size
    assert len((tmp_path / "catalog.json").read_text(encoding="utf-8")) < byte  # caratteri non ASCII
    assert f"1 corpi, {byte} byte" in capsys.readouterr().out


def test_generato_conservato_se_il_catalogo_non_cambia(tmp_path, monkeypatch):
    """§ 8.10: la rigenerazione con dati invariati riscrive lo stesso file; il campo generato cambia solo con il
    contenuto, oppure se è indicato con --generato."""
    pubblicato = tmp_path / "catalog.json"
    monkeypatch.setattr(cg, "FILE_CATALOGO", pubblicato)
    antico = "2020-01-01T00:00:00Z"
    prima, _, incompleti, errori = cg.costruisci()
    assert incompleti == [] and errori == []
    assert prima["generato"] != antico
    pubblicato.write_text(json.dumps({**prima, "generato": antico}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    # contenuto invariato: resta il generato pubblicato
    invariato, _, _, errori = cg.costruisci()
    assert errori == [] and invariato == {**prima, "generato": antico}
    # generato indicato: prevale
    assert cg.costruisci("2030-05-06T07:08:09Z")[0]["generato"] == "2030-05-06T07:08:09Z"
    # contenuto cambiato: generato nuovo
    modificato = json.loads(pubblicato.read_text(encoding="utf-8"))
    modificato["corpi"][0]["nome"] += " (vecchio)"
    pubblicato.write_text(json.dumps(modificato, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    nuovo, _, _, errori = cg.costruisci()
    assert errori == [] and nuovo["generato"] != antico and nuovo["corpi"] == prima["corpi"]
    # catalogo pubblicato assente o illeggibile: generato nuovo
    pubblicato.write_text("{", encoding="utf-8")
    assert cg.costruisci()[0]["generato"] != antico
    pubblicato.unlink()
    assert cg.costruisci()[0]["generato"] != antico
