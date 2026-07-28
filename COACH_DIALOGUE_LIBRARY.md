# ChessForge — GM Forge Dialogue Library

_Every line GM Forge can say. Selection is randomised and non-repeating (last 20 tracked per session). Placeholders such as `{best}`, `{sq}`, `{fpiece}`, `{opp_san}` are filled live from the Stockfish read of your actual position — a named move is **always** a real engine move._


## Engagement levels

He responds to **every** move, but only stops the game when it matters:

| Position state | Response |
|---|---|
| **Critical** — fork, pin, blunder, winning tactic, brilliancy | Full stop: finger points, question, choice chips, board locked |
| **Notable** — development choice, structure decision, plan forming | One short question in the bubble, non-blocking |
| **Routine** — forced recapture, book move, quiet shuffle | A single reactive line, 4–10 words, no question |


## Guarantees enforced by tests

- **No banned filler.** `line_is_clean()` blocks "good move", "nice", "keep developing", "watch your king safety", "think carefully", "consider your options", "that's interesting", "try to control the center".
- **Every line is concrete.** `line_is_concrete()` requires a square/SAN move, real chess vocabulary, or a predicted consequence.
- **No invented moves.** `validate_move_in_pv()` checks any interpolated move against the engine's own top lines for that exact position before it is returned.
- Verified over 4,000 rendered messages: 0 banned, 0 unfilled placeholders, 0 non-concrete.


## Critical moments — ask, wait, reveal


### opponent fork

**Asks:**
- Wait — stop. That {fpiece} on {fsq} just forked you. What two pieces is it hitting?
- Uh oh. Classic fork. {f1} and {f2} are both hanging off that {fpiece}. You can't save both — so which loss hurts less?
- See it? One {fpiece}, two targets. That's a fork. What's your plan?
- Hold on. Before you move — that {fpiece} hits {f1} AND {f2}. This isn't about saving both. It's about choosing.
- Ooh, nasty. He forked you. Count it: {f1}, {f2}. Which one do you keep?
- That {fpiece} landed on {fsq} and hits two things at once. You know the word for that?
- Danger. It's a fork — {f1} and {f2}. Can you save the bigger one, or hit back harder?
- Pause. A fork means you lose material unless you get creative. Any check or counter-threat here?
- He didn't drop that {fpiece} there by accident. It forks {f1} and {f2}. What's the least-bad outcome?
- This is the moment. Forked. Save a piece, or make a bigger threat and ignore his?
- Both {f1} and {f2} attacked by one {fpiece}. Which matters more right now?
- Fork alert. Sometimes the answer isn't retreat — it's an in-between move. See any checks first?
- Okay, deep breath. It's a fork. Run every forcing reply — checks, captures, threats.
- That {fpiece} is doing a lot of work. Two of your pieces in its sights. What's the priority?
- He's trying to win material with that fork. Prove the forked piece can bite back with tempo.
- Two targets, one attacker — the definition of a fork. Which piece leaves with tempo?

**Reveals:**
- Yeah — it's a fork. {best} is the move: it saves what matters and keeps you in the game. You don't beat a fork by panicking, you beat it by choosing well.
- Right. {best}. When you're forked, give up the smaller thing or create a bigger threat — never freeze.
- Exactly. {best} keeps your most valuable piece and lets the other go on your terms. Damage control done right.
- That's it — {best}. It moves with a threat, so he gets no free tempo. Forks punish loose coordination; remember the pattern.
- Good. {best} is cleanest. Losing the exchange here is fine — your position stays healthy.
- See? {best}. The trick with forks: look for a check or counter-attack BEFORE you accept the loss.
- Yep — {best}. He wins a little, but you keep the initiative. A trade worth making.
- {best}. File it away: knights fork, so watch any square a knight can hit two of your pieces from.
- Correct — {best}. You save the queen and let the exchange go. Material is not everything; activity and king safety count.
- {best} is the answer. A fork you see coming is half-defused. Next time, spot the radius early.

### opponent pin

