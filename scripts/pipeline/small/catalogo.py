"""Frammento del catalogo dei piccoli corpi: scripts/pipeline/out/catalog-small.json (§ 8.10).

Campi: nomi e alias (§ 4.3), categorie, spkid, effemeridi (fonti per intervallo), soluzione (id, data,
estrazione, modello NG, record DASTCOM), dati fisici con fonte (SBDB o fonti primarie del § 9; con il modello
WGCCRE periodo di rotazione 360°/Ẇ; parametri SBDB marcati "value unverified" esclusi; inclinazione dell'asse dal
polo WGCCRE, altrimenti dal polo SBDB o di letteratura, con incertezza propagata dal polo di letteratura),
orientamento (WGCCRE da NAIF pck00011.tpc, Archinal et al. 2018; altrimenti assi fissi dichiarati),
epsModelloCostante (null: tutti i piccoli corpi hanno la serie in reliability.bin).
"""

from __future__ import annotations

import json
import math
import re

from . import sbdb
from .anagrafica import CARTELLA_OUT, RAW, Corpo, piccoli_corpi
from .blocchi import suffisso_scelto
from .elabora import cartella, contesto
from .scarica import data_estrazione

FILE_LETTERATURA = RAW / "fisica-letteratura.json"
FILE_PCK = RAW / "pck00011.tpc"
FONTE_PCK = "Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22 (valori di NAIF pck00011.tpc)"

# Codici NAIF dei corpi con orientamento WGCCRE in pck00011.tpc.
NAIF_PCK: dict[str, int] = {
    "cerere": 2000001,
    "pallade": 2000002,
    "vesta": 2000004,
    "lutetia": 2000021,
    "52-europa": 2000052,
    "eros": 2000433,
    "davida": 2000511,
    "steins": 2002867,
    "itokawa": 2025143,
    "ida": 2431010,
    "gaspra": 9511010,
    "19p-borrelly": 1000005,
    "67p-churyumov-gerasimenko": 1000012,
    "9p-tempel-1": 1000093,
}
# Estensioni a due dimensioni di SBDB interpretate come sferoide oblato (equatore x polo).
OBLATI = {"ryugu"}
# Valori di raw/small/fisica-letteratura.json che prevalgono sul dato SBDB superato (§ 9).
PRECEDENZA_LETTERATURA: dict[str, set[str]] = {
    "varuna": {"raggi_km", "albedo"},  # SBDB: Earth, Moon, and Planets 89 (2002); Lellouch et al. 2013
    "eris": {"rotazione"},  # SBDB: LCDB 25,9 h da copertura parziale; rotazione sincrona (Szakáts et al. 2023)
    "salacia": {"rotazione"},  # SBDB: LCDB 6,09 h, alias; rotazione sincrona con Actea (Collyer et al. 2025)
    "quaoar": {"rotazione"},  # SBDB: LCDB 8,84 h a picco singolo; doppio picco 17,6788 h (Ortiz et al. 2003)
    "gonggong": {"rotazione"},  # SBDB: LCDB 22,4 h a picco singolo; doppio picco 44,81 h (Pál et al. 2016)
    # SBDB: lista di occultazioni del 1998 e albedo del 2002; raggio e albedo NEATM (Fornasier et al. 2013)
    "chiron": {"raggi_km", "albedo"},
    # SBDB: radiometria del 2002; occultazioni 2013-2020 (Morgado et al. 2021), albedo TPM (Fornasier et al. 2013)
    "chariklo": {"raggi_km", "albedo"},
    "patroclus": {"raggi_km"},  # SBDB: NEOWISE, sistema non risolto con Menoetius; primario (Buie et al. 2015)
    "didymos": {"raggi_km"},  # SBDB: modello radar (Naidu et al. 2020); immagini di DART (Daly et al. 2023)
    "103p-hartley-2": {"raggi_km"},  # SBDB: Lamy et al. 2004; sorvolo EPOXI (Thomas et al. 2013)
    "67p-churyumov-gerasimenko": {"gm_km3s2"},  # SBDB 662,2: cifre invertite rispetto a Pätzold et al. 2016
    "itokawa": {"gm_km3s2"},  # SBDB 2,1e-9: incoerente con la massa citata (Fujiwara et al. 2006)
    # SBDB: GM di Scholl et al. 1987, sostituito da DE441; diametro IRAS (407 km), superato dal modello di forma
    # da immagini VLT/SPHERE (raggio equivalente 217 ± 7 km, Vernazza et al. 2020)
    "igea": {"gm_km3s2", "raggi_km"},
    # SBDB: GM di Landgraf 1992, sostituito da DE441; diametro NEOWISE (306 km) e periodo LCDB (8,727 h), superati
    # dal modello di forma ADAM (D = 332 ± 6 km, P siderale 8,712336 h, Hanuš et al. 2020)
    "interamnia": {"gm_km3s2", "raggi_km", "rotazione"},
    # SBDB: diametro NEOWISE (253 km), superato dal modello di forma (Dv = 273 ± 10 km a 3 σ, Berthier et al. 2014)
    "sylvia": {"raggi_km"},
    # SBDB: diametro 225 km di "J.G. Williams 9-90", senza incertezza; periodo LCDB 6,924 h; senza polo.
    # Primario del modello bilobato di Marchis et al. 2014 (D = 250 ± 26 km, P = 6,92050885 h, polo eclittico)
    "hektor": {"raggi_km", "rotazione"},
}
# Dati SBDB non coerenti con il diametro adottato e senza un valore coerente in fonti primarie: non noti (§ 9). Le
# albedo radiometriche di Igea (IRAS, 0,0717), Interamnia (NEOWISE, 0,078) e Sylvia (NEOWISE, 0,046) sono legate ai
# diametri radiometrici superati dai modelli di forma; i modelli non danno l'albedo e il valore SBDB riportato al
# diametro maggiore scenderebbe del 12-15 %. Quella di Hektor (TRIAD, 0,025, qualità 3, senza incertezza) con H = 7,32
# corrisponde a un diametro di circa 289 km, non ai 250 ± 26 km di Marchis et al. 2014, che non pubblicano un'albedo.
SBDB_SUPERATO_SENZA_SOSTITUTO: dict[str, set[str]] = {
    "igea": {"albedo"},
    "interamnia": {"albedo"},
    "sylvia": {"albedo"},
    "hektor": {"albedo"},
}
# Raggi di pck00011.tpc non adottati: 19P, raggio medio 4,22 km maggiore del primo semiasse (3,5 km) dichiarato
# nello stesso file; si usa il diametro SBDB.
RAGGI_PCK_ESCLUSI = {"19p-borrelly"}


