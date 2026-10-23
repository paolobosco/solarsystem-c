"""Assemblaggio di public/data/v1/catalog.json (§ 8.10) da bodies.json e dai frammenti out/catalog-*.json.

Regole di fusione:
- anagrafica da bodies.json; i campi vuoti (null o lista vuota) possono essere completati dai frammenti, i campi
  identificativi (ssid, slug, nome, categoria, categorieSecondarie, primario) devono coincidere;
- i frammenti si fondono per slug e campo, ricorsivamente sugli oggetti: due valori diversi per la stessa foglia
  sono un conflitto (errore);
- campi mancanti: fisica con valori null ("non noto"), orientamento ad assi fissi dichiarati (§ 7.6.4), texture
  ed epsModelloCostante null; ogni completamento è registrato con il motivo in out/catalogo-mancanti.json;
- effemeridi e soluzione sono obbligatorie: se mancano il corpo è incompleto, catalog.json non è scritto e il
  catalogo parziale va in out/catalog-parziale.json.

Validazione: docs/schema/catalog.schema.json (draft 2020-12, formati inclusi) e controlli del criterio A22
(unicità di ssid e slug, ssid = indice, riferimenti al primario, precedenza della categoria primaria con le
eccezioni dichiarate, file delle texture presenti) e confronto di nomi e designazioni dei pianetini numerati e dei
nomi delle comete periodiche numerate con il Minor Planet Center (§ 4.3, risposta congelata da small/mpc.py).

Riproducibilità (§ 8.10): senza --generato, il campo generato è l'istante della rigenerazione che ha modificato il
catalogo. Se il resto del catalogo coincide con quello pubblicato si riscrive il suo generato, e il file resta
identico byte per byte.

Uso (da scripts/pipeline/):
  .venv/bin/python catalog.py            # scrive catalog.json se completo, altrimenti il parziale; codice 2
  .venv/bin/python catalog.py --generato AAAA-MM-GGThh:mm:ssZ   # istante fissato
"""

from __future__ import annotations

import argparse
import copy
import datetime as _dt
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from common.manifest import CARTELLA_PIPELINE, valore_se_invariato

RADICE_REPO = CARTELLA_PIPELINE.parent.parent
FILE_CORPI = CARTELLA_PIPELINE / "bodies.json"
CARTELLA_OUT = CARTELLA_PIPELINE / "out"
FILE_SCHEMA = RADICE_REPO / "docs" / "schema" / "catalog.schema.json"
CARTELLA_DATI = RADICE_REPO / "public" / "data" / "v1"
FILE_CATALOGO = CARTELLA_DATI / "catalog.json"
FILE_PARZIALE = CARTELLA_OUT / "catalog-parziale.json"
FILE_MPC = CARTELLA_PIPELINE / "raw" / "small" / "mpc-identificatori.json"
FILE_MANCANTI = CARTELLA_OUT / "catalogo-mancanti.json"

CATEGORIE = ["sole", "pianeta", "pianeta-nano", "luna", "interstellare", "cometa", "centauro", "tno", "asteroide"]
# Eccezioni dichiarate alla precedenza della categoria primaria (§ 4.2): Chiron, centauro con attività cometaria
# (designazione 95P/Chiron), resta primariamente un centauro.
ECCEZIONI_PRIMARIA = {"chiron": "centauro"}
# Doppio stato (§ 4.2): designazione cometaria al posto della provvisoria MPC, che resta tra gli alias.
DESIGNAZIONE_DOPPIO_STATO = {"chiron": "95P/Chiron"}
IDENTITA = ("ssid", "slug", "nome", "categoria", "categorieSecondarie", "primario")
ANAGRAFICA = ("nomeUfficiale", "numero", "designazione", "alias", "naif", "sbdb")
OBBLIGATORI = ("effemeridi", "soluzione")
ORDINE = [
    "ssid",
    "slug",
    "nome",
    "nomeUfficiale",
    "numero",
    "designazione",
    "alias",
    "categoria",
    "categorieSecondarie",
    "naif",
    "spkid",
    "sbdb",
    "primario",
    "effemeridi",
    "soluzione",
    "fisica",
    "orientamento",
    "texture",
    "anelli",
    "epsModelloCostante",
]
FISICA_NULLA = {"raggi_km": None, "gm_km3s2": None, "rotazione": None, "albedo": None}
ORIENTAMENTO_FISSO = {"modello": "fisso", "coefficienti": None, "convenzionePolo": "nord-IAU", "indicativo": True}


