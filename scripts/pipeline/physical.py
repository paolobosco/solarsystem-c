"""Dati fisici e orientamento di Sole, pianeti, Plutone e Luna; anelli di Saturno e Urano (§ 7.7, § 8.10, § 9).

Frammento scripts/pipeline/out/catalog-phys.json con, per corpo: `fisica` (raggi, GM, periodo di rotazione,
albedo, inclinazione assiale derivata), `orientamento` (modello WGCCRE con termini periodici,
`convenzionePolo`) e, per Saturno e Urano, `anelli`.

Fonti (congelate in raw/phys/, elenco in raw/phys/estrazione.json):
- NAIF pck00011.tpc: trascrizione di Archinal et al. 2018 (WGCCRE 2015, Celest. Mech. Dyn. Astr. 130:22)
  con la correzione del 2019 (Celest. Mech. Dyn. Astr. 131:61, figure 1-2 e meridiano di Phobos, nessun
  effetto su Sole e pianeti); raggi del Sole da IAU 2015 Risoluzione B3 (Prša et al. 2016, AJ 152:41).
- JPL "Planetary Physical Parameters" (https://ssd.jpl.nasa.gov/planets/phys_par.html): incertezze dei raggi
  equatoriali (riferimento [D] = Archinal et al. 2018).
- Albedo geometrica in banda V (ALBEDO_V): pianeti da Mallama, Krobusek, Pavlov 2017, tab. 7; Plutone da
  Buratti et al. 2015, tab. 2. I valori della tabella JPL (rif. [B], Explanatory Supplement 1992) sono superati.
- GM: DE441 (Park et al. 2021, AJ 161:105) per Sole, Mercurio, Venere, Terra e Luna; per i pianeti con
  satelliti il GM del solo pianeta dai kernel satellitari JPL (aree commenti in raw/sats/commenti/),
  lo stesso usato per μ = GM_pianeta + GM_satellite (§ 7.1); incertezza dalla tabella "Planet and Pluto GM Values"
  di JPL "Planetary Satellite Physical Parameters" (raw/sats/) con la regola dei satelliti (sats.fisica.sigma_gm).
- Anelli: PDS Ring-Moon Systems Node, tabelle di Saturno e Urano.

Campi riservati ad altre aree (effemeridi, soluzione; fisica e orientamento dei piccoli corpi e dei
satelliti; orientamento della Terra) non sono scritti.

Uso (da scripts/pipeline/):
  .venv/bin/python physical.py scarica      # congela le fonti in raw/phys/ (rete)
  .venv/bin/python physical.py catalogo     # out/catalog-phys.json (offline, richiede DE441 in cache)
  .venv/bin/python physical.py fixture      # tests/fixtures/catalogo/orientamento.json (seme 20261022)
"""

from __future__ import annotations

import argparse
import datetime as _dt
import html
import json
import math
import re
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from common import constants as cst
from common.frames import MATRICE_ICRF_A_ECLITTICA
from common.manifest import CARTELLA_PIPELINE, sha256_bytes

RAW = CARTELLA_PIPELINE / "raw" / "phys"
CARTELLA_OUT = CARTELLA_PIPELINE / "out"
FILE_FRAMMENTO = CARTELLA_OUT / "catalog-phys.json"
FILE_ESTRAZIONE = RAW / "estrazione.json"
COMMENTI_SATS = CARTELLA_PIPELINE / "raw" / "sats" / "commenti"

# Sorgenti piccole congelate: nome del file in raw/phys/ -> URL.
SORGENTI: dict[str, str] = {
    "pck00011.tpc": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc",
    "jpl-phys_par.html": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
    "pds-saturn_tables.html": "https://pds-rings.seti.org/saturn/saturn_tables.html",
    "pds-uranus_tables.html": "https://pds-rings.seti.org/uranus/uranus_tables.html",
}

FONTE_WGCCRE = "Archinal et al. 2018 (WGCCRE 2015) con correzione 2019, da NAIF pck00011.tpc"
FONTE_DE441 = "DE441 (Park et al. 2021, AJ 161:105), costanti dell'area commenti"

# --- Rete (§ 12.2): richieste sequenziali, pausa di 1 s, ripetizione su errore ---

PAUSA_S = 1.0
TENTATIVI = 6
TIMEOUT_S = 600
_ultima = 0.0


class ErroreRete(RuntimeError):
    """Richiesta non riuscita dopo tutti i tentativi."""


