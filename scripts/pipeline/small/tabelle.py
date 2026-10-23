"""Vettori Horizons tabulati per gli oggetti precalcolati dell'indice dei corpi maggiori (Horizons non
produce l'SPK: Bennu, C/2013 A1). Stati eliocentrici geometrici nell'eclittica J2000 (km, km/s, TDB) a
passo fisso per intervallo, scelto dalla distanza dal Sole; interpolazione cubica di Hermite.

Specifica congelata in raw/small/horizons/tabelle/<slug>.json; risposte in .cache/small/tabelle/ con
SHA-256 in raw/manifest-sorgenti.json; tabella unita in .cache/small/<slug>/tabella.npz.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

from common import constants as cst
from common.calendario import calendario_a_jd
from common.manifest import aggiorna_manifest_sorgenti, cerca_sorgente, sha256_file, voce_sorgente

from . import horizons, piano, rete
from .anagrafica import CACHE, RAW, Corpo
from .orbite import stato_da_cometari

CARTELLA_SPEC = RAW / "horizons" / "tabelle"
CARTELLA_DATI = CACHE / "tabelle"
CELLA_D = 32.0  # granularità degli intervalli: multiplo di tutti i passi
MAX_EPOCHE = 20000  # epoche per richiesta
MESI = {
    m: i + 1 for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"])
}


def passo_per_distanza(r_ua: np.ndarray) -> np.ndarray:
    """Passo della tabella (d): errore di Hermite sotto 0,1 km sull'orbita kepleriana corrispondente."""
    return np.where(r_ua < 3.0, 1.0, np.where(r_ua < 10.0, 4.0, 32.0))


def percorso_spec(c: Corpo) -> Path:
    return CARTELLA_SPEC / f"{c.slug}.json"


def spec(c: Corpo) -> dict | None:
    p = percorso_spec(c)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def url_tabella(comando: str, inizio: float, fine: float, passo: float) -> str:
    return rete.horizons_url(
        {
            "format": "text",
            "COMMAND": horizons.apici(comando),
            "OBJ_DATA": "'NO'",
            "MAKE_EPHEM": "'YES'",
            "EPHEM_TYPE": "'VECTORS'",
            "CENTER": "'500@10'",
            "REF_PLANE": "'ECLIPTIC'",
            "REF_SYSTEM": "'ICRF'",
            "VEC_TABLE": "'2'",
            "VEC_CORR": "'NONE'",
            "VEC_LABELS": "'NO'",
            "OUT_UNITS": "'KM-S'",
            "CSV_FORMAT": "'YES'",
            "TIME_TYPE": "'TDB'",
            "START_TIME": f"'JD {inizio:.1f}'",
            "STOP_TIME": f"'JD {fine:.1f}'",
            "STEP_SIZE": f"'{passo:g} d'",
        }
    )


def leggi_tabella(testo: str) -> tuple[np.ndarray, np.ndarray]:
    """Tempi (JD TDB) e stati (n, 6) [km, km/s] da una tabella VECTORS in formato CSV."""
    if "$$SOE" not in testo:
        raise ValueError("tabella dei vettori assente: " + testo[-400:])
    righe = [r for r in testo.split("$$SOE")[1].split("$$EOE")[0].splitlines() if r.strip()]
    t = np.empty(len(righe))
    s = np.empty((len(righe), 6))
    for i, r in enumerate(righe):
        campi = [x.strip() for x in r.split(",")]
        t[i] = float(campi[0])
        s[i] = [float(x) for x in campi[2:8]]
    return t, s


def _limite(testo: str, verso: str) -> float | None:
    m = re.search(verso + r" A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}):(\d{2})", testo)
    if not m:
        return None
    a, me, g, h, mi = int(m.group(1)), MESI[m.group(2)], int(m.group(3)), int(m.group(4)), int(m.group(5))
    return calendario_a_jd(a, me, g, h, mi, 0, "gregoriano")


def intervalli(c: Corpo, sb, inizio: float, fine: float) -> list[tuple[float, float, float]]:
    """Intervalli [a, b, passo] che coprono [inizio, fine], con passo dalla distanza kepleriana della
    soluzione SBDB (celle di 32 d; ogni richiesta ha al più MAX_EPOCHE epoche)."""
    o = sb.orbita
    d = np.pi / 180.0
    celle = np.arange(inizio, fine, CELLA_D)
    passi = np.empty(celle.size)
    for k in range(0, celle.size, 4096):
        blocco = celle[k : k + 4096]
        tt = (blocco[:, None] + np.linspace(0.0, CELLA_D, 9)[None, :]).ravel()
        s = stato_da_cometari(o.q_km, o.e, o.inc_deg * d, o.nodo_deg * d, o.argperi_deg * d, o.tp, tt, cst.GM_SOLE)
        r = np.linalg.norm(s[:, :3], axis=1).reshape(blocco.size, 9) / cst.UA_KM
        passi[k : k + blocco.size] = passo_per_distanza(r.min(axis=1))
    out: list[list[float]] = []
    for a, h in zip(celle, passi, strict=True):
        b = min(a + CELLA_D, fine)
        if out and out[-1][2] == h and (out[-1][1] - out[-1][0]) / h < MAX_EPOCHE - CELLA_D:
            out[-1][1] = b
        else:
            out.append([a, b, h])
    return [(float(a), float(b), float(h)) for a, b, h in out]


