# Tests

No framework — each file runs standalone from `nextmove-v2/`.

```sh
python3 tests/test_socratic.py     # coach must never name the engine's move  (13 checks)
python3 tests/test_premove.py      # premove FEN side-flip, incl. illegal positions
python3 tests/test_cosmetics.py    # no cosmetic combination is illegible     (198 checks)
node    tests/test_solvehelp.js    # hint ladder must not leak the answer early (24 checks)
node    tests/test_coach.js        # rebuilt coach render surfaces             (12 checks)
node    tests/test_gamesetup.js    # turn-indicator state machine              (7 checks)
node    tests/test_cosmetics.js    # equipping repaints every board, in place  (14 checks)
```

`test_cosmetics.py` re-checks every piece set against every board theme on both
square shades, reading each set's real colours back off disk rather than from a
duplicated table. A white piece is gated on its body mass, a black piece on its
outline -- the black body is deliberately near-black, so the outline is what
carries it. The binding constraint is the light square: the default set's
outline only clears 3:1 below 0.0449 luminance, which is what every theme value
was solved against. **If you add a theme, run this before shipping it.**

`test_cosmetics.js` covers the risky half -- that equipping actually reaches all
four board surfaces. It asserts a theme sets the two square variables and no
layout property, and that a piece-set change repaints occupied squares in place
without rebuilding the grid (a rebuild is the old flicker bug).

The JS files parse `static/js/main.js` and `eval` the module under test against a
DOM shim, so they break if a module is renamed — that is intentional, it catches
a rename that would silently orphan the real code.

Run all five before any push. They are fast (seconds) and have caught real
regressions.
