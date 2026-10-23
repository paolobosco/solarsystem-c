"""Passo 'segmenti' per corpo: affidabilità per istante e per nodo, regioni con dati, segmenti E/C per blocco,
giunzioni misurate, fonti per intervallo. Rilegge i risultati del passo 'integra' da .cache/small/<slug>/.
"""

from __future__ import annotations

import math
import pickle
import time
from pathlib import Path

import numpy as np

from common import affidabilita as ca
from common import constants as cst

from . import affidabilita as aff
from . import piano, segmenti
from .anagrafica import Corpo, per_slug
from .elabora import JD_MENO_2000, MU, _salva_json, cartella, contesto, cumula_da_epoca
from .horizons import RecordCometa

TOLL_FINESTRA_KM = 500.0
TOLL_FINESTRA_REL = 1e-7
# Livelli di tolleranza prima del 1600 (relativa a r): (dal -2000 al 1600, prima del -2000).
# 0: § 7.6.3; 1: ripiego del § 15; 2-4: tolleranze più larghe (candidati per il budget, § 8.1);
# 5 e 6: solo misura (5: soglia minima della dimensione; 6: come 4 con tolleranza della finestra × 10).
LIVELLI = {
    0: (1e-5, 1e-5),
    1: (1e-5, 1e-4),
    2: (1e-4, 1e-3),
    3: (3e-4, 3e-3),
    4: (1e-3, 1e-2),
    5: (1e-2, 1e-2),
    6: (1e-3, 1e-2),
}
FATTORE_FINESTRA = {6: 10.0}
FRAZIONE_EPS = 0.05
SOGLIA_CONTINUITA = 0.1  # salto ≤ 0,1·tolleranza: gli aloni possono usare la sorgente adiacente
RIFLESSO_INTERNI = True  # segmenti.stati_per_elementi
EPS_SATURO = math.pi  # oltre l'arresto dei cloni: livello non determinabile, ε posto a 180°


class Sorgenti:
    """Valutatori delle sorgenti per chiave ('sb441', 'spk:<nome>', 'assist:<nome>')."""

    def __init__(self, c: Corpo) -> None:
        self.c = c
        self._cache: dict = {}
        self._amb = None

    def ambiente(self):
        if self._amb is None:
            from .integrazione import Ambiente

            self._amb = Ambiente()
        return self._amb

    def get(self, chiave: str):
        if chiave in self._cache:
            return self._cache[chiave]
        tipo, _, nome = chiave.partition(":")
        if tipo == "sb441":
            from .sorgenti import ValutatoreSb441

            v = ValutatoreSb441(self.c.naif_sb441)
            disp = v.disponibile
            f = v.stati
        elif tipo == "tab":
            from .tabelle import ValutatoreTabella, percorso_npz

            v = ValutatoreTabella(percorso_npz(self.c))
            disp = v.disponibile
            f = v.stati
        elif tipo == "spk":
            from .scarica import percorso_spk
            from .sorgenti import ValutatoreSpk

            v = ValutatoreSpk(percorso_spk(nome))
            disp = v.disponibile
            f = v.stati
        else:
            from .traiettoria import TraiettoriaAssist

            tr = TraiettoriaAssist.carica(cartella(self.c.slug) / "traiettorie" / f"{nome}.npz")
            disp = tr.disponibile

            def f(t, tr=tr):
                return tr.stati_a(self.ambiente(), t)

        self._cache[chiave] = (disp, f)
        return self._cache[chiave]

    def stati(self, chiave: str, t: np.ndarray) -> np.ndarray:
        disp, f = self.get(chiave)
        tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
        if np.any(tt < disp[0]) or np.any(tt > disp[1]):
            raise segmenti.DatiNonDisponibili(chiave)
        return f(tt)

    def disponibile(self, chiave: str) -> tuple[float, float]:
        return self.get(chiave)[0]


