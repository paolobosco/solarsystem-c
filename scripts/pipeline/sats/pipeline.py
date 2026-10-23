"""Passi della pipeline dei satelliti (§ 12.3 passo 4)."""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from contextlib import ExitStack

import numpy as np

from common import constants as cst
from common.manifest import CARTELLA_PIPELINE

from . import campioni, secolare, sistemi, sorgenti, spike
from . import kernel as kn
from . import modello as mod
from . import produzione as pr
from . import record as rc
from .anagrafica import Satellite, per_naif, satelliti

Registro = Callable[[str], None]
OUT = CARTELLA_PIPELINE / "out"
CARTELLA_SCELTE = kn.CACHE / "scelte"
FILE_LUNGHI = kn.CACHE / "confronto-lunghi.json"

# Ordine di elaborazione: i kernel dei centri esterni precedono quelli che li usano.
ORDINE = [
    "plu060.bsp",
    "nep098_part-1.bsp",
    "nep097.bsp",
    "nep105.bsp",
    "nep098_part-3.bsp",
    "sat441.bsp",
    "jup365.bsp",
    "jup347.bsp",
    "mar099.bsp",
    "ura184_part-3.bsp",
    "sat441xl_part-1.bsp",
    "sat441xl_part-2.bsp",
    "ura111xl-799.bsp",
    "ura111xl-703.bsp",
    "ura111xl-704.bsp",
    "ura111xl-702.bsp",
    "ura111xl-701.bsp",
    "ura111xl-705.bsp",
    "nep097xl-899.bsp",
    "nep097xl-801.bsp",
    "nep101xl-802.bsp",
]

# Kernel che servono come centro esterno ad altri kernel (si eliminano dopo l'ultimo dipendente).
DIPENDENTI = {
    "ura111xl-799.bsp": [n for n, c in kn.CENTRO_ESTERNO.items() if c == "ura111xl-799.bsp"],
    "nep097xl-899.bsp": [n for n, c in kn.CENTRO_ESTERNO.items() if c == "nep097xl-899.bsp"],
}


def _campionato(nome: str) -> bool:
    k = kn.KERNEL[nome]
    return all(campioni.percorso(nome, n).exists() for n in k.satelliti)


def campiona_kernel(nomi: list[str], registro: Registro) -> None:
    """Scarica, campiona ed elimina (se lunghi) i kernel indicati, uno alla volta."""
    for nome in [n for n in ORDINE if n in nomi]:
        k = kn.KERNEL[nome]
        if k.satelliti and _campionato(nome):
            registro(f"{nome}: campioni già presenti")
            continue
        if not k.satelliti and all(_campionato(d) for d in DIPENDENTI.get(nome, [])):
            registro(f"{nome}: dipendenti già campionati")
            continue
        registro(f"{nome}: scaricamento (liberi {kn.spazio_libero() / 1024**3:.1f} GB)")
        kn.scarica(k)
        est = kn.CENTRO_ESTERNO.get(nome)
        if est is not None and not kn.KERNEL[est].percorso.exists():
            kn.scarica(kn.KERNEL[est])
        if k.satelliti:
            campioni.campiona(nome, registro)
            if k.tipo == "lungo":
                kn.elimina(k)
                registro(f"{nome}: eliminato dalla cache")
        for centro, dip in DIPENDENTI.items():
            if kn.KERNEL[centro].percorso.exists() and all(_campionato(d) for d in dip):
                kn.elimina(kn.KERNEL[centro])
                registro(f"{centro}: eliminato dalla cache")


def sistemi_cmd(registro: Registro) -> None:
    for slug, p in sistemi.calcola_tutti().items():
        d = p.diagnostica
        registro(f"{slug}: I = {p.fattore_i}, P = {p.periodo:.4f} d, e = {p.e:.4f}, polo {d['finestra']}/{d['metodo']}")


