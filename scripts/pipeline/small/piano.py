"""Piano delle sorgenti per intervallo (§ 7.6.1) e richieste a Horizons che ne derivano.

1. Asteroidi in sb441-n16: sb441-n16 da JD -1 200 000,5 al 1600; prima ASSIST a ritroso dallo stato
   sb441-n16 a JD -1 200 000,5, senza la forza degli asteroidi. Nella finestra 1600-2121 SPK Horizons
   della soluzione corrente (A7: sb441-n16 se ne discosta fino a 1,4e4 km nel 1600-1700).
2. Comete periodiche con record per apparizione (DASTCOM): ogni record nel proprio intervallo, con
   cambio all'afelio kepleriano del record precedente; dal 1600 SPK Horizons del record, prima ASSIST
   dallo stato del record (Horizons non produce SPK prima del 1600); prima dell'intervallo del record
   più antico, ASSIST dallo stesso record.
3. Tutti gli altri: SPK Horizons della soluzione corrente dal 1600 a T_END; prima ASSIST a ritroso
   dallo stato SPK al 1650-01-01, giunzione al 1600-01-01.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field

from common import constants as cst
from common.calendario import calendario_a_jd, jd_a_calendario

from . import horizons, rete
from .anagrafica import RAW, Corpo
from .sbdb import RispostaSbdb

JD_1600 = calendario_a_jd(1600, 1, 1, 0, 0, 0, "gregoriano")
JD_1650 = calendario_a_jd(1650, 1, 1, 0, 0, 0, "gregoriano")
JD_INIZIO_SB441 = -1200000.5
MARGINE_SPK_D = 512.0
FINE_SPK = cst.T_END + 64.0
MU_SOLE_AU3_D2 = cst.DE441_GM_UA3_D2["GMS"]
# μ del Sole in km³/s² per gli elementi cometari dei record e di SBDB.
MU_SOLE = cst.GM_SOLE

CARTELLA_RECORD = RAW / "horizons" / "record"


@dataclass
class Pezzo:
    """Sorgente dei dati nell'intervallo [inizio, fine) (JD TDB)."""

    tipo: str  # 'sb441-n16' | 'spk-horizons' | 'record-dastcom' | 'assist'
    inizio: float
    fine: float
    descrizione: str
    chiave: str  # sorgente dei campioni: 'sb441', 'spk:<nome>', 'assist:<nome>'
    record: int | None = None
    varianti: list[str] = field(default_factory=list)


@dataclass
class RichiestaSpk:
    nome: str  # nome del file in .cache/small/spk
    comando: str
    inizio: float
    fine: float


def data_horizons(jd: float) -> str:
    d = jd_a_calendario(jd)
    return f"{d.anno:04d}-{d.mese:02d}-{d.giorno:02d} {d.ora:02d}:{d.minuto:02d}"


def percorso_rifiuto_spk(nome: str):
    return RAW / "horizons" / "spk-rifiutati" / f"{nome}.json"


# --- Record per apparizione ---


def percorso_elenco(c: Corpo):
    return CARTELLA_RECORD / f"{c.slug}-elenco.txt"


def percorso_record(c: Corpo, rec: int):
    return CARTELLA_RECORD / f"{c.slug}-{rec}.txt"


def scarica_record(c: Corpo, offline: bool = False) -> list[horizons.RecordCometa]:
    """Elenco dei record DASTCOM della cometa e dati di ciascun record (congelati in raw/small)."""
    if not c.cometa_periodica:
        return []
    testo = rete.congelato(percorso_elenco(c), horizons.url_elenco_record(c.sbdb), offline).decode()
    out = []
    for rec, _ in horizons.elenco_record(testo):
        t = rete.congelato(percorso_record(c, rec), horizons.url_record(rec), offline).decode()
        out.append(horizons.leggi_record(t))
    return out


def seleziona_record(records: list[horizons.RecordCometa]) -> list[horizons.RecordCometa]:
    """Record ordinati per perielio; di due record con perieli entro 100 d si tiene quello con più
    osservazioni (a parità, il numero di record più alto)."""
    ordinati = sorted(records, key=lambda r: r.tp)
    out: list[horizons.RecordCometa] = []
    for r in ordinati:
        if out and abs(r.tp - out[-1].tp) < 100.0:
            prec = out[-1]
            if (r.n_oss or 0, r.record) > (prec.n_oss or 0, prec.record):
                out[-1] = r
            continue
        out.append(r)
    return out


