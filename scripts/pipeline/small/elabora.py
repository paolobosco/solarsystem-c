"""Elaborazione per corpo: cloni, varianti, traiettorie ASSIST (integra) e segmenti con affidabilità (segmenti).

Risultati intermedi in .cache/small/<slug>/; i passi successivi li rileggono senza ripetere le integrazioni.
"""

from __future__ import annotations

import json
import math
import time
import traceback
from pathlib import Path

import numpy as np

from common import constants as cst
from common.calendario import calendario_a_jd

from . import affidabilita as aff
from . import cloni, piano, sbdb, tabelle
from .anagrafica import CACHE, CACHE_ASSIST, Corpo, per_slug, piccoli_corpi
from .horizons import RecordCometa
from .integrazione import T_SPEGNI_ASTEROIDI, Configurazione
from .orbite import cometari_da_stato, stato_da_cometari

MU = cst.MU_PICCOLI_CORPI
MARGINE_TRAIETTORIA = 8192.0  # d: aloni dei segmenti fino al passo di 1024 d
PASSO_MINIMO_CLONI = 1e-4  # d (8,64 s): incontri quasi radenti dei cloni senza arresto di IAS15
DURATA_TEST_SB441 = cst.B * 2.0 + 7305.0  # oltre i 2000 anni tra T0 e JD -1 200 000,5
JD_MENO_2000 = calendario_a_jd(-2000, 1, 1, 0, 0, 0, "giuliano")
NOME_VARIANTE = {"ng": "senza-ng", "ast": "senza-asteroidi"}


def cartella(slug: str) -> Path:
    return CACHE / slug


def _salva_json(p: Path, d) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def contesto(c: Corpo) -> tuple[sbdb.RispostaSbdb, list[RecordCometa], list[piano.Pezzo]]:
    sb = sbdb.leggi(c)
    recs = piano.seleziona_record(piano.scarica_record(c, offline=True))
    if len(recs) < 2:
        recs = []
    return sb, recs, piano.piano(c, sb, recs)


def stato_record(r: RecordCometa) -> np.ndarray:
    d = math.pi / 180.0
    return stato_da_cometari(
        r.q_au * cst.UA_KM, r.e, r.inc_deg * d, r.nodo_deg * d, r.argperi_deg * d, r.tp, r.epoca, MU
    )[0]


def _g(gpar: dict | None) -> dict[str, float]:
    return dict(gpar) if gpar else dict(sbdb.G_STANDARD)


# --- Cloni ---


def esegui_cloni(
    amb,
    epoca: float,
    nominale: np.ndarray,
    ng_nom: np.ndarray,
    stati_cl: np.ndarray,
    ng_cl: np.ndarray,
    gpar: dict[str, float],
    asteroidi: bool,
    variante_ast: bool,
    t_min: float,
    t_max: float,
    aggiunta: callable = None,
    riferimento: callable = None,
) -> dict:
    """Integra nominale, nominale senza NG (se NG), cloni; variante senza asteroidi in parallelo.
    Con `riferimento` (stato di riferimento all'istante o None), la differenza tra il nominale ASSIST e il
    riferimento è un'altra variante di modello (sb441-n16 per gli asteroidi che vi compaiono).

    Si ferma, in ciascun verso, quando il valore cumulato supera 90°. Restituisce i campioni ordinati per
    tempo crescente: p95, varianti, scarti di forma, ε grezzo (prima della cumulazione).
    """
    con_ng = bool(np.any(ng_nom))
    part = [nominale[None]]
    ngs = [ng_nom[None]]
    if con_ng:
        part.append(nominale[None])
        ngs.append(np.zeros((1, 3)))
    k0 = len(part)
    part.append(stati_cl)
    ngs.append(ng_cl)
    stati0 = np.concatenate(part)
    ng = np.concatenate(ngs)
    conf = Configurazione(ng=ng if np.any(ng) else None, g=gpar, asteroidi=asteroidi, passo_minimo=PASSO_MINIMO_CLONI)
    conf_v = Configurazione(ng=ng_nom[None] if con_ng else None, g=gpar, asteroidi=False)
    from .integrazione import Propagatore

    indietro, avanti = aff.tempi_campionamento(epoca, t_min, t_max)
    righe = []
    for verso, tempi in ((-1.0, indietro), (1.0, avanti)):
        if tempi.size == 0:
            continue
        pr = Propagatore(amb, epoca, stati0, conf, verso)
        prv = Propagatore(amb, epoca, nominale[None], conf_v, verso) if variante_ast else None
        cum = 0.0
        for t in tempi:
            s = pr.a(float(t))
            m = aff.metrica(s[k0:], s[0])
            p95 = float(np.percentile(m, 95))
            v_ng = float(aff.metrica(s[1:2], s[0])[0]) if con_ng else 0.0
            v_ast = float(aff.metrica(prv.a(float(t)), s[0])[0]) if prv is not None else 0.0
            da, de, di = aff.forma_scarti(s[k0:], s[0], float(t), MU)
            extra = aggiunta(float(t)) if aggiunta is not None else 0.0
            rif = riferimento(float(t)) if riferimento is not None else None
            v_rif = float(aff.metrica(s[0:1], rif)[0]) if rif is not None else 0.0
            eps = p95 + max(v_ng, v_ast, v_rif) + extra
            righe.append((float(t), p95, v_ng, v_ast, extra, da, de, di, eps, v_rif))
            cum = max(cum, eps) if math.isfinite(eps) else math.inf
            if cum > aff.SOGLIA_NON_DETERMINABILE:
                break
    righe.sort()
    a = np.array(righe) if righe else np.zeros((0, 10))
    return {
        "tempi": a[:, 0],
        "p95": a[:, 1],
        "v_ng": a[:, 2],
        "v_ast": a[:, 3],
        "extra": a[:, 4],
        "da": a[:, 5],
        "de": a[:, 6],
        "di": a[:, 7],
        "eps": a[:, 8],
        "v_rif": a[:, 9],
        "epoca": np.array([epoca]),
        "n_cloni": np.array([stati_cl.shape[0]]),
    }