def _leggi_json(p) -> dict:
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _scrivi_json(p, d: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _con_naif(slugs: list[str]) -> list[Satellite]:
    sats = [s for s in satelliti() if s.naif is not None]
    return [s for s in sats if not slugs or s.slug in slugs]


def leggi_scelte() -> dict:
    """Scelte per satellite (un file per satellite, scritti anche da processi paralleli)."""
    if not CARTELLA_SCELTE.exists():
        return {}
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(CARTELLA_SCELTE.glob("*.json"))}


def scelte(slugs: list[str], registro: Registro) -> None:
    """Frequenze ν_k e durata dei record per satellite (prova sul kernel moderno, § 7.5.2 e S3)."""
    par = sistemi.leggi()
    for s in _con_naif(slugs):
        if (CARTELLA_SCELTE / f"{s.slug}.json").exists():
            continue
        p = par[s.slug]
        with ExitStack() as pila:
            aperti = sorgenti.lettori([s.kernel_moderno], pila)
            fonte = spike.intervallo_moderno(s, p, aperti)
            registro(f"{s.slug}: P = {p.periodo:.4f} d, e = {p.e:.4f}")
            fr = spike.analisi_frequenze(s, p, fonte, pr.durata_predefinita(p.periodo), registro=registro)
            durate = pr.candidati_durata(p.periodo)
            prove0 = spike.prova_durate(s, p, fonte, [], durate, registro=registro)
            prove = spike.prova_durate(s, p, fonte, fr["frequenze"], durate, registro=registro)
        L = pr.scegli_durata(s, prove)
        registro(f"  {s.slug}: durata scelta {L:g} anni, K = {len(fr['frequenze'])}")
        _scrivi_json(
            CARTELLA_SCELTE / f"{s.slug}.json", {"frequenze": fr, "proveK0": prove0, "prove": prove, "durataAnni": L}
        )


def confronto_lunghi(registro: Registro) -> None:
    """Estrapolazione secolare dal solo kernel moderno contro i kernel lunghi (S3)."""
    par = sistemi.leggi()
    sc = leggi_scelte()
    out = _leggi_json(FILE_LUNGHI)
    for s in satelliti():
        if not s.kernel_lunghi or s.slug in out:
            continue
        p = par[s.slug]
        with ExitStack() as pila:
            aperti = sorgenti.lettori([s.kernel_moderno], pila)
            fonte = spike.intervallo_moderno(s, p, aperti)
            sec = spike.secolare_da_moderno(s, p, fonte, sc.get(s.slug, {}).get("frequenze", {}).get("frequenze", []))
        conf = spike.confronto_lungo(s, p, sec)
        out[s.slug] = {"secolare": sec, "confronto": conf}
        registro(
            f"{s.slug}: secolare residuo {sec['residuoMaxGradi']:.3f}°, σ_n {sec['sigmaN']:.2e} rad/anno; "
            f"differenza max dove determinabile {conf.get('maxDifferenzaDoveDeterminabileGradi', float('nan')):.3f}°, "
            f"rapporto max {conf.get('maxRapportoDoveDeterminabile', float('nan')):.3f}, "
            f"livello cambiato {100 * conf.get('livelloCambia', 0):.1f}%"
        )
        _scrivi_json(FILE_LUNGHI, out)


# Soglia del confronto S3: il kernel lungo si omette se la differenza dall'estrapolazione secolare,
# dove il satellite è determinabile, resta sotto un quarto di ε_estrapolazione (ε ⊕ d ≤ 1,03·ε).
RAPPORTO_EQUIVALENZA = 0.25


def lunghi_usati(s: Satellite) -> list[str]:
    """Kernel lunghi adottati per il satellite secondo l'esito del confronto S3."""
    if not s.kernel_lunghi:
        return []
    c = _leggi_json(FILE_LUNGHI).get(s.slug)
    if c is None or c["confronto"] is None:
        return list(s.kernel_lunghi)
    r = c["confronto"].get("maxRapportoDoveDeterminabile")
    if r is not None and r <= RAPPORTO_EQUIVALENZA:
        return []
    return list(s.kernel_lunghi)