def scarica(url: str, tentativi: int = TENTATIVI, timeout: float = TIMEOUT_S) -> bytes:
    """GET con pausa minima di 1 s tra richieste e attesa crescente sugli errori."""
    global _ultima
    errore: Exception | None = None
    for k in range(tentativi):
        attesa = PAUSA_S - (time.monotonic() - _ultima)
        if attesa > 0:
            time.sleep(attesa)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sistema-solare-3d/1 (pipeline dati)"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                dati = r.read()
            _ultima = time.monotonic()
            return dati
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            _ultima = time.monotonic()
            errore = e
            codice = getattr(e, "code", None)
            if codice is not None and 400 <= codice < 500 and codice not in (408, 429):
                break
            time.sleep(min(60.0, 2.0 * 2**k))
    raise ErroreRete(f"richiesta non riuscita: {url}: {errore}")


def scarica_su_file(url: str, percorso: Path, timeout: float = TIMEOUT_S) -> None:
    """Scarica un file voluminoso a blocchi in percorso (scrittura atomica)."""
    global _ultima
    attesa = PAUSA_S - (time.monotonic() - _ultima)
    if attesa > 0:
        time.sleep(attesa)
    percorso.parent.mkdir(parents=True, exist_ok=True)
    tmp = percorso.with_suffix(percorso.suffix + ".parziale")
    errore: Exception | None = None
    for k in range(TENTATIVI):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sistema-solare-3d/1 (pipeline dati)"})
            with urllib.request.urlopen(req, timeout=timeout) as r, open(tmp, "wb") as f:
                while blocco := r.read(1 << 20):
                    f.write(blocco)
            tmp.replace(percorso)
            _ultima = time.monotonic()
            return
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            _ultima = time.monotonic()
            errore = e
            time.sleep(min(60.0, 2.0 * 2**k))
    raise ErroreRete(f"download non riuscito: {url}: {errore}")


def registra_estrazione(file_estrazione: Path, nome: str, url: str, dati: bytes) -> None:
    """Annota URL, data, dimensione e SHA-256 di una risposta congelata."""
    reg = json.loads(file_estrazione.read_text(encoding="utf-8")) if file_estrazione.exists() else {"formato": 1}
    reg.setdefault("file", {})[nome] = {
        "url": url,
        "estrazione": _dt.date.today().isoformat(),
        "byte": len(dati),
        "sha256": sha256_bytes(dati),
    }
    reg["file"] = dict(sorted(reg["file"].items()))
    file_estrazione.parent.mkdir(parents=True, exist_ok=True)
    file_estrazione.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def congela(nome: str, url: str, cartella: Path = RAW, offline: bool = False) -> bytes:
    """Restituisce la risposta congelata; se assente la scarica (salvo offline) e la registra."""
    p = cartella / nome
    if p.exists():
        return p.read_bytes()
    if offline:
        raise FileNotFoundError(f"risposta non congelata: {p}")
    dati = scarica(url)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(dati)
    registra_estrazione(cartella / "estrazione.json", nome, url, dati)
    return dati


def data_estrazione(nome: str, cartella: Path = RAW) -> str | None:
    f = cartella / "estrazione.json"
    if not f.exists():
        return None
    return json.loads(f.read_text(encoding="utf-8")).get("file", {}).get(nome, {}).get("estrazione")


# --- Kernel testuale SPICE (PCK) ---

_RE_NUMERO = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][-+]?\d+)?")


def leggi_pck(testo: str) -> dict[str, list[float]]:
    """Assegnazioni numeriche delle sezioni \\begindata di un kernel testuale (nomi in maiuscolo)."""
    dati: list[str] = []
    attivo = False
    for riga in testo.splitlines():
        s = riga.strip()
        if s.startswith("\\begindata"):
            attivo = True
            continue
        if s.startswith("\\begintext"):
            attivo = False
            continue
        if attivo:
            dati.append(riga)
    corpo = "\n".join(dati)
    out: dict[str, list[float]] = {}
    for m in re.finditer(r"([A-Za-z0-9_]+)\s*(\+?=)\s*(\([^)]*\)|[^\s(]+)", corpo):
        nome, op, val = m.group(1).upper(), m.group(2), m.group(3)
        if "'" in val:
            continue
        numeri = [float(x.replace("D", "E").replace("d", "e")) for x in _RE_NUMERO.findall(val)]
        if op == "+=":
            out.setdefault(nome, []).extend(numeri)
        else:
            out[nome] = numeri
    return out