def _metrica_coppia(s1: np.ndarray, s2: np.ndarray) -> float:
    return float(aff.metrica(s1[None], s2)[0])


def _forma_coppia(s1: np.ndarray, s2: np.ndarray, t: float) -> bool:
    return aff.forma_determinata(aff.forma_scarti(s1[None], s2, t, MU))


def _rel_passato(t: np.ndarray, livello: int) -> np.ndarray:
    dopo, prima = LIVELLI[livello]
    return np.where(t < JD_MENO_2000, prima, dopo)


def _tolleranza(eps_fun, livello: int):
    fattore = FATTORE_FINESTRA.get(livello, 1.0)

    def tol(t: np.ndarray, r: np.ndarray) -> np.ndarray:
        t = np.asarray(t, dtype=np.float64)
        out = fattore * np.maximum(TOLL_FINESTRA_KM, TOLL_FINESTRA_REL * r)
        prima = t < piano.JD_1600
        if np.any(prima):
            rel = _rel_passato(t[prima], livello)
            e = eps_fun(t[prima])
            out[prima] = np.maximum(rel * r[prima], FRAZIONE_EPS * np.nan_to_num(e, nan=0.0) * r[prima])
        return out

    return tol


def _pavimento(t: np.ndarray, livello: int = 0) -> np.ndarray:
    """Errore di rappresentazione incluso in ε per istante: parte relativa della tolleranza dei segmenti.
    Nella finestra la parte assoluta (500 km) si aggiunge per nodo con pavimento_finestra."""
    finestra = FATTORE_FINESTRA.get(livello, 1.0) * TOLL_FINESTRA_REL
    return np.where(t >= piano.JD_1600, finestra, _rel_passato(t, livello))


def r_minimo_nodi(segs, nodi: np.ndarray, da: float = piano.JD_1600) -> np.ndarray:
    """Distanza minima dal Sole (km) dei segmenti in ogni intervallo chiuso [nodo, nodo successivo] a partire
    da `da`; inf dove non ci sono segmenti. Campioni: bordi, nodi della griglia e punti medi di ogni segmento,
    nodi di affidabilità; attorno a ogni minimo locale due raffinamenti a 64 sottointervalli."""
    from common import binio

    out = np.full(nodi.size - 1, np.inf)

    def r_di(s, t: np.ndarray) -> np.ndarray:
        return np.linalg.norm(binio.valuta_segmento(s, t)[:, :3], axis=1)

    for s in segs:
        a, b = max(s.inizio, da), s.fine
        if not a < b:
            continue
        mezzo = 0.5 * s.h
        j = np.arange(math.ceil((a - s.t_primo) / mezzo), math.floor((b - s.t_primo) / mezzo) + 1)
        t = np.unique(np.concatenate([[a, b], s.t_primo + mezzo * j, nodi[(nodi > a) & (nodi < b)]]))
        t = t[(t >= a) & (t <= b)]
        r = r_di(s, t)
        tt, rr = [t], [r]
        if t.size >= 3:
            for i in np.nonzero((r[1:-1] <= r[:-2]) & (r[1:-1] <= r[2:]))[0] + 1:
                lo, hi = t[i - 1], t[i + 1]
                for _ in range(2):
                    x = np.linspace(lo, hi, 65)
                    y = r_di(s, x)
                    tt.append(x)
                    rr.append(y)
                    m = int(np.argmin(y))
                    lo, hi = x[max(m - 1, 0)], x[min(m + 1, 64)]
        t, r = np.concatenate(tt), np.concatenate(rr)
        k = np.searchsorted(nodi, t, side="right") - 1
        ok = (k >= 0) & (k < out.size)
        np.minimum.at(out, k[ok], r[ok])
        bordo = ok & (k >= 1)
        bordo[bordo] = t[bordo] == nodi[k[bordo]]  # un nodo appartiene anche all'intervallo precedente
        np.minimum.at(out, k[bordo] - 1, r[bordo])
    return out


