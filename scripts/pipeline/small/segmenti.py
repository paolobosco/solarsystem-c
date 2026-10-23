"""Segmenti E e C dei piccoli corpi (§ 7.6.3) per un intervallo a sorgente unica.

- E: residui Float32 degli elementi equinoziali, Lagrange a 8 punti; ammesso se e ≤ 0,98, orbita
  ellittica e r ≤ 50 UA in tutti i campioni dello stencil.
- C: posizione e velocità Float64, Hermite cubica; negli altri casi.

Passo: potenza di 2 tra 1/64 d e 1024 d. Le griglie sono allineate a T0 (nodi T0 + m·h), quindi
l'errore d'interpolazione in un istante dipende solo dal passo: si determina per ogni cella della
griglia il passo più grande che rispetta la tolleranza nel punto medio della cella, dimezzando il
passo solo dove serve. La suddivisione in segmenti minimizza poi la dimensione (programmazione
dinamica sui tratti a passo uniforme). Ogni segmento è infine verificato nei punti medi.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from common import binio
from common import constants as cst
from common.equinoctial import elementi_da_stato, lambda_continua, stato_da_elementi
from common.interp import griglia, hermite_cubica, lagrange8

PASSI = tuple(sorted(binio.PASSI_AMMESSI, reverse=True))
E_MAX = 0.98
R_MAX_KM = 50.0 * cst.UA_KM
MU = cst.MU_PICCOLI_CORPI
BYTE_E = 24
BYTE_C = 48
ALONI = {binio.SEG_E: 8, binio.SEG_C: 2}  # campioni oltre il nucleo (4 + 3 + 1 per E, 1 + 1 per C)
MAX_TRATTI_DP = 400


# Con costruisci(..., riflesso=True) gli elementi E si calcolano dalla posizione eliocentrica e dalla
# velocità eliocentrica più w(r) volte la velocità baricentrica del Sole dovuta ai pianeti interni
# (≤ 0,2 m/s), con w = 0 entro 2 UA e w = 1 oltre 4 UA. Gli elementi riproducono la posizione
# eliocentrica ai nodi; lontano dal Sole sparisce l'oscillazione annua e semestrale degli elementi
# osculanti dovuta al moto riflesso del Sole e il passo ammesso cresce. La velocità restituita dai
# segmenti E include questa correzione.
_RIFLESSO = False
R_RIFLESSO_0 = 2.0 * cst.UA_KM
R_RIFLESSO_1 = 4.0 * cst.UA_KM
# Scelta tra E e C nei tratti a passo E piccolo (perieli stretti): C se costa meno.
SCELTA_C = True
PASSO_E_CONFRONTO = 16.0
# Accettazione: errore nei punti di verifica ≤ 0,9 volte la tolleranza (l'errore massimo nella cella
# non cade sempre nei punti verificati).
MARGINE_VERIFICA = 0.9
SCOSTAMENTI_PERIELIO = (-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0)  # in unità di q/v_q
PENALITA_C = binio.DIM_SEGMENTO + ALONI[binio.SEG_E] * BYTE_E  # segmento E in più e suoi aloni (byte)
_DE441 = None


def riflesso_interni(t: np.ndarray) -> np.ndarray:
    """Velocità baricentrica approssimata del Sole dovuta a Mercurio, Venere, Terra-Luna e Marte (km/s)."""
    global _DE441
    if _DE441 is None:
        from common.de441 import De441

        _DE441 = De441()
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    gm_tot = cst.GM_SOLE + sum(cst.GM_BARICENTRI.values())
    out = np.zeros((tt.size, 3))
    for i in (1, 2, 3, 4):
        out -= cst.GM_BARICENTRI[i] / gm_tot * _DE441.stato_eliocentrico(i, tt)[:, 3:]
    return out


def peso_riflesso(r_km: np.ndarray) -> np.ndarray:
    """Peso della correzione: 0 entro R_RIFLESSO_0, 1 oltre R_RIFLESSO_1, raccordo C¹ tra i due."""
    x = np.clip((np.asarray(r_km) - R_RIFLESSO_0) / (R_RIFLESSO_1 - R_RIFLESSO_0), 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def stati_per_elementi(t: np.ndarray, stati: np.ndarray) -> np.ndarray:
    """Stati da cui si calcolano gli elementi E (posizione invariata)."""
    if not _RIFLESSO:
        return stati
    out = np.array(stati, dtype=np.float64, copy=True)
    w = peso_riflesso(np.linalg.norm(out[:, :3], axis=1))
    if np.any(w > 0.0):
        out[:, 3:] += w[:, None] * riflesso_interni(t)
    return out


class DatiNonDisponibili(ValueError):
    """La sorgente non copre gli istanti richiesti (aloni)."""


Valutatore = Callable[[np.ndarray], np.ndarray]  # t (n,) -> stati (n, 6) km, km/s
Tolleranza = Callable[[np.ndarray, np.ndarray], np.ndarray]  # (t, r) -> km


@dataclass
class Esito:
    seg: binio.Segmento
    errore_max_km: float
    rapporto_max: float  # errore/tolleranza massimo

    @property
    def byte(self) -> int:
        return binio.DIM_SEGMENTO + binio.allinea8(self.seg.dati.nbytes)


class Memoria:
    """Valutatore con memoria degli istanti già calcolati (gli istanti diadici sono esatti)."""

    def __init__(self, val: Valutatore) -> None:
        self.val = val
        self._d: dict[float, np.ndarray] = {}

    def __call__(self, t: np.ndarray) -> np.ndarray:
        tl = np.asarray(t, dtype=np.float64).tolist()
        mancanti = sorted({x for x in tl if x not in self._d})
        if mancanti:
            s = self.val(np.array(mancanti))
            for x, y in zip(mancanti, s, strict=True):
                self._d[x] = y
        return np.array([self._d[x] for x in tl]).reshape(len(tl), 6)


def _e_ammessi(st: np.ndarray) -> np.ndarray:
    r = np.linalg.norm(st[:, :3], axis=1)
    hv = np.cross(st[:, :3], st[:, 3:])
    ev = np.cross(st[:, 3:], hv) / MU - st[:, :3] / r[:, None]
    e = np.linalg.norm(ev, axis=1)
    energia = 0.5 * np.sum(st[:, 3:] ** 2, axis=1) - MU / r
    return (r <= R_MAX_KM) & (e <= E_MAX) & (energia < 0)


def _celle(a: float, b: float, h: float) -> tuple[int, int, np.ndarray, np.ndarray]:
    j0 = math.floor((a - cst.T0) / h)
    j1 = math.ceil((b - cst.T0) / h)
    c0 = np.maximum(cst.T0 + h * np.arange(j0, j1), a)
    c1 = np.minimum(cst.T0 + h * np.arange(j0 + 1, j1 + 1), b)
    v = c1 > c0
    return j0, j1, c0[v], c1[v]


def _valuta_parziale(val: Valutatore, t: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Stati e maschera di disponibilità; la sorgente copre un intervallo contiguo, quindi gli
    istanti non disponibili stanno solo ai bordi (aloni)."""
    try:
        return val(t), np.ones(t.size, dtype=bool)
    except DatiNonDisponibili:
        pass

    def disponibile(i: int) -> bool:
        try:
            val(t[i : i + 1])
            return True
        except DatiNonDisponibili:
            return False

    n = t.size
    # primo indice disponibile (ricerca esponenziale e binaria dall'inizio)
    i0 = None
    passo = 1
    k = 0
    while k < n:
        if disponibile(k):
            lo, hi = max(0, k - passo // 2 - 1), k
            while lo < hi:
                m = (lo + hi) // 2
                if disponibile(m):
                    hi = m
                else:
                    lo = m + 1
            i0 = lo
            break
        k += passo
        passo *= 2
    out = np.full((n, 6), np.nan)
    maschera = np.zeros(n, dtype=bool)
    if i0 is None:
        return out, maschera
    lo, hi = i0, n - 1
    while lo < hi:
        m = (lo + hi + 1) // 2
        if disponibile(m):
            lo = m
        else:
            hi = m - 1
    i1 = lo
    out[i0 : i1 + 1] = val(t[i0 : i1 + 1])
    maschera[i0 : i1 + 1] = True
    return out, maschera


def errore_float32(el: np.ndarray, fi: np.ndarray) -> np.ndarray:
    """Spostamento di posizione (km) dovuto all'arrotondamento Float32 di h, k, p, q (mezza unità
    dell'ultima cifra, contributi sommati), per ogni riga di elementi [a, h, k, p, q, λ]."""
    base = stato_da_elementi(el, MU, fi.astype(np.float64))[:, :3]
    tot = np.zeros(el.shape[0])
    for j in range(1, 5):
        d = el.copy()
        d[:, j] += 0.5 * np.spacing(np.abs(el[:, j]).astype(np.float32)).astype(np.float64)
        tot += np.linalg.norm(stato_da_elementi(d, MU, fi.astype(np.float64))[:, :3] - base, axis=1)
    return tot


def punti_perielio(
    t_nodi: np.ndarray, st_nodi: np.ndarray, c0: np.ndarray, c1: np.ndarray, h: float
) -> tuple[np.ndarray, np.ndarray]:
    """Istanti di verifica ai perieli che cadono nelle celle [c0, c1) quando il passaggio al perielio
    (durata q/v_q) è breve rispetto al passo: perielio previsto dagli elementi osculanti del nodo più
    vicino e due istanti a ±q/(2·v_q). Restituisce (istanti, indice della cella)."""
    from .orbite import cometari_da_stato

    tm = 0.5 * (c0 + c1)
    k = np.clip(np.searchsorted(t_nodi, tm), 0, t_nodi.size - 1)
    el = cometari_da_stato(st_nodi[k], t_nodi[k], MU)
    q, e, tp, n = el["q"], el["e"], el["tp"], el["n"]
    vq = np.sqrt(MU * (1.0 + e) / q)
    durata = q / vq / cst.GIORNO_S
    tt: list[float] = []
    ii: list[int] = []
    for i in np.nonzero(np.isfinite(durata) & (durata < 0.5 * h))[0]:
        if e[i] < 1.0 and n[i] > 0:
            per = 2.0 * math.pi / n[i]
            kk = np.arange(math.floor((c0[i] - tp[i]) / per), math.ceil((c1[i] - tp[i]) / per) + 1)
            cand = tp[i] + kk * per
        else:
            cand = np.array([tp[i]])
        for x in cand:
            for f in SCOSTAMENTI_PERIELIO:
                y = x + f * durata[i]
                if c0[i] <= y < c1[i]:
                    tt.append(float(y))
                    ii.append(int(i))
    return np.array(tt, dtype=np.float64), np.array(ii, dtype=np.int64)


def punti_verifica(
    t_nodi: np.ndarray, st_nodi: np.ndarray, c0: np.ndarray, c1: np.ndarray, h: float
) -> tuple[np.ndarray, np.ndarray]:
    """Istanti di verifica oltre ai punti medi delle celle: nelle celle tagliate dai bordi, il punto
    della cella più vicino al centro dell'intervallo di griglia (dove l'errore è massimo); ai perieli
    stretti, i punti di punti_perielio. Restituisce (istanti, indice della cella)."""
    centro = cst.T0 + (np.floor((c0 - cst.T0) / h) + 0.5) * h
    delta = 1e-6 * (c1 - c0)
    tc = np.clip(centro, c0 + delta, c1 - delta)
    tagliate = np.nonzero(np.abs(tc - 0.5 * (c0 + c1)) > delta)[0]
    tp, ip = punti_perielio(t_nodi, st_nodi, c0, c1, h)
    return np.concatenate([tc[tagliate], tp]), np.concatenate([tagliate, ip]).astype(np.int64)


def _celle_livello(
    a: float, b: float, h: float, tipo: int, val: Valutatore, tol: Tolleranza
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Celle [c0, c1) della griglia di passo h in [a, b), esito (True se il passo h rispetta la
    tolleranza nel punto medio della cella) e inammissibilità di E (stato iperbolico, e > 0,98 o
    r > 50 UA nel punto medio: inutile ridurre il passo). Le celle con stencil fuori dalla sorgente
    falliscono a quel passo (e si riprovano con il passo dimezzato)."""
    j0, j1, c0, c1 = _celle(a, b, h)
    ok = np.zeros(c0.size, dtype=bool)
    no_e = np.zeros(c0.size, dtype=bool)
    alone = 4 if tipo == binio.SEG_E else 1
    nodi = cst.T0 + h * np.arange(j0 - alone, j1 + alone + 1)
    tm = 0.5 * (c0 + c1)
    vero, disp_m = _valuta_parziale(val, tm)
    if not np.any(disp_m):
        return c0, c1, ok, no_e
    if tipo == binio.SEG_E:
        no_e = disp_m & ~_e_ammessi(np.where(disp_m[:, None], vero, vero[int(np.argmax(disp_m))]))
        if np.all(no_e | ~disp_m):
            return c0, c1, ok, no_e
    st, disp_n = _valuta_parziale(val, nodi)
    if not np.any(disp_n):
        return c0, c1, ok, no_e
    st = np.where(disp_n[:, None], st, st[int(np.argmax(disp_n))])
    jl = np.clip(np.floor((tm - nodi[0]) / h).astype(np.int64), alone - 1, nodi.size - alone - 1)
    stencil = range(-3, 5) if tipo == binio.SEG_E else range(0, 2)
    amm = disp_m.copy()
    for d in stencil:
        amm &= disp_n[jl + d]
    if tipo == binio.SEG_E:
        ammn = _e_ammessi(st)
        for d in range(-3, 5):
            amm &= ammn[jl + d]
        if not np.any(amm):
            return c0, c1, ok, no_e
        sost = np.where(ammn[:, None], st, st[int(np.argmax(ammn))])
        el, fi = elementi_da_stato(stati_per_elementi(nodi, sost), MU)
        for d in range(-3, 5):
            amm &= fi[jl + d] == fi[jl]
        el[:, 5] = lambda_continua(nodi, el[:, 5], el[:, 0], MU, cst.GIORNO_S)
        # h, k, p, q sono memorizzati in Float32 come valori assoluti: con e vicino a 1 o lontano dal
        # Sole l'arrotondamento sposta il corpo di centinaia di km (Halley al perielio, 109P a 29 UA).
        # E non è ammesso dove la stima di quell'errore supera metà della tolleranza.
        quant = errore_float32(el, fi)
        lim_n = tol(nodi, np.linalg.norm(st[:, :3], axis=1))
        q_ok = quant <= 0.5 * lim_n
        for d in range(-3, 5):
            no_e |= amm & ~q_ok[jl + d]
            amm &= q_ok[jl + d]
        el[:, 1:5] = el[:, 1:5].astype(np.float32).astype(np.float64)
        stima_el = lagrange8(tm, nodi[0], h, el)
        stima = stato_da_elementi(stima_el, MU, fi[jl].astype(np.float64))
    else:
        pos, vel = hermite_cubica(tm, nodi[0], h, st[:, :3], st[:, 3:] * cst.GIORNO_S)
        stima = np.concatenate([pos, vel / cst.GIORNO_S], axis=1)
    err = np.linalg.norm(stima[:, :3] - vero[:, :3], axis=1)
    lim = tol(tm, np.linalg.norm(vero[:, :3], axis=1))
    ok = amm & np.isfinite(err) & (err <= MARGINE_VERIFICA * lim)
    # celle tagliate e perieli stretti: verifica anche lì
    te, ie = punti_verifica(nodi, st, c0, c1, h)
    sel = ok[ie] if ie.size else ie.astype(bool)
    if np.any(sel):
        te, ie = te[sel], ie[sel]
        vero_e, disp_e = _valuta_parziale(val, te)
        if tipo == binio.SEG_E:
            stima_e = stato_da_elementi(lagrange8(te, nodi[0], h, el), MU, fi[jl[ie]].astype(np.float64))
        else:
            pe, _ = hermite_cubica(te, nodi[0], h, st[:, :3], st[:, 3:] * cst.GIORNO_S)
            stima_e = np.concatenate([pe, np.zeros_like(pe)], axis=1)
        err_e = np.linalg.norm(stima_e[:, :3] - vero_e[:, :3], axis=1)
        lim_e = tol(te, np.linalg.norm(vero_e[:, :3], axis=1))
        cattivi = disp_e & ~(np.isfinite(err_e) & (err_e <= MARGINE_VERIFICA * lim_e))
        ok[ie[cattivi]] = False
    return c0, c1, ok, no_e


def passi_locali(a: float, b: float, tipo: int, val: Valutatore, tol: Tolleranza) -> list[tuple[float, float, float]]:
    """Celle (inizio, fine, passo) che coprono [a, b) con il passo più grande ammesso; passo 0 se nessuno."""
    regioni = [(a, b)]
    out: list[tuple[float, float, float]] = []
    for h in PASSI:
        if not regioni:
            break
        nuove: list[tuple[float, float]] = []
        for ra, rb in regioni:
            c0, c1, ok, no_e = _celle_livello(ra, rb, h, tipo, val, tol)
            for x0, x1, k, ne in zip(c0.tolist(), c1.tolist(), ok.tolist(), no_e.tolist(), strict=True):
                if k:
                    out.append((x0, x1, h))
                elif ne:
                    out.append((x0, x1, 0.0))
                elif nuove and nuove[-1][1] == x0:
                    nuove[-1] = (nuove[-1][0], x1)
                else:
                    nuove.append((x0, x1))
        regioni = nuove
    out.extend((ra, rb, 0.0) for ra, rb in regioni)
    out.sort()
    # celle contigue senza passo E: un solo intervallo per l'analisi C
    unite: list[tuple[float, float, float]] = []
    for x in out:
        if unite and x[2] == 0.0 and unite[-1][2] == 0.0 and unite[-1][1] == x[0]:
            unite[-1] = (unite[-1][0], x[1], 0.0)
        else:
            unite.append(x)
    return unite


def _tratti(celle: list[tuple[float, float, float, int]]) -> list[tuple[float, float, float, int]]:
    """Unisce celle contigue con stesso passo e tipo."""
    out: list[list] = []
    for c in celle:
        if out and out[-1][1] == c[0] and out[-1][2] == c[2] and out[-1][3] == c[3]:
            out[-1][1] = c[1]
        else:
            out.append(list(c))
    return [tuple(x) for x in out]  # type: ignore[misc]


def _costo(durata: float, h: float, tipo: int) -> float:
    n = math.ceil(durata / h) + ALONI[tipo]
    return binio.DIM_SEGMENTO + 4 + n * (BYTE_E if tipo == binio.SEG_E else BYTE_C)


def partizione(tratti: list[tuple[float, float, float, int]]) -> list[tuple[float, float, float, int]]:
    """Programmazione dinamica: segmenti (inizio, fine, passo, tipo) di dimensione totale minima.

    Un segmento copre tratti consecutivi dello stesso tipo con il passo minimo tra quelli dei tratti.
    """
    n = len(tratti)
    migl = [0.0] + [math.inf] * n
    scelta = [-1] * (n + 1)
    for j in range(1, n + 1):
        hmin = math.inf
        tipo = tratti[j - 1][3]
        for i in range(j, max(0, j - MAX_TRATTI_DP), -1):
            t = tratti[i - 1]
            if t[3] != tipo:
                break
            hmin = min(hmin, t[2])
            c = migl[i - 1] + _costo(tratti[j - 1][1] - t[0], hmin, tipo)
            if c < migl[j]:
                migl[j] = c
                scelta[j] = i - 1
    out = []
    j = n
    while j > 0:
        i = scelta[j]
        hmin = min(t[2] for t in tratti[i:j])
        out.append((tratti[i][0], tratti[j - 1][1], hmin, tratti[i][3]))
        j = i
    out.reverse()
    return out


def _stati_c(val: Valutatore, tp: float, h: float, n: int) -> np.ndarray:
    """Campioni di un segmento C. L'alone sinistro non entra nell'interpolazione del nucleo (Hermite tra
    i campioni j e j+1 con j ≥ 1): se la sorgente non lo copre, estrapolazione lineare dal campione 1."""
    t = tp + h * np.arange(n)
    try:
        return val(t)
    except DatiNonDisponibili:
        interni = val(t[1:])
    alone = interni[0].copy()
    alone[:3] -= interni[0, 3:] * h * cst.GIORNO_S
    return np.concatenate([alone[None], interni])


def crea(
    a: float, b: float, h: float, tipo: int, val: Valutatore, tol: Tolleranza, forza: bool = False
) -> Esito | None:
    """Segmento verificato nei punti medi delle celle del nucleo; None se non rispetta la tolleranza
    (con `forza`, solo se mancano i dati: l'errore misurato resta nell'esito)."""
    try:
        if tipo == binio.SEG_E:
            tp, n = griglia(a, b, h, *binio.ALONI_E, cst.T0)
            tn = tp + h * np.arange(n)
            sn = val(tn)
            seg = binio.segmento_e_da_stati(tp, h, a, b, stati_per_elementi(tn, sn), MU)
        else:
            tp, n = griglia(a, b, h, *binio.ALONI_C, cst.T0)
            tn = tp + h * np.arange(n)
            sn = _stati_c(val, tp, h, n)
            seg = binio.segmento_c_da_stati(tp, h, a, b, sn)
    except (DatiNonDisponibili, ValueError):
        return None
    _, _, c0, c1 = _celle(a, b, h)
    te, _ = punti_verifica(tn, sn, c0, c1, h)
    tv = np.sort(np.concatenate([0.5 * (c0 + c1), te]))
    try:
        vero = val(tv)
    except DatiNonDisponibili:
        return None
    stima = binio.valuta_segmento(seg, tv)
    err = np.linalg.norm(stima[:, :3] - vero[:, :3], axis=1)
    rapp = err / tol(tv, np.linalg.norm(vero[:, :3], axis=1))
    if not np.all(np.isfinite(rapp)) or (np.max(rapp) > MARGINE_VERIFICA and not forza):
        return None
    return Esito(seg, float(np.max(err)), float(np.max(rapp)))


def _crea_robusto(a: float, b: float, h: float, tipo: int, val, tol, prof: int = 0) -> list[Esito]:
    """Crea il segmento; se fallisce (λ, fattore I, Float32, aloni) divide a metà o dimezza il passo."""
    es = crea(a, b, h, tipo, val, tol)
    if es is not None:
        return [es]
    if prof > 80:
        raise RuntimeError(f"segmento non costruibile in [{a}, {b}) con passo {h}")
    durata = b - a
    if durata > 16.0 * h:
        hh = 2.0 ** math.floor(math.log2(durata / 2.0))
        m = cst.T0 + round((0.5 * (a + b) - cst.T0) / hh) * hh
        if not a < m < b:
            m = cst.T0 + math.floor((0.5 * (a + b) - cst.T0) / h) * h
        if a < m < b:
            return _crea_robusto(a, m, h, tipo, val, tol, prof + 1) + _crea_robusto(m, b, h, tipo, val, tol, prof + 1)
    if h > PASSI[-1]:
        return _crea_robusto(a, b, h / 2.0, tipo, val, tol, prof + 1)
    if tipo == binio.SEG_E:
        return _crea_robusto(a, b, PASSI[0], binio.SEG_C, val, tol, prof + 1)
    # passo minimo (1/64 d) insufficiente, ad esempio al perielio di una cometa radente: segmento C al passo
    # minimo con l'errore misurato
    es = crea(a, b, h, tipo, val, tol, forza=True)
    if es is None:
        raise RuntimeError(f"dati mancanti in [{a}, {b})")
    return [es]


def costruisci(a: float, b: float, val: Valutatore, tol: Tolleranza, riflesso: bool = False) -> list[Esito]:
    """Segmenti che coprono [a, b) senza buchi né sovrapposizioni."""
    global _RIFLESSO
    precedente = _RIFLESSO
    _RIFLESSO = riflesso
    try:
        return _costruisci(a, b, val, tol)
    finally:
        _RIFLESSO = precedente


def _costruisci(a: float, b: float, val: Valutatore, tol: Tolleranza) -> list[Esito]:
    mem = Memoria(val)
    celle: list[tuple[float, float, float, int]] = []
    tratto_e: list[tuple[float, float, float]] = []

    def chiudi_tratto_e() -> None:
        """Tratto contiguo a passo E piccolo: C se occupa meno byte."""
        if not tratto_e:
            return
        e_celle = [(x0, x1, h, binio.SEG_E) for x0, x1, h in tratto_e]
        x0, x1 = tratto_e[0][0], tratto_e[-1][1]
        c_celle = [(y0, y1, hc, binio.SEG_C) for y0, y1, hc in passi_locali(x0, x1, binio.SEG_C, mem, tol)]
        costo_e = sum(_costo(c[1] - c[0], c[2], c[3]) for c in partizione(_tratti(e_celle)))
        if all(c[2] > 0 for c in c_celle):
            # il tratto C spezza i segmenti E adiacenti: un segmento E in più con i suoi aloni
            costo_c = PENALITA_C + sum(_costo(c[1] - c[0], c[2], c[3]) for c in partizione(_tratti(c_celle)))
            if costo_c < costo_e:
                celle.extend(c_celle)
                tratto_e.clear()
                return
        celle.extend(e_celle)
        tratto_e.clear()

    for x0, x1, h in passi_locali(a, b, binio.SEG_E, mem, tol):
        if h > 0:
            if SCELTA_C and h <= PASSO_E_CONFRONTO and (not tratto_e or tratto_e[-1][1] == x0):
                tratto_e.append((x0, x1, h))
                continue
            chiudi_tratto_e()
            if SCELTA_C and h <= PASSO_E_CONFRONTO:
                tratto_e.append((x0, x1, h))
            else:
                celle.append((x0, x1, h, binio.SEG_E))
            continue
        chiudi_tratto_e()
        for y0, y1, hc in passi_locali(x0, x1, binio.SEG_C, mem, tol):
            # hc ≤ 0: tolleranza non raggiungibile nemmeno al passo minimo; segmento C al passo minimo
            celle.append((y0, y1, hc if hc > 0 else PASSI[0], binio.SEG_C))
    chiudi_tratto_e()
    celle.sort()
    out: list[Esito] = []
    for x0, x1, h, tipo in partizione(_tratti(celle)):
        out.extend(_crea_robusto(x0, x1, h, tipo, mem, tol))
    return out