def _taglia(x: list[float]) -> list[float]:
    """Polinomio senza coefficienti finali nulli (almeno un termine)."""
    y = [float(v) for v in x]
    while len(y) > 1 and y[-1] == 0.0:
        y.pop()
    return y


def coefficienti_wgccre(pck: dict[str, list[float]], naif: int) -> dict:
    """Modello WGCCRE (§ 8.10): α0, δ0 in T (secoli), W in d (giorni) e termini periodici in gradi.

    I termini periodici di PCK usano gli angoli BODYs_NUT_PREC_ANGLES del sistema s (polinomi in T): seno
    per α0 e W, coseno per δ0. Gli angoli con termine quadratico non nullo non sono rappresentabili.
    """
    ra = pck[f"BODY{naif}_POLE_RA"]
    de = pck[f"BODY{naif}_POLE_DEC"]
    pm = pck[f"BODY{naif}_PM"]
    sistema = naif // 100 if naif >= 100 else naif
    if naif == 10:
        sistema = 10
    grado = int(pck.get(f"BODY{sistema}_MAX_PHASE_DEGREE", [1])[0])
    passo = grado + 1
    angoli_piatti = pck.get(f"BODY{sistema}_NUT_PREC_ANGLES", [])
    angoli = [angoli_piatti[i : i + passo] for i in range(0, len(angoli_piatti), passo)]
    periodici: list[dict] = []
    for chiave, coord, funz in (
        ("NUT_PREC_RA", "alfa0", "sin"),
        ("NUT_PREC_DEC", "delta0", "cos"),
        ("NUT_PREC_PM", "w", "sin"),
    ):
        amp = pck.get(f"BODY{naif}_{chiave}", [])
        for j, a in enumerate(amp):
            if a == 0.0:
                continue
            ang = angoli[j]
            if len(ang) > 2 and any(v != 0.0 for v in ang[2:]):
                raise ValueError(f"angolo {j + 1} del sistema {sistema} con termine quadratico: non rappresentabile")
            periodici.append(
                {
                    "coordinata": coord,
                    "funzione": funz,
                    "ampiezza": float(a),
                    "argomento": [float(ang[0]), float(ang[1])],
                    "unita": "secolo",
                }
            )
    return {"alfa0": _taglia(ra), "delta0": _taglia(de), "w": _taglia(pm), "periodici": periodici}


# --- Valutazione del modello WGCCRE (riferimento per i test e per le grandezze derivate) ---

GIORNI_SECOLO = 36525.0


def angoli_wgccre(coeff: dict, jd_tdb: float) -> tuple[float, float, float]:
    """(α0, δ0, W) in gradi all'istante TDB (Archinal et al. 2018, eq. del § 2: d giorni e T secoli da J2000)."""
    d = jd_tdb - cst.J2000
    t = d / GIORNI_SECOLO
    a = sum(c * t**k for k, c in enumerate(coeff["alfa0"]))
    de = sum(c * t**k for k, c in enumerate(coeff["delta0"]))
    w = sum(c * d**k for k, c in enumerate(coeff["w"]))
    for p in coeff["periodici"]:
        x = t if p["unita"] == "secolo" else d
        arg = math.radians(p["argomento"][0] + p["argomento"][1] * x)
        v = p["ampiezza"] * (math.sin(arg) if p["funzione"] == "sin" else math.cos(arg))
        if p["coordinata"] == "alfa0":
            a += v
        elif p["coordinata"] == "delta0":
            de += v
        else:
            w += v
    return a, de, w


def matrice_corpo_icrf(alfa0: float, delta0: float, w: float) -> NDArray[np.float64]:
    """Matrice per righe corpo -> ICRF: colonne = assi x (meridiano 0), y, z (polo) nel sistema ICRF.

    ICRF -> corpo = R3(W)·R1(90° - δ0)·R3(90° + α0) (Archinal et al. 2018, fig. 1); si restituisce la trasposta.
    """

    def r1(x: float) -> NDArray[np.float64]:
        c, s = math.cos(x), math.sin(x)
        return np.array([[1.0, 0.0, 0.0], [0.0, c, s], [0.0, -s, c]])

    def r3(x: float) -> NDArray[np.float64]:
        c, s = math.cos(x), math.sin(x)
        return np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]])

    m = r3(math.radians(w)) @ r1(math.radians(90.0 - delta0)) @ r3(math.radians(90.0 + alfa0))
    return m.T.copy()


def polo_icrf(alfa0: float, delta0: float) -> NDArray[np.float64]:
    a, d = math.radians(alfa0), math.radians(delta0)
    return np.array([math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)])