def _anno(rif: str | None) -> int | None:
    """Primo anno del riferimento, esclusi i titoli tra virgolette."""
    if not rif:
        return None
    m = re.findall(r"(?<!\d)(1[89]\d\d|20\d\d)(?!\d)", re.sub(r'"[^"]*"', "", rif))
    return int(m[0]) if m else None


def _fonte_sbdb(p: dict) -> str:
    rif = (p.get("ref") or "").strip()
    return f"JPL SBDB: {rif}" if rif else "JPL SBDB"


def _num(x: str | None) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except ValueError:
        return None


def _estensione(testo: str) -> list[float] | None:
    parti = [p.strip() for p in re.split(r"\s*[xX×]\s*", testo)]
    try:
        v = [float(p) for p in parti]
    except ValueError:
        return None
    return v if len(v) in (2, 3) else None


def _pck() -> dict[str, list[float]]:
    """Variabili BODYnnn_* della parte \\begindata di pck00011.tpc."""
    testo = FILE_PCK.read_text(encoding="utf-8", errors="replace")
    out: dict[str, list[float]] = {}
    for blocco in re.findall(r"\\begindata(.*?)\\begintext", testo, re.S):
        for nome, valori in re.findall(r"(BODY\d+_[A-Z_]+)\s*=\s*\(([^)]*)\)", blocco):
            out[nome] = [float(v.replace("D", "E")) for v in valori.split()]
    return out


def _verificato(p: dict) -> bool:
    """Parametro SBDB utilizzabile: esclusi i valori che SBDB stesso marca come non verificati (§ 9)."""
    return "unverified" not in (p.get("notes") or "").lower()


def codici_naif(c: Corpo, sb: sbdb.RispostaSbdb) -> list[int]:
    """Codici NAIF con cui cercare i raggi in pck00011.tpc: corpi con modello WGCCRE (NAIF_PCK), asteroidi di
    sb441-n16, 2 000 000 + numero per i pianetini numerati, SPK-ID per le comete (uguale al codice NAIF)."""
    codici = [NAIF_PCK.get(c.slug), c.naif_sb441]
    if c.categoria == "cometa":
        codici.append(sb.spkid)
    elif c.numero:
        codici.append(2_000_000 + c.numero)
    return [k for k in codici if k]