def pavimento_finestra(segs, nodi: np.ndarray, livello: int = 0) -> np.ndarray:
    """Parte della tolleranza della finestra non inclusa in _pavimento, per nodo (rad):
    fattore·max(0, 500 km/r_min - 1e-7), con r_min di r_minimo_nodi; 0 senza segmenti nella finestra."""
    fattore = FATTORE_FINESTRA.get(livello, 1.0)
    return fattore * np.maximum(0.0, TOLL_FINESTRA_KM / r_minimo_nodi(segs, nodi) - TOLL_FINESTRA_REL)


def suffisso(livello: int) -> str:
    return "" if livello == 0 else f"-L{livello}"


def segmenti_corpo(slug: str, livello: int = 0) -> dict:
    tic = time.time()
    c = per_slug()[slug]
    sb, recs, pezzi = contesto(c)
    cart = cartella(slug)
    src = Sorgenti(c)
    info: dict = {"slug": slug}
    cl = dict(np.load(cart / "cloni.npz"))
    epoca = float(cl["epoca"][0])
    nodi = aff.nodi()
    # --- affidabilità per istante ---
    t_cl = cl["tempi"]
    eps_cl = cumula_da_epoca(t_cl, cl["eps"], epoca)
    forma_cl = np.array(
        [aff.forma_determinata((cl["da"][k], cl["de"][k], cl["di"][k])) for k in range(t_cl.size)], dtype=bool
    )
    forma_cl = _cumula_bool(t_cl, forma_cl, epoca)
    campioni_t = list(t_cl)
    campioni_e = list(eps_cl)
    campioni_f = list(forma_cl)
    salti: list[dict] = []
    if recs:
        campioni_t, campioni_e, campioni_f, salti = _affidabilita_record(c, recs, pezzi, src, cl, epoca, cart)
    t_s = np.array(campioni_t)
    e_s = np.array(campioni_e)
    f_s = np.array(campioni_f, dtype=bool)
    ordine = np.argsort(t_s, kind="stable")
    t_s, e_s, f_s = t_s[ordine], e_s[ordine], f_s[ordine]
    # oltre l'arresto dei cloni (nessun campione): non determinabile
    t_min_camp, t_max_camp = float(t_s[0]), float(t_s[-1])
    e_s = np.where(np.isnan(e_s), EPS_SATURO, e_s)
    e_s = e_s + _pavimento(t_s, livello)
    # istanti dei nodi senza campioni (oltre l'arresto): saturi
    # (l'ultimo nodo, oltre T_END, non ha campioni e non conta)
    extra_t = nodi[((nodi < t_min_camp) | (nodi > t_max_camp)) & (nodi <= cst.T_END)]
    t_tutti = np.concatenate([t_s, extra_t])
    e_tutti = np.concatenate([e_s, np.full(extra_t.size, EPS_SATURO)])
    f_tutti = np.concatenate([f_s, np.zeros(extra_t.size, dtype=bool)])
    o = np.argsort(t_tutti, kind="stable")
    t_tutti, e_tutti, f_tutti = t_tutti[o], e_tutti[o], f_tutti[o]

    # --- intervalli dei nodi determinabili ---
    log10, forma_nodi, _ = aff.serie_nodi(t_tutti, e_tutti, f_tutti, np.ones(t_tutti.size, dtype=bool))
    determinabile = np.array([x is not None and 10.0**x <= aff.SOGLIA_NON_DETERMINABILE for x in log10])
    regioni = _regioni(nodi, determinabile)

    def eps_fun(t: np.ndarray) -> np.ndarray:
        # stima di ε per la tolleranza: interpolazione lineare tra i campioni (non conservativa verso l'alto)
        return np.interp(t, t_tutti, e_tutti)

    tol = _tolleranza(eps_fun, livello)
    # correzione del moto riflesso del Sole negli elementi E (pesata con la distanza dal Sole)
    riflesso = RIFLESSO_INTERNI
    np.savez(cart / f"eps{suffisso(livello)}.npz", t=t_tutti, eps=e_tutti)
    # --- giunzioni tra pezzi consecutivi ---
    giunzioni = []
    for p1, p2 in zip(pezzi, pezzi[1:], strict=False):
        b = p1.fine
        g = {"t": b, "da": p1.chiave, "a": p2.chiave, "km": None, "rel": None, "metrica": None}
        if p1.chiave != p2.chiave:
            try:
                s1 = src.stati(p1.chiave, np.array([b]))[0]
                s2 = src.stati(p2.chiave, np.array([b]))[0]
                d = float(np.linalg.norm(s1[:3] - s2[:3]))
                g.update(km=d, rel=d / float(np.linalg.norm(s2[:3])), metrica=_metrica_coppia(s1, s2))
            except (segmenti.DatiNonDisponibili, FileNotFoundError):
                pass
        else:
            g.update(km=0.0, rel=0.0, metrica=0.0)
        giunzioni.append(g)
    info["giunzioni"] = giunzioni
    # sovrapposizione 1600-1650 tra ASSIST e SPK (corpi della classe 3)
    info["sovrapposizione_1600_1650"] = _sovrapposizione(src, pezzi)

    # --- segmenti ---
    per_blocco: dict[int, list] = {k: [] for k in range(cst.K)}
    errori: list[dict] = []
    for ip, p in enumerate(pezzi):
        for a_r, b_r in regioni:
            a = max(p.inizio, a_r)
            b = min(p.fine, b_r)
            if not a < b:
                continue
            try:
                src.get(p.chiave)
            except FileNotFoundError:
                raise RuntimeError(f"sorgente {p.chiave} assente per dati richiesti in [{a}, {b})") from None
            val = _valutatore(src, pezzi, ip, giunzioni, tol)
            disp = src.disponibile(p.chiave)
            a = max(a, disp[0])
            b = min(b, disp[1])
            if not a < b:
                continue
            for k in range(cst.K):
                a_k = max(a, cst.inizio_blocco(k))
                b_k = min(b, cst.fine_blocco(k))
                if not a_k < b_k:
                    continue
                esiti = segmenti.costruisci(a_k, b_k, val, tol, riflesso=riflesso)
                per_blocco[k].extend(e.seg for e in esiti)
                for e in esiti:
                    errori.append(
                        {
                            "blocco": k,
                            "inizio": e.seg.inizio,
                            "fine": e.seg.fine,
                            "tipo": e.seg.tipo,
                            "h": e.seg.h,
                            "n": e.seg.n_campioni,
                            "errore_km": e.errore_max_km,
                            "rapporto": e.rapporto_max,
                        }
                    )
    for k in per_blocco:
        per_blocco[k].sort(key=lambda s: s.inizio)
    with open(cart / f"segmenti{suffisso(livello)}.pkl", "wb") as f:
        pickle.dump(per_blocco, f)

    # --- serie per intervallo (§ 8.7) ---
    # alle giunzioni tra sorgenti ε non scende sotto il salto misurato (A7)
    t_g = np.array([g["t"] for g in giunzioni if g["metrica"]])
    if t_g.size:
        e_g = np.array([g["metrica"] for g in giunzioni if g["metrica"]]) + _pavimento(t_g, livello)
        uno = np.ones(t_tutti.size + t_g.size, dtype=bool)
        log10, _, _ = aff.serie_nodi(np.concatenate([t_tutti, t_g]), np.concatenate([e_tutti, e_g]), uno, uno)
    # nella finestra: parte assoluta della tolleranza (500 km) vista dal Sole alla distanza minima dell'intervallo
    extra = pavimento_finestra([s for v in per_blocco.values() for s in v], nodi, livello)
    log10 = [
        x if x is None or e == 0.0 else ca.per_eccesso(math.log10(10.0**x + e))
        for x, e in zip(log10, extra, strict=True)
    ]
    coperti = [(s.inizio, s.fine) for v in per_blocco.values() for s in v]
    dati_nodi = [any(x0 < nodi[k + 1] and x1 > nodi[k] for x0, x1 in coperti) for k in range(aff.N_NODI)]
    rel = {"log10eps": log10, "formaDeterminata": [bool(x) for x in forma_nodi], "datiPresenti": dati_nodi}
    _salva_json(cart / f"affidabilita{suffisso(livello)}.json", rel)
    # --- fonti per intervallo ---
    fonti = _fonti(pezzi, regioni, giunzioni)
    _salva_json(cart / f"fonti{suffisso(livello)}.json", fonti)
    byte = sum(binio_byte(s) for v in per_blocco.values() for s in v)
    info.update(
        {
            "regioni": regioni,
            "byte": byte,
            "segmenti": sum(len(v) for v in per_blocco.values()),
            "salti_record": salti,
            "errori": errori,
            "livello": livello,
            "durata_s": time.time() - tic,
        }
    )
    _salva_json(cart / f"costruzione{suffisso(livello)}.json", info)
    return {k: info[k] for k in ("slug", "byte", "segmenti", "regioni", "durata_s")}


