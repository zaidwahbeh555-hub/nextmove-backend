# Tests

No framework — each file runs standalone from `nextmove-v2/`.

```sh
python3 tests/test_socratic.py     # coach must never name the engine's move  (13 checks)
python3 tests/test_premove.py      # premove FEN side-flip, incl. illegal positions
node    tests/test_solvehelp.js    # hint ladder must not leak the answer early (24 checks)
node    tests/test_coach.js        # rebuilt coach render surfaces             (12 checks)
node    tests/test_gamesetup.js    # turn-indicator state machine              (7 checks)
```

The JS files parse `static/js/main.js` and `eval` the module under test against a
DOM shim, so they break if a module is renamed — that is intentional, it catches
a rename that would silently orphan the real code.

Run all five before any push. They are fast (seconds) and have caught real
regressions.