def fisica(c: Corpo, sb: sbdb.RispostaSbdb, lett: dict, pck: dict) -> dict:
    pp = {p["name"]: p for p in sb.fisica if _verificato(p)}
    out: dict = {"raggi_km": None, "gm_km3s2": None, "rotazione": None, "albedo": None}
    lit = lett.get(c.slug, {})
    prevale = PRECEDENZA_LETTERATURA.get(c.slug, set())
    superato = SBDB_SUPERATO_SENZA_SOSTITUTO.get(c.slug, set())
    # raggi: estensione SBDB (tre assi, poi due), poi raggi di pck00011, poi diametro SBDB, poi letteratura
    est = pp.get("extent")
    v = _estensione(est["value"]) if est else None
    raggi_pck = None
    if c.slug not in RAGGI_PCK_ESCLUSI:
        raggi_pck = next((pck[f"BODY{k}_RADII"] for k in codici_naif(c, sb) if f"BODY{k}_RADII" in pck), None)
    if v is not None and len(v) == 3:
        sig = _estensione(est["sigma"]) if est.get("sigma") and "%" not in est["sigma"] else None
        # semiassi [a, b, c] in ordine decrescente, come in pck00011 (SBDB li dà anche in ordine crescente)
        ordine = sorted(range(3), key=lambda i: -v[i])
        out["raggi_km"] = {
            "valore": [round(v[i] / 2.0, 6) for i in ordine],
            "incertezza": [round(sig[i] / 2.0, 6) for i in ordine] if sig and len(sig) == 3 else None,
            "fonte": _fonte_sbdb(est),
            "anno": _anno(est.get("ref")),
        }
    elif v is not None:
        a, b = v[0] / 2.0, v[1] / 2.0
        val = [a, a, b] if c.slug in OBLATI else [a, b, b]
        out["raggi_km"] = {
            "valore": [round(x, 6) for x in val],
            "incertezza": None,
            "fonte": _fonte_sbdb(est),
            "anno": _anno(est.get("ref")),
        }
    elif raggi_pck is not None:
        out["raggi_km"] = {"valore": raggi_pck, "incertezza": None, "fonte": FONTE_PCK, "anno": 2018}
    elif "diameter" in pp and _num(pp["diameter"]["value"]) is not None:
        d = _num(pp["diameter"]["value"]) / 2.0
        s = _num(pp["diameter"].get("sigma"))
        out["raggi_km"] = {
            "valore": [d, d, d],
            "incertezza": [s / 2.0] * 3 if s else None,
            "fonte": _fonte_sbdb(pp["diameter"]),
            "anno": _anno(pp["diameter"].get("ref")),
        }
    if (out["raggi_km"] is None or "raggi_km" in prevale) and "raggi_km" in lit:
        out["raggi_km"] = {k: lit["raggi_km"][k] for k in ("valore", "incertezza", "fonte", "anno")}
    for chiave, nome in (("gm_km3s2", "GM"), ("rotazione", "rot_per"), ("albedo", "albedo")):
        p = pp.get(nome)
        val = _num(p["value"]) if p else None
        if chiave in lit and (val is None or chiave in prevale):
            out[chiave] = {k: lit[chiave][k] for k in ("valore", "incertezza", "fonte", "anno")}
        elif val is not None and chiave not in superato:
            out[chiave] = {
                "valore": val,
                "incertezza": _num(p.get("sigma")),
                "fonte": _fonte_sbdb(p),
                "anno": _anno(p.get("ref")),
            }
    # modello WGCCRE: periodo della rotazione rappresentata, 360°/Ẇ (come per Sole, pianeti e Plutone)
    pm = _pm_wgccre(c, pck)
    if pm is not None:
        out["rotazione"] = {
            "valore": 360.0 / pm[1] * 24.0,
            "incertezza": None,
            "fonte": f"{FONTE_PCK}, da Ẇ",
            "anno": 2018,
        }
        out["inclinazioneAssiale_gradi"] = inclinazione_assiale(c, sb, pck)
    else:
        polo = polo_noto(pp.get("pole"), lit.get("polo"))
        if polo is not None:
            sigma = incertezza_inclinazione(pp.get("pole"), lit.get("polo"), sb.orbita)
            out["inclinazioneAssiale_gradi"] = inclinazione_da_polo(*polo, sb.orbita, sigma)
    return out


