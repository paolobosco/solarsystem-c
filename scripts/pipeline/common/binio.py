"""Formati binari: intestazione comune a 64 byte (§ 8.2) e serie di elementi SSSERIE1 (§ 8.3).

Little endian, offset allineati a 8 byte, tempi in JD TDB.
Disposizione scritta da `scrivi_serie`: intestazione, tabella delle voci, tabelle dei segmenti
(contigue per corpo), dati dei segmenti, ciascun blocco allineato a 8 byte.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from . import constants as cst
from .equinoctial import elementi_da_stato, lambda_continua, stato_da_elementi
from .interp import hermite_cubica, lagrange8

VERSIONE = 1
DIM_INTESTAZIONE = 64
DIM_VOCE = 8
DIM_SEGMENTO = 80

TIPO_PIANETI = 1
TIPO_SATELLITI = 2
TIPO_PICCOLI_CORPI = 3
TIPO_LUNA = 4
TIPO_AFFIDABILITA = 5
TIPO_STELLE = 6

MAGIC_SERIE = b"SSSERIE1"
TIPI_PER_MAGIC: dict[bytes, tuple[int, ...]] = {
    MAGIC_SERIE: (TIPO_PIANETI, TIPO_PICCOLI_CORPI),
    b"SSSATS01": (TIPO_SATELLITI,),
    b"SSMOON01": (TIPO_LUNA,),
    b"SSRELI02": (TIPO_AFFIDABILITA,),
    b"SSSTAR01": (TIPO_STELLE,),
}

SEG_E = 1
SEG_C = 2
ALONI_E = (4, 3)  # nodi prima del nodo iniziale e dopo il nodo finale (§ 8.3)
ALONI_C = (1, 0)
PASSI_AMMESSI = tuple(2.0**k for k in range(-6, 11))  # da 1/64 d a 1024 d (§ 7.6.3)

_FMT_INTESTAZIONE = struct.Struct("<8sIIiIddII16s")
_FMT_VOCE = struct.Struct("<HHI")
_FMT_SEGMENTO = struct.Struct("<BbHIddddddddII")
assert _FMT_INTESTAZIONE.size == DIM_INTESTAZIONE
assert _FMT_VOCE.size == DIM_VOCE
assert _FMT_SEGMENTO.size == DIM_SEGMENTO


class ErroreFormato(ValueError):
    """File binario non conforme al formato."""


def allinea8(n: int) -> int:
    return (n + 7) & ~7


# --- Intestazione comune ---


@dataclass(frozen=True)
class Intestazione:
    magic: bytes
    tipo: int
    blocco: int
    n_voci: int
    inizio: float
    fine: float
    offset_voci: int
    dimensione: int
    versione: int = VERSIONE


def _verifica_blocco(blocco: int, inizio: float, fine: float) -> None:
    if blocco == -1:
        return
    if not 0 <= blocco < cst.K:
        raise ErroreFormato(f"indice di blocco non valido: {blocco}")
    if inizio != cst.inizio_blocco(blocco) or fine != cst.fine_blocco(blocco):
        raise ErroreFormato(f"nucleo del blocco {blocco} non conforme: [{inizio}, {fine})")


def valida_intestazione(i: Intestazione, dimensione_reale: int | None = None) -> None:
    if i.magic not in TIPI_PER_MAGIC:
        raise ErroreFormato(f"magic sconosciuto: {i.magic!r}")
    if i.versione != VERSIONE:
        raise ErroreFormato(f"versione non supportata: {i.versione}")
    if i.tipo not in TIPI_PER_MAGIC[i.magic]:
        raise ErroreFormato(f"tipo {i.tipo} incoerente con {i.magic!r}")
    if not (math.isfinite(i.inizio) and math.isfinite(i.fine) and i.inizio < i.fine):
        raise ErroreFormato("nucleo non valido")
    _verifica_blocco(i.blocco, i.inizio, i.fine)
    if i.dimensione % 8 != 0 or i.dimensione < DIM_INTESTAZIONE:
        raise ErroreFormato(f"dimensione non valida: {i.dimensione}")
    if dimensione_reale is not None and dimensione_reale != i.dimensione:
        raise ErroreFormato(f"dimensione dichiarata {i.dimensione}, reale {dimensione_reale}")
    if i.offset_voci % 8 != 0 or i.offset_voci < DIM_INTESTAZIONE or i.offset_voci > i.dimensione:
        raise ErroreFormato(f"offset della tabella delle voci non valido: {i.offset_voci}")


def scrivi_intestazione(i: Intestazione) -> bytes:
    valida_intestazione(i)
    return _FMT_INTESTAZIONE.pack(
        i.magic, i.versione, i.tipo, i.blocco, i.n_voci, i.inizio, i.fine, i.offset_voci, i.dimensione, bytes(16)
    )


def leggi_intestazione(buf: bytes | memoryview) -> Intestazione:
    """Legge e valida l'intestazione; la dimensione dichiarata deve coincidere con len(buf)."""
    if len(buf) < DIM_INTESTAZIONE:
        raise ErroreFormato("file più corto dell'intestazione")
    magic, ver, tipo, blocco, nv, ini, fin, off, dim, ris = _FMT_INTESTAZIONE.unpack_from(buf, 0)
    if any(ris):
        raise ErroreFormato("campo riservato dell'intestazione non nullo")
    i = Intestazione(magic, tipo, blocco, nv, ini, fin, off, dim, ver)
    valida_intestazione(i, len(buf))
    return i


