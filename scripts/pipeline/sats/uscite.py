"""Uscite della pipeline dei satelliti: file sKK.bin (§ 8.5), validazione A6, frammenti di catalogo e di
affidabilità (§ 8.7, § 8.10), fixture per i test TypeScript.
"""

from __future__ import annotations

import json
import math
import re

import numpy as np
from numpy.typing import NDArray

from common import affidabilita as ca
from common import constants as cst
from common.manifest import CARTELLA_PIPELINE, sha256_bytes, sha256_file

from . import campioni, disnomia, fisica, formato, secolare, sistemi, validazione
from . import kernel as kn
from . import modello as mod
from . import produzione as pr
from .anagrafica import SINCRONI, Satellite, arco, satelliti, ssid_corpo
from .costanti import gm_kernel
from .riferimento import Config, PianoSecolare, Riferimento

RADICE = CARTELLA_PIPELINE.parent.parent
DATI = RADICE / "public" / "data" / "v1"
OUT = CARTELLA_PIPELINE / "out"
FIXTURE = RADICE / "tests" / "fixtures" / "sats"
FILE_CONFIG = kn.CACHE / "configurazioni.json"
SEME_FIXTURE = 20261021
# Data di trascrizione delle tabelle di Holler et al. (2021) per Disnomia (fissa: il frammento resta riproducibile).
ESTRAZIONE_DISNOMIA = "2026-10-19"
UN_PRIMO = math.radians(1.0 / 60.0)

# Anno delle soluzioni dei kernel (JPL "Planetary Satellite Ephemerides", raw/sats/jpl-sats-ephem.html).
SOLUZIONE = {
    "mar099.bsp": ("MAR099", 2025, "Brozović, Jacobson, Park (2025)"),
    "jup365.bsp": ("JUP365", 2021, "Jacobson (2021)"),
    "jup347.bsp": ("JUP347", 2025, "Jacobson (2025)"),
    "sat441.bsp": ("SAT441", 2022, "Jacobson (2022), AJ 164:199"),
    "ura184_part-3.bsp": ("URA182", 2025, "Jacobson, Park (2025), AJ 169:65"),
    "nep097.bsp": ("NEP097", 2020, "Brozović (2020); Jacobson (2009), AJ 137:4322"),
    "nep098_part-1.bsp": ("NEP098", 2026, "JPL SSD (2026)"),
    "nep098_part-3.bsp": ("NEP098", 2026, "JPL SSD (2026)"),
    "nep105.bsp": ("NEP105", 2024, "Jacobson (2024)"),
    "plu060.bsp": ("PLU060", 2024, "Brozović, Jacobson (2024), AJ 167:256"),
}
DATA_FILE_NAIF = {
    "mar099.bsp": "2025-06-02",
    "jup365.bsp": "2021-03-14",
    "jup347.bsp": "2025-05-15",
    "sat441.bsp": "2022-01-29",
    "ura184_part-3.bsp": "2025-09-26",
    "nep097.bsp": "2022-04-10",
    "nep098_part-1.bsp": "2026-07-13",
    "nep098_part-3.bsp": "2026-07-13",
    "nep105.bsp": "2024-09-28",
    "plu060.bsp": "2024-04-03",
}


# --- Sequenze e configurazioni ---


def _disnomia_dati() -> dict:
    """Parametri del modello di Disnomia (§ 7.5.4) ed errori dalle incertezze pubblicate (1σ)."""
    n = 2.0 * math.pi / disnomia.PERIODO
    sigma_n = n * disnomia.SIGMA_PERIODO / disnomia.PERIODO * 365.25  # rad/anno
    eps = math.radians(
        math.sqrt(disnomia.SIGMA_EPS**2 + math.degrees(2 * disnomia.SIGMA_E) ** 2 + disnomia.SIGMA_OMEGA**2)
    )
    return {"sigmaN": sigma_n, "epsAdattamento": eps, "n": n}


_SEQUENZE: dict[str, tuple[list[mod.Record], list[str | None]]] = {}


def sequenze() -> dict[str, tuple[list[mod.Record], list[str | None]]]:
    """Record e fonti per satellite (letti una volta per processo)."""
    from .pipeline import sequenza

    if _SEQUENZE:
        return _SEQUENZE
    out = _SEQUENZE
    for s in satelliti():
        if s.naif is None:
            out[s.slug] = ([disnomia.record(cst.T0, cst.T_END + 365.25)], [None])
        else:
            out[s.slug] = sequenza(pr.carica(s.slug))
    return out


def gm_satellite(s: Satellite) -> float | None:
    if s.naif is None:
        return None
    g = gm_kernel(s.kernel_moderno or "").get(s.naif)
    return g if g else None


