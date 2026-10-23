"""SHA-256 e manifest (§ 8.11, § 12.2)."""

import hashlib
import json

import pytest

from common import constants as cst
from common import manifest as mf


def test_sha256(tmp_path):
    p = tmp_path / "a.bin"
    contenuto = bytes(range(256)) * 9000  # più di un blocco di lettura
    p.write_bytes(contenuto)
    atteso = hashlib.sha256(contenuto).hexdigest()
    assert mf.sha256_file(p) == atteso == mf.sha256_bytes(contenuto)


def test_voce_e_manifest_dati(tmp_path):
    (tmp_path / "planets").mkdir()
    p = tmp_path / "planets" / "p03.bin"
    p.write_bytes(b"x" * 24)
    voce = mf.voce_manifest(tmp_path, p, "pianeti", 3)
    assert voce == {
        "percorso": "planets/p03.bin",
        "tipo": "pianeti",
        "blocco": 3,
        "byte": 24,
        "sha256": hashlib.sha256(b"x" * 24).hexdigest(),
    }
    (tmp_path / "catalog.json").write_text("{}")
    m = mf.manifest_dati("2026-10-18", [voce, mf.voce_manifest(tmp_path, "catalog.json", "catalogo")])
    assert [v["percorso"] for v in m["file"]] == ["catalog.json", "planets/p03.bin"]
    assert "blocco" not in m["file"][0]
    assert m["blocchi"] == {"T0": cst.T0, "B": cst.B, "K": cst.K, "T_END": cst.T_END}
    assert m["formato"] == 1 and m["versioneDati"] == "2026-10-18"


def test_manifest_sorgenti(tmp_path, monkeypatch):
    cache = tmp_path / "cache"
    (cache / "x").mkdir(parents=True)
    (cache / "x" / "f.bsp").write_bytes(b"abc")
    monkeypatch.setattr(mf, "CARTELLA_CACHE", cache)
    percorso = tmp_path / "raw" / "manifest-sorgenti.json"
    voce = mf.voce_sorgente("f.bsp", "https://esempio.invalid/f.bsp", "x/f.bsp", "2026-10-18")
    mf.aggiorna_manifest_sorgenti(voce, percorso)
    mf.aggiorna_manifest_sorgenti({**voce, "nome": "a.bsp"}, percorso)
    mf.aggiorna_manifest_sorgenti(voce, percorso)
    dati = json.loads(percorso.read_text())
    assert [v["nome"] for v in dati["sorgenti"]] == ["a.bsp", "f.bsp"]
    assert mf.cerca_sorgente("f.bsp", percorso)["sha256"] == hashlib.sha256(b"abc").hexdigest()
    mf.verifica_sorgente(voce, cache)
    (cache / "x" / "f.bsp").write_bytes(b"abd")
    with pytest.raises(ValueError):
        mf.verifica_sorgente(voce, cache)
    with pytest.raises(KeyError):
        mf.cerca_sorgente("z", percorso)


def test_manifest_sorgenti_del_repository():
    dati = mf.leggi_manifest_sorgenti()
    nomi = {v["nome"]: v for v in dati["sorgenti"]}
    for n in ("de441_part-1.bsp", "de441_part-2.bsp"):
        v = nomi[n]
        assert v["url"].startswith("https://naif.jpl.nasa.gov/")
        assert len(v["sha256"]) == 64 and v["byte"] > 1_000_000_000
        assert v["percorsoCache"] == f"de441/{n}"
        p = mf.CARTELLA_CACHE / v["percorsoCache"]
        if p.exists():
            mf.verifica_sorgente(v, con_sha=False)


def test_valore_se_invariato(tmp_path):
    """Un campo scritto dalla pipeline (generato, versioneDati) si conserva solo se il resto del file coincide."""
    f = tmp_path / "x.json"
    nuovo = {"formato": 1, "campo": "nuovo", "dati": [1, 2.5, {"a": "ʻŠ"}]}
    assert mf.valore_se_invariato(nuovo, "campo", f) is None  # assente
    f.write_text("{", encoding="utf-8")
    assert mf.valore_se_invariato(nuovo, "campo", f) is None  # illeggibile
    f.write_text("[1]", encoding="utf-8")
    assert mf.valore_se_invariato(nuovo, "campo", f) is None  # non è un oggetto
    scrivi = lambda d: f.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")  # noqa: E731
    scrivi({**nuovo, "campo": "vecchio"})
    assert mf.valore_se_invariato(nuovo, "campo", f) == "vecchio"
    scrivi({**nuovo, "campo": "vecchio", "dati": [1, 2.5, {"a": "x"}]})  # un valore diverso
    assert mf.valore_se_invariato(nuovo, "campo", f) is None
    scrivi({**nuovo, "campo": "vecchio", "dati": [1, 2, {"a": "ʻŠ"}]})  # 2.5 diventa 2
    assert mf.valore_se_invariato(nuovo, "campo", f) is None
    scrivi({"campo": "vecchio", "formato": 1, "dati": nuovo["dati"]})  # ordine delle chiavi diverso
    assert mf.valore_se_invariato(nuovo, "campo", f) is None
    scrivi({**nuovo, "campo": 3})  # il campo non è una stringa
    assert mf.valore_se_invariato(nuovo, "campo", f) is None
    scrivi({**nuovo, "altro": 1, "campo": "vecchio"})  # chiave in più
    assert mf.valore_se_invariato(nuovo, "campo", f) is None