def normale_orbita(o: sbdb.OrbitaSbdb) -> list[float]:
    """Versore del momento angolare dell'orbita osculante SBDB (i, Ω sull'eclittica J2000)."""
    i, om = math.radians(o.inc_deg), math.radians(o.nodo_deg)
    return [math.sin(i) * math.sin(om), -math.sin(i) * math.cos(om), math.cos(i)]


def inclinazione_assiale(c: Corpo, sb: sbdb.RispostaSbdb, pck: dict) -> dict:
    """Angolo tra il polo positivo WGCCRE e la normale all'orbita eliocentrica (oltre 90°: rotazione retrograda)."""
    import numpy as np

    import physical as ph

    coeff = orientamento(c, pck)["coefficienti"]
    o = sb.orbita
    sol = f"JPL#{o.orbit_id}" if o.orbit_id.isdigit() else o.orbit_id
    rif = f"e dall'orbita osculante della soluzione SBDB {sol}"
    return ph.inclinazione_assiale(c.slug, coeff, np.array(normale_orbita(sb.orbita)), rif)


def _polo_sbdb(sbdb_pole: dict | None) -> tuple[float, float] | None:
    """AR e Dec del campo "pole" di SBDB, se contiene due numeri."""
    if sbdb_pole is None:
        return None
    v = [float(x) for x in re.findall(r"[-+]?\d+(?:\.\d+)?", sbdb_pole["value"])]
    return (v[0], v[1]) if len(v) == 2 else None


def polo_noto(sbdb_pole: dict | None, lett_polo: dict | None) -> tuple[float, float, str, int | None] | None:
    """Polo positivo (AR, Dec J2000 in gradi), fonte e anno: campo "pole" di SBDB ("spin-pole direction in
    R.A./Dec."), altrimenti il polo di raw/small/fisica-letteratura.json, in A.R. e Dec. ("ra", "dec") o in longitudine
    e latitudine eclittiche J2000 ("lambda_ecl", "beta_ecl": Hektor, Marchis et al. 2014)."""
    ad = _polo_sbdb(sbdb_pole)
    if ad is not None:
        return ad[0], ad[1], f"polo {_fonte_sbdb(sbdb_pole)}", _anno(sbdb_pole.get("ref"))
    if lett_polo is not None:
        fonte, anno = f"polo di {lett_polo['fonte']}", lett_polo["anno"]
        if "lambda_ecl" in lett_polo:
            from common.frames import eclittica_a_icrf

            lam, beta = math.radians(lett_polo["lambda_ecl"]), math.radians(lett_polo["beta_ecl"])
            x, y, z = eclittica_a_icrf([math.cos(beta) * math.cos(lam), math.cos(beta) * math.sin(lam), math.sin(beta)])
            return math.degrees(math.atan2(y, x)) % 360.0, math.degrees(math.asin(z)), fonte, anno
        return lett_polo["ra"], lett_polo["dec"], fonte, anno
    return None


# Passo (gradi) delle differenze centrali per le derivate dell'inclinazione rispetto alle coordinate del polo.
PASSO_DERIVATA_GRADI = 1e-3


def incertezza_inclinazione(sbdb_pole: dict | None, lett_polo: dict | None, o: sbdb.OrbitaSbdb) -> float | None:
    """Incertezza a 1 σ (gradi) dell'inclinazione dell'asse ricavata da un polo di letteratura.

    Vale solo con il polo di letteratura che `polo_noto` adotta (nessun polo SBDB utilizzabile) e con
    "incertezza_gradi" pubblicata dalla fonte: 1 σ su ciascuna delle due coordinate nel sistema della fonte (A.R. e
    Dec. per Arrokoth, longitudine e latitudine eclittiche J2000 per Hektor). Propagazione al primo ordine
    σ² = (∂ε/∂c1·σ)² + (∂ε/∂c2·σ)² nelle coordinate della fonte, con derivate per differenze centrali: non si
    applicano ±σ di λ e β come se fossero A.R. e Dec., perché dopo la rotazione il risultato cambia. L'orbita
    osculante SBDB è presa senza incertezza (trascurabile rispetto a quella del polo). Per i poli SBDB l'incertezza
    non è propagata: il campo sigma ha formati diversi ("20 degrees", "0.0003/0.0001", "5") e non dichiara il sistema
    delle coordinate."""
    import numpy as np

    from common.frames import MATRICE_ICRF_A_ECLITTICA

    if _polo_sbdb(sbdb_pole) is not None or not lett_polo or lett_polo.get("incertezza_gradi") is None:
        return None
    eclittico = "lambda_ecl" in lett_polo
    c1, c2 = (lett_polo["lambda_ecl"], lett_polo["beta_ecl"]) if eclittico else (lett_polo["ra"], lett_polo["dec"])
    n = np.array(normale_orbita(o))

    def epsilon(a: float, b: float) -> float:
        ra, rb = math.radians(a), math.radians(b)
        v = np.array([math.cos(rb) * math.cos(ra), math.cos(rb) * math.sin(ra), math.sin(rb)])
        p = v if eclittico else MATRICE_ICRF_A_ECLITTICA @ v
        return math.degrees(math.acos(max(-1.0, min(1.0, float(p @ n)))))

    h = PASSO_DERIVATA_GRADI
    d1 = (epsilon(c1 + h, c2) - epsilon(c1 - h, c2)) / (2.0 * h)
    d2 = (epsilon(c1, c2 + h) - epsilon(c1, c2 - h)) / (2.0 * h)
    return round(float(lett_polo["incertezza_gradi"]) * math.hypot(d1, d2), 3)


