# ChessForge — Training System Spec

## The correctness gate (fixed bug)
Previously a "Hanging piece" drill could serve a position with nothing hanging. Now **every** position is
validated server-side before it is served, in `position_has_pattern()`:

| Pattern | Assertion |
|---|---|
| Hanging piece | a piece of the side to move is attacked by more pieces than defend it |
| Missed tactic | a legal move wins material outright, or creates a fork |
| King safety issue | king on the back rank with no luft, or uncastled with castling rights |
| Endgame mistake | total non-king material <= 12 |
| Opening mistake | move <= 12 and at least two minor pieces undeveloped |

`validated_pool()` discards anything that fails, and also discards positions whose stored solution is not a
legal move. Verified: **17/17 shipped positions contain their pattern** (2 candidates were rejected by the gate).

## The five stages
A drill is a learning sequence, not a puzzle list:

1. **Micro-lesson** (~40s) — what the pattern is and the mental habit that prevents it.
2. **Guided example** — GM Forge walks a position out loud, pointing at each square. You watch (worked-example effect).
3. **Recognise it** — multiple choice with plausible distractors, plus a confidence rating (Certain / Fairly sure /
   Guessing) captured **before** the answer is shown. Confident-and-wrong gets the fullest correction.
4. **Play it** — no options. You produce the move on a real board (retrieval, not recognition).
5. **Rewrite the mistake** — the position from your own game where this pattern cost you. Find the right move,
   then watch how the game would have gone.

## Wrong-answer feedback — always three parts
1. **What you were probably thinking** — the plausible faulty reasoning, named.
2. **Where that breaks** — the concrete refutation, with squares.
3. **The rule to carry forward** — one memorable sentence.

Never "Incorrect. The answer is Nf3."

## Scheduling
- Intervals widen: 1d, 3d, 7d, 14d, 30d.
- Strength bands: Vulnerable (0-20) / Learning (20-50) / Building (50-80) / Automatic (80-100).
- **Interleaving** switches on at 60% strength (`interleave_partners()`): the pattern is mixed with two others so
  you must first work out which problem you are facing.
- Daily streak, custom SVG flame, no emoji.

## Endpoints
`/training/weaknesses` `/training/next` `/training/submit` `/training/streak` `/training/progress` `/training/lesson`

## Why this works (shown in-app)
Spacing (Ebbinghaus's forgetting curve; Bjork's desirable difficulties), the hypercorrection effect
(Metcalfe), retrieval practice (Karpicke & Roediger), and interleaving.