# --- Segmenti ---


@dataclass
class Segmento:
    """Segmento di una serie (§ 8.3). Dati E: Float32 [δa, h, k, p, q, δλ]; C: Float64 [km, km/d]."""

    tipo: int
    h: float
    t_primo: float
    inizio: float
    fine: float
    dati: NDArray
    fattore_i: int = 0
    mu: float = 0.0
    a0: float = 0.0
    lam0: float = 0.0
    n: float = 0.0

    @property
    def n_campioni(self) -> int:
        return int(self.dati.shape[0])


def valida_segmento(s: Segmento) -> None:
    if s.tipo not in (SEG_E, SEG_C):
        raise ErroreFormato(f"tipo di segmento non valido: {s.tipo}")
    if s.h not in PASSI_AMMESSI:
        raise ErroreFormato(f"passo non ammesso: {s.h}")
    if not (math.isfinite(s.t_primo) and math.isfinite(s.inizio) and math.isfinite(s.fine)):
        raise ErroreFormato("tempi non finiti")
    if not s.inizio < s.fine:
        raise ErroreFormato("nucleo del segmento vuoto")
    n = s.n_campioni
    if s.dati.ndim != 2 or s.dati.shape[1] != 6:
        raise ErroreFormato("dati del segmento di forma errata")
    if not np.all(np.isfinite(s.dati)):
        raise ErroreFormato("dati del segmento non finiti")
    if s.tipo == SEG_E:
        if s.dati.dtype != np.float32:
            raise ErroreFormato("dati E devono essere Float32")
        if s.fattore_i not in (1, -1):
            raise ErroreFormato(f"fattore I non valido: {s.fattore_i}")
        if n < 8:
            raise ErroreFormato("segmento E con meno di 8 campioni")
        if not (s.mu > 0 and s.a0 > 0 and math.isfinite(s.lam0) and math.isfinite(s.n)):
            raise ErroreFormato("riferimenti del segmento E non validi")
        if s.inizio < s.t_primo + 3 * s.h or s.fine > s.t_primo + (n - 4) * s.h:
            raise ErroreFormato("stencil di Lagrange incompleto nel nucleo")
    else:
        if s.dati.dtype != np.float64:
            raise ErroreFormato("dati C devono essere Float64")
        if s.fattore_i != 0 or s.mu != 0 or s.a0 != 0 or s.lam0 != 0 or s.n != 0:
            raise ErroreFormato("campi E non nulli in un segmento C")
        if n < 2:
            raise ErroreFormato("segmento C con meno di 2 campioni")
        if s.inizio < s.t_primo or s.fine > s.t_primo + (n - 1) * s.h:
            raise ErroreFormato("campioni di Hermite insufficienti nel nucleo")