def spike_cmd(registro: Registro) -> None:
    """Riepilogo S3 in out/spike-sats.json (sei casi del § 14.2 e confronto con i kernel lunghi)."""
    sc = leggi_scelte()
    lu = _leggi_json(FILE_LUNGHI)
    casi = {}
    for naif in spike.CASI:
        s = per_naif(naif)
        casi[s.slug] = {**sc.get(s.slug, {}), "confrontoLunghi": lu.get(s.slug)}
    decisioni = {s.slug: lunghi_usati(s) for s in satelliti() if s.kernel_lunghi}
    out = {
        "formato": 1,
        "descrizione": "Prova S3 dei satelliti: durata dei record, termini periodici, kernel lunghi",
        "casi": casi,
        "tuttiISatelliti": {
            k: {
                "durataAnni": pr.scegli_durata(next(x for x in satelliti() if x.slug == k), v["prove"]),
                "durataLunghiAnni": pr.scegli_durata_lunghi(next(x for x in satelliti() if x.slug == k), v["prove"]),
                "K": len(v["frequenze"]["frequenze"]),
                "prove": v["prove"],
                "proveK0": v["proveK0"],
            }
            for k, v in sc.items()
        },
        "confrontoLunghi": lu,
        "rapportoEquivalenza": RAPPORTO_EQUIVALENZA,
        "kernelLunghiAdottati": decisioni,
    }
    _scrivi_json(OUT / "spike-sats.json", out)
    registro(f"out/spike-sats.json scritto; kernel lunghi adottati: {decisioni}")


# --- Produzione dei record ---


def _fonti(s: Satellite, lunghi: list[str]) -> list[pr.Fonte]:
    assert s.naif is not None and s.kernel_moderno is not None
    out = []
    for nome in [s.kernel_moderno, *lunghi]:
        a, b = campioni.leggi(nome, s.naif)["copertura"]
        # copertura vera del kernel (i campioni sono limitati a [T0 - 1 anno, T_END + 1 anno])
        out.append(pr.Fonte(nome, float(a), float(b), kn.KERNEL[nome].tipo))
    return out


def _secolare(s: Satellite, p: sistemi.ParametriSistema, fonti: list[str], registro: Registro) -> dict:
    """Secolare su tutta la copertura delle fonti adottate e validazione incrociata (σ_n)."""
    t, pos = pr.campioni_fonti(s, p, fonti)
    with ExitStack() as pila:
        aperti = sorgenti.lettori([s.kernel_moderno], pila)
        fonte = spike.intervallo_moderno(s, p, aperti)
        c0, c1 = fonte.inizio, fonte.fine
        t_ref = 0.5 * (c0 + c1)
        L = pr.durata_predefinita(p.periodo) * pr.GIORNI_ANNO
        recs, _ = rc.adatta_sequenza(
            [fonte], np.array([t_ref - 0.5 * L, t_ref + 0.5 * L]), p.periodo, p.e, p.mu, p.fattore_i, np.zeros(0), 0
        )
    x0 = secolare.x0_da_record(recs, t_ref)
    es = secolare.adatta_secolare(t, pos, x0, t_ref, p.fattore_i)
    ang = secolare.errore_angolare(es.x, t_ref, p.fattore_i, t, pos)
    r = mod.posizione_parametri(es.x, t_ref, np.zeros(0), p.fattore_i, t)
    rad = np.abs(np.linalg.norm(r, axis=1) - np.linalg.norm(pos, axis=1))
    cv = secolare.sigma_n_validazione_incrociata(t, pos, es.x, t_ref, p.fattore_i)
    registro(f"  {s.slug}: secolare residuo max {math.degrees(float(ang.max())):.3f}°, σ_n {cv['sigmaN']:.2e} rad/anno")
    return {
        "x": es.x.tolist(),
        "tRef": t_ref,
        "residuoMaxRad": float(ang.max()),
        "residuoRadialeMaxKm": float(rad.max()),
        "sigmaN": cv["sigmaN"],
        "validazioneIncrociata": cv,
        "fonti": fonti,
    }