def intervalli_secolari(s: Satellite) -> tuple[tuple[float, float, float], ...]:
    """Intervalli (inizio, fine, giunzione) serviti dai record secolari, limitati a [T0, T_END] come le fonti del
    catalogo; giunzione = estremo adiacente ai record da SPK (fine verso il passato, inizio verso il futuro)."""
    recs, fonti = sequenze()[s.slug]
    gruppi: list[list] = []
    for r, f in zip(recs, fonti, strict=True):
        sec = f is None
        if gruppi and gruppi[-1][0] == sec:
            gruppi[-1][2] = r.t_fine
        else:
            gruppi.append([sec, r.t_inizio, r.t_fine])
    out = []
    for j, (sec, a, b) in enumerate(gruppi):
        if not sec:
            continue
        a, b = max(a, cst.T0), min(b, cst.T_END)
        if j + 1 < len(gruppi):
            out.append((a, b, b))
        elif j > 0:
            out.append((a, b, a))
    return tuple(out)


def piano_secolare(s: Satellite) -> PianoSecolare | None:
    """Polo WGCCRE del primario (pck00011.tpc, come in catalog.json) e intervalli secolari, per i satelliti il cui
    piano di Laplace segue l'equatore (anagrafica.SEGUE_EQUATORE)."""
    import physical as ph

    if not s.segue_equatore or s.sistema is None:
        return None
    coeff = ph.coefficienti_wgccre(fisica._pck(), 100 * s.sistema + 99)
    return PianoSecolare(coeff, intervalli_secolari(s))


def configurazioni() -> list[Config]:
    par = sistemi.leggi()
    out = []
    for s in satelliti():
        if s.naif is None:
            rf = disnomia.matrice_rf().reshape(-1)
            nu: list[float] = []
        else:
            rf = np.array(par[s.slug].rf)
            nu = pr.carica(s.slug)["frequenze"]
        out.append(
            Config(
                s.ssid,
                s.slug,
                ssid_corpo(s.primario),
                tuple(float(x) for x in rf),
                tuple(nu),
                gm_satellite(s) or 0.0,
                s.baricentrico,
                piano_secolare(s),
            )
        )
    return out


def piano_secolare_json(c: Config) -> dict | None:
    """Forma di ConfigSatellite.pianoSecolare (src/ephem/satellites.ts)."""
    ps = c.piano_secolare
    if ps is None:
        return None
    return {
        "coefficienti": ps.coefficienti,
        "intervalli": [{"inizio": a, "fine": b, "giunzione": g} for a, b, g in ps.intervalli],
    }


# --- Errori (§ 7.5.6) ---


def errore_sorgente(s: Satellite) -> float:
    """ε_sorgente (rad): differenza tra kernel moderno e kernel lunghi adottati nella sovrapposizione."""
    if s.naif is None:
        return 0.0
    st = pr.carica(s.slug)
    return math.radians(st.get("sorgente", {}).get("maxGradi", 0.0))


def errori_record(s: Satellite) -> tuple[list[mod.Record], NDArray, NDArray]:
    """Record, ε_adattamento e ε_sorgente (rad) per record."""
    recs, fonti = sequenze()[s.slug]
    if s.naif is None:
        d = _disnomia_dati()
        return recs, np.array([d["epsAdattamento"]]), np.zeros(1)
    st = pr.carica(s.slug)
    res = st.get("residui", {})
    sec = st["secolare"]
    e_src = errore_sorgente(s)
    ead = np.zeros(len(recs))
    esrc = np.zeros(len(recs))
    for j, (r, f) in enumerate(zip(recs, fonti, strict=True)):
        if f is None:
            ead[j] = sec["residuoMaxRad"]
            esrc[j] = e_src
        else:
            v = res.get(f"{r.t_inizio:.3f}")
            ead[j] = v[0] if v is not None else np.nan
            esrc[j] = e_src if kn.KERNEL[f].tipo == "lungo" else 0.0
    return recs, ead, esrc


def parametri_estrapolazione(s: Satellite) -> tuple[float, float, tuple[float, float]]:
    """σ_n (rad/anno), σ_ṅ (rad/anno²), arco osservativo (anni)."""
    if s.naif is None:
        d = _disnomia_dati()
        return d["sigmaN"], secolare.sigma_ndot(None, d["n"]), disnomia.ARCO
    sec = pr.carica(s.slug)["secolare"]
    return sec["sigmaN"], secolare.sigma_ndot(s.naif, sec["x"][8]), arco(s.naif)