**Asks:**
- Careful — your {pinned} on {pinsq} is pinned. If it moves, something worse falls. Feel the tension?
- That's a pin on {pinsq}. The piece is stuck. Break it, defend it, or challenge the pinner?
- Pinned piece on {pinsq}. Rule of thumb: pile up on it or kick the pinner. Which do you fancy?
- See how your {pinned} can't move? That's a pin. What breaks it?
- He pinned you. A pinned piece is only as safe as the square it's stuck on. How do you unpin?
- Tension check: {pinned} on {pinsq} is pinned to your king. What's the plan?
- Pins win games — right now YOU'RE pinned. Add a defender, or evict the pinner?
- That piece on {pinsq} is frozen. Options: block, trade the pinner, make luft. Pick one.
- A pin restricts you. Don't just live with it — can you challenge that pinning piece?
- He's pinning your {pinned}. Sometimes the fix is a simple pawn kicking the attacker. See it?
- Pinned. The danger is he piles on {pinsq}. Defend it now, or lose it later?
- Notice the pin. Is anything relying on your {pinned} right now? Because it can't help.
- That's a pin to the king — absolute. The piece literally can't move. How do you relieve it?
- Feel the pressure on {pinsq}? Break the pin before he adds a second attacker.
- He pinned you to win that piece. Beat him to it — what's the move?

**Reveals:**
- Yeah — {best} deals with the pin: it defends {pinsq}, evicts the pinner, or covers the piece behind. Pins reward patience.
- Right, {best}. Never leave a pinned piece under-defended — attackers stack up fast.
- {best} breaks the pin. Your piece is free and working again.
- Exactly. {best}. When pinned, challenge the pinner — trading it off ends the problem instantly.
- Good — {best}. Pinned pieces are targets; you just took yours off the hit list.
- That's it, {best}. A pin is a relationship — break the link and the pressure's gone.
- {best}. Defused. Watch for pins along the same line as your king and queen.
- Yep, {best}. Add a defender or kick the pinner — you chose well.

### opponent threat single piece

**Asks:**
- Hold up — see what he just did? Your {piece} on {sq}. Actually safe?
- That move hits your {piece} on {sq}. Defend it, move it, or hit back — which?
- Ooh, your {piece} on {sq} is loose. Count attackers and defenders. Even?
- He's eyeing your {piece} on {sq}. LPDO — loose pieces drop off. What do you do?
- Before you touch anything — is your {piece} on {sq} defended enough?
- His last move had a point: it hits {sq}. Do you see the threat?
- Your {piece} on {sq} — safe or not? Be honest with the count.
- Danger on {sq}. Move it, guard it, or make a bigger threat. Pick your medicine.
- That {piece} on {sq} hangs if you ignore it. What saves it with tempo?
- He wants your {piece} on {sq}. Can you defend AND improve at once?
- Look at {sq}. If you pass, what happens next move?
- Simplest question in chess: can he take {sq} for free?
- That's a threat, not a bluff. {sq} needs attention. What's best?
- Your {piece} is under fire on {sq}. Retreat, defend, or counter-punch?
- He just attacked {sq}. Don't autopilot — deal with the threat first.

**Reveals:**
- Yeah — {best}. Your {piece} on {sq} was hanging; that saves it cleanly. Always meet a threat, or make a bigger one.
- Right, {best}. Loose pieces drop off — you kept yours on the board.
- {best} handles it. Defend or out-threat him; you did it the calm way.
- Exactly — {best}. See how it covers {sq} and keeps you coordinated?
- Good. {best}. A move you don't answer is a move that beats you — you answered.
- {best} is the fix. Simple, solid, no drama. Good defense.
- Yep — {best}. The piece on {sq} is safe and your position's intact.
- That's it, {best}. Threats first, plans second — right order.

### player can win material

**Asks:**
- Ooh — I smell something. His {tpiece} on {tsq} looks loose. Can you punish it?
- Wait, is that free? Look hard at {tsq}. What can you win?
- Checks, captures, threats — run the list. Something's hanging for HIM. Where?
- He left the {tpiece} on {tsq} undefended. Are you taking it?
- Calculate spot, not a vibe spot. What wins material here?
- Free-stuff alert on {tsq}. Grab it — or is it a trap? Check first.
- You've got a tactic. His {tpiece} on {tsq} is the clue. Find the move.
- What's your most forcing move right now? Material's on the table.
- His {tpiece} is loose. Before you take — any in-between move that wins more?
- Opportunity knocks on {tsq}. Win it cleanly, or does he have a trick?
- He blundered. The {tpiece} on {tsq} is hanging. Prove you see it.
- Don't be polite — that {tpiece} on {tsq} is asking to be taken. Right?
- Material's there. Cleanest way to bag the {tpiece}?
- Sharpen up — his {tpiece} on {tsq} has no defender. What do you play?
- You can win material. Target is {tsq}. Make sure it's safe, then strike.