def binio_byte(s) -> int:
    from common import binio

    return binio.DIM_SEGMENTO + binio.allinea8(s.dati.nbytes)


def _cumula_bool(t: np.ndarray, v: np.ndarray, epoca: float) -> np.ndarray:
    """Forma determinata cumulata: falsa da un istante in poi, allontanandosi dall'epoca."""
    out = v.copy()
    ind = np.nonzero(t < epoca)[0][::-1]
    av = np.nonzero(t >= epoca)[0]
    for idx in (ind, av):
        if idx.size:
            out[idx] = np.logical_and.accumulate(v[idx])
    return out


def _regioni(nodi: np.ndarray, determinabile: np.ndarray) -> list[tuple[float, float]]:
    out = []
    k = 0
    while k < determinabile.size:
        if determinabile[k]:
            j = k
            while j + 1 < determinabile.size and determinabile[j + 1]:
                j += 1
            out.append((max(float(nodi[k]), cst.T0), min(float(nodi[j + 1]), cst.T_END)))
            k = j + 1
        else:
            k += 1
    return out


def _valutatore(src: Sorgenti, pezzi, ip: int, giunzioni, tol):
    """Stati dalla sorgente del pezzo; negli aloni oltre la disponibilità, dalla sorgente adiacente se il
    salto alla giunzione è trascurabile (≤ 0,1·tolleranza)."""
    p = pezzi[ip]
    disp = src.disponibile(p.chiave)
    vicini = []
    for j, lato in ((ip - 1, "prima"), (ip + 1, "dopo")):
        if 0 <= j < len(pezzi):
            g = giunzioni[min(ip, j)]
            if g["km"] is not None:
                t_g = g["t"]
                s = src.stati(pezzi[j].chiave, np.array([t_g])) if _copre(src, pezzi[j].chiave, t_g) else None
                if s is not None:
                    r = float(np.linalg.norm(s[0, :3]))
                    if g["km"] <= SOGLIA_CONTINUITA * float(tol(np.array([t_g]), np.array([r]))[0]):
                        vicini.append((lato, pezzi[j].chiave))

    def val(t: np.ndarray) -> np.ndarray:
        dentro = (t >= disp[0]) & (t <= disp[1])
        if np.all(dentro):
            return src.stati(p.chiave, t)
        out = np.empty((t.size, 6))
        if np.any(dentro):
            out[dentro] = src.stati(p.chiave, t[dentro])
        fuori = ~dentro
        for lato, chiave in vicini:
            m = fuori & ((t < disp[0]) if lato == "prima" else (t > disp[1]))
            if np.any(m):
                out[m] = src.stati(chiave, t[m])
                fuori &= ~m
        if np.any(fuori):
            raise segmenti.DatiNonDisponibili(p.chiave)
        return out

    return val