def segmento_e(
    t_primo: float,
    h: float,
    inizio: float,
    fine: float,
    mu: float,
    fattore_i: int,
    elementi: ArrayLike,
) -> Segmento:
    """Segmento E da elementi (N, 6) [a, h, k, p, q, λ] con λ continua, ai tempi t_primo + j·h.

    a0 = media di a; λ0 e n da retta ai minimi quadrati di λ su (t_j - t_primo); |δλ| < 1 rad.
    """
    el = np.asarray(elementi, dtype=np.float64)
    x = h * np.arange(el.shape[0], dtype=np.float64)
    a0 = float(np.mean(el[:, 0]))
    lam = el[:, 5]
    xm = float(np.mean(x))
    lm = float(np.mean(lam))
    n = float(np.sum((x - xm) * (lam - lm)) / np.sum((x - xm) ** 2))
    lam0 = lm - n * xm
    dl = lam - (lam0 + n * x)
    if np.max(np.abs(dl)) >= 1.0:
        raise ValueError("residuo di λ non inferiore a 1 rad: segmento troppo lungo o λ discontinua")
    dati = np.empty((el.shape[0], 6), dtype=np.float32)
    dati[:, 0] = el[:, 0] - a0
    dati[:, 1:5] = el[:, 1:5]
    dati[:, 5] = dl
    s = Segmento(SEG_E, h, t_primo, inizio, fine, dati, int(fattore_i), float(mu), a0, lam0, n)
    valida_segmento(s)
    return s


def segmento_e_da_stati(
    t_primo: float,
    h: float,
    inizio: float,
    fine: float,
    stati: ArrayLike,
    mu: float,
    fattore_i: int | None = None,
) -> Segmento:
    """Segmento E da stati (N, 6) [km, km/s] ai tempi t_primo + j·h. I unico per il segmento."""
    st = np.asarray(stati, dtype=np.float64)
    if fattore_i is None:
        _, fi = elementi_da_stato(st, mu)
        if np.any(fi != fi[0]):
            raise ValueError("l'inclinazione attraversa 90° nel segmento: indicare il fattore I")
        fattore_i = int(fi[0])
    el, _ = elementi_da_stato(st, mu, fattore_i)
    t = t_primo + h * np.arange(st.shape[0], dtype=np.float64)
    el[:, 5] = lambda_continua(t, el[:, 5], el[:, 0], mu, cst.GIORNO_S)
    return segmento_e(t_primo, h, inizio, fine, mu, fattore_i, el)


def segmento_c_da_stati(t_primo: float, h: float, inizio: float, fine: float, stati: ArrayLike) -> Segmento:
    """Segmento C da stati (N, 6) [km, km/s]; le velocità si memorizzano in km/d."""
    st = np.array(stati, dtype=np.float64)
    st[:, 3:] *= cst.GIORNO_S
    s = Segmento(SEG_C, h, t_primo, inizio, fine, st)
    valida_segmento(s)
    return s


def valuta_segmento(s: Segmento, t: ArrayLike) -> NDArray[np.float64]:
    """Stato (n, 6) [km, km/s] dal segmento, senza controllo del nucleo."""
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    if s.tipo == SEG_E:
        d = lagrange8(tt, s.t_primo, s.h, s.dati.astype(np.float64))
        el = np.empty_like(d)
        el[:, 0] = s.a0 + d[:, 0]
        el[:, 1:5] = d[:, 1:5]
        el[:, 5] = s.lam0 + s.n * (tt - s.t_primo) + d[:, 5]
        return stato_da_elementi(el, s.mu, s.fattore_i)
    pos, vel = hermite_cubica(tt, s.t_primo, s.h, s.dati[:, :3], s.dati[:, 3:])
    return np.concatenate([pos, vel / cst.GIORNO_S], axis=1)


# --- File SSSERIE1 ---


@dataclass
class FileSerie:
    intestazione: Intestazione
    corpi: dict[int, list[Segmento]]