def _periodo_au(r: horizons.RecordCometa) -> float:
    if r.e >= 1.0:
        return math.inf
    a = r.q_au / (1.0 - r.e)
    return 2.0 * math.pi * math.sqrt(a**3 / MU_SOLE_AU3_D2)


def tempi_cambio(records: list[horizons.RecordCometa]) -> list[float]:
    """Istanti di cambio tra record consecutivi: afelio kepleriano del record precedente più vicino
    al punto medio tra i due perieli."""
    out = []
    for a, b in zip(records, records[1:], strict=False):
        p = _periodo_au(a)
        medio = 0.5 * (a.tp + b.tp)
        k = round((medio - a.tp) / p - 0.5)
        s = a.tp + (k + 0.5) * p
        if not a.tp < s < b.tp:
            s = medio
        out.append(s)
    return out


def afelio_precedente(r: horizons.RecordCometa) -> float:
    return r.tp - 0.5 * _periodo_au(r)


# --- Piano ---


def usa_tabella(c: Corpo) -> bool:
    """Vettori Horizons tabulati al posto dell'SPK (SPK rifiutato per gli oggetti precalcolati)."""
    return percorso_rifiuto_spk(c.slug).exists()


def _pezzo_horizons(c: Corpo, sol: str, a: float, b: float) -> Pezzo | None:
    """Pezzo della soluzione corrente da Horizons in [a, b): SPK, o vettori tabulati se l'SPK è rifiutato;
    None se manca anche la tabella."""
    if not usa_tabella(c):
        return Pezzo("spk-horizons", a, b, f"SPK Horizons, soluzione {sol}", f"spk:{c.slug}")
    from .tabelle import spec

    sp = spec(c)
    if sp is None:
        return None
    return Pezzo(
        "spk-horizons",
        max(a, float(sp["inizio"])),
        b,
        f"vettori Horizons tabulati, soluzione {sol} (SPK non prodotto per gli oggetti precalcolati)",
        f"tab:{c.slug}",
    )


def ancora(inizio_horizons: float) -> float:
    """Istante di partenza di ASSIST a ritroso: 50 anni giuliani circa dopo l'inizio della sorgente Horizons
    (1650-01-01 per l'inizio al 1600-01-01), con sovrapposizione verificata."""
    return inizio_horizons + (JD_1650 - JD_1600)


def comando_corrente(sb: RispostaSbdb) -> str:
    return f"DES={sb.spkid};"


