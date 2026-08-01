# Tests

No framework — each file runs standalone from `nextmove-v2/`.

```sh
python3 tests/test_socratic.py     # coach must never name the engine's move  (13 checks)
python3 tests/test_premove.py      # premove FEN side-flip, incl. illegal positions
python3 tests/test_cosmetics.py    # no cosmetic combination is illegible     (471 checks)
python3 tests/test_limits.py       # free accounts get only what Free includes (30 checks)
node    tests/test_solvehelp.js    # hint ladder must not leak the answer early (24 checks)
node    tests/test_coach.js        # rebuilt coach render surfaces             (12 checks)
node    tests/test_gamesetup.js    # turn-indicator state machine              (7 checks)
node    tests/test_cosmetics.js    # equipping repaints all boards; free vs Pro (28 checks)

node    tests/test_palette.js      # command palette exposes the play modes    (17 checks)
node    tests/test_ladder.js       # think-it-through rungs + retractable rails (37 checks)
node    tests/test_upgrade_intent.js # landing-page upgrade intent survives signup (14 checks)
node    tests/test_candidates.js   # "Play them out" really plays them out    (21 checks)
node    tests/test_tour.js         # new-account tour, spotlight + placement   (39 checks)
```

`test_cosmetics.py` re-checks every piece set against every board theme on both
square shades, reading each set's real colours back off disk rather than from a
duplicated table. A textured set has no flat body fill, so its effective tone is
read from the middle stop of its gradient.

**The rule:** a piece is legible if EITHER its body or its edge stroke clears 3:1
against the square. On a dark board the light outline carries a black piece; on a
bright board its dark body does. An earlier version gated the outline alone,
which forces every square below 0.0449 luminance — that is why the first seven
themes all came out dark and nearly identical. If you find yourself unable to use
a colour, check you are not re-introducing that mistake.

**The dead band:** a dark square must not sit between roughly 0.045 and 0.153
luminance. In that range neither a dark body nor a light outline separates, and
*darkening* a failing square makes it worse — go brighter instead. Walnut and
Amethyst both had to move up. The test names this case explicitly rather than
reporting it as a bare contrast failure.

**If you add a theme or a set, run this before shipping it.** It has rejected two
palettes outright, including one where the default pieces were illegible on four
proposed themes. `tools/gen_piece_sets.py` regenerates every set and applies the
same gate before it will write anything.

`test_cosmetics.js` covers the risky half — that equipping actually reaches all
four board surfaces. It asserts a theme sets only paint properties and no layout
property, that a piece-set change repaints occupied squares in place without
rebuilding the grid (a rebuild is the old flicker bug), and that free players are
shown previews but never a buy button.

The JS files parse `static/js/main.js` and `eval` the module under test against a
DOM shim, so they break if a module is renamed — that is intentional, it catches
a rename that would silently orphan the real code.

Run all nine before any push. They are fast (seconds) and have caught real
regressions.