**Reveals:**
- Yes! {best}. Wins the {tpiece} clean — you spotted the loose piece and pounced. Greedy is good when it's safe.
- Boom — {best}. Free material. Always scan for undefended enemy pieces first.
- That's it, {best}. You cash in on {tsq}. LPDO in your favor this time.
- {best}! Clean win — and you checked it wasn't a trap first. That's the discipline.
- Exactly — {best} wins the {tpiece}. Punishing loose pieces is how rating points are made.
- Yep, {best}. Material in the bank. Now convert — trade pieces when you're up.
- There it is — {best}. He left the {tpiece} loose and you punished it.
- {best}. Winning material is step one; simplifying toward the endgame is step two.

### player about to blunder

**Asks:**
- Wait — WAIT. Before the natural move, look again. Your {piece} on {sq} is about to fall. See it?
- Stop. The obvious move loses your {piece} on {sq}. There's a better path. Find it.
- Careful — the tempting move hangs {sq}. Slow down. What's the safe square?
- Hold on. I can feel you wanting to move fast. {sq} is a trap for you. Look deeper.
- Danger to YOU. The move you want drops the {piece} on {sq}. Cleaner option?
- This is a losing-your-{piece} moment if you're careless. Where's the accurate move?
- Don't autopilot. {sq} is the problem square. What did he actually threaten?
- Breathe. The instinctive move loses on {sq}. What's the precise reply?
- One wrong step and your {piece} on {sq} is gone. Calculate before you commit.
- He set a little trap. Play the natural move and {sq} falls. Sidestep it?
- This is where games are lost — a careless move on {sq}. Be accurate.
- Tempting, right? But it hangs {sq}. What's the disciplined choice?

**Reveals:**
- Yeah — {best}. The natural move dropped your {piece}; this keeps it all together. Good players slow down right here.
- Right, {best}. You dodged the blunder. That pause you took? That's the whole skill.
- {best} is safe. The tempting move lost {sq}; this doesn't. Calculation over instinct.
- Exactly — {best}. Crisis averted. The move that FEELS right isn't always right.
- Good. {best}. You just saved half a point by not rushing. Remember the feeling.
- {best}. The accurate one. Blunders come from autopilot — you switched it off.
- Yep — {best}. Your {piece} lives, your position holds. Disciplined.

### critical castling decision

**Asks:**
- Your king's still in the middle at move {fullmove}. Time to castle? Or something sharper first?
- Gut check: is your king safe? You haven't castled. What's the priority?
- The center's about to open and your king's home. Nervous? What should you do?
- King safety, dude. You can still castle. Now, or is there a bigger move?
- Uncastled king this late is a liability. Tuck it away now?
- He's building toward your king. Castle before the position cracks open — agree?
- Development's fine, but the king's exposed. What's the responsible move?
- You've delayed castling. Sometimes fine — but is it fine HERE? Judge it.
- Open lines toward an uncastled king spell trouble. What do you play?
- Before you attack, is your OWN house in order? King home, move {fullmove}.
- Prophylaxis time — sort your king safety before he forces it. Castle?
- That king in the center makes me nervous. What removes the risk?

**Reveals:**
- Yeah — {best}. Get the king safe and connect the rooks. You can't attack on a burning deck.
- Right, {best}. Castled kings win more games than clever ones.
- {best}. King tucked away, rook joins the game. Textbook.
- Exactly — {best}. King safety is never wasted when the center's tense.
- Good. {best}. He hoped you'd delay; you didn't. Solid.
- {best}. Rooks connected, king safe — now you can be ambitious.
- Yep — {best}. Castle first, questions later, when lines are opening.

### opening deviation

**Asks:**
- Early days — move {fullmove}. Develop, control the center, castle. Which are you neglecting?
- Which of your pieces is worst-developed right now? Fix that one.
- Are you moving a piece twice while others sit home? Be honest.
- Center, development, king safety — rank them for THIS position. Move one?
- Don't chase pawns — get your pieces out. What develops with tempo?
- Which minor piece hasn't moved yet? That's your clue.
- Don't bring the queen out early — she'll get chased. Calmer developing move?
- Knights before bishops, castle by move eight — how's the scorecard?
- Every opening move should do a job. What does your candidate accomplish?
- Fight for the center. Which move stakes a claim on the middle?
- Tempo matters early. A developing move that also makes a threat?
- Opening discipline: skip the pawn grab if it costs development. What's principled?