def limite_determinabile(s: Satellite, sigma_n: float, n: float, prima: float) -> float:
    """Epoca (JD) prima della quale ε_estrapolazione supera 90° (non determinabile), cercando da `prima`."""
    t = prima
    passo = 10 * pr.GIORNI_ANNO
    while t > cst.T0 and pr.epsilon_estrapolazione(s, sigma_n, n, t) < math.pi / 2:
        t -= passo
    return t


def record(slugs: list[str], registro: Registro) -> None:
    """Record del kernel moderno e secolare per i satelliti indicati (kernel moderni in cache)."""
    par = sistemi.leggi()
    sc = leggi_scelte()
    for s in _con_naif(slugs):
        p = par[s.slug]
        scelta = sc[s.slug]
        nu = scelta["frequenze"]["frequenze"]
        L_mod = pr.scegli_durata(s, scelta["prove"]) * pr.GIORNI_ANNO
        L_lungo = pr.scegli_durata_lunghi(s, scelta["prove"]) * pr.GIORNI_ANNO
        lunghi = lunghi_usati(s)
        anni = (L_mod / pr.GIORNI_ANNO, L_lungo / pr.GIORNI_ANNO)
        registro(f"{s.slug}: L = {anni[0]:g} anni (lunghi {anni[1]:g}), K = {len(nu)}, kernel lunghi {lunghi}")
        sec = _secolare(s, p, [s.kernel_moderno, *lunghi], registro)
        fonti = _fonti(s, lunghi)
        # i kernel lunghi servono solo dove il satellite è determinabile
        if lunghi:
            n = sec["x"][8]
            lim = limite_determinabile(s, sec["sigmaN"], n, min(f.inizio for f in fonti if f.tipo == "moderno"))
            for f in fonti:
                if f.tipo == "lungo":
                    f.inizio = max(f.inizio, lim)
        tas = pr.tassella(fonti, L_mod, L_lungo)
        stato = {
            "slug": s.slug,
            "secolare": sec,
            "frequenze": nu,
            "durataModerno": L_mod,
            "durataLungo": L_lungo,
            "lunghi": lunghi,
            "zone": [],
        }
        for zona, confini in tas.zone:
            voce = {"tipo": zona, "confini": confini.tolist(), "record": None, "diagnostica": None}
            if zona == "moderno":
                recs, diag = pr.adatta_zona(s, p, [s.kernel_moderno], confini, nu, registro)
                voce["record"] = [pr.record_in_dizionario(r) for r in recs]
                voce["diagnostica"] = [d.__dict__ for d in diag]
            stato["zone"].append(voce)
        stato["secolarePassato"] = tas.secolare_passato
        stato["secolareFuturo"] = tas.secolare_futuro
        pr.salva(s.slug, stato)


