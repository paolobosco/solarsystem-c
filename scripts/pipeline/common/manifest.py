"""SHA-256 e voci dei manifest: dati pubblicati (§ 8.11) e sorgenti voluminose (§ 12.2)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath

from . import constants as cst

FORMATO = 1
BLOCCO_LETTURA = 1 << 20
CARTELLA_PIPELINE = Path(__file__).resolve().parent.parent
MANIFEST_SORGENTI = CARTELLA_PIPELINE / "raw" / "manifest-sorgenti.json"
CARTELLA_CACHE = CARTELLA_PIPELINE / ".cache"


def sha256_bytes(dati: bytes | bytearray | memoryview) -> str:
    return hashlib.sha256(dati).hexdigest()


def sha256_file(percorso: Path | str) -> str:
    h = hashlib.sha256()
    with open(percorso, "rb") as f:
        while blocco := f.read(BLOCCO_LETTURA):
            h.update(blocco)
    return h.hexdigest()


# --- rigenerazione riproducibile (§ 8.10, § 8.11) ---


def _testo_senza_campo(contenuto: dict, campo: str) -> str:
    return json.dumps({**contenuto, campo: None}, ensure_ascii=False, separators=(",", ":"))


def valore_se_invariato(nuovo: dict, campo: str, pubblicato: Path) -> str | None:
    """Valore di `campo` del file JSON `pubblicato` se tutto il resto coincide con `nuovo`; altrimenti None.

    Il confronto è sul contenuto serializzato (stesso ordine delle chiavi, stessi numeri) con `campo` escluso: con
    dati invariati la rigenerazione riscrive il valore già pubblicato e il file resta identico byte per byte; se
    qualcosa cambia (anche solo l'ordine delle chiavi o un numero), il chiamante usa il valore nuovo. File assente,
    illeggibile o senza il campo come stringa: None."""
    try:
        vecchio = json.loads(pubblicato.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(vecchio, dict) or not isinstance(vecchio.get(campo), str):
        return None
    return vecchio[campo] if _testo_senza_campo(vecchio, campo) == _testo_senza_campo(nuovo, campo) else None


# --- manifest.json dei dati (§ 8.11) ---


def voce_manifest(radice: Path | str, file: Path | str, tipo: str, blocco: int | None = None) -> dict:
    """Voce { percorso, tipo, blocco, byte, sha256 } con percorso relativo a radice (barre '/')."""
    radice = Path(radice)
    p = Path(file)
    if not p.is_absolute():
        p = radice / p
    rel = PurePosixPath(p.resolve().relative_to(radice.resolve()).as_posix())
    voce: dict = {"percorso": str(rel), "tipo": tipo}
    if blocco is not None:
        voce["blocco"] = blocco
    voce["byte"] = p.stat().st_size
    voce["sha256"] = sha256_file(p)
    return voce


def manifest_dati(versione_dati: str, voci: list[dict]) -> dict:
    """Radice di manifest.json; voci ordinate per percorso."""
    return {
        "formato": FORMATO,
        "versioneDati": versione_dati,
        "blocchi": {"T0": cst.T0, "B": cst.B, "K": cst.K, "T_END": cst.T_END},
        "file": sorted(voci, key=lambda v: v["percorso"]),
    }


# --- raw/manifest-sorgenti.json (§ 12.2) ---


def voce_sorgente(
    nome: str, url: str, percorso_cache: str, estrazione: str, descrizione: str = "", calcola: bool = True
) -> dict:
    """Voce di una sorgente in cache: URL, dimensione, SHA-256, data di estrazione (AAAA-MM-GG)."""
    p = CARTELLA_CACHE / percorso_cache
    voce = {"nome": nome, "descrizione": descrizione, "url": url, "percorsoCache": percorso_cache}
    if calcola:
        voce["byte"] = p.stat().st_size
        voce["sha256"] = sha256_file(p)
    voce["estrazione"] = estrazione
    return voce


def leggi_manifest_sorgenti(percorso: Path = MANIFEST_SORGENTI) -> dict:
    if not percorso.exists():
        return {"formato": FORMATO, "sorgenti": []}
    return json.loads(percorso.read_text(encoding="utf-8"))


def aggiorna_manifest_sorgenti(voce: dict, percorso: Path = MANIFEST_SORGENTI) -> dict:
    """Inserisce o sostituisce la voce con lo stesso nome; sorgenti ordinate per nome."""
    m = leggi_manifest_sorgenti(percorso)
    altre = [v for v in m["sorgenti"] if v["nome"] != voce["nome"]]
    m["sorgenti"] = sorted([*altre, voce], key=lambda v: v["nome"])
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return m


def verifica_sorgente(voce: dict, cache: Path = CARTELLA_CACHE, con_sha: bool = True) -> None:
    """Controlla esistenza, dimensione e (facoltativo) SHA-256 del file in cache; ValueError se diverge."""
    p = cache / voce["percorsoCache"]
    if not p.exists():
        raise FileNotFoundError(f"sorgente assente dalla cache: {p}")
    if p.stat().st_size != voce["byte"]:
        raise ValueError(f"dimensione diversa per {voce['nome']}: {p.stat().st_size} invece di {voce['byte']}")
    if con_sha and sha256_file(p) != voce["sha256"]:
        raise ValueError(f"SHA-256 diverso per {voce['nome']}")


def cerca_sorgente(nome: str, percorso: Path = MANIFEST_SORGENTI) -> dict:
    for v in leggi_manifest_sorgenti(percorso)["sorgenti"]:
        if v["nome"] == nome:
            return v
    raise KeyError(f"sorgente non registrata: {nome}")