**Reveals:**
- Yeah — {best}. Develops a piece and fights for the center. Activity beats greed in the opening.
- Right, {best}. Every piece off the back rank is a step toward a real game.
- {best}. Develop, castle, THEN attack — right order.
- Exactly — {best}. Brings a piece in with purpose. Opening theory in one move.
- Good. {best}. You resisted the flashy grab and developed. Maturity.
- {best}. Minor pieces out, king getting safe — the position's healthy.
- Yep — {best}. Principled play. Boring wins games.

### endgame technique moment

**Asks:**
- Endgame now — every tempo counts. Push the passer, activate the king, or improve the rook?
- Few pieces left. Your king's a fighter here. Where does it belong?
- This is technique. Do you have the opposition? Should you take it?
- Passed pawns must be pushed — or blockaded. Which side are you on?
- Endgames reward activity. Your most passive piece — how do you fix it?
- King-and-pawn stuff is precise. Count the tempi. What's the winning square?
- Simplify when ahead, complicate when behind — what does your material count say?
- The rook belongs behind the passed pawn. Where's your rook going?
- Don't rush. Improve your worst piece first. Which is it?
- Opposition, zugzwang, triangulation — one decides this. Which?
- Activate the king — strongest piece with queens off. Which way?
- Precise now. One loose move and the result flips. What's accurate?

**Reveals:**
- Yeah — {best}. Endgames are precision, not power. A small improvement, and small things decide endgames.
- Right, {best}. Activate, push, convert. Patient work.
- {best}. King in front of the pawn, rook behind — technique on display.
- Exactly — {best}. Small edges converted carefully. That's mastery.
- Good. {best}. No rush, no risk, steady improvement. That's how you win won games.
- {best}. You grabbed the opposition — zugzwang does the rest.
- Yep — {best}. The endgame's a math problem; you just solved a line.

### player found brilliancy

**Asks:**
- OH. Did you calculate that line, or feel it? Either way the tactic lands.
- Wait — that is a strong move. Do you know which weakness it exploits?
- Tell me the point of that move — which piece does it improve?
- That is a coach's move. Which tactic did you spot there?
- Before I gush — do you see the follow-up threat that makes it work?
- Calculation or intuition? Either way that move wins material.
- That is the engine's top pick. Which candidate moves did you compare?
- Ohhh, nasty. Do you see the threat you just created?

**Reveals:**
- That's the move the computer wants — {best}-level stuff. You're seeing the board like a player now. Hold onto that.
- Exactly why it's strong. Moves like that win games quietly. Remember the pattern.
- Yeah — brilliant. A threat AND a better piece, one move. Two jobs at once.
- That is mastery — you did not just react, you improved your worst piece.
- Top move. When you find these, calculate the follow-up tactic before you commit.
- Not guessing anymore — you saw the threat before it landed. That is prophylaxis.

## Routine reactions (fires on ordinary moves)
_`ROUTINE` — 50 lines_

