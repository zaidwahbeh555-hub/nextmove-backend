#!/usr/bin/env python3
"""Free accounts get exactly what Free includes, and no more.

This exists because a limit was shipped that did not hold: /my-puzzles capped
the LIST it returned, but the client keeps the puzzles it has already been
given, so re-solving the same five was unlimited and a free account did thirty
in a sitting. Counting the list is not the same as counting the doing.

Every quota below is asserted against the real counters, and asserted again to
lift when the plan flips. Run from nextmove-v2/:  python3 tests/test_limits.py
"""
import os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
os.environ.setdefault("SECRET_KEY", "t")

import app as m  # noqa: E402

fails, checks = [], 0


def ok(cond, msg):
    global checks
    checks += 1
    if not cond:
        fails.append(msg)


def fresh(plan="free"):
    """A user record with nothing used today."""
    return {"plan": plan, "xp": 0, "usage": {}}


# ── the advertised limits are the enforced ones ──────────────────────────────
ok(m.FREE_COACHED_GAMES == 1, "free should get 1 coached game/day, got %s" % m.FREE_COACHED_GAMES)
ok(m.FREE_PUZZLES == 5, "free should get 5 puzzles/day, got %s" % m.FREE_PUZZLES)
ok(m.FREE_LESSON_DRILLS == 1, "free should get 1 exercise per theme, got %s" % m.FREE_LESSON_DRILLS)

# What /plan/features advertises must match those constants, or the wall lies.
rows = {r["key"]: r for r in [
    {"key": "coached", "free": "1 per day"},
    {"key": "puzzles", "free": "5 per day"},
    {"key": "lesson",  "free": "1 per day"},
]}
ok("1 per day" == rows["coached"]["free"] and m.FREE_COACHED_GAMES == 1,
   "coached copy and constant disagree")
ok("5 per day" == rows["puzzles"]["free"] and m.FREE_PUZZLES == 5,
   "puzzle copy and constant disagree")

# ── counters actually count ──────────────────────────────────────────────────
u = fresh()
ok(m.usage(u, "puzzles") == 0, "a new day starts at zero")
for i in range(m.FREE_PUZZLES):
    m.bump_usage(u, "puzzles")
ok(m.usage(u, "puzzles") == m.FREE_PUZZLES,
   "after %d claims usage should be %d, got %d" % (m.FREE_PUZZLES, m.FREE_PUZZLES,
                                                   m.usage(u, "puzzles")))
ok(m.quota_left(u, "puzzles", m.FREE_PUZZLES) == 0, "free should have nothing left")
ok(m.quota_blocked(u, "puzzles", m.FREE_PUZZLES, "puzzle") is not None,
   "free must be blocked once the allowance is spent")

# one more claim must not go through
before = m.usage(u, "puzzles")
if m.quota_blocked(u, "puzzles", m.FREE_PUZZLES, "puzzle") is None:
    m.bump_usage(u, "puzzles")
ok(m.usage(u, "puzzles") == before, "a blocked claim must not increment the counter")

# ── the same account on Grandmaster is unlimited ─────────────────────────────
u["plan"] = "pro"
ok(m.quota_blocked(u, "puzzles", m.FREE_PUZZLES, "puzzle") is None,
   "Grandmaster must never be blocked, even with the counter maxed")
ok(m.quota_left(u, "puzzles", m.FREE_PUZZLES) is None,
   "Grandmaster quota_left should read unlimited (None)")

# ── coached games ────────────────────────────────────────────────────────────
c = fresh()
m.bump_usage(c, "coached")
ok(m.quota_blocked(c, "coached", m.FREE_COACHED_GAMES, "coached game") is not None,
   "the second coached game of the day must be refused")

# ── a new day resets everything ──────────────────────────────────────────────
d = fresh()
for _ in range(m.FREE_PUZZLES):
    m.bump_usage(d, "puzzles")
d["usage"]["day"] = "1999-01-01"          # pretend that was yesterday
ok(m.usage(d, "puzzles") == 0, "yesterday's usage must not count against today")
ok(m.quota_blocked(d, "puzzles", m.FREE_PUZZLES, "puzzle") is None,
   "a new day must restore the allowance")

# ── per-theme drills are counted separately ──────────────────────────────────
t = fresh()
m.bump_usage(t, "drill:Hanging piece")
ok(m.usage(t, "drill:Hanging piece") == 1, "the drilled theme is counted")
ok(m.usage(t, "drill:Missed tactic") == 0,
   "a different theme must have its own allowance, not share one")

# ── is_pro / is_paying are not the same thing ────────────────────────────────
comped = {"plan": "pro", "billing": "comp"}
paid   = {"plan": "pro", "billing": "stripe"}
ok(m.is_pro(comped) and m.is_pro(paid), "both comped and paid accounts get the features")
ok(not m.is_paying(comped), "a comped account must never count as revenue")
ok(m.is_paying(paid), "a Stripe account must count as revenue")

# ── the endpoints that must refuse free accounts exist and check the plan ────
src = open(os.path.join(ROOT, "app.py")).read()
for route, needle in [
    ("/puzzles/claim",    'usage(user, "puzzles")'),
    ("/coach/begin",      'quota_blocked(user, "coached"'),
    ("/generate-puzzles", 'if not is_pro(user):'),
    ("/ask-forge",        'if not is_pro(user):'),
    ("/shop/buy",         'if not is_pro(user):'),
]:
    i = src.find('@app.route("%s"' % route)
    ok(i >= 0, "route %s is missing" % route)
    if i >= 0:
        body = src[i:i + 2200]
        ok(needle in body, "%s does not check the plan (%s)" % (route, needle))

print("limits: %d checks, %d failed" % (checks, len(fails)))
for f in fails:
    print("  FAIL", f)
sys.exit(1 if fails else 0)