# --- GM dei pianeti dai kernel satellitari ---

KERNEL_GM_PIANETA: dict[int, str] = {
    499: "mar099.bsp",
    599: "jup365.bsp",
    699: "sat441.bsp",
    799: "ura184_part-3.bsp",
    899: "nep097.bsp",
    999: "plu060.bsp",
}
_RE_CORPO_KERNEL = re.compile(r"^\s+([A-Z][A-Za-z_/0-9]*)\s+(\d{3})\s+([-+0-9.E]+)\s+\d+\s+\d+\s+SATORBINT\s*$")


def gm_pianeta_da_kernel(naif: int, cartella: Path = COMMENTI_SATS) -> float:
    """GM (km³/s²) del centro del pianeta dalla tabella "Bodies on the File" del kernel satellitare."""
    nome = KERNEL_GM_PIANETA[naif]
    testo = (cartella / f"{nome}.commenti.txt").read_text(encoding="latin-1")
    for riga in testo.splitlines():
        m = _RE_CORPO_KERNEL.match(riga)
        if m and int(m.group(2)) == naif:
            return float(m.group(3))
    raise ValueError(f"GM di {naif} assente dai commenti di {nome}")


# --- Tabelle HTML (JPL e PDS) ---


class _Tabelle(HTMLParser):
    """Estrae le tabelle HTML come liste di righe di testi di cella."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tabelle: list[list[list[str]]] = []
        self._riga: list[str] | None = None
        self._cella: list[str] | None = None
        self._sup = False

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "table":
            self.tabelle.append([])
        elif tag == "tr" and self.tabelle:
            self._riga = []
        elif tag in ("td", "th") and self._riga is not None:
            self._cella = []
        elif tag == "sup" and self._cella is not None:
            self._cella.append("^")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._riga is not None and self._cella is not None:
            self._riga.append(re.sub(r"\s+", " ", "".join(self._cella)).strip())
            self._cella = None
        elif tag == "tr" and self._riga is not None:
            if self._riga:
                self.tabelle[-1].append(self._riga)
            self._riga = None

    def handle_data(self, data: str) -> None:
        if self._cella is not None:
            self._cella.append(data)


def tabelle_html(testo: str) -> list[list[list[str]]]:
    p = _Tabelle()
    p.feed(html.unescape(testo) if "&#" in testo and "<td" not in testo else testo)
    return [t for t in p.tabelle if t]


def _numero_tabella(s: str) -> float | None:
    m = re.search(r"[-−]?\d[\d,]*\.?\d*", s)
    if not m:
        return None
    return float(m.group(0).replace(",", "").replace("−", "-"))


def parametri_jpl(testo: str) -> dict[str, dict]:
    """Tabelle di JPL "Planetary Physical Parameters": per nome inglese, valori e incertezze delle colonne."""
    righe: dict[str, dict] = {}
    for tab in tabelle_html(testo):
        for r in tab:
            if len(r) < 8 or _numero_tabella(r[1]) is None:
                continue
            nome = r[0].strip()
            celle = list(r[1:])
            # celle: valore [rif] ±incertezza in un'unica cella per colonna
            valori = []
            for c in celle:
                v = _numero_tabella(c)
                m = re.search(r"±\s*([\d.]+)", c)
                rif = re.search(r"\[\s*([A-Z*])\s*\]", c)
                valori.append(
                    {"valore": v, "incertezza": float(m.group(1)) if m else None, "rif": rif.group(1) if rif else None}
                )
            righe[nome] = {
                "raggioEquatoriale": valori[0],
                "raggioMedio": valori[1],
                "rotazioneSiderale_d": valori[4],
            }
    return righe


# --- Anelli (PDS Ring-Moon Systems Node) ---


def _intervallo_tau(s: str) -> list[float] | None:
    """Profondità ottica normale come [min, max] dal testo della tabella (es. "10^-5 to 10^-3", "~0", "0.5 to >5")."""
    t = s.replace("−", "-").replace("~", "").replace("≤", "").replace("≥", "").replace(">", "").replace("<", "")
    t = re.sub(r"(\d+(?:\.\d+)?)\s*x\s*10\s*\^\s*(-?\d+)", lambda m: f"{m.group(1)}e{m.group(2)}", t)
    t = re.sub(r"10\s*\^\s*(-?\d+)", lambda m: f"1e{m.group(1)}", t)
    numeri = [float(x) for x in re.findall(r"\d+(?:\.\d+)?(?:e-?\d+)?", t)]
    if not numeri:
        return None
    return [min(numeri), max(numeri)]


TIPI_PDS = {"gap": "lacuna", "tenuous": "tenue", "dense": "denso", "narrow": "stretto"}


def _tipo_pds(s: str) -> str:
    primo = s.split(",")[0].strip().lower()
    return TIPI_PDS.get(primo, "denso")


def anelli_saturno(testo: str) -> list[dict]:
    """Righe della tabella "Rings of Saturn": nome, tipo, raggi interno ed esterno (km), τ normale."""
    tab = next(t for t in tabelle_html(testo) if t[0] and t[0][0].startswith("Feature"))
    out = []
    for r in tab[1:]:
        if len(r) < 5:
            continue
        r0 = _numero_tabella(r[1])
        r1 = _numero_tabella(r[2])
        if r0 is None:
            continue
        if r1 is None:  # anelli tenui con un solo raggio indicato
            r1 = r0
        out.append(
            {"nome": r[0], "tipo": _tipo_pds(r[4]), "rInterno_km": r0, "rEsterno_km": r1, "tau": _intervallo_tau(r[3])}
        )
    _livelli(out)
    return out


def anelli_urano(testo: str) -> list[dict]:
    """Righe della tabella "Rings of Uranus": raggio medio e larghezza massima -> raggi interno ed esterno."""
    tab = next(t for t in tabelle_html(testo) if t[0] and t[0][0].startswith("Feature"))
    out = []
    for r in tab[1:]:
        if len(r) < 6:
            continue
        rm = _numero_tabella(r[1])
        larghezze = [float(x.replace(",", "")) for x in re.findall(r"\d[\d,]*\.?\d*", r[2])]
        if rm is None or not larghezze:
            continue
        w = max(larghezze)
        tipo = "tenue" if w > 1000.0 else "stretto"
        # una riga della tabella sorgente riporta nella prima cella anche la nota della riga precedente
        nome = re.split(r"\.\s+", r[0])[-1].strip()
        out.append(
            {
                "nome": nome,
                "tipo": tipo,
                "rInterno_km": rm - w / 2.0,
                "rEsterno_km": rm + w / 2.0,
                "tau": _intervallo_tau(r[5]),
            }
        )
    _livelli(out)
    return out


def _livelli(elementi: list[dict]) -> None:
    """livello 1 se l'elemento è contenuto in un altro elemento più ampio, altrimenti 0."""
    for e in elementi:
        e["livello"] = 0
        for f in elementi:
            if f is e:
                continue
            ampio = (f["rEsterno_km"] - f["rInterno_km"]) > (e["rEsterno_km"] - e["rInterno_km"])
            if ampio and f["rInterno_km"] <= e["rInterno_km"] and e["rEsterno_km"] <= f["rEsterno_km"]:
                e["livello"] = 1
                break