- {opp_san} is standard here. Development continues.
- Recapture on {opp_to} is forced — nothing else holds.
- His {opp_piece} takes {opp_to}. Noted.
- {opp_san} — a book move in this structure.
- That develops toward the centre. Fine.
- His {opp_piece} on {opp_to} is doing little yet.
- Quiet move. Your worst piece still needs a square.
- {opp_san} keeps the tension without committing.
- No threat yet. {opp_to} is covered.
- He is improving a piece, not attacking.
- That trade simplifies toward the endgame.
- {opp_san} concedes the tempo. Use it.
- Structure unchanged. Keep improving pieces.
- His {opp_piece} guards {opp_to} now.
- Nothing forcing. Your plan continues.
- {opp_san} is a waiting move. Do not rush.
- He blocked the file with {opp_san}.
- That pawn move fixes his structure on {opp_to}.
- His king's cover is intact after {opp_san}.
- {opp_san} — the knight heads for a better square.
- That guards the back rank. Sensible.
- He took the open file with {opp_san}.
- {opp_san} prepares to castle. Expect it next.
- His {opp_piece} eyes {opp_to} but nothing lands.
- Even material, even chances. Keep going.
- {opp_san} is the theory move in this line.
- That defends the pawn a second time.
- No tactic available. Improve a piece.
- He connected his rooks with {opp_san}.
- {opp_san} — solid, no weaknesses created.
- Your structure is fine. Watch {opp_to}.
- He gained space with {opp_san}.
- That knight retreat gives up the outpost.
- {opp_san} unpins the piece. Tension gone.
- He is playing prophylaxis with {opp_san}.
- That bishop is bad behind his own pawns.
- {opp_san} keeps the position closed.
- Nothing hanging on either side right now.
- His passer is restrained for now.
- {opp_san} — the rook takes the seventh next.
- That pawn push creates a hole on {opp_to}.
- He is trading to reach the endgame.
- Tempo move. Your initiative survives.
- {opp_san} threatens nothing immediate.
- The centre stays locked after {opp_san}.
- His queen is safe on {opp_to} for now.
- That covers the entry square. Careful.
- {opp_san} is a repetition attempt.
- The half-open file is still yours.
- He is defending accurately here.

## Notable — one short question
_`NOTABLE` — 24 lines_

- His {opp_piece} on {opp_to} eyes your kingside — see the plan?
- {opp_san} opens a file. Whose rook gets there first?
- Your {piece} on {sq} has no retreat square. Does that worry you?
- He just took the outpost on {opp_to}. Can you challenge it?
- That pawn push left a hole. Which piece occupies it?
- His {opp_piece} is overloaded — it guards two things. Exploit it?
- You still have not castled. Is the centre safe enough?
- {opp_san} prepares a pawn break. Do you stop it or allow it?
- Your bishop is behind its own pawns. Trade it or free it?
- He controls the open file. Contest it or find another plan?
- His king has no luft. Is a back-rank idea available?
- That trade would leave you a bad bishop. Take it anyway?
- He is building toward a minority attack. Prophylaxis or counterplay?
- Your knight on {sq} has no advanced square. Reroute it?
- {opp_san} gains space. Do you strike at the centre now?
- His passer needs restraining. Blockade or attack it?
- You can win a tempo on his queen. Worth it?
- That pin is uncomfortable. Break it now or later?
- The seventh rank is available to a rook. Whose?
- His weak colour complex is showing. Target it?
- You have doubled pawns but a half-open file. Fair trade?
- He offers a repetition. Accept or play on?
- Your rook is passive on {sq}. Activate it?
- The endgame favours your structure. Trade down?

## Game memory — refers back to earlier moves
_`MEMORY_LINES` — 12 lines_

- Remember pushing that pawn on move {mem_move}? His {opp_piece} just used the hole it left.
- Your king has sat on its home square since move {mem_move}. The centre is opening now.
- You retreated a piece on move {mem_move} — it is still passive on {mem_sq}.
- That pawn move on move {mem_move} weakened {mem_sq}. He is aiming at it now.
- You had a tactic on move {mem_move} and passed it. The same idea is back.
- Since move {mem_move} your rook has not moved. Time to activate it.
- The structure you chose on move {mem_move} wanted a minority attack. Still does.
- You traded your good bishop on move {mem_move}. That colour complex is weak now.
- His knight has been eyeing {mem_sq} since move {mem_move}.
- You spent tempo on move {mem_move} chasing his queen. He used it to develop.
- That hole on {mem_sq} from move {mem_move} is now his outpost.
- You have not made luft since move {mem_move}. The back rank matters here.

## Socratic nudges
_`SOCRATIC` — 12 lines_

- What is his last move threatening?
- Which of your pieces is worst placed right now?
- Any checks, captures or threats for you?
- If you pass, what does he play next?
- Which of your pieces is currently loose?
- Which file or diagonal just opened?
- Can you improve a piece without losing tempo?
- Is your king safe enough to start an attack?
- What square did his last move give up?
- Where is the weakest square in his camp?
- Trade, push or wait — which does the structure want?
- Which of his pieces is overloaded?

## Opening interjections
_`VOICE_OPEN` — 16 lines_

