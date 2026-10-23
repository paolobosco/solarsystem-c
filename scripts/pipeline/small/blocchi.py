"""File public/data/v1/small/b00..b12.bin (§ 8.3, § 8.6), frammento reliability-small.json (§ 8.7) e
verifica del budget (§ 8.1: totale ≤ 12 MB, ogni file ≤ 4 MB).

Scelta del livello di tolleranza (costruzione.LIVELLI): il primo dei CANDIDATI che rispetta il budget;
se nessuno lo rispetta, LIVELLO_RIPIEGO (il più compatto tra i candidati). La finestra 1600-2121 ha
sempre la tolleranza del § 7.6.3 (A7). Misure e scelta in docs/_parti/piccoli-corpi.md; riepilogo in
out/blocchi-piccoli-corpi.json.
"""

from __future__ import annotations

import json
import math
import pickle

from common import affidabilita as ca
from common import binio
from common import constants as cst

from .anagrafica import CARTELLA_DATI, CARTELLA_OUT, FILE_BLOCCHI, piccoli_corpi
from .elabora import _salva_json, cartella

BUDGET_TOTALE = 12_000_000  # byte (MB decimali, come nel resto del progetto)
BUDGET_FILE = 4_000_000
LOG10_PI = round(math.log10(math.pi), 4)
CANDIDATI = (0, 1, 2, 3, 4)  # 0: § 7.6.3; 1: ripiego del § 15; 2-4: tolleranze più larghe prima del 1600
LIVELLO_RIPIEGO = 4  # budget non raggiungibile con i candidati: il più compatto


def livello_scelto() -> int:
    """Livello di tolleranza dei blocchi scritti (0 se non ancora scritti)."""
    p = FILE_BLOCCHI
    return int(json.loads(p.read_text(encoding="utf-8")).get("livello", 0)) if p.exists() else 0


def suffisso_scelto() -> str:
    lv = livello_scelto()
    return "" if lv == 0 else f"-L{lv}"


def nome_blocco(k: int) -> str:
    return f"b{k:02d}.bin"


def _carica(slug: str, livello: int) -> tuple[dict, dict] | None:
    suff = "" if livello == 0 else f"-L{livello}"
    p = cartella(slug) / f"segmenti{suff}.pkl"
    r = cartella(slug) / f"affidabilita{suff}.json"
    if not p.exists() or not r.exists():
        return None
    with open(p, "rb") as f:
        seg = pickle.load(f)
    return seg, json.loads(r.read_text(encoding="utf-8"))


def assembla(livello: int) -> tuple[dict[int, bytes], dict]:
    corpi = piccoli_corpi()
    per_blocco: dict[int, dict[int, list]] = {k: {} for k in range(cst.K)}
    rel: dict = {}
    for c in corpi:
        d = _carica(c.slug, livello)
        if d is None:
            raise FileNotFoundError(f"segmenti di livello {livello} assenti per {c.slug}: passo 'segmenti'")
        seg, r = d
        for k in range(cst.K):
            per_blocco[k][c.ssid] = list(seg.get(k, []))
        # ε è un angolo: oltre l'arresto dei cloni (e con il pavimento del livello) si limita a 180°
        r = dict(r)
        r["log10eps"] = [None if x is None else min(x, LOG10_PI) for x in r["log10eps"]]
        rel[c.slug] = r
    file = {
        k: binio.scrivi_serie(binio.TIPO_PICCOLI_CORPI, k, cst.inizio_blocco(k), cst.fine_blocco(k), per_blocco[k])
        for k in range(cst.K)
    }
    return file, rel


def rispetta_budget(file: dict[int, bytes]) -> bool:
    return sum(len(v) for v in file.values()) <= BUDGET_TOTALE and all(len(v) <= BUDGET_FILE for v in file.values())


def scrivi_blocchi(livello: int | None = None) -> dict:
    """Scrive i blocchi (§ 8.1, § 15): il primo candidato che rispetta il budget, altrimenti
    LIVELLO_RIPIEGO anche se il budget resta superato; con `livello` esplicito, quel livello. Le
    dimensioni di tutti i livelli disponibili (anche quelli di sola misura) sono registrate."""
    from .costruzione import LIVELLI

    misure: dict = {}
    file_livello: dict[int, tuple[dict, dict]] = {}
    for lv in sorted(LIVELLI):
        try:
            file, rel = assembla(lv)
        except FileNotFoundError as e:
            misure[lv] = str(e)
            continue
        file_livello[lv] = (file, rel)
        misure[lv] = {
            "tolleranza": list(LIVELLI[lv]),
            "totale": sum(len(v) for v in file.values()),
            "max_file": max(len(v) for v in file.values()),
            "per_file": [len(file[k]) for k in sorted(file)],
            "rispetta_budget": rispetta_budget(file),
        }
    esplicito = livello is not None
    if livello is None:
        entro = [lv for lv in CANDIDATI if lv in file_livello and rispetta_budget(file_livello[lv][0])]
        livello = entro[0] if entro else LIVELLO_RIPIEGO
    if livello not in file_livello:
        raise FileNotFoundError(f"segmenti di livello {livello} assenti: passo 'segmenti --livello {livello}'")
    file, rel = file_livello[livello]
    CARTELLA_DATI.mkdir(parents=True, exist_ok=True)
    for k, dati in file.items():
        binio.leggi_serie(dati)  # verifica di lettura
        (CARTELLA_DATI / nome_blocco(k)).write_bytes(dati)
    frammento = {"formato": 2, **ca.griglia(), "corpi": rel}
    CARTELLA_OUT.mkdir(parents=True, exist_ok=True)
    (CARTELLA_OUT / "reliability-small.json").write_text(
        json.dumps(frammento, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    riepilogo = {
        "livello": livello,
        "esplicito": esplicito,
        "rispetta_budget": rispetta_budget(file),
        "misure": misure,
        "byte": {nome_blocco(k): len(v) for k, v in file.items()},
        "totale": sum(len(v) for v in file.values()),
        "budget_totale": BUDGET_TOTALE,
        "budget_file": BUDGET_FILE,
    }
    _salva_json(FILE_BLOCCHI, riepilogo)
    print(json.dumps(riepilogo))
    return riepilogo