def scarica_tabella(c: Corpo, sb, offline: bool = False) -> dict | None:
    """Scarica (o verifica) la tabella di un corpo con SPK rifiutato o non conforme; None per gli altri."""
    if not piano.usa_tabella(c):
        return None
    sp = spec(c)
    if sp is None:
        if offline:
            raise rete.AssenteOffline(f"specifica della tabella assente: {percorso_spec(c)}")
        comando = piano.comando_corrente(sb)
        inizio, fine = piano.JD_1600, piano.FINE_SPK
        # disponibilità dichiarata da Horizons (risposte di prova congelate, un limite per risposta)
        for i in range(3):
            sonda = CARTELLA_SPEC / f"{c.slug}-sonda-{i}.txt"
            testo = rete.congelato(sonda, url_tabella(comando, inizio, fine, fine - inizio), offline).decode()
            prima = _limite(testo, "prior to")
            dopo = _limite(testo, "after")
            if prima is None and dopo is None:
                break
            if prima is not None:
                inizio = max(inizio, prima)
            if dopo is not None:
                fine = min(fine, dopo)
        sp = {
            "formato": 1,
            "comando": comando,
            "inizio": inizio,
            "fine": fine,
            "intervalli": [list(x) for x in intervalli(c, sb, inizio, fine)],
        }
        sp["file"] = [f"{c.slug}-{i:02d}.txt" for i in range(len(sp["intervalli"]))]
        CARTELLA_SPEC.mkdir(parents=True, exist_ok=True)
        percorso_spec(c).write_text(json.dumps(sp, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    from .scarica import data_estrazione

    for (a, b, h), nome in zip(sp["intervalli"], sp["file"], strict=True):
        p = CARTELLA_DATI / nome
        voce_nome = f"small/tabelle/{nome}"
        if p.exists():
            try:
                v = cerca_sorgente(voce_nome)
                if v["byte"] == p.stat().st_size and v["sha256"] == sha256_file(p):
                    continue
            except KeyError:
                pass
        if offline:
            raise rete.AssenteOffline(f"tabella assente: {p}")
        url = url_tabella(sp["comando"], a, b, h)
        dati = rete.scarica(url)
        leggi_tabella(dati.decode())  # verifica
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(dati)
        aggiorna_manifest_sorgenti(
            voce_sorgente(
                voce_nome,
                url,
                f"small/tabelle/{nome}",
                data_estrazione(),
                f"vettori Horizons, COMMAND {sp['comando']}, JD {a} / {b}, passo {h:g} d",
            )
        )
    unisci(c, sp)
    return sp


def percorso_npz(c: Corpo) -> Path:
    return CACHE / c.slug / "tabella.npz"


def unisci(c: Corpo, sp: dict) -> Path:
    tt, ss = [], []
    for nome in sp["file"]:
        t, s = leggi_tabella((CARTELLA_DATI / nome).read_text(encoding="utf-8"))
        tt.append(t)
        ss.append(s)
    t = np.concatenate(tt)
    s = np.concatenate(ss)
    t, idx = np.unique(t, return_index=True)
    s = s[idx]
    p = percorso_npz(c)
    p.parent.mkdir(parents=True, exist_ok=True)
    np.savez(p, t=t, stati=s)
    return p


class ValutatoreTabella:
    """Hermite cubica su posizioni e velocità tabulate (passo variabile); stati in km e km/s."""

    def __init__(self, percorso: Path) -> None:
        d = np.load(percorso)
        self.t = d["t"]
        self.s = d["stati"]
        self.disponibile = (float(self.t[0]), float(self.t[-1]))

    def stati(self, t: np.ndarray) -> np.ndarray:
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        if np.any(tt < self.disponibile[0]) or np.any(tt > self.disponibile[1]):
            raise ValueError("istante fuori dalla tabella")
        j = np.clip(np.searchsorted(self.t, tt, side="right") - 1, 0, self.t.size - 2)
        h = self.t[j + 1] - self.t[j]
        x = (tt - self.t[j]) / h
        hs = (h * cst.GIORNO_S)[:, None]
        p0, p1 = self.s[j, :3], self.s[j + 1, :3]
        m0, m1 = self.s[j, 3:] * hs, self.s[j + 1, 3:] * hs
        x = x[:, None]
        x2, x3 = x * x, x * x * x
        pos = (2 * x3 - 3 * x2 + 1) * p0 + (x3 - 2 * x2 + x) * m0 + (-2 * x3 + 3 * x2) * p1 + (x3 - x2) * m1
        der = (6 * x2 - 6 * x) * p0 + (3 * x2 - 4 * x + 1) * m0 + (-6 * x2 + 6 * x) * p1 + (3 * x2 - 2 * x) * m1
        return np.concatenate([pos, der / hs], axis=1)


# --- parametri NG equivalenti per ASSIST ---

# Corpi la cui soluzione JPL usa un modello non gravitazionale non disponibile in ASSIST (Bennu: modello
# fisico di Yarkovsky e pressione di radiazione, AMRAT e RHO): A1 e A2 con g(r) = 1/r², adattati ai vettori
# Horizons nei 50 anni prima e dopo l'ancora.
ADATTAMENTO_NG = {"bennu": ("A1", "A2")}
G_INVERSO_QUADRATO = {"ALN": 1.0, "NK": 0.0, "NM": 2.0, "NN": 0.0, "R0": 1.0}
PASSO_ADATTAMENTO_D = 100.0
DELTA_NG = 1e-14  # UA/d²: differenze finite (regime lineare)


def percorso_ng(c: Corpo) -> Path:
    return CACHE / c.slug / "ng-adattati.json"


def ng_adattati(c: Corpo) -> dict | None:
    p = percorso_ng(c)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def adatta_ng(c: Corpo, amb, iterazioni: int = 4) -> dict | None:
    """Minimi quadrati (Gauss-Newton, differenze finite) dei parametri NG sulle posizioni Horizons."""
    if c.slug not in ADATTAMENTO_NG:
        return None
    from .integrazione import Configurazione, integra_array

    nomi = ADATTAMENTO_NG[c.slug]
    idx = [("A1", "A2", "A3").index(n) for n in nomi]
    v = ValutatoreTabella(percorso_npz(c))
    t_a = v.disponibile[0]
    anc = piano.ancora(t_a)
    s0 = v.stati(np.array([anc]))[0]
    indietro = np.arange(anc - PASSO_ADATTAMENTO_D, t_a - 1e-9, -PASSO_ADATTAMENTO_D)
    avanti = np.arange(anc + PASSO_ADATTAMENTO_D, min(2 * anc - t_a, v.disponibile[1]) + 1e-9, PASSO_ADATTAMENTO_D)
    rif = np.concatenate([v.stati(indietro[::-1])[:, :3], v.stati(avanti)[:, :3]])

    def residui(par: np.ndarray) -> np.ndarray:
        """(1 + n) traiettorie: parametri correnti e perturbati di DELTA_NG uno alla volta."""
        ng = np.zeros((1 + len(idx), 3))
        ng[:, idx] = par
        for j, k in enumerate(idx):
            ng[1 + j, k] += DELTA_NG
        conf = Configurazione(ng=ng, g=dict(G_INVERSO_QUADRATO))
        st0 = np.repeat(s0[None], ng.shape[0], axis=0)
        a = integra_array(amb, anc, st0, conf, indietro)[::-1]
        b = integra_array(amb, anc, st0, conf, avanti)
        pos = np.concatenate([a, b])[:, :, :3]
        return pos - rif[:, None, :]

    par = np.zeros(len(idx))
    storia = []
    migliore = None
    for _ in range(iterazioni + 1):
        r = residui(par)
        r0 = r[:, 0, :].ravel()
        rms = float(np.sqrt(np.mean(r0**2)))
        storia.append({"parametri": par.tolist(), "rms_km": rms})
        if migliore is None or rms < migliore[0]:
            migliore = (rms, par.copy(), r[:, 0, :])
        jac = np.stack([(r[:, 1 + j, :].ravel() - r0) / DELTA_NG for j in range(len(idx))], axis=1)
        dp, *_ = np.linalg.lstsq(jac, -r0, rcond=None)
        par = par + dp
    _, par, r = migliore
    d = np.linalg.norm(r, axis=1)
    out = {
        "parametri": dict(zip(nomi, par.tolist(), strict=True)),
        "g": dict(G_INVERSO_QUADRATO),
        "ancora": anc,
        "intervallo": [t_a, float(avanti[-1])],
        "epoche": int(d.size),
        "rms_km": float(np.sqrt(np.mean(d**2))),
        "max_km": float(np.max(d)),
        "iterazioni": storia,
    }
    p = percorso_ng(c)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return out
