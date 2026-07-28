# GM Forge — Moment → Intensity → Primitive

## The decision table

| Detected geometry | Intensity | Primitive | Blocks board? |
|---|---|---|---|
| Fork against you (`geo_fork`) | **critical** | sequenced dialogue + finger sweep + tile-tap | **yes** |
| Your piece hanging (`geo_hanging`, attackers > defenders) | **critical** | dialogue + tile-tap ("tap the piece that is hanging") | **yes** |
| Enemy piece loose, or engine gap ≥150cp | **opportunity** | draggable stop sign + tile-tap | **no** |
| Piece of yours trapped (`geo_trapped`) | **notable** | one-line question in bubble | no |
| Plan/structure moment | **notable** | one-line fact-checked question | no |
| Recapture, book move, quiet shuffle | **routine** | 4–10 word reaction | no |

Only the two **critical** rows lock input. An opportunity never blocks — the stop sign is draggable and
the user can shove it aside and play anyway.

## The reframe rule

On a fork, the coach does **not** open with a move. It opens by fixing the question. Which reframe fires is
decided by the engine, never assumed:

| Engine says | Reframe |
|---|---|
| every capture loses ≥100cp | "The question is not which piece to capture with — every capture loses material. Can you remove the defender, or move with tempo?" |
| captures differ by ≥100cp | "You are weighing X against Y as if they are the same choice. They are not — one costs N pawns more." |
| a capture is fine | "The capture works, but only because of what comes after. Look at the recapture first." |

**Worked example — the reference position**
`4rrk1/pbpp1ppp/1p6/4n3/1b4n1/2NB1N2/PPPBRPPP/2KR4 w - - 0 1`
Black knight on e5 forks the bishop on d3 and the knight on f3, defended from g4 and e8.
The user assumed both captures lost. Stockfish depth 20: **Nxe5 −0.89 (best)**, **Rxe5 −3.66**.
So branch 2 fires — the lesson is that the two captures are not equivalent, not that both fail.
This is why every claim is engine-checked before it is spoken.

## Sequencing
Steps play 1.4s apart. The finger sweeps to each step's `point[]` without retracting between steps
(`ForgePointer.sequence`). Clicking anywhere skips to the next step. The arm retracts 1.8s after release.

## Interaction primitives
- **3a Stop sign** — `StopSign.show()`, absolutely positioned over the board, pointer-drag to move, board stays live.
- **3b Blocking** — `body.coach-blocking` dims every square to 55% except `.sq-focus` (cyan ring), input locked.
- **3c MCQ** — options render in the bubble, keys 1–4.
- **3d Tile-tap** — capture-phase click listener on `.fb-sq`; right → cyan pulse, wrong → red shake + retry,
  two wrong → he points at it himself.
- **3e Help** — concept label is dynamic (`CONCEPTS[concept]`), Hint narrows without naming a move,
  Answer reveals and marks the moment `revealed` in `GameLog` for post-game training.

## Trap Trainer
`choose_trap_move()` takes Stockfish's top 5, keeps only moves within **60cp** of best, then ranks the survivors
by `_trap_score()` — how likely the resulting position is to expose the user's weakness. It never plays outside
the window, so the bot still plays credible chess. Measured over 50 bot moves: max loss 60cp, mean 6.6cp, 0 violations.

## Post-game
`GameLog` records every critical/opportunity moment during play. `/game-review` returns a headline verdict,
the moment list, pattern counts, and a prescription routing to the drill for the costliest pattern, then offers
a Trap Trainer game targeting it. That closes the loop: play → coached → review → drill → replay under pressure.