# --- Corpi ---

# slug -> codice NAIF del modello WGCCRE in pck00011 (orientamento) e del baricentro DE441 (orbita).
CORPI: dict[str, dict] = {
    "sole": {"naif": 10, "inglese": None, "baricentro": None},
    "mercurio": {"naif": 199, "inglese": "Mercury", "baricentro": 1},
    "venere": {"naif": 299, "inglese": "Venus", "baricentro": 2},
    "terra": {"naif": 399, "inglese": "Earth", "baricentro": 3},
    "marte": {"naif": 499, "inglese": "Mars", "baricentro": 4},
    "giove": {"naif": 599, "inglese": "Jupiter", "baricentro": 5},
    "saturno": {"naif": 699, "inglese": "Saturn", "baricentro": 6},
    "urano": {"naif": 799, "inglese": "Uranus", "baricentro": 7},
    "nettuno": {"naif": 899, "inglese": "Neptune", "baricentro": 8},
    "plutone": {"naif": 999, "inglese": "Pluto", "baricentro": 9},
    "luna": {"naif": 301, "inglese": None, "baricentro": None},
}
# Corpi con polo positivo (regola della mano destra) nei rapporti WGCCRE dal 2009: pianeti nani.
POLO_MOMENTO_ANGOLARE = {"plutone"}
# L'orientamento della Terra è di competenza del modello del tempo (Vondrák, catalog-tempo.json).
SENZA_ORIENTAMENTO = {"terra"}


def _valore(valore, incertezza, fonte: str, anno: int | None) -> dict:
    return {"valore": valore, "incertezza": incertezza, "fonte": fonte, "anno": anno}