def piano(c: Corpo, sb: RispostaSbdb, records: list[horizons.RecordCometa]) -> list[Pezzo]:
    """Pezzi ordinati che coprono [T0, T_END)."""
    t0, tend = cst.T0, cst.T_END
    sol = f"JPL#{sb.orbita.orbit_id}" if sb.orbita.orbit_id.isdigit() else sb.orbita.orbit_id
    if c.in_sb441:
        pezzi = [
            Pezzo(
                "assist",
                t0,
                JD_INIZIO_SB441,
                "ASSIST a ritroso dallo stato sb441-n16",
                "assist:sb441",
                varianti=["senza-asteroidi"],
            ),
            Pezzo("sb441-n16", JD_INIZIO_SB441, JD_1600, "sb441-n16 (Farnocchia 2021)", "sb441"),
        ]
        # finestra 1600-2121: soluzione corrente (A7); sb441-n16 se Horizons non la fornisce
        h = _pezzo_horizons(c, sol, JD_1600, tend)
        if h is None:
            pezzi[-1].fine = tend
        else:
            pezzi.append(h)
        return pezzi
    sel = seleziona_record(records)
    if len(sel) >= 2:
        cambi = tempi_cambio(sel)
        bordi = [t0, *cambi, tend]
        pezzi: list[Pezzo] = []
        for i, r in enumerate(sel):
            a, b = bordi[i], bordi[i + 1]
            if i == 0:
                s0 = max(t0, afelio_precedente(r))
                if s0 > t0:
                    # dal 1600 l'SPK Horizons dello stesso record (A7), prima ASSIST
                    s1 = min(s0, JD_1600)
                    pezzi.append(
                        Pezzo(
                            "assist",
                            t0,
                            s1,
                            f"ASSIST a ritroso dal record {r.record} ({r.soluzione})",
                            f"assist:{r.record}",
                            r.record,
                            ["senza-ng", "salto-record"],
                        )
                    )
                    if s1 < s0:
                        pezzi.append(
                            Pezzo(
                                "record-dastcom",
                                s1,
                                s0,
                                f"record {r.record} ({r.soluzione}), SPK Horizons prima del suo intervallo",
                                f"spk:{c.slug}-{r.record}",
                                r.record,
                            )
                        )
                a = s0
            descr = f"record {r.record} ({r.soluzione})"
            if b <= JD_1600:
                pezzi.append(
                    Pezzo("record-dastcom", a, b, descr + ", integrato con ASSIST", f"assist:{r.record}", r.record)
                )
            elif a >= JD_1600:
                pezzi.append(
                    Pezzo("record-dastcom", a, b, descr + ", SPK Horizons", f"spk:{c.slug}-{r.record}", r.record)
                )
            else:
                pezzi.append(
                    Pezzo(
                        "record-dastcom", a, JD_1600, descr + ", integrato con ASSIST", f"assist:{r.record}", r.record
                    )
                )
                pezzi.append(
                    Pezzo("record-dastcom", JD_1600, b, descr + ", SPK Horizons", f"spk:{c.slug}-{r.record}", r.record)
                )
        return pezzi
    var = ["senza-ng", "senza-asteroidi"] if sb.orbita.ha_ng else ["senza-asteroidi"]
    if usa_tabella(c):
        # oggetto precalcolato nell'indice dei corpi maggiori: Horizons non produce l'SPK; vettori tabulati
        from .tabelle import ADATTAMENTO_NG, spec

        sp = spec(c)
        if sp is None:
            return [
                Pezzo(
                    "assist",
                    t0,
                    tend,
                    f"ASSIST dalla soluzione {sol} all'epoca (SPK Horizons non disponibile)",
                    "assist:dati",
                    varianti=var,
                ),
            ]
        t_a = float(sp["inizio"])
        descr = f"ASSIST a ritroso dallo stato Horizons ({sol}) al {data_horizons(ancora(t_a))[:10]}"
        if c.slug in ADATTAMENTO_NG:
            descr += ", con A1 e A2 adattati ai vettori Horizons"
            var = ["senza-ng", "senza-asteroidi"]
        return [
            Pezzo("assist", t0, t_a, descr, "assist:dati", varianti=var),
            Pezzo(
                "spk-horizons",
                t_a,
                tend,
                f"vettori Horizons tabulati, soluzione {sol} (SPK non prodotto per gli oggetti precalcolati)",
                f"tab:{c.slug}",
            ),
        ]
    return [
        Pezzo(
            "assist",
            t0,
            JD_1600,
            f"ASSIST a ritroso dallo stato SPK ({sol}) al 1650-01-01",
            "assist:dati",
            varianti=var,
        ),
        Pezzo("spk-horizons", JD_1600, tend, f"SPK Horizons, soluzione {sol}", f"spk:{c.slug}"),
    ]


def richieste_spk(c: Corpo, sb: RispostaSbdb, records: list[horizons.RecordCometa]) -> list[RichiestaSpk]:
    sel = seleziona_record(records) if not c.in_sb441 else []
    if len(sel) >= 2:
        cambi = tempi_cambio(sel)
        bordi = [cst.T0, *cambi, cst.T_END]
        out = []
        for i, r in enumerate(sel):
            a = max(JD_1600, bordi[i] - MARGINE_SPK_D)
            b = min(FINE_SPK, bordi[i + 1] + MARGINE_SPK_D)
            if b > JD_1600 and b > a:
                out.append(RichiestaSpk(f"{c.slug}-{r.record}", f"{r.record};", a, b))
        return out
    return [RichiestaSpk(c.slug, comando_corrente(sb), JD_1600, FINE_SPK)]


def salva_piano(c: Corpo, pezzi: list[Pezzo]) -> None:
    from .anagrafica import CACHE

    p = CACHE / c.slug / "piano.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps([asdict(x) for x in pezzi], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