def stato_iniziale_dati(c: Corpo, sb, pezzi) -> tuple[float, np.ndarray]:
    """Stato della sorgente Horizons all'ancora (1650-01-01 per l'SPK dal 1600)."""
    from .scarica import percorso_spk
    from .sorgenti import ValutatoreSpk
    from .tabelle import ValutatoreTabella, percorso_npz

    p = pezzi[1]
    t = piano.ancora(p.inizio)
    v = ValutatoreTabella(percorso_npz(c)) if p.chiave.startswith("tab:") else ValutatoreSpk(percorso_spk(c.slug))
    return t, v.stati(np.array([t]))[0]


def inizio_dati(tempi: np.ndarray, eps_cum: np.ndarray, epoca: float) -> float:
    """Primo nodo dopo l'ultimo istante non determinabile prima dell'epoca (T0 se nessuno)."""
    m = (tempi < epoca) & ~(eps_cum <= aff.SOGLIA_NON_DETERMINABILE)
    if not np.any(m):
        return cst.T0
    tx = float(np.max(tempi[m]))
    n = aff.nodi()
    return float(n[np.searchsorted(n, tx, side="right")])


def cumula_da_epoca(tempi: np.ndarray, eps: np.ndarray, epoca: float) -> np.ndarray:
    out = np.empty_like(eps)
    ind = tempi < epoca
    av = ~ind
    if np.any(ind):
        idx = np.nonzero(ind)[0][::-1]
        out[idx] = aff.cumula(eps[idx])
    if np.any(av):
        idx = np.nonzero(av)[0]
        out[idx] = aff.cumula(eps[idx])
    return out


# --- Passo 'integra' ---