def raggi(slug: str, pck: dict, jpl: dict) -> dict:
    naif = CORPI[slug]["naif"]
    a, b, c = (float(x) for x in pck[f"BODY{naif}_RADII"])
    if slug == "sole":
        fonte = "IAU 2015 Risoluzione B3 (Prša et al. 2016, AJ 152:41), raggio nominale; NAIF pck00011.tpc"
        return _valore([a, b, c], None, fonte, 2016)
    fonte = f"Nimmo et al. 2017, Icarus 287, 12, adottato da {FONTE_WGCCRE}" if slug == "plutone" else FONTE_WGCCRE
    # Incertezza dalla tabella JPL ([D]) solo per i corpi sferici: per gli sferoidi l'incertezza del raggio
    # polare non è riportata nelle fonti congelate e la terna resta null.
    inc = None
    nome = CORPI[slug]["inglese"]
    if nome is not None and nome in jpl and a == b == c:
        s = jpl[nome]["raggioEquatoriale"]["incertezza"]
        if s is not None:
            inc = [s, s, s]
    return _valore([a, b, c], inc, fonte, 2018 if slug != "plutone" else 2017)


def gm(slug: str) -> dict:
    naif = CORPI[slug]["naif"]
    if slug == "sole":
        return _valore(cst.GM_SOLE, None, f"{FONTE_DE441}, GMS", 2021)
    if slug in ("mercurio", "venere"):
        k = CORPI[slug]["baricentro"]
        return _valore(cst.GM_BARICENTRI[k], None, f"{FONTE_DE441}, GM{k} (pianeta senza satelliti)", 2021)
    if slug == "terra":
        return _valore(cst.GM_TERRA, None, f"{FONTE_DE441}, GMB·EMRAT/(1 + EMRAT)", 2021)
    if slug == "luna":
        return _valore(cst.GM_LUNA, None, f"{FONTE_DE441}, GMB/(1 + EMRAT)", 2021)
    # Soluzione, anno e riferimento dalla stessa tabella dei satelliti (pagina JPL "Planetary Satellite
    # Ephemerides"): in ura184_part-3.bsp il corpo 799 e i satelliti 701-705 vengono da URA182.
    from sats import fisica as sf
    from sats.uscite import SOLUZIONE

    kernel = KERNEL_GM_PIANETA[naif]
    sol, anno, rif = SOLUZIONE[kernel]
    fonte = (
        f"costante GM del corpo {naif} nel kernel JPL {kernel} (soluzione {sol}, {rif}), "
        "coerente con il GM del sistema di DE441"
    )
    valore = gm_pianeta_da_kernel(naif)
    # incertezza della pagina JPL "Planetary Satellite Physical Parameters" con la stessa regola dei satelliti
    pagina = gm_pianeti_jpl().get(CORPI[slug]["inglese"])
    sigma = sf.sigma_gm(pagina, valore, sol) if pagina is not None else None
    if sigma is not None and pagina is not None and pagina.gm_soluzione != sol:
        fonte += (
            f'; incertezza da JPL "Planetary Satellite Physical Parameters" (soluzione {pagina.gm_soluzione}, '
            "stesso valore alle cifre pubblicate)"
        )
    return _valore(valore, sigma, fonte, anno)


def gm_pianeti_jpl() -> dict:
    """Tabella "Planet and Pluto GM Values" della pagina JPL "Planetary Satellite Physical Parameters" (copia
    congelata in raw/sats/): per nome inglese, GM, incertezza, soluzione e decimali pubblicati."""
    from sats import fisica as sf

    out: dict[str, sf.DatiFisici] = {}
    for tab in tabelle_html(sf.PAGINA.read_text(encoding="utf-8", errors="replace")):
        if not tab or tab[0][:1] != ["Planet"]:
            continue
        for r in tab[1:]:
            m = re.fullmatch(r"([\d.]+)\s*±\s*([\d.]+)", r[1]) if len(r) >= 3 else None
            if m is None:
                continue
            naif = next((v["naif"] for v in CORPI.values() if v["inglese"] == r[0]), 0)
            out[r[0]] = sf.DatiFisici(
                naif,
                float(m.group(1)),
                float(m.group(2)),
                sf.URL_PAGINA,
                r[2],
                sf._decimali(m.group(1)),
                math.nan,
                None,
                "",
            )
    return out


