"""File public/data/v1/reliability.bin (§ 8.7) dai frammenti out/reliability-*.json.

Dopo l'intestazione comune (magic SSRELI02, tipo 5, blocco -1, voci = numero di corpi, offset delle voci = 64):
f64 t_nodo0 (= T0); f64 passo dei nodi grossi (= 7305 d); u32 nodi (712); u32 numero di corpi; f64 t_fine (primo
nodo della parte fine, JD 2 444 494,5, 12/9/1980); f64 passo fine (= 456,5625 d). Nodo k: t_nodo0 + passo·k fino a
t_fine, poi t_fine + passo_fine·(k - k_fine), con k_fine = (t_fine - t_nodo0)/passo (599); intervallo k: [nodo k,
nodo k+1), l'ultimo lungo un passo fine e contenente la fine del nucleo (common.affidabilita). Per corpo, in ordine
di ssid: u16 ssid; u16 riservato; Float32[nodi] log10(ε_modello in rad), massimo nell'intervallo, arrotondato per
eccesso, NaN se non stimabile; u8[nodi] bit 0 = forma dell'orbita determinata, bit 1 = dati presenti; riempimento a
multiplo di 8 byte. Valutazione a gradini (valore dell'intervallo che contiene t).

I pianeti e Plutone (modello 'pianeta') hanno ε_modello costante di 2″ (§ 7.8.1, I11): la serie costante è
scritta dal valore epsModelloCostante del frammento dei pianeti, così che il file copra tutti i corpi con
effemeridi a serie. Il Sole (ε = 0) resta fuori dal file e usa epsModelloCostante del catalogo.

Uso (da scripts/pipeline/):
  .venv/bin/python reliability_pack.py           # reliability.bin e tests/fixtures/catalogo/affidabilita.json
  .venv/bin/python reliability_pack.py fixture   # solo la fixture (seme 20261024)
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from common import affidabilita as ca
from common import binio
from common import constants as cst
from common.manifest import CARTELLA_PIPELINE, sha256_bytes

RADICE_REPO = CARTELLA_PIPELINE.parent.parent
CARTELLA_OUT = CARTELLA_PIPELINE / "out"
FILE_CORPI = CARTELLA_PIPELINE / "bodies.json"
FILE_AFFIDABILITA = RADICE_REPO / "public" / "data" / "v1" / "reliability.bin"
CARTELLA_FIXTURE = RADICE_REPO / "tests" / "fixtures" / "catalogo"
SEME_FIXTURE = 20261024

MAGIC = b"SSRELI02"
NODI = ca.NODI
EPS_PIANETI_RAD = 2.0 * math.pi / 648000.0
BIT_FORMA = 1
BIT_DATI = 2
_FMT_TESTA = struct.Struct("<ddIIdd")


def leggi_frammenti(cartella: Path = CARTELLA_OUT) -> dict[str, dict]:
    """slug -> {log10eps, formaDeterminata, datiPresenti}; griglia verificata, slug duplicati rifiutati."""
    out: dict[str, dict] = {}
    for f in sorted(cartella.glob("reliability-*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("formato") != 2 or any(d.get(k) != v for k, v in ca.griglia().items()):
            raise ValueError(f"{f.name}: griglia diversa da quella di common.affidabilita")
        for slug, v in d["corpi"].items():
            if slug in out:
                raise ValueError(f"{slug} presente in più frammenti di affidabilità")
            for k in ("log10eps", "formaDeterminata", "datiPresenti"):
                if len(v[k]) != NODI:
                    raise ValueError(f"{f.name}: {slug}.{k} ha {len(v[k])} valori")
            out[slug] = v
    return out


def serie_pianeti(cartella: Path = CARTELLA_OUT) -> dict[str, dict]:
    """Serie costanti per i corpi con modello 'pianeta' (ε dal frammento dei pianeti, 2″ se assente)."""
    f = cartella / "catalog-planets.json"
    corpi = json.loads(f.read_text(encoding="utf-8"))["corpi"] if f.exists() else {}
    out = {}
    for slug, v in corpi.items():
        if v.get("effemeridi", {}).get("modello") != "pianeta":
            continue
        eps = v.get("epsModelloCostante") or EPS_PIANETI_RAD
        out[slug] = {
            "log10eps": [math.log10(eps)] * NODI,
            "formaDeterminata": [True] * NODI,
            "datiPresenti": [True] * NODI,
        }
    return out


def float32_per_eccesso(x: NDArray[np.float64]) -> NDArray[np.float32]:
    """Float32 non inferiore al valore (arrotondamento verso +∞): ε non è mai sottostimato dal cast.
    Senza questo passo i nodi della Luna attorno a J2000 (60,0000001″) scenderebbero a 59,99999″, sotto 1′."""
    f = x.astype("<f4")
    basso = f.astype(np.float64) < x
    f[basso] = np.nextafter(f[basso], np.float32(np.inf))
    return f


def scrivi(serie: dict[int, dict]) -> bytes:
    """Serie per ssid -> contenuto di reliability.bin."""
    blocco = binio.allinea8(4 + 4 * NODI + NODI)
    n = len(serie)
    dim = binio.DIM_INTESTAZIONE + _FMT_TESTA.size + n * blocco
    intest = binio.Intestazione(MAGIC, binio.TIPO_AFFIDABILITA, -1, n, cst.T0, cst.T_END, binio.DIM_INTESTAZIONE, dim)
    parti = [
        binio.scrivi_intestazione(intest),
        _FMT_TESTA.pack(cst.T0, ca.PASSO, NODI, n, ca.T_FINE, ca.PASSO_FINE),
    ]
    for ssid in sorted(serie):
        v = serie[ssid]
        logeps = float32_per_eccesso(np.array([np.nan if x is None else x for x in v["log10eps"]], dtype=np.float64))
        coppie = zip(v["formaDeterminata"], v["datiPresenti"], strict=True)
        flag = np.array([(BIT_FORMA if f else 0) | (BIT_DATI if p else 0) for f, p in coppie], dtype=np.uint8)
        b = struct.pack("<HH", ssid, 0) + logeps.tobytes() + flag.tobytes()
        parti.append(b + bytes(blocco - len(b)))
    dati = b"".join(parti)
    assert len(dati) == dim
    return dati


def leggi(dati: bytes) -> tuple[dict, dict[int, tuple[NDArray[np.float32], NDArray[np.uint8]]]]:
    """Lettura di riferimento con le stesse verifiche del lettore runtime."""
    i = binio.leggi_intestazione(dati)
    if i.magic != MAGIC or i.tipo != binio.TIPO_AFFIDABILITA or i.blocco != -1 or i.offset_voci != 64:
        raise binio.ErroreFormato("file di affidabilità non conforme")
    t0, passo, nodi, n, t_fine, passo_fine = _FMT_TESTA.unpack_from(dati, 64)
    blocco = binio.allinea8(4 + 4 * nodi + nodi)
    if n != i.n_voci or i.dimensione != 64 + _FMT_TESTA.size + n * blocco:
        raise binio.ErroreFormato("dimensione del file di affidabilità non conforme")
    k_fine = (t_fine - t0) / passo if passo > 0 else math.nan
    if not (passo > 0 and passo_fine > 0 and k_fine == math.floor(k_fine) and 0 <= k_fine < nodi):
        raise binio.ErroreFormato("griglia dei nodi non conforme")
    if not (t0 <= i.inizio and t_fine + passo_fine * (nodi - k_fine) >= i.fine):
        raise binio.ErroreFormato("i nodi non coprono il nucleo")
    corpi = {}
    off = 64 + _FMT_TESTA.size
    for _ in range(n):
        ssid, ris = struct.unpack_from("<HH", dati, off)
        if ris != 0 or ssid in corpi:
            raise binio.ErroreFormato("voce di affidabilità non conforme")
        e = np.frombuffer(dati, dtype="<f4", count=nodi, offset=off + 4)
        f = np.frombuffer(dati, dtype=np.uint8, count=nodi, offset=off + 4 + 4 * nodi)
        corpi[ssid] = (e, f)
        off += blocco
    return {"t0": t0, "passo": passo, "nodi": nodi, "tFine": t_fine, "passoFine": passo_fine}, corpi


def costruisci() -> tuple[bytes, dict]:
    ssid = {c["slug"]: c["ssid"] for c in json.loads(FILE_CORPI.read_text(encoding="utf-8"))["corpi"]}
    fr = leggi_frammenti()
    pianeti = serie_pianeti()
    for slug in pianeti:
        if slug in fr:
            raise ValueError(f"{slug}: serie dei pianeti già presente in un frammento")
    tutte = {**fr, **pianeti}
    serie = {}
    for slug, v in tutte.items():
        if slug not in ssid:
            raise ValueError(f"corpo sconosciuto nei frammenti di affidabilità: {slug}")
        serie[ssid[slug]] = v
    dati = scrivi(serie)
    info = {"corpi": len(serie), "byte": len(dati), "senza": sorted(set(ssid) - set(tutte), key=lambda s: ssid[s])}
    return dati, info


def scrivi_fixture(cartella: Path = CARTELLA_FIXTURE) -> Path:
    """Valori attesi (valutazione a gradini) per istanti casuali, dal file pubblicato; metà degli istanti nella
    parte fine della griglia."""
    dati = FILE_AFFIDABILITA.read_bytes()
    testa, corpi = leggi(dati)
    if any(testa[k] != v for k, v in ca.griglia().items()):
        raise ValueError("griglia del file diversa da common.affidabilita")
    rng = np.random.default_rng(SEME_FIXTURE)
    casi = []
    ssid = sorted(corpi)
    for i in range(300):
        s = int(rng.choice(ssid))
        t = float(rng.uniform(cst.T0 if i % 2 == 0 else ca.T_FINE, cst.T_END))
        j = int(ca.intervallo(t)[0])
        e, f = corpi[s]
        x = float(ca.valuta(e.astype(np.float64), t)[0])
        casi.append({"ssid": s, "t": t, "log10eps": None if math.isnan(x) else x, "flag": int(f[j]), "nodo": j})
    out = {"formato": 1, "seme": SEME_FIXTURE, "sha256": sha256_bytes(dati), "casi": casi}
    cartella.mkdir(parents=True, exist_ok=True)
    p = cartella / "affidabilita.json"
    p.write_text(json.dumps(out) + "\n", encoding="utf-8")
    return p


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("comando", nargs="?", default="genera", choices=["genera", "fixture"])
    a = ap.parse_args(argv)
    if a.comando == "fixture":
        print(f"scritto {scrivi_fixture()}")
        return 0
    dati, info = costruisci()
    FILE_AFFIDABILITA.parent.mkdir(parents=True, exist_ok=True)
    FILE_AFFIDABILITA.write_bytes(dati)
    scrivi_fixture()  # la fixture dei test segue sempre il file pubblicato
    print(json.dumps(info, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
