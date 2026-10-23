"""File dei satelliti SSSATS01 (§ 8.5): scrittura, lettura con verifiche, valutazione di riferimento.

Disposizione: intestazione comune (64 byte, § 8.2); tabella delle voci (8 byte per satellite: u16 ssid,
u16 numero di record, u32 offset del primo record), ordinata per ssid; record contigui per satellite,
ordinati per inizio. Record: intestazione di 8 byte (u8 tipo, i8 I, u16 K, u32 riservato = 0) e
Float64 [14 + 2K] = t_inizio, t_fine, t_ref, a, e, ϖ0, ϖ̇, tan(i/2), Ω0, Ω̇, λ0, n, c2, c3, S_1, C_1, ...
Ogni file di blocco contiene tutti i record il cui intervallo esteso (nucleo più raccordi) interseca il
nucleo del blocco (§ 7.5.3); i nuclei dei record di ogni satellite coprono il nucleo del blocco.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

from common import binio
from common import constants as cst

from . import modello as mod

MAGIC = b"SSSATS01"
DIM_VOCE = 8
DIM_TESTA_RECORD = 8
N_VALORI_BASE = 14

_FMT_VOCE = struct.Struct("<HHI")
_FMT_TESTA = struct.Struct("<BbHI")


def dimensione_record(k: int) -> int:
    return DIM_TESTA_RECORD + 8 * (N_VALORI_BASE + 2 * k)


def estensioni(records: list[mod.Record]) -> list[tuple[float, float]]:
    """Intervallo esteso [t_inizio - L_b, t_fine + L_b) di ogni record della sequenza."""
    out = []
    for j, r in enumerate(records):
        lb0 = mod.semiampiezza_raccordo(records[j - 1], r) if j > 0 else 0.0
        lb1 = mod.semiampiezza_raccordo(r, records[j + 1]) if j < len(records) - 1 else 0.0
        out.append((r.t_inizio - lb0, r.t_fine + lb1))
    return out


def record_del_blocco(records: list[mod.Record], inizio: float, fine: float) -> list[mod.Record]:
    """Record il cui intervallo esteso interseca [inizio, fine)."""
    return [r for r, (a, b) in zip(records, estensioni(records), strict=True) if a < fine and b > inizio]


def verifica_sequenza(records: list[mod.Record], inizio: float, fine: float) -> None:
    """Record contigui, ordinati, validi e che coprono [inizio, fine)."""
    if not records:
        raise binio.ErroreFormato("satellite senza record")
    if len(records) > 0xFFFF:
        raise binio.ErroreFormato("troppi record")
    for j, r in enumerate(records):
        if r.tipo not in (mod.TIPO_SPK, mod.TIPO_SECOLARE):
            raise binio.ErroreFormato(f"tipo di record non valido: {r.tipo}")
        if r.fattore_i not in (1, -1):
            raise binio.ErroreFormato(f"fattore I non valido: {r.fattore_i}")
        if not 0 <= r.k <= mod.K_MAX:
            raise binio.ErroreFormato(f"K non valido: {r.k}")
        valori = np.array(r.valori(), dtype=np.float64)
        if not np.all(np.isfinite(valori)):
            raise binio.ErroreFormato("valori del record non finiti")
        if not r.t_inizio < r.t_fine:
            raise binio.ErroreFormato("intervallo del record vuoto")
        if not (r.a > 0 and 0 <= r.e < 1 and r.tan_i2 > 0):
            raise binio.ErroreFormato("elementi del record non validi")
        if j > 0 and records[j - 1].t_fine != r.t_inizio:
            raise binio.ErroreFormato("record non contigui")
    if records[0].t_inizio > inizio or records[-1].t_fine < fine:
        raise binio.ErroreFormato("i record non coprono il nucleo del blocco")


def scrivi(blocco: int, inizio: float, fine: float, satelliti: dict[int, list[mod.Record]]) -> bytes:
    """Serializza un file SSSATS01; satelliti ordinati per ssid."""
    ordinati = sorted(satelliti.items())
    for ssid, recs in ordinati:
        if not 0 <= ssid <= 0xFFFF:
            raise binio.ErroreFormato(f"ssid fuori intervallo: {ssid}")
        verifica_sequenza(recs, inizio, fine)
    off_voci = binio.DIM_INTESTAZIONE
    pos = binio.allinea8(off_voci + DIM_VOCE * len(ordinati))
    offset = []
    for _, recs in ordinati:
        offset.append(pos)
        pos += sum(dimensione_record(r.k) for r in recs)
    dimensione = binio.allinea8(pos)
    out = bytearray(dimensione)
    intest = binio.Intestazione(MAGIC, binio.TIPO_SATELLITI, blocco, len(ordinati), inizio, fine, off_voci, dimensione)
    out[: binio.DIM_INTESTAZIONE] = binio.scrivi_intestazione(intest)
    for iv, (ssid, recs) in enumerate(ordinati):
        _FMT_VOCE.pack_into(out, off_voci + DIM_VOCE * iv, ssid, len(recs), offset[iv])
        p = offset[iv]
        for r in recs:
            _FMT_TESTA.pack_into(out, p, r.tipo, r.fattore_i, r.k, 0)
            b = np.array(r.valori(), dtype="<f8").tobytes()
            out[p + DIM_TESTA_RECORD : p + DIM_TESTA_RECORD + len(b)] = b
            p += dimensione_record(r.k)
    return bytes(out)


@dataclass
class FileSatelliti:
    intestazione: binio.Intestazione
    satelliti: dict[int, list[mod.Record]]


def leggi(buf: bytes | memoryview) -> FileSatelliti:
    """Legge e verifica un file SSSATS01."""
    buf = bytes(buf)
    intest = binio.leggi_intestazione(buf)
    if intest.magic != MAGIC:
        raise binio.ErroreFormato(f"magic atteso {MAGIC!r}, trovato {intest.magic!r}")
    dim = intest.dimensione
    fine_voci = intest.offset_voci + DIM_VOCE * intest.n_voci
    if fine_voci > dim:
        raise binio.ErroreFormato("tabella delle voci oltre la fine del file")
    regioni: list[tuple[int, int]] = [(0, binio.DIM_INTESTAZIONE), (intest.offset_voci, fine_voci)]
    satelliti: dict[int, list[mod.Record]] = {}
    prec = -1
    for iv in range(intest.n_voci):
        ssid, nrec, off = _FMT_VOCE.unpack_from(buf, intest.offset_voci + DIM_VOCE * iv)
        if ssid <= prec:
            raise binio.ErroreFormato("voci non ordinate per ssid crescente o duplicate")
        prec = ssid
        if nrec == 0:
            raise binio.ErroreFormato(f"satellite {ssid} senza record")
        p = off
        recs = []
        for _ in range(nrec):
            if p % 8 != 0 or p + DIM_TESTA_RECORD > dim:
                raise binio.ErroreFormato(f"record di {ssid} fuori dal file")
            tipo, fi, k, ris = _FMT_TESTA.unpack_from(buf, p)
            if ris != 0:
                raise binio.ErroreFormato("campo riservato del record non nullo")
            if k > mod.K_MAX:
                raise binio.ErroreFormato(f"K non valido: {k}")
            n = N_VALORI_BASE + 2 * k
            if p + dimensione_record(k) > dim:
                raise binio.ErroreFormato(f"record di {ssid} oltre la fine del file")
            v = np.frombuffer(buf, dtype="<f8", count=n, offset=p + DIM_TESTA_RECORD).astype(np.float64)
            recs.append(
                mod.Record(tipo, fi, *(float(x) for x in v[:N_VALORI_BASE]), sc=v[N_VALORI_BASE:].reshape(-1, 2).copy())
            )
            p += dimensione_record(k)
        regioni.append((off, p))
        verifica_sequenza(recs, intest.inizio, intest.fine)
        satelliti[ssid] = recs
    ordinate = sorted(regioni)
    for (_, b1), (a2, _) in zip(ordinate, ordinate[1:], strict=False):
        if a2 < b1:
            raise binio.ErroreFormato("regioni sovrapposte")
    return FileSatelliti(intest, satelliti)


ESITO_OK = binio.ESITO_OK
ESITO_FUORI_COPERTURA = binio.ESITO_FUORI_COPERTURA


def valuta(
    fs: FileSatelliti, ssid: int, frequenze: ArrayLike, rf: ArrayLike, t: ArrayLike
) -> tuple[NDArray[np.float64], NDArray[np.str_]]:
    """Valutazione di riferimento: stati (n, 6) nell'eclittica J2000 relativi al primario del modello.

    Fuori dal nucleo del file: 'fuori-copertura' e stato NaN.
    """
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    stati = np.full((tt.size, 6), np.nan)
    esiti = np.full(tt.size, ESITO_FUORI_COPERTURA, dtype=object)
    dentro = (tt >= fs.intestazione.inizio) & (tt < fs.intestazione.fine)
    if np.any(dentro):
        st, idx = mod.stato_sequenza(fs.satelliti[ssid], frequenze, np.asarray(rf, dtype=np.float64), tt[dentro])
        if np.any(idx < 0):
            raise ValueError("istante nel nucleo senza record")
        stati[dentro] = st
        esiti[dentro] = ESITO_OK
    return stati, esiti.astype(str)


def percorso_blocco(k: int) -> str:
    """Percorso relativo in data/v1/ del file del blocco k."""
    if not 0 <= k < cst.K:
        raise ValueError(f"blocco fuori intervallo: {k}")
    return f"sats/s{k:02d}.bin"