class ConflittoCatalogo(ValueError):
    """Due frammenti assegnano valori diversi allo stesso campo dello stesso corpo."""


def _vuoto(v) -> bool:
    return v is None or v == [] or v == ""


def fondi(dest: dict, sorgente: dict, percorso: str, origine: dict[str, str], area: str) -> None:
    """Fusione ricorsiva: oggetti per chiave, foglie (anche liste) uguali o conflitto."""
    for k, v in sorgente.items():
        p = f"{percorso}.{k}"
        if k not in dest:
            dest[k] = copy.deepcopy(v)
            origine[p] = area
        elif isinstance(dest[k], dict) and isinstance(v, dict):
            fondi(dest[k], v, p, origine, area)
        elif dest[k] != v:
            raise ConflittoCatalogo(f"{p}: {origine.get(p, '?')} = {dest[k]!r}, {area} = {v!r}")


def leggi_frammenti(cartella: Path = CARTELLA_OUT) -> list[tuple[str, dict]]:
    out = []
    for f in sorted(cartella.glob("catalog-*.json")):
        if f.name == FILE_PARZIALE.name:
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("formato") != 1 or "corpi" not in d:
            raise ValueError(f"frammento non conforme: {f.name}")
        out.append((d.get("area") or f.stem.removeprefix("catalog-"), d))
    return out


def _alias(c: dict) -> list[str]:
    """Alias di ricerca (§ 4.3): quelli dei frammenti, poi nome, nome ufficiale, numero, designazione, sigla."""
    cand = list(c.get("alias") or [])
    cand += [c.get("nome"), c.get("nomeUfficiale"), c.get("designazione"), c.get("sbdb")]
    if c.get("numero") is not None:
        cand.append(str(c["numero"]))
    out: list[str] = []
    for a in cand:
        if isinstance(a, str) and a.strip() and a.strip() not in out:
            out.append(a.strip())
    return out


