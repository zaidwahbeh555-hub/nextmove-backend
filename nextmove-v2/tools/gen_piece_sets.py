#!/usr/bin/env python3
"""Generate recoloured piece sets from the base set in static/custom/.

Every base SVG uses the same four colours, so a set is a pure text
substitution -- geometry is never touched, which is why this cannot
break rendering. What it CAN break is legibility, so every set is
contrast-checked against every board theme before it is written.
"""
import os, re, sys

import os as _os
BASE = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), "static", "custom")
PIECES = [c + p for c in "wb" for p in "KQRBNP"]

# base colours, exactly as they appear in every file
W_BODY, W_DETAIL = "#F5F2EA", "#242833"
B_BODY, B_DETAIL = "#191C24", "#7E8598"

# set id -> (white body, white detail, black body, black detail)
SETS = {
    "frost":    ("#E9F1FB", "#1B2432", "#141A26", "#93ACCB"),
    "ember":    ("#F8EFE2", "#2B1E18", "#231613", "#C89468"),
    "jade":     ("#EFF4EA", "#16241C", "#121C17", "#83B294"),
    "mono":     ("#FAFAFC", "#1A1A20", "#15151A", "#AEAEBA"),
    # Black Ice: glossy near-black with cold ice-blue edge light.
    "blackice": ("#DFEFF7", "#10171F", "#0D1117", "#74C6E0"),
}

# Board themes: id -> (light square, dark square).
# The light square is the binding constraint: the default "classic" set's black
# outline (#7E8598) only clears 3:1 while the light square stays under 0.0449
# luminance. Every value here was solved against that, not eyeballed.
THEMES = {
    # dark / restrained
    "midnight":  ("#2E3446", "#1E2231"),
    "obsidian":  ("#2B2B32", "#1A1A1F"),
    "royal":     ("#3A3154", "#251E38"),
    "blackice":  ("#28323F", "#12171E"),
    # bright / vivid
    "emerald":   ("#E9F3DC", "#4E9A5A"),
    "lagoon":    ("#D8EFF5", "#3893AE"),
    "azure":     ("#DEE9F8", "#4477C4"),
    "amethyst":  ("#E9E1F8", "#8E6FD4"),
    "coral":     ("#FCE4DC", "#D46A57"),
    "sunset":    ("#FCEBCF", "#D89344"),
    # textured
    "marble":    ("#EFEFEA", "#9AA3AD"),
    "walnut":    ("#E4CBA5", "#A5754C"),
}

# Dark squares cannot sit in the mid-tone dead band. The default piece set's
# black body needs a square above 0.134 luminance to separate, while its light
# outline needs one below 0.045; between those two nothing carries it. Marble
# widens the gap to 0.153. Every dark square above is therefore either clearly
# dark or clearly bright -- never in between. Darkening a failing mid-tone makes
# it worse, not better, which is the trap here.