def record_lunghi(registro: Registro, slugs: list[str] | None = None) -> None:
    """Record delle zone dei kernel lunghi: ogni kernel si scarica una volta, si usa per tutti i suoi
    satelliti (tra quelli indicati) e si elimina."""
    par = sistemi.leggi()
    stati = {s.slug: pr.carica(s.slug) for s in _con_naif(slugs or []) if (pr.CARTELLA / f"{s.slug}.json").exists()}
    gruppi: dict[tuple[str, ...], list[str]] = {}
    for slug, st in stati.items():
        if any(z["tipo"] == "lungo" and z["record"] is None for z in st["zone"]):
            gruppi.setdefault(tuple(st["lunghi"]), []).append(slug)

    def necessari(nomi: tuple[str, ...]) -> list[str]:
        return list(dict.fromkeys(list(nomi) + [kn.CENTRO_ESTERNO[n] for n in nomi if n in kn.CENTRO_ESTERNO]))

    elenco = list(gruppi.items())
    for i, (nomi, slugs) in enumerate(elenco):
        da_scaricare = necessari(nomi)
        ancora = {n for g, _ in elenco[i + 1 :] for n in necessari(g)}
        for n in da_scaricare:
            if not kn.KERNEL[n].percorso.exists():
                registro(f"{n}: scaricamento (liberi {kn.spazio_libero() / 1024**3:.1f} GB)")
            kn.scarica(kn.KERNEL[n])
        for slug in slugs:
            s = next(x for x in satelliti() if x.slug == slug)
            st = pr.carica(slug)
            p = par[slug]
            for z in st["zone"]:
                if z["tipo"] == "lungo" and z["record"] is None:
                    recs, diag = pr.adatta_zona(s, p, list(nomi), np.array(z["confini"]), st["frequenze"], registro)
                    z["record"] = [pr.record_in_dizionario(r) for r in recs]
                    z["diagnostica"] = [d.__dict__ for d in diag]
            # ε_sorgente: differenza tra kernel moderno e lunghi nella sovrapposizione (§ 7.5.6)
            st["sorgente"] = pr.differenza_sorgenti(s, p, s.kernel_moderno, list(nomi))
            _campioni_zone(s, st, list(nomi))
            registro(
                f"  {slug}: ε_sorgente {st['sorgente']['maxGradi'] * 3600:.1f}″ ({st['sorgente']['maxKm']:.1f} km)"
            )
            pr.salva(slug, st)
        # residui con i kernel ancora presenti
        residui(slugs, registro, solo_lunghi=True)
        for n in da_scaricare:
            if n not in ancora:
                kn.elimina(kn.KERNEL[n])
                registro(f"{n}: eliminato dalla cache")


def nuclei_fuori_giunzione(recs: list[mod.Record], fonti: list[str | None], nome: str) -> list[tuple[float, float]]:
    """Nuclei dei record della fonte `nome`, senza le zone di raccordo con record di fonte diversa."""
    out = []
    for j, (r, f) in enumerate(zip(recs, fonti, strict=True)):
        if f != nome:
            continue
        t0, t1 = r.t_inizio, r.t_fine
        if j > 0 and fonti[j - 1] != f:
            t0 += mod.semiampiezza_raccordo(recs[j - 1], r)
        if j < len(recs) - 1 and fonti[j + 1] != f:
            t1 -= mod.semiampiezza_raccordo(r, recs[j + 1])
        out.append((t0, t1))
    return out


def _campioni_zone(s: Satellite, st: dict, nomi: list[str]) -> None:
    """Epoche di validazione A6 nelle zone servite dai record dei kernel lunghi, fuori dalle giunzioni tra
    sorgenti (kernel in cache)."""
    recs, fonti = sequenza(st)
    with ExitStack() as pila:
        aperti = sorgenti.lettori(nomi, pila)
        for nome in nomi:
            iv = nuclei_fuori_giunzione(recs, fonti, nome)
            if iv:
                campioni.campiona_zona(s, nome, aperti, iv)


def ricalcola_lunghi(slugs: list[str], registro: Registro) -> None:
    """Residui dei record dei kernel lunghi ed epoche di validazione delle zone (kernel scaricati di nuovo e
    poi eliminati), per satelliti con le zone lunghe già adattate."""
    gruppi: dict[tuple[str, ...], list[str]] = {}
    for s in _con_naif(slugs):
        st = pr.carica(s.slug)
        if st["lunghi"] and all(z["record"] is not None for z in st["zone"]):
            gruppi.setdefault(tuple(st["lunghi"]), []).append(s.slug)
    for nomi, membri in gruppi.items():
        necessari = list(dict.fromkeys([*nomi, *[kn.CENTRO_ESTERNO[n] for n in nomi if n in kn.CENTRO_ESTERNO]]))
        for n in necessari:
            kn.scarica(kn.KERNEL[n])
        residui(membri, registro, solo_lunghi=True)
        for slug in membri:
            s = next(x for x in satelliti() if x.slug == slug)
            _campioni_zone(s, pr.carica(slug), list(nomi))
        for n in necessari:
            kn.elimina(kn.KERNEL[n])
            registro(f"{n}: eliminato dalla cache")