def assembla(anagrafica: dict, frammenti: list[tuple[str, dict]]) -> tuple[list[dict], dict, list[str]]:
    """Corpi fusi in ordine di ssid, registro dei completamenti, elenco dei corpi incompleti."""
    corpi = {c["slug"]: copy.deepcopy(c) for c in anagrafica["corpi"]}
    origine: dict[str, str] = {}
    for c in corpi.values():
        c.pop("nota", None)
        for k in c:
            origine[f"{c['slug']}.{k}"] = "bodies.json"
    for area, fr in frammenti:
        for slug, campi in fr["corpi"].items():
            if slug not in corpi:
                raise ValueError(f"frammento {area}: corpo sconosciuto {slug}")
            c = corpi[slug]
            for k, v in campi.items():
                p = f"{slug}.{k}"
                if k in IDENTITA:
                    if c.get(k) != v:
                        raise ConflittoCatalogo(f"{p}: bodies.json = {c.get(k)!r}, {area} = {v!r}")
                elif k in ANAGRAFICA and origine.get(p) == "bodies.json":
                    if _vuoto(c.get(k)):
                        c[k] = copy.deepcopy(v)
                        origine[p] = area
                    elif c[k] != v and not (k == "alias" and _vuoto(v)):
                        raise ConflittoCatalogo(f"{p}: bodies.json = {c[k]!r}, {area} = {v!r}")
                else:
                    fondi(c, {k: v}, slug, origine, area)
    mancanti: dict[str, dict[str, str]] = {}
    incompleti = []
    for slug, c in corpi.items():
        m: dict[str, str] = {}
        for k in OBBLIGATORI:
            if k not in c:
                m[k] = "nessun frammento lo fornisce"
                incompleti.append(slug)
        if "fisica" not in c:
            c["fisica"] = dict(FISICA_NULLA)
            m["fisica"] = "nessun frammento: valori non noti (null)"
        else:
            for k, v in FISICA_NULLA.items():
                if k not in c["fisica"]:
                    c["fisica"][k] = v
                    m[f"fisica.{k}"] = "non fornito: non noto (null)"
        if "orientamento" not in c:
            c["orientamento"] = dict(ORIENTAMENTO_FISSO)
            m["orientamento"] = "nessun modello: assi fissi allineati all'eclittica J2000, dichiarati (§ 7.6.4)"
        if "texture" not in c:
            c["texture"] = None
            m["texture"] = "nessuna texture"
        if "epsModelloCostante" not in c:
            c["epsModelloCostante"] = None
            m["epsModelloCostante"] = "non fornito: serie in reliability.bin o affidabilità non stimabile"
        if "spkid" not in c:
            c["spkid"] = None
            m["spkid"] = "non fornito"
        c["alias"] = _alias(c)
        if m:
            mancanti[slug] = m
    ordinati = sorted(corpi.values(), key=lambda c: c["ssid"])
    ordinati = [{k: c[k] for k in ORDINE if k in c} | {k: v for k, v in c.items() if k not in ORDINE} for c in ordinati]
    return ordinati, mancanti, sorted(set(incompleti), key=lambda s: corpi[s]["ssid"])


def controlli_mpc(cat: dict, file_mpc: Path = FILE_MPC) -> list[str]:
    """§ 4.3: per i pianetini numerati, nome ufficiale uguale al nome MPC (con i diacritici), designazione uguale
    alla provvisoria primaria MPC (salvo DESIGNAZIONE_DOPPIO_STATO) e presente tra gli alias. Per le comete
    periodiche numerate (designazione "NP"), nome ufficiale "NP/nome" dell'MPC, senza il numerale d'uso."""
    mpc = json.loads(file_mpc.read_text(encoding="utf-8"))["risposta"]
    errori = []
    for c in cat["corpi"]:
        if c["categoria"] == "cometa" and re.fullmatch(r"\d+P", c.get("designazione") or ""):
            r = mpc.get(c["designazione"])
            if r is None or not r.get("found"):
                errori.append(f"{c['slug']}: cometa {c['designazione']} assente dalla risposta MPC")
            elif c["nomeUfficiale"] != (atteso := f"{r['permid']}/{r['name']}"):
                errori.append(f"{c['slug']}: nome ufficiale {c['nomeUfficiale']!r}, MPC {atteso!r}")
            continue
        if c.get("numero") is None or c["categoria"] in ("cometa", "interstellare", "luna"):
            continue
        r = mpc.get(str(c["numero"]))
        if r is None or not r.get("found"):
            errori.append(f"{c['slug']}: numero {c['numero']} assente dalla risposta MPC")
            continue
        if c["nomeUfficiale"] != r["name"]:
            errori.append(f"{c['slug']}: nome ufficiale {c['nomeUfficiale']!r}, MPC {r['name']!r}")
        prov = r["unpacked_primary_provisional_designation"]
        attesa = DESIGNAZIONE_DOPPIO_STATO.get(c["slug"], prov)
        if c.get("designazione") != attesa:
            errori.append(f"{c['slug']}: designazione {c.get('designazione')!r}, attesa {attesa!r} (MPC {prov!r})")
        if prov not in c["alias"]:
            errori.append(f"{c['slug']}: designazione provvisoria MPC {prov!r} assente dagli alias")
    return errori


def categorie() -> list[dict]:
    return [{"id": c, "precedenza": i, "filtrabile": c != "sole"} for i, c in enumerate(CATEGORIE)]