def inclinazione_da_polo(
    ra: float, dec: float, fonte: str, anno: int | None, o: sbdb.OrbitaSbdb, incertezza: float | None = None
) -> dict:
    """Angolo tra il polo positivo e la normale all'orbita osculante SBDB (oltre 90°: rotazione retrograda)."""
    import numpy as np

    import physical as ph
    from common.frames import MATRICE_ICRF_A_ECLITTICA

    p = MATRICE_ICRF_A_ECLITTICA @ ph.polo_icrf(ra, dec)
    ang = math.degrees(math.acos(max(-1.0, min(1.0, float(p @ np.array(normale_orbita(o)))))))
    sol = f"JPL#{o.orbit_id}" if o.orbit_id.isdigit() else o.orbit_id
    # punto finale del riferimento (SBDB, polo di Ryugu: "A&A 632 L4.") tolto prima della congiunzione
    fonte = re.sub(r"(?<!\bal)\.\s*$", "", fonte)
    testo = f"derivata dal {fonte} e dall'orbita osculante della soluzione SBDB {sol}"
    return {"valore": ang, "incertezza": incertezza, "fonte": testo, "anno": anno}


def _pm_wgccre(c: Corpo, pck: dict) -> list[float] | None:
    """Coefficienti di W del modello WGCCRE (pck00011.tpc), se il corpo ne ha uno."""
    naif = NAIF_PCK.get(c.slug)
    if naif is None or f"BODY{naif}_POLE_RA" not in pck:
        return None
    pm = pck.get(f"BODY{naif}_PM")
    return pm if pm and len(pm) > 1 and pm[1] != 0.0 else None


def orientamento(c: Corpo, pck: dict) -> dict:
    naif = NAIF_PCK.get(c.slug)
    if naif is not None and f"BODY{naif}_POLE_RA" in pck:
        ra = pck[f"BODY{naif}_POLE_RA"]
        de = pck[f"BODY{naif}_POLE_DEC"]
        pm = pck[f"BODY{naif}_PM"]

        def taglia(x: list[float]) -> list[float]:
            y = list(x)
            while len(y) > 1 and y[-1] == 0.0:
                y.pop()
            return y

        return {
            "modello": "wgccre",
            "coefficienti": {"alfa0": taglia(ra), "delta0": taglia(de), "w": taglia(pm), "periodici": []},
            "convenzionePolo": "momento-angolare",
            "indicativo": False,
        }
    return {"modello": "fisso", "coefficienti": None, "convenzionePolo": "momento-angolare", "indicativo": True}


