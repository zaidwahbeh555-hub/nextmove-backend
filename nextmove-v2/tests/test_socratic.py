"""The single rule that matters: GM Forge must never hand over the move."""
import sys, importlib.util, re
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

print("\nrhythm: routine moments are silent")
sil = m.engagement_for("some_quiet_thing") == "silent"
crit = m.engagement_for("player_about_to_blunder") == "critical"
print("  [%s] routine -> silent" % ("PASS" if sil else "FAIL"))
print("  [%s] blunder -> critical (still speaks)" % ("PASS" if crit else "FAIL"))
p += (sil + crit); f += (2 - sil - crit)
print("\n%d passed, %d failed" % (p, f))
sys.exit(0 if f == 0 else 1)