def lum(hexstr):
    r, g, b = (int(hexstr[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# A piece is legible if EITHER its body or its edge stroke separates from the
# square -- whichever is doing the work at that combination. On a dark board a
# black piece reads by its light outline; on a bright board it reads by its dark
# body and the outline is irrelevant. An earlier version of this gate only ever
# measured the outline, which forced every square darker than 0.0449 luminance
# and is why the first seven themes all looked the same.
THRESHOLD = 3.0


def legible(body, edge, sq):
    return max(contrast(body, sq), contrast(edge, sq))


def check(set_id, w_body, w_edge, b_body, b_edge):
    bad = []
    for theme_id, (light, dark) in THEMES.items():
        for sq_name, sq in (("light", light), ("dark", dark)):
            cw = legible(w_body, w_edge, sq)
            cb = legible(b_body, b_edge, sq)
            if cw < THRESHOLD:
                bad.append((theme_id, sq_name, "white piece", round(cw, 2)))
            if cb < THRESHOLD:
                bad.append((theme_id, sq_name, "black piece", round(cb, 2)))
    return bad


# ── Textured sets ────────────────────────────────────────────────────────────
# Flat fills are swapped for a gradient plus a speckle pattern, so the pieces
# read as polished stone rather than paper cut-outs. Each SVG is its own
# document when loaded through <img>, so these ids cannot collide.
# For the contrast gate a textured piece is judged on its mid tone.
def marble_defs(hi, mid, lo, speck, opacity):
    return (
        '<defs>'
        f'<linearGradient id="tg" x1="0" y1="0" x2="0.25" y2="1">'
        f'<stop offset="0" stop-color="{hi}"/>'
        f'<stop offset=".48" stop-color="{mid}"/>'
        f'<stop offset="1" stop-color="{lo}"/>'
        '</linearGradient>'
        '<pattern id="tex" width="7" height="7" patternUnits="userSpaceOnUse">'
        '<rect width="7" height="7" fill="url(#tg)"/>'
        f'<circle cx="1.6" cy="2.2" r=".85" fill="{speck}" opacity="{opacity}"/>'
        f'<circle cx="5.1" cy="4.9" r=".62" fill="{speck}" opacity="{opacity}"/>'
        f'<circle cx="3.4" cy="6.3" r=".45" fill="{speck}" opacity="{opacity}"/>'
        f'<path d="M0 5.6 Q3 4.4 7 6.1" stroke="{speck}" stroke-width=".35" '
        f'fill="none" opacity="{opacity}"/>'
        '</pattern>'
        '</defs>'
    )


# set id -> dict with the flat colours used for gating, plus the defs block and
# the fill reference that replaces the body colour.
TEXTURED = {
    "marble": {
        "w": {"body": "#EFEAE0", "edge": "#3A3A42",
              "defs": marble_defs("#FFFFFF", "#EFEAE0", "#CFC7B8", "#8A8172", ".16")},
        "b": {"body": "#23252E", "edge": "#9AA1B4",
              "defs": marble_defs("#3A3D48", "#23252E", "#121319", "#000000", ".22")},
    },
}


def apply_texture(svg, side, spec, flat_body):
    """Swap the flat body fill for the pattern, and inject its defs."""
    defs = spec[side]["defs"]
    out = svg.replace("<style>", defs + "<style>", 1)
    # only the body class (.s) gets the texture; strokes and detail stay flat
    out = out.replace(".s{fill:" + flat_body, ".s{fill:url(#tex)", 1)
    if "url(#tex)" not in out or defs not in out:
        raise SystemExit("  !! texture substitution failed for " + side)
    return out


def main():
    all_bad = []
    # the shipped default set counts too
    for set_id, (wb, wd, bb, bd) in [("classic", (W_BODY, W_DETAIL, B_BODY, B_DETAIL))] + list(SETS.items()):
        bad = check(set_id, wb, wd, bb, bd)
        worst = min(min(legible(wb, wd, s), legible(bb, bd, s))
                    for _, sqs in THEMES.items() for s in sqs)
        status = "FAIL" if bad else "ok"
        print(f"{set_id:9s} {status:4s}  worst contrast {worst:.2f}")
        for b in bad:
            print(f"            {b}")
        all_bad += bad

    for set_id, spec in TEXTURED.items():
        bad = check(set_id, spec["w"]["body"], spec["w"]["edge"],
                    spec["b"]["body"], spec["b"]["edge"])
        worst = min(min(legible(spec[s]["body"], spec[s]["edge"], sq)
                        for _, sqs in THEMES.items() for sq in sqs) for s in ("w", "b"))
        print(f"{set_id:9s} {'FAIL' if bad else 'ok':4s}  worst contrast {worst:.2f}  (textured)")
        for b in bad:
            print(f"            {b}")
        all_bad += bad

    if all_bad:
        print("\nlegibility gate FAILED -- nothing written")
        return 1

    written = 0
    for set_id, (wb, wd, bb, bd) in SETS.items():
        outdir = os.path.join(BASE, set_id)
        os.makedirs(outdir, exist_ok=True)
        for code in PIECES:
            src = os.path.join(BASE, code + ".svg")
            svg = open(src).read()
            before = svg
            if code[0] == "w":
                svg = svg.replace(W_BODY, wb).replace(W_DETAIL, wd)
            else:
                svg = svg.replace(B_BODY, bb).replace(B_DETAIL, bd)
            if svg == before:
                print(f"  !! no substitution made in {code}.svg for {set_id}")
                return 1
            # geometry must be byte-identical apart from the colours
            strip = lambda s: re.sub(r"#[0-9A-Fa-f]{6}", "", s)
            if strip(svg) != strip(before):
                print(f"  !! geometry changed in {set_id}/{code}.svg")
                return 1
            open(os.path.join(outdir, code + ".svg"), "w").write(svg)
            written += 1

    for set_id, spec in TEXTURED.items():
        outdir = os.path.join(BASE, set_id)
        os.makedirs(outdir, exist_ok=True)
        for code in PIECES:
            side = "w" if code[0] == "w" else "b"
            flat_body = W_BODY if side == "w" else B_BODY
            flat_edge = W_DETAIL if side == "w" else B_DETAIL
            svg = open(os.path.join(BASE, code + ".svg")).read()
            svg = svg.replace(flat_edge, spec[side]["edge"])
            svg = apply_texture(svg, side, spec, flat_body)
            open(os.path.join(outdir, code + ".svg"), "w").write(svg)
            written += 1

    print(f"\nwrote {written} files across {len(SETS) + len(TEXTURED)} sets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