def _alias(c: Corpo, sb: sbdb.RispostaSbdb) -> tuple[list[str], str | None]:
    alias: list[str] = []
    designazione = c.designazione
    full = sb.fullname.strip()
    m = re.match(r"^(\d+)\s+(.+?)(?:\s+\((.+)\))?$", full)
    if m:
        num, nome, prov = m.group(1), m.group(2), m.group(3)
        alias += [num, nome, f"{num} {nome}"]
        if prov:
            alias.append(prov)
            designazione = designazione or prov
    else:
        alias.append(full)
        m2 = re.match(r"^([A-Z]/\d{4} [A-Z0-9-]+|\d+[PI])(?:[/ ]\(?(.*?)\)?)?$", full)
        if m2:
            alias.append(m2.group(1))
            if m2.group(2):
                alias.append(m2.group(2))
        if "(" in full:
            alias.append(full.split("(")[1].rstrip(")").strip())
    alias += [c.nome, c.nome_ufficiale or "", c.sbdb, c.designazione or ""]
    if c.slug == "1i-oumuamua":
        alias += ["Oumuamua", "1I/2017 U1", "A/2017 U1"]
    if c.slug == "2i-borisov":
        alias += ["C/2019 Q4", "Borisov"]
    if c.slug == "3i-atlas":
        alias += ["C/2025 N1", "ATLAS"]
    if c.slug == "c1680-v1":
        alias += ["Grande cometa del 1680"]
    visti: list[str] = []
    for a in alias:
        a = a.strip()
        if a and a not in visti:
            visti.append(a)
    return visti, designazione


def soluzione(c: Corpo, sb: sbdb.RispostaSbdb, recs) -> dict:
    o = sb.orbita
    # corpi in sb441-n16: la soluzione corrente vale nella finestra 1600-2121 e per i cloni; prima del
    # 1600 sb441-n16 (indicato nelle fonti per intervallo)
    sol = f"JPL#{o.orbit_id}" if o.orbit_id.isdigit() else o.orbit_id
    ng = None
    if o.ng:
        g = None
        if not o.g_standard:
            g = {"alfa": o.g["ALN"], "r0": o.g["R0"], "m": o.g["NM"], "n": o.g["NN"], "k": o.g["NK"]}
        ng = {"A1": o.ng.get("A1"), "A2": o.ng.get("A2"), "A3": o.ng.get("A3"), "DT": o.ng.get("DT"), "g": g}
    from .tabelle import ng_adattati

    adattati = ng_adattati(c)
    if adattati is not None:
        # modello della soluzione non disponibile in ASSIST: parametri equivalenti usati nelle integrazioni
        gg = adattati["g"]
        par = adattati["parametri"]
        ng = {
            "A1": par.get("A1"),
            "A2": par.get("A2"),
            "A3": par.get("A3"),
            "DT": None,
            "g": {"alfa": gg["ALN"], "r0": gg["R0"], "m": gg["NM"], "n": gg["NN"], "k": gg["NK"]},
        }
    data = o.soln_date.split()[0] if o.soln_date else None
    rec = [f"{r.record} ({r.soluzione})" for r in recs] if recs else None
    return {"id": sol, "data": data, "estrazione": data_estrazione(), "modelloNG": ng, "recordDastcom": rec}


def frammento_corpo(c: Corpo, lett: dict, pck: dict) -> dict:
    sb, recs, pezzi = contesto(c)
    fp = cartella(c.slug) / f"fonti{suffisso_scelto()}.json"
    if fp.exists():
        fonti = json.loads(fp.read_text(encoding="utf-8"))
    else:
        fonti = [
            {
                "tipo": p.tipo,
                "inizio": p.inizio,
                "fine": p.fine,
                "descrizione": p.descrizione,
                "varianti": list(p.varianti),
                "saltoGiunzioneKm": None,
            }
            for p in pezzi
        ]
    alias, designazione = _alias(c, sb)
    return {
        "ssid": c.ssid,
        "slug": c.slug,
        "nome": c.nome,
        "nomeUfficiale": c.nome_ufficiale,
        "numero": c.numero,
        "designazione": designazione,
        "alias": alias,
        "categoria": c.categoria,
        "categorieSecondarie": list(c.categorie_secondarie),
        "naif": c.naif,
        "spkid": sb.spkid,
        "sbdb": c.sbdb,
        "primario": "sole",
        "effemeridi": {"modello": "piccolo-corpo", "fonti": fonti},
        "soluzione": soluzione(c, sb, recs),
        "fisica": fisica(c, sb, lett, pck),
        "orientamento": orientamento(c, pck),
        "epsModelloCostante": None,
    }


def scrivi_frammenti() -> dict:
    lett = json.loads(FILE_LETTERATURA.read_text(encoding="utf-8"))["corpi"]
    pck = _pck()
    corpi = {c.slug: frammento_corpo(c, lett, pck) for c in piccoli_corpi()}
    out = {"formato": 1, "area": "small", "corpi": corpi}
    CARTELLA_OUT.mkdir(parents=True, exist_ok=True)
    (CARTELLA_OUT / "catalog-small.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return out
