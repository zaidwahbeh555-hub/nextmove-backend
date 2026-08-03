"""The single rule that matters: GM Forge must never hand over the move."""
import sys, importlib.util, re
import chess
spec = importlib.util.spec_from_file_location("app", "app.py")
m = importlib.util.module_from_spec(spec)
sys.modules["app"] = m
spec.loader.exec_module(m)

BAD = [
    ("The best move is Re1.",                 "Re1"),
    ("You should play Nf3 here.",             "Nf3"),
    ("Play Qd2 and you're fine.",             "Qd2"),
    ("The engine prefers Bxf7+.",             "Bxf7+"),
    ("Instead, play h3.",                     "h3"),
    ("Re1 wins on the spot.",                 "Re1"),
    ("The correct move was O-O.",             "O-O"),
]
OK = [
    ("What is your opponent threatening?",     "Re1"),
    ("Is everything of yours still defended?", "Nf3"),
    ("Which piece is doing the least work?",   "Qd2"),
]
ctx = {"sq": "e4", "piece": "knight"}
p=f=0
print("must be rewritten (answer would leak):")
for text, best in BAD:
    out = m.socratic_guard(text, best, ctx, "threat")
    leaked = m._names_move(out, best)
    ok = (out != text) and not leaked
    p, f = (p+1, f) if ok else (p, f+1)
    print("  [%s] %-34s -> %s" % ("PASS" if ok else "FAIL", text, out))
print("\nmust be left alone (already Socratic):")
for text, best in OK:
    out = m.socratic_guard(text, best, ctx, "threat")
    ok = out == text
    p, f = (p+1, f) if ok else (p, f+1)
    print("  [%s] %s" % ("PASS" if ok else "FAIL", text))

print("\nno rewritten output ever names a move:")
leaks = 0
for text, best in BAD:
    for _ in range(40):
        if m._names_move(m.socratic_guard(text, best, ctx, "threat"), best):
            leaks += 1
print("  [%s] 280 rewrites, %d leaks" % ("PASS" if leaks == 0 else "FAIL", leaks))
p, f = (p+1, f) if leaks == 0 else (p, f+1)

print("\ntrivial opening observations are cut, real ones survive:")
# "Your rook is the worst piece on the board" is true on move 2 and teaches
# nothing -- of course it is, nobody has developed yet. line_is_concrete lets it
# through because it names a piece and uses real vocabulary, so triviality needs
# its own gate. The same sentence at move 20 is a genuine positional point.
TRIVIA = [
    ("Your rook on a1 is the worst piece on the board.",              3,  False),
    ("Your knight on b1 is undeveloped.",                             4,  False),
    ("Your bishop has not moved yet.",                                2,  False),
    ("Develop a piece.",                                              4,  False),
    ("That rook is passive.",                                         6,  False),
    # the same observations, once there is a position to observe
    ("Your rook on a1 is the worst piece on the board.",             40,  True),
    ("Your rook on d1 is passive behind its own pawn.",              30,  True),
    # real content is never cut, however early it happens
    ("His knight on e5 forks your bishop on d3 and your knight on f3.", 6, True),
    ("That leaves your bishop on c4 hanging.",                        5,  True),
    ("He is threatening mate on f7.",                                 4,  True),
]
for text, ply, want in TRIVIA:
    got = m.line_is_worth_saying(text, ply)
    ok = (got == want)
    p, f = (p+1, f) if ok else (p, f+1)
    print("  [%s] ply %-3d %-4s %s" % ("PASS" if ok else "FAIL", ply,
                                       "keep" if want else "cut", text))

# ply must be readable off a board rebuilt from a FEN -- move_stack is empty there
b = chess.Board()
ok = m.ply_from_board(b) == 0
b.push_san("e4"); ok = ok and m.ply_from_board(b) == 1
b.push_san("e5"); ok = ok and m.ply_from_board(b) == 2
ok = ok and m.ply_from_board(chess.Board(b.fen())) == 2      # survives the round trip
p, f = (p+1, f) if ok else (p, f+1)
print("  [%s] ply survives a FEN round trip" % ("PASS" if ok else "FAIL"))

print("\nrhythm: he speaks on every move, and a blunder still stops the game")
# He used to roll a die and speak on 12-22% of routine moves, which is why it
# felt inconsistent. Frequency is now guaranteed; quality is what the gates
# above are for.
crit = m.engagement_for("player_about_to_blunder") == "critical"
note = m.engagement_for("opponent_threat_single_piece") == "notable"
print("  [%s] blunder -> critical (stops the game)" % ("PASS" if crit else "FAIL"))
print("  [%s] a threat -> notable (asks, does not block)" % ("PASS" if note else "FAIL"))
p += (crit + note); f += (2 - crit - note)

# The dice and the cooldown must be gone from the source, not just unused.
src = open("app.py").read()
no_dice = "speak_odds" not in src
no_cool = "if ply - last < 4" not in src
print("  [%s] no random speak_odds left" % ("PASS" if no_dice else "FAIL"))
print("  [%s] no four-ply cooldown left" % ("PASS" if no_cool else "FAIL"))
p += (no_dice + no_cool); f += (2 - no_dice - no_cool)
print("\n%d passed, %d failed" % (p, f))
sys.exit(0 if f == 0 else 1)