def _verifica_corpi(tipo: int, inizio: float, fine: float, corpi: dict[int, list[Segmento]]) -> None:
    for ssid, segs in corpi.items():
        if not 0 <= ssid <= 0xFFFF:
            raise ErroreFormato(f"ssid fuori intervallo: {ssid}")
        if len(segs) > 0xFFFF:
            raise ErroreFormato("troppi segmenti")
        prec_fine = -math.inf
        for s in segs:
            valida_segmento(s)
            if s.inizio < inizio or s.fine > fine:
                raise ErroreFormato(f"segmento del corpo {ssid} fuori dal nucleo del file")
            if s.inizio < prec_fine:
                raise ErroreFormato(f"segmenti del corpo {ssid} non ordinati o sovrapposti")
            prec_fine = s.fine
        if tipo == TIPO_PIANETI:
            if len(segs) != 1 or segs[0].tipo != SEG_E:
                raise ErroreFormato(f"il pianeta {ssid} deve avere un solo segmento E")
            m = (segs[0].t_primo - cst.T0) / segs[0].h
            if m != math.floor(m):
                raise ErroreFormato(f"griglia del pianeta {ssid} non allineata a T0")


def scrivi_serie(tipo: int, blocco: int, inizio: float, fine: float, corpi: dict[int, list[Segmento]]) -> bytes:
    """Serializza un file SSSERIE1; i corpi sono ordinati per ssid crescente."""
    ordinati = sorted(corpi.items())
    _verifica_corpi(tipo, inizio, fine, dict(ordinati))
    off_voci = DIM_INTESTAZIONE
    pos = allinea8(off_voci + DIM_VOCE * len(ordinati))
    off_tabelle = []
    for _, segs in ordinati:
        off_tabelle.append(pos if segs else 0)
        pos += DIM_SEGMENTO * len(segs)
    off_dati: list[list[int]] = []
    for _, segs in ordinati:
        riga = []
        for s in segs:
            pos = allinea8(pos)
            riga.append(pos)
            pos += s.dati.nbytes
        off_dati.append(riga)
    dimensione = allinea8(pos)
    out = bytearray(dimensione)
    intest = Intestazione(MAGIC_SERIE, tipo, blocco, len(ordinati), inizio, fine, off_voci, dimensione)
    out[:DIM_INTESTAZIONE] = scrivi_intestazione(intest)
    for iv, (ssid, segs) in enumerate(ordinati):
        _FMT_VOCE.pack_into(out, off_voci + DIM_VOCE * iv, ssid, len(segs), off_tabelle[iv])
        for js, s in enumerate(segs):
            _FMT_SEGMENTO.pack_into(
                out,
                off_tabelle[iv] + DIM_SEGMENTO * js,
                s.tipo,
                s.fattore_i,
                0,
                s.n_campioni,
                s.h,
                s.t_primo,
                s.inizio,
                s.fine,
                s.mu,
                s.a0,
                s.lam0,
                s.n,
                off_dati[iv][js],
                0,
            )
            dt = "<f4" if s.tipo == SEG_E else "<f8"
            b = np.ascontiguousarray(s.dati, dtype=dt).tobytes()
            out[off_dati[iv][js] : off_dati[iv][js] + len(b)] = b
    return bytes(out)


def _verifica_regioni(regioni: list[tuple[int, int, str]], dimensione: int) -> None:
    """Regioni [inizio, fine) dentro il file, allineate e senza sovrapposizioni."""
    for a, b, nome in regioni:
        if a % 8 != 0 or a < 0 or b > dimensione or b < a:
            raise ErroreFormato(f"regione non valida: {nome} [{a}, {b})")
    ordinate = sorted(regioni)
    for (_, b1, n1), (a2, _, n2) in zip(ordinate, ordinate[1:], strict=False):
        if a2 < b1:
            raise ErroreFormato(f"regioni sovrapposte: {n1} e {n2}")