def epsilon_modello(s: Satellite, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """ε_modello(t) = ε_adattamento ⊕ ε_sorgente ⊕ ε_estrapolazione(τ) (rad); nel raccordo il massimo dei due record."""
    recs, ead, esrc = errori_record(s)
    sigma_n, sigma_ndot, a = parametri_estrapolazione(s)
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    eest = secolare.estrapolazione(sigma_n, sigma_ndot, secolare.tau_da_arco(tt, a))
    inizi = np.array([r.t_inizio for r in recs])
    j = np.clip(np.searchsorted(inizi, tt, side="right") - 1, 0, len(recs) - 1)
    e1 = np.hypot(ead[j], esrc[j])
    # raccordo con i vicini
    for d in (-1, 1):
        k = np.clip(j + d, 0, len(recs) - 1)
        lb = np.array(
            [
                mod.semiampiezza_raccordo(recs[min(a_, b_)], recs[max(a_, b_)]) if a_ != b_ else 0.0
                for a_, b_ in zip(j, k, strict=True)
            ]
        )
        tb = np.array([recs[a_].t_inizio if d < 0 else recs[a_].t_fine for a_ in j])
        vicino = (np.abs(tt - tb) < lb) & (k != j)
        e1 = np.where(vicino, np.maximum(e1, np.hypot(ead[k], esrc[k])), e1)
    return np.sqrt(e1 * e1 + eest * eest)


# --- File binari ---


def genera(registro) -> dict:
    seq = sequenze()
    per_ssid = {s.ssid: seq[s.slug][0] for s in satelliti()}
    (DATI / "sats").mkdir(parents=True, exist_ok=True)
    esito = {}
    totale = 0
    for k in range(cst.K):
        ini, fin = cst.inizio_blocco(k), cst.fine_blocco(k)
        sel = {ssid: formato.record_del_blocco(recs, ini, fin) for ssid, recs in per_ssid.items()}
        dati = formato.scrivi(k, ini, fin, sel)
        p = DATI / formato.percorso_blocco(k)
        p.write_bytes(dati)
        fs = formato.leggi(dati)
        assert set(fs.satelliti) == set(per_ssid)
        esito[p.name] = {"byte": len(dati), "sha256": sha256_bytes(dati), "record": sum(len(v) for v in sel.values())}
        totale += len(dati)
        registro(f"  {p.name}: {len(dati)} byte, {esito[p.name]['record']} record")
    registro(f"totale {totale} byte")
    FILE_CONFIG.write_text(
        json.dumps([{**c.__dict__, "piano_secolare": piano_secolare_json(c)} for c in configurazioni()], indent=1)
        + "\n",
        encoding="utf-8",
    )
    return esito


def riferimento() -> Riferimento:
    file = {k: formato.leggi((DATI / formato.percorso_blocco(k)).read_bytes()) for k in range(cst.K)}
    return Riferimento(file, configurazioni())


# --- Validazione A6 ---


def fonti_usate(s: Satellite) -> list[str]:
    """Kernel che servono almeno un record del satellite (moderno, poi lunghi adottati)."""
    from .pipeline import lunghi_usati

    usate = {f for f in sequenze()[s.slug][1] if f is not None}
    return [n for n in [s.kernel_moderno, *lunghi_usati(s)] if n in usate]


def secolare_in(s: Satellite, t: NDArray[np.float64]) -> NDArray[np.bool_]:
    """Vero per le epoche servite da un record secolare."""
    recs, fonti = sequenze()[s.slug]
    inizi = np.array([r.t_inizio for r in recs])
    j = np.clip(np.searchsorted(inizi, t, side="right") - 1, 0, len(recs) - 1)
    return np.array([fonti[k] is None for k in j], dtype=bool)


def fuori_giunzione(s: Satellite, nome: str, t: NDArray[np.float64]) -> NDArray[np.bool_]:
    """Vero per le epoche servite dai record della fonte `nome`, fuori dalle zone di raccordo con record di
    altre fonti (giunzioni: vi si assorbe il salto tra le sorgenti, § 7.5.1, misurato in `_salti`)."""
    from .pipeline import nuclei_fuori_giunzione

    recs, fonti = sequenze()[s.slug]
    m = np.zeros(t.size, dtype=bool)
    for a, b in nuclei_fuori_giunzione(recs, fonti, nome):
        m |= (t >= a) & (t < b)
    return m


TOLLERANZA_RADIALE = pr.TOLLERANZA_RADIALE


def valida(registro, offline: bool = False) -> dict:
    from .pipeline import lunghi_usati

    rif = riferimento()
    out: dict = {"formato": 1, "kernel": {}, "horizons": {}, "centri": {}, "lunghiNonAdottati": {}}
    esito_globale = True
    for s in satelliti():
        if s.naif is None:
            continue
        a_nom = float(np.median([r.a for r in sequenze()[s.slug][0]]))
        fonti = fonti_usate(s)
        voci = {}
        for nome in fonti:
            c = campioni.validazione(nome, s.naif)
            t = c["t_validazione"]
            vero = validazione.planetocentrico_vero(c["stati_validazione"], c["centro_validazione"], s.baricentrico)
            m = np.isfinite(vero[:, 0]) & fuori_giunzione(s, nome, t)
            st = rif.planetocentrico(s.ssid, t[m])
            ang, rad = validazione.errori(st, vero[m])
            ok = bool(ang.max() <= s.tolleranza_rad and np.abs(rad).max() <= TOLLERANZA_RADIALE * a_nom)
            voci[nome] = {
                "epoche": int(m.sum()),
                "maxAngoloGradi": math.degrees(float(ang.max())),
                "mediaAngoloArcsec": math.degrees(float(ang.mean())) * 3600,
                "maxRadialeKm": float(np.abs(rad).max()),
                "maxRadialeFrazioneA": float(np.abs(rad).max() / a_nom),
                "superato": ok,
            }
            esito_globale &= ok
        out["kernel"][s.slug] = {"tolleranzaGradi": math.degrees(s.tolleranza_rad), "fonti": voci}
        for nome in [n for n in [*s.kernel_lunghi, *s.kernel_confronto] if n not in lunghi_usati(s)]:
            # campioni casuali del kernel dove il modello usa l'estrapolazione secolare (dove il kernel lungo
            # lo avrebbe sostituito) e il satellite è determinabile
            c = campioni.leggi(nome, s.naif)
            t = c["t"]
            vero = validazione.planetocentrico_vero(c["stati"], c["centro"], s.baricentrico)
            m = np.isfinite(vero[:, 0]) & secolare_in(s, t) & (t >= cst.T0) & (t < cst.T_END)
            st = rif.planetocentrico(s.ssid, t[m])
            ang, _ = validazione.errori(st, vero[m])
            eps = epsilon_modello(s, t[m])
            det = eps < math.pi / 2
            out["lunghiNonAdottati"].setdefault(s.slug, {})[nome] = {
                "campioni": int(det.sum()),
                "maxAngoloDoveDeterminabileGradi": math.degrees(float(ang[det].max())) if det.any() else None,
                "maxRapportoAngoloEps": float(np.max(ang[det] / eps[det])) if det.any() else None,
            }
        registro(
            f"  {s.slug}: "
            + ", ".join(f"{k} {v['maxAngoloGradi'] * 3600:.0f}″ {v['maxRadialeKm']:.1f} km" for k, v in voci.items())
        )
    # Horizons
    for s in satelliti():
        t, vero = validazione.vettori_horizons(s, offline)
        st = rif.planetocentrico(s.ssid, t)
        ang, rad = validazione.errori(st, vero)
        a_nom = float(np.median(np.linalg.norm(vero[:, :3], axis=1)))
        ok = bool(ang.max() <= s.tolleranza_rad and np.abs(rad).max() <= TOLLERANZA_RADIALE * a_nom)
        esito_globale &= ok
        out["horizons"][s.slug] = {
            "epoche": int(t.size),
            "maxAngoloGradi": math.degrees(float(ang.max())),
            "maxRadialeKm": float(np.abs(rad).max()),
            "maxRadialeFrazioneA": float(np.abs(rad).max() / a_nom),
            "superato": ok,
        }
        registro(f"  Horizons {s.slug}: {math.degrees(float(ang.max())) * 3600:.0f}″, {np.abs(rad).max():.1f} km")
    # centri dei pianeti
    out["centri"] = valida_centri(rif, registro)
    esito_globale &= all(v["superato"] for v in out["centri"].values())
    out["superato"] = esito_globale
    (OUT / "validazione-sats.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    registro(f"A6 {'superato' if esito_globale else 'NON superato'}")
    return out


# Satelliti rilevanti per il centro del pianeta: contributo GM_i·a_i/GM_sistema ≥ 0,5 km (un decimo della
# soglia di 5 km del criterio A6); gli altri, anche con errore di 180°, spostano il centro di meno di
# 2·GM_i·a_i/GM_sistema (in totale ≤ 1,2 km per Saturno, il caso peggiore).
CONTRIBUTO_RILEVANTE_KM = 0.5


def contributi_centro(pianeta: int) -> dict[str, float]:
    """GM_i·a_i/GM_sistema (km) per satellite del pianeta, con a_i mediano dei record."""
    from .riferimento import SISTEMA_PER_PIANETA

    gm_sis = cst.GM_BARICENTRI[SISTEMA_PER_PIANETA[pianeta]]
    out = {}
    for s in satelliti():
        if s.naif is None or ssid_corpo(s.primario) != pianeta:
            continue
        a = float(np.median([r.a for r in sequenze()[s.slug][0]]))
        out[s.slug] = (gm_satellite(s) or 0.0) * a / gm_sis
    return out


def eps_centro(pianeta: int, t: NDArray[np.float64]) -> NDArray[np.float64]:
    """Massimo ε_modello dei satelliti rilevanti per il centro (0 se nessuno è rilevante, come per Marte)."""
    rilevanti = [k for k, w in contributi_centro(pianeta).items() if w >= CONTRIBUTO_RILEVANTE_KM]
    tt = np.atleast_1d(np.asarray(t, dtype=np.float64))
    if not rilevanti:
        return np.zeros(tt.size)
    per_slug = {s.slug: s for s in satelliti()}
    return np.max(np.stack([epsilon_modello(per_slug[k], tt) for k in rilevanti]), axis=0)


def valida_centri(rif: Riferimento, registro) -> dict:
    """Scarto del centro dal baricentro: formula del § 7.3.5 contro i segmenti SPK dei centri."""
    out = {}
    per_pianeta: dict[int, list[Satellite]] = {}
    for s in satelliti():
        if s.naif is not None:
            per_pianeta.setdefault(ssid_corpo(s.primario), []).append(s)
    for pianeta, sats in per_pianeta.items():
        t_all = []
        vero_all = []
        for s in sats:
            c = campioni.leggi(s.kernel_moderno, s.naif)  # type: ignore[arg-type]
            m = np.isfinite(c["centro_validazione"][:, 0])
            t_all.append(c["t_validazione"][m])
            vero_all.append(c["centro_validazione"][m])
        t = np.concatenate(t_all)
        from common.frames import icrf_a_eclittica

        vero = icrf_a_eclittica(np.concatenate(vero_all))
        mod_off = rif.offset_centro(pianeta, t)
        err = np.linalg.norm(mod_off[:, :3] - vero[:, :3], axis=1)
        eps = eps_centro(pianeta, t)
        precisi = eps <= UN_PRIMO
        contr = contributi_centro(pianeta)
        voce = {
            "satellitiRilevanti": sorted(k for k, w in contr.items() if w >= CONTRIBUTO_RILEVANTE_KM),
            "contributiKm": contr,
            "epoche": int(t.size),
            "epochePrecise": int(precisi.sum()),
            "maxKm": float(err.max()),
            "maxKmDovePrecisi": float(err[precisi].max()) if precisi.any() else None,
            "scartoTipicoKm": float(np.median(np.linalg.norm(vero[:, :3], axis=1))),
        }
        voce["superato"] = voce["maxKmDovePrecisi"] is None or voce["maxKmDovePrecisi"] <= 5.0
        out[str(pianeta)] = voce
        registro(
            f"  centro {pianeta}: max {voce['maxKm']:.2f} km, dove precisi {voce['maxKmDovePrecisi']} km "
            f"({voce['epochePrecise']} epoche), scarto tipico {voce['scartoTipicoKm']:.1f} km"
        )
    return out


# --- Catalogo e affidabilità ---


def _valore(valore, incertezza, fonte: str, anno: int | None) -> dict:
    return {"valore": valore, "incertezza": incertezza, "fonte": fonte, "anno": anno}


def errore_radiale_record(st: dict | None, r: mod.Record, fonte: str | None) -> float | None:
    """Errore radiale massimo (km) del record contro la propria fonte (residui con raccordo, § 7.5.6); per i record
    secolari il residuo radiale dell'adattamento secolare. `st`: stato del satellite (produzione.carica); None per
    Disnomia, il cui errore viene dalle incertezze pubblicate."""
    if st is None:
        return None
    if fonte is None:
        return float(st["secolare"]["residuoRadialeMaxKm"])
    v = st.get("residui", {}).get(f"{r.t_inizio:.3f}")
    return None if v is None else float(v[1])


def _salti(s: Satellite) -> list[dict]:
    """Fonti per intervallo con il salto misurato a ogni giunzione (|r_prec - r_succ| al confine, km) e l'errore
    radiale massimo dei record dell'intervallo (km)."""
    recs, fonti = sequenze()[s.slug]
    cfg = {c.slug: c for c in configurazioni()}[s.slug]
    nu = np.array(cfg.frequenze)
    st = None if s.naif is None else pr.carica(s.slug)
    gruppi: list[dict] = []
    for j, (r, f) in enumerate(zip(recs, fonti, strict=True)):
        nome = f if f is not None else "secolare"
        rad = errore_radiale_record(st, r, f)
        if gruppi and gruppi[-1]["nome"] == nome:
            gruppi[-1]["fine"] = r.t_fine
            if rad is not None:
                g = gruppi[-1]
                g["radiale"] = rad if g["radiale"] is None else max(g["radiale"], rad)
            continue
        salto = None
        if j > 0:
            a = mod.stato_record(recs[j - 1], nu, np.array([r.t_inizio]))[0, :3]
            b = mod.stato_record(r, nu, np.array([r.t_inizio]))[0, :3]
            salto = float(np.linalg.norm(a - b))
        gruppi.append({"nome": nome, "inizio": r.t_inizio, "fine": r.t_fine, "salto": salto, "radiale": rad})
    out = []
    for g in gruppi:
        if g["nome"] == "secolare":
            tipo = "kepleriana" if s.naif is None else "secolare"
            descr = (
                "orbita kepleriana di Holler et al. (2021)"
                if s.naif is None
                else "estrapolazione secolare adattata su " + ", ".join(pr.carica(s.slug)["secolare"]["fonti"])
            )
        else:
            tipo = "spk-satellitare"
            descr = f"{g['nome']} ({SOLUZIONE.get(g['nome'], (kn.KERNEL[g['nome']].soluzione,))[0]})"
        out.append(
            {
                "tipo": tipo,
                "inizio": max(g["inizio"], cst.T0),
                "fine": min(g["fine"], cst.T_END),
                "descrizione": descr,
                "varianti": [],
                "saltoGiunzioneKm": g["salto"],
                "erroreRadialeKm": None if g["radiale"] is None else round(g["radiale"], 1),
            }
        )
    return out


def _fisica(s: Satellite) -> dict:
    if s.naif is None:
        r = fisica.RAGGIO_DISNOMIA
        sr = fisica.RAGGIO_DISNOMIA_SIGMA
        raggi = _valore([r, r, r], [sr, sr, sr], fisica.FONTE_RAGGIO_DISNOMIA, fisica.ANNO_RAGGIO_DISNOMIA)
        return {"raggi_km": raggi, "gm_km3s2": None, "rotazione": None, "albedo": None}
    d = fisica.dati(s.naif)
    rs = d.raggio_sigma
    m = re.search(r"\((\d{4})\)", d.raggio_fonte)
    anno_r = int(m.group(1)) if m else None
    raggi = _valore([d.raggio] * 3, [rs] * 3 if rs is not None else None, d.raggio_fonte, anno_r)
    gm = gm_satellite(s)
    nome_k = s.kernel_moderno or ""
    sol, anno, rif = SOLUZIONE[nome_k]
    gm_v = None
    if gm is not None:
        sigma = fisica.sigma_gm(d, gm, sol)
        fonte = f"costante GM del kernel {nome_k} (soluzione {sol}, {rif})"
        if sigma is not None and d.gm_soluzione != sol:
            fonte += (
                f'; incertezza da JPL "Planetary Satellite Physical Parameters" (soluzione {d.gm_soluzione}, '
                "stesso valore alle cifre pubblicate)"
            )
        gm_v = _valore(gm, sigma, fonte, anno)
    rot = None
    if s.naif in SINCRONI:
        n = pr.carica(s.slug)["secolare"]["x"][8]
        ore = 2.0 * math.pi / abs(n) * 24.0
        rot = _valore(ore, None, "rotazione sincrona: periodo orbitale siderale medio del modello", None)
    elif (p := fisica.periodo_wgccre(s.naif)) is not None:
        # Febe: periodo del modello WGCCRE, rotazione non rappresentata (§ 7.5.5)
        rot = _valore(p, None, fisica.fonte_periodo_wgccre(), 2018)
    elif s.naif in fisica.PERIODI_LETTERATURA:
        # Imalia, Nereide, Notte, Idra: periodo pubblicato, rotazione non rappresentata
        rot = _valore(*fisica.PERIODI_LETTERATURA[s.naif])
    out = {"raggi_km": raggi, "gm_km3s2": gm_v, "rotazione": rot, "albedo": None}
    if (incl := _inclinazione_assiale(s)) is not None:
        out["inclinazioneAssiale_gradi"] = incl
    return out


def _inclinazione_assiale(s: Satellite) -> dict | None:
    """Satelliti non sincroni con polo WGCCRE (Febe): angolo tra il polo positivo di `pck00011.tpc` e la normale
    all'orbita planetocentrica del modello a J2000; oltre 90° la rotazione è retrograda rispetto all'orbita."""
    import physical as ph

    if s.naif is None or s.naif in SINCRONI or fisica.periodo_wgccre(s.naif) is None:
        return None
    coeff = ph.coefficienti_wgccre(fisica._pck(), s.naif)
    recs, _ = sequenze()[s.slug]
    rec = next(r for r in recs if r.t_inizio <= cst.J2000 <= r.t_fine)
    cfg = {c.slug: c for c in configurazioni()}[s.slug]
    st = mod.stato_record(rec, np.array(cfg.frequenze), np.array([cst.J2000]))[0]
    rf = np.array(cfg.rf).reshape(3, 3)
    h = np.cross(rf @ st[:3], rf @ st[3:])
    return ph.inclinazione_assiale(
        s.slug, coeff, h / np.linalg.norm(h), "e dall'orbita planetocentrica del modello a J2000"
    )


def _orientamento(s: Satellite) -> dict:
    if s.naif in SINCRONI:
        return {"modello": "sincrono", "coefficienti": None, "convenzionePolo": "momento-angolare", "indicativo": False}
    return {"modello": "fisso", "coefficienti": None, "convenzionePolo": "nord-IAU", "indicativo": s.naif == 607}


def catalogo(registro) -> None:
    from .pipeline import lunghi_usati

    corpi = {}
    cfg = {c.slug: c for c in configurazioni()}
    for s in satelliti():
        c = cfg[s.slug]
        a = disnomia.ARCO if s.naif is None else arco(s.naif)
        eff = {
            "modello": "satellite",
            "rF": list(c.rf),
            "frequenze": list(c.frequenze),
            "arcoOsservativo": {"inizio": a[0], "fine": a[1]},
            "fonti": _salti(s),
            "centro": "baricentro" if s.baricentrico else "pianeta",
            "pianoSegueEquatore": s.segue_equatore,
        }
        if s.naif is None:
            sol = {
                "id": "Holler et al. 2021",
                "data": "2021-02-01",
                "estrazione": ESTRAZIONE_DISNOMIA,
                "modelloNG": None,
                "recordDastcom": None,
            }
        else:
            nomi = [s.kernel_moderno, *lunghi_usati(s)]
            sol = {
                "id": " + ".join(f"{SOLUZIONE.get(n, (kn.KERNEL[n].soluzione,))[0]} ({n})" for n in nomi),
                "data": DATA_FILE_NAIF[s.kernel_moderno or ""],
                "estrazione": _estrazione(s.kernel_moderno or ""),
                "modelloNG": None,
                "recordDastcom": None,
            }
        corpi[s.slug] = {
            "effemeridi": eff,
            "soluzione": sol,
            "fisica": _fisica(s),
            "orientamento": _orientamento(s),
            "epsModelloCostante": None,
        }
    frammento = {"formato": 1, "area": "sats", "corpi": corpi}
    (OUT / "catalog-sats.json").write_text(json.dumps(frammento, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    affidabilita(registro)
    registro("out/catalog-sats.json e out/reliability-sats.json scritti")


def _estrazione(nome: str) -> str | None:
    from common.manifest import cerca_sorgente

    try:
        return cerca_sorgente(f"sats/{nome}")["estrazione"]
    except KeyError:
        return None


N_NODI = ca.NODI


def affidabilita(registro) -> None:
    """Serie log10 ε_modello per intervallo della griglia di reliability.bin (§ 8.7): massimo nell'intervallo."""
    corpi = {}
    bordi = ca.bordi()
    for s in satelliti():
        recs, ead, esrc = errori_record(s)
        sigma_n, sigma_ndot, a = parametri_estrapolazione(s)
        inizi = np.array([r.t_inizio for r in recs])
        fini = np.array([r.t_fine for r in recs])
        lb = np.zeros(len(recs))
        for j in range(len(recs)):
            v = [mod.semiampiezza_raccordo(recs[j - 1], recs[j]) if j > 0 else 0.0]
            v.append(mod.semiampiezza_raccordo(recs[j], recs[j + 1]) if j < len(recs) - 1 else 0.0)
            lb[j] = max(v)
        log10 = []
        for i in range(N_NODI):
            t0, t1 = bordi[i], bordi[i + 1]
            m = (inizi - lb < t1) & (fini + lb > t0)
            e1 = float(np.max(np.hypot(ead[m], esrc[m]))) if m.any() else float("nan")
            tau = max(float(secolare.tau_da_arco(t0, a)), float(secolare.tau_da_arco(t1, a)))
            e2 = float(secolare.estrapolazione(sigma_n, sigma_ndot, tau))
            log10.append(math.log10(math.hypot(e1, e2)) if math.isfinite(e1) else None)
        corpi[s.slug] = {
            "log10eps": log10,
            "formaDeterminata": [True] * N_NODI,
            "datiPresenti": [True] * N_NODI,
        }
    frammento = {"formato": 2, **ca.griglia(), "corpi": corpi}
    (OUT / "reliability-sats.json").write_text(json.dumps(frammento) + "\n", encoding="utf-8")


# --- Fixture ---

COLONNE = ["ssid", "t", "x", "y", "z", "vx", "vy", "vz", "xVero", "yVero", "zVero", "epsModello"]
COLONNE_CENTRI = ["pianeta", "t", "dx", "dy", "dz", "dvx", "dvy", "dvz", "dxVero", "dyVero", "dzVero", "epsMax"]


def fixture(registro) -> None:
    from common.frames import icrf_a_eclittica

    rif = riferimento()
    rng = np.random.default_rng(SEME_FIXTURE)
    righe = []
    for s in satelliti():
        recs = sequenze()[s.slug][0]
        t_list = []
        vero_list = []
        if s.naif is not None:
            for nome in fonti_usate(s):
                c = campioni.validazione(nome, s.naif)
                v = validazione.planetocentrico_vero(c["stati_validazione"], c["centro_validazione"], s.baricentrico)
                m = np.isfinite(v[:, 0]) & fuori_giunzione(s, nome, c["t_validazione"])
                t_list.append(c["t_validazione"][m])
                vero_list.append(v[m, :3])
        else:
            t, v = validazione.vettori_horizons(s, offline=True)
            t_list.append(t)
            vero_list.append(v[:, :3])
        # epoche casuali su tutto l'intervallo ed epoche ai confini dei record (raccordi)
        tc = rng.uniform(cst.T0, cst.T_END, 40)
        conf = np.array([r.t_inizio for r in recs[1:]])
        conf = conf[(conf > cst.T0 + 1) & (conf < cst.T_END - 1)]
        if conf.size:
            scelti = rng.choice(conf, size=min(10, conf.size), replace=False)
            lbs = 0.05 * np.array([r.durata for r in recs[1:]]).min()
            tc = np.concatenate([tc, scelti, scelti - lbs, scelti + 0.5 * lbs])
        t_list.append(tc)
        vero_list.append(np.full((tc.size, 3), np.nan))
        t = np.concatenate(t_list)
        vero = np.concatenate(vero_list)
        st = rif.planetocentrico(s.ssid, t)
        eps = epsilon_modello(s, t)
        for i in range(t.size):
            righe.append([s.ssid, t[i], *st[i], *vero[i], eps[i]])
    tab = np.array(righe, dtype="<f8")
    FIXTURE.mkdir(parents=True, exist_ok=True)
    (FIXTURE / "satelliti.bin").write_bytes(tab.tobytes())
    # centri
    righe_c = []
    per_pianeta: dict[int, list[Satellite]] = {}
    for s in satelliti():
        if s.naif is not None:
            per_pianeta.setdefault(ssid_corpo(s.primario), []).append(s)
    for pianeta, sats in sorted(per_pianeta.items()):
        c = campioni.leggi(sats[0].kernel_moderno, sats[0].naif)  # type: ignore[arg-type]
        m = np.isfinite(c["centro_validazione"][:, 0])
        t = c["t_validazione"][m]
        vero = icrf_a_eclittica(c["centro_validazione"][m])
        off = rif.offset_centro(pianeta, t)
        eps = eps_centro(pianeta, t)
        for i in range(t.size):
            righe_c.append([pianeta, t[i], *off[i], *vero[i, :3], eps[i]])
    tab_c = np.array(righe_c, dtype="<f8")
    (FIXTURE / "centri.bin").write_bytes(tab_c.tobytes())
    meta = {
        "descrizione": "Stati planetocentrici (eclittica J2000) dai file sats/sKK.bin valutati in Python, posizioni "
        "vere dai kernel SPK (NaN dove non disponibili) e scarti dei centri dei pianeti",
        "generatore": "scripts/pipeline/satellites.py fixture",
        "seme": SEME_FIXTURE,
        "file": "satelliti.bin",
        "colonne": COLONNE,
        "righe": int(tab.shape[0]),
        "fileCentri": "centri.bin",
        "colonneCentri": COLONNE_CENTRI,
        "righeCentri": int(tab_c.shape[0]),
        "sha256": sha256_bytes(tab.tobytes()),
        "sha256Centri": sha256_bytes(tab_c.tobytes()),
        "sha256File": {p.name: sha256_file(p) for p in sorted((DATI / "sats").glob("s*.bin"))},
        "configurazioni": [
            {
                "ssid": c.ssid,
                "slug": c.slug,
                "primario": c.primario,
                "rF": list(c.rf),
                "frequenze": list(c.frequenze),
                "gm": c.gm,
                "baricentrico": c.baricentrico,
                "pianoSecolare": piano_secolare_json(c),
                "tolleranzaGradi": math.degrees(next(s for s in satelliti() if s.ssid == c.ssid).tolleranza_rad),
                "tolleranzaRadiale": TOLLERANZA_RADIALE,
            }
            for c in configurazioni()
        ],
        "soglie": {"radialeFrazioneA": 0.01, "centriKmDovePrecisi": 5.0, "precisaRad": UN_PRIMO},
        "unita": {"t": "JD TDB", "posizioni": "km", "velocita": "km/s", "eps": "rad"},
    }
    (FIXTURE / "satelliti.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    registro(f"fixture: {tab.shape[0]} righe, {tab_c.shape[0]} righe dei centri")