def rotazione(slug: str, coeff: dict) -> dict:
    """Periodo siderale (ore) da 360°/Ẇ; negativo per rotazione retrograda rispetto al polo dichiarato."""
    wdot = coeff["w"][1]
    ore = 360.0 / wdot * 24.0
    fonte = f"{FONTE_WGCCRE}, da Ẇ (rotazione sincrona)" if slug == "luna" else f"{FONTE_WGCCRE}, da Ẇ"
    return _valore(ore, None, fonte, 2018)


# Albedo geometrica in banda V (§ 9). Pianeti: Mallama, Krobusek, Pavlov 2017, tab. 7, colonna V di Johnson-Cousins
# (arXiv:1609.05048), senza incertezza. Plutone: Buratti et al. 2015, tab. 2, banda V, solo Plutone (Caronte
# separato), 2013. Sole e Luna: nessun valore (§ 9).
FONTE_MALLAMA = "Mallama, Krobusek, Pavlov 2017, Icarus 282, 19, doi:10.1016/j.icarus.2016.09.023 (tab. 7, banda V)"
ALBEDO_V: dict[str, tuple[float, float | None, str, int]] = {
    "mercurio": (0.142, None, FONTE_MALLAMA, 2017),
    "venere": (0.689, None, FONTE_MALLAMA, 2017),
    "terra": (0.434, None, FONTE_MALLAMA, 2017),
    "marte": (0.170, None, FONTE_MALLAMA, 2017),
    "giove": (0.538, None, FONTE_MALLAMA, 2017),
    "saturno": (0.499, None, FONTE_MALLAMA, 2017),
    "urano": (0.488, None, FONTE_MALLAMA, 2017),
    "nettuno": (0.442, None, FONTE_MALLAMA, 2017),
    "plutone": (
        0.52,
        0.03,
        "Buratti et al. 2015, ApJL 804, L6, doi:10.1088/2041-8205/804/1/L6 (tab. 2, banda V, solo Plutone, 2013)",
        2015,
    ),
}


def albedo(slug: str) -> dict | None:
    v = ALBEDO_V.get(slug)
    return None if v is None else _valore(*v)


def normale_orbita(baricentro: int, jd: float = cst.J2000) -> NDArray[np.float64]:
    """Versore del momento angolare eliocentrico osculante del baricentro (DE441, eclittica J2000)."""
    from common.de441 import De441

    with De441() as de:
        s = de.stato_eliocentrico(baricentro, jd)
    h = np.cross(s[:3], s[3:])
    return h / np.linalg.norm(h)


def inclinazione_assiale(
    slug: str, coeff: dict, normale: NDArray[np.float64] | None, rif: str = "e dall'orbita osculante DE441 a J2000"
) -> dict:
    """Angolo tra il polo di rotazione positivo (verso del momento angolare di spin) e la normale all'orbita.

    `normale`: versore nell'eclittica J2000; `rif` descrive l'orbita nella fonte. Oltre 90°: rotazione retrograda.
    """
    a, d, _ = angoli_wgccre(coeff, cst.J2000)
    p = MATRICE_ICRF_A_ECLITTICA @ polo_icrf(a, d)
    if coeff["w"][1] < 0:
        p = -p
    if normale is None:
        normale = np.array([0.0, 0.0, 1.0])
        rif = "rispetto all'eclittica J2000"
    ang = math.degrees(math.acos(max(-1.0, min(1.0, float(p @ normale)))))
    fonte = f"derivata dal polo WGCCRE (Archinal et al. 2018) {rif}"
    return _valore(ang, None, fonte, None)


def orientamento(slug: str, coeff: dict | None) -> dict:
    if slug == "luna":
        return {"modello": "cassini", "coefficienti": None, "convenzionePolo": "nord-IAU", "indicativo": False}
    conv = "momento-angolare" if slug in POLO_MOMENTO_ANGOLARE else "nord-IAU"
    return {"modello": "wgccre", "coefficienti": coeff, "convenzionePolo": conv, "indicativo": False}