def sequenza(st: dict, parziale: bool = False) -> tuple[list[mod.Record], list[str | None]]:
    """Sequenza completa dei record del satellite (secolari ai lati) e fonte di ciascun record.

    Con `parziale` si saltano le zone non ancora adattate (solo per i residui delle altre zone: le giunzioni
    sono escluse dal calcolo)."""
    p = st["secolare"]
    x = np.array(p["x"])
    out: list[mod.Record] = []
    fonti: list[str | None] = []
    if st.get("secolarePassato"):
        out.append(pr.record_secolare(x, p["tRef"], _fattore(st), tuple(st["secolarePassato"])))
        fonti.append(None)
    for z in st["zone"]:
        if z["record"] is None and parziale:
            continue
        out += [pr.record_da_dizionario(d) for d in z["record"]]
        fonti += [d["fonte"] for d in z["diagnostica"]]
    if st.get("secolareFuturo"):
        out.append(pr.record_secolare(x, p["tRef"], _fattore(st), tuple(st["secolareFuturo"])))
        fonti.append(None)
    return out, fonti


def _fattore(st: dict) -> int:
    for z in st["zone"]:
        if z["record"]:
            return int(z["record"][0]["I"])
    raise ValueError("nessun record")


def residui(slugs: list[str], registro: Registro, solo_lunghi: bool = False) -> None:
    """ε_adattamento e errore radiale massimi per record (con raccordo) contro la fonte del record."""
    par = sistemi.leggi()
    for s in _con_naif(slugs):
        st = pr.carica(s.slug)
        p = par[s.slug]
        recs, fonti_rec = sequenza(st, parziale=True)
        nu = np.array(st["frequenze"])
        nomi = [z for z in [s.kernel_moderno, *st["lunghi"]] if kn.KERNEL[z].percorso.exists()]
        with ExitStack() as pila:
            aperti = sorgenti.lettori(nomi, pila)
            iv = [pr.intervallo_sorgente(s, p, n, aperti) for n in nomi]
            if solo_lunghi:
                iv = [x for x in iv if kn.KERNEL[x.nome].tipo == "lungo"]
            res = rc.residui_sequenza(recs, nu, iv, p.periodo, p.e, fonti_record=fonti_rec)
        prec = st.get("residui", {})
        for j, r in enumerate(recs):
            if np.isnan(res["angolo"][j]):
                continue
            prec[f"{r.t_inizio:.3f}"] = [float(res["angolo"][j]), float(res["radiale"][j])]
        st["residui"] = prec
        pr.salva(s.slug, st)
        validi = list(prec.values())
        if validi:
            registro(
                f"  {s.slug}: residuo max {math.degrees(max(v[0] for v in validi)) * 3600:.1f}″, "
                f"radiale max {max(v[1] for v in validi):.1f} km ({len(validi)} record)"
            )


def secolare_cmd(slugs: list[str], registro: Registro) -> None:
    """Ricalcola il record secolare e σ_n dei satelliti indicati (record da SPK invariati)."""
    par = sistemi.leggi()
    for s in _con_naif(slugs):
        if not (pr.CARTELLA / f"{s.slug}.json").exists():
            continue
        st = pr.carica(s.slug)
        st["secolare"] = _secolare(s, par[s.slug], [s.kernel_moderno, *st["lunghi"]], registro)
        pr.salva(s.slug, st)


def genera(registro: Registro) -> None:
    from . import uscite

    uscite.genera(registro)


def valida(registro: Registro, offline: bool = False) -> None:
    from . import uscite

    uscite.valida(registro, offline)


def catalogo(registro: Registro, offline: bool = False) -> None:
    from . import uscite

    uscite.catalogo(registro)


def fixture(registro: Registro) -> None:
    from . import uscite

    uscite.fixture(registro)