def leggi_serie(buf: bytes | memoryview) -> FileSerie:
    """Legge e valida un file SSSERIE1."""
    buf = bytes(buf)
    intest = leggi_intestazione(buf)
    if intest.magic != MAGIC_SERIE:
        raise ErroreFormato(f"magic atteso {MAGIC_SERIE!r}, trovato {intest.magic!r}")
    dim = intest.dimensione
    regioni = [(0, DIM_INTESTAZIONE, "intestazione")]
    fine_voci = intest.offset_voci + DIM_VOCE * intest.n_voci
    regioni.append((intest.offset_voci, fine_voci, "voci"))
    _verifica_regioni(regioni, dim)
    corpi: dict[int, list[Segmento]] = {}
    prec_ssid = -1
    for iv in range(intest.n_voci):
        ssid, nseg, off_tab = _FMT_VOCE.unpack_from(buf, intest.offset_voci + DIM_VOCE * iv)
        if ssid <= prec_ssid:
            raise ErroreFormato("voci non ordinate per ssid crescente o duplicate")
        prec_ssid = ssid
        if nseg == 0:
            if off_tab != 0:
                raise ErroreFormato(f"corpo {ssid} senza segmenti con offset non nullo")
            corpi[ssid] = []
            continue
        regioni.append((off_tab, off_tab + DIM_SEGMENTO * nseg, f"segmenti di {ssid}"))
        _verifica_regioni(regioni[-1:], dim)
        segs = []
        for js in range(nseg):
            (tp, fi, ris1, n, h, tprimo, ini, fin, mu, a0, lam0, nmot, off_d, ris2) = _FMT_SEGMENTO.unpack_from(
                buf, off_tab + DIM_SEGMENTO * js
            )
            if ris1 != 0 or ris2 != 0:
                raise ErroreFormato(f"campo riservato non nullo nel segmento {js} di {ssid}")
            if tp not in (SEG_E, SEG_C):
                raise ErroreFormato(f"tipo di segmento non valido: {tp}")
            dt = np.dtype("<f4") if tp == SEG_E else np.dtype("<f8")
            nbyte = n * 6 * dt.itemsize
            regioni.append((off_d, off_d + nbyte, f"dati {js} di {ssid}"))
            _verifica_regioni(regioni[-1:], dim)
            dati = np.frombuffer(buf, dtype=dt, count=n * 6, offset=off_d).reshape(n, 6)
            dati = dati.astype(np.float32 if tp == SEG_E else np.float64)
            segs.append(Segmento(tp, h, tprimo, ini, fin, dati, fi, mu, a0, lam0, nmot))
        corpi[ssid] = segs
    _verifica_regioni(regioni, dim)
    _verifica_corpi(intest.tipo, intest.inizio, intest.fine, corpi)
    return FileSerie(intest, corpi)


ESITO_OK = "ok"
ESITO_NON_DETERMINABILE = "non-determinabile"
ESITO_FUORI_COPERTURA = "fuori-copertura"


def valuta_serie(fs: FileSerie, ssid: int, t: ArrayLike) -> tuple[NDArray[np.float64], NDArray[np.str_]]:
    """Valutazione di riferimento: stati (n, 6) [km, km/s] ed esiti per ogni t.

    Segmento cercato per bisezione sull'inizio del nucleo. Fuori dal nucleo del file:
    'fuori-copertura'; nel nucleo ma senza segmento: 'non-determinabile'. Stato NaN se non 'ok'.
    """
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    stati = np.full((tt.size, 6), np.nan)
    esiti = np.full(tt.size, ESITO_FUORI_COPERTURA, dtype=object)
    dentro = (tt >= fs.intestazione.inizio) & (tt < fs.intestazione.fine)
    esiti[dentro] = ESITO_NON_DETERMINABILE
    segs = fs.corpi.get(ssid)
    if segs is None:
        raise KeyError(f"corpo assente dal file: {ssid}")
    if segs:
        inizi = np.array([s.inizio for s in segs])
        idx = np.searchsorted(inizi, tt, side="right") - 1
        for js, s in enumerate(segs):
            m = dentro & (idx == js) & (tt < s.fine)
            if np.any(m):
                stati[m] = valuta_segmento(s, tt[m])
                esiti[m] = ESITO_OK
    return stati, esiti.astype(str)
