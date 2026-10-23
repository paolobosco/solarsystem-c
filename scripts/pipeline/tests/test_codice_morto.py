"""Codice morto della pipeline (RNF4), come tests/progetto/codiceMorto.test.ts per src: ogni funzione o classe
definita al livello di un modulo è usata dal modulo stesso, da un altro modulo, da un comando o da una prova.

Riferimenti risolti con ast: nome nel modulo (escluso il corpo della definizione stessa), `from M import nome`,
`alias.nome` con alias di M (anche relativo), stringa uguale al nome (setattr, getattr, monkeypatch).
"""

from __future__ import annotations

import ast
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
DEFINIZIONI = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
ESCLUSE = {".venv", ".venv-assist", ".cache", ".pytest_cache", ".ruff_cache", "__pycache__", "raw", "out"}


def _moduli() -> dict[str, tuple[ast.Module, bool]]:
    """Nome puntato del modulo -> (albero, è un pacchetto)."""
    out = {}
    for p in sorted(RADICE.rglob("*.py")):
        parti = p.relative_to(RADICE).parts
        if ESCLUSE & set(parti[:-1]):
            continue
        pacchetto = parti[-1] == "__init__.py"
        nome = ".".join(parti[:-1] if pacchetto else (*parti[:-1], parti[-1][:-3]))
        out[nome] = (ast.parse(p.read_text(encoding="utf-8"), filename=str(p)), pacchetto)
    return out


def _base_relativa(modulo: str, pacchetto: bool, livello: int, nome: str | None) -> str:
    parti = modulo.split(".") if pacchetto else modulo.split(".")[:-1]
    if livello > 1:
        parti = parti[: len(parti) - (livello - 1)]
    return ".".join([*parti, *([nome] if nome else [])])


def _usi(moduli: dict[str, tuple[ast.Module, bool]]) -> set[tuple[str, str]]:
    """Coppie (modulo, nome) usate."""
    usati: set[tuple[str, str]] = set()
    stringhe: set[str] = set()
    for modulo, (albero, pacchetto) in moduli.items():
        alias: dict[str, str] = {}
        for nodo in ast.walk(albero):
            if isinstance(nodo, ast.Import):
                for a in nodo.names:
                    alias[a.asname or a.name.split(".")[0]] = a.name if a.asname else a.name.split(".")[0]
            elif isinstance(nodo, ast.ImportFrom):
                base = _base_relativa(modulo, pacchetto, nodo.level, nodo.module) if nodo.level else (nodo.module or "")
                for a in nodo.names:
                    if f"{base}.{a.name}" in moduli:
                        alias[a.asname or a.name] = f"{base}.{a.name}"
                    else:
                        usati.add((base, a.name))

        def risolvi(e: ast.expr, alias: dict[str, str] = alias) -> str | None:
            if isinstance(e, ast.Name):
                return alias.get(e.id)
            if isinstance(e, ast.Attribute):
                b = risolvi(e.value)
                return f"{b}.{e.attr}" if b is not None else None
            return None

        for istr in albero.body:
            proprietario = istr.name if isinstance(istr, DEFINIZIONI) else None
            for nodo in ast.walk(istr):
                if isinstance(nodo, ast.Name) and nodo.id != proprietario:
                    usati.add((modulo, nodo.id))
                elif isinstance(nodo, ast.Attribute):
                    b = risolvi(nodo.value)
                    if b is not None:
                        usati.add((b, nodo.attr))
                elif isinstance(nodo, ast.Constant) and isinstance(nodo.value, str) and nodo.value.isidentifier():
                    stringhe.add(nodo.value)
    return usati | {(m, s) for m in moduli for s in stringhe}


def test_ogni_funzione_e_classe_della_pipeline_e_usata() -> None:
    moduli = _moduli()
    assert {"satellites", "sats.kernel", "small.orbite", "common.frames", "time_model"} <= set(moduli)
    usati = _usi(moduli)
    definite = [
        (m, istr.name, istr.lineno)
        for m, (albero, _) in moduli.items()
        if not m.startswith("tests")
        for istr in albero.body
        if isinstance(istr, DEFINIZIONI)
    ]
    assert len(definite) > 500
    inutilizzate = [f"{m.replace('.', '/')}.py:{riga} {nome}" for m, nome, riga in definite if (m, nome) not in usati]
    assert inutilizzate == []
