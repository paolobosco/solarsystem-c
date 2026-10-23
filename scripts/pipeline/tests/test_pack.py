"""Manifest dei dati, verifiche di A22 e budget del § 8.1 (pack.py)."""

import datetime
import json
import os
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

import pack
from common import binio
from common import constants as cst


def test_classifica():
    assert pack.classifica("planets/p07.bin")[:2] == ("pianeti", 7)
    assert pack.classifica("sats/s12.bin")[:2] == ("satelliti", 12)
    assert pack.classifica("small/b00.bin")[:2] == ("piccoli-corpi", 0)
    assert pack.classifica("reliability.bin")[:2] == ("affidabilita", None)
    assert pack.classifica("tex/67p.jpg")[:2] == ("texture", None)
    with pytest.raises(ValueError):
        pack.classifica("altro/x.bin")


def _stelle_minime() -> bytes:
    i = binio.Intestazione(b"SSSTAR01", binio.TIPO_STELLE, -1, 0, cst.T0, cst.T_END, 64, 64)
    return binio.scrivi_intestazione(i)


@pytest.fixture
def cartella(tmp_path):
    d = tmp_path / "v1"
    (d / "tex").mkdir(parents=True)
    (d / "stars.bin").write_bytes(_stelle_minime())
    (d / "time.json").write_text("{}\n", encoding="utf-8")
    (d / "tex" / "luna.jpg").write_bytes(b"\xff\xd8" + bytes(100))
    shutil.copy(pack.CARTELLA_DATI / "catalog.json", d / "catalog.json") if (
        pack.CARTELLA_DATI / "catalog.json"
    ).exists() else (d / "catalog.json").write_text("{}", encoding="utf-8")
    return d


def test_manifest_e_verifiche(cartella):
    man = pack.costruisci_manifest("2026-10-19", cartella)
    assert [v["percorso"] for v in man["file"]] == ["catalog.json", "stars.bin", "tex/luna.jpg", "time.json"]
    assert man["blocchi"] == {"T0": cst.T0, "B": cst.B, "K": cst.K, "T_END": cst.T_END}
    errori, rie = pack.verifica(man, cartella)
    non_catalogo = [e for e in errori if not e.startswith("catalogo") and "catalog.json" not in e]
    assert non_catalogo == []
    assert rie["file"] == 5 and rie["texture"]["numero"] == 1
    # SHA-256 alterato, file non elencato, intestazione non valida, file troppo grande
    (cartella / "tex" / "luna.jpg").write_bytes(b"\xff\xd8" + bytes(101))
    (cartella / "tex" / "marte.jpg").write_bytes(b"\xff\xd8")
    (cartella / "stars.bin").write_bytes(b"x" * 64)
    man["file"].append(
        {"percorso": "small/b03.bin", "tipo": "piccoli-corpi", "blocco": 3, "byte": 5_000_000, "sha256": "0" * 64}
    )
    errori, _ = pack.verifica(man, cartella)
    testo = "\n".join(errori)
    for frase in (
        "tex/luna.jpg: SHA-256 diverso",
        "non elencato nel manifest: tex/marte.jpg",
        "stars.bin:",
        "small/b03.bin: file assente",
    ):
        assert frase in testo


def test_versione_dati_cambia_solo_con_il_contenuto(cartella, monkeypatch):
    """§ 8.11: con dati invariati il manifest si riscrive identico (versioneDati compresa); cambia con un file,
    con --versione resta quella indicata."""

    def pubblica(versione):
        man = pack.costruisci_manifest(versione, cartella)
        (cartella / pack.FILE_MANIFEST.name).write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", "utf-8")
        return man

    oggi = SimpleNamespace(today=lambda: datetime.date(2026, 10, 22))
    monkeypatch.setattr(pack, "_dt", SimpleNamespace(date=oggi))
    primo = pubblica("2026-10-21")
    testo = (cartella / pack.FILE_MANIFEST.name).read_text(encoding="utf-8")
    # nessuna modifica: resta la versione pubblicata, anche se il giorno è cambiato
    assert pack.costruisci_manifest(None, cartella) == primo
    assert pubblica(None) == primo
    assert (cartella / pack.FILE_MANIFEST.name).read_text(encoding="utf-8") == testo
    assert pack.costruisci_manifest("2026-10-20", cartella)["versioneDati"] == "2026-10-20"  # --versione prevale
    # un file cambia: versione del giorno
    (cartella / "time.json").write_text('{"a": 1}\n', encoding="utf-8")
    cambiato = pack.costruisci_manifest(None, cartella)
    assert cambiato["versioneDati"] == "2026-10-22"
    assert [v["sha256"] for v in cambiato["file"] if v["percorso"] == "time.json"] != [
        v["sha256"] for v in primo["file"] if v["percorso"] == "time.json"
    ]
    # senza manifest pubblicato: versione del giorno
    (cartella / pack.FILE_MANIFEST.name).unlink()
    assert pack.costruisci_manifest(None, cartella)["versioneDati"] == "2026-10-22"


def test_schema_manifest_rifiuta_campi_errati(cartella):
    man = pack.costruisci_manifest("2026-10-19", cartella)
    man["file"][0]["tipo"] = "ignoto"
    man["versioneDati"] = "19/10/2026"
    errori, _ = pack.verifica(man, cartella)
    assert sum(e.startswith("manifest:") for e in errori) == 2


def _manifest_presente(cartella: Path = pack.CARTELLA_DATI) -> bool:
    """Condizione per la verifica dei dati pubblicati: solo la presenza di manifest.json.

    Gli mtime non contano: git non li conserva e in un checkout manifest.json può risultare anteriore ai dati.
    """
    return (cartella / pack.FILE_MANIFEST.name).exists()


def _errori_strutturali(cartella: Path = pack.CARTELLA_DATI) -> tuple[list[str], dict]:
    """Errori di schema, SHA-256 e intestazioni del manifest della cartella (esclusi i limiti di budget)."""
    man = json.loads((cartella / pack.FILE_MANIFEST.name).read_text(encoding="utf-8"))
    errori, rie = pack.verifica(man, cartella)
    return [e for e in errori if "oltre" not in e], rie


def test_verifica_pubblicata_indipendente_dagli_mtime(cartella):
    """Manifest anteriore ai dati, come dopo un clone: la verifica si esegue e rileva un file alterato."""
    f = cartella / pack.FILE_MANIFEST.name
    f.write_text(json.dumps(pack.costruisci_manifest("2026-10-19", cartella)), encoding="utf-8")
    os.utime(f, (0, 0))
    assert _manifest_presente(cartella)
    assert [e for e in _errori_strutturali(cartella)[0] if "catalog" not in e] == []
    (cartella / "time.json").write_text("{]\n", encoding="utf-8")
    assert "time.json: SHA-256 diverso" in "\n".join(_errori_strutturali(cartella)[0])
    f.unlink()
    assert not _manifest_presente(cartella)


@pytest.mark.skipif(not _manifest_presente(), reason="manifest.json assente: eseguire pack.py")
def test_manifest_pubblicato_coerente():
    """Manifest del repository: schema, SHA-256 e intestazioni coerenti (i limiti di budget sono riportati a parte)."""
    strutturali, rie = _errori_strutturali()
    assert strutturali == []
    assert rie["file"] <= pack.MAX_FILE
