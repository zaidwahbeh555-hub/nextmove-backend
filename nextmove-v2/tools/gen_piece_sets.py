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
    "midnight": ("#2E3446", "#1E2231"),
    "slate":    ("#343A48", "#23262F"),
    "forest":   ("#28382F", "#1A241E"),
    "ember":    ("#3C312A", "#281F1A"),
    "royal":    ("#3A3154", "#251E38"),
    "ice":       ("#313A4A", "#212734"),
    "obsidian":  ("#2B2B32", "#1A1A1F"),
    "blackice":  ("#28323F", "#12171E"),
}


def lum(hexstr):
    r, g, b = (int(hexstr[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# A white piece reads by its body mass; a black piece reads by its outline,
# since the body is deliberately near-black. Gate each against what carries it.
THRESHOLD = 3.0


def check(set_id, w_body, b_detail):
    bad = []
    for theme_id, (light, dark) in THEMES.items():
        for sq_name, sq in (("light", light), ("dark", dark)):
            cw = contrast(w_body, sq)
            cb = contrast(b_detail, sq)
            if cw < THRESHOLD:
                bad.append((theme_id, sq_name, "white body", round(cw, 2)))
            if cb < THRESHOLD:
                bad.append((theme_id, sq_name, "black outline", round(cb, 2)))
    return bad


def main():
    all_bad = []
    # the shipped default set counts too
    for set_id, (wb, wd, bb, bd) in [("classic", (W_BODY, W_DETAIL, B_BODY, B_DETAIL))] + list(SETS.items()):
        bad = check(set_id, wb, bd)
        worst = min(
            [contrast(wb, s) for _, sqs in THEMES.items() for s in sqs] +
            [contrast(bd, s) for _, sqs in THEMES.items() for s in sqs]
        )
        status = "FAIL" if bad else "ok"
        print(f"{set_id:9s} {status:4s}  worst contrast {worst:.2f}")
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
    print(f"\nwrote {written} files across {len(SETS)} sets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