def _copre(src: Sorgenti, chiave: str, t: float) -> bool:
    try:
        a, b = src.disponibile(chiave)
    except FileNotFoundError:
        return False
    return a <= t <= b


def _sovrapposizione(src: Sorgenti, pezzi) -> dict | None:
    """ASSIST (dallo stato Horizons all'ancora) contro la sorgente Horizons tra il suo inizio e l'ancora."""
    for p1, p2 in zip(pezzi, pezzi[1:], strict=False):
        if p1.chiave != "assist:dati" or not p2.chiave.startswith(("spk:", "tab:")):
            continue
        t = np.linspace(p2.inizio, piano.ancora(p2.inizio), 51)
        try:
            a = src.stati("assist:dati", t)
            b = src.stati(p2.chiave, t)
        except (segmenti.DatiNonDisponibili, FileNotFoundError):
            return None
        d = np.linalg.norm(a[:, :3] - b[:, :3], axis=1)
        r = np.linalg.norm(b[:, :3], axis=1)
        m = aff.metrica(a, b[0])[:1]
        return {
            "inizio": float(t[0]),
            "ancora": float(t[-1]),
            "max_km": float(np.max(d)),
            "max_rel": float(np.max(d / r)),
            "all_inizio_km": float(d[0]),
            "metrica_all_inizio": float(m[0]),
        }
    return None