def integra_corpo(slug: str) -> dict:
    from .integrazione import Ambiente
    from .sorgenti import ValutatoreSb441, sb441_senza
    from .traiettoria import TraiettoriaAssist

    c = per_slug()[slug]
    sb, recs, pezzi = contesto(c)
    cart = cartella(slug)
    cart.mkdir(parents=True, exist_ok=True)
    piano.salva_piano(c, pezzi)
    info: dict = {"slug": slug, "inizio": time.time()}
    file_senza = None
    if c.in_sb441:
        file_senza = sb441_senza(c.naif_sb441, CACHE_ASSIST / f"sb441-n16-senza-{c.naif_sb441}.bsp")
        amb = Ambiente(file_senza)
    else:
        amb = Ambiente()
    try:
        orb = sb.orbita
        # la covarianza SBDB vale per gli elementi della sua epoca (covariance.epoch e covariance.elements, diversi da
        # quelli dell'orbita per gli asteroidi e i TNO): i cloni si campionano attorno a quel nominale e si integrano
        # da quell'epoca; la traiettoria dei dati parte dall'orbita (epoca standard)
        orb_cl = sbdb.orbita_covarianza(orb)
        n = cloni.n_cloni(orb, c.cometa)
        cl = cloni.campiona(orb_cl, n, cloni.SEME_CLONI + c.ssid, sb.grezzo)
        info["cloni"] = {
            "n": n,
            "covarianza": str(cl["origine"][0]),
            "seme": cloni.SEME_CLONI + c.ssid,
            "epoca": orb_cl.epoca,
            "epoca_orbita": orb.epoca,
        }
        nom = cloni.stato_nominale(orb, MU)
        nom_cl = cloni.stato_nominale(orb_cl, MU)
        st_cl = cloni.stati_cloni(orb_cl, cl, MU)
        if c.slug in tabelle.ADATTAMENTO_NG:
            # modello NG della soluzione non disponibile in ASSIST: parametri equivalenti adattati a Horizons
            adattati = tabelle.adatta_ng(c, amb)
            info["ng_adattati"] = {k: adattati[k] for k in ("parametri", "rms_km", "max_km")}
            orb.ng = {**orb.ng, **adattati["parametri"]}
            orb.g = dict(adattati["g"])
            for k, val in adattati["parametri"].items():
                cl[k] = np.full(n, val)
        ng_nom = np.array([orb.ng.get(k, 0.0) for k in ("A1", "A2", "A3")])
        t_min_cloni = cst.T0
        if recs:
            # la soluzione corrente vale solo nell'intervallo dell'ultimo record
            t_min_cloni = max(cst.T0, piano.tempi_cambio(recs)[-1] - aff.PASSO_NODI)
        aggiunta = None
        if c.in_sb441:
            sb_v = ValutatoreSb441(c.naif_sb441)
            s_sw = sb_v.stati(np.array([T_SPEGNI_ASTEROIDI]))[0]
            tau = np.arange(0.0, DURATA_TEST_SB441, 0.5 * aff.PASSO_NODI)[1:]
            tt = T_SPEGNI_ASTEROIDI + tau
            tic = time.time()
            from .integrazione import integra_array

            traj = integra_array(amb, T_SPEGNI_ASTEROIDI, s_sw[None], Configurazione(asteroidi=False), tt)[:, 0]
            rif = sb_v.stati(tt)
            d = np.array([aff.metrica(traj[k][None], rif[k])[0] for k in range(tt.size)])
            dcum = np.maximum.accumulate(d)
            np.savez(cart / "sb441-avanti.npz", tau=tau, metrica=d)
            info["sb441_avanti_s"] = time.time() - tic

            def aggiunta(t: float, tau=tau, dcum=dcum) -> float:
                if t >= T_SPEGNI_ASTEROIDI:
                    return 0.0
                return float(
                    np.interp(T_SPEGNI_ASTEROIDI - t, np.concatenate([[0.0], tau]), np.concatenate([[0.0], dcum]))
                )

        riferimento = None
        if c.in_sb441:

            def riferimento(t: float, v=sb_v) -> np.ndarray | None:
                if t < v.disponibile[0] or t > v.disponibile[1]:
                    return None
                return v.stati(np.array([t]))[0]

        tic = time.time()
        res = esegui_cloni(
            amb,
            orb_cl.epoca,
            nom_cl,
            ng_nom,
            st_cl,
            cloni.ng_cloni(cl),
            orb.g,
            True,
            not c.in_sb441,
            t_min_cloni,
            cst.T_END,
            aggiunta,
            riferimento,
        )
        if not c.in_sb441 and res["tempi"].size:
            # termine aggiuntivo prima di -7999: variante senza asteroidi alla stessa distanza dall'epoca
            t = res["tempi"]
            pre = t < T_SPEGNI_ASTEROIDI
            if np.any(pre):
                ind = t < orb_cl.epoca
                tdist = orb_cl.epoca - t[ind]
                vcum = np.maximum.accumulate(res["v_ast"][ind][::-1])[::-1]
                ord_ = np.argsort(tdist)
                for k in np.nonzero(pre)[0]:
                    res["extra"][k] = float(np.interp(T_SPEGNI_ASTEROIDI - t[k], tdist[ord_], vcum[ord_]))
                    var = max(res["v_ng"][k], res["v_ast"][k], res["v_rif"][k])
                    res["eps"][k] = res["p95"][k] + var + res["extra"][k]
        np.savez(cart / "cloni.npz", **res)
        info["cloni_s"] = time.time() - tic
        eps_cum = cumula_da_epoca(res["tempi"], res["eps"], orb_cl.epoca)
        t_dati = inizio_dati(res["tempi"], eps_cum, orb_cl.epoca)
        if recs:
            t_dati = cst.T0  # per le comete a record lo decide l'estensione del record più antico
        info["inizio_dati_soluzione"] = t_dati

        # traiettorie ASSIST dei dati
        tic = time.time()
        trajdir = cart / "traiettorie"
        trajdir.mkdir(exist_ok=True)
        conf_nom = Configurazione(ng=ng_nom[None] if np.any(ng_nom) else None, g=orb.g, asteroidi=True)
        if c.in_sb441:
            if t_dati < T_SPEGNI_ASTEROIDI:
                tr = TraiettoriaAssist.calcola(
                    amb,
                    T_SPEGNI_ASTEROIDI,
                    s_sw,
                    Configurazione(asteroidi=False),
                    max(cst.T0 - MARGINE_TRAIETTORIA, t_dati - MARGINE_TRAIETTORIA),
                    T_SPEGNI_ASTEROIDI + MARGINE_TRAIETTORIA,
                )
                tr.salva(trajdir / "sb441.npz")
        elif pezzi[0].fine >= cst.T_END:
            # oggetto senza SPK Horizons: ASSIST dalla soluzione all'epoca su tutto l'intervallo
            tr = TraiettoriaAssist.calcola(
                amb,
                orb.epoca,
                nom,
                conf_nom,
                max(cst.T0 - MARGINE_TRAIETTORIA, t_dati - MARGINE_TRAIETTORIA),
                cst.T_END + MARGINE_TRAIETTORIA,
                nodi_extra=np.array([piano.JD_1600]),
            )
            tr.salva(trajdir / "dati.npz")
        elif not recs:
            if t_dati < pezzi[1].inizio:
                t1650, s1650 = stato_iniziale_dati(c, sb, pezzi)
                tr = TraiettoriaAssist.calcola(
                    amb,
                    t1650,
                    s1650,
                    conf_nom,
                    max(cst.T0 - MARGINE_TRAIETTORIA, t_dati - MARGINE_TRAIETTORIA),
                    t1650,
                    nodi_extra=np.array([pezzi[1].inizio]),
                )
                tr.salva(trajdir / "dati.npz")
        else:
            info["record"] = integra_record(amb, c, recs, pezzi, trajdir, info)
        info["traiettorie_s"] = time.time() - tic
    finally:
        del amb
        if file_senza is not None and file_senza.exists():
            file_senza.unlink()
    info["fine"] = time.time()
    _salva_json(cart / "integrazione.json", info)
    return info


