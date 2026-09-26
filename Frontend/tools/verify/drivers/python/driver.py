"""Python verification driver.

Appended to an algorithm's ``lesson.code.python`` and run once per expectation
case. Dev-time only (tools/verify); never bundled.

The harness appends a call to :func:`_verify_main`, which finds the entry
function by name, converts the JSON arguments, calls it, and writes
``output.json``.

Argument conversion is mostly pass-through — Python's ``json`` module already
maps JSON arrays to lists and JSON objects to dicts — so the only special case
is the ``graph`` glue, which turns ``{"nodes": [...], "edges": [...]}`` into an
adjacency dict. Building adjacency matters: a BFS that re-scans the whole edge
list on every pop is a different, worse algorithm than the one being taught.
"""

import json
import os
import sys


def _to_adjacency(spec: dict) -> dict:
    nodes = spec["nodes"]
    index = {label: i for i, label in enumerate(nodes)}
    adj: dict = {i: [] for i in range(len(nodes))}
    for edge in spec["edges"]:
        u, v = index[edge[0]], index[edge[1]]
        w = edge[2] if len(edge) > 2 else 1
        adj[u].append((v, w))
    return adj


def _verify_main(entry: str, glue: str = "auto") -> None:
    try:
        with open("input.json") as fh:
            spec = json.load(fh)
        fn = globals().get(entry)
        if fn is None or not callable(fn):
            raise RuntimeError(f"no callable named {entry!r} in this module")

        args = spec["args"]
        if glue == "graph":
            args = [_to_adjacency(a) if isinstance(a, dict) else a for a in args]

        result = fn(*args)
        with open("output.json", "w") as fh:
            json.dump({"ok": True, "value": result}, fh, default=_fallback)
    except Exception as exc:  # noqa: BLE001 - we want the message, whatever it is
        with open("output.json", "w") as fh:
            json.dump({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, fh)


def _fallback(value):
    """Make tuples, sets and None-ish values JSON-comparable with the other languages."""
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=repr)
    if isinstance(value, tuple):
        return list(value)
    if hasattr(value, "tolist"):
        return value.tolist()
    return str(value)


_verify_main(sys.argv[1] if len(sys.argv) > 1 else "", sys.argv[2] if len(sys.argv) > 2 else "auto")
os.remove("input.json")