- Wait — count the attackers on that square first.
- Hold on. Look at what his last move touched.
- Stop. Every piece of yours needs a job here.
- Eyes up — his last move carries a threat.
- Before you move, scan the checks and captures.
- Pause. Something on the board just changed.
- Look again at the square he just left.
- One second — check what he uncovered.
- Careful here. The tension just went up.
- Hm. His last move had a point.
- Slow down — this is a calculating position.
- Notice which line just opened.
- Check the diagonals before you commit.
- Look at your loose pieces first.
- Hold up — count material before you decide.
- There it is. His plan just showed itself.

## Praise
_`VOICE_GOOD` — 16 lines_

- That is the engine's top choice.
- Correct — that keeps your initiative.
- That move wins material cleanly.
- Strong. You improved your worst piece.
- That is the move a titled player finds.
- Exactly right — tempo gained.
- That defends and threatens at once.
- Sharp calculation. That refutes his idea.
- You found the only move that holds.
- That is prophylaxis — you stopped his plan.
- Precise. The structure stays healthy.
- That seizes the outpost.
- You saw the zwischenzug. Well done.
- That trade favours your endgame.
- Textbook technique in this structure.
- That is the move the position demanded.

## Correction
_`VOICE_BAD` — 16 lines_

- That drops material on that square.
- That move loses a tempo you needed.
- That walks into his tactic.
- That leaves the piece loose — LPDO.
- That weakens the square in front of your king.
- That gives up the initiative for nothing.
- That move blocks your own bishop's diagonal.
- That allows the fork you were avoiding.
- That concedes the outpost permanently.
- That trade helps his structure, not yours.
- That ignores the threat he just made.
- That puts the piece on its worst square.
- That creates a hole he will occupy.
- That loses the exchange after his recapture.
- That leaves the back rank undefended.
- That hands him a free developing move.

## Tactical alerts
_`VOICE_TACTIC` — 16 lines_

- There is a shot here — run the captures.
- Something of his is loose. Find it.
- Fork, pin or skewer is live in this position.
- Loose pieces drop off — LPDO. Look.
- Count every check before you move.
- There is material to win here. Calculate.
- A forcing sequence exists. Find the first move.
- His king's cover has a gap. Exploit it.
- This is a calculating position, not an intuition one.
- One of his pieces is overloaded. Use it.
- There is a desperado resource here.
- A zwischenzug wins more than the recapture.
- His back rank is weak. Check it.
- Two of his pieces share a line. Skewer them.
- The pinned piece cannot defend. Pile on.
- A discovered attack is available. Spot it.

## Positional
_`VOICE_POS` — 16 lines_

- This is a manoeuvring position — improve your worst piece.
- Nobody is winning material. Fix your structure.
- The outpost is the prize in this position.
- Trade your bad bishop, keep the good one.
- Whoever takes the open file first stands better.
- Space advantage means you avoid trades.
- His weak colour complex is the long-term target.
- A minority attack fits this pawn structure.
- Prophylaxis first — stop his plan, then start yours.
- Rooks belong on the open file here.
- Your knight needs a safe advanced square.
- Fix his pawn on its colour, then attack it.
- Make luft before the back rank matters.
- Improve your king's position while it is quiet.
- Doubled pawns give you the half-open file.
- Restrain his passer before you push yours.

## Critical
_`VOICE_CRIT` — 16 lines_

- This is the critical moment of the game.
- The evaluation swings on this single move.
- Take your time — this move decides the plan.
- Precision required. Calculate two moves deep.
- This is a fork in the road for your position.
- Get this right and the initiative is yours.
- Both plans are playable. Pick the one your structure supports.
- This move commits you. Choose carefully.
- One inaccuracy here and the advantage flips.
- The whole middlegame plan starts with this move.
- This is where the game is won or lost.
- No autopilot — the position is sharp.
- Candidate moves first, then calculate.
- Remember this position. It repeats.
- The tempo you spend here matters later.
- Lock in. This move carries the game.

## Threat alerts
_`VOICE_THREAT` — 10 lines_

- His last move created a real threat.
- That move was not random — it attacks something.
- He is threatening to win material next move.
- Do not ignore his last move — it has teeth.
- He is coming for one of your pieces.
- You are being threatened. Defend or counter-attack.
- His piece just gained a dangerous square.
- That move sets a trap. Spot it.
- He has an idea. Work out what it is.
- He threatens to break through on that square.

---
_**389 hand-written lines**, plus unlimited generated lines naming your real moves, opening and weaknesses._
