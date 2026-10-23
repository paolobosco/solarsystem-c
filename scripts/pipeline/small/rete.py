"""Richieste ai servizi JPL (§ 12.2): sequenziali, pausa di 1 s, ripetizione su errore, congelamento."""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PAUSA_S = 1.0
TENTATIVI = 6
TIMEOUT_S = 600

URL_SBDB = "https://ssd-api.jpl.nasa.gov/sbdb.api"
URL_HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
URL_CAD = "https://ssd-api.jpl.nasa.gov/cad.api"

_ultima_richiesta = 0.0


class ErroreRete(RuntimeError):
    """Richiesta non riuscita dopo tutti i tentativi."""


class AssenteOffline(FileNotFoundError):
    """Risposta non congelata e modalità offline attiva."""


def scarica(url: str, tentativi: int = TENTATIVI) -> bytes:
    """GET sequenziale con pausa minima di 1 s tra richieste e attesa crescente sugli errori."""
    global _ultima_richiesta
    errore: Exception | None = None
    for k in range(tentativi):
        attesa = PAUSA_S - (time.monotonic() - _ultima_richiesta)
        if attesa > 0:
            time.sleep(attesa)
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT_S) as r:
                dati = r.read()
            _ultima_richiesta = time.monotonic()
            return dati
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            _ultima_richiesta = time.monotonic()
            errore = e
            codice = getattr(e, "code", None)
            if codice is not None and 400 <= codice < 500 and codice not in (408, 429):
                break
            time.sleep(min(60.0, 2.0 * 2**k))
    raise ErroreRete(f"richiesta non riuscita: {url}: {errore}")


def url_con_parametri(base: str, parametri: dict[str, str]) -> str:
    return base + "?" + urllib.parse.urlencode(parametri, quote_via=urllib.parse.quote)


def horizons_url(parametri: dict[str, str]) -> str:
    """URL dell'API Horizons; i valori testuali vanno passati già tra apici dove serve."""
    return url_con_parametri(URL_HORIZONS, parametri)


def congelato(percorso: Path, url: str, offline: bool) -> bytes:
    """Contenuto congelato in `percorso`; se assente lo scarica e lo salva (salvo modalità offline)."""
    if percorso.exists():
        return percorso.read_bytes()
    if offline:
        raise AssenteOffline(f"risposta non congelata: {percorso}")
    dati = scarica(url)
    percorso.parent.mkdir(parents=True, exist_ok=True)
    percorso.write_bytes(dati)
    return dati


def spk_da_horizons(risposta: bytes) -> bytes:
    """File SPK binario dalla risposta JSON dell'API Horizons (campo 'spk' in base64)."""
    d = json.loads(risposta)
    if "spk" not in d:
        raise ErroreRete(f"Horizons non ha prodotto l'SPK: {d.get('error') or d.get('result', '')[:300]}")
    return base64.b64decode(d["spk"])