def frammento(offline: bool = True, normali: dict[str, NDArray[np.float64]] | None = None) -> dict:
    pck = leggi_pck(congela("pck00011.tpc", SORGENTI["pck00011.tpc"], offline=offline).decode("latin-1"))
    jpl = parametri_jpl(congela("jpl-phys_par.html", SORGENTI["jpl-phys_par.html"], offline=offline).decode("utf-8"))
    sat = congela("pds-saturn_tables.html", SORGENTI["pds-saturn_tables.html"], offline=offline).decode("utf-8")
    ura = congela("pds-uranus_tables.html", SORGENTI["pds-uranus_tables.html"], offline=offline).decode("utf-8")
    corpi: dict[str, dict] = {}
    for slug, info in CORPI.items():
        coeff = coefficienti_wgccre(pck, info["naif"])
        f = {
            "raggi_km": raggi(slug, pck, jpl),
            "gm_km3s2": gm(slug),
            "rotazione": rotazione(slug, coeff),
            "albedo": albedo(slug),
        }
        if slug != "luna":
            n = None
            if info["baricentro"] is not None:
                n = normali[slug] if normali is not None else normale_orbita(info["baricentro"])
            f["inclinazioneAssiale_gradi"] = inclinazione_assiale(slug, coeff, n)
        voce: dict = {"fisica": f}
        if slug not in SENZA_ORIENTAMENTO:
            voce["orientamento"] = orientamento(slug, coeff)
        corpi[slug] = voce
    corpi["saturno"]["anelli"] = {
        "fonte": "PDS Ring-Moon Systems Node, Saturn ring tables (https://pds-rings.seti.org/saturn/saturn_tables.html)",
        "estrazione": data_estrazione("pds-saturn_tables.html"),
        "profilo": "schematico",
        "piano": "equatore",
        "elementi": anelli_saturno(sat),
    }
    corpi["urano"]["anelli"] = {
        "fonte": "PDS Ring-Moon Systems Node, Uranus ring tables (https://pds-rings.seti.org/uranus/uranus_tables.html)",
        "estrazione": data_estrazione("pds-uranus_tables.html"),
        "profilo": "schematico",
        "piano": "equatore",
        "elementi": anelli_urano(ura),
    }
    return {"formato": 1, "area": "phys", "corpi": corpi}


def scrivi_frammento(percorso: Path = FILE_FRAMMENTO, offline: bool = True) -> Path:
    fr = frammento(offline=offline)
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_text(json.dumps(fr, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return percorso


# --- Fixture per i test TypeScript (tests/fixtures/catalogo/) ---

CARTELLA_FIXTURE = CARTELLA_PIPELINE.parent.parent / "tests" / "fixtures" / "catalogo"
SEME_FIXTURE = 20261022


def matrice_corpo_eclittica(coeff: dict, jd_tdb: float) -> NDArray[np.float64]:
    """Matrice per righe corpo -> eclittica J2000 (colonne: assi del corpo nella scena)."""
    a, d, w = angoli_wgccre(coeff, jd_tdb)
    return MATRICE_ICRF_A_ECLITTICA @ matrice_corpo_icrf(a, d, w)


def scrivi_fixture(cartella: Path = CARTELLA_FIXTURE) -> Path:
    """Matrici WGCCRE di tutti i corpi con modello 'wgccre' nei frammenti di catalogo presenti."""
    corpi: dict[str, dict] = {}
    for f in sorted(CARTELLA_OUT.glob("catalog-*.json")):
        for slug, v in json.loads(f.read_text(encoding="utf-8"))["corpi"].items():
            o = v.get("orientamento")
            if o and o["modello"] == "wgccre":
                corpi[slug] = o["coefficienti"]
    rng = np.random.default_rng(SEME_FIXTURE)
    epoche = [cst.J2000, 2305447.5, 2495759.5, cst.T0 + 0.5]
    epoche += [float(x) for x in rng.uniform(cst.T0, cst.T_END, 40)]
    epoche += [float(x) for x in rng.uniform(2305447.5, 2495760.5, 16)]
    out = {
        "formato": 1,
        "seme": SEME_FIXTURE,
        "descrizione": "Matrici corpo -> eclittica J2000 (per righe) dal modello WGCCRE, physical.py",
        "epoche": epoche,
        "corpi": {
            slug: {"coefficienti": c, "matrici": [matrice_corpo_eclittica(c, t).ravel().tolist() for t in epoche]}
            for slug, c in sorted(corpi.items())
        },
    }
    cartella.mkdir(parents=True, exist_ok=True)
    p = cartella / "orientamento.json"
    p.write_text(json.dumps(out) + "\n", encoding="utf-8")
    return p


def scarica_fonti() -> None:
    for nome, url in SORGENTI.items():
        congela(nome, url, offline=False)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("comando", choices=["scarica", "catalogo", "fixture"])
    a = ap.parse_args(argv)
    if a.comando == "scarica":
        scarica_fonti()
    elif a.comando == "fixture":
        p = scrivi_fixture()
        print(f"scritto {p}")
    else:
        p = scrivi_frammento()
        print(f"scritto {p.relative_to(CARTELLA_PIPELINE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
