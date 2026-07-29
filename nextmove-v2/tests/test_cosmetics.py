#!/usr/bin/env python3
"""Cosmetics must never ship an illegible board.

Every piece set has to stay readable on every board theme, on both square
shades. A white piece reads by its body mass; a black piece reads by its
outline, since the body is deliberately near-black -- so each is gated against
whatever actually carries it.

Run from nextmove-v2/:  python3 tests/test_cosmetics.py
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from app import BOARD_THEMES, PIECE_SETS, get_cosmetics, cosmetic_item  # noqa: E402

# The four colours every piece SVG is built from.
BASE = {"w_body": "#F5F2EA", "w_detail": "#242833", "b_body": "#191C24", "b_detail": "#7E8598"}
THRESHOLD = 3.0

fails = []
checks = 0


def ok(cond, msg):
    global checks
    checks += 1
    if not cond:
        fails.append(msg)


def lum(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def set_colors(set_id):
    """Read a set's real colours back off disk, not from a duplicated table."""
    if set_id == "classic":
        return BASE["w_body"], BASE["b_detail"]
    d = os.path.join(ROOT, "static", "custom", set_id)
    wk = open(os.path.join(d, "wK.svg")).read()
    bk = open(os.path.join(d, "bK.svg")).read()
    w_body = re.search(r"\.s\{fill:(#[0-9A-Fa-f]{6})", wk).group(1)
    b_detail = re.search(r"\.d\{fill:(#[0-9A-Fa-f]{6})", bk).group(1)
    return w_body, b_detail


# ── every set x every theme x both shades ────────────────────────────────────
for ps in PIECE_SETS:
    w_body, b_detail = set_colors(ps["id"])
    for th in BOARD_THEMES:
        for shade in ("light", "dark"):
            sq = th[shade]
            cw, cb = contrast(w_body, sq), contrast(b_detail, sq)
            ok(cw >= THRESHOLD,
               "white %s body on %s %s: %.2f < %.1f" % (ps["id"], th["id"], shade, cw, THRESHOLD))
            ok(cb >= THRESHOLD,
               "black %s outline on %s %s: %.2f < %.1f" % (ps["id"], th["id"], shade, cb, THRESHOLD))

# ── every non-default set has all 12 files on disk ───────────────────────────
for ps in PIECE_SETS:
    if not ps["dir"]:
        continue
    d = os.path.join(ROOT, "static", "custom", ps["id"])
    for code in [c + p for c in "wb" for p in "KQRBNP"]:
        ok(os.path.exists(os.path.join(d, code + ".svg")),
           "missing %s/%s.svg" % (ps["id"], code))

# ── exactly one free default per kind, and it is what a new user equips ──────
for kind, catalog in (("board", BOARD_THEMES), ("pieces", PIECE_SETS)):
    free = [i for i in catalog if i["price"] == 0]
    ok(len(free) == 1, "%s should have exactly one free default, has %d" % (kind, len(free)))
    ids = [i["id"] for i in catalog]
    ok(len(ids) == len(set(ids)), "duplicate %s ids" % kind)

fresh = get_cosmetics({})
ok(fresh["equipped"]["board"] == "midnight", "new user should start on midnight")
ok(fresh["equipped"]["pieces"] == "classic", "new user should start on classic")

# ── a stale or unowned equip falls back rather than rendering undefined ──────
broken = get_cosmetics({"cosmetics": {"owned": {"board": ["royal"]},
                                      "equipped": {"board": "does-not-exist", "pieces": "ember"}}})
ok(broken["equipped"]["board"] == "midnight", "unknown theme must fall back to the free default")
ok(broken["equipped"]["pieces"] == "classic", "unowned set must fall back to the free default")
ok("midnight" in broken["owned"]["board"], "the free default is always owned")

ok(cosmetic_item("board", "nope") is None, "unknown item must not resolve")

print("cosmetics: %d checks, %d failed" % (checks, len(fails)))
for f in fails:
    print("  FAIL", f)
sys.exit(1 if fails else 0)