def integra_record(amb, c: Corpo, recs: list[RecordCometa], pezzi, trajdir: Path, info: dict) -> dict:
    """Traiettorie ASSIST dei record (pezzi prima del 1600 e loro margini) e cloni del record più antico."""
    from .traiettoria import TraiettoriaAssist

    cambi = piano.tempi_cambio(recs)
    bordi = [cst.T0, *cambi, cst.T_END]
    out: dict = {"cambi": cambi, "record": [r.record for r in recs]}
    r0 = recs[0]
    # cloni del record più antico: covarianza empirica dal confronto con il record successivo
    r1 = recs[1]
    s1 = stato_record(r1)
    conf1 = Configurazione(
        ng=np.array([[r1.ng.get(k, 0.0) for k in ("A1", "A2", "A3")]]) if r1.ha_ng else None,
        g=_g(r1.g),
        asteroidi=True,
    )
    from .integrazione import integra_array

    s1_a_r0 = integra_array(amb, r1.epoca, s1[None], conf1, np.array([r0.epoca]))[0, 0]
    el = cometari_da_stato(s1_a_r0[None], r0.epoca, MU)
    d = math.degrees
    diff = {
        "q": abs(el["q"][0] / cst.UA_KM - r0.q_au),
        "e": abs(el["e"][0] - r0.e),
        "tp": abs(el["tp"][0] - r0.tp),
        "node": abs((d(el["nodo"][0]) - r0.nodo_deg + 180.0) % 360.0 - 180.0),
        "peri": abs((d(el["argperi"][0]) - r0.argperi_deg + 180.0) % 360.0 - 180.0),
        "i": abs(d(el["i"][0]) - r0.inc_deg),
    }
    testo = _testi_record(c, r0)
    sig = {k: max(diff[k], sbdb.mezza_ultima_cifra(testo[k])) for k in diff}
    out["sigma_empirici"] = sig
    out["differenze_r1_r0"] = diff
    rng = np.random.default_rng(cloni.SEME_CLONI + 1000 + c.ssid)
    n = cloni.N_CLONI_CAOTICI
    z = rng.standard_normal((n, 6))
    dd = math.pi / 180.0
    st_cl = stato_da_cometari(
        (r0.q_au + sig["q"] * z[:, 1]) * cst.UA_KM,
        r0.e + sig["e"] * z[:, 0],
        (r0.inc_deg + sig["i"] * z[:, 5]) * dd,
        (r0.nodo_deg + sig["node"] * z[:, 3]) * dd,
        (r0.argperi_deg + sig["peri"] * z[:, 4]) * dd,
        r0.tp + sig["tp"] * z[:, 2],
        r0.epoca,
        MU,
    )
    ng0 = np.array([r0.ng.get(k, 0.0) for k in ("A1", "A2", "A3")])
    tic = time.time()
    res = esegui_cloni(
        amb,
        r0.epoca,
        stato_record(r0),
        ng0,
        st_cl,
        np.tile(ng0, (n, 1)),
        _g(r0.g),
        True,
        True,
        cst.T0,
        r0.epoca,
        None,
    )
    np.savez(trajdir.parent / "cloni-record.npz", **res)
    out["cloni_record_s"] = time.time() - tic
    eps_cum = cumula_da_epoca(res["tempi"], res["eps"], r0.epoca)
    t_dati = inizio_dati(res["tempi"], eps_cum, r0.epoca)
    out["inizio_dati"] = t_dati
    for i, r in enumerate(recs):
        chiave = f"assist:{r.record}"
        usati = [p for p in pezzi if p.chiave == chiave]
        a = bordi[i] if i > 0 else max(cst.T0, t_dati)
        b = bordi[i + 1]
        if i == 1:
            a = min(a, r0.epoca - 1.0)
        if not usati and i != 1:
            continue
        if not usati and b > piano.JD_1600 + MARGINE_TRAIETTORIA and i == 1:
            b = max(r.epoca, a) + 1.0
        conf = Configurazione(
            ng=np.array([[r.ng.get(k, 0.0) for k in ("A1", "A2", "A3")]]) if r.ha_ng else None,
            g=_g(r.g),
            asteroidi=True,
        )
        t_min = max(cst.T0 - MARGINE_TRAIETTORIA, a - MARGINE_TRAIETTORIA)
        t_max = min(cst.T_END + MARGINE_TRAIETTORIA, b + MARGINE_TRAIETTORIA)
        if usati and any(p.fine == piano.JD_1600 for p in usati):
            t_max = max(t_max, piano.JD_1600 + MARGINE_TRAIETTORIA)
        extra = np.array([x for x in (piano.JD_1600, *cambi) if t_min < x < t_max])
        tr = TraiettoriaAssist.calcola(amb, r.epoca, stato_record(r), conf, t_min, t_max, extra)
        tr.salva(trajdir / f"{r.record}.npz")
    return out