def _fonti(pezzi, regioni, giunzioni) -> list[dict]:
    out = []
    for i, p in enumerate(pezzi):
        for a_r, b_r in regioni:
            a = max(p.inizio, a_r)
            b = min(p.fine, b_r)
            if a < b:
                salto = giunzioni[i - 1]["km"] if i > 0 and a == p.inizio else None
                out.append(
                    {
                        "tipo": p.tipo,
                        "inizio": a,
                        "fine": b,
                        "descrizione": p.descrizione,
                        "varianti": list(p.varianti),
                        "saltoGiunzioneKm": None if salto is None else round(float(salto), 6),
                    }
                )
    return out


# --- comete a record ---


def _affidabilita_record(c: Corpo, recs: list[RecordCometa], pezzi, src: Sorgenti, cl: dict, epoca: float, cart: Path):
    """ε per istante delle comete a record: cloni della soluzione corrente nell'ultimo intervallo; negli intervalli
    dei record intermedi, rampa dal minimo all'apparizione ai salti misurati alle due giunzioni (_rampa_record);
    nell'intervallo del record più antico il salto con il successivo; prima, cloni del record più antico."""
    cambi = piano.tempi_cambio(recs)
    nodi = aff.nodi()
    # salti ai cambi: metrica tra le traiettorie dei due record all'istante di cambio
    salti = []
    for i, s in enumerate(cambi):
        k1 = _chiave_record(pezzi, recs[i].record, s, prima=True)
        k2 = _chiave_record(pezzi, recs[i + 1].record, s, prima=False)
        s1 = src.stati(k1, np.array([s]))[0]
        s2 = src.stati(k2, np.array([s]))[0]
        d = float(np.linalg.norm(s1[:3] - s2[:3]))
        salti.append(
            {
                "t": s,
                "da": recs[i].record,
                "a": recs[i + 1].record,
                "km": d,
                "rel": d / float(np.linalg.norm(s2[:3])),
                "metrica": _metrica_coppia(s1, s2),
                "forma": _forma_coppia(s1, s2, s),
            }
        )
    bordi = [cst.T0, *cambi, cst.T_END]
    t_out: list[float] = []
    e_out: list[float] = []
    f_out: list[bool] = []
    # ultimo record: cloni della soluzione corrente
    t_cl = cl["tempi"]
    e_cl = cumula_da_epoca(t_cl, cl["eps"], epoca)
    f_cl = np.array([aff.forma_determinata((cl["da"][k], cl["de"][k], cl["di"][k])) for k in range(t_cl.size)])
    f_cl = _cumula_bool(t_cl, f_cl, epoca)
    m = t_cl >= cambi[-1]
    j_ult = salti[-1]["metrica"]
    for t, e, f in zip(t_cl[m], e_cl[m], f_cl[m], strict=True):
        t_out.append(float(t))
        e_out.append(float(e))
        f_out.append(bool(f))
    t_out.append(cambi[-1])
    e_out.append(float(e_cl[m][0]) if np.any(m) else j_ult)
    f_out.append(True)
    # record intermedi: ε minimo all'apparizione (epoca del record), pari al minore dei salti alle due giunzioni,
    # e crescita lineare nel tempo fino al salto misurato a ciascuna giunzione; il più antico, con una sola
    # giunzione: salto con il record successivo in tutto l'intervallo
    medi = 0.5 * (nodi[:-1] + nodi[1:])
    for i in range(len(recs) - 1):
        a, b = bordi[i], bordi[i + 1]
        if i == 0:
            a = max(cst.T0, piano.afelio_precedente(recs[0]))
        f = salti[i]["forma"] and (i == 0 or salti[i - 1]["forma"])
        j_b = salti[i]["metrica"]
        j_a = salti[i - 1]["metrica"] if i > 0 else j_b
        t_ep = min(max(recs[i].epoca, a), b)
        tt, ee = _rampa_record(a, b, t_ep, j_a, j_b, nodi, medi)
        for t, e in zip(tt, ee, strict=True):
            t_out.append(float(t))
            e_out.append(float(e))
            f_out.append(bool(f))
    # prima del record più antico: cloni empirici, a partire dal livello del primo intervallo
    cr = dict(np.load(cart / "cloni-record.npz"))
    s0 = max(cst.T0, piano.afelio_precedente(recs[0]))
    base = salti[0]["metrica"]
    tr = cr["tempi"]
    mm = tr < s0
    if np.any(mm):
        idx = np.nonzero(mm)[0][::-1]
        valori = np.maximum(cr["eps"][idx], base)
        cum = aff.cumula(valori)
        forma = np.array([aff.forma_determinata((cr["da"][k], cr["de"][k], cr["di"][k])) for k in idx])
        forma = np.logical_and.accumulate(forma)
        for k, t in enumerate(tr[idx]):
            t_out.append(float(t))
            e_out.append(float(cum[k]))
            f_out.append(bool(forma[k]))
    return t_out, e_out, f_out, salti


