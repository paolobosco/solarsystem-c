"""Manifest dei dati (§ 8.11) e controllo del budget (§ 8.1) e del criterio A22.

Scrive public/data/v1/manifest.json con percorso, tipo, blocco, dimensione e SHA-256 di ogni file della cartella,
poi verifica: schema del manifest (docs/schema/manifest.schema.json) e del catalogo, unicità di ssid e slug,
intestazioni dei binari (magic, versione, tipo, blocco, dimensione), SHA-256 ricalcolati, budget:
- vincolanti (§ 8.1 v2.1, § 8.12): al massimo 90 file, 48 MB in totale, 6 MB per file, prima visualizzazione
  (manifest, catalogo, time.json, moon.bin, blocchi della data iniziale) al massimo 4 MB, texture al massimo
  600 kB ciascuna;
- stime della tabella del § 8.1, segnalate come avvisi: al massimo 30 texture e 13 MB, reliability.bin al
  massimo 400 kB, manifest, catalogo e time.json insieme al massimo 300 kB.
MB = 10^6 byte, kB = 10^3 byte (lettura prudente dei limiti). Il comando fallisce (codice 1) se un controllo
vincolante non è superato; il manifest scritto resta disponibile per l'ispezione.

Riproducibilità (§ 8.11): senza --versione, versioneDati è la data del giorno solo se il contenuto del manifest
(file, dimensioni, SHA-256) è cambiato; se coincide con quello pubblicato resta il valore già scritto, e il manifest
resta identico byte per byte. Con --versione il valore è quello indicato.

Uso (da scripts/pipeline/):
  .venv/bin/python pack.py [--versione AAAA-MM-GG] [--blocco-iniziale 12]
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

import catalog
from common import binio
from common import constants as cst
from common.manifest import CARTELLA_PIPELINE, manifest_dati, sha256_file, valore_se_invariato, voce_manifest

RADICE_REPO = CARTELLA_PIPELINE.parent.parent
CARTELLA_DATI = RADICE_REPO / "public" / "data" / "v1"
FILE_MANIFEST = CARTELLA_DATI / "manifest.json"
FILE_SCHEMA = RADICE_REPO / "docs" / "schema" / "manifest.schema.json"

MB = 1_000_000
KB = 1_000
MAX_FILE = 90
MAX_TOTALE = 48 * MB
MAX_PER_FILE = 6 * MB  # § 8.1 v2.1: limite della piattaforma 15 MB per file binario
MAX_PRIMA_VISTA = 4 * MB
MAX_TEXTURE_N = 30
MAX_TEXTURE_FILE = 600 * KB
MAX_TEXTURE_TOT = 13 * MB
MAX_AFFIDABILITA = 400 * KB
MAX_AVVIO_JSON = 300 * KB

# percorso -> (tipo, magic atteso per i binari, tipo binario)
REGOLE: list[tuple[re.Pattern[str], str, bytes | None, int | None]] = [
    (re.compile(r"^planets/p(\d\d)\.bin$"), "pianeti", b"SSSERIE1", binio.TIPO_PIANETI),
    (re.compile(r"^sats/s(\d\d)\.bin$"), "satelliti", b"SSSATS01", binio.TIPO_SATELLITI),
    (re.compile(r"^small/b(\d\d)\.bin$"), "piccoli-corpi", b"SSSERIE1", binio.TIPO_PICCOLI_CORPI),
    (re.compile(r"^moon\.bin$"), "luna", b"SSMOON01", binio.TIPO_LUNA),
    (re.compile(r"^reliability\.bin$"), "affidabilita", b"SSRELI02", binio.TIPO_AFFIDABILITA),
    (re.compile(r"^stars\.bin$"), "stelle", b"SSSTAR01", binio.TIPO_STELLE),
    (re.compile(r"^time\.json$"), "tempo", None, None),
    (re.compile(r"^catalog\.json$"), "catalogo", None, None),
    (re.compile(r"^tex/[a-z0-9-]+\.jpg$"), "texture", None, None),
]


def classifica(percorso: str) -> tuple[str, int | None, bytes | None, int | None]:
    for rx, tipo, magic, tbin in REGOLE:
        m = rx.match(percorso)
        if m:
            blocco = int(m.group(1)) if m.groups() else None
            return tipo, blocco, magic, tbin
    raise ValueError(f"file non previsto nella cartella dei dati: {percorso}")


def file_dati(cartella: Path = CARTELLA_DATI) -> list[Path]:
    return sorted(p for p in cartella.rglob("*") if p.is_file() and p.name != FILE_MANIFEST.name)


def costruisci_manifest(versione: str | None, cartella: Path = CARTELLA_DATI) -> dict:
    """Manifest della cartella. Senza `versione` (§ 8.11): quella del manifest già nella cartella se il resto
    (file, dimensioni, SHA-256) coincide, altrimenti la data del giorno."""
    voci = []
    for p in file_dati(cartella):
        rel = p.relative_to(cartella).as_posix()
        tipo, blocco, _, _ = classifica(rel)
        voci.append(voce_manifest(cartella, p, tipo, blocco))
    man = manifest_dati(versione or _dt.date.today().isoformat(), voci)
    if versione is None:
        conservata = valore_se_invariato(man, "versioneDati", cartella / FILE_MANIFEST.name)
        man["versioneDati"] = conservata or man["versioneDati"]
    return man


def verifica(man: dict, cartella: Path = CARTELLA_DATI, blocco_iniziale: int = cst.K - 1) -> tuple[list[str], dict]:
    """Errori e riepilogo del budget per il manifest indicato."""
    errori: list[str] = []
    avvisi: list[str] = []
    schema = json.loads(FILE_SCHEMA.read_text(encoding="utf-8"))
    for e in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(man):
        errori.append(f"manifest: {'/'.join(str(x) for x in e.absolute_path)}: {e.message}")
    if man["blocchi"] != {"T0": cst.T0, "B": cst.B, "K": cst.K, "T_END": cst.T_END}:
        errori.append("manifest: blocchi diversi dalle costanti del § 8.1")
    percorsi = [v["percorso"] for v in man["file"]]
    if len(set(percorsi)) != len(percorsi):
        errori.append("manifest: percorsi duplicati")
    presenti = {p.relative_to(cartella).as_posix() for p in file_dati(cartella)}
    for mancante in sorted(presenti - set(percorsi)):
        errori.append(f"file non elencato nel manifest: {mancante}")
    per_tipo: dict[str, list[dict]] = {}
    for v in man["file"]:
        p = cartella / v["percorso"]
        per_tipo.setdefault(v["tipo"], []).append(v)
        if not p.exists():
            errori.append(f"{v['percorso']}: file assente")
            continue
        if p.stat().st_size != v["byte"]:
            errori.append(f"{v['percorso']}: dimensione {p.stat().st_size} invece di {v['byte']}")
        if sha256_file(p) != v["sha256"]:
            errori.append(f"{v['percorso']}: SHA-256 diverso")
        tipo, blocco, magic, tbin = classifica(v["percorso"])
        if tipo != v["tipo"] or blocco != v.get("blocco"):
            errori.append(f"{v['percorso']}: tipo o blocco incoerenti con il percorso")
        if magic is not None:
            try:
                i = binio.leggi_intestazione(p.read_bytes())
                if i.magic != magic or i.tipo != tbin:
                    errori.append(f"{v['percorso']}: magic o tipo binario inattesi")
                if i.blocco != (blocco if blocco is not None else -1):
                    errori.append(f"{v['percorso']}: indice di blocco {i.blocco} nell'intestazione")
            except binio.ErroreFormato as e:
                errori.append(f"{v['percorso']}: {e}")
        if v["byte"] > MAX_PER_FILE:
            errori.append(f"{v['percorso']}: {v['byte']} byte oltre il limite di {MAX_PER_FILE} per file")
    # catalogo: schema e controlli A22
    cat_p = cartella / "catalog.json"
    if cat_p.exists():
        cat = json.loads(cat_p.read_text(encoding="utf-8"))
        errori += [f"catalogo: {e}" for e in catalog.valida(cat) + catalog.controlli_a22(cat, cartella)]
    else:
        errori.append("catalog.json assente")
    manifest_byte = len(json.dumps(man, ensure_ascii=False, indent=1).encode("utf-8")) + 1
    totale = sum(v["byte"] for v in man["file"]) + manifest_byte
    n_file = len(man["file"]) + 1
    tex = per_tipo.get("texture", [])
    avvio_json = manifest_byte + sum(v["byte"] for v in man["file"] if v["tipo"] in ("catalogo", "tempo"))
    prima = avvio_json + sum(
        v["byte"]
        for v in man["file"]
        if v["tipo"] == "luna"
        or (v["tipo"] in ("pianeti", "satelliti", "piccoli-corpi") and v.get("blocco") == blocco_iniziale)
    )
    riepilogo = {
        "file": n_file,
        "byteTotali": totale,
        "primaVisualizzazione": prima,
        "avvioJson": avvio_json,
        "texture": {
            "numero": len(tex),
            "byte": sum(v["byte"] for v in tex),
            "massimo": max((v["byte"] for v in tex), default=0),
        },
        "perTipo": {t: sum(v["byte"] for v in vs) for t, vs in sorted(per_tipo.items())},
        "oltreLimiteFile": [v["percorso"] for v in man["file"] if v["byte"] > MAX_PER_FILE],
    }
    if n_file > MAX_FILE:
        errori.append(f"{n_file} file oltre il limite di {MAX_FILE}")
    if totale > MAX_TOTALE:
        errori.append(f"{totale} byte in totale oltre il limite di {MAX_TOTALE}")
    if prima > MAX_PRIMA_VISTA:
        errori.append(f"prima visualizzazione di {prima} byte oltre il limite di {MAX_PRIMA_VISTA}")
    if avvio_json > MAX_AVVIO_JSON:
        avvisi.append(f"manifest, catalogo e time.json: {avvio_json} byte oltre la stima di {MAX_AVVIO_JSON}")
    if len(tex) > MAX_TEXTURE_N:
        avvisi.append(f"{len(tex)} texture oltre la stima di {MAX_TEXTURE_N}")
    for v in tex:
        if v["byte"] > MAX_TEXTURE_FILE:
            errori.append(f"{v['percorso']}: texture di {v['byte']} byte oltre {MAX_TEXTURE_FILE}")
    if riepilogo["texture"]["byte"] > MAX_TEXTURE_TOT:
        avvisi.append(f"texture: {riepilogo['texture']['byte']} byte oltre la stima di {MAX_TEXTURE_TOT}")
    for v in per_tipo.get("affidabilita", []):
        if v["byte"] > MAX_AFFIDABILITA:
            avvisi.append(f"reliability.bin: {v['byte']} byte oltre la stima di {MAX_AFFIDABILITA}")
    riepilogo["avvisi"] = avvisi
    return errori, riepilogo


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--versione",
        help="versioneDati (AAAA-MM-GG); predefinita: quella del manifest pubblicato se il contenuto non cambia, "
        "altrimenti la data del giorno",
    )
    ap.add_argument("--blocco-iniziale", type=int, default=cst.K - 1, help="blocco della data iniziale")
    a = ap.parse_args(argv)
    man = costruisci_manifest(a.versione)
    FILE_MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    errori, riepilogo = verifica(man, blocco_iniziale=a.blocco_iniziale)
    print(json.dumps(riepilogo, ensure_ascii=False, indent=1))
    for e in errori:
        print(f"errore: {e}", file=sys.stderr)
    return 1 if errori else 0


if __name__ == "__main__":
    raise SystemExit(main())
