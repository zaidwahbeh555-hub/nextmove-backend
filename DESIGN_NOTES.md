# ChessForge — Design Notes

## What I studied

**chess.com / Lichess play screens.** The board is never a panel among panels — it owns roughly 70% of
viewport height and everything else is subordinate. Lichess puts the eval bar as a thin vertical strip
flush against the board rather than a card, and the move list is a narrow column that never competes for
attention. Neither site boxes the board in a bordered container; the board *is* the container.
→ **Decision:** board = `min(72vh, 720px)`, floor 560px, and it is the largest element on the Play screen.
Eval becomes a 6px strip flush under the board. Move list collapses to a 4px edge strip, expanding on hover.

**Linear / Vercel / Raycast / Arc.** Their dark modes get depth from *surface elevation*, not borders.
A card is a lighter background, not an outlined box. Borders appear only on hover/focus/selected. They use
almost no colour — one accent, used once per screen. Type hierarchy carries the weight instead. Body text is
never heavy on dark; 700+ blooms against a dark field.
→ **Decision:** four surface levels (`--base` → `--surface-3`), zero decorative borders, gradient limited to
one element per screen plus a single 8% ambient glow. Body weight capped at 400, labels 500, headings 700.

**Duolingo lesson flow.** A teaching step is one idea at a time, always paced, and feedback is immediate and
specific. Progress is visible at every moment (the dot rail), so effort feels rewarded. Crucially the subject
of the question is always on screen — you never answer about something you can't see.
→ **Decision:** five drill stages with a persistent dot rail, and the hard rule that **the board is visible in
every stage**. Wrong answers get three-part feedback rather than a verdict.

## Decisions made because of it

| Problem observed | Decision |
|---|---|
| Board was small and off to the side | Board is the centre of gravity, optically nudged 4% left to balance GM Forge's mass |
| Black text on black | No pure `#000`/`#fff` anywhere; `--text-3` is the darkest text permitted; contrast verified programmatically |
| GM Forge had no eyes | Face layers were killed by an ID-specificity collision — show/hide now uses matched specificity |
| MCQ with no board | Every stage renders the position beside the question; GM Forge points at the squares involved |
| "Homemade" feel | Single easing curve `cubic-bezier(.32,.72,0,1)`, 8px spacing grid, fixed 7-step type scale, one icon set |

## Motion
One curve everywhere: `cubic-bezier(.32,.72,0,1)`. Hover 120ms · enter/exit 240ms · modal & coach 400ms ·
piece move 200ms · lists staggered 40ms. Only `transform` and `opacity` animate — never layout properties.
`prefers-reduced-motion` disables all of it.

## Colour reasoning
Pure black flattens depth because elevation can only go lighter. `#0D0D14` leaves room to build four levels
upward. Pure white text vibrates on dark; `#E8EAF2` at 91% keeps the edge off while staying above 7:1 on every
surface. The cyan→violet gradient is reserved so it still reads as an event when it appears.