def _rampa_record(
    a: float, b: float, t_ep: float, j_a: float, j_b: float, nodi: np.ndarray, medi: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Campioni di ε nell'intervallo [a, b) di un record: j_a alla giunzione a, j_b alla giunzione b, minimo
    min(j_a, j_b) all'epoca del record t_ep, lineare nel tempo tra questi punti; istanti: estremi, epoca, nodi e
    punti medi interni."""
    e_min = min(j_a, j_b)
    interni = np.concatenate([nodi[(nodi > a) & (nodi < b)], medi[(medi > a) & (medi < b)], [t_ep]])
    tt = np.unique(interni[(interni > a) & (interni < b - 1e-6)])
    ee = np.interp(tt, [a, t_ep, b], [j_a, e_min, j_b])
    return np.concatenate([[a], tt, [b - 1e-6]]), np.concatenate([[j_a], ee, [j_b]])


def _chiave_record(pezzi, record: int, t: float, prima: bool) -> str:
    """Chiave della sorgente del record al cambio t (lato del record, anche fuori dal suo intervallo)."""
    cand = [p for p in pezzi if p.record == record]
    for p in cand:
        if p.inizio <= t <= p.fine:
            return p.chiave
    # il cambio è subito fuori: si usa il pezzo più vicino dello stesso record
    cand.sort(key=lambda p: min(abs(p.inizio - t), abs(p.fine - t)))
    return cand[0].chiave if cand else f"assist:{record}"