def _testi_record(c: Corpo, r: RecordCometa) -> dict[str, str]:
    """Valori come stampati da Horizons (per le cifre significative)."""
    import re

    testo = piano.percorso_record(c, r.record).read_text(encoding="utf-8").split("Comet physical")[0]
    out = {}
    for k, chiave in (("e", "EC"), ("q", "QR"), ("tp", "TP"), ("node", "OM"), ("peri", "W"), ("i", "IN")):
        m = re.search(r"(?<![A-Za-z0-9])" + chiave + r"\s*=\s*([-+0-9.Ee]+)", testo)
        out[k] = m.group(1) if m else "0.5"
    return out


def _esegui_sicuro(funzione, slug: str):
    try:
        return funzione(slug)
    except Exception:
        traceback.print_exc()
        return {"slug": slug, "errore": traceback.format_exc()}


def integra_tutti(slug: list[str] | None, processi: int = 2) -> None:
    corpi = [c.slug for c in piccoli_corpi() if slug is None or c.slug in slug]
    if processi <= 1 or len(corpi) == 1:
        for s in corpi:
            print(json.dumps(_esegui_sicuro(integra_corpo, s), default=str)[:400], flush=True)
        return
    from concurrent.futures import ProcessPoolExecutor
    from functools import partial

    with ProcessPoolExecutor(max_workers=processi) as ex:
        for r in ex.map(partial(_esegui_sicuro, integra_corpo), corpi):
            print(json.dumps(r, default=str)[:400], flush=True)


def segmenti_tutti(slug: list[str] | None, livello: int = 0, processi: int = 2) -> None:
    from .costruzione import segmenti_corpo

    corpi = [c.slug for c in piccoli_corpi() if slug is None or c.slug in slug]
    from functools import partial

    f = partial(segmenti_corpo, livello=livello)
    if processi <= 1 or len(corpi) == 1:
        for s in corpi:
            print(json.dumps(_esegui_sicuro(f, s), default=str)[:400], flush=True)
        return
    from concurrent.futures import ProcessPoolExecutor

    with ProcessPoolExecutor(max_workers=processi) as ex:
        for r in ex.map(partial(_esegui_sicuro, f), corpi):
            print(json.dumps(r, default=str)[:400], flush=True)