def controlli_a22(cat: dict, cartella_dati: Path = CARTELLA_DATI) -> list[str]:
    """Controlli oltre lo schema: unicità e contiguità degli ssid, slug unici, primari, precedenza della categoria
    primaria (§ 4.2, con ECCEZIONI_PRIMARIA), file delle texture."""
    errori = []
    corpi = cat["corpi"]
    slug = [c["slug"] for c in corpi]
    if len(set(slug)) != len(slug):
        errori.append("slug duplicati")
    for i, c in enumerate(corpi):
        if c["ssid"] != i:
            errori.append(f"ssid non contiguo: {c['slug']} ha {c['ssid']}, atteso {i}")
        if c["primario"] is not None and c["primario"] not in slug:
            errori.append(f"{c['slug']}: primario sconosciuto {c['primario']}")
        if (c["primario"] is None) != (c["categoria"] == "sole"):
            errori.append(f"{c['slug']}: primario incoerente con la categoria")
        if c["categoria"] in c["categorieSecondarie"]:
            errori.append(f"{c['slug']}: categoria primaria ripetuta tra le secondarie")
        tutte = [c["categoria"], *c["categorieSecondarie"]]
        attesa = ECCEZIONI_PRIMARIA.get(c["slug"]) or min(
            tutte, key=lambda x: CATEGORIE.index(x) if x in CATEGORIE else 99
        )
        if c["categoria"] != attesa:
            errori.append(f"{c['slug']}: categoria primaria {c['categoria']} invece di {attesa} (precedenza del § 4.2)")
        t = c.get("texture")
        if t is not None and not (cartella_dati / t["file"]).exists():
            errori.append(f"{c['slug']}: texture assente {t['file']}")
    return errori


def valida(cat: dict, schema_path: Path = FILE_SCHEMA) -> list[str]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    v = Draft202012Validator(schema, format_checker=FormatChecker())
    return [f"{'/'.join(str(x) for x in e.absolute_path)}: {e.message}" for e in v.iter_errors(cat)]


def costruisci(generato: str | None = None) -> tuple[dict, dict, list[str], list[str]]:
    anag = json.loads(FILE_CORPI.read_text(encoding="utf-8"))
    corpi, mancanti, incompleti = assembla(anag, leggi_frammenti())
    gen = generato or _dt.datetime.now(_dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    cat = {"formato": 1, "generato": gen, "corpi": corpi, "categorie": categorie()}
    if not generato:
        cat["generato"] = valore_se_invariato(cat, "generato", FILE_CATALOGO) or gen
    errori = [] if incompleti else valida(cat) + controlli_a22(cat) + controlli_mpc(cat)
    return cat, mancanti, incompleti, errori


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--generato",
        help="istante ISO 8601 del campo generato; predefinito: quello del catalogo pubblicato se il resto non cambia, "
        "altrimenti l'ora attuale",
    )
    a = ap.parse_args(argv)
    cat, mancanti, incompleti, errori = costruisci(a.generato)
    FILE_MANCANTI.write_text(
        json.dumps({"incompleti": incompleti, "completamenti": mancanti}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    testo = json.dumps(cat, ensure_ascii=False, separators=(",", ":")) + "\n"
    if incompleti:
        FILE_PARZIALE.write_text(testo, encoding="utf-8")
        print(f"catalogo incompleto ({len(incompleti)} corpi senza effemeridi o soluzione): {', '.join(incompleti)}")
        print(f"scritto {FILE_PARZIALE.relative_to(RADICE_REPO)}; catalog.json non aggiornato")
        return 2
    if errori:
        for e in errori:
            print(f"errore: {e}", file=sys.stderr)
        return 1
    FILE_CATALOGO.write_text(testo, encoding="utf-8")
    if FILE_PARZIALE.exists():
        FILE_PARZIALE.unlink()
    byte = len(testo.encode("utf-8"))
    print(f"scritto {FILE_CATALOGO.relative_to(RADICE_REPO)}: {len(cat['corpi'])} corpi, {byte} byte")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
